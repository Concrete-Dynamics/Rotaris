# Requirements board — brief

**Status:** built 2026-11-10 on the branch `feat/r-097-ui-ux-overhaul` (not landed; the brief and its build are one pass under R-097, so no approval stands between them)
**Written:** 2026-11-10 by `design-ui` (brief, then audit), for [R-097](../../product/requests.md#r-097)
**Surface:** the Requirements primary view's header, board body and foot; §7 row "Requirements board, review, new requirement"; mockup section `REQUIREMENTS`; nearest built code `packages/ui/src/requirements/RequirementsView.tsx`; theme `rotaris-dim`

The brief covers the view's frame: its header rows, the place of its standing statements, and its empty states. Cards, columns, panes, the detail panel and every string stay as built.

## 1. Authority

- `REQ-TRACE-232`, `REQ-TRACE-233`: the columns and their order. Fixed.
- `REQ-TRACE-342`: one re-evaluation control, in its words. `REQ-TRACE-345`, `REQ-TRACE-346`: the board states what the pass left unjudged and that change analysis is off. `REQ-TRACE-507`: the subscription's statement. All four strings are fixed (`requirements/model.ts`) and stay visible; none is shortened, folded or moved behind a control.
- `REQ-TRACE-240`: the blocked summary above the columns, reachable without scrolling a column.
- `REQ-SHELL-022`: the minimum window.
- Departures from the mockup: none made here.
- Left open:
  - how the header's rows share its width;
  - where an empty state stands in the board body, and what the body does when it is shorter than the empty state.

## 2. Journeys that cross it

- **See where delivery stands** (04 §4, "review what was delivered"). When a run finished, I want to see which requirements moved, so that I know what to review. Entry: the rail. Steps: read the columns. Wait: "Reading the board…", bounded by the projection read. Trust point: "Evaluated …" beside Re-evaluate. Recover: Re-evaluate.
- **Start with no requirements.** When the workspace has no requirement source, I want to be told what to place where. Steps: read the empty state; act outside the view; Re-evaluate.
- Several agents: a card's in-flight tag, unchanged.

## 3. Content model and hierarchy

Regions, top to bottom: header (title row; controls row; move row; filters row when shown; the analysis statement; inline errors), blocked summary, adoption strip, board body, foot. The primary is the board body: the header exists to steer it.

Difficult data: 1000×680 with a persistent notice open, which leaves the view 513 px; the filters row shown; nine columns.

## 4. States

| Region | ideal | empty: first use | empty: cleared | empty: no results | filtered | cannot-show | loading | streaming / partial | error | success | disabled | permission-needed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| board body | columns, unchanged | `EmptyState` `req-empty-source` or `req-empty-store`: stands at the top of the body, inside it; the body scrolls when shorter | n/a: a board is not cleared | "No requirement matches the filter" with Clear, unchanged | columns, unchanged | `req-error`, placed as the first-use cell | "Reading the board…", unchanged | n/a: a pass replaces the board whole | inline line in the header, unchanged | n/a: the board is the result | n/a | n/a |
| header | rows of §8 | same | n/a | same | filters row shown | same | New requirement disabled, unchanged | n/a | parse errors list, unchanged | "Evaluated …", unchanged | as built | n/a |

## 5. Interaction

Nothing changes: the DOM order of the header's controls, and so the Tab sequence, stays.

## 6. Copy

No string is written or changed.

## 7. Accessibility obligations

- `REQ-SHELL-144`..`168`, hit targets: no control may be covered by another box (`ui-audit`'s `STACKING`).
- The statements keep their roles: the analysis statement and the foot are static text; `req-reading`, `req-notice` keep `role="status"`, errors `role="alert"`.

## 8. Composition intent

Density tier: dense, from the mockup's `REQUIREMENTS` section — the header steers, the board holds the height.

Under the title row the header holds one wrapping line of two items: the rows that steer the board (controls, move, and the filters when shown), which ask for two measures, and the analysis statement, which asks for one and is top-aligned with the controls row. The statement stands beside the rows wherever the header holds three measures and the gap between them, and returns under the rows where it does not; no breakpoint is written. Beside the rows it is one to two measures wide; under them it takes two. The inline errors keep the header's whole width. *2026-11-10, while building: first written as a two-column grid behind a media query, which `tools/check-ui-language.mjs` counted as two new pixel literals; the wrapping line decides from the tokens alone.*

The board body bounds its empty state: the state stands at the body's top with `--rt-space-4` above it, and the body scrolls vertically when it is shorter than the state.

Relations (published on the header, `req-header`): `containment` in the primary view; `viewport-scroll` on the x axis, expected false (`REQ-TRACE-489`). The adoption strip's controls are held by `ui-audit`'s `STACKING` sweep. *2026-11-10: `containment` of the empty state in the body is not published — the relation is geometric, and a state the body scrolls stands partly outside the body's box by design.*

| Region | 1400×900 | above 1180 | 1180–1080 | below 1080 | 1000×680 |
|---|---|---|---|---|---|
| header | the statement beside the rows | beside, while the header holds three measures and the gap | under the rows, two measures wide | under the rows | under the rows, two measures wide: three lines |
| board body | holds the remaining height | same | same | same | scrolls an empty state taller than itself; never paints over the adoption strip or the foot |

## 9. Components

`EmptyState`, `Select`, `Checkbox`, `Button`: as built. No gap.

## 10. Disagreements and gaps

- UIR-011 bounded engine prose to `--rt-prose-measure`; held to it under the controls, the analysis statement is five lines and takes 89 px of header. Not raised: the measure stands, and §8 moves the statement beside the rows instead of widening it.

## 11. Evidence plan

Capture: `pnpm ui-audit --views=4 --sizes=1400x900,1000x680`; drive: `click ".nav-item" --text=Requirements`, `waitFor "[data-testid=req-empty-store], [data-testid=req-empty-source], .req-columns"`, at both sizes. Rubric rows: D4, F2, C4.

**Must move:** `STACKING` findings at 1000×680, 2 → 0; the empty state's paint outside the board body at 1000×680, 45 px above and 45 px below → 0; header height at 1400×900, 248 px → at most 170 px.
**Must hold:** `ui-audit` view 4 at 1400×900: 0 findings; the four statements' text; `packages/ui/src/requirements/requirements.test.ts`; `layout-regression.test.ts`'s `.req-rail` rules.

## Audit 2026-11-10

**Status:** proposed
**Pack:** `3927eda58823` (the base); `pnpm ui-audit` at 1400×900 and 1000×680, view 4; drive at both sizes on a workspace with a source and no documents; theme `rotaris-dim`; by `design-ui`
**Unaudited:** a populated board, the five panes, the detail panel, the graph; `nocturne`, `high-contrast`
**Count:** rows answered 3 of 3 asked (D4, F2, C4); no 3 (high 1, medium 2); not captured 0
**Summary:** The board's controls are the design system's at the compact height and the statements `REQ-TRACE-345`, `-346` and `-507` ask for are all on screen. At the minimum window the frame takes two thirds of the view and the empty state paints over its neighbours.

| # | Criterion | Severity | Observation (with numbers; evidence) | Cause | Bounded change | Executes | Must move (now → passes) | Must hold | Answers to |
|---|---|---|---|---|---|---|---|---|---|
| 1 | D4, deterministic | high | at 1000×680 the empty state (224 px) stands in a 133 px body and paints 45 px over the adoption strip and 45 px over the foot; `STACKING` ×2: "Details" and "Run adoption" are covered (`4-requirements-1000x680.png`, `report.json`) | `.empty-state { align-self: center }` in a body that neither scrolls nor grows | the body bounds the state (§8) | debug-ui | `STACKING` 2 → 0; overflow 45/45 → 0 | view 4 at 1400×900: 0 findings | `REQ-SHELL-022`, D4 |
| 2 | C4 | medium | the header is 248 px at 1400×900 and 254 px at 1000×680, of which the analysis statement is 89 px; with the adoption strip (41) and the foot (45) the frame takes 340 of the view's 513 px at 1000×680, leaving the board 133 | the statement is a full-width row under the controls, held to a 340 px measure | the two-column header of §8 | build-ui | header 248 → ≤ 170 px at 1400×900 | the statement whole and visible | §8, C4 |
| 3 | F2 | medium | "Reading the board…" is the body's only content while the projection is read, set flush in the body's top-left corner with no inset (`4-requirements.png`, first capture) | `.req-status` in `.req-body` takes no padding | the status line takes the body's inset | debug-ui | inset 0 → `--rt-space-4` | — | F2 |

### Taste
- The controls row reads as six unrelated controls; a hairline between the view controls (group, sort, blocked column) and the actions (filters, queue, new requirement) would group them.

### Deliberately left
- The statements' wording (`REQ-TRACE-345`, `-346`, `-507`): engine prose in an operator's view. A copy pass, with its own request.
- The adoption strip's place above the board when nothing is to adopt.

### Open-question candidates
- None beyond [OQ-544](../../architecture/open-questions/71-spikes-and-later-questions-38.md#oq-544).

## Execution 2026-11-10

By `debug-ui` (items 1, 3) and `build-ui` (item 2), on `feat/r-097-ui-ux-overhaul`. Evidence: `pnpm ui-audit` at both sizes (0 findings; view 4 carries 12 contracts, 10 before); drives at 1400×900, 1180×900 and 1000×680 on a workspace with a source and no documents, a persistent notice open.

| # | Must move | Before | After | Must hold |
|---|---|---|---|---|
| 1 | `STACKING` at 1000×680; the empty state's paint outside the body | 2; 45 px above, 45 px below | 0; 0 — the state starts at the body's top and the body scrolls the rest | view 4 at 1400×900: 0 findings — held |
| 2 | header height | 248 px at 1400×900; 254 px at 1000×680 | 141 px; 202 px (196 px at 1180×900) | the statement whole and visible; header `scrollWidth` = `clientWidth` (1268/1268, 868/868) — held |
| 3 | the reading line's inset | 0 | `--rt-space-3` block, `--rt-space-5` inline | — |

The board body at 1000×680 with the notice open: 133 px → 169 px. A capture taken after `waitFor` on the empty state shows the body scrolled 28 px: the driver centres what it matches (`apps/desktop/src/main/driver.ts`, `scrollIntoView`), the product does not.

Not driven: a populated board, the filters row shown, the panes, the detail panel; `nocturne` and `high-contrast`.
