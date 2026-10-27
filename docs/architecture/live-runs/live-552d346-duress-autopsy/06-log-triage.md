# Live-run autopsy — origin/main `552d346`, final duress pack (the self-hosted endpoint, `qwen3.8-flash-next`, unmetered) — Log triage

Part 6 of 9 of [the autopsy](../live-552d346-duress-autopsy.md), which indexes every part.

## Log triage

- `duress/app.log` (314 lines): 305 `info` main lines, of which 199 are "model request POST" and 29 are REQ-MONITOR-118's
  `waiting_on_tools` for the waiting orchestrator (91–1,173 s, info, as specified). No `warn`, no `error` from the app, no double
  emission, no child stderr. Chromium noise per launch: 7 D-Bus lines and one `LatencyInfo vector size … is too big`.
- `sign-in/app.log`: the three known `info` quit lines and one `atom_cache` line.
- `session.log`: INFO only (coordinator-only tool removals, `waiting_on_tools`, "run ended completed").
