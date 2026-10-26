# Live-run autopsy — origin/main `c2fdd6a`, default pack (the self-hosted endpoint, `qwen3.8-flash-next`, unmetered) — Unverified (no finding drawn)

Part 17 of 18 of [the autopsy](../live-c2fdd6a-default-autopsy.md), which indexes every part.

## Unverified (no finding drawn)

- **OQ-116 mid-pass.** The pack holds no reading of the persisted session total during a pass. The end-of-run counters
  agree, but whether the displayed total tracked completed calls mid-pass is not shown.
- **REQ-NOTIFY-031's notice names the session by its identifier.** requirements.png reads "Session
  bef9de1f-36aa-4b85-8b54-eedea1e140d1 completed". The requirement says only "naming that session", while the session
  list names it by its prompt. Not judged a defect.
- **The setup cut at quit logs "→ failure"** right after "nothing is recorded for it" (sign-in, `info`). Nothing was
  recorded, and the next launch ran it. Unchanged since `1763f7f`.
- **Launch-time reads.** Each launch logs "prompt roots: 0 file(s)" two or three times, 60 to 700 ms apart. These are
  separate reads, not a double sink. Noise at `info`.
