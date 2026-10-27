# Spike — the store and exclusive-create locking on remote and synchronised storage — 6. Results — the synchronisation-client case (ESC-21)

Part 6 of 12 of [the spike report](../remote-and-synchronised-storage.md), which indexes every part.

## 6. Results — the synchronisation-client case (ESC-21)

### 6.1 What a sync client breaks, stated precisely

`REQ-GIT-128` places the integration lock at `<workspace>/.rotaris/integration.lock`, "created with
exclusive-create semantics", and gives the reason in terms: "what it protects is the base repository,
which is the user's own material and travels with the workspace, so a second machine reaching the same
checkout must meet the same lock."

Exclusive create is a *filesystem* primitive. Its guarantee is that of all openers presenting
`CREATE_NEW` for one name **in one directory served by one arbiter**, exactly one is told yes. Section 5
measures that this holds over SMB, because the arbiter is the server.

A file-synchronisation client removes the arbiter. Each machine has its **own local directory**; the
client makes them look alike **afterwards**, by replication. So:

1. Machine A creates `.rotaris/integration.lock` in *its* copy. Exclusive create succeeds — correctly,
   because in A's directory the name was free.
2. Machine B creates `.rotaris/integration.lock` in *its* copy. Exclusive create succeeds — correctly,
   because in B's directory the name was free too.
3. Both machines begin integrating into the same base branch.
4. The client notices the collision later and resolves it by whatever policy it has — last writer wins,
   a "conflicted copy", a rename. **Neither machine is told anything by the primitive it used**, because
   both calls already returned success.

The promise `REQ-GIT-128` makes — "a second machine reaching the same checkout must meet the same lock"
— is not weakened there. It is **false**, because there is no same lock to meet at the moment either
machine asks. That is exactly ESC-21's reading, and nothing measured here disturbs it.

### 6.2 What is testable on one machine, and what it showed (`q-esc21.js`)

**(a) That the tie is created at all.** Two directories standing in for two machines' replicas, one lock
name: both exclusive creates returned `WON`. Trivial, and recorded only because it is the whole of the
argument.

**(b) That nothing in the lock's own contents can break the tie afterwards.** This *is* worth measuring,
because `REQ-GIT-128` fixes the lock's payload as `{"session_id", "pid", "host", "started_at"}`, and a
reconciler — human or automatic — would reach for `started_at` first.

| Measurement | Result |
|---|---|
| `Date#toISOString` resolution | milliseconds; 404 distinct values across 500 consecutive creates |
| NTFS `mtimeMs` distinct values across 500 consecutive creates | 384 |
| **Minimum non-zero `mtimeMs` step** | **0.5051 ms** |
| Median non-zero `mtimeMs` step | 1.0015 ms |
| `mtimeMs` delta between the two replicas' locks in the Q1 race | 1.009 ms |
| `birthtimeMs` delta | 2.5166 ms |
| **This machine's clock source** | `Local CMOS Clock`; **`Last Successful Sync Time: unspecified`** |
| Clock precision reported by `w32tm` | `-23` (119.209 ns per tick) |
| **Measured offset vs `time.windows.com`, 3 samples** | **+0.8556113 s, +0.8564687 s, +0.8507046 s** |

The orderable step available in a timestamp is about **1 millisecond**. The offset this machine actually
carries against a public time source is about **855 milliseconds** — roughly **850 times larger** — on a
machine whose time service has never successfully synchronised. `started_at` therefore cannot order two
machines' claims, and neither can the file timestamps the client replicates. `host` distinguishes the
two claims but does not rank them; `pid` is meaningless across machines, which `REQ-SESSION-054` already
says. **There is nothing in the lock to arbitrate with.**

**(c) That the condition is detectable at all** — section 6.4, and it is.

### 6.3 What is **not** testable here

The following were **not** measured and are **not** estimated:

- Whether a real client (OneDrive, Dropbox, Google Drive, Synology Drive) actually permits two machines
  to each create the same lock name. It follows from how these clients work, but it was not observed.
- What such a client does on collision — last-writer-wins, a "conflicted copy" rename, a merge — and
  whether either machine is informed.
- The replication latency, which sets how long both machines run unaware.
- Whether the client's local filesystem hooks change exclusive-create semantics inside a placeholder or
  dehydrated file. **This one is genuinely uncertain**: a Cloud-Filter placeholder is a reparse point,
  and `CREATE_NEW` against a dehydrated name is a code path I did not exercise.

**Why not.** A second machine is required, and an account with a sync provider is required. This machine
has four live Synology Drive sync roots holding the user's own material; writing test locks into them
would push files to the user's NAS and was refused. Nothing was written to any synchronised path in this
spike; those paths were read for metadata only.

**What would close it.** A build host or a second machine, both signed into one sync account, both
mounting one synced folder, running the `i-excl-worker.js` race in section 5 against
`<synced>/.rotaris/integration.lock` with the barrier replaced by a wall-clock start time. The single
number that matters is *"races in which both machines' exclusive create returned success"*. That is the
whole of ESC-21's second premise and it is one afternoon's work on two machines.

### 6.4 The detection ESC-21's ruling depends on **works**, and is cheap (`k-detect.ps1`, `k2-child.ps1`, `t-detect-cost.ps1`)

ESC-21 rules that "the integration operation must **detect** the condition and refuse rather than proceed
under a lock that does not lock", and notes this "composes with SR-5, which already requires synchronised
storage to be detected directly". `REQ-STARTUP-166` requires the determination be made "from the storage
the workspace directory sits on" and "SHALL NOT be inferred from a failure". `REQ-SESSION-198` separately
calls such detection "unreliable" — as grounds for never making the *store location* conditional on it.
Those two are consistent, and the measurement supports both: the determination is real and precise for
providers that register with Windows, and blind to those that do not.

This machine has genuine third-party sync roots. `CfGetSyncRootInfoByPath(…, CF_SYNC_ROOT_INFO_PROVIDER)`
was called against each, read-only:

| Path | File attributes | `GetDriveTypeW` | `CfGetSyncRootInfoByPath` |
|---|---|---|---|
| ordinary local directory on `C:` | `0x00000010` `DIRECTORY` | 3 `FIXED` | `hr=0x80070186` — not a sync root |
| ordinary local directory on `D:` (this repository) | `0x00000010` `DIRECTORY` | 3 `FIXED` | `hr=0x80070001` — not a sync root |
| a registered sync root | `0x00000431` `DIRECTORY,REPARSE_POINT` | 3 `FIXED` | **`provider='SynologyDrive'`, status 1** |
| a **child** directory of it | `0x00080410` `DIRECTORY,REPARSE_POINT,PINNED` | 3 `FIXED` | **`provider='SynologyDrive'`** |
| a **grandchild** directory | `0x00080410` | 3 `FIXED` | **`provider='SynologyDrive'`** |
| a **file** inside it | `0x00080420` `REPARSE_POINT,PINNED` | 3 `FIXED` | **`provider='SynologyDrive'`** |
| the sync root's **parent** | `0x00000011` | 3 `FIXED` | `hr=0x80070186` — **correct negative** |
| a second provider's root | `0x00000430` | 3 `FIXED` | **`provider='CrossDevice'`, version `071.84.0`** |
| `\\127.0.0.1\Users\…` | `0x00000010` | **4 `REMOTE`** | `hr=0x80070032` (`ERROR_NOT_SUPPORTED`) |
| `R:\…` | `0x00000010` | **4 `REMOTE`** | `hr=0x80070032` |

Two published Win32 calls cover both halves of `REQ-STARTUP-166`:

- **shared with another machine** → `GetDriveTypeW` returns `DRIVE_REMOTE`. A mapped drive letter is
  unmasked by `WNetGetUniversalNameW`, which resolved `R:\…` to `\\127.0.0.1\Users\…`.
- **synchronised to another machine** → `CfGetSyncRootInfoByPath` returns the **provider's name**, from
  any depth inside the tree, with a correct negative one level above it.

Cost, 200 iterations each, measured through a PowerShell script block (so these are **upper bounds**;
the interop overhead is included):

| Call | p50 | p95 | max |
|---|---|---|---|
| `GetDriveTypeW` on `C:\` | 0.0995 ms | 0.2247 ms | 1.8052 ms |
| `GetDriveTypeW` on `\\127.0.0.1\Users\` | 1.8345 ms | 2.8678 ms | 4.0834 ms |
| `CfGetSyncRootInfoByPath`, ordinary local dir on `C:` | 0.6592 ms | 1.1210 ms | 17.0060 ms |
| `CfGetSyncRootInfoByPath`, ordinary local dir on `D:` | 0.2149 ms | 0.3839 ms | 0.5301 ms |
| `CfGetSyncRootInfoByPath`, a real sync root | 0.2253 ms | 0.3933 ms | 2.3319 ms |
| `CfGetSyncRootInfoByPath`, UNC path | 1.1082 ms | 1.8991 ms | 2.4305 ms |
| `WNetGetUniversalNameW`, ordinary local dir | 0.2483 ms | 0.3917 ms | 0.5066 ms |

Single-digit milliseconds. `REQ-STARTUP-043` puts this determination in post-show background activation
so it "never delays first paint"; on these figures it would not delay anything even if it ran inline.
That is a comfortable margin, not a licence to move it.

**The limitation, stated plainly.** `CfGetSyncRootInfoByPath` sees only clients that register a sync
root with the Windows Cloud Filter API. OneDrive, Dropbox and Google Drive do; Synology Drive does, as
measured. A folder replicated by a client that does not — or by a scheduled `robocopy`, an `rsync` job,
or a network drive the user syncs by hand — is **invisible to this call and indistinguishable from an
ordinary directory**. No such client was available here to test against, so I cannot say how large that
blind spot is in practice. The classification is therefore sound but not exhaustive, which is precisely
why `REQ-SESSION-198` forbids making the store's *location* depend on it, and why `REQ-GIT-150` and
`REQ-STARTUP-150` are right to make an unclassifiable workspace pass in silence rather than be refused.

---
