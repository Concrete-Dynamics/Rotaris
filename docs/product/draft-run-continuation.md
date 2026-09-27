# Draft for the owner's ruling — what a stopped or paused run leaves, and what continuing it does

*Raised by the owner, 2026-09-27; logged as [R-058](requests.md#r-058). **Not a directive.** Nothing here governs
until the owner rules; on approval it becomes the next `PD-ORCH` in [`directives.md`](directives.md) with the forks
below settled, and this file is removed in the same commit.*

The owner asked: *"When continuing a run, childs should be resumed as well. We need to build a policy how we deal with
stopped or paused runs and how it behaves when continued."* This draft is written from three read-only surveys of the
specification, the code and the architecture record, made on 2026-09-27.

## 1. What the product does today

- **Four ways a run comes to rest, one record.** A pause, a graceful stop, a forced cancel and a quit all persist status
  `paused` with stop reason `user_cancelled` (a quit: `application_shutdown`). A crash leaves an in-progress status and a
  dead lock, which explicit repair turns into `interrupted`. Only the stop reason and the timeline tell them apart.
- **Every child ends with the run.** A stop, a cancel and a quit abort every child through the run's signal; the
  iteration's finalize sweep (REQ-ORCH-052) leaves every child row terminal. A pause lets each child finish its turn,
  summarise and end `succeeded` or `failed`, and still starts queued children — recorded as the defect
  [`a-pause-settles-children-instead-of-holding-them.md`](../defects/a-pause-settles-children-instead-of-holding-them.md).
- **Continuing is a new run.** Continue, a new message or a plan decision builds a new run on the same session. Before
  it starts, every non-terminal child row left by a crash is settled `cancelled` (REQ-ORCH-053, REQ-SESSION-065) — and
  today that sweep also runs when a session is merely opened to be viewed.
- **Nothing resumes a child.** A child has no conversation of its own on disk: its messages live in memory while it
  runs. What persists is its record (`task`, persona, its own todo, the report, `edited_files`, `cut_off`), its
  transcript rows (keyed by name, not task id) and its tool-call rows. The next run's root is told nothing about earlier
  children, and `owns()` refuses it any earlier child: it cannot wait on, read, depend on or continue one.
- **What the specification says.** REQ-MONITOR-256: "Continuing a session must never inherit the previous run's live
  agents." REQ-MONITOR-300: terminal child states are absorbing. PD-ORCH-004: a continuation is "the parent's decision,
  never an automatic resume". REQ-MONITOR-126: a cancel "cannot be undone in this session". So the owner's request
  changes behaviour live requirements state, and it is a directive.

## 2. The proposed policy

**(1) How a run came to rest is recorded on each child it leaves unfinished.** When a run comes to rest with children
that have not reached a terminal state, each such child's record gains an **interruption**: one of `pause`, `stop`,
`quit` or `crash`. The child still ends `cancelled` — terminal and absorbing, so REQ-ORCH-052, REQ-ORCH-053 and
REQ-MONITOR-300 hold — and its report states that it was interrupted, by what, and its progress: the workspace paths its
own file-writing calls changed, its last response and its tool-call count. A child that had not started (`queued`,
`waiting_on_*`) is recorded the same way with no progress.

**(2) Pause holds; it does not finish.** A pause stops every agent before its next model step, as REQ-ORCH-088's landing
does for one child, lets in-flight tool calls finish within REQ-ORCH-134's deadline, starts no queued child, and makes no
summarising call. The run then ends as it does today; its children are recorded with interruption `pause`.

**(3) An explicit cancel is final.** The cancel control (REQ-MONITOR-126's confirmation, "cannot be undone") and
cancelling one agent record no interruption: those children are not resumed. A graceful stop, a quit and a crash leave
them resumable.

**(4) Continuing resumes them.** When the session is next continued — the Continue action, a new message, or a plan
decision — before the first iteration begins, every child the previous run left with an interruption is **resumed**: a
new child record is created under that first iteration's root, with the same persona, task, background flag and write
scope, and a `resumed_from` link to the record it resumes. Its payload is its original task plus a **resume brief**
built from the record: that it is resuming, why it stopped, the paths it had changed, its own todo, its last response,
and the tail of its transcript within a fixed budget. Dependencies between resumed children are carried over. The root's
payload lists the resumed agents, which it owns like any child it delegated: it can wait on, read and cancel them.

**(5) What is never resumed.** A child that ended `succeeded`, `failed` (a timed-out child among them — PD-ORCH-004's
continuation offer is its route), `blocked` (REQ-ORCH-048), or cancelled by the user.

**(6) The user decides at each continue.** The Continue action names how many agents will resume, and offers to
continue without them; choosing that records the children as not resumed.

**(7) Opening a session is not continuing it.** Loading a session to view it changes no child record; settling and
resuming happen only when a run is about to start.

**(8) A continuation offer outlives its run.** An offer PD-ORCH-004 made stays open until it is taken up once, by the
agent that owns the child or, in a later run, by that run's root.

**What is unchanged.** A run is still bounded by its own limits; a resumed child gets a fresh `child_timeout` and counts
toward every child limit of the run that resumed it; the message-limit pause and the plan gate keep their durable holds;
the run host is still never re-forked, and a crash still needs explicit repair before anything continues (ADR-0002).

## 3. What the owner decides (each with a recommendation)

| # | Fork | Recommended | Alternatives |
|---|---|---|---|
| A | What a continue does with interrupted children | **Resume them by default**, with "continue without them" offered (clause 6) | ask every time; never resume, only list them to the root |
| B | Does an explicit cancel discard children? | **Yes** — the cancel dialog already says it cannot be undone (clause 3) | treat cancel like stop |
| C | Does a pause hold children (clause 2)? | **Yes** — the pause stops at the next step and summarises nothing | keep today's pause, which finishes them |
| D | How often can one piece of work be resumed? | **Each time the user continues**, no cap — every resume is a user action | once, like a continuation |
| E | Does a continuation offer survive the run (clause 8)? | **Yes, taken up once** | same iteration only (today) |
| F | What a resumed child is given | **The resume brief** from its record and transcript tail, bounded | its whole transcript replayed as conversation; its task only |
| G | Write scopes | **Persisted with the child and re-claimed on resume** | dropped; the resumed child re-declares |

## 4. What it costs

- **Requirements displaced.** Narrows REQ-MONITOR-256 (a resumed agent is a new agent built from a record, never a live
  one inherited), REQ-MONITOR-123 (what a pause does to children), REQ-TOOLS-155/REQ-ORCH-072 (the next root owns the
  resumed agents) and PD-ORCH-004 (fork E, as its revision 3); extends REQ-ORCH-053/REQ-SESSION-065 (the settle sweep
  records the interruption) and PD-TOOLS-006 (fork G: scopes persisted).
- **Store.** Appended migrations: `children.interruption`, `children.resumed_from`, `children.write_scope`, and a task id
  on transcript rows so a child's tail can be read without matching on a name another iteration reused.
- **Glossary.** "Resume", "interruption" and "resumed child" become product words, defined by the directive; the
  engine glossary's *Avoid* on "resume" for a continuation stays, because a continuation is still not a resume.
- **Spend.** A resumed child starts a fresh conversation and pays for its brief; a long pause or stop is no longer free
  to walk away from, because continuing brings its agents back unless the user declines.
- **Preconditions the build meets first.** The defects this touches are repaired with it:
  [`a-pause-settles-children-instead-of-holding-them.md`](../defects/a-pause-settles-children-instead-of-holding-them.md),
  [`cancelling-one-child-does-not-stop-it.md`](../defects/cancelling-one-child-does-not-stop-it.md),
  [`a-crashed-iteration-number-is-reused-by-the-next-run.md`](../defects/a-crashed-iteration-number-is-reused-by-the-next-run.md),
  and
  [`the-continuation-payload-says-no-artifact-is-recorded.md`](../defects/the-continuation-payload-says-no-artifact-is-recorded.md).
  The stop-versus-paused contradiction in
  [`a-graceful-stop-persists-paused-where-one-requirement-says-stopped.md`](../defects/a-graceful-stop-persists-paused-where-one-requirement-says-stopped.md)
  is an escalation of its own; this policy does not need it settled, because clause 1 records the cause on the child.

## 5. Not decided here

OQ-60 (whether an interrupted session gets a summary) and the unbuilt stall recovery
([`a-child-that-produces-no-output-is-never-given-its-one-corrective-message.md`](../defects/a-child-that-produces-no-output-is-never-given-its-one-corrective-message.md))
stay where they are. What `delegate`'s `session_id` means stays open
([`delegate-drops-session-id-and-suppress-auto-context.md`](../defects/delegate-drops-session-id-and-suppress-auto-context.md)).
