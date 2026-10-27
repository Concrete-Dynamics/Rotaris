# Notifications, Error Handling, and Recovery — D2. Requirement flows abandoned mid-run

Part 4 of 7 of [domain 19](../19-notifications-errors-recovery.md), which indexes every part. Defines REQ-NOTIFY-161 – REQ-NOTIFY-235.

### D2. Requirement flows abandoned mid-run

**REQ-NOTIFY-161** — A requirement left in a running state by a stopped process is corrected only where three facts hold together: no flow in the current process owns that requirement; no session behind any of its in-flight runs is alive; and nothing has shown a sign of life within the abandonment grace period.

**REQ-NOTIFY-162** — The abandonment grace period is 15 minutes, measured from the most recent of the delivery state's last change time, the flow record's last update time, and each in-flight run's start time. A flow with no run record yet is covered by the first two of those, so a flow started moments ago is never closed.

**REQ-NOTIFY-163** — The correction closes in-flight run records as interrupted, with a failure reason stating that no process owned the run any more and that a recovery pass closed it. Worktree, branch, commits and changed files are left as they are.

**REQ-NOTIFY-164** — The correction marks the delivery item **blocked**, attributed to a system recovery actor, with a run-failure cause and a reason stating that the run's process is gone and naming the ISO timestamp since which nothing has owned the work. The item's delivery state does not change: it remains `running`, which is the state it occupied when the process was lost. Marking blocked is not a move along the delivery pipeline, and this domain relies on REQ-TRACE-232 and REQ-TRACE-233 for that — those requirements own the axis, and clearing this blocker therefore returns the card to `running` and to no other state.

**REQ-NOTIFY-165** — The recovery pass produces the same result when run again, and reports one entry per requirement it corrected naming that requirement, the delivery state it remains in, and the blocking condition recorded under REQ-NOTIFY-164. Those three facts are required; their wording and their arrangement are the implementation's. The report SHALL NOT name a state the requirement was moved to, because none was. The report is displayed in the view from which the pass was requested and its detail is copyable under REQ-NOTIFY-038.

**REQ-NOTIFY-166** — Where a session store cannot be opened, or a liveness probe raises, every session is reported live and no correction is made.

**REQ-NOTIFY-167** — A restart rebuilds units, runs and worktrees from persisted state; a run whose process is gone is carried as interrupted rather than running; no requirement is returned to the backlog; the queue resumes where it stopped without re-running a finished unit; and closing the application mid-run and reopening it finds the work where it was left.

**REQ-NOTIFY-168** — A run record that is both terminal and unsuccessful cannot be stored without a stated failure reason.

### D3. Sessions left by a stopped process: detection

**REQ-NOTIFY-146** — A session whose process stops without writing a terminal execution status keeps the status it last wrote. Until it is repaired it reads as active, and every operation requiring a non-busy session — a checkpoint restore, a session-list action — sees it as busy. This states how the unrepaired session reads; it does not state a gate. Worktree integration is the one operation exempt from it, and the integration precondition is bound by REQ-NOTIFY-159 alone.

**REQ-NOTIFY-147** — A session is live exactly where its `lock` file exists and the process id recorded in that file is alive.

**REQ-NOTIFY-148** — A session is stale exactly where its execution status is one of `background`, `cancelling`, `pausing`, `running` or `starting` and it is not live. A session carrying a terminal status is never stale, whatever the lock file says.

**REQ-NOTIFY-149** — Two observations, and only these two, make a session read as not live: the `lock` file is absent, or the operating system reports definitively that the process id recorded in it is not running. Every other observation leaves the session reading live, including a `lock` file that exists but cannot be read, one that can be read but records no process id, one recording a value that is not a positive integer, and a query about that process id that fails or returns no answer.

**REQ-NOTIFY-150** — Detection reads session metadata and the `lock` file only. It never reads a state snapshot and never writes. No read path, listing sessions among them, repairs anything.

**REQ-NOTIFY-154** — Asking whether a session's process is alive does not disturb that process. On every supported operating system, and after any number of such questions, a running session continues exactly as before: it is not interrupted, suspended or terminated, it receives no signal, and its output is what it would have been. Three readings are wrong in a stated direction. A session whose process the operating system cannot distinguish from a running one reads live although it has ended. A session whose recorded process id has since been reissued to an unrelated process reads live. A session owned by a process on a different machine sharing the same workspace generally reads not live; running two machines against one workspace is unsupported.

### D4. Sessions left by a stopped process: repair and how it is announced

**REQ-NOTIFY-151** — A repaired session's execution status reads `interrupted`, a value outside the active set of REQ-NOTIFY-148, so the session no longer reads as busy. That status is durably recorded before the orphaned lock is released. Two consequences are observable: a process dying part-way through a repair leaves the session reading `interrupted` with its lock still held, and never leaves it reading as still running with the lock already released; and a repair whose lock release fails still leaves the session usable.

**REQ-NOTIFY-152** — A repair files a warning-severity diagnostics timeline entry attributed to the system actor, naming the previous status and the reason the session was judged not live, and stating that the status was set to `interrupted`.

**REQ-NOTIFY-153** — A session is repaired only when a repair is requested. Requesting a repair of a session that is live, one already carrying a terminal status, or one whose files cannot be read or written leaves it exactly as it was, and is reported as nothing to do — not as an error, and never through an error notice. Requesting it again after a successful repair changes nothing further. A repair can be requested over a whole workspace at once, in which case every session reading stale is repaired and each repaired session is reported separately under REQ-NOTIFY-264.

**REQ-NOTIFY-155** — *Withdrawn.* Its only surface was a command-line subcommand and a line-oriented output format written for a shell, neither of which this product has; the workspace-wide repair capability and its per-session report are carried by REQ-NOTIFY-264.

**REQ-NOTIFY-156** — The session list marks a stale session as stale, in addition to the status it presents under REQ-NOTIFY-049, so a session left behind by a stopped process is distinguishable from one that never ran without the user opening or querying anything. The marker is not carried by colour alone and is exposed in the row's accessible name.

**REQ-NOTIFY-157** — The desktop treats a stale session as not running and repairs it on the user's action path: where a checkpoint listing shows a session as busy while the process probe reports its process dead, a repair is requested, and is skipped where the repair channel is already busy. On repair, a persistent warning notice states the previous status, the reason, and that the session was marked interrupted so its checkpoints can be restored again, and the session list is refreshed. Afterwards, checkpoints are available, the persisted status reads `interrupted`, and the `lock` file is gone.

**REQ-NOTIFY-158** — A session that is genuinely live stays refused, and the refusal states which claim is being made. Two reasons exist and stay distinct: the session is still running, so a restore would race the run's own writes and the user should wait for it to finish or pause it first; or liveness could not be confirmed, so no restore will be risked and the user should try again shortly. The disabled restore control carries the applicable reason in both its tooltip and its accessible description.

**REQ-NOTIFY-159** — A stale session does not block a worktree integration: the integration's precondition check does not treat it as busy, and the integration proceeds. That check repairs nothing and writes nothing — after it has run, the session's recorded execution status, its `lock` file and its timeline are exactly as they were.

**REQ-NOTIFY-160** — A repaired session presents as not busy. In the normalised lifecycle vocabulary an interrupted session and one that never ran both present as `idle`; no member is added to that vocabulary for `interrupted`, so the busy test of REQ-NOTIFY-050 stays over the nine members of REQ-NOTIFY-048. The two are still told apart on the session list, where a session whose persisted execution status is `interrupted` carries a marker saying so, drawn on the same terms as the stale marker of REQ-NOTIFY-156 and never by colour alone.

**REQ-NOTIFY-264** — Repair over a whole workspace is reachable from the session list, which offers one action repairing every session that reads stale, described as marking every session whose process died as interrupted so its checkpoints can be restored and its workspace integrated again. The action reports, for each session it repaired, that session's identity, the status it previously carried and the reason it was judged not live; where it repaired nothing it states that no session was left marked as running by a stopped process, and that is not reported as an error. The report is readable after the action finishes and its detail is copyable under REQ-NOTIFY-038. Its wording is the implementation's; the facts it names are not. Requesting it again immediately afterwards repairs nothing further and reports the same nothing-to-do outcome, per REQ-NOTIFY-153.

### E1. Board refusals, blockers and standing banners

**REQ-NOTIFY-178** — A requirement that cannot be moved where the user dropped it returns to the column it came from, and the refusal is stated in a message that stays on screen until the user dismisses it or the condition it names is satisfied. That message uses the wording supplied with the refusal, names the precondition that was not met, and states what would satisfy it. A refusal reported only as a transient acknowledgement, and a card that returns with no message, both fail this requirement.

**REQ-NOTIFY-179** — While a card is being dragged, columns it cannot reach are indicated by more than colour.

**REQ-NOTIFY-180** — A refused move is not an error state of the board view and is not counted as a board error.

**REQ-NOTIFY-181** — Each standing feedback entry renders as its own persistent banner with its own severity and its own dismiss control, whose accessible name identifies the requirement whose feedback it dismisses.

**REQ-NOTIFY-182** — Five kinds of blocker exist, each with a defined display and a defined way for the user to answer it. A conflict blocker shows both conflicting requirements together and lets the user choose one of them or open either. A decision blocker shows the question and, for each option, what choosing it leads to, and lets the user choose one. A dependency blocker shows what is being waited for and lets the user open it. A person-stated blocker shows the reason that person recorded and lets the user resume from the point at which the block was raised. A run-failure blocker shows the reason the run gave and lets the user open that run. A blocker whose kind is none of these five is still displayed and is never hidden or presented as unblocked: it shows the reason recorded on it word for word under REQ-NOTIFY-183, states that its kind is not one for which the board defines an answer, and offers exactly one thing to do — opening the requirement it blocks, so the user can act there. It offers no choice, because none is defined for it, and the board invents none.

**REQ-NOTIFY-183** — A blocker's reason, its question and the consequence of each of its options are displayed word for word as supplied, and the board substitutes no wording of its own. Answering a blocker does not itself perform the work: the answer is submitted as an ordinary board change, subject to the same validation and the same refusal feedback as any other board change under REQ-NOTIFY-178. The requirement then resumes from the state recorded when it was blocked.

**REQ-NOTIFY-184** — A blocker offering the user no choice is still displayed, and still offers at least one thing to do: a blocker waiting on a dependency offers to open that dependency, a run failure with no retries left offers to open the failed run, and a blocker of an unrecognised kind offers to open the requirement it blocks.

**REQ-NOTIFY-185** — Three further board surfaces exist: a banner listing blocked requirements with a per-row control returning each one; a banner narrating a running board-wide verification pass through the inline progress meter of REQ-NOTIFY-043 with a percentage and a counted label, carrying no action, dismiss or copy control; and a banner offering adoption of newly discovered requirements, whose dismissal means the finding is put away.

**REQ-NOTIFY-186** — The board renders verdicts produced elsewhere and derives none of its own.

**REQ-NOTIFY-187** — Evidence recorded for a requirement reads stale as soon as either value it was recorded against under REQ-NOTIFY-176 stops matching: the recorded commit is no longer the requirement's current commit, or the recorded requirement-text hash differs from the hash of the requirement's current text. Either one alone suffices, so evidence can go stale without the requirement's own text having changed. Stale evidence is never displayed as passing, and detecting it changes the affected requirement's status rather than leaving it untouched: the requirement's delivery state moves to `needs-update` in the vocabulary REQ-TRACE-232 fixes, and it stays there until verification runs again and records fresh evidence. While that re-verification is outstanding the earlier evidence stays on screen marked stale, together with which of the two recorded values stopped matching; it is neither removed nor rewritten, so the user can see what was verified and why it no longer counts.

### E2. Requirement units: failure and bounded retry

**REQ-NOTIFY-169** — A unit whose run failed reads as failed and shows the reason it failed. Every unit reading as failed carries a non-empty reason on every surface it appears on — board, listing, message and persisted record alike — and an attempt to record a unit failure with no reason is refused rather than stored.

**REQ-NOTIFY-170** — The worktree and the branch of a failed unit are kept for inspection and are never removed automatically; only the user removes them.

**REQ-NOTIFY-171** — Retries are counted and bounded, and the bound is stated to the user. `requirements.execution.retry_limit` defaults to 1, giving 2 attempts per unit, and the stated bound reads as a number of attempts and a number of retries.

**REQ-NOTIFY-172** — Where the retry bound is spent, the requirement is marked **blocked** naming the last failure. Its delivery state does not change: it remains the state it occupied when the last attempt failed. Marking blocked is not a move along the delivery pipeline, and this domain relies on REQ-TRACE-232 and REQ-TRACE-233 for that — those requirements own the axis, and clearing this blocker therefore returns the requirement to the state it was in and to no other. What the marking says is that no further attempt will start by itself, so a spent retry bound never leaves the requirement reading as though work were still in flight; the blocker is a run-failure blocker and is displayed under REQ-NOTIFY-182 and REQ-NOTIFY-184. An attempt to retry beyond the bound is an error, not a further silent run.

**REQ-NOTIFY-173** — Re-queuing a unit for retry increases its retry count and leaves the previous failure reason readable on the unit.

**REQ-NOTIFY-174** — A unit failure produces one message naming six facts: the requirement, the unit, which attempt failed, how many retries of the bound have been used and what the bound is, the failure reason required by REQ-NOTIFY-169, and the path at which the unit's work was kept under REQ-NOTIFY-170. All six are required; their wording and their arrangement are the implementation's. The message is displayed wherever the unit appears and its detail is copyable under REQ-NOTIFY-038.

**REQ-NOTIFY-175** — A unit reads as complete only where every one of the following is recorded as met: its tests were updated and executed; its work is traceable to the requirement it implements; its worktree is clean; its authorship is attributed; and no known drift remains. Known drift is exactly the staleness conditions of REQ-NOTIFY-187 evaluated against the unit's own recorded evidence — the recorded commit no longer being the requirement's current commit, or the recorded requirement-text hash differing from the hash of the requirement's current text — together with any traceability link the unit recorded that no longer resolves. No known drift remains exactly where none of those holds at the moment the unit's result is recorded. Values for these supplied in model output are discarded before the result is recorded. A unit whose tool calls the permission policy refused and which produced no commits reads as failed and names the refused tools; it never reads as succeeded. A result meeting some but not all of these conditions names each unmet condition separately.

**REQ-NOTIFY-176** — A unit's verification runs against that unit's own worktree rather than the main workspace, so changes made in the main workspace after that worktree was created do not alter the unit's verdict. The evidence recorded names the commit the verification ran against and a hash of the requirement text it verified, and both are readable from that evidence afterwards.

**REQ-NOTIFY-177** — Abandoning a unit or a requirement is an explicit user action and keeps the record of what was attempted.

### F1. Lifecycle hooks

**REQ-NOTIFY-223** — A lifecycle-hook advisory raised during a run becomes a persistent warning notice whose title states that hooks need attention, carrying the engine's message and an action opening hook settings.

**REQ-NOTIFY-224** — Where a workspace declares hooks the user has not reviewed, a persistent warning notice states how many are unreviewed, states that workspace hooks run shell commands supplied by the repository's own authors, states that those hooks stay skipped until the user reviews and allows them, and offers an action opening the review. Within one application session the notice is published once for each pair of workspace and declared hook set, the set identified by the workspace hook fingerprint of REQ-HOOKS-091, which this document cites and holds no copy of: a change to the declared set forms a new pair and publishes again, and a new launch publishes again while the condition still holds. Because notices are not persisted (REQ-NOTIFY-027), nothing about this suppression survives a restart. The review dialog never opens by itself at startup; it opens when the user asks for it.

**REQ-NOTIFY-225** — Both allow and refuse verdicts are persisted, so a refusal holds and the next session does not ask again.

**REQ-NOTIFY-226** — A hook's command text is displayed only inside the review dialog the user opened. It appears in no notice, acknowledgement, tab, tooltip or other surface, and once that dialog is closed it is displayed nowhere.

**REQ-NOTIFY-227** — Hook trust is reported by exactly one of four statements, exactly one of which applies at any moment: the workspace declares no hooks; it declares hooks that have not been reviewed, stating how many under REQ-NOTIFY-224; its hooks have been reviewed and allowed; its hooks have been reviewed and refused. Every surface reporting hook trust uses these four and adds no fifth. A recorded decision covers exactly the hook set it was recorded against, identified by the fingerprint of REQ-HOOKS-091, and adding, removing, altering or reordering a hook invalidates it under REQ-HOOKS-095. A workspace that gains a further hook after a review therefore reports the second statement, over the whole current set, and the count REQ-NOTIFY-224 states is the size of that set rather than of the part added since. No mixed statement exists, because no partial approval exists.

**REQ-NOTIFY-228** — Where a workspace declares no hooks of its own, an acknowledgement states that plainly instead of an empty list being shown.

### F2. Optional components and degraded features

**REQ-NOTIFY-236** — A failing step of first-run machine setup reports the tool it was installing or configuring, the command it ran, the exit status that command returned, and the reason it failed. It offers two choices: run the step again, or carry on without that tool. Setup never comes to rest on a failed step with no choice available.

**REQ-NOTIFY-237** — Choosing to carry on opens the application with exactly the affected feature degraded and everything else intact.

**REQ-NOTIFY-238** — With no network available, setup runs to completion: steps that only inspect the machine still run and report what they found, every step that would have downloaded something reports that the network could not be reached, and the run ends by naming each feature that is degraded and then opens the application.

**REQ-NOTIFY-239** — An optional integration is available where its prerequisite runtime is present on the machine, and unavailable otherwise. The bundled installer never downloads a third-party language runtime to satisfy one.

**REQ-NOTIFY-240** — Setup records completed steps and resumes at the first incomplete step after a crash or a cancellation; it runs once, with per-tool top-ups afterwards; it verifies downloads by checksum; and it never requests elevated privileges.

**REQ-NOTIFY-241** — *Withdrawn.* Its only surface was a headless command-line invocation reporting through stdout and an exit status, neither of which this product has; re-running and inspecting machine setup after first run is carried by REQ-NOTIFY-265.

**REQ-NOTIFY-242** — A configured MCP server reports health over the four-state vocabulary REQ-CONFIG-353 fixes, which this document cites and holds no copy of, with a detail string and an optional tool count. Probes run one per server, sequentially, on a background worker, so an unreachable server is one degraded row rather than a settings view that stops responding.

**REQ-NOTIFY-265** — Machine setup is reachable after first run, not only during it. Settings offers a setup surface listing every managed step with its recorded outcome, so a user who chose to carry on without a tool under REQ-NOTIFY-237 can see which feature is degraded and why. Each step offers running it again on its own, on the terms of REQ-NOTIFY-236, and each such run reports the tool, the command, the exit status and the reason within that surface without publishing a notice. Running one step again never re-runs a step that already completed, and the resumable state of REQ-NOTIFY-240 is what the surface reads and updates.

**REQ-NOTIFY-267** — A diagnostics view that cannot read or render its own data reports that within itself and nowhere else. It presents the failure as that region's empty condition under REQ-NOTIFY-006: one plain sentence stating that the session's diagnostics could not be read, the underlying reason in a copyable detail block under REQ-NOTIFY-005 and REQ-NOTIFY-038, and a control re-reading them. It publishes no notice and no acknowledgement, because the user is already looking at the surface that failed. A record it can read but cannot render is skipped and counted rather than failing the view: the remaining records are displayed and one line states how many were unreadable. An empty diagnostics log and an unreadable one are never presented alike.

**REQ-NOTIFY-243** — Each of the following costs one feature rather than the application. A missing or unrenderable brand image is replaced by a drawn single-letter mark. A model absent from the context-length registry has its input passed through untruncated, with no default length invented for it. A demo configuration with no persistence service turns each persistence-touching action into an error acknowledgement stating that the action is unavailable in that mode. Legacy whole-state session files remain loadable. Where a provider SDK's exception types are unavailable, error classification falls back to matching failure text under REQ-NOTIFY-067, REQ-NOTIFY-091 and REQ-NOTIFY-094. A malformed skill definition produces a warning and session startup continues. Streaming Markdown renders partial input as readable text and resolves to the correct final rendering once the remainder arrives. `runtime.terminal_stream_enabled` set false costs the live view while the command still runs and still reports its result. A missing or foreign traceability baseline is reported as there being no baseline.

### F3. Project initialization

**REQ-NOTIFY-229** — Project initialization presents all six conditions of REQ-NOTIFY-001: never initialized, listing the tasks that are pending; running; resolved with at least one completed task, as the result condition; resolved with nothing pending and nothing applicable, as the empty condition; a recorded last error alongside tasks still pending, as the actionable failure, where the retry offered re-runs exactly those pending tasks and nothing already completed, and is offered inside the project-initialization surface rather than on a notice, a notice concerning initialization offering only the action that opens that surface; and an initialization run that itself failed, as the non-actionable failure, reported as a persistent error notice with copyable detail under REQ-NOTIFY-233 and REQ-NOTIFY-235.

**REQ-NOTIFY-230** — The initialization prompt is raised only for tasks requiring a human answer. Deterministic background tasks never raise it, and it is never raised while initialization is already running.

**REQ-NOTIFY-231** — Re-reading a workspace's configuration while the initialization state is unchanged changes nothing the user can see: the dialog neither opens nor closes, does not reset, keeps any text the user has typed, and a prompt the user has already dismissed stays dismissed. Only a change in the initialization state itself changes what is displayed.

**REQ-NOTIFY-232** — The initialization outcome notice uses each task's own summary sentence where one exists, and otherwise states the number of setup tasks that finished.

**REQ-NOTIFY-233** — The initialization detail block is copyable and is structured as one line per task giving its identifier and its status, one indented line per step giving its name, its status and its detail, and an indented error line where a message exists.

**REQ-NOTIFY-234** — An unrecognised setup task identifier is displayed as its raw identifier.

**REQ-NOTIFY-235** — A failure of a foreground initialization run and a failure of a background initialization run each publish a persistent error notice with copyable detail.
