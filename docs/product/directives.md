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

**Twenty-eight.** The count here is the number of entries below, written nowhere else so that it cannot go
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

*Revision 4 (2026-09-28, [R-064](requests.md#r-064)) — **the notices row and the paused continues**: two sentences of
"The strip" are replaced and a paragraph is added; the owner's ruling on OQ-98.
Revision 3 (2026-09-18, [R-041](requests.md#r-041)) — **the compact strip**, below.
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
SHALL carry every input control the composer draws: the persona selector, the model selector, the
reasoning-effort, run-start-mode and permission-mode value chips, the attach, stash, steer and
pause actions, the token estimate, and the send pill, or on a paused session the two continues that
take its place. A notice and the action that belongs to it — the plan gate's hint, the pause's
statement, the count of agents a continue resumes and "Continue without them" — SHALL stand in the
notices row below the dock; no other control stands outside the dock, and the strip draws no
explanatory sentence as visible text — REQ-CHAT-007's two-channel rule (tooltip plus accessible
description) carries what the strip does not show (revision 4).

> Revision 3 said, and no longer governs: "The strip SHALL carry every control the composer draws: … and the send pill.
> No control SHALL stand on a second chip row outside the dock, and no explanatory sentence SHALL be drawn as visible
> text". The Continue action's count and decline (PD-ORCH-005 clause 6) are a notice's line and its action, and in the
> strip they wrapped it to three lines at the product's default window (OQ-98).

**The paused continues (revision 4).** On a paused session the send pill's place is taken by two continues, which carry
short labels at every density, as the pill does: `Continue`, named `Continue run`, and `Send`, named `Continue with a
message`. Each states its full name as its accessible name and its tooltip. `Send` takes its word from the send pill it
stands in for.

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
2026-09-18; logged as [R-041](requests.md#r-041). Revision 4 logged as [R-064](requests.md#r-064).*

> **First execution of revision 4, 2026-09-28, ruled by [R-064](requests.md#r-064) and built with `PD-ORCH-005` revision 4
> under [R-065](requests.md#r-065):** the revision was built as written. The notices row already held the plan gate's
> hint, the pause's statement, the Continue action's count and "Continue without them"; the build added the tests that
> pin each there, and the paused strip's second continue now reads `Send`, named `Continue with a message`. The text met
> the code in two places, recorded in [OQ-103](../architecture/open-questions.md) and [OQ-108](../architecture/open-questions.md):
> - on a session a crash left, the two continues take the send pill's place as on a paused one;
> - three controls stand outside the dock and outside the notices row, and are read as outside this sentence: REQ-CHAT-021's
>   command banner, the refusal line with its recovery action, and REQ-CHAT-169's attachment list.
>
> **What was measured.** `continue-action.test.ts`; in the built app, the paused strip as one band
> with `Continue` and `Send`, and the count and the decline in the notices row, on a paused and a crash-left session.
> The row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).

<a id="pd-chat-002"></a>

### PD-CHAT-002 — structured questions present an auto-opened, docked all-in-one form and a rendered transcript summary

*Revision 2 (2026-09-28, [R-064](requests.md#r-064)) — **a prompt the application's quit dismisses**, the last sentence
of the second paragraph; the owner's ruling with PD-ORCH-005's OQ-96.*

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
dismissing the prompt SHALL cancel the questions and immediately release the waiting tool call —
except a dismissal the application's quit causes, which SHALL cancel nothing: the quit withdraws the
questions under `PD-ORCH-005` clause 9, and a withdrawn question is never an answer (revision 2).

> Revision 1 said, and no longer governs: "pressing Escape or dismissing the prompt SHALL cancel the questions and
> immediately release the waiting tool call." A quit dismissed the prompt as its window unloaded, and the questions
> were recorded as cancelled by the user ahead of the quit's withdrawal.

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

*Raised by the owner, 2026-09-13; logged as [R-011](requests.md#r-011). Revision 2 logged as [R-064](requests.md#r-064).*

> **First execution of revision 2, 2026-09-28, ruled by [R-064](requests.md#r-064) and built with `PD-ORCH-005` revision 4
> under [R-065](requests.md#r-065):** the sentence was already built when the owner ruled it; main drops the dock's
> cancellation while the application quits. The build re-cited that guard to this revision, and found one case beside
> it: a question pending in a plan cycle when the quit lands was cancelled by the run. A stop or a quit during a plan
> cycle now withdraws it ([OQ-108](../architecture/open-questions.md)).
>
> **What was measured.** `session.test.ts` and `plan-gate.test.ts`, each red when its limb is reverted. **What was not
> measured.** No built-app quit with a question open was driven for this revision; phase 7 of revisions 2 and 3 drove
> one. The row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).

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

*Revision 2 (2026-09-28, [R-064](requests.md#r-064)) — **a resumed iteration and the gate**, a paragraph added after
the rule; the owner's ruling on OQ-97's third question. Nothing is replaced.*

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

**A resumed iteration and the gate (revision 2).** A continue that resumes an iteration a rest left open (`PD-ORCH-005`
clause 4) SHALL run that iteration without holding it at the gate, whatever the run-start mode and whether or not the
session holds a release, since it is work already under way. When the gate would hold that run, because the session
holds no release and the mode is `plan` or the release was re-armed, it SHALL hold before the first new iteration the
run begins. The build of PD-ORCH-005 held neither the resumed iteration nor the new ones after it (OQ-97). The owner
ruled that re-arming asks for a plan before new work, and the resumed iteration is not new work.

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

*Raised by the owner, 2026-09-17; logged as [R-035](requests.md#r-035). Revision 2 logged as [R-064](requests.md#r-064).*

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
as [`a-chip-option-announces-its-label-and-hint-as-one-word.md`](../defects/fixed/a-chip-option-announces-its-label-and-hint-as-one-word.md)
and deliberately not repaired here. The row is in
[`../architecture/first-executions.md`](../architecture/first-executions.md).

> **First execution of revision 2, 2026-09-28, ruled by [R-064](requests.md#r-064) and built with `PD-ORCH-005` revision 4
> under [R-065](requests.md#r-065):** the rule was built as written. A run that resumes an open iteration runs it unheld;
> when the gate would hold the run, it parks before the first new iteration, and its plan cycle is told the pending
> tasks and what became of the continue's message. Building it found every approved prompt worked twice, because a
> plan decision's relaunch appended the gated prompt as a second task
> ([`a-plan-decision-appends-the-gated-prompt-as-a-second-task.md`](../defects/fixed/a-plan-decision-appends-the-gated-prompt-as-a-second-task.md),
> repaired: the relaunch appends none). The text met the code in these places, each recorded in [OQ-104](../architecture/open-questions.md):
> - an iteration a crash left open runs unheld once the crash is recorded, as a rest's does;
> - the message limit, checked as the resumed iteration closes, wins over the hold;
> - the held plan cycle is sent the handoff the continue built;
> - no surface re-arms the gate on a paused session, since the run-start control is disabled there (REQ-CHAT-006).
>
> **What was measured.** `plan-gate-resume.test.ts` and `plan-text.test.ts`, each limb red when reverted. In the built
> app, a plan-mode session paused mid-iteration, re-armed by command and continued: the resumed iteration ran unheld,
> and the gate held before the next one.
>
> **What was not measured.** No live run was made. The row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).

<a id="pd-monitor-001"></a>

### PD-MONITOR-001 — a cost the provider reported is carried and shown under its own qualifier

*Revision 3 (2026-09-29, [R-067](requests.md#r-067)) — **the floor**: ESC-42's ruling carried into the rendering of a
figure with no currency, below. The label table is unchanged.*

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

A figure whose currency the provider does not name SHALL be rendered as the amount alone, under
`REQ-PROVIDER-121`'s rule — half-up, two decimal places, four below one hundredth, and the floor `< 0.0001` for an
amount greater than zero that would otherwise read as zero — and SHALL NOT be given a currency symbol the product
chose for it (revision 3). The floor fills a label's `<amount>` as any rendered figure does, so the table above is
unchanged: a run whose priced requests came to more than zero and less than 0.00005 reads `< 0.0001 at configured
rates`, `< 0.0001 reported by the provider`, or `at least < 0.0001; some requests have no price`, and each of those is
true. The figure recorded with the qualifier is the exact one; the floor is rendering only.

> **Revision 2 said, and no longer governs:** "A figure whose currency the provider does not name SHALL be rendered as
> the amount alone, under the rounding of `REQ-PROVIDER-121` — half-up, two decimal places, four below one hundredth —
> and SHALL NOT be given a currency symbol the product chose for it." Under that rounding a run priced at more than
> zero and less than 0.00005 read `0.0000 at configured rates`: a figure that says it was priced and reads as nothing,
> which `REQ-SHELL-045` says never happens. ESC-42 was ruled option (b) on 2026-09-29, and `REQ-PROVIDER-121` now
> carries the floor this sentence restates.

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
  [`a-delegated-childs-provider-requests-never-reach-the-runs-totals.md`](../defects/fixed/a-delegated-childs-provider-requests-never-reach-the-runs-totals.md)
  is part of building this revision.

> **Narrows:** REQ-MONITOR-166, REQ-PROVIDER-121

*Raised by the owner, 2026-09-16; logged as [R-026](requests.md#r-026). Revised 2026-09-23; logged as
[R-049](requests.md#r-049). Revision 3, 2026-09-29, logged as [R-067](requests.md#r-067) with the ruling of ESC-42.*

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

<a id="pd-shell-003"></a>

### PD-SHELL-003 — the main window carries one product-drawn frame on every desktop

On Windows, Linux and macOS, the main window SHALL show no native frame, application menu, menu bar or toolbar above
the product. Its product-drawn title bar SHALL be the window's visible top frame and SHALL retain the
title "Rotaris" together with every item and ordering REQ-SHELL-033 already fixes.

At the right edge of that title bar, after the existing title-bar contents, the product SHALL draw three
keyboard-reachable window controls in this order: minimize, maximize or restore, and close. Each SHALL
carry an accessible name and a matching tooltip. The middle control SHALL read and perform "Maximize"
while the window is not maximized and "Restore" while it is maximized. Double-clicking an otherwise
inactive part of the title bar SHALL make the same maximize-or-restore transition. Minimize and
maximize/restore SHALL act on the main window that raised the command. Close SHALL enter the existing
close flow, including the unsaved-settings, worktree-integration and active-run guards; it SHALL NOT
bypass or duplicate them.

The controls and draggable region SHALL use the adopted design language: title-bar ground, neutral icon
ink, hover wash, an in-bounds focus ring, and danger ink only while the close control is hovered or
focused. Interactive title-bar contents and all three controls SHALL remain outside the draggable region.
The product SHALL use the same controls and command path on Windows, Linux and macOS rather than branching to a
different renderer surface per platform. Other application windows retain their existing native frame.

**Why, and what it costs.** The native Electron menu bar adds a second, host-styled band above the shell
and makes the product's specified title bar read as content rather than window chrome. One product-drawn
frame removes that duplicate hierarchy and keeps the main window visually consistent across every
supported desktop host. The cost is that the product now owns three pieces of
platform behaviour that the host previously drew: the controls must remain operable by keyboard and
pointer, the maximize state must stay truthful after host-driven changes, and the close control must
continue through the guard rather than destroying the window directly. Auxiliary dialogs and pop-outs
keep their native frame because extending custom chrome to every role would enlarge the change without
answering the duplicate main-window toolbar the owner identified.

> **Extends:** REQ-SHELL-022, REQ-SHELL-033, REQ-SHELL-119

*Raised by the owner, 2026-09-24; logged as [R-050](requests.md#r-050).*

> **First execution, 2026-09-24:** the frameless-window options, all four command outcomes and the three
> rendered controls passed their focused tests; the whole unit suite passed 2,168 tests with 26 skipped;
> typecheck, lint and the production build passed. `pnpm app:drive` was attempted twice and its child Electron
> could not connect to this host's Wayland socket. A normal development launch then painted the main window;
> its log records `main window 1 loaded`. The driver/CUA interfaces still exposed no target for inspecting its
> pixels or exercising pointer gestures, so the screenshot and live control gestures remain unverified.
>
> **Revision 2, 2026-09-24:** the owner extended the same product-drawn frame to macOS after reviewing the
> first implementation. The main window is now frameless on all three supported desktops; auxiliary senders
> are refused before any frame command acts, Electron's default application menu is removed rather than merely
> hidden, and the control group has an exposed accessible name. Electron's
> draggable region owns native double-click maximize/restore; the renderer listens to resize to keep its icon
> truthful rather than expecting a pointer event that Electron deliberately withholds from draggable regions.

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
resolved over the enabled set rather than over presence and logged as **OQ-64**. The owner ruled OQ-64
on 2026-09-27 ([R-052](requests.md#r-052)) for that reading: an override suppresses its base only while the
override is itself switched on, so switching an override off returns its base to the merge, and the
inventory shows no *suppressed* row state.

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

> **First execution, 2026-09-27, built under [R-055](requests.md#r-055):** the rule held as written, and building it
> moved one thing the text does not name. Since 2026-09-22 the marker warning quotes the line the marker matched on,
> and that line was found by a second, lower-cased search of its own. Narrowing only the search would have left an
> output with `failed ` on an earlier line and `FAILED ` on a later one warning on the capital line while quoting the
> lower-case one. The casing is therefore stated once, on the marker, and one predicate serves both the search and the
> quoted line (`packages/agent-tools/src/terminal/classify.ts`). Two unit assertions had pinned the old reading. One
> had a lower-case `==== 1 failed ====` banner raise the marker warning and the banner warning; it now uses a capital
> `==== 1 FAILED ====` banner, which still raises both, and a new case pins a lower-case banner raising the banner
> warning alone, the banner check still catching it as the cost paragraph above says. The other expected run
> `2e21e324`'s docker line to be quoted in a marker warning; it moved to a case of its own, which now expects no
> warning and `success`. ADR-0020's "consequence 2 as met today" stated the banner reading as conformant; the sentence
> is kept there with a dated note beside it. The live run's `failed-word` shape printed `FAILED` in capitals, the
> other side of the rule from the record it claimed to replay. It now prints the record's lower-case docker line and
> checks that the line reached the output at exit 0 with no marker warning and no `suspicious_success`, a regression
> guard as `diff-exit-1` is for ESC-41. Writing that guard's positive half found that the here-string's own check
> reads its command back and cannot fail, recorded as
> [`the-here-string-check-reads-its-own-command-back.md`](../defects/fixed/the-here-string-check-reads-its-own-command-back.md).
> Two things were not measured. Run `2e21e324`'s git line is not recorded verbatim anywhere in the record, so only its
> docker line is replayed. And the guard has not run against a real endpoint; the next live run of `terminal` is its
> first. The row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).

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

> **First execution, 2026-09-27, built under [R-057](requests.md#r-057):** the rule held as written; building it
> found that it is silent on when the approved call's paths are resolved, and that the policy's existing path
> resolution does not do what REQ-TOOLS-018 says. The persona needed nothing: it was already carried on every call
> and stored in every grant. **When:** the grant resolves its paths once, when it is made, and a later call's paths
> are resolved when it is evaluated. Resolving both at evaluation would let a link retargeted after the approval
> carry the grant to a file the user never approved; a test pins a retargeted link asking again, and a link to the
> approved file matching. **How:** each path is joined to the workspace root first (`resolveInWorkspace`) and then
> handed to the gate's real-path resolver. The path scope of REQ-TOOLS-018 skips the join and hands the resolver the
> raw argument, which the run host resolves against its process directory, dropping a character when none of the
> path exists there; that is recorded as
> [`path-scope-resolves-a-relative-path-against-the-process-directory.md`](../defects/fixed/path-scope-resolves-a-relative-path-against-the-process-directory.md)
> and not changed here. **Which tool:** the name alone does not say it. A persona's MCP surface prefixes a server's
> tool only when its name is already taken, so a server's own `write_file` reaches a persona whose public set lacks
> one as plain `write_file`, and the first build, keyed on the name, scoped its approval by path against the
> directive's "every MCP tool". The independent review found it; the gate now takes a `publicTool` predicate from the
> run host, true only when the callable map holds the very executor `executorsFor` built for the name, and only the
> public `write_file` and `haet_edit` are scoped by path, on the grant and on the later call alike, so a public
> `haet_edit` grant does not reach a server's `haet` through the alias. The policy's other readers still take such a
> tool for the public one by name; that is recorded as
> [`an-mcp-tool-offered-under-a-public-name-is-ruled-as-that-public-tool.md`](../defects/fixed/an-mcp-tool-offered-under-a-public-name-is-ruled-as-that-public-tool.md)
> and not changed here. **Readings taken where the text leaves room**, each the most literal one found: a call with
> an unresolvable path never matches and does not fall back to the exact match, so an approval whose own path did
> not resolve covers nothing, not even the identical call; a path key whose value is neither a string nor a list of
> strings counts as unresolvable; the fallback for a call with no path key is REQ-TOOLS-024 whole, so it compares
> tool names without folding `haet`; resolved paths compare as exact strings, so two spellings differing only in
> case are two paths; and a path named twice counts once. The rule is `resolvedPathSet` and `approvalMatches` in
> `packages/agent-tools/src/policy.ts`, and `PolicyContext.grant` takes the root and the resolver, which the gate
> passes. One unit assertion had pinned the old reading, a `write_file` grant refusing a call with an extra
> argument; it now pins the same on an MCP edit tool, which REQ-TOOLS-024 still governs alone. The tests name a
> stand-in for it, because REQ-MCP-116 lets the code-intelligence server's real tool names be written only in its
> manifest, and `code-intelligence.test.ts` failed the first `pnpm check` on `replace_content` written in a test.
> Measured by unit tests only: nine `PD-TOOLS-004` cases in `policy.test.ts` over a real temporary directory with a
> copy of the run host's resolver, and one in `gate.test.ts` taking an edit and two retries, one through the
> alias, through the gate on one approval while another persona and another path each ask again. With `policy.ts` restored to its
> previous text (and a stub for the one new export the tests import) all ten fail, the gate case by its 30-second
> timeout waiting for an approval nobody answered; two of them, the unresolvable-path and no-path-key cases, fail
> only on the new `paths` field, because their negatives hold under the old, narrower rule too. The repair of the
> review added three: one in `policy.test.ts` (a server's `write_file`, and a server's `haet` beside a public
> `haet_edit`), one in `gate.test.ts` (a server's `write_file` asking again for another content on the approved
> path), and one in `run-host/tools.test.ts` building the real port twice — once with a stand-in MCP host offering
> `write_file` to a persona without it, once with the public `write_file` — and answering the approvals through the
> port. With the `publicTool` check taken out of `policy.ts` all three fail; with the run host's predicate true for
> any served name the port case fails, and with it false for every name the port case fails on its public half, by
> the test's timeout waiting for an approval nobody answered. These three were not run against `policy.ts`'s text
> from before the directive. The built app was
> not driven and no live run was made, so the loop of run `1ddeb71b` has not been replayed against a real model. The
> row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).

> **2026-09-28, under [R-062](requests.md#r-062):** the two defects the first execution recorded and left are repaired,
> and the links above now point at their notes in `fixed/`. The path scope of REQ-TOOLS-018 joins each path to the
> workspace root before the resolver, as this directive's `resolvedPathSet` did from the start, and `realPathOf` no
> longer drops a character from a relative path. The `publicTool` predicate this directive introduced is now read by
> the policy's class rules and by the plan gate's two enforcement points, so an MCP tool offered under a public name
> is neither allowed by `ask:read-only-tool` or the fetch pair nor let through the hold. ADR-0016 carries the
> execution note; nothing in this directive's own rule changed.

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

> **First execution, 2026-09-28, built under [R-062](requests.md#r-062):** the mechanism was built as written, and the
> text met the code in five places. **(1) Where the state lives.** No per-run fact reached every agent's gate before
> this; the mode override (REQ-TOOLS-075) had exactly the shape wanted — one holder per run, installed by `Sessions.start`
> and by every continuation, handed to each agent's port context as it is built — so the away state is a second such
> holder, `UserPresence` (`packages/engine/src/run/presence.ts`), reaching the gate through `ToolPortContext.presence`
> and `GateDeps.presence`. It ends with the run because the next run installs a fresh one; nothing resets it, and a
> delegated child reads the same object its root's expired wait marked. **(2) Where input arrives.** Every control on
> a live run but one passes one line at the top of `Sessions.control`, so the return is wired there, before the
> operation is judged: input the operation then refuses (a blank message) still returns the user, because the directive
> counts the input and not its success. `announceShutdown` is excluded — it is the application's, not the user's. The
> one control that does not pass that line is the confirmed transcript clear (REQ-CHAT-084, one of REQ-MONITOR-004's
> operations on a live run), which `control` answers ahead of it because the clear also reaches a loaded idle session;
> its branch returns the user when a run is live. *The first cut stated that every control passed the common line and
> missed the clear; the build's verification found it, and the branch and its engine case were added in the same round.*
> The terminal-stream operations REQ-MONITOR-004 also counts (keystrokes, resize, interrupt, kill) reach
> `run-host/terminal.ts` by stream id and never `Sessions`, so typing into an agent's terminal does not return the user —
> a reading: the directive names answers, messages, run controls and a mode change, and a terminal stream is the
> agent's process, not the run's controls. The asynchronous
> `forceCompression` and the id-routed answers (`answerApproval`, `answerQuestions`, `cancelQuestions`) return the user
> of the session that held the id, whichever session the request addressed; a stale id held by none returns nobody. A
> new message with no run active is `prompt`, which launches a continuation run — a fresh holder, so it starts present
> by construction. **(3) What the event says.** REQ-EVENTS-049 fixes `unattended_reason` at exactly one value,
> `headless-policy`, on every `headless` request, so the `approval.requested` event of an away ask is indistinguishable
> from a presenter-less one; the cause is stated where this directive puts it, in the decision's reason, which the
> `permission_denied` issue carries into the store an autopsy reads. **(4) Where the transitions are recorded.**
> REQ-ORCH-139 closes the timeline vocabulary and neither it nor domain 05's permission events has a word for the user's
> presence, so both transitions are session-log lines (REQ-SESSION-142) at `WARNING`, the default level — the end of an
> away stretch is as much an autopsy fact as its start, and one written below the default level would leave the stretch
> looking open; a timeline word is raised as [OQ-76](../architecture/open-questions.md). **(5) The question clause under
> `ask`.** `ask_questions` is outside REQ-TOOLS-007's read-only class, so under the `ask` preset its own dispatch is an
> approval ask, and that ask is one the away state resolves at once: under the default preset no question reaches an away
> user. The clause is built as read — it governs the question the executor raises, which still prompts and waits
> wherever the call is permitted — and the tension is raised as [OQ-77](../architecture/open-questions.md).
> **Readings taken where the text leaves room:** a second wait already running when the first expired is not cut short
> (it was already put to the user) and its own expiry is not a second transition — with concurrent agents that can
> still cost a second full timeout, raised as [OQ-78](../architecture/open-questions.md); the return clears the mark before the
> operation is judged; a session with no presenter is still reported with REQ-TOOLS-065's own reason, checked ahead of
> the away state, because it is the truer statement; the reason's `<N>` is REQ-TOOLS-052's own figure, the timeout in
> seconds as that reason prints it. **What was measured:** unit tests only. Five gate cases over the fake clock in
> `gate.test.ts`: the full wait paid (still waiting at 4,999 ms, marked at 5,000) and the second ask's exact reason with
> no wait created and nothing presented; the `abort` variant with and without a hook; a timeout of 0 through a day and a
> cancellation, never marking; a permitted question waiting while away, a rule's allow and a rule's deny untouched, and
> the `ask`-preset question denied; the presenter-less precedence. One real-port case in `run-host/tools.test.ts`: the
> configured 300 s wait expiring, the next ask presented to nobody with the exact reason, the return brokered again. Three
> engine cases in `children/children.test.ts`: a delegated child's port reading the mark the root's expired wait set, on
> the one holder; the return on a mode change, on a message the operation refuses and on a run control, a stale answer id
> returning nobody, and a continuation run starting present on a fresh holder; and the return on a confirmed clear
> during the live run, on the awaited compression, and on an approval answer, a question answer and a question
> cancellation the run holds — each of those five return lines, taken out alone, fails that case. Two on the holder itself. Mutations: with
> the away arm taken out of `broker`, four cases fail (the port case and three gate cases, each by waiting for an
> approval nobody answers); with the `markAway` call taken out of the timeout arm, the first-ask case and the port case
> fail on a null mark. **What was not measured:** no built-app run exercised the mechanism. `pnpm questions-proof` and
> `pnpm plan-gate-proof`, the proofs nearest this path, could not launch the app on this host: each spawns Electron
> without the harness's `hostSwitches`, and as root Chromium exits `SIGTRAP` with "Running as root without --no-sandbox
> is not supported" — the harness reason another item sweeps, not repaired here. No live run was made, so the reason's
> wording has not met a real model, and run `1ddeb71b`'s two waits have not been replayed. The row is in
> [`../architecture/first-executions.md`](../architecture/first-executions.md).

---

<a id="pd-orch-004"></a>

### PD-ORCH-004 — a child cut off while making progress hands its work back to the parent

*Revision 4 (2026-09-28, [R-064](requests.md#r-064)) — **how a later root learns of an offer**, a paragraph added
after "Naming the continuation"; the owner's ruling on OQ-99. Nothing is replaced.*

*Revision 3 (2026-09-27, [R-059](requests.md#r-059)) — **an offer outlives its run**, the last sentence of "Naming the
continuation", ruled with PD-ORCH-005. Revision 2 (2026-09-27, [R-058](requests.md#r-058)) — **how the parent names the
child it continues**, which rules OQ-66. Revision 1 (2026-09-23, [R-048](requests.md#r-048)) is otherwise unchanged.*

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

**Naming the continuation (revision 2).** `delegate` SHALL accept one further optional action field,
`continuation_of`: the task id of the child whose work the new child continues. The delegation SHALL be refused
with status `rejected`, before any record is created and with a reason naming the cause, unless the id names a
direct child of the calling agent whose report carries a continuation offer and which no child of the session
already continues. The new child's record carries the id it continues; its payload is assembled as any child's
is, and nothing of the continued child is injected into it. **An offer outlives its run (revision 3):** it stays
open until it is taken up once — by the agent that delegated the child while that agent runs, or, in a later iteration
or a later run of the session, by that iteration's root agent.

**How a later root learns of an offer (revision 4).** Every root that may take up an open offer SHALL be told of it,
once:
- the root of a new run, in the continuation handoff's progress context;
- a resumed root, at the continue that resumes it, unless its conversation already holds the offer;
- the root of each later iteration of the same run, in that iteration's first message.

Each list names the open offers' children by canonical name and task id, the newest ten, and says when earlier ones
were left out. Revision 3 gave a later root the right to an offer and no way to learn that one existed. The build told
a new run's root and a resumed root, and the owner ruled that a later iteration of the same run is told as well.

> Revision 2 said, and no longer governs: "Which agent may take up an offer once the iteration that raised it has
> ended — after a stop, a pause or an interruption — is for the run-continuation policy R-058 opened; until that is
> ruled, only the agent that delegated the child can, within the same iteration."

> Revision 1 said nothing of how the parent names the child it continues, and it narrowed REQ-ORCH-088 alone,
> so the field built under [R-057](requests.md#r-057) departed from REQ-TOOLS-152, which no directive named for it.
> That is [OQ-66](../architecture/open-questions.md), ruled by this revision.

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
> **Extends:** REQ-TOOLS-152 (revision 2)

*Raised by the owner, 2026-09-23; logged as [R-048](requests.md#r-048). Revision 2 logged as [R-058](requests.md#r-058), revision 3 as [R-059](requests.md#r-059), revision 4 as [R-064](requests.md#r-064).*

> **First execution, 2026-09-27, built under [R-057](requests.md#r-057):** the mechanism was built as written, and the
> text met the code in four places. **(1) The stall window had no reader.** `runtime.child_stall_timeout` and a role's
> `stall_timeout` were loaded and validated and reached no run; the progress rule is their first reader. Both are now
> handed to the run, and the role's value substitutes for the run's on that role's children (REQ-CONFIG-108). The
> stall recovery REQ-NOTIFY-111/112 describe for the same window is not built, and that is recorded in
> [`a-child-that-produces-no-output-is-never-given-its-one-corrective-message.md`](../defects/fixed/a-child-that-produces-no-output-is-never-given-its-one-corrective-message.md),
> not changed. *(Built 2026-09-29 under R-067, with REQ-ORCH-089's watchdog over the same window; the readings are
> OQ-127.)* **(2) How a parent names a continuation.** REQ-TOOLS-152's fields have none. `session_id` reuses a
> delegation's session, and this directive asks for a new child and never a resume, so `delegate` takes one new
> optional field, `continuation_of`, the task id of the child continued. It is recorded on the new child as
> `children.continuation_of` (store v22). REQ-TOOLS-152 calls itself the whole of the `delegate` contract, and this
> directive does not name it; the tension is reported, not settled, and is raised as
> [OQ-66](../architecture/open-questions.md) with why `session_id`, `inherited_context` and `depends_on` do not fit. **(3) Where the parent reads the report.**
> REQ-ORCH-060's block shows, of the report, its status and its result text and nothing else, so the three additions
> would never have reached a parent through it. They follow the capped result text in the resume block and in `background_output`, outside the 4,000-character
> cap. **(4) The literal readings taken**, each an open question for the owner. A call is "completed" when its result
> returns to the child, whatever the outcome, so an error or a refusal counts. The window's bound is inclusive: a call
> completed exactly `child_stall_timeout` seconds before the expiry is progress, and one a millisecond earlier is not.
> The rule is read at the expiry of the attempt that ended failed, so calls completed during the landing do not
> count. A path "changed" when a `write_file`, `haet_edit` or `haet` call naming it returned `ok`; the name is matched
> in lower case, as the gate's own fallback dispatches `Write_File` to `write_file`. Paths are collected across both
> attempts of REQ-ORCH-088's retry and resolved lexically against the workspace root, so a write outside the root is not
> a workspace path and is left out. Lexical is not what the file tools' fence does, which decides "inside" on real
> paths. So a write spelled through the real path of a root reached by a symbolic link (macOS `/var` →
> `/private/var`) is accepted by the fence and left out of the list, and on a case-insensitive filesystem `Src/A.ts`
> and `src/a.ts` are listed as two paths. "Continued once" is enforced at admission: a
> second continuation of the same child, a continuation of a child that made no offer (a continuation among them) and
> one naming anything but the caller's own child are refused with no record. The caller's "own child" is
> REQ-TOOLS-155's ownership test, and every iteration mints a new root task. So a continuation can be taken up only
> within the iteration whose child was cut off: a later iteration, or the next run after a stop, is refused with
> "names no child task of yours", and the offer's text does not say so (OQ-66); this limit is read from `run/run.ts`
> and `owns()`, not exercised by a test. *Revision 3 lifted this limit on 2026-09-27: an earlier iteration's offer, and
> a resumed iteration's own from an earlier run, are the later root's to take up (`continuationRefusalFor`, OQ-99), and
> the handoff lists the open offers.* The continuation's payload is
> assembled as any child's is; nothing of the timed-out child is injected into it. What was measured: unit and scripted
> end-to-end tests only. These cover the rule at a call completed exactly at the window's start and one millisecond
> before it, a 60 s window set through the run's configuration, the path list's order, de-duplication and failed
> writes, the "changed none" statement, the offer, the continuation's record, the refused chain and the refused
> second continuation. Each end-to-end case goes red when its limb of the mechanism is reverted. *Added after review,
> the same day:* four more end-to-end cases in `ladder.test.ts` exercise REQ-ORCH-088's own machinery. Attempt 1's
> write is listed beside attempt 2's across the fallback retry. A child progressing at attempt 1's expiry and not at
> attempt 2's gets REQ-ORCH-088's report alone. A call completing 5 s into the landing grace is not progress. A role's
> `stall_timeout` of 2 s replaces a run window of 5 s, and one of 3 s keeps the bound inclusive, with the run's window
> alone as the positive control. Each went red under its mutation: a log built per attempt, progress carried over from
> an earlier expiry, progress read when the report is built, and the role's value dropped. A unit case covers the
> lower-case name. What was not
> measured: no built-app run exercised the mechanism. `pnpm resilience-proof`, the proof nearest this path, could not
> launch the app as root and made no assertion
> ([`resilience-proof-cannot-launch-the-app-as-root.md`](../defects/fixed/resilience-proof-cannot-launch-the-app-as-root.md)).
> No live run was made, so the offer's wording has not met a real model. The row is in
> [`../architecture/first-executions.md`](../architecture/first-executions.md).

> **First execution of revision 3, 2026-09-27, ruled by [R-059](requests.md#r-059) and built with PD-ORCH-005 under [R-063](requests.md#r-063):** the rule was
> built as written, and the text met the code in three places. OQ-99 records each reading.
>
> **(1) Who "that iteration's root" is for an offer.** A resumed iteration keeps its number across runs, so "an earlier
> iteration" alone would have given its root none of the offers its own children left in a run before. The build's
> first cut read it that way, and the review found it: the words "or a later run of the session" had become redundant.
> The root of a later run now takes up an offer from any earlier iteration, or from its own iteration if the child ended
> in an earlier run, whoever delegated it. Within an iteration, only the delegating agent takes it up, while that agent
> runs. The refusal names both routes.
>
> **(2) How a later root learns an offer exists.** The text gives the right and no channel. A new iteration's root reads
> the open offers, the newest ten, in the handoff's progress context. A resumed root is told, at the continue, the
> offers its conversation does not already hold. An offer counts as held when it came in a child's report or in a list
> the root was told, and a passing mention of the task id does not count. Three reviews shaped that rule: the second
> made the list told at every continue; the third found a root that had answered taking a step to read it each time;
> the fourth found a mention counted as the offer. Each falsified reading is kept in OQ-99.
>
> **(3) REQ-SESSION-115's "latest orchestrator artifact".** The built-in orchestrator publishes no artifact of its own.
> The handoff therefore states the latest artifact of any kind that nothing supersedes, id first, cut to 6,000
> characters without splitting a character. This replaces the placeholder that said none was recorded, repairing
> [`the-continuation-payload-says-no-artifact-is-recorded.md`](../defects/fixed/the-continuation-payload-says-no-artifact-is-recorded.md).
> Two limits stand, each recorded:
> - a report re-materialised under a reused canonical name keeps its first creation time;
> - a document edited after publishing is stated as published.
>
> **What was measured.** Unit and scripted end-to-end tests in `children.test.ts`, `session-resume.test.ts` and
> `turn.test.ts`:
> - the earlier-iteration offer, the earlier-run offer of the resumed iteration's own child, and a grandchild's;
> - the refusals;
> - the list's cap, and the told-once rule;
> - the artifact's choice, cut and rendering.
>
> Each limb turned a test red when reverted.
>
> **What was not measured.** No built-app run took up an offer, because the scripted client cannot time a child out
> while it is making progress. No live run was made. The row is in
> [`../architecture/first-executions.md`](../architecture/first-executions.md).

> **First execution of revision 4, 2026-09-28, ruled by [R-064](requests.md#r-064) and built with `PD-ORCH-005` revision 4
> under [R-065](requests.md#r-065):** the rule was built as written. Every execution root's first message names the open
> offers that message does not already hold (`offersForFirstMessage`), and a plan cycle is told none. The list and its
> reader moved to `packages/engine/src/run/offers.ts`, so the run tells a later iteration's root without importing the
> session manager, and REQ-SESSION-194's cut is one function, `run/cut.ts`. The text met the code in one place, recorded
> in [OQ-107](../architecture/open-questions.md): "told of it, once" is read once per root, and the offers a handoff already covered, named or elided,
> count as told.
>
> **What was measured.** `offers.test.ts`, through the run, each limb red when reverted.
>
> **What was not measured.** No built-app run: the scripted client cannot cut a child off while it is making progress
> and then begin a second iteration. No live run was made. The row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).

> **First live execution, 2026-09-29 — the duress scenario of `pnpm live-run`, under [R-066](requests.md#r-066), recorded
> under [R-067](requests.md#r-067):** the built product at `fa377e6` (revisions 1 to 3 built; revision 4's `offers.ts` not
> yet on that commit) against the owner's self-hosted endpoint (`qwen3.8-flash-next`, unmetered), pack
> `.live-run/runs/2026-09-29T03-06-14-929Z/`, session `379f1490`. It is the first time a real model was cut off while
> making progress, and every part of the directive held end to end:
> - **The progress rule.** Child `d` (`bg_b8da141a`, `docs-writer`) reached its 1,200 s `child_timeout` at 03:34:25 with
>   61 tool calls, the last of them inside the final stall window; its report says "Cut off while making progress: this child completed a tool
>   call within the final 90s before its 1200s limit expired." It ended `failed` with the timeout error "Child timed out
>   after 1200s", as REQ-ORCH-088 has it.
> - **The changed paths, in order.** `cut_off.changed_paths` is `docs/api.md`, `docs/overview.md`, in the order first
>   changed, and matches the report's deterministic `edited_files`.
> - **The offer's text.** "Continuation offer: the remaining work may be delegated to a new child as a continuation of this
>   one — call delegate with continuation_of: "bg_b8da141a". A piece of work is continued once; a continuation is not
>   offered one of its own."
> - **The continuation.** The orchestrator took the offer at tool call #242, 03:35:55, 22 s after `d` settled: `d2`
>   (`bg_7d79e866`) carries `continuation_of` = `bg_b8da141a` in its record, was offered nothing of its own, and ended
>   `succeeded` at 03:44:30 (515 s), finishing the reconciliation `d` had begun.
>
> **What it found beside the directive.** Nothing in the text was wrong. Two costs showed, each recorded elsewhere:
> revision 2's "nothing of the continued child is injected" had `d2` make 34 reads before its first edit (6 min 40 s of
> its 515 s), re-deriving what `d` knew — put to the owner as [OQ-114](../architecture/open-questions.md); and the first thing `d2` read was
> `d`'s report artifact, whose summary denied the edits `d` had made, because the summariser read only the transcript's
> head (`a-long-childs-report-denies-the-edits-it-made.md`, ruled as OQ-111). The duress run's own check "no child ended
> failed with nothing to say" flagged `d`, a false positive of the harness
> (`the-duress-silent-child-check-flags-a-cut-off-child.md`).
>
> **What was not measured.** An offer taken up by a later iteration's or a later run's root (revisions 3 and 4): this one
> was taken within its iteration by the agent that delegated `d`. The row is in
> [`../architecture/first-executions.md`](../architecture/first-executions.md).

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

> **First execution, 2026-09-27, built under [R-055](requests.md#r-055):** the mechanism was built as written, and the
> text met the code in three places. **(1) The vocabulary.** The directive names `warning`; the child protocol and
> every writer in the code say `warn`. The line is written with the directive's word and the variable accepts exactly
> the four the directive lists, so `ROTARIS_APP_LOG_LEVEL=warn` is unrecognized and means `info` — the product says so
> in one `warning` line after the instance claim, rather than silently. **(2) "Every line".** Main's own lines carried
> no level at all, and the collaborators that already told a warning apart (the improvement coordinator,
> initialization, the credential store, the settings store, the provider service) had it dropped by the wiring, so
> REQ-LIBRARY-035(b)'s *warning* reached the log as an unlabelled line; each now arrives at `warning`. Main's own
> reports of a loss are `error` — an uncaught exception or rejection, a refused launch, a failed hand-over, a renderer
> or child process gone for any reason but `clean-exit`, the run host or a workspace service exiting with any status
> but 0, and a `shutdown` either child refused or left unanswered, still running, when its bound elapsed at quit — and
> a dialog or review that could not be presented is `warning`; every other line of main's stays `info`. An exit of 0
> was first read as proof of main's own `shutdown`; it is not, because Electron reports 0 for a child it tears down at
> quit, so the unanswered `shutdown` is the line that says work was cut off. A message of several lines (a stack) is
> written with the stamp and level on each line. **(3) The obliged lines.** Every line the seven named requirements
> oblige reaches the log at `info` or above: the confinement verdict (REQ-SANDBOX-071) at `info`,
> REQ-LIBRARY-035(b)/124's failure and REQ-LIBRARY-047's unrecorded version at `warning`; REQ-TOOLS-171 and
> REQ-HOOKS-102 oblige no line, they constrain text, which a threshold can only drop. REQ-HOOKS-138's hook lines in
> this log are `info` and `warning`, but the hook engine's own sink — documented "the application log only" — is wired
> to the per-session log at `INFO`, where the default `WARNING` drops it; that is recorded as
> [`hook-faults-reach-only-the-session-log-at-a-level-it-drops.md`](../defects/fixed/hook-faults-reach-only-the-session-log-at-a-level-it-drops.md)
> and not changed here, because it is a question of which log, not of this one's threshold. Three proof readers
> matched the old shape and two proofs read `debug` lines; the readers were updated and those two launches set the
> variable. Measured on a driven launch in a Linux container as root, without the bundled runtime, so the 141 stderr
> lines of 2026-09-16 could not recur: 72 lines at the default (66 `info`, 6 `warning`, 0 `debug`); 69 with the
> variable at `debug`, the same lines plus the code-intelligence child's two `debug` lines, less five the first
> launch's own driving wrote. At `warning` a clean launch and quit writes nothing, its `quit:` lines included, which
> is what a threshold above `info` costs: 24 launches driven to a last-window close at the default level wrote no
> `warning` or `error` line and quit in 40–69 ms, and one ended by the driver's `app.exit` at `warning` wrote nothing
> at all. *Falsified 2026-09-29 for the immediate exit (the sentence above is kept as written): in the live run of that day
> 7 of 9 launches ended through the capture seam's immediate exit (`exitCleanly`, `endRunHost` with a grace of 0) wrote
> `error   CHILD PROCESS GONE (Utility rotaris-run-host: killed, exit 15)` after "run host exited (0)" and "quit: exiting
> with status 0" — main kills the run host itself and logs Electron's report of the kill at `error`. One such exit writing
> nothing was the race going the other way. Recorded as
> [`an-orderly-quit-logs-the-run-host-gone-at-error.md`](../defects/an-orderly-quit-logs-the-run-host-gone-at-error.md)
> (live-run finding L13); the last-window close's 24 clean quits are not contradicted.* The review's run of the same close found the first version of the unanswered-`shutdown` line firing on
> orderly quits (3 in 26, each waiting out the 30 s bound), because a child's answer can lose the race with its own
> exit; the quit now races each `shutdown` against the child's exit, recorded as
> [`a-childs-shutdown-ack-can-lose-the-race-with-its-exit.md`](../defects/fixed/a-childs-shutdown-ack-can-lose-the-race-with-its-exit.md).
> A loss still writes its `error`, driven against this build at `warning`: a run host killed with SIGKILL and then the
> last window closed wrote exactly `run host exited (9)` and
> `CHILD PROCESS GONE (Utility rotaris-run-host: killed, exit 9)` and quit in about 60 ms; one stopped with SIGSTOP
> before the close wrote `quit: the run host did not complete its shutdown (… no reply to shutdown within 30000 ms)`
> after 30 s, and nothing else. The other exit statuses rest on a scratch Electron 44.1.1 app, not this build: an
> uncaught throw, `process.exit(3)`, SIGABRT, SIGKILL, SIGSEGV and SIGTERM reported 1, 3, 6, 9, 11 and 15, and a
> teardown at quit and `utilityProcess.kill()` reported 0. The row is in
> [`../architecture/first-executions.md`](../architecture/first-executions.md).

> **2026-09-28, under [R-062](requests.md#r-062):** the one obliged surface the note above left outside this log is
> inside it. The hook engine's `log` sink and the run host's account of an unresolvable hook set (REQ-HOOKS-085) now
> reach `Sessions` as its new `SessionsDeps.log`, which the run host fills with its `log` event at `info`, so REQ-HOOKS-138's
> hook lines are written at the default threshold and the per-session log no longer receives them. The checkpoint port's
> `log`, which said nothing about which log it meant, is documented as the per-session log, because its root already
> writes every checkpoint line to this log through a channel of its own. Measured by unit tests against the store, not on
> a driven run with a failing hook. The note is moved to
> [`hook-faults-reach-only-the-session-log-at-a-level-it-drops.md`](../defects/fixed/hook-faults-reach-only-the-session-log-at-a-level-it-drops.md)
> and the row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).

> **2026-09-28, under [R-062](requests.md#r-062):** the quit's race over each `shutdown` is unchanged, and main now also
> waits, bounded, for the run host's EXIT before it is gone (`endBeforeMain`, `main/exit.ts`; ADR-0014's "Main is gone
> only after the run host"). The race answered "the answer can be lost to the exit"; it did not make main leave before
> the exit, and a run host left behind kept every session it held refused to the next launch until its pid stopped
> answering ([note](../defects/fixed/a-session-lock-outlives-the-application-that-held-it-for-as-long-as-its-run-host-takes-to-exit.md)).
> The levels are this directive's: a run host ended at quit reports exit 0 and writes its `info` line; one still running
> past the bound after it was ended is a loss, written at `error`. A driven close at the default level wrote no
> `warning` or `error` line from the close onwards, and main was gone 103 ms after it.

---

<a id="pd-tools-006"></a>

### PD-TOOLS-006 — a delegated child may declare a write scope that its siblings may not write into

*Revision 3 (2026-09-29, [R-067](requests.md#r-067)) — **what else `delegate` refuses, and what `session_id` names**,
a section added after "The disclosure"; the owner's rulings on OQ-112 and on OQ-66's open part. Nothing is replaced. This
directive is the one that narrows REQ-TOOLS-152, and the symbol generator admits one narrowing directive per requirement,
so a narrowing of `delegate`'s fields lands here whatever it is about.*

*Revision 2 (2026-09-27, [R-059](requests.md#r-059)) — **a resumed child re-claims its scope**, in "What is unchanged",
ruled with PD-ORCH-005. Revision 1 (2026-09-23, [R-049](requests.md#r-049)) is otherwise unchanged.*

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

**What else `delegate` refuses, and what `session_id` names (revision 3).** Two further refusals SHALL stand beside
REQ-TOOLS-152's own. Each is reported with status `rejected`, before any record is created and with no task id, and its
reason names the cause:
- a delegation carrying a `write_scope` to a persona that holds no file-writing tool — neither `write_file` nor
  `haet_edit` (with its alias `haet`) — whose reason SHALL say that the persona cannot write files and, where the
  persona catalogue shows any, name the personas that can;
- a delegation whose `session_id` names no settled child of the calling agent.

A persona's tools, for the first of these, are the ones it would be granted for the child, after REQ-TOOLS-006's
controls.

REQ-TOOLS-152's `session_id` names, by its task id, a settled child of the calling agent: a direct child, by
REQ-TOOLS-155's ownership test, that has reached a terminal state and that its `child_timeout` did not cut off. The
follow-up resumes that child from its record with the call's `task` as its next user message, as PD-ORCH-005 clause 22
states. A child its `child_timeout` cut off keeps PD-ORCH-004's `continuation_of`, and a `session_id` naming one is
refused with a reason that names that field.

**What is unchanged.** A child delegated without a `write_scope` claims nothing and is refused only where a
live sibling's claim reaches. A `write_scope` never limits the child that declared it: that child may write
outside its own patterns wherever no other claim reaches. A claim belongs to one run and lapses with its child, so a
continued session starts with none of the previous run's claims; the `write_scope` a child declared is stored with its
record, and a child resumed under PD-ORCH-005 claims it again from the moment it is accepted, under the same rules as
any child (revision 2). Reading is never refused by a claim.

> Revision 1 said, and no longer governs: "Claims belong to one run and are never persisted, so a resumed session
> starts with none."

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

**Why revision 3, and what it costs.** In the duress live run of 2026-09-29 the orchestrator delegated a documentation
file to `codebase-analyst`, a persona that holds no file-writing tool, with that file as its `write_scope`. The scope was
accepted, the child ran for 2 min 47 s and could only answer that it had no file-writing tool, its report still read
`succeeded`, and a second child was commissioned for the same file. A refusal at the call moves that discovery to the
moment the parent can still choose. And `session_id` was accepted and dropped
([`delegate-drops-session-id-and-suppress-auto-context.md`](../defects/delegate-drops-session-id-and-suppress-auto-context.md)),
so a caller that set it was told nothing and got a fresh child. What it costs:
- a parent can no longer give a read-only child a scope for coordination alone;
- a persona whose only writing tools are ones the claim does not fence — the code-intelligence server's editing tools,
  `terminal`, MCP or plugin tools — counts as holding no file-writing tool and is refused a scope, although it can write
  files; a scope could not have fenced those writes either ("The file tools only", above);
- a follow-up re-sends the child's whole conversation, where a fresh child sends only its payload.

> **Narrows:** REQ-TOOLS-152, REQ-TOOLS-154
> **Extends:** REQ-ORCH-028

*Raised by the owner, 2026-09-23; logged as [R-049](requests.md#r-049). Revision 2 logged as [R-059](requests.md#r-059),
revision 3 as [R-067](requests.md#r-067).*

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

> **First execution of revision 2, 2026-09-27, ruled by [R-059](requests.md#r-059) and built with PD-ORCH-005 under [R-063](requests.md#r-063):** the rule was
> built as written, and it found nothing the text got wrong.
>
> The declared scope is stored with the child's record at spawn (`children.write_scope`, store v23). When a child
> resumes, its scope is claimed again from the moment it is accepted.
>
> Covering the re-claim order found one thing: the store listed children accepted in the same millisecond by their
> random task ids. So "the child accepted first holds that path" could fall to the later child on a resume. The
> child queries now order by insertion (`spawned_at, rowid`), and the order is pinned in `store.test.ts`.
>
> **What was measured.** Two scripted end-to-end cases in `children.test.ts`, each red when its limb is reverted:
> - a resumed child's stored scope refuses a sibling's write;
> - two children accepted in one millisecond re-claim in acceptance order.
>
> **What was not measured.** No built-app run declared a scope. The row is in
> [`../architecture/first-executions.md`](../architecture/first-executions.md).

> **First execution of revision 3's scope refusal, 2026-09-29, built under [R-067](requests.md#r-067):** the refusal
> was built as written ([OQ-112](../architecture/open-questions.md)). `IterationChildren.delegate` refuses a
> `write_scope` for a known persona that cannot write files, straight after the scope's own validation, with status
> `rejected`, no record and no task id. The reason names the catalogue's writers. The phrase "after REQ-TOOLS-006's
> controls" met one gap in the build. The per-persona `tool_restrictions` map, the fourth control, narrows no agent's
> grant today ([`a-personas-tool-restrictions-never-narrow-its-grant`](../defects/a-personas-tool-restrictions-never-narrow-its-grant.md)).
> The check therefore reads the two controls a child's grant does meet, `coordinator_only` and `read_only`. The
> clause's text is not wrong; the build lacks a control it names. Two existing scripted cases had scoped a read-only
> `codebase-analyst`, which the directive now forbids, and they scope a `docs-writer` instead. Revision 3's other
> refusal, a `session_id` naming no settled child, is not part of this build.
>
> The persona checked is the one the ledger resolves, an alias included. The first build read the built-in table
> without its aliases, so `playwright` with a scope reached the ledger and was accepted as `ui-verifier`; the branch's
> verification found it, and the check now reads the ledger's resolution.
>
> **What was measured.** Scripted end-to-end cases in `children.test.ts` over the duress call's shape and over the
> alias, each red with its check removed, and the predicate, the catalogue and the reason in `write-scope.test.ts`. Live, in the duress run of
> session `b4a768a2`, a scope given to `verifier` was refused with the writers named. The orchestrator's next request,
> 15 s later, delegated the task to `docs-writer`. In a second duress run built from the alias repair (session `059ae1d7`), a scope given
> to `codebase-analyst`, the finding's own shape, and one given to `verifier` were both refused, and each task went next
> to a writer (`docs-writer`, `tester`). No alias was delegated live. The row is in
> [`../architecture/first-executions.md`](../architecture/first-executions.md).

---

<a id="pd-startup-001"></a>

### PD-STARTUP-001 — releases publish for Windows only until the directive is withdrawn

**The platform set.** Until this directive is withdrawn, a release SHALL publish for exactly one platform key,
`windows-x64`, with the two Windows artifacts of REQ-STARTUP-031 (installer and portable) and the manifest and
signature of REQ-STARTUP-032. The build matrix SHALL build that one platform key. No `macos-arm64` or
`linux-x86_64` build is attempted, and none is published.

**The release body.** Element (4) of REQ-STARTUP-035 SHALL NOT be written for a platform this directive leaves
out, because that build was not attempted and did not fail. In its place the body SHALL state, as one line
between elements (3) and (5), that this release publishes Windows builds only. The other six elements keep their
order and content. Element (5) still names `sha256sum -c`, and element (6) still names Gatekeeper; both stay true of
the manifest and the caveat, and keeping them spares a second rewording when the directive is withdrawn.

**The gate.** The release gate of REQ-STARTUP-156 SHALL exercise the `windows-x64` key only. Every published
artifact of that key SHALL still be launched under REQ-STARTUP-159's four conditions, with the portable getting its two runs.
Every other member of the gate's set is unchanged.

**Download surfaces.** A download surface reached from macOS or Linux SHALL state that this release publishes no
build for that platform, and SHALL offer none. REQ-STARTUP-026's treatment of Windows ARM64 is unchanged: it is
offered the `windows-x64` artifacts, with the statement that requirement fixes.

**What is unchanged.** The directive narrows what a release publishes, not what the product runs on. Nothing
in the application may be removed or disabled on macOS or Linux because of it. REQ-STARTUP-024's Linux baseline, IC-3 and IC-8 all stay in force. They govern the release that
withdraws this directive, and this directive discharges none of them.

**Why, and what it costs.** The product has no macOS or Linux build host (IC-3), and confinement is unproven on
both (IC-8), so a three-platform first release waits on hardware and proofs that are unrelated to shipping
it on the one platform whose installer is already built. Without this directive, REQ-STARTUP-030 has the matrix
fail two platforms on every tag, and REQ-STARTUP-035 then has every release state that its macOS and Linux
builds "failed". That would be false, and it would read as a broken pipeline. What it costs:

- **No macOS or Linux user can install a release.** They can still build from source.
- **The updater's non-Windows paths ship unexercised.** The apply strategies for the dmg and the AppImage
  (ADR-0054) are neither built into an artifact nor gated, so withdrawing this directive means taking their first
  execution then.
- **Withdrawal is a directive of its own.** It is not a quiet change to the pipeline, and it lands only once IC-3
  and IC-8 are discharged.

> **Narrows:** REQ-STARTUP-026, REQ-STARTUP-030, REQ-STARTUP-035, REQ-STARTUP-156

*Raised by the owner, 2026-09-25; logged as [R-051](requests.md#r-051).*

---

<a id="pd-orch-005"></a>

### PD-ORCH-005 — a continued session resumes the agents its last run left unfinished, from their full record

*Revision 5 (2026-09-29, [R-067](requests.md#r-067)) — **two rulings on what the build left open**: clause 21 (the
status a stop persists, OQ-96) and clause 22 (a follow-up by `session_id` resumes a settled child, OQ-66's open part)
are added, and `REQ-SESSION-186` and `REQ-SESSION-073` join the Narrows list. Nothing is replaced. The owner took both
recommendations.*

*Revision 4 (2026-09-28, [R-064](requests.md#r-064)) — **the owner's rulings on the questions the build raised**
(OQ-94 to OQ-99): clause 1's last sentence is replaced, clauses 13 to 20 are added, and the Narrows list names the
requirements the build departs from. Nothing else is replaced. The owner took every recommendation.*

*Revision 3 (2026-09-27, [R-061](requests.md#r-061)) — **what a pause does not wait for, and what outlives it**:
clauses 9 to 12, added; nothing earlier is replaced. The owner ruled clause 9 and delegated clauses 10 to 12.*

*Revision 2 (2026-09-27, [R-060](requests.md#r-060)) — **the full record**: every agent's conversation is kept as it
happens, and continuing resumes the same agents where they stood, in the iteration they stood in; clauses 1, 2 and 4
and the two closing paragraphs are replaced, and clauses 3 and 5 to 8 are adjusted to match. Revision 1 (2026-09-27,
[R-059](requests.md#r-059)) is quoted below where it is replaced.*

**(1) Every agent's conversation is recorded as it happens.** The session record SHALL keep the full conversation of
every agent of a run — the iteration's root and every child at every depth — appended as it happens: each message sent
to and received from the model, each tool call with its arguments, and each tool result, under the agent's task id. The
root's task id is recorded with its iteration. This is the record a resume is made from. The session's transcript is
a second record of the same run, written as the run happens beside this one (revision 4).

> Revision 3 said, and no longer governs, clause (1)'s last sentence: "This is the record a resume is made from, and the
> same record a session's transcript is drawn from." The build kept the two as parallel records (OQ-95), and the owner
> ruled that they stay so.

**(2) A pause stops every agent where it stands.** An accepted whole-run pause SHALL let every in-flight tool call
finish, within REQ-ORCH-134's deadline, and then stop every agent before its next model step: no queued child starts,
no child summarises, and no model call is made after the pause is accepted. Every agent that has not reached a terminal
state is left in the child state **`paused`**, with its **interruption** recorded as `pause`, and the iteration is left
open: it is neither closed nor re-queued. The session persists `paused`.

**(3) A stop, a quit and a crash leave the same state; an explicit cancel is final.** A graceful stop, an application
quit and a crash likewise leave every agent that has not reached a terminal state `paused`, with interruption `stop`,
`quit` or `crash` (a crash is recorded when the session is next repaired or continued), and the iteration open. A tool
call cut off before its result arrived is recorded as interrupted, with whatever output it had produced. The cancel
control (REQ-MONITOR-126, "cannot be undone in this session") and the cancellation of one agent end their agents
`cancelled` as today, and those are never resumed.

**(4) Continuing resumes the iteration where it stood.** When a session whose last run left an open iteration is next
continued — the Continue action, a new message or a plan decision — that iteration SHALL resume before anything else
runs. Its root and every `paused` agent are restored from their record with their identity (task id, canonical name,
persona, parent, dependencies, background flag and write scope) and their conversation, and each carries on from its
last message; a `paused` agent moves back to the state it resumes into. A tool call recorded as interrupted is given to
its agent as a result stating that it was interrupted before it completed and was not re-run, so the agent decides
whether to issue it again. A continue made by a new message delivers that message to the resumed root as the user's
next message in its conversation. A conversation too long for its model is compressed as any conversation is. A resumed
agent's `child_timeout` starts afresh, and each agent keeps the place in every child limit it already held.

**(5) What is never resumed.** An agent that ended `succeeded`, `failed` (a timed-out child among them, whose route is
PD-ORCH-004's continuation offer), `blocked` (REQ-ORCH-048), or `cancelled`.

**(6) The user decides at each continue.** The Continue action SHALL state how many agents will resume, and SHALL offer
to continue without them; choosing that ends those agents `cancelled`, the open iteration closes as cancelled, and the
session continues as a new iteration, as today. Resuming is the default.

**(7) An iteration is resumed each time the user continues.** There is no cap: every resume follows a user's act of
continuing, and an iteration interrupted again after a resume is resumable in turn.

**(8) Opening a session is not continuing it.** Loading a session to view it SHALL change no agent record; settling,
recording interruptions and resuming happen only when a run of the session is about to start.

**(9) A pause does not wait on a person (revision 3).** A tool call suspended on an approval or a question when the run
comes to rest — by a pause, a stop, a quit or a crash — is not waited for. Its approval or question is **withdrawn**: it
leaves `pending_approvals` or `pending_questions`, the timeline records it as withdrawn by that interruption, and the
call is recorded as interrupted and never run. It is never recorded as denied, and no answer is replayed later. When the
agent resumes it sees the call as interrupted, and issuing it again asks afresh. Every other in-flight tool call still
finishes within REQ-ORCH-134's deadline and is recorded as interrupted if the deadline passes.

**(10) Background terminal sessions (revision 3).** A pause leaves the background terminal sessions its agents started
running while the application stays open. A stop ends them, and so do a quit and a crash (REQ-TOOLS-111). When an agent
resumes, it is told, for each background session it had started, whether it is still running (with its id) or ended and
by what, with its last recorded output.

**(11) The durable holds win (revision 3).** While the plan gate or the message-limit pause holds, no agent is
unfinished: a pause is refused, and a quit leaves the hold as it stands and records no interruption. Continuing from a
hold is what it is today.

**(12) The record's lifetime (revision 3).** The conversation record belongs to its session and is deleted with it.
Paging the transcript never touches it. Clearing the transcript clears the record of closed iterations only; an open
iteration's record is kept until the iteration closes. A compression is written into the record, so a resume sends the
compressed conversation.

**(13) A paused agent presents as paused (revision 4).** An agent in the child state `paused` SHALL present in a
presentation state of its own, `paused`, on every agent surface — the agent tree, the counters, the inspector, the
Mission view and a persona window — and SHALL keep its last activity. A session at rest SHALL NOT settle a `paused` agent
to the run's outcome for display; every other unfinished agent of a session at rest is settled as before.

**(14) What the record keeps beside the conversation (revision 4).** Each agent's record SHALL also keep a fingerprint
of the system instructions and the tool definitions the agent started with. A resumed agent runs with its persona's
current instructions and tools; when they differ from the fingerprint, the run SHALL state, as a warning, which agent
resumed under changed instructions.

**(15) The stop and the explicit cancel (revision 4).** A forced stop is a stop: its agents come to rest as clause 3
says. A stop or a quit during a plan cycle ends the cycle's agents and records no interruption, and the plan gate keeps
its hold (clause 11). `/stop` SHALL be the stop, offered with the description "Stop the active run". Every confirmed
"Cancel the run?" is clause 3's explicit cancel, whichever surface asks it. In each case this directive decides:
- an iteration a pause, a stop or a quit leaves open SHALL NOT be closed; REQ-ORCH-135 governs the explicit cancel, a run
  the product ends on its own account, and a rest that finds nothing unfinished;
- REQ-MONITOR-130's cancelling of a run is the explicit cancel; a stop leaves its agents `paused`;
- a pause SHALL stop every agent before its next model step, in place of REQ-SESSION-108's outer-loop boundary;
- an approval dialog the application's quit closes SHALL answer nothing, and the quit withdraws the approval
  (clause 9). REQ-TOOLS-063's Deny governs every other close. A question the quit dismisses is PD-CHAT-002 revision 2's.

**(16) One paused child may be cancelled while its session rests (revision 4).** A `paused` child SHALL offer Cancel
wherever a live agent offers it. Confirmed as REQ-MONITOR-128 requires, naming the child and one line per paused
descendant, it and each paused descendant end `cancelled`, final as clause 3 says. The open iteration stays open, the
rest of its agents resume with it, and the Continue action's count drops by as many as were cancelled.

**(17) A continue's message is also a task (revision 4).** The message a continue delivers to the resumed root
(clause 4) SHALL also be appended to the session's todo as a task. That task closes with the resumed iteration: done
when the iteration succeeds, and left pending when it is cancelled or fails, so the next iteration takes it up.

**(18) A crash offers the same choice (revision 4).** A session a crash left — `interrupted` after a repair, or in
REQ-CHAT-008's recovery state before one — SHALL offer the Continue action and "continue without them" as a `paused`
session does, with the same count. Either choice records the crash first, as any continue does (clause 8).

**(19) The Continue action's count (revision 4).** The count clause 6 requires includes the root, which resumes with
the paused agents. "Continue without them" is offered beside the Continue action alone; a continue by message resumes.

**(20) The handoff's artifact (revision 4).** The artifact REQ-SESSION-115's handoff carries is the latest artifact the
iteration's root published that nothing supersedes and, when the root published none, the latest artifact of any kind
that nothing supersedes.

**(21) A stop persists `paused` (revision 5).** A stop the user made — graceful and clean, or forced — SHALL persist the
session status `paused`, as a pause does (clause 2), and SHALL NOT persist `stopped`. REQ-SESSION-186's stop control, its
two activations and the outcome it presents are unchanged. `stopped` remains the status of a run that exhausted a
configured budget (REQ-MONITOR-029), which REQ-SESSION-073's vocabulary keeps. A stop and a pause record the same stop
reason, `user_cancelled` (REQ-ORCH-069, REQ-MONITOR-301's closed set having no member for a pause), so a stop is told
apart from a pause only by the interruption it records on its agents and its iteration (`stop`, clause 3) and by the
timeline entries that name it.

**(22) A follow-up resumes a settled child (revision 5).** A `delegate` call whose `session_id` names a settled child of
the calling agent — a direct child that has reached a terminal state and that its `child_timeout` did not cut off —
SHALL resume that child from its record: its identity, as clause 4 restores it, and its conversation, with the call's
`task` appended as its next user message. The child keeps its task id, leaves its terminal state for the state it
resumes into, and ends and reports again as any child does. Clause 5 names what a continue resumes; a follow-up is the
parent's own act, and clause 5 does not bar it. A child its `child_timeout` cut off is still never resumed: its route is
PD-ORCH-004's `continuation_of`. What `session_id` names, and how a `session_id` naming no such child is refused, is
PD-TOOLS-006 revision 3.

**What is unchanged.** A continuation is still not a resume: a timed-out child is never resumed and earns no corrective
message (REQ-NOTIFY-112). The message-limit pause and the plan gate keep their durable holds. The run host is still
never re-forked, and a crashed session still needs repair or a continue before anything runs (ADR-0002). How a
continuation offer outlives its run is PD-ORCH-004 revision 3; how a resumed child re-claims its write scope is
PD-TOOLS-006 revision 2. A pause and a stop share one mechanism, so an agent paused while the application stays open
and an agent left by a quit resume the same way. How every later root learns of an open offer is PD-ORCH-004 revision
4, and how the plan gate meets a resumed iteration is PD-ORCH-003 revision 2 (revision 4).

**Why, and what it costs.** Every stop, pause, quit or crash ended every child, and the next run's root was told
nothing about them and could not address them: in run `2e21e324` the user stopped a run whose children had been
working for twenty minutes, and nothing of their work could be continued. Keeping every agent's full conversation is
how a paused or stopped run can pick up exactly where it stood, the way Claude Code and the Codex CLI resume a session
from the conversation they record. What it costs: a table of agent conversations that grows with every message; every
resumed agent sends its whole conversation to its model again, compressed when it no longer fits; a pause no longer lets
children finish their turn, so a paused agent has no report until it ends; and one child state (`paused`) and one
column (`children.interruption`) are added, with `children.write_scope` stored for PD-TOOLS-006.

**Why revision 4, and what it costs.** Building revisions 2 and 3 raised six questions the text did not decide, and the
build recorded the reading it proceeded under for each (OQ-94 to OQ-99). The owner took every recommendation. Most confirm
the reading built and make it traceable: the requirements the build departs from are now named, so a reader of each finds
this directive. Five change the product:
- a paused agent reads as paused, so an agent stopped mid-task no longer looks as though it never started;
- one paused child can be dropped while the rest resume, where the only choices were all or none;
- a continue's message survives an iteration that ends without addressing it;
- a crash offers the same choice as a stop;
- the handoff prefers what the root itself published.

What it costs:
- a presentation state that every agent surface must draw;
- a session command that works with no run behind it;
- one task per continue by message;
- a fingerprint beside each agent's record.

Until they are built, the product behaves as the readings in OQ-94 to OQ-99 recorded.

**Why revision 5, and what it costs.** The owner ruled two questions the build had left to the record ([R-067](requests.md#r-067)).
REQ-SESSION-186 has a graceful, clean stop persist `stopped`, and REQ-SESSION-073's vocabulary glosses `stopped` with
that stop, while clause 3 has a stop leave the state a pause leaves, and REQ-MONITOR-029 and REQ-SESSION-093 persist
`paused`; the build persisted `paused`, and the directive now names both requirements it departs from, so a reader of
either finds it. And REQ-TOOLS-152's `session_id` — "reuse a previous
delegation's session for a retry or a follow-up" — had no meaning under the full record, so the field was accepted and
dropped, and a parent with a question for a child that had finished could only start a fresh child that rediscovers
everything. What it costs:
- `stopped` is never persisted for a user's stop, and a stop and a pause both record the stop reason `user_cancelled`, so
  a session tells a stop from a pause only by the interruption recorded on its agents and its iteration and by the
  timeline;
- a terminal child is no longer always final: REQ-MONITOR-300's table gains one exit from a terminal state, taken only by
  a follow-up the parent asks for;
- a follow-up sends the child's whole conversation to its model again, compressed when it no longer fits.

> Revision 1 said, and no longer governs, clause (1):
> **(1) The interruption is recorded on each unfinished child.** When a run comes to rest with children that have not
> reached a terminal state, each such child's record SHALL carry an **interruption**: `pause`, `stop`, `quit` or `crash`
> (a crash is recorded when the session is next repaired or continued). The child still ends `cancelled`, so every exit
> from an iteration still leaves every child record terminal and terminal states stay absorbing. Its report SHALL state
> that it was interrupted and by what, and its progress: the workspace paths its own file-writing calls changed, its last
> response and its tool-call count. A child that had not started (`queued`, `waiting_on_dependencies`,
> `waiting_on_model_slot`) is recorded the same way, with no progress.
>
> Clause (2):
> **(2) A pause holds.** An accepted whole-run pause SHALL stop every agent before its next model step, let in-flight
> tool calls finish within REQ-ORCH-134's deadline, start no queued child, and make no summarising or other model call
> after it is accepted. The run then comes to rest as it does today, and its unfinished children are recorded with
> interruption `pause`.
>
> Clause (4):
> **(4) Continuing resumes them.** When the session is next continued — the Continue action, a new message or a plan
> decision — then before the first iteration begins, every child the previous run left with an interruption SHALL be
> **resumed**: a new child record is created under that iteration's root with the same persona, task, background flag
> and write scope, and a `resumed_from` link to the record it resumes. Its payload is its original task and a **resume
> brief** assembled from its record within a fixed budget: that it is resuming and why it stopped, the paths it had
> changed, its own todo, its last response, and the tail of its transcript. Dependencies among resumed children carry
> over to the new records. The root's payload lists the resumed agents, and the root owns them as it owns any child it
> delegated: it may wait on them, read their results and cancel them. A resumed child gets a fresh `child_timeout` and
> counts toward every child limit of the run that resumed it.
>
> And:
> **What is unchanged.** A continuation is still not a resume: a timed-out child is never resumed and earns no corrective
> message (REQ-NOTIFY-112). The message-limit pause and the plan gate keep their durable holds. The run host is still
> never re-forked, and a crashed session still needs repair or a continue before anything runs (ADR-0002). How a
> continuation offer outlives its run is PD-ORCH-004 revision 3; how a resumed child re-claims its write scope is
> PD-TOOLS-006 revision 2.
>
> **Why, and what it costs.** Every stop, pause, quit or crash ended every child, and the next run's root was told
> nothing about them and could not address them: in run `2e21e324` the user stopped a run whose children had been
> working for twenty minutes, and nothing of their work could be continued. A continued session now brings its agents
> back unless the user declines. What it costs: a resumed child starts a fresh conversation and pays for its brief, so
> continuing a session whose agents were mid-way through is no longer free; a pause no longer lets children finish their
> turn and summarise, so a paused child's report is its progress, never its conclusion; and four columns are appended to
> the store (`children.interruption`, `children.resumed_from`, `children.write_scope`, and a task id on transcript rows).
>
> Revision 1 narrowed REQ-TOOLS-155; revision 2 does not, because a resumed child keeps its parent, and its
> back-pointer is removed. It extended REQ-ORCH-053, REQ-SESSION-065 and REQ-NOTIFY-121; revision 2 narrows them,
> because the settle no longer cancels a `paused` agent.

> **Narrows:** REQ-MONITOR-256, REQ-MONITOR-123, REQ-ORCH-072, REQ-ORCH-002, REQ-ORCH-052, REQ-MONITOR-300, REQ-ORCH-053, REQ-SESSION-065, REQ-NOTIFY-121, REQ-SESSION-115, REQ-SESSION-129, REQ-SESSION-025, REQ-TOOLS-054, REQ-TOOLS-111, REQ-ORCH-134, REQ-MONITOR-014, REQ-MONITOR-046, REQ-MONITOR-211, REQ-MONITOR-213, REQ-SESSION-078, REQ-SESSION-180, REQ-ORCH-135, REQ-MONITOR-130, REQ-SESSION-108, REQ-TOOLS-063, REQ-CHAT-029, REQ-MONITOR-063, REQ-ORCH-004, REQ-SESSION-186, REQ-SESSION-073
> **Extends:** REQ-MONITOR-125

*Raised by the owner, 2026-09-27; logged as [R-058](requests.md#r-058) and ruled as drafted, every fork as recommended,
by [R-059](requests.md#r-059). Revision 2 logged as [R-060](requests.md#r-060), revision 3 as [R-061](requests.md#r-061),
revision 4 as [R-064](requests.md#r-064), revision 5 as [R-067](requests.md#r-067).*

> **First execution of revisions 2 and 3, 2026-09-27, ruled by [R-060](requests.md#r-060) and
> [R-061](requests.md#r-061) and built under [R-063](requests.md#r-063):** the mechanism was built as written, in a spike and seven phases, and each phase was
> reviewed adversarially until no blocking or should-fix finding remained. The text met the code in these places.
>
> **The spike** ([`../architecture/spikes/agent-resume.md`](../architecture/spikes/agent-resume.md)) recorded one agent,
> paused it, restored it into a new conversation and continued it. It found five things no clause states:
> - the original request was read from the conversation's constructor only;
> - a stop dropped the results of the calls in its step that had completed;
> - a compression has to be written into the record as a replacement;
> - an agent's position is its record read with the ledger, since a parent waiting on its children resumes into waiting
>   and takes no model step;
> - `runTurn` needed a way to continue a history with no new message.
>
> Each was built.
>
> **(1) The record.** Store v23 appends `iterations`, `agent_messages` and `agent_terminals`, and
> `children.interruption`, `resume_state` and `write_scope`. Every agent's conversation is recorded as it changes, and a
> compression is one replacement entry, so a resume reads from the last replacement forward. The transcript's rows are
> written as before, and OQ-95 records how the build reads "the same record a session's transcript is drawn from".
> Building it found that a crashed iteration's number was reused by the next run. That is
> [`a-crashed-iteration-number-is-reused-by-the-next-run.md`](../defects/fixed/a-crashed-iteration-number-is-reused-by-the-next-run.md),
> repaired.
>
> **(2) The rest (clauses 2, 3 and 8 to 11).** A pause, a stop and a quit leave every unfinished agent `paused` with its
> interruption, and leave the iteration open. A crash is recorded from the store at the next repair or continue, and
> never at a load.
>
> The text was silent in four places, and OQ-96 records each reading:
> - a model step already streaming when the pause lands finishes, and it is the last one;
> - a parent holding a child's unread report is unfinished;
> - no summarising call, retry, fallback or condensation follows the rest;
> - an execution that a stop's 30-second grace gives up on is detached.
>
> A paused agent presents as `queued` and is never settled for display. That departs from four requirements the
> directive does not name, and OQ-94 records it.
>
> Clause 3 also repaired two defects:
> [`a-pause-settles-children-instead-of-holding-them.md`](../defects/fixed/a-pause-settles-children-instead-of-holding-them.md)
> and [`cancelling-one-child-does-not-stop-it.md`](../defects/fixed/cancelling-one-child-does-not-stop-it.md).
>
> **(3) The resume (clauses 4, 5, 7 and 10).** Every continue resumes the open iteration first. The root and each
> paused agent carry on from their records under their identity. A call recorded as interrupted is handed back
> "not run", or "interrupted" with whatever output it had. A continue's message is recorded as the resumed root's next
> message at the continue. Each resumed child has a fresh `child_timeout` and re-claims its write scope in acceptance
> order. OQ-97 records the readings: the persona a resumed root runs as, what a resumed child's count holds, and the
> plan-decision route.
>
> **(4) The Continue action (clause 6).** It states the count: the root and every unfinished agent. The count is shown
> on a paused session, on one a crash left interrupted, and on one opened in REQ-CHAT-008's recovery state. "Continue
> without them" is offered on a paused session and is confirmed. OQ-98 records this, with two readings against
> PD-CHAT-001 and the short label `Message`, which is put to the owner.
>
> **What building it found against the build's own readings.** Both were found in the built app and repaired, and the
> falsified readings are kept beside their replacements:
> - Every confirmed "Cancel the run?" sent the stop, so the cancel was resumable. The composer's stop was itself
>   confirmed as a cancel. See [`every-run-cancel-surface-sends-the-stop.md`](../defects/fixed/every-run-cancel-surface-sends-the-stop.md).
>   OQ-96 now names the surface each control belongs to.
> - A quit with an approval open recorded the call as denied, and the agent stepped on the denial, against clause 9.
>   REQ-TOOLS-063's "closing the window answers Deny" fired as the main window took its dialog down. A quit with a
>   question open was recorded as cancelled, through REQ-CHAT-101's cancellation on unload. A quit Electron starts
>   itself (SIGTERM, a logout, `app.quit()`) closed the dialog even before the window's guard. See
>   [`a-quit-denies-the-approval-it-should-withdraw.md`](../defects/fixed/a-quit-denies-the-approval-it-should-withdraw.md).
>   Main now tells a quit apart (`QuitState`) and sends neither answer during one. OQ-96 records the departure from
>   REQ-TOOLS-063 and REQ-CHAT-101.
>
> The build repaired two further defects:
> - [`the-continuation-payload-says-no-artifact-is-recorded.md`](../defects/fixed/the-continuation-payload-says-no-artifact-is-recorded.md),
>   with PD-ORCH-004 revision 3;
> - [`a-stale-settled-childs-report-is-never-an-artifact.md`](../defects/fixed/a-stale-settled-childs-report-is-never-an-artifact.md),
>   and the decline, which had the same gap.
>
> Two defects were read and left unrepaired:
> - [`a-graceful-stop-persists-paused-where-one-requirement-says-stopped.md`](../defects/fixed/a-graceful-stop-persists-paused-where-one-requirement-says-stopped.md),
>   which is still the corpus's contradiction; *settled 2026-09-29 by revision 5's clause 21 ([R-067](requests.md#r-067))*;
> - [`delegate-drops-session-id-and-suppress-auto-context.md`](../defects/delegate-drops-session-id-and-suppress-auto-context.md),
>   because the resume gives `session_id` no meaning. *Revision 5's clause 22 gives it one (2026-09-29); the note stays open until
>   it is built.*
>
> Other defects noticed along the way are recorded in `docs/defects/`.
>
> **What was measured.** Unit and scripted end-to-end tests: more than a hundred cases in 29 test files cite this
> directive. Each phase ran a mutation pass over its new limbs, and each limb turned a test red, with the exceptions its
> commits name:
> - two guards removed as redundant;
> - the tool deadline's cancel at a run's exit, which is timer hygiene;
> - `track`'s change, which no test could observe while
>   [`a-child-whose-execution-raises-before-its-turn-stays-running.md`](../defects/fixed/a-child-whose-execution-raises-before-its-turn-stays-running.md)
>   stood. *(2026-09-29, R-067: the note is repaired and still no test observes it, for a new reason: `executeSettling`
>   now settles a raise before `track` sees it, so an execution reaches `track` rejected only when that settle itself
>   raises.)*
> - main's `before-quit`, which only the built app reaches.
>
> In the built app, driven, one session went through three rests with one child (`bg_d5cb3784`):
> - **A pause with the child's write waiting on approval.** The approval was withdrawn by the pause, the call was
>   recorded "not run", and the Continue action read "2 agents will resume". The continue resumed the same child, and
>   its write asked for approval afresh.
> - **A stop during its next model step.** The child and the iteration were paused by `stop`, and the continue resumed
>   them.
> - **A quit by closing the window, with the write waiting on approval again.** The approval was withdrawn by the
>   quit, and nothing was recorded as denied. The relaunch, and then opening the session, changed no record. The
>   continue resumed the child, whose next answer quoted the first message and the last tool result of the request it
>   was sent. Both were written by the previous process, so the relaunched agent resumed its own conversation. The
>   iteration then closed `succeeded`.
>
>
> Three quits were driven on their own, each with a call waiting on a person: a window close with an approval open,
> SIGTERM with an approval open, and a window close with the question dock open. Each came to rest by the quit, with
> the approval or question withdrawn and the call recorded "not run".
>
> The reviews also drove the app:
> - a crash (`kill -9`), relaunch and continue by message: the count was shown, and the agents resumed;
> - the confirmed decline;
> - the confirmed run cancel from the Mission view and from a persona window;
> - the strip at seven window sizes.
>
> **What was not measured.**
> - No live run was made, so a real model has not yet resumed from its record. The live run of 2026-09-29 measured
>   one, recorded below revision 4's note.
> - Only Linux under Xvfb was driven.
> - The scripted model client restarts its script for every run
>   ([`the-scripted-client-restarts-its-script-for-every-run.md`](../defects/the-scripted-client-restarts-its-script-for-every-run.md)),
>   so a driven agent's steps after a continue are the script's first steps again. Its record is what is resumed.
> - The driver's own quit is an immediate exit that skips the shutdown
>   ([`the-drivers-quit-skips-the-applications-shutdown.md`](../defects/the-drivers-quit-skips-the-applications-shutdown.md));
>   the quit above was a window close.
>
> The row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).

> **First execution of revision 4, 2026-09-28, ruled by [R-064](requests.md#r-064) and built under
> [R-065](requests.md#r-065):** clauses 13 to 20 were built as written, in four lanes that ran in parallel, each on its own
> branch and worktree and each reviewed adversarially until no blocking or should-fix finding remained. The merged build
> was then reviewed across the lanes for fourteen rounds and driven in the built app. The text met the code in these
> places, and each reading is an open question:
> - **Clause 13** ([OQ-100](../architecture/open-questions.md)). `paused` is a presentation state of its own on every agent surface, drawn in the waiting
>   colour (`--rt-wait`) with no pulse, and a paused agent keeps its task line as its activity; the Overview counts it on
>   its own. The run-level agent presents `paused` while its session rests, and the agents a crash left present `paused`
>   before the crash is recorded, so the tree agrees with the Continue action's count. That second reading departs from
>   the clause's last sentence and is put to the owner.
> - **Clause 14** ([OQ-105](../architecture/open-questions.md)). Store v24 appends `agent_fingerprints`: the SHA-256 of the system prompt and of the tool
>   definitions each agent's first model request carried. A resume under a different pair states a
>   `resumed_under_changed_instructions` warning issue and one transcript row naming the agent. The issue kind is coined
>   beside REQ-ORCH-139's vocabulary, and the fingerprint covers the whole system prompt, so a changed pre-flight playbook
>   warns too; both are put to the owner.
> - **Clause 15** ([OQ-108](../architecture/open-questions.md)). The audit found it built, with one exception: a board run caught by the application's quit
>   rested by `stop` ([`a-board-run-caught-by-a-quit-rests-as-a-stop.md`](../defects/fixed/a-board-run-caught-by-a-quit-rests-as-a-stop.md),
>   repaired). A stop or a quit during a plan cycle now withdraws what waits on a person. `/stop` reads "Stop the active
>   run".
> - **Clause 16** ([OQ-101](../architecture/open-questions.md)). `session.control`'s `cancelAgent` ends a paused child and its paused descendants `cancelled`
>   while no run is behind the session, under the session's lock, with the live cancel's report and artifact, and the
>   count drops. A child a crash left is cancelled from its stored state, and the crash is left for the next repair or
>   continue. The first cut wrote the whole crash record
>   ([`cancelling-one-crash-left-child-records-the-whole-crash.md`](../defects/fixed/cancelling-one-crash-left-child-records-the-whole-crash.md),
>   repaired), and wrote against a failed store
>   ([`the-at-rest-cancel-writes-against-a-failed-store.md`](../defects/fixed/the-at-rest-cancel-writes-against-a-failed-store.md), repaired).
> - **Clause 17** ([OQ-102](../architecture/open-questions.md)). The message is a task the resumed iteration holds: done when the iteration succeeds, pending
>   on any other close and taken up by the next iteration. The Continue action, the decline and the message-limit
>   resolution append no second task while the todo holds the last request unfinished. That reading reaches beyond the
>   clause, into REQ-ORCH-004, and it repaired
>   [`the-continue-action-appends-the-last-prompt-again-while-its-task-is-pending.md`](../defects/fixed/the-continue-action-appends-the-last-prompt-again-while-its-task-is-pending.md).
> - **Clause 18** ([OQ-103](../architecture/open-questions.md)). A session a crash left offers both continues and the decline with the same count, and each
>   records the crash first; a session a store failure left busy is refused, since it did not crash. On a crash-left
>   session the two continues take the send pill's place as they do on a paused one.
> - **Clause 19** was already built; the audit added its tests.
> - **Clause 20** ([OQ-106](../architecture/open-questions.md)). The handoff takes the latest artifact the most recent iteration's root published, known by
>   the root's task id, and falls back to the latest of any kind.
>
> **What building it found in the code before it.** Each was repaired, and each note is in `docs/defects/fixed/`:
> - a plan decision's relaunch appended the gated prompt as a second task, so every approved prompt was worked twice;
> - a request queued behind an open approval dialog was denied unshown after ten seconds. That repair's first cut left a
>   request queued behind a closing window to hang, which the orchestrator's own review found and repaired;
> - the composer's Pause stayed disabled after the first pause;
> - the status strip read "run Running" in the recovery state;
> - a persona window at rest could keep a first view without its transcript;
> - the Mission view offered Pause and Cancel with no run behind the session.
>
> The open defects noticed along the way are recorded in `docs/defects/`.
>
> **What was measured.** The gate went from 2418 to 2620 passing tests, with only the three known failures, and each new
> limb turned a test red when reverted. Thirteen scenarios were driven in the built app, each as the text says:
> - the `paused` presentation after a pause and after a stop;
> - one paused child cancelled at rest with its paused descendant, then the rest continued;
> - a crash-left session's presentation, and a crash-left child cancelled at rest;
> - the paused strip's `Continue` and `Send` with the count and decline in the notices row, and `/stop`;
> - a crash-left session in the recovery state and after a repair, "Continue without them", the Continue action, and a
>   continue by message;
> - a continue's message as a held task;
> - a resume under a changed persona's instructions, with its single warning;
> - the plan gate around a resumed iteration (`PD-ORCH-003` revision 2).
>
> **What was not measured.**
> - The four repairs of the last review round were checked in the built app by the round that made them; the independent
>   re-drive did not run, because the subagents' usage limit was reached.
> - Persona windows cannot be addressed by the driver, so their state was read from screen captures
>   ([`the-driver-cannot-address-persona-or-approval-windows.md`](../defects/the-driver-cannot-address-persona-or-approval-windows.md)).
> - Clause 14's orchestrator-instructions and tool-change variants were not driven.
> - Clause 20 is not observable with the scripted client; its evidence is the tests.
> - No live run was made with the build, and only Linux under Xvfb was driven; the live run of 2026-09-29 follows.
>
> The row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).

> **Measured by the live run, 2026-09-29, under [R-066](requests.md#r-066):** the built product against the owner's
> self-hosted endpoint (`qwen3.8-flash-next`, registered unmetered), in `pnpm live-run`'s throwaway workspace.
> - Every standard scenario passed. `edit` split its work between two children writing in parallel under declared
>   write scopes, `requirements` carried a card from release to done in a worktree of its own, and the fault ladder
>   and the stalled stream each ended `completed`.
> - A scenario of its own, `resume`, measured this directive against a real model:
>   - it paused a delegating run through the composer's Pause while two children ran, and the paused composer drew
>     both `paused` with "3 agents will resume" (clauses 6, 13 and 19);
>   - the Continue resumed the same iteration and both children under their own task ids, each record continuing
>     across the pause (3 entries before it, 15 and 17 after), and each child's next request carried what it had
>     recorded last (clauses 1 to 4);
>   - one child's first `read_file` had been cut off by the pause and recorded "not run"; resumed, the model read that
>     result in its own record, read the file again and wrote its note (clause 4);
>   - the iteration closed `succeeded`, and both notes were read back from disk.
> - It found two launches that fail as root, each repaired
>   ([`the-live-run-cannot-launch-as-root.md`](../defects/fixed/the-live-run-cannot-launch-as-root.md),
>   [`the-code-intelligence-server-dies-when-the-app-runs-as-root.md`](../defects/fixed/the-code-intelligence-server-dies-when-the-app-runs-as-root.md)). `main` had repaired both
>   independently (OQ-82 for the code-intelligence child), and its repairs stand.
>
> The evidence packs are under `.live-run/runs/`, outside the repository.

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
