# Requirements board — brief

**Status:** proposed
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

The header is a grid of two columns: the control rows in the first, the analysis statement in the second, top-aligned with the controls row and bounded to `--rt-prose-measure`; the title row, the filters row and the inline errors span both. Where the header is too narrow for both columns (below `calc(3 * var(--rt-prose-measure))` of header width), the statement returns under the rows.

The board body bounds its empty state: the state stands at the body's top with `--rt-space-4` above it, and the body scrolls vertically when it is shorter than the state.

Relations: `containment` of the empty state in the board body (`req-body`, `req-empty`); `hit-test` on the adoption strip's controls.

| Region | 1400×900 | above 1180 | 1180–1080 | below 1080 | 1000×680 |
|---|---|---|---|---|---|
| header | two columns | two columns | two columns | two columns while the header holds them | two columns; the controls row wraps inside the first |
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
