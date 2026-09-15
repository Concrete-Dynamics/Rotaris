# Continue run sends no authorization header

Found by hand, 2026-09-14: a "Continue run" on a paused session against OpenRouter failed on the
first model call with `401 {"error":{"message":"No cookie auth credentials found","code":401}}` —
the body OpenRouter answers when the request carries neither a bearer token nor its cookie auth,
i.e. **no `Authorization` header at all**. The run host's own request log line would read
"(no authorization header)".

## What happens

`continueSession` (`packages/engine/src/sessions.ts`, the REQ-SESSION-110 resolution) and `prompt`
(the composer path on a resumed session) both resolve the run's setup through `setupFor` →
`configure` (`apps/desktop/src/run-host/index.ts`), which completes the configuration with
`bearers: leased.get(workspaceRoot) ?? {}`. The `leased` map is populated **only** by
`session.start`'s launch (`leased.set(s.root, bearers)` after `leaseCredentials`). A session
resumed after an application restart (`session.resume` → `session.continue`, or a prompt on the
resumed session) therefore completes with an **empty** bearer map.

`credentialResolver` (`apps/desktop/src/run-host/configuration.ts`) then returns `''` for the
entry model — its `auth_provider` key is absent from the map — and the adapter
(`packages/model/src/ai-sdk-client.ts`) skips the header when the credential is empty
(`if (credential) headers.set('authorization', …)`), sending the request unauthenticated.

Two guards exist and neither covers this path:

- `launchSession` (`apps/desktop/src/run-host/launch.ts`) refuses a run whose entry provider was
  not leased (`session.provider-auth`, REQ-WORKSPACE-137) — but only on `session.start`.
- The `models()` lookup refuses a mid-run switch to an unleased provider — but never reads the
  entry model on the continuation paths.

So a continuation does not re-lease, is not refused, and fails at the provider with a 401 that
reads like a bad key rather than a missing one.

## Specs

- REQ-PROVIDER-066 / REQ-PROVIDER-092 / ADR-0030: a model naming an `auth_provider` authenticates
  with the bearer leased to the run. The requirement does not distinguish a first run from a
  continuation; a continuation that sends no credential contradicts it.
- REQ-WORKSPACE-137: an unauthenticated entry provider refuses the run before it starts. A
  continuation that reaches the provider instead of refusing leaves the guard unenforced on a
  launch path.

## Relevant files

- `packages/engine/src/sessions.ts` — `continueSession`, `prompt`: resolve setup without leasing.
- `apps/desktop/src/run-host/index.ts` — `configure`/`configurationDeps.bearers` read the
  process-lifetime `leased` map; `session.start` is the only writer.
- `apps/desktop/src/run-host/configuration.ts` — `credentialResolver`/`credentialFactory` resolve
  to `''` when the map lacks the key; `configureRun` accepts it.
- `packages/model/src/ai-sdk-client.ts` — `if (credential)` silently drops the header; a
  non-scripted provider going out credential-less is not an error here.

## Repair shape (proposal, not authorised here)

Either the continuation paths ask main for a fresh lease (the run host already holds the `ask`
channel), or they refuse the continuation with `session.provider-auth` when the entry model's
`auth_provider` is absent from the resolved bearer map. The silent `''` credential is the
mechanism that turns the missing lease into an unauthenticated request; surfacing it is the
smaller fix and the honest one.

## Repaired — 2026-09-14

The repair takes the first shape: the three run-launching continuation commands — `session.continue`,
`session.prompt`, `session.planDecision` — re-ask main for the credential lease before the engine
resolves the continuation's setup. `leaseForContinuation` (`apps/desktop/src/run-host/launch.ts`)
captures the current configuration's `authProviders` and entry provider, takes the same bounded
`credentials.lease` ask a launch takes, and the run host publishes the fresh bearers under the
session's workspace root (`sessionRoots`, recorded at `session.start` and `session.resume`, since the
continuation requests carry only a session id). The user notices nothing; a credential resolved per
request now finds its bearer on every launch path. The one refusal is an entry provider main cannot
resolve — lease unanswered included — worded as REQ-WORKSPACE-137's sentence, exactly as a launch
refuses; a configuration that will not load leases nothing and is refused by `setupFor` with its real
report. A session this process never started or resumed leases nothing (no root is known); the
engine's own `not-live` / `no-session` refusals answer it.

The adapter's silent `''` credential (`packages/model/src/ai-sdk-client.ts`,
`if (credential) headers.set(...)`) is left as it is: with the lease repaired, every launch path
carries a bearer, and the scripted dialect legitimately sends none. The regression evidence is in
`apps/desktop/src/run-host/launch.test.ts` (fresh lease published; unresolved entry provider refused;
unanswered lease refused; unloadable configuration leases nothing). The runtime view's run-start
section gained the continuation-lease paragraph in the same commit.
