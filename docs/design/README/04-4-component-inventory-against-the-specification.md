# Design Brief — Rotaris Desktop Interface — 4. Component inventory against the specification

Part 4 of 7 of [the design README](../README.md), which indexes every part.

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
`REQ-CHAT-055` – `REQ-CHAT-067`, `REQ-CHAT-163` – `REQ-CHAT-165`, `REQ-CHAT-175` – `REQ-CHAT-178`. Timestamp column 52 px, role column
112 px, minimum row height 30 px, timestamps in the monospace stack at 8 pt, attribution drawn only
on the first row of a block, continuation rows showing a 2 px persona-coloured bar in the role
gutter, row margins 10 px horizontal and 5 px vertical. Plus the tool row (`▸ <description>` — `Runs npm test`,
`Reads src/app.ts`, the tool's own name where the build derives no line (REQ-CHAT-175) — with
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
