# ADR-0002 — Process topology — Decision

Part 3 of 11 of [ADR-0002](../0002-process-topology.md), which indexes every part.

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
arrangement and this section is the statement. OQ-47's first two paragraphs stay open *(ruled 2026-10-06, [R-071](../../../product/requests.md#r-071): ADR-0058's behaviour ratified, the hand edit accepted for the first release)* and are not touched
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
