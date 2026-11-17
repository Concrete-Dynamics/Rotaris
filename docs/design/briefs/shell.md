# The shell and the navigation sidebar — brief and audit

**Status:** built 2026-11-14 on `feat/r-101-experience-redesign`, not landed; the audit's open items are `proposed`.
**Surface:** the main window's frame — the title bar, the navigation sidebar, the page frame every view stands in — and the product-wide revision of the language that was drawn with it. It has no row in [§7](../README/07-7-fidelity-consult-before-maintain-after.md): the surface is created by [`PD-SHELL-016`](../../product/directives/pd-shell-016.md#pd-shell-016) under [R-101](../../product/requests.md#r-101), as `design-ui`'s step 1 provides for a round the owner authorised to change the structure.
**How it was made:** the brief is the model's (`claude-fable-5-2`); the audit is an independent agent's, which had not built the surface and was told to find what was wrong with it. The owner worded neither.

## 1. The brief

| § | Decision | Cites |
|---|---|---|
| Job | Hold what the operator is working on, and the way to everything else, in one column that never leaves the screen. | [the map](../information-architecture.md) §10; `PRODUCT.md`, principle 1 |
| Journeys | Launch → type a prompt (0 navigations). Any view → another session (1 press open, 2 folded). Any view → start a session (1 press). | guide [04](../../research/design/04-the-agent-operator-journeys.md); `PD-SHELL-016` clauses 2 to 5 |
| Content | New session; Workspace, Overview; Sessions (≤ 12 rows: dot, label, state or age under it); Project: Requirements, Git, Library; Settings at the foot; fold. Folded: start and sessions as two icon controls, then the views. | `PD-SHELL-016` clauses 2 and 3 |
| States | Sessions: reading / none yet / refused / listed / more than twelve. Row: followed, running, needs the operator, resting. Sidebar: open, folded. | `NavRail.tsx`; `ui.test.ts`, "the navigation sidebar" |
| Interaction | A view button is a radio and its own tab stop (REQ-SHELL-028). A session row is a button that focuses and shows the Workspace. The focus order is the reading order. | REQ-SHELL-028, REQ-SHELL-058 |
| Copy | "New session", "Sessions", "List sessions", "Project"; "running", "needs you"; "No sessions yet. A run you start is kept here." | REQ-MONITOR-164 (the browser's one name); §1.11 |
| Accessibility | One radiogroup; headings are not focusable; the followed row carries `aria-current`; the fold control names the act it would perform and states `aria-expanded`. | REQ-SHELL-144; guide [09](../../research/design/09-accessibility-for-a-dense-desktop-tool.md) |
| Composition | Chrome plane, `--rt-sidebar-width` (260 px); folded below 1440 px to the rail (1600 px until the dock, section 4). The session region takes the height the fixed regions leave and scrolls. | [part 08](../README/08-8-the-2026-11-14-revision.md), R1; `SIDEBAR_FOLD_BELOW` |
| Components | `Button` for every control; `status-dot`. No new primitive. | `packages/ui/src/design-system/` |

## 2. Audit 2026-11-14 — an independent critique of the first build

**Evidence:** eight captures of the baseline at `2fb19824` and nine of the first build (`23ef2020` plus the working tree), 1440×900 and 1000×680, read as stills against the Impeccable critique rubric (Nielsen's ten heuristics, the generated-look test). It ran nothing. **Score: 24 of 40** for the first build; its estimate for the baseline was 22. **Verdict:** better as visual language — the boxes, the dot grids, the label-headings and the doubled insets gone, the chrome below the content — and **worse on the Workspace at 1440×900**, where the open sidebar cut the composer from 749 px to 606 px and its agent and model chips to icons.

| Id | Sev. | Finding | Answer |
|---|---|---|---|
| C-01 | P1 | Open at 1440, the sidebar and the agents pane made a 492 px chrome slab; the transcript column fell from 791 px to 648 px and the composer's chips lost their names. | **Repaired.** The sidebar is the default only from 1600 px (`SIDEBAR_FOLD_BELOW`), where the transcript column is 808 px. Measured after: at 1440×900 the composer names `orchestrator` and `scripted` again. |
| C-02 | P1 | Folded, the session list was gone and the followed session was named nowhere on the Workspace. | **Repaired.** The title bar names the followed session at every width (`PD-SHELL-016` clause 6); the rail carries one sessions control with a dot while another session runs or needs the operator (clause 5). |
| C-03 | P2 | The active view and the followed session carried the same fill: two rows looked selected. | **Repaired.** The followed row is marked by ink, weight and `aria-current`; the fill is the active view's alone. |
| C-04 | P2 | A session's name was cut at about 13 characters by the state word beside it. | **Repaired.** The label has the row's width; the state or age stands under it. |
| C-05 | P2 | Three names for one browser ("Sessions", "All sessions", "List sessions"); two "New session" on the Overview. | **Partly.** The sidebar says "List sessions", REQ-MONITOR-164's label; the title bar's "Sessions" is REQ-SHELL-033's. The Overview's header keeps both its controls (REQ-MONITOR-164); removing them is a directive of its own and is left `proposed`. |
| C-06 | P2 | A section's heading, column heads and cells stood on three left edges. | **Repaired** in two steps: Git, the Overview and Settings › Providers after this critique; Settings › Models after the second, which measured it 8 px off. |
| C-07 | P2 | The Library's two columns nearly join; a count reads into the next heading; a column's actions float at the window's foot. | **Open**, `proposed`. |
| C-08 | P2 | Inside a section, an empty statement was set larger than the section's heading. | **Repaired** in two steps: the Overview and the Library after this critique; Git's three absences, which stood centred under the column heads, after the second. |
| C-09 | P2 | "Project" named two things: the sidebar's group and the Workspace pane's setup section. | **Repaired.** The pane's section is "Project setup". |
| C-10 | P3 | The Repository figure stacked ahead above behind at 1440. | **Repaired** by C-01: with the rail the band has its width back. |
| C-11 | P3 | The view title at 16 px was barely above its subtitle; the Overview's session name was set in mono. | **Repaired.** The title is `--rt-h4` in the body face; a session's name is prose, in the Overview's header and, after the second critique, in the title bar. |
| C-12 | P1, baseline | The Workspace pane's setup failure is plain ink with a build command as the way out. | **Open.** Recorded as a defect note; the wording is REQ-WORKSPACE-113's surface and not this round's. |
| C-13 | P2, baseline | Requirements: four explanatory blocks, and an empty board whose filled control does nothing useful. | **Open**, `proposed`; the board's brief holds it. |
| C-14 | P2, baseline | Git names the checkpoint session by its identifier. | **Open**, `proposed`. |
| C-15 | P2, baseline | The status strip: about ten ungrouped facts in terms of art; the path twice on screen. | **Open**, `proposed`; the strip's items are REQ-SHELL-038 to -045. |
| C-16 | P2, baseline | Settings: an enabled Authenticate on a "Coming soon" provider. | **Open**; already a defect note (`an-unavailable-providers-authenticate-is-enabled.md`). |
| C-17 | P3, baseline | A progress ring and a sparkline frame restate the text beside them. | **Open**, `proposed`; both are requirements' (REQ-MONITOR-166, the context ring). |
| C-18 | P3 | The Settings list marked its selection with a stripe and a tint. | **Repaired.** Tint alone, as the sidebar. |

**The critique's challenge to the structure, and the answer.** Its strongest argument: the sidebar gives a standing column to the act done least (switching sessions) and takes it from the act done most (reading a transcript), on the view the decision puts first. Its own verdict: convincing as *incomplete*, not as *wrong*. Taken: the column is no longer taken below 1600 px (C-01), and the sessions stand directly under the two session views, with the project's views at the foot, where the first build interleaved them. **Not taken, and owed:** its fuller alternative — the Workspace's agents list drawn as the followed session's children in the sidebar, removing the Workspace's own agents column. It is the better structure and it moves REQ-MONITOR-051's pane, its drawer form and the proofs that measure both; it is a round of its own.

**What the stills could not show**, and stays unverified: the tab order through the sidebar under a screen reader; the sidebar with twelve sessions of similar names; the layout while a window is dragged across 1600 px; `nocturne` and `high-contrast` view by view.

## 3. Audit 2026-11-14, second — an independent critique of the second build

**Evidence:** the baseline's eight captures, the first build's eight, and fifteen of the second build (`801db371` plus the working tree) at 1680×1000, 1440×900 and 1000×680, the startup view among them, read by an agent that had built none of it and was told to refuse the first audit's "Repaired" claims where the stills did not show them. It ran nothing; it measured with pixel sampling. `pnpm ui-audit` and `pnpm ui-review --iteration=1` on the same build reported 0 findings. **Score: 25 of 40** (baseline about 22, first build 24). **Verdict:** better than both, mainly by recovering the composer at 1440 (607 px → 758 px, against 750 px in the baseline) and the transcript column (648 px → 799 px, against 791 px).

**Its verdicts on the first audit's claims.** Verified from the stills: C-01 at 1440, C-04, C-09, C-10, C-18. Partial: C-02 (the name stood in the tertiary ink, dimmer than the path), C-03 and the sessions dot (one session in the fixture, so neither the followed row's mark nor the dot could be seen), C-05 (the folded rail added a third control named "Sessions"), C-06 (Settings › Models 8 px off its heading), C-08 (Git's absence centred), C-11 (the record gave two sizes for the title). The answers in section 2 are corrected where they overstated.

| Id | Sev. | Finding | Answer |
|---|---|---|---|
| D-01 | P1 | Every tool call's result line was a bare "↳" in the second build's Workspace captures. | **Not a defect of the build.** The capture profile had "Show tool results" switched off by the builder's own earlier drive of Settings › Display; with the preference restored the lines are drawn (the third build's Workspace capture). |
| D-02 | P2 | The folded rail's "Sessions" control read as a third view, and was a second control so named. | **Repaired.** It stands with the start control, shaped as that control is, with no label; it is outside the radiogroup. |
| D-03 | P2 | The followed session's name was the dimmest part of the title chip. | **Repaired.** Primary ink, body face. |
| D-04 | P2 | The Overview's agent-states caption broke between a state and its count. | **Repaired.** Each "state count" is one unit; a wrap falls at a separator. |
| D-05 | P2 | In one capture at 1440 the start-of-conversation marker overlapped the first row. | **Open**, recorded as [a defect note](../../archive/defects/the-start-of-conversation-marker-is-drawn-under-the-transcripts-first-row.md): the marker is a block in the row pool's flow and the first row stands over it. This round changed neither. |
| D-06 | P3 | Open at 1680 with one session, about 490 px stood empty between the list and the Project group. | **Repaired.** The Project group follows the list; the spare height stands above Settings. |
| D-07 | P3 | The rail's selected item had a different width on Requirements. | **Repaired.** Every rail item has the rail's width (UIR-023). |
| D-08 | P3 | `DESIGN.md` and part 08 gave figures the build did not have. | **Repaired** in both. |

**Left open by both audits, in the order the second ranked them:** one statement of a setup failure with one recovery act and no build command (C-12, a defect note); one control and one name for each act on a screen (C-05; the Overview's header is REQ-MONITOR-164's); the Library's columns (C-07); the Requirements board's four explanatory blocks (C-13); sessions named by title in Git's checkpoint picker (C-14); the status strip's terms and the path drawn three times (C-15); the sparkline drawn as a rule in the accent (C-17).

**This was the third and last iteration of the review loop for this surface** (`build-ui`, step 7). The third build was looked at by its builder and by `pnpm ui-audit`, and by no third critic.

## 4. The dock — built 2026-11-14 after the second audit, on the owner's word

The owner, asked whether the round both audits named as owed should be done now ("move the Workspace's agents list into the sidebar?"), answered "Yes, do it". It is [`PD-SHELL-016`](../../product/directives/pd-shell-016.md#pd-shell-016) revision 2, clause 8.

**What was decided.** The pane docks whole — agents, task plan, project setup — because a pane left behind for the plan alone would have kept the column the move exists to remove. It docks by a portal and not by a second component, so there is one pane with one state, and the proofs' selectors hold. It is docked only on the Workspace: the Workspace is the only view mounted with it, the Overview draws the same agents as its graph, and a second tree beside that graph was the duplication round 2 removed.

**Measured in the built application, 1440×900, a scripted run with three agents:** sidebar 260 px; transcript column 880 px (800 px beside the rail and the pane before the dock; 791 px on `main`); composer field 814 px (758 px; 749 px). `pnpm ui-audit`: 0 findings. `pnpm layout-proof`: 28 of 28.

**Seen in the captures and repaired:** the sessions list collapsed to its heading beside a filled dock (it now keeps its rows up to a third of the column); with an agent selected the pane's head wrapped its count and its two controls over each other (Steer and Cancel now take a line of their own).

**The proofs, on the docked build at the default 1440×900.** Green: `layout`, `overview`, `mission`, `settings`, `git`, `sessions`, `palette`, `chat-controls`, `slash`, `composer`, `skills`, `requirements`, `library`, `mcp`, `injection`, `checkpoint`, `sandbox`, `part-j`, `artifacts`, `retrospective`, `compression`. **Two went red because of the dock, and each was the proof's assumption, changed with its reason in the script:** `notice-proof` read "the released run is off screen" from the whole shell's text, which the sidebar's session list now holds by design, and reads the view's text instead; `transcript-proof`'s geometry launch planted a line that must wrap, which fits one line in the 880 px column, and now runs at 1360 px, where the sidebar is the rail. `mission-proof` and `part-j-proof` each went red once while the builder's own gate run competed for the processor, and green alone. `driver-proof` and `resilience-proof` are red on the two checks that are red on `main` on this host.

**Not weighed by a critic.** The loop's three iterations were spent before this was built; the dock was looked at by its builder, by `pnpm ui-audit` and by the proofs.

## 5. Audit 2026-11-16 — an independent critique of the dock, and the third revision

**Evidence:** thirteen captures of the docked build (`f86c1b41` plus one scroll-region change) with three sessions of three agents each, at 1440×900, and with the sidebar opened by hand at 1100×720 and 1000×680; the captures before the dock for comparison. Read by an agent that had built none of it. **Score: 22 of 40**, against 25 for the build before the dock: the dock, as section 4 built it, made the column worse. Its measurements agreed with section 4's (sidebar 260 px, transcript column 880 px).

| Id | Sev. | Finding | Answer |
|---|---|---|---|
| E-01 | P1 | After a keyboard switch the selection fill stood on the old view's button. | **Repaired, and real:** two seconds after Ctrl+2 the old button computed the tint and the new one none. A background transition on a view button stood stuck in a window presenting no further frame. The transition is removed. The "second, neutral fill" was the pointer's hover. |
| E-02 | P1 | The column's strongest rule stood between the followed session and its own agents; nothing said whose agents they were. | **Repaired.** The dock is drawn under the followed session's row, inset behind a hairline guide, with no rule between the two. |
| E-03 | P1 | Scrolling, or selecting an agent, moved the followed session and every heading out of view. | **Repaired.** The "Sessions" heading and the followed row hold their place while the region scrolls. |
| E-04 | P1 | The plan and the setup section stood below the fold, with a scrollbar as the only sign. | **Partly.** The region fades at its foot where more lies below, the plan's head and count are in view at 1440×900 with three sessions, and the followed row's control puts the contents away. The setup section is still below the fold there. |
| E-05 | P1 | At 1100 with the sidebar opened by hand, "Stop run" wrapped and "Queue" was clipped. | **Repaired.** Docked, the composer's band may wrap and a control keeps its label on one line. |
| E-06 | P2 | The project's views stood 287 px lower on the Workspace than on other views. | **Repaired.** The five views stand first and in one place on every view; the sessions region is under them. |
| E-07 | P2 | The dock's headings outranked "Sessions", whose contents they are. | **Repaired** for size and ink: under a session's row a part is headed at the caption size in the secondary ink. "Agent plan" over "SCRIPTED PLAN" is the plan pane's own and is left. |
| E-08 | P2 | A selected agent carried a stripe and a tint beside a navigation selection of tint alone. | **Repaired.** Tint alone, in the tree and on the run row. |
| E-09 | P2 | A cyan dot stood beside the word "running" on a session not followed. | **Repaired** in the word: such a row reads "running in background", as REQ-MONITOR-171's informational dot means. The two greens are one colour caught at two points of its pulse. |
| E-10 | P2 | Steer and Cancel appear in the dock and in the inspector, in two styles. | **Open**, `proposed`. |
| E-11 | P2 | At startup the dock stacked three empty statements about a session that does not exist. | **Repaired.** Docked, a part with nothing in it is not drawn. |
| E-12 | P2, baseline | The setup failure is plain ink ending in a build command. | **Open**; the defect note stands. |
| E-13 | P3 | The region's scrollbar drew the platform's arrows and cost label width. | **Repaired.** The product's own scrollbar, in a held gutter. |
| E-14, E-15 | P3, baseline | The scope filter's hint touches its border; the start marker overlaps the first row. | **Open**; the second is a defect note. |

**What the third revision costs,** as the directive states it: the followed session's contents push the sessions under it down, which the row's control undoes; and the sessions no longer stand directly under Workspace and Overview.

**Not weighed by a critic.** The third revision was looked at by its builder in the captures and by the checks, and by no further critic. This surface has now had four critiques; a fifth is the owner's to ask for.

## 6. Audit 2026-11-17 — an independent critique of the third revision, and the fourth

**Evidence:** twelve captures of revision 3's build (`5870c470`), three sessions of three agents each, at 1440×900 and 1680×1000, and with the sidebar opened by hand at 1100×720 and 1000×680. Read by an agent that had built none of it and had not read this brief before scoring; asked for by the owner. **Score: 20 of 40** — below revision 2's 22 and below the 25 the surface held before the dock. Three critics, three falling scores: the dock has cost more than it has given at every reading so far, and the fourth revision below is read by no critic.

| Id | Sev. | Finding | Answer |
|---|---|---|---|
| F-01 | P1 | With its contents shown, the followed session pushed every other session out of view at each captured size, with no sign of them but a fade (E-04 again). | **Repaired.** Where other sessions are listed the contents keep to a height that leaves the heading, the followed row and up to two more rows in view, and scroll inside it. The heading, which holds its place, names the sessions not followed: "1 needs you", or "2 running". At 1000×680 with the sidebar opened by hand the contents are 96 px. |
| F-02 | P2 | On every view but the Workspace the followed row carried a disclosure with nothing under it. | **Repaired.** The control is drawn only where the contents hold something. |
| F-03 | P2 | The contents' headings stood 4 px left of the session's label and nothing shared a keyline. | **Repaired.** A part's heading starts where the session's label starts; an agent's row is inset from it. |
| F-04 | P2 | The selected agent carried the active view's tint while the followed session carried none. | **Repaired** on the agent's side: docked, a selected agent takes the hover fill. The followed row is still marked by ink and weight alone. |
| F-05 | P2 | Two rows began "coding-agent"; the name that told them apart stood under it in the tertiary ink. | **Repaired** when docked: the name leads and the persona stands under it. Session labels still elide at the column's width; **open**. |
| F-06 | P2 | Steer and Cancel in the dock and in the inspector (E-10). | **Open**, `proposed`. |
| F-07 | P2 | The project's setup section stands under a session's hairline, though it is the project's. | **Open**, `proposed`: it wants a place of its own under "Project", which is a second dock. Its failure text is E-12. |
| F-08 | P2 | Four heading styles in one column; three headings stacked over a three-item plan. | **Open**; the plan pane's own (E-07). |
| F-09 | P3 | "running" in the body face on a session and in the mono face on an agent. | **Open.** The agent's line carries a figure. |
| F-10 | P3 | The rail's sessions control is an unlabelled glyph among labelled buttons. | **Open**; clause 5 decides it has no label, and its title and accessible name say what it opens. |
| F-11 | P3 | Scrolled, a line showed above the held heading. | **Repaired.** The heading is opaque to the region's top edge. |
| F-12 | P3 | The sidebar lists newest first and the Overview's card oldest first; three routes to the browser on one screen; "session session 3". | **Open**, `proposed`. |
| F-13 | P3 | The start marker overlaps the first row (E-14). | **Open**; a defect note. |

**Not weighed by a critic.** Revision 4 was looked at by its builder in six captures and by the checks. The loop's three iterations for the dock are spent. Whether the dock stays is the question this section leaves: the build before it scored higher than any build with it.

## 7. The dock withdrawn — 2026-11-17, on the owner's word

Put the three scores and the model's reading — that the dock itself, not its details, cost the surface — the owner answered "Remove the dock". `PD-SHELL-016` revision 5 withdraws clause 8: the Workspace's delegation pane is its own left column again, the sidebar is 232 px and folds below 1600 px, as in the build the second critique scored 25.

**Kept from sections 5 and 6,** since none of it needed the dock: the views first and fixed with the sessions in their own region (E-06); the held heading and followed row (E-03, F-11); the heading's statement of the sessions not followed (F-01's second half); "running in background" (E-09); the selection's tint alone (E-08); no transition on a view button (E-01); the composer's band wrapping beside an open sidebar (E-05).

**Moot with the dock:** E-02, E-04, E-07, E-11, E-13, F-02, F-03, F-04, F-07. **Reverted with it:** F-05's name-first agent row, which was a docked style; in the Workspace's column a row leads with its persona as before, and the finding stands **open** there. **Still open:** E-10/F-06, E-12, E-14/F-13, F-08, F-09, F-10, F-12, and section 3's.

**Evidence:** six captures of the build without the dock — the rail at 1440×900, the open sidebar at 1680×1000 with and without an agent selected, the Overview, and the sidebar opened by hand at 1440×900 and 1100×720 — with three sessions, two of them waiting on an approval, so the heading read "2 need you" and the rail's control carried its dot. **Not weighed by a critic:** this build differs from the one scored 25 by the items kept above, and no critic has read it.

## 8. The views' interiors — 2026-11-17, [R-102](../../product/requests.md#r-102)

The owner, after the pull request of sections 1 to 7 was merged: "do the next part of the ui according to our original plan". Read as the findings the critiques left open inside the views, taken where a repair stays inside the surface that draws it.

| Finding | Answer |
|---|---|
| C-12 / E-12 — the Workspace pane's setup failure was plain ink. | **Half repaired.** The failure sentence stands on its own line behind the danger rule with a glyph, in the primary ink; REQ-WORKSPACE-113's words are unchanged. The message's build command is the workspace domain's text and stays open in its defect note. |
| C-14 — Git named the checkpoint session by its identifier. | **Repaired**, [`PD-GIT-003`](../../product/directives/pd-git-003.md#pd-git-003): the label, then the branch; the identifier is the tooltip. |
| C-16 — an enabled Authenticate on a "Coming soon" provider. | **Repaired** (REQ-CONFIG-371): disabled, with the provider's detail as its tooltip. The defect note is archived. |
| F-12's "session session 3" | **Not a finding:** REQ-MONITOR-164's form is `session {name}` and the fixture's name began with the word. |
| D-05 / E-14 / F-13 — the start marker over the first row. | **Open.** The marker stands in the row pool, whose slots are placed from the pool's top; moving it moves the origin ADR-0045's offsets are measured from. A repair of its own, with `transcript-proof`. |
| C-13, C-15, C-17, E-10 / F-06, F-08 to F-10, F-12's order | **Open**, `proposed`, as sections 2 to 6 state them. |

