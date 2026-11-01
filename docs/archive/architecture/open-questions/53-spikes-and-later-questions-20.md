# Archived open questions — Spikes, and the questions raised since (20 of 35)

The ruled, closed, resolved and withdrawn entries of [part 53](../../../architecture/open-questions/53-spikes-and-later-questions-20.md) of the [open-questions record](../../../architecture/open-questions.md), each moved here whole, under its own anchor, by `pnpm archive:migrate` (`tools/archive/migrate.mjs`); the part keeps one index line for each. Only the script writes here ([the archive](../../../README.md#the-archive)).

<a id="oq-248"></a>

**OQ-248 — Is the hand-over endpoint a launch opens before it loses the claim a write REQ-STARTUP-164 forbids?** *(REQ-STARTUP-164,
"a launch SHALL write nothing but the record itself while resolving it"; REQ-STARTUP-161, REQ-STARTUP-162; ADR-0055, "The
endpoint is listening before the record is written, not after" and "A launch that is handed over writes nothing";
`packages/platform/src/instance.ts`, `claimInstance`'s `attempt`, `openEndpoint`, `closeEndpoint`, `socketDirectoryFor`. Raised
2026-10-13 by fin34's review of the repair of `docs/defects/fixed/the-instance-record-is-written-before-its-endpoint-listens.md`,
with fin30's optional finding #13 folded in. Raised as OQ-241 and renumbered OQ-248 at the landing, after OQ-247.)*

ADR-0055 decides two things that the code, once it keeps both, shows cannot both hold on a platform whose endpoint is a file.
The endpoint listens before the record naming it is written, so a second launch never reads a record naming an address that
is not yet accepting; and a launch that is handed over writes nothing, "structural rather than a discipline", because "an
exclusive create that fails writes nothing". Since fin34 every claim attempt opens its endpoint first, so on Linux and macOS a
launch that then loses the exclusive create has created a unix socket in the socket directory (and, on the fallback path,
the private `rotaris-<uid>` directory below the temporary directory, as it already did before fin34) and removes the socket
again before it hands over. On Windows the endpoint is a named pipe and nothing is written to disk. REQ-STARTUP-164 says a
launch SHALL write nothing but the record itself while resolving it; REQ-STARTUP-162 that a handed-over launch writes nothing
to any per-user or per-workspace state.

**What the build proceeds under.** ADR-0055's order: the endpoint first, the socket of a launch that loses the claim closed
and unlinked before it hands over (`closeEndpoint`), so nothing it created outlives it and nothing it wrote is per-user or
per-workspace state the product reads. **What a ruling decides.** Whether a transient endpoint, created and removed within the
resolution, is "a write" in REQ-STARTUP-164's sense — and if it is, which of ADR-0055's two decisions gives way: the endpoint
opened only after the record is won (the order fin30 had, with the double-instance window the repaired note describes), or a
form of endpoint that is no file (Linux's abstract socket namespace; nothing equivalent on macOS), or the record's own write
taken to include the endpoint it names.

**Ruled 2026-10-13 under the owner's delegation ([R-072](../../../product/requests.md#r-072)):** the record is the file and the
endpoint it names, together with anything a claim attempt creates to hold that endpoint; all of these are "the record itself" in
REQ-STARTUP-164, because REQ-STARTUP-161 makes "how a launch reaches it" part of what the record is and leaves its form to the
implementation. ADR-0055's order stands: the endpoint listens first, then the record is written. A launch that is handed over
**leaves nothing behind**: whatever its attempt created for the endpoint — on the temporary-directory fallback a per-attempt
private directory, which replaces the shared `rotaris-<uid>` one — is removed before it ends. A reclaim removes the stale
endpoint of a dead recorded process along with the record file. No directive: no requirement is contradicted, so the
specification keeps its text; the ruling is recorded here and in ADR-0055. On Windows (the released platform, `PD-STARTUP-001`)
the endpoint is a named pipe and nothing touches disk.
*Measured 2026-10-21 (the Windows ARM64 session's C6): on Windows a handed-over launch left nothing — the profile unchanged but for the instance's log, its pipe closed, the directory holding only `instance.json` — and a holder ended with `TerminateProcess` left no pipe for the reclaim to remove (`instance-order.test.ts`'s win32 cases; ADR-0055, "The claim over a named pipe, measured").*

**The two recommendations weighed.** *Advocate A (the user's lens)*: confirm as built, reading the endpoint as the record's own
write; record it in ADR-0055 and the sequence view; repair the open denial note with a per-attempt `mkdtemp` directory removed
with the socket, which this reading covers. *Advocate B (the system's lens)*: confirm and amend the record only, restating
ADR-0055's second decision as "a launch that is handed over leaves nothing behind"; treat `rotaris-<uid>` as a standing runtime
location; flag that crash-orphaned sockets build up. **The ruling followed both**: from both the reading anchored in
REQ-STARTUP-161 and ADR-0055's order (reversing it reopens the double-instance window fin34 repaired; Linux's abstract namespace
gives every local user an unguarded hand-over channel and has no macOS equivalent); B's "leaves nothing behind"; from A the
per-attempt directory, since `socketDirectoryFor` creates `rotaris-<uid>` before the claim, so a handed-over launch could leave
it behind — B's "standing runtime location" is the weaker reading, and the per-attempt directory makes the rule literally true
and closes the denial note; and B's risk 2 followed to its end: if the endpoint belongs to the record, reclaiming the record
removes the endpoint too. **Rejected:** the endpoint opened after the record is won; the abstract socket namespace; deferring.
**Costs kept on record:** the reading takes "the record itself" broadly, anchored in REQ-STARTUP-161's own words; an instance
that crashes leaves its endpoint until the next reclaim removes it; a launch killed between its `mkdtemp` (or its `listen`)
and its `closeEndpoint` while it is losing the claim leaves its private directory (and socket), which no record names, so no
reclaim removes it; a reclaim leaves the endpoint of a recorded process that is running but unresponsive, whose own closer
removes it. Settles
[`another-local-user-can-deny-the-instance-sockets-temporary-fallback`](../../../defects/fixed/another-local-user-can-deny-the-instance-sockets-temporary-fallback.md),
[`a-handed-over-launch-can-leave-the-private-socket-directory-behind`](../../../defects/fixed/a-handed-over-launch-can-leave-the-private-socket-directory-behind.md)
and [`a-reclaim-leaves-the-dead-instances-socket-behind`](../../../defects/fixed/a-reclaim-leaves-the-dead-instances-socket-behind.md)
once built.
**Built 2026-10-13 (fin36):** `placeSocket`, `removeOwnDirectory` and `removeDeadEndpoint` in
`packages/platform/src/instance.ts`, `closeEndpoint` shared by the closers; pinned by cases in `instance.test.ts` and
`instance-order.test.ts`, red on the code before, and `pnpm workspace-proof`'s scenario 13b (63 passed; the unrepaired build
failed its new checks). The report-back is in place in ADR-0055.

<a id="oq-249"></a>

**OQ-249 — Does REQ-TOOLS-145's single active task bound a coordinator's parallel delegations?** *(REQ-TOOLS-145, "at most one
task may be `IN_PROGRESS` at a time"; REQ-TOOLS-146, `replace`'s protection of the active task; `PD-TOOLS-008` revision 1,
"Everything else REQ-TOOLS-145 fixes still governs: at most one task is IN_PROGRESS"; REQ-TOOLS-147, the Agent plan as the
run's primary progress display; REQ-ORCH-029, a list the coordinator "keeps current"; REQ-ORCH-028 with `PD-TOOLS-006`
revision 6's `todo_item`; REQ-CHAT-086, IN_PROGRESS drawn active and PENDING open. Raised 2026-10-07 from the final live runs:
finding P3 of the default autopsy at `a68f121` and its recurrence D7 in the duress autopsy, recorded in
[`a-parallel-delegations-todo-item-cannot-be-marked-in-progress.md`](../../../defects/fixed/a-parallel-delegations-todo-item-cannot-be-marked-in-progress.md);
the consortium's question P3. The round assigned it OQ-227, which fin30 took on main for `single_file_change` (PD-ORCH-011
revision 2) before this landed; raised as OQ-240 and renumbered OQ-249 before the landing, since origin/main moved to OQ-248
past a block (OQ-240 to OQ-244) another plan may still hold, so it takes the next free number after main's highest.
**Ruled 2026-10-07.**)*

A coordinator running two delegated children at once cannot record both items as in progress. In the default live run at
`a68f121` (session `52aea43a`, the `edit` scenario) its plan `#5` marked both parallel children's items `IN_PROGRESS` and was
refused in `PD-TOOLS-008`'s sentence, which left `#7`, the same step's second `delegate`, refused by OQ-213; after the retry
`#14` tried to mark the running tests child's item `IN_PROGRESS` and was refused in REQ-TOOLS-145's sentence, which advised
marking the running implementer's item COMPLETED or ABANDONED. While both children ran the plan recorded the tests item
`PENDING`: 2 refused `todo` calls, 1 refused `delegate`, 2 extra coordinator steps, about 19.5 s on the critical path. The
duress run at `a68f121` (session `e6747bd0`) repeated it for the whole run: `#19` refused a plan marking three items, `#20` and
`#42` kept wave 1's items `PENDING` while their children ran, and `#113`, `#246` and `#404` moved wave 2's and wave 3's items
from `PENDING` straight to `COMPLETED`; the strip drew running work as open for about 67 of 69 minutes. The duress run at
`c2fdd6a` showed the same (`#305`, e's item never marked active while e ran). OQ-163, which kept the single-active rule
(`PD-TOOLS-008`), was a direct-work plan with no delegation.

**Ruled 2026-10-07 under the owner's delegation ([R-072](../../../product/requests.md#r-072)):** REQ-TOOLS-145's single-active rule
bounds the tasks an agent works on itself. A task held as `todo_item` (`PD-TOOLS-006` revision 6) by a non-terminal child of the
list's owner is outside the count, and the bound is checked only on a write that marks a task IN_PROGRESS. An admitted delegation
whose item is PENDING in the caller's plan marks it IN_PROGRESS. The product's texts tell a delegating agent to plan work items,
keep its own item IN_PROGRESS, leave the items it will delegate PENDING and name each in `todo_item`. Recorded as
[`PD-TOOLS-008`](../../../product/directives/pd-tools-008.md#pd-tools-008) **revision 2** (it narrows REQ-TOOLS-145 and now REQ-TOOLS-146) and
[`PD-TOOLS-006`](../../../product/directives/pd-tools-006.md#pd-tools-006) **revision 7** (the marking, within its existing dispositions). No
directive touches REQ-ORCH-029, REQ-CHAT-086 or REQ-CHAT-088: IN_PROGRESS still maps to active.

The two recommendations weighed, and the ruling followed **A**, with corrections from B:
- **Advocate A (the user's lens)** recommended exempting from the count the items the agent's own live children serve through
  `todo_item`, marking a named PENDING item IN_PROGRESS when its delegation is admitted, and teaching the coordinator to leave
  the items it will delegate PENDING; recorded as `PD-TOOLS-008` revision 2 with one clause in `PD-TOOLS-006`. The ruling
  followed A's mechanism and its record. Under it the run marks the item at admission, so no extra `update` call is made, and
  the Agent plan shows active work on a coordinating run, the serial case included.
- **Advocate B (the system's lens)** recommended keeping REQ-TOOLS-145 as `PD-TOOLS-008` left it, with no directive: the
  coordinator's IN_PROGRESS marks only its own item, a delegated item's progress is its holder's record, and the texts teach
  leaving an item a child works on PENDING until the child reports. The ruling did not follow B's texts: they would leave the
  primary progress display never showing active work on a coordinating run, and they rest on reading the child ledger as the
  plan's state, a reading B itself expected to be challenged. From B it took three things: the count is checked against the
  write that marks a task, so an item whose child has ended never fails a write that marks nothing; a plan written with two
  IN_PROGRESS items before any delegation is still refused, and the text handles it; and a harness finding for an item closed
  while its holder runs.

Both advocates, and OQ-220, rejected planning delegation steps instead of work items: it records a "Delegate X" item COMPLETED
while its child still runs, and turns REQ-ORCH-028's per-item ownership and REQ-ORCH-030's per-item attempt count into counts of
coordinator calls.

**What a live run then shows.** In the edit scenario the coordinator writes its plan, then delegates both children in the next
step naming their items; each `delegate` observation reads "Todo item … is now IN_PROGRESS" and carries the Todo state; while
both children run the Agent plan strip shows both rows active, each turning done when the coordinator closes it; after the plan
write there is no REQ-TOOLS-145 or `PD-TOOLS-008` refusal and no refused `update` like `#14`. In duress a parallel child's
item, such as e's, reads active while that child runs, so `#305` does not recur. The harness counts items recorded PENDING
while held (target 0), items marked COMPLETED while held (target 0) and single-active refusals in coordinating sessions (target
0, each counted as a NOTE). A plan written with two IN_PROGRESS items before any delegation is still refused once, in
`PD-TOOLS-008`'s sentence with its new hint; a model that re-marks an item the run already marked meets REQ-TOOLS-147's no-op
error, one cheap row.

*Built 2026-10-13 (fin33, `fin33-delegation-targets-and-plan`); its first executions are reported in `PD-TOOLS-008` revision 2
and `PD-TOOLS-006` revision 7.* `todoTool`'s `TodoToolOptions` (`held`, `delegates`) and `TodoList.active(held)`
(`packages/agent-tools/src/tools/todo.ts`); `delegateTool`'s `markItem` and `TODO_ITEM_MARK_SENTENCE`
(`packages/agent-tools/src/tools/delegation.ts`); `markDelegatedItem` and the lazily read `delegates` in `createToolPort`
(`apps/desktop/src/run-host/tools.ts`); `DelegateOutcome.todoItem`, `IterationChildren.heldTodoItems`, `Run.heldTodoItems` and
`ToolPortContext.heldTodoItems` (`packages/engine`); `TODO_LIST_OWED_TEXT` (OQ-213's entry quotes the text it replaced); the
scripted `done` step closing each item with `update`; the live run's `heldItemReading`
(`apps/desktop/scripts/lib/coordinator-todo.mjs`). Shown in the built app by `pnpm mission-proof` item 1e. The note is repaired:
[`a-parallel-delegations-todo-item-cannot-be-marked-in-progress.md`](../../../defects/fixed/a-parallel-delegations-todo-item-cannot-be-marked-in-progress.md).

*Revised 2026-10-15 by [OQ-333](62-spikes-and-later-questions-29.md#oq-333)'s ruling (R-072), the bound above kept as it was ruled:* the count leaves out every task
a child of the list's owner **serves** as its `todo_item`, terminal children included, not only the held ones, so an item whose
child has ended no longer counts against the next write that marks a task. The single-active refusals the harness counts in
coordinating sessions (target 0) were one a default pack at `3c03287` and the two packs before it (delegation-swarm `#26`,
requirements `#50`, crlf `#22`). Recorded as `PD-TOOLS-008` revision 4, with `PD-TOOLS-006` revision 11's resume line.

<a id="oq-228"></a>

**OQ-228 — Which personas may a delegation name?** *(REQ-MCP-014, `intent-classifier` and `project-initializer` "are personas
that are not delegation targets"; REQ-ORCH-126, `gatekeeper` "never as an ordinary delegation target"; REQ-ORCH-028, the
delegation vocabulary; REQ-ORCH-034, the unknown-role rejection "listing the known role names and the supported aliases rendered
as `<alias>-><target>`"; REQ-ORCH-038, an unknown role rejected with no spawn; `PD-TOOLS-006` revision 4, "every persona that
agent can delegate to". Raised 2026-10-07 from the final live runs: finding P5 of the default autopsy at `a68f121` (pack
`2026-10-07T06-48-50-123Z`, all ten sessions; 71 of 71 coordinator requests), recorded in
[`delegate-offers-and-admits-personas-that-are-not-delegation-targets.md`](../../../defects/fixed/delegate-offers-and-admits-personas-that-are-not-delegation-targets.md);
the consortium's question P5, numbered OQ-228 as the round assigned. **Ruled 2026-10-07.**)*

`delegate`'s catalogue lists every persona the configuration holds: in the default live run at `a68f121` every coordinator
request offered "intent-classifier (none of these: it neither reads nor writes workspace files nor runs commands)", and the
built-in table's `gatekeeper` among the research and decision roles. The ledger resolves through the same resolver, so a
delegation to either would be admitted, and a child of `intent-classifier` would run with an empty prompt and no tools. No
coordinator tried. The specification keeps three personas out of delegation; the build read `PD-TOOLS-006` revision 4's "every
persona that agent can delegate to" as every `personas:` key.

**Ruled 2026-10-07 under the owner's delegation ([R-072](../../../product/requests.md#r-072)):** `intent-classifier` is not
delegable, and neither are the other two personas the specification reserves, `project-initializer` (REQ-MCP-014) and
`gatekeeper` (REQ-ORCH-126), whether built in or configured under those names. One predicate, the **delegation targets**, decides
what `delegate`'s catalogue lists, what admission and the ledger accept, and which personas the unknown-role rejection and the
write-scope refusal name; a delegation to a reserved persona is refused `rejected` before any other admission check, with no
record and no task id, by REQ-ORCH-034's unknown-role message carrying the targets, the aliases as `<alias>-><target>` and what
the product runs that persona for. Every other persona the configuration holds, a user-defined one included, stays delegable,
listed with its facets and accepted, as built. This is **covered work** under REQ-MCP-014, REQ-ORCH-126, REQ-ORCH-034 and
REQ-ORCH-038; no directive. It records one reading: REQ-ORCH-034's "known role names" are the delegation targets. It corrects the
reading revision 4's first execution built (every `knownRoles()` entry, with `gatekeeper` among the research and decision
roles), which stays beside its replacement in `PD-TOOLS-006`'s revision 4 report; OQ-216's ruling text stands.

The two recommendations weighed, and the ruling followed **both**:
- **Advocate A (the user's lens)** recommended that the three reserved personas be left out of the catalogue and refused with
  REQ-ORCH-038's unknown-role rejection and a reason that says why, through one shared predicate, user-defined personas staying
  delegable. The ruling took A's reason that names what the product runs the persona for.
- **Advocate B (the system's lens)** recommended the same predicate read by every reader — the catalogue, the ledger's
  admission, the rejection text and the write-scope writers list. The ruling took B's rename of `knownRoles` to
  `delegationTargets()`, so no reader can reach the unfiltered list, and the aliases REQ-ORCH-034 requires in the rejection,
  which the resolver path dropped.

Both showed that a catalogue-only fix would leave the ledger's rejection advertising the names and `fileWriters` able to list one,
so the description could disagree with admission, the rule OQ-216 and OQ-220 secured. The ruling adds an order neither stated:
this refusal comes first in `delegate()`'s admission, so OQ-220's todo-item refusals never answer a delegation that cannot happen.
Whether `delegates_to` narrows which personas a caller may name is set aside as its own question, OQ-229: read as an
allow-list, its empty default would forbid every delegation.

**What a live run then shows.** Every coordinator request's `delegate` description lists twelve personas under the default
configuration, `orchestrator` and the eleven specialists, each with its facets, and the two aliases; `intent-classifier` and
`gatekeeper` appear in none (about 20 to 40 tokens saved per delegating request). No child of either is recorded. A coordinator
that names one sees one `rejected` observation saying the product runs that persona itself and listing the targets and aliases,
with no child row.

*Built 2026-10-13 (fin33, `fin33-delegation-targets-and-plan`); reported in `PD-TOOLS-006`'s revision 4 first execution.*
`NOT_DELEGATION_TARGETS` and `isDelegationTarget` (`packages/contracts/src/roles.ts`); `PersonaResolver.delegationTargets`
(renamed from `knownRoles`), `delegationTargetsFor`, `aliasesAmong` and `resolveDelegationTarget`
(`packages/engine/src/children/personas.ts`), read by `ChildLedger.spawn`, `IterationChildren.delegate` (first, before every other
admission check), `fileWriters` and the run host's `delegateCatalogue`; `personaResolverFor`'s targets
(`apps/desktop/src/run-host/configuration.ts`). Pinned by `contracts.test.ts`, `children/children.test.ts` ("OQ-228 / OQ-229",
each "(red)" case red on the code before), `run-host/tools.test.ts` (the catalogue under the default configuration and under one
overriding `intent-classifier`) and `tools/delegation.test.ts` (`gatekeeper` no longer among the research and decision roles). The
note is repaired.

**Reported back 2026-10-13 (fin41), from the live packs at `552d346` (default and duress) and `0bc3eee`:** held. `intent-classifier`
appeared in 0 of 64 `delegate` descriptions at `552d346`'s default pack (71 of 71 at `a68f121`), 0 of 41 in its duress pack and
0 of 94 at `0bc3eee`, and every child was a listed target. Evidence: [`live-552d346-default-autopsy.md`](../../../architecture/live-runs/live-552d346-default-autopsy.md), [`live-552d346-duress-autopsy.md`](../../../architecture/live-runs/live-552d346-duress-autopsy.md), [`live-0bc3eee-default-autopsy.md`](../../../architecture/live-runs/live-0bc3eee-default-autopsy.md). The row is in [`first-executions.md`](../../../architecture/first-executions.md).

<a id="oq-229"></a>

**OQ-229 — Does a persona's `delegates_to` narrow which roles it may delegate to?** *(REQ-CONFIG-101, `delegates_to` "roles this
one may spawn", "defaulting to empty"; REQ-CONFIG-045, a user's personas; REQ-CONFIG-062, the role vocabulary a file is
canonicalised by; REQ-CONFIG-231 and REQ-CONFIG-232, the referential and cycle checks over the lists; REQ-CONFIG-246, a
referential error with no one present refuses the run; REQ-CONFIG-464; REQ-ORCH-002, REQ-ORCH-028, REQ-ORCH-029, REQ-ORCH-030,
REQ-ORCH-034, REQ-ORCH-038; REQ-TOOLS-005 and REQ-TOOLS-006, an absent narrowing narrowing nothing; `PD-TOOLS-006` revision 4.
Raised 2026-10-07 by OQ-228's ruling, which set it aside, from the final live runs' finding P5 (the default autopsy at `a68f121`);
recorded in
[`a-personas-delegates-to-never-narrows-its-delegations.md`](../../../defects/fixed/a-personas-delegates-to-never-narrows-its-delegations.md);
the consortium's question DT1, numbered OQ-229 as the round assigned. **Ruled 2026-10-07.**)*

The loader parses, canonicalises and validates `delegates_to`, reports an entry that names no role and any cycle through the
lists, Settings shows those messages, and an unattended run refuses to start over them. Admission and the catalogue never read
the list: a delegation is admitted to any target whatever the caller's list holds. Read as an allow-list, the empty default would
forbid every delegation, and no shipped persona sets the key.

**Ruled 2026-10-07 under the owner's delegation ([R-072](../../../product/requests.md#r-072)):** when a persona's `delegates_to` names
any persona, that agent may delegate only to the delegation targets the list names. Targets are matched after alias resolution,
and OQ-228's three reserved personas stay refused whatever the list holds. That agent's `delegate` catalogue lists only those
personas, plus the aliases whose target is among them. Admission refuses any other persona as `rejected`, before any record
exists and with no task id, with a reason that names the caller's `delegates_to` and lists its targets. An empty list is the
default and what every shipped persona carries, and it narrows nothing: the shipped orchestrator, and every configuration that
never sets the key, keep OQ-228's delegation targets. A persona stops delegating only when `delegate` is left out of its `tools`.
This is **covered work** under REQ-CONFIG-101 ("roles this one may spawn"), read together with REQ-CONFIG-045, -062, -231, -232
and -464, REQ-ORCH-002, -028, -029, -030, -034 and -038, and REQ-TOOLS-005 and -006; no directive and no back-pointer.

**The reading recorded.** An empty list narrows nothing at any layer, so a workspace that writes `[]` lifts a global list;
entries are role names, matched against the persona a delegation resolves to after alias resolution; OQ-228's reserved personas
stay refused; the list removes no tool; REQ-ORCH-034's "known role names" for a narrowed caller are its permitted targets. **The
reading rejected, kept beside its reason:** "an empty list means spawn none" — no shipped persona carries the key, `orchestrator`
alone declares `delegate`, and REQ-ORCH-002, -028 and -029 require it to delegate, so it would stop every shipped run; a
populated default would instead hide each persona a user adds (REQ-CONFIG-045) and reverse OQ-228. REQ-CONFIG-102, -103 and
REQ-TOOLS-006's run allow-list each read an absent narrowing as no narrowing. If a later round reads the empty case as departing
from REQ-CONFIG-101, it lands as `PD-CONFIG-004`, narrowing REQ-CONFIG-101 for the empty case alone, and the build stays as ruled.
*Added 2026-10-13 ([OQ-264](56-spikes-and-later-questions-23.md#oq-264), ruled under [R-072](../../../product/requests.md#r-072)):* `PD-CONFIG-004` went to OQ-264's
ruling (the Display category's three transcript switches); such a departure takes the next free CONFIG number.

**What it costs.** REQ-ORCH-028's routing table still names roles a narrowed coordinator may not reach (each such delegation is
refused once, 17.7 to 19.6 s a refused step); REQ-ORCH-030's diagnosis route is refused when the list leaves out
`codebase-analyst` and `librarian`; during a plan cycle a list naming only implementers leaves no admissible delegation; a list
naming its own persona, for example to keep a child orchestrator, is reported as a delegation cycle at every load (REQ-CONFIG-232),
which refuses an unattended run (REQ-CONFIG-246), so such a coordinator runs attended; and lists already in users' files start to
bind after the upgrade.

The two recommendations weighed, and the ruling followed **both**; they take the same position:
- **Advocate A (the user's lens)** recommended that a non-empty list narrow the catalogue and admission to the targets it names,
  aliases resolved first, the reserved personas still refused, a delegation outside it refused `rejected` with a reason naming the
  caller's `delegates_to`, and an empty list narrowing nothing. The ruling took A's sentence telling a narrowed caller its
  catalogue is narrowed, and the layering test (a workspace `[]` lifting a global list).
- **Advocate B (the system's lens)** recommended the same, with the refusal as REQ-ORCH-034's unknown-role message listing the
  caller's permitted personas and aliases, as covered work. The ruling took B's placement of this ruling in the OQ OQ-228's record
  raised, and the run's log lines.

The ruling adds three things neither stated: a log line for an explicitly empty list on a persona that holds `delegate`, the
order of the checks (unknown name, then a reserved persona, then a persona outside a non-empty list, all ahead of the plan gate,
the write scope, the continuation check and OQ-220's todo-item checks), and REQ-CONFIG-246's cost for a list naming its own
persona.

**What a live run then shows.** Nothing changes in the default or duress live runs, which set no `delegates_to`: every
coordinator request's description stays as OQ-228 leaves it and admission is unchanged. A run whose configuration gives the
coordinator a list shows only the listed delegation targets with the sentence saying the catalogue is narrowed, each delegation
outside the list as one `rejected` observation naming the list with no child row, and one log line at setup for an entry that
permits nothing. The evidence is scripted only.

*Built 2026-10-13 (fin33, `fin33-delegation-targets-and-plan`); reported in `PD-TOOLS-006`'s revision 4 first execution.*
`Persona.delegatesTo`, set by `personaResolverFor` from a non-empty `delegates_to`, with its four log lines; `delegationTargetsFor`
and `resolveDelegationTarget`'s third refusal (`packages/engine/src/children/personas.ts`); the caller's persona into
`ChildLedger.spawn` (`SpawnInput.callerPersona`); `DelegateCatalogue.narrowedBy` and its two sentences
(`renderDelegateCatalogue`). Pinned by `children/children.test.ts` (a narrowed root, an alias of a listed persona, a list naming
only `gatekeeper`, the check ahead of a continuation, the writers among the targets, a child persona checked against its own list,
a follow-up not checked, the key unset), `run-host/tools.test.ts` (the catalogue equal to what admission accepts in both
directions; a global list narrowing and a workspace `[]` lifting it), `run-host/configuration.test.ts` (the carried list and the
four log lines) and `tools/delegation.test.ts`. The note is repaired.

**Reported back 2026-10-13 (fin41), from the live packs at `552d346` (default and duress) and `0bc3eee`:** **NOT REACHED**: no live
configuration sets `delegates_to`, so the narrowing is shown in scripted evidence only. The row is in [`first-executions.md`](../../../architecture/first-executions.md).
