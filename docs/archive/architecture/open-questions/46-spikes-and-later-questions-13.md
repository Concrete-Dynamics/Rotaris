# Archived open questions — Spikes, and the questions raised since (13 of 35)

The ruled, closed, resolved and withdrawn entries of [part 46](../../../architecture/open-questions/46-spikes-and-later-questions-13.md) of the [open-questions record](../../../architecture/open-questions.md), each moved here whole, under its own anchor, by `pnpm archive:migrate` (`tools/archive/migrate.mjs`); the part keeps one index line for each. Only the script writes here ([the archive](../../../README.md#the-archive)).

<a id="oq-211"></a>

**OQ-211 — Is an artifact's consumer recorded as the reading agent's persona or as its instance?** *(REQ-LIBRARY-099, "every
successful read marks the reading persona as a consumer"; REQ-LIBRARY-096, "marking an artifact consumed appends the actor at
most once and persists"; REQ-LIBRARY-093, whose `created_by` names "the publishing agent instance by its canonical name rather
than by its persona, so two instances sharing a persona stay distinguishable in every artifact listing"; REQ-MONITOR-044,
REQ-MONITOR-052 and REQ-MONITOR-069, whose received-artifact links read the consumers. Raised 2026-10-06 by finacc3's
acceptance round 1 (finding F16), repairing
[`records-and-code-comments-describe-ruled-questions-as-open-and-cite-questions-never-raised.md`](../../../defects/fixed/records-and-code-comments-describe-ruled-questions-as-open-and-cite-questions-never-raised.md):
`ArtifactStore.markConsumed`'s comment (`packages/engine/src/artifacts/store.ts`) said this was "raised as an open question
rather than settled here", and no entry was ever written. ~~Open, the owner's.~~ **Ruled 2026-10-07 under the owner's
delegation.**)*

REQ-LIBRARY-099 names the reading persona; REQ-LIBRARY-096 names the actor, without saying whether that is a persona or an
agent instance.

**What the build proceeds under** (`markConsumed`, and the artifact port's `artifact_read` in
`packages/engine/src/artifacts/port.ts`). The consumer recorded is the reading agent's canonical instance name, the name
REQ-LIBRARY-093 gives `created_by`: a child's canonical name, and a root's `root_canonical_name` (since the repair of
[`a-roots-publish-names-its-persona-as-its-author.md`](../../../defects/fixed/a-roots-publish-names-its-persona-as-its-author.md),
2026-09-29). REQ-LIBRARY-093's reason, that two instances of one persona stay distinguishable, applies as much to who read an
artifact, and the persona can be recovered from the instance where the reverse cannot. The agent surfaces' received links
(REQ-MONITOR-044/052/069) match an agent's consumer entries by that name. Two instances of one persona that read one artifact
are two consumers.

**What a ruling decides.** Whether the consumer is the instance (as built) or the persona, and so whether two instances of one
persona reading an artifact record one consumer or two.

**Ruled 2026-10-07 under the owner's delegation ([R-072](../../../product/requests.md#r-072)):** confirmed as built. Every
successful `artifact_read`, filtered or full, records the reading agent instance as a consumer, at most once, by its canonical
name (the name REQ-LIBRARY-093 gives `created_by`: a child's canonical name, a root's `root_canonical_name`); two instances of
one persona that read one artifact are two consumers, and the agent surfaces' received links (REQ-MONITOR-044/052/069) read
these names. Because REQ-LIBRARY-099 and REQ-TOOLS-148 say "the reading persona", the ruling is minted as
[`PD-LIBRARY-004`](../../../product/directives/pd-library-004.md#pd-library-004), which narrows those two requirements' consumer clause; REQ-LIBRARY-096's
"actor" is read as the instance within its text. **The two recommendations weighed:** advocate A (the user's lens) and advocate
B (the system's lens) both recommended confirming as built with a directive — A because the received links show exactly what
the store holds and a persona would make them wrong whichever way they matched, B because the persona can be derived from the
instance and not the reverse, and the persona reading would undo OQ-125's confirmed reading. The ruling **followed both**,
keeping A's test that a child of the entry persona does not credit the run-level agent, and declining B's first-executions
row, since no mechanism ran for the first time. Built by bundle `fin28-artifacts` the same day as records, comments and three
pinning tests (`artifacts/artifacts.test.ts`, `ui/src/inspector-links.test.ts`), each green on the build as it stood.

<a id="oq-212"></a>

**OQ-212 — Which built-in personas may publish an artifact?** *(REQ-TOOLS-001 and REQ-TOOLS-002, the names a persona may
declare, `artifact_write` among them; REQ-TOOLS-004, which removes `artifact_write` "declared by a persona that lacks
`can_publish_artifacts: true`"; REQ-CONFIG-106, `can_publish_artifacts` "(bool, default false)", without which the role is not
handed the tool; REQ-TOOLS-007; REQ-ORCH-016, whose direct-work bundle names `artifact_read` and `artifact_list` and not
`artifact_write`; REQ-ORCH-028's role vocabulary, which names the built-in roles and not their tools; REQ-LIBRARY-097 and
REQ-LIBRARY-101. Raised 2026-10-06 by finacc3's acceptance round 1 (finding F16), repairing
[`records-and-code-comments-describe-ruled-questions-as-open-and-cite-questions-never-raised.md`](../../../defects/fixed/records-and-code-comments-describe-ruled-questions-as-open-and-cite-questions-never-raised.md):
`packages/contracts/src/roles.ts` said "that no built-in persona does is recorded as an open question", and no entry was ever
written. ~~Open, the owner's.~~ **Ruled 2026-10-07 under the owner's delegation.**)*

The specification defines the tool, its gate and its prerequisite, but no built-in persona's tool list, so it does not say
whether any built-in role publishes.

**What the build proceeds under** (`BUILT_IN_ROLE_TOOLS`, `packages/contracts/src/roles.ts`). No built-in persona declares
`artifact_write`, and the direct-work bundle does not add it, so with the shipped defaults no agent publishes an artifact
through the tool: the artifacts in a session are the child reports the engine materialises (REQ-LIBRARY-092), and a
workspace's personas publish only where its configuration declares `artifact_write` for them (the artifacts proof declares it
for its orchestrator). `artifact_read` and `artifact_list` join every persona's read group. Whether that configuration also
needs `can_publish_artifacts: true`, as REQ-CONFIG-106 and REQ-TOOLS-004 say, is not this question: the build hands the tool
over whatever the flag says, recorded as a defect (repaired with this question's ruling, below),
[`can-publish-artifacts-is-read-and-never-gates-artifact-write.md`](../../../defects/fixed/can-publish-artifacts-is-read-and-never-gates-artifact-write.md).

**What a ruling decides.** Whether any built-in role (the orchestrator, the planner, the architect, the codebase analyst, the
librarian or another) declares `artifact_write` and carries `can_publish_artifacts: true` by default, or publishing stays a grant
a workspace's configuration gives.

**Ruled 2026-10-07 under the owner's delegation ([R-072](../../../product/requests.md#r-072)):** confirmed as built. No built-in
persona declares `artifact_write` or carries `can_publish_artifacts: true`, so with the shipped defaults a session's artifacts
are the child reports the engine materialises (REQ-LIBRARY-092). A workspace grants a role publishing through its configuration
with both keys REQ-CONFIG-106 names: `artifact_write` in the role's `tools:` list, restated in full (REQ-CONFIG-101), and
`can_publish_artifacts: true` beside it. Wherever the flag is false the tool is withheld and the removal recorded as
`artifact_publish_not_granted` (REQ-TOOLS-004, REQ-TOOLS-150). The ruling departs from no requirement's text, so **no
directive** was minted (OQ-52's precedent). **The two recommendations weighed:** advocate A (the user's lens) recommended
confirming as built, since the user already receives every specialist's work as a child report and a built-in publisher would
write each body twice and add duplicate Library rows, and repairing the gate alongside; advocate B (the system's lens)
recommended confirming as built, since three requirements treat publishing as a deliberate grant and no requirement names a
built-in publisher, which makes the gate repair a pure subtraction. The ruling **followed both**, taking the concrete steps
from each. **Built by bundle `fin28-artifacts` the same day:** `Persona.canPublishArtifacts` (false for every built-in role),
carried by `personaResolverFor` and read by `createToolPort` in place of the store's presence, repairing
[`can-publish-artifacts-is-read-and-never-gates-artifact-write.md`](../../../defects/fixed/can-publish-artifacts-is-read-and-never-gates-artifact-write.md);
a pinning test that no built-in role declares the tool or carries the flag (`children/personas.test.ts`); and the artifacts
proof's orchestrator granted with both keys, with a launch (3b) that declares the tool without the flag and finds the
removal in the session log at warning and no artifact stored, which passed.

<a id="oq-213"></a>

**OQ-213 — Which todo list does REQ-ORCH-029 hold the coordinator to on multi-step work, what is "more than one step", and
how is the clause held "no matter what … instruction text is in force"?** *(REQ-ORCH-029, "work spanning more than one step is
accompanied by a todo list it keeps current", a constraint that "MUST hold no matter what playbook cell or instruction text
is in force" and is "externally checkable from the run's own records"; REQ-ORCH-004 and REQ-ORCH-068, the planner plan the run
writes and resolves itself; REQ-TOOLS-144 and REQ-TOOLS-147, the `todo` tool's list, the agent's own and "the run's primary
progress display"; REQ-ORCH-059, "Open-todo reminder lines are appended"; REQ-ORCH-025, `single`; REQ-CONFIG-100, a configured
`system_prompt`. Raised 2026-10-07 from live-run finding K2 of the final default live runs (packs at `c2fdd6a` and
`c2a9444`): on 3 of the 6 multi-step runs (edit, resume, frictions) the coordinator delegated more than once and wrote no plan
of its own, the task-plan strip read "Planner plan" with one row, the prompt itself, and the inspector read "todo not used";
on the requirements and terminal runs it planned unasked. Recorded as
[`the-coordinator-keeps-no-todo-list-of-its-own-on-multi-step-work.md`](../../../defects/fixed/the-coordinator-keeps-no-todo-list-of-its-own-on-multi-step-work.md),
repaired by fin27. Ruled the same day.)*

**Ruled 2026-10-07 under the owner's delegation ([R-072](../../../product/requests.md#r-072)):** the todo list REQ-ORCH-029
requires of the coordinator is its own plan, the one the `todo` tool writes; the run's planner plan does not satisfy the
clause. While the entry role acts as coordinator in an execution iteration and holds `todo`, the run refuses at dispatch the
call that would start the current task's second work item until the entry role has made an accepted `todo` write for that
task, and logs each refusal as a warning citing REQ-ORCH-029. A work item is a `delegate` call, or on a direct-work grant a
call of a tool the registry declares as writing workspace files or running commands. Nothing is seeded from the planner plan,
and REQ-ORCH-059's open-todo reminder lines are built so the coordinator sees its open items as children finish. No directive:
this builds REQ-ORCH-029 as written, and `PD-ORCH-006` already keeps the todo clause on direct-work runs. Two readings are this
entry's ruling: the list is the agent plan, and "more than one step" means the task's second work item. If a later round treats
the work-item reading as a narrowing, it lands as a revision of `PD-ORCH-006`, the one narrowing slot REQ-ORCH-029 admits.

The consortium weighed two recommendations. **Advocate A** (the user's lens) read the clause the same way and proposed a
reminder the run injects into the result of the task's second work item while the coordinator keeps no plan for it, logged as
a warning, rejecting both a refusal (red refused rows and an extra model step on healthy runs) and seeding the list from the
planner plan. **Advocate B** (the system's lens) proposed the refusal at dispatch, held through the entry port's gate beside
REQ-ORCH-153's plan-gate check, with the work-item count and the write kept with the planner task as `planExcused` is. **The
ruling followed B**: A's reminder is still text, which REQ-ORCH-029 says may not decide the question, and the live packs show
the persona text skipped on half the multi-step runs; the specification already holds such limits with refusals at dispatch
(REQ-ORCH-030, REQ-ORCH-153), and a gate refusal settles `blocked`, files no `tool_error` issue, fires at most once per task and
never on a coordinator that already planned. From A it took the logged warning line, the test that a configured
`system_prompt` is still covered, and the reading of "step" as a work item. The engine glossary's "Todo list" names the planner
plan, and the specification uses the phrase for both lists, so the glossary gains a separate "Agent plan" entry.

**As built** (fin27, 2026-10-07). The planner task keeps two facts in the stored todo beside `planExcused`, so a continue and
a later run read them back, both removed when the task completes or is given up on: `workItems`, the task's work items that
reached execution in its execution iterations, and `listWritten`, set by an accepted root `todo` write after the task's take-up
that leaves the agent plan holding at least one task (for the current iteration's task; in the plan cycle that plans the task,
for every task it plans). A person's own edit of the plan never sets it. `Run.todoListOwed` answers the refusal while the run
coordinates (`RunDeps.coordinating !== false`), outside a plan cycle (whose calls neither count nor are refused), when the
task already has a work item and no list; the depth-0 context carries it, and the entry port hands it to the gate only where
the entry role's resolved tool set holds `todo`, the run warning once otherwise and refusing nothing. The gate refuses after
the plan-gate check and before the schema parse: `blocked`, `failure_kind: todo_list_owed`, no `tool_error` issue; a step's
calls dispatch in order, so a `todo` write earlier in the step satisfies the check. Two places where the build reads the
ruling's text, stated so the next round can see them: a work item is **counted when it reaches execution** (past the schema,
the permission and the pre-execution hooks), not when it passes this check, so a call refused for another reason starts no
work item; and a tool the registry carries **no declaration** for (an MCP or plugin tool) is no work item, the ruling counting
what the registry declares. *A third, added 2026-10-07 (fin29, from fin27's review):* the ruling's "test that a configured
`system_prompt` is still covered" is read **at the entry port** (`apps/desktop/src/run-host/tools.test.ts`, "a configured
system_prompt does not lift it"), where the persona's configured text is resolved, and not at the engine, whose scripted runs
carry no persona text; the refusal reads no instruction text at all, so the port is where a replaced text could matter. `completionNotification` appends up to five of the parent's open plan items (REQ-ORCH-059): the
root's are those its task answers for (`openRootPlan`), a child parent's its own todo's. Pinned by
`packages/engine/src/run/coordinator-plan.test.ts`, `packages/agent-tools/src/gate.test.ts`,
`apps/desktop/src/run-host/tools.test.ts`, `packages/engine/src/children/notify.test.ts` and
`packages/engine/src/children/children.test.ts`, and shown in the built app by `pnpm mission-proof` item 1c; the proofs whose
scripted coordinator delegates more than once open with the scripted client's `plan` step; the live run's harness checks it
over every session it keeps (`apps/desktop/scripts/lib/coordinator-todo.mjs`). The first-executions row waits on the orchestrator's next default live run.
*Amended 2026-10-07 by OQ-220's ruling (`PD-TOOLS-006` revision 6, fin29):* the refusal text (`TODO_LIST_OWED_TEXT`) now ends
"…; its result gives each item's id. Then make this call again, and on a delegate call to a persona that writes workspace files
give todo_item: the id of the item it serves." It read, until then: "…, one item per step with only the step you are on
IN_PROGRESS, then make this call again."
*Amended again by OQ-249's ruling (`PD-TOOLS-008` revision 2, `PD-TOOLS-006` revision 7, fin33):* it now reads "Write one with
the todo tool, one item per piece of work, with only an item you work on yourself IN_PROGRESS and the items you will delegate
PENDING; its result gives each item's id. Then make this call again, and on a delegate call give todo_item: the id of the item it
serves, which the call marks IN_PROGRESS." It read, until then: "Write one with the todo tool, one item per step with only the
step you are on IN_PROGRESS; its result gives each item's id. Then make this call again, and on a delegate call to a persona that
writes workspace files give todo_item: the id of the item it serves."

**First live execution, 2026-10-07 (the final default live run at `a68f121`, pack `2026-10-07T06-48-50-123Z`, the registered
self-hosted endpoint):** the refusal held as built. It fired three times in the ten sessions: edit `#7` (a `delegate`, in the
same step as a `todo` that REQ-TOOLS-145 refused in `PD-TOOLS-008`'s wording), resume `#2` (a `delegate`) and frictions `#2`
(a background `terminal` call on a direct-work grant). Each settled `blocked` with `failure_kind: todo_list_owed`, filed no
`tool_error` issue and logged one warning citing REQ-ORCH-029; each coordinator recovered with exactly one `todo` write and
then the refused call, two model steps, about 19.5 s, 9.5 s and 6 s on the critical path, and none looped or re-planned
twice. The requirements and terminal coordinators planned before their first delegation and were never refused. The five
multi-step sessions stored an agent plan, and the task-plan strip read "Agent plan" (3/3, 4/4 and 3/3 done) with "todo used".
No scenario check failed because of a refusal. **Not reached:** REQ-ORCH-059's open-todo reminder lines, since every
coordinator waited in the foreground with `wait_for_tasks`, whose report block carries none. **Found**, as the pack's
findings, not as defects of this ruling: P3, where REQ-TOOLS-145's single `IN_PROGRESS` refuses the plan of two parallel
delegations and under this ruling that refusal leaves the same step's second `delegate` refused too (the model then
split the write from the call, reading nothing in the refusal that says a same-step write counts); and P7, a harness
finding, where the resume scenario's Pause now lands on one running child instead of two because the second delegation
starts one refusal later. The row is in [`first-executions.md`](../../../architecture/first-executions.md).

<a id="oq-218"></a>

**OQ-218 — Is REQ-MONITOR-286's per-agent timeout a control, and where does it stand?** *(REQ-MONITOR-286, the three
"interface-level delegation controls", the per-agent timeout "presented in minutes" and initialised from its policy value;
REQ-CONFIG-322, Delegation limits as "two numeric controls"; REQ-CONFIG-256, REQ-CONFIG-263 and REQ-CONFIG-417, the written
keys, the Tier B overlay and destination 1, none naming it; REQ-CONFIG-113 and REQ-ORCH-088, `runtime.child_timeout` in
seconds, 1200 by default; REQ-MONITOR-169, the Overview caps caption. Raised 2026-10-07 from the final live runs' findings —
both duress autopsies (`c2fdd6a`: three of seven children cut off at 1200 s, 66 % of the run behind the ceiling; `c2a9444`:
61.5 %) — as the consortium's question T1, and recorded here as OQ-218, the number the round assigned it.
[`no-surface-presents-the-per-agent-timeout.md`](../../../defects/fixed/no-surface-presents-the-per-agent-timeout.md) records the
gap. ~~Open.~~ **Ruled 2026-10-07.**)*

No surface shows the per-agent timeout: Settings › Runtime › Delegation limits draws the depth cap and the fan-out limit,
the advanced runtime card shows a key only when a file states it, and the caps line is count against cap. Whether
REQ-MONITOR-286's third item is a control a user moves (then a third Delegation limits control, which departs from
REQ-CONFIG-322's two and from the three enumerations that omit the key), a figure shown read-only, or a figure on the
Overview caps line, the specification does not settle.

**Ruled 2026-10-07 under the owner's delegation ([R-072](../../../product/requests.md#r-072)):** Settings › Runtime › Delegation
limits presents the per-agent timeout as a third numeric control, "Per-agent timeout", in whole minutes clamped 1–240. It is
initialised from the effective `runtime.child_timeout`, so a default install reads 20. It writes minutes × 60 seconds to
`runtime.child_timeout` through Save and the Tier B overlay, the same way as the depth cap and fan-out limit beside it. A
stored value the control cannot express is shown clamped for display with its exact seconds stated beneath, and is never
rewritten until the user changes the field (REQ-CONFIG-446). The Overview caps line keeps REQ-MONITOR-169's caption. Recorded
as [`PD-CONFIG-003`](../../../product/directives/pd-config-003.md#pd-config-003), which narrows REQ-CONFIG-322, REQ-CONFIG-256 and REQ-CONFIG-417
and extends REQ-CONFIG-263 (the ruling named 256 and 417 as extended; PD-WORKSPACE-002 already extends both and the symbol
generator admits one directive per verb, so they are named as narrowed — found while building). *Revised 2026-10-13 by
[OQ-237](51-spikes-and-later-questions-18.md#oq-237) (GV1): Narrows is the verb these two take on the exact-enumeration test (acceptance finding F15), not by force of the
generator, and `PD-WORKSPACE-002` now narrows both as well; the reason in parentheses no longer holds.*

**The two recommendations weighed.** *Advocate A (the user's lens)*: a third Delegation limits control in whole minutes,
1–240, writing seconds through Save and Tier B, minted as a directive; the caps line unchanged. *Advocate B (the system's
lens)*: a read-only row in minutes under Delegation limits naming the key and the file to edit, recorded as a reading with no
directive, since REQ-CONFIG-322 and the three enumerations list the editable set exactly. **The ruling followed A**:
REQ-MONITOR-286 names controls a user moves and initialises them from policy values, and the 1200 s ceiling the duress runs met
is kept only because a user can raise it. From B it kept the exact seconds on screen where the field cannot show them, a hint
saying the limit bounds delegated agents, and the defect note on the unlisted analysis-timeout control
([`the-improvement-analysis-timeout-control-writes-a-key-no-settings-list-names.md`](../../../defects/fixed/the-improvement-analysis-timeout-control-writes-a-key-no-settings-list-names.md),
recorded, not repaired). The 240-minute ceiling is a chosen figure, twelve times the default; a file can still state a longer
value.

**First live execution of the default case, 2026-10-07** (the final duress live run at `a68f121`, pack
`2026-10-07T07-09-30-708Z` of the live worktree, session `e6747bd0`, the self-hosted endpoint): as ruled. The run host logged
`child_timeout=1200 s` (`duress/app.log` lines 13 and 24), and the two working children were cut off at 1,200 s — wave3 landing
at the ceiling +4.25 s, its continuation wave3b at +0.44 s. NOT REACHED: the control, which the live harness never sets and no
launch captured, so the relief this ruling offers — a person raising the limit — is still unmeasured against a real model.
Reported in place in [`PD-CONFIG-003`](../../../product/directives/pd-config-003.md#pd-config-003); the row is in
[`first-executions.md`](../../../architecture/first-executions.md).

<a id="oq-220"></a>

**OQ-220 — Which todo item does a delegation answer for?** *(REQ-ORCH-028 and REQ-ORCH-029, "no two implementation delegations
for the same todo item are outstanding at once"; resolution 15 (b) of `docs/spec/resolutions/01-run-orchestration.md`, ownership
"per todo item and at no other granularity"; REQ-TOOLS-144, the plan's schema; REQ-TOOLS-152, the `delegate` call's
arguments. Raised 2026-10-07 by fin27's build of OQ-213's ruling, at that ruling's instruction. Numbered past the
round's assigned OQ-213 to OQ-219. ~~Open.~~ **Ruled 2026-10-07.**)*

OQ-213's refusal makes a multi-step coordinator keep a todo list of its own, which is the precondition for REQ-ORCH-029's
per-item constraint, not its measurement. A `delegate` call names no todo item (`packages/agent-tools/src/tools/delegation.ts`),
and neither the child ledger nor the plan's items record one, so whether two outstanding implementation delegations serve one
item or two cannot be read from the run's records, which REQ-ORCH-029 says each of its constraints must be.

**What the build proceeds under.** The constraint is instructed and not measured: nothing refuses or records a second
implementation delegation for one item, as before OQ-213.

**What a ruling decides.** Whether a delegation names the todo item it serves (a `delegate` argument, a field on the plan's
item, or a link the run infers), whether a second implementation delegation for an item already served is refused at dispatch,
and what a delegation that names no item counts as.

**Ruled 2026-10-07 under the owner's delegation ([R-072](../../../product/requests.md#r-072)):** a delegation names the todo item it
serves in one optional `delegate` argument, `todo_item`: the id of a task in the caller's own plan. The id is stored on the
child's record, and the call is refused `rejected` when the plan holds no such task. An implementation delegation (REQ-ORCH-028)
is refused `rejected` at admission in three cases: its item is COMPLETED or ABANDONED; another non-terminal implementation child
of the same plan holds the item; or it names no item and comes from the coordinating entry role after that role has written its
todo list for the task (OQ-213's `listWritten`). A delegation that names no item serves no item and holds nothing, so a task's
first work item is the only unnamed implementation delegation the coordinator can make; a continuation inherits the item of the
child it continues, and a `session_id` follow-up keeps its stored item. Recorded as
[`PD-TOOLS-006`](../../../product/directives/pd-tools-006.md#pd-tools-006) **revision 6** (the ruling text names it revision 5; AB1's ruling,
OQ-221, built first in the same bundle, is revision 5, and the round assigned this one revision 6). The dispositions stay as
they are: it narrows REQ-TOOLS-152 and REQ-TOOLS-154 and extends REQ-ORCH-028. The held-item refusal builds REQ-ORCH-028 and
REQ-ORCH-029 as written and needs no directive, following OQ-213's precedent; if a later round reads "a delegation made before
the list serves no item" as a narrowing of REQ-ORCH-029, it lands as `PD-ORCH-006` revision 3, the one narrowing slot
REQ-ORCH-029 admits. The build lacked any way to hold or read the per-item constraint, recorded as
[`no-delegation-names-the-todo-item-it-serves-so-one-item-can-hold-two-implementation-delegations.md`](../../../defects/fixed/no-delegation-names-the-todo-item-it-serves-so-one-item-can-hold-two-implementation-delegations.md).

**The two recommendations weighed, and the ruling followed both.** *Advocate A (the user's lens)* recommended that the
coordinator names the item at the call: an optional `todo_item` stored on the child's record; once the coordinating entry role
keeps a list, an implementation delegation names an item from it; one naming an item another outstanding implementation child
holds is refused `rejected`; one made before any list serves the task as a whole, is recorded with no item and blocks none.
*Advocate B (the system's lens)* recommended the same mechanism, with an unnamed implementation delegation serving no item and
admitted only until the coordinator has written its list. Only the coordinator knows which item a delegation serves, so the link
belongs in the call, where the run can still refuse before a child is paid for; inferring the item conflicts with REQ-TOOLS-144
(names need not be unique) and REQ-TOOLS-145 (one item IN_PROGRESS), a field on the plan's item is written too late to refuse,
and recording without refusing leaves the clause on instruction text, which OQ-213's ruling rejected under REQ-ORCH-029. Where
the advocates differed the ruling followed B: a follow-up reads no `todo_item` (OQ-131) and keeps its stored item; the
held-item refusal comes from REQ-ORCH-028 and binds any caller naming an item of its own plan; a terminal item is refused to
implementation work, so the plan never shows COMPLETED work still under way. From A it took the unknown-id refusal for every
delegation (REQ-TOOLS-152's `inherited_context` precedent) and the harness checks. Both advocates missed that `PD-TOOLS-006`
revision 4 had landed for OQ-216, and that a model cannot name an id its own step creates, so `delegate`'s description and
OQ-213's refusal text tell it to write the list first. A refusal that misfires costs one model step (17.7 to 19.6 s measured);
a duplicate costs a whole child, up to 1,200 s.

*Built 2026-10-07 (fin29, `fin29-delegate-admission`); its first execution is reported in `PD-TOOLS-006` revision 6.* Store
v34's `children.todo_item`; `admitTodoItem` (`packages/engine/src/children/todo-item.ts`) called by `IterationChildren.delegate`
before the spawn and by `followUp` for the held check; `Run.todoPlanFor` reads the caller's plan and `listWritten`; the run
host injects `implementationRole` (`apps/desktop/src/run-host/tools.ts`); `delegate`'s `todo_item` and its description sentence
(`TODO_ITEM_SENTENCE`); `TODO_LIST_OWED_TEXT` names the ids (OQ-213's entry quotes the text it replaced); the live run's
`todoItemReading` (`apps/desktop/scripts/lib/coordinator-todo.mjs`). Shown in the built app by `pnpm mission-proof` item 1e.
**What a live run then shows:** every implementation child the coordinator spawns after its first accepted root `todo` write
carries a `todo_item` naming an item of its agent plan (only a task's first delegation, made before any list, carries none); no
two implementation children holding one item are outstanding at once; a continuation, such as the duress run's d2, carries the
item of the child it continues; `rejected` delegations for an unnamed, unknown, finished or held item are counted, the target
at most one per run, each followed on the next step by a delegation that names an item; the harness's coordinator-todo check
reports all of these.
