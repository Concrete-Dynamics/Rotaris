# Run Monitoring and Steering — 5. Delegation tree presentation

Part 2 of 8 of [domain 02](../02-run-monitoring-steering.md), which indexes every part. Defines REQ-MONITOR-036 – REQ-MONITOR-106.

### 5. Delegation tree presentation

**REQ-MONITOR-036** — The agent tree is a depth-first list of rows, each carrying the agent, a box-drawing prefix, and a depth. Prefixes use `├─ ` and `└─ ` with `│  ` and three-space continuations; root rows have an empty prefix and depth 0.

**REQ-MONITOR-037** — An agent whose recorded parent is the run itself, or whose recorded parent id is unknown, must render as a root row rather than being dropped.

**REQ-MONITOR-038** — Several delegation-tree surfaces (workspace sidebar, overview dashboard, mission view) may be visible at the same time. Whenever more than one is visible, each must show the same agent set in the same states; no visible surface may trail another by more than the 250 ms visibility budget. A refresh of a tree holding the maximum supported agent count (20, REQ-MONITOR-285) must complete inside that same budget, and the time a refresh takes must not increase with how long the run has been going or with how many transcript rows the session holds.

**REQ-MONITOR-039** — A tree surface that is not visible must defer its refresh until it is shown, and must then catch up to current state.

**REQ-MONITOR-040** — Each tree row shows: the branch prefix in a monospaced face; a state-colored status dot that pulses while the agent is live; the persona display name (brighter while live); the agent's task name beneath it; and, where meta is enabled, a meta label showing elapsed time if known, otherwise the state value.
  > **Extended by [`PD-CONFIG-003`](../../product/directives/pd-config-003.md#pd-config-003) revision 3, 2026-10-07.** A row whose agent's stored report carries REQ-ORCH-088's
  > timeout error carries a "timed out" tag after its meta label.

**REQ-MONITOR-041** — A tree row's tooltip carries the first of these that exists: the agent's full delegation task, its current activity text, its name. Row content never changes the panel's width: a name that does not fit is elided with a visible truncation marker and remains readable in full through the tooltip.

**REQ-MONITOR-042** — Clicking a tree row selects that agent and notifies all surfaces of the selection; the selected row must be visually distinguished.

**REQ-MONITOR-043** — Rows for task agents put the persona first, with the task title on the line below. The run's synthetic root is neither rendered as a task agent nor selectable in the tree; run-level control lives in a dedicated run header instead.

**REQ-MONITOR-044** — Each agent as presented to views carries: id, name, persona, presentation state (running / waiting / queued / done / failed / cancelled), parent id, dependencies, activity text, model, reasoning level (default "medium"), context tokens used, context limit (the configured default context capacity of REQ-MONITOR-080 where the model's own capacity is unknown, per REQ-MONITOR-049), tool-call count, elapsed string, granted tools, granted MCP tools per server, previously called tool names, currently active tool names, artifacts (name, producer, ready flag), produced and received artifact ids, category, background flag, delegation task, delegation session id, and inherited context.
  > **Extended by [`PD-CONFIG-003`](../../product/directives/pd-config-003.md#pd-config-003) revision 3, 2026-10-07.** An agent as presented also carries whether its stored report
  > carries REQ-ORCH-088's timeout error: the limit it ran under and whether it was cut off while making progress
  > (PD-ORCH-004's statement), or nothing.

**REQ-MONITOR-045** — Context percentage is the used-tokens fraction of the limit, rounded to a whole percent, and is 0 when the limit is zero or negative. An agent is "live" exactly when its presentation state is running.

**REQ-MONITOR-046** — Engine agent states map to presentation states as: succeeded→done; running→running; summarizing→running; waiting_on_dependencies→waiting; waiting_on_model_slot→waiting; failed→failed; cancelled→cancelled; blocked→failed; anything else→queued.
  > **Narrowed by [`PD-ORCH-005`](../../product/directives/pd-orch-005.md#pd-orch-005) revision 4, 2026-09-28.** Clause 13:
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
  > **Extended by [`PD-CONFIG-003`](../../product/directives/pd-config-003.md#pd-config-003) revision 3, 2026-10-07 (revision 4, 2026-10-13: a one-second limit reads "1 second").** Directly under the meta line, unchanged in form, the
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
  > **Narrowed by [`PD-ORCH-005`](../../product/directives/pd-orch-005.md#pd-orch-005) revision 4, 2026-09-28.** Clause 16: Cancel
  > is also enabled for a `paused` child of a session at rest, confirmed as REQ-MONITOR-128 requires. Steer and Pop
  > out are as stated.

**REQ-MONITOR-064** — When the shown agent has live (running, waiting, or queued) descendants, a cascade note states that cancelling cascades to that number of descendants; otherwise the note is empty.

> **Narrowed by [`PD-ORCH-005`](../../product/directives/pd-orch-005.md#pd-orch-005) revision 6, 2026-10-06.** Clause 23: the
> cascade note counts every descendant the cancel ends, live and paused, and says which ("Cancelling cascades to 2
> live and paused descendants.").

**REQ-MONITOR-065** — The inspector's context meter must be labeled as one agent's own context window, never as a session-wide usage figure. An unknown or idle agent shows an empty ring (zero used against a nominal limit) with the threshold still marked.

**REQ-MONITOR-066** — Given an agent whose model has since disappeared from the catalog, the model selector must still name that model as its current value rather than showing a wrong or blank one.

**REQ-MONITOR-067** — Model pickers list models the provider currently withholds, annotated with the provider's reason, instead of dropping them from the list.

### 7. Per-persona agent windows

**REQ-MONITOR-068** — A pop-out window exists per persona, titled with the product name and the persona, sized 820×620 by default, with a header summarizing the number of instances, one tab per agent instance of that persona (tab tooltip `{state} · {activity}`), and a persona-wide artifacts card listing artifacts from all instances with an explicit empty state.

**REQ-MONITOR-069** — Each instance tab shows: status dot, agent name in the persona color, and state; an agent-scoped transcript card with an explicit empty state; a context card with a ring and a line of the form `{N} tool calls · {elapsed or hyphen}`; an instance-controls card with read-only model and reasoning values; a current-activity card rendering the activity text as Markdown with an explicit empty state; a tools-and-artifacts card listing available tools (the same resolved set the inspector shows), one line per MCP server, the currently active tools, and artifact links; and a steer card.
  > **Extended by [`PD-CONFIG-003`](../../product/directives/pd-config-003.md#pd-config-003) revision 3, 2026-10-07 (revision 4, 2026-10-13: a one-second limit reads "1 second").** Directly under the state, the instance tab of an agent cut
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
  > **Narrowed by [`PD-MONITOR-007`](../../product/directives/pd-monitor-007.md#pd-monitor-007), 2026-10-06.** A configured compression
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

> **Narrowed by [`PD-MONITOR-003`](../../product/directives/pd-monitor-003.md#pd-monitor-003), 2026-10-06.** The run-level agent the
> inspector, the Mission view and the persona windows present carries its own tool-call count and called history (the
> roots'); the aggregate run count is the run's total of REQ-MONITOR-102, and no surface draws an aggregate called-tool
> history. Every other node is as stated above.

**REQ-MONITOR-102** — Per-agent metrics are persisted with the session and comprise: tool-call count, per-tool-name counts, token usage, cost, compression count, and last prompt tokens. A session-wide total tool-call count is also persisted, and a displayed total is the persisted value, carried to the surface on the whole-session update (REQ-MONITOR-216) rather than tallied by that surface for itself.

**REQ-MONITOR-103** — Tallying tool rows from a conversation transcript is idempotent: reading the same transcript again, whole or in part, must leave every tool-call total exactly as it was. A row may contribute to a total at most once, whatever a reader's position in the transcript.

**REQ-MONITOR-104** — Each agent's in-flight tool calls are tracked and surfaced as active chips. When an agent reaches a terminal state, or is settled by the run ending, its active chips must be cleared so a stale in-progress indicator cannot persist.

**REQ-MONITOR-105** — Tool rows in the transcript carry a machine-readable status of `running`, `ok`, `failed`, or `blocked`, plus a duration. A running tool renders as a pulsing in-progress row; a finished tool renders its outcome and elapsed inline (for example an `ok` outcome with a seconds figure). `blocked` covers every case in which no outcome was observed — the call was refused before it ran, or the run ended before it reported (REQ-MONITOR-228) — and a `blocked` row must convey which of those happened.

**REQ-MONITOR-106** — A verification row's status is the check outcome rendered through the mapping of REQ-NOTIFY-142, over the closed five-value check-outcome vocabulary of REQ-ORCH-123 and into the row-status vocabulary of REQ-MONITOR-105. This domain holds no copy of the vocabulary or of the mapping and states no second mapping of its own; what it relies on them for is that the mapping is total over all five outcomes, so no check outcome reaches a row without a status, and that a check which never ran — skipped or invalid — never renders as a passing row, because nothing was verified. Where this document names a check outcome, as REQ-MONITOR-302 does, it names a member of REQ-ORCH-123's set.
