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

Last reconciled with the code: **2026-09-12** — **opening a project from inside the application**: every main
window is now built by one builder and lives in a registry keyed by `webContents` id, which is what makes a
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
