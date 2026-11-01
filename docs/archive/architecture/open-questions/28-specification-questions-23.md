# Archived open questions — Specification questions (23 of 27)

The ruled, closed, resolved and withdrawn entries of [part 28](../../../architecture/open-questions/28-specification-questions-23.md) of the [open-questions record](../../../architecture/open-questions.md), each moved here whole, under its own anchor, by `pnpm archive:migrate` (`tools/archive/migrate.mjs`); the part keeps one index line for each. Only the script writes here ([the archive](../../../README.md#the-archive)).

<a id="oq-131"></a>

**OQ-131 — What does a follow-up by `session_id` do that clause 22 does not state?** *(`PD-ORCH-005` clause 22 and
`PD-TOOLS-006` revision 3, which rule OQ-66's open part; REQ-TOOLS-152, REQ-TOOLS-153, REQ-TOOLS-155, REQ-MONITOR-300,
REQ-ORCH-046, REQ-ORCH-048, REQ-ORCH-050, REQ-ORCH-088, REQ-ORCH-108, REQ-ORCH-139, REQ-LIBRARY-092. Raised 2026-09-29 by
building clause 22 under [R-067](../../../product/requests.md#r-067), the repair of
[`delegate-drops-session-id-and-suppress-auto-context.md`](../../../defects/fixed/delegate-drops-session-id-and-suppress-auto-context.md). ~~Open.~~ Ruled 2026-10-06. Raised as OQ-130 on its branch and renumbered OQ-131 at the merge, OQ-130 having been taken on `main` meanwhile.)*

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** every reading built is ratified, and `PD-ORCH-005` revision 6 states them in clause 37 — the retry and the user's cancel among them: a follow-up resumes into `queued` under the cap and the limit, reads only `task`, may follow up a child the user cancelled, gives a child that never started its payload, waits for an execution winding down, replaces the report, and its REQ-ORCH-088 retry starts from the child's payload.

Clause 22 says which child a follow-up resumes, that it resumes from its record with the call's `task` as its next user
message, and that it ends and reports again as any child does. It does not say which state the child resumes into, what
becomes of the call's other fields, or what a child with no recorded conversation resumes from.

**What the build proceeds under** (`IterationChildren.followUp` in `packages/engine/src/children/orchestration.ts`,
`SessionWriter.followUpChild`):
- **The child resumes into `queued`** (`FOLLOW_UP_STATE`) and is started by the scheduler as any queued child is: under
  REQ-ORCH-050's per-model cap, where it can be held `waiting_on_model_slot`, and under REQ-ORCH-046's active limit. The
  call reports `queued` or `waiting_on_model_slot` in REQ-TOOLS-153's shape, with the child's own canonical name and task
  id. It is not moved straight to `running`, as a paused child that was running is, because it holds no place in any
  limit when it is followed up. Its total and its depth are unchanged: no record is created.
- **Only `task` is read from the call.** `run_in_background: false` still enrols the caller in the wait, as the tool does
  for any call. Every other field — `persona`, `task_name`, `depends_on`, `inherited_context`, `category`,
  `attach_artifacts`, `write_scope`, `continuation_of`, `suppress_auto_context` — is left unread: the child keeps its
  recorded identity, as clause 4 restores it, and its stored write scope is claimed again. A call whose `persona`
  differs from the child's is not refused. The refusals are `PD-TOOLS-006` revision 3's alone.
- **"Cut off by its `child_timeout`"** is read from the child's stored report: a `timeout` error, or PD-ORCH-004's
  `cut_off` block. A child whose REQ-ORCH-088 fallback retry ended it some other way was not cut off.
- **Another agent's child reads as no child of the caller's.** The reason says none of the caller's children has that
  id. It does not say the id is another agent's: that is REQ-TOOLS-155's parent scoping, as `background_output` applies
  it. OQ-81's `inherited_context` refusal, which names the owner, is not followed. A later iteration's root is refused an
  earlier iteration's child the same way, as OQ-66's ruling says (the ownership test; a case pins it).
- **An empty `session_id` is read as absent**, as an empty `continuation_of` is, so `session_id: ""` delegates a new
  child rather than being refused.
- **A child the user cancelled is settled, and may be followed up.** `PD-ORCH-005` clause 3 says a cancelled agent is
  "never resumed", and clause 16 calls a paused child's cancel "final as clause 3 says". Clause 22's settled child is
  every terminal state but the cut-off one, and it says clause 5, which lists `cancelled`, does not bar a follow-up. The
  build reads clauses 3 and 16 as about a continue's resume, which a follow-up is not: a parent can follow up a child the
  user cancelled (REQ-MONITOR-128) and the child runs again. Refusing it would add a refusal `PD-TOOLS-006` revision 3
  does not list, so it is not built.
- **A child that never started** — `blocked` by REQ-ORCH-048, or cancelled before it started — has no conversation to
  resume. It is given the payload it would have started with, recorded ahead of the follow-up. REQ-ORCH-048's cascade does
  not block again a queued child whose record holds a conversation, since its dependencies were judged when it was first
  admitted. The same holds for a child whose dependency was itself followed up and has since failed. So a follow-up
  made while one of its dependencies is being followed up too starts at once, under the cap and the limit, and does
  not wait for that dependency's new report.
- **The follow-up and its record move together.** The move out of the terminal state, the cleared completion time,
  report and observation, the recorded message, `child.transition` and the timeline entry are one transaction. So a
  rest, or a crash, before the child starts leaves a record it resumes from. A call its execution left open is first
  answered as cut off, with the statement that names no rest.
- **A follow-up waits for an execution still winding down.** A child the user cancelled is settled at once, and its
  aborted execution returns only when its turn does. The follow-up waits for that execution to end, then checks the
  child again, so the old execution never writes over the new one.
- **The earlier report is replaced.** The report column is cleared, and the child's report artifact is re-materialised
  in place when it reports again (REQ-LIBRARY-092, the same task id). The earlier report survives in its
  `child.complete` event.
- **The timeline entry is `child_resumed`**, with `follow_up: true` and the state it left. It is not a word of
  REQ-ORCH-139's vocabulary, as the rest's own use of it is not
  ([`the-run-writes-timeline-events-outside-its-closed-vocabulary.md`](../../../defects/fixed/the-run-writes-timeline-events-outside-its-closed-vocabulary.md)).
- **REQ-ORCH-088's fallback retry of a follow-up starts from the child's payload**, as a resumed child's retry does
  (`PD-ORCH-005`'s first execution). The retry therefore carries neither the conversation nor the follow-up's `task`.
  Whether the retry should carry the follow-up is put to the owner.
- **REQ-ORCH-153 needs no check of its own.** The plan gate holds only a plan cycle, and a follow-up names the caller's
  own child, which was admitted under the gate.

**What a ruling decides.** Whether each reading above stands, the retry and the user's cancel most of all. A ruling that a follow-up resumes
straight into `running`, as a resumed child does, would take it out of REQ-ORCH-050's cap.

<a id="oq-132"></a>

**OQ-132 — What is asked of a person in the quit's gap — after the last window closes, before the shutdown?** *(`PD-ORCH-005`
clauses 9 and 15, `PD-CHAT-002` revision 2; REQ-TOOLS-052, REQ-TOOLS-054, REQ-TOOLS-058, REQ-TOOLS-061, REQ-TOOLS-064,
REQ-EVENTS-049, REQ-CHAT-094, REQ-GIT-101, which the directive does not name. Raised 2026-09-29 by the repair of
[`an-approval-asked-after-the-last-window-closes-is-denied.md`](../../../defects/fixed/an-approval-asked-after-the-last-window-closes-is-denied.md)
under [R-067](../../../product/requests.md#r-067). ~~Open.~~ Ruled 2026-10-06.)*

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** confirmed as built, and `PD-ORCH-005` revision 6 states it in clause 38: the quit's gap is part of the quit's rest for clause 9, so an ask made in it is held unshown and withdrawn by the quit, and REQ-TOOLS-064, REQ-TOOLS-058 and REQ-CHAT-094 yield to it there and join the directive's Narrows list; the `timeout_seconds` a held request announced is not the bound it waits under.

Main revokes the last window's presenter as the window closes, and sends the run host its `shutdown` only once
`window-all-closed` has waited on the checkpoint operation in flight (REQ-GIT-101) — a gap as long as that operation.
Clause 9 withdraws an approval or a question pending "when the run comes to rest … by a quit", and clause 15 has the quit
answer nothing through a dialog it closes. Neither says what an ask made inside the gap is: the run has not come to rest
yet, and REQ-TOOLS-064 read alone resolves it through the headless policy — a denial the quit caused.

**What the build proceeds under** (`PresenterRegistry.quitting`, `Gate.broker`, the `held` predicate of `PendingApprovals`
and `PendingQuestions`):
- **The quit, not the person, took the window.** A revoke main's `QuitState` says the quit caused marks the run host
  quitting until a window registers again. Meanwhile an ask is not REQ-TOOLS-064's headless case: it is published
  `brokered` (REQ-TOOLS-061) with the configured `timeout_seconds` (REQ-EVENTS-049), waits unshown in
  `pending_approvals`, and the quit's shutdown withdraws it as clause 9 says.
- **A present that crossed the close** and was answered "not shown" once the quit was under way is held the same way,
  not denied `presenter-error` (REQ-TOOLS-058).
- **No budget expires while the quit holds a wait.** The timer is armed again, so the gap never turns an approval
  (REQ-TOOLS-052's timeout) or a question into a denial or a timeout, whether it was asked before the quit or during it.
  The `timeout_seconds` the request announced is therefore not the bound it waited under.
- **A question put in the gap is recorded pending and withdrawn by the quit**, not discarded as REQ-CHAT-094's "could not
  be shown".
- **A user treated as away (PD-TOOLS-005) is still resolved at once,** as the window open would have resolved it.
- **Left as it was:** an agent built in the gap resolves its tool set with `userPromptChannel` read from attendedness,
  so `ask_questions` is removed from it (REQ-TOOLS-053/069); and a run started in the gap reads attendedness at its start.
  Neither was reached by the defect, and neither is changed.

**What a ruling decides.** Whether the quit's gap is part of the quit's rest for clause 9, so that REQ-TOOLS-064,
REQ-TOOLS-058 and REQ-CHAT-094 yield to it there, and whether a held request should announce a `timeout_seconds` it will
not be held to. A ruling that REQ-TOOLS-064 governs the gap would restore the denial the defect note records.

<a id="oq-133"></a>

**OQ-133 — Which status does a background session take when its process dies of a signal?** *(REQ-TOOLS-109,
REQ-TOOLS-110, REQ-TOOLS-112, REQ-TOOLS-128, REQ-TOOLS-179; OQ-10 as ruled in [R-044](../../../product/requests.md#r-044).
Raised 2026-09-29 by the repair of live-run finding L4 under [R-067](../../../product/requests.md#r-067),
[`a-background-session-ended-by-a-signal-reads-failed.md`](../../../defects/fixed/a-background-session-ended-by-a-signal-reads-failed.md).
~~Open;~~ ruled 2026-10-06; numbered OQ-132 on its branch, renumbered at the merge, OQ-132 having been taken on `main`.)*

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** confirmed as built: a death by a signal the product delivered is `killed`, exit −1, at `warning`; a death by a signal it never sent is `failed` with `128 + n`; an exit code always wins; and Windows is unchanged under OQ-10.

REQ-TOOLS-109's vocabulary is `completed` (exit 0), `failed` (nonzero), `killed` (the explicit kill, −1) and `timeout`
(124). REQ-TOOLS-179 keeps −1 for `killed` alone on a background session. A process that dies of a signal has no exit
code at all, so it is neither a zero nor a nonzero exit, and no requirement names its status. `send_signal`
(REQ-TOOLS-110) and the stream-control interrupt (REQ-TOOLS-128) are the two ways the agent or the user ends a
session by a signal. REQ-TOOLS-112 reads `killed` as "the agent or the user ended it deliberately". Before this entry
every signal death read `failed (exit -1)`: an error, a `tool_error` issue, and a −1 that REQ-TOOLS-179 does not give
`failed` (live run of 2026-09-29, `frictions`, after the agent's own SIGINT).

**What the build proceeds under** (`endOfExit` in `packages/agent-tools/src/terminal/background.ts`):
- **A death by a signal the product delivered is `killed`, exit −1**, at REQ-TOOLS-112's `warning`, so it files no
  `tool_error`. "Delivered" means that `send_signal` or the stream-control interrupt sent that signal to the session's
  process group. The session remembers each signal it sent.
- **A death by a signal the product never sent is `failed`**, with the shell's `128 + n` for signal `n` (143 for
  SIGTERM, 139 for SIGSEGV) as its nonzero exit code. A crash, or another process's kill, is not a deliberate end by
  the agent or the user, and −1 stays `killed`'s alone.
- **An exit code always wins.** A command that handles the signal and exits with a code of its own is `completed` or
  `failed` by that code, as REQ-TOOLS-109 states for any exit. The code is the command's real outcome (REQ-TOOLS-179).
- **Windows is unchanged.** OQ-10's ruling already maps every signal there to the session's own termination, which is
  `killed`.

**What a ruling decides.** Whether a signal death the agent or the user caused is `killed`, and whether `128 + n` is
the exit code of a signal death the product did not cause. A ruling that every signal death is `killed` would drop
the second reading. A ruling that every one is `failed` would need a code other than −1 for it.

<a id="oq-134"></a>

**OQ-134 — Which shell state does a hard-timeout reset restore when a command completed that the product never saw
complete?** *(`PD-TOOLS-001`, which narrows REQ-TOOLS-099; REQ-TOOLS-097, REQ-TOOLS-098. Raised 2026-09-29 by the
repair of [`a-hard-timeout-reset-can-lose-the-restored-variable-under-load.md`](../../../defects/fixed/a-hard-timeout-reset-can-lose-the-restored-variable-under-load.md)
under [R-067](../../../product/requests.md#r-067). ~~Open;~~ ruled 2026-10-06; numbered OQ-133 on its branch, renumbered at the merge, OQ-132 having been taken on `main`.)*

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** confirmed as built: a hard-timeout reset restores the snapshot of the last command the product saw complete, so what a soft-paused command that finished unseen changed is not restored.

`PD-TOOLS-001` says the product "SHALL snapshot the shell's working directory and exported variables before the
respawn". The respawn follows a wedged command, and a wedged shell cannot be asked for its state. So the build takes
the snapshot on the idle shell after each command it sees complete, and a reset re-applies the last one
([ADR-0020](../../../architecture/adr/0020-terminal-execution.md)'s third first execution). The directive does not say what that snapshot
misses. It misses a command that soft-paused (REQ-TOOLS-098) and then finished while the agent's next command waited
behind it in the shell's input. The product never sees that completion: the next call's marker is the one it scans
for, and a poll that later hands over a finished paused command takes no snapshot either. If that next command then
reaches its hard timeout, the reset restores the state from before the paused command and reports "were restored".
What the paused command set or changed — an exported variable, `cd` — is lost, although it happened before the
respawn.

This is the whole of what the repaired note measured. In `terminal.test.ts` the timeout case's first command,
`export ROTARIS_GONE='set'`, named no timeout and queued behind a command the case before it had left soft-paused.
It waited about 1.45 s against the 1.5 s no-output window. Over 20 loaded runs of the file the whole call, its
snapshot included, took 1,486 to 1,707 ms. Under load it soft-paused, and the reset then restored the snapshot of an
older command.

**What the build proceeds under:** the snapshot of the last command the product saw complete, as ADR-0020 records.
The case `PD-TOOLS-001 (OQ-134): …` in `terminal.test.ts` pins that reading. Its paused command writes the variable's
value to a file, and the case waits for that file before the reset, so the variable was set before the respawn; the
read after it gives `[]`. The case is red under a temporary change that snapshots a finished paused command before the
next command runs. (Its first form reset the shell before the paused command had run, which pinned only
REQ-TOOLS-097's loss of a command that never ran; corrected in the branch's verification round.) The timeout case
now names its own timeout, so it no longer depends on this reading.

**What a ruling decides.** Whether "before the respawn" asks for the state after such a command too. Meeting it
would take the shell's state from inside the command's own wrapper, since the shell is never idle in between. The
cost is an environment dump in the output of every command written behind a still-running one: through the capture,
and through the live stream REQ-TOOLS-127 holds faithful to what the command wrote. A lighter half-measure is a
snapshot when a poll hands over a finished paused command, which covers the agent that polls and not the one that
moves on.
