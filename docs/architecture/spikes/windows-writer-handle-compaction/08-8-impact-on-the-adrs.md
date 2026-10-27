# Spike — the writer's own handle, and what a follower sees across a compaction — 8. Impact on the ADRs

Part 8 of 9 of [the spike report](../windows-writer-handle-compaction.md), which indexes every part.

## 8. Impact on the ADRs

A parallel correction to ADR-0004, ADR-0008, ADR-0009 and ADR-0024 was in progress while this ran, deriving
"rule 3" — close the append handle, stage, `fsync`, rename, reopen — from theory alone. **The prescription
is correct and this measurement confirms it.** Three of its supporting claims are not.

### ADR-0004

1. **Correct the causal claim.** "Node does not request share-delete" is **false on this build.** With a Node
   handle held on the target under `'r'`, `'r+'`, `'a'`, `'a+'` or `'w'`, `fs.unlinkSync` succeeds and the
   directory entry is gone (200/200, and 5/5 across flags), and .NET `File.Delete` from another process
   succeeds — while both fail against a .NET holder that requests only `FileShare.ReadWrite`. The accurate
   statement is: **`fs.renameSync` cannot replace a destination that has any open handle, whatever that
   handle's share mode.** It fails with `EPERM` under exactly the conditions in which
   `MoveFileEx(MOVEFILE_REPLACE_EXISTING)` returns `ERROR_ACCESS_DENIED` (5), and it fails even when the
   holder explicitly permits delete (20/20). `ReplaceFileW` against the same held target succeeds (6/6).
   Rule 1 and rule 3 both survive this correction unchanged — but they are consequences of the chosen
   *replace* API, not of the platform or of the open's share mode, and the record should say which.
2. **Correct rule 3's sufficiency claim.** "Once the writer's own handle is shut there is no handle left to
   block the rename" is **false.** A reader obeying rule 1 holds a descriptor for the duration of each poll:
   0.81 ms steady-state, 3.3 ms on a re-seed of a 4.9 MB journal — a duty cycle of 0.11 %–0.44 % per follower
   at 750 ms and 1.6 % at 50 ms. Closing the writer's handle is **necessary but not sufficient**, the residual
   failure rate scales with aggregate reader duty cycle, and the retry ladder is **load-bearing rather than
   defensive**: 2/250, 10/250 and 19/300 trims needed a second attempt at realistic cadences, and 138/300
   failed outright at the stress bound.
3. **Correct rule 2.** "Directory `fsync` is unavailable on Windows through Node" holds only for a
   **read-only** directory handle. `fsyncSync` on a directory opened `'r+'` or `'a'` succeeds (200/200,
   0.115 ms). The ADR should record what was measured — the call is available on a write-opened handle —
   and explicitly decline to claim the POSIX semantic, which no measurement here establishes. This is
   material to OQ-12 and the "no directory `fsync` is performed" decision may want revisiting on that basis.
4. **Retarget "Revisit if".** "A Node API exposes share-delete on open" is already the case and would change
   nothing. The correct trigger is **a Node API or native binding exposing `ReplaceFileW`**, which is
   measured to replace a target this process holds open while a held reader continues to see the complete
   previous contents. That single capability would remove rules 1 and 3 together. Its out-of-process cost is
   a PowerShell spawn at p50 767 ms, which rules that route out for compaction but is worth recording so the
   option is closed on evidence rather than by omission.
5. **Add, as a small but useful fact:** a handle on the rename's **source** does not block it (200/200 OK).
   Only the target's handles matter. The staged file need not be closed before the rename.

### ADR-0008

- The sentence "it owns … the handles for the append-only files" must be qualified: the writer owns them
  **between** compactions and must close and reopen the target's handle around each one. File-handle
  lifetime is not a free implementation choice.
- Consequence 1 currently accepts that a synchronous flush blocks the run host's loop. **A second, larger
  blocking window belongs beside it:** a compaction leaves the journal with no append handle for
  **p50 29.8 ms, p95 41.4 ms at the default 20,000-line cap** (a 5,010,000 B journal), rising to
  **840 ms** when the rename ladder is exercised. Both windows sit on the same loop, and the acceptance
  rests on the same premise — ADR-0002 keeping the run host off the window layer.
- The two write disciplines listed there ("append, with periodic atomic compaction") should carry the note
  that compaction is not a pure append-path operation: it is a close/reopen of the file the append path
  owns, and must run on the same serialised queue.

### ADR-0009

- Rule 3's adoption is confirmed by measurement; the naive shape produced **0/115 completed trims** and a
  journal 115 lines over its limit and growing, with no observable symptom at any follower.
- **Remove the claim that no handle is left to block the rename.** `REQ-EVENTS-098`'s own closing sentence
  says "Reading is unrestricted and needs no lock: any number of processes may read or follow a session's
  history concurrently with its writer." The single-writer rule bounds writers, not readers, and it is
  readers that produce the residual `EPERM`s. Record the measured rates rather than asserting zero.
- **Add the throughput consequence.** Because `REQ-EVENTS-091` requires a trim before any further append is
  accepted, a persistently failing trim makes every append carry a failed ladder: measured **3.76 events/s
  versus 276 events/s**, a ~73× collapse. This is the strongest argument for rule 3 and it is not currently
  in the record.
- **State the marker window.** "The marker is updated only after a trim completed" is required by
  `REQ-EVENTS-091` and creates a window of **p50 2.6–3.2 ms, p95 3.6–6.8 ms, max 99 ms** (p50 95 ms under
  stress) in which the journal is trimmed and the marker is stale. Inside it, `REQ-EVENTS-111`'s marker
  comparison cannot fire and detection rests on the length and terminator tests — sufficient for
  variable-length lines (0/430 undetected), **useless for constant-length lines (200/200 undetected)**. A
  second window is structural: the marker and the journal are two files read at two instants, and the
  marker read alone takes p50 0.81–0.87 ms.
- **Raise the generation/truncation signal.** `fs.fstatSync(fd, {bigint:true}).ino` changed on 200/200
  rename replacements including 200/200 same-length ones, on 0/500 pure appends, and in the live matrix on
  all 5,189 ground-truth trims and never without one across 172,191 reads, at p50 0.016 ms on a descriptor
  the follower already holds. It removes both windows because it is sampled in the same instant as the bytes
  it qualifies. It **complements** the marker rather than replacing it — `REQ-EVENTS-094` still needs the
  cumulative count. No requirement specifies it; it needs either an ADR-level decision binding ADR-0011's
  follower, or an open question, and this record should not leave it implicit.
- **Record that unlink-then-rename was measured and rejected**: it is the one Node-core route past a held
  handle (300/300 renames succeeded) but exposes the journal as absent for 0.70 % of follower reads plus
  read errors, and is two steps where `REQ-EVENTS-091` requires one.

### ADR-0024

- Apply the same correction to "Node requests no share-delete, [so] the handle blocking the replace is this
  writer's own." The second half is right for the naive shape; the first half is wrong, and the "handle
  blocking the replace is this writer's own" is **incomplete** — a concurrent reader's per-poll handle blocks
  it too, and the permission ring has readers (a diagnostics view over the audit trail is exactly the
  consumer consequence 2 anticipates).
- Consequence 1 ("compaction is O(file) and runs on the writer's queue, so it must not sit on any path with
  a latency budget") should carry a measured figure: **21.5 ms p50** to rewrite 22,500 → 20,000 lines of a
  5.5 MB file with the handle closed, and **29.8 ms p50** for the whole close-stage-`fsync`-rename-reopen
  sequence at that size. A 5,000-entry permission ring is smaller and will be cheaper — **but I did not
  measure `permissions.jsonl` or `verification-gate.jsonl` separately**, and ADR-0024 should not cite these
  figures as if I had.
- **A conformance question this spike surfaces and cannot settle.** `REQ-EVENTS-091` explicitly tolerates a
  failed trim: the history "then exceeds its cap, which is a bounded and visible cost". `REQ-TOOLS-078` has
  no such clause — it states the ring as an invariant ("the only permitted removal is retention trimming,
  which keeps the 5000 most recent entries"). ADR-0024's "every write is best-effort … failures are counted
  so a persistently failing evidence directory becomes a session issue" is the right shape for *writes*, but
  a failed **compaction** leaves the file over its cap with no requirement authorising that state. Given that
  rename failures are measurably non-zero even with rule 3 applied, this is worth raising as an open
  question rather than left to the implementation.

---
