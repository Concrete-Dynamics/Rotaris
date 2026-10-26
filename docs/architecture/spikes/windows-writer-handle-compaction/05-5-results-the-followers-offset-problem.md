# Spike — the writer's own handle, and what a follower sees across a compaction — 5. Results — the follower's offset problem

Part 5 of 9 of [the spike report](../windows-writer-handle-compaction.md), which indexes every part.

## 5. Results — the follower's offset problem

The live matrix found zero detection failures. The deterministic sweep (`p7b`) shows why that is not the
whole answer. Each row constructs the state exactly and performs one resumable read; the marker is stale
except in the last row.

| Construction | Offsets swept | Undetected | Consequence |
|---|---|---|---|
| **Constant-length lines**, 25 dropped and 25 appended (same total length), marker stale | 200 | **200 (100 %)** | 4,975 events silently skipped; 0 unparseable lines |
| Variable-length lines (timestamp + varying payload), same drop, marker stale | 200 | **0** | terminator test fired every time |
| Variable-length lines, replacement **longer** than the pre-trim file, marker stale | 230 | **0** | terminator test fired every time |
| Constant-length lines, same-length replacement, **marker updated** before the read | 200 | **0** | marker comparison fired every time |

The worked failure: a follower that had delivered up to `seq` 99 performed its next read and was handed
`seq` 125 onward. **Twenty-five events were never delivered and never will be.** No restart flag, no
warning, no unparseable line — the stream it receives is contiguous, well-formed and parseable. The offset
is a line boundary in the new file too, so nothing about the bytes is wrong; only their meaning changed.

`REQ-SESSION-149` names this case and says it is undetectable by the length/terminator test: *"A replacement
file of identical length whose offset boundary also falls on a newline is undetectable by this test; the
never-reused-id invariant (`REQ-SESSION-012`) is what rules that case out."* But `REQ-SESSION-012` rules out
**two different sessions sharing one path**. It does not rule out **a trim of the same session's own file**,
which is precisely this case. That is why `REQ-EVENTS-111` adds the marker comparison — and the sweep
confirms the marker closes it completely, *when the marker is current.*

**Two windows in which it is not current, both measured, neither bounded by any requirement or ADR:**

1. **Rename → marker.** ADR-0009 specifies that "the marker is updated only after a trim completed", which
   `REQ-EVENTS-091` requires (an incomplete trim must not be reflected in the marker). Between the rename
   landing and the marker's replacement landing, the journal is trimmed and the marker still reads the old
   count. Measured **p50 2.6–3.2 ms, p95 3.6–6.8 ms, max 99 ms** at realistic cadences; **p50 95 ms, max
   136 ms** under the R-A stress arm.
2. **Marker read → journal read.** The follower reads two files at two instants and there is no way to read
   both atomically. The marker read alone takes **p50 0.81–0.87 ms**. A trim completing inside that gap is
   invisible to the marker comparison by construction, however promptly the writer updates the marker.
   Reading the marker after the journal instead of before moves this window; it does not remove it.

Inside either window, detection falls back entirely to the length and terminator tests — which the sweep
shows are sufficient for variable-length lines (0 undetected in 430 offsets) and useless for constant-length
lines (200/200 undetected). **The architecture currently depends on journal lines happening to vary in
length. No requirement guarantees that.** `REQ-EVENTS-064`/`REQ-EVENTS-065` fix compact JSON with sorted
keys and every event carries a constant-width ISO-8601 timestamp, so line length varies only with the
payload; a run of same-shape events with same-width fields would produce exactly the constructed case.

### 5.1 A signal that closes it, and that no ADR specifies

The file's identity changes on replacement and on nothing else.

| Construction | n | `ino` changed |
|---|---|---|
| `renameSync` replacement, varying sizes | 200 | **200** |
| `renameSync` replacement, **identical length** | 200 | **200** |
| Append-only, no replacement, `fsync` per append | 500 | **0** |
| `ReplaceFileW` replacement | 5 | **5** |
| `birthtime` across `renameSync` replacement | 200 | 1 — **unusable** |

In the live matrix this held perfectly: `ino` changed on all **5,189** ground-truth trims, and **never once
without one**, across 172,191 reads. The cost is `fs.fstatSync(fd, {bigint: true})` at **p50 0.016 ms** on a
descriptor the follower already holds, inside the `fstat` it already performs.

This is a *replacement* detector, not a *drop-count* detector. It does not replace the marker —
`REQ-EVENTS-094` needs the marker's cumulative count and `REQ-EVENTS-111` needs the count comparison for the
`dropped_events` semantics — but it removes both timing windows, because it is read from the same descriptor,
in the same instant, as the bytes whose meaning it qualifies. No requirement mentions it and no ADR specifies
it.

---
