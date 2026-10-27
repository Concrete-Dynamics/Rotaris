# ADR-0010 — Three channels between the run host and its surfaces — Alternatives considered

Part 2 of 10 of [ADR-0010](../0010-three-channels-between-run-and-surfaces.md), which indexes every part.

## Alternatives considered

**A — One channel: publish wire events and project everything from them.** Fails on evidence. The
catalogue is closed at 23 types and `REQ-EVENTS-177` explicitly refuses to add a type for a decision
that *is* durably recorded, so the event stream is provably not a complete description of session state.
Meanwhile `REQ-MONITOR-217` requires the whole-session update to carry every displayable field and
`REQ-SESSION-161` requires everything outside the transcript to come from a whole-session read. One
event channel cannot satisfy both.

**B — Two channels: fold the wire-event bus and the view channel together.** Attractive and wrong for a
specific reason: `REQ-EVENTS-165` says a slow consumer delays the run; `REQ-MONITOR-232` says no view
may slow the run at all. One channel cannot have both properties, and the specification is deliberate
about each — the event bus is what makes persist-before-forward and strict ordering checkable, the view
channel is what makes a broken view harmless.

**C — Three channels.** Chosen.

**D — A fourth transport for a session running elsewhere.** The foreign half this record previously
carried: a surface following a session over the filesystem, fed by the tail of `transcript.row` events.
**Withdrawn by SR-2 and removed.** `REQ-SESSION-159` now fixes two conditions and no third and states
that "the filesystem is never a channel between a run and a surface: no surface follows a session by
reading its record or its files". `REQ-MONITOR-243` says the same from this domain: a live run reaches
every surface over the two publication channels "and by no other route", and "there is consequently no
second way to observe a run". The reason that requirement gave for sharing one derivation is **not**
withdrawn with the mechanism — it now holds by construction, because only one derivation of a transcript
remains.

**E — Anchoring persist-before-publish on the session record rather than on the event history.** Under
the file design the two candidate anchors were different instants and one had a ten-second window in
front of it, so the choice mattered. It no longer does: the transcript row and its `transcript.row`
event commit in **one** transaction (ADR-0008, `REQ-EVENTS-072`), and no save is deferred
(`REQ-SESSION-067`), so both candidate anchors are the same instant. Choosing the transaction rather
than either record is what makes that true rather than coincidental, and it is why this record does not
have to be reopened if the two records are ever written by different code.

**F — A direct `MessagePort` from the run host to the renderer, replacing main's relay for the two
update channels.** ADR-0002 names this as its remedy and ADR-0044 consequence 3 names the trigger: "if
measurement shows the double hop threatens the budgets". **The measurement has been taken and the answer
is that it does not**, so the remedy is not adopted — but the alternative is recorded with its figures,
because it is measurably better and because the reason it is not needed is a *ruling* rather than a
measurement.

The port is 1.9×–2.1× faster on a transcript increment (p95 0.583 ms against 1.133 ms at zero rows;
0.624 ms against 1.291 ms at 10,000), 3.7× on a whole-session update (1.612 ms against 5.951 ms), and
26.9× on that update's worst observed sample (4.650 ms against 124.983 ms). It was verified to work with
`sandbox: true`, `contextIsolation: true` and `nodeIntegration: false` intact — the port reaches the main
world through the preload's `window.postMessage` transfer, because `contextBridge` cannot carry a
`MessagePort` — so none of ADR-0002's renderer posture is given up to get it
(`../spikes/ipc-hop-latency.md`, §2, §6).

**What decides it is SR-8.** The one budget the relay failed was `REQ-ORCH-155` read as an absolute
bound on every update: 24 of 9,000 relay samples exceeded 100 ms, worst 124.983 ms unloaded, against
0 of 6,000 on the port. SR-8 ruled that reading incoherent — no userspace program on a preemptive
operating system can bound every sample — and `REQ-ORCH-155` has since been amended to state the 95th
percentile explicitly and to add that "a single update that took longer is not by itself
non-conformant". At the percentile the relay measures **5.951 ms unloaded and 7.807 ms under 65.5 MB/s
of terminal frames**, 8× to 40× inside the budget. The alternative therefore stops being required and
becomes a lever held in reserve, which is exactly where ADR-0044 consequence 3 puts it.
