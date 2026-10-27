# ADR-0055 — Startup sequencing, the instance claim, and the first-paint budget — Alternatives considered

Part 2 of 17 of [ADR-0055](../0055-startup-sequencing.md), which indexes every part.

## Alternatives considered

### For the instance claim

**I — Our own record file, resolved by our own discipline.** A small file in the per-user data
directory holding pid, host and a hand-over endpoint, claimed by atomic exclusive create, probed and
reclaimed by exactly the logic `REQ-SESSION-047` applies to a session lock, with a socket or named pipe
for the hand-over. **Chosen, on measurement, 2026-09-02.**

*For:* it is visibly the same idiom as the session lock, which `REQ-STARTUP-164` explicitly asks for,
and every constant in the requirement — the 5 s wait, the one reclaim, the two claim attempts — is ours
to set and to test. Nothing is inherited from a component whose behaviour we do not control.
*Against:* it is a cross-platform IPC endpoint and a stale-detection protocol written from scratch, on
the critical path of every launch, in the one place where a bug makes the product unlaunchable rather
than merely wrong. It duplicates something the platform layer already ships, and it would have to be
correct on three platforms with three different ideas of what a process handle means, including the
`REQ-SESSION-054` hazards — pid recycling, and Windows reporting an exited process as alive while any
handle to it survives.

*What measurement has since established about that "against".* **Its first clause is false and its
second and third stand.** "It duplicates something the platform layer already ships" was the load-bearing
half, and there is nothing to duplicate: the primitive does not implement `REQ-STARTUP-164`'s discipline
at all. Against a primary that was running but not pumping messages it performed **no reclaim, no second
claim attempt, and no bounded wait** — it blocked for 20.0 s and returned `false`. So the choice was never
between writing the discipline and inheriting it; it was between writing it and not having it. The other
two clauses are unaffected and are now the real cost of this alternative, and they are stated as
consequences rather than talked down: the endpoint and the stale-record protocol are ours, on the launch
path, and the `REQ-SESSION-054` hazards are ours to resolve — which the product must do for the session
lock anyway, and which is exactly why `REQ-STARTUP-164` names that lock's discipline as its lineage.

**II — The platform's single-instance primitive.** Electron's `app.requestSingleInstanceLock()`, which
returns whether this process obtained the lock, with the `second-instance` event delivering the other
launch's `argv`, working directory and an `additionalData` object to the primary. **Was chosen. Refused
on measurement, 2026-09-02** — see the verification section below, which is where the numbers are.

*For:* it is one call and one event; the record lives in the per-user data directory, satisfying every
observable `REQ-STARTUP-161` states — one per user account, outside every workspace, not a preference
key, released when the process ends, no elevation; the stale-record probe and reclaim are the
platform's, written against each platform's own process semantics; and on macOS it composes with the
convention that a second launch of a bundle does not create a second process at all.
*Against:* the 5 s bound, the at-most-one-reclaim and the no-spin guarantee of `REQ-STARTUP-164` become
properties of a component we did not write. **That is a verification obligation, not an assumption**,
and it is discharged below rather than waved at.

*A second objection, found on 2026-09-02 and not previously recorded, because it comes from a requirement
this record had never read against the claim.* `REQ-STARTUP-121` requires the update restart to be a
**hand-over**: "the record of `REQ-STARTUP-161` passes from the current instance to the successor rather
than being released for anyone to claim". **The platform primitive has no pass operation.** It offers a
claim and a release, and this record's own decision states that the release is never called. So the one
verb the requirement names is the one verb the component does not have, and the gap is not cosmetic — the
requirement is explicit that a launch arriving mid-hand-over "SHALL be handed to whichever of the two
holds the record at that moment and SHALL never start a third process", which is a statement about there
being no moment when the record is unheld. Alternative I would have this for free, since a record we own
can be rewritten in place. **This was recorded as the strongest argument alternative I had. It is no
longer the strongest and it is no longer an argument: the claim has moved, and this gap closes with it**
— see the restart section, where the concession this record used to make is withdrawn.

*What the measurement confirmed about alternative II's "for", which must be carried forward rather than
lost with the primitive.* Everything the primitive was chosen **for**, apart from the reclaim it turned
out not to perform, was measured and holds — and each item becomes a requirement on the replacement
rather than a benefit surrendered:

- **Claim latency is negligible.** `requestSingleInstanceLock()` returned in **3.3–7.1 ms**, and 65
  consecutive failed calls from one process cost 0.97–2.11 ms each. Our exclusive create must stay in
  that order; it is inside the launch-to-first-paint span.
- **A record left by a force-killed holder does not strand the product.** The claim became available
  within a **67–69 ms** window of `taskkill /F`, bracketed by a 62 ms poller, and a fresh launch
  reacquired it on the **first attempt at +187 ms**, with a window at +345/+373 ms. That 187 ms was
  dominated by process startup, not by the claim: Electron's own floor from spawn to the first line of
  `main.js` was 137–154 ms on the same machine.
- **The probe leaves the probed process unaffected.** 65 consecutive probes plus 4 discrete ones; primary
  alive, pid unchanged, its own 500 ms heartbeat uninterrupted, window intact, no signal.
- **A declared field is required, because `argv` really is mangled.** The `second-instance` payload
  carried `additionalData.workspace` verbatim and `workingDirectory` correctly, while `argv` arrived with
  **`--allow-file-access-from-files` appended and the application-path argument moved to the end.** This
  record predicted that from documentation; it is now measured. The prediction outlives the primitive:
  under alternative I the workspace directory is resolved by the launching process and sent as a declared
  field, and the receiving side never re-derives it from a command line.

**III — No single-instance record; rely on the session lock alone.** Recorded because it was the
product's shape before SR-1 and because it is the alternative a reader will ask about. Two application
processes could coexist; each session was protected by its own lock, so no session could be corrupted.
*Against:* it is what SR-1 withdraws, and the reasons are elsewhere in the record — the filesystem
became a transport, a session could be live somewhere this application could only watch, and polling
followed from having no channel to push over. It is not available.

### For the paint sequence

**A — A single renderer bundle loaded from the local filesystem, with main doing the sequencing.**

*For:* simple; the toolchain's default output.
*Against:* nothing inherently, but it does nothing to help the 5 s budget either. The budget must hold
for the **single-file portable artifact, which self-extracts before the process even starts**, and for
the application image, which mounts a compressed filesystem. Because the budget is stated with **no
per-flavour differential**, the slowest artifact sets the target and the renderer's own load time is the
part we control.

*What measurement has since established about this argument.* It was right that the portable's
self-extraction sets the target and wrong to imply the renderer's load time could be traded against it.
On the portable the extraction consumed **13.3–19.6 s of a 5 s budget** and left nothing at all for the
application; no choice about the renderer bundle was going to matter. On the flavours that pass,
packaging and runtime consume **0.6–1.6 s** and the payload's *weight* is nearly free — 327 MB of extra
payload moved first paint by about 10 ms. **The lever was never bundle size and never the renderer's
load path; it was the extraction mechanism**, and SR-7 changed that (ADR-0054 alternative P4). The
renderer's load time is still the part we control, but it is being spent out of a 3.4–4.4 s budget
rather than out of a deficit.

**B — The same, plus an explicit paint-first discipline.** The window is created hidden, loads a shell
that paints the chrome and the default view from **stored state only**, and is shown when it is ready;
everything that could block is deferred behind the show. Chosen.

*For:* it is what the startup order already describes, and it gives "the complete default desktop is
painted and visible before the modal chooser opens" a mechanism rather than a hope. It also makes
"constructing a window without showing it produces no network traffic" **structurally true**, because
every network path hangs off the show event.
*Against:* requires discipline about what the first paint depends on: any wait on a workspace read, a
version-control probe, a provider catalogue or a session load moves into the deferred phase or the
budget goes.
