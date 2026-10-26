/**
 * OQ-302's ruling places three things in `docs/spec/12-desktop-shell-windows.md` by line: the sentence that makes REQ-SHELL-006's
 * preference table closed (quoted), the `display/showReasoning` row, and the row of the `requirements/` elevation keys. It quoted
 * the sentence "from line 402", which is the table's header row; the sentence stands two lines above it
 * (`docs/defects/fixed/oq-302-cites-the-preference-tables-closing-sentence-at-line-402-where-it-stands-at-line-400.md`).
 *
 * The ruling's line numbers date from its writing, and the specification gains lines above the table whenever a directive adds a
 * back-pointer, so an absolute line is not pinned here: that would turn red on another change's back-pointer and ask a ruling's
 * history to be rewritten. What a back-pointer above the table cannot move is the distance between the three places, all inside
 * the table's block, which the specification never edits in place. This reads the cited lines from the ruling and requires their
 * spacing to be the spacing of the lines that hold what each one names: a citation off by two from its neighbours is red.
 */
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error — the tools directory is plain ESM, run by node without a build step.
import { readRecord } from './record-parts.mjs';

const root = join(import.meta.dirname, '..');

/** One place a ruling cites by line: the pattern that reads the line number from the entry, and the text that line holds. */
interface Citation {
  readonly name: string;
  readonly cited: RegExp;
  readonly holds: (entry: string) => string;
}

/** The text of one question's entry: from its `**OQ-<n>` line up to the next entry. */
function entryOf(record: string, n: number): string {
  const start = record.search(new RegExp(`^\\*\\*OQ-${n}\\b`, 'm'));
  if (start < 0) return '';
  const rest = record.slice(start + 1);
  const next = rest.search(/^\*\*OQ-\d+\b/m);
  return next < 0 ? record.slice(start) : record.slice(start, start + 1 + next);
}

const flat = (s: string): string => s.replace(/\s+/g, ' ');

/**
 * Each citation that disagrees with the specification, measured from the first one: `name: cited +x, stands +y`. Also names a
 * citation the entry lacks, and a text the specification holds on no line or on more than one.
 */
function misplaced(entry: string, spec: string, citations: readonly Citation[]): string[] {
  const specLines = spec.split('\n').map(flat);
  const found: string[] = [];
  const places = citations.map((c) => {
    const m = c.cited.exec(flat(entry));
    if (!m) {
      found.push(`${c.name}: the entry cites no line`);
      return undefined;
    }
    const text = flat(c.holds(flat(entry)));
    const at = specLines.flatMap((line, i) => (line.includes(text) ? [i + 1] : []));
    if (at.length !== 1) {
      found.push(`${c.name}: the specification holds "${text}" on ${at.length} lines`);
      return undefined;
    }
    return { name: c.name, cited: Number(m[1]), stands: at[0] };
  });
  const [first, ...rest] = places;
  if (!first) return found;
  for (const p of rest) {
    if (!p) continue;
    const cited = p.cited - first.cited;
    const stands = p.stands - first.stands;
    if (cited !== stands) found.push(`${p.name}: cited ${first.name} +${cited}, stands ${first.name} +${stands}`);
  }
  return found;
}

const QUOTE = /line (\d+): "([^"]+)"/;

const oq302: readonly Citation[] = [
  { name: 'the closing sentence', cited: QUOTE, holds: (entry) => QUOTE.exec(entry)?.[2] ?? '' },
  { name: 'the display/showReasoning row', cited: /`display\/showReasoning` stands as that table registers it \(line (\d+)\)/, holds: () => '| `display/showReasoning` |' },
  { name: 'the requirements/ row', cited: /elevation keys its row assigns to REQ-CONFIG-405 by name \(line (\d+)\)/, holds: () => '| `requirements/fullPermissionRuns`' },
];

describe("OQ-302's line citations stand where the preference table's lines stand", () => {
  const record = readRecord(join(root, 'docs', 'architecture', 'open-questions.md'));
  const spec = readRecord(join(root, 'docs', 'spec', '12-desktop-shell-windows.md'));

  it('reads the ruling', () => {
    expect(entryOf(record, 302)).toMatch(/^\*\*OQ-302\b/);
    expect(entryOf(record, 302)).toContain('Ruled 2026-10-14');
  });

  it("the quoted sentence, the display/showReasoning row and the requirements/ row keep the specification's spacing", () => {
    expect(misplaced(entryOf(record, 302), spec, oq302)).toEqual([]);
  });

  it('flags a quotation cited two lines below the sentence it quotes', () => {
    const table = ['intro', 'This table is closed: every key is listed here.', '', '| Key |', '| `display/showReasoning` |', '| `requirements/fullPermissionRuns` |'].join('\n');
    const entry = (q: number) =>
      `the table, from line ${q}: "every key is listed here". \`display/showReasoning\` stands as that table registers it (line 5) ... elevation keys its row assigns to REQ-CONFIG-405 by name (line 6)`;
    expect(misplaced(entry(2), table, oq302)).toEqual([]);
    expect(misplaced(entry(4), table, oq302)).toEqual([
      'the display/showReasoning row: cited the closing sentence +1, stands the closing sentence +3',
      'the requirements/ row: cited the closing sentence +2, stands the closing sentence +4',
    ]);
  });
});
