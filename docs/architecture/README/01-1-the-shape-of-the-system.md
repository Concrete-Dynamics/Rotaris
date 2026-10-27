# Rotaris-crw — system architecture — 1. The shape of the system

Part 1 of 13 of [the architecture README](../README.md), which indexes every part.

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
run host, where prompts are consumed and where session ownership is enforced, and that placement ~~is
carried as open question **OQ-1**~~ was carried as **OQ-1**, closed 2026-09-07: `REQ-CHAT-041` now scopes the queue to
the application instance and session ID, with the run host its authoritative owner.

---
