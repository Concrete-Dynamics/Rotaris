---
req-id: [SWR-2800, SWR-2801, SWR-2802, SWR-2803, SWR-2804, SWR-2805]
status: approved
trace: required
test: required
title: "Project Initialization & Serena MCP Integration"
date: 2026-08-06
---

# 2800-project-initialization spec

## SWR-2800 — Project initialization epic
status: approved
trace: optional
test: optional

Extensible first-time project setup framework. The initial delivery (SWR-2801–2805)
covers Serena MCP activation + automated onboarding as the first initialization
task, delivered through a Rotaris modal prompt. The framework is designed to
accept additional initialization tasks (paths, instructions, scripts, tool
bootstrapping) in future requirements without changing the prompt contract.

[SWR-2905](2800-project-initialization/SWR-2905-serena-workspace-binding.md) moved
project *activation* out of the agent entirely: Serena is launched already bound
to the run's workspace, so what remains for the initialization task is onboarding.

[SWR-2818](2800-project-initialization/SWR-2818-serena-sole-code-intelligence.md)
finished the consolidation the other way round: the `lsp` server Serena had been
duplicating since SWR-2801 was removed from the defaults, leaving one semantic
navigator, and [SWR-2819](2800-project-initialization/SWR-2819-serena-pinned-release.md)
pinned the release it runs at.
[SWR-3008](2800-project-initialization/SWR-3008-persona-serena-tool-grants.md)
narrowed what each persona receives from that one navigator to the tools its role
needs, and [SWR-2822](2800-project-initialization/SWR-2822-persona-serena-memories.md)
widened one part of it back: every persona reads *and* writes Serena's memory
store, and is told in its prompt what it is for.

[SWR-2820](2800-project-initialization/SWR-2820-deterministic-serena-setup.md)
then took the agent out of setup altogether. Everything the `project-initializer`
produced, Serena's own CLI produces without a model — and the step that actually
makes Serena fast, building the symbol index, was never run at all. The default
task is now deterministic, so
[SWR-2821](2800-project-initialization/SWR-2821-initialization-consent.md) lets a
task declare whether it needs the user: the deterministic one does not, and runs
in the background without a prompt or a run gate. SWR-2803's agent stays
specified and configured, and is simply not registered, for an initialization
task that genuinely needs natural language.

The extensibility seam is `rotaris_core.init.registry`: a task registers a
descriptor (`id`, `label`, `description`, `prerequisite_met`, `run`) and is
picked up by the prompt decision, the modal and the worker without any of them
naming it. `tests/unit/test_project_init.py::test_additional_registered_task_joins_the_prompt_without_touching_the_decision_logic`
and `apps/rotaris/tests/test_project_init_ui.py::test_a_task_registered_later_appears_without_touching_this_tab`
are the standing proof that a second task costs no UI change.

Non-goals (deferred): TUI fallback (`rotaris-cli init` CLI) — TUI is in
maintenance mode per the Marktreife-Priorisierung; this epic targets Rotaris
first. Headless/CI flows do not trigger interactive initialization prompts.


## SWR-2801 — Serena MCP as default tool for developer personas
status: approved

The Serena MCP server MUST be a default `mcp_server` entry for **every persona
that reads or changes repository code** in the built-in defaults
(`config/defaults.py`): `orchestrator`, `architect`, `coding-agent`, `tester`,
`docs-writer`, `refactorer`, `planner`, `requirements-engineer`,
`codebase-analyst`, `verifier`, `ui-verifier`, and `project-initializer`. Serena
provides symbolic code-intelligence tools (symbol search, references, editing)
that these personas use for codebase exploration and modification, and reading
code through symbols instead of whole files is cheaper for all of them, not only
for the ones that edit it.

Two personas are deliberately excluded, and the exclusion is about their job
rather than about caution:

- `librarian` is the *external* reference specialist — third-party docs, RFCs,
  web research "from outside the workspace". Repository symbol tools would
  contradict the contract its callers delegate against.
- `intent-classifier` has no tools at all; it maps a request to a route.

Further points:

- Serena is discovered and connected like any other MCP server via the
  existing MCP infrastructure (Epic 1700). If Serena is not installed or not
  configured in the user's `.mcp.json`, its tools are silently unavailable for
  the session — personas continue to work with their remaining toolset.
- Serena tool availability is surfaced in the Rotaris Agent Monitor and TUI
  transcript, consistent with existing MCP-unavailability handling (SWR-1714).
- The server every persona reaches is bound to the run's workspace at launch
  (SWR-2905), so none of them can be offered the project-activation tools.
- Serena is the *only* semantic code-intelligence server in the defaults
  (SWR-2818): the `lsp` server it duplicated was removed rather than kept
  alongside it, and the release it runs at is pinned (SWR-2819).
- *Which* of Serena's tools each of these personas gets is
  [SWR-3008](2800-project-initialization/SWR-3008-persona-serena-tool-grants.md):
  carrying the server no longer means carrying its whole surface, so a
  `read_only` persona here cannot reach Serena's editing tools.

Derived requirements: [SWR-2819 — Serena runs at a pinned release](2800-project-initialization/SWR-2819-serena-pinned-release.md), [SWR-2820 — Deterministic Serena project setup](2800-project-initialization/SWR-2820-deterministic-serena-setup.md), [SWR-2822 — Personas read and write Serena memories](2800-project-initialization/SWR-2822-persona-serena-memories.md)

### Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Every code-facing persona carries `serena` in `mcp_servers` and the two excluded personas do not; the default entry launches over stdio via `uvx` | Config defaults factory | `tests/unit/test_config_defaults.py::test_developer_personas_have_serena_mcp`, `::test_external_and_classifier_personas_have_no_serena`, `::test_serena_default_server_launches_via_uvx_over_stdio` |
| Integration | Serena tools appear in persona toolset when MCP is available; persona works without Serena when unavailable | MCP discovery → tool provider → persona factory | `tests/integration/test_serena_mcp_discovery.py::test_serena_tools_available_to_orchestrator`, `::test_persona_works_without_serena` |
| User-flow E2E | Covered by the SWR-2802 first-run flow (fresh workspace → init → Serena tools available) | Public product boundary → user-observable result | `apps/rotaris/tests/test_project_init_e2e.py::test_first_run_sets_up_a_code_workspace_and_lifts_the_run_gate` |


## SWR-2802 — Extensible project initialization prompt
status: approved

When a user opens a workspace in Rotaris with an unanswered initialization task
that **needs their decision** ([SWR-2821](2800-project-initialization/SWR-2821-initialization-consent.md)),
the system MUST present a modal prompt in Rotaris offering to initialize the
project.

> **Amended by SWR-2821.** As originally written this fired on any workspace with
> no `initialization` section, which was right while every task ran an agent. It
> now fires only for a task that declares `requires_consent`, and resolution is
> read per task rather than from the workspace-wide "never initialized" flag —
> otherwise a deterministic task finishing would stamp `last_run` and swallow the
> prompt for a consent task pending beside it. With no such task registered
> today, the prompt and the run gate below are dormant and return on their own
> the day one is.

- The prompt is **generic**: it lists pending initialization tasks and offers
  **Initialize** (runs all pending tasks) and **Skip** (defers all pending tasks;
  prompt does not reappear but the user can trigger it later via SWR-2805).
- The prompt **only appears when at least one initialization task has its
  prerequisites met**. For Serena, this means Serena is configured as an MCP
  server (user has `serena` in their `.mcp.json`) *and* its command can actually
  be launched on this machine — one shared availability rule, SWR-2807. If no
  task is applicable, no prompt is shown and the workspace is marked as
  initialized (empty task list).
- After initialization completes (or the user skips), the workspace config is
  updated with an `initialization` section recording which tasks have been
  completed and which were skipped. The prompt never reappears unless triggered
  manually (SWR-2805).
- The prompt is non-blocking for the rest of the Rotaris UI: the user can
  navigate views, but agent execution is gated until the prompt is resolved.
  Work that raises no prompt gates nothing (SWR-2821).
- The prompt follows the Rotaris dialog pattern established by the approval
  modal (`apps/rotaris/src/rotaris/widgets/approval_dialog.py`, SWR-2504): a
  `QDialog` that emits an intent and lets the host record the outcome, with
  every exit path — including the window close box and Escape — yielding an
  explicit decision rather than leaving the workspace unresolved. It follows
  Rotaris UX standards with explicit states for prompt, in-progress (init agent
  running), done, and error with a concrete retry action.

### Initialization state in workspace config

`<workspace>/.rotaris/agents.yaml` is the workspace-scope config file — the
only one the loader reads besides `models.yml` (`config/loader.py`,
`WORKSPACE_CONFIG_DIR_NAME`). The config plumbing and the atomic,
key-preserving writer are specified in SWR-2806.

```yaml
# <workspace>/.rotaris/agents.yaml
initialization:
  completed: [serena]       # tasks that ran successfully
  skipped: []               # tasks the user chose to skip
  last_run: "2026-08-06T..."
  classification: code      # SWR-2804 verdict, when a task determined one
```

An empty or absent `initialization` section means "never initialized" — the
prompt is shown. A section with no pending tasks (everything is in `completed`
or `skipped`) means "fully resolved" — the prompt does not appear.

### Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Prompt triggers on missing `initialization` key; does not trigger when all tasks resolved; does not trigger when Serena not in `.mcp.json` | Workspace config → prompt decision | `tests/unit/test_project_init.py::test_prompt_shown_when_uninitialized`, `::test_prompt_not_shown_after_all_resolved`, `::test_prompt_not_shown_when_serena_unavailable` |
| Integration | Modal renders its four states and always yields a decision; the store projects the workspace's initialization state; the window gates runs, drives the worker thread and writes the config | Modal widget; config service → store; Rotaris main window → worker → config | `apps/rotaris/tests/test_project_init_dialog.py`, `apps/rotaris/tests/test_project_init_store.py`, `apps/rotaris/tests/test_project_init_wiring.py` (pytest-qt) |
| User-flow E2E | User opens fresh workspace → sees prompt → clicks Initialize → init agent runs against a live stub Serena → prompt disappears and config written → the run gate lifts and a reopen never re-prompts | Public product boundary → user-observable result | `apps/rotaris/tests/test_project_init_e2e.py::test_first_run_sets_up_a_code_workspace_and_lifts_the_run_gate` (hermetic: stub Serena MCP subprocess + scripted LLM + tmp workspace) |

Derived requirements: [SWR-2806 — Initialization config sections & atomic state writer](2800-project-initialization/SWR-2806-initialization-config-state.md), [SWR-2807 — Single MCP server availability rule](2800-project-initialization/SWR-2807-mcp-availability-rule.md), [SWR-2821 — Initialization tasks declare whether they need the user](2800-project-initialization/SWR-2821-initialization-consent.md)


## SWR-2803 — Serena project initialization agent
status: approved

When the user confirms initialization and "Serena project setup" is a pending
task, the system MUST run a dedicated system persona — `project-initializer` —
that performs Serena onboarding automatically.

> **Amended by [SWR-2820](2800-project-initialization/SWR-2820-deterministic-serena-setup.md).**
> This task is **no longer registered by default**, and nothing below describes
> what a user's first run does today — SWR-2820 does. Everything it produced,
> Serena's own CLI produces without a model, and the measurements are in that
> requirement. The persona, its prompt and this runner stay in the tree because
> the epic expects initialization tasks that genuinely need natural language, and
> this is the working shape of one. It declares `requires_consent` (SWR-2821), so
> registering it again is the whole change needed to bring the SWR-2802 modal
> back with it.
>
> One correction to the contract while it is dormant: `onboarding: success` also
> requires a successful `write_memory`. Serena's `onboarding` tool writes no
> memory — it returns instructions — so reading its success alone as the verdict
> let an agent call it, write nothing, and bank a permanent marker for work it
> never did.

The persona runs on a bare `LocalConversation` rather than through the
orchestrator's `Scheduler`: todo correction, stall watchdogs, circuit breakers
and child reports exist to manage open-ended delegated work, and a two-step
setup task would only inherit their failure modes.

Initialization still reports two steps, but only the second is the agent's work:

### Step 1: Project activation (framework, always)

Serena is launched already bound to the workspace (SWR-2905), so activation is
complete before the agent takes its first turn and there is no `activate_project`
tool for it to call. The step is still *reported*, because the modal renders it
and a user needs to know whether Serena is set up — but its status is derived by
the runner from whether Serena's tool set reached the conversation, never from
the model's prose. Activation succeeds regardless of whether the project contains
code; Serena indexes documentation-only projects as well, just with fewer symbols.

### Step 2: Onboarding memories (conditional)

Calls Serena's `onboarding` tool to analyze the project and write durable
memories (`mem:core`, `mem:tech_stack`, `mem:suggested_commands`,
`mem:conventions`, `mem:task_completion`, plus module-specific memories for
multi-module projects). This step is **skipped** when the project is classified
as non-code (SWR-2804) — a documentation-only or empty project has nothing
meaningful for code-oriented memories to capture. The classification is decided
by a filesystem scan before the agent starts and handed to it as a stated fact,
so the skip rule never depends on a small model re-inspecting the workspace.

The agent MUST:

- Report the result for each step (activation: success/failure; onboarding:
  success/skipped-no-code/failure). Neither verdict comes from the model's
  prose. Activation is decided by the framework — Serena's tools reached the
  conversation, or they did not. Onboarding is read out of the conversation's own
  tool events: a model that claims `onboarding: success` without ever calling
  `onboarding` is reported as a failure.
- Cause the initialization marker to be written into
  `<workspace>/.rotaris/agents.yaml` (see SWR-2802) on success — even when
  onboarding was skipped. The marker is written by `rotaris_core.init.registry`,
  which is the sole writer for **every** initialization task, so a future task
  author cannot forget the rule and a failed config write downgrades the task
  to a retryable failure.
- On failure, leave `initialization` unmodified so the prompt can be
  re-triggered; surface the error in the modal with a retry action.

### `project-initializer` persona contract

| Property | Value |
| --- | --- |
| Model | `small_model` (cheap; no reasoning depth needed) |
| MCP servers | `serena` only |
| Tools | Read-only file tools (`read_file`, `grep`, `glob`); `read_only: true` |
| Write access | None to project files; writes only Serena memories. The `initialization:` marker in `<workspace>/.rotaris/agents.yaml` is written by `rotaris_core.init.registry`, not by the agent. |
| Delegation | `delegates_to: []` — not in the persona DAG, system-only, like `intent-classifier` |
| Prompt | `prompts/project_initializer.md` |
| Permissions | The setup tools this run implies — `onboarding` and `write_memory` — are pre-approved for **this persona, for this run** (`serena_task.INIT_ALLOWED_TOOLS`), because clicking *Initialize* is the user's consent for them. The grant is prepended to the workspace's configured preset and narrows nothing else: every other tool, including Serena's symbolic **editing** tools, still prompts exactly as it would for any other persona. |

### Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Init agent onboards a code project and records the task; skips onboarding for a non-code project; reports `activation: failure` when Serena never reached the conversation; fails without recording anything; setup tools are pre-approved while editing tools are not | Project-initializer logic + scripted LLM + in-process MCP stub | `tests/unit/test_project_init_agent.py::test_activates_project_and_writes_config`, `::test_skips_onboarding_for_empty_project`, `::test_reports_activation_failure_when_serena_never_arrives`, `::test_reports_failure_without_writing_config`, `::test_setup_tools_are_preapproved_but_editing_tools_are_not`, `::test_persona_is_read_only_and_outside_the_delegation_dag` |
| Integration | Init agent onboards against a real stdio MCP server discovered through `.mcp.json`, never asking for project activation, and the marker is written by the registry | MCP config resolution → client startup → tool dispatch → recorded state | `tests/integration/test_serena_init_flow.py` (hermetic: FastMCP stub server subprocess) |
| User-flow E2E | Covered by the SWR-2802 first-run flow | Public product boundary → user-observable result | `apps/rotaris/tests/test_project_init_e2e.py::test_first_run_sets_up_a_code_workspace_and_lifts_the_run_gate` |


## SWR-2804 — Non-code project detection
status: approved

The `project-initializer` agent MUST classify a project as "non-code" when no
file in the workspace (recursively, respecting `.gitignore`) matches a
configurable set of source-code extensions.

- Default source extensions: `.py`, `.js`, `.ts`, `.jsx`, `.tsx`, `.rs`, `.go`,
  `.java`, `.c`, `.cpp`, `.h`, `.hpp`, `.rb`, `.php`, `.swift`, `.kt`,
  `.scala`, `.cs`, `.fs`, `.ex`, `.exs`, `.r`, `.jl`.
- Non-code classification means: the work that only pays off on code is skipped.
  Under SWR-2820 that is the `index` and `memories` steps; registering the
  agentic SWR-2803 task again would make it the onboarding step, as originally
  written. Registering the project with Serena is unaffected either way.
- The extension list is overridable in `<workspace>/.rotaris/agents.yaml`:
  ```yaml
  project_init:
    source_extensions: [".py", ".js", ".ts", ...]
  ```
- The classification result (`code` / `non-code`) is recorded in the
  initialization config so the UI can surface it (e.g. "Serena activated, no
  code memories created — documentation-only project").

### Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Empty dir → non-code; only `.md` → non-code; `.py` + `.md` → code; overridden extensions; `.gitignore` respected | File-system scan → classification | `tests/unit/test_project_init_classifier.py::test_empty_dir_is_non_code`, `::test_markdown_only_is_non_code`, `::test_python_file_is_code`, `::test_custom_extensions`, `::test_respects_gitignore` |
| Integration | A documentation-only workspace is activated and never onboarded, and the verdict reaches the config and the Settings ▸ Project tab | Init agent → config → Rotaris settings view | `tests/integration/test_serena_init_flow.py::test_docs_only_project_activates_without_onboarding`, `apps/rotaris/tests/test_project_init_ui.py::test_a_non_code_workspace_is_told_why_no_memories_were_written` |
| User-flow E2E | User initializes a documentation-only workspace → onboarding is never asked for → the UI says why no memories were created | Public product boundary → user-observable result | `apps/rotaris/tests/test_project_init_e2e.py::test_first_run_of_a_documentation_only_workspace_skips_onboarding` |


## SWR-2805 — Manual re-initialization trigger
status: approved

After the user has skipped initialization or when a new initialization task
becomes available (future extension), the user MUST be able to trigger
initialization manually.

- A "Initialize Project" action is available in Rotaris: in the Workspace view
  (Settings section) and in the Settings view (Project tab).
- The action is always visible but its state reflects the current status:
  - All tasks resolved → "Project initialized" (informational, no action).
  - Pending tasks exist → "Initialize Project…" (clickable, opens the
    same modal from SWR-2802 listing unresolved tasks).
  - Initialization in progress → disabled with progress indicator.
- When a previously-skipped project is re-initialized, only the still-pending
  tasks run. Already-completed tasks are not re-run.
- Manual re-initialization does not trigger automatically on any event — it is
  always user-initiated. This is about the *action* and the modal behind it:
  SWR-2821's background tasks are not manual re-initialization, and a task the
  user explicitly skipped here is never restarted for them.

### Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Action state reflects config: resolved → "initialized", pending → "Initialize…", in-progress → disabled | Config → action state | `apps/rotaris/tests/test_project_init_ui.py::test_action_state_resolved`, `::test_action_state_pending`, `::test_action_state_in_progress` |
| Integration | Clicking "Initialize…" from the Workspace sidebar or Settings ▸ Project opens the modal; it lists only unresolved tasks; running it completes them | Rotaris view → modal → init worker | `apps/rotaris/tests/test_project_init_wiring.py::test_skipping_defers_and_the_workspace_action_reruns_it_later`, `::test_settings_action_opens_the_same_modal` (pytest-qt) |
| User-flow E2E | User skips setup, reopens the workspace without being re-prompted, then runs the deferred task from the Workspace action | Public product boundary → user-observable result | `apps/rotaris/tests/test_project_init_e2e.py::test_a_skipped_workspace_is_reinitialized_from_the_workspace_action` |


Epic: [Project Initialization & Serena MCP Integration](../2800-project-initialization.md)
