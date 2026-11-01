# Open questions — Spikes, and the questions raised since (1 of 35)

Part 34 of 68 of the [open-questions record](../open-questions.md), which indexes every part.

## Spikes required before the Architecture Gate closes

These are not open questions — they are measurements the record's decisions rest on. Each names the ADR
that changes if it fails.

**Numbers are stable and are never reused.** ADRs cite spikes by number, so a spike that is withdrawn
keeps its number as a tombstone (spike 9) and a spike whose subject changed keeps its number with new
content (spikes 8 and 19), exactly as constraint D-28 is handled. **Twenty-two numbered, one withdrawn,
EIGHT discharged and one discharged for Windows only — TWELVE outstanding.**

### What is outstanding is not one kind of thing, and the gate depends on the difference

A list of twelve outstanding measurements reads as twelve equal debts. It is not. As of the
restore-measurement round of 2026-09-02 the outstanding spikes fall into three groups plus a set of
sub-cases, and the last two are the ones that bear on the gate.

**(a) Genuinely not started, and owed by this record.** Spikes 2 to 8, 11, 13, 15 and 18. Nine of the
twelve. None of them blocks a decision that has already been taken; each of them prices one that has.
**Two of these grew in the measurement round.** Spike 8 now also owes the cost of `REQ-EVENTS-179`'s write
probe on the startup path, and the store's behaviour against a **real schema** — every measurement so far
used three tables with two primary keys and one listing index, and every additional index on the transcript
table adds write-ahead-log frames per insert and therefore moves **both** the commit cost and the checkpoint
period. Spike 18 now also owes **two run hosts** contending, which `REQ-TOOLS-089` and `REQ-SANDBOX-038`
permit and which spike 21 did not measure: only run-host-against-workspace-service was.

**(b) Cannot be run on this machine at all, and no amount of care here changes that.** **Spike 12** (the
Linux image's runtime on an unmodified baseline installation) needs a Linux machine that has never had
the legacy FUSE library installed. **Spike 17's two remaining platform keys** need a macOS machine and a
Linux machine of their own keys, because `REQ-STARTUP-155` binds all four artifacts and
`packaged-first-paint.md` built only the Windows two. **ADR-0056's build-time load proof** (below, an
unnumbered sibling obligation) must run on all three release runners. These are **build-host**
obligations, not architecture ones: they need infrastructure, they will not be closed by anyone reasoning
harder, and stating them as merely "outstanding" understates what it takes to clear them. ESC-11's choice
between its options turns on spike 12 and will stay open until a Linux host exists. ***One of these grew
materially on 2026-09-02***: ADR-0055's instance claim moved off the platform primitive on measurement, so
the claim, the hand-over endpoint and the stale-record protocol are now **ours on three platforms and
measured on one**. The verification is relocated rather than discharged, and `REQ-STARTUP-156`'s release
gate does **not** require launching the entry point twice on one user account — which is
`REQ-STARTUP-152`'s release-checkable form of SR-1, and the check that would catch a failure there.

***(c) The group that held spike 22 is now EMPTY, and what it left behind is a different kind of debt.***
This group read: "an architecture-side gate item that has never been run in its load-bearing half — spike
22, `REQ-SESSION-201`'s backup and restore … its restore half has not been executed in any part". **It has
now been executed and the mechanism did not work.** What replaces the group is not a spike but **eleven
defects**, three of them corrected and eight not, all of them in the gate verdict in
[`README.md`](../README.md) §6 rather than here, because a defect with an owner is not a measurement. *The
distinction this group existed to protect still holds and now points the other way: **an unmeasured
mechanism was the risk, and the risk was real** — it did not merely fail to be evidence, it concealed a
mechanism that could not complete.*

**(d) Sub-cases left unmeasured inside spikes that otherwise passed, listed rather than absorbed.** Now
**four**, and they are listed separately because a sub-case folded into a discharged spike is a gap nobody
can see afterwards. **`REQ-STARTUP-165`(c)'s "no usable preparation at all" branch and its notice**, not
attempted by spike 20 — it is the only part of that requirement left untouched, ADR-0054 wrote it from
scratch on 2026-09-02 against the amended text, and its failure mode is a **missing warning**, which is the
outcome the clause exists to prevent. **ESC-21's second premise** — whether two machines on one synchronised
folder can each succeed at exclusive create on the same lock name — which spike 19 stated precisely,
called one afternoon's work, and refused to fake *(2026-10-13: not owed while worktree integration, the lock's
only user, is unbuilt and deferred; it then needs the owner's two machines — README B2)*. And two from spike 22: ***the re-run of the corrected
restore***, which is owed because all three corrections are at this moment exactly the paper reasoning that
the three-for-three finding says is not evidence; and ***the kill-in-the-gap case***, which is now the only
route to an absent store directory that those corrections do not close *(measured 2026-10-13 by
`pnpm restore-kill-proof`, ten kills of ten: the disk is the model's, and the next open creates an empty store —
[OQ-266](../../archive/architecture/open-questions/57-spikes-and-later-questions-24.md#oq-266))*. **The re-run is the one of the four
that a product owner should weigh at the gate**, because it is a re-measurement of a mechanism already known
to have been wrong three times, and it is bounded: race a launch into the refusal window, and force the
install rename to fail on an occupied name.

### What has been measured, and what each report did not settle

Nine reports exist, in [`spikes/`](../spikes/) — eight for live spikes and one for a withdrawn one — four
dated 2026-09-01 and five dated 2026-09-02. **They are the only real evidence this record has, and several
of them overturned something it asserted.** Where they did, the overturned claim is preserved beside its
replacement in the ADR that carried it, and the entries above say which. **In the four of 2026-09-02 that
answered questions, what was overturned was more often a *reason* than a *conclusion*: every owner ruling
survived, three platform facts this record asserted were disproved, and one ADR's own stated gate trigger
fired. THE FIFTH DOES NOT FIT THAT PATTERN AND MUST NOT BE READ INTO IT** — spike 22 overturned a
*mechanism*: `REQ-SESSION-201`'s restore, decided on paper and never run, could not complete at all.

| Report | Spike | Discharged | Explicitly **not** settled |
|---|---|---|---|
| `ipc-hop-latency.md` | **10 — discharged** | ADR-0002's double-hop Revisit-if; ADR-0044's structured-clone trigger and its channel-isolation claim; `REQ-MONITOR-222` (p95 1.133 / 1.291 ms vs 250 ms), `REQ-MONITOR-223` (ratio 1.14 vs 2), `REQ-ORCH-155` (p95 5.951 ms vs 100 ms as SR-8 reads it) | **the commit `REQ-MONITOR-221` requires before publication**, which the report states is outside its interval, so every figure is a lower bound; fan-out to several windows; concurrent runs; the reconcile path (`refused = 0` everywhere); a real renderer |
| `packaged-first-paint.md` | **17 — discharged for Windows only** | that the `onefile` portable fails `REQ-STARTUP-155` at 13,287–19,580 ms across four bundle weights **including a zero-payload build**, with no packaging setting closing the gap; that bundle weight is close to free (~10 ms across 327 MB) on the flavours that pass. **It triggered SR-7** | the macOS `.dmg` and the Linux AppImage — **neither was built**, and `REQ-STARTUP-155` binds both; the harness "contains no product" — no persistence, no native module, nothing ADR-0055 puts before first paint |
| `renderer-invariance-and-benchmark-cadence.md` | **1 — discharged** | both counting rules against a running window (OQ-28); the tail-phase memory tripwire; that the reachable viewport is not knowable at construction (OQ-40); that ADR-0053's paint settle does not work and that `invalidate()` is worse than the timeout | whether a rAF settle and a paint settle measure the **same interval** where both resolve; the real component rather than a mock shell — the element counts and timings are stated as a **floor** |
| `windows-writer-handle-compaction.md` | **9 — withdrawn** | historically: that deleted rule 3 was right (0 of 115 trims, no observable symptom, ~73× throughput collapse), and **three corrections that outlive its subject** — what actually blocks a replace, that share-delete *is* requested, and that a directory `fsync` works on a write-opened handle | whether a replace survives a **power cut**, on any platform. The report declined to claim the guarantee from a success return. **And its directory-`fsync` figure is qualified by spike 19**, which found the same call failing on every spelling including local; the reconciliation is handle mode and is *inferred* (OQ-12) |
| `commit-on-the-publish-path.md` | **21 — discharged** | ADR-0058's own open item on the commit; `REQ-MONITOR-221` (0.396 ms p50 / 0.700 ms p95, work not a wait), `REQ-MONITOR-222` (p95 1.774 / 1.723 ms vs 250 ms), `REQ-MONITOR-223` (ratio 0.971 vs 2), `REQ-ORCH-155` on both readings, `REQ-EVENTS-029` (marginal cost −4 to +31 µs), `REQ-SESSION-067`/`-068`/`-072`; that the checkpoint period is arithmetic (7.44 frames per commit → every 135–136 commits at 9–11 ms p50); **that `REQ-SESSION-070`'s readability clause does not need the stronger durability setting**; that ADR-0002, ADR-0008 and ADR-0010 are not reopened | **a real schema with declared indexes** (spike 8); **two run hosts** contending (spike 18); **any failure path at all** — no torn write, no corruption, no disk-full, no read-only volume; packaging, so the native module's asar-unpacking obligation is untested; **power loss**, which is now the sole ground for forcing the stronger setting; macOS and Linux; the trim's own latency and the ring displacement's own cost |
| `remote-and-synchronised-storage.md` | **19 — discharged on its own question; it could NOT decide ESC-21's strength and says so** | ESC-15 supported on stronger evidence **and its stated mechanism disproved in two of three links**; ADR-0058's journal read-back as necessary-but-**insufficient**; that a naive copy of a live store is not a backup (625/627 unopenable) and the engine snapshot is (8/8, median 1,077 ms per 41 MB); ESC-21 premise 1 (2,500 races, one winner in 2,500); `REQ-STARTUP-166`'s classification as implementable, precise and cheap; `REQ-GIT-124`'s ordering confirmed | **ESC-21 premise 2 — no second machine, and it declined to fake one**; no synchronisation client was written to; **no Electron**, host Node with a prebuilt binding; one store-engine version, one binding; loopback rather than a network, so the 12 ms rename and the 6.2 % failure rate are **floors**; exclusive create against a dehydrated cloud placeholder; no power loss |
| `cached-portable-launch.md` | **20 — discharged; SR-7's gate condition met** | the cached-launch figure (575.5–723.1 ms warm, 897.3–1,414.6 ms cold vs 5,000 ms); the fast-path check (0.14–0.49 ms, against 709.6–845.0 ms for the cheapest digest it rejects); cache invalidation across an update (**did not fail**); that `REQ-STARTUP-125` is **rescued** rather than merely preserved by SR-7; **two defects in ADR-0054's own mechanism** — the commit could not commit, and the completeness check returned a hit on a preparation that produced no window | **clause (c)'s "no usable preparation at all" branch and its notice — not attempted**; clause (d) independently verified (no network capture, no privilege trace); a real read-only volume rather than an access-control approximation; the commit's durability discipline, so a power loss could leave a torn tree behind a valid marker; a real download with the platform's reputation check; a larger bundle or fewer cores |
| `presenter-liveness-and-instance-claim.md` | **14 and 16 — 16 discharged and ADR-0055's own rule FIRED; 14 measured and OQ-39 NOT closed** | that the liveness poll works and **must be gap-based**; that the exposure is every **synchronous native dialog** and not the approval dialog; that the run host dies with main in 207–341 ms and never sees the channel close; that no platform signal for an unresponsive main is usable from a utility process; that the platform single-instance primitive **fails** `REQ-STARTUP-164` on Windows (20.0 s, no reclaim, no window) | **macOS and Linux — zero coverage, on both sides of the decision, and this is the largest single gap**; the decision path (no gate, no pending-approval map, no headless policy), so *never a silent allow* is **unexercised**; **sizing the lapse window under product-shaped load**; whether every native dialog has a non-blocking form on every platform; packaged builds; the cross-platform hand-over endpoint, which has **no measurement anywhere behind it** |
| `backup-restore-mechanism.md` | **22 — discharged; the mechanism it measured DID NOT WORK** | that ADR-0058's restore as written fails **0 of 30** at the install rename, because nothing closes the staging connection; that the liveness gate is evaluated before runs are refused and a run admitted in that window **is destroyed by the swap**, measured mid-write; that the reversal fails identically wherever the install failed on an occupied name; that all three refusal gates are correct including the older-schema case that must **not** refuse; that ADR-0005 consequence 11 is vindicated **against its own counterfactual**; ESC-26's three identifier cases and all five unreadable shapes; the one-rename installation (20 of 20 gap observations, absent and never mixed); the whole cost curve — store unavailable 64 ms / 144 ms / **1.45 s** across 68 KB / 11.8 MB / 313 MB, renames flat at 3–5 ms; ADR-0056's owed Electron-ABI figure, whose answer is that **no rebuild is needed for this binding** | **the corrected mechanism — none of the three fixes has been run**; **the kill-in-the-gap case**, which is now the only route to an absent store directory the fixes do not close; a restore of an artifact read from a network destination; **two concurrent restores of one identifier**, so the instance claim is unmodelled; packaging, so the asar-unpack obligation is **still** untested; any user interface, so every "the product must convey" clause was tested by showing the *values* exist and never by rendering; and **eight defects it found and did not fix** — see [`README.md`](../README.md) §6 |

**A note a reader should not have to work out.** Two of the nine measured a design that no longer
exists — the file-based journal and compaction that SR-4 removed, and the packaging target SR-7 replaced.
Neither is therefore wasted: what generalises from the writer-handle report is a **diagnosis** (an
append-and-compact file whose writer holds it open is a silent cap-enforcement failure) and three factual
corrections, and what generalises from the first-paint report is that the packaging *mechanism*, not the
bundle weight, was the cost. Both are cited above and in constraints D-27, D-28 and B-03.

### What is new

***Spikes 20, 21 AND 22 have been run and all three are discharged. No new spike is owed that was owed
before, and the sentence "spike 22 has not been run at all and is now the only new one still owed" is
withdrawn.*** Spike 20 was required before the gate by SR-7's own words and its condition is met. Spike 21
was required because the whole persist-before-publish design rested on a number nobody had taken, and that
number exists. Spike 19's question changed with ESC-15 and it keeps its number.

**Spike 22 — `spikes/backup-restore-mechanism.md`, 2026-09-02. Discharged, and it is the one that
found the most.** It was required because `REQ-SESSION-201`'s backup and restore is the largest mechanism
the record has ever added on one pass and its restore half had never been executed in any part.
**The headline is that the restore as ADR-0058 wrote it fails on this platform in 30 of 30 attempts** — the
staging store is opened read-write, no step closes it, and the rename of that directory is refused
`EPERM`; closing it first passes 30 of 30. Two further defects matter as much: the liveness gate was
evaluated **before** the run host was told to refuse runs and nothing re-checked, so a run launched in that
window took the lock, wrote at twenty rows a second, was asked to close mid-write, complied, **and had its
session and every row destroyed by the swap**; and the reversal **fails in the case it exists for**, with
the identical error, leaving a store directory holding no database and the real store under a timestamped
name. **All three are corrected** — in ADR-0058, in an amended `REQ-SESSION-201` and in a new
`REQ-SESSION-202` — and **eight further defects the spike found are not**, which is why the spike is
discharged and the mechanism is not clean. The eight are enumerated in [`README.md`](../README.md) §6.

**What it confirmed is as load-bearing as what it broke**, and is recorded so no later pass disturbs it:
all three of ESC-26's identifier cases including the confirmed establishment, and all five unreadable
identifier shapes left byte-unchanged; all three refusal gates, including the older-schema case that must
**not** refuse; ADR-0005 consequence 11's lock-row correction against its own measured counterfactual —
without it, sessions live at backup time arrive **permanently** locked; the one-rename installation, with
20 of 20 gap observations seeing an absent store directory and never a mixed one; and the displaced store
retained, openable, with its bodies intact. It also priced the mechanism: the store is unavailable for
64 ms at 68 KB, 144 ms at 11.8 MB and **1.45 s at 313 MB**, while the two renames themselves are flat at
3–5 ms at every size, and the whole thing runs under Electron 44.1.0 in real utility processes with a
window painting at a main-process event-loop lag of 6 ms p50 and 13 ms max.

***Two sub-cases it could not reach, listed here rather than absorbed into the discharge.*** **(1) A
re-run of the corrected mechanism.** All three fixes are, right now, exactly the paper reasoning that
consequence 17 says is not evidence. The re-run must race a launch into the window between the refusal of
new runs and the run host's acknowledgement and confirm the second liveness evaluation catches it, and must
force the install rename to fail with the target name occupied and confirm the displace-then-rename
reversal leaves the store byte-identical. **(2) The kill-in-the-gap case.** What a restore interrupted
between the two renames leaves behind, with no process left to reverse anything. It is now the only route
to an absent store directory that the corrections do not close, and no power-loss or kill test was
performed. *(The kill test was performed on 2026-10-13: [OQ-266](../../archive/architecture/open-questions/57-spikes-and-later-questions-24.md#oq-266). The power-loss test is R-071's O-8.)* *A third, adjacent and not owed by the spike:* a restore of an artifact read from a network
destination, and two concurrent restores of one identifier, neither of which the instance claim was
modelled against.

***A methodological finding worth carrying, because it is evidence for the design rather than against
it.*** An earlier in-process version of the spike's own gap observer broke the displace rename with its own
transient handle. That is ADR-0004 rule 1 appearing unbidden inside a measurement harness, on a platform
where a single held handle anywhere inside a directory is fatal from any process.

**Two measurements are owed and are deliberately not numbered.** A **power-loss test**, which is now
larger than it was: it is OQ-12's outstanding half, and since 2026-09-02 it is also the **sole stated
ground** for forcing the stronger durability setting on a terminal save, because the readability clause
that used to carry that decision was tested and does not need it. And a **rebuilt-for-Electron
confirmation run of the storage measurements**: spike 19 ran host Node with a prebuilt binding, spike 21
rebuilt against the Electron runtime but measured different questions, and neither exercised the store
under a packaged build — so the first-statement failure `REQ-EVENTS-179` now governs was measured on one
binding on one machine.
