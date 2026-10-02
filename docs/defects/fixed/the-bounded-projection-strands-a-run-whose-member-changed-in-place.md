## The bounded projection strands a run whose member changed in place

ADR-0046 step 4's bounded form (`projectDisplay(o, { previous, from })`) walks back from `from` to a clean cut and
reuses every previously displayed row that lies wholly below it. `cleanCut` reads the runs of the NEW rows. When a row
that joined a previous run is replaced at its own index by one that no longer joins it — a tool row become prose, in the
case the test pins — the new rows have no run crossing the cut, so the cut stays at the replaced row; but the PREVIOUS
display still holds a group reaching from below the cut to it. The prefix stops before that group, and the suffix is
re-projected from the cut, so the group's members below the cut are drawn by neither: at rows `[user 0, tool 1, tool 2]`
with row 2 replaced by prose, the bounded form displayed `[row 0, row 2]` where the whole-state projection displays
`[row 0, row 1, row 2]`.

On `main` no surface reached the bounded form — the pane projected the whole window on every render — so the fault was
latent. R-062's change made the pane take the bounded form (`projector.ts`), and its fix round's seeded walk found this
alongside the removal the verifier reported.

## Specs

ADR-0046 step 4 ("re-projecting from a clean cut reproduces every displayed row from it onward, and no displayed row
before it, which is exactly what makes the caller's previous prefix reusable") and REQ-CHAT-154 (update cost proportional
to what changed — which a bounded form buys only if it projects what the whole form projects). The row lost is a run
member PD-CHAT-004 folds into the activity line.

## Relevant files

- `packages/ui/src/transcript/project.ts` — `projectDisplay`'s bounded branch, after the prefix cut.
- `packages/ui/src/transcript/projector.ts` — the pane's caller of the bounded form since R-062.
- `packages/ui/src/transcript/projector.test.ts` — the case and the seeded walk that pin it.

## Repaired — 2026-09-28 under R-062

When any previously displayed group at or after the prefix cut begins below the boundary, the bounded form cannot take
the change and projects the whole window instead (`startRow = 0`, no prefix). An append or a settle never meets it —
their previous runs are still held by the new rows, so `cleanCut` already moved below them — so the per-increment saving
the round measured is untouched. Pinned by `projector.test.ts`'s "a run member replaced in place by a row that no longer
joins the run" case and by its seeded walk (600 steps of appends, settles, kinds changed in place, removals through
`projectIncrement`, scope switches through `scopedRows`, truncations and paged-in rows, each compared to the whole-state
projection); with the guard removed both fail (the walk at step 241). Found and repaired in R-062's fix round 1.
