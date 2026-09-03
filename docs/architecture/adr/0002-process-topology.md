# ADR-0002 — Process topology

- **Status:** proposed
- **Date:** 2026-08-31
- **Revised:** 2026-08-31, to carry SR-1 (one running instance) and to record the crash-domain
  consequence as accepted rather than as an unresolved slice conflict.
- **Revised:** 2026-09-01, to carry the double-hop measurement. The topology is **confirmed by
  measurement, not reopened**: the "Revisit if" clause that turned on it is discharged and retired, and
  the `MessagePort` remedy is recorded as an available option rather than as a contingency.
- **Revised:** 2026-09-02, to **settle** the workspace-identity question this record previously left as a
  correction owed, and to place two allocations ESC-19 and ESC-21 create: who takes the whole-store
  backup, and who owns `REQ-STARTUP-166`'s storage classification.
- **Revised:** 2026-09-02, second time, against defect **D3**. Consequence 11 gains the three obligations
  it created and did not state — the refusal to start runs must be in force **before** liveness is judged;
  every acknowledgement is bounded and expiry **refuses** rather than proceeds; and the refusal is a lease
  the run host expires by itself, because a process that has died cannot release anything. All three were
  being carried by ADR-0058 alone, which is the wrong place for properties of this capability.
- **Origin:** RUNTIME (ADR-RUNTIME-01), EXEC (ADR-EXEC-01), DATA (ADR-DATA-08), UI (ADR-UI-01, ADR-UI-05), MODEL (ADR-MODEL-05, ADR-MODEL-12)
- **Depends on:** ADR-0001
- **Governed by:** `owner-decisions.md` SR-1, SR-4, SR-8, ESC-15, **ESC-19**, **ESC-21**
- **Evidence:** `../spikes/ipc-hop-latency.md`

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

## Alternatives considered

**A — Everything in the Electron main process, heavy work on worker threads.** Cheapest. The session
lock, the run registry, the quit choreography (`REQ-MONITOR-131`, `REQ-MONITOR-255`) and window
lifecycle are all local calls, and `REQ-SESSION-068`'s synchronous flush is trivially available.
Against: the same process serves every renderer's IPC. A durable write per event (`REQ-EVENTS-029`),
a 5.0 s sandbox trial, a PTY read pump per live session, and a runaway project regex all land on the
loop that must answer a gesture in 100 ms. Worker threads mitigate the CPU case but keep one crash
domain: a fault in the PTY binding, or in the unconfined plugin code `REQ-TOOLS-163` mandates, takes
every window with it.

*This alternative got materially cheaper under SR-4 and is still refused.* The version of it argued a
day earlier was carrying a whole-file rewrite of a 5,000-row `state/ui_transcript.json`
(`REQ-SESSION-192`), a Windows rename-retry ladder (`REQ-SESSION-033`) and a debounced whole-document
save on main's loop. SR-4 removes all three: a row is written individually and a durable commit is
cheap. What is left standing against A is not I/O cost at all — it is the crash domain, the native
PTY binding, the unconfined plugin, and the 5.0 s trial. Those are the reasons that were always the
strong ones, and they are untouched.

**B — One `utilityProcess` per run.** Best isolation; `REQ-ORCH-151`'s per-session scoping becomes
structural rather than disciplinary and a crash costs one run. Against: `REQ-SANDBOX-067`'s
once-per-process, application-lifetime availability cache would become per-run — either a 5 s cost per
launch or a verdict that can differ between two live runs, which `REQ-SANDBOX-096` forbids. It also
contradicts the plain reading of `REQ-TOOLS-089` and `REQ-SANDBOX-038`, and turns the run registry
(ADR-0013) and "ask every handle to stop before waiting on any" (`REQ-MONITOR-255`) into a distributed
protocol rather than local calls.

**C — Four process kinds.** Chosen; described below.

## Decision

Four process kinds, and no others, **all of them processes of the one instance**. `REQ-STARTUP-002`
and `REQ-STARTUP-015` are satisfied because each is the shipped Electron binary re-entered or a
`utilityProcess` fork of it: no second executable is installed or published, and no user-typable
argument vocabulary is defined.

**1. Main (Electron main).** The instance claim and the hand-over listener (ADR-0055,
`REQ-STARTUP-161`, `REQ-STARTUP-164`); window lifecycle and the window registry; native choosers and
message boxes; the quit guards and the force-exit backstop; the self-update path; the desktop
preference store; the persistent-notice store; the credential store, the sign-in flows, the loopback
HTTP listener and the keep-fresh scope; presenter registration for approvals. **Main never writes
into a session's store** — `REQ-EVENTS-098` makes the right to write a session's history exactly the
right to hold that session's lock, and main does not hold it.

Main is the instance's front door because the hand-over is a window operation: what a handed-over
launch produces is a surfaced window or a newly built one (`REQ-STARTUP-162`, `REQ-STARTUP-163`), and
the window registry is in main.

**2. Run host — one `utilityProcess`, forked after `app.ready`, living exactly as long as the
application.** The run engine and the child scheduler; the session writer and the event history; the
permission gate, the tool executors, the terminal sessions, the confinement wrapper and the egress
client; the MCP session connection registry; hook child processes; the sandbox availability cache; the
queued-prompt service. It holds every session lock this application takes — which, under SR-1, is
every session lock any process of this product takes.

*The run host and the "tool execution runtime" are the same process.* RUNTIME proposed one and EXEC
proposed the other, neither knowing about the other. They cannot be two: `REQ-EVENTS-098` gives write
rights to the lock holder, `REQ-TOOLS-176` requires a call to be decided under the policy, sandbox
specification, egress configuration and artifact store of **its own issuing run**, and
`REQ-SANDBOX-067` allows one availability verdict per process. Splitting them would put the
permission gate on one side of a process boundary and the session lock on the other, for every tool
call.

**3. Workspace service — one `utilityProcess` per open workspace.** Configuration loading, Git
invocation, checkpoints, the traceability engine (its passes on terminable worker threads), the
delivery store, the improvement library and the workspace document stores. It exists because
`REQ-TRACE-073`'s project-supplied regexes and `REQ-TRACE-225`'s deliberately unbounded engine read
must share a loop with neither the windows nor the runs, and because `REQ-TRACE-377`'s guard test is
structurally satisfied by a sandboxed renderer that physically cannot spawn a process.

Under SR-1 "one per open workspace" is unambiguous: several main windows may be open on several
workspaces, but two windows open on the *same* workspace (`REQ-STARTUP-163`) share one workspace
service rather than each getting one. The service is keyed by resolved workspace path, not by window.
Why that is the right key, and why it does not contradict ADR-0058, is settled in the next section.

Two further things belong to this process because nothing else can hold them.

**`REQ-STARTUP-166`'s storage classification is determined once per workspace open and held here.** The
requirement makes the determination "from the storage the workspace directory sits on", requires it for
every workspace this product opens and by every path that opens one, and puts it in `REQ-STARTUP-043`'s
post-show background activation. It is a property of the **path**, which is this service's key, and it is
consumed by two unrelated parties: main raises the notice, at most once per opening of a workspace in a
window; and the integration precondition of `REQ-GIT-124` and `REQ-GIT-128` reads it before it reads the
integration lock. `REQ-GIT-128` forbids domain 06 making the determination again — "this domain states no
storage test of its own" — so there must be exactly one determination and somewhere for it to live. It
lives here, for the life of the workspace open, and both consumers read it. ADR-0005 owns what the
integration precondition does with it.

**The whole-store backup of `REQ-SESSION-201` is taken here.** It is O(store) and it must not be refused
because a session is live, so it cannot sit on main's 100 ms budget (`REQ-SHELL-150`) and it must not sit
in the run host, which holds every session lock and owns the publish path. The workspace service is the
only process that resolves an identifier and opens the store (ADR-0058), which makes it the only process
that can name what to copy. Main contributes the save dialog and nothing else, on the narrow-request
route of consequence 7. ADR-0058 owns the mechanism.

### What identifies a workspace — settled, 2026-09-02

The previous version of this record carried a correction *"owed, recorded rather than resolved"*: that
ADR-0058 keys the store by identifier while this record keys the service by path, and that "the two
records now answer 'what identifies a workspace' differently". **That framing was wrong and it is
withdrawn.** The two records key two different objects, the specification fixes both keys separately and
in terms, and there is no reconciliation to invent. What follows is the evidence, then the one thing that
genuinely was unsettled and is decided here.

**The open workspace is a resolved directory path, and the specification keys it that way wherever it is
user-visible.** `REQ-STARTUP-041` (a) expands and resolves a directory a launch carries and persists it
as `workspace/lastOpened`. `REQ-STARTUP-163` decides whether a handed-over launch reuses a window or
builds one by asking whether "a main window of that instance already has that directory open".
`REQ-STARTUP-047` switches projects by folder, and `REQ-STARTUP-048` honours a switch for the window it
came from. `REQ-STARTUP-166` classifies "the storage the workspace directory sits on". `REQ-CONFIG-477`
and `REQ-TRACE-513` keep configuration, personas, model slots, the requirement documents, the generated
artifact and the baselines as files under that path. Every Git operation in domain 06 runs in that tree.

**The durable session store is keyed by the workspace identifier, and the specification keys it that way
wherever it is not.** `REQ-SESSION-001`: the record "lives in that workspace's durable session store,
which is machine-local and is found through the workspace identifier rather than through a path".
`REQ-SESSION-197` makes the identifier "the workspace's name for its durable session store … located by
that identifier and never by the workspace's path". `REQ-SESSION-198` puts that store outside the
workspace entirely. `REQ-LIBRARY-042` scopes the improvement library to the same store on the same terms.

**So the resolution is `path → identifier → store`; the first arrow is many-to-one; and it is traversed
exactly once per workspace open, by this service.** A copied folder gives two paths and one identifier
(`REQ-SESSION-197` forbids re-minting over a readable one). A moved folder gives a new path and the same
identifier. `REQ-SESSION-001` composes the two keys in one sentence — the record is reachable from "the
workspace the desktop window has open" *together with* the session id, and it lives in the store found
through the identifier — so the specification is not silent here and it did not pick one key over the
other. It gave each object its own.

**Keying the service by identifier instead would be wrong, not merely different.** Every job this service
does is scoped to one directory: configuration loading against `<workspace>/.rotaris/`, Git invocation in
one checkout, worktrees under one root, `REQ-TRACE-073`'s scan over one repository's files, the delivery
store against one set of requirement documents. Two folders presenting one identifier are two of all of
those. A service keyed by identifier would have to hold two roots and choose between them per call, which
is a defect with a tidier key, not a simplification.

**Keying the store by path would also be wrong, and the field has the filed bug to prove it.** ESC-19's
comparison found that the two surveyed harnesses which key session history by encoded absolute path have
a documented, reproduced defect — sessions orphaned when a project folder is moved or renamed, one report
losing 63 sessions across 10 projects after a reorganisation, and even a change of a folder name's case
orphaning everything — and that the fix their users ask for is a stable per-project identifier file.
`REQ-SESSION-197` is that file. This is stated here as well as in ADR-0058 because the tempting
"simplification" a later sweep will propose is precisely to collapse the two keys into the one this
record already uses, and it would land the product on the defect the design avoided.

**What genuinely was unsettled, and is decided here: what "resolved path" means.** The requirements say
"expanded/resolved" and "has that directory open" without fixing directory identity, so this record fixes
it for its own key.

- Absolute, with `~` and relative segments expanded, and platform-normalised separators.
- **Symlinks and junctions resolved to the real path**, so a symlinked project and its target are one
  workspace and get one service.
- **Compared case-insensitively where the filesystem is case-insensitive**, which is why
  `REQ-SESSION-197`'s identifier is a value ADR-0058 chose to be case-insensitively unique — the same
  property is needed one level up.
- **Not** reconciled across a UNC spelling and a mapped-drive spelling of the same share, or across a
  mounted image and its source. There is no reliable, cross-platform way to do it and a wrong answer
  merges two workspaces silently.

Where two spellings fail to canonicalise to one, the consequence is bounded rather than silent: two
services exist over one folder, both resolve the same identifier, and ADR-0058's per-instance identifier
claim gives the store to the first and opens the second without one, reporting the condition. That is the
same report as the copied-folder case and it is the safe direction.

**What this settles in OQ-47 and what it does not.** OQ-47's closing paragraph — "two records disagree
about what identifies a workspace" — is **discharged**; both records now state the same two-key
arrangement and this section is the statement. OQ-47's first two paragraphs stay open and are not touched
by this: what happens when two folders presenting one identifier are open at once is architecture-invented
behaviour on a specification silence and still wants ratifying, and the absence of any product remedy for
a copied folder or a corrupt identifier file is still a gap whose only answer is the user editing a file.

**4. Renderers — one per top-level window,** with `contextIsolation: true`, `nodeIntegration: false`
and `sandbox: true`. No filesystem, no Git, no engine, no session store. This is not a posture chosen
for its own sake: the transcript renders Markdown authored by a model (`REQ-CHAT-056`) and the
terminal grid renders bytes authored by an arbitrary process (`REQ-SHELL-095`).

The **configuration loader is a library, not a service.** Both the workspace service and the run host
instantiate it. `REQ-CONFIG-014` forbids a read cache, so re-reading is correct rather than wasteful,
and `REQ-CONFIG-262`'s Tier B overlay together with `REQ-SANDBOX-038`'s "the owning run's current
saved configuration" require a run to resolve its own configuration at run start.

### What SR-4 does and does not change here

**It does not change the process count.** Part of RUNTIME's original case for a separate run host was
the cost of the durable flush `REQ-SESSION-068` and `REQ-SESSION-070` demand. That argument is now
weak: a synchronous transaction commit against a workspace database is cheap where a whole-document
rewrite plus rename was not, and it satisfies `REQ-SESSION-068`'s "usable in a caller's context where
no asynchronous runtime is active" as well or better. **That reason is withdrawn from the case.** The
remaining reasons are untouched by the choice of store and each is independently sufficient:

- native modules, the PTY binding above all, and the crash domain they carry;
- unrestricted process spawning — pseudo-terminals, hook children, `stdio` tool servers
  (`REQ-ORCH-123`, `REQ-HOOKS-030`, `REQ-SESSION-049`);
- the renderer sandbox, and `REQ-TRACE-377`'s guard that no desktop module launches a checking
  process;
- a run's lifetime exceeding any window's (`REQ-SESSION-106`, `REQ-SHELL-017`);
- one sandbox availability verdict per process (`REQ-SANDBOX-067`, `REQ-SANDBOX-096`);
- the 100 ms gesture budget on main and the renderers (`REQ-SHELL-150`).

**The topology stands.** This was verified rather than assumed: the flush-cost argument was the only
one of the six that the store choice touches.

**It does add one topology obligation.** SR-4 scopes the store to one database per workspace, and two
process kinds hold data that table places in it — the run host (sessions, transcript rows, event
history, evidence, permission audit, delegated-child ledger, checkpoint index) and the workspace
service (delivery records, the improvement library, the checkpoint index it maintains). So **one
workspace database is opened by two processes.** That is a fact about this topology and it is
recorded here even though the concurrency mechanism belongs to ADR-0003 and ADR-0004. Two properties
must hold or the topology is wrong rather than the store: **readers must not block writers** — which
this topology needs in its own right, because the workspace service reads session-scoped rows the run
host is writing, and not because it settles `REQ-TRACE-502`, which it does not (OQ-41, ESC-14) — and
`REQ-EVENTS-098`'s single
writer per session must remain true, which it does, because only the run host writes session data and
only while holding that session's lock. The workspace service writes no session row.

**And ESC-19 adds a second one, which is the first place two open connections have to be *closed* in
order.** `REQ-SESSION-201`'s restore replaces a whole store, and no platform lets a file be replaced
underneath open handles — on Windows the writer's-handle spike measured a rename over a held descriptor
failing outright. So a restore needs both connections shut before it swaps and re-opened after, which is
a two-process handshake with a defined order. It is the second in the record; ADR-0014's quit is the
first, and this one is not the same shape because the application keeps running through it. The order,
and what a reader observes in the window between, are ADR-0058's to fix. What this record fixes is that
there are exactly two connections to close, that main holds none, and that a renderer holds none.

### The transport between the run host and a renderer

**Main relays, and that is now a measured choice rather than a default.** The two update channels of
ADR-0044 travel run host → main → renderer. Measured, run-host publish to renderer-applied, on this
topology: p95 **1.13 ms** with no rows resident and **1.29 ms** with 10,000 rows resident, against
`REQ-MONITOR-222`'s 250 ms; and p95 **5.95 ms** unloaded for the whole-session update, against
`REQ-ORCH-155`'s 100 ms p95. The relay is kept.

**A transferred `MessagePort` from the run host straight to the renderer is verified viable and is
recorded as an available option, not as a requirement.** It was built and measured in the same harness:
1.8× to 2.1× better on the transcript increment, 3.7× on the whole-session update, and 5× to 113× better
on the transcript increment under heavy terminal load. It was confirmed to work with `sandbox: true`,
`contextIsolation: true` and `nodeIntegration: false` **all intact**, so none of the renderer posture
this record fixes is given up to get it. It would also discharge ADR-0044's cross-channel ordering
obligation by removing the hop that could violate it. It is not adopted, because the measurements say
the relay already passes and a second transport is cost without a requirement behind it.

**One detail is load-bearing and is recorded here so it is not rediscovered: `contextBridge` cannot carry
a `MessagePort`.** Exposing one through `contextBridge.exposeInMainWorld` produces an object on which
`postMessage` is not a function. The route that works is the preload receiving the port on the
`ipcRenderer` channel and **re-posting it into the main world with `window.postMessage(msg, '*',
[port])`**. Anyone who takes this option and reaches for `contextBridge` will conclude, wrongly, that a
sandboxed renderer cannot hold a port at all.

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

## Unresolved conflict between slices

**The workspace service.** No slice other than DATA proposes it. Adopting it adds a fourth process
kind that RUNTIME, EXEC, MODEL and UI did not budget for, and puts one more boundary in front of the
board projection — `REQ-TRACE-239`'s 100 ms budget is measured *after* the engine answers, so the
crossing is real cost that no requirement covers. The alternative, folding the workspace service into
the run host, is cheaper by one process and defensible, at the cost of running project-supplied
regular expressions inside the process that holds every session lock. **Recommendation: keep the
workspace service and measure the projection crossing before implementation begins.** See open
question OQ-2.

*The per-run-process conflict that stood here is no longer unresolved.* DATA's "per-run runtime
processes remain separate and short-lived" lost to EXEC's and RUNTIME's reading on
`REQ-SANDBOX-067`, and the cost of that reading — a run-host crash losing every in-flight run — has
now been put to the owner and accepted. It is recorded as consequence 1 rather than as an open
disagreement. DATA's position is not deleted: it is alternative B above, and it remains the named
remedy under "Revisit if".

**Where the session projection lives.** UI placed it, and the queued-prompt service, in main.
ADR-0010 and ADR-0043 place the projection in the run host — it is the lock holder, and
`REQ-MONITOR-218`'s "no debounce, delay floor or minimum wait of any size" for an unseen row cannot be
met by a party that learns about the row by re-reading state, which `REQ-SESSION-071` in any case
forbids as a way of following a run, with no exception anywhere in the product. The queued-prompt
service is placed in the run host because that is where prompts are consumed under `REQ-MONITOR-139`
and `REQ-ORCH-071`. UI's position and the alternative reading of `REQ-CHAT-041` are recorded in
ADR-0043 and open question OQ-1. The persistent-notice store stays in main, because `REQ-NOTIFY-025`
and `REQ-NOTIFY-027` bind it to the application process across window re-creation.

## Discharged — the double-hop latency clause, retired 2026-09-01

This record previously carried: *"Measurement shows the run-host-to-main-to-renderer hop cannot meet
`REQ-MONITOR-222`'s 250 ms p95 or `REQ-ORCH-155`'s 100 ms — in which case take a `MessagePort`
transferred directly from the run host to the renderer before reconsidering the process count."*

**That measurement has been taken and the hop passes**, so the clause is discharged rather than left
standing as an unresolved contingency. It is preserved above so a reader can see that the topology was
adopted on argument and has since been confirmed on evidence, and that the escape hatch it named was
built and found to work rather than merely asserted.

- `REQ-MONITOR-222` — measured p95 **1.133 ms** at 0 resident rows and **1.291 ms** at 10,000, against
  250 ms. Worst single sample over 10,200 samples: 47.8 ms.
- `REQ-MONITOR-223` — ratio **1.14** (10,000 rows against 0, same content, p95), against a ceiling of 2.
  It holds under both store-append strategies measured, and at `REQ-SESSION-192`'s 5,000-row residency
  cap the ratio is 1.19. **It passes for a reason that depends on that cap** — see ADR-0044.
- `REQ-ORCH-155` — SR-8 rules the 100 ms a 95th percentile and the requirement now says so. Under that
  reading the relay measures p95 **5.95 ms** unloaded and **7.81 ms** under heavy terminal load, a
  margin of 8× to 40×. Under an absolute reading 24 of 9,000 samples exceeded 100 ms; SR-8 records why
  that reading is unsatisfiable in principle and is not the requirement's.

**What is not discharged** is consequence 9's third bullet: the relay has a message-rate ceiling, and
what keeps the product below it is ADR-0021's cap rather than anything in this record.

## Revisit if

ADR-0021's coalescing cap is relaxed, removed, or is found not to bound the aggregate frame rate across
concurrently flushing streams — in which case the relay's per-message ceiling stops being unreachable
and the `MessagePort` option above is taken for the update channels, with a second port for terminal
frames. Or `REQ-SESSION-192`'s residency cap is relaxed, which is the assumption `REQ-MONITOR-223`'s
measured ratio rests on. Or several concurrent runs become routine and consequence 1 is judged
unacceptable in practice rather than in principle — in which case move to alternative B and name a
separate owner for the sandbox availability verdict, accepting either the 5 s trial per run or a verdict
cached outside the runs that use it. Or a requirement appears that fixes directory identity for
`REQ-STARTUP-163`'s "already has that directory open" — this record's canonicalisation rule is an
architecture decision on a specification silence and a requirement would supersede it. Or the restore of
consequence 11 is found to need the run host to give up a store while a session in *another* workspace is
live, which would make the connection close per-identifier rather than per-process and is the first thing
to check when ADR-0058's handshake is built.

## First execution — 2026-09-03, the walking skeleton

*Recorded under GD-10: a mechanism's first execution reports back into the record that decided it,
including when it found nothing.*

**Built and run:** `apps/desktop/src/{main,run-host,workspace-service}` — main forks one run host at
`app.ready` and one workspace service per opened directory, keyed by canonical path, over
`utilityProcess` with the process protocol in `@rotaris/contracts`. `hello` round-trips answered; a
workspace directory carried by a second launch was resolved by the service (identifier minted once,
store opened and migrated to schema v1) and the **resolved path** handed to the run host, which opened
it and acknowledged. The run host is not re-forked on exit; the log says so and nothing else happens.

**Found: nothing in this record.** Two things beside it, both in the build and stated in ADR-0056's
note. **Not exercised:** a run-host crash with runs in flight (nothing runs yet); the quit choreography
beyond one bounded `shutdown` request; two windows on one workspace sharing a service.

## First execution — 2026-09-03, consequence 7's narrow request back to main

*Recorded under GD-10.*

**Built and run:** the workspace service's restore reaches the run host through a request back to main
(`ServiceAskEnvelope` on the process protocol, correlated by `ask`, answered by `ServiceAnswerEnvelope`),
which main forwards to the run host's existing requests and answers, every hop bounded (consequence 11).
Main supplied the save dialog, the open dialog and three message boxes, and did no work of its own
(`REQ-SHELL-150`): the backup and the restore ran in the workspace service, the refusal lease in the run
host. The two children never talked directly.

**Found: nothing in this record.** The route is a message shape and a forwarder.
