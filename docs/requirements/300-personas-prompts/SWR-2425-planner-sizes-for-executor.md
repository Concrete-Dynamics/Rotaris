---
req-id: SWR-2425
status: approved
trace: required
test: required
title: "Planner output sized for the implementation owner's model tier"
epic: SWR-300
date: 2026-07-28
---

# SWR-2425 — Planner output sized for the implementation owner's model tier

A plan is not a document the planner keeps; it is the input contract of whoever implements
it. The planner's cell must therefore be keyed on **two** tiers, not one:

- **Self-facing slots** (`ROUTE`, `AUTONOMY`, `RESEARCH`, `ARTIFACT`, `BUDGET`) resolve on
  the planner's **own** model tier. A capable planner keeps its own autonomy, research
  judgement, and fan-out budget.
- **Consumer-facing slots** (`CHUNKING`, `OUTPUT`) resolve on the tier of the
  **implementation owner** for the resolved intent — the same persona that keys the
  orchestrator's row under [SWR-2416](SWR-2416-prompt-composition-matrix.md).

Rules:

- The consumer tier applies only when it ranks **below** the planner's own tier. Downgrade,
  never upgrade: a `small_model` planner is never instructed to author `whole-feature`
  slices because the executor happens to be large.
- An unresolved implementation-owner tier resolves to `medium_model` and must be reported as
  unresolved rather than asserted as a real tier, matching the own-tier rule of SWR-2416.
- A `not_routed` consumer cell must be ignored; the planner's own-tier cell stands. The
  executor's absence from a matrix row says nothing about how to size the plan.
- The consumer axis must select only catalogued variants — it introduces no new slot, no new
  variant id, and no new prompt vocabulary.
- The rendered planner playbook must name the persona and model size it sized against, and
  must not restate the sizing itself: task sizing and report shape stay solely in the
  `CHUNKING` / `OUTPUT` variant texts (SWR-2416: run-varying guidance lives in exactly one
  place).
- The resolved consumer tier and consumer persona must be recorded in the session's
  `state/run_config.json` alongside the rest of the cell, so a run can be audited for which
  executor its plan was sized for.
- Every planned task must carry an explicit escalation condition — the trigger under which
  the executor stops and hands the task back instead of improvising. This is persona shape,
  not tier-varying guidance, so it belongs in the planner prompt rather than the matrix.

Observable acceptance: for `moderate_feature` with a `large_model` planner and a
`small_model` coding-agent, the rendered planner prompt selects `micro-slice` chunking and a
`strict-schema` report while keeping `full` autonomy and a `normal` budget; with a
`large_model` coding-agent the planner cell is unchanged from today.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | A large planner asked to plan for a small executor emits micro-sliced, strict-schema steps while keeping its own autonomy and budget | `resolve_playbook_cell` / `render_playbook` | `tests/unit/test_playbook_matrix.py` |
| Unit | The consumer tier never upgrades the plan, and an unresolved owner tier downgrades to `medium_model` | `resolve_playbook_cell` | `tests/unit/test_playbook_matrix.py` |
| Integration | The planner's cell picks up the configured `coding-agent` tier from the live config, not a hardcoded one | `agents/factory.py::resolve_playbook_for_persona` | `tests/unit/test_agent_factory.py` |
| User-flow E2E | After a run, the operator can see which executor the plan was sized for | session dir → `state/run_config.json` | `tests/unit/test_session_diagnostics.py::test_run_config_records_resolved_playbooks` |

Related: [SWR-2416 — Persona × intent × model-tier prompt composition](SWR-2416-prompt-composition-matrix.md).
SWR-2416 keys the orchestrator on the implementation owner's tier but keys every other
persona wholly on its own; SWR-2425 splits the planner's row so the half of it that describes
someone else's work follows that person's capacity.

Epic: [Agent Personas & Prompt System](../300-personas-prompts.md)
