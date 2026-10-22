# Rotaris

Rotaris is a desktop application that carries a task through to a result in a project folder with a team of AI
agents. A run classifies the task, hands it to a coordinator that delegates work to specialist child agents, works
through a todo list one iteration at a time, and verifies changed work with deterministic checks before it decides
what to do next. You can watch and steer every agent while the run is live, every tool call passes one permission
gate before anything executes, and everything the run did is kept in a durable session record.

It is one Electron desktop application, built as a pnpm workspace of TypeScript packages. It is a graphical
application only: there is no command-line interface and no terminal user interface.

## Status

Rotaris is pre-release. **No release has been published yet**, so there is nothing to download, and the application
is built from source. The version it declares is `0.1.0` (`apps/desktop/package.json`).

**Platforms.**

- **Windows x64** is the one platform the first release will publish for
  ([`PD-STARTUP-001`](docs/product/directives.md#pd-startup-001)). `pnpm package` builds its installer, and runs on
  Windows only.
- **Linux and macOS** have no build host yet, so no release artifact is produced for either
  ([IC-3](docs/architecture/implementation-conditions.md#ic-3--the-linux-and-macos-build-host-obligations-deferred-to-hardware)).
  Nothing in the application is removed or disabled there. The proofs are run from source on Windows and on Linux.

**What still stands between `main` and a first release** is recorded in
[`docs/architecture/first-release-plan.md`](docs/architecture/first-release-plan.md). In short:

- **The manifest signing key (O-2).** A release is verified through a signed checksum manifest. The key pair has not
  been generated, so the updater carries no verification key and refuses every install at the signature step, and the
  tag workflow refuses to build a release that carries none. [§6.1](docs/architecture/first-release-plan.md#61-o-2-step-by-step)
  of the plan lists the owner's steps.
- **The release inputs (O-3, O-4, O-11).** The contact address for LGPL source requests, the application icon, and a
  maintainer's review of the shipped components that carry no licence text. Until O-3 and O-11 are supplied, notices
  validation refuses, and `pnpm package` refuses with it.
- **The portable build's launcher stub**
  ([§4.5](docs/architecture/first-release-plan.md#4-the-windows-release-pipeline)). The tag workflow
  (`.github/workflows/release.yml`), the checksum manifest, its signing step and the release body are built, and have not
  been run on a tag yet. The workflow stops at the portable stage until the stub exists, and its spike needs a Windows x64
  machine.
- **The release gate** (`REQ-STARTUP-156`, narrowed to Windows x64;
  [§5](docs/architecture/first-release-plan.md#5-the-release-gate)). Before a release is made public, the installer and
  the portable are each launched to first paint on a clean Windows x64 machine with no development runtimes and no
  network (O-6). The gate has not been run.

On 2026-10-06 the owner deferred this release work and counted the product work as finished without it
([R-071](docs/product/requests.md#r-071)). Each item stays recorded as owed, under
[§6](docs/architecture/first-release-plan.md#6-what-only-the-owner-can-do) of the plan.

## What it does

The specification in [`docs/spec/`](docs/spec/README.md) states the behaviour, one domain per file. What is built
today:

- **Runs** ([01](docs/spec/01-run-orchestration.md)). One task, classified for intent and carried by a coordinator
  that delegates to child agents, works one todo item per iteration, verifies what changed, and ends with a stop
  reason and a terminal status.
- **Monitoring and steering** ([02](docs/spec/02-run-monitoring-steering.md)). The Mission view shows the delegation
  tree and what each agent is doing. While a run is live you can steer an agent, queue follow-up prompts, edit the
  todo list, switch the model, reasoning level or permission mode, force a context compression, pause or cancel.
- **Conversation and transcript** ([03](docs/spec/03-conversation-composer-transcript.md)). A composer that adapts to
  the run's state, slash commands, image attachments, and a live transcript of messages, reasoning, grouped tool
  calls, edit diffs, questions and approvals.
- **Model providers** ([04](docs/spec/04-model-providers-auth.md)). A fixed provider catalogue plus user-defined
  OpenAI-compatible endpoints, with discovered model catalogues. Sign-in is by API key; the device-code and browser
  sign-in flows are not built yet.
- **Tools, permissions and approvals** ([05](docs/spec/05-tools-permissions-approvals.md)). Terminal execution,
  workspace-fenced file and search tools and a task list. Every tool call resolves to allow, ask or deny at one
  permission gate, and every decision is recorded in a per-session audit trail with secrets redacted.
- **Network egress and confinement** ([10](docs/spec/10-sandbox-network-egress.md)). A per-host egress policy for the
  URL-fetch tool, and optional operating-system confinement of terminal commands, through bubblewrap on Linux. The
  macOS backend is written but not yet proven (IC-8), and native Windows has no confinement and reports it
  unavailable.
- **Worktrees and checkpoints** ([06](docs/spec/06-git-worktrees-checkpoints.md)). A session can work in a Git
  worktree of its own, a checkpoint is recorded at the close of each iteration that changed the tree, and a tree can
  be restored to any checkpoint. Merging a finished worktree back is not built yet.
- **Sessions** ([07](docs/spec/07-sessions-persistence.md), [20](docs/spec/20-event-history-replay-export.md)). Every
  run is persisted as it proceeds in the workspace's machine-local durable session store. Sessions can be browsed,
  continued, exported and deleted, and the store can be backed up and restored.
- **Requirements board and traceability** ([08](docs/spec/08-requirements-traceability.md)). A project's own
  requirements, kept as versioned documents in its repository and compiled into symbols that its code and tests
  reference. The board shows their health and starts the runs that deliver them.
- **Lifecycle hooks** ([09](docs/spec/09-lifecycle-hooks.md)). Shell commands attached to named points of a run.
  Hooks a repository declares stay inert until they are reviewed and approved.
- **Workspace context and skills** ([13](docs/spec/13-workspace-context-onboarding.md)). Workspace instruction files
  (`AGENTS.md`) and a discovered catalogue of portable skills (`SKILL.md`) are injected into every agent, and a
  one-time project initialization prepares code intelligence for the workspace.
- **Library** ([14](docs/spec/14-library-artifacts-improvements.md)). The artifacts agents publish, saved prompts, and
  improvement proposals from a post-run analysis or a user-started retrospective, which are reviewed and then applied
  by a checkpointed improvement run.
- **Tool servers** ([16](docs/spec/16-mcp-integration.md)). External MCP servers as tool providers, declared in
  configuration or in `mcp.json` files, beside a bundled code-intelligence server.
- **Settings and the desktop shell** ([15](docs/spec/15-settings-configuration.md),
  [12](docs/spec/12-desktop-shell-windows.md), [19](docs/spec/19-notifications-errors-recovery.md)). Layered YAML
  configuration in a global and a per-workspace `.rotaris/` directory, edited from Settings. Seven primary views
  (Overview, Workspace, Mission, Requirements, Git, Library, Settings), a command palette, agent and terminal windows,
  three built-in themes, and notices that say what failed and how to recover.

Where the owner decided behaviour the specification does not state, a product directive in
[`docs/product/directives.md`](docs/product/directives.md) governs over the requirements it names.

## Building from source

**Prerequisites.**

- Node.js 24 or later (`engines.node` is `>=24.0.0`).
- pnpm 11.9.0, the version the root `package.json` pins in `packageManager`.
- Git on `PATH`.
- On Linux, a display, or `xvfb-run`, for anything that opens a window.
- Network access for `pnpm code-intel:bundle`, which builds the bundled code-intelligence runtime from pinned
  versions of `uv`, a Python interpreter and its packages. `pnpm notices`, `pnpm package` (which runs it itself) and
  some proofs need that runtime. It cannot yet be built on a Windows ARM64 host
  ([defect note](docs/defects/no-code-intelligence-bundle-can-be-built-for-a-windows-arm64-development-tree.md)).

**Commands**, from the repository root:

```sh
pnpm install                                   # dependencies; Electron's install script fetches its runtime
pnpm symbols                                   # writes packages/kernel/src/generated/, which is not committed and which every build imports
pnpm dev                                       # the application through electron-vite, against the workspace source
pnpm build                                     # the production build, into apps/desktop/out/
pnpm exec electron apps/desktop/out/main/index.js   # runs that build
pnpm check                                     # the gate: symbols, typecheck, lint and tests
pnpm package                                   # Windows only: the installer, with its evidence in apps/desktop/release/load-proof.json
```

`pnpm preflight` checks the machine before anything is launched: Node, Git, Electron's runtime, the build, the
code-intelligence bundle and the display. If Electron's runtime is missing, as it is in a new Git worktree,
`node node_modules/electron/install.js` installs it.

While notices validation refuses (see Status), `pnpm package` refuses too. With `ROTARIS_PACKAGE_WITHOUT_NOTICES=1`
in the environment it builds a development package without the notices file instead, which is not releasable.

Each proof, `pnpm <area>-proof`, launches the built application and measures one mechanism.
[`docs/proofs/README.md`](docs/proofs/README.md) indexes them, and `pnpm verify:plan` names the gate and the proof
suites a given change needs.

## Repository layout

| Path | What is there |
|---|---|
| [`apps/desktop/`](apps/desktop/) | The Electron application: its five composition roots in `src/` (`main`, `preload`, `renderer`, `run-host`, `workspace-service`), the packaging configuration, and the proof, packaging and code-intelligence scripts in `scripts/`. |
| [`packages/`](packages/) | Fifteen TypeScript packages (`@rotaris/<name>`), cut along process boundaries rather than features, from `kernel` at the foundation to `ui`. [`docs/module-map.md`](docs/module-map.md) says what each one owns and which file to open first. |
| [`tools/`](tools/) | Build-time and lint-time code, not product code: the checks the gate runs, the symbol generator behind `pnpm symbols`, the release guard and artifact naming, the notices and build-identifier generators, `pnpm verify:plan`, and the worktree and development-time tooling. |
| [`docs/`](docs/) | The record: the specification, the product directives and the request log, the architecture and its decisions, the design language, the clean-room process, the defect notes and the proof index. |

## Documentation

- **Specification:** [`docs/spec/README.md`](docs/spec/README.md), the behavioural requirements (`REQ-<DOMAIN>-<NNN>`)
  in nineteen shipping domains; two further domains, the terminal UI and the command line, are retired.
- **Product directives:** [`docs/product/README.md`](docs/product/README.md) explains the precedence rule and how a
  request is classified; [`directives.md`](docs/product/directives.md) is the register of `PD-<DOMAIN>-<NNN>`, and
  [`requests.md`](docs/product/requests.md) logs the owner's requests with their classification and disposition.
- **Architecture:** [`docs/architecture/README.md`](docs/architecture/README.md); the views of the system as built in
  [`views/`](docs/architecture/views/README.md); the Architecture Decision Records in
  [`adr/`](docs/architecture/adr/); and [`codebase.md`](docs/architecture/codebase.md), which records what landed and
  what is owed.
- **Domain glossary:** [`CONTEXT-MAP.md`](CONTEXT-MAP.md) and the `CONTEXT.md` file it names for each context.
- **Design language:** [`docs/design/README.md`](docs/design/README.md).
- **Defects:** [`docs/defects/`](docs/defects/README.md), open notes at the top level and repaired ones in `fixed/`.
- **Proofs:** [`docs/proofs/README.md`](docs/proofs/README.md).
- **Clean-room process:** [`docs/clean-room/`](docs/clean-room/), with the [zone policy](docs/clean-room/zone-policy.md),
  the [reference record](docs/clean-room/reference-record.md), the [provenance record](docs/clean-room/provenance.md),
  the [specification gate](docs/clean-room/specification-gate.md), the
  [architecture gate](docs/clean-room/architecture-gate.md) and the [agent workflow](docs/clean-room/agent-workflow.md).
- **Working in the repository:** [`CLAUDE.md`](CLAUDE.md) and [`AGENTS.md`](AGENTS.md).

## Contributing

- **Where a change lands.** Every change is built on a temporary branch in its own worktree and reaches `main` by a
  rebase onto `origin/main`, the gate (`pnpm check`) on the rebased head, and a fast-forward push. `main`'s history is
  linear: no merge commits and no force pushes. `pnpm worktree:new` and `pnpm worktree:land` wrap those steps, and
  [`docs/clean-room/agent-workflow.md`](docs/clean-room/agent-workflow.md) states the rules.
- **A request that would change what the product does** is logged in
  [`docs/product/requests.md`](docs/product/requests.md) and classified before any code is written, using the table in
  [`docs/product/README.md`](docs/product/README.md). Work that implements behaviour cites the `REQ` and `PD`
  identifiers it satisfies.
- **A defect noticed along the way** is written up in `docs/defects/` in the shape
  [`docs/defects/README.md`](docs/defects/README.md) gives, whether or not it is in scope to fix.
- **The clean-room boundary binds every contribution.** Work here draws only on the approved inputs `CLAUDE.md` lists,
  and never on the earlier implementation (below).

## Clean-room provenance

Rotaris is a clean-room reimplementation. Its code is written only from approved behavioural specifications
(`docs/spec/`), the owner's product directives (`docs/product/`), approved architecture decisions
(`docs/architecture/`), public technical documentation and approved design material. The specifications were
produced under a zone policy that keeps the two sides apart: no agent that read the earlier implementation wrote a
specification or any code in this repository, and no implementation agent reads it. The earlier implementation,
which served as the behavioural reference, is archived at
[Concrete-Dynamics/Rotaris-legacy](https://github.com/Concrete-Dynamics/Rotaris-legacy).
[`docs/clean-room/`](docs/clean-room/) holds the process and its evidence: the zone policy, the reference record,
the provenance record and the two gate records.

## License

Rotaris is licensed under the GNU General Public License, version 3 only (`GPL-3.0-only`). See [`LICENSE`](LICENSE).

The notices for the third-party components a build ships are produced by `pnpm notices`. It computes the shipped
dependency closure, validates it, and only then writes `apps/desktop/resources/THIRD-PARTY-LICENSES.txt`, which
packaging carries into the application and the About page in Settings opens. While validation fails it writes
nothing, and on `main` today it fails until the release inputs O-3 and O-11 are supplied.
