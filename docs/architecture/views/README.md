# Architecture views — the system as built

Three perspectives on the codebase as it stands, drawn from the code and kept in step with it. `codebase.md`
is the *map* (where work lands, what stands in, what is owed); the ADRs are the *decisions*; these views are
the *picture* — what exists, how it is cut, how it runs.

| View | Question it answers | File |
|---|---|---|
| Component | What are the parts and which may depend on which? | [`01-component-view.md`](01-component-view.md) |
| Process | What runs in which OS process, and what crosses each boundary? | [`02-process-view.md`](02-process-view.md) |
| Runtime | What happens, in order, when a run starts, executes, is controlled and ends? | [`03-runtime-view.md`](03-runtime-view.md) |

## Maintenance rule

These views are part of the record, not documentation written after the fact. Two obligations bind every
change to the code (stated in `CLAUDE.md`):

1. **Consult before modifying.** Before changing code, read the view that covers the area — the component
   view for a new dependency or package, the process view for anything crossing a process boundary or a new
   message, the runtime view for the run loop, the controls, the store or the configuration tiers.
2. **Maintain after modifying.** When a change adds, removes or moves a package, an allowed edge, a process,
   a message kind, a channel, a command, a store table, a run-loop step or a control operation, update the
   view in the same commit. A view that disagrees with the code is a defect of the change that made it so.

The diagrams are Mermaid; GitHub renders them. Names in the diagrams are the names in the code.

Last reconciled with the code: **2026-09-16** — **one activity line per working agent** (`PD-CHAT-004`
revision 2 and `PD-CHAT-005`, first executed): a run is bounded by its agent alone, so concurrent agents
interleave two lines instead of chopping each other's into fragments; the collapsed line carries one segment
per tool family with that family's totals; the role line takes the persona's colour and a delegated agent's
rows indent one step per level. Only the **component view** is affected — the `ui/transcript` note says what
`project.ts` now decides and where the depth comes from. No package, edge, message kind or store table moved.

Previously reconciled, the same day: **the catalogue readers' duplicate read** (defect AO-3):
a `prompts.roots.read` or a `skills.read` still in flight is the window's answer, so a second caller joins it
instead of starting another; a launch had put two identical reads on the wire in the same millisecond, because
the registrar's effect and the configuration key's both start one before either has an answer to find. Only the
**process view** is affected — the prompt-commands paragraph says when a read is joined. No package, edge,
message kind or store table moved.

Previously reconciled, the same day: **the MCP connection's noise** (ADR-0033's first
execution against a real third-party server): the protocol era a server has already answered with is
remembered for the process, keyed by what is launched, so `ToolDiscovery`, `SessionConnections` and
`HealthProbe` probe it once between them rather than each; and a child's stderr is forwarded at
**debug**, which the run host had been flattening to `info`. Only the **process view** is affected —
the run host's held state gains the era memory, and the MCP-child paragraph says what level a child's
stderr reaches the log at. No package, edge, message kind or store table moved.

Before that, the same day: **the plan gate's three repairs** (REQ-ORCH-153,
REQ-ORCH-082, REQ-TOOLS-032): the held segment's one turn now carries `planRequestSection` on both the task
string and the initial content parts, so the producing role is told a plan is what is wanted; the dispatch
check refuses a name that IS a tool and lets a name that is no tool reach the unknown-tool answer, for which
`createToolPort` hands the gate the set of names it removed at the gate; and a cancel taken at the gate writes
REQ-ORCH-082's first arm in the same durable act that resolves the cycle. Only the **runtime view** is
affected — no package, edge, process, message kind, command or store table moved, and the new module sits
inside `engine`'s existing `run/` directory. Three defect notes, each archived on landing.

Previously reconciled: **2026-09-15** — **project initialization** (ADR-0064, first executed): the
task registry, the persisted marker and the five set derivations in `config/src/init/`, the coordinator in
**main** because the marker's one writer is the workspace service and the one shipped task's work is the run
host's and neither may import the other, `initialization.*`'s five commands and the run host's new
`mcp.setupStatus` push, channel **12** carrying REQ-WORKSPACE-105's nine values to every window, and the
`initialization:`/`project_init:` pair read **outside the layered merge** because REQ-WORKSPACE-078 names one
file. The component view carries the module and the placement reason, the process view the commands and the
channel, the runtime view the pair's place among the configuration tiers and why the execution re-reads before
each recording. **No implementation condition is raised or discharged**: every behaviour is demonstrable on
`win32` and was demonstrated there (`pnpm init-proof`, five scenarios).

Previously reconciled: **2026-09-15** — **the activity line** (`PD-CHAT-004`, first executed): one
agent's uninterrupted run of tool and streamed-reasoning rows is a single displayed row that **changes rather
than grows**, so a working agent appends nothing and two working agents cannot contend for the tail. The change
is confined to the `ui` package's transcript module and adds **no edge and no message**: `project.ts` decides
the run boundary from the agent and `display/showReasoning`, `types.ts` gains `ActivitySegment`, and `Row.tsx`
draws the segments and the one continuous persona rule the revealed members hang from. Only the **component
view** is affected; the process and runtime views are unchanged, because no process, file or message moved. The
same change repairs a defect note (removed once repaired): a folded run's role is now its agent.

Also **2026-09-15** — **the search pattern dialect**: `grep` and `read_file`'s
`grep` filter compile through one helper that reads leading `(?flags)` groups, so a pattern the pinned
accelerator accepts is not refused in process (a defect note, removed once repaired,
[R-018](../../product/requests.md#r-018)). The runtime view carries it beside the executor list; no package
edge, message or process changed.

Previously reconciled: **2026-09-15** — **OS-level confinement** (ADR-0022, first executed): the
`confinement/` module inside `agent-tools` (the shared specification, the two thin renderers, the single-purpose
quoting, the availability probe), the probe settled in the **run host** before a launch does anything else and
the gate that refuses such a run before the lease, the session row or the lock exist, `confinement.status` as the
one message the settings label and the launch dialog both read, and the store row's stale "recorded, not
honoured" note corrected. The component view carries the module, the process view the message and where the
verdict lives, the runtime view the gate's place in the start sequence. **IC-8 is open**: the renderers are
written and unit-tested, and `REQ-SANDBOX-127`'s six observable effects have been demonstrated on neither
supported platform.

Before that: **2026-09-15** — **portable skill discovery** (ADR-0063): the pure discovery
library in `config/src/skills/` (the run host may not import `workspace`, and injection happens at agent
construction), the catalog the run host owns because REQ-WORKSPACE-058 clears it at session creation rather
than per run, skills as ordered context units composed at every agent construction, the cataloged directories
as additional read roots, the four `skills.*` commands renderer→main→run-host, and one native chooser. The
component view carries the package and the responsibility row, the process view the run-host ownership and the
message family, the runtime view the system prompt's composition and the `skills:` block's place among the
tiers. **No package, no allowed edge, no process, no channel, no store table and no control operation moves.**

Earlier — **2026-09-14** — **the continuation lease**: `session.continue`, `session.prompt`
and `session.planDecision` re-ask main for the credential lease before the continuation run resolves its setup
(REQ-PROVIDER-066), so a resumed session's first model call no longer goes out without a bearer after an
application restart; the runtime view carries the mechanism. Earlier the same day: **the post-run improvement
analyst** — the run host captures a fixed, bounded terminal-state snapshot and executes a no-tools analyst; main
owns one application-wide FIFO, cancellation and the activity publication; the workspace service remains the
single improvement writer. Schema v18 carries the immutable session run type, durable session-to-artifact
association, current records, immutable versions and both gap counters. The component, process and runtime views
carry the package responsibilities, messages, channel and tables.

Earlier the same day — **`PD-LIBRARY-001`'s closeout (the hundredth defect)**: the engine
artifact port's private section list is replaced by contracts' `ARTIFACT_SECTIONS` (an internal definition, not a
new edge — the port already imported `@rotaris/contracts`), and `pnpm artifacts-proof` gains its sixth launch with
a verification-only `terminal:<key>` scripted-dialect step. The closeout follow-up makes the model-facing filtered
read byte-exact, records the observed value, opens the report in the inspector, and reconciles REQ-TOOLS-148 with
the directive. **No package, edge, process, message kind, store table, run-loop step or control operation moves**;
the `artifacts` table's `commands` column (v16) is already recorded in the runtime view and the diagrams are unchanged.

Previous reconciliation: **2026-09-13** — **the workspace chrome density pass**: the Inspector's persona
tab strip is replaced by a `PopoverMenu` picker (the design-system's `overlays.tsx` unchanged, one more consumer;
`REQ-MONITOR-050`'s grouping kept, no spec figure touched), the composer's input is capped at 120 px and its
actions band is one row at ≥1180 px (UIR-009's two-row composition kept below the breakpoint), the run header /
toolbar / intent bands tighten to the mockup's rhythm, and the agents panel header becomes the mockup's 40 px bar
with a live agent count. All spacing craft under the adopted design language — no requirement narrowed.

Earlier the same day — **the composer declutter (R-010, PD-CHAT-001)**: the component
view's `ui/design-system` section gains `overlays.tsx` (`PopoverMenu`, the press-revealed value chip), taking the
brief count to twenty-nine; the Workspace view's reasoning-effort, run-start-mode and permission-mode chips present
through it, the persona and model selects gain leading icons, and the explanatory hints of the composer's
attachment, stop and queue controls moved into tooltip-plus-accessible-description pairs. **No package, edge,
process or window role moves, and `CONTROL_OPS` is untouched.**

Earlier the same day — **run-local launch permissions (R-009, REQ-TRACE-470/471)**:
the process and runtime views record the per-launch board grant, configuration capture before credentials,
session-owned run ports, and runtime launch-audit evidence.

Earlier the same day — **the plan gate (REQ-ORCH-152 to REQ-ORCH-154, ADR-0062)**: the
runtime view's run-start order gains the hold, a new paragraph covers the plan cycle and the park, its
session-command paragraph gains the two answers and the one-way release, and its store section moves to **v17** with
`plan_cycles` beside two new `sessions` columns; the process view's renderer → main family gains `session.planEdit`
and `session.planDecision`, stated as session commands and **not** control operations. **No package, edge, process
or window role moves, and `CONTROL_OPS` is untouched.**

Earlier the same day — **the session-lifecycle work package (A3, A6, A9, OQ-8, OQ-12,
OQ-41, OQ-42, OQ-46)**: the runtime view's teardown paragraph is corrected — it still put **the lock release inside
the terminal transaction**, which A3 moved to the end of guaranteed cleanup, and the code had not done that since A3
was applied; it also now records that main does not present `run.result` as a notice when that result carries
`persistence: {confirmed: false}`, the run host having already published the one failure notice REQ-EVENTS-088
allows. The process view's `run.result` gains that optional field. The repair's timeline entry is
`session.interrupted_recovered` throughout, REQ-SESSION-062's fixed shape, where three views and two ADRs carried the
invented `session_marked_interrupted`. **No package, edge, process, window role, store table or control operation
moves**; one message kind gains an optional field and one run-loop step changes cadence (`usage.update`, now one per
completed provider request rather than one per iteration — OQ-8). Earlier the same day — **UIR-014 repaired and its whole class made deterministic**: the
component view's `layout-contract.ts` paragraph gains `shrunkBoxes`, the one question asked of every marked box
rather than only of the boxes that published a relation — a box standing smaller than the content inside it, on an
axis that does not scroll, where nothing is clipped and the remainder pays out under whatever paints next. The
repair itself is one declaration (`.page-header { flex: 0 0 auto }`), and **no package, edge, process, message kind,
channel, command, window role, store table, run-loop step or control operation moves**. Earlier the same day —
**all twelve critic findings, repaired** (R-008): the component
view's design-system section gains `Checkbox` (the twenty-eighth brief, closing **OQ-57** — the adopted material
defines none, and the owner ruled that the product draws one), and the count moves to twenty-eight briefs and thirty
exports. Six named sizes join the theme data — two control heights read off the adopted `.btn` and `.btn-compact`, a
prose measure read off `.empty-state-hint`, and a label column, a field minimum and a tick width the material does not
state — so nothing in the repairs resolves to a dangling token. **No package, edge, process, message kind, channel,
command, window role, store table, run-loop step or control operation moves**, so the process and runtime views are
unchanged: what changed is what a surface measures, not what crosses a boundary. Before that, **2026-09-12** — **the
adopted design language, drawn once**: the component view gains
`ui/design-system` and a responsibilities row for it — the twenty-seven component briefs as one typed layer, the
verification-only `UiLayoutContract`, and the guard (`tools/check-ui-language.mjs`) that makes it the only place in
`packages/ui/src` or `apps/desktop/src/renderer` where a design-equivalent control is written. **Edges are unchanged**
(`ui → kernel, contracts, ui-core`; the layer imports only `react`), and no process, message kind, channel, command,
window role, store table, run-loop step or control operation moves with it, so the process and runtime views are
unchanged: sixty-nine drawing files changed what they *call*, not what crosses a boundary. `pnpm ui-review` and the
theme matrix drive the existing driver seam the process view's main row already carries, and add no seam of their own.
Earlier the same day, **PD-LIBRARY-001, the commands a child ran**: the store moves to
**v16**, one column (`artifacts.commands`), which is the whole of the change these views can see — no package, no
allowed edge, no process, no message kind, no channel, no command and no run-loop step moves, and the column is
noted on the `artifacts` row of the runtime view beside the v12 that created the table. Earlier the same day,
**deepening main-window lifecycle**: the inline main-window
lifecycle, registry, startup resolution, chooser gates, add/replace flows, hand-over routing, and per-window deferred offers
are now encapsulated in `MainWindows` (`apps/desktop/src/main/main-windows.ts`) with Electron and in-memory adapter seams;
window records and listener registrations are guaranteed prior to renderer loading, and failure to load unregisters and
destroys cleanly; earlier the same day, **opening a project from inside the application**: every main
window is built by one builder and lives in a registry keyed by `webContents` id, which is what makes a
second main window possible and makes a command answerable for the window that sent it; the renderer gains one
command, `workspace.choose`, carrying no folder so that main owns the gates and the chooser; and main gains the
`workspace/lastOpened` preference key that no renderer may name. Both are in the process view — the main row and
the renderer → main command list. Later the same day, the two product directives: that command gains a `newWindow`
flag (an added main window, no gate evaluated, nothing closed) and **channel 8's payload gains an optional
action** — the transient acknowledgement may carry exactly one, a closed one-member type that leaves
REQ-NOTIFY-044's banner vocabulary and REQ-SHELL-115's closed list untouched; the process view's command list
carries both. No process, channel, message kind, store table, run-loop step, control
operation or package edge was added or moved, so the component and runtime views are unchanged, and the window
role set is unchanged with them: a second main window is another window of the `main` role rather than a new
role. Before that **2026-09-11** — three times that day. Third, the **driver seam**: main gains a
loopback control socket under `ROTARIS_DRIVER` (verification only — `main/driver.ts`, `pnpm app:drive`,
`pnpm driver-proof`), carried in the process view's main row beside the capture seams — which the same day stopped being shipped at
all: the seams are now compiled in behind `__ROTARIS_SEAMS__` and a packaged build carries none of the
scriptable ones, the main row saying which three survive and why; no process, message kind,
channel, command, window role, store table or control operation was added or moved with it, so the component and
runtime views are unchanged. Second, the **OQ-38 ruling**: the run host's flush is armed by input the USER has directed at a stream whose control they have taken, never by output and never by an agent's own `is_input` call (`REQ-CONFIG-117`), and the process view's run-host row carries the narrowed condition; no message kind, channel, command, role, table or control operation moved with it. First, wave 3, Parts R″/T″/C″: channel 3's delivery bound is **one budget across every window taken together**, not one per window — defect T2-1, and the process view's live-terminal and main-to-renderer paragraphs carry it; no message kind, channel, command, window role, store table or control operation was added or moved by any of the three lanes); before that **2026-09-10** (wave 2, Parts AJ′/AK′/AP/AL′/AO: the requirements board and its five panes, the board's run half of the `requirements.*` family that only the system may speak, the terminal window's five commands and its role, `prompts.roots.read` and `notice.report`, and the renderer's board preference keys with the per-workspace fold key main resolves); before that **2026-09-09** (wave 1, Parts AJ–AN: store v15's `delivery*` tables — the runtime view's §7 row for them was written at the merge-1 proof pass, after this line had already claimed it — and channel 10 `requirements:changed`; the `requirements.*`, `traceability.*` and `terminal.*` message families; channel 3's first producer and its per-window delivery bound; the workspace service's worker thread; `ui/terminal`, `ui/slash`, `workspace/traceability`, `workspace/delivery`); before that **2026-09-08** (Part AH — context compression: the threshold's place in the turn's step
order, the ladder's `context_window` arm, the `Conversation`, the reconstruction and the `context_compressed` timeline
entry, `AgentRecord.compressions` and `contextLimit` now carrying the model's own maximum, and
`SessionRecord.compression`, all in the runtime view. No package, edge, channel, command or store version changed, so
the component and process views are unchanged. Earlier the same day, Part AG — the undrawn Settings categories: `shell.openThirdPartyLicenses`
and `shell.hello`'s three new local facts in the process view; the `display:` section's surface, its file spellings and
the Instructions presence check riding the configuration snapshot in the runtime view's tier section. No package, edge,
channel or store version changed, so the component view is unchanged. Before that, 2026-09-07, Parts AB and AC — the composer and the structured questions:
`composer.readDraft`/`writeDraft` and the three `display/*` keys plus `panels/workspace` in the process view's
command list, and the control channel's value space with the reason `answerQuestion` carries two flat maps rather
than widening it; the two new control operations, the `ask_questions` executor and its registry, and store **v13**'s
`queued_prompts.context_snapshot` in the runtime view. Before them, Parts Z and AA — the transcript: `ui/transcript` with the recycled
slot pool, the projection and the two bounded caches, `transcript/Row.tsx` as the one row renderer and
`TranscriptSurface.tsx` around it, `config/display-section.ts` and `model/reasoning.ts`, in the component view;
`shell.openExternal`, the three `display/*` preference keys and `session.pageOlder` now actually called, in the
process view; the `thinking` row, `upsertMessageRow`'s stable segment key, the stall detector, the `display:`
configuration section and a new §9 for what a surface does with a publication, in the runtime view. Earlier the same
day, Parts X and Y — the Library view: `ui/library` and `ui/markdown` in the
component view; the three `prompts.*` requests, the three `artifacts.*` requests and the ninth channel `library:changed`
in the process view; store **v11**'s two workspace-scoped prompt tables and **v12**'s `artifacts` row with its declared
index, and the artifact body files beside the session's other files, in the runtime view. Before that, **2026-09-06** — the repair of Part U's thirty-second defect — store **v10**'s
`timeline.id` and `timeline.severity` in the runtime view's table, and `timeline.append` named in the process view's
main → run host request list with the `severity` it now carries; then Parts V and W — the notice store's serialised chain with its record,
channel 8 and the per-window acknowledgement stack, `timeline.append` to the run host, `window.modality` and the family
modality in main's registry, `ui/commands`; and before them Parts T and U — the sentinel branch as a process shape under the run host, the
`mcp.setup` request, the `session.*` commands and requests, the fourth checkpoint ask and the save-dialog seam, process view; the
resources tree, the generator scripts, the sentinel and the generated module, component view; the enabled entry per run, the
binding, the probe, the setup steps, the repair unit's order, the delete's four steps and the export's read, runtime view. Before
that, 2026-09-05, Parts R and S — the persona window as a renderer instance, the window registry in
main, the `window.*` and `mcp.*` commands, the run host's `mcp.*` requests and its MCP child processes, process view; the record's
eight new fields and two MCP fields, the owner's coalesced publication, the session connections' lifetime, runtime view; `mcp`
no longer a placeholder, `kernel` gaining the code-point order, no edge changed, component view. Before that Parts P and Q — the checkpoint asks, requests and commands, process view; the
iteration-close capture, store v9, the ladder at the model step, the wait state and the two timeline memories, runtime
view; no package or edge changed, component view unchanged. Before that Parts N and O — the `fetch` executor and its per-call policy read, the entry
port at depth 0, runtime view; `git.view`/`worktree.*` between main and the workspace service, the `git.read`,
`worktree.*`, `session.newId` commands and `session.start`'s isolation fields, process view; store v8 and the isolated
session's effective root, runtime view; no package or edge changed, component view unchanged. Before that Part M —
`repository.read`/`repository.state` and `token_samples`).
