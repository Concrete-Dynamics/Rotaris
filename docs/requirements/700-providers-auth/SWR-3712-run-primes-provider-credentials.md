---
req-id: SWR-3712
status: approved
trace: required
test: required
type: technical
derived-from: SWR-700
title: "A run resolves its provider credentials up front and keeps them staged"
epic: SWR-700
date: 2026-08-21
---

# SWR-3712 — A run resolves its provider credentials up front and keeps them staged

A run builds many models — the intent classifier, the entry persona, every
delegated persona, the summary agent, the improvement collector — and each build
resolved its provider's credential on its own. Whichever build first met an
expired token paid for the refresh, on whatever thread it happened to be on, and
a refresh that failed there surfaced as that component failing rather than as an
authentication problem.

Some credentials also expire faster than a run lasts. Copilot session bearers do,
and Rotaris hands LiteLLM those bearers through staged files while disabling
LiteLLM's own refresher (SWR-701) — so nothing but Rotaris can keep them
current, and Rotaris only re-staged them when it happened to build another
model.

A run MUST therefore resolve the credentials of every provider its configuration
references before it builds its first model, and MUST keep them usable for as
long as it runs.

Priming walks the distinct auth providers of the configured models and startup
slots, classifies each one, and refreshes the expired ones on the run's own
event loop — no thread, no private loop. It is bound to the workspace, so a
refresh re-stages the provider's bridge artifacts as part of persisting the new
token. Priming never raises: a provider that cannot be resolved is reported and
logged, and the per-build resolution still covers it, so a broken credential for
one provider cannot stop a run that does not use it.

While the run continues, a companion task re-primes any credential approaching
expiry, keeping staged files ahead of the deadline. It never raises into the
run and stops with it.

## Acceptance criteria

- A run primes every distinct auth provider of its configuration once, before
  its first model is built.
- Priming refreshes credentials it finds expired, and re-stages the bridge
  artifacts of the providers that need them.
- A provider that cannot be primed is reported and logged, and does not prevent
  the run from starting or the remaining providers from being primed.
- A credential that would expire mid-run is refreshed before its deadline while
  the run is still going.
- The refresher stops when the run does, and cancelling the run leaves no task
  running behind it.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | A configuration's providers are primed once, expired ones refreshed, and an unresolvable one reported without raising | `prime_auth_providers` | `tests/unit/auth/test_session_auth.py` |
| Unit | A credential expiring during a run is refreshed before its deadline, and the refresher stops with the run | `keep_auth_fresh` | `tests/unit/auth/test_session_auth.py` |
| Integration | A run resolves its credentials before classifying intent, so an authentication failure is reported as one | `_run_task` → `keep_auth_fresh` | `tests/unit/test_background_priming.py` |

Derived from: [SWR-700 — Provider Integration & Authentication](../700-providers-auth.md)

Epic: [Provider Integration & Authentication](../700-providers-auth.md)
