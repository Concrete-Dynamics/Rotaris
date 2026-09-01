# Spike — the writer's own handle, and what a follower sees across a compaction

- **Date:** 2026-08-31
- **Question:** ADR-0004 established that `fs.renameSync` over an existing file fails on Windows while a
  descriptor is held on it, and drew the rule for *readers*. The record's append-and-compact files are
  compacted by renaming a staged file over a target whose append handle **the writer itself holds**
  (`REQ-EVENTS-091`, `REQ-TOOLS-078`, `REQ-TOOLS-190`, `REQ-SESSION-133`). No ADR guards that. If the
  rename fails the consequence is silent: `REQ-EVENTS-091` and constraint E-06 both specify that an
  incomplete trim leaves the previous contents in force and records a warning, so the caps are simply
  never enforced.
- **Scope:** measurement only. No product code was written and none is authorised.

---

## 1. Environment

| | |
|---|---|
| OS | Microsoft Windows 11 Pro, 10.0.26200.9168 |
| Node | v24.11.0 (`process.versions.uv` = 1.51.0) |
| npm | 11.12.1 |
| Volumes | `C:` NTFS, 1,022,726,901,760 B total / 62,917,468,160 B free · `D:` NTFS, 1,000,202,039,296 B total / 708,662,448,128 B free |
| Harness location | the session scratchpad on `C:` — **all figures below are from an NTFS volume, but from `C:` and not from a workspace directory on `D:`** |
| Anti-malware | not disabled, not enumerated, not measured |

This is the same machine and the same Node build as ADR-0004's existing spike, so the numbers are
comparable to it.

---

## 2. Method

Seven harnesses, all throwaway, all under the scratchpad.

1. **`p1-baseline.js`** — 200 iterations of each of seven cases: hold an append descriptor across a
   `renameSync`; close it first; append via `fs.appendFileSync` (open/close per write); hold an ordinary
   reader; hold the *staged* file's own descriptor; `unlinkSync` the target while holding an append
   descriptor; and whether a `writeSync` with no `fsyncSync` is visible to a separate open.
2. **`p2-shareflags.js`** — 50 iterations each of every `fs.open` flag spelling and numeric combination
   this build exposes, holding the target and attempting `renameSync` over it.
3. **`p2b/2c/2d/2e`** — the same question from the other side. A .NET `FileStream` holder with an explicit
   Win32 share mode, and a Node holder against four replace mechanisms issued from another process:
   `fs.renameSync`, `MoveFileEx(MOVEFILE_REPLACE_EXISTING)` by P/Invoke, `ReplaceFileW` by P/Invoke, and
   `System.IO.File.Replace`. `unlinkSync` / `File.Delete` are used as a discriminator that tells us
   whether a given handle actually permits delete.
4. **`p4-durability.js`, `p4b`** — which sync calls are available and what they cost; the cost of the
   per-event flush `REQ-EVENTS-029` requires; the cost of one compaction at the default cap.
5. **`writer.js` + `follower.js` + `p3-run.js`** — the concurrency matrix. The writer appends
   wire-event-shaped JSONL (one `writeSync` then one `fsyncSync` per event) and compacts on
   `REQ-EVENTS-091`'s headroom rule, counting lines from the file's current contents, keeping the newest
   `cap`, staging in the target's own directory, `fsync`ing the staged file, renaming under a bounded
   5-attempt ladder, then writing `events.meta.json` atomically. Compaction strategy is selectable:
   `hold` (keep the append handle open — the shape the ADRs currently imply), `close` (close, stage,
   `fsync`, rename, reopen — the proposed fix), `unlinkRename` (unlink then rename). Followers are separate
   processes performing resumable byte-offset reads per `REQ-EVENTS-108`–`REQ-EVENTS-116` and
   `REQ-SESSION-149`, opening and closing the file within each poll and holding no descriptor between
   polls, reading `events.meta.json` on every poll as `REQ-EVENTS-111` requires.
6. **`p7b-window.js`** — a deterministic sweep. No race: each state is constructed exactly, then one
   resumable read is performed and what the follower observes is recorded.
7. **`p6-identity.js`, `p8-dutycycle.js`** — whether the file's identity is a usable replacement signal,
   and how long one poll holds the journal open.

The follower additionally records two quantities that are **instrumentation, not part of the specified
protocol**: the `seq` of the journal's first line (ground truth for "a trim happened between these two
polls") and the file's `ino`. Every anomaly counter below is checked against that ground truth.

**A contaminated run was discarded.** An earlier matrix shell survived a stop request and ran concurrently
with a second, colliding on three directory names; three arms had two writers appending to one log. Those
results are not reported. Every figure in section 4 comes from a re-run performed after confirming no stray
process remained, with unique arm labels.

---

## 3. Results — is the claim true?

### 3.1 The baseline (`p1`, 200 iterations per case)

| Case | Result |
|---|---|
| Long-lived append fd (`'a'`) held across the rename, write+`fsync` per event | **200/200 `EPERM`** (`errno` −4048, `syscall` `rename`) |
| Same, but the fd is **closed** before staging and reopened after | **200/200 OK** |
| `fs.appendFileSync` per write (open/close per write, no handle held at rename) | **200/200 OK** |
| Ordinary reader `fs.openSync(target,'r')` held — ADR-0004's original finding | **200/200 `EPERM`** |
| The **staged** file's own descriptor still open at rename time | **200/200 OK** |
| `fs.unlinkSync(target)` while an append fd is held | **200/200 OK** |
| One `writeSync`, no `fsyncSync`, then a separate open/read/close | **200/200 visible** |

**The claim is confirmed.** The writer's own append handle blocks its own compaction, every time.

Two results here were not predicted and matter later: a handle on the rename's **source** does not block
it — only the target's handles count — and `unlinkSync` **succeeds** against a target this process holds
open for append.

### 3.2 Is a share mode permitting delete reachable from Node? (`p2`, `p2b`–`p2e`)

The open constants this build exposes are exactly `O_RDONLY`, `O_WRONLY`, `O_RDWR`, `O_CREAT`, `O_EXCL`,
`UV_FS_O_FILEMAP`, `O_TRUNC`, `O_APPEND`. **There is no share-mode constant of any kind.** `O_TEMPORARY`,
`O_SHORT_LIVED`, `O_SEQUENTIAL`, `O_RANDOM`, `O_NOINHERIT`, `O_SYNC` and `O_DSYNC` are *not* exposed, so
combinations naming them collapsed to their base value; the distinct flag values actually exercised were
`'r'`, `'r+'`, `'rs+'`, `'w'`, `'w+'`, `'a'`, `'a+'`, `'as'`, `'as+'`, `0`, `265`, `266`, `536870912`.
**Every one: 0/50 renames succeeded, all `EPERM`.**

So the answer to the question as asked is **no — no `fs.open` flag reachable from Node lets a held handle
stop blocking `fs.renameSync`.** But the reason is not the one the record gives, and the next table is why.

Holder = this Node process, target held with the flag shown. Each mechanism issued from a separate process
except where noted.

| Held with | `fs.renameSync` (same proc) | `fs.renameSync` (other proc) | `MoveFileEx` + `REPLACE_EXISTING` | `ReplaceFileW` | `fs.unlinkSync` (same proc) | .NET `File.Delete` (other proc) |
|---|---|---|---|---|---|---|
| `'r'` | `EPERM` | `EPERM` | `ERROR_ACCESS_DENIED` (5) | **OK** | OK — file gone | OK |
| `'r+'` | `EPERM` | `EPERM` | `ERROR_ACCESS_DENIED` (5) | not run | OK — file gone | OK |
| `'a'` | `EPERM` | `EPERM` | `ERROR_ACCESS_DENIED` (5) | **OK** | OK — file gone | OK |
| `'a+'` | `EPERM` | `EPERM` | `ERROR_ACCESS_DENIED` (5) | not run | OK — file gone | OK |
| `'w'` | `EPERM` | `EPERM` | `ERROR_ACCESS_DENIED` (5) | **OK** | OK — file gone | OK |

And from the other side, a .NET `FileStream` holder with an explicit Win32 share mode, 20 rename attempts
each:

| Holder's share mode | Node `fs.renameSync` | Node `fs.unlinkSync` | .NET `File.Replace` |
|---|---|---|---|
| `FileShare.ReadWrite` | 20/20 `EPERM` | `EBUSY` | fails — "used by another process" |
| `FileShare.ReadWrite \| Delete` | 20/20 `EPERM` | OK | **OK** |

Read those two tables together:

- Node's `unlink` **succeeds** against a Node-held handle, and .NET's `File.Delete` succeeds against it
  too — while both fail against a .NET holder that requests only `FileShare.ReadWrite`. That is a clean
  discriminator, and it says **Node's `open` does request share-delete.**
- `ReplaceFileW` **succeeds** against a Node-held handle, on every flag tried (6/6 across `'r'`, `'a'`,
  `'w'`, by P/Invoke and via `System.IO.File.Replace`). The replacement lands, and a held `'r'` reader
  goes on reading the **complete previous contents** — no torn read, no empty read.
- `fs.renameSync` fails under exactly the conditions in which `MoveFileEx(MOVEFILE_REPLACE_EXISTING)`
  returns `ERROR_ACCESS_DENIED`, and it fails **even when the holder explicitly permits delete**.

The blocker is therefore **the replace-by-rename mechanism, not the open's share mode, and not NTFS.**
(I did not read Node's or libuv's source; this is an observational statement about which Win32 call's
failure conditions `fs.renameSync` reproduces exactly, not a claim about its implementation.)

`ReplaceFileW` is not reachable from Node core. Out of process it costs a PowerShell spawn: **p50 767 ms,
min 732 ms, max 815 ms, 10/10 successful** — which prices it out of a compaction path entirely. In a native
addon it would be cheap, and it would remove the need for both ADR-0004 rule 1 and rule 3.

### 3.3 What durability is actually obtainable (`p4`, `p4b`)

| Call | Result |
|---|---|
| `fsyncSync` on the staged file | OK |
| `fdatasyncSync` on the staged file | OK |
| `fsyncSync` on a directory handle opened `'r'` | **`EPERM`** |
| `fsyncSync` on a directory handle opened `'r+'` | **OK** — 200/200, mean 0.115 ms, `fstatSync().isDirectory()` = true |
| `fsyncSync` on a directory handle opened `'a'` | **OK** |
| `fdatasyncSync` on a directory handle opened `'r+'` / `'a'` | OK |
| `openSync` on a directory with `'w'` | `EISDIR` |

ADR-0004 records that directory `fsync` fails with `EPERM`. That is true **only for a read-only handle.**
Opened for write, the call returns success. **Whether it delivers the POSIX guarantee is not established
by a success return, and this harness cannot establish it** — that needs a power-loss test. The honest
statement is that the call is available, not that the guarantee is.

Costs:

| Operation | n | p50 | p95 | p99 | max |
|---|---|---|---|---|---|
| `writeSync` only, no flush | 2000 | 0.0135 ms | 0.0226 ms | 0.0683 ms | 0.737 ms |
| `writeSync` + `fsyncSync` (the `REQ-EVENTS-029` shape) | 2000 | **0.518 ms** | 0.834 ms | 1.042 ms | 2.687 ms |
| `fs.appendFileSync` (open/write/close per event) | 2000 | 0.357 ms | 0.542 ms | 0.617 ms | 0.961 ms |
| Trim 22,500 → 20,000 lines of a 5,546,390 B file, handle already closed | 20 | 21.5 ms | 33.9 ms | — | 33.9 ms |

The per-event `fsync` costs 38× a bare write. Note that a bare `writeSync` was **already visible to a
separate opener 200/200 times without any flush**, so if `REQ-EVENTS-029`'s "immediate flush" is read as
a follower-visibility property rather than a durability one — which is how the requirement itself states
its reason — the `fsync` is not what makes it true.

---

## 4. Results — the proposed fix under concurrency

Eight arms. `cap` 200 unless stated; headroom `cap/8`; trim when lines exceed `cap + cap/8`. "Handle-closed
window" is how long the journal had no append handle. "Rename→marker window" is how long the trimmed file
was live while `events.meta.json` still carried the old dropped count.

| Arm | Mode | cap | Follower poll | Followers | Trims completed | Rename attempts | Handle-closed p50 / p95 / max | Rename→marker p50 / p95 / max |
|---|---|---|---|---|---|---|---|---|
| **R-G** | close | 200 | — | 0 | **400 / 400** | 1×400 | 4.5 / 6.5 / 8.0 ms | 2.6 / 3.6 / 6.3 ms |
| **R-B** | close | 200 | 750 ms | 8 | **250 / 250** | 1×248, 2×2 | 5.4 / 10.5 / 64.5 ms | 3.1 / 5.2 / 7.5 ms |
| **R-C** | close (constant-length lines) | 200 | 750 ms | 8 | **250 / 250** | 1×240, 2×10 | 5.3 / 12.4 / 63.9 ms | 3.1 / 6.8 / 99.0 ms |
| **R-H** | close | 200 | 50 ms | 2 | **300 / 300** | 1×281, 2×19 | 5.3 / 64.6 / 68.1 ms | 3.2 / 6.2 / 35.3 ms |
| **R-F** | close | **20000** | 750 ms | 4 | **30 / 30** | 1×30 | **29.8 / 41.4 / 42.3 ms** | 2.9 / 3.6 / 3.9 ms |
| **R-A** | close | 200 | **0 ms** | 2 | **162 / 300** | 1×32, 2×40, 3×33, 4×30, **5×165** | 169 / 782 / 840 ms | 95 / 130 / 136 ms |
| **R-E** | unlink+rename | 200 | 0 ms | 2 | 300 / 300 | 1×300 | 6.4 / 10.8 / 17.5 ms | 68 / 133 / 169 ms |
| **R-D** | **hold** (naive) | 200 | 750 ms | 2 | **0 / 115** | **5×115** | n/a | n/a |

Rename error codes were `EPERM` in every failing case (994 in R-A, 575 in R-D, 19/10/2 in R-H/R-C/R-B).
No arm left a staged `.tmp` file behind on any path, including R-A's 138 failures and R-D's 115.

### 4.1 The naive shape (R-D) fails exactly as predicted, and silently

**0 of 115 trims completed.** Every one exhausted the full 5-attempt ladder. The journal reached 340 lines
against a limit of 225 — **115 over the cap and still growing** when the arm's 90 s budget expired. The two
followers recorded **zero** restarts and zero anomalies over 248 reads: nothing observable happened.

There is a second cost that is not in the requirement text. `REQ-EVENTS-091` says an append that leaves the
file over the headroom "MUST be followed by a trim before any further append is accepted", so once the trim
starts failing **every subsequent append carries a whole failed retry ladder**. Measured throughput
collapsed to **340 appends in 90.5 s = 3.76 events/s**, against 8,000 appends in 29.0 s = 276 events/s in the
otherwise-comparable R-E arm. That is a ~73× throughput collapse on the journal, on top of the cap never
being enforced.

### 4.2 The fix works at every realistic cadence, and needs the retry ladder

At the foreign-follower cadence `REQ-MONITOR-288` fixes — 750 ms — with **eight** concurrent followers,
250/250 trims completed, 248 of them on the first attempt. At the real default cap of 20,000 lines (R-F, a
5,010,000 B journal, the same staged per trim) **30/30 completed on the first attempt**, and the file's
high-water mark was 22,501 lines against a limit of 22,500 — the cap held exactly.

But closing the writer's handle is **necessary, not sufficient.** A follower obeying ADR-0004 rule 1 still
holds a descriptor *for the duration of each poll*, and that is enough. Measured reader duty cycle (`p8`):

| Journal | One poll holds the file open (p50) | Duty cycle @ 750 ms | Duty cycle @ 50 ms |
|---|---|---|---|
| 200 lines (48,550 B), steady-state poll | 0.812 ms | 0.108 % | 1.62 % |
| 200 lines, re-seed poll (reads the whole file) | 0.945 ms | 0.126 % | — |
| 20,000 lines (4,918,890 B), steady-state poll | 0.837 ms | 0.112 % | 1.67 % |
| 20,000 lines, re-seed poll | 3.322 ms | 0.443 % | — |
| `events.meta.json` read (every poll, per `REQ-EVENTS-111`) | 0.810–0.865 ms | — | — |

That small residue is exactly what the retry ladder is for, and it is **load-bearing**: 2/250 trims in R-B,
10/250 in R-C and 19/300 in R-H needed a second attempt at realistic cadences. Push the duty cycle to its
limit — two followers polling with no delay at all, which the product would never do — and **138 of 300
trims failed outright despite five attempts**, with 165 trims exhausting the ladder. Even then the file
drifted only 9 lines over its limit, because the writer re-attempts the trim on the next append: the
failures are transient collisions, not the permanent stall of R-D.

### 4.3 What the follower observed — 172,191 reads

Aggregated across all eight clean arms:

| Counter | Total |
|---|---|
| Resumable reads | **172,191** |
| Events delivered | 4,004,914 |
| **Empty-file reads** | **0** |
| **Unparseable complete lines** | **0** |
| **Partial trailing line delivered as an event** | **0** |
| **Silent gaps** (events lost with no restart flag) | **0** |
| **Silent duplicates** (event redelivered with no restart flag) | **0** |
| Ground-truth trims observed | 5,189 |
| **Trims observed but not detected** | **0** |
| Restarts raised | 5,982 |
| — by the length test | 4,999 |
| — by the terminator test | 178 |
| — by the marker comparison | 5,018 |
| — **by the marker alone** (length and terminator both missed) | **663** |
| — **by length/terminator alone** (marker still stale) | **822** |
| Missing-file reads | 142 — **all of them in the unlink+rename arm** |
| Read errors | 17 — **all of them in the unlink+rename arm** |

Three things follow.

**Zero empty reads in 172,191.** ADR-0004's spike found one zero-length read in 1,850 and one in 16,250; this
harness exceeds that order of magnitude by an order of magnitude and found none. That is **not a refutation**
— it is a different workload (append-and-compact by one writer, versus two writer processes replacing a
200 KB document against a reader loop) and the difference may well be the workload rather than the platform.
It does say that for *this* compaction shape, the empty read `REQ-LIBRARY-043` forbids was not reproduced.

**Both detectors are individually necessary.** 663 restarts fired on the marker comparison when the
length and terminator tests had both missed; 822 fired on length/terminator when the marker was still
stale. Neither is redundant. `REQ-EVENTS-111`'s insistence on reading the marker on every read is doing
real work, and so is the older length test it was added to reinforce.

**Unlink-then-rename is disqualified.** It is the one route reachable from Node core that works past a held
handle — 300/300 renames succeeded — but the followers saw the journal **absent 142 times in 20,312 reads
(0.70 %)** plus 17 read errors. `REQ-EVENTS-091` requires the file to be replaced "in one atomic step";
unlink-then-rename is two, and the gap is observable.

---

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

## 6. Verdicts

| Requirement / constraint | Threshold | Verdict |
|---|---|---|
| `REQ-EVENTS-091`, constraint **E-06** | trim replaces the file in one atomic step; keeps newest `cap`; incomplete trim leaves previous contents in force, warns, and is not reflected in the marker | **FAIL** for the writer-holds-handle shape (0/115 trims completed, cap exceeded by 115 lines and growing). **PASS** for close-stage-`fsync`-rename-reopen: 400/400, 250/250, 250/250, 300/300, 30/30 at the default cap. Failed trims behaved exactly as specified — previous contents in force, warning recorded, marker untouched, staged file removed. |
| `REQ-EVENTS-091` cap arithmetic (default 20000, headroom 2500, trim above 22500) | file must not exceed cap + cap/8 other than transiently | **PASS** — R-F high-water 22,501 against a limit of 22,500 |
| `REQ-EVENTS-029`, constraint **E-03** | one write followed by an immediate flush, per event | **PASS**, at 0.518 ms per event. **Caveat, not a violation:** a compaction closes the append handle for p50 29.8 ms at the default cap (p95 41.4 ms), and up to 840 ms when the ladder is exercised; no append can be flushed in that window. |
| `REQ-EVENTS-108`, `110`, `111`, `113`, `116`; `REQ-SESSION-149` | resumable read delivers every event exactly once, in order; offset lands after a complete record; partial tail held without warning | **PASS** in 172,191 reads — 0 silent gaps, 0 silent duplicates, 0 partial lines delivered, 0 unparseable lines. **CONDITIONAL:** the deterministic sweep shows 200/200 offsets undetected when a same-length replacement coincides with a stale marker. |
| `REQ-EVENTS-111` (marker comparison makes restart guaranteed) | restart whenever the dropped count has risen | **PASS** where the marker is current (0/200 undetected). **FAIL as an unconditional guarantee** — two measured windows exist in which the marker the follower reads is older than the journal bytes it reads. |
| `REQ-EVENTS-092`, `094`, constraint **E-07** | marker written atomically, sorted keys, trailing newline, cumulative count | **PASS** — written by the same stage-`fsync`-rename primitive; no corrupt marker was produced or observed |
| `REQ-LIBRARY-043` ("never a partial, **empty**, or unparseable file") | a concurrent read returns the complete previous or complete new file | **PASS** for this compaction shape — 0 empty reads in 172,191. Note this requirement governs the improvement-artifact store; the journal's analogue is `REQ-EVENTS-091`. |
| `REQ-LIBRARY-043` retry bound (5 attempts, all within 1 s of the first) | bounded ladder | **PASS** — 50/100/200/400 ms of pauses; the longest ladder observed across the whole clean matrix elapsed **831.9 ms** including the attempts themselves, inside the 1 s bound. That instance *succeeded* on a late attempt. |
| `REQ-TOOLS-078`, `REQ-TOOLS-190`, `REQ-SESSION-133` (5,000-entry rings) | never altered, never reordered, trimmed to the newest N, every retained entry byte-for-byte | **INCONCLUSIVE as measured.** These files were **not exercised separately.** They use the same compaction mechanism, so section 3.1's result applies to them by construction, but no figure here is a measurement of `permissions.jsonl` or `verification-gate.jsonl`. |
| Constraint **D-07** / `REQ-LIBRARY-043` (no transient file left behind) | none on any path | **PASS** — no arm left a `.tmp` file, including across 138 and 115 rename failures |
| **OQ-12** (durability semantics) | — | **UNTOUCHED.** I measured which sync calls return success, not whether anything survives a power cut. No power-loss test was performed. |

---

## 7. What this harness does not model

- **No Electron, no IPC, no run host, no session lock.** A bare Node writer and bare Node follower
  processes. ADR-0002's process topology, ADR-0005's lock and ADR-0008's debounce/generation machinery are
  all absent; the measured handle-closed window is the filesystem cost only, with nothing else on the loop.
- **Wrong volume.** Everything ran on `C:` (the session scratchpad), not on a workspace directory on `D:`.
  Both are NTFS. Untested: network shares, ReFS, FAT/exFAT, removable media, and cloud-sync folders
  (OneDrive/Dropbox), which are a known source of exactly this class of handle contention.
- **Anti-malware was not controlled.** Whatever real-time scanning this machine does, it did to every arm.
  The unexplained 64–99 ms outliers in the handle-closed and rename→marker windows are consistent with
  scanner activity on a freshly created staged file, but I did not establish that.
- **No crash or power-loss testing.** Nothing here speaks to whether a replaced file survives a power cut,
  which is the actual content of OQ-12. The directory-`fsync` result is "the call returns success", not
  "the guarantee holds".
- **Synthetic events.** Lines are 40–200 bytes of filler plus an ISO-8601 timestamp and a monotonic `seq`,
  not real wire events. The constant-length worst case in section 5 was **constructed deliberately**; I did
  not observe a real event stream producing it, and I cannot say how often the real catalogue would.
- **One reading of the follow protocol.** The follower implements `REQ-EVENTS-108`–`116` and
  `REQ-SESSION-149` as I read them, including the choice to read the marker before the journal. A different
  but equally conformant reading could shift the windows in section 5.
- **One retry ladder.** 50/100/200/400 ms, the shape `REQ-LIBRARY-043` fixes. `REQ-SESSION-033`'s ladder is
  different and incompatible (OQ-11); it was not tested.
- **One writer process only.** `REQ-EVENTS-098` forbids two, so cross-process write contention was out of
  scope by design. Concurrent *readers* were varied from 0 to 8.
- **The ground-truth instrumentation is not part of the protocol.** The first-line `seq` read and the `ino`
  read exist to check the anomaly counters and would not be present in a conformant follower — except that
  section 5.1 proposes the `ino` read be made part of it.
- **R-A is not a configuration the product would run.** Two followers polling with zero delay is a stress
  bound establishing where the mechanism breaks, not a prediction of production behaviour.

---

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

## 9. Files

Harness (throwaway, scratchpad only):
`p1-baseline.js`, `p2-shareflags.js`, `p2b-osshare.js`, `p2c-osshare2.js`, `p2d-whoblocks.js`,
`p2e-replacefile.js`, `holder.ps1`, `p4-durability.js`, `p6-identity.js`, `p7b-window.js`,
`p8-dutycycle.js`, `writer.js`, `follower.js`, `p3-run.js`, `matrix3.sh`.

Raw output retained beside them: `p1-out.json`, `p2-out.json`, `p2b-out.json`, `p2c-out.json`,
`p2d-out.json`, `p2e-out.json`, `p4-out.json`, `p4b-dirfsync.txt`, `p4c-dirfsync-verify.txt`,
`p6-out.json`, `p7b-out.json`, `p8-out.json`, `clean-R-{A,B,C,D,E,F,G,H}.json`, and per-arm
`SUMMARY.json`, `writer.log.jsonl` (one record per trim) and `follower.<pid>.anomalies.jsonl`.
