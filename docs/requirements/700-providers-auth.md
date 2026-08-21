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

Derived requirements: [SWR-776 — Provider subscription-usage reads for quota display](700-providers-auth/SWR-776-subscription-usage-reads.md), [SWR-781 — Standard Keycloak OIDC authorization-code authentication](700-providers-auth/SWR-781-standard-keycloak-oidc.md), [SWR-3711 — Credential status is classified without an event loop](700-providers-auth/SWR-3711-credential-status-without-event-loop.md), [SWR-3712 — A run resolves its provider credentials up front and keeps them staged](700-providers-auth/SWR-3712-run-primes-provider-credentials.md)

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

Source documents merged into this epic (sections preserved verbatim; requirement tables migrated to the files above).

### AI Provider Integration - Authentication (2026-04-18)

Original: `docs/requirement-log/partial/requirements-20260418-143500.md` — document status: Partial - core provider auth, transcript/browser flows, and CLI/TUI logout are implemented; a first-class logout control inside the provider-settings UI remains open.

#### Description

Within the scope of this document, the system must support GitHub Copilot and OpenAI Codex as background AI providers. If a user is not yet authenticated with a given provider, the system automatically initiates the appropriate authentication flow entirely within the terminal UI - using the transcript panel and prompt input. Authentication flows are modeled after OpenCode's provider integration. No manual API token management is exposed to the user for those built-in providers. Users must also be able to explicitly log out and force reauthentication without manually deleting stored token files.

#### Implementation Notes

**Requirements Document:**

**Note (2026-05-11):** The provider-architecture concerns in this document (provider registration, credential separation, model discovery, and credential lifecycle) are superseded by [`requirements-20260511-model-provider-registry.md`](requirements-20260511-model-provider-registry.md), which now defines the canonical registry and authentication-storage contract. The terminal-UI presentation requirements in this document (transcript-panel display, prompt-input control, click-to-open, and text selection) remain in force and are still canonically defined here. **Implementation Note (2026-04-24):** Core authentication is complete. Codex browser auth now starts the local OAuth callback listener before exposing the authorize URL, transcript links fall back to platform URL openers when `webbrowser.open()` declines, and transcript copy reports success after sending OSC52 clipboard data. **Implementation Note (2026-04-25, v0.18.0):** GitHub Copilot auth fully revamped to match the OpenCode / Copilot Chat reference flow. The provider now uses the Copilot Chat **GitHub App** client ID (`Iv1.b507a08c87ecfe98`), which issues `ghu_` user-to-server tokens via device flow. The `ghu_` token is immediately exchanged at `GET /copilot_internal/v2/token` for a short-lived session bearer (`tid=…`) plus tenant-scoped `endpoints.api` (routes Business/Enterprise users to `api.business.githubcopilot.com` automatically) and `sku`. Session bearer is stored as `access_token`; `ghu_` retained as `refresh_token` for re-exchange on expiry. `CopilotLLM` subclasses the OpenHands SDK `LLM` and overrides `_get_litellm_api_key_value()` to lazily resolve fresh credentials (refreshing via `AuthManager` when `check_status` reports `EXPIRED`) and mutate `self.base_url` immediately before each LiteLLM call. Legacy `gho_` OAuth-App tokens are now auto-detected by `check_status` and force re-authentication instead of silently failing. Dead `gh auth token` CLI fallback removed. Explicit logout now has three surfaces (REQ-001 through REQ-007):

- `rotaris-cli logout <provider>` - dedicated subcommand.

- `rotaris-cli run --logout <provider>` - flag for consistency with existing flows.

- `/logout <provider>` slash command in the TUI.

All three route through `AuthManager.logout()` and report one of three outcomes - "signed out", "no stored tokens", or "failed" - per REQ-20260424-190500-006. As of 2026-05-11, the CLI logout flow also accepts persisted OpenAI-compatible instance IDs such as `openai-compatible--my-label`. As of 2026-07-13, logout removes credentials only and retains the corresponding provider entry and discovered models in `project_settings.yaml`; destructive endpoint removal is a separate `providers delete` operation. As of 2026-05-21, `rotaris-cli logout` and `rotaris-headless logout` also allow the provider argument to be omitted in an interactive terminal. In that case the CLI shows an arrow-key picker and logs out the highlighted provider on Enter, preserving provider-scoped logout without forcing users to remember provider IDs. That picker now only lists providers with stored credentials, so logged-out providers no longer appear as selectable logout targets. As of 2026-05-21, the equivalent provider picker used by `rotaris-cli login` when no provider argument is supplied now follows the same arrow-key interaction pattern and shared selector implementation, with the same color-coded highlight and small selection animation used by logout.

**Dependencies:**

- REQ-20260418-144012-004 (Clickable Links) and REQ-20260418-144012-005 (Text Selection) are prerequisites for REQ-20260418-144012-001 (TUI-based Auth Flow). The Device Flow specifically depends on the user being able to see and copy the one-time code without leaving the TUI.

- REQ-20260424-190500-002 (Logout via Settings Menu) depends on the existing settings menu infrastructure remaining available from the active TUI session.

- REQ-20260424-190500-003 (Logout via CLI Flag) depends on the CLI command surface being able to resolve provider identifiers and invoke the shared auth storage/logout path.

**Excluded / Out of Scope:**

- Manual API token entry by the user

- Creating new custom-provider API-key credentials outside `rotaris-cli login`, which is governed by `requirements-20260511-model-provider-registry.md`

- Custom user management / proprietary identity system

- Token persistence behavior

**Pending Work:**

- REQ-20260424-190500-002 (Logout via Settings Menu) - the TUI now has a dedicated provider settings screen, but it exposes save, validate, and reauthenticate rather than a first-class logout control. The underlying logout path is already implemented and available via CLI and `/logout <provider>`.

#### Acceptance Criteria

All requirement rows are implemented or explicitly tracked according to status `Partial - core provider auth, transcript/browser flows, and CLI/TUI logout are implemented; a first-class logout control inside the provider-settings UI remains open.`.

### Rotaris - Fast Provider Onboarding and Minimal Startup Configuration (2026-05-11)

Original: `docs/requirement-log/done/requirements-20260511-000003.md` — document status: Complete - All REQ-019..038 implemented, all acceptance criteria satisfied, snapshot→models loader bridge verified, 0 real regressions vs baseline (64 baseline vs 65 after = 2 order-dep tests passing in isolation + 1 fixed). Code-complete, pending final Oracle re-verification and manual QA.

#### Description

Rotaris should optimize first-use onboarding for the fastest path to a successful run. Instead of bootstrapping a rich two-file model registry configuration, the product should create only a minimal startup `agents.yaml`, guide the user through an explicit `rotaris-cli login` onboarding flow, and let the user register one or more supported providers such as GitHub Copilot or OpenAI Codex. Re-running the login flow should allow adding another provider later. Advanced configuration must remain available, but only as an explicit opt-in path that opens a user-editable YAML document in the operating system's default editor without overwriting existing files.

**Current behaviour:**

- Existing configuration requirements assume a startup model architecture centered on `agents.yaml` plus `models.yml`.

- Existing authentication requirements already support provider authentication flows for GitHub Copilot and OpenAI Codex and prohibit manual token entry.

- Newly added bootstrap requirements currently assume creation of both `agents.yaml` and `models.yml`, and currently prefer a richer shipped default config than the user now wants.

- There is no requirement yet for a first-class `rotaris-cli login` onboarding command that can be rerun to register additional providers.

- There is no requirement yet for an optional onboarding step that opens advanced configuration in the operating system's default editor.

**What needs to change:**

1. Replace the default two-file bootstrap assumption with a faster onboarding path centered on a minimal startup config and explicit provider registration.

2. Require a minimal generated `agents.yaml` that contains only the essential startup-selection keys.

3. Remove the requirement to generate a default `models.yml` for the quickstart path.

4. Add a first-class `rotaris-cli login` flow that lets the user choose and register supported providers.

5. Preserve official provider authentication flows and the ban on manual token entry.

6. Add an explicit post-authentication handoff that discovers available models and makes the quickstart configuration runnable without manual registry authoring.

7. Define recovery behavior for successful authentication that yields no usable models.

8. Provide an optional advanced path for users who want to author their own model or agent configuration.

9. Keep onboarding non-destructive: existing user configuration must remain untouched unless the user explicitly requests creation of a missing config document.

10. Define how onboarding behaves when a provider is already authenticated or when advanced configuration cannot be completed successfully.

#### Implementation Notes

**Requirements Document:**

**Note (2026-05-11):** Manual post-onboarding model refresh from the CLI is defined in `requirements-20260511-model-refresh-cli.md`. Persistent editing of saved startup defaults after onboarding is defined in `requirements-20260511-startup-model-defaults.md`. This document remains the canonical requirement for provider onboarding through `rotaris-cli login` and repeated provider registration. **Implementation Note (2026-05-21):** The provider picker shown by `rotaris-cli login` when no provider argument is supplied now uses the same interactive arrow-key menu behavior as CLI logout. Both login and logout share one reusable ANSI selector with color-coded highlighting and a small two-frame selection animation.

**Dependencies:**

- Depends on: `requirements-20260418-143500.md` (official auth flows), `requirements-20260413-000002-personas-and-config.md` (personas, config architecture)

- Depends on: `requirements-20260511-model-provider-registry.md` (credential storage architecture, `AuthManager`, `ProviderCatalog`, model persistence)

- Blocks: first-run onboarding redesign, `rotaris-cli login` implementation, minimal startup-config generation

**Resolved Conflicts:**

Prior Requirement | Conflict | Resolution `docs/requirement-log/partial/requirements-20260413-000002-personas-and-config.md` `FR-5-002` | The current requirement corpus treats `models.yml` as the required startup model registry file. | For the quickstart path, `models.yml` is no longer required by default. A minimal `agents.yaml` plus provider registration becomes the primary onboarding path. Advanced model configuration remains opt-in. Earlier 2026-05-11 bootstrap and follow-up onboarding requirements | The earlier bootstrap path mandated creation of both `agents.yaml` and `models.yml` on first launch and later reinforced a rich two-file baseline. | The standard onboarding path now creates only a minimal `agents.yaml`. No default `models.yml` is created unless the user explicitly requests advanced model configuration. `docs/requirement-log/done/requirements-20260503-123000.md` | The runtime-model-selection requirement assumes the startup model is loaded from `agents.yaml`/`models.yml`. | Startup selection remains configuration-driven, but the quickstart source becomes minimal `agents.yaml` plus registered-provider state and any optional advanced configuration, rather than a mandatory default `models.yml`. `docs/requirement-log/partial/requirements-20260418-143500.md` | Authentication requirements keep the auth transaction inside the terminal UI, while the requested onboarding flow also wants config editing in the operating system's default editor. | The editor-launch step is optional and separate from the authentication transaction. Provider authentication remains governed by the existing official auth-flow requirements; only optional advanced configuration may open in the default editor.

**Notes:**

- `fallback_model` is the intended field name for the fallback model role.

- This requirement intentionally prioritizes first successful use over exhaustive up-front configuration.

- “Advanced configuration” is an explicit user choice; it must not become a hidden mandatory step for ordinary quickstart onboarding.

- This document owns the onboarding-stage handoff from authentication to runnable startup configuration. The deeper provider/model persistence, credential separation, and stable model-ID contract remain owned by `requirements-20260511-model-provider-registry.md`.

#### Acceptance Criteria

**Acceptance Criteria:**

- [x] On a clean machine, first use creates the global settings directory and a minimal `agents.yaml`, but does not create `models.yml` by default.

- [x] The generated `agents.yaml` contains the essential quickstart keys `default_persona`, `default_summary_model`, `small_model`, `medium_model`, and `fallback_model`.

- [x] The generated quickstart config is minimal and does not dump the full built-in persona catalog into the file by default.

- [x] Running `rotaris-cli login` with no provider argument prompts the user to choose a provider such as Copilot or Codex.

- [x] Running `rotaris-cli login` a second time can register a different provider without removing the first one.

- [x] Provider registration does not require manual token entry and uses the official provider auth flow.

- [x] After registering a supported provider, the user can reach a first successful startup without creating or editing a `models.yml` file.

- [x] After successful provider authentication, onboarding discovers the models available to that provider and uses that result to complete the minimal startup configuration needed for ordinary startup.

- [x] If provider authentication succeeds but no usable models are available, onboarding does not falsely report success and instead offers recovery paths that include choosing another provider, opening advanced configuration, or exiting without overwriting existing user-authored config files.

- [x] Invoking `rotaris-cli login` for a provider that is already authenticated and still valid does not force the user through the full authentication flow again by default.

- [x] If the user chooses advanced configuration, the relevant YAML config opens in the operating system's default editor.

- [x] If the operating system's default editor cannot be opened, exits unsuccessfully, or leaves startup configuration invalid, Rotaris reports that outcome explicitly and does not silently mark onboarding complete.

- [x] If the user declines advanced configuration, onboarding still completes and remains usable for the quickstart path.

- [x] If the advanced path is declined or does not produce a runnable startup configuration, the quickstart path remains available instead of dead-ending the user.

- [x] Existing `agents.yaml` or user-created advanced configuration files remain unchanged across repeated onboarding or login runs unless the user explicitly edits them.

- [x] If no provider is registered yet, the user is clearly directed either to register one or to open advanced configuration.

### Rotaris - Rotaris Cloud Provider Positioning (2026-05-26)

Original: `docs/requirement-log/done/requirements-20260526-154500.md` — document status: Done - Rotaris Cloud is registered as the first built-in provider, uses the recommended display label, and preserves the other supported provider choices.

#### Description

Add Rotaris Cloud (originally named Concrete Cloud in this requirement draft) as a first-class built-in AI provider in Rotaris, using the provider contract documented by the referenced provider JWT-auth instruction. Because Rotaris Cloud is the business-promoted offering, it must be presented as the primary recommended choice in user-facing provider selection flows. The user-visible provider name must read `Rotaris Cloud (recommended)` and it must appear first anywhere built-in providers are offered for selection.

**Problem being solved:**

Rotaris exposes built-in providers such as GitHub Copilot and OpenAI Codex, and reserves the primary onboarding position for the business-promoted Rotaris Cloud offering.

**Current behaviour:**

- Built-in providers are defined centrally and include Rotaris Cloud, GitHub Copilot, OpenAI Codex, OpenAI-compatible, and DeepSeek.

- User-facing login provider selection derives its options directly from the built-in provider catalog.

- The built-in provider ordering is catalog order, and Rotaris Cloud appears first.

**What needs to change:**

1. Add Rotaris Cloud as a built-in provider supported by Rotaris under the provider contract referenced by the external provider JWT-auth instruction.

2. Treat Rotaris Cloud as the primary recommended provider in user-facing provider-selection surfaces.

3. Display the provider label to users as `Rotaris Cloud (recommended)`.

4. Ensure Rotaris Cloud appears before other built-in providers in onboarding and login selection flows.

#### Implementation Notes

**Requirements Document:**

**Dependencies:**

- Depends on: `docs/requirement-log/partial/requirements-20260511-model-provider-registry.md`

- Depends on: `docs/requirement-log/partial/requirements-20260418-143500.md`

- Blocks: None

**Resolved Conflicts:**

Prior Requirement | Conflict | Resolution `docs/requirement-log/partial/requirements-20260511-model-provider-registry.md` | Existing provider-registry contract defines built-in provider handling but does not define presentation priority for a business-promoted provider. | This document adds Rotaris Cloud as an explicit built-in provider requirement and defines user-facing ordering and label rules as an additive extension. `docs/requirement-log/partial/requirements-20260418-143500.md` | Existing login UX requirements define interactive provider selection but do not define a preferred first option. | Rotaris Cloud must be the first option in provider-selection UX while preserving the existing interaction pattern for all providers.

**Notes:**

- Assumption update: the provider is still exposed under the stable provider ID `concrete-cloud`, but the product-facing label is now `Rotaris Cloud (recommended)`.

- Assumption: the referenced external Concrete Cloud provider instruction is the authoritative source for protocol-level authentication details. Automated retrieval of that URL failed during authoring, so this document constrains the product requirement to provider inclusion, positioning, and conformance to that referenced instruction rather than restating protocol specifics.

- Scope deliberately stays solution-neutral about internal catalog structures, sorting implementations, and exact auth-module changes.

- Implementation note (2026-06-02): Rotaris now persists Rotaris Cloud `api_base_url` values from the CLI token/refresh responses and reuses that stored API base during runtime LLM construction, which closes a model-access gap for authenticated Rotaris Cloud models and streaming chat-completions calls.

- Innovation suggestion: if more promoted providers are expected later, the product should eventually adopt an explicit user-facing provider-presentation policy with rank and badge metadata, rather than encoding promotion rules per provider ad hoc.

#### Acceptance Criteria

**Acceptance Criteria:**

- [x] A user invoking `rotaris-cli login` without a provider argument is shown a provider picker whose first visible option is `Rotaris Cloud (recommended)`.

- [x] Any other user-facing built-in provider picker or ordered provider list shows `Rotaris Cloud (recommended)` before all other built-in providers.

- [x] Rotaris Cloud is available as a built-in provider option rather than requiring users to define it manually as a custom provider.

- [x] Selecting Rotaris Cloud starts the provider-specific authentication and onboarding flow defined for that provider, rather than falling back to a generic unsupported-provider error.

- [x] GitHub Copilot, OpenAI Codex, and other supported providers remain available after Rotaris Cloud is added.

- [x] The visible label for Rotaris Cloud is exactly `Rotaris Cloud (recommended)` wherever the provider itself is presented as a selectable built-in option.

### Rotaris - DeepSeek Provider Integration (2026-05-28)

Original: `docs/requirement-log/done/requirements-20260528-deepseek-provider.md` — document status: Complete - Provider registration, model discovery, token limits, tier picking,

#### Description

Add DeepSeek as a first-class built-in AI provider in Rotaris. DeepSeek offers an OpenAI-compatible chat completions API with two current-generation models (`deepseek-v4-pro` and `deepseek-v4-flash`), both supporting a 1M-token context window, 384K max output tokens, tool calling (including in thinking mode), JSON output, and streaming. The API uses simple Bearer-token authentication. This provider must support full model discovery, token-limit extraction, tier-aware default model picking, and thinking-mode configuration surfaced through the existing `thinking` field in `ModelConfig`.

**Problem being solved:**

Users want to use DeepSeek's models as the LLM backend for Rotaris agents. DeepSeek V4 models offer competitive performance at significantly lower cost than comparable frontier models, with a 1M-token context window and strong tool-calling capabilities. Without a built-in provider, users would need to manually configure DeepSeek through the `openai-compatible` provider with static model declarations - losing automatic model discovery, token-limit extraction, tier-aware model picking, and thinking-mode wiring.

**Current behaviour:**

- `BUILTIN_PROVIDERS` in `src/rotaris_core/providers/catalog.py` contains four entries:

`concrete-cloud`, `copilot`, `codex`, and `openai-compatible`.

- The `openai-compatible` provider can be pointed at DeepSeek's API manually, but

the `/models` response format differs from OpenAI's (`{object: "list", data: [...]}` vs `{data: [...]}`) which would cause discovery to fail without adaptation.

- Model picking in `providers/picker.py` has no awareness of DeepSeek model names,

so tier assignment would not work automatically.

- Thinking mode in `config/loader.py` only handles `anthropic` (extended thinking

budget) and `openai` (reasoning effort). DeepSeek requires a different mechanism: `extra_body={"thinking": {"type": "enabled"}}` plus optional `reasoning_effort`.

- Auth for API-key providers uses `StaticAPIKeyAuthProvider` under the

`auth_provider_id` matching the provider ID. DeepSeek needs a compatible entry point in `AuthManager._get_provider_class()` or a dedicated auth provider.

**What needs to change:**

1. Register `deepseek` as a built-in provider in `BUILTIN_PROVIDERS` with the correct

discovery endpoint, auth header, and base URL.

2. Adapt the model discovery parser in `discover_models()` to handle DeepSeek's

`{object: "list", data: [...]}` response format (the current parser expects a top-level `data` key; DeepSeek wraps it in an `object` envelope).

3. Add DeepSeek model-name patterns to `providers/picker.py` so `deepseek-v4-pro`

maps to the `large` tier and `deepseek-v4-flash` maps to `medium`/`small` tiers.

4. Wire thinking-mode configuration for `provider == "deepseek"` in

`_resolve_thinking_kwargs()` so the correct `extra_body` is passed to LiteLLM.

5. Ensure streaming responses include `stream_options: {include_usage: true}` for

the condenser to receive token counts (the existing `openai` provider path already does this, but only when `base_url` is not `api.openai.com` - confirm coverage or add a dedicated path).

6. Register an auth-provider class for `deepseek` (can reuse `StaticAPIKeyAuthProvider`

since DeepSeek uses simple API keys) or ensure `AuthManager` falls through to static-key auth for unknown providers.

7. Support the `reasoning_content` field in responses if DeepSeek thinking mode is

#### Implementation Notes

**Requirements Document:**

**Dependencies:**

- Depends on: None (greenfield provider addition)

- Blocks: None

**Resolved Conflicts:**

Prior Requirement | Conflict | Resolution `requirements-20260511-model-provider-registry.md` R7 (credential separation) | DeepSeek uses simple API keys - does this belong in the token store or a static config? | API keys are stored in `TokenStorage` under provider ID `"deepseek"`, consistent with how `openai-compatible` instances store credentials. The static auth provider reads from token storage, not from `models.yml`.

**Notes:**

**Evolution — Per-Model Concurrency Queue (2026-06-10):** DeepSeek models
receive `max_parallel: 3` by default (via `ModelConfig._default_max_parallel`)
to prevent governor-rate 401s under high concurrency. The
`RotarisDelegateExecutor` now enqueues children that would exceed this cap into
`WAITING_ON_MODEL_SLOT` rather than returning a rejection error. Children
automatically start when a sibling terminates and releases a slot.

**Key DeepSeek API documentation links:**

- **API Reference (Chat Completions):** https://api-docs.deepseek.com/api/create-chat-completion

- **Models & Pricing:** https://api-docs.deepseek.com/quick_start/pricing

- **List Models endpoint:** https://api-docs.deepseek.com/api/list-models

- **Thinking Mode guide:** https://api-docs.deepseek.com/guides/thinking_mode

- **Tool Calls guide:** https://api-docs.deepseek.com/guides/tool_calls

- **Rate Limits:** https://api-docs.deepseek.com/quick_start/rate_limit

- **Error Codes:** https://api-docs.deepseek.com/quick_start/error_codes

- **Change Log:** https://api-docs.deepseek.com/updates

- **Your First API Call:** https://api-docs.deepseek.com/

**Provider identity:**

- Provider ID: `deepseek`

- LiteLLM model prefix: `openai/deepseek-v4-pro` (since DeepSeek is OpenAI-compatible,

LiteLLM routes it through the `openai/` provider with `base_url` override)

- Base URL for chat completions: `https://api.deepseek.com/v1`

- Base URL for beta features (strict tool calling): `https://api.deepseek.com/beta`

- **Decision:** Default to the standard `/v1` endpoint. Beta features (strict

function calling) are out of scope for v1.

**Discovery response format:**

DeepSeek's `GET /models` returns:

```json
{
  "object": "list",
  "data": [
    { "id": "deepseek-v4-pro", "object": "model", "owned_by": "deepseek" },
    { "id": "deepseek-v4-flash", "object": "model", "owned_by": "deepseek" }
  ]
}
```

This differs from OpenAI's `{object: "list", data: [...]}` and Copilot's `{data: [...]}`. The current `discover_models()` parser expects `data` at the top level of the JSON response. DeepSeek's format matches - the `data` key IS at the top level of the JSON object. No format adaptation needed for the basic case. However, token limits are NOT returned by DeepSeek's `/models` endpoint. The discovery path must fall back to known specifications:

- Input: 1,048,576 tokens (1M)

- Output: 384,000 tokens

This fallback should be applied when `extract_token_limits()` returns `(None, None)`.

**Thinking mode:**

DeepSeek's thinking mode uses **two separate parameters**, unlike OpenAI/Anthropic:

#### Acceptance Criteria

**Acceptance Criteria:**

- [ ] `rotaris-cli login deepseek` prompts for an API key and stores it; subsequent

`rotaris-cli models refresh --provider deepseek` discovers `deepseek-v4-pro` and `deepseek-v4-flash` without errors.

- [ ] After successful discovery, `deepseek-v4-pro` appears as the large-tier model

and `deepseek-v4-flash` as the medium/small-tier model in the startup-model editor (when no other provider has been picked for those tiers).

- [ ] A persona configured with `model: deepseek/deepseek-v4-pro` and

`thinking: high` successfully sends requests with `extra_body={"thinking": {"type": "enabled"}}` and `reasoning_effort="high"` in the LiteLLM request.

- [ ] Streaming responses from DeepSeek include `prompt_tokens` in the usage block

so the condenser does not see a zero context-size estimate.

- [ ] Tool calls work end-to-end: an orchestrator persona backed by

`deepseek-v4-pro` can delegate work to child agents and receive correct responses.

- [ ] Multi-turn conversations in thinking mode do not produce HTTP 400 errors

from missing `reasoning_content` (verified via capability test).

- [ ] `rotaris-cli logout deepseek` removes stored credentials and the provider

shows as unauthenticated in the TUI.

- [ ] Existing providers (copilot, codex, openai-compatible) are unaffected by

the changes - discovery, model picking, and thinking-mode wiring continue to work as before.

- [ ] Unit tests cover: provider descriptor registration, discovery response

parsing for the DeepSeek format, token-limit fallback, model picker tier assignment, and thinking-kwargs resolution for `provider == "deepseek"`.

### Rotaris - Post-Onboarding Provider Settings Editing (CLI + TUI) (2026-06-05)

Original: `docs/requirement-log/done/requirements-20260605-provider-settings-editing.md` — document status: Complete - CLI and TUI provider settings surfaces now support API-key rotation,

#### Description

After a provider has already been registered, users must be able to inspect and change that provider's mutable settings without hand-editing YAML or deleting/recreating the provider from scratch. This is primarily needed for rotating API keys and correcting provider-specific runtime settings such as API base URLs after a failed run. The editing flow must exist in both the CLI and the TUI. For providers that use official OAuth or device-code authentication flows, the product must not expose raw token editing. Instead, the same CLI/TUI management surface must provide a reauthenticate/relogin action that replaces the stored credential through the official flow.

**Problem being solved:**

The current provider-registration and model-discovery flow is optimized for first-time onboarding, but it does not provide a first-class post-onboarding settings-management path. When a stored API key becomes invalid, a provider-issued token changes, or provider metadata such as `api_base_url` needs correction, the user is forced into a brittle recovery path:

1. manually edit underlying files or secret storage,

2. rerun login in a way that may not target the correct field,

3. or remove and recreate the provider entry entirely.

This creates unnecessary friction exactly when the user is already in a broken state, such as an authentication failure during a real run.

**Current behaviour:**

- `rotaris-cli login` covers provider onboarding and repeated provider registration.

- `rotaris-cli models refresh` covers post-onboarding model discovery refresh.

- The provider registry and auth store already separate secrets from project files.

- Startup-model defaults can be edited after onboarding, but provider credentials and provider

runtime settings do not yet have an equivalent first-class editor.

- Existing built-in-provider requirements prohibit manual token entry for OAuth/device-code

providers during normal onboarding.

**What needs to change:**

1. Add a first-class provider-management surface in both CLI and TUI.

2. Allow post-onboarding editing of mutable provider settings and credentials for API-key-style

providers.

3. Provide reauthentication actions instead of raw token editing for OAuth/device-code providers.

4. Persist changes through the existing registry + secret-store architecture without leaking secrets

into workspace files, session snapshots, or logs.

5. Revalidate or refresh provider discovery after a change so the user can recover immediately from

a broken credential/configuration state.

#### Implementation Notes

**Requirements Document:**

base URL editing, OAuth/device-code reauthentication, post-edit validation/model refresh, and early TUI notification for configured providers with missing or expired authentication.

**Dependencies:**

- Depends on: `requirements-20260511-model-provider-registry.md` (registry ownership, credential

separation, provider metadata, discovery pipeline)

- Depends on: `requirements-20260511-000003.md` (provider onboarding via `rotaris-cli login`)

- Depends on: `requirements-20260511-model-refresh-cli.md` (post-edit model refresh contract)

- Depends on: `requirements-20260526-secrets-management.md` for CLI/TUI secret-editing patterns,

but this requirement owns LLM-provider editing rather than MCP-server env secrets

- Blocks: first-class recovery from stale or broken provider credentials/settings in CLI and TUI

**Resolved Conflicts:**

Prior Requirement | Conflict | Resolution `requirements-20260511-000003.md` REQ-20260511-026 | Built-in onboarding forbids requiring users to paste raw API tokens for official OAuth/device-code providers. | This requirement preserves that rule. Post-onboarding editing for those providers is reauthentication, not raw token editing. `requirements-20260511-model-provider-registry.md` CR-001..CR-007 | Provider settings editing introduces new write paths for credentials and provider metadata. | All edits must continue to use the registry + secret-store split. Secrets never enter project files, session snapshots, or logs. `requirements-20260526-secrets-management.md` | That document already defines CLI/TUI secret editing for MCP server env vars. | The pattern is analogous but the ownership is separate: MCP env secrets remain there; LLM-provider credentials and settings are owned by this document.

**Notes:**

- This requirement intentionally covers both credentials and mutable provider settings because in

practice the recovery path for a broken provider often requires changing both.

- “Provider settings” here means only mutable per-provider values that already belong to provider

registration/runtime configuration. It does not include startup model slot defaults or session-only runtime model switching.

- For API-key providers, “edit” includes replacement/rotation and explicit clearing.

- For OAuth/device-code providers, “edit” includes viewing non-secret metadata plus relogin/logout;

it does not authorize exposing raw stored tokens.

#### Acceptance Criteria

**Acceptance Criteria:**

- [ ] A user with an already-registered API-key provider can rotate its API key from the CLI without

opening YAML files or manually editing secret storage.

- [ ] A user with an already-registered API-key provider can rotate its API key from the TUI through

a provider settings screen or equivalent interactive editor.

- [ ] A user can inspect and edit mutable connection settings such as `base_url` or

provider-supplied `api_base_url` for providers that support those fields.

- [ ] A user editing an OAuth/device-code provider is offered a relogin/reauthenticate action rather

than a raw token text field.

- [ ] Saving a new API key or connection setting can immediately trigger or offer a provider refresh

so the user can verify that model discovery now succeeds.

- [ ] Invalid replacement credentials produce a clear error without destroying the previous provider

record unless the user explicitly chooses a destructive action.

- [ ] No raw secret values appear in CLI output, TUI notifications, transcripts, logs, or session

snapshots during provider editing.

- [ ] Routine provider maintenance no longer requires deleting and recreating the provider entry just

to change a token or endpoint.

### Multiple OpenAI-Compatible Providers (2026-07-13)

Original: `docs/requirement-log/done/requirements-20260713-multiple-openai-compatible-providers.md` — document status: Done

#### Implementation Notes

The shared lifecycle API lives in `rotaris_core.auth.provider_settings`. Rotaris reloads the global provider catalog after successful registration or deletion without marking workspace settings dirty. Its deletion confirmation reports matching model slots and personas in the current workspace and warns that other workspaces are not inspected.
