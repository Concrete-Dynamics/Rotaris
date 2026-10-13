## The retrospective's start gesture is disabled while any analysis runs, and the palette queues what the buttons refuse

The "Run retrospective" buttons on the Library's Proposals tab (`data-testid="library-retrospective"`) and on the
Overview's proposals card (`data-testid="overview-retrospective"`) are `disabled` whenever `improvementAnalysis.active`
is true, with the tooltip "An improvement analysis is already running." That is true for a post-run analysis too, so a
user who has just finished a run meets a grey button for up to the analyst's 60-second bound. REQ-LIBRARY-125 says "no
control … may be disabled while analysis runs", and ADR-0065 consequence 2 says passes queue on the one FIFO
(REQ-LIBRARY-123). The palette entry (`commands/registry.ts`, `available: always`) raises the same command with no such
check and queues it, so the three surfaces ADR-0065 decision 7 calls one gesture behave differently, and nothing anywhere
refuses a second retrospective while one is already queued or running in the workspace, which reads the same evidence
again and has its proposals discarded by duplicate suppression after spending the tokens.

Recorded 2026-10-13 by the R-072 consortium's ruling LR1 (OQ-236), whose two advocates both found it; repaired by the
bundle that builds that ruling.

## Specs

- REQ-LIBRARY-125, "no control — the send button included — may be disabled while analysis runs".
- REQ-LIBRARY-123's FIFO and ADR-0065 consequence 2 and decision 7.
- `PD-LIBRARY-002` revision 2 (OQ-236), clause (e), which narrows REQ-LIBRARY-125 for the retrospective's gesture.

## Relevant files

- `packages/ui/src/library/ProposalsTab.tsx` — `RETROSPECTIVE_BUSY_REASON` and the Library button's `disabled`.
- `packages/ui/src/OverviewView.tsx` — the Overview button's `disabled`.
- `apps/desktop/src/main/commands/improvements.ts` — the `improvements.retrospective` handler, which refuses nothing.
- `apps/desktop/src/main/improvements.ts` — the coordinator, which publishes no per-workspace retrospective state.
