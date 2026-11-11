# Settings — brief

**Status:** built 2026-11-10 on the branch `feat/r-097-ui-ux-overhaul` (not landed; the brief and its build are one pass under R-097, so no approval stands between them)
**Written:** 2026-11-10 by `design-ui` (brief, then audit), for [R-097](../../product/requests.md#r-097)
**Surface:** the Settings primary view; §7 row "Settings panes and save bar"; mockup section `SETTINGS`; nearest built code `packages/ui/src/SettingsView.tsx`, `packages/ui/src/settings/`; theme `rotaris-dim`

The brief covers what R-097 changes: how a category arranges its rows. The categories, their order, their controls and every string stay as built.

## 1. Authority

- `REQ-CONFIG-268`, `REQ-CONFIG-269`: the thirteen categories, their order and identifiers. Fixed.
- `REQ-CONFIG-270`: Save, Discard and the save status reachable from every category. Fixed; the save bar keeps its place above the category body.
- `REQ-CONFIG-320`: the Runtime category's order. `REQ-CONFIG-323`: the four policy toggles, their order, and the accessible description regenerated on every change.
- `REQ-SHELL-133`, `REQ-SHELL-070`, `REQ-SHELL-073`: the Interface category's controls. `REQ-SHELL-138` – `REQ-SHELL-143`: About.
- `REQ-SHELL-022`: the minimum window. `REQ-SHELL-149`: no state by colour alone.
- Fixed strings: every label, caption and option the categories draw; none changes.
- Departures from the mockup: the category list is a column of thirteen where the mockup draws three tabs (`REQ-CONFIG-268`); "Models" where it says "Providers" (`REQ-CONFIG-269`).
- Left open by all of the above:
  - where a row's label, control and caption stand against each other;
  - how wide a caption runs;
  - the space between rows and between groups.

## 2. Journeys that cross it

- **Change one setting** (04 §4, "configure before a run"). When a run did something I did not want, I want to find the one setting that governs it, so that the next run does not. Entry: the rail, or a link from a notice. Steps: pick the category, scan the labels, change the control, read its caption, Save. Wait: none. Trust point: the caption says when the change takes effect. Recover: Discard.
- **Read what is set.** When I return to a project, I want to scan a category's values without reading its prose. Entry: the rail. Steps: scan one column of values. Exit: another view.
- Several agents: not on this surface.

## 3. Content model and hierarchy

One region per category body, below the save bar. Its primary is the category title. A category holds groups (a heading, or a `Card`), and a group holds rows. A row is one of four kinds, each already in the build:

| Kind | Holds | Example |
|---|---|---|
| field | label, control, optional unit, optional second label and control, caption | "Delegation strategy" |
| switch | label, `ToggleSwitch`, caption | "Circuit breaker" |
| action | `Button`, caption | "Reset panel sizes" |
| fact | label, value | About's "Version" |

Difficult data: the longest label, 224 px at its own type ("Auto-collapse older tool outputs"); the longest caption, the released run-start hint; a row with two fields ("Compression threshold" and "Iteration cap").

## 4. States

| Region | ideal | empty: first use | empty: cleared | empty: no results | filtered | cannot-show | loading | streaming / partial | error | success | disabled | permission-needed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| category body | rows on the axis of §8 | n/a: a category always has its controls | n/a: same | n/a: no search | n/a: no filter | the `Fatal` card (`REQ-CONFIG-478`), unchanged | "Reading the configuration…", unchanged | n/a: nothing streams | the save bar's failure line, unchanged | the save bar's status, unchanged | a disabled control keeps its place on the axis | n/a: no permission is asked here |

## 5. Interaction

Nothing changes. The Tab sequence is the DOM order, which this brief does not move: category list, save bar, then each row's controls top to bottom. No command is added.

## 6. Copy

No string is written or changed.

## 7. Accessibility obligations

- `REQ-SHELL-144` (contrast): labels and captions keep the tokens they have.
- `REQ-CONFIG-323`: each switch keeps `aria-labelledby` and its regenerated description; drawing the caption under the control changes no name.
- Reading order: the DOM order stays label, control, caption, so a screen reader meets them as before.
- `REQ-SHELL-022`: at the minimum window no row may leave the category body.

## 8. Composition intent

Density tier: "a settings pane breathing" (rubric C4), from the mockup's `SETTINGS` section.

One axis per category body. A row's label stands in a label column of `calc(2 * var(--rt-label-column))`; every control and switch begins at the column's end plus `--rt-space-3`; a caption stands under the control it describes, on that same edge, bounded to `--rt-prose-measure`. A row with no label (an action) keeps the label edge, an edge the body already has, and its caption stands under its button. A fact row takes the token itself as its column, which holds every fact label. A list row's field grows from `--rt-field-min` to `--rt-prose-measure` with its Add beside it, and its entries stand under the field. A category's prose at the caption's size holds the same measure; its prose at the body's size takes two measures, under OQ-547. Rows of one group stand `--rt-space-3` apart; a group heading is the section kicker (OQ-500's ruling) and stands `--rt-space-6` from the group above it. Inside a `Card` the column gives back the card's inset, so the card's controls stand on the edge the rows outside it stand on.

Relations (published on the category body, `settings-body`): `containment` in the primary view; `viewport-scroll` on the x axis, expected false. *2026-11-10, while building: the `align-x` relation first written here needs one published target per row, some 120 call sites; the axis is held instead by the unit test over the rules (`layout-regression.test.ts`) and measured by the drive in §11.*

| Region | 1400×900 | above 1180 | 1180–1080 | below 1080 | 1000×680 |
|---|---|---|---|---|---|
| category body | label column, control edge, caption under the control | same | same | same | same; the body is 648 px, the control column keeps 396 px; a caption wraps inside it; the body scrolls vertically, never sideways |

Earned surfaces: the two `Card`s the Runtime category already draws. None added.

## 9. Components

`Select`, `Input`, `ToggleSwitch`, `SegmentedControl`, `Button`, `Card`: as built. No gap.

## 10. Disagreements and gaps

- The token's comment says `--rt-label-column` holds the longest label of the product's forms; eleven Settings labels are wider than it. Raised as [OQ-546](../../archive/architecture/open-questions/71-spikes-and-later-questions-38-continued-5.md#oq-546); the build proceeds under a multiple of the token.
- The one measure the material names is the caption's; held to it, body-size prose stands at 35 to 49 characters a line. Raised as [OQ-547](../../archive/architecture/open-questions/71-spikes-and-later-questions-38-continued-5.md#oq-547); the build proceeds under two measures for body-size prose and the token for captions.
- The mockup draws a field as `.field`, label above control. This brief takes the side label instead, because the token above and UIR-010's repair of the Mission card already chose it for this product's forms, and because a Settings category is scanned by value (§2). Not raised: both arrangements are in the adopted material.

## 11. Evidence plan

Capture: `pnpm ui-audit --views=settings --sizes=1400x900,1000x680` (`--views=7` when this was written; `6` since PD-SHELL-015 of 2026-11-11); then `pnpm app:drive` for each of Runtime, Interface, Display, Project and About at both sizes, each after `waitFor ".settings__section"`. Rubric rows to pass: C3, C7, D4, C2.

**Must move** (Runtime, 1400×900): distinct left edges among the rows' first controls 16 → 1; widest caption 1042 px → at most the measure, 340 px *(first written "at most 680 px", twice the measure; the critique's UIR-007 and OQ-535 held it to the token)*.
**Must hold:** `pnpm ui-audit` findings for view 7 at both sizes, 0; `scrollWidth` equal to `clientWidth` on `.settings__body`; every proof selector under `.settings__body` and `.save-bar` (`settings-proof`, `config-proof`); the unit tests under `packages/ui/src/settings/`.

## Audit 2026-11-10

**Status:** proposed
**Pack:** `3927eda58823` (the base); `pnpm ui-audit` at 1400×900 and 1000×680; drives: Runtime, Interface, Display, Project, About at both sizes; theme `rotaris-dim`; by `design-ui`
**Unaudited:** Personas, Skills, Instructions, Hooks, MCP Servers, Plugins and Tools beyond a free read of one capture each; `nocturne` and `high-contrast`
**Count:** rows answered 4 of 4 asked (C2, C3, C7, D4); no 3 (medium 3); not captured 0
**Summary:** Every control is the design system's, at `--rt-control-height`, and the save bar holds its place (`REQ-CONFIG-270`). A category has no axis: each control begins where its label ends, and a caption runs the width of the pane.

| # | Criterion | Severity | Observation (with numbers; evidence) | Cause | Bounded change | Executes | Must move (now → passes) | Must hold | Answers to |
|---|---|---|---|---|---|---|---|---|---|
| 1 | C3 | medium | Runtime's 19 rows put their first control at 16 different x; Display's 7 at 7; Interface's 4 at 4; About's 5 values at 5 (drive, 1400×900) | `.settings__action` is one wrapping flex line, so the control follows the label's own width | the label column of §8 on every row | build-ui | distinct control edges, Runtime 16 → 1 | `ui-audit` view 7: 0 findings | §8, UIR-010, C3 |
| 2 | C7 | medium | a caption runs to 1042 px on Runtime and About, 1000 px on Project (drive, 1400×900), against the 340 px of `--rt-prose-measure` | the caption is a flex item on the control's line with no bound | the caption under its control, bounded | build-ui | widest caption 1042 → ≤ 680 px | no caption cut; `scrollWidth` = `clientWidth` | §8, UIR-011, C7 |
| 3 | C2 | medium | a group heading stands 16 px from the group above and 8 px from its own rows, and rows stand at the default line box; groups do not read as groups | `.settings__heading`'s margins | the spacing of §8 | build-ui | heading's top gap 16 → 24 px | — | §1.5, C2 |

### Taste
- The category list's selected item and the category title say the same word twice, 20 px apart.

### Deliberately left
- The Models table and the Providers card: their column alignment is its own item, not traced here.
- The captions' wording: several run to three sentences. `REQ-CONFIG-320` onward own the facts they state; shortening them is a copy pass with its own key churn.

### Open-question candidates
- OQ-546, above.

## Execution 2026-11-10

By `build-ui`, on `feat/r-097-ui-ux-overhaul`. Evidence: `pnpm ui-audit` at 1400×900 and 1000×680 (0 findings; view 7 carries 12 contracts, 10 before); drives of Runtime, Interface, Display, Project and About at both sizes, each read with one `eval` over the rows.

| # | Must move | Before | After | Must hold |
|---|---|---|---|---|
| 1 | distinct left edges among the labelled rows' controls, 1400×900 | Runtime 16, Display 7, Interface 4, About 5 | 1 each (x 584; About's facts x 464, on the token's own column) | view 7: 0 findings at both sizes — held |
| 2 | widest caption, as text | 1042 px | 339 px at 1400×900 and at 1000×680, the token's 340 (677 px in the first build, at twice the measure) | no caption cut; `scrollWidth` = `clientWidth` on the body (1042/1042, 642/642) — held |
| 3 | a group heading's top gap, and its form | 16 px; 12 px at weight 500 in the primary ink | 24 px (`--rt-space-6`); the section kicker | — |

What was built beyond the three items, each inside §8: "Depth cap" and "Fan-out limit", and "Compression threshold" and "Iteration cap", are one field to a row (Runtime's rows 19 → 21; the order `REQ-CONFIG-320` fixes is unchanged); the security policy's three list rows stand on the axis (their field took a line of its own, off it); a category's own prose is bounded (Display's introductions and the MCP Servers card's statement ran the pane's width): to the measure at the caption's size, to two measures at the body's size (OQ-547).

Not driven: Personas, Skills, Instructions, Hooks, MCP Servers, Plugins and Tools beyond one capture each at 1400×900; `nocturne` and `high-contrast`. A defect noticed on the way and not repaired: [the web-search card's provider choices](../../defects/the-web-search-setup-cards-provider-choices-stand-on-three-different-edges.md).

## Critique 2026-11-10

The critique is the independent, report-only `review-ui` reading of the pack `9401038db662/iteration-1` (18 findings: 4 high, 7 medium, 7 low; `critique.json` is not committed, `.ui-review/` being ignored). A finding repaired here is `implemented`, not `verified-resolved`: that takes a fresh pack read in a fresh context.

| Finding | Severity | What it read | Outcome |
|---|---|---|---|
| UIR-007 | medium | captions at twice the measure ran 673 px, up to 125 characters a line, against OQ-535's ruling that the measure keeps its 340 px | implemented: captions hold the token (339 px measured); body-size prose is raised as OQ-547 |
| UIR-008 | medium | Plugins' one sentence ran 1044 px: it stands in `.view__empty`, which the prose rule did not reach | implemented: the rule reaches it |
| UIR-014 | low | a group heading at 12 px and weight 500 over 14 px labels, neither `--rt-h5` nor the kicker | implemented: the section kicker |
| UIR-001 | high | seven filled controls on Models ("Add endpoint" and six "Authenticate") where §1.7 allows one per view; predates R-097 | open: an open-question candidate, since `REQ-CONFIG-371` names a row primary |
| UIR-009 | medium | Dictation's "Model source" select is 1042 px wide for three short options, its label above it, off the axis; predates R-097 | open: `PD-CONFIG-005` and OQ-457 are read first |
| UIR-010 | medium | "Sign out" breaks onto two lines in the providers table at 1000×680 (60×36 px against 24 px neighbours); not verified against the base | open |
| UIR-015 | low | "No portable skills were discovered." starts 2 px inside its card's hairline; not verified against the base | open |

Two findings off this surface were repaired in the same change because each is one rule: UIR-003, a bare `strong` at the browser's 700 where §1.4 stops at 500 (now the medium weight; "No task plan" measured 500), and UIR-011, the session browser's empty sentence set right-aligned by its table's last-cell rule (now centred).

## Addendum 2026-11-11 — the category list under four headings

*Written by the model (`claude-fable-5-2`) under [R-098](../../product/requests.md#r-098), for decision D3 of [the information-architecture map](../information-architecture.md); built the same day on `feat/r-097-ui-ux-overhaul`, not landed. The brief above is about a category's body and is unchanged.*

**Authority.** [`PD-CONFIG-008`](../../product/directives/pd-config-008.md#pd-config-008) (the four headings over REQ-CONFIG-268's unchanged order; a heading is text, takes no focus, names its group); REQ-SHELL-153 (the selected entry's rule and its two descriptions; Arrow Up, Arrow Down, Home and End move focus and leave the selection); REQ-CONFIG-269 and -271 (identifiers and the fallback, untouched).

**Content.** Agents: Models, Personas, Runtime. Application: Interface, Display. Extensions: Skills, Instructions, Hooks, MCP Servers, Plugins, Tools. Project and about: Project, About.

**Composition.** A heading is the adopted `SectionLabel` (the kicker: `--rt-text-2xs`, `--rt-tracking-label`, `--rt-text-tertiary`), on the entries' text axis (the entry's 3 px rule plus `--rt-space-3`). A group is set off from the one above by `--rt-space-4`, a heading from its first entry by `--rt-space-1`; the entries keep the control height and their 2 px step. The list scrolls on its own axis where it is taller than the view, and the body keeps its place.

**Accessibility.** `ul[role=listbox]` › `li[role=group][aria-labelledby]` › the heading and a presentational list of `button[role=option]`. The four keys move focus across group borders as though no heading stood there; Tab still reaches each entry. **Not verified:** no screen reader was run over the grouped list.

**Measured after building** (`pnpm app:drive`, 1000×680, no notice above the view): the list is 563 px in a 570 px column, the last entry ends at y = 627 and the status strip begins at 654. With a notice above the view the list is taller than its column and scrolls.

**Not taken.** Moving Interface, Display and About into one group at the foot of the list, with Project in a group of its own: refused by the map's critique (section 7 there).
