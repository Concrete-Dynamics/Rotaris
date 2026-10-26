# Open questions — Specification questions (13 of 27)

Part 18 of 68 of the [open-questions record](../open-questions.md), which indexes every part. Holds OQ-100.

**OQ-100 — How does the counters' line spell the `paused` count clause 13 decides, where does the run-level agent that clause 13 does not name present, what does a live agent's cancel state for its paused descendants, and may the agents a crash left present `paused` before it is recorded, against clause 13's last sentence?** *(`PD-ORCH-005` clause 13, revision 4 — including its last sentence, "every other unfinished agent of a session at rest is settled as before", which the third reading below departs from — with clauses 8, 18 and 19; REQ-MONITOR-211/213, which that sentence keeps for every agent not `paused` and the third reading also departs from; REQ-MONITOR-169, whose count the clause's "the counters" decides and whose line's wording it does not; REQ-MONITOR-064 and REQ-MONITOR-128, which the directive does not name for a live agent's cancel and which the reading below departs from by counting and listing its paused descendants where they count and list live ones only; REQ-CHAT-069 and REQ-MONITOR-111, which it does not name and which the reading below departs from by showing a paused agent's state in "This task" without its elapsed time; REQ-MONITOR-043/057, REQ-MONITOR-045, REQ-SHELL-036, REQ-SESSION-171 and REQ-CHAT-008, which the directive does not name. Raised 2026-09-28 by building `PD-ORCH-005` revision 4 under [R-065](../../product/requests.md#r-065). Numbered OQ-73 while it was built; renumbered when it reached `main`, where OQ-73 had been taken meanwhile.)*

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** every reading built is confirmed, and [`PD-ORCH-005`](../../product/directives/pd-orch-005.md#pd-orch-005) revision 6 states them in clause 23: the paused count named between waiting and done only while an agent is paused; the run-level agent `paused` while its session rests with an iteration open; the agents a crash left presented `paused` before the crash is recorded, a store failure's session excepted; `--rt-wait` for the dot; no elapsed time for a `paused` agent in "This task"; and a live agent's cascade counting and listing its paused descendants. REQ-MONITOR-169, REQ-MONITOR-064, REQ-MONITOR-128 and REQ-CHAT-069 join the directive's Narrows list.

Clause 13 gives an agent in the child state `paused` a presentation state of its own, `paused`, on "the agent tree,
the counters, the inspector, the Mission view and a persona window", keeps its last activity, and settles it for display
no more; its last sentence settles "every other unfinished agent of a session at rest ... as before". The mapping
(`presentationChildState`) and the projection (`toAgentRecord`) carry it to every surface, which each draw
`presentationState` as their dot's class and their state text. Four edges the clause does not reach, and one it does:

- **The counters' line — its wording, not its count.** Clause 13 names "the counters" among the surfaces on which a
  paused agent presents `paused`, so the count itself is decided: a paused agent counts as `paused`, never as waiting
  or failed (the built count had fallen to its last arm, failed). What the clause leaves open is how REQ-MONITOR-169's
  detail line, which names four counts — running, waiting (with queued), done, and failed (with cancelled and
  blocked) — spells the fifth: whether always, and where in the line.
- **The run-level agent.** The run's root is not a child and has no `children` row; the surfaces synthesise it from the
  session (REQ-MONITOR-043/057), and a session at rest drew it `cancelled`. Yet clause 19 counts it among the agents
  that resume, and the run records it `paused` at a rest.
- **What a crash left, before the crash is recorded — which the clause does reach.** Clause 8 records a crash only when
  a run of the session is about to start, or at a repair; a checkpoint listing's repair records none (OQ-96). Until
  then its agents are stored `running`, `queued` and so on, so they are not in the child state `paused`: they are
  among clause 13's "every other unfinished agent", settled "as before". In REQ-CHAT-008's recovery state "as before"
  drew them running, live and pulsing, and once `interrupted` REQ-MONITOR-211/213 settle them `cancelled`. Yet clause
  18 offers the Continue action for such a session "with the same count", and that count (`resumableOf`) counts every
  one of them as resuming — so the text, read literally, has the tree say `cancelled` (or running) for agents the
  Continue action says will resume.
- **The colour.** The mockup draws no paused agent.
- **A live agent's cancel.** Before clause 13 a paused agent presented `queued` and so was among the live descendants
  REQ-MONITOR-064 counts and REQ-MONITOR-128's confirmation lists. The live cancel (`IterationChildren.cancel`) still
  ends every descendant not terminal, `paused` among them — in a `pausing` run, a live child whose own child has
  already come to rest — so a confirmation that listed only live descendants would understate what it cancels.

**What the build proceeds under.**

- **The counters.** A paused agent is counted as `paused`, never as waiting or failed, as clause 13 decides; the
  reading is the line's wording: it names that count between waiting and done —
  `running 1 · waiting 0 · paused 2 · done 1 · failed 0` — **only while an agent is paused**, so every other session's
  line reads exactly as REQ-MONITOR-169 words it (`agentCounts`, `agentStatesLine`).
- **The run-level agent.** While its session rests with an iteration open — `paused`, `interrupted`, or in
  REQ-CHAT-008's recovery state — and only then, it presents `paused` (state `paused`), not live and not ended, its
  activity the run's summary as before (`runLevelAgent`, `runLevelResting`): the same sessions the composer states a
  count for. Only the renderer knows the recovery state (`useNeedsRecovery`, moved to `renderer/session-view.ts` so the
  Workspace, the Mission view and a persona window ask the one liveness predicate alike). It carries no
  `interruption`: the session record does not carry the iteration's. A session at rest with nothing open presents it as
  before, and a live run's root presents running though its iteration is open. In the recovery state the window's status
  strip names the run `Run needs recovery`, as the run header and the Mission view do (`statusStripRunItem`), so no
  surface reads a run as active beside a root drawn `paused`. A persona window's first view of the replica is renewed as
  it subscribes (`followCoalesced`), because a session at rest publishes nothing more, so the root keeps its last activity
  there too. *Until the fourteenth review round the strip read "run Running", and one drive showed that window's root
  with no rows; that second defect was not reproduced (`docs/defects/fixed/`).*
  *Amended 2026-10-03 (fin10): the strip draws no run state any more — REQ-SHELL-038's item list is closed and names none
  ([`the-status-strip-applies-no-responsive-hiding-and-overflows-at-the-minimum-window.md`](../../defects/fixed/the-status-strip-applies-no-responsive-hiding-and-overflows-at-the-minimum-window.md)),
  and `statusStripRunItem` is gone. The Workspace view's run header and the Mission view's subtitle carry `Run needs recovery`,
  so the sentence above about the strip is kept as the record of what was built until then; no surface reads a run as
  active beside a root drawn `paused` still holds through those two.
- **What a crash left — a departure from clause 13's last sentence and from REQ-MONITOR-211/213.** The agents the
  crash record will pause present as it will leave them — `paused`, interruption `crash`, their activity kept, no chip
  — before it is recorded, although they are not in the child state `paused` and the sentence settles them: every
  agent of the open iteration neither terminal nor `paused`, while that iteration's interruption is still NULL (no rest
  recorded one), and the session is `interrupted` or claims a run the one liveness predicate (REQ-SESSION-171) finds no
  process behind (`crashLeftOf`, asked once per projection). Nothing is written (clause 8). The build departs because
  the cross-lane contract of R-065's build asked the tree to agree with clause 18's count, and a tree that settles
  `cancelled` the agents a Continue action promises to resume would state two contradictory outcomes at once; the
  departure is the smallest that removes that contradiction, since the crash record, when it comes, leaves exactly
  these agents `paused`. Concretely, it changes two things "as before" meant: in REQ-CHAT-008's recovery state those
  agents no longer draw running, live and pulsing; and in a session `interrupted` by a checkpoint listing's repair
  (OQ-96), which recorded no crash, they are no longer settled `cancelled` for display. Every other unfinished agent of
  a session at rest — one of no open iteration, or of an iteration a rest already recorded — is settled as before. So
  is every agent of a session a store failure left busy (OQ-42), which reads `not-live` too but is not one a crash left
  (OQ-103): the projection names none of its agents and states nothing to resume (`Sessions.restingOf`), so its tree,
  its run-level agent and the composer's count present it as before rather than label a store failure a crash. In the
  process whose run failed, the projection is frozen at its durable boundary anyway (OQ-42) and shows the run's last
  live state; the renderer still reads the session as REQ-CHAT-008's recovery state from the session list's `stale`,
  and the frozen record still carries the count read while the run was live, so there the run-level agent presents
  `paused` and the composer draws the count and the decline, which the engine refuses `store-failed` (OQ-103).
- **The colour.** The dot takes `--rt-wait`, REQ-SHELL-036's waiting family, which already names `paused` for a
  session; full opacity, no pulse. The state text `paused` is what tells it from `queued` (`docs/design/README.md`'s
  "A paused agent — no design").
- **The controls.** A paused agent is not live (REQ-MONITOR-045): it offers no Steer — neither in the inspector
  (`inspectorEnablement`) nor in the Workspace's agents header (`steerOffered`, which keeps the header's older `queued`).
  Its own Cancel is clause 16's (OQ-101). Neither live nor ended, it shows no elapsed time, and the transcript's "This
  task" reads its state alone (`scopeDetail`) — **for a `paused` agent only**. That departs from REQ-CHAT-069's "its
  live elapsed wall-clock time (REQ-MONITOR-111)" for an agent that is not live: in REQ-CHAT-008's recovery state the
  busy status keeps the clock ticking, and the figure would otherwise count up while nothing runs. Every other agent
  keeps its time there as before, a waiting or queued one included. *The first build dropped it for every agent neither
  live (`AgentRecord.live`, running only) nor ended, so a waiting or queued agent read `waiting` alone where the base
  read `waiting · 1m 3s`; the merged build's eleventh review round restricted it to `paused`.* The agent tree, the
  table and the inspector drop a waiting or queued agent's time too, as they did before revision 4
  ([`a-waiting-agents-elapsed-time-is-not-shown.md`](../../defects/fixed/a-waiting-agents-elapsed-time-is-not-shown.md)); that
  is not this directive's, and is not repaired here. *Repaired 2026-09-29 under R-067: the tree, the table, the inspector and
  the persona window show a waiting or queued agent's time, advancing, by a clock predicate of their own (OQ-124); a
  `paused` agent keeps this reading.*
- **A live agent's cancel.** Its confirmation and cascade note name every descendant its cancel ends — live and
  paused, through a finished one (`cancelCascade`) — so that neither understates what the cancel ends; the body and
  the note name what they are: "Its live descendants", "Its paused descendants" or "Its live and paused descendants
  will be cancelled with it:", and "Cancelling cascades to 2 live and paused descendants." (`cascadeKind`). That departs
  from REQ-MONITOR-064's "live (running, waiting, or queued) descendants" and REQ-MONITOR-128's "one line per live
  descendant", which clause 16 governs for a paused child's own confirmation but not for a live agent's: a live agent
  whose only unfinished descendant is paused gets "Cancelling cascades to 1 paused descendant." where the requirement's
  note is empty. The run's cancel, which ends every unfinished agent, lists every live or paused one in the Mission
  view. A live agent none of whose descendants rests reads exactly as before.

**What a ruling decides.** Whether REQ-MONITOR-169's line should name the paused count always rather than only while
one is paused, and where. Whether REQ-MONITOR-064's "live (running, waiting, or queued) descendants" and
REQ-MONITOR-128's "one line per live descendant" should be named as narrowed so that a live agent's cascade counts and
lists its paused descendants, as the build does. Whether REQ-CHAT-069 should be named as narrowed so that "This task"
shows a paused agent's state without its elapsed time. Whether the run-level agent should present `paused` (it has no
child state), and carry the iteration's interruption. Whether clause 13's last sentence, which settles every unfinished
agent not in the child state `paused` as before, should yield for the agents a crash left before the crash is recorded
so that they present `paused` as the build presents them — and with it REQ-MONITOR-211/213 for an `interrupted`
session — or whether they should present as before (running in REQ-CHAT-008's recovery state, `cancelled` once
`interrupted`) until the crash is recorded, the tree disagreeing with clause 18's count until then.
