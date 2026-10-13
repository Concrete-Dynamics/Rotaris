# ADR-0059 — The loop supervisor is an in-turn observer; its pause is a withheld model step

- **Status:** accepted, with its first execution recorded below
- **Date:** 2026-09-05
- **Origin:** the map's tools row (`codebase.md`, "owes"), taken as Part H with the `continue` route
- **Depends on:** ADR-0012 (the child scheduler; the supervisor was listed there as not built), ADR-0013
  (the registry that scopes it), ADR-0026 (the model boundary; the classifier's rung ladder is reused), ADR-0036 (the section)
- **Requirements:** `REQ-ORCH-096`, `REQ-ORCH-099..107`, `REQ-ORCH-151`, `REQ-CONFIG-136`, `REQ-CONFIG-467`,
  `REQ-SHELL-041`

## Context

`REQ-ORCH-099..107` specify a hidden mechanism: an observer that watches one agent conversation, fires on
repetition, cycles or raw counts, pauses the agent, asks a small model whether a loop exists, redirects it
with a message that reads as the user's, and escalates on the third activation without an intervening user
instruction. No decision in this record fixed its shape; ADR-0012's first-execution note listed it as not
built, and the run loop carried a bound of 100 model steps per turn in its place (`RUN_CONFIG_DEFAULTS
.maxStepsPerTurn`, warned as "the loop supervisor is not built").

The requirement says what the supervisor sees ("each observed child event"), what it does ("pause the
child"), and what its corrective message is (a user instruction), but not where it lives or what "pause"
is in a loop that is a sequence of model steps and tool dispatches. Three shapes were open.

## Alternatives considered

**A — A process or task beside the run, reading the event stream.** The supervisor subscribes to the wire
bus and signals the run. *Against:* it observes after the fact, so "pause" would be a cancellation racing
the next model step; its corrective message would arrive as steering, which does not exist; the bus is
bounded and buffered (ADR-0010), so under load the observer would fall behind the thing it watches.

**B — A hook on the tool gate.** The gate sees every tool call in order. *Against:* it does not see the
assistant's messages, which `REQ-ORCH-100` counts and `REQ-ORCH-104` reads as evidence; the gate's answer
vocabulary is allow/deny/modify, none of which is "inject a user message".

**C — An in-turn observer, one per agent conversation.** `runTurn` reports each assistant message and each
tool call to the supervisor as it happens and, before every model step, asks it for a decision. "Pause" is
the turn not taking its next step until the decision resolves; "inject" pushes the corrective text as the
next user message; "escalate" ends the turn failed with the signal. Chosen.

## Decision

**Alternative C.**

1. **One `LoopSupervisor` per agent conversation, held by a `SupervisorRegistry` owned by one run**
   (`packages/engine/src/run/supervisor.ts`). The root and every child get their own; nothing is shared
   across sessions (`REQ-ORCH-105`, `REQ-ORCH-151`). A run constructs its registry; the next run in the
   same session — a continuation — constructs another, so the consecutive-activation counter starts from
   zero at every real user instruction (`REQ-ORCH-105`). Steering and todo corrections do not exist in
   this build; `noteUserInstruction()` is the port they will call.
2. **The turn feeds it and asks it** (`run/turn.ts`): `observe` after each assistant message and each tool
   call; `check()` before each model step. The decision is `continue`, `inject(message)` or
   `escalate(signal)`. Inject pushes one user message after the tool results — the same position hook
   feedback takes — and records one timeline entry `loop_supervisor_activation`; it is not a transcript
   row, because `REQ-ORCH-099` asks for invisibility and no requirement asks for a row.
3. **Triggers are evaluated in `REQ-ORCH-101`'s order over ACTIONS.** The repetition and cycle triggers
   fingerprint tool calls only — tool name plus the whole argument string, never a prefix or a cap. The
   assistant's text between two calls neither breaks "in a row" nor pairs with a call to form a cycle.
   Messages count toward the raw thresholds and are `REQ-ORCH-104`'s evidence (the last three
   normalised-equal). See the first execution for why this sentence is here.
4. **Activation** snapshots the trigger with the window and the capped excerpt, increments the
   consecutive counter, resets the window and counts, and: at the third activation escalates without
   classifying (`REQ-ORCH-102`); otherwise classifies through a `LoopClassifier` port bounded by
   `runtime.loop_classification_timeout` on the engine's timers. The classifier at the run-host root
   (`apps/desktop/src/run-host/loop.ts`) reuses the intent classifier's rung ladder (ADR-0026's first-execution note) and `RungMemory` against the
   `small_model` slot or the configured model, with the JSON contract of `REQ-ORCH-103`; a corrective
   message is cut at 90 words.
5. **Fallbacks are `REQ-ORCH-104`'s three rules**: repetition or cycle → always a loop, with a
   deterministic "pause and reassess" message naming the circled tool and a path anchor drawn from its
   arguments; raw count → a loop only when the last three assistant messages are normalised-equal or the
   last four tool calls share a name; stuck → always recover. `loop_detected: false` is a no-op.
   *Since 2026-10-07 ([`PD-ORCH-016`](../../product/directives.md#pd-orch-016), OQ-232): the last four tool
   calls must be **the same action** — the same name and the whole arguments, REQ-ORCH-101's `fingerprint` —
   where they shared a name. "Share a name" is kept above as the reading the build first took; see the
   fifth execution below.*
6. **Escalation** (`REQ-ORCH-106`): the turn ends failed with the signal; the issue
   `circuit_breaker_escalation` is recorded with the wording "child aborted after repeated activations";
   a child's report carries the signal (`errors[].type`); the root's failure ends the run
   `agent_session_aborted` through the path `REQ-ORCH-074` already had.
7. **The section** (`packages/config/src/circuit-breaker-section.ts`): `circuit_breaker:` with `enabled`,
   `model`, `activation_mode` and no timeout key (`REQ-CONFIG-136`); `runtime.loop_classification_timeout`
   (`REQ-CONFIG-467`); layered global → workspace like the hooks section; unknown keys reported. Disabled
   constructs no registry and no classifier (`REQ-ORCH-107`); absent is enabled. The host toggle is the
   environment stopgap `ROTARIS_CIRCUIT_BREAKER=off` until Settings → Runtime exists; the status strip shows
   "● CB armed" while enabled (`REQ-SHELL-041`).
8. **The 100-step belt stays** behind the supervisor, its warning reworded. Removing it is a later decision.

## Consequences accepted

1. A supervisor's "pause" is only as prompt as the turn's next step: a tool that runs for minutes is not
   interrupted by an activation that fired before it. Acceptable — the requirement pauses "the child", and
   the child is between steps when it is asked.
2. The classifier's call sits on the turn's critical path for up to the timeout (2.0 s) once per
   activation. Activations are rare by construction. *Falsified for a model that reasons before it answers,
   2026-10-07, and kept beside its correction: the raw count activates every 60 calls or 60 messages, and in the
   three duress packs on such a model all 9 classifications were cut at the bound, so the fallback of decision 5
   decided every raw-count activation (the fifth execution below).*
3. The consecutive counter's reset on steering waits on steering.

## Revisit if

Steering or todo corrections land (call `noteUserInstruction()`), or a turn's tool dispatch becomes
interruptible (then "pause" can be more than a withheld step).

## First execution — 2026-09-05, the scripted loop in the built app

*Recorded under GD-10. The tenth defect of ADR-0058 consequence 17's pattern.*

**Built and run:** the supervisor, the section, the classifier at the root, the turn wiring, the scripted
client's `ROTARIS_SCRIPT=loop:<tool>:<n>` and `ROTARIS_LOOP_SCRIPT=detected|clear|timeout` seams; eight
engine tests (triggers in order; whole-argument sameness with two 9,000-character edits differing at the
end; weighted arithmetic; the three fallback rules; reset after activation and escalation at the third;
the timeout on the engine's clock; isolation between instances; and the one below). In the built app
(`pnpm part-h-proof`, `.part-h-proof/loop-observed.json`): twelve `read_file` calls with identical
arguments → activation 1 after four (trigger `repetition`, the scripted classifier's corrective message
injected), activation 2 after four more, activation 3 after four more → escalated without classification;
one `circuit_breaker_escalation` issue; the session `failed` with stop reason `agent_session_aborted`.

**Found — the triggers were judged over the wrong series.** The first run of the same script fired three
activations with trigger **`cycle`**, not `repetition`: the supervisor fingerprinted the assistant's text
beside its tool calls, so the series was (text, call, text, call, …) — a two-element cycle seen three times
after six events, never four identical fingerprints in a row. With text that varied from step to step, the
same repetition would have fired nothing until the raw threshold of 60. `REQ-ORCH-101` says "the same
**action** observed 4 times in a row" and "a repeating sequence of 2 to 4 distinct **actions**"; the
assistant's text is not an action. Decision 3 now says so; the test "judges repetition and cycles over
actions only" pins it with four identical calls under four different messages. The falsified reason — that
every observed event belongs in one fingerprint series — is kept in the code comment beside the filter.

**Readings recorded.** (a) The runtime's "stuck" report (`REQ-ORCH-096`) has no producer in this build: the
port `observeStuck()` exists and is tested, nothing calls it. (b) The issue's actor is the agent's name
(`orchestrator` for the root), the wording is `REQ-ORCH-106`'s "child aborted" even when the root escalated.

**Not exercised:** the classifier against a real provider (the scripted client answers the JSON rung);
`activation_mode: weighted` in the app; a child agent's escalation in the app (the unit path is tested).

**Second execution, 2026-09-05, from the files.** `circuit_breaker.enabled`, `model`, `activation_mode` and the
nine thresholds (REQ-CONFIG-136/137) reach the supervisor from the configuration resolved at run start; the
classifier model is the section's `model` resolved through the slots; Settings → Runtime's "Circuit breaker"
toggle writes the flag on Save (REQ-CONFIG-323) and the strip's "● CB armed" follows the loaded value.
`ROTARIS_CIRCUIT_BREAKER=off` stays the host-level override. **Found: nothing.**

**Third execution, 2026-09-05, the producers.** `noteUserInstruction()` now has its callers — an injected
steer, a queued prompt's consumption and a todo edit each reset the consecutive counter (REQ-ORCH-105) — and
`observeStuck()` its producer: an empty reply with no tool call is read as the runtime's "cannot make progress"
report (REQ-ORCH-096). "Revisit if" clause one is met. **Found: nothing.**

## Fourth execution — 2026-09-08, editable task-plan source routing

Part AD exercised the planner todo through the desktop edit surface (REQ-CHAT-085..091). The first execution found a source-routing defect at the established `run.editTodo` seam: the visible agent-maintained document could take priority while edits always changed the loop planner document. The run now retains the planner and root-agent documents in one versioned JSON envelope inside the existing `sessions.todo` field, projects the source decision once, and routes edits through that decision. Child-owned documents remain on their child records. Every accepted edit still calls `noteUserInstruction()` and persists before projection. Temporary `local-<n>` ids live solely in the renderer; the run assigns the durable 8-hex id before any record or model-visible payload exists. The focused proof is `pnpm todo-proof` with evidence in `.todo-proof/results.json`.

## Fifth execution — 2026-10-07, the raw-count tool limb's first live firing and PD-ORCH-016

**Found by the final duress live run at `a68f121`** (session `e6747bd0`, finding D6): the tool limb of decision 5
fired live for the first time — `fixed/tool-only-steps-read-as-three-identical-messages.md` had left it "unchanged"
and "Not reached live". At `wave2e-decisions`'s 60th call the classification was cut at 1,915 ms, and the fallback
read four `read_file` calls over two files of the child's own work (#229 to #232) as a loop: timeline entry 43
told it to "Pause and reassess read_file around docs/decisions.md …", which cost it a 24.5 s step. All three
classifications of the run were cut at 2.0 s (9 of 9 across the three duress packs), which falsifies consequence 2's
"activations are rare" for such a model (kept above, beside its correction). Ruled under the owner's delegation
(R-072) as OQ-232 and carried by [`PD-ORCH-016`](../../product/directives.md#pd-orch-016): the limb compares the
last four tool events by `fingerprint` — the comparison REQ-ORCH-101's triggers already use — where it compared
`event.name` (fin32). Pinned by `supervisor.test.ts`'s REQ-ORCH-104 block and `pnpm part-h-proof`'s
`raw-count-varied` and `raw-count-same` launches. **Not measured:** a live run since the change.

## 2026-10-13 — decision 4's bound capped at the activation budget (fin35)

Decision 4 bounded the classification by `runtime.loop_classification_timeout` as configured, so a workspace that set
the key to 30 let one classification hold the agent for 30 s, where REQ-CONFIG-467 makes the key an upper bound only and
REQ-NOTIFY-106 allows the call no more than what remains of the 2 s activation budget
([`the-loop-classification-timer-is-not-capped-at-the-activation-budget.md`](../../defects/fixed/the-loop-classification-timer-is-not-capped-at-the-activation-budget.md),
noticed beside OQ-232's ruling). The bound is now the smaller of the key and `LOOP_ACTIVATION_BUDGET_MS` (2,000 ms), in the
supervisor's timer and in the classifier's model request alike. The budget is read from the activation `check()` takes at
the step boundary, as consequence 1 already reads the pause; the call is dispatched in the same synchronous stretch, so the
whole budget remains at dispatch. Pinned by `supervisor.test.ts` and `pnpm part-h-proof`'s `raw-count-long-bound` launch
(red on the build before, green after). **Not measured:** a live run; with the default 2.0 s nothing a live run shows
changes, and one with the key raised should show every classification cut at about 2 s.

*Corrected the same day by fin35's review, the reason above kept beside its replacement.* "The budget is read from the
activation `check()` takes … so the whole budget remains at dispatch" is false: REQ-NOTIFY-106 counts it from the activity
satisfying the criteria, and decision 2's turn observes a call before dispatching it, so the triggering call and the rest of its
step are spent from the budget before `check()`. Consequence 1 accepts that the *pause* waits for the step boundary; it does not
move the budget's start. The supervisor now records, on the monotonic clock, when `observe` or `observeStuck` armed the trigger
(it takes the run's `Clocks`' `timers` and `monotonic`), and the call is bounded by the smaller of the key and what remains; with
nothing left no call is dispatched and decision 5's fallback decides (a failed classification, REQ-NOTIFY-109). Pinned by
three further `supervisor.test.ts` cases, red on the first form. **What a live run should show:** classifications after a long
tool call cut short or not sent (the fallback deciding), and after a quick one cut at about 2 s as before.
