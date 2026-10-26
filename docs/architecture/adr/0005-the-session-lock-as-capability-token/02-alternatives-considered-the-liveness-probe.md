# ADR-0005 — The session lock as the single capability token, and the one lock that is not a row — Alternatives considered — the liveness probe

Part 2 of 15 of [ADR-0005](../0005-the-session-lock-as-capability-token.md), which indexes every part.

## Alternatives considered — the liveness probe

**Unchanged, and the evidence is preserved because neither the store's kind nor its location bears on it.**

**A — the runtime's null-signal probe, guarded.** A spike was run for the RUNTIME proposal on Node v24.11.0,
Windows 11 build 26200: a child was spawned to sleep 3 s and exit 7; at t+500 ms the parent probed the live
child, pid 999999, pid 0 and pid -1. Result: live `ok`, dead `ESRCH`, zero `ok`, negative `ESRCH` — **and
the child then exited normally, printing its own message and exiting 7**. Node's Windows implementation is
therefore inspection-only and does **not** deliver the console interrupt `REQ-SESSION-053` calls out. Two
guards are non-optional and are required by `REQ-SESSION-052` and `REQ-SESSION-054` rather than being
workarounds: `pid <= 0` answers *dead* before the call, and the error code is mapped — `ESRCH` to dead,
`EPERM` and everything else to alive.

**B — A platform-native probe** through a native addon. More literally faithful to `REQ-SESSION-053`'s
wording, and it would let the Windows case distinguish "exited but a handle keeps it reported" — which
`REQ-SESSION-054` nevertheless **accepts** as a documented limitation resolving toward alive, so the extra
fidelity buys nothing the specification asks for.

**Alternative A with the two guards**, kept behind one interface rather than inlined at four sites so that B
remains available.
