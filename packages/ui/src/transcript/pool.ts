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
 * **Falsified 2026-09-29, kept beside its replacement: "a wrong estimate below the viewport is never seen" is not the
 * whole of it.** A row appended at the tail while the pane follows is INSIDE the viewport, positioned by its estimate
 * for the frame or two before the measurement pass reaches it, so an estimate SHORT of what the row draws is seen: the
 * row is drawn through the row beneath it for those frames. An estimate that is long leaves a gap for the same frames
 * instead, which draws nothing through anything. So the estimate may be coarse, but never short of a one-line row —
 * and the first row of a block is drawn 12 px below the row above it rather than 4 px (PD-CHAT-003), which the 30 px
 * unit did not cover: a one-line block-start row drew 33.4 px into 30
 * (docs/defects/fixed/a-new-reasoning-row-is-drawn-through-the-row-beneath-it-until-its-first-measurement.md).
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
/**
 * PD-CHAT-003's vertical rhythm: `.row--block-start` carries `--rt-space-3` (12 px) above it, and every other row
 * `.row`'s 4 px. The 30 px unit already covers a one-line row inside a block (4 px, the 1 px border either side and
 * one line); the first row of a block is drawn this much taller.
 */
const BLOCK_GAP_OVER_ROW_GAP = 12 - 4;
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

/**
 * @param blockStart whether the row starts a block (`placements`' `blockStart`), which draws it 12 px below the row
 *   above rather than 4 px. A caller that does not know passes nothing and gets the estimate for a row inside a block.
 */
export function estimateHeight(d: DisplayRow, expanded = false, width = 0, blockStart = false): number {
  if (d.shape === 'trailer') return 36;
  return estimateBox(d, expanded, width) + (blockStart ? BLOCK_GAP_OVER_ROW_GAP : 0);
}

/** A non-trailer row's estimate as a row inside a block — what `estimateHeight` answered before the block gap. */
function estimateBox(d: Exclude<DisplayRow, { shape: 'trailer' }>, expanded: boolean, width: number): number {
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

/**
 * Which row identities the measurement pass has re-measured, and when (REQ-CHAT-058's measurements, as the offset table
 * reads them). The pass stamps each delivery (`beginMeasuring`) and marks every identity whose recorded height it
 * changed or whose entry either bounded cache evicted (`markMeasured`); a table built at stamp `s` then knows that an
 * identity is stale exactly when it was marked after `s` (`remeasuredSince`). The ledger also holds the table React
 * committed last, which the next one is built against (`commitTable`), and forgets the marks that table has read, so it
 * holds one delivery's worth of identities, not a session's.
 */
export interface MeasureLedger {
  stamp: number;
  readonly marked: Map<string, number>;
  committed: HeightTable | null;
}

export function createMeasureLedger(): MeasureLedger {
  return { stamp: 0, marked: new Map(), committed: null };
}

/** The pane's layout effect, once React has committed `table`: the next table is built against it. */
export function commitTable(ledger: MeasureLedger, table: HeightTable): void {
  ledger.committed = table;
  forgetMeasured(ledger, table.stamp);
}

export function beginMeasuring(ledger: MeasureLedger): void {
  ledger.stamp += 1;
}

export function markMeasured(ledger: MeasureLedger, identity: string): void {
  ledger.marked.set(identity, ledger.stamp);
}

export function remeasuredSince(ledger: MeasureLedger, identity: string, since: number): boolean {
  return (ledger.marked.get(identity) ?? -1) > since;
}

export function forgetMeasured(ledger: MeasureLedger, upTo: number): void {
  for (const [identity, stamp] of ledger.marked) if (stamp <= upTo) ledger.marked.delete(identity);
}

/** An offset table together with what its heights were read against, so the next one can reuse what did not change. */
export interface HeightTable extends OffsetTable {
  readonly heights: readonly number[];
  readonly display: readonly DisplayRow[];
  readonly width: number;
  readonly expanded: ReadonlySet<string>;
  /** The measurement stamp the heights were read at (`MeasureLedger`). */
  readonly stamp: number;
}

/**
 * ADR-0045's offset table for `next.display`, reading a height (`heightOf`) only for a row that is not the same row
 * object at the same position as in `previous`, or whose identity the measurement pass re-measured since `previous` was
 * built (`remeasured`) — and re-summing the offsets only from the first height that changed. A change of width or of
 * the expansion set rebuilds it whole, which is a reader's action or a resize, never an increment.
 *
 * REQ-CHAT-055: "the work of painting and measuring MUST depend on how many rows are visible and how many rows changed,
 * not on how many rows the transcript holds in total". The first form of the table read every displayed row's height
 * on every rebuild — one measurement key, two cache lookups and, for every row never yet on screen, `estimateHeight` —
 * and the pane rebuilt it two or three times an increment (the new rows, then each measurement they caused). V8's CPU
 * profile of the built app (2026-09-29, the defect note's "CPU profile" section) put that pass at about 0.3 ms an
 * increment at 1,200 rows against nothing on an empty transcript, the largest single term of the loaded side's extra
 * script. What is still proportional to the rows held here is a pointer comparison and an array copy per row, which
 * cost microseconds at the window's bound.
 *
 * The result is the table `buildOffsets(next.display.map(heightOf))` would build, value for value, provided
 * `heightOf` reads nothing but the row, the width, the expansion set, the measurements filed under the row's
 * identity and the row's block start — the pane's does; a row reused here has the same row object above it, so its
 * block start is unchanged — and `remeasured` answers true for every identity whose measurements changed since
 * `previous.stamp` (`transcript.test.ts` holds it to that over seeded walks).
 */
export function reuseOffsets(
  previous: HeightTable | null,
  next: { readonly display: readonly DisplayRow[]; readonly width: number; readonly expanded: ReadonlySet<string>; readonly stamp: number },
  /** Null when nothing has been re-measured since `previous` was built, which spares the lookup for every reused row. */
  remeasured: ((identity: string, since: number) => boolean) | null,
  /** `at` is the row's position in `next.display`: the pane reads the row's block start there (PD-CHAT-003). */
  heightOf: (d: DisplayRow, at: number) => number,
): HeightTable {
  const { display, width, expanded, stamp } = next;
  const n = display.length;
  const heights = new Array<number>(n);
  // The first position whose height may differ from `previous` — everything above it keeps its offset.
  let from = 0;
  let i = 0;
  if (previous !== null && previous.width === width && previous.expanded === expanded) {
    const before = previous.display;
    const shared = Math.min(n, before.length);
    from = shared;
    for (; i < shared && display[i] === before[i]; i += 1) {
      const d = display[i]!;
      const held = previous.heights[i]!;
      const height = remeasured !== null && remeasured(d.key, previous.stamp) ? heightOf(d, i) : held;
      heights[i] = height;
      if (height !== held && i < from) from = i;
    }
    if (i < from) from = i;
  }
  for (; i < n; i += 1) heights[i] = heightOf(display[i]!, i);
  // `from` is at most the shorter of the two arrays, so `previous.offsets[from]` exists whenever `from` is above 0.
  const offsets = new Array<number>(n + 1);
  if (from === 0) offsets[0] = 0;
  else for (let k = 0; k <= from; k += 1) offsets[k] = previous!.offsets[k]!;
  let y = offsets[from]!;
  for (let k = from; k < n; k += 1) { y += heights[k]!; offsets[k + 1] = y; }
  return { offsets, total: offsets[n]!, heights, display, width, expanded, stamp };
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
  // The same displayed-row OBJECT at a position carries the same key, and step 4's bounded form hands the pane the
  // previous projection's prefix itself, so the key comparison starts where the two arrays first hold different objects.
  // The first form mapped both arrays to their keys on every update — two passes over every displayed row, which the
  // 2026-09-29 CPU profile named among the loaded side's extra script (REQ-CHAT-055); the answer is the same.
  const shared = Math.min(before.length, after.length);
  let common = 0;
  while (common < shared && before[common] === after[common]) common += 1;
  while (common < shared && before[common]!.key === after[common]!.key) common += 1;
  if (common === before.length && before.length === after.length) return 'replace';
  if (common === before.length && after.length > before.length) return 'append';
  if (common === after.length && before.length > after.length) return 'truncate';
  // The last displayed row kept its identity and grew, and rows were appended after it: REQ-CHAT-053's fourth shape.
  const last = before.length - 1;
  if (before.length > 0 && common === last && after.length >= before.length && before[last]!.key === after[last]!.key) return 'extend';
  return 'other';
}

/** REQ-CHAT-072: the count is in DISPLAYED rows, grouping-aware, and REQ-CHAT-168 fixes the wording at 0, 1 and many. */
export function newUpdatesLabel(n: number): string {
  return `${n} new ${n === 1 ? 'update' : 'updates'}`;
}
