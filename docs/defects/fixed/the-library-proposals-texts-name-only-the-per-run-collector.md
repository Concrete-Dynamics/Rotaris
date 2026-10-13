## The Library's proposals note and empty label name only the per-run collector, above retrospective rows

The Proposals tab's card note reads "Evidence-backed suggestions from the improvement collector after each run." and its
empty label "No proposals yet. They appear here after a run's improvement collector finds signals."
(`packages/ui/src/library/ProposalsTab.tsx`), REQ-LIBRARY-109's fixed texts. Since `PD-LIBRARY-002` the same card lists
proposals a retrospective authored from the workspace's own history, with no run behind them, so both texts are false of
rows shown beneath them, while the tab's own empty state and the Overview card's hint already name both sources.

Recorded 2026-10-13 by the R-072 consortium's ruling LR1 (OQ-236), whose user-lens advocate found it; repaired by the
bundle that builds that ruling.

## Specs

- REQ-LIBRARY-109's note and empty label.
- `PD-LIBRARY-002` revision 2 (OQ-236), clause (g), which narrows REQ-LIBRARY-109.

## Relevant files

- `packages/ui/src/library/ProposalsTab.tsx` — the two texts.

## Outcome

Repaired 2026-10-13 (plan fin34) under `PD-LIBRARY-002` revision 2's clause (g), ruled as
[OQ-236](../../architecture/open-questions.md#oq-236), which narrows REQ-LIBRARY-109: the note reads "Evidence-backed
suggestions from the improvement collector after each run, and from retrospectives over this workspace's history." and the
empty label "No proposals yet. They appear here after a run's improvement collector finds signals, or after a retrospective
over this workspace's history." (`PROPOSALS_NOTE`, `PROPOSALS_EMPTY_LABEL`). Pinned by
`packages/ui/src/library/retrospective-gesture.test.ts` and by `pnpm retrospective-proof`'s note check in the built app.
