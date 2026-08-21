---
req-id: SWR-777
status: approved
trace: required
test: required
title: "Claude Code Subscription Provider"
epic: SWR-700
date: 2026-08-03
---

# SWR-777 — Claude Code Subscription Provider

Rotaris MUST support a built-in `claude-code` provider that runs agent
requests through the official Anthropic **Claude Agent SDK** authenticated
against a user's Claude Code subscription (Pro/Max/Team/Enterprise), as an
alternative to the existing Anthropic API-key/LiteLLM path. This lets a user
who already pays for a Claude Code subscription run Rotaris personas against
that subscription's usage allowance instead of separate pay-as-you-go API
billing.

Background and open implementation questions are captured in
[`docs/research/claude-code-subscription-provider/RESEARCH_PLAN.md`](../../research/claude-code-subscription-provider/RESEARCH_PLAN.md).

## Requirement

- The provider MUST authenticate via subscription OAuth
  (`CLAUDE_CODE_OAUTH_TOKEN`, minted by the user running `claude setup-token`)
  rather than `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN`. It MUST NOT silently
  fall back to API-key billing when a subscription token is present.
- Because `claude setup-token` is an interactive, one-time browser mint that
  Rotaris cannot drive itself, registration MUST instruct the user to run it
  and paste the resulting token, consistent with SWR-723/SWR-732 (no manual
  API token entry) not applying — this flow does not expose or require a raw
  Anthropic API key, only the subscription-scoped setup token.
- Before invoking the provider, Rotaris MUST verify no conflicting
  higher-precedence credential (`ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_API_KEY`,
  `apiKeyHelper`, `CLAUDE_CODE_USE_BEDROCK`/`_VERTEX`/`_FOUNDRY`) is present in
  the execution environment for this provider's requests, and surface a clear
  error if one is, so runs do not unexpectedly consume API billing instead of
  subscription usage.
- Request execution MUST go through the Claude Agent SDK's local agent runtime
  (`query()`/`ClaudeSDKClient`), not a direct call to
  `https://api.anthropic.com/v1/messages` or a LiteLLM `base_url` override —
  the provider is a distinct execution path from Rotaris's existing
  LiteLLM-routed providers.
- Concurrent requests against this provider MUST be capped (per-model
  concurrency limit, following the existing `max_parallel` pattern used for
  DeepSeek) so unattended rotaris-cli runs do not starve the same subscription's
  interactive Claude Code/Desktop usage.
- The provider MUST be selectable through the existing provider registration,
  settings, and logout surfaces (`rotaris-cli login`, provider settings
  editing, `rotaris-cli logout`) alongside other built-in providers.

## Acceptance criteria

- A user can register the `claude-code` provider by supplying a token minted
  via `claude setup-token`; the token is stored through the existing
  credential-separation architecture (never written to workspace files, logs,
  transcripts, or session snapshots).
- Runs against this provider fail with a clear, actionable error if a
  conflicting API-key/gateway credential is detected in the environment,
  instead of silently billing the API.
- The provider executes through the Agent SDK's local runtime and reports
  results back into Rotaris's normal persona/tool flow.
- Per-model concurrency for `claude-code` is capped by default, matching the
  DeepSeek precedent (SWR-919/SWR-920 concurrency safeguards).
- `rotaris-cli logout claude-code` clears the stored token and returns the
  provider to the unauthenticated state.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Conflicting-credential detection refuses to run and reports which env var conflicted | `claude-code` provider auth precheck | `tests/unit/test_claude_code_provider.py::test_conflict_error_names_variable_and_remedy`, `::test_runtime_refuses_run_on_conflicting_credential` |
| Unit | Subscription-token validation rejects raw API keys so runs never bill the API | Token paste validation | `tests/unit/test_claude_code_provider.py::test_subscription_token_rejects_api_key_to_prevent_api_billing` |
| Unit | Agent SDK runs are capped per model (DeepSeek precedent) | `ClaudeCodeRuntime` concurrency + `ModelConfig.max_parallel` default | `tests/unit/test_claude_code_provider.py::test_runtime_caps_per_model_concurrency`, `::test_model_config_defaults_max_parallel_for_claude_code` |
| Integration | Registering a token stores it via the credential-separation path and no raw token leaks into workspace files/logs | Provider registration → token storage | `tests/integration/test_claude_code_subscription_flow.py::test_register_run_and_logout_claude_code` |
| User-flow E2E | User registers `claude-code`, runs a persona against it, sees results, then logs out | `rotaris-cli login` → run → `rotaris-cli logout` | `tests/integration/test_claude_code_subscription_flow.py::test_register_run_and_logout_claude_code`, `::test_run_fails_actionably_on_conflicting_credential` |

## Implementation notes

- Execution follows the "sub-agent shim" decision from the research plan:
  each persona completion becomes one Agent SDK run
  (`claude_agent_sdk.query()`) inside the workspace, and the SDK's final
  message is returned into Rotaris's normal persona flow
  (`providers/claude_code_runtime.py`). The provider never routes through
  LiteLLM or a `base_url` override.
- Per-model concurrency defaults to `max_parallel=2` (subscription usage is
  shared with the user's interactive Claude Code/Desktop sessions); the
  DeepSeek `max_parallel` mechanism (SWR-919/SWR-920) is reused, and the
  delegate tool enforces the same cap at spawn time.
- The Agent SDK dependency is the optional extra
  `rotaris-core[claude-code]`, installed with
  `uv sync --all-packages --extra claude-code`. A missing SDK surfaces an
  actionable install error at model construction (`config/loader.py`), before
  a session directory exists, with the same message repeated as a guard inside
  `claude_code_runtime`.
- The SDK wheel bundles the Claude Code CLI (0.2.128 bundles CLI 2.1.220), so
  no separate Claude Code install is required.
- Subagent-spawning CLI tools (`Agent`, `Task`) are denied by default
  (`SUBAGENT_TOOLS`). One completion already maps to one full Claude Code agent
  loop; letting that loop fan out to its own subagents spends subscription
  allowance Rotaris neither records nor caps, and delegation is the
  orchestrator's job. Pass `disallowed_tools=()` to `run_prompt` to opt out.
- Each tool call the CLI makes is logged at INFO. A run can take minutes, and
  the SDK's final message is the only thing Rotaris surfaces, so without
  progress logs an active run is indistinguishable from a hang.

Related requirements: [SWR-778 — Claude Agent SDK native agent loop in the Ralph loop](SWR-778-claude-agent-sdk-native-loop.md)

Epic: [Provider Integration & Authentication](../700-providers-auth.md)
