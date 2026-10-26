# Run Monitoring and Steering — 12. Elapsed time

Part 3 of 8 of [domain 02](../02-run-monitoring-steering.md), which indexes every part. Defines REQ-MONITOR-107 – REQ-MONITOR-175.

### 12. Elapsed time

**REQ-MONITOR-107** — Each agent's elapsed wall-clock time is measured from its spawn timestamp. While the agent is live the figure advances at least once per second on every visible surface that shows it (REQ-MONITOR-110, REQ-MONITOR-111); once the agent is terminal the figure is fixed at the difference between its completion and spawn timestamps and never changes again.

> **Narrowed by [`PD-ORCH-005`](../../product/directives/pd-orch-005.md#pd-orch-005) revision 6, 2026-10-06.** Clause 33: the
> figure of an agent not ended whose presentation state is running, waiting or queued advances; a `paused` agent
> shows none.

**REQ-MONITOR-108** — Live elapsed clocks — on the verification row and header, on reasoning rows, and on running tool rows — advance from a recorded start timestamp on each display tick. A tick must not alter the recorded row, must not write session state, and must not cause a transcript publication: a session whose only activity is clocks ticking produces no new persisted data and no update traffic.

**REQ-MONITOR-109** — A reasoning row shows elapsed seconds and an approximate token figure obtained by dividing every reasoning character received by the configured characters-per-token ratio (default 4, REQ-MONITOR-080), including characters the row does not display. When the reasoning burst ends, a final duration is stamped on the row and both figures stop changing. A reasoning row is collapsed by default to a fixed height of 6 text lines showing the most recently received reasoning text, so a live row scrolls with the stream rather than growing without bound, and it carries an expand control that reveals every character received; expanding is display-only and changes neither figure. The elapsed and token figures are computed over all characters received whether or not the row displays them, so collapsing and expanding never change either number.

**REQ-MONITOR-110** — A one-second repaint tick (REQ-MONITOR-287) runs exactly while a visible surface displays at least one live reasoning row, one running tool row, or one live per-agent elapsed clock (REQ-MONITOR-111). With none of those present, no repaint occurs and the surface performs no periodic work at all; a hidden surface never ticks (REQ-MONITOR-039, REQ-MONITOR-297).

**REQ-MONITOR-111** — Per-agent elapsed wall-clock time is shown, and advances live on the one-second tick of REQ-MONITOR-110 while the agent is live and the surface is visible, in all three places that hold a slot for it: the agent tree meta, the inspector meta, and the pop-out window's context card. The documented fallbacks apply only where the elapsed value is genuinely unknown — where no spawn timestamp was recorded — and in that case the tree falls back to the state value and the inspector and the pop-out card show an em-dash. A surface that has a spawn timestamp and shows a fallback, or that shows a frozen figure for a live agent, is a defect.

> **Narrowed by [`PD-ORCH-005`](../../product/directives/pd-orch-005.md#pd-orch-005) revision 6, 2026-10-06.** Clause 33: a
> `paused` agent shows its state or the fallback in place of a figure, though it has a spawn timestamp.

**REQ-MONITOR-112** — The overview header shows the session duration alongside the session name and status.

### 13. Current-activity display and stall visibility

**REQ-MONITOR-113** — The run-level activity line reads: while a verification suite is running, the check name with its position (index of total); while running, a coordinating-run message; otherwise the raw execution status.

**REQ-MONITOR-114** — The run header's root state maps as: running→running; paused→waiting; failed→failed; completed→done; anything else→queued.

**REQ-MONITOR-115** — A per-agent activity line is replaced with a statement that the agent ended with the run when it was settled by session reconciliation, and with a statement that it was cancelled by the user on an optimistic cancel.

**REQ-MONITOR-116** — The overview's active-now card lists live and waiting agents, one row each, and each row carries a state dot, the agent's name, its role from the vocabulary of REQ-ORCH-028, its activity text, the number of tool calls it has dispatched, and its elapsed wall-clock time (REQ-MONITOR-107). The card has an explicit empty state inviting the user to start or resume a run.

**REQ-MONITOR-117** — Each agent is evaluated for a stall on a fixed interval derived from the configured stall timeout: one sixth of that timeout, never shorter than 1 second and never longer than 5 seconds. With the default 90-second stall timeout, evaluations therefore occur every 5 seconds.

**REQ-MONITOR-118** — Given no model event or token for the stall timeout (default 90 seconds, overridable per persona) while tool calls are in flight, the watchdog logs an informational message naming the number of active tool calls and keeps waiting.

> **Narrowed by [`PD-MONITOR-005`](../../product/directives/pd-monitor-005.md#pd-monitor-005), 2026-10-06.** The silence counted is that of a
> model step the agent has in flight. Between its turns (a wait on its own children) the agent is outside the watch and
> nothing is logged; through a retry backoff, a suspended wait on a provider limit or a compression's own model call the
> line names that wait instead of a number of active tool calls. Every other clause is as stated above.

**REQ-MONITOR-119** — Given the same silence with no tool call in flight, every stall evaluation must do three things: log a warning saying the agent appears stalled and that the run is still waiting on it; emit a diagnostic issue of kind `stall` at warning severity carrying the agent's active tools, its recent tool calls, and the type of the last model event received; and invoke the host's stall callback. The callback fires on every evaluation, at the interval of REQ-MONITOR-117, so a host countdown advances at that rate. How often the warning itself may repeat is bounded by REQ-MONITOR-120.

> **Narrowed by [`PD-MONITOR-005`](../../product/directives/pd-monitor-005.md#pd-monitor-005), 2026-10-06 (revision 2 the same day).** The
> silence is that of a model step the agent has in flight: between its turns, through a retry backoff or a suspended wait
> on a provider limit, and through a compression's own model call, an evaluation emits no warning and no `stall` issue and
> invokes the callback with not stalled. The provider library's own short retries inside one model step are still this
> silence. Revision 2: at an evaluation that finds this silence, the `stall` issue is emitted only when the evaluation also
> writes the warning — at stall entry, and then no more often than REQ-MONITOR-120 lets the warning repeat; the warning and
> the callback are as stated above. Every other clause is as stated above.

**REQ-MONITOR-120** — Repeat stall warnings are throttled: the gap between them is the stall timeout, or 30 seconds, whichever is longer. When activity resumes, recovery must be logged and notified.

**REQ-MONITOR-121** — The stall watchdog must never cancel an agent. The hard limit is a separate per-agent timeout (default 1200 seconds) that terminates the agent.

**REQ-MONITOR-122** — Each stall evaluation (REQ-MONITOR-117) is also an opportunity to inject pending steering, and a host's stall callback may refresh its agent snapshot; neither may block or fail the run.

### 14. Pause, cancel, and shutdown

**REQ-MONITOR-123** — Pause is graceful and applies to the whole run only: the run finishes its current step and then stops. A pause request naming any agent other than the run itself must be refused; there is no per-agent pause.
  > **Narrowed by [`PD-ORCH-005`](../../product/directives/pd-orch-005.md#pd-orch-005), 2026-09-27 (revision 2).** Pause still applies to the whole run only; in-flight tool calls finish, then every agent stops where it stands and is left `paused`, and continuing resumes it from there.

**REQ-MONITOR-124** — Given an accepted pause, the session status becomes `pausing` and a message states that the current step will finish first. Given a refused pause, an error message states that pause is unavailable because no active run exists.

**REQ-MONITOR-125** — While a run is paused, run controls state that the run must be continued before they can be used. A paused session persists with an interruption message and can be resumed from the composer.
  > **Extended by [`PD-ORCH-005`](../../product/directives/pd-orch-005.md#pd-orch-005) revision 4, 2026-09-28.** Clause 18: a
  > session a crash left, `interrupted` or in REQ-CHAT-008's recovery state, is also continued from the composer,
  > with the same count and "continue without them" as a paused one. This requirement still governs in full.

**REQ-MONITOR-126** — Cancelling a run requires confirmation stating that cancellation cannot be undone in this session, describing the impact as cancelling the active run and every active task agent, with an explicit confirm label.

**REQ-MONITOR-127** — On confirmation the session status is optimistically set to `cancelling` and a full cancellation is requested. Given a refusal, the status is restored to `running` and an error message states that the run is no longer cancellable.

**REQ-MONITOR-128** — Cancelling one agent requires confirmation naming that agent plus one line per live descendant that will also be cancelled. On confirmation, that agent together with each of its live descendants is optimistically shown as cancelled, with an activity line stating that the user cancelled them, and the cancellation is dispatched to the run. Given a refusal, the prior state is restored and an error message states that the agent is no longer cancellable.

> **Narrowed by [`PD-ORCH-005`](../../product/directives/pd-orch-005.md#pd-orch-005) revision 6, 2026-10-06.** Clauses 23, 24 and
> 35: the confirmation lists, and the optimistic display shows cancelled, every descendant the cancel ends, live
> and paused; a refusal by the store or by another process's lock states the engine's words instead of "no longer
> cancellable".

**REQ-MONITOR-129** — Cancelling a run must signal the run's graceful-stop path rather than aborting its execution, so the run still produces and reports a terminal result. A graceful stop that is not honored within 30 seconds is force-cancelled as a backstop.

**REQ-MONITOR-130** — Cancelling a run must leave identical observable state whichever surface asked for it (the run header, the mission view, an auxiliary window, or a background-run row) and however the run was started (REQ-MONITOR-299): the same persisted execution status, the same terminal run result (REQ-MONITOR-028), every non-terminal agent settled to `cancelled` (REQ-MONITOR-209, REQ-MONITOR-211), the session lock released (REQ-MONITOR-240), and queued follow-up prompts left in the same condition. No host may hold a resource another has released.
  > **Narrowed by [`PD-ORCH-005`](../../product/directives/pd-orch-005.md#pd-orch-005) revision 4, 2026-09-28.** Clause 15: the
  > cancelling of a run this requirement names is the explicit cancel (REQ-MONITOR-126), which still leaves
  > identical state from every surface. A stop, from any surface, leaves its agents `paused` (clause 3).

**REQ-MONITOR-131** — Application shutdown produces these effects, in this order, each of which an observer can check: every periodic activity the application still performs stops; the run is cancelled, with anything blocked on a human answer released first (REQ-MONITOR-012); queued follow-up jobs are cleared; and the process does not exit until the run has reported its terminal result and finished writing session state. A restart that is not a shutdown waits at most 5 seconds for the previous run to finish before proceeding. Shutdown carries a force-exit backstop of 30 seconds from the quit request, the same allowance as the cancellation grace of REQ-MONITOR-129 and composing with it exactly: the graceful stop is requested first, the 30-second grace force-cancels a run that has not honored it, and at the same instant the process force-exits if teardown has still not completed. A second quit request made while that allowance is running force-exits immediately (REQ-MONITOR-283). A force exit is the only case in which the ordered effects above may be left incomplete, and it must be reported as such on the next start. A launch of the application that arrives while that allowance is running is refused until the process has ended and is honoured afterwards, on the terms REQ-SHELL-169 fixes; this requirement holds no copy of them.

**REQ-MONITOR-132** — Given two active runs at quit time, the warning must name both in the plural and quitting must stop both.

### 15. Steering and queued prompts

**REQ-MONITOR-133** — Submitting a steering prompt requires a non-empty target agent id and non-empty content; either being empty is an error. A successful submission returns the new steering prompt's identifier in the control result's string value (REQ-MONITOR-005), and the prompt is pending until injected.

**REQ-MONITOR-134** — All pending steering prompts for an agent are delivered into its conversation as a message explicitly marked as a steering prompt, are marked injected exactly once, and are reported to the run so the run's repetition safeguards treat them as a new user instruction.

**REQ-MONITOR-135** — Injection happens both at the boundaries between an agent's conversation rounds and opportunistically from stall evaluations (REQ-MONITOR-117) while a conversation is running, so a steer lands at the agent's next step and typically within seconds even mid-run. Each successful injection refreshes the agent's last-activity timestamp.

**REQ-MONITOR-136** — Given a steering injection occurred, an agent that would otherwise have finished must instead take another round rather than terminating.

**REQ-MONITOR-137** — Steering is initiated from the inspector (which opens the persona window's steer card) or directly from that card. A refused steer (no run, empty text, or whitespace only) must report that steering is unavailable for this run. While the inspector is following an agent, steering targets the followed agent.

**REQ-MONITOR-138** — Steering addresses one live agent immediately; queueing addresses the run and is consumed at the next stop boundary as a queued-prompts todo phase.

**REQ-MONITOR-139** — Queued prompts are owned by a session: when several runs execute against one prompt store, a run may consume only those prompts queued for its own session.

**REQ-MONITOR-140** — During an active run the composer stays editable, its submit action is labeled as queueing, and queued messages are listed in a persistent scrollable panel where any of them can still be edited or removed until it is consumed. An edit or delete naming an unknown or already-consumed prompt is refused rather than erroring out.

**REQ-MONITOR-141** — Queued-prompt state reaches the panel of REQ-MONITOR-140 on the whole-session update that carries it (REQ-MONITOR-216) and never by re-reading persisted state on a timer (REQ-SESSION-071). Nothing outside this application adds a prompt to a session's queue, so there is nothing for a timed re-read to discover. Only the focused run's handle writes the visible queue.

### 16. Model and reasoning switching mid-run

**REQ-MONITOR-142** — A switch of the run's entry model, or of its entry reasoning level, applies from the next iteration onward; the iteration already in flight finishes on the previous setting. Each switch appends a system transcript row stating the new model or reasoning level and that it applies from the next iteration.
  > **Narrowed by [`PD-MONITOR-006`](../../product/directives/pd-monitor-006.md#pd-monitor-006), 2026-10-06.** A switch made from the run
  > header or the inspector applies from the next iteration for the rest of that run only, and its row says it applies for
  > the rest of this run, after the iteration in flight, and that the next run starts on the composer's choice — not
  > only that it applies from the next iteration. The iteration in flight finishes on the previous setting, as stated.

**REQ-MONITOR-143** — Given the run loop has already closed, a switch still records the override without announcing it, because no live loop remains to receive the announcement; the control must not error.

**REQ-MONITOR-144** — The run header's active-run model selector and active-run reasoning selector (low / medium / high) are enabled while a run is executing in state `running` or in state `waiting`, and changing either applies the corresponding switch immediately as a next-iteration change. They are enabled during `waiting` because changing the model is the documented way out of a provider quota wait (REQ-MONITOR-145, REQ-MONITOR-303); a switch made during a wait takes effect on the iteration that resumes it.

**REQ-MONITOR-145** — Mid-run model switching is the supported recovery lever for moving back to a primary model once its provider has been re-authenticated, in a run that has meanwhile been proceeding on a fallback.

**REQ-MONITOR-146** — Composer-side model, persona, and reasoning choices apply to the next prompt, not to the running iteration, and are locked while a run is busy.

**REQ-MONITOR-147** — Given the first authentication failure of a run and a configured fallback model distinct from the current one, the run automatically retries on the fallback. Subsequent authentication failures raise a recovery dialog offering retry-with-a-different-model and re-authenticate-and-retry; choosing a model sets it and restarts the run.

**REQ-MONITOR-148** — Reasoning vocabularies differ by scope and must be presented accordingly: the run header offers low / medium / high; model slots offer provider default, auto, low, medium, high, and max where the provider supports it; persona reasoning offers provider default plus the supported levels.

**REQ-MONITOR-149** — Persona-scope reasoning and model edits persist to either the workspace scope or the global scope with the origin displayed, can be unset back to inherited, and must never mutate the other scope.

### 17. Permission-mode switching mid-run

**REQ-MONITOR-150** — Unlike model and reasoning switches, a permission-mode change applies immediately: the next tool call the run makes is already evaluated against the new mode, with no wait for the next iteration.

**REQ-MONITOR-151** — By the moment a permission-mode change reports success, the change is already in force: no tool call the run issues after that point may be judged against the previous mode. The requested mode is resolved against the run's effective configuration, including any worktree adjustment, before it takes effect.

**REQ-MONITOR-152** — The permission-mode control remains enabled while other run controls are locked, because tightening the mode is exactly what a user wants while watching a run go wrong.

**REQ-MONITOR-153** — Each accepted change writes a system transcript row stating the new mode and that it applies from the next tool call. When personas hold stricter pins, the row appends a sentence naming those personas and stating that their pin is stricter than the chosen mode. When the engine downgraded the requested change, the row states the engine's own reason instead. The row must never claim more than what actually happened.

**REQ-MONITOR-154** — Permission presets are presented strictest-first (restricted, ask, autonomous) and are read from the backend's preset list, so a newly added preset appears without a host change.

### 18. Verification (check-suite) monitoring and skip

**REQ-MONITOR-155** — While a post-change check suite runs, the session carries verification state made up of: an active flag; the current check's name; its command; its index within the suite; the total number of checks; the check's start timestamp; and a deadline expressed in whole seconds. The state is written when the suite starts, replaced when each check starts, and removed when the suite ends. Absence of the state says only that nothing is being verified at this moment; no surface may render that absence as a finding that verification produced no result. The deadline is a duration in whole seconds measured from the recorded start timestamp, never an absolute point in time, so a persisted verification state stays meaningful after a resume, which cannot interpret an instant recorded by a clock it did not read. When the deadline elapses, the check in flight ends with outcome `timeout`, which maps to row status `failed` (REQ-MONITOR-106); the suite then continues with the next check, and the run is not stopped by the timeout alone.

**REQ-MONITOR-156** — A malformed or partial verification payload must degrade to idle, or to active-without-detail, rather than raising; a broken indicator must never prevent the run view from rendering.

**REQ-MONITOR-157** — The verification position is labeled as the check name followed by its position, for example `<check-name> (2/3)`.

**REQ-MONITOR-158** — The run header's verification strip shows a pulsing informational dot, a label naming the running check, and an elapsed time counting upward on a one-second display tick.

**REQ-MONITOR-159** — A skip action is shown while the suite is active and enabled only while a specific check is in flight, since in the gap between two checks there is nothing that could be skipped.

**REQ-MONITOR-160** — A skip ends only the check that was in flight at the instant the user asked for it. If that check has already finished when the request arrives, the request is refused (REQ-MONITOR-161) and no other check is affected: a user can never skip a check they did not see running.

**REQ-MONITOR-161** — A skip request while nothing is verifying is a safe no-op returning a refusal, so hosts may wire an always-present control.

**REQ-MONITOR-162** — Verification being in progress must not change what any run control does; pause, cancel, steer, and mode changes behave identically during verification.

**REQ-MONITOR-163** — A gate warning (describing the absence of a quality gate) persists across the verification suite lifecycle. Given an idle verifier and a gate warning, the surface shows an amber dot with a message stating that no quality gate ran, so the run produced no verification evidence, and the engine's wording carried in a tooltip. That wording is taken from the run result and never authored by the host.

### 19. Overview dashboard

**REQ-MONITOR-164** — The overview shows a header with the view title and a session label of the form `session {name} · {status} · {runtime}`, or a statement that no session is active, plus actions to list sessions and to start a new session. Both actions remain enabled during a run, because a new session starts alongside it.

**REQ-MONITOR-165** — The overview body is a user-resizable two-column layout whose split is persisted; the right column defaults to 340 px with a 260 px minimum and 560 px maximum, and the left column has a 320 px minimum. The metric card grid reflows from four columns to two below a 1080 px viewport width. An onboarding empty state is shown when there is nothing to display.

**REQ-MONITOR-166** — The cumulative-tokens card shows the total token count with thousands separators and a `tok` suffix, a sparkline of token history, and a sub-line showing a pre-rendered cost label. The token history is sampled by the run, not by the card: the cumulative total is sampled every 10 seconds while the session's status claims a live run, and once more when the run reaches a terminal state, so a sparkline never depends on a view having been open. The most recent 120 samples are retained — 20 minutes of a run at that cadence — the oldest being discarded as newer ones arrive, and they are persisted with the session so the sparkline is the same when the session is reopened (REQ-MONITOR-242). Fewer than two samples renders as an explicit empty sparkline rather than a flat line. The cost label carries its own qualifier distinguishing an unknown price, an incomplete price, and a price derived from configured rates, so that no view has to invent its own description for a run whose price could not be established.

> **Narrowed by [`PD-MONITOR-001`](../../product/directives/pd-monitor-001.md#pd-monitor-001), 2026-09-16.** The card, the
> sampling, the retention and the empty sparkline are untouched. The closed three — an unknown price, an
> incomplete price, a price derived from configured rates — gain a **fourth** member, `reported`, for a
> figure the provider computed and the product only carried. The reason the set could stay at three was
> that every route to a figure ran through a rate; a provider-reported cost runs through none.
>
> **Revision 2, 2026-09-23.** All four qualifiers now have a producer. A request the provider did not price
> is priced from the model's configured rates where both are set; `incomplete` marks a total some requests
> could not contribute to, and `configured` a total at least one configured figure entered. The directive
> fixes each qualifier's label text.

**REQ-MONITOR-167** — The tool-calls card shows the session-wide tool-call total, a caption naming the number of agents it spans, and up to five per-tool chips of the form `{tool} {count}` sorted by count descending, aggregated from per-agent metrics.

**REQ-MONITOR-168** — The repository card shows commits ahead and behind with directional markers, the comparison base and current branch, and a line stating how many files were touched and how many changes are uncommitted.

**REQ-MONITOR-169** — The agents card shows the agent count, a caption of the form `depth {d} / {cap} · fan-out {n} / {limit}` against the configured delegation caps, and a monospaced detail line of running, waiting, done, and failed counts, where waiting includes queued agents and failed includes cancelled and blocked agents.

> **Narrowed by [`PD-ORCH-005`](../../product/directives/pd-orch-005.md#pd-orch-005) revision 6, 2026-10-06.** Clause 23: while
> an agent is paused, the line names that count between waiting and done (`running 1 · waiting 0 · paused 2 · done
> 1 · failed 0`). Otherwise it reads as stated.

**REQ-MONITOR-170** — The cumulative token figure uses the aggregate total when available and otherwise falls back to the sum of prompt and completion tokens from the raw usage record.

**REQ-MONITOR-171** — The sessions card lists sessions as a run switcher; each row carries a status dot (attached uses the run color, background uses the informational color, other busy states pulse in the run color, failed uses the failure color, otherwise idle), a session-name link with a tooltip carrying the session identifier and any requirement attribution, a requirement tag only when a requirement id exists, a focused marker, a detail caption, a continue-run link shown only when the session is not busy, the branch, a token label, and a duration label. Its empty state explains that finished and suspended runs will be listed there once they exist.

**REQ-MONITOR-172** — A session started by a person and not tied to a requirement must show no requirement tag at all; an empty tag would look like a requirement whose identifier could not be loaded.

**REQ-MONITOR-173** — The overview's right column shows, in order: the cloud-credit tile first (the balance determines whether provider quotas are reachable at all); the subscription-limits card; an agent-tree card with a link to the mission view; and an improvement-proposals card with a tag counting proposals pending review, a link into the library, and per-proposal rows carrying a summary link, status tag, category caption, and approve/reject/defer actions excluding the proposal's current status.

  > **Extended by [`PD-LIBRARY-002`](../../product/directives/pd-library-002.md#pd-library-002), 2026-09-17.** The
  > card's rows may also carry retrospective proposals — they are improvement proposals in the same
  > store, reviewed by the same actions, and the card distinguishes them from per-run ones by the
  > artifact that holds them rather than by a second card or a second vocabulary. The card's own
  > contract above is unchanged. The card's header also carries the retrospective's start gesture beside its
  > library link (ADR-0065 decision 7); sentence added 2026-10-07 ([OQ-222](../../architecture/open-questions.md)).

**REQ-MONITOR-174** — The overview refreshes in response to state-change notifications (agents, sessions, status, repository, proposals, settings) and performs no work while hidden; the session runtime and status in its header follow status changes.

**REQ-MONITOR-175** — A session's awaiting-input flag must be recorded in its externally readable metadata as true when it has pending approvals or pending questions, so that every session list reveals a background run that is waiting on a human answer. The rendered attention text is a single fixed sentence stating that the run cannot proceed until the person answers.
