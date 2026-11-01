# Notifications, Error Handling, and Recovery — B6. Run lifecycle vocabulary and run controls

Part 3 of 7 of [domain 19](../19-notifications-errors-recovery.md), which indexes every part. Defines REQ-NOTIFY-048 – REQ-NOTIFY-198.

### B6. Run lifecycle vocabulary and run controls

**REQ-NOTIFY-048** — One normalised lifecycle vocabulary reaches the screen, its members being `cancelling`, `completed`, `failed`, `idle`, `paused`, `pausing`, `running`, `starting` and `stopped`. A raw backend or persisted status string is never rendered. The member `cancelled` is withdrawn from this vocabulary: no value of the persisted vocabulary of REQ-SESSION-073 reaches it, a run that came to rest without completing persisting `stopped` instead, and an unreachable presentation state would be a word every surface must learn and none can ever show. The vocabulary therefore keeps nine members, `stopped` taking the place `cancelled` held. `stopped` states only that the run ended without completing; it does not say who or what ended it. More than one condition persists it — a user stopping the run and an exhausted run budget alike (REQ-SESSION-073) — so no surface may read a cause out of the status. Where the cause is to be shown it is taken from the recorded stop reason (REQ-MONITOR-301), never inferred from `stopped`.

**REQ-NOTIFY-049** — A status recorded by a backend or read from persisted state is presented through that vocabulary by an arm stated here, and every value of the closed persisted vocabulary of REQ-SESSION-073 has one: a value that is itself a member of REQ-NOTIFY-048 presents as itself, which covers `idle`, `running`, `paused`, `completed`, `failed`, `stopped`, `starting`, `pausing` and `cancelling`; `background` presents as `running`; `waiting` presents as `running`, so a run parked on a provider quota wait is busy under REQ-NOTIFY-050 and its composer stays locked, which is what REQ-NOTIFY-263 requires of that wait and what a mapping to `idle` would break; `paused_message_limit` presents as `paused`, so a run stopped at its message limit reads as paused rather than idle and the continuation offered by REQ-NOTIFY-266 is consistent with what the screen says; `awaiting_plan_decision` presents as `paused`, which is not busy and reads as resumable rather than finished, matching a run held at the plan gate that resumes the moment the user answers it (REQ-ORCH-153) — that gate's own decision surface is REQ-ORCH-153's and this presentation neither carries nor replaces it; `interrupted` presents as `idle`, consistent with a repaired session presenting as not busy under REQ-NOTIFY-151 and REQ-NOTIFY-160. The catch-all reaches only a value outside every arm above, which can arise solely from a session record written by a different version of this product: such a value presents as `idle`. No canonical persisted status is presented through that catch-all. No arm is stated for any value outside REQ-SESSION-073, because no part of the product may persist one; the arms above are therefore exactly the fourteen members of that vocabulary and nothing else.

**REQ-NOTIFY-050** — A run is busy while its normalised state is `starting`, `running`, `pausing` or `cancelling`.

**REQ-NOTIFY-051** — The prompt composer is locked while the focused run is busy. Starting a new run is presented distinctly from continuing a completed or paused session.

**REQ-NOTIFY-052** — Progress is shown for the whole time a pause, a cancellation, a context compression, a refresh or an authentication operation is in flight.

**REQ-NOTIFY-053** — Cancelling a run or an agent requires confirmation. The confirmation names every live descendant that will also be cancelled, states that the cancellation cannot be undone within the session, places initial keyboard focus on the choice that cancels nothing, and marks the confirming control as destructive with an accessible description stating that the action is irreversible.

**REQ-NOTIFY-054** — Where a status was shown optimistically and the underlying operation then refuses, the status returns to its previous value and an error acknowledgement states that the operation is no longer possible.

**REQ-NOTIFY-055** — Closing the application while runs are active raises a confirmation stating how many runs are active and that work in flight may not finish. Confirming requests shutdown of every active run.

**REQ-NOTIFY-056** — Closing the application while an isolated worktree integration is running is refused, with a message asking the user to keep the application open until the integration finishes.

> **Narrowed by [`PD-SHELL-009`](../../product/directives/pd-shell-009.md#pd-shell-009) revision 3, 2026-10-20**
> ([OQ-361](../../archive/architecture/open-questions/63-spikes-and-later-questions-30.md#oq-361), ruled under [R-072](../../product/requests.md#r-072)). The
> application's close — the last main window's, the update's `Restart now` and the installer's hand-off — is refused while
> main records a worktree integration running, as written. A record main cannot read refuses no window's close: the close
> goes on to the active-run guard, with a `warn` line; the update declines instead and starts nothing. A shutdown that no
> user gesture started is not refused (REQ-NOTIFY-057).

**REQ-NOTIFY-057** — A shutdown that no user gesture initiated raises no interactive dialog.

**REQ-NOTIFY-058** — A run starting sets its session status to running, clears any notice that is unscoped or scoped to that same session, records the sandbox verdict for that session, attaches its output streams and shows the workspace view.

**REQ-NOTIFY-059** — The focused run reaching `completed` raises a persistent success notice inviting review of the transcript and the session artifacts, with an action opening the artifacts library. The terminal members of the vocabulary of REQ-NOTIFY-048 are exactly `completed`, `failed` and `stopped`. `failed` raises nothing under this requirement; its detail arrives through the classification of REQ-NOTIFY-060. `stopped` produces only a transient acknowledgement naming that status. A focused run coming to rest in `idle` or `paused`, neither of which is terminal, likewise produces only a transient acknowledgement naming that status, except where another requirement fixes a different report for that condition, as REQ-NOTIFY-266 does at the message limit and as REQ-ORCH-153 does at the plan gate, whose own decision surface is that report. Every state a run comes to rest in is therefore reported exactly once.

### B7. Transient failures and bounded operations

**REQ-NOTIFY-094** — A failure is transient where the provider raises its own rate-limit or service-unavailable exception type, or where its text or type name contains any of `apiconnectionerror`, `connection aborted`, `connection error`, `connection reset`, `incomplete chunked read`, `peer closed connection`, `service unavailable`, `temporarily unavailable`, `timed out`, `timeout`, `transport`. An interruption of a response already streaming is transient.

**REQ-NOTIFY-095** — These are not transient and are never retried automatically: an overall operation timeout, a request-encoding error caused by non-ASCII content, an insufficient-quota error, an authentication error.

**REQ-NOTIFY-096** — A transient failure inside a delegated child task is retried up to `runtime.auto_retries_transient`, default 1. Each retry waits a number of seconds equal to the attempt number, capped at 2, logs a warning naming the attempt and the limit, and files a diagnostics issue recording the attempt.

**REQ-NOTIFY-097** — Where the transient retry bound is spent, or the failure was never transient, the child task fails as an orchestration outcome in its own right — not as a crash of the scheduler, and not silently.

**REQ-NOTIFY-098** — Structured output is requested in one fixed order of preference: a provider-native response schema the provider itself enforces; a tool call whose parameters carry the schema; a provider JSON-object mode carrying no schema; and finally a plain text response parsed against the schema. A provider refusing a requested structured-output format does not fail the operation: the operation completes in the next format in that order that provider accepts, and no error about the refusal reaches the user. Where the last format in the order is also refused, the operation fails as an ordinary failure and is reported as one. Within one run of the application, a format a given model has already refused is not requested from that model again. A restarted application requests the preferred format from that model once more, with no user action.

**REQ-NOTIFY-099** — Where a model produces no event within `runtime.llm_response_timeout`, default 120 seconds and no lower than 30, the model is treated as unresponsive and the persona-level fallback model is activated where one is configured. The child task continues rather than being terminated.

**REQ-NOTIFY-100** — Seven operations are bounded independently, and each bound can be changed without changing another: a child task's total run, `runtime.child_timeout`, default 1200 s; a child task producing no output, `runtime.child_stall_timeout`, default 90 s; one tool call, `runtime.tool_call_timeout`, default 30 s; one shell command, `runtime.shell_command_timeout`, default 100 s; generating a summary, `runtime.summary_timeout`, default 120 s; a loop-classification call, `runtime.loop_classification_timeout`, default 2 s and never more than what remains of the activation budget of REQ-NOTIFY-106; post-run improvement analysis, `runtime.improvement_collector_timeout`, default 60 s. Exceeding a bound ends only the operation that bound governs, and the result is reported as that operation's own timeout rather than as a failure of the run containing it. `runtime.auto_retries_validation` defaults to 0, so by default a validation failure is reported once and the validation is not repeated.

**REQ-NOTIFY-101** — Where intent classification times out, fails, or returns a value with no mapping, a generic default intent is used and the run continues. Classification failure never stops a run.

### C1. Child dependencies and terminal child states

**REQ-NOTIFY-113** — A child task starts only once every task named in its dependency list has reached `succeeded` and has produced its mandatory report artifact. A dependency without its report artifact does not count as satisfied.

**REQ-NOTIFY-114** — A cycle among dependencies is a validation error, and the child it affects is not started.

**REQ-NOTIFY-115** — A child task does not start by itself while any task in its dependency list ended `blocked`, `cancelled` or `failed`. Its own state reads `blocked`, and it continues to read `blocked` until a user or a re-delegation acts on it.

**REQ-NOTIFY-116** — A child task ends in exactly one of `blocked`, `cancelled`, `failed` or `succeeded`, and reports no state afterwards. `blocked` is among those final states and is reachable from every state that is not already final. The answer to whether a child has finished is the same wherever it is asked — in the delegation display, in a dependant's readiness check, in a post-crash sweep, at re-delegation.

**REQ-NOTIFY-117** — Child state is projected for display as follows: waiting on dependencies and waiting on a model slot render as waiting; `blocked` renders in the failed presentation; summarizing renders as running; an unrecognised value renders as queued. Declared dependencies are carried through and drawn in the delegation tree.

**REQ-NOTIFY-118** — A child reaching a terminal state during a tool call has its live tool indicators cleared, so a stopped agent shows no tool in progress.

**REQ-NOTIFY-119** — A transcript tool row carries a status of `blocked`, `failed`, `ok` or `running`. `blocked` is the presentation for a tool call the permission policy refused and for a verification check that was skipped; neither is presented as success.

**REQ-NOTIFY-120** — Where a loaded snapshot's session status states that no run can still be active, agents still marked running are settled: `completed`, `succeeded` and `done` become done; `failed` and `error` become failed; every other value becomes cancelled. Their activity text states that they ended with the run, and their active tools are cleared. A session status of `idle` leaves agents untouched. A stale or older-format snapshot therefore never renders a finished run above a live activity indicator.

**REQ-NOTIFY-121** — Once a process holds a session's `lock`, no child record left by an earlier occupant of that session reads as unfinished: every such record reads `cancelled`, carries a completion time, and shows no tool call in progress. Performing this again on the same session changes nothing further.
  > **Narrowed by [`PD-ORCH-005`](../../product/directives/pd-orch-005.md#pd-orch-005), 2026-09-27 (revision 2).** The settle still runs, and no longer touches a `paused` agent: that agent is resumed with its iteration instead of being cancelled.

### C2. Child reports and re-delegation

**REQ-NOTIFY-122** — Every terminal child state produces a report artifact, generated by a separate inexpensive summarizing agent whose only task is to summarize, and the parent reads that artifact rather than the child's raw transcript. It is typed JSON requiring at least `agent_name`, `persona` and `status`.

**REQ-NOTIFY-123** — On resume, the parent receives the structured report artifacts of children that have newly reached a terminal state, together with the current state of all its children, and may re-delegate any of that work. A re-delegation receives a fresh unique name formed from the original name and a numeric suffix.

**REQ-NOTIFY-124** — Failure detail presented to a host has internal prefixing removed, so the underlying provider or tool reason is what the user reads. The failure detail travels to the parent on the report artifact.

**REQ-NOTIFY-125** — Where an iteration ends with work incomplete while background children are still in flight, the re-queued task payload lists each in-flight task by name, persona, task identifier and state, instructs that they are not to be re-delegated because they are running and will produce their artifacts on their own, and instructs that only the remaining incomplete items be worked. Any continuation block left by an earlier attempt is removed before a new one is appended.

### C3. Verification evidence and completion gating

**REQ-NOTIFY-126** — Verification results are stored in the child report as a structured evidence field carrying a verdict of `failed`, `passed` or `skipped`, and that verdict survives a JSON round trip. A suite that never ran reads `skipped` and never `passed`.

**REQ-NOTIFY-127** — Fields that only the execution runtime may set — verification evidence, gate decision, repair decision, completion-contract fields — are removed from model-authored output before the report is stored.

**REQ-NOTIFY-128** — The completion gate this document reports on is the one REQ-ORCH-116 defines, which is the product's single definition of it. This document declares no gate-decision vocabulary of its own and holds no copy of the decision values: what it relies on that requirement for is the closed set of decisions, the point in the sequence at which the gate is applied, what does and does not gate, and the gate's override of the classifier's verdict together with the preservation of the overruled verdict on the decision record. What this document supplies is how that decision reaches the user and the run: the surfaces of REQ-NOTIFY-130 through REQ-NOTIFY-134 and the report field of REQ-NOTIFY-127.

**REQ-NOTIFY-129** — A check the permission policy denied is recorded `skipped` and counts as missing evidence, never as passing. A failing advisory check does not gate and is named in the outcome.

**REQ-NOTIFY-130** — The decision is `exempt` where no suite ran at all: a read-only task, an explicitly empty `verifier.checks`, a suite that could not be detected, or a degraded path in which verification itself failed.

**REQ-NOTIFY-131** — A gated report is rewritten to a partial status, so the existing re-queue behaviour applies. The decision is emitted as a completion-gate timeline event. Setting `verifier.gate_completion` to false for a workspace stops gating there, while checks still run and evidence is still reported.

**REQ-NOTIFY-132** — Failing blocking checks cause the work to be re-delegated with the failing evidence attached: the next attempt's execution payload carries a block naming each failing blocking check with its name, its command, its status, its exit code, an excerpt of its output and the path to its full log. That block replaces any block injected by an earlier attempt.

**REQ-NOTIFY-133** — Each gated iteration spends one attempt from `verifier.max_repair_attempts`, default 2 and configurable down to 0. At 0, a gated result is reported as a failure and no further attempt is made. The budget covers one task at a time, starts each run full, and returns to full once that task's checks pass. A re-queue caused by ordinary incomplete work spends none of it. A repair attempt is otherwise an ordinary iteration and counts against the run's iteration limit and against any limit on repeating the same task.

**REQ-NOTIFY-134** — Where the repair budget is spent, the report becomes failed naming the checks that failed, escalation is emitted both as a timeline event and to the host hook, and the session's other tasks continue. Scheduling of a repair attempt is likewise emitted as a timeline event.

**REQ-NOTIFY-135** — `invalid` is recorded for a check that cannot be run as written, and it is reported distinctly from a check that ran and found a defect. An `invalid` check does not gate, spends no repair attempt, and contributes nothing to the failing-check block of REQ-NOTIFY-132. Where another check of the same role and the same severity is available, the suite runs that one in its place, at most once per role per session, and the substitution appears in the suite's reported results.

**REQ-NOTIFY-136** — A change that weakens a gate — dropping a role, lowering a severity, emptying the suite — is outside the authority of every automatic path and becomes an approval-gated improvement proposal. Repeat proposals for the same change are collapsed into one.

**REQ-NOTIFY-137** — While a workspace declares no quality gate, work still completes, and every report of the run states the gap: the child report records that no gate is established, and the run header and the session summary each display a warning for as long as that holds. Every surface displays the identical sentence, character for character, and no surface composes wording of its own. Two sentences exist: one used where a gate-authoring note was found in the workspace, which cites that note, and one used where none was found. A gate-authoring note is exactly the artifact that gate authoring under REQ-NOTIFY-138 wrote into the workspace proposing a quality gate that has not yet been applied; it counts as found where that artifact exists and parses, and nothing else in the workspace counts as one. No file authored by the workspace's own contributors is read for this purpose, so the sentence a user sees never depends on how their repository happens to be documented. Each states that this workspace has no quality gate and how the user declares one through `verifier.checks`, or states that nothing verified this run.

**REQ-NOTIFY-138** — For a workspace with no project yet, the missing-gate warning is empty rather than displayed. Setting `verifier.checks` to an empty list ends the warning permanently; setting it to a non-empty suite ends gate authoring. `verifier.author_gate`, default true, switches gate authoring off; while off, every gate write is routed to an approval proposal.

### C4. Verification while a suite runs

**REQ-NOTIFY-139** — A verification suite is observable while it runs, not only once it has finished. The user is told the suite has started before its first check runs. Every check is reported twice, once on starting and once on settling, and each report names the check, its position within the total number of checks, and the number of seconds it is allowed. Suite start, check start and check finish are each recorded in the session timeline, so watching a suite live and reading the same suite back from the timeline afterwards yield the same events in the same order.

**REQ-NOTIFY-140** — On the desktop, a run that is verifying is distinguishable from a run doing other work. The run header names the check now running, its position within the suite, how long it has been running and how long it is allowed. The transcript gains one row per check, counting upward while the check runs and settling to that check's outcome, its duration and an excerpt of its output. Run controls behave exactly as they do elsewhere in the run, and the normalised lifecycle state stays `running` for the whole suite. The activity label states that verification is in progress and gives the check position, in the form `unit tests (2/3)`.

**REQ-NOTIFY-141** — While a suite runs, the user can read all of the following without opening a panel or a dialog: that verification is active; the name and the command of the check now running; its position within the total; how long it has been running, advancing continuously rather than only when a new event arrives; and the number of seconds it is allowed. The missing-gate warning of REQ-NOTIFY-137 is displayed whenever it applies, including at times when no suite is running.

**REQ-NOTIFY-142** — The check-outcome vocabulary this rendering maps from is REQ-ORCH-123's, which is the product's single definition of it and which this document does not restate; the transcript row status vocabulary it maps onto is REQ-CHAT-060's. The mapping is total over all five outcomes, as REQ-ORCH-123 requires of any rendering of them: `passed` to `ok`; `failed` to `failed`; `timeout` to `failed`; `skipped` to `blocked`; and `invalid` to `blocked`, never to `failed`, because a check that cannot be run as written did not run, and REQ-NOTIFY-135 requires it to be reported distinctly from a check that ran and found a defect. Where a row is `blocked`, the reason is reachable from it under REQ-CHAT-060, so an `invalid` check and a `skipped` one are told apart there rather than by the status word.

**REQ-NOTIFY-143** — A skip the user asks for is not a failure. The skip delivers the terminal's interrupt to the check's process group. A command that traps the interrupt and keeps running is abandoned after a 5-second grace period and its terminal is torn down; only in that abandoned case is the execution environment rebuilt.

**REQ-NOTIFY-144** — A suite is bounded: one check per semantic role, and a whole-suite budget, `verifier.suite_timeout`, default 900 seconds, bounding the run end to end. Each check carries its own timeout, default 600 seconds, and no check is given more time than the suite budget has left. A check the remaining budget cannot start is recorded `skipped`, naming the exhausted suite budget in seconds and directing the user to raise it or shorten the checks ahead of it.

**REQ-NOTIFY-145** — Check execution inherits the standard outcome classification, so an exit status of 0 whose output reports test failures is reported as failed; the permission policy, so a denied check is `skipped`, names the rule it violated, and never passes; and sandboxing. The full output of every check is retained and reachable in full from that check's own record, after the run has ended and without the run existing (REQ-ORCH-123); suite completion or skipping is recorded as a timeline entry.

### D1. Checkpoints: listing, preview and restore

**REQ-NOTIFY-188** — Checkpoint availability is the engine's verdict and carries its own unavailability reason. A separate blocked reason covers restore refusals not tied to any particular checkpoint; a session still running is currently the only such reason.

**REQ-NOTIFY-189** — A checkpoint preview states whether restoring it requires an explicit overwrite opt-in — the case where dirty paths are present or the blocked reason is forceable — and whether it is restorable at all — the case where there is no blocked reason, or the blocked reason is forceable.

**REQ-NOTIFY-190** — A restore outcome reports whether the restore happened, how many files changed, the sequence number of the pre-restore safety checkpoint with zero meaning none was needed, and any blocking reason.

**REQ-NOTIFY-191** — Preview lines, and the per-path verb in each of them, come from the engine. The presentation layer renders them as given and derives no verb of its own from a status letter.

**REQ-NOTIFY-192** — A request to list checkpoints made while the checkpoint channel is occupied is re-attempted on the cadence REQ-SHELL-156 fixes, which this domain cites rather than restating, for at most 10 seconds, and while it is being re-attempted it is not reported as a failure. Where the channel has not become free within that bound, the request stops and the listing is reported as a failed listing under REQ-NOTIFY-195, its detail stating that the checkpoint channel stayed occupied. The request is never re-attempted without a bound, so the user is never left with an indicator that does not resolve. Preview and restore each display a window-modal progress dialog naming the operation and the checkpoint it concerns, showing indeterminate progress, offering no cancel control, and carrying an accessible name identifying it as checkpoint progress.

**REQ-NOTIFY-193** — Three refusals produce acknowledgements: a restore attempted with no workspace open produces an error acknowledgement saying so; a restore attempted while checkpoints are still being read produces an acknowledgement asking the user to try again shortly; a failed inspection produces an error acknowledgement stating that the checkpoint could not be inspected.

**REQ-NOTIFY-194** — A preview that is not restorable publishes an error notice naming the checkpoint and carrying the engine's blocked reason. A failed restore publishes an error notice naming the checkpoint and carrying the engine's reason, or, where no reason is available, stating that the working tree was left unchanged.

**REQ-NOTIFY-195** — A failed checkpoint listing publishes an error notice stating that the session's checkpoints could not be read and that the session store for this workspace could not be reached, carrying the raw message as copyable detail.

**REQ-NOTIFY-196** — A successful restore publishes a persistent success notice naming the checkpoint and the number of files changed, and stating either which safety checkpoint holds the pre-restore state, or that no safety checkpoint was needed because the tree already matched the last commit. Version-control state and the checkpoint list are refreshed afterwards.

**REQ-NOTIFY-197** — Each opening of the restore preview describes the checkpoint about to be restored now. Content belonging to an earlier restore is never shown again, whether that earlier restore completed, failed or was cancelled.

**REQ-NOTIFY-198** — Cancelling a restore produces an acknowledgement stating that the working tree was not changed.
