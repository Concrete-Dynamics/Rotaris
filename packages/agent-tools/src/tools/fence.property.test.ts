/**
 * Property tests over the workspace fence (REQ-TOOLS-129, REQ-TOOLS-130; R-091, hardening.md §3.5 row 7).
 * `tools.test.ts` holds the worked examples; this file holds what must be true of every relative path.
 *
 * The reference oracle is lexical and independent of `fence.ts`: a resolved path is inside the root when it IS the root
 * or starts with the root and one separator, compared under the platform's case rule — folded where the default file
 * system folds (NTFS, APFS), exact elsewhere.
 *
 * Seeded: each property runs `numRuns: 500` from `SEED`, so a run is the same 500 cases every time. A failure prints
 * the counterexample with its seed and path; `fc.assert(…, { seed, path })` with the printed values replays it alone.
 *
 * Held out where the file system does not fold: a path that leaves the root and comes back through a case variant of a
 * name on its way (`../WS/x` beside `ws`). The fence folds case on every platform, so it reads that path as inside; the
 * finding is hardening.md §3.4 row 5, which bundle D3 closes, and its repair removes `caseOnlyDifference` here.
 */
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve, sep } from 'node:path';
import fc from 'fast-check';
import { afterAll, describe, expect, it } from 'vitest';
import { checkFence, isInside, type FenceConfig } from './fence.js';

const SEED = 20261103;
const RUNS = { seed: SEED, numRuns: 500 } as const;

/** The platform's case rule for the oracle: the default file systems of Windows and macOS fold case; Linux's do not. */
const FOLDS = process.platform === 'win32' || process.platform === 'darwin';

/** The oracle: the candidate is the root, or lies under it past one separator. */
function oracleInside(root: string, candidate: string, folds = FOLDS): boolean {
  const f = (p: string): string => (folds ? p.toLowerCase() : p);
  const r = f(root.endsWith(sep) ? root.slice(0, -1) : root);
  const c = f(candidate);
  return c === r || c.startsWith(`${r}${sep}`);
}

/** Inside only by a fold the platform's file system does not make: held out where it does not fold (header). */
function caseOnlyDifference(root: string, candidate: string): boolean {
  return !FOLDS && oracleInside(root, candidate, true) && !oracleInside(root, candidate, false);
}

function anyCase(word: string): fc.Arbitrary<string> {
  return fc
    .array(fc.boolean(), { minLength: word.length, maxLength: word.length })
    .map((upper) => Array.from(word, (ch, i) => (upper[i] ? ch.toUpperCase() : ch)).join(''));
}

/** A segment may hold anything but a separator, a NUL or a drive colon (which `resolve` reads as a drive on win32). */
const plainName = (name: string): boolean => name !== '' && name !== '.' && name !== '..' && !/[\\/:\0]/.test(name);

/** The separators a relative path is written with here: `/` everywhere, `\` too on win32, and a doubled one. */
const separator = fc.constantFrom(...(process.platform === 'win32' ? ['/', '\\', '//', '\\/'] : ['/', '//']));

/**
 * One segment: `..` and `.`, ASCII names in any case, Unicode names, long names (to 255), and the root's own name — in
 * any case, and with a suffix that shares its prefix (`ws2` beside `ws`), the trap a bare `startsWith` falls into.
 */
function segment(rootName: string): fc.Arbitrary<string> {
  return fc.oneof(
    { weight: 3, arbitrary: fc.constantFrom('..', '.') },
    { weight: 2, arbitrary: fc.stringMatching(/^[A-Za-z0-9_-]{1,12}$/) },
    { weight: 1, arbitrary: fc.string({ unit: 'grapheme', minLength: 1, maxLength: 8 }).filter(plainName) },
    { weight: 1, arbitrary: fc.integer({ min: 100, max: 255 }).map((n) => 'n'.repeat(n)) },
    { weight: 2, arbitrary: anyCase(rootName) },
    { weight: 1, arbitrary: fc.tuple(anyCase(rootName), fc.stringMatching(/^[A-Za-z0-9 ._-]{1,4}$/)).map(([name, tail]) => `${name}${tail}`) },
  );
}

/** A relative path from segments, joined by any separator the platform reads, with or without a trailing one. */
function relativePath(segments: fc.Arbitrary<string>): fc.Arbitrary<string> {
  return fc
    .tuple(fc.array(fc.tuple(segments, separator), { minLength: 1, maxLength: 8 }), fc.boolean())
    .map(([parts, trailing]) => {
      const text = parts.map(([name, joint]) => `${name}${joint}`).join('');
      return trailing ? text : text.slice(0, text.length - parts[parts.length - 1]![1].length);
    });
}

/**
 * A path that climbs out through `..` and does not come back: `k` steps up (at most the root's depth), then names
 * that are not, under any case, the one segment that would lead back down towards the root.
 */
function escapingPath(root: string): fc.Arbitrary<string> {
  const ancestors: string[] = [];
  for (let at = root; dirname(at) !== at; at = dirname(at)) ancestors.push(basename(at));
  return fc.integer({ min: 1, max: ancestors.length }).chain((up) =>
    fc
      .tuple(
        separator,
        fc.array(fc.stringMatching(/^[A-Za-z0-9_-]{1,12}$/), { maxLength: 4 }),
      )
      .filter(([, names]) => names.length === 0 || names[0]!.toLowerCase() !== ancestors[up - 1]!.toLowerCase())
      .map(([joint, names]) => [...Array<string>(up).fill('..'), ...names].join(joint)),
  );
}

describe('agent-tools — the fence, as properties (REQ-TOOLS-129, REQ-TOOLS-130)', () => {
  const lexicalRoot = resolve(tmpdir(), 'rotaris-fence-property', 'nested', 'ws');

  it('isInside agrees with the oracle for every relative path resolved against the root', () => {
    fc.assert(
      fc.property(relativePath(segment(basename(lexicalRoot))), (p) => {
        const candidate = resolve(lexicalRoot, p);
        fc.pre(!caseOnlyDifference(lexicalRoot, candidate));
        expect(isInside(lexicalRoot, candidate), candidate).toBe(oracleInside(lexicalRoot, candidate));
      }),
      RUNS,
    );
  });

  it('never reads a path that climbs out through `..` and stays out as inside', () => {
    fc.assert(
      fc.property(escapingPath(lexicalRoot), (p) => {
        const candidate = resolve(lexicalRoot, p);
        expect(oracleInside(lexicalRoot, candidate), candidate).toBe(false);
        expect(isInside(lexicalRoot, candidate), candidate).toBe(false);
      }),
      RUNS,
    );
  });

  describe('checkFence over a real root, the opt-out off', () => {
    const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'rotaris-fence-')));
    const cfg: FenceConfig = { workspaceRoot: root, allowOutsideWorkspace: false, additionalReadOnlyRoots: [] };
    afterAll(() => rmSync(root, { recursive: true, force: true }));

    // Win32 drops a name's trailing dots and spaces (`ws.` opens `ws`), which the fence follows through the real path
    // and a lexical oracle cannot; such names are left to the pure property above.
    const segments = segment(basename(root)).filter((name) => process.platform !== 'win32' || name === '.' || name === '..' || !/[. ]$/.test(name));

    it('admits a write exactly where the oracle says the path is inside, and refuses it everywhere else', () => {
      fc.assert(
        fc.property(relativePath(segments), (p) => {
          const candidate = resolve(root, p);
          fc.pre(!caseOnlyDifference(root, candidate));
          const verdict = checkFence(cfg, p, 'write');
          expect(verdict.ok, `${p} → ${verdict.resolved}`).toBe(oracleInside(root, candidate));
        }),
        RUNS,
      );
    });

    it('refuses every write that climbs out through `..` and stays out, naming the root in its message', () => {
      fc.assert(
        fc.property(escapingPath(root), (p) => {
          const verdict = checkFence(cfg, p, 'write');
          expect(verdict.ok, p).toBe(false);
          if (!verdict.ok) expect(verdict.message).toContain(`outside workspace root '${root}'`);
        }),
        RUNS,
      );
    });
  });

  it('the oracle folds exactly where it says it does', () => {
    expect(oracleInside(lexicalRoot, `${lexicalRoot}${sep}a`)).toBe(true);
    expect(oracleInside(lexicalRoot, `${lexicalRoot}2${sep}a`)).toBe(false);
    expect(oracleInside(lexicalRoot, `${lexicalRoot.toUpperCase()}${sep}a`)).toBe(FOLDS);
  });
});
