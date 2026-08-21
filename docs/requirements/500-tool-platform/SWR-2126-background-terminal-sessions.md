---
req-id: SWR-2126
status: approved
trace: required
test: required
type: technical
derived-from: SWR-500
title: "Background terminal session registry"
epic: SWR-500
date: 2026-07-23
---

# SWR-2126 — Background terminal session registry

The terminal tool (SWR-500) lets an agent start a shell command as a detached
background session instead of blocking on it, then poll, feed input to, list,
or kill it later. `TerminalSessionRegistry` and `TerminalBgSession`
(`src/rotaris_core/tools/terminal_session.py`) own the process pool that makes
this possible, and `HardenedTerminalAction`'s `background` / `session_id` /
`session_action` fields (`src/rotaris_core/tools/terminal.py`) are the tool-call
surface for it. This is infrastructure the terminal tool depends on; it
carries no product behavior beyond what SWR-500 already promises.

## Acceptance criteria

- A background session can be spawned, queried, listed, killed, and sent
  input by session ID; unknown session IDs raise a clear error.
- The registry enforces a maximum concurrent session count and per-session
  default timeout, and can clean up/kill all sessions it owns.
- The `HardenedTerminalAction` schema exposes `background`, `session_id`, and
  `session_action` fields, and the executor dispatches background actions to
  the registry (spawn, list, query, kill, send-input) while rejecting
  incompatible combinations (e.g. `background=True` with `is_input=True` or
  `reset=True`).
- Observations report session status/exit-code fields and render an active
  sessions table when listing.

Derived from: [SWR-500 — Tool Platform & Integrations](../500-tool-platform.md)

Epic: [Tool Platform & Integrations](../500-tool-platform.md)
