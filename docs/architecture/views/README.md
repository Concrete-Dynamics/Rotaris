# Architecture views — the system as built

Six perspectives on the codebase as it stands, drawn from the code and kept in step with it. `codebase.md`
is the *map* (where work lands, what stands in, what is owed); the ADRs are the *decisions*; these views are
the *picture* — what exists, how it is cut, how it runs, and where an addition lands.

| View | Question it answers | File |
|---|---|---|
| Component | What are the parts and which may depend on which? | [`01-component-view.md`](01-component-view.md) |
| Process | What runs in which OS process, and what crosses each boundary? | [`02-process-view.md`](02-process-view.md) |
| Runtime | What happens, in order, when a run starts, executes, is controlled and ends? | [`03-runtime-view.md`](03-runtime-view.md) |
| Seams | To add one of the things this product adds most often — which files, in what order? | [`04-seams.md`](04-seams.md) |
| State ownership | Which process owns a fact, where does it live, and who may write it? | [`05-state-ownership.md`](05-state-ownership.md) |
| Sequences | Startup, an approval, the board — the flows the runtime view does not own | [`06-sequences.md`](06-sequences.md) |

## Start here — what you are about to change

| You are about to | Read |
|---|---|
| find where something already lives, or which file to open first | [`../../module-map.md`](../../module-map.md) — packages, roots, entry files, test globs; it holds no edges and no edit paths |
| add a command, a channel, a store column, a tool, a configuration key, a notice or a preference | [`04-seams.md`](04-seams.md) — the ordered edit path, then the view it names |
| add a package, or an import that crosses one | [`01-component-view.md`](01-component-view.md) — the allowed-edge matrix is the lint rule verbatim |
| change what crosses a process boundary | [`02-process-view.md`](02-process-view.md) |
| change the run loop, a turn, the controls or teardown | [`03-runtime-view.md`](03-runtime-view.md) |
| decide where a piece of state belongs | [`05-state-ownership.md`](05-state-ownership.md) |
| change startup, the approval round trip or the requirements board | [`06-sequences.md`](06-sequences.md) |
| draw, redraw or restyle a surface | [`04-seams.md` §8](04-seams.md#8-a-drawn-surface), then `docs/design/README.md` §7 |
| find the evidence that re-verifies an area | `AGENTS.md` — the proof-script index |

Each view carries its own section router at the top, so consulting one is a page rather than a chapter.

## Maintenance rule

These views are part of the record, not documentation written after the fact. Two obligations bind every
change to the code (stated in `CLAUDE.md`):

1. **Consult before modifying.** Before changing code, read the view that covers the area — the table above
   chooses it.
2. **Maintain after modifying.** When a change adds, removes or moves a package, an allowed edge, a process,
   a message kind, a channel, a command, a store table, a run-loop step, a control operation, a seam's edit
   path or the ownership of a fact, update the view **in the same commit**, and the "last reconciled" line
   below with it. A view that disagrees with the code is a defect of the change that made it so.

The diagrams are Mermaid; GitHub renders them. Names in the diagrams are the names in the code.

## Last reconciled with the code: **2026-10-06**

**An entry role that wrote no answer is asked once more; a continuation's parent is told it starts with no memory; the
landing's 30 s is written down (OQ-199, OQ-114, OQ-196; `PD-ORCH-006` and `PD-ORCH-004` revision 5, R-071; fin20).**
`Run.turn`'s follow-up sends `ANSWER_REPROMPT` once to a root whose turn returned no text, and a root still silent is
reported in a `system` row and an `incomplete_execution` issue. The continuation offer (`cutOffReport`) and `delegate`'s
description carry the no-memory sentence. `CHILD_LANDING_GRACE` is unchanged. The **runtime view**'s loop diagram, its
paragraph on the root's follow-up and its child-timeout paragraph say so. No package, edge, process, channel, command or
store column changed.

**A continue resumes the paused iteration with the intent and tools it started with, and the fingerprint is the persona's
(OQ-162, OQ-105; `PD-ORCH-005` revision 6, R-071; fin20).** The Continue action and a message-limit resolution hand the
pre-flight the intent in effect (`PreflightContext.intent`), which `runPreflight` resolves with no classification call; a
continue by message that resumes an open iteration runs it under the carried pre-flight (`RunDeps.resumedPreflight`,
`Run.preflightInEffect`) and records its own classification as in effect once that iteration closes (`nextIntentInEffect`).
`ConversationRecord.fingerprint` takes the persona's own definition (`personaDefinitionOf`) and replaces the row after a
stated change (`SessionWriter.replaceAgentFingerprint`, `StoreDal.replaceAgentFingerprint`, a statement over the v24 table).
The **runtime view**'s `Run.start()` order, its conversation-record paragraph and its §7 row, the **state-ownership** row and
the **sequences** view's continue say so. No package, edge, process, channel, command or store column changed.

**The code-intelligence manual tool carries the product's description; an isolated run's servers are handed its tree
(PD-MCP-001, PD-MCP-002, OQ-115, OQ-194; fin21).** The binding manifest gains `productDescriptions`, written by its
generator, and `filterServerTools` puts the usage-instruction tool's on the bundled server's tool. `mcpConfigurationForExecutionRoot`
rebinds REQ-MCP-035's fill-in and the default `cwd` with the project path, and `SessionConnections.connect` takes the root
REQ-MCP-070's `lsp_init` names, which the tool port now passes as the execution root. The **runtime view**'s
code-intelligence paragraph and the **component view**'s manifest paragraph say so. No package, edge, process, channel,
command or store column changed.

**A `write_file` call with no operation is read as a create when its file does not exist (PD-TOOLS-007, OQ-139; fin21).**
`ToolExecutor` gains an optional `inferArguments`, which `Gate.dispatch` asks only for a call its schema still refuses after
REQ-TOOLS-032's repairs; `write_file` answers it, and the gate dispatches the answer in the call's place and appends the
tool's sentence to the result. The **runtime view**'s `toolSpec` paragraph says so. No package, edge, process, channel,
command or store column changed.

**An advertised schema's `$async` is not honoured (REQ-TOOLS-032; fin21).** `advertisedSchemaCheck` drops ajv's own `$async`
keyword before compiling and reads the validator's answer as a boolean only, so a server schema carrying it is checked
synchronously and refuses an invalid call. The **runtime view**'s `toolSpec` paragraph says so. No package, edge, process,
channel, command or store column changed.

**A recovered session's readers present the correction entry (OQ-60, R-071; fin20).** `sessionOutcomeOf` (`run/summary.ts`)
is what a session's record carries as its `summary` and `summary.md` as its Outcome block: REQ-ORCH-082's columns, except
while the session is `interrupted`, when the latest `session.interrupted_recovered` entry stands in their place. The repair
rebuilds `summary.md`. The **runtime view**'s repair paragraph says so. No package, edge, process, channel, command or store
column changed.

**A tool call joins the saved totals as it completes (OQ-116; `PD-ORCH-008`, R-071; fin20).** The root's and each child's
`onToolCompleted` add the call to the run's aggregate and persist it with the agent's own count (`countRootCall`, `countCall`,
`SessionWriter.countToolCalls`); store **v32** appends `sessions.plan_root_tool_calls`, the plan cycle root's counted share,
which its release and its crash record subtract. The **runtime view**'s `entryToolCalls` paragraph and its `sessions` row and
the **state-ownership** row for the tool-call total say so. No package, edge, process, channel or command changed.

**The report summariser reads the child's whole task (OQ-119; `PD-ORCH-007`, R-071; fin20).** `reportTranscript` keeps the
task as given whole within REQ-ORCH-110's 12,000 total, exempt from the 2,000 per event; a task that alone fills the total keeps
its head. The **runtime view**'s children paragraph says so. No package, edge, process, channel, command or store column changed.

**A coordinator granted the direct-work bundle is told to do the work itself (OQ-202; `PD-ORCH-006`, R-071; fin20).**
`entryInstructionsFor` (`children/personas.ts`) fits the entry turn's instructions to the pre-flight's grant: the built-in
coordinating prompt becomes its direct-work form, a configured prompt gains the statement after it, and a turn the plan gate
holds keeps the persona's prompt (`Run`'s root turn). The **runtime view**'s system-prompt paragraph and its entry-port
sentence say so. No package, edge, process, channel, command or store column changed.

**A confirmed run cancel is saved `cancelling` by the engine (OQ-165 ruled 2026-10-06, R-071; fin21).** `Run.cancelAgent`
saves the accepted explicit cancel `cancelling` and `saveRunning` keeps it until the run's end, so every window reads it from
the record; the confirming window's run overlay hands over to the first record reading it (`witness`). The **runtime view**'s
`cancelAgent` row and the **state-ownership view**'s overlay row say so. No package, edge, process, channel, command or store
column changed.

**A setup banner names its project; every stop of a setup step gets 2 s (PD-WORKSPACE-005, PD-MCP-003; OQ-171, OQ-172
ruled 2026-10-06; fin21).** The initialization coordinator's two banners stay application notices and name the project they
concern (`namedBanner`: `{headline}: {the folder's name}`, the detail area opening on the folder). A setup step is
force-killed 2 s after any stop — Cancel, a switch's cancellation, an exhausted budget, the close — where a cancellation
and a budget had REQ-MCP-099's 5 s (`SETUP_TERMINATE_GRACE_MS`). The **process view**'s `mcp.setup` paragraph and the
**runtime view**'s application end say so. No package, edge, process, channel, command or store column changed.

**The run completes only when the coordinator's own plan agrees (REQ-ORCH-029, REQ-ORCH-075, REQ-ORCH-078; fin18).**
`Run.iterate` returns a task whose root answered `succeeded` with an item of its own plan open to the pending queue, once
REQ-ORCH-078's corrections into the root's own conversation are spent (`RunConfig.validationRetries`, default 0; a `followUp`
that `IterationChildren.runWithChildren` now takes). It names the open items in `iteration.end` and tells the same task's next
root (`Task.planLeftOpen`); a task answers only for items not already open at its first take-up (`Task.planExcused`, OQ-203),
which is the plan cycle that planned it where one did (`Run.planCycleTakeUp`), so a plan-mode run's plan is its task's own.
Both records live on the planner task in the stored todo, so a continue and a later run read them back. `RuntimePosture.runOverride`
reaches the run as `RunDeps.coordinating`, false under `single`. The **runtime view**'s loop diagram and its paragraph say
so. No package, edge, process, channel, command or store column changed (the planner todo's JSON gains two optional task
fields inside the existing column).

**A continuation's run starts at its `starting` save (REQ-CHAT-158, REQ-SESSION-154; fin18).** `Run.start()` reads the
row's `updated_at` back right after the `starting` save and writes that as `run_started_at` with the `running` save, where it
took the row's last `updated_at` at that save, which a continuation's "Intent classified" row had moved past its pre-flight.
The **runtime view**'s `Run.start()` sequence says so. No package, edge, process, channel, command or store column changed.

**The expanded plan gate keeps the plan its largest part when a notice shares the window (PD-ORCH-002 revision 2,
REQ-SHELL-022; finacc2's A2).** In `packages/ui/src/shell.css` the plan's text has a floor above the todo's cap (edit
mode's is the adopted `textarea.input` rule's), raised in both modes above the revision field while it is open, every
other part keeps its content height, and below the floor the gate scrolls with its answers pinned. The **runtime view**'s plan-gate passage says so. No package, edge, process, channel, command or store column changed.

**The window that starts a session shows it from the start, and the fallback restart clears the session's notice
(REQ-NOTIFY-032, REQ-NOTIFY-058; finacc2's A1).** `session.start` mints every start's id and marks it as the asking window's
start (`MainWindows.beginStart`, cleared by its subscription, unsubscribe, release or a refused start), and the focus test of
a run's ending is `MainWindows.showingSession`, so a run failing before the renderer's `session.subscribe` is the focused
session's failure. `RunFailurePublisher` gains `clearForRunStart`, called for REQ-NOTIFY-070's restart. The **runtime
view**'s focus-gate passage, the **process view**'s start passage and a **state ownership** row say so. No package, edge,
process, channel, command or store column changed.

**The instruction files close before whatever the prompt carries next (REQ-WORKSPACE-043, REQ-WORKSPACE-047, REQ-MCP-101;
fin19).** `contextUnits` builds the workspace-context unit with `instructionContextUnit` (`config/src/instructions.ts`): the
merged output unchanged, then `INSTRUCTION_FILES_END_COMMENT`. `runTurn` appends the MCP section through the exported
`withMcpSection`. The **runtime view**'s system-prompt paragraph says so. No package, edge, process, channel, command or
store column changed.

**A row committed below the last is published with every row after it (REQ-MONITOR-214, PD-CHAT-004; fin19).**
`ProjectionOwner.onCommitted` publishes the held rows from the committed row's index onward (`rowsFrom`, walking the
indices up to the new `highestHeld`), so an append or the last row's settle is still one row and a settle below it carries
what follows. The **runtime view**'s §9 opening says so. No package, edge, process, channel, command or store column
changed.

**An MCP call is checked against the input schema the model was handed (REQ-TOOLS-032, REQ-SESSION-136; fin18, live-run
finding G3).** `advertisedSchemaCheck` (`agent-tools/advertised-schema.ts`) gives the gate a zod schema that checks a JSON
Schema without rewriting the call, and `McpHost.executorsFor` uses it for every MCP executor's `schema` in place of
`z.record(z.string(), z.unknown())`; a schema it cannot compile keeps the object check and is said once at info. The gate's
array repair wraps a field only where the schema expects an array (`repairArrayFields`; repair round 1). Since repair round
2 the check is ajv 8.20.0 (the engine the MCP SDK bundles), declared by `agent-tools` and `apps/desktop`, in place of zod's
`z.fromJSONSchema`, whose reading of JSON Schema differed keyword by keyword (patterns, integers, `enum`/`const`, `oneOf`).
The **runtime view**'s `toolSpec` paragraph and the **component view**'s new `agent-tools` validator section say so. No
package, edge, process, channel, command or store column changed.

**Settings adopts a reload in one update of the whole form, and a permission mode written elsewhere wins (REQ-CONFIG-419,
REQ-CONFIG-423; fin13).** The Settings hook holds the saved and pending values as one form (`SettingsForm`) and folds each
`config:changed` through `adoptSnapshot`, so a second announcement in the same tick is rebased against what the first left;
`rebasePending` lets a changed permission mode displace an unsaved selection. The **runtime view**'s Tier A paragraph says
so. No package, edge, process, channel, command or store column changed.

**One MCP discovery failure is one record on one line (REQ-MCP-048, PD-MONITOR-002; fin13).** `ToolDiscovery`'s
REQ-MCP-048 warning carries the time, the project the run host launched (the new optional `DiscoverRequest.context`) and the
detail with its lines joined by ` | `; `McpHost.prepare` logs a success only. `restated-facts.mjs` knows the run host's old
line as a fifth restatement, and `code-intelligence-binding.mjs` reads a failure's project from the warning. The **process view**'s one-emitter passage says
so. No package, edge, process, channel, command or store column changed.

**An MCP server whose tool discovery failed is recorded dropped for that reason (REQ-MCP-114, REQ-MCP-042; fin13).**
`grantEvidence` (`run-host/mcp.ts`) records an active server flagged `discoveryFailed` as `fate: 'dropped'`,
`reason: 'discovery-failed'`, with no entry under `granted`; the persona surface still keeps it active, so the prompt lists it
bare (REQ-MCP-048, REQ-MCP-101). The inspector and the persona window print the recorded fate as they did. The **runtime
view**'s MCP surface paragraph and its `children` row say so. No package, edge, process, channel, command or store column
changed (`granted_mcp` is the existing JSON column).

**A failed project setup's banner carries its technical text in its Details area (REQ-NOTIFY-005, REQ-WORKSPACE-092/093/103).** The
initialization coordinator's `banner` dependency takes `(headline, message, detail)`: the task's summary is the message row,
and the detail is the task's `{reason}: {detail}` error followed by one line per finished step (`failureDetail`), or the
cause where the resolution or the run broke down. Main raises it as one `error` notice with all three parts.

**The status strip names an isolated worktree's branch with its own ahead count (REQ-WORKSPACE-020, REQ-SHELL-042; acceptance
repair F8).** `GitWorktreeRow` gains `upstreamAhead` (the tree's branch against its own upstream, one `for-each-ref` read in
`readGitView`), `branchStripItem` draws the worktree branch's ` ↑{n}` from it with the base checkout's sentences, and a strip
item gains an optional `description` for the accessible description alone. The **process view**'s Git-view paragraph and the
**seams view**'s status-strip item say so. No package, edge, process, channel, command or store column changed.

**A child moved by a fallback is drawn on the model it runs on (REQ-MONITOR-052, REQ-MONITOR-066, REQ-MONITOR-069,
REQ-MONITOR-049; finacc F7).** `resilience.forChild` takes the execution (`{ taskId, key }`), and the run keeps each child's
cell by task id (`Run.childCells`). `Run.childModel` names a moved cell's key by the run-level agent's rule (`Run.keyOfCell`)
and gives its model's maximum input, which `toAgentRecord` reads through `AgentFacts.liveModelFor`. REQ-ORCH-088's timeout
fallback republishes the record (`TurnResilience.moved`). The **process view**'s `SessionRecord` sentence and the **runtime
view**'s run-level agent paragraph say so. No package, edge, process, channel, command or store column changed.

**A run in an isolated working tree launches its MCP servers bound to that tree's root (REQ-MCP-034, REQ-MCP-050; fin12).**
`configurationForExecutionRoot` (`run-host/mcp.ts`, over `mcpConfigurationForExecutionRoot` in `config/src/mcp/index.ts`) is
what the tool port's `ready()` and `session.start`'s discovery ahead of the run hand the MCP host, memoised on the execution
root; the discovery and connected lines name the project the launch carried. The **runtime view**'s code-intelligence
paragraph says so. No package, edge, process, channel, command or store column changed.

**The starter agents.yaml is written at the workspace's open (REQ-CONFIG-025, REQ-CONFIG-028; finacc-accept1-3).** The
workspace service's `workspace.open` bootstraps `<workspace>/.rotaris/agents.yaml` once the store is open and before it
answers (`workspace-service/open-bootstrap.ts`), so initialization's first record, which main starts only after that
answer and which goes through the per-field writer that never bootstraps (REQ-CONFIG-030), lands in the starter rather
than creating the file without it. The **process view**'s main-to-service requests and the **sequences view**'s launch
say so. Initialization's marker writer (`serviceMarkerWriter` in `main/initialization.ts`) asks `config.bootstrap`
before each `config.setField`, so a file removed while the workspace is open is given the starter before the record
(REQ-WORKSPACE-040); the **process view**'s initialization paragraph and the **runtime view**'s `initialization:` block
say so. No package, edge, process, channel, command or store column changed.

**A child's closing scheduler pass cannot outlive its store (REQ-ORCH-053, REQ-ORCH-098; fin11).** `Scheduler.close`, called
through `IterationChildren.close` by `Run.turn` once the iteration's children are torn down, stops every later pass; every
unawaited pass after a child's end — `startOne`'s and a resumed child's in `resumePaused` — goes through `Scheduler.passAfter`,
which warns a raise instead of rejecting. The **runtime view**'s teardown paragraph says so. No
package, edge, process, channel, command or store column changed.

**A selector's shown excluded key can be chosen there (REQ-MONITOR-194; fin11).** `SearchableOption.rechoosable` and
`choiceFires` in the design system's searchable select; `annotatedModelOptions` marks each excluded key; the inspector's
guard lets the shown key through when it is excluded. The **process view**'s `SessionRecord` sentence says so. No package,
edge, process, channel, command or store column changed.

**The run-level agent's Model names the key its root runs on while the run is live (REQ-MONITOR-052, REQ-MONITOR-066,
REQ-MONITOR-069; fin11).** The record gains `entryModelKey` (the live run's `Run.entryModelKey`: the key the root's ladder cell
carries, `AgentResilienceCell.key`, set at every assignment of its model, when that is a configured non-copy key, else the
configured key for the cell's pair; null at rest), which `runLevelAgent` names through `runLevelModel`; `entryRole`, and with it the
composer's chip and the strip's model item, is unchanged. A ladder move republishes the record (`TurnResilience.moved` →
`ProjectionOwner.refreshRecord`), since it writes no row and saves nothing. The **process view**'s `SessionRecord` sentence and the **runtime
view**'s run-level agent paragraph say so. No package, edge, process, channel, command or store column changed.

**The status strip's path link and branch item are shortened from the middle against their measured width (REQ-WORKSPACE-149
rule 2; fin11).** `StatusStripItem` draws every strip item; one marked `middle` asks the row for its whole label and re-elides
on resize (seams §8, the status-strip item). The path link gives up its width before the branch name, and the branch item
is shortened only while it shows a branch name, never its state words (the repair round's finding). The branch item carries the accent-coloured branch icon (`icon`, REQ-SHELL-042)
and REQ-WORKSPACE-020's sentences with their full stop; its detached, non-repository and unread states wait on OQ-193.

**A persona or terminal window's commands answer for the main window that owns it (REQ-MONITOR-069, REQ-STARTUP-163;
fin11).** `runCommand` resolves its window through `MainWindows.forCommand` — the sender's main window, else the owner of
the auxiliary window that sent it, else the active window (process view, main's row; seams §1).

**The cell is settled before the compression check, and no pass calls the agent's own excluded pair (REQ-MONITOR-194,
REQ-MONITOR-080; fin10's first repair round).** `settleBeforeCall` (ladder.ts) follows the overrides and reads the exclusion;
`runTurn` calls it before the automatic compression check as well as `resilientStep` before every call, and
`TurnCompression.withheld` makes no call for a pass on the agent's own excluded pair. The **runtime view**'s ladder and
compression paragraphs say so. No package, edge, process, channel, command, timeline name or store column changed.

**Every model selector annotates a pair held out of quota, and every one's choice clears it (REQ-MONITOR-194,
REQ-MONITOR-146, REQ-NOTIFY-074; fin10).** The record gains `excludedModels` (the live run's `excludedModelKeys`, else a
resting read's, now taken where the timeline holds a `model_exhausted` entry too), which the run header, the inspector and the
composer's chip annotate through `annotatedModelOptions`; the recovery dialog's facts mark such a pair `excluded`. A new
renderer command, `session.chooseNextModel`, carries the composer's next-run choice to the engine after its configuration
write, and `Sessions.chooseNextModel` clears the pair's exclusion; the recovery dialog's restart clears beside its pin. The
**process view**'s command list and `SessionRecord` sentence and the **runtime view**'s ladder paragraph say so. No package,
edge, process, channel or store column changed; one command was added.

**The ladder reads the exclusion before every call, a wait choice persists every waiting pair's override, and compression
follows the agent's cell (REQ-MONITOR-194, REQ-ORCH-091, REQ-SESSION-026, REQ-MONITOR-078/080; fin10).** `resilientStep` reads
the exclusion after `followOverride` and takes `limitPath` without calling (`pre_call: true`); `Run.overrideWaitingPairs` writes
one `model_override` entry per waiting pair; `TurnCompression.compressor()`/`trigger()` are read at each pass from the pair the
cell calls next. The **runtime view**'s ladder and compression paragraphs and its control table say so. No package, edge,
process, channel, command, timeline name or store column changed.

**The status strip is REQ-SHELL-038's (REQ-SHELL-038..047, REQ-TOOLS-131/184; fin10).** `stripItems` in
`packages/ui/src/composer.ts` answers the strip's items in REQ-SHELL-038's order with its accessible names and REQ-SHELL-047's
two thresholds; the run state, the theme's name, the child services and the replica counters are gone from it; the
file-access flag reads `runtime.allow_outside_workspace`. Two commands are new: `workspace.openFolder` (the path link,
REQ-SHELL-040) and `workspace.usage` (the tokens and cost, relayed to the run host, which answers from the stored sessions).
Since 2026-10-03 `● CB armed` follows the saved `circuit_breaker.enabled` from the snapshot (`stripCircuitBreakerArmed`), and
`config:changed` carries each main window, and its persona and terminal windows (`configFamily`), its own workspace's
snapshot (`announceConfig`, `main/config-broadcast.ts`).
The **process view**'s command and run-host request lists, the **state ownership view**'s Settings row (the dirty flag the
strip reads) and the **seams view** §8 (the status-strip item, rewritten) say so. No package, edge, process, channel or
store column changed.

**A background run that ended on a provider limit brings REQ-NOTIFY-063's notice with the focus (REQ-NOTIFY-093/030/031;
fin10).** `runEndingPublication` hands the limit's text beside the quota notice, and `RunFailurePublisher.endedOtherwise`
holds the `quota` class for a session no main window follows, released by the focus as a failure's class is. The
**runtime view**'s focus-gate paragraph and the **state ownership view**'s held-publication row say so. No package, edge,
process, channel, command or store column changed.

**The model chips name the override in force (REQ-CHAT-006, REQ-SESSION-026, REQ-NOTIFY-089; fin8).** The record gains
`modelOverrides` (`overridesInForce` over the run's catalogue and the session's memory; for a session opened from the store,
its workspace's catalogue read once where its timeline holds an override, through the side-effect-free
`SessionsDeps.restingCatalogue` port the run host fills with `restingCatalogueOf` — never the per-run `configure`, whose
MCP configuration load and run maps a read must not touch, as fin8's verifier found the first form did), and `entryRole` names the key the entry role runs on, so
the composer's model chip, the inspector and a persona window say what the next run starts with. The **process view**'s
`SessionRecord` sentence says so. No package, edge, process, channel, command or store column changed. Whether a mid-run
entry switch reaches the next run is the ladder-overrides bundle's open question and is not decided here.

**The project setup dialog stands below the window chrome (REQ-WORKSPACE-106, ADR-0048; fin8, OQ-187).** AppShell gains
a `windowDialog` slot inside the rail-and-view region; `ProjectSetupDialog` is mounted there, `absolute` at the region's
top corner, where it was `fixed` at the window's and lay over the title bar's controls and the notice's answers. The
**seams view** §2's rule for a panel open until answered names it as the window-level exception. No package, edge, process, channel, command or
store column changed.

**A run that ends while its session is not on screen names it (REQ-NOTIFY-031, REQ-MONITOR-202; fin8).** Main's run-result
handler routes a non-failure ending through `RunFailurePublisher.endedOtherwise`, the focus test REQ-NOTIFY-032's gate
already used: a session no main window follows raises `unfocusedEndingNotice` (persistent, `success` or `info`, naming the
session and its normalised state, focusing it) in place of its summary. A new renderer command, `session.release`, tells
main a window no longer follows the session "New session" released; the **process view**'s Part R paragraph says so. No
package, edge, process, channel or store column changed; one command was added.

**The quota-wait chooser annotates the pairs held out of quota (REQ-MONITOR-194, REQ-MONITOR-303; fin8, OQ-186).** The
record's `wait` gains `excluded`, the configured keys whose pair the run's `ResilienceMemory` holds out of quota
(`excludedModelKeys`, read by `Run.currentWait` at every snapshot); the wait header's change-model chooser lists each with
the reason as its hint and leaves it choosable. The **runtime view**'s `setModel` row says so. No package, edge, process,
channel, command or store column changed.
**A take-back records a root on any pair of the override's chain as having followed it (REQ-ORCH-091 d, REQ-MONITOR-142;
the fourth round of `a-childs-wait-choice-leaves-the-root-calling-the-pair-it-replaced`).** `Run.onChainFrom` classifies
`root_cell: 'followed'` for a root on the taken-back override's own target or any pair past it, not only the chain's end.
The **runtime view**'s ladder paragraph says so. No package, edge, process, channel, timeline name or store column changed.

**An entry switch ends with its run, and OQ-185 asks whether it should (REQ-MONITOR-142/143, REQ-SESSION-026,
REQ-MONITOR-146).** The **runtime view**'s `setModel` row says where a switch is held. No code moved.

**The entry agent's context limit is its ladder cell's model's (REQ-MONITOR-049, REQ-MONITOR-089; the repair of
`the-entry-agents-context-limit-is-read-from-the-requested-model-not-the-one-it-runs-on`).** `Run.entryContext` reads the
limit from the root cell's model. The **runtime view**'s `SessionRecord.entryContext` sentence says so. Nothing else moved.

**An explicit choice clears an exclusion (REQ-MONITOR-194; the repair of
`an-explicit-choice-of-an-exhausted-pair-does-not-clear-its-exclusion`).** `ResilienceMemory.clearExhausted`, persisted as a
`model_exhausted` entry carrying `cleared: true`; `setEntryModel` clears the chosen pair, and in a quota wait the waiting
pair itself is a retry. The **runtime view**'s ladder paragraph and its `setModel` row say so. No package, edge, process,
channel, command, timeline name or store column changed.

**A session-wide override is followed from every agent's next call (REQ-ORCH-091 a/d, REQ-MONITOR-194; the repair of
`a-childs-wait-choice-leaves-the-root-calling-the-pair-it-replaced`).** The ladder reads the session's overrides before
every call (`followOverride`), not only where a cell is built, and the summariser's model is carried through them at each
attempt. The **runtime view**'s ladder paragraph says so. A child's wait choice records `switch_pending` on its
`model_override`, which the autopsy reader places before a pending switch; the **runtime view**'s `setModel` row says so.
No package, edge, process, channel, command or store column changed.

**The status strip names the focused session's confinement backend (REQ-SANDBOX-121, REQ-MONITOR-257, REQ-NOTIFY-030;
fin8).** Store v31 appends `sessions.sandbox_backend`, written beside `sandboxed` when a run starts; the record carries
`sandboxBackend`; the strip draws `sandbox: <backend>` for a focused session whose record says confined, and nothing
otherwise. A run of an existing session refused at the confinement gate republishes its record unconfined until a run of it
starts (REQ-NOTIFY-061; repair round 1, `Sessions.refusedAtStart`, held in memory, not in the row). The **runtime view**'s
`sessions` row, the **process view**'s `SessionRecord` line, the **state-ownership view**'s run-host row for that refusal
and the **seams view** §8 (a worked status-strip item) say so. No package, edge, process, channel or command changed; one
store column did.

**The retry resubmits the session's last prompt from the store, images included (REQ-NOTIFY-045, REQ-SESSION-192,
REQ-CHAT-173; fin8).** A notice's retry with a blank draft is one command, `session.retry`, renderer → main → run host
(`Sessions.retry`), in place of the window's search of its replica, and the prompt's images go with it, read back from the
session's directory and verified by digest (`readBackAttachments`); `lastSubmittedPrompt` (over `StoreDal.lastPromptRow`, resident and released rows alike)
is the one reading of a session's last prompt the retry, the continue, the plan decision and the authentication restarts
share. The **process view** lists the command on both boundaries, the **runtime view**'s continuation lease names it, and
the **seams view** §6 says where a blank-draft retry lands. No package, edge, process, channel or store column changed.

**An authentication restart relaunches the failed run's own launch (REQ-NOTIFY-070, REQ-NOTIFY-074, REQ-ORCH-154; the
401 note's part A, fourth repair round).** `Sessions.relaunchAfterAuthFailure` is the one restart path of the automatic
fallback and of the recovery dialog: a run a plan decision launched (`Live.planLaunch`, kept with that run) is relaunched as
that decision, any other by re-submitting the last prompt. The **runtime view**'s two restart paragraphs and the **process
view**'s dialog entry say so. No package, edge, process, channel, command or store column changed.

**The automatic fallback goes ahead of the recovery dialog (REQ-NOTIFY-068, REQ-NOTIFY-070, REQ-NOTIFY-072, REQ-NOTIFY-079;
the 401 note's parts A and B merged beside C and D, 2026-10-02).** The two builds of REQ-NOTIFY-060's classes are one:
`main/failure-class.ts` and `main/run-failure-notice.ts` (parts C and D) classify and word every ending, and the focus gate
(`RunFailurePublisher`) asks the automatic half first for an authentication failure — `main/failure-recovery.ts`, renamed
**`main/auth-fallback.ts`** and narrowed to the first failure's restart and the prompt (its notices and its classifier were
the gate's twins and are gone) — and opens the recovery dialog only where that answers `dialog` (a second failure, or a first
with no usable fallback); the dialog's opening closes every prompt, and the primary the fallback restarted away from joins
the dialog's refused pairs (`AuthRecovery.refuse`). The run host's `session.restartOnFallback` refusals now carry the code
main reads that by (`NO_USABLE_FALLBACK`). The **runtime view**'s classification paragraph, the **state-ownership** rows of
the first-failure bookkeeping, the prompt and the refused pairs, and the **seams view** §1 (nineteen facets) and §2 say so.
No package, edge, process, channel, command or store column changed.

**A board run is settled against its own workspace (REQ-TRACE-477, REQ-TRACE-466, REQ-TRACE-476).** Main's run coordinator
keeps each board run's workspace root and id; the run's ending, its waiting fact and the dispatch after its end address
that workspace's service, and the run host's exit reaps every workspace that held a run. This repairs
`a-board-run-is-settled-against-the-focused-windows-workspace-not-its-own.md`; `requirements-runs.test.ts` pins it. The
**process view**'s requirements paragraph and the **sequences view**'s board section say so. No package, edge, process,
message kind, channel, command or store column changed.

**One acceptance suppresses the disclosure for the rest of the launch (REQ-TRACE-472).** `requirements.runs` gains the
`accept` op: the board's plain acceptance tells main's coordinator, which holds it in memory for the launch and reads
`accepted` — a new value of `StandingDisclosure` and of `LaunchPreview.disclosure` (`packages/contracts/src/requirements.ts`)
— in the standing disclosure it stamps on every service command and in the preview, which the board answers without the
dialog (`disclosureFor`). This repairs `accepting-the-disclosure-once-does-not-suppress-it-for-the-rest-of-the-launch.md`;
`requirements-proof`'s `disclosure-launch` stage shows it. The **process view**'s requirements contracts and the
**sequences view**'s board section say so. No package, edge, process, message kind, channel or store column changed;
the command gained one op value and the envelope's disclosure one value.

**An automatic queue dispatches at a workspace open and after a reject (REQ-TRACE-476, REQ-TRACE-482).** Main's run
coordinator gains `opened(root, workspaceId)`, a dispatch for the workspace just opened, kicked once from
`openWorkspaceInner`'s post-open slot; its dispatches are serialised per workspace root rather than one at a time. The
board kicks it after an act that rests a card in `ready` under automatic scheduling (`dispatchesAfter`). This repairs
`an-automatic-queue-starts-nothing-after-a-launch-until-something-kicks-the-dispatch.md`; `requirements-proof`'s
`ready-restart-automatic` stage shows it. The **sequences view**'s board section says so. No package, edge, process,
message kind, channel, command or store column changed.

**A rejected card's next unit begins on a fresh tree (REQ-TRACE-423, REQ-TRACE-464, REQ-TRACE-482).** The delivery
service treats a launch held for an earlier unit as spent: the scheduler names the card's current unit, and the claim
provisions it when the store records no tree for it, writing the row at once through the writer's new
`recordWorktreeProvisioned` (`workspace/src/delivery/transition.ts`, `handles.ts`). A claim before the first pass under
`manual` with nothing armed answers without parsing the store. This repairs
`a-rejected-card-back-in-ready-can-never-start-its-next-unit.md`; `requirements-runs-proof`'s eighth assertion shows it.
The **sequences view**'s board section says so. The writer gained one method (a row write, no delivery state); no
package, edge, process, message kind, channel, command or store column changed.

**A failed run's notice waits for its session to be on screen, and a pair that failed authentication is not offered again
(REQ-NOTIFY-030/032, REQ-NOTIFY-064, REQ-NOTIFY-068; the 401 note's repair round 1).** Every run-ending notice is built by
`main/run-failure-notice.ts`; a failed run of a session no main window follows raises REQ-NOTIFY-032's warning and holds its
class publication — the recovery dialog included — until `session.subscribe` follows it (`MainWindows.followerOfSession`).
Main keeps the pairs that failed authentication by session until their provider's credentials change. The **runtime view**'s
classification paragraph and two **state-ownership** rows say so. No package, edge, process, channel, command or store
column changed.

**The recovery dialog re-authenticates the provider that failed (REQ-NOTIFY-076, REQ-NOTIFY-077, REQ-NOTIFY-202, OQ-179; the
401 note's part D).** A fourth command, `authRecovery.reauthenticate {apiKey}`, carries a key inward to main's provider key
store (`ProviderService.reauthenticateWithKey`, stage-typed so a storage failure is told apart) and relays
`session.authRestart` with no model key, which restarts on the same model without a pin. The **process view**'s command
and run-host message entries and the **runtime view**'s classification paragraph say so. No package, edge, process, channel
or store column changed.

**A failed run is classified, and an authentication failure opens the recovery dialog (REQ-NOTIFY-060, REQ-NOTIFY-064,
REQ-NOTIFY-067, REQ-NOTIFY-072..075, REQ-NOTIFY-079/080; the 401 note's part C).** Main matches a failed run in REQ-NOTIFY-060's
order (`main/failure-class.ts`); the generic class raises REQ-NOTIFY-064's notice with the workspace action; the
authentication class asks the run host `session.authRecovery` and opens a 560 px modal window, role `auth-recovery`, whose
Retry is relayed as `session.authRestart` (`Sessions.restartAfterAuthFailure`: a `model_override` pin against the failed pair,
the last prompt re-submitted). The **process view** gains the window, the two run-host message kinds and the three
`authRecovery.*` commands; the **runtime view** the classification paragraph; the **seams view** §1 the `auth-recovery`
facet (its count corrected: eighteen, not sixteen); the **state-ownership view** the open dialog's row. No package, edge,
process, channel or store column changed.

**A closing terminal frame no longer blanks a preview (REQ-SHELL-102, REQ-CHAT-063, REQ-CHAT-076).** The renderer's
`TerminalStreamSet` holds, for `previewOf`, the screen a `screen` frame's reset replaces, from the parser reaching that
reset (`applyFrame`'s `resetReached` hook, an empty write queued ahead of it) until the text has parsed (its `parsed`
hook), and notifies its listeners again with a new outcome, `parsed`, once it has. The **process
view**'s live-terminal paragraph says so. This repairs
`a-closing-terminal-frame-blanks-the-preview-while-the-final-screen-is-parsed.md`. No package, edge, process, message kind,
command or store column changed.

**The re-authentication prompt yields to an expanded plan gate (REQ-NOTIFY-071, REQ-ORCH-153, ADR-0048, OQ-181; the 401
note's part B, third repair round).** Beside an expanded gate the prompt is drawn as a bar (its title and its answers) so the
gate keeps its three answers and the plan its height. The **seams view** §2 states the rule (in flow is not enough beside
another panel open until answered: the one the run is not stopped on yields to one row of its answers) and the **runtime view** the placement. No package, edge, channel, command or
store column changed.

**A plan cycle's 401 is restarted on the fallback (REQ-NOTIFY-070, REQ-ORCH-153; the 401 note's part A, third repair
round).** `Run.recordRootModelFailure` records the failed model with the run's last failure on every root turn, the plan
cycle's included; the **runtime view** says so. No package, edge, channel, command or store column changed.

**The re-authentication prompt is laid out in flow and overlays nothing (REQ-NOTIFY-071, ADR-0048, OQ-181; the part B
second repair round).** AppShell's **`windowPanel`** slot is removed; the Workspace view draws the followed session's
prompt (`WorkspaceView`'s `reauthPrompt`) as its own grid row, **`reauth`**, between the run header and the transcript,
declared in every template of the view's grid. The **seams view** §2 states the rule this leaves (a non-modal surface open
until answered is laid out in flow, never as an overlay) and the **runtime view** the placement, each with the
falsified reading kept. No package, edge, channel, command or store column changed.

**The re-authentication prompt follows the focused session and covers no window control (REQ-NOTIFY-030, REQ-NOTIFY-071,
ADR-0048; the part B repair round).** Channel 13 now carries `{sessionId, prompt}` to every main window, a new renderer
command **`reauth.read`** answers the open prompts for a window that mounts later, and each window draws the followed
session's prompt alone. AppShell gains a **`windowPanel`** slot inside the rail-and-view region, where the prompt is
drawn, below the title bar and the notice slot. The **seams view** §2, the **process view**, the **runtime view** and
**state ownership** say so, each with the first build's reading kept beside the correction. No package, edge or store
column changed.

**The non-modal re-authentication prompt (REQ-NOTIFY-071/078, ADR-0048; the 401 note's part B).** A new main → renderer
channel, **`reauth:prompt`** (channel 13), carries one session's prompt or null to the window that follows it; two
renderer commands answer it, **`reauth.submit {sessionId, apiKey}`** and **`reauth.dismiss {sessionId}`** (facet
`main/commands/reauth.ts`); and the run host gains **`session.repinPrimary`** → `session.primaryRepinned {applies}`
(`Sessions.repinPrimary`, `Run.rebuildEntryFromMemory`). The **seams view** §2 counts thirteen channels and names this one
the worked example of a window-level non-modal surface fed by main, §1 the seventeenth facet; the **process view** lists
the channel, the commands and the request; **state ownership** the prompt main holds; the **runtime view** the switch
back from the next iteration. No package, edge or store column changed.

**A failed run is classified in REQ-NOTIFY-060's order, and a first 401 restarts on the fallback (REQ-NOTIFY-060/064/
067/069/070, REQ-MONITOR-147, REQ-SESSION-026; the 401 note's part A).** Main's run-result handler hands a result carrying
failure text to `main/failure-recovery.ts` (now `main/auth-fallback.ts`, below; classes in `main/failure-class.ts`), the one writer of a run failure's notice:
REQ-NOTIFY-064's generic notice with `Return to the workspace`, REQ-NOTIFY-063's as before, and for a first authentication
failure the new run-host request **`session.restartOnFallback {sessionId}`** → `session.fallbackRestarted {failed,
fallback}` (`Sessions.restartOnFallback`: the `model_override` entry keyed by the failed pair, `cause: authentication`,
and the last prompt re-submitted; a `cleared: true` entry takes a pin back). The **process view** lists the request, the
**runtime view** the classes and the restart, **state ownership** main's first-failure bookkeeping. No package, edge,
channel, command or store column changed.

**The run-wide compression count reaches the record and the agent surfaces (REQ-MONITOR-086, REQ-MONITOR-281, OQ-159).**
`SessionRecord` gains `compressions`: the live run's maintained aggregate while a run is live (`Run.compressions`), else the
stored `sessions.compressions` (`runCompressionsOf`). The run-level agent carries it in place of the children-only sum, so a
root's own compressions are counted, and the inspector's ring caption and the persona window's context card draw the count
as an element of their own (`inspector-compressions`, `persona-compressions`). The **runtime view**'s entry-record paragraph
says so. This repairs `the-inspector-and-a-persona-window-show-per-agent-metrics-without-the-compression-count.md`. The
snapshot channel's `SessionRecord` gained the field; no package, edge, process, message kind, command or store column changed.

**An entry switch applies from the next iteration, over a ladder move (REQ-MONITOR-142, REQ-ORCH-090, REQ-ORCH-091,
OQ-177).** `Run.pendingEntrySwitch` holds a user's switch until `rootResilience`, now read once per root turn (an
iteration, its resumes after its children included), applies it: a model switch rebuilds the root's cell on the chosen
model even onto the one it was last built from (`rootRebuildsFor` counts it, so every switch records `rebuilds: true`), the
once-per-agent budgets carried over; a reasoning switch sets the level on the model the cell has; a switch onto a pair a
change-model resolution moved says where the entry agent runs instead (`ResilienceMemory.overrideReaching`). The
**runtime view**'s `setModel` row says so. **The retry notice action has a target, and a refused confinement mode raises
REQ-NOTIFY-061's notice (REQ-NOTIFY-045, REQ-NOTIFY-061, OQ-178).** `retry-run` dispatches to the renderer's `retryRun`,
and the confinement gate's refusals carry the code `session.confinement` from the run host to main's
`confinementRefusalNotice`, for a start, a prompt and a continue; the **seams view** §6 says the first, the **runtime
view**'s refused start the second. No package, edge, process, message kind, channel, command or store column changed.

**A switch of the entry model records whether the root's cell is rebuilt for it (REQ-MONITOR-142, REQ-ORCH-090,
REQ-ORCH-091).** `setEntryModel` writes `entry_model_switched` with `{ model, rebuilds, supersedes }`, `rebuilds` being
the test `rootResilience` applies at the next turn (`Run.rootRebuildsFor`) and `supersedes` saying the switch replaces one
the root never took a turn on (`Run.entrySwitchPending`; the root's own wait choice records it on its `model_override`
too), so the autopsy reader ends a ladder move of the root only on a switch that rebuilt its cell. Each ladder move of the
root records `switch_pending` (`TurnResilience.switchPending`), so the reader reads a move made while a switch was pending
before that switch, and reads a superseded switch as if it were not recorded, every record since it read again. The
**runtime view**'s `setModel` row says so. This repairs
`the-autopsy-reader-reads-a-switch-onto-the-configured-model-as-ending-a-fallback.md`; the timeline name is unchanged. No
package, edge, process, message kind, channel, command or store column changed.

**A setup that finishes before its start is answered is seen to finish (REQ-WORKSPACE-084/103/109, OQ-169).** The
initialization coordinator keeps the latest `mcp.setupStatus` pushed while its own start request is in flight
(`setupEarly`) and drains it after the answer when it is the same setup's. Where the drained status has every step
ended and still reads `running`, it asks the run host's status once. This repairs
`a-setup-that-finishes-before-its-start-is-answered-is-never-seen-to-finish.md`; `workspace-proof`'s scenario 8g shows it.
The **process view**'s initialization paragraph says so. No package, edge, process, message kind, channel, command or
store column changed.

**A role's pending edits keep each field's scope through the save (REQ-CONFIG-259, REQ-CONFIG-341).** The Personas
table's pending edits are held per role and per scope (`PendingRoleEdit` is `{ workspace?, global? }`), and
`applyChange` writes a change under its own scope only. `RoleEditSchema` carries the same two-scope shape in place of one
`scope`, strictly. `saveDesktop` writes each scope's part in its own file (`roleEditAt`). The Personas row shows the
pending edit made at the selected scope. This repairs `a-roles-pending-edits-at-two-scopes-save-at-the-last-scope-only.md`,
in two rounds. The first gave each field one scope, and a second edit of the same field at the other scope dropped the
first. `settings-proof`'s launches 9 and 10 show it. The **seams view** §5 says so. The `config.save` payload's role entry
changed shape. No package, edge, process, message kind, channel, command or store column changed.

**A card resting in `ready` across a restart is disclosed and started from the queue (REQ-TRACE-472, REQ-TRACE-482,
REQ-TRACE-464).** The delivery service's `recoverLaunch` (`workspace-service/delivery.ts`) rebuilds a launch the restart
lost from the store's worktree row through `RunGitPort.takeOver`, never by provisioning. It runs once on the first pass
after a start and again on the queue's release, which records the disclosure it carries. A tree that cannot be taken
over is stated on the queue entry. `beforeCommit`'s own take-over now shares `takeOverRecorded` with it. This repairs
`a-card-resting-in-ready-across-a-restart-can-never-be-started.md`; `requirements-runs-proof`'s sixth assertion shows
it. The verifier falsified two of its clauses the same day. First, the recovery ran on the restart reap's pass only, so a
first parse that failed used it up; it now runs on every pass that parses. Second, a recovered launch was undisclosed with
no way to learn main's preferences. Main's coordinator now sends its standing disclosure (`due`, `suppressed`, `off`) on
`requirements.run.claim`, a new optional field of that command. `requirements-runs-proof`'s seventh assertion shows it.
The **sequences view**'s board section says so. No package, edge, process, message kind, channel or store column changed.
**Corrected in a second round the same day:** sent on the claim alone, the value split the scheduler, and the queue the
board published still asked for a disclosure the claim no longer needed. The field moved off `requirements.run.claim`
onto the `requirements.command` envelope, beside the actor, stamped by main's relay and its coordinator on every command;
the service holds the last value and schedules the published queue, the preview and the claim under it. The **process
view**'s requirements contracts and the **sequences view**'s board section say so. No package, edge, process, message
kind, channel or store column changed.

**A unit's worktree is provisioned once, and a later start of the same unit takes it over (REQ-TRACE-464,
REQ-GIT-140).** The delivery service's `beforeCommit` takes over the tree of the launch it holds when that launch is
for the derived unit and its tree is on disk. It provisions only a unit with no tree. After a restart it takes over the
store's worktree row for that unit through `takeOverUnitWorktree` (`workspace/src/delivery/runs.ts`, the new
`RunGitPort.takeOver`), and `provisionUnitWorktree` is unchanged. This repairs
`a-card-held-out-of-ready-and-resumed-provisions-its-unit-worktree-a-second-time.md`. The **sequences view**'s board
section says so. No package, edge, process, message kind, channel, command or store column changed.

**One measurement observer per transcript pane, a held scrollbar gutter, and a delivery held to the committed span (ADR-0045, REQ-CHAT-055, REQ-CHAT-058).**
`TranscriptPane.tsx` makes its measurement observer once, at mount. Its effect no longer depends on the displayed rows or
the capacity, so a pending passive effect flushed inside the delivery's own `flushSync` can no longer disconnect the
delivering observer and observe every slot again. A slot that a displayed change rebinds is observed by the every-commit
`observeAgain`. Each slot's ref callback is made once (`slotRef`, `pool.ts`); a slot whose node unmounts is unobserved and
forgotten, so a node mounted later in that slot is observed again. `.transcript__scroll` holds its scrollbar gutter, so the
width the rows are measured at never changes with the bar. And the delivery's synchronous render binds the span of rows the
pool last committed (`bindRange`, `pool.ts`), so it moves rows and rebinds no slot; an ordinary render after the frame
releases it. Without the hold, a corrected height above the viewport moved the span and rebound every slot inside the
delivery, which left the console line at the end of `transcript-proof`'s append runs after the first two repairs. The
**runtime view**'s transcript paragraph says all three, and corrects its "never added to or removed from" for the pool,
which the capacity growth of 2026-10-01 had falsified. This repairs
`the-observers-synchronous-render-can-leave-a-resize-observer-loop-notification.md`, and `transcript-proof` fails on the
console line in any launch. No package, edge, process, message kind, channel, command or store column changed.

**A dialog opened while the composer's send is settling keeps its focus (REQ-MONITOR-137, REQ-CHAT-002).** The
composer's awaited submissions (a queue, a start or continue, an executed slash command) return the focus through one
rule, `composerReclaimsFocus` (`ui/src/composer.ts`): to the composer only when the focus is nowhere, in the composer, or
still on what held it when the submission began. Main's `session.subscribe` gains a verification seam,
`ROTARIS_CAPTURE_SUBSCRIBE_HOLD_MS`, which holds its reply after the attach; the **process view**'s subscription
paragraph says both. This repairs `a-modal-opened-while-the-composers-send-is-settling-loses-its-focus-to-the-composer.md`;
`part-j-proof`'s steer-early launch (scenario 2b) shows it. No package, edge, process, message kind, channel, command or
store column changed.

**The intent status after a continue is the continuation's (REQ-ORCH-014, OQ-162).** The record's `intent` reads the
newest `run_continuation_intent` entry's payload, else the launch audit's (`intentPayloadOf`, `sessions.ts`, over the
new `StoreDal.latestTimelineEntry`, a read under the timeline's primary key whose plan `store.test.ts` asserts), and
reads `classifying` while the live run's pre-flight classification is in flight (`Run.intentClassifying`), a
continuation's included, so the previous run's intent is not shown meanwhile. This
repairs the header half of `docs/defects/fixed/continue-classifies-the-intent-again-and-widens-the-resumed-roots-tools-mid-iteration.md`,
whose other half stayed OQ-162's until its ruling (R-071, 2026-10-06; built below). The **runtime view**'s `Run.start()` order says so. No package, edge, process, message
kind, channel, command or store column changed.

**A wait the run imposes is not a stall (REQ-MONITOR-117..119, REQ-ORCH-091, REQ-ORCH-092, REQ-ORCH-093, ADR-0060,
OQ-173).** `StallWatch.imposedWait` (`children/stall.ts`) holds a stall watch's evaluation off the silence while the run
holds the agent between two model steps: `resilientStep`'s backoff and suspended wait (`LadderDeps.imposedWait`) and a
compression's own model call (`runTurn`'s `compressing`), both through `TurnDeps.onImposedWait`, which `Run.turn` wires to
the root's watch and `execute` to each child's. Such a silence is logged as the wait it is (`stallImposedWaitLine`), and
the release restarts the silence. This repairs `a-provider-wait-or-a-compression-is-counted-as-a-stall.md`. The
**runtime view**'s stall-watch paragraph says so. No package, edge, process, message kind, channel, command or store
column changed.

**The run host's shutdown ends the setup, and a step's termination reaches what it started (REQ-WORKSPACE-092/109,
ADR-0035, ADR-0064).** On POSIX each code-intelligence setup step now leads a process group, and its ask and force-kill
go to the group. The run host's `shutdown` ends a setup under way with a 2 s grace (`McpHost.endSetup`) before it exits.
The initialization coordinator says a cancellation undelivered at a quit at `info`, reading `QuitState`. See the process
view, `mcp.setup` and `initialization.*`, and the runtime view's paragraph on the application's end; the 2 s grace
overrides REQ-MCP-099's 5 s at a close, the build's reading of OQ-172. This repairs
`an-orderly-quit-during-the-background-setup-warns-its-cancellation-could-not-be-delivered.md`. No package, edge,
process, message kind, channel, command or store column changed.

**Initialization is each window's own workspace's (REQ-WORKSPACE-013/102/105, PD-SHELL-001, ADR-0064).** The
`initialization.*` commands answer for the sending window's workspace. The coordinator keys every method by root and
publishes channel 12 to the windows holding that root (`MainWindows.holding`). Its setup port addresses the run host by
the run's own workspace identifier, and `config`'s registry tells an applicability predicate which workspace it is
judged for (`ApplicabilityContext`). See the process view, `mcp.setup`, `initialization.*` and channel 12. This repairs
`initialization-answers-for-the-last-opened-workspace-not-the-asking-window.md`. No package, edge, process, message
kind, channel, command or store column changed.

**Every task and phase id the engine assigns is 8 lowercase hexadecimal characters (REQ-CHAT-089, REQ-CHAT-040).**
`mintTodoId` (`run/todo.ts`) mints each, unique within the todo and, for a planner task, among the task ids the session's
iterations recorded: the first run's task (was `<session>:main:1`), a continue's (`continuedTaskId`, was
`<session>:continued:<n>`), a queued prompt's (`Run.consumeQueued`, was the prompt's UUID — the prompt is found by its
task's name and the `prompt_triggered` entry), a planner todo edit's added task (the id a request sends is no longer
recorded), an improvement run's tasks and phase (`Todo.seeded`, at the run's creation of its todo from main's plan; they were
the proposals' `imp_…` ids and no phase id — the proposal stays named in each task's payload), and a user's add to an
agent's or a child's todo (`editAgentTodo`, now minted against the document's ids). A planner phase gains an optional `id`
(`Phase.id`), minted where `Todo` creates the phase; the plan shows it (`projectPlannerTodo`), and an edit names a phase by
it or, for a phase an earlier build created with none, by its name. Records under the old forms read back unchanged.
This repairs `a-queued-prompts-task-id-is-not-eight-hex-characters.md`; `part-j-proof`'s queue scenario asserts it. The
**runtime view**'s loop diagram and §2 iteration paragraph say so. No package, edge, process, message kind, channel,
command or store column changed (the todo column's JSON gains the phase's `id`).

**A later run's teardown no longer re-arms the crash record's ring settle over an earlier parked run's rows
(REQ-MONITOR-105, REQ-MONITOR-228, REQ-SESSION-129, REQ-ORCH-153, REQ-ORCH-087, ADR-0024, OQ-170).** `Sessions` keeps, per
live session, every run of this process that parked without closing its tool ports (`Live.portsOpen`); a continue passes
`ownCallsMayRun` while any of them has its ports open, and a run leaves the set once it has closed them. Before, only the
session's current run was read. This repairs residual 2 of `a-parked-runs-call-that-never-returns-keeps-its-ring-row-running.md`,
which stays open for residuals 1 and 3 (OQ-170). The **runtime view**'s §2 crash paragraph says so. No package, edge,
process, message kind, channel, command or store column changed.

**One fact, one emitter in the application log (PD-MONITOR-002, live-run finding a71-9).** Main's `repository.read` and
`git.read` handlers no longer restate the workspace service's repository and Git-view lines, main's credentials ask no
longer writes "credentials leased: …" beside the run host's `LeaseReportLog`, and `runSetupSteps` no longer writes
"succeeded in N ms" beside the run host's step reporter. The **process view**'s application-log paragraph names each
fact's owner. This repairs `the-repository-git-view-and-setup-step-lines-are-each-logged-twice.md`. No package, edge,
process, message kind, channel, command or store column changed.

**A paused child cancelled while `session_end` runs fires no `child_completed` (REQ-HOOKS-076, REQ-HOOKS-081,
REQ-HOOKS-003, REQ-ORCH-133, OQ-154, R-067).** `Run`'s teardown calls `IterationChildren.endLifecycle` once it has awaited
the outside hooks (`childCompletionsSettled`) and before it fires `session_end`; from then `completedOutside` queues none,
so the user's cancel of one paused child, still accepted until the run has ended, ends it `cancelled` with no hook after
`session_end` — OQ-154's built reading, recorded there as its fifth path. The defect note
`a-child-cancelled-while-session-end-runs-fires-child-completed-after-it.md` stays open for the ruling. The **runtime
view**'s hooks paragraph says so. No package, edge, process, message kind, channel, command or store column changed.

**A child the explicit cancel's grace gave up on is counted (REQ-MONITOR-102, REQ-SESSION-092, REQ-SESSION-094,
REQ-SESSION-129, OQ-96, R-067).** `IterationChildren.closeGivenUpOn` answers the open calls of every child a stop's grace
gave up on that no rest left `paused` as cut off, naming no rest, and counts it from its record (`countGivenUpOn`), terminal
or not. `Run.turn` calls it after the explicit cancel's `outlast` gives up; `rest` calls it in its early return (which it
replaces) and after it pauses, for a child the user had already cancelled on its own. This repairs
`a-child-the-explicit-cancel-gave-up-on-never-counts-its-calls.md`. The **runtime view**'s §4 rest paragraph and its
`children` row say so. No package, edge, process, message kind, channel, command or store column changed.

**The MCP section prints only what the agent can call (REQ-MCP-062, REQ-ORCH-153).** While the plan gate held, the port's MCP
loop withheld every server tool from the callable map and the listing, and the section, rendered from the surface the loop
was given, still printed it; a tool dropped for colliding with a native name was printed the same way. `ready()` now renders
the section, and draws the grant, from the surface narrowed to the tools that joined the callable map. Approval launches a
new run whose ports are built with the gate released (pinned in `run/plan-gate.test.ts`). This repairs
`an-mcp-tool-withheld-at-the-plan-gate-is-still-printed-in-the-prompt.md`; the **runtime view**'s MCP surface says so. No
package, edge, process, message kind, channel, command or store column changed.

**The run-level agent is drawn as the latest root's persona, not the first root's (REQ-MONITOR-060/069, PD-ORCH-003,
OQ-97).** The renderer's `entryOf` named the run-level agent, and chose the declared tools standing in for its chips, its
model and its reasoning, from the transcript's first agent row no child carries, while its chips were marked from the
latest root's history. It now hands to `packages/ui`'s new `entryRole`: while a run is live, the persona its root runs as,
`SessionRecord.entryPersona` (new, from `Run.entryPersona`; null with no live run), so the name is the root's from the run's
start, before that root has written a row; at rest, the last row a root authored of any kind a turn writes under its
agent's name (`agent`, `tool`, `thinking`, `diff`), a row named for one of `SessionRecord.entryRoots` preferred. (The first
repair read the last `agent` row alone, and a live root whose first steps were tool calls was drawn as the root before it:
the verifier's finding.) This repairs
`after-an-entry-persona-switch-the-run-level-agent-is-drawn-as-the-first-roots-persona.md`; the **runtime view**'s
`entryTools` paragraph says so, and the reading is recorded beside OQ-97. `SessionRecord` gains one nullable field; no
package, edge, process, message kind, channel, command or store column changed.

**A grant the controls left empty of native tools is drawn as none, not as the declared tools (REQ-MONITOR-049/060,
REQ-TOOLS-006, REQ-MCP-065).** `recordChildGrant` adds `recorded: true` to the `granted_mcp` object it writes, and the
projection carries it as the new `AgentRecord.grantRecorded` (a contract field); `resolvedTools` lets the declared tools
stand in only where no grant was recorded. A row without the marker — the spawn's, and every row written before
2026-10-01 — keeps the old reading, `[]` as no grant recorded. This repairs
`a-grant-the-controls-left-empty-reads-as-no-grant-recorded.md`; the **runtime view**'s `AgentRecord` passage and its
`children` row say so. No package, edge, process, message kind, channel, command or store column changed.

**A child's row records the grant its port put in force, not its persona's declared tools (REQ-MCP-065, REQ-TOOLS-006,
REQ-MCP-114).** The spawn wrote `children.granted_tools` from the persona's declared tools and `granted_mcp` from its MCP
surface before any control, so a tool `coordinator_only`, `read_only`, `tool_restrictions`, the `restricted` preset or the
plan gate removed was recorded as granted. The spawn now writes neither, and the child's execution records the port's
`ToolPort.grant` once the port is ready (`ChildLedger.recordGrant` → `SessionWriter.recordChildGrant`, a `save`
republished; `McpHost.evidenceFor` and `Persona.mcpEvidence` removed for the run host's `grantEvidence`). The recording is
started beside the child's first turn, not ahead of it, so the payload is in the conversation record while readiness is
pending. This repairs `a-childs-recorded-grant-is-its-declared-tools-not-the-narrowed-set.md`; the **runtime view**'s MCP
surface and its `children` row say so, and ADR-0034's evidence passages are corrected in place. No package, edge, process,
message kind, channel, command or store column changed.

**A setup step reads in REQ-WORKSPACE-091/092's words (ADR-0064, OQ-175).** `McpSetupStep` gained three optional facts
set by the run host's `runSetupSteps` — `skipped`, `output` and `startError` — and the initialization coordinator writes the
requirements' fixed sentences and the output's last 400 bytes from them, the MCP category keeping the run host's `detail`
(process view, `mcp.setup`). This repairs `the-other-setup-step-details-are-not-in-req-workspace-091-092s-words.md`. No
package, edge, process, message kind, channel, command or store column changed.

**A setup start the run host never answers fails in REQ-WORKSPACE-093's words (REQ-WORKSPACE-084/093/103, OQ-169, ADR-0064).**
The initialization coordinator catches a `setup.start()` that rejects and reports it as a retryable failure in this
domain's summary rather than as a task with no outcome (process view, `initialization.*`). This repairs
`a-setup-start-the-run-host-never-answers-is-reported-as-a-task-with-no-outcome.md`. No package, edge, process, message
kind, channel, command or store column changed.

**A setup whose finished status never arrives still ends (REQ-WORKSPACE-084/109, OQ-169, ADR-0064).** Main tells the
initialization coordinator when the run host exits (`onRunHostExit`), and a follow is bounded by the stage budgets plus
REQ-WORKSPACE-092's 5 s each (`SETUP_FOLLOW_BOUND_MS`); either ends it as a retryable failure and the next setup's turn
comes (process view, `initialization.*`). This repairs
`nothing-bounds-the-wait-of-a-setup-queued-behind-one-that-never-finishes.md`. No package, edge, process, message kind,
channel, command or store column changed.

**A closed workspace's failed resolution raises no banner (REQ-WORKSPACE-013/102, OQ-141, ADR-0064).** The initialization
coordinator's resolution, failing after its workspace was closed, says so in the log at info level and raises no
"Project setup could not be checked" banner, as `publish` already showed nothing of it (process view, `initialization.*`).
This repairs `a-closed-workspaces-resolution-can-still-raise-the-resolution-failed-banner.md`. No package, edge, process,
message kind, channel, command or store column changed.

**A stopped setup step reads in REQ-WORKSPACE-092's words (ADR-0064, R-067).** `McpSetupStep` gained an optional `stopped`
(`cancelled` or `budget`) set by the run host's `runSetupSteps`; the initialization coordinator writes the requirement's two
sentences from it and the MCP category keeps the run host's `detail` (process view, `mcp.setup`).

**A refused setup start is a retryable failure, not "not a local launch" (REQ-WORKSPACE-093/094, ADR-0064, R-067).** Main's
setup port carries the run host's refusal code with its words, and the initialization coordinator keeps REQ-WORKSPACE-094's
non-retryable words for the `unavailable` status alone (process view, `mcp.setup`; runtime view, the project setup; OQ-167).

**A child the stale settle ends, or a plan cycle's child a crash ends, is counted and its cut rows settle (REQ-MONITOR-102,
REQ-SESSION-129, REQ-ORCH-053, OQ-96, R-067).** `recordCutChild` (`run/crash.ts`) answers one child's open calls and adds
the calls its record holds to the session total. `recordPlanRootCrash` runs it for the plan cycle's unfinished children,
and `settleStaleChildren` runs it for each child before the `cancelled` move. This repairs
`a-child-the-stale-settle-cancels-never-counts-its-calls-and-keeps-its-cut-rows-running.md`. The **runtime view**'s crash
paragraph and its launch sequence say so. No package, edge, process, message kind, channel, command or store column changed.

**A child cancelled outside its execution is torn down (REQ-ORCH-098, REQ-ORCH-133, REQ-ORCH-053, PD-ORCH-005 clauses 6
and 16, OQ-152, R-067).** The user's cancel of one child and its live descendants, the cancel of a paused child at rest,
"continue without them", the crash record of an accepted cancel and the stale-child settle each write `child_end`,
`child_result` and `child_conversation_closed` after the report they store (`writeCancelledTeardown`). `writeTeardown`
moved from `children/orchestration.ts` to `children/ledger.ts`, beside `storeChildReport`, and stamps its `child_end` with
the writer's clock (`SessionWriter.wall`, a new read-only accessor). This repairs
`a-child-cancelled-outside-its-execution-gets-no-teardown-timeline-entries.md`. The **runtime view**'s "A child settled
without its turn" paragraph says so. No package, edge, process, message kind, channel, command or store column changed.

**A plan cycle's chips after an iteration read the plan cycle root's history (REQ-MONITOR-060, REQ-MONITOR-069,
REQ-ORCH-153, PD-ORCH-003).** With no run live and an iteration recorded, `entryToolsOf` reads the tracker under the latest
plan cycle root's persona when that root opened after the latest iteration (`plan_roots`, store v30), and under the
iteration root's otherwise. This repairs `a-plan-cycle-after-an-iteration-reads-the-tool-history-of-the-iterations-root.md`.
The **runtime view**'s `entryTools` paragraph says so. No package, edge, process, message kind, channel, command or store
column changed.

**A todo edit at rest and the quit's terminal record hold the lock (ADR-0005, REQ-EVENTS-098, REQ-CHAT-090, PD-ORCH-005
clause 10).** `editStoredTodo` claims through `claimHold` before it writes and is refused `session_locked` (REQ-SESSION-048's
words) or `store_failed` with nothing written; `closeAll`'s quit record of a resting session's background sessions
(`recordQuitTerminals`) claims the same way and records nothing of a session another live process holds. This repairs
`a-todo-edit-at-rest-and-the-quits-terminal-record-write-with-no-lock.md`. The **runtime view**'s §6 lock paragraph, the
`announceShutdown` control row and the `session_locks` row, and the **state-ownership view**'s session-lock row say so. No
package, edge, process, message kind, channel, command or store column changed.

**A row that grows is measured at the commit, before it is painted (PD-CHAT-003, REQ-CHAT-058, ADR-0045, R-067).** A row whose
content changed was placed by the height its identity drew last until the observer's delivery rendered a frame later, and a
row that grew was painted through the row beneath it. The pane now reads every bound slot with no measurement of its present
key after the commit and renders again inside it when the height differs (`measureAtCommit`), and a size that changes under an
unchanged key, with no commit, is rendered synchronously from the observer's delivery, before the paint (fix round 1). This repairs
`a-row-that-grows-is-drawn-through-the-row-beneath-it-until-it-is-measured-again.md` (acceptance A37); the **runtime view**'s
"What paints it" says so. No package, edge, process, message kind, channel, command or store column changed.

**The transcript pool counts its capacity in the shortest row a slot holds (REQ-CHAT-165, PD-CHAT-003, ADR-0045, R-067).**
The 30 px unit was taller than a one-line system notice inside a block (23.8 px), so a tall viewport of them inside `H_max`
was blank below the 154th slot. `SHORTEST_ROW_HEIGHT` (20 px) makes the pool 226 slots, and `visibleRange` sheds its
overscan before a visible row. This repairs `the-pool-capacity-assumes-no-row-is-shorter-than-thirty-pixels.md` (acceptance
A38); the **runtime view**'s "What paints it" says so. No package, edge, process, message kind, channel, command or store
column changed.

**A confirmed run cancel is shown cancelling on every surface of the window that sent it (REQ-MONITOR-127/130/296, OQ-165,
R-067).** The renderer's `cancelRun` lays a run overlay (`cancel-overlay.ts`, `beginRun`) over the window's record before it
sends the reserved run id's `cancelAgent`: the session's status reads `cancelling` in the run header, the composer, the
status strip, the Mission view's subtitle and run row, and a persona window's run instance (its state label and tab
tooltip, `agentStateLabel`: the agent vocabulary has no `cancelling`, and as first built the window read `running`
throughout — corrected at the second verification). A refusal removes it; an acceptance keeps it
over the run's active records until its first record at rest, because the engine writes no `cancelling` for the explicit
cancel. That end is the first record of the session at rest the window takes after the confirmation (`witness`), not the
run's `runStartedAt`, which the next run's pre-flight still carries until the engine writes its own (corrected at the
verification: keyed on it alone, the next run read `Cancelling` through its pre-flight), or the first record of another
session it takes. Until then only the Workspace set anything — its stop button's "Force stop" — and no surface read `cancelling`. This
repairs `the-mission-view-and-a-persona-window-do-not-show-a-confirmed-run-cancel-as-cancelling.md` (acceptance A35). The
**runtime view**'s `cancelAgent` row and the **state ownership** view's optimistic-cancel row say so. No package, edge,
process, message kind, channel, command or store column changed.

**The run-level agent's tool-call count is its own while its turn runs (REQ-MONITOR-044/052, R-067).** The surfaces derived
it as the session's total less the children's, and a root's calls join the total only when its turn returns, so the meta
line read `0 tool calls` beside the root's used chips. `SessionRecord.entryToolCalls` now carries it: the roots' share of
the persisted total plus the live root's calls not yet counted (`entryToolCallsOf`, `Run.entryUncountedToolCalls`) — the
agent's own count, where REQ-MONITOR-101 gives the synthetic root the run's aggregate; **OQ-159** asks which, open. This
repairs `the-run-level-agents-tool-call-count-reads-zero-while-its-turn-runs.md` (acceptance A20). The **runtime view**'s §3
entry-record paragraph and the **state-ownership view**'s tool-call row say so. One `SessionRecord` field was added on the
existing snapshot channel; no package, edge, process, message kind, channel, command or store column changed.

**A plan cycle's root is recorded for good when it starts (REQ-MONITOR-044/052/069, REQ-LIBRARY-093/099, REQ-ORCH-153,
R-067).** A plan cycle has no `iterations` row, so the session named its root through its live run and, after a park or an
end, through its publishes alone; one that only read an artifact was no agent's, and the run-level agent lost that received
link at the gate. `plan_roots` (store **v30**) records each plan cycle's root — task id, canonical name, the name its rows
carry — in `SessionWriter.openPlanRoot`'s transaction, never released, and `entryRootsOf` names it from there. This repairs
`a-plan-cycles-root-that-publishes-nothing-is-named-only-while-its-run-is-live.md` (acceptance A22). The **runtime view**'s
§3 `entryRoots` paragraph, its §7 heading (the store is now v30) and a new §7 `plan_roots` row, and the **state-ownership
view**'s new plan-root row, say so. One table was added (store v30); no package, edge, process, message kind, channel or
command changed.

**The design Tag's kinds are the language's tones, and StatusDot paints its state (acceptance A40, R-067).** `Tag`
takes the design Tag's seven kinds (`TAG_KINDS`: `accent`, `neutral`, `outline`, `run`, `wait`, `done`, `fail`) and joins a
caller's class to `tag tag-<kind>` instead of letting it replace them; every caller names its tone by `kind`, and
`tools/check-ui-language.mjs` refuses a Tag class that spells `tag` or a tone. `StatusDot` takes the design StatusDot's
states (`STATUS_DOT_STATES`) and writes `data-state`, which `shell.css` paints at `.status-dot`'s own specificity. This
repairs `the-design-tags-kinds-name-classes-the-adopted-stylesheet-does-not-define.md`. The **component view**'s
`ui/design-system` section says so. No package, edge, process, message kind, channel, command or store column changed.

**A child's name is never a root's (REQ-ORCH-044, OQ-158, acceptance A23, R-067).** `ChildLedger.spawn` keeps every child,
at every depth, off its root's canonical name and entry persona and off every recorded root's two names
(`recordedRootNames`), which the surfaces give the run-level agent; only the root's direct children were kept off its
canonical name before. This repairs `a-child-named-like-a-root-is-presented-as-the-run-level-agent-too.md`. The **runtime
view**'s §4 says so. No package, edge, process, message kind, channel, command or store column changed.

**A queued prompt's task is named "Queued Prompt: <id>" (REQ-CHAT-040, REQ-ORCH-071, OQ-117, R-067).** A planner todo
task carries an optional `name` beside its text (`run/todo.ts`), and `consumeQueued` names a queued prompt's task
`Queued Prompt: <first 8 characters of the prompt id>` with the prompt as its text. The pane and the handoff's todo list
(REQ-SESSION-115's display titles) draw the name (`taskTitle`), and so does the plan gate's implied-task list
(`planTodoLines` in `packages/ui/src/PlanGate.tsx`, which reads the stored todo itself), the compression's todo lines carry the name and then the
content (`taskLine`), and a rename renames the name. This repairs
`a-queued-prompts-task-is-not-named-queued-prompt.md` (acceptance A28). The **runtime view**'s iteration-boundary diagram
says so. No package, edge, process, message kind, channel, command or store column changed; the todo document gains an
optional field inside its existing column.

**The fallbacks are named by REQ-ORCH-139's vocabulary, and the vocabulary is checked (REQ-ORCH-139, REQ-NOTIFY-090,
OQ-157, R-067).** The ladder's same-tier change writes `quota_fallback_model` and the `quota_fallback` issue, its
unresponsive-model fallback `llm_unresponsive` (entry and issue), and the children's hard-timeout retry `fallback_model`
and the `timeout_fallback` issue, where they wrote `model_fallback`, `unresponsive_model_fallback`/`unresponsive_model`
and `child_timeout_fallback`. `tools/check-timeline-vocabulary.mjs`, in `pnpm lint`, fails on a timeline name in no
vocabulary; the names the product writes that no list has are held there by OQ-157. This partly repairs
`the-run-writes-timeline-events-outside-its-closed-vocabulary.md` (acceptance A29). The **runtime view**'s ladder paragraph
and its `timeline` row say so. No package, edge, process, message kind, channel, command or store column changed.

**A crash settles its cut call's ring row (REQ-SESSION-129, REQ-MONITOR-105, ADR-0024, R-067).** An orderly end settles
every open `tool_calls` row when the run's ports close; a crash closes none, so after the crash record settled a call's
transcript row its ring row stayed `running` for good. `recordCrash` now settles every ring row still `running`
(`settleDeadToolCalls`) through `SessionWriter.settleToolCall`, `failed` with the crash's statement and a NULL duration
(`ToolCallSettle.elapsed_ms` admits null for this case) — except at a continue after a run of this process that parked
without closing its tool ports (`Run.closedItsPorts`), whose call may still be under way. This repairs
`a-crash-leaves-its-cut-calls-ring-row-running-after-the-repair.md` (acceptance A30), and corrects ADR-0024's first-execution
claim that such a row "needs no repair" in place. The **runtime view**'s §2 crash paragraph and its §7 rings row say so. No
package, edge, process, message kind, channel, command or column changed.

**A plan cycle's root calls before a crash reach the session total (REQ-MONITOR-102, REQ-ORCH-153, R-067).** A plan cycle
has no `iterations` row, so the crash record never reached its root. `sessions.plan_root_task_id` / `plan_root_persona`
(store **v29**) name the plan cycle's root while its turn runs and none of its calls is counted: `Run.turn` records it when
the plan cycle starts (`SessionWriter.openPlanRoot`) and releases it in the transaction that adds its calls to the total
(`countToolCalls`'s `planRoot`), or with none counted when its turn raises. `recordCrash` answers the open calls of one still
recorded and adds its record's calls (`recordPlanRootCrash`). This repairs
`a-plan-cycles-root-calls-before-a-crash-never-reach-the-session-total.md` (acceptance A19). The **runtime view**'s §2 crash
paragraph, its §7 `sessions` row and its §7 heading (the store is now v29), and the **state-ownership view**'s tool-call
row, say so. Two `sessions` columns were added (store v29); no package, edge, process, message kind, channel or command
changed.

**The run-level agent's tool history at a plan gate no iteration precedes (REQ-MONITOR-060, REQ-MONITOR-069,
REQ-ORCH-153, acceptance A21, R-067).** With no run live and no iteration recorded, `entryToolsOf` reads the run-level
agent's history under every name the tracker holds that is no child's (`AgentActivity.calledToolsWhere`): only a root or
a child dispatches a call, and before any iteration every root was a plan cycle's, which no row names. This repairs
`the-run-level-agents-tool-history-is-empty-at-a-plan-gate-no-iteration-precedes.md`. The **runtime view**'s
`entryTools` paragraph says so. No package, edge, process, message kind, channel, command or store column changed.

**A write through a loaded session from outside a run holds the lock (ADR-0005, REQ-EVENTS-098, REQ-SESSION-060,
REQ-GIT-094, acceptance A14, R-067).** `Sessions.withWriter`'s live branch — the repair, the safety checkpoint and the
restore's outcome for a session loaded here — writes under the lock `claimHold` gives (kept, or taken with the one reap
and given back) and answers `lock-held` with nothing written while another live process holds it. This repairs
`a-write-through-a-loaded-sessions-writer-outside-a-run-claims-no-lock.md`. The **runtime view**'s §6 lock paragraphs, §6a
and the `session_locks` row, and the **state-ownership view**'s session-lock row say so. No package, edge, process,
message kind, channel, command or store column changed.

**A root steer is announced under the root that will take it (REQ-MONITOR-133/134, PD-ORCH-005 clause 4, OQ-97, acceptance
A24, R-067).** `Run.steer` names a root steer by `Run.rootSteerName`: `rootName` while the current root can still step, the
run's persona once its execution is over (`rootDone`, set as each root's turn settles unless a rest leaves it `paused`), so a steer submitted after a root
resumed as the entry role finishes is announced for the fresh root that injects it. Each pending steer keeps the name it
was announced under, which `reportUndeliveredSteering` repeats. This repairs
`a-root-steer-after-a-resumed-iteration-closes-is-announced-under-the-resumed-roots-name.md`. The **runtime view**'s §5
steer row says so. No package, edge, process, message kind, channel, command or store column changed.

**A root whose turn raises counts its calls (REQ-MONITOR-102, acceptance A18, R-067).** `Run.turn`'s `finally` counts a root
whose turn never returned — raised as well as given up on — from its record, less what the record held when the execution
began (`recordedAtStart`), once its open calls are answered; a raise that no rest paused has its open call answered as cut
off, naming no rest (OQ-96), as the explicit cancel's give-up already did. This repairs
`a-root-whose-turn-raises-never-counts-its-calls.md`. The **runtime view**'s §7 `iterations` row and the **state-ownership
view**'s tool-call row say so. No package, edge, process, message kind, channel, command or store column changed.

**The compressing model reads the history it replaces (REQ-MONITOR-082, REQ-MONITOR-084, REQ-ORCH-110, OQ-156, R-067).**
`compress` reads `compressorTranscript` (`run/compression.ts`) instead of the report pass's `transcriptText`, which is
removed: each event whole, the slice whole up to the compressing model's own threshold at `chars_per_token`
(`CompressorDeps.inputTokens`, set by `Run.compressionFor`), its start and most recent part past it. This repairs
`the-compressor-reads-only-the-head-of-what-it-compresses.md` (acceptance A12). The **runtime view**'s compression
paragraph says so. No package, edge, process, message kind, channel, command or store column changed.

**A child waiting on its own children is not reported stalled (REQ-ORCH-089, REQ-MONITOR-119, REQ-NOTIFY-112, OQ-155,
R-067).** `StallWatch.betweenTurns` (`children/stall.ts`), called by `execute`'s `turn` closure as each turn settles,
holds the watch's evaluation off the silence until the run starts the child's next turn, and `execute` calls it as the
watch is armed for an execution resumed into waiting (PD-ORCH-005 clause 4; added 2026-09-30, the first reading having
missed that path), so the wait inside `runWithChildren` writes no `stall` issue and no warning. This repairs
`a-child-waiting-on-its-own-children-is-reported-stalled.md` (acceptance A7). The **runtime view**'s stall-watch paragraph
says so. No package, edge, process, message kind, channel, command or store column changed.

**A child settled outside its execution fires `child_completed` (REQ-HOOKS-003, REQ-ORCH-048, REQ-ORCH-052,
REQ-ORCH-053, REQ-ORCH-133, PD-ORCH-005 clause 6, R-067).** The cascade, the finalize sweep and the user's cancel of one
child now fire it through `IterationChildren.completedOutside`, in line, and the run waits for them after the sweep
(`completionsSettled`); the stale settle's and the decline's fire after the run's `session_start`
(`RunDeps.settledBeforeStart`, `Run.childCompleted`). An outside hook's fields are taken as the scheduler is told, not
when a queued hook starts (the second verification). `beginSettle`'s own-entry guard keeps a followed-up child settling
to a parent's `settlesOf` until the later end's hook is done, corrected in §4 from "fires the hook once for each end" (the
third verification). A rest's wait on the executions looks again until none is left (`IterationChildren.drained`), and
the run waits for the outside hooks once more before `session_end` (`Run.childCompletionsSettled`), corrected in §4 from
"awaited as executions" over a snapshot (the fourth verification). Three paths outside a run's hooks fire none, raised as OQ-154. This
repairs `a-child-settled-outside-its-execution-fires-no-child-completed-hook.md`. The **runtime view**'s §4 gains the
paragraph after the one on a settle's hook. No package, edge, process, message kind, channel, command or store column
changed.

**A report's edited files are the writes that landed (REQ-ORCH-108, REQ-ORCH-109, PD-TOOLS-006, OQ-111, R-067).**
`editedFilesFrom` now skips a write call the record answers as refused — a sibling's claim, the permission gate or a
pre-tool hook refusing it, a `haet_edit` whose find text matched nothing — or as cut before it started, and the
summariser's own list cannot bring such a path back. A write cut off while under way (the pause's tool deadline, the
stop's abort, a crash) is still listed, since it may have landed: `run/interruption.ts`'s `ranBeforeItWasCut` reads the
statement the turn records for it. The report's `edited_files`, the fallback's "Files touched" and the facts the pass is told never to deny all
read it. This repairs `a-reports-edited-files-counts-refused-writes.md`. The **runtime view**'s §4 report sentence says
so. No package, edge, process, message kind, channel, command or store column changed.

**A stalled agent is shown stalled; the root is watched; a stall evaluation lands a steer (REQ-ORCH-089, REQ-MONITOR-117..122,
REQ-MONITOR-135, R-067).** `AgentRecord.stalledSeconds` and `SessionRecord.entryStalledSeconds` carry each stall watch's
figure, kept in `AgentActivity` and republished by `ProjectionOwner.refreshRecord` when it changes; the agent trees, the
Mission table, the persona window and the inspector draw it. `Run.turn` arms a `StallWatch` for the root. An evaluation wakes
an agent waiting on its own children for a pending steer (`IterationChildren.wakeForSteering`, `ChildrenDeps.steeringPending`).
This repairs `a-stalled-child-is-never-shown-stalled.md` (acceptance A6; OQ-153). The **runtime view**'s stall-watch
paragraph and its `entryTools` paragraph say so. No package, edge, process, message kind, channel, command or store column
changed; the snapshot channel's `SessionRecord` gained the two fields.

**A child the scheduler settles is torn down (REQ-ORCH-098, REQ-ORCH-048, REQ-ORCH-052, R-067).** `Scheduler.cascadeBlocked`
and `Scheduler.finalizeIncomplete` call `SchedulerDeps.teardown`, which `IterationChildren` answers with `writeTeardown`
(`children/orchestration.ts`; in `children/ledger.ts` since 2026-10-01), so a blocked child and one the finalize sweep cancels get `child_end`, `child_result` and
`child_conversation_closed` as a settled execution's child does (OQ-152). This repairs
`a-child-that-never-started-gets-no-teardown-timeline-entries.md` (acceptance A16). The **runtime view**'s "A child settled
without its turn" paragraph says so. No package, edge, process, message kind, channel, command or store column changed.

**`delegate`'s admission resolves an alias on the built-in table's path (REQ-ORCH-034, REQ-ORCH-153, PD-TOOLS-006,
R-067).** `personaOf` (`children/orchestration.ts`) resolves through `resolveRole` where no persona catalogue is configured,
as `ChildLedger.spawn` does, so the plan gate's admission refusal, the grant and the write-scope refusal read the role the
ledger will spawn. This repairs `delegate-reads-no-alias-on-the-built-in-table.md` (acceptance A27). The **runtime view**'s
plan-gate paragraph says so. No package, edge, process, message kind, channel, command or store column changed.

**A child's attachments and inherited-context block are stored with its record (REQ-TOOLS-154, REQ-LIBRARY-098,
REQ-TOOLS-152, PD-ORCH-005, R-067).** Store **v28** appends `children.attach_artifacts` and
`children.inherited_context_block`, written by `ChildLedger.spawn`; `IterationChildren`'s two in-memory maps are gone, and
`execute`'s and `startingPayload`'s payloads read the row, so a child resumed in a later run carries both into its
REQ-ORCH-088 retry, with REQ-ORCH-047's prior-agent-context block rendered again. This repairs
`a-resumed-childs-retry-payload-loses-its-attachments-and-inherited-context.md` (acceptance A25). The **runtime view**'s
inherited-context paragraph and §7 `children` row, and the **state-ownership view**'s row, say so. No package, edge,
process, message kind, channel or command changed.

**The per-model cap counts every child in the process (REQ-CONFIG-094, REQ-MONITOR-020, REQ-ORCH-050, acceptance A13,
R-067).** `ChildLedger.slotsInUse` counted one iteration's children, so two sessions under way in one run host could each
fill a `max_parallel`. `Sessions` now holds a `ModelSlots` each session joins while a run of it is under way or while it
rests with a paused child keeping its place (PD-ORCH-005 clause 4, OQ-149); the ledger adds the other sessions' slots to
its own, and a child's end, a run's end, a decline or a cancel at rest wakes the other sessions' runs. This repairs
`the-per-model-cap-counts-only-one-iterations-children.md`. The **runtime view**'s §4 and a **state-ownership view** row
say so; OQ-148 asks the release order across sessions, OQ-150 whether one key in two workspaces is one entry. No package, edge, process, message kind, channel, command or store
column changed.

**A child the stop's grace gave up on is counted at the rest (REQ-MONITOR-102, REQ-SESSION-092, PD-ORCH-005 clause 6,
R-067).** `IterationChildren.outlast` now keeps which children it gave up on (`givenUpOn`), and `rest` counts each one's
calls from its record once its open calls are answered (`countGivenUpOn`, through the run's `countToolCalls`). A continue
that declines it therefore loses none of its calls. So does a rest that the explicit cancel reaches while it waits: it
pauses nothing, but first answers such a child's open calls as cut off, naming no rest (OQ-96), and counts it before the
child ends `cancelled` (found by the repair's verifier). This repairs
`a-child-the-stops-grace-gave-up-on-and-the-continue-declined-never-counts-its-calls.md`. A child given up on by the
explicit cancel's own `outlast`, which no rest follows, or already terminal when given up on, was still not counted
(`a-child-the-explicit-cancel-gave-up-on-never-counts-its-calls.md`, repaired 2026-10-01: see the entry above). The **runtime view**'s §4 rest
paragraph and its `children` row say so. No package, edge, process, message kind, channel, command or store column changed.

**A settle tells the scheduler whatever raised before it (REQ-ORCH-048, REQ-ORCH-052, REQ-TOOLS-156, REQ-HOOKS-079,
R-067).** Both settles of a child — the end of `IterationChildren.execute` and `settleRaised` — now end through
`afterTerminal`, which writes the teardown, runs the `child_completed` hook and then calls `scheduler.settled` in a
`finally`. A raise out of the hook port is a warning. This repairs
`a-raise-after-a-childs-terminal-transition-never-releases-its-parent.md`. The **runtime view**'s §4 paragraph on the
settle's hook says so. No package, edge, process, message kind, channel, command or store column changed.

**The post-run improvement capture never rejects (REQ-ORCH-137, REQ-LIBRARY-032, R-067).** `onRunResult`'s detached
closure moved into `captureAfterRun` (`run-host/improvement-capture.ts`): a skip-list stop reason yields no job before main
is asked for the history, the store is re-read after that ask, and a store closed meanwhile or a throwing capture yields
no job with a log line rather than an unhandled rejection. This repairs
`an-improvement-capture-racing-the-quit-reads-a-closed-store-and-rejects-unhandled.md`. The **process view**'s
improvement-analyst paragraph says so. No package, edge, process, message kind, channel, command or store column changed.

**A persona's `tool_restrictions` narrow its grant (REQ-TOOLS-006 (4), REQ-CONFIG-103, OQ-145, R-067).** The engine
`Persona` carries the map (`toolRestrictions`), and every child's `ToolPortContext` names its delegating persona
(`parentPersona`, from `IterationChildren.parentPersonaOf`). The run host passes the lists `toolRestrictionsFor` reads to the
registry's fourth stage, which now takes allowed-tool lists, and takes an MCP tool no list names off the surface
before its executors and its prompt section are drawn from it (REQ-MCP-062). `writesFiles`
reads the same lists. The **seams view**'s §4 and the **runtime view**'s write-scopes paragraph say so. This repairs
[`a-personas-tool-restrictions-never-narrow-its-grant.md`](../../defects/fixed/a-personas-tool-restrictions-never-narrow-its-grant.md).
No package, edge, process, message kind, channel, command or store column changed.

**A session delete cascades to nineteen tables, and `sessions-proof` reads that from the schema (REQ-SESSION-166, PD-ORCH-005,
R-067).** The **runtime view**'s §6a delete said "the fifteen dependent tables"; v20's `plan_cycles` and v23–v24's
`iterations`, `agent_messages`, `agent_terminals` and `agent_fingerprints` make every table whose `session_id` references
`sessions` nineteen, with `delivery_runs` the one kept as a fact. The proof's count pin gave way to the shape
(`apps/desktop/scripts/lib/session-cascade.mjs`). This repairs [`sessions-proof-pins-sixteen-cascading-tables-where-the-store-has-twenty.md`](../../defects/fixed/sessions-proof-pins-sixteen-cascading-tables-where-the-store-has-twenty.md).
No package, edge, process, message kind, channel, command or store column changed.

**The initialization coordinator runs its setups one at a time (REQ-WORKSPACE-109, REQ-WORKSPACE-084, R-067).** The run
host holds one setup and its `mcp.setupStatus` carries no workspace, so `InitializationCoordinator` now starts a run's
`code-intelligence-setup` only once the setup before it has ended (`setupTurn`), and the one step sink is cleared only by
the follow that set it; a run's `finally` no longer clears it, and a follow drops its abort listener once its setup has
ended, so an earlier run's close or Cancel never reaches the next run's setup. This repairs
`a-closed-workspaces-run-can-clear-the-reopened-workspaces-setup-listener.md`. The **process view**'s
`initialization.*` paragraph says so. No package, edge, process, message kind, channel, command or store column changed.

**A workspace switch cancels the outgoing workspace's initialization run (REQ-WORKSPACE-013, R-067).** `MainWindows`
gained `workspaceClosed`, called once the last live main window holding a workspace has closed, and main answers it with
`InitializationCoordinator.close`, which nothing called before: the run is cancelled, nothing is recorded or published
for it, and a return to the root resolves again (REQ-WORKSPACE-102); a close landing while the setup's start request is
in flight is sent to the run host once the start answers. This repairs
`a-workspace-switch-never-cancels-the-outgoing-initialization-run.md`. The **process view**'s `initialization.*`
paragraph says so, and the **runtime view**'s `initialization:` bullet says a closed workspace's recordings are refused
inside their turn of the marker queue. The same rule for a close that is not a switch's is a reading, raised as OQ-141.
No package, edge, process, message kind, channel, command or store column changed.

**The update shape answers `extend` (REQ-CHAT-053, R-067).** `updateShape` in `ui/transcript/pool.ts` reads the
content of one row besides the keys — the last row before the update — so an extension of that row with rows appended
after it is `extend` rather than `append`; the first form's `extend` branch could not be reached. The pane still records
the shape on the element and branches on nothing. This repairs `the-update-shape-never-answers-extend.md`. The **runtime
view**'s step-5 row says so. No package, edge, process, message kind, channel, command or store column changed.

**A row not yet measured is not positioned short of what it draws, and a row on screen is measured (PD-CHAT-003, R-067).**
`estimateHeight` in `ui/transcript/pool.ts` builds the estimate from the parts of the row's box the stylesheet draws —
the row or block gap (`readHeight` hands it `places[at].blockStart`), the border, a user row's padding, a Markdown body's
block margins, one 19.5 px line per drawn line, an activity line laid out segment by segment — and errs long; the first
form of this repair counted the block gap alone, and a one-line agent message inside a block went on drawing 33.4 px into
30. `TranscriptPane.tsx` observes a slot again whenever it is bound under a measurement key it was not observed under
(`observeAgain`): a slot a scroll rebound to a row of its previous row's height used to keep the new row at its estimate.
This repairs `a-new-reasoning-row-is-drawn-through-the-row-beneath-it-until-its-first-measurement.md`. The **runtime
view**'s transcript paragraph says so. No package, edge, process, message kind, channel, command or store column changed.

**A failing layout contract is filed under `CONTRACT` in the evidence pack (R-067).** `ui-audit` builds each finding
through `apps/desktop/scripts/lib/audit-finding.mjs`, which spreads the measured detail first and moves a contract row's
own `kind` to `relation`, so `report.json`, the summary line and `ui-review`'s `manifest.json` (`deterministic.byKind`)
count a failing contract as `CONTRACT`; the manifest also carries `deterministic.contractsByRelation`. This repairs
`a-contract-finding-in-ui-audit-is-filed-under-its-relation-kind.md`. The **seams view**'s §8 step 6 says so. No
package, edge, process, message kind, channel, command or store column changed.

**A count's noun agrees with it everywhere, from one kernel helper (REQ-SHELL-044, R-067).** `countNoun` moved from
`ui/agents.ts` (which re-exports it) to `kernel/count-noun.ts`, since `providers`, `engine`, `agent-tools`, `contracts`,
`platform` and `workspace` cannot import `ui`; the sign-in messages, the checkpoint dialogs and notices, the run's
timeline and notices, the Library, Settings and the tool results the tool row draws now use it, as do the local
`plural` helpers it replaced. `tools/check-plural-markers.mjs`, a new step of `pnpm lint`, fails on a literal `(s)`
in a string the product can draw; log lines and four requirement-fixed tool results pass (OQ-138). This repairs
`a-literal-plural-marker-is-rendered-in-sign-in-notices.md`. The **component view**'s kernel box says so. No package,
edge, process, message kind, channel, command or store column changed.

**The driver's settled click (acceptance finding A3, 2026-10-06).** `driver.ts`'s `click` takes `settle`: the match is
measured, two of the renderer's frames begin, and it is measured again; it is pressed only when its box is unchanged and
the element at its centre is the match or inside it, and a one-shot capture `mousedown` listener then says what the press
met, a press that met something else being refused with it. `scripts/lib/driver.mjs`'s `clickLanded` presses again only
after such a refusal, and driver-proof's 13b and 13c open the persona window that way on the child's own row. This is
for `driver-proof-clicks-pop-out-at-a-box-the-notice-banner-moves.md`. The **process view**'s main row says so. No
package, edge, process, message kind, channel, command or store column changed.

**The driver addresses persona, approval and terminal windows (R-067).** `driver.ts` resolves a role selector —
`persona:<persona>`, `approval`, `terminal` — over `DriverDeps.auxiliary`, which main fills from each main window's
persona-window registry, open approval dialog and terminal window; `windows` lists them, `useWindow` and each op's own
`window` reach them (the per-request override, claimed since A4, is now read), and an unmatched selector is still
refused. This repairs `the-driver-cannot-address-persona-or-approval-windows.md`. The **process view**'s main row says
so. No package, edge, process, message kind, channel, command or store column changed.

**The driver's `quit` is the application's quit, a capture whose wait timed out ends the same way, and the driver's
shot waits for a presented frame (R-067).** `driver.ts`'s `quit` sends `app.quit()` — the close guards, then
`window-all-closed`'s `shutdown` — unless it names the immediate exit (`immediate`; `pnpm app:drive stop --crash`), and
its seam stays up until `will-quit`; `capture/probe.ts` ends a capture whose wait timed out through the new
`CaptureHost.quit` rather than `exitCleanly`; `screenshot` waits `PAINT_FRAMES` (four) of the renderer's frames before
`capturePage()`. This repairs `the-drivers-quit-skips-the-applications-shutdown.md` and
`the-drivers-shot-can-return-a-stale-frame.md`. The **process view**'s quit paragraph and main row, and the **runtime
view**'s application's-end paragraph, say so. No package, edge, process, message kind, channel, command or store column
changed.

**Every proof launch is bounded (R-067).** `package.mjs` launches the packaged application through
`scripts/lib/bounded-launch.mjs`'s `spawnBounded`, as every launch a proof script starts itself now does (but for the two
`scripts/lib/launch-sites.test.ts` names with their reasons), so the **component view**'s paragraph
on the modules `package.mjs` shares names that one too. No edge moves: a script reaching a script module under
`apps/desktop/scripts/`, outside the boundary rule. This repairs `proofs-launched-through-spawnsync-cannot-end-an-overrun-launch.md`.

**The run-start mode hint says what `plan` does and states a session's release (REQ-ORCH-152, REQ-CONFIG-320,
PD-ORCH-003, R-067).** The Settings Runtime category's hint no longer says the plan gate is not built: `runStartModeHint`
(`ui/settings/ConfigSettings.tsx`) says what `plan` does and, when the followed session's `SessionRecord.planReleased` is
true, that the session is released and that Plan first on the composer's chip re-arms it; the selector itself re-arms
nothing (OQ-137). This repairs `the-run-start-setting-says-the-plan-gate-is-not-built.md`. The **runtime view**'s
plan-gate paragraph says so. No package, edge, process, message kind, channel, command or store column changed.

**The Windows global configuration directory is REQ-CONFIG-001's `%LOCALAPPDATA%\rotaris\rotaris\` (R-067).**
`resolveUserDirs`'s `win32` case answered `rotaris\config` until now; the data directory stays the sibling `rotaris\data`
(D-04), and no earlier directory is adopted (REQ-STARTUP-145). The proof harness's `configDirFor` moved with it. This
repairs `the-windows-global-configuration-directory-is-not-the-one-req-config-001-spells.md`. The **process view**'s
diagram and files-on-disk table and the **state-ownership view**'s configuration rows spell the new directory, and the
process view says that on Windows it is also the directory the preference store's `Rotaris\Rotaris` root names. No
package, edge, process, message kind, channel, command or store column changed.

**A by-design tool removal is logged at `info`, and a persona's MCP lines once per spawn (REQ-TOOLS-006, PD-MONITOR-002,
R-067, live-run findings L14 and D7).** `ToolPortContext` gains `info` — the application log at `info` and the session
log at `INFO` — which `Sessions` fills on a start and a continuation; `createToolPort` logs a REQ-TOOLS-006 narrowing
control's removal through it and a REQ-TOOLS-004 prerequisite's through `warn`, as before. `McpHost.surfaceFor` keeps
what each persona's resolutions have written (`announced`, keyed without the reserved names), so the spawn evidence's
resolution and the port's no longer write the surface line and the grant count twice. This repairs
`coordinator-only-removals-are-logged-as-warnings.md` and `a-personas-mcp-lines-are-logged-twice-on-first-spawn.md`.
The **runtime view**'s MCP-surface paragraph and the **seams view**'s tool invariants say so. No package, edge, process,
message kind, channel, command or store column changed.

**The application log survives the loss of its reader (REQ-MONITOR-131, R-067).** Main's log writes through
`standardStreamWriter` (`main/app-log.ts`) instead of `console.log`: the stream's `error` event is listened for, and from
its first failure nothing more is written to it; standard error gets the same listener. A quit whose standard output
has been closed no longer loops on its own EPIPE. This repairs `a-quit-with-its-standard-output-closed-loops-on-its-own-epipe.md`.
The **process view**'s application-log paragraph says so. No package, edge, process, message kind, channel, command or
store column changed.

**A child main ended itself is not a loss in the application log (PD-MONITOR-002, R-067, live-run finding L13).** The
run host's `kill` that `endBeforeMain` sends goes through `ChildrenEndedByMain` (`main/exit.ts`), which records it by
service name, and the `child-process-gone` handler writes Electron's `killed` report of that end at `info`, saying main
ended it; every other end but `clean-exit` stays `error`. This repairs `an-orderly-quit-logs-the-run-host-gone-at-error.md`.
The **process view**'s application-log paragraph says so. No package, edge, process, message kind, channel, command or
store column changed.

**What is asked of a person in the quit's gap is held for the quit to withdraw (PD-ORCH-005 clause 9, R-067, OQ-132).**
`presenter.revoke` gains an optional `quitting`, which main sets from `QuitState`; the run host's `PresenterRegistry.quitting`
holds from such a revoke until a window registers. Meanwhile the gate holds an ask unshown in `pending_approvals` instead
of denying it headless, a present answered "not shown" is held too, `ask_questions` records its prompt pending, and
`PendingApprovals` and `PendingQuestions` arm an expiring budget again; the shutdown withdraws every one by `quit`. This
repairs `an-approval-asked-after-the-last-window-closes-is-denied.md`. The **sequences view**'s §2 (the diagram and a new
paragraph) and the **process view**'s message list say so. No package, edge, process, channel, command or store column
changed.

**A small non-zero cost renders as the floor `< 0.0001`, never as zero (ESC-42 ruled option (b) under R-067, 2026-09-29).**
`formatAmount` (`kernel/money.ts`) returns `AMOUNT_FLOOR` where REQ-PROVIDER-121's half-up rounding brings an amount
greater than zero to zero; `costLabelOf` is unchanged and every label takes the floor as its `<amount>`. This repairs
`a-cost-below-five-hundred-thousandths-renders-as-zero.md`. The **runtime view**'s §3 ("What a step costs") says so. No
package, edge, process, channel, message kind, command or store column changed.

**A retry the dispatch layer absorbs is written to the session log (OQ-110 ruled under R-067, 2026-09-29).** REQ-CONFIG-086's
`num_retries` stay the dispatch layer's, spent inside the model client before the ladder; the client's decorated fetch
now reports each retry as it is sent (`ModelRequest.onRetry`, with the status met and the delay waited on the monotonic
clock `AiSdkClientOptions` now takes), `DefaultAgentBackend` forwards it to `TurnSink.retried`, and the turn writes
`dispatchRetryLine` through the run's `warn` to the session log. This repairs `a-retry-the-dispatch-layer-absorbs-leaves-no-trace.md`.
An exhausted budget now reaches the ladder as the last attempt's error (`fromError` unwraps the SDK's `RetryError`), which
repairs `an-exhausted-dispatch-layer-hands-the-ladder-a-failure-it-cannot-classify.md`. The **runtime view**'s §3 (the ladder's paragraph) says so. No package, edge, process, channel, message kind, command or
store column changed.

**A follow-up by `session_id` resumes a settled child from its record (PD-ORCH-005 clause 22, PD-TOOLS-006 revision 3,
2026-09-29, R-067; OQ-131, raised as OQ-130 on its branch and renumbered at the merge).** `delegate` forwards `session_id`. `IterationChildren.followUp` refuses an id that is no
settled child of the caller, and waits for a cancelled child's execution to wind down. It re-claims the stored write
scope and answers a call left open. The writer's new `followUpChild` makes the one exit from a terminal state
(`isLegalFollowUp`), to `queued`, in one transaction with the follow-up's message in `agent_messages`; `StoreDal.reopenChild`
clears the completion time, the report and the observation, over existing columns. The scheduler starts the child, and
`execute` carries on from its record. The **runtime view** gains the follow-up paragraph beside the continuations one,
and its §7 rows for `children` and `agent_messages` name the new writer. The **state-ownership view**'s conversation-record
row names it as a writer and a reader. No package, edge, process, channel, message kind, command or store table changes,
and no migration is appended.

**An explicit cancel is durable across a crash (PD-ORCH-005 clause 3 with REQ-MONITOR-126, OQ-103's last question ruled
under R-067, 2026-09-29).** `iterations.cancel_accepted_at` (store **v27**, appended) is written the moment the reserved run
id's `cancelAgent` is accepted (`SessionWriter.recordCancelAccepted`), and by `Run.turn` for an iteration it opens after. An
open iteration carrying it is closed `cancelled` by the next repair or continue, its unfinished agents ended `cancelled`
(`recordCrash` → `recordAcceptedCancel`), never paused by a crash; `crashLeftOf` and `resumableOf` read it, the new
`cancelLeftOf` presents those agents `cancelled` meanwhile, and a continue is set up as the entry role; the run-level
agent (`runLevelAgent`) is presented `cancelled` and not live in REQ-CHAT-008's recovery state with nothing to resume.
The record writes no timeline word of its own (REQ-ORCH-139); its close is the vocabulary's `iteration.end`. This repairs
`a-crash-during-the-explicit-cancel-leaves-the-cancelled-run-resumable.md`. The **runtime view**'s §2 (the paragraph "An
explicit cancel the host died before carrying out"), §4 (the run-level agent) and §7 (`iterations`), and the
**state-ownership view**'s rest rows say so. One store column is added; no package, edge, process, channel, message kind or command changed.

**A confirmed cancel of one agent is shown at once (REQ-MONITOR-128/296, 2026-09-29, R-067; OQ-129).** The renderer's
`cancelAgent` lays a per-window overlay (`packages/ui/src/cancel-overlay.ts`, the store `cancelOverlays` in `shell.ts`)
over the session before it sends `cancelAgent`. The agent and every unfinished descendant show `cancelled` with an
activity line saying the user cancelled them. A refusal removes the overlay, and the first whole-session update the
replica takes after an acceptance overwrites it; the store numbers each record the replica takes (`witness`), so a
persona window's coalesced copy, up to 120 ms behind, keeps the overlay until its own later delivery. The Workspace, Mission and Overview roots read `useShownSession` and a persona window
`useCancelOverlaid`; the replica keeps its two writers. The **runtime view**'s `cancelAgent` row and the
**state-ownership view**'s volatile table name it. No package, edge, process, message kind, channel, command or store
table changes.

**The run-level agent owns every row, call and artifact its roots carry (REQ-MONITOR-071, REQ-CHAT-069, REQ-MONITOR-053,
REQ-MONITOR-060, REQ-MONITOR-044 with PD-ORCH-005 clause 4, OQ-97 and REQ-LIBRARY-093, 2026-09-29, R-067).**
`SessionRecord` gains `entryRoots`: each root of the session once, by the name its rows and calls carry and its canonical
name, every iteration's, then each root no iteration records that published — a plan cycle's, by its publish
(`StoreDal.rootPublishersOf`, a new read at every snapshot; found by the repair's fifth review, since the session lets go
of the run at the plan gate's park) — then the live run's (`entryRootsOf`, `Run.currentRoot`). The surfaces own a named row for the
run-level agent by the entry persona or a root's name (`ownRow`, shared by `rowsOf`, `scopedRows` and `followedAgent`),
and its artifact links by those or a root's canonical name; `Run.entryTools` reads the tracker under `rootName`. This
repairs `the-run-level-agent-is-known-by-its-entry-persona-alone.md`. The **runtime view**'s §3 paragraph on the entry
role's snapshot fields (`entryContext`, `entryTools`, `artifacts`) says so. No package, edge, process, channel, message
kind, command or store column changed.

**A steering prompt pending at a rest is kept (REQ-MONITOR-134 with PD-ORCH-005 clause 4, OQ-128, 2026-09-29, R-067).**
`Run.turn`'s rest delivers every prompt still pending for a `paused` agent with a record into that record, as the marked
message its next step would have injected, marked injected once (`deliverSteeringAtRest`); a child resumed `summarizing`
whose record ends on one resumes `running` (`IterationChildren.resumePaused`). Steering closes once no agent takes another
step — when the rest is recorded, when teardown begins, at the message-limit pause or at the plan-gate park (only a run
that parks: a plan cycle stopped, quit or failed ends in teardown) — so a later steer is refused; that close records what
is left as not delivered (`closeSteering`: a `steering_not_delivered` entry and a transcript line naming the end). This
repairs `a-steering-prompt-pending-at-a-rest-is-lost.md`. The **runtime view**'s §5 steer row says so. No package, edge,
process, channel, message kind or store column changed.

**A root resumed as the entry role keeps its rows' name (PD-ORCH-005 clauses 3 and 4, OQ-97, 2026-09-29, R-067).**
`Run.turn` names the root's rows, its tool port and its open calls by the persona its iteration was opened with
(`rootName`: `iterations.root_persona` for a resumed root), not by the persona the run is set up as, so a root resumed as
the entry role because its persona is no longer configured writes where `recordCrash` reads. This repairs
`a-root-resumed-under-a-fallback-persona-hides-its-rows-from-the-crash-record.md`. The **runtime view**'s §6 crash
paragraph says so. No package, edge, process, channel, message kind or store column changed.

**A delegated child is watched for a stall, and one that produced no output gets its corrective message
(REQ-ORCH-089, REQ-MONITOR-117..120, REQ-NOTIFY-111/112, 2026-09-29, R-067; OQ-127).** `children/stall.ts` is new in
`engine`. `TurnSink` gains an optional `event` for every streamed part, and `TurnDeps` gains `onModelEvent` and
`onToolStarted`, and `ConversationRecord` gains `everRecorded`, which a resumed child reads so that its one corrective
message stays one per task. The watch writes a `stall` issue at every stall evaluation; the wait on tools, the recovery
and the corrective message are session-log lines through the run's `warn`, since REQ-ORCH-139's vocabulary has no
timeline word for them (OQ-127). The **runtime view**'s §4 names it. No package, edge, process, channel,
command or store table changes.

**A child settled without its turn gets its report (REQ-ORCH-048 / REQ-ORCH-052 / REQ-ORCH-108, 2026-09-29, R-067).**
The scheduler's blocking cascade stores each blocked child's `blocked` report and artifact before its parent is told.
A child whose execution raises outside its turn, on either start path, is settled `failed` with its report by
`IterationChildren.executeSettling` and `settleRaised`, instead of being left `running`. So is a resumed child whose
record cannot be decoded. A settle's `child_completed` hook now runs in line (REQ-HOOKS-076/080). A parent takes a
child as ended only once its settle is done (`IterationChildren.settles`), and an agent does not return while one of
its children's settles still runs. Each wait looks again until none of its children is settling, since another can end
while it waits (`settlesOf`, the verifier's fifth round). So the hook comes before `iteration_end` and `session_end`.
The **runtime view**'s §4 names all three. No package, edge, process, channel, command or store table changes.

**The inspector shows the run-level agent's tools and every agent's artifact links (REQ-MONITOR-052/060/061/068/069,
live-run finding K1, R-067, 2026-09-29).** `SessionRecord` gains `entryTools` (the root port's resolution — a new optional
`ToolPort.resolvedTools` — and the tracker's history) and `artifacts` (the session's artifacts not superseded, a body-free
read per snapshot, `StoreDal.artifactLinksOf`); the config snapshot's role view gains `declaredTools`, by the rule
(`declaredToolsOf`) the run host's persona resolver applies, which moved with the built-in roles' tool declarations to
`contracts/src/roles.ts`. A link in the main window deep-links to the Library (`openLibrary('artifacts', id)`), which opens
the artifact inspector; in a persona window it opens the inspector there. The **runtime view**'s compression paragraph and
the **component view**'s `roles.ts` line name them; no package, edge, message kind, command, column or process changes.
At its verification the runtime view gained that a live run-level agent with no resolution yet lists nothing
(`runLevelGrant`) rather than its declared tools.

**A root's calls before a crash reach the session total (REQ-MONITOR-102, R-067, 2026-09-29).** The root had no persisted
tool-call count, so a crash — which ends its turn without returning — lost its calls. `iterations.root_tool_calls` (store
**v26**) holds the calls of the root the total holds; `SessionWriter.countToolCalls` writes the total with the root's or a
child's count in one transaction; the crash record adds what the root's and each unfinished child's record hold beyond their
counts, and a root the stop's grace gave up on — one that never returned — is counted from its record. REQ-ORCH-097's
cadence is unchanged. The **runtime view**'s §2 crash paragraph (the counting step), its §7 `iterations` row and its §7
`children` row (`countToolCalls` among the writers of `tool_calls`: a resumed child's credit, its settle or rest, and the
crash record) and a **state-ownership view** row name it.

**A child is recorded under its model's `models:` key (REQ-CONFIG-094, REQ-MONITOR-020/049, live-run finding D5, R-067,
2026-09-29).** `children.model_key` was the model's bare id, so `modelCapFor` and `contextLimitFor`, keyed by the
`models:` key, never matched a qualified key. `childModelKey` now records the role's `Persona.modelKey` (set by the run
host's persona resolver, a synthetic copy mapped to the key the loader recorded it was copied from —
`LoadedConfiguration.syntheticOrigins`, never a guess by provider and model id, since two keys may name the same provider
model) or the run's `RunConfig.modelKey`. The **runtime view**'s agent-record paragraph names it; no package, edge, message,
column or process changes.

**`delegate`'s `suppress_auto_context` reaches the child (REQ-TOOLS-152, REQ-CONFIG-107, R-067, 2026-09-29).** The tool
forwards the flag, `ChildLedger.spawn` stores it (`children.suppress_auto_context`, store **v25**), and
`IterationChildren.artifactContext` omits the sibling-artifact index when the row carries it or the role's
`skip_auto_sibling_context` (now `Persona.skipAutoSiblingContext`, mapped by the run host) forces it. The **runtime view**'s
§7 `children` row and its children section name it, and the **state-ownership view** has a row for the persisted flag
beside the in-memory inherited-context block; no package, edge, message or process changes.

**A detached call writes nothing through its tool gate or its stream (REQ-SESSION-094, 2026-09-29, R-067).** `ToolPort`
gains `close(cutOff)`, and `Run.teardown` closes every port the run built before anything terminal is written: the
run host's `writerSink` settles each call its gate still has open, as failed with the rest's interrupted statement, and
drops every write after it, and the port's gate fires no `post_tool` hook after it. A model step whose `detached` reads true streams no row, settles none and counts no usage; a stop that rests nothing (the explicit cancel) detaches the child executions still running past the grace (`IterationChildren.outlast`), as a rest does.
This repairs `a-detached-call-still-writes-through-its-tool-gate.md`. The **runtime view**'s §2 and §6 say so. No
package, edge, process, channel, message kind or store column changed.

**A root call that ignores the stop no longer holds the run open (REQ-SESSION-092, REQ-MONITOR-129, REQ-SESSION-094,
2026-09-29, R-067).** `Run.turn` awaits the root's turn no longer than the stop's 30 s grace, counted from the first
stop request (`stopGraceSpent`); a root still in a call then is detached as a child execution is, left `paused` by a
stop or a quit with its open call answered, and the rest that follows gives the children only what is left of that
grace (`Run.stopGraceLeft`, `IterationChildren.rest`'s `grace`). Under the explicit cancel a root given up on still
drains (REQ-ORCH-080, OQ-121). This repairs `a-root-call-that-ignores-the-stop-holds-the-run-open.md`. The
**runtime view**'s §2 says so. No package, edge, process, channel, message kind or store column changed.

**`delegate` refuses a write scope for a persona that cannot write files (`PD-TOOLS-006` revision 3, OQ-112,
2026-09-29).** `IterationChildren.delegate` rejects the delegation before any record exists when its `write_scope` names
patterns and the persona — resolved as the ledger resolves it, an alias included — holds no `write_file`, `haet_edit`
or `haet` after `coordinator_only` and `read_only` (`writesFiles`). The reason names the catalogue's personas that can (`fileWriters`). The **runtime view**'s write-scopes
paragraph names it; no package, edge, message or store table changes.

**The report's pass reads the task and the most recent part, beside the facts (OQ-111, REQ-ORCH-110, 2026-09-29).**
`produceReport` gives the summarising pass `reportTranscript`: the task as given (`ReportInput.task`, the ledger row's;
the blocks the payload puts ahead of it marked omitted) and the most recent part, within 12,000 characters, with
`… [N characters omitted] …` between them. It also gives `reportFacts`, the
edited files and each command with its exit code, derived from the whole transcript. The head-only `transcriptText`
remains the compressor's alone (removed 2026-09-30 with the compressor's own reader, OQ-156). The **runtime view**'s children paragraph names it; no package, edge, message or store
table changes.

**A continue in the process that ran the session takes the lock back (ADR-0005, REQ-SESSION-047/048/083, 2026-09-29,
R-067).** `prompt`, `continueSession` and `planDecision` claim the session's lock before their first write
(`holdForContinue`, through the one claim `claimHold` the at-rest cancel's `lockForWrite` now shares), and the run each
launches holds it until its teardown; a continue that launches none gives back what it took, and a live holder in
another process refuses it with REQ-SESSION-048's words. This repairs
`a-continuation-in-the-process-that-ran-the-session-holds-no-lock.md` and
`a-continue-by-message-cannot-re-claim-a-lock-it-no-longer-holds.md`. The **runtime view**'s §6 gains the paragraph and
its §7 `session_locks` row the writers; the **state-ownership view**'s lock row names the continue. No package, edge,
process, channel, message kind or store column changed.

**Every iteration is sent its own task (REQ-CHAT-040, REQ-ORCH-004 / REQ-ORCH-135, 2026-09-29, R-067).** The launch
content stays the base of every execution iteration's first message, and the todo task the iteration selected, when it
is not the run's own and its text is not the launch content's request, follows it as the task to work on
(`Run.takenUp`, `takenUpText`, `Run.firstMessage`) — a queued prompt, a task put back, an improvement run's proposal,
the task after a plan decision's gated one; PD-ORCH-005 clause 17's message keeps its own words. The handoff is not
rebuilt per iteration (OQ-104, OQ-106). This repairs `every-iteration-is-sent-the-prompt-the-run-was-launched-with.md`.
The **runtime view**'s §2 gains the paragraph. No package, edge, process, channel, message kind or store column changed.

**An iteration's close commits the todo it leaves (REQ-ORCH-072/073/074/135, 2026-09-29, R-067).** `iterate()` and
`closeOpenIteration` close their task and held messages first and pass the todo to `SessionWriter.endIteration`, which
stores it in the transaction that records `iteration.end` and closes the row, ahead of the capture and the hooks. What
an earlier build's death left is settled when a run is built and when a continue is judged (`settleClosedIterations`:
`Todo.releaseStale`, and `Todo.settleStranded` for an iteration's own task, from the latest row naming it). This repairs
`an-iterations-own-task-is-left-in-progress-by-a-death-before-the-todo-save.md`. The **runtime view**'s §2 says so. No
package, edge, process, channel, message kind or store column changed.

**A request queued behind an open approval dialog waits for its turn (REQ-TOOLS-063, 2026-09-28).** Main answers a
present-request that waits behind the dialog already open in its window, or behind requests queued ahead of it, with
the new run-host request `approval.queued` (`MainWindows.enqueueApproval` answers which). `RunHostPresenter` then stops
bounding the wait for `approval.shown`. The gate races the presentation against its own wait, so a queued request that
times out or is cancelled is dropped unshown and counts as cancelled (REQ-TOOLS-054). A window that closes while the
application stays hands its queued requests to main (`MainWindows`' `unshownApprovals`), which answers each not shown
(REQ-TOOLS-058), so none hangs; during a quit it answers nothing. The **process view**'s request list and the
**sequences view**'s approval diagram and bullets name it; no package, edge or store table changes.

**Each agent's record keeps the fingerprint it started with (`PD-ORCH-005` revision 4 clause 14, 2026-09-28, R-065).**
Store **v24** appends `agent_fingerprints`: per agent, the SHA-256 of the system prompt and of the tool definitions its
first model request carried. `runTurn` hands both to `TurnDeps.fingerprint` just before a step goes out; the check
(`ConversationRecord.fingerprint`, built once per execution by `turn()` and `execute()`) records the first and, on a
resume, states a changed one as a `resumed_under_changed_instructions` warning issue and a transcript `system` row
naming the agent (OQ-105). The transcript clear removes closed iterations' fingerprints. The **runtime view**'s record
paragraph and §7 table and the **state-ownership view** gain the table, and the **sequences view**'s resume bullet names
the warning; no package, edge, process, channel or command changes.

**The handoff's artifact is the root's own (`PD-ORCH-005` revision 4 clause 20, 2026-09-28, R-065).**
`latestArtifactText` takes the latest artifact the most recent recorded iteration's root published that nothing
supersedes, known by the root's task id as the record's `conversation_id`, and falls back to the latest of any kind
(OQ-106) — also when a plan cycle opened its gate after that iteration, so the plan gate's approve and revise never hand
over an earlier piece of work's document ahead of the plan cycle's; the plan cycle `PD-ORCH-003` revision 2 holds after
a resumed iteration is taken the same way, so there the resumed root's document counts only as "of any kind" (OQ-106). It
is read once, at the continue: a later iteration of the same run, and the plan cycle held after a resumed iteration,
are re-sent it as it stood then (OQ-104). The **runtime view**'s
continuation paragraph is updated. No package, edge, process, channel, command or store table changes, so the other
views are not.

**One paused child is cancellable while its session rests (`PD-ORCH-005` clause 16, revision 4, 2026-09-28, R-065).**
`session.control`'s `cancelAgent` reaches `Sessions.cancelPausedAtRest` when no run is behind the session: the child and
each `paused` descendant end `cancelled` with the live cancel's report, timeline entry and artifact, the iteration stays
open, and `resumable` drops. A child a crash not yet recorded left unfinished, and each such descendant, is cancelled
from the state it is stored in, its calls the crash cut off answered as interrupted; the crash itself is left for the
next repair or continue to record (clauses 3 and 8, OQ-101). It runs no scheduler pass, so an agent whose `depends_on`
names a cancelled child stays counted and is blocked by the resumed run's first pass (REQ-ORCH-048, OQ-101). It is
refused under a store failure, as every continue is (OQ-103). The cancel writes under the session's lock, taken for the
write and given back, a dead local holder reaped by the `claimLockReaping` that `SessionWriter.open` claims through, and
is refused while another live process holds it (`lockForWrite`); the refusals that say nothing of the agent carry
`ControlRefusal` codes of their own — `session_locked` for that holder, `store_failed` for a store failure, a lock the
store could not read or take, and a chosen child's move it could not write — whose message the renderer's `cancelAgent`
(through the `control` helper) states rather than "not cancellable"; a target it refuses outright is judged before the
lock is taken. Every confirmation and cascade note names
each unfinished descendant a cancel ends, live or paused (`cancelCascade`; OQ-100 and OQ-101 record the departure from
REQ-MONITOR-064's live count), and both cancels write through one `userCancellation`. The surfaces offer a paused
child's Cancel while its session rests (`cancelOffered(agent, runActive, resting)`, `resting` being `runLevelResting`,
the predicate the composer's count and the resting root share) and confirm by `cancelConfirmation` — the Workspace and a
persona window through `AgentCancelConfirm` (`packages/ui/src/AgentCancelConfirm.tsx`), which also confirms the run's
cancel on the Workspace, takes no label of its own and has its call sites pinned by a source test, and the Mission view
through `missionConfirmation`. The **runtime view**'s `cancelAgent` and `children` rows and its crash paragraph, the
**state-ownership view**'s rest and session-lock rows and the **sequences view**'s crash note name the new writer; the
`iterations` and `agent_terminals` rows say only that the crash record is written at a repair or a continue, which the
cancel is not. The **process view**'s `control.result` paragraph lists the two new refusal codes. No package, edge,
process, channel or command changes; `CONTROL_REFUSAL_CODES` gains the two refusals above.

**A paused agent presents as paused on every agent surface (`PD-ORCH-005` clause 13, revision 4, 2026-09-28, R-065).**
`PRESENTATION_CHILD_STATES` gains `paused` and `presentationChildState` maps the child state to it, so `AgentRecord`'s
`presentationState` widens on the existing session-record channel. `toAgentRecord` presents the agents a crash left
unfinished, before the crash is recorded, as the record will leave them (`crashLeftOf`, asked once per projection;
OQ-100's departure from clause 13's last sentence) — never for a session a store failure left busy, which is not one a
crash left and states nothing to resume (`Sessions.restingOf`, OQ-103); `runLevelAgent` presents the resting root
`paused`, the Workspace, the Mission view and a persona window asking it and `runLevelResting` through one call
(`restingView`, whose recovery argument, like `runLevelAgent`'s and `runLevelResting`'s, is required) with
REQ-CHAT-008's recovery state (`useNeedsRecovery`, moved to `renderer/session-view.ts`; the two renderer roots' wiring
is pinned by `renderer/recovery-wiring.test.ts`, with the props that carry it and what `restingView` answers to the
Workspace, the Mission view and a persona window), and the Mission view, handed that fact as `recovery`, reads no run
active in it, so it offers no Pause beside the root it draws `paused` and labels the run REQ-CHAT-008's "Run needs
recovery" rather than "Running"
(`docs/defects/fixed/the-mission-view-offers-pause-and-cancel-with-no-run-behind-the-session.md`). The Overview counts
paused agents on their own, and the transcript's "This task" reads a paused agent's state without its elapsed time — a
paused agent's only; every other agent keeps it (`scopeDetail`, OQ-100). The **runtime view**'s eleventh-state and
projection paragraphs and the **state-ownership view**'s rest row are updated; no package, edge, process, channel or
command changes.

**A quit ends a board run as a quit, and clause 15's audit re-cites the stop and the cancel (`PD-ORCH-005` clauses 15
and 19, `PD-CHAT-001` revision 4, `PD-CHAT-002` revision 2, 2026-09-28, R-065).** Main's board coordinator ends its runs
at the last window's close with the application's quit (`quitAll` → `announceShutdown`), not the stop control's
`cancel`, so a board run rests by `quit` (`docs/defects/fixed/a-board-run-caught-by-a-quit-rests-as-a-stop.md`). The
**process view**'s board paragraph, the **runtime view**'s rest paragraph and §5 rows and the **sequences view**'s
approval note now cite the rulings in place of OQ-96; readings in OQ-108. A stop or a quit during a plan cycle now
withdraws what waits on a person rather than cancelling it (`Run.waitsWithdrawnBy`, which reads the stop request alone
and never the plan hold; clause 15's last bullet and `PD-CHAT-002` revision 2): the **runtime view**'s rest paragraph
and `cancelQuestions` row and the **sequences view**'s approval note say so. No package, edge, process, channel or
command changes.

**A crash offers the same choice as a pause (`PD-ORCH-005` clause 18, 2026-09-28, R-065).** `Sessions.continueSession`
accepts a session a crash left — `interrupted`, or persisted busy and `not-live` (REQ-CHAT-008's recovery state) —
beside `paused`, and refuses a busy one whose process may still be running it (`run-active`) and, first, any session
whose store has failed (`store-failed`, as the continue by message is: a run ended on a recording failure is not a
crash, OQ-42; a `paused` session under a store failure is refused the same way). The composer draws the two continues on
it (`crashLeft`) in the send pill's place, which `PD-CHAT-001` revision 4 prescribes on a paused session only (OQ-103's
reading), and the count and "Continue without them" wherever the session rests with an iteration open
(`resumable`, `runLevelResting`), the same count as a paused session's; either choice records the crash first, in
`launchContinuation`. Readings in OQ-103. The **runtime view**'s §5 Continue paragraph and the **process view**'s
`session.continue` note are updated; the command's shape does not change, and no package, edge, process or channel does.
A declined crash-left iteration's `iteration.end` summary names the decline and the crash, as its agents' reports do
(`closeLeftOpenIteration` writes the decline's summary whatever left the iteration open; every run that reaches it was
told to decline); the **runtime view**'s declined-iteration paragraph says so.

**`/stop` is offered as the stop, and the paused continue by message reads `Send` (`PD-ORCH-005` clause 15,
`PD-CHAT-001` revision 4, 2026-09-28, R-065).** The slash catalogue describes `/stop` as "Stop the active run"; it still
sends the stop's `cancel` op and never the explicit cancel. The paused strip's second continue shows `Send`, named
`Continue with a message`. The **runtime view**'s §5 `cancel` row and Continue paragraph are updated; no package, edge,
process, channel or command changes.

**A later iteration's root is told the open offers (`PD-ORCH-004` revision 4, 2026-09-28, R-065).** The offers list and
its reader (`openOffersText`, `offersToldIn`) move from `sessions.ts` to `run/offers.ts`, re-exported where they were,
so the run can use them without importing the session manager. `Run.turn()` adds to every execution iteration root's
first message the offers that message does not already hold (`offersForFirstMessage`); a plan cycle is told none. The
offers a handoff covers are passed to the run (`RunDeps.handoffOffers`), an offer a held list elided counts as told, and
the continue that resumes a root counts an offer its lists left out as held (`offersHeldIn`). REQ-SESSION-194's cut is
one function, `run/cut.ts`, shared by the handoff, the offers list and the plan cycle's pending tasks. Readings in
OQ-107. The **runtime view**'s continuation paragraph and the **state-ownership view**'s record row say so. No package,
edge, process, channel, message kind or store column changed.

**The plan gate meets a resumed iteration (`PD-ORCH-003` revision 2, 2026-09-28, R-065).** A run that resumes an open
iteration runs it unheld; when the gate would hold the run, the loop sets the hold once that iteration has closed and
work is left, and parks before the first new iteration (`parkAtPlanGate(resumed)`, its plan cycle told the pending tasks
by `resumedWorkSection`, that the iteration was left open, and what became of every message it held, `Todo.heldIds`),
then the launch content the continue built before that iteration ran, whose handoff therefore predates the close
(OQ-104). The message an iteration takes up is sent only to an execution root (`Run.firstMessage`), never to that plan
cycle. The message limit, checked as the resumed iteration closes, wins over the hold and leaves the continue's message
`complete` with nothing open, and its resolution appends it again (OQ-103). A plan decision's relaunch appends no task
(`RunDeps.appendsTask: false`), which also repairs the approved prompt being worked twice. Readings in OQ-104. The
**runtime view**'s start order, plan gate and resume paragraphs say so; ADR-0062 decision 1 carries the amendment. No
package, edge, process, channel, message kind or store column changed.

**A continue's message is also a task (`PD-ORCH-005` clause 17, 2026-09-28, R-065).** A continue by message that
resumes an open iteration appends its message to the planner todo as a task that iteration holds (`Todo.appendHeld`,
`heldBy` in the todo document), marked as a message for good (`Task.message`), which closes with it
(`Todo.releaseHeld`): done when it succeeds, pending on any other close. A message left pending is taken up by the next
iteration (`Task.nextUp`, `Todo.selectNext`), which is sent its text after the launch content when that names another
request (`Run.firstMessage`; since 2026-09-29 every selected task that is not the run's own is, as the entry above
records). A held message a death left stale closes as the record says its iteration did
(`Todo.releaseStale`, against `succeededIterationsOf`, which the run's constructor shares). A continue that delivers no
message — the Continue action, "continue without them", and the message-limit resolution's 'continue' and 'double' —
judges the todo after that settle, and appends no task while the todo holds the last request unfinished — a task of
that text pending, or in progress and held by the open iteration
(`Todo.holdsUnfinished`, `launchContinuation`): OQ-102's reading, beyond what clause 17 governs, which repairs
`the-continue-action-appends-the-last-prompt-again-while-its-task-is-pending.md`. `RunDeps.openIteration` gains
`delivered`. Readings in OQ-102. The **runtime view**'s §2 gains the paragraph; the
phase 4 paragraph below keeps "no todo task is appended" as it was built then. No package, edge, process, channel,
message kind or store column changed.

**A quit answers nothing for a person, and every stored report is an artifact (`PD-ORCH-005` phase 7, 2026-09-27,
R-063).** Main tells the application's quit apart (`QuitState`, `main/exit.ts`). That covers the immediate exit, every
main window's close confirmed by its guard (`guardClose`), and a quit Electron starts on its own account, which
`before-quit` turns into the guarded close of every main window, all or none (`closeThroughGuards`). While the quit is
under way, an approval dialog's close sends no Deny and the question dock's cancellation is held back. The run host's
`shutdown` withdraws both instead (clause 9, OQ-96). The report write and its artifact are one function in the engine
(`storeChildReport`), which the stale settle and the decline now use. The **process view**'s quit paragraph, the
**sequences view**'s approval notes and the **runtime view**'s settle line are updated. The **seams view** is not:
`CommandContext` gains `quitting`, and no package, edge, process or channel changes.

**The Continue action states what it resumes and offers to continue without it (`PD-ORCH-005` phase 5, 2026-09-27,
R-060/R-061).** `SessionRecord.resumable` (`ResumableSchema`: the open iteration and how many agents will resume — its
root and every unfinished agent of it) is read from the store by `resumableOf`, as the plan gate is. On a `paused` or
`interrupted` session the composer's notices row states the count, which describes the continues, and on a `paused` one
offers "Continue without them" behind a confirmation — the strip keeps its one band (found by phase 5's review);
`session.continue` gains an optional `withoutPaused`, carried from the renderer through main and the run host to
`Sessions.continueSession`. Readings in OQ-98. The **runtime view**'s §5 Continue paragraph and the **state-ownership
view**'s rest row name the projection; the command's shape changes and no package, edge, process or channel does.

**A continue resumes the open iteration from every agent's record (`PD-ORCH-005` phase 4, 2026-09-27, R-060/R-061).**
Every continue — a new message, the Continue action, a plan decision — resumes the iteration a rest or a crash left open
before anything else runs: the same number, root and task (`iterate(openRow)`, `iteration_resumed`, no second
`iteration.start`), not held at the plan gate. Each paused child moves back to the state it resumes into
(`resumeChild`, `child_resumed`), re-claims its stored write scope (PD-TOOLS-006 revision 2) and carries on from its
record under a fresh `child_timeout`; the root carries on from its own; an agent whose record ends on its own answer
resumes into waiting (`run/resume.ts`). A resumed agent is told of its background sessions (clause 10) and the root is
handed a continue's new message, each recorded as its next message; no todo task is appended. Declining is
`continueSession`'s `withoutPaused` option. Readings in OQ-97. The **runtime view**'s §2 gains the resume paragraph and
diagram arm and its declined paragraph, §4, §5's Continue paragraph and §7's two rows move; the **state-ownership
view** names the resume as the record's reader; the **sequences view**'s §4 closes with the resume. No package, edge,
process, channel or message kind changed.

**A pause, a stop, a quit and a crash leave every unfinished agent paused (`PD-ORCH-005` phase 3, 2026-09-27, R-060/R-061).**
A run comes to rest by a pause, a stop or a quit (`Run.restCause`); the reserved run id's cancel is final
(`StopRequest.final`). A pause is refused at the plan gate, withdraws every approval and question (the gate's and
`ask_questions`' new `withdrawn` outcome, recorded interrupted and never denied), arms REQ-ORCH-134's tool deadline from
`runtime.graceful_pause_tool_deadline`, and holds the scheduler; every agent stops before its next model step, and the
turn records every call of the step it stopped in. Each unfinished child is left `paused` with its interruption and
the state it resumes into, the root execution record `paused`, and the iteration open with its interruption. Background
terminal sessions are attributed to their agent and recorded in `agent_terminals` (a pause leaves them running; a stop
and a quit end them). A crash is recorded from the store at the next repair or continue (`run/crash.ts`); loading a
session no longer settles anything, so `session.resumed` loses its settled count. Cancelling one child aborts its
execution and its descendants'. Until the resume lands, a continue declines the open iteration. **Repaired by the
phase's two adversarial reviews (same date):** a finished but unreported child leaves its parent unfinished; no model
call follows the pause (the turn re-checks after supervision and compression, the ladder lets the step's report stand,
the waits are released, the summariser makes no second attempt, the manual compression is refused); the status reads
`pausing` until the run rests; the explicit cancel is final in the rest's window and in teardown's; a withdrawn question
settles blocked with `question_withdrawn`; a stop waits within its 30 s grace and an execution it gave up on writes
nothing afterwards; a pause refused at the plan gate takes its tool deadline with it. Repairs
`a-pause-settles-children-instead-of-holding-them.md` and `cancelling-one-child-does-not-stop-it.md`. The **runtime
view** gains §2's rest and crash paragraphs and diagram arm, §4's and §5's rows move, §6's teardown and §7's four rows'
writers; the **state-ownership view** gains the rest's runtime and durable facts and the background session's owner;
the **sequences view** gains §4. The process protocol's `session.resumed` message drops `settledChildren`; no package,
edge, process or channel changed.

**Every agent's conversation is recorded as it happens (`PD-ORCH-005` phase 2, 2026-09-27, R-060).** A `Conversation`
now carries a recorder (the spike's seam), so each `push` is one `agent_messages` entry under the agent's task id and
each `replace` — a compression — one replacement entry; the root records under the iteration's root task id and a
child under its own, and REQ-ORCH-088's fallback retry writes an empty replacement before its second attempt; a turn
closes its conversation when it ends, so a late manual compression records nothing. The run opens an `iterations` row
with the root's task id when an execution iteration's root is minted and closes it with `iteration.end` in one
transaction; the transcript clear removes closed iterations' records in its own transaction (clause 12). Repairing
`a-crashed-iteration-number-is-reused-by-the-next-run.md`: a run closes an iteration a dead run left open before its
first iteration and numbers past it, the ledger holds its own root's tree, and task ids are minted against every
recorded root's id. The **runtime view** gains a §2 paragraph, a §3 paragraph and two §7 rows' writers; the
**state-ownership view** gains the record as a durable fact. No package, edge, process, channel or message kind changed.

**The record a paused run resumes from, in contracts and the store (`PD-ORCH-005` phase 1, 2026-09-27, R-060/R-061).**
The child machine gains its eleventh state, `paused` (`contracts/children.ts`: every non-terminal state may move to it,
and it moves back to the state the child resumes into), with the `Interruption` vocabulary (`pause | stop | quit |
crash`); it presents as `queued`, REQ-MONITOR-046's catch-all, and the agent projection never settles it for display
(OQ-94 records the departure from REQ-MONITOR-211/213). Store **v23** appends `children.interruption`,
`children.resume_state` and `children.write_scope` (PD-TOOLS-006 revision 2, written at spawn), and three
session-scoped tables that cascade with their session: `iterations` (each execution iteration with its root's task id,
open or closed, one open per session), `agent_messages` (every agent's conversation, a compression written as a
replacement) and `agent_terminals` (the background sessions an agent started). The **runtime view** moves: §7's heading
and four rows, and §4's write-scope, paused-state and projection paragraphs; the **state-ownership view**'s write-scope
row says the declared patterns are now stored. No package, edge, process, channel or message kind changed.

**REQ-CHAT-055's CPU-profile round: an increment re-reads only the rows it changed (2026-09-29, R-048's order continued
under R-062).** V8's CPU profile of the built app named the loaded side's extra script per increment as the transcript's
own passes over every displayed row. `ui/transcript/pool.ts` gains `reuseOffsets` and the `MeasureLedger` the pane rebuilds
the offset table from (only the rows that changed, or whose identity the measurement pass re-measured — the caches report
evictions to it through `cache.ts`'s new `onEvict`), and `updateShape` compares keys only past the shared rows;
`Row.tsx` gains `placementsFrom`, which the projector carries the places forward with; `project.ts` finds the reusable prefix
by bisection over a carried reach and exports `settlesWithRunning`, which lets `projector.ts`'s `changedFrom` bound a run
beginning or ending. The **runtime view**'s step-4 and step-5 rows and its pool paragraph, and the **component view**'s
`pool.ts` entry, say so. The proof's side is `transcript-proof.mjs` and `lib/trace-summary.mjs` (the CPU profile's
attribution), which no view describes. No package, edge, process, channel, message kind, store column or owner of state
changed.

**A skip before the open's resolution (2026-09-28, R-062).** The **process view**'s `initialization.*` paragraph says
which listed ids a skip leaves out (only one the live run is attempting) and that a skip arriving before the open's
one automatic resolution performs that resolution first (OQ-122). No package, edge, process, channel, message kind,
store column or owner of state changed. **Its second round (2026-09-29):** the same paragraph now names the
`backgroundRun` field the initialization state carries on its existing channel. The window reads it to keep a
background run out of the setup dialog and to keep the prompt due beside it (REQ-WORKSPACE-103/110, OQ-123). It is one
more field on an existing message; no message kind changed. **Its third round (2026-09-29):** the paragraph adds that a
skip leaves an id already recorded completed where it is, and that a skip after the resolution reads nothing more before
it records; nothing else in any view moved. **Its fourth round (2026-09-29):** the paragraph adds that main makes every
marker write through one queue and builds each patch inside its turn from the file as it stands, and that a skip decides
what it leaves out in that turn. No message, channel or owner of state changed; the writer is still main's coordinator.
The **runtime view**'s `initialization:` / `project_init:` bullet still described the first execution's re-read before
each recording, with the reason this round falsified; it was corrected in place in the repair round that followed, the
old sentence kept and marked superseded beside a statement of the queue (`ExecuteDeps.commit` replaces `reread`).
**Its fifth round (2026-09-29):** the queue is one per workspace root rather than one for the coordinator, so a
workspace just opened does not wait behind the last marker write of the one it replaced (REQ-WORKSPACE-013); the
process view's paragraph and the runtime view's bullet say so. Nothing else in any view moved.

**The notices generator reads the shipped setup manifest (2026-09-28, R-062).** `tools/notices/notices.mjs` reads
`apps/desktop/resources/setup-manifest.json` rather than `pins.json` as REQ-STARTUP-142's manifest, by a copy of
`SetupManifestSchema`'s field names that `notices.test.ts` holds to the schema; `pins.json` is read for the runtime's
name only. The **component view**'s notices-generator and setup-manifest sections say so, and name the second test that
crosses into a package. No package, edge, process, channel, message kind, store column or owner of state changed.

**A session's lock ends with the application that held it (ADR-0014, 2026-09-28, R-062).** Main is gone only after
the run host: the orderly quit waits, bounded, for the run host's exit after its `shutdown` and ends it if it has not
come, and an immediate exit (`exitCleanly`) ends it at once (`endBeforeMain`, `main/exit.ts`). The **runtime view**'s §6
gains *The application's end*; the **state-ownership view**'s lock row and the **process view**'s quit paragraph say
so. No package, edge, process, channel, message kind or store column changed.

**The artifact variables stay with the launch they describe (REQ-STARTUP-106/147, ADR-0054 "The updater" item 6,
2026-09-28, R-062).** Main's first statement takes `APPIMAGE` and `ROTARIS_PORTABLE_ARTIFACT` out of its own
environment and hands them to the updater's classification alone (`takeArtifactVariables` in `platform`), so the run
host, the workspace services and everything the run host starts inherit neither. The **process view** gains *The
environment a child is started with* beside the ownership table, and main's updater clause says where the classification's
two variables come from. No package, edge, process, channel, message kind or store column changed; `platform` gains
`artifact-environment.ts`.

**REQ-CHAT-048's duplicate-reasoning hygiene compares per agent (2026-09-28, R-062; OQ-91).** Step 4 kept one lookback —
the previous thinking row of any agent — so an agent's repeated burst survived whenever another agent reasoned between
the copies. `ui/transcript/project.ts` now keeps each agent's own previous thinking row, and the bounded form looks one
up below its cut only for an agent whose unstamped reasoning is in the suffix. The **runtime view**'s step-4 row says so.
No package, edge, process, channel, message kind, store column or owner of state changed.

**The layout contract has one publisher, and `ui-audit` survives a thrown expression (2026-09-28, R-062).** The window
controls (`PD-SHELL-003`) wrote their `data-ui-contract` by hand as an object; the audit's CONTRACTS sweep iterates the
relations array, threw in the renderer on every view carrying the title bar, and the script died on the driver's
`{ error }` answer before any evidence pack. The controls and the Proposals tab now publish through
`layoutContractAttributes`; `tools/check-ui-language.mjs` refuses a hand-written `data-ui-contract` anywhere in the drawing
roots (`tools/ui-contract-publisher.mjs`); `ui-audit` reports a thrown audit expression as an `AUDIT-ERROR` finding and
a non-array contract as a `schema` finding, and moves on. The **seams view** §8 steps 4 and 6 and the **component view**'s
design-system paragraph say so. No package, edge, process, channel, message kind, store column or owner of state changed.

**The update restart's record passes in two steps (REQ-STARTUP-121, REQ-STARTUP-161; ADR-0055 *Amended 2026-09-28*,
R-062).** `packages/platform/src/instance.ts` now offers the record, waits on the timer port for the successor's
acknowledgement within the hand-over interval, and rewrites it only then, so a successor that stopped waiting is never
named by it. The **sequences view**'s `Restart now` diagram and prose gain the offer, the acknowledgement and the
refusals they add. The ordinary hand-over of a second launch is unchanged. No package, edge, process, channel, command,
store column or owner of state changed.

**The runtime makes no request of its own (REQ-STARTUP-160, REQ-SHELL-005; repaired 2026-09-28 under R-062).** The
connection `pnpm updater-proof` recorded at launch was Electron's spellchecker fetching a Hunspell dictionary, not
Chromium's component updater; main now empties each session's dictionary list and turns its spellchecker off in
`session-created` (`main/runtime-requests.ts`). The **process view** gains a paragraph under its diagram saying that
Electron and Chromium add no host of their own to the ones the product reaches, and why — not that the endpoints drawn
are all of those hosts, which they are not (corrected at verification). No package, edge, process, channel, message kind, store
column or owner of state changed; OQ-93 raised (OQ-91 on its branch).

**REQ-CHAT-055's measurement round: the transcript projects once per change, not once per render (2026-09-28, R-048's
order under R-062).** The built app was traced appending to an empty transcript and to one of 1,200 rows, and the extra
time at depth was script — three to four synchronous renders per increment, each re-running ADR-0046 step 4 over the
whole resident window and each re-rendering every bound row through a context value rebuilt per render — not layout,
paint or the `ResizeObserver` pass. `ui/transcript/projector.ts` now keys step 4 on every input it reads, takes the
bounded form when the rows alone changed (the earliest-changed row read off the two arrays, no prop across the seam;
only for an append or a row replaced at its own index — the fix round found a removal and a scope switch taken wrongly;
fix round 2 found the bounded cut reading runs on raw rows where the fold reads the rows hygiene keeps, and repaired it),
and the pane holds one (`TranscriptPane.tsx`); the offset table and the surface value rows read are built once per
change of what they carry. The
**runtime view**'s step-4 row and the **component view**'s `ui/transcript` module list gain the projector. The proof's
side of the round is `apps/desktop/scripts/transcript-proof.mjs` and `lib/trace-summary.mjs`, which no view describes.
No package, edge, process, channel, message kind, store column or owner of state changed.

**The setup manifest (REQ-STARTUP-058/059, `first-release-plan.md` §4.1, built 2026-09-28).**
`apps/desktop/resources/setup-manifest.json` exists — Git and ripgrep as the requirement pins them, the `@playwright/mcp`
pin the guard checks, the language servers as `pins.json` declares them — and `electron-builder.yml` packs it. Its schema
is `config`'s `setup-manifest.ts`, read by the pre-build guard now and by the machine-setup flow when that is built. The
**component view** gains a section and its `config` node names the schema; the **process view**'s files-on-disk table gains
the file's row (`process.resourcesPath/setup-manifest.json`, read by the guard and by nothing in the product yet). No package, edge, process, channel, message
kind or store column changed; `config` gains the `zod` dependency `contracts` already carries.

**The updater (first-release-plan.md §4.6, ADR-0054; built 2026-09-28, R-062).** ADR-0054's bespoke main-process
updater exists: `apps/desktop/src/main/updater/` — the flavour classified once from the artifact the launch started
from (REQ-STARTUP-106), the one endpoint and the offer rule (105/107–110/112), the compiled-in key set — EMPTY until
O-2 — and the Ed25519 detached-signature format (167/168), REQ-STARTUP-122's strict sequence with the signature verified
before the manifest is parsed, the 1 MiB download into a `rotaris-update-` staging directory (118/124), the portable
and installer strategies (115/125/126; the dmg and AppImage ones wait for `PD-STARTUP-001`'s withdrawal), and the
orchestrator holding the one offer and the one operation in flight (114/116–121, REQ-STARTUP-046). The **process view**
gains the updater in main's row, the feed as an endpoint in the diagram, the `update.install`/`update.restart`
commands, and three rows in the file table (the staging directory, the portable's `.update`/`.old` siblings, the
`updates/dismissedVersion` key); the **sequences view**'s launch gains the post-show activation the check rides and a
new section for `Update now` and `Restart now`, the latter ADR-0055's hand-over of the record to a successor started on
the sentinel branch (`builtin:update-successor`, `inheritInstance`); the **runtime view**'s §8 states what no
configuration tier reaches (REQ-STARTUP-111); the **state-ownership view** gains the held offer, the classification, the
waved-off version and the key set; the **component view** names the `app-main → release-naming` edge as the updater's.
`MainWindows` gains a post-show activation hook (REQ-STARTUP-043), the notice store an `update` in place (REQ-SHELL-118),
the notice action a `disabled` description, and the preference table `updates/dismissedVersion`. No package, edge,
process, channel or store column changed; two command kinds were added. Three questions were raised (OQ-83, OQ-84,
OQ-85 — OQ-76 to OQ-78 on the branch, renumbered at the merge) and one defect noticed beside the mechanism (`redirector.gvt1.com`). **Repaired at verification the same day:**
the **state-ownership view**'s instance-record row and the **sequences view**'s `Restart now` now say the record passes
only while a restart this instance started waits for its successor (`acceptSuccessor`, REQ-STARTUP-161); the sequences
view's launch and the process view's `.old` row say the backup cleanup runs at a launch's first check only and that an
update already installed in this process is not offered again (REQ-STARTUP-115/119); OQ-86 raised (OQ-79 on the branch, renumbered at the merge). **Repaired at the
second verification:** the **process view**'s main row names `updater/successor.ts`; the **sequences view**'s `Restart now` and the **state-ownership view**'s instance-record row
say that an accepted successor the record cannot be passed to fails the waiting restart (`onRecordPassFailed`,
`updater/successor.ts`, REQ-STARTUP-121) and that a refusal answers with its reason; the **seams view**'s §6 names the
notice store's `update` in place and `action.disabled` as REQ-SHELL-118's exception to "a second notice replaces".

**The reserved token's launch carries the parent's sandbox switch (2026-09-28, R-062).** Three defect notes repaired
in `apps/desktop` and `packages/ui`; one moved a process fact. The reserved token's launch of the application's own
executable (REQ-MCP-033) now carries `--no-sandbox` when the parent was started with it, between the token and `--`
(the token stays first; a first build that put it before the token is superseded), and main forks the run host with the
same switch so the launch builder reads it off its own argv; the sentinel drops it before the separator. `@rotaris/platform` gains `chromium-switches.ts` (no new edge: main and the run host already import
platform). **OQ-82** holds the reading (OQ-76 on its branch, renumbered at the merge). The **process view**'s bundled-runtime paragraph names it; no package, channel,
message kind, command or store column changed. The About caption's type token and `settings-proof`'s computed-size
probe changed no view.

**`inherited_context` reaches the child (REQ-TOOLS-152, REQ-TOOLS-154 item (5), REQ-ORCH-032; repaired 2026-09-28,
R-062).** A `delegate` call's `inherited_context` ids were stored on the child's row and read by nothing. `ChildLedger.spawn`
now resolves them: an id no task in the session has (the root execution record included, REQ-ORCH-072) refuses the call
with no record (REQ-TOOLS-153's `rejected`), one naming a task that has not completed — the root, the caller's own task, a
failed, cancelled, unfinished or report-less one — is ignored, and the caller's completed children come back on
`Spawned.inherited`. `IterationChildren.delegate` renders their `reportBlock`s under one heading
(`notify.ts`'s `inheritedContextBlock`) and remembers the text per task id on `attached`'s terms; `childPayload` takes it
as a sixth argument and places it as item (5), after the artifact blocks and before the task. The **runtime view** §4
gains a paragraph; the **state-ownership view** gains the remembered block as a volatile fact. Another parent's completed
child refused for ownership is OQ-81 (OQ-76 on its branch, renumbered at the merge). No package, edge, process, channel, message kind or store column changed.

**A prerelease's installer is named from the declared version (2026-09-28, R-062).** `pnpm package` now reads the manifest's
`version` as written (`0.1.0rc1`), renders the installer's name through `tools/release-naming` and writes it as a literal into
the configuration electron-builder runs with (`release/electron-builder.package.yml`); `electron-builder.yml` carries no
`artifactName`, whose `${version}` was the normalised `0.1.0-rc1`. `build-hooks.cjs` compares the configured names and, in a
new `artifactBuildCompleted` hook, the produced file against the same text. The **process view**'s row for the manifest's
`version` gains `pnpm package` among its readers, and the **component view**'s section on the scripts' shared modules gains
`scripts/lib/artifact-names.mjs`, which both scripts load and which reaches `tools/release-naming`. No package, edge,
process, channel, message kind or store column changed.
The installer's own Windows metadata stays normalised — OQ-80.

**One machine-wide directory for both discoveries, and a strict decode at the port (REQ-WORKSPACE-045, 051, 053; built
2026-09-28, R-062).** `SkillRootsEnv` gains `machineDir`, so REQ-WORKSPACE-051's fourth user-scope root is
`<machineDir>/skills` where it was the literal `/etc/codex/skills`; the literal now lives once, in
`config/src/skills/roots.ts` (`MACHINE_CODEX_DIR`, `machineCodexDir`), and `PD-WORKSPACE-002`'s instruction base reads
it from there. The run host's existing `SkillHostDeps.machineDir` now reaches `discoverSkills` too, fed by
`ROTARIS_CAPTURE_SKILLS_MACHINE ?? ROTARIS_CAPTURE_INSTRUCTIONS_MACHINE` under `__ROTARIS_SEAMS__`. `NODE_DISCOVERY_PORTS.readFile`
decodes with a fatal `TextDecoder`, so a file that is not UTF-8 reaches the unreadable-file arm of every walk that shares
the port (OQ-79 for a `SKILL.md`). The **runtime view**'s §1 passage on the machine-wide base and its §7 Instructions
bullet name both. No package, edge, process, channel, command, message kind or store column changed.

**After one unanswered approval, a run treats the user as away (`PD-TOOLS-005`, built 2026-09-28, R-062).** One holder
per run, `UserPresence` (`engine/run/presence.ts`), installed by `Sessions.start` and every continuation beside the mode
override and handed to every agent's port through `ToolPortContext.presence`, a delegated child's included. The gate
(`GateDeps.presence`, passed by `run-host/tools.ts`) marks it when a brokered wait ends by timeout and, while it is
marked, resolves every ask that would prompt at once under the headless policy with a reason naming the timeout that
expired; the user returns on the first input to the run's session, wired at the top of `Sessions.control` and in its
`clearTranscript` branch, in `controlAsync` and in the id-routed answers. The **runtime view** gains a clause in §3 and a
paragraph after §5's table; the **sequences view** gains one bullet in §2; the **state-ownership view** gains a volatile
row for the run's away mark — owned by the run host, set only by the gate's timeout arm, cleared only by `Sessions`'
input arms, never persisted. No package, edge, process, channel, message kind or store column changed;
the two transitions are session-log lines because the timeline vocabulary has no word for them (OQ-76).

**Hook faults reach the application log (defect repair, 2026-09-28, R-062).** `HookPortContext.log` and `HookSinks.log`
were documented "the application log only" and wired by `Sessions` to the per-session log at `INFO`, where the
`WARNING` default of `session_log_level` dropped them, so a hook fault that reduces to a log entry (REQ-HOOKS-079/128/129)
and the run host's account of an unresolvable hook set (REQ-HOOKS-085) were recorded nowhere at the default
configuration. `SessionsDeps` gains `log`, the application log at `info` (PD-MONITOR-002), which the run host fills with
its `log` event; both hook-port construction sites write through it. `CheckpointPortContext.log` is decided the other
way and says so: it stays the per-session log, since `run-host/checkpoints.ts` already writes every checkpoint line to
the application log through `CheckpointRootDeps.log` as well. The **process view**'s application-log paragraph gains
the sentence. No package, edge, process, channel, message kind or store column changed.
**Three permission-gate defects repaired (2026-09-28, R-062).** The path scope of REQ-TOOLS-018 joins each path argument
to the workspace root before the resolver, so a workspace-relative read no longer resolves against the run host's process
directory; `realPathOf` rebuilds a relative path's missing tail with `basename` and drops no character; and PD-TOOLS-004's
`publicTool` predicate now decides whether a rule's tool set holds a call (`toolSetHolds` in `agent-tools/src/policy.ts`)
and whether the plan gate withholds it (`withheldUnderPlanGate(name, isPublicTool)`, passed `false` by the run host's MCP
loop and by the gate for a name it serves with something other than the public tool or removed itself), so an MCP tool
offered under a public name is ruled as the undeclared tool it is. The **sequences view** §2 gains two sentences on the
approval bullet and the **runtime view**'s MCP-surface passage one clause; no package, edge, process, channel, message
kind or store column changed.


**A session approval of a file write covers that path (`PD-TOOLS-004`, built 2026-09-27, R-057).** A grant made by
"approve for session" on a call of the public `write_file` or `haet_edit` (`haet` folded in) now stores the set of
paths its REQ-TOOLS-018 path arguments resolved to, against the workspace root, when it was made, and matches a later
call of that tool from that persona whose set is exactly that one, whatever its other arguments and its
`write_file` operation. An unresolvable path never matches; a call carrying no path key falls back to REQ-TOOLS-024's exact
match, which every other tool keeps — an MCP tool offered under the name `write_file` or `haet` included, since a
server's tool is prefixed only when its name is taken. The rule is `resolvedPathSet` and `approvalMatches` in
`agent-tools/src/policy.ts`; `PolicyContext.grant` now takes the root, the resolver and `publicTool`, which the gate
passes from its new `GateDeps.publicTool`, and `run-host/tools.ts` supplies that predicate: true when the callable map
holds the very executor `executorsFor` built for the name. The **sequences view** gains one bullet on the grant in §2;
no package, edge, process, channel, message kind or store column changed.

**`PD-ORCH-004` repaired after review (2026-09-27, R-057).** One behaviour moved: a file-writing call is recognised by
its lower-cased name, as the gate's own fallback dispatches `Write_File` to `write_file`, so such a write is now listed
among a cut-off child's changed paths. The rest is record: four end-to-end cases in `run/ladder.test.ts` pin the paths
across REQ-ORCH-088's retry, the rule read at the failing attempt's expiry, the landing grace and a role's
`stall_timeout`. The `delegate` field `continuation_of` is raised as **OQ-66** against REQ-TOOLS-152. The **runtime
view**'s child-timeout passage names the lower-case match and the lexical resolution, and its continuation paragraph
names the same-iteration limit and OQ-66. No package, edge, process, channel, message kind or store column changed.

**A child cut off while making progress hands its work back (`PD-ORCH-004`, built 2026-09-27, R-057).** REQ-ORCH-088's
expiry path is unchanged; at the expiry instant a child's `ProgressLog` (`engine/children/cut-off.ts`, fed by the turn's
new `onToolCompleted`) answers whether it completed a tool call within the final stall window, and if it did, its failed
report gains a runner-owned `cut_off`: the statement, the workspace paths its own file-writing calls changed, and —
unless it is a continuation — the offer. `delegate` takes `continuation_of`; `IterationChildren.delegate` refuses it
before a record exists unless it names the caller's own child that made the offer and was not yet continued.
`runtime.child_stall_timeout` and a role's `stall_timeout` reach the run for the first time. The **runtime view** moves:
the child-timeout passage, a §4 paragraph, and §7 names v22 and `children.continuation_of`; the **state-ownership view**
gains the progress log. No package, edge, process, channel or message kind changed; one store column was appended.

**The application log keeps `info` and above (`PD-MONITOR-002`, built 2026-09-27, R-055).** Main's standard output
carried the level of a forwarded line as text inside it and none on main's own, and recorded every level. Each line now
carries its level in a column of its own, and a line below the threshold is not written; the threshold is `info`, moved
only by `ROTARIS_APP_LOG_LEVEL`, read once at start. Main's own reports of a loss are `error` — a `shutdown` a child
refused or left unanswered while still running among them, since an exit of 0 does not prove one — so a crash is still
recorded at a higher threshold. The quit races each child's `shutdown` against its exit (`main/exit.ts`), so an answer
lost to the exit neither stalls the quit for the bound nor writes that line. The level, the predicate and the line are
the new `main/app-log.ts`; `index.ts` keeps the wiring. The **process view** gains a paragraph on the application log,
the `log` event names its fields, and the MCP-child paragraph says `debug` is now a filter; the **state-ownership view**
gains the threshold as a fact nobody writes after start. No package, edge, process, channel, message kind or store
column changed.

**The `FAILED ` marker matches in capitals only (`PD-TOOLS-003`, built 2026-09-27, R-055).** Of REQ-TOOLS-113's five
literal failure markers, `FAILED ` alone is now matched case-sensitively; the other four, the error count, the banner
and the pipeline check keep their casing. The rule lives in the marker list in `agent-tools/src/terminal/classify.ts`,
and the search and the quoted line share one predicate. No view states the terminal's marker rule at this depth, so
no view changes beyond this entry; no package, edge, process, channel, message kind or store column changed.

**The run's model calls outside an agent's turn are counted (defect round, 2026-09-27, R-054).** Compression, the
child-report summariser, the intent classifier and the loop supervisor's classifier discarded the usage their
requests reported, so the run's tokens, its cost and `usage.update` missed them (REQ-EVENTS-053, PD-MONITOR-001).
Each now calls through `meteredBackend` (`engine/run/metered.ts`), a decorator on the `AgentBackend` port that hands
every completed request to the new `Run.countUsage`. `PreflightContext` gains `countUsage` and the `Sessions`
`supervisor` factory a third argument, so the run host's two classifiers are wrapped where they are built. The
**runtime view** moves: one passage in "What a step costs". No package, edge, process, channel, message kind or
store column changed.

**The `/skills` listing (REQ-CHAT-162, `first-release-plan.md` §2.2, built 2026-09-27).** One renderer command,
`skills.list`, relayed by main's skills facet to the run host with the followed session named by main (a window
following none is refused there, OQ-67); the run host writes the listing as ONE `system` row through that session's
own writer (`run-host/skills.ts`'s `writeSkillListing`), and the one row renderer draws a system row whose text is
the listing as the listing (`transcript/Row.tsx`, the text fixed once in `contracts/skills.ts`). The **process view**
gains the command and its reply, and the run host's row says it writes the listing; the **component view**'s skills
row names the three places; the **runtime view**'s `transcript_rows` line says the listing is a row like any other.
No package, edge, channel, store column or state owner changed. The two repairs its gate asked for — the listing's
fields drawn through the plain-text path so a URL stays a link, and the prompt-file registrar holding `/skill` and
`/skills` — are below the depth any view describes, so no view changes beyond this entry.

**Workspace-context injection, measured and proven in the built app (first-release-plan §3.2 and §3.3, 2026-09-27).**
`SkillHost.workspaceContext` times its cold path on the monotonic clock port. It covers the policy read, the
discovery and the merge, and logs one line, which is REQ-WORKSPACE-049's figure. The policy read moved **out** of
the discovery step into its two callers, `workspaceContext` and `instructionFiles`, so that it can be timed apart;
`enabledUnder`, a private step, now takes a policy already read. The machine-wide instruction base's directory is
injectable (`machineDir`, `/etc/codex` when absent). Two verification seams, both compiled out of a packaged build,
reach the built app: `ROTARIS_CAPTURE_INSTRUCTIONS_MACHINE`, read by the run host and the workspace service, and
`ROTARIS_CAPTURE_MODEL_REQUESTS`, through which the scripted client alone appends what each call received. The
**runtime view** gains the timing and the injectable base. The **process view**'s file table gains the instruction
files, which it had never listed, and the capture file. No package, edge, process, channel, message kind or owner
of state changed.

**The version guard and the reported version (first-release plan §4.1, built 2026-09-27).** `tools/release-guard` is a
new build-time package — `pnpm release:guard <tag>`, the pre-build guard of REQ-STARTUP-028 over the product version and
REQ-STARTUP-059's package pins — and `tools/release-naming` gains the release-tag grammar (REQ-STARTUP-027/029). Tools sit
outside the component view's runtime matrix (`boundaries/ignore` covers `tools/**`), so `module-map.md` names the package
and no edge moves. In main, `shell.hello`'s version now comes from `main/version.ts`, which reads the application
manifest beside the bundle, rather than from `app.getVersion()`, which answered Electron's own version for the unpacked
entry. The gate round that reviewed it moved the reader into `@rotaris/platform` (`version.ts`, an existing edge for
both roots) because the **run host** reads the same file: the MCP client's `clientInfo.version`, a literal `0.1.0`
until then, is now the declared version on all three connection paths. The **process view** says so in the About
paragraph and gains the manifest as a file main and the run host read; the **runtime view**'s MCP paragraph names who
the client says it is. No process, channel, message kind or state owner changed.

**The two bundled assets (first-release-plan.md §4.4, built 2026-09-27).** `tools/build-id/` joins `tools/notices/` as a
build-time tool: `pnpm build-id` writes `apps/desktop/resources/build-id.txt`. `pnpm package` runs both tools before
freezing, and `electron-builder.yml` carries both files to the root of `process.resourcesPath`. It leaves the tool
server's dist-info licence out of the artifact (REQ-STARTUP-015). The **component view** gains a section for the writer
and the two script modules, and the **process view** gains the identifier's row in "Files and directories on disk", an
updated notices row and a corrected About paragraph. No package, edge, process, channel, command or message kind
changed. `about.ts` reads what it read before. The gate review later that day renamed `lib/bundled-assets.mjs` to
`lib/about-assets.mjs`, ~~because REQ-STARTUP-143's "bundled asset" is a font family or the icon set~~ because
`tools/notices/bundled-assets.json` already holds the bundled assets that carry a licence file. It moved
`package.mjs`'s closing lines into a third script module, `lib/package-verdict.mjs`. The **component view**'s section
says both. The scripts now import two constants and `normalize` from the tools, which is not an edge the boundary rule
governs. Nothing else in the views moved. *The review's second round struck the reason: the specification counts both
About files among its bundled assets (domain 12's appendix, REQ-SHELL-140). The component view's sentence saying
otherwise is corrected, and the section now names the flag's usage check and the proof's use of the writer's list of
git's redirecting variables. The stash's ledger and removal branch stay inside its module. Nothing else in the views
moved.*

**The notices generator, and the About page's lookup (first-release-plan.md §4.3, built 2026-09-27).** `tools/notices/`
is a build-time tool, not a package: `pnpm notices` computes the shipped closure offline and writes
`apps/desktop/resources/THIRD-PARTY-LICENSES.txt` only when REQ-STARTUP-143's validation passes. Main's About reader now
looks for the file under REQ-STARTUP-141's name; it had looked for a lowercase name. The **component view** gains a
section for the tool, and the **process view** gains the file's row in "Files and directories on disk" and a corrected
About paragraph. No package, edge, process, channel, command or message kind changed. The gate review later that day
changed two things inside the tool. A licence file that only refers to the licence, or only attributes, is no longer
counted as the text (OQ-75). The LGPL address must now have an address's shape. No view changed for either: both
are internal to `notices.mjs`, and it still reads and writes what the component view says. The review's second round
changed three more things inside the tool. The address check refuses the placeholders it still accepted. An input that
is not a JSON object fails as unparsable. A directory where the output goes is a handled error. No view changed.

**Product-drawn main-window chrome (`PD-SHELL-003`, built and revised 2026-09-24).** On Windows, Linux and macOS the main
`BrowserWindow` is frameless with its native menu hidden. The existing title bar now ends in minimize,
maximize/restore and guarded close controls; four renderer commands reach the sending window in main.
Auxiliary-window senders are refused before those commands act. The **process view** gains those command
kinds. No package, process, channel or state owner changed.

**The terminal on Linux (defect round, 2026-09-24).** Two repairs, no structure moved. A background session is started
as the leader of its own process group on POSIX (`spawnChild`'s new `processGroup`), so `send_signal` and the tree kill
reach it. PD-TOOLS-001's POSIX capture is encoded so the emulated screen cannot wrap it. No view text describes either
at this depth, so no view changes beyond this entry. *Falsified 2026-10-06, kept as written above:* the screen does wrap
the capture's 76-column rows below 76 columns (REQ-TOOLS-128 narrows it to 20), and the parse now joins the rows back
([the note](../../defects/fixed/the-shell-state-snapshot-is-corrupted-on-a-screen-narrower-than-its-rows.md)); still no
view text at this depth.

**An immediate exit closes the child windows first (defect round, 2026-09-24).** On Linux, `app.exit` over an open
modal child window segfaults inside Electron, which is how every live-run sign-in there ended. The capture seam's exit
and the driver's `quit` now go through `exitCleanly` (`main/exit.ts`). The **process view** gains one sentence; no
package, edge or message kind changed.

**Configured rates price a request (`PD-MONITOR-001` revision 2, built 2026-09-23).** A request the provider did not
price is priced at the ladder cell from the configured rates of the model it was sent to, exactly, and the run's
total carries one of four qualifiers, persisted in the new `sessions.cost_qualifier` column (appended migration
**v21**). A configured price is read from the YAML scalar's source text (`config/prices.ts`), in the configuration
files and in the discovery snapshot. The **runtime view** moves: "What a step costs" is rewritten, and §7 names v21
and the column. No package, edge, channel or message kind changed; the `usage.update` payload is unchanged.

**Money moves to `kernel` (ADR-0031 accepted narrowed, R-049).** `engine/money.ts` becomes `kernel/money.ts` and
gains the two operations pricing needs: exact multiplication by a whole token count, and `amountFromText`, which
reads a number's text as the decimal it states. A price is read in `config` and summed in `engine`, and `config`
may not import `engine`. `model/reported-cost.ts` now expands a reported figure through the same reader.
`rotaris/money-only-in-money-ts` (ADR-0031 consequence 2) makes `money.ts` the one place arithmetic on an amount
lives. The **component view** (the kernel box), `module-map.md` (the kernel row) and the runtime view's file
reference move. No edge changed: `model` → `kernel` was already allowed.

**A delegated child's write scope (`PD-TOOLS-006`, built 2026-09-23).** `delegate` takes `write_scope`; a live
scoped child claims the paths it matches, and the gate refuses a `write_file` or `haet_edit` write into a claimed
path to every other agent of the run except the child's descendants, ahead of the permission resolution. Each child
is told the live scopes in a block after the workspace-root line of its payload. The glob compiler moved from
`agent-tools/tools/search.ts` to `kernel/glob.ts`, because the engine and the tools both read the dialect and
import neither each other. The **component view** (the kernel box), the **runtime view** (§4 gains "Write scopes"),
the **state-ownership view** (one in-memory row) and `module-map.md` (the kernel row) move. No edge, channel, message
kind or store column changed.

**A child's provider requests reach the run's totals (defect round, 2026-09-23).** `IterationChildren` built a
child's turn with no `onRequestUsage`, so the session's tokens, its cost and every `usage.update` counted the
entry agent alone. `ChildrenDeps` now carries the run's own callback into every child's turn, at every depth.
Only the **runtime view** moves: one sentence in "What a step costs". No package, edge, message kind or store
column changed. It is the prerequisite `PD-MONITOR-001` revision 2 names; the defect note moves to
`docs/defects/fixed/`.


**One instruction-file set, two readers (defect round, 2026-09-22).** The retrospective held its own copy
of REQ-WORKSPACE-041's discovery rule — the two names at the workspace root, and no policy at all — so it
read files the user had switched off and could still propose edits to them, while injection honoured every
switch. `SkillHost.instructionFiles` is now the one computation: `workspaceContext` calls it, and
`dispatch`'s `retrospective.capture` hands its result to `captureRetrospectiveJob`, which discovers nothing
of its own and reads nothing when handed nothing. `02-process-view.md`'s retrospective paragraph and
`03-runtime-view.md`'s context-unit paragraph both move. Whether a switch stated over what agents are
*given* binds an *analysis* is **OQ-65**; the build proceeds under "it does". The defect note moves to
`docs/defects/fixed/`.

**Workspace-context injection fills the first context-unit slot (PD-WORKSPACE-002).** The slot
`03-runtime-view.md` carried as "not built" since ADR-0063 now holds the merged instruction context:
`SkillHost.workspaceContext` discovers the present files over the workspace root plus five further bases,
drops the ones the per-file `instructions.overrides` policy switches off, merges the rest in discovery
order, and caches the block per workspace root for the session's lifetime. Both the runtime view's prompt
section and its configuration section move; `04-seams.md` §5 gains the files a Settings-**editable** key
needs past the six a plain key needs. **`REQ-WORKSPACE-050`'s worktree half is now built** (2026-09-22): the
instruction files are read from the root the run executes in while the skill catalog stays with the base
workspace, the execution root travelling through `configure`'s context, and the merge cached per base root
**and** per execution root. The defect note moves to `docs/defects/fixed/`.

**The requested permission mode always applies (PD-TOOLS-002).** No unattended downgrade: the
requested mode is the effective mode for every agent, for the whole run. `03-runtime-view.md`
carries the announcement without a downgrade row; the sandbox proof's scenario 4 keeps the mode.

**A mid-session mode change reaches the agents built after it (REQ-TOOLS-073's second half).** The
recorded defect — a switch to `autonomous` leaving every delegated child asking — was the missing
half: `Sessions` now holds a per-run override, the run records the requested name into it, and the
tool port selects at construction through `selectRequestedMode` (pin, then override, then
`runtime.permission_mode`, REQ-TOOLS-048), with the persona pin carried out of the configuration at
last. A change that would loosen a pinned agent does not reach it and names the persona
(REQ-TOOLS-074). `03-runtime-view.md` §5's control row states both halves.

**The relay sheds dead sinks (REQ-MONITOR-226 intent).** `relaySequenced` and `broadcast` isolate per sink:
a `send` that throws (disposed render frame) detaches the sink and delivery continues to the survivors.
`render-process-gone` detaches at once; the channel-3 limiter sheds the same way; `ProcessLink` isolates
per event listener. Recorded in `04-seams.md` §2.

**The member card opens by its row identity (REQ-CHAT-059/061/166).** A group member's card is keyed by
`memberKey` (`Row.tsx`) — the member's own `rowKey`, the identity step 4 holds the caps against — instead
of `callKey ?? index`, which stranded from `rowKey` on every member without a call key. No view file moves:
the projection (`project.ts`) reads one spelling from the one set, both surfaces toggle the same spelling
through one definition, and `RowProof`'s seeded-open variant (`activityProofDisplaysMemberOpen`) is the
projection half of the same gesture, so the change is recorded here and not in a view.

**The composer's compact strip (PD-CHAT-001 revision 3).** The strip shortens its controls to
their icon behind its own `data-compact` state — `tight` below 900 px, `narrow` below 700 px of the
dock's own width, read by a `ResizeObserver` on the dock (`stripDensity` in `WorkspaceView`).
`tight` shortens reasoning, run-start mode, permission mode and the estimate; `narrow`
additionally shortens persona and model; attach, stash, steer, pause and the send pill never
shorten. A shortened value stays mounted for the probes while CSS hides it; the compact tooltip
names control and choice. The token estimate is drawn once, on the strip. The seams view's §8
carries it; no view diagram moves, because no package, edge, process, message or ownership moves
with it.

**The composer's docked strip (PD-CHAT-001 revision 2).** The field and the strip share one outer
contour (`WorkspaceView`'s `composer__dock`: textarea above, 34 px `composer__strip` below); every
composer control stands on the strip and no second chip row is drawn. The pickers are shared
objects — `SearchableSelect` and `PopoverMenu` take a `strip` prop that switches only their
trigger's shell — and the send is `SendPill` in `design-system/forms.tsx`. The seams view's §8
carries it; no view diagram moves, because no package, edge, process, message or ownership moves
with it.

**The Start session dialog fits the minimum window (REQ-SHELL-022/125).** The panel caps at the
viewport with the three sections scrolling under a fixed head and foot; run-start mode stands first.
No view file moves — the dialog is drawn by the renderer composition root, not by a primary view —
so the change is recorded here and not in a view: `StartSessionDialog.tsx` (`START_SESSION_LAYOUT`
containment + hit-test contracts), `shell.css` (the cap, the scroll region, the fixed actions row),
`layout-regression.test.ts` (the pinned rules).

**The `plan_cycles` cascade (store v20, REQ-SESSION-166).** `03-runtime-view.md` §7 carries v20: the
plan-cycles table rebuilt with `REFERENCES sessions(session_id) ON DELETE CASCADE`, so a session
delete takes the VERBATIM plan text with the record; already-orphaned rows are dropped by the
migration. Fifteen dependent tables, not thirteen.

**The retrospective pass (Part AT — `PD-LIBRARY-002`, ADR-0065).** A second analysis pass over the workspace's own
record, reached by a gesture rather than by a run ending, and reusing the post-run lifecycle whole. `02-process-view.md`
gains the message (`retrospective.capture` to the run host, answered with the existing `improvement.job` event or
`retrospective.no-model`) and the run-free branch of `improvement.analyze`, which takes its backend and credential from
the configured workspace instead of a run context. `03-runtime-view.md` §7 carries store **v19** — `source_kind` on the
artifact and a `source_session_id` relaxed to nullable, by a table rebuild inside the migration's transaction — and the
three configuration keys the directive fixes (`retrospective_model`, its thinking companion, `retrospective_timeout`).
`05-state-ownership.md` gains who owns which pass is running, and who may write the activity a surface draws. What did
NOT move is the point: the FIFO, the cancel, the shutdown discard, the save, the review surfaces, the executor, the
checkpoints and the rollback are the same objects, because a retrospective proposal is an ordinary proposal. The two
activity indicators (REQ-LIBRARY-125/126) were specified in Part AF and drawn by nothing until this part built them,
once, for both passes.

**The plan gate takes the reading area (PD-ORCH-002 revision 2).** `03-runtime-view.md` gains the two states
the gate is drawn in and who owns the choice between them: expanded it takes the free space and no transcript
is drawn beneath it, collapsed it is a bar above a transcript reading under REQ-CHAT-010's floor, and the three
answers stand in both. `WorkspaceView` holds the state because the grid is what changes with it.

**The run host stopped starting itself at import.** `apps/desktop/src/run-host/index.ts` held thirty-six
module-scope bindings, which meant that IMPORTING the run host started one: the MCP host, the confinement
service, the terminal manager and the code-intelligence launch all came up as a side effect of the module being
loaded, so nothing in this process could be reached from a test at all. They are `createRunHost()` in `host.ts`
now — the same bindings in the same load-bearing order, built when the function is called. The five hundred
lines that answered requests are `dispatch(req, host)` in `dispatch.ts`, taking what they need as an argument
rather than closing over module scope; two bindings that change after the host is built (the terminal manager,
which arrives asynchronously, and the live state, which a command writes) are reached through the host every
time rather than copied out of it once. The scripted model client — two hundred and fifty-seven lines of
verification-only stand-in that every proof runs against, read past by everyone editing the dispatch — is
`scripted-client.ts`. `index.ts` is 53 lines: build it, listen, announce ready. **No product behaviour moves**:
the dispatch answers the same kinds with the same bodies, and `pnpm part-h-proof` and `pnpm skills-proof` both
drive the rebuilt binary end to end. The seams view's stop 4 and the process view's **run host** row carry it.

**The renderer root became five modules, and its first test.** Five hundred and ninety-four lines came out of
`apps/desktop/src/renderer/main.tsx`, which is now the main window and nothing else. What a window HAS is
`shell.ts` — the bridge, the replica, the two stacks, the terminal registry, the display preferences, the theme
and the session gestures, wired to the numbered channels once per window. What those gestures ARE is
`session-actions.ts`: eleven functions that take the bridge and the replica as **arguments**, which is the whole
difference, because `session-actions.test.ts` now drives all eleven with two plain objects and no window, no
preload and no main process — the first tests renderer code has ever had, and they pin the refusal discipline
that was already wrong once (a refused control carries the ENGINE's words, not the caller's sentence). What the
other windows ARE is `windows.tsx`: six roles over one `mountWindow`, which is the four copies of "ask main for
the payload this window was opened for, and draw its headline instead when main refuses" written once. What a
transcript surface READS is `session-view.ts`, shared with the persona window so "which persona is the entry
role" has one answer (REQ-MONITOR-057/058) rather than two. The theme moved the same way: adopting one is three
moves that must happen together, it was written out four times, and a fourth copy that forgot the third would
have left the document restyled and React drawing the old palette. **No product behaviour moves**: every body
is the body it was. The seams view's §1 gained the rule for choosing which side of the renderer a send belongs
on; the process view's **renderer** row and the module map carry the rest.

**Every renderer command became a module, and the seam that names them a table.** One thousand and fifty-six
lines came out of `main()`'s `runCommand` and into `apps/desktop/src/main/commands/` — sixteen facets, one per
family, beside `context.ts`. What the switch could only do by being read, the table now does by compiling:
`CommandHandlers` is **total** over `CommandRequest['kind']`, so a kind the contract declares and no facet
answers fails the build where it used to answer `command.unimplemented` at run time. Building it found one such
kind already there (`shell.switchView`), which is now a named line rather than an absence. `CommandContext` is
the other half: the closure `runCommand` was written inside, given a name, so a facet can declare the slice it
uses and a test can satisfy that slice — `commands/mcp.test.ts` drives real handlers in six milliseconds with a
plain object where the run host is, which was not possible at all before. The checkpoint family's seven gates
moved with their commands; main keeps only the holder the quit path waits on (REQ-GIT-101). **No product
behaviour moves**: every handler body is the case body it was, `runCommand` still answers for the window that
raised the command (REQ-SHELL-020) and still lets nothing throw (ADR-0019). The seams view's §1 carries the new
stop 2 and the rule for choosing a facet; the process view's **main** row and the module map carry the rest.

**The capture script became a module.** Six hundred and forty-six lines came out of `main()` and into
`apps/desktop/src/main/capture/` — the step grammar and the host main gives it (`host.ts`, and the grammar
now has a test), the part a shipped build still answers (`probe.ts`), the scriptable half (`seams.ts`) and
the theme proof's pass (`theme-proof.ts`). The last two are reached only by a dynamic import inside
`if (__ROTARIS_SEAMS__)`, so a packaged build does not merely branch past them: the chunk is unreferenced
and never emitted. **No product behaviour moves** — the seams fire at the same times, on the same
variables, through the same `runCommand`. What moved with it is the check that guards the gate: it now
reads every emitted file of the main section rather than `index.js` alone, since a chunk is exactly the
shape that surface could come back in. The process view's **main** row carries both. Measured the same day:
the package-mode build carries none of the eleven forbidden names anywhere in `out/main/`, the dev build
carries them in one chunk and the widened check refuses it, and the built app captured a window driven
through `_VIEWS`, `_EVAL_AT` and `_PROBE`.

**The navigation pass** (2026-09-16). Three views became six, and nothing about the system changed with it: `04-seams.md`
(the ordered edit path for the eight additions this product makes most often), `05-state-ownership.md`
(six homes, one writer each, consolidating facts that were already written down in three places) and
`06-sequences.md` (launch, the approval round trip, and the board's release → run → review → accept — the
three flows that cross every process and had no home). Each existing view gained a section router, and the
reconciliation chain moved to [`reconciliation-log.md`](reconciliation-log.md) so that "consult before
modifying" costs a page. **No package, edge, process, message kind, channel, command, window role, store
table, run-loop step or control operation moves**, because no code changed: this commit is documentation
only, and the three views that existed before it say exactly what they said.

The code reconciled the same day is in the log with everything before it: the cost a metered provider
reports (`PD-MONITOR-001`), no loop supervision while the plan gate holds a run (`PD-ORCH-001`), one activity
line per working agent (`PD-CHAT-004` revision 2 and `PD-CHAT-005`), the timed-out child asked to land, the
MCP child's stderr and the catalogue readers' duplicate read. This pass moved those entries; it did not
change what any of them says.

Everything reconciled before this date is in [`reconciliation-log.md`](reconciliation-log.md), newest first.
