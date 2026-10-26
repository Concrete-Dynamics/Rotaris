# ADR-0002 — Process topology — Unresolved conflict between slices

Part 5 of 11 of [ADR-0002](../0002-process-topology.md), which indexes every part.

## Unresolved conflict between slices

**The workspace service.** No slice other than DATA proposes it. Adopting it adds a fourth process
kind that RUNTIME, EXEC, MODEL and UI did not budget for, and puts one more boundary in front of the
board projection — `REQ-TRACE-239`'s 100 ms budget is measured *after* the engine answers, so the
crossing is real cost that no requirement covers. The alternative, folding the workspace service into
the run host, is cheaper by one process and defensible, at the cost of running project-supplied
regular expressions inside the process that holds every session lock. **Recommendation: keep the
workspace service and measure the projection crossing before implementation begins.** See open
question OQ-2.

*The per-run-process conflict that stood here is no longer unresolved.* DATA's "per-run runtime
processes remain separate and short-lived" lost to EXEC's and RUNTIME's reading on
`REQ-SANDBOX-067`, and the cost of that reading — a run-host crash losing every in-flight run — has
now been put to the owner and accepted. It is recorded as consequence 1 rather than as an open
disagreement. DATA's position is not deleted: it is alternative B above, and it remains the named
remedy under "Revisit if".

**Where the session projection lives.** UI placed it, and the queued-prompt service, in main.
ADR-0010 and ADR-0043 place the projection in the run host — it is the lock holder, and
`REQ-MONITOR-218`'s "no debounce, delay floor or minimum wait of any size" for an unseen row cannot be
met by a party that learns about the row by re-reading state, which `REQ-SESSION-071` in any case
forbids as a way of following a run, with no exception anywhere in the product. The queued-prompt
service is placed in the run host because that is where prompts are consumed under `REQ-MONITOR-139`
and `REQ-ORCH-071`. UI's position and the alternative reading of `REQ-CHAT-041` are recorded in
ADR-0043 and open question OQ-1. The persistent-notice store stays in main, because `REQ-NOTIFY-025`
and `REQ-NOTIFY-027` bind it to the application process across window re-creation.
