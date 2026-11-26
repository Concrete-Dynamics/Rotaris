[Product directives](../directives.md) › PD-CHAT-015

<a id="pd-chat-015"></a>

### PD-CHAT-015 — the transcript is the run's conversation and its threads, and a row is a turn with one left edge

*Revision 2 (2026-11-25, [R-133](../requests.md#r-133)) — **a settled tool segment is quiet**, clause 6. Revision 1
(2026-11-20, [R-109](../requests.md#r-109)) is quoted where it is replaced, never deleted.*

**1. One left edge.** A transcript row SHALL NOT be laid out in a timestamp column and a role column, and SHALL NOT
be indented by its agent's depth in the delegation tree. Every row's content SHALL start one step of the design
language's spacing scale in from the row's edge, at any depth and inside an expanded activity line alike; the members
of an expanded activity line stand one further step in and no more.

**2. The heading of a turn.** The first row of a block (REQ-CHAT-057's attribution rule, which still decides what a
block is) SHALL carry a heading on a line of its own: a dot in the agent's persona colour (`PD-CHAT-005`'s colour
clause), the role in that colour, the task where the row belongs to a named task, and the row's timestamp at the
line's end. A continuation row SHALL draw no heading and nothing in its place; REQ-CHAT-057's 2 px continuation bar is
not drawn. A member of an expanded activity line keeps its own timestamp, at the end of its own line. An edit-diff row
(REQ-CHAT-050) belongs to the turn it stands in: it draws no heading of its own and does not begin a block.

**3. The run and its threads.** The Workspace transcript SHALL show one of three things, chosen by tabs at the head
of the transcript whenever the run holds an agent:

- **Run**, the default: the reader's rows, the run-owned kinds of REQ-CHAT-069, and the rows of the run-level agent,
  with every agent the run-level agent delegated to drawn as **one thread line** where that agent's first row stands
  in the record. A row of a persona the record names no agent for belongs to the run.
- **an agent's tab**, one per agent in the tree's order, named by its persona: that agent's own transcript as
  REQ-CHAT-069's "This task" defines it, with REQ-CHAT-068's delegation-context header above it, and with every agent
  *it* delegated to drawn as one thread line in the same way. The tab of the agent shown, and of any agent not yet
  ended, states that agent's state and live elapsed time (REQ-MONITOR-111, and `PD-ORCH-005` clause 23 for a paused
  agent); every tab carries them as its title. Choosing a tab selects that agent.
- **All activity**: every row in the order recorded, as REQ-CHAT-069's "All activity" has always been.

**4. The thread line.** A thread line is REQ-CHAT-046's delegation category drawn in the transcript; it has no recorded
row behind it and mints no thirteenth category. It SHALL state the agent's persona in its persona colour, its task,
its state and elapsed time, and beneath them one line: while the agent has not ended, the latest thing it did (a call
by REQ-CHAT-175's derived description, its reasoning by that word, its own words by their first sentence); once it has
ended, the first sentence of the last thing it said, after the word "Reported:". Pressing a thread line SHALL show
that agent's tab. Consecutive thread lines are one block and share their rules. An agent that has written no row yet
has no thread line; its tab and its row in the Run panel say that it exists.

**5. The edit diff.** An edit-diff row SHALL draw its header line and the first five lines of the change, and the
rest when the reader asks ("Show N more lines", "Show fewer lines"); a row holding the active search match is drawn
whole. REQ-CHAT-050's fifty-line cap, its text form and its truncation line are untouched.

**6. A settled tool segment is quiet — revision 2.** On the activity line (`PD-CHAT-004`), a tool segment whose calls
have all ended SHALL be drawn in the theme's tertiary text colour, the colour the reasoning segment beside it takes. The
word in flight keeps the run colour and the `N failed` and `N blocked` facts keep the fail colour (`PD-CHAT-004`
revision 3); nothing else on the line changes.

> *Revision 1, as built and stated beside its rule, said, and no longer governs:* "A settled segment is ink; the run
> colour belongs to the word in flight and to nothing that has ended." — a settled tool segment in the primary text
> colour.
>
> **Why, 2026-11-25.** The owner: settled lines such as "Ran 3 commands" should be "a muted color closer to the
> background, similar to thinking text". Drawn in full ink, what an agent did read as loudly as what it said, so a
> turn's words did not stand out from the trace of its work. The cost: a settled segment is now told from a reasoning
> segment by its wording alone, where it was told apart by wording and ink.

**What is displaced, by name.** REQ-CHAT-057's 52 px timestamp column, its 112 px role column and its 2 px
continuation bar; REQ-CHAT-069's two-option toggle, its label "This task" and its sentence "Select an agent to scope
the transcript to its task." (with no agent selected the transcript is the run's, which is never filtered to
nothing). REQ-CHAT-057's 8 pt monospace timestamps, its attribution rule, its 10 px horizontal margin, and
`PD-CHAT-003`'s vertical rhythm still govern. `PD-CHAT-005` revision 2 withdraws its indent, and `PD-CHAT-004`
revision 4 withdraws the members' rule and words the drawn line; each is written at its own directive.

**Why, and what it costs.** The owner, reading a live run: "currently its hard to keep track and the indentations
make the padding grow larger." Measured in the built application on 2026-11-20 at 1440 × 900, the transcript column
719 px wide: a row's text had 485 px of it, a depth-1 agent's 469 px, and a member of that agent's expanded run
246 px, with prose capped at 366 px; one small task was 9,955 px of transcript, and in the middle of a long report
nothing but a 2 px bar said whose it was. Built, the text has 645 px and prose 503 px at the same window, and the
run's own conversation of the same kind of task is 1,448 px.

The cost is the one chronology. The default view no longer interleaves agents, so what two agents did at the same
moment is read in "All activity" or in two tabs, and a search finds what the shown transcript holds. A run of more
agents than the tab strip is wide scrolls its tabs. A proof that read a child's rows in the default transcript reads
them in "All activity" or the child's tab.

> **Narrows:** REQ-CHAT-050, REQ-CHAT-057, REQ-CHAT-069
> **Extends:** REQ-CHAT-046, REQ-CHAT-068

*Raised by the owner, 2026-11-20, and chosen by him from two mocked concepts the same day ("Build concept 2"); logged
as [R-109](../requests.md#r-109).*
