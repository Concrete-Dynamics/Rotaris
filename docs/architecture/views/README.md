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

Last reconciled with the code: **2026-09-08** (Part AG — the undrawn Settings categories: `shell.openThirdPartyLicenses`
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
