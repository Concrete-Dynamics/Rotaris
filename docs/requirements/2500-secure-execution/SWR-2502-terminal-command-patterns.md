---
req-id: SWR-2502
status: approved
trace: required
test: required
title: "Terminal command permission patterns"
epic: SWR-2500
priority: P0
date: 2026-08-03
source: docs/research/marktanalyse-agentic-harnesses-2026-08.md
---

# SWR-2502 — Terminal command permission patterns

The permission policy (SWR-2501) MUST support command-level rules for the
terminal tool: ordered lists of allow/ask/deny patterns matched against the
command line before execution.

- Patterns match on the command head and argument prefixes (e.g.
  `git status`, `uv run pytest *`, `rm -rf *`), not on raw substring search.
- Rule order is deterministic: first matching rule wins; the mode preset
  (SWR-2503) supplies the default when no rule matches.
- Compound shell constructs (`&&`, `;`, `|`, command substitution) MUST be
  decomposed or escalated: if any segment cannot be confidently matched, the
  decision for the whole command is at least `ask` (never silently `allow`).
- A starter deny/ask set for destructive operations (recursive delete, force
  push, `sudo`, package publish) ships as a documented default.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Pattern matching precedence, compound-command decomposition, escalation on unmatchable segments | Pattern matcher API | `tests/unit/test_command_patterns.py` |
| Integration | Terminal tool consults patterns before spawn; blocked command never reaches the shell | Terminal tool executor | `tests/integration/test_permission_dispatch.py` |
| User-flow E2E | Covered by the SWR-2501 E2E flow (deny rule on a terminal command observable in transcript) | Public product boundary → user-observable result | shared with SWR-2501 |

## Implementation note

`src/rotaris_core/permissions/command_patterns.py` fills the `PermissionRule.matcher`
seam SWR-2501 left open; the engine's rule loop is unchanged. The starter set
(`DESTRUCTIVE_COMMAND_RULES`) is exported as a documented default but is **not**
added to `ALLOW_ALL_POLICY` — SWR-2503 composes it into the mode presets, so
runtime behaviour is unchanged until then.

Epic: [Secure Execution: Permissions & Sandbox](../2500-secure-execution.md)
