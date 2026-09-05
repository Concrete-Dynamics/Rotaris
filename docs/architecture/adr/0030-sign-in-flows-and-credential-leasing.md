# ADR-0030 — Sign-in flows, the loopback listener and credential leasing

- **Status:** proposed
- **Date:** 2026-08-31
- **Origin:** MODEL (ADR-MODEL-05)
- **Depends on:** ADR-0002, ADR-0007, ADR-0029

## Context

`REQ-PROVIDER-008`, `REQ-PROVIDER-148` and `REQ-PROVIDER-009`: exactly three sign-in methods with a
closed machine-readable vocabulary — `device-code`, `browser-pkce`, `api-key` — one label each, used
identically on every surface; a provider that resolves to no method has neither token nor label.

`REQ-PROVIDER-029`, `REQ-PROVIDER-030` and `REQ-PROVIDER-039`: the application runs a **local HTTP
listener**. For one provider it binds loopback on a build-declared ordered port list, shipped as
`1455, 1457`, tried in order and **never any other port**, at path `/auth/callback`; every listed port
busy fails the sign-in naming the ports tried. For the hosted provider it binds an **ephemeral** port
with path `/callback` and also opens the system browser. Other paths get 404, three distinct HTML
result pages are rendered, and a state mismatch is treated as cross-site request forgery and yields no
code.

`REQ-PROVIDER-031`: however the wait ends — code received, cancelled, or timed out at 300 seconds — the
listener is closed and **its port released before the sign-in call returns**, on every supported
operating system, and a sign-in started immediately afterwards binds the first port successfully. That
is a testable resource-lifetime guarantee, not best-effort cleanup.

`REQ-PROVIDER-116`, `REQ-PROVIDER-023`: cancellation must abort a pending device or PKCE wait **early**
rather than waiting out the multi-minute timeout, and it is raised from a UI control — so
authentication runs off the interface thread.

`REQ-PROVIDER-013`: a caller that cannot wait must get an outcome within 30 seconds; past it the
attempt is failed, nothing is stored, and when the failure happens **before any provider was
contacted** the failure result is the *only* output — no traceback, warning or other diagnostic
anywhere. "No log line at all" is an observable a log-everything-then-return design violates.

`REQ-PROVIDER-037`: the issuer and API base come from layered configuration and are overridden by two
named environment variables **in the environment the application was started with** — so the process
environment must be captured at startup, not read lazily.

`REQ-PROVIDER-131`, `REQ-PROVIDER-107` and `REQ-PROVIDER-140`: no credential value is readable in a log,
in user-visible error text, in a snapshot, in an event stream or in a hook payload, and the display
mask is the only rendering of a stored key any interface shows.

`REQ-PROVIDER-066` to `REQ-PROVIDER-068`: the priming set at run start is the union of the sign-in
providers behind all slot models, all personas and every configured model, primed regardless of which
personas the run uses; within the 300-second refresh margin an **unconditional renew** is performed
rather than a token fetch, because a fetch would hand back a still-valid but nearly expired token;
priming never fails the run; and the run is wrapped in a keep-fresh scope that checks at least every 60
seconds for its whole duration, never renewing credentials with no expiry, not retrying one already
unresolved at run start, and performing **no refresh after the run ends**.
`REQ-PROVIDER-057`, `REQ-PROVIDER-058` and `REQ-PROVIDER-060` require a retrievable per-provider last
error that every success clears — in-process state read by the provider list and the settings surface.

`REQ-PROVIDER-092`: a configured model naming a sign-in provider is dispatched with a credential from
the store, never a static key, and an expired credential is renewed **before the request leaves**.

## Alternatives considered

**A — Flows in the main process; the renderer drives them over IPC and receives only prompts, statuses
and masked values.**

*For:* the loopback listener needs a real HTTP server and deterministic port release, which main has
and a sandboxed renderer does not. `REQ-PROVIDER-037`'s "environment the application was started with"
is naturally main's own environment. It puts the no-credential-in-the-renderer rule on a **process
boundary rather than on a code-review convention**: if no credential value is ever sent over IPC, the
renderer cannot leak one into a developer-tools log or a crash report.
*Against:* every provider-settings interaction becomes an IPC round trip, and the renderer needs a
state model for "in flight" that mirrors main's. `REQ-PROVIDER-141`'s "leaves the window responsive to
input within 100 ms" and "closing while a validation is still running neither loses the window nor
blocks it" then depend on IPC discipline — a real risk, but one a request-id-keyed subscription model
addresses directly.

**B — Flows in a dedicated worker process, with main as a router.**

*For:* keeps main free of long-lived HTTP servers and provider I/O; a crash in a provider integration
does not take the window down.
*Against:* the listener's hard resource-lifetime guarantee is easier to reason about in one long-lived
process than across one that may be recycled. It puts a second process between the user's Cancel click
and the abort signal, which `REQ-PROVIDER-116` makes latency-sensitive. And because runs already
execute in the run host, credential access would then be spread across three processes contending on
the same cross-process lock.

**C — Credential reads in whichever process needs them, coordinated only by the file lock.**

*For:* no IPC on the hot path; `REQ-PROVIDER-152` already makes this safe against corruption and is
explicitly designed for multiple instances.
*Against:* safe against corruption is not the same as correct. `REQ-PROVIDER-057`'s per-provider last
error and `REQ-PROVIDER-068`'s keep-fresh scope are **in-process state**; two processes refreshing the
same credential independently would both renew, both write, and disagree about the last error, and
`REQ-PROVIDER-140`'s provider list would show whichever process's view the window happens to hold.

## Decision

**Alternative A, with a narrow exception.**

Authentication flows, the loopback listener, browser opening, the credential store and the keep-fresh
scope all live in **main**. The renderer receives prompts, statuses, masked values and outcomes, and
**never a credential value**.

**The exception: the run host is leased a resolved bearer.** It must be able to obtain a token for a
request without a round trip per call, so main leases the resolved bearer for the duration of a run and
**re-leases it on renewal**, rather than the run host reading the store. That keeps the keep-fresh scope
in one place and the last-error record single-valued, while satisfying `REQ-PROVIDER-092`'s "no request
carries a credential the store already knows to be expired".

The listener is torn down in a guard the sign-in call **awaits**, because `REQ-PROVIDER-031` makes "the
call always returns rather than hanging" an explicit obligation. A test that starts two sign-ins back
to back and asserts the second binds the first port belongs in the conformance suite.

`REQ-PROVIDER-013`'s no-diagnostic path is implemented as a distinct branch that constructs the failure
result and **returns without touching the logger or the last-error record**. Every other failure path
records a last error; this one must not (OQ-20).

## Consequences accepted

1. **A leased token exists in a second process's memory for the life of a run.** That is unavoidable
   once runs execute out of process; it is bounded by the run and never written to disk by the run
   host. The redaction pass of ADR-0007 applies to everything the run host logs or emits.
2. **IPC shapes for this area must be defined as never carrying an access token, a refresh token or a
   raw secret value.** That is testable: a schema assertion over the IPC surface, and it belongs in
   ADR-0044's contract.
3. The loopback listener is a real HTTP server in main. It must bind loopback only, serve only the two
   callback paths, and be torn down in a guard the call awaits.
4. `REQ-PROVIDER-032`'s account-id derivation decodes a token payload **without verifying it** — a
   deliberate, narrow capability that must be named as such in the code so it is not mistaken for token
   validation.

## Revisit if

A conclusion is reached that runs must be able to start with the window closed or main unavailable, in
which case credential leasing needs a different owner; or the product gains a second application
instance model in which two mains contend for the keep-fresh role (OQ-3).

## First execution — 2026-09-05, the API-key flow and the lease (Part K)

*Recorded under GD-10. Found nothing in the leasing; the run host gained an ask path it did not have.*

**Built and run** (`packages/providers/src/signin.ts`, `apps/desktop/src/main/index.ts`, `run-host/index.ts`): the
credential store, the provider service and every provider command live in **main**; the renderer receives rows,
statuses, the display mask and outcomes, and a contracts test walks every shape that reaches a renderer and refuses
a field named like a credential (consequence 2 — `maskedKey` failed it and is `displayMask`). The **API-key
authenticator** for instances and `deepseek`: header validation (062), discovery, the credential persisted only
after discovery succeeded (133), the snapshot upserted with the rollback of 054, the confirmation of 052 and the
zero-model choice of 097 asked in place; replace-key (108), validate, sign-out (102/060), delete (055), refresh
(147), the health reduction to REQ-NOTIFY-200's states (118), the list (140). **The lease:** `session.start` in the
run host resolves the configuration once to learn the providers it names (REQ-PROVIDER-066), asks main
`credentials.lease` on the same envelope the workspace service already used for its asks, main answers the bearers
with REQ-PROVIDER-067's priming report, the run's resolvers read them per request, and an unresolved entry
provider refuses the run before a session exists with REQ-WORKSPACE-137's second refusal. **Nothing here has an
expiry yet** — API keys carry `0` — so the keep-fresh scope has nothing to renew and the renewal-and-re-lease path
of the decision is written for a credential that does not exist in this build; stated rather than simulated.

**What was not built, said so:** the loopback listener, browser opening, device-code and PKCE flows, the 30-second
non-interactive attempt and its no-diagnostic branch (OQ-20), the account-id derivation of consequence 4, the
bridge artifacts. **Readings recorded:** the pasted key travels inward on one command (`provider.signIn`) and
nowhere else; a leased bearer exists in the run host's memory for the run (consequence 1) and is redacted by the
adapter's one decorated fetch before any log; a second `session.start` for the same workspace re-leases.

**Found on the second sign-in of the slice (2026-09-05):** the catalog OpenRouter serves is public, so the
API-key flow's "validated by discovery" stored a value of another vendor's shape as authenticated
(REQ-PROVIDER-133's guarantee rests on an endpoint property the requirement does not state — OQ-50). The flow
now repeats the discovery without the key and, where that also succeeds, completes the sign-in saying the key
could not be validated, with the provider's health left unchecked and the notice a warning.
