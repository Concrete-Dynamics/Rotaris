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

Under the title row the header holds one wrapping line of two items: the rows that steer the board (controls, move, and the filters when shown), which ask for two measures, and the analysis statement, which asks for one and is top-aligned with the controls row. The statement stands beside the rows wherever the header holds three measures and the gap between them, and returns under the rows where it does not; no breakpoint is written. Its lines hold one measure in both places: beside the rows it is one measure wide and the rows take the line's free space; alone under them it is set in two columns of one measure each. The controls row is two decided lines: what the board shows (group, sort, the blocked column), then what is done to it (filters, queue, new requirement, the filter's sentence). The inline errors keep the header's whole width. *2026-11-10, while building: first written as a two-column grid behind a media query, which `tools/check-ui-language.mjs` counted as two new pixel literals; the wrapping line decides from the tokens alone.*

The board body bounds its empty state: the body takes a block inset of `--rt-space-4`; the state is centred in it while the body holds it, stands at its top when it does not, and the body scrolls vertically for the rest.

Relations (published on the header, `req-header`): `containment` in the primary view; `viewport-scroll` on the x axis, expected false (`REQ-TRACE-489`). The adoption strip's controls are held by `ui-audit`'s `STACKING` sweep. *2026-11-10: `containment` of the empty state in the body is not published — the relation is geometric, and a state the body scrolls stands partly outside the body's box by design.*

| Region | 1400×900 | above 1180 | 1180–1080 | below 1080 | 1000×680 |
|---|---|---|---|---|---|
| header | the statement beside the rows, one measure | beside, while the header holds three measures and the gap | under the rows, in two columns of one measure | under the rows | under the rows, in two columns: three lines |
| board body | holds the remaining height | same | same | same | scrolls an empty state taller than itself; never paints over the adoption strip or the foot |

## 9. Components

`EmptyState`, `Select`, `Checkbox`, `Button`: as built. No gap.

## 10. Disagreements and gaps

- UIR-011 bounded engine prose to `--rt-prose-measure`; held to it under the controls, the analysis statement is five lines and takes 89 px of header. Not raised: the measure stands, and §8 moves the statement beside the rows instead of widening it.

## 11. Evidence plan

Capture: `pnpm ui-audit --views=requirements --sizes=1400x900,1000x680` (`--views=4` when this was written; `3` since PD-SHELL-015 of 2026-11-11); drive: `click ".nav-item" --text=Requirements`, `waitFor "[data-testid=req-empty-store], [data-testid=req-empty-source], .req-columns"`, at both sizes. Rubric rows: D4, F2, C4.

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
- None beyond [OQ-544](../../archive/architecture/open-questions/71-spikes-and-later-questions-38-continued-5.md#oq-544).

## Execution 2026-11-10

By `debug-ui` (items 1, 3) and `build-ui` (item 2), on `feat/r-097-ui-ux-overhaul`. Evidence: `pnpm ui-audit` at both sizes (0 findings; view 4 carries 12 contracts, 10 before); drives at 1400×900, 1180×900 and 1000×680 on a workspace with a source and no documents, a persistent notice open.

| # | Must move | Before | After | Must hold |
|---|---|---|---|---|
| 1 | `STACKING` at 1000×680; the empty state's paint outside the body | 2; 45 px above, 45 px below | 0; 0 — the state starts 16 px under the body's top and the body scrolls the remaining 67 px | view 4 at 1400×900: 0 findings — held |
| 2 | header height | 248 px at 1400×900; 254 px at 1000×680 | 138 px; 198 px (198 px at 1180×900) | the statement whole and visible, its longest line 316 px in both arrangements; header `scrollWidth` = `clientWidth` (1268/1268, 1048/1048, 868/868) — held |
| 3 | the reading line's inset | 0 | `--rt-space-3` block, `--rt-space-5` inline | — |

The board body at 1000×680 with the notice open: 133 px → 173 px. A capture taken after `waitFor` on the empty state shows the body scrolled 28 px: the driver centres what it matches (`apps/desktop/src/main/driver.ts`, `scrollIntoView`), the product does not.

Not driven: a populated board, the filters row shown, the panes, the detail panel; `nocturne` and `high-contrast`.

## Critique 2026-11-10

The critique is the independent, report-only `review-ui` reading of the pack `9401038db662/iteration-1` (18 findings: 4 high, 7 medium, 7 low; `critique.json` is not committed, `.ui-review/` being ignored). A finding repaired here is `implemented`, not `verified-resolved`: that takes a fresh pack read in a fresh context.

| Finding | Severity | What it read | Outcome |
|---|---|---|---|
| UIR-006 | medium | the empty state stood 0 px under the adoption strip at 1000×680, where §8 said `--rt-space-4`; brief and rule disagreed | implemented: the body's block inset (16 px measured); §8 reworded to what is built |
| UIR-012 | low | the controls row broke after a different control at each width (three on its first line at 1400×900, four at 1000×680) | implemented: two decided lines at every width; the header is 138 and 198 px |

Found by the same pass in this brief's own first build and corrected: the statement was one to two measures wide (434 px beside the rows, 680 px under them); it holds one measure a line in both arrangements now.

## Execution 2026-11-11 — the empty states' and the foot's sentences

*By the model (`claude-fable-5-2`) under [R-098](../../product/requests.md#r-098), for [R-099](../../product/requests.md#r-099): UIR-310 (high) and UIR-312 (low) of [the 2026-11-11 critique](overview/05-brief-2026-11-11.md), which the brief above had left as "a copy pass, with its own request". Built on `feat/r-097-ui-ux-overhaul` in two commits, the second after the critique below; not landed. The frame of §8 is unchanged; this section changes strings, which the brief above did not.*

**Authority.** `REQ-TRACE-231` (no source: what a source is, how one is configured, never a blank pane); `REQ-TRACE-515` (the store that will not parse is told apart; unchanged here); `REQ-NOTIFY-006` (a region holding nothing names why and gives an instruction or control that would put something in it); `REQ-TRACE-444` (creation is offered only where the source declares it); `REQ-TRACE-507` and `REQ-TRACE-334` (the board follows what the engine evaluated, infers no dead refresh from silence, and Re-evaluate is the guaranteed route); §1.4 (a path, a key, a file name is set in the mono face); guide 10 (the reader's terms; an empty state says which empty, with a way forward). No requirement fixes the wording of any of these sentences.

**What was found, beyond the critique's two parts.** The critique read the second state as "a configured source". Measured (`pnpm app:drive`, `ab29f51b`): the same state is drawn for a workspace with no layout file and no `docs/requirements` directory, because the layout always resolves to its default (`REQ-TRACE-038`); `REQ-TRACE-231`'s own state appeared only when the layout file could not be read, over the engine's error. Which state a missing default directory is, is raised as [OQ-549](../../architecture/open-questions/71-spikes-and-later-questions-38.md#oq-549); the sentences below are true of both readings.

| # | Must move | Before (`ab29f51b`) | After | Must hold |
|---|---|---|---|---|
| 1 | Markdown backticks drawn in the empty states; names in the mono face | 6 backticks, around three names in the body face; 1 name in mono (the directory) | 0 backticks; each name in JetBrains Mono, on one line, at both sizes | the no-source state still says what a source is and how one is configured (`REQ-TRACE-231`) |
| 2 | the help under the store that holds nothing | "Source: docs/requirements. Configure one by placing a … then re-evaluate. …", the no-source instruction | the first document: "Use New requirement above to add the first one." where the store offers creation, and in either case writing it into the named directory by hand, then re-evaluate; then how to name another directory | no control added; the state inside the body at 1000×680 (the body scrolls 240 and 257 px of content in 195) |
| 3 | the store state's title | "The requirement source is configured but holds no requirement documents yet.", over a workspace nobody configured | "The requirement source holds no requirement documents yet." | `REQ-TRACE-515`'s state and sentences unchanged |
| 4 | a source that could not be read (a layout file that does not parse) | "No requirement source", what a source is, and "Configure one by placing a rotaris-traceability.json …" above the error naming that file | "The requirement source could not be read." / "The reason is reported below. Where it names a file, correct that file, then re-evaluate." / the engine's report; `role="alert"` | "New requirement" unavailable, as before |
| 5 | the foot | "Live refresh follows the engine over channel 10; the channel reports no failure of its own, so a stopped watcher cannot be told from a quiet one here. Re-evaluate is always the route to a current board." | "The board updates itself when a change is made through Rotaris. A change made outside it shows after Re-evaluate, which is always the way to a current board." | one line of 27 px at 1400×900, two (45 px) at 1000×680; "Re-evaluate" whole |
| 6 | the header statement's key, `requirements.change.analyze_changes` | the body face | the mono face | the statement's two columns of one measure |

Also changed in the no-source instruction: its last sentence, "The board reads the source through the traceability engine and never keeps a copy of it", reads "The board reads the documents where they stand and keeps no copy of them". A name in a hint goes to the next line whole (it broke at its hyphen, "rotaris-" / "traceability.json"), and so does a control's name or its verb inside a sentence ("Re-" / "evaluate").

**The foot's first rewording was false, and is kept here as that.** The first build said "The board refreshes itself as the repository changes. It cannot tell a refresh that has stopped from a repository where nothing changed …". Nothing watches the repository: the board is told of a change only by a reply to a command of its own or of a run (`apps/desktop/src/main/requirements.ts`, `requirements-runs.ts`). The critique read the relay and refused the sentence (UIR-401); this brief's first text also said "the fact stated is the same", which was false with it.

**Considered, and not taken.** Deleting the backticks and leaving the names in the body face: §1.4 sets a path and a key in mono, and the directory beside them already was. A control in the empty state ("New requirement" or "Run adoption"): both stand in the header above, and guide 10 allows an empty state one action at most, which this one would have to choose between. Reporting a missing directory as no source: the projection's to say, OQ-549. `<code>` for the names, as seven sentences elsewhere in the product write it (the critique's UIR-411): this view's own idiom is `span.mono`, as its directory was already drawn, and the round's brief fixed that idiom; one home for the sentence's parts is owed when a second surface takes them ([the MCP Servers note](../../defects/three-sentences-on-the-mcp-servers-category-draw-markdown-backticks-as-written.md)).

**Evidence.** `packages/ui/src/requirements/requirements.test.ts` (no backtick in any drawn sentence; the names and the kept-whole parts; the store state never told to configure a source; the board's control named only where creation is offered; the source that could not be read; the foot without the build's words and without the falsified claim); `layout-regression.test.ts`. Drives at 1400×900 and 1000×680 of three workspaces: neither file nor directory, an empty `docs/requirements`, and a layout file that does not parse.

Not driven: a read-only directory; a configured directory with a long path; a change made outside the application followed by a wait, which would show the foot's second sentence at work; `nocturne` and `high-contrast`; a screen reader over the states.

## Critique 2026-11-11, of the empty states and the foot

The round's own critique, described in [the Settings brief](settings.md), "Critique 2026-11-11, of the providers card". Its findings on this view:

| Finding | Severity | What it read | Outcome |
|---|---|---|---|
| UIR-401 | high, new | the foot's first rewording claimed a refresh "as the repository changes"; no watcher exists | implemented: row 5 above, the falsified sentence kept beside it |
| UIR-408 | medium, older, exposed | the no-source instruction drawn over an error naming the very file it says to place | implemented: row 4 above, a state of its own |
| UIR-409 | medium, older | "New requirement" enabled over a missing directory; its pane says "read-only"; the adoption strip says no store was found | recorded, not repaired: [the note](../../defects/the-new-requirement-pane-says-read-only-of-a-store-directory-that-does-not-exist.md), OQ-549 |
| UIR-410 | high by §1.4's rule, older | the header statement's key in the body face; "as the pass reports" and "as the engine reported it" remain | the key: implemented, row 6. The two phrases: open, the rest of the copy pass on `REQ-TRACE-345` and `-346`'s statements |
| UIR-411 | low, new | names drawn as `span.mono` where seven sentences elsewhere write `<code className="mono">` | not taken, with the reason above |
| UIR-412 | low, new | "Re-" / "evaluate" broke at the hyphen in the foot at 1000×680 and in a hint | implemented: a kept-whole part |
| UIR-413 | low, new | the store help was one sentence of 36 words; the control's name unmarked; "then re-evaluate" closed both ways | implemented in part: the board's own way is a sentence of its own and names the control as standing above; the name is kept whole and not set apart by a mark, as the board's other sentences name Re-evaluate |

**Refused by the critique, and what was done.** The foot's first sentence: replaced. "The fact stated is the same" in this brief: struck, see above. **Its reading of the title's change:** right to change, since `REQ-TRACE-515` itself calls the state the one "which says the source holds no documents".
