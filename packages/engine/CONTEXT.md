# Run

The autonomous, iterative multi-agent process that takes one user task to a terminal result, and the
session that process belongs to. This is where the product's central nouns live: run, iteration,
role, child, delegation, todo, intent, playbook, gate.

Terms are derived from `docs/spec/01-run-orchestration.md` and
`docs/spec/02-run-monitoring-steering.md`, with the session lifecycle from
`docs/spec/07-sessions-persistence.md`. What a session *stores* belongs to
[Session Record](../store/CONTEXT.md).

## Language

### The run

**Run**:
One top-level user task carried through to a stop reason and a terminal result. — `REQ-ORCH-002`,
`REQ-ORCH-150`
_Avoid_: job, execution, task (a task is a todo item, not a run)

**Iteration**:
One pass of the outer loop, targeting one todo task and ending in a verification and a completion
decision. — `REQ-ORCH-005`, `REQ-ORCH-116`
_Avoid_: turn (a turn is one model exchange inside an iteration), cycle, round

**Session**:
The durable identity a run belongs to, carrying its transcript, todo state, metrics and records
across resumes. A session is in one of two conditions and never a third: **live**, owned and
executed by the one running instance, or **at rest**, existing as a persisted record. —
`REQ-SESSION-159`
_Avoid_: conversation, thread, chat

**Session lock**:
The record asserting which process owns a live session, holding a pid, a machine id and an
acquisition time. A lock held by another machine is never reaped. — `REQ-SESSION-042`,
`REQ-SESSION-047`

**Execution status**:
The persisted status of a session, drawn from one closed vocabulary of fourteen values — six of
which assert an in-progress run. — `REQ-SESSION-073`, `REQ-SESSION-055`

**Stop reason**:
The closed, machine-readable account of why a run stopped, distinct from what the run achieved. —
`REQ-MONITOR-301`

**Terminal run result**:
What the run achieved: `completed`, `failed`, `max_iterations`, `interrupted`, `error`. No process
exit code is derived from it, because the product exposes none. — `REQ-ORCH-083`
_Avoid_: exit code, return code

**Run-start mode**:
`auto` or `plan`, persistent across runs in a workspace. In `plan` mode the run produces a plan and
blocks at the **plan gate** until the user approves, revises or cancels. — `REQ-ORCH-152`,
`REQ-ORCH-153`

**Run override**:
A user-chosen final layer over the playbook, taking precedence over the matrix cell. Exactly two
exist: `swarm`, which changes instruction text only, and `single`, which is a capability change —
the entry role works alone and `delegate` is withheld from every role for the whole run. —
`REQ-ORCH-025`

**Message-limit pause**:
A run coming to rest because it reached its message limit, carried as the session's persisted
status and never as a marker on disk, so it survives the application closing. — `REQ-ORCH-087`,
`REQ-SESSION-107`

**Plan**:
The text the entry role produces when the plan gate holds, carried verbatim as that role wrote it —
never summarized, truncated, or re-rendered into another form — and editable by the user, whose edited
text is then the plan the run carries out. — `REQ-ORCH-153`, `REQ-ORCH-154`

**Plan cycle**:
One production of a plan and the decision taken on it. A plan cycle is **not an iteration**: it selects
no task, judges no completion and closes none of the three iteration outcomes. Revise starts a further
cycle with the plan as it stands and the changes the user stated, without limit. — `REQ-ORCH-154`

**Plan gate**:
The hold a `plan`-mode run takes before any file-modifying work is done, where it waits indefinitely for
one of exactly three answers — approve, revise, cancel. It withholds capability rather than preventing
the run from starting, and approval installs the run's execution grants for the remainder of that run. —
`REQ-ORCH-153`, `REQ-ORCH-154`
_Avoid_: plan mode dialog, plan approval prompt

**Planning grants**:
The tool set every agent of a held run holds: the set it would otherwise hold, less every tool the public
tool-name registry declares as writing workspace files or running commands, with an undeclared name
counting as declaring all three. — `REQ-ORCH-153`, `REQ-TOOLS-001`

### Roles and children

**Role**:
A configured agent identity with its own instructions, tool set and model. The default vocabulary
runs `orchestrator`, `requirements-engineer`, `codebase-analyst`, `librarian`, `architect`,
`planner`, `coding-agent`, `tester`, `docs-writer`, `refactorer`, `verifier`, `ui-verifier`,
`gatekeeper`. — `REQ-ORCH-028`

**Persona**:
The same thing as a role, under the name the configuration surface and the `delegate` call use. Both
spellings are the specification's; prefer **role** when speaking about the vocabulary and **persona**
when naming the configuration section, the `persona` parameter, or a per-persona window. —
`REQ-ORCH-031`, `REQ-CONFIG` role entries

**Entry role**:
The single configurable role the top-level task is given to, default `orchestrator`, started fresh
as each iteration's root agent. Its orchestration authority comes entirely from its instructions and
granted tools. — `REQ-ORCH-002`

**Coordinator**:
The entry role while it is coordinating — which is every run except one taken under a `single`
override. The constraints that bind it hold whatever instruction text is in force. — `REQ-ORCH-029`
_Avoid_: manager, supervisor (the **loop supervisor** is a different thing)

**Child**:
An agent spawned by a delegation, occupying one of eleven states of which four are terminal and
absorbing. — `REQ-ORCH-031`, `REQ-MONITOR-014`, `REQ-MONITOR-300`, `PD-ORCH-005`
_Avoid_: subagent, worker, sub-task

**Delegation**:
An explicit `delegate` tool call naming a target role, a task name and a task. It never suspends the
parent's conversation. — `REQ-ORCH-031`, `REQ-TOOLS-153`

**Write scope**:
The path patterns a delegation may declare for its child, in the `glob` tool's dialect and relative to the
workspace root. While the child is live it **claims** every path they match; any other agent of the run except the
child's own descendants is refused a `write_file` or `haet_edit` write into a claimed path, and the child accepted
first holds a path two scopes share. A scope never limits the child that declared it. — `PD-TOOLS-006`
_Avoid_: lease, lock, partition, ownership (ownership is per todo item, `REQ-ORCH-028`)

**Implementation delegation**:
A delegation whose target role holds a tool the public tool-name registry declares as writing
workspace files. Exclusive ownership is measured per todo item and at no other granularity. —
`REQ-ORCH-028`

**Task id**:
A child's identifier, `bg_` plus eight lowercase hex characters, unique within the session. —
`REQ-ORCH-036`

**Canonical name**:
A child's de-duplicated name, unique per parent. — `REQ-ORCH-044`, `REQ-ORCH-045`

**Child report**:
The machine-readable artifact a child leaves behind, read by a parent in place of the child's
transcript. Its status is one of exactly `succeeded`, `partial`, `failed`, `cancelled`, `blocked`.
Verification results, the gate decision and the repair record are runner-owned and unwritable by the
model. — `REQ-ORCH-109`, `REQ-ORCH-112`

**Making progress** (a child):
Having completed at least one tool call within the final `runtime.child_stall_timeout` seconds before the child's
`runtime.child_timeout` expired. A child cut off while making progress still ends `failed`, and its report also
carries the workspace paths it changed and, unless it is itself a continuation, a **continuation offer**. —
`PD-ORCH-004`

**Continuation** (of a child):
A new child a parent delegates to take up the remaining work of a child whose report made a continuation offer; its
record names the child it continues. A piece of work is continued once and a continuation is never offered one of its
own. An offer outlives its run: the agent that delegated the child takes it up while that agent runs, and the root of a
later iteration or a later run takes up one the session left before — including a resumed iteration's own, from an
earlier run — told of it in the handoff, or at the continue that resumes it. Not a resume: the timed-out child is never
restarted and earns no corrective message (`REQ-NOTIFY-112`). — `PD-ORCH-004` (revision 3)
_Avoid_: resume, retry (the one retry is REQ-ORCH-088's fallback model), and "continuation" alone where a session's
next run is meant

### What shapes a run

**Intent**:
The category a task is classified into before the coordinator is initialised, from a taxonomy of
exactly thirteen. Classification failure produces the fallback `moderate_feature` and never stops
the run. — `REQ-ORCH-006`, `REQ-ORCH-007`
_Avoid_: mode, task type

**Intent group**:
A named set intents resolve through when no concrete row matches — answer, clarify, micro, fix,
small-build, medium-build, large-build. — `REQ-ORCH-021`

**Playbook**:
The per-intent behaviour matrix whose row is chosen by role, intent and model tier. The **cell**
selected is recorded so the run is auditable afterwards. — `REQ-ORCH-019`, `REQ-ORCH-027`

**Slot** (playbook):
One of exactly eight sections of a rendered playbook, in order: ROUTE, AUTONOMY, RESEARCH, CHUNKING,
VERIFY, ARTIFACT, OUTPUT, BUDGET. — `REQ-ORCH-020`

**Budget tier**:
The BUDGET slot's enforced clamp on child limits — `tight`, `normal`, or `wide`. Clamps only
narrow. — `REQ-ORCH-024`

**Model tier**:
`small`, `medium`, `large`, ordered, plus the wildcard `any` that matches every tier in a matrix key
and is never a role's own tier. — `REQ-ORCH-019`

**Todo list**:
The run's work plan: phases holding tasks, created at run start with a single phase named "main" and
appended to on resume. — `REQ-ORCH-004`
_Avoid_: backlog (that is a delivery state on the requirements board), checklist

### Finishing work

**Check suite**:
The deterministic checks run at most once per iteration, and only where the iteration changed a
file. Each check carries a severity of `blocking` or `advisory` and a role of `test`, `typecheck`,
`lint` or `other`. — `REQ-ORCH-123`

**Check outcome**:
The closed five-value result a check records. It is not the same vocabulary as the `passed`/
`failed`/`skipped` test results a child reports about tests it ran itself. — `REQ-ORCH-123`,
`REQ-ORCH-112`

**Completion gate**:
The deterministic decision applied after the completion classifier, overriding its verdict:
`passed`, `gated`, or `exempt`. It rests on checks that actually executed, never on a role's
assertion. — `REQ-ORCH-116`

**Verification evidence**:
The record of what was checked for a task and how it came out, handed to the acceptance role and
consulted before acceptance is allowed. — `REQ-ORCH-129`, `REQ-ORCH-039`

**Loop supervisor**:
The hidden observer that detects a run circling and escalates. — `REQ-ORCH-105`

### Watching and steering a live run

**Control**:
An operation a person applies to a live run. Every control either takes effect with stated timing or
refuses with a visible reason; a false outcome always means "the request was not performed", never
"nothing happened". — `REQ-MONITOR` §2

**Steering**:
Text sent to a live agent that changes what it is doing without stopping the run. It is its own
surface and is not a composer mode. — `REQ-MONITOR-070`, `REQ-MONITOR-137`
_Avoid_: interrupt, injection

**Queued prompt**:
Follow-up work a user submits while an iteration is running, to be taken up afterwards. —
`REQ-MONITOR` §15

**Compression**:
Reducing a conversation's context-window pressure, either automatically at a threshold or on
demand. — `REQ-MONITOR` §9, §10
_Avoid_: summarisation (a child's **summarizing** state is a different thing), truncation

**Quota wait**:
A run at rest because a provider's quota is exhausted, carrying the waiting agent, the model and the
wait duration, and presented distinctly from an ordinary pause. — `REQ-MONITOR-303`,
`REQ-NOTIFY-263`

**Cost qualifier**:
What a run's cost total rests on, recorded with it: `unknown` (no request has a figure), `incomplete` (some
do, some do not), `reported` (every figure was the provider's) or `configured` (every request priced, at least
one at configured rates). Each has one fixed label. — `REQ-MONITOR-166`, `PD-MONITOR-001`
_Avoid_: estimate, price status

**Configured price**:
A model entry's `input_cost_per_token` and `output_cost_per_token`, taken as the decimals their text states.
They price a request the provider did not, and only when both are set. — `REQ-CONFIG-088`, `PD-MONITOR-001`
_Avoid_: rate card, tariff

**Agent state**:
A delegated child's state: `queued`, `starting`, `running`, `summarizing`,
`waiting_on_dependencies`, `waiting_on_model_slot`, `succeeded`, `failed`, `cancelled`, `blocked`, `paused`.
`succeeded`, `failed`, `cancelled` and `blocked` are terminal. — `REQ-MONITOR-014`, `REQ-MONITOR-300`, `PD-ORCH-005`

**Paused** (an agent):
The one non-terminal state a run leaves an unfinished agent in when it comes to rest by a pause, a stop, a quit or a
crash, with its **interruption** recorded and its iteration left open. It is left again when the iteration resumes,
for the state the agent **resumes into**: where it waited if it had not started, `running` from its recorded
conversation if it had, `summarizing` if it was writing its report. It presents as `paused`, a presentation state of its
own, keeps its last activity, and is not settled for display with its session (`PD-ORCH-005` clause 13, revision 4); an
agent a crash left unfinished presents so before the crash is recorded (OQ-73). Not a terminal state and not an outcome:
a `paused` agent has no report until it ends. — `PD-ORCH-005`, `REQ-MONITOR-300`
_Avoid_: suspended, frozen, held (the **plan gate** and the **message-limit pause** hold a run; they leave no agent paused)

**Interruption**:
What left an agent `paused` — exactly one of `pause`, `stop`, `quit` or `crash` — recorded on the agent and on its open
iteration. A crash is recorded when the session is next repaired or continued, since nothing runs to record it at the
time. An explicit cancel is not an interruption: it ends its agents `cancelled`, and those are never resumed. —
`PD-ORCH-005`
_Avoid_: stop reason (that is the run's, `REQ-MONITOR-301`), cancellation

**Comes to rest** (a run):
A run stops by a pause, a stop (the stop control, graceful or forced) or a quit and leaves its unfinished agents
`paused`, its iteration open; a crash leaves the same state once it is recorded. The explicit cancel, a stop the run
raises on its own account, and a plan cycle never come to rest (OQ-69). — `PD-ORCH-005` clauses 2 and 3
_Avoid_: suspend, park (a run **parks** at the plan gate, which is a durable hold)

**Withdrawn** (an approval or a question):
Taken back because the run came to rest while a call waited on a person: it leaves the pending list, the timeline
records which interruption withdrew it, and the call is recorded as interrupted and never run. Never a denial, and no
answer is replayed later. — `PD-ORCH-005` clause 9, narrowing `REQ-TOOLS-054` and `REQ-SESSION-025`
_Avoid_: denied, cancelled (REQ-TOOLS-052's cancellation is a denial)

**Resume** (an iteration):
What a continue does with the iteration a rest left open: the same iteration carries on before anything else runs, its
root and every `paused` agent restored from its record with its identity, each from its last message. Declining it —
"continue without them" — ends those agents `cancelled` and closes the iteration. A resume is never a
**continuation** (PD-ORCH-004's new child that carries on a cut-off child's work). — `PD-ORCH-005` clauses 4, 6 and 7
_Avoid_: restart, replay, rerun

**Explicit cancel**:
REQ-MONITOR-126's confirmed control, which cancels the run by its reserved agent id: final — every agent it ends is
`cancelled` and never resumed. Distinct from the stop control. — `PD-ORCH-005` clause 3, `REQ-MONITOR-009`,
`REQ-MONITOR-126`
_Avoid_: stop (the stop control comes to rest)

**Presentation agent state**:
The smaller vocabulary an engine state is mapped onto for display — `running`, `waiting`, `queued`,
`done`, `failed`, `cancelled`, and `paused` for a paused agent. Never store one of these. — `REQ-MONITOR-046`,
`PD-ORCH-005` clause 13
