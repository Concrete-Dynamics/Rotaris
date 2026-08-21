---
req-id: SWR-3321
status: approved
trace: required
test: required
title: "Columns fold to a rail, and stay how the user left them"
type: product
epic: SWR-3300
date: 2026-08-19
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3321 — Columns fold to a rail, and stay how the user left them

Every column the board draws is the same width whether or not anything is in it,
and the board is only ever as wide as the window it has to fit (SWR-3302). Both
halves of that hurt, in different places.

The closed axes — delivery, health, lifecycle, priority — always emit every
value they have, empty or not (SWR-3318). On the delivery axis of a project that
has just adopted Rotaris that is six of seven columns holding nothing, because
everything is `Backlog`; measured over this repository's own 1533 requirements it
is exactly that. The one column with the work in it gets a seventh of the window.

The open axes have the opposite problem. Grouping the same store by epic produces
36 columns, every one of them populated, and reaching the last means scrolling
past 35. Nothing there is empty, so nothing folds itself — what the user needs is
to fold the ones they are not working in, once, and have them stay folded.

Requirement: a column with no card in it is **folded** — reduced to a narrow rail
carrying its heading and its count — and folding is also a choice the user can
make and unmake on any column.

- **Empty folds itself, and it keeps answering.** A column nobody has folded or
  unfolded by hand is folded exactly while it is empty, re-read on every board
  update. A card can therefore never arrive into a column that stays hidden.
- **Except on a board whose pipeline has never been used.** Folding follows
  emptiness one column at a time, and on a board where *no* card has ever left
  the first column that rule folds the entire workflow at once: every downstream
  column is empty, so every one of them becomes a rail, and the first thing a new
  project shows is a wall of rails with nothing to aim a card at.
  That is the one case where emptiness is not the useful signal — it says "this
  has not started" rather than "you are not using this" — so a board on which
  nothing has ever entered the pipeline opens with the pipeline visible. It is a
  first-run exception and nothing more: the moment any card enters the pipeline,
  empty columns fold exactly as above, and a fold the user made by hand outranks
  this too.
- **The heading is the control.** Clicking a column's heading folds it; clicking
  the folded rail unfolds it. There is no separate button, and no gesture that
  only a mouse can make (SWR-3314).
- **A hand-made choice outranks emptiness**, in both directions and for as long
  as it stands: a column the user folded stays folded once it has cards, and one
  they unfolded stays unfolded while it is empty.
- **A folded column still states itself.** The rail carries the same heading and
  count as the open column, and an empty one carries the sentence saying what
  belongs there (SWR-3302), so folding hides cards and never meaning.
- **The rail is read on the same axis as the rest of the board.** Its heading is
  upright, not turned on its side. Rotated text is slower to read and it defeats
  screen magnification, which pans in one direction while the text runs in the
  other (SWR-3314) — and a rail is the one thing on the board a user has to read
  *before* deciding to open it. A heading too long for the rail's width wraps and
  then elides, carrying the whole of itself on the tooltip and the accessible
  name; it does not turn sideways to fit.
- **Every axis folds**, delivery included, because emptiness means the same thing
  on all of them (SWR-3318).
- **Folding is display only.** It moves no card, writes no delivery record and
  changes no count.
- **A drag reaches a folded column.** While a dragged card hovers one it unfolds,
  so the drop target and the reason it is or is not reachable are visible
  (SWR-3601, SWR-3602); it folds back when the drag ends.
- **And a folded column is aimable before it is hovered.** Every rail states its
  answer as soon as a card leaves its column, not only the one already under the
  pointer — a target a user has to find before it appears is not a target. It
  states it in the engine's own words (SWR-3602) and takes the width to show
  them for as long as the drag lasts: a glyph alone says "no" without saying
  why, and moving the reason to a tooltip would put it where only a pointer or a
  screen reader can reach it. The width is given back when the drag ends.
- **The folds are remembered per workspace.** Unlike the filter, the sort order
  and the grouping axis — which SWR-3309 and SWR-3318 keep globally, because they
  are a property of the person — which columns are worth seeing follows from what
  the project contains, so a fold recorded in one workspace does not reach
  another.

## Acceptance criteria

- A board whose `Ready` and `Review` columns are empty opens with both folded and
  the rest open, on the delivery axis and on every other — once anything has
  entered the pipeline.
- A board on which no card has ever left the first column opens with its pipeline
  visible rather than folded to rails; as soon as one card has entered it, the
  empty columns fold as above.
- Clicking a heading folds that column; clicking the rail unfolds it; neither
  writes a delivery record.
- A folded column that gains its first card is open on the next board update,
  unless the user folded it themselves.
- A folded rail states its heading, its count and — when it is empty — what
  belongs in it, with the heading upright rather than rotated.
- While a card is being dragged, every folded column states in words whether it
  is reachable, and is wide enough to read them; both revert when the drag ends.
- A folded column holds no realised card widget, so folding a store-sized board
  costs less than showing it.
- The folds a user leaves in one workspace are the folds it opens with next time,
  and a second workspace opens with its own.
- The board is still usable at 1000×680 with no clipped rail text.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | The fold of a column follows emptiness until a user decides, then follows the decision; a stored fold set this build cannot read is refused; a pipeline nothing has moved through is read as unused | Fold model and its settings round trip | `apps/rotaris/tests/test_requirements_board.py` |
| Integration | A first-run board shows its pipeline, and folds the empty columns once work has moved into it | Board projection → board widget | `apps/rotaris/tests/test_requirements_board.py::test_a_first_run_board_shows_its_pipeline_and_folds_it_once_work_moves` |
| Integration | A rendered board folds its empty columns, realises no card inside one, unfolds on a click, and restores the folds recorded for that workspace and no other | Board projection → board widget → settings | `apps/rotaris/tests/test_requirements_board.py` |
| User-flow E2E | A user groups by epic, folds a column they do not care about, quits Rotaris and reopens it to the board they left | Public product boundary → user-observable result | `apps/rotaris/tests/test_requirements_fold_e2e.py` |
| Unit | The heading and the rail carry accessible names, the rail takes focus and works from the keyboard, and folding strands no focus | Board widgets | `apps/rotaris/tests/test_requirements_a11y.py` |

Epic: [Requirement Board UI](../3300-requirement-board-ui.md)
