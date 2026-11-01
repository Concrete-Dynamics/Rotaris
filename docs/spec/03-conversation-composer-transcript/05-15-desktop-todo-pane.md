# Conversation, Composer, and Transcript — 15. Desktop Todo Pane

Part 5 of 7 of [domain 03](../03-conversation-composer-transcript.md), which indexes every part. Defines REQ-CHAT-085 – REQ-CHAT-174.

### 15. Desktop Todo Pane

- **REQ-CHAT-085** — The sidebar's "Task plan" strip MUST show, in its header, the number of done tasks out of the total number of tasks. Task rows MUST be grouped under phase labels rendered as a monospace uppercase kicker carrying the phase name, or the phase id when the phase has no name, with one row per task and one "+ Add task" affordance per phase. With no tasks the strip MUST show "No task plan" and "Agent-created tasks will appear during a run.". A refresh that leaves every task and phase unchanged MUST leave the strip untouched — in particular, an open rename or add editor MUST stay open, keeping the text the user has typed and the caret position.
- **REQ-CHAT-086** — Each task row MUST render a status glyph — `✓` done (success color), `◌` active (wait color), `○` open (tertiary), `⊘` abandoned (failure color) — with done and abandoned tasks struck through and dimmed. Every one of the four display states MUST be distinguishable by its glyph alone, so no state is carried by colour only. Those four values — `done`, `active`, `open`, `abandoned` — are the whole of the task display-state vocabulary, and this requirement, together with the backend mapping of REQ-CHAT-088, is the product's single definition of it: a document that stores, transmits, presents, or validates a task display state MUST cite this identifier rather than restating the set, and MUST NOT omit `abandoned` from it. The task text is click-to-rename in place (tooltip "Click text to rename"; the accessible name announces renameability); the rename commits when editing finishes; empty or unchanged text reverts silently. A small `×` remove button (20×20) is visible on row hover/focus.
- **REQ-CHAT-087** — "+ Add task" MUST swap to an inline editor (placeholder "Task name", accessible name "New task name") that commits on Enter or focus loss, ignores empty text, and restores the button.
- **REQ-CHAT-088** — The backend task-state vocabulary this requirement maps from is the one REQ-TOOLS-144 fixes, which this document does not restate and does not extend; what is stated here is only the mapping onto the display states of REQ-CHAT-086. Those states map to display states COMPLETED → done, IN_PROGRESS → active, ABANDONED → abandoned, and PENDING or any unrecognized value → open. Tasks without ids display defaults of the form `<phase>-task-<n>`; unnamed phases display "Phase <n>". Where the transcript is scoped to a child agent that carries a todo of its own, that child's todo takes priority; otherwise an agent-maintained todo takes priority over a planner-maintained one. The strip MUST name which of the three sources it is showing, so a reader can tell a child's plan from the run's.
- **REQ-CHAT-089** — Task and phase ids assigned by the backend MUST be 8-character hexadecimal strings, fixed when the task or phase is created and unchanged thereafter. A task the user adds from the desktop MUST appear in the plan at once carrying a temporary id that cannot be mistaken for a backend id, and MUST adopt the backend id once the write-through of REQ-CHAT-090 returns it. The hexadecimal digits MUST be lowercase, so two ids differing only in case cannot both exist. A temporary client-side id MUST take the form `local-<n>`, where `<n>` is unique within the window: it is neither eight characters long nor drawn only from hexadecimal digits, so no temporary id can be mistaken for a backend id by inspection. A temporary id MUST never be written to the session record and MUST never reach a model.
- **REQ-CHAT-090** — Todo edits apply optimistically to the visible list immediately (no-op on unknown ids, unchanged, or empty text), then write through: during an active run to the live run's todo list — a refusal reloads the persisted session (reverting the optimistic edit) and toasts "Todo editing is not ready for this active run yet." — and for paused/completed sessions to the persisted snapshot, which is validated, saved, and re-projected. In demo mode the optimistic state simply remains.
- **REQ-CHAT-091** — Todo edit validation: add requires non-empty text and an existing phase; rename requires non-empty text, an existing task, and an actual change; remove locates the task across phases; the operation reports whether anything changed.

### 16. Structured Questions: Tool Contract

- **REQ-CHAT-092** — A structured-questions action MUST carry 1–10 ordered steps; each step has a unique id, a non-empty title, an optional description, at most 8 options (each with a non-empty label and optional description), and a freeform-allowed flag defaulting to true; a step MUST offer options or freeform (or both). Violations reject the action before anything is shown to the user.
- **REQ-CHAT-093** — The default response timeout MUST be **300 seconds** (overridable at tool construction; the tool's own description tells agents the conversation waits up to 300 seconds). A timeout value of **zero means wait without limit**.
- **REQ-CHAT-094** — At most one question prompt may be pending per conversation; a second concurrent request for the same conversation MUST be rejected and its tool call observes a cancelled result. If the steps cannot be published to the frontend, the pending prompt is discarded and the tool observes a cancelled result with the message "Questions could not be shown to the user.".
  > **Narrowed by [`PD-ORCH-005`](../../product/directives/pd-orch-005.md#pd-orch-005) revision 6, 2026-10-06.** Clause 38: a
  > question put in the quit's gap is recorded pending and withdrawn by the quit, not discarded as "could not be
  > shown".
- **REQ-CHAT-095** — Tool outcomes: cancelled → "Questions were cancelled."; timed out → "User did not respond within <N> seconds." (the model sees "User did not respond to the questions in time."); resolved → "Received answers for N step(s)." with an answers map `{step_id: {selected_option: string|null, freeform_text: string|null}}`. The model-visible content renders a "## User Answers" section with one `- **<id>**: <value>` line per step and "(no answer)" for empty answers.
- **REQ-CHAT-096** — Answer routing MUST target the exact (conversation, prompt id) pair: a stale prompt id resolves nothing; conversation teardown cancels that conversation's pending prompt; run shutdown cancels every pending prompt; a timed-out wait cleans up its own pending entry.

### 17. Desktop Question Stepper

- **REQ-CHAT-097** — When an agent asks structured questions, the pending state MUST become visible in the desktop transcript as the question trailer row (REQ-SESSION-157) on the whole-session update that carries it (REQ-MONITOR-216), within the visibility budget of REQ-MONITOR-222 — the pending state is published to the surface and MUST NOT be discovered by re-reading persisted state on a timer (REQ-SESSION-071) — and the pending state MUST clear when the matching tool result event arrives.
  > **Extended by [`PD-CHAT-002`](../../product/directives/pd-chat-002.md#pd-chat-002), 2026-09-13.** Pending
  > questions auto-open and dock at the bottom of the transcript above the composer; the pending
  > state publishes on the same whole-session update and clears when the tool result arrives.
- **REQ-CHAT-098** — Clicking the question row opens a modal stepper; only one such modal exists at a time; the row persists and the stepper is re-openable while the prompt is pending. If the pending state clears while the modal is open (answered elsewhere, cancelled, run stopped), the modal MUST close programmatically without emitting a second decision.
  > **Superseded by [`PD-CHAT-002`](../../product/directives/pd-chat-002.md#pd-chat-002), 2026-09-13.** Questions
  > auto-open docked at the bottom of the transcript without requiring a trailer click or modal dialog.
- **REQ-CHAT-099** — Stepper presentation: a modal dialog titled "Agent Questions", minimum 520×420; a step indicator of numbered circular pills (28 px) — active pill accent-filled, completed pills success-filled, inactive pills neutral; a bold step title with a dimmed optional description.
  > **Superseded by [`PD-CHAT-002`](../../product/directives/pd-chat-002.md#pd-chat-002), 2026-09-13.** Stepper
  > presentation is replaced by an all-in-one scrollable docked card rendering all steps simultaneously.
- **REQ-CHAT-100** — Answering: options are single-select cards (the selected card gets an accent border and surface fill); clicking the selected card deselects it; selecting an option clears any freeform text. The freeform editor (placeholder "Or type your own answer…", maximum height 100 px) is visible only when the step allows freeform and no option is selected; whitespace-only text does not count as an answer.
  > **Extended by [`PD-CHAT-002`](../../product/directives/pd-chat-002.md#pd-chat-002), 2026-09-13.** Governs
  > across all steps presented concurrently in the all-in-one docked form.
- **REQ-CHAT-101** — Navigation: Back is disabled on the first step; Next is hidden on the last step and stays disabled while the current step holds no answer; Submit appears only on the last step and is gated the same way; returning with Back preserves answers already entered; pressing Escape cancels the whole prompt when the first step is showing and otherwise moves one step back; closing the window emits cancellation exactly once and immediately releases the waiting tool call; Submit delivers every step's answer in one payload.
  > **Narrowed by [`PD-CHAT-002`](../../product/directives/pd-chat-002.md#pd-chat-002), 2026-09-13.** Sequential
  > Back/Next navigation is replaced by all-in-one form scrolling; Submit requires all steps answered;
  > Escape or window unload cancels the whole prompt immediately.
  > Revision 2 (2026-09-28): an unload the application's quit causes cancels nothing; the quit withdraws the prompt
  > (`PD-ORCH-005` clause 9).
- **REQ-CHAT-102** — If answer delivery fails, the modal MUST stay open showing "Could not deliver answers. The waiting agent is no longer available." — a success outcome MUST NOT be reported to the user unless a waiting tool call actually received the answers. On success the modal completes and closes. Cancelling forwards a cancellation to the waiting tool.
  > **Extended by [`PD-CHAT-002`](../../product/directives/pd-chat-002.md#pd-chat-002), 2026-09-13.** On delivery
  > failure, the docked form remains open displaying the requirement's failure sentence.
- **REQ-CHAT-103** — Pending permission approvals share the trailer/modal machinery with these differences: the first pending approval **auto-opens** its modal (questions wait for a click); further requests queue; a request that goes stale while shown closes without a second decision; failed delivery shows "Could not deliver the decision. The waiting agent is no longer available.". (Full approval semantics belong to the permission domain.)
  > **Narrowed by [`PD-CHAT-002`](../../product/directives/pd-chat-002.md#pd-chat-002), 2026-09-13.** Permission
  > approvals retain the modal dialog while questions are decoupled from the modal machinery and
  > present docked in the transcript.

### 18. Terminal Composer *(withdrawn — no terminal frontend)*

- **REQ-CHAT-104** — *Withdrawn.* Specified the terminal composer's single-line and multiline modes, submission keys, and placeholder; the desktop composer of REQ-CHAT-001 is multiline in every state and its placeholder is fixed by REQ-CHAT-004.
- **REQ-CHAT-105** — *Withdrawn.* Specified the terminal composer's border title and meta bar; the run-state label of REQ-CHAT-008, the selector chips of REQ-CHAT-009, the stash affordance of REQ-CHAT-042, and the run-timing indicator of REQ-CHAT-158 carry between them everything it showed.
- **REQ-CHAT-106** — *Withdrawn.* Specified the terminal run-timing chip; REQ-CHAT-158 carries the run-timing indicator, with the same per-model-call and freeze-at-terminal semantics, in the desktop run header.
- **REQ-CHAT-107** — *Withdrawn.* Specified where a terminal submission is routed; REQ-CHAT-005, REQ-CHAT-011, and REQ-CHAT-035 fix desktop routing, and steering has a surface of its own in REQ-MONITOR-070 and REQ-MONITOR-137.
- **REQ-CHAT-108** — *Withdrawn.* Specified steering from the terminal composer; steering a live agent is the steer card of REQ-MONITOR-070, initiated as REQ-MONITOR-137 states, and is not a composer mode.
- **REQ-CHAT-109** — *Withdrawn.* Specified that terminal-queued prompts carry no session ownership; ownership is fixed by REQ-CHAT-039 and consumption by REQ-CHAT-038 and REQ-CHAT-040.

### 19. Terminal Prompt History and Stash *(withdrawn — no terminal frontend)*

- **REQ-CHAT-110** — *Withdrawn.* Specified terminal prompt-history recall; REQ-CHAT-016 and REQ-CHAT-017 carry history recall and recording on the desktop.
- **REQ-CHAT-111** — *Withdrawn.* Specified a terminal-only prompt-history file; desktop prompt history persists per workspace under REQ-CHAT-045.
- **REQ-CHAT-112** — *Withdrawn.* Specified a terminal-only, user-global stash file; the stash persists per workspace under REQ-CHAT-045.
- **REQ-CHAT-113** — *Withdrawn.* Specified four terminal routes to the stash; REQ-CHAT-042, REQ-CHAT-043, and REQ-CHAT-044 carry stashing, applying, and popping on the desktop, including the blank-line separator used when appending into a non-empty composer.

### 20. Terminal Slash Commands *(withdrawn — no terminal frontend)*

- **REQ-CHAT-114** — *Withdrawn.* Specified terminal slash interception; REQ-CHAT-019, REQ-CHAT-020, and REQ-CHAT-023 carry recognition, outcome reporting, and the rule that command text never reaches an agent.
- **REQ-CHAT-115** — *Withdrawn.* Specified that an unrecognized `/token` is forwarded to the agent as a prompt in the terminal; REQ-CHAT-021 is canonical for the product — an unknown or unavailable command is never treated as prompt content.
- **REQ-CHAT-116** — *Withdrawn.* Specified terminal registry semantics; REQ-CHAT-018 fixes parsing and REQ-CHAT-022 fixes registration and lookup.
- **REQ-CHAT-117** — *Withdrawn.* Specified terminal run-control commands; `/stop`, `/pause`, `/new`, `/resume`, and `/sessions` are catalogue entries under REQ-CHAT-029 and REQ-CHAT-031, quitting the application belongs to the desktop shell domain, and no background-execution command is carried forward.
- **REQ-CHAT-118** — *Withdrawn.* Specified terminal utility commands; REQ-CHAT-028 mirrors every palette entry into the catalogue, REQ-CHAT-159 fixes argument-taking commands including `/theme` and `/logout`, REQ-CHAT-162 carries skill listing and manual loading, and REQ-CHAT-166 carries tool-result and tool-input visibility with their line caps.
- **REQ-CHAT-119** — *Withdrawn.* Specified `/cancel` resolving against a stack of terminal screens; REQ-CHAT-002 governs dismissal of overlays on the desktop and REQ-CHAT-029 governs cancelling a run.
- **REQ-CHAT-120** — *Withdrawn.* Specified the terminal suggestion overlay; REQ-CHAT-024 through REQ-CHAT-027 are the canonical suggestion, ranking, and highlighting contract, and they include the prefix-first ranking and unknown-name flagging the overlay lacked.

### 21. Terminal Custom Prompt and Skill Commands *(withdrawn — no terminal frontend)*

- **REQ-CHAT-121** — *Withdrawn.* Specified terminal prompt-file commands; REQ-CHAT-160 carries prompt-file discovery, naming, and registration into the desktop catalogue.
- **REQ-CHAT-122** — *Withdrawn.* Specified placeholder expansion for terminal prompt commands; REQ-CHAT-161 carries it, including the empty-string rule for unsupplied values and the quoting rule for positional splitting.
- **REQ-CHAT-123** — *Withdrawn.* Specified terminal `/skills` and `/skill <path>`; REQ-CHAT-162 carries listing the discovered skills and loading a skill from a path, and requires both to be reachable from the settings surface as well.
- **REQ-CHAT-124** — *Withdrawn.* Specified the terminal skill payload and its collision rule; REQ-CHAT-034 carries reachability and collision handling and REQ-CHAT-162 fixes what an attached skill delivers.

### 22. Terminal Transcript Rendering *(withdrawn — no terminal frontend)*

- **REQ-CHAT-125** — *Withdrawn.* Specified the terminal transcript's border title and follow-state subtitle; REQ-CHAT-070 carries follow state and REQ-CHAT-072 the new-output affordance.
- **REQ-CHAT-126** — *Withdrawn.* Specified terminal render caches; REQ-CHAT-055, REQ-CHAT-058, and REQ-CHAT-165 carry bounded desktop transcript memory and cost proportional to what changed.
- **REQ-CHAT-127** — *Withdrawn.* Specified terminal row styling per role; REQ-CHAT-046, REQ-CHAT-047, REQ-CHAT-056, REQ-CHAT-057, REQ-CHAT-060, REQ-CHAT-062, and REQ-CHAT-068 carry desktop row rendering for every role it listed.
- **REQ-CHAT-128** — *Withdrawn.* Specified the terminal reasoning header and its global show-reasoning flag; REQ-CHAT-062 carries reasoning rows and REQ-CHAT-167 carries the global reasoning-visibility preference.
- **REQ-CHAT-129** — *Withdrawn.* Specified terminal live-stream phases; REQ-CHAT-062 and REQ-CHAT-063 carry live reasoning rows and their refresh, and REQ-CHAT-164 carries the provider-stall indicator and the stop-where-it-stands rule.
- **REQ-CHAT-130** — *Withdrawn.* Specified a terminal live-stream Markdown window and its partial-input hardening; REQ-CHAT-056 requires mid-stream Markdown to render without error or spillover and REQ-CHAT-055 bounds what rendering may cost.
- **REQ-CHAT-131** — *Withdrawn.* Specified stream-to-display rules for the terminal; REQ-CHAT-163 carries all three rules, and the three-shape reasoning recognition, for the product as a whole.
- **REQ-CHAT-132** — *Withdrawn.* Specified terminal tool-display defaults and status markers; REQ-CHAT-166 carries the display settings, caps, and truncation marking, and REQ-CHAT-060 fixes the closed status vocabulary and how each value renders.
- **REQ-CHAT-133** — *Withdrawn.* Specified the terminal diff block; REQ-CHAT-050 carries edit-diff rows, and now carries the 50-line render cap, the no-diff-for-failed-writes rule, and the undo-renders-the-restoration rule, under the user-only exclusion of REQ-CHAT-153.
- **REQ-CHAT-134** — *Withdrawn.* Specified the terminal queued-prompt section; REQ-CHAT-036 and REQ-CHAT-037 carry the queued-messages panel and its per-row edit and delete actions.
- **REQ-CHAT-135** — *Withdrawn.* Specified terminal agent-scoped views and the focus badge; REQ-CHAT-069 carries the scope toggle and now names the focused agent, its state, and its elapsed time.
- **REQ-CHAT-136** — *Withdrawn.* Specified terminal URL linkification and browser opening; REQ-CHAT-076 carries activating both bare and Markdown links, trailing-punctuation trimming, and the reporting of a failure to open.
- **REQ-CHAT-137** — *Withdrawn.* Specified terminal mouse selection and right-click copy; REQ-CHAT-075 carries pointer selection over every row category, copying, and the reporting of a copy the platform refused.
- **REQ-CHAT-138** — *Withdrawn.* Specified terminal reasoning-header hit tracking; REQ-CHAT-076 carries click routing on the desktop.

### 23. Terminal Transcript Memory, Archive, and Paging *(withdrawn — no terminal frontend)*

- **REQ-CHAT-139** — *Withdrawn.* Specified terminal transcript-memory configuration keys; REQ-CHAT-165 fixes bounded residency and on-demand paging as product behaviour and exposes neither as configuration, so no out-of-range value can arise.
- **REQ-CHAT-140** — *Withdrawn.* Specified the terminal on-disk transcript archive and its page sentinels; REQ-CHAT-165 carries keeping the whole conversation readable while resident memory stays bounded, against the session record rather than a second on-disk format.
- **REQ-CHAT-141** — *Withdrawn.* Specified terminal scroll-up archive paging; REQ-CHAT-165 carries loading older rows back in on scroll, off the interface thread, with a failure reported and re-attemptable.
- **REQ-CHAT-142** — *Withdrawn.* Specified the terminal widget's refresh interval and scroll restoration; REQ-CHAT-063 fixes live-row refresh and REQ-CHAT-071 fixes anchored position restoration.

### 24. Terminal Search, Clearing, and Compression *(withdrawn — no terminal frontend)*

- **REQ-CHAT-143** — *Withdrawn.* Specified the terminal search modal and its proportional scrolling; REQ-CHAT-074 carries transcript search and navigates to the matched row exactly rather than approximately.
- **REQ-CHAT-144** — *Withdrawn.* Specified the terminal two-step timed clear; REQ-CHAT-082, REQ-CHAT-083, and REQ-CHAT-084 carry confirmed transcript clearing and its outcomes.
- **REQ-CHAT-145** — *Withdrawn.* Specified terminal `/compress`; REQ-CHAT-078 through REQ-CHAT-081 carry manual context compression, its concurrency, and its per-agent failure reporting.

### 25. Terminal Todo Pane *(withdrawn — no terminal frontend)*

- **REQ-CHAT-146** — *Withdrawn.* Specified the terminal todo pane and its source labelling; REQ-CHAT-085 through REQ-CHAT-088 carry the task-plan strip, which is editable, and REQ-CHAT-088 now carries the source priority and requires the source to be named.
- **REQ-CHAT-147** — *Withdrawn.* Specified terminal todo content; REQ-CHAT-085 carries the header count and empty state, REQ-CHAT-086 the per-status glyphs including the abandoned state, and REQ-CHAT-088 the status mapping.
- **REQ-CHAT-148** — *Withdrawn.* Specified queued prompts appearing in the terminal todo pane; REQ-CHAT-040 creates the “Queued Prompts” phase and its tasks and REQ-CHAT-085 renders phases in the task-plan strip.

### 26. Terminal Keyboard Leader System *(withdrawn — no terminal frontend)*

- **REQ-CHAT-149** — *Withdrawn.* Specified the terminal leader-chord system and its configuration key; REQ-CHAT-002 fixes the desktop shortcuts and REQ-CHAT-028 keeps every palette action reachable as a slash command.
- **REQ-CHAT-150** — *Withdrawn.* Specified the terminal armed-leader indicator and its timeout; there is no leader to arm.
- **REQ-CHAT-151** — *Withdrawn.* Specified the terminal command-palette screen and its shortcut cheat sheet; the desktop command palette is mirrored into the catalogue by REQ-CHAT-028 and the global shortcuts are listed by REQ-CHAT-002, which F1 opens.
- **REQ-CHAT-152** — *Withdrawn.* Specified the boundary between the terminal leader system and the desktop shortcuts; with no terminal frontend there is no boundary, and REQ-CHAT-028 carries the rule that every palette action is also reachable as a slash command.

### 27. Cross-Cutting Invariants

- **REQ-CHAT-153** — No user-only display content may reach a model. Edit-diff rows (REQ-CHAT-050), the focused-agent indicator of REQ-CHAT-069, delegation-context headers, the queued-messages panel, temporary client-side ids (REQ-CHAT-089), and every truncation marker added for display (REQ-CHAT-166) MUST be absent from prompt text sent to a model, from summaries, from compression input, and from token estimates. Consequently, adding any of them to the view MUST leave a conversation's token estimate unchanged, and a model MUST never be able to quote them back. Image attachments are not user-only display content: they are submitted deliberately by the user, they are part of the prompt sent to the model, and they count toward token estimation on the terms of REQ-CHAT-174. This requirement therefore does not exclude them.
- **REQ-CHAT-154** — Transcript memory MUST be bounded — the row-measurement and rendered-row caches of REQ-CHAT-058, together with the bounded residency and on-demand paging of REQ-CHAT-165 — and update cost MUST be proportional to what changed, not to the transcript's length. "Update cost" is read at REQ-CHAT-055's measurement point — the moment the interface has finished showing the update — and this requirement fixes no second one; where the two sentences could be read differently, REQ-CHAT-055 governs.
- **REQ-CHAT-155** — Confirmation MUST precede destruction throughout the domain: transcript clearing requires the explicit confirmation dialog of REQ-CHAT-083; widening to autonomous permission mode requires the confirmation of REQ-CHAT-009; stale queue edits are refused with explanatory toasts rather than applied.
- **REQ-CHAT-156** — Composer input MUST remain reachable during runs — the composer stays editable and its primary action is labelled `Queue` (REQ-CHAT-005, REQ-CHAT-006) — so a running agent never locks the user out of typing.
- **REQ-CHAT-168** — Every parenthetical plural marker written in this document — "step(s)", "update(s)", "agent(s)", "skill(s)", "match(es)", and any other of that shape — is illustrative and MUST NOT be rendered literally. A message carrying a count MUST be grammatically correct for the count it carries, including the singular case and the zero case, with the wording left to the implementation. This rule applies to human-readable messages only; a string that is part of a machine-readable contract is unaffected.

### 28. Performance Targets (runtime-verifiable)

- **REQ-CHAT-157** — Streamed output and interface updates SHOULD appear on screen within **200 ms** of being produced. While an animation is running, the composer MUST still accept and display keystrokes within that same budget. Transcript size MUST NOT erode interactivity: the budget MUST hold with 1000 or more rows present, and the on-demand paging of REQ-CHAT-165 MUST keep resident memory flat as the conversation grows without bound. Partial streamed output MUST render without dropping or duplicating any character, so the finished message equals the concatenation of the deltas received. These budgets are acceptance criteria, measured on the machine under test rather than against named reference hardware, and the performance-benchmark domain's replay harness (`REQ-UIBENCH-*`) is the authority that accepts or rejects them: a build that misses any of them under that harness's stated fixture load fails this domain, whatever its average behaviour.

### 29. Image Attachments

- **REQ-CHAT-169** — The desktop composer SHALL accept image attachments by drag-and-drop onto the composer and by an explicit file picker. Attachments form an ordered list held alongside the composer text; each is presented as a removable entry showing its filename, declared media type and byte size, and removing one SHALL leave the text and the other attachments untouched. A submission carries the text and the ordered attachment list as a single prompt; an empty text with at least one attachment is a valid submission.
  > **Narrowed by [`PD-CHAT-011`](../../product/directives/pd-chat-011.md#pd-chat-011), 2026-11-01.** An image whose base64 payload exceeds the contract's bound is refused by main with a headline naming the field and the bound; the text and the other attachments stay. Everything else above still governs.
- **REQ-CHAT-170** — Accepted media types SHALL be exactly `image/png`, `image/jpeg`, `image/webp` and `image/gif`, determined from the file's content rather than its extension. A single attachment SHALL NOT exceed **10 MiB** and one submission SHALL NOT carry more than **10** attachments or more than **25 MiB** in total. A file that is rejected — unsupported type, over a ceiling, unreadable — SHALL be reported with the reason and the offending filename, and SHALL leave the composer text and every already-accepted attachment in place. The message states what was rejected and why; its wording is left to the implementation.
- **REQ-CHAT-171** — Attachment is gated on the selected model, against the image-input declaration REQ-PROVIDER-149 fixes. What this requirement relies on that one for is that every model entry carries the declaration, how it is populated, and that a model supplying no value does not announce image input; none of that is restated here. Given a selected model that does not announce image input, the attachment affordances SHALL be disabled and SHALL state that the selected model does not accept images, and no attachment SHALL be sent. Given a selected model that announces image input, the affordances SHALL be enabled. The gate is evaluated against the model actually selected for the submission, not the workspace default.
- **REQ-CHAT-172** — While the composer holds at least one attachment, the model selection surface SHALL either exclude models that do not announce image input, as REQ-PROVIDER-149 determines that, or present them as unselectable with that reason given; it SHALL NOT allow a silent selection that would discard the attachments. Where the selected model is changed to one without image input while attachments are held, the user SHALL be told that the attachments cannot be sent to that model, and the attachments SHALL NOT be discarded without the user's action.
- **REQ-CHAT-173** — An accepted attachment SHALL be stored under the owning session's directory and referenced from the transcript row and the session snapshot by a relative path and a content digest, never inlined as bytes into the snapshot. Re-opening a session SHALL re-project the user-prompt row with its attachments visible as thumbnails, each expandable to the stored image. Given a stored attachment that is missing or whose digest does not match, the row SHALL state that the image is no longer available rather than failing to render, and the rest of the transcript SHALL be unaffected.
- **REQ-CHAT-174** — Token estimation SHALL count attachments using the image token cost REQ-PROVIDER-150 fixes for the selected model, relying on that requirement for the cost's form, for how it is populated, and for how a declared rate and a declared fixed count are chosen between; a conversation's estimate SHALL change when an attachment is added or removed. Where that requirement yields no cost for the attachment, estimation SHALL treat it as an unknown non-zero cost and SHALL mark the estimate as a lower bound rather than reporting a figure that is knowably wrong.
