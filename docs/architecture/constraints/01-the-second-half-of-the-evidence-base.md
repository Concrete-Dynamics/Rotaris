# Architectural constraints extracted from the specification — The second half of the evidence base: `docs/spec/resolutions/`

Part 1 of 22 of [the constraints](../constraints.md), which indexes every part.

## The second half of the evidence base: `docs/spec/resolutions/`

**A requirement is not the whole of what the specification says about it.** Alongside the twenty-one
domain documents sits [`docs/spec/resolutions/`](../../spec/resolutions/) — twenty-one records, one per
domain, disposing of every open question that domain's draft raised, with the disposition, the decision
taken, and the requirement identifiers it touched. An architect who reads only `docs/spec/` reads half
the evidence.

They matter here for three reasons, and each has already changed an entry below.

- **A resolution sometimes narrows what a requirement licenses.** `REQ-UIBENCH-050` says both structural
  counts are "defined against the interface framework the product is built on", which reads as a licence
  for the product to say which of its own elements are visual. Row 29 of
  `resolutions/21-ui-performance-benchmark.md` fixes the counting rules "in framework-neutral terms" with
  an observable test, and row 13 renames a field because it "leaks one GUI toolkit's vocabulary into a
  schema". That reading is what makes I-10 disputed and OQ-28 blocking.
- **A resolution sometimes widens it, or records why a figure is what it is.** Row 23 of
  `resolutions/02-run-monitoring-steering.md` records why `REQ-MONITOR-223`'s comparison point is 10,000
  rows; row 1 of `resolutions/07-sessions-persistence.md` records that `REQ-SESSION-071`'s write-volume
  bound "is the whole contract and no further coalescing is required".
- **A resolution is sometimes the only place a withdrawal is recorded.** `resolutions/11` records that
  the startup domain's self-invocation flag was withdrawn in favour of the `REQ-MCP-033` sentinel, and
  `resolutions/21` question 11 records that the requirement which once defined an argument form for the
  benchmark's iteration child is withdrawn — "a third party running one iteration directly is not a
  capability the product offers". Both are why P-13 below now says the specification fixes **one**
  reserved token rather than two.

The rule for this document: where a resolution record narrows, widens or withdraws what a requirement
appears to license, the entry cites the resolution alongside the requirement. A resolution never
overrides a requirement's text — it is evidence of what that text was taken to mean when it was
approved.
