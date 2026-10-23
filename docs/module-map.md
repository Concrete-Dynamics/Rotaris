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
| Which evidence re-verifies an area | [`proofs/README.md`](proofs/README.md) — the proof registry |
| What is owed, what stands in, what was decided | [`architecture/codebase.md`](architecture/codebase.md), the ADRs |

Every package is `@rotaris/<name>` and exports through `src/index.ts`; `@rotaris/ui` also exports
`./design-system`. Tests are **co-located** with the unit they cover (`<unit>.test.ts` beside
`<unit>.ts`), so a package's test glob is `packages/<name>/src/**/*.test.ts` and the narrowest
verification is `pnpm vitest run <path>` (see [`../CLAUDE.md`](../CLAUDE.md) for the command set).

## Composition roots — `apps/desktop/src/`

The only importers of `electron`. One process each, except the renderer, whose role comes from its route.

| Root | Owns | Open first |
|---|---|---|
| `main/` | windows and dialogs, `runCommand`, the update relay, preferences, provider sign-in, notices, process supervision, the requirements actor stamp, project-initialization coordination, **the updater** (ADR-0054: the flavour, the feed, the compiled-in key set, the install sequence, the strategies), the verification driver seam | `commands/` (one facet per command family, `context.ts` for what main hands them), `index.ts` (`runCommand` and the handler table), `main-windows.ts`, `windows.ts`, `notices.ts`, `initialization.ts`, `driver.ts`, `updater/updater.ts` (the orchestrator; `electron.ts` beside it is the one file of the updater that touches Electron) |
| `preload/` | the one frozen bridge — `window.rotaris`: `command`, plus one `subscribe` per channel | `index.ts` |
| `renderer/` | the React roots; role by route (main, approval, pause, hook-review, provider, persona, terminal, rows-proof) | `shell.ts` (what a window has: the bridge, the replica, the stacks, the theme), `session-actions.ts` (the gestures against the followed session, with its tests), `session-view.ts` (what a transcript surface reads, and `useNeedsRecovery`, REQ-CHAT-008's recovery fact the roots share), `recovery-wiring.test.ts` (a source test pinning how the Workspace root, the Mission root and a persona window hand that fact on — the roots themselves have no test environment), `windows.tsx` (every role but `main`), `main.tsx` (the main window, and `boot`) |
| `run-host/` | one live session: runs, turns, tools, hooks, MCP, the skill catalog, configuration Tier B, checkpoints, terminal streams | `dispatch.ts` (one request in, one reply out), `host.ts` (`createRunHost` — everything the process holds), `index.ts` (the entry: build it, listen), `launch.ts`, `loop.ts`, `tools.ts`, `configuration.ts`, `scripted-client.ts` (the proofs' stand-in) |
| `workspace-service/` | workspace identity, store open and **migrate**, backup and restore, configuration Tier A, delivery, traceability, improvements, saved prompts | `index.ts`, `delivery.ts`, `traceability.ts` |

## Packages — `packages/`

Listed foundation-first, which is also dependency order. "Root" is the composition root that instantiates it.

| Package | Owns | Open first | Root | Glossary |
|---|---|---|---|---|
| `kernel` | `Result`, ids, clocks and time, redaction, similarity, the glob dialect (`glob.ts`, shared by the `glob` tool and a delegated child's write scope), exact decimal money (`money.ts`, the one place arithmetic on an amount lives — ADR-0031, `rotaris/money-only-in-money-ts`), a count's agreeing noun (`count-noun.ts`, `countNoun` — REQ-SHELL-044, every package's one wording of a count; `tools/check-plural-markers.mjs` fails `pnpm lint` on a literal "(s)" in a drawn string), the hand-off budget (`hand-off.ts`, `HAND_OFF_BUDGET` — `PD-TOOLS-006` revision 9, read by the engine's hand-off blocks and by `delegate`'s description), and the re-export of the generated requirement symbols (`src/generated/requirements.ts` — gitignored, written by `pnpm symbols`; never edited by hand) | `result.ts`, `time.ts`, `clock/`, `redaction.ts` | every root | — |
| `contracts` | every cross-boundary type: channels, commands, the child process protocol, control, requirements, tools, hooks, notices, theme data, roles | `commands.ts`, `channels.ts`, `process-protocol.ts` | every root | — |
| `platform` | OS facts and side effects that are not `electron`: directories, the YAML document model, single-instance, machine id, liveness, clocks, the preference store, the installed product version, the one Chromium switch a launch of the product's own executable inherits (`--no-sandbox`, OQ-82), the two variables naming the artifact a launch started from and their take out of main's environment (`artifact-environment.ts`, ADR-0054), the Linux process table a background session's SIGINT is checked against (`process-group.ts`, OQ-135) | `dirs.ts`, `preferences.ts`, `document.ts`, `instance.ts`, `version.ts`, `chromium-switches.ts` | main, run-host, workspace-service | — |
| `store` | the SQLite schema and its migrations, the DAL, open/lock/rings, backup and restore primitives, delivery and improvement tables | `schema.ts` (append a `Migration`, never edit a shipped one), `dal.ts`, `open.ts` | workspace-service (migrate), run-host (read/write) | [`store/CONTEXT.md`](../packages/store/CONTEXT.md) |
| `config` | the three-tier layered configuration, its loader, validators and comment-preserving writers; portable skills; instruction-file discovery and merge; project initialization; the setup-manifest schema (REQ-STARTUP-058: what `apps/desktop/resources/setup-manifest.json` must be) | `load.ts`, `merge.ts`, `tiers.ts`, `writers.ts`, `sections/`, `skills/`, `instructions.ts`, `init/`, `setup-manifest.ts` | run-host (Tier B), workspace-service (Tier A), main (init); `tools/release-guard` (the shipped defaults, the setup-manifest schema) | [`config/CONTEXT.md`](../packages/config/CONTEXT.md) |
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
and its siblings), `tools/symbol-artifact/` (the generator behind `pnpm symbols`), `tools/release-naming/` (the
artifact names and the release-tag grammar), `tools/release-guard/` (`pnpm release:guard <tag>`, the pre-build version
and package-pin guard; `cli.mjs` boots `src/guard.ts` through Vite's module runner because it reads `@rotaris/config`'s
source), `tools/release-pipeline/` (since 2026-10-22 `pnpm release:pipeline` — the tag workflow's stages after the
guard: the checksum manifest, its signature, the key record `key-record.json` and the release body; open `cli.mjs`; its
`verify` reads the updater's own `apps/desktop/src/main/updater/keys.ts`; tests in `*.test.ts` beside it), `tools/notices/` (the generator behind
`pnpm notices` — `THIRD-PARTY-LICENSES.txt` and its validation, open
`notices.mjs`; the three tables beside it are the reviewed exceptions, the release inputs and the bundled fonts;
tests in `notices.test.ts`), `tools/build-id/` (the writer behind `pnpm build-id` — `build-id.txt`, REQ-SHELL-140's
build identifier, open `build-id.mjs`; tests in `build-id.test.ts`), `tools/requirement-coverage/` (the report behind
`pnpm req-coverage` — every live shipping requirement's implementation, test and proof citations, report-only; open
`coverage.mjs`, tests in `coverage.test.ts`), `tools/test-support-naming/` (since 2026-10-15 the one guard that a module
only tests reach is named `<unit>.test-support.ts` in every package under `packages/` and that nothing an entry reaches
imports one; `test-support-naming.test.ts`), `tools/proof-registry/` (the proof registry behind `pnpm proofs:index` —
`registry.mjs` holds one record per proof entry, `generate.mjs` renders `docs/proofs/README.md` and `pnpm lint` fails
when it is stale, `flags.mjs` reads the flags a proof script takes from its own argv, and `registry.test.ts` holds
the registry to the tree), `tools/verify-plan/` (`pnpm verify:plan` —
given a diff, the gate, the complete affected proof suites and the architecture documents; an unmapped path requires
explicit review; open `plan.mjs`, tests in `plan.test.ts`), `tools/dev-time/` (since 2026-10-18 the recorder behind
`pnpm dev-time` (R-075) — measured spans of setup, build, each gate stage, proofs, repairs and repeated rebases, one
JSON record a span in an append-only log, `~/.rotaris/dev-time/log.jsonl`; transparent since 2026-10-19 — `pnpm
check`, `pnpm build`, the wrapped stage scripts, the proof harness libraries and the `tools/worktree/` steps record
themselves; open `dev-time.mjs` and `cli.mjs`; tests in `dev-time.test.ts`), `tools/worktree/` (since 2026-10-19 the
wrappers behind `pnpm worktree:new` and
`pnpm worktree:land` — a branch in a worktree beside the checkout with its dependencies, electron's `dist/` and a
preflight; and the landing sequence: rebase onto `origin/main`, the gate and the affected proof suites on the
rebased head in a landing worktree of its own, a fast-forward push, cleanup — and the report behind
`pnpm worktree:overlaps`: every branch worktree's files against its fork from `origin/main`, the files two
branches share, and where `origin/main` moved too; open `new.mjs`, `land.mjs` and `overlaps.mjs`, tests
in `new.test.ts`, `land.test.ts` and `overlaps.test.ts`), and the standalone checks `pnpm lint` runs
before ESLint. `apps/desktop/launcher/` (since 2026-10-23) is the portable's launcher stub — a Rust crate with no dependency, built by
`cargo build --release` from `pnpm package` and `pnpm portable-proof`; open `src/main.rs`, its unit tests run with `cargo test
--release` there — and `apps/desktop/scripts/lib/portable.mjs` assembles the portable around it (ADR-0054 P4).
`pnpm package` (`apps/desktop/scripts/package.mjs`) runs the notices and build-id steps before freezing;
what the artifact must then carry is checked by `scripts/lib/about-assets.mjs`, which `afterPack` loads, and what it
says when it ends is `scripts/lib/package-verdict.mjs`'s.

## Where a thing is not where you would guess

Each of these was decided; the authority is in brackets, and none of them is safe to "correct".

- **Portable skills live in `config`, not `workspace`** — ADR-0063; the run host has no `workspace` edge,
  and skills are injected at agent construction. The *vocabulary* still belongs to `workspace/CONTEXT.md`.
- **Instruction files live in `config` for the same reason** — `PD-WORKSPACE-002`. `config/src/instructions.ts`
  holds the discovery, the enabled set and the merge (pure over an injected home, platform and read port);
  `config/src/sections/instructions.ts` holds the `instructions:` policy. The run host composes the block at
  agent construction beside the skill catalog (`run-host/skills.ts`), and the settings screen reads both the
  inventory and the policy off the one configuration snapshot.
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
