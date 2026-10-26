[Product directives](../directives.md) › PD-TOOLS-006

<a id="pd-tools-006"></a>

### PD-TOOLS-006 — a delegated child may declare a write scope that its siblings may not write into

*Revision 11 (2026-10-15, [R-072](../requests.md#r-072)) — **the message that resumes a wait names a reported child's item still
open**, a section added after revision 10's; the ruling of [OQ-333](../../architecture/open-questions/62-spikes-and-later-questions-29.md#oq-333) under the owner's
delegation, with `PD-TOOLS-008` revision 4. REQ-ORCH-063 joins the Narrows line. Nothing is replaced. The ruling named it revision
10; [OQ-334](../../architecture/open-questions/64-spikes-and-later-questions-31.md#oq-334)'s revision 10 landed on `main` first, so it takes the next, 11.*

*Revision 10 (2026-10-15, [R-072](../requests.md#r-072)): the ruling of [OQ-334](../../architecture/open-questions/64-spikes-and-later-questions-31.md#oq-334), from
finding F10 of fin46's final acceptance (the default live run's `delegation` scenario at `3c03287`). A section added after revision
9's, "What a child is told of its report", each clause marked "— revision 10"; the dispositions stay as they were (REQ-TOOLS-152
and REQ-TOOLS-154 already stand on the Narrows line). Nothing is replaced. [OQ-331](../../architecture/open-questions/63-spikes-and-later-questions-30.md#oq-331), ruled
the same day, takes no revision.*

*Revision 9 (2026-10-13, [R-072](../requests.md#r-072)): the rulings of [OQ-256](../../architecture/open-questions/55-spikes-and-later-questions-22.md#oq-256) (the
consortium's question V1) and [OQ-257](../../architecture/open-questions/55-spikes-and-later-questions-22.md#oq-257) (V2), from the duress live run at `552d346`. Two
sections added after revision 8's, "What an answer handed on carries" and "What `delegate` says of a write scope", each clause
marked "— revision 9" and naming the question it rules; REQ-TOOLS-152's `depends_on` clause is quoted below as no longer
governing, and REQ-ORCH-047 joins the Narrows line. Nothing else is replaced.*

*Revision 8 (2026-10-07, [R-072](../requests.md#r-072)): the ruling of the OQ raised from live-run finding D3,
[OQ-250](../../architecture/open-questions/54-spikes-and-later-questions-21.md#oq-250). Nothing is replaced. A section added after revision 7's, "What the routing table says
of the work a route implies (revision 8)"; the dispositions stay as they were.*

*Revision 7 (2026-10-07, [R-072](../requests.md#r-072)) — **an admitted delegation marks its PENDING item in progress**, a section
added after revision 6's; the ruling of [OQ-249](../../architecture/open-questions/53-spikes-and-later-questions-20.md#oq-249) under the owner's delegation, with
`PD-TOOLS-008` revision 2. Nothing is replaced, and the dispositions stay as they were.*

*Revision 6 (2026-10-07, [R-072](../requests.md#r-072)) — **which todo item a delegation serves**, a section added after
revision 5's; the ruling of [OQ-220](../../architecture/open-questions.md) under the owner's delegation. Nothing is replaced, and
the dispositions stay as they were. It lands here for the reason revisions 3 to 5 did: this directive holds REQ-TOOLS-152's
narrowing slot and REQ-ORCH-028's extending slot.*

*Revision 5 (2026-10-07, [R-072](../requests.md#r-072)) — **the attached-artifact budget, and what the caller is told**, a section
added after revision 4's; the ruling of [OQ-221](../../architecture/open-questions.md) under the owner's delegation. It replaces
REQ-TOOLS-152's dropping rule and REQ-LIBRARY-098's figure, both quoted below, and adds REQ-LIBRARY-098 to the Narrows line. It
lands here for the reason revision 3 states: this directive holds REQ-TOOLS-152's one narrowing slot, so a narrowing of
`delegate`'s fields lands here whatever it is about.*

*Revision 4 (2026-10-07, [R-072](../requests.md#r-072)) — **what `delegate` tells its caller about each persona**, a section
added after revision 3's; the ruling of [OQ-216](../../architecture/open-questions.md) under the owner's delegation. Nothing is
replaced. It lands here for the reason revision 3 did: this directive already extends REQ-ORCH-028 and narrows
REQ-TOOLS-152, and the symbol generator admits one directive per requirement for each relation.* *(No longer binding since 2026-10-13, [OQ-237](../../architecture/open-questions.md): two directives may narrow, or extend, one requirement in disjoint cases, so a later narrowing need not land here when it is about something else; what landed here stays.)*

*Revision 3 (2026-09-29, [R-067](../requests.md#r-067)) — **what else `delegate` refuses, and what `session_id` names**,
a section added after "The disclosure"; the owner's rulings on OQ-112 and on OQ-66's open part. Nothing is replaced. This
directive is the one that narrows REQ-TOOLS-152, and the symbol generator admits one narrowing directive per requirement,
so a narrowing of `delegate`'s fields lands here whatever it is about.* *(No longer binding since 2026-10-13, [OQ-237](../../architecture/open-questions.md): two directives may narrow, or extend, one requirement in disjoint cases, so a later narrowing need not land here when it is about something else; what landed here stays.)*

*Revision 2 (2026-09-27, [R-059](../requests.md#r-059)) — **a resumed child re-claims its scope**, in "What is unchanged",
ruled with PD-ORCH-005. Revision 1 (2026-09-23, [R-049](../requests.md#r-049)) is otherwise unchanged.*

**The argument.** `delegate` SHALL accept one further optional action field, `write_scope`: a list of
path patterns relative to the workspace root, in the pattern dialect of the `glob` tool (REQ-TOOLS-138 to
REQ-TOOLS-141: `*`, `**`, `?` and `{a,b}`). A delegation whose `write_scope` holds an empty pattern, an
absolute pattern, or a pattern that reaches outside the workspace root SHALL be rejected, with a reason
naming the pattern.

**The claim.** From the moment a child carrying a `write_scope` is accepted until it reaches a terminal
state, it **claims** every workspace path its patterns match. A call of `write_file` or `haet_edit`
(including its alias `haet`) whose target path is claimed SHALL be refused before it executes when the
calling agent is any agent of the same run other than the claiming child and that child's own descendants.
The refused callers therefore include the claiming child's siblings, its parent and the run's entry agent.
Every `write_file` operation counts as a write, `undo` included. Where the patterns of two live children
match the same path, the child accepted first holds that path. A claim lapses when its child reaches a
terminal state.

**The refusal.** The call's status is `blocked`. The reason names the path, the claiming child's canonical
name and persona, and the pattern that matched, and it points to the two ways forward, in this form:
`<rel> is inside the write scope of <canonical_name> (<persona>), which is still running: '<pattern>'. The
write was not executed. Choose a path outside that scope, or wait for <canonical_name> with wait_for_tasks.`

**The disclosure.** A child's payload SHALL carry one further block, immediately after the workspace-root
prefix of REQ-TOOLS-154: the child's own `write_scope` when it has one, and the `write_scope` of every
other child of the run that is live when this child is accepted, each under that child's canonical name.
The block is omitted when there is nothing to list.

**What else `delegate` refuses, and what `session_id` names (revision 3).** Two further refusals SHALL stand beside
REQ-TOOLS-152's own. Each is reported with status `rejected`, before any record is created and with no task id, and its
reason names the cause:
- a delegation carrying a `write_scope` to a persona that holds no file-writing tool — neither `write_file` nor
  `haet_edit` (with its alias `haet`) — whose reason SHALL say that the persona cannot write files and, where the
  persona catalogue shows any, name the personas that can;
- a delegation whose `session_id` names no settled child of the calling agent.

A persona's tools, for the first of these, are the ones it would be granted for the child, after REQ-TOOLS-006's
controls.

REQ-TOOLS-152's `session_id` names, by its task id, a settled child of the calling agent: a direct child, by
REQ-TOOLS-155's ownership test, that has reached a terminal state and that its `child_timeout` did not cut off. The
follow-up resumes that child from its record with the call's `task` as its next user message, as PD-ORCH-005 clause 22
states. A child its `child_timeout` cut off keeps PD-ORCH-004's `continuation_of`, and a `session_id` naming one is
refused with a reason that names that field.

**What `delegate` tells its caller about each persona (revision 4).** The description of `delegate`, as each agent holding
it is offered it, SHALL name every persona that agent can delegate to: the catalogue's known roles, and each alias whose
target exists, with that target. For each persona it SHALL state which of REQ-TOOLS-001's three facets (reads workspace
files, writes workspace files, runs commands) the native tools of a child of that agent would declare, after REQ-TOOLS-006's
controls, and SHALL say so where a persona declares none. It SHALL say that only the product's own tools are counted, and
that tool-server and plugin tools are not described. It SHALL tell the caller to ask a persona only for work its tools allow,
and to hand command output to a persona that runs no commands through `depends_on` or `inherited_context`. The description
states the grant that holds once execution is released; while a plan gate holds the run, REQ-ORCH-153's refusal stands.
Revision 3's write-scope refusal stays as it is.

**The attached-artifact budget, and what the caller is told (revision 5).** The attached-artifact section of a delegated
child's payload is its `PRIOR AGENT CONTEXT (FULL)` block (REQ-LIBRARY-098), budgeted at 100,000 characters. Attachments SHALL
be considered in the order the caller listed them, and each body is carried whole or not at all. An attachment whose whole body
would carry the section past the budget SHALL be left out, and every later attachment SHALL still be considered. The
observation's attachment warning (REQ-TOOLS-153) SHALL carry:
- how many attachments the child will be given;
- how many were left out for size, naming their ids and citing the budget;
- the references that could not be resolved;
- the ids whose document could not be read.

The warning is computed at acceptance by the same selection that assembles the block. For a child whose payload is assembled
later (held for a model slot, waiting on its dependencies, or resumed), it is a forecast, and REQ-LIBRARY-098's
context-selection diagnostic is the record. REQ-LIBRARY-098's heading, its in-block reports and its context-selection diagnostic
still govern. REQ-TOOLS-153 governs unchanged, since its "any attachment warning" defers the warning's content to REQ-TOOLS-152;
REQ-TOOLS-154's order is unchanged.

> REQ-TOOLS-152 said, and no longer governs: "the first whose full body would carry the section past the budget is dropped, and
> so is every attachment after it." REQ-LIBRARY-098 said, and no longer governs: "within a 48,000-character budget".

**Which todo item a delegation serves (revision 6).** `delegate` SHALL accept one further optional action field, `todo_item`:
the id of a task in the calling agent's own plan (the root's own todo list, or a child's own), which the delegation serves. The
id SHALL be stored with the child's record. A delegation is an **implementation delegation** as REQ-ORCH-028 defines it, its
target persona's grant, as revision 4's catalogue resolves it for the caller, holding a tool the registry declares as writing
workspace files. Each of these SHALL be refused with status `rejected`, before any record is created and with no task id, its
reason naming the item, the holder where there is one, and the way forward:
- for any delegation, a `todo_item` that names no task of the caller's own plan;
- for an implementation delegation, a `todo_item` whose task is COMPLETED or ABANDONED;
- for an implementation delegation, a `todo_item` that another non-terminal implementation child of the same plan holds
  (queued, waiting, running, summarising and paused children all hold; every root's children are one plan);
- for an implementation delegation from the coordinating entry role, no `todo_item` once that role has written its todo list
  for the task (OQ-213's `listWritten`).

A delegation that names no item serves no item and holds nothing. A continuation (`continuation_of`) that names none inherits
the item of the child it continues and meets only the held-item refusal. A `session_id` follow-up keeps its stored item, reads
no `todo_item` (OQ-131), and is refused only while another outstanding implementation child of the plan holds that item. Each
refusal is logged as a warning citing REQ-ORCH-028 or REQ-ORCH-029. `delegate`'s description SHALL say what `todo_item` names,
when it is required, and that the list is written in one step and the delegation made in the next.

**An admitted delegation marks its PENDING item in progress (revision 7).** An admitted delegation's item is the one it names in
`todo_item`, the one a continuation inherits through `continuation_of`, or the one a `session_id` follow-up keeps. When that item
is PENDING in the caller's own plan, the admission SHALL mark it IN_PROGRESS in that plan and persist the plan; the task is then
held (`PD-TOOLS-008` revision 2) and outside REQ-TOOLS-145's count while the child is non-terminal. A COMPLETED, ABANDONED or
IN_PROGRESS item is left as it is, and a rejected delegation marks nothing. The observation SHALL state `Todo item <name>
(<id>) is now IN_PROGRESS.` and append the Todo state REQ-TOOLS-147 renders. `delegate`'s description SHALL say that the call
marks the item it names.

**What the routing table says of the work a route implies (revision 8).** The built-in coordinating instructions' routing
table SHALL keep every route REQ-ORCH-028 states, and its two capability clauses for `codebase-analyst` and `librarian`, word for
word. The table SHALL close with one sentence, the same for every configuration, that names no persona's tools. The sentence says
that each route names the persona whose judgement the need calls for; that the work itself goes to a persona whose entry in
`delegate`'s list allows it — a file to write needs one that writes workspace files, and a test or other command to run needs one
that runs commands; and that where the route's persona lacks what the work needs, the caller asks it for its answer and hands that
answer, through `depends_on` or `inherited_context`, to a persona that has what the work needs. Revision 4's closing instruction in
`delegate`'s description SHALL also tell the caller never to write in a brief that a command or tool the persona's entry does not
show is available to it. A configured `system_prompt` (REQ-CONFIG-100) is unchanged: it replaces the routing table and its
sentence, and the catalogue still reaches that coordinator. Revision 3's refusal and revision 4's catalogue are unchanged.

**What an answer handed on carries (revision 9, [OQ-256](../../architecture/open-questions/55-spikes-and-later-questions-22.md#oq-256)).** The two hand-off blocks
of a delegated child's payload — the inherited-context block (REQ-TOOLS-154 item 5) and REQ-ORCH-047's prior-agent-context block —
SHALL carry each named task's answer as follows *(— revision 9, OQ-256)*:
1. Each block renders, in the caller's order, every named sibling's (inherited) or dependency's (prior-agent) result text — the
   final response, else the last response, else the key findings, else the summary — under a heading of its canonical name, role
   and status. The inherited block keeps its heading that the reports are context and not a dependency, and a cut-off child's
   additions (`PD-ORCH-004`) after the result text; the prior-agent block keeps its authoritative flag and REQ-ORCH-047's
   once-only injection.
2. Each block's result texts are budgeted at 100,000 characters, each block on its own. A text is carried whole while it fits;
   a text that does not fit is cut to the larger of the budget's remainder and 4,000 characters, so a block passes the budget by
   at most 4,000 characters for each cut text, and no child receives less of an answer than REQ-ORCH-060's report block gave it.
3. A cut text SHALL end in a marker naming the characters given and the characters omitted and citing the budget, saying that the
   rest is in neither the workspace nor the artifact store, and saying that the child's report must state which parts of the
   answer it did not receive.
4. The `delegate` observation (REQ-TOOLS-153) SHALL name each inherited answer the stored block cut and the characters omitted,
   beside revision 5's attachment warning; for a `depends_on` task already complete at the call it names the cut REQ-ORCH-047's
   block would make as the reports then stand — a forecast, the payload's marker being the record. Nothing is said when nothing
   is cut.
5. `delegate`'s description SHALL say that `depends_on` and `inherited_context` each carry the whole answer of every task they
   name up to 100,000 characters per field, that a longer answer is cut and both caller and child are told, and that
   `attach_artifacts` carries artifact bodies.

REQ-ORCH-060's 4,000-character cap is unchanged: it governs the report blocks of the resume message and the wait results, and no
hand-off block.

> REQ-TOOLS-152 says, and for `depends_on` no longer governs: "each upstream task's summary and key findings appear in the
> child's payload" — REQ-ORCH-047's block and clause 1 above state what a dependency's answer carries. Its "reports" for
> `inherited_context` is read as clause 1's result text under clause 2's budget.

**What `delegate` says of a write scope (revision 9, [OQ-257](../../architecture/open-questions/55-spikes-and-later-questions-22.md#oq-257)).** `delegate`'s
description SHALL tie work that writes files to a persona whose entry in its catalogue writes workspace files, SHALL tell the
caller to give that child `write_scope`, and SHALL say that a `write_scope` given to any other persona is refused and nothing is
started; the `write_scope` field's description in the offered schema SHALL say the same in one sentence. Both texts are fixed
and name no persona *(— revision 9, OQ-257)*. Revision 3's refusal, revision 4's catalogue, revision 8's routing sentence and
REQ-ORCH-028's routes are unchanged.

**What a child is told of its report (revision 10, [OQ-334](../../architecture/open-questions/64-spikes-and-later-questions-31.md#oq-334)).** REQ-LIBRARY-092 keeps
every ended child's report as an artifact of kind `child_report`, and the agents are now told so *(— revision 10, OQ-334)*:
- `delegate`'s description, where the caller's run holds an artifact store, SHALL carry one fixed sentence, after revision 9's
  hand-off sentence and naming no persona, saying that the run keeps an ended child's report as a `child_report` artifact, which
  `artifact_list` shows and `attach_artifacts` hands on, and that a caller asks a child for its findings in its report and asks it
  to publish an artifact only where its entry says it publishes artifacts;
- revision 4's catalogue SHALL state one further computed word, "publishes artifacts", on each entry whose child's resolved grant
  holds `artifact_write` (the persona's own `can_publish_artifacts` with the store, OQ-212), and on no other;
- every child's payload SHALL carry one fixed sentence immediately after REQ-TOOLS-154's workspace-root line, ahead of the write
  scopes, saying that the run keeps its report as an artifact that later agents can list and be handed, and that, where its task
  asks it to publish its findings and it holds no tool that publishes artifacts, its report meets that request.

A brief is neither refused nor rewritten, the routing table names no publisher, no persona's grant changes, and the playbook's
ARTIFACT text stays as built. Revision 3's refusals, revision 4's three facets, revision 8's routing sentence and revision 9's
sentences are unchanged.

**What the message that resumes a wait says of a reported child's item still open (revision 11, [OQ-333](../../architecture/open-questions/62-spikes-and-later-questions-29.md#oq-333)).**
Revision 7's mark leaves a delegated item IN_PROGRESS after its child ends, and `PD-TOOLS-008` revision 4 no longer counts it
against the caller's next mark, so nothing but this line tells the caller to close it. When the message that resumes a wait
(REQ-ORCH-063: a `wait_for_tasks` result, the wait of a `delegate` with `run_in_background: false`, and the orchestration pass's
resume of a parent whose children it waited for) reports a child whose `todo_item` is still IN_PROGRESS in the caller's own plan,
with no non-terminal child of the caller holding it, the message SHALL add, immediately after that child's result,
`Todo item <name> (<id>) is still IN_PROGRESS: close it with update once you accept this report.` *(— revision 11, OQ-333)*. An
item the caller has closed, one another running child holds, and a child that serves no item add nothing; an item two reported
children serve is named once, after the first of them. The run never closes the item, and REQ-ORCH-059's completion notification
is unchanged.

**What is unchanged.** A child delegated without a `write_scope` claims nothing and is refused only where a
live sibling's claim reaches. A `write_scope` never limits the child that declared it: that child may write
outside its own patterns wherever no other claim reaches. A claim belongs to one run and lapses with its child, so a
continued session starts with none of the previous run's claims; the `write_scope` a child declared is stored with its
record, and a child resumed under PD-ORCH-005 claims it again from the moment it is accepted, under the same rules as
any child (revision 2). Reading is never refused by a claim.

> Revision 1 said, and no longer governs: "Claims belong to one run and are never persisted, so a resumed session
> starts with none."

**Why, and what it costs.** In run `2e21e324` two children writing in one checkout refused each other three
times and one of them spent turns discovering its sibling's file by hand. Both of the product's guards held
(the hash guard and the create-guard), so nothing was lost; the cost was that each child learned about the
other only at the moment of writing. A declared scope moves that knowledge to the start: the parent says
which paths each child will write, each child is told at start which paths belong to someone else, and a
write that crosses a live claim is stopped with the name of its owner. What it costs:

- **The file tools only.** `terminal`, `git_commit`, MCP tools and plugin tools can still write a claimed
  path, because none of them passes through the file tools' path handling. The claim is a coordination
  mechanism for agents that use the file tools, which is the case the run observed.
- **The parent has to declare.** A parent that spawns parallel writers without scopes gets exactly today's
  behaviour. Claims made automatically by the first writer were considered and not chosen, because they
  would still surface the collision only at write time.
- **The parent is refused too.** A parent that wants to write into a live child's scope waits for the child
  or writes elsewhere.

**Why revision 3, and what it costs.** In the duress live run of 2026-09-29 the orchestrator delegated a documentation
file to `codebase-analyst`, a persona that holds no file-writing tool, with that file as its `write_scope`. The scope was
accepted, the child ran for 2 min 47 s and could only answer that it had no file-writing tool, its report still read
`succeeded`, and a second child was commissioned for the same file. A refusal at the call moves that discovery to the
moment the parent can still choose. And `session_id` was accepted and dropped
([`delegate-drops-session-id-and-suppress-auto-context.md`](../../defects/fixed/delegate-drops-session-id-and-suppress-auto-context.md)),
so a caller that set it was told nothing and got a fresh child. What it costs:
- a parent can no longer give a read-only child a scope for coordination alone;
- a persona whose only writing tools are ones the claim does not fence — the code-intelligence server's editing tools,
  `terminal`, MCP or plugin tools — counts as holding no file-writing tool and is refused a scope, although it can write
  files; a scope could not have fenced those writes either ("The file tools only", above);
- a follow-up re-sends the child's whole conversation, where a fresh child sends only its payload.

**Why revision 4, and what it costs.** In both duress live runs of 2026-10-06 the orchestrator briefed `docs-writer`
children, which hold no `terminal`, to "Run `node --test` yourself in the terminal". At `c2a9444` (finding N3) the two failed
children, 2,443.5 s of the critical path, spent 22 of 57 and 23 of 35 rows reasoning about the missing shell, one wrote
`.tmp-run-tests.sh` as a workaround (N2), and the answer to the user said the continuation "ran the suite". At `c2fdd6a`
(finding L4) the brief appeared twice, a child called a `run_command` tool that does not exist, and the answer blamed the
timeouts on the missing shell. Each run also spent 34 to 37 s on two of revision 3's refusals. Nothing the coordinator read
stated a persona's tools: the description listed the built-in names, the same for every caller. A refusal cannot reach a
request to run a command, which sits in free text, and REQ-TOOLS-001 never infers a facet from prose; the system prompt
cannot carry it either, since a configured `system_prompt` replaces the built-in one (REQ-CONFIG-100) and it cannot apply
each caller's `tool_restrictions`. What it costs:
- the statement is advice and enforces nothing; whether the impossible briefs stop is measured at a duress live run;
- about 250 tokens join every delegating agent's tool listing;
- a persona whose only writer is an MCP tool reads as writing no files, the blind spot revision 3 accepts;
- a persona whose only writing tool is `git_commit` would read as writing files and still be refused a `write_scope`
  (revision 3: the file tools only);
- the coordinator may commission more children, a command runner beside a writer.

**Why revision 5, and what it costs.** Two requirements budgeted one block differently. REQ-TOOLS-152 set 100,000 characters
and dropped the first overflowing attachment with every one after it; REQ-LIBRARY-098 set 48,000. The build used 48,000 with a
skip-and-continue it took from neither, and its observation said "N artifacts were attached to its context", counting the
references that resolved before any budget applied, so a caller could be told of an artifact its child never received
([`the-attached-artifact-budget-is-48000-characters-where-req-tools-152-sets-100000-and-drops-every-later-one.md`](../../defects/fixed/the-attached-artifact-budget-is-48000-characters-where-req-tools-152-sets-100000-and-drops-every-later-one.md)).
REQ-TOOLS-152 calls itself the whole `delegate` contract, REQ-ORCH-032 hands the oversized attachment to it, and domain 05's
resolution 26 and limits inventory carry 100,000; REQ-LIBRARY-098's restatement is the one the reconciliation missed.
Skip-and-continue keeps resolution 26's three reasons (deterministic, order-preserving, never partial) and never displaces an
earlier attachment, so the child always receives a superset of what the prefix rule gives. What it costs:
- up to about 25,000 tokens more on a child's first message, and on every later turn that carries it;
- a later attachment can arrive without an earlier one it builds on, where the prefix rule withheld both;
- for a child held before its payload is assembled, the observation is a forecast the store may outrun.

**Why revision 6, and what it costs.** REQ-ORCH-028 measures implementation ownership per todo item and REQ-ORCH-029 holds
the coordinator to no two implementation delegations for one item outstanding at once, checkable from the run's records. OQ-213
made the coordinator keep a list of its own; nothing in the build named which item a delegation served, so the per-item
constraint stood on instruction text and no record could check it
([`no-delegation-names-the-todo-item-it-serves-so-one-item-can-hold-two-implementation-delegations.md`](../../defects/fixed/no-delegation-names-the-todo-item-it-serves-so-one-item-can-hold-two-implementation-delegations.md)).
Only the coordinator knows which item a delegation serves, so the call names it, where the run can still refuse before a child
is paid for. What it costs:
- a refusal that misfires costs the coordinator one model step (17.7 to 19.6 s measured), where a duplicate costs a whole
  child, up to 1,200 s;
- a model cannot name an id its own step creates, so a list and a delegation written in one step leave the delegation refused,
  once;
- a coordinator that works on one item at a time must split it (`todo add_task`) to run two writers in parallel;
- REQ-ORCH-030's per-item attempt count now has its key, and is still owed.

**Why revision 7, and what it costs.** REQ-TOOLS-147 makes the Agent plan the run's primary progress display, and REQ-ORCH-029
asks for a list the coordinator keeps current. With revision 6 the run knows which item each delegation serves, yet the item
stayed PENDING while its child ran unless the coordinator spent a step marking it, and REQ-TOOLS-145 refused that mark for a
second parallel child (`OQ-249`, the default live run's `#14` at `a68f121`). Marking at admission costs no model step. What it
costs: the run writes the agent's plan, so a model that also sends `update … IN_PROGRESS` meets REQ-TOOLS-147's no-op error,
one cheap refused row; and an item stays IN_PROGRESS after its child ends until the coordinator closes it.

**Why revision 8, and what it costs.** In the duress live run at `a68f121` (session `e6747bd0`, finding D3) revision 4's catalogue
reached all 35 coordinator requests, and the coordinator still gave the work a route implies to the route's persona: `#115` gave
`architect` `docs/decisions.md` with a `write_scope` (refused in 170 ms; a docs-writer re-briefed in 19.4 s), and `#114` offered
`node --test` to a docs-writer, which called a tool that does not exist (`#164`, refused at the gate in a 2.5 s step; issues 3 and 4);
16 of 117 docs-writer requests carried a missing-shell aside. The misroute moved with the subject: the same task went to
`codebase-analyst` at `c2fdd6a` (`#107`). OQ-216's target of zero was missed. What it costs:
- the sentence is still advice;
- about 80 tokens join every coordinating request;
- the coordinator may commission two children for one document (the route's persona for its answer, a writer for the file);
- the directive grows by one revision.

**Why revision 9, and what it costs.** In the duress live run at `552d346` (session `18a9d22d`) revision 8's hand-off ran twice
and lost most of what it handed on (finding V1): the inherited-context block reused REQ-ORCH-060's resume-message block, so the
architect's 28,330-character analysis reached the writer as 4,000 characters and a marker, and the verifier's 20,195-character
report as 4,000; the writer wrote 7 of the document's 8 file sections from its own reading, and the user's answer credited them to
the architect. REQ-ORCH-047's channel carried an answer unbounded, so two channels one sentence presents as equivalent delivered
14 % and 100 % of the same answer. The same run gave `architect` a `write_scope` with the routing sentence in every request
(finding V2, `#92`): the coordinator chose the scope by habit, and the text it followed was `delegate`'s own sentence, which made
the task the condition and never the persona. What it costs:
- a child's payload grows on every turn that carries it, up to about 300,000 characters of answers across three blocks in the
  worst case (two hand-off blocks and revision 5's attachments);
- a `depends_on` answer over 100,000 characters, unbounded until now, is cut;
- the write-scope sentence is still advice, about 40 more tokens on every delegating request, and a model that drops the scope
  but still briefs a non-writer to write is caught only by OQ-257's reopening condition;
- OQ-216's write-scope target of zero becomes a bound (at most one refusal a run, each re-routed by the next request) —
  *falsified 2026-10-15 and replaced by [OQ-331](../../architecture/open-questions/63-spikes-and-later-questions-30.md#oq-331)'s per-task bound, reported under
  revision 9's first execution below;*
- an implementation built from the specification alone caps the inherited block at 4,000 characters and words the sentence as
  before.

**Why revision 10, and what it costs.** In the default live run at `3c03287` (session `d0c3a7f0`, finding F10) the coordinator
briefed a codebase-analyst "Publish your findings as an artifact so later steps can attach it." (`#5`), because nothing it was
offered said that the run keeps every ended child's report as an artifact, and no catalogue entry could say who publishes. The
child, whose grant held no `artifact_write` under OQ-212, called it anyway (`#10`, refused at the gate as an unknown tool), and the
report the run kept as `art_C1ZUuJ3B` said "no artifact or file was created", tagged `errors`, and was attached whole to the next
child. The enforced bound held; the Library's record was false. What it costs:
- both sentences are advice, and the gate's unknown-tool refusal stays the enforced bound;
- about 45 more tokens on every delegating request and about 40 on every child's first request;
- a child told its report meets a publishing request may hold back from a separate deliverable artifact where a workspace grants
  one, which costs little, since the report holds the findings;
- an implementation built from the specification alone carries neither sentence nor the fourth word.

**Why revision 11, and what it costs.** Revision 7 marks a delegated item IN_PROGRESS and leaves the close to the caller, and
until `PD-TOOLS-008` revision 4 the next mark's refusal was what told it; the default live run at `3c03287` (delegation-swarm,
finding F9) paid four calls and about 7 s for it. With the refusal gone, a caller that never reads its plan again would leave the
item open, and the Agent plan strip would show it active after its work was done. The resume message is where the caller reads
the child's report, so the line goes there, beside the report it asks the caller to accept. What it costs:
- about 25 tokens per reported child whose item is still open;
- the line is advice: a caller may still leave the item open, which the live run's NOTE counts;
- one more narrowing, of REQ-ORCH-063's message, which now carries more than the reports;
- an implementation built from the specification alone resumes with the reports alone.

> **Narrows:** REQ-TOOLS-152, REQ-TOOLS-154, REQ-LIBRARY-098, REQ-ORCH-047, REQ-ORCH-063
> **Extends:** REQ-ORCH-028

*Raised by the owner, 2026-09-23; logged as [R-049](../requests.md#r-049). Revision 2 logged as [R-059](../requests.md#r-059),
revision 3 as [R-067](../requests.md#r-067). Revision 4 ruled under the owner's delegation, [R-072](../requests.md#r-072), from
the final live runs' findings L4 and N3. Revision 5 ruled under the same delegation from OQ-221 (the consortium's question AB1), revision 6 from OQ-220, revision 7
from OQ-249 (the consortium's question P3), revision 8 from OQ-250 (the consortium's question D3, the duress live run's finding D3),
revision 9 from OQ-256 and OQ-257 (the consortium's questions V1 and V2, the duress live run at `552d346`), revision 10 from
OQ-334 (finding F10 of fin46's final acceptance, the default live run at `3c03287`), revision 11 from
OQ-333 (finding F9 of fin46's final acceptance, the default live run at `3c03287`).*

> **First execution, 2026-09-23, the day it was ruled:** the mechanism was built as written, and one clause of
> the disclosure proved false for one reader. The block lists "the `write_scope` of every other child of the run
> that is live", and a child's own descendants are exempt from its claim, so a grandchild delegated by a scoped
> child is shown its ancestor's scope among the paths that are refused to it. The build lists the scope as the
> directive requires and marks it as belonging to an agent the reader works under, whose scope does not fence it.
> Two placements were decided by the code rather than by the text: the refusal is the **gate's** (an executor can
> answer only `ok` or `failed`, and `blocked` is the gate's status), and it is taken **ahead of the permission
> resolution**, so a write the claim refuses never costs the user an approval first. The block follows the
> workspace-root line, which `childPayload` places after the artifact blocks rather than first, as
> `REQ-TOOLS-154` requires; that order is recorded as a defect of its own and is not changed here. The row is in
> [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **First execution of revision 2, 2026-09-27, ruled by [R-059](../requests.md#r-059) and built with PD-ORCH-005 under [R-063](../requests.md#r-063):** the rule was
> built as written, and it found nothing the text got wrong.
>
> The declared scope is stored with the child's record at spawn (`children.write_scope`, store v23). When a child
> resumes, its scope is claimed again from the moment it is accepted.
>
> Covering the re-claim order found one thing: the store listed children accepted in the same millisecond by their
> random task ids. So "the child accepted first holds that path" could fall to the later child on a resume. The
> child queries now order by insertion (`spawned_at, rowid`), and the order is pinned in `store.test.ts`.
>
> **What was measured.** Two scripted end-to-end cases in `children.test.ts`, each red when its limb is reverted:
> - a resumed child's stored scope refuses a sibling's write;
> - two children accepted in one millisecond re-claim in acceptance order.
>
> **What was not measured.** No built-app run declared a scope. The row is in
> [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **Reported back 2026-10-13:** "No built-app run declared a scope" no longer holds. Since `d8ede92` (2026-09-25) the live
> run's `edit` scenario delegates two write-scoped children and checks that they were live together and told of each
> other's scopes; at `552d346` and `0bc3eee` it passed ("two children were delegated with a write scope each", "two scoped
> children were live at the same time"). This revision's own mechanism, a resumed child's re-claim, ran live in the
> `resume` scenario: at both heads its two children carried `children.write_scope` (`docs/notes-functions.md`,
> `docs/notes-tests.md`), were paused while running, resumed under their own task ids after the Continue, and each wrote
> its file inside its scope with no refusal. No sibling tried to write into a resumed child's scope, so the refusal the
> re-claim exists for has still been shown only by `children.test.ts`. The row is in
> [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **First execution of revision 3's scope refusal, 2026-09-29, built under [R-067](../requests.md#r-067):** the refusal
> was built as written ([OQ-112](../../architecture/open-questions.md)). `IterationChildren.delegate` refuses a
> `write_scope` for a known persona that cannot write files, straight after the scope's own validation, with status
> `rejected`, no record and no task id. The reason names the catalogue's writers. The phrase "after REQ-TOOLS-006's
> controls" met one gap in the build. The per-persona `tool_restrictions` map, the fourth control, narrows no agent's
> grant today ([`a-personas-tool-restrictions-never-narrow-its-grant`](../../defects/fixed/a-personas-tool-restrictions-never-narrow-its-grant.md)).
> The check therefore reads the two controls a child's grant does meet, `coordinator_only` and `read_only`. The
> clause's text is not wrong; the build lacks a control it names. *Closed 2026-09-29 under R-067 (acceptance finding
> A4):* the map now narrows the grant as [OQ-145](../../architecture/open-questions.md) builds it — the entry the persona's
> own map and the delegating persona's map give its name — and the check reads the same lists. A persona the caller's
> map restricts to reading cannot take a scope, and the reason names only the writers the caller's map lets write
> (`children.test.ts`, "the parent agent's tool_restrictions bind the refusal"). The sentence above is kept as the reason
> the first build read two controls. Two existing scripted cases had scoped a read-only
> `codebase-analyst`, which the directive now forbids, and they scope a `docs-writer` instead. Revision 3's other
> refusal, a `session_id` naming no settled child, is not part of this build.
>
> The persona checked is the one the ledger resolves, an alias included. The first build read the built-in table
> without its aliases, so `playwright` with a scope reached the ledger and was accepted as `ui-verifier`; the branch's
> verification found it, and the check now reads the ledger's resolution.
>
> **What was measured.** Scripted end-to-end cases in `children.test.ts` over the duress call's shape and over the
> alias, each red with its check removed, and the predicate, the catalogue and the reason in `write-scope.test.ts`. Live, in the duress run of
> session `b4a768a2`, a scope given to `verifier` was refused with the writers named. The orchestrator's next request,
> 15 s later, delegated the task to `docs-writer`. In a second duress run built from the alias repair (session `059ae1d7`), a scope given
> to `codebase-analyst`, the finding's own shape, and one given to `verifier` were both refused, and each task went next
> to a writer (`docs-writer`, `tester`). No alias was delegated live. The row is in
> [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **First execution of revision 3's `session_id`, 2026-09-29, built under [R-067](../requests.md#r-067) with `PD-ORCH-005`
> clause 22:** the refusal and what `session_id` names were built as written. `IterationChildren.followUp` refuses, with
> status `rejected`, no record touched and no task id:
> - an id that is no task id of the caller's own children;
> - a child that has not ended;
> - a child its `child_timeout` cut off, with a reason that names `continuation_of`.
>
> The text met the code in two places, and [OQ-131](../../architecture/open-questions.md) records the reading built for
> each:
> - "names no settled child of the calling agent" is one reason for an unknown id and for another agent's child alike.
>   REQ-TOOLS-155's parent scoping reads another's child as none of the caller's, as `background_output` does.
> - "cut off" is read from the child's stored report: a `timeout` error, or `PD-ORCH-004`'s `cut_off` block.
>
> The follow-up re-claims the child's stored `write_scope` as revision 2 has a resumed child do.
>
> **What was measured.** Scripted end-to-end cases in `children.test.ts`, each red on the code before the repair, where
> the id was dropped and a fresh child spawned. **What was not measured.** No built-app or live run set `session_id`. The
> row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).
>
> **Reported back 2026-10-13 (fin42, item N57):** "No built-app … run set `session_id`" no longer holds for the built app.
> `pnpm delegation-proof`'s `follow-up` launch (scripted) delegates a `codebase-analyst`, waits for it to end, and calls
> `delegate` with `session_id` naming its task id: the observation read "Following up probe (codebase-analyst): it resumes from
> its record under its own task id", the session held one child row, the child's record held the follow-up's task once, a
> `child_resumed` entry said it was followed up from `succeeded`, and the child answered one more model call and ended
> `succeeded` again. Still not measured live: the default live run's `delegation` scenario asks for the follow-up, and is the
> orchestrator's to run. The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **First execution of revision 4, 2026-10-07, ruled under [R-072](../requests.md#r-072) ([OQ-216](../../architecture/open-questions.md)):**
> built as written, and the text met the code in three places.
>
> - **Where the facets are computed.** The engine and `agent-tools` do not import each other, so the run host builds the
>   catalogue (`delegateCatalogue`, `apps/desktop/src/run-host/tools.ts`) with the function an agent's own port now applies
>   to itself (`resolveAgentGrant`): the persona's tools, `coordinator_only`, `read_only`, the `tool_restrictions` lists of
>   the persona's own map and the caller's (OQ-145), and REQ-TOOLS-004's prerequisites as this run meets them. `agent-tools`
>   renders it from the registry's facets (`renderDelegateCatalogue`, `grantsOn`). The prerequisites are not REQ-TOOLS-006's
>   controls, but a tool they remove is not granted, so the description states the grant the child receives; a run with no
>   terminal backend tells the caller that no persona runs commands.
> - **`git_commit`.** The cost named above does not arise in this build: `git_commit` has no executor
>   (`TOOL_IMPLEMENTATIONS`, `packages/contracts/src/tools.ts`), so REQ-TOOLS-004 removes it and a persona declaring it is
>   not told it writes files on its account.
> - **The orchestrator.** The catalogue's known roles include `orchestrator`, which the ledger accepts as a child; a child
>   orchestrator is coordinator-only and is described as reading workspace files. The fixed list this replaced left it out.
>
> The routing table's two capability clauses, which the same ruling restores as covered work, landed beside it.
>
> **What was measured.** `packages/agent-tools/src/tools/delegation.test.ts` pins the built-in table's lines (docs-writer
> reads and writes; tester and the two implementers all three; verifier and ui-verifier read and run commands; the six
> research and decision roles read), the aliases, a persona declaring none, the closing instruction and the unchanged
> sentences, sixteen of them red on the fixed description. `apps/desktop/src/run-host/tools.test.ts` holds, for every known
> role, the facets the caller is told equal to the facets of the grant that role's child port receives: the built-in table,
> a configured `tools:` override, a caller's `tool_restrictions` entry (for that caller alone), a `read_only` persona and a
> persona the configuration adds. **What was not measured.** No live run has yet carried the description; the duress run
> after this lands counts briefs that ask a persona without a terminal to run commands (2 to 3 per run before; target 0),
> `write_scope` refusals (2 per run; target 0), child rows spent on a missing tool and stray workaround files. The row is
> in [`../architecture/first-executions.md`](../../architecture/first-executions.md).
>
> **First live execution of revision 4, 2026-10-07 (the final default live run at `a68f121`, pack
> `2026-10-07T06-48-50-123Z`; a default pack, not the duress run the paragraph above names):** the description reached the
> model as built. All 71 coordinator requests carried the 2,342-character catalogue, each persona with its facets ("tester
> (reads workspace files, writes workspace files, runs commands)", "verifier (reads workspace files, runs commands)") and
> the rule to ask a persona only for work its tools allow; the 59 coordinating prompts carried both routing clauses, and
> the 12 direct-work prompts no routing table (`PD-ORCH-006`). The terminal coordinator chose by facet (its traffic #1: "I'll
> delegate to 'tester' (reads workspace, writes workspace, runs commands)"), and no brief asked a persona without a terminal
> to run anything: the 8 children were 5 coding-agent, 2 tester and 1 verifier. **Found:** the catalogue also offers
> `intent-classifier`, which the defaults call a persona outside the delegation vocabulary (the pack's finding P5; no
> coordinator delegated to it). **Still owed:** the duress counts named above (briefs, `write_scope` refusals, rows spent on a
> missing tool, stray files). The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).
>
> **Reported back 2026-10-07, ruled under [R-072](../requests.md#r-072) ([OQ-228](../../architecture/open-questions/53-spikes-and-later-questions-20.md#oq-228), the consortium's
> question P5):** the build read "every persona that agent can delegate to" as **every `personas:` key of the configuration**
> (`knownRoles()`, `Object.keys(cfg.personas)`), with `gatekeeper` among the research and decision roles; that reading stays
> here, and is replaced by the **delegation targets**: every persona of the configuration except the three REQ-MCP-014 and
> REQ-ORCH-126 reserve (`intent-classifier`, `project-initializer`, `gatekeeper`). The directive's text and dispositions are
> unchanged; this is covered work. Built 2026-10-13 by fin33 (`delegationTargetsFor`, `resolveDelegationTarget`,
> `packages/engine/src/children/personas.ts`): under the default configuration the catalogue names twelve personas and the two
> aliases, and a delegation to a reserved persona is refused before any other admission check, naming what the product runs it
> for. Found by building: the resolver path's unknown-persona message listed no aliases, which REQ-ORCH-034 requires; it now
> does. **What was not measured:** no live run yet; the next default run should show neither reserved name in any catalogue.
>
> **Reported back 2026-10-07, ruled under [R-072](../requests.md#r-072) ([OQ-229](../../architecture/open-questions/53-spikes-and-later-questions-20.md#oq-229), the consortium's
> question DT1):** for a caller whose `delegates_to` names any persona, "every persona that agent can delegate to" means the
> delegation targets that list names (REQ-CONFIG-101); an empty list narrows nothing. Built 2026-10-13 by fin33
> (`Persona.delegatesTo`, `DelegateCatalogue.narrowedBy`); the evidence is scripted only, since no live run sets the key.
> *Reported back 2026-10-13 (fin42, item N57):* the built app now sets it. `pnpm delegation-proof`'s `delegates-to` launch
> gives the orchestrator `delegates_to: [codebase-analyst]` in the workspace's configuration: the `delegate` tool the model port
> was offered said "Your delegates_to (codebase-analyst) narrows this list: a delegation to any other persona is refused." and
> named no other persona, a delegation to `codebase-analyst` was admitted, and one to `docs-writer` was refused, "'docs-writer'
> is not a persona orchestrator may delegate to: its delegates_to lists codebase-analyst. Known personas: codebase-analyst.". The
> live run's `delegation` scenario sets the key (`codebase-analyst`, `docs-writer`); its run is the orchestrator's.
>
> **Measured 2026-10-07 (the duress live run at `a68f121`, pack `2026-10-07T07-09-30-708Z`, session `e6747bd0`; recorded
> 2026-10-13 under [OQ-250](../../architecture/open-questions/54-spikes-and-later-questions-21.md#oq-250)):** the "What was not measured" above, now measured. The catalogue
> was in 35 of 35 coordinator requests. Briefs asking a persona without a terminal to run commands: 1, against 2 to 3 per run
> before (`#114`, `node --test` offered to a docs-writer, then `run_command` refused at the gate, `#164`). `write_scope` refusals:
> 1, against 2 per run (`#115`, `architect` given `docs/decisions.md`, refused in 170 ms with the writers named, re-briefed in
> 19.4 s). Rows spent on a missing tool: 16 of 117 docs-writer requests carried a one-sentence aside, against 22 to 23 rows per
> failed child before. No stray workaround file, no impossible brief on a failed child's path, and the answer claimed no test run.
> The target of zero was missed for revision 4 alone; revision 8 is the next step, measured against the same target.

> **First execution of revision 8, 2026-10-13, ruled under [R-072](../requests.md#r-072) ([OQ-250](../../architecture/open-questions/54-spikes-and-later-questions-21.md#oq-250)),
> built by fin33 (`fin33-delegation-targets-and-plan`):** built as written. The sentence is `ROUTING_WORK_SENTENCE`, appended to
> `ROUTING` after "final acceptance → verifier." (`packages/engine/src/children/personas.ts`), so `BUILT_IN_ORCHESTRATOR_PROMPT` stays
> a constant and `entryInstructionsFor` still swaps it whole on a direct-work grant; a configured `system_prompt` carries neither the
> routes nor the sentence. The brief clause opens the catalogue's closing instruction ("Ask a persona only for work its tools
> allow, and never write in a brief that a command or tool its entry does not show is available to it: …"). **What was measured.**
> `children/personas.test.ts` (the sentence verbatim after the last route, red before; no persona of the vocabulary named; the swap
> and a configured prompt) and `tools/delegation.test.ts` (the clause, red before); `lib/routing-misses.test.ts` pins the harness
> NOTE against the a68f121 duress shapes (`#115`, `#164`). **What was not measured.** No live run: the next duress run is the
> measure — 0 `write_scope` refusals for a non-writer and 0 briefs offering a command or tool the target lacks, a design or decision
> document going to a docs-writer directly or with `architect`'s answer handed on; the reopening condition is OQ-250's. The row is
> in [`../architecture/first-executions.md`](../../architecture/first-executions.md).
>
> **Revision 8's first live execution, the duress run at `552d346` (session `18a9d22d`, 2026-10-13; findings V1, V2 and the D3
> verdict), reported in place:** the sentence in 41 of 41 coordinator requests and the brief clause in 41 of 41 `delegate`
> descriptions; 1 `write_scope` refusal for a non-writer (`#92`, req 59, row 168: `architect` given `docs/decisions.md`, refused
> in 5 ms before any record, re-routed by req 65's next `delegate` 30.0 s later as `architect` without a scope, `#111`, and a
> docs-writer with `inherited_context`, `#163`); 0 impossible briefs, 0 unknown-tool calls by a child, 0 stray files; missing-shell
> asides in 5 of 117 requests of the non-commanding personas, against 16 of 117 at `a68f121`. The sentence worked as recovery,
> not prevention, so OQ-250's reopening condition was met (first limb). **The target of zero, kept beside its replacement as
> falsified:** "0 `write_scope` refusals for a non-writer" — replaced by OQ-257's bound, at most one a run, each refused before any
> record and re-routed by the next request, which this run met. And the route the sentence prescribes lost what it handed on: the
> inherited block cut the architect's 28,330-character answer and the verifier's 20,195-character report to 4,000 characters each
> (V1). Both are revision 9's.

> **First execution of revision 5, 2026-10-07, ruled under [R-072](../requests.md#r-072) ([OQ-221](../../architecture/open-questions.md)),
> built by fin29:** built as written, and the text met the code in two places.
>
> - **The budget's measure.** The build measured the heading and each carried section, but joined the sections with one more
>   newline it did not count, so a block could pass its budget by one character per carried section after the first. The
>   separator is now counted, and a block that fits exactly is carried (`fullContextBlock`, `packages/engine/src/artifacts/context.ts`).
> - **The budget in the warning.** The engine owns the figure and `agent-tools` renders the warning, and neither imports the
>   other, so the outcome carries the budget beside the counts (`AttachmentOutcome.budget`) rather than a second copy of 100,000.
>
> The one selection is `selectAttachments` (`packages/engine/src/children/orchestration.ts`), read by the observation at
> acceptance and by the block at each assembly; the observation is `attachmentWarnings` (`packages/agent-tools/src/tools/delegation.ts`).
>
> **What was measured.** In `artifacts/artifacts.test.ts`: the constant is 100,000; [over, short] carries the short one;
> [short, over, short] carries both short ones in order; an exact fit is carried and one character more is left out; an
> unreadable document in the middle leaves the others. In `children/children.test.ts`, a child started at once: the observation's
> left-out ids and given count equal its `context_selection` entry's, and its first message carries exactly those sections. In
> `tools/delegation.test.ts`: the warning's four parts and the rendered observation. The ten new cases, and the existing block case whose budget wording changed, are red on the code before. In the
> built app, `pnpm artifacts-proof` launch 7 (`attached`): three artifacts of 55,000, 46,000 and 24 characters and a reference to
> nothing, attached in that order; the observation read "2 attached artifacts will be given to the child whole", named the
> 46,000-character artifact as left out for size with the 100,000-character budget and the reference as unresolved; the
> `context_selection` entry held `attached_included` 2 with the same id elided; the child's first message carried the
> 55,000-character body (left out under 48,000) and the short one after the elided one, a section of 56,099 characters; and
> `summary.md` read "Mostly-elided artifacts: 1". **What was not measured.** No live run attached artifacts; none of the four
> autopsied live runs did. The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).
>
> **Reported back 2026-10-13 (fin42, item N57):** a live scenario now asks for an attachment. The default live run's
> `delegation` launch has the orchestrator find a child's report artifact with `artifact_list` and attach it to a second child
> through `attach_artifacts`; the scenario checks that the observation's count given whole agrees with the child's
> `context_selection` entry, and notes a run whose model attached nothing or named an unresolved id. Its run is the
> orchestrator's; no live run has attached an artifact yet.

> **First execution of revision 6, 2026-10-07, ruled under [R-072](../requests.md#r-072) ([OQ-220](../../architecture/open-questions.md)),
> built by fin29:** built as written, and the text met the code in four places.
>
> - **Which delegations are implementation delegations.** The engine holds no copy of the registry's declarations, so the run
>   host injects `implementationRole` (`apps/desktop/src/run-host/tools.ts`): revision 4's `resolveAgentGrant` on the
>   catalogue's terms, a granted tool declaring "writes workspace files". `run-host/tools.test.ts` holds it equal to the
>   catalogue's facet for every known role and two callers. Where no host injects it, the engine's `writesFiles` stands in.
> - **Inheritance meets only the held check.** A continuation's inherited item is checked by the held-item refusal alone; a
>   COMPLETED inherited item, or one the plan no longer holds, is not refused, since the continued child named it and the
>   continuation finishes that work.
> - **One step's list and delegation.** A `todo` write and an unnamed implementation delegation in one step leave the
>   delegation refused, with the ids the list now holds named in its reason, as the ruling foresaw.
> - **The scripted coordinator.** The proofs' scripted `plan` step writes one COMPLETED item, which no implementation
>   delegation may name; the dialect gains `plan:<n>` (n open items), names each delegation's item in turn from the `todo`
>   result as a model would, and `done` completes the list. Four proofs whose coordinator delegates implementation after its
>   list were moved to it; `mcp-proof`'s children are restricted to reading, so its `plan` stays.
>
> **What was measured.** `children/todo-item.test.ts` (six cases) and thirteen end-to-end cases in `children/children.test.ts`:
> before any list an unnamed delegation is admitted; after it an unnamed one is refused naming the open items and a named one
> admitted and stored; a read-only role delegates unnamed; one step's list and delegation; an unknown id refused for any role;
> a COMPLETED or ABANDONED item refused to implementation and admitted read-only; a held item refused naming its holder, two
> items in parallel, the item freed once its holder ended; a read-only child never holds; a child waiting on its dependencies
> holds; a follow-up never refused as unnamed; a follow-up refused while another implementation child holds its stored item
> and admitted once that child ended (added by the review, which found no case reaching `followUp`'s check); a child's own
> plan; a continuation inheriting. Each refusal is red with its check removed. In the built app, `pnpm mission-proof` item 1e: a two-item list, `alpha` named the first item, `beta` naming
> it while alpha ran was refused "held by alpha (coding-agent, task_id …, state running)", `gamma` naming none was refused with
> both items listed, `delta` named the second and ran; the children's records held `565a0565` and `a4257486`, the session
> completed, and both refusals were logged citing REQ-ORCH-028 and REQ-ORCH-029. **What was not measured.** No live run: the
> next default and duress runs should show every root implementation child after the first `todo` write naming an item
> (`coordinator-todo.mjs`'s `todoItemReading`), no two holders of one item at once, a continuation carrying its predecessor's
> item, and the refusals counted (target at most one per run, each followed by a named delegation). The row is in
> [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **First execution of revision 7, 2026-10-13, ruled under [R-072](../requests.md#r-072) ([OQ-249](../../architecture/open-questions/53-spikes-and-later-questions-20.md#oq-249)),
> built by fin33 (`fin33-delegation-targets-and-plan`):** built as written, and the text met the code in two places.
>
> - **The mark is the run host's, made before a foreground wait.** The engine hands the admitted item back on the accepted
>   `DelegateOutcome` (`todoItem`: named, inherited, or a follow-up's stored item); `delegateTool` takes a `markItem` that
>   `createToolPort` builds over the port's own `TodoList` (`apps/desktop/src/run-host/tools.ts`), and calls it once the call is
>   admitted and before a `run_in_background: false` wait, so the plan reads the item active while the child runs. The ruling's
>   "wrap the delegate executor" would have marked only after that wait.
> - **`replace` cannot complete an active item.** REQ-TOOLS-146 restores an IN_PROGRESS task over a `replace`, so an item the
>   run marked is closed with `update`. The scripted coordinator's `done` step (`apps/desktop/src/run-host/scripted-client.ts`)
>   wrote one `replace` with every item COMPLETED; it now sends one `update` per open item, as a model must.
>   *Falsified as a rule for a served-and-ended item, 2026-10-13, by [OQ-255](../../architecture/open-questions/54-spikes-and-later-questions-21.md#oq-255)'s ruling
>   (`PD-TOOLS-008` revision 3, under [R-072](../requests.md#r-072)):* the reason held of the code as built, but no live model is
>   told it, and the restore it describes is the defect
>   [`a-todo-replace-cannot-close-a-delegated-item-and-hides-the-restore.md`](../../defects/fixed/a-todo-replace-cannot-close-a-delegated-item-and-hides-the-restore.md).
>   Since revision 3 a `replace` closes an item whose child has ended; an item a running child holds, and the agent's own
>   active item, are still closed with `update`, and the `replace` that kept them says so.
>
> **What was measured.** `run-host/tools.test.ts` ("PD-TOOLS-006 revision 7", four of its five cases red on the code before):
> a named PENDING item marked, persisted and kept by a later `replace` in the turn; IN_PROGRESS, COMPLETED and ABANDONED items
> untouched with nothing written; a rejected delegation marking nothing; a continuation marking its inherited item; two
> parallel delegations held with the coordinator's own item marked beside them. `tools/delegation.test.ts` pins the
> observation, the mark before the wait and the description's sentence; `children/children.test.ts` the item handed back
> (named, follow-up) and the live held set (both red before). In the built app, `pnpm mission-proof` item 1e (2026-10-13, load
> 3.3 to 4.2 on 4 CPUs): alpha's and delta's observations read "Todo item Scripted item 1 (…) is now IN_PROGRESS." and
> "…Scripted item 2 (…)…", delta's Todo state shows both items active while alpha still ran, the coordinator's three `todo`
> calls (the plan and two updates) were all `ok`, and the stored plan ends COMPLETED. **What was not measured.** No live run:
> the next default run's edit session should show each `delegate` observation reading "Todo item … is now IN_PROGRESS" and the
> Agent plan strip drawing both rows active while both children run; the duress run, a parallel child's item active while it
> runs (`#305` not recurring). The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **First execution of revision 9, 2026-10-13, ruled under [R-072](../requests.md#r-072) ([OQ-256](../../architecture/open-questions/55-spikes-and-later-questions-22.md#oq-256)
> and [OQ-257](../../architecture/open-questions/55-spikes-and-later-questions-22.md#oq-257)), built by fin38 (`fin38-edits-handoff-classifier`):** built as written, and
> the text met the code in three places.
>
> - **One figure, two packages.** The engine renders the blocks and `agent-tools` writes the description, and neither imports the
>   other; the outcome carries the budget for the warning as revision 5's does, but the description is written before any
>   delegation, so the figure is a `kernel` export (`HAND_OFF_BUDGET`, `packages/kernel/src/hand-off.ts`) both read.
> - **One rendering for the block and the warning.** `inheritedContext` and `priorAgentContextParts` (`packages/engine/src/children/notify.ts`)
>   return the block with the answers it cut, so `ChildLedger.spawn` stores the block and returns its cuts from one call
>   (`Spawned.inheritedCuts`), and `Orchestration.delegate`'s forecast for a completed dependency runs the prior-agent block's own
>   function over the rows as they stand; `DelegateOutcome.handOff` carries both to `handOffWarnings` (`agent-tools`).
> - **REQ-ORCH-047's fallback.** The prior-agent block fell back to the summary but never to the key findings, which clause 1 puts
>   before it; both blocks now read the same order. `reportBlock` and REQ-ORCH-060's cap still serve the resume message and the wait
>   results.
>
> The write-scope sentence is `WRITE_SCOPE_SENTENCE` and the field's description `WRITE_SCOPE_FIELD_SENTENCE` (`.describe()` on the
> zod field, which `z.toJSONSchema` carries into the offered schema); `HAND_OFF_SENTENCE` follows it. **What was measured.** In
> `children/notify.test.ts`: the budget is 100,000; a 28,330-character answer carried whole with no cut; 100,001 characters cut to
> 100,000 with the marker verbatim; two siblings across the budget, the second cut to the remainder, and the 4,000-character floor
> with a short third answer still whole; the fallback order; the prior-agent block under the same budget, floor and marker; the
> resume message still capped at 4,000. In `children/children.test.ts`, end to end: a 28,330-character architect answer reaches the
> writer whole through `inherited_context` with no warning; a 120,000-character one is cut, and the observation's cuts equal the
> stored block's; `depends_on` on a completed task forecasts the cut its prior-agent block then makes. In `tools/delegation.test.ts`:
> the write-scope sentence verbatim and the old one gone, the field's description in the offered schema, neither text naming a
> persona or alias of the vocabulary, the hand-off sentence after it, and the warning's two forms in the observation. In
> `scripts/lib/routing-misses.test.ts` the `552d346` shape (`#92` re-routed 30.0 s later, inside the bound) and the flags (not
> re-routed, no later delegate, a second refusal), and `scripts/lib/hand-off-cuts.test.ts` the marker count. Fourteen cases, each
> red on the code before. In the built app `pnpm mission-proof` passed (exit 0, load 0.7 to 1.5 on 4 CPUs): its scripted coordinator
> delegates with a `depends_on` chain and short answers, so it shows nothing regressed; it drives no answer over the budget and no
> write scope, so it does not discriminate. **What was not measured.** No live run: the next duress pack is the measure — 0
> hand-off markers for answers under 100,000 characters, no hunting calls for a missing answer, at most one write-scope refusal for
> a non-writer, re-routed by the next request. Repairs
> [`an-answer-handed-on-through-inherited-context-reaches-the-writer-cut-to-4000-characters`](../../defects/fixed/an-answer-handed-on-through-inherited-context-reaches-the-writer-cut-to-4000-characters.md)
> and [`the-routing-sentence-did-not-stop-a-write-scope-for-architect`](../../defects/fixed/the-routing-sentence-did-not-stop-a-write-scope-for-architect.md).
> The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **Reported back 2026-10-13 (fin41), from the live packs at `552d346` (default and duress) and `0bc3eee`** — revisions 5, 6, 7 and 9, whose
> blocks above say "No live run" and keep their words. Evidence:
> [`live-552d346-default-autopsy.md`](../../architecture/live-runs/live-552d346-default-autopsy.md),
> [`live-552d346-duress-autopsy.md`](../../architecture/live-runs/live-552d346-duress-autopsy.md),
> [`live-0bc3eee-default-autopsy.md`](../../architecture/live-runs/live-0bc3eee-default-autopsy.md).
>
> - **Revision 5 (attached artifacts): reached once, below the budget.** No default delegation attached an artifact (0 of 11
>   at `552d346`, 0 of 9 at `0bc3eee`). The duress coordinator attached one (`#247`, the verifier's report artifact
>   `art_t5eFGWLq`, to f2): the observation read "1 attached artifact will be given to the child whole" and the
>   `context_selection` entry `attached_included: 1` with nothing elided. Nothing came near the 100,000-character budget, so the
>   skip-and-continue path is still shown by `artifacts-proof` launch 7 alone.
> - **Revision 6 (a delegation names its item): PASS.** At `552d346` 9 children named their item and 1 delegation was refused
>   (requirements `#39`, a docs-writer naming none), re-routed by `add_task` (`#40`) and a named delegation (`#41`) about 11.9 s
>   later. In the duress pack the 6 implementation delegations after the list all named an item and none was refused for it;
>   at `0bc3eee` 8 of 8, none refused. That is within the target of at most one refusal a run, each followed by a named
>   delegation, and the harness found no two holders of one item at once in any pack.
> - **Revision 7 (admission marks the item IN_PROGRESS): PASS.** Every admission naming a PENDING item answered "Todo item … is
>   now IN_PROGRESS": 9 of 9 at `552d346`'s default pack (its autopsy wrote "10 of 10" over a list of nine), 6 of 6 in the
>   duress pack, 7 of 7 at `0bc3eee`. A delegation naming an item already IN_PROGRESS wrote no line, as built (duress `#247`,
>   `0bc3eee` requirements `#64`). Parallel delegations left two items (default) and three (duress, after `#17`) active at once
>   with no refusal, so `a68f121`'s `#305` did not recur. The Agent plan strip was not read.
> - **Revision 9: the sentences HELD at `0bc3eee`; the hand-off was NOT REACHED.** The write-scope sentence, the field's
>   description and the hand-off sentence were in 94 of 94 `delegate` offers; 8 write scopes went to writers only (7
>   coding-agent, 1 docs-writer); 0 write-scope refusals; 0 unknown-tool calls. No delegation used `depends_on` or
>   `inherited_context`, so the harness's "0 cut answers" does not discriminate. The duress pack named above as the measure is
>   still owed: no duress run has been made since `552d346`.
>
> The rows are in [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **Revision 9's duress execution, reported back 2026-10-15 (fin47, `fin47-delegation-routing`), ruled under
> [R-072](../requests.md#r-072) as [OQ-331](../../architecture/open-questions/63-spikes-and-later-questions-30.md#oq-331):** the duress run at `3c03287` (fin46's final
> acceptance, pack `2026-10-15T04-01-06-491Z`, session `2fe0a837`, finding F6) carried the write-scope sentence and the field's
> description in every delegating request and refused two write scopes for a non-writer: `#105` (`architect`, `docs/decisions.md`,
> refused in 7 ms before any record, re-routed 26.9 s later by `#126`, the architect without a scope, whose answer a docs-writer
> wrote at `#204`) and `#231` (`verifier`, `docs/verification.md`, refused in 17 ms, re-routed 15.9 s later to a `tester`, `#232`). No
> non-writer was briefed to write. The cost bullet's bound — *"at most one refusal a run, each re-routed by the next request"* — is
> falsified there and kept beside its replacement: **at most one refusal for each task of the run's request that routes to a persona
> writing no files (two in duress, zero elsewhere), each refused before any record and re-routed by the same agent's next `delegate`
> within 60 s, and no task refused twice.** The directive's case and behaviour are unchanged, so no revision is written; REQ-TOOLS-152
> and REQ-ORCH-028 keep their back-pointers as they stand. The live run's harness reads the new bound (`routingMissReading`'s
> `nonWriterFileTasks`, `apps/desktop/scripts/lib/routing-misses.mjs`; its NOTE "write-scope refusals over OQ-331's bound (reopens
> OQ-331)"), pinned by `lib/routing-misses.test.ts`, red on the code before. The row is in
> [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **First execution of revision 10, 2026-10-15, ruled under [R-072](../requests.md#r-072) ([OQ-334](../../architecture/open-questions/64-spikes-and-later-questions-31.md#oq-334)),
> built by fin47 (`fin47-delegation-routing`):** built as written, and the text met the code in two places.
>
> - **Where the store's presence reaches the description.** `delegate`'s description is written in `agent-tools`, which knows no
>   run; the run host already resolves the catalogue under the run's prerequisites, so `createToolPort` hands `delegateTool` the same
>   `artifactStore` (`DelegateToolOptions.artifactStore`), and the sentence and the word never disagree about the store.
> - **The fourth word sits beside the facets, not among them.** "Publishes artifacts" is no REQ-TOOLS-001 facet, so `grantFacets`
>   is unchanged and `catalogueWords` appends it; an entry whose grant only publishes reads "publishes artifacts" alone rather than
>   "none of these".
>
> The payload sentence is fixed and carries its own condition ("and you hold no tool that publishes artifacts"), so it is true under
> every grant and is rendered in every payload, the run's store being one the product always opens for a running session.
> **What was measured.** In `tools/delegation.test.ts`: `REPORT_ARTIFACT_SENTENCE` verbatim directly after `HAND_OFF_SENTENCE`, absent
> where no store is, naming no persona; the word on an entry holding `artifact_write`, not on the same entry without it. In
> `run-host/tools.test.ts`: a persona configured with `artifact_write` and `can_publish_artifacts: true` reads "publishes artifacts"
> under a store; without the flag, or without a store, it does not; no built-in entry does under the defaults. In
> `children/notify.test.ts` and `children/children.test.ts`: the payload sentence after the root line, ahead of the write scopes,
> attachments and task, in every payload. In `scripts/lib/routing-misses.test.ts`: the live run's two counts, both 1 over the
> `d0c3a7f0` shape. Each red on the code before, except the built-in guard, which the old code met trivially. **What was not
> measured.** No live run: the next default pack is the measure — the sentence in every delegating request, every child's first
> request carrying the payload sentence, 0 `artifact_write` calls by a child that does not hold it, 0 briefs asking a non-publisher
> to publish, and no `child_report` artifact claiming publishing failed. Repairs
> [`a-coordinator-briefs-a-codebase-analyst-to-publish-an-artifact-it-holds-no-tool-for`](../../defects/fixed/a-coordinator-briefs-a-codebase-analyst-to-publish-an-artifact-it-holds-no-tool-for.md).
> The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **First execution of revision 11 (the resume line, [OQ-333](../../architecture/open-questions/62-spikes-and-later-questions-29.md#oq-333)), 2026-10-15, ruled under
> [R-072](../requests.md#r-072), built by fin47 (`fin47-classifier-and-todo`):** built as written, and the text met the code in three
> places.
>
> - **Three messages resume a wait, not one.** The ruling named `resumeMessage`; a `wait_for_tasks` result and a foreground
>   `delegate`'s wait are `IterationChildren.waitForTasks`'s own text (both branches: "already complete" and "completed"), which
>   the live session that raised the question met (delegation-swarm `#14`). All three render their reports through
>   `reportBlockWithItem` (`packages/engine/src/children/notify.ts`), so they cannot disagree.
> - **The plan is read where admission reads it.** `openServedItemsOf` reads `todoPlanFor` — the root's coordinator plan or a
>   child's stored todo — beside REQ-ORCH-059's `openTodoFor`, and the ledger's held set; `openServedItems`
>   (`packages/engine/src/children/todo-item.ts`) picks the items. No port is added.
> - **An item two reported children serve.** The text names each such item once; it is named after the first reporting child
>   that serves it.
>
> **What was measured.** `children/children.test.ts` ("revision 11", three cases, each red on the code before): a
> `wait_for_tasks` result carrying the line after the report whose item is open and not after the one the coordinator closed; a
> foreground `delegate` result carrying it, and none while another running child holds the item; the orchestration pass's resume
> carrying it after the report, with the completion notification free of it and no later message naming the closed item.
> `notify.test.ts` and `todo-item.test.ts` pin the line's words, the empty case and the selection. **What was not measured.** No
> live run: the next default run's coordinating sessions should show each wait result that reports a child whose item is open
> carrying the line, and the coordinator closing those items. The harness counts the lines (`resumeLines`), the items still open
> at the answer (`openAtAnswer`) and the seconds to each close (`closeLatencies`), NOTEs in `lib/coordinator-todo.mjs`.
> The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).
