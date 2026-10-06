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

This is **not** a recurrence of [`the-bounded-projection-strands-a-run-whose-member-changed-in-place.md`](fixed/the-bounded-projection-strands-a-run-whose-member-changed-in-place.md)
or [`the-bounded-projection-reads-runs-on-rows-hygiene-drops.md`](fixed/the-bounded-projection-reads-runs-on-rows-hygiene-drops.md):
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
