## A review read for one requirement lands in the pane retargeted to another

`loadReview` (`packages/ui/src/requirements/RequirementsView.tsx`) keeps one flag for "a read is outstanding" and applies
whatever read lands to the pane, whichever requirement the pane now shows. Open the review of REQ-101 (its read goes out),
close the pane and open the review of REQ-102 before that read answers: REQ-TRACE-425 refuses REQ-102's read, correctly, but
when REQ-101's answer lands it is drawn in the pane whose identifier is REQ-102, with the six decisions offered. A decision
taken there is sent for REQ-102 (`decide` acts on the pane's target) against REQ-101's claim, measurement and work. The busy
statement REQ-TRACE-425's refusal drew also stays on screen after the read it waited for has landed. Read from the code
(fin34, reasoning about L12); not observed in a run, since it needs a read slower than closing one pane and opening another.

## Specs

REQ-TRACE-422 and REQ-TRACE-426: a decision is made against the payload of the requirement it relocates; a payload of another
requirement under its identifier is not that. REQ-TRACE-425's refusal of the second read is kept; what it must not do is let
the first read's answer stand in for the second.

## Relevant files

- `packages/ui/src/requirements/RequirementsView.tsx` — `loadReview`, `openPane`, `closePane`, `decide`.
- `packages/ui/src/requirements/panes/ReviewPane.tsx` — the identifier from the pane's target, the payload from the read.

## Outcome

Repaired by fin34 (2026-10-13). The pane's reads are kept by `reviewReads` (`packages/ui/src/requirements/panes/review-reads.ts`):
`ask` still refuses a second read while one is outstanding, whichever requirement it is for (REQ-TRACE-425), and `land` shows
a read's answer only when it is the outstanding read and the pane still targets the requirement it was asked for. A read that
lands for a pane closed or retargeted is discarded: the pane draws no payload and the busy statement is withdrawn, so the
person asks again for the requirement now shown. `openPane` and `closePane` keep the pane's target in a ref the landing reads.
Pinned by `packages/ui/src/requirements/panes/review-reads.test.ts` (a read landing after the pane was opened on another
requirement is discarded; a pane closed before its read landed shows nothing). Not driven in the built app: it needs a read
slower than closing one pane and opening another, which no proof can time.
