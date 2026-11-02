## A review pane retargeted while a read was outstanding is left with nothing to show

The Review pane opened on one requirement starts a read; opened on another while that read is outstanding, the second read is
refused (REQ-TRACE-425) and the pane says it is busy. When the first read lands it is discarded, never drawn under the second's
identifier (fin34's repair), and the pane is left with no payload, no busy statement and no control inside it that reads the
requirement it now shows: the person has to close the pane and press Review again. By then no read is outstanding, so starting
the read the pane was retargeted to would keep REQ-TRACE-425. Found by fin34's review (`review:defects-and-optionals#1`);
recorded by fin36 before the repair.

## Outcome

Repaired 2026-10-13 (fin36). The pane's read ledger remembers the requirement whose read it refused while another was
outstanding, and `owed(target)` hands it back once that read has landed, when the pane (still the Review pane) shows that
requirement and the landed read was not already its own; `RequirementsView` starts it then. Nothing is outstanding at that
moment, so REQ-TRACE-425's refusal still holds. Pinned by `review-reads.test.ts` ("the read refused while another was
outstanding is owed once that one lands", red before: `owed` did not exist). Not driven in the built app: no proof times a
second Review press against an outstanding read.

## Specs

- REQ-TRACE-424 (the pane shows the review of the requirement it is opened on) and REQ-TRACE-425 (a second read asked while one
  is outstanding is refused rather than started); no requirement says the refused read is never taken once the first lands.

## Relevant files

- `packages/ui/src/requirements/panes/review-reads.ts` — the pane's read ledger (`ask`, `land`).
- `packages/ui/src/requirements/RequirementsView.tsx` — `loadReview`, which discards the landed read and stops there.
