# The critique rubric — one list for the builder and the critic

The builder walks the **while building** column before capturing (`build-ui` step 6); the critic scores the **question** column over the pack (`review-ui` step 4) and files a finding per failed criterion, `criterion` set to the row's id. One file, so the two never drift apart. The categories and severities are `apps/desktop/scripts/ui-review.mjs`'s own (`design-quality | originality | craft | functionality | deterministic`; `high | medium | low`); the rubric adds nothing to them, it maps onto them.

**Version:** 0 (2026-11-01) — derived from the adopted material (`docs/design/README.md` §1, §5, §7.1–7.4), the twelve findings of the first critic pass (UIR-001..012) and the lessons recorded in the three UI skills. The guide column names the file in `docs/research/design/` that carries the reasoning; version 1 cites its sections once the guides are written.

## functionality

| id | Question | Evidence to cite | While building | Guide |
|---|---|---|---|---|
| F1 | Does every operator journey that crosses this surface complete — start, watch, intervene, approve, answer, review, recover, configure — without a step that stalls or misleads? | the journey walk; the PNG at each step | walk the brief's §2 through the built surface before capturing | `04-the-agent-operator-journeys.md`, `06-ux-patterns-for-agent-products.md` |
| F2 | Is every state of the matrix drawn, and does each say what it is — empty, loading, streaming, partial, error, success, disabled, permission-needed? | PNG per state; `app:drive waitFor` | draw the states before the happy path; an empty state states what fills it | `13-states-feedback-and-time.md` |
| F3 | Is every control reachable by keyboard in a sensible order, named for assistive technology, and its focus visible as the one 2 px `--rt-focus` ring (REQ-SHELL-144..168)? | `geometry.json` hit tests; the `TRAPPED` findings; the focus PNG | tab through once; read every name | `09-accessibility-for-a-dense-desktop-tool.md`, `08-platform-conventions-for-electron.md` |
| F4 | Does every string say what happens, in the glossary's words and the adopted voice — sentence case, second person, exact monospaced numbers, no filler, no euphemism? | the strings on the PNG; `packages/ui/CONTEXT.md` *Avoid* lines | read every string against the glossary | `10-ux-writing.md` |

## craft

| id | Question | Evidence to cite | While building | Guide |
|---|---|---|---|---|
| C1 | Is there one primary element per region, and does hierarchy come from size, colour and space on the §1.4 scale — never from a fourth weight? | `styles.json` font sizes and weights | count primaries per region; one | `07-visual-composition-beyond-tokens.md` |
| C2 | Is every gap a spacing token on the 8 px module, and the same relationship the same gap everywhere? | `styles.json` margins and paddings; `spacing-token` relations | publish `spacing-token` relations for the repeated gaps | `07-visual-composition-beyond-tokens.md` |
| C3 | Does each region hold one alignment axis — no label column drifting from its values, no two competing left edges? | `align-x` / `align-y` relations; `geometry.json` | publish `align-x` for the edge that matters | `07-visual-composition-beyond-tokens.md` |
| C4 | Does the density tier fit the content — a transcript dense, a settings pane breathing — and does it hold at both sizes? | PNG at 1400×900 and 1000×680 | pick the tier from the §7 mockup section, not from the component default | `05-interaction-patterns-for-desktop-tools.md`, `07-visual-composition-beyond-tokens.md` |
| C5 | Is every surface earned — a card, a border, a fill only where the material gives one, never "every row a card" (§7.1)? | count of cards, borders, fills per region | ask of each box what it separates from what | `02-the-generated-look-and-its-counter-moves.md`, `07-visual-composition-beyond-tokens.md` |
| C6 | Does colour carry meaning only — the three axis colours as waiting, running, done (§1.3), danger and info outside them, one coloured icon per row at most? | `styles.json` colours; token names | name the state each colour means | `07-visual-composition-beyond-tokens.md` |
| C7 | Does prose hold a readable measure, and does data stay monospaced and exact? | `styles.json` widths and faces | set the measure token on prose containers | `07-visual-composition-beyond-tokens.md`, `10-ux-writing.md` |
| C8 | Is there one icon family at one weight (Phosphor regular, fill only where §1.9 says), no emoji, no unicode glyph as an icon? | the PNG; the class names | reach for `ph-*` only | `07-visual-composition-beyond-tokens.md`, `02-the-generated-look-and-its-counter-moves.md` |
| C9 | Is motion restricted to status (§1.8) — no animation in conversation content, no scale or shrink, durations from the tokens? | `document.getAnimations()`; `styles.json` transitions | motion only on `StatusDot` and overlays | `13-states-feedback-and-time.md` |

## design-quality

| id | Question | Evidence to cite | While building | Guide |
|---|---|---|---|---|
| D1 | Is none of the generated look's tells present — uniform grids, centred everything, gradient CTAs, shadow soup, placeholder empty states, filler copy, mixed icon sets, identical boxes for different content? | the tells walk | walk guide 02's list before capturing | `02-the-generated-look-and-its-counter-moves.md`, `01-how-ai-design-tools-design.md` |
| D2 | Does the surface read as the adopted direction against its §7 mockup section — the same air, the same line-or-card choices, the same use of the mono face? | the mockup section; the PNG | `pnpm mockup`, side by side | `07-visual-composition-beyond-tokens.md` |
| D3 | Does what acts look like it acts, and nothing else — one filled control per dense screen (§1.7), hover as tint, selection as tint plus accent ink? | `styles.json` for controls | count filled surfaces; one | `05-interaction-patterns-for-desktop-tools.md` |
| D4 | Does the surface give way correctly at 1000×680 and the 1180/1080 thresholds — the box bounded, not only the child; nothing `SHRUNK`; text eliding, panes collapsing as the material says? | `SHRUNK`, `CONTAINMENT` findings; the small PNG | resize both ways before capturing | `14-how-a-surface-gives-way.md` |

## originality

| id | Question | Evidence to cite | While building | Guide |
|---|---|---|---|---|
| O1 | Is there no imported pattern the material lacks — a hero, a marketing grid, a dashboard of KPI tiles where a list would say more? | the PNG against §4's inventory | if the component is not in the inventory, it is a §4.2 proposal | `02-the-generated-look-and-its-counter-moves.md`, `03-information-architecture-within-a-fixed-structure.md` |
| O2 | Does distinct content get the distinct treatment the material offers — a transcript row unlike a settings row unlike a commit — rather than one pane template for everything? | the PNGs across views | compare with the neighbouring view before capturing | `07-visual-composition-beyond-tokens.md`, `03-information-architecture-within-a-fixed-structure.md` |

## deterministic

Not scored here. `pnpm ui-audit`'s `CONTRACT`, `SHRUNK`, `CONTAINMENT`, `STACKING`, `TRAPPED`, `TRACKS`, `AUDIT-ERROR` and `pnpm theme-proof`'s findings keep their measured severity (`review-ui` step 7).

## Severity

- **high** — blocks or misleads a journey step; violates a requirement, a directive, an adopted §1 rule or an accessibility floor (`REQ-SHELL-144`, `REQ-SHELL-145`, `REQ-SHELL-148`).
- **medium** — weakens hierarchy or the adopted direction on a primary path at the standard or the minimum size.
- **low** — polish with no journey effect.

A finding states the number in its observation (`review-ui` step 5) and names the token or rule it answers to; before filing an invention, read `packages/contracts/src/theme/themes.ts` and the adopted sheet (`review-ui` step 6). A lesson a loop pays for goes into its criterion's row as a dated bold note.
