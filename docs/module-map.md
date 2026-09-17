# Module map — which package owns a thing, and the file to open first

The shallowest of this repository's maps, and the one to read first when the question is *where*.
It holds paths, entry files and test globs, and nothing that would go stale faster than those.

| The question | The document that answers it |
|---|---|
| Where does this live? What do I open first? | **this file** |
| Which packages may import which, and why | [`architecture/views/01-component-view.md`](architecture/views/01-component-view.md) — the allowed-edge matrix is the lint rule verbatim |
| Which files, in what order, to add a command / channel / column / tool / key / notice / preference / surface | [`architecture/views/04-seams.md`](architecture/views/04-seams.md) |
| Which process owns a fact and who may write it | [`architecture/views/05-state-ownership.md`](architecture/views/05-state-ownership.md) |
| What a word means, and which requirement owns it | [`../CONTEXT-MAP.md`](../CONTEXT-MAP.md) and the `CONTEXT.md` it names |
| Which evidence re-verifies an area | [`../AGENTS.md`](../AGENTS.md) — the proof-script index |
| What is owed, what stands in, what was decided | [`architecture/codebase.md`](architecture/codebase.md), the ADRs |

Every package is `@rotaris/<name>` and exports through `src/index.ts`; `@rotaris/ui` also exports
`./design-system`. Tests are **co-located** with the unit they cover (`<unit>.test.ts` beside
`<unit>.ts`), so a package's test glob is `packages/<name>/src/**/*.test.ts` and the narrowest
verification is `pnpm vitest run <path>` (see [`../CLAUDE.md`](../CLAUDE.md) for the command set).

## Composition roots — `apps/desktop/src/`

The only importers of `electron`. One process each, except the renderer, whose role comes from its route.

| Root | Owns | Open first |
|---|---|---|
| `main/` | windows and dialogs, `runCommand`, the update relay, preferences, provider sign-in, notices, process supervision, the requirements actor stamp, project-initialization coordination, the verification driver seam | `commands/` (one facet per command family, `context.ts` for what main hands them), `index.ts` (`runCommand` and the handler table), `main-windows.ts`, `windows.ts`, `notices.ts`, `initialization.ts`, `driver.ts` |
| `preload/` | the one frozen bridge — `window.rotaris`: `command`, plus one `subscribe` per channel | `index.ts` |
| `renderer/` | the React roots; role by route (main, approval, pause, hook-review, provider, persona, terminal, rows-proof) | `shell.ts` (what a window has: the bridge, the replica, the stacks, the theme), `session-actions.ts` (the gestures against the followed session, and the only renderer file with tests), `session-view.ts` (what a transcript surface reads), `windows.tsx` (every role but `main`), `main.tsx` (the main window, and `boot`) |
| `run-host/` | one live session: runs, turns, tools, hooks, MCP, the skill catalog, configuration Tier B, checkpoints, terminal streams | `dispatch.ts` (one request in, one reply out), `host.ts` (`createRunHost` — everything the process holds), `index.ts` (the entry: build it, listen), `launch.ts`, `loop.ts`, `tools.ts`, `configuration.ts`, `scripted-client.ts` (the proofs' stand-in) |
| `workspace-service/` | workspace identity, store open and **migrate**, backup and restore, configuration Tier A, delivery, traceability, improvements, saved prompts | `index.ts`, `delivery.ts`, `traceability.ts` |

## Packages — `packages/`

Listed foundation-first, which is also dependency order. "Root" is the composition root that instantiates it.

| Package | Owns | Open first | Root | Glossary |
|---|---|---|---|---|
| `kernel` | `Result`, ids, clocks and time, redaction, similarity, and the re-export of the generated requirement symbols (`src/generated/requirements.ts` — gitignored, written by `pnpm symbols`; never edited by hand) | `result.ts`, `time.ts`, `clock/`, `redaction.ts` | every root | — |
| `contracts` | every cross-boundary type: channels, commands, the child process protocol, control, requirements, tools, hooks, notices, theme data, roles | `commands.ts`, `channels.ts`, `process-protocol.ts` | every root | — |
| `platform` | OS facts and side effects that are not `electron`: directories, the YAML document model, single-instance, machine id, liveness, clocks, the preference store | `dirs.ts`, `preferences.ts`, `document.ts`, `instance.ts` | main, run-host, workspace-service | — |
| `store` | the SQLite schema and its migrations, the DAL, open/lock/rings, backup and restore primitives, delivery and improvement tables | `schema.ts` (append a `Migration`, never edit a shipped one), `dal.ts`, `open.ts` | workspace-service (migrate), run-host (read/write) | [`store/CONTEXT.md`](../packages/store/CONTEXT.md) |
| `config` | the three-tier layered configuration, its loader, validators and comment-preserving writers; portable skills; project initialization | `load.ts`, `merge.ts`, `tiers.ts`, `writers.ts`, `sections/`, `skills/`, `init/` | run-host (Tier B), workspace-service (Tier A), main (init) | [`config/CONTEXT.md`](../packages/config/CONTEXT.md) |
| `model` | the model port and its clients — the default backend, the AI-SDK client, the scripted client, reasoning, reported cost | `ports.ts`, `default-backend.ts`, `ai-sdk-client.ts`, `scripted-client.ts` | run-host | — |
| `hooks` | lifecycle hooks: the matcher, the runner, the trust gate, policy, external import | `engine.ts`, `matcher.ts`, `runner.ts`, `trust.ts` | run-host | [`hooks/CONTEXT.md`](../packages/hooks/CONTEXT.md) |
| `providers` | the frozen provider catalogue, the credential store, sign-in, discovery, slot assignment, `project_settings.yaml` | `catalogue.ts`, `credentials/`, `signin.ts`, `discovery.ts`, `slots.ts` | **main only** | [`providers/CONTEXT.md`](../packages/providers/CONTEXT.md) |
| `engine` | the run: sessions, the session writer, the projection owner, the run and turn loops, stop conditions, compression, resilience, the supervisor, children, intent, playbooks, session artifacts, improvements | `sessions.ts`, `session-writer.ts`, `run/run.ts`, `run/turn.ts`, `run/supervisor.ts`, `children/`, `artifacts/` | run-host | [`engine/CONTEXT.md`](../packages/engine/CONTEXT.md), [`engine/src/artifacts/CONTEXT.md`](../packages/engine/src/artifacts/CONTEXT.md) |
| `agent-tools` | the tool registry, policy, the permission gate, approvals, egress, OS confinement, the tool executors, the headless terminal stream | `registry.ts`, `gate.ts`, `policy.ts`, `tools/`, `terminal/streams.ts`, `confinement/` | run-host (`run-host/tools.ts` wires executors) | [`agent-tools/CONTEXT.md`](../packages/agent-tools/CONTEXT.md) |
| `mcp` | the MCP client: the owned stdio transport, tool discovery, the health probe, per-session connections | `client.ts`, `transport.ts`, `discovery.ts`, `sessions.ts` | run-host | [`mcp/CONTEXT.md`](../packages/mcp/CONTEXT.md) |
| `workspace` | workspace-scoped work outside a run: backup, restore, traceability, delivery, version control, improvements | `restore.ts`, `traceability/`, `delivery/`, `git/` | workspace-service | [`workspace/CONTEXT.md`](../packages/workspace/CONTEXT.md), [`git/CONTEXT.md`](../packages/workspace/src/git/CONTEXT.md), [`traceability/CONTEXT.md`](../packages/workspace/src/traceability/CONTEXT.md) |
| `shell` | the child-process link and the update relay | `process-link.ts`, `relay.ts` | main | [`shell/CONTEXT.md`](../packages/shell/CONTEXT.md) |
| `ui-core` | renderer state with no React in it: the transcript replica, the notice store, the per-window acknowledgement stack, pure requirement display mapping | `replica.ts`, `notice.ts`, `acknowledgements.ts`, `requirements/display.ts` | renderer | — |
| `ui` | every drawn surface: the shell and views, the dialogs, the design system, the transcript engine, the terminal display, Markdown, the slash catalogue, the command vocabulary, Settings, the Library | `AppShell.tsx`, `design-system/`, `transcript/`, `settings/`, `commands/` | renderer | [`ui/CONTEXT.md`](../packages/ui/CONTEXT.md) |

`tools/` holds build-time and lint-time code, not product code: `tools/eslint-rules/` (`rotaris/no-bare-timers`
and its siblings), `tools/symbol-artifact/` (the generator behind `pnpm symbols`), `tools/release-naming/`,
and the standalone checks `pnpm lint` runs before ESLint.

## Where a thing is not where you would guess

Each of these was decided; the authority is in brackets, and none of them is safe to "correct".

- **Portable skills live in `config`, not `workspace`** — ADR-0063; the run host has no `workspace` edge,
  and skills are injected at agent construction. The *vocabulary* still belongs to `workspace/CONTEXT.md`.
- **Project initialization lives in `config`, and its coordinator in `main`** — ADR-0064. The marker's one
  writer is the workspace service; the one shipped task's work is the run host's.
- **Credentials and provider sign-in are `main`'s alone** — ADR-0030. The run host is *leased* a resolved
  bearer per run and never reads `tokens/`.
- **The terminal is split in two** — `agent-tools/src/terminal/` runs the PTY and the headless emulator;
  `ui/src/terminal/` draws it. They meet at a stream id.
- **One row renderer, one Markdown renderer** — `ui/src/transcript/Row.tsx` (a pure function of its props)
  and `ui/src/markdown/`. Nothing renders either a second way.
- **Design-equivalent controls exist only in `ui/src/design-system/`** — `tools/check-ui-language.mjs`
  fails `pnpm lint` on one written anywhere else in `ui/src` or `apps/desktop/src/renderer`.
- **The engine and the tools do not import each other** — the run-host root fills the engine's `ToolPort`
  with the gate (`run-host/tools.ts`).
- **Theme data the main process needs before first paint is in `contracts/src/theme/`**, because `main`
  cannot import `ui`.

## The largest files, and what they are

Five files carry a disproportionate share of the product. Open them by symbol rather than by reading them
top to bottom, and add to the module beside them where the seam allows.

`apps/desktop/src/main/index.ts` (`runCommand`) and `apps/desktop/src/main/commands/` (the handler it calls) · `apps/desktop/src/renderer/main.tsx` (the main window's six views and `boot`; the other roles are in `windows.tsx`)
· `apps/desktop/src/run-host/dispatch.ts` (the child's dispatch, over the host `host.ts` builds) · `packages/engine/src/run/run.ts` (the run
loop) · `packages/store/src/dal.ts` (every query).

## Maintenance

This file is navigation, not record. Change it when a package appears, moves or changes what it owns; when
an entry point named here moves or is renamed; or when one of the "not where you would guess" entries stops
being true. Leave it alone for a bug fix, an internal refactor, or a file it does not name. The architecture
views carry their own, stronger obligation — see [`architecture/views/README.md`](architecture/views/README.md).
