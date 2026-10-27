# Runtime view — a run from prompt to terminal result, and everything that reaches into it — 4. Children (ADR-0012) (continued)

Part 8 of 16 of [the runtime view](../03-runtime-view.md), which indexes every part.

**Which personas a delegation may name (OQ-228, OQ-229, ruled 2026-10-07 under R-072; fin33).** One list answers it:
`delegationTargetsFor(resolver, caller)` (`children/personas.ts`) — the resolver's `delegationTargets()` (every configured
persona but the three `NOT_DELEGATION_TARGETS` reserves, `@rotaris/contracts`; `knownRoles` until the ruling, unfiltered), or the
built-in table filtered the same way, narrowed to the caller's `Persona.delegatesTo` when its `delegates_to` names any. The
catalogue (`delegateCatalogue`, its aliases from `aliasesAmong`, and `narrowedBy` for the sentence a narrowed caller reads),
`ChildLedger.spawn` (`SpawnInput.callerPersona`), the write-scope refusal's writers (`fileWriters`) and
`IterationChildren.delegate` all read it. `delegate()` resolves the named persona through `resolveDelegationTarget` FIRST, after
the `session_id` branch and ahead of the plan gate, the write scope, the continuation check and OQ-220's todo-item checks: an
unknown name, a reserved persona (its purpose named) or a persona outside a non-empty list is refused `rejected` with no record,
each reason ending with REQ-ORCH-034's known personas and `<alias>-><target>` aliases. `resolveRole` and
`PersonaResolver.resolve` still answer every persona, so the classifier, the entry role, a parent's persona, resumes and
follow-ups are unaffected. `personaResolverFor` carries a non-empty `delegates_to` onto the persona and logs, once per run, an
entry naming a reserved persona, a list on a persona without `delegate`, a list leaving no target and a stated empty list.

**Continuations (PD-ORCH-004; `children/cut-off.ts`).** The pure half: `ProgressLog` (fed by the turn's
`onToolCompleted`, one per child execution), `cutOffReport` and `cutOffLines`, and `continuationRefusal`. A `delegate`
call may carry `continuation_of`, a task id. `IterationChildren.delegate` admits it before the spawn, beside the
write-scope refusal, and refuses it with no record when the named task is not the caller's own child (REQ-TOOLS-155's
ownership, the predicate `backgroundOutput` shares), when that child's stored report carries no offer — so a
continuation, which is never offered one, cannot be continued in turn — or when a child of the session already
records it as `continuation_of`. An admitted continuation is an ordinary child whose row carries `continuation_of`;
its payload is assembled as any child's is, with nothing of the timed-out child injected. Ownership is tested against
the current iteration's root task, so within that iteration only the agent that delegated the cut-off child takes its
offer up. **Revision 3, an offer outlives its run:** the root of a later iteration or a later run of the session takes
up an offer the session left before — the named child found in the store with a lower iteration number, at any depth,
or, for a resumed iteration, one of its own children that had ended before this run took it up (`endedInEarlierRun`,
fixed when `IterationChildren` is built) — and a child of that later iteration cannot (the refusal names both routes
to the root; a plan cycle's root takes up none, OQ-99). The field itself is not in REQ-TOOLS-152, which the directive
does not name: **OQ-66**. In the built app `continuation-proof` drives both later roots (since fin42): iteration 2's root, a queued prompt's,
told the offer in its first message (`offersForFirstMessage`), and a later run's root, told it in the handoff
(`buildContinuationPayload`); the scripted root takes an offer with `continue:<persona>:<name>` (`offeredTaskId` in
`run-host/scripted-client.ts`, which reads the conversation with `offersToldIn`).

**Follow-ups (PD-ORCH-005 clause 22, PD-TOOLS-006 revision 3, OQ-131; `children/orchestration.ts`).** A `delegate` call
may carry `session_id`, the task id of a settled child of the caller. `IterationChildren.delegate` hands such a call to
`followUp`, which creates no record.

`followUpRefusalFor` refuses, as `rejected` with no id:
- an id that is not the caller's own child's (REQ-TOOLS-155, as for `background_output`);
- a child that has not ended;
- a child its `child_timeout` cut off, which keeps `continuation_of`.

A child whose execution still winds down — one the user cancelled — is waited for first (`executionOf`).

Then:
1. The stored write scope is claimed again.
2. A call the record left open is answered as cut off (`answerOpenCalls`).
3. The writer's `followUpChild`, in one transaction, moves the child out of its terminal state to `queued` (the one
   such move, `isLegalFollowUp`), clears its completion time, report and observation (`reopenChild`), appends the
   call's `task` to its record as a user message, and writes `child.transition` and a `child_resumed` entry
   (`follow_up: true`). A child that never started gets its payload recorded first (`startingPayload`).
4. The scheduler starts it as any queued child: REQ-ORCH-050's cap and REQ-ORCH-046's active limit apply, and
   REQ-ORCH-048's cascade leaves a queued child whose record holds a conversation (`hasConversation`).
5. `execute`, finding a conversation in the record of a child it claimed, carries on from it (`resumedStart`) as a
   resumed agent does.
6. The child ends, reports and notifies its parent again. A rest before it starts pauses it `queued`, and the continue
   starts it from the record.

**Inherited context (REQ-TOOLS-152, REQ-TOOLS-154 item (5), REQ-ORCH-032; `children/ledger.ts`, `notify.ts`).** A
`delegate` call may carry `inherited_context`, task ids of siblings whose reports the child is to read without waiting on
them. `ChildLedger.spawn` resolves each after REQ-ORCH-046's dependency checks and before its cycle check. Existence is
asked of the session's child records and the root execution record, which shares their namespace (REQ-ORCH-072): an id no
task has refuses the call with no record and no id, reported as REQ-TOOLS-153's `rejected`; an id naming a task that exists
and has not completed — the root, the caller's own task, any task that failed, was cancelled, has not finished, or
succeeded without its report stored — is ignored; the caller's own children `succeeded` with a report stored are returned on
`Spawned.inherited`, once each in the caller's order; a completed task that is not the caller's own child is refused for
ownership, naming its parent as the `depends_on` refusal does, never as nonexistent (**OQ-81**). `ChildLedger.spawn` renders them at once
with `inheritedContext` — a heading saying the reports are context and not a dependency, then each sibling's canonical name, role
and status and its whole result text (final, else last, else key findings, else summary) under `PD-TOOLS-006` revision 9's
100,000-character hand-off budget (OQ-256; `HAND_OFF_BUDGET`, `kernel`): an answer that does not fit is cut to the larger of the
remainder and REQ-ORCH-060's 4,000 characters and ends in `handOffMarker`. Until revision 9 each sibling was REQ-ORCH-060's
`reportBlock`, its answer cut to 4,000 characters
(`docs/defects/fixed/an-answer-handed-on-through-inherited-context-reaches-the-writer-cut-to-4000-characters.md`). REQ-ORCH-047's
prior-agent-context block (`priorAgentContextParts`) shares the budget, floor and marker. The cuts travel back on
`Spawned.inheritedCuts`, and `Orchestration.delegate` adds a forecast for each `depends_on` task already complete (the block is
assembled when the child becomes ready); `DelegateOutcome.handOff` carries both, rendered beside the attachment warning by
`handOffWarnings` (`agent-tools`). `ChildLedger.spawn` stores the rendered text with the child (`children.inherited_context_block`,
**v28**), beside the call's `attach_artifacts` (`children.attach_artifacts`, v28). Until 2026-09-30 both were kept per task
id in memory for the life of the run, so a child PD-ORCH-005 resumed in a later run lost both at REQ-ORCH-088's retry
(`docs/defects/fixed/a-resumed-childs-retry-payload-loses-its-attachments-and-inherited-context.md`). `childPayload`'s sixth
argument places it as item (5), after the artifact blocks and immediately before the task; `execute` and `startingPayload`
read it from the row. A resumed child's retry also carries REQ-ORCH-047's prior-agent-context block again, rendered from its
dependencies' rows, as a retry within the first run does. The ids stay on `children.inherited_context` for the agent
surfaces (REQ-MONITOR-074); which of them counted is the rendered block, not recoverable from the ids, since a sibling
ignored as unfinished may complete later.

**The sibling-artifact index can be suppressed (REQ-TOOLS-152, REQ-TOOLS-154 item (3), REQ-CONFIG-107; repaired
2026-09-29 under R-067).** A `delegate` call carrying `suppress_auto_context: true` forwards it as
`DelegateRequest.suppressAutoContext`; `ChildLedger.spawn` stores it on the child (`children.suppress_auto_context`, v25).
`IterationChildren.artifactContext` omits REQ-LIBRARY-097's `PRIOR SIBLING ARTIFACT INDEX` when the row carries it or the
child's role has `skip_auto_sibling_context` (the run host's persona resolver maps it to `Persona.skipAutoSiblingContext`),
and keeps the attached artifacts, which the caller named; the `context_selection` diagnostic records
`sibling_index_suppressed`. Because the flag is on the row, REQ-ORCH-088's retry and a resumed child's retry omit it too;
the attached references are read from the row (`children.attach_artifacts`, v28) on the same terms.

**The attached artifacts: one selection, 100,000 characters (REQ-TOOLS-152, REQ-TOOLS-153, REQ-LIBRARY-098 as `PD-TOOLS-006`
revision 5 narrows them; OQ-221 ruled 2026-10-07 under R-072; fin29).** `selectAttachments` (`children/orchestration.ts`)
resolves each reference, reads each body and applies `fullContextBlock` (`artifacts/context.ts`): the caller's order, each body
whole or not at all, an overflowing one left out and every later one still tried, within `FULL_CONTEXT_BUDGET` (100,000; 48,000
until this revision) measured over the heading and the carried sections with their separators. `IterationChildren.delegate`
calls it at acceptance (`resolveAttachments`) and returns `AttachmentOutcome` — `given`, `elidedForSize`, `unresolved`,
`unreadable`, `budget` — which `delegate`'s observation renders (`attachmentWarnings`, `agent-tools/tools/delegation.ts`);
`artifactContext` calls it again at each payload assembly and writes the `context_selection` entry (`attached_included`,
`attached_elided`, `attached_unresolved`) from the same result. For a child started at once the two readings name the same
ids; for one assembled later (held for a slot, waiting on dependencies, resumed) the observation is a forecast and the entry is
the record.

**A delegation names the todo item it serves (REQ-ORCH-028, REQ-ORCH-029 as `PD-TOOLS-006` revision 6 builds them; OQ-220
ruled 2026-10-07 under R-072; fin29).** `delegate`'s `todo_item` reaches `IterationChildren.delegate` as
`DelegateRequest.todoItem`; after the continuation check and before `ChildLedger.spawn`, `admitTodoItem`
(`children/todo-item.ts`) reads the caller's own plan through `ChildrenDeps.todoPlanFor` — `Run.todoPlanFor`: the root's
`coordinatorPlan()` with OQ-213's `listWritten` for the current execution task, or a child's stored todo — and refuses with
status `rejected` and no record an id the plan does not hold (any delegation), and, for an implementation delegation, a
COMPLETED or ABANDONED item, an item a non-terminal implementation child of the same plan holds (`holderOf`, every root's
children one plan as `owns` reads them), or no item once `listWritten` is set. Which delegations are implementation
delegations is `ChildrenDeps.implementationRole`, injected from `SessionsDeps.implementationRole` by the run host
(`implementationRole`, `run-host/tools.ts`: `resolveAgentGrant` on the catalogue's terms, a granted tool the registry declares
writing workspace files), the engine's `writesFiles` standing in where none is injected. The admitted item is stored on the
child (`children.todo_item`, **v34**); a continuation naming none inherits its predecessor's and meets only the held check, and
`followUp` keeps the stored item and refuses only while another implementation child holds it. Each refusal is a warning
citing REQ-ORCH-028 or REQ-ORCH-029.

**A running delegation's item is held, and marked at admission (`PD-TOOLS-008` revision 2, `PD-TOOLS-006` revision 7; OQ-249
ruled 2026-10-07 under R-072; fin33).** An accepted `DelegateOutcome` (and a follow-up's) carries `todoItem`, the item the
admission resolved — named, inherited or kept. The run host's `delegateTool` is built with `markItem` (`createToolPort`'s
`markDelegatedItem`): it sets that item IN_PROGRESS on the port's own `TodoList` when it is PENDING, persists it through
`ctx.writeTodo`, and the observation gains "Todo item <name> (<id>) is now IN_PROGRESS." and the Todo state — before a
`run_in_background: false` wait. The `todo` tool reads `ctx.heldTodoItems` at each call (`TodoToolOptions.held`), which both
`toolsFor` closures fill from `Run.heldTodoItems` → `IterationChildren.heldTodoItems`: the `todo_item` of every non-terminal
child the caller owns, of any persona. REQ-TOOLS-145's bound and REQ-TOOLS-146's protection count only tasks outside that
set, and are checked only on a write that marks a task IN_PROGRESS; an item whose child has ended counts again at the next such
write *(until 2026-10-15: since `PD-TOOLS-008` revision 4 the count reads the served set, below)*. `PD-TOOLS-008`'s sentence gains
a hint for an agent whose resolved set holds `delegate`.

**A `replace` gives the ids (REQ-TOOLS-144; fin47, acceptance finding A6).** Before anything in `replace` reads an id,
`resolveIds` resolves each incoming phase's and task's: kept when the list holds it and no earlier entry of the call took it,
otherwise a generated eight-hex id unique in the list, the entry then being a new phase or task. Every read below — protection,
`closes`, `newlyMarked`, `activeProtected`, `actives`, the held and served exemptions — sees the resolved id, and the success
sentence names each replacement ("New ids replace the ones sent for <name> (<id>) as '<sent>', …; target them by these.") before
any "Kept as they were". Until 2026-10-15 a task matching no protected one was stored under `t.id ?? hexId()`, so the model's own
id (`impl101`) was kept and two tasks sent with one were stored under it. A delegated item the list no longer holds — removed by
`remove_task`, which protects no held item, or set back to PENDING and left out of a `replace` — is sent back under its old id
as a new task under a new id, so the `todo_item` its child stored no longer names an item of the plan.

**A `replace` closes a delegated item once its child has ended (`PD-TOOLS-008` revision 3; OQ-255 ruled 2026-10-13 under R-072;
fin37).** Beside the held set the `todo` tool reads `ctx.servedTodoItems` at each call (`TodoToolOptions.served`), which both
`toolsFor` closures fill from `Run.servedTodoItems` → `IterationChildren.servedTodoItems`: the `todo_item` of every child the
caller owns, terminal ones included. In `replace`, a protected IN_PROGRESS task that is served and not held takes the COMPLETED
or ABANDONED the list sends (`closes`), and is then not the `activeProtected` task that rejects a mark in the same list; every
other protected task is restored as REQ-TOOLS-146 states. Each restored task the list sent in a different state is named, in
list order, after the success sentence ("Kept as they were: <name> (<id>) <STATE>, <reason>; … Change a task's state with
update.") with `keptReason`'s four reasons; a task sent with no state, and an omitted one, are not named.

**A served item is outside the single-active count, and the resume names one still open (`PD-TOOLS-008` revision 4, `PD-TOOLS-006`
revision 11; OQ-333 ruled 2026-10-15 under R-072; fin47).** The `todo` tool's single-active reads — `TodoList.active`, `add_task`'s
and `update`'s checks, and in `replace` `newlyMarked`, `activeProtected` and `actives` — exempt the served set with the held set
inside it (`exemptNow`), so an item the run marked on delegation never refuses the coordinator's next mark, before or after its
child ends; the held set alone still decides `closes` and `keptReason`. The run never closes the item. Every message that resumes a
wait renders its reports through `reportBlockWithItem` (`children/notify.ts`): `resumeMessage` for the orchestration pass's resume,
and `IterationChildren.waitForTasks`'s text for `wait_for_tasks` and a foreground `delegate`. After a reported child's result it adds
"Todo item <name> (<id>) is still IN_PROGRESS: close it with update once you accept this report." where `openServedItems`
(`children/todo-item.ts`) finds the child's `todo_item` IN_PROGRESS in the caller's plan — read through the same `todoPlanFor` a
delegation is admitted against — and held by none of the caller's non-terminal children (`heldTodoItems`); an item two reported
children serve is named once. REQ-ORCH-059's completion notification is unchanged. The served set is the iteration's ledger, so after
a REQ-ORCH-075 re-queue or a resume an earlier iteration's item counts again (fin38's limit, now on the count too).

**The record the agent surfaces read (Part R; REQ-MONITOR-044).** Each child's `AgentRecord` carries, beside what Part B
projected, `reasoning` (the persona's configured level, `medium` when none), `contextUsed` (the input count of its latest
model step) and `contextLimit` — **from Part AH the model's own `max_input_tokens`** where the configuration states one
(`contextLimitsOf` → `contextLimitFor`), REQ-MONITOR-080's default otherwise; Part R declared that lookup and recorded it
unfilled, and REQ-MONITOR-078's capacity ladder needed the same figure. The lookup is by `children.model_key`, which is
**the `models:` key of the model the child runs on** (`childModelKey`: the role's `Persona.modelKey`, a synthetic copy
mapped to the key the loader recorded it was copied from (`LoadedConfiguration.syntheticOrigins`, `syntheticOriginOf`), else the run's `RunConfig.modelKey`, the model id only where no configuration names a key) — the
same key `modelCapFor` reads `max_parallel` under (REQ-CONFIG-094, REQ-MONITOR-020); it was the bare model id until
live-run finding D5, so neither lookup ever matched a qualified key (repaired 2026-09-29 under R-067) — plus **`compressions`** (REQ-MONITOR-281, Part AH),
`grantedTools` (from `children.granted_tools`) with `grantRecorded` (whether a grant was recorded: `granted_mcp` carries
`recorded: true`, or — for a row written before that marker — the native list is non-empty; only where none was do the
persona's declared tools stand in on the surface, REQ-MONITOR-049/060, so a grant REQ-TOOLS-006's controls left empty of
native tools is drawn as none; 2026-10-01), `calledTools` and `activeTools` (kept incrementally by the writer's
`AgentActivity` at `tool.start`/`tool.finish`, seeded once from the ring on load — never recomputed over the transcript,
REQ-MONITOR-038), `delegationSessionId` (null: every child runs in the run's session) and `inheritedContext` — and, since
PD-CONFIG-003 revision 3 (OQ-234, 2026-10-07), **`timedOut`**: for a child presented `failed` whose stored report carries
REQ-ORCH-088's `timeout` error, the limit it names in seconds and whether the report carries PD-ORCH-004's cut-off statement
(`timedOutOf`, the parser beside the one formatter `childTimedOutMessage` that the settle writes the error through), else
null; the tree and Mission-table rows draw a `tag-fail` "timed out" after the state, and the inspector (under its meta line)
and the persona window's instance tab (under its state) the line `timeoutLine` words once, naming Settings › Runtime ›
Per-agent timeout by the labels Settings renders. The projection
owner publishes the record after a commit carrying `child.spawn`, `child.transition`, `tool.start` or `tool.finish`, not
only after a save (the twenty-eighth defect, ADR-0043 note), coalesced to one publication per 80 ms tick on the clock port. A non-terminal child of a session whose status is neither
live nor `idle` is presented settled to the run's outcome by the projection (REQ-MONITOR-211/213), though REQ-ORCH-053's
sweep on open settles the row first in this build's routes — **except a `paused` child** (PD-ORCH-005 clause 13), which is
presented `paused` with its `interruption`, the record's one PD-ORCH-005 field, as is an agent `crashLeftOf` names (OQ-100).
The run-level agent the surfaces synthesise (`runLevelAgent`) presents `paused` too while its session rests with an
iteration open — `paused`, `interrupted`, or in REQ-CHAT-008's recovery state, which its caller passes — since the root
resumes with its agents (clause 19). In the recovery state with nothing to resume — a crash between iterations, or an
explicit cancel accepted and never carried out (OQ-103) — it presents `cancelled` and not live, as the repair's
`interrupted` will leave it, so no surface draws a dead run live or offers it Steer or Cancel.
