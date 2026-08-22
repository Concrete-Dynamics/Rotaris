# Rotaris

[![Rotaris desktop](https://github.com/theUpsider/geraet-ai/actions/workflows/rotaris.yml/badge.svg)](https://github.com/theUpsider/geraet-ai/actions/workflows/rotaris.yml)
[![ReqToCode traceability](https://github.com/theUpsider/geraet-ai/actions/workflows/reqtocode.yml/badge.svg)](https://github.com/theUpsider/geraet-ai/actions/workflows/reqtocode.yml)

A multi-agent orchestration framework for software work, built on the
[OpenHands SDK](https://github.com/All-Hands-AI/openhands-sdk). You give it a goal; an
orchestrator persona decomposes it, delegates to specialist agents, tracks their state,
and gates the result through a verifier before calling it done.

Rotaris ships as a **PySide6 desktop application** (the primary interface), a **Textual
terminal UI**, and a **headless CLI** — all three driving the same engine.

Think of it as a tech lead plus a specialist team for your codebase, running on your
machine, against your workspace, with your provider subscription.

---

## The three surfaces

| Surface | Distribution | Import package | Entry point |
| --- | --- | --- | --- |
| Rotaris desktop (primary UI) | `rotaris` (`apps/rotaris/`) | `rotaris` | `rotaris` |
| Rotaris engine (backend) | `rotaris-core` (`src/`) | `rotaris_core` | `rotaris-cli`, `rotaris-headless` |
| Rotaris TUI (secondary UI) | part of `rotaris-core` | `rotaris_core.tui` | `rotaris-cli run` |

State lives under `<workspace>/.rotaris/`, global config under `~/.config/rotaris/`, and
credentials under `~/.local/share/rotaris/`.

---

## Why Rotaris

Most coding assistants run one agent with one prompt. That is fine for a single file. Once
a task spans design, implementation, tests, and docs, you need coordination — and you need
the harness to survive the failure modes that make unattended agents expensive:

- **Runaway loops.** A circuit breaker detects unproductive repetition, injects a corrective
  prompt, and escalates to termination if the agent keeps looping.
- **Premature cancellation.** Children have explicit lifecycle states and dependency
  tracking; the parent knows what is still running instead of guessing.
- **Orchestrators that do all the work.** The orchestrator is `coordinator_only` by default —
  its write tools are stripped unless the intent classifier grants direct access for a
  genuinely trivial change.
- **No visibility.** Every tool call, agent state transition, and child report is rendered
  in the UI and persisted with the session.
- **Silent "done".** A read-only `verifier` persona re-checks completed work against the
  original request before the run reports success.
- **Unbounded permissions.** A policy engine decides allow / ask / deny per tool call, and
  an unattended run in a permissive mode is downgraded rather than trusted.

---

## Quick start

Requires **Python ≥ 3.12** and [`uv`](https://docs.astral.sh/uv/) on `PATH`.

```bash
git clone https://github.com/theUpsider/geraet-ai.git
cd geraet-ai
uv sync --all-packages
```

`uv sync --all-packages` installs both workspace members (`rotaris-core` and the `rotaris`
desktop app) plus their dev groups. Run every Python tool through `uv run`; do not activate
`.venv` or call binaries from it directly.

### 1. Register a provider

```bash
uv run rotaris-cli login
```

The guided flow authenticates with the provider's own OAuth flow, discovers the models your
account can reach, writes a minimal `.rotaris/agents.yaml` if none exists, and fills the
startup model slots. No API keys to paste for the OAuth providers.

### 2. Launch a surface

```bash
uv run python -m rotaris .            # desktop app against the current workspace
uv run python -m rotaris --demo       # desktop app with representative sample data
uv run rotaris-cli run                # interactive terminal UI
uv run rotaris-cli run "Add unit tests for the auth module"
uv run rotaris-headless run "Refactor the API layer" --background
```

---

## Desktop app

`apps/rotaris/` is a PySide6 workspace with six primary views, reachable via `Ctrl+1`…`Ctrl+6`:

| View | What it is for |
| --- | --- |
| **Overview** | KPI strip, recent sessions, context-window pressure, activity, subscription limits |
| **Workspace** | The run surface: transcript, composer, agent/todo pane, inspector drawer |
| **Mission** | Live delegation graph and agent activity table; open or cancel a specific child |
| **Git** | Worktrees, branch state, commit history, merge of session branches |
| **Library** | Prompt stash, session artifacts, improvement proposals |
| **Settings** | Providers, models, permission mode, MCP servers, runtime policy |

Design constraints the app holds to (see [`apps/rotaris/AGENTS.md`](apps/rotaris/AGENTS.md)):
usable at `1000×680` with compact drawers, WCAG 2.2 AA contrast and accessible names on every
control, explicit ready / running / success / empty / recoverable-error / unrecoverable-error
states, and confirmation before anything destructive or permission-expanding.

**Composer slash commands** — `/stop`, `/pause`, `/compress`, `/clear`, `/new`, `/resume`,
`/search`, `/worktree`, `/stash`, `/pop`, `/model <name>`, `/persona <name>`, plus one command
per discovered skill. A suggestion popup filters as you type and marks unknown names.

**Diagnostics** — `--diagnostics [light|deep]` records an opt-in timestamped UI trace for
debugging layout and performance problems.

---

## Terminal UI

The Textual TUI is the secondary interface and stays feature-capable:

- Top bar with a focused-agent badge (live state + elapsed time), transcript, agent status,
  run info, and a persistent todo pane
- Command palette (`Ctrl+P`): stop run, new/continue session, edit startup models, runtime
  model selection, toggle tool events, toggle reasoning, send to background
- Runtime model picker (`Ctrl+M`) backed by live provider catalogs
- Session picker, background detach/reattach, prompt history cycling, prompt stash
- Slash commands: `/stop`, `/pause`, `/resume`, `/new`, `/mcp`, `/improvements`, `/tools`,
  `/background`, `/stash`, `/pop`, `/theme`, `/logout`, `/compress`, `/model`, `/search`,
  `/clear`, `/cancel`, `/help`, `/quit`
- Status bar showing the resolved workspace path and active git branch

Agent states rendered in both UIs: `queued`, `running`, `waiting_on_dependencies`,
`summarizing`, `succeeded`, `failed`, `cancelled`, `blocked`.

---

## Orchestration model

The orchestrator receives a goal, plans it, and delegates. What the engine provides around
that:

| Capability | Detail |
| --- | --- |
| Parallel fan-out | Independent subtasks run concurrently (`max_active_children: 6`, `max_children: 20`) |
| Background delegation | Non-blocking tasks with IDs; results retrieved on demand via `background_output` / `wait_for_tasks` |
| Dependency DAG | Explicit `depends_on` with topological scheduling and cycle detection |
| Cascading cancellation | Cancelling a parent stops every active descendant |
| Depth cap | 3 levels of delegation below the entry persona |
| Child reports | Every terminal child emits a structured JSON report artifact (summary, edited/created files, commands, test results, errors, next actions) |
| Shared artifact store | Session-scoped; sibling summaries are auto-injected so agents never start from zero |
| Failure handling | Failed dependencies move dependents to `blocked` |
| Circuit breaker | Loop detection with corrective injection, escalating to termination |
| Intent classification | A pre-flight `intent-classifier` tailors orchestrator instructions and tool grants to the task shape |
| Completion classification | After each successful iteration a small-model check decides whether the goal is actually met |
| Verifier gate | A read-only `verifier` validates finished work against the original request |
| Model fallback | If the model emits no event within `llm_response_timeout`, the persona's `fallback_model` takes over without killing the child |

### Ralph Loop

Bounded iterative autonomy for long-running work: read the plan and progress state, pick the
next incomplete task, do exactly that one, verify, update progress, repeat. Stop conditions
are all-tasks-complete, agent-declares-done, unrecoverable failure, cancellation, or the
configured iteration/time budget. Each iteration produces a report artifact; the todo list is
the progress anchor and is persisted with the session.

### Post-run improvement loop

After a run reaches a terminal state, an Improvement Collector analyses it and writes
structured improvement proposals to a workspace-scoped store — without interrupting the task.
Proposals surface in the desktop Library view and can later be executed by a separate Improver
agent with its own permission boundary. Recurring local quirks are additionally kept as
**workspace-scoped persona memory** and re-injected on future runs.

---

## Built-in personas

Fourteen personas ship by default. Each carries its own system prompt, model slot, toolset,
and MCP server list; all of it is overridable per workspace.

| Persona | Role | Notes |
| --- | --- | --- |
| `orchestrator` | Tech lead: decomposes, delegates, coordinates, runs the completion gate | `coordinator_only`; write tools granted only by intent policy |
| `intent-classifier` | Pre-flight: maps the raw request to an orchestration intent | No tools; small model |
| `architect` | Design, structure, interface contracts | Owns the architecture docs |
| `coding-agent` | Scoped implementation and verification | |
| `tester` | Writes and runs tests, reports coverage gaps | Playwright MCP |
| `docs-writer` | Technical documentation and requirement entries | |
| `refactorer` | Behaviour-preserving cleanup | |
| `planner` | Turns research into ordered execution plans | Can delegate and publish artifacts |
| `requirements-engineer` | Goals → traceable requirements and acceptance criteria | |
| `librarian` | **External** reference: library docs, RFCs, vendor APIs, web | Tavily MCP |
| `codebase-analyst` | **Internal** analyst: call graphs, symbol usage, diagnostics | Read-only; Serena + git MCP |
| `verifier` | Final acceptance gate against the original request | Read-only; runs tests and lints |
| `ui-verifier` | Browser-driven UI verification with screenshot evidence | Read-only; Playwright MCP |
| `project-initializer` | First-run Serena activation and onboarding | System-only; not reachable via `delegate` |

`librarian` answers questions from **outside** the repository; `codebase-analyst` answers
questions **inside** it. The orchestrator's routing matrix picks between them.

---

## Tools

Personas declare tools by friendly name in `agents.yaml`; `agents/factory.py::TOOL_NAME_MAP`
is the authoritative mapping. MCP servers go under `mcp_servers:`, never under `tools:`.

| Tool | Description |
| --- | --- |
| `read_file` | Line-numbered reads with pagination, in-file grep, directory listing, encoding detection. Records reads in a ledger shared with `write_file`. |
| `write_file` | Create, edit, overwrite, insert, undo. Edits use a 4-level fallback cascade (exact → whitespace-normalised → indent-normalised → fuzzy). Atomic writes via `mkstemp` + `os.replace`. Requires a prior read. |
| `haet_read` / `haet_edit` | Hash-Anchored Edit Tool — opt-in editing anchored on content hashes with snapshot concurrency control. |
| `grep` / `glob` | Read-only workspace search; uses `rg` when available, no shell, no network. |
| `terminal` | Command execution rooted at the workspace, with persistent and background sessions, timeouts, and structured outcomes. |
| `git_commit` | Local commits only — no push, pull, rebase, or amend. |
| `todo` | Session-scoped task list with stable IDs and phases (`pending`, `in_progress`, `completed`, `abandoned`). |
| `fetch` | Single web page retrieval with line-range selection. |
| `artifact_read` / `artifact_list` / `artifact_write` | Session-scoped artifact store; child reports are auto-materialised. |
| `delegate` | Fan-out delegation with dependency tracking. |
| `background_output` / `wait_for_tasks` | Retrieve background task results (`summary` or `verbatim`) or block until specific tasks finish. |
| `ask_questions` | Agent asks the user a structured set of questions and blocks on the answer. |

### HAET — hash-anchored editing

Standard line-number patching fails when a model reproduces surrounding context slightly
wrong, which gets worse with file size (the [Harness Problem](https://blog.can.ac)). HAET
tags each line with an xxHash32 → 2-character base62 content hash at display time; the model
references lines by anchor, edits are validated against the hash before application, and a
FIFO queue serialises concurrent edits to the same file. A stale anchor is rejected, forcing a
re-read instead of a corrupted write.

HAET remains fully supported but is **not** the default editing path — shipped personas use
the hardened `read_file` / `write_file` pair.

### Custom Python tool plugins

Register your own tools as decorated Python functions: sync or async, typed arguments,
docstring used as the LLM-facing description, JSON-serialisable (or Pydantic) arguments and
return values. Declared per persona in `agents.yaml`, discovered from `tools/` directories in
either config layer, loaded at runtime, and run in-process. Duplicate tool names after config
resolution are a startup error; exceptions become structured tool errors.

---

## Permissions and security

Every tool call passes through a policy engine that returns allow, ask, or deny.

**Modes** (`runtime.permission_mode`, overridable per persona and switchable mid-session):

| Mode | Behaviour |
| --- | --- |
| `restricted` | Mutating tools denied by default; reads outside the workspace require approval |
| `ask` (default) | Mutating tools require approval; read-only tools always allowed |
| `autonomous` | Allowed inside the workspace; anything touching a path outside it still asks |

An unrecognised mode name falls back to `restricted`.

**Unattended downgrade.** A permissive mode on a host without the container sandbox is
downgraded to `ask` for any run with no interactive approval host (background, headless, TUI),
unless `runtime.allow_unsandboxed_autonomous: true` is set for that workspace. In a host with
no approval UI, an `ask` decision resolves via `runtime.headless_approval_policy` — `deny`
(refuse the call, let the agent re-plan) or `abort` (refuse and stop the run). Approvals time
out after `approval_timeout_seconds` (default 300 s).

Beyond the mode presets:

- **Command patterns** classify destructive shell invocations for the policy engine.
- **Audit log** records permission decisions per session.
- **Workspace-scoped file access** — all paths resolved to real paths; symlink escapes and
  traversal outside the workspace root are rejected. Opt out explicitly with
  `--unsafe-outside-workspace` or `shell.allow_outside_workspace: true` (the UI shows a
  persistent indicator).
- **Secret redaction** in UI, logs, transcripts, and report artifacts; `api_key` values are
  held as `SecretStr` and kept out of dumps.
- **Token storage** at `~/.local/share/rotaris/tokens/` with `0600` permissions and atomic
  writes.

---

## Providers, auth, and models

Requests run through litellm (30+ providers: OpenAI, Anthropic, Google, Ollama, Azure, AWS
Bedrock, any OpenAI-compatible endpoint), with two provider families that authenticate
in-terminal instead of via API keys:

| Provider | Flow | Notes |
| --- | --- | --- |
| GitHub Copilot | Device Flow (RFC 8628) | One-time code confirmed at `github.com/login/device` |
| OpenAI Codex | PKCE authorization code | Browser opens `auth.openai.com`; a local callback server receives the token |
| Claude Code | Subscription runtime | Optional extra `rotaris-core[claude-code]`; requests run through the Claude Agent SDK's local runtime instead of litellm |
| DeepSeek, OpenAI-compatible, static | API key | Multiple labelled instances supported |

Stored tokens are reused and refreshed transparently on later runs. `rotaris-cli login` can be
re-run to add a provider without replacing the existing one; `rotaris-cli logout` with no
argument opens a selector listing only providers that currently hold credentials.

**Model slots.** Personas reference `small_model`, `medium_model`, `large_model`,
`default_summary_model`, and `fallback_model` rather than hard-coded model IDs, so switching
provider is a config change and not a prompt rewrite. Any persona can still pin an explicit
model ID.

- Persistent defaults: `Ctrl+P` → `Startup Models` in the TUI, or the Settings view in the
  desktop app. Both are backed by a shared catalog table merging configured models with live
  Copilot and Codex catalogs.
- Temporary per-run override: `Ctrl+M` (TUI) or `/model <name>` (desktop composer).
- Re-sync discovered models without re-authenticating: `rotaris-cli models refresh
  [--provider copilot]`. Exits non-zero if a targeted provider fails or is not eligible.
- Subscription usage and rate limits are tracked and surfaced in the Overview view.

`models.yml` remains supported for static or custom provider declarations, but ordinary
onboarding no longer needs it.

---

## MCP integration

Preconfigured servers, wired into the personas that need them:

| Server | Purpose |
| --- | --- |
| `serena` | Symbolic code intelligence — symbols, references, diagnostics, edits — and project memories (`uvx`, no install step, pinned release) |
| `playwright` | Browser automation for UI verification (headless) |
| `tavily` | Web search |
| `git` | Read-only git inspection (mutating git tools disabled) |

Additional servers are configured per persona in `agents.yaml`. A server that is unavailable
at runtime is dropped from the agent's tool list and shown as unavailable in the UI rather
than failing the run — a missing `uvx`, for example, simply removes Serena.

**Per-persona tool grants.** Carrying a server is not carrying its whole surface. A persona's
`mcp_tools:` map narrows each server to the tools its role needs, and the grant is enforced
where tools are created, so an ungranted tool is never offered to the model. The shipped
personas use it for Serena: every code-facing persona gets its lookups, only `coding-agent`,
`tester` and `refactorer` get its symbolic edits, and only `project-initializer` may write
project memories. A server with no entry keeps its whole surface.

```yaml
codebase-analyst:
  mcp_servers: [serena, git]
  mcp_tools:
    serena: [find_symbol, find_referencing_symbols, search_for_pattern]
```

**Auto-discovery** reads standard `mcp.json` files from conventional filesystem and repository
locations, so configurations are interoperable with Claude Desktop, Cursor, VS Code, Cline,
and Claude Code. npm (`@modelcontextprotocol/server-*`) and `uvx` packages are resolved
automatically. `/mcp` or the command palette opens a management screen for toggling servers
without editing files.

---

## Context injection: AGENTS.md and skills

**AGENTS.md.** Rotaris discovers `AGENTS.md` across three tiers — user-global
(`~/.config/rotaris/`), project root, and a walk up from the working directory — merges them
top-down, and injects the result as always-on workspace context at agent construction time. No
frontmatter, no triggers, just Markdown every agent sees before the first turn.

**Skills.** Portable `SKILL.md` directories are discovered from `.agents/skills/` and
`.opencode/skills/` in the project (walking up to the repository root), plus
`~/.agents/skills/`, `~/.config/opencode/skills/`, and `~/.openhands/skills/installed/`. Each
skill can be loaded off, name-only, user-invocable-only, or fully on, and can be marked
manual-only or auto-only. Name collisions resolve deterministically with the shadowed entry
recorded. Discovered skills also appear as composer slash commands.

---

## Sessions and git worktrees

Sessions persist as JSON snapshots under `<workspace>/.rotaris/sessions/<session_id>/`, with
PID-based file locking, incremental writes for crash recovery, schema versioning, and graceful
degradation on partial corruption. A snapshot holds the transcript, child-agent state history,
tool events, report artifacts, a config snapshot, and todo state.

Background sessions run without an attached UI and can be reattached later.

**Worktree isolation** lets a session run against a dedicated git worktree so parallel agents
never contend over one checkout:

```bash
uv run rotaris-cli run --background --isolate "Implement the export pipeline"
uv run rotaris-cli run --background --isolate --worktree-branch feat/export "…"
uv run rotaris-cli run --background --worktree ../existing-tree "…"
```

Branches are named `rotaris/session/<id>` by default and stored under the configured
`worktree_storage_subpath` (`worktrees`). Worktree options require `--background` with a task.
The desktop Git view lists worktrees and merges session branches back.

---

## CLI reference

### `rotaris-cli` (Typer, loads the TUI)

```
rotaris-cli run [TASK]                Execute a task or start the interactive TUI
rotaris-cli sessions                  List available sessions
rotaris-cli version                   Show version
rotaris-cli login [PROVIDER]          Register a provider and discover models
rotaris-cli logout [PROVIDER]         Remove stored credentials (interactive if omitted)
rotaris-cli models refresh            Re-sync discovered provider models
rotaris-cli providers list|set-key|set-base-url|validate|reauth|delete
rotaris-cli secrets set|unset|unset-all|list       MCP server environment secrets
rotaris-cli config set-tavily-key                  Store the Tavily API key
```

`run` options:

| Flag | Short | Description |
| --- | --- | --- |
| `--background` | `-b` | Run headless |
| `--workspace PATH` | `-w` | Workspace root (default: CWD) |
| `--session ID` | `-s` | Continue an existing session |
| `--isolate` | | Create a dedicated git worktree for this session |
| `--worktree PATH` | | Attach the session to an existing worktree |
| `--worktree-branch NAME` | | Branch name for `--isolate` |
| `--config PATH` | `-c` | `agents.yaml` override |
| `--persona NAME` | `-p` | Override the entry persona |
| `--max-iterations N` | | Cap Ralph loop iterations |
| `--unsafe-outside-workspace` | | Allow file operations outside the workspace |
| `--logout PROVIDER` | | Sign out of a provider and exit |

### `rotaris-headless` (argparse, imports no UI libraries)

`run`, `sessions`, `version`, `login`, `logout`, `providers delete`. Suitable for CI,
containers, and any host where importing Textual or Qt is undesirable.

### `rotaris` (desktop)

```
rotaris [WORKSPACE] [--demo] [--diagnostics [light|deep]] [--diagnostics-output DIR]
```

---

## Configuration

Layered YAML with field-wise overlay merge:

```
~/.config/rotaris/               ← global, always loaded
  agents.yaml                      ← global overrides
  project_settings.yaml            ← provider/model snapshot from login + discovery
  tools/                           ← global custom tool plugins

<workspace>/.rotaris/            ← workspace layer, higher priority
  agents.yaml                      ← startup model slots + persona overrides
  models.yml                       ← optional static/custom providers
  tools/                           ← project tool plugins
  sessions/                        ← session snapshots
  improvement_artifacts/           ← post-run improvement proposals
```

Same key in both layers: only the fields you specify are overridden; the rest is inherited.
List and dict fields such as `tools` or `mcp_servers` **replace** the inherited value rather
than deep-merging.

### Minimal `agents.yaml`

```yaml
default_persona: orchestrator
default_summary_model: medium_model
small_model: copilot/gpt-5-nano
medium_model: copilot/gpt-5-mini
large_model: copilot/gpt-5
fallback_model: small_model

personas:
  codebase-analyst:
    model: medium_model
  docs-writer:
    model: large_model
```

You do not need to materialise the built-in persona catalog — unspecified personas keep their
product defaults.

### Optional `models.yml`

```yaml
models:
  custom-server:
    provider: openai-compatible
    model_id: google/gemma-4-26B-A4B-it
    base_url: http://example.com/v1
    api_key: key-...
```

---

## Repository layout

```
src/rotaris_core/
├── agents/         # persona registry, factory, prompts, playbooks, compressor,
│                   # circuit breaker, persona memory, AGENTS.md loader
├── orchestrator/   # ChildManager (DAG, deps, cycle detection), Scheduler,
│                   # SummaryAgent, RotarisDelegateTool
├── ralph/          # bounded iterative loop driver + iteration observers
├── improvement/    # post-run collector and improver flow
├── verifier/       # deterministic completion verifier
├── tools/          # read/write file, terminal, search, todo, fetch, artifacts,
│                   # git_commit, ask_questions, background tasks, plugin loader
├── haet/           # hash-anchored edit engine (hasher, anchor, patch, queue)
├── permissions/    # policy engine, presets, modes, approval, command patterns, audit
├── config/         # layered YAML loading, schema, validation, MCP discovery
├── providers/      # provider catalogs, discovery, runtimes, usage limits
├── auth/           # OAuth flows (Copilot device, Codex PKCE), token storage
├── models/         # model catalog and selection
├── session/        # snapshots, persistence, locking
├── skills/         # SKILL.md catalog and injection
├── init/           # first-run project initialization
├── reqtocode/      # requirement ↔ code/test traceability tooling
├── tui/            # Textual UI (screens, widgets, providers, styles)
└── cli/            # Typer CLI, headless argparse CLI, auth flow, background runner

apps/rotaris/src/rotaris/
├── models/         # framework-free UI state + observable store
├── views/          # dashboard, workspace, mission, git, library, settings, main_window
├── widgets/        # reusable Qt primitives
├── services/       # config, git, run bridge, coordinator, worktrees, persistence
├── diagnostics/    # opt-in UI tracing
└── theme.py        # design tokens and global QSS
```

**Runtime shape:**

```
Desktop         -> MainWindow -> RunCoordinator -> RunBridge -> RalphLoop
Interactive CLI -> RotarisTuiApp -> MainScreen -> TuiRunController -> TuiRalphLoop
Background CLI  -> cli/background.py -> SessionManager + RalphLoop

RalphLoop -> Scheduler -> ChildManager -> asyncio.to_thread(LocalConversation.run)
```

Single-process and asyncio-based. `LocalConversation.run()` is synchronous OpenHands SDK code,
so it runs via `asyncio.to_thread`. No server or daemon.

---

## Development

Read [AGENTS.md](AGENTS.md) first — it is the canonical agent- and contributor-facing
orientation. Scoped rules live in [apps/rotaris/AGENTS.md](apps/rotaris/AGENTS.md) (desktop UI
standards) and [tests/AGENTS.md](tests/AGENTS.md) (test conventions).

### Commands

```bash
uv sync --all-packages                                   # setup
uv sync --all-packages --extra claude-code               # setup incl. Claude Agent SDK

# Tests — 3,000+ engine test functions, 400+ desktop
uv run pytest -x -q --timeout=30                         # full engine suite
uv run pytest tests/unit/ tests/integration/ -n auto -q --timeout=30   # parallel
uv run pytest apps/rotaris/tests -x -q --timeout=30 -p no:textual-snapshot
uv run pytest -m capability -x -v --timeout=600          # against a real LLM (slow)
uv run pytest --cov=rotaris_core --cov-report=term-missing

# Quality gates
uv run ruff check  src/ tests/ apps/rotaris/src/ apps/rotaris/tests/ --exclude 'tests/fixtures/files/large.py'
uv run ruff format src/ tests/ apps/rotaris/src/ apps/rotaris/tests/ --exclude 'tests/fixtures/files/large.py'
uv run mypy src/rotaris_core/ && uv run mypy apps/rotaris/src/rotaris/
uv run python -m rotaris_core.reqtocode check

# Run the app
uv run python -m rotaris .            # --demo for sample data
```

`make` targets (`make test`, `make lint`, `make rotaris`, …) are thin aliases over the same
commands; prefer the `uv run` forms, since Windows has no `make`.

Qt tests do not parallelise — keep the desktop suite single-process.

`--extra claude-code` installs the Claude Agent SDK used by the `claude-code`
subscription provider. Drop it if you never use `claude-code/*` models; keep
`--all-packages` either way, or the Rotaris workspace package is uninstalled.

### Conventions

- Line length 100, `target-version = "py312"`, ruff selects `E,F,I,N,W,UP,B,SIM,TCH`, `E501` ignored
- mypy `strict = true` on both packages
- Features of any size run in their own git worktree, on their own branch off `master` (quick
  fixes may land on `master`); run `uv sync --all-packages` once in a fresh worktree so its
  tests import its own `src`; merge as soon as the fast gate is green (ReqToCode, ruff, the
  slice's focused tests), then run the full suite on the merged `master` and ship whatever it
  finds on a short-lived `fix/…` branch — judged against the pre-existing baseline

### Requirements traceability (ReqToCode)

Requirements live in [`docs/requirements/`](docs/requirements/) — one epic file per feature
area, one YAML-frontmatter `SWR-<n>` file per requirement — and are linked to code and tests
bidirectionally: `@traces(SWR.SWR_<n>)` on implementations, `@verifies(SWR.SWR_<n>)` on tests.

```bash
uv run python -m rotaris_core.reqtocode check        # build-breaking gate
uv run python -m rotaris_core.reqtocode check --fix  # regenerate stale traceables
uv run python -m rotaris_core.reqtocode diff         # run first after editing requirement text
```

Production code with no requirement is spec drift; a requirement with no code is an incomplete
implementation. Both are errors. Supplementary code gets a *technical* requirement derived
from the product requirement that caused it. Full workflow:
[docs/requirements/README.md](docs/requirements/README.md) and
[docs/reference/reqtocode-playbook.md](docs/reference/reqtocode-playbook.md).

### Continuous integration

| Workflow | Runs |
| --- | --- |
| `rotaris.yml` | Desktop suite, ruff, and mypy on Ubuntu **and** Windows (Python 3.12, `QT_QPA_PLATFORM=offscreen`) |
| `reqtocode.yml` | Stdlib-only traceability check — no dependency install |

### Documentation

| Topic | Entry point |
| --- | --- |
| Architecture (16 perspectives) | [docs/architecture.md](docs/architecture.md) |
| Requirements store | [docs/requirements/README.md](docs/requirements/README.md) |
| Test strategy | [docs/testing/test_strategy.md](docs/testing/test_strategy.md) |
| Terminology | [docs/terminology-glossary.md](docs/terminology-glossary.md) |
| Everything else | [docs/INDEX.md](docs/INDEX.md) |

### Build

```bash
uv build --all-packages     # wheel + sdist for both members, Hatchling backend
```

---

## Default runtime policy

| Setting | Default |
| --- | --- |
| Max children per parent (active / total) | 6 / 20 |
| Max delegation depth | 3 levels below the entry persona |
| Max Ralph iterations | 20 |
| Child timeout / stall timeout | 1200 s / 90 s |
| LLM response timeout (triggers `fallback_model`) | 120 s |
| Model call timeout | 120 s |
| Terminal timeout | 100 s (background: 3600 s, max 20 sessions) |
| Non-terminal tool timeout | 30 s |
| Summary agent timeout | 120 s |
| Improvement collector timeout | 60 s |
| Permission mode | `ask` |
| Headless `ask` resolution | `deny` |
| Approval timeout | 300 s |
| Automatic retries | 1 transient, 0 validation |
| Dependency failure | Dependents move to `blocked` |
| Cancellation | Cascades to active descendants |

---

## Project status

`rotaris-core` **0.94.0** · `rotaris` (desktop) **0.12.0** — 3,450+ test functions across the
unit, integration, and desktop suites.

Working today: multi-agent orchestration with background delegation and a dependency DAG,
circuit breaker, intent and completion classification, verifier gate, shared artifact store,
14 built-in personas, hardened file editing plus HAET, Ralph Loop, post-run improvement loop
with persona memory, permission policy engine with interactive approval, the PySide6 desktop
app, the Textual TUI, headless CLI, per-agent model routing, MCP auto-discovery, skills and
AGENTS.md context injection, provider auth (GitHub Copilot, OpenAI Codex, Claude Code
subscription, API-key providers), session persistence, and git worktree isolation.

Drafted but not implemented: container sandboxing for terminal execution, user-defined
lifecycle hooks, and the remote access / support platform.

### Out of scope

- Community persona registry (shareable personas via git or a registry)
- Web interface
- Multi-workspace / multi-project orchestration
- Multi-user access control (provider auth is supported; shared team auth is not)

---

## License

[MIT](LICENSE)
