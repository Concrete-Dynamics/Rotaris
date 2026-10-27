# Open questions — Specification questions (18 of 27)

Part 23 of 68 of the [open-questions record](../open-questions.md), which indexes every part. Holds OQ-106 – OQ-109.

**OQ-106 — Whose root is "the iteration's root" when the handoff is built for an iteration that has not started?** *(`PD-ORCH-005` clause 20 over REQ-SESSION-115, with clause 16 and `PD-ORCH-003` revision 2; REQ-ORCH-153, REQ-ORCH-154, REQ-LIBRARY-092, REQ-LIBRARY-093 and REQ-LIBRARY-096, which the directive does not name. Raised 2026-09-28 by building `PD-ORCH-005` revision 4 under [R-065](../../product/requests.md#r-065). Numbered OQ-79 while it was built; renumbered when it reached `main`, where OQ-79 had been taken meanwhile.)*

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** every reading built is confirmed, and `PD-ORCH-005` revision 6 states them in clause 28: "the iteration's root" is the root of the most recent recorded iteration, known by its task id; work after a plan cycle that parked later prefers no root, the plan cycle after a resumed iteration included; a plan cycle that never parked leaves no mark; a root whose every publish is superseded published none; the handoff is read once, at the continue; and a cancelled child's stub counts as an artifact of any kind.

Clause 20 makes REQ-SESSION-115's artifact "the latest artifact the iteration's root published that nothing supersedes"
and, when the root published none, the latest of any kind. Every continue builds the handoff, including one that resumes
an open iteration, but it reaches a model only when a new iteration starts — a new prompt, a continue that finds nothing
open, "continue without them", the plan gate's approve, or the iteration after a resumed one — since a resumed root is
handed the new message alone; and that new iteration's root has published nothing yet. The clause does not say which
iteration it means. Three further edges meet it: a plan cycle's root (REQ-ORCH-153's iteration 0, never recorded as an
iteration), a root from before the iterations were recorded (v23), and a later iteration of the same run, which starts
from the launch content computed when the run began.

**What the build proceeds under.**

- **The iteration is the most recent recorded one**, open or closed — the highest-numbered row in `iterations`, the
  iteration the new one follows. A publish by an earlier iteration's root counts only as "of any kind". The alternative
  read "the orchestrator" as a role — the latest publish of any iteration's root — and was not taken, because the
  clause names one iteration's root.
- **The root is known by its task id.** A root's publish carries its task id as the artifact's `conversation_id` (its
  own tool port writes it; a child's report and a child's publish carry the child's), and the iteration's row records
  that id. `created_by` is not used: every iteration's root records the one canonical name its persona gives, so it
  cannot tell one iteration's root from another's. *As built on 2026-09-28 every root recorded its persona there
  (`a-roots-publish-names-its-persona-as-its-author.md`); since that repair (2026-09-29, R-067) it records the root's
  canonical name, as REQ-LIBRARY-093 asks, which is no more distinct across iterations, so the reading stands.*
- **A plan cycle's root is not an iteration's root.** Its publishes count only as "of any kind"; the approve path
  carries the plan itself in its own section.
- **Work that follows a plan cycle follows no iteration.** A plan cycle is never recorded as an iteration, so on the
  plan gate's approve and revise, and on a prompt after a declined plan, the most recent `iterations` row belongs to
  an earlier piece of work. Taking its root there would hand over that earlier work's document ahead of everything
  the plan cycle produced — its children's reports and the plan its root published — although the new work follows
  the plan cycle, not that iteration. So when the latest plan cycle opened its gate (`plan_cycles.opened_at`) after
  the latest iteration opened, no iteration's root is preferred and the handoff takes the latest of any kind that
  nothing supersedes. A prompt that opens a plan cycle on a re-armed session (`PD-ORCH-003`) is handed the latest
  iteration's root's document, since that plan cycle follows it; and once the approved iteration opens, its root is
  preferred again. The two instants are the session writer's own ISO times, so an equal pair (possible only under
  a stopped test clock) counts the iteration as the later.
- **The plan cycle `PD-ORCH-003` revision 2 holds after a resumed iteration is taken the same way, although it
  follows the same piece of work.** There the premise above does not hold: the most recent `iterations` row is the
  resumed iteration of the run that is still under way, and the plan cycle plans the work it left pending. A resume
  never rewrites `iterations.opened_at` (it records only the interruption's clearing), so that plan cycle always opened
  after the iteration, and the approve or revise relaunch prefers no root: the resumed root's own document counts only
  as "of any kind", and a later record — the plan cycle's own plan, a plan-cycle child's report, or a cancelled
  child's stub from clause 16's at-rest cancel — is handed over ahead of it (the decline writes no such later stub: a
  run that resumed the iteration did not decline it, and an earlier decline wrote its stubs before this iteration
  opened). The build keeps the one
  rule because the new work still follows the plan cycle, whose plan the approve carries in its own section; the
  alternative — prefer the resumed root's publish when the plan cycle was held after that iteration, since both
  belong to one run — was not taken, because the clause names the iteration the new one follows and nothing
  distinguishes the two plan cycles in the record except the order of the two instants. Found by the merged build's
  review.
- **A plan cycle that ended before its gate leaves no mark, so the work after it follows the earlier iteration.** The
  `plan_cycles` row is written only when the run parks at the gate (`SessionWriter.openPlanGate`). A plan cycle
  stopped, quit, crashed or failed before its root answered with a plan leaves none, so the next continuation finds
  the latest iteration the most recent record and prefers its root's document, ahead of anything that plan cycle's
  root or children published, although the new work follows the plan cycle. The code does what the rule above says;
  the rule's premise — that the record shows a plan cycle came after the iteration — does not hold here. The build
  keeps it: nothing in the record says a plan cycle ran, and adding a mark for an unparked cycle is a store change no
  directive asks for. Recorded at the merged build's eighth review, from the record lane's final-round nit.
- **A root with no recorded iteration or no tool port** (before v23, or a run with no tool port) has no publish to
  find, and the handoff takes the latest of any kind. Nothing is backfilled.
- **A root whose every publish is superseded published none.** Only artifacts nothing supersedes are candidates, so
  when a later record (a child's included) supersedes each of the root's publishes, the handoff takes the latest of any
  kind that nothing supersedes. The literal alternative — the root did publish, so the fallback does not apply and no
  artifact is carried — was not taken: it would carry nothing where an unsuperseded artifact stands.
- **The handoff is read once, when the continuation starts its run.** REQ-SESSION-115's handoff is "the payload handed
  to the run", built at the continue, and clause 20's "that nothing supersedes" holds of it then. A later iteration of
  the same run is not a new handoff: it is re-sent the launch content computed at the continue — the base of every
  iteration, which the repair of
  [`every-iteration-is-sent-the-prompt-the-run-was-launched-with.md`](../../defects/fixed/every-iteration-is-sent-the-prompt-the-run-was-launched-with.md)
  (2026-09-29) kept, adding only the iteration's own task after it — so **its artifact line can name an artifact
  superseded since, or another agent's where the resumed root published its first artifact after the continue**, as
  its todo and progress lines can be stale. The plan cycle held after a resumed iteration (`PD-ORCH-003` revision 2)
  is sent the same stale payload, whose artifact line was read before the resumed root published anything (OQ-104, "The
  handoff after the preamble is the continue's"). The artifact line is not recomputed alone, and `PD-ORCH-004` revision
  4 adds only the open offers to that first message. *Until that repair this bullet said the payload was re-sent by
  that defect and that its repair, which had to keep the three flows it names, would settle the staleness; the repair
  kept those flows by keeping the payload as every iteration's base, so the staleness stands on this reading and the
  ruling question below.*
- **A cancelled child's stub report counts as "of any kind".** A cancelled agent's report is stored as an artifact
  (REQ-LIBRARY-092), and clause 16 (OQ-101) adds a route that writes one every time: cancelling a `paused` child while
  its session rests. When the iteration's root published nothing, the handoff then carries that stub ("The user
  cancelled this child.") as the authoritative artifact, ahead of every earlier substantive report. This happens on
  "continue without them" and on the iteration that follows a resumed one. The clause's literal text allows it, and a
  live cancel could already do the same. The build does not filter by outcome, because the clause names no outcome.
  Found by the merged build's review.
- **Everything else stands as OQ-99 records it**: "latest" is the listing's order (created time, then id), a
  superseded record is never chosen, and the rendering (id first, 80-character title, a published body stated once,
  6,000 characters) is unchanged.

**What a ruling decides.** Whether "the iteration's root" is the root of the iteration the new one follows, as built,
or any iteration's root of the session, which would carry an earlier iteration's document forward past a later
iteration whose root published nothing; whether work that follows a plan cycle takes the latest of any kind, as
built, or prefers the plan cycle root's own publish, or the root of the last recorded iteration — the reading this
build first took, which handed an earlier piece of work's document over ahead of the plan cycle's; whether the plan
cycle `PD-ORCH-003` revision 2 holds after a resumed iteration of the same run is taken the same way, as built, or
prefers that resumed root's own publish over what the plan cycle produced; whether a plan cycle that ended before its
gate should also stop the earlier iteration's root being preferred, which needs a record of a plan cycle that never
parked; whether a root whose every publish is superseded counts as having published
none; whether a later iteration of the same run should have its handoff's artifact read again when it starts,
rather than be re-sent the one read at the continue, superseded or not; and whether the fallback of any kind should pass
over a cancelled agent's stub report, which clause 16's at-rest cancel writes every time.

**OQ-107 — Which offers is a later iteration's root told, where in its first message, and which roots count?** *(`PD-ORCH-004` revision 4; REQ-ORCH-088, which the directive narrows, REQ-TOOLS-152, which it extends, and REQ-SESSION-115, REQ-SESSION-194, REQ-ORCH-067, REQ-ORCH-072 and REQ-ORCH-153, which it does not name. Raised 2026-09-28 by building `PD-ORCH-004` revision 4 under [R-065](../../product/requests.md#r-065). Numbered OQ-80 while it was built; renumbered when it reached `main`, where OQ-80 had been taken meanwhile.)*

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** every reading built is confirmed, and `PD-ORCH-005` revision 6 states them in clause 29: `PD-ORCH-004` revision 4's "once" is once per root, and a re-sent handoff's stale lines are left as they are.

Revision 4: every root that may take up an open offer "SHALL be told of it, once", and among them "the root of each
later iteration of the same run, in that iteration's first message". It does not say whether "once" is per root or per
offer, where in the first message the list sits, what a later iteration of a continuation run is told beside the
handoff it is re-sent, or whether a plan cycle's root is such a root.

**What the build proceeds under.**

- **Once per root.** Each iteration's root is a different agent, so the root of iteration 2 is told an offer even
  though the root of iteration 1 was. A root is told an offer once: the list is part of its first message, so its
  record holds it, and a continue that later resumes that root finds it there (`offersToldIn`) and does not tell it
  again.
- **The same rule for every execution root.** The first message of every execution iteration's root carries the open
  offers — every offer of the session no child has taken up, not a subset by iteration — that the message's launch
  content does not already hold. The root of a new session's first iteration has none to be told. A continuation's
  first iteration reads them all in its handoff and is told nothing more. Each later iteration of the same run is told
  those raised since, including any a resumed first iteration raised.
- **An offer a held list left out is held.** A list names the newest ten and, when there were more, says the earlier
  ones were left out; that is the whole of what the directive tells a root, so an offer a list left out is not named
  again in a second list beside it. An offer a list could not have named — raised since it was built — is still told,
  the newest ten of those with the same elision line, whichever child raised it and however early it was spawned.
  - *In an iteration's first message.* The session manager passes the run the offers open when the payload's handoff
    was built (`handoffOffers`), and those are held: the handoff covers them, named or left out.
  - *At the continue that resumes a root.* The record keeps the lists, not what each covered, so an offer is held by a
    list recorded as a message when its child was spawned before the oldest offer that list names and the record shows
    it raised — its child ended, `completed_at` — no later than the list was recorded; an offer with no end recorded
    counts as raised before. An offer raised in the same millisecond a list was recorded counts as held by it. A list a
    compression carried into the conversation holds only what it names, as a compression's summary of a list holds
    nothing (OQ-99).
  - *The first repair counted every offer spawned before a list's oldest line as held, and only in the first message:
    the continue that resumed a root named the offers its list had left out, and an offer raised after a handoff was
    built by a child spawned early was never told to any later root of the run (found by the iteration lane's second
    review).*
- **Where.** A text part of its own after the launch content — its text and any attachments — in the same first user
  message, so the root reads it as part of its task. It is the same list, header, lines, newest ten and elision line
  as the handoff's and the resumed root's, so a later reader recognises it.
- **The re-sent handoff is left as it is.** A later iteration of a continuation run is re-sent the payload built at
  the continue, whose list can name an offer taken up since (OQ-106's "The handoff is read once", which the repair of
  [`every-iteration-is-sent-the-prompt-the-run-was-launched-with.md`](../../defects/fixed/every-iteration-is-sent-the-prompt-the-run-was-launched-with.md)
  kept; *until that repair this bullet called it the behaviour that defect records*). Those lines are not rewritten; an offer the payload already names is not named again, and one taken up since
  is refused at admission with "already continued by".
- **A plan cycle is told none.** A plan cycle is not an iteration (REQ-ORCH-153) and its root takes up no offer
  (OQ-99), so neither a plan cycle at a run's start nor one held after a resumed iteration (`PD-ORCH-003` revision 2)
  has the list added; a continuation's plan cycle still reads the handoff's list, as before.
- **The root's execution record keeps its task.** REQ-ORCH-072's task payload on the root's record is the task string,
  as before; the list is in the conversation record only.

**What a ruling decides.** Whether "once" means once per offer across the run, so a root whose predecessor in the same
run was told an offer is not told it again; and whether the stale lines of a re-sent handoff should be rewritten rather
than left beside a fresh list.

**OQ-108 — What does the audit of clause 15, clause 19, PD-CHAT-001 revision 4 and PD-CHAT-002 revision 2 leave undecided?** *(`PD-ORCH-005` clauses 3, 9, 11, 15 and 19 (revision 4), clause 15's "whichever surface asks it" being departed from on one surface by OQ-101's reading; `PD-CHAT-001` revision 4, "The strip" and "The paused continues"; `PD-CHAT-002` revision 2; REQ-TOOLS-063 and REQ-CHAT-029, which `PD-ORCH-005` narrows, REQ-CHAT-005, which `PD-CHAT-001` narrows, and REQ-CHAT-101, which `PD-CHAT-002` narrows; REQ-TRACE-464, which the reading below departs from; and REQ-CHAT-021, REQ-CHAT-169, REQ-MONITOR-004, REQ-MONITOR-131, REQ-SESSION-186, REQ-TRACE-469 and REQ-SHELL-075, which the directives do not name. Raised 2026-09-28 by building `PD-ORCH-005` revision 4, `PD-CHAT-001` revision 4 and `PD-CHAT-002` revision 2 under [R-065](../../product/requests.md#r-065). Numbered OQ-81 while it was built; renumbered when it reached `main`, where OQ-81 had been taken meanwhile.)*

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** every reading built is confirmed, and `PD-ORCH-005` revision 6 states them in clause 30: a stop during a plan cycle withdraws its pending approval or question by `stop`, as a quit does by `quit`, and persists a stop's `paused` with the neutral summary; REQ-TRACE-464 is narrowed by clause 3's quit, so a board run caught by the quit rests resumable, and joins the directive's Narrows list; the persona window's Cancel at rest stays as OQ-101 rules it; and the "Command not run" notice and the refusal line keep their places.

Most of what these rulings decide was already built under OQ-96 and OQ-98's readings. The audit found one behaviour the
text contradicts: a board run caught by the application's quit came to rest by `stop`
(`docs/defects/fixed/a-board-run-caught-by-a-quit-rests-as-a-stop.md`). It also found two strings the rulings fix:
`/stop`'s description and the paused continue's `Send`. What the text leaves open concerns a plan cycle's waits at a
stop, the literal reach of "no other control stands outside the dock", REQ-TRACE-464's word "cancel", and a few names
the build kept.

**What the build proceeds under.**

- **A wait inside a plan cycle at a stop or a quit.** Clause 15 says a stop or a quit during a plan cycle "ends the
  cycle's agents and records no interruption". Its last bullet, which it decides "in each case", has the quit withdraw
  an approval its dialog closes (clause 9), and PD-CHAT-002 revision 2 has the quit withdraw a question. Neither makes
  an exception for a plan cycle, and a withdrawal names its own cause, apart from the agents' and the iteration's
  interruption. So an approval or a question pending in a plan cycle when the quit lands is **withdrawn by `quit`**
  (`Run.waitsWithdrawnBy`, which reads the stop request alone and never the plan hold, so the waits' release does not
  depend on when a plan cycle holds the run), while the cycle's agents still end `cancelled` and nothing records an
  interruption. The
  text decides the quit; the build reads the stop the same way, because clause 9 names the stop beside the quit and
  clause 15 puts the two together for a plan cycle: a wait pending in a plan cycle when a stop lands is withdrawn by
  `stop`. The explicit cancel still cancels it (clause 3: it is final), and so does a stop the run raised itself. *The
  first reading built, and superseded in the same round by the review: the pending wait was cancelled
  (`cancelPending`), on the ground that "a withdrawal is recorded by the interruption that caused it, and a plan cycle
  records none". That ground confused the wait's cause with the agents' interruption, and the directive's words govern
  the quit's case.* A stop or a quit at a *parked* gate has no turn in flight and nothing waiting.
- **A stop during a plan cycle, as the session shows it.** The cycle's agents end `cancelled` with their reports, no
  iteration row exists, and `plan_released` stays 0, so the next prompt or continue is held again. The session persists
  `paused` (REQ-SESSION-186's persisted status for a stop). Its result's summary reads "The run came to rest because a
  person stopped it.", because the summary is classified from the stop reason alone. *Since 2026-09-29 (R-067, OQ-118)
  it reads "The run came to rest at the user's request.", the one message every rest a person asked for gets.* Both are
  kept. The status is what
  a stop persists, and the wording describes the run, not an agent left to resume.
- **"No other control stands outside the dock."** The sentence governs the run-state notices it names and the strip's
  input controls. Three controls outside the dock and outside the notices row stay where they are, because each
  belongs to a surface the directive does not name: REQ-CHAT-021's "Command not run" notice with its dismiss, above the
  dock; the refusal line with "Open project setup", above the dock; and REQ-CHAT-169's attachment list with its Remove
  buttons, below the dock.
- **The names the build kept.** `/stop` is offered as "Stop the active run" and still sends the control op `cancel`,
  which is REQ-MONITOR-004's enumeration. The op is not renamed, and REQ-CHAT-029's "MUST cancel that run" is read
  through clause 15's narrowing. The paused strip's continue by message draws its own accessible name ("Continue with
  a message") and shows `Send`. The send pill's `sendName` arm for a paused session, which the strip never draws, is
  left as it stands. `PD-CHAT-001` revision 4 gives the word's source as "the send pill it stands in for", but the
  built pill never shows `Send`: its visible word is `Run`, `Continue` (any existing session at rest, a paused one
  included) or `Queue` (`sendShortLabel`, REQ-CHAT-005). The build draws `Send` because the directive names it, and
  reads the stated source as the directive's rationale rather than a rule that would make the word `Continue`.
- **"Whichever surface asks it" — one surface it does not reach.** Clause 15 makes every confirmed "Cancel the run?"
  clause 3's explicit cancel, whichever surface asks it. A persona window on the run's own instance offers Cancel
  always (REQ-SHELL-075(g)) and, while the session rests, asks "Cancel the run?" of a root drawn `paused`; the engine
  refuses the cancel with no run behind the session, and the window states "The run is no longer cancellable." So on
  that one surface, at rest, the confirmed question cancels nothing. The departure, its reason and its ruling question
  are OQ-101's ("Where it is offered").
- **The board's quit.** Main's board coordinator ends its runs at the last window's close with the run host's
  `announceShutdown` (REQ-MONITOR-131's shutdown request), renamed `quitAll`, rather than the stop control's `cancel`.
  A stop request keeps its first reason, so the `cancel` sent ahead of the run host's `shutdown` rested the run by
  `stop`. REQ-TRACE-469's unlimited approval wait is still released at once, withdrawn by the quit. REQ-TRACE-464 says
  "Closing the application SHALL **cancel** the run rather than leave it orphaned", and `PD-ORCH-005`'s Narrows list
  does not name it. The build reads the requirement's guarantee as the clause's own last words — the run is ended, not
  orphaned — and ends it as every quit ends a run, clause 3's quit: its agents rest `paused`, its iteration stays open,
  and a later continue resumes it. The word "cancel" is not met literally, and was not before the repair either (the
  stop's `cancel` rested the run by `stop`); nothing met it as the explicit cancel. So this is a departure from a
  requirement no directive names, and a back-pointer is owed: either `PD-ORCH-005` names REQ-TRACE-464 among what it
  narrows, or a ruling has a board run cancelled explicitly at the quit.

**What a ruling decides.** Whether a stop during a plan cycle, which the text leaves to clause 9, should withdraw its
pending approval or question as a quit does (the build) or cancel it. Whether REQ-TRACE-464's "SHALL cancel" is narrowed
by clause 3's quit, which would add it to `PD-ORCH-005`'s Narrows list, or a board run is cancelled explicitly at the
quit, final and never resumed. Whether a persona window's "Cancel the run?" at rest should decline the open iteration
as clause 15 reads, or be withheld (OQ-101). Whether the "Command not run" notice and the refusal line should
move into the notices row, a layout change. Whether a stop during a plan cycle should persist a status and a summary of
its own rather than a stop's `paused` and "came to rest".

**OQ-109 — Does a `code_intelligence` entry configured `enabled: false` still make `code-intelligence-setup` applicable?** *(REQ-WORKSPACE-090, REQ-MCP-037, REQ-CONFIG-465, REQ-MCP-040, REQ-WORKSPACE-083. Raised 2026-09-28 by the repair of [`plan-gate-proof-turns-code-intelligence-off-with-a-key-nothing-reads.md`](../../defects/fixed/plan-gate-proof-turns-code-intelligence-off-with-a-key-nothing-reads.md), under [R-062](../../product/requests.md#r-062). Raised as OQ-94 on its branch and renumbered at the merge, OQ-94 to OQ-108 having been taken on `main`.)*

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** confirmed as built: `enabled: false` is not part of what "launchable" means for this task, so a disabled `code_intelligence` entry still makes `code-intelligence-setup` applicable, by availability alone.

REQ-WORKSPACE-090 makes the initialization task applicable exactly when the resolved configuration holds a server
named `code_intelligence` that is launchable, "judged by the one availability rule REQ-MCP-037 fixes", and it forbids
this domain a second rule. REQ-MCP-037's rule looks at the transport and the command, and never at `enabled`. So a
workspace whose entry is disabled still has the task pending on first open, and still runs the bundled runtime's
`project create` in the background. Measured in `plan-gate-proof` on Linux, 1.8 to 10.4 s of work for a server no run
will connect to. REQ-CONFIG-465 says of a disabled entry that "no connection to it is attempted". The setup launches
the runtime's own command line, not a connection to the server, and so falls outside that sentence's letter. Two
readings:

- **availability alone** — `enabled` does not enter applicability. A disabled entry's workspace is still set up, so
  enabling the entry later finds the project ready. This is the letter of REQ-WORKSPACE-090 and REQ-MCP-037.
- **enabled and available** — a disabled entry makes the task inapplicable, like an unlaunchable one. Nothing runs for
  a server the user turned off, which is the spirit of REQ-CONFIG-465 and REQ-MCP-040's "turning a server off is a
  choice". But it is a second input to a rule REQ-WORKSPACE-090 says has only one.

**What the build proceeds under:** the first reading (`apps/desktop/src/run-host/mcp.ts`, `setupApplicable`), because
it is the one the requirements state. The proofs that disable the entry to keep run starts short are unaffected,
because the setup does not delay a run start. **A ruling would decide** whether `enabled: false` is part of what
"launchable" means for this task.
