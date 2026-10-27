# Spike — the whole-store backup and restore, run end to end — 10. Raw results — timing (`F-timing.js`, 10 repetitions per size, min / p50 / max in ms)

Part 10 of 17 of [the spike report](../backup-restore-mechanism.md), which indexes every part.

## 10. Raw results — timing (`F-timing.js`, 10 repetitions per size, min / p50 / max in ms)

The store-unavailable window is measured inside the workspace service, from the instant it closes its own
connection to the instant its re-open completes.

| | small | medium | large |
|---|---|---|---|
| store bytes | 69,632 | 11,767,808 | **328,531,968** |
| artifact bytes | 85,504 | 11,812,352 | 328,617,472 |
| transcript rows | 150 | 20,000 | 240,000 |
| backup `VACUUM INTO` | 5.3 | 89.6 | 2,513.1 |
| backup, whole action | 145.6 | 425.0 | 4,206.1 |
| **gate 1** (extract the snapshot, `quick_check`) | 51.6 / **52.2** / 64.4 | 90.5 / **92.0** / 104.3 | 1,153.2 / **1,205.3** / 1,253.5 |
| gate 3 (liveness) | 3.0 / **3.1** / 3.3 | 3.3 / **3.5** / 3.6 | 3.5 / **3.8** / 4.6 |
| close handshake, run host answering at once | 1.2 / **1.3** / 1.5 | 1.2 / **1.3** / 1.4 | 1.2 / **1.4** / 1.6 |
| workspace service closes its connection | 0.9 / **1.0** / 1.0 | 1.0 / **1.0** / 1.0 | 1.0 / **1.1** / 1.1 |
| expand the artifact into staging | 37.7 / **38.5** / 39.9 | 76.7 / **78.3** / 79.2 | 422.5 / **427.3** / 499.2 |
| open staging + `quick_check` + lock correction | 7.5 / **8.4** / 10.6 | 39.5 / **46.5** / 53.1 | 945.1 / **997.2** / 1,034.9 |
| **step 3** (displace) | 3.5 / **3.6** / 4.2 | 3.6 / **3.8** / 4.0 | 3.8 / **3.9** / 4.3 |
| **step 4** (install) | 3.4 / **3.7** / 4.0 | 3.4 / **3.6** / 3.7 | 3.5 / **3.6** / 4.4 |
| **the gap between the two renames** | 3 / **4** / 5 | 3 / **4** / 4 | 3 / **4** / 5 |
| re-open, workspace service | 3.4 / **3.7** / 3.8 | 3.6 / **3.8** / 4.2 | 3.7 / **3.9** / 4.2 |
| re-open, run host (round trip through the parent) | 4 / **5** / 5 | 5 / **5** / 6 | 5 / **5** / 6 |
| **store unavailable** | 62.2 / **63.9** / 66.1 | 135.1 / **144.0** / 149.0 | 1,392.1 / **1,450.5** / 1,482.8 |
| whole restore | 119.1 / **120.8** / 133.0 | 231.3 / **241.8** / 251.0 | 2,572.2 / **2,668.5** / 2,692.5 |

Four readings.

**10.1 The two renames are flat and cheap.** Step 3 and step 4 are 3.5–4.4 ms at every size, and **the gap
between them is 3 to 5 ms whatever the store weighs**. The part of the mechanism that is not atomic is the
part that does not scale.

**10.2 Everything expensive is O(store) and most of it is charged twice.** The artifact is extracted once
in gate 1 to be checked and again in step 2 to be installed: 1,205 + 427 = 1,632 ms at 313 MB. The
integrity check runs twice for the same reason — on the artifact's snapshot in gate 1 and on the expanded
store in step 2. ADR-0058 wants both checks deliberately ("lets the integrity check run against the thing
that will actually be used rather than against the copy inside the container"), and the price of wanting
both is now measured. Gate 1's extraction is a property of the harness's container choice, not of the
record; see section 15.

**10.3 The store-unavailable window scales and nothing bounds it.** 64 ms at 68 KB, 144 ms at 11.8 MB,
**1.45 s at 313 MB**. ESC-19's survey records one comparable product's session data reaching 700 MB to
2 GB and ESC-9 leaves retention unbounded, so a multi-second window is a state this design permits.

**10.4 No requirement states a budget for any of this.** The specification was searched for one. The only
numeric budget in the neighbourhood is `REQ-SHELL-150` — a gesture acknowledged within **100 ms**, the
interval between repaints of a surface with pending changes never above **120 ms** — and it binds the
shell, which is a different process from the one doing this work. `REQ-SESSION-201` bounds the *backup*
("MUST NOT pause, delay, throttle or otherwise disturb a run") and says nothing about the restore's
duration, which is coherent, because the restore is refused while anything is live. **Verdict on "does
anything exceed a budget the specification states": nothing does, because the specification states none.**

---
