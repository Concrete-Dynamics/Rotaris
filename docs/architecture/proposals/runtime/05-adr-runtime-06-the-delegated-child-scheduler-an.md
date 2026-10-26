# RUNTIME slice — architecture proposals — ADR-RUNTIME-06 — The delegated-child scheduler: an explicit ledger, not a promise graph

Part 5 of 10 of [the runtime proposal](../runtime.md), which indexes every part.

### ADR-RUNTIME-06 — The delegated-child scheduler: an explicit ledger, not a promise graph

**Decision to be made.** What represents a delegated child and drives its progress.

**Constraints.** C6.1 (a closed state set with a fixed transition table, designated the single
definition), C6.2 (**an illegal transition must be rejected with an error naming both states, leave
the record untouched, and deliver no event**), C6.3 (five admission checks in a fixed order), C6.4
(**a suppressed duplicate start must be recorded, not merely prevented**), C6.5 (FIFO per-model hold
queue with one promotion per terminal transition), C6.6/C6.7 (dependency release and transitive
blocking cascade that must settle pre-start dependents while leaving started ones running), C6.8 (a
three-condition quiescence rule with an explicit no-livelock clause), C6.9 (exactly one waiting
mechanism, at most one wait per parent, no deadline on a wait), C6.10/C6.11 (idempotent sweeps over
records **read back from disk** after a crash, one of which must not probe liveness), C6.13
(per-session isolation).

**Alternatives.**

*A — A promise graph.* Each delegation is an async function; dependents `await` their dependencies;
concurrency is a semaphore (`p-limit` or equivalent). Idiomatic, small, and the first thing a Node
developer reaches for. It fails on four counts, each of which is a hard constraint rather than a
preference:

- C6.2 requires an *attempted illegal move* to be rejected with a specific error and to leave no
  trace. Implicit control flow has no representation of a move that was attempted and refused.
- C6.4 requires the duplicate-start race to be **observable** — a `child_launch_suppressed` timeline
  event and a `stale_child_launch_claim` issue. A promise that has already been awaited simply
  resolves again; the race is prevented and invisible, which is not what is asked for.
- C6.10 and C6.11 sweep non-terminal records **read back from a previous process's disk state**. A
  promise graph has no representation of a child that exists only as a record.
- C6.7 requires the cascade to settle dependents that have not started while leaving started ones
  running. An await-graph cannot distinguish "not yet started" from "started"; a rejected dependency
  propagates to every dependent uniformly.

*B — An actor or queue per child.* Adds machinery — a mailbox, a supervisor — without addressing the
ledger requirement, since the ledger still has to exist to satisfy C6.10/C6.11 and C6.2. The actor
model would be a way of *driving* the ledger, not a replacement for it.

*C — A persisted child ledger with a scheduler run to quiescence (recommended).* The ledger is the
primary representation: one record per child carrying the fields REQ-ORCH-043 and REQ-MONITOR-022
enumerate, persisted in `state/resume.json` under `child_states`. All state change goes through one
`transition(childId, to, reason)` function, which is the **sole** implementation of REQ-MONITOR-300,
validates the move, stamps the completion timestamp on a terminal state (C6.2), and emits
`child.transition`. Scheduling is a pass over the ledger triggered by a state change, not a timer:
each pass admits ready children (C6.3's five checks in order), promotes at most one held child per
model key per freed slot (C6.5), applies the dependency cascade (C6.7), and repeats until the
three-condition quiescence of C6.8 holds. A start is a **compare-and-set on the record** — claim the
`queued -> starting` transition, and if the claim loses, record the suppression (C6.4) rather than
retrying. Promises live only *inside* `starting -> running -> (summarizing) -> terminal` for one
child's execution, which is where they belong.

**Recommendation.** C.

**Consequences accepted.**

1. Every state change is a function call that can fail, and callers must handle the refusal. This is
   the cost of C6.2 being observable, and it is the point.
2. The scheduler runs to a fixed point rather than on a tick. C6.8's no-livelock clause becomes a
   termination proof obligation: each pass must either change some child's state or reach
   quiescence, so a pass that changes nothing must not schedule another.
3. The ledger is written through the C3.5 debounce like any other state, so a crash may lose up to
   10 s of ledger movement — which is exactly why C6.11's settle-on-continue exists, and why it must
   not probe liveness (holding the lock is already proof).
4. The per-model hold queue is FIFO and per model key, scoped per run (C6.13) — so two concurrent
   runs cannot starve each other of slots, which REQ-ORCH-050 states explicitly.
5. Because `transition` is the single definition, every other domain that names a child state cites
   REQ-MONITOR-300 rather than restating it, and the code must mirror that: no second table.

**Revisit if.** A requirement appears that needs children to be scheduled across runs (it currently
must not be — C6.13), or the ledger's size at the maximum supported agent count makes the debounced
write dominate.

---

### ADR-RUNTIME-07 — Resume, locking and recovery: the lock as the single capability token

**Decision to be made.** What authorizes a process to write a session, how liveness is probed, and
how the four call sites that ask "is this session live?" are kept in agreement.

**Constraints.** C7.11 (**one verdict** across lock reaping, liveness reporting, stale detection and
the worktree-integration precondition), C7.12 (exclusive create, at most one reap, no spinning),
C7.10 (resolve toward alive; on Windows the probe must deliver no signal or console control event),
C7.8 (stale detection writes nothing, verifiable), C7.9 (repair is explicit, never from a read path,
with a mandatory step order), C7.13 (a lock this machine cannot prove dead is never reclaimed
automatically), C2.8 (the right to write the event store *is* the right to hold the lock), C6.11
(settling orphaned children needs no liveness probe), C1.7 (releasing the lock tears down long-lived
subprocesses first), REQ-SESSION-048 (create persists state first, then acquires; a failure at
creation raises naming pid and host), REQ-SESSION-083/084/086/167 (the resume and create paths, and
the one situation in which a session directory is deleted).

**Alternatives for the liveness probe.**

*A — `process.kill(pid, 0)`, guarded.* **Spike run for this proposal** (Node v24.11.0, Windows 11,
26200): a child was spawned to sleep 3 s and exit with code 7; at t+500 ms the parent called
`process.kill(childPid, 0)`, `process.kill(999999, 0)`, `process.kill(0, 0)` and
`process.kill(-1, 0)`. Result: `{live: {ok: true}, dead: {err: "ESRCH"}, zero: {ok: true}, neg:
{err: "ESRCH"}}`, and the child then **exited normally, printing its own message and exiting 7**.
So on Windows, Node's implementation is inspection-only and does **not** deliver the console
interrupt REQ-SESSION-053 calls out as a defect. Two guards are non-optional and are already
required by C7.10 rather than being a workaround: `pid <= 0` must answer *dead* before the call
(the spike shows `pid 0` returns truthy, and on POSIX `kill(-1, …)` addresses every process the
caller may signal), and the error code must be mapped — `ESRCH` to *dead*, `EPERM` and everything
else to *alive*.

*B — A platform-native probe* (`OpenProcess` + `GetExitCodeProcess` on Windows, `/proc` on Linux,
`kill(pid, 0)` on macOS) via a native addon or `koffi`/`ffi`. More literally faithful to
REQ-SESSION-053's wording, and it would let the Windows case distinguish "exited but a handle keeps
it reported" — which REQ-SESSION-054 nevertheless *accepts* as a documented limitation resolving
toward alive, so the extra fidelity buys nothing the specification asks for. It also adds a native
dependency to the run host purely for a behaviour the runtime already provides.

**Recommendation.** **A with the two guards**, recorded together with the spike as the evidence that
Node's Windows implementation is inspection-only. Keep B as the fallback if a supported platform or
runtime version is found where that is not true — the probe must therefore be one module behind one
interface, not an inline call at four sites.

**The rest of the decision.**

- **One predicate, four call sites.** C7.11 names them: reaping (REQ-SESSION-047), liveness
  reporting (REQ-SESSION-056), stale detection (REQ-SESSION-057) and the worktree-integration
  precondition (REQ-SESSION-064). Implement `isSessionLive(sessionDir)` once, over the lock file
  content and the guarded probe, and have all four consume it. Any second implementation is a defect
  by REQ-SESSION-171.
- **Read paths and repair paths are different objects.** C7.9 forbids repair from a read path and
  C7.8 requires detection to be provably write-free, so the detector takes a read-only filesystem
  port and the repairer is a separate, explicitly invoked service. This is what makes the
  "fingerprint the tree before and after" test possible.
- **The lock is the capability.** Holding it authorizes writing state, opening the event store for
  writing (C2.8), and settling orphaned children (C6.11). Releasing it first tears down session-scoped
  subprocesses (C1.7), then removes the file. The run host must not hold two locks for one session
  and must not write a session directory it does not hold the lock for.
- **Acquisition never spins.** Exclusive create, one reap attempt under the three conditions of
  REQ-SESSION-047, one retry, then fail. No bounded retry loop.

**Consequences accepted.**

1. A lock held by another machine across a shared filesystem, or an unreadable lock, is never
   reclaimed automatically and requires the explicit user-confirmed action of C7.13. That is the
   specification's choice and it is the safe direction.
2. Pid recycling can make a dead session report alive until the recycling process exits
   (REQ-SESSION-054); accepted, documented, and must not be "fixed" in a way that breaks the
   resolve-toward-alive rule.
3. Under ADR-RUNTIME-01, a run-host crash leaves live-looking locks for every session it held; every
   one becomes stale and is repairable individually or all at once (REQ-SESSION-063), and the
   repair announcement is how C7.6's "reported as such on the next start" is satisfied.

**Revisit if.** A supported platform is found where the runtime's null-signal probe is not
inspection-only (then take alternative B), or a requirement appears for reclaiming a lock held by a
different machine (which C7.13 currently forbids).

---

### ADR-RUNTIME-08 — Hook invocation: per-occurrence sequential, cross-occurrence concurrent, resolved on exit rather than close

**Decision to be made.** How hook processes are started, bounded, terminated and collected, and where
in the run loop they sit.

**Constraints.** C8.1 (platform-fixed interpreter, run-tree cwd), C8.2 (one JSON object on stdin,
stdin closed, no trailing byte after the closing brace), C8.3 (bound = timeout + 5 s grace + one
process start; **kill only the started process, never its group**; descendants may outlive; **output
collection must not block on a stream a surviving descendant holds open**), C8.4 (all applicable
hooks run in declaration order, sequentially, even after one has decided to stop), C8.5 (concurrent
occurrences must not delay each other; per-stable-id session-wide failure tally; one switch-off
warning), C8.6 (hooks run in line with the loop; `iteration_end` before iteration N+1 and before
that iteration's checkpoint; `session_end` on every exit path before shutdown), C8.7 (the status
string derived once and shared with the wire event), C8.8 (durable entry before the completion
event), C8.9 (the set is fixed at run start), C8.10 (exempt from permission policy and sandbox),
C8.11 (nothing hook-related ends a run), C8.12 (with no eligible hook, nothing observable happens),
C8.13 (50 ms / 10 ms / 1 ms bounds).

**Alternatives.**

*A — Run lifecycle hooks off the run loop, fire-and-forget, so a slow hook never holds the run.* This
is what a reviewer will propose, and it is explicitly refused: REQ-HOOKS-080 says "a hook that
consumes its whole budget holds the run up for that long, and `timeout_seconds` is the user's means
of controlling this". More concretely it would break C8.6's checkpoint guarantee — an `iteration_end`
hook that reformats sources must have finished before the checkpoint is taken (REQ-SESSION-088), and
a detached hook cannot promise that. Rejected on the requirement, not on taste.

*B — A persistent shell process per hook, fed commands.* Cheaper per invocation and would help C8.13.
Rejected: C8.1 requires a **newly started process** handed to the interpreter, and C8.3/REQ-HOOKS-036
require a per-invocation, platform-independent "no exit status" state that a persistent shell cannot
produce.

*C — A fresh process per invocation, with a two-level runner (recommended).* Per *occurrence* (one
`pre_tool` for one tool call, one `iteration_end`, …) hooks run strictly one after another in
declaration order, each finishing before the next starts, with the stopping verdict decided only
after all have finished (C8.4). Occurrences run concurrently with one another (C8.5). The shared,
session-scoped state is the failure tally and the switched-off set, keyed by stable hook id, and it
must be safe against concurrent occurrences with exactly-once switch-off semantics.

**Recommendation.** C, together with three mechanics the constraints fix and which are easy to get
wrong in Node:

1. **Resolve on `exit`, not on `close`.** Node's `close` event waits for all stdio streams to end,
   and a surviving grandchild that inherited the pipe can hold them open indefinitely.
   REQ-HOOKS-033 forbids waiting on exactly that ("collecting the terminated process's output SHALL
   NOT block on a stream a surviving descendant still holds open; the grace period bounds that
   collection and expiring it yields empty output"). The runner therefore resolves on `exit` plus a
   grace timer and treats whatever was collected as final.
2. **Do not spawn `detached` and do not kill a negative pid.** C8.3 forbids widening termination to
   the process group. This is the opposite of C1.5, where a verification-check skip *must* signal
   the process group and tear down the terminal session. **The two paths must not share a kill
   implementation** — the hook runner kills a process, the command-execution path kills a group.
3. **Write the exact payload bytes and end the stream.** C8.2 fixes the last byte as the closing
   brace, with no trailing newline, so the payload is serialized once and written with a single
   `write` followed by `end()`; nothing may append a separator.

**Consequences accepted.**

1. A hook can hold an iteration boundary for `timeout_seconds + 5 s`, by design, and the user
   controls it. The run's own budgets (C9.2) are unaffected because they are boundary-evaluated.
2. Hook descendants may outlive the run. The specification says so, forbids tracking them, and
   forbids reporting them beyond a log line. Accepted without mitigation.
3. Hooks bypass the permission policy and the sandbox entirely (C8.10), so the hook diagnostics are
   the only evidence a hook ran. That makes C8.8's durable-before-event ordering load-bearing and
   not merely tidy.
4. C8.12's "nothing observable happens" for a session with no hooks, and C8.13's sub-millisecond
   bound for that case, mean the eligibility check must be a precomputed per-event lookup built at
   run start (C8.9 makes the set immutable for the run, so it can be indexed by event once).

**Revisit if.** C8.13's 50 ms bound cannot be met at 100 entries with a fresh process per invocation
— but note that bound covers *resolving and validating* the set, not invoking, so process-per-
invocation is not in tension with it.

---

### ADR-RUNTIME-09 — Two clock ports and a budget primitive; no bare timers in engine code

**Decision to be made.** How durations, deadlines and timestamps are obtained, so that every duration
in the slice is testable.

**Constraints.** C9.1 (**every duration measured against a monotonic clock, and conformance to every
one of them demonstrable with a controlled clock; no conformance claim may depend on real provider
latency**), C9.2 (boundary-taken actions; smaller budget governs; expiry of the smaller never resets
the larger), C9.3 (event stamps are wall-clock, may move backwards, and that is not an error), C9.4
(three timestamp conventions coexist), C9.5 (the persisted verification deadline is a duration, never
an instant), C9.6 (the fixed timing constants).

**Alternatives.**

*A — `Date.now()` and `setTimeout` directly, tested with fake timers.* The default. It fails C9.1 in
two ways. First, `Date.now` is wall-clock, and C9.3 explicitly permits it to move backwards mid-run
— a budget built on it can expire early or never. Second, "conformance to every duration MUST be
demonstrable with a controlled clock" is a requirement on the *product's* structure, not on the test
harness: fake timers patch a global, which works until one library or one native call reads the real
clock, and that failure is silent.

*B — One injected clock.* Better, but conflates two things the specification deliberately separates:
budgets need monotonicity and must be immune to clock adjustment (C9.1, C9.2), while event and
session timestamps must be wall-clock and are explicitly allowed to be non-monotonic (C9.3). One
port would force one guarantee onto both.

*C — Two ports plus a budget value type (recommended).*
- `MonotonicClock` — `now(): Millis` over `performance.now()` / `process.hrtime.bigint()`. Every
  duration, deadline, watchdog cadence, coalescing tick and backoff reads from it.
- `WallClock` — `instant(): Instant` for the three timestamp conventions of C9.4 (UTC `+00:00` on
  the wire, UTC `Z` in session state, local `HH:MM:SS` on transcript rows) — three formatters, one
  source.
- `Budget` — a value carrying a start reading and a duration, answering `expired()`, `remaining()`
  and `min(other)`, with the composition rules of C9.2 built in: `min` governs, and expiring the
  smaller does not reset the larger. Persisted verification deadlines are stored as the *duration*
  (C9.5) and rehydrated against a fresh start reading, which is what makes them meaningful after a
  resume and to a viewer in another process.
- Timers (`setTimeout`, `setInterval`) are obtained from the `MonotonicClock` port too, so a
  controlled clock drives the stall-watchdog cadence (C6.12), the 50 ms growth tick (C5.3), the
  750 ms and 2000 ms polls (C2.7) and the 10 s debounce (C3.5) without patching globals.

**Recommendation.** C. No `Date.now()`, `performance.now()`, `setTimeout` or `setInterval` appears
in engine code; a lint rule enforces it.

**Consequences accepted.** Every engine component takes a clock, which shows up in every constructor
and every test. In exchange, the whole of C9.6's constant table plus every budget in domain 01
becomes deterministically testable in milliseconds of wall time, which is precisely what
REQ-ORCH-156 asks to be demonstrable. Budgets are *values checked at boundaries*, not interrupts —
consistent with C9.2 and with REQ-ORCH-069's stated overshoot, and it means a long iteration
legitimately runs past a time limit rather than being aborted mid-flight.

**Revisit if.** A dependency proves impossible to drive from an injected clock (a provider SDK with
its own internal timeout, for instance) — in which case that timeout must be surfaced as a
configurable value the port can set, not left to the library.

---

### ADR-RUNTIME-10 — Cancellation and shutdown: one sticky stop request, one ordered teardown, one shared deadline

**Decision to be made.** How a stop is represented, propagated and completed, and how run teardown
composes with application quit.

**Constraints.** C7.1 (release human blocks first; approvals fail safe as **denied**), C7.2 (graceful
then hard at 30 s; forced stop performs a second sweep for work created during the first), C7.3
(sticky before callbacks are wired; interrupted wins over an apparently completed outcome; a
cancellation raised inside still releases the lock and emits the terminal result), C7.4 (the
eight-step teardown, in order, even on any exception), C7.5 (an interrupt during child teardown still
takes effect), C7.6 (the ordered shutdown effects, the 30 s force-exit backstop shared with the
cancellation grace, the second-quit rule, and the obligation to report an incomplete force exit on
the next start), C7.7 (ask every handle before waiting on any), C6.10 (the finalize-incomplete
sweep), C4.11 (which delivery path the terminal result takes).

**Alternatives.**

*A — `AbortController` alone.* A fine primitive, an insufficient decision. It gives no ordering
(C7.1 fixes one), no fail-safe semantics for suspended approvals (C7.1 requires denial), no
stickiness before listeners exist (C7.3), and no second sweep (C7.2). It would end up wrapped
anyway.

*B — Cancellation by exception, unwinding the loop.* Attractive because the teardown lands naturally
in a `finally`. But C7.5 requires an interrupt raised *during* teardown to still take effect, and
C7.4's step order must hold "even on any exception" — so the teardown cannot itself be the exception
path. And C6.10's sweep must re-check per record because closing one cascade-blocks another, which
an unwinding stack does not express.

*C — An explicit `StopRequest` plus an ordered teardown pipeline (recommended).* A per-run
`StopRequest {requested, forced, reason}` is set by the control channel or by shutdown; it is
observable rather than thrown, and it is **sticky** — setting it before the loop's callbacks are
wired replays when they are (C7.3). Stopping proceeds: cancel pending questions → cancel pending
approvals, resolving each as *denied* → request the loop's graceful stop → arm a 30 s deadline from
the `MonotonicClock` → on expiry, hard cancel and run the second sweep (C7.2). Teardown is a fixed
pipeline of the eight steps of C7.4 executed under a guard that cannot be skipped by an exception,
each step's failure logged and the pipeline continuing.

**Recommendation.** C, with two composition rules.

1. **One deadline object serves both 30 s allowances.** C7.6 says the force-exit backstop and the
   cancellation grace "fall due together"; making them one `Budget` (ADR-RUNTIME-09) rather than two
   timers is what makes that true by construction rather than by two constants that could drift.
2. **The quit path is main-driven, run-host-executed.** Main evaluates the window-close guards
   (REQ-SHELL-119), asks the run host to stop **every** run before waiting on any (C7.7), and holds
   process exit until the run host reports teardown complete or the shared 30 s deadline expires. A
   second quit request during that window force-exits immediately (C7.6). An incomplete force exit
   leaves live-looking locks, which the next start surfaces through stale detection and the repair
   announcement — that is how "must be reported as such on the next start" is satisfied without a
   separate mechanism.

**Consequences accepted.**

1. Approvals suspended at quit are resolved as denied, not left pending. That is the specified
   fail-safe direction (C7.1) and it means a user who quits mid-approval loses that tool call rather
   than having it silently permitted.
2. A force exit can leave the ordered effects incomplete — the only case in which that is permitted
   — and therefore can leave a partial trailing JSON line and up to a debounce window of unwritten
   state (C3.7). Both are already within the specified crash-loss bound.
3. The teardown pipeline runs in the run host, so main cannot observe its intermediate steps; it
   observes completion or the deadline. That is enough for C7.6, which fixes what must have happened
   before exit, not what main must see happening.

**Revisit if.** Measurement shows real runs routinely need more than 30 s to reach a stop check,
making the hard cancel the normal path rather than the backstop. The figure is fixed by
REQ-SESSION-092 and REQ-MONITOR-129, so this would be a specification change, not a design change.

---

### ADR-RUNTIME-11 — The run registry: runs are addressed by session id; focus is a UI concept

**Decision to be made.** How concurrent runs are held and addressed, and where "focus" lives.

**Constraints.** C10.1/C6.13 (full isolation; outcome independent of other runs and of interleaving),
C10.2 (one handle per run; controls route to the focused run; notifications cover every run), C10.3
(background handles publish only a summary), C10.4 (focus change touches no run's lifecycle), C10.5
(an approval reaches the run that asked even when unfocused; a permission-mode change reaches only
the focused run), C10.6 (the second concurrent launch goes in a worktree), C10.7 (the closed
five-item list of run-active gates), C10.8 (queued prompts are session-owned), C5.10 (per-session
addressing, late binding, discarded at teardown).

**Alternatives.**

*A — The engine knows which run is focused.* Rejected on three requirements: C10.4 (a focus change
must touch no run's lifecycle), C6.13 (a run's outcome must not depend on other runs or on
interleaving), and C10.3 (a background handle must publish only a summary — a rule about what the
*shell* subscribes to, not about what the run does). If the engine knew about focus, a focus change
would be an engine event, and the isolation claim would become a matter of care rather than of
structure.

*B — A registry keyed by session id, with focus entirely in the shell (recommended).* The run host
holds `Map<sessionId, RunHandle>`. Every control names its session id; the shell resolves "focused"
to a session id before sending. Notifications are published per session id and the shell decides
which to surface. Approval requests carry a `request_id`, and the answer is routed by looking that up
in the registry — which is exactly what C10.5's "an answer for which no run is waiting must be
reported back as undeliverable" describes.

**Recommendation.** B.

**Consequences accepted.**

1. C10.5's asymmetry becomes a shell rule rather than an engine one: a permission-mode change is
   addressed to one session id (the focused one), an approval answer is addressed by request id to
   whichever session is waiting. The engine implements neither policy; it implements addressing.
2. C10.6 (second launch in a worktree) is a launch-path rule owned by domains 06 and 07, not a
   scheduler rule; the registry does not enforce it.
3. C10.7's closed list of five run-active gates lives in the shell and the launch path. The registry
   supplies the predicate ("is a run active for this session / this workspace") and nothing else,
   drawing on the single busy test of REQ-NOTIFY-050 rather than a second one.
4. Bindings (event sink, event history, transcript recording, hook running, approval handling,
   audit) are late-bound by session id and discarded at teardown (C5.10), so a straggling event
   after teardown has no destination and cannot reach the next run in the same process — which
   matters more under ADR-RUNTIME-01, where many runs share one process.

**Revisit if.** ADR-RUNTIME-01 moves to one process per run, in which case the registry becomes a
supervisor of child processes and the addressing above becomes the wire protocol rather than a map
lookup — the shape does not change, only the transport.

---
