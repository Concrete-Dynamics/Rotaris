# Open questions — Specification questions (14 of 27)

Part 19 of 68 of the [open-questions record](../open-questions.md), which indexes every part. Holds OQ-101.

**OQ-101 — What does cancelling one paused child at rest reach, say and leave, and what does it do with a child a crash left, which clauses 3 and 8 record only at a repair or a continue?** *(`PD-ORCH-005` clause 16, revision 4, with clauses 3 and 8 — "a crash is recorded when the session is next repaired or continued", and "settling, recording interruptions and resuming happen only when a run of the session is about to start" — which the crash reading below keeps, and clauses 10 and 18, whose "Either choice records the crash first" names the Continue action and "continue without them" and not the cancel; clause 15, whose "every confirmed 'Cancel the run?' is clause 3's explicit cancel, whichever surface asks it" the reading below departs from on one surface, a persona window on the run's own instance while the session rests (cross-cited from OQ-108); REQ-MONITOR-063, which the directive narrows; REQ-MONITOR-128, which clause 16 names for the paused child's confirmation and not for its refusal, and whose "an error message states that the agent is no longer cancellable" the reading below departs from for the refusals that say nothing of the agent; REQ-MONITOR-064, which the directive does not name and which the cascade note below departs from by counting paused descendants where the requirement counts live ones only (OQ-100); and REQ-MONITOR-055, REQ-ORCH-133, REQ-LIBRARY-092, REQ-TOOLS-111, REQ-SHELL-075, REQ-SESSION-129, REQ-ORCH-048, REQ-ORCH-054 and REQ-CHAT-008, which it does not name. Raised 2026-09-28 by building `PD-ORCH-005` revision 4 under [R-065](../../product/requests.md#r-065). Numbered OQ-74 while it was built; renumbered when it reached `main`, where OQ-74 had been taken meanwhile.)*

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** every reading built is confirmed, and `PD-ORCH-005` revision 6 states them in clause 24: Cancel offered for a `paused` child only while its session rests, never for the resting run-level agent; a persona window's "Cancel the run?" at rest refused (the one exception to clause 15's "whichever surface asks it"); a crash-left child cancelled from its stored state, with only its own cut-off calls answered; its background sessions left running; a dependent left for the resumed run to block; and the engine's words for a refusal by the store or another process's lock, a store error while the lock is taken reading as the store's failure.

Clause 16 has "a `paused` child" offer Cancel "wherever a live agent offers it", confirmed as REQ-MONITOR-128 requires —
naming the child and one line per paused descendant — and has it and each paused descendant end `cancelled`, the
iteration open, the rest resuming, and the Continue action's count dropping. The session command it takes had worked
only with a run behind it. The clause does not say:

- which agent a surface offers it for, when the run-level agent now presents `paused` too (OQ-100);
- what it does with a child a crash left, before the crash is recorded, which presents `paused` (OQ-100) but is stored
  `running`;
- what the cancelled child's report, timeline entry and background sessions become;
- what REQ-MONITOR-064's cascade note, which counts live descendants only, says for a paused child;
- what the confirmation says beyond naming;
- what becomes of an agent whose `depends_on` names the cancelled child (REQ-ORCH-048).

**What the build proceeds under.**

- **Where it is offered.** A `paused` child offers Cancel on every surface a live agent does — the inspector, the
  Mission view's "Cancel selection" and the Workspace's agents header — **while its session rests** with an iteration
  open (`cancelOffered(agent, runActive, resting)`, `resting` being `runLevelResting`: `paused`, `interrupted`, or
  REQ-CHAT-008's recovery state, the same predicate that decides the composer's count and the run-level agent's
  `paused`), as clause 16's heading and REQ-MONITOR-063's back-pointer say. It is not offered while a run is active and
  the session does not rest: a `pausing` run is still bringing its agents to rest one by one, and a continue has not yet
  resumed them all; a cancel sent then would reach the live run's cancel, which cancels every unfinished descendant. A
  persona window offers Cancel always (REQ-SHELL-075(g)). The run-level agent at rest is never offered it: clause 16
  names a child, and the whole iteration's equivalent is clause 6's "Continue without them". The one exception is a
  persona window on the run's own instance, because REQ-SHELL-075(g) gives it Cancel unconditionally. That window asks
  "Cancel the run?" of the root it draws `paused`. The confirmed `cancelAgent` for the run's id, with no run behind the
  session, reaches `Sessions.cancelPausedAtRest`, which refuses it, and the window states "The run is no longer
  cancellable." So clause 15's "every confirmed 'Cancel the run?' is clause 3's explicit cancel" does nothing on this
  one surface while the session rests — a departure from clause 15, which OQ-108's audit of clause 15 cross-cites. The
  behaviour predates revision 4, but a root drawn `paused` makes the offer look available. The button is kept, since
  withholding it would narrow REQ-SHELL-075(g). Found by the merged build's review. The Workspace's agents header now
  offers a live agent's Cancel only while its run is active, as the inspector already did; it had offered it with no
  run, and the engine refused. It offers a paused agent no Steer, as the inspector offers none (OQ-100).
- **The command.** `session.control`'s `cancelAgent` with no run behind the session goes to
  `Sessions.cancelPausedAtRest`. It is refused (`{ok: false}`, which the renderer states as "not cancellable",
  REQ-MONITOR-128) for the run's id or the root's, an id that is no child of the open iteration, and a child neither
  `paused` nor left by a crash; a refusal records nothing, and those are judged before the lock is taken, so none of
  them claims or reaps it. It is refused too when the chosen child's own move to `cancelled` fails, and then nothing
  below it is cancelled and nothing has been written: an illegal move is refused as "not cancellable", and a failed
  store write as `store_failed` (below). A descendant whose own move fails is warned of and left where it stood, to
  resume with the rest, and the chosen child's cancel stands. It is refused, writing nothing, under a store failure, as
  every continue is (`store-failed`, OQ-103): nothing can be recorded of the session until the reopen rebuilds the
  writer. It is written under the session's lock (ADR-0005), which it does not
  otherwise hold: a run releases the lock at its teardown, so a session paused in this process holds none. The cancel
  takes the lock for its write and gives it back after, keeps it when this process already holds it (a session loaded
  here), reaps a dead holder on this machine as loading a session does — through the one copy of that rule,
  `claimLockReaping`, which never reaps a holder whose pid is no positive integer — and is refused while another live
  process holds it — one that has loaded the session, or is resuming it — so it never writes into a session another
  instance owns. The refusals that say nothing of the agent carry the engine's words, which the renderer states in
  place of "not cancellable": `session_locked`, "Another process holds this session, so the agent was not cancelled.",
  only when the lock is held by another live process; and `store_failed` for a store failure — "The workspace store
  requires recovery before an agent can be cancelled: …" when one is found first or the chosen child's move fails to be
  written, and "The workspace store could not take this session's lock, so the agent was not cancelled: …" when
  reading or claiming the lock throws, where no other process is involved. Every other refusal states none, and the
  renderer's fallback is REQ-MONITOR-128's "no longer cancellable" ("That agent is no longer cancellable." since
  2026-09-29 under R-067, with the repair of
  [`cancelling-one-agent-is-not-shown-cancelled-until-the-engine-answers.md`](../../defects/fixed/cancelling-one-agent-is-not-shown-cancelled-until-the-engine-answers.md);
  *until then "That agent is not cancellable (unknown, or already finished)."*). **This departs from REQ-MONITOR-128**, whose refusal sentence — "an error message states that the agent
  is no longer cancellable" — clause 16 does not govern: the directive names REQ-MONITOR-128 for the confirmation only.
  The build reads the requirement's sentence as written for an agent the run no longer has, and states the engine's
  words where the refusal is the store's or another process's, because "no longer cancellable" would be false of a
  paused child that stays cancellable once the store is restored or the other process lets the session go. Pinned in
  `children/children.test.ts` ("the cancel is made under the session's lock": the holder, a lock the store could not
  read, and a failed write of the chosen child) and `run/crash.test.ts`. *Until the merged build's twelfth review round
  every refusal read "That agent is not cancellable (unknown, or already finished).", false of a paused child the store
  or another process's lock stood in front of. Until the thirteenth a store error while taking the lock was refused as
  `session_locked`, "Another process holds this session", with no other process involved, and a failed write of the
  chosen child's move still read "not cancellable"; and this bullet presented the engine's words as keeping
  REQ-MONITOR-128 rather than departing from it.*
- **A crash not yet recorded — left to the next repair or continue.** A child a crash left unfinished, the crash not
  yet recorded (`crashLeftOf`), presents `paused` (OQ-100) and so is offered Cancel, but it is stored `running`,
  `queued` and so on. The cancel ends it, and each descendant the crash left or a rest paused, `cancelled` from the state
  it is stored in, as clause 3's "cancellation of one agent" ends its agents — and records nothing of the crash: no run
  is about to start and nothing is repaired or continued, which is when clauses 3 and 8 record one, and clause 18's
  "records the crash first" names the Continue action and "continue without them", not the cancel. So the open
  iteration's interruption stays NULL, the other agents the crash left stay as stored (still presenting `paused` by
  `crash`), the stored pending approvals stay listed — one for a cancelled agent too, which nothing can answer — and
  the background sessions still marked running stay so; the next repair or continue records all of it, and pauses only
  what is still unfinished. The one thing written of the crash is what no later record reaches: a crash record answers
  the calls of the agents it pauses, and a cancelled agent is terminal, so the cancel answers the cancelled agent's own
  calls the crash cut off as interrupted, their rows settling (`answerOpenCalls`, REQ-SESSION-129: no row is left
  `running`). A cancelled crash-left agent keeps a NULL `interruption` and `resume_state`. *The first build recorded the
  whole crash record first, at the cancel — a departure from clauses 3 and 8 taken as the cross-lane contract of R-065's
  build; the merged build's review found that a reading departing from nothing was available, and it replaced it
  ([`cancelling-one-crash-left-child-records-the-whole-crash.md`](../../defects/fixed/cancelling-one-crash-left-child-records-the-whole-crash.md)).*
- **What it cancels.** The child and every `paused` descendant at any depth, including one below a descendant that had
  already finished; a finished descendant is left as it is, and a crash-left one is cancelled as above. Each moves
  `paused` → `cancelled` by the cancellation path, keeps its `interruption` and `resume_state` (as the decline does),
  and gains the live cancel's report — "The user cancelled this child." or "Cancelled with <name>, which the user
  cancelled." — its artifact (REQ-LIBRARY-092), and a `child_user_cancelled` entry whose message adds "while the session
  rested". Nothing else is written: the iteration, its task and the todo stay as they are, and the parent learns of the
  cancel when it resumes, as of any child that ended unobserved (REQ-ORCH-054).
- **Background sessions.** A cancelled agent's background terminal sessions are left as a live cancel of one child
  leaves them, for the next stop, quit or crash to end (clause 10, REQ-TOOLS-111).
- **The cascade note.** For any agent it counts every unfinished descendant its cancel ends, live and paused, through a
  finished one (OQ-100). For a paused child at rest those are its paused descendants — "Cancelling cascades to 1 paused
  descendant." — since at rest every unfinished descendant is `paused`. REQ-MONITOR-064 counts live descendants only and
  would leave that note empty; the build departs from it, as it does for a live agent's paused descendants (OQ-100).
  While a run is still `pausing`, a paused child a persona window cancels (REQ-SHELL-075(g) offers it Cancel always)
  reaches the live run's cancel, which also ends a descendant whose in-flight call has not yet let it rest; the note
  then says "live and paused", so the confirmation never understates what the engine ends.
- **The confirmation.** Titled "Cancel <name>?", it gives one line per descendant cancelled with it — the set the
  cascade note counts — and states that it cannot be undone, that the agent will not resume (clause 3's "final"), and
  which descendants are cancelled with it by the same adjective ("paused", or "live and paused" in a `pausing` run);
  with no descendant cancelled, that the other paused agents resume when the session continues. Its dismissal reads
  "Keep it paused" rather than "Keep running", on the Workspace and in a persona window through `AgentCancelConfirm`
  (its own module beside the cancel rules, the run's cancel on the Workspace included), whose props take no label a call
  site could override; a test over both call sites' source fails when either takes the labels itself again. The Mission
  view's own confirmation names the agent and its persona and then states the paused child's cancel in the shared words
  (`missionCancelBody`, from `pausedCancelWith` and `PAUSED_CANCEL_ALONE`: "Cancellation cannot be undone: the agent will
  not resume, …") since 2026-09-29 under R-067, with the repair of
  [`the-mission-views-paused-child-confirmation-omits-that-it-cannot-be-undone.md`](../../defects/fixed/the-mission-views-paused-child-confirmation-omits-that-it-cannot-be-undone.md);
  *until then it only added "and will not resume" to its own sentence, and never said the cancel cannot be undone*. It
  takes its title and both buttons from the same `cancelConfirmation` (`missionConfirmation`). The confirmation describes the session as it was
  when Cancel was pressed: a continue confirmed in another window before this one is answered sends the cancel to the
  live run, which cancels every unfinished descendant rather than the paused ones listed — the same window a live
  agent's confirmation has when its descendants change under it.
- **A dependent of the cancelled child.** The at-rest cancel runs no scheduler pass, so REQ-ORCH-048's cascade, which
  a live cancel's pass runs at once (`IterationChildren.cancel`), does not reach an agent whose `depends_on` names the
  cancelled child. That agent is neither the child nor its descendant, so it stays where it stood — `paused` with the
  resume state `waiting_on_dependencies`, or, left by a crash not yet recorded, stored `waiting_on_dependencies` and
  presenting `paused` (OQ-100). It stays in the Continue action's count, which drops by exactly as many as were
  cancelled, as clause 16 says, and the confirmation's "the other paused agents resume when the session continues" is
  literally what happens to it: the Continue action resumes it (`child_resumed`), and the resumed run's first scheduler
  pass blocks it (REQ-ORCH-048). It does no work, and it gets no report
  ([`a-child-blocked-by-its-dependency-gets-no-report.md`](../../defects/fixed/a-child-blocked-by-its-dependency-gets-no-report.md),
  which a live cascade reaches too). *Corrected 2026-09-29 (R-067): "it gets no report" held until then. The cascade now
  stores its `blocked` report, naming the dependency and how it ended, with its `child_report` artifact, before the
  root is told; pinned in `children.test.ts` ("a dependent of the cancelled child (OQ-101) is blocked by the resumed
  run's first pass …").* So the count overstates by the dependents the resumed run will block at once.
  Blocking them at the cancel would make the count drop by more than were cancelled and would move an agent clause 16
  does not name, so the build does not. Pinned in `crash.test.ts` ("a dependent of the cancelled child stays counted
  …", `paused` and the recovery state). Found by the merged build's ninth review round.
- **Not built.** REQ-MONITOR-128's optimistic display: the surfaces wait for the republished record, for this cancel as
  for a live one.

**What a ruling decides.** Whether a crash-left child should be cancelled from its stored state as built, with its own
calls the crash cut off answered at the cancel, or be offered no Cancel until the crash is recorded. Whether a cancelled
paused agent's running background sessions should end at the cancel, since it will never resume. Whether REQ-MONITOR-064
should be named as narrowed for the paused count. Whether the recovery state's cancel should also repair the session's
status. Whether the resting run-level agent should offer a Cancel that declines the iteration, and whether a persona
window on the run's own instance should withhold its Cancel while the session rests rather than confirm one the engine
refuses. Whether the at-rest cancel should block, at the cancel, each agent whose `depends_on` names a child it cancels,
as the live cancel's pass does (REQ-ORCH-048), counting them out of the Continue action's count and naming them in the
confirmation, or leave them for the resumed run to block, as built. Whether a refusal by the store or by another
process's lock should state the engine's words, as built, or REQ-MONITOR-128's "no longer cancellable", which the
requirement prescribes for a refusal and clause 16 does not displace — and, if the engine's words, whether a store error
while taking the lock should read as the store's failure, as built, or as a refusal of its own.
