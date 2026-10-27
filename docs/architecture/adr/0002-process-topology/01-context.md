# ADR-0002 — Process topology — Context

Part 1 of 11 of [ADR-0002](../0002-process-topology.md), which indexes every part.

## Context

Four slices proposed a process model independently and no two agree on the number of processes. The
requirements that decide it:

**There is one instance, and the process kinds below are its processes.** SR-1 rules that a second
launch surfaces the running instance rather than starting a rival. `REQ-STARTUP-161` fixes it as an
observable: at most one instance per user account, every launch either becoming that instance or
being handed to it, and no configuration key, environment variable, preference or interface control
by which a second can be started. Several workspaces and several windows remain fully available and
are windows of the one instance (`REQ-STARTUP-162`, `REQ-STARTUP-163`). ADR-0055 owns the claim,
hand-over and reclaim mechanism; this record owns what the instance is made of.

**A run outlives every window that watches it.** `REQ-SESSION-106` and `REQ-SESSION-096`: with every
window that was watching it closed, the run keeps advancing `updated_at`, keeps recording its event
history, keeps producing artifacts and reaches a terminal `execution_status` on its own.
`REQ-SHELL-017` destroys the main window on a workspace change. A renderer therefore cannot host a
run.

**A run never outlives the application.** `REQ-SESSION-106`, `REQ-MONITOR-131`, `REQ-SHELL-121`.
`REQ-SESSION-190` adds that detaching a run to the background leaves it "in the same process holding
the same session lock" — detach is a view operation plus a status write, not a migration.
`REQ-SESSION-106` now states the same thing from the other end: a background run that outlives the
application process does not exist, so no run is ever left holding a lock this machine cannot
reclaim.

**The run host must spawn and load freely.** Pseudo-terminals and process-group signalling
(`REQ-ORCH-123`, `REQ-ORCH-128`, `REQ-SHELL-110`), hook child processes under a platform-fixed
interpreter (`REQ-HOOKS-030`, `REQ-HOOKS-031`, `REQ-HOOKS-033`), MCP `stdio` servers whose lifetime is
bound to the session lock (`REQ-SESSION-049`), and a durable flush usable from a caller's context
where no asynchronous runtime is active and which must not return until the newest requested state is
durable (`REQ-SESSION-068`, `REQ-SESSION-070`, `REQ-SESSION-072`).

**One process hosts several runs.** `REQ-TOOLS-089`, `REQ-SANDBOX-038` and `REQ-SANDBOX-096` all
describe two live runs in one process — one confined and one not — each following the setting in
force when it began. `REQ-SANDBOX-067` and `REQ-TOOLS-119` require the sandbox availability verdict
to be probed **at most once per process**, never to change within it, and to be cleared only by an
explicit re-check or an application restart.

**The window layer has a 100 ms budget.** `REQ-SHELL-150` (gesture acknowledged within 100 ms,
repaint at least every 120 ms under sustained change), `REQ-MONITOR-225` (controls stay operable
during a read or a projection), `REQ-SANDBOX-069` (the 5.0 s sandbox trial never on the interface
thread), `REQ-TRACE-337` (evaluation and projection **never** on the interface event loop).

**Some work is genuinely unbounded.** `REQ-TRACE-073` compiles and runs **project-supplied regular
expressions** over repository files; `REQ-TRACE-154` and `REQ-TRACE-225` state that the absence of any
time or resource limit on that scan is a deliberate decision and not a gap. `REQ-TRACE-377` requires
a guard test that no desktop module launches a checking process.

**Some surfaces work with no run active.** Configuration, the Git view, the requirements board and
the improvement library are all usable with no session open, so none of them can live in a per-run
process.

**What used to be read as evidence for several application instances is not.** An earlier draft cited
three requirements here. Under SR-1 they say something else. `REQ-MONITOR-013` is now explicit that
the boundary it means is "the surface issuing a control and the part of the application that executes
the run", that it "is never a boundary between two instances of the application, because only one
instance ever runs", and that it is never a boundary to a run this application does not own.
`REQ-MONITOR-299`'s permission for a run to execute somewhere other than the window remains, and is
satisfied by the run host. `REQ-GIT-124` still counts a run as active whenever it holds a session
lock in this workspace: what that now covers is this instance's own runs and a lock left behind by an
instance that is gone, not another product's. `REQ-PROVIDER-152`'s cross-process lock over the
credential store survives for a narrower reason, given in Consequences accepted 8.

**The double hop this topology creates has now been measured, and it holds.** Placing the run host in a
`utilityProcess` and the surfaces in sandboxed renderers means every update crosses two boundaries — run
host to main, main to renderer (ADR-0044 consequence 3). That was the one cost of this topology no
requirement had a number for. `../spikes/ipc-hop-latency.md` measured it on the target platform, in the
four-process arrangement this record fixes, with `contextIsolation`, `nodeIntegration: false` and
`sandbox: true` in force. The verdicts are set out under "Discharged" below; the short form is that the
relay meets `REQ-MONITOR-222`'s 250 ms p95 with roughly two orders of magnitude to spare, meets
`REQ-MONITOR-223` at a ratio of 1.14 against a ceiling of 2, and meets `REQ-ORCH-155` — which SR-8 has
since ruled a 95th percentile, and which the requirement now states as one — with a margin of 8× to 40×.
The qualifications are in Consequences accepted 9 and they are not decorative.
