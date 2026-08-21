---
req-id: SWR-2704
status: approved
trace: required
test: required
title: "Hook timeouts & failure handling"
epic: SWR-2700
priority: P1
date: 2026-08-03
source: docs/research/marktanalyse-agentic-harnesses-2026-08.md
---

# SWR-2704 — Hook timeouts & failure handling

Hook execution MUST be bounded and failure-isolated so a broken hook cannot
hang or crash a session.

- Every hook has a timeout (per-entry config, default 60 s). On timeout the
  hook process is terminated; for `pre_tool` hooks the timeout resolves as
  "proceed with warning" unless the entry is marked `required: true`, in which
  case it resolves as block.
- A **spawn failure** resolves the same way as a timeout, for the same reason:
  the hook reached no verdict at all, and a `required: true` `pre_tool` hook
  without a verdict fails closed. `required` does **not** mean "any failure
  blocks": a hook that ran and exited non-zero for a reason other than the
  documented exit 2 *did* reach the tool, so it produces a non-blocking warning
  and the call proceeds, exactly as for a non-required hook.
- Hook crashes (non-zero unexpected exits, spawn failures) are surfaced as
  user-visible warnings (`notify` severity rules) and recorded in diagnostics;
  they never raise into the loop.
- Hook stdout/stderr is captured and size-bounded in diagnostics.
- Repeated failures of the same hook within a session (default: 3) disable it
  for the remainder of the session with a visible notice.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Timeout and spawn-failure resolution matrix; failure counting; disable threshold; bounded stdout/stderr capture | Hook runner API | `tests/unit/test_hook_runner.py` |
| Integration | Hanging hook times out without stalling the iteration; crashing hook warns and continues; the warning reaches the desktop | Hook runner in loop context | `tests/unit/test_lifecycle_hooks.py`, `apps/rotaris/tests/test_desktop_hook_wiring.py`, `apps/rotaris/tests/test_hook_trust_ui.py` |
| User-flow E2E | A run with a deliberately broken hook completes and shows the hook warning | Public product boundary → user-observable result | `tests/integration/test_hooks_user_flow.py` |

Epic: [User-Defined Lifecycle Hooks](../2700-lifecycle-hooks.md)
