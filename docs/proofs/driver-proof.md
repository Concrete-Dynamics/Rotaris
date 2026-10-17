# `driver-proof`

What this proof measures and re-verifies. The [proof registry](README.md) carries its area, prerequisites,
platforms, flags and neighbours; the script is [`apps/desktop/scripts/driver-proof.mjs`](../../apps/desktop/scripts/driver-proof.mjs).

The driver seam `pnpm app:drive` depends on — and that its `quit` brings a live run to rest, its shot straight after a navigation shows the new view, and it answers an approval in its dialog and probes a persona window; scenario 13c holds two main windows on two workspaces and asserts that a persona window's `config.read` and a terminal window's `session.list` answer for the main window that owns them, not the active one (REQ-MONITOR-069, REQ-STARTUP-163; `docs/defects/fixed/a-persona-windows-commands-answer-for-the-active-main-window-not-its-owner.md`); since 2026-10-07 launch 13d quits while a foreground `terminal` call runs and reads its record `interrupted`, with no exit code and no issue (PD-TOOLS-013; `docs/defects/fixed/a-foreground-terminal-call-the-run-cancels-reads-as-a-timeout.md`)
