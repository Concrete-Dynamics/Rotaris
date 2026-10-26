# ADR-0002 — Process topology — Revisit if

Part 7 of 11 of [ADR-0002](../0002-process-topology.md), which indexes every part.

## Revisit if

ADR-0021's coalescing cap is relaxed, removed, or is found not to bound the aggregate frame rate across
concurrently flushing streams — in which case the relay's per-message ceiling stops being unreachable
and the `MessagePort` option above is taken for the update channels, with a second port for terminal
frames. Or `REQ-SESSION-192`'s residency cap is relaxed, which is the assumption `REQ-MONITOR-223`'s
measured ratio rests on. Or several concurrent runs become routine and consequence 1 is judged
unacceptable in practice rather than in principle — in which case move to alternative B and name a
separate owner for the sandbox availability verdict, accepting either the 5 s trial per run or a verdict
cached outside the runs that use it. Or a requirement appears that fixes directory identity for
`REQ-STARTUP-163`'s "already has that directory open" — this record's canonicalisation rule is an
architecture decision on a specification silence and a requirement would supersede it. Or the restore of
consequence 11 is found to need the run host to give up a store while a session in *another* workspace is
live, which would make the connection close per-identifier rather than per-process and is the first thing
to check when ADR-0058's handshake is built.
