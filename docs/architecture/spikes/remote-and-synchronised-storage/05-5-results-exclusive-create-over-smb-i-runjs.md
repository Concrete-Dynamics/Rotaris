# Spike — the store and exclusive-create locking on remote and synchronised storage — 5. Results — exclusive create over SMB (`i-run.js`)

Part 5 of 12 of [the spike report](../remote-and-synchronised-storage.md), which indexes every part.

## 5. Results — exclusive create over SMB (`i-run.js`)

Four racer processes, released together by a barrier file, each attempting `fs.openSync(path, 'wx')`
(`O_CREAT|O_EXCL`) on the same target name, 500 independent races per pairing. Ground truth taken from
the files actually on disk afterwards and from their contents.

| Pairing | Races | Exactly one winner | More than one winner | No winner | Loser error codes | Files on disk | Unreadable contents |
|---|---|---|---|---|---|---|---|
| `local` + `local` | 500 | **500** | **0** | 0 | 1,500 × `EEXIST` | 500 | 0 |
| `unc127` × 4 | 500 | **500** | **0** | 0 | 1,500 × `EEXIST` | 500 | 0 |
| `local` + `unc127` | 500 | **500** | **0** | 0 | 1,500 × `EEXIST` | 500 | 0 |
| `local` + `mapped` | 500 | **500** | **0** | 0 | 1,500 × `EEXIST` | 500 | 0 |
| `unc127` + `mapped` | 500 | **500** | **0** | 0 | 1,500 × `EEXIST` | 500 | 0 |
| **Total** | **2,500** | **2,500** | **0** | **0** | **7,500 × `EEXIST`** | 2,500 | 0 |

Exclusive create is a **perfect** mutual-exclusion primitive here, including across the two I/O stacks
that destroyed the WAL store in section 4.5. Where WAL needs coherent shared memory, `FILE_CREATE`
needs only a single arbiter, and the SMB server is one.

**One fairness observation, not a correctness problem.** Winner distributions:

| Pairing | Winners by racer |
|---|---|
| `local` ×4 | 105 / 157 / 127 / 111 |
| `unc127` ×4 | 122 / 132 / 121 / 125 |
| `local` + `unc127` | local 249, local 251, **unc 0, unc 0** |
| `local` + `mapped` | local 240, local 260, **mapped 0, mapped 0** |
| `unc127` + `mapped` | unc 135, mapped 133, unc 111, mapped 121 |

A racer with local access won **500 of 500** races against a racer coming over SMB. Peers on equal
footing shared roughly evenly. For `REQ-GIT-128` this is harmless — exactly one wins, which is all the
requirement asks — but a machine that holds the workspace locally will in practice always beat a machine
reaching it over the network, so "who got the lock" is decided by topology and not by who asked first.

---
