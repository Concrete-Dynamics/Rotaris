---
req-id: SWR-2821
status: approved
trace: required
test: required
title: "Initialization tasks declare whether they need the user"
epic: SWR-2800
date: 2026-08-15
---

# SWR-2821 — Initialization tasks declare whether they need the user

[SWR-2802](../2800-project-initialization.md) prompts on first workspace open and gates agent
execution until the prompt is answered. That was right while every initialization task ran an
LLM agent: it spent the user's money and wrote durable content, so it needed their consent.

[SWR-2820](SWR-2820-deterministic-serena-setup.md) makes the default task deterministic. It
spends nothing, decides nothing, and asks a question the user has no basis to answer — the
only honest response to "may Rotaris build a symbol index?" is "why are you asking me?".
Prompting for it also blocks the composer for work that is not a precondition for any run:
Serena answers without an index, just more slowly.

A task MUST therefore declare whether it needs the user, and the prompt MUST follow that
declaration rather than the mere existence of pending work.

## Required behaviour

- An initialization task declares `requires_consent`. It defaults to **false**: a task that
  needs the user is the exception, and a task author who says nothing gets the quiet path.
- The first-run prompt (SWR-2802) appears only when at least one pending task declares
  `requires_consent: true`. Everything else about that requirement is unchanged — it still
  fires only on a never-initialized workspace, still lists the pending tasks, still records
  an outcome on every exit path.
- Agent execution is gated only while such a prompt is unanswered. With no consent-requiring
  task pending, a workspace opens ready to run.
- Tasks that need no consent run **in the background on workspace open**, without a modal.
  Their outcome is recorded exactly as a prompted run's is, and is visible in Settings ▸
  Project. A failure is reported through the window's existing error surface, not a dialog.
- A background task the user **explicitly skipped** is not started again. The SWR-2805 modal
  lists background work too and offers *Skip for now* for it, so skipping it is a real answer
  and restarting it on the next open would quietly overrule one. It stays available to the
  manual action, which is how they get it back.
- The manual re-initialization action (SWR-2805) is unchanged: it lists and runs whatever is
  still unresolved, of either kind.
- A workspace where nothing is applicable is still marked initialized with an empty task
  list, as SWR-2802 already requires.

The distinction is consent, not cost or duration. A background task may take minutes; what
makes it background is that there is no decision for a human in it.

## Acceptance criteria

- A pending task with `requires_consent: false` raises no prompt and does not gate runs.
- A pending task with `requires_consent: true` raises the SWR-2802 prompt and gates runs
  exactly as before.
- With both kinds pending, the prompt appears and lists both.
- A background task starts on workspace open and records its outcome without a dialog ever
  being constructed.
- A background task that fails reports through the error banner and leaves the workspace
  re-runnable through the SWR-2805 action.
- A background task recorded as skipped is not started on the next open, and is still listed
  by the manual action.
- A task that declares nothing behaves as `requires_consent: false`.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Background-only pending work raises no prompt; a consent task does; both pending lists both; the default is background; an explicitly skipped background task is not restarted | Registry prompt decision | `tests/unit/test_project_init.py::test_background_tasks_raise_no_prompt`, `::test_a_consent_task_still_raises_the_prompt`, `::test_both_kinds_pending_prompts_and_still_offers_the_background_work`, `::test_task_consent_defaults_to_background`, `::test_an_explicitly_skipped_background_task_is_not_restarted` |
| Integration | The store projects consent-requiring work separately from pending work, and the composer gate follows it | Config service → store → gate | `apps/rotaris/tests/test_project_init_store.py::test_a_consent_requiring_task_brings_the_prompt_back`, `apps/rotaris/tests/test_project_init_wiring.py::test_opening_a_fresh_workspace_sets_it_up_without_prompting_or_gating` |
| User-flow E2E | A user opens a fresh workspace, is never prompted, and can start a run immediately while setup proceeds | Public product boundary → user-observable result | `apps/rotaris/tests/test_project_init_e2e.py::test_first_run_sets_a_workspace_up_without_prompting_or_a_model` |

Epic: [Project Initialization & Serena MCP Integration](../2800-project-initialization.md)
