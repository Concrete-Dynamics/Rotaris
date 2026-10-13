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

describe('a Windows packaging check does not name IC-3 as its reason', () => {
  it('reads the record', () => {
    expect(files.length).toBeGreaterThan(50);
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
