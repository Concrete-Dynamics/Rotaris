# ADR-0002 — Process topology — Alternatives considered

Part 2 of 11 of [ADR-0002](../0002-process-topology.md), which indexes every part.

## Alternatives considered

**A — Everything in the Electron main process, heavy work on worker threads.** Cheapest. The session
lock, the run registry, the quit choreography (`REQ-MONITOR-131`, `REQ-MONITOR-255`) and window
lifecycle are all local calls, and `REQ-SESSION-068`'s synchronous flush is trivially available.
Against: the same process serves every renderer's IPC. A durable write per event (`REQ-EVENTS-029`),
a 5.0 s sandbox trial, a PTY read pump per live session, and a runaway project regex all land on the
loop that must answer a gesture in 100 ms. Worker threads mitigate the CPU case but keep one crash
domain: a fault in the PTY binding, or in the unconfined plugin code `REQ-TOOLS-163` mandates, takes
every window with it.

*This alternative got materially cheaper under SR-4 and is still refused.* The version of it argued a
day earlier was carrying a whole-file rewrite of a 5,000-row `state/ui_transcript.json`
(`REQ-SESSION-192`), a Windows rename-retry ladder (`REQ-SESSION-033`) and a debounced whole-document
save on main's loop. SR-4 removes all three: a row is written individually and a durable commit is
cheap. What is left standing against A is not I/O cost at all — it is the crash domain, the native
PTY binding, the unconfined plugin, and the 5.0 s trial. Those are the reasons that were always the
strong ones, and they are untouched.

**B — One `utilityProcess` per run.** Best isolation; `REQ-ORCH-151`'s per-session scoping becomes
structural rather than disciplinary and a crash costs one run. Against: `REQ-SANDBOX-067`'s
once-per-process, application-lifetime availability cache would become per-run — either a 5 s cost per
launch or a verdict that can differ between two live runs, which `REQ-SANDBOX-096` forbids. It also
contradicts the plain reading of `REQ-TOOLS-089` and `REQ-SANDBOX-038`, and turns the run registry
(ADR-0013) and "ask every handle to stop before waiting on any" (`REQ-MONITOR-255`) into a distributed
protocol rather than local calls.

**C — Four process kinds.** Chosen; described below.
