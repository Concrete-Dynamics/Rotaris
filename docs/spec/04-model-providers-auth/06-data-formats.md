# Model Providers, Sign-In, and Model Routing — Stored credential file (per provider)

Part 6 of 7 of [domain 04](../04-model-providers-auth.md), which indexes every part.

## Data & Formats

All formats below are externally observable (on disk, on the wire, or in process environments) and are normative.

### Stored credential file (per provider)

The per-user data and configuration directories named in this section are the ones REQ-STARTUP-145 fixes, and which per-user location that is — the one local to this machine rather than one a platform replicates to another machine or to another copy of the user's profile — is that requirement's to state. This appendix holds no copy of it and states no rule of its own about it.

Path: `<per-user data dir for "rotaris">/tokens/<provider_id>.json`. JSON object, 2-space indented:

```json
{
  "access_token": "<string>",
  "refresh_token": "<string>",
  "expires_at": 0.0,
  "account_id": null,
  "extra": { "<string>": "<string>" }
}
```

- `expires_at` is a Unix timestamp; `0` means no expiry. Missing `expires_at`/`account_id`/`extra` are tolerated on load.
- Well-known extras keys: `api_base` (tenant or instance API base), `sku` (Copilot), `provider_family` ("openai-compatible" for instances), `auth_mode`/`requested_scopes`/`scope` (codex), `issuer`/`token_endpoint`/`revocation_endpoint` (hosted cloud OIDC).

### Provider/model snapshot

Path: `<per-user config dir for "rotaris">/project_settings.yaml`. YAML, keys unsorted, Unicode allowed, file mode 0644, atomic writes, unknown keys rejected:

```yaml
version: 1
providers:
  <provider-id>:
    id: <provider-id>
    display_name: <string>
    family: <string, optional>
    base_url: <string, optional>
    authenticated: <bool>
    default_summary_model: <qualified id, optional>
    large_model: <qualified id, optional>
    medium_model: <qualified id, optional>
    small_model: <qualified id, optional>
    fallback_model: <qualified id, optional>
    discovered_at: <ISO-8601 with UTC offset>
    models:
      - id: <qualified id>
        display_name: <string, optional>
        capabilities: { accepts_image_input: <bool, optional; absent means unknown>, image_input_tokens: <int, optional>, image_input_tokens_per_megapixel: <number, optional>, ... }
        limits: { context_window: <int>, ... }
        pricing: { input_cost_per_token: <decimal string>, output_cost_per_token: <decimal string>, image_cost_per_image: <decimal string, optional> }   # decimal strings: accepted amendment 2026-09-23, OQ-21
        discovered_at: <ISO-8601 with UTC offset>
```

Secret-like keys or values abort the write (REQ-PROVIDER-086). The key test is REQ-TOOLS-172's and the value-prefix list is REQ-TOOLS-171's; neither is restated here. The exempt keys are the two per-token price fields beneath `pricing` and the token-limit keys beneath `limits`, and no other.

### Identifiers

- Qualified model id: `<provider-or-instance id>/<model id>` (e.g. `claude-code/sonnet`, `openai-compatible--my-lab/gpt-4o`).
- OpenAI-compatible instance id: `openai-compatible--<slug>`; slug = label lowercased, non-alphanumeric runs collapsed to `-`, trimmed, non-empty.

### Copilot gateway staging files

Per-workspace staging directory `<per-user data dir for application "rotaris">/copilot-gateway/<workspace identifier>/` — never inside the workspace, and beside the credential directory rather than within it (REQ-PROVIDER-063, REQ-PROVIDER-014, REQ-SESSION-197). It is published via the environment variable `GITHUB_COPILOT_TOKEN_DIR`, which is what a consumer reads; the path itself is not a contract with any consumer. Directory protection matches the credential store (POSIX `0700`; on Windows an explicit ACL for the owning user and the local system account); both files carry POSIX mode `0600` and the equivalent Windows ACL:

- `access-token` — plain text; the durable `ghu_` token from the device flow (or the session bearer when no refresh token exists).
- `api-key.json` — compact JSON: `{"token": "<bearer>", "expires_at": <int unix ts>, "endpoints": {"api": "<base url>"}, "sku": "<string, optional>"}`.

Environment: `GITHUB_COPILOT_ACCESS_TOKEN` is defaulted (never overwritten) to the sentinel `managed-by-rotaris`. The subscription runtime for claude-code receives the stored token as `CLAUDE_CODE_OAUTH_TOKEN`.

### Discovery response (consumed contract)

Generic providers: a JSON object with a `data` list of model objects, each with `id` and optional `display_name`/`name`, capability and limit objects (including `context_length`, and including whatever the provider reports about accepted input modalities, from which the image-input declaration of REQ-PROVIDER-149 and any image token cost of REQ-PROVIDER-150 are taken), and — for the hosted cloud — decimal-string per-token prices (`prompt_usd_per_token`, `completion_usd_per_token`). Codex: a JSON object with a `models` list whose items carry `slug`, `supported_in_api`, `visibility`, `supported_reasoning_levels`, `input_modalities`, `context_window`/`max_context_window`. Hosted-cloud suggestions endpoint (`<base>/model-suggestions`): roles `small`, `medium`, `large`, `fallback` naming discovered model ids.

### Subscription usage payloads (consumed contracts)

- Codex (`.../wham/usage`): a `rate_limit` object holding `primary_window` and `secondary_window`, each with `used_percent`, `limit_window_seconds` (18,000 = 5-hour, 604,800 = weekly), and a reset timestamp or reset-after-seconds.
- Copilot (`.../copilot_internal/user`): quota snapshots; the `premium_interactions` snapshot with `unlimited`, entitlement, remaining quota, remaining percent, overage count, and a UTC quota reset date.
- Claude Code (`.../api/oauth/usage`): windows `five_hour` and `seven_day`, each `{utilization: <percent>, resets_at: <ISO-8601>}`.

### Cloud account credit payload (consumed contract)

`GET <api_base>/account/usage-status` returns a JSON object with: a required `credit` object carrying `balance_atomic` (number) and `atomic_scale` (positive number), a `state` string (available | exhausted | overdrafted; unknown values degrade to "unknown"), `admission_allowed` (boolean, default false), optional `currency` (upper-cased, default "USD"), and optional `latest_settled_usage` `{occurred_at: <ISO-8601>, status: <string>, cost_usd: <number>}`.

### Rendering formats

- Stored-key display mask: not restated here — REQ-TOOLS-171 (REQ-PROVIDER-107). It is the rendering of a key the user themselves stored, its masked middle is a fixed width, and it is not the redaction marker.
- Redaction marker: not restated here — REQ-TOOLS-171 (REQ-PROVIDER-131).
- Money: exact decimal arithmetic; balances floored, other amounts rounded half-up; 2 decimal places (4 below $0.01 magnitude); a non-balance amount greater than zero that would render as zero renders as `< 0.0001` (accepted amendment 2026-09-29, ESC-42); $/€/£ symbols, otherwise `<amount> <CODE>`.
- Percentages: clamped to 0–100, then rounded half-up to a whole number (REQ-PROVIDER-127).
- Relative reset labels: "in <1m", "in Xd[ Yh]", "in Xh[ Ym]", "in Xm"; calendar labels "<Mon> <day>".
- Timestamps persisted in the snapshot are ISO-8601 with a UTC offset.

### Workspace bootstrap

A minimal `.rotaris/agents.yaml` (YAML; default persona `orchestrator`) is bootstrapped when absent during sign-in flows; guided slot assignment and the startup-models editor write the seven slot fields and per-persona overrides into the same file.
