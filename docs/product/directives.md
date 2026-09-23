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

**Twenty-five.** The count here is the number of entries below, written nowhere else so that it cannot go
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

*Revision 3 (2026-09-18, [R-041](requests.md#r-041)) — **the compact strip**, below.
Revision 2 (2026-09-18, [R-040](requests.md#r-040)) — the docked strip — is quoted where it is
replaced, never deleted. A changed directive takes a revision and never a new number
([`README.md`](README.md)).*

**The compact strip.** The strip SHALL shorten its controls to their icon behind its own
`data-compact` state, derived from the dock's own width: `tight` below 900 px, `narrow` below
700 px. `tight` shortens the four small fixed sets — reasoning effort, run-start mode, permission
mode — and the token estimate; `narrow` additionally shortens persona and model. A shortened
control keeps its value mounted with the value as its text while CSS hides it, so the established
probes keep reading the control and the panel keeps listing the current choice checked; the compact
tooltip names control and choice, because an icon alone states nothing (REQ-CHAT-007's dual
channel). The estimate owns no popover and shortens by hiding its one figure — it is drawn once,
never twice. What never shortens: attach, stash, steer, pause and the send pill — an action
without a visible label is a control without a name.

> **Revision 2 said, and no longer governs:** "The strip SHALL carry every control the composer
> draws … No control SHALL stand on a second chip row outside the dock … Each strip control SHALL
> present as an icon-led control — the icon, the current value in the mono face, a press
> affordance … The strip changes the trigger's shell and nothing else."
>
> **Why it was wrong, measured 2026-09-18.** Revision 2 kept every value visible at every width,
> so a long model id (`openai-compatible--vlm/qwen3.8-flash-next`, the owner's screenshot) pushed
> the strip past its dock: `autonomous` clipped mid-word and the estimate doubled below the strip.
> The owner's follow-up (R-041) named the order: first the small fixed sets, then persona and
> model. The thresholds are the built strip measured at 1000×680 — dock 876 px, content 874 px
> against 560 px of values that may shorten — not an estimate. Kept in place beside its
> replacement rather than repaired quietly.

**The strip.** The composer's field and its controls SHALL share ONE outer contour — the textarea
above, a 34 px strip below, a single `surface` border and the large radius around both. The strip
SHALL carry every control the composer draws: the persona selector, the model selector, the
reasoning-effort, run-start-mode and permission-mode value chips, the attach, stash, steer and
pause actions, the token estimate, and the send pill. No control SHALL stand on a second chip row
outside the dock, and no explanatory sentence SHALL be drawn as visible text — REQ-CHAT-007's
two-channel rule (tooltip plus accessible description) carries what the strip does not show.

Each strip control SHALL present as an icon-led control — the icon, the current value in the mono
face, a press affordance — whose alternatives open in the SAME press-revealed panel the chip's
picker already owns. The strip changes the trigger's shell and nothing else: values, options,
order, callbacks, enablement, the autonomous warning dialog and the dual-channel reasons govern
unchanged. The panel, the filter, the searchable picker and the popover menu are shared objects,
not second implementations.

The send pill SHALL carry the mode's short label visible — `Run`, `Continue`, `Queue` — and the
specification's own wording as its accessible name, so the composer's mode is still stated and the
strip stays one band. The pill is the system's one filled control. Steer, pause, stop, the plan
gate's lock, the paused continue, the project-setup refusal and the cancelling refusal are the
same states the same controls already drew; only their shells move into the strip.

> **Revision 1 said, and no longer governs:** "The composer's reasoning-effort, permission-mode and
> run-start-mode chips SHALL present as a **value chip** — an icon, the current choice as a short
> value, and a press affordance — whose alternatives open in a small press-revealed popover rather
> than being offered by an always-expanded selector. The chip SHALL keep the current choice visible
> at rest; what the popover replaces is the permanently drawn alternative set."
>
> **Why it was wrong, measured 2026-09-18.** Revision 1 narrowed the alternatives and left the
> surface: persona and model kept their open selects, the permission mode kept its label row, and
> the composer paid two rows of chips plus an attachment sentence — four bands at 1000×680 with the
> primary action diagonally opposite the button it belongs beside (UIR-009). The owner chose
> proposal B of three drawn alternatives: the docked strip, one contour, one 34 px band. Kept in
> place beside its replacement rather than repaired quietly.

An explanatory sentence this domain draws beside such a control MAY be published as a tooltip and
an accessible description instead of as visible text, and an icon MAY carry a control's name where
the specification fixes the wording as an accessible name rather than as visible copy; where a
requirement fixes a string as *visible*, the string stays visible and the icon rides beside it.

**Why revision 2, and what it costs.** Three rendered proposals were drawn against revision 1's
surface and the owner chose the docked strip. The cost over revision 1 is one more press-revealed
hiding: persona and model keep their full picker panels behind an icon-led trigger, and the send
pill shows the mode's short label while the spec's own wording rides as its accessible name. The
current value remains visible at rest on every control, which is the part of REQ-CHAT-009's
labelling that does the daily work. The permission-mode chip's popover SHALL present the presets
strictest-first, and selecting the preset that grants autonomous execution SHALL still first raise
the warning confirmation dialog REQ-CHAT-009 fixes, with Cancel holding initial keyboard focus.

> **Narrows:** REQ-CHAT-005, REQ-CHAT-009
> **Extends:** REQ-CHAT-006, REQ-CHAT-007

*Raised by the owner, 2026-09-13; logged as [R-010](requests.md#r-010). **Revised** at the owner's
request, 2026-09-18; logged as [R-040](requests.md#r-040). **Revised again** at the owner's request,
2026-09-18; logged as [R-041](requests.md#r-041).*

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

<a id="pd-orch-003"></a>

### PD-ORCH-003 — an approval releases the plan gate for the session, not only for the run

**The rule.** An approval taken under `REQ-ORCH-153` SHALL release execution for the remainder of the run
that received it **and for every later run of the same session**, until the gate is re-armed. A run started
in a session that holds an approved release SHALL NOT be held at the gate, whatever the run-start mode says.

The gate SHALL be re-armed by exactly two things, and by nothing else:

- **a new session**, which never holds a release and is therefore held exactly as `REQ-ORCH-152` and
  `REQ-ORCH-153` require; and
- **the user choosing `plan` on the run-start control** while the session holds a release, which re-arms
  that session in the same gesture that writes the setting.

Neither **revise** nor **cancel** releases anything. An approval SHALL NOT change the run-start mode: the
setting keeps its value and its persistence under `REQ-ORCH-152`, and no answer at the gate writes it.

A surface that offers the run-start mode for a session holding a release SHALL state that the session is
released, so the control never reads as promising a gate that will not open.

**Why, and what it costs.** The unit a person plans is the **piece of work**, and a session is this
product's name for that. Approval already installs the run's execution grants, so the transition from
planning to implementing inside one run costs one keystroke and no setting; the ceremony is entirely at the
next prompt. A follow-up to a plan that was just approved — *"you missed the error case, add it"* — opened a
fresh gate and asked the user to read and approve a plan for a two-line change, and the only escape was a
control in the composer that a user has no reason to visit and every reason to forget. A gate people route
around is worse than no gate, because it trains the reflex of approving without reading.

What it costs is stated plainly, because it is real: a long-lived session plans **once**, and work that
drifts into new territory inside that session runs ungated until someone re-arms it. That is accepted for
two reasons — the release is **visible on the very control that sets the mode**, so the state is never a
surprise, and **one gesture undoes it**, the same gesture that asked for planning in the first place.

**Why not switching the mode instead.** The first shape asked for was an approval that switches
`runtime.run_start_mode` away from `plan` ([R-034](requests.md#r-034), declined). It buys the approved run
nothing, since the grants are already installed; all it does is pre-decide the **next** run at the moment
the user is reading **this** plan. It also makes a one-shot answer write a persistent setting behind the
user's back, which is the failure `REQ-ORCH-152` was written to avoid. This directive changes the reach of
the release and leaves the setting alone.

**Why not by intent.** `REQ-ORCH-153`'s carve-out could instead be widened from `REQ-ORCH-021`'s answer
group to answer ∪ micro, so a small follow-up never gates. It needs no new state at all, and it was
rejected: it makes the gate's appearance **probabilistic**, with a classifier deciding whether the user is
shown the plan before files are written. A gate that exists to stop unread writes has to be predictable, and
a user must be able to answer "will the next run be held?" without knowing how their sentence was
classified. Recorded here so the cheaper-looking option is not re-proposed as new.

**Why it names one requirement and not three.** The mechanism touches the plan gate, and two of the three
requirements that govern it are deliberately **not** in the disposition:

- `REQ-ORCH-154` is untouched and every clause of it still holds as written. It states what approval
  guarantees *for the run that received it* — that the run may not return to the gate, that a later plan in
  that run may not block, that a mode change mid-run lands on the next run. This directive adds a second,
  wider scope; it contradicts none of those sentences.
- `REQ-ORCH-153`'s block is already conditioned on the release in the built product (ADR-0062 reads
  `plan_released` at every launch), and that condition was grounded in `REQ-ORCH-154`'s one-way clause when
  it was built. What changes here is not *whether* a released run is held but **for how long the release
  lasts**, and the sentence that fixes that is `REQ-ORCH-152`'s — the mode "governs the next run started in
  the same workspace until the user changes it".

So `REQ-ORCH-152` is the identifier this displaces, and naming the other two would claim a precedence this
directive does not need. It would also be refused: `PD-ORCH-002` already supersedes `REQ-ORCH-153` and
narrows `REQ-ORCH-154`, and the symbol generator rejects two directives over one requirement so that
precedence stays unambiguous.

> **Narrows:** REQ-ORCH-152

*Raised by the owner, 2026-09-17; logged as [R-035](requests.md#r-035).*

**First execution, 2026-09-17 — the mechanism held, and the proof that measured it did not.**
`pnpm plan-gate-proof` gained two launches the day the directive was written and ran them against the built
product: a follow-up prompt typed into an approved session through the real input path, and the run-start
chip's own popover driven open and answered. Both behaved as the rule states on the first run. The follow-up
came to rest `completed` with no cycle pending, `plan_released` still `1` and the session's cycle count
unmoved at the two already decided — the launch that would have failed before the directive, since the mode
was still `plan` and the follow-up's intent sits outside `REQ-ORCH-021`'s answer group. Choosing `Plan first`
again cleared the release, and the next prompt was held at a third cycle.

**What did hold a defect was the harness.** The first run failed reading its own evidence: the app logs an
evaluated expression as `eval-at <ms> <the expression> → "<the value>"`, and the expression **contains every
token the answer does**, so a pattern matching the answer anywhere in the line matched the question instead.
It is the shape of mistake that reports a pass as easily as a failure — here it refused a launch that had in
fact succeeded, which is the safe direction, and the same pattern read one character differently would have
green-lit a chip that was never clicked. The answer is now read from the arrow at the end of the line. Not
minted as a numbered defect: it was written and found inside the same hour and never governed anything, and
`first-executions.md` excludes proof defects by its own terms.

**One defect was found beside it, in code this change only passed through**: a `PopoverMenu` option's
accessible name fuses its label and its hint with no separator — `Auto` + `start at once` announces as
*"Autostart at once"* — which reaches every chip built on the component and predates this directive. Recorded
as [`a-chip-option-announces-its-label-and-hint-as-one-word.md`](../defects/a-chip-option-announces-its-label-and-hint-as-one-word.md)
and deliberately not repaired here. The row is in
[`../architecture/first-executions.md`](../architecture/first-executions.md).

<a id="pd-monitor-001"></a>

### PD-MONITOR-001 — a cost the provider reported is carried and shown under its own qualifier

*Revision 2 (2026-09-23, [R-049](requests.md#r-049)) — **configured rates price a request the provider did
not**, below. Revision 1 (2026-09-16, [R-026](requests.md#r-026)) is quoted where it is replaced, never
deleted. A changed directive takes a revision and never a new number ([`README.md`](README.md)).*

**The rule — revision 2.** Where a provider's own protocol defines a way for a request to ask for the
cost of that request, the product SHALL ask, and SHALL carry the figure the provider answers with.
Every completed provider request of the run, whichever agent made it, is then priced by the first of
these that applies:

1. **Reported.** The provider reported a cost for the request: that figure.
2. **Configured.** The model the request was sent to has both `input_cost_per_token` and
   `output_cost_per_token` set (`REQ-CONFIG-088`): the request's input tokens multiplied by the input
   price, plus its output tokens multiplied by the output price, computed in exact decimal arithmetic
   (`REQ-PROVIDER-121`) with no rounding before display.
3. **Unpriced.** Otherwise the request has no figure. None is estimated or invented for it.

A price SHALL be taken as the decimal its configuration states, read from the text as written, so a
price never passes through binary floating point on its way in. A run's cost total is the **exact
decimal sum** of its requests' figures. `REQ-MONITOR-166`'s cost label SHALL carry a fourth qualifier,
**`reported`**, and the four qualifiers and their labels SHALL be:

| The run's requests | Qualifier | Label |
|---|---|---|
| none has a figure | `unknown` | `price not established` |
| some have a figure, some do not | `incomplete` | `at least <amount>; some requests have no price` |
| every one has a figure, and every figure was reported | `reported` | `<amount> reported by the provider` |
| every one has a figure, and at least one was configured | `configured` | `<amount> at configured rates` |

The qualifier is recorded with the total, so a label read back later is the label the run earned.

> **Revision 1 said, and no longer governs:** "A run's cost total is the **exact decimal sum** of the
> per-request figures it received and of nothing else: no rate is multiplied, no figure is estimated,
> and no figure is invented for a request the provider priced at nothing it reported.
> `REQ-MONITOR-166`'s cost label SHALL carry a fourth qualifier, **`reported`**, for a total reached this
> way, and a run holding no reported figure SHALL keep the `unknown` qualifier and the label it has today."
> It forbade multiplying a rate because the representation that makes the multiplication exact was
> undecided (OQ-21, ADR-0031). Both are now decided: prices are decimal strings, and multiplying a decimal
> by a whole token count is exact in `money.ts`'s representation with no library.

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

**What revision 2 costs.**

- **Cached input is charged at the full input price.** The product's usage record has no cached-token
  figure, so on a provider that discounts cached input a configured figure is higher than the provider's
  charge. A reported figure, where there is one, takes precedence and carries the discount.
- **Image pricing is not included.** `REQ-PROVIDER-150`'s image token cost is outside this revision.
- **A mixed run reads `configured`.** One configured figure among reported ones makes the whole total
  partly an estimate, and the label says so.
- **Discovery prices are not read.** Whether a price may come from a provider's model list is the first
  half of OQ-62 and stays open.
- **Children must be counted.** A delegated child's requests are the run's requests. The repair of
  [`a-delegated-childs-provider-requests-never-reach-the-runs-totals.md`](../defects/a-delegated-childs-provider-requests-never-reach-the-runs-totals.md)
  is part of building this revision.

> **Narrows:** REQ-MONITOR-166, REQ-PROVIDER-121

*Raised by the owner, 2026-09-16; logged as [R-026](requests.md#r-026). Revised 2026-09-23; logged as
[R-049](requests.md#r-049).*

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

> **First execution of revision 2, 2026-09-23, the day it was ruled:** the rule held as written, and building it
> found three things the text did not say. (1) **A failed attempt is not a request with a price.** The ladder
> observes every attempt, including one that failed before the provider counted a token; read literally, such an
> attempt is a request with no figure, and one transient retry would have made every run read `incomplete`. A request
> that counted no tokens and reported no figure is therefore none of the three, and one with tokens but no figure is
> unpriced as the rule says. (2) **"The model the request was sent to" is the ladder's to know.** After a fallback it
> is not the agent's model, so the price is resolved at the ladder cell, and a test prices a quota fallback at the
> fallback's rates. (3) **The qualifier needs no history of its own.** The recorded qualifier and the run's token
> totals together determine everything a continuation needs to count on, so `sessions.cost_qualifier` (v21) is the
> only new column. The prices arrive exact because the loader reads each from the YAML scalar's source text, and
> the snapshot is read the same way. In the built product, `pnpm overview-proof` ran a scripted run whose entry agent
> and child are both priced at `3e-6` and `0.000015`: 162 and 129 tokens stored as `0.002421`, exactly, labelled
> `0.0024 at configured rates`. A cost below 0.00005 still renders `0.0000`, which contradicts REQ-SHELL-045's
> own promise and is recorded in `docs/defects/`. The row is in
> [`../architecture/first-executions.md`](../architecture/first-executions.md).

<a id="pd-tools-001"></a>

### PD-TOOLS-001 — a hard-timeout reset restores the shell's working directory and environment

**The rule.** When a foreground command reaches its hard wall-clock timeout and the terminal session is
restarted under `REQ-TOOLS-099`, the product SHALL snapshot the shell's working directory and exported
variables before the respawn and re-apply them after it, so the next command continues where the timed-out
one left off. The observation contract is untouched: `exit_code` 124, `timeout` true, `failure_kind`
`"timeout"`, `kill_status` ∈ {`session_reset`, `reset_failed`}, `session_reinitialized` true, and a detail
stating the command exceeded its timeout, the session was forcibly restarted to terminate the process tree,
and shell state was lost — with the restored directory and variables named beside that sentence, so the
observation never reads as claiming nothing was lost.

Aliases, functions and background jobs are **not** restored: they cannot be enumerated reliably from outside
the shell that held them, and re-inventing them would be guessing. The detail names that boundary too.

**Why, and what it costs.** Observed live 2026-09-18, run `cc6191a2` (logged as [R-039](requests.md#r-039)):
a command that hung on an unbalanced quote hit the hard timeout, the session respawned at the default
directory with a default environment, and the agent spent the next turns re-discovering where it had been.
`REQ-TOOLS-099` is faithful — the tree must go and the session must restart — and what it fixes about the
loss ("everything the shell had accumulated … is gone, and the observation says so") is kept. What changes
is only what happens *after* the restart: the directory and the variables, which the product can capture
without entering the dead shell, are re-applied to the fresh one. The cost is one snapshot round-trip per
reset and a detail line that states both the loss and the restore, so no reader mistakes a resumed directory
for a shell that never died.

> **Narrows:** REQ-TOOLS-099

*Raised by the owner, 2026-09-18; logged as [R-039](requests.md#r-039).*

<a id="pd-library-002"></a>

### PD-LIBRARY-002 — a retrospective pass reads the workspace's own session history and proposes what a user would otherwise have to teach the product by hand

**The rule.** Beside the per-run analyst of section 3, the improvement domain SHALL carry a second
kind of analysis pass, the **retrospective**. A retrospective SHALL read only material this product
already keeps for the workspace it runs in — session records, improvement artifacts and their
recorded versions, saved prompts, persona memory, and the workspace's own `AGENTS.md` or
`AGENTS.override.md` as REQ-WORKSPACE-041 fixes discovery — and SHALL author, per REQ-LIBRARY-003,
evidence-backed proposals of the closed vocabulary of REQ-LIBRARY-006 about **how the workspace is
worked in across runs**, not about how one run went. A retrospective proposal's evidence entries
MUST be attributable to material the workspace's own record holds, in the way REQ-LIBRARY-017
attributes a per-run proposal's evidence to its source run: each entry names the record that holds
what it cites, and a proposal whose evidence cannot be so attributed MUST NOT reach a review
surface.

**What the retrospective looks for is stated as the fields its proposals serve, not as a model
promise.** Its proposals are ordinary proposals in every mechanical respect — REQ-LIBRARY-006's
vocabulary, REQ-LIBRARY-008's fields, REQ-LIBRARY-009's validation, REQ-LIBRARY-046's duplicate
suppression, REQ-LIBRARY-116's undo, REQ-LIBRARY-162's versioned history — and the categories they
name are the ones whose effect is to teach the product rather than to change the workspace:
`agents_md_update`, `persona_or_prompt_adjustment`, `persona_memory_update`, `documentation_update`
and `config_change` among them. The product MUST NOT attempt to detect whether a retrospective
proposal is good, novel, or non-speculative; the answer to a poor one is the human gate, as
REQ-LIBRARY-016 already says, and no quality test replaces it here either.

**Reach, and the boundary it holds.** A retrospective reads **across** sessions but SHALL NOT read
outside the workspace: no other workspace's record, no user-global location, and — like every
analysis this domain runs — nothing on the network. Its output lands in the same store, is reviewed
on the same two surfaces, and is applied only through the same separately started improvement run.
The retrospective has no authority REQ-LIBRARY-001 does not already give the per-run analyst, and
no proposal of it is ever applied by anything but a human approval of that exact proposal.

**The trigger.** A retrospective SHALL be started by the user's explicit gesture on a desktop
surface, and from nowhere else. It MUST NOT be scheduled, chained from a run's completion, or
started by an agent. It is therefore never automatic, exactly as this product's live-run against a
real model is never automatic: the pass spends tokens the owner pays for, and the trigger that
costs money is theirs.

**The pass is bounded like its sibling.** A retrospective SHALL complete within a configurable
wall-clock timeout, defaulting to 120 seconds, and SHALL never extend anything the user is waiting
on: the timeout's expiry takes the empty-artifact outcome of REQ-LIBRARY-023, the same recovery
paths of REQ-LIBRARY-022 and REQ-LIBRARY-023 apply unchanged, and the pass MUST NOT raise into its
caller. While one runs, the application stays fully usable; its activity is signalled per the
pattern of REQ-LIBRARY-125 with its own label, and shutdown cancels it on the terms of
REQ-LIBRARY-127.

**The model.** A retrospective uses a dedicated model slot, `retrospective_model` (nullable string,
default null), with its own `retrospective_model_thinking` companion, persisted and round-tripped
like other slots and resolved on the same fallback rule REQ-LIBRARY-040 fixes for its sibling.
Configuration for the pass follows the shape of section 6: the configuration surface for the
retrospective is exactly the three keys its timeout, its slot and its companion need, and none of
its bounds is exposed beyond them. A workspace with no resolvable retrospective model captures no
pass, and the first time a retrospective gesture is made in that state the product MUST post one
informational notice conveying that no model is configured for the retrospective and offering an
action that opens Settings at the slot — the same refusal-shape REQ-LIBRARY-037 fixes for the
per-run analyst, with the notice per gesture rather than once per workspace, because nothing
happens here that a user did not just ask for by name.

**Why, and what it costs.** The request drew the comparison deliberately: an insights report
(`sessions → patterns, friction, recommendations`) and a feedback loop
(`analysis → proposed instruction changes → future sessions`), and asked for the best of both. The
corpus already holds every primitive: the durable store REQ-SESSION-197 and REQ-SESSION-198 keep,
the export-level record REQ-SESSION-199 guarantees readable, the four-versioned stores the
improvement domain already owns, and a human-gated apply path REQ-LIBRARY-001..064 built. What no
requirement gives is the pass that **reads across sessions** — REQ-LIBRARY-017 forbids the per-run
analyst exactly that: "Data from another run, another session, or another workspace MUST NOT inform
it", which is the right fence for a run's own analysis and the exact reason the corpus cannot meet
this request without a new mechanism. That is the classification: nothing the owner wants is
covered, and nothing covered is wrong — REQ-LIBRARY-015's per-run analyst keeps its scope, its
skip-list and its bounds untouched. Where the owner's two influences part, this product takes the
loop, not the report: Claude Code's `/insights` produces a document a person then acts on, while
Chronicle's `improve` proposes changes to a live instruction file and the product's whole improvement
lifecycle exists to carry proposed changes through review to application with rollback. A report
surface would be a fifth thing this corpus has no home for; a proposal is already a first-class
record with evidence, review, undo, history, export and an executor behind it.

**What it costs.** Three things, stated rather than discovered.

- **Privacy of the record, spent deliberately.** Sessions hold everything a run did — commands,
  tool arguments, file contents. A cross-session pass therefore reads material whose per-run
  handling deliberately never lifts it out of the workspace; REQ-EVENTS-166's export discipline
  survives only because the analysis stays machine-local and writes nothing but proposals to the
  store. The cost is that the pass must be trusted with what the workspace record already holds —
  which is no more than any run of this workspace holds in memory — and nothing may leave the
  machine except what any provider call already carries.
- **A second analysis budget.** The per-run analyst's 60-second pass was sized against one run's
  transcript (REQ-LIBRARY-165's constants); a retrospective reads a workspace's whole record, and
  the same bound would read nothing. The 120-second default is the new spend; it is bounded and it
  is never on anything the user is waiting for.
- **A slot the owner must fill or refuse.** The pass is inert without a configured model — that is
  REQ-LIBRARY-037's shape and it is kept. The cost is one more empty-slot refusal a user can meet;
  it is paid once per gesture, names the exact field to set, and stops there.

> **Extends:** REQ-LIBRARY-003, REQ-LIBRARY-006, REQ-LIBRARY-015
> **New:** no live requirement covers a cross-session analysis pass; REQ-LIBRARY-017 forbids the
> per-run analyst exactly this reach, faithfully to its own scope.

*Raised by the owner, 2026-09-17; logged as [R-033](requests.md#r-033).*

---

<a id="pd-shell-002"></a>

### PD-SHELL-002 — one window is a multi-session host: a second run starts beside the live one

Every main window SHALL behave as the multi-session host REQ-SHELL-125, REQ-SHELL-126 and
REQ-SHELL-127 already describe, and never as the single-run host those same requirements describe
beside it. Concretely:

The "New session" gesture SHALL stay available while a run is active and SHALL open the
"Start session" dialog rather than refusing with "Finish or cancel the active run before starting
a new session.". While any run is active in the workspace, the dialog SHALL lock the isolated
Git worktree on — the default `rotaris/session/<session-id>` (REQ-GIT-007) shown before it is
accepted — with attaching to an existing worktree as the only alternative. A start that still
arrives carrying neither choice while any run is active SHALL force-create the default isolated
tree rather than share the base tree with the live run. Accepting the dialog SHALL release the
window's focus and leave the previous run carrying on in the background; the window SHALL keep
that run's relay subscription, so its background notices and terminal frames still reach the
window while the replica follows only the focused session.

The session browser SHALL stay available while a run is active and SHALL NOT refuse with
"Finish or cancel the active run before switching sessions.". Focusing another session — from
the browser, from the Overview sessions card, or from a notice's focus action — SHALL switch
the window's focus and leave every other run's lifecycle untouched. Focusing a session whose
run is already executing in the background SHALL be allowed: the engine's already-active answer
for that session is a focus switch, not a failure.

A window of another project is untouched by all of this: each project's runs live in the
window open on that project, on the terms PD-SHELL-001 already fixes.

**Why, and what it costs.** The owner works on multiple things in parallel and wants each run
started, watched and steered from the window it belongs to — a second project in its own
window, a second run in the same window. The specification already holds both halves: the run
side fully allows concurrent runs in one workspace (REQ-ORCH-151, REQ-MONITOR-249..252,
REQ-MONITOR-258 with its closed list of five run-active gates), and the shell side already
describes the multi-session host beside the single-run one. What the product built was only
the single-run half, so the faithful requirements read as a refusal where the owner reads an
ordinary working state. The cost is threefold and none of it is hypothetical: focus is now
state the window must hold correctly — every control, the composer target, the sandbox badge,
the recovery state and the terminal attachment re-bind on every switch, and a switch must
never disturb the run it leaves behind; a second concurrent launch must never share the base
tree, which is why isolation is locked on and force-created rather than merely offered; and
the run-active gates that remain — a second start on the handle already running, resuming the
session a run is already executing, the integration and shutdown gates — must keep refusing
exactly as before, because a window that can start anything can no longer lean on one blanket
refusal to protect them.

> **Narrows:** REQ-SHELL-125, REQ-SHELL-126

*Raised by the owner, 2026-09-20; logged as [R-042](requests.md#r-042).*

> **First execution, 2026-09-20:** built alongside this record rather than after it — the
> implementation preceded the paper, so the consultation rule is owed an acknowledgement, not
> a claim. `apps/desktop/src/renderer/main.tsx` (dialog opens while busy with `runActive`
> computed from the focused session plus `session.list`; focus switch keeps background
> subscriptions; already-live resume treated as focus), `apps/desktop/src/main/commands/session.ts`
> (no resume gate; concurrent start force-creates the default isolated tree),
> `apps/desktop/src/run-host/dispatch.ts` (no blanket resume gate; the engine's per-session
> guard stands). `pnpm check` green on symbols, typecheck and lint; tests 2020 passed with
> 2 failures in `terminal.test.ts` real-PTY under full-suite load, each passing isolated —
> the known parallelism flake, unrelated to this change.

---

<a id="pd-tools-002"></a>

### PD-TOOLS-002 — the requested permission mode always applies; no unattended downgrade

**The rule.** The permission mode a run requested SHALL be the mode it runs under — for every
agent in the run, for the whole of the run, with no exception for unattended, unsandboxed, or
unattended-and-unsandboxed runs. Concretely:

- The **requested** mode is selected exactly as today — a persona-level `permission_mode` pin,
  then a session-level override, then `runtime.permission_mode` — and the **effective** mode
  SHALL equal it. Attendedness, confinement status, and `runtime.allow_unsandboxed_autonomous`
  SHALL NOT alter it. The downgraded flag is always false and the downgrade reason is always
  empty.
- This reaches **every agent**: the entry agent, delegated children at any depth, agents built
  later in the same run, and agents already working when the mode is changed mid-session. A
  session-level override records the requested name; agents built later apply it directly, with
  no re-resolution against attendedness, confinement, or the opt-in. A mid-session change is
  applied directly to every live policy context and to the recorded override, likewise with no
  re-resolution.
- There are **no downgrade artifacts**: no `permission_mode_downgraded` timeline event, no
  transcript downgrade message, no downgrade log warning, and no downgrade reason string. The
  run-start announcement (REQ-TOOLS-071, REQ-SANDBOX-104, REQ-SANDBOX-110) records the
  requested (= effective) mode together with the sandboxed flag and the backend name from one
  reading of status.
- The unattended advisory SHALL be empty for an `autonomous` run — it proceeds, and nothing is
  shown. For `ask` and `restricted` the advisory behaves as today except that it SHALL never
  claim a downgrade was applied. The advisory requirements (REQ-TOOLS-072, REQ-TOOLS-192,
  REQ-SANDBOX-107) still govern that behaviour; this directive only removes the downgrade
  sentence from it.
- `runtime.allow_unsandboxed_autonomous` is retained as an inert key — same name, same default
  `false`, same layering — and SHALL have no effect on any run. A board run granted both the
  preset and the opt-in still satisfies its elevation; a run granted the preset alone now
  satisfies it too.

What is **unchanged**: a run that requests confinement the host cannot deliver still does not
start; a confinement failure at command time still refuses with `sandbox_unavailable` rather
than running unconfined; genuine `ask` decisions — from the `ask`/`restricted` presets and
from the ask rules — are still settled by the headless approval policy where no prompt can be
shown; the persona-pin direction (tightening reaches a pinned agent, loosening does not) still
holds; the audit and timeline shapes (REQ-TOOLS-082, REQ-MONITOR-153) are unchanged, carrying
`downgraded: false`, an empty
reason, and `skipped_personas` as today; the no-confinement disclosure of REQ-SANDBOX-130 is
still shown wherever it is shown today; the mode flag (REQ-WORKSPACE-022) shows the requested
(= effective) mode; and the retired TUI/CLI texts are not product behaviour
and are untouched by this directive.

**Why, and what it costs.** The owner selects `autonomous` and means it: an unattended run
without a sandbox SHALL run autonomous rather than be tightened to `ask`. The specification is
faithful — the downgrade is exactly what REQ-TOOLS-067 fixes — and the product is changing
anyway. What is given up is the fail-safe: an autonomous run now executes with the autonomous
default (allow) under no confinement, held only by the destructive deny rules, the path fence,
and the egress policy. Unanswered `ask` decisions still refuse via the headless policy, so a
run under `ask` that nobody watches still parks rather than proceeds; only `autonomous` stops
asking. This directive also settles the recorded defect of a mid-session switch to autonomous
not reaching agents built later: with no re-resolution step left, there is nothing stale left
to resolve through.

> **Supersedes:** REQ-TOOLS-067, REQ-TOOLS-068, REQ-TOOLS-070
> **Narrows:** REQ-TOOLS-048, REQ-TOOLS-069, REQ-TOOLS-073, REQ-TOOLS-125, REQ-SANDBOX-052, REQ-SANDBOX-098, REQ-SANDBOX-099, REQ-SANDBOX-101, REQ-SANDBOX-103, REQ-SANDBOX-105, REQ-SANDBOX-106, REQ-SANDBOX-107, REQ-SANDBOX-110, REQ-CONFIG-124, REQ-CONFIG-411, REQ-TRACE-470

---

<a id="pd-workspace-002"></a>

### PD-WORKSPACE-002 — instruction files are picked up beyond the workspace and switched per file

**Discovery.** The workspace root holds four instruction-file names, in this order: `AGENTS.md`,
`AGENTS.override.md`, `CLAUDE.md`, `CLAUDE.override.md`. `AGENTS.override.md` suppresses `AGENTS.md`
alone, and `CLAUDE.override.md` suppresses `CLAUDE.md` alone; the two pairs are independent, so a
workspace holding an override and the other pair's base contributes the override and that base.

Beyond the workspace, instruction files are read from five further bases, in this order, mirroring
the skill user-scope roots of REQ-WORKSPACE-051: the Rotaris global configuration directory (the
per-user scope of REQ-CONFIG-001, beside `agents.yaml`); `~/.agents`; `~/.config/opencode`;
`~/.openhands`; and `/etc/codex`, which is consulted on platforms with an `/etc` hierarchy only,
on the same rule REQ-WORKSPACE-051 fixes for skills. Each of those bases holds at most two names:
`AGENTS.md`, then `CLAUDE.md`. No ancestor, repository root or intermediate directory is consulted
for instruction files — the project scope stays the workspace root the owner chose — and no other
file name is read.

**Order.** The merged output follows discovery order: the workspace pair or pairs first, then the
global directory, then the three home-relative bases in the order named above, then the
machine-wide base. Within one base `AGENTS.md` precedes `CLAUDE.md`. Each contributing file's
block keeps the one-line `<!-- source: {absolute path} -->` comment and the blank-line separation
REQ-WORKSPACE-043 fixes; a file switched off contributes nothing, not even its source comment.

**The inventory.** The Instructions category lists every present file, each row carrying a stable
identity, its file name, its source, its absolute path, and whether it is switched on. The source
reads `workspace` for the workspace root, `global` for the global directory, `user (~/.agents)`,
`user (~/.config/opencode)`, `user (~/.openhands)` for the three home-relative bases, and
`machine (/etc/codex)` for the machine-wide base.

**The switches.** Each row carries a per-file on/off switch. The policy is the section-class
`instructions:` key, holding an `overrides` map from the row's stable identity to `on` or `off`;
absent means `on`. The map overlays per file, so a workspace file naming one file leaves every
other file's inherited policy standing. The master switch `inject_agents_md` stands above all of
them: while false no context file is read at all, whatever the per-file policies say. The screen
holds the switches pending like every other destination-1 value — Save writes them into the
workspace file sparsely (an `on` that returns a file to its baseline removes that file's key,
unless a lower layer states a policy for it, in which case the baseline is written explicitly),
Discard restores them, and the save bar governs them. The empty states name the files to create.

**Injection.** The workspace-context injection of REQ-WORKSPACE-047 consumes the enabled set — the
present files whose per-file policy is `on` — in discovery order, under the master switch, and is
built in the same round as the switches. It had to be: that mechanism was an empty slot in the
context-unit list when this directive was drafted, so switches shipped without it would have been
switches over nothing. Within the enabled set an override suppresses its own base, which is where
REQ-WORKSPACE-042 meets a third state it has no word for — a file that exists and is switched off —
resolved over the enabled set rather than over presence and logged as **OQ-64**.

**Why, and what it costs.** The owner keeps standing instructions in more than one place — a
global `AGENTS.md`, a project's `CLAUDE.md` in the Claude Code convention — and wants individual
files silenced without deleting them. The specification faithfully forbids both halves: the
workspace-root-only closed rule names `CLAUDE.md` and every global location as never read, and the
settings screen offers no per-file switch on purpose. The costs are three. A second precedence
dimension: scope order decides sequence, the per-file switch decides membership, and the master
switch decides everything — three facts a reader must hold where one sufficed. A wider reach: a
file under the home directory or the machine-wide directory now reaches an agent's context, which
is the same trust consideration the machine-wide skill root already carries and states with its
rule. And a workspace file now governs files that do not live in it: the policy for a global file
is recorded in the workspace that silences it, so a user reading the global file sees a file that
no longer governs everywhere.

**Where REQ-CONFIG-464 sits.** That requirement's "no per-file switch over individual instruction
files" clause states its own ground in the same breath — "the Instructions category remaining a
read-only inventory (REQ-CONFIG-276, REQ-CONFIG-277)" — so the two inventory requirements are what
this directive narrows, and the clause stops governing with them. REQ-CONFIG-464 is deliberately
**not** named in the dispositions below: `PD-CONFIG-001` already narrows it for the MCP-grant half,
one requirement carries one narrowing directive so that precedence is unambiguous, and the two halves
are unrelated subjects that no single revision could honestly hold. Its back-pointer says as much.

> **Narrows:** REQ-WORKSPACE-041, REQ-WORKSPACE-042, REQ-CONFIG-276, REQ-CONFIG-277, REQ-TOOLS-165
> **Extends:** REQ-CONFIG-040, REQ-CONFIG-047, REQ-WORKSPACE-043, REQ-WORKSPACE-048, REQ-CONFIG-256, REQ-CONFIG-258, REQ-CONFIG-417, REQ-WORKSPACE-039

*Raised by the owner, 2026-09-21; logged as [R-046](requests.md#r-046).*

---

<a id="pd-tools-003"></a>

### PD-TOOLS-003 — the `FAILED ` marker matches in capitals only

Of the five literal failure markers REQ-TOOLS-113 searches for in the output of a command that exited 0,
the fifth, `FAILED ` (with its trailing space), SHALL match **case-sensitively**: the output must contain
exactly `FAILED ` in capitals for it to warn. `failed `, `Failed ` and every other casing SHALL NOT
produce the marker warning.

Everything else REQ-TOOLS-113 fixes still governs unchanged. The other four markers are still searched
case-insensitively; the order of the five, the single marker warning naming the earliest marker present,
the error-count check, the test-runner banner check (which still matches `failed` in any casing inside a
`=`-framed line), the pipeline check, and the de-duplication rule are untouched.

**Why, and what it costs.** Test runners print this marker in capitals (`FAILED tests/test_a.py::test_x`,
`FAILED (failures=1)`), and the false warnings the product raised came from ordinary lower-case prose —
Docker's `failed to connect to the docker API` and a line of git output. Each false warning cost the
agent a second pass over the whole output to decide it was harmless. What is given up: a tool that
reports a real failure in lower case with `failed ` and still exits 0 is no longer flagged by this
marker. That combination is rare, because a runner whose tests fail exits non-zero; and a `=`-framed
banner containing `failed` in any casing still warns through the banner check.

> **Narrows:** REQ-TOOLS-113

*Raised by the owner, 2026-09-23; logged as [R-048](requests.md#r-048).*

---

<a id="pd-tools-004"></a>

### PD-TOOLS-004 — a session approval of a file write covers that path

A session approval (REQ-TOOLS-052, "approve for session") granted to a call of `write_file` or `haet_edit`
(including its alias `haet`) SHALL match a later call when all three of these hold, whatever the rest of
its arguments:

- the later call names the **same tool**, the alias `haet` counting as `haet_edit`;
- it comes from the **same persona**;
- its path arguments — the argument keys REQ-TOOLS-018 considers, resolved against the workspace root as
  that requirement resolves them — resolve to **exactly the same set of paths** as the approved call's.

The `write_file` operation (REQ-TOOLS-135) is not part of the match: approving an `edit` of a path for the
session also covers a later `overwrite`, `insert` or `undo` of the same path from the same persona. A call
any of whose paths cannot be resolved never matches under this directive, and a call carrying none of
REQ-TOOLS-018's path keys falls back to the exact-argument match REQ-TOOLS-024 states.

Everything else REQ-TOOLS-024 fixes still governs: every other tool — `terminal`, `fetch`, `git_commit`,
the remaining public tools, every MCP tool and every plugin tool — is still matched on the command facet or
the exact argument set; the tool name is still compared case-insensitively; and the session rule's
description still reads `Approved for this session: <request summary>`.

**Why, and what it costs.** An agent whose edit is refused retries it with a different `old_string`, and
under the exact-argument rule no session approval could ever cover a retry. "Approve once" was the only
answer that did anything, and the user paid one approval per retry: a single edit loop on one file in run
`1ddeb71b` interleaved six approvals with its failures. With this directive one session approval covers
the loop. What is given up: approving one write to a path for the session now also approves, for that
persona, every later write to that path in the session, including an overwrite of the whole file. The grant
is still bounded by the path, the tool and the persona. MCP edit tools are left out because their arguments
declare no path the policy can read, so for them a path-scoped match could only be guessed.

> **Narrows:** REQ-TOOLS-024

*Raised by the owner, 2026-09-23; logged as [R-048](requests.md#r-048).*

---

<a id="pd-tools-005"></a>

### PD-TOOLS-005 — after one unanswered approval, a run treats the user as away

When an approval wait in a run ends by **timeout** (REQ-TOOLS-052's first mapping), the run SHALL treat
the user as **away**. While the user is away, every further ask in that run that would put an approval
prompt in front of the user SHALL instead be resolved at once, with no prompt and no wait, exactly as
REQ-TOOLS-065 resolves an ask in a session with no approval presenter: under `runtime.headless_approval_policy`
`deny` the call is refused and the agent may re-plan; under `abort` the call is refused and the run is
stopped on the terms that requirement states. The decision source is `headless-policy`. The reason SHALL
state that the user is treated as away because an earlier approval in this run went unanswered for `<N>`
seconds, where `<N>` is the timeout that expired; it SHALL NOT claim that no approval UI is available.

The user **returns** — and the run stops treating them as away — on the first input they send to that run's
session: an answer to an approval or to a question, a message, a run control, or a permission-mode change.
The away state belongs to one run: it reaches every agent in that run, delegated children included, and it
ends when the run ends, so no later run starts with it.

Unchanged: the first approval still waits the full `runtime.approval_timeout_seconds` and still ends with
REQ-TOOLS-052's timeout reason; a timeout of 0 still waits without limit, so a run configured that way is
never marked away; questions put to the user (REQ-TOOLS-158, REQ-TOOLS-178) still prompt and wait while
the user is away; and asks resolved by a rule without prompting are unaffected.

**Why, and what it costs.** Run `1ddeb71b` spent about 600 seconds on two approvals nobody was present to
answer, each one denied only after its own full wait. An unattended stretch of a run paid the whole timeout
per ask before failing closed. After this directive it pays one timeout, and every later ask in that
stretch fails closed at once. The default stays 300 seconds, so a user at the desk still gets the full
window for the first prompt. What is given up: a user who steps away for longer than one timeout and comes
back finds the asks raised in between already denied (or the run stopped, under `abort`) rather than
waiting for them; answering or writing anything to the session ends that.

> **Narrows:** REQ-TOOLS-052, REQ-TOOLS-055

*Raised by the owner, 2026-09-23; logged as [R-048](requests.md#r-048).*

---

<a id="pd-orch-004"></a>

### PD-ORCH-004 — a child cut off while making progress hands its work back to the parent

REQ-ORCH-088's expiry path still runs in its order: the child is gracefully paused; if the role has a
configured fallback model not yet attempted for this child, it is retried once on it; otherwise it is
recorded failed with a timeout issue and a report of the form "Child timed out after <N>s" carrying the
last response extracted from its transcript. This directive adds to that last step, and only for a child
that was **making progress** when it was cut off.

A child is **making progress** when it completed at least one tool call within the final
`runtime.child_stall_timeout` seconds before its `runtime.child_timeout` expired. For such a child the
failed record's report SHALL additionally carry:

- a statement that the child was cut off while making progress;
- the workspace paths the child's own file-writing calls changed during its run, in the order first
  changed, or a statement that it changed none;
- a **continuation offer** to the parent: the remaining work may be delegated to a new child as a
  continuation of this one.

A child delegated as a continuation carries that relationship in its record. A continuation that itself
times out while making progress SHALL receive the first two items and SHALL NOT receive a continuation
offer, so a piece of work is continued once and never chained.

Unchanged: the child still ends `failed` with its timeout issue; the per-child limit and its default are
untouched; a child that was not making progress gets exactly REQ-ORCH-088's report; and REQ-NOTIFY-112
still holds that a child whose own `runtime.child_timeout` was exceeded is not recovery-eligible and earns
no corrective message — the continuation is the parent's decision, never an automatic resume.

**Why, and what it costs.** In run `2e21e324` two children were cut off at 1200 seconds after 110 and 113
tool calls. They were working, and the failure discarded what they knew about their own progress, leaving
the parent to rediscover it. The report now hands back what a continuation needs. What it costs: a longer
report for these children, and one more relationship in the child record. The limit itself is not raised,
so a child that genuinely loops is still stopped at the same point.

> **Narrows:** REQ-ORCH-088

*Raised by the owner, 2026-09-23; logged as [R-048](requests.md#r-048).*

---

<a id="pd-monitor-002"></a>

### PD-MONITOR-002 — the application log keeps `info` and above

The application log — the main process's log, distinct from the per-session debug log of REQ-MONITOR-238
and REQ-SESSION-142 — SHALL carry a level on every line as a field rather than as text inside the message,
and SHALL record a line only when its level is at or above a threshold. The threshold is `info` by default.
Lines forwarded from a child process (the run host, the workspace service) keep the level the child gave
them and are filtered by it like any other line.

The threshold SHALL be changeable only through the environment variable `ROTARIS_APP_LOG_LEVEL`, read once
at start, accepting `debug`, `info`, `warning` and `error` in any casing; an unset or unrecognized value
means `info`. No configuration key, settings control or other surface sets it, and `session_log_level`
(REQ-CONFIG-121) does not reach it.

A line that another requirement obliges the product to write to the application log (REQ-TOOLS-171,
REQ-HOOKS-102, REQ-HOOKS-138, REQ-SANDBOX-071, REQ-LIBRARY-035, REQ-LIBRARY-047, REQ-LIBRARY-124) SHALL be
written at `info` or above, so the default threshold never drops it.

**Why, and what it costs.** A launch log measured on 2026-09-16 held 195 lines, 141 of them one MCP
server's `debug` stderr. Nothing in the specification set a level for this log, which is why OQ-63 was
raised; this directive is the owner's ruling on it. A developer diagnosing a child process restores the
detail with one variable, and the log a packaged build keeps is the one a person can read after an
incident. What is given up: `debug` lines from a packaged build that was not started with the variable
are not recorded, and cannot be recovered afterwards.

> **New:** no live requirement covers this.

*Raised by the owner, 2026-09-23; logged as [R-048](requests.md#r-048).*

---

<a id="pd-tools-006"></a>

### PD-TOOLS-006 — a delegated child may declare a write scope that its siblings may not write into

**The argument.** `delegate` SHALL accept one further optional action field, `write_scope`: a list of
path patterns relative to the workspace root, in the pattern dialect of the `glob` tool (REQ-TOOLS-138 to
REQ-TOOLS-141: `*`, `**`, `?` and `{a,b}`). A delegation whose `write_scope` holds an empty pattern, an
absolute pattern, or a pattern that reaches outside the workspace root SHALL be rejected, with a reason
naming the pattern.

**The claim.** From the moment a child carrying a `write_scope` is accepted until it reaches a terminal
state, it **claims** every workspace path its patterns match. A call of `write_file` or `haet_edit`
(including its alias `haet`) whose target path is claimed SHALL be refused before it executes when the
calling agent is any agent of the same run other than the claiming child and that child's own descendants.
The refused callers therefore include the claiming child's siblings, its parent and the run's entry agent.
Every `write_file` operation counts as a write, `undo` included. Where the patterns of two live children
match the same path, the child accepted first holds that path. A claim lapses when its child reaches a
terminal state.

**The refusal.** The call's status is `blocked`. The reason names the path, the claiming child's canonical
name and persona, and the pattern that matched, and it points to the two ways forward, in this form:
`<rel> is inside the write scope of <canonical_name> (<persona>), which is still running: '<pattern>'. The
write was not executed. Choose a path outside that scope, or wait for <canonical_name> with wait_for_tasks.`

**The disclosure.** A child's payload SHALL carry one further block, immediately after the workspace-root
prefix of REQ-TOOLS-154: the child's own `write_scope` when it has one, and the `write_scope` of every
other child of the run that is live when this child is accepted, each under that child's canonical name.
The block is omitted when there is nothing to list.

**What is unchanged.** A child delegated without a `write_scope` claims nothing and is refused only where a
live sibling's claim reaches. A `write_scope` never limits the child that declared it: that child may write
outside its own patterns wherever no other claim reaches. Claims belong to one run and are never persisted,
so a resumed session starts with none. Reading is never refused by a claim.

**Why, and what it costs.** In run `2e21e324` two children writing in one checkout refused each other three
times and one of them spent turns discovering its sibling's file by hand. Both of the product's guards held
(the hash guard and the create-guard), so nothing was lost; the cost was that each child learned about the
other only at the moment of writing. A declared scope moves that knowledge to the start: the parent says
which paths each child will write, each child is told at start which paths belong to someone else, and a
write that crosses a live claim is stopped with the name of its owner. What it costs:

- **The file tools only.** `terminal`, `git_commit`, MCP tools and plugin tools can still write a claimed
  path, because none of them passes through the file tools' path handling. The claim is a coordination
  mechanism for agents that use the file tools, which is the case the run observed.
- **The parent has to declare.** A parent that spawns parallel writers without scopes gets exactly today's
  behaviour. Claims made automatically by the first writer were considered and not chosen, because they
  would still surface the collision only at write time.
- **The parent is refused too.** A parent that wants to write into a live child's scope waits for the child
  or writes elsewhere.

> **Narrows:** REQ-TOOLS-152, REQ-TOOLS-154
> **Extends:** REQ-ORCH-028

*Raised by the owner, 2026-09-23; logged as [R-049](requests.md#r-049).*

> **First execution, 2026-09-23, the day it was ruled:** the mechanism was built as written, and one clause of
> the disclosure proved false for one reader. The block lists "the `write_scope` of every other child of the run
> that is live", and a child's own descendants are exempt from its claim, so a grandchild delegated by a scoped
> child is shown its ancestor's scope among the paths that are refused to it. The build lists the scope as the
> directive requires and marks it as belonging to an agent the reader works under, whose scope does not fence it.
> Two placements were decided by the code rather than by the text: the refusal is the **gate's** (an executor can
> answer only `ok` or `failed`, and `blocked` is the gate's status), and it is taken **ahead of the permission
> resolution**, so a write the claim refuses never costs the user an approval first. The block follows the
> workspace-root line, which `childPayload` places after the artifact blocks rather than first, as
> `REQ-TOOLS-154` requires; that order is recorded as a defect of its own and is not changed here. The row is in
> [`../architecture/first-executions.md`](../architecture/first-executions.md).

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
