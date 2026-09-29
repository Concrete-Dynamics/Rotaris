## The status strip reads `mode: ask` whenever no session is focused

With no session focused, the status strip's permission item falls back to the literal `ask`, whatever preset is
configured or in force. In the live run it read "no session · mode: ask" while the workspace's configuration set
`runtime.permission_mode: autonomous` and a session was executing autonomously. The strip is a permanent safety
indicator, and it understated the mode.

Live-run finding: L7 (live runs of 2026-09-29)

## Specs

- `REQ-TOOLS-184`: the strip shows `mode: <preset>` permanently; the preset shown is not the one configured.

## Evidence

- Pack `.live-run/runs/2026-09-29T02-41-56-779Z/` (the sweep worktree; git-ignored): `shell/shell.png`, `requirements/requirements.png` and `requirements.early.png` read "no session · mode: ask";
  `agents.yaml` sets `runtime.permission_mode: autonomous`; session `360c8ac1` ran autonomous.

## Relevant files

- `apps/desktop/src/renderer/main.tsx:1181` — `` `mode: ${session?.permissionMode ?? 'ask'}` ``.
- `apps/desktop/src/renderer/main.tsx:1035` — the configured preset, read only for the launch dialog.
