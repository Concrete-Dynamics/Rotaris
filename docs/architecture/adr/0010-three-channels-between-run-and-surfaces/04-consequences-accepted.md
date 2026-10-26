# ADR-0010 — Three channels between the run host and its surfaces — Consequences accepted

Part 4 of 10 of [ADR-0010](../0010-three-channels-between-run-and-surfaces.md), which indexes every part.

## Consequences accepted

1. Three delivery mechanisms to build, document and test, each with a different failure contract, and a
   standing temptation to unify them that must be resisted with the citations above.
2. The whole-session update must be regenerated whenever **any** displayable field changes
   (`REQ-MONITOR-217`). Measured, that update costs p95 5.951 ms across both relay hops at 68,858 bytes
   and 12.179 ms at 283,438 bytes — quadrupling the payload multiplied the p95 by 2.05, not by 4, so
   payload size is not the near hazard (`../spikes/ipc-hop-latency.md`, §4.3, §7.4).
3. **`REQ-MONITOR-223`'s ceiling is met, and it is met for a reason that depends on the residency cap.**
   Measured ratio at 10,000 resident rows against zero: **1.14** with an O(1) store append and **1.16**
   with the idiomatic immutable `copy-on-append`, against a ceiling of 2. But `copy-on-append` is
   genuinely O(N) at 2.83 ns per resident row; at `REQ-SESSION-192`'s 5,000-row cap that is ~14 µs
   against a ~500 µs transport floor and is invisible. **The margin is supplied by the transport, not by
   the store** (`../spikes/ipc-hop-latency.md`, §6, §7.3). Two obligations follow: ADR-0008 must keep the
   durable residency bound rather than dissolving it, and a test must measure the **store apply in
   isolation**, because an end-to-end p95 would not catch a regression there. A delta whose
   `fromIndex` is 0 remains a **defect rather than a slow path**; the sender asserts it and diagnostics
   counts it (ADR-0044, ADR-0052).
4. `REQ-MONITOR-108` and `REQ-MONITOR-110`: a display tick must not alter a row, write session state or
   cause a transcript publication, so the elapsed-clock path touches none of these three channels.
5. **The sequence number is a payload field on two IPC channels and is an obligation on ADR-0044's
   relay.** It travels run host → main → renderer and main must relay it unchanged; a relay that
   coalesced, reordered or re-numbered publications would manufacture gaps. The spike found no reordering
   in any topology, including under the collapse — but it also did not exercise a reconcile, a refusal or
   a sequence gap at all (`refused = 0` everywhere), so **the reconcile path's cost is unmeasured**
   (`../spikes/ipc-hop-latency.md`, §8).
6. **The view is no longer ahead of the durable transcript at all.** The previous record accepted a gap
   of up to one debounce window and `REQ-SESSION-034` budgeted exactly that gap. Publication now follows
   the commit that recorded the row, and `REQ-SESSION-034` has been amended to state the crash-loss
   budget **in saves rather than in seconds**. The only thing still published ahead of any durable record
   is intra-row growth, which is not part of the session record (`REQ-SESSION-196`). A conformance test
   that diffs a live surface against the durable transcript **mid-row** still fails correctly behaving
   code for that reason; the comparison `REQ-MONITOR-242` asks for remains watched-transcript against
   reattached-transcript.
7. **Accepted OQ-42, 2026-09-06; implementation updated 2026-09-07.** Durable-store
   failure cancels affected runs and closes admission on their shared database.
   Projections cancel pending timers and return to cached committed rows. The
   separate in-memory failure notice identifies the last durable boundary and
   recovery instructions. Terminal persistence failure produces an unconfirmed
   caller outcome. Reopening probes writable storage after affected runs settle;
   successful recovery rebuilds the session projection from its durable record.
   The following paragraphs preserve the historical question and interim policy,
   superseded by this accepted decision.

   **Historical: What happens after a sticky mid-run store failure is returned as an open question rather than
   decided here.** The case is narrower than it was: `REQ-EVENTS-084` and `REQ-SESSION-089` now settle
   the other half, so a store that will not **open** refuses the run outright and there is no
   degrade-and-continue. What remains is `REQ-EVENTS-088`'s **mid-run** failure, which marks a session's
   history failed for the remainder of the run.
   An earlier form of this record decided that publication then continues **unanchored**, on the ground
   that the durable record had stopped advancing whatever the view did. **The store change materially
   weakens that argument**: under a file a failed append left the earlier history intact and only the
   event missing, while under one transaction the transcript row and its event share a commit, so a
   commit that will not commit means the session record itself stops advancing — the view would be
   showing rows a reattach genuinely cannot restore. `REQ-MONITOR-221` states no exception and
   `REQ-MONITOR-292` makes the persisted record authoritative wherever the two could disagree; nothing in
   the specification settles which reading wins when the record stops being writable. It is filed as
   **OQ-42** rather than re-decided.
   **Interim behaviour, which both readings share and which is not in question:** the run surfaces the
   store failure as a session issue and not only as `REQ-EVENTS-088`'s one warning, and the record
   continues to publish while marking the session's surface **unanchored**, so the condition is visible
   rather than inferred.
8. **A conformance test for any of these budgets must calibrate its clock.** The run-host-to-renderer
   offset of `performance.timeOrigin` ranged over **1.43 ms across 46 runs** — larger than the entire
   one-way latency on the direct-port path — so a test that stamps in one process and compares in another
   reports a number whose error is the size of the thing it measures
   (`../spikes/ipc-hop-latency.md`, §7.5). The spike's own method — NTP-style ping-pong over the same
   transport before measurement, taking the median of the best decile — is the shape the conformance
   harness must adopt.
9. **The measured margins are optimistic and the record says by how much rather than leaving it
   implied.** The spike's renderer had no framework, no state store, no Markdown renderer, no render
   cache and a 40-slot `textContent` recycler in place of ADR-0045's; its terminal handler stored bytes
   in a ring rather than driving a VT emulator; it ran one window, one publishing session and no
   packaging; and everything upstream of the publish call — the commit `REQ-MONITOR-221` requires
   included — is outside the measured interval. Fan-out to several windows (`REQ-MONITOR-243`,
   `REQ-STARTUP-163`) multiplies main's per-message relay cost by the window count and was not measured;
   nor was the aggregate message rate of concurrent runs (`../spikes/ipc-hop-latency.md`, §8). **Every
   figure quoted in this record is a lower bound on the requirement's own interval.**
