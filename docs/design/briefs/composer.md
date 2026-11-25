# Composer: the money slider's chip, its popover and its default in Settings — brief

**Status:** approved 2026-11-24
**Written:** 2026-11-24 by `design-ui` with the Impeccable skill (`shape`, then a code-led mock and its critique), for
[R-132](../../product/requests.md#r-132). No structured-question channel reached the owner from this session, so every
choice below the binding clauses is the brief's own, marked **assumed** where the record does not settle it, and each
open one is a §10 question with a recommendation.
**Surface:** the composer's money-slider chip and its popover (§7 row "Queue, composer, slash catalogue", slug
`composer`), and the default's row on Settings › Delegation (§7 row "Settings panes and save bar"); mockup sections
`WORKSPACE` → `queue + composer` and `SETTINGS`, read for craft only; nearest built code
`packages/ui/src/WorkspaceView.tsx` (the strip), `packages/ui/src/design-system/overlays.tsx` (`PopoverMenu`),
`packages/ui/src/design-system/forms.tsx` (`StepSlider`), `packages/ui/src/settings/ConfigSettings.tsx` (`RuntimeSettings`,
part `delegation`); theme `rotaris-dim`.
**Not built, and not to be built** before [`PD-ORCH-019`](../../product/directives/pd-orch-019.md#pd-orch-019)'s `lead`
strategy is on `main` ([`PD-ORCH-021`](../../product/directives/pd-orch-021.md#pd-orch-021), "It lands after `lead`").

**The mock.** [`composer/money-slider.mock.html`](composer/money-slider.mock.html) draws every scene below with the
product's own stylesheets (`docs/design/system/*.css`, `packages/ui/src/shell.css`, the Phosphor regular font) and a
token sheet projected from `packages/contracts/src/theme/themes.ts`; [`composer/money-slider.mock.css`](composer/money-slider.mock.css)
part A is the CSS this brief proposes, part B frames the mock. `node docs/design/briefs/composer/render-money-slider.mjs`
renders the seven PNGs beside it. Every model id and configuration in the mock is synthetic.

| Scene | PNG | What it shows |
|---|---|---|
| Regular, idle | [regular-idle](composer/money-slider-regular-idle.png) | a session following the default; keyboard focus on the thumb; two levers set |
| Token burner, mixed levers | [token-burner-mixed](composer/money-slider-token-burner-mixed.png) | the chip in the warning state; moved, set and "stays" marks side by side |
| Money saver, run live | [money-saver-live](composer/money-slider-money-saver-live.png) | the live sentence; the strip `narrow` at a 700 px column; Stop and Queue |
| Every lever set | [all-set](composer/money-slider-all-set.png) | Strong budget chosen, the preview saying why nothing moves |
| Pointer on a stop | [pointed-small-budget](composer/money-slider-pointed-small-budget.png) | Regular committed, Small budget under the pointer: "Next run, if you choose Small budget" |
| The chip | [chips](composer/money-slider-chips.png) | the five stops, hover, focus, open, focus at a warning stop; the strip `full`, `tight`, `narrow` |
| Settings | [settings](composer/money-slider-settings.png) | the Delegation page's Starting section with the new row first, its explanation open |

## 1. Authority

- **PD-ORCH-021** governs the feature. Clause 1: the default is `rotaris.money_slider`, written from Settings ›
  Delegation; a session MAY hold its own stop. Clause 2: a set lever is never moved. Clause 3: what each stop does.
  Clause 4: the classified intent bounds the stop both ways. Clauses 5–6: a tier step and a reasoning step, and their
  ends. Clause 9: the chip beside the model and reasoning chips, the popover on PD-CHAT-001's terms, one sentence per
  stop, the preview for the stop under pointer or focus, set levers marked, intent rules written as rules, no currency
  and no relative cost, the warning state at `strong_budget` and `token_burner`, no confirmation. Clause 10: the chip
  stays enabled in every run state, and the popover says what a move does to a live run.
- **PD-CHAT-001** (rev. 4): the strip's one contour and 34 px band; the icon-led shell, value in the mono face; the
  compact strip's `tight`/`narrow` shortening; the REQ-CHAT-007 two-channel rule; "the panel … and the popover menu are
  shared objects, not second implementations".
- **PD-CHAT-017** (on `main`, not on this branch): the levels a reasoning control offers are the model's; the preview
  names a level by its own name.
- **PD-CONFIG-012**: a Settings page is a ledger; clause 4, an explanation is closed behind its row's control; clause 5,
  origin as a glyph with its words, nothing for a built-in default.
- **PD-ORCH-019** clause 4: the `StepSlider` and its copy are the family this control joins; clause 10, the strategy
  chip on the strip.
- **REQ-CHAT-006** (extended by PD-ORCH-021): enablement in every run state. **REQ-CHAT-007**: tooltip plus accessible
  description. **REQ-CONFIG-263**: the session overrides that set the entry role's model and reasoning level.
- **REQ-SHELL-144, REQ-SHELL-145, REQ-SHELL-149**: names, contrast floors, no state by colour alone.

**Fixed strings:** the five stop names ("Money saver", "Small budget", "Regular", "Strong budget", "Token burner",
clause 9's order); the strategy names as the strategy chip already draws them (`STRATEGY_LABELS`).

**Departures from the mockup:** none in structure — the mockup has no money control. Craft is the strip's and the chip
menus' as built (`shell.css` `.strip-btn`, `.chip-menu__panel`), and the depth slider's.

**Left open by the record:** the copy of every sentence; the preview's layout; how a role group is named; whether the
popover stays open after a choice; where the chip gives way on a narrow strip; where the row stands on the Delegation
page; the panel's width token. Each is settled below or is a §10 question.

## 2. Journeys that cross it

Job story: *when I start work I care about cost or quality differently than I did yesterday, I want one control that
says how heavily the product may spend for me, so that I do not retune strategy, models and limits one by one — and I
want to see what it will change before it changes it, and to trust it never touches what I chose by hand.*

1. **Set the default once.** Settings › Delegation → Starting → Money slider. Press a stop, or Tab to the range and use
   the arrows; the stop's sentence reads under it. The save bar takes the change as every field on the page does
   (REQ-CONFIG-270). Trust point: the origin glyph says which file holds it. Recover: choose Regular, or Discard.
2. **Glance at the chip.** The strip names the session's stop; at the two upper stops it is drawn in the warning ink.
   Its tooltip names the stop and its sentence. Trust point: the chip and the popover say the same stop.
3. **Change it for one session.** Press the chip; the popover opens on the session's stop with keyboard focus on the
   range. Point at a stop to read what the next run would get; press it to choose. Nothing asks. Trust point: the
   preview marks each lever moved, left ("stays") or set. Recover: choose the earlier stop again; the session holds it.
4. **Move it while a run is live.** The popover opens as it does when idle; its first line says that only agents
   delegated from now take the move and the rest waits for the next run. Trust point: each delegated agent's record
   names its stop (clause 10). Recover: move back; agents already delegated keep the stop they started under.
5. **Everything is set.** The preview's rule line says the slider moves nothing and why, and every row reads "set".

The several-agents journey crosses it only through journey 4; the agent table and the delegation graph are untouched.

## 3. Content model and hierarchy

| Region | Holds | Its one primary |
|---|---|---|
| Chip | icon (`ph-coins`), the session's stop, the caret | the stop's name |
| Popover head | "Money slider"; "This session" or "Follows the default"; the link "Default: Regular" | the title |
| Live line (live only) | the clause-10 sentence | — |
| Slider | five stops with their names; the sentence of the stop shown | the thumb |
| Preview | "Next run" (", if you choose X" while pointed); the rule line; Strategy and Child limits; the role table | the role table |
| Settings row | label, the same five-stop slider and sentence, origin glyph, the explanation's control | the slider |

**The preview's rows.** Two facts — Strategy, Child limits — then a table of Role, Model, Reasoning level. The entry
role stands first on its own row, named, with "entry role" beneath. The other roles are **grouped by identical result**
(model, level and both marks): a group's cell lists every role it holds, each name unbroken, so every role is named and
a thirteen-role configuration reads as four or five rows. Under each value one mark line: moved
(`ph-arrow-up`/`ph-arrow-down`, "from <the configured value>"), set (the origin glyph, "set"), or "stays: <reason>"
(clause 5's and 6's ends). An unchanged value carries no mark. A model offering no level reads "none".
A `single` result replaces the role groups with one line: "No agent is delegated: a single run works alone."

**What is not shown:** any figure in a currency, any relative cost, and the budget clamp of clause 8 (internal, and a
reader cannot act on it).

## 4. States

| Region | ideal | empty: first use | empty: cleared | empty: no results | filtered | cannot-show | loading | streaming / partial | error | success | disabled | permission-needed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Chip | stop name; warn ink at stops 4–5 | session follows the default: same drawing, tooltip adds ", the default" | n/a: a stop always exists (default `regular`) | n/a | n/a | `tight`: value kept; `narrow`: icon only, warn ink kept (§10 Q1) | configuration not read: n/a — the chip follows the strip's own loading rule | n/a | write refused: the strip's existing error line (`setError`) | the value changes in place | **never** (clause 10) | n/a |
| Popover head | "This session" · link | "Follows the default" | n/a | n/a | n/a | n/a | n/a | n/a | n/a | aside turns "This session" after a choice | n/a | n/a |
| Live line | absent idle; present live | n/a | n/a | n/a | n/a | n/a | n/a | appears and leaves as the run starts and ends, `role="status"` | n/a | n/a | n/a | n/a |
| Slider | committed stop; pointed stop shown | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | thumb moves; chip follows | n/a: never disabled | n/a |
| Preview | moved / set / stays marks | Regular: values with no marks | n/a | all levers set: rule line says nothing moves | n/a | a model with no levels: "none"; a role with no tier: "stays: no tier" | catalogue not loaded: model ids as configured, level column "—", rule line "Reading the models…" (**assumed**) | n/a | n/a | n/a | n/a | n/a |
| Settings row | stop, sentence, origin glyph | built-in default: no glyph | n/a | n/a | Find reaches it by "money", "slider", "spend" (**assumed**) | n/a | the page's own loading line | n/a | the page's fatal state | the save bar | n/a | n/a |

## 5. Interaction

- **Patterns.** Field name once: a *press-revealed non-modal panel* holding a *discrete slider*; then the glossary's
  words — popover, stop. Not a menu: the panel holds a control and a preview, so it is `role="dialog"` (not modal),
  and pressing a stop **does not close it** (§10 Q2).
- **Pointer.** Press the chip: open; press again or outside: close. Hover a stop: the stop takes `.is-pointed`, the
  sentence and the preview show that stop, the preview title gains ", if you choose <stop>". Leaving the stops: back to
  the committed stop. Press a stop: committed at once, chip updated, ", if you choose" gone.
- **Keyboard.** On the chip, Enter, Space, ArrowUp or ArrowDown opens the panel with focus on the range at the committed
  stop. On the range: ArrowLeft/ArrowDown one stop lower, ArrowRight/ArrowUp one higher, PageDown/PageUp the same, Home
  Money saver, End Token burner; each commits (native range semantics, no confirmation — clause 9). A key clears any
  pointed stop, so what is shown is what has focus. Escape closes and returns focus to the chip.
- **Focus order inside the panel**, DOM order: "Default: Regular" link → range → the preview (focusable only while it
  scrolls). Initial focus: the range. Tab past the last stop closes the panel and moves to the next strip control (the
  run-start chip); Shift+Tab before the link closes it and returns to the chip. After close: the chip.
- **Hover, focus, committed — what each shows.** Committed: thumb position, `--rt-accent` rail to it, the chosen name in
  `--rt-accent-200`, or `--rt-warn` at stops 4–5. Hover: `--rt-hover` behind the stop and the preview of that stop.
  Focus: the `--rt-focus` ring on the thumb (`.step-slider__input:focus-visible`), the preview of the committed stop.
- **The link** "Default: Regular" opens Settings › Delegation (PD-CONFIG-012 clause 3's address) and closes the panel.
- **Reversibility.** Every move is reversible by another move; nothing destroys data; no `ConfirmDialog`.
- **Command palette.** No new command is proposed; the chip is reached on the strip (§10 Q8).
- **Settings row.** The `StepSlider` as the depth cap draws it; Hint and Origin as every row.

## 6. Copy

| Where | String |
|---|---|
| Chip, visible | the stop name |
| Chip, accessible name | Money slider |
| Chip, accessible description | How willing this session is to spend. It moves only what you have not set. |
| Chip, tooltip | Money slider: *<stop>*. *<sentence>* — following the default: Money slider: *<stop>*, the default. *<sentence>* |
| Panel title / dialog name | Money slider |
| Head aside | This session · Follows the default |
| Head link (name) | Default: *<stop>* (Default: *<stop>*. Open Settings › Delegation) |
| Money saver | One agent does the work and delegates nothing, one tier and one reasoning level lower except on a large build. |
| Small budget | The entry role delegates only when it chooses, and every agent it delegates to runs one tier lower. |
| Regular | Runs as configured: this stop moves nothing. |
| Strong budget | The entry role runs one tier and one reasoning level higher, and a run may start more agents. |
| Token burner | Every agent runs one tier and one reasoning level higher; a run may start 40 agents, 12 at once, 4 deep. |
| Range, popover (name / value text) | Money slider for this session / *<stop>*: *<sentence>* |
| Live line | A run is live. This move reaches only agents delegated from now; everything else applies from the next run. |
| Preview title | Next run — pointed: Next run, if you choose *<stop>* |
| Rule, Money saver | Except on a large build, where the entry role keeps its tier and reasoning level. |
| Rule, Small budget | A lead run classifies nothing, so this holds whatever you ask. |
| Rule, Strong budget and Token burner | Except on an answer, a clarification or a micro edit, which run as at Regular. |
| Rule, every lever set | You have set every lever, so no stop moves anything. Clear a value in Settings to let the slider choose it. |
| Fact rows | Strategy · Child limits — value *n* at once · *n* deep · *n* in all; on `single`: none, "nothing is delegated" |
| Table head | Role · Model · Reasoning level; entry row note "entry role" |
| Moved mark (visible / name) | ↑ from *<value>* / One tier higher, from *<value>* (lower; reasoning level; set of child limits; strategy: "Moved by this stop, from *<value>*") |
| Set mark (visible / name) | set / Set for this workspace; no stop moves it · Set in your global configuration; no stop moves it · Chosen for this session; no stop moves it |
| Stays mark | stays: largest tier · smallest tier · no larger model configured · no smaller model configured · no tier · highest level · lowest level |
| No level | none (tooltip: This model offers no reasoning levels; no stop changes it.) |
| No delegation | No agent is delegated: a single run works alone. |
| Settings label / explanation | Money slider / How willing you are to spend, in five stops. A stop chooses the delegation strategy, each role's model tier and reasoning level, and the child limits, wherever you have set none; it states no sum and stops no run. A session can hold its own stop, chosen from the composer's chip. Applies to runs started from now. |

Bounds: a role group's cell wraps between names, never inside one; a model id elides with its full text as tooltip;
every sentence is one sentence (clause 9). No currency, no "cheap", "expensive", "cost" or "$" anywhere (clause 9).

## 7. Accessibility obligations

- **Names** (REQ-SHELL-144): chip "Money slider"; dialog by its title; the range "Money slider for this session"
  (Settings: its label); the link's full name above; every mark glyph a `role="img"` with the words of §6.
- **Value** on the range: `aria-valuetext` = stop and sentence, as `StepSlider` writes; `aria-describedby` → the
  sentence, the rule line and, live, the live line.
- **Live region**: the live line is `role="status"`, polite; no announcement per move (the valuetext carries it).
- **Tables**: `th scope="row"` for roles and facts, `scope="col"` for the head; the preview `section` labelled by its title.
- **State not by colour alone** (REQ-SHELL-149): the warning ink always stands with the stop's name (the tooltip at
  `narrow`, as PD-CHAT-001 rev. 3 accepts for every shortened control); moved marks carry "from", set marks "set".
- **Contrast** (REQ-SHELL-145): `--rt-warn` on `--rt-chrome` and on `--rt-surface`, and `--rt-text-tertiary` marks on
  `--rt-surface`, are measured by `pnpm theme-proof` once added to its pairs (§11).
- **Motion**: the panel's `rt-rise` and the thumb's transition collapse under reduced motion as `StepSlider`'s do.

## 8. Composition intent

Density tier: the chip menus' (compact, `--rt-text-xs`), mockup `queue + composer`. The panel is the one earned surface
(it floats: `--rt-surface`, hairline, `--rt-shadow-lg`, `--rt-radius-lg`); inside it nothing is a card — two hairline
`--rt-divider` rules separate slider from preview and the table's rows. Width: `calc(var(--rt-prose-measure) +
var(--rt-space-24))` in the mock, to become a named token (§10 Q9). The head and slider stay in view; the preview
scrolls beneath them when the window is short.

Layout contract (`data-ui` ids): `money-chip` `hit-test`; `money-panel` `containment` in the viewport and
`viewport-scroll` x false; `money-slider` `text-fit` on each stop name; `money-preview` `align-x` — the fact values and
the Model column share one x (both tables 40 % first column); `spacing-token` for the panel's gaps.

| Region | 1400×900 | above 1180 | 1180–1080 | below 1080 | 1000×680 |
|---|---|---|---|---|---|
| Chip | value shown (`full`/`tight`) | as 1400 | dock width decides | dock width decides | `narrow` with the run panel: icon, warn ink kept |
| Panel | above the chip, full preview | same | same | same | max height = space above the chip; preview scrolls, head and slider stay |
| Settings row | slider up to `calc(var(--rt-space-8) * 15)` | same | same | shrinks to its flex basis; names wrap | names wrap in two lines, never inside a word |

## 9. Components

- **Chip:** `StripMenuButton`'s shell (`.strip-btn`), new **`tone="warn"`** (mock CSS A2), inside a `strip-control`
  `data-testid="chip-money"`; placed after the reasoning chip, before run-start. Not `PopoverMenu`: its panel is a menu.
- **Panel — gap G17, proposed for `docs/design/README.md` §4.2:** *PopoverPanel*, a press-revealed non-modal panel
  holding a control. Shares `PopoverMenu`'s trigger shells, `panelPlacement` and `.chip-menu__panel`'s craft; differs in
  `aria-haspopup="dialog"`, `role="dialog"`, focus moving into the panel, staying open after a change. Demanded by
  PD-ORCH-021 clause 9.
- **Slider:** `StepSlider`, extended: any step count (mock CSS A1 generalises `data-steps="3"`), a per-step `tone`, and
  a render slot for the shown step so the popover draws its preview where Settings draws the sentence.
- **Marks:** `Origin` (`settings/page.tsx`) moved into the design system with a fourth origin, `session`
  (`ph-chat-circle-text`, **assumed**), since the preview uses it outside Settings.
- **Table:** the design system's `Table`, compact, for the two preview tables. **Link:** `Button` variant `btn-link`.
- **Settings row:** `settings__action` with `Hint` and `Origin`, as the depth cap.

## 10. Disagreements and gaps — open questions, each with a recommendation

**Ruled by the owner, 2026-11-24: all thirteen as recommended** ("Accept all", shown the brief's summary and five of its
renders, in the session of [R-132](../../product/requests.md#r-132)). Each **Recommend** below is therefore the decision,
and the choices this brief marks **assumed** stand with it. The owner ruled them personally, so none is an open question
for the orchestrator's consortium. Until that ruling this line read: *"None of these is raised in
`docs/architecture/open-questions.md` yet; the orchestrator takes numbers and rules them."*

Two of them reach outside this surface and are owed where they land, at build: 5 leaves the depth slider's "main agent"
to a request of its own, and 10 changes the Delegation strategy row's explanation, which is `PD-ORCH-019`'s surface.

1. **Compact order.** PD-CHAT-001 rev. 3 lists which controls shorten at `tight` and `narrow`; the chip is not on it.
   Measured 2026-11-24 in the built app: dock 920 px at 1400×900 with the inspector closed, `full`, about 760 px of controls and gaps (the sum of the measured widths); with
   the inspector open the dock is 679 px and `narrow`. **Recommend:** the stop's name stays at `tight` (the directive
   asks the chip to name it) and gives way at `narrow`, as the mock draws; the thresholds are re-measured with the
   chip's longest value, "Strong budget".
2. **"On the terms of PD-CHAT-001"** — does a dialog panel that stays open after a choice meet them? **Recommend:** yes:
   PD-CHAT-001 fixes the press-revealed panel, its craft and the shared objects; the menu role is one implementation.
3. **Each arrow commits.** Mid-run, arrowing from Regular to Money saver passes Small budget, and an agent delegated in
   that instant takes it. **Recommend:** commit per step (no confirmation, clause 9; each record names its stop).
4. **Role groups or one row per role.** **Recommend:** groups by identical result, every role named.
5. **"Entry role" or "main agent".** The depth slider's shipped copy says "main agent"; the glossary says entry role.
   **Recommend:** entry role here; raise the depth slider's word separately.
6. **Warning ink inside the popover** (the chosen name at stops 4–5), beyond the chip clause 9 names. **Recommend:** keep.
7. **Returning a session to the default.** The record gives no act. **Recommend:** none now; a request if wanted.
8. **A palette command** to set the session's stop. **Recommend:** none until asked (no requirement states one).
9. **Width token.** **Recommend:** `--rt-popover-panel-width` in `themes.ts`'s size group, at the mock's value.
10. **The Delegation strategy row** shows `orchestrator` while unset even where the slider will choose `single` or
    `lead`. **Recommend:** its explanation gains "While unset, the money slider chooses it."
11. **Row placement.** **Recommend:** first under Starting, before Delegation strategy, which it chooses.
12. **Child limits in the preview**, which clause 9 does not require. **Recommend:** keep; it is most of what the upper
    stops change.
13. **Every lever set, warning still drawn** at stops 4–5 — clause 9 holds it; noted, no change.

## 11. Evidence plan

Capture after build: `pnpm ui-review --views=workspace,settings` at 1400×900 and 1000×680, then `pnpm app:drive`:
`click "[data-testid=chip-money] .strip-btn"`, `waitFor "[data-ui-component=PopoverPanel]"`, `shot`; `chord End`, `shot`
(warning); `click "[data-step-stop=1]" --settle` with the pointer held, `shot`; a scripted run started, `waitFor
"#money-live"`, `shot`; `resize 1000 680`, `shot`; `resize 1179 900` / `1181 900`, `1079 900` / `1081 900`; Settings ›
Delegation, `waitFor "#money-default"`, `shot`. Rubric rows to pass: F1–F4, C1, C3, C6, C8, D3, D4.

**Must move:** the strip's `tight` and `narrow` thresholds (PD-CHAT-001 rev. 3's 900 and 700 px), re-measured with the
chip; `composer-proof` and `settings-proof` gain the chip and the row. **Must hold:** the strip one 34 px band
(`composer-proof`); the panel inside the viewport (`ui-audit` containment); the depth cap's row unchanged
(`settings-proof`); every theme pair at its floor (`pnpm theme-proof`).

The detector (`impeccable detect`) on the mock found two items, both in `shell.css`'s checkpoint dialog and neither
in this surface; nothing of the mock's own was flagged.
