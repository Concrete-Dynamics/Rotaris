# ADR-0055 — Startup sequencing, the instance claim, and the first-paint budget — The update restart is a hand-over of the record — and with the claim moved, we have a verb for it

Part 4 of 17 of [ADR-0055](../0055-startup-sequencing.md), which indexes every part.

### The update restart is a hand-over of the record — and with the claim moved, we have a verb for it

`REQ-STARTUP-121` is the one case in which this product starts the application while an instance is
running. It fixes the order — the updated installation is started first; the record passes to the
successor rather than being released; the current window closes only after the successor has started; the
successor keeps running once the current process has exited — and it fixes two negatives: the successor
**is not handed back** to the instance that started it and **does not surface** that instance's windows
(`REQ-STARTUP-162`, `REQ-STARTUP-164`). ADR-0005 and ADR-0032 both already depend on the brief overlap
this produces, so two live processes is a state the record has accepted; what nobody had written down is
how the record moves between them.

**The obvious sequence does not work, and it is worth seeing why before the one that does.** If the
predecessor holds the lock and starts the successor, the successor's own claim **fails** — and a failed
claim is, by phase 0 above, exactly a hand-over: the successor would notify the predecessor, surface its
window and end, which is the outcome `REQ-STARTUP-121` forbids by name. If instead the predecessor
releases first, there is a
window in which the record is unheld and an ordinary launch arriving in it becomes a third instance,
which the same sentence forbids. **Neither ordering is available, so the successor cannot be an ordinary
launch.**

**The decision: the successor is started on the sentinel branch that already exists, and the predecessor
rewrites the record in place rather than releasing it.** In order: the predecessor starts the successor
with the sentinel that marks it not-an-ordinary-launch; the successor performs no claim and no hand-over
attempt, opens its own hand-over endpoint, and signals the predecessor that it is ready; the predecessor
**replaces the record's contents with the successor's `pid`, `host` and endpoint address in one atomic
replacement**, and tells the successor the record is now its own; only then does the predecessor close its
window and exit. `REQ-STARTUP-121`'s failure branch covers every way this stalls — "when the successor
cannot be started, nothing SHALL close" — so a successor that never signals leaves the predecessor holding
the record with its window open and accepting input, which is both the requirement's outcome and the safe
one.

**The concession this record used to make here is withdrawn.** Under the platform primitive there was no
pass operation, so the sequence had to release and re-claim, and between those two calls the record was
genuinely unheld: a launch arriving in that gap became the instance while the successor then failed its
claim and was handed to it. This record called that "not conformant", bounded by two calls, and "the one
place `REQ-STARTUP-121` is met by argument rather than by construction". **With the claim moved to our own
record it is met by construction.** The record is never unheld, because a rewrite is not a release: the
file exists continuously and every launch arriving at any moment reads either the predecessor's fields or
the successor's, which is exactly `REQ-STARTUP-121`'s "handed to whichever of the two holds the record at
that moment". **This is a property the migration buys back, not merely relocates**, and it is the second
reason for it after the measurement.

**Two implementation rules keep that true rather than nearly true.** The replacement must be **atomic** —
write a sibling and rename over, never truncate-and-rewrite, because a reader that observes a
half-written record sees a record it cannot parse and `REQ-STARTUP-164` (3) would then have it reclaim a
record two live processes are relying on. And the rename-over is possible only because **nothing holds a
handle on the record**: the `windows-writer-handle-compaction` spike measured replace-by-rename failing
against any held handle and succeeding against an unheld path, which is why the no-handle rule in phase 0
is stated as load-bearing rather than as a preference. *(Note the contrast with the directory commit
ADR-0054 had to correct: renaming a **directory** onto an existing directory fails on Windows, renaming a
**file** onto an existing file does not. The two lessons are not interchangeable and neither should be
transplanted onto the other.)*

**Two orderings that follow and are easy to get wrong.** The successor is a new artifact version, so on
the portable **its first run is a preparing run** — the exempt one — and on the measured payload the
predecessor therefore holds its record and its window for **roughly 1.6–2.1 seconds, and up to about 3.9
seconds on a single core**. *(This record previously put that at 13–19 seconds, which was the cost of the
extraction mechanism SR-7 replaced and not of the one that shipped in its place; the wait is real and it
is seconds rather than tens of seconds.)* Nothing about that is a failure and nothing may time it out
into one — in particular the successor's readiness signal has no timeout of its own, and
`REQ-STARTUP-121`'s "when the successor cannot be started, nothing SHALL close" is what covers a
successor that never arrives. And the successor
must not be sent through phase 0's ordinary path at all, which means the sentinel branch is now load-
bearing for a third case; **OQ-43 covers two of the three and should be read as covering this one too.**
*(Ruled 2026-10-06, [R-071](../../../product/requests.md#r-071): `PD-STARTUP-002` names all three, the update-restart successor among them.)*

**Amended 2026-09-28 (R-062) — the pass is two steps, because "tells the successor" is not "the successor was
told".** The sequence above has the predecessor rewrite the record and *then* tell the successor. Built that way
(`packages/platform/src/instance.ts`, `passRecord`), it assumed the successor was still there to be told. The successor
bounds its wait for the answer by the hand-over interval, as it must, since an unanswered successor may not become a
rival. If the predecessor's loop was blocked past that bound, the successor had closed and ended, but its announcement
was still buffered. The predecessor then read it, rewrote the record for a process that had gone, and closed its own
window. The record then named nobody running and no instance was left, which is what `REQ-STARTUP-121` and
`REQ-STARTUP-161` exist to prevent. A later launch reclaims the dead pid's record under `REQ-STARTUP-164` (3), but the
user who chose `Restart now` was left with nothing on screen. The note is
`../../../defects/fixed/the-record-can-pass-to-a-successor-that-stopped-waiting.md`. The sequence is now: the predecessor
**offers** the record (`{"record":"offered"}`, deliberately not `ok:true`); the successor **acknowledges**
(`{"ack":true}`), which proves it is still waiting and commits it to take the record; the predecessor waits for that
acknowledgement **at most the hand-over interval, on the timer port**; and only then does it replace the record
atomically, answer `{"ok":true,"record":"passed"}` and close. A successor that closed before acknowledging, or whose
acknowledgement does not arrive within the interval, leaves the record exactly as it was. The restart fails through
`onRecordPassFailed` — `Update not installed`, nothing closes — which is `REQ-STARTUP-121`'s failure branch.
**One reading is stated rather than hidden:** once it has acknowledged, the successor waits for the last word with **no
bound of its own**. From that moment the record may name it, so a successor that gave up then would be exactly the
process the record must never be left naming. The predecessor's own bound, its answer, or its exit ends that wait. If
the connection ends with no last word, the successor reads the record: the pass happened if and only if the record names
it. A predecessor hung for ever between the acknowledgement and the rewrite leaves a windowless successor waiting on it.
That is the mirror of this section's accepted "successor that never signals", and it does not produce a second instance.
The ordinary hand-over of a second launch (`REQ-STARTUP-162`) is unchanged: one line in, `{"ok":true}` out. The
successor's readiness signal still has no timeout of its own; the new bound applies only to the acknowledgement, after
the predecessor has offered.

### Verification obligation on `REQ-STARTUP-164` — taken, 2026-09-02, and it fired

`REQ-STARTUP-164` fixes a 5 second hand-over wait, at most one reclaim, at most two claim attempts, no
spin, no side effect on the probed process, and nothing written but the record. This record made three
observations the condition of keeping the platform primitive, on all three platform keys of
`REQ-STARTUP-030`, and stated the consequence in advance: **"if any of the three does not hold,
alternative I is adopted for the claim and the platform primitive is dropped, not wrapped in a timeout."**
The measurement was taken on Windows. **Observation 2 does not hold. The rule has fired and the claim has
moved, on every platform.**

**Observation 1 — a record left by a process killed without cleanup must not make the application
unlaunchable. PASS.** After `taskkill /F` with no cleanup, the claim was reacquired on the **first
attempt at +187 ms** (2 runs, 4.8–5.0 ms for the call itself) and a window was on screen at
**+345 / +373 ms**. A separate poller calling every ~62 ms across the kill bracketed the release itself
to a **69 ms / 67 ms** window. Nothing close to `REQ-STARTUP-155`'s 5 seconds was consumed. *(The window
here is a harness's trivial one, not a product first paint.)*

**Observation 2 — a recorded process that is running but not answering must be resolved within the stated
interval, at most one reclaim, no spin. FAIL, on Windows, for a primary that is running but not pumping
messages.** Two runs, the second designed specifically to distinguish "delayed" from "dropped":

| | measured |
|---|---|
| `app.requestSingleInstanceLock()` in the second launch **blocked for** | **20,004.6 ms / 20,010.9 ms** |
| …and returned | **`false`** |
| reclaims performed | **none** |
| second claim attempts | **none** |
| windows shown by the second launch | **none** |
| primary's hand-over handler | not observed in run 1; in run 2 **never fired**, including the **25 s after the wedge ended** |

Run 2 exists to settle the "delayed or lost" question and settles it: the wedge ended, the primary went on
running normally for 25 further seconds, and **the hand-over never arrived. It was not queued behind the
block. It was dropped.**

Against the requirement, item by item: the 5-second bound was exceeded **fourfold**; "reclaim the record
and retry the exclusive claim exactly once" did not happen at all; and "every path therefore ends with
exactly one instance running and a window on screen" was violated — one instance was running and **no
window was on screen**. The user double-clicks the icon, waits twenty seconds, and gets nothing.

**And the failure is invisible by construction, which is what makes it the worst kind.** A `false` return
means "you have been handed over", and `REQ-STARTUP-162` requires a handed-over launch to be silent — no
window, no dialog, no banner, no error. The launch cannot tell a successful hand-over from a failed one,
and the requirement forbids it from reporting the difference even if it could.

**It cannot be rescued by wrapping, and that is now a measurement rather than an argument.** The call is
**synchronous on the launching process's own main thread** and takes no timeout argument; the two samples
differed by 6 ms, consistent with a fixed timeout inside the component. There is nothing to put a timeout
around without moving the claim off the launch's main thread entirely, which is not a smaller change than
owning the record.

**The other sub-case passed, and it is recorded so the failure is not overstated.** Where the primary was
blocked in a synchronous native dialog — running no JavaScript, but still pumping window messages — the
second launch's call returned `false` in **4.07 / 4.82 ms** and the primary's hand-over handler ran
**during** the dialog, while its own 500 ms timer was recording zero firings. So the primitive handles one
kind of "not answering" and drops the other. **One sub-case failing is enough by this record's own rule**,
which was written that way deliberately: a claim that is correct for some unresponsive primaries and
produces no window at all for others is not a claim whose reclaim rules we can state.

**And the sub-case that passed passed in a way this record would not have chosen.** The hand-over
callback executed **while the primary's own timers were dead** — the inference offered, and labelled as
one, is that the notification is dispatched by the nested message pump the dialog runs, not by the outer
loop. So the primitive can deliver a hand-over **into a process that is otherwise entirely stopped**, and
the handler then runs at an arbitrary point inside a nested loop rather than at a quiescent point of
main's own event loop. Under alternative I that cannot happen: our endpoint is serviced from the outer
loop, so an instance that is not running that loop simply does not answer and the specified reclaim
follows. **The failing sub-case is why the claim moved; this one is a second, quieter reason not to
regret it.**

**Observation 3 — the probe must leave the probed process unaffected. PASS.** 65 consecutive probes plus
4 discrete ones: primary alive, pid unchanged, its 500 ms heartbeat uninterrupted, window intact, no
signal, no state change beyond the specified event. This is the property phase 0 now inherits through
`REQ-SESSION-051` to `REQ-SESSION-054`.

**macOS and Linux were not measurable and the decision does not wait on them.** The measuring host runs
Windows 11 only; no macOS machine and no Linux environment was available, and neither behaviour can be
inferred from the Windows result — macOS is a different shape, and Chromium's Linux process singleton is
a filesystem construction with entirely different stale-record and reclaim rules from the Windows
hidden-window path that failed. **This record's rule already says the claim moves on every platform once
one fails**, for the reason it gave at the time — one record resolved two different ways is worse than
either — so two thirds of the platform coverage being absent does not block the *decision*. **It does
relocate the obligation rather than discharge it.** Alternative I's own stale-record protocol, endpoint
and hand-over must be verified on macOS and Linux, on macOS additionally composing with the convention
that a second launch produces no second process; and `REQ-STARTUP-152` makes this a release-checkable
claim per platform — "launching that entry point twice on one user account SHALL leave exactly one process
of the application running". That check is where the missing two thirds land.

**One measured fact about the record itself carries into the design and is easy to lose.** The
primitive's record file **survived a force-kill and was not itself the exclusion**: it was still present
after `taskkill /F` and did not prevent the next launch from claiming. Our record's existence *is* the
exclusion, so the same force-kill would strand every later launch unless the record carries the liveness
fact. That is why phase 0 puts `pid` and `host` in it and probes them, and it is the single most
important thing not to simplify away.

### Phase 1 onward — the paint sequence

- **The pre-window phase, in main, in this order:** resolve the preference-store root and establish
  scoping; set the application icon; register the bundled font families; read the stored theme. **Only
  the first of these may touch disk on the critical path, and it reads one small file.**
- **The first paint is rendered from stored preferences and constants only.** The seven views are
  constructed — which ADR-0045 needs anyway for construction-time slot allocation — the rail, title bar
  and status strip are drawn, and the workspace view shows its empty state. **Nothing on this path waits
  on a workspace read, a version-control snapshot, a session load, a provider catalogue or a model
  list**; the composer's model chip carries a neutral loading label precisely because model options are
  not yet loaded.
- **Post-show activation is a single ordered pipeline**: version-control refresh, **the workspace-storage
  determination of `REQ-STARTUP-166`**, update check, cloud-credit polling; then, once the window is
  interactive, initialisation resolution and the hook-review notice; then, after the shared deferral, the
  project chooser if it is still owed. The two mutually exclusive schedules `REQ-STARTUP-044` names are
  **two branches of that one pipeline, sharing one delay**.
- **Two more things happen after the show, and neither is a member of `REQ-STARTUP-043`'s list.** That
  requirement names four activities and requires them not to precede the show; it is not a licence for
  anything else to precede it, and it is not an enumeration of everything a shown window may then do.
  Both additions are ordered here rather than left to fall where they may.
  - **The preparation-failure notice of `REQ-STARTUP-165` (c)**, where phase −1 found one. It is raised
    **once per run**, at warning severity, on the same surface `REQ-STARTUP-116`'s offer uses. It is
    placed **before the update check** in the order, for a reason that is about what the user reads
    rather than about cost: both can put a notice on that surface in the same second, and the one
    explaining why this launch took twenty seconds should not arrive underneath an unrelated update
    offer. It waits on nothing, since the finding was read before the window was built.
  - **Opening the workspace store**, which ADR-0058 places after the window is shown and which
    `PRAGMA quick_check` bounds. It must not move earlier: this record's first paint is rendered from
    stored preferences and constants only, and a store open on the critical path would put an unbounded
    disk operation inside the 5 seconds — the same discipline that keeps a workspace read, a
    version-control probe and a session load out of it.
- **A store that will not open is loud, and a native binding that will not load is the same failure with
  a different cause.** ESC-21 recorded `better-sqlite3` failing silently under an Electron runtime
  through an interface mismatch, with the error swallowed by a `try`/`catch`. Three rules follow, and
  they belong here because this is the record that decides what a failure during startup is allowed to
  do:
  - **Neither condition is caught and continued.** `REQ-SESSION-089` requires the run to refuse rather
    than degrade, conveying the session id, that nothing was started, which store could not be opened,
    and the reason the store itself gave. ESC-16 ruled that partial-failure mode out of existence; a
    swallowed load error would reintroduce it in the one shape nobody would notice.
  - **Neither is a first-paint failure.** The window is already shown, so a store that will not open is
    a workspace whose sessions are unavailable, not an application that will not start. That is the
    correct outcome and it is a deliberate consequence of putting the open after the show: the user gets
    a painted window and a stated reason instead of a launch that dies.
  - **The two causes are distinguished in what is reported, because their remedies differ.** A store
    that will not open has ADR-0058's recovery ladder behind it — salvage, export, move aside — and a
    binding that will not load has none of that: it is a defect in the build, identical for every
    workspace and every user of that build, and no user action changes it. Reporting the second as the
    first sends a user to salvage a store that is fine. **The real defence is upstream**: ADR-0056 rule 4
    requires the packaged tree to be proved to load before an artifact is accepted, precisely because
    `REQ-STARTUP-156`'s gate would not catch it — the gate observes first paint, and first paint does
    not open a store.
- **The workspace-storage determination runs on every path that opens a workspace, and is one function
  with three entrances.** `REQ-STARTUP-041`'s startup resolution, `REQ-STARTUP-163`'s launch-carried
  directory, and `REQ-STARTUP-047`'s project switch each reach it; a window built for a handed-over
  launch goes through the same post-show activation as any other, so it inherits the determination
  without a second code path. It **classifies from the storage** the directory sits on and never from a
  failure — not a failed write, not a collided lock, not a refused session — which is what makes the
  warning arrive before the situation costs the user anything. Its three outcomes are: reachable by
  another machine, replicated by a synchronisation agent, or not classifiable; the first two raise the
  persistent notice and **refuse nothing**, the third is silent. It is not persisted and it adds no
  preference key.
- **It must not be on the critical path and must not be able to put itself there.** It is post-show by
  requirement, and the classification touches the filesystem, potentially a slow or unreachable network
  one — precisely the case it exists to detect. So it runs off the interface thread and a determination
  that does not answer leaves the workspace **not classifiable and silent**, which is the requirement's
  own third outcome rather than an invented failure mode.
- **The deferral is one timer owned by the window registry** (ADR-0048), cancelled on window close and
  abandoned unshown if the question it asks has already been answered. **It must not be re-implemented
  per offer**, and it is **per window**: a window built by `REQ-STARTUP-163` gets its own deferral,
  which is why the one-shot must be answered per window rather than per process.
- **Fonts are preloaded and their load is awaited before the first paint**, because they must be
  available before the first paint and **a late font swap would reflow the transcript and invalidate the
  measurement cache** of ADR-0045. In the live application a failure falls back to host fonts and
  continues; in a benchmark iteration it is a crash. **One loader, two failure policies.**
- **Demo mode is a construction-time window parameter**, carried from the palette entry through the
  window registry into the renderer's initial state; there is no runtime toggle and nothing is written
  to the preference store.
- **Budget protection is a measurement, not an intention.** Launch-to-first-paint is recorded in
  diagnostics as a span, and the release gate requires each published artifact to be launched to first
  paint on its own platform — so the budget has both a continuous signal and a release check. **The
  claim is inside that span**, because it is on the critical path of the launch that becomes the
  instance.
