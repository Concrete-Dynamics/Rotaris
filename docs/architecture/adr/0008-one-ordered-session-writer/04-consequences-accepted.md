# ADR-0008 — One ordered session writer per session, owning the session's transactions — Consequences accepted

Part 4 of 8 of [ADR-0008](../0008-one-ordered-session-writer.md), which indexes every part.

## Consequences accepted

1. **A synchronous flush blocks the run host's loop for the duration of one commit**, and that is
   acceptable only **because ADR-0002 puts the run host off the window layer**. If ADR-0002 is ever
   revisited toward the main process, this consequence becomes a defect.
   **What the same loop no longer carries is measured.** Under the file design a compaction left the
   journal with no append handle for **p50 29.8 ms, p95 41.4 ms at the default 20,000-line cap**,
   rising to **840 ms** where the rename ladder was exercised
   (`../spikes/windows-writer-handle-compaction.md`, §4, arms R-F and R-A). That window sat on this
   loop and is gone with the mechanism that produced it. It is recorded because it is the largest
   blocking window this record ever accepted, and a reader comparing the two designs should see it.
2. **The commit rate is now bounded by the run loop's call sites and by nothing this record controls.**
   Under the window a `running` session wrote at most twice per ten seconds; it now writes once per
   requested save, and `REQ-SESSION-071` states that no bound applies. The save-request rate is
   therefore a property of the callers and must be **instrumented** (ADR-0052) rather than assumed.
   Two figures bound the discussion and neither is a measurement of this design: the file design's
   per-event durable write cost **0.518 ms p50** with an `fsync` and 0.0135 ms without one
   (`../spikes/windows-writer-handle-compaction.md`, §3.3), and the run-host-to-renderer transport
   costs **p95 1.291 ms at 10,000 resident rows** against `REQ-MONITOR-222`'s 250 ms
   (`../spikes/ipc-hop-latency.md`, §4.1). ADR-0058's ordinary commit performs no `fsync` and should
   therefore cost less than the flush it replaces — **that is inference, not measurement**, and the
   spike says so in terms: everything upstream of the publish call, "the database commit
   `REQ-MONITOR-221` requires before publication" included, is outside its measured interval
   (`../spikes/ipc-hop-latency.md`, §8). The measurement is owed before the record claims a number.
3. **Failure isolation is no longer per target.** Under files a failed journal append marked the journal
   failed without affecting the state writer (`REQ-EVENTS-088`), and a diagnostics failure degraded to a
   log line (`REQ-HOOKS-128`, `REQ-SESSION-175`). Those rules still hold *as rules*, but the targets
   share one store: a commit failure is a condition of the workspace store and affects every table at
   once. The writer still reports per-target status because the requirements are per target; it must not
   claim independence the store no longer provides. This is SR-4's concentration of the crash domain
   arriving here.
4. **`REQ-SESSION-069`'s exact log line has lost its only producer, and that is reported rather than
   hidden.** The line reports a save abandoned because a newer one superseded it. Under whole-file
   writes it defended against two in-flight writes landing out of order; under the narrowed window its
   producer was the parked save. With no parking and a serialised queue, every requested save commits in
   request order and nothing is ever abandoned. Either the line is now dead text, or `REQ-SESSION-067`'s
   "never coalesced" is meant to be narrower than it reads. **A writer must not manufacture the
   condition in order to keep the message alive**; the generation stamp stays as the checkable
   expression of the guarantee, and the question goes back to the specification.
5. **`summary.md` is now rewritten at the rate saves are requested.** The withdrawn window bounded a
   whole-document rewrite; every other document it bounded became a row, and this one did not. It is off
   the critical path by `REQ-SESSION-006`'s own words, and it is derived so a stale one costs nothing a
   loader reads — but `REQ-SESSION-033`'s ladder can spend up to 1.55 s of backoff on a contended
   replace, and the file design's own measurements put a foreign handle on a freshly written file inside
   the ordinary range of anti-malware behaviour
   (`../spikes/windows-writer-handle-compaction.md`, §4.2 and §7). **This is the one place where
   withdrawing the debounce made something more expensive rather than cheaper**, and it is named here so
   it is met on purpose. The lever, if measurement demands one, is to coalesce the *summary* rebuild —
   which is a departure from `REQ-SESSION-028`'s "rebuilt by the same save" and would need the
   specification's agreement, not this record's.
6. **Transcript residency is now a mechanism this record implements rather than one it dissolved.** The
   previous form of this record removed it; that is corrected. The cost is a released-page path to build
   and test — one that the paging command, `REQ-CHAT-165` and `REQ-SESSION-131` already require to exist
   — and the benefit is the bounded resident cost `REQ-MONITOR-223`'s measured margin depends on.
7. **`REQ-SESSION-139`'s metrics rebuild is O(1) and the metrics *document*'s home is now settled.** The
   previous form of this record returned that question unanswered. `REQ-SESSION-199` makes the metrics
   document one of the four records obtainable as an export and `REQ-SESSION-191` offers the action, so
   it is a record rather than a file and this record no longer has an open question about it.
8. **There is now one transaction spanning what used to be several files**, which is the single largest
   simplification in this record. It does **not** excuse stating the ordering rules: a transaction gives
   atomicity, isolation and durability, and none of emission order, ordinal assignment, single-writer
   discipline or persist-before-publish sequencing. `REQ-EVENTS-098` now says so itself.
9. **The view is no longer ahead of the durable transcript at all.** The previous file-owning record
   accepted a gap of up to one window between what a view showed and what the transcript document held.
   The gap is gone for a row's appearance and its settled form, which commit before they are published.
   It remains, deliberately, for intra-row growth, which has no durable counterpart (`REQ-SESSION-196`,
   `REQ-EVENTS-052`). `REQ-SESSION-196` has been amended to match: it no longer completes the snapshot
   read from stored `transcript.row` events, "so a row the session recorded is a row its persisted state
   already holds and there is nothing left to complete".
