import { OVERSCAN, ROW_MIN_HEIGHT } from './constants.js';
import { FACT_SEPARATOR, segmentFacts } from './project.js';
import { isReasoningRow } from './Row.js';
import type { DisplayRow } from './types.js';

/**
 * ADR-0045's geometry, kept pure so the recycler's hard part is testable without a DOM.
 *
 * **Row heights are measured, not assumed.** A measurement cache keyed by the four-part reuse key feeds the
 * prefix-sum offset table below, which is what makes anchor restoration and scroll-to-centre exact rather than
 * approximate — and it is also why the transcript is a scroll container of absolutely positioned slots rather than
 * a document flow: a slot is positioned from the table, so rebinding it moves it without reflowing its neighbours.
 *
 * Until a row has genuinely completed layout, its height is an ESTIMATE. The estimate is deliberately coarse and
 * deliberately per-shape: a wrong estimate above the viewport is corrected by the anchor rule of REQ-CHAT-071 on
 * the next settle, and a wrong estimate below it is never seen.
 *
 * **The estimate must estimate what the row DRAWS.** A thinking row's body is the whole streamed reasoning
 * text, but under REQ-CHAT-167 (show-reasoning default OFF) a collapsed one draws only its one-line summary —
 * and a LIVE row is never measured (`reuseKey` returns null for it), so a body-based estimate for one survives
 * uncorrected for the whole streaming period, pushing every row below off-screen and reading as blank space
 * (a defect note, removed once repaired). The caller therefore passes the expansion state it
 * already holds, and a collapsed reasoning row estimates its header. Expanded reasoning rows keep the body-based
 * estimate; live tool rows draw their one-line preview, which the per-line term already covers.
 */
/**
 * `.row__grid` spends `52px` on the timestamp and `112px` on the role before the main column begins, with a
 * `--rt-space-2` gap either side. The estimate models WRAPPING now, so it has to know the width there is to
 * wrap in; a caller that has not measured its viewport yet passes nothing and gets a one-line answer, which the
 * first measurement corrects like any other estimate.
 */
const TIME_COLUMN = 52;
const ROLE_COLUMN = 112;
const COLUMN_GAPS = 16;
const GUTTER = TIME_COLUMN + ROLE_COLUMN + COLUMN_GAPS;
/** Rough advances: `--rt-text-sm` body, and the `2xs` uppercase label, which is tracked and so wider per glyph. */
const CHARACTER = 6.2;
const LABEL_CHARACTER = 6.6;
const TEXT_LINE = 18;
/** `.row__body` takes a prose measure of 78 %; a diff, a table and a code fence opt out, which this does not model. */
const PROSE_MEASURE = 0.78;

/**
 * How many lines `text` draws at `width`, never fewer than one.
 *
 * This walks the string rather than splitting it. `estimateHeight` runs for every displayed row that has no
 * measurement yet, which on a 1200-row transcript is every row of the first paint — and REQ-CHAT-055 bounds
 * appending there to within one frame of appending to an empty one, a bound a per-row array allocation is
 * enough to miss.
 */
function wrappedLines(text: string, width: number, advance = CHARACTER): number {
  let lines = 0;
  let start = 0;
  for (;;) {
    const brk = text.indexOf('\n', start);
    const length = (brk === -1 ? text.length : brk) - start;
    // No width known yet — no wrapping can be predicted, so this is the old width-blind count and nothing more.
    lines += width <= 0 ? 1 : Math.max(1, Math.ceil((length * advance) / width));
    if (brk === -1) break;
    start = brk + 1;
  }
  return Math.max(1, lines);
}

export function estimateHeight(d: DisplayRow, expanded = false, width = 0): number {
  if (d.shape === 'trailer') return 36;
  const main = width > GUTTER ? width - GUTTER : 0;
  // REQ-CHAT-057's attribution shares the row's height: `.row__role` wraps inside its 112 px column rather than
  // truncating (docs/defects/role-gutter-truncation-rule-is-inert.md), so a long agent name costs a second line
  // even when the main column needs only one.
  const role = (d.shape === 'group' ? d.role : d.row.name ?? '').toUpperCase();
  const roleLines = wrappedLines(role, ROLE_COLUMN, LABEL_CHARACTER);
  if (d.shape === 'group') {
    // PD-CHAT-004: the activity line is one line only while its segments FIT. `.activity__segments` is
    // `flex-wrap: wrap`, so a long run draws two, three or four of them — and the constant that used to be here
    // drew a twelve-segment run into a 36 px allocation, through the row beneath it.
    // The summary's LENGTH, without joining the summary: the drawn text is what `Row` renders fact by fact
    // (PD-CHAT-004 revision 3), and allocating a joined copy of it per row per paint is the cost REQ-CHAT-055's bound
    // cannot absorb. Summing the facts gives the same figure — the segment's own text plus one separator.
    let width = 0;
    for (const segment of d.segments) {
      for (const fact of segmentFacts(segment)) width += fact.text.length + FACT_SEPARATOR.length;
    }
    const lines = Math.max(main <= 0 ? 1 : Math.max(1, Math.ceil((width * CHARACTER) / main)), roleLines);
    // The `⤷` preview line drawn while a call is in flight.
    const flight = d.inFlight === null ? 0 : 20;
    return Math.max(ROW_MIN_HEIGHT, (lines - 1) * TEXT_LINE + ROW_MIN_HEIGHT + flight);
  }
  const row = d.row;
  // REQ-CHAT-062: a collapsed reasoning row draws exactly one summary line, whatever the hidden body holds.
  if (isReasoningRow(row) && !expanded) return Math.max(ROW_MIN_HEIGHT, (roleLines - 1) * TEXT_LINE + ROW_MIN_HEIGHT);
  // PD-CHAT-003: a row sizes to its content — one ~17 px line per DRAWN line, no padding box. A body line is not
  // a drawn line: one 400-character paragraph is a single `\n`-delimited line and five on screen, and counting
  // the first was half of why a streaming message shifted every row below it twice per chunk.
  const bodyLines = row.body === '' ? 1 : wrappedLines(row.body, Math.round(main * PROSE_MEASURE));
  const lines = Math.max(bodyLines, roleLines);
  const extra = (row.input !== undefined && row.input !== '' ? 1 : 0) + (row.output !== undefined && row.output !== '' ? 1 : 0);
  return Math.max(ROW_MIN_HEIGHT, (lines - 1) * TEXT_LINE + extra * 20 + ROW_MIN_HEIGHT);
}

export interface OffsetTable {
  /** `offsets[i]` is the top of displayed row `i`; `offsets[n]` is the total height. */
  readonly offsets: readonly number[];
  readonly total: number;
}

export function buildOffsets(heights: readonly number[]): OffsetTable {
  const offsets = new Array<number>(heights.length + 1);
  let y = 0;
  for (let i = 0; i < heights.length; i += 1) { offsets[i] = y; y += heights[i]!; }
  offsets[heights.length] = y;
  return { offsets, total: y };
}

/** The displayed row containing `y`, by binary search over the prefix sums. */
export function indexAt(table: OffsetTable, y: number): number {
  const { offsets } = table;
  let lo = 0;
  let hi = offsets.length - 2;
  if (hi < 0) return 0;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (offsets[mid]! <= y) lo = mid; else hi = mid - 1;
  }
  return lo;
}

/** The span of displayed rows a viewport needs, with the overscan margin above and below. */
export function visibleRange(table: OffsetTable, scrollTop: number, viewportHeight: number, count: number, capacity: number): { first: number; last: number } {
  if (count === 0) return { first: 0, last: -1 };
  const firstVisible = indexAt(table, scrollTop);
  const lastVisible = indexAt(table, scrollTop + viewportHeight);
  const first = Math.max(0, firstVisible - OVERSCAN);
  let last = Math.min(count - 1, lastVisible + OVERSCAN);
  // The pool is FIXED: a span wider than the pool binds what fits, starting from the top of the span. This cannot
  // happen while the viewport is inside `H_MAX` (REQ-CHAT-057's 30 px floor bounds the span by the capacity), and
  // is the safety rail rather than the design.
  if (last - first + 1 > capacity) last = first + capacity - 1;
  return { first, last };
}

/**
 * REQ-CHAT-071 / REQ-CHAT-053: the reader's position is preserved BY ANCHOR — the identity and viewport offset of
 * the top visible row — and restored by locating that row again after geometry settles, **never** by re-applying a
 * stored pixel offset. `capture` is taken before rows move; `restore` is applied after they have.
 */
export interface Anchor {
  readonly key: string;
  /** The distance from the viewport's top edge to that row's top edge, which may be negative. */
  readonly offset: number;
}

export function captureAnchor(display: readonly DisplayRow[], table: OffsetTable, scrollTop: number): Anchor | null {
  if (display.length === 0) return null;
  const i = indexAt(table, scrollTop);
  const row = display[i];
  if (row === undefined) return null;
  return { key: row.key, offset: table.offsets[i]! - scrollTop };
}

export function restoreAnchor(display: readonly DisplayRow[], table: OffsetTable, anchor: Anchor | null): number | null {
  if (anchor === null) return null;
  const i = display.findIndex((d) => d.key === anchor.key);
  if (i === -1) return null;
  return Math.max(0, table.offsets[i]! - anchor.offset);
}

/**
 * REQ-CHAT-053's four update shapes, decided by comparing the displayed keys before and after. Only a change
 * matching NONE of the four may reset the view, and such a reset must still restore by REQ-CHAT-071's anchor.
 *
 *  - `append`  — rows added at the end and nothing else changed;
 *  - `truncate` — rows dropped from the end and nothing else changed;
 *  - `replace` — the same number of rows, replaced in place;
 *  - `extend`  — the last row extended (its key unchanged) while rows were appended after it;
 *  - `other`   — anything else, which is the only case permitted to reset.
 */
export type UpdateShape = 'append' | 'truncate' | 'replace' | 'extend' | 'other';

export function updateShape(before: readonly DisplayRow[], after: readonly DisplayRow[]): UpdateShape {
  const a = before.map((d) => d.key);
  const b = after.map((d) => d.key);
  if (a.length === b.length && a.every((k, i) => k === b[i])) return 'replace';
  const shared = Math.min(a.length, b.length);
  let common = 0;
  while (common < shared && a[common] === b[common]) common += 1;
  if (common === a.length && b.length > a.length) return 'append';
  if (common === b.length && a.length > b.length) return 'truncate';
  // The last displayed row kept its identity and grew, and rows were appended after it: REQ-CHAT-053's fourth shape.
  if (a.length > 0 && common === a.length - 1 && b.length >= a.length && a[a.length - 1] === b[a.length - 1]) return 'extend';
  return 'other';
}

/** REQ-CHAT-072: the count is in DISPLAYED rows, grouping-aware, and REQ-CHAT-168 fixes the wording at 0, 1 and many. */
export function newUpdatesLabel(n: number): string {
  return `${n} new ${n === 1 ? 'update' : 'updates'}`;
}
