---
req-id: SWR-3719
status: draft
trace: required
test: required
title: "Desktop credentials are protected with platform-appropriate user access controls"
epic: SWR-2000
date: 2026-08-23
---

# SWR-3719 — Desktop credentials are protected with platform-appropriate user access controls

Rotaris stores provider and account credentials locally so users can authenticate
without repeating the credential flow on every launch. That storage shall use the
operating system's per-user application-data location and shall prevent accidental
access by other local users to the extent supported by the platform.

## Scope

- **In scope**: credentials written by the desktop application's authentication
  and provider flows, their storage location, filesystem permissions/access
  controls, cleanup on logout, and avoidance of credential leakage into logs or
  workspace state.
- **Out of scope**: server-side credentials, Keycloak database storage, backend API
  keys managed by Rotaris Cloud, and organization-wide device management policy.

## Behaviour

**Credentials live outside the workspace.** Persistent authentication material is
stored below the platform-specific Rotaris user-data directory resolved by the
application. Credentials must not be persisted in `.rotaris/`, project files,
repository metadata or other workspace-owned paths.

**Access control is expressed as a security property, not as a Unix mode string.**
On POSIX systems the credential directory shall be restricted to the current user
and credential files shall use restrictive modes equivalent to directory `0700`
and file `0600`. On Windows the implementation shall use the current user's
profile and OS-appropriate ACL semantics so the effective protection is not
specified or tested solely by POSIX mode bits.

**Credentials do not leak through diagnostics.** Tokens, API keys, refresh tokens,
subscription tokens and equivalent secrets must not be written to normal logs,
setup logs, diagnostics exports or UI error messages. Diagnostic representations
may identify the credential type and whether one exists, but not its secret value.

**Logout removes local persistent authentication material for the selected
provider/account.** After a successful logout, a subsequent launch must not
silently recover the removed credential from Rotaris-managed local token storage.

**Storage paths are portable.** Application code and user-facing descriptions
must derive configuration/data locations through the platform path abstraction
rather than hard-coding Linux home-directory paths as universal locations.

## Acceptance criteria

- **AC-001**: On every supported desktop OS, provider/account credentials are
  stored below the platform-specific per-user Rotaris data directory and not in a
  workspace.
- **AC-002**: On Linux/macOS, newly created credential directories and files are
  restricted to the current user with permissions equivalent to `0700`/`0600`.
- **AC-003**: On Windows, an automated test verifies the credential storage path is
  inside the current user's application-data/profile boundary and that Rotaris
  does not rely on a POSIX `0600` assertion as the security guarantee.
- **AC-004**: Normal logs, diagnostics exports and UI errors redact known secret
  values and never emit the complete credential.
- **AC-005**: Provider-scoped logout removes the corresponding Rotaris-managed
  persistent credential and the next launch classifies that provider as
  unauthenticated unless another supported external credential source exists.
- **AC-006**: No credential persistence implementation writes into `.rotaris/` or
  another repository/workspace path.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Credential paths resolve through platform-specific user-data directories | `config.paths` → auth storage | `tests/unit/auth/test_credential_storage_paths.py` |
| Unit | Secret-bearing errors and diagnostic structures are redacted | auth/provider diagnostics | `tests/unit/auth/test_secret_redaction.py` |
| Integration | Save, reload and logout operate on the same protected store | provider auth → token storage | `tests/integration/test_local_credential_lifecycle.py` |
| Platform CI | POSIX modes and Windows profile/ACL assumptions are verified on native runners | filesystem boundary | `tests/platform/test_credential_permissions.py` |

Related: [SWR-714 — Explicit Logout Operation](../700-providers-auth.md)

Epic: [Rotaris Desktop](../2000-rotaris-desktop.md)
