# Archived open questions — Specification questions (12 of 27)

The ruled, closed, resolved and withdrawn entries of [part 17](../../../architecture/open-questions/17-specification-questions-12.md) of the [open-questions record](../../../architecture/open-questions.md), each moved here whole, under its own anchor, by `pnpm archive:migrate` (`tools/archive/migrate.mjs`); the part keeps one index line for each. Only the script writes here ([the archive](../../../README.md#the-archive)).

<a id="oq-97"></a>

**OQ-97 — How does a resumed iteration carry on where the directive says what and not how?** *(`PD-ORCH-005` clauses 4, 5, 6, 7 and 10; PD-TOOLS-006 revision 2; REQ-ORCH-095, REQ-ORCH-088, REQ-ORCH-152, REQ-HOOKS-075 and REQ-MONITOR-125, which the directive does not name. Raised 2026-09-27 by building `PD-ORCH-005` revisions 2 and 3 under [R-060](../../../product/requests.md#r-060) and [R-061](../../../product/requests.md#r-061). Numbered OQ-70 while it was built; renumbered when it reached `main`, where OQ-70 had been taken meanwhile.)*

Clause 4 restores the iteration's agents "with their identity … and their conversation, and each carries on from its
last message". A continue by message "delivers that message to the resumed root as the user's next message". The
clause fixes the outcome and leaves the mechanism open, and several requirements it does not name meet the resumed
iteration. Open: where an agent's last message is its own answer, what a continued prompt becomes, whether a plan-mode
continue holds, what the iteration's events and hooks say, and how REQ-ORCH-095's re-prompt and REQ-ORCH-088's retry
treat a resumed child.

**What the build proceeds under.**

- **Carrying on from the last message.** A resumed agent whose last message is a tool result, a user message or a
  message delivered at the resume takes a model step over its record. An agent whose last message is its own answer had
  finished its turn and was waiting on children of its own. It resumes into waiting and takes no step until one of them
  ends. A child restored `summarizing` is that case, and it writes its report. A step straight after its own answer
  would ask the model to go on from nothing. A child that had answered and is told of its background sessions at the
  resume (below) takes a step to read the notice, so it moves back `running` rather than `summarizing`, and works, and is
  counted, as a running child (found by phase 4's review).
- **The new message is not a task.** A continue that resumes an open iteration appends no todo task. The message is the
  resumed root's next message, recorded in its conversation at the continue itself, with the images attached to it —
  after the root's notice of its background sessions, so the user's message is the last it reads; a notice the root has
  not yet answered is not recorded again by a later continue — and
  REQ-SESSION-115's continuation payload is not sent (the directive narrows it so). The explicit cancel of that continue
  ends the iteration the message was delivered to, and the message with it: it stays in that iteration's record and in
  the transcript, and is not kept as a task. The iteration's own task is the one
  it holds, and it closes with it. *The first build recorded the message at the resumed iteration's first turn; a rest,
  a quit or a cancel that landed before that turn lost it while the transcript still showed it sent (found by phase 4's
  review).*
- **The resumed root keeps its persona.** A continue that resumes an open iteration is set up as the persona its root
  ran as (`iterations.root_persona`), whatever `default_persona` says now, since clause 4 names persona among the
  identity restored (found by phase 4's review). The persona holds for the whole run, so an iteration the run goes on
  to after the resumed one runs as it too, and a session model override made for the current entry role does not
  reach it. A persona the configuration no longer knows cannot be restored: the run is set up as the entry role, and
  its warnings say so. The root keeps its name all the same: its rows carry the persona `iterations.root_persona`
  records, the name its earlier rows and the crash record read, while each row's `persona` names the entry role it runs
  as. *As first built the resumed root's rows carried the entry role's name, so a crash in its step found none of them
  and answered a call that had completed as never started (`a-root-resumed-under-a-fallback-persona-hides-its-rows-from-the-crash-record.md`,
  repaired 2026-09-29 under R-067).* *That repair's fourth review found the surfaces knew the run-level agent by the
  entry persona alone, so the root's rows fell outside its scope and its persona window while the inspector followed them
  to it, and `Run.entryTools` missed the calls it dispatched under its own name. The session now names its roots, each by
  the name its rows carry and its canonical name (`SessionRecord.entryRoots`), and the run-level agent owns every row,
  call and artifact link they name (`the-run-level-agent-is-known-by-its-entry-persona-alone.md`, repaired 2026-09-29 under
  R-067).* *The first repair refused that continue and named "continue without them"; a crashed session
  cannot take that route, which needs a `paused` one, so it was left no way on (found by phase 4's second review).*
  The pre-flight classifies the continue's message as it classifies any continuation's, and its route, grant and
  playbook reach the resumed agents as they reach the agents of any run.
- **One iteration, one start.** The resumed iteration keeps its number and its root's task id. It emits no second
  `iteration.start`; `iteration_resumed` records the resume. It closes as any iteration does, with `iteration.end`, its
  capture and the hooks' `iteration_end` (REQ-HOOKS-075).
- **Not held at the plan gate.** A continue that resumes an open iteration is not held, even on a session the user
  re-armed. The work it resumes was released before it came to rest, and clause 4 resumes it "before anything else
  runs". A later run of the session is held as REQ-ORCH-152 has it.
- **Which continues resume.** The three routes the clause names: a new message (`Sessions.prompt`), the Continue action
  on a `paused` session (`continueSession`) and a plan decision. Only the Continue action offers "continue without
  them" (clause 6), so declining is an option of `continueSession`. A session a crash left `interrupted` is continued
  by a new message, as today. A plan decision resumes nothing in practice: a run held at the plan gate never resumes an
  open iteration, and one that parks there has closed the iteration it found first, so no iteration is open when the
  plan is decided (found by phase 4's review). The route resumes as the other two would if one were.
- **A continue owns the open iteration from its start.** The run a continue starts holds the iteration it resumes or
  declines before its loop reaches it, so the explicit cancel during its pre-flight ends the agents it would have
  resumed and closes the iteration (see OQ-96).
- **The notice of background sessions (clause 10).** One user message, "You were paused and have now resumed…", lists
  each session the agent had started: still running, with its id, or ended and by what, with its exit code, and its
  last recorded output. Where this process still holds the session, the state is the process's own, since a session
  a pause left running may have ended since. The notice is recorded as part of the agent's conversation, and it counts
  as something said to the agent, so an agent that had answered takes a step to read it.
- **REQ-ORCH-095's re-prompt counts the calls made before the rest.** A child that worked before it was paused, and
  answers without a call after its resume, is not re-prompted. A child whose only call was never run is re-prompted, as
  any child that acted on nothing. The calls are counted from its row and from its record, whichever holds more, since
  a crash writes no count; a call the record answers as never started, with nothing it produced, is not counted, while
  a call whose approval or question was withdrawn was dispatched and is counted, as its row counts it (found by phase
  4's reviews). Calls the record shows and no count held join the session's total at the resume, once. A child restored
  `summarizing` was assessed when it answered, before the rest, and its attempt from the record is not assessed again;
  REQ-ORCH-088's retry from its payload is a new attempt, assessed as any.
- **REQ-ORCH-088's retry starts from the payload.** A resumed child that times out and is retried on its role's
  fallback starts its conversation again from its payload, as every retried child does. The payload's disclosure block
  is rebuilt from the claims as they stand at that moment.
- **The write scope (PD-TOOLS-006 revision 2).** Each resumed child re-claims its stored scope when it resumes, in the
  order the children were first accepted, so the child accepted first still holds a path both scopes match. The store
  lists children accepted in the same millisecond in the order they were inserted; the tie had fallen to their random
  task ids, so two children delegated in one step could swap on resume (found by phase 4's review).

**What a ruling decides.** Three questions. Should the new message also be recorded as a task, so that a resumed
iteration that closes without addressing it leaves the message pending? Should a crashed, `interrupted` session offer
the Continue action, and with it "continue without them"? And should a re-armed session hold its plan gate before the
resume, after it, or not at all — as built, the run that resumes is not held, and neither are the iterations it runs
after the resumed one?

**Ruled 2026-09-28 — by [`PD-ORCH-005`](../../../product/directives/pd-orch-005.md#pd-orch-005) revision 4 and [`PD-ORCH-003`](../../../product/directives/pd-orch-003.md#pd-orch-003) revision 2, [R-064](../../../product/requests.md#r-064).** The owner took every
recommendation.
- A continue's message is also a task, which closes with the resumed iteration (clause 17); REQ-ORCH-004 is narrowed.
- A session a crash left offers the Continue action and "continue without them" (clause 18); REQ-MONITOR-125 is
  extended.
- A resumed iteration is never held at the plan gate, and a gate that would hold the run holds before its first new
  iteration. That is `PD-ORCH-003` revision 2, since that directive already narrows REQ-ORCH-152.

**Built 2026-09-28 under [R-065](../../../product/requests.md#r-065).** The readings above that a continue's message is no
task and that a resumed iteration's run is never held are superseded: the message is a task the resumed iteration holds
(clause 17), a crash-left session offers both continues and the decline (clause 18), and an armed gate holds before the
first new iteration (`PD-ORCH-003` revision 2). Building it raised OQ-102, OQ-103 and OQ-104.

Until they are built, the readings above stand.

**Beside it, 2026-10-01 — which persona the surfaces draw the run-level agent as (not ruled; recorded by the repair of
[`after-an-entry-persona-switch-the-run-level-agent-is-drawn-as-the-first-roots-persona.md`](../../../defects/fixed/after-an-entry-persona-switch-the-run-level-agent-is-drawn-as-the-first-roots-persona.md)).**
This question settles the name a resumed root dispatches under, not the persona the surfaces draw the run-level agent as
once the entry persona has changed between runs (`default_persona` is read for every run, and PD-ORCH-003 lets a plan
cycle run fresh after an iteration). The specification does not state it: REQ-MONITOR-060's stand-in is "the persona's
declared tools", and a session that ran under two personas has two. **What the build proceeds under:** the run-level agent
is drawn as the **latest root** — its name, model, reasoning and stand-in tools are, while a run is live, the persona its
root runs as (`SessionRecord.entryPersona`), and at rest the persona of the transcript's last row a root authored (`agent`,
`tool`, `thinking` or `diff`) that no child carries, a row named for one of the session's roots preferred (`entryRole`,
`packages/ui/src/agents.ts`). That is the persona whose tools its chips show (the live run's root port and history,
`Run.entryTools`; at rest the latest root's history, `entryToolsOf`), and, for a root resumed under a fallback, the role it
runs as (each row's `persona`, above). No requirement was found against it; it is raised as no question of its own. Until
2026-10-01 the first root's persona was drawn; the first repair read the last `agent` row alone, which a live root whose
first steps were tool calls had not written yet (the verifier's finding, repaired the same day).

<a id="oq-98"></a>

**OQ-98 — What does the Continue action count, where does it say so, and which continues offer the decline?** *(`PD-ORCH-005` clause 6; REQ-SHELL-023, REQ-MONITOR-125 and REQ-SESSION-110, which the directive does not name. Raised 2026-09-27 by building `PD-ORCH-005` revisions 2 and 3 under [R-060](../../../product/requests.md#r-060) and [R-061](../../../product/requests.md#r-061). Numbered OQ-71 while it was built; renumbered when it reached `main`, where OQ-71 had been taken meanwhile.)*

Clause 6: "The Continue action SHALL state how many agents will resume, and SHALL offer to continue without them;
choosing that ends those agents `cancelled`, the open iteration closes as cancelled, and the session continues as a
new iteration". Clause 4 restores "its root and every `paused` agent". The clause does not say whether the root is one
of the agents counted, where on the surface the count is stated, or whether the other continue routes offer the
decline too.

**What the build proceeds under.**

- **The count is every agent that resumes: the root and every unfinished agent of the open iteration.** Clause 4
  resumes the root with them, and declining ends the root's iteration too. After a rest the unfinished agents are the
  paused ones; after a crash not yet recorded they are the ones the crash record will pause (clause 8 forbids recording
  it on a read), so the count does not change when the crash is recorded. A session whose root was the only
  unfinished agent states "1 agent will resume". The count is read from the store (`SessionRecord.resumable`,
  `resumableOf`), as the plan gate is, because a session at rest has no process behind it.
- **Where.** In the composer's notices row, below the field and its strip, on a `paused` session, on one a crash left
  `interrupted`, and on one a crash left persisted busy with no run behind it — REQ-CHAT-008's recovery state, which a
  session is in when it is opened after a crash and before any repair, and whose continue by message records the crash
  and resumes the same agents (*the second build left that state out, so the most direct crash path stated no count:
  found by phase 5's second review*). REQ-SHELL-023 places the Continue action in the composer; no screen, tab or panel
  is added. The row holds the count
  as a sentence ("3 agents will resume") in the row's quiet hint style, which describes every continue that resumes
  them — each carries it as its accessible description — and on a `paused` session a compact ghost "Continue without
  them" beside it. The design material draws no paused composer. The row's controls are the mockup's own: the quiet
  hint, and the compact ghost button the session tables draw for "Resume" (*the second build cited the queue card above
  the field as the pattern, which sits in a chrome card with a kicker and is not what the row draws — phase 5's second
  review*). *The first build put the count and the decline in the strip itself; at the product's default window the
  strip then wrapped to three lines, and at 1280×800 the decline sat past its clipped edge (found by phase 5's review,
  measured in the built app).*
- **Against PD-CHAT-001.** Its body still says "The strip SHALL carry every control the composer draws … No control SHALL
  stand on a second chip row outside the dock", while its revision 3 quotes the same words as revision 2's and says
  they "no longer govern". The build reads the notices row as the composer's line for notices — the plan gate's hint and
  the pause's already stand there — and the decline as the count's own action, so neither is a chip row; the owner may
  read the body as still governing, which would put the decline in the strip and bring back the wrap.
- **The two continues' labels.** A paused session's strip draws two continues where the send pill stands, and at their
  full labels ("Continue run", "Continue with a message") the strip scrolled at the full and tight densities — by 8 px
  at a 908 px dock with the configured model and `autonomous` (phase 5's second review, measured). Each now shows a
  short label at every density, as the pill it replaces does, with its full name as accessible name and tooltip:
  `Continue`, which REQ-CHAT-005 as PD-CHAT-001 narrows it already gives the pill, and `Message`, which neither the
  specification nor the glossary has — put to the owner. With them the paused strip fits at every density from a
  548 px dock to a 968 px one with the configured model; a model id as long as revision 3's own example still scrolls
  the full-density strip, idle or paused, since full density shows every value. *The first repair shortened them at
  the narrow density only, which extended revision 3's enumerated rules and left the other two densities scrolling.*
- **Declining is confirmed.** It ends the paused agents `cancelled`, which clauses 3 and 5 make final, so it asks first,
  as the two other controls that end agents `cancelled` do (REQ-MONITOR-126, REQ-MONITOR-128), stating what ends and that
  it cannot be undone (found by phase 5's review).
- **Which continues offer the decline.** The Continue action only. A continue by message resumes (clause 4: the
  message goes to the resumed root) and offers no decline; a plan decision resumes as OQ-97 has it. A session a crash
  left `interrupted` is continued by a message, as today: it states the count, and offers no decline (OQ-97's second
  question stands).
- **What the decline carries.** `session.continue` gains an optional `withoutPaused`; absent, the Continue action
  resumes, which clause 6 makes the default.

**What a ruling decides.** Whether the count should name only the paused agents, leaving the root out. Whether the
decline should also be offered beside "Continue with a message", so a message can start a new iteration over a
declined one. Whether PD-CHAT-001's body still keeps every composer control in the strip. What the message continue's
short label should be, if not `Message`. And whether the design material should draw the Continue action's paused
state, which it does not.

**Ruled 2026-09-28 — by [`PD-ORCH-005`](../../../product/directives/pd-orch-005.md#pd-orch-005) revision 4 and [`PD-CHAT-001`](../../../product/directives/pd-chat-001.md#pd-chat-001) revision 4, [R-064](../../../product/requests.md#r-064).** The owner took every
recommendation.
- The count includes the root, and "continue without them" is offered beside the Continue action alone, as built
  (clause 19).
- `PD-CHAT-001`'s body is revised: a notice and the action that belongs to it stand in the notices row below the dock.
- The message continue's short label is `Send`, from the send pill it stands in for.
- The design material is asked to draw the composer's paused state (`docs/design/README.md` §3.2).

**Built 2026-09-28 under [R-065](../../../product/requests.md#r-065).** The count and the decline stand in the notices row, a
crash-left session shows them as a paused one does, and the message continue reads `Send`. Building it raised OQ-103 and
OQ-108.

Until they are built, the label reads `Message`.

<a id="oq-99"></a>

**OQ-99 — Which artifact is REQ-SESSION-115's "latest orchestrator artifact", and how does a later root take up an offer?** *(`PD-ORCH-004` revision 3; REQ-SESSION-115, which `PD-ORCH-005` narrows for a resumed iteration and which nothing narrows here, and REQ-TOOLS-155, which the directive does not name. Raised 2026-09-27 by building `PD-ORCH-004` revision 3 with `PD-ORCH-005` under [R-059](../../../product/requests.md#r-059), and by the repair of `the-continuation-payload-says-no-artifact-is-recorded.md`. Numbered OQ-72 while it was built; renumbered when it reached `main`, where OQ-72 had been taken meanwhile.)*

REQ-SESSION-115's handoff carries "at most 6000 characters for the latest orchestrator artifact against an
8000-character artifact baseline". The session's artifact store holds child reports and the documents agents
published. The built-in orchestrator publishes no artifact of its own, so no record of a default configuration is an
"orchestrator artifact" by author. PD-ORCH-004 revision 3 keeps an offer open until it is taken up once, "by the agent
that delegated the child while that agent runs, or, in a later iteration or a later run of the session, by that
iteration's root agent". It does not say which iteration's children count as "left" for a resumed iteration, which
keeps its number across runs, nor how a later root learns an offer exists.

**What the build proceeds under.**

- **The artifact.** The latest record of the session's store that nothing has superseded, of any kind. It is where
  the run's work is recorded, and the handoff states it in place of the placeholder that claimed none existed. It is
  rendered as its id, title, kind and status — the id first, so no cut reaches it (REQ-SESSION-194) — then its summary
  and key findings, cut to 6,000 characters without splitting a character. A published document is stated once, as its
  body: its summary is its body's first line and its key findings its body (REQ-LIBRARY-093). The 8,000-character
  baseline is not applied: nothing larger is assembled before the cut. A session with none says so. "Latest" is the
  last created, in the listing's own index order (REQ-LIBRARY-096), so artifacts created in the same millisecond — a
  cancellation writes several reports at once — fall to their ids, a stable order but not the order they were written.
  *The first repair broke that tie by insertion order, which cost the index's order (a sort per read, found by phase 6's
  second review).* Two more limits were found by phase 6's review; one stands, and the first stood whole until 2026-09-29 ~~Two more limits stand, both found by phase 6's review~~: a report re-materialised in place keeps its creation time (REQ-LIBRARY-092), ~~so a later iteration's report
  that reuses a canonical name does not become the latest (and overwrites the earlier one:
  `a-reused-canonical-name-overwrites-an-earlier-iterations-report-artifact.md`)~~ *(true until 2026-09-29: since
  OQ-113's amendment was built, a later iteration's report that reuses a canonical name is an artifact of its own and
  becomes the latest, and only the same task's report is re-materialised in place)*; and a body edited after publishing
  (REQ-LIBRARY-094) is stated as it was published.
- **Who takes up an earlier offer.** The agent that delegated the child, while it runs. Otherwise only an iteration's
  root, of an offer the session left before that root's run took the iteration up: any earlier iteration's (the
  child's `iteration` is lower), a grandchild's as readily as a direct child's, and — a resumed iteration keeping its
  number — its own iteration's children that had ended in an earlier run, whoever delegated them ("a later run of the
  session"; *the first build admitted only lower iterations, which read those words as redundant — found by phase 6's
  review*). A child of a later iteration is refused: the directive gives the offer to "that iteration's root agent", and
  REQ-TOOLS-155 keeps a child to its own children. A plan cycle's root takes up none, since a plan cycle is not an
  iteration (REQ-ORCH-153), and its refusal names only its own children; a plan cycle a continuation starts is still
  shown the open offers in its handoff, which it cannot take up there.
- **How a later root learns of an offer.** The offers no child has taken up are stated as `Open continuation offers`,
  with the way to take one up, each by the offering child's name and task id — the newest ten, the rest elided behind
  one line, since every part of the handoff is budgeted (found by phase 6's second review) — and only when there is one.
  A new iteration's root reads them in the handoff's progress context. A resumed root, which is sent no handoff, is told
  them at the continue that resumes it, after the notice of its background sessions and before the continue's message
  (found by phase 6's second review) — only the offers its conversation does not already hold, since its own children's
  reports carry theirs and an offer told once is not told again. An offer is held when the conversation carries the
  offer itself: a report's `continuation_of: "<id>"`, in a message or a tool result, or a line of an offers list it was
  told, alone or inside a handoff. A root that had answered and waits therefore takes a step only to read an offer it
  has not seen; *the second repair told the whole list at every continue, which had such a root step for it each time
  (found by phase 6's third review)*; *the third repair counted any mention of a task id as the offer told, so a root
  that had only named a task in passing was never told its offer (found by phase 6's fourth review)*. A compression
  that summarises the held offer away has it told again at the next continue, once. A later iteration of the same run starts from the launch content, which states
  none, so there an offer is taken up only by a root that already knows its task id.

**What a ruling decides.** Whether "orchestrator artifact" should instead name only what the root itself publishes,
leaving the line empty until it does. Whether the open offers belong in the handoff, which REQ-SESSION-115 defines as
"artifact, todo, and progress context", or should reach a later root some other way — and whether a later iteration of
the same run should be told of them too.

**Ruled 2026-09-28 — by [`PD-ORCH-005`](../../../product/directives/pd-orch-005.md#pd-orch-005) revision 4 and [`PD-ORCH-004`](../../../product/directives/pd-orch-004.md#pd-orch-004) revision 4, [R-064](../../../product/requests.md#r-064).** The owner took both
recommendations.
- The handoff's artifact is the latest one the iteration's root published and, when the root published none, the latest
  of any kind (clause 20).
- The open offers stay in the handoff, and the root of each later iteration of the same run is told them too, once.

**Built 2026-09-28 under [R-065](../../../product/requests.md#r-065).** The handoff's artifact is the latest the iteration's
root published, falling back to the latest of any kind, and the reading above that a later iteration of the same run is
told of no offer is superseded: every execution root's first message names the open offers it does not already hold.
Building it raised OQ-106 and OQ-107.

Until they are built, the artifact is the latest of any kind, and a later iteration of the same run is told of no
offer.
