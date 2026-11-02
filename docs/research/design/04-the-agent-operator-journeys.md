# 04. The agent operator's journeys

Job stories and task flows of a developer operating agents through Rotaris, with the wait, uncertainty and trust points, mapped across the seven primary views.

**Review date:** 2026-11-02
**Status:** guidance — informs craft within `docs/design/README.md` §1 and structure within §2; overrides nothing.

Guide 04 of 14 of [the design research corpus](README.md), which indexes every guide and fixes the template below.

## 1. Purpose and scope

What does the operator do, wait for, decide and need to trust on each journey, and what must a surface on it therefore hold? A method, the journeys phased across the seven primary views, and checks; it feeds the `design-ui` brief's §2 and rubric F1.

It does not decide which primary views, tabs, labels or orders exist (`REQ-SHELL-023`, `REQ-SHELL-027`, `REQ-SHELL-049`), what a requirement fixes, or how a surface is drawn (guides 06, 07, 13). Section 8 asks where research points past the material.

## 2. Principles

1. **State a journey as a situation, not a person.** A job story names trigger, motivation and anxiety, so a wrong assumption is told from a wrong build: "Personas are imaginary customers defined by attributes that don't acknowledge causality" [1]. A journey map holds one actor through phases with an emotion line [2]; a service blueprint adds what happens below the line of visibility [3]; a task analysis records the novice's and the expert's plan to one goal [4].
2. **Supervision is a loop.** Developers moved through plan, monitor, wait, review, teach, manual fix and update assets, back to plan; review drew the most discussion, waiting and monitoring among the least [5]. Even 70-step plans ran a few steps per prompt [7].
3. **The operator is mostly away.** User idle time was a median 80.1 % of multi-turn session time across 13.5M sessions [8]; developers rarely watch live, overseeing before delegation and after completion [6]. Return is more frequent than watching.
4. **Review is the dominant, routine cost.** Verifying output was the largest activity even with completions, 22.4 % of session time against 4.2 % waiting [9]; nine of thirteen professionals reviewed every agent change, and agents often did more than asked [7]; each regeneration forces a fresh review [6].
5. **Felt time is unreliable.** People underestimate how long a diversion keeps them away [25]; developers read elapsed time and turn count as drift cues [6]. Exact figures carry duration.
6. **A long wait needs progress, an interrupt and a way back.** Past about ten seconds attention leaves the task [10]; count text gives progress without a known total [11]; one composite indication is the default, per-subtask ones only where a subtask can be paused or stopped alone [12].
7. **Acknowledge at once; state at a glance; detail on demand.** Silence after invoking an agent creates uncertainty, and state should read at a glance with reasoning and tool calls inspectable [13]; a trace keeps plan, execution and evidence distinct in collapsed, bounded boxes [22].
8. **Evidence, not account.** Ask for the command and its output, the only record of an unwatched run [15]; stated reasoning diverges from actions with equal confidence [6]; explanations raise acceptance of wrong recommendations too [18].
9. **A trust point asked too often stops being one.** Users accept 93 % of manual permission prompts [16]. A confirmation works when rare and specific, outcome-labelled, with no default yes [17]; warning click-through ranged from a tenth to seven tenths with design [19]. Trust is calibrated and widened in stages, explanation depth matched to stakes [20]; consequences are conveyed and global controls offered [21].
10. **Interrupting is immediate and legible.** A request to disengage is honoured at once [13]; a follow-up can land after the current tool call, and a stop keeps committed work [14]. Mid-run redirection felt costly, so developers restarted [6]; after two failed corrections, start fresh [15].
11. **Waiting work waits for hours, hidden work longer.** A quarter of alert-driven suspensions exceeded two hours, hidden windows were resumed later, and context was lost [25]. An outward signal is never the only record and is withdrawn once stale [24]; action-required events are intrusive, and a fading message is the wrong carrier for an error [23].
12. **Recovery restores the place.** Relaunch returns people where they were, down to scroll position [27]; editors keep unsaved work across a crash by default [29]; a crash snapshot may be corrupt [28]; programmers resume slowly and prefer a diff of what changed [26].
13. **First launch asks only for what cannot be defaulted.** Up-front tours are skipped and forgotten [30]. An empty region says whether it is loading, failed or empty, with the one control that fills it [31]; missing configuration is named with its fix [32]. A desktop OAuth sign-in uses the system browser [34].
14. **A trace link is used only if trusted, and absence is not evidence.** Traceability made maintenance 24 % faster and 50 % more often correct [36]; untrusted links go unused and suggested ones need a human check [37]; only 60 % of commits were linked on average [39]; the preferred visualisation follows the task [38].
15. **Reusable assets drift.** Prompt versions are kept ad hoc, near-identical ones confused, and prompts break after a model change [40]; instruction files grow by addition and are rarely pruned [41]. Review's lessons become the next plan's assets [5].

## 3. Patterns and anti-patterns

| Pattern | When | Tell | Counter-move |
|---|---|---|---|
| Job story [1] | writing a brief | "a developer who…" with no trigger or anxiety | the brief template's §2, "when …, I want …, so that …" |
| Acknowledge on submit [13] | the composer starts a run | nothing until the first model token | the user prompt row; `Starting run…` (`REQ-CHAT-008`) |
| Glance state [13] [22] | an agent in flight | state only by reading rows | `StatusDot` with axis colour and word (§1.3, `REQ-SHELL-149`); folded tool groups |
| Composite progress [12] | a run with children | a meter per agent nobody can steer | the run header's `Tag` (§7.2 item 6); per-agent state in the delegation tree (G3; `REQ-MONITOR-137`) |
| Count, not percent [11] | no known total | a bare `Spinner`, "almost done" | exact monospaced counts (§1.11) |
| Approval fatigue [16] | a tool asks often | the queue counter climbs | approve for the session (`REQ-TOOLS-051`); Settings' Runtime category (`REQ-CONFIG-324`) |
| Justification first [18] | an approval arrives | the agent's account above the command | `REQ-TOOLS-063`'s order: headline, requester, detail box, matched rule |
| Fading error [23] | a run or tool fails | the failure only in an acknowledgement | a notice (`REQ-NOTIFY-023`, G1) |
| Stale signal [24] | answered elsewhere | the awaiting-input flag still set | `REQ-MONITOR-175`; `REQ-TOOLS-063` closes an answered dialog |
| Return over watch [8] [25] | the operator comes back | scrolling the whole transcript for a failure | a folded group takes its worst member's colour (G7); `REQ-SESSION-196` |
| Reasoning as evidence [6] [15] | a run reports done | no command output reachable | separate row categories; the `INPUT`/`OUTPUT` card (`REQ-CHAT-061`) |
| First-launch tour [30] | the first window | a walkthrough of the seven views | an `EmptyState` with one command (§1.10) |
| Empty while loading [31] [32] | a view before data | "nothing here" while loading, or with no provider | `Spinner` until settled; a notice with a notice action |
| Absence as no relation [39] | a card with no trace | a blank evidence segment | the stated empty reason (`REQ-TRACE-260`), named gaps (`REQ-TRACE-267`), G4 |
| Every row a card [43] | a dense list | identical boxes for different content | §7.2, a surface is earned; rubric C5 |

## 4. Method

1. **Name the job** per journey crossing the surface: trigger, anxiety, outcome [1].
2. **Pick the form.** A journey map across views [2]; a blueprint where agents work backstage, only rows, folded tool groups, the status strip and notices crossing the line [3]; a task analysis where the expert plan (command palette, `REQ-SHELL-049`) and the novice plan (navigation rail) differ [4].
3. **Phase it by the supervision loop** [5] onto the fixed views: plan in the composer and the Mission view; monitor and wait in the transcript, Overview and status strip; review in Git and Requirements; teach through the composer and steer card; update assets in the Library.
4. **Weight the phases by attention.** Return outweighs watching [8] [6], review both [9] [7]; the first minute after submit is the one close watch [15].
5. **Mark every wait, ask and trust point.** A wait names its limit [10] and its carrier outside the run's Workspace [25]; an ask is action-required or passive [23]; a trust point names the evidence checked, never the agent's account [15] [18].
6. **Name each carrier** in the glossary's words with the rule it obeys (section 3); a missing one is a §4.2 gap.
7. **Walk the failure branch.** Tool failures hit about one turn in eleven and a failed run can cost up to four times the compute [8]; every journey gets its recover step, cost still readable (`REQ-MONITOR-098`).
8. **Write what the material leaves unanswered as section-8 candidates**, never as a design.

| Journey | Surfaces | Wait or ask | Trust point |
|---|---|---|---|
| First launch | Overview `EmptyState`; provider sign-in dialog | the system-browser hand-off [34] | key storage; on Linux without a secret service, a fixed-password fallback [35] |
| Compose, start | composer, permission-mode chip; plan mode (`REQ-ORCH-153`, `REQ-ORCH-154`) | the plan blocks file-modifying work and stays editable | done, self-check, reach, stop, sign-off answered first [15] |
| Watch | transcript rows, folded tool groups, run header | the first minute [15]; elapsed, turns, `ContextRing` [6] | tool row status (`REQ-MONITOR-105`), not reasoning [6] |
| Approve | approval dialog (G2), queue counter | auto-opens (`REQ-CHAT-103`) | the redacted command [18] |
| Answer | question stepper (G14) | blocks to the timeout (`REQ-TOOLS-158`) | what the answer commits to [21] |
| Steer, pause, continue | steer card; pause; continue action (`PD-ORCH-005`) | `pausing` says the step finishes first (`REQ-MONITOR-124`) | what a stop keeps [14]; continue against restart [15] |
| Several agents | delegation tree (G3), persona windows, sessions card (`REQ-MONITOR-171`) | children backstage [3]; runs isolated (`REQ-ORCH-151`) | persona colour and indent (§7.3) |
| Away and back | status strip, session chip (G11), sessions card | hours, not minutes [25] | the awaiting-input flag (`REQ-MONITOR-175`); a background run's notice (`REQ-MONITOR-202`) |
| Review | Git view diffs, edit-diff rows (`REQ-CHAT-050`), checkpoints (`REQ-SESSION-164`) | what changed since the last review [6] | the operator's sign-off [7] |
| Trace | board, evidence indicator (G4), evidence view, graph (G16) | — | file and line (`REQ-TRACE-265`); gaps named (`REQ-TRACE-267`) [37] |
| Recover | notice action; `Run needs recovery` (`REQ-CHAT-008`); repair (`REQ-MONITOR-210`) | the relaunch | interrupted calls never rerun (`PD-ORCH-005`); the place restored [27] |
| Configure | Settings' Runtime and Models categories (`REQ-CONFIG-324`, `REQ-CONFIG-329`) | — | global controls [21], widened in stages [20] |
| Reuse | Library prompts and skills | — | which variant, which model, changed when [40] |
| Mission | undrawn (design README §3.2) | — | — |

## 5. Worked example

**Surface:** §7's row "Approval card", mockup `WORKSPACE` → the `approvalOn` block, nearest built code `packages/ui/src/ApprovalDialog.tsx`. Structure is `REQ-TOOLS-063`'s; the walk asks only what the method adds.

1. **Job.** When an agent asks to run a command while I read a diff in the Git view, I want to see exactly what will run and for whom, so that I never approve what I did not read. The anxiety is a stray keystroke answering it; `REQ-TOOLS-063` removes the default action and focuses Deny; the code focuses Deny (`deny.current?.focus()`) and prevents Enter except on a focused button, so Enter on Deny answers Deny.
2. **Phase.** Between watch and wait, often met on return: `REQ-CHAT-103` auto-opens the first pending approval wherever the operator is, so the wait needs carriers when nobody looks — the session chip (G11), the sessions card (`REQ-MONITOR-171`), `REQ-MONITOR-175`'s flag, cleared once answered elsewhere [24].
3. **Trust point.** The evidence is the detail box, the redacted command in the mono face (`--rt-font-mono`, §1.4), on the ground §1.1 gives a code chip (`--rt-surface-2`). It precedes `Matched rule: <rule_id>` and its reason: the call ahead of any account of why [18]. Fatigue comes from frequency [16], so the map counts openings per run; approve for the session (`REQ-TOOLS-051`) relieves it, and `{n} other requests waiting.` is count text [11].
4. **Composition.** One filled control, Approve once, the primary `Button` (§1.7); Deny alone takes `--rt-danger-500` (§1.3); the dialog floats, so it carries `--rt-shadow-md` (§1.7). The undeliverable state disables all three buttons and shows `REQ-CHAT-103`'s sentence, which the code carries verbatim (`APPROVAL_DELIVERY_FAILED`).
5. **Left open:** the session-wide approval's stated scope [21] and the weight of the filled Approve once [19] — D04-9, D04-10.

## 6. Checks

From the pack, `app:drive` or the DOM; a rubric id where the rubric has it, "new" where proposed.

- **F1** — Each section-4 journey crossing the surface completes on the built app, a PNG per step.
- **new** — Composer submit to first transcript row is under one second (`type --enter`, then `waitFor`) [10] [13].
- **new** — With Workspace not shown, a run waiting on an approval shows `REQ-MONITOR-175`'s sentence on its sessions-card row within 120 ms (`REQ-SHELL-150`) [25]; answering clears it in the same redraw [24].
- **F2** — A folded tool group with one `failed` member draws its header in the computed `--rt-fail` without unfolding (G7) [8].
- **F2** — No `EmptyState` while a `Spinner` holds the same region; with no provider, a notice with a notice action rather than first-use copy [31] [32].
- **F3** — The approval dialog opens with `document.activeElement` on Deny; Enter answers nothing; Tab runs Deny, Approve for this session, Approve once; one `--rt-focus` ring at `--rt-focus-ring-width` (`REQ-SHELL-148`).
- **D3** — One filled control per dense view; in the approval dialog, Approve once.
- **new** — The detail box precedes the matched-rule line in DOM order and computes to `--rt-font-mono`; the queue number equals pending requests minus one.
- **F4** — Run-state labels match `REQ-CHAT-008` character for character; no figure rounded or worded ("600K+", "almost done").
- **C6** — Every `StatusDot` has a sibling word (`REQ-SHELL-149`); waiting, running, done compute to `--rt-wait`, `--rt-run`, `--rt-done`.
- **C9** — `document.getAnimations()` over the transcript returns only `StatusDot` pulses and `Spinner`s.
- **C5** — In the transcript only user, approval and diff rows, a system row's notice rule and expanded tool cards carry a border or fill (§7.2) [43].
- **new** — An evidence indicator owing nothing shows its reason as text (`REQ-TRACE-260`); an incomplete evidence view names what is missing (`REQ-TRACE-267`) [39].
- **new** — After `stop --crash` and relaunch the draft is back character for character (`REQ-CHAT-015`), the transcript opens at its last rows, and the run reads `Run needs recovery` [26] [27].
- **new** — A persona window closed and reopened shows current state with no stale frame (`REQ-SHELL-076`, `REQ-SHELL-151`).
- **D4** — Each journey step still completes at 1000×680 and either side of 1180 and 1080 px; nothing `SHRUNK` [45].

## 7. How this applies here

**Requirements:** `REQ-SHELL-023`, `REQ-SHELL-027`, `REQ-SHELL-049`, `REQ-SHELL-076`, `REQ-SHELL-148`, `REQ-SHELL-149`, `REQ-SHELL-150`, `REQ-SHELL-151`; `REQ-CHAT-008`, `REQ-CHAT-015`, `REQ-CHAT-050`, `REQ-CHAT-061`, `REQ-CHAT-103`; `REQ-TOOLS-051`, `REQ-TOOLS-063`, `REQ-TOOLS-158`; `REQ-MONITOR-098`, `REQ-MONITOR-105`, `REQ-MONITOR-124`, `REQ-MONITOR-137`, `REQ-MONITOR-171`, `REQ-MONITOR-175`, `REQ-MONITOR-202`, `REQ-MONITOR-210`; `REQ-ORCH-151`, `REQ-ORCH-153`, `REQ-ORCH-154`; `REQ-SESSION-164`, `REQ-SESSION-196`; `REQ-CONFIG-324`, `REQ-CONFIG-329`; `REQ-NOTIFY-023`; `REQ-TRACE-260`, `REQ-TRACE-265`, `REQ-TRACE-267`. **Directive:** `PD-ORCH-005`.

**Design language:** §1.1, §1.3, §1.4, §1.7–1.11, §7.2, §7.3; gaps G1–G4, G7, G11, G14, G16. **Tokens:** `--rt-wait`, `--rt-run`, `--rt-done`, `--rt-fail`, `--rt-danger-500`, `--rt-focus`, `--rt-focus-ring-width`, `--rt-surface-2`, `--rt-shadow-md`, `--rt-font-mono`. **Components:** `Button`, `StatusDot`, `Tag`, `Spinner`, `EmptyState`, `ContextRing`, `Dialog`, `CommandPalette`, `NavRail`.

**Who reads what.**

| Derivative | Reads |
|---|---|
| `design-ui` brief §2 | §3, §4 (the journey table) |
| `design-ui` brief §10 | §8 |
| `design-ui` audit step 4, the journeys walk | §4's table, §6 |
| `design-ui` audit step 5, ranking by journey | §4's table |
| rubric F1 | §4, §6 |

Section 6's "new" lines are proposals for F1, F2 and D3. Section 8 reaches the open questions through the backlog.

**Paid-for lessons:** the tokens hold but composition breaks (§7.1) [43]; UIR-001..012, each repair a moved number [44]; bound the box, not only the child [45]; and a critic that filed an adopted token as an invention, why `review-ui` step 6 reads the source first.

## 8. Where this disagrees with the adopted material

**D04-1 —** A design system marks AI presence with glow and gradient tokens [42]. It meets §1.7: no glow, no gradient fills. *Question: where the operator's rows and an agent's must be told apart, is colour and place (§7.2's user-row tint, §7.3's persona colour) the whole answer?*

**D04-2 —** A platform guideline discourages progress in separate windows, since closing one has an unclear consequence [12]. It meets the persona windows (`REQ-SHELL-076`: closing hides, not destroys). *Question: does a persona window, and the main window once it closes, say that the agent's run continues and where its state stays visible?*

**D04-3 —** The operator is away most of a session and suspended work can wait hours [8] [25]. It meets `REQ-SHELL-023`'s seven views, none named as where everything waiting on the operator gathers. *Question: which existing surface (sessions card, status strip, session chip) does a returning operator read for every pending approval and question?*

**D04-4 —** The field study suggests a cue whose salience grows with time since last attention [25]. It meets §1.8: one fixed 1.6 s pulse, only while running. *Question: may a long-waiting `waiting` state change emphasis, or are the word and its elapsed figure the whole signal?*

**D04-5 —** A developer design system welcomes first use with an illustration and warm, non-technical copy [33]. It meets §1.11 (direct, technical, no filler) and §1.7, §1.10 (no decorative illustration; the grid motif only). *Question: does the undrawn first-launch surface (§7's "First launch" row) keep the technical voice, with the provider sign-in dialog carrying the guidance a welcome would?*

**D04-6 —** Participants judged a traceability matrix right for an overview and preferred it, with graphs, for management tasks [38]. It meets the Requirements view's fixed presentations (`REQ-TRACE-232`, `REQ-TRACE-293`, `REQ-TRACE-322`). *Question: do the board's columns and counts answer the all-requirements-against-evidence overview, or is that an unmet need to record?*

**D04-7 —** Windows guidance says a crash relaunch shows no warning, which would delay the user [28]. It meets `REQ-MONITOR-210`: the repair is offered and announced. *Question: is that announcement a non-modal notice with a notice action, so the relaunch never blocks, and does the specification already say so?*

**D04-8 —** Editors keep typed but unsaved edits across a quit and a crash by default [29]. It meets the ruling `AGENTS.md` records after OQ-298 (`docs/architecture/open-questions/61-spikes-and-later-questions-28.md`): no close guard on quit, so unsaved Settings edits are lost. *Question: should unsaved Settings edits outlive a quit as the draft does (`REQ-CHAT-015`), or is their loss the contract to state to the operator?*

**D04-9 —** A system should convey the consequences of a person's action [21]. It meets `REQ-TOOLS-063`'s enumerated contents, which label "Approve for this session" and state nothing of its scope. *Question: may the approval dialog say what a session-wide approval lets through, or is that content the requirement does not list?*

**D04-10 —** Design decides whether a warning is heeded [19]; a confirmation should not lean toward yes [17]. It meets `REQ-TOOLS-063`'s Approve once in primary styling, the one filled control of §1.7, while focus starts on Deny. *Question: does the filled Approve once draw the eye toward approving an unread call, and should that be measured before it stands?*

## 9. References and further reading

[1] [Alan Klement (Intercom), Designing features using Job Stories](https://www.intercom.com/blog/using-job-stories-design-features-ui-ux/) — job stories; retrieved 2026-11-01
[2] [Sarah Gibbons (NN/g), Journey Mapping 101](https://www.nngroup.com/articles/journey-mapping-101/) — one actor, phases, emotion line; retrieved 2026-11-01
[3] [Sarah Gibbons (NN/g), Service Blueprints: Definition](https://www.nngroup.com/articles/service-blueprints-definition/) — the line of visibility; retrieved 2026-11-01
[4] [Maria Rosala (NN/g), Task Analysis: Support Users in Achieving Their Goals](https://www.nngroup.com/articles/task-analysis/) — novice and expert plans; retrieved 2026-11-01
[5] [Park et al., The Work Behind Delegation: A Framework for Supervising AI Coding Agents](https://arxiv.org/abs/2609.24234) — the seven-stage loop; assets after review; retrieved 2026-11-01
[6] [Dhanorkar, Passi, Vorvoreanu (Microsoft), Human oversight of agentic systems in practice](https://arxiv.org/abs/2606.05391) — oversight timing, drift cues, divergence, re-review; retrieved 2026-11-01
[7] [Huang et al., Professional Software Developers Don't Vibe, They Control](https://arxiv.org/abs/2512.14012) — small chunks, review, overreach; retrieved 2026-11-01
[8] [Liu et al., Agentic Coding in the Wild: Characterizing GitHub Copilot Traces at Production Scale](https://arxiv.org/abs/2608.00101) — idle share, failures; retrieved 2026-11-01
[9] [Mozannar, Bansal, Fourney, Horvitz, Reading Between the Lines](https://arxiv.org/abs/2210.14306) — verification the largest activity; retrieved 2026-11-01
[10] [Jakob Nielsen (NN/g), Response Times: The 3 Important Limits](https://www.nngroup.com/articles/response-times-3-important-limits/) — the ten-second limit; retrieved 2026-11-01
[11] [Katie Sherwin (NN/g), Progress Indicators Make a Slow System Less Insufferable](https://www.nngroup.com/articles/progress-indicators/) — count text; retrieved 2026-11-01
[12] [GNOME Human Interface Guidelines, Progress Bars](https://developer.gnome.org/hig/patterns/feedback/progress-bars.html) — composite progress; retrieved 2026-11-01
[13] [Linear, Agent Interaction Guidelines (AIG)](https://linear.app/developers/aig) — feedback, state, disengage; retrieved 2026-11-01
[14] [GitHub Docs, Managing agent sessions](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/track-copilot-sessions) — queued steering; stop keeps commits; retrieved 2026-11-01
[15] [Anthropic, Best practices for Claude Code](https://code.claude.com/docs/en/best-practices) — evidence, first minute, corrections; retrieved 2026-11-01
[16] [John Hughes (Anthropic), How we built Claude Code auto mode: a safer way to skip permissions](https://www.anthropic.com/engineering/claude-code-auto-mode) — 93 % acceptance; retrieved 2026-11-01
[17] [Jakob Nielsen (NN/g), Confirmation Dialogs Can Prevent User Errors — If Not Overused](https://www.nngroup.com/articles/confirmation-dialog/) — specific, no default yes; retrieved 2026-11-01
[18] [Bansal et al., Does the Whole Exceed its Parts?](https://arxiv.org/abs/2006.14779) — explanations raise acceptance; retrieved 2026-11-01
[19] [Akhawe, Porter Felt, Alice in Warningland](https://www.usenix.org/conference/usenixsecurity13/technical-sessions/presentation/akhawe) — click-through varies with design; retrieved 2026-11-01
[20] [Google PAIR, Explainability + Trust](https://pair.withgoogle.com/chapter/explainability-trust/) — calibrated, staged trust; retrieved 2026-11-01
[21] [Microsoft Research, HAX Design Library](https://www.microsoft.com/en-us/haxtoolkit/library/) — guidelines 7–9, 16, 17; retrieved 2026-11-01
[22] [Emily Campbell (Shape of AI), Stream of Thought](https://www.shapeof.ai/patterns/stream-of-thought) — the trace; retrieved 2026-11-01
[23] [Kim Flaherty (NN/g), Indicators, Validations, and Notifications](https://www.nngroup.com/articles/indicators-validations-notifications/) — passive and active; retrieved 2026-11-01
[24] [GNOME Human Interface Guidelines, Notifications](https://developer.gnome.org/hig/patterns/feedback/notifications.html) — stale ones withdrawn; retrieved 2026-11-01
[25] [Iqbal, Horvitz, Disruption and Recovery of Computing Tasks](https://erichorvitz.com/CHI_2007_Iqbal_Horvitz.pdf) — suspensions, hidden windows; retrieved 2026-11-01
[26] [Parnin, Rugaber, Resumption strategies for interrupted programming tasks](https://chrisparnin.me/pdf/parnin-sqj11.pdf) — slow resumption; diffs preferred; retrieved 2026-11-01
[27] [Apple, Launching](https://developer.apple.com/design/human-interface-guidelines/launching) — restore the place; retrieved 2026-11-01
[28] [Microsoft Learn, Universal Windows Platform (UWP) application lifecycle](https://learn.microsoft.com/en-us/windows/uwp/launch-resume/app-lifecycle) — crash relaunch; retrieved 2026-11-01
[29] [Microsoft (VS Code docs), Basic editing](https://code.visualstudio.com/docs/editing/codebasics) — hot exit by default; retrieved 2026-11-01
[30] [Page Laubheimer (NN/g), Onboarding Tutorials vs. Contextual Help](https://www.nngroup.com/articles/onboarding-tutorials/) — tours skipped; retrieved 2026-11-01
[31] [Kate Kaplan (NN/g), Designing Empty States in Complex Applications: 3 Guidelines](https://www.nngroup.com/articles/empty-state-interface-design/) — empty states; retrieved 2026-11-01
[32] [IBM Carbon Design System, Empty states](https://carbondesignsystem.com/patterns/empty-states-pattern/) — missing configuration; retrieved 2026-11-01
[33] [GitHub Primer, Empty states](https://primer.style/product/ui-patterns/empty-states/) — welcoming first use; retrieved 2026-11-01
[34] [IETF (Denniss, Bradley), RFC 8252: OAuth 2.0 for Native Apps](https://datatracker.ietf.org/doc/html/rfc8252) — the system browser; retrieved 2026-11-01
[35] [Electron, safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage) — the Linux fallback; retrieved 2026-11-01
[36] [Mäder, Egyed, Do developers benefit from requirements traceability when evolving and maintaining a software system?](https://doi.org/10.1007/s10664-014-9314-z) — 24 % faster, 50 % more correct; retrieved 2026-11-01
[37] [Wohlrab et al., Collaborative traceability management: a multiple case study from the perspectives of organization, process, and culture](https://doi.org/10.1007/s00766-018-0306-1) — trust; retrieved 2026-11-01
[38] [Li, Maalej, Which Traceability Visualization Is Suitable in This Context? A Comparative Study](https://doi.org/10.1007/978-3-642-28714-5_17) — by task; retrieved 2026-11-01
[39] [Rath et al., Traceability in the Wild: Automatically Augmenting Incomplete Trace Links](https://arxiv.org/abs/1804.02433) — 60 % of commits linked; retrieved 2026-11-01
[40] [Liang, Lin, Rao, Myers, Prompts Are Programs Too!](https://arxiv.org/abs/2409.12447) — prompt versions; retrieved 2026-11-01
[41] [Chatlatanagulchai et al., Agent READMEs: An Empirical Study of Context Files for Agentic Coding](https://arxiv.org/abs/2511.12884) — growth; retrieved 2026-11-01
[42] [IBM Carbon Design System, Carbon for AI](https://carbondesignsystem.com/guidelines/carbon-for-ai/) — AI marking; retrieved 2026-11-01
[43] Rotaris record, `docs/design/README/07-7-fidelity-consult-before-maintain-after.md` §7.1–7.3 — composition, earned surfaces, two agents
[44] Rotaris record, `docs/architecture/codebase/17-all-twelve-critic-findings-repaired-and.md` — UIR-001..012
[45] Rotaris record, `.agents/skills/build-ui/SKILL.md` step 8 — bound the box, not only the child; `SHRUNK`
