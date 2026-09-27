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

## Last reconciled with the code: **2026-09-27**

**The application log keeps `info` and above (`PD-MONITOR-002`, built 2026-09-27, R-055).** Main's standard output
carried the level of a forwarded line as text inside it and none on main's own, and recorded every level. Each line
now carries its level in a column of its own, and a line below the threshold is not written; the threshold is `info`,
moved only by `ROTARIS_APP_LOG_LEVEL`, read once at start. Main's own reports of a loss are `error` — a
`shutdown` a child did not answer at quit among them, since an exit of 0 does not prove one — so a crash is still
recorded at a higher threshold. The level, the predicate and the line are the new
`main/app-log.ts`; `index.ts` keeps the wiring. The **process view** gains a paragraph on the application log, the
`log` event names its fields, and the MCP-child paragraph says `debug` is now a filter; the **state-ownership view**
gains the threshold as a fact nobody writes after start. No package, edge, process, channel, message kind or store
column changed.

**The run's model calls outside an agent's turn are counted (defect round, 2026-09-27, R-054).** Compression, the
child-report summariser, the intent classifier and the loop supervisor's classifier discarded the usage their
requests reported, so the run's tokens, its cost and `usage.update` missed them (REQ-EVENTS-053, PD-MONITOR-001).
Each now calls through `meteredBackend` (`engine/run/metered.ts`), a decorator on the `AgentBackend` port that hands
every completed request to the new `Run.countUsage`. `PreflightContext` gains `countUsage` and the `Sessions`
`supervisor` factory a third argument, so the run host's two classifiers are wrapped where they are built. The
**runtime view** moves: one passage in "What a step costs". No package, edge, process, channel, message kind or
store column changed.

**Product-drawn main-window chrome (`PD-SHELL-003`, built and revised 2026-09-24).** On Windows, Linux and macOS the main
`BrowserWindow` is frameless with its native menu hidden. The existing title bar now ends in minimize,
maximize/restore and guarded close controls; four renderer commands reach the sending window in main.
Auxiliary-window senders are refused before those commands act. The **process view** gains those command
kinds. No package, process, channel or state owner changed.

**The terminal on Linux (defect round, 2026-09-24).** Two repairs, no structure moved. A background session is started
as the leader of its own process group on POSIX (`spawnChild`'s new `processGroup`), so `send_signal` and the tree kill
reach it. PD-TOOLS-001's POSIX capture is encoded so the emulated screen cannot wrap it. No view text describes either
at this depth, so no view changes beyond this entry.

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
