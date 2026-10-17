/**
 * IC-3 binds "any release artifact for Linux or macOS, and the store binding's acceptance on any platform"
 * (`docs/architecture/implementation-conditions.md`). A check owed to the next Windows package waits on a Windows x64 host
 * and on the release pipeline R-071 deferred, not on IC-3, yet the record tagged such checks "(IC-3)" as their reason
 * (`docs/defects/fixed/windows-packaging-checks-are-tagged-ic-3-which-binds-linux-and-macos.md`). The tags keep their words
 * and carry the correction beside them; this reads the record for an IC-3 written right after a Windows package, a packaged
 * branch or `win-unpacked` with no such correction, unless the sentence is about a Linux or macOS artifact, which IC-3
 * does bind. History that is not the record's current word (the views' reconciliation log, the fixed defect notes) is
 * not read.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..');

const markdownUnder = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? markdownUnder(join(dir, d.name)) : d.name.endsWith('.md') ? [join(dir, d.name)] : [],
  );

const files = [
  ...markdownUnder(join(root, 'docs', 'architecture')).filter((f) => !f.endsWith(join('views', 'reconciliation-log.md'))),
  join(root, 'docs', 'product', 'directives.md'),
  // The proof registry's records: `updater-proof`'s record tagged the check owed to the next Windows package "(IC-3)"
  // after both repairs, which read only the two above
  // (docs/defects/fixed/agents-md-still-tags-the-updaters-windows-package-check-ic-3.md); the row moved from AGENTS.md's
  // proof table into `docs/proofs/` with the registry (2026-10-18).
  ...markdownUnder(join(root, 'docs', 'proofs')),
];

const windowsPackaging = /Windows package|`pnpm package` on Windows|Windows `pnpm package`|packaged branch|win-unpacked|Windows build|Windows artifact|packaged Windows/;
const CORRECTION = 'a Windows x64 host';

/** Each IC-3 that tags a Windows packaging check without the correction beside it, as `file: …context`. */
function uncorrectedWindowsIc3(text: string, file: string): string[] {
  const found: string[] = [];
  for (const paragraph of text.split(/\n\s*\n/)) {
    const flat = paragraph.replace(/\n>?\s*/g, ' ');
    for (const m of flat.matchAll(/IC-3/g)) {
      const at = m.index ?? 0;
      const before = flat.slice(Math.max(0, at - 160), at);
      const after = flat.slice(at + 4, at + 164);
      if (/^\s*binds Linux/.test(after)) continue; // the correction's own words
      if (/macOS|Linux/.test(before.slice(-40))) continue; // tags a Linux or macOS artifact, which IC-3 binds
      if (/Linux artifact/.test(flat.slice(Math.max(0, at - 60), at + 64))) continue;
      if (windowsPackaging.test(before) && !after.includes(CORRECTION)) found.push(`${file}: …${before.slice(-90)}IC-3${after.slice(0, 20)}`);
    }
  }
  return found;
}

/**
 * The same shorthand on Windows checks that are not packaging checks ("anything on Windows (IC-3)", "Windows and macOS were
 * not run (IC-3)"): what such a check waits on is a Windows host, which this Linux container is not, and only a macOS half
 * beside it is IC-3's (`docs/defects/fixed/windows-checks-outside-packaging-still-name-ic-3-as-their-reason.md`). An IC-3
 * whose own clause (the text after the last `.`, `;` or `)` before it) names Windows must carry "a Windows host" right after
 * it. Passed: a tag in a clause that names only macOS or Linux, the correction's own words, "Windows only (IC-3)" (the
 * package step runs on Windows because IC-3 bars the others) and "the one release target IC-3 leaves".
 */
const HOST_CORRECTION = /a Windows (x64 )?host/;

function uncorrectedWindowsCheckIc3(text: string, file: string): string[] {
  const found: string[] = [];
  for (const paragraph of text.split(/\n\s*\n/)) {
    const flat = paragraph.replace(/\n>?\s*/g, ' ');
    for (const m of flat.matchAll(/IC-3/g)) {
      const at = m.index ?? 0;
      const before = flat.slice(Math.max(0, at - 160), at);
      const after = flat.slice(at + 4, at + 164);
      const clause = before.slice(Math.max(before.lastIndexOf('.'), before.lastIndexOf(';'), before.lastIndexOf(')')) + 1);
      if (!/Windows/.test(clause)) continue;
      if (/^\s*(binds Linux|leaves)/.test(after)) continue;
      if (/Windows only \($/.test(clause)) continue;
      if (!HOST_CORRECTION.test(after.slice(0, 120))) found.push(`${file}: …${clause.slice(-90)}IC-3${after.slice(0, 20)}`);
    }
  }
  return found;
}

describe('a Windows check outside packaging does not name IC-3 as its reason', () => {
  it('every IC-3 tag on a Windows check carries the correction', () => {
    const found = files.flatMap((f) => uncorrectedWindowsCheckIc3(readFileSync(f, 'utf8'), relative(root, f)));
    expect(found).toEqual([]);
  });

  it('flags the shorthand and passes the corrected, the macOS-only and the Linux forms', () => {
    expect(uncorrectedWindowsCheckIc3('anything on Windows (IC-3).', 'x')).toHaveLength(1);
    expect(uncorrectedWindowsCheckIc3('Windows and macOS were not run (IC-3).', 'x')).toHaveLength(1);
    expect(uncorrectedWindowsCheckIc3('nothing ran on Windows (no host, IC-3) or on macOS.', 'x')).toHaveLength(1);
    expect(uncorrectedWindowsCheckIc3('anything on Windows (IC-3 — *corrected 2026-10-14: a Windows host; IC-3 binds Linux and macOS artifacts*).', 'x')).toEqual([]);
    expect(uncorrectedWindowsCheckIc3('A Windows re-run (no host). Anything on macOS (IC-3).', 'x')).toEqual([]);
    expect(uncorrectedWindowsCheckIc3('a Windows re-run of the spellings (no host), or macOS (IC-3).', 'x')).toEqual([]);
    expect(uncorrectedWindowsCheckIc3('(d) Windows only is measured; POSIX waits on IC-3.', 'x')).toEqual([]);
    expect(uncorrectedWindowsCheckIc3('the rebuild is ~3 minutes. Windows only (IC-3).', 'x')).toEqual([]);
    expect(uncorrectedWindowsCheckIc3('Windows is the one release target IC-3 leaves.', 'x')).toEqual([]);
  });
});

describe('a Windows packaging check does not name IC-3 as its reason', () => {
  it('reads the record', () => {
    expect(files.length).toBeGreaterThan(50);
    expect(files).toContain(join(root, 'docs', 'proofs', 'updater-proof.md'));
  });

  it('every IC-3 tag on a check owed to a Windows package carries the correction', () => {
    const found = files.flatMap((f) => uncorrectedWindowsIc3(readFileSync(f, 'utf8'), relative(root, f)));
    expect(found).toEqual([]);
  });

  it('flags the shorthand and passes the corrected and the Linux forms', () => {
    expect(uncorrectedWindowsIc3('owed to the next Windows package (IC-3).', 'x')).toHaveLength(1);
    expect(uncorrectedWindowsIc3(`owed to the next Windows package (IC-3 — *corrected: ${CORRECTION}; IC-3 binds Linux and macOS artifacts*).`, 'x')).toEqual([]);
    expect(uncorrectedWindowsIc3('No Windows package was run. IC-3 bars a Linux artifact, and the Windows pack needs its own host.', 'x')).toEqual([]);
    expect(uncorrectedWindowsIc3('the packaged branch needs `win-unpacked`; macOS and Linux (IC-3) are refused.', 'x')).toEqual([]);
  });
});
