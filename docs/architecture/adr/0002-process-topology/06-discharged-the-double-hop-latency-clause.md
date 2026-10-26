# ADR-0002 — Process topology — Discharged — the double-hop latency clause, retired 2026-09-01

Part 6 of 11 of [ADR-0002](../0002-process-topology.md), which indexes every part.

## Discharged — the double-hop latency clause, retired 2026-09-01

This record previously carried: *"Measurement shows the run-host-to-main-to-renderer hop cannot meet
`REQ-MONITOR-222`'s 250 ms p95 or `REQ-ORCH-155`'s 100 ms — in which case take a `MessagePort`
transferred directly from the run host to the renderer before reconsidering the process count."*

**That measurement has been taken and the hop passes**, so the clause is discharged rather than left
standing as an unresolved contingency. It is preserved above so a reader can see that the topology was
adopted on argument and has since been confirmed on evidence, and that the escape hatch it named was
built and found to work rather than merely asserted.

- `REQ-MONITOR-222` — measured p95 **1.133 ms** at 0 resident rows and **1.291 ms** at 10,000, against
  250 ms. Worst single sample over 10,200 samples: 47.8 ms.
- `REQ-MONITOR-223` — ratio **1.14** (10,000 rows against 0, same content, p95), against a ceiling of 2.
  It holds under both store-append strategies measured, and at `REQ-SESSION-192`'s 5,000-row residency
  cap the ratio is 1.19. **It passes for a reason that depends on that cap** — see ADR-0044.
- `REQ-ORCH-155` — SR-8 rules the 100 ms a 95th percentile and the requirement now says so. Under that
  reading the relay measures p95 **5.95 ms** unloaded and **7.81 ms** under heavy terminal load, a
  margin of 8× to 40×. Under an absolute reading 24 of 9,000 samples exceeded 100 ms; SR-8 records why
  that reading is unsatisfiable in principle and is not the requirement's.

**What is not discharged** is consequence 9's third bullet: the relay has a message-rate ceiling, and
what keeps the product below it is ADR-0021's cap rather than anything in this record.
