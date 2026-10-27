# Spike — the transaction commit on the publish path — 10. Verdicts

Part 10 of 12 of [the spike report](../commit-on-the-publish-path.md), which indexes every part.

## 10. Verdicts

### `REQ-MONITOR-222` — "within 250 ms at the 95th percentile … both at zero pre-existing rows and at thousands of pre-existing rows" — **PASS**

| Condition | p95 | margin |
|---|---|---|
| commit at `NORMAL` then publish, relay, **0 recorded rows** | **1.774 ms** | 141× |
| commit at `NORMAL` then publish, relay, **10,000 recorded rows** | **1.723 ms** | 145× |
| commit at `FULL` then publish, relay, 0 rows | 2.587 ms | 97× |
| commit at `FULL` then publish, relay, 10,000 rows | 2.517 ms | 99× |

Zero of 20,000 measured publications exceeded 250 ms; the worst single sample was 108.3 ms and came
from the transport, not the store. **The margin the record has been quoting is reduced from ~221× to
~141×, and it survives.** The commit alone consumes **0.28 %** of the budget at p95 and the whole
end-to-end interval **0.71 %**; a typical checkpointing commit (9.06 ms) is 3.6 % of it and the worst one
observed end to end (24.66 ms) is 9.9 %.

### `REQ-MONITOR-223` — "no more than twice … at the 95th percentile … at least 10,000 recorded transcript rows" versus none — **PASS**

Measured, as the requirement specifies, "from the run emitting the change to the surface showing it":

| Path | 0 rows p95 | 10,000 rows p95 | **ratio** | ceiling |
|---|---|---|---|---|
| commit `NORMAL` + relay, end to end | 1.774 ms | 1.723 ms | **0.971** | 2 |
| commit `FULL` + relay, end to end | 2.587 ms | 2.517 ms | **0.973** | 2 |
| commit `NORMAL` + direct port, end to end | 1.257 ms | 1.129 ms | **0.898** | 2 |
| the commit alone | 0.700 ms | 0.642 ms | **0.917** | 2 |
| the commit alone, micro-benchmark, 9,000 samples per arm | 0.363 ms | 0.329 ms | **0.907** | 2 |

Every ratio is below 1: a 10,000-row session was consistently a shade *faster* than an empty one, in
both the store and the transport, which is within the run-to-run spread rather than a real effect. The
store contributes no growth term — the insert goes into a `WITHOUT ROWID` primary key whose B-tree
depth barely moves between 0 and 10,000 rows, and the aggregate update touches one row by key. **This
requirement is not at risk from the store.**

### `REQ-ORCH-155` — "reflect a state change the run has recorded within 100 ms of the run recording it, at the 95th percentile" — **PASS on both readings**

The requirement's clock starts when the run *records* the change, so the interval is arguably the
transport alone; the more conservative reading starts before the commit. Both are given because the
choice changes the number by 70 %:

| Reading | 0 rows p95 | 10,000 rows p95 | margin |
|---|---|---|---|
| from the end of the commit (the change is recorded) — transport | 1.052 ms | 1.065 ms | 95× |
| from before the commit — end to end | 1.774 ms | 1.723 ms | 56× |

### `REQ-MONITOR-221` — "every change must be persisted before it is published to any view" — **PASS, and now priced**

The harness implements the ordering literally: `BEGIN IMMEDIATE` … `COMMIT`, then publish. The
requirement's own argument is that this "is satisfiable alongside `REQ-MONITOR-218` … because
persistence carries no delay of its own". That argument is upheld: **the price of persist-before-publish
is 0.396 ms at p50 and 0.700 ms at p95**, and it is work, not a wait.

### `REQ-MONITOR-218` — "no minimum wait, debounce, or delay floor of any size … on any platform" — **PASS as measured, with one condition that would break it**

A commit is not a wait, a debounce or a delay floor; nothing in the harness defers, parks or coalesces
a publication, and the run host publishes on the same turn the commit returns. But `REQ-MONITOR-218`
says *of any size*, and section 8 shows a way to manufacture one: a second process holding a write
transaction turns the commit into a wait of exactly that transaction's length — **205.4 ms measured for
a 200 ms hold.** That is not a floor the product would have chosen, but it is a floor a user would
experience, and it is imposed by another process. **ADR-0058 rule 4 is what keeps this requirement
true, and this measurement is the evidence for it.**

### `REQ-SESSION-067` / `REQ-SESSION-068` / `REQ-SESSION-072` — durable when requested, synchronous flush, no async runtime — **PASS**

The binding's API is synchronous throughout; no timer, no parking and no coalescing exists anywhere in
the harness's write path. The explicit flush measured **p50 715–963 µs, p95 1054–1559 µs** and returns
only after `COMMIT` at `synchronous = FULL` has returned.

### `REQ-SESSION-070` — a terminal-status save "MUST NOT return before that status can be read back by any other reader of the store" — **PASS, and `FULL` is not what delivers it**

Directly tested. A terminal status was committed at `synchronous = NORMAL` by one process, which then
kept its connection open and did **not** checkpoint. A **separate OS process**, using a **different
binding** (`node:sqlite`) and opening the store **read-only**, immediately read it back:

```
synchronous=NORMAL  → second process sees {"status":"completed","rows":1,"journal_mode":"wal"}
synchronous=FULL    → second process sees {"status":"completed","rows":1,"journal_mode":"wal"}
```

`REQ-SESSION-070`'s **readability** clause is satisfied by `NORMAL`, because a committed WAL frame is
visible to any other opener at once — which is exactly the reasoning ADR-0058 already gives for
`REQ-EVENTS-029` two paragraphs earlier. What `FULL` buys for a terminal save is survival of a power
loss or an operating-system crash, not readability. ADR-0058 attributes the `FULL` forcing to the
readability clause; **the justification is wrong even though the decision is defensible**, and section
11.4 says what to do about it.

### `REQ-EVENTS-029` — each event durable individually "at the moment it is raised and never in accumulated batches" — **PASS, not separately costed**

The event insert is inside the same transaction as the row, per ADR-0058 rule 2. Its marginal cost is
the `row` → `row+evt` step in section 5.2: **−4 to +31 µs at p50**, i.e. inside the noise. Making the
event durable individually is free once the row's commit is being paid for.

### ADR-0058's own open item — "the commit is not yet measured on this path" — **CLOSED**

---
