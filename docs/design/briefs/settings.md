# Settings — brief

**Status:** proposed
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

One axis per category body. A row's label stands in a label column of `calc(2 * var(--rt-label-column))`; every control, value and action begins at the column's end plus `--rt-space-3`; a caption stands under the control it describes, on that same edge, bounded to `calc(2 * var(--rt-prose-measure))`. A row with no label (an action) begins on the control edge. Rows of one group stand `--rt-space-3` apart; a group heading stands `--rt-space-6` from the group above it. Inside a `Card` the same axis holds.

Relations (published on the Settings root): `align-x` over the first control of every row of the open category (`settings-field`), within 1 px; `text-fit` on row labels (`settings-label`).

| Region | 1400×900 | above 1180 | 1180–1080 | below 1080 | 1000×680 |
|---|---|---|---|---|---|
| category body | label column, control edge, caption under the control | same | same | same | same; the body is 648 px, the control column keeps 396 px; a caption wraps inside it; the body scrolls vertically, never sideways |

Earned surfaces: the two `Card`s the Runtime category already draws. None added.

## 9. Components

`Select`, `Input`, `ToggleSwitch`, `SegmentedControl`, `Button`, `Card`: as built. No gap.

## 10. Disagreements and gaps

- The token's comment says `--rt-label-column` holds the longest label of the product's forms; eleven Settings labels are wider than it. Raised as [OQ-546](../../architecture/open-questions/71-spikes-and-later-questions-38.md#oq-546); the build proceeds under a multiple of the token.
- The mockup draws a field as `.field`, label above control. This brief takes the side label instead, because the token above and UIR-010's repair of the Mission card already chose it for this product's forms, and because a Settings category is scanned by value (§2). Not raised: both arrangements are in the adopted material.

## 11. Evidence plan

Capture: `pnpm ui-audit --views=7 --sizes=1400x900,1000x680`; then `pnpm app:drive` for each of Runtime, Interface, Display, Project and About at both sizes, each after `waitFor ".settings__section"`. Rubric rows to pass: C3, C7, D4, C2.

**Must move** (Runtime, 1400×900): distinct left edges among the rows' first controls 16 → 1; widest caption 1042 px → at most 680 px.
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
