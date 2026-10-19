/**
 * The proof registry's guard. `AGENTS.md` delegates "which proof covers what" to `docs/proofs/README.md`, which
 * `tools/proof-registry/generate.mjs` renders from `registry.mjs` — so the registry is the suite's one machine-readable
 * index, and an agent's verification plan reads it instead of forty script headers. A registry that drifts from the
 * tree is worse than none: a missing record hides a proof from every plan, a neighbour that does not resolve silently
 * unplans the second script a shared seam needs, and a flag that names nothing sends the runner into a usage error.
 *
 * The tests hold the registry to the tree: every `*-proof.mjs` script and `live-run`, `ui-audit` and `ui-review` has
 * exactly one record and every record names a script that is there; every id is the pnpm script that runs it and every
 * record document opens with its id and names its own script; neighbours resolve, never name the entry itself, and the
 * relation is symmetric; and areas, platforms, clauses, requirements and flags are well-formed, a recorded flag's token
 * occurring in the script it belongs to and every flag that script reads from its own argv being recorded
 * (`flags.mjs`), so a flag cannot hide in the script or dangle in the column. The generated index's freshness is
 * `pnpm lint`'s check (`node tools/proof-registry/generate.mjs --check`), not these tests'.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// @ts-expect-error - the tools directory is plain ESM, run by node without a build step.
import { flagsRead } from './flags.mjs';
// @ts-expect-error - the tools directory is plain ESM, run by node without a build step.
import { firstDifferingLine } from './generate.mjs';

// @ts-expect-error - the tools directory is plain ESM, run by node without a build step.
import { AREAS, HOSTS, PROOFS, recordPath, scriptPath } from './registry.mjs';

const repo = join(import.meta.dirname, '..', '..');
const scriptsDir = join(repo, 'apps', 'desktop', 'scripts');
const packageScripts = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8')).scripts as Record<string, string>;

const ids: string[] = PROOFS.map((proof: { id: string }) => proof.id);
const expectedIds = [
  ...readdirSync(scriptsDir)
    .filter((name) => name.endsWith('-proof.mjs'))
    .map((name) => name.slice(0, -'.mjs'.length)),
  'live-run',
  'ui-audit',
  'ui-review',
].sort();
const byId = new Map<string, { neighbours: string[] }>(PROOFS.map((proof: { id: string }) => [proof.id, proof]));

describe('the proof registry covers the suite and holds its own shape', () => {
  it('records every proof script exactly once, and neither hides one nor names a script that is not there', () => {
    expect([...ids].sort()).toEqual(expectedIds);
    expect(new Set(ids).size, 'an id is recorded twice').toBe(ids.length);
  });

  it('names the pnpm script that runs each entry, and the script is there', () => {
    for (const id of ids) {
      expect(packageScripts[id], id).toBe(`node ${scriptPath(id)}`);
      expect(existsSync(join(repo, scriptPath(id))), scriptPath(id)).toBe(true);
    }
  });

  it('keeps a record document for each entry, opening with the entry’s id and naming its own script', () => {
    for (const id of ids) {
      const path = join(repo, recordPath(id));
      expect(existsSync(path), recordPath(id)).toBe(true);
      const text = readFileSync(path, 'utf8');
      expect(text.split('\n')[0], recordPath(id)).toBe(`# \`${id}\``);
      expect(text, `${recordPath(id)} does not link ${scriptPath(id)}`).toContain(scriptPath(id));
    }
  });

  it('has no record document without an entry', () => {
    const records = readdirSync(join(repo, 'docs', 'proofs'))
      .filter((name) => name.endsWith('.md') && name !== 'README.md')
      .map((name) => name.slice(0, -'.md'.length));
    expect([...records].sort(), 'a record under docs/proofs/ names no entry').toEqual([...ids].sort());
  });

  it('resolves every neighbour, never the entry itself, and keeps the relation symmetric', () => {
    for (const proof of PROOFS) {
      expect(proof.neighbours.length, `${proof.id} has no neighbour`).toBeGreaterThan(0);
      for (const neighbour of proof.neighbours) {
        expect(neighbour, `${proof.id} names itself`).not.toBe(proof.id);
        const other = byId.get(neighbour);
        expect(other, `${proof.id} names ${neighbour}, which is not an entry`).toBeDefined();
        expect(other?.neighbours, `${neighbour} must name ${proof.id} back`).toContain(proof.id);
      }
    }
  });

  it('keeps areas, summaries, platforms, clauses, requirements and flags well-formed', () => {
    for (const proof of PROOFS) {
      expect(AREAS, proof.id).toContain(proof.area);
      expect(proof.summary.trim(), proof.id).not.toBe('');
      expect(proof.summary, proof.id).not.toMatch(/[\n|]/);
      expect(proof.platforms.length, proof.id).toBeGreaterThan(0);
      expect(new Set(proof.platforms).size, proof.id).toBe(proof.platforms.length);
      for (const host of proof.platforms) expect(HOSTS, proof.id).toContain(host);
      for (const note of proof.platformNotes) {
        expect(note.trim(), proof.id).not.toBe('');
        expect(note, proof.id).not.toMatch(/[\n|]/);
      }
      for (const requirement of proof.requires) expect(requirement.trim(), proof.id).not.toBe('');
      const script = readFileSync(join(repo, scriptPath(proof.id)), 'utf8');
      const read = flagsRead(script);
      for (const flag of proof.flags) {
        expect(flag.startsWith('--'), `${proof.id} records ${flag}`).toBe(true);
        const token = flag.split('=')[0] as string;
        expect(
          read.includes(token) || script.includes(token),
          `${proof.id} records ${flag}, which its script never reads`,
        ).toBe(true);
      }
      for (const token of read) {
        expect(
          proof.flags.map((flag: string) => flag.split('=')[0]),
          `${proof.id} reads ${token}, which the registry does not record`,
        ).toContain(token);
      }
    }
  });

  it('reads a script’s flags from its own argv alone, and not from a comment, a string or a child’s cmdline', () => {
    // The pin: live-run reads its flags through `has`/`value`, and this must keep seeing them, or the reverse check
    // above passes vacuously (the shape `git-proof-index` once broke with). A helper that stopped being recognised
    // would drop every flag it reads.
    const liveRun = readFileSync(join(repo, scriptPath('live-run')), 'utf8');
    expect(flagsRead(liveRun)).toEqual(
      expect.arrayContaining([
        '--confirm', '--help', '--endpoint', '--model', '--no-discover-model', '--base-url', '--budget', '--max-tokens',
        '--max-iterations', '--keep-runs', '--session-log-level', '--app-log-level', '--no-record-traffic', '--only',
        '--duress-fixture', '--gui', '--keep', '--skip-build', '--add-endpoint', '--endpoints', '--set-default',
        '--set-key', '--forget-key', '--remove-endpoint', '--name', '--label', '--context', '--in-price', '--out-price',
        '--unmetered', '--default',
      ]),
    );
    // A comment is not a read, and neither is another process's command line.
    expect(flagsRead("// argv.includes('--commented')\n")).toEqual([]);
    expect(flagsRead("if (cmdline.includes('--type=utility')) return null;\n")).toEqual([]);
    expect(flagsRead("if (launch.argv.includes('--call-file')) return 1;\n")).toEqual([]);
    // A helper that passes the dashes at its call site is read too.
    expect(flagsRead("const arg = (name) => process.argv.find((v) => v.startsWith(`${name}=`));\nconst a = arg('--theme');\n")).toEqual(['--theme']);
    // A helper that builds the dashes from its parameter is read at every call with a literal.
    expect(flagsRead("const value = (name, fallback) => argv.find((a) => a.startsWith(`--${name}=`)) ?? fallback;\nconst budget = value('budget', '1.00');\n")).toEqual(['--budget']);
  });

  it('reports the first line that differs between the index on disk and the render, or 0 when they agree', () => {
    expect(firstDifferingLine('a\nb\n', 'a\nb\n')).toBe(0);
    expect(firstDifferingLine('a\nb\n', 'a\nc\n')).toBe(2);
    expect(firstDifferingLine('a\n', 'a\nb\n')).toBe(2);
    expect(firstDifferingLine('a\nb\n', 'a\nb')).toBe(3);
  });

  it('uses every area, so an area heading never renders empty', () => {
    for (const area of AREAS) {
      expect(
        PROOFS.some((proof: { area: string }) => proof.area === area),
        area,
      ).toBe(true);
    }
  });
});
