# Live-run autopsy — origin/main `c2fdd6a`, default pack (the self-hosted endpoint, `qwen3.8-flash-next`, unmetered) — Launch-only logs — sign-in and shell (no session)

Part 14 of 18 of [the autopsy](../live-c2fdd6a-default-autopsy.md), which indexes every part.

## Launch-only logs — sign-in and shell (no session)

- **sign-in.** The starter `agents.yaml` was written at the open, and sign-in.png's notice reads "Added …; discovered 1
  model." (the endpoint's display name elided). The provider list follows REQ-PROVIDER-140's order by id (`claude-code`, `codex`, `concrete-cloud`, `copilot`,
  `deepseek`, `openai-compatible`). The background setup was cut at the quit during `index` ("the run is cancelled and
  nothing is recorded for it", then "→ failure — … the run host exited before the setup finished", both `info`); the next
  launch found it pending and completed it. Unchanged since `1763f7f`.
- **shell.** Overview lists 4 sessions, with duration labels 3:18, 1:08, 2:13 and 0:15. The repository card is as OQ-201
  ruled.

---
