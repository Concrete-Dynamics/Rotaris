# Rotaris-crw — system architecture

- **Status:** proposed. The Architecture Gate has not been held and implementation is not authorised.
- **Behavioural target:** `ROTARIS-CRW-001` (see [`../clean-room/reference-record.md`](../clean-room/reference-record.md))
- **Evidence base:** [`constraints.md`](constraints.md) — what the specification forces, with requirement identifiers — read together with [`../spec/resolutions/`](../spec/resolutions/), the twenty-one records disposing of every open question each domain draft raised. A resolution sometimes narrows what a requirement appears to license; `constraints.md` says where and why.
- **Measurements:** [`spikes/`](spikes/) — four reports, all dated 2026-09-01, and **the first real evidence this record has ever had**. Several of them overturn something it asserted. They are named inline wherever a claim rests on one, and the ADRs that depend on them carry an `Evidence:` header field.
- **Decisions:** [`adr/`](adr/) — 58 records, numbered in dependency order
- **Unresolved:** [`open-questions.md`](open-questions.md) — **twenty-five escalations, eighteen ruled and seven open**; forty-six specification questions (four closed with their reasons, forty-two open); two design-reference dependencies; twenty-one numbered spikes of which one is withdrawn, two discharged and one discharged for Windows only
- **Ruled on:** [`owner-decisions.md`](owner-decisions.md) — ESC-1 to ESC-18 and nine structural rulings, SR-1 to SR-9. **Every escalation raised *before this pass* is ruled, and the specification amendment pass those rulings authorised has landed.** This pass raises **seven new ones (ESC-19 to ESC-25)**, and every one of them is a cost of a ruling or a consequence of a measurement rather than a decision anyone deferred — two of them are requirements SR-9 minted that are **not in the specification**. Read SR-4's own correction block before citing SR-4: an earlier version of that ruling claimed the store dissolves OQ-41 and it does not (ESC-14).

This document describes the system one Electron desktop application makes: what its parts are, which
process each runs in, how they talk, where state lives, and what happens end to end when a user starts a
run. It is written to be the thing an implementer reads first. Every claim in it is a decision recorded
in `adr/` and traceable to requirements in `constraints.md`, to a ruling in `owner-decisions.md`, or to a
measurement in `spikes/`.

The product is a single graphical application. There is no command-line entry point, no terminal user
interface, and no embedding or programmatic surface through which code the user did not launch can start
or drive a run (`REQ-STARTUP-002`, `REQ-STARTUP-015`, `REQ-EVENTS-178`). It does run programs on the
user's behalf, and a great deal of the architecture exists to make that accountable.

---

## 1. The shape of the system

**One running instance.** At most one instance of the application runs per user account
(`REQ-STARTUP-161`). A launch resolves to exactly one of two outcomes and no third: it becomes the
instance, or it is handed to the instance already running and ends **without opening a window, without
writing to the preference store and without writing any per-user or per-workspace state**
(`REQ-STARTUP-162`). A handed-over launch carrying a workspace opens that workspace as a window of the
running instance (`REQ-STARTUP-163`). Multiple workspaces and multiple windows are fully supported; they
are windows of the one instance. The claim runs **before** anything else in start-up, which is what makes
the write-nothing rule structural rather than a discipline (ADR-0055 phase 0).

**One thing now runs before even that**, on one artifact only. A `onefile` artifact may prepare itself
once and start from that preparation thereafter (`REQ-STARTUP-165`), and the preparation happens in a
process the single-instance claim has not yet been made in — so **SR-1 does not serialise two racing
preparations**, and ADR-0054 resolves that race by making the completion marker the directory name
(ADR-0055 phase −1).

The one interval in which two processes of this application genuinely coexist is
`REQ-STARTUP-164`'s reclaim path, where a record naming an unreachable process is taken over. What makes
that interval safe is the session lock, not the single-instance rule.

Four kinds of process, and no others — all of them processes **of that one instance**. Each is the
shipped binary re-entered or a child forked from it, so the single-executable rule holds.

```text
┌─────────────────────────────────────────────────────────────────────────────────┐
│ MAIN  (Electron main — one per instance, and there is one instance)              │
│                                                                                  │
│  instance claim + hand-over listener · window registry · native choosers         │
│  quit guards · self-update · preference store · persistent-notice store          │
│  credential store · sign-in flows · loopback listener · keep-fresh scope         │
│  approval presenter registration · workspace-identifier claim (one per instance) │
│  ── never opens the workspace store; never writes a session ──                   │
└───┬────────────────────┬─────────────────────────────────────┬──────────────────┘
    │ control            │ transcript increment  (+ seq)       │ command / probe
    │ + relay            │ session snapshot      (+ seq)       │ (per workspace path)
    │                    │ terminal frames                     │
    │                    │ notices                             │
┌───▼────────────────────▼─────────┐                  ┌────────▼─────────────────┐
│ RENDERERS (one per window)       │                  │ WORKSPACE SERVICE        │
│  sandboxed · no filesystem       │                  │  one per open workspace, │
│  no store handle                 │                  │  keyed by resolved path  │
│                                  │                  │                          │
│  replica store  ← two channels   │                  │  reads the identifier    │
│  sequence check + reconcile      │                  │   → RESOLVES THE STORE   │
│  transcript recycler + apply     │                  │  configuration loader    │
│  terminal display emulator       │                  │  git invocation helper   │
│  markdown parse + measure caches │                  │  checkpoint layer        │
│  acknowledgement stack           │                  │  traceability engine     │
└──────────────────────────────────┘                  │    (worker threads)      │
                                                      │  delivery store  (rows)  │
      ┌──────────────────────────────────────────┐    │  improvement library     │
      │ RUN HOST  (one utilityProcess,           │    │  schema migrations       │
      │            application lifetime)         │    └──────┬─────────┬─────────┘
      │                                          │           │         │
      │  run engine · child ledger · scheduler   │           │ rows    │ files
      │  session writer · event history          │           │         │
      │  permission gate · tool executors        │           │         │
      │  terminal sessions (PTY) · confinement   │           │         │
      │  egress client · MCP session registry    │           │         │
      │  hook child processes                    │           │         │
      │  sandbox availability cache              │           │         │
      │  queued-prompt service                   │           │         │
      │  ── holds every session lock row ──      │           │         │
      │  ── is HANDED a resolved store path;     │           │         │
      │     never reads the identifier file ──   │           │         │
      └────────┬──────────────────────┬──────────┘           │         │
               │ rows                 │ files                │         │
               ▼                      ▼                      ▼         ▼

  ── MACHINE-LOCAL, per-user LOCAL data dir ──          ── IN THE WORKSPACE ──
  workspaces/<identifier>/workspace.db                  <workspace>/.rotaris/
    one store per workspace, per machine                  the workspace identifier (a file)
    sessions · transcript rows · released pages           integration.lock  (REQ-GIT-128)
    event history · evidence · timeline · issues          agents.yaml · models.yml
    permission audit · child ledger · lock rows           secrets.yaml · personas
    checkpoint index · delivery records                 <workspace>/
    improvement library · saved prompts                   docs/requirements/ · baselines
  workspaces/<identifier>/sessions/<session-id>/          the generated symbol artifact
    summary.md · debug.log · artifact bodies              the user's own repository
                                                        per-user config + data dirs
```

**Two process kinds open the store and no others.** The run host writes session-scoped rows, and only
for a session whose lock row it holds; the workspace service writes workspace-scoped rows and runs schema
migrations at workspace open, before the run host is told the workspace is open. Main and the renderers
do not open it at all — a renderer that could would forfeit the sandbox the transcript and terminal
surfaces rest on. That is `REQ-EVENTS-098`'s single-writer rule made structural rather than disciplinary
(ADR-0058, constraints W-01, W-02). `REQ-EVENTS-098` as amended goes further and makes the store's
concurrency a **conformance property**: "a reader MUST NOT be able to delay or block the writer", so a
store in which one blocks the other does not satisfy the requirement at all.

**Only one process resolves a workspace identifier, and it is the workspace service.** It takes the
instance claim on that identifier, opens the store read-write once (performing the write-ahead-log
recovery ADR-0005's stale detection depends on), migrates, and hands the **resolved store path** to the
run host. The run host never reads the identifier file. Two resolvers would be two answers to "which
store is this workspace", and the failure would be silent (constraint W-18).

**Main** owns the windows and everything that must outlive one of them: the notice store, whose
identifiers are unique across every window of the process and survive window re-creation
(`REQ-NOTIFY-025`, `REQ-NOTIFY-027`); the preference store, established before the first preference read
and before any window exists (`REQ-SHELL-006`); and the credential store with its sign-in flows and the
loopback listener those flows need (`REQ-PROVIDER-031`). Main also carries the **instance claim and the
hand-over listener**, because the claim must be made before `app.whenReady()` resolves — and, beside it,
the claim on each open **workspace identifier**, so that within one instance an identifier is claimed
once (constraint W-19). Main **never writes a session and never opens the workspace store**: the right to
write a session is exactly the right to hold its lock (`REQ-EVENTS-098`), and main does not hold it.

**The run host** is one utility process, forked after the application is ready, living exactly as long as
the application. It holds every session lock this application takes, and therefore everything that writes
a session: the engine, the writer, the event history. It also holds everything that executes on the
user's behalf: the permission gate, the tool executors, the pseudo-terminals, the confinement wrapper,
the egress client, the tool-server connections and the hook child processes.

**A run-host crash is an accepted cost, and it is now accepted rather than disputed.** Every in-flight
run is lost at once. Each of its sessions is **stale, not foreign** — SR-2 leaves no third condition —
so each settles through the ordinary reap and repair path (`REQ-SESSION-047`, `REQ-SESSION-060` to
`REQ-SESSION-063`) and then opens as an ordinary persisted session. Recovery is **plural**: one fault
produces one stale session per in-flight run, possibly across several workspaces, and the repair notice
`REQ-SESSION-062` and `REQ-SHELL-155` specify in the singular has no specified behaviour for that
(**OQ-46**). Restarting the run host inside a living application is deliberately **not** offered,
because a silently re-forked host would let a session be started again while its stale lock row is
unreaped.

**The crash domain has concentrated three times over and nothing prices the compound.** One run host
holds every session lock; one store per workspace holds every session's record; and a lock is now a row
inside the object it guards. Each step was argued on its own and each is defensible; the compound — a
store that will not open produces no sessions at all (`REQ-SESSION-089`, ESC-16), and a host that dies
produces one stale session per in-flight run — is recorded here because it appears nowhere else as a
single risk.

Two independent proposals arrived at the run host from opposite directions — one reasoning from the run's
lifetime and the synchronous durable flush, the other from the sandbox availability cache and the
100 ms gesture budget — and **they are the same process**. They cannot be two: a call must be decided
under the policy, sandbox specification, egress configuration and artifact store of its own issuing run
(`REQ-TOOLS-176`), the availability verdict is once per process (`REQ-SANDBOX-067`), and the write right
follows the lock. Splitting them would put the gate on one side of a boundary and the lock on the other,
for every tool call.

**The workspace service** is one utility process per open workspace, **keyed by resolved workspace path
rather than by window** — so two main windows on one workspace share one service. It exists because two
workloads are deliberately unbounded — project-supplied regular expressions compiled and run over
repository files (`REQ-TRACE-073`) and an engine read on which the specification places no wall-clock
limit "as a deliberate decision and not a gap" (`REQ-TRACE-154`, `REQ-TRACE-225`) — and neither may share
a loop with the windows (`REQ-TRACE-337`) or with the runs. It also makes the guard test of
`REQ-TRACE-377` structural: a sandboxed renderer physically cannot spawn a checking process. Under SR-4
it gained a job that must not be given away — it is the **only** process that runs a schema migration —
and under ESC-15 a second: it is the **only** process that resolves a workspace identifier.

**Keying the service by path is now in tension with keying identity by identifier**, and the record says
so rather than smoothing it. `REQ-SESSION-197` makes a moved folder the same workspace and lets two
folders present one identifier, so a path is not an identity. ADR-0058 keys the store claim by identifier
and leaves the service keyed by path; that is the minimum consistent arrangement and not a settled one.
See **OQ-47**.

**Renderers** are one per top-level window, sandboxed with no filesystem access. That is not a posture
chosen for its own sake: the transcript renders Markdown authored by a model and the terminal grid
renders bytes authored by an arbitrary process. The same posture is why a renderer does not hold a store
handle: a shared read replica backed by the store would forfeit exactly the isolation that makes the
sandbox meaningful.

The one part of the specification's own vocabulary this topology does not settle is the queued-prompt
service, which `REQ-CHAT-041` scopes to windows and runs "sharing the same process". It is placed in the
run host, where prompts are consumed and where session ownership is enforced, and that placement is
carried as open question **OQ-1**.

---

## 2. What travels between them

Three channels leave the run engine, and they have **incompatible failure contracts**. That is why there
are three rather than one, and it is the single most important thing to understand before touching any of
them.

**Control** is request and response. Every one of the twenty-one control operations must be issuable
against a run in a different process, with arguments limited to text, numbers, booleans and simple
collections "so that a request survives a process boundary without losing meaning" (`REQ-MONITOR-013`).
The result is a boolean plus an optional string populated for exactly two operations; a control answers
`false` rather than raising, and is safe from concurrent callers (`REQ-MONITOR-005` to
`REQ-MONITOR-011`). Since SR-1 that boundary is unambiguously **the run host against the window**;
`REQ-MONITOR-013` now says in terms that it "is never the boundary between two instances".

**Wire events** are the ordered, **bounded-blocking** bus. Delivery of one event to one consumer must
complete before the run proceeds past the operation that raised it — "a slow consumer delays the run
rather than losing or reordering events" — bounded at five seconds, after which that consumer is detached
permanently (`REQ-EVENTS-165`). Every event is **committed to the durable record before it is forwarded**,
so an event a failing consumer never receives is nevertheless recorded.

**View updates** are **non-blocking** and best-effort. No view may hold a run open, slow it down, or
change its outcome: a run observed by nothing, by a healthy view, or by a broken one must reach the same
terminal result, the same persisted record, the same event sequence and the same timing
(`REQ-MONITOR-232`). They carry two payload shapes — an incremental transcript update carrying the lowest
row index whose content may still change, and one whole-session update carrying **every field any surface
can display** (`REQ-MONITOR-214`, `REQ-MONITOR-216`, `REQ-MONITOR-217`).

**Nothing polls, and loss is detected rather than waited for.** Every publication on either view channel
carries a **monotonic per-session sequence number**, from **one counter shared by both channels**,
starting at 1 and raised by exactly one per publication (`REQ-MONITOR-214`). A surface begins from a
whole-session update and counts on from the number that update carried; a publication bearing any other
number means one was lost, and the surface must record a diagnostic, stop consuming increments and
re-render from a whole read **on the publication that reveals the gap, with no delay and no timer**
(`REQ-MONITOR-226`). A number at or *below* the expectation is a superseded publication rather than a
gap, which is also what discharges `REQ-MONITOR-225`'s "a stale read must never overwrite newer content".
The number is stamped **in the run host at the moment of publication**, by the same per-session owner that
gates on the durable commit; neither main nor the preload may generate, renumber or re-derive one. Three
consequences are easy to get wrong and are stated in ADR-0043: an expectation is created **by a
whole-session update and by nothing else**; subscribing, un-hiding a window and changing focus all
**begin** rather than continue; and a surface that is reconciling **drops** publications for that session
rather than queueing them, which is what keeps the apply-stage counters byte-identical across processes.

This replaces the 2000 ms local reconcile poll and the 750 ms foreign poll, both withdrawn.
`REQ-MONITOR-288` survives only as a withdrawal, naming what replaced it, and `REQ-MONITOR-287` now
states that this domain **fixes no cadence for polling a session's own state at all** — the timing
constants it does still fix are unrelated to following a run and are cited where each is used.

The event bus and the view channel look like they should be one thing. They cannot be: one says a slow
consumer delays the run, the other says no view may slow it at all.

Across the process boundary these become five named, typed IPC channels — transcript increment, session
snapshot, terminal frames, notices, and commands — with the two update channels relayed by main and every
payload carrying the session id it belongs to, so that a focus-change race is structurally impossible
rather than timing-dependent. The two update channels additionally carry the sequence number, and main
**relays it unchanged**. No sixth channel is added for reconciliation: the request is a command on the
existing command channel, and the response is a whole-session update plus a transcript increment with an
earliest-changed index of zero over the resident window.

### What the measurement changed here

`spikes/ipc-hop-latency.md` is the first measurement of the double hop, and it settles three questions
and overturns one claim.

**The relay meets every budget, with room.** Run host to renderer, measured p95: **1.133 ms at zero rows
and 1.291 ms at 10,000 rows**, against `REQ-MONITOR-222`'s 250 ms — roughly two orders of magnitude. The
`REQ-MONITOR-223` ratio is **1.14** against a ceiling of 2, and 1.19 at `REQ-SESSION-192`'s actual
5,000-row residency cap. The whole-session update, which is what `REQ-ORCH-155`'s surfaces travel on, is
p95 **5.951 ms** unloaded and 7.807 ms under 65.5 MB/s of terminal frames, against the 100 ms that
requirement now states **explicitly as a 95th percentile** — SR-8's amendment has landed, and read as an
absolute bound the same data fails (24 of 9,000 samples over 100 ms). ADR-0002's Revisit-if clause is
discharged; ADR-0044's structured-clone trigger is discharged (quadrupling the payload multiplied p95 by
2.05, not by 4).

**"Terminal frames on their own channel" does not do what the record said it did.** A distinct Electron
channel *name* is not a distinct transport: every `webContents.send` for one `webContents` is multiplexed
onto one pipe, dispatched by one main-process event loop and one renderer main thread. Transcript p95
rose **6×** at 65.5 MB/s and **97.8×**, to 126.207 ms, at 12,000 frames per second. The relay's cost is
**per message, not per byte** (33–37 µs per 4 KiB send against 163–195 µs per 64 KiB). ADR-0044 was wrong
about the mechanism and right about the outcome, and it now says so; the argument it was chosen on is
preserved there as the withdrawn claim it is.

**What actually supplies the isolation is ADR-0021's coalescing cap, and that cap is now load-bearing for
a conformance budget in another domain.** At the rate the architecture licenses — a 20 ms coalescing
floor, so ≤50 frames/s per stream, ≈1,000 frames/s across `REQ-MONITOR-285`'s 20 agents — no topology
showed a problem (p95 1.514 ms). ADR-0021 carries that statement now, because a reader asking "what
protects the 250 ms p95" would otherwise open ADR-0044 and find a channel list. **The second factor in
that arithmetic is bounded by no requirement**: `REQ-TOOLS-108`'s `runtime.shell_max_background_sessions`
has a default of 20, a minimum of 1 and **no maximum**, and each background session publishes its own
stream (`REQ-TOOLS-127`). That is a new escalation, not an architecture choice.

**The relay's real failure mode is invisible to the mechanism installed to catch failures.** In the
collapse, **nothing was dropped and nothing was reordered** — every one of 586,960 frames arrived, in
order, `refused = 0` — while main's event-loop lag reached 22,777 ms. `REQ-MONITOR-226`'s sequence-gap
counter catches a *lost* update; this failure loses nothing and presents only as a stale interface.
ADR-0010 puts two instruments on ADR-0052 for it — a publish-to-apply latency stamp and a relay
message-rate counter — on the strength of a measured failure mode rather than a requirement, and says so.

**The direct `MessagePort` is measurably better and is not adopted.** It is 1.9×–2.1× on an increment,
3.7× on a whole-session update, 26.9× on that update's worst sample and 113× under 12,000 frames/s, and
it was verified to work with `sandbox`, `contextIsolation` and `nodeIntegration` intact. It was the
difference between passing and failing **only** on `REQ-ORCH-155` read as an absolute bound, and SR-8
ruled that reading incoherent. It is therefore recorded as a lever held in reserve, which is where
ADR-0044 consequence 3 puts it, rather than as a second transport with no requirement behind it.

**Two things bound how far any of this may be spent.** Every figure is a **lower bound** on the interval
the requirements actually bound: the transaction commit `REQ-MONITOR-221` requires before publication is
upstream of what was measured, and nobody has measured it. And the harness's renderer was empty — no
framework, no state store, no Markdown renderer, no real recycler, one window, one session, development
mode. A reader who takes 1.291 ms as the product's number will be surprised.

**One obligation here is invisible in the payload types and no type check will catch it.** Because one
counter is shared by two channel names, per-session order must be preserved **across** them. A snapshot
overtaking an increment presents as a gap that nothing was lost from, and the surface reconciles anyway —
a self-inflicted reconcile rate on the one path the design needs to keep rare (constraint U-20).
`REQ-SHELL-104`'s per-stream terminal sequence is a **different** counter with a different scope.

**And one rule about the transcript increment is a correctness rule, not an optimisation.** Publishing an
earliest-changed index of zero for anything but a genuine reset silently converts every update into a
whole-transcript transfer (`REQ-MONITOR-223`). The sender asserts against it and diagnostics counts it.
Any cross-process test of `REQ-MONITOR-222`, `REQ-MONITOR-223` or `REQ-ORCH-155` must **calibrate its
clocks**: `performance.timeOrigin` is not a shared epoch, and the measured offset ranged over 1.43 ms —
larger than a whole one-way latency on the direct port.

---

## 3. Where state lives

**A file when a human or another tool is meant to read or edit it, or when version control must track it.
A store record when only the application reads it and it is high-volume, queried, or transactional.**

That is SR-4's principle, and it is stated as a principle rather than as a table because the table cannot
list everything and a reader has to be able to place something nobody listed. It replaces this record's
previous verdict — *files are the system of record; there is no database anywhere in the product* — which
four slices reached independently and which is preserved in ADR-0003 as the alternative it now is, with
all five of its objections, because a reader must be able to see why the record changed its mind.

**The specification did not adopt the mechanism; it adopted the observables.** This is the single most
important thing to understand about the amendment pass, and it is easy to read past. No live requirement
anywhere names a database, a table, an index, a query or a schema migration. What the requirements now
name is a **store** and what must be true of it: one workspace plus one session id resolves one record
(`REQ-SESSION-001`); a save is all-or-nothing (`REQ-SESSION-028`); a reader may not delay the writer
(`REQ-EVENTS-098`); a listing's cost grows with the number of sessions "and with nothing else"
(`REQ-SESSION-042`); the store is machine-local (`REQ-SESSION-198`). Engine, schema and indexes are
therefore architecture's to choose and architecture's to be wrong about — and `REQ-MONITOR-299`, which
this record once called "a conformance-test methodology encoded as a product requirement, a fossil", now
says so itself: it compares record **kinds**, not directory entries. Constraint D-22 records the
re-derivation.

### The store is machine-local, and it is found by an identifier rather than by a path

**This reverses what a previous pass wrote here**, and the reversal is a ruling (ESC-15) rather than a
preference. The store does **not** live at `<workspace>/.rotaris/workspace.db`. It lives in the machine's
own per-user **local** data directories for `rotaris` (`REQ-STARTUP-145`), at
`workspaces/<identifier>/workspace.db`, with the closed set of per-session files `REQ-SESSION-002` fixes
— the log, the human-readable summary, and artifact, attachment and image **bodies** — under
`sessions/<session-id>/` beside it, because `REQ-SESSION-198` requires them held *with* the store so that
one session's record is never split across storage a synchronising client reaches and storage it does not.

**Why, and it is not performance.** Write-ahead logging is unsupported on network filesystems, so a store
inside a workspace on a share opens read-only; acquiring a session lock is a **write**
(`REQ-SESSION-046`); so `REQ-SESSION-089` refuses the run and **no session in that workspace can start at
all**. Under the file design that workspace worked, merely slowly. That is a total outage of the core
function on a configuration that is ordinary in corporate environments, and the old ADR-0058 had written
it down as a limitation — "degraded, not merely slow" — without noticing that "degraded" meant this.
`REQ-SESSION-198` now requires the opposite outcome in terms: a workspace on a network share or in a
synchronising folder **MUST be fully usable**, and it is, because the store is not there. The old
decision is preserved in ADR-0058 as alternative J with its whole case intact — self-contained
workspace, no indirection, nothing to reclaim — and consequence 3 is marked **withdrawn and not to be
cited**.

**The identifier is the only thing binding a workspace to its sessions**, which is why
`REQ-SESSION-197` is written as absolutely as it is. ADR-0058 fixes its form — `v1-` followed by 32
lowercase hex characters carrying 128 bits of randomness, matching `^v1-[0-9a-f]{32}$`, in one commented
file in `<workspace>/.rotaris/`, read as the first non-blank non-comment line — because the requirement
fixes the identifier's properties and consequences but not its shape, and the shape is load-bearing: it
becomes a directory name on three filesystems, two of them case-insensitive. It is minted by **exclusive
create**, once, and never rewritten; a create that finds the file present reads it and is not an error.

| It must survive | It must **not** survive |
|---|---|
| moving and renaming the workspace folder | a fresh clone — the product's own **best-effort** ignore rule keeps `.rotaris/` out of version control (`REQ-CONFIG-013`, `REQ-CONFIG-456`), so a clone mints its own and starts empty |
| copying the folder, and carriage through a synchronising client | |
| a second machine — two stores, one per machine, **intended** (`REQ-SESSION-197`, `REQ-SESSION-198`) | |
| a different version of this product | |

**One edge of that table is softer than it looks and is worth naming.** `REQ-CONFIG-013`'s ignore rule is
**best-effort**, and `REQ-CONFIG-477` ground 3 says *deciding otherwise* is deliberately the user's
choice. A user who commits `.rotaris/` therefore ships the identifier with their repository, and every
clone of it presents the same identifier — which on one machine is the concurrent-duplicate case below,
and on another machine is simply an empty store, exactly as a second machine is meant to be. Neither is a
new failure; both are consequences the table already licenses, and neither is stated anywhere in the
specification.

An identifier the product cannot read is reported as a condition on `REQ-SESSION-089`'s terms — the
workspace opens, there is no store, there are no sessions and no runs — naming why the product will not
replace it. **Both remedies are the user's**, and a reader should notice that: `REQ-SESSION-197` forbids
re-minting over a readable identifier absolutely, with no user-confirmed exception, which is right for
the failure it prevents (silently orphaning a history) and means the product's answer to a copied folder
and to a corrupt identifier file is "go and edit this file". No product action was invented, because the
requirement is absolute.

Two further decisions ADR-0058 takes here are **architecture-invented behaviour on specification
silence**, and both are flagged for ratification rather than presented as settled. Two concurrently open
workspaces presenting one identifier: the identifier is claimed once per instance, and the second opens
**without a store**, reporting the condition in `REQ-SESSION-089`'s vocabulary. Sequentially — open one,
close, open the other — **nothing** may happen, because that case is indistinguishable from a move and
any detection there would break `REQ-SESSION-197`. The hazard being avoided is not corruption: it is a
resume in one window starting an agent that writes files into the folder the user does not have open
(`REQ-SESSION-014`'s `workspace_root`). See **OQ-47**. And reclaiming a store whose workspace no longer
exists is **user-initiated only**, from a surface listing this machine's stores with last-seen paths,
size, session count and last-open time, offering the exports first. Automatic reclamation is **refused**:
the only available signal is a last-seen path that no longer resolves, and a path stops resolving when a
drive is unmounted, when a share is down, and above all **when the folder has been moved** — precisely
the case the identifier exists to survive. See **OQ-48**. `origin.txt` records last-seen paths for
diagnostics and reclamation and **must not be consulted to resolve a store**, stated so that
path-as-identity cannot re-enter by the back door.

**The cost, and nobody owns it.** A user's session history, permission audit, improvement library and
artifact bodies now live outside anything they back up when they back up their project, **and the
specification does not tell them**. SR-9(b) saw this and minted a requirement for it. That requirement is
**not in the specification** — twenty-one domains contain no backup, restore or synchronised-folder
disclosure, and `resolutions/07` records the backup profile of a machine-local store only as a *concern
raised*. Every mitigation this record has is an export, and `REQ-SESSION-199` forbids building anything
that repeats one. This is the ruling breaking something, stated plainly. It is a gate item, not a note.

### The table

| Where | What | Written by | Discipline |
|---|---|---|---|
| per-user **local** data dir → `workspaces/<identifier>/workspace.db` — **one store per workspace, per machine** | session records and listing records, transcript rows and released pages, the event history, the timeline, the issues record, evidence, the permission audit, the verification-gate record, the delegated-child ledger, the checkpoint index, the session **lock rows**, delivery records, the improvement library, saved prompts | **run host** (session-scoped rows, under that session's lock row) and **workspace service** (workspace-scoped rows); no other process opens it | one transaction per unit of work; write-ahead logging read back at open, and a failure to enable it is a **fault**, not a degraded mode; migrations forward-only, in the workspace service, before the run host is told the workspace is open |
| `workspaces/<identifier>/sessions/<session-id>/` | `summary.md`, `debug.log`, artifact/attachment/image **bodies** — `REQ-SESSION-002`'s closed set of three kinds and nothing else | run host | atomic replace for `summary.md`, with `REQ-SESSION-033`'s ladder; append for the log, which nothing compacts; a revised artifact writes a **new** body and the row is re-pointed, so a body file is never replaced over itself |
| `<workspace>/.rotaris/` | **the workspace identifier**; `REQ-GIT-128`'s `integration.lock`; configuration, secrets, personas, model slots, worktree bindings | workspace service | exclusive create for the identifier and the integration lock, never replaced over themselves; atomic replace for the rest, per-store policy; comments and layout **preserved** (ESC-2, and `REQ-CONFIG-477` ground 1 is the argument in force — `REQ-CONFIG-252` is ruled but **unamended**) |
| the user's own repository | requirement documents, the generated symbol artifact, baselines, the tombstone log | **workspace service**, under two named actions only, through **one I/O owner** | atomic replace; reading never writes; worker threads receive bytes and never open these paths |
| per-user configuration directory | `agents.yaml`, `models.yml`, `secrets.yaml`, the discovery snapshot | workspace service and main | atomic replace; an adjacent lock file **per target**, serialising read-modify-write inside this one instance; **reads take no lock** |
| per-user **data** directory (a different directory) | provider credentials, setup state | **main only** | atomic replace, **explicit protection applied and read back**, adjacent lock |
| per-user preference store | the closed key table — panes, drafts, theme, board view state | **main only** | typed registry; theme committed synchronously |

The last four rows are unchanged, and two of them are now **conformance surfaces rather than architecture
positions**. `REQ-CONFIG-477` and `REQ-TRACE-513` were minted in the amendment pass and each states the
file/row line as a *boundary* with four independently sufficient grounds: configuration must be held as
files and must not be moved into a store only this application can read, and the four traceability
artifacts stay plain files in the user's own repository. Moving either is therefore a **specification
amendment**, not a decision available here. Credentials cannot be rows for a different reason —
`REQ-PROVIDER-016` requires `0600` plus an explicit Windows access-control list with inheritance
disabled, read back, and requires that the credential not be written at all when the protection cannot be
applied, which is a filesystem guarantee no row makes. Desktop preferences cannot be rows for a simpler
one: the store is per **user** and must be resolved and read **before the first window exists**
(`REQ-SHELL-006`), while this store is per **workspace** and no workspace is open yet.

`REQ-TRACE-513` also closes ESC-14's correction with a requirement rather than an argument: because the
four artifacts never enter any store, no store's concurrency properties reach them, which is exactly why
**OQ-41 did not dissolve** and is narrowed by SR-1 instead.

### What a user can still read for themselves

`REQ-EVENTS-166` is now written as an export obligation and declares itself **the single definition of
what an export of a session record must guarantee**, for that document and every other, in two forms
(`REQ-EVENTS-172`, `REQ-EVENTS-132`) with three attached obligations. `REQ-EVENTS-090` follows it: a
single line feed terminates a record in any line-delimited **rendering**, and "a store that does not
separate its records by newlines does not violate it". `REQ-SESSION-199` extends the same guarantee to
the timeline, the issues record, the metrics document and the permission audit, and `REQ-SESSION-191`'s
reveal action now names all three actions explicitly. That discharges SR-6 and ESC-17.

Three things about that list are worth stating rather than discovering.

- **The audit's export must be checkable, not merely present.** `REQ-SESSION-199` requires a statement
  that entries were dropped "and how many"; ADR-0024 makes that statement arithmetic a reader can perform
  — each entry carries its ordinal, ordinals are never reused, and the export carries the cap in force,
  the cumulative dropped count and the oldest retained ordinal, so *oldest minus one equals dropped* and
  retained ordinals must be contiguous. An unfalsifiable statement is exactly the decorative export
  `REQ-EVENTS-166`'s third obligation names.
- **The tool-call evidence record must never gain an export.** `REQ-SESSION-136` deliberately holds
  **unredacted** arguments; the audit exports safely only because `REQ-TOOLS-079` gives an entry no
  argument values at all. Any future extension must not sweep it in.
- **The list is being drawn case by case and the argument reaches further than the list.** SR-6 covered
  four records; SR-9(a) then ruled improvement artifacts and delivery records in on the same terms and
  **neither is minted** — domain 14 contains no export requirement at all. Meanwhile `REQ-TOOLS-190`'s
  verification-gate record is reached by the identical argument and is excluded by a positive sentence in
  its own text: "that only this application reads it is why it is a record rather than a file the user is
  offered." Either that sentence is the boundary and SR-6's reasoning has a stated stopping point, or the
  list is short again. That needs an owner's answer.

### The document primitive: two write shapes, and one ladder

One primitive still performs every atomic replacement for the stores that remain files, and it still has
a guarded read side — a concurrent reader observes an **empty** file roughly once in a few thousand reads
under contention, and a silent empty read of configuration would present as *no configuration* under
`REQ-CONFIG-017`, which is the dangerous case. So it retries on decode failure after a successful stat,
and **no reader holds a descriptor between calls, on any thread**.

It now has a **second write shape**: exclusive create — create-or-read, and delete — which carries two of
the product's identity guarantees, which workspace this is (`REQ-SESSION-197`) and who is integrating
(`REQ-GIT-128`). Neither of those files is ever replaced over itself.

**The retry-schedule field is back, with exactly one value in it** — which is literally what the previous
version's own *Revisit if* predicted. `REQ-SESSION-033` was **narrowed, not withdrawn**: it still governs
`summary.md`, states its 0.05/0.1/0.2/0.4/0.8 s ladder, and declares itself "the only replacement ladder
this domain states". So **OQ-11 is closed, and the reason previously recorded for closing it was wrong**:
it is not that neither ladder has a file left to govern, but that `REQ-LIBRARY-043`'s ladder went with its
document layout — because no writer outside this application can reach a record in that store
(`REQ-LIBRARY-158`) — while `REQ-SESSION-033`'s survived precisely because its file *is* reachable by
one. One ladder remains and there is nothing to reconcile. **OQ-44 survives with a sharper and narrower
statement**: the corpus does state a ladder, and it is in the wrong domain to be borrowed for
`REQ-TRACE-061`, which still requires a failed replace re-raised with none.

### Two things the measurement corrected here, and they matter for the reason

`spikes/windows-writer-handle-compaction.md` measured the file design this record used to describe. Its
subject is gone; three of its findings are not.

- **"Node does not request share-delete, so an ordinary reader blocks a replace" is false.** An `unlink`
  *succeeds* against a Node-held handle, from another process too, while both fail against a holder
  requesting read/write sharing without delete — so Node's open does request share-delete. What actually
  fails is the replace-by-rename call, which cannot replace a destination with **any** open handle,
  whatever its share mode, and fails **even when the holder explicitly permits delete**. Rules 1 and 3 of
  ADR-0004 were right for a reason the record had mis-identified. The correct *Revisit if* is therefore a
  runtime API or native binding exposing the platform's own file-replacement call, which the spike
  measured replacing a target this process holds open while a held reader continued to see complete
  previous contents.
- **"A directory `fsync` is unavailable on Windows through the runtime" is false.** It fails only on a
  read-only handle; on a write-opened directory handle it returns success, 200 of 200, at ~0.1 ms. The
  decision not to perform one is unchanged and its **ground is replaced**: not "the call is unavailable"
  but "a success return does not establish the guarantee, no power-loss test has been run, and no
  remaining requirement asks for one". It is now a decision with a price rather than a platform
  limitation, and **OQ-12** says so.
- **The diagnosis behind the deleted rule 3 is confirmed and generalises.** In the naive shape, 0 of 115
  trims completed, the cap was exceeded and growing, **no reader observed any symptom**, and append
  throughput collapsed roughly seventy-fold. An append-and-compact file whose writer holds it open is a
  silent cap-enforcement failure. Nothing in the product may reintroduce that shape, whatever the medium.

### One store per workspace is one corruption domain, and nobody backed it up

That is stated rather than assumed, because SR-4 required it stated, and it is now worse than when it was
first written: under ESC-15 the store is the **only** copy of the session history on any machine.
Bounded three ways — other workspaces are separate files; the user's own material is never in it, so
requirement documents, baselines, configuration, credentials and every artifact body survive a destroyed
store even though the index does not; and a copy is taken before every migration, with a copy that cannot
be written **aborting** the migration.

**The recovery ladder is rewritten for a store nobody backed up**, and its order changed: report the
store unopenable, carrying the engine's own reason unaltered (`REQ-EVENTS-084`); **salvage into a fresh
store first**; export what salvage recovered; and only then offer to move the damaged store aside, saying
that this machine holds no other copy. The application never deletes a store and never repairs one in
place.

**Two versioning layers, decided separately.** A record's own version field is a column, read
forward-tolerantly and never migrated in place — `REQ-CONFIG-192` as amended now withdraws
`store_subpath`, states that "no key of this domain names a directory, file or document format for it",
and closes with "a workspace holding an unsupported record still opens and still runs". **Table** schema
is a problem the specification names nowhere: forward-only numbered migrations, each inside one
transaction, run only in the workspace service. A store newer than the application is **refused** and
**nothing is written to it**, so an older build hands a newer store back untouched. What cannot be
preserved is forward tolerance per *structure*: under files one bad record sat there while its neighbours
read; under a schema an unsupported table layout stops every row at once. Additive-only migrations
mitigate that; nothing fixes it.

---

## 4. How a run flows, end to end

**Launch.** The user presses Start in a window. The renderer sends a command; main relays it to the run
host. The run host loads the workspace configuration itself — the loader is a library, not a service, and
`REQ-CONFIG-014` forbids a read cache — then copies it and layers the settings store's **current** values
on top, synthesising slot-level variants exactly as the loader does (`REQ-CONFIG-262`). What a run uses
is what is on screen at that moment, not what was last committed to the file.

**Admission.** The confinement mode is resolved and, if a mode is requested, the availability verdict is
read from the cache the run host has held since start-up. A session requiring confinement the host cannot
deliver **does not start**: no session, no lock, no snapshot, and the run's event stream carries that
refusal as its first and only entry (`REQ-SANDBOX-094` to `REQ-SANDBOX-097`). The worktree is bound.
Credentials for every provider behind every slot model, persona and configured model are primed in one
pass, with an **unconditional renew** inside the refresh margin rather than a fetch that would hand back a
nearly expired token (`REQ-PROVIDER-066`, `REQ-PROVIDER-067`).

**Session creation.** Initial state is persisted, **then** the lock is acquired (`REQ-SESSION-048`). The
lock is a **row** in the store it protects, in **one table with one kind of row, keyed by session id** —
the `kind` column this record used to carry is gone, because `REQ-GIT-128`'s integration lock is now a
**file** in the workspace and does not share the table. The row carries `pid`, `host` and `acquired_at`
as columns because `REQ-SESSION-046` makes those three names and types a machine-readable contract and
`REQ-SESSION-183` reads all three back to the user before it acts. Atomic exclusive create becomes a
primary-key insert. On collision at most one stale-reap attempt is made, and only when the row's content
parses, names this machine, and its process probes dead here — **no waiting, no retry loop, no second
reap** (`REQ-SESSION-047`). Acquisition and reap are **one transaction**: begin, insert, on constraint
failure read the row and apply the three conditions, delete-and-insert once if all hold, otherwise roll
back and leave the row exactly as it was found. That is strictly stronger than the file, where
read-check-delete-then-create was three operations with a window between each.

**A refusal must say what is actually wrong, and the two cases differ.** `REQ-SESSION-048` is now the
single definition of what a lock refusal conveys, and it requires this-machine and another-machine
distinguished: the first names the pid this application's own run holds; the second reports that **the
store is reachable from more than one machine** rather than reporting a lock conflict. Under
`REQ-SESSION-054` as amended a foreign-host lock is no longer an accepted limitation but "a state that
should not arise" — the `host` field is retained as a **fault detector**, which makes the case for a
durable lock stronger rather than weaker. The refusal is built from the row read inside the rolled-back
transaction, so a second read cannot disagree with it.

**The lock's purpose is unchanged, and SR-1 is not a reason to weaken it** — `REQ-SESSION-047` says so
itself. One instance runs at a time, but **the instance that crashed is exactly what the reap path exists
for**, and an in-memory registry would die with the process the reap path is for. Non-terminal children
read back are settled to cancelled **before the first iteration, without probing liveness**, because
holding the lock is itself proof the previous owner exited (`REQ-ORCH-053`). Release order is unchanged:
session-scoped subprocesses torn down first, the lock row deleted last (`REQ-SESSION-049`).

**The product now has one liveness predicate over two lock media, and that is a standing invariant rather
than a task.** `REQ-SESSION-171` and `REQ-GIT-093` both demand one verdict about one pid at one moment;
the media differ **deliberately**, because `REQ-GIT-128` protects the base repository, which is the
user's own material and travels with the workspace, so a second machine reaching the same checkout must
meet the same lock. A later sweep that "unifies the two locks" would erase exactly that guarantee.
`REQ-GIT-128` records why they are not unified; ADR-0005 records what would break (constraint W-20).

The store is opened read-write once, by the workspace service, at workspace open, **before any other
process is told the workspace is open and before any stale detection runs**, because a crashed process
can leave a write-ahead log needing recovery and that recovery is a write performed at open. The event
history and the event channel are established **before any part of start-up can fail**
(`REQ-EVENTS-035`). The launch audit is written exactly once, after the worktree bind and the sandbox
verdict, before the first iteration — and there is **no create-if-missing step anywhere in the writer**,
because `REQ-SESSION-132` requires a record kind a session never wrote to read as empty *without* a
placeholder being created for it.

**Iteration.** The engine asks the model layer for a turn. That layer is **two ports, not one**: a
streaming `ModelClient` for providers that are model endpoints, and an `AgentBackend` that owns a turn —
because one supported provider is a locally installed agent runtime with no base URL at all
(`REQ-PROVIDER-005`, `REQ-PROVIDER-049`, `REQ-ORCH-146`, `REQ-MCP-043`).

Text deltas become transcript rows. A row a view has not yet seen is published **immediately — no
minimum wait, debounce or delay floor of any size, on any platform**; growth of an already-visible row is
coalesced into a trailing fifty-millisecond tick (`REQ-MONITOR-218`, `REQ-MONITOR-219`). Every change is
**persisted before it is published** (`REQ-MONITOR-221`), and the durable record it is persisted to is
**the transaction that recorded it**. One event, one commit, before the event is observable on any
channel — so a run killed between the two leaves a record with no event and never an event with no record
(`REQ-EVENTS-029`, `REQ-EVENTS-072`, which now instructs the mechanism: where the store can make the
record and the event one indivisible step, it **must**). No group commit across events.
`REQ-MONITOR-221` states its own reconciliation with `REQ-MONITOR-218`: it is satisfiable alongside it
"because persistence carries no delay of its own".

**Every requested save is applied, and the debounce is gone.** This is a change of substance, not of
wording. `REQ-SESSION-067` now forbids a save being "deferred behind a timer, parked, or coalesced with a
later one"; `REQ-SESSION-071` withdraws the write-volume observable outright and states that "no bound on
write volume is stated and none is needed"; `REQ-SESSION-034` states the crash-loss budget **in saves** —
a crash loses only changes for which no save was ever requested. Two saves requested microseconds apart
produce two commits. The queue never drops, parks, merges or delays. `REQ-SESSION-139`'s metric
aggregates are therefore **maintained** rather than recomputed — adjusted inside the transaction that
inserts an evidence row and inside the one in which a ring displaces one — so the rebuild is O(1) and the
per-save copy copies figures rather than computing them.

**What the withdrawal cost, stated so it is not discovered later.** The window bounded exactly one thing
that is still a file: `summary.md`. `REQ-SESSION-028` rebuilds it on every save and calls it "the one
part written as a file"; `REQ-SESSION-033` gives it the corpus's only retry ladder, spending up to about
1.55 s of backoff; and it is the one write in the product where a foreign handle — anti-malware, or the
user's own editor reached through `REQ-SESSION-191` — can make a save-caused write take a second. ADR-0008
puts it **after** the commit, off the run's critical path, ordered by the save's generation so an older
rebuild cannot overwrite a newer one, with a failed replacement warning and leaving the previous summary
in force; the licence is `REQ-SESSION-006`'s "it is on no path a run waits for". `REQ-SESSION-028`'s
"rebuilt by the same save" admits a blocking reading too, and no requirement settles which. It is derived
and nothing a loader reads is at risk, but this is the ruling's price and it is on the same path as
persist-before-publish.

**Transcript residency is implemented, not dissolved.** A previous pass read `REQ-SESSION-192`'s stated
*reason* — every state save rewrites it whole — as the whole requirement, and withdrew the mechanism with
the reason. Both `REQ-SESSION-192` and `REQ-SESSION-131` survive with new stated purposes: a bounded
resident cost of 5,000 rows and an unbounded complete history, release in whole pages of 50 **before** the
append, index stability across release, and older rows served from released pages, with `REQ-CHAT-165`
depending on both by name. A row carries a nullable page column — no page means resident, a page means
released — and no path ever updates a row that carries one. Separately, the measurement says the same
thing from the other side: the renderer's idiomatic immutable store update costs **2.83 ns per resident
row**, so relaxing the bound spends `REQ-MONITOR-223`'s margin, and that margin is currently supplied by
the transport rather than by the store.

**A tool call.** The model asks for a tool. One gate decides it, and there is no ungated dispatch path.
The gate resolves session approvals first, then the policy, which is an immutable ordered value whose
matchers were compiled when it was built; **building can fail, evaluation cannot**. An `ask` suspends
**exactly that one call** while the session's other agents keep running; the request is published,
mirrored into session state, and presented by main in a per-window queue that main does not decide.

**Attendedness is now the specification's own capability test, not an architecture invention.**
`REQ-TOOLS-053` as amended reads: a session is interactive "exactly when an approval prompt for that
session can be put in front of a person". Registration absence is a *sufficient* condition, not the
definition. ADR-0019's channel-level liveness poll is therefore the implementation of that test rather
than a patch over a gap — a wedged presenter is not one an approval can be put in front of. One
narrowing follows and is easy to get wrong: `REQ-SANDBOX-101` fixes attendedness "at the moment its mode
is resolved", so a lapse governs where a **later** ask is routed and never revisits a mode resolution
already made. A lapse mid-run must not retroactively downgrade a run's permission mode. The lapse window
itself is still anchored by nothing (**OQ-39**), and the measurement gives it only a floor: a single
`webContents.send` took 88.263 ms while main was otherwise idle, and a wedged main was observed at
22,777 ms of event-loop lag — but no dialog was ever shown in the harness, which is the case the window
has to survive.

On `allow`, pre-execution hooks run — in declaration order, one after another, **even after one has
decided to stop the call**. Then the tool executes; if it is a command, it goes into the terminal
session's persistent pseudo-terminal shell, wrapped for confinement if a mode is active, **as a single
shell argument**, quoted, because quoting is a security boundary rather than a formatting nicety.

Every decision is recorded to the permission audit through one serialised writer, together with its
issue, its timeline event and its stream event, and **none of them may fail the dispatch**. The audit is
an append-only table whose rows carry the serialised entry **verbatim**, which discharges
`REQ-TOOLS-078`'s "byte-for-byte as it was written" literally rather than by paraphrase; there is no
update path in the data layer and a store-level trigger refuses one. `REQ-TOOLS-081` now uses
`REQ-EVENTS-056`'s `<record kind>#<record id>` locator rather than naming a file. The two durable side
effects and the audit entry commit in **one** transaction and the wire event is forwarded after it. Ring
displacement happens in that same transaction — `REQ-SESSION-133` now **requires** it, "the trim MUST
take effect in the same durable operation that records the entry" — and the cumulative per-kind dropped
count is a second maintained counter, because `REQ-SESSION-199`'s export consumes it.

**The event history's trim is the one place two ADRs disagree, and the record says so rather than
picking.** ADR-0009 puts `REQ-EVENTS-091`'s trim in its **own** transaction on the serialised queue,
immediately after the commit of the append that overflowed and before the next event is recorded, because
a trim inside the append's transaction cannot fail without discarding an event and would make
`REQ-EVENTS-091`'s stated failed-trim semantics inexpressible. ADR-0004 takes the other reading, which is
right for `REQ-SESSION-133`'s rings, where the requirement names one durable operation and
`REQ-EVENTS-091` does not. The truncation record is inside the trim's transaction either way
(`REQ-EVENTS-092`, "the same indivisible step as the trim that produced it"), which closes a crash window
the file design accepted.

**Delegation.** A child is a **ledger record**, not a promise, and under SR-4 it is rows. Two mechanisms
got **stronger** rather than merely re-homed. The child row's update and the `child.transition` event
commit in one transaction, so `REQ-MONITOR-016`'s "leave the record untouched, deliver no state-change
event" stops being a discipline and becomes unviolatable, and `REQ-MONITOR-300`'s two settling paths
(`REQ-MONITOR-209`, `REQ-MONITOR-211`) are ordinary arguments to the same transition function rather than
a bypass of it — which is what keeps the sole-implementation claim true through later sweeps. And the
start claim becomes one conditional update whose affected-row count **is** the outcome, so
`REQ-ORCH-049`'s at-most-once holds by the store rather than by the scheduler's shape, and the
suppression record commits with the losing claim. A scheduling **pass** must not become one transaction:
starting a child is model and tool work. One thing got weaker and is recorded as an obligation with a
test rather than as an incidental: `REQ-ORCH-151`'s per-run isolation was a filesystem partition under
files and is a session-id query predicate now, so a missing predicate is a silent cross-run leak in the
one record whose whole point is that concurrent runs cannot influence each other.

**Watching.** A renderer holds a replica, written only by the two channel handlers. Its apply stage is an
explicit pure function of (displayed state, incoming state) returning either a refusal or a new view model
plus six classified operation counters. A stage that cannot correctly apply an increment **declines it and
re-renders from a whole read**. The transcript is painted by a **fixed pool of recycled row slots, sized
from a declared `H_max` and allocated at window construction**, because the count of live paintable
elements must be invariant after construction and a conventional list mounts and unmounts rows as the
visible set moves.

**ADR-0045 is no longer blocked, and it was a ruling that unblocked it.** ESC-13 is decided:
accessibility wins, the canvas is refused outright, and if OQ-28 resolves to the framework-neutral
reading then `REQ-UIBENCH-054` is **relaxed**. So the record survives either reading, and OQ-28 reverts to
what it should always have been — a definitional question about how a number is counted, whose answer
changes a benchmark field and nothing a user can see. The measurement arrived alongside and went the
other way, which is exactly why the ruling was needed: under reading 1 `widgets` was **629 at all 384
observations** across twelve runs, two scroll variants, onscreen and offscreen; under reading 2 it moves
**630 → 777** (reader at the top) or **630 → 715** (reader at the bottom) at the first post-construction
record, in every run — before any of the phases OQ-28 discusses, and by an amount padding cannot repair.
Under reading 2 the count also stops being a property of the transcript and becomes a property of where
the reader is scrolled. `REQ-UIBENCH-050` and `REQ-UIBENCH-054` are **unamended**; the corpus therefore
still states an invariant that its own definition breaks on one live reading, and `resolutions/21`
withholds the drafted relaxation. That is a specification-side action and no gate should close over it.

Two other things the renderer measurement settled. The memory tripwire passes with room —
`rss_second_half_growth_bytes` between 106,496 and 7,172,096 bytes against 64 MiB, a worst case of
**10.7 %** of the threshold — but on Windows `rss` is the working set and the operating system trims it,
so a phase whose settle expires produces a *negative* growth figure that satisfies the tripwire while
measuring nothing; one run produced −109,273,088. And **"the largest viewport the window can reach" has
no referent**: a 20,000 px content height was requested, granted, and reported as a real laid-out viewport
on a machine whose tallest display is 1,080 px, calling for 671 slots against a pool of 80. ADR-0045's
replacement of that formulation with a declared constant is not tidier, it is the only thing available to
write down — and somebody must still choose the number (**OQ-40**).

**There is no viewer of a session another process owns, because there is no such session.** A session is
in exactly one of two conditions and no third (`REQ-SESSION-159`, `REQ-MONITOR-243`): live and executed by
this instance, published to over the two channels and by no other route; or not running, existing as a
persisted record, put back on screen by being opened from that record and continued (`REQ-SESSION-196`).
One live session may be displayed in as many windows as the user has open. A session left behind by a
crash or a force-quit is **stale, not foreign**.

`REQ-SESSION-196` is simpler than this record used to describe: the snapshot read's completion step from
stored `transcript.row` events is **withdrawn**, because "a row the session recorded is a row its
persisted state already holds and there is nothing left to complete". `REQ-SESSION-159`'s closing
guarantee — that following a session and reopening it produce identical transcripts — is true by
construction, because only one derivation remains.

**The decline-and-re-read path has two entrances and neither fires in normal operation**, so both must be
exercised deliberately by tests: an increment the stage cannot apply, and a sequence gap. It is the
product's only loss-detection mechanism, and a rising reconcile count in diagnostics is a defect signal
rather than normal traffic. It is also the one path nothing has measured — `refused = 0` in every run of
the IPC spike, so the cost of a reconcile has never been taken.

**Stopping.** A cancel **first releases anything blocked on a person** — questions, then approvals,
resolving each as **denied** — and only then stops the run. Graceful first, hard after thirty seconds,
with a second sweep for work created during the first. The stop request is **sticky**.

Teardown is an ordered eight-step pipeline that runs **even on any exception**: timeline entry, logging
cleanup, **lock release** — which first tears down the session-scoped tool-server subprocesses — one run
result, `session.end` then exactly one `result` over the bus while the sink is still attached, the
disabled-hooks notice, and the removal of every per-session binding.

**Quit.** Main evaluates the window guards, asks the run host to stop **every** run before waiting on any
of them, and holds process exit until the run host reports teardown complete or a thirty-second deadline
expires — the same deadline as the cancellation grace, composing exactly with it. `REQ-MONITOR-131`'s
"a restart that is not a shutdown waits at most 5 seconds" and `REQ-MONITOR-287`'s worker join cap are
**different** allowances and must not be unified with it. A second quit during that window force-exits
immediately. **What a force exit can leave is now enumerated rather than gestured at**: incomplete ordered
effects, a reapable lock row, a truncated line in the session log, and a `summary.md` replacement that
lands as one of its two complete versions — and no partial trailing JSON line and no unwritten debounce
window, both of which are gone with the requirements that produced them. `REQ-SESSION-106` as amended
closes with "no run is ever left holding a lock that this machine cannot reclaim", which is what keeps
SR-5's unreapable case out of the quit path. Meanwhile the workspace service **waits** for in-flight
checkpoint version-control work and **abandons** an in-flight improvement analysis; those two behaviours
differ deliberately and must not be unified. At quit two of the three processes hold connections to one
machine-local store, so the quit sequence closes two connections in a defined order rather than leaving
it to process exit.

---

## 5. The disciplines that hold it together

Eight rules recur across the whole record. Each exists because a requirement made it observable, or
because a measurement showed the alternative fails.

**One definition, cited everywhere else.** The child state machine, the tool capability table, the
redaction algorithm, the liveness predicate, the artifact naming scheme, the key encoding table, the
status normalisation — each has exactly one implementation, and a second is a defect rather than a
duplication.

**One predicate, even where the media differ.** The product holds **one** liveness verdict over **two**
lock media — a row for `REQ-SESSION-046` and a file for `REQ-GIT-128` — because `REQ-SESSION-171` and
`REQ-GIT-093` both demand one answer about one pid at one moment, and the media differ deliberately.
This is the rule most likely to be broken by a well-meaning tidy-up.

**Direction is part of the query.** A tool outside the registry has no capability declaration, and is read
fail-closed **in the direction of the reading rule**: a rule that grants sees nothing declared, a rule
that withholds sees everything declared. One accessor cannot serve both, so there are two.

**Fail closed, and never by timeout.** The permission gate fails closed on any exception; a lost channel
to main makes every session unattended, which routes asks to the headless policy — reached without a
timer. Approvals suspended at quit resolve as denied. Liveness resolves toward alive, so a session that
might be running is never reaped.

**Persist before publish, durable before wire.** Nothing reaches a view before **the transaction that
recorded it has committed**, and for an enumerated set of pairs nothing reaches the wire before its
durable record. **A transaction makes several of these guarantees cheap; it does not excuse stating
them.** Isolation is not sequence: emission order, ordinal assignment, the serialised per-session writer
and the publish sequencing are all still owned, still stated, and still tested. Two of the record's
cross-artifact orderings are not covered by any transaction at all, because one side of each is a Git ref
— and `REQ-GIT-049` settles their direction.

**Time is injected.** Every duration is measured against a monotonic clock and must be demonstrable with a
controlled clock; no conformance claim may depend on real provider latency. Two clock ports — monotonic
for budgets, wall for the three timestamp conventions that coexist deliberately — and a `Budget` value
type carrying the composition rules. No bare timer appears in engine code. **And no cross-process interval
is asserted without calibration**, because `performance.timeOrigin` is not a shared epoch.

**Structure over discipline.** Where a requirement demands a property, the record prefers a shape that
makes it true rather than a convention that keeps it true: a branded type for redacted strings, distinct
reader and writer handles for the delivery store, a typed key registry that will not compile for an
unregistered preference, a store-level trigger that refuses an `UPDATE` on an append-only table, an
assertion the application checks at start-up before it will run.

**Measure the thing the requirement bounds, not the thing that is easy to measure.** This is new, and
every one of the four spikes earned it. The end-to-end p95 passes `REQ-MONITOR-223` because a ~500 µs
transport floor dwarfs a store apply — so a regression in the apply stage would not show up at all, and
the test that would catch it measures the apply in isolation. Bundle weight was assumed to bound first
paint and moves it by about 10 ms; the packaging mechanism was assumed harmless and costs 13 s. A settle
signal was chosen for being "real rather than a proxy" and turned out to be absent exactly where the
phase changes nothing visible. In each case the record's error was measuring a proxy, and in each case
the correction is in the record beside the argument it replaced.

---

## 6. What this record does not settle

**Every escalation raised before this pass is ruled, and that is a change of kind.** ESC-1 to ESC-18 all
carry a decision in [`owner-decisions.md`](owner-decisions.md), alongside nine structural rulings SR-1 to
SR-9, and the specification amendment pass those rulings authorised **has landed**. What remains open is
no longer "the owner has not decided" but "the record and the specification do not yet describe the same
product", plus what the rulings themselves opened.

### What the rulings broke, and who owns each — ESC-19 to ESC-25, all new with this pass

**None of these is a decision anyone deferred.** Each is a cost of a ruling or a consequence of a
measurement, and two of them are requirements a ruling minted that are not in the specification, which is
the sharpest kind of item this record can hold: a reader of `owner-decisions.md` alone would believe they
were closed.

- **ESC-19 — SR-9(b) is not in the specification, and ADR-0058 cannot state it from the architecture side.** A
  machine-local store means a user's session history, permission audit, improvement library and artifact
  bodies are not in the backup they take of their project. SR-9(b) minted a requirement disclosing that;
  no such requirement exists in any of the twenty-one domains. The failure mode is a user who backs up
  their workspace, restores it, and finds their history was never in it. SR-9(b) explicitly does **not**
  foreclose the structural answer — a configurable store location, or an explicit backup action covering
  the whole store — and if that is taken, ADR-0058's alternative N returns and the store's location
  becomes a user setting with its own failure modes. **Escalated.**
- **ESC-20 — SR-9(a) is not in the specification either.** Improvement artifacts and delivery records were ruled
  into the export list on SR-6's own reasoning; domain 14 contains no export requirement at all, and no
  export requirement for delivery records exists in domain 08 or 15. Meanwhile `REQ-TOOLS-190` excludes
  the verification-gate record by a positive sentence that the identical argument reaches. Either that
  sentence is the boundary or the list is short again — an owner's answer, not an architect's.
  **Escalated.**
- **ESC-21 — `REQ-GIT-128`'s cross-machine guarantee is unreliable in exactly the storage the product now
  detects.** The integration lock stays a file so "a second machine reaching the same checkout must meet
  the same lock". Exclusive create is a real primitive on a true network filesystem; inside a
  file-synchronisation client's tree it is not — such clients replicate after the fact, so two machines
  can each successfully create the file and the conflict is reconciled afterwards, by which time both
  integrations have started and both are merging into one base branch. `REQ-STARTUP-166` is the only
  mechanism in the product that distinguishes storage another machine reaches directly from storage an
  agent replicates, and it drives only a warning about the user's own files. Under ESC-15 the session lock
  got safer and the integration lock got **lonelier**. A silent double promotion into one base branch is
  the worst outcome anywhere in this record. **Escalated.**
- **ESC-22 — the aggregate terminal-frame rate is bounded by no requirement.** ADR-0021's coalescing cap now keeps
  `REQ-MONITOR-222` inside its budget, and the rate it licenses is stream count × 50 frames/s where the
  stream count is a user-writable key with no stated maximum. Three remedies, none of them architecture's
  alone: state a maximum on the key (a specification change); impose an aggregate rate budget across
  streams; or adopt the direct message port, measured holding transcript p95 at 1.119 ms under 12,000
  frames/s. **Escalated.**
- **ESC-23 — `REQ-CONFIG-423` loses its antecedent under ESC-1.** The ruling requires the composer's permission-mode
  control to write only its own key and requires the decision not to break `REQ-CONFIG-423` — which fixes
  that a change made "by another surface that writes through the shared save path" lands in the pending
  settings state. Read literally, option 2 does break it: a composer change now lands in the file and not
  in the pending state, leaving an open Settings screen showing a value the file no longer holds. Two
  candidate rules exist and neither is stated. **Escalated.**
- **ESC-24 — a launch arriving during the force-exit allowance is unowned.** `REQ-STARTUP-161` releases the
  single-instance record "when the instance's process ends", and during `REQ-MONITOR-131`'s 30 s allowance
  the exiting instance still holds it. `REQ-STARTUP-162` then requires the hand-over to surface a window —
  and where none is open, to **build** one — while writing nothing and reporting nothing. Building a
  window in a process about to force-exit is wrong; silently doing nothing is also forbidden. SR-1 created
  the case. **Escalated.**
- **ESC-25 — ESC-8's manifest signature has no stated placement, and rotation is a release commitment.** `REQ-STARTUP-152` and `REQ-STARTUP-035` forbid
  any published filename outside the one naming scheme and allow exactly one release-body row per asset
  except the manifest, so a **detached** signature file is not available: the signature must live inside
  the manifest, in a form the standard checking tool still tolerates, or in the release body's manifest
  row. And because a client can only verify with the key it shipped with, **rotation is a release problem
  rather than a runtime one** — the mitigation is dual signatures across a window long enough to cover
  versions in the field, which is an operational commitment the owner should see stated. **Escalated.**

### The specification defects this pass found

Each is reported, not fixed. They are pointer defects and reading questions rather than behavioural
disagreements, but two of them would mislead an implementer working from the requirement alone.

`REQ-SESSION-069` specifies an exact log line for a condition `REQ-SESSION-067` has made unreachable, and
the wrong repair — manufacturing a coalescing case to keep the message alive — would violate that same
requirement. `REQ-EVENTS-029` still cross-references "the debounced state snapshot [which] may lag by its
whole window (`REQ-SESSION-071`)", and its conclusion is now false because every requested save is
durable. `REQ-TOOLS-082` and `REQ-TOOLS-080` still describe the audit as a **file** read top-to-bottom and
still say a decision outside every registered session "leaves no audit file behind", while
`REQ-TOOLS-078` in the same document now fixes no location at all. `REQ-EVENTS-081` still names a run
"driven by a programmatic embedding of the engine" while `REQ-EVENTS-178` says there is no embedding
surface. `REQ-SANDBOX-101` still says only presence is tested **and** asserts its condition is exactly
`REQ-TOOLS-053`'s, which is now a capability test — a reconciling reading exists but is a reading.
`REQ-CONFIG-288` still states, in the present tense, the coupling ESC-1 ruled against.
`REQ-UIBENCH-059`'s `unchanged_state` is described as "identical to the state already displayed" and is
measurably not, after 1,000 tail replacements. `REQ-CHAT-055`'s "appending a row MUST cost no more than it
does on an empty transcript" is met on the to-paint reading (13.9 ms at 0 and at 10,000 rows) and not on
the strict synchronous one (1.4 ms against 2.7 ms), and the residue is **forced** by
`REQ-UIBENCH-055`/`-057`/`-058` handing the view the entire transcript on every update.
`REQ-UIBENCH-119` makes `settle_timed_out` informational while `REQ-UIBENCH-087`'s tripwire reads its
memory figure unconditionally, so the two compose into an invariant that reports a pass on a number known
to be meaningless. `REQ-UIBENCH-118` is simultaneously "the only absolute threshold" and informational.
`REQ-STARTUP-165`(c) requires an unusable preparation to be redone and to report nothing at all, and
states no outcome for a preparation that cannot be made **at all** — an unwritable or full per-user root
degenerates into re-preparing on every launch, silently, at the cost the exemption was written to permit
once.

### The open questions

**Forty-two specification questions are open**, and four are closed with their reasons — OQ-3, OQ-11,
OQ-26, OQ-27. **OQ-11's closure text was wrong and has been rewritten rather than deleted**: it is closed
because `REQ-LIBRARY-043`'s ladder went with its document layout, not because neither ladder has a file
left to govern. **OQ-44's statement of fact was false and has been corrected**: the corpus does state one
Windows ladder and it is in the wrong domain to be borrowed. Two are new with this pass — **OQ-47** (two
concurrently open workspaces presenting one identifier, which ADR-0058 decides in `REQ-SESSION-089`'s own
vocabulary and which should be ratified rather than left as architecture-invented behaviour) and
**OQ-48** (reclaiming a machine-local store whose workspace no longer exists, which ADR-0058 decides as
user-initiated-only and whose surface does not exist).

**No ADR is blocked from ratification by an open question any more.** ADR-0045 was the last one, and
ESC-13 unblocked it. Several ADRs remain unratifiable for a different reason, which is the gate question
in the next paragraph.

Two decisions — the theme palettes and the Markdown dialect — wait on the approved visual design
reference. Every mechanism above is independent of it; no screen can be built without it.

### The measurements

**Twenty-one numbered spikes, one withdrawn, two discharged and one discharged for Windows only —
seventeen outstanding.** Numbers are stable and never reused; a withdrawn spike keeps its number as a
tombstone.

Four reports exist, all in [`spikes/`](spikes/):

| Report | Spike | What it settled | What it did not |
|---|---|---|---|
| `ipc-hop-latency.md` | 10 | ADR-0002's Revisit-if and both of ADR-0044's; `REQ-MONITOR-222`, `REQ-MONITOR-223` and `REQ-ORCH-155` at p95; that a channel name is not a transport | the commit on the publish path, fan-out to several windows, concurrent runs, the reconcile path, a real renderer |
| `packaged-first-paint.md` | 17 | that the `onefile` portable fails `REQ-STARTUP-155` at every weight including zero; that bundle weight is close to free on the flavours that pass. **It triggered SR-7** | macOS `.dmg` and Linux AppImage — neither was built, and `REQ-STARTUP-155` binds both |
| `renderer-invariance-and-benchmark-cadence.md` | 1 | both counting rules against a running window; the memory tripwire; that the reachable viewport is not knowable at construction; that ADR-0053's paint settle does not work | equivalence of a rAF settle to a paint settle where both resolve; the real component rather than a mock shell |
| `windows-writer-handle-compaction.md` | **9 — withdrawn** | historically: that the deleted rule 3 was right, and **three corrections that outlive its subject** (share-delete, directory `fsync`, and what actually blocks a replace) | whether a replace survives a power cut, on any platform |

**Two spikes are new and one has a new question.**

- **Spike 20 — the prepared portable, required by SR-7 before the gate.** The cached-launch figure, the
  cost of the version check on the fast path, and cache invalidation across an update. The 0.7 s
  file-copy baseline says the target is reachable and is **not** a result. ADR-0054's and ADR-0055's
  *Revisit if* clauses both turn on it, and `REQ-STARTUP-156` now requires two runs of a self-preparing
  artifact to be observed at the release gate, so this is a release obligation as well as an architecture
  one.
- **Spike 21 — the commit on the publish path**, which nothing has measured and on which the whole
  persist-before-publish design now rests. `ipc-hop-latency.md` states in terms that it excludes it, so
  every transport figure is a lower bound. Needed: commit cost at the weaker durability setting for one
  transcript row and for one whole-session update, at `REQ-MONITOR-219`'s tick rate with a second writer
  process contending, plus the `fsync` cost of a terminal-status save on each platform's per-user data
  volume. The **save-request rate** is an input nobody has counted, and with the debounce gone it is set
  by the run loop's call sites and by nothing this record controls.
- **Spike 19's question changed with ESC-15** and it is still owed. It no longer asks whether a synced
  workspace is usable — `REQ-SESSION-198` requires that it is. It asks whether anything **else** the
  product writes into `.rotaris/` misbehaves on synchronised storage, and the sharp part is
  `REQ-GIT-128`'s integration lock: exclusive-create semantics in a synchronisation client's tree is a
  safety property, not a convenience.

The remaining outstanding spikes are unchanged in subject: 2 (Windows access-control read-back), 3
(tool-server negotiation over our own transport, on which ESC-12 partly turns), 4 (console suppression),
5 (the reserved-token branch), 6 (the Responses dialect), 7 (the board projection crossing), 8 (store
query latency against **declared** indexes — now additionally owing store open, write-ahead-log recovery
after an unclean shutdown and an integrity check on the startup path, and long-path behaviour for the
per-user-dir + identifier + session-id + artifact-body-name layout), 11 (parse-cache behaviour), 12 (the
Linux image's runtime, on which ESC-11 turns), 13 (forced synchronous commits at recycler-pool scale, now
partly answered from the other side by the yielding-driver finding), 14 (the presenter liveness lapse
window, **against a main process actually showing the modal dialog**, which the IPC spike did not do), 15
(echo latency), 16 (the single-instance probe and reclaim, whose failure mode is a product that will not
start), 17's two remaining platforms, and 18 (cross-process write contention on the one store).

**One measurement is owed and is deliberately not numbered:** a power-loss test for OQ-12. The
writer-handle spike established that a directory `fsync` on a write-opened handle returns success and
explicitly declined to claim the guarantee. Nothing in the corpus asks for it, so it does not block the
gate — but nothing establishes whether a replace survives a power cut on any supported platform, and
OQ-12 cannot be closed without it.

All of it is in [`open-questions.md`](open-questions.md).

---

## 7. Index of decisions

Numbered in dependency order: the earliest numbers carry the decisions everything else rests on. **Two
rows break that rule and both say so.** ADR-0057 was found missing after the others were numbered, and
ADR-0045, ADR-0046 and ADR-0056 all depend on it. ADR-0058 was added under SR-4 and is numbered after
everything it constrains — ADR-0003, ADR-0004 and ADR-0005 all now depend on it.

**One filename no longer matches its title, deliberately.**
`adr/0003-files-are-the-system-of-record.md` now holds an ADR titled *Where state lives: the line between
a file and a row*. The filename was left alone because the number and path are referenced from this index
and from an unknown number of the other records; renaming it is a repository-wide change and belongs to
whoever next sweeps the index, not to the pass that reversed the decision. The same is now true of
`adr/0058-the-workspace-database.md`, whose title no longer says "database", and of
`adr/0024-evidence-and-audit-files.md`, whose subject is no longer files.

| # | Decision | Evidence |
|---|---|---|
| 0001 | Implementation language and runtime baseline | |
| 0002 | Process topology *(topology **confirmed** by measurement; one correction owed — see OQ-47)* | ipc-hop-latency |
| 0003 | Where state lives: the line between a file and a row *(reverses in part; depends on 0058)* | |
| 0004 | One document primitive, two write shapes, and a guarded read side | windows-writer-handle-compaction |
| 0005 | The session lock as the single capability token, **and the one lock that is not a row** | |
| 0006 | Two clock ports and a budget primitive; no bare timers | |
| 0007 | Secret redaction: one module, two output forms | |
| 0008 | One ordered session writer per session, owning that session's transactions | |
| 0009 | The event history as a table, with the line-delimited form as an export *(disagrees with 0004 on one transaction boundary — stated in both)* | windows-writer-handle-compaction |
| 0010 | Three channels between the run host and its surfaces | ipc-hop-latency |
| 0011 | Following a session this process does not own *(**withdrawn in place** under SR-1 and SR-2)* | |
| 0012 | The delegated-child scheduler: a persisted ledger, not a promise graph | |
| 0013 | The run registry: addressing by session id | |
| 0014 | Cancellation, teardown and the quit choreography | |
| 0015 | Lifecycle hook invocation *(cross-slice tension recorded)* | |
| 0016 | The tool registry and its direction-aware accessor | |
| 0017 | The permission policy as an immutable compiled value | |
| 0018 | A purpose-built shell scanner | |
| 0019 | Approvals: wait registry with the gate; the presenter is a revocable capability *(slice conflict OQ-4 remains; the **requirement** conflict is dissolved by the amended `REQ-TOOLS-053`)* | |
| 0020 | Terminal execution *(escalation ruled — ESC-5)* | |
| 0021 | The terminal screen model and stream fan-out *(**load-bearing for `REQ-MONITOR-222`**; conflict recorded)* | ipc-hop-latency |
| 0022 | OS-level confinement *(escalation ruled — ESC-6, provisionally revisited)* | |
| 0023 | Network egress and the `fetch` tool | |
| 0024 | Evidence and audit as append-only tables behind one writer, and what the audit's export must prove | |
| 0025 | Custom tool plugins *(escalation ruled — ESC-7)* | |
| 0026 | The internal model boundary: two ports | |
| 0027 | The AI SDK behind `ModelClient`, scoped tightly | |
| 0028 | Providers as frozen data plus capability registries | |
| 0029 | Credentials stay individual protected files | |
| 0030 | Sign-in flows and credential leasing | |
| 0031 | Money as an exact-decimal type | |
| 0032 | Discovery, snapshot and effective configuration | |
| 0033 | The tool-server client: the official SDK's protocol layer, our own stdio transport *(escalation ruled — ESC-12)* | |
| 0034 | Tool-server connections and configuration resolution | |
| 0035 | The bundled code-intelligence runtime | |
| 0036 | Configuration stays YAML files, loaded over a tri-state model | |
| 0037 | When a configuration change takes effect *(**ESC-1 ruled**; `REQ-CONFIG-288` unamended and `REQ-CONFIG-423` escalated)* | |
| 0038 | Version control by spawning the executable | |
| 0039 | Checkpoints as ordinary commits through a private Git **file** index; the checkpoint list is a table | |
| 0040 | The traceability engine: a streaming library over files, with a single I/O owner | |
| 0041 | The delivery store: per-requirement rows behind a capability-split handle | |
| 0042 | The desktop preference store: a closed typed registry over an explicitly rooted per-user **file** | |
| 0043 | Authoritative interface state and the replica | |
| 0044 | The IPC contract *(**corrected by measurement**: a channel name is not a transport)* | ipc-hop-latency |
| 0045 | What paints the transcript *(**unblocked** — ESC-13 ruled; both readings measured)* | renderer-invariance |
| 0046 | The transcript apply pipeline | |
| 0047 | The terminal grid surface | |
| 0048 | Windows, views and the three modality levels | |
| 0049 | Notices and acknowledgements | |
| 0050 | Theming and the accessibility floors | |
| 0051 | Markdown rendering and the bounded render cache | |
| 0052 | One passive instrumentation registry *(two new counters and one clock correction)* | ipc-hop-latency |
| 0053 | The benchmark harness *(**settle mechanism replaced** by measurement; phase driver decided)* | renderer-invariance |
| 0054 | Packaging, artifacts and self-update *(**reopened and re-decided** under SR-7; ESC-8 and ESC-11 ruled)* | packaged-first-paint |
| 0055 | Startup sequencing, the instance claim, and the first-paint budget *(gains phase −1)* | packaged-first-paint |
| 0056 | The build toolchain *(gains a fifth output: the portable's launcher stub)* | packaged-first-paint |
| 0057 | The renderer framework and the renderer state store *(numbered out of dependency order — see above)* | |
| 0058 | The workspace store: **machine-local, found by a workspace identifier** *(numbered after everything it constrains — see above)* | |

The five slice proposals these were consolidated from are retained in [`proposals/`](proposals/). Where a
proposal argued a case that the consolidated decision reverses or qualifies, the argument is preserved in
the ADR rather than replaced by the conclusion. The same rule now applies to the measurements: where a
spike overturned a claim, the claim is preserved beside what replaced it, so a reader can see that the
record changed its mind and why.
