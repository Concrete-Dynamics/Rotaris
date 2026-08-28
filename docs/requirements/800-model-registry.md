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

Source documents were merged into this epic on 2026-07-18; the originals live in
git history under `docs/requirement-log/`.

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
