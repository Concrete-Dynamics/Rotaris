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

**Twelve.** The count here is the number of entries below, written nowhere else so that it cannot go
stale. A **revised** directive keeps its number and does not add to it (`README.md`: "a changed
directive gets a new revision, not a new number"); `PD-CHAT-004` is at revision 3.

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

*Revision 3 (2026-09-15, [R-029](requests.md#r-029)) — **the line's colour**, below. It was raised the
day before revision 2 and reached `main` after it, so it takes the next free revision under the rule the
`R-016` collision settled: the one that lands first keeps its number. Revision 2, 2026-09-16
([R-025](requests.md#r-025)) — the run's boundary and the segment's shape. Revision 1 (2026-09-15,
[R-019](requests.md#r-019)) is quoted where it is replaced, never deleted. A changed directive takes a
revision and never a new number ([`README.md`](README.md)).*

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

*Raised by the owner, 2026-09-15; logged as [R-017](requests.md#r-017) and chosen from four drawn
approaches as [R-019](requests.md#r-019). **Revised** at the owner's request, 2026-09-16; logged as
[R-025](requests.md#r-025). Revised again, 2026-09-15 and landed after it; logged as
[R-029](requests.md#r-029).*

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


<a id="pd-chat-006"></a>

### PD-CHAT-006 — a row still being written draws no animated indicator of its own

A transcript row that is still being written SHALL NOT draw an animated indicator of its own. The
pulsing `…` an agent-message row — and every other row of a category that is neither a tool call nor
streamed reasoning — drew while live SHALL be removed, and SHALL NOT be replaced by another animated
or blinking mark. The row's own growth is what says it is being written.

**What is untouched, and why each survives.** This directive removes a mark that states nothing its
row does not already show. It does not remove a mark that carries a fact:

- REQ-CHAT-164's **stalled indicator** stands exactly as that requirement states it — at ten seconds
  with no provider output the live row states that the model is not producing output and shows the
  elapsed seconds, and reverts as soon as any further output arrives. What changes is only that it now
  appears where nothing was drawn rather than replacing an animation. A stall is not visible in the
  row's growth, which is precisely why it is drawn.
- A tool row's `◉ running…` (REQ-CHAT-060), a reasoning row's `◉ reasoning… <N>s · ~<T> tok`
  (REQ-CHAT-062) and the activity line's in-flight activity word (PD-CHAT-004) are **untouched,
  animation included**. Each names which call, which phase, or how long — facts that appear nowhere
  else on those rows, and on rows whose text does not grow as the answer arrives. Removing them was
  considered and refused for that reason; a later directive may take them, and would say so here.
- REQ-CHAT-063's refresh cadence is untouched. Live rows still repaint so their elapsed times advance;
  what a repaint draws is what this directive fixes.

**Why, and what it costs.** The owner read the built transcript and reported the mark as noise: it is
on screen for the whole of every answer, it blinks the entire time, and it restates what the arriving
text already shows. The specification is not wrong — an indicator that a row is live is a reasonable
thing to have drawn, and REQ-CHAT-164 needs a name for the form it replaces — but the owner wants the
transcript quieter. The cost is real and is at the start of an answer: a live message row that has
produced no text yet, and has not yet been streaming for ten seconds, now draws nothing at all. For up
to that long, a row exists with nothing in it, and a reader cannot tell a slow first token from an
empty row. That window is exactly the one REQ-CHAT-164's threshold was chosen to bound, so it closes
itself; it is stated here rather than discovered later.

> **Narrows:** REQ-CHAT-164

*Raised by the owner, 2026-09-15; logged as [R-028](requests.md#r-028). Minted as `PD-CHAT-005`, which reached `main` first under another directive; renumbered under the rule the `R-016` collision settled, with not one word of what was asked changed.*

<a id="pd-orch-001"></a>

### PD-ORCH-001 — loop supervision does not fire while a run is held at the plan gate

**The rule.** While `REQ-ORCH-153`'s plan gate holds a run, loop supervision SHALL NOT be active for
that run's entry agent: no trigger is evaluated, no classification call is made, and no corrective
message is placed in the conversation. Supervision SHALL resume for the segment that follows the
decision — approval or revision — with its counters at zero, exactly as `REQ-ORCH-105` leaves them
after an activation.

The suppression is a property of **the hold**, not of the turn's contents or of the entry role: it
begins when the gate is settled and ends when the gate resolves. A run that never reaches the gate is
supervised as before, and every agent of a released segment is supervised as before.

**Why.** Observed live 2026-09-16, run `a26918e8` (logged as [R-026](requests.md#r-026)). A held run
has every tool that writes a file or runs a command withheld from it, so the only work it can do is
read, search and fetch. A plan for a codebase it has not seen is written by doing exactly that, many
times, over the same region — which is `REQ-ORCH-101`'s first trigger, "the same action observed four
times in a row", firing on the one behaviour the gate leaves available. The supervisor then did what it
is built to do: it placed, as a `role: 'user'` message carrying no marker, *"Pause and reassess the
`grep` call around `<path>`…"*. The run read it as an instruction from the person who had asked for a
plan, said so in its own words — "The user asks me to pause and reassess the grep call" — and spent
**three minutes and twelve seconds** reconciling it with what it remembered being asked. No user had
said anything. The run was held, waiting for one.

So the mechanism fires on the gate's own side effect and answers it in the voice of the person the gate
is waiting for. Neither half is wrong on its own; together, at the gate, they produce an instruction
nobody gave.

**Why a directive and not a repair.** Settled in writing before the code, because the classification
turns on it. Supervision as specified is **session-scoped and agent-scoped, not child-scoped**:
`REQ-NOTIFY-102` speaks of "a run with supervision enabled", `REQ-NOTIFY-103` of "the session's own
context" and "the agent", `REQ-NOTIFY-107` of state belonging to one session. `REQ-ORCH-101`'s "each
observed child event" is the event of a supervised agent — the entry agent has an execution record
like any other — and **no requirement exempts the entry agent, and none exempts a held segment**. The
product therefore does what the corpus says when it supervises the plan-gate turn. Suppressing it is a
change to specified behaviour, which is a directive.

**Why not the wider rule.** The impersonation itself — a product-authored message written to read as a
user's — is *required*: `REQ-ORCH-099` demands corrective messages that "read as natural user
instructions that never mention monitoring, detection, or injection", and `REQ-ORCH-103` demands a
"natural user voice". A directive making every product-authored message name itself would supersede
that clause and would have to name `REQ-HOOKS-074` as well, which mandates the user role for hook
feedback. It was drafted and **declined for now**, recorded in [R-026](requests.md#r-026) as
`PD-ORCH-002` so the decline is visible. This directive is the narrow half: it removes the one place
the product speaks as the user to a run that is *waiting for the user*.

**What it costs.** A genuine loop during a plan cycle is no longer caught. That is a real loss and it
is accepted for a stated reason: the held segment is **one turn of one agent** (`REQ-ORCH-153`), its
tools cannot change the workspace, and the user is already at the surface deciding — so the loop's
usual cost, unbounded work on the wrong thing, is bounded here by the gate itself. The escalation path
is unchanged for every other segment. `REQ-ORCH-099`'s invisibility is preserved in the strongest
possible way: by the supervisor not firing at all.

> **Narrows:** REQ-ORCH-099, REQ-ORCH-101

*Raised by the owner, 2026-09-16; logged as [R-026](requests.md#r-026).*

> **First execution, 2026-09-16, the day it was raised:** the risk was the classification, not the code.
> The draft allowed that `REQ-ORCH-099`..`105` might be child-scoped — `REQ-ORCH-101` opens "on each observed
> child event" and the gate holds the **root** — in which case supervising a held root was never required and
> this was covered work rather than a directive. Read against `REQ-NOTIFY-102`..`109`, it settles the other way,
> and the reasoning is above under "Why a directive and not a repair". The code is one condition at the
> supervisor's attachment site, checked against its own negation: with the condition removed the new test fails
> and the corrective fires while the hold stands. Supervisors are memoized per conversation, so the suppression
> is "no supervisor attached for this turn" rather than an instance discarded — and because nothing is observed
> while held, the released segment begins from an untouched record without anything having to reset it.
> The account is in `docs/architecture/first-executions.md`.

<a id="pd-orch-002"></a>

### PD-ORCH-002 — the plan gate renders Markdown by default with inline editing and progressive revision feedback

*Revision 2 (2026-09-17, [R-032](requests.md#r-032)) — **the height the gate is given, and who decides it**,
below. Revision 1 (2026-09-16, [R-030](requests.md#r-030)) is quoted where it is replaced, never deleted. A
changed directive takes a revision and never a new number ([`README.md`](README.md)).*

**The rule.** `REQ-ORCH-153`'s presentation clause — *"The plan MUST be presented verbatim as the producing role wrote it — never summarized, truncated, or re-rendered into another form"* — is narrowed: the plan awaiting a decision SHALL be presented formatted as rendered Markdown by default, using the synchronous Markdown dialect of `REQ-CHAT-056`. The user SHALL be provided an immediate toggle or mode switch to edit the source directly in a monospace editing field, preserving the edit path of `REQ-ORCH-154`.

The plan gate surface SHALL deduplicate identical implied tasks produced by the run, presenting them with status indicators. The revision feedback field ("Changes to ask for") SHALL be disclosed progressively (expanding or focusing when revision is intended) rather than occupying prominent fixed vertical space by default. While the gate is held, the disabled message composer SHALL be visually de-emphasized to eliminate input ambiguity.

**The gate takes the reading area, and the reader chooses when it gives it back — revision 2.** While a
decision is pending, the gate SHALL be presented inside the primary view in exactly one of two states.

**Expanded**, which is the state a gate opens in and the state a further plan cycle returns it to: the gate
occupies the whole of the area the transcript otherwise reads in, **no transcript rows are drawn beneath
it**, and the plan's own text — rendered Markdown, or the source under `REQ-ORCH-154`'s edit — SHALL be the
**largest element of the surface and the only element that grows with it**: every other part of the gate is
sized by its own content, so every pixel the surface gains goes to the plan and a taller window is a longer
plan and nothing else.

**Collapsed**: the gate is a single bar at the top of that same area, and the transcript reads beneath it
exactly as it does when no gate is held, under `REQ-CHAT-010`'s floor and no other.

While the gate is **expanded**, the composer SHALL stand at its own minimum height rather than at the height the
divider was last left at: it accepts nothing while a decision is pending, and the height it is not using belongs
to the plan. `REQ-CHAT-010`'s composer minimum still governs the composer, the persisted divider position SHALL
NOT be modified, and it SHALL govern again the moment the gate is collapsed or answered.

One control on the gate SHALL move between the two states in one action, and **all three answers of
`REQ-ORCH-153` SHALL be offered in both states, under the labels `REQ-SHELL-048` fixes** — collapsing is a
way to read the conversation before deciding, never a way to mislay the decision.

> **Revision 1 said, and no longer governs:** "The workspace grid holding the plan gate SHALL preserve a
> readable floor for the transcript (`minmax(220px, 1fr)`) and cap the gate's maximum height, so
> conversation history remains visible and accessible while a decision is pending."
>
> **Why it was wrong, measured 2026-09-17 in the built product.** The floor and the cap are two constraints
> on one axis, and at the window size the owner works at they leave the gate less height than its own
> contents need: the screenshot of a gate at cycle 1 shows the Markdown preview reduced to **one clipped
> line** with the three answers overlapping the text above them, and the four rows of transcript the floor
> bought underneath. Guaranteeing the transcript a floor did not make the conversation readable — it made
> the plan unreadable and left the conversation a strip. Revision 2 stops splitting one screen between two
> readers and hands the choice to the person who has to make the decision.

**Why.** When reviewing a plan produced in tabular Markdown syntax, verbatim monospace presentation in a fixed-height textarea forces tedious horizontal and vertical scrolling across raw pipes, obscuring the plan's substance. Simultaneously, an empty revision feedback textarea and a locked main composer present three competing text-entry surfaces on screen, while the transcript is compressed into an unreadable strip. Rendering Markdown with a quick edit-source switch gives immediate readability while preserving `REQ-ORCH-154`'s full inline editing guarantee.

**Why, revision 2.** A plan is read once and answered once; the conversation behind it is read on demand.
Revision 1 treated them as two things to be shown at the same time and bought each of them too little. What
the reader loses is the transcript's presence while the gate is expanded — deliberately, since it is one
action away and the gate's whole purpose is that nothing proceeds until it is answered. What is **not**
given up is reachability: the three answers stand in both states, so no window size and no scroll position
can put the decision out of reach, which is the obligation `REQ-SHELL-048` states and `REQ-ORCH-153` repeats
for these three in particular.

> **First execution, 2026-09-17 — the revision's own sentence was measured and did not hold.** The clause above
> was drafted reading *"the plan is the majority of the surface at every window size the shell supports"*.
> `pnpm plan-gate-proof` measured it in the built product at an 835 px window: the composer's own content
> minimum is 252 px — the row was already at its floor — leaving the gate 397 px, of which the heading, the
> intent, the implied todo, the progressive revision field and the three answers take 240. The plan got **153 px,
> 41%** — the largest element by a factor of three, and not a majority. A directive stating a ratio the layout
> cannot hold at the window the product is used at is one that gets quietly disobeyed, so the clause was
> rewritten before it shipped to the two facts a proof can check, and the share is reported rather than
> required. The mechanism itself held: expanded drew no transcript, collapsing gave back 311 px and answered
> nothing. Recorded in [`../architecture/first-executions.md`](../architecture/first-executions.md).

> **Supersedes:** REQ-ORCH-153
> **Narrows:** REQ-ORCH-154, REQ-SHELL-168, REQ-CHAT-010

*Raised by the owner, 2026-09-16; logged as [R-030](requests.md#r-030). Revised 2026-09-17; logged as
[R-032](requests.md#r-032). `REQ-CHAT-010` joins the dispositions at revision 2: its 180 px transcript
minimum is a floor under an area this directive now takes in full while the gate is expanded, and a
requirement a mechanism contradicts is named by the directive or it is an ungoverned deviation from it.*

<a id="pd-monitor-001"></a>

### PD-MONITOR-001 — a cost the provider reported is carried and shown under its own qualifier

**The rule.** Where a provider's own protocol defines a way for a request to ask for the cost of that
request, the product SHALL ask, and SHALL carry the figure the provider answers with. A run's cost
total is the **exact decimal sum** of the per-request figures it received and of nothing else: no rate
is multiplied, no figure is estimated, and no figure is invented for a request the provider priced at
nothing it reported. `REQ-MONITOR-166`'s cost label SHALL carry a fourth qualifier, **`reported`**,
for a total reached this way, and a run holding no reported figure SHALL keep the `unknown` qualifier
and the label it has today.

A figure whose currency the provider does not name SHALL be rendered as the amount alone, under the
rounding of `REQ-PROVIDER-121` — half-up, two decimal places, four below one hundredth — and SHALL NOT
be given a currency symbol the product chose for it.

**Why.** Observed live 2026-09-16, run `a26918e8` (logged as [R-026](requests.md#r-026)): a whole run
against a metered provider, `cost` = `"0"`, the label reading *"price not established"*. That is
[OQ-62](../architecture/open-questions.md), which names four routes to a figure. Three of them are
blocked and stay blocked: each one **multiplies** a per-token price by a token count, `REQ-PROVIDER-121`
forbids computing an amount in binary floating point, and the representation that would make the
multiplication exact is ADR-0031's — proposed, unspiked, and blocked by OQ-21, which changes a
persisted format.

The fourth route is not blocked, and the difference is arithmetic rather than appetite: a figure the
provider computed needs **addition only**. Adding two decimal strings exactly says nothing about what
a price is, chooses no representation for a rate, and pre-empts neither OQ-21 nor the spike ADR-0031
requires. The one route that was always available was left unbuilt because it sat in the same open
question as the three that were not.

The corpus had already assumed this figure exists. `REQ-SHELL-045` fixes the workspace strip's cost
item as *"the model provider's reported cost for this workspace's runs so far"*, with a tooltip that
says *"Reported by the model provider"* — a requirement written for a figure nothing in the product
could produce and no qualifier could describe.

**Why a directive and not a repair.** `REQ-MONITOR-166`'s qualifier set is a closed three — *"an
unknown price, an incomplete price, and a price derived from configured rates"* — and a figure the
provider computed is none of them. Naming a fourth is a change to a requirement that is not wrong,
which is a directive rather than an escalation (`README.md`: a request contradicting a faithful
requirement is a directive). `REQ-PROVIDER-121` is narrowed for the same reason and no further: its
symbol table is written for an amount whose currency is known, and an amount reported without one is
outside what it decides rather than in conflict with it.

Two requirements the mechanism touches are **not** governed, and reading them is what settled that.
`REQ-EVENTS-053`'s `usage.update` already carries `cost.total` and already fires on the completed
provider request — the payload gains a figure where it carried `"0"`, and not one clause of the
requirement changes. `REQ-ORCH-142` says provider-reported totals *"are cumulative and MUST be
replaced, never summed"*, which reads at first like a prohibition on adding them: it is about a total
a provider reports **for the run**, and what is added here is what a provider reports **for one
request**. Two requests are two purchases. Within a single request the rule is honoured literally —
where a provider repeats the field mid-stream, the last reading replaces the earlier one rather than
adding to it.

**What it costs.**

- **One endpoint today.** The ask is a body field the endpoint defines, and sending it to an endpoint
  that does not define it is not free: a strict OpenAI-shaped API answers an unrecognised field with a
  400. So the product asks only where the protocol says to, which today is OpenRouter's `usage.include`
  — one entry in a table of hosts, data rather than code. Every other provider's cost keeps reading
  `"0"` under the `unknown` qualifier, exactly as before.
- **The figure crosses JSON as a number.** It arrives as a double whatever the provider computed it
  in. That is the protocol's doing and it is where this product's exactness begins: nothing rounds,
  scales or multiplies it, and it is added to the total as the decimal it reads back as.
- **No currency.** The product has no currency type anywhere, and this directive does not introduce
  one. A total is shown bare rather than under a symbol the product guessed. Where a provider names a
  currency, carrying it is ordinary future work against `REQ-PROVIDER-121`'s own table.
- **Not per agent.** `REQ-MONITOR-102` persists a per-agent cost. This carries the run's total only;
  the per-agent figure stays as it is, owed rather than quietly filled.

> **Narrows:** REQ-MONITOR-166, REQ-PROVIDER-121

*Raised by the owner, 2026-09-16; logged as [R-026](requests.md#r-026).*

> **First execution, 2026-09-16, the day it was raised:** it found the reading half harder than the
> asking half, and the corpus friendlier than expected. The SDK's usage mapping keeps the token fields
> and **drops every other**, so `usage.cost` reaches nothing above it however the request is made —
> `metadataExtractor`, the seam the SDK provides for exactly this, is what carries the raw chunk over
> before that mapping happens, and the figure rides out on the port's existing `usage` part rather than
> on a new channel. Two nearby requirements looked like obstacles and were not: `REQ-ORCH-142`'s
> "replaced, never summed" is about a run total and not a request's own figure, and `REQ-SHELL-045`
> turned out to require the provider-reported cost outright, which is a requirement the product could
> not meet until this directive. The exact-decimal addition is thirty lines of `bigint` in
> `packages/engine/src/money.ts`, scale-free so no place is truncated, and it is reported into ADR-0031
> in place: it is not that decision's `Money` type, its library or its lint rule, all of which stay
> blocked on OQ-21. The account is in `docs/architecture/first-executions.md`.

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
