# Spike — the whole-store backup and restore, run end to end — 7. Raw results — the three refusal gates (`K-gates.js`, `B-restore.js gate*`)

Part 7 of 17 of [the spike report](../backup-restore-mechanism.md), which indexes every part.

## 7. Raw results — the three refusal gates (`K-gates.js`, `B-restore.js gate*`)

Each gate was given its own world; the target store directory was hashed before and after.

| Case | Gate 1 `quick_check` | Gate 2 | Gate 3 | Outcome | Target store byte-identical after the gates |
|---|---|---|---|---|---|
| artifact snapshot scribbled over | `*** in database main *** Tree 3 page 3: btreeInitPage() returns error code 11` | not reached | not reached | **refused** | **yes** |
| artifact `user_version` 9, build supports 3 | `ok` | `pass=false` (9 > 3) | not reached | **refused** | **yes** |
| artifact `user_version` 1, build supports 3 | `ok` | `pass=true`, `older=true` | `pass=true` | **restored**; the restored store carries `user_version` **1** and migrates at its next open | n/a |
| lock naming this machine, pid alive | `ok` | pass | `pass=false`, `live=["t"]` | **refused** | see 7.1 |
| lock naming **another** machine | `ok` | pass | `pass=false`, `live=["t"]` | **refused** | see 7.1 |
| lock naming this machine, pid dead | `ok` | pass | `pass=true` (proved unheld) | admitted | see 7.1 |
| no locks | `ok` | pass | `pass=true` | admitted | see 7.1 |

All three gates do what the record says, including the case that must **not** refuse: an older schema
version restores and is left to the ordinary migration path.

### 7.1 The gates are not read-only at the filesystem level

Measured directly. Before gate 3 the target store directory holds `workspace.db` (32,768 B). After the
three gates it holds `workspace.db`, `workspace.db-shm` (32,768 B) and `workspace.db-wal` (0 B). The
liveness gate's read-only open of a write-ahead-logged store creates the shared-memory file.

ADR-0058 says "Three gates first, all read-only, **none of them touching the target**". The database
contents are unchanged and no row is written, so the *intent* holds; the literal claim does not, and a
refused restore leaves the target directory different from how it found it.

### 7.2 A lock row naming another machine makes the target unrestorable, permanently

`REQ-SESSION-056` makes a lock naming another machine live by construction; `REQ-SESSION-047` never reaps
it; `REQ-SESSION-201` refuses a restore while any session in the target is live. Measured: gate 3 refuses,
and the only product action that clears it is `REQ-SESSION-183`'s explicit, per-session, user-confirmed
release. ADR-0005 consequence 11 drops foreign-host rows on the way **in**, from the artifact; nothing drops
them from the **target**. `REQ-SESSION-054` calls such a row "a state that should not arise" — but a machine
rename produces it for every lock row at once, and the restore is then refused per session until the user
clears them one at a time.

### 7.3 The pre-restore summary can be assembled before any mutation

Everything `REQ-SESSION-201` and ESC-26 require to be shown first was read from the artifact's manifest and
the target store, with nothing mutated: the artifact's workspace identifier, the UTC instant it was taken,
its session count, the target's session count, whether a store already exists for the artifact's identifier,
and the number of lock rows arriving. Measured at 55.6 ms p50 for a 68 KB store and 1,210.0 ms p50 for a
313 MB one (section 10) — the cost is gate 1's, not the summary's.

---
