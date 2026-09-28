import { projectDisplay, type ProjectOptions } from './project.js';
import { placements } from './Row.js';
import type { DisplayRow } from './types.js';

/**
 * ADR-0046 step 4, run ONCE per change of its inputs rather than once per render (REQ-CHAT-055, REQ-CHAT-154).
 *
 * The R-048 measurement round traced the built app appending to an empty transcript and to one of 1,200 rows
 * (`docs/defects/appending-at-1200-rows-costs-two-to-three-times-an-empty-transcript.md`). The main thread's extra
 * time at depth was **script**, not layout, paint or the observer pass: every increment causes three to four
 * synchronous React renders of the pane — the increment's own, the measurement pass's (`measuredVersion`), the tail
 * pin's scroll event (`scrollTop`), and any whole-session update arriving beside it — and each of those renders
 * re-ran the whole-state projection and `placements` over every resident row, although only the first of them had
 * new rows to project. One projection is about a millisecond at a thousand rows (`append-cost.test.ts`); three or
 * four of them per increment, over a burst of thirty increments that arrive faster than they can be shown, is the
 * time the earlier rounds could not find, because each of them looked at one render.
 *
 * So the projection is keyed on what it reads. `rows` and `expanded` are compared by identity, which is sound because
 * the replica replaces a changed `rows` array rather than mutating it (`ui-core/replica.ts`) and the pane rebuilds
 * `expanded` only when the reader's overrides or the reasoning preference change. The two pending lists are compared
 * element by element, because the view hands the pane `session.pendingApprovals ?? []` — a fresh empty array on every
 * render that has none — and a key that changed identity without changing content would project on every render
 * exactly as before. `caps` is four values and is compared as four values. The booleans and the agent name are
 * values. A projection with identical inputs is identical by construction (step 4 is pure and reads no clock), so
 * nothing about WHAT is projected changes here; only how often.
 *
 * And when the rows alone changed, the one projection that does run is the BOUNDED one ADR-0046 step 4 has had from
 * its first line — `{ previous, from }`, from the earliest-changed row back to the nearest clean cut — with `from`
 * read off the two arrays (`changedFrom`) rather than threaded across the seam. The earlier round measured that form
 * at a third of the whole-state cost at 1,200 rows and declined it for buying "0.6 ms of a 47 ms gap"; under a burst
 * that multiplies every per-increment millisecond by the queue in front of the sample, it is worth having. It is
 * taken only where it projects what the whole-state form projects — an append, or a row replaced at its own index —
 * and `projector.test.ts` holds it to that over a seeded walk of every shape the pane can be handed, including a
 * removal, a scope switch and a run member changed in place (R-062's fix round 1 found the first two taken wrongly
 * here and the third in step 4 itself).
 */
export interface Projection {
  readonly display: readonly DisplayRow[];
  /** REQ-CHAT-057 / REQ-CHAT-067: the two neighbour facts, once per projection (`placements`). */
  readonly places: ReturnType<typeof placements>;
}

export interface Projector {
  /** The projection of `o` — the previous one when nothing it reads has changed, a fresh one otherwise. */
  project(o: ProjectOptions): Projection;
  /** How many times the projection has actually been computed, and how many of those were bounded to a suffix. Verification only. */
  readonly projections: number;
  readonly incrementals: number;
}

/** The one projection function, in both of its forms: whole-state, and bounded to the suffix from a row index. */
export type ProjectFunction = (o: ProjectOptions, incremental?: { readonly previous: readonly DisplayRow[]; readonly from: number }) => DisplayRow[];

/**
 * The inputs step 4 reads, by how each is compared: `rows` and `expanded` by identity (in `sameInputs` and
 * `sameButRows`), the lists element by element, the rest by value. An input absent here would be a change the memo
 * cannot see.
 */
const LIST_KEYS = ['pendingQuestions', 'pendingApprovals'] as const;
const VALUE_KEYS = ['running', 'groupTools', 'showReasoning', 'questionAgent'] as const;
const CAP_KEYS = ['show_tool_results', 'show_tool_inputs', 'tool_result_lines', 'tool_input_lines'] as const;

function sameList(a: readonly unknown[], b: readonly unknown[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

/** Whether everything but `rows` is the same input. */
function sameButRows(a: ProjectOptions, b: ProjectOptions): boolean {
  if (a.expanded !== b.expanded) return false;
  for (const key of LIST_KEYS) if (!sameList(a[key], b[key])) return false;
  for (const key of VALUE_KEYS) if (a[key] !== b[key]) return false;
  for (const key of CAP_KEYS) if (a.caps[key] !== b.caps[key]) return false;
  return true;
}

function sameInputs(a: ProjectOptions, b: ProjectOptions): boolean {
  return a.rows === b.rows && sameButRows(a, b);
}

/**
 * The earliest-changed ROW INDEX between two inputs whose only difference is `rows`, or null when the change is not
 * one step 4's bounded form can take, so the whole window is projected instead.
 *
 * The replica upserts by index and keeps every untouched row OBJECT (`ui-core/replica.ts`), so the first position at
 * which the two arrays hold different objects is where the update began — the same fact `earliestChanged` carries on
 * the wire, read back from the arrays rather than threaded across the pane's seam as a prop.
 *
 * The bounded form reuses every previously displayed row whose index is below the cut, so it is sound only when the
 * rows below the cut are the same rows in both arrays. That holds for exactly two shapes of the first differing
 * position `i`: it lies past the previous end (an append), or it holds the SAME row index in both arrays (a row
 * replaced in place — a growth tick, a settle — whatever follows it). Everything else projects the whole window:
 *  - a different row index at `i` — a row REMOVED there (the next array's row at `i` is a later one: an increment
 *    carrying a removal, or REQ-CHAT-069's scope switched from one agent to another, whose rows the pane receives as
 *    `scopedRows` of the same window) or a row INSERTED there (the scope widened to "All activity"). The first form
 *    of this function returned the next array's index here, and the bounded form then kept the removed row: an
 *    agent's row drawn inside another agent's scoped transcript (fix round 1 of R-062, `projector.test.ts`);
 *  - nothing left at `i` (a truncation), and a change reaching position 0 (older rows paged in above — REQ-CHAT-165 —
 *    or a reset);
 *  - any other input changing (the previous projection is not one of these rows under these inputs).
 */
export function changedFrom(prev: ProjectOptions, next: ProjectOptions): number | null {
  if (!sameButRows(prev, next)) return null;
  let i = 0;
  while (i < prev.rows.length && prev.rows[i] === next.rows[i]) i += 1;
  if (i === 0 || i === next.rows.length) return null;
  if (i < prev.rows.length && prev.rows[i]!.index !== next.rows[i]!.index) return null;
  return next.rows[i]!.index;
}

export function createProjector(project: ProjectFunction = projectDisplay): Projector {
  let last: { readonly options: ProjectOptions; readonly projection: Projection } | null = null;
  let projections = 0;
  let incrementals = 0;
  return {
    project(o) {
      if (last !== null && sameInputs(last.options, o)) return last.projection;
      const from = last === null ? null : changedFrom(last.options, o);
      const display = from === null ? project(o) : project(o, { previous: last!.projection.display, from });
      projections += 1;
      if (from !== null) incrementals += 1;
      last = { options: o, projection: { display, places: placements(display) } };
      return last.projection;
    },
    get projections() { return projections; },
    get incrementals() { return incrementals; },
  };
}
