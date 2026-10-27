# Spike — the cached launch of the Windows `onefile` portable — 10. The other observables `REQ-STARTUP-165` fixes

Part 10 of 16 of [the spike report](../cached-portable-launch.md), which indexes every part.

## 10. The other observables `REQ-STARTUP-165` fixes

### 10.1 Clause (a) — nothing is written beside the artifact

The artifact was placed alone in a fresh directory, which was snapshotted before, after the preparing
run, and after two cached runs:

- entries in the directory: **1 before, 1 after, 1 after** — no marker, no log, no temporary file, nothing.
- the artifact's `size`, `mtime` and `ctime` were **byte-identical** across all three snapshots.
- only `atime` advanced, which is a read side effect and not a write.

### 10.2 Clause (a) — read-only medium

Approximated by denying the running user file-creation and file-deletion rights on the containing
directory with an explicit `icacls` deny ACE, verified by a write probe that failed with
`Permission denied`. With the directory in that state the artifact **prepared** (1,645.1 ms) and then
**launched from the cache twice** (591.6 ms, 579.3 ms), and the directory afterwards contained only the
artifact. This is an approximation and not a genuine read-only volume — see §13.

### 10.3 Clause (b) — a different artifact prepares afresh

v1.0.0 (`00d9e864…`) and v1.0.1 (`0d791edc…`, one line different in `LICENSE.electron.txt`), warm:

```
v1.0.0 first run   1954.9 ms   prepare / marker-absent
v1.0.0 cached       589.4, 581.4 ms
v1.0.1 first run   1961.3 ms   prepare / marker-absent      <- prepared afresh, as clause (b) requires
v1.0.1 cached       588.4, 598.0 ms
v1.0.0 again        591.3 ms   fast / hit                   <- its own preparation intact and still valid
```

Two token-named directories coexisted afterwards, each carrying its own marker naming its own token.
A same-payload artifact built with a different chunk size produced a different token (`9f167bec…`) and
also prepared afresh.

**One residue worth recording.** The token here is a digest of the **archive**, which is what ADR-0054
specifies ("the product version plus a digest of the payload"). Rebuilding the launcher without changing
the payload produced a **byte-different artifact with an identical token**; the preparation was reused.
For the corrected launcher this was handled by bumping the marker's launcher-format field, which the
check compares and which correctly forced a redo (`marker-format-mismatch`, §8). But it means clause
(b)'s "produced by an artifact of identical content" is honoured for everything that lands **inside** the
preparation and not for the launcher bytes themselves — so **a launcher change that alters how the
payload must be laid out, shipped without a format bump, would silently reuse an incompatible
preparation.** The format field is the control; it has to be treated as load-bearing, not cosmetic.

### 10.4 Clause (d) — nothing fetched, nothing elevated

The launcher issues no network request and requires no elevation **by construction**: it reads its own
file and writes under `%LOCALAPPDATA%`. Every preparation in this spike was produced from the artifact
alone. **This was not independently verified with a network monitor or a privilege trace** — see §13.

### 10.5 Two launches racing to prepare

ADR-0054 notes that the preparation happens before the instance claim of `REQ-STARTUP-164` can resolve
anything, so two double-clicks in quick succession produce two launchers both preparing. Tested by
wiping the root and spawning the artifact twice back to back:

```
launcher 0   prepare / marker-absent   committed = true    recheck ok
launcher 1   prepare / marker-absent   committed = false, found the token path already present,
                                       discarded its own work, recheck ok
preparation root afterwards: exactly one directory, 73 files, 507.9 MiB, no leftover temporary
both launchers exited 0
```

Resolves exactly as the ADR predicts. The loser pays one wasted preparation; nothing is corrupted,
nothing is reported, no partial directory survives.

---
