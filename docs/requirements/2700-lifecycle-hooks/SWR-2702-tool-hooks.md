---
req-id: SWR-2702
status: approved
trace: required
test: required
title: "Pre/post tool hooks with exit-code semantics"
epic: SWR-2700
priority: P1
date: 2026-08-03
source: docs/research/marktanalyse-agentic-harnesses-2026-08.md
---

# SWR-2702 — Pre/post tool hooks with exit-code semantics

Configured hooks (SWR-2701) MUST run before (`pre_tool`) and after
(`post_tool`) matching tool calls, with deterministic exit-code semantics.

- The hook process receives the call context (tool name, arguments, session
  id, workspace path) as JSON on stdin; secrets are structurally redacted.
- `pre_tool` semantics: exit 0 → proceed; exit 2 → block the call and feed the
  hook's stderr to the agent as the tool result (same refusal shape as a
  policy `deny`, SWR-2501); other exit codes → non-blocking warning, call
  proceeds.
- `post_tool` semantics: exit 0 → nothing; exit 2 → hook stderr is injected as
  feedback into the conversation (steering-injection mechanism); other exit
  codes → non-blocking warning.
- The hook *process* executes on the host, outside the agent's permission policy
  — it is user code, not an agent action — but its invocations are audit-logged
  (SWR-2506). This does **not** mean a hook can guard dangerous commands. Hooks
  sit *inside* the permission engine's allow branch, so a `pre_tool` hook only
  ever sees calls the policy already allowed, and a `post_tool` hook only ever
  sees calls that actually executed. Permission-first is deliberate: a denied
  call never happens, so it is not an event the user asked to hook, and firing a
  hook for a call that will not happen would have the hook observe — and act on
  — something that does not exist. The dangerous commands a hook might be
  imagined to catch are already denied by the built-in SWR-2502 rules that ship
  in every preset including `autonomous` (`rm -rf`, `sudo`, `git push --force`,
  `npm publish`, pipe-to-shell).
- Matcher wording: "tool name / command pattern" is precise for `terminal`, but
  for `write_file` it reads as more than it is. `PermissionRequest.command` is
  filled from `arguments["command"]`, and `WriteFileAction.command` is the
  operation verb (`create`/`edit`/`overwrite`/`insert`/`undo`), not a shell
  command line — so a matcher `create` matches *every* `write_file` create,
  whatever the path. This is pre-existing SWR-2505 request-shaping behaviour,
  documented here rather than changed.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Exit-code mapping; stdin payload construction; secret redaction | Hook runner API | `tests/unit/test_hook_runner.py`, `tests/unit/test_hook_payload.py` |
| Integration | pre_tool exit 2 blocks the call and returns the hook's refusal; post_tool exit 2 injects feedback; hooks run only inside the permission allow branch | Tool dispatch seam | `tests/unit/test_tool_hook_dispatch.py`, `tests/integration/test_tool_hooks_flow.py` |
| User-flow E2E | A run whose hooks stop one tool call, report on another, and survive their own failure | Public product boundary → user-observable result | `tests/integration/test_hooks_user_flow.py` |

Epic: [User-Defined Lifecycle Hooks](../2700-lifecycle-hooks.md)
