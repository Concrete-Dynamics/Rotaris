# Run Monitoring and Steering — 29. Commands and keyboard access

Part 6 of 8 of [domain 02](../02-run-monitoring-steering.md), which indexes every part. Defines REQ-MONITOR-265 – REQ-MONITOR-298.

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
