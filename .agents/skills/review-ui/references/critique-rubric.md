# The critique rubric — one list for the builder and the critic

**Version:** 1 (2026-11-02). The categories and severities are `apps/desktop/scripts/ui-review.mjs`'s own (`design-quality | originality | craft | functionality | deterministic`; `high | medium | low`); each section below is one category, and a row's id is the `criterion` of a finding against it (`critique-schema.md`). The **Guide** column names the file in `docs/research/design/` by its number and the sections that carry the row's reasoning and measures (`07 §4 step 4` is guide 07, section 4, step 4); read them before arguing with a row. One file, so the builder builds against exactly what the critic scores and the `design-ui` audit walks.
Version 0 (2026-11-01) derived these rows from `docs/design/README.md` §1, §5 and §7.1–7.4, the twelve findings of the first critic pass (UIR-001..012) and the three UI skills' lessons, before the guides were written.

## Builder — `build-ui` step 6

1. Before the first capture, walk every row's **While building** cell on the driven app (`pnpm app:drive`); a row the brief answers (`docs/design/briefs/<slug>.md`) is checked against the brief.
2. Repair what fails before capturing.
3. After `pnpm ui-review`, read the **Evidence** cells of every row a repair touched and state the number before and after, the container's beside the child's (`build-ui` steps 7–8).

## Critic — `review-ui` steps 4–7, and the `design-ui` audit's rubric walk

1. Answer each row's **Question** from its **Evidence** cells: pass, or fail with the number that fails it. A row with several clauses fails on any one; name the clause.
2. Read the requirement that binds the element before calling anything craft: a status strip at `scrollWidth` 1847 in a 1400 px window read as taste and was a `REQ-SHELL-038` breach, high (UIR-001).
3. Check the recommendation against the same requirement: "replace the sentence with a verb" would have broken `REQ-TRACE-390`, which makes the accessible description the visible text (UIR-011).
4. Before filing a value as an invention, read `packages/contracts/src/theme/themes.ts` and `docs/design/system/components.css` (`review-ui` step 6).
5. File one finding per failed row and cause — a row two causes fail (two elements, two numbers) gets two findings with the same `criterion`; one cause failing two rows gets one finding naming both, under the row ranked first (the filing gate below): `category` is the row's section, `criterion` its id, `severity` by the table below, the number in the observation sentence, and the rule it answers to (§1.x, a token, a `REQ`, a `PD`).
6. An observation that names no row and no rule is taste: report it apart, never as a finding. A structural idea — a view, tab, order or label — leaves as an open-question candidate, never as a finding to build (11 §4 step 10).

## functionality

| id | Question | While building | Evidence to cite | Guide |
|---|---|---|---|---|
| F1 | Does every journey of the brief's §2 (04 §4's table, without a brief) complete on the built surface — no step stalling or misleading, every wait naming its limit, every trust point showing the evidence checked rather than the agent's account? | drive the brief's §2 step by step before capturing, a PNG per step | the journey walk; the PNG per step | 04 §4, §6; 06 §2, §6; 11 §4 step 5 |
| F2 | Is every cell of the states matrix (the brief's §4; 13 §4 step 1's columns, without a brief) drawn at a size that fits its content and saying what it is — no `EmptyState` while a load is pending, each empty with a why sentence and one control (`REQ-NOTIFY-006`), each `Spinner` named for its wait? | draw the states before the happy path; script each cell with `app:drive waitFor`; read the empty state's box against its region's. **2026-09-13, UIR-007:** an empty state took 71 % of its view | a PNG per cell; the accessible tree; `geometry.json` for the empty state's box | 13 §2, §6; 10 §6 |
| F3 | Is every control reached in the brief's Tab sequence, named for assistive technology (empty names: 0), focused with the one `--rt-focus` ring at `--rt-focus-ring-width` uncut by an ancestor, is focus never left on `body` after a dialog closes or a row goes, and does a dialog guarding an approval or an irreversible command open on the declining choice with Enter answering nothing (`REQ-SHELL-144..168`, `REQ-TOOLS-063`)? | tab through once; read every name; close each dialog and read `document.activeElement` | `geometry.json` hit tests; `STACKING` and `hit-test` findings; the focus PNG | 09 §2, §6; 08 §6; 05 §6 |
| F4 | Does every string say what happens — the work, not the mechanism — in the glossary's words and the adopted voice: no *Avoid* word, sentence case, labels that start with a verb, exact monospaced numbers with no `K` or `M`, no filler, a bound on every string that grows with the run, and every fixed string matching its requirement character for character? | read every string against `packages/ui/CONTEXT.md` and the brief's §6; feed the longest value and a long run | the strings on the PNG; `styles.json` faces on digits | 10 §2, §6 |

## craft

| id | Question | While building | Evidence to cite | Guide |
|---|---|---|---|---|
| C1 | Is there one primary per region — at most one element at `--rt-h4` or larger — with hierarchy from size, colour and space and every computed weight 300, 400 or 500 (300 only on mono numerals), no `font: inherit` discarding an adopted size? | count primaries per region: one | `styles.json` sizes and weights | 07 §2, §6 |
| C2 | Is every margin, padding and gap a `--rt-space-*` value, one relationship one value across views, the gap inside a group smaller than the gap between groups, and does every control take `--rt-control-height`, `--rt-control-height-compact` or the composer's own height — three heights, no more? | publish `spacing-token` relations for the repeated gaps; take height from the component variant. **2026-09-13, UIR-003, UIR-006:** headers at three heights and controls at eleven, now one and three | `styles.json`; `spacing-token` results in `report.json`; `geometry.json` heights | 07 §2, §6; 03 §6; 05 §6 |
| C3 | Do the text keylines of each region share one x within 1 px — no label column drifting from its values, no two competing left edges, no two control centres off one line — and is no field wider than its longest value? | publish `align-x` on the keyline the brief's §8 names, `align-y` on controls sharing a line; size fields from `--rt-field-min`, never from the pane. **2026-09-13, UIR-008, UIR-010, UIR-024:** centres 5.42 px apart, edges 51.04 px apart, a select 729.2 px wide for "single" | `align-x` / `align-y` results; `geometry.json` | 07 §4 step 4, §6; 03 §6 |
| C4 | Does the density tier fit the content and hold at both sizes — a transcript dense, a settings pane breathing, a `Table` header on its body's height tier? | take the tier from the brief's §8 and the §7 mockup section, never the component default | the PNG at 1400×900 and 1000×680; `styles.json` heights | 07 §2, §6; 05 §3 |
| C5 | Is every surface earned — each border, fill or `Card` separating something space cannot, never "every row a card" (§7.1), the transcript holding only §7.2's set? | ask of each box what it separates from what; drop it where space already does | bordered and filled boxes counted per region | 02 §3, §6; 07 §4 step 3, §6 |
| C6 | Does colour carry meaning only — each coloured element one meaning from §1.3 or §1.9 with its word or glyph beside it (`REQ-SHELL-149`), persona colour from `--rt-viz-*` alone, one coloured icon per row? | name the state or identity each colour means | `styles.json` colours resolved to token names | 07 §2, §6; 12 §2, §6 |
| C7 | Does prose hold `--rt-prose-measure` while code, diffs and tables opt out, and is every figure in `--rt-font-mono` and exact? | set the measure token on prose containers | `styles.json` widths and faces | 07 §2, §6; 10 §6 |
| C8 | Is there one icon family at one weight and one size per context (Phosphor regular, fill only where §1.9 says), no emoji, no unicode glyph as an icon, and does an icon control's hover change its background rather than its glyph? | reach for `ph-*` only | the PNG; the class names | 07 §6; 02 §6 |
| C9 | Is motion restricted to status (§1.8) — on a settled view `document.getAnimations()` holds only `.status-dot.is-pulsing` and `.spinner`, none in conversation content, durations from the tokens, none under reduced motion (`REQ-SHELL-135`)? | motion only on `StatusDot`, `Spinner` and overlays | `document.getAnimations()`; `styles.json` transitions | 13 §2, §6; 12 §6 |

## design-quality

| id | Question | While building | Evidence to cite | Guide |
|---|---|---|---|---|
| D1 | Is the generated look absent — fewer than three of guide 02's section-3 tells on one surface, each counted? | walk 02 §3 with a number per row before capturing | the tells walk | 02 §3, §4 steps 3–4; 01 §6 |
| D2 | Does the surface read as the adopted direction against its §7 mockup section — the same air, the same line-or-card choices, the same use of the mono face? | `pnpm mockup`, side by side with the driven app | the mockup section; the PNG | 07 §2, §6 |
| D3 | Does what acts look like it acts, and nothing else — one filled control per view in every state, the empty state included (§1.7), hover a tint with no `transform`, selection tint plus accent ink, a focused row the ring and no tint, a selected row the tint and no ring? | count filled controls per state: one; take the brief's §9 idiom for every selectable control. **2026-09-13, UIR-005, UIR-018:** selection drawn as a neutral block; tint-10 on the rail beside tint-14 on the segmented control | `styles.json` for controls; the focus PNG | 05 §6; 02 §6 |
| D4 | Does the surface give way correctly at 1000×680 and either side of 1180 and 1080 px — the box bounded, not only the child; one arrangement per width; labels whole; `scrollWidth` equal to `clientWidth` on the view and `.status-strip` (`REQ-SHELL-022`); a dialog's button row visible? | resize across each threshold both ways; `pnpm ui-audit -- --sizes=` at the brief's sizes; read the container's number after each fit. **2026-09-13, UIR-001, UIR-012, then UIR-014, UIR-023:** a 1847 px strip, a 1400.44 px extent, a header squeezed 76 → 56, an equalised rail clipping "Requirements" | `SHRUNK`, `CONTAINMENT`, `TRAPPED`, `TRACKS` findings; the PNG per size | 14 §2, §6 |

## originality

| id | Question | While building | Evidence to cite | Guide |
|---|---|---|---|---|
| O1 | Is there no imported pattern the material lacks — a hero, a marketing grid, a dashboard of KPI tiles where a list would say more, a platform control where the inventory has none — and is every component in the inventory or a §4.2 proposal? | check each component against `.agents/skills/build-ui/references/component-inventory.md`. **2026-09-13, UIR-004:** the platform's own checkbox stood where the inventory had none, until OQ-57 ruled one in | the PNG against §4's inventory; `data-ui-component` in the DOM | 02 §3, §6; 03 §2, §6 |
| O2 | Does distinct content get the distinct treatment the material offers — a transcript row unlike a settings field unlike a commit, a person's own row unlike an agent's — rather than one container template for everything? | compare with the neighbouring view and row category before capturing | the PNGs across views | 07 §2, §6; 03 §6 |

## deterministic

Not judged, and never lowered. A `pnpm ui-audit` finding carries a kind and a measurement and no severity of its own (`apps/desktop/scripts/lib/audit-finding.mjs`): it is filed under `deterministic` with the kind in its observation, at the severity the table below gives the row it evidences, read from the measurement — a cut control, label or journey step is high, a cut box or a breached relation on a primary path is medium, and never low, because a measured breach is never polish. A `pnpm theme-proof` red keeps the proof's own severity. `UNREACHED` and `AUDIT-ERROR` say nothing about the surface: each is filed low with its cause named (a harness condition by its note under `docs/defects/`), and the view, overlay or size it names counts as not captured, never as a pass (`review-ui` step 7; the `design-ui` audit's step 3). The last column says which row the kind evidences, so an audit item can cite both.

| Kind | Source | Measures | Evidences |
|---|---|---|---|
| `TRACKS` | `pnpm ui-audit` | a `grid-area` naming an area no template declares, so the browser invents tracks | D4 |
| `CONTAINMENT` | `pnpm ui-audit` | an element whose box leaves the viewport | D4 |
| `STACKING` | `pnpm ui-audit` | a visible, enabled control not topmost at its own centre: seen, focusable, unclickable | F3; F1 where it blocks a step |
| `TRAPPED` | `pnpm ui-audit` | a `position: fixed` element whose ancestor carries `transform`, `filter`, `will-change` or `contain`, so it is positioned against a box it was never measured for | D4 |
| `SHRUNK` | `pnpm ui-audit` | a marked box holding more content than it shows on an axis that does not scroll | D4 |
| `CONTRACT` | `pnpm ui-audit` | a failing `UiLayoutContract` relation, named under `relation` | `align-x`, `align-y`, `equal-width`, `equal-height`: C3; `spacing-token`: C2; `hit-test`: F3; `containment`, `text-fit`, `viewport-scroll`: D4 |
| `UNREACHED` | `pnpm ui-audit` | a view or overlay the driver could not open | nothing: the pack is incomplete for it |
| `AUDIT-ERROR` | `pnpm ui-audit` | a sweep that threw on a view or overlay at a size | nothing until recaptured; never a pass |
| contrast floor | `pnpm theme-proof` | rendered-pixel contrast against `REQ-SHELL-144`, `REQ-SHELL-145`, `REQ-SHELL-160` | F3 |

## Severity — ask in order; the first yes decides

| # | Question | Yes → |
|---|---|---|
| 1 | Does it block or mislead a step of a journey that crosses the surface (F1)? | high |
| 2 | Does it break a requirement, a directive, an adopted §1 rule or an accessibility floor (`REQ-SHELL-144`, `REQ-SHELL-145`, `REQ-SHELL-148`)? | high |
| 3 | Does it weaken hierarchy or the adopted direction on a primary path at 1400×900 or 1000×680? | medium |
| 4 | None of the above: polish with no journey effect. | low |

## A finding is filed only when all five are yes

| # | Question | Checked in |
|---|---|---|
| 1 | Does it name one row id of this file? | `criterion` |
| 2 | Does it name the element as `geometry.json` or the DOM names it? | `surface`, `evidence` |
| 3 | Does it name the rule it answers to — a §1.x, a `--rt-*` token, a REQ or a PD? | `observation` |
| 4 | Is the number in the observation's sentence, not only in `evidence`? | `observation` (`review-ui` step 5) |
| 5 | Was the token table read before a value was called an invention? | Critic step 4 |

A no on 1–4 is taste, reported apart (11 §4 step 6). A lesson a loop pays for goes into its row as a dated bold note; a guide's *proposed* check reaches this file only as a new row in a new version; a row whose failure can no longer happen says why before it is dropped.
