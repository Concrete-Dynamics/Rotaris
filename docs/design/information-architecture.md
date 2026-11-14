# The information architecture — the map

**Status:** round 2 decided 2026-11-11 and landed with [#84](https://github.com/Concrete-Dynamics/Rotaris/pull/84); **round 3 decided 2026-11-14** ([section 10](#10-round-3--2026-11-14-the-session-is-the-frame)), built on `feat/r-101-experience-redesign`, not landed. Where section 10 and sections 2 to 5 disagree, section 10 governs: it is the later decision and it says what it replaces. Sections 1 to 9 are kept as they were written.
**How this document was made:** proposed and decided by the model (`claude-fable-5-2`) under [R-098](../product/requests.md#r-098), the owner's standing delegation of 2026-11-11. The owner authorised that the model decides; he worded none of the decisions below. Section 7 is an independent agent's critique of the first draft, quoted in substance, with this document's answers.
**What it is:** the one document that states which primary views exist, their order, labels and shortcuts, the view shown at startup, what the Overview holds since round 2, and how the Settings categories are grouped. It is a design record, not a requirement: each decision governs through the directive it names ([`docs/product/README.md`](../product/README.md)), and the specification keeps its text.

Its source is this product's own built application, driven and measured on 2026-11-11, and the research corpus in [`docs/research/design/`](../research/design/README.md), guide [03](../research/design/03-information-architecture-within-a-fixed-structure.md) above all. It is not derived from the mockup's screens ([§2](README/02-2-the-adoption-rule.md): the mockup's structure came from another product's requirements and stays unadopted), and nothing in it rests on the reference.

## 1. The baseline — what was weak, and the evidence

Captured from the built application at `880a08a9`: `pnpm app:drive` at 1400×900 in `rotaris-dim` on a fresh profile, and `pnpm mission-proof` (launch `painted`) and `pnpm overview-proof` (launch `run`) at 1440×900 for the two views during a run. The gate on that head: `pnpm check` exit 0, 8308 tests passed and 57 skipped.

| # | Finding | Evidence |
|---|---|---|
| B1 | **One monitoring job was split over two rail entries, and the agent set was drawn in three views.** Overview answered "how is the session doing"; Mission answered "what are its agents doing". The Overview's own Agents card drew the same tree under a link whose only purpose was to leave for Mission. | `OverviewView.tsx` (the `ov-card--tree` card, "Open Mission"); `MissionView.tsx` drew `AgentTree` again; REQ-MONITOR-038 names three tree surfaces; REQ-MONITOR-116 gives the Overview a card listing the run's agents, which was never built there. |
| B2 | **Mission held two settings.** Its "Delegation settings" card was a second editor for two keys Settings › Runtime already edits ("Delegation strategy", "Depth cap"). It applied to the next run while standing beside the controls of the current one, and it wrote at once where the Settings form defers to Save. | The `painted` capture: the card is 340×230 px of a monitoring view; `STRATEGY_NOTE` read "A change takes effect on the next run."; the renderer's `Mission` root wrote through `config.setField`; `ConfigSettings.tsx` defers to Save. |
| B3 | **On a first launch the first screen's body leads elsewhere.** The Overview's body is one empty state whose single control opens Settings (or the Workspace once a provider exists). *Corrected after the critique:* the header's "New session" starts work from every state, so the screen can start work; what it cannot do is take a typed prompt. | `pnpm overview-proof`, launches `empty` and `emptyWithProvider`; `OVERVIEW_EMPTY_HINT`. |
| B4 | **Thirteen Settings categories stood in one undivided list.** Nothing grouped it; finding a category was a read of up to thirteen labels, and Interface and Display (how this window looks) stood between Runtime and Skills (what a run is given). | Settings capture: 13 rows, 0 headings, one rhythm from top to bottom. |
| B5 | **The Git view's title borrowed another view's name.** "Git workspace", 87 px from a rail that also holds "Workspace". | Git capture; `GitView.tsx`. |
| B6 | **The rail's order is not the order of the work.** Overview precedes Workspace; Mission stood between the Workspace and the Requirements the work is checked against. | Rail capture. *No harm from this was measured; see D1 and section 7.* |
| B7 | **The Settings list had no keyboard movement.** REQ-SHELL-153's Arrow Up, Arrow Down, Home and End did nothing on it. *Found by the critique.* | `SettingsView.tsx` held no key handler. |

Measured and found sound, and therefore not changed: Requirements, Git and Library each hold one object collection with its own commands; the Library's three tabs separate what is not compared (guide 03, "Tabs separate what is not compared"); the title bar's Sessions browser and the Overview's sessions card give the returning operator two routes to a parked session ([OQ-506](../archive/architecture/open-questions/70-spikes-and-later-questions-37.md#oq-506)).

## 2. The map

### 2.1 Primary views — six

| # | Label | Identifier | Shortcut | Holds | Before round 2 |
|---|---|---|---|---|---|
| 1 | Overview | `overview` | Ctrl+1 | the session's figures, **the delegation graph with its run row, Pause and Cancel selection, the agent activity table**, the sessions list, credit, limits, proposals; **shown at startup** | first, Ctrl+1, shown at startup; no graph controls, no table |
| 2 | Workspace | `workspace` | Ctrl+2 | the transcript, the composer, the agents sidebar, the inspector | unchanged |
| 3 | Requirements | `requirements` | Ctrl+3 | the requirements board | fourth, Ctrl+4 |
| 4 | Git | `git` | Ctrl+4 | worktrees, history, checkpoints, the commit policy; titled "Git" | fifth, Ctrl+5; titled "Git workspace" |
| 5 | Library | `library` | Ctrl+5 | Prompts, Artifacts, Improvement proposals (unchanged) | sixth, Ctrl+6 |
| 6 | Settings | `settings` | Ctrl+6, Ctrl+, | thirteen categories under four headings (2.3) | seventh, Ctrl+7 |

Mission is not a primary view. Its identifier `mission` is retired and never reassigned; Ctrl+7 is bound to nothing; the palette finds the Overview by "mission", "agents", "delegation", "tree" and "team". Decided by [`PD-SHELL-015`](../product/directives/pd-shell-015.md#pd-shell-015), which narrows REQ-SHELL-023, -027, -049, -069, -005, -022, -115, -132, -144, -164, REQ-NOTIFY-010, REQ-ORCH-155, REQ-STARTUP-134, REQ-WORKSPACE-015 and REQ-LIBRARY-102. REQ-SHELL-026 (startup on Overview) and the rail's semantics (REQ-SHELL-028 to -032) are untouched.

### 2.2 What the Overview holds

| Region | Column | Holds | Before round 2 |
|---|---|---|---|
| Header | — | title, session label, List sessions, New session (REQ-MONITOR-164) | unchanged |
| Metric grid | left | Tokens, Tool calls, Repository, Agents (REQ-MONITOR-166 to -169) | unchanged |
| **Agent activity** | left | one row per agent: state, agent, persona, activity, tool calls, elapsed, context, compressions, Open, Pop out (REQ-MONITOR-274's table, in REQ-MONITOR-116's place); the refresh figure Mission drew in its head is carried as attributes and not drawn | Mission's right-hand card |
| Sessions | left | the run switcher (REQ-MONITOR-171) | unchanged, one card lower |
| **Delegation graph** | right, first | the run row, the tree, Pause, Cancel selection, Open, Pause's explanation, the strategy as text with "Open Runtime settings" (REQ-MONITOR-274, -276) | Mission's left-hand card; a read-only tree with "Open Mission" stood third in this column |
| Cloud credit, Subscription limits, Improvement proposals | right | REQ-MONITOR-173's other tiles, in its order | unchanged, one card lower |

The strategy selector and the depth control are drawn on no monitoring surface; Settings › Runtime is their one editor. The selection is the shared one (REQ-MONITOR-042): a row chosen in the table is the row marked in the graph, in the Workspace sidebar and in the inspector. Where the table's card is narrower than 40rem a row takes three lines and keeps every value. Decided by [`PD-MONITOR-009`](../product/directives/pd-monitor-009.md#pd-monitor-009), which narrows REQ-MONITOR-038, -130, -173, -213, -274, -275, -276 and REQ-TRACE-475.

### 2.3 Settings — thirteen categories, four headings, one unchanged order

| Heading | Categories under it, in REQ-CONFIG-268's order | What they configure |
|---|---|---|
| Agents | Models, Personas, Runtime | who does the work, and within which bounds |
| Application | Interface, Display | how this window presents it |
| Extensions | Skills, Instructions, Hooks, MCP Servers, Plugins, Tools | what a run is given |
| Project and about | Project, About | nothing: the two pages REQ-CONFIG-268 sets apart from "the configuration categories" |

No category moves, and each keeps its label, identifier and content. A heading is text and takes no focus; Arrow Up, Arrow Down, Home and End move focus through the list as REQ-SHELL-153 states. Decided by [`PD-CONFIG-008`](../product/directives/pd-config-008.md#pd-config-008), which extends REQ-CONFIG-268.

### 2.4 Tabs and columns — unchanged

Library: Prompts, Artifacts, Improvement proposals (REQ-LIBRARY-103). Requirements board columns: REQ-TRACE-232. Workspace panes: as built. No directive of round 2 names them.

## 3. The decisions, each with its claim

**D1 — six primary views: Mission is not one** (`PD-SHELL-015`). *Claim:* the rail holds six entries; every capability the Mission entry reached, but two settings controls, is reached on the Overview; `Ctrl+1`…`Ctrl+6` select the views of 2.1 and `Ctrl+7` selects nothing. *Checked by:* section 9's capture (`structure.json`, `ctrl7.json`); `packages/shell/src/shell.test.ts`; `packages/ui/src/commands/commands.test.ts`; `pnpm palette-proof`. *Price:* four shortcuts move down one digit; the rail entry, Ctrl+3 and "Open Mission" are gone.

**D2 — the Overview is the one monitoring view** (`PD-MONITOR-009`). *Claim:* a session's figures and its agents are read on one screen; pause, cancel and open work there as they did on Mission, with the same strings; the agent set is drawn in two views instead of three; the two cards stand at the widths they had (340 px and about 900 px at 1440×900); at 1000×680 the table's card does not scroll sideways and both run controls are on screen. *Checked by:* `pnpm mission-proof` retargeted at the Overview; `packages/ui/src/overview-view.test.ts`, "PD-MONITOR-009"; section 9's two measurements. *Price:* listed in the directive, seven items; the largest are the three-line rows at the minimum window and the longer keyboard path to the run row.

**D3 — the Settings list stands under four headings** (`PD-CONFIG-008`). *Claim:* the list is read as four headed groups of 3, 2, 6 and 2 in the order it always had; the four keys move focus through it. *Checked by:* `packages/ui/src/settings/categories.test.ts`; section 9's `structure.json` and `settings-1000x680.json`; `pnpm settings-proof`. *Price:* 7 px of spare height at the minimum window, so the list scrolls when a notice stands above the view; "Application" still stands between two groups that describe a run.

**D4 — the Git view is titled "Git"** (`PD-GIT-002`). *Claim:* the title no longer borrows the name of another primary view. *Checked by:* the capture; `pnpm git-proof`. *Price:* the title no longer says what the view is a workspace of.

## 4. What is removed, and where each capability went

| Removed | Argument | What replaces it | Stated in |
|---|---|---|---|
| Mission as a primary view (rail entry, Ctrl+3, the palette's "Open Mission") | it held a second copy of the tree, a table and two controls better read beside the session's figures, and a mirror of two settings | the Overview's Delegation graph and Agent activity cards | `PD-SHELL-015`, `PD-MONITOR-009` |
| The strategy selector and depth control on a monitoring view (REQ-MONITOR-275's first clause) | a setting for the next run, drawn beside the controls of the current run, in a second editor with a different commit behaviour from the Settings form's | Settings › Runtime: "Delegation strategy", "Depth cap"; the graph card shows the strategy as text and leads there | `PD-MONITOR-009` clause 6 |
| The Overview's read-only Agents tree card and its "Open Mission" link | the card it linked to stands in its place | the Delegation graph card | `PD-MONITOR-009` clause 2 |
| Ctrl+7 | six views | Ctrl+6 and Ctrl+, open Settings | `PD-SHELL-015` clause 3 |

Nothing else that was reachable is removed. Section 6 is the reachability check.

## 5. Alternatives considered and not taken

| Alternative | Why not |
|---|---|
| Keep seven views and only reorder | leaves B1 and B2: the third tree and the second settings editor are the structure's cost, not its order's |
| **Open on the Workspace and put it first in the rail** (the first draft's D1) | **refused by the critique, section 7:** OQ-506's ruling rests on the returning operator landing on the Overview's sessions card; "New session" already starts work from the Overview; no usage data says which a launch does more often, start or resume. Raised as [OQ-548](../archive/architecture/open-questions/71-spikes-and-later-questions-38-continued-5.md#oq-548) |
| Fold Mission into the Workspace instead | the Workspace already carries three panes and a compact mode below 1180 px; the table and the figures are what is read when not typing |
| Move only the table to the Overview and leave pause and cancel to the Workspace alone (the critique's alternative 1) | an operator who sees a run burn tokens on the view that shows the cost should be able to stop it there, as on Mission; the price is that steering stands in two views, which it already did |
| Keep the name "Mission" for the merged view and retire "Overview" | "Overview" says what a summary view is; the session figures are not a mission |
| Rename labels ("Home", "Reqs", "Dashboard") | no label was found to mislead; REQ-SHELL-029 exists because short labels were not wanted |
| A Sessions primary view | OQ-506 ruled the Overview's sessions card the returning operator's surface, and the title bar's browser reaches it from every view |
| Merge Interface and Display into one category | Interface applies at once (REQ-CONFIG-399) and Display defers to Save (REQ-CONFIG-270): one page with two commit behaviours is the confusion guide 03's D03-2 records |
| **Reorder the Settings categories** into Agents, Extensions, Project, Application (the first draft's D3) | **refused by the critique, section 7:** a heading would repeat its only member's label, REQ-CONFIG-268's second sentence would stop being true, and the new order was an expert's grouping with no usage data |
| Stack the Overview to one column below 1180 px, as Mission did | REQ-MONITOR-165's two columns would have to give way, and the graph with its controls would fall below the sessions list |
| A user-tailorable rail (guide 03, D03-4) | positions held still serve better than adaptive ones at this size, and six entries need no tailoring |
| Change the Library's default tab (D03-5) | no usage data says which tab is used most; changing it would be a guess |

## 6. Reachability — every requirement that named what moved

| Requirement | What it reached before | Where it is reached now |
|---|---|---|
| REQ-MONITOR-274 | Mission: graph, table, open, pause, cancel | Overview: Delegation graph and Agent activity cards |
| REQ-MONITOR-275, first clause | Mission: strategy selector, depth control | **removed from monitoring**; Settings › Runtime edits both keys (REQ-CONFIG-321, REQ-CONFIG-112); the strategy is shown on the graph card |
| REQ-MONITOR-275, second clause | Mission: row-by-row refresh, deferred while hidden | Overview: the same table, mounted only while shown |
| REQ-MONITOR-276 | Mission: a pause on a non-run selection is refused | Overview's graph card: the same refusal, the same sentence |
| REQ-MONITOR-038 | three tree surfaces in parity | two: the Workspace sidebar and the Overview |
| REQ-MONITOR-130, -213 | "the mission view", "mission graph" among the surfaces | the Overview's graph card |
| REQ-MONITOR-173 | third tile: a tree with a link to Mission | first tile: the delegation graph card, no link |
| REQ-MONITOR-116 | (unbuilt) an agents card on the Overview | the Agent activity card |
| REQ-TRACE-475 | an execution unit links to "the mission view for its agents" | it links to the Overview, carrying the session |
| REQ-NOTIFY-010 | onboarding per primary view, Mission among them | the six views; the Agent activity card keeps Mission's empty statement |
| REQ-SHELL-049, REQ-LIBRARY-102 | Ctrl+1..7 | Ctrl+1..6 in 2.1's order |
| REQ-SHELL-005, -022, -069, -115, -132, -144, -164, REQ-ORCH-155, REQ-STARTUP-134, REQ-WORKSPACE-015 | "the seven primary views" | the six of 2.1 |
| REQ-SHELL-153 | (unbuilt on this list) arrow-key focus movement | built with the headings |

## 7. The critique pass, and the answers

The first draft of this map (four decisions: D1 six views *in a new order, opening on the Workspace*; D2; D3 four groups *with three categories moved*; D4) was read on 2026-11-11 by an independent agent that had not written it, instructed to try to refuse each decision against the code, the specification and the operator's journeys, and to let stand only what it could not knock down. It returned no plain acceptance but one.

| Decision | Verdict | Its strongest objections | Answer |
|---|---|---|---|
| D1 | accept with change | OQ-506's ruling rests on the returning operator landing on the Overview's sessions card by REQ-SHELL-026. B3 was overstated: "New session" starts work from every state. "Launch to typed prompt in one step" was unproven: the composer takes no focus on mount. | **The reorder and the startup change are withdrawn**, not patched: the conditional startup the critic offered would make the first screen depend on a read that lands after first paint. The six keep their order and the window opens on Overview. B3 is corrected in section 1. The question a relaunch poses is raised as OQ-548, where REQ-TRACE-230's "restored as the active view after a restart" is also found to contradict REQ-SHELL-026. |
| D2 | accept with change | At 1000×680 the table would get about 470 px and its controls would sit behind a sideways scroll, against REQ-SHELL-022. Pause and Cancel would land third in the right column under two placeholder tiles. The agent set is still drawn more than once. The first draft's "870 → 610 px" was wrong: the two columns are equally wide at 1440×900. | The table's narrow form is fixed in clause 3 and measured (scroll width = client width at 1000×680). The graph card leads the right column (clause 2, narrowing REQ-MONITOR-173's order). The duplication, the keyboard path, the sessions card's lower place and the pop-out on click are priced in the directive. The width claim is corrected. Its alternative 2, a read-only mirror of the strategy, is taken (clause 6). |
| D3 | accept with change | A heading is not an allowed child of a listbox unless the grouping is in the markup. REQ-SHELL-153's keyboard model was unbuilt on the list. "Project" would be a group of one under its own name; REQ-CONFIG-268's second sentence would become false; the reorder was as expert-derived as the Library change this map refuses. | **The reorder is withdrawn.** The four headings stand over the unchanged order, as `role="group"` named by a non-heading kicker; the keyboard movement is built and tested; no heading repeats a sole member; the list's height at 680 px is measured. |
| D4 | accept | Name REQ-GIT-075; narrow the claim, since Settings is titled by its category and "workspace" also names the project folder. | Done in the directive. |

The critique also found thirteen requirements naming Mission where the draft counted nine, three directives whose text names the Mission view (`PD-ORCH-005`, `PD-MONITOR-003`, `PD-CONFIG-003`, each now carrying a cross-reference), REQ-MONITOR-116's unbuilt card, and the two existing gaps recorded as B7 and OQ-548. What it could not check, it said: it ran nothing, so every figure "after building" in this map and in the directives is this round's own measurement.

## 8. The cascade

Measured before building: 20 of 67 scripts under `apps/desktop/scripts/` pressed a `Ctrl+<digit>` view shortcut, and the three capture variables that take a view (`ROTARIS_CAPTURE_VIEW`, `ROTARIS_CAPTURE_VIEWS`, `ROTARIS_CAPTURE_END_VIEW`) were written with a digit 131 times. Those variables now take a view's identifier, which is the form the scripts are converted to, so the next change to the rail moves none of them. Every script edited for this map names the directive that caused the edit in its header, and each of the twenty-five requirements a directive names carries its back-pointer.

## 9. Evidence, and how to take it again

No image is tracked in this repository; the captures of this round are kept with the pull request's report. They are reproducible: build (`pnpm build`), start a scripted run with three delegated agents under the driver (`pnpm app:drive start --fresh --workspace=<a folder holding .rotaris/agents.yaml with a scripted model> --env=ROTARIS_SCRIPT=plan:3,delegate:coding-agent:alpha,delegate:coding-agent:beta,delegate:codebase-analyst:gamma,done,answer --env=ROTARIS_CHILD_SCRIPT=wait:240000,read,answer`), type a prompt in the Workspace, press Ctrl+1, and `shot` at 1440×900 and 1000×680.

| Measurement, after building | Value |
|---|---|
| Rail entries | Overview, Workspace, Requirements, Git, Library, Settings |
| Selected view after Ctrl+4 then Ctrl+7 | Git (Ctrl+7 selects nothing) |
| Overview at 1440×900: graph card, table card | 340 px, 906 px; rows in the one-line form |
| Overview at 1000×680: table card | 460 px wide, scroll width 458 = client width 458; rows in the three-line form; every row control ends at x = 563, inside the card |
| Overview at 1000×680: Pause and Cancel selection | both end at y = 393 of 680 |
| Settings at 1000×680, no notice above the view | list 563 px in a 570 px column; the last category ends at y = 627, the status strip begins at 654 |
| Settings groups | Agents 3, Application 2, Extensions 6, Project and about 2 |

An independent critique of the built pack (`66663f087f89/iteration-1`, twelve findings, four of them repaired on the two cards) is recorded in [the cards' brief](briefs/overview/05-brief-2026-11-11.md).

What was not verified is in the pull request's report: among it, no screen reader was run over the grouped list or the three-line rows, and `nocturne` and `high-contrast` were read only through `pnpm theme-proof`.

## 10. Round 3 — 2026-11-14: the session is the frame

**How this section was made:** proposed and decided by the model (`claude-fable-5-2`) under [R-101](../product/requests.md#r-101), in which the owner asked for the information architecture to be redesigned from first principles with at least three concepts weighed, and under [R-098](../product/requests.md#r-098). The owner worded none of it. The visual language decided with it is [part 08 of the design brief](README/08-8-the-2026-11-14-revision.md).

### 10.1 The baseline, read again

From the built application at `2fb19824` (`pnpm app:drive`, 1440×900 and 1000×680, a scripted run with three delegated agents).

| # | Finding | Evidence |
|---|---|---|
| C1 | **A launch opened on a view that could not take a prompt.** With no session the Overview's body was one sentence and a control that left the view; every run is started, read and steered on the Workspace. | the startup capture; `STARTUP_VIEW` |
| C2 | **A session had no standing place.** It was reached through the title bar's dialog, the Overview's card or the Overview's header, and from the Workspace, Requirements, Git, Library and Settings only through the dialog. Which session a window followed was stated in the Overview's header and nowhere else. | the six view captures |
| C3 | **The rail spent a column on six icons.** 68 px wide, six 9 px labels, and the column under them empty at every height. | the rail capture |
| C4 | **The views were six equals, and they are not.** Workspace and Overview show the session in hand; Requirements, Git and Library belong to the repository whichever session is shown; Settings is the application. The rail drew no such difference. | `PRIMARY_VIEWS` |

Section 1's B1, B2, B4, B5 and B7 stand repaired by round 2. B3 and B6, which round 2's critique declined to act on, are C1 and C4.

### 10.2 Three concepts

| | A — session workbench | B — the work's stages | C — one canvas, everything in drawers |
|---|---|---|---|
| Primary navigation | a sidebar: the views in three groups, and the sessions | four stages in order: Plan, Run, Review, Ship | none: a command bar, and drawers over one session view |
| Main working environment | the Workspace, first and shown at startup | Run | the canvas |
| Agent monitoring | the Workspace's side pane and inspector while working; the Overview for the figures | inside Run | a drawer |
| Sessions | a list in the sidebar on every view; the browser for everything else | a switcher in Run | a switcher in the command bar |
| Requirements and Git | project views, grouped | Plan holds requirements; Ship holds Git; Review holds diffs, checkpoints and proposals | drawers |
| Settings | at the sidebar's foot | behind a gear | a drawer |
| Context kept while moving | the session list and the followed session never leave the screen | lost at each stage boundary | kept, but every second surface covers the first |
| Steps to a typed prompt from launch | 0 | 1 | 0 |
| Steps to a parked session from any view | 1 | 2 | 2 |
| Build cost | the shell and its state; no view's content moves | every view is cut along a new line; Review does not exist | every view becomes a drawer; the board and Settings do not fit one |
| Regression risk | low: six identifiers, six views, one order change | high: 67 proof scripts name views that would no longer exist | high, and the minimum window cannot hold a drawer beside the canvas |

**Taken: A.** B reads well on a slide and misdescribes the work: an operator steering agents goes from a run to a requirement to a diff and back many times in a session, and a stage boundary would stand in the middle of each of those. C keeps context best and pays for it everywhere else: the requirements board and the Settings form are full-width surfaces, and a drawer over a live transcript hides the thing being steered. A changes least and repairs C1 to C4 whole.

### 10.3 The map as it now stands

| # | Label | Identifier | Shortcut | Group | Changed in round 3 |
|---|---|---|---|---|---|
| 1 | Workspace | `workspace` | Ctrl+1 | (unheaded) | first, and shown at startup; was second |
| 2 | Overview | `overview` | Ctrl+2 | (unheaded) | second; its regions are sections, its figures one band (`PD-MONITOR-010`) |
| 3 | Requirements | `requirements` | Ctrl+3 | Project | — |
| 4 | Git | `git` | Ctrl+4 | Project | — |
| 5 | Library | `library` | Ctrl+5 | Project | — |
| 6 | Settings | `settings` | Ctrl+6, Ctrl+, | (foot) | drawn at the sidebar's foot |

The sidebar, top to bottom: New session; Workspace, Overview; **Sessions**: the workspace's sessions, at most twelve, the followed one marked, "List sessions" opening the browser; **Project**: Requirements, Git, Library; Settings at the foot; the fold control. On the Workspace the open sidebar also holds that view's agents and task-plan pane (`PD-SHELL-016` clause 8). Below 1440 px, or folded by the user, it is the rail of round 2 in the new order with one sessions control under the start control, and the followed session is named in the title bar at every width. The answers to the round's two critiques, and the dock, are in [the shell's brief](briefs/shell.md). Decided by [`PD-SHELL-016`](../product/directives/pd-shell-016.md#pd-shell-016), which narrows REQ-SHELL-023, -026, -027, -029 and -049, supersedes clauses 1, 3 and 5 of `PD-SHELL-015` in part, and rules OQ-548.

### 10.4 Coverage — every capability, and where it is reached

Nothing reachable is removed in round 3. A capability not listed is reached where it was.

| Capability | Entry | Path | Result | Held by |
|---|---|---|---|---|
| Start a run | the composer, on the startup view | type, Return | the run starts | REQ-CHAT-001; `pnpm slice-proof` |
| Start a session with options | New session, in the sidebar on every view; the Overview's header; `/new` | one press | the start-session dialog | REQ-SHELL-125 |
| Switch to another session | its row in the sidebar (from 1440 px, or opened); the rail's Sessions control; the Overview's sessions section; the browser | one or two presses | that session followed, the Workspace shown | `PD-SHELL-016` clause 3; REQ-MONITOR-171 |
| Search, repair, export, delete, back up, restore sessions | All sessions; the title bar's Sessions | one press | the session browser | REQ-SHELL-126 |
| Read a run's agents and steer one | the Workspace's Agents pane and inspector | on screen | select, steer, cancel, pop out | REQ-MONITOR-042, -051 |
| Read a session's figures; pause; cancel a selection; the agent table | Overview | Ctrl+2 | the band, the graph, the table | `PD-MONITOR-009`, `PD-MONITOR-010` |
| Approvals, questions, the plan gate, re-authentication | where the run raises them | — | unchanged | REQ-TOOLS-063, REQ-CHAT |
| Requirements board, adoption, evidence | Requirements | Ctrl+3 | unchanged | REQ-TRACE-230 |
| Worktrees, history, checkpoints, restore | Git | Ctrl+4 | unchanged | REQ-GIT-075 |
| Prompts, artifacts, improvement proposals | Library | Ctrl+5 | unchanged | REQ-LIBRARY-103 |
| Models, providers, personas, runtime, skills, instructions, hooks, MCP, plugins, tools, interface, display, project, about | Settings | Ctrl+6, Ctrl+, | unchanged | `PD-CONFIG-008` |
| Command palette, keyboard help, transcript search, focus the prompt, terminal | Ctrl+K, F1, Ctrl+F, Ctrl+L, Ctrl+Shift+T | — | unchanged | REQ-SHELL-049 |
| Choose a workspace | the title bar's chip; the status strip's path | — | unchanged | REQ-SHELL-035 |

### 10.5 What was weighed inside A and not taken

| Alternative | Why not |
|---|---|
| Remove the Overview's sessions section now that the sidebar lists sessions | the two differ in purpose: the sidebar switches, the section accounts (branch, tokens, duration, detail, Continue run). `PD-MONITOR-010` clause 3 |
| Remove "New session" and "List sessions" from the Overview's header | REQ-MONITOR-164 gives the header both, and the folded rail shows the start control as an icon only; the duplication costs two buttons on one view |
| Fold the Overview into the Workspace as a tab | section 5's reason stands: the Workspace carries three panes, and the figures are what is read when not typing |
| Move Personas, Skills, Hooks, MCP, Plugins and Tools out of Settings into a seventh view | they are edited through one form with one Save (REQ-CONFIG-270); a second home for half a form is the confusion section 5 already refuses |
| Remember the fold across launches | it needs a preference key, a contract outside this round's bound ("avoid unrelated backend changes"); owed |
| Restore the last active view on relaunch | OQ-548 is ruled the other way: a launch shows the Workspace, which serves starting and resuming alike |
| Rename "Overview" | no evidence the label misleads, and section 5 refused the same for the same reason |

### 10.6 The critique of round 2, answered

Round 2's critique refused "open on the Workspace and put it first" on three grounds (section 7, D1). `PD-SHELL-016` records the answer to each: the returning operator meets the sessions list on the first screen and every other; "New session" starts work from every view; and the first screen serves starting and resuming in one step each, so the missing usage data no longer decides the layout.

### 10.7 Evidence, and what was not verified

The captures of this round are kept with the pull request's report, as section 9 says of round 2's. Measured after building, at 1440×900 and above: the sidebar 260 px with the Workspace's pane docked in it, the transcript column 880 px at 1440, the six views in 10.3's order, Ctrl+1 the Workspace and Ctrl+2 the Overview, the startup view the Workspace; below 1440 px: the rail with its sessions control, the followed session named in the title bar. What was not verified is in the pull request's report.
