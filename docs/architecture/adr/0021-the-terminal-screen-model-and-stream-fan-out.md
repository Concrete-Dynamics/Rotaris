# ADR-0021 — The terminal screen model and the fan-out of one stream to three views

- **Status:** proposed
- **Date:** 2026-08-31
- **Revised:** 2026-09-01, to carry the `ipc-hop-latency` spike. **This record's frame-rate cap has
  become load-bearing for `REQ-MONITOR-222` and is no longer a display concern**, because the mechanism
  ADR-0044 relied on for the same protection was measured and does not work. Nothing about the screen
  model, the placement of the authoritative emulator, or the frame vocabulary changes.
- **Origin:** EXEC (ADR-EXEC-07), UI (ADR-UI-10)
- **Depends on:** ADR-0002, ADR-0010, ADR-0020, ADR-0044
- **Depended on by `REQ-MONITOR-222`** — see *The cap is load-bearing*. ADR-0044 is owned elsewhere and
  is cited here, not amended here.
- **Contains an unresolved conflict between slices — the two proposals put the authoritative screen in
  different processes.** The spike does not bear on that conflict either way.
- **Names a conflict between two live requirements** — `REQ-TOOLS-126`'s 100 ms default sampling period
  against `REQ-SHELL-166`'s 100 ms key-press-to-painted-frame echo budget (OQ-38).

## Parts

Since 2026-10-26 the rest of this document is in [`0021-the-terminal-screen-model-and-stream-fan-out/`](0021-the-terminal-screen-model-and-stream-fan-out/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part.

| Part | What it holds |
|---|---|
| [01](0021-the-terminal-screen-model-and-stream-fan-out/01-context.md) | Context |
| [02](0021-the-terminal-screen-model-and-stream-fan-out/02-the-conflict.md) | The conflict |
| [03](0021-the-terminal-screen-model-and-stream-fan-out/03-decision.md) | Decision |
| [04](0021-the-terminal-screen-model-and-stream-fan-out/04-the-cap-is-load-bearing.md) | The cap is load-bearing |
| [05](0021-the-terminal-screen-model-and-stream-fan-out/05-open-question-carried-not-decided-decided-2026.md) | Open question carried, not decided — decided 2026-09-11; kept as written, see the ruling section below |
| [06](0021-the-terminal-screen-model-and-stream-fan-out/06-consequences-accepted.md) | Consequences accepted |
| [07](0021-the-terminal-screen-model-and-stream-fan-out/07-revisit-if.md) | Revisit if |
| [08](0021-the-terminal-screen-model-and-stream-fan-out/08-first-execution-2026-09-09-part-al.md) | First execution — 2026-09-09 (Part AL) |
| [09](0021-the-terminal-screen-model-and-stream-fan-out/09-second-execution-2026-09-09-part-al.md) | Second execution — 2026-09-09 (Part AL′) |
| [10](0021-the-terminal-screen-model-and-stream-fan-out/10-third-execution-2026-09-11-part-t.md) | Third execution — 2026-09-11 (Part T″) |
| [11](0021-the-terminal-screen-model-and-stream-fan-out/11-the-owners-ruling-2026-09-11-oq-5-oq-38-and-oq.md) | The owner's ruling — 2026-09-11: OQ-5, OQ-38 and OQ-55 closed, and one reading of this record narrowed |
| [12](0021-the-terminal-screen-model-and-stream-fan-out/12-the-real-pty-half-on-a-posix-shell-2026-09-28-r.md) | The real-PTY half on a POSIX shell — 2026-09-28 (R-062) |
| [13](0021-the-terminal-screen-model-and-stream-fan-out/13-the-stream-proofs-on-windows-11-arm64-2026-10-15.md) | The stream proofs on Windows 11 ARM64 — 2026-10-15 |
