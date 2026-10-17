/**
 * `git-proof.mjs` keeps its launches listed in two places agents read before they run it: the script's own header
 * block, and its record in the proof registry (`docs/proofs/git-proof.md`; the row read `AGENTS.md`'s proof table
 * until that table moved into the registry, 2026-10-18). Launch 6c (`unborn-branch`, fin22) was added to the script
 * and to neither, so the index never said that git-proof shows REQ-WORKSPACE-020's empty item for an unborn branch
 * (REQ-WORKSPACE-029), and the header still said "six launches" where ten ran
 * (`docs/defects/fixed/agents-md-git-proof-row-omits-the-unborn-branch-launch.md`).
 *
 * The scan reads the script's text: each launch section is headed `// <label>. ` at column zero (`1`, `3b`, `6c`), and
 * its launch is the first `launch('<name>'` after that heading. It asserts that the header lists every section as
 * `<label>. <name>`, that the header's count is the number of launches, and that the record names every lettered
 * launch (the ones added after a numbered launch, and the ones an index forgets) as `launch <label>` and by its name.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REPO = resolve(import.meta.dirname, '..', '..', '..');
const SCRIPT = readFileSync(join(REPO, 'apps', 'desktop', 'scripts', 'git-proof.mjs'), 'utf8');
const RECORD = readFileSync(join(REPO, 'docs', 'proofs', 'git-proof.md'), 'utf8');
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen'];

interface Section { label: string; name: string }

function sections(text: string): Section[] {
  const headings = [...text.matchAll(/^\/\/ (\d+[a-z]?)\. /gm)];
  return headings.map((h, i) => {
    const end = headings[i + 1]?.index ?? text.length;
    const launch = /\blaunch\('([^']+)'/.exec(text.slice(h.index, end));
    if (!launch) throw new Error(`section ${h[1]} of git-proof.mjs starts no launch`);
    return { label: h[1]!, name: launch[1]! };
  });
}

function header(text: string): string {
  const close = text.indexOf('*/');
  if (!text.startsWith('/**') || close < 0) throw new Error('git-proof.mjs opens with no header block');
  return text.slice(0, close);
}

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

describe('git-proof\'s launches are listed where agents read them (REQ-WORKSPACE-020, REQ-WORKSPACE-029)', () => {
  const found = sections(SCRIPT);

  it('reads every launch section of the script, 6c `unborn-branch` among them', () => {
    expect(found.length).toBe([...SCRIPT.matchAll(/\blaunch\('([^']+)'/g)].length);
    expect(found).toContainEqual({ label: '6c', name: 'unborn-branch' });
  });

  it('the script\'s header lists every launch as `<label>. <name>` and counts them', () => {
    const head = header(SCRIPT);
    for (const { label, name } of found) expect(head, `header item ${label}. ${name}`).toMatch(new RegExp(`^ \\*\\s+${escape(label)}\\. ${escape(name)}\\s`, 'm'));
    expect(head).toContain(`${WORDS[found.length]} launches`);
  });

  it('its registry record names every lettered launch by its label and its name', () => {
    for (const { label, name } of found.filter((s) => /[a-z]$/.test(s.label))) {
      expect(RECORD, `launch ${label}`).toMatch(new RegExp(`\\blaunch ${escape(label)}\\b`));
      expect(RECORD, `\`${name}\``).toContain(`\`${name}\``);
    }
  });
});
