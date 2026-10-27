# Rotaris-crw — system architecture — The measurements

Part 12 of 13 of [the architecture README](../README.md), which indexes every part.

### The measurements

**Twenty-two numbered spikes: one withdrawn, TEN discharged, one discharged for Windows only —
TEN outstanding** *(counts corrected 2026-09-03 when spikes 8 and 18 were taken with the session writer; spike 6 was taken in its structural half with the run loop the same day and its live half is owed, so it stays counted as outstanding)*. Numbers are stable and never reused; a withdrawn spike keeps its number as a
tombstone. What matters more than the count is the split in the gate verdict above: **nine have never been
started, three need a build host that does not exist here, and four sub-cases went unmeasured inside spikes
that otherwise passed.** *The line this paragraph used to carry — "one (22) is new and load-bearing and has
never been run in its restore half" — is withdrawn; spike 22 has been run, and what it left behind is a list
of defects rather than a list of measurements.*

THIRTEEN reports exist, all in [`spikes/`](../spikes/) — eleven for live spikes, one for an implementation condition, and one for a withdrawn one:

| Report | Spike | What it settled | What it did not |
|---|---|---|---|
| `ipc-hop-latency.md` | **10 — discharged** | ADR-0002's Revisit-if and both of ADR-0044's; `REQ-MONITOR-222`, `REQ-MONITOR-223` and `REQ-ORCH-155` at p95; that a channel name is not a transport | the commit on the publish path (**since measured — spike 21**), fan-out to several windows, concurrent runs, the reconcile path, a real renderer |
| `packaged-first-paint.md` | **17 — discharged for Windows only** | that the `onefile` portable fails `REQ-STARTUP-155` at every weight including zero; that bundle weight is close to free on the flavours that pass. **It triggered SR-7** | macOS `.dmg` and Linux AppImage — neither was built, and `REQ-STARTUP-155` binds both. It also has no product in it: no persistence, no native module |
| `renderer-invariance-and-benchmark-cadence.md` | **1 — discharged** | both counting rules against a running window — **which is what the specification then amended `REQ-UIBENCH-050` and `REQ-UIBENCH-054` against**; the memory tripwire; that the reachable viewport is not knowable at construction; that ADR-0053's paint settle does not work | equivalence of a rAF settle to a paint settle where both resolve; the real component rather than a mock shell |
| `windows-writer-handle-compaction.md` | **9 — withdrawn** | historically: that the deleted rule 3 was right, and **three corrections that outlive its subject** (share-delete *is* requested; a directory flush works on a write-opened handle; what actually blocks a replace, and what closes it) | whether a replace survives a power cut, on any platform; and every filesystem but `C:` NTFS — the storage spike has since covered network shares and contradicts its directory-flush figure on a read-only handle (section 3) |
| `commit-on-the-publish-path.md` | **21 — discharged** | ADR-0058's own open item on the commit; `REQ-MONITOR-221`, `REQ-MONITOR-222`, `REQ-MONITOR-223`, `REQ-ORCH-155` and `REQ-EVENTS-029` **with the commit in the interval**; the checkpoint period as arithmetic; that the readability clause does not need the stronger durability setting; that ADR-0002, ADR-0008 and ADR-0010 are not reopened | a real schema with declared indexes (spike 8); two run hosts contending; **any failure path at all**; packaging and the native module's unpacking obligation; power loss, which is now the sole ground for forcing the stronger setting; macOS and Linux |
| `remote-and-synchronised-storage.md` | **19 — discharged on its own question** | ESC-15 on stronger evidence, and its stated mechanism disproved; the read-back guard as necessary-but-insufficient; that a naive copy of a live store is not a backup and the engine snapshot is; that exclusive create is a genuine primitive over a network share; that `REQ-STARTUP-166`'s classification is implementable, precise and cheap | **ESC-21's second premise — no second machine, and it declined to fake one**; no synchronisation client was written to; no Electron; one binding, one store engine version; loopback rather than a network, so the 12 ms rename and the 6.2 % failure rate are both floors; no power loss |
| `cached-portable-launch.md` | **20 — discharged; SR-7's gate condition met** | the cached-launch figure, the fast-path check's cost, cache invalidation across an update; that self-update is **rescued** rather than merely preserved by SR-7; **two defects in ADR-0054's own mechanism** — the first two of the four-for-four finding above | `REQ-STARTUP-165`(c)'s "no usable preparation at all" branch and its notice — **not attempted**; clause (d) independently verified; a read-only volume rather than an access-control approximation; the commit's durability discipline; a real download with the platform's reputation check |
| `presenter-liveness-and-instance-claim.md` | **14 and 16 — 16 discharged and its ADR's rule fired; 14 measured, OQ-39 not closed** *(ruled 2026-10-06, [R-071](../../product/requests.md#r-071): accepted as built)* | that the liveness poll works and must be **gap-based**; that the exposure is every synchronous native dialog and not the approval dialog; that the run host dies with main and never sees the channel close; that the platform single-instance primitive **fails** `REQ-STARTUP-164` on Windows | **macOS and Linux — zero coverage, on both sides of the decision**; the decision path (no gate, no pending-approval map, no headless policy), so *never a silent allow* is unexercised; sizing the lapse window under product-shaped load; whether every native dialog the product needs has a non-blocking form on every platform; packaged builds |

| `store-schema-and-open-path.md` | **8 — discharged** | the declared indexes' cost on the commit (+37 % p50) and on the checkpoint period (below 100 commits); `REQ-EVENTS-179`'s probe at 0.15 ms; whole log recovery after a kill; that an integrity check (~2.8 ms/MB) may **not** sit on the startup path; listing and summary as index reads; the trim's delete at ~35 ms; **that a declared index the planner never used had passed every test** — the fifth of the finding above | `REQ-TRACE-239`'s board (no table yet); any failure path but the kill; macOS and Linux; Node's long-path behaviour on the identifier file *(measured 2026-10-21 on Windows ARM64: minted and read at 198–328 characters; the engine's 251 holds on arm64)* |
| `two-writers-one-store.md` | **18 — discharged** | two compliant writers on one store lose nothing and cost +12 % at p50; one 258 ms sample in 6,000 | three writers; a reader beside them; the trim under contention |
| `machine-identifier-rename.md` | **IC-4 — half 1 discharged; half 2 prepared, awaits the owner's rename** | the foreign-lock report as one condition with the risk stated, three ways | `host` under a real rename and reboot — the harness is written and gated |
| `credential-protection.md` | **ADR-0029's Windows protection spike — taken 2026-09-05** | `icacls` with SID literals applies the list and `icacls /save`'s SDDL reads it back exactly; the staged file's protection travels with the rename; ~120 ms per file | `/inheritance:r /grant:r` alone leaves a foreign explicit entry in place — only the read-back caught it (`/reset` precedes the grant now); `/restore` needs a privilege the product lacks; `/reset` takes no companion option | a non-NTFS volume; an elevated or service context; POSIX with IC-3 |
| `responses-dialect.md` | **6 — taken, both halves (live: 2026-09-05, OpenRouter)** | both dialects reach their paths under one arbitrary base URL through the pinned SDK; the credential resolved per request and the headers arrive; the log never sees the bearer; usage, finish, deltas, a 401's body and an abort map across the port; that a fake `fetch` which ignores the abort signal reads as an adapter defect | a real responses endpoint — stream shape, latency, usage, error bodies; ADR-0027's fallback stays priced |
| `backup-restore-mechanism.md` | **22 — discharged; the mechanism did not work** | that ADR-0058's restore as written fails **0 of 30**; that a run admitted between the liveness gate and the swap **is destroyed by it**, measured mid-write; that the reversal fails identically wherever the install failed on an occupied name; all three refusal gates including the older-schema case that must **not** refuse; ESC-26's three identifier cases and all five unreadable shapes; **ADR-0005 consequence 11 against its own counterfactual**; the one-rename installation (20 of 20, absent and never mixed); the whole cost curve, store unavailable 64 ms / 144 ms / **1.45 s**, renames flat at 3–5 ms; and ADR-0056's owed Electron-ABI figure, whose answer is that **no rebuild is needed for this binding** | **the corrected mechanism — none of the three fixes has been run**; **the kill-in-the-gap case**; a restore of an artifact read from a network destination; **two concurrent restores of one identifier**; packaging, so the asar-unpack obligation is still untested; any user interface; and **eight defects it found and did not fix** — list A above |

**A note a reader should not have to work out.** Two of the nine measured a design that no longer exists.
Neither is wasted: what generalises from the writer-handle report is a **diagnosis** — an
append-and-compact file whose writer holds it open is a silent cap-enforcement failure — plus three
factual corrections, one of which changed an answer in three separate records; and what generalises from
the first-paint report is that the packaging *mechanism*, not the bundle weight, was the cost.

**Twelve spikes are outstanding and they are not one kind of thing.** **Needing a build host that does
not exist here:** 12 (the Linux image's runtime on an unmodified baseline) and the two non-Windows
platform keys of 17. ***The "new, load-bearing and never run" group is now EMPTY***: spike 22 has been run,
and what it left behind is seven uncorrected defects in list A rather than a spike in this list.
**Genuinely not started:** 2 (Windows access-control
read-back), 3 (tool-server negotiation over our own transport, on which ESC-12 partly turns), 4 (console
suppression), 5 (the reserved-token branch), 7 (the board projection crossing), 11 (parse-cache
behaviour), 13 (forced synchronous commits at recycler-pool scale) and 15 (echo latency). *Corrected
2026-09-03: 8 and 18 were taken with the session writer and are discharged; 6 was taken in its structural
half with the run loop and its live half is owed — the three had been left in this list after their
reports were written.*

**FOUR sub-cases are owed inside spikes that passed, and they are listed here rather than folded into the
parents**, because a sub-case absorbed into a discharged spike is a gap nobody can see: `REQ-STARTUP-165`
(c)'s **no-usable-preparation branch and its notice** inside spike 20; **ESC-21's second premise — two
machines on one synchronised folder** inside spike 19, which is one afternoon's work and whose whole
content is one number, races in which both machines' exclusive create returned success; and two inside
spike 22 — ***the re-run of the corrected restore***, whose two experiments are stated in category B and
which is the only one of the four a product owner should weigh at the gate, and ***the kill-in-the-gap
case***, which is now the only route to an absent store directory that the corrections do not close.

**Two measurements are owed and are deliberately not numbered, and one shrank on 2026-09-02.** A
**power-loss test**, which is now larger than it was: it is OQ-12's outstanding half, and it is also the
**sole stated ground** for forcing the stronger durability setting on a terminal save, since the
readability clause that used to carry that decision was measured and does not need it. **No spike has
killed a process or cut power at any point**, including spike 22, which never killed the restore between
its two renames. And a **rebuilt-for-Electron confirmation run of the storage measurements**, *materially
advanced and not discharged*: spike 19 ran host Node with a prebuilt binding, spike 21 rebuilt against the
Electron runtime but measured different questions, and **spike 22 ran the whole restore under Electron
44.1.0 in real utility processes with a from-source Electron-ABI binding** — which answers the ABI question
underneath it (the binding is Node-API, there is no mismatch in either direction, and no rebuild is needed
for this version) without re-running the storage measurements themselves. **Nothing has been packaged by
any spike**, so the first-statement failure `REQ-EVENTS-179` now governs was still measured on one binding
on one machine and the asar-unpack obligation is untested everywhere.
