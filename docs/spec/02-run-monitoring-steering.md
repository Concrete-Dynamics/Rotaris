---
reference: ROTARIS-CRW-001
domain: run-monitoring-steering
date: 2026-08-29
status: draft
---

# Run Monitoring and Steering

## Overview

While a task run is executing, a user must be able to watch what every agent is doing and change what the run does without stopping it. Observable surfaces show run state, the delegation tree of agents, each agent's context-window pressure, tool activity, elapsed times, verification progress, provider quota and credit standing, and queued follow-up work; observable controls let a person steer a live agent, queue follow-ups, switch the run's model, reasoning level or permission mode, force context compression, skip a verification check, pause, or cancel. Every control either takes effect with stated timing or refuses with a visible reason, every displayed state matches what a later resume of the same session would restore, and no view failure, slow consumer, or unreadable snapshot may change or stall the run itself.

---

## Requirements

### 1. Run lifecycle and host parity

**REQ-MONITOR-001** — One task description, run once from the graphical application and once from the command line, must be indistinguishable in its observable outcome: the two runs create the same set of per-session files and directories (§ Data & Formats), emit the same lifecycle event kinds in the same order (the eight kinds of REQ-MONITOR-198), settle on the same persisted execution status, and produce the same terminal run result and the same process exit code. A conformance test compares the two event sequences kind by kind and the two session directories entry by entry.

**REQ-MONITOR-002** — Each supported way of starting a run — a prompt-driven run, a requirement-driven run, and a worktree-integration run — must emit every lifecycle event kind of REQ-MONITOR-198 that applies to how that run ended. Driven to the same outcome, any two start paths must yield the same ordered sequence of event kinds; a start path that omits a kind another path emits is a defect.

**REQ-MONITOR-003** — A lifecycle rule belongs to the run, not to a host. For one task driven to one outcome, the graphical application, the terminal interface, and a headless command-line invocation must each expose the same lifecycle event kinds, in the same order, carrying the same per-event content. A rule that can be observed on one host and not on another is a defect, whichever host is missing it.

### 2. Control surface and refusal semantics

**REQ-MONITOR-004** — A host must be able to ask a live run to perform exactly the following operations, and no others: resolve an approval request with a chosen option; answer a pending question set; cancel a pending question set; steer a named agent with text; queue a follow-up prompt for the current run; edit a queued prompt; delete a queued prompt; edit a todo item (add/update/remove semantics with a target id and text); switch the run's entry model; switch the run's entry reasoning level; set the permission mode; force context compression; clear the transcript; cancel a single agent; skip the verification check currently in flight; pause; cancel the run; announce host shutdown; send keystrokes to a terminal stream; resize a terminal stream; interrupt a terminal stream; kill a terminal stream.

**REQ-MONITOR-005** — Every control request must return a result carrying a boolean outcome and an optional string value. The string value is populated only for queued-prompt creation, where it carries the new prompt's identifier.

**REQ-MONITOR-006** — A `false` outcome states that the requested operation did not happen: the run has ended, the request timed out, or the named target does not exist. On `false`, the requesting surface must (a) display feedback naming the refusal, and (b) leave the user-visible state exactly as it was before the request, rolling back any optimistic change it had already applied (REQ-MONITOR-296). Showing the operation as successful, or producing no feedback at all, is not acceptable.

**REQ-MONITOR-007** — When a run is no longer in a position to honor a request, the control must answer `false` rather than raise or crash; requests issued concurrently from multiple threads must all be handled safely.

**REQ-MONITOR-008** — Given a control request whose required argument is empty (agent id, text, model key, reasoning level, mode, or prompt id), the request must be refused before it reaches the run.

**REQ-MONITOR-009** — Given a request to cancel the agent using the reserved identifier that denotes the run itself, the request must be treated as a full run cancellation.

**REQ-MONITOR-010** — Given an approval resolution naming an option that is not a recognized approval option, the request must be refused.

**REQ-MONITOR-011** — Given no live run (the run has finished or was never started), every control request must be refused rather than queued or silently dropped.

**REQ-MONITOR-012** — Cancellation must first release anything blocked on a person — pending questions, then pending approvals — and only then stop the run, so that teardown never happens while the run is still parked on an answer that will never arrive.

**REQ-MONITOR-013** — Every operation of REQ-MONITOR-004 must be issuable against a run executing in a different process from the surface that issues it, with the same arguments, the same result shape, and the same acceptance and refusal semantics as against a run in the same process. Control arguments are therefore limited to text, numbers, booleans, and simple collections of those, so that a request survives a process boundary without losing meaning.

### 3. Agent (child task) lifecycle

**REQ-MONITOR-014** — A delegated agent occupies exactly one of these states at a time: `queued`, `starting`, `running`, `summarizing`, `waiting_on_dependencies`, `waiting_on_model_slot`, `succeeded`, `failed`, `cancelled`, `blocked`. `succeeded`, `failed`, `cancelled`, and `blocked` are terminal; the remaining six are not. `summarizing` is a state of the agent itself and not a display decoration: it is counted by the per-model cap (REQ-MONITOR-020) and mapped like any other engine state (REQ-MONITOR-046).

**REQ-MONITOR-015** — An agent counts against the concurrent-agent budget only when it is neither terminal nor waiting for a model slot; an agent parked for a model slot must not consume the active-agent allowance.

**REQ-MONITOR-016** — An agent reaches a new state only through a transition the legal-transition table permits. An attempt to move an agent into a state not reachable from its current one must be rejected with an error whose text names the state the agent is in and the state that was asked for, and must leave the record untouched: same state, no completion timestamp, and no state-change event delivered to any surface. The complete transition table is not yet written down — see Open Questions.

**REQ-MONITOR-017** — When an agent enters any terminal state, a completion timestamp in UTC must be stamped on its record and be visible to monitoring surfaces.

**REQ-MONITOR-018** — An agent that has finished its work but has not yet published its closing report occupies `summarizing` until the report exists, and then moves to a terminal state. An agent that has already published an authored artifact goes from `running` directly to its terminal state and never enters `summarizing`. To a user, an agent in `summarizing` reads as still running (REQ-MONITOR-046).

**REQ-MONITOR-019** — An agent in `waiting_on_dependencies` moves to `queued` once every one of its declared dependencies has ended in `succeeded`; a single dependency succeeding while others are outstanding does not release it. It moves to `blocked` as soon as any one of its dependencies ends in `failed`, `cancelled`, or `blocked`, without waiting for the remaining dependencies to settle. Both are legal transitions for the purposes of REQ-MONITOR-016.

**REQ-MONITOR-020** — Given a delegation targeting a model already at its per-model parallelism cap, the agent must be enqueued into `waiting_on_model_slot` rather than rejected. Once another agent using that model finishes, whatever its terminal state, the freed slot must promote exactly one waiting agent to `queued` for the next scheduling cycle. Only running and summarizing agents count against the per-model cap.

**REQ-MONITOR-021** — Per-model parallelism is unbounded unless a cap is configured for that model. A provider whose quota is consumed by concurrent calls against one account carries an automatic cap of 2 or 3 concurrent calls per model, applied without the user configuring anything, so that concurrency alone cannot exhaust a shared quota. A cap the user configures for a model replaces the automatic one. Which providers carry an automatic cap, and whether each is 2 or 3, is not settled — see Open Questions.

**REQ-MONITOR-022** — Every agent's persisted record must expose, to monitoring surfaces, at least: display name, canonical name, persona, task description, dependency list, inherited context, state, spawn timestamp, completion timestamp, parent agent id, depth (default 1), conversation id, category, session id, background flag, task id, launch generation, produced artifact ids, received artifact ids, the resolved model key recorded at spawn (absent for synthetic agents), the native tools actually granted after policy narrowing, the granted MCP tools listed under their owning server, and the agent's live todo list.

**REQ-MONITOR-023** — When a background agent reaches a terminal state, a completion notification must be emitted carrying its task id, canonical name, description, terminal state, duration in seconds, the number of background agents still running, and the ids of artifacts it produced.

### 4. Run-level status and terminal result

**REQ-MONITOR-024** — A session's execution status starts as `idle`. Exactly these statuses claim a live run: `starting`, `running`, `background`, `pausing`, and `cancelling`. A session repaired after an abnormal exit becomes `interrupted`. Terminal statuses are `completed`, `failed`, `paused`, `paused_message_limit`, and `cancelled`; `waiting` denotes a run parked on a provider quota wait.

**REQ-MONITOR-025** — The user-facing run state is exactly one of: idle, starting, running, pausing, paused, completed, failed, cancelling, cancelled; of these, starting, running, pausing, and cancelling form the busy set. Persisted execution statuses (REQ-MONITOR-024), together with the aliases hosts may receive, map as follows: idle→idle; starting→starting; running, background, and attached→running; pausing→pausing; paused and paused_message_limit→paused; cancelling→cancelling; cancelled→cancelled; completed, succeeded, and done→completed; failed and error→failed. A status not covered by that mapping is presented as idle. How `waiting` and `interrupted` should be presented is unresolved — see Open Questions.

**REQ-MONITOR-026** — The run header carries one state label per user-facing run state, and no two states may share a label. Four labels are fixed strings: idle → "Ready"; paused → "Paused"; completed → "Completed"; cancelled → "Cancelled". The other five must each be non-empty and must carry this information: starting says the run is starting; running says the run is executing; pausing says the run will stop once the step in flight finishes; failed says the run failed; cancelling says cancellation is under way. The exact wording of those five is not settled — see Open Questions.

**REQ-MONITOR-027** — Given a session that claims a busy status but has no run executing in this process, and that names a known session, the header must instead state that the run needs recovery.

**REQ-MONITOR-028** — A run's machine-facing terminal result is one of `completed`, `failed`, `max_iterations`, `interrupted`, `error`. Each carries one fixed process exit code: `completed`→0; `failed`→1; `error`→1; `max_iterations`→2; `interrupted`→130. The mapping is defined for those five values and for nothing else: a value outside the set must raise rather than yield a guessed exit code. This constrains only the step from terminal result to exit code; deriving the terminal result in the first place must always succeed and never raise (REQ-MONITOR-031, REQ-MONITOR-032).

**REQ-MONITOR-029** — The terminal result maps into session vocabulary as: interrupted→paused; failed or error→failed; iteration-limit→max_iterations; otherwise completed.

**REQ-MONITOR-030** — Every stop reason a run can record falls into exactly one of three classes, which determine the terminal result: a stop attributable to a person — cancellation asked for mid-run, or the choice to stop when the message-count limit was reached — yields `interrupted`; an aborted agent session yields `failed`, whatever proportion of the work had already completed; reaching the iteration limit yields `max_iterations`. The canonical set of stop-reason values is not enumerated anywhere in this specification — see Open Questions.

**REQ-MONITOR-031** — Given a run with no progress record, the terminal result is derived from the execution status, and only `completed`, `failed`, `paused`, and `paused_message_limit` may produce a definite outcome. Any other status, or an unrecognized summarized status, must produce `error` with wording stating that the outcome is unknown. A run must never be silently reported as completed.

**REQ-MONITOR-032** — Terminal-result construction must never raise; every input, including malformed or missing records, must yield a result object.

**REQ-MONITOR-033** — Given a run that fails before it reports having started (for example a refused sandbox or an unobtainable session lock), the failure must be reported immediately without waiting for a final session snapshot that does not exist. Such pre-start diagnostics are marked with a leading `Error: ` prefix, which doubles as the failed-before-start marker.

**REQ-MONITOR-034** — The run's iteration loop stops as soon as any of these holds: an external abort was requested; every non-abandoned task is complete; the iteration count reached the configured maximum (default 20, REQ-MONITOR-285); the elapsed wall-clock time reached the configured maximum, which has no default and therefore imposes no limit unless one is configured; or no pending tasks remain. The two completion-based conditions do not stop the loop while queued prompts are still waiting to be consumed (REQ-MONITOR-035) or while the configured keep-going criterion is unmet. Two facts here are unresolved: the iteration default conflicts with the interface toggle default of 25 (REQ-MONITOR-286), and the keep-going criterion is named but never defined — see Open Questions.

**REQ-MONITOR-035** — Queued prompts that override completion are injected as a new todo phase named for queued prompts, with one task per prompt, and each prompt is marked as triggered exactly once.

### 5. Delegation tree presentation

**REQ-MONITOR-036** — The agent tree is a depth-first list of rows, each carrying the agent, a box-drawing prefix, and a depth. Prefixes use `├─ ` and `└─ ` with `│  ` and three-space continuations; root rows have an empty prefix and depth 0.

**REQ-MONITOR-037** — An agent whose recorded parent is the run itself, or whose recorded parent id is unknown, must render as a root row rather than being dropped.

**REQ-MONITOR-038** — Several delegation-tree surfaces (workspace sidebar, overview dashboard, mission view) may be visible at the same time. Whenever more than one is visible, each must show the same agent set in the same states; no visible surface may trail another by more than the 250 ms visibility budget. A refresh of a tree holding the maximum supported agent count (20, REQ-MONITOR-285) must complete inside that same budget, and the time a refresh takes must not increase with how long the run has been going or with how many transcript rows the session holds.

**REQ-MONITOR-039** — A tree surface that is not visible must defer its refresh until it is shown, and must then catch up to current state.

**REQ-MONITOR-040** — Each tree row shows: the branch prefix in a monospaced face; a state-colored status dot that pulses while the agent is live; the persona display name (brighter while live); the agent's task name beneath it; and, where meta is enabled, a meta label showing elapsed time if known, otherwise the state value.

**REQ-MONITOR-041** — A tree row's tooltip carries the first of these that exists: the agent's full delegation task, its current activity text, its name. Row content never changes the panel's width: a name that does not fit is elided with a visible truncation marker and remains readable in full through the tooltip.

**REQ-MONITOR-042** — Clicking a tree row selects that agent and notifies all surfaces of the selection; the selected row must be visually distinguished.

**REQ-MONITOR-043** — Rows for task agents put the persona first, with the task title on the line below. The run's synthetic root is neither rendered as a task agent nor selectable in the tree; run-level control lives in a dedicated run header instead.

**REQ-MONITOR-044** — Each agent as presented to views carries: id, name, persona, presentation state (running / waiting / queued / done / failed / cancelled), parent id, dependencies, activity text, model, reasoning level (default "medium"), context tokens used, context limit (default 128,000 where the model's own capacity is unknown, per REQ-MONITOR-049; this default conflicts with the compression capacity default of REQ-MONITOR-080 — see Open Questions), tool-call count, elapsed string, granted tools, granted MCP tools per server, previously called tool names, currently active tool names, artifacts (name, producer, ready flag), produced and received artifact ids, category, background flag, delegation task, delegation session id, and inherited context.

**REQ-MONITOR-045** — Context percentage is the used-tokens fraction of the limit, rounded to a whole percent, and is 0 when the limit is zero or negative. An agent is "live" exactly when its presentation state is running.

**REQ-MONITOR-046** — Engine agent states map to presentation states as: succeeded→done; running→running; summarizing→running; waiting_on_dependencies→waiting; waiting_on_model_slot→waiting; failed→failed; cancelled→cancelled; blocked→failed; anything else→queued.

**REQ-MONITOR-047** — An agent's activity text is its delegation task description truncated to the first 180 characters.

**REQ-MONITOR-048** — An agent's displayed model is the model recorded at spawn, or where none was recorded, the persona's configured model, and must always be rendered as a human-facing model name — never an internal synthetic configuration key. Reasoning level is the persona's configured thinking level, defaulting to "medium".

**REQ-MONITOR-049** — Context used is the agent's most recent recorded prompt-token reading; the context limit is the model's maximum input tokens, defaulting to 128,000 when unknown. Tool-call count and per-tool history come from the agent's recorded metrics; active tool names come from the live snapshot; the tool list is the granted tool set, and where no grant was recorded, the persona's declared tools stand in.

### 6. Per-agent inspector

**REQ-MONITOR-050** — The inspector groups agents by persona with one tab per configured persona; selecting an agent anywhere selects that persona's tab and shows that instance.

**REQ-MONITOR-051** — Below a viewport width of 1180 px, choosing an agent opens the inspector as an overlay drawer that is mutually exclusive with the agents/todos drawer. The workspace must remain usable down to 1000×680.

**REQ-MONITOR-052** — The inspector for an agent shows: a state-colored status dot that pulses while live; the agent name; a meta line of the form `{state} · {elapsed or em-dash} · {N} tool calls`; a context ring showing used against limit with the compression threshold marked; a caption naming it the context window and stating the compression threshold percentage; a model selector; a reasoning selector offering low / medium / high; a scope note; tool chips; artifact links; a cascade note; and Steer, Cancel, and Pop out actions.

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

**REQ-MONITOR-064** — When the shown agent has live (running, waiting, or queued) descendants, a cascade note states that cancelling cascades to that number of descendants; otherwise the note is empty.

**REQ-MONITOR-065** — The inspector's context meter must be labeled as one agent's own context window, never as a session-wide usage figure. An unknown or idle agent shows an empty ring (zero used against a nominal limit) with the threshold still marked.

**REQ-MONITOR-066** — Given an agent whose model has since disappeared from the catalog, the model selector must still name that model as its current value rather than showing a wrong or blank one.

**REQ-MONITOR-067** — Model pickers list models the provider currently withholds, annotated with the provider's reason, instead of dropping them from the list.

### 7. Per-persona agent windows

**REQ-MONITOR-068** — A pop-out window exists per persona, titled with the product name and the persona, sized 820×620 by default, with a header summarizing the number of instances, one tab per agent instance of that persona (tab tooltip `{state} · {activity}`), and a persona-wide artifacts card listing artifacts from all instances with an explicit empty state.

**REQ-MONITOR-069** — Each instance tab shows: status dot, agent name in the persona color, and state; an agent-scoped transcript card with an explicit empty state; a context card with a ring and a line of the form `{N} tool calls · {elapsed or hyphen}`; an instance-controls card with read-only model and reasoning values; a current-activity card rendering the activity text as Markdown with an explicit empty state; a tools-and-artifacts card listing available tools (the same resolved set the inspector shows), one line per MCP server, the currently active tools, and artifact links; and a steer card.

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

**REQ-MONITOR-080** — Compression is configured independently of the models the run itself uses, and its defaults are: compression timeout 120 seconds; default context capacity 265,000 tokens; threshold percentage 60, accepted range 1..100 inclusive, with a value outside that range rejected rather than clamped; token estimation ratio 4 characters per token; and the 4 most recent conversation turns preserved uncompressed. Which model compression uses when none is configured is not settled — see Open Questions.

**REQ-MONITOR-081** — The trigger's token count prefers the real last-prompt token count reported by the model provider; when the history has already been condensed, or no real count is available, the count is estimated from character length at the configured characters-per-token ratio. The chosen threshold and the source of the count must be recorded in diagnostics.

**REQ-MONITOR-082** — Three things survive compression character for character: the system prompt, the tool definitions, and the user's original request. None of the three is included in what is sent to the compressing model. Only the action history recorded after the original request is compressed, and the summary it produces must state the work performed, the findings reached, and the questions left open.

**REQ-MONITOR-083** — Compression output is bounded at 300 lines. The preserved original request is exempt from that bound and is never truncated to fit: where the request alone exceeds 300 lines, the bound rises to hold the request in full. Whether the 300-line bound covers the whole reconstructed context or only the generated summary is unresolved — see Open Questions.

**REQ-MONITOR-084** — After compression the agent's context holds exactly these parts, and nothing else from the pre-compression history: the system prompt and tool definitions; the user's original request; the compression summary; the agent's todo items, carried across one for one and placed after the summary; and the configured number of most recent conversation turns, preserved verbatim (REQ-MONITOR-080). Where the preserved recent turns sit relative to the todos is unresolved — see Open Questions.

**REQ-MONITOR-085** — Compression must never block the user interface. While it runs, a status stating that compression is running must be visible, and the added latency must be recorded in diagnostics.

**REQ-MONITOR-086** — Each compression completion raises the compressing agent's compression count by exactly one. A completion already counted must never be counted a second time, including after the session is resumed or the recorded event stream is read again. The per-agent count belongs to the persisted per-agent metrics (REQ-MONITOR-102) and is displayed per agent (REQ-MONITOR-281); a run-wide count, equal to the sum of the per-agent counts, is readable at any time during and after the run.

**REQ-MONITOR-087** — Context meters must warn before the threshold: the fill turns to a warning color at 75% of the threshold and to a failure color at or above the threshold. The threshold position is drawn as a tick on the track, and the fill is notched at that tick once the threshold has been passed. When no threshold is supplied, meters assume 80%.

**REQ-MONITOR-088** — The overview's context card has a header caption naming the compression threshold percentage and one row per agent that has used context or is live: state dot, fixed-width name, a bar filled to the agent's context percentage with the threshold marked, and a monospaced `used / limit` pair with thousands separators. An agent with zero used tokens shows an em-dash in place of the used figure. The card has an explicit empty state explaining that context use appears once agents begin working.

**REQ-MONITOR-089** — After every model turn the agent's latest prompt-token reading is recorded and persisted, and the run's synthetic root agent exposes the newest such reading so that root-level surfaces have a context figure to show. The recorded value is always the latest measurement and never a high-water mark: after a compression an agent's reading must fall, and every meter reading that agent's context must show the fall (REQ-MONITOR-049, REQ-MONITOR-088).

### 10. Manual compression

**REQ-MONITOR-090** — The run header offers a manual compress action described as compressing the context of every agent whose conversation is still live. It is enabled only while a run is executing locally in run state `running`; at any other time it stays visible but disabled, states as its reason that no run is active, and — if invoked anyway through a command or a keyboard path — reports that same reason instead of acting (REQ-MONITOR-271).

**REQ-MONITOR-091** — Given no agent conversations are currently active, when manual compression is requested, then it is refused and a message states that there is nothing to compress because no agent context is active.

**REQ-MONITOR-092** — Given at least one live agent conversation, manual compression compresses every one of them concurrently and reports only once all of them have settled. It reads neither the threshold percentage nor the computed token threshold — a manual request compresses however empty a context is — while the preserved-recent-turns count and the characters-per-token ratio apply exactly as they do to automatic compression (REQ-MONITOR-080).

**REQ-MONITOR-093** — While manual compression runs, the action is disabled and reads as in-progress, and a transient message states that active agent contexts are being compressed.

**REQ-MONITOR-094** — On completion the action is restored, and a message reports the number of agents whose context was compressed. Given partial failure, a persistent error notice titled for incomplete compression must list each failing agent with its reason, and the details must remain copyable.

**REQ-MONITOR-095** — A `compress` command must exist in the terminal interface, whose help text states that it compresses the context of every running agent, taking no arguments, matched case-insensitively, and offered in autocomplete. It compresses, concurrently, every agent that is not terminal and still holds a live conversation — the same set the run header's action covers (REQ-MONITOR-090) — and reports: an informational start message naming the agent count; an informational completion message naming the agent count; a warning when no agents are running; and an error per failing agent naming the agent and a short reason.

**REQ-MONITOR-096** — The compress command must never read or mutate threshold configuration, persisted session state, or configuration files, and must be safe to invoke with no session active (it reports rather than crashing).

**REQ-MONITOR-097** — A `compress` command must also exist in the graphical application's command palette, available only while a run is executing; otherwise it is refused with a reason stating that no run is active.

### 11. Tool-call counting and history

**REQ-MONITOR-098** — Run-wide and per-agent totals are readable at any moment of a run and cover token totals, cost totals, per-tool-name call counts, compression counts, and the last prompt-token reading. Three properties must hold however many agents are updating them and however many surfaces are reading them: a run-wide total always equals the sum of the matching per-agent values; reading a total twice with no activity in between returns the same number; and a tool-call total never decreases within a run. Resuming a session restores every total to the value it held, and resetting a run's counters returns them all to zero.

**REQ-MONITOR-099** — Tool activity events update persisted global and per-agent counters immediately, so counts are visible during the run and not only at its end.

**REQ-MONITOR-100** — Given a replayed event carrying an agent and tool-call identifier already counted, the counters must not be inflated.

**REQ-MONITOR-101** — Each agent node exposes its live tool-call count and the set of tool names it has called; the synthetic root node exposes the aggregate run count and the aggregate called-tool history.

**REQ-MONITOR-102** — Per-agent metrics are persisted with the session and comprise: tool-call count, per-tool-name counts, token usage, cost, compression count, and last prompt tokens. A session-wide total tool-call count is also persisted, and displayed totals are read from persisted state rather than from in-memory counters.

**REQ-MONITOR-103** — Tallying tool rows from a conversation transcript is idempotent: reading the same transcript again, whole or in part, must leave every tool-call total exactly as it was. A row may contribute to a total at most once, whatever a reader's position in the transcript.

**REQ-MONITOR-104** — Each agent's in-flight tool calls are tracked and surfaced as active chips. When an agent reaches a terminal state, or is settled by the run ending, its active chips must be cleared so a stale in-progress indicator cannot persist.

**REQ-MONITOR-105** — Tool rows in the transcript carry a machine-readable status of `running`, `ok`, `failed`, or `blocked`, plus a duration. A running tool renders as a pulsing in-progress row; a finished tool renders its outcome and elapsed inline (for example an `ok` outcome with a seconds figure).

**REQ-MONITOR-106** — Verification rows map outcomes to row status as: passed→ok; failed→failed; timeout→failed; skipped→blocked. A skipped check is deliberately `blocked`, never a passing row, because nothing was verified.

### 12. Elapsed time

**REQ-MONITOR-107** — The terminal interface shows each agent's elapsed wall-clock time, measured from its spawn timestamp, advancing at least once per second while the agent is live, and fixed at the difference between its completion and spawn timestamps once it is terminal. An agent row reads, in order: persona, run marker, agent name, state, elapsed time, tool-call count.

**REQ-MONITOR-108** — Live elapsed clocks — on the verification row and header, on reasoning rows, and on running tool rows — advance from a recorded start timestamp on each display tick. A tick must not alter the recorded row, must not write session state, and must not cause a transcript publication: a session whose only activity is clocks ticking produces no new persisted data and no update traffic.

**REQ-MONITOR-109** — A reasoning row shows elapsed seconds and an approximate token figure obtained by dividing every reasoning character received by the configured characters-per-token ratio (default 4, REQ-MONITOR-080), including characters the row does not display. When the reasoning burst ends, a final duration is stamped on the row and both figures stop changing. How much reasoning text a row displays before eliding is not specified — see Open Questions.

**REQ-MONITOR-110** — A one-second repaint tick (REQ-MONITOR-287) runs exactly while at least one live reasoning row or running tool row is displayed. With no such row present, no repaint occurs and the surface performs no periodic work at all.

**REQ-MONITOR-111** — Per-agent elapsed wall-clock time must be shown in the agent tree meta and the inspector meta during a live run; where an elapsed value is genuinely unknown, the tree falls back to the state value and the inspector shows an em-dash.

**REQ-MONITOR-112** — The overview header shows the session duration alongside the session name and status.

### 13. Current-activity display and stall visibility

**REQ-MONITOR-113** — The run-level activity line reads: while a verification suite is running, the check name with its position (index of total); while running, a coordinating-run message; otherwise the raw execution status.

**REQ-MONITOR-114** — The run header's root state maps as: running→running; paused→waiting; failed→failed; completed→done; anything else→queued.

**REQ-MONITOR-115** — A per-agent activity line is replaced with a statement that the agent ended with the run when it was settled by session reconciliation, and with a statement that it was cancelled by the user on an optimistic cancel.

**REQ-MONITOR-116** — The overview's active-now card lists live and waiting agents as dot, name, activity, and elapsed rows, with an explicit empty state inviting the user to start or resume a run.

**REQ-MONITOR-117** — Each agent is evaluated for a stall on a fixed interval derived from the configured stall timeout: one sixth of that timeout, never shorter than 1 second and never longer than 5 seconds. With the default 90-second stall timeout, evaluations therefore occur every 5 seconds.

**REQ-MONITOR-118** — Given no model event or token for the stall timeout (default 90 seconds, overridable per persona) while tool calls are in flight, the watchdog logs an informational message naming the number of active tool calls and keeps waiting.

**REQ-MONITOR-119** — Given the same silence with no tool call in flight, every stall evaluation must do three things: log a warning saying the agent appears stalled and that the run is still waiting on it; emit a diagnostic issue of kind `stall` at warning severity carrying the agent's active tools, its recent tool calls, and the type of the last model event received; and invoke the host's stall callback. The callback fires on every evaluation, at the interval of REQ-MONITOR-117, so a host countdown advances at that rate. How often the warning itself may repeat is bounded by REQ-MONITOR-120.

**REQ-MONITOR-120** — Repeat stall warnings are throttled: the gap between them is the stall timeout, or 30 seconds, whichever is longer. When activity resumes, recovery must be logged and notified.

**REQ-MONITOR-121** — The stall watchdog must never cancel an agent. The hard limit is a separate per-agent timeout (default 1200 seconds) that terminates the agent.

**REQ-MONITOR-122** — Each stall poll is also an opportunity to inject pending steering, and a host's stall callback may refresh its agent snapshot; neither may block or fail the run.

### 14. Pause, cancel, and shutdown

**REQ-MONITOR-123** — Pause is graceful and applies to the whole run only: the run finishes its current step and then stops. A pause request naming any agent other than the run itself must be refused; there is no per-agent pause.

**REQ-MONITOR-124** — Given an accepted pause, the session status becomes `pausing` and a message states that the current step will finish first. Given a refused pause, an error message states that pause is unavailable because no active run exists.

**REQ-MONITOR-125** — While a run is paused, run controls state that the run must be continued before they can be used. A paused session persists with an interruption message and can be resumed from the composer.

**REQ-MONITOR-126** — Cancelling a run requires confirmation stating that cancellation cannot be undone in this session, describing the impact as cancelling the active run and every active task agent, with an explicit confirm label.

**REQ-MONITOR-127** — On confirmation the session status is optimistically set to `cancelling` and a full cancellation is requested. Given a refusal, the status is restored to `running` and an error message states that the run is no longer cancellable.

**REQ-MONITOR-128** — Cancelling one agent requires confirmation naming that agent plus one line per live descendant that will also be cancelled. On confirmation, that agent together with each of its live descendants is optimistically shown as cancelled, with an activity line stating that the user cancelled them, and the cancellation is dispatched to the run. Given a refusal, the prior state is restored and an error message states that the agent is no longer cancellable.

**REQ-MONITOR-129** — Cancelling a run must signal the run's graceful-stop path rather than aborting its execution, so the run still produces and reports a terminal result. A graceful stop that is not honored within 30 seconds is force-cancelled as a backstop.

**REQ-MONITOR-130** — Cancelling a run started from the graphical application and cancelling the same run started from the command line must leave identical observable state: the same persisted execution status, the same terminal run result and process exit code (REQ-MONITOR-028), every non-terminal agent settled to `cancelled` (REQ-MONITOR-209, REQ-MONITOR-211), the session lock released (REQ-MONITOR-240), and queued follow-up prompts left in the same condition. Neither host may hold a resource the other has released.

**REQ-MONITOR-131** — Application shutdown produces these effects, in this order, each of which an observer can check: polling stops; the run is cancelled, with anything blocked on a human answer released first (REQ-MONITOR-012); queued follow-up jobs are cleared; and the process does not exit until the run has reported its terminal result and finished writing session state. A restart that is not a shutdown waits at most 5 seconds for the previous run to finish before proceeding. Whether shutdown carries a force-exit backstop, and how it relates to the 30-second cancellation grace of REQ-MONITOR-129, is unresolved — see Open Questions.

**REQ-MONITOR-132** — Given two active runs at quit time, the warning must name both in the plural and quitting must stop both.

### 15. Steering and queued prompts

**REQ-MONITOR-133** — Submitting a steering prompt requires a non-empty target agent id and non-empty content; either being empty is an error. A successful submission returns a prompt identifier and the prompt is pending until injected.

**REQ-MONITOR-134** — All pending steering prompts for an agent are delivered into its conversation as a message explicitly marked as a steering prompt, are marked injected exactly once, and are reported to the run so the run's repetition safeguards treat them as a new user instruction.

**REQ-MONITOR-135** — Injection happens both at the boundaries between an agent's conversation rounds and opportunistically from stall polls while a conversation is running, so a steer lands at the agent's next step and typically within seconds even mid-run. Each successful injection refreshes the agent's last-activity timestamp.

**REQ-MONITOR-136** — Given a steering injection occurred, an agent that would otherwise have finished must instead take another round rather than terminating.

**REQ-MONITOR-137** — Steering is initiated from the inspector (which opens the persona window's steer card) or directly from that card. A refused steer (no run, empty text, or whitespace only) must report that steering is unavailable for this run. While the inspector is following an agent, steering targets the followed agent.

**REQ-MONITOR-138** — Steering addresses one live agent immediately; queueing addresses the run and is consumed at the next stop boundary as a queued-prompts todo phase.

**REQ-MONITOR-139** — Queued prompts are owned by a session: when several runs execute against one prompt store, a run may consume only those prompts queued for its own session.

**REQ-MONITOR-140** — During an active run the composer stays editable, its submit action is labeled as queueing, and queued messages are listed in a persistent scrollable panel where any of them can still be edited or removed until it is consumed. An edit or delete naming an unknown or already-consumed prompt is refused rather than erroring out.

**REQ-MONITOR-141** — Queued-prompt state is re-read on every poll tick so externally added prompts appear, and only the focused run's handle writes the visible queue.

### 16. Model and reasoning switching mid-run

**REQ-MONITOR-142** — A switch of the run's entry model, or of its entry reasoning level, applies from the next iteration onward; the iteration already in flight finishes on the previous setting. Each switch appends a system transcript row stating the new model or reasoning level and that it applies from the next iteration.

**REQ-MONITOR-143** — Given the run loop has already closed, a switch still records the override without announcing it, because no live loop remains to receive the announcement; the control must not error.

**REQ-MONITOR-144** — The run header's active-run model selector and active-run reasoning selector (low / medium / high) are enabled only while a run is executing locally in state `running`, and changing either applies the corresponding switch immediately as a next-iteration change.

**REQ-MONITOR-145** — Mid-run model switching is the supported recovery lever for moving back to a primary model once its provider has been re-authenticated, in a run that has meanwhile been proceeding on a fallback.

**REQ-MONITOR-146** — Composer-side model, persona, and reasoning choices apply to the next prompt, not to the running iteration, and are locked while a local run is busy.

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

**REQ-MONITOR-155** — While a post-change check suite runs, the session carries verification state made up of: an active flag; the current check's name; its command; its index within the suite; the total number of checks; the check's start timestamp; and a deadline expressed in whole seconds. The state is written when the suite starts, replaced when each check starts, and removed when the suite ends. Absence of the state says only that nothing is being verified at this moment; no surface may render that absence as a finding that verification produced no result. Whether the deadline is a duration measured from the start timestamp or an absolute point in time, and what must happen when it passes, is unresolved — see Open Questions.

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

**REQ-MONITOR-166** — The cumulative-tokens card shows the total token count with thousands separators and a `tok` suffix, a sparkline of token history, and a sub-line showing a pre-rendered cost label. The cost label carries its own qualifier distinguishing an unknown price, an incomplete price, and a price derived from configured rates, so that no view has to invent its own description for a run whose price could not be established.

**REQ-MONITOR-167** — The tool-calls card shows the session-wide tool-call total, a caption naming the number of agents it spans, and up to five per-tool chips of the form `{tool} {count}` sorted by count descending, aggregated from per-agent metrics.

**REQ-MONITOR-168** — The repository card shows commits ahead and behind with directional markers, the comparison base and current branch, and a line stating how many files were touched and how many changes are uncommitted.

**REQ-MONITOR-169** — The agents card shows the agent count, a caption of the form `depth {d} / {cap} · fan-out {n} / {limit}` against the configured delegation caps, and a monospaced detail line of running, waiting, done, and failed counts, where waiting includes queued agents and failed includes cancelled and blocked agents.

**REQ-MONITOR-170** — The cumulative token figure uses the aggregate total when available and otherwise falls back to the sum of prompt and completion tokens from the raw usage record.

**REQ-MONITOR-171** — The sessions card lists sessions as a run switcher; each row carries a status dot (attached uses the run color, background uses the informational color, other busy states pulse in the run color, failed uses the failure color, otherwise idle), a session-name link with a tooltip carrying the session identifier and any requirement attribution, a requirement tag only when a requirement id exists, a focused marker, a detail caption, a continue-run link shown only when the session is not busy, the branch, a token label, and a duration label. Its empty state explains that finished and suspended runs will be listed there once they exist.

**REQ-MONITOR-172** — A session started by a person and not tied to a requirement must show no requirement tag at all; an empty tag would look like a requirement whose identifier could not be loaded.

**REQ-MONITOR-173** — The overview's right column shows, in order: the cloud-credit tile first (the balance determines whether provider quotas are reachable at all); the subscription-limits card; an agent-tree card with a link to the mission view; and an improvement-proposals card with a tag counting proposals pending review, a link into the library, and per-proposal rows carrying a summary link, status tag, category caption, and approve/reject/defer actions excluding the proposal's current status.

**REQ-MONITOR-174** — The overview refreshes in response to state-change notifications (agents, sessions, status, repository, proposals, settings) and performs no work while hidden; the session runtime and status in its header follow status changes.

**REQ-MONITOR-175** — A session's awaiting-input flag must be recorded in its externally readable metadata as true when it has pending approvals or pending questions, so that every session list reveals a background run that is waiting on a human answer. The rendered attention text is a single fixed sentence stating that the run cannot proceed until the person answers.

### 20. Status bar and title bar

**REQ-MONITOR-176** — The bottom status strip shows plain-text readings of: workspace path, branch, safety flags, current model, cumulative tokens (thousands-separated with a `tok` suffix, tooltip explaining that it counts tokens used by this workspace's runs), a cost reading, and the number of background sessions.

**REQ-MONITOR-177** — When no cost label exists, the cost reading is hidden entirely rather than rendering a bare label with no value.

**REQ-MONITOR-178** — The status strip shows a cloud-credit chip reading `{balance} credit`, with an additional no-credit warning marker when spending admission is blocked, tinted with the accent color normally and the warning color when blocked, with a tooltip naming the account state and stating that activating it opens the account page for topping up. The chip is hidden entirely unless a credit reading is ready.

**REQ-MONITOR-179** — The title bar shows a session chip whose dot pulses for live states, a label of the form `session {status}`, and an accessible description stating the session status in a sentence.

**REQ-MONITOR-180** — While post-run improvement analysis is running, a separate informational, pulsing indicator with its own label is shown; setting it must not change run state. Across parallel runs the indicator is the logical OR of all runs, so that when one run's analysis finishes the indicator stays lit while any other run is still analyzing.

### 21. Provider limits, cloud credit, and quota waits

**REQ-MONITOR-181** — The subscription-limits card renders one row per provider limit, each carrying: the limit's label; a monospaced reading of the amount used against the allowance; a progress bar filled to that fraction; and a detail caption. A bar at or above 60% of its allowance renders in the warning tint by default. The information the detail caption must carry, and the exact format of the used-versus-allowance reading, are unspecified — see Open Questions.

**REQ-MONITOR-182** — Limits for every authenticated provider are fetched without any one provider delaying another: the interval from the first request to the last row settling must not exceed the longest single-provider timeout plus a small fixed overhead, and must not grow in proportion to the number of providers configured. A provider that is slow, unauthenticated, or failing must never delay or suppress the rows of providers that answered. The per-provider fetch timeout is not stated anywhere — see Open Questions.

**REQ-MONITOR-183** — A provider that is unauthenticated or whose fetch failed keeps a visible degraded row naming the provider, stating that usage is unavailable, and giving the specific remediation for that provider (sign in, run the provider's token setup, or retry when the provider exposes usage data). The card's empty state explains that providers which are signed in may report subscription limits there.

**REQ-MONITOR-184** — Limits are computed a single time at startup; there is no polling loop, no expiry timer, and no file watching. After settings observes a successful re-authentication of a provider, a refresh is triggered on a background worker; its result replaces the stored limits and notifies views, which re-render with no additional wiring. A failed refresh degrades to the unavailable card and must never present a blocking dialog.

**REQ-MONITOR-185** — Cloud credit is modeled with a phase of `signed_out`, `loading`, `ready`, or `error` — every phase has something to show, so the tile is never drawn as an empty card — and a state of available, exhausted, overdrafted, or unknown, each carrying its own label. It carries a pre-rendered balance label, a last-call cost label, a backend admission flag, and a copyable error string. Credit is considered blocked exactly when the phase is ready and admission is not allowed.

**REQ-MONITOR-186** — Cloud credit is re-read at application start, on cloud sign-in, when a run finishes (at minimum on a transition to idle, failed, or paused), on a repeating 120-second timer while the application is open, and on explicit user request. No re-read may block the interface: while one is in flight every control stays operable and the previous reading stays on screen until a newer one replaces it. Whether a run ending in `completed` or `cancelled` also triggers a re-read is unresolved — see Open Questions.

**REQ-MONITOR-187** — Given a run whose models are cloud-hosted and a last reading indicating the account may not spend, starting the run must first raise a confirmation that names the balance; the user may start anyway. The check is answered from that last reading alone and must add no network call to the start path.

**REQ-MONITOR-188** — Credit state must be conveyed by text and shape, never by color alone.

**REQ-MONITOR-189** — Given a run failure whose message contains "rate limit" or "quota" (case-insensitively): on cloud models with a ready credit reading, a persistent error notice is raised naming the reported balance and state, stating that the session is preserved and that the user may top up or choose a model on another provider, offering an action to open the cloud account, and the balance is re-read because the reading that produced the failure is by definition stale. Otherwise a persistent error notice states that a provider limit was reached, that the session is preserved, and that the user may choose another model or retry after the provider resets, offering a change-model action.

**REQ-MONITOR-190** — All other run failures raise a persistent error notice stating that the run failed and that the session and draft were kept for recovery, with a review action, and with the raw failure message retained in copyable details.

**REQ-MONITOR-191** — Quota retry backoff honors a provider-supplied retry-after value when present (minimum 1 second); otherwise it is exponential from a 60-second base doubling per attempt and capped at 300 seconds.

**REQ-MONITOR-192** — While parked on a quota wait, an agent waits on a decision keyed by that agent. Where automatic resume is allowed, the wait timing out resolves as a retry. Where it is not allowed, the wait continues indefinitely until a person decides.

**REQ-MONITOR-193** — The fallback candidates offered during a quota wait are exactly the configured models, from any configured provider, whose size tier (`small`, `medium`, `large`) equals the current model's tier, less any model excluded under REQ-MONITOR-194. How a model's size tier is established, and the order candidates are presented in, are unspecified — see Open Questions.

**REQ-MONITOR-194** — A provider-and-model pair that answered with a structured insufficient-quota response (HTTP 429) is recorded in the session record as out of quota. For the rest of that session it is neither retried automatically nor offered as an automatic fallback, and the exclusion survives a resume of the same session. Whether a user may still choose an excluded model explicitly is unresolved — see Open Questions.

**REQ-MONITOR-195** — Entering a quota wait sets the execution status to `waiting`, records a wait state carrying the waiting agent, the message, the model, the wait duration in seconds, and whether automatic resume is allowed, and appends a system transcript row. The wait state is cleared on resume or stop. Whether `waiting` belongs to the live-claiming status subset — REQ-MONITOR-024 excludes it, while REQ-MONITOR-291 then forbids showing the agents that are demonstrably parked and alive — is unresolved; see Open Questions.

**REQ-MONITOR-196** — The terminal interface presents a modal titled for provider quota exhaustion with two body variants: with automatic resume, it states the approximate retry delay and the model and offers to keep waiting, cancel the run, or change model now; without it, it states that the model is treated as out of quota for the remainder of the session and offers the same three choices. Cancel stops the run; change-model opens a model picker; wait resolves the quota wait as a retry and returns the status to running.

**REQ-MONITOR-197** — Other hosts must read the same persisted wait state and `waiting` status and present the run as waiting on provider quota, not as stalled or failed.

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

### 23. Crash, orphan, and contradiction handling

**REQ-MONITOR-207** — A session whose execution status claims a live run but whose recorded process identifier is no longer alive is a stale session and must be detectable as such.

**REQ-MONITOR-208** — Liveness probing must not signal the probed process. Where a platform's naive liveness check would deliver an interrupt to the target, an inspection-only mechanism must be used instead, and only an unambiguous "no such process" answer may be treated as proof of death — every ambiguous answer must be treated as alive.

**REQ-MONITOR-209** — Repairing a stale session settles the session to `interrupted` and every orphaned agent to `cancelled`. `cancelled` is a legal transition target from every non-terminal agent state, so repair can settle any agent whatever it was doing.

**REQ-MONITOR-210** — The interface must offer the repair and announce that it happened. A repair attempt on a session whose process is alive must be refused with a reason, and the refusal must distinguish "the process could not be confirmed dead" from "the process is running".

**REQ-MONITOR-211** — Given an execution status that neither claims a live run nor is `idle`, every running, waiting, or queued agent must be settled to the run's own outcome: completed / succeeded / done→done; failed / error→failed; anything else (paused, cancelled, interrupted)→cancelled. Their activity is replaced with a statement that they ended with the run, and their active tool chips are cleared.

**REQ-MONITOR-212** — The `idle` status is deliberately exempt from that reconciliation, because a run that never began has no outcome for its agents to inherit.

**REQ-MONITOR-213** — Once reconciliation (REQ-MONITOR-211) has settled an agent, every surface — agent tree, live counters, dashboard, mission graph, persona windows, inspector — must show that agent in the settled state and its cleared activity. No surface may still present it as running, waiting, or queued, and no surface may apply a settling rule of its own or exempt itself from the outcome.

### 24. Live update transport, timing, and ordering

**REQ-MONITOR-214** — A local run publishes on two channels. The transcript travels as an incremental update carrying the lowest row index whose content may still change, the rows from that index onward, any new diffs, and the persona set; every row before that index is untouched by the update.

**REQ-MONITOR-215** — A row already delivered to a view is stable: its content may change only through a later update whose earliest-changed index is at or below that row's index. Nothing the run does afterwards may alter, in place, a row a view is already holding.

**REQ-MONITOR-216** — All state other than the transcript travels as one whole-session update carrying the session record with its unbounded collections emptied — transcript rows, edit diffs, report artifacts, checkpoints, and seen-compression identifiers are omitted, reaching views by other paths — and its bounded collections carried in full: agent states, run todos, per-agent todos, pending approvals, pending questions, verification state, token usage, and per-agent metrics. A delivered update is a fixed snapshot of the moment it was taken: no later run activity may change a value a consumer already received.

**REQ-MONITOR-217** — The whole-session update carries every field of the session record that any surface is able to display, not a curated subset of them. A surface may display a session field only if the update carries it. The failure this rules out is observable: a field added to the record but omitted from the update leaves a surface showing a value the persisted record has already moved past.

**REQ-MONITOR-218** — A transcript row a view has not yet seen is published immediately. No minimum wait, debounce, or delay floor of any size may be applied before publishing such a row, on any platform.

**REQ-MONITOR-219** — Growth of an already-visible row is coalesced into a trailing tick of 50 ms (about 20 updates per second). Per-token publication is not permitted, because each publication costs a full delivery and projection cycle while providers emit tokens faster than any view can draw them.

**REQ-MONITOR-220** — Coalescing must lose nothing: a pending publication reads current state when it fires. At run end, pending publications must be flushed so a run whose last row arrived late does not appear to have lost it.

**REQ-MONITOR-221** — Every change must be persisted before it is published to any view. If a view could display an event that the durable record does not yet hold, it could disagree with what a resume would restore.

**REQ-MONITOR-222** — Run activity must appear on the live surfaces of the focused session within 250 ms at the 95th percentile, regardless of how long the session already is. This must hold both at zero pre-existing rows and at thousands of pre-existing rows.

**REQ-MONITOR-223** — The end-to-end cost of one update is set by how much changed, not by how much the session has accumulated: for the same amount of new content, an update to a session holding thousands of recorded rows must cost no more than a small constant factor of the same update to an empty session, measured from the run emitting the change to the surface showing it, not only inside the view. A session with nothing happening must do no work at all beyond the periodic liveness check of REQ-MONITOR-288. The acceptable constant factor is not yet fixed — see Open Questions.

**REQ-MONITOR-224** — A view stage that cannot correctly apply an incremental update must decline the increment and re-render from a whole read; it must never render a result that differs from what a whole read would have produced. The agent-scoped transcript filter is such a stage and is off by default. Grouped tool rendering is on by default and applies increments correctly by treating any row that cannot join a group as a group boundary; with grouping on, the 250 ms visibility budget still holds.

**REQ-MONITOR-225** — Reading a session snapshot and projecting it must never make the interface unresponsive: while a read or a projection is under way, controls stay operable and already-rendered content stays on screen. Displayed state never moves backwards — a result belonging to a read that a later read has superseded must never overwrite newer content, however long the earlier read took to arrive. The duration of each snapshot load and each projection is recorded in diagnostics.

**REQ-MONITOR-226** — A view consumer that raises, hangs, or vanishes must leave the run untouched: its progress, timing, terminal result, and event sequence must be the same as if every consumer had succeeded. A view that cannot apply an increment must record a diagnostic saying it is falling back, stop consuming increments, and re-render from a whole read; after that read, what it shows must equal the persisted record.

**REQ-MONITOR-227** — After focus moves to another session, the transcript on screen must be the newly focused session's transcript in full, taken from the persisted record. No row belonging to the previously focused session may remain visible, and no update generated for the previous session may be applied to the new one.

**REQ-MONITOR-228** — Once a run reaches a terminal state, the transcript a view shows must equal the session's persisted record, including the corrections only a terminal state determines: a tool row that never settled must no longer render as running, and a reasoning burst that never received a duration must be stamped with one. After a run has ended, no row may still render as in progress. Which status an unsettled tool row takes is unresolved — see Open Questions.

**REQ-MONITOR-229** — A transcript that has shrunk (only clearing the transcript does this) is published with an earliest-changed index of 0, meaning the view must start over from that point.

**REQ-MONITOR-230** — Approval and question rows are not part of the recorded history; they are computed from whatever is pending at that moment, always appear after every recorded row, and are appended identically by both the whole-state and the incremental path. A question row reads as a step count with the first question's title; an approval row reads as an approval-needed line naming the command or tool.

**REQ-MONITOR-231** — Given a live run blocked on an approval, the approval row must be present in the live view, not only after the run ends.

**REQ-MONITOR-232** — The run's whole obligation to a view is to emit its events; nothing a view does is required for the run to proceed. A view that is slow, broken, or entirely absent may degrade only what is displayed: the run's terminal result, its persisted record, its event sequence, and its timing must be identical to those of the same run observed by a healthy view. No view may hold a run open, slow it down, or change its outcome.

### 25. Persistence-visible effects

**REQ-MONITOR-233** — A session's durable state lives in a per-session directory under the workspace's tool directory, keyed by session id, and contains: a metadata file; a state directory holding the resume snapshot and the user-facing transcript snapshot; an append-only evidence event store; an artifacts directory with an index; and a per-session debug log.

**REQ-MONITOR-234** — The metadata file is written atomically and carries: session id, creation time, update time, execution status, schema version, an internal flag, worktree information, checkpoint count, task title, requirement id, unit id, and the awaiting-input flag.

**REQ-MONITOR-235** — Listing sessions reads only the metadata file, skips files that cannot be parsed rather than failing the listing, and sorts sessions by update time descending.

**REQ-MONITOR-236** — A legacy combined snapshot file is no longer written but must still be readable, so sessions created by older versions remain openable.

**REQ-MONITOR-237** — The evidence event store is append-only, carries transcript-row events among others, and must be readable from an arbitrary byte or record position so a reader can resume where it left off.

**REQ-MONITOR-238** — The per-session debug log is written at the configured session log level, defaulting to warning.

**REQ-MONITOR-239** — Session state is persisted on a debounce of 10 seconds by default. A save that records a terminal (non-running, non-idle) status flushes immediately. Shutdown flushes pending saves, bypassing the debounce. Hosts must not shorten the debounce to simulate liveness; liveness comes from the publication path, durability from the debounce.

**REQ-MONITOR-240** — A session lock is acquired exclusively (create-if-absent, fail-if-present) behind a reaper that clears locks held by dead processes. Acquisition must fail whenever the holding process is still alive. Consequently, a caller that pre-creates a session and then asks for it to be run must not hold that session's lock.

**REQ-MONITOR-241** — The session schema is versioned (currently version 1). Loading a snapshot whose version is newer than supported must fail with a message stating that the schema version is unsupported, rather than partially loading it.

**REQ-MONITOR-242** — The transcript a user watched during a run and the transcript restored when that session is reopened must be equal: the same rows, in the same order, with the same content and the same annotations. A user who follows a long run and later reopens the session must find what they saw. Any difference between the two is a defect, and wherever they could differ the persisted record is authoritative (REQ-MONITOR-292).

### 26. Cross-process observation

**REQ-MONITOR-243** — A session running inside a different process (a command-line run, a headless job, a second application window, a detached background run) must be observable with the same content as one executed locally; only latency may differ.

**REQ-MONITOR-244** — A foreign session's transcript is followed from its append-only evidence store using a stateful read offset, producing the same incremental update shape a local run produces, at a cost set by the amount newly appended rather than by total session size.

**REQ-MONITOR-245** — Following must behave correctly at these edges: re-reading with no new data costs only the (absent) addition; one new row costs one row regardless of session size; a settled row replaces the provisional row it opened (an out-of-process viewer observes a row when it opens and again when it settles, whereas an in-process viewer observes it growing continuously); non-transcript events are passed over; a session with no event store yet is not an error; a truncated or shortened store restarts the view from the beginning; a row missing from the middle leaves later rows in place; and a malformed row does not stall the follow.

**REQ-MONITOR-246** — Everything other than the transcript (todos, agent tree, artifacts, token counts) reaches an out-of-process viewer by way of a whole-state read taken every 750 ms, whose cost is bounded by concurrent activity rather than by session length.

**REQ-MONITOR-247** — A handle that is executing its own run must refuse to follow another session, because an executing run owns the transcript it writes, and a competing writer would collide with it.

**REQ-MONITOR-248** — The transcript must be recorded by the engine beneath every host, so a command-line or headless session's user-facing transcript file is populated during the run rather than only at its end.

### 27. Parallel sessions and focus routing

**REQ-MONITOR-249** — Concurrent runs each get their own run handle, while views keep a single-run interface: every control a view issues routes to the focused run. Session-aware notifications (run started, finished, failed, focus changed) must cover every run, not only the focused one.

**REQ-MONITOR-250** — Background run handles keep refreshing their own session but publish only a session summary (session id, execution status, branch). They must never publish into the shared transcript, agent tree, metrics, or prompt queue.

**REQ-MONITOR-251** — The second and any subsequent concurrent launch must be placed into a worktree.

**REQ-MONITOR-252** — Switching focus changes which session is projected without touching any background run's lifecycle. Cancelling or failing one run must affect only that run's handle.

**REQ-MONITOR-253** — An approval request must reach the run that asked for it even when that run is not focused, and an approval answer for which no run is waiting must be reported back as undeliverable.

**REQ-MONITOR-254** — A permission-mode change reaches only the focused run.

**REQ-MONITOR-255** — Shutdown must request every run handle to stop before waiting on any of them.

**REQ-MONITOR-256** — Continuing a session must never inherit the previous run's live agents. Resuming a base-workspace session must be refused while a run is active there.

**REQ-MONITOR-257** — Changing focus re-binds every per-session surface: sandbox indicator, terminal streams (an open terminal window re-opens onto the newly focused session's terminals, because the intent is to keep a terminal in view, and after the switch it is the newly focused session's terminals that matter), composer submission target, and recovery state. Notices carry their session id so cross-session news survives a focus change.

**REQ-MONITOR-258** — An active run does not block starting a new session or switching the focused session: concurrent runs are supported (§ 27), the second and any later concurrent launch is placed in a worktree (REQ-MONITOR-251), the actions that start and list sessions stay enabled throughout a run (REQ-MONITOR-164), and changing focus leaves every other run's lifecycle untouched (REQ-MONITOR-252). What is refused while a run is active is resuming or continuing a session in a workspace where a run is already executing (REQ-MONITOR-256), and integrating a worktree whose run has not finished; each refusal states that the run in question must finish or be cancelled first. The full list of operations that stay gated is unresolved — see Open Questions.

**REQ-MONITOR-259** — Starting a run is refused while a previous run's terminal completion has not yet been reported, and while the previous run's worker has not finished.

### 28. Run start and identity

**REQ-MONITOR-260** — Starting a run refuses an empty prompt and refuses a second start on a handle that is already running.

**REQ-MONITOR-261** — A caller may supply the identity of a not-yet-existing session at start time, so the run shows up in session listings before the worker has reported anything.

**REQ-MONITOR-262** — A run may be pinned to an immutable settings snapshot supplied at start; otherwise the current settings are snapshotted at start and used for the whole run.

**REQ-MONITOR-263** — Worktree resolution is announced (session id and branch) before the agent starts; the run-started notification (carrying the session id) is emitted once the session exists. Those announcements, together with the session status, drive the run header, the listing of sessions, and the composer.

**REQ-MONITOR-264** — Run request validation: isolation and worktree options are mutually exclusive; specifying a worktree branch requires isolation; resuming an existing session refuses worktree options. Validation diagnostics carry the pre-start error prefix.

### 29. Commands and keyboard access

**REQ-MONITOR-265** — Run-control commands must exist for cancelling the active run, pausing the active run, and compressing agent context. All three are gated on a live run and, when unavailable, remain listed with the reason that no run is active.

**REQ-MONITOR-266** — A command to clear the transcript must exist, gated on a non-empty transcript, with an unavailability reason stating that the transcript is empty.

**REQ-MONITOR-267** — Session and workspace commands must exist for new session, resume, session list, transcript search, worktree (gated on a repository), stash, and pop.

**REQ-MONITOR-268** — A model command taking a model name must exist. An unknown name is refused with a message naming the unknown model and listing the available ones. A model the provider currently withholds is refused with a message naming the model and the provider's reason. Success updates the visible model indicator and confirms the new model by name.

**REQ-MONITOR-269** — A persona command taking a persona name must exist, with equivalent unknown-name handling.

**REQ-MONITOR-270** — The command list holds an entry for every action the command palette can invoke and for every skill a user can invoke, including entries currently unavailable, which are listed with their reason (REQ-MONITOR-271). The listed set and the invocable set must be equal: an action that can be invoked without appearing in the list, and a listed command that cannot be invoked at all, are both defects.

**REQ-MONITOR-271** — Unavailable commands remain listed with their reason rather than being hidden; executing one reports the reason and preserves whatever the user had typed in the composer.

**REQ-MONITOR-272** — Keyboard access must include: Enter to submit from the composer; Shift+Enter for a newline; Ctrl+Return as a global submit; Ctrl+L to focus the composer; Ctrl+, for settings; Ctrl+F for transcript search; F1 for keyboard help; Escape to close an overlay; and Ctrl+Shift+T for the terminal window.

**REQ-MONITOR-273** — Available, unavailable, and disabled control states must be visually distinct, and every disabled control must expose its reason in a keyboard-reachable way.

### 30. Mission view

**REQ-MONITOR-274** — A mission view must present a live delegation graph and an agent activity table, with actions to open an agent, pause the selection (graceful and valid only for the run-level agent), and cancel the selection (marked destructive). Pause and cancel actions sit under the graph, and pause carries an availability explanation.

**REQ-MONITOR-275** — The mission view's strategy selector and depth control must mirror the delegation settings, and its activity table refreshes row by row under the same hidden-surface deferral as other always-alive surfaces.

**REQ-MONITOR-276** — A pause requested from the mission view for a non-run-level agent must be refused, consistent with the whole-run-only pause rule.

### 31. Terminal-interface monitoring and interrupts

**REQ-MONITOR-277** — The terminal interface shows the currently active sub-agents as a live list, each entry carrying its name and role, the count of tool calls it has dispatched, and the wall-clock time since it started.

**REQ-MONITOR-278** — Tree navigation: Ctrl+Down descends to the first active child (no-op when there are none); Ctrl+Left and Ctrl+Right cycle siblings at depth 1 or greater (no-op when alone); Ctrl+Up ascends (no-op at the root).

**REQ-MONITOR-279** — Changing the focused agent updates the main view to that agent's history and shows its identity and breadcrumb; text already typed in the composer must survive navigation.

**REQ-MONITOR-280** — The terminal interface's side panel shows: a running token estimate, being accumulated characters divided by the configured characters-per-token ratio (default 4), recomputed after each message and after each tool call; the active MCP servers each with its connection status; the tool list, with used tools distinguished from unused ones; a warnings section listing at least an agent whose context has reached 75% of its compression threshold (REQ-MONITOR-087), failed tool calls, and agent errors or unexpected agent exits; the active workspace path, replaced by the focused agent's own path where that differs; the active model including its variant qualifier; the open todo items with their status; and vertical scrolling for content taller than the panel. The panel updates when an event changes something it shows and performs no periodic polling.

**REQ-MONITOR-281** — Per-agent metric rows in that panel read as token count, call count, and compression count, in that order, with unit labels.

**REQ-MONITOR-282** — The first interrupt signal requests a graceful shutdown of the active run (pausing or closing conversations and cancelling orchestration work); the second interrupt signal force-exits immediately. This must hold for background command-line runs and for the terminal interface.

**REQ-MONITOR-283** — A quit request during a run uses the same coordinated stop path. The interface must remain responsive, must indicate that stopping is under way, and must count down the moment at which it will force-exit instead. A clean stop defers process exit until run and loop teardown completes; a stop that is still blocked 2 seconds after the quit request force-exits automatically, and a second quit request issued while that countdown runs force-exits immediately.

**REQ-MONITOR-284** — An interrupted run persists a paused session state carrying an interruption message; a `paused` execution status resolves to the interrupted terminal result and exit code 130 in headless use.

### 32. Defaults, limits, and timeouts

**REQ-MONITOR-285** — Runtime policy defaults, each observable in the behavior it governs: maximum agents per run 20; maximum concurrently active agents 6; maximum delegation depth 3; maximum iterations 20; per-agent hard timeout 1200 s, on whose expiry the agent is terminated (REQ-MONITOR-121); per-agent stall timeout 90 s, which affects only what is reported and never terminates anything, overridable per persona; model response timeout 120 s with an accepted minimum of 30 s, on whose expiry the persona's fallback model is activated while the agent keeps running; a global model-call timeout, default 120 s, overridable per model; shell timeout 100 s; background shell timeout 3600 s; terminal stream interval 100 ms, accepted range 20..2000 ms; terminal stream buffer 256 KB.

**REQ-MONITOR-286** — Interface-level delegation defaults: depth cap 3; fan-out limit 8; per-agent timeout presented as 20 minutes. Interface runtime toggle defaults: compression threshold 80%; iteration cap 25; permission mode "ask".

**REQ-MONITOR-287** — Timing constants that must hold: growth publication tick 50 ms; foreign-session poll 750 ms; local-run reconcile poll 2000 ms; final refresh 3 retries at 100 ms; worker join cap 5 s on restart and unbounded at shutdown; live-row repaint about 1 s; verification clock 1 s; persistence debounce 10 s with immediate flush at terminal statuses; cancellation grace 30 s; quota backoff base 60 s capped at 300 s; visibility budget 250 ms at the 95th percentile; force-exit countdown 2 s after a quit request made during a run; cloud-credit refresh timer 120 s.

**REQ-MONITOR-288** — When a run is started locally, the poll cadence switches from the 750 ms foreign-session cadence to the 2000 ms reconcile cadence; when the handle switches to following a foreign session it switches back to 750 ms. For a foreign session the poll interval is the observed latency; for a local run the poll is a correctness backstop, so a missed publication costs latency and never content.

**REQ-MONITOR-289** — A repetition circuit breaker is enabled by default and stops a run that has stopped making progress. When it trips, the run ends with a terminal result and a stated reason naming repetition, never as an ordinary completion. Its externally checkable limits are: 60 tool calls and 60 messages as the point from which a run is assessed for repetition; 4 repetitions of the same action, or 3 traversals of the same cycle of actions, before the breaker trips. A steering prompt delivered to an agent counts as a new user instruction and not as a repetition (REQ-MONITOR-134).

**REQ-MONITOR-290** — A malformed-request failure reported by a model provider is retried after condensing the request, at most 2 times, so at most 3 attempts are made in total. If the last attempt also fails, the failure is surfaced through the ordinary failure path (REQ-MONITOR-190) and is not retried again.

### 33. Cross-cutting invariants

**REQ-MONITOR-291** — Unless its status claims a live run, a session must never present a live agent, no matter what its persisted record contains. Exactly one definition of which statuses claim a live run may exist, and every surface must reuse that definition rather than restate it.

**REQ-MONITOR-292** — The live view must never contradict what resuming the session would restore; wherever the two could disagree, the persisted record is authoritative and the view must catch up to it.

**REQ-MONITOR-293** — A view consumer that is slow, broken, or missing may degrade only the view. It must never fail, stall, or alter the run. This must hold at every delivery point: incremental transcript delivery, whole-state delivery, stall callbacks, verification skip, and the event stream.

**REQ-MONITOR-294** — Coalescing is allowed as long as the visibility budget is still met; dropping data is not. Anything written into the durable record must remain retrievable by the view.

**REQ-MONITOR-295** — Controls must tell the truth: a control that cannot act is disabled and states why; writable model and reasoning controls exist only where the backend consumes the write; a mode-change confirmation is never broader than what happened; unavailable models are listed with reasons rather than hidden; and a refused control call surfaces as explicit feedback rather than a silent no-op.

**REQ-MONITOR-296** — Optimistic interface updates must always be paired with rollback on refusal (cancel restores the running state; pause sets the pausing state only after the backend accepted), and must eventually be overwritten by the authoritative final read.

**REQ-MONITOR-297** — State dots pulse only while the state they represent is actually running, and only on surfaces that are visible; animation must stop when a surface is hidden.

**REQ-MONITOR-298** — State must never be conveyed by color alone: dots are paired with words, and credit states are conveyed by text and shape.

---

## Data & Formats

### Session directory layout (externally observable)

```
<workspace>/.rotaris/sessions/<session_id>/
  metadata.json                 # atomic write; the only file a session listing reads
  state/resume.json             # engine resume snapshot
  state/ui_transcript.json      # user-facing transcript snapshot
  state/snapshot.json           # legacy combined snapshot: read for compatibility, no longer written
  evidence/events.jsonl         # append-only event store, one JSON object per line, readable from an offset
  evidence/debug.log            # per-session log at the configured level (default: warning)
  artifacts/                    # produced artifacts plus an index file
```

### `metadata.json` keys

`session_id`, `created_at`, `updated_at`, `execution_status`, `schema_version`, `internal`, `worktree`, `checkpoint_count`, `task_title`, `requirement_id`, `unit_id`, `awaiting_input`.

`awaiting_input` is true exactly when the session has pending approvals or pending questions. Sessions sort by `updated_at` descending. Unparsable metadata files are skipped, never fatal. `schema_version` is currently 1; a newer version fails the load explicitly.

### Status vocabularies

- Execution status (persisted): `idle`, `starting`, `running`, `background`, `pausing`, `cancelling`, `waiting`, `interrupted`, `completed`, `failed`, `paused`, `paused_message_limit`, `cancelled`.
- Live-claiming subset: `starting`, `running`, `background`, `pausing`, `cancelling`.
- Agent state: `queued`, `starting`, `running`, `summarizing`, `waiting_on_dependencies`, `waiting_on_model_slot`, `succeeded`, `failed`, `cancelled`, `blocked`; terminal subset `succeeded`, `failed`, `cancelled`, `blocked`.
- Presentation run state: `idle`, `starting`, `running`, `pausing`, `paused`, `completed`, `failed`, `cancelling`, `cancelled`; busy subset `starting`, `running`, `pausing`, `cancelling`.
- Presentation agent state: `running`, `waiting`, `queued`, `done`, `failed`, `cancelled`.
- Terminal run result: `completed` (exit 0), `failed` (exit 1), `max_iterations` (exit 2), `interrupted` (exit 130), `error` (exit 1). The mapping is total; an unmapped status is an error, not a default.

### Control result shape

A control call answers with a boolean outcome plus an optional string. The string is non-empty only for queued-prompt creation, where it is the new prompt id. A false outcome always means "the request was not performed", never "nothing happened, try again silently".

### Agent record (as visible to monitoring)

Name, canonical name, persona, task description, dependencies, inherited context, state, spawned-at, completed-at (UTC, stamped on entering a terminal state), parent agent id, depth (default 1), conversation id, category (`quick` / `deep` / `planning` / `research`), session id, background flag, task id, launch generation, produced artifact ids, received artifact ids, resolved model key, granted native tools, granted MCP tools per server, todo state.

### Background-agent completion notification

Task id, canonical name, description, terminal state, duration in seconds, count of background agents still running, produced artifact ids.

### Verification state

An active flag, the current check name, its command, its index, the total number of checks, the start time, and a deadline in seconds. Present only while a suite runs, absent otherwise. Absent means "not verifying", never "nothing was verified". Position renders as `<check-name> (<index>/<total>)`. A separate gate warning persists across the suite lifecycle and reports that no quality gate was present.

### Quota wait state

The waiting agent, the message, the model, the wait duration in seconds, and whether automatic resume is allowed. Present while the execution status is `waiting`, cleared on resume or stop.

### Notice shape

A severity, a title, a message, detail text, a persistence flag, an optional action label and action identifier, and the owning session id. Details remain copyable. Persistent notices bound to another session survive the next run start.

### Live update payloads

- Incremental transcript update: the lowest row index whose content may still change, the rows from that index onward, any newly recorded diffs, and the persona set. Rows are deep-copied at the boundary. An index of 0 after a transcript clear means "start over".
- Whole-session update: the session record with unbounded collections emptied (transcript rows, edit diffs, report artifacts, checkpoints, seen-compression ids) and bounded collections deep-copied (agent states, run todos, per-agent todos, pending approvals, pending questions, verification state, token usage, agent metrics).
- Background-run summary: session id, execution status, and branch only.

### Transcript row annotations

Tool rows carry `status ∈ {running, ok, failed, blocked}` plus a duration. Verification outcomes map passed→ok, failed→failed, timeout→failed, skipped→blocked. Trailing approval and question rows are derived from current pending state, always sit after all recorded rows, and read as an approval-needed line naming the command or tool, and a step-count line naming the first question title.

### Display formats

- Inspector meta line: `{state} · {elapsed or —} · {N} tool calls`.
- Context reading: `{used:,} / {limit:,}`, with an em-dash replacing a zero used value.
- Context caption: names the panel as the agent's own context window and states the compression threshold percentage.
- Per-agent metric row (terminal interface): token count, call count, compression count with unit labels.
- Overview session label: `session {name} · {status} · {runtime}`.
- Agent card caption: `depth {d} / {cap} · fan-out {n} / {limit}`, with a detail line of running / waiting / done / failed counts.
- Status strip token reading: `{tokens:,} tok`; credit chip: `{balance} credit` with an added warning marker when spending is blocked.
- Tree prefixes: `├─ `, `└─ `, with `│  ` and three-space continuations; roots have no prefix.

---

## Open Questions

Each entry names the requirement it blocks and the exact fact that is missing. None of these may be answered by guessing a plausible value.

**Conflicting requirements — which is canonical?**

1. **Presentation of `waiting` and `interrupted` (REQ-MONITOR-024, REQ-MONITOR-025, REQ-MONITOR-195, REQ-MONITOR-197, REQ-MONITOR-291).** The user-facing run-state set has no member for either status, so both fall to the catch-all and present as idle, while REQ-MONITOR-197 requires a quota-waiting run to be shown as waiting on quota. Two decisions are needed: which user-facing state each of the two maps to, and whether `waiting` belongs to the live-claiming subset — if it does not, REQ-MONITOR-291 forbids showing the parked agents that a quota wait demonstrably keeps alive.
2. **Iteration maximum: 20 or 25? (REQ-MONITOR-034, REQ-MONITOR-285, REQ-MONITOR-286.)** The runtime policy default is 20 and the interface toggle default is 25. One must be canonical and the other must derive from it or be dropped.
3. **Compression threshold percentage: 60 or 80? (REQ-MONITOR-080, REQ-MONITOR-286.)** Same shape as the previous item: the engine default is 60, the interface toggle default is 80, and a fresh installation can only apply one of them.
4. **Context capacity when the model's own limit is unknown: 128,000 or 265,000? (REQ-MONITOR-044, REQ-MONITOR-049, REQ-MONITOR-080.)** Meters default to 128,000 while the compression threshold is computed against a default capacity of 265,000, so a ring can mark a threshold outside its own track. Decide one number, or state deliberately why the two differ.
5. **Does a steering submission return an identifier in the control result? (REQ-MONITOR-005, REQ-MONITOR-133.)** REQ-MONITOR-005 restricts the result's string value to queued-prompt creation; REQ-MONITOR-133 says a successful steering submission returns a prompt identifier. Either steering also populates the string, or the identifier reaches the caller by some other route that must be specified.
6. **Which operations stay gated during an active run? (REQ-MONITOR-258, REQ-MONITOR-164, REQ-MONITOR-249 to REQ-MONITOR-256.)** Concurrent runs are supported, so starting and switching sessions are not gated. Confirm the remaining gated list — currently resuming a session in a workspace that already has a run, and integrating an unfinished worktree — and whether anything else belongs on it.
7. **Force-exit backstop at shutdown (REQ-MONITOR-131, REQ-MONITOR-129, REQ-MONITOR-283, REQ-MONITOR-287).** Application shutdown waits without a bound while the terminal interface force-exits 2 seconds after a quit request. Decide whether shutdown needs a bound of its own and how it composes with the 30-second cancellation grace.

**Facts the specification does not determine**

8. **Legal agent-state transition table (REQ-MONITOR-016).** Rejection behavior is specified but the table it is judged against is not. Only fragments exist (REQ-MONITOR-019, REQ-MONITOR-020, REQ-MONITOR-209). The full table must be written down.
9. **Stop-reason vocabulary (REQ-MONITOR-030).** Three classes are defined, but the set of stop-reason values that must be classified is never enumerated, so completeness cannot be tested.
10. **Automatic per-model parallelism caps (REQ-MONITOR-021).** Which providers receive an automatic cap, and whether each cap is 2 or 3, must be stated as explicit policy.
11. **Keep-going criterion (REQ-MONITOR-034).** The criterion that keeps a run going past "all tasks complete" is named but never defined. What is it, and can a user configure it?
12. **Run header wording (REQ-MONITOR-026).** The exact strings for the starting, running, pausing, failed, and cancelling labels. Four of the nine are fixed; the other five are described only by their information content.
13. **Default compression model (REQ-MONITOR-080).** Which model compression uses when none is configured.
14. **Scope of the 300-line compression budget (REQ-MONITOR-083).** Whether the bound applies to the whole reconstructed context or only to the generated summary.
15. **Placement of preserved recent turns (REQ-MONITOR-084, REQ-MONITOR-080).** Where the preserved most-recent turns sit relative to the summary and the todos in the reconstructed context.
16. **Reasoning-row display cap (REQ-MONITOR-109).** How much reasoning text a row displays before eliding — the token estimate is defined over all characters received, including the ones not shown.
17. **Verification deadline semantics (REQ-MONITOR-155).** Whether the recorded deadline is a duration from the start timestamp or an absolute time, and what must happen when it elapses.
18. **Subscription-limit row detail (REQ-MONITOR-181).** What the detail caption must state, and the exact format of the used-versus-allowance reading.
19. **Per-provider limits fetch timeout (REQ-MONITOR-182).** The bound the card's settling time is measured against is never given.
20. **Model size tiers (REQ-MONITOR-193).** How a model's tier (small, medium, large) is determined, and in what order fallback candidates are offered.
21. **Manual use of a quota-excluded model (REQ-MONITOR-194).** Whether a user may still select a pair excluded by a 429 for the rest of the session.
22. **Credit re-read on `completed` and `cancelled` (REQ-MONITOR-186).** The trigger list names idle, failed, and paused; a run that completed normally has also spent credit.
23. **Update-cost constant factor (REQ-MONITOR-223).** "Within a small constant" needs a number: the acceptable ratio between the same update applied to an empty session and to a session holding thousands of rows.
24. **Terminal status of an unsettled tool row (REQ-MONITOR-228, REQ-MONITOR-105).** Which of `ok`, `failed`, or `blocked` a tool row takes when the run ends before it settled.
25. **Per-agent live elapsed time (REQ-MONITOR-107, REQ-MONITOR-111).** The tree meta, the inspector meta, and the pop-out context card each hold a slot for a per-agent wall clock. Must all three advance live during a run, or is the documented fallback (state value in the tree, em-dash in the inspector) acceptable where a live value exists?
26. **Quota-wait presentation outside the terminal interface (REQ-MONITOR-195, REQ-MONITOR-196, REQ-MONITOR-197).** The persisted wait state is readable by every host, but only the terminal interface has a specified decision surface. What must the graphical host show and offer beyond the `waiting` status and the failure notices?
27. **Cloud-credit refresh cadence (REQ-MONITOR-186).** Whether the 120-second interval should be user-configurable, and whether it should back off while the application is idle or unfocused.
28. **Token-history sampling (REQ-MONITOR-166).** The cumulative-token sparkline's sampling interval and how many samples it retains.
29. **Quota model picker and force-exit countdown wording (REQ-MONITOR-196, REQ-MONITOR-283).** The exact choices the quota-wait model picker offers and the exact countdown wording; the countdown duration itself is fixed at 2 seconds.
30. **Exit-code overlap (REQ-MONITOR-028).** `failed` and `error` both exit 1, so automation cannot tell a reported failure from an undetermined outcome. Decide explicitly whether `error` needs a code of its own.
