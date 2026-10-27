# ADR-0002 — Process topology — Consequences accepted

Part 4 of 11 of [ADR-0002](../0002-process-topology.md), which indexes every part.

## Consequences accepted

1. **A run-host crash loses every in-flight run at once, and the owner has accepted it.** This was
   DATA's recorded dissent against this topology, and `owner-decisions.md` names it under
   "Consequences to carry": *"The crash domain concentrates. This sharpens the objection the record
   already preserves from the DATA architect against ADR-0002: a run-host crash loses every in-flight
   run at once."* It is stated plainly and not softened: with several concurrent runs in flight, one
   fault in the PTY binding or in the unconfined plugin code `REQ-TOOLS-163` mandates ends all of
   them, and alternative B is what would have avoided it.

   **What run-host crash recovery must therefore do**, so that the accepted cost is bounded rather
   than open-ended:

   - **Every session the crashed host held is stale, not foreign** (SR-2, `REQ-MONITOR-027`,
     `REQ-SESSION-159`). Each is settled by the ordinary path — the lock reap of `REQ-SESSION-047`
     and the explicit repair of `REQ-SESSION-060` to `REQ-SESSION-063` — after which it opens as an
     ordinary persisted session (`REQ-SESSION-196`). No new concept, and no session becomes
     permanently unreachable.
   - **Recovery is plural.** The requirement text is written for one stale session; a run-host crash
     produces one per in-flight run, in one workspace or several. The repair notice `REQ-SESSION-062`
     and `REQ-SHELL-155` specify must therefore be able to report several settled sessions from one
     event without one notice per session, and the reap must settle them all before any of them is
     offered for continuation.
   - **Durable loss is bounded by `REQ-SESSION-034`**, and under SR-4 that bound tightens: a row is
     committed individually rather than at a debounce window's close, so the window of un-persisted
     work at the moment of a crash is one transaction rather than one debounce interval.
   - **Main must not die with it.** The crash is announced by main, which is a different process and
     survives; a run host that exits is observed by main as a `utilityProcess` exit, not inferred
     from a timeout.
   - **The kill group must survive the crash** — see consequence 5. A run host that dies without
     tearing down its children leaves `REQ-TOOLS-111` unmet unless the OS-level group does it.
   - **Restarting the run host inside a living application is deliberately not offered.** A run
     cannot be resumed mid-iteration, every affected session needs the repair path regardless, and a
     silently re-forked host would let a session be started again while its stale lock is still
     unreaped. The recovery is: settle, notify, let the user continue what they choose.

2. `utilityProcess.fork` requires `app.ready`, so no run may start before then. Nothing in domains
   01, 02, 07, 09 or 20 asks for one. Under SR-1 this composes with `second-instance` also being
   emitted only after `ready` (ADR-0055): a launch handed over during the primary's own startup is
   acknowledged at the platform layer and its workspace directory acted on after ready, which is
   consistent with `REQ-STARTUP-162`'s "nothing the user can see" and with `REQ-STARTUP-155`.

3. `REQ-MONITOR-131`'s "the process does not exit until the run has reported its terminal result and
   finished writing session state" becomes a two-process handshake under one shared 30 s deadline
   (ADR-0014).

4. Native modules — the PTY binding above all — must be rebuilt against Electron's ABI and shipped
   unpacked from the archive. That is a build obligation ADR-0054 inherits. If ADR-0003's store
   carries a native component, it inherits the same obligation, in the run host and the workspace
   service but **never in a renderer**, whose sandbox forbids it.

5. Killing the run host does not by itself satisfy `REQ-TOOLS-111` ("once the application has exited,
   no background command it started is still running", whatever ended it). The run host must own an
   explicit kill group: a POSIX process group per background session (`REQ-TOOLS-107`) and, on
   Windows, a Job Object with kill-on-close covering the subtree. Without the Job Object
   `REQ-TOOLS-111` is unmet on Windows and must be **recorded as unmet rather than assumed**. Its
   interaction with `REQ-HOOKS-033`'s deliberately surviving hook descendants is open question OQ-9.

6. `REQ-STARTUP-134` requires diagnostics to count and name the concurrent execution contexts the
   application creates. With four process kinds, and one workspace service per open workspace, that
   registry is a real deliverable (ADR-0050) whose count varies at run time.

7. Any part of the engine needing a main-only Electron API goes through a narrow request back to
   main. In practice that is the export file chooser (`REQ-EVENTS-173`, `REQ-SESSION-189`),
   reveal-in-file-manager (`REQ-SESSION-191`), and the save and open dialogs of `REQ-SESSION-201`'s
   whole-store backup and restore — all user-gesture-driven, all off the run's critical path. In every
   case main supplies the dialog and nothing else: the work behind it happens in the workspace service,
   because main must stay inside `REQ-SHELL-150`'s 100 ms budget and a backup is O(store).

8. **`REQ-PROVIDER-152`'s cross-process credential lock is kept, on a narrower rationale than the one
   it states.** The requirement gives its reason as "more than one application instance may run",
   which SR-1 makes false as a normal case. The lock is nonetheless retained, because
   `REQ-STARTUP-164` names one path by which two processes of this application briefly coexist —
   reclaiming the instance record from a process that is running but unresponsive — and because the
   credential files are per-user and shared by every workspace of the one instance, so main's own
   read-modify-write sequences still need serialising against each other. Credentials stay individual
   protected files under SR-4: `REQ-PROVIDER-016` requires `0600` plus an explicit Windows
   access-control list, read back, which is a filesystem guarantee a row cannot make. The
   requirement's *rationale* should be amended; its *behaviour* should not.

9. **The relay's headroom is real, but it is a lower bound on the requirement's own interval and it is
   not unconditional.** Three things are carried forward rather than read off the headline figures.

   - **What was measured is a subset of what the requirement bounds.** The interval runs from the run
     host's publish call to the renderer's applied state. The transaction commit `REQ-MONITOR-221`
     requires before publication, the run host's own projection, and `REQ-MONITOR-219`'s 50 ms coalescing
     tick are all upstream of it. Every figure is a **lower bound** on the requirement's interval, and the
     store commit SR-4 put on the publish path is the term nothing has measured yet.
   - **The renderer in the harness was empty.** No framework, no store, no Markdown renderer, no render
     cache, no real recycler. ADR-0045, ADR-0051 and ADR-0057 all add cost on the same thread and will
     consume part of this margin.
   - **The margin collapses at a message rate the architecture does not license but does not
     structurally prevent.** The relay's cost is **per message, not per byte** — 33–37 µs in
     `webContents.send` for a 4 KiB frame against 163–195 µs for a 64 KiB one — so roughly 12,000
     messages per second raised the transcript's p95 by two orders of magnitude, and an unthrottled
     producer drove it into an unbounded backlog. It degrades into **latency, not loss**: nothing was
     dropped and nothing was reordered in the collapse, so a gap counter never fires and the only
     symptom is a stale interface. What keeps the product away from that rate is ADR-0021's coalescing
     cap, which is therefore load-bearing for `REQ-MONITOR-222` (ADR-0044, corrected).

10. **The two keys are a standing invariant, and the pressure to collapse them is real.** A workspace has
    a path and a store identifier, they are not interchangeable, and each of the two collapses is a
    defect with a specific victim: keying the service by identifier gives one service two roots, and
    keying the store by path orphans a moved project's history — which is not a hypothesis but a filed,
    reproduced bug in two comparable products (ESC-19). Anyone who finds two keys untidy should read
    this consequence before removing one.

11. **A restore stops the store for both processes that hold it, while the application keeps running.**
    Consequence: the run host must be able to be told a workspace's store is going away, close its
    connection, refuse to start a run against that identifier, and re-open — without the run host
    exiting and without any window closing. That is a capability the topology did not previously need
    and it is stated here rather than discovered in ADR-0058. `REQ-SESSION-201` bounds it: a restore is
    refused while any session in the target store is live, so the run host is never asked to give up a
    store it is actively writing.

    **Three obligations this consequence created and did not state, added 2026-09-02 after the mechanism
    was built and measured.** All three were being carried by ADR-0058 alone, which is the wrong place for
    them: they are properties of this capability, and the next mechanism to use it would have to rediscover
    each one.

    (a) **The refusal to start runs must be in force before liveness is judged, not after.** "Refused while
    any session is live" is a statement about an instant unless something stops new runs arriving, and the
    instruction to refuse is not instantaneous. Measured: a run admitted between the instruction and its
    acknowledgement took the lock, wrote at twenty rows a second, and had its session and every row
    destroyed by the swap. The ordering is the protection; the predicate was correct in 30 of 30.

    (b) **Every acknowledgement in this exchange is bounded, and expiry refuses rather than proceeds.** With
    the run host deaf, and with the run host exited without answering, the caller produced no result and no
    error inside a 15,000 ms watchdog, twice — the application still running, a window still painting. An
    unanswered close is indistinguishable from a run host still writing and must be treated as one;
    proceeding on expiry was measured to fail later, after mutation, which is strictly worse than refusing.

    (c) **"Refuse to start a run against that identifier" is a lease the run host expires by itself, not a
    state it enters.** Otherwise the failure has no exit: kill the caller after the run host has closed, and
    the run host refuses every launch for the life of the instance with the store held by nobody. A process
    that has died cannot release anything, so the release cannot depend on it.

12. **A cross-process conformance measurement must calibrate its clocks.** `performance.timeOrigin` is
    not a shared epoch across this topology's processes: the run-host-to-renderer offset ranged over
    1.43 ms across 46 launches, which is larger than the entire one-way latency on a direct port. Any
    test for `REQ-MONITOR-222`, `REQ-MONITOR-223` or `REQ-ORCH-155` that stamps in one process and
    compares in another must correct for the offset, or it reports a number whose error is the size of
    the thing it is measuring. `REQ-MONITOR-225`'s per-read and per-projection durations are
    single-process intervals and are unaffected.
