# ADR-0005 — The session lock as the single capability token, and the one lock that is not a row — Revisit if

Part 7 of 15 of [ADR-0005](../0005-the-session-lock-as-capability-token.md), which indexes every part.

## Revisit if

A supported platform is found where the runtime's null-signal probe is not inspection-only (take alternative
B). Or a requirement appears for reclaiming a lock held by a different machine, which `REQ-SESSION-183`
currently forbids. Or ADR-0058's *Revisit if* splits the workspace store in two, in which case this ADR must
say which of the two holds the lock table — and the answer is the one holding the sessions, so that the lock
and the record it guards never live in different files. Or the synchronised-storage spike finds that a
warning a user may proceed past is sufficient strength for ESC-21, in which case the refusal of
`REQ-GIT-128` becomes a confirmation and consequence 8's first cost is given back — the ordering, the
three-valued classification and the never-create-the-lock rule are unaffected either way. Or
`REQ-STARTUP-166`'s classification is found to misreport a common synchronisation client in either
direction: a false *replicated* refuses integrations that were safe, and a false *unknown* is consequence
8's residual, and only the second is silent.

**Discharged, 2026-09-02.** This record previously carried: *"Or a requirement connects `REQ-STARTUP-166`'s
sync-client detection to `REQ-GIT-128`, in which case the integration lock gains a stated behaviour on
storage where exclusive create does not mean what it says."* That has happened. `REQ-GIT-128` and
`REQ-GIT-124` as amended connect them, fix the refusal, fix its position in the ordered refusal list, and
forbid domain 06 making the determination a second time. The clause is retired rather than deleted, so a
reader can see that the record raised the gap before the specification closed it.
