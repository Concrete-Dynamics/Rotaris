# ADR-0013 — The run registry: runs are addressed by session id; focus is a shell concept

- **Status:** proposed
- **Date:** 2026-08-31
- **Revised:** 2026-08-31, to carry SR-1 and SR-2. The registry no longer has to reason about runs
  elsewhere, and focus is now explicitly per main window.
- **Origin:** RUNTIME (ADR-RUNTIME-11)
- **Depends on:** ADR-0002, ADR-0010
- **Governed by:** `owner-decisions.md` SR-1, SR-2

## Context

`REQ-ORCH-151` requires every ledger, counter, budget, supervisor state, artifact store and snapshot
to be **scoped to one session id** and never read or written by another run, and a run's stop reason,
terminal status and its children's state sequence must not depend on how many other runs are in flight
or how they interleave.

`REQ-MONITOR-249`: concurrent runs each get their own run handle while views keep a single-run
interface; every control a view issues routes to the **focused** run; session-aware notifications must
cover every run, not only the focused one. `REQ-MONITOR-250`: background handles keep refreshing their
own session but publish **only a summary** — session id, execution status, branch — and never into the
shared transcript, agent tree, metrics or prompt queue. `REQ-MONITOR-252` and `REQ-MONITOR-257`:
switching focus changes which session is projected **without touching any background run's lifecycle**,
re-binds every per-session surface, and notices carry their session id so cross-session news survives a
focus change.

`REQ-MONITOR-253` and `REQ-MONITOR-254`: an approval request must reach the run that asked for it
**even when that run is not focused**; an answer for which no run is waiting must be reported back as
undeliverable; a permission-mode change reaches **only** the focused run.

`REQ-MONITOR-251`: the second and any subsequent concurrent launch must be placed in a worktree.
`REQ-MONITOR-258`: the operations gated on a run being active are **exactly five and the list is
closed**. `REQ-MONITOR-139` and `REQ-ORCH-071`: queued prompts are owned by a session and a run may
consume only prompts queued for its own session.

**What SR-1 and SR-2 change about this record's premise.** It was written when a run might be
executing somewhere this application could only watch, so "the registry answers only for this
application's runs" was a real limitation that needed a second opinion beside it. Under
`REQ-STARTUP-161` there is one instance, and under `REQ-MONITOR-243` a session is either live and
owned by this instance's run host or not running at all. **The registry is therefore complete**: every
run that exists anywhere in this product is an entry in it, and a session id that is not in it is a
session that is not running. That is a simplification of what the registry *means*, not of what it
does.

**One thing SR-1 makes larger rather than smaller.** Several main windows are now ordinary
(`REQ-STARTUP-163` builds one on a launch carrying a workspace the instance does not already have
open; `REQ-SHELL-017` has two alive at once during a workspace switch). `REQ-MONITOR-243` states that
because displaying a session is a read of what is published to it and never a write, **one live
session may be displayed in as many windows as the user has open at once, no window excluding
another.** So "the focused run" is not a property of the application. It is a property of a main
window, and two windows may have different focused sessions or the same one.

## Alternatives considered

**A — The engine knows which run is focused.** Rejected on three requirements. `REQ-MONITOR-252`
requires a focus change to touch no run's lifecycle; `REQ-ORCH-151` requires a run's outcome not to
depend on other runs or on interleaving; `REQ-MONITOR-250`'s summary-only rule is about what the
*shell* subscribes to, not about what the run does. If the engine knew about focus, a focus change
would be an engine event and the isolation claim would become a matter of care rather than of
structure.

*Under SR-1 this alternative is not merely rejected, it is incoherent.* With several main windows
each holding its own focus, "the focused run" is not single-valued at the engine, so there is nothing
for the engine to know.

**B — A registry keyed by session id, with focus entirely in the shell.** Chosen.

**C — A registry that also models runs it does not own.** This is the shape the record would have
needed before SR-1: a second, disk-derived view of runs held by other instances, kept beside the
in-process map and reconciled with it. It is recorded here as the alternative that SR-1 removed
rather than as one this record rejected on its merits — the earlier draft carried its residue in
consequence 4, where a lock-file scan stood as a "second opinion" that had to be made to agree with
the registry. There is nothing left for it to be a second opinion about.

## Decision

The run host holds `Map<sessionId, RunHandle>`, and it is the complete set of live runs in the
product. Every control names its session id; the shell resolves "focused" to a session id before
sending. Notifications are published per session id and the shell decides which to surface. Approval
requests carry a `request_id`, and an answer is routed by looking that id up in the registry — which
is exactly what `REQ-MONITOR-254`'s "an answer for which no run is waiting must be reported back as
undeliverable" describes.

Bindings — event sink, event history, transcript recording, hook running, approval handling, audit —
are **late-bound by session id and discarded at teardown** (`REQ-EVENTS-075`, `REQ-SESSION-176`), so a
straggling event after teardown has no destination and cannot reach the next run in the same process.
That matters more under ADR-0002, where many runs share one process.

**Focus is resolved per main window, and the run host is never told about it.** A control message
carries a session id that the sending window resolved from its own focus; the run host cannot tell
whether the sender was focused on that session, and does not need to. `REQ-MONITOR-254`'s "reaches
only the focused run" is therefore a statement about *which session id the shell puts in the message*,
not about a filter in the engine.

**A session displayed in several windows is several subscribers to one publication, not several
followers.** The projection owner (ADR-0043) publishes once per session; the relay in main fans out to
every renderer subscribed to that session. Every subscriber receives the same payloads with the same
per-session sequence numbers (`REQ-MONITOR-214`), so two windows showing one session cannot diverge in
content, only in local interface state — scroll anchor, expansion, search query. This is what
`REQ-MONITOR-243`'s "no window excluding another" costs: nothing, because displaying is a read.

## What changed under SR-1 and SR-2, stated plainly

- **The registry is complete rather than partial.** "The registry answers only for this application's
  runs" is now the same statement as "the registry answers for every run".
- **`REQ-MONITOR-247` is withdrawn, and it has no job left.** It forbade a handle executing its own
  run from following a second session, so that two writers could not collide over one transcript.
  There is no following left to refuse, and displaying a session is a read, so no surface can collide
  with a writer. **The guarantee it protected is not lost** — it is held where it belongs, by
  mechanisms that were always the real ones:
  - the exclusive session lock, acquired create-if-absent behind a reaper for dead holders, whose
    acquisition must fail whenever the holding process is alive (`REQ-MONITOR-240`, `REQ-SESSION-047`,
    `REQ-SESSION-050`);
  - the refusal to resume a session a run is already executing (`REQ-MONITOR-256`);
  - the refusal of a second start on a handle that is already running (`REQ-MONITOR-260`);
  - and `REQ-EVENTS-098`'s rule that the right to write a session's store is exactly the right to hold
    its lock.

  Those four were doing the work; `REQ-MONITOR-247` was a fifth guard on a path that no longer exists.
- **Consequence 4 of the earlier draft is retired.** It required the registry's answer and a
  workspace-level lock-file scan to "agree rather than being a second opinion". Under SR-1 the two
  cannot disagree about a live run, because there is no other party to hold a lock. What the scan
  still finds, and what `REQ-GIT-124` still needs it for, is stated below.

## Consequences accepted

1. `REQ-MONITOR-253`/`REQ-MONITOR-254`'s asymmetry is a **shell rule rather than an engine one**: a
   permission-mode change is addressed to one session id (the one the sending window has focused), an
   approval answer is addressed by request id to whichever session is waiting. The engine implements
   neither policy; it implements addressing. This is what makes ADR-0019's presenter-revocation
   conflict a shell problem rather than an engine one, and under SR-1 it is a *per-window* shell
   problem: two windows may each answer an approval, and the request id is what decides that only one
   answer is delivered and the other is reported undeliverable.
2. `REQ-MONITOR-251`'s second-launch-in-a-worktree rule is a **launch-path** rule owned by domains 06
   and 07, not a scheduler rule; the registry does not enforce it.
3. `REQ-MONITOR-258`'s closed list of five run-active gates lives in the shell and the launch path. The
   registry supplies the predicate — is a run active for this session, for this workspace — and
   nothing else, drawing on the single busy test of `REQ-NOTIFY-050` rather than a second one. Under
   SR-1 that predicate is now authoritative rather than partial.
4. **`REQ-GIT-124` still needs a disk-side check, for a narrower reason than before.** It counts a run
   as active whenever it holds a session lock in this workspace. The registry answers for every run
   this instance is executing; what it cannot answer for is a lock left behind by an instance that is
   gone and not yet reaped, which resolves toward live under `REQ-SESSION-056` and which a worktree
   integration must not merge across. So the workspace-level predicate is **the registry, or an
   unreaped stale lock** — one question with two sources, not two opinions about one question. The
   stale source is settled by the ordinary reap and repair path (`REQ-SESSION-047`,
   `REQ-SESSION-060`), after which the registry alone answers.
5. **The registry is a crash domain, and its loss is total.** ADR-0002 consequence 1 records that a
   run-host crash loses every in-flight run at once; the registry is the in-memory structure that goes
   with them. It holds no durable state of its own and needs no recovery of its own: each lost run is
   recovered as a stale session through the lock reap, and the registry is rebuilt empty. That is
   deliberate — a registry persisted across a crash would assert live runs that are not running.

## Revisit if

ADR-0002 moves to one process per run, in which case the registry becomes a supervisor of child
processes and the addressing above becomes the wire protocol rather than a map lookup — the shape does
not change, only the transport. Or a product change re-introduces a run this instance does not own, in
which case alternative C returns and the completeness claim above is the first thing that breaks.

## First execution — 2026-09-03, the registry with a run in it

*Recorded under GD-10.*

**Built and run:** `packages/engine/src/sessions.ts` — `Map<sessionId, …>` holding, per live session, the
writer that holds its lock, the projection owner it feeds and the run executing it; every control names a
session id the sending window resolved from its own focus, and the run host is never told about focus;
the registry supplies the "is a run active" predicate (`isRunActive`, `activeRunCount`) and nothing else.
A second prompt while a run is active is refused with "A run is already active." (`REQ-CHAT-012`,
`REQ-MONITOR-260`). Bindings are late-bound by session id and removed at teardown.

**Found: nothing.** The registry is a map; what the first execution found belongs to the records of the
things in it.

**Second execution, 2026-09-03, with approvals in it.** An approval answer is routed by request id across
every live session (`Sessions.answerApproval`) and reported undeliverable when none waits (`REQ-MONITOR-254`);
a permission-mode change is addressed to the one session id the sending window resolved (`REQ-MONITOR-254`'s
other half). Consequence 1 held as written: two policies, one addressing. **Found: nothing.**

**Third execution, 2026-09-03, with children.** `cancelAgent` is addressed by session id and task id; the reserved
run id cancels the run (`REQ-MONITOR-009`); an unknown or terminal child answers `false`. **Found: nothing.**

**Fourth execution, 2026-09-05, with a resumed session.** `Sessions.resume` places a stored session in the
map with no run; `Sessions.prompt` on it starts a run on the same writer and owner, so the predicates and
the controls address the continued run as they addressed the first. `session.resume` is refused with
"Finish or cancel the active run before switching sessions." while any run is active on the single-run host
(`REQ-SHELL-126`), checked at both ends of the boundary. **Found: nothing.**

**Fifth execution, 2026-09-05, with the control channel's operations.** Every operation is addressed by the
session id the sending window resolved; the registry adds `continueSession` — a session command, since a paused
session has no live run to control (REQ-MONITOR-011) — beside the four predicates it already supplied. A pause
window resolves through that command and main closes it on success. **Found: nothing.**

**Sixth execution, 2026-10-07, the per-workspace predicate (PD-SHELL-009, OQ-206 ruled under R-072; fin28).** Consequence 3
says the registry supplies the predicate "for this session, for this workspace". **Found: the workspace half was not built.**
`activeRunCount` counted the whole instance, and the run host's `runs.active` answered every workspace id with that count
("Sessions are not keyed by workspace yet"), so REQ-SHELL-021's gate 3 refused an idle window's switch over another
project's run. It is built now: `activeRunCount(workspaceRoot?)` counts the live sessions whose session row's
`workspace_root` is the root (no root: the instance, as the last window's close and the update's close ask), and
`stopActiveIn(workspaceRoot)` applies the stop control's graceful stop to that workspace's active runs for the close of one
of several main windows. `run.test.ts` pins both (two workspaces, one stopped `paused` by `stop`, the other untouched);
`dispatch.test.ts` pins the run host's hop. The consequence's text stands; what it claimed is now true. The keyed count's
readers are REQ-SHELL-021's gate 3, the restore's refusal and the close of one of several windows; `session.start`'s forced
isolation (REQ-GIT-120: "whenever any run is active") asks the instance's count with the empty id, so a launch in an idle
project while another project's run executes is still placed in a worktree (`commands/session.test.ts`'s REQ-GIT-120 case). *Corrected 2026-10-07 by fin29 (fin28 reviewers' finding d), the claim above kept:* "the close of one of several windows"
is no longer a reader of `activeRunCount`. That count reads `isRunActive`, which holds for a run whose end is written but
which is still ending, a run `stopActiveIn` does not stop, so the box counted runs its Yes could not stop. The close now asks
`runs.active` with `scope: 'stoppable'`, answered by `stoppableRunCount(workspaceRoot)`, which counts with `stopActiveIn`'s
own predicate (a live run whose end is not yet written; `run.test.ts` pins the two apart on a run held while it forwards its
end). Gate 3 and the restore's refusal still read `activeRunCount`.
