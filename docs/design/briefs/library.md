# Library — brief

**Status:** built 2026-11-10 on the branch `feat/r-097-ui-ux-overhaul` (not landed; the brief and its build are one pass under R-097, so no approval stands between them)
**Written:** 2026-11-10 by `design-ui` (audit; the brief's sections only where R-097 touches the view), for [R-097](../../product/requests.md#r-097)
**Surface:** the Library primary view's Prompts tab; §7 row "Library tabs and cards"; mockup section `LIBRARY`; nearest built code `packages/ui/src/library/PromptsTab.tsx`; theme `rotaris-dim`

An audit with the sections its two items need. Sections 2, 3, 5, 6, 7 and 9 are not written: R-097 changes no journey, content, interaction, string, accessible name or component here.

## 1. Authority

- `REQ-LIBRARY-103`: the title, the search field and the three tabs. `REQ-LIBRARY-104`: the search. Fixed.
- `REQ-SHELL-022`: the minimum window.
- Left open: where a prompt card's actions stand when its list is empty.

## 4. States

| Region | ideal | empty: first use | empty: cleared | empty: no results | filtered | cannot-show | loading | streaming / partial | error | success | disabled | permission-needed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| prompt card's list | rows; the list holds the card's height | `EmptyState` at the size of its sentence, at the top of the list's region, unchanged | same cell | same cell, its sentence unchanged | rows | n/a: prompts are always readable | n/a: read with the view | n/a | n/a | n/a | n/a | n/a |
| prompt card's actions | at the card's foot | at the card's foot, disabled | same | same | at the foot | n/a | n/a | n/a | n/a | n/a | disabled while no row is selected, unchanged | n/a |

## 8. Composition intent

A prompt card's actions take the free space above them, so they stand at the card's foot in every state of the list; the empty state keeps the size of its sentence. *2026-11-10: first written and built as "the empty state takes the region its list takes" — the fault UIR-007 and UIR-016 recorded (a one-sentence panel stretched to 56 % of the view) and `.library__empty`'s `flex: 0 0 auto` had repaired; the critique read it back as UIR-005.*

The page frame is the shared one ([`overview/04-audit-2026-11-10.md`](overview/04-audit-2026-11-10.md)).

Relations: `containment` of the actions in the card (`library-card`, `library-card-actions`).

| Region | 1400×900 | above 1180 | 1180–1080 | below 1080 | 1000×680 |
|---|---|---|---|---|---|
| prompt cards | actions at the foot | same | same | same | same |

## 10. Disagreements and gaps

None.

## 11. Evidence plan

Capture: `pnpm ui-audit --views=6`; drive: `click ".nav-item" --text=Library`, `waitFor "[data-testid=prompts-tab]"`. Rubric rows: F2, C3.

**Must move:** the gap between a prompt card's actions and the card's foot when the list is empty, 406 px at 1440×900 → the card's own padding.
**Must hold:** `ui-audit` view 6 at both sizes: 0 findings; `packages/ui/src/library/library.test.ts`.

## Audit 2026-11-10

**Status:** proposed
**Pack:** `3927eda58823` (the base); `pnpm ui-audit` view 6; drive at 1440×900 with no prompts; theme `rotaris-dim`; by `design-ui`
**Unaudited:** Artifacts and Improvement proposals beyond a free read; a filled list; `nocturne`, `high-contrast`
**Count:** rows answered 3 of 3 asked (F2, C3, C1); no 2 (medium 2); not captured 0
**Summary:** The tabs, the search field and the two cards follow `REQ-LIBRARY-103`. An empty card's actions hang under a small box in the card's upper third and move to the foot when the first prompt arrives.

| # | Criterion | Severity | Observation (with numbers; evidence) | Cause | Bounded change | Executes | Must move (now → passes) | Must hold | Answers to |
|---|---|---|---|---|---|---|---|---|---|
| 1 | F2 | medium | with no prompts each card's actions stand 135 px from the card's top and 406 px above its foot, under an empty state of 164×84 px in a 573 px card (`6-library.png`; drive) | `.library__empty { flex: 0 0 auto }`, where the list it replaces is `flex: 1` | the empty state takes the list's region (§8) | debug-ui | gap to the foot 406 px → the card's padding | view 6: 0 findings | §4, F2 |
| 2 | C1 | medium | the three tabs are drawn in Arial at 12 px, the only controls of the view outside the adopted faces (drive, `getComputedStyle`; found while building item 1) | the design `Tabs` draws each tab as a `button`, which does not inherit its face, and the adopted `.tab` names none | the tab inherits the face and keeps the adopted size and weight | debug-ui | controls outside the adopted faces 3 → 0 | the adopted `.tab`'s size and weight | §1.4, C1, UIR-005 |

### Taste
- "Use and remove" is the filled control of a card whose list is empty.

### Deliberately left
- Which of "Use" and "Use and remove" is filled (§1.7): a choice for the Library's own brief.

### Open-question candidates
- None.

## Execution 2026-11-10

By `debug-ui`, on `feat/r-097-ui-ux-overhaul`. Evidence: `pnpm ui-audit` at both sizes (0 findings); a drive at 1400×900 with no prompts.

| # | Must move | Before | After | Must hold |
|---|---|---|---|---|
| 1 | the gap between a prompt card's actions and the card's foot, list empty | 406 px (135 px from the card's top) | 17 px, the card's padding and hairline; the empty state is the size it was (164×84 px) | view 6: 0 findings — held |
| 2 | controls outside the adopted faces | 3 (Arial) | 0 (`Manrope`) | the tabs' size and weight — held |

Not driven: a filled list; Artifacts and Improvement proposals.

## Critique 2026-11-10

The critique is the independent, report-only `review-ui` reading of the pack `9401038db662/iteration-1` (18 findings: 4 high, 7 medium, 7 low; `critique.json` is not committed, `.ui-review/` being ignored). A finding repaired here is `implemented`, not `verified-resolved`: that takes a fresh pack read in a fresh context.

| Finding | Severity | What it read | Outcome |
|---|---|---|---|
| UIR-005 | medium | the first build's empty states took 56.1 % of the view at 1400×900 (438×473 and 698×473 px) to hold one sentence each, 2.9 % before | implemented: the actions are pinned instead and the empty state is message-sized again |
