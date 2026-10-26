[Product directives](../directives.md) › PD-TOOLS-005

<a id="pd-tools-005"></a>

### PD-TOOLS-005 — after one unanswered approval, a run treats the user as away

*Revision 2 (2026-10-06, [R-071](../requests.md#r-071)) — **the question tool's own approval** and **waits already
outstanding**, the two paragraphs marked below, which rule OQ-77 and OQ-78 as the owner took their recommendations.
Revision 1 (2026-09-23, [R-048](../requests.md#r-048)) is quoted where it is replaced, never deleted.*

When an approval wait in a run ends by **timeout** (REQ-TOOLS-052's first mapping), the run SHALL treat
the user as **away**. While the user is away, every further ask in that run that would put an approval
prompt in front of the user SHALL instead be resolved at once, with no prompt and no wait, exactly as
REQ-TOOLS-065 resolves an ask in a session with no approval presenter: under `runtime.headless_approval_policy`
`deny` the call is refused and the agent may re-plan; under `abort` the call is refused and the run is
stopped on the terms that requirement states. The decision source is `headless-policy`. The reason SHALL
state that the user is treated as away because an earlier approval in this run went unanswered for `<N>`
seconds, where `<N>` is the timeout that expired; it SHALL NOT claim that no approval UI is available.

**The question tool's own approval — revision 2.** The one ask the away state SHALL NOT resolve is the approval
the public `ask_questions` tool's own call needs — under the `ask` preset that call is not in REQ-TOOLS-007's read-only
class, so it asks. That ask SHALL be put to the user and wait as it would were they present, and once approved the
question itself prompts and waits (below). Nothing else is exempt: the preset's decision on the call still stands, a
rule's decision still governs it, and a tool offered under that name that is not the public tool is not exempt.

**Waits already outstanding — revision 2.** When the run marks its user away, every approval wait of that run still
outstanding — shown, or queued unshown behind another dialog — SHALL end at once and be resolved exactly as an ask
made while the user is away is (the headless policy, source `headless-policy`, the same reason naming the timeout that
expired), its dialog withdrawn; it is not counted cancelled, and its own expiry is never a second transition. The
question tool's own approval wait is exempt, as above, and a wait the application's quit holds is the quit's to
withdraw (`PD-ORCH-005` clause 9), never resolved by this.

> **Revision 1 said, and no longer governs:** nothing of the question tool's own approval, so under the `ask` preset
> that ask was "a further ask … that would put an approval prompt in front of the user" and was resolved at once — no
> question reached an away user under the default preset ([OQ-77](../../architecture/open-questions.md)); and nothing of a
> wait already running when the user was marked away, which its first execution read as running "to its own end", so
> each ask outstanding at the first expiry could still cost a full timeout ([OQ-78](../../architecture/open-questions.md)).

The user **returns** — and the run stops treating them as away — on the first input they send to that run's
session: an answer to an approval or to a question, a message, a run control, or a permission-mode change.
The away state belongs to one run: it reaches every agent in that run, delegated children included, and it
ends when the run ends, so no later run starts with it.

Unchanged: the first approval still waits the full `runtime.approval_timeout_seconds` and still ends with
REQ-TOOLS-052's timeout reason; a timeout of 0 still waits without limit, so a run configured that way is
never marked away; questions put to the user (REQ-TOOLS-158, REQ-TOOLS-178) still prompt and wait while
the user is away; and asks resolved by a rule without prompting are unaffected.

**Why, and what it costs.** Run `1ddeb71b` spent about 600 seconds on two approvals nobody was present to
answer, each one denied only after its own full wait. An unattended stretch of a run paid the whole timeout
per ask before failing closed. After this directive it pays one timeout, and every later ask in that
stretch fails closed at once. The default stays 300 seconds, so a user at the desk still gets the full
window for the first prompt. What is given up: a user who steps away for longer than one timeout and comes
back finds the asks raised in between already denied (or the run stopped, under `abort`) rather than
waiting for them; answering or writing anything to the session ends that.

*Revision 2's reasons.* A question is the one prompt the directive meant to keep for an away user, and under the
default preset revision 1 kept none; exempting only the question tool's own ask restores it without reopening the
waits the directive removed. A request queued behind an unanswered dialog was never seen, so ending the waits already
outstanding makes one unanswered approval cost one timeout, which is the directive's intent; with several agents asking
at once revision 1 still cost one full timeout per ask outstanding at the first expiry. What is given up: a dialog the
user was looking at when another approval expired closes under them, and a question's approval can still hold its
agent for a full timeout while nobody is there.

> **Narrows:** REQ-TOOLS-052, REQ-TOOLS-055

*Raised by the owner, 2026-09-23; logged as [R-048](../requests.md#r-048). Revision 2 logged as [R-071](../requests.md#r-071).*

> **First execution, 2026-09-28, built under [R-062](../requests.md#r-062):** the mechanism was built as written, and the
> text met the code in five places. **(1) Where the state lives.** No per-run fact reached every agent's gate before
> this; the mode override (REQ-TOOLS-075) had exactly the shape wanted — one holder per run, installed by `Sessions.start`
> and by every continuation, handed to each agent's port context as it is built — so the away state is a second such
> holder, `UserPresence` (`packages/engine/src/run/presence.ts`), reaching the gate through `ToolPortContext.presence`
> and `GateDeps.presence`. It ends with the run because the next run installs a fresh one; nothing resets it, and a
> delegated child reads the same object its root's expired wait marked. **(2) Where input arrives.** Every control on
> a live run but one passes one line at the top of `Sessions.control`, so the return is wired there, before the
> operation is judged: input the operation then refuses (a blank message) still returns the user, because the directive
> counts the input and not its success. `announceShutdown` is excluded — it is the application's, not the user's. The
> one control that does not pass that line is the confirmed transcript clear (REQ-CHAT-084, one of REQ-MONITOR-004's
> operations on a live run), which `control` answers ahead of it because the clear also reaches a loaded idle session;
> its branch returns the user when a run is live. *The first cut stated that every control passed the common line and
> missed the clear; the build's verification found it, and the branch and its engine case were added in the same round.*
> The terminal-stream operations REQ-MONITOR-004 also counts (keystrokes, resize, interrupt, kill) reach
> `run-host/terminal.ts` by stream id and never `Sessions`, so typing into an agent's terminal does not return the user —
> a reading: the directive names answers, messages, run controls and a mode change, and a terminal stream is the
> agent's process, not the run's controls. The asynchronous
> `forceCompression` and the id-routed answers (`answerApproval`, `answerQuestions`, `cancelQuestions`) return the user
> of the session that held the id, whichever session the request addressed; a stale id held by none returns nobody. A
> new message with no run active is `prompt`, which launches a continuation run — a fresh holder, so it starts present
> by construction. **(3) What the event says.** REQ-EVENTS-049 fixes `unattended_reason` at exactly one value,
> `headless-policy`, on every `headless` request, so the `approval.requested` event of an away ask is indistinguishable
> from a presenter-less one; the cause is stated where this directive puts it, in the decision's reason, which the
> `permission_denied` issue carries into the store an autopsy reads. **(4) Where the transitions are recorded.**
> REQ-ORCH-139 closes the timeline vocabulary and neither it nor domain 05's permission events has a word for the user's
> presence, so both transitions are session-log lines (REQ-SESSION-142) at `WARNING`, the default level — the end of an
> away stretch is as much an autopsy fact as its start, and one written below the default level would leave the stretch
> looking open; a timeline word is raised as [OQ-76](../../architecture/open-questions.md). *(Since 2026-10-06,
> [R-071](../requests.md#r-071): OQ-76 is ruled and [`PD-TOOLS-011`](pd-tools-011.md#pd-tools-011) gives domain 05 `user_away` and
> `user_returned`, so both transitions are also timeline entries; the two session-log lines keep `WARNING` as above.)*
> **(5) The question clause under
> `ask`.** `ask_questions` is outside REQ-TOOLS-007's read-only class, so under the `ask` preset its own dispatch is an
> approval ask, and that ask is one the away state resolves at once: under the default preset no question reaches an away
> user. The clause is built as read — it governs the question the executor raises, which still prompts and waits
> wherever the call is permitted — and the tension is raised as [OQ-77](../../architecture/open-questions.md).
> **Readings taken where the text leaves room:** a second wait already running when the first expired is not cut short
> (it was already put to the user) and its own expiry is not a second transition — with concurrent agents that can
> still cost a second full timeout, raised as [OQ-78](../../architecture/open-questions.md); the return clears the mark before the
> operation is judged; a session with no presenter is still reported with REQ-TOOLS-065's own reason, checked ahead of
> the away state, because it is the truer statement; the reason's `<N>` is REQ-TOOLS-052's own figure, the timeout in
> seconds as that reason prints it. **What was measured:** unit tests only. Five gate cases over the fake clock in
> `gate.test.ts`: the full wait paid (still waiting at 4,999 ms, marked at 5,000) and the second ask's exact reason with
> no wait created and nothing presented; the `abort` variant with and without a hook; a timeout of 0 through a day and a
> cancellation, never marking; a permitted question waiting while away, a rule's allow and a rule's deny untouched, and
> the `ask`-preset question denied; the presenter-less precedence. One real-port case in `run-host/tools.test.ts`: the
> configured 300 s wait expiring, the next ask presented to nobody with the exact reason, the return brokered again. Three
> engine cases in `children/children.test.ts`: a delegated child's port reading the mark the root's expired wait set, on
> the one holder; the return on a mode change, on a message the operation refuses and on a run control, a stale answer id
> returning nobody, and a continuation run starting present on a fresh holder; and the return on a confirmed clear
> during the live run, on the awaited compression, and on an approval answer, a question answer and a question
> cancellation the run holds — each of those five return lines, taken out alone, fails that case. Two on the holder itself. Mutations: with
> the away arm taken out of `broker`, four cases fail (the port case and three gate cases, each by waiting for an
> approval nobody answers); with the `markAway` call taken out of the timeout arm, the first-ask case and the port case
> fail on a null mark. **What was not measured:** no built-app run exercised the mechanism. `pnpm questions-proof` and
> `pnpm plan-gate-proof`, the proofs nearest this path, could not launch the app on this host: each spawns Electron
> without the harness's `hostSwitches`, and as root Chromium exits `SIGTRAP` with "Running as root without --no-sandbox
> is not supported" — the harness reason another item sweeps, not repaired here. No live run was made, so the reason's
> wording has not met a real model, and run `1ddeb71b`'s two waits have not been replayed. The row is in
> [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **First execution of revision 2, 2026-10-06, ruled by [R-071](../requests.md#r-071) and built in plan fin21:** built as
> written. **(1) The exemption** is one test in the gate's `broker` (`AWAY_EXEMPT_TOOL`, `packages/agent-tools/src/gate.ts`):
> the call's name is `ask_questions` and the port serves the public tool of that name (`GateDeps.publicTool`, the same
> predicate PD-TOOLS-004 reads), so an MCP or plugin tool offered under the name is not exempt — a reading the text
> states. **(2) Ending the outstanding waits.** The run's holder, `UserPresence`, gains `onAway`; every brokered wait
> registers on it while it is outstanding (unregistered in `broker`'s `finally`), and the mark's transition ends each one
> through `PendingApprovals.endAway` with a new outcome, `away`, which `outcomeDecision` resolves through the same
> `headless` path an away ask takes. The dialog is closed by the line every ended wait already passes (`presenter.close`), a
> queued unshown request included, which REQ-TOOLS-054 would otherwise count as cancelled: it is resolved, not discarded.
> The expired wait's own registration finds its waiter already gone. A wait held for the quit is skipped (`GateDeps.quitting`),
> so PD-ORCH-005 clause 9's withdrawal stays the only end of it. **What was measured:** unit cases only, each red on
> `37f7a98`: in `gate.test.ts` three waits of one gate on the fake clock, the first shown and two queued behind it, the
> first expiring at 5 s and the two ending in the same tick with the away reason, all three dialogs closed and every
> listener gone; under `abort`, the ended wait invoking the hook; the question tool's own wait surviving the mark; a
> quit-held wait surviving it and withdrawn by the quit; the question tool's ask under `ask` brokered while away and its
> question then put; and in `presence.test.ts` the listener told once per stretch. **What was not measured:** no built-app
> run: no proof drives an approval to its timeout (`questions-proof` drives the question surfaces, not the away state),
> and the orchestrator's live runs are the first that can. The row is in
> [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **Built-app execution of revisions 1 and 2, 2026-10-13, plan fin42:** the two first executions above said "no built-app run";
> `pnpm approvals-proof`'s `away` launch now drives both against the scripted model, under `ask` with
> `approval_timeout_seconds: 12`, through real dialogs (the approval seam's per-tool form, `none` leaving a dialog to its
> timeout). The root writes a todo list and delegates two coding agents; each child writes twice and the root then asks a
> question. **What it measured** (load average about 3 on four CPUs): the first child's write, shown and left, ended by
> timeout after 12,003 ms with REQ-TOOLS-052's reason, and `user_away` was written in the same millisecond; the second child's
> write, queued unshown behind it, ended 6 ms later with this directive's reason and was never shown (revision 2); both
> children's next writes were resolved `headless` and denied in 2 to 7 ms with the reason, no dialog shown, and no decision
> claimed that no approval UI exists (revision 1); the question tool's own approval, queued behind the first write before it
> expired, was not ended but shown 495 ms after the expiry and approved (revision 2's exemption); and the root's last todo
> call after the return was put to the user in a dialog again. Both mutations taken on `packages/agent-tools/src/gate.ts`
> turn the proof red: with the `onAway` registration removed, the queued write is shown; with the away arm of `broker`
> removed, a second `user_away` is written by a second timeout. **The readings above held**, and nothing in the text was
> found wrong. **Still not measured:** a real model meeting the reason. `live-run.mjs`'s new `away` scenario is that
> measurement (20 s timeout, every dialog left, the model's answer noted); it is the orchestrator's to run. The row is in
> [`../architecture/first-executions.md`](../../architecture/first-executions.md).
