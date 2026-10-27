# Spike — the run-host → main → renderer double hop — 8. What this harness does **not** model

Part 8 of 9 of [the spike report](../ipc-hop-latency.md), which indexes every part.

## 8. What this harness does **not** model

- **Everything upstream of the publish call.** The database commit `REQ-MONITOR-221` requires before
  publication, the run host's own projection, the 50 ms coalescing tick of `REQ-MONITOR-219`, and the
  model and tool work that produce the row are all outside the measured interval. `REQ-MONITOR-222`
  and `REQ-ORCH-155` both start earlier than `t_send` does. **Every figure here is a lower bound on
  the requirement's own interval.**
- **The renderer is otherwise empty.** No React, no Zustand, no Markdown renderer, no render cache, no
  virtualiser beyond a 40-slot `textContent` recycler, no fonts, no other views. ADR-0051's Markdown
  rendering and ADR-0045's real recycler are additional cost on the same thread and would consume part
  of the margin reported here.
- **The terminal-frame handler does almost nothing.** It stores the payload in a ring buffer. A real
  frame drives a VT emulator and a grid paint (ADR-0021, ADR-0047). The renderer's main thread would
  therefore saturate at a **lower** frame rate than measured, which makes the direct-port isolation
  figures in section 5.2 optimistic. The relay figures are less affected, because the relay's
  bottleneck was measured to be main, not the renderer.
- **One window.** `REQ-MONITOR-243` and `REQ-STARTUP-163` allow one session in several windows, so one
  publication may fan out to several renderers. That multiplies main's per-message relay cost by the
  window count and was not measured.
- **One session publishing.** Concurrent runs (`REQ-TOOLS-089`, `REQ-SANDBOX-038`) each publish on the
  same counter-per-session discipline into the same relay; the aggregate message rate was not measured.
- **No sequence gaps, no reconciles, no refusals.** `refused = 0` everywhere, so ADR-0046's step-0
  refusal path and `REQ-MONITOR-226`'s reconcile were exercised only in the sense that the integer
  check ran and passed. The cost of a reconcile — a whole read plus an index-0 increment over the
  resident window — was not measured.
- **No packaging.** Development mode only. `REQ-STARTUP-013`'s portable artifact and the ASAR read path
  were not exercised; `spike-base` section 5.4 flags separately that the portable stub's own
  extraction is a large fixed cost.
- **One machine, one architecture, no macOS, no Linux, one afternoon.** 46 runs; most conditions have
  1–6 replicates and the replicate spread is printed in every table so it is not hidden. The
  `REQ-ORCH-155` excursion finding rests on 2 anomalous runs out of 6 and should be replicated before
  it is treated as settled.
- **Anti-malware was active and unmeasured**, as were whatever else the machine was doing.

---
