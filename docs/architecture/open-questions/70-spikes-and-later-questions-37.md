# Open questions — Spikes, and the questions raised since (37 of 37)

Part 70 of 70 of the [open-questions record](../open-questions.md), which indexes every part. Holds OQ-507 – OQ-529.

<a id="oq-507"></a>

**OQ-507 — Which surfaces own a live region for streamed rows and terminal output, at what politeness and with what cap?** *(REQ-SHELL-144, REQ-SHELL-146, REQ-CHAT-178. Raised 2026-11-03 by [R-093](../../product/requests.md#r-093), guide 09 §8 items 9 and 10 ([the guide](../../research/design/09-accessibility-for-a-dense-desktop-tool.md)) of the design research corpus and backlog row 12 ([the backlog](../../research/design/backlog.md)); numbered from OQ-493: OQ-462 to OQ-492 are the hardening orchestration's.)*

**What is open.** REQ-SHELL-144's screen-reader clause asks only that “no interactive control announces an empty accessible name”. REQ-SHELL-146 asks the terminal window for named controls, contrast and an empty state that “is announced and explained”. REQ-CHAT-178 orders a tool row's accessible name but names no surface that speaks streamed output. Guide 09 §8 D09-9 and D09-10 cite ARIA practice: streams announced on arrival and completion, assertive kept for the imperative, a terminal library capping assertive output at 20 lines, and developers wanting control over how often an assistant speaks.

**What the build proceeds under.** No live region beyond what REQ-SHELL-144, REQ-SHELL-146 and REQ-CHAT-178 state.

**What decides it.** One ruling, by directive, that assigns a live region to each surface with a politeness and a cap. An operator preference for frequency would add a preference key to it.

<a id="oq-508"></a>

**OQ-508 — What does the main window open at when the display's work area cannot hold 1440×900?** *(REQ-SHELL-022, REQ-SHELL-167. Raised 2026-11-03 by [R-093](../../product/requests.md#r-093), guide 08 §8 item 20 ([the guide](../../research/design/08-platform-conventions-for-electron.md)) of the design research corpus and backlog row 59 ([the backlog](../../research/design/backlog.md)); numbered from OQ-493: OQ-462 to OQ-492 are the hardening orchestration's.)*

**What is open.** REQ-SHELL-022: the main window “opens at 1440×900 logical pixels”. REQ-SHELL-167 gives only the auxiliary windows a work-area rule: they open at their size “when the display work area can hold them, and otherwise the largest size within that work area preserving the stated aspect”. Guide 08 §8 D08-20 notes that a 1920×1080 display at 150 % offers 1280×720 logical pixels, less than the opening size.

**What the build proceeds under.** REQ-SHELL-022's fixed opening size.

**What decides it.** One ruling: REQ-SHELL-167's work-area clamp extends to the main window (a directive over REQ-SHELL-022), or the overflow is accepted.

<a id="oq-509"></a>

**OQ-509 — Is a command unavailable now omitted from the command palette or listed disabled with its reason, when REQ-SHELL-048 and REQ-CHAT-025 answer differently?** *(REQ-SHELL-048, REQ-CHAT-025, REQ-NOTIFY-008, REQ-SHELL-053. Raised 2026-11-03 by [R-093](../../product/requests.md#r-093), guide 05 §8 item 6 ([the guide](../../research/design/05-interaction-patterns-for-desktop-tools.md)) of the design research corpus and backlog row 32 ([the backlog](../../research/design/backlog.md)); numbered from OQ-493: OQ-462 to OQ-492 are the hardening orchestration's.)*

**What is open.** REQ-SHELL-048 gives the window one vocabulary that “every surface presents … the same way”, and ends “No surface presents an action the window cannot carry out”. For the composer's slash catalogue, REQ-CHAT-025 says the opposite: “Unavailable commands MUST stay listed, styled as disabled text, with their unavailability reason”. REQ-NOTIFY-008 has a disabled control name its reason. Guide 05 §8 D05-6 cites guidance to show unavailable commands disabled rather than hidden, though a palette may hide irrelevant ones.

**What the build proceeds under.** REQ-SHELL-048 for the palette and REQ-CHAT-025 for the slash catalogue, each as written.

**What decides it.** A reading of REQ-SHELL-048's last sentences: the palette omits what cannot run now, or lists it disabled with REQ-CHAT-025's reason. If the reading breaks the “same way” clause, a directive over REQ-SHELL-048 follows.

<a id="oq-510"></a>

**OQ-510 — Do the fixed strings that general copy guidance faults stand as written: Yes and Cancel, the approval headline, the undeliverable-answer sentences, `Notice` as a kind word, “Type an action…”?** *(§1.11, REQ-GIT-117, REQ-LIBRARY-115, REQ-TOOLS-063, REQ-CHAT-102, REQ-CHAT-103, REQ-NOTIFY-019, REQ-SHELL-051, REQ-NOTIFY-048, REQ-MONITOR-114, PD-CHAT-002. Raised 2026-11-03 by [R-093](../../product/requests.md#r-093), guide 05 §8 item 14 ([the guide](../../research/design/05-interaction-patterns-for-desktop-tools.md)) and guide 10 §8 items 13, 15, 18, 21 and 22 ([the guide](../../research/design/10-ux-writing.md)) of the design research corpus, backlog rows 28, 29, 57, 68 and 120 ([the backlog](../../research/design/backlog.md)) and the Overview audit of 2026-11-02, candidate (g) ([the brief](../../design/briefs/overview.md)); numbered from OQ-493: OQ-462 to OQ-492 are the hardening orchestration's.)*

**What is open.** §1.11 says “Where the specification fixes a string … the specification's wording wins over the voice guidance.” The guides fault these strings: (1) REQ-GIT-117's and REQ-LIBRARY-115's Yes and Cancel, against ConfirmDialog's verb-first label (§4.1), where guides 05 §8 D05-14 and 10 §8 D10-18 cite buttons that name their outcome. (2) REQ-TOOLS-063's headline `Allow <agent> to run <tool>?` beside Approve once, where guide 10 §8 D10-13 cites a title that names the risk and shares its button's verb. (3) REQ-CHAT-102's and REQ-CHAT-103's “Could not deliver … The waiting agent is no longer available.”, which state no next step (guide 10 §8 D10-22). (4) REQ-NOTIFY-019's kind word “Notice” for an acknowledgement, where `packages/ui/CONTEXT.md` keeps “notice” for the persistent surface (guide 10 §8 D10-15). (5) REQ-SHELL-051's placeholder “Type an action…”, where the glossary avoids “action” for “command” (the Overview audit, candidate (g)). (6) REQ-NOTIFY-048's `paused` and `completed` beside §1.11's `waiting` and `done`, which REQ-MONITOR-114 maps on the run header (guide 10 §8 D10-21).

**What the build proceeds under.** Every string verbatim under §1.11's precedence, and PD-CHAT-002's Submit as built.

**What decides it.** One ruling: each string stands, and the glossary records `Notice` and “action” as the specification's own exceptions; or a named string is revised by a directive over its requirement.

<a id="oq-511"></a>

**OQ-511 — May the shell damp its peripheral status by holding a non-emergency notice, sampling the status strip's figures, or dropping the run timer's seconds past an hour?** *(REQ-NOTIFY-024, REQ-NOTIFY-268, REQ-SHELL-150, REQ-CHAT-158, PD-CHAT-008, PD-STARTUP-010. Raised 2026-11-03 by [R-093](../../product/requests.md#r-093), guide 13 §8 items 9, 11 and 12 ([the guide](../../research/design/13-states-feedback-and-time.md)) of the design research corpus and backlog rows 85 and 86 ([the backlog](../../research/design/backlog.md)); numbered from OQ-493: OQ-462 to OQ-492 are the hardening orchestration's.)*

**What is open.** Three requirements make change appear at once. REQ-NOTIFY-024 makes the newest publication current at once in the one notice slot, and REQ-NOTIFY-268 records a warning or error notice “at publication … Recording precedes rendering”. REQ-SHELL-150: “the interval between consecutive repaints of a surface that has pending changes never exceeds 120 ms”, which includes the strip's token and cost figures. REQ-CHAT-158's run timer renders `H:MM:SS` and “MUST advance at least once per second”. Guide 13 §8 D13-9, D13-11 and D13-12 cite guidance against a persistent strip that flaps, against churning peripheral status and false precision (minutes, not seconds, at hours), and for non-urgent interruptions that wait for a boundary.

**What the build proceeds under.** Immediacy as specified. PD-STARTUP-010 and PD-CHAT-008 are the owner's and stay as written.

**What decides it.** One ruling on damping: it is admitted for named items by directives over REQ-NOTIFY-024, REQ-SHELL-150 or REQ-CHAT-158 (REQ-NOTIFY-268's record still taken at publication), or immediacy stands.

<a id="oq-512"></a>

**OQ-512 — Does REQ-SHELL-153's rule, that moving focus never changes the selection, extend to the delegation tree and the requirements graph?** *(REQ-SHELL-153, REQ-MONITOR-304, REQ-SHELL-073, REQ-TRACE-326, REQ-TRACE-327. Raised 2026-11-03 by [R-093](../../product/requests.md#r-093), guide 09 §8 item 8 ([the guide](../../research/design/09-accessibility-for-a-dense-desktop-tool.md)) and guide 05 §8 item 13 ([the guide](../../research/design/05-interaction-patterns-for-desktop-tools.md)) of the design research corpus and backlog rows 42 and 66 ([the backlog](../../research/design/backlog.md)); numbered from OQ-493: OQ-462 to OQ-492 are the hardening orchestration's.)*

**What is open.** REQ-SHELL-153: in “vertical navigation lists throughout the shell”, “Arrow Up, Arrow Down, Home and End move focus without changing the selection”. Two other surfaces differ. REQ-MONITOR-304 makes a key move in the delegation tree have “exactly the effect clicking that row has”, and under REQ-SHELL-073 a click opens a persona window when agent pop-out is on, so an arrow key can open a window. REQ-TRACE-327: “selecting a node re-centres on it”. Guide 09 §8 D09-8 cites ARIA practice that selection should not follow focus where selecting starts slow work. Guide 05 §8 D05-13 notes that graph viewers keep selecting a node apart from navigating from it.

**What the build proceeds under.** REQ-MONITOR-304 and REQ-TRACE-327 as written.

**What decides it.** One ruling: REQ-SHELL-153 governs the tree and the graph, with focus apart from selection (a directive over REQ-MONITOR-304, and the graph's keyboard model for G16), or both keep selection-follows-key.

<a id="oq-513"></a>

**OQ-513 — Are an overlay drawer and a card lifted in a board drag among the surfaces §1.7 lets carry a floating shadow?** *(§1.7, REQ-SHELL-059, REQ-TRACE-318. Raised 2026-11-03 by [R-093](../../product/requests.md#r-093), guide 14 §8 item 12 ([the guide](../../research/design/14-how-a-surface-gives-way.md)) and guide 02 §8 item 9 ([the guide](../../research/design/02-the-generated-look-and-its-counter-moves.md)) of the design research corpus and backlog rows 93 and 110 ([the backlog](../../research/design/backlog.md)); numbered from OQ-493: OQ-462 to OQ-492 are the hardening orchestration's.)*

**What is open.** §1.7: “a shadow only ever means *this floats*”, and `--rt-shadow-md` and `--rt-shadow-lg` “are reserved for dialogs, popovers, toasts and the command palette”. The built drawers carry `box-shadow: var(--rt-shadow-lg)` (`packages/ui/src/shell.css:1685`), and a card lifted in a drag (G15) floats too, yet §1.7's list names neither. Guide 14 §8 D14-12 cites guidance that a collapsed pane floats above the content. Guide 02 §8 D02-9 cites a card raised on drag. Its press scale-down is already excluded by §1.7's “No scale or shrink effects anywhere”.

**What the build proceeds under.** §1.7's list as written, with the built drawers keeping `--rt-shadow-lg` and the lifted card (G15) undrawn.

**What decides it.** A reading of §1.7's list, closed or illustrative. Either §1.7 is amended to name the drawer and the lifted card, or the drawers' shadow is a defect.

<a id="oq-514"></a>

**OQ-514 — May a product-authored notice about uncertain agent output speak in the agent's first person?** *(§1.11. Raised 2026-11-03 by [R-093](../../product/requests.md#r-093), guide 06 §8 item 14 ([the guide](../../research/design/06-ux-patterns-for-agent-products.md)) and guide 10 §8 item 10 ([the guide](../../research/design/10-ux-writing.md)) of the design research corpus and backlog row 104 ([the backlog](../../research/design/backlog.md)); numbered from OQ-493: OQ-462 to OQ-492 are the hardening orchestration's.)*

**What is open.** §1.11: “Second person in product copy and empty states; first person plural only in brand statements”. Guides 06 §8 D06-14 and 10 §8 D10-10 cite a study in which first-person statements of uncertainty reduced overreliance, while impersonal hedging did not significantly. Where product copy ends and agent text begins is not stated.

**What the build proceeds under.** §1.11's second person for all product copy.

**What decides it.** One ruling: §1.11 stands, with agent text read as outside it, or first person is admitted for a named class of notice by §1.11 amendment.

<a id="oq-515"></a>

**OQ-515 — Do first launch, a crash that leaves a session to continue and a user-cleared cell keep the plain technical voice, or does any earn warmth?** *(§1.7, §1.10, §1.11. Raised 2026-11-03 by [R-093](../../product/requests.md#r-093), guide 04 §8 item 5 ([the guide](../../research/design/04-the-agent-operator-journeys.md)), guide 10 §8 item 1 ([the guide](../../research/design/10-ux-writing.md)) and guide 13 §8 item 10 ([the guide](../../research/design/13-states-feedback-and-time.md)) of the design research corpus and backlog row 107 ([the backlog](../../research/design/backlog.md)); numbered from OQ-493: OQ-462 to OQ-492 are the hardening orchestration's.)*

**What is open.** §1.11 sets the voice “Direct, technical, unadorned … No filler”. §1.7 forbids “decorative illustration”, and §1.10 allows the grid motif only “behind hero sections and empty states”. Guides 04 §8 D04-5, 10 §8 D10-1 and 13 §8 D13-10 cite design systems that welcome first use with illustration and warm copy, pair a total failure's apology with something novel, and celebrate cleared work.

**What the build proceeds under.** §1.11's technical voice everywhere, with no illustration under §1.7 and §1.10.

**What decides it.** One ruling: words alone stand, with provider sign-in carrying the guidance a welcome would, or a §1.11 amendment admits warmth at named moments.

<a id="oq-516"></a>

**OQ-516 — Is a waiting approval seconds-critical, so the first opens at once and each next one as the dialog closes, or is each announced and opened by one command at the operator's breakpoint?** *(REQ-CHAT-103, REQ-TOOLS-063, PD-CHAT-002. Raised 2026-11-03 by [R-093](../../product/requests.md#r-093), guide 06 §8 items 1 and 2 ([the guide](../../research/design/06-ux-patterns-for-agent-products.md)) and guide 05 §8 item 16 ([the guide](../../research/design/05-interaction-patterns-for-desktop-tools.md)) of the design research corpus and backlog rows 25 and 26 ([the backlog](../../research/design/backlog.md)); numbered from OQ-493: OQ-462 to OQ-492 are the hardening orchestration's.)*

**What is open.** REQ-CHAT-103: “the first pending approval **auto-opens** its modal (questions wait for a click)”. PD-CHAT-002 narrows REQ-CHAT-103 for questions only. REQ-TOOLS-063: requests are “shown one at a time … the next queued request is presented as soon as the open dialog closes”, with a count of the others. Guide 06 §8 D06-1 cites interruption research: delivery at a breakpoint lowered frustration without slowing relevant answers. Guide 06 §8 D06-2 finds that when finishing one item reveals the next, people drain the queue and neglect their main task. Guide 05 §8 D05-16 finds grouped proposals accepted faster, though grouping hides a call that differs.

**What the build proceeds under.** REQ-CHAT-103's auto-open and REQ-TOOLS-063's one-at-a-time sequence.

**What decides it.** One ruling on cadence: it stands, or approvals are announced and opened by one command, with a break between requests or like calls grouped (directives over REQ-CHAT-103 and REQ-TOOLS-063).

<a id="oq-517"></a>

**OQ-517 — Does a high-impact approval request warrant a distinct still presentation within §1's tokens, or is asking less often the whole answer to habituation?** *(REQ-TOOLS-063, §1.7, §1.8. Raised 2026-11-03 by [R-093](../../product/requests.md#r-093), guide 05 §8 item 3 ([the guide](../../research/design/05-interaction-patterns-for-desktop-tools.md)), guide 06 §8 item 3 ([the guide](../../research/design/06-ux-patterns-for-agent-products.md)) and guide 10 §8 item 9 ([the guide](../../research/design/10-ux-writing.md)) of the design research corpus and backlog row 27 ([the backlog](../../research/design/backlog.md)); numbered from OQ-493: OQ-462 to OQ-492 are the hardening orchestration's.)*

**What is open.** REQ-TOOLS-063 fixes one dialog, “titled ‘Permission required’”. §1 gives each component one treatment, and §1.8 keeps animation to “status indicators only”. Guides 05 §8 D05-3, 06 §8 D06-3 and 10 §8 D10-9 cite security-warning research: warnings that varied in appearance resisted habituation over a working week, and the strongest attention devices moved.

**What the build proceeds under.** REQ-TOOLS-063's one fixed dialog, still under §1.8.

**What decides it.** One ruling: a distinct still variant for high-impact calls (a directive over REQ-TOOLS-063, which needs a recorded impact class), motion on decision dialogs (a §1.8 amendment), or fewer prompts through permissions alone.

<a id="oq-518"></a>

**OQ-518 — Should the approval dialog's one filled control be Approve once, when it pulls the eye toward approving a call the operator has not read?** *(REQ-TOOLS-063, §1.7. Raised 2026-11-03 by [R-093](../../product/requests.md#r-093), guide 04 §8 item 10 ([the guide](../../research/design/04-the-agent-operator-journeys.md)) of the design research corpus and backlog row 8 ([the backlog](../../research/design/backlog.md)); numbered from OQ-493: OQ-462 to OQ-492 are the hardening orchestration's.)*

**What is open.** REQ-TOOLS-063 gives “Approve once (primary styling)”, which §1.7 makes “the only filled surface”. Its resolution removed the default action and “puts initial focus on Deny”. Guide 04 §8 D04-10 cites warning-design research that a confirmation should not lean toward yes.

**What the build proceeds under.** REQ-TOOLS-063's primary Approve once, with focus on Deny.

**What decides it.** One ruling, possibly after a measurement: keep the filled Approve once, draw every answer as secondary, or fill Deny. A change is a directive over REQ-TOOLS-063 and departs, on this dialog, from §1.7's one filled control.

<a id="oq-519"></a>

**OQ-519 — May the approval dialog state what “Approve for this session” lets through, when REQ-TOOLS-063 enumerates its contents without it?** *(REQ-TOOLS-063. Raised 2026-11-03 by [R-093](../../product/requests.md#r-093), guide 04 §8 item 9 ([the guide](../../research/design/04-the-agent-operator-journeys.md)) and guide 06 §8 item 6 ([the guide](../../research/design/06-ux-patterns-for-agent-products.md)) of the design research corpus and backlog row 9 ([the backlog](../../research/design/backlog.md)); numbered from OQ-493: OQ-462 to OQ-492 are the hardening orchestration's.)*

**What is open.** REQ-TOOLS-063 lists the dialog's contents (“containing: the headline … the requester line … a read-only monospace detail box … a fine-print line `Matched rule: <rule_id>` … and exactly three buttons”). It labels “Approve for this session” without saying what that approval then admits. Guides 04 §8 D04-9 and 06 §8 D06-6 cite guidance that a consequence is stated before the act, as distinct from confirming it.

**What the build proceeds under.** REQ-TOOLS-063's enumerated contents only.

**What decides it.** One ruling: the dialog states the session approval's scope (a directive adding a line to REQ-TOOLS-063), or its contents stay closed.

<a id="oq-520"></a>

**OQ-520 — How does a tool row whose call waits at the approval dialog read as distinct from one executing, within `running`, `ok`, `failed` and `blocked`?** *(REQ-CHAT-060, REQ-MONITOR-105, REQ-TOOLS-063. Raised 2026-11-03 by [R-093](../../product/requests.md#r-093), guide 13 §8 item 13 ([the guide](../../research/design/13-states-feedback-and-time.md)) of the design research corpus and backlog row 7 ([the backlog](../../research/design/backlog.md)); numbered from OQ-493: OQ-462 to OQ-492 are the hardening orchestration's.)*

**What is open.** REQ-MONITOR-105 limits a tool row's status to “`running`, `ok`, `failed`, or `blocked`”. REQ-CHAT-060 draws “a pulsing `◉ running…` while it is still in flight”. A call held at REQ-TOOLS-063's dialog is in flight but not executing, and nothing on its row says so. Guide 13 §8 D13-13 finds that agent products show queued and waiting-for-approval apart from running.

**What the build proceeds under.** REQ-MONITOR-105's four statuses; only REQ-TOOLS-063's dialog shows the wait.

**What decides it.** One ruling: the wait is drawn inside the closed set (running plus a waiting cue in the axis X colour), or a fifth status is added (a directive over REQ-MONITOR-105 and REQ-CHAT-060 that reaches the store's status vocabulary).

<a id="oq-521"></a>

**OQ-521 — Should a question an absent operator returns to have expired at REQ-CHAT-093's 300 s default, with nothing on screen stating the limit?** *(REQ-CHAT-093, PD-CHAT-002. Raised 2026-11-03 by [R-093](../../product/requests.md#r-093), guide 06 §8 item 4 ([the guide](../../research/design/06-ux-patterns-for-agent-products.md)) of the design research corpus and backlog row 13 ([the backlog](../../research/design/backlog.md)); numbered from OQ-493: OQ-462 to OQ-492 are the hardening orchestration's.)*

**What is open.** REQ-CHAT-093: “The default response timeout MUST be **300 seconds** … the tool's own description tells agents the conversation waits up to 300 seconds”, and zero means no limit. PD-CHAT-002's form shows no limit, and its settled summary shows only “cancellation / timeout / no answer”. Guide 06 §8 D06-4 notes a shipping agent keeps a question open until answered, its timeout opt-in and off for screen readers and background sessions.

**What the build proceeds under.** REQ-CHAT-093's 300 s default.

**What decides it.** One ruling: the form states the limit, the default lengthens, or it becomes zero. A new default is a directive over REQ-CHAT-093 and changes the tool text agents read.

<a id="oq-522"></a>

**OQ-522 — Should the composer's primary button become stop while a run is live, where REQ-CHAT-005 makes it `Queue`?** *(REQ-CHAT-005, REQ-CHAT-029, PD-ORCH-005. Raised 2026-11-03 by [R-093](../../product/requests.md#r-093), guide 06 §8 item 8 ([the guide](../../research/design/06-ux-patterns-for-agent-products.md)) of the design research corpus and backlog row 31 ([the backlog](../../research/design/backlog.md)); numbered from OQ-493: OQ-462 to OQ-492 are the hardening orchestration's.)*

**What is open.** REQ-CHAT-005: the button reads “`Queue` while a local run is active”. Stopping is already reachable from the composer as `/stop` (REQ-CHAT-029, narrowed by PD-ORCH-005 clause 15, “the stop control's gesture”) and from the stop control. Guide 06 §8 D06-8 cites the convention that the control that starts work becomes stop in the same place.

**What the build proceeds under.** REQ-CHAT-005's `Queue`, with stop through `/stop` and the stop control.

**What decides it.** One ruling: REQ-CHAT-005 stands, or a directive over it puts stop in the button and moves queuing elsewhere.

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
