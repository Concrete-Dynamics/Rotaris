[Product directives](../directives.md) › PD-CHAT-004

<a id="pd-chat-004"></a>

### PD-CHAT-004 — an agent's uninterrupted work draws as one activity line that updates in place

*Revision 3 (2026-09-15, [R-029](../requests.md#r-029)) — **the line's colour**, below. It was raised the
day before revision 2 and reached `main` after it, so it takes the next free revision under the rule the
`R-016` collision settled: the one that lands first keeps its number. Revision 2, 2026-09-16
([R-025](../requests.md#r-025)) — the run's boundary and the segment's shape. Revision 1 (2026-09-15,
[R-019](../requests.md#r-019)) is quoted where it is replaced, never deleted. A changed directive takes a
revision and never a new number ([`README.md`](../README.md)).*

**The run.** A *run* is a maximal sequence of transcript rows that belong to **one agent** and are of
the `tool call` or `streamed reasoning` categories. A run of **two or more** rows SHALL be displayed as
a single row — the **activity line**; a run of one row SHALL be displayed as that row, drawn as its own
category states. Neither a change of tool family nor an intervening reasoning row SHALL end a run.

**Runs interleave, and a run is bounded by its agent alone (revision 2).** A row of a **different**
agent SHALL NOT end a run. What ends one is: a row of any other category **belonging to that agent**, a
row belonging to **no** agent, a **user prompt**, and an exempt row. A row belonging to no agent and a
user prompt each end **every** open run — the first because it belongs to the run rather than to a
participant, the second because it is the turn boundary the reader drew themselves. Each activity line
SHALL be displayed at the position of its **earliest** member, and a later member SHALL lengthen that
line where it already stands rather than move it.

> **Revision 1 said:** "A *run* is a maximal sequence of **consecutive** transcript rows … A row of any
> other category, **a row of a different agent**, and an exempt row SHALL end it."
>
> **Why it was wrong, measured 2026-09-16.** The rule solves the single-agent case and re-creates the
> problem in the concurrent one. Two agents working at once interleave in the record, so each agent's
> run is cut at every turn-taking: the owner's screenshot drew ten rows of two agents' work as **five**
> lines of two, each re-stating a timestamp and a full role, with three of them runs of one row that
> were not lines at all. The directive was raised because "two agents writing at once competed for the
> newest row"; under revision 1 they stopped competing for it and started fragmenting each other
> instead. The cost of the repair is stated below.

**What never enters a run.** The structured-questions tool row and an unsettled live-terminal row
(REQ-CHAT-066), and — while `display/showReasoning` is on (REQ-CHAT-167) — any streamed-reasoning
row, so that switching the preference on reveals reasoning without a second expansion to reach it.

**What the collapsed line states.** In the agent's own role gutter, at the run's earliest member start
time, on one line:

- the run's **segments — one per activity word, carrying that word's totals** — in the order the words
  first appear (revision 2). A reasoning segment reads `reasoning ×N · <S>s · ~<T> tok`, its seconds the
  summed duration of its members and its token figure their summed streamed-character count divided by 4
  (REQ-CHAT-062's arithmetic). A tool segment reads `<family> ×N` followed by the per-outcome counts of
  REQ-CHAT-065 — `3 ok`, `1 failed` — omitting an outcome with no members. A family reached again after
  another word SHALL rejoin its own segment rather than open a second one, so the number of segments on
  a line is the number of distinct words in the run and never the number of steps in it.

  > **Revision 1 said:** "Consecutive rows of one family form one segment; the same family reached again
  > after another segment forms a second segment of that family", reasoning that the line should read as
  > a sequence of things done and that merging "would state a total nobody watched happen".
  >
  > **Why it was wrong, measured 2026-09-16.** An agent alternating reasoning and reading — which is what
  > an agent does — produces one segment per **step**. The owner's screenshot carries a single line of
  > more than thirty segments, wrapped over seven rows of text: the line grew with the work exactly as
  > the appended rows it replaced did, which is the one property the directive exists to remove. The
  > sequence is not summarised away and not lost. It is the expansion, in recorded order, one row per
  > step, which is where a reader who wants the order already goes.
- while a call is in flight, the activity word of the segment in flight marked as continuing, and that
  call's text on the dimmed `⤷` preview line REQ-CHAT-061 gives a collapsed tool row;
- the run's **elapsed span** — from the earliest member's start to the last member's end — counting
  upward from the earliest start while the run is live.

**The line's colour — revision 3.** The line SHALL NOT take one colour from the most severe outcome
among its members. Within the line:

- The **failure facts** of a segment — the `N failed` and `N blocked` counts REQ-CHAT-065 puts in it —
  SHALL be drawn in the theme's fail state text colour.
- Everything else on the line SHALL keep its ordinary colour: the family word and the `×N` total, the
  `N ok` and `N running` counts, every reasoning segment, the chevron, the in-flight activity word, and
  the run's elapsed span.

REQ-CHAT-065's **severity ordering is untouched** and is still what the line computes and publishes —
it is what the copy summary and the accessible description state, and what a reader of the drawn
surface can still see, now located at the segment that holds it. What stops is that ordering selecting
one colour for the whole line. A tool row drawn as its **own** row keeps REQ-CHAT-060's colouring in
full, because that row **is** the call that failed; and expanding the line is untouched, each member
being drawn as its own category states, which already colours the failed member and only it.

> *Revision 1 said, and no longer governs (replaced by revision 3):* "The line SHALL take its colour from the most severe
> outcome among its **tool** members, by REQ-CHAT-065's ordering; a run holding only reasoning is never
> coloured as failed." Kept in place beside its replacement rather than repaired quietly.

**It never appends.** Extending a live run — a further tool call, a further reasoning phase — SHALL
change what the activity line states and SHALL NOT add a displayed row. While one agent works, only a
row of another category may lengthen the transcript.

**Expanded.** Expanding the line SHALL keep it on screen and reveal its members beneath it in their
recorded order, hanging from a **single continuous rule in the agent's persona colour** that spans the
whole revealed run. Each member keeps the identity (REQ-CHAT-059), the expansion state and the drawing
its own category gives it.

**Attribution.** The activity line's role is the **agent's**, never an activity word; family words
appear only inside the line's own text. This is REQ-CHAT-057's own rule applied to the new row and adds
nothing to it.

**Copy, and the accessible description.** Both SHALL yield the readable summary above, segments
separated by `, ` and the facts inside one segment by ` · `, and SHALL NOT emit raw tool input or
output. A run of exactly one tool family and no reasoning therefore still reads
`reading ×4 · 3 ok · 1 failed`, which is REQ-CHAT-065's own example unchanged.

**The switch.** REQ-CHAT-067's tool-grouping display setting governs the activity line: with it off,
every row draws as its own category states and no run is formed. Its auto-collapse setting acts on tool
rows drawn as rows; the members revealed beneath an expanded line are exempt, as a folded group's members
already were, because a reader who opened the run asked to see its steps.

**Why, and what it costs.** The owner read a live transcript in which one agent thinking and reading
in turn drew as `ORCHESTRATOR / READING / ORCHESTRATOR / READING`, and reported two faults: the role
column appeared to name two participants where there was one agent, and two agents writing at once
competed for the newest row, which flickered. The first fault is a defect against REQ-CHAT-057 and
REQ-CHAT-064 and is repaired as one
(a defect note, removed once repaired); **this directive is the second.** Flicker is
a consequence of the shape of the record, not of the painting: a run of an agent's work appends a row
per step, every append moves the tail, and two agents appending at once move it twice as often. A row
that changes rather than grows removes the cause — each working agent owns exactly one line, and two
of them cannot contend for a position that neither is taking.

Three things are given up, and all are real. **Per-step timestamps go behind one expansion**: the
collapsed line carries the run's earliest start and its span, not the instant of each call, so reading
when a particular call happened now costs a click. **REQ-CHAT-065's summed duration becomes a span**,
which is the larger figure wherever an agent idled between calls — it answers "how long has this agent
been at this", which is the question the line is drawn to answer, at the cost of no longer answering
"how much time did the work itself take" without expanding. And **a mixed run no longer states one
activity word**, so the glanceable "what is it doing" is a list rather than a word; the in-flight
segment is drawn as continuing precisely to keep that answer available at a glance.

**What revision 2 gives up, and it is real.** **A live line no longer sits at the tail.** A run is drawn
where its earliest member is, so an agent that has been working since before another agent's rows keeps
its line above them and updates it there; a reader watching the bottom of the transcript sees the other
agent's line move and must look up for the first one's. That is the direct price of "display them
according to sent first" and of a row that changes rather than grows — the two cannot both be satisfied
at the tail. **The order in which one agent used its tools is one expansion away**, where revision 1 put
it on the line; what the line answers instead is how much of each thing the agent has done, which is the
question a reader glancing at two working agents is actually asking. **A word's totals span the whole
run**, so `reading ×22 · 22 ok` may cover calls made minutes apart and the per-call instants are, again,
the expansion's.

**Why revision 3, and what it costs.** The owner read a run in which one agent thought, read and called
tools, one call failed, and the whole line — reasoning included — turned red. Revision 1 said that
should happen, because REQ-CHAT-065 says it, and REQ-CHAT-065 says it for a reason: a collapsed group
hides its members, so a reader who cannot see the failure inside it needs to see it on the header. This
directive changed the premise that reason rested on and revision 1 did not notice. The line is no longer
one family word with counts behind it; it states its segments, and each segment already carries its own
outcomes **as text**. The place to mark the failure therefore exists on the collapsed line, and marking
the whole line instead reports reasoning as having failed when reasoning has no outcome at all. The cost
is that the failure is now a smaller mark — two words rather than a line — so a reader skimming a long
transcript for a red line will not find it as fast. That is the trade: precision over salience, on a
surface that now has somewhere precise to put it.

> **Narrows:** REQ-CHAT-046, REQ-CHAT-062, REQ-CHAT-064, REQ-CHAT-065
> **Extends:** REQ-CHAT-067

*Raised by the owner, 2026-09-15; logged as [R-017](../requests.md#r-017) and chosen from four drawn
approaches as [R-019](../requests.md#r-019). **Revised** at the owner's request, 2026-09-16; logged as
[R-025](../requests.md#r-025). Revised again, 2026-09-15 and landed after it; logged as
[R-029](../requests.md#r-029).*
