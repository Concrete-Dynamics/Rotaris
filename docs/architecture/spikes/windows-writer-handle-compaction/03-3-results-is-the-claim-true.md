# Spike — the writer's own handle, and what a follower sees across a compaction — 3. Results — is the claim true?

Part 3 of 9 of [the spike report](../windows-writer-handle-compaction.md), which indexes every part.

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
