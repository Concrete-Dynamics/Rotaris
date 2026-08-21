---
req-id: SWR-3711
status: approved
trace: required
test: required
type: technical
derived-from: SWR-700
title: "Credential status is classified without an event loop"
epic: SWR-700
date: 2026-08-21
---

# SWR-3711 — Credential status is classified without an event loop

Deciding whether a stored credential is usable is a local judgement. Every
provider makes it from the token set alone: an expiry compared against the
clock, a token shape checked against what the provider issues, a scope list
read back. None of them reaches the network for it.

That judgement is asked for at LLM-construction time, and LLM construction is
synchronous while the hosts that drive it are not — the desktop app runs its
worker under `asyncio.run`, so a loop is always running when a model is built.
Expressing a pure comparison as a coroutine therefore forced every model build
to hand a coroutine to a worker thread carrying its own private event loop, and
a handoff that fails — the thread pool refuses new work once the interpreter is
shutting down — abandons the coroutine unstarted. Python then reports
`coroutine ... was never awaited` at whatever unrelated line the collector
happened to reach, while the exception that caused it is swallowed by the
caller's error handling. The symptom points away from the cause.

Rotaris MUST therefore be able to classify a provider's stored credentials
synchronously, and MUST NOT lose the reason a credential could not be resolved.

Each `AuthProvider` exposes `status(token_set)`, the loop-free classification;
`check_status` remains its awaitable face and delegates to it, so async callers
are unchanged. `AuthManager.peek_status(provider_id)` is the same mirror one
level up: resolve the provider, load the token set, classify. The config loader
reads it, so an authenticated model is built with one file read and no loop.

Refreshing a credential is real network I/O and stays asynchronous. The single
supported way for synchronous code to drive it is `run_auth_coro`, which runs
the coroutine on the current thread when no loop is running and on a private
loop in a worker thread when one is, and which closes the coroutine if either
handoff fails before anything awaits it — so the caller sees the real error.

## Acceptance criteria

- Every `AuthProvider` implementation classifies a token set through `status`
  without I/O, and its `check_status` returns the same verdict.
- `AuthManager.peek_status` returns `UNAUTHENTICATED` for an unknown provider or
  one with no stored tokens, and otherwise the provider's own verdict.
- Building an LLM for a model whose auth provider is authenticated completes
  without invoking `run_auth_coro`, from inside a running event loop.
- `run_auth_coro` returns the coroutine's value whether or not a loop is already
  running, and when the handoff fails it raises that failure and leaves no
  un-awaited coroutine behind for the collector to report.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | A stored credential is classified the same way with and without a loop, for every provider Rotaris ships | `AuthProvider.status` / `check_status` | `tests/unit/test_auth_manager.py` |
| Unit | A failed handoff surfaces its own error instead of a stray "never awaited" warning | `run_auth_coro` with a refusing thread pool | `tests/unit/test_auth_manager.py` |
| Integration | A model on an authenticated provider is built from inside a running loop and never leaves it | `load_llm_for_model` → `_resolve_auth_provider_token` | `tests/unit/test_config_loader.py` |

Derived from: [SWR-700 — Provider Integration & Authentication](../700-providers-auth.md)

Epic: [Provider Integration & Authentication](../700-providers-auth.md)
