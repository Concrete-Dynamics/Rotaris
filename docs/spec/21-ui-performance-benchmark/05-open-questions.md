# UI Performance Benchmark — Open Questions

Part 5 of 5 of [domain 21](../21-ui-performance-benchmark.md), which indexes every part.

## Open Questions

None outstanding. Every open question raised in the draft was resolved; see [`resolutions/21-ui-performance-benchmark.md`](../resolutions/21-ui-performance-benchmark.md).

One question raised against this domain from outside it is also closed, and is recorded here so that it is not reopened from the other side. **What the two structural counts mean for an interface built from a document model** is settled by the framework-neutral reading: `widgets` counts every element that occupies layout space and can be painted, including the painted content of a transcript row, which is what REQ-UIBENCH-050 now states in terms. The consequence — that the element-count invariant of REQ-UIBENCH-054 cannot be held by any structure this product is permitted to ship, and is relaxed to a bound on the count's variation rather than defended by a structure that would cost a screen-reader user the conversation — is stated in REQ-UIBENCH-054 and reported by REQ-UIBENCH-085.
