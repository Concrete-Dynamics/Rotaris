---
req-id: SWR-781
status: approved
trace: required
test: required
type: technical
derived-from: SWR-745
title: "Standard Keycloak OIDC authorization-code authentication"
epic: SWR-700
date: 2026-08-19
---

# SWR-781 — Standard Keycloak OIDC authorization-code authentication

The `concrete-cloud` provider MUST authenticate against the configured Rotaris Keycloak realm through OpenID Connect discovery and Authorization Code with PKCE S256, using the public `rotaris-ai` client.

Deployments MUST configure `ROTARIS_OIDC_ISSUER` to their Keycloak realm. The
API base defaults to `https://rotaris.ai/v1` and may be overridden with
`ROTARIS_API_BASE_URL`; local development configures both values with its
corresponding `*.localhost` endpoints.

It MUST:

- obtain authorization, token, and revocation endpoints from issuer discovery;
- send `response_type=code`, a PKCE S256 challenge, state, and an ephemeral loopback redirect URI;
- exchange authorization codes and refresh tokens with standard form-encoded OIDC token requests;
- retain only discovered OIDC endpoint metadata and the Rotaris API base URL with stored credentials;
- validate callback state, stop the loopback listener cleanly on timeout or cancellation, and perform best-effort standard OIDC refresh-token revocation during logout.

This replaces the removed app-owned `/cli/authorize`, `/cli/token`, `/cli/refresh`, and `/cli/revoke` protocol.

## Acceptance criteria

- The authorization request is built from discovery metadata and includes Authorization Code + PKCE parameters.
- Token exchange, refresh, and revocation use discovered standard endpoints and form-encoded request bodies.
- Failed discovery, callback state validation, refresh, or revocation does not expose tokens and yields an actionable authentication failure or local logout completion.

Derived from: [SWR-745 — Concrete Cloud provider](../700-providers-auth.md)

Epic: [Provider Integration & Authentication](../700-providers-auth.md)
