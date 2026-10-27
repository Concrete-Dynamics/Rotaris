# Spike — the transaction commit on the publish path

- **Date:** 2026-09-02
- **Questions:**
  1. `REQ-MONITOR-221` requires every change to be persisted before it is published to any view, and
     `REQ-MONITOR-218` forbids "any minimum wait, debounce, or delay floor of any size" before
     publishing a row a view has not seen. ADR-0058 concludes from those two that persist-before-publish
     "now rests on **a transaction commit**, and a commit's cost is therefore on the publish path", and
     states plainly that "**the commit is not yet measured on this path and the record should not pretend
     otherwise**". What does it cost, at `synchronous = NORMAL` and at the `synchronous = FULL`
     that `REQ-SESSION-070` and `REQ-SESSION-068`/`REQ-SESSION-072` force?
  2. ADR-0058 leaves WAL checkpointing "on SQLite's automatic schedule" and identifies the checkpoint
     `fsync` as "the one background cost on the publish path". How often does it fire at a realistic row
     rate, and what does it cost when it does?
  3. **The number the record does not have:** commit *and then* publish, run host → main → renderer,
     end to end, against `REQ-MONITOR-222`'s 250 ms and `REQ-MONITOR-223`'s factor-of-two ceiling. Every
     latency figure currently in the record excludes the commit and is therefore a lower bound.
  4. ADR-0058 forbids the workspace service holding a write transaction across a long read, because
     "a long write transaction in the other process would make that commit wait". What does the run
     host's commit cost while the service is reading, and what does it cost when the rule is broken?
  5. ADR-0058 chose a native binding. Can it be built against the Electron ABI on this machine, and
     what does that take? ADR-0056 needs the answer.
- **Scope:** measurement only. No product code was written and none is authorised. Everything below was
  produced by a throwaway harness in the session scratchpad; nothing was written into this repository
  except this document.
- **Bearing on the record:** the verdicts are in **section 10**. **Section 2** records three defects in
  the binding and its pragma handling that will cost an implementer a day each if they are rediscovered
  rather than read; **section 11** records six findings that bear on ADR-0058, ADR-0056 and ADR-0002
  independently of the verdicts. **Section 12** states what the harness does not model. **No figure
  below is estimated, extrapolated or rounded up from something else; every number is a measurement
  taken in this session.** One set of figures was measured, was wrong because the harness was wrong, and
  is reported as such in section 2.4 rather than quietly replaced.

---

## Parts

Since 2026-10-26 the rest of this document is in [`commit-on-the-publish-path/`](commit-on-the-publish-path/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part.

| Part | What it holds |
|---|---|
| [01](commit-on-the-publish-path/01-1-environment.md) | 1. Environment |
| [02](commit-on-the-publish-path/02-2-the-binding-what-it-took-to-build-and-three.md) | 2. The binding — what it took to build, and three defects; 2.1 The build; 2.2 The ABI mismatch fails **loudly**, in both directions; 2.3 Defect 1 — the binding aborts the process when a `Statement` is garbage-collected; 2.4 Defect 2 — `PRAGMA synchronous` is applied at **prepare** time, and the first `run()` is a no-op; 2.5 Defect 3 — ADR-0058's `SQLITE_DEFAULT_WAL_SYNCHRONOUS=1` claim is right, and its consequence is not |
| [03](commit-on-the-publish-path/03-3-what-was-built.md) | 3. What was built; 3.1 The store; 3.2 The rows; 3.3 The transaction shapes; 3.4 The end-to-end arrangement |
| [04](commit-on-the-publish-path/04-4-method.md) | 4. Method |
| [05](commit-on-the-publish-path/05-5-raw-results-the-commit-itself.md) | 5. Raw results — the commit itself; 5.1 Headline — `NORMAL` versus `FULL`; 5.2 Where the `NORMAL` cost goes, by transaction shape; 5.3 What an `fsync` costs on this volume — the control; 5.4 An explicit flush |
| [06](commit-on-the-publish-path/06-6-raw-results-the-wal-checkpoint.md) | 6. Raw results — the WAL checkpoint; 6.1 How often it fires, and what it costs; 6.2 Turning the autocheckpoint off makes everything worse; 6.3 Explicit checkpoints |
| [07](commit-on-the-publish-path/07-7-raw-results-end-to-end-commit-then-publish.md) | 7. Raw results — end to end, commit **then** publish; 7.1 End to end; 7.2 The same samples, decomposed; 7.3 The tail, and where the checkpoint lands; 7.4 To first paint |
| [08](commit-on-the-publish-path/08-8-raw-results-concurrency.md) | 8. Raw results — concurrency |
| [09](commit-on-the-publish-path/09-9-cross-check-against-adr-0058s-named-fallback.md) | 9. Cross-check against ADR-0058's named fallback binding |
| [10](commit-on-the-publish-path/10-10-verdicts.md) | 10. Verdicts; `REQ-MONITOR-222` — "within 250 ms at the 95th percentile … both at zero pre-existing rows and at thousands of pre-existing rows" — **PASS**; `REQ-MONITOR-223` — "no more than twice … at the 95th percentile … at least 10,000 recorded transcript rows" versus none — **PASS**; `REQ-ORCH-155` — "reflect a state change the run has recorded within 100 ms of the run recording it, at the 95th percentile" — **PASS on both readings**; `REQ-MONITOR-221` — "every change must be persisted before it is published to any view" — **PASS, and now priced**; `REQ-MONITOR-218` — "no minimum wait, debounce, or delay floor of any size … on any platform" — **PASS as measured, with one condition that would break it**; `REQ-SESSION-067` / `REQ-SESSION-068` / `REQ-SESSION-072` — durable when requested, synchronous flush, no async runtime — **PASS**; `REQ-SESSION-070` — a terminal-status save "MUST NOT return before that status can be read back by any other reader of the store" — **PASS, and `FULL` is not what delivers it**; `REQ-EVENTS-029` — each event durable individually "at the moment it is raised and never in accumulated batches" — **PASS, not separately costed**; ADR-0058's own open item — "the commit is not yet measured on this path" — **CLOSED** |
| [11](commit-on-the-publish-path/11-11-findings-that-bear-on-the-record.md) | 11. Findings that bear on the record; 11.1 The margin is reduced by a third, not by an order of magnitude — but the p95 is no longer the whole story; 11.2 ADR-0058's decision to leave checkpointing on the automatic schedule is confirmed by measurement; 11.3 The commit is now the largest single component on the direct-port path; 11.4 ADR-0058's stated reason for forcing `FULL` on a terminal save does not survive the test; 11.5 Two ADR-0058 statements are now measurable and one is stale; 11.6 Are ADR-0002, ADR-0008 or ADR-0010 reopened? — **No. Bluntly, no.** — §1.774 |
| [12](commit-on-the-publish-path/12-12-what-this-harness-does-not-model.md) | 12. What this harness does **not** model |
