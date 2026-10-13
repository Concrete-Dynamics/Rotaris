## PD-LIBRARY-002 reaches further requirements its disposition block does not name

The ruling on OQ-222 (BP1, R-072) entered the four requirements that `PD-LIBRARY-002`'s back-pointers already marked
(REQ-MONITOR-173, REQ-WORKSPACE-041, REQ-LIBRARY-017, REQ-NOTIFY-251) into its Extends line, and left these further
candidate reaches to a note of their own because their verbs are arguable. Each carries neither a note nor a
disposition on the branch that built the ruling:

- **REQ-LIBRARY-011** — the artifact container's `source_session_id`; a retrospective artifact holds no single source
  session and stores it null (ADR-0065 decision 2; `packages/contracts/src/improvements.ts`), which the container's
  field list does not contemplate.
- **REQ-LIBRARY-020** — the parser backfills each evidence entry's `source_session_id` "with the current session id";
  a retrospective has no current session.
- **REQ-LIBRARY-125, REQ-LIBRARY-126, REQ-NOTIFY-250** — the two activity indicators carry the fixed label "Reviewing
  run for improvements…"; the directive has the retrospective signal its activity "per the pattern of REQ-LIBRARY-125
  with its own label" (`packages/ui/src/ImprovementActivity.tsx`).
- **REQ-LIBRARY-128** — the proposals card's header holds the tag and "Open in Library →"; the retrospective's start
  gesture sits beside them (`packages/ui/src/OverviewView.tsx`, `data-testid="overview-retrospective"`).
- **REQ-LIBRARY-130** — the card's empty-state hint is fixed as "Run improvement analysis to produce reviewable
  suggestions."; the card shows "Run improvement analysis, or a retrospective over this workspace's history, to produce
  reviewable suggestions." (`packages/ui/src/OverviewView.tsx`).
- The palette command and the Library tab where the retrospective's gesture also sits (the directive's "explicit
  gesture on a desktop surface"), whose requirements enumerate their commands and controls.

Which of these is Narrows and which Extends is the directive owner's reading, not this note's; the repair is a
disposition line and a back-pointer per requirement, never an edit of a requirement's text.

## Specs

- `docs/product/README.md`, "The back-pointer, in place", and the third execution's lesson that a directive's
  dispositions name the requirement that defines the surface its behaviour lands on.
- REQ-LIBRARY-130's empty-state hint, which the built card's text departs from.

## Relevant files

- `docs/product/directives.md` — `PD-LIBRARY-002`'s disposition block.
- `docs/spec/14-library-artifacts-improvements.md`, `docs/spec/19-notifications-errors-recovery.md` — the
  requirements.
- `packages/ui/src/OverviewView.tsx`, `packages/ui/src/ImprovementActivity.tsx`,
  `packages/contracts/src/improvements.ts` — what the build shows and stores.

## Outcome

Settled 2026-10-13 by [OQ-236](../../architecture/open-questions.md#oq-236), ruled under the owner's delegation
([R-072](../../product/requests.md#r-072)). `PD-LIBRARY-002` revision 2 Narrows REQ-LIBRARY-011, REQ-LIBRARY-020,
REQ-LIBRARY-109, REQ-LIBRARY-124, REQ-LIBRARY-125, REQ-LIBRARY-130 and REQ-NOTIFY-250, each case stated in its clauses (a)
to (g), and adds REQ-LIBRARY-126 and REQ-LIBRARY-128 to its Extends line; each requirement carries its labelled
back-pointer, which `tools/symbol-artifact/back-pointers.test.ts` reads both ways. The palette command, REQ-LIBRARY-127 and
REQ-LIBRARY-174 take no disposition. The built hint of REQ-LIBRARY-130 is ratified as the directive's clause (f). The two
behaviour repairs the ruling made are the notes beside this one in `fixed/`:
[`the-retrospective-start-gesture-is-disabled-while-any-analysis-runs.md`](the-retrospective-start-gesture-is-disabled-while-any-analysis-runs.md)
and [`the-library-proposals-texts-name-only-the-per-run-collector.md`](the-library-proposals-texts-name-only-the-per-run-collector.md).
