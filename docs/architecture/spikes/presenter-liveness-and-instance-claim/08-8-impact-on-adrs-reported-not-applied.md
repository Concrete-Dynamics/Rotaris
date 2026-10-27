# Spike — the wedged presenter, and the single-instance claim on Windows — 8. Impact on ADRs — reported, not applied

Part 8 of 9 of [the spike report](../presenter-liveness-and-instance-claim.md), which indexes every part.

## 8. Impact on ADRs — reported, not applied

No ADR, `constraints.md`, `README.md` or `open-questions.md` file was edited by this spike. The following
is what the measurements say about those records.

**ADR-0019 — approvals and the presenter capability.**
1. The channel-level liveness heartbeat **works as designed** for detection, and the state it detects is
   real and reproducible. The record's existing sentence that the `ipc-hop-latency` spike "did not measure
   a main that was showing a dialog" can now be closed for the dialog `REQ-TOOLS-063` specifies: a modal
   `BrowserWindow` costs the poll nothing (§4.4).
2. Obligation 3 needs to be **restated more strongly and more narrowly**. It currently reads as a
   constraint on how the approval dialog is shown. The measurement says the exposure is not the approval
   dialog at all — it is every **synchronous native** dialog the product raises anywhere, most of which
   belong to other domains (`REQ-WORKSPACE-009`, `REQ-SHELL-011`, `-021`, `-119`, `-163`). The obligation
   that actually protects the design is: *no synchronous platform-dialog call may ever be made on main.*
   That is an application-wide rule, and nothing in the current text puts it where the people writing the
   workspace chooser or the close guard would read it.
3. The consequence that registration "is revoked automatically when the channel to main closes … without
   a timeout" is **not reachable from the run host** for a dead main, because the run host dies first
   (§4.5). Either the ADR should say that the main-died case is handled by the run host ceasing to exist,
   or the topology has to change. As written it describes a revocation that never runs.
4. `REQ-SHELL-119`'s **"Quit while run is active?"** is worth calling out by name in the record: it is a
   native message box raised precisely when an approval is most likely to be in flight.

**ADR-0055 — startup sequencing and the instance claim.**
1. The verification obligation is **discharged on Windows and fails**. Observation 2 does not hold: 20.0 s
   against a 5 s bound, no reclaim, no retry, no window, and a hand-over that is dropped rather than
   delayed. By the ADR's own stated rule, **alternative I — our own record file — is adopted for the
   claim, and this is not a decision the ADR left to a later reading.**
2. The reason the primitive cannot be wrapped is now a measurement rather than an argument: the call is
   synchronous on the launching process's main thread and takes no timeout.
3. Everything else the ADR chose the primitive *for* was confirmed and should be carried into
   alternative I as a requirement on the replacement, not lost with the primitive: sub-5 ms claim latency
   (§5.1), release within ~70 ms of a force-kill (§5.2), a probe with no effect on the probed process
   (§5.4), and `additionalData`-style declared-field delivery — because `argv` **was** measurably mangled
   (§5.1) exactly as the ADR predicted.
4. The record's "on all three platform keys" is **two thirds unmet** (§5.5). Adopting alternative I does
   not remove that obligation, it relocates it: a hand-over endpoint and a stale-record protocol we write
   ourselves must be verified on macOS and Linux too, and on macOS must additionally compose with the
   convention that a second launch produces no second process.
5. The 20 s hole and ADR-0019's wedged presenter are **the same host state seen from two sides**. A main
   that stops pumping messages both (a) fails the approval liveness poll and (b) swallows the instance
   hand-over. Whatever detects one is in a position to inform the other, and the two records currently
   reason about it independently.

**ADR-0002 — process topology.** §4.5 is a topology fact the record does not currently carry: a
`utilityProcess` run host **does not outlive main** on Windows (gone in 207–341 ms), so nothing that must
happen after main dies can be placed in the run host. §4.4 adds a second: the run host ⇄ renderer direct
`MessagePort` is the **only** transport in the tree that survives a blocked main, which is a robustness
argument for those ports that is independent of the throughput argument already recorded.

**`constraints.md` T-31 (HARD).** The *never a hang* half is reachable, with the two conditions in §6.
The row as written does not mention that reachability depends on an application-wide prohibition on
synchronous native dialogs, and on this evidence it should.

---
