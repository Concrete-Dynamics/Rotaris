---
req-id: SWR-2128
status: approved
trace: required
test: required
type: technical
derived-from: SWR-100
title: "Shared run bootstrap factories"
epic: SWR-100
date: 2026-07-23
---

# SWR-2128 — Shared run bootstrap factories

Run setup — todo construction, summary/improvement-collector agent factories,
the entry-persona agent factory (with model resolver and intent-kwargs
injection), and post-run progress application to `SessionState` — is
duplicated logic that both the CLI background path (`cli/background.py`) and
the TUI (`tui/app_run.py`) need to perform identically before starting a
`RalphLoop`. `src/rotaris_core/ralph/bootstrap.py` centralizes these factory
functions (`build_run_todo`, `make_summary_agent_factory`,
`make_improvement_collector_factory`, `make_improvement_context_provider`,
`make_agent_factory`, `make_entry_model_resolver`, `apply_progress_to_state`)
so neither host reimplements or drifts from the other. It carries no product
behavior of its own beyond what SWR-100 (orchestration core) already promises.

## Acceptance criteria

- `build_run_todo` creates a main phase when no prior todo state exists, and
  appends to the existing first phase otherwise.
- `make_summary_agent_factory` resolves the persona-configured summary model,
  falling back to the default summary model when unset.
- `make_improvement_collector_factory` raises when no model is configured;
  `make_improvement_context_provider` snapshots the run transcript for the
  improvement loop.
- `make_agent_factory` builds an agent factory that injects intent-classification
  kwargs for the default persona, wires the model resolver and augmentor, and
  raises for an unknown persona.
- `make_entry_model_resolver` prefers a live model override for the default
  persona and tolerates hosts without that attribute.
- `apply_progress_to_state` records run progress and the resulting artifact ID
  on `SessionState`.

Derived from: [SWR-100 — Orchestration & Delegation Core](../100-orchestration-core.md)

Epic: [Orchestration & Delegation Core](../100-orchestration-core.md)
