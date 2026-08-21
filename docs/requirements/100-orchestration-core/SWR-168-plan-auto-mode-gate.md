---
req-id: [SWR-168, SWR-169, SWR-170, SWR-171, SWR-172, SWR-173, SWR-174, SWR-175]
status: draft
trace: required
test: required
title: "Plan-Mode / Auto-Mode Gate"
epic: SWR-100
date: 2026-07-26
---

# 100-orchestration-core — Plan-Mode / Auto-Mode Gate

## SWR-168 — Plan/Auto Mode Toggle

The user must be able to switch between **Plan mode** and **Auto mode** via a
persistent setting. In Plan mode the orchestrator gates execution after the
planner produces a plan; in Auto mode the orchestrator proceeds without gating
(current behaviour). Changing the setting takes effect on the next run.

### Test portfolio

| Level         | Productive scenario                                                                            | Exercised boundary                            | Planned/covering test                             |
| ------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------- |
| Unit          | N/A — setting persistence is a config concern tested at integration level                      | N/A                                           | N/A                                               |
| Integration   | Toggle setting propagates to orchestrator run config                                           | Setting read on run start; default when unset | `test_plan_mode_toggle_propagates_to_run_config`  |
| User-flow E2E | User enables Plan mode in Rotaris settings, starts a run → orchestrator enters gated plan flow | Rotaris settings → orchestrator behaviour     | `test_plan_mode_toggle_from_rotaris_settings_e2e` |

## SWR-169 — Plan Proposal in Plan Mode

When the run starts in Plan mode, the orchestrator must delegate to the planner
persona and present the resulting plan to the user before any implementation
work begins. The planner's output is surfaced verbatim as the proposed plan.

### Test portfolio

| Level         | Productive scenario                                                                            | Exercised boundary                                           | Planned/covering test                                  |
| ------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------ |
| Unit          | N/A — delegation and plan surfacing are integration concerns                                   | N/A                                                          | N/A                                                    |
| Integration   | Plan-mode run triggers planner delegation and surfaces the plan                                | Planner delegation path; plan surfaced before any file edits | `test_plan_mode_delegates_to_planner_before_execution` |
| User-flow E2E | User starts a plan-mode run → planner runs → plan appears in Rotaris UI with execution blocked | Rotaris run start → planner output visible → gate active     | `test_plan_mode_planner_proposal_surfaced_e2e`         |

## SWR-170 — Execution Gate

After the plan is presented, further execution must be blocked until the user
explicitly responds. While the gate is active, no implementation work, file
edits, or further delegations may proceed. The gate must be visible in the UI
with clear indication that user action is required.

### Test portfolio

| Level         | Productive scenario                                                      | Exercised boundary                                         | Planned/covering test                               |
| ------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------- | --------------------------------------------------- |
| Unit          | Gate state machine: blocked → user action → unblocked                    | Invalid transitions, double-confirm                        | `test_execution_gate_state_transitions`             |
| Integration   | Plan presented → gate blocks child spawns and tool calls                 | Child manager rejects spawns; tool executor rejects writes | `test_execution_gate_blocks_implementation_actions` |
| User-flow E2E | Plan appears → user sees gate UI → no file changes occur until user acts | Rotaris gate widget → backend enforcement                  | `test_execution_gate_blocks_until_user_action_e2e`  |

## SWR-171 — Direct Plan Editing

The user must be able to directly edit the proposed plan text in the UI. The
edit experience must feel like editing a document — the full plan text is
editable in place.

### Test portfolio

| Level         | Productive scenario                                                        | Exercised boundary                             | Planned/covering test                  |
| ------------- | -------------------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------- |
| Unit          | N/A — editing is a UI concern                                              | N/A                                            | N/A                                    |
| Integration   | Plan text is loaded into an editable widget; edits are captured            | Empty plan, very long plan, special characters | `test_plan_text_editable_and_captured` |
| User-flow E2E | User clicks into plan, edits text, changes are reflected in the plan state | Rotaris plan editor → plan state updated       | `test_direct_plan_editing_e2e`         |

## SWR-172 — Change Instruction as Text Input

As an alternative to direct editing, the user must be able to enter a free-text
instruction describing what should change in the plan. The instruction is sent
to the agent for plan revision.

### Test portfolio

| Level         | Productive scenario                                                                   | Exercised boundary                       | Planned/covering test                            |
| ------------- | ------------------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------ |
| Unit          | N/A — input is a UI concern                                                           | N/A                                      | N/A                                              |
| Integration   | Text instruction is submitted and routed to the agent for plan iteration              | Empty instruction, very long instruction | `test_change_instruction_routed_to_agent`        |
| User-flow E2E | User types "add error handling section" → agent receives instruction and revises plan | Rotaris input → agent iteration trigger  | `test_change_instruction_triggers_iteration_e2e` |

## SWR-173 — Agent Plan Iteration

After receiving a change instruction, the agent (planner) must revise the plan
accordingly and present the updated plan at the gate. This iteration cycle —
instruction → revision → gate — can repeat indefinitely until the user confirms
the plan.

If the agent fails to produce a revised plan (error, timeout), the previous
plan is preserved at the gate and the failure is surfaced to the user.

### Test portfolio

| Level         | Productive scenario                                                       | Exercised boundary                                           | Planned/covering test                                                                |
| ------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Unit          | Iteration loop: instruction → revision → gate, repeatable                 | Agent failure during revision preserves previous plan        | `test_plan_iteration_cycle_repeatable`, `test_plan_iteration_failure_preserves_plan` |
| Integration   | Full cycle: instruction → planner revises → updated plan at gate          | Planner produces empty plan; planner produces identical plan | `test_plan_iteration_updates_plan_at_gate`                                           |
| User-flow E2E | User requests 3 iterations, each refines the plan, final plan is accepted | Rotaris: iterate → see update → iterate again → accept       | `test_multi_iteration_plan_refinement_e2e`                                           |

## SWR-174 — Post-Edit Choice

After the user directly edits the plan (SWR-171), they must be offered an
explicit choice:

- **(a) Accept and proceed** — confirm the edited plan and transition to
  implementation.
- **(b) Iterate with agent** — send the edited plan to the agent for further
  revision, entering the agent iteration cycle (SWR-173).

The choice must be presented immediately after the user finishes editing. The
gate remains active until one of the two options is selected.

### Test portfolio

| Level         | Productive scenario                                                                                          | Exercised boundary                               | Planned/covering test                         |
| ------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ | --------------------------------------------- |
| Unit          | N/A — choice presentation is a UI concern                                                                    | N/A                                              | N/A                                           |
| Integration   | Post-edit choice state machine: accept → transition; iterate → agent cycle                                   | Choice made with empty edited plan               | `test_post_edit_choice_routing`               |
| User-flow E2E | User edits plan → chooses "Accept" → execution proceeds; user edits plan → chooses "Iterate" → agent revises | Rotaris choice widget → correct follow-up action | `test_post_edit_accept_and_iterate_paths_e2e` |

## SWR-175 — Transition to Execution

After the user confirms the plan — either by accepting the original proposal,
accepting after direct edits, or accepting after agent iteration — the system
must exit the gate and proceed to implementation. The confirmed plan becomes
available as context for the implementation agents but does not constrain them
beyond its role as guidance.

Transition is one-way: once execution begins, the user cannot return to the
plan gate for the same run.

### Test portfolio

| Level         | Productive scenario                                                                   | Exercised boundary                                    | Planned/covering test                                    |
| ------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------- |
| Unit          | Gate → execution transition is irreversible for the run                               | Double-transition attempt                             | `test_gate_to_execution_transition_irreversible`         |
| Integration   | Confirmed plan is injected as context for implementation agents                       | Plan is empty; plan is very large                     | `test_confirmed_plan_injected_as_implementation_context` |
| User-flow E2E | User accepts plan → gate closes → orchestrator proceeds with implementation delegates | Rotaris: gate widget dismisses, implementation begins | `test_plan_acceptance_triggers_execution_e2e`            |

## Acceptance criteria (cross-cutting)

1. In Auto mode, orchestrator behaviour is unchanged from current — no gate, no
   mandatory planner delegation (planner-first routing continues to follow
   SWR-2416 rules).
2. In Plan mode, every run gates after the planner produces output, without
   exception.
3. The gate is visible and clearly indicates that user action is required.
4. Direct editing and text-instruction iteration are both available at the gate;
   they operate on the same plan text.
5. After any number of iterations (agent or manual), the user can accept and
   proceed.
6. The confirmed plan is available to downstream agents but is advisory, not
   binding.
7. Toggling the mode setting does not affect runs already in progress.

## Definition of done

- Persistent Plan/Auto mode setting implemented and propagated to orchestrator
  run config
- Gate state machine implemented in orchestrator core
- Rotaris UI: plan display, direct editor, change-instruction input, post-edit
  choice widget, gate indicator
- Planner integration: delegation in plan mode, iteration on instruction
- `@traces(SWR.SWR_168)` through `@traces(SWR.SWR_175)` on implementation;
  `@verifies` on all covering tests
- `python -m rotaris_core.reqtocode check` green
- Epic index updated

## Notes

- The plan text is the planner persona's output. The gate does not interpret or
  validate the plan — it only holds execution until user confirmation.
- "Direct editing" means the user modifies the plan text in a text editor widget.
  This is distinct from giving a natural-language instruction to the agent.
- The post-edit choice (SWR-174) only applies after direct edits, not after
  agent iteration (where the gate simply re-engages with the revised plan).
- Mode is a persistent setting, not per-run — but a future per-run override
  (e.g. `--plan` / `--auto` CLI flags or a run-start dropdown) is a plausible
  extension.

Epic: [Orchestration & Delegation Core](../100-orchestration-core.md)
