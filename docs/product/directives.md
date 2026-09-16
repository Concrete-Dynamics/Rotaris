# Product directives

Behaviour decided by the product owner. **These govern over every requirement they name** — see
[`README.md`](README.md) for the precedence rule, the classification that routes a request here
rather than to an open question or an escalation, and the obligations a directive puts on the commit
that writes it.

- Identifiers: `PD-<DOMAIN>-<NNN>`, `<DOMAIN>` taken from the specification domain that owns the
  behaviour. Stable, permanent, contiguous from 1 per domain, never renumbered and never reused.
- Every directive states a **disposition** against live requirements, and every requirement it
  supersedes, narrows or extends carries a back-pointer at its own definition in `docs/spec/`.
- Parsed by `tools/symbol-artifact/generate.mjs`. A disposition naming an identifier the
  specification does not define fails `pnpm check`.

## Count

**Nine.** The count here is the number of entries below, written nowhere else so that it cannot go
stale. A **revised** directive keeps its number and does not add to it (`README.md`: "a changed
directive gets a new revision, not a new number"); `PD-CHAT-004` is at revision 2.

---

<a id="pd-shell-001"></a>

### PD-SHELL-001 — a chosen project folder may be opened in an additional main window

Choosing a project folder from inside a window SHALL offer two outcomes, and which one is taken SHALL
be decided by the gesture that starts the flow rather than by a question asked afterwards: the
**replacement** of REQ-SHELL-017, or the **addition** of a main window on the chosen folder with the
window that issued the request left open and unchanged.

The add route SHALL be reachable by exactly two gestures, and by no other: a shortcut-less command
palette entry labelled "Open project folder in a new window", present in every window and in the
composer's slash catalogue on the terms of REQ-SHELL-048 and REQ-SHELL-056; and activating the
title-bar workspace chip of REQ-SHELL-035 with the platform's secondary-activation modifier held.
Every other activation of that chip is the replacement route, on which REQ-SHELL-021 governs in full.

On the add route the product SHALL build a main window on the chosen folder, show it, surface it on
the terms REQ-SHELL-161 fixes for every window this product owns, and leave every window already open
exactly as it was — the same workspace, the same active view, the same composer contents, the same
runs still executing. The replacement semantics of REQ-SHELL-017 SHALL NOT apply, no window SHALL be
closed, and the three gates of REQ-SHELL-021 SHALL NOT be evaluated: an active run, an unsaved
settings edit or a running worktree integration, in the requesting window or in any other, neither
blocks the request nor is disturbed by it. The chosen folder SHALL be resolved and persisted as the
last-opened workspace on the terms REQ-WORKSPACE-005 already fixes for a folder chosen through the
chooser of REQ-WORKSPACE-009. A failure to build the added window SHALL leave every open window
usable and SHALL report it on the terms REQ-SHELL-019 fixes for a failed replacement. Whether the
chosen folder is one a window already has open is decided by the rule REQ-STARTUP-163 fixes, which
this directive cites rather than restating; where it is, PD-WORKSPACE-001 governs and no window is
built.

**Why, and what it costs.** Two projects open side by side is what the owner asked for, and the
specification has no route to it from inside the application: REQ-STARTUP-163 builds an additional
window only for a directory a *launch* carries, and says in its own text that a request originating
in a window is not that case. The alternative — two operating-system processes — is refused by
REQ-STARTUP-161 and was declined as [R-003](requests.md#r-003). The cost is threefold and none of it
is hypothetical: per-window state that a single-window product could keep in one place must now be
correct per window (the approval queue, the followed session, the persona and terminal windows, the
deferred first-launch prompt); REQ-SHELL-021's gates no longer stand between a user and a second
workspace, so the gesture must be as cheap to undo as to make, which is why closing the added window
changes nothing else; and the choice cannot be offered by the native chooser, which carries no
buttons of ours (REQ-SHELL-164), which is why the gesture is chosen before the chooser opens.

> **Extends:** REQ-SHELL-017, REQ-STARTUP-161
> **Narrows:** REQ-SHELL-021

*Raised by the owner, 2026-09-12; logged as [R-004](requests.md#r-004).*

<a id="pd-workspace-001"></a>

### PD-WORKSPACE-001 — choosing the folder that is already open offers a new session

Where the folder chosen through the project-folder chooser of REQ-WORKSPACE-009 is one the requesting
window already has open, the choice SHALL NOT be left without observable effect. The product SHALL
raise a transient notice in the requesting window and in no other, stating that the folder is already
open and carrying exactly one action, labelled "Start a new session", which opens that window's own
start-session surface for the workspace it already has open.

The offer SHALL NOT be a modal dialog and SHALL NOT take keyboard focus from what the user was doing.
No main window SHALL be built and none SHALL be closed; the window's workspace, its active view, its
composer contents, its running runs and the last-opened-workspace preference SHALL all be left as
they were, whether the action is taken, the notice is dismissed, or it is ignored until it withdraws.
Whether the chosen folder is the one already open is decided by the rule REQ-STARTUP-163 fixes, which
this directive cites rather than restating.

**Why, and what it costs.** REQ-WORKSPACE-010's silent no-op is the right answer to a user who picked
the wrong folder by accident. It is the wrong answer to the user who deliberately re-picks the folder
they are already working in, because that gesture carries a legible intent — a second place to work
in this project — and the product's answer to that intent is a second session, which it already
builds. A no-op discards the intent and, to the person who made it, is indistinguishable from the
chooser having failed. The cost is that a chooser can now end in something on screen, so a reader of
REQ-SHELL-021's "a decline shows no folder chooser and changes no window" must not mistake this
notice for a change to a window; and a notice was chosen over a dialog deliberately, because someone
who re-picked their own folder should not be interrupted more heavily than the no-op this replaces.

> **Supersedes:** REQ-WORKSPACE-010
> **Extends:** REQ-NOTIFY-003, REQ-NOTIFY-013
> **Extends:** REQ-SHELL-021

*Raised by the owner, 2026-09-12; logged as [R-005](requests.md#r-005).*

<a id="pd-library-001"></a>

### PD-LIBRARY-001 — a child report states the commands the child ran, and which of them failed

An artifact record whose `kind` is `child_report` SHALL carry the commands the child ran, as a list
named `commands`, each member carrying the command as the child submitted it and the exit status the
terminal reported for it, the status being absent where the observation carried none. The list SHALL
be derived from the child's own transcript and SHALL NOT be written by a summarising pass, on the
terms REQ-ORCH-108's schema already fixes for the report this record materialises. Where the child
ran no command the record SHALL carry an empty list, and the document SHALL show no section for it.

The Markdown document of REQ-LIBRARY-090 SHALL render the list as a **Commands** section placed
immediately before **Edited Files**, and the section filters of REQ-LIBRARY-099 and REQ-TOOLS-148
SHALL offer it under the section name `commands`. Each entry SHALL render the command in a code span
and SHALL state its exit status in words rather than as a bare number, so that a reader who has never seen a shell exit code
can tell a command that failed from one that did not: a zero status renders as the command alone, a
non-zero status names the code, and an absent status says so. Ordering SHALL be the order the child
ran them and SHALL NOT be sorted, grouped or de-duplicated — a command run twice with two outcomes is
two entries, and which came first is the fact a reader is reading for.

**Why, and what it costs.** The specification already requires the child report to carry its commands
(REQ-ORCH-108's schema: "commands (command, exit code, summary)"), and on 2026-09-12 that field was
found hardcoded empty at every construction site and nothing anywhere rendered it. Deriving it fixed
the record; it did not make it readable, and a field no surface shows is indistinguishable to a user
from the defect that was just repaired. The place chosen is the one where the reader already asks this
question: the child report artifact is what a person opens to find out what a child did, it already
carries **Edited Files** from the same schema sentence, and the two facets were separated only by the
accident of one being rendered and the other not. The run that prompted this is the argument — seven
of nineteen terminal calls failed across four children and nothing but the raw store could say so.

The cost is threefold and none of it is hypothetical. **REQ-LIBRARY-088's field inventory is closed**
— "a reader may rely on no other key being present, and adding one is a change to that requirement" —
so this directive is that change, and a consumer written against the old inventory sees a key it did
not expect; the shape is additive and no existing key moves or changes meaning. **REQ-LIBRARY-090's
section order is fixed**, so a reader diffing two documents across this change sees a section appear
between Snippets and Edited Files. And the derivation inherits a bound it cannot remove: context
compression replaces a conversation (REQ-MONITOR-084), so a child compressed mid-task no longer holds
its earliest calls, and the list is of what survived in the transcript the report was built from. That
bound is stated in the record rather than hidden, and closing it needs the durable tool-call evidence
of REQ-SESSION-136, which this directive does not require and does not forbid.

> **Extends:** REQ-LIBRARY-088, REQ-LIBRARY-090, REQ-LIBRARY-099, REQ-TOOLS-148

*Raised by the owner, 2026-09-12; logged as [R-006](requests.md#r-006).*

> **First execution, 2026-09-14:** the built-app proof (`pnpm artifacts-proof`'s sixth launch) ran a child
> through three ordered terminal calls — success, exit 7, and one the permission gate denies — and read the
> report back through `artifact_read` with `sections: ['commands']`. Closeout planning had found the tool path
> still filtering through a private section list that predated the directive: the store's own filter was correct
> and its test green, but every model-facing filtered read returned the full document. Repaired against contracts'
> `ARTIFACT_SECTIONS`; the ledger itself behaved exactly as this record fixes it — order preserved, statuses
> in words, the denied command carrying no exit status. The full account is in
> `docs/architecture/first-executions.md` and a defect note (removed once repaired).

<a id="pd-chat-001"></a>

### PD-CHAT-001 — the composer's selector chips open their alternatives in a press-revealed popover

The composer's reasoning-effort, permission-mode and run-start-mode chips SHALL present as a
**value chip** — an icon, the current choice as a short value, and a press affordance — whose
alternatives open in a small press-revealed popover rather than being offered by an always-expanded
selector. The chip SHALL keep the current choice visible at rest; what the popover replaces is the
permanently drawn alternative set. The permission-mode chip's popover SHALL present the presets
strictest-first, and selecting the preset that grants autonomous execution SHALL still first raise
the warning confirmation dialog REQ-CHAT-009 fixes, with Cancel holding initial keyboard focus.

An explanatory sentence this domain draws beside such a control MAY be published as a tooltip and
an accessible description instead of as visible text, and an icon MAY carry a control's name where
the specification fixes the wording as an accessible name rather than as visible copy; where a
requirement fixes a string as *visible*, the string stays visible and the icon rides beside it.

**Why, and what it costs.** The reference the owner pointed at is a chat interface whose reasoning
level is one compact chip ("High") that opens a three-item menu — the value at rest, the
alternatives on press. The specification's chips do the reverse: `REQ-CHAT-009` fixes labels like
`reasoning: <level>`, and the current build draws the label *and* an open select *and* the
alternatives all at once, three facts where one is a choice. The cost is one press between the user
and the alternative values, paid on every change; the current value remains visible at rest, which
is the part of REQ-CHAT-009's labelling that does the daily work. The permission-mode segmented
control is the same trade at higher stakes — three always-visible words where one mode is live —
and the autonomous dialog already standing between the user and that mode is what makes hiding the
other two behind a press acceptable.

> **Narrows:** REQ-CHAT-009
> **Extends:** REQ-CHAT-006, REQ-CHAT-007

*Raised by the owner, 2026-09-13; logged as [R-010](requests.md#r-010).*

<a id="pd-chat-002"></a>

### PD-CHAT-002 — structured questions present an auto-opened, docked all-in-one form and a rendered transcript summary

When an agent invokes `ask_questions`, the pending prompt SHALL NOT require clicking a transcript
trailer row or opening a detached modal dialog. Instead, the interactive question prompt SHALL
automatically open and dock inside the transcript at the bottom of the visible message stream,
above the composer.

The docked form SHALL present all steps (1 to 10) in an all-in-one scrollable form layout. Each
step SHALL display its step number, title, optional description, single-select option cards (when
options are present), and a freeform textarea editor (when `allow_freeform` is true and no option card
is selected). The Submit control SHALL appear at the bottom of the form and SHALL remain disabled
until every step holds an answer. Activating Submit SHALL deliver every step's answer in a single
payload to the waiting tool call. A Cancel affordance SHALL be present, and pressing Escape or
dismissing the prompt SHALL cancel the questions and immediately release the waiting tool call.

A settled `ask_questions` tool row in the transcript history SHALL expand into a rendered read-only
summary card displaying each step's title and the user's selected option or freeform response (or
indication of cancellation / timeout / no answer), accompanied by a toggle between the rendered
summary view and the raw untruncated JSON `INPUT` / `OUTPUT` view.

**Why, and what it costs.** The previous flow (REQ-CHAT-098..099) required the user to notice a
trailer row at the bottom of the transcript, click it to open a modal stepper dialog, and click
through steps one by one with Next/Back navigation. Modern AI coding interfaces (e.g. Copilot,
Claude Code) present interactive questionnaires directly within the conversational flow at the
transcript tail where user focus already rests. Docking the all-in-one form eliminates modal context
switching and lets the user review and answer all questions in one place before submitting. Settled
rows in the transcript history benefit from a rendered human-readable summary instead of raw JSON
while preserving the raw JSON toggle for technical auditing. The cost is that pending questions now
occupy visible vertical space at the tail of the transcript until submitted or cancelled, and
modal-specific navigation behaviors (step pills, sequential Back/Next buttons) are replaced with a
scrollable all-step form.

> **Supersedes:** REQ-CHAT-098, REQ-CHAT-099
> **Narrows:** REQ-CHAT-101, REQ-CHAT-103
> **Extends:** REQ-CHAT-061, REQ-CHAT-097, REQ-CHAT-100, REQ-CHAT-102

*Raised by the owner, 2026-09-13; logged as [R-011](requests.md#r-011).*

<a id="pd-chat-003"></a>

### PD-CHAT-003 — transcript row density follows the design material's compact flow

The workspace transcript SHALL be drawn at the density the adopted design material proposes for it
(`docs/design/README.md` G7: "the mockup's transcript column is the best available drawing of the
intent"), not at the geometry REQ-CHAT-057's figures produce when composed with per-row padding
and a per-row box minimum. Concretely:

- A row SHALL size to its content. The 30 px minimum row height of REQ-CHAT-057 SHALL NOT apply to
  the row's box; a one-line row (a tool header, a reasoning summary, a system notice) is as tall as
  its line.
- Vertical rhythm SHALL follow the mockup: **12 px** above the first row of a block (a block
  beginning at every row whose role differs from the row above, per REQ-CHAT-057's own attribution
  rule), and no more than **4 px** between consecutive rows of one block. The horizontal 10 px
  margins of REQ-CHAT-057 are UNTOUCHED.
- The transcript MUST NOT add vertical padding per row beyond what the mockup's rows carry. The
  user's own message keeps the surface REQ-CHAT-057's design already earns it (the mockup draws
  that bubble padded inside its tinted box); every other row sits on the background.
- The timestamp column (52 px), the role column (112 px), the 8 pt monospace timestamps, the
  attribution rule and the 2 px persona continuation bar of REQ-CHAT-057 are UNTOUCHED and still
  govern.

Rows MUST remain readable at this density: this directive changes spacing, not legibility, and no
row MAY be drawn so tightly that its content lines touch or its hover wash clips its text.

**Why, and what it costs.** The owner measured the built transcript (2026-09-13 screenshot) and
read it as large spacing that makes the conversation hard to follow: the requirement's figures,
taken with the row stylesheet's `min-height: 30px` + `padding: 8px 12px` + `margin: 5px`, yield a
row pitch of roughly 46–50 px where the mockup's blocks sit 12 px apart and a one-line row is
~17 px. The specification was faithful to its target and is not wrong; the owner wants something
else — the mockup's compactness. The cost is that rows no longer carry their own breathing room,
readability at density leaning on line-height and the block gap instead, and that the recycled
pool's capacity arithmetic (`ROW_MIN_HEIGHT` in `packages/ui/src/transcript/constants.ts`) keeps
the 30 px figure as a conservative slot-size floor while real rows may be shorter.

> **Narrows:** REQ-CHAT-057

*Raised by the owner, 2026-09-13; logged as [R-012](requests.md#r-012).*

<a id="pd-config-001"></a>

### PD-CONFIG-001 — the Personas category edits a role's MCP tool grants inline

The Personas category's **Tools** cell SHALL be interactive: activating it opens a per-role tool-grant
editor presenting, one section per configured tool server (REQ-CONFIG-176), whether the role carries
that server and, for a carried server, which of the server's discovered tools (REQ-MCP-046) the role
is granted. A server the configuration does not define SHALL NOT be offered: the editor grants tools
from servers that exist, and never authors a server declaration (REQ-CONFIG-350's boundary stands).

Per carried server the editor SHALL write exactly one of the three states REQ-CONFIG-102 already
defines, chosen by what the user leaves selected: every discovered tool selected writes **no key**
for that server, so the role receives the server's whole surface including tools it publishes later
(REQ-MCP-060); a proper subset writes `mcp_tools[server]` as exactly those names; none selected
writes an **empty list**, and the role carries the server while seeing no tool from it. A stored
grant name the server's discovery does not report SHALL appear in that server's section as an
additional, visibly flagged entry and SHALL be preserved verbatim on save — the entry is inert at
run time (REQ-MCP-058), and dropping it quietly would rewrite a hand-authored file beyond what the
user selected. A server whose configured `enabled` is false (REQ-CONFIG-465) or whose tool discovery
has failed (REQ-MCP-042) SHALL be shown marked as such with its per-tool toggles disabled, its stored
grant preserved; the role may still carry it, and carry decisions stay writable for every server the
configuration defines.

The editor SHALL write through the overlay of REQ-CONFIG-443 into the scope the category's edit-scope
selector (REQ-CONFIG-336) has selected — which therefore settles where a tool-grant edit is recorded
as it already settles where a model or reasoning edit is recorded — restating the role's whole
`mcp_tools` map, and its `mcp_servers` list where a carry decision moved, per the wholesale-replace
rules of REQ-CONFIG-045 and REQ-CONFIG-046, and the save SHALL reload so the change is live within
the action (REQ-CONFIG-261). The built-in `tools:` list, `delegates_to` and `custom_tools` remain
read-only in the category; what this directive lifts is the MCP-grant half of the boundary only.

**Why, and what it costs.** The owner's flow — add or activate an MCP server, then hand each persona
only the tools it should reach — exists end to end in the mechanism: `mcp_servers` carries the
server, `mcp_tools` narrows it, grants resolve per persona (REQ-MCP-055..056), and the run honours
them (REQ-MCP-061). The specification's settings screen showed both fields read-only on purpose
(REQ-CONFIG-338, REQ-CONFIG-464), so the flow ended in a hand edit of a map keyed by server and tool
names the product discovers but never shows at the point of choosing. The owner is overriding that
boundary knowingly, and the file remains the store (REQ-CONFIG-477): the write is an overlay naming
its keys, not a move into anything this application owns. The costs are three and all real: the
screen now writes list- and map-valued fields, which the wholesale-replace rules make all-or-nothing
per scope — a workspace-scope save restates the role's whole map and supersedes a global one for
those fields entire, so a user reading the global file sees a list that no longer governs; the tool
names offered are a discovery snapshot and go stale the moment a server publishes a different list,
so what the editor shows is evidence, not a promise, the run-time surface remaining discovery's; and
a grant checked per tool is a narrowing that never widens with the server — a tool the server adds
later reaches a role with a subset grant only once the user returns here, which is the price of
selecting rather than the unset whole-surface state the first checkbox state deliberately preserves.

> **Narrows:** REQ-CONFIG-338, REQ-CONFIG-464
> **Extends:** REQ-CONFIG-336

*Raised by the owner, 2026-09-14; logged as [R-015](requests.md#r-015).*

<a id="pd-chat-004"></a>

### PD-CHAT-004 — an agent's uninterrupted work draws as one activity line that updates in place

*Revision 2, 2026-09-16 ([R-025](requests.md#r-025)). Revision 1 (2026-09-15) is quoted where it is
replaced, never deleted: the two rules below that moved are the run's boundary and the segment's shape.*

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

The line SHALL take its colour from the most severe outcome among its **tool** members, by
REQ-CHAT-065's ordering; a run holding only reasoning is never coloured as failed.

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

> **Narrows:** REQ-CHAT-046, REQ-CHAT-062, REQ-CHAT-064, REQ-CHAT-065
> **Extends:** REQ-CHAT-067

*Raised by the owner, 2026-09-15; logged as [R-017](requests.md#r-017) and chosen from four drawn
approaches as [R-019](requests.md#r-019). **Revised** at the owner's request, 2026-09-16; logged as
[R-025](requests.md#r-025).*

---

<a id="pd-chat-005"></a>

### PD-CHAT-005 — a row names its agent by colour, and a delegated agent's rows sit one step in

**The colour.** A transcript row's **role label** SHALL be drawn in its persona's assigned colour —
the same colour REQ-CHAT-057's continuation bar and PD-CHAT-004's expanded rail already take, so one
agent reads as one colour everywhere it appears. A row that names no persona — the reader's own row, a
system notice — SHALL keep the surface's accent and take no persona colour.

The assigned colours SHALL be taken from the **categorical set the adopted design language already
declares** for data whose values are names rather than magnitudes, in that set's own order, assigned by
a stable function of the persona's name. No persona colour SHALL be a **state** colour: a colour the
product uses to say `ok`, `running`, `waiting` or `failed` may not also say *who*, because the two would
then be indistinguishable on a row that carries both.

**The place.** A row belonging to an agent at depth *N* in the run's delegation tree
(REQ-MONITOR-036/037) SHALL be drawn indented *N* steps, one step being the design language's base
spacing step, with the run's own entry persona at depth 0. The indent SHALL move the row's columns and
SHALL NOT resize them: REQ-CHAT-057's 52 px timestamp column and 112 px role column are untouched, as
are its margins and its minimum height. That is why this directive **extends** that requirement rather
than narrowing it — every figure REQ-CHAT-057 fixes still holds on an indented row, and the indent is a
new fact drawn beside them. (`PD-CHAT-003` already narrows REQ-CHAT-057, and one requirement may be
narrowed by one directive only, so a second claim on it would have had to be settled rather than
declared; there is nothing to settle, because nothing here disagrees with it.) A surface that does
not know the delegation tree SHALL draw every row at depth 0, which is what every surface did before
this directive.

**Why, and what it costs.** The owner read a live two-agent transcript and reported that "agents can be
barely distinguished". They were not: the role label was drawn in one accent colour for every agent, the
persona colour reached only a 2 px continuation bar and an expanded rail, and nothing in the transcript
said which agent had delegated to which — that fact lived only in the Agents panel, which indents its
children. Two agents alternating therefore read as one column of identical labels.

The palette this replaces was six tokens of which `--rt-ok` and `--rt-run` are the **same** colour, so
six slots yielded five hues and one persona in six collided outright; and three of the six were state
colours, so a persona bar could be read as an outcome beside a row whose outcome it was not. The
language's categorical ramp is six distinct hues declared for exactly this purpose.

The costs are four. **Beyond six personas the hues repeat**, which is the ramp's own declared behaviour
and is not fixed here; two agents deep in one run may share a colour, and the label, the indent and the
task line still tell them apart. **An indented row's columns move with it**: the first evidence shows
a child's timestamp starting one step right of its parent's, so the time gutter reads as a stepped
column rather than one straight edge. The alternative — indenting from the role label and leaving
the times aligned — puts the step inside the row and breaks the block the row is, which is worse for
the fact being drawn. **Depth costs horizontal room**: a row at depth 2 gives up 32 px of
measure, and REQ-CHAT-057's columns do not shrink to pay for it, so a deep delegation narrows the text
rather than the gutter. **The transcript now depends on the delegation tree** to draw a row in its
place, where it depended on the row alone; a row whose agent the record does not yet name is drawn at
depth 0 and moves in when the record catches up.

> **Extends:** REQ-CHAT-057, REQ-CHAT-068, REQ-CHAT-069, REQ-SHELL-075

*Raised by the owner, 2026-09-16; logged as [R-025](requests.md#r-025).*

---

<!--
The template. Copy it, do not read it as a directive — it names no real identifier and the
generator skips it because it sits inside a comment.

### PD-CHAT-001 — the composer states the model it will start the next run with

The composer MUST display the model the **next** run will start with, as text, beside the model
selector, in every run state including while a run is active. Where the next run would start with a
model other than the one the active run is using, the composer MUST state both.

**Why, and what it costs.** A user who changes model mid-run cannot otherwise tell whether the
change took effect now or at the next run, and the two readings differ in money. The cost is a
second piece of text in a composer the design draws tight, and a state the transcript header already
carries once.

> **Supersedes:** REQ-CHAT-009
> **Narrows:** REQ-CHAT-006
> **Extends:** REQ-CHAT-078

*Raised by the owner, 2026-09-12; logged as [R-001](requests.md#r-001).*
-->
