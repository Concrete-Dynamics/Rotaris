---
reference: ROTARIS-CRW-001
domain: run-monitoring-steering
date: 2026-08-29
status: approved (Specification Gate closed 2026-08-31; amendments land as dated rounds in resolutions/)
---

# Run Monitoring and Steering

## Overview

While a task run is executing, a user must be able to watch what every agent is doing and change what the run does without stopping it. Observable surfaces show run state, the delegation tree of agents, each agent's context-window pressure, tool activity, elapsed times, verification progress, provider quota and credit standing, and queued follow-up work; observable controls let a person steer a live agent, queue follow-ups, switch the run's model, reasoning level or permission mode, force context compression, skip a verification check, pause, or cancel. Every control either takes effect with stated timing or refuses with a visible reason, every displayed state matches what a later resume of the same session would restore, and no view failure, slow consumer, or unreadable snapshot may change or stall the run itself.

---

## Requirements

### 1. Run lifecycle and host parity

- **REQ-MONITOR-001** — *Withdrawn.* Its only subject was parity between a graphical launch and a command-line launch, and the product has no command line; the execution-venue parity that a user can still observe is carried by REQ-MONITOR-299.

**REQ-MONITOR-002** — Each supported way of starting a run — a prompt-driven run, a requirement-driven run, and a worktree-integration run — must emit every lifecycle event kind of REQ-MONITOR-198 that applies to how that run ended. Driven to the same outcome, any two start paths must yield the same ordered sequence of event kinds; a start path that omits a kind another path emits is a defect.

**REQ-MONITOR-003** — A lifecycle rule belongs to the run, not to a host. Throughout this document a *host* is any surface of the application that drives or observes a run: the main window, and an auxiliary or pop-out window. Every host belongs to the one running instance of the application, and no host observes a run by any means other than the publication channels of REQ-MONITOR-214 and REQ-MONITOR-216 (§ 26). For one task driven to one outcome, every host must expose the same lifecycle event kinds, in the same order, carrying the same per-event content. A rule that can be observed on one host and not on another is a defect, whichever host is missing it.

**REQ-MONITOR-299** — A run's observable outcome must not depend on how it was started or on what is watching it. Given one task description, when it is run once in the foreground of the focused window and once with nothing watching it — sent to the background, placed in a worktree, or left running after its window was closed — then the two runs leave the same kinds of durable record (§ Data & Formats), emit the same lifecycle event kinds in the same order (the eight kinds of REQ-MONITOR-198), settle on the same persisted execution status, and produce the same terminal run result (REQ-MONITOR-028). A conformance test compares the two event sequences kind by kind and the two persisted records kind by kind. It compares record *kinds*, not directory entries: what a run leaves behind is a record in the durable store the sessions domain fixes (REQ-SESSION-001, REQ-SESSION-198) together with the closed set of files that domain still keeps (REQ-SESSION-002), and an unwatched run must produce every one of those kinds that a watched run produces, with none missing and none extra.

### 2. Control surface and refusal semantics

**REQ-MONITOR-004** — A host must be able to ask a live run to perform exactly the following operations, and no others: resolve an approval request with a chosen option; answer a pending question set; cancel a pending question set; steer a named agent with text; queue a follow-up prompt for the current run; edit a queued prompt; delete a queued prompt; edit a todo item (add/update/remove semantics with a target id and text); switch the run's entry model; switch the run's entry reasoning level; set the permission mode; force context compression; clear the transcript; cancel a single agent; skip the verification check currently in flight; pause; cancel the run; announce host shutdown; send keystrokes to a terminal stream; resize a terminal stream; interrupt a terminal stream; kill a terminal stream.

**REQ-MONITOR-005** — Every control request must return a result carrying a boolean outcome and an optional string value. The string value is populated for exactly the two operations that create a prompt record — queued-prompt creation and steering-prompt submission — and in each case it carries the new prompt's identifier (REQ-MONITOR-133). For every other operation the string value is absent, and it is never populated on a `false` outcome.

**REQ-MONITOR-006** — A `false` outcome states that the requested operation did not happen: the run has ended, the request timed out, or the named target does not exist. On `false`, the requesting surface must (a) display feedback naming the refusal, and (b) leave the user-visible state exactly as it was before the request, rolling back any optimistic change it had already applied (REQ-MONITOR-296). Showing the operation as successful, or producing no feedback at all, is not acceptable.

**REQ-MONITOR-007** — When a run is no longer in a position to honor a request, the control must answer `false` rather than raise or crash; requests issued concurrently from multiple threads must all be handled safely.

**REQ-MONITOR-008** — Given a control request whose required argument is empty (agent id, text, model key, reasoning level, mode, or prompt id), the request must be refused before it reaches the run.

**REQ-MONITOR-009** — Given a request to cancel the agent using the reserved identifier that denotes the run itself, the request must be treated as a full run cancellation.

**REQ-MONITOR-010** — Given an approval resolution naming an option that is not a recognized approval option, the request must be refused.

**REQ-MONITOR-011** — Given no live run (the run has finished or was never started), every control request must be refused rather than queued or silently dropped.

**REQ-MONITOR-012** — Cancellation must first release anything blocked on a person — pending questions, then pending approvals — and only then stop the run, so that teardown never happens while the run is still parked on an answer that will never arrive.

**REQ-MONITOR-013** — A run does not execute inside the window that displays it: the surface issuing a control and the part of the application that executes the run are separate processes of the one running instance. That, and only that, is the boundary this requirement means. It is never a boundary between two instances of the application, because only one instance ever runs, and it is never a boundary to a run this application does not own, because no such run exists (REQ-MONITOR-243). Every operation of REQ-MONITOR-004 must be issuable across that boundary, with the same arguments, the same result shape, and the same acceptance and refusal semantics as if the surface and the run sat in one process. Control arguments are therefore limited to text, numbers, booleans, and simple collections of those, so that a request survives the boundary without losing meaning.

### 3. Agent (child task) lifecycle

**REQ-MONITOR-014** — A delegated agent occupies exactly one of these states at a time: `queued`, `starting`, `running`, `summarizing`, `waiting_on_dependencies`, `waiting_on_model_slot`, `succeeded`, `failed`, `cancelled`, `blocked`. `succeeded`, `failed`, `cancelled`, and `blocked` are terminal; the remaining six are not. `summarizing` is a state of the agent itself and not a display decoration: it is counted by the per-model cap (REQ-MONITOR-020) and mapped like any other engine state (REQ-MONITOR-046).
  > **Narrowed by [`PD-ORCH-005`](../product/directives.md#pd-orch-005) revision 4, 2026-09-28.** The list gains one
  > non-terminal state, `paused`, which a run leaves an unfinished agent in when it comes to rest (clauses 2 and 3)
  > and which it leaves when it resumes. The ten states and the four terminal ones are otherwise as stated.

**REQ-MONITOR-015** — An agent counts against the concurrent-agent budget only when it is neither terminal nor waiting for a model slot; an agent parked for a model slot must not consume the active-agent allowance.

**REQ-MONITOR-016** — An agent reaches a new state only through a transition the legal-transition table permits. An attempt to move an agent into a state not reachable from its current one must be rejected with an error whose text names the state the agent is in and the state that was asked for, and must leave the record untouched: same state, no completion timestamp, and no state-change event delivered to any surface. The legal-transition table is REQ-MONITOR-300.

**REQ-MONITOR-017** — When an agent enters any terminal state, a completion timestamp in UTC must be stamped on its record and be visible to monitoring surfaces.

**REQ-MONITOR-018** — An agent that has finished its work but has not yet published its closing report occupies `summarizing` until the report exists, and then moves to a terminal state. An agent that has already published an authored artifact goes from `running` directly to its terminal state and never enters `summarizing`. To a user, an agent in `summarizing` reads as still running (REQ-MONITOR-046).

**REQ-MONITOR-019** — An agent in `waiting_on_dependencies` moves to `queued` once every one of its declared dependencies has ended in `succeeded`; a single dependency succeeding while others are outstanding does not release it. It moves to `blocked` as soon as any one of its dependencies ends in `failed`, `cancelled`, or `blocked`, without waiting for the remaining dependencies to settle. Both are legal transitions for the purposes of REQ-MONITOR-016.

**REQ-MONITOR-020** — Given a delegation targeting a model already at its per-model parallelism cap, the agent must be enqueued into `waiting_on_model_slot` rather than rejected. Once another agent using that model finishes, whatever its terminal state, the freed slot must promote exactly one waiting agent to `queued` for the next scheduling cycle. Only running and summarizing agents count against the per-model cap.

> **Narrowed by [`PD-ORCH-005`](../product/directives.md#pd-orch-005) revision 6, 2026-10-06.** Clause 39: a child
> `paused` out of `starting`, `running` or `summarizing` keeps its slot while its session rests, and the slot
> freed in one session is offered to the other sessions first, then to its own.

**REQ-MONITOR-021** — Per-model parallelism is unbounded unless a cap applies to that model. Whether a provider's quota is consumed by concurrent calls against a single account is a declared property of that provider's catalogue entry, not a list of provider names held in this document: every model of a provider that declares it carries an automatic cap of 2 concurrent calls, applied without the user configuring anything, so that concurrency alone cannot exhaust a shared quota; every model of a provider that does not declare it is uncapped. A cap the user configures for a model replaces the automatic one entirely, whether it raises it, lowers it, or removes it. Adding a provider that declares the property therefore caps its models with no amendment here, and the cap in force for a model must be inspectable so a user can see why an agent is parked in `waiting_on_model_slot`.

> **Narrowed by [`PD-PROVIDER-001`](../product/directives.md#pd-provider-001), 2026-10-06.** A provider's
> shared-quota property is a number its catalogue entry declares — the cap its models carry, `deepseek` 3 and
> `claude-code` 2 as REQ-CONFIG-095 states them — in place of the uniform 2 above. A user's cap still replaces it,
> and the cap in force is still inspectable.

**REQ-MONITOR-022** — Every agent's persisted record must expose, to monitoring surfaces, at least: display name, canonical name, persona, task description, dependency list, inherited context, state, spawn timestamp, completion timestamp, parent agent id, depth (default 1), conversation id, category, session id, background flag, task id, launch generation, produced artifact ids, received artifact ids, the resolved model key recorded at spawn (absent for synthetic agents), the native tools actually granted after policy narrowing, the granted MCP tools listed under their owning server, and the agent's live todo list.

**REQ-MONITOR-023** — When a background agent reaches a terminal state, a completion notification must be emitted carrying its task id, canonical name, description, terminal state, duration in seconds, the number of background agents still running, and the ids of artifacts it produced.

**REQ-MONITOR-300** — The legal-transition table judged by REQ-MONITOR-016 is exactly this, and nothing outside it is legal. An agent is created in `waiting_on_dependencies` when it declares dependencies, in `waiting_on_model_slot` when its model is already at its per-model cap (REQ-MONITOR-020), and in `queued` otherwise. From `waiting_on_dependencies`: to `queued` when every dependency has ended in `succeeded`, and to `blocked` as soon as any dependency ends in `failed`, `cancelled`, or `blocked` (REQ-MONITOR-019). From `queued`: to `starting`; to `waiting_on_model_slot` when the cap is reached at scheduling time; and to `blocked` as soon as any dependency it declared ends in `failed`, `cancelled`, or `blocked` (REQ-ORCH-048). From `waiting_on_model_slot`: to `queued` when a slot frees (REQ-MONITOR-020), and to `blocked` on that same dependency condition (REQ-ORCH-048). From `starting`: to `running`, and to `failed`. From `running`: to `summarizing`; to `succeeded` directly, and only where the agent has already published an authored artifact (REQ-MONITOR-018); and to `failed`. From `summarizing`: to `succeeded` and to `failed`. No transition leaves a terminal state, so `succeeded`, `failed`, `cancelled`, and `blocked` are absorbing. `blocked` is reachable from exactly three states — `waiting_on_dependencies`, `queued`, and `waiting_on_model_slot` — and from no other. The condition is the same in all three, and admitting it from all three is deliberate: the dependency-failure cascade of REQ-ORCH-048 must be able to settle a dependent wherever it stands before it has started, with no source state left for which the move it demands would be illegal. A dependent that has already reached `starting`, `running`, or `summarizing` is not blocked by that cascade and runs on. Two settling paths are legal from every non-terminal state in addition to the above and are the only way a state may be reached that this table does not otherwise allow: cancellation settles any non-terminal agent to `cancelled` (REQ-MONITOR-209), and run reconciliation settles any non-terminal agent to the terminal state the run's own outcome dictates (REQ-MONITOR-211). Every settling transition stamps a completion timestamp exactly as an ordinary terminal transition does (REQ-MONITOR-017). This requirement, over the state set of REQ-MONITOR-014, is the product's single definition of the delegated-child state machine: a document that needs to name a child's state, its terminal subset, or a move between states cites this identifier rather than restating any part of the machine — the state set and its terminal subset, the transition table and the rejection of a move outside it, the legality of the dependency-failure cascade into `blocked`, and the `from_state`/`to_state` pair a child-transition event carries alike. The budget accounting of REQ-MONITOR-015 and REQ-MONITOR-020 is cited the same way. A state or a transition needed by another domain is added here rather than described there.
  > **Narrowed by [`PD-ORCH-005`](../product/directives.md#pd-orch-005), 2026-09-27 (revision 2).** The table gains one state, `paused`: every non-terminal state may move to it when the run comes to rest by a pause, a stop, a quit or a crash, and it moves back to the state it resumes into when the iteration resumes. Since revision 5 (2026-09-29, clause 22), a settled child that its parent follows up by `session_id` also leaves its terminal state for the state it resumes into; no other transition leaves a terminal state.

### 4. Run-level status and terminal result

**REQ-MONITOR-024** — The persisted execution-status vocabulary this domain observes is fixed by REQ-SESSION-073, and which of its values claim a live run is fixed by REQ-SESSION-055. This domain restates neither, persists no status of its own, and adds no value to that vocabulary. What it relies on is that `waiting` is one of the values that claims a live run: a run parked on a provider quota wait has agents that are still alive and must remain visible as such (REQ-MONITOR-195, REQ-MONITOR-291), and such a run must therefore not be reconciled to a terminal outcome (REQ-MONITOR-211).

**REQ-MONITOR-025** — The user-facing run state is the normalised presentation vocabulary of REQ-NOTIFY-048; a persisted or backend status reaches the screen only through the normalisation of REQ-NOTIFY-049, and whether a run is busy is the test of REQ-NOTIFY-050. This domain restates none of the three, defines no presentation state of its own, and never renders a raw persisted status string. What it relies on is that a run parked on a provider quota wait presents distinctly from one that is simply running and from one that is idle: that presentation is REQ-NOTIFY-263, and what this domain contributes to it is the persisted wait state of REQ-MONITOR-195 and the decision surface of REQ-MONITOR-303. A session claiming a live run that this application is not executing is separately marked as needing recovery (REQ-MONITOR-027).

**REQ-MONITOR-026** — The run header carries one label per member of the presentation vocabulary of REQ-NOTIFY-048, no two members may share a label, and every label is non-empty; what each label must convey about the state it names is fixed by REQ-NOTIFY-049 and is not restated here. The wording of every label is the implementation's. This domain adds exactly one obligation to that header: while a run is parked on a provider quota wait, the header must also convey that the run is waiting on a provider limit and what it is waiting for, and must keep the decision surface of REQ-MONITOR-303 reachable from there (REQ-NOTIFY-263).

**REQ-MONITOR-027** — Given a known session that claims a busy status but that this application is not executing, the header must instead state that the run needs recovery. There is no third reading of such a session: no other process can be executing it, so it is the residue of a crash or a force quit and is stale (REQ-MONITOR-207). Once the repair of REQ-MONITOR-209 has settled it, it is an ordinary session that is not running, and it is opened from its persisted record and continued like any other (REQ-SESSION-196).

**REQ-MONITOR-028** — A run's machine-facing terminal result is one member of the closed terminal run-result set of REQ-ORCH-083; this domain holds no copy of that set and mints no result string of its own. What it relies on that requirement for is that the set is closed, that its members are distinguishable from one another, and that `max_iterations` covers any exhausted run budget rather than the iteration counter alone (REQ-MONITOR-301). The obligations this domain adds are: the members are kept distinct from one another wherever a terminal result is recorded, published, or presented; in particular `failed` and `error` must never be collapsed into one, because a reported failure and an undetermined outcome invite different recovery. A value outside the set must raise rather than be presented as a guessed result. Deriving the terminal result in the first place must always succeed and never raise (REQ-MONITOR-031, REQ-MONITOR-032). The product exposes no process exit code, and no requirement of this domain is satisfied by one.

**REQ-MONITOR-029** — The terminal result maps into the persisted execution-status vocabulary of REQ-SESSION-073 as: `interrupted`→`paused`; `failed` or `error`→`failed`; `max_iterations`→`stopped`; otherwise `completed`. A run that exhausted a configured budget therefore persists `stopped` and not a status of its own: the status and the stop reason are different axes, and which budget ran out is carried on the stop-reason axis by the token REQ-MONITOR-301 fixes for it (`iteration_limit_reached` or `time_limit_reached`), never by the persisted status. This domain persists no status outside the closed vocabulary REQ-SESSION-073 fixes.

**REQ-MONITOR-030** — Every stop reason a run can record falls into exactly one of four classes, which determine the terminal result: a stop the run completed of its own accord yields `completed`; a stop attributable to a person — cancellation asked for mid-run, the choice to stop when the message-count limit was reached, or a request to quit the application — yields `interrupted`; a configured run budget being exhausted yields `max_iterations`; and a stop caused by the work itself — an aborted agent session, or the repetition circuit breaker tripping — yields `failed`, whatever proportion of the work had already completed. The canonical set of stop-reason values, and each value's class, are fixed by REQ-MONITOR-301.

**REQ-MONITOR-031** — Given a run with no progress record, the terminal result is derived from the session's persisted execution status by the single mapping of REQ-SESSION-076, and by no other. This domain holds no copy of that mapping and states no second one; where the two ever appeared to differ, REQ-SESSION-076 is the one that governs. What this domain relies on that requirement for is that the mapping is total over the closed vocabulary of REQ-SESSION-073, that every status it does not carry to a definite outcome yields `error` with wording stating that the outcome is unknown, and that a run is therefore never silently reported as completed.

**REQ-MONITOR-032** — Terminal-result construction must never raise; every input, including malformed or missing records, must yield a result object.

**REQ-MONITOR-033** — Given a run that fails before it reports having started (for example a refused sandbox or an unobtainable session lock), the failure must be reported immediately without waiting for a final session snapshot that does not exist. Such a diagnostic carries an explicit failed-before-start marker as a field of its own rather than as a prefix on its text, so that a surface can tell a pre-start failure from a run failure without parsing the message; the marker is what REQ-MONITOR-204 and REQ-MONITOR-264 refer to.

**REQ-MONITOR-034** — The run's iteration loop stops as soon as any of these holds: an external abort was requested; every non-abandoned task is complete; the iteration count reached the configured maximum (REQ-ORCH-070); the elapsed wall-clock time reached the configured maximum, which has no default and therefore imposes no limit unless one is configured; or no pending tasks remain. The two completion-based conditions do not stop the loop while queued prompts are still waiting to be consumed (REQ-MONITOR-035) or while the keep-going criterion of REQ-MONITOR-302 is configured and unmet. The budget-based conditions are never overridden: neither a queued prompt nor an unmet keep-going criterion may carry a run past its iteration maximum or its wall-clock maximum.

**REQ-MONITOR-035** — Queued prompts that override completion are injected as a new todo phase named for queued prompts, with one task per prompt, and each prompt is marked as triggered exactly once.

**REQ-MONITOR-301** — The set of stop reasons a run may record is closed, and every member is classified by REQ-MONITOR-030. The members are exactly: `tasks_complete` (every non-abandoned task finished); `no_pending_tasks` (nothing remained to do); `user_cancelled` (a person cancelled the run mid-run); `application_shutdown` (the application was asked to quit while the run was executing, REQ-MONITOR-131); `message_limit_reached` (the message-count limit was reached and the person chose to stop); `iteration_limit_reached`; `time_limit_reached` (the configured wall-clock maximum was reached); `repetition_detected` (the repetition circuit breaker tripped, REQ-MONITOR-289); and `agent_session_aborted` (the agent session ended without completing its work, an escaped error included). Each maps to a terminal result (REQ-MONITOR-028) as: `tasks_complete` and `no_pending_tasks`→`completed`; `user_cancelled`, `application_shutdown`, and `message_limit_reached`→`interrupted`; `iteration_limit_reached` and `time_limit_reached`→`max_iterations`; `repetition_detected` and `agent_session_aborted`→`failed`. The mapping is total over the set, and a stop reason outside the set is a defect rather than a value to be classified by a fallback. Because `time_limit_reached` maps to it, `max_iterations` means "a configured run budget was exhausted" and not solely "the iteration counter ran out"; every surface that explains that result must say which budget it was.

**REQ-MONITOR-302** — The keep-going criterion is a single configured boolean, off by default, that ties run completion to verification evidence rather than to the coordinator's judgement alone. Given it is on, when a completion-based stop condition of REQ-MONITOR-034 is reached and the most recent verification suite recorded for the run holds at least one check whose outcome is `failed` or `timeout` (REQ-MONITOR-106), then the loop does not stop; instead a todo phase is injected naming each such check, exactly as queued prompts are injected (REQ-MONITOR-035), and the run continues. The criterion is evaluated only at a stop boundary, never mid-iteration; it is met when no such check remains, and it is treated as met when no verification suite has run at all, because a run with no evidence to contradict has nothing for this criterion to hold open. It never overrides a budget-based stop condition, never overrides an abort, and never re-injects a phase for a check it has already injected once in the same run. It is settable by the user in settings and per run; nothing else configures it.

### 5. Delegation tree presentation

**REQ-MONITOR-036** — The agent tree is a depth-first list of rows, each carrying the agent, a box-drawing prefix, and a depth. Prefixes use `├─ ` and `└─ ` with `│  ` and three-space continuations; root rows have an empty prefix and depth 0.

**REQ-MONITOR-037** — An agent whose recorded parent is the run itself, or whose recorded parent id is unknown, must render as a root row rather than being dropped.

**REQ-MONITOR-038** — Several delegation-tree surfaces (workspace sidebar, overview dashboard, mission view) may be visible at the same time. Whenever more than one is visible, each must show the same agent set in the same states; no visible surface may trail another by more than the 250 ms visibility budget. A refresh of a tree holding the maximum supported agent count (20, REQ-MONITOR-285) must complete inside that same budget, and the time a refresh takes must not increase with how long the run has been going or with how many transcript rows the session holds.

**REQ-MONITOR-039** — A tree surface that is not visible must defer its refresh until it is shown, and must then catch up to current state.

**REQ-MONITOR-040** — Each tree row shows: the branch prefix in a monospaced face; a state-colored status dot that pulses while the agent is live; the persona display name (brighter while live); the agent's task name beneath it; and, where meta is enabled, a meta label showing elapsed time if known, otherwise the state value.
  > **Extended by [`PD-CONFIG-003`](../product/directives.md#pd-config-003) revision 3, 2026-10-07.** A row whose agent's stored report carries REQ-ORCH-088's
  > timeout error carries a "timed out" tag after its meta label.

**REQ-MONITOR-041** — A tree row's tooltip carries the first of these that exists: the agent's full delegation task, its current activity text, its name. Row content never changes the panel's width: a name that does not fit is elided with a visible truncation marker and remains readable in full through the tooltip.

**REQ-MONITOR-042** — Clicking a tree row selects that agent and notifies all surfaces of the selection; the selected row must be visually distinguished.

**REQ-MONITOR-043** — Rows for task agents put the persona first, with the task title on the line below. The run's synthetic root is neither rendered as a task agent nor selectable in the tree; run-level control lives in a dedicated run header instead.

**REQ-MONITOR-044** — Each agent as presented to views carries: id, name, persona, presentation state (running / waiting / queued / done / failed / cancelled), parent id, dependencies, activity text, model, reasoning level (default "medium"), context tokens used, context limit (the configured default context capacity of REQ-MONITOR-080 where the model's own capacity is unknown, per REQ-MONITOR-049), tool-call count, elapsed string, granted tools, granted MCP tools per server, previously called tool names, currently active tool names, artifacts (name, producer, ready flag), produced and received artifact ids, category, background flag, delegation task, delegation session id, and inherited context.
  > **Extended by [`PD-CONFIG-003`](../product/directives.md#pd-config-003) revision 3, 2026-10-07.** An agent as presented also carries whether its stored report
  > carries REQ-ORCH-088's timeout error: the limit it ran under and whether it was cut off while making progress
  > (PD-ORCH-004's statement), or nothing.

**REQ-MONITOR-045** — Context percentage is the used-tokens fraction of the limit, rounded to a whole percent, and is 0 when the limit is zero or negative. An agent is "live" exactly when its presentation state is running.

**REQ-MONITOR-046** — Engine agent states map to presentation states as: succeeded→done; running→running; summarizing→running; waiting_on_dependencies→waiting; waiting_on_model_slot→waiting; failed→failed; cancelled→cancelled; blocked→failed; anything else→queued.
  > **Narrowed by [`PD-ORCH-005`](../product/directives.md#pd-orch-005) revision 4, 2026-09-28.** Clause 13:
  > `paused` maps to a presentation state of its own, `paused`, and never to the catch-all `queued`. Every other
  > mapping is as stated.

**REQ-MONITOR-047** — An agent's activity text is its delegation task description truncated to the first 180 characters.

**REQ-MONITOR-048** — An agent's displayed model is the model recorded at spawn, or where none was recorded, the persona's configured model, and must always be rendered as a human-facing model name — never an internal synthetic configuration key. Reasoning level is the persona's configured thinking level, defaulting to "medium".

**REQ-MONITOR-049** — Context used is the agent's most recent recorded prompt-token reading; the context limit is the model's maximum input tokens, defaulting to the configured default context capacity (REQ-MONITOR-080) when the model's own maximum is unknown. Tool-call count and per-tool history come from the agent's recorded metrics; active tool names come from the live snapshot; the tool list is the granted tool set, and where no grant was recorded, the persona's declared tools stand in.

**REQ-MONITOR-304** — The delegation tree is fully operable from the keyboard, and every action it offers is reachable without a pointer (REQ-SHELL-022). Given tree focus, Up and Down move the selection through the tree's own depth-first row order (REQ-MONITOR-036) one row at a time, Left collapses a row that has children and otherwise moves to the row's parent, Right expands a collapsed row and otherwise moves to its first child, Home and End move to the first and last row, and moving the selection has exactly the effect clicking that row has (REQ-MONITOR-042). At a boundary — the first row, the last row, a root row's parent, a leaf's child — the key is a no-op and moves nothing. The tree claims no chord the application's action vocabulary already binds (REQ-SHELL-048, REQ-SHELL-049).

### 6. Per-agent inspector

**REQ-MONITOR-050** — The inspector groups agents by persona with one tab per configured persona; selecting an agent anywhere selects that persona's tab and shows that instance.

**REQ-MONITOR-051** — Below a viewport width of 1180 px, choosing an agent opens the inspector as an overlay drawer that is mutually exclusive with the agents/todos drawer. The workspace must remain usable down to 1000×680.

**REQ-MONITOR-052** — The inspector for an agent shows: a state-colored status dot that pulses while live; the agent name; a meta line of the form `{state} · {elapsed or em-dash} · {N} tool calls`; a context ring showing used against limit with the compression threshold marked; a caption naming it the context window and stating the compression threshold percentage; a model selector; a reasoning selector offering low / medium / high; a scope note; tool chips; artifact links; a cascade note; and Steer, Cancel, and Pop out actions.
  > **Extended by [`PD-CONFIG-003`](../product/directives.md#pd-config-003) revision 3, 2026-10-07.** Directly under the meta line, unchanged in form, the
  > inspector of an agent cut off at its per-agent timeout shows one line giving the limit and naming
  > Settings › Runtime › Per-agent timeout.

**REQ-MONITOR-053** — Given no agent is selected, the inspector must follow whichever known agent authored the latest transcript row, scanning backwards past user rows, intent rows, system rows, verifier rows, and rows with unknown authorship.

**REQ-MONITOR-054** — Following is display-only: the transcript scope remains "all activity", a visible tag states in words that the panel is tracking whichever agent wrote last, picking an agent pins the panel to it, and dropping the selection returns the panel to tracking.

**REQ-MONITOR-055** — Steer, Cancel, and Pop out always act on the agent currently shown (followed or pinned), and the cancel confirmation must name that agent, so that an agent the panel has since switched away from is never cancelled without the user seeing which one it was.

**REQ-MONITOR-056** — Given no transcript row can be attributed to a known agent, the inspector shows an empty state: em-dash name, a statement that no agent is selected, an idle dot, an empty context ring, and disabled controls.

**REQ-MONITOR-057** — Only the run-level model and reasoning controls are writable, only while a run is executing, and each carries a note stating that the change takes effect from the next iteration.

**REQ-MONITOR-058** — For a non-run-level or terminal agent, the model and reasoning controls are disabled and accompanied by a note stating that model and reasoning are set per persona and edited in persona settings.

**REQ-MONITOR-059** — Auxiliary agent windows present the model and the reasoning level as read-only readings, so a window reflects runtime state rather than claiming to change it.

**REQ-MONITOR-060** — The inspector's tools field shows the native tools the agent actually resolved, together with its granted MCP tools under one heading per server. Each chip is marked `active`, `used`, or `not used`, derived from live and historical tool-call records. Where the snapshot predates tool grants, or the persona has no live instance, the persona's declared tools stand in.

**REQ-MONITOR-061** — Given a running run-level agent whose policy withholds file-writing, terminal, and commit tools, the inspector must not list those tools.

**REQ-MONITOR-062** — When only the state of tool chips changes (`active` / `used` / `not used`), the chips shown and their order must not change; only the state marks change, and no chip may flicker, reorder, or lose focus. Updating a chip strip that carries an agent's whole granted tool set must complete inside the 250 ms visibility budget.

**REQ-MONITOR-063** — Steer is enabled exactly when the shown agent is running or waiting. Cancel is enabled exactly when the shown agent is running, waiting, or queued. Pop out is always enabled for a shown agent.
  > **Narrowed by [`PD-ORCH-005`](../product/directives.md#pd-orch-005) revision 4, 2026-09-28.** Clause 16: Cancel
  > is also enabled for a `paused` child of a session at rest, confirmed as REQ-MONITOR-128 requires. Steer and Pop
  > out are as stated.

**REQ-MONITOR-064** — When the shown agent has live (running, waiting, or queued) descendants, a cascade note states that cancelling cascades to that number of descendants; otherwise the note is empty.

> **Narrowed by [`PD-ORCH-005`](../product/directives.md#pd-orch-005) revision 6, 2026-10-06.** Clause 23: the
> cascade note counts every descendant the cancel ends, live and paused, and says which ("Cancelling cascades to 2
> live and paused descendants.").

**REQ-MONITOR-065** — The inspector's context meter must be labeled as one agent's own context window, never as a session-wide usage figure. An unknown or idle agent shows an empty ring (zero used against a nominal limit) with the threshold still marked.

**REQ-MONITOR-066** — Given an agent whose model has since disappeared from the catalog, the model selector must still name that model as its current value rather than showing a wrong or blank one.

**REQ-MONITOR-067** — Model pickers list models the provider currently withholds, annotated with the provider's reason, instead of dropping them from the list.

### 7. Per-persona agent windows

**REQ-MONITOR-068** — A pop-out window exists per persona, titled with the product name and the persona, sized 820×620 by default, with a header summarizing the number of instances, one tab per agent instance of that persona (tab tooltip `{state} · {activity}`), and a persona-wide artifacts card listing artifacts from all instances with an explicit empty state.

**REQ-MONITOR-069** — Each instance tab shows: status dot, agent name in the persona color, and state; an agent-scoped transcript card with an explicit empty state; a context card with a ring and a line of the form `{N} tool calls · {elapsed or hyphen}`; an instance-controls card with read-only model and reasoning values; a current-activity card rendering the activity text as Markdown with an explicit empty state; a tools-and-artifacts card listing available tools (the same resolved set the inspector shows), one line per MCP server, the currently active tools, and artifact links; and a steer card.
  > **Extended by [`PD-CONFIG-003`](../product/directives.md#pd-config-003) revision 3, 2026-10-07.** Directly under the state, the instance tab of an agent cut
  > off at its per-agent timeout shows the inspector's line, worded once.

**REQ-MONITOR-070** — The steer card offers a multi-line plain-text box whose placeholder invites the user to add context or redirect the agent, a primary send action, and a cancel action marked as destructive; both act on the agent shown in that tab. Sending while the box is empty or holds only whitespace issues no request and changes nothing. A send that is accepted clears the box; a send that is refused leaves the typed text in place so the user can retry it.

**REQ-MONITOR-071** — Pop-out transcripts are agent-scoped projections: each instance tab shows only its own agent's rows, and appending new transcript events refreshes an open window without introducing rows authored by other agents.

**REQ-MONITOR-072** — Clicking an agent opens it in the in-panel inspector by default. A persisted interface setting restores the alternative behavior of opening or raising the persona window on click. Explicit pop-out actions work regardless of that setting.

**REQ-MONITOR-073** — Closing a pop-out window retains it so reopening is immediate. A closed window performs no refresh work and catches up on being shown again.

### 8. Delegation context header

**REQ-MONITOR-074** — Selecting a child agent shows a collapsible header above its scoped transcript carrying the delegation parameters: task name, persona, category (quick / deep / planning / research), background mode, task description, dependencies, and inherited context.

**REQ-MONITOR-075** — The header is expanded by default for a newly selected agent; when collapsed it reduces to one line carrying task name and persona. Unset fields are omitted entirely. No header is shown for the entry agent at the root. Returning to the all-agents view hides it. The header's content survives a session reload, but its collapsed/expanded state does not persist.

### 9. Context-window monitoring and automatic compression

**REQ-MONITOR-076** — Given an agent whose accumulated context tokens have reached the effective threshold, when a new model call is about to be made, then compression runs first and the call uses the compressed context.

**REQ-MONITOR-077** — Given a model call that fails because the context window was exceeded, the system must be able to recover by compressing and retrying rather than failing the agent outright.

**REQ-MONITOR-078** — The effective threshold in tokens is the capacity multiplied by the threshold percentage divided by 100, where capacity is resolved in this priority order: (1) an explicit per-model compression threshold; (2) the smaller of the model's maximum input tokens and the configured default capacity; (3) the configured default capacity.

**REQ-MONITOR-079** — The threshold percentage is the primary interactive control and persists across application restarts. Switching models keeps the percentage and recomputes the token threshold against the new model's capacity.

**REQ-MONITOR-080** — Compression may be configured with a model of its own, independently of the models the run itself uses; where none is configured, compression uses the model the agent whose context is being compressed is itself using, which is by construction reachable, authenticated, and able to hold the context being compressed. Compression's defaults are: compression timeout 120 seconds; default context capacity 265,000 tokens; threshold percentage 60, accepted range 1..100 inclusive, with a value outside that range rejected rather than clamped; token estimation ratio 4 characters per token; and the 4 most recent conversation turns preserved uncompressed. This requirement is the single source of both figures: the default context capacity of 265,000 tokens is the capacity every surface uses for a model whose own maximum input tokens are unknown (REQ-MONITOR-044, REQ-MONITOR-049, REQ-MONITOR-078), and the threshold percentage of 60 is the value a fresh installation starts from and the value every threshold control and every threshold marking reads (REQ-MONITOR-079, REQ-MONITOR-087, REQ-MONITOR-286). No surface may hold a second default for either.
  > **Narrowed by [`PD-MONITOR-007`](../product/directives.md#pd-monitor-007), 2026-10-06.** A configured compression
  > model is followed through the session's override, and where the pair it reaches is held out of quota the pass uses the
  > model the agent is itself using, as where none is configured. The defaults and the figures are as stated.

**REQ-MONITOR-081** — The trigger's token count prefers the real last-prompt token count reported by the model provider; when the history has already been condensed, or no real count is available, the count is estimated from character length at the configured characters-per-token ratio. The chosen threshold and the source of the count must be recorded in diagnostics.

**REQ-MONITOR-082** — Three things survive compression character for character: the system prompt, the tool definitions, and the user's original request. None of the three is included in what is sent to the compressing model. Only the action history recorded after the original request is compressed, and the summary it produces must state the work performed, the findings reached, and the questions left open.

**REQ-MONITOR-083** — The 300-line bound applies to the generated compression summary alone and to nothing else. Nothing REQ-MONITOR-084 requires to be carried across — the system prompt, the tool definitions, the user's original request, the todo items, and the preserved recent turns — is counted against that bound or truncated to fit it, because each of those is required to survive character for character or one for one. A reconstructed context is therefore never bounded as a whole; only the summary the compressing model writes is.

**REQ-MONITOR-084** — After compression the agent's context holds exactly these parts, in exactly this order, and nothing else from the pre-compression history: (1) the system prompt and tool definitions; (2) the user's original request; (3) the compression summary; (4) the agent's todo items, carried across one for one; and (5) the configured number of most recent conversation turns, preserved verbatim and in their original relative order (REQ-MONITOR-080). The preserved recent turns come last, immediately before the next model call, so the conversation continues from where it actually left off rather than from a summary; the todos sit between the summary and those turns.

**REQ-MONITOR-085** — Compression must never block the user interface. While it runs, a status stating that compression is running must be visible, and the added latency must be recorded in diagnostics.

**REQ-MONITOR-086** — Each compression completion raises the compressing agent's compression count by exactly one. A completion already counted must never be counted a second time, including after the session is resumed or the recorded event stream is read again. The per-agent count belongs to the persisted per-agent metrics (REQ-MONITOR-102) and is displayed per agent (REQ-MONITOR-281); a run-wide count, equal to the sum of the per-agent counts, is readable at any time during and after the run.

**REQ-MONITOR-087** — Context meters must warn before the threshold: the fill turns to a warning color at 75% of the threshold and to a failure color at or above the threshold. The threshold position is drawn as a tick on the track, and the fill is notched at that tick once the threshold has been passed. When no threshold is supplied, meters assume the configured default threshold percentage of REQ-MONITOR-080; no surface holds a threshold default of its own.

**REQ-MONITOR-088** — The overview's context card has a header caption naming the compression threshold percentage and one row per agent that has used context or is live: state dot, fixed-width name, a bar filled to the agent's context percentage with the threshold marked, and a monospaced `used / limit` pair with thousands separators. An agent with zero used tokens shows an em-dash in place of the used figure. The card has an explicit empty state explaining that context use appears once agents begin working.

**REQ-MONITOR-089** — After every model turn the agent's latest prompt-token reading is recorded and persisted, and the run's synthetic root agent exposes the newest such reading so that root-level surfaces have a context figure to show. The recorded value is always the latest measurement and never a high-water mark: after a compression an agent's reading must fall, and every meter reading that agent's context must show the fall (REQ-MONITOR-049, REQ-MONITOR-088).

### 10. Manual compression

**REQ-MONITOR-090** — The run header offers a manual compress action described as compressing the context of every agent whose conversation is still live. It is enabled only while a run is executing in run state `running`; at any other time it stays visible but disabled, states as its reason that no run is active, and — if invoked anyway through a command or a keyboard path — reports that same reason instead of acting (REQ-MONITOR-271).

**REQ-MONITOR-091** — Given no agent conversations are currently active, when manual compression is requested, then it is refused and a message states that there is nothing to compress because no agent context is active.

**REQ-MONITOR-092** — Given at least one live agent conversation, manual compression compresses every one of them concurrently and reports only once all of them have settled. It reads neither the threshold percentage nor the computed token threshold — a manual request compresses however empty a context is — while the preserved-recent-turns count and the characters-per-token ratio apply exactly as they do to automatic compression (REQ-MONITOR-080).

**REQ-MONITOR-093** — While manual compression runs, the action is disabled and reads as in-progress, and a transient message states that active agent contexts are being compressed.

**REQ-MONITOR-094** — On completion the action is restored, and a message reports the number of agents whose context was compressed. Given partial failure, a persistent error notice titled for incomplete compression must list each failing agent with its reason, and the details must remain copyable.

- **REQ-MONITOR-095** — *Withdrawn.* Its only surface was a terminal-interface command, and the product has no terminal interface; the capability it described — compressing, concurrently, every non-terminal agent that still holds a live conversation, with a start message, a completion message, a no-agents warning, and a per-failure report — is carried by REQ-MONITOR-090 (run-header action), REQ-MONITOR-091 (no-agents refusal), REQ-MONITOR-093 (in-progress message), REQ-MONITOR-094 (completion and partial-failure reporting), and REQ-MONITOR-097 (command-palette entry).

**REQ-MONITOR-096** — Manual compression, however it is requested (REQ-MONITOR-090, REQ-MONITOR-097), must never read or mutate threshold configuration, persisted session state, or configuration files, and must be safe to request with no session active: it reports its refusal (REQ-MONITOR-090) rather than failing.

**REQ-MONITOR-097** — A `compress` command must also exist in the graphical application's command palette, available only while a run is executing; otherwise it is refused with a reason stating that no run is active.

### 11. Tool-call counting and history

**REQ-MONITOR-098** — Run-wide and per-agent totals are readable at any moment of a run and cover token totals, cost totals, per-tool-name call counts, compression counts, and the last prompt-token reading. Three properties must hold however many agents are updating them and however many surfaces are reading them: a run-wide total always equals the sum of the matching per-agent values; reading a total twice with no activity in between returns the same number; and a tool-call total never decreases within a run. Resuming a session restores every total to the value it held, and resetting a run's counters returns them all to zero.

**REQ-MONITOR-099** — Tool activity events update persisted global and per-agent counters immediately, so counts are visible during the run and not only at its end.

**REQ-MONITOR-100** — Given a replayed event carrying an agent and tool-call identifier already counted, the counters must not be inflated.

**REQ-MONITOR-101** — Each agent node exposes its live tool-call count and the set of tool names it has called; the synthetic root node exposes the aggregate run count and the aggregate called-tool history.

> **Narrowed by [`PD-MONITOR-003`](../product/directives.md#pd-monitor-003), 2026-10-06.** The run-level agent the
> inspector, the Mission view and the persona windows present carries its own tool-call count and called history (the
> roots'); the aggregate run count is the run's total of REQ-MONITOR-102, and no surface draws an aggregate called-tool
> history. Every other node is as stated above.

**REQ-MONITOR-102** — Per-agent metrics are persisted with the session and comprise: tool-call count, per-tool-name counts, token usage, cost, compression count, and last prompt tokens. A session-wide total tool-call count is also persisted, and a displayed total is the persisted value, carried to the surface on the whole-session update (REQ-MONITOR-216) rather than tallied by that surface for itself.

**REQ-MONITOR-103** — Tallying tool rows from a conversation transcript is idempotent: reading the same transcript again, whole or in part, must leave every tool-call total exactly as it was. A row may contribute to a total at most once, whatever a reader's position in the transcript.

**REQ-MONITOR-104** — Each agent's in-flight tool calls are tracked and surfaced as active chips. When an agent reaches a terminal state, or is settled by the run ending, its active chips must be cleared so a stale in-progress indicator cannot persist.

**REQ-MONITOR-105** — Tool rows in the transcript carry a machine-readable status of `running`, `ok`, `failed`, or `blocked`, plus a duration. A running tool renders as a pulsing in-progress row; a finished tool renders its outcome and elapsed inline (for example an `ok` outcome with a seconds figure). `blocked` covers every case in which no outcome was observed — the call was refused before it ran, or the run ended before it reported (REQ-MONITOR-228) — and a `blocked` row must convey which of those happened.

**REQ-MONITOR-106** — A verification row's status is the check outcome rendered through the mapping of REQ-NOTIFY-142, over the closed five-value check-outcome vocabulary of REQ-ORCH-123 and into the row-status vocabulary of REQ-MONITOR-105. This domain holds no copy of the vocabulary or of the mapping and states no second mapping of its own; what it relies on them for is that the mapping is total over all five outcomes, so no check outcome reaches a row without a status, and that a check which never ran — skipped or invalid — never renders as a passing row, because nothing was verified. Where this document names a check outcome, as REQ-MONITOR-302 does, it names a member of REQ-ORCH-123's set.

### 12. Elapsed time

**REQ-MONITOR-107** — Each agent's elapsed wall-clock time is measured from its spawn timestamp. While the agent is live the figure advances at least once per second on every visible surface that shows it (REQ-MONITOR-110, REQ-MONITOR-111); once the agent is terminal the figure is fixed at the difference between its completion and spawn timestamps and never changes again.

> **Narrowed by [`PD-ORCH-005`](../product/directives.md#pd-orch-005) revision 6, 2026-10-06.** Clause 33: the
> figure of an agent not ended whose presentation state is running, waiting or queued advances; a `paused` agent
> shows none.

**REQ-MONITOR-108** — Live elapsed clocks — on the verification row and header, on reasoning rows, and on running tool rows — advance from a recorded start timestamp on each display tick. A tick must not alter the recorded row, must not write session state, and must not cause a transcript publication: a session whose only activity is clocks ticking produces no new persisted data and no update traffic.

**REQ-MONITOR-109** — A reasoning row shows elapsed seconds and an approximate token figure obtained by dividing every reasoning character received by the configured characters-per-token ratio (default 4, REQ-MONITOR-080), including characters the row does not display. When the reasoning burst ends, a final duration is stamped on the row and both figures stop changing. A reasoning row is collapsed by default to a fixed height of 6 text lines showing the most recently received reasoning text, so a live row scrolls with the stream rather than growing without bound, and it carries an expand control that reveals every character received; expanding is display-only and changes neither figure. The elapsed and token figures are computed over all characters received whether or not the row displays them, so collapsing and expanding never change either number.

**REQ-MONITOR-110** — A one-second repaint tick (REQ-MONITOR-287) runs exactly while a visible surface displays at least one live reasoning row, one running tool row, or one live per-agent elapsed clock (REQ-MONITOR-111). With none of those present, no repaint occurs and the surface performs no periodic work at all; a hidden surface never ticks (REQ-MONITOR-039, REQ-MONITOR-297).

**REQ-MONITOR-111** — Per-agent elapsed wall-clock time is shown, and advances live on the one-second tick of REQ-MONITOR-110 while the agent is live and the surface is visible, in all three places that hold a slot for it: the agent tree meta, the inspector meta, and the pop-out window's context card. The documented fallbacks apply only where the elapsed value is genuinely unknown — where no spawn timestamp was recorded — and in that case the tree falls back to the state value and the inspector and the pop-out card show an em-dash. A surface that has a spawn timestamp and shows a fallback, or that shows a frozen figure for a live agent, is a defect.

> **Narrowed by [`PD-ORCH-005`](../product/directives.md#pd-orch-005) revision 6, 2026-10-06.** Clause 33: a
> `paused` agent shows its state or the fallback in place of a figure, though it has a spawn timestamp.

**REQ-MONITOR-112** — The overview header shows the session duration alongside the session name and status.

### 13. Current-activity display and stall visibility

**REQ-MONITOR-113** — The run-level activity line reads: while a verification suite is running, the check name with its position (index of total); while running, a coordinating-run message; otherwise the raw execution status.

**REQ-MONITOR-114** — The run header's root state maps as: running→running; paused→waiting; failed→failed; completed→done; anything else→queued.

**REQ-MONITOR-115** — A per-agent activity line is replaced with a statement that the agent ended with the run when it was settled by session reconciliation, and with a statement that it was cancelled by the user on an optimistic cancel.

**REQ-MONITOR-116** — The overview's active-now card lists live and waiting agents, one row each, and each row carries a state dot, the agent's name, its role from the vocabulary of REQ-ORCH-028, its activity text, the number of tool calls it has dispatched, and its elapsed wall-clock time (REQ-MONITOR-107). The card has an explicit empty state inviting the user to start or resume a run.

**REQ-MONITOR-117** — Each agent is evaluated for a stall on a fixed interval derived from the configured stall timeout: one sixth of that timeout, never shorter than 1 second and never longer than 5 seconds. With the default 90-second stall timeout, evaluations therefore occur every 5 seconds.

**REQ-MONITOR-118** — Given no model event or token for the stall timeout (default 90 seconds, overridable per persona) while tool calls are in flight, the watchdog logs an informational message naming the number of active tool calls and keeps waiting.

> **Narrowed by [`PD-MONITOR-005`](../product/directives.md#pd-monitor-005), 2026-10-06.** The silence counted is that of a
> model step the agent has in flight. Between its turns (a wait on its own children) the agent is outside the watch and
> nothing is logged; through a retry backoff, a suspended wait on a provider limit or a compression's own model call the
> line names that wait instead of a number of active tool calls. Every other clause is as stated above.

**REQ-MONITOR-119** — Given the same silence with no tool call in flight, every stall evaluation must do three things: log a warning saying the agent appears stalled and that the run is still waiting on it; emit a diagnostic issue of kind `stall` at warning severity carrying the agent's active tools, its recent tool calls, and the type of the last model event received; and invoke the host's stall callback. The callback fires on every evaluation, at the interval of REQ-MONITOR-117, so a host countdown advances at that rate. How often the warning itself may repeat is bounded by REQ-MONITOR-120.

> **Narrowed by [`PD-MONITOR-005`](../product/directives.md#pd-monitor-005), 2026-10-06 (revision 2 the same day).** The
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
  > **Narrowed by [`PD-ORCH-005`](../product/directives.md#pd-orch-005), 2026-09-27 (revision 2).** Pause still applies to the whole run only; in-flight tool calls finish, then every agent stops where it stands and is left `paused`, and continuing resumes it from there.

**REQ-MONITOR-124** — Given an accepted pause, the session status becomes `pausing` and a message states that the current step will finish first. Given a refused pause, an error message states that pause is unavailable because no active run exists.

**REQ-MONITOR-125** — While a run is paused, run controls state that the run must be continued before they can be used. A paused session persists with an interruption message and can be resumed from the composer.
  > **Extended by [`PD-ORCH-005`](../product/directives.md#pd-orch-005) revision 4, 2026-09-28.** Clause 18: a
  > session a crash left, `interrupted` or in REQ-CHAT-008's recovery state, is also continued from the composer,
  > with the same count and "continue without them" as a paused one. This requirement still governs in full.

**REQ-MONITOR-126** — Cancelling a run requires confirmation stating that cancellation cannot be undone in this session, describing the impact as cancelling the active run and every active task agent, with an explicit confirm label.

**REQ-MONITOR-127** — On confirmation the session status is optimistically set to `cancelling` and a full cancellation is requested. Given a refusal, the status is restored to `running` and an error message states that the run is no longer cancellable.

**REQ-MONITOR-128** — Cancelling one agent requires confirmation naming that agent plus one line per live descendant that will also be cancelled. On confirmation, that agent together with each of its live descendants is optimistically shown as cancelled, with an activity line stating that the user cancelled them, and the cancellation is dispatched to the run. Given a refusal, the prior state is restored and an error message states that the agent is no longer cancellable.

> **Narrowed by [`PD-ORCH-005`](../product/directives.md#pd-orch-005) revision 6, 2026-10-06.** Clauses 23, 24 and
> 35: the confirmation lists, and the optimistic display shows cancelled, every descendant the cancel ends, live
> and paused; a refusal by the store or by another process's lock states the engine's words instead of "no longer
> cancellable".

**REQ-MONITOR-129** — Cancelling a run must signal the run's graceful-stop path rather than aborting its execution, so the run still produces and reports a terminal result. A graceful stop that is not honored within 30 seconds is force-cancelled as a backstop.

**REQ-MONITOR-130** — Cancelling a run must leave identical observable state whichever surface asked for it (the run header, the mission view, an auxiliary window, or a background-run row) and however the run was started (REQ-MONITOR-299): the same persisted execution status, the same terminal run result (REQ-MONITOR-028), every non-terminal agent settled to `cancelled` (REQ-MONITOR-209, REQ-MONITOR-211), the session lock released (REQ-MONITOR-240), and queued follow-up prompts left in the same condition. No host may hold a resource another has released.
  > **Narrowed by [`PD-ORCH-005`](../product/directives.md#pd-orch-005) revision 4, 2026-09-28.** Clause 15: the
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
  > **Narrowed by [`PD-MONITOR-006`](../product/directives.md#pd-monitor-006), 2026-10-06.** A switch made from the run
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

> **Narrowed by [`PD-MONITOR-001`](../product/directives.md#pd-monitor-001), 2026-09-16.** The card, the
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

> **Narrowed by [`PD-ORCH-005`](../product/directives.md#pd-orch-005) revision 6, 2026-10-06.** Clause 23: while
> an agent is paused, the line names that count between waiting and done (`running 1 · waiting 0 · paused 2 · done
> 1 · failed 0`). Otherwise it reads as stated.

**REQ-MONITOR-170** — The cumulative token figure uses the aggregate total when available and otherwise falls back to the sum of prompt and completion tokens from the raw usage record.

**REQ-MONITOR-171** — The sessions card lists sessions as a run switcher; each row carries a status dot (attached uses the run color, background uses the informational color, other busy states pulse in the run color, failed uses the failure color, otherwise idle), a session-name link with a tooltip carrying the session identifier and any requirement attribution, a requirement tag only when a requirement id exists, a focused marker, a detail caption, a continue-run link shown only when the session is not busy, the branch, a token label, and a duration label. Its empty state explains that finished and suspended runs will be listed there once they exist.

**REQ-MONITOR-172** — A session started by a person and not tied to a requirement must show no requirement tag at all; an empty tag would look like a requirement whose identifier could not be loaded.

**REQ-MONITOR-173** — The overview's right column shows, in order: the cloud-credit tile first (the balance determines whether provider quotas are reachable at all); the subscription-limits card; an agent-tree card with a link to the mission view; and an improvement-proposals card with a tag counting proposals pending review, a link into the library, and per-proposal rows carrying a summary link, status tag, category caption, and approve/reject/defer actions excluding the proposal's current status.

  > **Extended by [`PD-LIBRARY-002`](../product/directives.md#pd-library-002), 2026-09-17.** The
  > card's rows may also carry retrospective proposals — they are improvement proposals in the same
  > store, reviewed by the same actions, and the card distinguishes them from per-run ones by the
  > artifact that holds them rather than by a second card or a second vocabulary. The card's own
  > contract above is unchanged. The card's header also carries the retrospective's start gesture beside its
  > library link (ADR-0065 decision 7); sentence added 2026-10-07 ([OQ-222](../architecture/open-questions.md)).

**REQ-MONITOR-174** — The overview refreshes in response to state-change notifications (agents, sessions, status, repository, proposals, settings) and performs no work while hidden; the session runtime and status in its header follow status changes.

**REQ-MONITOR-175** — A session's awaiting-input flag must be recorded in its externally readable metadata as true when it has pending approvals or pending questions, so that every session list reveals a background run that is waiting on a human answer. The rendered attention text is a single fixed sentence stating that the run cannot proceed until the person answers.

### 20. Status bar and title bar

**REQ-MONITOR-176** — The bottom status strip shows plain-text readings of: workspace path, branch, safety flags, current model, cumulative tokens (thousands-separated with a `tok` suffix, tooltip explaining that it counts tokens used by this workspace's runs), a cost reading, and the number of background sessions.

**REQ-MONITOR-177** — When no cost label exists, the cost reading is hidden entirely rather than rendering a bare label with no value.

**REQ-MONITOR-178** — The status strip shows a cloud-credit chip reading `{balance} credit`, with an additional no-credit warning marker when spending admission is blocked, tinted with the accent color normally and the warning color when blocked, with a tooltip naming the account state and stating that activating it opens the account page for topping up. The chip is hidden entirely unless a credit reading is ready.

**REQ-MONITOR-179** — The title bar shows a session chip whose dot pulses for live states, a label of the form `session {status}`, and an accessible description stating the session status in a sentence.

**REQ-MONITOR-180** — While post-run improvement analysis is running, a separate informational, pulsing indicator with its own label is shown; setting it must not change run state. Across parallel runs the indicator is the logical OR of all runs, so that when one run's analysis finishes the indicator stays lit while any other run is still analyzing.

### 21. Provider limits, cloud credit, and quota waits

**REQ-MONITOR-181** — The subscription-limits card renders one row per provider limit, each carrying: the limit's label; a monospaced reading of the amount used against the allowance; a progress bar filled to that fraction; and a detail caption. A bar at or above 60% of its allowance renders in the warning tint by default, paired with text so the warning is never carried by colour alone (REQ-SHELL-149). The reading must convey the amount used and the allowance as two separately identifiable figures in the same unit; where that unit is money it is computed and rendered by the single money-arithmetic rule of REQ-PROVIDER-121, and where it is a count it carries thousands separators. The detail caption must convey when the allowance next resets, and, where the provider states it, the length of the window the allowance covers; where the provider supplies no reset information the caption says that the reset time is not known rather than omitting the caption. The wording and the separators of both are the implementation's.

**REQ-MONITOR-182** — Limits for every authenticated provider are fetched without any one provider delaying another: the interval from the first request to the last row settling must not exceed the longest single-provider timeout plus a small fixed overhead, and must not grow in proportion to the number of providers configured. A provider that is slow, unauthenticated, or failing must never delay or suppress the rows of providers that answered. The per-provider fetch timeout is 5 seconds — the same timeout the provider domain applies to a subscription-usage request, so one figure governs the call and the surface waiting on it — and the fixed settling overhead the card is allowed on top of it is at most 1 second, whatever the number of providers configured. A provider that has not answered within its timeout settles as a degraded row (REQ-MONITOR-183) rather than holding the card open.

**REQ-MONITOR-183** — A provider that is unauthenticated or whose fetch failed keeps a visible degraded row naming the provider, stating that usage is unavailable, and giving the specific remediation for that provider (sign in, run the provider's token setup, or retry when the provider exposes usage data). The card's empty state explains that providers which are signed in may report subscription limits there.

**REQ-MONITOR-184** — Limits are computed a single time at startup; there is no polling loop, no expiry timer, and no file watching. After settings observes a successful re-authentication of a provider, a refresh is triggered on a background worker; its result replaces the stored limits and notifies views, which re-render with no additional wiring. A failed refresh degrades to the unavailable card and must never present a blocking dialog.

**REQ-MONITOR-185** — Cloud credit is modeled with a phase of `signed_out`, `loading`, `ready`, or `error` — every phase has something to show, so the tile is never drawn as an empty card — and a state of available, exhausted, overdrafted, or unknown, each carrying its own label. It carries a pre-rendered balance label, a last-call cost label, a backend admission flag, and a copyable error string. Credit is considered blocked exactly when the phase is ready and admission is not allowed.

**REQ-MONITOR-186** — Cloud credit is re-read at application start, on cloud sign-in, whenever a run leaves a live-claiming status for any status that does not claim one (REQ-MONITOR-024, over the vocabulary of REQ-SESSION-073) — which covers every status that ends a run and a return to idle alike, because every run that executed spent credit whatever its outcome — on a repeating 120-second timer, and on explicit user request. The 120-second interval is fixed and is not user-configurable: the reading is cheap, it is what admission decisions are answered from (REQ-MONITOR-187), and a user-lowered interval would only add traffic while a user-raised one would only make a blocked account discovered later. The timer runs only while the application window is visible; it is suspended while the window is minimized or hidden and resumes with an immediate re-read when the window is shown again, so a hidden application performs no periodic credit work (REQ-MONITOR-174). No re-read may block the interface: while one is in flight every control stays operable and the previous reading stays on screen until a newer one replaces it.

**REQ-MONITOR-187** — Given a run whose models are cloud-hosted and a last reading indicating the account may not spend, starting the run must first raise a confirmation that names the balance; the user may start anyway. The check is answered from that last reading alone and must add no network call to the start path.

**REQ-MONITOR-188** — Credit state must be conveyed by text and shape, never by color alone.

**REQ-MONITOR-189** — Given a run failure whose message contains "rate limit" or "quota" (case-insensitively): on cloud models with a ready credit reading, a persistent error notice is raised naming the reported balance and state, stating that the session is preserved and that the user may top up or choose a model on another provider, offering an action to open the cloud account, and the balance is re-read because the reading that produced the failure is by definition stale. Otherwise a persistent error notice states that a provider limit was reached, that the session is preserved, and that the user may choose another model or retry after the provider resets, offering a change-model action.

**REQ-MONITOR-190** — All other run failures raise a persistent error notice stating that the run failed and that the session and draft were kept for recovery, with a review action, and with the raw failure message retained in copyable details.

**REQ-MONITOR-191** — Quota retry backoff honors a provider-supplied retry-after value when present (minimum 1 second); otherwise it is exponential from a 60-second base doubling per attempt and capped at 300 seconds.

**REQ-MONITOR-192** — While parked on a quota wait, an agent waits on a decision keyed by that agent. Where automatic resume is allowed, the wait timing out resolves as a retry. Where it is not allowed, the wait continues indefinitely until a person decides.

**REQ-MONITOR-193** — The fallback candidates offered during a quota wait are exactly the configured models, from any configured provider, whose size tier equals the current model's tier, less any model excluded under REQ-MONITOR-194. A model's tier is not established here: it is the tier alias the model resolves through (REQ-CONFIG-070, REQ-CONFIG-071) as REQ-ORCH-019 defines it, and this domain adds no second rule for deriving one. A model that resolves through no tier alias has no tier, is therefore never an automatic fallback candidate, and may still be chosen explicitly. Candidates are presented in the order their models are declared in the configuration, so the order is deterministic, reproducible across runs, and under the user's own control; no ranking by price, latency, or provider is applied.

**REQ-MONITOR-194** — A provider-and-model pair that answered with a structured insufficient-quota response (HTTP 429) is recorded in the session record as out of quota. For the rest of that session it is neither retried automatically nor offered as an automatic fallback candidate (REQ-MONITOR-193), and the exclusion survives a resume of the same session. The exclusion governs automatic behavior only. A user may still choose an excluded pair explicitly, from any model selector or from the quota-wait decision surface (REQ-MONITOR-303), and it must be listed there rather than hidden, annotated with the reason that the provider reported insufficient quota for it in this session — the same treatment REQ-MONITOR-067 requires of any withheld model. Choosing it explicitly clears the recorded exclusion for that pair, so it is eligible again until a further insufficient-quota response re-records it.

**REQ-MONITOR-195** — Entering a quota wait sets the execution status to `waiting`, records a wait state carrying the waiting agent, the message, the model, the wait duration in seconds, and whether automatic resume is allowed, and appends a system transcript row. The wait state is cleared on resume or stop. `waiting` belongs to the live-claiming subset (REQ-MONITOR-024), so a quota-waiting session keeps presenting its parked agents (REQ-MONITOR-291) and is not reconciled to a terminal outcome (REQ-MONITOR-211).

- **REQ-MONITOR-196** — *Withdrawn.* Its only surface was a terminal-interface modal, and the product has no terminal interface; the decision surface it described is carried by REQ-MONITOR-303.

**REQ-MONITOR-197** — Every host (REQ-MONITOR-003) presents from the same wait state and `waiting` status, delivered to all of them alike (REQ-MONITOR-216), and every one of them must present the run as waiting on provider quota, not as stalled or failed.

**REQ-MONITOR-303** — Entering a quota wait raises a decision surface in the desktop interface for the session that is waiting. It must convey that the run is parked because a provider reported its quota exhausted, and must name the model and the provider. It has two body variants, chosen by the wait state's automatic-resume flag (REQ-MONITOR-195): where automatic resume is allowed, it also conveys the approximate retry delay and that the run will retry by itself if left alone; where it is not, it also conveys that this provider-and-model pair is treated as out of quota for the remainder of the session (REQ-MONITOR-194). It offers exactly three choices, and the set of three is a fixed contract while the wording of each is the implementation's: keep waiting, which resolves the wait as a retry and returns the status to `running`; cancel the run, which takes the ordinary cancellation path (REQ-MONITOR-127, REQ-MONITOR-129); and change model now, which opens a model picker offering the fallback candidates of REQ-MONITOR-193, listing excluded pairs with their reason rather than hiding them (REQ-MONITOR-194), and which on selection applies the run's model switch (REQ-MONITOR-142) and resolves the wait as a retry on the chosen model. The surface must not block the rest of the application: while it is open the transcript keeps updating, other sessions keep running, and every other control stays operable. Dismissing it without choosing leaves the wait exactly as it was and does not answer it; while the session's status is `waiting` the surface must remain reachable again from the run header, so a dismissed decision is never a lost one. At most one such surface exists per waiting session, and a session that leaves `waiting` for any reason closes its own.

> **Narrowed by [`PD-MONITOR-004`](../product/directives.md#pd-monitor-004), 2026-10-06, revision 2 the same day.** The
> change-model picker lists every configured model key, alphabetically, the waiting model included, with an out-of-quota
> pair annotated and choosable; REQ-MONITOR-193's candidates are not its filter. *Revision 2:* keep waiting resolves the
> wait as a retry, at once, only where automatic resume is not allowed (an out-of-quota pair, retried as an explicit
> choice of it, which clears its exclusion); where automatic resume is allowed it acknowledges and changes nothing, and
> the timer resolves the wait as a retry when the interval elapses. Every other clause above still governs.

### 22. Failure visibility

**REQ-MONITOR-198** — Run lifecycle feedback is normalized across hosts around exactly eight event kinds: run started, run progress, run paused, run cancelled, run completed, run failed, quota wait entered, and recovery (from a stall or from a quota wait). Every host must expose all eight as separately identifiable events — a consumer must be able to tell which kind occurred without parsing free-form text — and no host may collapse two kinds into one or add a ninth.

**REQ-MONITOR-199** — Completion and failure notices must persist with copyable technical details rather than relying on transient messages. A notice carries a severity, title, message, detail text, a persistence flag, an optional action label and identifier, and the session it belongs to.

**REQ-MONITOR-200** — Starting a run clears only those persistent notices whose session id is the session being started. A persistent notice carrying any other session id survives that start and every start after it, and is removed only when the user dismisses it or when a newer notice for that same session replaces it. Starting a new run must never be the reason a user loses the record of another session's outcome.

**REQ-MONITOR-201** — When the focused run completes successfully, a persistent success notice states that the run completed and invites review of the transcript and artifacts, with an action to view artifacts. Other terminal states of the focused run produce a transient message naming the terminal status.

**REQ-MONITOR-202** — When a background run finishes, a persistent notice names the session and its terminal status, states that the focused run continues and the user may switch to review the finished one, and offers a switch action. A background failure uses warning severity, a title naming the failed session, and carries failure details.

**REQ-MONITOR-203** — Given a run that failed without letting an exception escape (the loop caught the error and summarized it into its progress record), the failure must still be reported through the failure path with the loop's own wording, so that authentication-recovery handling still runs instead of the session ending with a bare failure message and no recovery offer.

**REQ-MONITOR-204** — Given a run that requested a sandbox and never reported having started, the backend's refusal reason and remediation must be shown verbatim under a title stating the run stopped before it started; a generic failure message that invites an unsatisfiable retry is not acceptable.

**REQ-MONITOR-205** — A lifecycle-hook advisory raises a persistent warning notice whose title says lifecycle hooks need attention and which offers an action that opens hook settings. The notice must never contain the text of a hook's command. It must appear every time an advisory is raised, whatever the run's state, whichever host is in use, and whether or not the session it concerns is the focused one; an advisory that is raised but not shown is a defect.

**REQ-MONITOR-206** — The terminal whole-state read is retried up to 3 times, 100 ms apart. If every attempt fails, a refresh-failure message naming the attempt count and the underlying error is emitted, and the run's terminal signal still completes: a read failure must never swallow the run outcome.

**REQ-MONITOR-305** — A run carries a warnings surface, reachable while the run is executing, listing conditions that do not stop the run but that a person watching it needs to see. It must list at least: every agent whose context has reached 75% of its compression threshold (REQ-MONITOR-087), naming the agent and its context reading; every failed tool call, naming the agent, the tool, and the failure; and every agent error and every unexpected agent exit, naming the agent and what was recorded. Each entry states which agent it concerns and is actionable — activating it selects that agent (REQ-MONITOR-042). The surface updates when an event changes something it lists and performs no periodic polling, it defers its refresh while hidden and catches up when shown (REQ-MONITOR-039), it carries an explicit empty state, and it conveys severity by text and shape and never by colour alone (REQ-SHELL-149). Entries are warnings and never notices: raising one must not clear, replace, or suppress any notice of REQ-MONITOR-199.

### 23. Crash, orphan, and contradiction handling

**REQ-MONITOR-207** — A session whose execution status claims a live run but whose recorded process identifier is no longer alive is a stale session and must be detectable as such.

**REQ-MONITOR-208** — Liveness probing must not signal the probed process. Where a platform's naive liveness check would deliver an interrupt to the target, an inspection-only mechanism must be used instead, and only an unambiguous "no such process" answer may be treated as proof of death — every ambiguous answer must be treated as alive.

**REQ-MONITOR-209** — Repairing a stale session settles the session to `interrupted` and every orphaned agent to `cancelled`. `cancelled` is a legal transition target from every non-terminal agent state, so repair can settle any agent whatever it was doing.

**REQ-MONITOR-210** — The interface must offer the repair and announce that it happened. A repair attempt on a session whose process is alive must be refused with a reason, and the refusal must distinguish "the process could not be confirmed dead" from "the process is running".

**REQ-MONITOR-211** — Given an execution status that neither claims a live run nor is `idle`, every running, waiting, or queued agent must be settled to the run's own outcome: completed / succeeded / done→done; failed / error→failed; anything else (paused, cancelled, interrupted)→cancelled. Their activity is replaced with a statement that they ended with the run, and their active tool chips are cleared.
  > **Narrowed by [`PD-ORCH-005`](../product/directives.md#pd-orch-005) revision 4, 2026-09-28.** Clause 13: a
  > session at rest never settles a `paused` agent to the run's outcome; it keeps its state and its last activity
  > until it resumes or ends. Every other running, waiting or queued agent is settled as stated.
  > Revision 6 (2026-10-06), clause 23: the agents a crash left present `paused`, by `crash`, before the crash is
  > recorded, and are not settled; a session a store failure left busy is settled as stated.

**REQ-MONITOR-212** — The `idle` status is deliberately exempt from that reconciliation, because a run that never began has no outcome for its agents to inherit.

**REQ-MONITOR-213** — Once reconciliation (REQ-MONITOR-211) has settled an agent, every surface — agent tree, live counters, dashboard, mission graph, persona windows, inspector — must show that agent in the settled state and its cleared activity. No surface may still present it as running, waiting, or queued, and no surface may apply a settling rule of its own or exempt itself from the outcome.
  > **Narrowed by [`PD-ORCH-005`](../product/directives.md#pd-orch-005) revision 4, 2026-09-28.** Clause 13: every
  > surface shows a `paused` agent as `paused`, the one state REQ-MONITOR-211's reconciliation leaves as it is.
  > Every settled agent is shown as stated.
  > Revision 6 (2026-10-06), clause 23: so is an agent a crash left before the crash is recorded, shown `paused`.

### 24. Live update transport, timing, and ordering

**REQ-MONITOR-214** — A live run publishes on two channels, and every publication on either channel carries a sequence number: one counter per session, shared by both channels, starting at 1 and raised by exactly one for each publication that session makes. This requirement is the product's single definition of that sequence number; a document that relies on a surface being able to tell that it missed an update cites this identifier rather than describing a second mechanism. A surface begins from a whole-session update and counts on from the number that update carried, so at every moment it knows the number the next publication must bear; a publication bearing any other number means one was lost in delivery, and REQ-MONITOR-226 says what the surface must then do. The transcript travels as an incremental update carrying the lowest row index whose content may still change, the rows from that index onward, any new diffs, and the persona set; every row before that index is untouched by the update.

**REQ-MONITOR-215** — A row already delivered to a view is stable: its content may change only through a later update whose earliest-changed index is at or below that row's index. Nothing the run does afterwards may alter, in place, a row a view is already holding.

**REQ-MONITOR-216** — All state other than the transcript travels as one whole-session update carrying the session record with its unbounded collections emptied — transcript rows, edit diffs, report artifacts, checkpoints, and seen-compression identifiers are omitted, reaching views by other paths — and its bounded collections carried in full: agent states, run todos, per-agent todos, pending approvals, pending questions, verification state, quota wait state, queued follow-up prompts (REQ-MONITOR-140, REQ-MONITOR-141), token usage, token-history samples (REQ-MONITOR-166), and per-agent metrics. A delivered update is a fixed snapshot of the moment it was taken: no later run activity may change a value a consumer already received.

**REQ-MONITOR-217** — The whole-session update carries every field of the session record that any surface is able to display, not a curated subset of them. A surface may display a session field only if the update carries it. The failure this rules out is observable: a field added to the record but omitted from the update leaves a surface showing a value the persisted record has already moved past.

**REQ-MONITOR-218** — A transcript row a view has not yet seen is published immediately. No minimum wait, debounce, or delay floor of any size may be applied before publishing such a row, on any platform.

**REQ-MONITOR-219** — Growth of an already-visible row is coalesced into a trailing tick of 50 ms (about 20 updates per second). Per-token publication is not permitted, because each publication costs a full delivery and projection cycle while providers emit tokens faster than any view can draw them.

**REQ-MONITOR-220** — Coalescing must lose nothing: a pending publication reads current state when it fires. At run end, pending publications must be flushed so a run whose last row arrived late does not appear to have lost it.

**REQ-MONITOR-221** — Every change must be persisted before it is published to any view. If a view could display an event that the durable record does not yet hold, it could disagree with what a resume would restore. This is satisfiable alongside REQ-MONITOR-218's "no delay before publishing a row" because persistence carries no delay of its own: a save is durable when it is requested, with nothing deferred behind a timer (REQ-SESSION-067). The interval in which a change could be published before it was recorded no longer exists. **This requirement still states no exception, and OQ-42's closure creates none** (2026-09-06): where persistence fails, nothing is published — REQ-EVENTS-088 stops authoritative publication for the affected runs rather than letting a view run ahead of the record. What such a run's surface shows afterwards is an explicitly labelled **in-memory** failure and cancellation status shown *outside* the authoritative transcript, which is not a published change and is never mistaken for one; the durable transcript stays at its last whole boundary, and that boundary is what a resume restores.

**REQ-MONITOR-222** — Run activity must appear on the live surfaces of the focused session within 250 ms at the 95th percentile, regardless of how long the session already is. This must hold both at zero pre-existing rows and at thousands of pre-existing rows.

**REQ-MONITOR-223** — The end-to-end cost of one update is set by how much changed, not by how much the session has accumulated: for the same amount of new content, an update to a session holding thousands of recorded rows must cost no more than a small constant factor of the same update to an empty session, measured from the run emitting the change to the surface showing it, not only inside the view. The acceptable constant factor is 2: measured at the 95th percentile over the same update content, an update to a session holding at least 10,000 recorded transcript rows must cost no more than twice the same update to a session holding none. A session with nothing happening must do no work at all beyond what the run itself schedules while it is live (REQ-MONITOR-166): nothing is polled on its behalf, and no timer anywhere runs to discover whether it has changed (REQ-MONITOR-288).

**REQ-MONITOR-306** — The rate at which live terminal output reaches this application's surfaces is bounded in aggregate — across every live stream, of every session, delivered to every window, taken together — and not per stream alone. This requirement is the product's single definition of that aggregate bound; a document that needs it cites this identifier rather than restating it. The bound is 1,000 frames per second, measured over any one second at the point frames are delivered to surfaces, and a stream shown in more than one window counts once per window, because the cost this bound exists to control is paid per delivery. REQ-TOOLS-126 fixes the sampling period of a single stream and the range that period may take, and REQ-TOOLS-127 fixes what a frame is; this requirement copies neither. What it adds is that the number of streams a configuration allows to be live at once is not a multiplier on the per-stream period: however many are live, they share one aggregate rate rather than each delivering at the per-stream rate independently.

Where the live streams would together exceed the bound they share it, and what a user observes is that each live preview updates less often and in larger steps while many streams are busy. Nothing else changes: no output is dropped and none is reordered (REQ-SHELL-103), what a view can still retrieve from the durable record is unaffected (REQ-MONITOR-294), and the command's own completion, its output, and the observation an agent receives are identical whether or not anything was watching (REQ-TOOLS-127).

The bound is stated on frames and deliberately not on volume. Bounding how many bytes may reach a surface each second could be honoured only by discarding output, which REQ-SHELL-103 and REQ-MONITOR-294 both forbid, whereas bounding frames is honoured by carrying more accumulated text in each one, which loses nothing. Frames are also the axis that matters: the cost of delivering a frame grows far more slowly than its size, so a given volume delivered in many small frames costs far more than the same volume delivered in few large ones.

**This bound is a condition of REQ-MONITOR-222 and is not a display-smoothness concern.** Live terminal output and the transcript publication of REQ-MONITOR-214 reach a surface over one delivery path, and giving a channel a separate name does not make it a separate path; terminal output delivered above this rate therefore delays the transcript rows REQ-MONITOR-222 bounds. Two obligations follow and neither is optional. The bound may not be widened, made configurable, or raised by any per-stream setting unless REQ-MONITOR-222 is re-measured at the new aggregate rate and still holds. And conformance for this requirement is measured as the aggregate frame rate delivered across all live streams, never as the appearance of a terminal grid: a grid that looks smooth establishes nothing about whether the transcript budget is being met.

The failure this prevents is invisible to every other detector this document has. Delivery above the bound loses nothing and reorders nothing, so no sequence gap appears and no surface reconciles (REQ-MONITOR-214, REQ-MONITOR-226); the only symptom is a live surface that is late, which is the one thing REQ-MONITOR-222 exists to forbid.

**REQ-MONITOR-224** — A view stage that cannot correctly apply an incremental update must decline the increment and re-render from a whole read; it must never render a result that differs from what a whole read would have produced. The agent-scoped transcript filter is such a stage and is off by default. Grouped tool rendering is on by default and applies increments correctly by treating any row that cannot join a group as a group boundary; with grouping on, the 250 ms visibility budget still holds.

**REQ-MONITOR-225** — Reading a session snapshot and projecting it must never make the interface unresponsive: while a read or a projection is under way, controls stay operable and already-rendered content stays on screen. Displayed state never moves backwards — a result belonging to a read that a later read has superseded must never overwrite newer content, however long the earlier read took to arrive; the sequence number of REQ-MONITOR-214 is what makes a superseded result identifiable as one. The duration of each snapshot load and each projection is recorded in diagnostics.

**REQ-MONITOR-226** — A view consumer that raises, hangs, or vanishes must leave the run untouched: its progress, timing, terminal result, and event sequence must be the same as if every consumer had succeeded. A view that cannot apply an increment must record a diagnostic saying it is falling back, stop consuming increments, and re-render from a whole read; after that read, what it shows must equal the persisted record. A view that receives a publication whose sequence number is not the one it was expecting (REQ-MONITOR-214) has missed an update, and must do those same three things on the publication that reveals the gap rather than after any delay. That is the whole of how a lost update is caught: detection is immediate rather than deferred to a timer, it costs nothing while nothing is being lost, and no surface may re-read persisted state on a schedule to discover what it missed (REQ-SESSION-071).

**REQ-MONITOR-227** — After focus moves to another session, the transcript on screen must be the newly focused session's transcript in full, taken from the persisted record. No row belonging to the previously focused session may remain visible, and no update generated for the previous session may be applied to the new one.

**REQ-MONITOR-228** — Once a run reaches a terminal state, the transcript a view shows must equal the session's persisted record, including the corrections only a terminal state determines: a tool row that never settled must no longer render as running, and a reasoning burst that never received a duration must be stamped with one. After a run has ended, no row may still render as in progress. A tool row that never settled takes status `blocked`, for the same reason a skipped verification check does (REQ-MONITOR-106): no outcome was ever observed, and `ok` or `failed` would assert one the run never saw. Such a row must also convey that the run ended before the tool reported, so `blocked` is not read as a permission refusal, and its duration is the interval from its start to the run's terminal state.

**REQ-MONITOR-229** — A transcript that has shrunk (only clearing the transcript does this) is published with an earliest-changed index of 0, meaning the view must start over from that point.

**REQ-MONITOR-230** — Approval and question rows are not part of the recorded history; they are computed from whatever is pending at that moment, always appear after every recorded row, and are appended identically by both the whole-state and the incremental path. A question row reads as a step count with the first question's title; an approval row reads as an approval-needed line naming the command or tool.

**REQ-MONITOR-231** — Given a live run blocked on an approval, the approval row must be present in the live view, not only after the run ends.

**REQ-MONITOR-232** — The run's whole obligation to a view is to emit its events; nothing a view does is required for the run to proceed. A view that is slow, broken, or entirely absent may degrade only what is displayed: the run's terminal result, its persisted record, its event sequence, and its timing must be identical to those of the same run observed by a healthy view. No view may hold a run open, slow it down, or change its outcome.

### 25. Persistence-visible effects

**REQ-MONITOR-233** — A session's durable state is held as a record in a durable store, keyed by session id and scoped to the workspace, and covers: the session's listing attributes; its resumable state and its user-facing transcript rows; its event history, recorded in emission order and never rewritten; its produced artifacts, identified and ordered; and a per-session log. Where that store is and which of these parts remain files is fixed by REQ-SESSION-001, REQ-SESSION-002 and REQ-SESSION-198, and this document holds no copy of it; what this domain requires is that every one of those parts exists for every run.

**REQ-MONITOR-234** — The listing record carries: session id, creation time, update time, execution status, schema version, an internal flag, worktree information, checkpoint count, task title, requirement id, unit id, and the awaiting-input flag. No reader may observe a listing record describing a state that was never saved, or one whose parts came from two different saves (REQ-SESSION-028).

**REQ-MONITOR-235** — Listing sessions reads only the listing records, skips a record it cannot interpret rather than failing the listing, and sorts sessions by update time descending. The cost of a listing grows with the number of sessions and with nothing else (REQ-SESSION-042).

- **REQ-MONITOR-236** — *Withdrawn.* It restated the readability of a legacy combined snapshot file, which REQ-SESSION-005 fixed and which is withdrawn for the reason that governs here too: a clean-room product has no predecessor layout to fall back to, so no such document can exist. The guarantee it was carrying — that a session recorded by an earlier version of this application still opens — survives in the sessions domain's own legacy tolerance, which loads a state with absent optional keys by applying defaults (REQ-SESSION-015) and treats a record written by a different version as ordinary (REQ-SESSION-073), bounded by the refusal of a newer schema version that REQ-MONITOR-241 restates.

**REQ-MONITOR-237** — The event history is recorded in emission order and never rewritten, carries transcript-row events among others, and must be readable from an arbitrary recorded position, so that a reader can start anywhere in it without first reading everything that precedes: the session listing obtains the event count and the earliest and latest instants without decoding every event (REQ-EVENTS-126), and the history and export surfaces read a history that is complete. It is no longer read in order to follow a live run (REQ-MONITOR-244); every other consumer of it is unaffected, and the history is recorded for every run whether or not anything is watching (REQ-MONITOR-233, REQ-MONITOR-248).

**REQ-MONITOR-238** — The per-session debug log is written at the configured session log level, defaulting to warning. It remains a file a person can open in a text reader (REQ-SESSION-142).

**REQ-MONITOR-239** — A session's state is durable once a save is requested: no host may rely on a persistence delay, and none may be introduced (REQ-SESSION-067, REQ-SESSION-068). A save that records a terminal (non-running, non-idle) status is durable at that moment like any other, and shutdown leaves nothing outstanding to flush. Hosts must not treat persistence as a liveness signal and must not request saves in order to make a session appear live: liveness comes from the publication path, durability from the record.

**REQ-MONITOR-240** — A session lock is claimed exclusively by an operation that either takes the lock or reports the current holder, behind a reaper that clears locks held by dead processes. The claim must fail whenever the holding process is still alive, and must convey what REQ-SESSION-048 requires — including, where the lock names another machine, that the session is held by a different machine rather than that a lock is merely in conflict. Consequently, a caller that pre-creates a session and then asks for it to be run must not hold that session's lock.

**REQ-MONITOR-241** — The session schema is versioned (currently version 1). Loading a snapshot whose version is newer than supported must fail with a message stating that the schema version is unsupported, rather than partially loading it.

**REQ-MONITOR-242** — The transcript a user watched during a run and the transcript restored when that session is reopened must be equal: the same rows, in the same order, with the same content and the same annotations. A user who follows a long run and later reopens the session must find what they saw. Any difference between the two is a defect, and wherever they could differ the persisted record is authoritative (REQ-MONITOR-292).

### 26. How a run is observed

**REQ-MONITOR-243** — A live run reaches every surface that displays it over the publication channels of REQ-MONITOR-214 and REQ-MONITOR-216, and by no other route. What this domain relies on, and does not itself define, is that a session is in one of two conditions and no third, which REQ-SESSION-159 fixes: either this application is executing it, in which case it is live and published to, or it is not running, in which case it exists as a persisted record and is put back on screen by being opened from that record and continued (REQ-SESSION-196). No session executes somewhere this application can only watch it. There is consequently no second way to observe a run: a run started in the foreground, a run sent to the background, and a run placed in a worktree are observed with the same content, by the same means, and with no difference in latency between them. Because displaying a session is a read of what is published to it and never a write, one live session may be displayed in as many windows as the user has open at once, no window excluding another.

- **REQ-MONITOR-244** — *Withdrawn.* It fixed the live tail-following protocol — a stateful read offset over the evidence event store, turning stored events back into transcript deltas — which existed only because a session could be executing where the displaying process could do nothing but read its files. No session can be in that position (REQ-MONITOR-243): a live session is published to (REQ-MONITOR-214), and a session that is not running is opened from its record (REQ-SESSION-196). The event history itself is untouched by this withdrawal. It is still recorded for every run (REQ-MONITOR-233), still readable from an arbitrary recorded position (REQ-MONITOR-237), and still read by the session listing, which obtains the event count and the earliest and latest instants without decoding every event (REQ-EVENTS-126), and by the history and export surfaces, which read it once it is complete. What is withdrawn is following it live, and only that.

- **REQ-MONITOR-245** — *Withdrawn.* Every edge it named was an edge of the tail-following protocol withdrawn with REQ-MONITOR-244, and the difference it described between two kinds of viewer — one seeing a row when it opens and again when it settles, the other seeing it grow continuously — has no second kind of viewer left: every surface now observes growth as REQ-MONITOR-219 coalesces it. The robustness rules it restated belong to the event history's own reader, and each is held by a requirement that survives: a session with no history reads as an empty session (REQ-EVENTS-101); a damaged record in a source being read is skipped with one warning each and the read continues (REQ-EVENTS-106), a case that no longer arises from this product's own store — where an event is recorded whole or not at all and a failed recording step leaves no partial record (REQ-EVENTS-029, REQ-EVENTS-088) — and now describes a caller-supplied source such as an exported history carried between machines; a stored history is complete and in emission order (REQ-EVENTS-083) and is read whole (REQ-EVENTS-099), so exactly-once in-order delivery from it needs no protocol of its own, and for a live session that guarantee is the publication channel's (REQ-EVENTS-165, REQ-MONITOR-214). The positional rules it also restated — reading only what was appended since a previous position, and the restart flag that went with it — are withdrawn along with the reader that carried a position between reads (REQ-EVENTS-108 to REQ-EVENTS-116).

**REQ-MONITOR-246** — Everything other than the transcript — todos, agent tree, artifacts, token counts, and every other bounded collection REQ-MONITOR-216 carries — reaches a surface on the whole-session update that carries it, and by no other route. No surface may source any of it by reading persisted state on a schedule (REQ-SESSION-071). A whole-state read still happens, but only when something asks for one: when a surface reconciles after a missed publication (REQ-MONITOR-226), when it declines an increment it cannot apply (REQ-MONITOR-224), when focus moves to another session (REQ-MONITOR-227), and when a session that is not running is opened from its record (REQ-SESSION-196). Such a read costs what REQ-MONITOR-216's bounded collections cost and never what the session's accumulated history costs, because the update carries none of that history.

- **REQ-MONITOR-247** — *Withdrawn.* It forbade a handle that was executing its own run from following a second session, so that two writers could not collide over one transcript. There is no following left to refuse (REQ-MONITOR-244), and displaying a session is now a read of what is published to it, so no surface can collide with a writer and any number of windows may show one session at once (REQ-MONITOR-243). The single-writer guarantee it was protecting is held where it belongs: the exclusive session lock of REQ-MONITOR-240, with the refusal to resume a session a run is already executing (REQ-MONITOR-256) and the refusal of a second start on a handle that is already running (REQ-MONITOR-260).

**REQ-MONITOR-248** — The transcript must be recorded beneath every host, by whatever executes the run rather than by any surface displaying it, so that a run nothing is watching — one sent to the background, or one whose window the user closed — has its user-facing transcript recorded as the run goes rather than only at its end. No host is required to be open for the record to exist, and that record is what the session is later opened from (REQ-SESSION-196, REQ-MONITOR-242).

### 27. Parallel sessions and focus routing

**REQ-MONITOR-249** — Concurrent runs each get their own run handle, while views keep a single-run interface: every control a view issues routes to the focused run. Session-aware notifications (run started, finished, failed, focus changed) must cover every run, not only the focused one.

**REQ-MONITOR-250** — Background run handles keep refreshing their own session but publish only a session summary (session id, execution status, branch). They must never publish into the shared transcript, agent tree, metrics, or prompt queue.

**REQ-MONITOR-251** — The second and any subsequent concurrent launch must be placed into a worktree.
  > **Narrowed by [`PD-GIT-001`](../product/directives.md#pd-git-001), 2026-10-07.** A launch is a second concurrent
  > launch when a run is active in the launching window's workspace, or in a tree that is that workspace's folder, lies
  > inside it or contains it; a run of an unrelated project does not place it in a worktree.

**REQ-MONITOR-252** — Switching focus changes which session is projected without touching any background run's lifecycle. Cancelling or failing one run must affect only that run's handle.

**REQ-MONITOR-253** — An approval request must reach the run that asked for it even when that run is not focused, and an approval answer for which no run is waiting must be reported back as undeliverable.

**REQ-MONITOR-254** — A permission-mode change reaches only the focused run.

**REQ-MONITOR-255** — Shutdown must request every run handle to stop before waiting on any of them.

**REQ-MONITOR-256** — Continuing a session must never inherit the previous run's live agents. Resuming a base-workspace session must be refused while a run is active there.
  > **Narrowed by [`PD-ORCH-005`](../product/directives.md#pd-orch-005), 2026-09-27 (revision 2).** A continued session never inherits a live agent; the agents its last run left `paused` are restored from their recorded conversation, with their identity, unless the user declines.

**REQ-MONITOR-257** — Changing focus re-binds every per-session surface: sandbox indicator, terminal streams (an open terminal window re-opens onto the newly focused session's terminals, because the intent is to keep a terminal in view, and after the switch it is the newly focused session's terminals that matter), composer submission target, and recovery state. Notices carry their session id so cross-session news survives a focus change.

**REQ-MONITOR-258** — An active run does not block starting a new session or switching the focused session: concurrent runs are supported (§ 27), the second and any later concurrent launch is placed in a worktree (REQ-MONITOR-251), the actions that start and list sessions stay enabled throughout a run (REQ-MONITOR-164), and changing focus leaves every other run's lifecycle untouched (REQ-MONITOR-252). The operations gated on a run being active are exactly these five, and the list is closed: resuming or continuing a session in a workspace where a run is already executing (REQ-MONITOR-256); integrating a worktree whose run has not finished; starting a second run on a handle that is already running (REQ-MONITOR-260); starting a run while a previous run's terminal completion has not been reported or its worker has not finished (REQ-MONITOR-259); and using a run control on a paused run before it has been continued (REQ-MONITOR-125). Each refusal states that the run in question must finish, be continued, or be cancelled first. Any operation not on that list stays available while a run is active. Two things that look like gates are not refusals and are not on it: the composer's model, persona, and reasoning choices are locked while a run is busy because they apply to the next prompt rather than to the running iteration (REQ-MONITOR-146), and a control that cannot act at a given moment is disabled with its reason stated (REQ-MONITOR-295) rather than refused on invocation.

**REQ-MONITOR-259** — Starting a run is refused while a previous run's terminal completion has not yet been reported, and while the previous run's worker has not finished.

### 28. Run start and identity

**REQ-MONITOR-260** — Starting a run refuses an empty prompt and refuses a second start on a handle that is already running.

**REQ-MONITOR-261** — A caller may supply the identity of a not-yet-existing session at start time, so the run shows up in session listings before the worker has reported anything.

**REQ-MONITOR-262** — A run may be pinned to an immutable settings snapshot supplied at start; otherwise the current settings are snapshotted at start and used for the whole run.

**REQ-MONITOR-263** — Worktree resolution is announced (session id and branch) before the agent starts; the run-started notification (carrying the session id) is emitted once the session exists. Those announcements, together with the session status, drive the run header, the listing of sessions, and the composer.

**REQ-MONITOR-264** — Run request validation: isolation and worktree options are mutually exclusive; specifying a worktree branch requires isolation; resuming an existing session refuses worktree options. Validation diagnostics carry the failed-before-start marker of REQ-MONITOR-033.

### 29. Commands and keyboard access

**REQ-MONITOR-265** — Run-control commands must exist for cancelling the active run, pausing the active run, and compressing agent context. All three are gated on a live run and, when unavailable, remain listed with the reason that no run is active.

**REQ-MONITOR-266** — A command to clear the transcript must exist, gated on a non-empty transcript, with an unavailability reason stating that the transcript is empty.

**REQ-MONITOR-267** — Session and workspace commands must exist for new session, resume, session list, transcript search, worktree (gated on a repository), stash, and pop.

**REQ-MONITOR-268** — A model command taking a model name must exist. An unknown name is refused with a message naming the unknown model and listing the available ones. A model the provider currently withholds is refused with a message naming the model and the provider's reason. Success updates the visible model indicator and confirms the new model by name.

**REQ-MONITOR-269** — A persona command taking a persona name must exist, with equivalent unknown-name handling.

**REQ-MONITOR-270** — The command list is part of the application's single action vocabulary (REQ-SHELL-048) and holds an entry for every action the command palette can invoke and for every skill a user can invoke, including entries currently unavailable, which are listed with their reason (REQ-MONITOR-271). The listed set and the invocable set must be equal: an action that can be invoked without appearing in the list, and a listed command that cannot be invoked at all, are both defects.

**REQ-MONITOR-271** — Unavailable commands remain listed with their reason rather than being hidden; executing one reports the reason and preserves whatever the user had typed in the composer.

**REQ-MONITOR-272** — Keyboard access must include: Enter to submit from the composer; Shift+Enter for a newline; Ctrl+Return as a global submit; Ctrl+L to focus the composer; Ctrl+, for settings; Ctrl+F for transcript search; F1 for keyboard help; Escape to close an overlay; and Ctrl+Shift+T for the terminal window. Each of these is an entry in the single action vocabulary of REQ-SHELL-048 and is subject to REQ-SHELL-049: a chord the host operating system or the active input method has already claimed is not contested, and the action stays reachable from the command palette instead.

**REQ-MONITOR-273** — Available, unavailable, and disabled control states must be visually distinct, and every disabled control must expose its reason in a keyboard-reachable way.

### 30. Mission view

**REQ-MONITOR-274** — A mission view must present a live delegation graph and an agent activity table, with actions to open an agent, pause the selection (graceful and valid only for the run-level agent), and cancel the selection (marked destructive). Pause and cancel actions sit under the graph, and pause carries an availability explanation.

**REQ-MONITOR-275** — The mission view's strategy selector and depth control must mirror the delegation settings, and its activity table refreshes row by row under the same hidden-surface deferral as other always-alive surfaces.

**REQ-MONITOR-276** — A pause requested from the mission view for a non-run-level agent must be refused, consistent with the whole-run-only pause rule.

### 31. Agent navigation, run warnings, and quitting during a run

- **REQ-MONITOR-277** — *Withdrawn.* Its only surface was a terminal-interface list; the capability — a live list of the agents currently working, each with its name, its role, the number of tool calls it has dispatched, and the wall-clock time since it started — is carried by REQ-MONITOR-116 as amended, together with REQ-MONITOR-107 and REQ-MONITOR-111.

- **REQ-MONITOR-278** — *Withdrawn.* Its only surface was a terminal-interface key map; keyboard navigation of the delegation tree is carried by REQ-MONITOR-304.

**REQ-MONITOR-279** — Changing the selected agent re-scopes the transcript to that agent's own history and shows that agent's identity together with its ancestry path back to the run root (REQ-MONITOR-074). Text already typed in the composer must survive the change of selection.

- **REQ-MONITOR-280** — *Withdrawn.* Its only surface was a terminal-interface side panel. Each thing it displayed is carried elsewhere: the running token estimate by REQ-MONITOR-166 and REQ-MONITOR-176; tool servers with their connection status by domain 16; the granted tool list with used tools distinguished from unused by REQ-MONITOR-060; the workspace path and active model by REQ-MONITOR-176; the open todo items with their status by REQ-MONITOR-022 and REQ-MONITOR-216; and the warnings section by REQ-MONITOR-305.

**REQ-MONITOR-281** — Wherever per-agent metrics are displayed, the display must convey the agent's token count, its tool-call count, and its compression count (REQ-MONITOR-086), each labelled with its unit and each separately identifiable; the order and the wording are the implementation's.

- **REQ-MONITOR-282** — *Withdrawn.* Its only surface was a process interrupt signal delivered to a shell-driven run; the two-stage stop it described — a first request that stops the run gracefully and a second that gives up waiting — is carried by REQ-MONITOR-131 and REQ-MONITOR-283.

**REQ-MONITOR-283** — A request to quit the application while a run is executing uses the same coordinated stop path as cancellation (REQ-MONITOR-131, REQ-MONITOR-255). The interface must remain responsive, must state that stopping is under way, and must show how much of the force-exit allowance remains. A clean stop defers process exit until run and loop teardown completes. The force-exit backstop is 30 seconds from the quit request — the same allowance as the cancellation grace of REQ-MONITOR-129, so that the graceful-stop backstop and the force exit fall due together and a run that ignores the graceful stop cannot hold the application open past it. A second quit request issued while that allowance is running force-exits immediately.

**REQ-MONITOR-284** — An interrupted run persists a paused session state carrying an interruption message, and a `paused` execution status resolves to the `interrupted` terminal result (REQ-MONITOR-029, REQ-MONITOR-031).

### 32. Defaults, limits, and timeouts

**REQ-MONITOR-285** — Every runtime policy default this domain observes is fixed elsewhere, and this requirement holds no figure of its own; it names each default's owner and states only what this domain adds about how the default is observable. The delegation budgets — maximum agents per run, maximum concurrently active agents, and maximum delegation depth — are REQ-ORCH-046's, registered as configuration keys by REQ-CONFIG-112, which also registers the iteration maximum whose loop behavior is REQ-ORCH-070's. The per-agent hard timeout is REQ-ORCH-088's; what this domain adds is that its expiry is observable as the agent being terminated (REQ-MONITOR-121). The per-agent stall timeout is REQ-ORCH-089's and its per-persona override REQ-ORCH-144's; what this domain adds is that it affects only what is reported and never terminates anything. The model response timeout and its accepted minimum are REQ-ORCH-090's and REQ-ORCH-143's; what this domain adds is that its expiry is observable as the persona's fallback model being activated while the agent keeps running. The global model-call timeout, and its per-model override, are REQ-CONFIG-115's and REQ-CONFIG-086's; the foreground and background terminal-command timeouts are REQ-CONFIG-116's; the terminal stream interval, its accepted range, and the stream buffer are REQ-CONFIG-117's. A figure this domain appears to require is always the owner's figure, and a surface that shows one shows the value that owner fixes.

**REQ-MONITOR-286** — Interface-level delegation controls: the depth cap, presented as the maximum delegation depth REQ-ORCH-046 fixes; the fan-out limit, which is this interface's presentation of the configured `max_active_children` (REQ-CONFIG-112) and holds no figure of its own; and the per-agent timeout, presented in minutes, being the per-agent hard timeout REQ-ORCH-088 fixes rendered in that unit. Interface runtime toggles hold no defaults of their own: each is initialised from the runtime policy value that governs the same behavior, so a fresh installation shows the compression threshold percentage of REQ-MONITOR-080 and the iteration maximum of REQ-ORCH-070, and permission mode "ask". A toggle whose initial value disagrees with the policy value it governs is a defect.

**REQ-MONITOR-287** — This domain fixes no cadence for polling a session's own state. The two it used to fix are withdrawn with REQ-MONITOR-288 and nothing timed replaces them: live state reaches a surface only by being published to it (REQ-MONITOR-214, REQ-MONITOR-216). The timing constants it does fix, each of which must hold, are: growth publication tick 50 ms; final refresh 3 retries at 100 ms; worker join cap 5 s on restart and unbounded at shutdown; live-row repaint about 1 s; verification clock 1 s; visibility budget 250 ms at the 95th percentile; force-exit backstop 30 s after a quit request made during a run, the same figure as the cancellation grace (REQ-MONITOR-131, REQ-MONITOR-283); per-provider subscription-limit fetch timeout 5 s with a fixed settling overhead of at most 1 s (REQ-MONITOR-182); token-history sample interval 10 s (REQ-MONITOR-166); cloud-credit refresh timer 120 s. Two further figures a surface of this domain observes are fixed elsewhere and are not restated here: the cancellation grace after which a graceful stop becomes a hard cancel is REQ-SESSION-092's, and the quota backoff base and its cap are REQ-ORCH-091's. A third is gone rather than moved: there is no persistence delay to observe, because a save is durable when it is requested (REQ-SESSION-067, REQ-MONITOR-239), and the no-polling rule that stood beside it remains REQ-SESSION-071's with no exception — including the export of REQ-SESSION-199, which is a user-initiated action and never a cadence. One figure this domain does fix is deliberately absent from the list above, because it bounds a rate rather than setting a cadence: the aggregate rate at which live terminal output may reach surfaces is REQ-MONITOR-306's, and this requirement holds no copy of it.

- **REQ-MONITOR-288** — *Withdrawn.* It fixed a poll cadence for each of two cases and the switch between them, and neither case survives. No session executes where this application can only poll for its state (REQ-MONITOR-243, REQ-MONITOR-244), so the foreign cadence has nothing left to observe. The reconcile cadence — re-reading a live run's persisted state on a timer to catch a publication a surface might have missed — is replaced by something strictly stronger and untimed: every publication carries a per-session sequence number (REQ-MONITOR-214), and a gap in it obliges the surface to reconcile from a whole read at once (REQ-MONITOR-226). What that cadence was protecting is therefore kept and improved on — a lost update is caught on the very next publication instead of up to 2000 ms later, and can no longer diverge a display silently — while a session with nothing happening does no periodic work at all (REQ-MONITOR-223).

**REQ-MONITOR-289** — A repetition circuit breaker stops a run that has stopped making progress. When it trips, the run ends with a terminal result and a stated reason naming repetition — the stop reason `repetition_detected` of REQ-MONITOR-301 — never as an ordinary completion. Its limits are not this domain's: whether it is enabled, the raw tool-call and message counts from which a run is assessed, the number of repetitions of one action and the number of traversals of one cycle that trip it are all fixed by REQ-ORCH-100, and the order in which those triggers are evaluated, together with when two actions count as the same action, is fixed by REQ-ORCH-101. This domain holds no copy of any of those figures and states no second rule for sameness. What it adds is that the trip is externally checkable from the run's own records, and that a steering prompt delivered to an agent counts as a new user instruction and not as a repetition (REQ-MONITOR-134).

**REQ-MONITOR-290** — A malformed-request failure reported by a model provider is retried after condensing the request, at most 2 times, so at most 3 attempts are made in total. If the last attempt also fails, the failure is surfaced through the ordinary failure path (REQ-MONITOR-190) and is not retried again.

### 33. Cross-cutting invariants

**REQ-MONITOR-291** — Unless its status claims a live run, a session must never present a live agent, no matter what its persisted record contains. Exactly one definition of which statuses claim a live run may exist — REQ-SESSION-055, over the vocabulary of REQ-SESSION-073 — and every surface must reuse that definition rather than restate it.

**REQ-MONITOR-292** — The live view must never contradict what resuming the session would restore; wherever the two could disagree, the persisted record is authoritative and the view must catch up to it. It catches up by reconciling from a whole read the moment a sequence gap tells it an update was lost (REQ-MONITOR-214, REQ-MONITOR-226), and never by re-reading persisted state on a timer (REQ-SESSION-071).

**REQ-MONITOR-293** — A view consumer that is slow, broken, or missing may degrade only the view. It must never fail, stall, or alter the run. This must hold at every delivery point: incremental transcript delivery, whole-state delivery, stall callbacks, verification skip, and the event stream.

**REQ-MONITOR-294** — Coalescing is allowed as long as the visibility budget is still met; dropping data is not. Anything written into the durable record must remain retrievable by the view.

**REQ-MONITOR-295** — Controls must tell the truth: a control that cannot act is disabled and states why; writable model and reasoning controls exist only where the backend consumes the write; a mode-change confirmation is never broader than what happened; unavailable models are listed with reasons rather than hidden; and a refused control call surfaces as explicit feedback rather than a silent no-op.

**REQ-MONITOR-296** — Optimistic interface updates must always be paired with rollback on refusal (cancel restores the running state; pause sets the pausing state only after the backend accepted), and must eventually be overwritten by the authoritative final read.

**REQ-MONITOR-297** — State dots pulse only while the state they represent is actually running, and only on surfaces that are visible; animation must stop when a surface is hidden.

**REQ-MONITOR-298** — State must never be conveyed by color alone: dots are paired with words, and credit states are conveyed by text and shape.

---

## Data & Formats

### What a run leaves behind (externally observable)

Where a session's record is held, and which parts of it remain files, is fixed by REQ-SESSION-001, REQ-SESSION-002 and REQ-SESSION-198; this document holds no copy of that and names no path. Listed below are only the record kinds a monitoring surface reads, so that the parity test of REQ-MONITOR-299 has a named set to compare. The test compares kinds, not directory entries: a run that nothing watched must leave every kind a watched run leaves.

- **The listing record** — the only thing a session listing reads (REQ-MONITOR-235), never observed part-way through a save (REQ-SESSION-028).
- **The resumable state** — what reopening a session restores it from (REQ-SESSION-037, REQ-SESSION-196).
- **The transcript rows** — the user-facing transcript, recorded as the run goes and equal to what the user watched (REQ-MONITOR-242, REQ-MONITOR-248).
- **The event history** — recorded in emission order, never rewritten, readable from an arbitrary recorded position (REQ-MONITOR-237).
- **The produced artifacts** — identity, ownership and ordering held in the record; bodies held as files (REQ-SESSION-002).
- **The per-session log** — a file, at the configured level (REQ-MONITOR-238, REQ-SESSION-142).

### Listing-record keys

The key set is fixed by REQ-SESSION-030, together with the reader defaults for a record written by an older version; this document holds no copy of it. What the key set means to a listing this domain shows: `awaiting_input` is true exactly when the session has pending approvals or pending questions (REQ-SESSION-031); sessions sort by `updated_at` descending; a listing record that cannot be interpreted is skipped, never fatal; and the schema version and the refusal of a newer one are REQ-SESSION-013's and REQ-SESSION-038's.

### Status vocabularies

- Execution status (persisted), and which of its values claim a live run: REQ-SESSION-073 and REQ-SESSION-055. This document holds no copy of either set (REQ-MONITOR-024).
- Agent state: `queued`, `starting`, `running`, `summarizing`, `waiting_on_dependencies`, `waiting_on_model_slot`, `succeeded`, `failed`, `cancelled`, `blocked`; terminal subset `succeeded`, `failed`, `cancelled`, `blocked` (REQ-MONITOR-014). Legal transitions: REQ-MONITOR-300.
- Presentation run state, and the normalisation of a persisted status into it: REQ-NOTIFY-048, REQ-NOTIFY-049, REQ-NOTIFY-050. This document holds no copy of that vocabulary (REQ-MONITOR-025); the quota wait presents distinctly per REQ-NOTIFY-263 and REQ-MONITOR-303.
- Presentation agent state: `running`, `waiting`, `queued`, `done`, `failed`, `cancelled`; the mapping from an engine state onto one of them is REQ-MONITOR-046's.
- Stop reason: `tasks_complete`, `no_pending_tasks`, `user_cancelled`, `application_shutdown`, `message_limit_reached`, `iteration_limit_reached`, `time_limit_reached`, `repetition_detected`, `agent_session_aborted` (REQ-MONITOR-301). The set is closed and its mapping to a terminal result is total.
- Terminal run result: the closed set of REQ-ORCH-083. This document holds no copy of it (REQ-MONITOR-028); a value outside it raises rather than being presented. No process exit code is derived from it — the product exposes none.

### Control result shape

A control call answers with a boolean outcome plus an optional string. The string is non-empty for exactly the two prompt-creating operations — queued-prompt creation and steering-prompt submission — where it is the new prompt id, and is absent otherwise and on every false outcome. A false outcome always means "the request was not performed", never "nothing happened, try again silently".

### Agent record (as visible to monitoring)

Name, canonical name, persona, task description, dependencies, inherited context, state, spawned-at, completed-at (UTC, stamped on entering a terminal state), parent agent id, depth (default 1), conversation id, category (`quick` / `deep` / `planning` / `research`), session id, background flag, task id, launch generation, produced artifact ids, received artifact ids, resolved model key, granted native tools, granted MCP tools per server, todo state.

### Background-agent completion notification

Task id, canonical name, description, terminal state, duration in seconds, count of background agents still running, produced artifact ids.

### Verification state

An active flag, the current check name, its command, its index, the total number of checks, the start time, and a deadline expressed as a duration in whole seconds from that start time (never an absolute instant; on expiry the check ends with outcome `timeout`, REQ-MONITOR-155). Present only while a suite runs, absent otherwise. Absent means "not verifying", never "nothing was verified". Position renders as `<check-name> (<index>/<total>)`. A separate gate warning persists across the suite lifecycle and reports that no quality gate was present.

### Quota wait state

The waiting agent, the message, the model, the wait duration in seconds, and whether automatic resume is allowed. Present while the execution status is `waiting`, cleared on resume or stop.

### Notice shape

A severity, a title, a message, detail text, a persistence flag, an optional action label and action identifier, and the owning session id. Details remain copyable. Persistent notices bound to another session survive the next run start.

### Live update payloads

- Sequence number: every publication on either channel carries one, from a single per-session counter starting at 1 and raised by exactly one per publication (REQ-MONITOR-214). A consumer that receives any number other than the one it expected has missed a publication and reconciles from a whole read at once (REQ-MONITOR-226). Nothing is polled to discover a loss.
- Incremental transcript update: the sequence number, the lowest row index whose content may still change, the rows from that index onward, any newly recorded diffs, and the persona set. Rows are deep-copied at the boundary. An index of 0 after a transcript clear means "start over".
- Whole-session update: the sequence number, plus the session record with unbounded collections emptied (transcript rows, edit diffs, report artifacts, checkpoints, seen-compression ids) and bounded collections deep-copied (agent states, run todos, per-agent todos, pending approvals, pending questions, verification state, quota wait state, queued follow-up prompts, token usage, token-history samples, agent metrics).
- Background-run summary: session id, execution status, and branch only.

### Transcript row annotations

Tool rows carry a status from the four-value vocabulary of REQ-MONITOR-105 plus a duration. Verification outcomes reach a row status through the total mapping of REQ-NOTIFY-142, over the closed check-outcome set of REQ-ORCH-123; neither is copied here (REQ-MONITOR-106). A tool row still `running` when the run reaches a terminal state settles to `blocked` (REQ-MONITOR-228). Trailing approval and question rows are derived from current pending state, always sit after all recorded rows, and read as an approval-needed line naming the command or tool, and a step-count line naming the first question title.

### Display formats

- Inspector meta line: `{state} · {elapsed or —} · {N} tool calls`.
- Context reading: `{used:,} / {limit:,}`, with an em-dash replacing a zero used value.
- Context caption: names the panel as the agent's own context window and states the compression threshold percentage.
- Per-agent metric display: token count, call count, and compression count, each labelled with its unit and each separately identifiable; order and wording are the implementation's (REQ-MONITOR-281).
- Overview session label: `session {name} · {status} · {runtime}`.
- Agent card caption: `depth {d} / {cap} · fan-out {n} / {limit}`, with a detail line of running / waiting / done / failed counts.
- Status strip token reading: `{tokens:,} tok`; credit chip: `{balance} credit` with an added warning marker when spending is blocked.
- Tree prefixes: `├─ `, `└─ `, with `│  ` and three-space continuations; roots have no prefix.

---

## Open Questions

None outstanding. Every open question raised in the draft was resolved; see [`resolutions/02-run-monitoring-steering.md`](resolutions/02-run-monitoring-steering.md).
