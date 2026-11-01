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
   fingerprint tool calls only — tool name plus the whole argument value, read as JSON and compared whole (every
   member at every depth, arrays in order, never a prefix or a cap), the order an object's keys were written in no
   part of it, and an argument text that does not parse compared whole as text.
   *Until 2026-10-20 this read "tool name plus the whole argument string, never a prefix or a cap"; the string kept
   the model client's key order, so one value with its keys reordered was another action
   ([OQ-364](../../archive/architecture/open-questions/66-spikes-and-later-questions-33.md#oq-364); the section at the end).* The
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
   arguments (*since 2026-10-20 read from their values, a path- or file-named argument first, never from the JSON
   text; the section at the end*); raw count → a loop only when the last three assistant messages are normalised-equal or the
   last four tool calls share a name; stuck → always recover. `loop_detected: false` is a no-op.
   *Since 2026-10-07 ([`PD-ORCH-016`](../../product/directives/pd-orch-016.md#pd-orch-016), OQ-232): the last four tool
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
8. **The 100-step belt stays for roots** behind the supervisor. Since 2026-10-16, [PD-ORCH-017](../../product/directives/pd-orch-017.md#pd-orch-017) removes it for every delegated child; child timeout and loop supervision still apply. The earlier decision said: "The 100-step belt stays behind the supervisor, its warning reworded. Removing it is a later decision."

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
(R-072) as OQ-232 and carried by [`PD-ORCH-016`](../../product/directives/pd-orch-016.md#pd-orch-016): the limb compares the
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

## 2026-10-14 — the third execution's producer narrowed: the re-prompted empty turn (PD-ORCH-009 revision 3, fin43)

**Found by the live scenario run at `ce5f952`** (`empty-answer` and `empty-once`, finding F1): the third execution's producer —
"an empty reply with no tool call is read as the runtime's 'cannot make progress' report" — also fired on the entry role's empty
turn that earns [`PD-ORCH-009`](../../product/directives/pd-orch-009.md#pd-orch-009)'s answer re-prompt. The re-prompt's turn took the trigger
at its first `check()`, a classification was asked over an empty excerpt, and the stuck corrective ("Pause and reassess the
current task. …") followed the re-prompt in the same request, so the re-prompt was not the model's last instruction. Ruled under
the owner's delegation (R-072) as [OQ-282](../../archive/architecture/open-questions/59-spikes-and-later-questions-26.md#oq-282) and carried by `PD-ORCH-009` revision 3, which narrows
REQ-ORCH-104's stuck-mode clause for that one turn: `LoopSupervisor.withdrawStuck()` clears a pending trigger only when it is
`stuck` (a repetition, cycle or raw-count one stays) and leaves the consecutive counter alone, and `Run.turn` calls it on the
root's supervisor immediately before it returns `ANSWER_REPROMPT`. **The reading it replaces, kept beside it:** *every* empty
reply with no call is a stuck report, so the supervisor recovers it whatever the run itself sends next. It now holds for every
turn but that one; a delegated child's empty turn before its REQ-ORCH-095 re-prompt still arms stuck (pinned as found, raised as
[OQ-283](../../archive/architecture/open-questions/59-spikes-and-later-questions-26.md#oq-283)), and a trigger a root's last empty turn leaves pending is taken by its next turn in the same
execution, after a plan correction ([OQ-284](../../archive/architecture/open-questions/60-spikes-and-later-questions-27.md#oq-284)). Pinned by `supervisor.test.ts`'s three
`withdrawStuck` cases and `answerless.test.ts`'s two revision-3 cases (all five red on `29dbc4e`), and by `pnpm part-h-proof`'s
`answerless` and `answer-when-asked` launches with supervision on (no loop classification and no stuck activation).
**Not measured:** a live run since the change (the orchestrator's `empty-answer`).

## 2026-10-14 — the producer narrowed again: the run's own follow-ups (PD-ORCH-009 revision 4, fin44)

**Ruled under the owner's delegation (R-072)** as [OQ-283](../../archive/architecture/open-questions/59-spikes-and-later-questions-26.md#oq-283) and [OQ-284](../../archive/architecture/open-questions/60-spikes-and-later-questions-27.md#oq-284):
the two neighbouring shapes the entry above named. A delegated child's empty turn before its REQ-ORCH-095 re-prompt, and an
execution iteration's root turn the run follows with REQ-ORCH-078's plan correction, are no stuck report either: `withdrawStuck()`
is called before the child's "Carry out the task now, …" (`IterationChildren.execute`) and before the correction (`Run.turn`'s
`correction()`), so each is the last message of its request. **The reading it replaces, kept beside it:** after revision 3, every
empty reply with no call but the re-prompted root's was a stuck report — measured as built, the child's request ended [task, empty
turn, re-prompt, corrective] and a correction's [... , correction, corrective]. Decision 3's consecutive counter met a second gap
here: the plan correction is REQ-ORCH-105's todo-correction message and never reset the series (an activation after a correction
that followed two others escalated), so the correction now calls `noteUserInstruction()` too. What still arms stuck: every other
empty turn, a root silent while its background child runs among them — the corrective follows the child's report (pinned as found,
raised as [OQ-296](../../archive/architecture/open-questions/60-spikes-and-later-questions-27.md#oq-296)). Pinned by `children.test.ts`'s and `coordinator-plan.test.ts`'s revision-4
cases (five red on `a3be56c`) and by `pnpm part-h-proof`'s `silent-correction` and `silent-child` launches (0 loop
classifications, 0 stuck activations). **Not measured:** a live run since the change.

## 2026-10-14 — the producer narrowed a third time: a parent's silent wait (PD-ORCH-009 revision 5, fin45)

**Ruled under the owner's delegation (R-072)** as [OQ-296](../../archive/architecture/open-questions/60-spikes-and-later-questions-27.md#oq-296): the shape the entry above left as found.
A parent — an execution iteration's root, or a delegated child acting as parent — whose turn ends with neither text nor a call
while a child of its is pending or ended unobserved is waiting (REQ-ORCH-055), not stuck: `IterationChildren.runWithChildren`
calls `withdrawStuck()` as it takes the parent into the wait, so the children's reports are the request's last message. Decision
3's consecutive counter is untouched — a report is no user instruction (REQ-ORCH-105) — and a repetition, cycle or raw-count
trigger the same turn armed still stands. **The reading it replaces, kept beside it:** after revision 4, a parent's empty turn
while its children ran was still a stuck report: the turn the report led took the trigger, the corrective followed the report, and
because no report resets the series, a root that delegated and waited silently three times reached decision 3's third consecutive
activation and was escalated — measured in the built app before the change, the session ended `agent_session_aborted` with "child
aborted after repeated activations". The same measurement showed decision 4's budget at work: the trigger was armed when the root
fell silent and taken only when the report came, seconds later, so no classification was dispatched and the deterministic
corrective was sent. Pinned by `children.test.ts`'s revision-5 cases (four red on `ee586d3`, a raw-count guard green before and
after) and `pnpm part-h-proof`'s `silent-wait` launch (0 stuck activations, 0 escalations, the session `completed`).
**Not measured:** a live run since the change.

## 2026-10-20 — decision 3's same action compared by argument value (OQ-364, loc1)

**Found by the default live run at `cb6d1d5`** (2026-10-15, scenario `crlf`, session `4dad81df`): a child made 18 failing
`haet_edit` calls on one step of `greet.js` whose argument objects were written in two key orders,
`{path, content_hash, old_string, new_string}` and `{content_hash, new_string, old_string, path}`, in no regular pattern.
Compared as emitted, the longest run of identical texts was 2; compared as values it was 5, twice. Decision 3's fingerprint
compared the text, so the repetition trigger never fired, no `loop_supervisor_activation` was written, and the loop held the
child 179 s of the scenario's 420 s wait
([`fixed/the-loop-supervisor-misses-identical-calls-whose-argument-key-order-varies.md`](../../defects/fixed/the-loop-supervisor-misses-identical-calls-whose-argument-key-order-varies.md)).
The record already stored those arguments with sorted keys (`session-writer.ts`), so a reader saw five identical calls where
the supervisor saw five different ones. The build also read a strict alternation of two key orders as a two-action cycle at
the sixth call, so whether one failing edit counted as a loop depended on the pattern of its key orders.

**Ruled under the owner's delegation (R-072)** as [OQ-364](../../archive/architecture/open-questions/66-spikes-and-later-questions-33.md#oq-364), with no directive: REQ-ORCH-101's "the
whole of their arguments" is their value read as JSON (a dated note beneath the requirement). **The change**
(`packages/engine/src/run/supervisor.ts`): a tool event's fingerprint is `tool\0<name>\0v\0<encoding>` of
`JSON.parse(args)`, where the encoding is a string written with every object's keys sorted at every depth, every member kept
(`__proto__` included), arrays in order, every string quoted and a non-finite number written as itself; where the parse or the
encoding throws (a malformed text, or a nesting past the stack), it is `tool\0<name>\0t\0<args>`, the text whole. It is
computed once per call in `observe()` and kept beside the window, and the repetition trigger, the cycle trigger and
[`PD-ORCH-016`](../../product/directives/pd-orch-016.md#pd-orch-016)'s raw-count evidence all read it. Nothing else changed: the text the
tool, the provider, the transcript, the excerpt and the path anchor see; the message limb; the thresholds.

**Pinned by** `supervisor.test.ts`'s block "OQ-364: REQ-ORCH-101's same action compares the arguments as one JSON value": five
cases red on the build before (a repetition across key orders A, B, B, A; a width-2 cycle of two values each written in two
orders; PD-ORCH-016's evidence limb on A, B, A, B; reordering at depth; whitespace between tokens) and seven guards green before
and after (array order; two 9,000-character values differing at their end; string whitespace and case; `"1"` against `1`;
`__proto__`; the tag on unparseable text, with `1e400` against `Infinity` and `null`; a 100,000-deep nesting), each shown to
turn red under the encoder it guards against. And by `pnpm part-h-proof`'s `loop-reordered` launch: the scripted root sends
one `read_file` value, `{path: 'README.md', offset: 1}`, its keys in the repeating order A, A, B
(`ROTARIS_SCRIPT=loop:readreorder:20`): on the build before, 20 calls and no activation, the session `completed`; after it,
three activations, the first `trigger: repetition`, one `circuit_breaker_escalation` and stop reason `agent_session_aborted`
(`loop-reordered-observed.json`). **Measured live** in the default live run's `crlf` scenario on this branch (2026-10-20, pack `2026-10-20T15-45-32-700Z`, endpoint `katalyst`, unmetered, R-068; Windows 11 ARM64, Node 24.18.0 arm64, beside three other trees' 18 Electron processes): the child serving greet.js sent four `haet_edit` calls of
one value, the first written `{path, content_hash, old_string, new_string}` and the next three `{content_hash, new_string,
old_string, path}` (as the next request replays them), so as text no run reached four; the `loop_supervisor_activation`
(`trigger: repetition`) followed the fourth, the child's next call was another value, and the scenario passed, the run
completed inside its wait.

## 2026-10-20 — decision 5's path anchor read from the argument values (loc1)

**Found by the live run of 2026-10-14 04:30** (session `dc1f4f1f`, the `loop_supervisor_activation` at 05:07:45.885): the
deterministic message read "Pause and reassess haet_edit around \tconst", naming no file. The anchor was the first match of
`(?:[A-Za-z]:[\\/]|\.{0,2}[\\/])[^"'\s,}]+|[^"'\s,}]+\.[A-Za-z0-9]{1,8}` in the serialised arguments, whose `\.{0,2}[\\/]`
takes zero dots and a backslash, so the JSON escape `\t` of an `old_string` written ahead of `path` matched first
([`fixed/the-loop-supervisors-deterministic-message-anchors-on-an-escaped-tab.md`](../../defects/fixed/the-loop-supervisors-deterministic-message-anchors-on-an-escaped-tab.md)).
Two more readings of the same expression, found while repairing it: a Windows path anchored in its escaped form, and the
second limb backtracked quadratically over a long run of path characters (200,000 held `check()` for 157 s).

**The change** (`supervisor.ts`, `pathIn`): the arguments are parsed and walked in written order, depth first, bounded at 10,000
values; the anchor is the first one-line string within 512 characters under a key naming a path or a file (`path`,
`file_path`, an element of `paths`), else the first path-shaped string anywhere (one word, holding a separator or ending in a
file extension). Arguments that do not parse, or hold no path, keep the fallback "<tool> with <the first 80 characters>".
The key order OQ-364 made no part of sameness is no part of the anchor either. **Pinned by** `supervisor.test.ts`'s block
"REQ-ORCH-104: the deterministic message's path anchor is read from the argument values" (six cases red on the build before,
one guard green before and after) and the OQ-364 block's PD-ORCH-016 case. **Measured live** in the default live run's `crlf` scenario on this branch (2026-10-20, pack `2026-10-20T15-45-32-700Z`, endpoint `katalyst`, unmetered, R-068; Windows 11 ARM64, Node 24.18.0 arm64, beside three other trees' 18 Electron processes): the one
activation's message read "Pause and reassess haet_edit around crlf-live/greet.js. …", its calls written with `path` last.
