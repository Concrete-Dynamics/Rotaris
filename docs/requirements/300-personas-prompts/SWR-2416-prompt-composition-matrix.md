---
req-id: SWR-2416
status: approved
trace: required
test: required
title: "Persona x intent x model-tier prompt composition"
epic: SWR-300
date: 2026-07-25
---

# SWR-2416 — Persona × intent × model-tier prompt composition

Every persona's rendered system prompt must be composed from a resolved playbook cell keyed
on **(persona, classified intent, model tier)**, as specified in
[docs/architecture/prompt-composition-matrix.md](../../architecture/prompt-composition-matrix.md).

- The classified run intent must reach **every** spawned persona, not only
  `config.default_persona`.
- Each persona except the orchestrator resolves its cell using its **own** model tier. The
  orchestrator resolves its cell using the tier of the **implementation owner** for the
  resolved intent (`coding-agent`, or `refactorer` / `requirements-engineer` / `architect`
  for `refactor` / `requirements` / `architectural`).
- A cell selects exactly one variant per injectable slot (`ROUTE`, `AUTONOMY`, `RESEARCH`,
  `CHUNKING`, `VERIFY`, `ARTIFACT`, `OUTPUT`, `BUDGET`) from the catalogued variants. Cells
  must not introduce free-form prompt text.
- An unresolved model tier must resolve to `medium_model` and the prompt must state that the
  tier was not determined rather than assert a tier.
- Cell guidance overrides generic base-prompt guidance; persona hard blocks are not
  overridable by any cell.
- A cell must not reference a tool the persona does not hold under the active tool
  restrictions — prompt composition and tool gating stay independent.
- The resolved cell (persona, intent, tier, selected variants) must be recorded in the
  session's `state/run_config.json` so a run can be audited for which playbook it executed.
- A host-selected delegation strategy (`swarm` / `single`) must be rendered after the cell
  and declared to win over it, rather than being concatenated into intent prompt text.
- Run-varying guidance must exist in exactly one place. The delegate listing may report a
  delegate's model size as a capacity fact, but must not restate task sizing; no persona
  prompt or section builder may restate autonomy, research policy, task sizing, verification
  ownership, artifact duties, report shape, or fan-out budget.
- The `BUDGET` slot must bind the runtime: the `RuntimePolicy` used for each iteration's
  child manager must be narrowed to the orchestrator cell's fan-out, total-child, and depth
  ceilings. The clamp must never raise a limit the configuration already set tighter, and a
  failure to resolve it must fall back to the configured policy rather than abort the run.
- The matrix and variant catalogue must be overridable per scope, layered global then
  workspace over the shipped defaults, merged field-wise. An override may re-map a cell or
  re-word a catalogued variant, but a variant id or slot that does not exist in the shipped
  catalogue must be rejected with a warning, and an unreadable override must be skipped
  rather than fail the run.
- Retired placeholders (`INTENT_INSTRUCTIONS`, `DELEGATION_STRATEGY`, `HARD_BLOCKS`,
  `ANTI_PATTERNS`, `WORKFLOW`, `TROUBLESHOOTING`, `CATEGORY_SKILLS`) must render literally
  and log a warning, so a stale reference in a prompt file fails loudly.

Observable acceptance: for `small_feature` with a `large_model` coding-agent, the rendered
orchestrator prompt instructs direct delegation with no pre-research wave and the rendered
coding-agent prompt grants full autonomy including self-verification; for `moderate_feature`
with a `small_model` coding-agent, the rendered orchestrator prompt requires a published
research artifact and micro-slice decomposition, and the rendered coding-agent prompt forbids
self-directed research and self-certification.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Resolving and rendering a cell for a given persona, intent, and tier yields the specified variants, and the matrix itself stays internally consistent | `resolve_playbook_cell` / `render_playbook` / `render_system_prompt` | `tests/unit/test_playbook_matrix.py` |
| Integration | The classified run intent reaches every spawned persona, not only the entry agent, so each resolves its own cell | `ralph/bootstrap.py::make_agent_factory` → `agents/factory.py` | `tests/unit/test_ralph_bootstrap.py::test_make_agent_factory_propagates_run_intent_to_every_persona` |
| User-flow E2E | After a run, the operator can open the session and see which playbook each persona executed | session dir → `state/run_config.json` | `tests/unit/test_session_diagnostics.py::test_run_config_records_resolved_playbooks` |

Related: [SWR-386 — Tier-aware coding-agent delegation guidance](SWR-386-tier-aware-coding-delegation.md).
SWR-2416 generalizes SWR-386 from the orchestrator's `coding-agent` delegate bullet to the
full persona × intent × tier matrix; SWR-386's tier-detection and truthful-reporting rules
remain in force.

Epic: [Agent Personas & Prompt System](../300-personas-prompts.md)
