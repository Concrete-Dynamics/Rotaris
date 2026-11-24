[Product directives](../directives.md) › PD-ORCH-018

<a id="pd-orch-018"></a>

### PD-ORCH-018 — loop supervision may review progress at an interval, and its escalation pauses the run

1. **Two review modes.** `circuit_breaker.review_mode` SHALL take `on_signal` or `periodic`, default `on_signal`. In
   `on_signal` the triggers, their order and the classification are REQ-ORCH-101's and REQ-ORCH-102's, unchanged.
2. **The periodic trigger.** In `periodic` mode a fourth trigger, `periodic`, SHALL fire when an agent has made
   `circuit_breaker.review_interval_tool_calls` tool calls (integer ≥ 1, default 20) or produced
   `circuit_breaker.review_interval_messages` messages (integer ≥ 1, default 20) since its last activation, whichever comes
   first. Repetition, cycle and stuck triggers keep their meaning and are evaluated before it. The raw-count trigger of
   REQ-ORCH-101 (3) is not evaluated in `periodic` mode; the interval takes its place.
3. **What a periodic review judges.** On a `periodic` trigger the classifier SHALL be given the agent's task beside the
   transcript tail and SHALL judge whether the agent is making progress toward that task, not only whether it repeats
   itself. The answer contract is REQ-ORCH-103's, unchanged: `loop_detected` true means the agent needs redirecting, and the
   corrective message obeys every clause of REQ-ORCH-103 and REQ-NOTIFY-103.
4. **A periodic review that does not answer redirects nothing.** Where the classifier fails, is cut at its bound, or is
   not called because its model is held out of quota, a `periodic` trigger SHALL result in no corrective message and SHALL
   NOT count toward escalation. An interval is a count, and REQ-ORCH-104 already forbids declaring a loop from counts alone.
5. **The series counts redirections in periodic mode.** In `periodic` mode the consecutive-activation counter of
   REQ-ORCH-102 SHALL count only activations that placed a corrective message in the agent's context, whatever trigger
   raised them. An activation whose review answered that the agent is progressing SHALL reset the counter, as a user
   instruction does. In `on_signal` mode the counter is REQ-ORCH-102's and REQ-ORCH-105's, unchanged.
6. **The bound of a periodic review.** A classification raised by a `periodic` trigger is bounded by
   `runtime.loop_classification_timeout` alone. The 2-second activation budget of REQ-NOTIFY-106 does not cap it: no
   activity satisfied REQ-NOTIFY-108's criteria, so there is no budget to hold. Every other classification keeps the cap.
7. **Escalation pauses the run.** `circuit_breaker.escalation` SHALL take `pause` or `abort`, default `pause`, in both
   review modes. With `abort`, escalation is REQ-ORCH-106's and REQ-NOTIFY-105's, unchanged. With `pause`, the third
   consecutive activation SHALL bring the whole run to rest exactly as the user's pause does (REQ-MONITOR-123,
   `PD-ORCH-005`): no agent is failed, the session is left resumable, an issue records the escalation with the session, the
   activation count and the repeated-loop reason, and the person is told by a persistent notice and a transcript line naming
   the agent and saying the run can be continued. Continuing the run, with or without an instruction, starts a fresh series.
8. **What stays hidden.** Corrective messages stay invisible on the terms of REQ-ORCH-099 and REQ-NOTIFY-103, in both
   modes. A periodic review that finds the agent progressing writes no timeline entry and no transcript row; it is still a
   request of the run and is counted in its usage (REQ-EVENTS-053), which is the one way a run in `periodic` mode differs
   from the same run with supervision disabled when nothing is wrong.
9. **Settings.** The review mode, the two intervals, the escalation and the classifier's model SHALL be editable on the
   Settings screen beside the existing switch, and apply to runs started afterwards (REQ-NOTIFY-110's rule for the switch).

**Why, and what it costs.** The owner asked for an advisor that checks, every so many tool calls or messages, whether an
agent is stuck or not progressing, and nudges it; asked for the judgement to be a setting (signals first and a model only
then, or a model at every interval) with a selectable model defaulting to a small one; and chose "nudge, then escalate",
where escalating means pausing and telling the person. The supervisor already is that observer, so this extends it rather
than standing a second one beside it. Three things the existing supervisor could not do are the reason for the clauses. It
asked a model only once a signal or 60 events had armed it, and the live runs recorded no agent near 60 calls. It asked
about repeated work and was never shown the task, so an agent busily doing the wrong thing read as healthy. And its
escalation ended the run as failed, which throws away a session a person could have redirected in one sentence. Clause 5
exists because REQ-ORCH-102 counts every activation before it is classified: at an interval of 20 calls a healthy agent
would be escalated at its sixtieth. What it costs: `periodic` mode spends one small-model request per interval per agent
whether or not anything is wrong; a periodic review may hold an agent longer than 2 seconds when
`runtime.loop_classification_timeout` is raised; and with the default `pause`, a run that used to end `failed` with
`agent_session_aborted` now rests and waits for a person, so an unattended run no longer terminates on its own at a loop.
`escalation: abort` restores that.

> **Narrows:** REQ-ORCH-101, REQ-ORCH-102, REQ-ORCH-105, REQ-ORCH-106, REQ-NOTIFY-102, REQ-NOTIFY-104, REQ-NOTIFY-105, REQ-CONFIG-467
> **Extends:** REQ-ORCH-100, REQ-ORCH-103, REQ-CONFIG-136

*The cases, stated against the other directives on these requirements. [`PD-ORCH-001`](pd-orch-001.md#pd-orch-001) narrows
REQ-ORCH-101 for a run held at the plan gate, where supervision is not active at all; this directive's case is an active
supervisor in `periodic` mode, so the two never meet. [`PD-ORCH-016`](pd-orch-016.md#pd-orch-016) and
[`PD-ORCH-009`](pd-orch-009.md#pd-orch-009) narrow REQ-ORCH-104's raw-count and stuck clauses; a `periodic` trigger is
neither, REQ-ORCH-104 names no fallback for it, and clause 4 gives it one without changing that requirement.
[`PD-MONITOR-007`](pd-monitor-007.md#pd-monitor-007) narrows REQ-ORCH-100 on which model answers; clause 3's
review follows the same override. Cites without changing: REQ-ORCH-099, REQ-ORCH-104, REQ-ORCH-107, REQ-NOTIFY-103,
REQ-NOTIFY-106, REQ-NOTIFY-108, REQ-NOTIFY-109, REQ-NOTIFY-110, REQ-CONFIG-137, REQ-MONITOR-123, REQ-EVENTS-053.*

*Raised by the owner, 2026-11-24; logged as [R-126](../requests.md#r-126).*

> **First execution, 2026-11-24 (branch `loop-supervisor-periodic-review`).** Clauses 1 to 8 were built as written; clause 9 (the
> Settings rows) is **not built**: the five values are set in `agents.yaml` under `circuit_breaker:`, and the screen still shows only
> the switch. **What was measured.** `supervisor.test.ts`'s PD-ORCH-018 block (nine cases: the mode, the interval's place in the
> order, the task handed over, a failed and a cut review, ten clean reviews, the series and its restart, the bound past two seconds,
> the action); `coordinator-plan.test.ts`'s two (a root's third activation rests the run `interrupted` with a `warning` issue, one
> notice and the transcript line; `abort` fails it `agent_session_aborted`); `loop.test.ts`'s three (the review prompt, the task
> ahead of the excerpt, the uncapped bound); `load.test.ts`'s one. In the built application, `pnpm part-h-proof` (green whole, on a
> private display): its `loop-supervisor` launch, at the default, leaves the session `paused` with three activations, the third
> recording `escalation: pause`, and one `warning` issue; its `loop-reordered` launch sets `escalation: abort` and ends
> `agent_session_aborted` as before. The first run of that proof was red on the old assertion, which read the abort at the default.
> **What was not measured:** a child's escalation into the pause, a continue after it, a periodic review in the built application
> (`part-h-proof` has no periodic launch), the other suites `pnpm verify:plan` names, and a live model. The row is in
> [`../../architecture/first-executions.md`](../../architecture/first-executions.md).
