[Product directives](../directives.md) › PD-PROVIDER-004

<a id="pd-provider-004"></a>

### PD-PROVIDER-004 — Rotaris Cloud is available, at the address the backend is deployed on, and the user may point it at another server

1. **Available.** This build ships `concrete-cloud` marked available. REQ-PROVIDER-006's "coming soon" was a static
   attribute of a build that had no backend to sign in to; a later build changes it, and this is that build. The
   add-provider dialog and the first-launch setup list the provider like any other (REQ-PROVIDER-117, 043).

2. **Where it is.** The catalogue's discovery URL and default API base are `https://api.rotaris.ai/v1/models` and
   `https://api.rotaris.ai/v1` — the API origin the backend's deployment boundary names — not `https://rotaris.ai/v1`
   (REQ-PROVIDER-005). The default issuer is `https://auth.rotaris.ai/realms/rotaris`, the production realm; the public
   client is `rotaris-ai` (REQ-PROVIDER-037). The credential the product sends to the API is the Keycloak access token the
   sign-in produced, which the backend introspects.

3. **A server of the user's choosing.** The API base and the issuer are two values, each defaulting to the production
   value, taken in this order: the environment variables `ROTARIS_API_BASE_URL` and `ROTARIS_OIDC_ISSUER`
   (REQ-PROVIDER-037), then the choice the user stored, then the default. The authentication window offers the stored
   choice under "Server" for Rotaris Cloud, two URL fields that are blank for the default, so a development backend
   (`https://api.dev.rotaris.ai/v1` with `https://auth.dev.rotaris.ai/realms/rotaris-dev`) or one running on the user's
   machine (`http://api.localhost/v1` with `http://auth.localhost/realms/rotaris-dev`) can be signed in to. The choice is
   kept in `rotaris-cloud-server.json` in the per-user configuration directory; it holds two URLs and no credential. A value
   stated and malformed is an error and never replaced by the default, so a typo cannot send a sign-in to production.

4. **A sign-in belongs to its server.** The credential records the issuer and API base it was made against
   (REQ-PROVIDER-040). Models are discovered from, and runs are sent to, that API base. A stored sign-in made against
   another issuer than the one now in force is not used by an interactive sign-in: the flow runs again.

**As built.** `packages/providers/src/flows/cloud.ts` (discovery, authorization with PKCE on an ephemeral loopback port at
`/callback`, exchange, refresh, revocation), `cloud-server.ts` (the stored choice), `signin.ts` (`cloudServer`,
`setCloudServer`, the dispatch), the commands `providers.cloudServer` and `providers.setCloudServer`, and the "Server"
section of `ProviderDialog`.

**Why, and what it costs.** The owner asked for Rotaris Cloud to be enabled now the backend is deployed, and for a custom
URL so the app can also authenticate against the development backend or one running locally. What it costs: a user can
point the sign-in at any server they name, so the only protection is that the issuer's discovery document must name the
issuer it was fetched for (REQ-PROVIDER-038); the production redirect for the loopback client is the backend's
configuration, not this product's.

> **Narrows:** REQ-PROVIDER-005, REQ-PROVIDER-037, REQ-PROVIDER-043
> **Extends:** REQ-PROVIDER-006, REQ-PROVIDER-117

*Raised by the owner, 2026-11-22; logged as [R-122](../requests.md#r-122).*
