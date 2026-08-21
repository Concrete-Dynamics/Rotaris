---
req-id: [SWR-800, SWR-801, SWR-802, SWR-803, SWR-804, SWR-805, SWR-806, SWR-807, SWR-808, SWR-809, SWR-810, SWR-811, SWR-812, SWR-813, SWR-814, SWR-815, SWR-816, SWR-817, SWR-818, SWR-819, SWR-820, SWR-821, SWR-822, SWR-823, SWR-824, SWR-825, SWR-826, SWR-827, SWR-828, SWR-829, SWR-830, SWR-831, SWR-832, SWR-833, SWR-834, SWR-835, SWR-836, SWR-837, SWR-838, SWR-839, SWR-840, SWR-841, SWR-842, SWR-843, SWR-844, SWR-845, SWR-846, SWR-847, SWR-848, SWR-849, SWR-850, SWR-851, SWR-852, SWR-853, SWR-854, SWR-855, SWR-856, SWR-857, SWR-858, SWR-859, SWR-860, SWR-861, SWR-862, SWR-863, SWR-864, SWR-2810, SWR-2812]
status: approved
trace: required
test: required
title: "Model Registry & Selection"
---

# 800-model-registry spec

## SWR-800 — Model Registry & Selection
trace: optional
test: optional

Model metadata and selection: provider model registry, model refresh, runtime selection, thinking depth, context-length and cost-estimation fallbacks.

Derived requirements: [SWR-865 — Process-wide LiteLLM streaming runtime policy](800-model-registry/SWR-865-litellm-runtime-policy.md)

## SWR-801 — On TUI launch, the active starting model must be initialized from the configured startup model selection resolved at launch.
legacy-id: REQ-20260503-017
date: 2026-05-03
source: docs/requirement-log/done/requirements-20260503-123000.md
priority: High



## SWR-802 — After successful authentication with a provider that has a discovered runtime catalog, the TUI must obtain and present the complete runtime model list exposed by that authenticated provider.
legacy-id: REQ-20260503-018
date: 2026-05-03
source: docs/requirement-log/done/requirements-20260503-123000.md
priority: High



## SWR-803 — The runtime model list for an authenticated provider with a discovered catalog must include provider-exposed models even when those model IDs are absent from `agents.yaml`.
legacy-id: REQ-20260503-019
date: 2026-05-03
source: docs/requirement-log/done/requirements-20260503-123000.md
priority: High



## SWR-804 — Runtime provider model selection is supported for all authenticated providers with discovered runtime catalogs. Providers without authenticated runtime catalogs remain configuration-driven.
legacy-id: REQ-20260503-020
date: 2026-05-03
source: docs/requirement-log/done/requirements-20260503-123000.md
priority: Medium



## SWR-805 — `Ctrl+M` must always open a dedicated model-selection screen in the TUI.
legacy-id: REQ-20260503-021
date: 2026-05-03
source: docs/requirement-log/done/requirements-20260503-123000.md
priority: High



## SWR-806 — The command palette must expose the same model-selection action so the runtime selector remains discoverable without relying solely on the key binding.
legacy-id: REQ-20260503-022
date: 2026-05-03
source: docs/requirement-log/done/requirements-20260503-123000.md
priority: Medium



## SWR-807 — The model-selection screen must clearly identify which provider catalog is being shown and must not present models from multiple providers as a single undifferentiated list.
legacy-id: REQ-20260503-023
date: 2026-05-03
source: docs/requirement-log/done/requirements-20260503-123000.md
priority: Medium



## SWR-808 — Selecting a runtime-discovered provider model must override the active starting model for the current in-memory TUI session, including models not declared in `agents.yaml`.
legacy-id: REQ-20260503-024
date: 2026-05-03
source: docs/requirement-log/done/requirements-20260503-123000.md
priority: High



## SWR-809 — A runtime-selected model must not be written to `agents.yaml`, persistent settings, or session snapshots used for restart/restore.
legacy-id: REQ-20260503-025
date: 2026-05-03
source: docs/requirement-log/done/requirements-20260503-123000.md
priority: High



## SWR-810 — After app restart or session restoration from disk, Rotaris must reload the configured starting model first and must not automatically reinstate the prior runtime-selected model.
legacy-id: REQ-20260503-026
date: 2026-05-03
source: docs/requirement-log/done/requirements-20260503-123000.md
priority: High



## SWR-811 — If runtime model selection is unavailable because the relevant provider is unauthenticated or its runtime model catalog cannot be obtained, the TUI must leave the configured starting model unchanged and show a non-blocking explanation in the selector flow.
legacy-id: REQ-20260503-027
date: 2026-05-03
source: docs/requirement-log/done/requirements-20260503-123000.md
priority: Medium



## SWR-812 — Provider Registration
status: draft
legacy-id: REQ-20260511-MODEL-PROVIDER-001
date: 2026-05-11
source: docs/requirement-log/partial/requirements-20260511-model-provider-registry.md

The system MUST maintain an internal registry of known providers. Each provider entry MUST include at minimum: Custom providers MAY additionally declare: Example - GitHub Copilot: provider_id: github-copilot display_name: GitHub Copilot auth_methods: [device_code] model_discovery: { type: dynamic } enabled: true Example - OpenAI / Codex: provider_id: openai | Partial - minimal catalog plus multi-instance `openai-compatible` setup implemented for onboarding and snapshot-backed runtime resolution; broader registry lifecycle requirements remain deferred.

## SWR-813 — Credential Authentication and Storage
status: draft
legacy-id: REQ-20260511-MODEL-PROVIDER-002
date: 2026-05-11
source: docs/requirement-log/partial/requirements-20260511-model-provider-registry.md

The system MUST decouple authentication credentials from all project files. Required constraints: Token refresh MUST happen transparently: external components receive a validated credential handle without knowing expiration timelines. Recommended `auth_profile_id` convention: auth_profile_id: <provider_id>:<profile_label> Examples: `openai:default`, `github- | Partial - minimal catalog plus multi-instance `openai-compatible` setup implemented for onboarding and snapshot-backed runtime resolution; broader registry lifecycle requirements remain deferred.

## SWR-814 — Stable Model Identifiers
status: draft
legacy-id: REQ-20260511-MODEL-PROVIDER-003
date: 2026-05-11
source: docs/requirement-log/partial/requirements-20260511-model-provider-registry.md

Every model exposed by the system MUST have a globally unique identifier composed of two parts joined by a forward slash: provider_id/model_id Rules for model IDs: Identifier examples: openai/gpt-5.1-codex github-copilot/gpt-5.1-codex lmstudio/google/gemma-3n-e4b myprovider/my-model-name openai/gpt-5#high anthropic/claude-sonnet-4-5#max | Partial - minimal catalog plus multi-instance `openai-compatible` setup implemented for onboarding and snapshot-backed runtime resolution; broader registry lifecycle requirements remain deferred.

## SWR-815 — Model Metadata Schema
status: draft
legacy-id: REQ-20260511-MODEL-PROVIDER-004
date: 2026-05-11
source: docs/requirement-log/partial/requirements-20260511-model-provider-registry.md

Each discovered or configured model MUST record at minimum: Capabilities sub-object: capabilities: tool_calling: boolean reasoning: boolean temperature: boolean attachments: boolean vision: boolean modalities: input: - text | image | audio | video | file output: - text Limits sub-object: limits: context_tokens: integer | null output_tokens: integer | null Pr | Partial - minimal catalog plus multi-instance `openai-compatible` setup implemented for onboarding and snapshot-backed runtime resolution; broader registry lifecycle requirements remain deferred.

## SWR-816 — Model Discovery and Refresh
status: draft
legacy-id: REQ-20260511-MODEL-PROVIDER-005
date: 2026-05-11
source: docs/requirement-log/partial/requirements-20260511-model-provider-registry.md

The system MUST refresh model listings when any of the following triggers fire: Discovery pipeline - deterministic order: 1. Verify the provider is authenticated or has valid static config. Skip if neither. 2. Fetch model listing: call the provider API for `{type: dynamic}` providers, or load from the static config for `{type: configured}` or `{type: mixed}` | Partial - minimal catalog plus multi-instance `openai-compatible` setup implemented for onboarding and snapshot-backed runtime resolution; broader registry lifecycle requirements remain deferred.

## SWR-817 — Project Settings Persistence
status: draft
legacy-id: REQ-20260511-MODEL-PROVIDER-006
date: 2026-05-11
source: docs/requirement-log/partial/requirements-20260511-model-provider-registry.md

Available models AND provider state MUST persist in project settings without including any credentials. Persisted shape (excerpt): models: registry_version: 1 # bumped on breaking schema changes updated_at: "2026-05-11T10:00:00Z" providers: openai: display_name: OpenAI / Codex enabled: true auth_profile_id: "openai:default" discovery_status: ok | error | unk | Partial - minimal catalog plus multi-instance `openai-compatible` setup implemented for onboarding and snapshot-backed runtime resolution; broader registry lifecycle requirements remain deferred.

## SWR-818 — Model Reference Validation in `agent.yaml`
status: draft
legacy-id: REQ-20260511-MODEL-PROVIDER-007
date: 2026-05-11
source: docs/requirement-log/partial/requirements-20260511-model-provider-registry.md

The `agent.yaml` configuration MUST reference models exclusively via stable identifiers maintained by the registry. Schema excerpt for persona-level model references: agents: coder: model: openai/gpt-5.1-codex fallback_models: - github-copilot/gpt-5.1-codex - openai/gpt-5#high options: reasoning_effort: high summarizer: model: openai/gpt-5-mini Validation ru | Partial - minimal catalog plus multi-instance `openai-compatible` setup implemented for onboarding and snapshot-backed runtime resolution; broader registry lifecycle requirements remain deferred.

## SWR-819 — The CLI MUST expose a first-class manual refresh command at `rotaris-cli models refresh`.
legacy-id: REQ-20260511-REFRESH-001
date: 2026-05-11
source: docs/requirement-log/done/requirements-20260511-model-refresh-cli.md
priority: High



## SWR-820 — `rotaris-cli models refresh` MUST, by default, target all enabled providers that currently have valid authenticated credentials or valid static model configuration.
legacy-id: REQ-20260511-REFRESH-002
date: 2026-05-11
source: docs/requirement-log/done/requirements-20260511-model-refresh-cli.md
priority: High



## SWR-821 — The command MUST support provider scoping via `rotaris-cli models refresh --provider <provider_id>`, limiting discovery and status reporting to the named provider only.
legacy-id: REQ-20260511-REFRESH-003
date: 2026-05-11
source: docs/requirement-log/done/requirements-20260511-model-refresh-cli.md
priority: High



## SWR-822 — Each invocation of the command MUST execute the same canonical discovery pipeline defined by `requirements-20260511-model-provider-registry.md` R5, including snapshot diffing, timestamp updates, and retention of unavailable or deprecated models.
legacy-id: REQ-20260511-REFRESH-004
date: 2026-05-11
source: docs/requirement-log/done/requirements-20260511-model-refresh-cli.md
priority: High



## SWR-823 — The command MUST report progress and outcome via standard CLI output, including which providers were targeted, which providers refreshed successfully, and which providers failed discovery.
legacy-id: REQ-20260511-REFRESH-005
date: 2026-05-11
source: docs/requirement-log/done/requirements-20260511-model-refresh-cli.md
priority: Medium



## SWR-824 — The command MUST exit with status code `0` when all targeted providers refresh successfully, and with a non-zero exit status when discovery fails for any targeted provider or when no targeted provider is eligible for refresh.
legacy-id: REQ-20260511-REFRESH-006
date: 2026-05-11
source: docs/requirement-log/done/requirements-20260511-model-refresh-cli.md
priority: High



## SWR-825 — If a targeted provider is unauthenticated, disabled, or otherwise ineligible for refresh, the command MUST report that state clearly and MUST NOT silently fall back to re-running the provider login flow.
legacy-id: REQ-20260511-REFRESH-007
date: 2026-05-11
source: docs/requirement-log/done/requirements-20260511-model-refresh-cli.md
priority: Medium



## SWR-826 — The product must expose saved startup model defaults through the top-level `agents.yaml` fields `small_model`, `medium_model`, `large_model`, `default_summary_model`, and `fallback_model`.
legacy-id: REQ-20260511-039
date: 2026-05-11
source: docs/requirement-log/partial/requirements-20260511-startup-model-defaults.md
priority: High



## SWR-827 — The literal aliases `small_model`, `medium_model`, and `large_model` must resolve consistently anywhere a persona or subsystem model reference can appear.
legacy-id: REQ-20260511-040
date: 2026-05-11
source: docs/requirement-log/partial/requirements-20260511-startup-model-defaults.md
priority: High



## SWR-828 — The TUI command surface must expose a dedicated persistent startup-model settings flow that is distinct from temporary runtime model switching.
legacy-id: REQ-20260511-041
date: 2026-05-11
source: docs/requirement-log/partial/requirements-20260511-startup-model-defaults.md
priority: High



## SWR-829 — The persistent startup-model settings flow must allow the user to edit startup slots and save those changes back to workspace `agents.yaml`.
legacy-id: REQ-20260511-042
date: 2026-05-11
source: docs/requirement-log/partial/requirements-20260511-startup-model-defaults.md
priority: High



## SWR-830 — The persistent startup-model settings flow must allow per-persona model overrides while preserving persona inheritance when no explicit override is set.
legacy-id: REQ-20260511-043
date: 2026-05-11
source: docs/requirement-log/partial/requirements-20260511-startup-model-defaults.md
priority: High



## SWR-831 — Saving persistent startup-model settings must be non-destructive: only changed startup fields and persona overrides may be written, and existing unrelated configuration must remain intact.
legacy-id: REQ-20260511-044
date: 2026-05-11
source: docs/requirement-log/partial/requirements-20260511-startup-model-defaults.md
priority: High



## SWR-832 — Repository-facing documentation must describe the recommended quickstart path as install → `rotaris-cli login` → `rotaris-cli run` → optional startup-model tuning, without requiring `models.yml`.
trace: optional
test: optional
legacy-id: REQ-20260511-045
date: 2026-05-11
source: docs/requirement-log/partial/requirements-20260511-startup-model-defaults.md
priority: High



## SWR-833 — The onboarding flow should eventually offer a first-run review/edit step for the discovered startup slot assignments before the user starts normal work.
status: approved
trace: required
test: required
legacy-id: REQ-20260511-046
date: 2026-05-11
source: docs/requirement-log/partial/requirements-20260511-startup-model-defaults.md
priority: Medium

After first-run OAuth login (Copilot, OpenAI, Anthropic), startup slot
assignments are written to the project snapshot but the workspace `agents.yaml`
retains bootstrap nulls. Before the user starts normal work, Rotaris must show a
review screen where they inspect the discovered model-to-slot mapping and confirm
or adjust it.

### Acceptance Criteria

- **AC-833.1 — Detection:** After a first-run OAuth login (`rotaris-cli login` or
  auto-launched login from `rotaris-cli run`), when the workspace `agents.yaml`
  has all startup slot fields set to `null` but the resolved config has real model
  assignments, Rotaris must detect that onboarding review is needed.

- **AC-833.2 — Screen before main UI:** The onboarding review screen must appear
  before the normal main screen (TUI `MainScreen`). The user must not see the
  agent chat or run interface until they have dismissed or saved the review.

- **AC-833.3 — Review content:** The screen must display the discovered model
  assignments for `small_model`, `medium_model`, `large_model`,
  `default_summary_model`, `fallback_model`, and `improvement_collector_model`.
  The user must be able to inspect each assignment.

- **AC-833.4 — Editing:** The user must be able to change each slot assignment
  by picking from the available model catalog (configured + runtime-discovered
  models) or from the persona-size aliases. Thinking-level overrides must also
  be editable.

- **AC-833.5 — Save & Continue:** Choosing "Save" must persist the assignments
  to the workspace `agents.yaml`, reload the config, and transition to the main
  screen.

- **AC-833.6 — Skip / dismiss:** Choosing "Close" (Escape) without saving must
  dismiss the review screen and transition to the main screen. The user may
  return to startup model configuration later through the normal settings path.

- **AC-833.7 — No double detection:** The onboarding review must not appear on
  subsequent launches once the workspace `agents.yaml` has been populated (i.e.,
  the slots are no longer all-null).

- **AC-833.8 — OpenAI-compatible exclusion:** Providers with
  `configure_models=True` (e.g., local Ollama) write directly to `agents.yaml`
  during login and must not trigger the onboarding review.

### Implementation Notes

Onboarding detection lives in `_detect_onboarding_review()` (`cli/app.py`). The
flag flows through `RotarisTuiApp(show_onboarding_review=...)` → `on_mount()` →
`action_show_startup_models(onboarding=True, push_before_main=True)`. The review
screen is the existing `StartupModelsScreen` with `onboarding_review=True`.



## SWR-834 — The product should clearly separate the naming and discoverability of persistent startup defaults from temporary runtime model overrides so users do not confuse what survives restart.
legacy-id: REQ-20260511-047
date: 2026-05-11
source: docs/requirement-log/partial/requirements-20260511-startup-model-defaults.md
priority: High



## SWR-835 — Unknown or custom models lacking LiteLLM pricing metadata MUST not lose cost telemetry entirely; Rotaris must surface an estimated cost path
status: approved
legacy-id: REQ-20260526-001
date: 2026-05-26
source: docs/requirement-log/unresolved/requirements-20260526-unknown-model-cost-estimation.md
priority: High

Cost is read from the SDK's own `LLM.metrics` (`accumulated_cost`, `costs`,
`token_usages`) and propagated tracker → session snapshot → UI. Rotaris never
computes a price itself: when the SDK reports no cost the run is labelled
unavailable rather than free.

### Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | A run's LLM reports accumulated cost for some calls and none for others. | `rotaris_core.cost` snapshot extraction + tracker aggregation | `tests/unit/test_cost.py`, `tests/unit/test_token_tracking.py` |
| Integration | A session is persisted and resumed; cost survives the snapshot roundtrip, including pre-cost snapshots. | Session state persistence | `tests/unit/test_session_state.py`, `tests/integration/test_cost_telemetry_e2e.py` |
| User-flow E2E | A user finishes a run and reads cumulative cost in the session projection the UI renders. | Session run → persisted snapshot → `SessionProjection` | `tests/integration/test_cost_telemetry_e2e.py` |



## SWR-836 — Cost fallback MUST be separate from compression token-estimation logic and MUST NOT affect compression threshold decisions
status: approved
legacy-id: REQ-20260526-002
date: 2026-05-26
source: docs/requirement-log/unresolved/requirements-20260526-unknown-model-cost-estimation.md
priority: High

Cost reporting lives in `src/rotaris_core/cost.py`. `rotaris_core.tokens` and the
condenser keep deciding compression on token counts alone and import nothing
from the cost module.

### Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Cost extraction runs against an LLM whose token metrics are unchanged by it. | `rotaris_core.cost` module isolation | `tests/unit/test_cost.py` |
| Integration | A long run crosses the compression threshold while cost is unavailable; compression still triggers on tokens. | Condenser + tracker | `tests/integration/test_compression_e2e.py` |
| User-flow E2E | `N/A — no user-observable behaviour beyond SWR-835/841; this is a coupling constraint.` | — | — |



## SWR-837 — Model config SHOULD support optional per-model pricing metadata so users can define prompt/completion pricing for custom endpoints
status: approved
legacy-id: REQ-20260526-003
date: 2026-05-26
source: docs/requirement-log/unresolved/requirements-20260526-unknown-model-cost-estimation.md
priority: High

`ModelConfig` accepts optional `input_cost_per_token` and
`output_cost_per_token`. Both are forwarded verbatim to the SDK's `LLM`, which
hands them to LiteLLM as `custom_cost_per_token`; models without them keep
today's pricing path untouched.

### Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | A user declares prompt/completion prices for a custom endpoint, and a negative price is rejected. | `ModelConfig` schema | `tests/unit/test_config_schema.py` |
| Integration | A configured model is loaded and both prices reach the SDK; an unconfigured model passes neither. | `load_llm_for_model` | `tests/unit/test_config_loader.py` |
| User-flow E2E | A user adds pricing under `models:` and the next run reports a labelled cost. | Config → run → session projection | `tests/integration/test_cost_telemetry_e2e.py` |



## SWR-838 — When pricing metadata is unavailable, the runtime MUST either use configured fallback pricing or mark cost as unavailable without noisy repeats
status: approved
legacy-id: REQ-20260526-004
date: 2026-05-26
source: docs/requirement-log/unresolved/requirements-20260526-unknown-model-cost-estimation.md
priority: High

Configured pricing is used when present; otherwise the snapshot's source is
`unavailable`. The SDK's per-call "Cost calculation failed" warning is collapsed
to one occurrence per model/provider pair per process.

### Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | An unpriced model produces an `unavailable` snapshot instead of a zero cost. | `extract_cost_usage` source resolution | `tests/unit/test_cost.py` |
| Integration | A run against an unpriceable model emits the SDK pricing warning once, not once per call. | LiteLLM runtime configuration | `tests/unit/providers/test_litellm_runtime.py` |
| User-flow E2E | A user runs an unpriceable model and sees an explicit unavailable marker plus a single warning. | Run → session projection + process warnings | `tests/integration/test_cost_telemetry_e2e.py` |



## SWR-839 — Any fallback-derived cost value MUST be explicitly labeled as estimated or configured, not exact provider-reported cost
status: approved
legacy-id: REQ-20260526-005
date: 2026-05-26
source: docs/requirement-log/unresolved/requirements-20260526-unknown-model-cost-estimation.md
priority: Medium

Every snapshot carries a `CostSource` (`provider`, `configured`, `unavailable`,
`mixed`). Rendering appends `(configured)` for user-supplied pricing and
`~… (partial)` when only part of a run could be priced.

### Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Provider-priced, user-configured and partially priced runs each render a distinct label. | `CostSource` + `format_cost` | `tests/unit/test_cost.py` |
| Integration | Merging per-agent snapshots of different sources yields a `mixed` label rather than a false exact value. | Tracker aggregation | `tests/unit/test_token_tracking.py` |
| User-flow E2E | A user reading a configured-pricing run sees it marked as configured, not as provider-reported. | Run → session projection | `tests/integration/test_cost_telemetry_e2e.py` |



## SWR-840 — Repeated unknown-model pricing warnings for the same model/provider pair SHOULD be deduplicated per session
status: approved
legacy-id: REQ-20260526-006
date: 2026-05-26
source: docs/requirement-log/unresolved/requirements-20260526-unknown-model-cost-estimation.md
priority: Medium

`configure_litellm_runtime()` installs a `warnings.filterwarnings("once", …)`
entry for the SDK's cost-calculation warning. The filter keys on the rendered
message, which embeds `model=…`, so distinct models still warn separately.

### Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | The same unpriceable model warns once across many calls; a second model still warns. | `dedupe_cost_calculation_warnings` | `tests/unit/providers/test_litellm_runtime.py` |
| Integration | `N/A — the filter is process-global and fully observable at the unit boundary.` | — | — |
| User-flow E2E | A user's console shows one pricing warning per model for the whole session. | LiteLLM runtime configuration on first LLM load | `tests/unit/providers/test_litellm_runtime.py` |



## SWR-841 — TUI/session summaries that display cost data MUST tolerate missing pricing metadata without crashing or misleading zero-cost output
status: approved
legacy-id: REQ-20260526-007
date: 2026-05-26
source: docs/requirement-log/unresolved/requirements-20260526-unknown-model-cost-estimation.md
priority: Medium

The Rotaris chrome and dashboard, the TUI info pane and the session diagnostics
summary all render a pre-formatted label. An unpriced run reads `n/a` or `—`;
`$0.00` is never shown as a stand-in for unknown pricing.

### Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | An unavailable snapshot renders as `n/a`; a priced one renders an amount. | `format_cost` + session diagnostics summary | `tests/unit/test_cost.py`, `tests/unit/test_session_diagnostics.py` |
| Integration | The Rotaris status chrome and dashboard KPI render both an unavailable and a priced projection. | Rotaris views + projection | `apps/rotaris/tests/test_cost_display.py` |
| User-flow E2E | A user with an unpriceable model reads the dashboard and never sees a zero-cost claim. | Run → persisted snapshot → Rotaris projection | `tests/integration/test_cost_telemetry_e2e.py` |



## SWR-842 — A per-model context-length registry must exist as a single source of truth, keyed by qualified model ID (`provider_id/model_id`), mapping to `(max_input_tokens, max_output_tokens)` tuples.
legacy-id: REQ-20260528-011
date: 2026-05-28
source: docs/requirement-log/partial/requirements-20260528-model-context-length-registry.md
priority: High



## SWR-843 — The registry must include known context lengths for all models from built-in providers: OpenAI (GPT-3.5 through GPT-5 families), Anthropic (Claude 3 through Claude Opus 4.7 families), DeepSeek (V3/V4), Google Gemini (1.5/2.x/3.x families), and Copilot-proxied OpenAI models.
status: draft
trace: optional
legacy-id: REQ-20260528-012
date: 2026-05-28
source: docs/requirement-log/partial/requirements-20260528-model-context-length-registry.md
priority: High



## SWR-844 — The precedence for resolving a model's token limits must be: (1) values explicitly set by the user in `agents.yaml`/`models.yml` `max_input_tokens`/`max_output_tokens` fields, (2) values returned by the provider's `/models` API at discovery time, (3) values from the known-model registry, (4) `None`.
legacy-id: REQ-20260528-013
date: 2026-05-28
source: docs/requirement-log/partial/requirements-20260528-model-context-length-registry.md
priority: High



## SWR-845 — The `apply_known_token_limits()` function must consult the per-model registry using the qualified model ID, falling back to provider-prefix matching only when an exact model match is absent.
legacy-id: REQ-20260528-014
date: 2026-05-28
source: docs/requirement-log/partial/requirements-20260528-model-context-length-registry.md
priority: High



## SWR-846 — When a model is not found in the registry and the API returned no limits, both `max_input_tokens` and `max_output_tokens` must remain `None` - the system must not fabricate or guess context lengths.
legacy-id: REQ-20260528-015
date: 2026-05-28
source: docs/requirement-log/partial/requirements-20260528-model-context-length-registry.md
priority: Medium



## SWR-847 — The registry must support provider-prefix wildcard entries (e.g. `\"openai-compatible/\"`) as a catch-all for unknown models from a provider family, enabling users to configure a default context length for all models behind a self-hosted endpoint.
legacy-id: REQ-20260528-016
date: 2026-05-28
source: docs/requirement-log/partial/requirements-20260528-model-context-length-registry.md
priority: Medium



## SWR-848 — The registry must be maintainable: entries must be structured for easy addition and review (e.g. grouped by provider, with model family comments) so that adding a new model requires a single-line insert.
legacy-id: REQ-20260528-017
date: 2026-05-28
source: docs/requirement-log/partial/requirements-20260528-model-context-length-registry.md
priority: Medium



## SWR-849 — The `ModelConfig` schema already supports `max_input_tokens` and `max_output_tokens` - no schema changes are required. The existing `context_compression_threshold` field must continue to work correctly when limits are resolved from the registry (the threshold field's semantics are unchanged).
trace: optional
test: optional
legacy-id: REQ-20260528-018
date: 2026-05-28
source: docs/requirement-log/partial/requirements-20260528-model-context-length-registry.md
priority: High



## SWR-850 — The LLM message-sanitization pipeline (`model_input.sanitize_completion_messages`) must consume the context-length registry to progressively truncate older tool-role message content as context pressure increases beyond a safe ratio of the model's context window, preventing sudden context-window overflow without the overhead of a full condensation cycle. Truncation must be age-weighted: older tool results lose more content than newer ones, preserving the agent's recent working set.
status: draft
legacy-id: REQ-20260528-019
date: 2026-05-28
source: docs/requirement-log/partial/requirements-20260528-model-context-length-registry.md
priority: Medium



## SWR-851 — When the context-length registry contains no entry for the active model, progressive truncation must degrade gracefully - the message list must pass through unchanged, with no fabricated defaults.
legacy-id: REQ-20260528-020
date: 2026-05-28
source: docs/requirement-log/partial/requirements-20260528-model-context-length-registry.md
priority: Medium



## SWR-852 — Create a thinking-capability catalog at `src/rotaris_core/models/thinking_catalog.py` mapping model identifiers to supported thinking modes and valid `reasoning_effort`/budget levels per model
legacy-id: REQ-20260528-001
date: 2026-05-28
source: docs/requirement-log/done/requirements-20260528-thinking-depth-config.md
priority: High



## SWR-853 — The catalog must declare support for DeepSeek models: `deepseek-v4-pro` and `deepseek-v4-flash` support thinking mode with effort levels `low`, `medium`, `high`, `max` (where `low`/`medium` are API-clamped to `high`)
legacy-id: REQ-20260528-002
date: 2026-05-28
source: docs/requirement-log/done/requirements-20260528-thinking-depth-config.md
priority: High



## SWR-854 — The catalog must declare support for Anthropic Claude models with extended thinking (`claude-3-7-sonnet-*`, `claude-4-*` etc.) listing valid budget tiers
legacy-id: REQ-20260528-003
date: 2026-05-28
source: docs/requirement-log/done/requirements-20260528-thinking-depth-config.md
priority: Medium



## SWR-855 — The catalog must declare support for OpenAI reasoning models (`o1`, `o3`, `o3-mini`, `o4-mini`, `gpt-5*`) with valid `reasoning_effort` values
legacy-id: REQ-20260528-004
date: 2026-05-28
source: docs/requirement-log/done/requirements-20260528-thinking-depth-config.md
priority: Medium



## SWR-856 — The catalog must include a generic \"unknown model\" fallback: if a model is not in the catalog, thinking mode should produce a logged warning and default to the provider-level mapping without model-specific validation
legacy-id: REQ-20260528-005
date: 2026-05-28
source: docs/requirement-log/done/requirements-20260528-thinking-depth-config.md
priority: Medium



## SWR-857 — Fix `_DEEPSEEK_REASONING_EFFORT` in `config/loader.py`: `max` must map to `\"max\"` (not `\"high\"`), since DeepSeek V4 supports `reasoning_effort=\"max\"` natively
legacy-id: REQ-20260528-006
date: 2026-05-28
source: docs/requirement-log/done/requirements-20260528-thinking-depth-config.md
priority: High



## SWR-858 — Add thinking fields (`thinking` and optionally `reasoning_effort`) to the startup-model data model so that `STARTUP_MODEL_FIELDS` can carry thinking preferences alongside model names
legacy-id: REQ-20260528-007
date: 2026-05-28
source: docs/requirement-log/done/requirements-20260528-thinking-depth-config.md
priority: High



## SWR-859 — Extend `write_startup_model_preferences()` in `startup_models.py` to persist thinking settings per tier slot in `agents.yaml`
legacy-id: REQ-20260528-008
date: 2026-05-28
source: docs/requirement-log/done/requirements-20260528-thinking-depth-config.md
priority: High



## SWR-860 — Extend `read_startup_model_preferences()` in `startup_models.py` to return thinking preferences per tier slot alongside resolved model names
legacy-id: REQ-20260528-009
date: 2026-05-28
source: docs/requirement-log/done/requirements-20260528-thinking-depth-config.md
priority: High



## SWR-861 — Update the TUI startup-model editor to expose thinking depth as a dedicated selector column for each tier slot, with available options filtered by the model's capabilities from the catalog
legacy-id: REQ-20260528-010
date: 2026-05-28
source: docs/requirement-log/done/requirements-20260528-thinking-depth-config.md
priority: Medium



## SWR-862 — When a user changes the model for a tier slot in the TUI, the thinking selector must update to show only the effort levels that model supports (or \"None\" if the model does not support thinking)
legacy-id: REQ-20260528-011
date: 2026-05-28
source: docs/requirement-log/done/requirements-20260528-thinking-depth-config.md
priority: Medium



## SWR-863 — The `_resolve_thinking_kwargs()` function must consult the capability catalog before emitting thinking kwargs. If the model does not support thinking, emit a warning and return `{}` even if `thinking` is set in config
legacy-id: REQ-20260528-012
date: 2026-05-28
source: docs/requirement-log/done/requirements-20260528-thinking-depth-config.md
priority: Medium



## SWR-864 — Add unit tests for the thinking capability catalog: verify lookups for known models, fallback for unknown models, and correct effort-level validation
trace: optional
legacy-id: REQ-20260528-013
date: 2026-05-28
source: docs/requirement-log/done/requirements-20260528-thinking-depth-config.md
priority: Medium



## History

Source documents merged into this epic (sections preserved verbatim; requirement tables migrated to the files above).

### Rotaris - Runtime Provider Model Selection (2026-05-03)

Original: `docs/requirement-log/done/requirements-20260503-123000.md` — document status: Complete

#### Description

Rotaris currently derives the starting model from startup configuration resolved at launch. The TUI must continue to honor that startup default on launch, but once the user has authenticated with a provider that exposes a discovered runtime catalog, the user must be able to open a dedicated model-selection screen and choose any model that provider exposes at runtime, even if that model is absent from the quickstart config. The selected model is a live session override only: it must affect the current in-memory TUI session, must not be persisted across restart or session restore, and restart must return to the configured starting model.

**Current behaviour:**

- The startup model is derived from startup configuration resolved at launch, including the configured model slot and any registered provider state or advanced model configuration available at that time.

- Personas reference model registry IDs declared in configuration.

- The TUI baseline mentions model switching only when permitted by configuration.

- There is no requirement defining a runtime provider-discovered model selector for authenticated providers beyond the original built-in-only scope.

**What needs to change:**

1. Keep startup configuration as the source of the initial starting model loaded on app launch or restart.

2. Allow authenticated providers with discovered runtime catalogs to fetch and present the provider's full runtime model catalog inside the TUI.

3. Allow the user to choose any runtime-discovered provider model, even when that model is not declared in `agents.yaml`.

4. Make `Ctrl+M` always open the model-selection screen.

5. Keep model selection discoverable from the existing TUI command surface.

6. Scope the chosen model to the current in-memory session only.

7. Ensure restart or restored sessions reload the config-defined starting model first and do not reuse the previous runtime override.

#### Implementation Notes

**Requirements Document:**

**Note (2026-05-21):** Runtime selection scope now includes any authenticated provider with a discovered runtime catalog, including snapshot-backed custom provider instances. This document remains canonically responsible for `Ctrl+M`, command-palette discoverability, session-only scoping, and restart behavior. The underlying data layer comes from the `ProjectModelStore` defined in [`requirements-20260511-model-provider-registry.md`](requirements-20260511-model-provider-registry.md). Persistent startup-default editing is owned separately by [`requirements-20260511-startup-model-defaults.md`](requirements-20260511-startup-model-defaults.md).

**Dependencies:**

- Depends on: `requirements-20260418-143500.md` (authenticated Copilot/Codex provider support), `requirements-20260413-000002-personas-and-config.md` (startup model references in `agents.yaml`), `requirements-20260413-000004-tui-core.md` (baseline TUI model-selection entry points), `requirements-20260511-model-provider-registry.md` (project-scoped provider/model data layer)

- Blocks: runtime TUI model-selector implementation, persistence-boundary tests for restart/session-restore behavior, command-palette discoverability coverage

**Resolved Conflicts:**

Prior Requirement | Conflict | Resolution `requirements-20260413-000002-personas-and-config.md` `FR-5-004` | Persona configuration treats registry IDs declared in configuration as the default startup model reference, which by itself does not cover runtime selection of provider-exposed models absent from `agents.yaml`. | Keep configuration as the startup default source, but allow authenticated providers with runtime catalogs to apply a temporary runtime override from the provider's live catalog. `requirements-20260413-000004-tui-core.md` `FR-6-007`, `FR-6-008` | Baseline TUI requirements establish the model-selection shortcut and command-palette entry, but do not define the provider-driven runtime catalog behavior for authenticated sessions. | Keep the existing TUI entry points, and refine them here with explicit runtime model-selection behavior for authenticated providers with discovered catalogs.

**Notes:**

- This requirement creates a runtime-selection exception to configuration-only model selection for any authenticated provider with a discovered runtime catalog, including snapshot-backed custom provider instances.

- The configured startup model selection remains the source of truth for the initial model on launch and restart, even though the quickstart path no longer requires a default `models.yml`.

- Session-only here means live in-memory TUI state only; it excludes persistence through restart, saved-session restore, or config writes.

#### Acceptance Criteria

**Acceptance Criteria:**

- [x] On fresh launch, the TUI initializes the starting model from configuration before any runtime override is applied.

- [x] Pressing `Ctrl+M` opens the model-selection screen.

- [x] The command palette includes an entry that opens the same model-selection screen.

- [x] After authenticating with GitHub Copilot, the selector lists every Copilot runtime model returned by the provider, including at least one model absent from `agents.yaml` when such a model exists.

- [x] After authenticating with OpenAI Codex, the selector lists every Codex runtime model returned by the provider, including at least one model absent from `agents.yaml` when such a model exists.

- [x] After authenticating with a snapshot-backed custom provider instance, the selector lists every runtime model returned by that provider, including models absent from `agents.yaml`.

- [x] Choosing a runtime-listed provider model changes the active starting model for the current live TUI session.

- [x] Choosing a runtime-listed model that is absent from `agents.yaml` succeeds without editing configuration files.

- [x] Restarting the app restores the configured starting model from `agents.yaml` rather than the previously runtime-selected model.

- [x] Restoring or continuing a saved session from disk after restart does not automatically reinstate the previous runtime-selected model.

- [x] If the relevant provider is not authenticated or its model list cannot be loaded, the selector reports that state without changing the active starting model.

- [x] A provider-specific selector view does not mix multiple provider catalogs into one unlabeled list.

### Rotaris - Model Provider Registry, Credential Store, Model Discovery and Model-Reference Validation (2026-05-11)

Original: `docs/requirement-log/partial/requirements-20260511-model-provider-registry.md` — document status: Partial - minimal catalog plus multi-instance `openai-compatible` setup implemented for onboarding and snapshot-backed runtime resolution; broader registry lifecycle requirements remain deferred.

#### Description

Rotaris requires a **ModelProviderRegistry** module as the single source of truth for provider registration, authentication profiles, model discovery, stable model identifiers, and persistence of a project-scoped model snapshot. This module must separate credentials from project files completely: secrets live only in a user-specific secret store. Project settings contain only provider metadata, model status, capabilities, and timestamps - never tokens or API keys. The module must provide stable `provider_id/model_id` references that `agent.yaml` can use safely, along with a resolver that validates those references when configuration is loaded.

**Current behaviour:**

- `models.yml` serves as the configured source for LLM providers and models (FR-5-002).

- Inline API keys are allowed in `models.yml` (FR-5-007).

- `agent.yaml` references model registry IDs from the `models.yml` schema.

- Provider authentication relies on a flat secret-storage mechanism without explicit profiles or isolation between projects.

- Model availability is tied to configuration, not dynamically discovered from authenticated providers at the data-layer level.

**What needs to change:**

1. Replace the flat `models.yml`-centric provider registration with a structured registry supporting multiple auth methods per provider.

2. Introduce explicit credential separation: secrets in a user-local secret store, never in project files.

3. Stabilise model identification using `provider_id/model_id` identifiers so that persona configurations reference immutable model IDs.

4. Enable dynamic model discovery triggered by authentication events, project opens, and manual refresh.

5. Persist a reproducible snapshot of available models and their capabilities in project settings without any secrets.

6. Validate that every `model:` reference in `agent.yaml` resolves to a known, non-deprecated entry in the project-settings snapshot.

#### Implementation Notes

**Requirements - Model Provider Registry & Credential Separation:**

**Note (2026-05-26):** Additive business-priority provider requirements for Concrete Cloud user-facing positioning are defined in `requirements-20260526-154500.md`. That document does not replace this registry contract; it adds a provider-specific inclusion and presentation rule on top of it. **Note (2026-05-11):** The public CLI surface for manual model refresh is defined in `requirements-20260511-model-refresh-cli.md`. This document remains the canonical contract for the discovery pipeline, provider snapshot semantics, and persistence rules invoked by that command. The repo now also supports repeated `openai-compatible` logins keyed by user-defined labels, with endpoint/API-key capture during login and snapshot-backed model assignment into startup slots or persona overrides. **Note (2026-06-05):** Post-onboarding editing of provider credentials and mutable provider settings in the CLI and TUI is defined in `requirements-20260605-provider-settings-editing.md`. This registry document remains the canonical owner of credential-separation, provider metadata, and discovery semantics used by that editing flow. > **Priority Notes:** > > - Supersedes overlapping portions of: > - `requirements-20260413-000002-personas-and-config.md` - FR-5-002 (models.yml as required startup registry), FR-5-007 (secrets allowed in models.yml) > - `requirements-20260418-143500.md` - functional auth-architecture (provider registration, credential isolation, model-discovery triggers), NOT terminal-UI presentation specifics > - `requirements-20260503-123000.md` - assumes `models.yml` as runtime source; keeps runtime override scope intact but changes data layer underneath > - `requirements-20260511-000003.md` - overlapping data-layer assumptions around post-login model availability and project-side model persistence > - This document is the canonical requirement for the provider/model data layer: provider registration, auth-profile references, model discovery, project model snapshots, stable model IDs, and `agent.yaml` model-reference validation. > - Does NOT supersede `requirements-20260418-143500.md` terminal-UI auth-flow requirements (Transcript Panel, Ctrl+M, prompt-input entry, click-to-open-browser, text-selection). These UX flows remain canonically defined there. > - Does NOT supersede `requirements-20260503-123000.md` runtime model-selection requirements (Ctrl+M screen, command palette, session-only scoping). Runtime selection uses this registry as its data substrate.

**R1 - Provider Registration:**

The system MUST maintain an internal registry of known providers. Each provider entry MUST include at minimum: `provider_id` | string | Unique opaque identifier (lowercase snake_case). Immutable after initial registration. `display_name` | string | Human-readable name for UI presentation. `auth_methods` | list of enum | Set of authentication mechanisms this provider supports. Values: `device_code`, `browser_oauth`, `api_key`, `env_var`, `none`. `model_discovery` | object | Describes how models are discovered: `{type: dynamic}` for API discovery, `{type: configured}` for static declaration, `{type: mixed}` for both. `enabled` | boolean | Whether the provider is active. Disabling does not remove the entry. Custom providers MAY additionally declare: `base_url` | string | OpenAI-compatible API endpoint base URL. `models` | map | Static model declarations when `model_discovery.type` is `configured` or `mixed`. `headers` | map | Extra HTTP headers for authenticated requests. `options` | object | Provider-specific tuning (temperature scaling, reasoning effort, etc.). Example - GitHub Copilot:

```yaml
provider_id: github-copilot
display_name: GitHub Copilot
auth_methods: [device_code]
model_discovery: { type: dynamic }
enabled: true
```

Example - OpenAI / Codex:

```yaml
provider_id: openai
display_name: OpenAI / Codex
auth_methods: [browser_oauth, api_key]
model_discovery: { type: dynamic }
enabled: true
```

Example - Custom provider:

```yaml
provider_id: myprovider
display_name: My Provider
auth_methods: [api_key]
base_url: https://api.myprovider.com/v1
model_discovery: { type: configured }
models:
my-gpt-clone:
id: my-gpt-clone
display_name: My GPT Clone
capabilities:
tool_calling: true
vision: false
enabled: true
```

**R2 - Credential Authentication and Storage:**

The system MUST decouple authentication credentials from all project files. Required constraints: Rule | Constraint CR-001 | API keys, OAuth tokens, and refresh tokens MUST NEVER be written to project files, session snapshots, or logs. CR-002 | Credentials MUST be stored in a user-local secret store keyed by `auth_profile_id`. CR-003 | Project settings MAY reference credentials only through `auth_profile_id` pointers. CR-004 | The system MUST use official provider authentication flows for all built-in providers. Users MUST NOT be required to manually paste or generate API tokens for those built-in providers. CR-005 | `api_key` authentication MAY be supported for custom providers and OpenAI-compatible endpoints where an official browser or device flow is not available. CR-006 | Token refresh for OAuth and device-code sessions MUST remain internal to the authentication subsystem. CR-007 | Explicit re-authentication MUST discard any stored credential for that provider before starting a new auth flow. If a provider rejects stored credentials during authenticated model discovery with `401` or `403`, the credential MUST be invalidated so the next login starts clean. Token refresh MUST happen transparently: external components receive a validated credential handle without knowing expiration timelines. Recommended `auth_profile_id` convention:

```
auth_profile_id: <provider_id>:<profile_label>
```

Examples: `openai:default`, `github-copilot:personal`, `myprovider:production`.

**R3 - Stable Model Identifiers:**

#### Acceptance Criteria

**Acceptance Criteria:**

- [ ] A user can register GitHub Copilot via Device Code login through the onboarding flow, and OpenAI/Codex via Browser OAuth.

- [ ] Built-in provider registration does not require manual API-token entry, generation, or file editing by the user.

- [ ] After successful authentication, the system automatically discovers and stores available models for each authenticated provider.

- [ ] Every recorded model has a stable `provider_id/model_id` identifier resolvable in `available_models`.

- [ ] Project settings contain a complete model snapshot with status, capabilities, limits, pricing, and timestamps.

- [ ] Project settings reference credentials only through `auth_profile_id`; no credential value is persisted in any project-scoped file.

- [ ] NO API keys, tokens, or secrets appear in project settings, `agents.yaml`, session snapshots, or log files.

- [ ] A custom or OpenAI-compatible provider that supports API-key authentication can be configured without storing that API key in any project-scoped file.

- [ ] `agent.yaml` model references are validated at load time against the project model snapshot. Invalid IDs produce clear, actionable errors.

- [ ] If a referenced model is `deprecated` or `unavailable`, the system emits a warning and either resolves a valid fallback or fails with an informative error when no valid fallback exists.

- [ ] Deprecated/unavailable models are retained in the snapshot with their status changed, not deleted.

- [ ] Custom providers can be registered by supplying `provider_id`, `base_url`, auth method, static model list, and API-key credentials (stored separately).

- [ ] Re-running `rotaris-cli login` adds or replaces a provider auth profile without disturbing other providers.

- [ ] Model discovery failures do NOT crash the system; partial results are stored with error markers on affected providers.

- [ ] Project model-setting persistence uses atomic writes.

### Rotaris - CLI Command for Manual Model Refresh (2026-05-11)

Original: `docs/requirement-log/done/requirements-20260511-model-refresh-cli.md` — document status: Complete - `rotaris-cli models refresh` implemented for the built-in provider catalog (`copilot`, `codex`), reusing the shared discovery/snapshot pipeline with provider-scoped failures reported through CLI output and non-zero exit codes.

#### Description

Rotaris must expose a first-class CLI command that lets a user explicitly refresh the discovered model list after provider authentication has already completed. The command gives users a predictable way to pull newly available models, recover from stale project snapshots, and rerun discovery on demand without re-running the onboarding flow or manually editing configuration files.

**Problem being solved:**

After authenticating a provider, the project snapshot can become stale over time as providers add, remove, or rename models. The canonical registry requirement already allows a manual discovery trigger, but the public CLI surface for that trigger is not yet defined.

**Current behaviour:**

- `rotaris-cli login` is the canonical onboarding path for provider registration.

- The model-provider registry requirement defines manual refresh as a valid discovery trigger.

- No requirement currently defines a stable CLI command that users can invoke later to refresh model availability without re-running login.

**What needs to change:**

1. Define a stable public CLI command for manual model refresh.

2. Allow users to refresh all eligible providers or one named provider.

3. Reuse the canonical model-discovery pipeline and project-snapshot persistence rules already defined by the model-provider registry requirement.

4. Define clear progress reporting and exit-status behavior for success, partial failure, and total failure.

5. Keep authentication ownership unchanged: the command may trigger discovery only for authenticated providers and must not weaken the existing provider-authentication contract.

#### Implementation Notes

**Requirements Document:**

**Note (2026-05-13):** Refresh persistence now preserves previously discovered provider model entries that are absent from a later discovery response, preventing a partial Copilot catalog response from deleting still-configured model IDs and causing startup-time unknown-model validation failures. CLI output reports when previous models are preserved.

**Dependencies:**

- Depends on: `requirements-20260511-000003.md` (`rotaris-cli login` remains the provider-registration entry point)

- Depends on: `requirements-20260511-model-provider-registry.md` (canonical discovery pipeline, snapshot persistence, and provider eligibility rules)

- Depends on: `requirements-20260418-143500.md` (provider authentication contract remains unchanged)

- Blocks: CLI implementation for manual model refresh and any user-facing help or documentation that advertises a post-login model refresh command

**Resolved Conflicts:**

Prior Requirement | Conflict | Resolution `requirements-20260511-000003.md` | Owns `rotaris-cli login` onboarding, but does not define a post-onboarding manual refresh command. | This document extends the CLI surface after onboarding while leaving `rotaris-cli login` as the canonical provider-registration flow. `requirements-20260511-model-provider-registry.md` | Allows manual refresh as a discovery trigger, but does not define the stable public CLI entry point. | This document defines the user-facing CLI contract, while the registry document remains the canonical owner of discovery and persistence semantics.

**Notes:**

- The public command name `rotaris-cli models refresh` is normative in this requirement.

- This command is intentionally separate from `rotaris-cli login`: login registers or reauthenticates providers, while `models refresh` re-runs discovery against already eligible providers.

- This requirement does not authorize storing credentials in project files or bypassing any provider-authentication rule already defined elsewhere.

- Implementation note: the current command scope follows the built-in provider catalog (`copilot`, `codex`). As additional provider types become registrable through the shared catalog, the command will pick them up through the same helper path.

#### Acceptance Criteria

**Acceptance Criteria:**

- [x] Running `rotaris-cli models refresh` executes model discovery for all eligible providers and persists the updated project model snapshot.

- [x] Running `rotaris-cli models refresh --provider copilot` refreshes only the `copilot` provider and leaves all other provider snapshot entries unchanged except for any global snapshot timestamp required by the registry format.

- [x] If at least one targeted provider refreshes successfully and another targeted provider fails discovery, the command reports both outcomes and exits non-zero.

- [x] If no targeted provider is eligible because none are authenticated, none are enabled, or the named provider does not qualify for refresh, the command reports the reason clearly and exits non-zero.

- [x] The command does not force the user through `rotaris-cli login` again when credentials are missing or invalid; it reports the issue and preserves the existing login/onboarding contract.

- [x] The command reuses the canonical provider/model registry persistence rules so newly missing models become `unavailable` or `deprecated` instead of being deleted.

### Rotaris - Persistent Startup Model Defaults and Persona Override UX (2026-05-11)

Original: `docs/requirement-log/partial/requirements-20260511-startup-model-defaults.md` — document status: Partial - persistent startup-model editing backend and TUI settings screen implemented; onboarding model review now uses the full known provider catalog across previously registered providers; first-run review flow for built-in providers still pending.

#### Description

Rotaris should expose model choice through a usability-first startup-defaults flow instead of forcing every user to hand-edit per-persona model IDs. The primary saved abstraction is a set of startup slots such as `small_model`, `medium_model`, `large_model`, `default_summary_model`, and `fallback_model`. Built-in personas may inherit those slots by default, while returning users and power users must be able to override individual personas when needed. This startup-defaults flow is distinct from temporary runtime model switching. Persistent startup edits are written to `agents.yaml` and survive restart; temporary runtime overrides remain owned by the runtime model-selection requirements.

**Current behaviour:**

- The config schema already contains startup tier slots and persona-level `model` fields.

- Onboarding already discovers provider models and populates startup slots for the quickstart path.

- Runtime model switching has separate requirements and is intended to remain session-only.

- Before this change, there was no dedicated persistent startup-model editing surface for returning users.

**What needs to change:**

1. Make startup slots the main saved model-selection surface for ordinary use.

2. Allow startup slot edits to persist in `agents.yaml` without requiring direct YAML authoring.

3. Allow persona-level overrides while preserving inheritance from startup slots by default.

4. Keep persistent startup-default editing separate from temporary runtime overrides.

5. Explain the flow clearly in repository-facing documentation for first-time and returning users.

#### Implementation Notes

**Requirements Document:**

**Dependencies:**

- Depends on: `requirements-20260413-000002-personas-and-config.md` (persona model references and layered config)

- Depends on: `requirements-20260511-000003.md` (first-run onboarding and provider registration)

- Depends on: `requirements-20260503-123000.md` (temporary runtime model-selection scope)

- Blocks: onboarding review step for discovered slot assignments, final user-facing wording alignment across TUI surfaces

**Notes:**

- This document owns persistent startup-default editing and persona override usability.

- It does not own temporary runtime provider-catalog selection; that remains with `requirements-20260503-123000.md`.

- `models.yml` remains an advanced path, not the primary onboarding contract.

#### Acceptance Criteria

**Acceptance Criteria:**

- [x] A workspace can persist startup defaults in `.rotaris/agents.yaml` using the top-level startup model fields.

- [x] `medium_model` resolves the same way as `small_model` and `large_model` in persona and subsystem model references.

- [x] The TUI command palette exposes a `Startup Models` action for persistent defaults.

- [x] The startup-model settings flow can save both slot defaults and persona-specific model overrides.

- [x] Removing a persona override returns that persona to inherited startup-default behaviour.

- [x] The README explains how a new user gets started without authoring `models.yml` by hand.

- [ ] The first-run onboarding flow offers an in-band review step for discovered startup slot assignments.

- [x] Temporary runtime model switching is fully separated and clearly labeled relative to persistent startup defaults across all TUI entry points.

### Rotaris - Unknown-Model Cost Estimation Fallback (2026-05-26)

Original: `docs/requirement-log/unresolved/requirements-20260526-unknown-model-cost-estimation.md` — document status: Not Started

#### Description

Provide a first-class fallback for usage-cost accounting when LiteLLM does not know a model's pricing metadata, so custom or openai-compatible models can still surface estimated costs without noisy runtime warnings.

**Problem being solved:**

Rotaris already falls back to alternate token-estimation paths for context compression decisions when model-specific tokenizer metadata is missing or server-reported usage is unavailable. That logic prevents compression from breaking on unknown or custom models. However, runtime telemetry still emits warnings like: `Cost calculation failed: This model isn't mapped yet. model=Qwen/Qwen3.6-35B-A3B, custom_llm_provider=openai.` This warning comes from LiteLLM's pricing lookup, which is separate from Rotaris's token-count estimation path. The current fallback logic does not address cost estimation or warning suppression for unmapped models.

**Current behaviour:**

- Compression threshold evaluation uses server-reported prompt-token metrics first.

- If current prompt-token metrics are unavailable, compression falls back to tokenizer-based counting.

- If tokenizer-based counting also fails or returns zero, compression falls back to a character-based estimate via `chars_per_token`.

- LiteLLM telemetry still attempts provider/model pricing lookup independently.

- When the model is not present in LiteLLM's pricing registry, OpenHands telemetry surfaces a warning instead of a cost value.

**What needs to change:**

1. Distinguish clearly between token estimation for compression and price estimation for telemetry.

2. Add a configurable cost fallback for unknown models.

3. Preserve visibility into approximate vs exact cost values.

4. Prevent repetitive warning spam for known unsupported pricing cases.

#### Implementation Notes

**Requirements Document:**

**Dependencies:**

- Depends on current token-usage extraction in `src/rotaris_core/tokens.py`

- Depends on model configuration schema in `src/rotaris_core/config/schema.py`

- Depends on LiteLLM/OpenHands telemetry integration points where cost is currently computed and warnings are surfaced

**Notes:**

Key clarification: The existing estimator fallback already covers **token counting for context compression**. It does **not** cover **pricing/cost estimation**. These are separate concerns and should remain separate in implementation. Assumptions made:

1. Cost fallback should use user-configured pricing metadata or a repo-managed fallback table, rather than inventing prices heuristically from token counts alone.

2. Unknown-pricing warnings should remain visible at least once per session/model so the state is diagnosable.

3. Session persistence may eventually want to store both token usage and estimated monetary cost, but this requirement is limited to runtime fallback and display correctness.

Out of scope:

- Automatic fetching of provider pricing tables from the network.

- Guaranteeing exact cost parity with external providers for custom endpoints.

- Changing LiteLLM upstream pricing registries directly from Rotaris.

#### Acceptance Criteria

**Acceptance Criteria:**

- [ ] Running Rotaris with a custom openai-compatible model that is absent from LiteLLM's pricing registry does not emit repeated cost warnings on every call for the same model during one session.

- [ ] If the user configures prompt/completion pricing for that model, usage telemetry computes an estimated cost using those configured prices.

- [ ] If no configured pricing exists, the UI and session state show cost as unavailable or unknown rather than silently treating it as zero.

- [ ] Compression behaviour remains unchanged: context compression still relies on token metrics / tokenizer estimate / char estimate only.

- [ ] Any displayed fallback cost is marked clearly as approximate or configured.

- [ ] Existing mapped models continue using the normal LiteLLM pricing path without regression.

### Rotaris - Default Context-Length Storage for Individual Models (2026-05-28)

Original: `docs/requirement-log/partial/requirements-20260528-model-context-length-registry.md` — document status: Partial - per-model registry implemented in `providers/limits.py`, including exact-match, version-normalized, provider-alias, and wildcard-prefix lookup; config-backed models now inherit defaults during `load_config()`. The registry is consumed by the progressive-truncation pipeline in `model_input.progressive_truncate_results()` which age-weights tool-result truncation against the model's context window. Remaining gap: the requirement text mentions Gemini-family entries, but Gemini is not yet a built-in discovery provider in this repo and relies on provider-native API metadata when integrated.

#### Description

Every model consumed by Rotaris has a context window - the maximum number of tokens it can process across input and output combined. Today, `max_input_tokens` and `max_output_tokens` are optional fields in `ModelConfig` that are only populated when a provider's `/models` endpoint explicitly returns them (e.g. Google Gemini's `inputTokenLimit` / `outputTokenLimit`) or when a hardcoded fallback exists (currently only DeepSeek). For all other providers - OpenAI, Anthropic, GitHub Copilot, OpenAI Codex, and arbitrary OpenAI-compatible endpoints - context-length metadata is absent, leaving the system with no programmatic awareness of model capacity. This creates downstream gaps: context compression can't set an intelligent threshold, the TUI can't display capacity information, and rate-limit handling can't distinguish between models that genuinely share a tier. We need a systematic **known-model context-length registry** - a single source of truth that maps every model the system knows about to its default input and output token limits, with clear precedence: API-returned limits win over known defaults, and user configuration overrides both.

**Problem being solved:**

Rotaris has no systematic way to know the context window of most models. Currently:

- `ModelConfig.max_input_tokens` / `max_output_tokens` are `Optional[int]` and

default to `None`.

- `providers/limits.py` has `_KNOWN_PROVIDER_LIMITS` with a single entry

(`deepseek/` → 1M input, 384K output), keyed by provider prefix only - no per-model granularity.

- `providers/discovery.py` calls `apply_known_token_limits()` during discovery,

but for most providers it's a no-op because no entries exist.

- The `context_compression_threshold` field in `ModelConfig` relies on

`max_input_tokens` being populated - when it's `None`, compression decisions operate with no awareness of model capacity.

- The TUI has no way to display context-window information to users choosing

between models.

**Current behaviour:**

- For Google Gemini: limits are extracted from the API response (provider-native).

- For DeepSeek: limits are injected from `_KNOWN_PROVIDER_LIMITS` because the

API returns no `capabilities` / `limits` fields.

- For OpenAI, Anthropic, Copilot, Codex, and OpenAI-compatible providers: no

limits are set unless the provider happens to include them in the `/models` response (most don't).

- `max_input_tokens` / `max_output_tokens` flow from discovery → project snapshot

→ `ModelConfig` in `agents.yaml`. But when absent, the fields sit at `None`.

**What needs to change:**

1. Replace the provider-prefix-only `_KNOWN_PROVIDER_LIMITS` dict with a

**per-model context-length registry** keyed by qualified model ID (e.g. `"openai/gpt-4o"`, `"anthropic/claude-sonnet-4-20250514"`).

2. Populate the registry with known context lengths for all models from supported

providers: OpenAI, Anthropic, GitHub Copilot, OpenAI Codex, DeepSeek, Google Gemini, and common open-source models served via Ollama / vLLM.

3. Extend the precedence chain so that: API-returned limits > known-model registry >

user `agents.yaml` override > `None`.

#### Implementation Notes

**Requirements Document:**

**Dependencies:**

- Depends on: `requirements-20260511-model-provider-registry.md` (provider discovery pipeline)

- Depends on: `requirements-20260528-deepseek-provider.md` REQ-20260528-003 (DeepSeek token limits - this requirement generalizes that approach)

- Related to: `requirements-20260515-000001-rate-limits.md` (context-window awareness supports rate-limit handling)

- Related to: `requirements-20260526-unknown-model-cost-estimation.md` (both deal with unknown-model metadata gaps)

**Resolved Conflicts:**

Prior Requirement | Conflict | Resolution REQ-20260528-003 (DeepSeek token limits) | DeepSeek limits are currently hardcoded in `_KNOWN_PROVIDER_LIMITS` at provider-prefix level | The DeepSeek entries move into the new per-model registry. The existing `_KNOWN_PROVIDER_LIMITS` dict is subsumed. REQ-20260528-003 is still satisfied - the new registry is just a more granular data structure.

**Notes:**

**Research findings (self-resolved):**

A web search confirmed that **Google Gemini is the only major LLM provider whose API returns context-length metadata programmatically** (`models.get` returns `inputTokenLimit` / `outputTokenLimit`). Neither OpenAI's `/v1/models` nor Anthropic's model-listing endpoint expose context windows. Claude Code (Anthropic's own agentic CLI) uses a hardcoded `MODEL_CONTEXT_WINDOW_DEFAULT = 200_000` and a `getContextWindowForModel()` lookup function - confirming that even first-party tooling relies on a known-model registry. The hybrid approach chosen here (API → registry → user override → None) mirrors industry practice and avoids the fragility of relying on API responses that don't carry this data.

**Assumptions:**

- **Registry location**: The registry will live in `providers/limits.py` (extending

the existing `_KNOWN_PROVIDER_LIMITS` structure) rather than in a separate data file. This keeps the single source of truth in code, where it's version-controlled and can't drift independently of the logic that consumes it.

- **No remote registry**: We are not building a network-fetched registry. Context

lengths change infrequently and a code-based registry is simpler, more reliable, and works offline. When a new model is released, adding it is a one-line PR.

- **Output token limits**: For models where the provider does not document a

distinct output token limit, the registry entry uses the context window as the input limit and `None` for output (or a documented max output if known). This is consistent with how `extract_token_limits` already handles missing keys.

- **Per-model vs per-provider granularity**: REQ-20260528-016 explicitly requires

provider-prefix wildcards for catch-all defaults. The registry supports both exact model matches and prefix matches, with exact matches taking priority. This is important for self-hosted endpoints (Ollama, vLLM) where individual model IDs are user-defined but all models share the same server-configured context window.

**Out of scope:**

- Dynamic context-length detection at runtime (e.g., parsing error messages from

the API when a request exceeds the window). This is a potential future enhancement but adds latency and complexity.

- Displaying context-window information in the TUI model picker. That is a

separate UX requirement.

- Auto-populating `context_compression_threshold` from the context length. The

two fields serve different purposes and the threshold should remain a user-controlled policy decision.

#### Acceptance Criteria

**Acceptance Criteria:**

- [ ] After `rotaris-cli models refresh`, a known model like `copilot/gpt-4o` has

`max_input_tokens` and `max_output_tokens` populated with correct values (128,000 input, 16,384 output for gpt-4o) even though the Copilot `/models` endpoint returns no explicit limits.

- [ ] After `rotaris-cli models refresh`, a known model like `openai/gpt-5` has

limits populated based on the registry (since OpenAI's `/models` endpoint does not return context window info).

- [ ] A user-specified `max_input_tokens: 64000` in `agents.yaml` for a specific

model takes precedence over both the registry value and any API-returned value.

- [ ] A model that is completely unknown (not in the registry, API returns no limits)

has `max_input_tokens: null` in its resolved config - no zero, no guess.

- [ ] Adding a new model to the registry requires only adding one entry to the

registry data structure (two integers and a qualified ID string).

- [ ] Provider-prefix wildcard matching works: configuring a catch-all entry for

`"ollama/"` populates token limits for any `ollama/*` model not individually listed.

- [ ] `context_compression_threshold` continues to work as before when limits are

resolved from the registry - no regression in compression behavior.

- [ ] The registry includes entries for at minimum: all GPT-4/4o/5 family models,

all Claude 3/3.5/4 family models, Gemini 1.5/2.x/3.x models, DeepSeek V3/V4 models, and Copilot-proxied models (gpt-4o, gpt-4o-mini, o3-mini, etc.).

### Rotaris - Per-Model Thinking Depth Configuration & Capability Catalog (2026-05-28)

Original: `docs/requirement-log/done/requirements-20260528-thinking-depth-config.md` — document status: Complete

#### Description

Introduce a local model thinking-capability catalog so Rotaris knows which models support thinking/reasoning mode and what effort levels each accepts. Surface thinking depth as a first-class per-model configuration that flows through to LiteLLM correctly for each provider (Anthropic extended thinking budget, OpenAI/DeepSeek reasoning_effort). Finally, make thinking depth controllable for the startup-model tier slots (small/medium/large, default_summary, fallback) so that users can tier thinking depth alongside model selection from the TUI startup-model editor.

**Problem being solved:**

Today the `thinking` field exists on `ModelConfig` and is wired into LLM construction via `_resolve_thinking_kwargs()`. However:

1. **No capability catalog** - there is no local data declaring which models support

thinking at all, or which `thinking` levels each model accepts. Users and the TUI have no way to know whether setting `thinking: high` on a model will actually do anything or produce a provider error.

2. **Startup-model blind spot** - the startup-model editor in the TUI (backed by

`startup_models.py`) only manages model _name_ assignment to tier slots. There is no way to also configure `thinking` for the small/medium/large/default_summary models from the startup flow, even though these models are used for critical infrastructure roles (compressor, circuit breaker, researcher, summary agent).

3. **Provider mismatch risk** - the current `_resolve_thinking_kwargs()` branches on

`provider` alone (anthropic / deepseek / fallback-to-openai). It doesn't validate that the _specific model_ supports thinking. For instance, setting `thinking: high` on a DeepSeek model used in non-thinking mode (`deepseek-chat` legacy alias, or a user-configured model that maps to non-thinking) would send `extra_body` that the API silently ignores or rejects.

4. **DeepSeek effort clamping** - DeepSeek maps `low`/`medium` → `high` and

`xhigh` → `max` on the API side, but the existing code maps `max` → `"high"` (line 178 of loader.py). This means Rotaris cannot actually request DeepSeek's `"max"` reasoning effort level. The mapping should be: `low` → `"low"`, `medium` → `"medium"`, `high` → `"high"`, `max` → `"max"` and let the API clamp `low`/`medium` if it chooses to.

**Current behaviour:**

- `ModelConfig.thinking` accepts `"auto"`, `"low"`, `"medium"`, `"high"`, `"max"` or

`None` (disabled).

- `ModelConfig.reasoning_effort` allows explicit override of the derived value.

- `_resolve_thinking_kwargs()` in `config/loader.py` maps thinking levels to:

- Anthropic: `extended_thinking_budget` with token counts

- DeepSeek: `reasoning_effort` with values low/medium/high (max clamped to high)

- Others: `reasoning_effort` with OpenAI values low/medium/high/xhigh

- DeepSeek gets `extra_body={"thinking": {"type": "enabled"}}` when thinking is set,

sent as `litellm_extra_body` (line 712-713 of loader.py).

- `startup_models.py` handles only model name overrides; thinking is not in its scope.

- There is no central registry of model → thinking capabilities.

**What needs to change:**

1. Create a local catalog (`src/rotaris_core/models/thinking_catalog.py`) declaring,

per model ID, whether thinking is supported and which effort levels are valid.

2. Extend `ModelConfig` with a derived/computed `effective_thinking` that validates

against the catalog and normalizes provider-specific values.

#### Implementation Notes

**Requirements Document:**

**Dependencies:**

- Depends on: `requirements-20260528-deepseek-provider.md` (REQ-20260528-005 already

defines thinking wiring for DeepSeek; this document refines and extends it)

- Depends on: `requirements-20260511-model-provider-registry.md` (model IDs must be

stable for the catalog to reference)

- Blocks: None

**Resolved Conflicts:**

Prior Requirement | Conflict | Resolution `requirements-20260528-deepseek-provider.md` REQ-20260528-005 | Original requirement maps `max` → `"high"` for DeepSeek. DeepSeek V4 API actually supports `"max"`. | This document's REQ-20260528-006 supersedes that mapping: `max` → `"max"`. `requirements-20260413-000002-personas-and-config.md` (no thinking field) | Original persona config had no `thinking` field. | Already resolved by existing `ModelConfig.thinking` in `schema.py`. This document does not change `PersonaConfig` - thinking stays a model-level concern.

**Notes:**

**Capability catalog design:**

The catalog lives at `src/rotaris_core/models/thinking_catalog.py` and follows this schema:

```python
@dataclass(frozen=True)
class ThinkingCapability:
supported: bool                    # False = model does not support thinking
effort_levels: tuple[str, ...]     # e.g. ("low", "medium", "high", "max")
requires_extra_body: bool          # True for DeepSeek (thinking type: enabled)
extra_body: dict[str, Any] | None  # e.g. {"thinking": {"type": "enabled"}}
THINKING_CATALOG: dict[str, ThinkingCapability] = {
"deepseek/deepseek-v4-pro": ThinkingCapability(
supported=True,
effort_levels=("low", "medium", "high", "max"),
requires_extra_body=True,
extra_body={"thinking": {"type": "enabled"}},
),
# ... more entries
}
```

The key is the LiteLLM model name (`provider/model_id`) for unambiguous lookup.

**DeepSeek effort mapping (corrected):**

Per the [DeepSeek Thinking Mode docs](https://api-docs.deepseek.com/guides/thinking_mode):

```
Rotaris thinking level → reasoning_effort sent to API:
auto   → "high"    (DeepSeek default)
low    → "low"     (API clamps to "high")
medium → "medium"  (API clamps to "high")
high   → "high"
max    → "max"
```

The API says `low` and `medium` are mapped to `high` for compatibility. We send the requested value and let the API clamp - this ensures forward compatibility if DeepSeek later supports finer-grained effort levels.

**Startup model thinking in agents.yaml:**

#### Acceptance Criteria

**Acceptance Criteria:**

- [ ] Setting `thinking: max` on a `deepseek-v4-pro` model sends

`reasoning_effort="max"` and `extra_body={"thinking": {"type": "enabled"}}` to the DeepSeek API (verified via unit test on `_resolve_thinking_kwargs`).

- [ ] Setting `thinking: high` on a `deepseek-v4-flash` model correctly sends

`reasoning_effort="high"` with the thinking extra_body.

- [ ] The capability catalog returns correct supported effort levels for at least

`deepseek-v4-pro`, `deepseek-v4-flash`, `claude-sonnet-4-20250514`, `gpt-5`, and `o3-mini`.

- [ ] A model not in the catalog produces a logged warning when `thinking` is set

but still sends the provider-default thinking kwargs.

- [ ] `read_startup_model_preferences()` returns thinking preferences alongside

model names for each tier slot.

- [ ] Writing `small_model: deepseek/deepseek-v4-flash` with `thinking: high` via

the startup-model API produces a valid `agents.yaml` that round-trips correctly.

- [ ] The TUI startup-model editor shows a dedicated thinking column next to the

model selector for each tier slot.

- [ ] Switching a tier slot from DeepSeek to a non-thinking model hides or

disables the thinking selector.

- [ ] Existing tests for model loading and LLM construction continue to pass.

- [ ] Existing capability tests for DeepSeek thinking mode continue to pass.

## SWR-2810 — Provider models reachable only through the provider's Responses endpoint must remain selectable and must be routed to that endpoint.
date: 2026-08-08
priority: High

A provider catalog can expose models that its chat-completions route refuses. GitHub
Copilot's `/models` marks these with a `supported_endpoints` list that omits
`/chat/completions` (for example `gpt-5.3-codex`, the `gpt-5.6-*` previews). Rotaris
must not treat "not callable on the chat route" as "not callable at all": such models
MUST stay in the discovered catalog and MUST be dispatched to the provider's Responses
endpoint instead, so a model slot filled with one of them completes normally rather
than failing the first request with `unsupported_api_for_model`.

Models the account genuinely cannot call remain unselectable: a `policy.state` of
`disabled` (the provider has not enabled the model for the account) and non-chat model
types such as embeddings. SWR-2812 governs how an unselectable model is presented.

### Acceptance criteria

- [ ] A discovered model whose endpoint list omits chat completions but includes
      responses is offered in model slots and records that routing decision in its
      catalog metadata.
- [ ] Selecting such a model produces a working run — the request reaches the
      provider's Responses endpoint, with tool calls and streaming intact.
- [ ] Models that list a chat-completions endpoint, or list none at all, keep their
      existing chat routing unchanged.
- [ ] Policy-disabled models are still unselectable, and non-chat models are still
      withheld.

Derived requirements: [SWR-2811 — Responses-route model metadata and LiteLLM registration](800-model-registry/SWR-2811-copilot-responses-route.md)

## SWR-2812 — A model the provider will not accept must stay visible, must not be selectable, and must state why.

date: 2026-08-08
priority: High

A provider catalog lists everything the account can *see*, which is more than it can
*call*. GitHub Copilot's `/models` is the working example: a model the account's policy
has switched off is listed there but rejected on every request. Rotaris used to drop
such models during discovery, so the model picker showed a shorter list than the
provider's own settings page with no indication that anything had been removed, and no
way for the user to learn that the fix is a toggle only they can reach.

Withholding is the wrong remedy for a condition the user can act on. Rotaris MUST keep
such a model in the catalog it presents, MUST prevent it from being chosen, and MUST
state the reason at the point of choice.

The reason must be specific to the condition — a model disabled by account policy and a
model with no route Rotaris can dispatch to are different problems with different
remedies, and must not collapse into one generic "unavailable".

Models that were never candidates for a run — embeddings and other non-chat model types
— stay withheld entirely. They are a different product, not a blocked chat model.

### Acceptance criteria

- [ ] A model the provider lists but will not accept appears in every model picker,
      rendered as unselectable, and cannot be chosen by pointer or keyboard.
- [ ] The reason is discoverable from the picker without running anything, and is
      conveyed by more than colour or an icon alone.
- [ ] The reason distinguishes a policy-disabled model from one with no dispatchable
      route.
- [ ] An unselectable model never reaches model construction: naming one in
      configuration fails with that reason rather than a provider error later.
- [ ] Non-chat model types remain absent from the catalog.

Derived requirements: [SWR-2813 — Model availability metadata from discovery to configuration](800-model-registry/SWR-2813-model-availability-metadata.md), [SWR-2814 — Model picker availability rendering](2000-rotaris-desktop/SWR-2814-model-picker-availability.md)
