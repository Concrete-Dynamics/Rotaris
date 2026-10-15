/**
 * What `docs/architecture/open-questions.md` says of each ruling under the owner's standing delegation
 * ([R-072](../docs/product/requests.md#r-072)), read against itself.
 *
 * A question is ruled no earlier than it is raised. Seven consortium rulings of 2026-10-14 were dated 2026-10-13 — a day
 * before their questions were raised — while the same sittings' other rulings were dated 2026-10-14, so the record
 * disagreed with itself on which day a ruling was made (acceptance finding C1 of fin46,
 * `docs/defects/fixed/consortium-rulings-of-2026-10-14-are-dated-2026-10-13-before-their-questions-were-raised.md`).
 * The date a ruling is made is the consortium's ruling record's, outside the repository; what the record can be held to
 * is that no "Ruled <date>" in an entry falls before the date the entry was raised.
 *
 * A ruling under R-072 also names the two recommendations it weighed. OQ-298's said only that the orchestrator's ruling
 * record held them (acceptance finding C2 of fin46); twenty-two others name no advocate either, and are listed below as
 * known gaps until they are written.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** One question's entry: its number, the line it opens on, and its text up to the next entry or heading. */
type Entry = { n: number; line: number; text: string };

function entriesOf(text: string): Entry[] {
  const lines = text.split('\n');
  const out: Entry[] = [];
  let cur: { n: number; line: number; lines: string[] } | undefined;
  const flush = () => {
    if (cur) out.push({ n: cur.n, line: cur.line, text: cur.lines.join('\n') });
    cur = undefined;
  };
  lines.forEach((l, i) => {
    const m = /^\*\*OQ-(\d+)\b/.exec(l);
    if (m) {
      flush();
      cur = { n: Number(m[1]), line: i + 1, lines: [l] };
    } else if (/^#{1,6} /.test(l)) flush();
    else cur?.lines.push(l);
  });
  flush();
  return out;
}

/**
 * The date an entry was raised: the first "Raised" (or "raised") followed, within one sentence of at most 120
 * characters, by a date — "Raised 2026-10-14 by fin44", "raised 2026-10-14 by fin45 … as the brief asked".
 */
function raisedOn(text: string): string | undefined {
  return /\b[Rr]aised\b[^.]{0,120}?(20\d\d-\d\d-\d\d)/.exec(text)?.[1];
}

/** Every date the entry gives a ruling: "**Ruled 2026-10-14 under …", "Ruled 2026-10-14 under R-072, below.". */
function ruledOn(text: string): string[] {
  return [...text.matchAll(/\bRuled (20\d\d-\d\d-\d\d)\b/g)].map((m) => m[1]);
}

/** Each entry ruled before it was raised: `OQ-<n> (line <l>): raised <date>, ruled <date>`. */
function ruledBeforeRaised(text: string): string[] {
  return entriesOf(text).flatMap((e) => {
    const raised = raisedOn(e.text);
    if (raised === undefined) return [];
    const early = ruledOn(e.text).filter((d) => d < raised);
    return early.length ? [`OQ-${e.n} (line ${e.line}): raised ${raised}, ruled ${early.join(', ')}`] : [];
  });
}

/**
 * Whether an entry ruled under R-072 names what its two advocates recommended: advocate A (the user's lens) and advocate B
 * (the system's lens) each named, or the two recorded as agreeing ("both advocates followed", "both recommendations
 * followed"). "Both of its recommendations" does not count: OQ-298 used it of the ruling's own two record changes while its
 * advocates' recommendations went unnamed (acceptance finding C2 of fin46,
 * `docs/defects/fixed/oq-298s-ruling-does-not-name-the-recommendations-it-weighed.md`).
 */
function namesItsRecommendations(text: string): boolean {
  const a = /\b[Aa]dvocate A\b|\bA \(the user|\buser's lens\b/.test(text);
  const b = /\b[Aa]dvocate B\b|\bB \(the system|\bsystem's lens\b/.test(text);
  return (a && b) || /\bboth advocates\b|\bboth recommendations followed\b/.test(text);
}

/** The entries ruled under R-072: a "**Ruled <date> …" line that cites R-072. */
function ruledUnderR072(text: string): Entry[] {
  return entriesOf(text).filter((e) => /\*\*Ruled 20\d\d-\d\d-\d\d[^\n]*R-072/.test(e.text));
}

/**
 * Entries ruled under R-072 that name neither advocate, recorded in
 * `docs/defects/r-072-rulings-that-do-not-name-what-the-advocates-recommended.md` and left for the orchestrator, which
 * holds the consortium's ruling record. A listed entry that comes to name them fails the test until it leaves this list.
 */
const UNNAMED_RECOMMENDATIONS = [
  262, 265, 266, 267, 271, 272, 279, 280, 281, 282, 283, 284, 285, 292, 293, 294, 295, 296, 299, 300, 311, 312,
];

const RECORD = readFileSync(join(import.meta.dirname, '..', 'docs', 'architecture', 'open-questions.md'), 'utf8');
const REQUESTS = readFileSync(join(import.meta.dirname, '..', 'docs', 'product', 'requests.md'), 'utf8');

/**
 * R-072's row in `docs/product/requests.md` names the rulings made under it in clauses headed in bold by the day they were
 * made ("**Ruled 2026-10-14, built 2026-10-14 by fin44 …:**", "**Also ruled under it on 2026-10-13 …:**"). Each question
 * such a clause cites must carry a "Ruled <that day>" in its own entry: ten rulings of 2026-10-14 were headed 2026-10-13
 * there after their entries were corrected (acceptance finding C1 of fin46,
 * `docs/defects/fixed/the-r-072-row-dates-ten-rulings-of-2026-10-14-to-2026-10-13.md`).
 * Returns `OQ-<n>: row <date>, entry <dates>` for each that disagrees.
 */
function rowDatesAgainstEntries(requests: string, record: string): string[] {
  const row = requests.split('\n').find((l) => /^\| <a id="r-072"><\/a>R-072 \|/.test(l));
  if (row === undefined) return ['no R-072 row'];
  const ruled = new Map(entriesOf(record).map((e) => [e.n, ruledOn(e.text)]));
  const parts = row.split('**');
  const out: string[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    const heading = parts[i];
    const date = /\b[Rr]uled\b[^\n]*?(20\d\d-\d\d-\d\d)/.exec(heading)?.[1];
    if (date === undefined) continue;
    const body = parts[i + 1] ?? '';
    // A question named in the possessive ("OQ-262's no-holder clause revised") is one the ruling refers to, not one it rules.
    const cited = [...new Set([...body.matchAll(/\bOQ-(\d+)\b(?!'s)/g)].map((m) => Number(m[1])))];
    for (const n of cited) {
      const dates = ruled.get(n) ?? [];
      if (!dates.includes(date)) out.push(`OQ-${n}: row ${date}, entry ${dates.join(', ') || 'none'}`);
    }
  }
  return out;
}

describe('open-questions.md: the rulings under R-072', () => {
  it('reads the entries, and a raised date for most of them', () => {
    const entries = entriesOf(RECORD);
    expect(entries.length).toBeGreaterThan(290);
    expect(entries.filter((e) => raisedOn(e.text) !== undefined).length).toBeGreaterThan(200);
  });

  it('no question is ruled before it was raised (fin46, C1)', () => {
    expect(ruledBeforeRaised(RECORD)).toEqual([]);
  });

  it('over fixtures: a ruling dated before the raising fails; the same day, a later day or no raised date passes', () => {
    const fixture = [
      '**OQ-1 — Early?** *(REQ-X-1. Raised 2026-10-14 by fin44. Ruled 2026-10-13 under R-072, below.)*',
      '',
      '**Ruled 2026-10-13 under the owner\'s delegation ([R-072](requests.md#r-072)):** as built.',
      '',
      '**OQ-2 — Same day?** *(REQ-X-2. Raised 2026-10-14 by fin44 as the brief asked.)*',
      '',
      '**Ruled 2026-10-14 under the owner\'s delegation:** as built. *Dated 2026-10-13 until fin46 corrected it.*',
      '',
      '**OQ-3 — Later?** *(Raised 2026-10-07.)*',
      '',
      '**Ruled 2026-10-13 by the consortium:** changed.',
      '',
      '**OQ-4 — Never dated.** *(REQ-X-4.)* **Ruled 2026-09-01.**',
      '',
      '## Escalations',
      '',
      'Raised 2026-12-01; Ruled 2026-01-01 — no entry\'s.',
    ].join('\n');
    expect(ruledBeforeRaised(fixture)).toEqual(['OQ-1 (line 1): raised 2026-10-14, ruled 2026-10-13, 2026-10-13']);
  });

  it('every ruling under R-072 names what its two advocates recommended, but the known gaps (fin46, C2)', () => {
    const ruled = ruledUnderR072(RECORD);
    expect(ruled.length).toBeGreaterThan(70);
    const unnamed = ruled.filter((e) => !namesItsRecommendations(e.text)).map((e) => e.n);
    expect(unnamed.sort((x, y) => x - y)).toEqual(UNNAMED_RECOMMENDATIONS);
  });

  it("R-072's row dates each ruling it names on the day its entry gives (fin46, C1)", () => {
    expect(rowDatesAgainstEntries(REQUESTS, RECORD)).toEqual([]);
  });

  it('over fixtures: a row clause dated a day other than its entry fails; a clause with no ruling date is not read', () => {
    const record = [
      '**OQ-1 — One?** *(Raised 2026-10-13.)*',
      '',
      '**Ruled 2026-10-14 under the owner\'s delegation ([R-072](requests.md#r-072)):** as built.',
      '',
      '**OQ-2 — Two?** *(Raised 2026-10-12.)* **Ruled 2026-10-13 under R-072.**',
    ].join('\n');
    const requests = [
      '| <a id="r-071"></a>R-071 | **Ruled 2026-01-01:** OQ-1 |',
      '| <a id="r-072"></a>R-072 | 2026-10-07 | "…" | **standing delegation** | **Minted under it on 2026-10-13:** (OQ-1). ' +
        '**Ruled 2026-10-13, written 2026-10-14 by fin44:** [OQ-1](x#oq-1) and [OQ-2](x#oq-2). ' +
        '**Also ruled under it on 2026-10-14:** OQ-1, OQ-3, beside OQ-2\'s clause. |',
    ].join('\n');
    expect(rowDatesAgainstEntries(requests, record)).toEqual([
      'OQ-1: row 2026-10-13, entry 2026-10-14',
      'OQ-3: row 2026-10-14, entry none',
    ]);
  });

  it('over fixtures: both advocates named, or recorded as agreeing, pass; one advocate, or the ruling\'s own two, fail', () => {
    expect(namesItsRecommendations('Advocate A (the user\'s lens) recommended X; advocate B recommended Y.')).toBe(true);
    expect(namesItsRecommendations('**Ruled …, both advocates followed:** confirmed as built.')).toBe(true);
    expect(namesItsRecommendations('(advocate B\'s recommendation followed, with one point of advocate A\'s folded in)')).toBe(true);
    expect(namesItsRecommendations('advocate B\'s recommendation followed.')).toBe(false);
    expect(namesItsRecommendations('The ruling carries both of its recommendations into the record.')).toBe(false);
  });
});
