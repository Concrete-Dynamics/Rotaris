---
req-id: SWR-2820
status: approved
trace: required
test: required
title: "Deterministic Serena project setup"
epic: SWR-2800
date: 2026-08-15
---

# SWR-2820 — Deterministic Serena project setup

[SWR-2803](../2800-project-initialization.md) made Serena project setup the job of an LLM
agent. It is not one. Everything that setup produces, Serena's own CLI produces without a
model, and the one part the agent added — prose memories — was produced by a small model
guessing at content Rotaris already injects from `AGENTS.md` (SWR-449), and then read by
nobody, because no persona prompt mentioned memories at all.

What that cost, measured on a fresh workspace: the pinned `serena-agent` resolves to 75
transitive packages, so the first launch on a cold `uvx` cache is minutes of download before
the agent takes a turn. The agent then spends LLM budget writing a second copy of `AGENTS.md`.
Meanwhile the step that actually makes Serena fast — building the symbol index — is never
run at all, because Serena's `onboarding` tool does not index; it returns a prompt.

The default project setup MUST therefore be deterministic: no model, no provider, no
conversation, and no question for the user.

## Required behaviour

Registered as the initialization task `serena-setup`, with the prerequisite already defined
by [SWR-2807](SWR-2807-mcp-availability-rule.md) — `serena` is a configured MCP server whose
command resolves on this machine.

It runs Serena's own CLI, at the same pinned build the MCP server launches
([SWR-2823](SWR-2823-serena-cli-command-resolution.md)), and reports one step per stage:

| Step | Effect | Skipped when |
| --- | --- | --- |
| `project` | Writes `.serena/project.yml`, inferring the language set | never |
| `index` | Builds the symbol cache Serena's lookups read | the workspace is `non-code` |
| `memories` | Seeds the `memory_maintenance` memory layout | the workspace is `non-code` |

- The `non-code` verdict is [SWR-2804](../2800-project-initialization.md)'s existing
  filesystem scan, unchanged. Only its consequence moves: it now decides whether indexing is
  worth doing, rather than whether an agent onboards.
- The `project` step is idempotent. When `.serena/project.yml` already exists — from a prior
  partial run, or because the Serena MCP server wrote it when it launched in single-project
  mode — the step reports success without re-running `project create`, which refuses to
  overwrite an existing file. The user's language configuration is left as is.
- A failing step fails the task, which records nothing and stays retryable — the existing
  registry contract from SWR-2802, unchanged. A step that overran its budget or was stopped
  when Rotaris closed is reported the same way, because in both cases the work is still
  worth doing.
- Each command runs with a UTF-8 child environment. Serena's CLI prints status glyphs, and
  Python on Windows encodes a piped stdout in the console codepage, which cannot represent
  them — measured taking a subcommand down mid-message.
- On success the registry records `initialization.completed: [serena-setup]` together with
  the classification, exactly as it records any other task.

There is deliberately **no separate health-check step**. `serena project health-check` was
the obvious fourth stage and was measured doing the opposite of its job: on a two-file
workspace it ran past a five-minute budget, and on Windows it dies with a `UnicodeEncodeError`
while printing the `❌` of its own failure message — so the one case where it has something
to report is the case where it cannot report it. Nothing is lost: `index` completing
successfully *is* the health signal, because it only can if the language server started and
answered.

The task id is deliberately **not** `serena`. A workspace initialized before this requirement
carries `completed: [serena]` for a task that never built an index; under a shared id it
would count as done and never get one. Under a new id the stale entry is simply an id the
registry no longer knows, and the workspace picks up the setup it never had.

Because nothing here needs a model, this task requires no user consent and raises no prompt
([SWR-2821](SWR-2821-initialization-consent.md)). It runs in the background on workspace open.

The agentic task ([SWR-2803](../2800-project-initialization.md)) is **not registered by
default** any more. Its persona, prompt and runner stay in the tree for an initialization
task that genuinely needs natural language.

## Acceptance criteria

- Opening a never-initialized workspace with `serena` available runs the stages without an
  LLM call, a provider lookup, or a prompt.
- A code workspace ends with `.serena/project.yml` present and a non-empty symbol cache.
- A documentation-only workspace ends with `.serena/project.yml` present, `index` and
  `memories` reported as skipped, and no symbol cache.
- A failing `project` step ends the run without attempting the stages that depend on it.
- Reopening a workspace whose `.serena/project.yml` already exists reports the `project`
  step successful and still indexes, rather than failing with "Project already exists".
- Any failing step records nothing and reports a retryable failure.
- Closing Rotaris mid-run stops the child process rather than orphaning it, and the
  workspace stays re-runnable.
- A workspace whose config already records `completed: [serena]` still has `serena-setup`
  pending, and running it initializes the workspace.
- The commands invoked name the pinned Serena build, and honour a workspace that repointed
  or repinned its `serena` server.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | The stages run in order against a code workspace; a `non-code` workspace skips indexing and memory seeding; an existing project file is not recreated; a failing stage records nothing, stays retryable and stops the stages that depend on it; a cancelled run reports as retryable; a `serena` entry that is not a launch is reported rather than guessed at | Deterministic runner + injected process runner | `tests/unit/test_serena_setup.py::test_code_workspace_runs_every_stage`, `::test_non_code_workspace_skips_indexing_and_memory_seeding`, `::test_an_existing_project_file_is_not_recreated`, `::test_a_failing_stage_stops_the_run_and_records_nothing`, `::test_a_cancelled_run_is_retryable`, `::test_a_non_launch_serena_entry_is_reported_not_guessed_at`, `tests/unit/test_project_init.py::test_a_legacy_serena_workspace_still_owes_the_deterministic_setup` |
| Integration | The registered task drives a real `serena` executable through the registry and records the marker, with no model configured anywhere | Registry dispatch → CLI subprocess → recorded state | `tests/integration/test_serena_setup_flow.py::test_deterministic_setup_initializes_a_code_workspace_without_a_model`, `::test_a_workspace_with_an_existing_project_file_still_indexes`, `::test_docs_only_project_is_set_up_without_indexing` |
| User-flow E2E | A user opens a fresh workspace and is never prompted; setup completes in the background and the workspace is recorded as initialized | Public product boundary → user-observable result | `apps/rotaris/tests/test_project_init_e2e.py::test_first_run_sets_up_a_code_workspace_without_prompting_or_a_model` |

Derived requirements: [SWR-2823 — Serena CLI command resolution](SWR-2823-serena-cli-command-resolution.md)

Epic: [Project Initialization & Serena MCP Integration](../2800-project-initialization.md)
