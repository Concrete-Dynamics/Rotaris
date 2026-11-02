## A row settled below the last is published without the rows after it, so the view drops them

The projection owner publishes every committed row as an increment whose earliest-changed index is that row's and whose
rows are **that row alone** (`ProjectionOwner.onCommitted`: `publishIncrement(c.row.index, [c.row])`). REQ-MONITOR-214
says an increment carries "the lowest row index whose content may still change, the rows from that index onward", and
the replica applies it so (`ui-core/src/replica.ts` `projectIncrement`: the rows held below the index are kept and the
increment's rows replace everything from it). For an append, and for the settle of the last row, the two agree. When
agents interleave they do not: a row that settles **after another agent appended rows behind it** is published alone,
and the replica drops every row after it. The rows are in the store and were each published once (their own append and
settle events), but the view no longer holds them, and nothing re-sends them until the surface attaches again.

Live-run finding: H5 of the final duress autopsy at `27a5127` (2026-10-06), "draw an ended child's run as its first row
only". The autopsy left the mechanism unverified; replaying the run's stored `transcript.row` events through the
publisher's single-row increments and the replica's rule reproduces the screen exactly.

This is **not** a recurrence of [`the-bounded-projection-strands-a-run-whose-member-changed-in-place.md`](the-bounded-projection-strands-a-run-whose-member-changed-in-place.md)
or [`the-bounded-projection-reads-runs-on-rows-hygiene-drops.md`](the-bounded-projection-reads-runs-on-rows-hygiene-drops.md):
those were the renderer's bounded projection drawing something other than the whole-state projection of the rows it
held. Here the projection is right about what it is handed; the rows were never handed to it. Fed the run's exact event
order (the child's row appended unsettled, the coordinator's `wait_for_tasks` row appended running, the child's row
settled in place, the child's further rows appended, the wait settled), the projector draws every row it holds, bounded
or whole.

## Specs

- REQ-MONITOR-214: the increment carries "the rows from that index onward"; "every row before that index is untouched
  by the update". The publisher sends one row where the requirement asks for every row from it on.
- REQ-EVENTS-052 (upsert by index) and REQ-CHAT-052 (the transcript never shows rows that disagree with the session
  record): 89 recorded rows were not shown.
- PD-CHAT-004 revision 2 ("a run is bounded by its agent alone"; "a later member SHALL lengthen that line where it
  already stands"): the child's run drew its first member alone because its later members had left the replica.

## Evidence

Pack `.live-run/runs/2026-10-06T01-47-53-900Z/` (the live worktree; git-ignored), duress session `5a8e7446`, against the
self-hosted endpoint.

- `duress/duress.mid.png` (about 02:42:05, All activity): "02:15:22 CODING-AGENT wave3-verify-resu… ▸ reasoning · 1s ·
  ~26 tok" — row 492 alone (1,709 ms, 106 characters) — then "02:36:46 ORCHESTRATOR", which is row 584.
- `workspace.db`, `transcript_rows`: the child's rows 494 to 582 (50 tool, 39 thinking) are recorded; rows 484 to 491,
  493 and 583 are the coordinator's run, 483 and 584 its prose.
- `workspace.db`, `events` (`transcript.row`, in ordinal order): 491 appended (1869), 492 appended unsettled (1870), 491
  settled (1871), 493 appended running (1873), 492 settled (1876), 494 appended (1878), … 582 settled (2241), **493
  settled at 02:36:44.087 (2248)**, 583 and 584 appended. Each settle below the last held row drops what follows it:
  1871 drops 492, 1876 drops 493, and 2248 drops 494 to 582. Replayed through the replica's rule up to the screenshot's
  instant, the view held **130 of 630 rows**, 492 and 493 the only ones of 492 to 582; 80 publications dropped rows,
  the largest the wave-2 wait's settle at 02:14:46.784 (156 rows) and the wave-3 wait's (89).

## Relevant files

- `packages/engine/src/projection-owner.ts` — `onCommitted`, the single-row publication; `grow`, `markStalled` and
  `flushPending` already publish every held row from the changed index.
- `packages/ui-core/src/replica.ts` — `projectIncrement`, REQ-MONITOR-214's rule on the receiving side (correct).
- `packages/ui/src/transcript/project.ts`, `projector.ts` — the projection the finding first suspected (correct here).

## Repaired — 2026-10-06 under fin19

`ProjectionOwner.onCommitted` publishes the held rows from the committed row's index onward (`rowsFrom`), walking the
indices from that row to the highest held (`highestHeld`, kept by `hold` and reset where the held rows are cleared), so an
append or the last row's settle is still one row and costs what it did, and a settle below the last carries what follows
it. Pinned by:

- `packages/engine/src/projection-owner.test.ts`, "the duress run's order — the child's row settled under the
  coordinator's wait, the wait settled under the child's rows — leaves the view holding every recorded row", which applies
  each publication by REQ-MONITOR-214's rule and checks the view after every one; and "an append, and a settle of the
  last row, still publish that one row". Both fail on the single-row form (the first after the publication from row 4:
  `[0, 1, 2, 4]` held where `[0, 1, 2, 3, 4]` were recorded).
- `packages/ui/src/transcript/projector.test.ts`, "a child's row settled under the coordinator's running wait, then the
  child's further rows, then the wait settled — every row drawn": the projector's half of the chain, fed the run's exact
  order through the replica's `projectIncrement`, draws the child's run as one line holding every row, bounded and whole
  alike. It passes on both forms of the publisher — the projector was never the fault — and stands as the guard the
  finding asked for.
- `pnpm transcript-proof`'s stage 3d (`interleave`): two scripted children each hold `sleep 2.5` open while the other
  appends, so ten rows settle below a later one. On the build without the repair the replica held **16 of 31** recorded
  rows (missing 6 to 8, 10 to 14, 16 to 20, 22 and 23); with it, all 31 in their recorded form (load 4.2 to 5.3 on 4
  CPUs, two other plans on the host).

## The declined increment at run start (fin21, 2026-10-06, a verifier's question)

fin19's verifier saw the renderer's replica warn "declined increment … earliest-changed 2 precedes oldest held 3" at the
start of every interleave launch, and recover through REQ-SESSION-161's reconcile. Why the replica can hold from row 3
without rows 0 to 2, read from the code (`packages/ui-core/src/replica.ts`, `apps/desktop/src/main/commands/session.ts`,
`packages/engine/src/projection-owner.ts`):

- A window that starts a session follows it (`follow`, rows emptied, no expectation), and `session.subscribe` subscribes
  the window to the relay **before** it asks the run host to attach. Between the two, the run's own publications already
  reach the window: a whole-session update (a status save, or a record tick) sets the replica's expectation, and the next
  live increment is applied to an empty replica. In the verifier's launches that was row 3, appended behind row 2 while
  row 2 was still unsettled (which rows those were is not in the warning; the stage's run starts with the coordinator's
  delegation calls), published as `earliestChanged 3, [3]`. The replica then holds `[3]` alone; rows 0 to 2 were published
  before it followed, or before an update gave it an expectation (an increment with none is dropped).
- When row 2 settles inside that window (`earliestChanged 2`, carrying 2 and 3 since the repair above), 2 is below the
  oldest row held and not 0, so the replica declines it and asks for a reconcile, which is the warning seen.

Would a run with **no** settle below its first held row leave the replica so? **No.** The attach that follows every
relay subscription publishes the whole-session update and then the resident transcript from the lowest index held
(`ProjectionOwner.attach`: 0 for a session whose rows are all resident), stamped after the live publications on the same
sequence and delivered in order, so the replica replaces everything from 0 within the subscribe's round trip whether or
not anything declined. The decline only surfaces the window when a settle below lands inside it; the attach closes it
regardless. A window that never paged its top in would in any case fetch the older span when the pane reaches its top
(`session.pageOlder`, REQ-CHAT-165), which a short transcript does at once. No defect note is owed.

Measured on this branch (base `9e2b9b3`, which includes `29c3047`, where `session.start` began marking the starting window's
follow before the run host is asked): three interleave launches (`pnpm transcript-proof --only=interleave --skip-build`, as
root under Xvfb, load 6.9 to 12.2 on 4 CPUs with another plan's agents on the host) each ended with the replica's counters
at `declined 0`, `dropped 0`, `refused 0`, holding all 31 recorded rows with `oldestIndex 0` and `reachedOldest true`. The
warning was not reproduced here, so whether `29c3047` narrowed the window or the verifier's launches met it by timing is not
known; the reasoning above holds either way.
