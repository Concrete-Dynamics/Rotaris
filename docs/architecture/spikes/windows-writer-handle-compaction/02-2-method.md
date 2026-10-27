# Spike — the writer's own handle, and what a follower sees across a compaction — 2. Method

Part 2 of 9 of [the spike report](../windows-writer-handle-compaction.md), which indexes every part.

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
