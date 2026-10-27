# ADR-0058 — The workspace store: machine-local, found by a workspace identifier, and how it is backed up — Revisit if

Part 14 of 22 of [ADR-0058](../0058-the-workspace-database.md), which indexes every part.

## Revisit if

`node:sqlite` reaches stable and Electron commits to shipping the binding — take alternative B and give back
the rebuild obligation. Or a requirement appears that joins a session row to a workspace-scoped row, which
would close alternative G off.

**Two of this section's triggers were measured on 2026-09-02 and are marked rather than deleted, so a
reader can see they were tested.**

- *"Or the commit cost on the publish path, once instrumented, turns out to consume a material share of
  `REQ-MONITOR-222`'s budget, which would make the coalescing tick's commit shape a decision rather than a
  consequence."* — **Not triggered.** The commit consumes **0.28 %** of the budget at p95 and the whole
  commit-then-publish interval **0.71 %**. The coalescing tick's commit shape stays a consequence. The
  carve-out forbidding per-tick commits stands, but on the transport's account rather than the store's.
- *"Or cross-process write contention, measured against `REQ-MONITOR-218`'s no-delay-floor rule, proves
  real — take alternative G's two-store split."* — **Not triggered by compliant contention**, which is
  sub-millisecond (consequence 2). It is triggered by rule-5 violations, which produced a 205.4 ms commit
  and indefinite writer starvation — so the trigger is **restated**: take G if the workspace service's
  write pattern ever turns out to *need* long write transactions, rather than if contention is merely
  measurable. Note that ADR-0005 then has to say which of the two stores holds the lock table.

New with ESC-19. Or the binding's own documentation contradicts what alternative T assumes about the online
backup facility restarting on an external write, in which case T is the better mechanism and U is dropped —
this is a documentation check, not a measurement, and it should be done first. Or `VACUUM INTO`'s pinning of
the write-ahead log during a backup is measured and found to grow the log unacceptably on a large store
under a live run, in which case take T driven from the writing connection and move the copy into the run
host, accepting the long operation there. Or the product owner reads `REQ-SESSION-201`'s "MUST NOT reach
outside that store" as binding the restore as well as the backup, in which case case (b) stops
establishing an absent identifier file and collapses into case (c) — which, since ESC-26, is a confirmed
product action rather than a manual remedy, so the cost of that reading has fallen.

**New with the 2026-09-02 measurement pass.** Or the write-ahead log's growth while `VACUUM INTO` pins it
is measured on a large store under a live run and proves unacceptable — the correctness of the snapshot is
now settled (8 of 8), the log growth is not, and it is the only input the mid-copy checkpoint question
needs. Or rule 6's refusal of a non-machine-local store path fires on a configuration users legitimately
have, in which case the same detection drives a warning instead; the argument for refusal is the silence of
the failure it prevents, not its likelihood. Or a power-loss test establishes that a committed
write-ahead-log frame at `NORMAL` survives more than the record assumes, which would not change the
publish-path setting but would re-open how much `FULL` is buying on the terminal save.

**Discharged, 2026-09-02 (second).** This record previously carried: *"Or the specification grants
`REQ-SESSION-197` one narrow, explicit, user-confirmed exception, in which case case (c) of the restore
gains a product action and the residue this record raises against the specification closes."* **ESC-26 has
granted exactly that**, in exactly that shape, and case (c) is rewritten above. The clause is retired
rather than deleted so a reader can see the escalation was raised here before it was ruled elsewhere.

**Discharged, 2026-09-02.** This record previously carried: *"Or the product owner takes SR-9(b)'s larger
option — a configurable store location, or an explicit whole-store backup action — in which case
alternative N returns and the disclosure requirement is no longer the whole answer."* ESC-19 has answered
it, and split it: the backup action is taken and is built above; the configurable store location is
**refused**, and ESC-19 states in terms that this record's location decision does not reopen. Alternative N
is closed rather than pending, and the clause is retired rather than deleted so a reader can see the
question was asked before it was answered.
