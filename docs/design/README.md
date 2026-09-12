# Design Brief — Rotaris Desktop Interface

**Status:** approved design language; information architecture governed by the specification.
**Audience:** the UI architect and whoever implements the interface after the Architecture Gate.
**Scope:** one Electron desktop application. There is no command-line interface, no terminal user
interface, and no embedding API (`docs/spec/README.md`; domains 17 and 18 are retired).

This document does four things: it states the design language concretely enough to build a themed
component from, it states the adoption rule and why it exists, it reconciles the design material
against `REQ-SHELL-023`, and it maps the component inventory onto the affordances the specification
demands.

---

## 1. The design language

Everything below is in `docs/design/system/`. `styles.css` is the single entry point; it imports
`tokens/colors.css`, `tokens/typography.css`, `tokens/spacing.css`, `tokens/effects.css`, then
`base.css`, `components.css`, `motif.css`. Token names are normative — cite the token, never a
literal colour or pixel value.

### 1.1 The ground

A true neutral dark grey. OKLCH chroma is exactly `0` on every ground and text token: no hue tint,
never blue-violet, never sepia, never pure black. Ground levels sit five lightness points apart so
panels, cards and hover states stay legibly separate.

| Token | Value | Use |
|---|---|---|
| `--rt-bg` | `oklch(21% 0 0)` | window ground, view background |
| `--rt-surface` | `oklch(25% 0 0)` | cards, dialogs, raised panels |
| `--rt-surface-2` | `oklch(29% 0 0)` | inset tracks, meter grooves, code chips |
| `--rt-chrome` | `oklch(23% 0 0)` | title bar, nav rail, status strip, side panels |
| `--rt-hover` | `oklch(30% 0 0)` | resting hover wash |
| `--rt-overlay` | `oklch(12% 0 0 / 0.72)` | modal backdrop |

Text ramp: `--rt-text` `oklch(94% 0 0)` (primary), `--rt-text-secondary` `80%`,
`--rt-text-tertiary` `68%` (captions, passive metadata), `--rt-text-disabled` `52%`.

### 1.2 The accent

One brand accent, violet, OKLCH hue **292**, shipped as a nine-stop ramp `--rt-accent-100` …
`--rt-accent-900`. `--rt-accent` aliases `--rt-accent-500` = `oklch(59% 0.160 292)`.

Selection and active states are **a tint plus accent ink**, never an outlined box and never a filled
block. Three tint strengths exist and no fourth may be invented:
`--rt-accent-tint-07`, `--rt-accent-tint-10`, `--rt-accent-tint-14`.

`--rt-accent-300` is the readable accent shade for text and links on the dark ground.
`--rt-accent-200` is link hover.

### 1.3 The three-axis state colours

The brand's coordinate-system flourish is made functional: three axis colours are the product's own
agent lifecycle states. This is the single most load-bearing idea in the language.

| Axis | Hue | Meaning | Ramp | Product alias |
|---|---|---|---|---|
| **X** | amber, ~86 | **waiting** | `--rt-axis-x-100…900` | `--rt-wait` = `--rt-axis-x-500` |
| **Y** | teal, 165 | **running** | `--rt-axis-y-100…900` | `--rt-run` = `--rt-axis-y-500` |
| **Z** | violet, 292 | **done** | `--rt-axis-z-*`, aliasing the accent ramp | `--rt-done` = `--rt-axis-z-500` |

Two colours sit **outside** the triad, deliberately, because they are exceptions rather than
coordinates:

- `--rt-danger-500` `oklch(64% 0.200 25)` — failure, destructive actions. Alias `--rt-fail`.
- `--rt-info-500` `oklch(70% 0.130 210)` — informational, idle.

A second, parallel reading of the same three hues covers connection and provider health, and the two
families are never mixed on one surface: `--rt-ok` (= axis Y, sound), `--rt-warn` (= axis X,
attention), `--rt-fail` (= danger, broken).

Derived families that ride the same triad:

- **Diff.** `--rt-diff-add` / `--rt-diff-add-bg` ride axis Y; `--rt-diff-del` / `--rt-diff-del-bg`
  ride danger; `--rt-diff-meta` rides info. Both washes are at 10 % opacity so code syntax colour
  survives underneath; line numbers never take a wash.
- **Pill fills.** `--rt-fill-accent` / `--rt-fill-x` / `--rt-fill-y` / `--rt-fill-danger`, each a
  ~16–17 % translucent wash of that hue's 500 stop, each carrying its own light ink token
  (`--rt-fill-*-ink`). Softer than the 800 block without going pastel.
- **Data-viz.** `--rt-viz-1` … `--rt-viz-6`, built from the three axes plus hue midpoints, used **in
  order**; `--rt-viz-grid` for chart rules. Never invent a chart colour outside this set.

Colour never carries a fact on its own anywhere in this product (`REQ-SHELL-149`,
`REQ-TRACE-261`, `REQ-NOTIFY-258`). Every state is icon-plus-text or dot-plus-word.

### 1.4 Type

Three faces, all self-hosted OFL variable fonts declared by `@font-face` in
`tokens/typography.css`. No Google Fonts, no network dependency — the application renders identically
offline.

- `--rt-font-display` — **Space Grotesk**. Headings, view titles, the wordmark.
- `--rt-font-body` — **Manrope**. All body and UI text.
- `--rt-font-mono` — **JetBrains Mono**. Every number, path, identifier, command, hash, branch name,
  token count and diff line. If it is data, it is monospaced.

**Three weights, and only three.** `--rt-weight-body: 400` for body, `--rt-weight-medium` /
`--rt-weight-display: 500` for headings, labels and controls, and `300` for large mono numerals.
Nothing in the system goes above 500. Hierarchy is size, colour and space — never weight.

Sizes: `--rt-text-2xs: 10`, `--rt-text-xs: 11`, `--rt-text-sm: 12`, `--rt-text-base: 14`,
`--rt-text-md: 16`. Headings: `--rt-h6: 11`, `--rt-h5: 16`, `--rt-h4: 20`, `--rt-h3: 24`,
`--rt-h2: 32`, `--rt-h1: 44`.

`h6` is not a heading in the usual sense — it is the **section kicker**: 11 px, weight 500,
uppercase, `--rt-tracking-label` (`0.075em`), painted in `--rt-text-tertiary`. It is also available
as `.card-kicker` and as the `SectionLabel` component, and it is the one exception to sentence case.

Tracking: `--rt-tracking-tight` (`-0.022em`) on display sizes, `--rt-tracking-wide` (`0.05em`),
`--rt-tracking-label` (`0.075em`). Leading: `--rt-leading-tight` `1.12` for headings,
`--rt-leading-body` `1.62` for prose.

### 1.5 Spacing

An **8 px module**: `--rt-space-1: 4` through `--rt-space-24: 96`
(4/8/12/16/20/24/32/40/48/64/96). `--rt-grid-unit: 32px` is the visible module the grid motif is
drawn on and the fade length of every divider — so "grid" is the actual layout discipline, not
only a background pattern.

### 1.6 Radii

`--rt-radius-sm: 5`, `--rt-radius-md: 8`, `--rt-radius-lg: 14`, `--rt-radius-pill: 999`. Every
surface uses one of the three. There are no one-off radii.

### 1.7 Borders and elevation

**Flat by default.** A 1 px hairline defines an edge; a shadow only ever means *this floats*.

- `--rt-border` `oklch(31% 0 0)` — ordinary hairline, sits close in value to the surface it bounds.
- `--rt-border-strong` `oklch(40% 0 0)` — emphasis edges, dot-grid dots, scrollbar thumb.
- `--rt-border-panel` `oklch(28% 0 0)` — structural panel seams.
- `--rt-divider` — `color-mix(in oklch, var(--rt-text) 9%, transparent)`, the faintest rule in the
  system, for row separators and internal rules.
- `--rt-focus` `oklch(83% 0.10 292)` — a 2 px ring is the **only** focus treatment. Never a
  colour-only focus cue.

Shadows: `--rt-shadow-sm` is a 1 px ring and nothing else. `--rt-shadow-md` and `--rt-shadow-lg` add
neutral ambient shadow and are reserved for dialogs, popovers, toasts and the command palette.
Cards at rest carry no shadow.

Forbidden throughout: glow, coloured shadows, inset highlights, bevels, gradient fills,
backdrop-blur or glass, photography, decorative illustration.

Hover is a `color-mix` wash at 7–14 % toward the accent or toward neutral; pressed goes one ramp
step darker. **No scale or shrink effects anywhere.**

**One filled control.** The primary button is the only filled surface in the system; every other
control is a hairline or bare text, so a dense screen carries exactly one accent surface.

### 1.8 Motion

Sparse and purposeful. Short distances, decelerating ease, nothing springy.

`--rt-ease` `cubic-bezier(.4,0,.2,1)` for in-place state changes; `--rt-ease-out`
`cubic-bezier(0,0,.2,1)` for entrances; `--rt-ease-in` `cubic-bezier(.4,0,1,1)` for exits.
Durations `--rt-duration-fast` / `--rt-duration` / `--rt-duration-slow` for hover-and-press /
state change / enter-and-exit respectively, and `--rt-shift` as the only entrance distance.

**No animation in conversation content.** Animation belongs to status indicators only. Exactly two
infinite animations are permitted in the whole system: `.status-dot.is-pulsing` (1.6 s opacity
breathe, used only while a state is actively running) and `.spinner` (0.8 s).

Reduced motion is resolved by `REQ-SHELL-135` — an in-app setting first, then an OS signal, then
motion on — read at each animation start rather than cached. The `prefers-reduced-motion` block that
ships in `base.css` implements only the OS leg and is therefore not sufficient on its own.

Three motion figures in the imported material need a decision before implementation:

1. `tokens/effects.css` ships **90 / 160 / 240 ms** and a **3 px** shift.
   `guidelines/motion-tokens.html` documents **100 / 180 / 260 ms** and a **4 px** shift. The two
   disagree in the source material and both are reproduced verbatim. `REQ-NOTIFY-022` fixes the
   default theme's acknowledgement enter at **160 ms** and exit at **120 ms**, which agrees with
   `tokens/effects.css`; that is the recommended tiebreaker, but it is a decision for the
   Architecture Gate, not a silent edit.
2. `REQ-NOTIFY-022` also fixes the acknowledgement travel at **12 px**, which neither shift value
   expresses. The theme needs a distinct acknowledgement-travel token; `--rt-shift` is not it.
3. `base.css` sets `:focus-visible { outline-offset: 2px }`, painting the ring **outside** the
   control's bounds. `REQ-SHELL-148` requires self-painted navigation controls and divider handles
   to draw the ring **entirely within their own bounds**. Those controls need an inset focus
   treatment at the same width and colour.

### 1.9 Iconography

**Phosphor icons**, regular and fill weights. No emoji anywhere in product or brand copy, no
unicode-symbol icons, no PNGs.

Icon colour always carries meaning and never decoration, at most one coloured icon per row
(`guidelines/icon-colors.html`):

| Ink | Meaning |
|---|---|
| `--rt-text-secondary` | default — the icon inherits text and has no colour of its own |
| `--rt-text-tertiary` | passive metadata beside dim caption text |
| `--rt-accent-400` | skills and capabilities — the brand's own objects |
| `--rt-info-500` | tool invocations, matching mono tool names in logs |
| `--rt-run` / `--rt-ok` | live activity, healthy connection |
| `--rt-wait` / `--rt-warn` | blocked on input, nearing a limit |
| `--rt-fail` | failures and destructive actions only |
| `--rt-done` | completed lifecycle state |

If an icon is not one of those meanings, it stays neutral.

The system currently loads Phosphor from `unpkg.com/@phosphor-icons/web`. **That must be replaced by
a bundled local copy before implementation.** This is a desktop application that renders offline, and
`REQ-SHELL-139` requires the About page to render with zero network requests.

The mark at `docs/design/assets/rotaris-mark.svg` is final — the primary circle in accent violet with
the X (amber) and Y (teal) axis circles breaking its edge. Use it as-is; never redraw it, never
invent a variant. `REQ-SHELL-034` requires a graceful degradation when it cannot be rendered: a
letter placeholder "R" in a dashed accent frame.

### 1.10 Motif

`.rt-grid-bg` (32 px line grid) and `.rt-dot-grid-bg` (32 px dot grid) appear behind hero sections
and empty states **only** — never under dense data. `.rt-fade-rule` is a rule that dissolves to
transparent over one grid unit at each end rather than stopping cleanly. `.rt-axis-mark` is the
three-stroke coordinate mark: a decorative device, never a stand-in for the logo.

### 1.11 Copy voice

Direct, technical, unadorned. Sentence case everywhere — titles, buttons, nav labels ("New session",
not "New Session") — with the section kicker as the only exception. Second person in product copy and
empty states; first person plural only in brand statements. Numbers exact and monospaced
(`612,480 tok`, never "600K+"). States named plainly (`running`, `waiting`, `done`, `failed`), never
euphemised. No filler: every panel earns its place.

Where the specification fixes a string — an accessible name, a tooltip sentence, an error message,
an empty-state body — the specification's wording wins over the voice guidance. The voice governs
copy the specification leaves to the implementation.

### 1.12 Two wiring notes carried over from the import

- The stylesheets and specimen cards reference `assets/logo.svg` and `assets/fonts/*` relative to
  `docs/design/system/`. In this repository the extracted binaries live in `docs/design/assets/`
  under content-hashed names. Those paths must be re-pointed when the system is wired into a build.
- `guidelines/colors-axis.html` prints slightly different chroma figures for the X and Y 500 stops
  than `tokens/colors.css` carries. **`tokens/colors.css` is authoritative**; the specimen card is
  illustrative.

---

## 2. The adoption rule

> **The design language is adopted. The information architecture is not.**

**Adopted, and authoritative for this product:** tokens, colour, typography, spacing, radii,
elevation, motion, the component inventory, the visual specification of each component, the
iconography rules, the motif, and the copy voice. Everything in section 1 of this document.
`REQ-GIT-152` and `REQ-TRACE-261` are examples of the specification explicitly handing rendered
appearance to the design system; that hand-off is general.

**Not adopted:** which screens exist, what is on them, how they are grouped, what they are called,
what order they appear in, and which tabs a screen carries. Those come from `docs/spec/`.
`REQ-SHELL-023` is the single definition of the primary views and their order. `REQ-SHELL-027` fixes
their labels, `REQ-SHELL-049` their shortcuts, `REQ-CONFIG-268` and `REQ-CONFIG-269` the Settings
categories, `REQ-LIBRARY-103` the Library tabs, `REQ-TRACE-232` the board columns.

**Why.** The design language was designed fresh for this product. The screen structure in the design
material was derived from a different product's requirements documentation, outside the clean-room
process that produced `docs/spec/`. Reading it was not a boundary breach — it is not reference
source, and it is not sealed material — but building this product's structure from it would put an
un-cleared derivation into the product's information architecture, where the specification already
holds a cleared one. Where the two disagree, the specification governs, without exception and without
negotiation.

**How to read `docs/design/mockup/rotaris-ui-mockup.dc.html`.** It is a reference for *how the
language is used*: density, composition, how a transcript row is actually drawn, how an agent list
row balances a status dot against a context ring, how a settings pane arranges its fields, how much
air a card gets. Its sample requirement identifiers have already been renamed onto this project's
convention. Read it for craft. Do not read it for structure, and do not treat any screen in it as a
statement that such a screen exists.

The design system's own `NavRail` component was stripped of its built-in view list for exactly this
reason: it takes its items from the caller, and the caller takes them from `REQ-SHELL-023`.

---

## 3. View reconciliation

`REQ-SHELL-023`: *the window hosts exactly seven primary views in this fixed order: Overview,
Workspace, Mission, Requirements, Git, Library, Settings.* `REQ-SHELL-027` fixes the rail labels as
exactly those seven words. `REQ-SHELL-026` fixes Overview as the startup view. `REQ-SHELL-049` binds
`Ctrl+1` … `Ctrl+7` to them in that order.

The design material shows **six** rail entries: Home, Workspace, Reqs, Git, Library, Settings.

Nothing below changes anything. The specification governs; this section states exactly where the
design does not yet cover it, and that list is the design work still to do.

### 3.1 Specified view → design material

| # | View (`REQ-SHELL-023`) | Design material that serves it | Coverage |
|---|---|---|---|
| 1 | **Overview** | mockup `Home` screen; mockup `Overview strip` | **partial** |
| 2 | **Workspace** | mockup `Workspace` screen (transcript column, queue + composer, agents panel, inspector), slash-catalogue popover, inline approval card, live terminal preview block, `Question stepper` modal | **good** |
| 3 | **Mission** | *nothing* | **none** |
| 4 | **Requirements** | mockup `Requirements` screen (Kanban / List / Graph + detail panel), `Review view` modal, `New requirement` dialog | **good** |
| 5 | **Git** | mockup `Git` screen (worktrees column, commits table, per-file diff card) | **partial** |
| 6 | **Library** | mockup `Library` screen (three tabs) | **partial, wrong tab set** |
| 7 | **Settings** | mockup `Settings` screen (Providers / Personas / Skills tabs + save bar) | **partial, 3 of 13 categories** |

### 3.2 Specified views and surfaces with no design

This is the backlog.

**Mission — no design at all.** `REQ-MONITOR-274` requires a live delegation graph and an agent
activity table, with actions to open an agent, pause the selection (graceful, valid only for the
run-level agent, carrying an availability explanation) and cancel the selection (marked destructive),
with pause and cancel sitting under the graph. `REQ-MONITOR-275` adds a strategy selector and a depth
control mirroring the delegation settings, and row-by-row activity-table refresh under the
hidden-surface deferral of `REQ-MONITOR-039`. `REQ-MONITOR-276` requires a refused pause for a
non-run-level agent. `REQ-MONITOR-038` requires the Mission tree, the Workspace sidebar tree and the
Overview agent-tree card to show the same agent set in the same states, within a 250 ms visibility
budget — so Mission's tree is the same component as the other two, not a variant.

**Overview — the specified body is not drawn.** `REQ-MONITOR-165` requires a user-resizable
two-column layout (right column 340 px default, 260 min, 560 max; left column 320 min; the metric
card grid reflowing from four columns to two below 1080 px). `REQ-MONITOR-173` fixes the right
column's contents and their order: cloud-credit tile first, then subscription limits, then an
agent-tree card linking to Mission, then an improvement-proposals card with per-proposal
approve/reject/defer rows. `REQ-MONITOR-164` fixes the header (`session {name} · {status} ·
{runtime}`, or a statement that none is active, plus list-sessions and new-session actions).
`REQ-MONITOR-167` (tool-calls card with up to five per-tool chips), `REQ-MONITOR-168` (repository
card), `REQ-MONITOR-169` (agents card with the `depth {d} / {cap} · fan-out {n} / {limit}` caption)
and `REQ-MONITOR-171` (sessions card as a run switcher) have no design. The mockup's `Home` screen
draws four cards of its own choosing and its `Overview strip` draws four more; between them they
cover the tokens card (`REQ-MONITOR-166`, with its sparkline) and parts of the sessions and
repository cards, and nothing else in the list.

**Git — the specified structure is not drawn.** `REQ-GIT-076` requires two user-resizable columns
(280 px minimum each) holding a "Worktrees" card and a "Commit history" card, with a "Session
checkpoints" card and an "Agent commit policy" card beneath them. `REQ-GIT-075` fixes the header
row: current branch, monospace `ahead <n>  behind <m>` sync label, Refresh, New worktree, Merge
selected. `REQ-GIT-077` fixes the worktrees table columns as `Branch | Session | State | Ahead |
Behind | Files | Actions` with multi-row selection. `REQ-GIT-078` fixes the history columns as
`Commit | Message | Author | Age`. `REQ-GIT-086` fixes the checkpoints card. The mockup draws
worktrees as a column of cards rather than a selectable table, has no checkpoints card and no agent
commit policy card, and its commits table is per-worktree rather than the specified history table.
The worktree-creation and deletion dialogs (`REQ-GIT-115` onward) have no design.

**Settings — ten of thirteen categories have no design.** `REQ-CONFIG-268` fixes the categories and
their order: **Models, Personas, Runtime, Interface, Display, Skills, Instructions, Hooks, MCP
Servers, Plugins, Tools, Project, About.** The mockup draws Providers, Personas and Skills. Personas
and Skills map onto `personas` and `skills`; "Providers" is the design's name for what the
specification calls **Models** (`REQ-CONFIG-269` fixes the identifier as `models`). Runtime
(`REQ-TOOLS-186`, `REQ-TOOLS-191`), Interface (`REQ-SHELL-133` theme dropdown, `REQ-SHELL-070` reset
panel sizes), Display (`REQ-CHAT-166`), Instructions, Hooks, MCP Servers (`REQ-MCP-108`), Plugins,
Tools, Project and About (`REQ-SHELL-138` – `REQ-SHELL-143`) have no design. The mockup's save bar
does serve `REQ-CONFIG-270`, which requires Save, Discard and the save-status indicator to be visible
and operable from every category.

**Library — the tab set is wrong and the search field is missing.** `REQ-LIBRARY-103` fixes exactly
three tabs in order — **Prompts, Artifacts, Improvement proposals** — addressable by the stable names
`prompts`, `artifacts`, `proposals`, plus a single search field (placeholder "Search prompts,
artifacts, and proposals…", accessible name "Search Library") that live-filters on every keystroke
across all three tabs (`REQ-LIBRARY-104`). The mockup draws Sessions, Artifacts, Improvement
proposals and no search field. **Prompts has no design.**

**Auxiliary windows have no design.** Persona pop-out windows (`REQ-SHELL-072` – `REQ-SHELL-078`,
`REQ-MONITOR-068` – `REQ-MONITOR-071`) and the terminal pop-out window (`REQ-SHELL-079` – `REQ-SHELL-111`)
are separate top-level windows with their own tab strips, controls rows, empty states and
accessibility sweeps (`REQ-SHELL-146`). The mockup shows only an inline terminal preview block.

**Shell chrome partially drawn.** The title bar (`REQ-SHELL-033` – `REQ-SHELL-037`) needs a version
label, a session chip with a status dot and status word, and an improvement-analysis indicator; the
mockup's title bar has none of the three. The status strip (`REQ-SHELL-038` – `REQ-SHELL-047`) needs
nine named items with a strict link-versus-inert-text distinction, five safety flags in fixed order,
and two responsive-elision thresholds; the mockup draws a shorter, differently ordered strip. The
persistent-notice banner slot below the title bar (`REQ-SHELL-024`, `REQ-SHELL-114`) is absent from
the mockup entirely. The compact overlay drawers below 1180 px (`REQ-SHELL-059` – `REQ-SHELL-063`)
have no design.

**Modal surfaces with no design.** The command palette (`REQ-SHELL-051` – `REQ-SHELL-053`), the
keyboard-help dialog (`REQ-SHELL-054`), the unsaved-settings dialog (`REQ-SHELL-124`), the quit
prompt (`REQ-SHELL-119`), the "Start session" dialog (`REQ-SHELL-125`), the indeterminate merge and
checkpoint progress dialog (`REQ-SHELL-117`), the kill-confirmation dialog (`REQ-SHELL-092`), and the
desktop approval dialog (`REQ-TOOLS-063`). The design system ships a `CommandPalette` component but
the mockup never places it.

**All three themes but one.** `REQ-SHELL-128` requires three built-in themes in order —
`rotaris-dim` (default), `nocturne`, `high-contrast` — each declaring a light/dark flag, seven token
groups and hard accessibility floors (`REQ-SHELL-129`), each rendering all seven views without error
(`REQ-SHELL-132`), each carrying a display label and a one-line description (`REQ-SHELL-133`). The
imported design language is **one palette**. `nocturne` and `high-contrast` are undesigned, and the
token set has no light/dark flag and no declared theme metadata.

### 3.3 Design screens with no specified counterpart

Each of these was drawn against the other structure. None of them is adopted as structure; each is
still useful as a drawing of language.

| Design screen or element | Disposition |
|---|---|
| Nav label **"Home"** | Not adopted. `REQ-SHELL-027` fixes the label as **"Overview"**. |
| Nav label **"Reqs"** | Not adopted. `REQ-SHELL-027` fixes the label as **"Requirements"**, and `REQ-SHELL-029` forbids ellipsis and clipping at 9 px, requiring the rail to exceed its declared 68/54 px widths where the label needs it. The rail width must be re-derived for the long label, and re-derived again after every theme change. |
| **Overview strip** — an expandable four-card drawer hanging off the status bar | No specified counterpart. The status strip is fixed by `REQ-SHELL-038` and `REQ-SHELL-039`; it has no expansion. Its four cards belong on the Overview view's right column instead (`REQ-MONITOR-173`, `REQ-MONITOR-166`). |
| Library **"Sessions"** tab | Not a Library tab. `REQ-LIBRARY-103` closes the set to `prompts`, `artifacts`, `proposals`. The session-list drawing serves the Overview sessions card (`REQ-MONITOR-171`) and the session browser reached from `REQ-SHELL-126`. |
| **Review view** modal (delivery review, evidence walkthrough, scope-drift notice, Accept & merge / Request changes / Reopen) | Serves the Requirements review surface (`REQ-TRACE-417` onward). Its structure must be reconciled against those requirements rather than adopted. |
| **New requirement** dialog | Serves `REQ-TRACE-434` onward (editing and creating requirements). Same treatment. |
| **Provider auth modal** (device code) | Serves `REQ-PROVIDER-012`, which additionally requires the **polling interval** and **how long the code stays valid** to be shown. The mockup shows neither. |
| **Question stepper** modal | Serves the structured-question flow (`REQ-TOOLS-158`, `REQ-CHAT-046` structured-question rows, `REQ-CHAT-051` trailer rows). |
| **First-launch guide** | Serves `REQ-WORKSPACE-007`, `REQ-WORKSPACE-008` and `REQ-WORKSPACE-011`. Note that those requirements make the chooser a deferred post-first-paint modal with a shared delay, and add a machine-setup modal the design does not show. |
| Composer permission-mode `SegmentedControl` gated by a browser `confirm()` | The affordance is specified (`REQ-TOOLS-067` onward, mid-session mode change); the `window.confirm` is mockup scaffolding, not a design decision. A real confirmation is `REQ-NOTIFY-009` / `ConfirmDialog`. |

---

## 4. Component inventory against the specification

The design system ships **27 components** — 22 primitives and 5 composed patterns — plus the
component classes in `components.css`. Patterns are compositions of the primitives, not new
inventory.

Existing: `Button`, `Tag`, `StatusDot`, `ToggleSwitch`, `SegmentedControl`, `Kbd` (core);
`Input`, `Select` (forms); `Card`, `KpiCard`, `SectionLabel` (surfaces); `Sparkline`, `MeterBar`,
`ContextRing`, `Table` (data); `Dialog`, `Tooltip`, `Toast` + `ToastStack`, `Spinner` (feedback);
`Tabs`, `NavRail`, `CommandPalette` (navigation); `TableCard`, `PageHeader`, `EmptyState`,
`LogPanel`, `ConfirmDialog` (patterns).

### 4.1 Affordance → component

| Specified affordance | Serving component | Fit |
|---|---|---|
| **Command palette** — `REQ-SHELL-051` – `REQ-SHELL-053` | `CommandPalette` | Close. Needs: fixed 560×420, title "Rotaris commands", accessible name "Rotaris command palette", heading "Commands", filter placeholder "Type an action…", results-list accessible name "Available commands", first row auto-selected whenever there are results, close-then-run activation order. The component's `groups` model is richer than the specified flat list; hidden keywords must never render (`REQ-SHELL-053`). |
| **Navigation rail** — `REQ-SHELL-027` – `REQ-SHELL-032` | `NavRail` | Close, and correctly view-list-agnostic. Metrics already agree: rail 68 px, item 54 px, icon 17 px, label 9 px (`REQ-SHELL-129`). Needs: **button** semantics rather than list semantics — no arrow navigation, Tab/Shift+Tab only (`REQ-SHELL-153` states this difference is deliberate); checked/unchecked mutual exclusion; tooltip and accessible description "Open {Label}"; pointing-hand cursor; per-button tab stop. |
| **Approval dialog** — `REQ-TOOLS-063` | `Dialog` + `Button` (`danger`/`secondary`/`primary`) + `.dialog-*` | Parts only. See gap **G2**. |
| **Destructive confirmation** — `REQ-NOTIFY-009`, `REQ-SHELL-092`, `REQ-TOOLS-191`, `REQ-GIT-079` | `ConfirmDialog` | Good. Its contract — verb-first confirm label, one sentence naming exactly what is lost — matches `REQ-NOTIFY-009`. `REQ-SHELL-092` additionally needs impact bullets. |
| **Permission surfaces** — mode presets (`REQ-TOOLS-041`, `REQ-TOOLS-046`), workspace-scope opt-out (`REQ-TOOLS-191`), safety flags (`REQ-TOOLS-184`) | `SegmentedControl`, `ToggleSwitch`, `Tag`, `StatusDot` | Primitives are right. The status-strip flag row itself is unbuilt — see gap **G10**. |
| **Context meters** — `REQ-MONITOR-045`, `REQ-MONITOR-080`, `REQ-MONITOR-166` | `ContextRing`, `MeterBar`, `Sparkline`, `KpiCard` | Good. Both meters already carry a `threshold` prop for the compression threshold. `Sparkline` returns null below two values, matching `REQ-MONITOR-166`'s explicit-empty rule. |
| **Transient acknowledgements** — `REQ-NOTIFY-011` – `REQ-NOTIFY-022`, `REQ-SHELL-112`, `REQ-SHELL-113` | `Toast` + `ToastStack` | Close. Needs: the four kinds `info`/`ok`/`warn`/`fail` mapped to accessible names **Notice / Done / Warning / Failed** (`REQ-NOTIFY-019`); bounded widths 520 px alone and 360 px when two or three are visible; max three visible with the fourth evicting the oldest; newest nearest the anchor with an 8 px gap; a 16 px inset from the host window's bottom-right, not the screen; never taking focus; error presentation as a 3 px left rule in the severity colour rather than a filled background. |
| **Tables** — `REQ-GIT-077`, `REQ-GIT-078`, `REQ-GIT-086`, Library lists, provider list | `Table`, `TableCard` | Good for structure. `Table`'s `columns: string[]` needs to become nodes to carry the specified header content, and multi-row selection (`REQ-GIT-077`) and single-row selection (`REQ-GIT-086`) are not modelled. |
| **Empty states** — `REQ-NOTIFY-006`, `REQ-TRACE-231`, `REQ-GIT-077`, `REQ-GIT-087`, `REQ-SHELL-083` | `EmptyState` | Good. `REQ-NOTIFY-006` requires both a sentence naming *why* the region is empty **and** at least one instruction or control; `EmptyState`'s `hint` + `action` covers exactly that, and both must reach the accessible tree as ordinary content of the region. |
| **Tab strips** — `REQ-SHELL-152`, `REQ-LIBRARY-103`, `REQ-CONFIG-268` | `Tabs` | Structure fine. Needs stable **identifiers** rather than label strings, because `REQ-LIBRARY-103` and `REQ-CONFIG-269` address tabs by name and both persist the identifier. Needs Left/Right selecting in the same step, Home/End, no wraparound, and no intermediate blank pane. |
| **Spinners** — `REQ-SHELL-137` | `Spinner` | Exact match: 12/16/24 px, strokes 1.25/1.5/2.0, 800 ms revolution, 90° head arc over a faint track. Needs the default accessible name **"Working"** and must not run a timer while hidden. |
| **Keycaps** — `REQ-SHELL-049`, `REQ-SHELL-054`, `REQ-SHELL-149` | `Kbd` | Good. Needs an accessible name announcing the written chord, since `REQ-SHELL-149` names keycap sequences explicitly. |
| **Status indication** — `REQ-SHELL-036`, `REQ-NOTIFY-048` | `StatusDot` | Close, with one mapping to settle. `REQ-SHELL-036` groups the run-lifecycle vocabulary into five colour groups: `{running, starting}` → running; `{pausing, paused, cancelling}` → waiting; `{completed}` → done; `{failed, stopped}` → fail; `{idle}` → **info**. `StatusDot` has no `info` state; its `idle` must resolve to `--rt-info-500`, not to a neutral grey, or the fifth group loses its distinguishing colour. Pulse only for `running` and `starting`. |
| **Form controls** — settings across domains 04, 05, 15, 16 | `Input`, `Select` | Good. `REQ-SHELL-147` requires every dropdown to size itself to its selected entry and to announce over-long values in full. |
| **Page headers** — every view | `PageHeader` | Good. |
| **Run logs** | `LogPanel` | Serves a run log. It does **not** serve the terminal — see gap **G5**. |
| **Tooltips** — `REQ-SHELL-058`, `REQ-NOTIFY-008` | `Tooltip` | Partial. `REQ-NOTIFY-008` and `REQ-SHELL-091` require a disabled control's reason to be reachable through an **enabled, keyboard-focusable** control, never only through a tooltip on a disabled one. That help-control affordance does not exist in the inventory. |

### 4.2 Affordances with no component at all

Each of these is new work. Named with the requirement that fixes it.

**G1 — Persistent notice banner.** `REQ-SHELL-114`, `REQ-SHELL-116`, `REQ-SHELL-118`,
`REQ-NOTIFY-034` – `REQ-NOTIFY-043`. An inline banner directly below the title bar, one at a time,
carrying severity, title, message, optional selectable copyable details with a copy control, an
optional action control, a dismiss control present exactly when the notice is persistent, and an
optional thin progress meter filled in the accent colour at every value. Severity is a 1 px border
plus a 3 px left rule plus a glyph (`i` / `✓` / `!` / `×`), never a filled background. `Toast` is the
transient surface and is not this; there is no banner in the inventory.

**G2 — Approval dialog.** `REQ-TOOLS-063`. Modal, minimum 560×380, titled "Permission required",
carrying the headline, requester line, a read-only monospace detail box for the redacted command or
argument summary, a `Matched rule: <rule_id>` fine-print line with the decision reason, and exactly
three buttons: Deny (danger), Approve for this session (secondary), Approve once (primary). **No
default action** — Enter activates nothing, initial focus is on Deny, and Escape and window close
both answer Deny. It also needs an undeliverable-answer state that disables all three buttons and
shows a status line, and a queue counter stating how many other requests are waiting. `Dialog` and
`ConfirmDialog` express none of the focus, no-default or queue behaviour.

**G3 — Delegation tree.** `REQ-MONITOR-036` – `REQ-MONITOR-043`, `REQ-MONITOR-304`. Depth-first
rows with monospace box-drawing prefixes (`├─ `, `└─ `, `│  `, three-space continuations), a
state-coloured status dot pulsing while live, the persona display name brighter while live, the task
name beneath it, an optional meta label, elision that never changes the panel width with the full
text in the tooltip, and a visually distinguished selected row. Fully keyboard-operable: Up/Down
through the depth-first order, Left collapses or moves to parent, Right expands or moves to first
child, Home/End, boundaries are no-ops. The same component serves three surfaces at once
(`REQ-MONITOR-038`), so it must be one component, not three drawings.

**G4 — Evidence indicator.** `REQ-TRACE-258` – `REQ-TRACE-261`. One segment per evidence obligation
the requirement owes, at most three, in the fixed order `implementation-trace`, `covering-test`,
`verification`, each coloured for its state from the theme's semantic status tokens and never from
literal values. It needs an explicit **empty** rendering, with a stated reason, that can never be
mistaken for a satisfied one. Its accessible description names every segment and its state as
`<Obligation>: <State>`, and the card prints an equivalent text summary beside it. Every segment
colour clears 3:1 against the card ground. `ContextRing` is a single-value ring and does not serve
this.

**G5 — Terminal character grid and its controls.** `REQ-SHELL-095` and the surrounding sections. A
character grid, not an append-only log: cursor addressing overwrites cells, the alternate screen
replaces and restores content, a self-rewriting progress line updates in place. Accessible name
"Terminal output", focusable by click and by Tab. Plus the tab header (`REQ-SHELL-087`) and the
controls row (`REQ-SHELL-088`): Take control toggle, Interrupt, End input, an availability-help
control, spacer, Copy all, and a danger-styled Kill on the far side of the spacer. Plus the four
per-tab banner states of `REQ-SHELL-089` – `REQ-SHELL-094`. `LogPanel` serves none of this.

**G6 — Diff rendering.** `REQ-CHAT-050` and the Git view. The CSS primitives exist —
`.diff-line`, `.diff-ln`, `.diff-op`, `.is-add`, `.is-del`, `.is-meta`, and the `--rt-diff-*` tokens
— but there is no component and no expression of the specified text form: the header line
`<path>[ [Created]] +A -R`, one `[<line>]± <text>` line per changed line, a 50-line cap, and the
truncation line "… +N more lines, diff truncated".

**G7 — Transcript row and virtualised transcript.** `REQ-CHAT-046` (twelve row categories),
`REQ-CHAT-055` – `REQ-CHAT-067`, `REQ-CHAT-163` – `REQ-CHAT-165`. Timestamp column 52 px, role column
112 px, minimum row height 30 px, timestamps in the monospace stack at 8 pt, attribution drawn only
on the first row of a block, continuation rows showing a 2 px persona-coloured bar in the role
gutter, row margins 10 px horizontal and 5 px vertical. Plus the tool row (`▸ toolname args` with
`ok · 3.2s` / `failed` / `blocked · Ns` / pulsing `◉ running…`), its expansion into an INPUT/OUTPUT
card, the thinking row, and the folded group header carrying per-outcome counts and taking its colour
from the most severe member. This is the densest single piece of undesigned component work in the
product, and the mockup's transcript column is the best available drawing of the intent.

**G8 — Split pane and divider.** `REQ-SHELL-066` – `REQ-SHELL-071`. A 6 px grab area painting a
hairline, never collapsing a pane below its minimum, persisting with a 250 ms debounce, keyboard
operable with an accessible name beginning "Resize ", arrow keys moving 16 px, Home restoring
declared defaults. Used by Workspace, Overview, Git and any other multi-pane view.

**G9 — Compact overlay drawer.** `REQ-SHELL-059` – `REQ-SHELL-063`. Full-height drawers above the
content below the 1180 px Workspace breakpoint, mutually exclusive, with compact-only toggle and
close chrome carrying fixed accessible names and the tooltip "Close drawer (Escape)".

**G10 — Status strip.** `REQ-SHELL-038` – `REQ-SHELL-047`, `REQ-TOOLS-184`. Nine named items with a
strict two-kind model: exactly two are ever links (workspace path, cloud credit) and everything else
is inert text that still exposes an accessible name and description. Five safety flags in fixed
order, each a short form plus a full-sentence explanation joined identically for tooltip and
accessible description. Two responsive-elision thresholds (1180 px, 1080 px).

**G11 — Title-bar chips.** `REQ-SHELL-033` – `REQ-SHELL-037`. Workspace chip (button semantics,
folder icon, monospace path, separator, session name or em dash), session chip (6 px dot plus
"session {status}", five colour groups, pulse only while running or starting), improvement-analysis
indicator, and the version label.

**G12 — Indeterminate non-cancellable progress dialog.** `REQ-SHELL-117`. Window-modal, appears
immediately, does not close on Escape because it has no answer to give.

**G13 — Keyboard-help dialog.** `REQ-SHELL-054`. `{shortcut} — {label}` rows with the shortcut
emphasised, excluding the Escape entry, plus a prose line conveying what Escape does and where it
applies. `Kbd` is the primitive; the dialog is not built.

**G14 — Question stepper.** `REQ-TOOLS-158` and the structured-question row of `REQ-CHAT-046`. The
mockup draws it well; it is not in the inventory.

**G15 — Board column and card.** `REQ-TRACE-232` – `REQ-TRACE-235` (six delivery columns in fixed
order plus a non-stage `blocked` token, header `<Label> · <count>`, partition invariant),
`REQ-TRACE-242` (the seven facts every requirement card must carry), `REQ-TRACE-281` (epic cards),
`REQ-TRACE-303` (collapsible columns), `REQ-TRACE-358` (board scaling and virtualisation). The
mockup draws all of these; none is a component.

**G16 — Relationship graph.** `REQ-TRACE-322`. A graph presentation centred on one requirement and
the coverage around it — relations to other requirements, implementation sites, covering tests —
with every node displaying its own health and the whole graph drawn from the projection and nothing
else. The mockup draws a hand-placed SVG; there is no component and no layout.

---

## 5. Acceptance items the design language must be measured against

These are not open questions — they are the tests the language has to pass once it is wired up.
`REQ-SHELL-160` requires all four of the following to be settled from **rendered pixels on a real
display**, not from token arithmetic.

1. **Contrast.** `REQ-SHELL-144` (4.5:1 normal text, 3:1 large text and non-text boundaries) and
   `REQ-SHELL-145`, sampled from the painted label against the painted background after all styling,
   states and overlays. Specifically at risk in the imported palette: `--rt-text-disabled`
   (`REQ-SHELL-145` requires it below half the enabled contrast ratio while still clearing 3:1);
   every state text colour on every background it is painted on; the primary button's label in rest,
   hover and pressed; the diff washes over syntax-coloured code; and every derived persona shade,
   which `REQ-SHELL-134` may correct only by raising perceptual lightness.
2. **Native surfaces.** `REQ-SHELL-130` and `REQ-SHELL-160(b)`: native dialogs, menus, text caret and
   disabled text must follow the theme on every supported platform. The token set has no native-
   surface mapping.
3. **Focus indication.** `REQ-SHELL-148` and `REQ-SHELL-160(c)`: ring wholly within the control's own
   bounds, at the theme width and colour, clearing 3:1. See the `outline-offset` note in §1.8.
4. **Icon scaling.** `REQ-SHELL-030` and `REQ-SHELL-160(d)`: an icon declared at L logical pixels
   covers L logical pixels within one device pixel at 100 %, 125 %, 150 %, 175 % and 200 % OS
   scaling, and after being dragged between monitors at different scale factors, and is never drawn
   from artwork smaller than the required raster.
5. **Rail label fit.** `REQ-SHELL-029`: every rail item shows its complete label at 9 px with no
   ellipsis and no clipped glyph, in every built-in theme, with the width re-derived after each theme
   change. "Requirements" is the binding case.
6. **Theme completeness.** `REQ-SHELL-128`, `REQ-SHELL-132`: three themes, each rendering all seven
   views without error, each preserving unsent composer text, the active view and every divider size
   across a switch, with no widget retaining a colour from the previous palette.

---

## 6. Reference

- Design language: `docs/design/system/` — `README.md`, `styles.css`, `tokens/`, `base.css`,
  `components.css`, `motif.css`, `guidelines/` (20 specimen cards), `components/` (27 components,
  each with `.jsx`, `.d.ts` and `.prompt.md`).
- Visual mockup: `docs/design/mockup/rotaris-ui-mockup.dc.html` — language reference only.
- Assets: `docs/design/assets/` — the mark and the self-hosted variable fonts.
- Information architecture: `docs/spec/12-desktop-shell-windows.md` (`REQ-SHELL-023` is canonical),
  and the owning domain for each view's contents.
- Provenance of this material: `docs/clean-room/provenance.md`, section "Design material".

---

## 7. Fidelity — consult before, maintain after

> **Adopting the language is not the same as using it. Section 2 said what is adopted; this section says
> what a change to the interface has to do about it.**

Two obligations bind every change that draws, redraws or restyles a surface. They are stated in `CLAUDE.md`
beside the architecture views' pair, and they are read the same way.

1. **Consult before drawing.** Before writing or changing a component, look at the surface in the mockup.
   `pnpm mockup` serves `mockup/rotaris-ui-mockup.dc.html` at `http://localhost:8791` with the icon font, the
   two text faces and a picker that shows one screen at a time — the export's own runtime is not in this
   repository, so without that shim every modal stacks on every screen and the glyphs come out as tofu. Read
   what the language does with the thing you are about to draw: how much air it gets, whether it is a card or
   a line, where the mono face is used and where it is not, what carries colour and what carries only text.
2. **Match after drawing.** A surface that could have followed the design material and did not is a defect of
   the change that drew it, on the same terms as a view that disagrees with the code. Where the specification
   fixes the structure the design material may not have it (§2); where it fixes nothing, the design material
   decides, and "I wrote a plausible box" is not a third option.

**Where to look.** The screens sit in the second half of the file, each behind an `<!-- ═══ NAME ═══ -->`
banner; the first half is the design system's own specimen cards, which are the same material as
`system/guidelines/`.

| Surface | Mockup section | Nearest built code |
|---|---|---|
| Title bar, nav rail | `title bar`, `nav rail` | `AppShell.tsx`, `NavRail.tsx`, `WorkspaceChip.tsx` — the **workspace chip drawn 2026-09-12** (Stage B) from that block's own pill: `--rt-radius-pill`, a `--rt-border-strong` hairline, the mono face, `ph-folder-open` a step quieter than the text, and its 6 px gap and 3 px by 9 px padding. Three departures, each because the specification fixes what the mockup only suggests: the text scale is the smallest the scale has (`REQ-WORKSPACE-017`, where the mockup draws `--rt-text-xs`), the chip sits in a **centred** region (`REQ-SHELL-033`, where the mockup puts it hard left after the wordmark), and it carries no caret glyph — `REQ-WORKSPACE-017` enumerates its parts as icon, path, `·`, session name, and a dropdown affordance in front of a native folder chooser would promise a menu that does not exist |
| Overview | `HOME`, `expanded overview strip` | `OverviewView.tsx` |
| Transcript rows, run header | `WORKSPACE` → `transcript column` | `transcript/Row.tsx`, `TranscriptSurface.tsx` |
| Queue, composer, slash catalogue | `WORKSPACE` → `queue + composer` | `WorkspaceView.tsx`, `composer.ts`, `slash/SlashPopup.tsx`, `RunHeader.tsx` |
| Agent list, context rings, inspector | `WORKSPACE` → `agents panel`, `inspector` | `AgentTree.tsx`, `ContextRing.tsx`, `Inspector.tsx` |
| Approval card | `WORKSPACE` → the `approvalOn` block | `ApprovalDialog.tsx` |
| Structured questions | `question stepper modal` | `QuestionStepper.tsx` |
| Git worktrees, commits, diffs | `GIT` | `GitView.tsx` |
| Library tabs and cards | `LIBRARY` | `library/LibraryView.tsx` |
| Settings panes and save bar | `SETTINGS` | `SettingsView.tsx`, `settings/` |
| Provider auth | `provider auth modal` | `ProviderDialog.tsx` |
| Terminal window and transcript preview | — (no window mockup, §3.2); `WORKSPACE` → the live terminal preview block for the preview | `terminal/TerminalWindow.tsx`, `terminal/TerminalPreviewBlock.tsx` — **drawn and wired 2026-09-10** (Parts AM, AL′): the window has no design and is built from the language alone; the preview follows the mockup's block. **Closed 2026-09-11** (Part T″): the three surfaces are measured equal on a live stream (`REQ-SHELL-102`), and the drawing is unchanged — what wave 3 added is evidence, not craft |
| Requirements board, review, new requirement | `REQUIREMENTS`, `Review view` modal, `New requirement` dialog | **drawn 2026-09-10**: `requirements/` (Part AK′) and `requirements/panes/` (Part AP), **hosted and closed 2026-09-11** (Part R″: the five panes reachable through the board's own registry with the host drawing its chrome, and the relationship graph drawn as a presentation centred on ONE requirement). The Kanban/List/Graph tabs are craft; the axes, the columns and the detail's five sections are `REQ-TRACE`'s and govern where they differ — and the graph is centred rather than an axis, which no tab can be (`REQ-TRACE-322`) |
| First launch | `first-launch guide` | — not drawn |

Mission has no counterpart to consult; §3.2 is why. Requirements has one (§3.1 calls its coverage good) and the board is drawn against it — an earlier version of this line said otherwise and was wrong.

### 7.1 What the first reading of this obligation found — 2026-09-08

*Recorded under GD-10 against §2, which has stood since 2026-09-01 and had never been measured against the
built interface. The finding is that §2 is being kept at the level of tokens and broken at the level of
composition, and that the two are not the same promise.*

**The tokens hold.** `tools/check-theme-colours.mjs` fails the lint on a literal colour and no source file
carries one; the renderer imports `@design/base.css`, `@design/components.css` and `@design/motif.css`; 59 of
the 96 class names the design system's component CSS defines are named in a `className` in `packages/ui` or the
renderer, and most of the 37 that are not belong to components no screen has needed yet (`toast`, `spinner`,
`log-panel`, the diff washes). Nothing here is the drift.

**The transcript is where it breaks, and the cause is not what it looks like.** The specification is *more*
specific than the design material about the transcript, and where both speak they agree:
`REQ-CHAT-060`'s monospace `▸ toolname args … ok · 3.2s` header, `REQ-CHAT-061`'s expansion into a card
captioned `INPUT` and `OUTPUT`, and `REQ-CHAT-062`'s `▸ reasoning · <N>s · ~<T> tok` are the mockup's own
one-liners, written as requirements, and `transcript/Row.tsx` implements them. `REQ-CHAT-057` then fixes a
geometry the mockup does not draw — a 52 px timestamp column, a 112 px role column, attribution on the first
row of a block and a 2 px persona bar on continuations — and by §2 it governs, so the mockup's right-aligned
user bubble and its card-less assistant prose are **correctly** not built. That much is the rule working.

**What neither source asked for is the container.** `shell.css`'s `.row` gives *every* row —
user, agent, tool, system alike — `background: var(--rt-surface)`, a 1 px border and a radius, so the
transcript reads as a stack of identical boxes. `REQ-CHAT-057` fixes columns, heights and margins and says
nothing about a card, and in the mockup a bordered surface is *earned*: the user's own message (an
accent-tinted bubble), an expanded tool call, an artifact preview, the live terminal block and the approval
card have one, and nothing else does — an agent's prose and every one-liner sit directly on the background.
`.row--user` then changes only the border colour, where that one tinted fill is what makes a person's own
words findable while scrolling. This is the drift the owner reported, it is the only part of it that no
requirement mandates, and it is a change to about six declarations.

**Deferred, then directed.** This section first said the repair belonged to a change of its own, so the finding
would not be absorbed into the fix. The owner set compliance as the goal the same day and the repair followed
immediately; the deferral is kept here rather than deleted, because the finding above is what the repair is
answerable to and a section that only describes its own outcome cannot be checked against anything.

### 7.2 The repair — 2026-09-09 (Part AI)

Six changes, each traceable to a line of §7.1 or to the material it cites. Nothing in `docs/spec/` moved, and
where a requirement fixes a geometry the geometry is untouched — `rows-proof` still measures 52 px, 112 px and
30 px from the live layout.

1. **`.row` gave up the card.** The universal `--rt-surface` background and 1 px border are gone; the border stays
   declared at `transparent` so the box model `rows-proof` measures is unchanged and a variant that earns a border
   adds no shift. Hover became a wash rather than an outline, since there is no longer a border to darken.
2. **A surface is now earned.** `.row--user` takes the mockup's accent-tinted fill and accent border, which is what
   makes a person's own words findable while scrolling; `.row--approval` and `.row--diff` take a panel with a 2 px
   rail (`--rt-wait`, `--rt-border-strong`); `.tool__card` — REQ-CHAT-061's expansion — takes the surface the row
   gave up, with the rail in the tool axis and the 620 px cap the material draws. Everything else sits on the
   background: an agent's prose, every one-liner, and a group's members, which are marked by the divider they hang
   from instead of a nested box.
3. **`.row--system` took the notice pattern** the design already fixed (§1, G1: a rule and a glyph, never a filled
   background) instead of a dashed box, and `.row--agent`'s border rule went away with nothing to replace it —
   an agent message is the transcript's ground state.
4. **Prose got a measure.** Nothing in the material's transcript runs the full width of a wide window; it caps a
   message at 78 % and a revealed block at 560–620 px. Diffs, tables and code fences opt out, because they are read
   by their columns and wrapping them is what the cap exists to prevent.
5. **A tool one-liner moved to axis Y.** `REQ-CHAT-060` says "the tool accent colour" and names no colour; the
   material names it, and it is not the product accent — a tool call sits on axis Y while reasoning and delegation
   keep the accent, so the three kinds of one-liner differ by hue as well as by wording. `blocked` and `failed`
   still win, at equal specificity and later in the file.
6. **Two components stopped being hand-drawn.** The run header's state was coloured text with four per-state
   overrides; it is now the design's `Tag` with a status dot, toned by `RUN_STATE_TAGS` and pulsing on exactly the
   states where work is in flight. The command palette gained the `.cmdk-foot` the material draws, stating the
   three keys the dialog answers to.

**What was looked at and deliberately left.** `.agent-row__dot` duplicates the design's `.status-dot` in six call
sites and renders identically to it; changing it is a refactor with no visible effect, and the obligation in §7 is
about what the interface looks like, not about which class name reaches it. `REQ-CHAT-057`'s columns still win over
the mockup's right-aligned user bubble and card-less assistant prose, exactly as §2 requires — the repair changed
what neither source asked for and nothing that either one did.
