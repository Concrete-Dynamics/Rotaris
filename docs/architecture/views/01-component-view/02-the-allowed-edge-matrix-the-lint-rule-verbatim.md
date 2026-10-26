# Component view — packages and the edges between them — The allowed-edge matrix (the lint rule, verbatim)

Part 2 of 4 of [the component view](../01-component-view.md), which indexes every part.

## The allowed-edge matrix (the lint rule, verbatim)

| From | May import |
|---|---|
| `kernel` | — |
| `contracts` | kernel |
| `platform` | kernel |
| `store` | kernel, platform |
| `config` | kernel, contracts, platform |
| `hooks` | kernel, contracts, platform, config |
| `providers` | kernel, contracts, platform, config |
| `engine` | kernel, contracts, store, platform, model, config |
| `agent-tools` | kernel, contracts, store, platform, config |
| `model` | kernel |
| `mcp` | kernel, platform |
| `workspace` | kernel, contracts, store, platform, config |
| `shell` | kernel, contracts, platform, release-naming |
| `ui-core` | kernel, contracts |
| `ui` | kernel, contracts, ui-core |
| `app-main` | kernel, contracts, platform, shell, release-naming, providers, config |
| `app-preload` | contracts |
| `app-renderer` | kernel, contracts, ui-core, ui |
| `app-run-host` | kernel, contracts, platform, store, engine, agent-tools, model, mcp, config, hooks |
| `app-workspace-service` | kernel, contracts, platform, store, workspace, config |

Edges worth knowing the reason for:

- **`engine` → `model`** (ADR-0026): the run loop drives `AgentBackend`; `model` sits over `kernel` only, so the
  arrow still points down.
- **`engine` does not import `agent-tools`** and `agent-tools` does not import `engine`: the run-host root fills
  the engine's `ToolPort` with the gate (`run-host/tools.ts`), so both stay structural.
- **`config` takes no database handle** (ADR-0036's guard) and cannot import `store`.
- **portable skills live in `config`, not in `workspace`** (ADR-0063), although `workspace/CONTEXT.md` owns the
  vocabulary: the matrix gives the run host no `workspace` edge, and skill injection happens at agent
  construction, which is the run host's. Contexts follow **spec domains**, not packages (`CONTEXT-MAP.md`).
- **project initialization lives in `config` too, and its coordinator in `main`** (ADR-0064): the marker's one
  writer is the workspace service and the one shipped task's work is the run host's, and the matrix gives
  neither of those two an edge to the other. `config` is the one package all three roots may read, and it
  already owns the YAML document model the marker is a section of and the code-intelligence binding the task
  is built from.
- **`main` cannot import `ui`/`ui-core`**: theme data the main process needs before first paint lives in
  `contracts/src/theme/`; the persona vocabulary the loader and the engine share lives in `contracts/src/roles.ts`, and since live-run finding K1
  (2026-09-29) so do the built-in roles' tool declarations (`BUILT_IN_ROLE_TOOLS`, `declaredToolsOf`) — the loader's role
  view and the run host's persona resolver read one rule; the prompts stay in the engine.
- **`providers` lives in main and only main** (ADR-0030): the credential store, sign-in and discovery run in the
  main process; the run host is *leased* a resolved bearer per run over the utility-process channel and never
  reads `tokens/`. `main` therefore imports `providers` and `config` (for the snapshot layer's types and the
  bootstrap writer) but still no `store`.
- **`ui` cannot import `config`**: the Settings screen reads `ConfigSnapshot` and emits a save, a per-field write
  or its live state (`contracts/src/config.ts`); the workspace service commits.
- **`app-main` → `release-naming` is the updater's edge** (ADR-0054, built 2026-09-28): the asset name it asks the
  feed for, the strict version order it compares by and the checksum-manifest format it parses are all the one naming
  authority's (`tools/release-naming/src/index.ts`), so the pipeline that writes those names and that manifest and the
  updater that reads them cannot disagree. The updater itself is `apps/desktop/src/main/updater/`, in the main root,
  because it is the process that owns the windows, the notices and the instance record it needs; its ports over
  Electron and the disk are one file (`electron.ts`) and everything else is pure.
