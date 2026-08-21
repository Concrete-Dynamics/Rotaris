# Bug: Codex OAuth Login Fails — "Invalid ID token: missing organization_id"

## Scope

This report analyses the OpenAI Codex OAuth login failure observed on 2026-07-06.
The bug affects the `rotaris-cli login` flow when selecting the "OpenAI Codex" provider.

Affected components:

- `src/rotaris_core/auth/codex.py` — Codex OAuth provider
- `src/rotaris_core/cli/model_refresh.py` — discovery credential resolution

## Reproduction

```bash
rotaris-cli login
# → Select "OpenAI Codex"
```

### Observed output

```
Codex OAuth: port 1455 unavailable ([Errno 98] Address already in use)
Opening your browser for login...
If your browser did not open, visit:
https://auth.openai.com/oauth/authorize?response_type=code&client_id=...

Codex API key exchange failed: HTTP 401 body={
  "error": {
    "message": "Invalid ID token: missing organization_id",
    "type": "invalid_request_error",
    "param": null,
    "code": "invalid_subject_token"
  }
}
[07/06/26 12:26:16] INFO     Deleted stored tokens for codex
Discarded stored authentication for OpenAI Codex.
Model discovery failed for OpenAI Codex: Authentication failed for OpenAI Codex: 403
```

## Root Cause

The Hydra OAuth server at `auth.openai.com` rejects the RFC 8693 token exchange
(`_exchange_id_token_for_api_key`) with HTTP 401 because the ID token returned from
the primary OAuth authorization_code flow **lacks an `organization_id` claim**.

### Why this happens

The authorize URL sends `id_token_add_organizations=true`, requesting that Hydra
include organization claims in the ID token. However, for certain accounts (or under
certain Hydra configurations), the ID token may not contain the expected
`organizations` array, or the organization object may lack an `id` field.

### Cascade of failures

1. **OAuth authorization_code exchange** succeeds → `access_token` + `id_token` obtained
2. **RFC 8693 token exchange** (`_exchange_id_token_for_api_key`) fails with HTTP 401
   → "Invalid ID token: missing organization_id"
3. API key exchange error is **logged but swallowed**: `_exchange_code()` still returns
   `AuthResult(success=True)` (line ~454 in `auth/codex.py`)
4. **Discovery credential resolution** (`model_refresh.py:L130-L142`) finds no
   `api_key` in stored tokens, falls back to the ChatGPT JWT `access_token`
5. **Model discovery** uses the ChatGPT JWT against `https://api.openai.com/v1/models`
   → HTTP 403 (ChatGPT JWTs are not valid for `api.openai.com`)
6. **403 triggers token deletion** (`model_refresh.py:L99-L104`): `auth_manager.logout("codex")`
   deletes all stored tokens

The user sees 3 repeated failure messages because the `_log.warning(...)` at line ~458
fires once, and then the discovery flow surfaces the error twice more before giving up.

## Detailed Findings

### 1. Port 1455 is hardcoded and may be in use

**File:** `src/rotaris_core/auth/codex.py:L65-L66, L326-L346`

```python
_CALLBACK_PORT_PRIMARY = 1455
_CALLBACK_PORT_FALLBACK = 1457
```

The fallback to 1457 works, but the warning is noisy. These ports are whitelisted in
Hydra's redirect_uri allow-list — ephemeral/ephemeral ports are rejected.

If port 1455 is already bound (e.g. by another process, or a stale previous run),
the user sees a spurious warning even though the fallback succeeds.

### 2. ID token organization claim is absent

**File:** `src/rotaris_core/auth/codex.py:L74-L86` — authorize URL construction

The query parameter `id_token_add_organizations=true` is present, but it does not
guarantee that Hydra will populate the `organizations` claim in every case.

**File:** `src/rotaris_core/auth/codex.py:L109-L121` — `_extract_account_id()`

```python
orgs = claims.get("organizations")
if isinstance(orgs, list) and orgs:
    first_org = orgs[0]
    if isinstance(first_org, dict):
        org_id = first_org.get("id")
```

If `organizations` is absent or empty, `account_id` is set to `None` and stored that
way.

### 3. Token exchange failure is non-fatal — auth marked as success

**File:** `src/rotaris_core/auth/codex.py:L448-L465` — `_exchange_code()`

```python
if api_key:
    extra["api_key"] = api_key
elif api_key_error:
    _log.warning("Codex API key exchange failed: %s", api_key_error)
    extra["api_key_exchange_error"] = api_key_error

return AuthResult(success=True, tokens=TokenSet(...))
```

The authentication is marked successful even though no usable API key was obtained.
This is misleading — without an `sk-...` API key, the Codex provider cannot make
API calls.

### 4. Wrong token used for model discovery

**File:** `src/rotaris_core/cli/model_refresh.py:L130-L142` — `_resolve_discovery_credentials()`

When `api_key` is absent from stored tokens, the code falls back to `token_value`
(the ChatGPT JWT `access_token`). This JWT is valid only for `chatgpt.com` endpoints,
not `api.openai.com` → HTTP 403.

### 5. 403 triggers unconditional token deletion

**File:** `src/rotaris_core/cli/model_refresh.py:L99-L104`

```python
if discovery.error is not None and discovery.http_status in {401, 403}:
    auth_manager.logout(provider_id)
```

The `access_token` might still be valid (just not usable for model discovery).
Deleting it unconditionally destroys any partial auth state.

## Possible Fixes

1. **Handle missing `organization_id` gracefully:** If the ID token lacks
   `organization_id`, surface a clear user-facing error explaining that the account
   may not have an organization set up, rather than cascading through 3 cryptic errors.

2. **Don't mark auth as successful without an API key:** If `_exchange_id_token_for_api_key`
   fails, return `AuthResult(success=False)` with a clear error message.

3. **Separate token deletion from discovery failure:** Don't delete stored tokens on
   discovery 403 — the access token may still be usable for other purposes. Only delete
   on explicit logout or re-auth.

4. **Better error messaging:** Surface the specific Hydra error
   ("missing organization_id") to the user so they know the issue is with their OpenAI
   account configuration, not with Rotaris.

## Affected Files

| File                                 | Lines     | Role                                                       |
| ------------------------------------ | --------- | ---------------------------------------------------------- |
| `src/rotaris_core/auth/codex.py`        | L65-L66   | Hardcoded callback ports                                   |
| `src/rotaris_core/auth/codex.py`        | L74-L86   | Authorize URL construction                                 |
| `src/rotaris_core/auth/codex.py`        | L109-L121 | `_extract_account_id()` — JWT org parsing                  |
| `src/rotaris_core/auth/codex.py`        | L326-L346 | `_bind_callback_server()` — port binding                   |
| `src/rotaris_core/auth/codex.py`        | L413-L465 | `_exchange_code()` — swallows API key exchange failure     |
| `src/rotaris_core/auth/codex.py`        | L483-L521 | `_exchange_id_token_for_api_key()` — **401 failure point** |
| `src/rotaris_core/cli/model_refresh.py` | L99-L104  | Token deletion on discovery 403                            |
| `src/rotaris_core/cli/model_refresh.py` | L130-L142 | `_resolve_discovery_credentials()` — wrong token fallback  |
| `src/rotaris_core/auth/manager.py`      | L98-L113  | Auth manager dispatch                                      |
| `src/rotaris_core/cli/auth_flow.py`     | L808-L827 | Async login orchestrator                                   |

## Severity

**High** — The Codex login flow is completely broken for accounts without an
organization claim in the ID token. Users cannot use the Codex provider even after
successful browser-based OAuth.
