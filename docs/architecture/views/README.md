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

## Last reconciled with the code: **2026-09-18**

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
