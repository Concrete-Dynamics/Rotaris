# Spike — the transaction commit on the publish path — 11. Findings that bear on the record

Part 11 of 12 of [the spike report](../commit-on-the-publish-path.md), which indexes every part.

## 11. Findings that bear on the record

### 11.1 The margin is reduced by a third, not by an order of magnitude — but the p95 is no longer the whole story

The record has been quoting `REQ-MONITOR-222` at p95 1.13 ms against 250 ms. With the commit it is
**1.774 ms**, so the margin falls from ~221× to ~141×. That is still two orders of magnitude and
**ADR-0002, ADR-0008 and ADR-0010 are not reopened by it** (section 11.6).

What changes is the *shape* of the distribution, and that is worth more than the p95. Without the
commit the end-to-end interval had a maximum of 2.426 ms over 4,000 samples and nothing above 5 ms.
With it, 63 samples in 6,000 exceed 5 ms, 29 exceed 10 ms, and the periodic WAL checkpoint puts a
**9–11 ms** commit into the path once every 136 commits, deterministically. Nothing about that
threatens 250 ms. It does mean that any conformance test or diagnostic threshold built on "an update
takes about a millisecond" will now see routine excursions of ten times that, on a fixed period, and
should not treat them as faults.

### 11.2 ADR-0058's decision to leave checkpointing on the automatic schedule is confirmed by measurement

Section 6.2 is the evidence: disabling the autocheckpoint makes the ordinary commit 31 % slower at p50
and 87 % slower at p95, grows the WAL to 91 MB in 3,000 commits, and converts the periodic 9 ms spike
into a single **155 ms** stall. ADR-0058 says checkpointing is "bounded by WAL size rather than by
session volume"; that is exactly right, and the boundedness is what the default `wal_autocheckpoint =
1000` provides. **Do not make it configurable and do not turn it off.**

The one thing the ADR should add is the period, because it is a design input rather than an
implementation detail: **7.44 WAL frames per publish-path commit, hence a checkpoint every ~136
commits**, and a transaction that wrote more frames would checkpoint proportionally more often. If a
later decision widens the publish-path transaction — a second index, a wider `UPDATE`, a blob — the
checkpoint frequency moves with it and the tail follows.

### 11.3 The commit is now the largest single component on the direct-port path

The `ipc-hop-latency` spike found the direct `MessagePort` transport at p95 0.583 ms against the relay's
1.133 ms, and ADR-0002 names the port as its remedy "if measurement shows the double hop threatens the
budgets". This spike changes the arithmetic behind that remedy: with the commit included, the relay
path is 1.774 ms and the direct path is 1.257 ms. **The port still wins, but it now removes 29 % of the
interval rather than 49 %, because the commit is 54 % of the direct path's p95 and cannot be removed by
changing the transport.** Anyone re-opening ADR-0002's remedy on latency grounds should use 1.774 versus
1.257, not 1.133 versus 0.583.

### 11.4 ADR-0058's stated reason for forcing `FULL` on a terminal save does not survive the test

The durability section says `FULL` is forced for a terminal status because `REQ-SESSION-070` "requires
the status to be readable by any other reader of the store before the call returns". The test in
section 10 shows a different process, with a different binding, reading that status back immediately at `NORMAL`. The
readability clause does not need `FULL`.

This does not make the decision wrong — a terminal status is exactly the record a user is told they can
rely on, and 812 µs once per session is a trivial price for surviving a power cut. It makes the *stated
ground* wrong, and a wrong ground is dangerous here in a specific way: someone optimising later will
test readability, find `NORMAL` sufficient, and drop the `FULL`. **The ADR should re-ground the forcing
on power-loss durability — the property `NORMAL` in WAL explicitly does not have, which the same
section already names — and keep the decision.** Measured cost of keeping it: **812.1 µs at p50, 1434.4
µs at p95, once per terminal save**, or 829.8 / 1372.4 µs if the pragma is raised and lowered around the
transaction as the ADR specifies.

### 11.5 Two ADR-0058 statements are now measurable and one is stale

- "Ordinary commits run at `synchronous = NORMAL`. In WAL mode a commit at `NORMAL` writes the
  transaction to the write-ahead log **without an `fsync`**." Confirmed: `NORMAL` and `OFF` are
  indistinguishable (185.4 vs 177.5 µs at p50) and both are 4.4× cheaper than `FULL`, whose delta
  matches this device's measured 559 µs `fsync`.
- "at `REQ-MONITOR-219`'s coalescing tick that is at most twenty commits per second per live session".
  At 20 commits/s the store is at **0.37 % duty at p50**; even at the ≈64/s these runs achieved it is
  1.2 %. The publish path is nowhere near the store's capacity, and the ADR's carve-out forbidding
  per-tick commits is protecting the *transport*, not the store.
- ADR-0058 describes `better-sqlite3` as "published on the 12.x line". The current line is **13.0.3**.
  This spike measured **12.11.1** deliberately, to match the record. If implementation takes 13.x the
  figures should be re-taken, because the bundled SQLite version moves with it (12.11.1 ships SQLite
  3.53.2; Electron 44.1.0's own built-in is 3.53.3).

### 11.6 Are ADR-0002, ADR-0008 or ADR-0010 reopened? — **No. Bluntly, no.**

- **ADR-0002 (process topology) — not reopened.** Its `utilityProcess` run host relaying through main
  costs 1.052 ms at p95 with the commit in place; adding the commit takes the whole interval to 1.774 ms
  against a 250 ms budget. Its stated revisit trigger is the double hop threatening the budgets, and the
  double hop is now 59 % of an interval that uses 0.7 % of the budget. The direct-port remedy remains
  available and remains unnecessary on latency grounds. **One thing in ADR-0002's neighbourhood does
  need attention and it is not latency:** section 2.3's abort kills the run host, and ADR-0002's whole
  topology rests on the run host being the one process that owns a session's writes.
- **ADR-0008 (one ordered session writer) — not reopened.** Its ordering discipline is unaffected by
  commit cost, and a commit of 0.396 ms at p50 does not make an ordered queue a bottleneck at 20 or even
  64 publications per second. The concurrency results *support* it: the single-writer rule is what keeps
  `SQLITE_BUSY` at zero in every compliant condition measured.
- **ADR-0010 (three channels between run and surfaces) — not reopened.** Nothing measured here touches
  the channel split. The commit sits upstream of all three channels and costs the same whichever one
  carries the result.

**What is reopened is smaller and sharper:** ADR-0058's own "Revisit if" names "the commit cost on the
publish path, once instrumented, turns out to consume a material share of `REQ-MONITOR-222`'s budget,
which would make the coalescing tick's commit shape a decision rather than a consequence". It does not: the commit is 0.28 % of the budget at
p95, and the whole end-to-end interval 0.71 %. **That revisit trigger can be marked not-triggered on evidence.** The other trigger —
"cross-process write contention, measured against `REQ-MONITOR-218`'s no-delay-floor rule, proves real"
— is **partially triggered**: contention with a compliant reader is real but sub-millisecond, while
contention with a rule-4-violating reader is 205 ms. That makes rule 4 a conformance obligation with a
number attached, and it makes alternative G's two-store split a live option if the workspace service's
write pattern ever turns out to need long transactions.

---
