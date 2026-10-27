# Design Brief — Rotaris Desktop Interface — 3. View reconciliation

Part 3 of 7 of [the design README](../README.md), which indexes every part.

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

**The composer's paused state — no design.** `PD-ORCH-005` clause 6 and `PD-CHAT-001` revision 4 give a
paused session a composer of its own. Two continues take the send pill's place, `Continue` and `Send`. Below
the dock, the notices row holds the pause's statement, the count of agents a continue resumes and "Continue
without them". The mockup draws no paused composer. The build follows the language: the row's quiet hint,
and the compact ghost button the session tables draw for "Resume". On 2026-09-28 the owner asked for the
state to be drawn ([R-064](../../product/requests.md#r-064), OQ-98).

**A paused agent — no design.** `PD-ORCH-005` clause 13 gives a `paused` agent a presentation state of its own on
every agent surface. The mockup draws no paused agent. The build follows the language: its dot takes `--rt-wait`, the
waiting family `REQ-SHELL-036` puts `paused` in, drawn at full opacity with no pulse, and the state text `paused` is what
tells it from `queued` (OQ-100).

**All three themes but one.** `REQ-SHELL-128` requires three built-in themes in order —
`rotaris-dim` (default), `nocturne`, `high-contrast` — each declaring a light/dark flag, seven token
groups and hard accessibility floors (`REQ-SHELL-129`), each rendering all seven views without error
(`REQ-SHELL-132`), each carrying a display label and a one-line description (`REQ-SHELL-133`). The
imported design language is **one palette**. `nocturne` and `high-contrast` are undesigned, and the
token set has no light/dark flag and no declared theme metadata.

*Settled 2026-09-04, recorded here 2026-10-13: the paragraph above describes the imported material as it arrived and
no longer the product. IC-2's build gave `nocturne` and `high-contrast` palettes of their own — `nocturne` lowers every
ground stop in the adopted hue system, `high-contrast` takes near-black grounds, near-white text and strengthened
boundaries — and every theme its label, description and light/dark flag, as data in
`packages/contracts/src/theme/themes.ts` (ADR-0050). `pnpm theme-proof` passed all three from rendered pixels at five
scale factors (`../architecture/spikes/theme-proof.md`), IC-2 was discharged and OQ-30 closed the same day. The material
in this directory still draws one palette; the two authored palettes remain owner-replaceable through the same
mechanism.*

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
