# Open questions — Spikes, and the questions raised since (38 of 38)

Part 71 of 71 of the [open-questions record](../open-questions.md), which indexes every part. Holds OQ-523 – OQ-540, OQ-485, OQ-473 and OQ-475.

<a id="oq-523"></a>

**OQ-523 — Is a `--rt-viz-2` persona label one stop from `--rt-run` a “state colour” under PD-CHAT-005?** *(PD-CHAT-005, §1.3. Raised 2026-11-03 by [R-093](../../product/requests.md#r-093), guide 06 §8 item 15 ([the guide](../../research/design/06-ux-patterns-for-agent-products.md)) of the design research corpus and backlog row 15 ([the backlog](../../research/design/backlog.md)); numbered from OQ-493: OQ-462 to OQ-492 are the hardening orchestration's.)*

**What is open.** PD-CHAT-005, the owner's, takes persona colours “from the categorical set the adopted design language already declares … in that set's own order”. It also says “No persona colour SHALL be a **state** colour … because the two would then be indistinguishable on a row that carries both”. In `tokens/colors.css`, `--rt-viz-1` to `--rt-viz-3` are `--rt-accent-400`, `--rt-axis-y-400` and `--rt-axis-x-400`: the done, running and waiting hues one stop lighter. Guide 06 §8 D06-15 notes a shipping agent's agent hues overlapping its state hues.

**What the build proceeds under.** PD-CHAT-005 and the persona ramp as adopted.

**What decides it.** A reading of “state colour” in PD-CHAT-005: the token, so one stop of separation suffices, or the hue. If the hue, the directive conflicts with its own categorical set, which is the owner's to revise or settle by a §1.3 ramp change.

<a id="oq-524"></a>

**OQ-524 — Is Workspace compact mode measured by the view's own width or by the viewport, when REQ-SHELL-059 and REQ-MONITOR-051 name different ones?** *(REQ-SHELL-059, REQ-MONITOR-051. Raised 2026-11-03 by [R-093](../../product/requests.md#r-093), guide 14 §8 item 2 ([the guide](../../research/design/14-how-a-surface-gives-way.md)) of the design research corpus and backlog row 61 ([the backlog](../../research/design/backlog.md)); numbered from OQ-493: OQ-462 to OQ-492 are the hardening orchestration's.)*

**What is open.** REQ-SHELL-059: “The Workspace view enters compact mode when its own width is below 1180 px”. REQ-MONITOR-051: “Below a viewport width of 1180 px, choosing an agent opens the inspector as an overlay drawer”. The built `useNarrow` (`packages/ui/src/WorkspaceView.tsx:316`) reads a media query, which is the viewport. REQ-SHELL-047's thresholds measure the window, but they govern the status strip and are not in conflict. Guide 14 §8 D14-2 cites container-query guidance that thresholds belong to the container.

**What the build proceeds under.** As built, the viewport, which REQ-MONITOR-051 names.

**What decides it.** One ruling naming the governing requirement. The other gains a back-pointer by directive, and the hook changes if the view's width wins.

<a id="oq-525"></a>

**OQ-525 — Is 700 px the Workspace centre's floor at every docked width, or only at 1440×900?** *(REQ-SHELL-064, REQ-SHELL-065. Raised 2026-11-03 by [R-093](../../product/requests.md#r-093), guide 14 §8 item 3 ([the guide](../../research/design/14-how-a-surface-gives-way.md)) of the design research corpus and backlog row 62 ([the backlog](../../research/design/backlog.md)); numbered from OQ-493: OQ-462 to OQ-492 are the hardening orchestration's.)*

**What is open.** REQ-SHELL-065: “At 1440×900 both side panels are visible and the center panel is at least 700 px wide”. REQ-SHELL-064's maxima (sidebar 520 px, inspector 560 px) let a user leave a 1180 px view's centre near 100 px. Guide 14 §8 D14-3 cites guidance that a side pane never look too wide or too narrow beside the main area.

**What the build proceeds under.** REQ-SHELL-064's maxima, with 700 px stated at 1440×900 only.

**What decides it.** One ruling: 700 px is a floor at every docked width (a directive clamping the panes), or it holds only at 1440×900.

<a id="oq-526"></a>

**OQ-526 — Below 1180 px, is having the delegation tree beside the transcript given up by design?** *(REQ-SHELL-059, REQ-MONITOR-051. Raised 2026-11-03 by [R-093](../../product/requests.md#r-093), guide 14 §8 item 5 ([the guide](../../research/design/14-how-a-surface-gives-way.md)) of the design research corpus and backlog row 64 ([the backlog](../../research/design/backlog.md)); numbered from OQ-493: OQ-462 to OQ-492 are the hardening orchestration's.)*

**What is open.** REQ-SHELL-059 removes the sidebar and the inspector from the docked arrangement in compact mode, and REQ-MONITOR-051 makes the two drawers “mutually exclusive”. Guide 14 §8 D14-5 cites evidence it rates low-confidence that tiled windows beat overlapping ones for tasks spanning both.

**What the build proceeds under.** REQ-SHELL-059 and REQ-MONITOR-051: one overlay drawer at a time below 1180 px.

**What decides it.** One ruling: the loss is confirmed, or a directive keeps the tree docked down to a lower threshold.

<a id="oq-527"></a>

**OQ-527 — What must a persona window or the terminal window show at the smallest size it can be resized to?** *(REQ-SHELL-022, REQ-SHELL-167, REQ-SHELL-146. Raised 2026-11-03 by [R-093](../../product/requests.md#r-093), guide 14 §8 item 10 ([the guide](../../research/design/14-how-a-surface-gives-way.md)) of the design research corpus and backlog row 60 ([the backlog](../../research/design/backlog.md)); numbered from OQ-493: OQ-462 to OQ-492 are the hardening orchestration's.)*

**What is open.** REQ-SHELL-022: “no surface declares a minimum window size of its own”. REQ-SHELL-167: after opening, “the user may resize freely”. Guide 14 §8 D14-10 notes that Electron's window floor binds only drags. Nothing states what an auxiliary window shows, or must keep reachable, at its smallest.

**What the build proceeds under.** REQ-SHELL-167's free resize, with no stated minimum content.

**What decides it.** One ruling by directive: a minimum size for auxiliary windows, or a minimum-content contract.

<a id="oq-528"></a>

**OQ-528 — Should REQ-SHELL-117's progress dialog wait briefly before appearing and then hold a minimum time, rather than appear at once?** *(REQ-SHELL-117. Raised 2026-11-03 by [R-093](../../product/requests.md#r-093), guide 11 §8 item 6 ([the guide](../../research/design/11-design-critique-and-evaluation.md)) of the design research corpus and backlog row 53 ([the backlog](../../research/design/backlog.md)); numbered from OQ-493: OQ-462 to OQ-492 are the hardening orchestration's.)*

**What is open.** REQ-SHELL-117: worktree-merge and checkpoint operations show an “indeterminate, window-modal, non-cancellable progress dialog that appears immediately”. Guide 11 §8 D11-6 cites a 150–300 ms show delay followed by a minimum hold, which avoids a flash on a fast operation.

**What the build proceeds under.** REQ-SHELL-117's immediate appearance.

**What decides it.** One ruling: “appears immediately” stands, or a directive over REQ-SHELL-117 sets a show delay and a minimum hold.

<a id="oq-529"></a>

**OQ-529 — Is an operator owed how far a merge or checkpoint has got, and a way to interrupt it, once it runs past 10 s?** *(REQ-SHELL-117. Raised 2026-11-03 by [R-093](../../product/requests.md#r-093), guide 13 §8 item 5 ([the guide](../../research/design/13-states-feedback-and-time.md)) of the design research corpus and backlog row 53 ([the backlog](../../research/design/backlog.md)); numbered from OQ-493: OQ-462 to OQ-492 are the hardening orchestration's.)*

**What is open.** REQ-SHELL-117 makes the dialog “indeterminate” and “non-cancellable”. Guide 13 §8 D13-5 cites response-time guidance that a wait past 10 s owes progress and a way to interrupt.

**What the build proceeds under.** REQ-SHELL-117's indeterminate, non-cancellable dialog.

**What decides it.** One ruling: REQ-SHELL-117 stands, or a directive owes determinate progress (which needs a count from the operation) and states whether it can be cancelled.

<a id="oq-530"></a>

**OQ-530 — Do the configuration categories keep their deferred Save and Discard beside Interface's immediate controls, and how does a control then say which policy it follows?** *(REQ-CONFIG-270, REQ-CONFIG-286, REQ-CONFIG-399, REQ-SHELL-124, REQ-SHELL-041. Raised 2026-11-03 by [R-093](../../product/requests.md#r-093), guide 03 §8 item 2 ([the guide](../../research/design/03-information-architecture-within-a-fixed-structure.md)) of the design research corpus and backlog row 41 ([the backlog](../../research/design/backlog.md)); numbered from OQ-493: OQ-462 to OQ-492 are the hardening orchestration's.)*

**What is open.** REQ-CONFIG-270 and REQ-CONFIG-286 hold configuration changes for Save and Discard behind REQ-SHELL-124's guard. REQ-CONFIG-399 makes the Interface category “**immediate** … not gated by Save or Discard”. REQ-CONFIG-286's guard says only that Discard does not undo theme and reduced motion. Guide 03 §8 D03-2 cites platform guidance that a changed setting applies at once, with no confirmation button. Nothing says how a control shows which policy it follows.

**What the build proceeds under.** Both policies as specified: REQ-CONFIG-270's and REQ-CONFIG-286's deferred Save and Discard, and REQ-CONFIG-399's immediate Interface category.

**What decides it.** One ruling: the deferred Save stays, and how a control signals its policy goes to the Settings brief, or a directive moves the configuration categories to immediate apply.

<a id="oq-531"></a>

**OQ-531 — Does one ellipsized line of description let the operator recognise a tool row in a narrow window?** *(REQ-CHAT-175, REQ-CHAT-178, §7.4. Raised 2026-11-03 by [R-093](../../product/requests.md#r-093), guide 14 §8 item 8 ([the guide](../../research/design/14-how-a-surface-gives-way.md)) of the design research corpus and backlog row 47 ([the backlog](../../research/design/backlog.md)); numbered from OQ-493: OQ-462 to OQ-492 are the hardening orchestration's.)*

**What is open.** REQ-CHAT-175: the description “MUST be one line” and is cut at 120 code points. §7.4 item 2 draws it “`nowrap` with an ellipsis in a narrow window”. REQ-CHAT-178 gives the full line to the accessible name only. Guide 14 §8 D14-8 cites research that one-line elided previews give too little to judge an item, and a narrow window keeps little of the line.

**What the build proceeds under.** REQ-CHAT-175's one line, ellipsized as §7.4 item 2 draws it.

**What decides it.** One ruling: the full line is shown on focus or hover (a reading of REQ-CHAT-175, with §7.4 amended), it wraps to two lines at narrow widths (a directive over REQ-CHAT-175), or the elision stands.

<a id="oq-532"></a>

**OQ-532 — At 1000 px, must a board drag keep the lifted card's column and the column under the pointer in view, when REQ-TRACE-318 widens every rail at drag start?** *(REQ-TRACE-318, REQ-SHELL-022. Raised 2026-11-03 by [R-093](../../product/requests.md#r-093), guide 14 §8 item 13 ([the guide](../../research/design/14-how-a-surface-gives-way.md)) of the design research corpus and backlog row 65 ([the backlog](../../research/design/backlog.md)); numbered from OQ-493: OQ-462 to OQ-492 are the hardening orchestration's.)*

**What is open.** REQ-TRACE-318: from the lift, “**every** rail on the board … SHALL expand to the minimum width of an open column”, unanimated. Guide 14 §8 D14-13 notes that this moves the columns the pointer aims for, and at REQ-SHELL-022's 1000 px both may leave view.

**What the build proceeds under.** REQ-TRACE-318 as written.

**What decides it.** One ruling: the drag keeps both columns in view (a directive over REQ-TRACE-318), or autoscroll during the drag is accepted.

<a id="oq-533"></a>

**OQ-533 — May a Library review decision that REQ-LIBRARY-116 can undo drop REQ-LIBRARY-115's confirmation dialog?** *(REQ-LIBRARY-115, REQ-LIBRARY-116, REQ-NOTIFY-009. Raised 2026-11-03 by [R-093](../../product/requests.md#r-093), guide 05 §8 item 15 ([the guide](../../research/design/05-interaction-patterns-for-desktop-tools.md)) and guide 13 §8 item 7 ([the guide](../../research/design/13-states-feedback-and-time.md)) of the design research corpus and backlog row 70 ([the backlog](../../research/design/backlog.md)); numbered from OQ-493: OQ-462 to OQ-492 are the hardening orchestration's.)*

**What is open.** REQ-LIBRARY-115: “Applying a status from the desktop MUST first ask for confirmation”. REQ-LIBRARY-116 then lets Undo “re-apply the proposal's previous status without asking for confirmation”, so the decision is both confirmed and undoable. It is a status change, not a deletion. REQ-NOTIFY-009's dialog binds a “destructive action”. Guides 05 §8 D05-15 and 13 §8 D13-7 cite guidance that confirmations habituate and that, where undo exists, it replaces the confirmation.

**What the build proceeds under.** REQ-LIBRARY-115's confirmation with REQ-LIBRARY-116's undo.

**What decides it.** One ruling: both stand, or a directive over REQ-LIBRARY-115 drops the confirmation for undoable decisions.

<a id="oq-534"></a>

**OQ-534 — May a Library tab that is not selected show how many rows match the one query, beside its fixed label?** *(REQ-LIBRARY-103, REQ-LIBRARY-104. Raised 2026-11-03 by [R-093](../../product/requests.md#r-093), guide 03 §8 item 12 ([the guide](../../research/design/03-information-architecture-within-a-fixed-structure.md)) of the design research corpus and backlog row 88 ([the backlog](../../research/design/backlog.md)); numbered from OQ-493: OQ-462 to OQ-492 are the hardening orchestration's.)*

**What is open.** REQ-LIBRARY-104: “One query filters all three tabs simultaneously”. REQ-LIBRARY-103 fixes the tabs as “exactly three tabs in order: ‘Prompts’, ‘Artifacts’, ‘Improvement proposals’”. A tab not selected never says it holds matches. Guide 03 §8 D03-12 cites search guidance that a narrowing is stated on the results.

**What the build proceeds under.** REQ-LIBRARY-103's fixed labels, with no count.

**What decides it.** A reading of REQ-LIBRARY-103 on whether a count beside the label leaves the label fixed, or a directive.

<a id="oq-535"></a>

**OQ-535 — Should the transcript's prose measure be a character count rather than a pixel length?** *(§7.2, §1. Raised 2026-11-03 by [R-093](../../product/requests.md#r-093), guide 07 §8 item 13 ([the guide](../../research/design/07-visual-composition-beyond-tokens.md)) of the design research corpus and backlog row 111 ([the backlog](../../research/design/backlog.md)); numbered from OQ-493: OQ-462 to OQ-492 are the hardening orchestration's.)*

**What is open.** §7.2 item 4 caps prose at “78 %” of the row, and `--rt-prose-measure` is a pixel length in `packages/contracts/src/theme/themes.ts`. Guide 07 §8 D07-13 cites typographic guidance that counts measure in characters, 45–90 and at most 80.

**What the build proceeds under.** §7.2 item 4's 78 % cap over the pixel `--rt-prose-measure`.

**What decides it.** One ruling: the measure is restated in `ch` (a token change by §1 amendment), or the pixel measure stands.

<a id="oq-536"></a>

**OQ-536 — Should the pill-fill tokens reach consumers through names that state waiting and running rather than the axis?** *(§1.3. Raised 2026-11-03 by [R-093](../../product/requests.md#r-093), guide 12 §8 item 4 ([the guide](../../research/design/12-design-system-governance-and-drift.md)) of the design research corpus and backlog row 146 ([the backlog](../../research/design/backlog.md)); numbered from OQ-493: OQ-462 to OQ-492 are the hardening orchestration's.)*

**What is open.** §1.3 declares `--rt-fill-x`, `--rt-fill-y` and their `-ink` pairs by axis, while the colours have product aliases (`--rt-wait`, `--rt-run`). `.tag-run`, `.tag-wait` and `shell.css` read the axis names directly. Guide 12 §8 D12-4 cites token practice that gives consumers meaning-stating names and keeps intent-free names for primitives.

**What the build proceeds under.** §1.3's axis names.

**What decides it.** One ruling: semantic aliases are added by §1 amendment, or the axis names stay.

<a id="oq-537"></a>

**OQ-537 — While no provider is authenticated, does the Overview's onboarding empty state keep its first-use copy and its filled “Open Workspace”, or name the precondition and offer Settings?** *(REQ-MONITOR-165, REQ-NOTIFY-006, REQ-NOTIFY-010, REQ-WORKSPACE-152, REQ-WORKSPACE-137. Raised 2026-11-03 by [R-093](../../product/requests.md#r-093), the Overview audit of 2026-11-02, candidate (a) ([the brief](../../design/briefs/overview.md)); numbered from OQ-493: OQ-462 to OQ-492 are the hardening orchestration's.)*

**What is open.** REQ-MONITOR-165: “An onboarding empty state is shown when there is nothing to display”. It fixes no copy. REQ-NOTIFY-006 asks for “at least one instruction or control that would put something in it”, and REQ-NOTIFY-010 for “a primary action appropriate to what it holds”. With no provider authenticated, “Open Workspace” succeeds, but the run it leads to is refused by REQ-WORKSPACE-137. The step that succeeds is the no-provider notice's “Add a provider” (REQ-WORKSPACE-152 (3)). The Overview audit (item 2, candidate (a)) found that the first-launch journey misleads at that control, and guide 04 §6 checks for a notice with a notice action rather than first-use copy.

**What the build proceeds under.** The empty state as built under REQ-MONITOR-165, which fixes no copy. Audit item 2 waits on this question.

**What decides it.** A reading of REQ-NOTIFY-006 and REQ-NOTIFY-010 for the Overview: while no provider is authenticated, the hint and control key to the precondition (REQ-WORKSPACE-137's “Open Settings”), or the first-use copy stands.

<a id="oq-538"></a>

**OQ-538 — Should a tile that cannot hold a figure in this build, Cloud credit, keep the first place in the Overview's right column?** *(REQ-MONITOR-173. Raised 2026-11-03 by [R-093](../../product/requests.md#r-093), the Overview audit of 2026-11-02, candidate (e) ([the brief](../../design/briefs/overview.md)); numbered from OQ-493: OQ-462 to OQ-492 are the hardening orchestration's.)*

**What is open.** REQ-MONITOR-173 puts “the cloud-credit tile first (the balance determines whether provider quotas are reachable at all)”. In a build where no hosted account can connect, the tile holds only `—` (the Overview audit, candidate (e)).

**What the build proceeds under.** REQ-MONITOR-173's order.

**What decides it.** One ruling: the order stands, or a directive over REQ-MONITOR-173 lowers or hides the tile while no account can connect.

<a id="oq-539"></a>

**OQ-539 — Which token strokes a single-series Sparkline, when §1.3, the Sparkline specimen and the mockup give three answers?** *(§1.3, §1.12, §4 (Sparkline), REQ-MONITOR-166. Raised 2026-11-03 by [R-093](../../product/requests.md#r-093), the Overview audit of 2026-11-02, candidate (b) ([the brief](../../design/briefs/overview.md)); numbered from OQ-493: OQ-462 to OQ-492 are the hardening orchestration's.)*

**What is open.** §1.3: `--rt-viz-*` “used **in order** … Never invent a chart colour outside this set”, so one series takes `--rt-viz-1`. The Sparkline specimen strokes `--rt-accent-500`, outside the set. The mockup's expanded overview strip strokes `--rt-viz-2`, though the mockup is read for craft only (§2). The built Overview copy strokes `--rt-accent-300` (audit item 11). The Overview audit's candidate (b) found three answers in the adopted material.

**What the build proceeds under.** The built `--rt-accent-300` stroke until audit item 11's component swap.

**What decides it.** One ruling naming the token. §1.3's rule is the likely governor, as §1.12 makes a specimen illustrative, and the disagreeing specimen is then corrected by §1 amendment.

<a id="oq-540"></a>

**OQ-540 — Does Sparkline gain an empty variant, so REQ-MONITOR-166's explicit empty sparkline needs no local drawing?** *(§4, §4.2, §6.1, REQ-MONITOR-166. Raised 2026-11-03 by [R-093](../../product/requests.md#r-093), the Overview audit of 2026-11-02, candidate (c) ([the brief](../../design/briefs/overview.md)); numbered from OQ-493: OQ-462 to OQ-492 are the hardening orchestration's.)*

**What is open.** REQ-MONITOR-166: “Fewer than two samples renders as an explicit empty sparkline rather than a flat line”. The inventory's Sparkline has no empty form, so the Overview draws its own. §6.1 lets the corpus propose a component member but never add one.

**What the build proceeds under.** REQ-MONITOR-166's explicit empty sparkline, drawn locally by the Overview.

**What decides it.** One ruling: the variant joins the design system by §4 amendment, or the local drawing is recorded as sanctioned.

<a id="oq-485"></a>

**OQ-485 — Does main leave a line in the application log for a message it refuses at a process boundary?** *(ADR-0002 consequence 11, ADR-0044, PD-MONITOR-002, `docs/architecture/hardening.md` §3.5 row 7. Raised 2026-11-04 by hrd2's bundle F3 (`thin-packages`), building the process link's tests; numbered in the hardening orchestration's range.)*

**What is open.** `ProcessLink` (`packages/shell/src/process-link.ts`) reads every message from a child with `ProcessMessageSchema.safeParse` and drops one it cannot read with no trace: nothing is logged and the request it may have answered stays pending. A run host or workspace service speaking another contract version (`v`), or a reply kind main does not know, therefore reads in main as `NoReplyWithinBound` at the request's bound, with nothing in the log that says a message arrived and was refused. No requirement or decision says whether such a drop is recorded; the brief that raised this assumed it was ("dropped and logged").

The renderer's boundary is the same shape. `dispatchCommand` (`apps/desktop/src/main/command-dispatch.ts`) answers a request `CommandRequestSchema` cannot read, or one past OQ-467's bounds, `command.malformed` as a value and writes no line, where a throwing handler leaves one `error` line and a refused sender one `warning` line. `pnpm driver-proof` step 9e measured it on 2026-11-04: an unknown kind and a 2,000,000-character prompt sent by the page itself each left no line of the product's.

**What the build proceeds under.** Both as built: the process link's drop silent, the request left to its deadline and the next valid message answered (`packages/shell/src/process-link.test.ts`), and a malformed command answered with no line (`driver-proof` step 9e), each citing this entry.

**What decides it.** A ruling on whether a refused process message leaves one line (at which level, naming what, under PD-MONITOR-002's rule that the log never carries a payload) or stays silent, and whether a burst of them is bounded.

<a id="oq-473"></a>

**OQ-473 — Is 5 s the right bound on a utility process's first answer on a loaded host, now that a run host that misses it stays gone until a restart?** *(OQ-462, ADR-0002 consequence 1, REQ-STARTUP-156. Raised 2026-11-04 by [R-091](../../product/requests.md#r-091)'s hardening bundle B1, building OQ-462 (2); numbered from the hardening plan's range OQ-469 – OQ-480.)*

**What is open.** OQ-462 (2) applies the run host's 5 s `hello` bound to both children and ends a child that misses it; (4) never forks the run host again. Together, a run host that answers in six seconds on a busy machine leaves the person without runs for the whole session. That is not hypothetical on this host: on 2026-11-03, with the CPU at 100 % from another session's proofs, a driven launch's run host wrote its first line about 5.8 s after main claimed the instance and missed the bound ("no reply to hello within 5000 ms"), and loc1's reviewer met the same miss on 2026-10-21 at 22 to 100 % CPU ([the note](../../archive/defects/a-launch-whose-run-host-misses-the-hello-bound-ends-on-an-unhandled-main-rejection.md)). Before OQ-462 such a launch ended with no window at all; now it paints and says "The run host did not start". The specification states no bound on a child's start, and REQ-STARTUP-156 bounds the first paint, not the run host.

**What the build proceeds under.** The ruling as written: 5 s for both (`RUN_HOST_READY_BOUND_MS`, `WORKSPACE_SERVICE_READY_BOUND_MS` in `apps/desktop/src/main/child-supervision.ts`), the bound counted from the `hello` request main sends after `app.ready` and the provider service, not from the child's own start.

**What decides it.** A ruling on the bound — kept, lengthened, or counted from the child's `spawn` — or on one fresh fork after a missed ready only (never after a run host that ran, ADR-0002 consequence 1), which the specification does not address.

<a id="oq-475"></a>

**OQ-475 — Does an error React recovered from on its own owe the person a notice, or only a line in the log?** *(REQ-NOTIFY-001, REQ-NOTIFY-003, REQ-NOTIFY-023, PD-MONITOR-002. Raised 2026-11-04 by [R-091](../../product/requests.md#r-091)'s hardening bundle B2, building [hardening §3.2 row 4](../hardening/02-the-findings.md#32-failure-handling-outside-main); numbered from the bundle's range OQ-475 – OQ-476.)*

**What is open.** Every window's root is now made with React's three error options, and each reports through `notice.report` (`apps/desktop/src/renderer/render-failure.tsx`). Two are failures the person sees — an error the window's boundary caught (its fallback is drawn) and one no boundary caught (the window's tree is removed) — and REQ-NOTIFY-003 makes a failure a persistent notice. The third, `onRecoverableError`, is React's report of an error it recovered from by drawing the tree again: the window looks as it did and nothing was lost. It is none of REQ-NOTIFY-003's three (a failure, a refusal, an outcome carrying a recovery action), so the specification asks no notice of it; but a renderer has no path to main's application log other than `notice.report`, and a recovered error that is only written to the window's console is the silence this bundle was built to end. The specification has no word on a renderer's own diagnostics.

**What the build proceeds under.** A persistent notice at `warning`, titled "This window recovered from a drawing error", its detail the error and both stacks, and so ONE `warning` line in main's log (`RENDER_RECOVERED_TITLE`, `renderFailureReport`); the two failures at `error`, as the hardening plan asks.

**What decides it.** A ruling on whether a recovered error is shown to the person at all — the notice at `warning`, at `info`, or none — and, if none, whether the renderer gains a log-only path to main (a command that writes one line and raises nothing), which would be a new member of the command union.
