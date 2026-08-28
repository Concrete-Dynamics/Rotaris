---
req-id:
  [
    SWR-700,
    SWR-701,
    SWR-702,
    SWR-703,
    SWR-704,
    SWR-705,
    SWR-706,
    SWR-707,
    SWR-708,
    SWR-709,
    SWR-710,
    SWR-711,
    SWR-712,
    SWR-713,
    SWR-714,
    SWR-715,
    SWR-716,
    SWR-717,
    SWR-718,
    SWR-719,
    SWR-720,
    SWR-721,
    SWR-722,
    SWR-723,
    SWR-724,
    SWR-725,
    SWR-726,
    SWR-727,
    SWR-728,
    SWR-729,
    SWR-730,
    SWR-731,
    SWR-732,
    SWR-733,
    SWR-734,
    SWR-735,
    SWR-736,
    SWR-737,
    SWR-738,
    SWR-739,
    SWR-740,
    SWR-741,
    SWR-742,
    SWR-743,
    SWR-744,
    SWR-745,
    SWR-746,
    SWR-747,
    SWR-748,
    SWR-749,
    SWR-750,
    SWR-751,
    SWR-752,
    SWR-753,
    SWR-754,
    SWR-755,
    SWR-756,
    SWR-757,
    SWR-758,
    SWR-759,
    SWR-760,
    SWR-761,
    SWR-762,
    SWR-763,
    SWR-764,
    SWR-765,
    SWR-766,
    SWR-767,
    SWR-768,
    SWR-769,
    SWR-770,
    SWR-771,
    SWR-772,
    SWR-773,
    SWR-774,
    SWR-775,
  ]
status: approved
trace: required
test: required
title: "Provider Integration & Authentication"
---

# 700-providers-auth spec

## SWR-700 — Provider Integration & Authentication

trace: optional
test: optional

Onboarding and authenticating AI providers: credential flows, provider settings editing, DeepSeek and OpenAI-compatible providers, cloud positioning.

Derived requirements: [SWR-776 — Provider subscription-usage reads for quota display](700-providers-auth/SWR-776-subscription-usage-reads.md), [SWR-781 — Standard Keycloak OIDC authorization-code authentication](700-providers-auth/SWR-781-standard-keycloak-oidc.md), [SWR-782 — Rotaris Cloud catalog pricing and model suggestions](700-providers-auth/SWR-782-cloud-model-catalog-pricing-and-suggestions.md), [SWR-3711 — Credential status is classified without an event loop](700-providers-auth/SWR-3711-credential-status-without-event-loop.md), [SWR-3712 — A run resolves its provider credentials up front and keeps them staged](700-providers-auth/SWR-3712-run-primes-provider-credentials.md)

Related requirements: [SWR-777 — Claude Code Subscription Provider](700-providers-auth/SWR-777-claude-code-subscription-provider.md), [SWR-778 — Claude Agent SDK native agent loop in the Ralph loop](700-providers-auth/SWR-778-claude-agent-sdk-native-loop.md), [SWR-779 — Rotaris tools as in-process MCP tools for the Claude Agent SDK](700-providers-auth/SWR-779-claude-sdk-tool-bridge.md)

## SWR-701 — Copilot Provider Support

legacy-id: REQ-20260418-122854-001
date: 2026-04-18
source: docs/requirement-log/partial/requirements-20260418-143500.md

The system must support GitHub Copilot as an AI provider.

## SWR-702 — Codex Provider Support

legacy-id: REQ-20260418-122854-002
date: 2026-04-18
source: docs/requirement-log/partial/requirements-20260418-143500.md

The system must support OpenAI Codex as an AI provider, implemented in the same manner as OpenCode handles this integration.

## SWR-703 — Auth Status Check

legacy-id: REQ-20260418-122854-003
date: 2026-04-18
source: docs/requirement-log/partial/requirements-20260418-143500.md

Before sending a request to a provider, the system must check whether the user is authenticated with that provider.

## SWR-704 — Automatic Auth Flow Initiation

legacy-id: REQ-20260418-122854-004
date: 2026-04-18
source: docs/requirement-log/partial/requirements-20260418-143500.md

If the user is not authenticated, the system must automatically initiate the corresponding authentication flow for that provider.

## SWR-705 — Browser-based OAuth Flow

legacy-id: REQ-20260418-122854-005
date: 2026-04-18
source: docs/requirement-log/partial/requirements-20260418-143500.md

The system must support a browser OAuth flow in which the user is redirected to the provider's website, authenticates there, and is redirected back into the application.

## SWR-706 — Device Flow (One-Time Code)

legacy-id: REQ-20260418-122854-006
date: 2026-04-18
source: docs/requirement-log/partial/requirements-20260418-143500.md

The system must support the OAuth Device Flow for providers that offer it, displaying a one-time code the user enters on the provider's website. The set of supported flows per provider is determined by what each provider exposes, following OpenCode's integration as the reference implementation.

## SWR-707 — Copilot Device Flow

legacy-id: REQ-20260418-122854-007
date: 2026-04-18
source: docs/requirement-log/partial/requirements-20260418-143500.md

GitHub Copilot must use the Device Flow (one-time code) as its authentication method.

## SWR-708 — Post-Auth Redirect

legacy-id: REQ-20260418-122854-008
date: 2026-04-18
source: docs/requirement-log/partial/requirements-20260418-143500.md

After successful authentication via the browser OAuth flow, the user must be redirected back into the application and marked as authenticated.

## SWR-709 — TUI-based Auth Flow

trace: optional
legacy-id: REQ-20260418-144012-001
date: 2026-04-18
source: docs/requirement-log/partial/requirements-20260418-143500.md

The entire authentication flow must be conducted within the terminal UI - no external dialogs or GUI windows are spawned by the application itself.

## SWR-710 — Auth Prompts in Transcript Panel

trace: optional
legacy-id: REQ-20260418-144012-002
date: 2026-04-18
source: docs/requirement-log/partial/requirements-20260418-143500.md

Authentication instructions, one-time codes, and status messages must be displayed in the transcript panel.

## SWR-711 — Auth Input via Prompt Input

trace: optional
legacy-id: REQ-20260418-144012-003
date: 2026-04-18
source: docs/requirement-log/partial/requirements-20260418-143500.md

Any user input required during the authentication flow (e.g. confirming a step, entering a code) must be accepted through the existing prompt input component.

## SWR-712 — Clickable Links in Transcript Panel

legacy-id: REQ-20260418-144012-004
date: 2026-04-18
source: docs/requirement-log/partial/requirements-20260418-143500.md

URLs rendered in the transcript panel must be clickable and open in the system's default browser.

## SWR-713 — Text Selection in Transcript Panel

legacy-id: REQ-20260418-144012-005
date: 2026-04-18
source: docs/requirement-log/partial/requirements-20260418-143500.md

The transcript panel must support mouse-based text selection so users can copy content such as one-time codes.

## SWR-714 — Explicit Logout Operation

legacy-id: REQ-20260424-190500-001
date: 2026-04-18
source: docs/requirement-log/partial/requirements-20260418-143500.md

The system must provide a first-class logout operation that deletes stored authentication tokens for an AI provider and returns that provider to the unauthenticated state.

## SWR-715 — Logout via Settings Menu

status: draft
legacy-id: REQ-20260424-190500-002
date: 2026-04-18
source: docs/requirement-log/partial/requirements-20260418-143500.md

The existing settings menu must include a logout action for authenticated providers so a user can sign out and trigger reauthentication later without leaving the TUI or deleting files manually.

## SWR-716 — Logout via CLI Flag

legacy-id: REQ-20260424-190500-003
date: 2026-04-18
source: docs/requirement-log/partial/requirements-20260418-143500.md

The CLI must support a logout argument or flag, such as `--logout`, that clears stored authentication tokens without requiring manual filesystem operations.

## SWR-717 — Provider-Scoped Logout

legacy-id: REQ-20260424-190500-004
date: 2026-04-18
source: docs/requirement-log/partial/requirements-20260418-143500.md

The logout flow must allow the user to target a specific provider (for example `codex` or `copilot`) so reauthentication can be forced for one provider without affecting others.

## SWR-718 — Reauthentication After Logout

legacy-id: REQ-20260424-190500-005
date: 2026-04-18
source: docs/requirement-log/partial/requirements-20260418-143500.md

After a successful logout, the next attempt to use the logged-out provider must trigger the normal authentication flow again.

## SWR-719 — Secure Token Storage

legacy-id: REQ-20260418-122854-010
date: 2026-04-18
source: docs/requirement-log/partial/requirements-20260418-143500.md

Tokens must not be stored in plaintext or in insecure locations (e.g. unencrypted files, unprotected local storage).

## SWR-720 — Provider Extensibility

legacy-id: REQ-20260418-122854-011
date: 2026-04-18
source: docs/requirement-log/partial/requirements-20260418-143500.md

The authentication flow architecture must allow additional providers to be added without structural changes to the core system.

## SWR-721 — Link Click Latency

trace: optional
test: optional
legacy-id: REQ-20260418-144012-006
date: 2026-04-18
source: docs/requirement-log/partial/requirements-20260418-143500.md

Clicking a link in the transcript panel must open the browser within 500 ms on the local machine.

## SWR-722 — Logout Feedback

legacy-id: REQ-20260424-190500-006
date: 2026-04-18
source: docs/requirement-log/partial/requirements-20260418-143500.md

Logout actions in both the TUI and CLI must report whether logout succeeded, whether no stored tokens existed, or whether logout failed.

## SWR-723 — No Manual API Token Management

trace: optional
legacy-id: REQ-20260418-122854-012
date: 2026-04-18
source: docs/requirement-log/partial/requirements-20260418-143500.md

Users must not be required to manually enter or manage API tokens for GitHub Copilot or OpenAI Codex. Authentication for those built-in providers must use official provider-supplied flows.

## SWR-724 — No Manual Token File Deletion

legacy-id: REQ-20260424-190500-007
date: 2026-04-18
source: docs/requirement-log/partial/requirements-20260418-143500.md

Users must not be required to delete token files from the filesystem in order to log out or force reauthentication.

## SWR-725 — On first use, Rotaris must ensure that the global settings directory exists at the operating system's standard per-user config location.

legacy-id: REQ-20260511-019
date: 2026-05-11
source: docs/requirement-log/done/requirements-20260511-000003.md
priority: High

## SWR-726 — The default quickstart bootstrap must create a minimal `agents.yaml` only; it must not create a default `models.yml` as part of the standard first-run path.

legacy-id: REQ-20260511-020
date: 2026-05-11
source: docs/requirement-log/done/requirements-20260511-000003.md
priority: High

## SWR-727 — The generated quickstart `agents.yaml` must contain only the essential startup-selection keys required for first use, including at minimum `default_persona`, `default_summary_model`, `small_model`, `medium_model`, and `fallback_model`.

legacy-id: REQ-20260511-021
date: 2026-05-11
source: docs/requirement-log/done/requirements-20260511-000003.md
priority: High

## SWR-728 — The quickstart path must rely on built-in persona defaults supplied by the product; the generated `agents.yaml` must not be required to materialize the full built-in persona catalog unless the user explicitly opts into custom agent configuration.

legacy-id: REQ-20260511-022
date: 2026-05-11
source: docs/requirement-log/done/requirements-20260511-000003.md
priority: High

## SWR-729 — The CLI must provide a first-class `rotaris-cli login` command as a guided onboarding entry point for provider registration.

legacy-id: REQ-20260511-023
date: 2026-05-11
source: docs/requirement-log/done/requirements-20260511-000003.md
priority: High

## SWR-730 — When `rotaris-cli login` is invoked without an explicit provider argument, the user must be prompted to choose which supported provider to register, including at minimum GitHub Copilot and OpenAI Codex when those providers are available in the product.

legacy-id: REQ-20260511-024
date: 2026-05-11
source: docs/requirement-log/done/requirements-20260511-000003.md
priority: High

## SWR-731 — Re-running `rotaris-cli login` must allow the user to register an additional provider later without disturbing providers that are already registered.

legacy-id: REQ-20260511-025
date: 2026-05-11
source: docs/requirement-log/done/requirements-20260511-000003.md
priority: High

## SWR-732 — Provider registration through the onboarding flow must continue to use official provider authentication flows; users must not be required to manually enter API tokens.

legacy-id: REQ-20260511-026
date: 2026-05-11
source: docs/requirement-log/done/requirements-20260511-000003.md
priority: High

## SWR-733 — After successful provider registration, the quickstart configuration must be sufficient for ordinary startup without requiring the user to author a model registry file by hand.

legacy-id: REQ-20260511-027
date: 2026-05-11
source: docs/requirement-log/done/requirements-20260511-000003.md
priority: High

## SWR-734 — The onboarding experience must offer an optional advanced configuration path for users who want to create or customize agent or model configuration beyond the minimal quickstart defaults.

legacy-id: REQ-20260511-028
date: 2026-05-11
source: docs/requirement-log/done/requirements-20260511-000003.md
priority: Medium

## SWR-735 — If the user chooses the advanced configuration path, Rotaris must open the relevant YAML configuration document in the operating system's default file editor.

legacy-id: REQ-20260511-029
date: 2026-05-11
source: docs/requirement-log/done/requirements-20260511-000003.md
priority: Medium

## SWR-736 — Opening the operating system's default editor for advanced configuration must be optional and must remain separate from the provider authentication transaction; the authentication flow itself remains governed by the official provider flow requirements.

legacy-id: REQ-20260511-030
date: 2026-05-11
source: docs/requirement-log/done/requirements-20260511-000003.md
priority: Medium

## SWR-737 — The onboarding and bootstrap flows must be non-destructive: if `agents.yaml` or any user-created advanced config file already exists, Rotaris must not overwrite it or silently refresh it.

legacy-id: REQ-20260511-031
date: 2026-05-11
source: docs/requirement-log/done/requirements-20260511-000003.md
priority: High

## SWR-738 — Rotaris must not require a default `models.yml` for the quickstart path; if advanced model configuration is needed, it must be created only on explicit user request through the advanced configuration path.

legacy-id: REQ-20260511-032
date: 2026-05-11
source: docs/requirement-log/done/requirements-20260511-000003.md
priority: High

## SWR-739 — If no provider is registered and no advanced model configuration exists, the onboarding experience must clearly guide the user toward either registering a supported provider or opening advanced configuration instead of failing silently.

legacy-id: REQ-20260511-033
date: 2026-05-11
source: docs/requirement-log/done/requirements-20260511-000003.md
priority: High

## SWR-740 — After successful provider authentication, the onboarding flow must discover the models available to that authenticated provider and complete the quickstart handoff needed to populate the minimal startup configuration for ordinary use without manual model-file authoring.

legacy-id: REQ-20260511-034
date: 2026-05-11
source: docs/requirement-log/done/requirements-20260511-000003.md
priority: High

## SWR-741 — If provider authentication succeeds but no usable models are discovered, onboarding must not report success prematurely; it must present clear recovery paths that include at minimum choosing another supported provider, opening advanced configuration, or exiting without altering existing user-authored configuration.

trace: optional
legacy-id: REQ-20260511-035
date: 2026-05-11
source: docs/requirement-log/done/requirements-20260511-000003.md
priority: High

## SWR-742 — If `rotaris-cli login` is invoked for a provider that is already authenticated and still valid, the command must detect that state and avoid forcing a redundant reauthentication flow unless the user explicitly requests reauthentication through a separate product-defined path.

legacy-id: REQ-20260511-036
date: 2026-05-11
source: docs/requirement-log/done/requirements-20260511-000003.md
priority: Medium

## SWR-743 — Completion of the optional advanced-configuration path must include a clear outcome signal: if the editor cannot be launched, exits unsuccessfully, or leaves the relevant configuration invalid for startup, Rotaris must report that result explicitly and must not silently treat onboarding as completed.

legacy-id: REQ-20260511-037
date: 2026-05-11
source: docs/requirement-log/done/requirements-20260511-000003.md
priority: High

## SWR-744 — The advanced-configuration path must preserve an escape hatch back to the ordinary quickstart path whenever advanced configuration is declined, fails to open, or does not yet produce a runnable startup configuration.

legacy-id: REQ-20260511-038
date: 2026-05-11
source: docs/requirement-log/done/requirements-20260511-000003.md
priority: Medium

## SWR-745 — The system shall support `concrete-cloud` as a first-class built-in AI provider, with authentication and model-access behaviour conforming to the externally documented provider instruction referenced by this request.

legacy-id: REQ-20260526-001
date: 2026-05-26
source: docs/requirement-log/done/requirements-20260526-154500.md
priority: High

## SWR-746 — Any user-facing built-in provider selection surface shall display Rotaris Cloud with the exact visible label `Rotaris Cloud (recommended)`.

legacy-id: REQ-20260526-002
date: 2026-05-26
source: docs/requirement-log/done/requirements-20260526-154500.md
priority: High

## SWR-747 — In any user-facing ordered list or picker of built-in providers, Rotaris Cloud shall appear first, ahead of GitHub Copilot, OpenAI Codex, and other built-in providers.

legacy-id: REQ-20260526-003
date: 2026-05-26
source: docs/requirement-log/done/requirements-20260526-154500.md
priority: High

## SWR-748 — When a user invokes provider login without explicitly naming a provider, the first selectable option shall be Rotaris Cloud with the label `Rotaris Cloud (recommended)`.

legacy-id: REQ-20260526-004
date: 2026-05-26
source: docs/requirement-log/done/requirements-20260526-154500.md
priority: High

## SWR-749 — The promoted display treatment for Rotaris Cloud shall affect presentation order and label text only; it shall not remove users' ability to authenticate with or select any other supported provider.

trace: optional
test: optional
legacy-id: REQ-20260526-005
date: 2026-05-26
source: docs/requirement-log/done/requirements-20260526-154500.md
priority: Medium

## SWR-750 — Register DeepSeek as a built-in provider with `id=\"deepseek\"`, `display_name=\"DeepSeek\"`, `auth_provider_id=\"deepseek\"`, `discovery_endpoint=\"https://api.deepseek.com/models\"`, `discovery_auth_header=\"Bearer\"`, and `default_base_url=\"https://api.deepseek.com/v1\"`

legacy-id: REQ-20260528-001
date: 2026-05-28
source: docs/requirement-log/done/requirements-20260528-deepseek-provider.md
priority: High

## SWR-751 — Adapt model discovery to parse DeepSeek's response format: `{object: \"list\", data: [{id, object, owned_by}]}` - extracting model IDs and owned_by into `DiscoveredModel` records

legacy-id: REQ-20260528-002
date: 2026-05-28
source: docs/requirement-log/done/requirements-20260528-deepseek-provider.md
priority: High

## SWR-752 — Populate token limits for DeepSeek models when the `/models` endpoint returns no explicit capabilities/limits: 1,048,576 input tokens (1M) and 384,000 output tokens, derived from DeepSeek's documented specifications

legacy-id: REQ-20260528-003
date: 2026-05-28
source: docs/requirement-log/done/requirements-20260528-deepseek-provider.md
priority: High

## SWR-753 — Add DeepSeek model-name patterns to `providers/picker.py`: `deepseek-v4-pro` → large tier, `deepseek-v4-flash` → medium and small tiers, with fallback patterns for future DeepSeek model names

legacy-id: REQ-20260528-004
date: 2026-05-28
source: docs/requirement-log/done/requirements-20260528-deepseek-provider.md
priority: High

## SWR-754 — Wire thinking-mode configuration for `provider == \"deepseek\"` in `_resolve_thinking_kwargs()`: map `thinking` levels to DeepSeek's `extra_body={\"thinking\": {\"type\": \"enabled\"}}` plus `reasoning_effort` values (\"low\"/\"medium\"/\"high\"/\"max\") - **Note:** effort mapping refined by `requirements-20260528-thinking-depth-config.md` REQ-20260528-006

legacy-id: REQ-20260528-005
date: 2026-05-28
source: docs/requirement-log/done/requirements-20260528-deepseek-provider.md
priority: High

## SWR-755 — Support API-key authentication for DeepSeek via `rotaris-cli login deepseek`, storing the key in the token storage and bridging to LiteLLM via `api_key` in the LLM constructor

legacy-id: REQ-20260528-006
date: 2026-05-28
source: docs/requirement-log/done/requirements-20260528-deepseek-provider.md
priority: High

## SWR-756 — Ensure streaming responses from DeepSeek include `stream_options: {include_usage: true}` so the condenser receives accurate token counts for context-window estimation

legacy-id: REQ-20260528-007
date: 2026-05-28
source: docs/requirement-log/done/requirements-20260528-deepseek-provider.md
priority: Medium

## SWR-757 — Verify that `reasoning_content` returned in thinking-mode responses is correctly passed back to the API in subsequent multi-turn requests (LiteLLM / SDK integration concern - may require no code changes if LiteLLM handles this transparently)

trace: optional
legacy-id: REQ-20260528-008
date: 2026-05-28
source: docs/requirement-log/done/requirements-20260528-deepseek-provider.md
priority: Medium

## SWR-758 — Handle legacy model aliases `deepseek-chat` and `deepseek-reasoner` gracefully: if returned by the `/models` endpoint, map them to their canonical V4 equivalents or surface them as deprecated entries

legacy-id: REQ-20260528-009
date: 2026-05-28
source: docs/requirement-log/done/requirements-20260528-deepseek-provider.md
priority: Low

## SWR-759 — Add DeepSeek to the TUI provider selector and startup-model editor so users can pick DeepSeek models for tier slots (small/medium/large) and persona overrides

trace: optional
legacy-id: REQ-20260528-010
date: 2026-05-28
source: docs/requirement-log/done/requirements-20260528-deepseek-provider.md
priority: Medium

## SWR-760 — The product MUST provide a first-class provider-management surface in the CLI for inspecting and modifying already-registered providers after onboarding is complete.

legacy-id: REQ-20260605-001
date: 2026-06-05
source: docs/requirement-log/done/requirements-20260605-provider-settings-editing.md
priority: High

## SWR-761 — The product MUST provide an equivalent provider-management surface in the TUI, reachable from a stable settings or command-palette entry, for inspecting and modifying already-registered providers after onboarding is complete.

legacy-id: REQ-20260605-002
date: 2026-06-05
source: docs/requirement-log/done/requirements-20260605-provider-settings-editing.md
priority: High

## SWR-762 — For providers authenticated via `api_key`, the CLI and TUI management surfaces MUST support replacing the stored API key after registration without requiring manual file editing or full provider deletion/recreation.

legacy-id: REQ-20260605-003
date: 2026-06-05
source: docs/requirement-log/done/requirements-20260605-provider-settings-editing.md
priority: High

## SWR-763 — For providers whose runtime configuration includes mutable non-secret connection settings, such as `base_url`, `api_base_url`, profile label, or equivalent provider metadata already captured during login, the CLI and TUI MUST allow those values to be reviewed and edited after registration.

legacy-id: REQ-20260605-004
date: 2026-06-05
source: docs/requirement-log/done/requirements-20260605-provider-settings-editing.md
priority: High

## SWR-764 — For providers authenticated via official OAuth or device-code flows, the CLI and TUI MUST NOT expose raw access-token or refresh-token editing. Instead, they MUST provide a reauthenticate/relogin action that replaces stored credentials through the official flow.

legacy-id: REQ-20260605-005
date: 2026-06-05
source: docs/requirement-log/done/requirements-20260605-provider-settings-editing.md
priority: High

## SWR-765 — Saving provider changes MUST preserve credential separation: secret values remain in the user-local secret store, project/workspace files retain only non-secret metadata or credential references, and no raw secret may be written to logs, session snapshots, or transcript events.

legacy-id: REQ-20260605-006
date: 2026-06-05
source: docs/requirement-log/done/requirements-20260605-provider-settings-editing.md
priority: High

## SWR-766 — After a provider setting or credential is changed, the system MUST offer or trigger provider validation and model refresh so the user can confirm whether the provider is now healthy without restarting the entire onboarding flow.

legacy-id: REQ-20260605-007
date: 2026-06-05
source: docs/requirement-log/done/requirements-20260605-provider-settings-editing.md
priority: High

## SWR-767 — Validation failures during provider editing MUST be surfaced clearly in both CLI and TUI, including which field or provider failed, while continuing to mask secret values in all user-visible and logged output.

legacy-id: REQ-20260605-008
date: 2026-06-05
source: docs/requirement-log/done/requirements-20260605-provider-settings-editing.md
priority: Medium

## SWR-768 — The provider-management surfaces MUST distinguish destructive actions (`remove provider`, `logout`, `clear credential`) from non-destructive edits (`replace API key`, `change base URL`, `reauthenticate`) so routine credential rotation does not require provider removal.

legacy-id: REQ-20260605-009
date: 2026-06-05
source: docs/requirement-log/done/requirements-20260605-provider-settings-editing.md
priority: Medium

## SWR-769 — Users can register any number of uniquely labelled OpenAI-compatible endpoints.

date: 2026-07-13
source: docs/requirement-log/done/requirements-20260713-multiple-openai-compatible-providers.md

## SWR-770 — Endpoint metadata and discovered models are stored user-wide; API keys remain only in token storage.

date: 2026-07-13
source: docs/requirement-log/done/requirements-20260713-multiple-openai-compatible-providers.md

Derived requirements: [SWR-1734 — Project-settings snapshot is a versioned, atomic, secret-free store](1700-config-mcp/SWR-1734-project-settings-snapshot-store.md), [SWR-1735 — Snapshot models reach the config without overruling what the user set](1700-config-mcp/SWR-1735-snapshot-to-config-bridge.md)

## SWR-771 — Registration validates the URL, credentials, and model catalog before persistence and rolls credentials back if snapshot persistence fails.

date: 2026-07-13
source: docs/requirement-log/done/requirements-20260713-multiple-openai-compatible-providers.md

## SWR-772 — Logout removes credentials only, retaining endpoint metadata for later re-authentication.

date: 2026-07-13
source: docs/requirement-log/done/requirements-20260713-multiple-openai-compatible-providers.md

## SWR-773 — Explicit deletion is limited to user-defined endpoints, removes credentials and discovered models, and leaves workspace model references unchanged.

date: 2026-07-13
source: docs/requirement-log/done/requirements-20260713-multiple-openai-compatible-providers.md

## SWR-774 — Rotaris exposes stable Check, Authenticate/Re-authenticate, Log out, and custom-only Delete controls and performs provider work outside the Qt thread.

date: 2026-07-13
source: docs/requirement-log/done/requirements-20260713-multiple-openai-compatible-providers.md

## SWR-775 — Both CLI surfaces expose `providers delete <provider-id>` with confirmation and `--yes`; headless non-interactive deletion requires `--yes`.

date: 2026-07-13
source: docs/requirement-log/done/requirements-20260713-multiple-openai-compatible-providers.md

## History

Source documents were merged into this epic on 2026-07-18; the originals live in
git history under `docs/requirement-log/`.
