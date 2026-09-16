import { OVERSCAN, ROW_MIN_HEIGHT } from './constants.js';
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
export function estimateHeight(d: DisplayRow, expanded = false): number {
  if (d.shape === 'trailer') return 36;
  // PD-CHAT-004: an activity line is one line, plus the `⤷` preview line it draws while a call is in
  // flight — the same per-line term a collapsed tool row's preview gets below.
  if (d.shape === 'group') return d.inFlight === null ? 36 : 56;
  const row = d.row;
  // REQ-CHAT-062: a collapsed reasoning row draws exactly one summary line, whatever the hidden body holds.
  if (isReasoningRow(row) && !expanded) return ROW_MIN_HEIGHT;
  // PD-CHAT-003: a row sizes to its content — one ~17 px text line per body line, no padding box.
  const lines = row.body === '' ? 1 : row.body.split('\n').length;
  const extra = (row.input !== undefined && row.input !== '' ? 1 : 0) + (row.output !== undefined && row.output !== '' ? 1 : 0);
  return Math.max(ROW_MIN_HEIGHT, (lines - 1) * 18 + extra * 20 + ROW_MIN_HEIGHT);
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
