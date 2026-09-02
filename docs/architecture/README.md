# Rotaris-crw — system architecture

- **Status:** proposed. The Architecture Gate has not been held and implementation is not authorised.
- **Behavioural target:** `ROTARIS-CRW-001` (see [`../clean-room/reference-record.md`](../clean-room/reference-record.md))
- **Evidence base:** [`constraints.md`](constraints.md) — what the specification forces, with requirement identifiers — read together with [`../spec/resolutions/`](../spec/resolutions/), the twenty-one records disposing of every open question each domain draft raised. A resolution sometimes narrows what a requirement appears to license; `constraints.md` says where and why.
- **Measurements:** [`spikes/`](spikes/) — **eight reports covering seven live spikes and one withdrawn one**, four dated 2026-09-01 and four dated 2026-09-02, and **the only real evidence this record has**. Several of them overturn something it asserted, and the second four overturned more than the first four did: **the measurement round disproved three platform facts this record had asserted and one ADR's own stated gate trigger fired.** They are named inline wherever a claim rests on one, and the ADRs that depend on them carry an `Evidence:` header field. **Where a measurement disproved a *reason* but not a *conclusion*, both records say so in as many words** — the conclusion, that the original reason was tested and found false, and the reason that actually holds. That sentence is what stops a later reader "simplifying" the decision back into the defect.
- **Decisions:** [`adr/`](adr/) — 58 records, numbered in dependency order. **Every requirement identifier cited anywhere in `adr/` — 1,213 of them, drawn from a corpus of 4,394 — resolves to a requirement the specification defines. Zero dangling citations.** Re-checked mechanically on 2026-09-02, after the measurement round edited seven records and the specification minted `REQ-EVENTS-179`; what it does *not* establish is that every citation still says what the ADR claims it says, which is a different sweep and is reported in section 6.
- **Unresolved:** [`open-questions.md`](open-questions.md) — **thirty-one escalations: twenty-two ruled, two closed by the specification itself, seven open**; forty-seven specification questions (**six** closed with their reasons, **forty-one** open); two design-reference dependencies; twenty-two numbered spikes of which one is withdrawn, **seven discharged** and one discharged for Windows only — **thirteen outstanding**
- **Ruled on:** [`owner-decisions.md`](owner-decisions.md) — ESC-1 to ESC-21 and ESC-26, and nine structural rulings, SR-1 to SR-9. ESC-19, ESC-20 and ESC-21 were ruled on 2026-09-01 by **comparison with seven other coding harnesses** rather than from first principles — that comparison, with its sources, is in `owner-decisions.md` and is evidence, not illustration. **ESC-26 was ruled on 2026-09-01 and has landed in the specification**: `REQ-SESSION-197` gains one narrow exception, bound by five conditions, available only inside `REQ-SESSION-201`'s restore. ESC-23 and ESC-25 needed no ruling in the end: the amendment answered both, and answered ESC-25 *against* what this record had argued. **Seven escalations are open**: ESC-22, ESC-24, and ESC-27 to ESC-31, which the defect-correction round raised and which nobody has ruled. Read SR-4's own correction block before citing SR-4: an earlier version of that ruling claimed the store dissolves OQ-41 and it does not (ESC-14) — **cite the corrected form, never the withdrawn one**. Two rulings now carry a *reason* a measurement has since disproved, and both are flagged in section 6: **ESC-15**'s stated mechanism and **SR-7**'s statement of how the artifact is identified.

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

**The claim is ours, and that changed on measurement rather than on preference.** ADR-0055 chose the
platform's own single-instance primitive and attached a verification obligation to it with a stated rule:
if any of three observations failed, the primitive is dropped rather than wrapped. **It failed, and the
rule fired** (`spikes/presenter-liveness-and-instance-claim.md` §5.3). Against a primary that was running
but not pumping messages, `app.requestSingleInstanceLock()` blocked **20,004.6 / 20,010.9 ms** against
`REQ-STARTUP-164`'s 5-second interval, returned false, performed **no reclaim and no retry**, and the
hand-over never reached the primary — not even in the 25 seconds after it recovered. The launch ended with
**no window on screen**, which is the one outcome `REQ-STARTUP-164` closes by saying every path ends with
one. It cannot be rescued by wrapping: the call is synchronous on the launching process's own main thread
and takes no timeout. So the claim is **our own record file on every platform** — in `REQ-STARTUP-145`'s
per-user data directory, carrying `pid`, `host` and `acquired_at` under `REQ-SESSION-046`'s own three names
and types plus a hand-over endpoint address, taken by atomic exclusive create, and probed by the session
lock's own liveness predicate with `REQ-SESSION-051` to `REQ-SESSION-054` inherited whole.

**The `against` clause that had chosen the primitive is what the measurement destroyed, and the record says
so.** ADR-0055 rejected its own record file because it "duplicates something the platform layer already
ships", and preferred the primitive because "the stale-record probe and reclaim are the platform's, written
against each platform's own process semantics". **There was nothing to duplicate.** The primitive performed
no reclaim, made no second claim attempt and imposed no bounded wait. The choice was never between writing
the discipline and inheriting it; it was between writing it and not having it. Everything the primitive was
*validly* chosen for was confirmed and is carried forward as a measured obligation on the replacement:
sub-5 ms claim, release within ~70 ms of a force-kill with first-attempt reclaim at +187 ms, a probe with no
observable effect across 69 probes, and declared-field delivery — because `argv` really was mangled.
**The record file is not itself the exclusion**, and that is the single thing here most important not to
simplify away: under the primitive the file survived `taskkill /F` and did not prevent the next launch, and
under an exclusive create existence alone would strand every later launch for ever. What makes it an
exclusion is that it carries a pid and a host and the launch probes them — `REQ-STARTUP-161`'s own clause
handing a record that outlives its process to `REQ-STARTUP-164`.

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

**Two keys, and they are keys to two different objects.** A previous pass wrote here that keying the
service by path was "in tension with" keying identity by identifier, and owed a correction. **That
framing was wrong and is withdrawn.** The specification fixes both keys separately and in terms. The
**open workspace** is a resolved directory: `REQ-STARTUP-041`(a) expands and resolves it and persists it
as the remembered workspace, `REQ-STARTUP-163` decides window reuse by whether "a main window of that
instance already has that directory open", `REQ-STARTUP-047` and `REQ-STARTUP-048` switch by folder, and
`REQ-STARTUP-166` classifies "the storage the workspace directory sits on". The **durable store** is
keyed by the identifier: `REQ-SESSION-001` reaches a record by one workspace plus one session id,
`REQ-SESSION-197` requires the store "located by that identifier and never by the workspace's path", and
`REQ-SESSION-198` and `REQ-LIBRARY-042` follow. `REQ-SESSION-001` composes both in one sentence, so the
specification did not choose between them — it gave each object its own key.

**Both collapses are wrong rather than merely different, which is what makes this stable.** Keying the
service by identifier would give one service two roots, and every job it does is directory-scoped:
configuration against one `.rotaris/`, Git in one checkout, worktrees under one root, `REQ-TRACE-073`'s
scan over one repository, the delivery store against one set of requirement documents. Keying the store
by path is the field's filed defect — ESC-19's survey records three comparable products doing it, one bug
report of 63 sessions lost across 10 projects after a reorganisation, and even a change of a folder
name's case orphaning everything. **This record solved the field's most-complained-of storage defect
before shipping, and that is a decision to protect against a later simplification rather than to
revisit.**

**One thing genuinely was unsettled and it is not the one that note named.** Neither requirement fixes
what makes two directory strings the same directory — symlinks, junctions, filesystem case, UNC against
mapped-drive spellings — and `REQ-STARTUP-163`'s window reuse turns on it. ADR-0002 decides it because it
needed a key (constraint W-25) and files it as **OQ-49**. **OQ-47**'s first two paragraphs — the
concurrent two-copies-one-identifier behaviour, and the absence of any product remedy for a copied folder
or a corrupt identifier file — stay open and are untouched.

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

**The commit is now measured, and the margin survives at two thirds of its old size.**
`spikes/commit-on-the-publish-path.md` closed the one link every transport figure in this record was a
lower bound on. Commit **then** publish, end to end over the relay: **p95 1.774 ms at zero rows and
1.723 ms at 10,000**, against `REQ-MONITOR-222`'s 250 ms — so the margin the record had been quoting falls
from ~221× to **~141×** and holds. `REQ-MONITOR-223`'s ratio is **0.971** against a ceiling of 2; a 10,000-row
session was consistently a shade *faster* than an empty one, because the insert goes into a primary key
whose depth barely moves. Zero of 20,000 publications exceeded 250 ms. The commit alone is **0.28 %** of
the budget at p95 and the whole interval **0.71 %**. `REQ-MONITOR-221`'s own argument — that
persist-before-publish is satisfiable alongside `REQ-MONITOR-218` "because persistence carries no delay of
its own" — is upheld at a measured price of **0.396 ms p50 / 0.700 ms p95**: it is work, not a wait.

**What the commit changed is the shape of the distribution, not the percentile, and the shape is what a
threshold will trip over.** The write-ahead log's automatic checkpoint fires **every 135–136 commits** —
arithmetic, not chance: the publish-path transaction writes **7.44 log frames** against a default
checkpoint threshold of 1,000 — and costs **9–11 ms at p50, worst observed 53 ms**, while the other 99.27 %
of commits cost 179–220 µs. Nothing about that threatens 250 ms. It does mean **any diagnostic or
conformance threshold built on "an update takes about a millisecond" will see routine fifty-fold
excursions on a fixed period and must not treat them as faults** — and it makes the checkpoint period a
**design input**: widening the publish-path transaction, by a second index or a wider update, shortens the
period proportionally. Turning the autocheckpoint off was measured and is worse in every direction (31 %
slower p50, 87 % slower p95, a 91 MB log in 3,000 commits, one 155 ms stall).

**One floor the requirements forbid can still be manufactured from outside this record, and one rule is
what prevents it.** `REQ-MONITOR-218` says no delay floor **of any size**. A second process holding a write
transaction turns the commit into a wait of exactly that transaction's length: **205.4 ms measured for a
200 ms hold** — 82 % of `REQ-MONITOR-222`'s entire budget in one commit, before the transport has done
anything — and held back to back the writer starved indefinitely, 3,000 commits not completing in 300 s. A
*compliant* heavy reader costs 163.6 → 345.9 µs p50 and 271.7 → 898.9 µs p95 with zero errors and zero
lock contention. So ADR-0058's prohibition on long write transactions is **load-bearing rather than
hygiene**, and it is the thing that keeps `REQ-MONITOR-218` true.

**One bound remains, and it is the one this record keeps being surprised by.** The harness's renderer was
empty — no framework, no state store, no Markdown renderer, no real recycler, one window, one session,
development mode — and the commit harness ran against three tables with two primary keys and one listing
index, no migrations, no checkpoint index, no delivery store, no traceability tables. **Every additional
index on the transcript table adds log frames per insert and therefore moves both the commit cost and the
checkpoint period.** A reader who takes 1.774 ms as the product's number will be surprised.

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

**Why, and it is not performance — and the reason this record gave for two passes was tested and is
false.** The record said: write-ahead logging is unsupported on network filesystems, so a store inside a
workspace on a share opens **read-only**; acquiring a session lock is a write (`REQ-SESSION-046`); so
`REQ-SESSION-089` refuses the run and no session in that workspace can start at all.
`spikes/remote-and-synchronised-storage.md` measured that chain link by link. **Link 1 is false as
stated**: write-ahead logging enabled and worked over a UNC path in 320 process-trials — 0 open failures,
0 write errors, 0 rows lost, integrity check clean throughout, the shared-memory companion created at its
expected size — while failing 30 times out of 30 on a **mapped drive letter to the same share**. The
behaviour depends on the *path spelling*, which no version of this record considered. **Link 2 was never
observed at all**: the store reported itself writable in every network configuration measured, and the
state the record was describing does not exist — the genuine no-shared-memory condition opens
**read-write** and then fails **reads as well as writes**, which is larger than read-only, not smaller.

**The conclusion is unchanged and now rests on three measured failures, every one of them worse than the
one it used to rest on.** (1) Where one store file is reached through **two path spellings**, two writers
each reported full success while up to **95 % of committed rows vanished** — 20 of 20 trials wrong, final
counts as low as 32 against an expected 600, **integrity check clean on every one**. (2) A store can
report the log enabled, read the setting back as enabled, own its shared-memory companion at the right
size, report itself writable — and throw on the next statement, every time. (3) A synchronisation client
writing a replica back destroyed the store outright in 4 of 4 variants, unopenable, **while the writing
process reported zero errors across 43,120–58,273 commits**; overwriting only the log file was enough.
**A loud outage would have been the good version.** ESC-15's ruling is supported on stronger evidence than
the reasoning it was issued on — but `owner-decisions.md` still carries the disproved chain in ESC-15's own
text, so **cite ADR-0058's per-link verdict table rather than the ruling's mechanism** (section 6).

`REQ-SESSION-198` requires the opposite outcome in terms: a workspace on a network share or in a
synchronising folder **MUST be fully usable**, and it is, because the store is not there. The old
decision is preserved in ADR-0058 as alternative J with its whole case intact — self-contained
workspace, no indirection, nothing to reclaim — and consequence 3 is marked **withdrawn and not to be
cited**.

**One same-machine hazard follows from the same measurement and it is a correctness rule, not a
performance one.** The two-spellings failure needs no network at all: two processes reaching one store by
two different spellings of one path silently destroy each other's writes, and nothing detects it, because
there is no error and the integrity check passes on a store that is merely short. The architecture already
prevents it — the workspace service is the only process that resolves an identifier and it hands the
**resolved store path** to the run host (constraint W-18) — but it prevented it by accident until this
pass. **ADR-0058 now states it as intent and constraint W-27 carries it**: one store, one canonical path
spelling, resolved once and handed on, and no other process derives a store path.

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
replace it. **That remedy is still the user's, and it is now the only one that is.**

**The absolute rule has exactly one exception, and it is worth reading before assuming either too much or
too little of it.** This section previously said `REQ-SESSION-197` forbids re-minting over a readable
identifier "absolutely, with no user-confirmed exception". **That sentence is withdrawn.** ESC-26 was
ruled on 2026-09-01 and the amendment has landed: **the restore of `REQ-SESSION-201` MAY establish this
workspace's identifier as the artifact's, and no other action ever may.** Five conditions bind it and it
is unavailable unless every one holds — it exists **only** inside the restore action, and the requirement
names the paths that do *not* gain it (opening or preparing a workspace, `REQ-SESSION-060`'s explicit
repair, a migration, an update, a later convenience); it requires **explicit confirmation naming both
identifiers** and stating that this workspace's own sessions become unreachable from it, never automatic,
never the default or pre-selected, with report-and-do-nothing kept as a correct outcome; the
**absent**-identifier case is unchanged and explicitly *not* this exception, being a create that replaces
nothing and orphans nothing; a present-but-**unreadable** identifier is still reported and never
overwritten, by this action as by every other; and the **displaced store is moved aside and kept**, never
deleted, with the confirmation saying where it went. ADR-0058 additionally makes outcome 3 reversible by
hand and says so in the confirmation — the store recorded under the workspace's existing identifier is
left untouched and merely unreferenced, so restoring the old value to the identifier file is a complete
undo.

**The exception does not reach the copied-folder case and must not be widened to it.** A user who copies a
workspace folder and wants the copy to have an identity of its own still has no product action, and that
half of **OQ-47** stays open. The requirement states why the exception is drawn this narrowly: the rule
protects against a folder moved, renamed, copied or merely spelled differently, which is constant, while
the recovery arises once in a workspace's life if it arises at all — so relaxing it generally would trade a
constant protection for a rare recovery. **An implementation that finds this exception useful anywhere
else has drawn the wrong lesson from it.**

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

### The cost of that location is now owned, by two requirements and one action

**This reverses what a previous pass wrote here, and the reversal is the largest single change in this
record since the store moved.** That pass said a user's session history, permission audit, improvement
library and artifact bodies live outside anything they back up when they back up their project "**and the
specification does not tell them**", that SR-9(b)'s requirement was "**not in the specification**", and
that this was a gate item. **All three sentences are withdrawn and must not be cited.** ESC-19 ruled the
disclosure *and* half of the structural option, and both have landed.

**`REQ-SESSION-200` is the disclosure**, and it is more than a warning. It names what sits outside a
workspace backup — every session record the store holds, the workspace-scoped improvement library, and
`REQ-SESSION-002`'s per-session files. It requires what *is* carried to be named alongside it, "because
the statement is otherwise alarming rather than informative": the repository, the requirement documents,
the configuration, personas and model slots travel exactly as the user left them; the identifier travels
with the workspace, so a workspace moved, renamed or restored on this machine finds its own sessions
again; and checkpoints are objects in the user's own repository. It requires both remedies named, "since
naming a gap without naming its fix is not a disclosure". And it must be reachable in the ordinary course
of managing sessions and **must not be delivered only inside a failure message** — "a user who has
already restored a workspace and found no history in it has been told too late, which is the precise
failure this requirement exists to prevent."

**`REQ-SESSION-201` is the remedy**: one user-initiated action producing one artifact holding the whole
store plus its per-session files and nothing outside it, to a destination the user chooses, **valid while
runs are live** — it may not require a session to be stopped, may not pause, delay, throttle or disturb a
run, and may not be refused because a session is live — producing "a state of the store that a reader
could have observed at one moment"; and a second action that restores it, explicitly, never
automatically, never as a repair, never silently merging, refused while any session in the target is
live, and leaving the store exactly as it was where it fails. The artifact carries the workspace
identifier so it cannot be poured into the wrong workspace by accident. `REQ-SESSION-182` places both
actions, and the disclosure, on the surface where a workspace's sessions are managed.

**It is not an export and the specification insists on that in both directions.** An export is a record
rendered so software knowing nothing about this product can read it; a backup is the store rendered so
this product can put it back. Neither may be collapsed into the other, the backup may not be offered as a
way to read a record, and no export may be offered as a way to restore one. Nor is either a channel.

**One of the two things this used to not fix is fixed, one is half measured, and the split matters at the
gate.** This paragraph said the mechanism "has not been measured in any part" and that the recovery path
"ends in a manual file edit". **The second sentence is withdrawn — ESC-26 is ruled and landed** (above).
The first is now **half true and no longer a guess in either half**. The *backup* half is measured:
`spikes/remote-and-synchronised-storage.md` §7 established that a naive file copy of a live store is
unopenable **625 times in 627** (150/152 under write-ahead logging, **475/475** under a rollback journal —
the rollback case is worse, not better), while the engine-level snapshot ADR-0058 chose produced **8 valid
snapshots out of 8** during 108,525 concurrent commits, integrity-clean, checksum-clean and monotonic, at a
median **1,077 ms per 41 MB**. That is the mechanism `REQ-SESSION-201`'s "valid while runs are live" needs
and it now has a number. **It also records the trap**: the gentle version of that experiment — a realistic
20 commits per second against a small store — returns **0 bad copies in 40**, so the obvious test gives a
false all-clear and the choice would look arbitrary to anyone who ran it.

**The *restore* half is untouched and is still the single largest unmeasured mechanism in the record
(spike 22).** Two store connections closed across two processes, an archive expanded, a database opened, an
integrity check run, two directory renames landed and both connections re-opened — while the application
keeps running and a window is showing. Nothing has been executed. Two inputs it needs are also still
missing: how far the write-ahead log grows while the snapshot's read transaction pins it on a large store
under a live run (the snapshot's *correctness* is settled; its *log growth* is not, and it is the only
input the mid-copy checkpoint and progress-reporting questions turn on), and the two renames against the
destinations the user may actually choose — removable media, a directory open in another application, and
a real synchronisation client's tree, none of which any spike has written to.

**The configurable store location is refused**, not deferred. ESC-19 split SR-9(b)'s structural option
and found the halves have opposite evidence: no surveyed product offers a relocatable session *data*
store, and the `*_HOME` / `*_CONFIG_DIR` variables that come closest are flagged as a hazard precisely
because they silently relocate stores into synchronised folders — which hands the user ESC-15's total
outage. ADR-0058's alternative N moves from "not foreclosed" to "refused by ruling", and its
corresponding *Revisit if* is retired with the reason preserved.

### The table

| Where | What | Written by | Discipline |
|---|---|---|---|
| per-user **local** data dir → `workspaces/<identifier>/workspace.db` — **one store per workspace, per machine** | session records and listing records, transcript rows and released pages, the event history, the timeline, the issues record, evidence, the permission audit, the verification-gate record, the delegated-child ledger, the checkpoint index, the session **lock rows**, delivery records, the improvement library, saved prompts | **run host** (session-scoped rows, under that session's lock row) and **workspace service** (workspace-scoped rows); no other process opens it | one transaction per unit of work; write-ahead logging read back at open **and then exercised by a write probe**, because the read-back was measured necessary but **not sufficient** — a store can return the setting exactly as applied and throw on the next statement — and a failure at either step is a **fault**, not a degraded mode (`REQ-EVENTS-179`); one canonical path spelling, resolved once (W-27); migrations forward-only, in the workspace service, before the run host is told the workspace is open |
| `workspaces/<identifier>/sessions/<session-id>/` | `summary.md`, `debug.log`, artifact/attachment/image **bodies** — `REQ-SESSION-002`'s closed set of three kinds and nothing else | run host | atomic replace for `summary.md`, with `REQ-SESSION-033`'s ladder; append for the log, which nothing compacts; a revised artifact writes a **new** body and the row is re-pointed, so a body file is never replaced over itself |
| `<workspace>/.rotaris/` | **the workspace identifier**; `REQ-GIT-128`'s `integration.lock`; configuration, secrets, personas, model slots, worktree bindings | workspace service | exclusive create for the identifier and the integration lock, never replaced over themselves; atomic replace for the rest, per-store policy; comments and layout **preserved** — **ESC-2 has landed**: `REQ-CONFIG-252` now states preservation in terms, states it once for all four writers of `agents.yaml`, and records that "the earlier statement that comments and formatting are lost is withdrawn" |
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
- **The list is no longer drawn case by case; the boundary is stated once, as a test.** This bullet used
  to say SR-9(a)'s two exports were "**neither minted**" and that `REQ-TOOLS-190`'s verification-gate
  record was excluded by a positive readership sentence in its own text. **Both halves are withdrawn.**
  `REQ-LIBRARY-176` mints the improvement store's export and `REQ-TRACE-514` the delivery store's, each
  applying `REQ-EVENTS-166`'s guarantee "on the same terms `REQ-SESSION-199` applies it" to the four.
  `REQ-TOOLS-190` **gains** one, and the readership sentence is gone — replaced by the test ESC-20
  supplies, which that requirement now calls "the product's single statement of that test": **a record
  gains an export when it carries no unredacted user or tool content, and does not gain one when it
  does.** It adds, in terms, that "that only this application reads a record is *not* a reason to
  withhold an export and never was — a record only this application can read is exactly the record a user
  needs their own copy of." The permission audit qualifies for a stated property rather than by
  precedent: `REQ-TOOLS-079` gives an entry no argument values at all.
- **The one prohibition is absolute and the record now carries mechanisms rather than a rule.**
  `REQ-SESSION-136`'s tool-call evidence "MUST NEVER gain an export — not under this rule, and not under
  any later widening of it", and a future requirement proposing one "MUST be refused rather than
  reconciled". ADR-0024 makes that structural rather than declarative: write-path field validation,
  structural unreachability of the tool-call table from any exporter, no dereferencing of record
  locators, and four documents rather than one. **The accident to defend against is not someone exporting
  that record** — that is a refusal. It is someone adding an argument field to an **audit** entry for
  debugging, after which the audit's existing, blameless, already-shipped export becomes a disclosure
  surface with no change to any export code. `REQ-TOOLS-079` states that consequence itself; a validation
  that fails loudly is what turns its "would" into something a build notices.
- **The backup carries what the exports may not, and that is disclosed rather than hidden.**
  `REQ-SESSION-201`'s artifact is the store whole, so it necessarily carries the tool-call evidence. The
  requirement says so and obliges the product to convey it where the action is offered. That is not a
  widening — the artifact is not readable material handed to other software — but omitting it would leave
  the next reader to discover it and conclude the prohibition is porous, which is precisely the argument
  for widening one.

### The document primitive: three write shapes, and one ladder

One primitive still performs every atomic replacement for the stores that remain files, and it still has
a guarded read side — a concurrent reader observes an **empty** file roughly once in a few thousand reads
under contention, and a silent empty read of configuration would present as *no configuration* under
`REQ-CONFIG-017`, which is the dangerous case. So it retries on decode failure after a successful stat,
and **no reader holds a descriptor between calls, on any thread**.

It has a **second write shape**: exclusive create — create-or-read, and delete — which carries two of
the product's identity guarantees, which workspace this is (`REQ-SESSION-197`) and who is integrating
(`REQ-GIT-128`). Neither of those files is ever replaced over itself.

**And a third, which this record had mis-filed under the first.** `REQ-PROVIDER-152`'s adjacent lock file
is a **lock-and-hold** shape spanning several primitive calls — acquire, read, modify, write, release,
with a 5-second acquisition budget, a dead holder's lock reclaimed and a live holder's never broken. It
is neither a replace nor an exclusive create, and calling it a replace hid that one of the product's file
disciplines has a lifetime rather than a moment. ADR-0004's file surface is re-derived from the
specification as a table of targets each citing the requirement that fixes it — **nine replace targets,
two exclusive-create targets, one lock file** — replacing a prose count of "eight write sites" that was
unreproducible because the record never said whether it was counting targets, callers or requirements.
Failure policies go from three to four: fatal, best-effort, reported, re-raised.

**One replace target is unlike the other eight and it is the newest.** `REQ-EVENTS-145`'s export
document, and the exports of `REQ-SESSION-189` and `REQ-SESSION-199`, are written to a destination **the
user chooses**. It is the only replace whose destination the product does not pick, which makes the
stage-in-the-target's-own-parent rule load-bearing (same volume, so the rename is a rename) and makes a
foreign handle likelier there than anywhere else in the product. Whether `REQ-SESSION-033`'s ladder
reaches it is genuinely ambiguous in the text — see **OQ-44**, now widened to carry it.

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
- **"A directory `fsync` is unavailable on Windows through the runtime" is false, and a second
  measurement has since qualified how false.** The writer-handle spike found it succeeding on a
  **write-opened** directory handle, 200 of 200 at ~0.1 ms, failing only on a read-only one.
  `spikes/remote-and-synchronised-storage.md` §8 then found it returning `EPERM` on **every** path
  spelling *including local NTFS*. The two are consistent and **the reconciliation is inferred rather
  than measured**: the second harness opened the directory the ordinary way, which is read-only, so the
  available call needs a handle deliberately opened for write. What the pair adds is an operational fact
  the record did not have — **the naive call an implementer would reach for fails everywhere**, so no
  durability step may assume the containing directory is flushed. The decision not to perform one is
  unchanged and its **ground is replaced**: not "the call is unavailable" but "a success return does not
  establish the guarantee, no power-loss test has been run, and no remaining requirement asks for one".
  **OQ-12** carries both halves.
- **The diagnosis behind the deleted rule 3 is confirmed and generalises.** In the naive shape, 0 of 115
  trims completed, the cap was exceeded and growing, **no reader observed any symptom**, and append
  throughput collapsed roughly seventy-fold. An append-and-compact file whose writer holds it open is a
  silent cap-enforcement failure. Nothing in the product may reintroduce that shape, whatever the medium.

### One store per workspace is one corruption domain, and it now has a backup

That is stated rather than assumed, because SR-4 required it stated. Bounded four ways — other workspaces
are separate files; the user's own material is never in it, so requirement documents, baselines,
configuration, credentials and every artifact body survive a destroyed store even though the index does
not; a copy is taken before every migration, with a copy that cannot be written **aborting** the
migration; and, since `REQ-SESSION-201`, the user can take one deliberately, whole, while runs are live.

**The recovery ladder still assumes no backup was taken, and that is deliberate rather than stale.** Its
order: report the store unopenable, carrying the engine's own reason unaltered (`REQ-EVENTS-084`);
**salvage into a fresh store first**; export what salvage recovered; and only then offer to move the
damaged store aside. What changes is one sentence of what the user is told — it can no longer assert that
this machine holds no other copy, because the product now offers a way to have made one. The application
never deletes a store and never repairs one in place, **and that rule now extends to a second operation**:
a restore moves the store it replaces aside under a UTC timestamp and keeps it, because a store a restore
deleted is history that existed nowhere else and the user was mid-recovery when it went (constraint
W-24). The cost is disk, and it lands on a reclamation surface that does not exist (**OQ-48**) — the two
operations a user in trouble reaches for first are the two that leave something behind.

**The swap is not claimed atomic and the record says so rather than implying otherwise.** Both store
connections are closed across two processes, the artifact is expanded into a sibling staging directory
and **opened read-write there** so that log recovery runs and the integrity check tests what will
actually be used, and then two renames land. Two renames are not one on any platform. What is observable
in the gap is an **absent** store directory, which `REQ-SESSION-043` already makes an ordinary state, so
the worst observable is an empty session list rather than a corrupt or half-restored store — which is
what `REQ-SESSION-201`'s "no reader may observe a partly restored store" needs. Three refusal gates run
before any mutation: the artifact opens and passes an integrity check; its schema version is not newer
than this build, refused **here** rather than at the next open, because that is the difference between a
refusal and a workspace that will not open *after* a restore; and no session in the target is live. An
**older** version is explicitly not a refusal.

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
already made. A lapse mid-run must not retroactively downgrade a run's permission mode.

**The liveness poll was measured, it works, and the exposure it protects against is not where this record
had put it.** `spikes/presenter-liveness-and-instance-claim.md` detected all nine blocked runs at +386 to
+468 ms on a 500 ms threshold, with **zero false lapses in 258 s** of unblocked running. Three corrections
follow and each is load-bearing. **(1) The check must be gap-based, not reply-based.** While main was
blocked the channel never closed, the process probed alive, every message was accepted, and when the block
ended **all 84 outstanding replies arrived** — the last at 7,885 ms round trip. A "did the reply for
sequence *N* arrive" check reports success eight seconds late and never fires. **(2) The approval dialog is
not the hazard; every other dialog is.** `REQ-TOOLS-063`'s own modal window costs the poll nothing —
266–267 ms maximum gap, indistinguishable from idle. But while a **synchronous** platform dialog is open,
**no main-process JavaScript runs at all** — 0 timer firings, 0 handled messages from a renderer, 0 replies
to the run host, over 6,489 ms and 7,339 ms. The folder chooser (`REQ-WORKSPACE-009`, `REQ-SHELL-011`,
`-021`, `-163`) and the "quit while a run is active" message box (`REQ-SHELL-119`) are raised by domains
that have never read an approvals record, and either of them held open for five seconds makes the
application declare itself unattended while the user is picking a folder. The asynchronous forms of the
same native dialogs measured 267–303 ms with the identical dialog on screen. **So the obligation is
application-wide and is now stated as one: no synchronous platform-dialog call may ever be made on main.**
It is written in full in ADR-0019 and carried in constraint T-31, because that is where its violators will
be standing. **(3) There is no platform signal for "main is unresponsive" a run host can use.** Electron's
own events are emitted by main; the operating-system signals detect the wrong case — the hung-window test
fired at +5.18/+5.41/+5.44 s for a busy loop and **never** for a native modal, with the modal's own window
reporting itself healthy on all 23 samples. Recorded so it is not re-proposed.

**The window is still not sized, and OQ-39 is explicitly not closed by any of that.** The spike's main
process paints one heading; it has no framework, no transcript pipeline, no session writer and no version
control, and it does **not** reproduce the 22,777 ms of event-loop lag the IPC spike measured under frame
load — which is the state the window must survive. What exists is a floor (a false-lapse floor on an idle
main and a detection latency for a set of thresholds), not a size.

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

**The event history's trim was the one place two ADRs disagreed. It is settled, in ADR-0009's favour, and
the argument that settles it is one neither record had made.** ADR-0009 puts `REQ-EVENTS-091`'s trim in
its **own** transaction on the serialised queue, immediately after the commit of the append that
overflowed and before the next event is recorded. ADR-0004's generalisation — that a trim is a delete
inside the transaction that made the insert — is **withdrawn**, and preserved there with the argument
that supported it.

**Both records were arguing about the wrong cost.** The obvious objection to a shared transaction is that
a failed trim would discard the overflowing event, and a reader can answer that: one event, on a failure
path, is a price worth paying for one rule instead of two. `REQ-EVENTS-088` is what makes it
unanswerable. A rolled-back trim is a failed transaction, a failed transaction is a failed recording
step, and `REQ-EVENTS-088` makes a failed recording **sticky** — the store is marked failed for the
remainder of that run and no further event may be recorded for it. So the shared transaction converts
`REQ-EVENTS-091`'s "bounded and visible cost" into the permanent end of that session's history. Those two
requirements prescribe deliberately different outcomes for deliberately different failures, and a shared
transaction is precisely the arrangement that cannot tell them apart. The price is not one event; it is
every event after it.

**The amendment does not decide it, and a reader who thinks it does will get the right answer for the
wrong reason.** `REQ-EVENTS-092` binds the truncation record to the **trim** — "the same indivisible step
as the trim that produced it", which closes a crash window the file design accepted. It says nothing
about binding the trim to the **append** and is satisfied identically under either arrangement. What it
settles is the older two-step-marker question, and it settles that in ADR-0009's favour too.

**They do not conflict as designs, and the rule that generalises is now in both records.** ADR-0004's
reading is *correct* for the seven ring-capped evidence kinds, where `REQ-SESSION-133` requires the trim
"in the same durable operation that records the entry"; it was wrong only where it generalised to a store
whose requirement says no such thing and states a failure mode that depends on its not being said. **Put
the trim inside the recording transaction exactly where a requirement says the trim and the record are
one durable operation, and nowhere else.** ADR-0024's retention section is annotated so a reader who
notices the asymmetry does not unify two behaviours the specification separated — and it states the price
of its own arrangement rather than hiding it: under the shared transaction a failed trim loses the entry
being recorded, where the event history's arrangement loses nothing.

**A second half of ADR-0004's claim was not in dispute and is wrong anyway.** It held that
`REQ-EVENTS-098`'s no-racing rule "is discharged by the transaction rather than by a queue discipline".
The amended requirement refuses that in terms: serialisation is required "even where the store's own
guarantees already make two writers unable to corrupt one another, because what is at stake is emission
order (`REQ-EVENTS-076`) as much as record integrity, and no store supplies that on its own." A
transaction gives atomicity and isolation; it does not give sequence. Withdrawn rather than quietly
amended, because a reader was entitled to conclude the queue was redundant on the strength of it.

**The reopening condition is named because it is three hops long.** `REQ-EVENTS-088` is not obviously
about trims — it is about recording failures — and an amendment to it made for unrelated reasons would
silently unmake this settlement. Both records say so. A reader of `REQ-EVENTS-088` alone has no signal
that an architecture decision hangs on it.

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
the reader is scrolled — 777 at the top, 668 at the bottom, 747 at minimum window size, same product,
same fixture, same iteration.

**The specification-side action this paragraph called for has happened, and the sentence that called for
it is withdrawn.** It read: "`REQ-UIBENCH-050` and `REQ-UIBENCH-054` are **unamended**; the corpus
therefore still states an invariant that its own definition breaks on one live reading, and
`resolutions/21` withholds the drafted relaxation." **Both requirements are now amended and neither
statement is true.** `REQ-UIBENCH-050` states in bold that the framework-neutral counting rule "is the
operative one" — **reading 2 wins** — spells out that a rendered paragraph, code block or list item
inside a transcript row *is* a widget, and closes the escape route by saying the framework clause "does
not license a product to count only the elements its own layout declares and to leave out what it drew".
`REQ-UIBENCH-054` carries ESC-13's relaxation and states its ground exactly: the invariant is withdrawn
as **unsatisfiable by any admissible implementation**, not merely as unmet, because the only structure
that could hold it is a canvas and a canvas forfeits `REQ-CHAT-075`, `REQ-CHAT-077`, `REQ-CHAT-065` and
`REQ-SHELL-144`. **OQ-28 is closed.** The cost ESC-13 accepted is unchanged and is not softened by that:
the product ships a benchmark whose headline structural invariant is gone, in a domain whose whole point
is determinism — informational either way under `REQ-UIBENCH-088`.

**Two more of this record's benchmark complaints were answered in the same pass**, and both were answered
by the requirement rather than worked around. `REQ-UIBENCH-087` now states that where a
`tail_replacements_1000` record carries `settle_timed_out` true its samples "measure nothing", so the
memory tripwire reads **false** rather than reporting a pass on a figure that is not a measurement —
naming the exact failure this record had identified, "a second-half growth of minus a hundred million
bytes satisfies *strictly less than 64 MiB* exactly as a healthy figure does". And `REQ-UIBENCH-118`
withdraws its own "the only absolute threshold" claim "as untrue of this document", naming the 64 MiB of
`REQ-UIBENCH-087` and the one-thread delta of `REQ-UIBENCH-084` as two more.

Two other things the renderer measurement settled, the first of which the specification has since acted
on as described above. The memory tripwire passes with room —
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

**Taking a copy out, and putting one back.** Two things a user does to a *workspace* rather than to a
session sit beside all of the above, and both are new since the last pass. **Exports** are per record
kind and per artifact: the trajectory document, the timeline, the issues record, the metrics document,
the permission audit, the verification-gate record, the improvement store and the delivery store, each
written to a file the user chooses, each readable by a stock parser on a machine with none of this
product's code present, and none of them a channel. **The backup** is one artifact holding the whole
store. It is taken in the **workspace service**, with main contributing only the save dialog, by an
engine-level consistent-snapshot copy inside a read transaction — never a file copy, because a file copy
of a live store is not a state any reader could have observed. It runs **while runs are live**, which is
the requirement's hardest clause and the one that shapes the mechanism: `REQ-SESSION-201` forbids
refusing it because a session is live, so every run-host commit at `REQ-MONITOR-219`'s tick is a write
concurrent with the copy. The artifact is a container of exactly three things — a manifest, the store
snapshot, and the per-session files the snapshot references — taken in a fixed order, with **the snapshot
as the authority for what the artifact contains**: snapshot first, then enumerate *from the snapshot* and
copy only what it references, then seal, then rename onto the destination. Files-first would let the
snapshot name a body the artifact lacks. One stated cost: the session log is carried as a **prefix**
truncated at its last complete line, because it is being appended to; the summary is unaffected because
`REQ-SESSION-033` replaces it atomically.

**The restore stops the store for both holding processes while the application keeps running**, which is
a capability the topology did not previously need — the run host must close its connection, refuse runs
against it, and re-open, without exiting and without a window closing. It is the **second** two-process
handshake in the record after ADR-0014's quit, and it is not the same shape. It is whole-store
replacement; **merge is not offered at all, silent or stated.** The grounds are worth the sentence:
`REQ-SESSION-012` makes ids non-reusable, so the only possible collision is a backup against the store it
was taken from where the target has since recorded more of the same sessions — and merging those means
reconciling rows inside one session between divergent histories, producing a session neither ever
recorded, which is `REQ-SESSION-201`'s own forbidden "store no run could have left behind". A merge would
be a feature every use of which is its worst case. Lock rows naming a **foreign host** are dropped on the
way in and rows naming this machine are kept, with the count disclosed before the restore: artifacts
routinely carry locks for mid-run sessions, and restored elsewhere those name a host `REQ-SESSION-056`
resolves toward live and `REQ-SESSION-047` never reaps, so fidelity would make every session that was
live at backup time permanently unreachable. Dropping costs nothing — the status still asserts a run, so
with no lock the session is stale by `REQ-SESSION-057` and the ordinary repair settles it to
`interrupted`, which is what actually happened to it.

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

**Fail closed, and never by timeout — and the mechanism this rule named for one case does not exist.** The
permission gate fails closed on any exception; approvals suspended at quit resolve as denied; liveness
resolves toward alive, so a session that might be running is never reaped. **The clause that said "a lost
channel to main makes every session unattended, reached without a timer" was measured and is withdrawn as
the account of a dead main.** The run host does not outlive main: across six runs it was gone within
**207–341 ms** of main's death and **never observed the channel close at all** — in the one run that got a
sample in, main's pid was already gone while the channel still reported itself open. **The conclusion
survives — nothing hangs — but it survives because nothing is left to hang**, not because a revocation
ran. The run, its pending-approval map and its host cease to exist together. The revocation that operates
in every case a run host can actually reach is the **gap-based lapse** above, and the channel-close branch
is kept only for a main that closes its end deliberately and for a differently-hosted run host that would
outlive main — neither of which is the case the record used to cite it for.

**One consequence of that reaches well past approvals and is flagged here because it belongs to no single
record.** Nothing that must happen *on the way down* can be placed in the run host: settling pending
approvals, flushing a session, writing a terminal timeline entry are all unreachable after main dies, and
what is durable is exactly what had already committed. ADR-0014 owns cancellation, teardown and quit and
has not been swept against this.

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

**Measure the thing the requirement bounds, not the thing that is easy to measure.** Every one of the
seven spikes earned it. The end-to-end p95 passes `REQ-MONITOR-223` because a ~500 µs transport floor
dwarfs a store apply — so a regression in the apply stage would not show up at all, and the test that
would catch it measures the apply in isolation. Bundle weight was assumed to bound first paint and moves
it by about 10 ms; the packaging mechanism was assumed harmless and costs 13 s. A settle signal was chosen
for being "real rather than a proxy" and turned out to be absent exactly where the phase changes nothing
visible.

**The measurement round added a harder version of the same rule: the obvious test can return a clean
pass on a broken thing.** A store on a network path reports the log enabled, reads the setting back as
enabled, reports itself writable — and throws on the next statement, so **only a write detects it**. Two
writers on one file reached by two spellings lose 95 % of committed rows and the **integrity check passes**,
because the store is not corrupt, merely short. A naive copy of a live store fails 625 times in 627 under
load and **0 times in 40** at a realistic cadence, so the cheap experiment gives a false all-clear. A
preparation with one runtime library deleted passes a marker-and-entry-point check, launches, and **never
paints a window**. And a terminal save's readability — the property `REQ-SESSION-070` actually states —
passes at the *weaker* durability setting, which is why the stronger one had to be re-grounded rather than
defended on the clause it does not need. **In every case the failing configuration reports success**, which
is the shape of defect this discipline exists to catch, and in every case the correction is in the record
beside the argument it replaced.

---

## 6. What this record does not settle, and the Architecture Gate verdict

**The specification is done and the architecture has now caught up on evidence but not on obligations.**
Every one of the thirty-one owner rulings has landed in `docs/spec/`: 4,394 requirement identifiers, and
every one of the 1,213 the ADRs cite resolves. What changed in the measurement round of 2026-09-02 is not
the balance of work outstanding but the **quality of what is written down**: four measurements were taken,
every owner ruling survived, and several records reached the right conclusion by reasoning the
measurements have since disproved. Those reasons have been corrected in place, with the falsified claim
kept beside its replacement, because a record whose conclusions are right and whose reasons are false is a
record that gets "simplified" back into the defect by the next reader.

**Read the next four sections as one thing.** A list of outstanding items reads as a list of equal debts,
and the gate turns on distinctions that such a list destroys: **what is a defect still to fix**; **what a
measurement settled and what it left behind**; **what was decided, implemented for the first time, and
found not to work**; and **what has never been run at all**. Implementation is authorised off the back of
this verdict, so an optimistic verdict costs more than a pessimistic one. All four are stated separately
below and **nothing is moved between them for tidiness** — in particular, nothing a measurement did not
settle has been folded into a discharged spike.

### The escalations: twenty-two ruled, two answered by amendment, seven open

**ESC-1 to ESC-21 and ESC-26 all carry a decision** in [`owner-decisions.md`](owner-decisions.md),
alongside nine structural rulings SR-1 to SR-9, and the amendment passes those rulings authorised **have
landed**.

**ESC-19, ESC-20 and ESC-21 were ruled against comparative evidence**, at the owner's direction, by
examining how seven other coding harnesses solve the same problems. That comparison is in
`owner-decisions.md` with its sources and it is evidence this record may use. Three of its findings bear
on decisions already taken: machine-local session storage is **universal** — not one of the seven keeps
history inside the user's project, so ESC-15 is the field's position rather than a deviation; a store
engine is the **majority and the direction of travel**, with three of the four users having *migrated to
it*; and the path-keyed products have a **documented, filed, painful bug** this record already avoided,
one report recording 63 sessions lost across 10 projects after a reorganisation and even a change of a
folder name's case orphaning everything. That last is a decision to protect against a later
simplification, not to revisit.

**ESC-23 and ESC-25 needed no ruling in the end, and ESC-25 was answered against what this record
argued.** ESC-23's antecedent is restored: `REQ-CONFIG-288` now *takes* ESC-1's decision in its own voice
rather than stating the coupling in the present tense, and `REQ-CONFIG-423` now says a change to the
permission mode made "by **any** other surface" lands in the pending settings state — the dependence on
the shared save path is gone. ESC-25 argued that `REQ-STARTUP-152` and `REQ-STARTUP-035` made a detached
signature file unpublishable, so the signature had to live inside the manifest. **The specification took
the third option and amended both requirements individually.** `SHA256SUMS.txt.sig` is now a published
asset; `REQ-STARTUP-122` fixes verify-then-parse so untrusted bytes reach no parser of ours; and
`REQ-STARTUP-168` holds rotation in the **build** as a key set, decided at the release gate, which is the
operational commitment ESC-25 asked the owner to see stated.

**ESC-26 is ruled, applied, and is the largest single thing that changed in this round.** It asked whether
the workspace identifier may ever be re-established. The answer is one narrow exception, bound by five
conditions, available only inside `REQ-SESSION-201`'s restore and nowhere else; `REQ-SESSION-197` carries
the whole of it and `REQ-SESSION-201` carries a pointer, because a contract has exactly one home. The
recovery journey ESC-19 minted the backup for — machine dies, clone the repository, open it once, restore
the backup — now completes without a hand-edited file. What it does **not** do is give a user with a copied
folder any product action, and that half of OQ-47 stays open on purpose.

**Seven escalations are open and none is architecture's to settle.** Two are long-standing; five were
raised by the defect-correction round on 2026-09-02, are recorded in
[`../clean-room/specification-gate.md`](../clean-room/specification-gate.md), and **none of them has been
ruled**.

- **ESC-22 — the aggregate terminal-frame rate is bounded by no requirement.** Re-checked against the
  amended corpus and unchanged: `runtime.shell_max_background_sessions` is `int ≥ 1`, default 20, **no
  maximum** (`REQ-TOOLS-108`, `REQ-CONFIG-116`), each background session publishes its own stream, and
  ADR-0021's coalescing cap is the whole of the protection for `REQ-MONITOR-222` since the measurement
  showed a channel name is not a transport. One of two factors in a conformance budget is user-writable
  without a ceiling. Three remedies, none of them architecture's alone: state a maximum on the key;
  impose an aggregate rate budget across streams; or adopt the direct message port, measured holding
  transcript p95 at 1.119 ms under 12,000 frames/s.
- **ESC-24 — a launch arriving during the force-exit allowance is unowned.** Also unchanged.
  `REQ-STARTUP-161` releases the record "when that instance's process ends"; during `REQ-MONITOR-131`'s
  30 s allowance the exiting instance still holds it; `REQ-STARTUP-162` requires the hand-over to surface
  a window and, where none is open, to **build** one, while writing nothing and reporting nothing.
  `REQ-STARTUP-164`(3) covers the instance that does not *answer*; it does not cover the one that does.
  SR-1 created the case. **The measurement sharpens it rather than closing it**: under our own record the
  reclaim path is now ours, so this is a case the product's own protocol must state rather than one the
  platform decides.
- **ESC-27 — `secrets.yaml` has no file mode.** `REQ-CONFIG-216` fixes the write as atomic and
  directory-creating and states no mode, so the one configuration file that holds credentials by design
  inherits the process mask. One clause, one ruling. (Constraint D-26, OQ-14.)
- **ESC-28 — should the product do more than tell a user about a withdrawn configuration key?**
  `REQ-CONFIG-478` fixes the honest minimum; opening the file for editing from the failure report, or a
  confirmed one-click removal, are both user-visible options and the second needs the
  never-repair-a-user's-configuration rule narrowed explicitly.
- **ESC-29 — a withdrawn key in the *global* scope stops every workspace opening**, and no in-product
  surface is reachable from that state, including the settings screen that would edit the global file.
  Worth ruling with ESC-28.
- **ESC-30 — a version missing because it was never recorded is not distinguishable from one retention
  pruned.** `REQ-LIBRARY-047`'s best-effort version write sits outside the transaction that pruning is
  inside. Whether the export must tell the two causes apart is the owner's. (OQ-45, constraint C-10.)
- **ESC-31 — where the permission-audit entry's identifier lives**, and whether it is a further field of
  the entry or travels beside it. The two are observably different in the exported audit file, and
  ADR-0024's choice that the identifier is the export ordinal is permitted and unblessed until this is
  ruled.

### THE GATE VERDICT

Four lists. Nothing is in more than one, and nothing has been moved between them.

#### A. Defects — things that are wrong now and that no measurement will fix

**Ten of the twelve defects this list carried on 2026-09-02 are closed, and the list has been re-derived
against the corpus rather than re-read.** The defect-correction round answered them; five product
decisions it declined to take are ESC-27 to ESC-31 above; and this pass verified each closure against the
requirement text rather than against the round's own report. What is closed and must not be re-raised:
the two literal strings for one integration-lock refusal (`REQ-GIT-128` now owns both texts and the losing
spelling occurs nowhere in the corpus — **checked**); the two key inventories for the batch trajectory
document (`REQ-EVENTS-144` owns the closed three-key wrapper and `REQ-SESSION-189`'s two-key inventory is
withdrawn in place with the literal quoted — **checked**); `REQ-STARTUP-165`(c) against (d), where (c) now
fixes a **closed set of two permitted locations** for the run-scoped placement, (d) states that placement
as its single exception, and the residual case is bounded away in terms — **checked, and ADR-0054's
"specification defect" block is retired accordingly**; `REQ-TRACE-089`'s permitted index against the
read-path purity rules; the two export requirements that asked for a statement no store was obliged to be
able to make; `REQ-TOOLS-081`'s unresolvable evidence locator; `REQ-CONFIG-192`'s withdrawn key with no
stated remedy (`REQ-CONFIG-478`); `REQ-PROVIDER-063`'s bearer tokens, which are now out of the workspace —
**checked**; `REQ-CHAT-055`'s two readings, resolved to the to-paint one — **checked**, which discharges
ADR-0045's reservation; `REQ-STARTUP-163`'s directory identity, which closes **OQ-49**; and
`REQ-SESSION-069`'s abandoned-write log line, which is withdrawn in place, closing the half of constraint
D-10 that was reported as a defect — **checked**.

**What remains is the list below. It is shorter, and one item on it is new and worse than anything it
replaces.**

1. **Nothing says which per-user data location is meant on a platform that offers both a roaming and a
   machine-local one, and three separate mechanisms now depend on the answer.** `REQ-STARTUP-145` says
   "platform-conventional"; on Windows the platform layer's conventional per-user data path resolves under
   the **roaming** profile, which a domain profile replicates between machines. Four requirements that
   need machine-local storage each say so for themselves, so no build that reads them is wrong — but the
   silence now carries the workspace store (ESC-15), the launch preparation (`REQ-STARTUP-165`(a)) and the
   instance record, and the trap is measured rather than anticipated: `app.getPath('userData')` resolved
   under `AppData\Roaming` on the machine that ran spike 20, and a preparation derived from it would put
   **507.9 MiB per version** into replicated storage. The defect-correction round names this as "the
   highest-value single amendment still outstanding" and it is one clause.
2. **`REQ-TRACE-061` states no retry ladder and now demonstrably needs one.** Its failure policy is
   *re-raised*. On ordinary corporate shared storage **6.2 % of rename-over-existing calls failed with no
   other opener present at all** — 37 of 600 first attempts, against 0 of 300 on local storage — and every
   one of the 30 retried renames succeeded within two extra attempts. `REQ-SESSION-198` deliberately
   leaves the user's own repository on whatever storage the user chose, so this lands on a user-initiated
   action, on the platform the product mandates, roughly once in every sixteen writes. The corpus states
   exactly one ladder (`REQ-SESSION-033`) and that requirement declares itself the only ladder its domain
   states, so borrowing it would be manufacturing a specification. **OQ-44**, and it has changed character
   from "sufficient and unspecified" to "necessary and unspecified".
3. **The same gap has a second site, on the exports, and it is now numerical rather than hypothetical.**
   `REQ-EVENTS-145`'s trajectory document and the exports of `REQ-SESSION-189` and `REQ-SESSION-199` are
   written to a destination **the user chooses**, over an existing file, at the one path in the product
   the product does not own. `REQ-SESSION-033` scopes its ladder to "where this domain replaces a whole
   file in place", naming `summary.md` as "the one written repeatedly" rather than as the only one, then
   declares itself the only ladder the domain states. The text supports both readings and they differ in
   what a user observes: under the narrow one, roughly one export in sixteen to a network share fails for
   a reason the user cannot act on.
4. **`REQ-EVENTS-098`'s no-delay clause is unsatisfiable on its literal reading, and a conformance test
   written from the literal wording fails every possible store.** It says "a reader MUST NOT be able to
   delay or block the writer". Measured: a *compliant* reader doing whole-session reads back to back
   takes the writer's commit from **p50 163.6 → 345.9 µs and p95 271.7 → 898.9 µs**, with zero errors and
   zero lock contention. No store can offer no measurable scheduling effect. The requirement's own
   following sentence — "a store in which one blocks the other does not satisfy this requirement" — fixes
   the sense as *blocking*, and ADR-0009 takes that reading and names it as a reading rather than
   repairing the requirement. **The residue is that the store will be blamed for a doubled median by
   anyone testing the literal words.** *(This item was not present before the measurement round; it is a
   defect the measurement exposed rather than one it created.)*
5. **`REQ-STARTUP-165`(c) and (d) — CLOSED, retained here only so the closure is visible.** (c)
   requires a run that can produce no preparation to "still start the artifact"; (d) requires preparing
   to "write nothing outside the per-user directories of `REQ-STARTUP-145`". The payload is a tree of
   executables and loadable libraries and cannot run without existing as files, so where that root
   refuses **every** write the run either does not start, contradicting (c), or writes outside those
   directories, contradicting (d). **That was true when it was written and is no longer true.** (c) now
   fixes a closed set of two permitted locations for the run-scoped placement — the per-user data
   directories, or, only where those accept no write at all, the platform's transient-files storage — (d)
   states that single exception in its own text, and the residual case is bounded away explicitly: "where
   neither kind of storage accepts any write, there is nowhere on that machine the artifact's contents can
   be run from at all, and this clause's obligation to start is not reached". **No ruling is owed and
   ADR-0054's design has been rewritten against the amended text.**
6. **Architecture's own, and not the specification's: the store must resolve to one canonical path
   spelling, and until this pass nothing said so.** Two processes reaching one store by two spellings of
   one path silently destroy each other's writes — measured, on one machine, with a clean integrity check
   and no error anywhere. ADR-0058 prevented it by construction and, in the spike's own words, "by
   accident, not by stated intent". It is now rule 6 of that record and constraint **W-27**. It needs a
   conformance test that opens one store two ways and asserts the product refuses, because **its violation
   is silent and there is no repair to offer, since there is no error to detect.**
7. **Architecture's own: `REQ-STARTUP-164` licenses two processes existing "briefly" and nothing bounds
   "briefly".** Nothing in the requirement makes a reclaimed-from process stand down, so a wedged primary
   that later recovers still believes it is the instance. ADR-0055 states a design rule for it — the
   recovered process must re-read the record and stop behaving as the instance where the record names
   another — and that rule has **no measurement behind it**. Low confidence, recorded rather than
   asserted; whether the requirement should say so is the specification's call.
8. **Minor, and listed so nobody re-discovers them.** `REQ-SESSION-062` and `REQ-SHELL-155` still specify
   the repair notice in the singular where a run-host crash produces one stale session per in-flight run
   (**OQ-46**) — left as recorded by the defect-correction round because it is a surface choice rather
   than a reading a builder could get wrong. Residual **file** language survives in a store that is now
   rows — `REQ-LIBRARY-048`'s "neither an existing *file* nor recorded history", where the phrase is doing
   semantic work as the discriminator between two causes. `REQ-SESSION-201` fixes no behaviour for
   **cancelling a backup in progress** on a store of unbounded size; the mechanism makes cancellation safe
   by construction, so this is a surface question rather than a correctness one, but it is a silence on a
   long-running user-initiated action — and now a priced one, since the snapshot measured a median
   1,077 ms per 41 MB and ESC-19's own survey cites comparable products reaching 700 MB to 2 GB.

**Eight entries. Four are the specification's to fix, two are the architecture's to own, one is closed and
kept visible, and one is a bundle of minor surface silences.** None of the eight is blocked on a
measurement. **Items 1 and 2 would each cause a conformant implementation to be built wrong** — item 1
because a build reading `REQ-STARTUP-145` literally on Windows puts replicated storage under three
mechanisms that must not be replicated, and item 2 because it produces a user-visible failure in a
user-initiated action at a measured rate on the platform the product mandates. **Item 4 would cause a
conformant implementation to be wrongly failed**, which is a different and rarer defect and is listed with
the others because a conformance suite is built from these words.

**Two rulings now carry a reason a measurement disproved, and neither is architecture's to edit.**
`owner-decisions.md` is the authority for what was decided and it is quoted, cited and relied on across
this record — so a reader who cites a ruling picks up its reasoning with it. **ESC-15's ruling text still
says "write-ahead logging is unsupported on network filesystems, so the store opens read-only"**, which
section 3 above records as measured false in both clauses; the ruling itself survives on stronger
evidence. **SR-7 still says the artifact "is identified by the packaging tool's own portable-executable
environment variable, not by `execPath`"**; that variable was set in **0 of 157** launches through our own
launcher, because it belongs to the packaging tool SR-7's whole purpose is to move off — while the same
tool's own portable still published it correctly on the same machine on the same day, so this is a fact
about the mechanism and not about the machine. The conclusion survives untouched and is now carried by our
own declared variable, which held the correct absolute artifact path in **149 of 149** painted launches,
against `REQ-STARTUP-147`'s existing wording, which accommodates it without amendment. **Both corrections
are made in the ADRs; neither can be made in the ruling, and both are flagged here so the owner can decide
whether the rulings should carry them.**

#### B. Measurements — five were pending, four landed, and what each left behind

**Spikes 14, 16, 19, 20 and 21 were in flight when this list was last written. Four of the five reports
exist and cover all five spikes.** Every ADR decision that turned on one of them said so in its own
*Revisit if*, with the direction a bad number would push it. **Every owner ruling survived. One ADR's own
stated gate trigger fired, three platform facts this record asserted were disproved, and the survivors are
now supported by the reasons that actually hold rather than by the ones that were written down.**

- **Spike 21 — `commit-on-the-publish-path.md`. Discharged.** The commit is 0.28 % of
  `REQ-MONITOR-222`'s budget at p95; the whole persist-then-publish interval 0.71 %; the ratio 0.971
  against a ceiling of 2. ADR-0058's own open item — "the commit is not yet measured on this path and the
  record should not pretend otherwise" — is **closed**, and its *Revisit if* on commit cost is marked
  **not triggered on evidence**. Its second trigger, cross-process write contention, is **partially**
  triggered: compliant contention is sub-millisecond, a rule-violating reader costs 205 ms. **What it did
  not settle:** a real schema (no indexes beyond two primary keys and one listing index, so
  `REQ-SESSION-042`'s listing and `REQ-TRACE-239`'s board budget are still unmeasured against declared
  indexes — spike 8); two run hosts contending, which `REQ-TOOLS-089` and `REQ-SANDBOX-038` permit and
  which shares one store and one write lock; any failure path at all (no torn write, no corruption, no
  disk-full, no read-only volume); packaging, so the native module's unpacking obligation is untested; and
  power loss, which is now the **sole** stated ground for forcing the stronger durability setting on a
  terminal save.
- **Spike 19 — `remote-and-synchronised-storage.md`. Discharged on its own question; it could not decide
  ESC-21 and says so.** It supported ESC-15 on stronger evidence, disproved that ruling's stated
  mechanism, and disproved ADR-0058's read-back guard as *sufficient*. It confirmed `REQ-STARTUP-166`'s
  direct storage classification as implementable, precise and cheap (p50 0.10–1.83 ms) **with a stated
  blind spot: any client that registers no platform sync root is invisible to it, and the one such client
  present on the measuring machine registered none**. It measured ESC-21's **first** premise — exclusive
  create is a genuine primitive over a network share, 2,500 races, exactly one winner in 2,500 — and
  **declined to fake the second**. See list D.
- **Spike 20 — `cached-portable-launch.md`. Discharged. SR-7's gate condition is met.** Warm cached
  launch **575.5–723.1 ms**, cold **897.3–1,414.6 ms**, against 5,000 ms; the exempt preparing run lands
  **inside** the bound it is exempt from at 1,634.7–2,091.3 ms; the fast-path version check costs
  **0.14–0.49 ms**, against 709.6–845.0 ms for the cheapest launch-time digest it rejects. Cache
  invalidation across an update did **not** produce the failure ADR-0054 called "the one outcome that
  would make the design wrong rather than slow". It also found **two defects in the mechanism as the ADR
  described it** — both fixed there, both invisible in any build that never meets a damaged preparation.
  See list C.
- **Spikes 14 and 16 — `presenter-liveness-and-instance-claim.md`. Spike 16 discharged and its ADR's rule
  fired; spike 14 measured but OQ-39 not closed.** The instance-claim consequence is in section 1 above.
  The liveness consequence is in section 4. **What spike 14 did not settle is the thing it was raised
  for**: the window is still not sized, because the harness's main process has no product in it and does
  not reproduce the loaded state the window must survive.

**Three build-host obligations remain and saying "outstanding" hides what they are.** **Spike 12** — the
Linux image's runtime on an unmodified baseline installation, on which ESC-11's choice between its two
options turns — needs a Linux machine that has never had the legacy FUSE library installed. **Spike 17's
two remaining platform keys** need a macOS host and a Linux host of their own keys, because
`REQ-STARTUP-155` binds all four artifacts and only the Windows two were built. And **ADR-0056's
build-time native-module load proof** must be shown constructible on all three release runners. These will
not be closed by anyone reasoning harder; they need infrastructure.

**One of those three has become materially larger, and it is worth stating separately.** The instance
claim is now **entirely ours on three platforms and measured on one**. macOS additionally has to compose
with the convention that a second launch of a bundle produces no second process; the Linux singleton is
different code from the Windows path that failed, so the 20-second result says nothing either way about
it. ADR-0055's rule correctly does not wait on that — the primitive is refused on measurement and
alternative III was withdrawn by SR-1, so there is no second destination to fall back to — but the
verification is **relocated rather than discharged**. And `REQ-STARTUP-156`'s release gate observes
"downloaded and launched to first paint" per artifact; it does **not** require launching the entry point
twice on one user account, which is what `REQ-STARTUP-152` makes the release-checkable form of SR-1 and is
the check that would catch this failure on a platform nobody has measured.

#### C. Two defects the measurement round found in mechanisms this record had already decided

These are neither specification defects nor pending measurements. They are places where a mechanism was
written down, implemented exactly as written by someone measuring it, and did not work. **Both are fixed
in ADR-0054, and both are recorded here because neither is visible in a build that never meets the failure
case.**

- **The commit step could not commit.** ADR-0054 said the preparation is "written into a sibling
  directory and then **renamed onto the token-named path as the last step**". On Windows a directory
  cannot be renamed onto an existing directory, and the platform's replace-existing flag does not apply to
  directories — which is exactly the case `REQ-STARTUP-165`(c) is about. Two observed outcomes: with the
  marker deleted the redo could not commit, deleted its own work and launched from the still-damaged
  directory, so **the artifact would re-prepare on every launch for ever**; with the entry point deleted
  the redo could not commit, the spawn failed, and **the launch produced nothing at all**. The conclusion
  survives — a token-named directory exists only if it was finished, so the recovery path and the
  first-run path are one piece of code — and the mechanism is now **displace, then rename**, measured at
  2.17–3.18 ms. Simplifying it back to a bare rename reintroduces both failures.
- **The completeness check returned a cache hit on a preparation that cannot run.** ADR-0054's triggers
  were marker and entry point. A deleted runtime library and a truncated payload archive each **passed**
  the check; the damaged image launched; and **no window ever appeared** — confirmed independently by
  running the prepared executable directly. That is `REQ-STARTUP-165`(c) unmet in the requirement's own
  words. The marker now carries the path and length of every prepared file and the fast path checks them
  all, at 3.56–5.87 ms. **The residue is stated rather than hidden**: it does not catch in-place
  corruption at unchanged length, and the only thing that would is a digest of the prepared tree, priced
  at 3.89–5.50 s — 39–44 % of the whole budget for an uncompressed payload. Both records had reserved
  "carry the token in the directory name alone and read no marker" as an escape hatch if the check proved
  expensive. It is 0.14–0.49 ms of a ~600 ms launch, and **the escape hatch is now explicitly withdrawn
  rather than left available, because taking it would reintroduce a launch that produces no window.**

#### D. Unmeasured architecture, and the honest name for it is that

**One mechanism in this record is large, new, entirely justified from the requirement, and its restore
half has not been run in any part: `REQ-SESSION-201`'s backup and restore (spike 22).** The *backup* half
is now measured and vindicated — see section 3. The **restore** closes two store connections across two
processes, expands an archive, opens a database, runs an integrity check, performs two directory renames
and re-opens, while the application keeps running and a window is showing. Every step is individually
argued. Nothing has been executed. **It deserves a spike before the Architecture Gate, not after.**

One argument inside it rests on a documented engine behaviour that was **read rather than verified**: the
stepped online-backup API's restart-on-external-write property is what rejects the alternative ADR-0058
did not take, and ADR-0058 marks it as documentation-derived and puts the check first in its *Revisit
if*. **A reader skimming the Decision could take it as established.** The check costs nothing and should
happen before any measurement.

**Two sub-cases went unmeasured inside spikes that otherwise passed, and both are listed rather than
absorbed, because absorbing them is how a gap becomes invisible.**

- **`REQ-STARTUP-165`(c)'s "no usable preparation at all" branch, and its notice.** Spike 20 did not
  attempt it. It is the only part of that requirement left untouched, it is the branch ADR-0054 wrote from
  scratch on 2026-09-02 against the amended text, and its failure mode is a **missing warning** — the
  artifact is permanently slow and nothing says why — which is the outcome the clause exists to prevent.
  Three components must agree about one small file for the notice to appear, and the specific error
  ADR-0054 names is implementing four-silent-one-loud from a habit of *the-preparation-is-silent*.
- **ESC-21's second premise.** Whether two machines signed into one synchronisation account can each
  succeed at exclusive create on the same lock name. Spike 19 measured the first premise, stated the
  closing experiment precisely, called it one afternoon's work, and **refused to invent the result**.
  Until it is taken, the refusal-versus-warning **strength** of ESC-21 rests on reasoning rather than on
  measurement. What the spike can contribute is that the failure, if it occurs, is **undetectable after
  the fact by the lock itself**: the orderable timestamp step is about a millisecond while the measuring
  machine's own clock offset was about 855 ms, a process identifier means nothing across machines, and a
  host name distinguishes without ranking — so a warning-only design leaves the user with two integrations
  into one base branch and no artifact saying which came first. That is an argument for refusal, and it is
  reasoning from a measurement rather than a measurement.

**A third gap sits between the two and is nobody's yet.** `REQ-EVENTS-179`'s write probe — the mechanism
that closes the reported-itself-open-then-failed case — has not itself been measured. Spike 19 established
that only a write detects the condition and that the failure is 100 % reproducible at the first statement
in the configuration it found; it did not measure what a made-and-undone write costs on the startup path,
and `REQ-EVENTS-035` puts establishing the store before any part of run start-up can fail. On spike 21's
figures a single commit is sub-millisecond on local storage, so this is very likely free — **but "very
likely free" is exactly the phrase this record has been wrong with before.**

#### The verdict

**The architecture record is not ready for the Architecture Gate, and the reasons are enumerable rather
than diffuse. It is materially closer than it was, and the difference is evidence rather than argument.**

- **Two specification defects would each cause a conformant implementation to be built wrong** — list A
  items 1 and 2 — and neither is discovered by testing. A third (item 4) would cause a conformant
  implementation to be wrongly *failed*. These are the gate blockers on the specification side, and there
  are three of them where there were four.
- **One mechanism is unmeasured** — `REQ-SESSION-201`'s restore (spike 22) — and it implements one of the
  two requirements the owner minted. Its backup half is now measured and vindicated; its restore half has
  not been run. That is the gate blocker on the architecture side.
- **Two mechanisms this record had decided were implemented and did not work** (list C). Both are fixed.
  They are named in the verdict rather than in a footnote because they are the evidence for how much of
  what remains unmeasured is likely to be wrong: **two of the two mechanisms measured for the first time
  in this round contained a defect that no reading had caught.**
- **Four measurements landed and every owner ruling survived. Several ADRs reached the right conclusion
  by reasoning the measurements disproved**, and those reasons are now corrected in place with the
  falsified claim kept beside its replacement. The single correction most likely to be unwound is the
  durability one: the stated ground was readability, readability is trivially testable, and the test says
  the weaker setting passes — so the next person optimising the terminal-save path will run exactly that
  test and be **right about the reason and wrong about the decision**. If a later pass compresses
  ADR-0058's durability section, that paragraph is the one that must survive.
- **Three build-host obligations** need infrastructure, not reasoning, and one of them grew: the instance
  claim is now ours on three platforms and measured on one.
- **Seven escalations are open** and none is architecture's to settle. ESC-26, which this list previously
  named as the one to answer first, **is ruled and has landed**. ESC-22 and ESC-24 are unchanged. ESC-27
  to ESC-31 were raised by the defect-correction round on 2026-09-02 and **nobody has ruled any of them**;
  ESC-31 is the one with an architecture consequence today, because ADR-0024's choice of what identifies a
  permission-audit entry stays permitted-and-unblessed until it is answered.
- **Two owner rulings carry a reason a measurement disproved** (end of list A). The rulings survive; the
  reasons are corrected in the ADRs and cannot be corrected in `owner-decisions.md` by this record.
- **What is genuinely settled is larger than what is not.** Twenty-two escalations ruled, two answered by
  amendment, ten of the twelve specification defects this record raised now closed and each closure
  verified against the requirement text, five inter-record contradictions closed with their losing
  arguments preserved, zero dangling citations across 1,213 requirement references, and the two questions
  this record was most likely to get wrong — what identifies a workspace, and where the event history's
  trim belongs — settled on requirement text rather than on preference.

**No ADR is blocked from ratification by an open question.** Several remain unratifiable because a
measurement they name has not been taken, which is list B's build-host group and list D, and one because
the mechanism it describes has never been run, which is spike 22.

**What would cause a conformant implementation to be built wrong today, stated plainly, because that is
the question the gate turns on.** Three things. (1) A build that reads `REQ-STARTUP-145` literally on
Windows will put the workspace store, the launch preparation and the instance record into replicated
storage — the exact configuration ESC-15 exists to remove — and every requirement that needs machine-local
storage says so for itself, so the build is defensible on each requirement and wrong overall. (2) A build
implementing `REQ-TRACE-061` as written will fail a user-initiated regeneration roughly once in sixteen
writes on ordinary corporate storage, with no ladder to absorb it and no remedy the user can act on. (3) A
conformance suite written from `REQ-EVENTS-098`'s literal words will fail every possible store. Everything
else outstanding is either an owner's decision, a measurement, or a build host.

Two decisions — the theme palettes and the Markdown dialect — wait on the approved visual design
reference. Every mechanism above is independent of it; no screen can be built without it.

### The open questions

**Forty-one specification questions are open** and six are closed with their reasons — OQ-3, OQ-11,
OQ-26, OQ-27, OQ-28 and, new since the defect-correction round, **OQ-49**, which `REQ-STARTUP-163` closes
by owning what makes two directory strings the same directory: constraint W-25 moves from a ruling to a
requirement citation. OQ-11's closure text was wrong and was rewritten rather than deleted: it is closed
because `REQ-LIBRARY-043`'s ladder went with its document layout, not because neither ladder has a file
left to govern. OQ-44's statement of fact was false and was corrected, and is now **widened**: the same
gap has a second site, on the exports, at the one path in the product the product does not own.

**Four questions changed character on measurement and none of them closed, which is worth saying because
"a spike ran" reads as "a question closed".** **OQ-39** (sizing the presenter lapse window) has a floor
and a detection latency and is **explicitly not sized**, because the harness's main process had no product
in it. **OQ-44** stops being "sufficient and unspecified" and becomes "necessary on ordinary corporate
storage and unspecified", at a measured 6.2 % first-attempt failure rate with no foreign handle involved —
and the measurement fixes the *shape* of the answer without supplying its numbers, since two extra attempts
sufficed in every one of 30 retried renames. **OQ-12** gains a second measurement pulling the same way: the
naive directory-flush call returns an error on every spelling including local, so "add the missing flush"
produces a failure rather than a guarantee, and the available call needs a deliberately write-opened handle
whose guarantee is still unestablished. **OQ-43** (does the single-instance gate admit a benchmark
iteration?) is unchanged in substance and now concerns **our** gate rather than the platform's, which makes
the sentinel branch entirely ours to define and the composition easier to state — the requirement-level
ambiguity it records is untouched.

**Two are more owed than they were, and ESC-26 is why for one of them.** **OQ-48** — reclaiming a
machine-local store whose workspace no longer exists — now has a **third** producer and a third shape of
leftover: a confirmed identifier establishment leaves the old identifier's store intact and merely
unreferenced. The surface is now the only route **back** to a store a user may well want, not only the
route to clearing one they do not. **OQ-45** is narrowed and simultaneously more owed, and its product
half is now **ESC-30**.

**One question was raised by a spike and is answered rather than filed.** Spike 19 asked where a
first-statement store failure after a successful open belongs, between `REQ-EVENTS-084` (opening) and
`REQ-EVENTS-088` (a write failing during a run), and recorded that the mapped-drive case lands in that gap
30 times out of 30. **It is closed in the specification rather than left open here**: `REQ-EVENTS-179` is
minted, it resolves the case into `REQ-EVENTS-084` and refuses the run on exactly the same terms, and
`REQ-EVENTS-084` and `REQ-EVENTS-088` each gained the boundary sentence that routes to it. It is recorded
in `open-questions.md` as minted-and-closed with a pointer rather than as a live question, so that the
spike's own request for an entry is answered rather than ignored.

**OQ-28 is closed because the specification moved under it, and it moved decisively.** That question
asked what the two structural counts mean for a document-model interface, and it recorded as its live
item that "the specification has not moved". It has. `REQ-UIBENCH-050` now states in bold that the
framework-neutral counting rule "is the operative one", spells out that a rendered paragraph, code block
or list item inside a transcript row **is** a widget, and closes the escape route — the framework clause
"does not license a product to count only the elements its own layout declares and to leave out what it
drew". And `REQ-UIBENCH-054` carries ESC-13's relaxation: the element-count invariant is withdrawn as
**unsatisfiable by any admissible implementation**, not merely as unmet, because the only structure that
could hold it is a canvas and a canvas forfeits `REQ-CHAT-075`, `REQ-CHAT-077`, `REQ-CHAT-065` and
`REQ-SHELL-144`. The measured divergence — +147 or +85 at the `construct_window` → `apply_fixture`
boundary in every run — is the fact the requirement was amended against.

**Three questions changed shape rather than closing, and one is new.** **OQ-47**'s third paragraph is
discharged and preserved as the mistake it was: the two records do not disagree about what identifies a
workspace, they key two different objects, and both collapses are actively wrong. Its first two
paragraphs stay open, and the dead end they record — "go and edit this file" — is now reached by a second
route, from the restore. **OQ-45** is narrowed (ADR-0041 takes the improvement store's export and only
the export) and simultaneously **more** owed, because `REQ-LIBRARY-047`'s untouched best-effort version
write now interacts with `REQ-LIBRARY-176`'s "how many were dropped" clause. **OQ-48** is unchanged in
substance and more owed: the restore and the corruption ladder each displace a store and keep it, so the
two operations a user in trouble reaches for first are the two that leave something only a reclamation
surface can clear — and that surface exists nowhere. **OQ-49** is new: what makes two directory strings
the same directory, which ADR-0002 decided because it needed a key.

**OQ-41's "what would close it" was wrong and is corrected.** It proposed a runtime API exposing
share-delete on open. That remedy does not exist because the problem is not there: the runtime already
requests share-delete, and the blocker is the replace-by-rename call, which fails even against a holder
that explicitly permits delete. The closer is a **replace primitive**, measured succeeding against a held
reader, available out of process at p50 767 ms and unmeasured in process. The question is who owns a
native replace primitive, not whether a share flag exists. And OQ-41's residue is now **split into its
two halves with their two owners**, because they are not the same problem: a test session in the same
checkout is the `REQ-TRACE-502` conformance gap; a foreign process holding a file is not, because an
editor is not an invocation — it is a `REQ-TRACE-061` re-raise problem.

All of it is in [`open-questions.md`](open-questions.md).

### The measurements

**Twenty-two numbered spikes: one withdrawn, seven discharged, one discharged for Windows only —
thirteen outstanding.** Numbers are stable and never reused; a withdrawn spike keeps its number as a
tombstone. What matters more than the count is the split in the gate verdict above: **three need a build
host that does not exist here, one (22) is new and load-bearing and has never been run in its restore
half, and two sub-cases went unmeasured inside spikes that otherwise passed.**

Eight reports exist, all in [`spikes/`](spikes/) — seven for live spikes and one for a withdrawn one:

| Report | Spike | What it settled | What it did not |
|---|---|---|---|
| `ipc-hop-latency.md` | **10 — discharged** | ADR-0002's Revisit-if and both of ADR-0044's; `REQ-MONITOR-222`, `REQ-MONITOR-223` and `REQ-ORCH-155` at p95; that a channel name is not a transport | the commit on the publish path (**since measured — spike 21**), fan-out to several windows, concurrent runs, the reconcile path, a real renderer |
| `packaged-first-paint.md` | **17 — discharged for Windows only** | that the `onefile` portable fails `REQ-STARTUP-155` at every weight including zero; that bundle weight is close to free on the flavours that pass. **It triggered SR-7** | macOS `.dmg` and Linux AppImage — neither was built, and `REQ-STARTUP-155` binds both. It also has no product in it: no persistence, no native module |
| `renderer-invariance-and-benchmark-cadence.md` | **1 — discharged** | both counting rules against a running window — **which is what the specification then amended `REQ-UIBENCH-050` and `REQ-UIBENCH-054` against**; the memory tripwire; that the reachable viewport is not knowable at construction; that ADR-0053's paint settle does not work | equivalence of a rAF settle to a paint settle where both resolve; the real component rather than a mock shell |
| `windows-writer-handle-compaction.md` | **9 — withdrawn** | historically: that the deleted rule 3 was right, and **three corrections that outlive its subject** (share-delete *is* requested; a directory flush works on a write-opened handle; what actually blocks a replace, and what closes it) | whether a replace survives a power cut, on any platform; and every filesystem but `C:` NTFS — the storage spike has since covered network shares and contradicts its directory-flush figure on a read-only handle (section 3) |
| `commit-on-the-publish-path.md` | **21 — discharged** | ADR-0058's own open item on the commit; `REQ-MONITOR-221`, `REQ-MONITOR-222`, `REQ-MONITOR-223`, `REQ-ORCH-155` and `REQ-EVENTS-029` **with the commit in the interval**; the checkpoint period as arithmetic; that the readability clause does not need the stronger durability setting; that ADR-0002, ADR-0008 and ADR-0010 are not reopened | a real schema with declared indexes (spike 8); two run hosts contending; **any failure path at all**; packaging and the native module's unpacking obligation; power loss, which is now the sole ground for forcing the stronger setting; macOS and Linux |
| `remote-and-synchronised-storage.md` | **19 — discharged on its own question** | ESC-15 on stronger evidence, and its stated mechanism disproved; the read-back guard as necessary-but-insufficient; that a naive copy of a live store is not a backup and the engine snapshot is; that exclusive create is a genuine primitive over a network share; that `REQ-STARTUP-166`'s classification is implementable, precise and cheap | **ESC-21's second premise — no second machine, and it declined to fake one**; no synchronisation client was written to; no Electron; one binding, one store engine version; loopback rather than a network, so the 12 ms rename and the 6.2 % failure rate are both floors; no power loss |
| `cached-portable-launch.md` | **20 — discharged; SR-7's gate condition met** | the cached-launch figure, the fast-path check's cost, cache invalidation across an update; that self-update is **rescued** rather than merely preserved by SR-7; **two defects in ADR-0054's own mechanism** (list C) | `REQ-STARTUP-165`(c)'s "no usable preparation at all" branch and its notice — **not attempted**; clause (d) independently verified; a read-only volume rather than an access-control approximation; the commit's durability discipline; a real download with the platform's reputation check |
| `presenter-liveness-and-instance-claim.md` | **14 and 16 — 16 discharged and its ADR's rule fired; 14 measured, OQ-39 not closed** | that the liveness poll works and must be **gap-based**; that the exposure is every synchronous native dialog and not the approval dialog; that the run host dies with main and never sees the channel close; that the platform single-instance primitive **fails** `REQ-STARTUP-164` on Windows | **macOS and Linux — zero coverage, on both sides of the decision**; the decision path (no gate, no pending-approval map, no headless policy), so *never a silent allow* is unexercised; sizing the lapse window under product-shaped load; whether every native dialog the product needs has a non-blocking form on every platform; packaged builds |

**A note a reader should not have to work out.** Two of the eight measured a design that no longer exists.
Neither is wasted: what generalises from the writer-handle report is a **diagnosis** — an
append-and-compact file whose writer holds it open is a silent cap-enforcement failure — plus three
factual corrections, one of which changed an answer in three separate records; and what generalises from
the first-paint report is that the packaging *mechanism*, not the bundle weight, was the cost.

**Thirteen spikes are outstanding and they are not one kind of thing.** **Needing a build host that does
not exist here:** 12 (the Linux image's runtime on an unmodified baseline) and the two non-Windows
platform keys of 17. **New, load-bearing and never run:** 22, `REQ-SESSION-201`'s restore — an
architecture-side gate item, not a specification one. **Genuinely not started:** 2 (Windows access-control
read-back), 3 (tool-server negotiation over our own transport, on which ESC-12 partly turns), 4 (console
suppression), 5 (the reserved-token branch), 6 (the Responses dialect), 7 (the board projection crossing),
8 (store query latency against **declared** indexes, plus store open, log recovery, an integrity check on
the startup path, and long-path behaviour — and now also the cost of `REQ-EVENTS-179`'s write probe), 11
(parse-cache behaviour), 13 (forced synchronous commits at recycler-pool scale), 15 (echo latency), and 18
(two writers on the one store; spike 21 measured run-host-against-workspace-service and **not** two run
hosts, which `REQ-TOOLS-089` and `REQ-SANDBOX-038` permit).

**Two sub-cases are owed inside spikes that passed, and they are listed here rather than folded into the
parents**, because a sub-case absorbed into a discharged spike is a gap nobody can see: `REQ-STARTUP-165`
(c)'s **no-usable-preparation branch and its notice** inside spike 20, and **ESC-21's second premise —
two machines on one synchronised folder** inside spike 19. The second is one afternoon's work and the
whole of it is one number: races in which both machines' exclusive create returned success.

**Two measurements are owed and are deliberately not numbered.** A **power-loss test**, which is now
larger than it was: it is OQ-12's outstanding half, and it is also the **sole stated ground** for forcing
the stronger durability setting on a terminal save, since the readability clause that used to carry that
decision was measured and does not need it. And a **rebuilt-for-Electron confirmation run of the storage
measurements**: spike 19 ran host Node with a prebuilt binding, spike 21 rebuilt against the Electron
runtime but measured different questions, and neither exercised the store under a packaged build — so the
first-statement failure `REQ-EVENTS-179` now governs was measured on one binding on one machine.

## 7. Index of decisions

Numbered in dependency order: the earliest numbers carry the decisions everything else rests on. **Two
rows break that rule and both say so.** ADR-0057 was found missing after the others were numbered, and
ADR-0045, ADR-0046 and ADR-0056 all depend on it. ADR-0058 was added under SR-4 and is numbered after
everything it constrains — ADR-0003, ADR-0004 and ADR-0005 all now depend on it.

**Three filenames no longer match their titles, deliberately.**
`adr/0003-files-are-the-system-of-record.md` now holds an ADR titled *Where state lives: the line between
a file and a row*. The filename was left alone because the number and path are referenced from this index
and from an unknown number of the other records; renaming it is a repository-wide change and belongs to
whoever next sweeps the index, not to the pass that reversed the decision. The same is true of
`adr/0058-the-workspace-database.md`, whose title no longer says "database", and of
`adr/0024-evidence-and-audit-files.md`, whose subject is no longer files. **Two records also changed
scope without changing their titles, and both say so in a header note rather than in the index**:
ADR-0041 now owns the improvement store's export and only the export, and ADR-0056 now carries the
native-module Electron-ABI obligation. A README summary will not pick either up on its own, which is why
both are spelled out in the rows above.

**Two records in this index have not been swept against the specification as it now stands, and both are
reported here rather than repaired, because repairing either is a rewrite of an argument and not a
citation fix.** ADR-0037 states that `REQ-CONFIG-288` "has not been amended, and this record must not
pretend otherwise" and treats `REQ-CONFIG-423`'s second sentence as having lost its antecedent. Both
requirements have since been amended and both statements are now false. **ADR-0019's header describes a
"residual tension" with `REQ-SANDBOX-101`** that is materially narrower than the record still says:
`REQ-SANDBOX-101` has since been amended and now states the capability test in terms — "it is a test of
capability, not of registration: a presenter registered but which cannot actually put a prompt in front of
anyone does not make the run attended … a session with a presenter present but wedged is unattended under
both". That paragraph is now the stalest thing in a record that was otherwise rewritten in this round, and
it deserves its own pass rather than a drive-by edit inside a measurement pass.

**Three records also carry a claim about another record that a measurement has changed underneath them,
and the cross-references should be checked once, together.** ADR-0058's statements touch ADR-0005 (the
lock table, and the integration lock under ESC-21) and ADR-0056 (the Electron rebuild, and two newly
recorded binding disciplines); ADR-0054 hands ADR-0056 a compression requirement and a measured build
budget; and ADR-0055 consequence 15 now depends on ADR-0019 carrying an application-wide prohibition on
synchronous native dialogs. All of those landed in the same round, from different agents.

| # | Decision | Evidence |
|---|---|---|
| 0001 | Implementation language and runtime baseline | |
| 0002 | Process topology *(topology **confirmed** by measurement; **workspace identity settled** — the service is keyed by resolved path and the store by identifier, and the specification fixes both; **not reopened by the commit**, which takes the whole interval to 0.71 % of budget. **Two topology facts it does not yet carry**: the run host does not outlive main, so nothing that must happen on the way down may be placed there; and the run-host-to-renderer direct port is the only transport that survives a blocked main, which is a robustness argument for it independent of throughput)* | ipc-hop-latency, commit-on-the-publish-path, presenter-liveness-and-instance-claim |
| 0003 | Where state lives: the line between a file and a row *(reverses in part; depends on 0058)* | |
| 0004 | One document primitive, **three** write shapes, and a guarded read side *(file surface re-derived as a table of targets; trim generalisation withdrawn; **the retry ladder is now evidence-backed and the cause is not the one the record inherited** — 6.2 % first-attempt failure on shared storage with no other opener present; **and a factual error about ADR-0058's backup mechanism is corrected with the error visible**)* | windows-writer-handle-compaction, remote-and-synchronised-storage |
| 0005 | The session lock as the single capability token, **and the one lock that is not a row** *(**ESC-21 carried**: the integration refuses on replicated storage and the lock is never created. **ESC-21's first premise is now measured — 2,500 races over a network share, exactly one winner in 2,500 — and its second is not**, so the refusal-versus-warning strength still rests on reasoning; `REQ-GIT-124`'s ordering of the storage check ahead of the lock check is confirmed by measurement)* | remote-and-synchronised-storage |
| 0006 | Two clock ports and a budget primitive; no bare timers | |
| 0007 | Secret redaction: one module, two output forms | |
| 0008 | One ordered session writer per session, owning that session's transactions | |
| 0009 | The event history as a table, with the line-delimited form as an export *(**the transaction-boundary disagreement with 0004 is settled**, in this record's favour, on `REQ-EVENTS-088`'s sticky-failure rule; **per-event commit is now measured free rather than a cost the design absorbs, and this record withdraws its own contribution to ADR-0002's placement argument**; the checkpoint period is recorded as a design input)* | windows-writer-handle-compaction, commit-on-the-publish-path |
| 0010 | Three channels between the run host and its surfaces | ipc-hop-latency |
| 0011 | Following a session this process does not own *(**withdrawn in place** under SR-1 and SR-2)* | |
| 0012 | The delegated-child scheduler: a persisted ledger, not a promise graph | |
| 0013 | The run registry: addressing by session id | |
| 0014 | Cancellation, teardown and the quit choreography | |
| 0015 | Lifecycle hook invocation *(cross-slice tension recorded)* | |
| 0016 | The tool registry and its direction-aware accessor | |
| 0017 | The permission policy as an immutable compiled value | |
| 0018 | A purpose-built shell scanner | |
| 0019 | Approvals: wait registry with the gate; the presenter is a revocable capability *(slice conflict OQ-4 remains; the **requirement** conflict is dissolved by the amended `REQ-TOOLS-053`; **the channel-close revocation is measured not to be the mechanism that operates**; obligation 3 is restated application-wide as the synchronous-dialog prohibition; a fourth obligation is added — the lapse check must be gap-based; **the `REQ-SANDBOX-101` paragraph in its header is stale — see above**)* | presenter-liveness-and-instance-claim |
| 0020 | Terminal execution *(escalation ruled — ESC-5)* | |
| 0021 | The terminal screen model and stream fan-out *(**load-bearing for `REQ-MONITOR-222`**; conflict recorded)* | ipc-hop-latency |
| 0022 | OS-level confinement *(escalation ruled — ESC-6, provisionally revisited)* | |
| 0023 | Network egress and the `fetch` tool | |
| 0024 | Evidence and audit as append-only tables behind one writer, what the audit's export must prove, **and which record may never be exported** *(its "a 5,000-entry read should not delay the writer at all" is measured false and the conclusion survives on the blocking reading of `REQ-EVENTS-098`; a successful store open is now stated not to be evidence of a working store, which for a **best-effort** audit means a run whose permission decisions were all taken and none recorded — so the failure counter is load-bearing rather than diagnostic)* | commit-on-the-publish-path, remote-and-synchronised-storage |
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
| 0036 | Configuration stays YAML files, loaded through the document tree over a tri-state model *(the boundary is now `REQ-CONFIG-477`, not an architecture position)* | |
| 0037 | When a configuration change takes effect *(**ESC-1 ruled and both requirements since amended**; `REQ-CONFIG-288` now takes the decision itself and `REQ-CONFIG-423`'s antecedent is restored — **this record has not been swept against that and is stale in two places**)* | |
| 0038 | Version control by spawning the executable | |
| 0039 | Checkpoints as ordinary commits through a private Git **file** index; the checkpoint list is a table | |
| 0040 | The traceability engine: a stateless streaming library over files, with a single I/O owner *(the boundary is now `REQ-TRACE-513`; **an index is permitted** on `REQ-TRACE-089`'s terms — shape fixed, deliberately not built)* | |
| 0041 | The delivery store: per-requirement rows behind a capability-split handle *(**also owns the improvement store's export, and only the export** — carried as a scope note in the record's header, not in its title)* | |
| 0042 | The desktop preference store: a closed typed registry over an explicitly rooted per-user **file** | |
| 0043 | Authoritative interface state and the replica | |
| 0044 | The IPC contract *(**corrected by measurement**: a channel name is not a transport)* | ipc-hop-latency |
| 0045 | What paints the transcript *(**unblocked and now unconditional** — ESC-13 ruled, both readings measured, and `REQ-UIBENCH-050`/`-054` amended so OQ-28 is closed)* | renderer-invariance |
| 0046 | The transcript apply pipeline | |
| 0047 | The terminal grid surface | |
| 0048 | Windows, views and the three modality levels | |
| 0049 | Notices and acknowledgements | |
| 0050 | Theming and the accessibility floors | |
| 0051 | Markdown rendering and the bounded render cache | |
| 0052 | One passive instrumentation registry *(two new counters and one clock correction)* | ipc-hop-latency |
| 0053 | The benchmark harness *(**settle mechanism replaced** by measurement; phase driver decided)* | renderer-invariance |
| 0054 | Packaging, the four artifacts, and self-update *(**reopened and re-decided** under SR-7; ESC-8 and ESC-11 ruled; **ESC-8's signature mechanism reversed by amendment** — a detached asset, rotation held in the build; **SR-7's gate clause discharged on measurement**; **two defects in its own commit step and completeness check found and fixed**; the specification-defect block it designed around is **retired** because the requirement was amended; and the artifact is identified by **our own** declared variable, not the packaging tool's)* | packaged-first-paint, cached-portable-launch |
| 0055 | Startup sequencing, the instance claim, and the first-paint budget *(gains phase −1; **the chosen alternative for the claim changed from the platform primitive to our own record file, on measurement, on every platform** — the primitive is marked refused rather than not considered; the update-restart hand-over now meets `REQ-STARTUP-121` by construction and the concession is withdrawn rather than relocated)* | packaged-first-paint, cached-portable-launch, presenter-liveness-and-instance-claim |
| 0056 | The build toolchain *(gains a fifth output, the portable's launcher stub, **and the native-module Electron-ABI obligation with a build-time load proof** — the only check in the record that catches an unloadable store binding)* | packaged-first-paint |
| 0057 | The renderer framework and the renderer state store *(numbered out of dependency order — see above)* | |
| 0058 | The workspace store: **machine-local, found by a workspace identifier, and how it is backed up** *(numbered after everything it constrains — see above; **carries ESC-19's backup and restore — the backup half now measured, the restore half still spike 22**; **the machine-local argument is now about path spelling rather than about network filesystems, and ESC-15's chain is replaced by a per-link verdict table**; gains a **write probe**, a **canonical-spelling rule**, ESC-26's confirmed-establishment restore path, and the re-grounding of terminal-save durability on power loss)* | remote-and-synchronised-storage, commit-on-the-publish-path |

The five slice proposals these were consolidated from are retained in [`proposals/`](proposals/). Where a
proposal argued a case that the consolidated decision reverses or qualifies, the argument is preserved in
the ADR rather than replaced by the conclusion. The same rule now applies to the measurements: where a
spike overturned a claim, the claim is preserved beside what replaced it, so a reader can see that the
record changed its mind and why.
