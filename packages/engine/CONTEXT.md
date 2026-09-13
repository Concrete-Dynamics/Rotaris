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
An agent spawned by a delegation, occupying one of ten states of which four are terminal and
absorbing. — `REQ-ORCH-031`, `REQ-MONITOR-014`, `REQ-MONITOR-300`
_Avoid_: subagent, worker, sub-task

**Delegation**:
An explicit `delegate` tool call naming a target role, a task name and a task. It never suspends the
parent's conversation. — `REQ-ORCH-031`, `REQ-TOOLS-153`

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

**Agent state**:
A delegated child's state: `queued`, `starting`, `running`, `summarizing`,
`waiting_on_dependencies`, `waiting_on_model_slot`, `succeeded`, `failed`, `cancelled`, `blocked`.
The last four are terminal. — `REQ-MONITOR-014`, `REQ-MONITOR-300`

**Presentation agent state**:
The smaller vocabulary an engine state is mapped onto for display — `running`, `waiting`, `queued`,
`done`, `failed`, `cancelled`. Never store one of these. — `REQ-MONITOR-046`
