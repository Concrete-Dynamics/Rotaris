# ADR-0065 — The retrospective: a second analysis pass, user-started, workspace-wide, riding the improvement lifecycle unchanged — Live-run finding L10 — 2026-09-29 (R-067), the indicators' label measured, not only read

Part 7 of 13 of [ADR-0065](../0065-the-retrospective-pass.md), which indexes every part.

## Live-run finding L10 — 2026-09-29 (R-067), the indicators' label measured, not only read

The first execution read both indicators' presence, text and roles. It never read their geometry, and that is where
the first live run found a defect. At 1440 px the run header cut "Reviewing run for improvem" mid-word with no
ellipsis. Decision 8's pattern was built as a Tag with a status dot, but two things kept it from drawing that way.
A `className` given to the design `Tag` replaces the `tag tag-<kind>` foundation, so the indicator was a plain span in
the body type with an unpainted dot. And its label was a bare text node in an inline-flex box, which `text-overflow`
never reaches. Repaired in `ImprovementActivity.tsx` and `shell.css`: the label is its own element and the Tag spells
`tag tag-run`. The run header wraps the label between words, never below its longest word, and the title bar elides
it with an ellipsis. `pnpm retrospective-proof` now measures every word of the run-header label with a Range at
1440 × 900 and at 1000 × 680. Before the repair it failed at both sizes ("cut: improvements…"). After it, 31 of 31
checks pass. The live `ask` scenario shows the post-run label whole on two lines at 1440 px. Notes: the repaired
`../../../defects/fixed/the-improvement-label-is-clipped-without-an-ellipsis.md`, and, recorded without a repair,
`../../../defects/fixed/the-design-tags-kinds-name-classes-the-adopted-stylesheet-does-not-define.md` (repaired
2026-10-01, acceptance A40). Not shown: Windows or
macOS (IC-3 — *corrected 2026-10-14: for the Windows half, a Windows host, which this Linux container is not; IC-3 binds Linux and macOS artifacts*).

*(Added 2026-09-30, the verifier's fix round 1.)* The title-bar label is now measured at the same two sizes too
(`TITLE_BAR_LABEL_GEOMETRY`). It must be whole, or elided on the label element with `text-overflow: ellipsis` in force,
and it must not overflow the indicator or run under the next control. origin/main has no label element, so there the
check would fail at both sizes. It was not run there; that rests on `git grep`. On the repaired build the retrospective label is whole in 282 px at both
sizes, and the proof passes 33 of 33. The call site no longer passes `kind="running"`, which the spelled className
replaced.
