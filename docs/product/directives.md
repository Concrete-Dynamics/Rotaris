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

**Ninety-seven.** The count here is the number of entries below, written nowhere else so that it cannot go
stale. A **revised** directive keeps its number and does not add to it (`README.md`: "a changed
directive gets a new revision, not a new number"); `PD-CHAT-004` is at revision 3.

---

<a id="pd-shell-001"></a>

### PD-SHELL-001 — a chosen project folder may be opened in an additional main window

*Revision 3 (2026-10-14, [R-072](requests.md#r-072), ruling [OQ-292](../architecture/open-questions.md#oq-292)) — **`focus-session`
names its session's workspace and takes the reach**, in the gesture clause below; revision 2's clause quoted beside it.*
*Revision 2 (2026-10-13, [R-072](requests.md#r-072), ruling [OQ-267](../architecture/open-questions.md#oq-267)) — **a notice
action's reach**, in the gesture clause below; revision 1's clause quoted beside it.*

Choosing a project folder from inside a window SHALL offer two outcomes, and which one is taken SHALL
be decided by the gesture that starts the flow rather than by a question asked afterwards: the
**replacement** of REQ-SHELL-017, or the **addition** of a main window on the chosen folder with the
window that issued the request left open and unchanged.

**The gestures — revision 3.** The add route SHALL be reachable by two gestures — a shortcut-less command
palette entry labelled "Open project folder in a new window", present in every window and in the
composer's slash catalogue on the terms of REQ-SHELL-048 and REQ-SHELL-056; and activating the
title-bar workspace chip of REQ-SHELL-035 with the platform's secondary-activation modifier held —
and by one reach that opens no chooser: **activating a notice action of REQ-NOTIFY-044 that names a
workspace.** Where a main window holds that workspace under REQ-STARTUP-163's rule, it is surfaced, no
window is built, and the action's surface opens there. Otherwise a main window is added for it on this
directive's add terms below, and the action's surface opens in the added window. The reach binds every
vocabulary member that names a workspace: the hook review, project initialization (OQ-262, OQ-294), and
**`focus-session`, which SHALL carry the workspace of the session it names**, taken from the run host's record
of the root that session was started or resumed under and never from a window. Its surface is the session
itself: the session SHALL be focused in the window surfaced or added, through that window's own session load.
A notice whose session's workspace is not known SHALL carry no action. Every other activation of the chip is
the replacement route, on which REQ-SHELL-021 governs in full.

> **Revision 2 said, and no longer governs:** "The reach binds every vocabulary member that names a workspace: the hook
> review now, and project initialization once a notice carries it (OQ-262)." — `focus-session` named a session and no
> workspace, so it was outside the reach; pressed in a window whose workspace did not hold the session it was, from
> 2026-10-14, not dispatched and only logged. That silence is withdrawn by this revision.

> **Revision 1 said, and no longer governs:** "The add route SHALL be reachable by exactly two gestures, and by no other: a
> shortcut-less command palette entry labelled "Open project folder in a new window", present in every window and in the
> composer's slash catalogue on the terms of REQ-SHELL-048 and REQ-SHELL-056; and activating the title-bar workspace chip of
> REQ-SHELL-035 with the platform's secondary-activation modifier held."

*Pointer, 2026-10-14:* [OQ-294](../architecture/open-questions.md#oq-294) ruled the project-setup banner's press for a project
no window holds under revision 2's reach (a window is added), recorded as [`PD-WORKSPACE-005`](#pd-workspace-005) revision 3.
*(Moved out of the quotation of revision 1 on 2026-10-14 by fin44, where it read as part of the quote.)*

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

**Why revision 2, and what it costs.** The closed list of two gestures existed so that skipping REQ-SHELL-021's gates is
always a deliberate, chosen act before a chooser opens. A notice opens no chooser, REQ-NOTIFY-044 forbids asking anything
further, and a declined gate would leave the action doing nothing, so that reason does not reach a notice's action; adding a
window asks nothing and closes nothing the user has open. What it costs: the reach is a full workspace open, so the
workspace's initialization resolution and its own automatic requirements queue (REQ-TRACE-476/482) may start work; the named
workspace becomes the remembered one; focus moves to the surfaced or added window; and a persistent notice kept after a
switch (REQ-NOTIFY-224) can reopen a workspace the user left.

**Why revision 3, and what it costs.** REQ-NOTIFY-031's and REQ-NOTIFY-032's notices are raised exactly when their session
is not on screen, and every notice is shown in every main window, so with two windows on two workspaces (or after a switch)
"Open the session" was pressed in a window whose store does not hold the session. It used to raise "The session could not be
loaded" there and record the session under the wrong workspace; from 2026-10-14 it did nothing visible. REQ-NOTIFY-044 asks
that an action concerning an object act on that object without asking anything further, and a session's object includes
where it lives: so the action carries the session's workspace, as the hook review carries its own (ESC-34), and reaches it
the same way. What it costs, beyond revision 2's costs for any reach: where no window holds the session's workspace, the press
adds one, so that workspace's initialization resolution and its automatic requirements queue (REQ-TRACE-476/482) may start
work, it becomes the remembered workspace, focus moves to the added window, and a persistent notice left over from a session
of a project the user has since closed (REQ-NOTIFY-224 keeps one across a switch) reopens that project when pressed. A notice
raised for a session the run host has no root for carries no action at all, rather than one that guesses a window. And the
logged silence is withdrawn: a refusal in the session's own workspace (a deleted session, a session another process holds)
is raised there as the ordinary load error.

> **Extends:** REQ-SHELL-017, REQ-STARTUP-161, REQ-NOTIFY-044, REQ-NOTIFY-031, REQ-NOTIFY-032
> **Narrows:** REQ-SHELL-021

*Raised by the owner, 2026-09-12; logged as [R-004](requests.md#r-004).* *Revised by [R-072](requests.md#r-072), 2026-10-13,
ruling [OQ-267](../architecture/open-questions.md#oq-267) (revision 2): both advocates recommended the add; the ruling takes
one advocate's user-facing costs and the other's directive revision. The new case stays disjoint from
[`PD-SHELL-009`](#pd-shell-009)'s narrowing of REQ-SHELL-021, which covers gate (3)'s count on the replacement route.*
*Revised by [R-072](requests.md#r-072), 2026-10-14, ruling [OQ-292](../architecture/open-questions.md#oq-292) (revision 3): the
press reaches the session where it lives; REQ-NOTIFY-044 (with its Data & Formats parameterisation, which becomes "parameterised
by session identifier and its workspace"), REQ-NOTIFY-031 and REQ-NOTIFY-032 are extended and carry the back-pointer.*

> **First execution of revision 3, 2026-10-14 (fin44, `fin44-notice-reach`).** Built the day it was ruled: `focus-session`
> carries `{sessionId, workspace}` (`packages/contracts/src/notices.ts`); the run host stamps `run.result` and `notice.publish`
> with the root it recorded the session under (`withSessionRoot`, `apps/desktop/src/run-host/session-roots.ts`); main builds
> REQ-NOTIFY-031's and REQ-NOTIFY-032's notices and the recording failure's "Reopen the session" from it, with no action where
> none is recorded (`run-failure-notice.ts`, `recoveryFor` in `index.ts`); the renderer's arm sends `session.focusFromNotice`,
> main reaches the workspace (`MainWindows.reach`) and sends the reached window channel 16 (`session:focus`), which a window
> still loading holds on its record until its renderer's `session.focusReady` (`MainWindows.focusSession` /
> `sessionFocusReady`); the reached window focuses the session through its own `session.resume`. The `fromNotice` silence is
> gone. **What was measured.** `session-roots.test.ts` (the root stamped, and nothing where none is recorded),
> `run-failure-notice.test.ts` (the workspace carried, the action absent without one), `main-windows.test.ts` (held elsewhere,
> held nowhere, a request held until ready), `commands/session.test.ts` and `recovery-wiring.test.ts`, each red on the code
> before; `notice-proof` section 6c — a run of the holding window, released there, ends; its "Open the session" pressed in the
> other window surfaced the holder (`surfaced window 2 …; the focus was sent`), which followed the session, the pressing window
> loading nothing and no "could not be loaded" error raised — and section 6d, the same press after the session's window
> switched to another project: a window was added for the session's workspace, the focus **held** on its record and delivered
> 20 ms later at its renderer's `session.focusReady`, and the added window followed the session (load average 5.9 to 6.6 on
> four CPUs). **Found beside it:** the unreviewed-hooks notice a run publishes still names the focused window's workspace
> ([`a-runs-unreviewed-hooks-notice-names-the-active-windows-workspace.md`](../defects/fixed/a-runs-unreviewed-hooks-notice-names-the-active-windows-workspace.md)),
> not repaired then; repaired 2026-10-14 by fin44 (`fin44-hooks-and-config`) under OQ-293's ruling. The row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).

> **First execution of revision 2.** Built before it was ruled, as the reading OQ-267 recorded: `MainWindows.reach`
> (`apps/desktop/src/main/main-windows.ts`) for the hook review, the 2026-10-13 row of
> [`../architecture/first-executions.md`](../architecture/first-executions.md) (fin41, N86), and `pnpm notice-proof` sections 6
> (a notice naming the window's own workspace surfaces it and builds none) and 6b (a notice naming a workspace no window holds
> adds a window, asks nothing and closes nothing). The ruling changed no behaviour; the comments that called the reading
> provisional now cite this revision (2026-10-14, fin43).

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

> **Narrows:** REQ-LIBRARY-088, REQ-LIBRARY-090, REQ-LIBRARY-099, REQ-TOOLS-148

*Corrected 2026-10-13 under [OQ-237](../architecture/open-questions.md) (GV1, [R-072](requests.md#r-072)): REQ-LIBRARY-099
and REQ-TOOLS-148 move from Extends to Narrows. Each closes its section filter over a set, and `commands` joins that set
(a section name outside it is still refused), a change to an exact enumeration and so a narrowing (acceptance finding F15).
Their case is disjoint from `PD-LIBRARY-004`'s, which consumer a read marks. The disposition read until then, and no longer
governs:* "> **Extends:** REQ-LIBRARY-088, REQ-LIBRARY-090, REQ-LIBRARY-099, REQ-TOOLS-148"

*Corrected again 2026-10-13 on the same test (GV1, [R-072](requests.md#r-072)), outside the ruling's bounded re-read:
REQ-LIBRARY-088 and REQ-LIBRARY-090 move from Extends to Narrows. REQ-LIBRARY-088's field inventory is closed and gains
`commands[]` on a `child_report` record; REQ-LIBRARY-090 fixes its sections "in this order" and gains **Commands** before
Edited Files. Each is a change to an exact enumeration, so a narrowing (acceptance finding F15); no other directive reaches
either. No behaviour moves and no revision is taken. The disposition read until then, and no longer governs:*
"> **Narrows:** REQ-LIBRARY-099, REQ-TOOLS-148" *beside* "> **Extends:** REQ-LIBRARY-088, REQ-LIBRARY-090"

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

*Revision 2 (2026-10-06, [R-071](requests.md#r-071)) — **the cost paragraph's capacity unit**, the owner's ruling of
OQ-166. The normative clauses are unchanged; the last sentence of "Why, and what it costs" is replaced below and quoted
beside its replacement. Revision 1 (2026-09-13, [R-012](requests.md#r-012)) is otherwise unchanged.*

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
readability at density leaning on line-height and the block gap instead, and — revision 2 — that the
recycled pool's capacity is counted in the shortest row a slot can hold, 20 px (`SHORTEST_ROW_HEIGHT` in
`packages/ui/src/transcript/constants.ts`), so a tall viewport of short rows binds enough slots, while the
30 px figure (`ROW_MIN_HEIGHT`) stays the floor of the estimate a row is positioned by before its first
measurement.

> *Revision 1 said, and no longer governs:* "and that the recycled pool's capacity arithmetic
> (`ROW_MIN_HEIGHT` in `packages/ui/src/transcript/constants.ts`) keeps the 30 px figure as a conservative
> slot-size floor while real rows may be shorter." A unit taller than the shortest row binds fewer slots
> than a tall viewport of such rows shows, so for capacity the 30 px figure was the opposite of
> conservative (acceptance finding A38, repaired 2026-10-01).

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

*Revision 3 (2026-10-07, [R-072](requests.md#r-072), ruling [OQ-204](../architecture/open-questions.md)) — **when the gate
cannot hold every part**: one paragraph is added after revision 2's **Expanded** clause, and nothing is replaced.*

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

**When the gate cannot hold every part — revision 3.** Every part of the expanded gate other than the plan SHALL have a
height bound below the plan's floor. The product's own text (the heading, the intent sentence, a refusal's reason and the
three answers) is bounded by that text. The implied todo and a later cycle's "You asked for" line are bounded by a cap:
each takes its content height up to the cap, scrolls inside itself past it, and wraps its text so the gate never scrolls
sideways. The revision field is bounded by its default height, which grows with nothing typed. The plan's floor SHALL
stand above every such bound in both presentations, so the plan is the largest part of the expanded gate at every window
size the shell supports. The one exception is a height the user gives the revision field by dragging it: the field keeps
that height while it stays on screen, and it may then stand taller than the plan. When the area is shorter than the
gate's parts with the plan at its floor, the gate SHALL scroll with its three answers pinned at its foot, and no part
yields below its content or its bound. *Why:* the plan is what is decided; the user's own earlier words stay in the
durable record and one scroll away; a drag is the user's own choice of layout, and the adopted `textarea.input` grants it.

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
[R-032](requests.md#r-032). Revision 3 logged as [R-072](requests.md#r-072) (OQ-204), ruled by the consortium under the
owner's delegation, both advocates' recommendation followed. `REQ-CHAT-010` joins the dispositions at revision 2: its 180 px transcript
minimum is a floor under an area this directive now takes in full while the gate is expanded, and a
requirement a mechanism contradicts is named by the directive or it is an ungoverned deviation from it.*

> **First execution of revision 3, 2026-10-07, built under [R-072](requests.md#r-072):** the paragraph held as written.
> `.plan-gate__prior` takes the todo's cap (`max-height: var(--rt-space-16)`), `overflow: auto` and `overflow-wrap: anywhere`
> (`packages/ui/src/shell.css`). **What was measured.** `plan-gate.test.ts`'s cap case, red on the CSS before; and
> `pnpm plan-gate-proof`'s `revised-at-minimum` launch at 1000x680 beside REQ-NOTIFY-032's warning, at cycle 2 with a
> 1,029-character stated change holding a 120-character unbroken run. On the CSS before the change it went **red**: the
> "You asked for" line stood 143 px against the plan's 72 (the heading 24, the intent 19, the todo 56, the closed field 22,
> the answers 41). After it: the line 64 px, scrolling (143 of content in 64), the plan 72 and the tallest part, the only
> one that grows, nothing else yielding, the gate 858 px wide with nothing to scroll sideways, 99 px to scroll down, and the
> three answers hit. With the revision field opened and set to 240 px as a drag sets it, the field held 240 px (its part
> 262), the plan's floor read 112px, the plan was still the only part that grows, nothing else yielded, and the answers
> were hit; "largest" is not asserted there. Taken at a load average of about 9 on four CPUs, beside another plan's
> builders. **What was not measured.** A drag with the pointer (the proof sets the height a drag sets) and the keyboard
> scroll of the capped line. The row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).

> **The two readings left unmeasured, measured 2026-10-13, plan fin42:** `pnpm plan-gate-proof`'s `revised-by-hand` launch, at
> cycle 2 with the 1,029-character stated change, at the product's default window. **The keyboard:** with focus on the part
> before the capped "You asked for" line (the edit toggle), a real Tab moved focus onto the line itself, whose content is
> 160 px in a 64 px box, and a real PageDown scrolled it by 42 px *(2026-10-14, fin43: that figure was read the moment
> `scrollTop` left 0, mid smooth-scroll — three fin42 runs read 25, 39 to 42 and 40; read once two frames agree, one run
> at a load average of about 2.7 gave 56 px of the 96 the line can scroll)*; the line takes focus as a scroll container, with no
> `tabindex` of its own. **The pointer:** a real drag of the revision field's resize grip 120 px down (`ROTARIS_CAPTURE_GRIP_DRAG`,
> a new verification seam pressing just inside the element's bottom-right corner) took the field from 80 to 200 px, the
> height held as its own inline `200px`; the plan, at its 112 px floor, was still the only part that grows, and the three
> answers were hit. The field then stood taller than the plan, the exception the paragraph grants. The paragraph held as
> written. Taken at a load average of about 2.7 on four CPUs. The row is in
> [`../architecture/first-executions.md`](../architecture/first-executions.md).

<a id="pd-orch-003"></a>

### PD-ORCH-003 — an approval releases the plan gate for the session, not only for the run

*Revision 3 (2026-10-06, [R-071](requests.md#r-071)) — **the readings OQ-104 and OQ-137 recorded, ratified as built**: two
paragraphs added after revision 2's. Nothing is replaced.*

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

**A resumed iteration and the gate, at its edges (revision 3).** Revision 2's unheld resume SHALL reach an iteration a crash
left open, once `PD-ORCH-005` clause 18 has recorded the crash, as it reaches one a rest left open. The hold SHALL fall where
a new iteration would begin: after the resumed iteration closes, the run checks the stop, the pause, the queued prompts
and the stop conditions as before every iteration, and holds only when work is left. The message-limit pause reached as
the resumed iteration closes, and a pause or a stop accepted during it, win over the hold. Any iteration after the resumed
one is new and is held, a requeued resumed task included. A run whose intent is in REQ-ORCH-021's answer group is not
held. The plan cycle held there is told the plan request, that the resumed iteration has closed, the tasks still pending
in the order the run takes them up (the first twenty, each to 500 characters) and what became of the continue's messages,
then the launch content, whose handoff the continue built before that iteration ran and which is not rebuilt. A plan
decision's relaunch appends no task, and a revise after this hold is launched as any revise is.

**The run-start control (revision 3).** "The run-start control" is the composer's run-start chip alone. Choosing `plan` in
the Settings Runtime category, which only changes the pending value until Save, re-arms no session; when the followed
session holds a release, its hint states that the session is released and that choosing Plan first on the composer's
control plans its next run again. No surface offers the re-arm on a paused session, where REQ-CHAT-006 disables the chip.

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
precedence stays unambiguous. *(Since 2026-10-13 ([OQ-237](../architecture/open-questions.md)) only the supersession half of this
still holds: `REQ-ORCH-153`, superseded, may be neither narrowed nor extended, but a second narrowing of `REQ-ORCH-154` in a
disjoint case that names `PD-ORCH-002` would build. The first reason, the precedence this directive does not need, stands.)*

> **Narrows:** REQ-ORCH-152

*Raised by the owner, 2026-09-17; logged as [R-035](requests.md#r-035). Revision 2 logged as [R-064](requests.md#r-064),
revision 3 as [R-071](requests.md#r-071).*

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

> *2026-10-13, plan fin42:* the live run's new `plan-gate` scenario (`apps/desktop/scripts/lib/approval-scenarios.mjs`) is
> the first to meet the gate with a real model: held at `run_start_mode: plan` with the plan drawn as Markdown, nothing
> written and no `loop_supervisor_activation` while held (PD-ORCH-001, PD-ORCH-002), approved through the gate's own button,
> and a second prompt in the released session not held (this directive). It is written and not yet run; the run is the
> orchestrator's, and its result reports here.

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
>
> **First execution of revision 3, 2026-09-29, the day it was ruled:** the floor held as written. `formatAmount`
> returns `< 0.0001` for an amount greater than zero that the half-up rounding brings to zero, and `costLabelOf`
> needed no change, because each label takes the rendered figure whole: `< 0.0001 at configured rates`,
> `< 0.0001 reported by the provider`, `at least < 0.0001; some requests have no price` — the table above, unchanged.
> The stored figure is the exact one. The row is in
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

*Revision 2 (2026-10-13, [R-072](requests.md#r-072), rulings [OQ-235](../architecture/open-questions.md#oq-235) and
[OQ-236](../architecture/open-questions.md#oq-236)) — **which instruction files the retrospective reads** (OQ-235): the
rule paragraph's instruction-file clause is replaced, and revision 1's is quoted beneath it; the reach clause is unchanged
word for word. **Where the retrospective departs from the requirements it sits beside, and its start gesture** (OQ-236):
one paragraph added after "Reach, and the boundary it holds"; revision 1 said nothing on these points, so nothing is
replaced.*

*Revision 3 (2026-10-13, [R-072](requests.md#r-072), ruling [OQ-271](../architecture/open-questions.md#oq-271)) — **the
per-run history**: clause (h) is added to the revision-2 paragraph and REQ-LIBRARY-034 joins the Narrows line. Revision 2
said nothing on the per-run history, so nothing is replaced.*

*Revision 4 (2026-10-14, [R-072](requests.md#r-072), ruling [OQ-285](../architecture/open-questions.md#oq-285)) — **an empty
artifact whose collector failed, and a timed-out retrospective**: one sentence is added at the end of clause (c), which points
at [`PD-LIBRARY-005`](#pd-library-005). Revision 2's text of (c) stays otherwise word for word, so nothing is replaced.*

*Revision 5 (2026-10-14, [R-072](requests.md#r-072), ruling [OQ-300](../architecture/open-questions.md#oq-300)) — **the
retrospective's authentication refusal**: one sentence is added at the end of "The model", and REQ-WORKSPACE-137 and
REQ-WORKSPACE-152 join the Extends line. Revision 4 said nothing on a retrospective whose entry provider has no credential, so
nothing is replaced.*

**The rule.** Beside the per-run analyst of section 3, the improvement domain SHALL carry a second
kind of analysis pass, the **retrospective**. A retrospective SHALL read only material this product
already keeps for the workspace it runs in — session records, improvement artifacts and their
recorded versions, saved prompts, persona memory, and the instruction files `PD-WORKSPACE-002` discovers at the
workspace root, of those enabled under REQ-WORKSPACE-048's master switch and the per-file switches (revision 2, OQ-235)
— and SHALL author, per REQ-LIBRARY-003,
evidence-backed proposals of the closed vocabulary of REQ-LIBRARY-006 about **how the workspace is
worked in across runs**, not about how one run went. A retrospective proposal's evidence entries
MUST be attributable to material the workspace's own record holds, in the way REQ-LIBRARY-017
attributes a per-run proposal's evidence to its source run: each entry names the record that holds
what it cites, and a proposal whose evidence cannot be so attributed MUST NOT reach a review
surface.

> **Revision 1 said, and no longer governs** (OQ-235): "and the workspace's own `AGENTS.md` or `AGENTS.override.md` as
> REQ-WORKSPACE-041 fixes discovery". `PD-WORKSPACE-002` has since widened that discovery to four names at the root and
> two at each of five further bases, and OQ-65 (R-071) read the clause as pointing at the rule by name, so the read
> widened with it into the global, home-relative and machine-wide bases this directive's reach clause rules out. Revision
> 2 names the set: the root's files, with every switch injection honours. Files at the other bases still reach every
> agent through injection; the retrospective neither cites them nor proposes an edit to one, which would change every
> other workspace on one workspace's history and lie outside the rollback point REQ-LIBRARY-116's undo takes from the
> workspace's own tree.

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

**Where the retrospective departs from the requirements it sits beside — revision 2 (OQ-236).** Those requirements govern
the per-run pass unchanged. For a retrospective, and only for one, each of these cases holds instead:

- (a) **The artifact (REQ-LIBRARY-011).** Every artifact carries `source_kind`, either `post_run` or `retrospective`. A
  retrospective artifact stores `source_session_id` null and names the sessions it read in `considered_session_ids`.
- (b) **The parser (REQ-LIBRARY-020).** For a retrospective, the parser keeps an evidence entry's `source_session_id` only
  when the entry names a session in the job's `considered_session_ids`, and otherwise stores null. It never backfills one.
- (c) **The notices (REQ-LIBRARY-124).** A retrospective with proposals posts a persistent success notice titled
  "<N> retrospective proposal ready" or "<N> retrospective proposals ready", with "Review proposals" opening the Library on
  the proposals tab. With zero proposals it posts the info notice "The retrospective found nothing to propose", with no
  action. A failure posts the warning "The retrospective could not be completed", conveying that the workspace's own
  history was not reviewed and the reason; it names no run and offers no action. An empty artifact whose collector crashed or
  whose answer could not be parsed, and a timed-out retrospective, read as [`PD-LIBRARY-005`](#pd-library-005) states.
  *(Revision 4, OQ-285.)*
- (d) **The indicators (REQ-LIBRARY-125, REQ-NOTIFY-250).** While a retrospective runs, both indicators carry the label
  "Reviewing workspace history for improvements…". The title-bar indicator keeps the accessible name "Improvement analysis
  status" and has the description "Reviewing this workspace's own history for improvements in the background. You can
  continue working." The run-header indicator conveys the same three facts about the workspace's history. REQ-NOTIFY-250's
  indicator is also shown while a retrospective is in flight.
- (e) **The start gesture (REQ-LIBRARY-125's no-control-disabled clause).** The retrospective's start gesture stays
  available while a post-run analysis is queued or running, and a press queues behind it in REQ-LIBRARY-123's FIFO. While a
  retrospective is queued or running in the workspace, the gesture on the Library tab and the Overview card is unavailable,
  with the tooltip "A retrospective is already queued or running.". The palette entry stays listed; activating it in that
  state posts one info notice with that reason and queues nothing. Every other control stays enabled.
- (f) **The Overview card's hint (REQ-LIBRARY-130).** The empty hint reads "Run improvement analysis, or a retrospective
  over this workspace's history, to produce reviewable suggestions."
- (g) **The Library's proposals card (REQ-LIBRARY-109).** The card note reads "Evidence-backed suggestions from the
  improvement collector after each run, and from retrospectives over this workspace's history." The empty label reads "No
  proposals yet. They appear here after a run's improvement collector finds signals, or after a retrospective over this
  workspace's history."
- (h) **The per-run history (REQ-LIBRARY-034).** A later per-run pass's prior-artifact history excludes every artifact
  whose `source_kind` is `retrospective`. The exclusion is applied before the five-artifact bound, so every prior artifact
  supplied has a source session that REQ-LIBRARY-025 records, and REQ-LIBRARY-017's naming clause holds as written. The
  retrospective's own reading of prior proposals, post-run ones included, is unchanged. *(Revision 3, OQ-271.)*

The retrospective also shows the indicators of REQ-LIBRARY-126 when no session's analysis is in progress, and its gesture
sits in the header of REQ-LIBRARY-128's card beside the tag and "Open in Library →"; both requirements are untouched. The
palette entry, REQ-LIBRARY-127 and REQ-LIBRARY-174 take no disposition: the first follows REQ-SHELL-048's terms, and the
other two already read without a pass. *Why:* a fixed label, field or text that would be false of a retrospective is a
departure the directive states rather than one a reader infers; the texts of (f) and (g) sit above retrospective rows; and
a gesture greyed out behind a post-run review contradicted REQ-LIBRARY-125 and ADR-0065 consequence 2 while the palette
already queued, but a second retrospective over an unchanged workspace reads the same evidence and duplicate suppression
discards its proposals after the owner has paid for them, so that one press is refused.

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
happens here that a user did not just ask for by name. A retrospective whose lease leaves its entry provider unresolved is
refused with REQ-WORKSPACE-137's headline "Provider authentication required" and the detail "Authenticate at least one
configured provider before running a retrospective.": at its capture, that refusal is posted as one error notice per gesture,
titled with the headline, with the detail as its body and the action that opens Settings at Models, which REQ-WORKSPACE-152 (2)
gives that requirement's refusals; at its analysis, the same reason is carried inside clause (c)'s failure warning, which keeps
no action. *(Revision 5, OQ-300.)*

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

> **Narrows:** REQ-LIBRARY-011, REQ-LIBRARY-020, REQ-LIBRARY-034, REQ-LIBRARY-109, REQ-LIBRARY-124, REQ-LIBRARY-125, REQ-LIBRARY-130, REQ-NOTIFY-250
> **Extends:** REQ-LIBRARY-003, REQ-LIBRARY-006, REQ-LIBRARY-015, REQ-LIBRARY-017, REQ-LIBRARY-126, REQ-LIBRARY-128, REQ-MONITOR-173, REQ-NOTIFY-251, REQ-WORKSPACE-041, REQ-WORKSPACE-137, REQ-WORKSPACE-152

*Until 2026-10-07 this block read `> **Extends:** REQ-LIBRARY-003, REQ-LIBRARY-006, REQ-LIBRARY-015` and beneath it
`> **New:** no live requirement covers a cross-session analysis pass; REQ-LIBRARY-017 forbids the per-run analyst exactly
this reach, faithfully to its own scope.` **New** is used alone and names no identifier (`README.md`, "The shape of an
entry"); the symbol generator dropped the line without a word, so REQ-LIBRARY-017 reached no register. The four
back-pointers at REQ-LIBRARY-017, REQ-MONITOR-173, REQ-NOTIFY-251 and REQ-WORKSPACE-041 have read "Extended by" since
2026-09-17, as [R-033](requests.md#r-033) named them, while this line named three. REQ-LIBRARY-017 is recorded under
Extends because its clauses bind an analysis that a run triggered, and the rule above leaves them whole for the per-run
analyst. No rule text changed ([OQ-222](../architecture/open-questions.md), ruled under [R-072](requests.md#r-072);
[`six-back-pointers-name-a-directive-whose-disposition-does-not-name-their-requirement`](../defects/fixed/six-back-pointers-name-a-directive-whose-disposition-does-not-name-their-requirement.md)).*

*Revision 2, 2026-10-13 ([OQ-236](../architecture/open-questions.md#oq-236), ruled under [R-072](requests.md#r-072)): the
Narrows line is added and REQ-LIBRARY-126 and REQ-LIBRARY-128 join the Extends line, each requirement with its back-pointer;
the cases are the revision-2 paragraph's (a) to (g)
([`pd-library-002-reaches-further-requirements-its-disposition-does-not-name`](../defects/fixed/pd-library-002-reaches-further-requirements-its-disposition-does-not-name.md)).*

*Revision 3, 2026-10-13 ([OQ-271](../architecture/open-questions.md#oq-271), ruled under [R-072](requests.md#r-072)):
REQ-LIBRARY-034 joins the Narrows line with its back-pointer (clause (h)). REQ-LIBRARY-017 stays on the Extends line, and
REQ-LIBRARY-025 is untouched: with no retrospective artifact supplied as history, both read word for word for every run.*

*Revision 5, 2026-10-14 ([OQ-300](../architecture/open-questions.md#oq-300), ruled under [R-072](requests.md#r-072)):
REQ-WORKSPACE-137 and REQ-WORKSPACE-152 join the Extends line, each with its "Extended by" back-pointer. Both read word for word
for a run: the retrospective takes REQ-WORKSPACE-137's headline with a detail naming the retrospective, and REQ-WORKSPACE-152 (2)'s
action at its capture.*

*Raised by the owner, 2026-09-17; logged as [R-033](requests.md#r-033).*
Revision 2 logged as [R-072](requests.md#r-072) (OQ-235 and OQ-236), ruled by the consortium under the owner's
delegation: on OQ-235 the system-lens advocate's recommendation followed in substance and a revision taken in place of an
italic note; on OQ-236 both advocates' recommendations followed in part.
Revision 3 logged as [R-072](requests.md#r-072) (OQ-271), ruled by the consortium under the owner's delegation on
2026-10-13: the per-run history holds post-run artifacts only, so REQ-LIBRARY-025 and REQ-LIBRARY-017 hold word for word for
every run.
Revision 4 logged as [R-072](requests.md#r-072) (OQ-285), ruled by the consortium under the owner's delegation on
2026-10-14 and written the same day by fin44 (`fin44-improvement-failures`): clause (c) points at `PD-LIBRARY-005` for an empty
artifact whose collector failed and for a timed-out retrospective. The Narrows and Extends lines are unchanged; REQ-LIBRARY-124's
case is `PD-LIBRARY-005`'s, which names this directive.
Revision 5 logged as [R-072](requests.md#r-072) (OQ-300), ruled by the consortium under the owner's delegation on
2026-10-14 and written the same day by fin45 (`fin45-retro-and-record`): the retrospective's authentication refusal names the
retrospective and opens Settings at Models.
Revisions 4 and 5 were dated as ruled 2026-10-13 (and revision 4's header 2026-10-13) until fin46 (`fin46-accept1-12`)
corrected them from the consortium's ruling record, which dates both sittings 2026-10-14.

> **First execution of revision 2, 2026-10-13, ruled by [R-072](requests.md#r-072) (OQ-235) and built in plan fin34:** the
> clause held as written. The run host's `SkillHost.retrospectiveInstructionFiles` keeps the `workspace:` entries of the
> enabled set and `dispatch`'s `retrospective.capture` passes it; injection is unchanged. **What was measured.** Four cases
> in `apps/desktop/src/run-host/skills.test.ts` (the root's files only while injection keeps all seven bases' files, a
> switched-off root file, the master switch, a root override and a root with no file), red before the change. And
> `pnpm retrospective-proof`'s pass launch, with an `AGENTS.md` under a scratch `~/.agents` and a scratch machine-wide
> base beside the workspace's own: the run host logged "3 of 3 instruction file(s) enabled (workspace:AGENTS.md,
> user-agents:AGENTS.md, machine-codex:AGENTS.md)" and "1 of 3 enabled instruction file(s) at the workspace root
> (workspace:AGENTS.md)"; 37 of 37 checks at a load average of about 3 on four CPUs. **What was not measured.** A live
> retrospective against a real model (a live run starts none by itself). Recorded in
> [`../architecture/first-executions.md`](../architecture/first-executions.md).

> **First execution of revision 2's OQ-236 paragraph, 2026-10-13, built in plan fin34:** clauses (a) to (d) and (f) held as
> the build already stood (the paragraph ratifies them); (e) and (g) were built. **What was measured.** `pnpm symbols`
> registers seven more narrowed and two more extended requirements (195 and 62 as built) and `back-pointers.test.ts` reads
> every note both ways; the coordinator's three `retrospectivePending` cases, red before; the handler's three refusal cases;
> `retrospective-gesture.test.ts`'s gesture and text cases; and `pnpm retrospective-proof`, 42 of 42 at a load average of
> about 5 on four CPUs — the Overview hint (f) and the Library note (g) word for word, the Library gesture unavailable with
> "A retrospective is already queued or running." while the pass ran and available after it, and the palette's entry
> answered with one info notice while one artifact stayed in the store. **What was not measured.** A press made while a
> post-run analysis runs, in the built app (the proof drives no run; the unit cases carry it), and the Library's empty label
> (g), which shows only when artifacts exist and no proposal matches. Recorded in
> [`../architecture/first-executions.md`](../architecture/first-executions.md).
>
> **The two built-app gaps above closed, and the live steps written, 2026-10-13 (fin42, the survey's N58):** `pnpm
> retrospective-proof`, 54 of 54 at a load average of 2 to 7 on four CPUs. **(e) A press during a post-run analysis**
> (launch 7): a scripted run completes and its analysis is held 10 s; the Library's gesture reads available beside the
> `post_run` indicator, a press queues the retrospective and then rests the gesture with "A retrospective is already queued or
> running.", the indicator names the retrospective only after the post-run pass ends, and both artifacts are stored — the
> retrospective's empty, its proposals suppressed as duplicates of the post-run pass's (REQ-LIBRARY-046), its notes saying so.
> **(g) The empty label** (launch 5): beside the timed-out pass's empty artifact the proposals card reads "No proposals yet.
> They appear here after a run's improvement collector finds signals, or after a retrospective over this workspace's history."
> and the no-artifact state is gone. **Found by building:** once a retrospective artifact stood among a workspace's five newest,
> no later run's analysis was captured — its null source session reached the post-run job's `considered_session_ids` and the
> parse threw; repaired in `captureImprovementJob`, which records no session for it, and the reading raised as
> [OQ-271](../architecture/open-questions.md#oq-271)
> ([`fixed/a-post-run-analysis-after-a-retrospective-is-never-captured.md`](../defects/fixed/a-post-run-analysis-after-a-retrospective-is-never-captured.md)).
> **The live steps:** `live-run.mjs`'s `ask` now lets its run's analysis finish and its `ask-retrospective` presses the
> gesture (Ctrl+6, Proposals) and waits for the pass to end, asserting one retrospective artifact with no session that read the
> ask session, its notice, and the run host's "at the workspace root" line listing `workspace:` files alone; launch 8 of the
> proof runs those very capture steps against the scripted provider, green. **Not measured:** a live retrospective — the
> orchestrator's run. Recorded in [`../architecture/first-executions.md`](../architecture/first-executions.md).

> **Reported back 2026-10-13 (fin41), from the live packs at `552d346` (default and duress) and `0bc3eee`**: **NOT REACHED** in any
> of the three. No retrospective gesture was driven, and the post-run analyst was cut at the harness's exit in every
> session, as at every pack (REQ-LIBRARY-127). Found nothing, because nothing met the case. Evidence:
> [`live-552d346-default-autopsy.md`](../architecture/live-runs/live-552d346-default-autopsy.md),
> [`live-552d346-duress-autopsy.md`](../architecture/live-runs/live-552d346-duress-autopsy.md),
> [`live-0bc3eee-default-autopsy.md`](../architecture/live-runs/live-0bc3eee-default-autopsy.md).
> The rows are in [`../architecture/first-executions.md`](../architecture/first-executions.md).

> **First execution of revision 3, 2026-10-14 (fin43, `fin43-analysis-and-artifacts`), ruled by [R-072](requests.md#r-072)
> (OQ-271):** clause (h) held as written. `captureImprovementJob` (`packages/engine/src/improvements/capture.ts`) now keeps a
> prior artifact only when its `source_kind` is `post_run`, ahead of REQ-LIBRARY-034's bound of five; the null guard on
> `considered_session_ids` stays as a defensive no-op. **What was measured.** Two cases in `analyst.test.ts`, both red on the
> code before: a retrospective and a post-run artifact yield the post-run one alone and `considered_session_ids` `["session-1"]`;
> a newest retrospective ahead of five post-run artifacts yields exactly the five. `pnpm symbols` registers one more narrowed
> requirement (206) and `back-pointers.test.ts` reads REQ-LIBRARY-034's note both ways. `pnpm retrospective-proof`, 54 of 54 at
> a load average of 1.3 to 2.2 on four CPUs: launch 8's `live-shape-timeout`, a run after a retrospective in one workspace,
> still captured its analysis (the timed-out empty artifact and its notice), with no "capture failed" line in its log.
> **What was not measured.** That the later run's job carried no retrospective artifact, in the built app: the job's
> `prior_artifacts` are not stored or logged, and the stored artifact's `considered_session_ids` read the same before and after
> (the retrospective contributed no session either way); the unit cases carry it. A live run after a retrospective (no live
> scenario drives one yet). The row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).

> **First execution of revision 5, 2026-10-14 (fin45, `fin45-retro-and-record`), ruled by [R-072](requests.md#r-072)
> (OQ-300):** the sentence held as written; nothing in it met a build it could not describe. `leaseOver`
> (`apps/desktop/src/run-host/launch.ts`) takes its refusal's detail from its caller; `leasedSetup` passes the retrospective's
> sentence and `leaseForContinuation` keeps "before continuing this run". Main's `improvements.retrospective` posts
> `session.provider-auth` as one error notice per gesture, titled "Provider authentication required", the detail its body, with
> "Open Models settings" (`open-settings`, `models`), where it reached the generic "The retrospective could not be started"
> notice with no action before. **Found by building:** at analysis the warning read the reason's own period and then its own
> (`passFailureDetail`), so "… running a retrospective.." — repaired in the same change
> ([`fixed/a-retrospectives-failure-warning-ends-in-a-doubled-period-when-its-reason-ends-in-one.md`](../defects/fixed/a-retrospectives-failure-warning-ends-in-a-doubled-period-when-its-reason-ends-in-one.md));
> and the lease checks the entry role's provider rather than the retrospective model's, recorded and not repaired
> ([`fixed/a-retrospectives-lease-checks-the-entry-roles-provider-not-the-retrospective-models.md`](../defects/fixed/a-retrospectives-lease-checks-the-entry-roles-provider-not-the-retrospective-models.md))
> — *repaired 2026-10-14 by fin46 (`fin46-accept1-11`): "its entry provider" is read as the sign-in provider of the model the
> retrospective's request goes to (`retrospective_model`, then `medium_model`), which `leasedSetup` now requires
> (`PreparedRun.retrospectiveAuthProvider`); a continuation still requires the entry role's. The sentence is unchanged.*
> **What was measured.** Three unit cases, each red before the change: `launch.test.ts` (both sentences, the retrospective's
> and the continuation's), `commands/improvements.test.ts` (the notice's severity, title, body and action, twice for two
> presses, nothing queued) and `improvement-notice.test.ts` (a single period after a reason ending in `.`, `!` or `?`, one
> added after `)`); `pnpm symbols` registers two more extended requirements (69) and `back-pointers.test.ts` reads both notes
> both ways. **What was not measured.** The refusal in the built app: every proof drives the scripted provider, whose lease
> names no entry provider, so no proof reaches it; the live run with the entry provider's credential withheld (`live-run.mjs`'s
> new `ask-retrospective-unauth`) is the orchestrator's. `pnpm retrospective-proof`, 61 of 61 at a load average of 1.2 to 1.9
> on four CPUs, shows the other warnings `passFailureDetail` builds unchanged: a crashed collector's reason ending in ")" still
> gains its one period. The row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).

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
> **Narrows:** REQ-TOOLS-048, REQ-TOOLS-069, REQ-TOOLS-071, REQ-TOOLS-072, REQ-TOOLS-073, REQ-TOOLS-125, REQ-SANDBOX-052, REQ-SANDBOX-098, REQ-SANDBOX-099, REQ-SANDBOX-101, REQ-SANDBOX-103, REQ-SANDBOX-104, REQ-SANDBOX-105, REQ-SANDBOX-106, REQ-SANDBOX-107, REQ-SANDBOX-110, REQ-CONFIG-124, REQ-CONFIG-411, REQ-TRACE-470

*REQ-TOOLS-071, REQ-TOOLS-072 and REQ-SANDBOX-104 entered this line on 2026-10-07. The rule above has named all three by
identifier since 2026-09-21 and removes the same downgrade clause from each, while this line omitted them: the note at
REQ-SANDBOX-104 was written in this directive's own commit (`ed1c167`) and read "Narrowed by" with nothing here behind it,
and the notes at REQ-TOOLS-071 and REQ-TOOLS-072, with the missing one at REQ-TOOLS-069, are written now. No rule text
changed ([OQ-222](../architecture/open-questions.md), ruled under [R-072](requests.md#r-072);
[`six-back-pointers-name-a-directive-whose-disposition-does-not-name-their-requirement`](../defects/fixed/six-back-pointers-name-a-directive-whose-disposition-does-not-name-their-requirement.md)).*

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
this directive narrows, and the clause stops governing with them. *Since 2026-10-13
([OQ-237](../architecture/open-questions.md), GV1, [R-072](requests.md#r-072)) REQ-CONFIG-464 is named under Narrows
below, beside `PD-CONFIG-001`'s disjoint case, the MCP-grant half. The reason it was first left out no longer holds:*
"REQ-CONFIG-464 is deliberately **not** named in the dispositions below: `PD-CONFIG-001` already narrows it for the MCP-grant
half, one requirement carries one narrowing directive so that precedence is unambiguous, and the two halves are unrelated
subjects that no single revision could honestly hold. Its back-pointer says as much."

> **Narrows:** REQ-WORKSPACE-041, REQ-WORKSPACE-042, REQ-CONFIG-276, REQ-CONFIG-277, REQ-TOOLS-165, REQ-CONFIG-464, REQ-CONFIG-256, REQ-CONFIG-417
> **Extends:** REQ-CONFIG-040, REQ-CONFIG-047, REQ-WORKSPACE-043, REQ-WORKSPACE-048, REQ-CONFIG-258, REQ-WORKSPACE-039

*Corrected 2026-10-13 under OQ-237: REQ-CONFIG-256 and REQ-CONFIG-417 move from Extends to Narrows. The `instructions:` key
joins REQ-CONFIG-256's written keys, which are "exactly" a list, and the per-file switches join REQ-CONFIG-417's destination
1, an enumerated set; a change to an exact enumeration is a narrowing (acceptance finding F15). Their cases are disjoint
from `PD-CONFIG-003`'s, the two runtime timeouts.*

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

> **Reported back 2026-10-13:** the sentence "the guard has not run against a real endpoint" no longer holds. The live
> run's `terminal` scenario has run the guard against the owner's self-hosted endpoint since 2026-09-29 (its earliest
> recorded pack, `2026-09-29T02-41-56-779Z`, `live-run PASSED`), and every default live run since has passed its three
> checks, the last at `552d346` and `0bc3eee` on 2026-10-13: "the docker line was printed and exited 0", "a lower-case
> failed at exit 0 was not classified suspicious_success" and "no failure-marker warning on the lower-case line". Run
> `2e21e324`'s git line is still not replayed. The row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).

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

> **Built-app execution, 2026-10-13, plan fin42:** the first execution said "the built app was not driven";
> `pnpm approvals-proof`'s `session` launch now drives the rule through real dialogs, under `ask` with
> `delegation_strategy: single` so the entry role writes. The root creates `NOTES.md` and the dialog is answered
> "Approve for this session" (`session rule 'session:allow:1' added`); it reads the file and edits it, and the edit —
> another operation on the same path by the same persona — is allowed by `session:allow:1` (`session-rule`) with no
> approval request and no dialog, and reaches the disk. One `write_file` dialog was shown in the launch. With the
> path-scoped arm of `approvalMatches` (`packages/agent-tools/src/policy.ts`) taken out, the edit asks again and the proof
> fails on a second `write_file` dialog. The launch then leaves its terminal call's dialog to the 8 s timeout and reads the
> away mark in the audit (a `timeout` decision and one `user_away` entry, `after_seconds: 8`). The rule held as written.
> **Still not measured:** run `1ddeb71b`'s loop against a real model; `live-run.mjs`'s new `approvals` scenario asks a
> real model for three writes of one file at the asking default and is the orchestrator's to run. The row is in
> [`../architecture/first-executions.md`](../architecture/first-executions.md).

---

<a id="pd-tools-005"></a>

### PD-TOOLS-005 — after one unanswered approval, a run treats the user as away

*Revision 2 (2026-10-06, [R-071](requests.md#r-071)) — **the question tool's own approval** and **waits already
outstanding**, the two paragraphs marked below, which rule OQ-77 and OQ-78 as the owner took their recommendations.
Revision 1 (2026-09-23, [R-048](requests.md#r-048)) is quoted where it is replaced, never deleted.*

When an approval wait in a run ends by **timeout** (REQ-TOOLS-052's first mapping), the run SHALL treat
the user as **away**. While the user is away, every further ask in that run that would put an approval
prompt in front of the user SHALL instead be resolved at once, with no prompt and no wait, exactly as
REQ-TOOLS-065 resolves an ask in a session with no approval presenter: under `runtime.headless_approval_policy`
`deny` the call is refused and the agent may re-plan; under `abort` the call is refused and the run is
stopped on the terms that requirement states. The decision source is `headless-policy`. The reason SHALL
state that the user is treated as away because an earlier approval in this run went unanswered for `<N>`
seconds, where `<N>` is the timeout that expired; it SHALL NOT claim that no approval UI is available.

**The question tool's own approval — revision 2.** The one ask the away state SHALL NOT resolve is the approval
the public `ask_questions` tool's own call needs — under the `ask` preset that call is not in REQ-TOOLS-007's read-only
class, so it asks. That ask SHALL be put to the user and wait as it would were they present, and once approved the
question itself prompts and waits (below). Nothing else is exempt: the preset's decision on the call still stands, a
rule's decision still governs it, and a tool offered under that name that is not the public tool is not exempt.

**Waits already outstanding — revision 2.** When the run marks its user away, every approval wait of that run still
outstanding — shown, or queued unshown behind another dialog — SHALL end at once and be resolved exactly as an ask
made while the user is away is (the headless policy, source `headless-policy`, the same reason naming the timeout that
expired), its dialog withdrawn; it is not counted cancelled, and its own expiry is never a second transition. The
question tool's own approval wait is exempt, as above, and a wait the application's quit holds is the quit's to
withdraw (`PD-ORCH-005` clause 9), never resolved by this.

> **Revision 1 said, and no longer governs:** nothing of the question tool's own approval, so under the `ask` preset
> that ask was "a further ask … that would put an approval prompt in front of the user" and was resolved at once — no
> question reached an away user under the default preset ([OQ-77](../architecture/open-questions.md)); and nothing of a
> wait already running when the user was marked away, which its first execution read as running "to its own end", so
> each ask outstanding at the first expiry could still cost a full timeout ([OQ-78](../architecture/open-questions.md)).

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

*Revision 2's reasons.* A question is the one prompt the directive meant to keep for an away user, and under the
default preset revision 1 kept none; exempting only the question tool's own ask restores it without reopening the
waits the directive removed. A request queued behind an unanswered dialog was never seen, so ending the waits already
outstanding makes one unanswered approval cost one timeout, which is the directive's intent; with several agents asking
at once revision 1 still cost one full timeout per ask outstanding at the first expiry. What is given up: a dialog the
user was looking at when another approval expired closes under them, and a question's approval can still hold its
agent for a full timeout while nobody is there.

> **Narrows:** REQ-TOOLS-052, REQ-TOOLS-055

*Raised by the owner, 2026-09-23; logged as [R-048](requests.md#r-048). Revision 2 logged as [R-071](requests.md#r-071).*

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
> looking open; a timeline word is raised as [OQ-76](../architecture/open-questions.md). *(Since 2026-10-06,
> [R-071](requests.md#r-071): OQ-76 is ruled and [`PD-TOOLS-011`](#pd-tools-011) gives domain 05 `user_away` and
> `user_returned`, so both transitions are also timeline entries; the two session-log lines keep `WARNING` as above.)*
> **(5) The question clause under
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

> **First execution of revision 2, 2026-10-06, ruled by [R-071](requests.md#r-071) and built in plan fin21:** built as
> written. **(1) The exemption** is one test in the gate's `broker` (`AWAY_EXEMPT_TOOL`, `packages/agent-tools/src/gate.ts`):
> the call's name is `ask_questions` and the port serves the public tool of that name (`GateDeps.publicTool`, the same
> predicate PD-TOOLS-004 reads), so an MCP or plugin tool offered under the name is not exempt — a reading the text
> states. **(2) Ending the outstanding waits.** The run's holder, `UserPresence`, gains `onAway`; every brokered wait
> registers on it while it is outstanding (unregistered in `broker`'s `finally`), and the mark's transition ends each one
> through `PendingApprovals.endAway` with a new outcome, `away`, which `outcomeDecision` resolves through the same
> `headless` path an away ask takes. The dialog is closed by the line every ended wait already passes (`presenter.close`), a
> queued unshown request included, which REQ-TOOLS-054 would otherwise count as cancelled: it is resolved, not discarded.
> The expired wait's own registration finds its waiter already gone. A wait held for the quit is skipped (`GateDeps.quitting`),
> so PD-ORCH-005 clause 9's withdrawal stays the only end of it. **What was measured:** unit cases only, each red on
> `37f7a98`: in `gate.test.ts` three waits of one gate on the fake clock, the first shown and two queued behind it, the
> first expiring at 5 s and the two ending in the same tick with the away reason, all three dialogs closed and every
> listener gone; under `abort`, the ended wait invoking the hook; the question tool's own wait surviving the mark; a
> quit-held wait surviving it and withdrawn by the quit; the question tool's ask under `ask` brokered while away and its
> question then put; and in `presence.test.ts` the listener told once per stretch. **What was not measured:** no built-app
> run: no proof drives an approval to its timeout (`questions-proof` drives the question surfaces, not the away state),
> and the orchestrator's live runs are the first that can. The row is in
> [`../architecture/first-executions.md`](../architecture/first-executions.md).

> **Built-app execution of revisions 1 and 2, 2026-10-13, plan fin42:** the two first executions above said "no built-app run";
> `pnpm approvals-proof`'s `away` launch now drives both against the scripted model, under `ask` with
> `approval_timeout_seconds: 12`, through real dialogs (the approval seam's per-tool form, `none` leaving a dialog to its
> timeout). The root writes a todo list and delegates two coding agents; each child writes twice and the root then asks a
> question. **What it measured** (load average about 3 on four CPUs): the first child's write, shown and left, ended by
> timeout after 12,003 ms with REQ-TOOLS-052's reason, and `user_away` was written in the same millisecond; the second child's
> write, queued unshown behind it, ended 6 ms later with this directive's reason and was never shown (revision 2); both
> children's next writes were resolved `headless` and denied in 2 to 7 ms with the reason, no dialog shown, and no decision
> claimed that no approval UI exists (revision 1); the question tool's own approval, queued behind the first write before it
> expired, was not ended but shown 495 ms after the expiry and approved (revision 2's exemption); and the root's last todo
> call after the return was put to the user in a dialog again. Both mutations taken on `packages/agent-tools/src/gate.ts`
> turn the proof red: with the `onAway` registration removed, the queued write is shown; with the away arm of `broker`
> removed, a second `user_away` is written by a second timeout. **The readings above held**, and nothing in the text was
> found wrong. **Still not measured:** a real model meeting the reason. `live-run.mjs`'s new `away` scenario is that
> measurement (20 s timeout, every dialog left, the model's answer noted); it is the orchestrator's to run. The row is in
> [`../architecture/first-executions.md`](../architecture/first-executions.md).

---

<a id="pd-orch-004"></a>

### PD-ORCH-004 — a child cut off while making progress hands its work back to the parent

*Revision 5 (2026-10-06, [R-071](requests.md#r-071)) — **two rulings**: what the parent is told of a continuation (OQ-114)
and how long the landing at the limit may take (OQ-196), two paragraphs added after "How a later root learns of an offer";
`REQ-CONFIG-113` joins the Narrows list. Nothing is replaced. The owner took both recommendations.*

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

**What the parent is told of a continuation (revision 5).** The continuation offer, and `delegate`'s description of
`continuation_of`, SHALL tell the parent that a continuation starts with no memory of the child it continues — it is given
only the task the parent writes, since nothing of the continued child is injected into it — so the parent writes a
complete brief: what was asked, what the child did and found, and what remains.

**The landing at the limit is bounded (revision 5).** When a child's `runtime.child_timeout` expires, its turn stops
before its next model step (REQ-ORCH-088's graceful pause). What it has in flight then — a model step, or a tool call —
SHALL have at most 30 s from the expiry to end; at that bound the child's execution is aborted. Of a model step so
aborted, its streamed reasoning SHALL stay in the session's transcript, and nothing of it reaches the child's
conversation, its report or a continuation. The child then ends as REQ-ORCH-088 and this directive say, so the child's
wall clock is its `child_timeout` and at most 30 s more, never longer.

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

**Why revision 5, and what it costs.** The owner ruled two questions the live runs raised ([R-071](requests.md#r-071)).
The duress run of 2026-10-03 briefed both of its continuations as if they remembered ("You had already run everything …"),
and one rebuilt its brief from the product's own session store: 31 terminal calls and about 1.7M input tokens, roughly
18 % of the session (OQ-114). Telling the parent costs a few sentences in the offer and the tool's description; giving the
continuation its predecessor's record instead would have cost a payload change and its budget. The same runs had three
children reach the limit mid-step, and the 30 s backstop aborted each step after 87 to 115 s of generation; both cut-off
children of 2026-10-03 succeeded when continued (OQ-196). Keeping the bound keeps run times predictable at the price of
some repeated work, which the continuation offer already recovers; a longer landing would have made REQ-CONFIG-113's
ceiling soft. Neither changes code beyond the wording: the bound is the one the build already had (`CHILD_LANDING_GRACE`),
now written down.

**Why, and what it costs.** In run `2e21e324` two children were cut off at 1200 seconds after 110 and 113
tool calls. They were working, and the failure discarded what they knew about their own progress, leaving
the parent to rediscover it. The report now hands back what a continuation needs. What it costs: a longer
report for these children, and one more relationship in the child record. The limit itself is not raised,
so a child that genuinely loops is still stopped at the same point.

> **Narrows:** REQ-ORCH-088, REQ-CONFIG-113 (revision 5), REQ-TOOLS-152 (revision 2)

*Corrected 2026-10-13 under [OQ-237](../architecture/open-questions.md) (GV1, [R-072](requests.md#r-072)): REQ-TOOLS-152
moves from Extends to Narrows. It calls its field list "the whole of the `delegate` contract", and `continuation_of` joins
that list, a change to an exact enumeration and so a narrowing (acceptance finding F15), the verb `PD-TOOLS-006` took for
`write_scope`. R-058 recorded *Extends* because "the symbol artifact holds one narrowing directive per requirement", which no
longer holds. The two cases are disjoint: this directive's field names the child a continuation continues;
`PD-TOOLS-006`'s fields claim a write scope and resume a settled child. The disposition read until then, and no longer
governs:* "> **Extends:** REQ-TOOLS-152 (revision 2)"

*Raised by the owner, 2026-09-23; logged as [R-048](requests.md#r-048). Revision 2 logged as [R-058](requests.md#r-058), revision 3 as [R-059](requests.md#r-059), revision 4 as [R-064](requests.md#r-064), revision 5 as [R-071](requests.md#r-071).*

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
> in lower case, as the gate's own fallback dispatches `Write_File` to `write_file`. *(This reading was falsified by the
> duress live run at `a68f121` on 2026-10-07 and replaced by fin32: the code-intelligence EDIT tier's calls are
> file-writing calls too — see "The changed-paths reading falsified" below. Kept as written.)* Paths are collected across both
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
> (`the-duress-silent-child-check-flags-a-cut-off-child.md`, repaired 2026-09-29 under R-067 and now in `docs/defects/fixed/`:
> a cut-off child's `last_response` and `cut_off` are something to say; an error entry alone is not).
>
> **What was not measured.** An offer taken up by a later iteration's or a later run's root (revisions 3 and 4): this one
> was taken within its iteration by the agent that delegated `d`. The row is in
> [`../architecture/first-executions.md`](../architecture/first-executions.md).
>
> **Second live execution, 2026-10-01 — the duress scenario on merged `main` `71ad8e8`, under [R-066](requests.md#r-066):**
> pack `.live-run/runs/2026-10-01T03-15-27-194Z/` of the `accept` worktree, session `57095770`, the same endpoint and
> model. It met a real model with the clause the first live execution could not reach: a continuation that itself times
> out while making progress. `reconcile-docs` (`bg_71164543`) and `verify-result` (`bg_5d571a7a`) were cut off at
> 1,200 s while making progress, each report carrying the offer, and the orchestrator took both.
> `reconcile-docs-continue` (`continuation_of` `bg_71164543`) was cut off at 1,200 s too; its report carries the cut-off
> statement and the changed paths (`docs/overview.md`), and its `continuation_offer` is `null`: "a piece of work is
> continued once and never chained". `verify-result-continue` succeeded. Nothing in the text was wrong. **What was not measured,
> still:** an offer taken up by a later iteration's or a later run's root. The row is in
> [`../architecture/first-executions.md`](../architecture/first-executions.md)
> ([`fixed/no-live-run-has-executed-on-merged-main.md`](../defects/fixed/no-live-run-has-executed-on-merged-main.md)).


> **First execution of revision 5, 2026-10-06, ruled by [R-071](requests.md#r-071) and built on branch
> `fin20-continue-and-continuation`:** both paragraphs were built as written, and the text met the code in two places.
> **(1) The wording.** The offer (`cutOffReport`, `packages/engine/src/children/cut-off.ts`) gains one sentence after its
> `continuation_of` instruction — "The continuation starts with no memory of this child's work: it is given only the task
> you write, so write a complete brief — what was asked, what this child did and found, and what remains." — and
> `delegate`'s description one after its `continuation_of` sentence. An offer stored in a report before this keeps its
> words; a root told of it later reads the stored text. **(2) The landing.** The bound was the build's already
> (`CHILD_LANDING_GRACE`, the run's one 30 s allowance), and it bounds whatever the child has in flight, a tool call as
> well as a model step, since the backstop aborts the child's execution; the paragraph says so. No code changed for it:
> it is reported back into ADR-0012 and beside the constant, where its reason promised a report.
> **What was measured.** `cut-off.test.ts` and `agent-tools`' `delegation.test.ts`, one case each, red on the wording
> before; the landing's existing cases (`ladder.test.ts`'s REQ-ORCH-088 cases) unchanged and green. In the built app,
> `pnpm resilience-proof` (the ladder, the waits and the fallbacks) passed. **What was not measured.** No built-app or
> live run cut a child off at its limit: the duress live run's continuations are the evidence owed. The row is in
> [`../architecture/first-executions.md`](../architecture/first-executions.md).
>
> **First live execution of revision 5, 2026-10-06 (duress at `c2fdd6a` and `c2a9444`), recorded 2026-10-07 under
> [R-072](requests.md#r-072):** the evidence owed above. Packs `2026-10-06T16-02-48-699Z` and `2026-10-06T17-59-41-271Z` of
> the live worktree, the self-hosted reasoning model. **Five cut-offs**, every one while making progress: at `c2fdd6a` d
> (reconcile), e (decisions) and d2 (d's continuation); at `c2a9444` d (reconcile) and d-continuation. **The landing:** at
> +7.3, +0.39, +26.7, +1.44 and +7.23 s after the ceiling, none aborted (the autopsies' figures). **The reports:** every one
> carried the timeout error, the cut-off statement and its changed paths; the three that were not continuations carried the
> offer with revision 5's sentence ("The continuation starts with no memory of this child's work …"), and both continuations
> carried none, "continued once and never chained" (read again from the packs' `children` rows on 2026-10-07). **The
> continuations:** both briefs stood alone, as OQ-114 asks, and both were cut off on the reconcile item, whose time went
> largely to a terminal the child does not hold (L4/N3), the code-intelligence marker directory (L3/N6, OQ-215) and the empty
> file an undone create left (N2, repaired). Nothing in the text was wrong. The premise R-071 accepted, "the continuation
> offer already recovers", held for five of the eight continuations made since 2026-09-29; the three that failed all
> continued the reconcile item. Reaffirmed 2026-10-07 under R-072 (OQ-214): the limit and its default stand, with OQ-214's
> reopening condition. The row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).
>
> **Second live execution of revision 5, 2026-10-07 (duress at `a68f121`), recorded under [R-072](requests.md#r-072) with
> OQ-214's reopening:** pack `2026-10-07T07-09-30-708Z` of the live worktree, session `e6747bd0`, the self-hosted reasoning
> model. **Two cut-offs, both while making progress:** `wave3-verify-all` (tester, the verification) and its continuation
> `wave3b-finish-verification`, their last calls 1.5 s and 8.8 s before the ceiling. **The landing:** +4.25 s and +0.44 s
> after the ceiling, each running an edit, none aborted. **The reports:** both carried the timeout error ("Child timed out
> after 1200s") and the cut-off statement; the offer stood on wave3 alone, with revision 5's sentence, and the continuation
> carried none — continued once and never chained; wave3b's brief stood alone, as OQ-114 asks. One record was false: wave3b's
> changed paths read empty, "Its file-writing calls changed no workspace paths.", over 11 `ok` edits through the
> code-intelligence EDIT tier — D1's, repaired by fin32 and reported above ("The changed-paths reading falsified"), the
> reading kept beside its replacement there. **R-071's premise**, "the continuation offer already recovers", is kept as
> written beside its new count: it held for five of the nine continuations made since 2026-09-29; here the continuation was
> cut off on its own on-task item, and the coordinator recovered the work by reading `docs/verification.md` itself. Nothing in
> the text was wrong. Reaffirmed 2026-10-07 under R-072 (OQ-214 reopened): the limit and its default stand, the relief for a
> slow reasoning model being PD-CONFIG-003's Per-agent timeout, which the duress harness now sets to 45 minutes. The row is in
> [`../architecture/first-executions.md`](../architecture/first-executions.md).
>
> **The changed-paths reading falsified, 2026-10-07 (duress at `a68f121`, finding D1), and its replacement, built by
> fin32:** the first execution's open reading (4), "a path 'changed' when a `write_file`, `haet_edit` or `haet` call naming
> it returned `ok`", is kept above as written. Pack `2026-10-07T07-09-30-708Z` of the live worktree, session `e6747bd0`:
> `wave3b-finish-verification`, a tester continuing `wave3-verify-all`, made 11 single-file content replacements of
> `docs/verification.md` through the code-intelligence server that returned `ok` (tool calls #367 to #392), taking it from
> 387 lines (#334) to 469 (#393), and was cut off while making progress. Its report carried `changed_paths: []` and "Its
> file-writing calls changed no workspace paths.", which the parent read in #336's result; the pass's facts (request 275)
> read "Edited files: (none)" and the summary called the edits "attempted"; the artifact listed no edited files; and the
> coordinator spent rows 751 and 761 on the contradiction before reading the file itself. REQ-MCP-015's EDIT tier — seven
> tools, among them single-file and cross-file content replacement, carried by coding-agent, tester and refactorer —
> writes files, so its calls are this directive's "file-writing calls". **The replacement:** a call is file-writing when
> its tool is one of the three native file tools or a tool of the binding manifest's `edit` tier (one source, matched in
> lower case and under the `code_intelligence_` collision prefix); its path is read from its arguments as the manifest
> names them (`editArguments`, generated and checked against the server's own input schema); and it changed that path
> when it returned `ok`. One reading, `writtenPathsOf` (`packages/engine/src/children/report.ts`), now feeds the cut-off's
> changed paths, the report's `edited_files`, the facts the pass is told never to deny and the fallback's "Files
> touched". The terminal stays outside, as PD-TOOLS-006 states. **A literal reading taken, open for the owner
> ([OQ-245](../architecture/open-questions.md#oq-245), numbered by fin35):** a
> cross-file EDIT capability is listed by the one file or directory its arguments confine it to — a symbol rename lists
> the file declaring the symbol, not the files whose references it rewrote, and a replacement across the whole project
> (no path argument) lists none — because the arguments name no more and the result's text is the server's; a preview
> (`dry_run`) changes nothing and lists none. **What was measured:** `cut-off.test.ts`, `report.test.ts` and `config`'s
> `code-intelligence.test.ts`, red before the change; `pnpm code-intel-proof`'s eighth launch (`child-edit`), a delegated
> tester's single replacement through the built app, read from its stored report and its child-report artifact (red on a
> build of the unrepaired engine, the report's `edited_files` `[]`; green after, `["src/edit.ts"]`, in 64.9 s at a load of
> about 12 on four CPUs).
> **Not measured:** a live run since the repair. The note is
> [`fixed/a-child-that-edits-through-the-code-intelligence-edit-tools-is-reported-as-having-changed-nothing.md`](../defects/fixed/a-child-that-edits-through-the-code-intelligence-edit-tools-is-reported-as-having-changed-nothing.md);
> the row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).
>
> **The literal reading for cross-file EDIT calls falsified, 2026-10-13, and its replacement, built by fin35 (ruled as
> [OQ-245](../architecture/open-questions.md#oq-245) under [R-072](requests.md#r-072), XE1):** the reading taken above, "a
> cross-file EDIT capability is listed by the one file or directory its arguments confine it to", is kept as written. It is
> false against this directive's own words — the paths the calls "changed" — and against REQ-ORCH-109: a rename lists one
> file of the many it rewrites, a whole-project replacement none, a directory-scoped one the directory, so a child whose only
> writes are such calls is told to its parent as having "changed no workspace paths" and the pass's facts read "Edited files:
> (none)". The pinned runtime's results cannot fill it: a rename returns a count and no file, and a cross-file replacement
> names its files only when it succeeds, writing them one at a time, so a failure part-way leaves files written under an
> error result. **The replacement:** each EDIT capability's manifest entry carries a `scope` — `argument` for the five
> single-file tools and the safe delete (which refuses while references exist), `reach` for the rename (the project) and the
> cross-file replacement (its path, or the project) — checked by generation; the run host observes the files a `reach` call
> that is not a preview can reach, before and after it, whatever it returned, leaving out what another agent's native file
> writes touched meanwhile, and carries what changed on the call's result for the report alone (`observeReach`,
> `packages/agent-tools/src/tools/observe.ts`; the MCP executor in `apps/desktop/src/run-host/mcp.ts`); `writeReadingOf`
> (`packages/engine/src/children/report.ts`) lists it — an erred call observed to write included — for the changed paths,
> `edited_files`, the facts and the fallback; and where no observation was completed it lists the argument's file (a
> rename's declaring file, never a directory) and says "a <tool> call may have changed files the record cannot name", never
> "changed no workspace paths" — a walk the run host could not complete marks the result `unobserved`, so a call that erred
> unobserved is said too rather than read as refused (added by the fin35 review: the build first returned such a result
> unmarked, and an erred whole-project replacement on a tree past the walk's limit read "Edited files: (none)"). **The bound, stated:** a sibling's terminal write landing inside the window is listed under
> the observing child, since the terminal is outside every count (PD-TOOLS-006); REQ-ORCH-109 prefers overstating to
> concealing. The observation's cost is a walk of the reachable tree, twice per call. **What was measured:**
> `config`'s `code-intelligence.test.ts` (the scopes), `agent-tools`' `observe.test.ts` (a change, a creation, a removal, an
> unchanged size and modification time, the ignored directories, a partial failure, a sibling's write subtracted, an
> unobservable tree), `report.test.ts` and `cut-off.test.ts` (a rename across three files, a whole-project and a
> directory-scoped replacement, a partial failure, a preview, an unobserved call, an erred call carrying the `unobserved`
> mark, a refused one) and the run host's `mcp.test.ts` (a fake server whose replacement writes two files and then errs; one
> whose reach cannot be walked, marked `unobserved` though it erred), each red on the code before;
> `pnpm code-intel-proof`'s ninth launch (`child-across`) — see the row. **Not measured:** a rename through the built app,
> which needs the TypeScript language server provisioned (IC-7); a live run. The note is
> [`fixed/a-cross-file-code-intelligence-edit-is-reported-by-its-argument-path-alone.md`](../defects/fixed/a-cross-file-code-intelligence-edit-is-reported-by-its-argument-path-alone.md);
> the row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).
>
> **The rename through the built app, 2026-10-13 (fin42, the survey's N59):** the paragraph above's "Not measured: a rename
> through the built app, which needs the TypeScript language server provisioned (IC-7)" is kept as written; its reason did not
> hold. IC-7 was discharged on 2026-09-27 with only the pipeline evidence owed, and `pnpm code-intel-proof`'s fourth launch already
> had the runtime fetch and start the TypeScript server on first use: the rename had never been driven, not been blocked. Three
> launches were added, each a delegated child's scripted call against the real bundled runtime (scripted provider, free):
> **launch 10** (`child-rename`) — a refactorer searches for the references of `countItems`, declared in `src/rename-a.ts` and
> imported and called by `src/rename-b.ts`, then renames it with `rename_symbol`: the call `ok` ("2 changes applied"), both files
> renamed on disk, and exactly those two files in the child's stored report's `edited_files` and its child-report artifact's —
> OQ-245's reach observation through a language server, as the ruling wanted it (40.5 s, the server already provisioned, load
> about 4.4 to 6.5 on four CPUs beside the sibling plan); **launch 11** (`child-rename-cold`) — the same rename as the child's only
> call: the report and the artifact listed exactly the one file that changed, which is the observation working, and that one file
> was all the rename changed, while saying "Successfully renamed 'sumItems' to 'totalItems' (1 changes applied)" and leaving
> `src/cold-b.ts` importing a symbol that no longer exists. That is a defect of the tool the EDIT tier grants, not of this
> directive's reading: the pinned runtime waits for the language server's project loading before a references request and not
> before a rename, so a rename that is a server session's first cross-file request reaches the declaring file alone (measured
> also over the runtime's own stdio branch, a copy of the live run's `todo-app` fixture among four arrangements). Recorded as
> [`a-symbol-rename-that-is-the-servers-first-cross-file-request-renames-the-declaring-file-alone`](../defects/a-symbol-rename-that-is-the-servers-first-cross-file-request-renames-the-declaring-file-alone.md)
> and raised as [OQ-273](../architecture/open-questions.md#oq-273); launch 11 keeps the assertion and is red until it is repaired;
> **launch 12** (`child-renamed-tool`) — the global configuration's `tool_name_map` offers the cross-file replacement as
> `replace_across_project`, and a tester's call by that name lists both files it changed in its report and artifact, with the
> evidence's `renamed` map `{"replace_across_project":"replace_in_files"}` (41.5 s): fin38's repair of
> [`a-code-intelligence-edit-tool-renamed-by-tool-name-map-is-not-read-as-a-write`](../defects/fixed/a-code-intelligence-edit-tool-renamed-by-tool-name-map-is-not-read-as-a-write.md)
> in the built app, which only a doctored entry reaches, since the shipped entry renames nothing (no live run can). **Not
> measured:** a live run. The opt-in `rename` scenario (`live-run.mjs --only=rename`) is written and is the orchestrator's: a
> coding-agent renames the fixture's `remaining` to `countRemaining` with `rename_symbol`; it should show the rename row `ok`,
> none of `src/todos.js`, `src/App.jsx` and `src/todos.test.js` still calling or importing `remaining`, all three in the child's
> `edited_files` and its artifact's, and `node --test` green — or, where the model renamed with nothing before it, OQ-273's
> signature named as a NOTE beside a red files check; a run with no rename call is a NOTE, "not reached". `summary.md` has no
> edited-files section (REQ-SESSION-140), so whether it names the files is the model's prose and only noted. The row is in
> [`../architecture/first-executions.md`](../architecture/first-executions.md).
>
> **First built-app execution of revisions 3 and 4, 2026-10-13 (fin42, the survey's N50):** the first built-app run in which a
> later root took up an offer, which every execution above recorded as not measured ("No built-app run took up an offer").
> `pnpm continuation-proof`, scripted provider, the per-agent timeout at 3 s and every child scripted to complete a call and
> then hold past it. **(1) A later iteration's root** (`later-iteration`): the coordinator delegates `alpha` and is woken by
> its cut-off report without taking the offer; a prompt typed into the composer while the run is going is queued and runs as
> iteration 2, whose root's first recorded message carries the list ("Open continuation offers … - alpha (bg_…)") and which
> takes the offer up (`continuation_of` alpha's id, the continuation its own child, iteration 2); the delegating root's first
> message listed none. The continuation, cut off too, carries the statement and no offer — continued once, never chained.
> **(2) A later run's root** (`later-run`): the run that cut alpha off completes; a launch sets Settings › Runtime ›
> Per-agent timeout to 1 minute and saves; the relaunch opens the session from the Sessions browser, and the follow-up's root
> reads the offer in the continuation handoff ("This is a follow-up within an existing session. …", the list after
> `Progress:`), takes it up, and the continuation `succeeded` under the 60 s the run read. In both, no offer is left open.
> The scripted root takes an offer with a step of its own, `continue:<persona>:<name>` (`offeredTaskId`, the run's own
> `offersToldIn` reading, `apps/desktop/src/run-host/scripted-client.ts`), pinned by `scripted-client.test.ts`. Nothing in
> the text was wrong. **Not measured:** a live run in which a later root took an offer up — the live `cutoff` scenario
> (`--only=cutoff`) asks for it and is the orchestrator's to run; a model that declines the offer there is a NOTE. The row is
> in [`../architecture/first-executions.md`](../architecture/first-executions.md).

> **Reported back 2026-10-13 (fin41), from the live packs at `552d346` (default and duress) and `0bc3eee`**: **NOT REACHED** in any
> of the three. The changed-paths repair (finding D1) and the cross-file EDIT reading (XE1, OQ-245) met no
> code-intelligence EDIT-tier call:
> the duress tester held the tier and wrote through `write_file` and `haet_edit`, and every child's `edited_files` equals its
> successful `write_file` and `haet_edit` paths. Found nothing, because nothing met the case. Evidence:
> [`live-552d346-duress-autopsy.md`](../architecture/live-runs/live-552d346-duress-autopsy.md),
> [`live-552d346-default-autopsy.md`](../architecture/live-runs/live-552d346-default-autopsy.md),
> [`live-0bc3eee-default-autopsy.md`](../architecture/live-runs/live-0bc3eee-default-autopsy.md).
> The rows are in [`../architecture/first-executions.md`](../architecture/first-executions.md).

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
> [`an-orderly-quit-logs-the-run-host-gone-at-error.md`](../defects/fixed/an-orderly-quit-logs-the-run-host-gone-at-error.md)
> (live-run finding L13); the last-window close's 24 clean quits are not contradicted. Repaired the same day under
> [R-067](requests.md#r-067): main records the run host it ends itself (`ChildrenEndedByMain`, `main/exit.ts`), and
> Electron's `killed` report of that end is written at `info`, saying main ended it — so "a child process gone for any
> reason but `clean-exit`" above now reads "… but `clean-exit`, or `killed` by main's own end"; a child killed from
> outside, one that crashed and one main never ended stay `error`. `pnpm live-run --only=ask` then ended both of its
> launches through the immediate exit with that line at `info` and no `error` line of main's.* The review's run of the same close found the first version of the unanswered-`shutdown` line firing on
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
>
> **Driven in the built app, 2026-10-13 (fin42, whats-next N61).** Two hook-fault paths now run on the built app. A global hook
> that always fails is switched off by `notice-proof`'s section 1 (since 2026-09-18), and its launch output carries "switched off".
> `notice-proof`'s new section 1b gives the run an invalid entry (`timeout_seconds: 0`). That entry never reaches the account
> above: REQ-HOOKS-012 fails the **configuration** load first, so the run is refused with REQ-CONFIG-478's report, which names
> the file, the global scope and `hooks.entries.0.timeout_seconds`. No hook runs, and no "Could not resolve this run's hooks"
> line is written. So in the built app, an invalid entry does not lead to REQ-HOOKS-085's `info` line. The line needs a hook set
> that fails to assemble after the configuration has loaded, and no free seam produces that. Its run-host unit cases remain its
> evidence. Neither section reads the hook engine's own `log` sink lines (REQ-HOOKS-128) in the application log. *Added
> 2026-10-14 ([OQ-279](../architecture/open-questions.md#oq-279), ruled 2026-10-13 under [R-072](requests.md#r-072)):* the
> same fatal load is now raised as a persistent error notice when the workspace opens, before any prompt (section 1b reads
> it on screen, section 1c in the workspace scope), and cleared by a later clean load.

> **2026-09-28, under [R-062](requests.md#r-062):** the quit's race over each `shutdown` is unchanged, and main now also
> waits, bounded, for the run host's EXIT before it is gone (`endBeforeMain`, `main/exit.ts`; ADR-0014's "Main is gone
> only after the run host"). The race answered "the answer can be lost to the exit"; it did not make main leave before
> the exit, and a run host left behind kept every session it held refused to the next launch until its pid stopped
> answering ([note](../defects/fixed/a-session-lock-outlives-the-application-that-held-it-for-as-long-as-its-run-host-takes-to-exit.md)).
> The levels are this directive's: a run host ended at quit reports exit 0 and writes its `info` line; one still running
> past the bound after it was ended is a loss, written at `error`. A driven close at the default level wrote no
> `warning` or `error` line from the close onwards, and main was gone 103 ms after it.

> **2026-09-29, under [R-067](requests.md#r-067):** the log's one writer wrote through `console.log`, and a standard output
> whose reader had gone failed each write with EPIPE, reported as an `error` event nothing listened for — an uncaught
> exception the uncaught-exception handler logged to the same stream, without end, so the quit and REQ-MONITOR-131's
> backstop starved. The writer is now `standardStreamWriter` (`main/app-log.ts`): it listens for the stream's failure and
> writes nothing more after it, and standard error gets the same listener. Measured on the built app by closing the
> pipes of a running launch and sending SIGTERM: it exited in about 60 ms, where the writer put back to `console.log`
> spun at full CPU until SIGKILL. The note is moved to
> [`a-quit-with-its-standard-output-closed-loops-on-its-own-epipe.md`](../defects/fixed/a-quit-with-its-standard-output-closed-loops-on-its-own-epipe.md)
> and the row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).

---

<a id="pd-tools-006"></a>

### PD-TOOLS-006 — a delegated child may declare a write scope that its siblings may not write into

*Revision 11 (2026-10-15, [R-072](requests.md#r-072)) — **the message that resumes a wait names a reported child's item still
open**, a section added after revision 10's; the ruling of [OQ-333](../architecture/open-questions.md#oq-333) under the owner's
delegation, with `PD-TOOLS-008` revision 4. REQ-ORCH-063 joins the Narrows line. Nothing is replaced. The ruling named it revision
10; [OQ-334](../architecture/open-questions.md#oq-334)'s revision 10 landed on `main` first, so it takes the next, 11.*

*Revision 10 (2026-10-15, [R-072](requests.md#r-072)): the ruling of [OQ-334](../architecture/open-questions.md#oq-334), from
finding F10 of fin46's final acceptance (the default live run's `delegation` scenario at `3c03287`). A section added after revision
9's, "What a child is told of its report", each clause marked "— revision 10"; the dispositions stay as they were (REQ-TOOLS-152
and REQ-TOOLS-154 already stand on the Narrows line). Nothing is replaced. [OQ-331](../architecture/open-questions.md#oq-331), ruled
the same day, takes no revision.*

*Revision 9 (2026-10-13, [R-072](requests.md#r-072)): the rulings of [OQ-256](../architecture/open-questions.md#oq-256) (the
consortium's question V1) and [OQ-257](../architecture/open-questions.md#oq-257) (V2), from the duress live run at `552d346`. Two
sections added after revision 8's, "What an answer handed on carries" and "What `delegate` says of a write scope", each clause
marked "— revision 9" and naming the question it rules; REQ-TOOLS-152's `depends_on` clause is quoted below as no longer
governing, and REQ-ORCH-047 joins the Narrows line. Nothing else is replaced.*

*Revision 8 (2026-10-07, [R-072](requests.md#r-072)): the ruling of the OQ raised from live-run finding D3,
[OQ-250](../architecture/open-questions.md#oq-250). Nothing is replaced. A section added after revision 7's, "What the routing table says
of the work a route implies (revision 8)"; the dispositions stay as they were.*

*Revision 7 (2026-10-07, [R-072](requests.md#r-072)) — **an admitted delegation marks its PENDING item in progress**, a section
added after revision 6's; the ruling of [OQ-249](../architecture/open-questions.md#oq-249) under the owner's delegation, with
`PD-TOOLS-008` revision 2. Nothing is replaced, and the dispositions stay as they were.*

*Revision 6 (2026-10-07, [R-072](requests.md#r-072)) — **which todo item a delegation serves**, a section added after
revision 5's; the ruling of [OQ-220](../architecture/open-questions.md) under the owner's delegation. Nothing is replaced, and
the dispositions stay as they were. It lands here for the reason revisions 3 to 5 did: this directive holds REQ-TOOLS-152's
narrowing slot and REQ-ORCH-028's extending slot.*

*Revision 5 (2026-10-07, [R-072](requests.md#r-072)) — **the attached-artifact budget, and what the caller is told**, a section
added after revision 4's; the ruling of [OQ-221](../architecture/open-questions.md) under the owner's delegation. It replaces
REQ-TOOLS-152's dropping rule and REQ-LIBRARY-098's figure, both quoted below, and adds REQ-LIBRARY-098 to the Narrows line. It
lands here for the reason revision 3 states: this directive holds REQ-TOOLS-152's one narrowing slot, so a narrowing of
`delegate`'s fields lands here whatever it is about.*

*Revision 4 (2026-10-07, [R-072](requests.md#r-072)) — **what `delegate` tells its caller about each persona**, a section
added after revision 3's; the ruling of [OQ-216](../architecture/open-questions.md) under the owner's delegation. Nothing is
replaced. It lands here for the reason revision 3 did: this directive already extends REQ-ORCH-028 and narrows
REQ-TOOLS-152, and the symbol generator admits one directive per requirement for each relation.* *(No longer binding since 2026-10-13, [OQ-237](../architecture/open-questions.md): two directives may narrow, or extend, one requirement in disjoint cases, so a later narrowing need not land here when it is about something else; what landed here stays.)*

*Revision 3 (2026-09-29, [R-067](requests.md#r-067)) — **what else `delegate` refuses, and what `session_id` names**,
a section added after "The disclosure"; the owner's rulings on OQ-112 and on OQ-66's open part. Nothing is replaced. This
directive is the one that narrows REQ-TOOLS-152, and the symbol generator admits one narrowing directive per requirement,
so a narrowing of `delegate`'s fields lands here whatever it is about.* *(No longer binding since 2026-10-13, [OQ-237](../architecture/open-questions.md): two directives may narrow, or extend, one requirement in disjoint cases, so a later narrowing need not land here when it is about something else; what landed here stays.)*

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

**What `delegate` tells its caller about each persona (revision 4).** The description of `delegate`, as each agent holding
it is offered it, SHALL name every persona that agent can delegate to: the catalogue's known roles, and each alias whose
target exists, with that target. For each persona it SHALL state which of REQ-TOOLS-001's three facets (reads workspace
files, writes workspace files, runs commands) the native tools of a child of that agent would declare, after REQ-TOOLS-006's
controls, and SHALL say so where a persona declares none. It SHALL say that only the product's own tools are counted, and
that tool-server and plugin tools are not described. It SHALL tell the caller to ask a persona only for work its tools allow,
and to hand command output to a persona that runs no commands through `depends_on` or `inherited_context`. The description
states the grant that holds once execution is released; while a plan gate holds the run, REQ-ORCH-153's refusal stands.
Revision 3's write-scope refusal stays as it is.

**The attached-artifact budget, and what the caller is told (revision 5).** The attached-artifact section of a delegated
child's payload is its `PRIOR AGENT CONTEXT (FULL)` block (REQ-LIBRARY-098), budgeted at 100,000 characters. Attachments SHALL
be considered in the order the caller listed them, and each body is carried whole or not at all. An attachment whose whole body
would carry the section past the budget SHALL be left out, and every later attachment SHALL still be considered. The
observation's attachment warning (REQ-TOOLS-153) SHALL carry:
- how many attachments the child will be given;
- how many were left out for size, naming their ids and citing the budget;
- the references that could not be resolved;
- the ids whose document could not be read.

The warning is computed at acceptance by the same selection that assembles the block. For a child whose payload is assembled
later (held for a model slot, waiting on its dependencies, or resumed), it is a forecast, and REQ-LIBRARY-098's
context-selection diagnostic is the record. REQ-LIBRARY-098's heading, its in-block reports and its context-selection diagnostic
still govern. REQ-TOOLS-153 governs unchanged, since its "any attachment warning" defers the warning's content to REQ-TOOLS-152;
REQ-TOOLS-154's order is unchanged.

> REQ-TOOLS-152 said, and no longer governs: "the first whose full body would carry the section past the budget is dropped, and
> so is every attachment after it." REQ-LIBRARY-098 said, and no longer governs: "within a 48,000-character budget".

**Which todo item a delegation serves (revision 6).** `delegate` SHALL accept one further optional action field, `todo_item`:
the id of a task in the calling agent's own plan (the root's own todo list, or a child's own), which the delegation serves. The
id SHALL be stored with the child's record. A delegation is an **implementation delegation** as REQ-ORCH-028 defines it, its
target persona's grant, as revision 4's catalogue resolves it for the caller, holding a tool the registry declares as writing
workspace files. Each of these SHALL be refused with status `rejected`, before any record is created and with no task id, its
reason naming the item, the holder where there is one, and the way forward:
- for any delegation, a `todo_item` that names no task of the caller's own plan;
- for an implementation delegation, a `todo_item` whose task is COMPLETED or ABANDONED;
- for an implementation delegation, a `todo_item` that another non-terminal implementation child of the same plan holds
  (queued, waiting, running, summarising and paused children all hold; every root's children are one plan);
- for an implementation delegation from the coordinating entry role, no `todo_item` once that role has written its todo list
  for the task (OQ-213's `listWritten`).

A delegation that names no item serves no item and holds nothing. A continuation (`continuation_of`) that names none inherits
the item of the child it continues and meets only the held-item refusal. A `session_id` follow-up keeps its stored item, reads
no `todo_item` (OQ-131), and is refused only while another outstanding implementation child of the plan holds that item. Each
refusal is logged as a warning citing REQ-ORCH-028 or REQ-ORCH-029. `delegate`'s description SHALL say what `todo_item` names,
when it is required, and that the list is written in one step and the delegation made in the next.

**An admitted delegation marks its PENDING item in progress (revision 7).** An admitted delegation's item is the one it names in
`todo_item`, the one a continuation inherits through `continuation_of`, or the one a `session_id` follow-up keeps. When that item
is PENDING in the caller's own plan, the admission SHALL mark it IN_PROGRESS in that plan and persist the plan; the task is then
held (`PD-TOOLS-008` revision 2) and outside REQ-TOOLS-145's count while the child is non-terminal. A COMPLETED, ABANDONED or
IN_PROGRESS item is left as it is, and a rejected delegation marks nothing. The observation SHALL state `Todo item <name>
(<id>) is now IN_PROGRESS.` and append the Todo state REQ-TOOLS-147 renders. `delegate`'s description SHALL say that the call
marks the item it names.

**What the routing table says of the work a route implies (revision 8).** The built-in coordinating instructions' routing
table SHALL keep every route REQ-ORCH-028 states, and its two capability clauses for `codebase-analyst` and `librarian`, word for
word. The table SHALL close with one sentence, the same for every configuration, that names no persona's tools. The sentence says
that each route names the persona whose judgement the need calls for; that the work itself goes to a persona whose entry in
`delegate`'s list allows it — a file to write needs one that writes workspace files, and a test or other command to run needs one
that runs commands; and that where the route's persona lacks what the work needs, the caller asks it for its answer and hands that
answer, through `depends_on` or `inherited_context`, to a persona that has what the work needs. Revision 4's closing instruction in
`delegate`'s description SHALL also tell the caller never to write in a brief that a command or tool the persona's entry does not
show is available to it. A configured `system_prompt` (REQ-CONFIG-100) is unchanged: it replaces the routing table and its
sentence, and the catalogue still reaches that coordinator. Revision 3's refusal and revision 4's catalogue are unchanged.

**What an answer handed on carries (revision 9, [OQ-256](../architecture/open-questions.md#oq-256)).** The two hand-off blocks
of a delegated child's payload — the inherited-context block (REQ-TOOLS-154 item 5) and REQ-ORCH-047's prior-agent-context block —
SHALL carry each named task's answer as follows *(— revision 9, OQ-256)*:
1. Each block renders, in the caller's order, every named sibling's (inherited) or dependency's (prior-agent) result text — the
   final response, else the last response, else the key findings, else the summary — under a heading of its canonical name, role
   and status. The inherited block keeps its heading that the reports are context and not a dependency, and a cut-off child's
   additions (`PD-ORCH-004`) after the result text; the prior-agent block keeps its authoritative flag and REQ-ORCH-047's
   once-only injection.
2. Each block's result texts are budgeted at 100,000 characters, each block on its own. A text is carried whole while it fits;
   a text that does not fit is cut to the larger of the budget's remainder and 4,000 characters, so a block passes the budget by
   at most 4,000 characters for each cut text, and no child receives less of an answer than REQ-ORCH-060's report block gave it.
3. A cut text SHALL end in a marker naming the characters given and the characters omitted and citing the budget, saying that the
   rest is in neither the workspace nor the artifact store, and saying that the child's report must state which parts of the
   answer it did not receive.
4. The `delegate` observation (REQ-TOOLS-153) SHALL name each inherited answer the stored block cut and the characters omitted,
   beside revision 5's attachment warning; for a `depends_on` task already complete at the call it names the cut REQ-ORCH-047's
   block would make as the reports then stand — a forecast, the payload's marker being the record. Nothing is said when nothing
   is cut.
5. `delegate`'s description SHALL say that `depends_on` and `inherited_context` each carry the whole answer of every task they
   name up to 100,000 characters per field, that a longer answer is cut and both caller and child are told, and that
   `attach_artifacts` carries artifact bodies.

REQ-ORCH-060's 4,000-character cap is unchanged: it governs the report blocks of the resume message and the wait results, and no
hand-off block.

> REQ-TOOLS-152 says, and for `depends_on` no longer governs: "each upstream task's summary and key findings appear in the
> child's payload" — REQ-ORCH-047's block and clause 1 above state what a dependency's answer carries. Its "reports" for
> `inherited_context` is read as clause 1's result text under clause 2's budget.

**What `delegate` says of a write scope (revision 9, [OQ-257](../architecture/open-questions.md#oq-257)).** `delegate`'s
description SHALL tie work that writes files to a persona whose entry in its catalogue writes workspace files, SHALL tell the
caller to give that child `write_scope`, and SHALL say that a `write_scope` given to any other persona is refused and nothing is
started; the `write_scope` field's description in the offered schema SHALL say the same in one sentence. Both texts are fixed
and name no persona *(— revision 9, OQ-257)*. Revision 3's refusal, revision 4's catalogue, revision 8's routing sentence and
REQ-ORCH-028's routes are unchanged.

**What a child is told of its report (revision 10, [OQ-334](../architecture/open-questions.md#oq-334)).** REQ-LIBRARY-092 keeps
every ended child's report as an artifact of kind `child_report`, and the agents are now told so *(— revision 10, OQ-334)*:
- `delegate`'s description, where the caller's run holds an artifact store, SHALL carry one fixed sentence, after revision 9's
  hand-off sentence and naming no persona, saying that the run keeps an ended child's report as a `child_report` artifact, which
  `artifact_list` shows and `attach_artifacts` hands on, and that a caller asks a child for its findings in its report and asks it
  to publish an artifact only where its entry says it publishes artifacts;
- revision 4's catalogue SHALL state one further computed word, "publishes artifacts", on each entry whose child's resolved grant
  holds `artifact_write` (the persona's own `can_publish_artifacts` with the store, OQ-212), and on no other;
- every child's payload SHALL carry one fixed sentence immediately after REQ-TOOLS-154's workspace-root line, ahead of the write
  scopes, saying that the run keeps its report as an artifact that later agents can list and be handed, and that, where its task
  asks it to publish its findings and it holds no tool that publishes artifacts, its report meets that request.

A brief is neither refused nor rewritten, the routing table names no publisher, no persona's grant changes, and the playbook's
ARTIFACT text stays as built. Revision 3's refusals, revision 4's three facets, revision 8's routing sentence and revision 9's
sentences are unchanged.

**What the message that resumes a wait says of a reported child's item still open (revision 11, [OQ-333](../architecture/open-questions.md#oq-333)).**
Revision 7's mark leaves a delegated item IN_PROGRESS after its child ends, and `PD-TOOLS-008` revision 4 no longer counts it
against the caller's next mark, so nothing but this line tells the caller to close it. When the message that resumes a wait
(REQ-ORCH-063: a `wait_for_tasks` result, the wait of a `delegate` with `run_in_background: false`, and the orchestration pass's
resume of a parent whose children it waited for) reports a child whose `todo_item` is still IN_PROGRESS in the caller's own plan,
with no non-terminal child of the caller holding it, the message SHALL add, immediately after that child's result,
`Todo item <name> (<id>) is still IN_PROGRESS: close it with update once you accept this report.` *(— revision 11, OQ-333)*. An
item the caller has closed, one another running child holds, and a child that serves no item add nothing; an item two reported
children serve is named once, after the first of them. The run never closes the item, and REQ-ORCH-059's completion notification
is unchanged.

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
([`delegate-drops-session-id-and-suppress-auto-context.md`](../defects/fixed/delegate-drops-session-id-and-suppress-auto-context.md)),
so a caller that set it was told nothing and got a fresh child. What it costs:
- a parent can no longer give a read-only child a scope for coordination alone;
- a persona whose only writing tools are ones the claim does not fence — the code-intelligence server's editing tools,
  `terminal`, MCP or plugin tools — counts as holding no file-writing tool and is refused a scope, although it can write
  files; a scope could not have fenced those writes either ("The file tools only", above);
- a follow-up re-sends the child's whole conversation, where a fresh child sends only its payload.

**Why revision 4, and what it costs.** In both duress live runs of 2026-10-06 the orchestrator briefed `docs-writer`
children, which hold no `terminal`, to "Run `node --test` yourself in the terminal". At `c2a9444` (finding N3) the two failed
children, 2,443.5 s of the critical path, spent 22 of 57 and 23 of 35 rows reasoning about the missing shell, one wrote
`.tmp-run-tests.sh` as a workaround (N2), and the answer to the user said the continuation "ran the suite". At `c2fdd6a`
(finding L4) the brief appeared twice, a child called a `run_command` tool that does not exist, and the answer blamed the
timeouts on the missing shell. Each run also spent 34 to 37 s on two of revision 3's refusals. Nothing the coordinator read
stated a persona's tools: the description listed the built-in names, the same for every caller. A refusal cannot reach a
request to run a command, which sits in free text, and REQ-TOOLS-001 never infers a facet from prose; the system prompt
cannot carry it either, since a configured `system_prompt` replaces the built-in one (REQ-CONFIG-100) and it cannot apply
each caller's `tool_restrictions`. What it costs:
- the statement is advice and enforces nothing; whether the impossible briefs stop is measured at a duress live run;
- about 250 tokens join every delegating agent's tool listing;
- a persona whose only writer is an MCP tool reads as writing no files, the blind spot revision 3 accepts;
- a persona whose only writing tool is `git_commit` would read as writing files and still be refused a `write_scope`
  (revision 3: the file tools only);
- the coordinator may commission more children, a command runner beside a writer.

**Why revision 5, and what it costs.** Two requirements budgeted one block differently. REQ-TOOLS-152 set 100,000 characters
and dropped the first overflowing attachment with every one after it; REQ-LIBRARY-098 set 48,000. The build used 48,000 with a
skip-and-continue it took from neither, and its observation said "N artifacts were attached to its context", counting the
references that resolved before any budget applied, so a caller could be told of an artifact its child never received
([`the-attached-artifact-budget-is-48000-characters-where-req-tools-152-sets-100000-and-drops-every-later-one.md`](../defects/fixed/the-attached-artifact-budget-is-48000-characters-where-req-tools-152-sets-100000-and-drops-every-later-one.md)).
REQ-TOOLS-152 calls itself the whole `delegate` contract, REQ-ORCH-032 hands the oversized attachment to it, and domain 05's
resolution 26 and limits inventory carry 100,000; REQ-LIBRARY-098's restatement is the one the reconciliation missed.
Skip-and-continue keeps resolution 26's three reasons (deterministic, order-preserving, never partial) and never displaces an
earlier attachment, so the child always receives a superset of what the prefix rule gives. What it costs:
- up to about 25,000 tokens more on a child's first message, and on every later turn that carries it;
- a later attachment can arrive without an earlier one it builds on, where the prefix rule withheld both;
- for a child held before its payload is assembled, the observation is a forecast the store may outrun.

**Why revision 6, and what it costs.** REQ-ORCH-028 measures implementation ownership per todo item and REQ-ORCH-029 holds
the coordinator to no two implementation delegations for one item outstanding at once, checkable from the run's records. OQ-213
made the coordinator keep a list of its own; nothing in the build named which item a delegation served, so the per-item
constraint stood on instruction text and no record could check it
([`no-delegation-names-the-todo-item-it-serves-so-one-item-can-hold-two-implementation-delegations.md`](../defects/fixed/no-delegation-names-the-todo-item-it-serves-so-one-item-can-hold-two-implementation-delegations.md)).
Only the coordinator knows which item a delegation serves, so the call names it, where the run can still refuse before a child
is paid for. What it costs:
- a refusal that misfires costs the coordinator one model step (17.7 to 19.6 s measured), where a duplicate costs a whole
  child, up to 1,200 s;
- a model cannot name an id its own step creates, so a list and a delegation written in one step leave the delegation refused,
  once;
- a coordinator that works on one item at a time must split it (`todo add_task`) to run two writers in parallel;
- REQ-ORCH-030's per-item attempt count now has its key, and is still owed.

**Why revision 7, and what it costs.** REQ-TOOLS-147 makes the Agent plan the run's primary progress display, and REQ-ORCH-029
asks for a list the coordinator keeps current. With revision 6 the run knows which item each delegation serves, yet the item
stayed PENDING while its child ran unless the coordinator spent a step marking it, and REQ-TOOLS-145 refused that mark for a
second parallel child (`OQ-249`, the default live run's `#14` at `a68f121`). Marking at admission costs no model step. What it
costs: the run writes the agent's plan, so a model that also sends `update … IN_PROGRESS` meets REQ-TOOLS-147's no-op error,
one cheap refused row; and an item stays IN_PROGRESS after its child ends until the coordinator closes it.

**Why revision 8, and what it costs.** In the duress live run at `a68f121` (session `e6747bd0`, finding D3) revision 4's catalogue
reached all 35 coordinator requests, and the coordinator still gave the work a route implies to the route's persona: `#115` gave
`architect` `docs/decisions.md` with a `write_scope` (refused in 170 ms; a docs-writer re-briefed in 19.4 s), and `#114` offered
`node --test` to a docs-writer, which called a tool that does not exist (`#164`, refused at the gate in a 2.5 s step; issues 3 and 4);
16 of 117 docs-writer requests carried a missing-shell aside. The misroute moved with the subject: the same task went to
`codebase-analyst` at `c2fdd6a` (`#107`). OQ-216's target of zero was missed. What it costs:
- the sentence is still advice;
- about 80 tokens join every coordinating request;
- the coordinator may commission two children for one document (the route's persona for its answer, a writer for the file);
- the directive grows by one revision.

**Why revision 9, and what it costs.** In the duress live run at `552d346` (session `18a9d22d`) revision 8's hand-off ran twice
and lost most of what it handed on (finding V1): the inherited-context block reused REQ-ORCH-060's resume-message block, so the
architect's 28,330-character analysis reached the writer as 4,000 characters and a marker, and the verifier's 20,195-character
report as 4,000; the writer wrote 7 of the document's 8 file sections from its own reading, and the user's answer credited them to
the architect. REQ-ORCH-047's channel carried an answer unbounded, so two channels one sentence presents as equivalent delivered
14 % and 100 % of the same answer. The same run gave `architect` a `write_scope` with the routing sentence in every request
(finding V2, `#92`): the coordinator chose the scope by habit, and the text it followed was `delegate`'s own sentence, which made
the task the condition and never the persona. What it costs:
- a child's payload grows on every turn that carries it, up to about 300,000 characters of answers across three blocks in the
  worst case (two hand-off blocks and revision 5's attachments);
- a `depends_on` answer over 100,000 characters, unbounded until now, is cut;
- the write-scope sentence is still advice, about 40 more tokens on every delegating request, and a model that drops the scope
  but still briefs a non-writer to write is caught only by OQ-257's reopening condition;
- OQ-216's write-scope target of zero becomes a bound (at most one refusal a run, each re-routed by the next request) —
  *falsified 2026-10-15 and replaced by [OQ-331](../architecture/open-questions.md#oq-331)'s per-task bound, reported under
  revision 9's first execution below;*
- an implementation built from the specification alone caps the inherited block at 4,000 characters and words the sentence as
  before.

**Why revision 10, and what it costs.** In the default live run at `3c03287` (session `d0c3a7f0`, finding F10) the coordinator
briefed a codebase-analyst "Publish your findings as an artifact so later steps can attach it." (`#5`), because nothing it was
offered said that the run keeps every ended child's report as an artifact, and no catalogue entry could say who publishes. The
child, whose grant held no `artifact_write` under OQ-212, called it anyway (`#10`, refused at the gate as an unknown tool), and the
report the run kept as `art_C1ZUuJ3B` said "no artifact or file was created", tagged `errors`, and was attached whole to the next
child. The enforced bound held; the Library's record was false. What it costs:
- both sentences are advice, and the gate's unknown-tool refusal stays the enforced bound;
- about 45 more tokens on every delegating request and about 40 on every child's first request;
- a child told its report meets a publishing request may hold back from a separate deliverable artifact where a workspace grants
  one, which costs little, since the report holds the findings;
- an implementation built from the specification alone carries neither sentence nor the fourth word.

**Why revision 11, and what it costs.** Revision 7 marks a delegated item IN_PROGRESS and leaves the close to the caller, and
until `PD-TOOLS-008` revision 4 the next mark's refusal was what told it; the default live run at `3c03287` (delegation-swarm,
finding F9) paid four calls and about 7 s for it. With the refusal gone, a caller that never reads its plan again would leave the
item open, and the Agent plan strip would show it active after its work was done. The resume message is where the caller reads
the child's report, so the line goes there, beside the report it asks the caller to accept. What it costs:
- about 25 tokens per reported child whose item is still open;
- the line is advice: a caller may still leave the item open, which the live run's NOTE counts;
- one more narrowing, of REQ-ORCH-063's message, which now carries more than the reports;
- an implementation built from the specification alone resumes with the reports alone.

> **Narrows:** REQ-TOOLS-152, REQ-TOOLS-154, REQ-LIBRARY-098, REQ-ORCH-047, REQ-ORCH-063
> **Extends:** REQ-ORCH-028

*Raised by the owner, 2026-09-23; logged as [R-049](requests.md#r-049). Revision 2 logged as [R-059](requests.md#r-059),
revision 3 as [R-067](requests.md#r-067). Revision 4 ruled under the owner's delegation, [R-072](requests.md#r-072), from
the final live runs' findings L4 and N3. Revision 5 ruled under the same delegation from OQ-221 (the consortium's question AB1), revision 6 from OQ-220, revision 7
from OQ-249 (the consortium's question P3), revision 8 from OQ-250 (the consortium's question D3, the duress live run's finding D3),
revision 9 from OQ-256 and OQ-257 (the consortium's questions V1 and V2, the duress live run at `552d346`), revision 10 from
OQ-334 (finding F10 of fin46's final acceptance, the default live run at `3c03287`), revision 11 from
OQ-333 (finding F9 of fin46's final acceptance, the default live run at `3c03287`).*

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

> **Reported back 2026-10-13:** "No built-app run declared a scope" no longer holds. Since `d8ede92` (2026-09-25) the live
> run's `edit` scenario delegates two write-scoped children and checks that they were live together and told of each
> other's scopes; at `552d346` and `0bc3eee` it passed ("two children were delegated with a write scope each", "two scoped
> children were live at the same time"). This revision's own mechanism, a resumed child's re-claim, ran live in the
> `resume` scenario: at both heads its two children carried `children.write_scope` (`docs/notes-functions.md`,
> `docs/notes-tests.md`), were paused while running, resumed under their own task ids after the Continue, and each wrote
> its file inside its scope with no refusal. No sibling tried to write into a resumed child's scope, so the refusal the
> re-claim exists for has still been shown only by `children.test.ts`. The row is in
> [`../architecture/first-executions.md`](../architecture/first-executions.md).

> **First execution of revision 3's scope refusal, 2026-09-29, built under [R-067](requests.md#r-067):** the refusal
> was built as written ([OQ-112](../architecture/open-questions.md)). `IterationChildren.delegate` refuses a
> `write_scope` for a known persona that cannot write files, straight after the scope's own validation, with status
> `rejected`, no record and no task id. The reason names the catalogue's writers. The phrase "after REQ-TOOLS-006's
> controls" met one gap in the build. The per-persona `tool_restrictions` map, the fourth control, narrows no agent's
> grant today ([`a-personas-tool-restrictions-never-narrow-its-grant`](../defects/fixed/a-personas-tool-restrictions-never-narrow-its-grant.md)).
> The check therefore reads the two controls a child's grant does meet, `coordinator_only` and `read_only`. The
> clause's text is not wrong; the build lacks a control it names. *Closed 2026-09-29 under R-067 (acceptance finding
> A4):* the map now narrows the grant as [OQ-145](../architecture/open-questions.md) builds it — the entry the persona's
> own map and the delegating persona's map give its name — and the check reads the same lists. A persona the caller's
> map restricts to reading cannot take a scope, and the reason names only the writers the caller's map lets write
> (`children.test.ts`, "the parent agent's tool_restrictions bind the refusal"). The sentence above is kept as the reason
> the first build read two controls. Two existing scripted cases had scoped a read-only
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

> **First execution of revision 3's `session_id`, 2026-09-29, built under [R-067](requests.md#r-067) with `PD-ORCH-005`
> clause 22:** the refusal and what `session_id` names were built as written. `IterationChildren.followUp` refuses, with
> status `rejected`, no record touched and no task id:
> - an id that is no task id of the caller's own children;
> - a child that has not ended;
> - a child its `child_timeout` cut off, with a reason that names `continuation_of`.
>
> The text met the code in two places, and [OQ-131](../architecture/open-questions.md) records the reading built for
> each:
> - "names no settled child of the calling agent" is one reason for an unknown id and for another agent's child alike.
>   REQ-TOOLS-155's parent scoping reads another's child as none of the caller's, as `background_output` does.
> - "cut off" is read from the child's stored report: a `timeout` error, or `PD-ORCH-004`'s `cut_off` block.
>
> The follow-up re-claims the child's stored `write_scope` as revision 2 has a resumed child do.
>
> **What was measured.** Scripted end-to-end cases in `children.test.ts`, each red on the code before the repair, where
> the id was dropped and a fresh child spawned. **What was not measured.** No built-app or live run set `session_id`. The
> row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).
>
> **Reported back 2026-10-13 (fin42, item N57):** "No built-app … run set `session_id`" no longer holds for the built app.
> `pnpm delegation-proof`'s `follow-up` launch (scripted) delegates a `codebase-analyst`, waits for it to end, and calls
> `delegate` with `session_id` naming its task id: the observation read "Following up probe (codebase-analyst): it resumes from
> its record under its own task id", the session held one child row, the child's record held the follow-up's task once, a
> `child_resumed` entry said it was followed up from `succeeded`, and the child answered one more model call and ended
> `succeeded` again. Still not measured live: the default live run's `delegation` scenario asks for the follow-up, and is the
> orchestrator's to run. The row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).

> **First execution of revision 4, 2026-10-07, ruled under [R-072](requests.md#r-072) ([OQ-216](../architecture/open-questions.md)):**
> built as written, and the text met the code in three places.
>
> - **Where the facets are computed.** The engine and `agent-tools` do not import each other, so the run host builds the
>   catalogue (`delegateCatalogue`, `apps/desktop/src/run-host/tools.ts`) with the function an agent's own port now applies
>   to itself (`resolveAgentGrant`): the persona's tools, `coordinator_only`, `read_only`, the `tool_restrictions` lists of
>   the persona's own map and the caller's (OQ-145), and REQ-TOOLS-004's prerequisites as this run meets them. `agent-tools`
>   renders it from the registry's facets (`renderDelegateCatalogue`, `grantsOn`). The prerequisites are not REQ-TOOLS-006's
>   controls, but a tool they remove is not granted, so the description states the grant the child receives; a run with no
>   terminal backend tells the caller that no persona runs commands.
> - **`git_commit`.** The cost named above does not arise in this build: `git_commit` has no executor
>   (`TOOL_IMPLEMENTATIONS`, `packages/contracts/src/tools.ts`), so REQ-TOOLS-004 removes it and a persona declaring it is
>   not told it writes files on its account.
> - **The orchestrator.** The catalogue's known roles include `orchestrator`, which the ledger accepts as a child; a child
>   orchestrator is coordinator-only and is described as reading workspace files. The fixed list this replaced left it out.
>
> The routing table's two capability clauses, which the same ruling restores as covered work, landed beside it.
>
> **What was measured.** `packages/agent-tools/src/tools/delegation.test.ts` pins the built-in table's lines (docs-writer
> reads and writes; tester and the two implementers all three; verifier and ui-verifier read and run commands; the six
> research and decision roles read), the aliases, a persona declaring none, the closing instruction and the unchanged
> sentences, sixteen of them red on the fixed description. `apps/desktop/src/run-host/tools.test.ts` holds, for every known
> role, the facets the caller is told equal to the facets of the grant that role's child port receives: the built-in table,
> a configured `tools:` override, a caller's `tool_restrictions` entry (for that caller alone), a `read_only` persona and a
> persona the configuration adds. **What was not measured.** No live run has yet carried the description; the duress run
> after this lands counts briefs that ask a persona without a terminal to run commands (2 to 3 per run before; target 0),
> `write_scope` refusals (2 per run; target 0), child rows spent on a missing tool and stray workaround files. The row is
> in [`../architecture/first-executions.md`](../architecture/first-executions.md).
>
> **First live execution of revision 4, 2026-10-07 (the final default live run at `a68f121`, pack
> `2026-10-07T06-48-50-123Z`; a default pack, not the duress run the paragraph above names):** the description reached the
> model as built. All 71 coordinator requests carried the 2,342-character catalogue, each persona with its facets ("tester
> (reads workspace files, writes workspace files, runs commands)", "verifier (reads workspace files, runs commands)") and
> the rule to ask a persona only for work its tools allow; the 59 coordinating prompts carried both routing clauses, and
> the 12 direct-work prompts no routing table (`PD-ORCH-006`). The terminal coordinator chose by facet (its traffic #1: "I'll
> delegate to 'tester' (reads workspace, writes workspace, runs commands)"), and no brief asked a persona without a terminal
> to run anything: the 8 children were 5 coding-agent, 2 tester and 1 verifier. **Found:** the catalogue also offers
> `intent-classifier`, which the defaults call a persona outside the delegation vocabulary (the pack's finding P5; no
> coordinator delegated to it). **Still owed:** the duress counts named above (briefs, `write_scope` refusals, rows spent on a
> missing tool, stray files). The row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).
>
> **Reported back 2026-10-07, ruled under [R-072](requests.md#r-072) ([OQ-228](../architecture/open-questions.md#oq-228), the consortium's
> question P5):** the build read "every persona that agent can delegate to" as **every `personas:` key of the configuration**
> (`knownRoles()`, `Object.keys(cfg.personas)`), with `gatekeeper` among the research and decision roles; that reading stays
> here, and is replaced by the **delegation targets**: every persona of the configuration except the three REQ-MCP-014 and
> REQ-ORCH-126 reserve (`intent-classifier`, `project-initializer`, `gatekeeper`). The directive's text and dispositions are
> unchanged; this is covered work. Built 2026-10-13 by fin33 (`delegationTargetsFor`, `resolveDelegationTarget`,
> `packages/engine/src/children/personas.ts`): under the default configuration the catalogue names twelve personas and the two
> aliases, and a delegation to a reserved persona is refused before any other admission check, naming what the product runs it
> for. Found by building: the resolver path's unknown-persona message listed no aliases, which REQ-ORCH-034 requires; it now
> does. **What was not measured:** no live run yet; the next default run should show neither reserved name in any catalogue.
>
> **Reported back 2026-10-07, ruled under [R-072](requests.md#r-072) ([OQ-229](../architecture/open-questions.md#oq-229), the consortium's
> question DT1):** for a caller whose `delegates_to` names any persona, "every persona that agent can delegate to" means the
> delegation targets that list names (REQ-CONFIG-101); an empty list narrows nothing. Built 2026-10-13 by fin33
> (`Persona.delegatesTo`, `DelegateCatalogue.narrowedBy`); the evidence is scripted only, since no live run sets the key.
> *Reported back 2026-10-13 (fin42, item N57):* the built app now sets it. `pnpm delegation-proof`'s `delegates-to` launch
> gives the orchestrator `delegates_to: [codebase-analyst]` in the workspace's configuration: the `delegate` tool the model port
> was offered said "Your delegates_to (codebase-analyst) narrows this list: a delegation to any other persona is refused." and
> named no other persona, a delegation to `codebase-analyst` was admitted, and one to `docs-writer` was refused, "'docs-writer'
> is not a persona orchestrator may delegate to: its delegates_to lists codebase-analyst. Known personas: codebase-analyst.". The
> live run's `delegation` scenario sets the key (`codebase-analyst`, `docs-writer`); its run is the orchestrator's.
>
> **Measured 2026-10-07 (the duress live run at `a68f121`, pack `2026-10-07T07-09-30-708Z`, session `e6747bd0`; recorded
> 2026-10-13 under [OQ-250](../architecture/open-questions.md#oq-250)):** the "What was not measured" above, now measured. The catalogue
> was in 35 of 35 coordinator requests. Briefs asking a persona without a terminal to run commands: 1, against 2 to 3 per run
> before (`#114`, `node --test` offered to a docs-writer, then `run_command` refused at the gate, `#164`). `write_scope` refusals:
> 1, against 2 per run (`#115`, `architect` given `docs/decisions.md`, refused in 170 ms with the writers named, re-briefed in
> 19.4 s). Rows spent on a missing tool: 16 of 117 docs-writer requests carried a one-sentence aside, against 22 to 23 rows per
> failed child before. No stray workaround file, no impossible brief on a failed child's path, and the answer claimed no test run.
> The target of zero was missed for revision 4 alone; revision 8 is the next step, measured against the same target.

> **First execution of revision 8, 2026-10-13, ruled under [R-072](requests.md#r-072) ([OQ-250](../architecture/open-questions.md#oq-250)),
> built by fin33 (`fin33-delegation-targets-and-plan`):** built as written. The sentence is `ROUTING_WORK_SENTENCE`, appended to
> `ROUTING` after "final acceptance → verifier." (`packages/engine/src/children/personas.ts`), so `BUILT_IN_ORCHESTRATOR_PROMPT` stays
> a constant and `entryInstructionsFor` still swaps it whole on a direct-work grant; a configured `system_prompt` carries neither the
> routes nor the sentence. The brief clause opens the catalogue's closing instruction ("Ask a persona only for work its tools
> allow, and never write in a brief that a command or tool its entry does not show is available to it: …"). **What was measured.**
> `children/personas.test.ts` (the sentence verbatim after the last route, red before; no persona of the vocabulary named; the swap
> and a configured prompt) and `tools/delegation.test.ts` (the clause, red before); `lib/routing-misses.test.ts` pins the harness
> NOTE against the a68f121 duress shapes (`#115`, `#164`). **What was not measured.** No live run: the next duress run is the
> measure — 0 `write_scope` refusals for a non-writer and 0 briefs offering a command or tool the target lacks, a design or decision
> document going to a docs-writer directly or with `architect`'s answer handed on; the reopening condition is OQ-250's. The row is
> in [`../architecture/first-executions.md`](../architecture/first-executions.md).
>
> **Revision 8's first live execution, the duress run at `552d346` (session `18a9d22d`, 2026-10-13; findings V1, V2 and the D3
> verdict), reported in place:** the sentence in 41 of 41 coordinator requests and the brief clause in 41 of 41 `delegate`
> descriptions; 1 `write_scope` refusal for a non-writer (`#92`, req 59, row 168: `architect` given `docs/decisions.md`, refused
> in 5 ms before any record, re-routed by req 65's next `delegate` 30.0 s later as `architect` without a scope, `#111`, and a
> docs-writer with `inherited_context`, `#163`); 0 impossible briefs, 0 unknown-tool calls by a child, 0 stray files; missing-shell
> asides in 5 of 117 requests of the non-commanding personas, against 16 of 117 at `a68f121`. The sentence worked as recovery,
> not prevention, so OQ-250's reopening condition was met (first limb). **The target of zero, kept beside its replacement as
> falsified:** "0 `write_scope` refusals for a non-writer" — replaced by OQ-257's bound, at most one a run, each refused before any
> record and re-routed by the next request, which this run met. And the route the sentence prescribes lost what it handed on: the
> inherited block cut the architect's 28,330-character answer and the verifier's 20,195-character report to 4,000 characters each
> (V1). Both are revision 9's.

> **First execution of revision 5, 2026-10-07, ruled under [R-072](requests.md#r-072) ([OQ-221](../architecture/open-questions.md)),
> built by fin29:** built as written, and the text met the code in two places.
>
> - **The budget's measure.** The build measured the heading and each carried section, but joined the sections with one more
>   newline it did not count, so a block could pass its budget by one character per carried section after the first. The
>   separator is now counted, and a block that fits exactly is carried (`fullContextBlock`, `packages/engine/src/artifacts/context.ts`).
> - **The budget in the warning.** The engine owns the figure and `agent-tools` renders the warning, and neither imports the
>   other, so the outcome carries the budget beside the counts (`AttachmentOutcome.budget`) rather than a second copy of 100,000.
>
> The one selection is `selectAttachments` (`packages/engine/src/children/orchestration.ts`), read by the observation at
> acceptance and by the block at each assembly; the observation is `attachmentWarnings` (`packages/agent-tools/src/tools/delegation.ts`).
>
> **What was measured.** In `artifacts/artifacts.test.ts`: the constant is 100,000; [over, short] carries the short one;
> [short, over, short] carries both short ones in order; an exact fit is carried and one character more is left out; an
> unreadable document in the middle leaves the others. In `children/children.test.ts`, a child started at once: the observation's
> left-out ids and given count equal its `context_selection` entry's, and its first message carries exactly those sections. In
> `tools/delegation.test.ts`: the warning's four parts and the rendered observation. The ten new cases, and the existing block case whose budget wording changed, are red on the code before. In the
> built app, `pnpm artifacts-proof` launch 7 (`attached`): three artifacts of 55,000, 46,000 and 24 characters and a reference to
> nothing, attached in that order; the observation read "2 attached artifacts will be given to the child whole", named the
> 46,000-character artifact as left out for size with the 100,000-character budget and the reference as unresolved; the
> `context_selection` entry held `attached_included` 2 with the same id elided; the child's first message carried the
> 55,000-character body (left out under 48,000) and the short one after the elided one, a section of 56,099 characters; and
> `summary.md` read "Mostly-elided artifacts: 1". **What was not measured.** No live run attached artifacts; none of the four
> autopsied live runs did. The row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).
>
> **Reported back 2026-10-13 (fin42, item N57):** a live scenario now asks for an attachment. The default live run's
> `delegation` launch has the orchestrator find a child's report artifact with `artifact_list` and attach it to a second child
> through `attach_artifacts`; the scenario checks that the observation's count given whole agrees with the child's
> `context_selection` entry, and notes a run whose model attached nothing or named an unresolved id. Its run is the
> orchestrator's; no live run has attached an artifact yet.

> **First execution of revision 6, 2026-10-07, ruled under [R-072](requests.md#r-072) ([OQ-220](../architecture/open-questions.md)),
> built by fin29:** built as written, and the text met the code in four places.
>
> - **Which delegations are implementation delegations.** The engine holds no copy of the registry's declarations, so the run
>   host injects `implementationRole` (`apps/desktop/src/run-host/tools.ts`): revision 4's `resolveAgentGrant` on the
>   catalogue's terms, a granted tool declaring "writes workspace files". `run-host/tools.test.ts` holds it equal to the
>   catalogue's facet for every known role and two callers. Where no host injects it, the engine's `writesFiles` stands in.
> - **Inheritance meets only the held check.** A continuation's inherited item is checked by the held-item refusal alone; a
>   COMPLETED inherited item, or one the plan no longer holds, is not refused, since the continued child named it and the
>   continuation finishes that work.
> - **One step's list and delegation.** A `todo` write and an unnamed implementation delegation in one step leave the
>   delegation refused, with the ids the list now holds named in its reason, as the ruling foresaw.
> - **The scripted coordinator.** The proofs' scripted `plan` step writes one COMPLETED item, which no implementation
>   delegation may name; the dialect gains `plan:<n>` (n open items), names each delegation's item in turn from the `todo`
>   result as a model would, and `done` completes the list. Four proofs whose coordinator delegates implementation after its
>   list were moved to it; `mcp-proof`'s children are restricted to reading, so its `plan` stays.
>
> **What was measured.** `children/todo-item.test.ts` (six cases) and thirteen end-to-end cases in `children/children.test.ts`:
> before any list an unnamed delegation is admitted; after it an unnamed one is refused naming the open items and a named one
> admitted and stored; a read-only role delegates unnamed; one step's list and delegation; an unknown id refused for any role;
> a COMPLETED or ABANDONED item refused to implementation and admitted read-only; a held item refused naming its holder, two
> items in parallel, the item freed once its holder ended; a read-only child never holds; a child waiting on its dependencies
> holds; a follow-up never refused as unnamed; a follow-up refused while another implementation child holds its stored item
> and admitted once that child ended (added by the review, which found no case reaching `followUp`'s check); a child's own
> plan; a continuation inheriting. Each refusal is red with its check removed. In the built app, `pnpm mission-proof` item 1e: a two-item list, `alpha` named the first item, `beta` naming
> it while alpha ran was refused "held by alpha (coding-agent, task_id …, state running)", `gamma` naming none was refused with
> both items listed, `delta` named the second and ran; the children's records held `565a0565` and `a4257486`, the session
> completed, and both refusals were logged citing REQ-ORCH-028 and REQ-ORCH-029. **What was not measured.** No live run: the
> next default and duress runs should show every root implementation child after the first `todo` write naming an item
> (`coordinator-todo.mjs`'s `todoItemReading`), no two holders of one item at once, a continuation carrying its predecessor's
> item, and the refusals counted (target at most one per run, each followed by a named delegation). The row is in
> [`../architecture/first-executions.md`](../architecture/first-executions.md).

> **First execution of revision 7, 2026-10-13, ruled under [R-072](requests.md#r-072) ([OQ-249](../architecture/open-questions.md#oq-249)),
> built by fin33 (`fin33-delegation-targets-and-plan`):** built as written, and the text met the code in two places.
>
> - **The mark is the run host's, made before a foreground wait.** The engine hands the admitted item back on the accepted
>   `DelegateOutcome` (`todoItem`: named, inherited, or a follow-up's stored item); `delegateTool` takes a `markItem` that
>   `createToolPort` builds over the port's own `TodoList` (`apps/desktop/src/run-host/tools.ts`), and calls it once the call is
>   admitted and before a `run_in_background: false` wait, so the plan reads the item active while the child runs. The ruling's
>   "wrap the delegate executor" would have marked only after that wait.
> - **`replace` cannot complete an active item.** REQ-TOOLS-146 restores an IN_PROGRESS task over a `replace`, so an item the
>   run marked is closed with `update`. The scripted coordinator's `done` step (`apps/desktop/src/run-host/scripted-client.ts`)
>   wrote one `replace` with every item COMPLETED; it now sends one `update` per open item, as a model must.
>   *Falsified as a rule for a served-and-ended item, 2026-10-13, by [OQ-255](../architecture/open-questions.md#oq-255)'s ruling
>   (`PD-TOOLS-008` revision 3, under [R-072](requests.md#r-072)):* the reason held of the code as built, but no live model is
>   told it, and the restore it describes is the defect
>   [`a-todo-replace-cannot-close-a-delegated-item-and-hides-the-restore.md`](../defects/fixed/a-todo-replace-cannot-close-a-delegated-item-and-hides-the-restore.md).
>   Since revision 3 a `replace` closes an item whose child has ended; an item a running child holds, and the agent's own
>   active item, are still closed with `update`, and the `replace` that kept them says so.
>
> **What was measured.** `run-host/tools.test.ts` ("PD-TOOLS-006 revision 7", four of its five cases red on the code before):
> a named PENDING item marked, persisted and kept by a later `replace` in the turn; IN_PROGRESS, COMPLETED and ABANDONED items
> untouched with nothing written; a rejected delegation marking nothing; a continuation marking its inherited item; two
> parallel delegations held with the coordinator's own item marked beside them. `tools/delegation.test.ts` pins the
> observation, the mark before the wait and the description's sentence; `children/children.test.ts` the item handed back
> (named, follow-up) and the live held set (both red before). In the built app, `pnpm mission-proof` item 1e (2026-10-13, load
> 3.3 to 4.2 on 4 CPUs): alpha's and delta's observations read "Todo item Scripted item 1 (…) is now IN_PROGRESS." and
> "…Scripted item 2 (…)…", delta's Todo state shows both items active while alpha still ran, the coordinator's three `todo`
> calls (the plan and two updates) were all `ok`, and the stored plan ends COMPLETED. **What was not measured.** No live run:
> the next default run's edit session should show each `delegate` observation reading "Todo item … is now IN_PROGRESS" and the
> Agent plan strip drawing both rows active while both children run; the duress run, a parallel child's item active while it
> runs (`#305` not recurring). The row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).

> **First execution of revision 9, 2026-10-13, ruled under [R-072](requests.md#r-072) ([OQ-256](../architecture/open-questions.md#oq-256)
> and [OQ-257](../architecture/open-questions.md#oq-257)), built by fin38 (`fin38-edits-handoff-classifier`):** built as written, and
> the text met the code in three places.
>
> - **One figure, two packages.** The engine renders the blocks and `agent-tools` writes the description, and neither imports the
>   other; the outcome carries the budget for the warning as revision 5's does, but the description is written before any
>   delegation, so the figure is a `kernel` export (`HAND_OFF_BUDGET`, `packages/kernel/src/hand-off.ts`) both read.
> - **One rendering for the block and the warning.** `inheritedContext` and `priorAgentContextParts` (`packages/engine/src/children/notify.ts`)
>   return the block with the answers it cut, so `ChildLedger.spawn` stores the block and returns its cuts from one call
>   (`Spawned.inheritedCuts`), and `Orchestration.delegate`'s forecast for a completed dependency runs the prior-agent block's own
>   function over the rows as they stand; `DelegateOutcome.handOff` carries both to `handOffWarnings` (`agent-tools`).
> - **REQ-ORCH-047's fallback.** The prior-agent block fell back to the summary but never to the key findings, which clause 1 puts
>   before it; both blocks now read the same order. `reportBlock` and REQ-ORCH-060's cap still serve the resume message and the wait
>   results.
>
> The write-scope sentence is `WRITE_SCOPE_SENTENCE` and the field's description `WRITE_SCOPE_FIELD_SENTENCE` (`.describe()` on the
> zod field, which `z.toJSONSchema` carries into the offered schema); `HAND_OFF_SENTENCE` follows it. **What was measured.** In
> `children/notify.test.ts`: the budget is 100,000; a 28,330-character answer carried whole with no cut; 100,001 characters cut to
> 100,000 with the marker verbatim; two siblings across the budget, the second cut to the remainder, and the 4,000-character floor
> with a short third answer still whole; the fallback order; the prior-agent block under the same budget, floor and marker; the
> resume message still capped at 4,000. In `children/children.test.ts`, end to end: a 28,330-character architect answer reaches the
> writer whole through `inherited_context` with no warning; a 120,000-character one is cut, and the observation's cuts equal the
> stored block's; `depends_on` on a completed task forecasts the cut its prior-agent block then makes. In `tools/delegation.test.ts`:
> the write-scope sentence verbatim and the old one gone, the field's description in the offered schema, neither text naming a
> persona or alias of the vocabulary, the hand-off sentence after it, and the warning's two forms in the observation. In
> `scripts/lib/routing-misses.test.ts` the `552d346` shape (`#92` re-routed 30.0 s later, inside the bound) and the flags (not
> re-routed, no later delegate, a second refusal), and `scripts/lib/hand-off-cuts.test.ts` the marker count. Fourteen cases, each
> red on the code before. In the built app `pnpm mission-proof` passed (exit 0, load 0.7 to 1.5 on 4 CPUs): its scripted coordinator
> delegates with a `depends_on` chain and short answers, so it shows nothing regressed; it drives no answer over the budget and no
> write scope, so it does not discriminate. **What was not measured.** No live run: the next duress pack is the measure — 0
> hand-off markers for answers under 100,000 characters, no hunting calls for a missing answer, at most one write-scope refusal for
> a non-writer, re-routed by the next request. Repairs
> [`an-answer-handed-on-through-inherited-context-reaches-the-writer-cut-to-4000-characters`](../defects/fixed/an-answer-handed-on-through-inherited-context-reaches-the-writer-cut-to-4000-characters.md)
> and [`the-routing-sentence-did-not-stop-a-write-scope-for-architect`](../defects/fixed/the-routing-sentence-did-not-stop-a-write-scope-for-architect.md).
> The row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).

> **Reported back 2026-10-13 (fin41), from the live packs at `552d346` (default and duress) and `0bc3eee`** — revisions 5, 6, 7 and 9, whose
> blocks above say "No live run" and keep their words. Evidence:
> [`live-552d346-default-autopsy.md`](../architecture/live-runs/live-552d346-default-autopsy.md),
> [`live-552d346-duress-autopsy.md`](../architecture/live-runs/live-552d346-duress-autopsy.md),
> [`live-0bc3eee-default-autopsy.md`](../architecture/live-runs/live-0bc3eee-default-autopsy.md).
>
> - **Revision 5 (attached artifacts): reached once, below the budget.** No default delegation attached an artifact (0 of 11
>   at `552d346`, 0 of 9 at `0bc3eee`). The duress coordinator attached one (`#247`, the verifier's report artifact
>   `art_t5eFGWLq`, to f2): the observation read "1 attached artifact will be given to the child whole" and the
>   `context_selection` entry `attached_included: 1` with nothing elided. Nothing came near the 100,000-character budget, so the
>   skip-and-continue path is still shown by `artifacts-proof` launch 7 alone.
> - **Revision 6 (a delegation names its item): PASS.** At `552d346` 9 children named their item and 1 delegation was refused
>   (requirements `#39`, a docs-writer naming none), re-routed by `add_task` (`#40`) and a named delegation (`#41`) about 11.9 s
>   later. In the duress pack the 6 implementation delegations after the list all named an item and none was refused for it;
>   at `0bc3eee` 8 of 8, none refused. That is within the target of at most one refusal a run, each followed by a named
>   delegation, and the harness found no two holders of one item at once in any pack.
> - **Revision 7 (admission marks the item IN_PROGRESS): PASS.** Every admission naming a PENDING item answered "Todo item … is
>   now IN_PROGRESS": 9 of 9 at `552d346`'s default pack (its autopsy wrote "10 of 10" over a list of nine), 6 of 6 in the
>   duress pack, 7 of 7 at `0bc3eee`. A delegation naming an item already IN_PROGRESS wrote no line, as built (duress `#247`,
>   `0bc3eee` requirements `#64`). Parallel delegations left two items (default) and three (duress, after `#17`) active at once
>   with no refusal, so `a68f121`'s `#305` did not recur. The Agent plan strip was not read.
> - **Revision 9: the sentences HELD at `0bc3eee`; the hand-off was NOT REACHED.** The write-scope sentence, the field's
>   description and the hand-off sentence were in 94 of 94 `delegate` offers; 8 write scopes went to writers only (7
>   coding-agent, 1 docs-writer); 0 write-scope refusals; 0 unknown-tool calls. No delegation used `depends_on` or
>   `inherited_context`, so the harness's "0 cut answers" does not discriminate. The duress pack named above as the measure is
>   still owed: no duress run has been made since `552d346`.
>
> The rows are in [`../architecture/first-executions.md`](../architecture/first-executions.md).

> **Revision 9's duress execution, reported back 2026-10-15 (fin47, `fin47-delegation-routing`), ruled under
> [R-072](requests.md#r-072) as [OQ-331](../architecture/open-questions.md#oq-331):** the duress run at `3c03287` (fin46's final
> acceptance, pack `2026-10-15T04-01-06-491Z`, session `2fe0a837`, finding F6) carried the write-scope sentence and the field's
> description in every delegating request and refused two write scopes for a non-writer: `#105` (`architect`, `docs/decisions.md`,
> refused in 7 ms before any record, re-routed 26.9 s later by `#126`, the architect without a scope, whose answer a docs-writer
> wrote at `#204`) and `#231` (`verifier`, `docs/verification.md`, refused in 17 ms, re-routed 15.9 s later to a `tester`, `#232`). No
> non-writer was briefed to write. The cost bullet's bound — *"at most one refusal a run, each re-routed by the next request"* — is
> falsified there and kept beside its replacement: **at most one refusal for each task of the run's request that routes to a persona
> writing no files (two in duress, zero elsewhere), each refused before any record and re-routed by the same agent's next `delegate`
> within 60 s, and no task refused twice.** The directive's case and behaviour are unchanged, so no revision is written; REQ-TOOLS-152
> and REQ-ORCH-028 keep their back-pointers as they stand. The live run's harness reads the new bound (`routingMissReading`'s
> `nonWriterFileTasks`, `apps/desktop/scripts/lib/routing-misses.mjs`; its NOTE "write-scope refusals over OQ-331's bound (reopens
> OQ-331)"), pinned by `lib/routing-misses.test.ts`, red on the code before. The row is in
> [`../architecture/first-executions.md`](../architecture/first-executions.md).

> **First execution of revision 10, 2026-10-15, ruled under [R-072](requests.md#r-072) ([OQ-334](../architecture/open-questions.md#oq-334)),
> built by fin47 (`fin47-delegation-routing`):** built as written, and the text met the code in two places.
>
> - **Where the store's presence reaches the description.** `delegate`'s description is written in `agent-tools`, which knows no
>   run; the run host already resolves the catalogue under the run's prerequisites, so `createToolPort` hands `delegateTool` the same
>   `artifactStore` (`DelegateToolOptions.artifactStore`), and the sentence and the word never disagree about the store.
> - **The fourth word sits beside the facets, not among them.** "Publishes artifacts" is no REQ-TOOLS-001 facet, so `grantFacets`
>   is unchanged and `catalogueWords` appends it; an entry whose grant only publishes reads "publishes artifacts" alone rather than
>   "none of these".
>
> The payload sentence is fixed and carries its own condition ("and you hold no tool that publishes artifacts"), so it is true under
> every grant and is rendered in every payload, the run's store being one the product always opens for a running session.
> **What was measured.** In `tools/delegation.test.ts`: `REPORT_ARTIFACT_SENTENCE` verbatim directly after `HAND_OFF_SENTENCE`, absent
> where no store is, naming no persona; the word on an entry holding `artifact_write`, not on the same entry without it. In
> `run-host/tools.test.ts`: a persona configured with `artifact_write` and `can_publish_artifacts: true` reads "publishes artifacts"
> under a store; without the flag, or without a store, it does not; no built-in entry does under the defaults. In
> `children/notify.test.ts` and `children/children.test.ts`: the payload sentence after the root line, ahead of the write scopes,
> attachments and task, in every payload. In `scripts/lib/routing-misses.test.ts`: the live run's two counts, both 1 over the
> `d0c3a7f0` shape. Each red on the code before, except the built-in guard, which the old code met trivially. **What was not
> measured.** No live run: the next default pack is the measure — the sentence in every delegating request, every child's first
> request carrying the payload sentence, 0 `artifact_write` calls by a child that does not hold it, 0 briefs asking a non-publisher
> to publish, and no `child_report` artifact claiming publishing failed. Repairs
> [`a-coordinator-briefs-a-codebase-analyst-to-publish-an-artifact-it-holds-no-tool-for`](../defects/fixed/a-coordinator-briefs-a-codebase-analyst-to-publish-an-artifact-it-holds-no-tool-for.md).
> The row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).

> **First execution of revision 11 (the resume line, [OQ-333](../architecture/open-questions.md#oq-333)), 2026-10-15, ruled under
> [R-072](requests.md#r-072), built by fin47 (`fin47-classifier-and-todo`):** built as written, and the text met the code in three
> places.
>
> - **Three messages resume a wait, not one.** The ruling named `resumeMessage`; a `wait_for_tasks` result and a foreground
>   `delegate`'s wait are `IterationChildren.waitForTasks`'s own text (both branches: "already complete" and "completed"), which
>   the live session that raised the question met (delegation-swarm `#14`). All three render their reports through
>   `reportBlockWithItem` (`packages/engine/src/children/notify.ts`), so they cannot disagree.
> - **The plan is read where admission reads it.** `openServedItemsOf` reads `todoPlanFor` — the root's coordinator plan or a
>   child's stored todo — beside REQ-ORCH-059's `openTodoFor`, and the ledger's held set; `openServedItems`
>   (`packages/engine/src/children/todo-item.ts`) picks the items. No port is added.
> - **An item two reported children serve.** The text names each such item once; it is named after the first reporting child
>   that serves it.
>
> **What was measured.** `children/children.test.ts` ("revision 11", three cases, each red on the code before): a
> `wait_for_tasks` result carrying the line after the report whose item is open and not after the one the coordinator closed; a
> foreground `delegate` result carrying it, and none while another running child holds the item; the orchestration pass's resume
> carrying it after the report, with the completion notification free of it and no later message naming the closed item.
> `notify.test.ts` and `todo-item.test.ts` pin the line's words, the empty case and the selection. **What was not measured.** No
> live run: the next default run's coordinating sessions should show each wait result that reports a child whose item is open
> carrying the line, and the coordinator closing those items. The harness counts the lines (`resumeLines`), the items still open
> at the answer (`openAtAnswer`) and the seconds to each close (`closeLatencies`), NOTEs in `lib/coordinator-todo.mjs`.
> The row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).

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

*Revision 7 (2026-10-06, [R-071](requests.md#r-071)) — **two rulings on what the build left open**: clause 14 is replaced
(the fingerprint is of the persona's own definition, and a change is stated once, OQ-105) and clause 40 is added (a continue
resumes the paused iteration with the intent and tools it started with, OQ-162); `REQ-ORCH-005` and `REQ-ORCH-013` join the
Narrows list. The owner took both recommendations. Built as revision 6, with clause 23, on its branch,
and renumbered before landing, when the ratification of the readings OQ-100 to OQ-149 recorded took revision 6 and
clauses 23 to 39 on `main` first.*

*Revision 6 (2026-10-06, [R-071](requests.md#r-071)) — **the readings the build proceeds under, ratified**: the owner
confirmed as built every reading OQ-100 to OQ-104, OQ-106 to OQ-108, OQ-117, OQ-118, OQ-124, OQ-128 to OQ-132, OQ-148 and
OQ-149 record. Clauses 23 to 39 are added, and the Narrows list names the requirements those readings depart from. No
earlier text is replaced, but two earlier clauses are qualified, and each carries a note saying so: clause 13's last
sentence ("settled as before") no longer holds for the agents a crash left, which clause 23 presents `paused` before the
crash is recorded; and clause 15's "whichever surface asks it" no longer holds on one surface, a persona window on the
run's own instance while the session rests, where clause 24 refuses the run's cancel.*

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

> *Qualified by clause 23 (revision 6): the agents a crash left present `paused`, by `crash`, before the crash is recorded,
> and are not "settled as before".*

**(14) What the record keeps beside the conversation — revision 7.** Each agent's record SHALL also keep a fingerprint
of its persona's own definition: the persona's instructions, before anything the run adds to them (a playbook, the
session's context units, the MCP section), and the persona's tool declaration, not the listing a request offers. A
resumed agent runs with its persona's current instructions and tools; when its persona's definition differs from the
fingerprint, the run SHALL state, as a warning, which agent resumed under changed instructions, and the fingerprint then
becomes the definition it resumed under, so that each change is stated once.

> Revisions 4 to 6 said, and no longer govern, clause (14): "**(14) What the record keeps beside the conversation (revision
> 4).** Each agent's record SHALL also keep a fingerprint of the system instructions and the tool definitions the agent
> started with. A resumed agent runs with its persona's current instructions and tools; when they differ from the
> fingerprint, the run SHALL state, as a warning, which agent resumed under changed instructions." The build took "the
> system instructions" to be the whole system prompt a request carried and kept the first fingerprint for every
> comparison (OQ-105), so a playbook a new classification chose, a skill, the MCP section or a workspace instruction file
> warned for agents whose persona no one had edited, at every resume while it differed.

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

> *Qualified by clause 24 (revision 6): on a persona window on the run's own instance, a "Cancel the run?" confirmed while
> the session rests is refused, "The run is no longer cancellable.", so "whichever surface asks it" does not hold there.*

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

**(23) The counters, the run-level agent and what a crash left (revision 6, OQ-100).** REQ-MONITOR-169's detail line SHALL
name the paused count between waiting and done — `running 1 · waiting 0 · paused 2 · done 1 · failed 0` — only while an
agent is paused, and read as REQ-MONITOR-169 words it otherwise. The run-level agent SHALL present `paused`, its activity
the run's summary and no interruption, while its session rests with an iteration open — `paused`, `interrupted`, or in
REQ-CHAT-008's recovery state — and as before otherwise. The agents a crash left SHALL present as the crash record will
leave them — `paused`, by `crash`, their activity kept — before the crash is recorded, in place of clause 13's "settled as
before" and REQ-MONITOR-211/213's settling; a session a store failure left busy (OQ-42) is not one a crash left, and
presents as before. A `paused` agent's state is shown in the transcript's "This task" without an elapsed time
(REQ-CHAT-069). A live agent's cancel confirmation and cascade note SHALL name every descendant the cancel ends, live and
paused, in words that say which ("Its live and paused descendants …", "Cancelling cascades to 2 live and paused
descendants."), where REQ-MONITOR-064 and REQ-MONITOR-128 count and list live descendants only.

**(24) Cancelling one paused child at rest (revision 6, OQ-101).** Clause 16's Cancel SHALL be offered for a `paused` child
only while its session rests with an iteration open, and never for the resting run-level agent, whose equivalent is clause
6's "continue without them". A persona window on the run's own instance keeps the Cancel REQ-SHELL-075(g) gives it; a
"Cancel the run?" it confirms while the session rests is refused, "The run is no longer cancellable.", which is the one
surface on which clause 15's "whichever surface asks it" does not hold. The cancel is written under the session's lock. A
child a crash left, the crash not yet recorded, is cancelled from the state it is stored in, and nothing of the crash is
recorded but the answers to its own calls the crash cut off; the next repair or continue records the rest. A cancelled
agent's background terminal sessions are left for the next stop, quit or crash, and an agent whose `depends_on` names it
stays counted and is blocked by the resumed run's first pass (REQ-ORCH-048). A refusal by the store, or by another live
process's lock, states the engine's words in place of REQ-MONITOR-128's "no longer cancellable", and a store error while
the lock is taken reads as the store's failure.

**(25) A continue's message (revision 6, OQ-102).** The task clause 17 appends SHALL be held `in_progress` by the resumed
iteration and close done only when that iteration ends `succeeded`; every other close leaves it pending, marked so that the
next iteration takes it up before any other pending task, and counting toward no retry limit (REQ-ORCH-077). Several
messages one iteration holds close together, in the order they were appended. The iteration that takes one up is sent its
text after the launch content; its images are not sent. A continue that states no new request — the Continue action,
"continue without them", and the message-limit resolution's 'continue' and 'double' — SHALL append no task while the todo
holds a task of its last request's text pending or held by the open iteration, and SHALL append the request again when
that task is complete or abandoned, or in progress with nothing holding it, so a finished request is re-run as a new task
(REQ-ORCH-004). A continue by message always appends its task.

**(26) Which sessions a crash left (revision 6, OQ-103).** A session is one a crash left when it is `interrupted`, or busy
while the one liveness predicate (REQ-SESSION-171) finds no process behind it. A busy session that is live, or whose
liveness is unknown, is refused a continue. A session a store failure left busy is not one a crash left: every continue,
and a paused child's Cancel, on a session whose store has failed is refused `store-failed` until the store is restored
and the session reopened, and the composer still draws them. A crash-left session SHALL draw the paused continues as
`PD-CHAT-001` revision 4 draws them on a `paused` session — the Continue action and the continue by message in the send
pill's place, the count and "continue without them" in the notices row, or the two continues and no count when nothing is
open — and no pause statement. A crash that left a durable hold offers that hold's own continues and nothing more. The
decline's words name the agents as the crash record will leave them.

**(27) The plan gate after a resumed iteration (revision 6, OQ-104).** `PD-ORCH-003` revision 3 states where the gate holds
a run that resumed an iteration, including one a crash left open, and what that plan cycle is told.

**(28) The handoff's artifact (revision 6, OQ-106).** Clause 20's "the iteration's root" SHALL be the root of the most
recent recorded iteration, open or closed — the one the new work follows — known by its task id. Where the latest plan
cycle opened its gate after that iteration opened, the new work follows the plan cycle, no root is preferred, and the
handoff carries the latest artifact of any kind that nothing supersedes; a plan cycle that ended before its gate leaves no
mark and changes nothing. A root with no recorded iteration or no tool port, and one whose every publish is superseded,
published none. A cancelled child's stub report counts as an artifact of any kind. The handoff is read once, at the
continue: a later iteration of the same run is re-sent it as it was built, its artifact line not read again.

**(29) Open offers (revision 6, OQ-107).** `PD-ORCH-004` revision 4's "once" SHALL mean once per root. The first message of
every execution iteration's root carries, in a text part of its own after the launch content, the open offers the launch
content does not already hold, newest ten with the elision line; an offer a list left out is held by that list. A root a
continue resumes is not told again what its record holds. A plan cycle's root is told none. A re-sent handoff's lines are
left as they are, and an offer taken up since is refused at admission.

**(30) A stop during a plan cycle, the board's quit, and the dock (revision 6, OQ-108).** An approval or a question pending in
a plan cycle when a stop lands SHALL be withdrawn by `stop`, as one pending when a quit lands is withdrawn by `quit`; the
cycle's agents end `cancelled`, nothing records an interruption, and the session persists `paused` with clause 32's
summary. A board run caught by the application's quit SHALL come to rest by `quit`, as every quit leaves a run, and a
later continue resumes it — in place of REQ-TRACE-464's "cancel the run"; it is ended, never orphaned. "No other control
stands outside the dock" governs the run-state notices and the strip's input controls: REQ-CHAT-021's "Command not run"
notice, the refusal line with "Open project setup" and REQ-CHAT-169's attachment list keep their places. `/stop` still
sends REQ-MONITOR-004's `cancel` op, read through clause 15.

**(31) What an iteration is told of its task (revision 6, OQ-117).** An execution iteration whose selected task is not the
run's own, and whose text is not the launch content's request, SHALL be sent after the launch content a text part naming
it the task to work on — "The task for this iteration is the task below, from the session's todo. …" — followed by the
task's content, not its name. A task whose text is the launch content's request, and the run's own task even when the user
renamed it, are told nothing more. Only the task's text is sent, never the images its prompt carried.

**(32) The end-of-run summary (revision 6, OQ-118).** REQ-ORCH-082's rule 1 SHALL read "The run came to rest at the user's
request." for every rest a person asked for — a pause, a stop, the explicit cancel — and say which it was nowhere in the
summary. The transcript's system row and the timeline say which rest it was, and the Continue action's count says what a
continue resumes.

**(33) Elapsed clocks (revision 6, OQ-124).** The elapsed figure of an agent not ended whose presentation state is running,
waiting or queued SHALL be shown and advance on the surface's tick, on every surface with a slot for it; an ended agent's is
fixed at completion. A `paused` agent SHALL show no figure — the tree its state, the inspector and the persona window's
context card their fallback — in place of REQ-MONITOR-107's and REQ-MONITOR-111's rule for an agent with a spawn
timestamp, since nothing runs for it.

**(34) A steering prompt at a rest, and at the run's end (revision 6, OQ-128).** A steering prompt pending for an agent a
rest leaves `paused` SHALL be delivered into that agent's record, after the answers to the calls the rest cut, as the marked
message its next step would have injected, and marked injected then, once. The run SHALL accept no steer once the rest is
recorded, once its teardown begins, or once it pauses at the message limit or parks at the plan gate, whichever comes
first. A prompt no step injected and no rest delivered SHALL be recorded as not delivered, with a timeline entry and a
transcript line naming the end it met, when the run stops stepping. A crash still loses what was pending. The timeline
word the record uses is the timeline vocabulary's ruling (OQ-157), not this clause's.

**(35) The optimistic cancel of one agent (revision 6, OQ-129).** The window that sent a cancel of one agent SHALL show that
agent and every unfinished descendant the cancel ends, live or paused, cancelled at once, with the activity "The user
cancelled this agent." and "Cancelled with <name>, which the user cancelled.", until the engine answers: a refusal removes
it and states the engine's words, and an acceptance holds it until the first whole-session update taken after it. Another
window shows the cancel when the engine's record reaches it. REQ-MONITOR-128's "each of its live descendants" is read as
live and paused.

**(36) No checkpoint for an iteration a recorded cancel closes (revision 6, OQ-130).** The iteration the record of an
accepted explicit cancel closes (clause 3, as OQ-103 was ruled) SHALL take no checkpoint capture: it is a close no run
made, outside REQ-GIT-051's "each iteration that closes". What the dead run wrote is captured by the next iteration's
capture.

**(37) What a follow-up does beyond clause 22 (revision 6, OQ-131).** A followed-up child SHALL resume into `queued` and
start as any queued child does, under REQ-ORCH-050's cap and REQ-ORCH-046's limit. Only the call's `task` is read; the
child keeps its recorded identity and claims its stored write scope again. "Cut off by its `child_timeout`" is read from
its stored report. A child the user cancelled is settled and may be followed up, clauses 3 and 16 being about a
continue's resume. A child that never started is given the payload it would have started with. The follow-up waits for an
execution still winding down, replaces the child's report when it reports again, and REQ-ORCH-088's fallback retry of it
starts from the child's payload.

**(38) An ask in the quit's gap (revision 6, OQ-132).** An approval or a question asked after main revoked the last
window's presenter for the quit and before the run host's shutdown SHALL be held unshown, published `brokered`, its budget
not running, and withdrawn by the quit as clause 9 says. It is not resolved by the headless policy (REQ-TOOLS-064), not
denied `presenter-error` (REQ-TOOLS-058), and not discarded as "could not be shown" (REQ-CHAT-094); the `timeout_seconds`
it announced is not the bound it waits under. A user treated as away (`PD-TOOLS-005`) is still resolved at once.

**(39) Model slots across sessions (revision 6, OQ-148, OQ-149).** The per-model count is the process's and the queue each
session's own: a session's held children are released in the order that session held them, and a slot freed in one session
is offered first to the other sessions, in the order they joined, and then to the freeing session. A child `paused` out of
`starting`, `running` or `summarizing` SHALL keep its slot while its session rests and resume into it, in place of
REQ-MONITOR-020's "only running and summarizing agents count" and REQ-CONFIG-094's "currently running". A session paused
by an earlier process holds no place until a run of it starts in this one, and a resting session's places do not lapse.

**(40) A continue resumes the paused iteration with the intent and tools it started with (revision 7, OQ-162).** An iteration a
continue resumes SHALL run under the intent in effect when it was left open — the newest intent the session recorded, a
continuation's or else the launch's — with that intent's grant to the entry role, the entry role's instructions as that
grant fits them (PD-ORCH-006), its playbook and its budget clamp, for its root and every agent it resumes or delegates.
The Continue action, and the resolution of a message-limit pause, bring no new request, and SHALL make no classification
call: the run carries the intent in effect, conveyed as continued from the previous run. A continue by message classifies
the message as any run does, and that classification SHALL take effect from the run's next iteration, once the resumed
iteration has closed; an iteration left open again keeps the intent it started with. A plan decision resumes nothing,
and its run classifies the session's request as before. The prior intent a classification inherits when its own is unusable
(REQ-ORCH-013) is the intent in effect.

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

**Why revision 6, and what it costs.** Building revisions 4 and 5 raised questions the text did not decide, and the build
recorded the reading it proceeded under for each: OQ-100 to OQ-104, OQ-106 to OQ-108, OQ-117, OQ-118, OQ-124, OQ-128 to
OQ-132, OQ-148 and OQ-149. On 2026-10-06 the owner confirmed every one of them as built ([R-071](requests.md#r-071)).
Clauses 23 to 39 state those readings, and the Narrows list names the requirements they depart from, so a reader of each
finds this directive. Nothing in the product changes. What the readings cost, now that they govern:
- the counters' line words itself one way while an agent is paused and another otherwise;
- an agent a crash left presents `paused` before anything has recorded the crash;
- a Continue action on a session whose last request is finished re-runs that request;
- a steering prompt can end recorded as not delivered, and a crash still loses one;
- a resting session holds its model slots against every other session for as long as it rests;
- an ask in the quit's gap announces a `timeout_seconds` it is not held to;
- the iteration a recorded cancel closes has no checkpoint of its own;
- a board run caught by the quit is resumable rather than cancelled.

**Why revision 7, and what it costs.** The owner ruled two questions the build had left open ([R-071](requests.md#r-071)).
Every continue classified the intent again, the Continue action on the session's last prompt, which added up to 12 s to a
continue that brought nothing new; and the new classification governed the iteration it resumed, so the coordinator's
tools or playbook changed in the middle of its iteration (24 tools to 29 in the live run of 2026-10-01, finding a71-3;
three playbook lines in that of 2026-10-06, finding G1). Clause 14's fingerprint, taken of the whole system prompt and
the listing, then warned that the agent had resumed under changed instructions although no persona had been edited. What
it costs:
- `REQ-ORCH-005` asks that classification complete before the coordinator starts and be in effect from the first
  iteration; the Continue action classifies nothing, and a continue by message's first iteration runs under the intent it
  resumes, so the directive names it;
- `REQ-ORCH-013` carries the prior intent over only when a fresh classification was unusable; the Continue action carries
  it with no fresh classification at all;
- a persona whose definition is unchanged is never named, even when what it was instructed with changed — a workspace
  instruction file its own run edited, a skill loaded since, another MCP server — since those are the run's, not the
  persona's;
- a change is stated once, so a session resumed many times under a changed persona does not repeat the warning.

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

> **Narrows:** REQ-MONITOR-256, REQ-MONITOR-123, REQ-ORCH-072, REQ-ORCH-002, REQ-ORCH-052, REQ-MONITOR-300, REQ-ORCH-053, REQ-SESSION-065, REQ-NOTIFY-121, REQ-SESSION-115, REQ-SESSION-129, REQ-SESSION-025, REQ-TOOLS-054, REQ-TOOLS-111, REQ-ORCH-134, REQ-MONITOR-014, REQ-MONITOR-046, REQ-MONITOR-211, REQ-MONITOR-213, REQ-SESSION-078, REQ-SESSION-180, REQ-ORCH-135, REQ-MONITOR-130, REQ-SESSION-108, REQ-TOOLS-063, REQ-CHAT-029, REQ-MONITOR-063, REQ-ORCH-004, REQ-SESSION-186, REQ-SESSION-073, REQ-MONITOR-169, REQ-MONITOR-064, REQ-MONITOR-128, REQ-CHAT-069, REQ-MONITOR-107, REQ-MONITOR-111, REQ-TRACE-464, REQ-GIT-051, REQ-TOOLS-064, REQ-TOOLS-058, REQ-CHAT-094, REQ-MONITOR-020, REQ-CONFIG-094, REQ-ORCH-005, REQ-ORCH-013
> **Extends:** REQ-MONITOR-125

*Raised by the owner, 2026-09-27; logged as [R-058](requests.md#r-058) and ruled as drafted, every fork as recommended,
by [R-059](requests.md#r-059). Revision 2 logged as [R-060](requests.md#r-060), revision 3 as [R-061](requests.md#r-061),
revision 4 as [R-064](requests.md#r-064), revision 5 as [R-067](requests.md#r-067), revisions 6 and 7 as
[R-071](requests.md#r-071).*

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
> - [`delegate-drops-session-id-and-suppress-auto-context.md`](../defects/fixed/delegate-drops-session-id-and-suppress-auto-context.md),
>   because the resume gives `session_id` no meaning. *Revision 5's clause 22 gives it one (2026-09-29); the note stays open until
>   it is built. Built and repaired the same day, recorded below.*
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
>   ([`the-scripted-client-restarts-its-script-for-every-run.md`](../defects/fixed/the-scripted-client-restarts-its-script-for-every-run.md)),
>   so a driven agent's steps after a continue are the script's first steps again. Its record is what is resumed.
>   *(2026-09-29, R-067: repaired. A resumed agent now takes the step after the ones its own record holds, in the same
>   process or after a relaunch; `part-j-proof`'s steer-at-rest scenario pins it.)*
> - The driver's own quit is an immediate exit that skips the shutdown
>   ([`the-drivers-quit-skips-the-applications-shutdown.md`](../defects/fixed/the-drivers-quit-skips-the-applications-shutdown.md));
>   the quit above was a window close.
>   *(2026-09-29, R-067: repaired. The driver's `quit` is now the application's quit unless it names the immediate exit,
>   and `driver-proof` quits a live run through it and reads the session at rest.)*
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
>   ([`the-driver-cannot-address-persona-or-approval-windows.md`](../defects/fixed/the-driver-cannot-address-persona-or-approval-windows.md)).
>   *(2026-09-29, R-067: repaired. The driver names a persona window, the approval dialog and the terminal window by
>   role, and `driver-proof` probes a persona window's state and answers an approval in its dialog.)*
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

> **First execution of revision 5's clause 22, 2026-09-29, built under [R-067](requests.md#r-067):** a `delegate` call
> whose `session_id` names a settled child of the caller resumes that child from its record. The build:
> - `IterationChildren.followUp` admits the call;
> - the writer's `followUpChild` makes REQ-MONITOR-300's one exit from a terminal state, in one transaction with the
>   follow-up's user message in the record;
> - the scheduler starts the child as any queued child;
> - `execute` finds the conversation in its record and carries on from it under the child's own task id.
>
> The child keeps its identity and its stored write scope, and it ends, reports and notifies its parent again. A child
> the timeout cut off is refused, and the reason names `continuation_of`.
>
> The text met the code in these places, and [OQ-131](../architecture/open-questions.md) records the reading built for
> each:
> - **The state it resumes into is `queued`,** so the follow-up waits under REQ-ORCH-050's cap and REQ-ORCH-046's active
>   limit. It holds no place in either when it is followed up, unlike a paused agent that "keeps the place" it held.
> - **Only the call's `task` is read.** The child's identity is its record's.
> - **A child that never started has no conversation,** so it is given its payload first. REQ-ORCH-048's cascade does
>   not block it again.
> - **A follow-up waits for the child's execution to wind down.** Building it found that a child the user cancelled is
>   settled before its aborted execution returns. An execution that then found its record live again wrote over the
>   follow-up, which a case pins.
> - **The fallback retry starts from the payload** and loses the follow-up. That is put to the owner.
> - **A child the user cancelled is settled, and may be followed up.** Clause 3 says a cancelled agent is "never
>   resumed", and clause 16 calls a paused child's cancel "final as clause 3 says". Clause 22 names every terminal state
>   but the cut-off one, and says clause 5, which lists `cancelled`, does not bar a follow-up. The build reads clauses 3
>   and 16 as about a continue's resume, which a follow-up is not, so a parent can follow up a child the user cancelled
>   (REQ-MONITOR-128). The cancel race's case pins it. Refusing it would add a refusal PD-TOOLS-006 revision 3 does not
>   list; that is put to the owner.
>
> Three places of the resume path serve the follow-up unchanged:
> - clause 3's crash record and clause 2's rest pause a follow-up that has not started, from its record;
> - clause 4's resume starts it again from the record;
> - a case pauses one held behind a model slot and continues it.
>
> The defect note is repaired:
> [`delegate-drops-session-id-and-suppress-auto-context.md`](../defects/fixed/delegate-drops-session-id-and-suppress-auto-context.md).
>
> **What was measured.** Fourteen cases in `children.test.ts` (twelve in the clause 22 describe, with the transition
> table's case and the writer's) and two in `agent-tools`' `delegation.test.ts`. The two tool cases and the first seven
> engine cases were red on the code before the repair. Each later case was red with its own limb removed. This report
> first said fifteen cases; that counted the two outer cases twice, and the case for a later iteration's root, added
> since, had not been written. **What was not
> measured.** No built-app or live run followed a child up. The row is in
> [`../architecture/first-executions.md`](../architecture/first-executions.md).
>
> **Reported back 2026-10-13 (fin42, item N57):** the built app has followed a child up: `pnpm delegation-proof`'s `follow-up`
> launch, as `PD-TOOLS-006` revision 3's report-back gives it (one child row, the follow-up's task in its record once, a
> `child_resumed` entry, ended `succeeded` again). A live follow-up is asked by the default live run's `delegation` scenario,
> and is the orchestrator's to run.

> **The quit's gap, repaired 2026-09-29 under [R-067](requests.md#r-067):** clause 9's withdrawal by a quit was built for
> what is pending when the run host's `shutdown` arrives, and main sends it only after `window-all-closed` has waited on
> REQ-GIT-101's checkpoint operation. The last window's presenter is revoked as it closes, so an approval asked in that
> gap met no presenter and was denied by the headless policy. Main now marks the revoke its quit causes (`quitting`, from
> `QuitState`), and the run host holds what is asked meanwhile — an approval unshown in `pending_approvals`, a present
> that crossed the close, a question — with no budget expiring on it, for the shutdown to withdraw by `quit`. The same
> hold keeps an approval asked before the quit from timing out into a denial while the checkpoint operation runs.
> [OQ-132](../architecture/open-questions.md) states the reading against REQ-TOOLS-064, REQ-TOOLS-058, REQ-EVENTS-049 and
> REQ-CHAT-094. The note is repaired:
> [`an-approval-asked-after-the-last-window-closes-is-denied.md`](../defects/fixed/an-approval-asked-after-the-last-window-closes-is-denied.md).
> **What was measured.** Eight unit cases across `gate.test.ts`, `questions.test.ts`, the run host's `tools.test.ts` and
> `dispatch.test.ts`; the first was red on the code before the repair, and each limb's cases were red with it removed.
> **What was not measured.** No built-app quit with a checkpoint operation in flight and an ask made during it was
> driven; main's `revokePresenter` is wiring no unit reaches. The row is in
> [`../architecture/first-executions.md`](../architecture/first-executions.md).


> **First execution of revision 7, 2026-10-06, ruled by [R-071](requests.md#r-071) and built on branch
> `fin20-continue-and-continuation`:** clauses 14 and 40 were built as written (as clauses 14 and 23 of a revision 6, renumbered
> before landing). The text met the code in these places:
> - **Where the carried intent comes from.** "The intent in effect" is the newest `run_continuation_intent` entry's, else the
>   launch audit's — the reading REQ-ORCH-014's status already took (`intentPayloadOf`). It is carried restated as carried
>   over (`carriedIntent`), so a fallback launch intent is carried as the category it fell back to, conveyed as continued
>   from the previous run, not as a fallback. A session with nothing recorded to carry classifies, since an intent must be
>   in effect (REQ-ORCH-005). An `ambiguous` intent in effect is carried as it stands: REQ-ORCH-013(b) carries over only a
>   category that is not `ambiguous`, but that clause decides what replaces an unusable new classification, and the Continue
>   makes none — clause 40 narrows it to "the intent in effect", whatever that is (stated at the verifier's review).
> - **The status does not read `classifying` for a carried intent.** REQ-ORCH-014 ties that phase to the classification
>   call, and the Continue action makes none, so the run is told its pre-flight carries (`RunDeps.preflightCarries`) and
>   publishes `classifying` only when it does not (found at the verifier's review; the Continue-action case pins it).
> - **The pre-flight still runs for a carried intent**, with no classification call: the run host resolves the grant, the
>   playbooks and the clamp for it (`PreflightContext.intent`, `runPreflight`), so a playbook override edited since is read
>   again, as every run reads it.
> - **A continue by message classifies at the continue**, as before, and the iteration it resumes runs under the carried
>   pre-flight (`RunDeps.resumedPreflight`, `Run.preflightInEffect`); the plan gate is settled on the run's own
>   classification, since it holds before the first new iteration (PD-ORCH-003 revision 2). The resumed iteration's entry
>   records the message's classification beside its own (`next_run_intent`), and once that iteration closes the
>   classification is recorded as a further entry and row (`nextIntentInEffect`). A plan decision resumes nothing and
>   classifies as before. A resumed iteration left open again (paused once more) keeps its carried intent, and the
>   message's classification is not taken up: the "run's next iteration" the clause names is this run's, and a later
>   Continue carries the intent in effect, which is still the one the iteration started with. A later continue by message
>   classifies afresh.
> - **The instructions follow the grant in effect.** `PD-ORCH-006` (OQ-202), which landed on `main` while this revision
>   was built, fits the entry turn's instructions to the run's grant (`entryInstructionsFor`), and read the run's own
>   pre-flight. Merged as written, a continue by message whose resumed iteration carried `none` and whose message classified
>   `explicit_trivial` would have told the resumed coordinator to do the work itself while it still held only the
>   coordinating tools — the mid-iteration change this clause removes (found at the verifier's second review, before
>   landing). The root's instructions now read `Run.preflightInEffect`'s grant, as its tools, playbook and clamp do, so the
>   clause names the instructions with them; the next iteration's root is the first given the message's. The fingerprint
>   stays the persona's prompt as written, never its grant-fitted form, so the change of form between iterations is no
>   change of definition and warns nothing. Clause 40 also said "a continue that brings a request — a message, or a plan
>   decision — classifies it"; a plan decision is not classified, its relaunch classifies the session's last request, so
>   the clause now says that (the same review).
> - **The persona's definition** is its own system prompt and its tool declaration (declared tools, `tool_restrictions`,
>   the `coordinatorOnly` and `readOnly` flags); the root's is the entry persona's. Digests are marked `persona:`, so a
>   fingerprint recorded before the ruling, of the whole request, is told apart and replaced with nothing stated. A
>   stated change replaces the row's digests in place, its iteration kept (clause 12's clear reads it). The issue kind
>   and the transcript line stay as built (OQ-105), the line now naming the persona's instructions or tool definitions
>   as "changed since it last ran".
>
> **What was measured.** Unit and scripted end-to-end tests: three cases in `packages/engine/src/run/preflight.test.ts`
> ("OQ-162 as ruled …"), each red on the code before the repair, and a fourth since the merge with `PD-ORCH-006` (a
> resumed coordinator that carried `none` keeps the coordinating prompt, the next iteration's root under the message's
> direct-work grant is told to do the work itself, and nothing is warned; red with the run's own grant read) — the live run's a71-3 and G1 shape (a launch that fell
> back, a Continue that would have classified otherwise: one classification, the resumed root's grant and playbook the
> launch's, no warning), a continue by message whose classification governs from the next iteration, and the prior
> intent; `apps/desktop/src/run-host/intent.test.ts` (a carried intent makes no classification request); and the clause
> 14 describe in `packages/engine/src/run/record.test.ts`, rewritten to the ruling, with a case in which a skill, the MCP
> section and the listing all changed across a pause and nothing is warned. In the built app, `pnpm part-j-proof`
> (pause, steer at rest and a quit's relaunch, each continued by the Continue action) recorded each Continue's intent as
> the launch's `moderate_feature` carried, with no classification, every fingerprint marked `persona:`, and no
> `resumed_under_changed_instructions` issue; `pnpm part-h-proof`'s continue by message still carried its intent over from
> an unusable classification. Both ran at a load average of 5 to 9 beside another plan's agents.
> **What was not measured.** No live run: the orchestrator's default run's `resume` scenario is the evidence still owed.
> The row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).

> **Reported back 2026-10-13:** the `resume` scenario of the orchestrator's default live run has since carried the intent
> across a pause and the Continue action against the owner's self-hosted endpoint. At `552d346` (pack
> `2026-10-13T07-25-27-766Z`) the launch's classification timed out at 12 s and fell back to `moderate_feature`, and the
> Continue logged "intent: moderate_feature" and "Intent classified: moderate_feature (continued from previous run)": the
> intent carried was the fallback's. At `0bc3eee` (pack `2026-10-13T12-18-40-282Z`) the launch classified `small_feature`
> (0.72) through `json_schema`, and the Continue carried `small_feature` "(continued from previous run)". In both, the
> paused iteration resumed (clause 4) and closed `succeeded`. The fingerprint's "no warning" half was not separately read
> from the live packs. The row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).

> **Clause 9's crash half for a question, first executed 2026-10-13 (fin41, `fin41-restore-and-session`).** A crash withdrew
> the approvals its record could read from the store and no question, because no question was stored: the prompts lived in
> each tool port's registry, and the record of a crash is written later, from the store alone
> ([`../defects/fixed/a-crash-with-a-question-pending-records-no-withdrawal.md`](../defects/fixed/a-crash-with-a-question-pending-records-no-withdrawal.md)).
> The run host now mirrors the session's pending prompts to `sessions.pending_questions` (v35) each time one is put or
> ends, as the session's whole list, and `recordCrash` writes one `question_withdrawn` entry per prompt it lists — "The
> ask_questions call was withdrawn by a crash before the user answered; it was not run.", `{tool, persona, interruption:
> 'crash'}`, the gate's own words and fields — and empties the list; the cut call is answered and its row settled as every
> call a crash cut is. Revision 3's "never restored on reload" is untouched: the mirror is never read back as pending.
> The same column gives REQ-SESSION-031's listing its question half (`awaitingInput`). **What was measured:** `crash.test.ts`,
> `sessions.test.ts`, the run host's `tools.test.ts` (each red before) and `store.test.ts`'s v34 → v35 migration.
> **What was not measured:** no built-app proof or live run kills a run host while a question waits; the live scenario
> that would show it is written in the row in [`../architecture/first-executions.md`](../architecture/first-executions.md).
>
> **Reported in place 2026-10-14 (fin43, `fin43-notices-and-config`):** the approvals half now has the same shape. Each port
> wrote its own registry's list to `pending_approvals`, so two agents waiting at once overwrote each other and a crash then
> withdrew only the last writer's
> ([`../defects/fixed/pending-approvals-holds-one-agents-list-when-two-agents-wait-on-approvals.md`](../defects/fixed/pending-approvals-holds-one-agents-list-when-two-agents-wait-on-approvals.md));
> the gate now writes the run's list over every port (`Run.pendingApprovals`). Measured by the run host's `tools.test.ts`
> with two real ports, red before, and the engine's `children.test.ts` (a root and two children, every port handed all
> three approvals, red with the gathering or its wiring removed); not driven in the built app.

---

<a id="pd-orch-006"></a>

### PD-ORCH-006 — a coordinator granted the direct-work bundle does the work itself, and is told so

*Revision 3 (2026-10-07, [R-072](requests.md#r-072)) — **a `swarm` run the mapping grants**, the ruling of OQ-205 under the
owner's delegation: the paragraph **A `swarm` run** becomes a governing clause, and REQ-ORCH-025 joins the Narrows line. The
generator admits one narrowing directive per requirement, so any later narrowing of REQ-ORCH-025 also lands here. Revisions 1
and 2 are otherwise unchanged.* *(No longer binding since 2026-10-13, [OQ-237](../architecture/open-questions.md): two directives may narrow, or extend, one requirement in disjoint cases, so a later narrowing need not land here when it is about something else; what landed here stays.)*

*Revision 2 (2026-10-06, [R-071](requests.md#r-071)) — **which todo items REQ-ORCH-029's success clause ranges over**, a
section added after the directive's first two paragraphs; the owner's ruling of OQ-203. One clause of the first paragraph is
qualified there and quoted beside its replacement. This directive is the one that narrows REQ-ORCH-029, and the symbol
generator admits one narrowing directive per requirement, so a narrowing of REQ-ORCH-029 lands here whatever it is about
(as `PD-TOOLS-006` holds REQ-TOOLS-152's). Revision 1 (2026-10-06, the ruling of OQ-202) is otherwise unchanged. The
paragraph **A `swarm` run** was added the same day as a wording addition (fin22), not a revision: it changes no clause,
names how the clauses above reach a `swarm` run, and cites [OQ-205](../architecture/open-questions.md) for what they do not
decide.* *(No longer binding since 2026-10-13, [OQ-237](../architecture/open-questions.md): two directives may narrow, or extend, one requirement in disjoint cases, so a later narrowing need not land here when it is about something else; what landed here stays.)*

Where the intent-to-tools mapping grants the entry role the direct-work bundle of REQ-ORCH-016 — with the built-in
mapping, on a run whose intent is `explicit_trivial` or `single_file_change` — three of REQ-ORCH-029's constraints on the
coordinator SHALL NOT bind it for that run: it MAY make file-modifying tool calls, it MAY emit a plan, code or a diff of its
own authorship, and a work item it takes on NEED NOT reach a specialist through a `delegate` call. Its other constraints
still bind: work spanning more than one step is accompanied by a todo list it keeps current; no two implementation
delegations for the same todo item are outstanding at once; it does not report the run successful while a todo item is
non-terminal or disagrees with what happened; and it issues no delegation deeper than depth 3. `delegate` stays in the
bundle, so it MAY still delegate.

The instructions the entry role is given for that run SHALL say that it holds the tools to read and write files and run
commands and does the work with them, and SHALL NOT say that it modifies no files or runs no commands. A prompt supplied by
configuration (REQ-CONFIG-100) is kept whole, with that statement after it. While the plan gate holds the run
(REQ-ORCH-153), the bundle's writing and command tools are withheld, and the held turn is given the instructions of a
coordinating run. Every other run keeps REQ-ORCH-029 whole. *(Qualified by revision 2: on every run, the todo clause
ranges over the task's own items, below.)*

**A `swarm` run — revision 3.** Where the intent-to-tools mapping in force, built-in or a user's mapping file, grants the
entry role the direct-work bundle, a `swarm` override SHALL change nothing that run holds or is told. The entry role holds the
bundle with `delegate` in it and is given this directive's direct-work statement. It is given no `swarm` text on any turn of
the run, including the turn the plan gate holds and a continuation. REQ-ORCH-025's coordination-only tool set and its demand
for maximum parallel delegation do not reach that run. Its coordinating status in REQ-ORCH-025's sense stands: it is not a
`single` run, nothing is withheld, and the REQ-ORCH-029 constraints this directive leaves binding still bind. On every run the
mapping does not grant, REQ-ORCH-025's `swarm` governs as written. `swarm` stays outside the mapping's inputs (REQ-ORCH-016)
and is offered to every run alike (REQ-ORCH-150).

> *Revision 2 said, and no longer governs:*
> **A `swarm` run** (named 2026-10-06, a wording addition; nothing above changes, and this directive governs over
> REQ-ORCH-029 alone). A `swarm` override is not an input to the mapping (REQ-ORCH-016), so a `swarm` run whose intent the
> mapping grants is granted the bundle, and the paragraphs above reach it as they reach any run granted the bundle. That
> meets a clause this directive does not name: REQ-ORCH-025's `swarm` keeps "its coordinating status and its
> coordination-only tool set" and demands maximum parallel delegation, by instruction text alone. The two requirements do
> not say which governs such a run, and the question is raised as [OQ-205](../architecture/open-questions.md), which is
> open. The build proceeds under the reading OQ-205 records: the run holds the bundle with `delegate` in it, keeps its
> coordinating status in REQ-ORCH-025's sense (it is not a `single` run, so nothing is withheld), and is told that it does
> the work itself. No `swarm` demand stands beside that statement, since the build renders REQ-ORCH-025's `swarm` text on
> no run (`packages/engine/src/children/personas.ts` reads no run override;
> [the defect recorded for it](../defects/fixed/the-swarm-run-override-changes-no-instruction-text.md)). *(The reason, corrected
> 2026-10-06, finacc3, finding F07: the build now renders the `swarm` text on every run the mapping does not grant the bundle,
> `withRunOverride`, and withholds it on a granted run by a check of its own, OQ-205's reading; the outcome on a granted run is
> unchanged. In that bundle's repair round 1 the function became `runOverrideLayer`, its text placed after everything else the
> prompt carries by `runTurn`; the check on a granted run is the same.)*

**Which todo items the success clause ranges over (revision 2).** On every run, coordinating or granted the bundle,
REQ-ORCH-029's constraint "it does not report the run successful while a todo item is non-terminal" SHALL range over the
items of the plan that the task in hand answers for, as [`PD-ORCH-012`](#pd-orch-012) decides them: the items not already
open when the task was first taken up. An item a task given up on, an earlier run or anything else left open before then
does not keep the coordinator from reporting the task's work done; it stays open in the plan. The clause's other half, a
todo item whose recorded state disagrees with what happened, is unchanged.

> *Revision 1 said, and no longer governs in the case above:* "it does not report the run successful while a todo item is
> non-terminal or disagrees with what happened" — among the constraints that "still bind", read over every item of the plan.

**Why, and what it costs.** REQ-ORCH-016 grants the coordinator the bundle on the two simplest intents and REQ-ORCH-029
forbids it to use it; neither names the other ([OQ-202](../architecture/open-questions.md)). The build applied the grant and
kept REQ-ORCH-029's sentence in the instructions, so the model was offered `write_file` and `terminal` and told it must not
use them: in the default live run at `27a5127` the `frictions` scenario's first request spent 14.5 s and 1,034 output tokens
of a 32.0 s run reasoning about the contradiction before it made the calls itself (finding G2). A trivial change needs no
delegation, and the grant exists to let the coordinator make it. The cost is that the records of such a run show the
coordinator's own file-modifying calls, which REQ-ORCH-029 says a coordinating run never shows; a reader of those records
tells the two apart by the launch audit's `intent_grant`. A `single` override, which REQ-ORCH-025 already takes out of
REQ-ORCH-029, carries the same grant and is given the same instructions.

*Revision 3's why and cost.* Why: a `swarm` demand beside the direct-work statement would put back finding G2, which cost
14.5 s and 1,034 output tokens at `27a5127`; with the statement alone the default live run at `c2a9444` measured 2,910 ms and
83 output tokens for the `frictions` scenario's first `explicit_trivial` request, which went straight to `write_file`, and the
`c2fdd6a` autopsy records G2 as gone. The built-in granted intents fall in the micro cell, CHUNKING `single` with BUDGET
`tight`, and `SWARM_INSTRUCTION`'s own rule that a one-item task stays one delegation leaves a single delegation all `swarm`
could ask there. The strategy (`rotaris.delegation_strategy`) is a standing workspace setting, so any other reading would slow
every trivial edit in a `swarm` workspace. Withholding the grant instead would break REQ-ORCH-016's "not an input", the
Specification Gate's resolution 14 ("`swarm` is unaffected and stays instruction-only") and REQ-ORCH-025's own "changes
instruction text only". Cost: `swarm` has no effect on a granted run and no surface says so; the launch audit's
`intent_grant` and `config_snapshot.delegation_strategy` tell a reader why. A user mapping that grants a larger intent silences
`swarm` on that intent, and the run's records show the coordinator's own file-modifying calls under `swarm`.

> **Narrows:** REQ-ORCH-029, REQ-ORCH-025

*Raised by the owner, 2026-10-06; logged as [R-071](requests.md#r-071), which ruled OQ-202 as recommended. Revision 3 raised
under the owner's delegation, 2026-10-07, ruling OQ-205; logged as [R-072](requests.md#r-072).*

> **First execution, 2026-10-06 (fin20).** `entryInstructionsFor` (`packages/engine/src/children/personas.ts`) gives the
> entry role its instructions for the run's grant, read by `Run`'s root turn (`packages/engine/src/run/run.ts`) with the
> pre-flight's `grant` and the entry persona's `coordinatorOnly`, and the held turn of a run at the plan gate keeps the
> persona's own prompt. **What was measured.** Four cases in `children/personas.test.ts`, one in `run/preflight.test.ts`
> (the model's request under `direct-work` and under `none`) and one in `run/plan-gate.test.ts` (a held turn); the run's two
> were red on the code before, each limb red with it removed. `pnpm fetch-proof` reads the instructions the model port
> received on its `explicit_trivial` launch. **What was not measured.** No live run: the orchestrator's default live run's
> `frictions` scenario should show the coordinator's first request answered without reasoning about the contradiction. The
> row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).

> **First execution of revision 3, 2026-10-07 (fin27), under [R-072](requests.md#r-072):** confirmed as built, no behaviour
> changed; the clause held as written. **What was measured.** `intent/intent.test.ts` (a `swarm` override keeps the grant
> of the built-in mapping and of a file mapping granting `small_feature`), `children/personas.test.ts` (no layer on a granted
> run, held at the plan gate or not), two `run/preflight.test.ts` cases (a file-mapping grant carries the direct-work
> statement and no `SWARM_INSTRUCTION`; a plan-mode granted run's held turn carries neither `SWARM_INSTRUCTION` nor
> `SWARM_PLAN_HELD_NOTE`, and its first turn after approval carries the statement and no `swarm` text), each red with the
> granted-run check in `runOverrideLayer` removed, and `tools/symbol-artifact/back-pointers.test.ts` (REQ-ORCH-025 narrowed
> by this directive). In the built app, `pnpm fetch-proof`'s launch 8, `swarm-granted` (`rotaris.delegation_strategy:
> swarm`, `explicit_trivial`): the orchestrator's first request carries the direct-work statement, no `## Run override`
> heading, and offers 17 tools, `write_file`, `terminal` and `delegate` among them (the scripted client's capture
> now records the tool names it was offered). **What was not measured.** No live run: no live scenario takes a strategy, so
> the built-app launch stands in. The row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).
>
> **Reported back 2026-10-13 (fin42, item N57):** the other half in the built app, and a live scenario. `pnpm delegation-proof`'s
> `swarm` launch saves `delegation_strategy: swarm` on a run the mapping does not grant (the scripted classifier's
> `moderate_feature`): the coordinator's first request carried ``## Run override: `swarm` ``, not the direct-work statement,
> and was offered `delegate` with none of `write_file`, `terminal`, `haet_edit`, `haet` — REQ-ORCH-025 as written, as this
> revision leaves it for such a run. The default live run's `delegation-swarm` launch sets the strategy and checks whichever half
> the mapping reaches; its run is the orchestrator's.

> **Reported back 2026-10-13 (fin41), from the live packs at `552d346` (default and duress) and `0bc3eee`**: revision 1's live measure,
> the `frictions` scenario. Its coordinator's first request after an `explicit_trivial` classification went straight to the
> work both times, `write_file` and a background `terminal` in one step: 4,329 ms and 227 output tokens (514 characters of
> reasoning) at `552d346`, 4,530 ms and 240 (463) at `0bc3eee`, against `27a5127`'s 14.5 s and 1,034 output tokens. Neither
> reasoning weighs what a coordinator may do ("Simple task. Create file, then run the command in background terminal, then
> send SIGINT."). Held as written. Evidence:
> [`live-552d346-default-autopsy.md`](../architecture/live-runs/live-552d346-default-autopsy.md),
> [`live-0bc3eee-default-autopsy.md`](../architecture/live-runs/live-0bc3eee-default-autopsy.md).
> The rows are in [`../architecture/first-executions.md`](../architecture/first-executions.md).

---

<a id="pd-orch-007"></a>

### PD-ORCH-007 — the report summariser reads the child's whole task

The report-producing pass of REQ-ORCH-110 keeps the child's task as given as the start of the transcript it reads (OQ-111's
ruling). That task SHALL be exempt from REQ-ORCH-110's 2,000 characters for any one event: it is kept whole, within the
12,000 characters in total. A task that alone fills the total keeps its head, cut and marked, and every later event is marked
omitted. Every other event, and the start where no task is given, keeps the 2,000.

**Why, and what it costs.** The task is the one event the summary is judged against, and a delegation's task carries its
closing sections — what must not be done, the expected outcome — last. Under the per-event cut a task longer than 2,000
characters lost them ([OQ-119](../architecture/open-questions.md)): six of the twelve delegations of the duress run of
2026-09-29 carried longer tasks, up to 3,447 characters. The cost is room: a long task leaves less of the 12,000 for the most
recent part of the transcript, which the report's deterministic facts (OQ-111) partly make up for.

> **Narrows:** REQ-ORCH-110

*Raised by the owner, 2026-10-06; logged as [R-071](requests.md#r-071), which ruled OQ-119 as recommended.*

> **First execution, 2026-10-06 (fin20).** `reportTranscript` (`packages/engine/src/children/report.ts`) no longer cuts the
> start it builds from the task; the two-part assembly cuts a start that leaves no room for the most recent part. **What was
> measured.** Two cases in `children/report.test.ts`, both red on the code before: a 3,000-character task kept whole with its
> closing section, and a task past 12,000 characters held within the total. **What was not measured.** No built-app proof
> delegates a task that long; the orchestrator's duress live run's summarising requests should each begin with the whole task.
> The row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).

> **Reported back 2026-10-13 (fin41), from the live packs at `552d346` (default and duress) and `0bc3eee`**: the duress measure.
> All 8 summarising requests of the duress run carried their child's task whole at the start of the transcript, after the
> marker for the payload ahead of it: tasks of 2,091 to 7,123 characters, every one longer than the 2,000 the per-event cut
> allowed. The default packs agree: 10 of 10 at `552d346` (929 to 8,608 characters) and 9 of 9 at `0bc3eee` (940 to 2,868).
> Read from each summariser request's text in `model-traffic.jsonl` against `children.task`. Held as written. Evidence:
> [`live-552d346-duress-autopsy.md`](../architecture/live-runs/live-552d346-duress-autopsy.md),
> [`live-0bc3eee-default-autopsy.md`](../architecture/live-runs/live-0bc3eee-default-autopsy.md).
> The rows are in [`../architecture/first-executions.md`](../architecture/first-executions.md).

---

<a id="pd-orch-008"></a>

### PD-ORCH-008 — a tool call joins the saved totals as it completes

Every tool call an agent of a run completes — the root of an iteration, the root of a plan cycle, and every delegated child
— SHALL join the session's persisted tool-call total, and the persisted count of the agent that made it, as it completes,
in one write, not after the agent's execution pass ends. What the pass's end adds is only what was not counted as it
completed: a call started and never completed, or one answered from a replay. A call is never counted twice, and a process
death between two calls leaves the total and the agent's count agreeing on every call that completed. The displayed total
(REQ-MONITOR-102) is therefore the record's during a pass, less the calls still in flight.

REQ-ORCH-097's accumulation is narrowed in its timing only; its replacement of cumulative token and cost snapshots, and
what the counters feed, are unchanged.

**Why, and what it costs.** In the duress live run of 2026-09-29 the root's one pass lasted the whole 40-minute run, and at
its deadline the displayed total read 240 against 309 calls made ([OQ-116](../architecture/open-questions.md)); the
per-agent figures, which read the live tracker, added up to more than the total. For as long as a pass lasts the user saw a
number that was wrong and contradicted the figures beside it. The cost is a write per completed call, where there was one
per pass, and one more counter on the session's row for a plan cycle's root, which has no iteration row to hold its count
(store v32, `sessions.plan_root_tool_calls`).

> **Narrows:** REQ-ORCH-097

*Raised by the owner, 2026-10-06; logged as [R-071](requests.md#r-071), which ruled OQ-116 as recommended.*

> **First execution, 2026-10-06 (fin20).** The root's `onToolCompleted` (`countRootCall` in `packages/engine/src/run/run.ts`)
> and a child's (`countCall` in `packages/engine/src/children/orchestration.ts`) each add the call to the run's aggregate and
> persist it with the agent's count through `SessionWriter.countToolCalls` — an iteration root's `iterations.root_tool_calls`,
> a plan cycle root's new `sessions.plan_root_tool_calls` (store v32, `planRootCall`, which does not release it), a child's
> `children.tool_calls` — and the pass's end, give-up or raise adds only the remainder. The crash record of a plan cycle's root
> adds its record's calls beyond `plan_root_tool_calls`. **What was measured.** `agent-links.test.ts` (the root's total while
> its turn runs), three cases in `run/crash.test.ts` (the plan cycle's root and child while they run, through a crash and a
> release apart), one in `run/ladder.test.ts` (a call the attempt REQ-ORCH-088's fallback replaced made) and one in
> `store.test.ts` (v32); the engine's four were red on the code before. **What was not measured.** No built-app proof holds
> a pass open long enough to read the total mid-pass; the orchestrator's duress live run should show `sessions.tool_calls`
> equal to the completed `tool_calls` rows at its deadline. The row is in
> [`../architecture/first-executions.md`](../architecture/first-executions.md).
>
> **Corrected 2026-10-06 (fin22).** The first execution counted a child's remainder over its attempts together,
> `Math.max(made, live)`, so an attempt REQ-ORCH-088's fallback replaced with no outcome (its turn raised) hid, behind the
> calls it had completed, a call the retry started and never completed — a replay of `g1` read 1 call where 3 were made
> ([`a-replaced-attempts-completed-calls-hide-the-retrys-unfinished-call-from-the-count.md`](../defects/fixed/a-replaced-attempts-completed-calls-hide-the-retrys-unfinished-call-from-the-count.md)).
> The remainder is now each attempt's own: its outcome's count less the calls it completed, or, with no outcome, the calls
> it dispatched less those it completed (`unfinished` in `IterationChildren.execute`). Two cases in `run/ladder.test.ts`:
> the raising attempt and the retry's replay (red on the code before), and the replaced attempt's own unfinished call (the
> `spent` limb alone, green before and after).
>
> **Corrected again 2026-10-06 (fin22, repair round 1).** That repair's remainder still lost a call in two shapes, both
> reproduced by the bundle's verifier: a raised attempt's calls were read from `onToolStarted`, which a call answered from a
> replay never fires (attempt 1 completes `g1`, asks for `g1` again beside `boom`, and `boom` raises: 2 counted where 3 were
> made), and an attempt with an outcome kept its first turn's count while its completed calls took in a REQ-ORCH-095
> re-prompt's or OQ-127 corrective turn's that then raised (the re-prompt completes `g1` and `boom` raises: 1 where 2). The
> remainder is now every call the attempt's turns counted, a replay included (`attemptCounted`, told by the turn's new
> `onToolCounted` as it counts each call), less those it completed, with or without an outcome. Two more cases in
> `run/ladder.test.ts`, one per shape, red on the first repair.

> **Reported back 2026-10-13 (fin41), from the live packs at `552d346` (default and duress) and `0bc3eee`**: the duress measure.
> At the run's end (no deadline was reached) `sessions.tool_calls` read **303**, equal to the 303 `tool_calls` rows and to
> `root_tool_calls` 63 plus the children's 240 (23, 12, 23, 36, 32, 42, 27, 45); `ring_state` held 303 with 0 dropped. Every
> session of both default packs agrees the same way (at `552d346` edit 13 + 15, requirements 25 + 43, terminal 6 + 15,
> faults-args 1 + 3, resume 6 + 10; at `0bc3eee` edit 11 + 16, resume 6 + 14, requirements 37 + 75). No pack samples the total
> while a pass is still open, so the mid-pass half stays shown by the unit cases alone. Evidence:
> [`live-552d346-duress-autopsy.md`](../architecture/live-runs/live-552d346-duress-autopsy.md),
> [`live-552d346-default-autopsy.md`](../architecture/live-runs/live-552d346-default-autopsy.md),
> [`live-0bc3eee-default-autopsy.md`](../architecture/live-runs/live-0bc3eee-default-autopsy.md).
> The rows are in [`../architecture/first-executions.md`](../architecture/first-executions.md).

---

<a id="pd-tools-007"></a>

### PD-TOOLS-007 — a `write_file` call with no operation is read as a create when its file does not exist

Beside REQ-TOOLS-032's three repairs, the product SHALL make a fourth, and only this one. A `write_file` call (REQ-TOOLS-135)
that the schema refuses after the three, and that

- names no `operation`,
- carries a path (`path`, or its alias `file_path`) and a `content`, each a string, and
- carries none of the fields only another operation reads: no `old_string`, no `new_string`, no `insert_line`, and no
  `replace_all` set true,

SHALL be read as a `create` when the path it names, resolved and fenced as a write is (REQ-TOOLS-129), does not exist.
The call is then dispatched as an ordinary call with `operation: create`: the tool-call record, the row, the permission
request, a session approval's match (`PD-TOOLS-004`) and the tool hooks all see the `create`. Its result SHALL carry, after
what the create itself reports, the sentence `No operation was given, so this call was read as 'create': <path> did not
exist. Name the operation on every write_file call.`

A call that names an existing file, or one that does not meet all three conditions, is NOT repaired: it is refused as
REQ-TOOLS-032 states, naming the missing field with an example, and where the path names an existing file the refusal
also says `<path> already exists, so the call was not read as a create; name 'overwrite' or 'edit'.` The inference never
overwrites: a file that appears between the reading and the write is refused by the create itself (`File already exists`).

Everything else REQ-TOOLS-032 fixes still governs: its three repairs, their order before schema validation, and the
recoverable refusal of every other call still invalid after them. REQ-TOOLS-135's operations, its refusals and its
success messages are unchanged.

**Why, and what it costs.** The intent of such a call is unambiguous, and no existing file can be overwritten by reading
it. Wording could not make a first use succeed: the description and the refusal both name the field, and the schema
marks it required, yet the duress runs refused 1 of 4, 2 of 5 and, on 2026-10-06, 4 of 6 children's first `write_file` for
want of it, each child then regenerating its whole file. One run's two refusals cost about 77 seconds and 7,000 output
tokens, the last one's five about 179 seconds and 17,000. What is given up: the product now acts on a call the model got
wrong, rather than telling it so first. The result says what was read, so the model is still told, after the fact.

> **Extends:** REQ-TOOLS-032

*Raised by the owner, 2026-10-06, ruling OQ-139 as recommended; logged as [R-071](requests.md#r-071).*

> **First execution, 2026-10-06, built under [R-071](requests.md#r-071) (fin21):** the rule held as written. The repair
> is the tool's, offered to the gate as `inferArguments` on the executor (`packages/agent-tools/src/tools/{types,files}.ts`)
> because only the tool holds the fence its path is resolved through; the gate (`gate.ts`) asks it only for a call the
> schema still refuses after REQ-TOOLS-032's repairs, validates what it returns, and carries the sentence into the result.
> It runs before the evidence record opens, so the record, the row's label and the approval all read the `create`.
> **Readings taken where the text leaves room:** a `replace_all: false` sent explicitly does not bar the reading, since
> false is the field's default and says nothing of another operation; an argument outside the tool's fields is not
> checked, since the schema strips it; a path the fence refuses is not read as anything, and is refused as before. **What
> was measured.** Four cases in `gate.test.ts` through the real tool and a real temporary directory — the duress run's
> shape created with the sentence, `file_path` too; an existing file refused, saying so, its content untouched; seven
> shapes not inferred; the inferred call's approval asked for the `create` and a session approval of it covering a later
> edit of the path — three of them red on the code before the build (the fourth, the negatives, holds either way). Two
> earlier cases sent the run's shape expecting the refusal, and now send a shape the directive does not cover. **What was
> not measured.** No live run has met the shape since: `pnpm live-run`'s `frictions` and `duress` scenarios now check that
> no create-shaped call was refused for want of an operation (`lib/tool-frictions.mjs`), and that is their next run's to
> show. The note is repaired:
> [`write-files-first-use-refusal-recurred-under-duress.md`](../defects/fixed/write-files-first-use-refusal-recurred-under-duress.md).
> The row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).
>
> **The live shape, 2026-10-06 (fin23).** The default live run at `c2a9444` met the directive in two sessions its check
> did not read: the resume session's ordinal 9 was read as a create, the sentence in its result — the directive's first
> live execution — and the requirements session's ordinal 62, a create-shaped call naming a path outside the workspace,
> was refused as the reading above says a fenced path is. The run's NOTE said the inferred create "was not asked this
> run", because the check read the `frictions` and `duress` sessions only, and it could not have seen a refused whole-file
> write in any session, whose arguments the record stores cut to a string. Since fin23 the check reads every session the
> run keeps, reads cut arguments, and reports a fenced refusal without failing it:
> [`the-live-runs-tool-friction-checks-read-two-scenarios-and-miss-a-refused-call-whose-arguments-were-cut.md`](../defects/fixed/the-live-runs-tool-friction-checks-read-two-scenarios-and-miss-a-refused-call-whose-arguments-were-cut.md).
>
> **The fence it judges by, 2026-10-06 (fin25).** fin23 judged every session's fence by the sandbox's workspace, while a
> requirements run is fenced to its worktree under `<workspace>/.rotaris/requirements/worktrees/…` (the requirements
> session's ordinal 66 at `c2a9444` was refused "outside workspace root '<that worktree>'"), so a create-shaped call naming
> a workspace path outside the worktree would have read as the old shape. Since fin25 each session is judged by the fence
> its own record names (`fenceRootOf`, the session's `worktree` before its `workspace_root`):
> [`the-live-runs-pd-tools-007-check-judges-a-requirements-runs-fence-by-the-workspace.md`](../defects/fixed/the-live-runs-pd-tools-007-check-judges-a-requirements-runs-fence-by-the-workspace.md).
> The same round aligned the check's create shape with the product's own (`createOnlyTarget` and the schema the gate
> applies after it): a call carrying `replace_all: false` or a key no operation reads is create-shaped, an empty path or a
> `file_path` that is no string is not, and a test runs both readers over the same nineteen shapes:
> [`the-live-runs-create-shape-reading-differs-from-the-products-create-only-target.md`](../defects/fixed/the-live-runs-create-shape-reading-differs-from-the-products-create-only-target.md).
>
> **The built app, and a live run that asks, 2026-10-13 (fin42).** The shape had met the product live only by chance, and no
> proof had sent it: the scripted `write` step names its operation, and the live run's `frictions` prompt said only "Create a
> file", so a model that read the schema named the operation and every run since printed "PD-TOOLS-007's inferred create was
> not asked" ([`the-live-runs-frictions-prompt-never-asks-pd-tools-007s-inferred-create.md`](../defects/fixed/the-live-runs-frictions-prompt-never-asks-pd-tools-007s-inferred-create.md)).
> `pnpm tool-shapes-proof` now sends it through the built application with the scripted step `writeinfer`: for an absent
> file the call settled `ok`, its result carrying the sentence and its record `operation: create`, and the file landed; for
> an existing one it was refused `invalid_request`, saying the file exists, its content untouched, with the `tool_error` issue
> REQ-SESSION-136 files for it. Held as written; nothing found. The `frictions` prompt asks for the write with only `path` and
> `content`, and checks it read as a create: the next default live run's to show.

---

<a id="pd-tools-008"></a>

### PD-TOOLS-008 — a todo list that itself marks two tasks in progress is refused without naming an active task

*Revision 4 (2026-10-15, [R-072](requests.md#r-072)) — **a task a delegation has served is outside the single-active count, before
and after its child ends**, a section added after revision 3's; the ruling of [OQ-333](../architecture/open-questions.md#oq-333)
under the owner's delegation. It replaces revision 2's "A task a running delegation holds is never counted against such a write",
quoted below, and keeps revision 2's falsified cost line beside its replacement. Revision 3's close rules, protections and four
kept-reasons are unchanged; the Narrows line is unchanged.*

*Revision 3 (2026-10-13, [R-072](requests.md#r-072)) — **a `replace` closes a delegated item once its child has ended, and
names every task it restores**, a section added after revision 2's; the ruling of
[OQ-255](../architecture/open-questions.md#oq-255) under the owner's delegation. It replaces revision 2's "REQ-TOOLS-146's
protection is otherwise unchanged", quoted below; the Narrows line is unchanged.*

*Revision 2 (2026-10-07, [R-072](requests.md#r-072)) — **a task a running delegation holds is outside the single-active
count**, a section added after revision 1's text; the ruling of [OQ-249](../architecture/open-questions.md#oq-249) under the owner's
delegation. It replaces revision 1's "at most one task is `IN_PROGRESS`", quoted below, and adds REQ-TOOLS-146 to the Narrows
line.*

When a `todo` `replace` is rejected under REQ-TOOLS-145's single-active rule because **the submitted list itself** marks
more than one task `IN_PROGRESS` while no task is active, the violation message SHALL NOT be REQ-TOOLS-145's sentence,
which names an "Active task" that does not exist in that case. It SHALL be:

`Only one task can be IN_PROGRESS at a time. The submitted list marks <n> tasks IN_PROGRESS ('<name>', '<name>', …), so the
replace was rejected and nothing was saved. Send it again with at most one task IN_PROGRESS.`

naming each task the list marked `IN_PROGRESS` by the name it was sent with, in the list's order, and no task id. The list
is still rejected whole and nothing of it is stored.

Everything else REQ-TOOLS-145 fixes still governs, as revisions 2 and 4 bound it below: every other violation — an `add_task` or
`update` that would make a second unserved task active, and REQ-TOOLS-146's `replace` that marks another task while an unserved
protected active task exists — still answers in REQ-TOOLS-145's own sentence, naming the stored active task. *(Until 2026-10-15
this read "as revision 2 bounds it below", "a second unheld task" and "an unheld protected active task"; revision 4 counts the
unserved ones.)*

**A task a running delegation holds is outside the count (revision 2).** An `IN_PROGRESS` task is **held** while a
non-terminal child of the list's owner records it as its `todo_item` (`PD-TOOLS-006` revision 6); non-terminal is that
revision's set, queued to paused. REQ-TOOLS-145's bound and REQ-TOOLS-146's protection count only the tasks no such child
holds:
- **The bound.** At most one `IN_PROGRESS` task may be unserved (revision 4; "may be unheld" until then), and the bound is checked only on a write that marks a task
  `IN_PROGRESS`: an `add_task` or `update` that marks one, or a `replace` whose incoming list marks `IN_PROGRESS` a task that
  is not already a protected `IN_PROGRESS` task. A task a child of the list's owner serves, running or ended, is never counted
  against such a write (revision 4 below).
- **What is never refused.** A write that marks no task `IN_PROGRESS` is never refused under the rule, however many
  `IN_PROGRESS` tasks the list keeps; a protected task a `replace` restores never counts against that `replace`.
- **REQ-TOOLS-145's sentence** names the first unserved `IN_PROGRESS` task (revision 4; unheld until then).
- **This directive's sentence** counts the unserved tasks the submitted list marks (revision 4; unheld until then). For a caller whose resolved tool set holds
  `delegate`, it adds: `Leave the items you will delegate PENDING: a delegate call that names one in todo_item marks it
  IN_PROGRESS.`
- **REQ-TOOLS-146's protection** is otherwise as revision 3 below states it.

> Revision 2 said, and no longer governs since revision 4: "A task a running delegation holds is never counted against such a
> write.", "**REQ-TOOLS-145's sentence** names the first unheld `IN_PROGRESS` task." and "**This directive's sentence** counts the
> unheld tasks the submitted list marks."

> Revision 2 said, and no longer governs since revision 3: "**REQ-TOOLS-146's protection** is otherwise unchanged: a protected
> task is restored by id with its state intact."

**A `replace` closes a delegated item once its child has ended, and names every task it restores (revision 3).** A task is
**served** when a child of the list's owner, terminal or not, records it as its `todo_item` (`PD-TOOLS-006` revision 6).
- **Served and ended.** A served IN_PROGRESS task that no non-terminal child holds takes the state a `replace` sends for its id
  when that state is COMPLETED or ABANDONED.
- **The count.** Such a task, closed by the `replace`, is not the active task against which REQ-TOOLS-146 rejects a list that
  marks another task IN_PROGRESS: the bound is evaluated on the tasks the resulting list leaves unheld and active.
- **Protections that stay.** COMPLETED and ABANDONED tasks are restored. A held task is restored over any state. A
  served-and-ended or own IN_PROGRESS task is restored when the list sends it PENDING. The agent's own unserved IN_PROGRESS task
  is restored over any state. An omitted protected task is kept in place.
- **The observation.** When a `replace` restores a task whose incoming state differed from the one kept, the success
  observation names each such task by name and id, with the state kept and one of these reasons: `a running delegated agent
  holds it`, `finished work is never reopened`, `your active task is closed with update`, `an active task is never set back to
  PENDING`. It then ends `Change a task's state with update.` This comes before the `Todo state:` summary; REQ-TOOLS-147's
  summary is unchanged. A task sent with no state, and an omitted task, differ from nothing and are not named.

**A task a delegation has served is outside the count, before and after its child ends (revision 4).** REQ-TOOLS-145's bound,
REQ-TOOLS-145's sentence, this directive's sentence and REQ-TOOLS-146's rejection SHALL count only the `IN_PROGRESS` tasks that
are not **served**, served as revision 3 defines it: a child of the list's owner, terminal or not, records the task as its
`todo_item`. Every held task is served, so held is a subset and revision 2's exemption is kept whole.
- **What it means for a delegated item.** An item the run marked IN_PROGRESS when its delegation was admitted (`PD-TOOLS-006`
  revision 7) never refuses the owner's next write that marks a task, while its child runs or after it has ended.
- **What it does not do.** The run never closes such an item: the owner closes it, with `update` or with revision 3's closing
  `replace`, and `PD-TOOLS-006` revision 11 tells the owner, in the message that resumes its wait, which reported child's item is
  still IN_PROGRESS.
- **What stays.** Revision 3's close rules, its protections and its four kept-reasons are unchanged; held still decides which
  served task a `replace` may close and when the reason is `a running delegated agent holds it`. With no served set, the tool
  behaves as before this revision.

> Revision 1 said, and no longer governs: "Everything else REQ-TOOLS-145 fixes still governs: at most one task is
> `IN_PROGRESS`, enforced when marking a task and on wholesale state changes".

**Why, and what it costs.** In the default live run of 2026-10-01 the orchestrator's first call was such a `replace`, and
REQ-TOOLS-145's sentence named "Active task: 3c55ec35 (Create friction-probe.txt)", an id the rejected list had minted and
never stored. The orchestrator did as the message said, `update 3c55ec35 COMPLETED`, was told the id was unknown, and spent
a turn working out that its list was empty; the run of 2026-10-03 repeated it with two failed calls. What is given up: the
message is no longer the one sentence REQ-TOOLS-145 fixes for every violation, so a caller matching that sentence meets a
second one in this case.

**Why revision 2, and what it costs.** A coordinator running two delegated children at once could record only one of their
items as in progress. In the default live run at `a68f121` (session `52aea43a`, edit) `#14`'s mark of the running tests
child's item was refused in REQ-TOOLS-145's sentence, which advised marking the running implementer's item COMPLETED or
ABANDONED, and the plan recorded the item `PENDING` while its child ran; the duress runs at `c2fdd6a` (`#305`) and `a68f121`
(session `e6747bd0`, `#20`, `#42`, `#113`, `#246`, `#404`) kept parallel items `PENDING` for most of the run, and REQ-TOOLS-147
makes that plan the run's primary progress display. OQ-163's case, which revision 1 ruled, had no delegation. What it costs:
- several active rows while children run;
- a stale active row between a child's end and the coordinator closing its item, which then counts against the next write that
  marks a task — *falsified 2026-10-15 and replaced by revision 4 ([OQ-333](../architecture/open-questions.md#oq-333)): the
  stale row still stands until the coordinator closes it, but it counts against no write, and the resume line of `PD-TOOLS-006`
  revision 11 names it;*
- the `todo` tool now depends on the run's child records, read through a port at each call.

**Why revision 3, and what it costs.** Revision 7 of `PD-TOOLS-006` sets a delegated item IN_PROGRESS without the coordinator
writing it, and once the child has ended the item fails every part of REQ-TOOLS-146's stated reason: the agent is not working on
it, nobody holds it, and closing it adds no second active task. As built it was restored over a closing `replace` that still
answered success. Revision 7's first execution met this on the scripted coordinator ("`replace` cannot complete an active
item"), and on a live run the open plan sends PD-ORCH-015's correction, whose text names only "the todo tool", and then
REQ-ORCH-075's re-queue of a met request. What it costs:
- a second read through the run, the items served by any child of the owner, terminal children included;
- four classes of protected task (finished, held, the agent's own active task, served-and-ended sent PENDING);
- a longer observation on a `replace` that restores something;
- the agent's own IN_PROGRESS task is still closed only by `update`, one step the observation now names.

**Why revision 4, and what it costs.** In the default live run at `3c03287` (session `3e4b7210`, delegation-swarm, finding F9) the
coordinator's `update verify101 IN_PROGRESS` (`#26`) was refused naming impl101, an item the run had marked at its delegation
(`#7`) and whose child had ended about 2.5 s before; the coordinator then closed its three delegated items one by one (`#27` to
`#29`), four calls and about 7 s, before delegating the verifier. The same refusal stood in the two default packs before it
(requirements `#50`, crlf `#22`), against OQ-249's target of 0, and it was revision 2's accepted cost. An item a child served is
that child's work, not the coordinator's own active task, whether or not the child still runs. What it costs:
- a stale active row the Agent plan strip can show from a child's end until the coordinator closes its item;
- one more narrowing of REQ-TOOLS-145, whose one-active rule now counts only the owner's unserved tasks;
- fin38's limit (revision 3's first execution) now reaches the count too: the served set is the current iteration's ledger, so
  after a REQ-ORCH-075 re-queue or a resume an earlier iteration's served item still counts against the next mark.

> **Narrows:** REQ-TOOLS-145, REQ-TOOLS-146

*Raised by the owner, 2026-10-06, ruling OQ-163 as recommended; logged as [R-071](requests.md#r-071). Revision 2 ruled under the
owner's delegation, [R-072](requests.md#r-072), from OQ-249 (the consortium's question P3, the final live runs' findings P3 and
D7). Revision 3 ruled under the same delegation from [OQ-255](../architecture/open-questions.md#oq-255) (the consortium's
question RC1, from revision 7's first execution). Revision 4 ruled under the same delegation from
[OQ-333](../architecture/open-questions.md#oq-333) (finding F9 of fin46's final acceptance, the default live run at `3c03287`).*

> **First execution, 2026-10-06, built under [R-071](requests.md#r-071) (fin21):** the rule held as written. The case it
> names is exactly the second of `todo`'s two `replace` checks (`packages/agent-tools/src/tools/todo.ts`): the first
> answers REQ-TOOLS-146's case whenever a protected active task exists and the list marks another, so the second meets
> only a list whose own tasks are the two. **What was measured.** One case in `tools.test.ts`, red on the code before the
> build: the live run's list refused in the new sentence with nothing stored and no id named, REQ-TOOLS-146's case still
> answered in REQ-TOOLS-145's sentence, and the list accepted when re-sent with one task in progress. **What was not
> measured.** No live run has met the case since; `pnpm live-run`'s `frictions` and `duress` scenarios now check that no
> `todo` call was sent to an id a refusal named and never stored (`lib/tool-frictions.mjs`). *fin23, 2026-10-06:* since
> `760394c` that check runs no longer in those two scenarios but once, at the run's end, over every session the run keeps
> (`checkToolRecord` in `apps/desktop/scripts/live-run.mjs`, over `runWideReadings`), naming each finding by its session
> and ordinal:
> [`the-live-runs-tool-friction-checks-read-two-scenarios-and-miss-a-refused-call-whose-arguments-were-cut.md`](../defects/fixed/the-live-runs-tool-friction-checks-read-two-scenarios-and-miss-a-refused-call-whose-arguments-were-cut.md).
> The note is repaired:
> [`a-rejected-todo-replace-names-an-active-task-it-never-stored.md`](../defects/fixed/a-rejected-todo-replace-names-an-active-task-it-never-stored.md).
> The row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).

> **First live execution, 2026-10-07 (the final default live run at `a68f121`, pack `2026-10-07T06-48-50-123Z`):** the case
> met a real model for the first time, in the edit session: its coordinator's `todo replace` (`#5`) marked both parallel
> children's items `IN_PROGRESS` and was refused in this directive's sentence ("…marks 2 tasks IN_PROGRESS ('Add
> clearCompleted to src/todos.js', 'Add tests for clearCompleted'), so the replace was rejected and nothing was saved"),
> naming no id. The wording held: the next accepted write (`#10`) re-listed the plan with one task in progress, and no later
> call in the pack targeted an id a refusal never stored (`checkToolRecord`'s run-wide reading, PASS). **Found**, as the
> pack's finding P3 and not against this directive's text: REQ-TOOLS-145's single `IN_PROGRESS` itself, which this directive
> narrows only in its message, cannot record two parallel delegations as both in progress, so the plan recorded the running
> tests child's item `PENDING` (`#14`, refused again). The row is in
> [`../architecture/first-executions.md`](../architecture/first-executions.md).

> **First execution of revision 2, 2026-10-13, ruled under [R-072](requests.md#r-072) ([OQ-249](../architecture/open-questions.md#oq-249)),
> built by fin33 (`fin33-delegation-targets-and-plan`):** built as written, and the text met the code in two places.
>
> - **The held set is read at each call, through the run.** `todoTool` takes `TodoToolOptions.held`
>   (`packages/agent-tools/src/tools/todo.ts`), which the run host fills from `ToolPortContext.heldTodoItems`, and both
>   `toolsFor` closures in `packages/engine/src/sessions.ts` answer it from `IterationChildren.heldTodoItems`: the `todo_item`
>   of every non-terminal child the caller owns, of any persona, every root's children one plan as `owns` reads them. A
>   read-only child naming an item holds it here, where revision 6's held-item refusal counts implementation children only:
>   the bound is about the plan's owner, not the child's tools.
> - **The hint needs the caller's resolved set, known only after the port's one resolution.** `delegates` is read lazily, so
>   the sentence carries the hint exactly when the agent's callable set holds `delegate`.
>
> With no held set the tool behaves exactly as before (the pre-revision cases in `tools.test.ts` pass unchanged). The
> falsified single-active reason is kept beside its replacement in the tool's description comment.
>
> **What was measured.** Five cases in `packages/agent-tools/src/tools/tools.test.ts` ("a task a running delegation holds"),
> each red on the code before the build: two held tasks marked beside the agent's own; a second unheld mark refused in
> REQ-TOOLS-145's sentence naming the unheld task; a `replace` that marks nothing accepted while ended holders' items stay
> IN_PROGRESS, and a fourth mark then refused naming the first unheld one; this directive's sentence counting unheld tasks only,
> with the hint for a `delegate` holder alone; the description. `apps/desktop/src/run-host/tools.test.ts` drives the port with
> two parallel delegations and the coordinator's own mark beside them. **What was not measured.** No live run: the next default
> run's edit session should show no refused `update` like `#14` and both parallel items active, and the harness's
> `heldItemReading` (`apps/desktop/scripts/lib/coordinator-todo.mjs`) counts items read PENDING while held and single-active
> refusals (target 0). The row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).

> **First execution of revision 3, 2026-10-13, ruled under [R-072](requests.md#r-072) ([OQ-255](../architecture/open-questions.md#oq-255)),
> built by fin37 (`fin37-replace-closes-delegated`):** built as written, and the text met the code in three places.
>
> - **The served set is a second read through the run, beside the held one.** `todoTool` takes `TodoToolOptions.served`
>   (`packages/agent-tools/src/tools/todo.ts`), which the run host fills from `ToolPortContext.servedTodoItems`; both `toolsFor`
>   closures in `packages/engine/src/sessions.ts` answer it from `IterationChildren.servedTodoItems`, the same children
>   `heldTodoItems` reads without its non-terminal filter. With no served set the tool restores every IN_PROGRESS task as before.
> - **A close is decided before the REQ-TOOLS-146 rejection, not after it.** The tasks the list closes (`closes`) are left out
>   of the protected active task, so a list that closes an ended item and marks another is accepted, which the ruling added to
>   B's text; the resulting-list count needed nothing, since a closed task is no longer IN_PROGRESS.
> - **"Incoming state differed" needs a reading for a task sent with no state.** The schema lets a task carry no `state`; such a
>   task, like an omitted one, differs from nothing and is not named. The four reasons are chosen in this order: finished work,
>   a running holder, an active task sent PENDING, the agent's own active task sent closed (`keptReason`).
>
> **What was measured.** Eight cases in `packages/agent-tools/src/tools/tools.test.ts` ("a replace after a delegated child has
> ended"), seven red on the code before (the eighth, nothing named when nothing differed, held of both): the ended holders'
> items closed COMPLETED and ABANDONED; a whole-list close keeping and naming the agent's own active task; a held item kept and
> named, then closed once its child ended; a served-and-ended item and a finished task sent PENDING, named in list order; a close
> and a mark in one list accepted while the agent's own active task still bars one; no served set; the description.
> `apps/desktop/src/run-host/tools.test.ts` drives the port with two parallel delegations: a close while one child runs keeps and
> names its item, and once both ended one whole-list COMPLETED `replace` stores the plan closed (red before).
> `children/children.test.ts` pins the served set through the `toolsFor` closures, the ended children's items included (red
> before). In the built app, `pnpm mission-proof` item 1e (2026-10-13, load 2.2 at the start and 3.9 at the end on 4 CPUs): the
> scripted coordinator waits for alpha and delta to end and closes with one `replace` sending both items COMPLETED
> (`donereplace`); both `todo` calls were `ok`, the close answered "Replaced the todo list: 1 phase, 2 tasks." with nothing kept,
> the stored plan ends COMPLETED, and the run completed in one iteration with no PD-ORCH-015 correction logged. **What was not
> measured.** No live run: the next default run's edit session, when its coordinator closes with a `replace` after its children
> ended, should store the delegated items COMPLETED with no correction and no "items not done" `system` row; a `replace` sending
> COMPLETED for a held item or the coordinator's own active item should name it and be followed by an `update`. The harness's
> `heldItemReading` counts `restoredOverClose` (target 0) and `namedRestores` (a NOTE). The note is repaired:
> [`a-todo-replace-cannot-close-a-delegated-item-and-hides-the-restore.md`](../defects/fixed/a-todo-replace-cannot-close-a-delegated-item-and-hides-the-restore.md).
> **A known limit, written down by fin38 (fin37's review):** the served set has the held set's scope, this iteration's ledger
> (`IterationChildren.servedTodoItems` reads `ChildLedger.all()`, the children of the current iteration). After a REQ-ORCH-075
> re-queue or in a resumed session, an item an earlier iteration's child served is not served, so a `replace` sending it
> COMPLETED restores it IN_PROGRESS and names it as the agent's own active task, to be closed with `update`. That is the
> revision-2 behaviour, safe and named, not the close revision 3 allows; no live run has met it.
> The row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).

> **Reported back 2026-10-13 (fin41), from the live packs at `552d346` (default and duress) and `0bc3eee`**.
>
> - **Revision 2: PASS in all three packs.** Parallel delegations left their items IN_PROGRESS together with no single-active
>   refusal (at `552d346` edit `#8` and resume `#3`, two each, and three in the duress run after `#17`; at `0bc3eee` edit,
>   resume and requirements, two each), and the harness counted 0 `replace` calls refused for marking more than one task in
>   progress. `a68f121`'s P3 (2 refused `todo` calls and a refused `delegate`, about 19.5 s) did not recur.
> - **The restore revision 3 repairs was latent at `552d346`:** 6 `replace` calls across both packs, each the opening write of
>   a plan, every close an `update`; 0 restored COMPLETED items, 0 s.
> - **Revision 3: NOT REACHED at `0bc3eee`.** Its 5 `replace` calls were again opening writes and every close an `update`;
>   `restoredOverClose` read 0 and `namedRestores` named none, neither discriminating. The next default run whose coordinator
>   closes with a `replace` after its children end is still the measure.
> - *Since fin41 (item N65) the default run asks for it:* the `edit` scenario's prompt tells its coordinator to close the plan with
>   ONE `replace` sending both tasks COMPLETED once both children have reported, `heldItemReading` counts the closes asked
>   (`closes`), and a run with none prints a NOTE that revision 3 was unasked instead of the PASS `0bc3eee` printed over nothing
>   ([`the-live-runs-closing-replace-check-passes-with-no-closing-replace.md`](../defects/fixed/the-live-runs-closing-replace-check-passes-with-no-closing-replace.md)).
>
> Evidence:
> [`live-552d346-default-autopsy.md`](../architecture/live-runs/live-552d346-default-autopsy.md),
> [`live-552d346-duress-autopsy.md`](../architecture/live-runs/live-552d346-duress-autopsy.md),
> [`live-0bc3eee-default-autopsy.md`](../architecture/live-runs/live-0bc3eee-default-autopsy.md).
> The rows are in [`../architecture/first-executions.md`](../architecture/first-executions.md).

> **First execution of revision 4, 2026-10-15, ruled under [R-072](requests.md#r-072) ([OQ-333](../architecture/open-questions.md#oq-333)),
> built by fin47 (`fin47-classifier-and-todo`):** built as written, and the text met the code in two places.
>
> - **One exempt set, held inside served.** `todoTool` computes `exemptNow`, the union of the served and held reads
>   (`packages/agent-tools/src/tools/todo.ts`), and every single-active read takes it: `TodoList.active`, `add_task`'s and
>   `update`'s checks, and in `replace` `newlyMarked`, `activeProtected` and `actives`. The union keeps a caller that passes `held`
>   alone exactly where revision 2 left it, so "with no served set the tool behaves as before" needs no branch. `closes` and
>   `keptReason` still read the held set alone, as revision 3 states.
> - **The limit reaches the count.** The served set is the iteration's ledger (`IterationChildren.servedTodoItems`), so an earlier
>   iteration's served item counts again after a REQ-ORCH-075 re-queue or a resume; a case pins it rather than leaving it to a
>   reader.
>
> **What was measured.** `packages/agent-tools/src/tools/tools.test.ts` ("a task a delegation has served", four cases): the
> coordinator's `update` and `add_task` beside three served-and-ended items, a second unserved mark still refused naming the
> unserved task, and a `replace` marking the next task with a served-and-ended item kept IN_PROGRESS, each red on the code before;
> the fourth pins the limit and holds on both. The description's case changed with its sentence (red before).
> `apps/desktop/src/run-host/tools.test.ts` replays the swarm shape through the port — three delegations naming `impl101`,
> `test101` and `doc101` marked, all three ended, then `update verify101 IN_PROGRESS` answers `ok` (red before: "Active task:
> impl101"). In the built app, `pnpm mission-proof` (2026-10-15, every item, exit 0, load 1.8 to 2.7 on 4 CPUs) still passes item 1e:
> the scripted coordinator's two `todo` calls answer `ok`, its closing `replace` stores both items COMPLETED and names nothing kept.
> No proof drives the resume line: item 1e closes its items before the run resumes it. **What was not measured.** No live run: the
> next default run's coordinating sessions (delegation-swarm, requirements, crlf) should count 0 `todo` calls refused under
> REQ-TOOLS-145 or this directive and record no `tool_error` issue from that cause.
> The row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).

---

<a id="pd-mcp-001"></a>

### PD-MCP-001 — the bundled code-intelligence server's manual tool is described in the product's own words

The binding manifest of REQ-MCP-116 SHALL carry, beside the runtime's identifiers, a description **written by the
product** for the bundled code-intelligence runtime's usage-instruction tool (the tool REQ-MCP-015 places in the READ tier
as "usage-instruction retrieval"), keyed by that capability and not by the runtime's name. The text SHALL be neutral: it
says what the tool returns and that the server's other tools work without it, and it SHALL NOT instruct the agent to call
the tool first or at all.

Wherever the product hands that tool's description to a model — the persona's MCP section of REQ-MCP-101 and the tool's
definition in the model's tool listing — the product-written text SHALL be used in place of the description the server
reports, for the server whose entry launches the bundled runtime through the reserved command token, whatever the tool is
renamed to (REQ-MCP-005). Every other tool of that server, and every tool of every other server, keeps its server's own
description as REQ-MCP-101 states.

Everything else stands: the tool stays in the READ tier and in every built-in grant REQ-MCP-014 and REQ-MCP-015 give it; it is
listed, granted, renamed, disabled and called exactly as before; and REQ-MCP-101's rendering — order, formatting, the
description rule for an empty string — is unchanged.

**Why, and what it costs.** The runtime describes the tool imperatively ("IMPORTANT: If you have not yet read the manual,
call this tool immediately …"), every agent's prompt carried it word for word, and agents obeyed: in the live run of
2026-09-29 it was called three times and again in the duress run, each call returning 7.1 to 7.5 thousand characters that
every later request of that agent re-sent — about 60,000 input tokens over 33 requests in one run — and each agent's first
step went to a manual about a tool it might not need. Agents that need the manual can still fetch it. What is given up: the
model no longer reads the runtime's own account of when the manual is worth reading, and a later runtime release that
rewords its description is not seen until the product's text is revisited.

> **Narrows:** REQ-MCP-101
> **Extends:** REQ-MCP-116

*Raised by the owner, 2026-10-06, ruling OQ-115 as recommended; logged as [R-071](requests.md#r-071).*

> **First execution, 2026-10-06, built under [R-071](requests.md#r-071) (fin21):** the rule held as written. The text lives in
> the manifest's generator (`apps/desktop/scripts/code-intelligence/manifest.mjs`, `PRODUCT_DESCRIPTIONS`), which emits it as
> `productDescriptions` and refuses one that names no capability of the tiers; the module was regenerated against the bundled
> runtime on this host (serena-agent 1.7.0, Python 3.13.15, 24 tools listed) and `--check` compares it byte for byte as before.
> `filterServerTools` (`packages/config/src/mcp/persona.ts`) is where the description is put, for an entry whose command is the
> reserved token — the test REQ-MCP-102 already uses to tell the bundled server — matched on the reported name's candidate
> spellings, so the persona surface, the prompt section, the executor's definition and the narrowing after a list update all
> carry it. **What was measured.** Two cases in `config/src/mcp/mcp.test.ts`, the surface case red without the change: the
> manifest's text for the capability and none for another tool, the bundled server's usage tool described anew and its other
> tool not, the same name on a user's server keeping its own words, the section rendering the product's text and the
> imperative only under the other server. `code-intel-proof`'s discovery step now asserts the section against the built app.
> **What was not measured.** A live run against a real model; the next one shows whether agents still open with the manual.
> The row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).

> **Reported back 2026-10-13 (fin41), from the live packs at `552d346` (default and duress) and `0bc3eee`**: whether agents still open
> with the manual. They do not. The usage-instruction tool (`initial_instructions`) was offered with the product's text in every
> agent request of the three packs, 144 of 144, 188 of 188 and 188 of 188, and called **0 times** in any of them. The MCP calls
> made were memory and diagnostics tools only: `list_memories` ×4 and `get_diagnostics_for_file` ×1 at `552d346`'s default pack;
> `list_memories` ×7, `read_memory` ×3, `write_memory` ×3 and `edit_memory` ×1 in its duress pack; `get_diagnostics_for_file`
> ×3, `list_memories` ×4, `read_memory` ×1 and `write_memory` ×1 at `0bc3eee`. Held as written. Evidence:
> [`live-552d346-default-autopsy.md`](../architecture/live-runs/live-552d346-default-autopsy.md),
> [`live-552d346-duress-autopsy.md`](../architecture/live-runs/live-552d346-duress-autopsy.md),
> [`live-0bc3eee-default-autopsy.md`](../architecture/live-runs/live-0bc3eee-default-autopsy.md).
> The rows are in [`../architecture/first-executions.md`](../architecture/first-executions.md).

---

<a id="pd-mcp-002"></a>

### PD-MCP-002 — every root an isolated run hands its MCP servers is the run's own tree

For a run whose execution root is an isolated working tree (REQ-WORKSPACE-050, REQ-GIT-140), "the workspace root" in the
following SHALL be read as **that tree's root**, as REQ-MCP-034 already reads it for the project path it appends:

- REQ-MCP-035's filesystem-server path fill-in: the path appended when a filesystem server is given none, and the path
  substituted for a missing one under the name `filesystem`;
- REQ-MCP-043's default `cwd` of a stdio server whose entry configures none, which REQ-MCP-050's discovery uses as well;
- REQ-MCP-070's `lsp_init` call: `{"root": "<the tree's root>"}` for a connection established by that run.

Only what the product filled in moves. A path the user configured — the workspace root itself included — a configured `cwd`,
and a project-selection argument already present are left exactly as configured. A run in the workspace itself is unchanged,
and the loaded configuration is never rewritten: the tree's root is a view of it taken for the run.

**Why, and what it costs.** A run in an isolated tree promises that its work stays in the tree. REQ-MCP-034 kept that promise
for the bundled code-intelligence server, but a filesystem server or a language server named `lsp` that a user adds would
otherwise read and write the main checkout from a run that promises isolation; no shipped default uses these, so nothing a
default run launches changes. What is given up: a user who wanted such a server to see the main checkout from an isolated
run now has to name that path in its configuration. An `lsp` connection is still the session's, so in a session whose agents
work in different trees the first to connect decides the root.

> **Narrows:** REQ-MCP-035, REQ-MCP-043, REQ-MCP-050, REQ-MCP-070

*Raised by the owner, 2026-10-06, ruling OQ-194 as recommended; logged as [R-071](requests.md#r-071).*

> **First execution, 2026-10-06, built under [R-071](requests.md#r-071) (fin21):** the rule held as written. It extends the
> rebinding REQ-MCP-034 already had (`mcpConfigurationForExecutionRoot`, `packages/config/src/mcp/index.ts`), read the same
> exact way: the fill-in moves where the resolved arguments after a filesystem package are the workspace root alone and the
> configured ones did not name it, the `cwd` where the entry configures none. The default `cwd` moving also moves a runtime
> launched with the project-from-working-directory option onto the tree, which REQ-MCP-034's clause already asks for. The
> `lsp_init` root needed a seam: `SessionConnections.connect` (`packages/mcp/src/sessions.ts`) takes the root for the connection
> it establishes, `McpHost.executorsFor` passes the root it is handed, and the tool port now hands it the execution root where
> it handed the workspace root (OQ-194's literal reading, kept beside its replacement in `run-host/tools.ts`). **What was
> measured.** `config/src/mcp/mcp.test.ts` (a new case over nine servers, and two older cases corrected from the literal
> reading), `mcp/src/mcp.test.ts` (a real fixture server's `lsp_init` given the tree's root) and `run-host/tools.test.ts` (the
> port's executors handed the worktree), red without the change; and `injection-proof`'s isolated launch, which now carries two
> fixture servers a user might add and reads the root each was handed. **What was not measured.** A session whose agents work
> in different trees, where the first `lsp` connection decides the root for all. The row is in
> [`../architecture/first-executions.md`](../architecture/first-executions.md).
>
> **Reported back 2026-10-13 (fin42, item N57): not drivable as built.** Every run of a session, and every agent of each run,
> works in the session's one recorded execution root: a session's first run fixes it (`sessions.start`, the worktree it is
> given), and every later run reads it back (`effectiveRootOf`, `packages/engine/src/sessions.ts`, at each `setupFor`). No child
> is given a tree of its own (`delegate` takes no worktree). So no session's agents work in different trees, and the case this
> paragraph names cannot be built by a proof or a live run until something gives one session two trees. It is recorded as not
> measurable, not as measured.

---

<a id="pd-provider-001"></a>

### PD-PROVIDER-001 — the hosted connection mode is spelt `hosted-cloud`, and a provider's shared quota is a number it declares

**The spelling.** The hosted connection mode SHALL be spelt `hosted-cloud` wherever the product names it: the
catalogue's connection mode (REQ-PROVIDER-002), the destination sentence REQ-CONFIG-370 composes for it, and the
vocabulary table of domain 15, whose `rotaris-cloud` names the same mode. No surface or record SHALL carry a second
spelling. REQ-CONFIG-370's sentence for the mode, its fields and its fallbacks are otherwise unchanged.

**The quota cap.** Whether a provider's quota is consumed by concurrent calls against one account SHALL be declared on
that provider's catalogue entry as a **number**: the cap of concurrent calls that every model of the provider carries
without the user configuring anything. A provider that declares none leaves its models uncapped. REQ-MONITOR-021's
uniform figure of 2 no longer governs; the rest of that requirement does — a cap the user configures for a model replaces
the declared one entirely, and the cap in force stays inspectable. The numbers this product declares are REQ-CONFIG-095's:
`deepseek` 3 and `claude-code` 2.

**As built.** The catalogue spells the mode `hosted-cloud` (`packages/providers/src/catalogue.ts`), and the values in force
are the two numbers above, declared since 2026-10-06 (fin22) on the catalogue entries as `sharedQuotaCap` (`deepseek` 3,
`claude-code` 2, every other entry none). Main hands them to the run host at its handshake, and `modelCapInForce`
(`packages/config/src/sections/models.ts`) applies a model's stated `max_parallel`, else its provider's declared cap.
Until then they were held by configuration's provider-conditional default (`defaultMaxParallel`), a list of two provider
names, as recorded in
[`the-shared-quota-cap-is-a-list-of-provider-names-not-a-catalogue-property.md`](../defects/fixed/the-shared-quota-cap-is-a-list-of-provider-names-not-a-catalogue-property.md).

**Why, and what it costs.** OQ-6: REQ-PROVIDER-002 spells the mode `hosted-cloud` where REQ-CONFIG-370 spells it
`rotaris-cloud`, and REQ-CONFIG-095 gives one provider a cap of 3 where REQ-MONITOR-021 gives every declaring provider 2
and refuses to hold a list of names. The owner took the catalogue's spelling and a number per provider, which keeps both
caps the product applies today and lets a provider added later declare its own. What it costs: REQ-MONITOR-021's single
figure is gone, so the cap a provider imposes is read from its entry rather than known in advance.

> **Narrows:** REQ-CONFIG-370, REQ-MONITOR-021

*Raised by the owner, 2026-10-06; logged as [R-071](requests.md#r-071), the ruling of OQ-6.*

---

<a id="pd-config-002"></a>

### PD-CONFIG-002 — the Settings provider list shows every provider REQ-PROVIDER-140 lists

The provider list of the Settings Models category SHALL show a row for each provider REQ-PROVIDER-140 lists — the union
of the ids holding a stored credential, the built-in catalogue ids and the snapshot ids, each once, ordered by id —
whether or not it is authenticated. REQ-CONFIG-389's first sentence, "The provider list shows **no** built-in or
merely-referenced provider by default; a row appears only once a provider is authenticated", no longer governs. Its other
sentences still do: the managed-cloud provider's row carries its quick-start action in addition to the normal actions, and
a provider that a model slot references and REQ-PROVIDER-140's union does not hold, a deleted custom endpoint included,
causes no row.

**Why, and what it costs.** ESC-36: REQ-PROVIDER-140 and REQ-CONFIG-389 state disjoint populations for one list. The build
follows REQ-PROVIDER-140 (`packages/providers/src/signin.ts` `list()`, the renderer's providers card), the mockup's row
for an unauthenticated GitHub Copilot shows the same, and Settings is the one place a user starts authentication for any
provider. The owner kept the built behaviour. What it costs: the list is longer, and an unauthenticated built-in reads
"Not authenticated" rather than being absent.

> **Narrows:** REQ-CONFIG-389

*Raised by the owner, 2026-10-06; logged as [R-071](requests.md#r-071), the ruling of ESC-36.*

---

<a id="pd-config-003"></a>

### PD-CONFIG-003 — the Runtime category's two timeouts: the per-agent timeout as a third delegation limit, in minutes, and the improvement analysis timeout, in seconds

*Revision 2 (2026-10-07, R-072, the ruling of OQ-223) — the heading widens to name both of the Runtime category's timeouts,
and the clause marked "— revision 2" below is added; revision 1's text stands unchanged beside it. Revision 1's heading
was: "PD-CONFIG-003 — the Runtime category offers the per-agent timeout as a third delegation limit, in minutes", and its
disposition: "Narrows: REQ-CONFIG-322, REQ-CONFIG-256, REQ-CONFIG-417 / Extends: REQ-CONFIG-263".*

*Revision 3 (2026-10-07, R-072, the ruling of OQ-234) — a delegated agent cut off at its per-agent timeout names this control
where its failure shows. The clause marked "— revision 3" below is added; the heading stays as revision 2 left it, and the
text of revisions 1 and 2 stands unchanged beside it.*

*Revision 4 (2026-10-13, [R-072](requests.md#r-072), the ruling of [OQ-253](../architecture/open-questions.md#oq-253)) — the
`<limit>` bullet of revision 3 states both singular forms; revision 3's bullet is quoted beneath it, and every other clause
stands unchanged.*

Settings › Runtime › **Delegation limits** SHALL show a third numeric control, "Per-agent timeout", after the depth cap and
the fan-out limit: whole minutes with a "minutes" suffix (REQ-CONFIG-325's pattern), clamped at the widget to **1–240**. It
is REQ-MONITOR-286's per-agent timeout, initialised from the effective `runtime.child_timeout` (REQ-CONFIG-113, in seconds)
divided by 60, so a default install reads **20**. A user's entry is stored as the minutes times 60 seconds, committed by Save
into the workspace file (REQ-CONFIG-256), and laid on the next run start by Tier B whether or not it is saved (REQ-CONFIG-262,
REQ-CONFIG-263). A stored value the control cannot express — one that is not a whole minute, or lies outside 60–14,400
seconds — is shown rounded and clamped for display only, a line beneath it states the stored seconds, and the value is
never rewritten until the user changes the field (REQ-CONFIG-446, REQ-CONFIG-419). The control's hint says the limit bounds
each **delegated** agent, that the step in flight gets up to 30 s more (PD-ORCH-004 revision 5), that an agent still making
progress hands its work back to its parent, and that the value applies to runs started from now. The Overview caps line is
unchanged (REQ-MONITOR-169). PD-ORCH-004 is not revised: its default and its limit stay as they are; this directive only
lets the user move the limit.

**The improvement analysis timeout — revision 2.** Settings › Runtime › **Runtime policy** SHALL show "Improvement analysis
timeout" directly after the "Improvement loop" toggle: whole seconds with a "seconds" suffix (REQ-CONFIG-325's pattern),
clamped at the widget to **10–600**, initialised from the effective `runtime.improvement_collector_timeout` (REQ-CONFIG-118,
REQ-LIBRARY-039), so a default install reads **60**. It is committed by Save into the workspace file (REQ-CONFIG-256) and laid
on the next run start by Tier B whether saved or not (REQ-CONFIG-262, REQ-CONFIG-263). A stored value outside 10–600 is shown
clamped, a line beneath states the stored seconds, and it is never rewritten until the field changes (REQ-CONFIG-446,
REQ-CONFIG-419). The hint says, in plain words, how long the background review of a finished run may take, that a longer
review ends with no proposals, that it never holds up the person's work, that it is used while the improvement loop is on,
and that it applies to runs started from now. A post-run analysis that reaches the limit SHALL say so in REQ-LIBRARY-124's
zero-proposal notice's detail, giving the limit in seconds and naming this control; that notice's title and its absence of an
action stay as they are (REQ-NOTIFY-100, REQ-LIBRARY-023). The desktop save's runtime keys SHALL be a closed list —
REQ-CONFIG-256's eight, `child_timeout`, `improvement_collector_timeout` and the six confinement and egress fields — that the
screen's runtime keys equal, and a save naming any other runtime key is refused.

**Where a cut-off agent shows — revision 3.** A delegated agent whose stored report carries REQ-ORCH-088's `timeout` error
("Child timed out after <N>s") SHALL show:

- **On the rows.** On its delegation-tree row (REQ-MONITOR-040) and its Mission-table row, a "timed out" tag after its state.
- **The line.** In the inspector, directly under the meta line (REQ-MONITOR-052), and in its persona-window instance tab,
  directly under its state (REQ-MONITOR-069), one line: "Cut off at its per-agent timeout of <limit>[ while making progress].
  Settings › Runtime › Per-agent timeout sets this limit for runs started from now."
- **`<limit>`.** N, the limit the agent ran under, written "1 minute" or "<m> minutes" when N is a whole number of minutes,
  and "1 second" or "<N> seconds" otherwise *(— revision 4)*.

  > Revision 3 said, and no longer governs: "N, the limit the agent ran under, written '1 minute' or '<m> minutes' when N is a
  > whole number of minutes, and '<N> seconds' otherwise." — which wrote a one-second limit "1 seconds".
- **"while making progress".** It appears exactly when the report carries PD-ORCH-004's cut-off statement.
- **One wording.** The line is worded once, and its path segments are the labels the Settings screen renders.

The agent as presented carries the fact (REQ-MONITOR-044). Unchanged: the meta line's form and REQ-MONITOR-041's row tooltip;
REQ-ORCH-088's error and issue; PD-ORCH-004's statement and offer; OQ-217's Outcome line, the timeline, the report artifact and
the parent's tool results; no notice is raised; the default, the hard bound, the 30 s landing and the continuation rule
(PD-ORCH-004, R-048, R-071, OQ-214).

**As built.** `child_timeout` in `RuntimeViewSchema` (`packages/contracts/src/config.ts`) and the snapshot
(`packages/config/src/snapshot.ts`), `TIER_B_RUNTIME_KEYS` (`packages/config/src/tiers.ts`), `DesktopSave.runtime`
(`packages/config/src/writers.ts`, whose validation on assignment already refuses a value below 1, REQ-CONFIG-111);
`PendingSettings.runtime.child_timeout`, `timeoutMinutesForDisplay`, `timeoutSecondsFromInput` and `storedTimeoutNote`
(`packages/ui/src/settings/config-state.ts`); the `child-timeout` control in `packages/ui/src/settings/ConfigSettings.tsx`.

**Why, and what it costs.** OQ-218, ruled 2026-10-07 under the owner's delegation (R-072, advocate A followed). REQ-MONITOR-286
names three interface-level delegation controls and the build drew two: no surface showed the per-agent timeout, and the only
route to the limit both duress live runs met ("Child timed out after 1200s"; 66 % of the run behind it at `c2fdd6a`, 61.5 % at
`c2a9444`) was a YAML key in seconds — while the ruling that kept the 1200 s ceiling counts on that user being able to raise
it. REQ-CONFIG-322's "two numeric controls" faithfully describes the reference, so a third is a directive. What it costs: a
user can raise the limit so far (up to 4 h at the widget) that a looping child spends that long before it is stopped, and the
same limit bounds a parent's resume attempt and a wait; a user who lowers it to minutes sees most delegated work fail. The
240-minute ceiling is a chosen figure, twelve times the default, with no derivation behind it; a file may still state a
longer value, which the control shows clamped and keeps.

*Revision 2's why, and what it costs.* OQ-223, ruled 2026-10-07 under the owner's delegation (R-072, advocate A followed).
OQ-114's F4 timed six analyst calls on the owner's endpoint at 22 to 134 s, three past the 60 s default R-071 kept, and a
timed-out review read like an empty one; the bound that decides whether the analyst's chosen model finishes belongs beside
the toggle it qualifies, and two timeouts on one screen follow one rule (OQ-218). The control had been built with no record
tracing it, and it reached the file only because the save took any runtime key; the closed list is what would have caught
it. What it costs: a longer bound spends tokens, and it delays later analyses, which run one at a time (REQ-LIBRARY-123);
quitting still cancels an analysis in flight (REQ-LIBRARY-127), so a live run that quits within seconds is not helped; 10
and 600 are chosen figures (600 is ten times the default, about 4.5 times the slowest measured call); `retrospective_timeout`
and REQ-NOTIFY-100's other five bounds stay file-only; and the runtime policy card carries one field beyond REQ-CONFIG-323's
four toggles, which black-box conformance may note. R-071's 60 s default is not revised.

*Revision 3's why, and what it costs.* OQ-234, ruled 2026-10-07 under the owner's delegation (R-072, both advocates followed).
Finding D2 of the duress live run at `a68f121` (session `e6747bd0`): two testers, `bg_dcecf655` and its continuation
`bg_98fa54d7`, were cut off at 1200 s while making progress, and each row read `failed` with nothing else — the error went to
the parent, the issue record and the timeline, which no screen shows, and nothing named the control the ceiling rulings
(OQ-218, OQ-214) count on. Revision 2 set the rule for the other timeout a user can set: the surface reporting the timed-out
operation states the limit and names its control. What it costs: one field on the presented agent across the process boundary
(read from the stored report, so a resumed session shows it too), one tag and one line. A person may raise the limit for a
child that was looping; the line names the control without urging that, and says "while making progress" only where the
child was. The limit is read back from REQ-ORCH-088's error text, so one formatter writes it and one parser reads it, pinned
by a round trip. Black-box conformance will see a tag and a line the reference lacks.

*Revision 4's why, and what it costs.* OQ-253, ruled 2026-10-13 under the owner's delegation (R-072, TS1, both advocates
followed on substance). A one-second limit is reachable: the workspace file takes any integer of at least 1 second
(REQ-CONFIG-113; the widget offers 60 to 14,400). The minutes clause already spells "1 minute", so the template was meant to
agree in number, as R-071 read REQ-GIT-122's form; the build wrote "1 second" from revision 3's first execution on. REQ-ORCH-088's
"Child timed out after <N>s" is a different text, the one the limit is parsed back from, and is unchanged. What it costs:
nothing in code; a revision rather than a correction note, because the bullet is the directive's own normative text.

> **Narrows:** REQ-CONFIG-322, REQ-CONFIG-256, REQ-CONFIG-417, REQ-CONFIG-325
> **Extends:** REQ-CONFIG-263, REQ-CONFIG-323, REQ-LIBRARY-041, REQ-MONITOR-040, REQ-MONITOR-044, REQ-MONITOR-052, REQ-MONITOR-069

*Raised by the consortium under the owner's delegation, 2026-10-07; logged as [R-072](requests.md#r-072), the ruling of
[OQ-218](../architecture/open-questions.md) (T1). Cites, without changing them: REQ-MONITOR-286, REQ-CONFIG-113,
REQ-ORCH-088, REQ-CONFIG-446, REQ-NOTIFY-100 and PD-ORCH-004 revision 5. The ruling named REQ-CONFIG-256 and REQ-CONFIG-417
as extended, and this directive names them as narrowed: it changes their exact enumerations, which is what narrowing records
(acceptance finding F15).*

*Corrected 2026-10-13 under [OQ-237](../architecture/open-questions.md): the verb follows that change and was never forced;
`PD-WORKSPACE-002` now narrows both as well, in the disjoint case of the instruction files. The reason first given here no
longer is one:* "both are already extended by PD-WORKSPACE-002 and the symbol generator admits one directive per verb, so
this directive names them as narrowed … (found while building)."


*Revision 2 raised by the consortium under the owner's delegation, 2026-10-07; logged as [R-072](requests.md#r-072), the
ruling of [OQ-223](../architecture/open-questions.md) (IT1). Cites, without changing them: REQ-CONFIG-118, REQ-LIBRARY-039,
REQ-LIBRARY-023, REQ-LIBRARY-124, REQ-NOTIFY-100, REQ-CONFIG-446, REQ-CONFIG-419 and OQ-114's kept 60 s.*

*Revision 3 raised by the consortium under the owner's delegation, 2026-10-07; logged as [R-072](requests.md#r-072), the
ruling of [OQ-234](../architecture/open-questions.md) (CN1), the question the D2 ruling raised. Cites, without changing them:
REQ-ORCH-088, PD-ORCH-004 revisions 1 to 5, REQ-CONFIG-113, REQ-MONITOR-041, REQ-MONITOR-285, REQ-MONITOR-286, REQ-NOTIFY-092,
REQ-NOTIFY-100, REQ-NOTIFY-261, OQ-217 and revision 2's notice detail.*

*Revision 4 raised by the consortium under the owner's delegation, 2026-10-13; logged as [R-072](requests.md#r-072), the
ruling of [OQ-253](../architecture/open-questions.md#oq-253) (TS1), from revision 3's first execution. Cites, without changing
them: REQ-ORCH-088, REQ-CONFIG-113 and REQ-MONITOR-286.*

*Ruled 2026-10-14 under [OQ-301](../architecture/open-questions.md#oq-301) ([R-072](requests.md#r-072)), with no revision:
"until the user changes the field" and "until the field changes" mean until the person types or steps a value into the field,
an entry equal to the value shown included — that entry is "a user's entry", replaces the pending value, marks the form dirty
when it differs from the saved value, and is written by Save. Opening, repopulating, focusing or leaving the field without
typing changes nothing, and the stored value survives all of them. Revisions 1 to 4 keep their text.*

> **First execution, 2026-10-07, built under [R-072](requests.md#r-072):** the directive held as written. **What was
> measured.** `settings/child-timeout.test.ts` (the minutes and seconds both ways, the stored-value line, a stored 1250 s and
> 36000 s kept and unsaved, no change on a repopulation, the save carrying `child_timeout` only after an edit, the live state
> carrying it, and the third control drawn at 20 and at 21 with the stored line), `writers.test.ts` (the save writes 2700 and
> refuses 0 before touching the file; a live 2700 s reaches the resolved runtime) and `snapshot.test.ts` (a stated 1250 reaches
> the view; 1200 by default), each red on the source before. Driven in the built app (`pnpm app:drive`): a default install's
> Runtime category read "Per-agent timeout 20 minutes", the field 66 px wide like the depth cap's; 45 typed and saved wrote
> `child_timeout: 2700` into the workspace file, and the next run start logged `child_timeout=2700 s`; a workspace stating 1250
> read 21 with "Stored as 1250 seconds; kept until you change this field." and the save bar clean. **What was not measured.**
> A run started with an unsaved value (the unsaved-settings guard holds the person in Settings; the Tier B overlay and the
> live state are pinned by unit cases), and a delegated child running past 20 minutes (the orchestrator's live run; since
> OQ-214's second ruling, 2026-10-07, the duress live harness sets this control to 45 minutes for its launch, so the next
> duress live run is its measurement — `child_timeout=2700 s` in its `app.log`). The row
> is in [`../architecture/first-executions.md`](../architecture/first-executions.md).
>
> **Revision 2's first execution, 2026-10-07, built under [R-072](requests.md#r-072) (fin29):** the revision held as
> written, and its widget clamp needed one more rule. **Found:** the control as first built took every keystroke through
> the clamp, so `120` typed into a cleared field became `10`, then `102`, then `600`; it now holds the text as a draft until it
> is a whole number within 10–600 or the field loses focus (`improvementTimeoutEdit`). The same fault in the category's other
> number fields was recorded, not repaired, then; since fin34 (2026-10-13) every Runtime number field, the per-agent timeout
> included, holds the same draft (`ClampedNumberField`, `clampedNumberEdit`)
> ([`a-settings-number-field-clamps-every-keystroke-so-some-values-cannot-be-typed.md`](../defects/fixed/a-settings-number-field-clamps-every-keystroke-so-some-values-cannot-be-typed.md)).
> **As built.** `DESKTOP_SAVE_RUNTIME_KEYS` and the closed `DesktopSaveSchema.runtime` (`packages/contracts/src/config.ts`),
> `DesktopSave.runtime` typed from it (`packages/config/src/writers.ts`), `improvement_collector_timeout` in
> `TIER_B_RUNTIME_KEYS` (`packages/config/src/tiers.ts`), the helpers in `packages/ui/src/settings/config-state.ts`, the
> `improvement-timeout` control in `packages/ui/src/settings/ConfigSettings.tsx`, `zeroProposalDetail`
> (`apps/desktop/src/main/improvement-notice.ts`), and the run start's configuration line now naming the resolved
> `improvement_collector_timeout` (`apps/desktop/src/run-host/configuration.ts`). **What was measured.**
> `settings/improvement-timeout.test.ts`, `writers.test.ts`'s three revision-2 cases, `contracts.test.ts`'s closed-list case
> and `improvement-notice.test.ts`, red on the source before except the save's write; driven (`pnpm app:drive`): 60 by
> default after the toggle, 120 typed and saved into the workspace file and resolved at the next run start, a stated 900 read
> 600 with its stored line and the save bar clean. **What was not measured.** A run started on an unsaved value (the
> unsaved-settings guard holds the person in Settings, as for the per-agent timeout), a timed-out analysis's notice in the
> built app, and the `ui-review` pack (skipped: the control repeats the per-agent timeout's measured geometry, 66 px). The
> row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).
>
> **First live execution, the default case, 2026-10-07** (the final duress live run at `a68f121`, pack
> `2026-10-07T07-09-30-708Z` of the live worktree, session `e6747bd0`, the self-hosted endpoint, read by its autopsy): the
> directive held as written where its default governs. The run host's configuration line read `child_timeout=1200 s`
> (`duress/app.log` lines 13 and 24), and the two children that worked past twenty minutes were cut off at 1,200 s and landed
> inside the 30 s allowance: wave3 (`wave3-verify-all`) at the ceiling +4.25 s and its continuation wave3b at +0.44 s, each with
> its timeout issue at `error` and its report's cut-off statement. **NOT REACHED:** the control itself — the live harness never
> sets it and no launch captured Settings — so a person raising the limit, the relief the directive offers, has not run
> against a real model. The row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).
>
> **Revision 3's first execution, 2026-10-07, built under [R-072](requests.md#r-072) (fin33):** the revision held as written,
> and the drawing needed one rule the clause leaves to the design. **Found:** "after its state" read as beside it squeezed the
> rows — in the built app (1440 × 900, load about 15 on 4 CPUs) the tag beside `failed · 1m 7s` cut the Workspace sidebar
> row's persona column from 112 px to 35 px, breaking "coding-agent" over two lines (row 44 → 61 px), and widened the Mission
> table's state cell by 70 px, so the card scrolled 14 px sideways; and the inspector broke "Per-agent" from "timeout" at the
> hyphen. The tag now takes a line of its own under the state (row 50 px, the persona 112 px and one line; the state cell
> 78 px, the card 910 of 910 px) and the control's path is kept on one line (213 px). The same squeeze under the stalled badge,
> which shares the slot, is recorded, not repaired
> ([`the-stalled-tag-beside-a-tree-rows-state-can-squeeze-the-persona-onto-two-lines.md`](../defects/fixed/the-stalled-tag-beside-a-tree-rows-state-can-squeeze-the-persona-onto-two-lines.md));
> repaired 2026-10-13 (fin35) the same way, the stalled tag on a line of its own.
> The limit is written "<N> seconds" except that one second reads "1 second", the way "1 minute" does — since revision 4
> (2026-10-13, [OQ-253](../architecture/open-questions.md#oq-253)) the directive's own text. **As built.**
> `childTimedOutMessage` and `timedOutOf` (`packages/engine/src/children/cut-off.ts`), `AgentRecord.timedOut`
> (`packages/contracts/src/children.ts`) filled by `toAgentRecord` (`packages/engine/src/sessions.ts`), `TIMED_OUT_TAG`,
> `timeoutLimitText`, `perAgentTimeoutPath` and `timeoutLine` (`packages/ui/src/agents.ts`) over `RUNTIME_CATEGORY_LABEL` and
> `PER_AGENT_TIMEOUT_LABEL` (`packages/ui/src/settings/config-state.ts`, which Settings renders), `TimeoutLine.tsx`, and the
> four surfaces (`AgentTree.tsx`, `AgentTable.tsx`, `Inspector.tsx`, `PersonaWindow.tsx`). **What was measured.**
> `cut-off.test.ts`, `activity.test.ts`, `children.test.ts`'s two cut-off cases and `agent-timeout.test.ts`, red on the source
> before; `pnpm mission-proof` item 1d (a 3 s limit, so the seconds form): a child making progress read "Cut off at its
> per-agent timeout of 3 seconds while making progress. …" in the inspector under `failed · 10s · 1 tool call`, in its persona
> window under `failed`, and as the title of both Mission tags; a child that made no call read it without "while making
> progress"; driven (`pnpm app:drive`) at a 60 s limit, "1 minute while making progress", and at the 1000 px floor the sidebar
> row (295 px) and the inspector drawer (289 px) with no sideways scroll. **What was not measured.** A cut-off in a live run
> (the orchestrator's: D2's 45-minute duress run, where any child cut off should read "45 minutes"), and the `ui-review`
> pack (skipped: it renders no cut-off agent; the geometry above was read from the built app instead). The row is in
> [`../architecture/first-executions.md`](../architecture/first-executions.md).
>
> **Revision 4's first execution, 2026-10-13 (fin36):** the revision held as already built — nothing changed in code, test or
> proof. `timeoutLimitText` (`packages/ui/src/agents.ts`) writes the limit through `countNoun`, and
> `packages/ui/src/agent-timeout.test.ts` pins `timeoutLimitText(1)` as "1 second" beside "1 minute" and the plural forms; that
> file was run again on this branch, green. **What was not measured.** A cut-off at a one-second limit in the built app
> (`pnpm mission-proof` item 1d drives a 3 s limit). Repairs
> [`pd-config-003-writes-a-one-second-limit-as-1-seconds`](../defects/fixed/pd-config-003-writes-a-one-second-limit-as-1-seconds.md).
> The row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).
>
> **The control set through Settings before a run, in the built app, and the live scenario written, 2026-10-13 (fin42, the
> survey's N50):** the first live execution's NOT REACHED above — the control itself, which no harness had driven before a
> run, every launch writing `agents.yaml` itself (`withRuntimeKey`) — is reached in the built app. `pnpm continuation-proof`'s
> later-run scenario opens Settings › Runtime, selects and deletes the Per-agent timeout's text, types `1`, leaves the field
> and presses Save (`apps/desktop/scripts/lib/settings-runtime-field.mjs`): the bar read `Unsaved changes`, then `All changes
> saved`; the workspace file read `child_timeout: 60`; the next run start logged `child_timeout=60 s`. The same proof reads the
> Workspace sidebar's tag as it appears ("Cut off at its per-agent timeout of 3 seconds while making progress. …"), the reading
> the live scenario takes. **Found:** a value typed over a selection that already shows the same digits is no change to the
> field, so a stored 3 s shown clamped as `1` and overtyped `1` stayed 3 s with the bar clean; recorded, not repaired
> ([`a-runtime-number-field-ignores-a-value-typed-over-the-same-clamped-digits.md`](../defects/fixed/a-runtime-number-field-ignores-a-value-typed-over-the-same-clamped-digits.md)).
> *Repaired 2026-10-14 (fin43), reported here in place:* every clamped Runtime field now commits a typed value from the
> native input event rather than React's change event, which skips a value equal to the one the input holds, so the
> overtyped `1` is "a user's entry" stored as 60 seconds like any other (this directive's own words; the field's text was
> changed, and nothing outside an entry rewrites a value the control cannot express). The proof's helper no longer
> deletes the text before typing (`lib/settings-runtime-field.mjs`): the later-run scenario now types `1` over the stored
> 3 s shown as `1` and reads `Unsaved changes`, `All changes saved` and `child_timeout: 60`; against a build without the
> repair the same steps read `All changes saved` straight after the edit and failed.
> **Written, not run (the orchestrator's):** `live-run.mjs`'s opt-in `cutoff` scenario sets the control to
> `LIVE_RUN_CUTOFF_MIN` (default 1) minute(s) the same way and gives one child more work than that; it should show the
> control's Save storing `child_timeout: 60`, the run reading it, a child ended `failed` with "Child timed out after 60s" and
> the offer, and the sidebar's tag titled "Cut off at its per-agent timeout of 1 minute while making progress. Settings ›
> Runtime › Per-agent timeout sets this limit for runs started from now." (`=2` measures the plural form). **Not measured:**
> that live run. The row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).
>
> **Revision 2's control driven before a run, and its timed-out notice, in the built app, 2026-10-13 (fin42, the survey's
> N58):** revision 2's first execution left "a timed-out analysis's notice in the built app" unmeasured. `pnpm
> retrospective-proof`'s launch 8 sets Settings › Runtime › Improvement analysis timeout to 300 and saves (the run start then
> logs `improvement_collector_timeout=300 s` and its analysis ends with proposals), then to 10 with an analyst that never
> answers: the run's empty artifact notes "collector timed out after 10 seconds" and the notice reads "Improvement analysis
> complete — no proposals" with "The review of this run reached its 10-second limit before it proposed anything. Settings ›
> Runtime › Improvement analysis timeout allows it longer." That launch found
> [`a-post-run-analysis-after-a-retrospective-is-never-captured.md`](../defects/fixed/a-post-run-analysis-after-a-retrospective-is-never-captured.md)
> (repaired; PD-LIBRARY-002's record above). The live `ask` scenario sets the control to `LIVE_RUN_ANALYST_TIMEOUT_S` (default
> 300) the same way before its run. **Not measured:** that live run, the orchestrator's.

> **Reported back 2026-10-13 (fin41), from the live packs at `552d346` (default and duress) and `0bc3eee`**.
>
> - **The raised limit (OQ-214's second ruling, the harness's 2,700 s): measured once, and it mattered.** The duress pack's
>   `app.log` read `child_timeout=2700 s` (lines 13 and 31), `results.json` `childTimeoutS: 2700`, and the pack holds
>   `duress/agents.yaml`. No child was cut off. The verifier f1 lived **1,253.2 s**, 53.2 s past the 1,200 s default, and
>   succeeded; under the default its last step would have landed 21.5 s after the ceiling and the child would have ended
>   `failed`. The limit was set by the harness's file edit; the Settings control was not driven.
> - **Revision 3's tag (CN1) and revision 4's "1 second": NOT REACHED.** No child timed out in any of the three packs; the
>   longest default children lived 176.2 s (`552d346`) and 268.5 s (`0bc3eee`).
>
> Evidence:
> [`live-552d346-duress-autopsy.md`](../architecture/live-runs/live-552d346-duress-autopsy.md),
> [`live-552d346-default-autopsy.md`](../architecture/live-runs/live-552d346-default-autopsy.md),
> [`live-0bc3eee-default-autopsy.md`](../architecture/live-runs/live-0bc3eee-default-autopsy.md).
> The rows are in [`../architecture/first-executions.md`](../architecture/first-executions.md).

---

<a id="pd-config-004"></a>

### PD-CONFIG-004 — the Display category's Transcript heading holds the tool-verbosity slider and the reasoning switch

*Revision 2 (2026-10-19, [R-076](requests.md#r-076)) — **the tool-verbosity slider replaces the two
REQ-CONFIG-403 switches**, in the first paragraph below; revision 1's clause quoted beside it.*

Settings › Display › Transcript SHALL hold two controls. The first is [`PD-CHAT-010`](directives.md#pd-chat-010)'s
five-stop **Timeline detail** slider, in place of the two switches revision 1 placed here. The second is REQ-CHAT-167's
**Show reasoning bodies** (`display/showReasoning`, default off), whose hint says that reasoning rows open to show their
text, that off each shows only its summary line, and that a row the user opened or closed keeps that choice
(REQ-CHAT-059). It is wired to the stored preference and to the live re-render notification, and commits like the
slider: it is written user-wide the moment it moves (REQ-CONFIG-405), needs no Save, and Discard does not undo it. The
heading's sentence states that policy for both. REQ-CONFIG-472's four tool-row controls and their Save policy are
unchanged.

**Why, and what it costs.** REQ-CHAT-167 requires the reasoning switch to be reachable from the settings surface and names
no category; Display is where its namespace (`display/`), its commit policy and the rows it governs already are. The
slider's own reason and cost are [`PD-CHAT-010`](directives.md#pd-chat-010)'s. Revision 2 costs revision 1's independent
pair: grouping and auto-collapse were two switches a reader could set apart, and they are now one position on one
slider; the one combination that does not survive is named in that directive.

> **Revision 1 said, and no longer governs:** "Settings › Display › Transcript SHALL hold three switches. The first two
> are REQ-CONFIG-403's, in its order: **Auto-collapse older tool outputs**, then **Group consecutive tool calls**." The
> rest of revision 1's paragraph — the reasoning switch's key, hint, wiring and commit policy, and REQ-CONFIG-472's
> unchanged controls — still governs, with the switch now the second control rather than the third.

**As built.** `packages/ui/src/settings/DisplaySettings.tsx` (the `show-reasoning` Toggle, third under the Transcript heading
at the time, whose sentence reads "These three are yours, not this workspace's"); `packages/ui/src/commands/search-and-reasoning.test.ts`;
`pnpm settings-proof`. Built 2026-10-13 by fin41 (N71) before the ruling, under the reading OQ-264 recorded; the ruling
confirmed it, so no code changed with this directive. **On 2026-10-19 the slider of revision 2 and
[`PD-CHAT-010`](directives.md#pd-chat-010) is recorded and not built**: the surface still draws the two switches and the
heading's three-control sentence. The change that builds it owes this paragraph the surface as it then is.

> **The live re-render notification across windows, 2026-10-14 (fin43), reported here in place:** "wired … to the live
> re-render notification" held for the window that moved the switch only; a persona window already open kept the value it
> booted with ([`an-open-persona-window-keeps-the-display-preferences-it-booted-with`](../defects/fixed/an-open-persona-window-keeps-the-display-preferences-it-booted-with.md)).
> Main now announces each of the three switches' preferences it stores to every live window on channel 14,
> `display:changed`, and every window folds it into its display store. `palette-proof`'s stage 7
> (`persona-follows-display`) read a persona window's reasoning row `aria-expanded="false"` before the main window's
> "Toggle reasoning bodies" and `"true"` after it; against a build without the announcement it stayed `"false"`. The two
> REQ-CONFIG-403 switches ride the same path and are unit-tested only (`apps/desktop/src/main/commands/shell.test.ts`).

> **Extends:** REQ-CONFIG-403, REQ-CHAT-167

*Raised 2026-10-13 by the ruling of [OQ-264](../architecture/open-questions.md#oq-264) under the owner's delegation
([R-072](requests.md#r-072)).*

---

<a id="pd-tools-009"></a>

### PD-TOOLS-009 — exit 1 from a diff or a search is an answer, not a failure

REQ-TOOLS-112's test 4 ("a non-zero exit code → `shell_failure` / error") SHALL NOT apply to exit code 1 from a command
whose leading tokens name a convention that uses exit 1 for an answer: `diff`; `git` with a token `diff` anywhere after it,
whitespace-separated and case-insensitive (`git diff`, `git --no-pager diff`, `git diff --no-index`, and also a token that is
not the subcommand, as in `git log --grep diff`; not `git difftool`, whose token is not `diff`); and the searches `grep`, `egrep`,
`fgrep`, `rg` and `findstr`. The head is matched case-insensitively, as REQ-TOOLS-033 matches it. Such an observation
SHALL classify `success` / `info`. Every other non-zero exit still classifies `shell_failure` / error, a test earlier in the
cascade still decides first (a present `failure_kind` among them), and no other test of the cascade moves.

**As built.** `successExitOne` in `packages/agent-tools/src/terminal/classify.ts`, consulted before the generic non-zero
rule. `findstr`, the Windows search, is in the built list beside the four ESC-41 names.

**Why, and what it costs.** ESC-41: run `cc6191a2`'s `git diff --no-index` with differences exited 1 carrying the payload
the caller asked for, and was classified a failure the agent then had to explain away. `git diff`, `diff` and `grep` use
exit 1 for "differences found" and "no match", conventions older than the specification. What it costs: exit 1 from those
commands is never an error, including the rare case where one of them really did fail with 1; a failure that exits 2 or
more is still an error.

> **Narrows:** REQ-TOOLS-112

*Raised by the owner, 2026-10-06; logged as [R-071](requests.md#r-071), the ruling of ESC-41.*

---

<a id="pd-tools-010"></a>

### PD-TOOLS-010 — `send_signal SIGINT` stops a background session where the shell loses the signal

`send_signal SIGINT` (REQ-TOOLS-110) and the stream-control interrupt (REQ-TOOLS-128) SHALL stop a background session
whose command takes SIGINT's default, as [R-044](requests.md#r-044) ruled ("SIGINT stops a background session"), and not
only send the signal. Where the session's shell has a window, between starting a command and the command's own image, in
which a delivered SIGINT is lost — `dash` as `/bin/sh` on Linux, between its `vfork` and the command's `exec` — the product
SHALL read the session's process group the instant before it sends the signal and again at 250 ms and 1.5 s while the
session still runs, and SHALL send SIGINT once more, once each, to what that window cost the signal:

- a member that the first reading found to be the shell, not ignoring SIGINT, which is alive and now runs another image
  (its name or its arguments changed);
- where such a member had started nothing at the first reading and is still the shell, each child it has started since;
- with each, its descendants alive that the first reading did not hold.

It SHALL NOT send a second SIGINT to a process the first reading found already running the command, whatever that process
did with the first, one-shot handlers included, nor to what it starts on receiving it. Each re-delivery is logged as a
warning. A session whose shell has no such window — any shell but `dash` — is not read and is signalled once, as
REQ-TOOLS-110 states. Off Linux nothing is read: Windows terminates the session's tree for every signal (OQ-10, R-044).

The residue OQ-135 states is accepted: a member that `exec`s between the reading and the delivery, and installs a handler
within that step, is sent a second SIGINT; a script that traps SIGINT and then `exec`s its command has the trap overridden;
and a shell other than `dash` that loses a SIGINT across its fork, if one does, is not read.

**As built.** `BackgroundSession.checkSigint` and `missedSigint` (`packages/agent-tools/src/terminal/background.ts`) over
`ProcessTable.tree` (`@rotaris/platform`), armed where `hasVforkWindow` finds the session's shell to be `dash`. The
measurements are OQ-135's: 0 of 150 to 200 sessions ran on in each case under six CPU burners, against 5 to 28 with the
check disabled.

**Why, and what it costs.** R-044 read SIGINT as stopping a session, and acceptance finding A8 graded a dev server or a
watcher left running after "Sent SIGINT" a product defect. A single delivery could not meet that where `dash` discards a
signal in its fork window. The owner took the narrow re-delivery as built. What it costs: a command that `exec`s within one
synchronous step and installs a one-shot handler there can be sent two SIGINTs, and a script's own SIGINT trap can be
overridden.

> **Extends:** REQ-TOOLS-110, REQ-TOOLS-128

*Raised by the owner, 2026-10-06; logged as [R-071](requests.md#r-071), the ruling of OQ-135.*

---

<a id="pd-shell-004"></a>

### PD-SHELL-004 — demo mode's network silence holds for the demo window, not for the process

In demo mode (REQ-SHELL-162) the silence REQ-SHELL-005 states SHALL hold for the **demo window**: nothing that window does,
and nothing done on its behalf, opens an outbound network connection for that window's whole lifetime — no cloud-credit
polling for it (REQ-SHELL-015), no request to a model provider, and no update check from it. It SHALL NOT be read as a
statement about the process: a non-demo window of the same instance checks for updates and reaches its providers normally
(REQ-STARTUP-057), and the one instance REQ-STARTUP-161 allows is never split so that a demo window has a process of its
own. Every other sentence of REQ-SHELL-005 still governs.

**As built.** Demo mode is not built: the palette's "Open demo window" entry declines with "no demo mode exists yet"
(`packages/ui/src/commands/registry.ts`). This directive governs it when it is.

**Why, and what it costs.** OQ-34: REQ-SHELL-162 lets a demo window be opened from a non-demo window, and REQ-STARTUP-057
lets that non-demo window check for updates, so a process-wide silence cannot hold once a mixed process exists, and with
one instance a mixed process is the only kind there is. The owner had the per-window reading stated in the requirement's
place. What it costs: a user running a demo window beside a real one has a process that does open connections, for the
real one.

> **Narrows:** REQ-SHELL-005

*Raised by the owner, 2026-10-06; logged as [R-071](requests.md#r-071), the ruling of OQ-34.*

---

<a id="pd-shell-005"></a>

### PD-SHELL-005 — while an update downloads, its notice carries Distribution's words

While the download of an update runs, the update notice SHALL keep its identity and be updated in place, never replaced,
as REQ-SHELL-118 states, and SHALL carry REQ-STARTUP-118's words: the title `Downloading Rotaris {version}` and the
message `{measured} — verifying against the published checksum when it finishes.` It SHALL NOT be persistent while the
download runs, so no dismissal can wave off a version whose install is in flight, and its action SHALL be disabled with an
accessible description stating why. The apply SHALL follow the verified download in one sequence (REQ-STARTUP-122), with no
second activation of the action, so a "ready to install" state stands only for the length of the apply. A failure SHALL
turn the same notice into REQ-STARTUP-120's `Update not installed`, in place. The notice that offers the update before the
download — its title `Rotaris {version} is available`, its persistence and its `Update now` — and REQ-SHELL-118's
waved-off rule are unchanged.

**As built.** The updater's notices (`apps/desktop/src/main/updater/`), ADR-0054's "the same notice by identity, never by
replacement".

**Why, and what it costs.** OQ-85: REQ-STARTUP-118 and REQ-SHELL-118 disagree on the title, the persistence, the message
and the pause before the apply. Distribution owns the words and Shell the surface (`CONTEXT-MAP.md`), so the build took the
words from the one and the identity from the other, and ran the apply on from the download as REQ-STARTUP-122's sequence
has it. The owner confirmed that reading. What it costs: no second click before the install, and REQ-SHELL-118's
percentage-only message gives way to Distribution's sentence.

> **Narrows:** REQ-SHELL-118

*Raised by the owner, 2026-10-06; logged as [R-071](requests.md#r-071), the ruling of OQ-85.*

---

<a id="pd-shell-006"></a>

### PD-SHELL-006 — four tool results keep the plural marker their requirements spell

REQ-SHELL-044's rule that "the literal parenthesised '(s)' form is never rendered anywhere in the product" SHALL NOT reach
four tool results whose requirements fix their text as a contract a caller may match: REQ-TOOLS-110's
`Sent <n> byte(s) to session <id>.`, REQ-TOOLS-134's `N match(es) for '<pattern>':`, REQ-LIBRARY-100's `<N> artifact(s):`,
and REQ-LIBRARY-089's refusal beginning `Invalid tag(s): `. Each keeps its marker exactly as spelt, in the result the model
receives and wherever the transcript's tool row draws that result. Every other string the product can draw agrees with its
count, as REQ-SHELL-044 states.

**As built.** `tools/check-plural-markers.mjs` names these four in its `ALLOWED` list and fails `pnpm lint` on any other
literal marker in a string the product can draw.

**Why, and what it costs.** OQ-138: the four texts are fixed word for word by their requirements, and the tool row draws
a tool's result, which REQ-SHELL-044's "anywhere" reaches. The owner ruled them fixed contract text. What it costs: four
strings a user can read in the transcript keep a marker the rest of the product never shows.

> **Narrows:** REQ-SHELL-044

*Raised by the owner, 2026-10-06; logged as [R-071](requests.md#r-071), the ruling of OQ-138.*

---

<a id="pd-chat-007"></a>

### PD-CHAT-007 — every queued prompt belongs to a session

A queued prompt SHALL always carry the session that owns it: the explicit session id it was submitted to, or the
`session_id` key of its context snapshot (REQ-CHAT-039). There is no unscoped queued prompt. REQ-CHAT-038's "(empty =
unscoped)" and REQ-CHAT-039's sentence giving an unscoped prompt a behaviour of its own ("an unscoped prompt MUST be
consumable by any run but invisible to session-scoped listings") no longer govern, and a request that would create a
prompt with no owner is refused. Every other clause of the two requirements still governs: the content, the id and the
status progression, the refusals, the exactly-once transition, a prompt visible and consumable only by its session's runs,
and ownership preserved across edit and trigger.

**As built.** `queued_prompts.session_id` is `NOT NULL` since store v6, so no unscoped prompt can be stored, and
`resolveQueueOwnership` (`packages/engine/src/sessions.ts`) refuses an `unscoped` verdict; every route supplies the
addressed session. Its comments cited OQ-51 as open until 2026-10-06 (fin22), when they were worded to this directive; the
store migration's comment that names it (`packages/store/src/schema.ts`, v13) keeps its words, a shipped migration being
never edited.

**Why, and what it costs.** OQ-51: REQ-CHAT-041's amendment of 2026-09-07 assigned one session-scoped queue to the
instance, and the store has never been able to hold a prompt with no session, while REQ-CHAT-039 still described one. The
owner withdrew it. What it costs: no prompt can be queued for "whichever run comes next"; a prompt is queued for a session.

> **Narrows:** REQ-CHAT-038, REQ-CHAT-039

*Raised by the owner, 2026-10-06; logged as [R-071](requests.md#r-071), the ruling of OQ-51.*

---

<a id="pd-workspace-003"></a>

### PD-WORKSPACE-003 — "Load skill file…" opens a file chooser

The "Load skill file…" action of REQ-WORKSPACE-151 SHALL open the platform's own **file** chooser, filtered to Markdown
files (`.md`), on Windows and Linux, whose host dialog cannot offer a file and a directory at once; on macOS, whose dialog can,
it SHALL offer both, with the same filter on files. A host dialog filters by extension, not by file name, so the restriction
to `SKILL.md` is the loader's: a chosen file not named `SKILL.md` SHALL be refused with REQ-WORKSPACE-057's
"manual skill path must be a SKILL.md file or directory: {raw}", and a chosen directory holding none with its
"SKILL.md not found: {raw}", each leaving the catalog unchanged. A directory holding a `SKILL.md` is reached by selecting
that file. REQ-WORKSPACE-057's directory form stays reachable through the typed `/skill <path>` command (REQ-CHAT-162), with
REQ-WORKSPACE-057's own directory-path error. No second header action is added. Everything else REQ-WORKSPACE-151 states
still governs.

**As built.** The chooser ADR-0063 planned: `openFile` on win32 and linux, `openFile` and `openDirectory` on darwin, with
the filter `{ name: 'Skill document', extensions: ['md'] }` (`apps/desktop/src/main/index.ts`, `chooseSkillFile`); the
dialog therefore offers every Markdown file, `README.md` included. The name check is `loadManualSkill`'s
(`packages/config/src/skills/manual.ts`), pinned by `packages/config/src/skills/skills.test.ts` (`/ws/notes.md` refused
with `skillPathNotAcceptable`). OQ-59's own entry described the filter as "filtered to `SKILL.md`"; the build never had
that, and this text states what it has.

**Why, and what it costs.** OQ-59: REQ-WORKSPACE-151 asks for a chooser "restricted to selecting a `SKILL.md` file or a
directory containing one", which no platform dialog but macOS's offers, and REQ-SHELL-164 holds the product answerable only
for what it supplies to the host. The owner amended the requirement to the file chooser as built. What it costs: on two of
three platforms the dialog cannot pick a folder; the command can.

> **Narrows:** REQ-WORKSPACE-151

*Raised by the owner, 2026-10-06; logged as [R-071](requests.md#r-071), the ruling of OQ-59.*

---

<a id="pd-workspace-004"></a>

### PD-WORKSPACE-004 — the injection latency bound counts every instruction file discovery can reach

REQ-WORKSPACE-049's reference conditions SHALL read "every instruction file discovery can reach, totalling up to 1 MiB"
where they read "up to 20 context files totalling 1 MiB", in both places the requirement states them. Under
`PD-WORKSPACE-002`'s discovery that is fourteen files on a platform with a machine-wide `/etc` hierarchy and twelve on
Windows, of which the merge reads twelve and ten. A fixture "at the bound" fills every slot discovery can reach with
1,048,576 bytes across them. The 200 ms figure, the cold cache, the 95th percentile of at least twenty measurements in
separate processes, determinism and responsiveness are unchanged.

**As built.** `pnpm injection-proof`'s latency section, whose fixture fills the fourteen slots with exactly 1 MiB.

**Why, and what it costs.** OQ-68: no discovery rule the record has held can present twenty files, so the count half of
the bound could not be built. The owner restated it as what discovery reaches. What it costs: should discovery widen, the
bound widens with it, and the 200 ms figure then covers more files than it was first stated over.

> **Narrows:** REQ-WORKSPACE-049

*Raised by the owner, 2026-10-06; logged as [R-071](requests.md#r-071), the ruling of OQ-68.*

---

<a id="pd-startup-002"></a>

### PD-STARTUP-002 — a launch the product starts itself is neither the instance nor handed to it

REQ-STARTUP-161's two outcomes SHALL govern every launch a person makes. A launch the running product starts itself,
carrying a reserved token first on its command line that no user-facing invocation defines (REQ-STARTUP-015), SHALL take
neither outcome: it is admitted outside the instance claim and is not handed to the running instance. There are three:

1. **The code-intelligence child**, `builtin:code-intelligence` (REQ-MCP-033, REQ-STARTUP-002). Its branch runs before the
   claim and ends without opening a window, creating the instance record or a data directory.
2. **The update-restart successor**, `builtin:update-successor` (REQ-STARTUP-121). It takes over the record from the
   predecessor that started it rather than claiming one, and ends quietly, starting nothing, when the predecessor refuses it.
3. **A benchmark iteration child** (REQ-UIBENCH-037 to REQ-UIBENCH-039), marked by its parent the same way. It runs with
   its redirected configuration home and never reads or writes the user's instance record.

None of them is a second instance, and REQ-STARTUP-161's last sentence still holds: no configuration key, environment
variable, preference or control a user can set starts one.

**As built.** The first two (`apps/desktop/src/main/sentinel.ts`, ahead of main's body; `inheritInstance` beside
`claimInstance` in `apps/desktop/src/main/index.ts`). The third is not built: ADR-0053's benchmark harness does not exist, so
no iteration child is started, and its marker (constraint W-14) is owed with the harness.

**Why, and what it costs.** OQ-43: REQ-UIBENCH-037 to REQ-UIBENCH-039 make a benchmark iteration a fresh child of the
product's own program, and REQ-UIBENCH-046 requires the user's settings untouched afterwards. If the gate handed that child
to the running instance, the measurement would run against the user's real preferences and still report numbers. "Which
processes the gate admits" has a security flavour, so the owner had the exception stated rather than inferred. What it
costs: the single-instance rule has three named exceptions, each a launch only the product makes.

> **Narrows:** REQ-STARTUP-161

*Raised by the owner, 2026-10-06; logged as [R-071](requests.md#r-071), the ruling of OQ-43.*

---

<a id="pd-startup-003"></a>

### PD-STARTUP-003 — with no version metadata the running desktop reports `dev`

When the installation metadata REQ-STARTUP-004 reads is absent, the running desktop SHALL report the literal `dev`, as
REQ-STARTUP-007 states, and not `0+unknown`. The About surface (REQ-SHELL-140) and the update comparison read that value,
and REQ-STARTUP-109's unanswerable comparison names it. Every other sentence of REQ-STARTUP-004 still governs: the version
comes from the installation's own metadata, and a standalone bundle always reports its true release version.

**As built.** `VERSION_WITHOUT_METADATA` in `packages/platform/src/version.ts`.

**Why, and what it costs.** OQ-71: REQ-STARTUP-004 and REQ-STARTUP-007 fix two literals for one case. REQ-STARTUP-007 is
written for the running desktop and its two consumers, and `0+unknown` is not a version REQ-STARTUP-027's grammar parses
either. The owner kept `dev`. What it costs: nothing an installed build can reach; only a development launch reports it.

> **Narrows:** REQ-STARTUP-004

*Raised by the owner, 2026-10-06; logged as [R-071](requests.md#r-071), the ruling of OQ-71.*

---

<a id="pd-startup-004"></a>

### PD-STARTUP-004 — the variable naming a launch's artifact decides updatability, and no child inherits it

**(1) A Windows build with no named artifact is not updatable.** A packaged Windows build that runs outside the directory
the installer's `InstallDir` value names, and whose launch carries no `ROTARIS_PORTABLE_ARTIFACT` naming the artifact it
started from — the payload run directly out of a preparation, or an installed tree copied elsewhere — SHALL be classified
not updatable: no check is performed and no request is issued (REQ-STARTUP-106's not-updatable branch), and one `info` log
line says why. REQ-STARTUP-106's sentence that reads a copied installed tree as portable, to be replaced by a
self-contained executable, no longer governs. `ROTARIS_PORTABLE_ARTIFACT`, which the portable launcher publishes, is a
variable of REQ-STARTUP-147's artifact-naming kind beside `APPIMAGE`, and its absence on a packaged Windows build outside
`InstallDir` decides that no check happens, where REQ-STARTUP-147 says such a variable decides nothing about whether the
check happens.

**(2) No child inherits it.** The variables that name the artifact a launch started from — `APPIMAGE` and
`ROTARIS_PORTABLE_ARTIFACT` — SHALL be read once by the main process and removed from its own environment before it starts
any child, so no run host, workspace service, tool, terminal, hook, tool server or code-intelligence branch inherits them.
REQ-STARTUP-147's variables written for child processes gain that removal, and REQ-HOOKS-032's "exactly the environment the
application itself was started with" is that environment less those two variables.

**As built.** (1) `classify.ts` in `apps/desktop/src/main/updater/` (ADR-0054, "How the artifact is identified for the update
path"). (2) `takeArtifactVariables` (`packages/platform/src/artifact-environment.ts`), called by main before it starts any
child.

**Why, and what it costs.** OQ-84: ADR-0054 moved the artifact's identity to the launcher's variable (measured:
`process.execPath` points into the preparation in 149 of 149 launches), and a copied tree and a payload run directly are
indistinguishable to the process; following REQ-STARTUP-106's sentence would also replace a tree's executable with a
single-file portable, leaving the tree's support files beside it. OQ-90: a copy of either variable that a child inherits
names an artifact that is not the child's launch, and a Rotaris started from inside one would classify itself from the
other's file. What it costs: a user who copies an installed tree elsewhere gets no updates for that copy, and a hook cannot
read which artifact started the application.

> **Narrows:** REQ-STARTUP-106, REQ-STARTUP-147, REQ-HOOKS-032

*Raised by the owner, 2026-10-06; logged as [R-071](requests.md#r-071), the rulings of OQ-84 and OQ-90.*

---

<a id="pd-startup-005"></a>

### PD-STARTUP-005 — the notices file lists the tool-server packages a build pins

`THIRD-PARTY-LICENSES.txt`'s `Tools provisioned after installation` section SHALL carry, after the machine tools and the
code-intelligence runtime's sub-heading with its language servers (REQ-STARTUP-142's order, kept), a third sub-heading,
`Tool-server packages`. It lists each package the setup manifest's `toolServerPackages` pins with REQ-STARTUP-142's four
fields, and states that a tool server of the built-in configuration launches each through its package runner, which
downloads it when that tool server is first started, and that none is contained in the artifact. The sub-heading is left
out for a manifest that pins no package. This is where REQ-STARTUP-152's "the same versions its `THIRD-PARTY-LICENSES.txt`
reports" finds the tool-server packages.

**As built.** The notices generator (`tools/notices/`); `@playwright/mcp` 0.0.80 is the one package this build pins.

**Why, and what it costs.** OQ-92: REQ-STARTUP-152 requires the file to report the tool-server package versions a build
provisions, and REQ-STARTUP-142 names no place for them; they are not "dependencies present in the shipped artifact"
either, since the package runner fetches them. The owner confirmed the sub-heading as built. What it costs: one more
section of the file to keep in step with the manifest.

> **Extends:** REQ-STARTUP-142

*Raised by the owner, 2026-10-06; logged as [R-071](requests.md#r-071), the ruling of OQ-92.*

---

<a id="pd-startup-006"></a>

### PD-STARTUP-006 — the setup statement names the moments the build carries

**The setup statement.** REQ-STARTUP-160's first content statement — what About & Legal's network-activity disclosure says
of setup — SHALL name the moment at which this build reaches the network for a tool: **the first time a tool is needed**,
when a tool server's pinned package is fetched by its package runner as that server first starts (`PD-STARTUP-005`), and
when a language's server is provisioned by the bundled code-intelligence runtime at that language's first use
(REQ-STARTUP-058's second list, REQ-STARTUP-159, REQ-STARTUP-064 as amended under ESC-32, REQ-MCP-118). The statement SHALL
say that the request reaches the package registry that serves the tool, and only for work the machine has not already done,
and SHALL name no host. This moment is the specification's own; the directive records it and extends nothing.

**What only a build that carries them names.** First-launch machine setup, cache warm-up and the pinned tool-archive hosts
SHALL be named only in a build that carries machine setup (REQ-STARTUP-060 onward) or REQ-STARTUP-064's warm-up. The change
that builds either one SHALL restore the matching words in this statement, and the notices file's machine-tools sentence,
in the same commit.

**What is unchanged.** REQ-STARTUP-160's update-check and exposure statements, the surface (About & Legal, read in place,
reachable at the minimum window size), its readability with every outbound request blocked, and the clause that the
disclosure names no host, endpoint or request the document does not require.

**As built.** `NETWORK_DISCLOSURE.setup` in `packages/ui/src/settings/About.tsx`: "The first time a tool is needed, such as a
tool server or a language's code intelligence, it may be downloaded from the package registry that serves it, and only when
this machine does not already have it."

**Why, and what it costs.** REQ-STARTUP-160's first statement names two moments this build does not carry — machine setup
and cache warm-up are not built (OQ-73, deferred by R-071) — and the archive hosts it never contacts, while the requests of
that kind it does make, at a tool's first use, went unnamed until the build added a third moment beside the two (OQ-261). A
disclosure that names what the build does not do disagrees with its behaviour, which the requirement itself calls
non-conformant on the disclosure. What it costs: the statement must change again when machine setup or the warm-up ships,
and a reader comparing it with REQ-STARTUP-160's words finds two moments missing.

> **Narrows:** REQ-STARTUP-160

*Ruled 2026-10-13 by the consortium under the owner's delegation ([R-072](requests.md#r-072)), the ruling of
[OQ-261](../architecture/open-questions.md#oq-261).*

> **First execution, 2026-10-14 (fin43, `fin43-notices-and-config`).** Built the day after it was ruled. **What was
> measured.** `About.test.ts`'s setup case requires "first time a tool is needed", "may", "package registr" and "does not
> already have it" and refuses "first launch", "warming caches" and "tool archives"; it was red on the text before. `pnpm
> settings-proof`'s launches 1 and 1″ read the three statements, no host, the new phrases present and the three absent from
> statement 1, and a full pointer selection of the section at 1000×680. **What was not measured.** No live run: nothing on
> the network changed, only the words. The row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).

---

<a id="pd-workspace-005"></a>

### PD-WORKSPACE-005 — a project-setup banner names the project it is about

*Revision 3 (2026-10-14, [R-072](requests.md#r-072), ruling [OQ-294](../architecture/open-questions.md#oq-294)) — **the banners'
action reaches a project no window holds**, below: revision 2's no-holder sentence replaced, and quoted beside the new text.*
*Revision 2 (2026-10-13, [R-072](requests.md#r-072), ruling [OQ-262](../architecture/open-questions.md#oq-262)) — **the
banners' action**, below: a clause added, the revision-1 sentence it falsifies and the "every other surface" clause it
amends quoted beside it.*

**The banner.** The two initialization banners — a failed background run's "Project setup did not finish"
(REQ-WORKSPACE-103) and a failed resolution's "Project setup could not be checked" (REQ-WORKSPACE-102) — SHALL stay
application notices, raised once and shown in every open main window as every other notice is, and SHALL name the project
they concern. Their title SHALL read the requirement's headline, a colon and a space, and the project's name:
`Project setup did not finish: atlas-billing`. The project's name is the last path segment of the project's folder, and
the folder's full path where it has no last segment (a drive or filesystem root). The message SHALL be the sentence the
requirement fixes, unchanged — the task's own summary or its fallback, and for a run that broke down entirely "Runs are not
blocked; you can try again."; for a failed resolution "Rotaris could not work out whether this workspace still needs setting
up. Runs are not blocked; you can check again." The banner's detail area (REQ-NOTIFY-005) SHALL begin with the line
`Project folder: <the folder's full path>`, followed by a blank line and the technical text the requirement's surface
already carried, so two projects whose folders share a name are told apart there.

**The banners' action — revision 3.** Both banners SHALL carry REQ-NOTIFY-044's `open-project-init` action naming the
project's folder. The failed background run's banner labels it **"Try again"**, the label REQ-WORKSPACE-103 fixes; the failed
resolution's banner labels it **"Open Project settings"** (REQ-WORKSPACE-102). From any window, activating either banner SHALL
reach the named workspace by [`PD-SHELL-001`](#pd-shell-001) revision 2's reach. Where a main window holds the workspace, that
window is surfaced on REQ-SHELL-161's terms. Where none does, a main window is added for it on PD-SHELL-001's add terms: no
REQ-SHELL-021 gate is evaluated, no window is closed, nothing is asked, the workspace is persisted as the last-opened one, and a
failure is reported under REQ-SHELL-019. Settings › Project, where REQ-WORKSPACE-103 puts the recorded outcome and its retry,
SHALL then open in the reached window, and the window SHALL hold the request until its renderer can take it, so a press
during an added window's load still lands.

> **Revision 2 said, and no longer governs:** "When no window holds the workspace, the activating window SHALL show the info
> notice **"Project <name> is not open in any window."**, `<name>` the project's name as above, and nothing else happens: no
> window is added, replaced or asked about." — the falsified reading (OQ-262's ruling of the case, answered differently the
> same day by OQ-267's reach; OQ-294).

> **Revision 1 said, and no longer governs:** "the retry itself is made in that project's Settings › Project, since the
> banner's own 'Try again' action has no target in this build" (in "Why, and what it costs" below), and "**What is
> unchanged.** … its severity and every other surface of the two requirements", which this clause amends: the action is now
> one of the banner's surfaces this directive states.

**What is unchanged.** Which window shows the banner (every one, ADR-0049's one notice store), when it is raised, its
severity and every other surface of the two requirements but the action above. The in-window error surface of a failed resolution — the Project
section's "Project setup could not be checked" and its "Check again" (REQ-WORKSPACE-102) — is the window's own and reads
the requirement's headline as it stands. A banner for a workspace no window holds any more is still not raised (OQ-141).

**Why, and what it costs.** With two main windows open (PD-SHELL-001) a project's failed setup raised "Project setup did not
finish" in the other project's window too, carrying a summary that says "this project" and nothing saying which; the user
could not tell which project to try again. Showing the banner only in the windows holding the project would make the
application's single notice store work per window, which is a larger change than the confusion is worth; naming the
project is a text change that removes it. The name says which project; the retry itself is made in that project's Settings ›
Project, ~~since the banner's own "Try again" action has no target in this build (ADR-0049, "Not built, said so")~~ which
the banner's action opens since revision 2 (OQ-262: REQ-WORKSPACE-103's "Try again" had no target, and the surface that
holds the retry is the project's own Settings › Project). What it costs: the title is no longer the requirement's fixed string, so a
reader or a test matching the headline whole must match its start; and a long folder name lengthens the title.

> **Narrows:** REQ-WORKSPACE-102, REQ-WORKSPACE-103

*Raised by the owner, 2026-10-06, ruling OQ-171 as recommended; logged as [R-071](requests.md#r-071). Minted on its branch as PD-WORKSPACE-003 and renumbered PD-WORKSPACE-005 before the merge, `origin/main` having taken PD-WORKSPACE-003 and PD-WORKSPACE-004 meanwhile.*

**Why revision 2, and what it costs.** REQ-WORKSPACE-103 gives the banner a "Try again" action and REQ-NOTIFY-044 has the
member that names a workspace's initialization surface, yet the banner carried none: a user who read it had to find the
project's window and its Settings › Project themselves. Opening the surface rather than re-running the setup from the
banner keeps REQ-NOTIFY-047 (an action writes nothing into the project) and shows the recorded outcome before the retry.
What it costs: "Try again" opens a surface rather than retrying in one press; the resolution banner's label departs from
REQ-WORKSPACE-102's in-window "Check again", which stays the window's own; and ~~a banner for a project whose window was
closed answers with a notice and opens nothing~~ *(struck by revision 3)*. Revision 3's three costs in its place: the press
reopens a project the user closed, and that project becomes the remembered workspace; the reopened project runs its automatic
resolution (REQ-WORKSPACE-102), and its pending setup may start again before the user reaches the retry; and, until the
defect "a main window added after a notice was published does not show it" is repaired, the added window does not show the
banner. *(That third cost lapsed the same day: the defect was repaired by fin44, a window asking main for the current notice
when it boots, [`a-main-window-added-after-a-notice-was-published-does-not-show-it.md`](../defects/fixed/a-main-window-added-after-a-notice-was-published-does-not-show-it.md).)*

*Revised by [R-072](requests.md#r-072), 2026-10-13, ruling [OQ-262](../architecture/open-questions.md#oq-262) (revision 2).*
*Revised by [R-072](requests.md#r-072), 2026-10-14, ruling [OQ-294](../architecture/open-questions.md#oq-294) (revision 3): the
disposition "Narrows REQ-WORKSPACE-102, REQ-WORKSPACE-103" stands, and their back-pointers name revision 3.*

> **First execution of revision 3, 2026-10-14 (fin44, `fin44-notice-reach`).** Built the day it was ruled: `projectInit.open`
> (`apps/desktop/src/main/commands/initialization.ts`) awaits `MainWindows.reach` in place of revision 2's `surfaceHolding`,
> answers a failed reach with its outcome (the add route reported it under REQ-SHELL-019) and raises no transient, and asks the
> reached window for Settings › Project through `MainWindows.openProjectInit`: sent on channel 15 to a renderer listening,
> held on the window's record for one still loading until its renderer, having registered for channel 15, sends
> `projectInit.ready` and is answered `{owed: true}` once (`apps/desktop/src/renderer/main.tsx`). `PROJECT_NOT_OPEN` and
> `surfaceHolding` are gone. **What was measured.** `commands/initialization.test.ts` (a holder reached and opened; a project no
> window holds reached by an added window, the open held, no transient; a failed reach answered with its outcome;
> `projectInit.ready`), each red on the code before; `main-windows.test.ts` (an added window not yet listening holds the
> request and its ready call returns it once; a listening holder is sent channel 15 directly; a second press during a deferred
> open sets the request once and is not refused); `recovery-wiring.test.ts` (the ready call right after registering);
> `notice-proof` section 6c: the banner for `closed-project`, a project no window held, pressed in the first window, added a
> third main window on it (`added window 3 and opened Settings › Project there`), which showed Settings › Project with
> "Retry initialization" (its owed task failed again, the second cost above), and no "not open in any window" acknowledgement
> appeared (load average 7.4 on four CPUs). The added window's renderer had registered before the open was asked, so the
> built app took the `sent` branch; the held branch is measured by the unit cases and, for channel 16's identical hand-off, by
> `notice-proof` 6d. The row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).

> **First execution of revision 2, 2026-10-14 (fin43, `fin43-notices-and-config`).** Built the day after it was ruled:
> `InitializationCoordinator.banner` passes `{ label, action: { kind: 'open-project-init', workspace } }` from all three sites;
> main forwards it to the notice store; the renderer's arm sends `projectInit.open`; main's handler
> (`projectInitCommands`, `apps/desktop/src/main/commands/initialization.ts`) surfaces the holder through
> `MainWindows.surfaceHolding` and sends it channel 15 (`project-init:open`), whose listener opens Settings › Project, or
> raises the info acknowledgement in the asking window. **What was measured.** `initialization.test.ts`'s three cases (the
> two background sites and the resolution site), `main-windows.test.ts`'s `surfaceHolding` case, the handler's two cases in
> `commands/initialization.test.ts` and `recovery-wiring.test.ts`'s two source cases, each red on the code before;
> `init-proof` scenario 4 requires the banner's logged action; `notice-proof` section 6c, two main windows, presses "Try
> again" in the window that does not hold the project: the holder came to the front showing Settings › Project with
> "Retry initialization", an unsaved Instructions edit in it still pending; a banner naming a folder no window holds gave
> "Project closed-project is not open in any window." and no window was added. **Found:** a main window added after a
> notice was published does not show it
> ([`a-main-window-added-after-a-notice-was-published-does-not-show-it.md`](../defects/fixed/a-main-window-added-after-a-notice-was-published-does-not-show-it.md)),
> not repaired there; repaired 2026-10-14 by fin44 (`notice.current`). The row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).

> **First execution, 2026-10-06.** Built the day it was written: `InitializationCoordinator.banner`, `namedBanner` and
> `projectNameOf` in `apps/desktop/src/main/initialization.ts`. **What was measured.** Three cases in
> `initialization.test.ts`'s "a banner names its project" block and the seven earlier banner assertions, each red on the code
> before the change; `init-proof` scenario 4 requires the background banner's title to name the scenario's folder and its
> detail to open on the folder. **What was not measured.** No built-app run with two main windows open photographed the
> banner in the window that does not hold the project. The row is in
> [`../architecture/first-executions.md`](../architecture/first-executions.md). **Repaired on verification, 2026-10-06.**
> As first built, `projectNameOf` took a Windows drive root's designator for its last segment and named `C:\` and `C:/`
> as the bare `C:`, against the clause above that a root with no last segment is named by its full path; the unit test had
> pinned only `/`. A drive designator (`^[A-Za-z]:$`) now counts as no segment, so a drive root reads `C:\`; the case
> "names a Windows drive root by its full path" in `initialization.test.ts` pins it and was red on the first build.

---

<a id="pd-mcp-003"></a>

### PD-MCP-003 — a code-intelligence setup step gets 2 seconds to exit at every stop

**The grace.** When a code-intelligence setup step is stopped — its stage budget exhausted, the setup cancelled (the
user's Cancel, or the cancellation a workspace switch or a window's close makes), or the application closed while it runs
— the child SHALL be asked to terminate, given **2 seconds** to exit, and then force-killed, on Windows the whole process
tree and on POSIX the step's whole process group. One grace serves every stop; no stop gives the step longer.

**What is unchanged.** Everything else REQ-MCP-099 states: the three steps, their budgets, the 0.25 s polling, the UTF-8
encoding, the ask before the force-kill, a budget-exceeded step reported failed, the 400-character output and the
non-retryable "not a local launch" failure. REQ-WORKSPACE-092's bound — nothing the step launched still running 5 s after
the stop — and REQ-WORKSPACE-109's 5000 ms close are the limits the 2 s is chosen to meet; neither is changed.

**Why, and what it costs.** REQ-MCP-099 gives the step 5 seconds before the force-kill, and REQ-WORKSPACE-092 requires
everything it launched gone 5 s after the stop. Both cannot hold for a step that uses its whole grace: the force-kill,
its settling and the poll come after the 5 s. At a close the build already cut the grace to 2 s, measured inside both
bounds (a step and a descendant that both ignore SIGTERM, force-killed, the quit 2234 ms and 2274 ms; OQ-172). A switch
and a Cancel kept the full 5 s, and on Windows, the release platform, the step outlived the 5 s bound — 5.489 s after a
switch and 5.603 s after a Cancel (`workspace-proof`, 2026-10-02). One short grace is simpler and already proven at the
close. What it costs: a runtime that needs more than 2 s to wind down cleanly after being asked is force-killed sooner,
and may leave a partly written project or index for the next setup to redo.

> **Narrows:** REQ-MCP-099

*Raised by the owner, 2026-10-06, ruling OQ-172 as recommended; logged as [R-071](requests.md#r-071). Minted on its branch as PD-MCP-001 and renumbered PD-MCP-003 before the merge, `origin/main` having taken PD-MCP-001 and PD-MCP-002 meanwhile.*

> **First execution, 2026-10-06.** Built the day it was written: `SETUP_TERMINATE_GRACE_MS` in
> `packages/mcp/src/setup.ts` is 2 s, and `SETUP_SHUTDOWN_GRACE_MS` is the same grace. **What was measured.** Three cases in
> `setup.test.ts` — the one grace, a cancelled step that ignores the ask force-killed 2 s after the cancellation, and a step
> past its budget force-killed 2 s after it — each red on the code before the change (5 s, 5150 ms and 5762 ms on this
> Linux host). **What was not measured.** The Windows `workspace-proof` that measured the misses was not re-run: this host
> is Linux. The row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).

---

<a id="pd-orch-009"></a>

### PD-ORCH-009 — an entry role that ends its turn without an answer is asked once more, and the person is told if it still writes none

*Revision 2 (2026-10-07, [R-072](requests.md#r-072)) — **no re-prompt after an answer**, the ruling of OQ-225 beside
[`PD-ORCH-015`](#pd-orch-015). The first sentence is narrowed below and its revision-1 text quoted beside it. Revision 1
(2026-10-06, [R-071](requests.md#r-071)) is otherwise unchanged.*

*Revision 3 (2026-10-13, [R-072](requests.md#r-072), ruling [OQ-282](../architecture/open-questions.md#oq-282), the
consortium's E1) — **the re-prompt is the root's only message for that turn**: one paragraph is added after the re-prompt's,
which narrows REQ-ORCH-104's stuck-mode clause for the one turn the re-prompt answers. Revision 2's paragraph is quoted beside
it, unchanged; everything else stands as revisions 1 and 2 wrote it.*

*Revision 4 (2026-10-14, [R-072](requests.md#r-072), ruling [OQ-283](../architecture/open-questions.md#oq-283) and
[OQ-284](../architecture/open-questions.md#oq-284), both ruled by the consortium and written on 2026-10-14) — **the run's own follow-up
is the only message it adds for the turn it follows**: revision 3's last sentence is replaced and its case widened from the
entry role's re-prompted turn to three turns — that one, a delegated child's empty turn that REQ-ORCH-095's re-prompt answers
(OQ-283), and an execution iteration's root turn that REQ-ORCH-078's plan correction follows (OQ-284). Revision 3's replaced
sentence and its case are quoted beside their replacements; everything else stands as revisions 1 to 3 wrote it.*

*Revision 5 (2026-10-14, [R-072](requests.md#r-072), ruling [OQ-296](../architecture/open-questions.md#oq-296), ruled by the
consortium and written on 2026-10-14) — **a parent's silent wait on its children is no stuck report**: the case is widened by a fourth turn,
(d), a parent's empty turn the run follows by waiting and resuming the parent with its children's reports (REQ-ORCH-055..057).
Revision 4's two sentences that named this turn as governed by REQ-ORCH-104 as written — "a root resumed with a child's report
after an empty turn among them" and "a root's empty turn the run follows with a child's report included" — are replaced, and
quoted beside their replacements; everything else stands as revisions 1 to 4 wrote it.*

When the entry role of an execution iteration ends its turn with neither text nor a tool call — its last model step wrote
nothing for the person — and the run is not stopping, pausing or coming to rest, the run SHALL send it one further message
in its own conversation asking it to answer, and SHALL let it take that turn as it takes any — **revision 2:** only where no
earlier turn of the same execution of the root wrote an answer. A turn that follows a plan correction (REQ-ORCH-078,
`PD-ORCH-015`) after an answer is never re-prompted, and the answer it followed stays the iteration's answer.

> Revision 1 said, and no longer governs: "When the entry role of an execution iteration ends its turn with neither text
> nor a tool call — its last model step wrote nothing for the person — and the run is not stopping, pausing or coming to
> rest, the run SHALL send it one further message in its own conversation asking it to answer, and SHALL let it take that
> turn as it takes any." It was written when a plan correction followed only a positive validation-retry setting; under
> `PD-ORCH-015` every root that answers with its plan open is corrected, and a correction answered by a `todo` write and no
> text would have been asked for a second copy of the answer the person had already been shown.

**Revision 3:** The re-prompt is the one message the run adds for that turn. The empty turn it answers is not a stuck report
to loop supervision: no classification is asked, no corrective message joins the re-prompt, no `loop_supervisor_activation` is
written, and the consecutive-activation count is unchanged. **Revision 4:** the same holds for two more follow-ups the run
itself sends, each the one message the run adds for the turn it follows: REQ-ORCH-095's single re-prompt of a delegated child
whose turn ended with neither text nor a call ("Carry out the task now, …"), and REQ-ORCH-078's plan correction
(`PD-ORCH-015`) of an execution iteration's root. In each of the three, only a pending stuck trigger the turn armed is
withdrawn — a repetition, cycle or raw-count trigger the same turn armed is kept — and the withdrawal leaves the
consecutive-activation count unchanged. The plan correction is also REQ-ORCH-105's todo-correction message, so, as that
requirement already says, it restarts the consecutive-activation series. **Revision 5:** a parent's turn — an execution
iteration's root, or a delegated child acting as parent — that ends with neither text nor a call while a direct child of its is
pending, or has ended with a report the parent has not seen, is REQ-ORCH-055's wait and no stuck report. When the run takes the
parent into that wait it withdraws the stuck trigger the turn armed, so the children's reports are the only message the run adds
for that turn. As in the other three, only a pending stuck trigger is withdrawn — a repetition, cycle or raw-count trigger the
same turn armed is kept — and the consecutive-activation count is neither moved nor reset: a report is no user instruction under
REQ-ORCH-105. Every other trigger, every other empty turn and every other turn of a delegated child stay as REQ-ORCH-096 and
REQ-ORCH-099..107 say.

> Revision 4's last sentence said, and no longer governs: "Every other trigger, every other empty turn — a root resumed with a
> child's report after an empty turn among them ([OQ-296](../architecture/open-questions.md#oq-296)) — and every other turn of a
> delegated child stay as REQ-ORCH-096 and REQ-ORCH-099..107 say." As built under it, a root that delegated in the background and
> ended its turn silent was resumed with the child's report followed, in the same request, by the stuck corrective ("Pause and
> reassess …"), with one stuck activation; and a root that waited so across three batches reached its third consecutive
> activation and escalated, the session ending `agent_session_aborted` with "child aborted after repeated activations".

> Revision 3's last sentence said, and no longer governs: "Every other trigger, every other empty turn and every delegated
> child stay as REQ-ORCH-096 and REQ-ORCH-099..107 say." As built under it, a delegated child's re-prompt was followed in the
> same request by the stuck corrective — [task, empty turn, re-prompt, "Pause and reassess the current task."] — with a stuck
> classification and activation for the child (OQ-283); and a stuck trigger a root's unanswered empty turn left pending was
> taken by the request a later plan correction led, the corrective following the correction (OQ-284). OQ-284's ruling, made
> beside OQ-283's, named delegated children as unchanged; OQ-283's ruling of the same day brings the child's re-prompted turn
> in, and revision 4 carries both.

> Revision 2's paragraph above stands unchanged, and revision 3 adds only the paragraph after it. Revision 2 said nothing of
> loop supervision, and as built the empty turn the re-prompt answers was also REQ-ORCH-096's stuck report: the stuck
> trigger it armed was taken at the re-prompt's first step, so the request the re-prompt leads to ended [prompt, empty turn,
> re-prompt, "Pause and reassess the current task. …"] — the re-prompt was not the model's last instruction, and a classifier
> was asked over an empty excerpt (the live scenario run at `ce5f952`, `empty-answer` and `empty-once`, finding F1).

The re-prompt SHALL be asked once in
each execution of the iteration's root, never twice. Where the turn that message leads to still ends without an answer, the
iteration SHALL close as it would have, and the run SHALL tell the person once, in a `system` row in the transcript and a
warning `incomplete_execution` issue naming the entry role: where the run ends after that iteration (REQ-ORCH-069's stop
conditions), that **the run** ended without an answer; where it does not — another task is taken up, the run parks at
the plan gate, or it pauses (at the message limit, at the user's request or at a quit) or is cancelled — that **the
iteration** ended without an answer. An answer written in reply to that message is an answer, even when a later correction's turn (REQ-ORCH-078)
writes none. A plan cycle's root (REQ-ORCH-153) is not asked: the plan it produces is the plan gate's to judge.

**Why, and what it costs.** A run asked "Read README.md … and tell me its first heading" read the file, globbed the
workspace and ended its turn with reasoning and no text (run 2 of `slice-proof`, 2026-10-03, OQ-199). The run completed
`tasks_complete` with only "The run completed." in the transcript: the person was given no answer and no warning, and a
completed run with no answer misleads. A delegated child in the same state is already re-prompted once (REQ-ORCH-095), and
the root now is too. What it costs: one more model call for a root that wrote nothing, and a row and an issue when even
that fails; a root that wrote nothing on purpose is asked anyway.

> **Extends:** REQ-ORCH-069
> **Narrows:** REQ-ORCH-104

*Revision 4's case, stated exhaustively:* REQ-ORCH-104's stuck-mode clause ("for stuck-mode triggers, ALWAYS recover with a
deterministic corrective message") on three turns, and no others: (a) the one turn of an execution iteration's entry role
that this directive's re-prompt answers — the empty turn that earned it; (b) a delegated child's empty turn (category
`no_activity`, neither text nor a call) that REQ-ORCH-095's single re-prompt answers; (c) the turn of an execution
iteration's root that the run follows with REQ-ORCH-078's plan correction (`PD-ORCH-015`); **(d), since revision 5,** the turn
of a parent — an execution iteration's root, or a delegated child acting as parent — that ends with neither text nor a call
while a direct child of its is pending or terminal-but-unobserved, which the run follows by waiting and resuming the parent with
its children's reports (REQ-ORCH-055..057). On each, a stuck trigger the turn armed is withdrawn before the run's message is
sent — in (d), as the parent is taken into the wait — so the clause has nothing to recover. Outside those four turns
REQ-ORCH-104 governs as written.

> Revision 4's case ended, and is widened by revision 5: "Outside those three turns REQ-ORCH-104 governs as written — a root's
> empty turn the run follows with a child's report included (OQ-296)."
[`PD-ORCH-016`](#pd-orch-016) narrows the same requirement's raw-count clause ("≥ 4 consecutive same-tool calls"); the two
cases are disjoint — a repetition, cycle or raw-count trigger the same turn armed is kept, and revisions 4 and 5 withdraw only
a stuck one — as [README.md](README.md) ("Two directives on one requirement") requires of two narrowings.

> Revision 3's case said, and is widened by revision 4: "REQ-ORCH-104's stuck-mode clause […] on the one turn of an
> execution iteration's entry role that this directive's re-prompt answers — the empty turn that earned it. There no stuck
> trigger stands, so the clause has nothing to recover. Outside that one turn REQ-ORCH-104 governs as written."

*Revisions 3 and 4 cite without changing:* REQ-ORCH-095 (the child's single re-prompt, still sent once), REQ-ORCH-096 (an
empty reply with no call is the runtime's stuck report — still so for every turn but the three above), REQ-ORCH-078 (the plan
correction, sent as before), REQ-ORCH-099, REQ-ORCH-102 (the activation counter, which a withdrawal does not move),
REQ-ORCH-105 (the plan correction is its todo-correction message, which restarts the consecutive series as written; no
directive is needed for that), REQ-NOTIFY-102 and REQ-NOTIFY-103. *Revision 5 cites without changing:* REQ-ORCH-055..059
(the parent waits and is resumed with its children's reports, as before), REQ-ORCH-096 (still the stuck report for every turn but
the four above), REQ-ORCH-102 (the counter, which the withdrawal does not move), REQ-ORCH-105 (a report is no user instruction,
so the consecutive series is not reset) and REQ-ORCH-106 (the escalation, unchanged for a parent that is truly stuck).

*Raised by the owner, 2026-10-06, ruling OQ-199 as recommended; logged as [R-071](requests.md#r-071). Revision 3 ruled under
the owner's delegation, 2026-10-13; logged under [R-072](requests.md#r-072), the ruling of
[OQ-282](../architecture/open-questions.md#oq-282) (the consortium's E1). Revision 4 ruled under the owner's delegation
and written, both 2026-10-14; logged under [R-072](requests.md#r-072), the rulings of
[OQ-283](../architecture/open-questions.md#oq-283) and [OQ-284](../architecture/open-questions.md#oq-284). Revision 5 ruled
under the owner's delegation and written, both 2026-10-14; logged under [R-072](requests.md#r-072), the ruling of
[OQ-296](../architecture/open-questions.md#oq-296). Revisions 4 and 5 read "ruled … 2026-10-13, and written 2026-10-14" — a ruling date a day before
their questions were raised — until fin46 (`fin46-accept1-12`) corrected them on 2026-10-14 from the consortium's ruling
record, which dates both sittings 2026-10-14 (by 04:58 and by 10:14 UTC).*

*Renumbered before landing: built as `PD-ORCH-006` on its branch, it took the next free number, `PD-ORCH-009`, when
`PD-ORCH-006` to `PD-ORCH-008` (OQ-202, OQ-119, OQ-116) landed on `main` first; its citations followed.*

> **First execution, 2026-10-06, built on branch `fin20-continue-and-continuation`:** the directive was built as written,
> through the follow-up REQ-ORCH-078's correction already used (`IterationChildren.runWithChildren`'s `followUp`, asked where
> the root would otherwise be left idle, so a delegation the re-prompt leads to is waited for as any turn's is). The text
> met the code in three places. **(1) "Neither text nor a tool call"** is read off the turn's report: a turn ends only on a
> step with no tool call, so a turn that returned `succeeded` with empty text is the case. **(2) The same terms as the
> correction** (`correctionDue`): only an execution iteration's root, only a `succeeded` turn, never once the run is
> stopping, pausing or coming to rest — a rest that cut the turn is not an unanswered question. The re-prompt is asked
> before any plan correction, once per execution of the root, so a resumed root may be asked again in its new execution.
> **(3) Telling the person** is a `system` row, "The run ended without an answer: <role> ended its turn without writing one,
> even when asked once more.", and an `incomplete_execution` warning issue — the vocabulary's kind for an ending that did
> not do what was asked (REQ-ORCH-095's), so no issue kind is coined. The run then completes as before. With no delegation
> port the root's turn now always runs the follow-up loop, which before ran only with validation retries configured.
> **Corrected before landing (the verifier's review of the first form).** The first form wrote that row as soon as the
> root's turn returned, so a silent iteration the run went on from (a queued prompt's, or its own task re-queued) was
> reported as the run's end while the run carried on: the directive's own "the run completes as REQ-ORCH-069 says" was
> true only of the run's last iteration. It now says what is true where it is known (`Run.tellUnanswered`): "The run ended
> without an answer: …" at the teardown of a run that ends, and "Iteration <n> ended without an answer: …" before the run
> takes up another iteration, parks at the plan gate or pauses at the message limit, or at the teardown of a run that only
> paused or was cancelled (REQ-MONITOR-301's `interrupted`); the issue's metadata says which (`run_ended`). The same review
> found that a root which answered when asked, and whose later plan correction (REQ-ORCH-078) ended without text, was
> reported as answerless: only the turn the re-prompt itself led to is now read.
> **What was measured.** `packages/engine/src/run/answerless.test.ts`, three cases: a root that read and then wrote nothing
> is asked once in its own conversation and its answer is the run's; one that stays silent is asked once, never twice,
> and the person is told; one that answers is not asked (the first two red on the code before). Two more since the
> correction, both red on the first form: a run whose first iteration is silent and whose queued prompt's iteration
> answers says only that iteration 1 ended without an answer; one whose both iterations are silent says so of iteration
> 1 and then that the run ended without one. `packages/engine/src/run/coordinator-plan.test.ts` pins the root that answers
> when asked and is then silent after a plan correction: nothing is said (red on the first form). `slice-proof`'s answerless
> path now requires the row (`toldNoAnswer`, `apps/desktop/scripts/lib/live-answers.mjs`, with its case). In the built
> app, `pnpm part-h-proof`, `pnpm part-j-proof` and `pnpm plan-gate-proof` passed: no scripted root there ends silent, so
> they show the re-prompt asks nothing of a root that answers. **What was not measured.** No built-app or live run met a
> silent root: `slice-proof`'s question against the live endpoint is where one was seen, and it is the orchestrator's to
> run. The row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).

> **First execution of revision 2, 2026-10-07 (fin31):** built with [`PD-ORCH-015`](#pd-orch-015), whose first execution
> records it: the re-prompt now fires only while the execution's answer is empty. Pinned by the case "at the default
> configuration a root that answers with an item pending is corrected once, records it, and the iteration closes succeeded
> with no re-prompt" in `packages/engine/src/run/coordinator-plan.test.ts` (red on `a68f121`, where no correction was sent);
> `answerless.test.ts`'s five cases and the case "PD-ORCH-009 beside REQ-ORCH-078" stay green. Found nothing against the
> text.

> **Reported back 2026-10-13 (fin41), from the live packs at `552d346` (default and duress) and `0bc3eee`**: **NOT REACHED** in any
> of the three. Revision 2's re-prompt was owed nowhere: 0 requests carry it, and every root's last request ended with text.
> Found nothing, because nothing met the case. Evidence:
> [`live-552d346-default-autopsy.md`](../architecture/live-runs/live-552d346-default-autopsy.md),
> [`live-552d346-duress-autopsy.md`](../architecture/live-runs/live-552d346-duress-autopsy.md),
> [`live-0bc3eee-default-autopsy.md`](../architecture/live-runs/live-0bc3eee-default-autopsy.md).
> The rows are in [`../architecture/first-executions.md`](../architecture/first-executions.md).

> *fin42, the same day:* a default run cannot be relied on to produce a silent root, so the live measure stays owed; fin42
> adds the opt-in `empty-answer` scenario, in which the recording proxy gives the coordinating root an empty completion.

> **The silent root in the built app, and the live scenario written, 2026-10-13 (fin42, the survey's N56).** The scripted client
> gains a `silent` step (a call that ends `stop` with neither text nor a tool call; `scripted-client.test.ts`), and `pnpm
> part-h-proof` two launches: `answerless` (`silent,silent`) — the root asked once, logged once and once in its conversation,
> then "The run ended without an answer: orchestrator ended its turn without writing one, even when asked once more." and one
> warning `incomplete_execution` issue with `reprompted` and `run_ended`, the session `completed`; `answer-when-asked`
> (`silent,report`) — asked once, its answer in the transcript, and neither row nor issue. **Found nothing against the text**, of
> revision 1 or 2: the first built-app run to meet a silent root. The live half is written, not run: the recording proxy's new
> `empty` rule (`lib/model-traffic.mjs`, pinned by `model-traffic.test.ts`, including that the product's own model client reads
> its answer as a `stop` with no text and no tool call) answers the coordinating root's completions — the requests whose
> instructions open "You are the orchestrator.", the classifier's excluded — with an empty completion, and the opt-in
> `empty-answer` scenario should show, with both of the root's calls emptied, exactly one re-prompt sent and logged, the row and
> the issue; with the first only (`empty-once`), one re-prompt, the model's own answer, and neither. The run is the
> orchestrator's. The row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).

> **First execution of revision 3, 2026-10-14 (fin43, `fin43-live-findings`):** built as ruled. `LoopSupervisor.withdrawStuck()`
> (`packages/engine/src/run/supervisor.ts`) clears a pending trigger only when it is `stuck` and leaves the consecutive-activation
> count alone; `Run.turn`'s `correction()` calls it on the root's supervisor immediately before it returns `ANSWER_REPROMPT`.
> **What was measured.** `supervisor.test.ts`'s three `withdrawStuck` cases (a stuck trigger withdrawn and the next `check()`
> continuing with no classifier call; a raw-count trigger kept; the count unchanged) and `answerless.test.ts`'s two revision-3
> cases with a supervisor and a scripted classifier (silent then an answer; silent then silent, the person told once): the
> re-prompt request ends with `ANSWER_REPROMPT`, the classifier is not called and no `loop_supervisor_activation` is written —
> all five red on `29dbc4e`. `children.test.ts` pins the edge: a delegated child's empty turn still arms stuck and its
> REQ-ORCH-095 re-prompt request carries the corrective (REQ-ORCH-096 unchanged; raised as OQ-283). In the built app, `pnpm
> part-h-proof`'s `answerless` and `answer-when-asked` launches, with `circuit_breaker.enabled: true`, show 0 loop
> classifications and 0 stuck activations beside the row, the issue and the answer as before (load about 1.5 on 4 CPUs); on a
> build without the `withdrawStuck` call the same proof failed at `answerless` with one stuck activation ("Pause and reassess
> the current path. …", `activation_count` 1). **Found beside it, not decided:** a stuck trigger a root's last empty turn leaves
> pending is taken by its next turn after a plan correction (OQ-284; two `coordinator-plan.test.ts` cases); the next iteration's
> root is a fresh supervisor and does not take it. **What was not measured:** the live `empty-answer` and `empty-once` scenarios,
> which now also check that no stuck classification was asked and no stuck activation written; the run is the orchestrator's.
> The row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).

> **First execution of revision 4, 2026-10-14 (fin44, `fin44-supervision-and-match`):** built as ruled. `withdrawStuck()` gains
> two callers: `IterationChildren.execute` (`packages/engine/src/children/orchestration.ts`) immediately before a delegated
> child's REQ-ORCH-095 re-prompt, and `Run.turn`'s `correction()` (`packages/engine/src/run/run.ts`) immediately before it
> returns a plan correction, where it also calls `noteUserInstruction()` — REQ-ORCH-105's todo-correction message, which the
> build had never told the supervisor of. **What was measured.** `children.test.ts`, "PD-ORCH-009 revision 4 (OQ-283)": silent
> then an answer, and silent twice (the child `failed` with `no_activity`, no activation, no escalation), both red on `a3be56c`;
> `coordinator-plan.test.ts`, "PD-ORCH-009 revision 4 (OQ-284)": the two cases that pinned OQ-284 flipped (the correction last,
> no classification, no activation) and the REQ-ORCH-105 reset (activations counted 1, 2, then 1, no escalation), all three
> red on `a3be56c`, and a guard that a raw-count trigger the answered turn armed is kept, green before and after. In the built
> app, `pnpm part-h-proof` (load 3.0 to 3.5 on 4 CPUs) with two new launches, both with `circuit_breaker.enabled: true`:
> `silent-correction` (`planopen,silent,silent,plandone,report`) — the correction sent once and followed by the root's own step,
> 0 stuck activations, 0 loop classifications, one `succeeded` iteration; `silent-child` — the child's re-prompt sent once and
> followed by its own step, 0 and 0, the child `succeeded`. **Found beside it:** the route revision 4 leaves out, a root silent
> while its background child runs, takes the stuck corrective after the child's report (pinned as found in `children.test.ts`;
> [OQ-296](../architecture/open-questions.md#oq-296)). **What was not measured:** a build without the calls through the new
> launches (the unit cases are the red evidence), and any live run — the `empty-answer` scenario with the plan open and a
> delegation scenario meeting a silent child are the orchestrator's. The row is in
> [`../architecture/first-executions.md`](../architecture/first-executions.md).

> **First execution of revision 5, 2026-10-14 (fin45, `fin45-supervision-and-quit`):** built as ruled. `withdrawStuck()` gains a
> fourth caller: `IterationChildren.runWithChildren` (`packages/engine/src/children/orchestration.ts`), unconditionally, in the
> branch where a child of the parent is pending or unobserved, before the wait — keyed by the agent the loop runs (the root's id
> `Run` passes in, or a delegated child's task id), so one placement covers the root, a delegated child acting as parent, the
> REQ-MONITOR-135 steering-wake step and a child already ended unobserved. `noteUserInstruction()` is not called. **What was
> measured.** `children.test.ts`, "PD-ORCH-009 revisions 4 and 5": the as-found case flipped (the report ends the resumed request,
> no classification, no activation); a root that delegates and waits silently across three batches completes with no
> `circuit_breaker_escalation`; a delegated child silent while its own background child runs takes no stuck activation; and a
> root silent again after its last report, nothing pending, is still sent `ANSWER_REPROMPT` as the last message of its request
> with no activation — all four red on `ee586d3`; a guard that a raw-count trigger the silent turn armed (message threshold 2) is
> kept and taken after the report, green before and after. In the built app, `pnpm part-h-proof`'s new `silent-wait` launch
> (`plan:3`, then three times a background delegation and a silent root turn, then `done` and the answer; `circuit_breaker.enabled:
> true`): 3 reports, each the last message before the root's next step, 0 stuck activations, 0 escalations, 0 loop
> classifications, the session `completed` / `tasks_complete` (load 0.8 to 3.0 on 4 CPUs). On a build without the call the same
> launch failed: three stuck activations, the third an escalation, "Pause and reassess delegate around …" after each of the first
> two reports, and the session `failed` / `agent_session_aborted`. **Found beside it, not against the text:** the stuck
> classification is not what the launch's classification count discriminates — on the red build it was also 0, because the
> activation budget (REQ-NOTIFY-106, 2 s from when the trigger was armed) is spent while the root waits on its child, so the
> deterministic corrective is sent without a classifier call; the stuck-activation count is the discriminating check. **What was
> not measured:** a live run, the orchestrator's. Written for it: the opt-in `empty-answer` group's third launch, `empty-wait`,
> in which the recording proxy's `empty` rule (since fin45 its `when` and `unless` may be lists; `model-traffic.test.ts`) empties
> the root's request right after an admitted background delegation; it should show the child's report as the final message of
> the request that resumes the root, nothing behind it, no `Trigger: stuck` classification, no root stuck activation and no
> `agent_session_aborted` (`waitReading`, `lib/plan-open-reading.mjs`, pinned by `plan-open-reading.test.ts`). The row is in
> [`../architecture/first-executions.md`](../architecture/first-executions.md).

---

<a id="pd-hooks-001"></a>

### PD-HOOKS-001 — `child_completed` fires only while a run's lifecycle hooks are live

`child_completed` SHALL fire for a delegated child that finishes while a run's lifecycle hooks are live: after that run's
`session_start` and before its `session_end` begins, at the place REQ-HOOKS-076's order gives it. A child that finishes
outside that window fires no `child_completed`, then or later, and no later run of the session owes it. Five paths end a
child outside the window, and none fires it:

1. the cancel of one paused child while its session rests (`PD-ORCH-005` clause 16), where no run and no hook port exist;
2. an explicit cancel that lands after its run has come to rest, once the run's `session_end` has fired;
3. the record of an accepted explicit cancel whose run host died, written from the store by a repair, which has no run, or
   by the next continue before its run exists;
4. the stale settle (REQ-ORCH-053) of a run that ends before its `session_start`, a stop requested during its pre-flight or
   a raise before that point;
5. the user's cancel of one paused child (REQ-ORCH-133) accepted while the run's own `session_end` hooks run, or after them
   and before the run has ended. The cancel is still accepted: the child ends `cancelled` with its report, its
   `child_user_cancelled` entry and its teardown.

Every path the specification places inside a run fires it, after the run's `session_start`: the cascade (REQ-ORCH-048),
the finalize sweep (REQ-ORCH-052), the user's cancel of one child in a live run (REQ-ORCH-133), the stale settle of a run
that has started (REQ-ORCH-053), and the decline of a resumable iteration (`PD-ORCH-005` clause 6). Every other event of
REQ-HOOKS-003 fires as that requirement states.

**As built.** `Run`'s teardown awaits the hooks of children that ended outside their execution
(`Run.childCompletionsSettled`) and then calls `IterationChildren.endLifecycle` before `session_end` fires, so from then no
`child_completed` is queued (`packages/engine/src/run/run.ts`, `packages/engine/src/children/orchestration.ts`); pinned by
`children.test.ts`, "REQ-HOOKS-076 / REQ-HOOKS-081 with OQ-154 …".

**Why, and what it costs.** OQ-154: REQ-HOOKS-003 fires `child_completed` "whatever its final state" and names no
exception, while REQ-HOOKS-076 and REQ-HOOKS-080 place it inside a run, between its `session_start` and its `session_end`.
Firing on the five paths at the moment would run a hook with no `session_start` before it or after the `session_end` it
should precede (REQ-HOOKS-081), or would need a hook port resolved for no run; owing it to the next run would announce,
perhaps much later, a child that run never saw, and never if the session is not continued. The owner accepted the built
behaviour and asked for the specification to say so. What it costs: a hook that counts children on `child_completed`
misses a child that ended on one of the five paths; the child's terminal state, report and timeline entries are recorded
as for any other.

> **Narrows:** REQ-HOOKS-003

*Raised by the owner, 2026-10-06; logged as [R-071](requests.md#r-071), the ruling of OQ-154.*

---

<a id="pd-orch-010"></a>

### PD-ORCH-010 — a child is never named after a root of its session

*Renumbered before landing: built as `PD-ORCH-009` on its branch, it took the next free number, `PD-ORCH-010`, when `PD-ORCH-009` (the answerless entry role, OQ-199) landed on `main` first; its citations followed.*

Beside REQ-ORCH-044's rule, a delegated child at any depth SHALL NOT take as its canonical name the canonical name or the
persona of the root it works under, nor of any root the session has recorded: each iteration's root persona and root
canonical name, and each publishing root that no iteration records. Such a name is in use for that child, and the child is
renamed `<name>_<n>` by REQ-ORCH-044's own rule, though no sibling under its parent holds the name. A child named before
this rule was built keeps its name.

One case is accepted for the first release and left until after it: a **root named like an earlier child**. Where the
entry persona of a later run is one whose id an earlier child's canonical name already spells, the root's rows carry that
child's name, and the surfaces that know an agent by its name present the root as that child too, and the child as the
run-level agent. A root's name is its persona, which no ledger chooses.

**As built.** `ChildLedger.spawn` (`packages/engine/src/children/ledger.ts`) counts as taken, beside the parent's
children's names, its root's canonical name and persona and every recorded root's two names (`recordedRootNames`,
`packages/engine/src/children/naming.ts`). The accepted case is recorded in
[`fixed/a-root-named-like-an-earlier-child-is-presented-as-that-child-too.md`](../defects/fixed/a-root-named-like-an-earlier-child-is-presented-as-that-child-too.md).

**Why, and what it costs.** OQ-158: a transcript row, a tool call and an artifact know their agent by a name alone, so a
child whose canonical name a root carries is drawn as both agents. REQ-ORCH-044 renames only a name "reused" under the
child's parent. The other reading, rows that carry an identity the surfaces match instead of the name, widens the
transcript row's envelope and leaves every row recorded before on the name rule. The owner accepted the renaming. What it
costs: a child the model names `orchestrator` two levels down is `orchestrator_1` where REQ-ORCH-044 alone would keep its
name, and the root named like an earlier child stays drawn as both until after the first release.

> **Narrows:** REQ-ORCH-044

*Raised by the owner, 2026-10-06; logged as [R-071](requests.md#r-071), the ruling of OQ-158.*

---

<a id="pd-orch-011"></a>

### PD-ORCH-011 — `explicit_trivial` is a small edit, and the tie-break chooses among the plausible categories

*Renumbered before landing: built as `PD-ORCH-010` on its branch, it took the next free number, `PD-ORCH-011`, when `PD-ORCH-009` (the answerless entry role, OQ-199) landed on `main` first; its citations followed.*

*Revision 2 (2026-10-13, [R-072](requests.md#r-072), ruling [OQ-227](../architecture/open-questions.md)) — **what
`single_file_change` means**: one clause added after the rule's first paragraph, and the As-built paragraph replaced,
revision 1's quoted beneath it. Revision 1's meaning for `explicit_trivial` and its tie-break clause stay in force.*

`explicit_trivial` SHALL mean an explicitly stated, trivial **edit**: with `single_file_change`, one of the two smallest
edits, as REQ-ORCH-021's micro group holds them. A request that changes nothing is not `explicit_trivial`, however small
it is: a question about one file belongs to the answer group (`question`, `exploration`). REQ-ORCH-006's tie-break, "when
several categories are plausible the tie-break prefers `moderate_feature`", SHALL choose among the categories that are
plausible for the request: it prefers `moderate_feature` where `moderate_feature` is itself one of them, and never brings it
into reach of a request for which no build is plausible. The thirteen categories, REQ-ORCH-006's two fixed meanings and
REQ-ORCH-007's fallback are unchanged.

**`single_file_change` — revision 2 (OQ-227).** `single_file_change` SHALL mean a small edit confined to one file, as the
request states or implies. A change requested together with a test of it, or one naming several files to change, is
outside it unless the request places all of it in one file. The classifier's instructions SHALL state this on every rung.
`explicit_trivial` keeps revision 1's meaning — an explicitly stated trivial edit, with no file count — so a small chore
across files that the request states to be trivial stays in the micro group. REQ-ORCH-016 and `PD-ORCH-006` are unchanged:
the direct-work grant follows the category, never a measured size.

**As built — revision 2.** The classifier's system prompt, which every rung sends, carries the clause above in one sentence
beside revision 1's "the two smallest edits" and the tie-break (`CLASSIFIER_SYSTEM_PROMPT`,
`packages/engine/src/intent/classifier.ts`); the json_object rung's example ("one file, one edit") agrees with it and is
kept. The product still takes the category the model answers. `slice-proof` keeps its accepted sets and its single
ask-once-more retry (`INTENTS`, `intentOutcome`, `apps/desktop/scripts/lib/live-answers.mjs`), which now cite this revision
for why the micro group is out of reach of a feature and its test.

> **Revision 1 said, and no longer governs:** "**As built.** The classifier's instruction already calls `explicit_trivial`
> and `single_file_change` "the two smallest edits" and passes the tie-break on in REQ-ORCH-006's words
> (`packages/engine/src/intent/classifier.ts`); neither is changed. The product takes the category the model answers: it
> does not overrule a model that classifies a question `explicit_trivial`. `slice-proof` accepts the answer group alone for
> its question about `README.md` (`INTENTS`, `apps/desktop/scripts/lib/live-answers.mjs`), so that answer is a red there."
> The last two sentences still hold.

**Why, and what it costs.** OQ-198: REQ-ORCH-006 names `explicit_trivial` without a meaning, and REQ-ORCH-021 groups it with
`single_file_change` apart from the answer group. The two readings route a run differently: the micro group's playbook cells
in place of the answer group's, and in `plan` mode a hold at the plan gate, which exempts the answer group alone
(REQ-ORCH-153). Read literally, the tie-break would classify every request with several plausible categories as
`moderate_feature`. The owner ruled the edit reading and the tie-break among the plausible. What it costs: a model that
still answers `explicit_trivial` for a question (one run in nine against the registered endpoint on 2026-10-03) routes it
as an edit, and `slice-proof` reports that run red where it accepted it before.

**Why, and what it costs — revision 2.** OQ-227: REQ-ORCH-006 fixes no meaning for `single_file_change`, and the build gave
it a rung-dependent one: only the json_object rung's example said "one file, one edit", while the json_schema rung — which
carried finacc3 A2-03's `single_file_change` (0.82) for a flag and its unit test — said nothing. REQ-ORCH-014 shows the
identifier on screen, so the user saw their request mislabelled, and under `PD-ORCH-006` the category granted the
coordinator the direct-work bundle and the micro cell, so the same prompt ran directly in one launch and delegated in the
next. Letting the grant follow a measured size instead would need a repository measurement REQ-ORCH-008 excludes, and would
hide from REQ-ORCH-016's user-inspectable mapping what decides the grant. What it costs: a small change requested with its
test now classifies as a build and runs delegated, which the live record measured at 114 to 146 s against 19 to 33 s for
direct work; in languages that keep unit tests in the same file, the request must say so to stay in the micro group; and
prompt guidance is probabilistic, so a sampled model may still miss, which `slice-proof`'s one retry absorbs.

> **Narrows:** REQ-ORCH-006

*Raised by the owner, 2026-10-06; logged as [R-071](requests.md#r-071), the ruling of OQ-198.*
Revision 2 logged as [R-072](requests.md#r-072) (OQ-227), ruled by the consortium under the owner's delegation, both
advocates' recommendation followed: the system-lens advocate's wording, with "small", and glossary step; the user-lens
advocate's first execution against the registered self-hosted endpoint.

> **First execution of revision 2, 2026-10-13, built in plan fin34:** the clause is in the classifier's system prompt and
> reaches all three rungs. **What was measured.** `intent.test.ts`'s OQ-227 case drives the ladder down json_schema,
> json_object and text with the flag-and-test prompt and finds the sentence in every rung's system prompt, red before the
> change; the rest of the classifier's cases and `live-answers.test.ts` stay green. **What was not measured.** Whether the
> live model now answers a build category for that prompt: the first live `pnpm slice-proof` against the registered
> self-hosted default (R-068) is the orchestrator's to run — an agent's live-run launch is refused — and should show intents-3
> in the build groups and intents-2 in the micro group, with the one retry still absorbing a single sampled miss. Recorded in
> [`../architecture/first-executions.md`](../architecture/first-executions.md).
>
> **Revision 2's first live execution, the default live run at `552d346` (the registered self-hosted endpoint,
> `qwen3.8-flash-next`, 2026-10-13; finding Q2), reported in place — a NOTE:** the sentence reached 10 of 10 classifier
> requests (the system prompt 898 → 1,141 characters). The classifier was cut at its 12 s bound in **4 of 10 launches** (edit,
> resume, faults-args and terminal), against 2 of 10 at `a68f121`, and the duress launch of the same build was cut too
> (11,975 ms). The one prompt this revision defines, faults-args, was cut at 11,978 ms with 3,600 reasoning characters and still
> undecided, its reasoning never engaging the categories, and fell back to `moderate_feature` (launch audit `fallback: true`);
> `a68f121` had classified it `single_file_change` 0.92 in 7.0 s. The cut sent a one-file create through a coordinator and a
> child: 169.1 s and 80 k tokens against 43.3 s and 23 k. The same prompts reasoned longer than at `a68f121` (faults-ladder 787 →
> 1,234 characters, faults-stall 786 → 2,114, frictions 1,073 → 1,544; requirements fell, 1,973 → 1,478). **The endpoint's
> pace confounds it:** terminal's classifier received 0 bytes in 11,967 ms and edit's 201 chunks, and in three stretches single
> requests ran at 10 to 22 output tokens/s with nothing else of the run in flight, against 64 to 74 at other times. Read from the
> copied traffic by the R-072 consortium's ruling of [OQ-258](../architecture/open-questions.md#oq-258): the cuts of duress,
> resume and faults-args deliberated over which key to write the category under (the strict rung named none), edit's was still
> applying the tie-break, and terminal's was the endpoint queueing. So this revision's sentence is not shown to have lengthened
> classification; the key deliberation is OQ-258's, repaired by naming the keys on the strict rung, and the next default pack is
> the measure.

> **Reported back 2026-10-13 (fin41): revision 2 at `0bc3eee`, "the next default pack" named above** (pack
> `2026-10-13T12-18-40-282Z`; [`live-0bc3eee-default-autopsy.md`](../architecture/live-runs/live-0bc3eee-default-autopsy.md)). The classifier answered on its strict rung in **9 of 10 launches** (2.3 to 9.8 s),
> against 6 of 10 at `552d346`; every request ended with OQ-258's keys sentence and no reasoning debated which key to write. The
> one cut, requirements at 11,973 ms, received 91 kB of stream and was still weighing `small_feature`, `moderate_feature` and
> `single_file_change` against the prompt's tie-break, so neither of OQ-258's reopening limbs is met. **faults-args, the prompt
> this revision defines:** classified `explicit_trivial` 0.78 in 9.1 s, not `single_file_change`, and the coordinator wrote the
> file itself in 46.1 s (169.1 s at `552d346`, 43.3 s at `a68f121`). Both are direct-work categories, so the route the revision
> wants was taken and the label it defines was not. Whether the sentence lengthens classification is still not separable from
> the endpoint; with the keys named it no longer shows as cuts.
> The row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).
> *Since 2026-10-13 (fin41, item N67) the next default pack is read by the live run itself: a NOTE gives each launch's
> classification, its seconds and each cut's bytes received, and counts the fallbacks (`lib/intent-reading.mjs`); over the
> `0bc3eee` pack it reproduces the figures above, faults-args `explicit_trivial` 0.78 in 9.2 s.*
>
> **Reported back 2026-10-15 (fin47), revision 2 at `3c03287` — a NOTE** (pack `2026-10-15T03-10-08-908Z`, fin46's final
> acceptance, finding F7; ruled as [OQ-332](../architecture/open-questions.md#oq-332) under [R-072](requests.md#r-072)).
> **faults-args, the prompt this revision defines, fell back instead of reaching the micro group.** Its classification was cut at
> REQ-ORCH-008's 12 s bound (11,972 ms, about 95.6 kB of stream) after its reasoning had named `single_file_change` at 0.85 and
> then reopened the choice against `explicit_trivial`; it took REQ-ORCH-007's fallback, `moderate_feature`, and the coordinator
> delegated one child (70 s) instead of writing the file itself. The cause is the reasoning's category deliberation within the
> bound, not this revision's meaning: the label it reasoned toward was the one this revision defines, and no key was debated. OQ-332
> rules the cut category deliberation, so neither of OQ-258's reopening limbs is met (2 cuts in 17 launches), and this revision, the
> strict rung and the bound stand as built. The live run's intent NOTE now prints each cut's reasoning tail, so the next pack shows
> without an autopsy whether a cut settled its category. The row is in
> [`../architecture/first-executions.md`](../architecture/first-executions.md).

---

<a id="pd-orch-012"></a>

### PD-ORCH-012 — a task answers for the plan items opened since it was first taken up

*Renumbered before landing: built as `PD-ORCH-011` on its branch, it took the next free number, `PD-ORCH-012`, when `PD-ORCH-009` (the answerless entry role, OQ-199) landed on `main` first; its citations followed.*

REQ-ORCH-075's "the agent's own todo list still holds pending/in-progress items" SHALL range over the items of the
coordinator's plan that the task in hand answers for, not over the whole session plan. A task answers for every item that
is not terminal and was not already open when the task was first taken up, and for no other:

- Its **first take-up** is the plan cycle that planned it, where one did (REQ-ORCH-153); otherwise its first iteration in the
  session.
- The record of what was open at that take-up is **kept with the task**, so every later iteration of it reads the same
  record: the one a continue resumes, and a fresh iteration of the re-queued task in the same run or a later one. A revise
  cycle, and the plan cycle after a resumed iteration (`PD-ORCH-003` revision 2), keep a record the task already carries.
- An item the task's plan cycle wrote, one the task opened, and one its own earlier iteration left open therefore always
  hold it; an item that a task given up on (REQ-ORCH-077), an earlier run or anything else left open before the task was
  first taken up never does. An item a person adds to the agent plan during the task (REQ-CHAT-090) holds it. A `PENDING`
  item re-listed by REQ-TOOLS-146's `replace` in the id-less shape is given a new id, so it is the re-listing task's.
- An item excused this way is **not altered**: it stays open in the plan the Todo pane counts.
- The continuation marker block naming the open items goes to the same task's next fresh root only, and is dropped when the
  task completes or is given up on.
- A task first taken up by a build that kept no such record has none, and every open item is held against it.

REQ-ORCH-029's clause "it does not report the run successful while a todo item is non-terminal" reads the same way, under
[`PD-ORCH-006`](#pd-orch-006) revision 2, the directive that narrows that requirement.

**As built.** `Task.planExcused` and `Task.planLeftOpen` (`packages/engine/src/run/todo.ts`), kept with the planner task in
the stored todo; `Run.planCycleTakeUp`, `Run.takeUp` and `openPlanItems`'s `excused` (`packages/engine/src/run/`); pinned by
`packages/engine/src/run/coordinator-plan.test.ts`.

**Why, and what it costs.** OQ-203: the plan is the session's and outlives every task, run and iteration. Read literally, an
item a given-up task or an earlier run left open holds against every later task, each re-queued and given up on in turn
though its own work was done: a record that disagrees with what happened, which REQ-ORCH-029's other clause forbids, and a
root told to finish another task's work, which REQ-ORCH-067 forbids. No requirement says which items belong to which task.
The owner confirmed the take-up reading as built. What it costs: a run can complete while its plan holds an item no task
answers for, and the Todo pane shows it open beside a completed run.

> **Narrows:** REQ-ORCH-075

*Raised by the owner, 2026-10-06; logged as [R-071](requests.md#r-071), the ruling of OQ-203.*

---

<a id="pd-monitor-003"></a>

### PD-MONITOR-003 — the run-level agent carries its own tool-call count, and the run's aggregate is the run's total

The run-level agent that the inspector, the Mission view and the persona windows present (the run's synthetic root of
REQ-MONITOR-043, which is never a tree row) SHALL carry, as REQ-MONITOR-044 and REQ-MONITOR-052 give every agent, **its own**
tool-call count and called-tool history: the calls of the session's roots, which is the persisted total less every child's
persisted count, plus the live root's calls not counted yet. REQ-MONITOR-101's "aggregate run count" SHALL be the run's
displayed total of REQ-MONITOR-102, and not the run-level agent's count; no surface draws the run's aggregate called-tool
history, and the run-level agent's called history is the roots' own. The run-level agent's compression count is the
run-wide count (REQ-MONITOR-086). Every other agent node exposes its own count and history, as REQ-MONITOR-101 states.

**As built.** `runLevelAgent` (`packages/ui/src/agents.ts`) reads `SessionRecord.entryToolCalls` (`entryToolCallsOf`,
`packages/engine/src/sessions.ts`, with `Run.entryUncountedToolCalls`), `entryTools.called` and `compressions`; the run's
total is `SessionRecord.toolCalls.total`.

**Why, and what it costs.** OQ-159: REQ-MONITOR-101 gives the synthetic root the aggregate, while REQ-MONITOR-044 and
REQ-MONITOR-052 give every agent as presented its own count on its meta line and do not except the run-level agent. The two
part whenever a child has called a tool. The owner confirmed the agent's own count as built. What it costs: the run-level
agent's `{N} tool calls` is smaller than the run's total whenever a child has called a tool, and a reader adds the children's
counts, or reads the run's total, to see the whole.

> **Narrows:** REQ-MONITOR-101

*Raised by the owner, 2026-10-06; logged as [R-071](requests.md#r-071), the ruling of OQ-159.*

---

<a id="pd-monitor-004"></a>

### PD-MONITOR-004 — the quota wait's model picker lists every configured model, an out-of-quota one marked, and keep waiting retries an out-of-quota wait now

*Revision 2 (2026-10-06, [R-071](requests.md#r-071)) — **keep waiting**, the paragraph and clauses marked below, which rule
OQ-188 as the owner took its recommendation. Revision 1 (2026-10-06, [R-071](requests.md#r-071), the ruling of OQ-186) is
quoted where it is replaced, never deleted.*

The model picker that the quota wait's "change model" opens SHALL list **every configured model key** the configuration
snapshot holds, in alphabetical order, the waiting model included. It applies neither REQ-MONITOR-193's filter and order
(the same-tier candidates in declaration order) nor REQ-NOTIFY-074's (other providers first, the failed model left out),
and no model is labelled with its provider. A key whose provider-and-model pair the session recorded out of quota is
listed in its place, annotated "provider reported insufficient quota in this session", and stays choosable, as
REQ-MONITOR-194 asks of every model selector. What a choice of a model then does, and every other clause of
REQ-MONITOR-303 and REQ-NOTIFY-263 but keep waiting's (below), is unchanged by this directive.

**Keep waiting — revision 2.** On the quota-wait decision surface (REQ-MONITOR-303, REQ-NOTIFY-263), **keep waiting** SHALL depend on the wait's variant:

1. Where automatic resume is **not** allowed — a provider-and-model pair recorded out of quota (REQ-MONITOR-194) — keep
   waiting SHALL resolve the wait as a retry of the same pair at once and return the status to `running`. It is a retry,
   never a change of model: it clears the pair's out-of-quota exclusion as an explicit choice of the pair does
   (REQ-MONITOR-194), persists no override, and takes back an earlier override of the pair (`PD-ORCH-013`), so the retry
   calls it. It resumes the agents parked out of quota on that pair, each on its own model; an agent parked on another pair
   is not moved and stays in its own wait, which the surface shows next. A further insufficient-quota answer records the
   pair again and parks the agent in a new wait. One press retries the wait shown once: a press that reaches no outstanding
   out-of-quota wait — one already retried, or a timed one — is refused and changes nothing, and never switches the entry
   model.
2. Where automatic resume **is** allowed, keep waiting SHALL acknowledge the choice and change nothing: the wait goes on
   and its timer resolves it as a retry when the interval elapses (REQ-MONITOR-192, REQ-NOTIFY-087).

Neither adds an operation to REQ-MONITOR-004's enumeration: the retry travels on the switch-of-entry-model operation, marked
as keep waiting and naming the wait it answers (its agent and attempt) and the waiting pair's model key, which the session
record's wait carries; so marked, it switches nothing. Where no model key names the waiting pair — a configured key first,
else a discovered one — keep waiting acknowledges in both variants; change model and cancel the run remain.

> **Revision 1 said, and no longer governs:** "What a choice then does, and every other clause of REQ-MONITOR-303 and
> REQ-NOTIFY-263, is unchanged by this directive" — so keep waiting stood as REQ-MONITOR-303 states it, which the build
> read as the absence of a decision ([OQ-188](../architecture/open-questions.md)).

*This revision was minted on its branch as a directive of its own (`PD-MONITOR-004`, then `PD-MONITOR-007` at the landing
rebase) and folded into this one there, since `main` had meanwhile given REQ-MONITOR-303 this directive's narrowing and the
symbol generator refuses two directives narrowing one requirement (`README.md`, Identifiers).* *(No longer binding since 2026-10-13, [OQ-237](../architecture/open-questions.md): two directives may narrow one
requirement in disjoint cases when one names the other, so such a case need not be folded here; what was folded here stays.)*

**As built.** `WaitHeader` and `waitModelOptions` (`packages/ui/src/WorkspaceView.tsx`), the annotation read from the
record's `wait.excluded` (`excludedModelKeys`, `packages/engine/src/run/resilience.ts`).

**Why, and what it costs.** OQ-186: REQ-MONITOR-303 offers REQ-MONITOR-193's candidates beside the excluded pairs, and
REQ-NOTIFY-263 opens REQ-NOTIFY-074's list, which has no tier, labels each model with its provider and leaves out the very
model REQ-MONITOR-194 would list annotated. The built list holds both requirements' models and applies neither's filter,
and marks what REQ-MONITOR-194 asks every selector to mark. The owner accepted it and asked for both requirements to
describe it. What it costs: a model of another tier, or of the provider that failed, is offered beside the candidates the
ladder itself would try, in an order that says nothing about which the ladder prefers.

*Revision 2's reasons.* REQ-MONITOR-303 says keep waiting resolves the wait as a retry; the build had read it as the
absence of a decision, so in the out-of-quota wait the button did nothing and a user who had topped up the account had no
obvious way to resume short of choosing the same model in the change-model picker. Retrying a timed wait early would only
meet the provider's limit again before its interval ends. The owner ruled the retry for the out-of-quota wait and the
acknowledgement for the timed one (OQ-188). What it costs: in the timed wait keep waiting departs from REQ-MONITOR-303's
"resolves the wait as a retry", and the user who wants to try before the interval ends has no control for it.

> **Narrows:** REQ-MONITOR-303, REQ-NOTIFY-263

*Raised by the owner, 2026-10-06; logged as [R-071](requests.md#r-071), the ruling of OQ-186.*

*Revision 2 raised by the owner, 2026-10-06, ruling OQ-188 as recommended; logged as [R-071](requests.md#r-071).*

> **First execution of revision 2, 2026-10-06, built under [R-071](requests.md#r-071) (plan fin21):** the record's `wait` gained `modelKey`
> (`keyOfPair`, `packages/engine/src/run/resilience.ts`: the first configured key naming the pair, else the first discovered
> one, else null), and the wait header's Keep waiting reads `keepWaitingAction` (`packages/ui/src/WorkspaceView.tsx`): with
> `resumeAt` null and a key it sends `setModel` with that key and says "Retrying <key> now.", reaching
> `Run.setEntryModel`'s existing quota-retry branch; otherwise "Still waiting." and nothing sent. The field was first named
> `key`, and ADR-0030's credential-shape test (`providers.test.ts`, consequence 2) refused it as a field named like a
> credential; it is `modelKey`, beside the record's `entryModelKey`. It also found the clause about
> other parked agents, which the existing branch already did (`overrideWaitingPairs`) and which the directive now states.
>
> **Corrected the same day (repair round 1 of plan fin21, the verifier's findings), the clause above kept as it was found:**
> the first build sent a plain `setModel` and so reached `setEntryModel`'s quota-retry branch, the change-model chooser's own
> path for the waiting pair. That branch moves every other parked agent to the waiting pair with a `model_override` that
> "stands for the rest of the session" (`overrideWaitingPairs`) — a change of model the user never chose, which the first
> text of clause 1 wrote down as "an agent parked on another pair resuming on the waiting pair" — and with no wait current, a
> second press (a double-click before the next snapshot) switched the entry model to the waiting pair. Clause 1 now says
> keep waiting moves no other agent and that a press reaching no outstanding wait is refused. Built as `Run.keepWaiting`
> (`setModel` marked `keepWaiting`, with the wait's `agent` and `attempt`): it refuses a press naming no outstanding
> out-of-quota wait or a key of another pair, and resumes the agents parked out of quota on the waiting pair alone
> (`WaitRegistry.retryOn`); the header sends once per wait drawn (`keepWaitingAction`'s `sent`). The change-model chooser's
> choice of the waiting pair is unchanged. **Measured:** three `ladder.test.ts` cases on two agents parked at once (the root
> on a1, a child on b1): keep waiting on a1 leaves the child in its own wait on b1, retried there next, with no override and
> both exclusions cleared — red before, the child moved to a1 with a `b1 → a1` override. The same case pins the pair filter of
> `WaitRegistry.retryOn` (repair round 2, the verifier's finding that it could be removed with every test green): after the
> press on a1 the child's wait is still its first (attempt 1), the session still has two `model_wait` issues and b1 was called
> once — red with the filter cut to `p.state.exhausted`, where the press took the child off its own wait and it re-entered a
> new one at attempt 2 with a third `model_wait` issue; a second press for the wait already
> retried is refused and writes no `entry_model_switched` — red before, `{ok: true}` and a switch to b1; presses naming another
> pair, another attempt or another agent are refused and change nothing — red before. `ui.test.ts`: `keepWaitingAction`
> answers `sent` after a retry was sent for the wait shown — red before. `resilience-proof`'s `keep-waiting` now presses Keep
> waiting twice in one frame and requires one retry row and no `entry_model_switched`.
> **Measured as first built (the plain `setModel` the correction above replaced):** `ladder.test.ts` (a quota wait's record names `modelKey: 'a1'`, and `setModel` with it completes the run on a1,
> a1 recorded then cleared, no override, no refusal; a timed wait names its key too), `ui.test.ts` (`keepWaitingAction`:
> retry in the out-of-quota wait, acknowledgement in the timed one, with no key, or with no `setModel` — red before, the
> function absent), and `resilience-proof`'s driven `keep-waiting` scenario on the built app (alpha refused on quota, Keep
> waiting pressed: calls alpha, alpha; `model_exhausted` recorded then cleared; no `model_override`). Not driven: the timed
> variant's acknowledgement in the built app, which is the unchanged behaviour. The row is in
> [`../architecture/first-executions.md`](../architecture/first-executions.md).

---

<a id="pd-monitor-005"></a>

### PD-MONITOR-005 — the stall watch counts the silence of the agent's own model steps, and a wait the run holds it in is not that silence

*Revision 2 (2026-10-06, [R-071](requests.md#r-071)) — **the `stall` issue is written with its warning, not at every
evaluation**, the owner's ruling of OQ-127. A clause is added after the paragraph on the provider library's retries, whose
last sentence is replaced and quoted beside its replacement, and a paragraph each joins "As built" and "Why, and what it
costs". Revision 1 (2026-10-06, [R-071](requests.md#r-071), the rulings of OQ-155 and OQ-173) is otherwise unchanged.*

The silence REQ-MONITOR-118 and REQ-MONITOR-119 count SHALL be the silence of a model step the agent has in flight. Three
waits are **outside** an agent's stall watch, though the agent has no model event, no token and no tool call in flight
through them:

1. **Between its turns**: from the end of a turn until the run starts its next — the wait on its own children, a resume into
   that wait (PD-ORCH-005 clause 4), or the end of its execution. An evaluation there reports no stall and no wait, logs
   nothing, and invokes the stall callback with *not stalled*; each child it waits on is watched for its own silence.
2. **A wait the run imposes between two model steps**: the retry backoff of REQ-ORCH-092 and the suspended wait on a
   provider limit of REQ-ORCH-091 (c).
3. **A compression's own model call** (REQ-MONITOR-076, REQ-ORCH-093), automatic or on a rejection.

Through 2 and 3, an evaluation past the stall timeout emits no `stall` issue and no stall warning, and invokes the stall
callback with *not stalled*; it logs, in REQ-MONITOR-118's manner, a line naming the wait (`… waiting on a retry backoff`,
`a provider limit` or `a context compression`) where REQ-MONITOR-118's line names the number of active tool calls, at entry
and at each repeat REQ-MONITOR-120's throttle allows, to the session log and with no timeline word. The wait's end restarts
the silence, as a tool call's result does, and so does the next turn the run starts. A stall under way when such a wait
begins, or when the turn ends, is over; it is logged recovered only on REQ-MONITOR-120's terms as OQ-153 reads them, when
the agent was active after the evaluation that last found it stalled.

The provider library's own short internal retries inside one model step are **not** such a wait: they stay counted as the
ordinary silence of that step, and REQ-MONITOR-119 governs them as this directive reads it. Every other clause of
REQ-MONITOR-118 and REQ-MONITOR-119 still governs, but for the cadence of REQ-MONITOR-119's `stall` issue, which the next
paragraph narrows — revision 2.

> *Revision 1 said, and no longer governs:* "and REQ-MONITOR-119 governs them as written. Every other clause of
> REQ-MONITOR-118 and REQ-MONITOR-119 still governs." Revision 2 narrows REQ-MONITOR-119's issue as well (OQ-127).

**The `stall` issue — revision 2.** At an evaluation that finds this silence with no tool call in flight, the diagnostic
issue of kind `stall` SHALL be emitted **only when that evaluation also writes the warning**: at stall entry, and then no
more often than REQ-MONITOR-120 lets the warning repeat (the stall timeout, or 30 seconds, whichever is longer). The issue
carries what REQ-MONITOR-119 lists — the agent's active tools, its recent tool calls and the type of the last model event
— and the silence at that evaluation, at warning severity. The warning is unchanged, and the host's stall callback SHALL
still fire at **every** evaluation, at REQ-MONITOR-117's interval, so a host countdown advances at that rate.

**As built.** `StallWatch.betweenTurns` and `StallWatch.imposedWait` (`packages/engine/src/children/stall.ts`), marked by
`execute` and `Run.turn` (`packages/engine/src/children/orchestration.ts`, `packages/engine/src/run/run.ts`), by
`resilientStep`'s backoff and provider-limit wait (`packages/engine/src/run/ladder.ts`) and by `runTurn`'s `compressing`
(`packages/engine/src/run/turn.ts`); the line is `stallImposedWaitLine`. Revision 2: `stallRecords` in
`packages/engine/src/children/stall.ts`, the one writer for a child's watch and the root's, whose `stalled` sink writes
the warning and the issue together when the evaluation's warning is due, and nothing otherwise.

**Why, and what it costs.** OQ-155 and OQ-173: REQ-MONITOR-118 tells a wait from a stall only by tool calls in flight, so
read literally each of these waits is "the same silence with no tool call in flight", and REQ-MONITOR-119 would have every
evaluation warn that a child waiting as designed on its own children "appears stalled", or that an agent the run itself
holds in a backoff, a provider limit or a compression is stalled, beside the wait's own notice (REQ-NOTIFY-083 to
REQ-NOTIFY-087). The owner confirmed both as built. What it costs: an agent held in one of these waits for longer than it
should be — a compression whose call is slow to answer, an exhausted provider's indefinite wait — is never reported stalled
by this watch; the wait's own bound and its notice are what speak for it.

**Why revision 2, and what it costs.** REQ-SESSION-133 keeps a session's newest 500 issues. With an issue at every
evaluation, one child stalled from its 90 s threshold to its 1,200 s `child_timeout` wrote 223 `stall` issues at the
default 5 s cadence, so two such children, or one with REQ-ORCH-088's fallback retry, could evict every other issue the
session had — the record an autopsy reads to find out what else went wrong. Written beside the throttled warning, the
same stall writes thirteen. What is given up: the issue record no longer holds each evaluation's silence between two
warnings; the agent's live figure (the callback, `stalled Ns` on its row) and the next warning carry it. OQ-127 raised
it; the owner ruled it as recommended. It is a revision of this directive and not a directive beside it because this
directive already narrows REQ-MONITOR-119, and precedence over one requirement must be unambiguous.

> **Narrows:** REQ-MONITOR-118, REQ-MONITOR-119

*Raised by the owner, 2026-10-06; logged as [R-071](requests.md#r-071), the rulings of OQ-155 and OQ-173.*

*Revision 2 raised by the owner, 2026-10-06, ruling OQ-127 as recommended; logged as [R-071](requests.md#r-071). Built
as `PD-MONITOR-003`, a directive of its own, and made this directive's revision 2 before it landed, once `main`'s
`PD-MONITOR-003` to `PD-MONITOR-005` had landed and this directive narrowed REQ-MONITOR-119 first.*

> **First execution of revision 2, 2026-10-06, built under [R-071](requests.md#r-071) with OQ-127's ruling:** the rule
> held as written. The watch's reports are written by one function for a child and the root alike (`stallRecords` in
> `packages/engine/src/children/stall.ts`), whose `stalled` sink writes the warning and the issue together when the
> evaluation's warning is due and nothing otherwise; the callback stays the caller's, at every evaluation. **What was
> measured.** `stall.test.ts` (a stall from 90 s to 1,200 s writes thirteen issues, each beside its warning) and
> `children.test.ts` (an end-to-end child stall: issues at 90 s and 180 s only, over nineteen evaluations that found
> it), both red on `37f7a98`. **What was not measured.** No live run: the `faults-stall` scenario's root stall should
> now leave one `stall` issue at 90 s before the 120 s idle bound, where it left one per evaluation. The row is in
> [`../architecture/first-executions.md`](../architecture/first-executions.md).
>
> **Measured live, 2026-10-06 (finacc3, finding F14):** the root stall left **one** `stall` issue, at 94 s of silence
> (the evaluation after the 90 s threshold, at the 5 s cadence), beside its one `WARNING` line, before the 120 s idle bound
> gave the call up. The `faults-stall` packs of the orchestrator's default live runs that day (at `c2fdd6a`, 15:47 UTC, and at 17:41
> UTC) already showed one such warning each, but the scenario's check asked only that an issue existed and would have passed one
> per evaluation as well ([`the-faults-stall-check-does-not-assert-the-stall-issue-throttle`](../defects/fixed/the-faults-stall-check-does-not-assert-the-stall-issue-throttle.md)).
> It now fails a repeat sooner than REQ-MONITOR-120's throttle (`apps/desktop/scripts/lib/stall-issue-cadence.mjs`), and
> `live-run.mjs --only=faults` at `4ddcc02` passed it ("1 stall(s): orchestrator at 94 s"). The row is in
> [`../architecture/first-executions.md`](../architecture/first-executions.md).

---

<a id="pd-workspace-006"></a>

### PD-WORKSPACE-006 — a code-intelligence setup's failure reads in these words where REQ-WORKSPACE-092 and REQ-WORKSPACE-093 give none

*Renumbered before landing: built as `PD-WORKSPACE-005` on its branch, it took the next free number, `PD-WORKSPACE-006`, when `PD-WORKSPACE-005` (the project-setup banner, OQ-171) landed on `main` first; its citations followed.*

The `code-intelligence-setup` task's step details and failure SHALL read as follows. REQ-WORKSPACE-092's two fixed
sentences for a stopped step, REQ-WORKSPACE-091's for a skipped one, REQ-WORKSPACE-093's three stage reasons and its
summary, and the retryable outcome are unchanged.

- **A step's detail.** A step not attempted (an earlier one failed, or the setup was cancelled between steps) and a step that
  ran and wrote nothing have an **empty** detail; the step's status (`not-attempted`, `succeeded`, `failed`) says what
  happened. A step whose command could not be started reads in the **launch's own error text** (for example
  `spawn /opt/ci ENOENT`). Every other step's detail is the last 400 bytes of its combined output **once that output is
  trimmed of its leading and trailing blank space**, cut where a UTF-8 character begins so that no character is split.
- **A failed stage with an empty detail** takes the setup's final sentence, "A step failed, so the workspace is only partly
  set up.", as its error's `{detail}`.
- **A setup that began no stage** fails retryably with REQ-WORKSPACE-093's summary, under the reason "Code intelligence could
  not complete this project's setup". Its detail is the run host's own refusal of the start ("A code-intelligence setup is
  already running for this workspace; wait for it to finish or cancel it first.", "That workspace is not open in the run
  host", "The configuration could not be loaded"); "the setup was cancelled before it started." for a run cancelled while
  its setup waited for the one before it; or "the run host did not answer the setup's start" with the request's own error in
  parentheses, for a start the run host does not answer within main's 15 s request bound. A refused start is not waited
  out: the task fails at once and runs again at the next open of the workspace or on Try again. No cancellation follows an
  unanswered start.
- **A setup whose finished status never arrives** ends as a retryable failure with REQ-WORKSPACE-093's summary, under the
  reason of the stage that was running, or the reason above where none was. Its detail is "the run host exited before the
  setup finished." when main sees the run host exit, or "no outcome arrived within the setup's time budgets." once every
  stage's budget plus REQ-WORKSPACE-092's 5 s for each has passed since the follow began (2235 s, about 37 minutes). The
  steps that finished are reported; the one that was running is not. No cancellation is sent when that bound passes.

**As built.** `stepDetail`, `lastUtf8Bytes`, `SETUP_REASON`, `CANCELLED_BEFORE_SETUP_ERROR`,
`SETUP_RUN_HOST_EXITED_DETAIL`, `SETUP_OVERDUE_DETAIL`, `SETUP_START_UNANSWERED_DETAIL` and `SETUP_FOLLOW_BOUND_MS`
(`apps/desktop/src/main/initialization.ts`); the output's trim in the run host's setup (`packages/mcp/src/setup.ts`).

**Why, and what it costs.** OQ-167, OQ-169 and OQ-175: REQ-WORKSPACE-092 and REQ-WORKSPACE-093 give a reason per stage and
a detail per stopped step, and nothing for a step with no output, a step that could not start, a setup that began no
stage, or one whose outcome never reaches the task; read literally, a failed stage's error was "{reason}: " with nothing
after it. The owner made the built words and the immediate retryable failure the rule, with the 37-minute bound. What it
costs: the borrowed final sentence is the run host's (REQ-MCP-112's final outcome) in this domain's error; a tail counted on
trimmed output differs from the output as written where it ends in blank lines; and a setup whose run host keeps working
past the bound without reporting is reported failed though it may still finish.

> **Narrows:** REQ-WORKSPACE-092, REQ-WORKSPACE-093

*Raised by the owner, 2026-10-06; logged as [R-071](requests.md#r-071), the rulings of OQ-167, OQ-169 and OQ-175.*

---

<a id="pd-workspace-007"></a>

### PD-WORKSPACE-007 — the status strip's path link and flag explanations follow the shell domain

*Renumbered before landing: built as `PD-WORKSPACE-006` on its branch, it took the next free number, `PD-WORKSPACE-007`, when `PD-WORKSPACE-005` (the project-setup banner, OQ-171) landed on `main` first; its citations followed.*

Where the workspace domain and the shell domain, which owns the status strip (REQ-SHELL-047), state the strip differently,
the shell domain's statement SHALL govern:

- A workspace-path link that cannot open the folder raises REQ-SHELL-040's transient error naming the path attempted;
  REQ-WORKSPACE-019's "a failure to open SHALL be silent" no longer governs.
- The `unsaved settings` flag's explanation conveys that the Settings view holds edits not yet saved and that **runs keep
  using the last saved values** until they are saved (REQ-SHELL-041), not that runs use the values on screen.
- The mode, redaction and circuit-breaker flags' explanations are REQ-SHELL-041's sentences word for word, and
  REQ-WORKSPACE-022's "exactly the following and no more" does not bound them.

Everything else in REQ-WORKSPACE-019 and REQ-WORKSPACE-022 still governs: the link's name and tooltip, the five flags and
their conditions, the mode flag's value vocabulary, the file-access pair's fixed sentences, and each flag's explanation as
both its tooltip and its accessible description.

**As built.** `workspace.openFolder` (`apps/desktop/src/main/commands/workspace.ts`, `apps/desktop/src/main/open-folder.ts`),
`apps/desktop/src/renderer/strip-facts.ts` and `statusStripSafetyFlags` (`packages/ui/src/composer.ts`).

**Why, and what it costs.** OQ-191: the two domains disagree in five statements, two of them opposite claims (a silent
failure against a reported one, the values on screen against the last saved values; the product's runs read the saved
configuration). REQ-SHELL-047 makes the shell domain the strip's owner, and its resolution 7 is the later decision. The owner
let the shell's five statements stand and asked for the workspace domain to match them. What it costs: the redaction
sentence does not say that redaction cannot be turned off, and the three sentences say more than the workspace domain's
bound allowed.

> **Narrows:** REQ-WORKSPACE-019, REQ-WORKSPACE-022

*Raised by the owner, 2026-10-06; logged as [R-071](requests.md#r-071), the ruling of OQ-191.*

---

<a id="pd-workspace-008"></a>

### PD-WORKSPACE-008 — the strip's branch item names the states in which there is no branch to show

*Renumbered before landing: built as `PD-WORKSPACE-007` on its branch, it took the next free number, `PD-WORKSPACE-008`, when `PD-WORKSPACE-005` (the project-setup banner, OQ-171) landed on `main` first; its citations followed.*

Where REQ-WORKSPACE-020 renders the status strip's branch item as empty text with no tooltip, the item SHALL instead convey
the state, as REQ-GIT-161 asks, in these words, each its tooltip and its accessible description:

- a detached HEAD: `detached HEAD`, "This workspace is on no branch (detached HEAD).";
- a folder that is not a Git repository: `no git repository`, "This folder is not a Git repository.";
- Git unavailable: `no git`, "Git is not installed or not on PATH.";
- before the first read: `—`, "Branch this workspace is on: not read yet".

The detached and absent states are set in italics, and none of these draws the branch icon, which stands before a branch
name only. A branch name keeps REQ-WORKSPACE-020's sentences, the full stop and the agreeing noun included: "Branch this
workspace is on: {branch}.", "…, 1 commit ahead.", "…, {n} commits ahead."; REQ-GIT-122's backticked tooltip is read as a
template of those three, so it gains the full stop and never renders its "(s)". Every other clause of REQ-WORKSPACE-020 and
REQ-GIT-122 still governs, the worktree branch's included.

**As built.** `branchStripItem` and `branchSentence` (`packages/ui/src/GitView.tsx`), placed by `stripItems`
(`packages/ui/src/composer.ts`). An unborn branch and a repository whose branch could not be read are not among the states
above: REQ-WORKSPACE-020's empty item still governs them. Until 2026-10-06 (fin22) the build departed from it there, drawing
the branch icon, `—` and "Branch this workspace is on: —."; it now draws the empty item, no text, icon, tooltip or
description (repaired in
[`the-status-strips-branch-item-draws-an-unborn-branch-as-a-branch-named-dash.md`](../defects/fixed/the-status-strips-branch-item-draws-an-unborn-branch-as-a-branch-named-dash.md)).

**Why, and what it costs.** OQ-193: REQ-GIT-161 requires a detached checkout and a non-repository to be conveyed, each
distinct from a branch name and from the other, and REQ-WORKSPACE-020 requires the item to be empty in exactly those cases.
One item cannot do both. The owner kept the visible words and tooltips as built. What it costs: the strip spends width on a
state that has no branch, and the item is no longer empty text that a reader of REQ-WORKSPACE-020 would expect there.

> **Narrows:** REQ-WORKSPACE-020, REQ-GIT-122

*Raised by the owner, 2026-10-06; logged as [R-071](requests.md#r-071), the ruling of OQ-193.*

---

<a id="pd-shell-007"></a>

### PD-SHELL-007 — the terminal's 100 ms echo is held on a host whose CPUs are not oversubscribed

REQ-SHELL-166's echo-latency criterion, a keystroke's character visible in the grid within REQ-SHELL-150's 100 ms gesture
budget from the key press to the frame that shows it, SHALL apply on a machine whose CPUs other programs do not
oversubscribe: a host whose load average is at or below its CPU count. A reading taken while other processes keep the load
above the CPU count is evidence about the host, not about the product, and is taken again with the host quiet before it is
called a failure. A reading that misses the bound on a quiet host is the product's. The bound itself is not relaxed, and
every other criterion of REQ-SHELL-166 is unchanged.

**As built.** `pnpm terminal-proof`'s `live.echoUnder100ms` reads from the key event's own time stamp (`from: 'event'`) and
records the host's load average and CPU count beside the reading (`results.live.echoLoad`) and how long the key waited in the
renderer's queue (`queuedMs`).

**Why, and what it costs.** OQ-176: 120 runs on 2026-10-01 went red ten times, each at a load average of 9.1 to 13.6 on four
CPUs, each time one keystroke of three at 100 to 144 ms, while the same probe read 20 to 30 ms with nothing beside it.
REQ-SHELL-150's "sustained load" is a burst of changes in the shell, and REQ-SHELL-166 states no host condition. The owner
had the condition stated. What it costs: no promise is made about echo on a machine that other programs keep busier than
it has CPUs.

> **Narrows:** REQ-SHELL-166

*Raised by the owner, 2026-10-06; logged as [R-071](requests.md#r-071), the ruling of OQ-176.*

---

<a id="pd-shell-008"></a>

### PD-SHELL-008 — the status strip carries the sandbox indicator after the file-access flag

REQ-SANDBOX-121's workspace indicator SHALL be an item of the status strip, standing right after the file-access flag
(`workspace-scoped` or `outside-workspace!`) and before the mode flag. It is inert text reading `sandbox: <backend>`, or
`sandbox: confined` for a record written before the backend was recorded; its accessible name is "Confinement backend",
and its tooltip and accessible description are its short form joined to a sentence worded as the Settings page's Sandbox
mode control words confinement, as REQ-SHELL-041 joins a flag's. It reads the focused session's record, so it is absent
with no session focused and for a session whose recorded result is not confined, and it is gone once a run of the session
is refused at the confinement gate until a run of it starts again. It is **shown at every width**: REQ-SHELL-047 gives it
no threshold. Every other item of REQ-SHELL-038, its order and its accessible names are unchanged.

**As built.** `statusStripSandboxItem` and `statusStripSafetyFlags` (`packages/ui/src/composer.ts`), fed by
`apps/desktop/src/renderer/main.tsx`; the refusal's record from `Sessions.refusedAtStart` (`packages/engine/src/sessions.ts`).

**Why, and what it costs.** OQ-184: REQ-SANDBOX-121 calls it a workspace indicator and places it nowhere; REQ-SHELL-038's
list has no item for it, REQ-SHELL-047 gives it no threshold, and "naming the backend" fixes no other word. The owner kept
it as built and had it added to the strip's list at that position. What it costs: one more item in a strip that hides two at
narrow widths and never hides this one, and a record that predates the backend's recording names no backend.

> **Narrows:** REQ-SHELL-038, REQ-SHELL-047, REQ-SANDBOX-121

*Raised by the owner, 2026-10-06; logged as [R-071](requests.md#r-071), the ruling of OQ-184.*

---

<a id="pd-shell-009"></a>

### PD-SHELL-009 — closing a main window ends its own project's runs, and asks first

*Revision 2 (2026-10-14, [R-072](requests.md#r-072), ruling [OQ-298](../architecture/open-questions.md#oq-298)) — **a quit
that starts outside any window asks no close guard**: the last case below is revised, its revision-1 text quoted beside it.
No requirement gains a back-pointer: the case now follows REQ-CONFIG-287 and REQ-SHELL-119 guard (1) as written. Everything
else stands as revision 1 wrote it.*

Closing a main window SHALL end the active runs of the project open in it, and SHALL ask REQ-STARTUP-046's confirmation
first, after REQ-SHELL-119's earlier guards. Which close asks what:

- **The last main window.** A person's close of the main window that leaves no other main window open asks REQ-SHELL-119's
  question ("Quit while a run is active?", "Quit while {n} runs are active?") while the run host counts any run active in
  the instance (REQ-SHELL-122's count, instance-wide). Its Yes is the application's quit, whose shutdown stops every run
  (PD-ORCH-005 clause 3). This is as built before this directive.
- **One of several main windows.** A person's close of a main window that leaves another main window open asks "Close this
  window while a run is active?" ("Close this window while {n} runs are active?") while the closing window's own workspace
  has a run active — REQ-SHELL-122's count taken over that workspace's sessions alone. The box conveys REQ-STARTUP-046's
  three things: a run is still executing in this project, closing this window ends it (Rotaris will stop the run, and work
  in flight may not finish), and the alternative is Cancel, to return to the window and let it finish. It offers Cancel and
  Yes, Cancel first, the default, and Escape's and the box's close control's answer (REQ-SHELL-055). Its **Yes stops those
  runs as the stop control does** (REQ-SESSION-186's graceful stop) before the window closes: under PD-ORCH-005 clauses 3,
  9, 10 and 21 their agents rest `paused` by `stop`, Continue resumes them, the approvals and questions they wait on are
  withdrawn and never answered (the closing window's approval dialog and question dock answer nothing), and their background
  terminal sessions end. No notice of those runs appears on a window that stays while they come to rest (REQ-STARTUP-046's
  last sentence). Cancel, or a box that cannot be shown, aborts the close and changes nothing. A count that cannot be read
  is a run active.
- **A window with no active run of its own** closes without asking, whatever runs in other projects, and touches no run.
  So does a window that holds no workspace and leaves another main window open.
- **REQ-SHELL-021's gate 3** counts the requesting window's own workspace (through REQ-SHELL-122, whose test "a run is
  active" is the gate's; *since 2026-10-13 this directive narrows REQ-SHELL-021 itself as well, beside PD-SHELL-001's
  disjoint case of the add-a-window gestures, [OQ-237](../architecture/open-questions.md); the reason first given here no
  longer is one:* "REQ-SHELL-021 itself is already narrowed by PD-SHELL-001, and the generator admits one narrowing
  directive per requirement, so this directive narrows the count rather than the gate"): a window whose project has no run active may
  open another project while another window's project runs, and the window whose project runs is declined with "Finish the
  active run before opening another project." as before. A switch's outgoing window therefore closes asking nothing, its
  workspace's count being zero once the gate has passed; a run started in between is asked about at that close, and a
  Cancel there discards the replacement (REQ-STARTUP-047).
- **A quit that starts outside any window** — a signal, the end of the desktop session where Electron emits `before-quit`,
  the driver's or the capture's quit — asks no close guard at all (**revision 2**, [OQ-298](../architecture/open-questions.md#oq-298)):
  no active-run confirmation, as built, and no unsaved-settings guard, because such a quit is no **user-initiated** close
  (REQ-SHELL-119 guard (1), REQ-CONFIG-287: "a programmatic close does not prompt"). Unsaved Settings edits stay unsaved and
  nothing is written, so the workspace configuration keeps its last saved values. The main windows close in PD-ORCH-005
  clause 9's all-or-none order, and the run host's shutdown follows at once, leaving the runs as PD-ORCH-005 clause 3 says. A
  quit a person starts outside a window that a later change adds — a tray or menu Quit, or macOS Dock Quit once IC-3 allows
  a macOS release — reopens this case, together with the active-run confirmation noted under "What it costs".

  > Revision 1 said, and no longer governs: "asks no active-run confirmation, as built; it asks only the renderer's
  > unsaved-settings guard, and its shutdown leaves the runs as PD-ORCH-005 clause 3 says. *Since 2026-10-14
  > ([`PD-SHELL-010`](#pd-shell-010), [OQ-297](../architecture/open-questions.md#oq-297)) it asks that guard only while the
  > renderer can answer: a renderer that is gone, fails main's liveness probe or is reported `unresponsive` cannot, its guard
  > allows, and the quit goes on asking nothing more. A renderer that answers its probe is still waited for without bound
  > ([OQ-298](../architecture/open-questions.md#oq-298), open).*" As built under it, a SIGTERM, the driver's quit or the
  > capture's quit with Settings left unsaved raised REQ-SHELL-124's Save/Discard/Cancel and held the quit — the run host never
  > asked to `shutdown` — until a person answered or the process was killed.

**As built.** `confirmActiveRunClose`, `activeRunCloseBox` and `windowCloseBox` (`apps/desktop/src/main/close-confirmation.ts`),
wired in `confirmRunsAtClose` (`apps/desktop/src/main/index.ts`), which awaits the run host's `runs.stopWorkspace` before the
close guard confirms the close, so the stop reaches the run host before the window's presenter is revoked; the stopped
sessions are kept in `QuitState.stoppedByClose` (`apps/desktop/src/main/exit.ts`), which `dialogCloseAnswersDeny`, the
question dock's cancellation (`apps/desktop/src/main/commands/session.ts`), the unshown-approval report and the notice
relay read until the session's rest is published *(as first built; since fin29 the same day, until the stopped run's own
`run.result`, whose outcome notice is held too — see the follow-up below)*. The run host's count and stop are keyed by the session row's
`workspace_root` (`Sessions.activeRunCount(workspaceRoot?)`, `Sessions.stopActiveIn`, `packages/engine/src/sessions.ts`;
`runs.active` and `runs.stopWorkspace` in `apps/desktop/src/run-host/dispatch.ts`).

**Why, and what it costs.** OQ-206, ruled 2026-10-07 under the owner's delegation (R-072). Before this, the close of one of
several windows asked nothing and ended nothing: the run kept executing and spending where no window showed it, its
approvals and pause dialogs opened over an unrelated project (`ownerOfSession` falls back to the active window), the other
window's switch was refused with "Finish the active run" about a run it never showed, and the last close told the person to
return to a window that never held the run. PD-SHELL-002 has each project's runs live in the window open on that project;
this directive makes the box true at every close that shows it. What it costs: a window can no longer be closed with its
run left going — a person who wants the run to carry on minimizes the window instead; a logout warns about nothing (on
Windows Electron emits no `before-quit` at a logout or shutdown at all,
[`a-windows-logout-skips-the-orderly-shutdown.md`](../defects/fixed/a-windows-logout-skips-the-orderly-shutdown.md)); and macOS
Dock Quit is a person's quit outside any window, which asks nothing — to be reopened when a macOS release is authorized
(IC-3, PD-STARTUP-001).

> **Narrows:** REQ-STARTUP-046, REQ-SHELL-119, REQ-SHELL-122, REQ-SHELL-021

*REQ-SHELL-021 joined the Narrows line on 2026-10-13 under [OQ-237](../architecture/open-questions.md) (GV1,
[R-072](requests.md#r-072)): OQ-206's ruling named it, and the one-narrowing-per-requirement rule that kept it out no longer
holds. Its case, gate (3)'s count on the replacement route, is disjoint from `PD-SHELL-001`'s, the two add-a-window
gestures on which no gate is evaluated.*

*Raised by the consortium under the owner's delegation, 2026-10-07; logged as [R-072](requests.md#r-072), the ruling of
[OQ-206](../architecture/open-questions.md) (advocate A, the user's lens, followed). Revision 2 ruled by the consortium under
the same delegation, 2026-10-14, the ruling of [OQ-298](../architecture/open-questions.md#oq-298).*

> **First execution, 2026-10-07, built under [R-072](requests.md#r-072):** the directive held as written, and one claim the
> record carried was false. The run host's per-workspace predicate ADR-0013 names as its registry's job was not built: every
> count was instance-wide (`runs.active`'s "Sessions are not keyed by workspace yet"); it now keys by the session row's
> `workspace_root`, which REQ-SHELL-021's gate 3 and the restore's refusal (REQ-SESSION-201), which already passed the
> window's workspace id, now read. A third caller passed the window's workspace id too and must not read the keyed count:
> `session.start`'s forced isolation (REQ-GIT-120, REQ-MONITOR-251: "whenever **any** run is active"), which keyed would have
> stopped forcing a launch in an idle project into a worktree while another project's run executed. It asks the instance's
> count (the empty id) instead, so the launch rule is unchanged by this directive; `commands/session.test.ts`'s REQ-GIT-120
> case pins it, red on the keyed request (found by the verifier of this change, repair round 1). *Falsified the same day by
> [`PD-GIT-001`](#pd-git-001) (OQ-224), the claim kept:* "any" is not the whole instance — `session.start` and the launch
> dialog now ask one per-workspace count, `scope: 'sharing'`, and a launch in an idle project shares its own base tree. The record's claim that "the desktop's logout" reaches `before-quit` holds on Linux and
> macOS only; on Windows Electron's own typings say neither `before-quit` nor `will-quit` is emitted at a logout or shutdown
> (recorded as a defect, not repaired here). **What was measured.** `close-confirmation.test.ts`, `exit.test.ts`,
> `commands/session.test.ts`, `dispatch.test.ts`, `main-windows.test.ts` (the two-window gesture) and `run.test.ts` (the
> keyed count and the workspace stop resting the run `paused` by `stop`, the other workspace's run untouched), fourteen
> cases red on the source before this change; and `part-j-proof`'s two-window launch (`pair-app`), driven: the idle
> window's close asked nothing and left the other project's run `running`, the running window's close asked "Close this
> window while a run is active?" once, answered Yes, and its session rested `paused`, `user_cancelled`, its iteration open by
> `stop`, before the window closed; the last window's quit asked nothing. The routing that holds a stopped session's notice
> back, ends the hold at a later run's start and keeps its queued approvals from being reported unshown is
> `QuitState.holdsBack` and `QuitState.unshownToReport` (`apps/desktop/src/main/exit.ts`), which `runHost.onEvent` and
> `unshownApprovals` in `index.ts` call; `exit.test.ts` pins each gate, every case red with its gate removed (as first
> built the routing sat inline in `main()`, where no test reached it: found by the verifier, repair round 1, which also
> found that a rest published before the stop's reply left the session held for its next run, now repaired and pinned).
> **What was not measured.** A held-back notice, a withdrawn approval dialog or question dock in the built app: no proof
> makes a stopped session publish a notice or hold a dialog as its window closes, so the one-line calls in `index.ts` are
> exercised by no test or proof; a Windows host (IC-3 — *corrected 2026-10-14: a Windows host, which this Linux container is not; IC-3 binds Linux and macOS artifacts*). The row is in
> [`../architecture/first-executions.md`](../architecture/first-executions.md).
>
> **Follow-up, 2026-10-07, fin29 (fin28 reviewers' findings on the landed build, 2631eaf).** Four claims of the first
> execution were short of the directive, each recorded and repaired: **the hold followed statuses, not the run** — a run
> stopped before it had saved an active status (one released from the plan gate, or continued) lost its hold at its
> `cancelling`, a session never continued kept its notices held for as long as main ran, and the stopped run's own outcome
> notice (raised by main from `run.result`) was never held at all; `QuitState` now holds a stopped session until its run's
> `run.result`, holds that outcome, and ends there
> ([`a-window-close-registers-a-stopped-session-by-the-status-main-last-saw.md`](../defects/fixed/a-window-close-registers-a-stopped-session-by-the-status-main-last-saw.md),
> [`a-stopped-session-that-is-never-continued-keeps-its-notices-held.md`](../defects/fixed/a-stopped-session-that-is-never-continued-keeps-its-notices-held.md));
> **the box counted runs its Yes could not stop** (a run still ending is `isRunActive` and takes no stop), so the close now
> asks `runs.active` with `scope: 'stoppable'`, the stop's own predicate
> ([`the-window-close-box-counts-runs-its-yes-cannot-stop.md`](../defects/fixed/the-window-close-box-counts-runs-its-yes-cannot-stop.md));
> and **what was not measured above is now measured**: `run.test.ts` pins the workspace stop's withdrawal of a pending wait and
> its end of a background session (clauses 9 and 10), REQ-SHELL-021 carries a cross-reference to this directive by way of
> REQ-SHELL-122, and `part-j-proof`'s two-window launch closes A while its run waits on an approval dialog — the store
> records `approval_withdrawn` and no `approval_denied`, and the stopped run's outcome is held back from B
> ([`pd-shell-009s-withdrawal-and-hold-paths-are-pinned-by-no-engine-case-or-proof.md`](../defects/fixed/pd-shell-009s-withdrawal-and-hold-paths-are-pinned-by-no-engine-case-or-proof.md)).
> The Windows logout recorded above now runs the orderly shutdown on a main window's `session-end`
> ([`a-windows-logout-skips-the-orderly-shutdown.md`](../defects/fixed/a-windows-logout-skips-the-orderly-shutdown.md)); the
> Windows run that shows it is owed. **Still not measured:** the unshown-approval report in the built app (no proof queues a
> second approval behind an open dialog); a Windows host.

> **First execution of revision 2, 2026-10-14 (fin45, `fin45-supervision-and-quit`):** built as ruled. `quitGuardsOutsideAnyWindow`
> (`apps/desktop/src/main/exit.ts`) answers, for each open main window, a guard whose `ask` allows at once and whose `confirm` and
> `close` are the window's own `CloseGuard`'s (or the fallback's); `before-quit` in `apps/desktop/src/main/index.ts` feeds it to
> `closeThroughGuards`, keeping clause 9's ask-all, confirm-all, close-all order and its line, and adds one: "quit: started outside
> any window; no close guard is asked, and unsaved settings, if any, stay unsaved (OQ-298)". A window's own close (`guardClose`) and
> REQ-SHELL-021 gate (1) (`closeGuard`) are unchanged. **What was measured.** `exit.test.ts`, "OQ-298": over two windows whose
> renderer guard never settles, the builder asks no renderer, `closeThroughGuards` resolves true and both confirms precede both
> closes (a window with no `CloseGuard` takes the fallback in the same order); the same quit wired through the window's own
> `CloseGuard` stays held, the as-built shape. `pnpm exit-trace-proof` (37 of 37, load 1.9 to 2.3 on 4 CPUs): `hang` — the
> renderer stopped with SIGSTOP, the driver's quit exited 0 in 625 ms with the OQ-298 line and no PD-SHELL-010 `warn` line (it was
> 5.6 s under PD-SHELL-010's probe); `unsaved-quit` and `unsaved-sigterm` — the renderer's guard replaced by one that never settles
> (a dirty Settings form's guard until a person answers), the driver's quit and SIGTERM to main each exited 0 through
> `quit: exiting with status 0` in 133 ms and 70 ms, no dialog, the workspace configuration file byte-identical. On the build
> before the change the same proof read 28 of 37: `hang` released only by the 5 s probe (5,621 ms, with the `warn` line), and both
> `unsaved` launches held with no exit in 20 s until the immediate exit ended them. `hang-close` (a person's close, still asking
> the renderer) stays PD-SHELL-010's measure, 5,567 ms. `pnpm workspace-proof` (63 passed, 2 skipped): the `veto` and `add-window`
> launches, whose renderer guard refuses every close, now end at the driver's quit through the orderly path with the OQ-298 line.
> **Found beside it.** A second quit during the orderly shutdown exits at once, as REQ-MONITOR-283 requires: with the run host
> stopped (SIGSTOP) after a first quit, a second — SIGTERM or the driver's quit — exited 0 in 53 ms and 110 ms (a scratch check,
> not a proof). The update's closes (`mainWindows.dispose()`, REQ-STARTUP-119/121) ask no unsaved-settings guard either; whether
> `Restart now`, a person's action, is a user-initiated close for guard (1) is raised as
> [OQ-311](../architecture/open-questions.md#oq-311). **Not measured:** a real dirty Settings form (the guard was replaced, which
> the ruling's implementation allows), a desktop logout, a Windows or macOS host. The row is in
> [`../architecture/first-executions.md`](../architecture/first-executions.md).

> **The added line's wording, corrected 2026-10-14 (fin46, `fin46-accept1-8`, C4):** the line quoted above, "no close guard is
> asked", sat beside clause 9's "closing N main window(s) through their close guards first" and read as its opposite: the windows
> do close through their own `CloseGuard`s, which put no question. It now reads "quit: started outside any window; each close
> guard allows without a question, so no Save/Discard/Cancel or active-run box is shown, and unsaved settings, if any, stay unsaved
> (OQ-298)"; clause 9's line is unchanged, and so is the behaviour. The handler is `QuitOutsideAnyWindow` (`exit.ts`) since the
> same round
> ([`the-quit-log-says-it-closes-through-close-guards-beside-saying-none-is-asked.md`](../defects/fixed/the-quit-log-says-it-closes-through-close-guards-beside-saying-none-is-asked.md),
> [`no-unit-test-pins-the-before-quit-wiring-of-a-quit-outside-any-window.md`](../defects/fixed/no-unit-test-pins-the-before-quit-wiring-of-a-quit-outside-any-window.md)).

---

<a id="pd-shell-010"></a>

### PD-SHELL-010 — a main window's renderer that is gone or does not answer a liveness probe cannot answer its close guard, and a guard that cannot answer allows

A main window's close guard (REQ-SHELL-119 guard (1), the renderer's unsaved-settings guard, REQ-SHELL-124) is asked of the
window's renderer. That renderer **cannot answer** the guard when any of these holds while the guard's question is out:

- **it is gone** — its process crashed or was killed, or its contents were destroyed, before the question was sent or while it
  was out;
- **it fails main's liveness probe** — main sends the renderer a trivial question of its own when it sends the guard's question,
  and again each time `RENDERER_LIVENESS_BOUND_MS` (5,000 ms) elapses with the previous one answered; a probe left unanswered at
  that bound fails;
- **Chromium emits `unresponsive`** for the renderer's contents.

**A guard that cannot answer allows**: the close or the quit proceeds without guard (1). Main writes at `warn` which signal it
was. Nothing else changes:

- a **person's close** of the window still meets guard (3)'s native active-run box, as `PD-SHELL-009` narrows REQ-SHELL-119 (the
  box is main's, not the renderer's, and is asked as before);
- a **quit that starts outside any window** (`PD-SHELL-009`'s last case) asks nothing more — *amended 2026-10-14 (OQ-298,
  `PD-SHELL-009` revision 2): such a quit asks no close guard at all, so this directive does not reach it; it reaches a person's
  close of a window and REQ-SHELL-021 gate (1) alone.* The bullet first read, and no longer governs: "a **quit that starts
  outside any window** (`PD-SHELL-009`'s last case) asks nothing more;";
- a renderer that **answers the probe** is waited for **with no bound**, because its guard is a person's Save/Discard/Cancel,
  which no time may answer for;
- REQ-SHELL-021 gate (1) asks the same question on the same terms: a renderer that cannot answer passes gate (1), and gates (2)
  and (3) are evaluated as written.

It adds no dialog and no string. Every listener and timer the question arms is removed when the question settles, whichever way
it settles, and a late answer is ignored.

**As built.** `askRendererGuard` and `RENDERER_LIVENESS_BOUND_MS` (`apps/desktop/src/main/main-windows.ts`), over the main-window
timers port; asked by the window's own close guard (`guardClose`, wired in `createElectronMainWindowAdapter`) and by main's
`closeGuard` for REQ-SHELL-021's gate 1 (`apps/desktop/src/main/index.ts`). *Amended 2026-10-14 (OQ-298):* the application's quit
no longer asks it — `closeThroughGuards` (`apps/desktop/src/main/exit.ts`) is fed `quitGuardsOutsideAnyWindow`'s guards, which take
only each window's `confirm` and `close`. First written, and no longer true: "The application's quit drives the same guard through
`closeThroughGuards` (`apps/desktop/src/main/exit.ts`), unchanged."

**Why, and what it costs.** OQ-297 (the consortium's HR1), ruled 2026-10-14 under the owner's delegation (R-072). Before it, a
renderer that was alive but hung held a person's close of its window and the application's quit — a SIGTERM's included — with no
answer and no bound ([`a-main-window-whose-renderer-hangs-holds-the-applications-quit.md`](../defects/fixed/a-main-window-whose-renderer-hangs-holds-the-applications-quit.md)).
A bound on the guard's question itself would answer for a person deciding; a bound on a question that needs no person does not.
The gone case was built by fin43 on 2026-10-14 without a directive
([`a-main-window-whose-renderer-crashed-holds-the-applications-quit-forever.md`](../defects/fixed/a-main-window-whose-renderer-crashed-holds-the-applications-quit-forever.md));
this directive is its record home. What it costs: a renderer busy for more than 5 s on its main thread while its window is being
closed — a long synchronous task, not a person deciding — loses its guard, so unsaved settings in it are not offered for saving;
and an answering renderer with unsaved settings still holds a quit from outside any window on a person's answer
([OQ-298](../architecture/open-questions.md#oq-298), raised apart, not decided here). *Amended 2026-10-14: OQ-298 is ruled
(`PD-SHELL-009` revision 2) — such a quit asks no guard, so an answering renderer no longer holds it; its unsaved settings stay
unsaved and are not written.* This directive's cases are disjoint from
`PD-SHELL-009`'s (guard (3) and gate (3)'s count) and from `PD-SHELL-001`'s (the add-a-window gestures, on which no gate is
evaluated): it narrows only guard (1) and gate (1), when the renderer cannot answer.

> **Narrows:** REQ-SHELL-119, REQ-SHELL-124, REQ-SHELL-021

*Raised by the consortium under the owner's delegation, 2026-10-14; logged as [R-072](requests.md#r-072), the ruling of
[OQ-297](../architecture/open-questions.md#oq-297) (HR1; advocate B followed, one point from advocate A folded in).*

> **First execution, 2026-10-14, built by fin44 (`fin44-hang-and-seams`):** the directive held as written. `askRendererGuard`'s
> probe, its bound and the `unresponsive` listener were built as stated; `main-windows.test.ts` pins seven cases, all red on the
> source before the change. `pnpm exit-trace-proof`'s `hang` and `hang-close` launches stopped the main window's renderer with
> SIGSTOP: the driver's quit and the host's close (`BrowserWindow.close()`, the driver's `closeWindow`) each ended the process,
> exit 0, through the orderly path about 5.6 s after they were asked, and main wrote the `warn` line naming the probe; against
> the build before the change both were held with no exit in 15 s. **What the ruling's implementation left to measurement:**
> whether the allowed `win.close()` completes on a hung renderer — it does, so the close was not turned into `destroy()`. Chromium's
> `unresponsive` did not fire in either launch (a stopped renderer with no input pending earns none): the probe alone released
> them, and the second signal is pinned by the unit cases only. **Not measured:** a renderer hung by a busy main thread rather
> than a stopped process (the same probe; no proof loops a renderer); a Windows or macOS host. The row is in
> [`../architecture/first-executions.md`](../architecture/first-executions.md).

---

<a id="pd-session-001"></a>

### PD-SESSION-001 — the listing record carries the three figures the sessions card shows

*Revision 2 (2026-10-06, fin22) — wording only: the second field is named as built. The record carries the latest run's
**duration label**, computed from the run's stored start time, and not the start time itself; nothing the card draws
changes. Revision 1's words are quoted below the paragraph.*

REQ-SESSION-030's listing record SHALL hold, beside its twelve fields, three more: the session's **token total** (its
`tokens_input` plus its `tokens_output`, the field `tokens`), the **duration label of its latest run** (`durationLabel`),
and its **workspace path** (`workspace_root`, the field `detail`). They are what the Overview's sessions card draws as
REQ-MONITOR-171's token label, duration label and detail caption. The duration label is the latest run's duration as `m:ss`
or `h:mm:ss`, counted from that run's stored start time (`run_started_at`) to now while the run is live and to the row's
`updated_at` otherwise, and empty before any run; so for a session paused and continued it counts the continuation alone.
The three are read from the same stored session row the listing record is read from, and reading them opens nothing else of
the session's (REQ-SESSION-042); every other clause of REQ-SESSION-030 still governs. `checkpoint_count` stays what it was
before this directive: a count over the session's checkpoint rows in the same store, as ADR-0039 derives it.

> *Revision 1 said, and no longer describes the record:* "the **start time of its latest run** (`run_started_at`)" as the
> second field, and "The duration label is the latest run's duration, counted from that start". The listing never carried
> the start time; `Sessions.list` computes the label from it.

**As built.** `Sessions.list` (`packages/engine/src/sessions.ts`, `durationLabel`) reads the three from the session row the
listing record is read from; the card is `packages/ui/src/OverviewView.tsx`.

**Why, and what it costs.** OQ-192: REQ-MONITOR-171 requires the three labels on each row, and REQ-SESSION-030's closed field
set forbids a listing to show anything else about the session, saying that making an attribute list-visible "is a change to
this field set". The owner kept the labels and had the field set changed. What it costs: three more fields every listing
reader carries, and a duration that does not add up a session's runs.

> **Narrows:** REQ-SESSION-030

*Raised by the owner, 2026-10-06; logged as [R-071](requests.md#r-071), the ruling of OQ-192.*

---

<a id="pd-chat-008"></a>

### PD-CHAT-008 — the run timer counts from the newest row the run produced

While a run is active, REQ-CHAT-158's run-timing indicator SHALL count from the **newest transcript row the run produced**,
the unsettled one first, and restart from `0:00` when a newer row appears. A model call that writes no row (a summariser's,
a classifier's) does not restart it, and a call that has written nothing yet is counted from the end of the step before it.
Where several calls of one run are in flight at once, the value follows whichever of them wrote the newest row. No model
call's start is published on the record for it. Every other clause of REQ-CHAT-158 still governs: the `M:SS` and `H:MM:SS`
forms, the freeze at the run's total once it ends, no duration before a first run, the tick of at least once a second under
REQ-CHAT-063, and a tick that writes no state.

**As built.** `modelCallStartedAt` and `runTimingSeconds` (`packages/ui/src/composer.ts`), `stepStartedAt`
(`packages/ui/src/WorkspaceView.tsx`), drawn by `packages/ui/src/RunHeader.tsx`; `SessionRecord` carries `runStartedAt` and
no per-call boundary.

**Why, and what it costs.** OQ-200: a run can have several model calls out at once (the root's, each running child's, a
summariser's, a classifier's), and REQ-CHAT-158 speaks of "the model call currently in flight" as if there were one. Counting
any one of them would need the engine to publish a call's start on the record, a contracts and engine change before it is a
surface one. The owner confirmed the reading the build proceeds under. What it costs: the value can read longer than the
call in flight (the default live run at `27a5127` read 0:09 while the summariser's call was 5.5 s in), and a quick call that
writes no row is never seen to begin.

> **Narrows:** REQ-CHAT-158

*Raised by the owner, 2026-10-06; logged as [R-071](requests.md#r-071), the ruling of OQ-200.*

---

<a id="pd-orch-013"></a>

### PD-ORCH-013 — an explicit choice of the entry model wins over an earlier wait's override of that model

When the user explicitly chooses a model for the run's entry agent — a switch of the entry model from the run header or
the inspector (REQ-MONITOR-142), or a choice made on the quota-wait decision surface (REQ-MONITOR-303) — and a
session-wide override that an earlier change-model resolution of a wait set (REQ-ORCH-091 (d), REQ-NOTIFY-089) replaces the
chosen provider-and-model pair, that override SHALL be taken back for the chosen pair, recorded in the session record so
that a reload and every reader of the record replay it, and the entry agent SHALL run on the pair chosen from the moment
the choice applies: the run's next iteration for a switch from the run header or the inspector, at once for a choice on the
wait surface. A switch from the run header or the inspector SHALL also end an automatic move the ladder made of the entry
agent (REQ-ORCH-090, REQ-ORCH-091 (b)); the ladder's once-per-agent budgets are not reset by it.

Every other override in force stands for the rest of the session as REQ-ORCH-091 (d) says. An agent that had already
followed the override taken back stays on the model it moved to; an agent that calls the chosen pair from then on calls it.
A reasoning-level switch is not a model choice and takes nothing back.

**Why, and what it costs.** Before this directive the model the user picked from the run header could quietly fail to run:
the switch ended a ladder move but left an earlier wait's override of the same pair standing, so the entry agent went on
calling the override's model and only a transcript row said so — while a choice made on the wait surface already took such
an override back. The owner ruled that every explicit choice wins (OQ-177). What it costs: REQ-ORCH-091 (d) and
REQ-NOTIFY-089 keep a hand-chosen model "for the rest of the session", and a later explicit choice of the replaced pair now
ends that override early, so later calls in the session may return to a pair the provider once reported out of quota. The
user chose it explicitly, which REQ-MONITOR-194 already lets them do, and a further insufficient-quota answer records it
out of quota again.

> **Narrows:** REQ-ORCH-091, REQ-NOTIFY-089

*Raised by the owner, 2026-10-06, ruling OQ-177 as recommended; logged as [R-071](requests.md#r-071).*

*Numbered PD-ORCH-013: first written as PD-ORCH-006 on its branch, then PD-ORCH-009 when fin20's directives reached `main`
first and took PD-ORCH-006 to PD-ORCH-008; renumbered PD-ORCH-013 at the landing rebase, since `main` had meanwhile taken
PD-ORCH-009 to PD-ORCH-012, so this entry takes the next free number.*

> **First execution, 2026-10-06, built under [R-071](requests.md#r-071) (plan fin21):** `Run.setEntryModel` takes the
> override back on the header path through the same `takeBackOverrideOf` the wait path uses — a `model_override` entry
> carrying `cleared: true`, `cause: 'superseded'` and `root_cell`, written before the switch's `entry_model_switched`, which
> `ResilienceMemory.rehydrate` and both autopsy readers already replay — and the row's second form, "Entry model switched
> to X, but Y, chosen for P/M during an earlier wait, stands for the rest of the session", is gone because no switch leaves
> such an override standing. It found nothing the record had not said: the readers needed no change. **Measured:**
> `packages/engine/src/run/ladder.test.ts` (a wait choice of c1 over the exhausted a1, then a header switch to a1 while a
> second task is queued: the next iteration's root calls a1, the take-back precedes the switch, the replayed memory holds
> no override and no exclusion of a1, and `entryModelKeys` reads a1, c1, a1 — red before, the third call on c1), and
> `resilience-proof`'s driven `switch-over-override` scenario on the built app (alpha refused on quota, beta chosen in the
> wait, a follow-up queued and the entry model switched back to alpha from the run header: calls alpha, beta, alpha; two
> `model_override` entries, the second the take-back). The row is in
> [`../architecture/first-executions.md`](../architecture/first-executions.md).

---

<a id="pd-monitor-006"></a>

### PD-MONITOR-006 — a switch of the entry model or reasoning level from the run header holds for its own run

A switch of the run's entry model, or of its entry reasoning level, made from the run header or the inspector while a run
is live (REQ-MONITOR-142) SHALL apply from the run's next iteration for the rest of **that run** only. It SHALL NOT be
carried into the session's next run, and it is not the session-wide runtime model override of REQ-SESSION-026: the next run
starts on the model and reasoning level the composer's selectors choose (REQ-MONITOR-146, REQ-CHAT-006), which name any
session-wide override in force. The system transcript row each switch appends SHALL state the new model or reasoning level,
that it applies for the rest of this run after the iteration in flight, and that the next run starts on the composer's
choice; it SHALL NOT say only that it applies from the next iteration.

A change-model resolution of a provider wait (REQ-ORCH-091 (d)) is not such a switch: its override is session-wide and
reaches every later run, as REQ-SESSION-026 and REQ-NOTIFY-089 say.

**Why, and what it costs.** A switch reaching the next run would sit beside the composer's next-run model chip with no rule
for which wins; one place that chooses the next run's model is simpler, and the build already ended a switch with its run.
The fault was one sentence: the row said the switch "applies from the next iteration", untrue when the run had nothing left
queued, because the user's next prompt starts a new run. The owner ruled the switch stays scoped to its run and the row says
so (OQ-185). What it costs: a user who switches the model in the last iteration of a run and wants it for the next run sets
it again in the composer.

> **Narrows:** REQ-MONITOR-142, REQ-SESSION-026

*Raised by the owner, 2026-10-06, ruling OQ-185 as recommended; logged as [R-071](requests.md#r-071).*

*Numbered PD-MONITOR-006: first written as PD-MONITOR-003 on its branch; renumbered at the landing rebase, since `main` had meanwhile taken PD-MONITOR-003 to PD-MONITOR-005, so this entry takes the next free number.*

> **First execution, 2026-10-06, built under [R-071](requests.md#r-071) (plan fin21):** the rows read "Entry model switched
> to X; it applies for the rest of this run, after the iteration in flight. The next run starts on the composer's model."
> and "Entry reasoning level switched to L; it applies for the rest of this run, after the iteration in flight. The next run
> starts at the composer's reasoning level." (`Run.setEntryModel`, `Run.setEntryReasoning`). Nothing else changed: the
> switch was already held on its `Run` (`entryOverride`) and a continuation is a new `Run` built from the configuration, so
> the scope the directive states is the one built since fin8. The autopsy readers keep printing `undetermined` for a
> continuation whose snapshot names no entry model after such a switch: the switch did not reach it, but the composer may
> have changed the configuration since the last snapshot, and nothing it records says. **Measured:** the three row cases of
> `ladder.test.ts` (red before, the old sentence), and `resilience-proof`'s `switch-back` and `switch-over-override` on the
> built app reading the new row. The row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).

---

<a id="pd-monitor-007"></a>

### PD-MONITOR-007 — helper model calls follow the session's override and stay off a model held out of quota

The run's helper calls — the pre-flight's intent classifier (REQ-ORCH-009, REQ-ORCH-114), the loop supervisor's classifier
(REQ-ORCH-100), a compression pass on a configured compressing model (REQ-MONITOR-080), the child-report summariser
(REQ-CONFIG-065) and the post-run improvement analyst (REQ-LIBRARY-037) — SHALL each resolve the model its slot configures
through the session's model state at the moment of the call:

1. **The override is followed.** Where a session-wide override replaces the configured provider-and-model pair
   (REQ-ORCH-091 (d), REQ-NOTIFY-089), the call SHALL go to the override's model, as an agent's own calls do.
2. **A pair held out of quota is not called.** Where the pair the call would reach is recorded out of quota for the session
   (REQ-MONITOR-194) and nothing replaces it:
   - a compression pass SHALL compress on the model the agent whose context is compressed is calling — REQ-MONITOR-080's
     default — and, where that is held out of quota too, SHALL make no call and fail with the reason;
   - the summariser SHALL summarise the child on the model the child ran on, and, where that is held out of quota too, SHALL
     make no call and write the fallback report with the reason;
   - the intent classifier SHALL send no request, and the run SHALL proceed on the fallback intent with a reason saying the
     classifier's model is held out of quota; the loop classifier SHALL send no request, and the supervisor SHALL proceed as
     on a classification that did not answer;
   - the post-run analyst SHALL send no request and capture no job, and the application log SHALL say why.

A slot is consulted as REQ-ORCH-009 orders it; the directive changes what the selected slot calls, and an excluded slot is
not replaced by the next slot in that order.

**Why, and what it costs.** Calling a model the session already knows the provider will refuse wastes the call, makes a
compression fail — which can push a long run toward its context limit — reports the analysis failed, and ignores the user's
explicit choice of another model. The owner ruled that every helper follows the override as the summariser already did, and
that an excluded model is replaced by the calling agent's for compression and skipped for the classifiers and the analyst
(OQ-189); the summariser, which the ruling does not name, is read as the condensing call it is, beside compression. What it
costs: a configured compressing or summarising model no longer always "wins" (REQ-MONITOR-080), so a pass may run on a
larger and costlier agent model; a run whose classifier slot is excluded classifies nothing and takes the fallback intent;
and a run whose analyst slot is excluded produces no improvement proposals.

> **Narrows:** REQ-MONITOR-080, REQ-ORCH-009, REQ-ORCH-114, REQ-ORCH-100, REQ-CONFIG-065, REQ-LIBRARY-037

*Raised by the owner, 2026-10-06, ruling OQ-189 as recommended; logged as [R-071](requests.md#r-071).*

*Numbered PD-MONITOR-007: first written as PD-MONITOR-005 on its branch; renumbered at the landing rebase, since `main` had meanwhile taken PD-MONITOR-003 to PD-MONITOR-005 and this branch's keep-waiting directive became `PD-MONITOR-004` revision 2, so this entry takes the next free number.*

> **First execution, 2026-10-06, built under [R-071](requests.md#r-071) (plan fin21):** one reader serves every helper,
> `helperChoiceOf` (`packages/engine/src/run/resilience.ts`), behind `Run.helperModel`, read at each call. The compressor
> and the summariser read it in the run (`compressing` in `Run.compressionFor`; `SummariserDeps.resolve` with the child's
> model, `ReportInput.agentModel`); the classifiers and the analyst live in the run host, which `Sessions` hands the reader
> through `PreflightContext.helperModel`, the `supervisor` factory's fourth argument and `onRunResult`'s third
> (`classifyIntent`'s and `createLoopClassifier`'s `helperModel`; `postRunAnalystOf`, whose captured job keeps the model it
> resolved). It found one thing the text had not said: the analyst's artifact names its model by key, so a followed
> override reports the override's key (`HelperChoice.key`). **Measured:** four cases in
> `packages/engine/src/run/ladder.test.ts` (a configured compressor on a1 after the root moved to b1 compresses on b1; after
> a wait's override to c1, on c1; the summariser on a1, excluded, summarises the child on b1; the reader follows an override
> to its key and refuses one whose target is excluded — each red on `37f7a98`), a case in `intent.test.ts`, three in the
> run host's new `loop.test.ts` and two in `configuration.test.ts`; and in the built app `compression-proof`'s `after-a-move`
> (the pass on beta, not alpha) and `resilience-proof`'s `same-tier` (the analyst skipped with its log line;
> the relaunch calling nothing on alpha, the intent classifier making no call — the continuation then carrying the
> previous intent over, as REQ-ORCH-012 does for any fallback) and `two-waits` (the relaunch's
> classifier and analyst on gamma, the override). Not driven in the built app: the loop classifier, which no proof
> activates with an excluded slot. The row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).
>
> **Added at the plan's repair round 1 (the verifier's findings):** the two no-call clauses had no case. Now pinned: in
> `children/report.test.ts`, a resolver answering `withheld` makes the summariser call nothing and write the fallback report
> with the reason (red with the `withheld` branch removed), and one answering the child's own model sends the one call there;
> in `ladder.test.ts`, a manual pass whose configured compressor and the root's own pair are both held out of quota calls no
> model and fails naming both (red with the old `if (c.model) return null`). The loop classifier now sends the reasoning
> level the reader resolved with an override (`helper.thinking`; before, the slot's own), pinned in `loop.test.ts`.
> [`adr/0060`](../architecture/adr/0060-context-compression-over-a-replaceable-conversation.md) carries the ruling in place,
> and the engine glossary names the group (**Helper call**, `packages/engine/CONTEXT.md`).

---

<a id="pd-orch-014"></a>

### PD-ORCH-014 — the timeline and issue vocabularies name every fact the run records

The timeline-event vocabulary of domain 01's Data & Formats SHALL also hold the words below, each naming the fact
beside it and no other:

- `model_exhausted` — REQ-ORCH-091 (a)'s session-wide memory that a provider and model pair is exhausted, read back
  when the session resumes;
- `model_override` — REQ-ORCH-091 (d)'s session-wide override, read back when the session resumes;
- `context_compressed` — a completed compression. It is **the event that reports the compression** REQ-CONFIG-135
  names, "the session's event stream" read as the session's timeline (OQ-53): it carries `threshold_percentage`,
  `capacity`, `advertised_input_limit`, `default_threshold` and `trigger_tokens` as separate fields, and
  REQ-MONITOR-086's count is seeded from these entries;
- `iteration_paused` and `iteration_resumed` — an iteration left open by a pause, a stop, a quit or a crash, and that
  iteration resumed (PD-ORCH-005);
- `child_paused` and `child_resumed` — an agent left unfinished by such a rest, and that agent resumed or a settled
  child followed up (PD-ORCH-005);
- `approval_withdrawn` and `question_withdrawn` — an approval or a question withdrawn by such a rest (PD-ORCH-005);
- `run_pause_requested` and `run_pause_refused` — the user asking the run to pause, and a pause refused at the plan
  gate (PD-ORCH-005 clause 11);
- `run_continuation_intent` — a continuation's intent and its audit payload;
- `loop_supervisor_activation` — a loop-supervisor activation short of escalation;
- `context_selection` — the sibling and attached artifacts a child was given;
- `notice` — the entry REQ-NOTIFY-268 writes for a persistent notice of severity `warning` or `error`, with the
  notice's own severity;
- `waiting_on_tools`, `stall_recovered` and `corrective_message` — REQ-MONITOR-118's silence with tool calls in flight,
  REQ-MONITOR-120's recovery after a stall, and REQ-NOTIFY-111's one corrective message (OQ-127).

The issue-kind vocabulary SHALL also hold `model_wait` (REQ-NOTIFY-090's wait on a provider limit),
`validation_llm_error` (REQ-ORCH-092's validation retry) and `compression_failed` (a compression that did not complete).

REQ-ORCH-139's closure is unchanged and reads over the vocabularies as extended here. Like the words other domains'
Data & Formats fix, the timeline words of the chat domain ([`PD-CHAT-009`](#pd-chat-009)) and of domain 05
([`PD-TOOLS-011`](#pd-tools-011)) are among those vocabularies, and a run uses no name outside them.

**Why, and what it costs.** The product wrote twenty-eight names under no vocabulary's word — fifteen of the words above
and the chat domain's thirteen — a recorded departure from REQ-ORCH-139's "MUST NOT" that a lint gate held on a closed
waiting list (OQ-157), and the three issue kinds under none either. The rulings of OQ-127 and OQ-76 add five facts the
product now records — the three watchdog words above and `PD-TOOLS-011`'s two — so thirty-three timeline words join the
vocabularies in all. The alternative was to move the facts to another record, and the only candidate, the session log,
is worse on every count: autopsies and exports read the timeline (REQ-SESSION-199) and the log is in neither; the
product reads several of these entries back
(`model_exhausted` and `model_override` on resume, ADR-0027; `context_compressed` for REQ-MONITOR-086's count,
ADR-0060; PD-ORCH-005's rest and resume, whose checks read the metadata); and moving them would need store changes
and lose what earlier sessions recorded. What is given up: domain 01's list alone is no longer the whole of its
vocabulary, so a reader of the specification must follow the back-pointer to this entry to know every name a run may
write.

> **Extends:** REQ-ORCH-139, REQ-NOTIFY-268
> **Narrows:** REQ-CONFIG-135

*REQ-CONFIG-135 stood under **Extends** until 2026-10-06, and its back-pointer read "Extended by": acceptance finding F15
found the label wrong, since OQ-53's ruling reads its "session's event stream" as the timeline, so the requirement
governs except in the case named here. The disposition and the back-pointer were relabelled; no text changed
([`pd-orch-014-records-req-config-135-as-extended-where-oq-53-narrows-it`](../defects/fixed/pd-orch-014-records-req-config-135-as-extended-where-oq-53-narrows-it.md)).*

*Raised by the owner, 2026-10-06, ruling OQ-157, OQ-53 and OQ-127 as recommended; logged as [R-071](requests.md#r-071). Built as
`PD-ORCH-006` and renumbered `PD-ORCH-014` before it landed, `main`'s `PD-ORCH-006` to `PD-ORCH-013` having landed
meanwhile.*

> **First execution, 2026-10-06, built under [R-071](requests.md#r-071):** the twenty-eight names were already
> written, and the five raised beside them are written by the builds of OQ-127's and OQ-76's rulings (`stallRecords`,
> `UserPresence`); the directive's execution is the gate. `tools/check-timeline-vocabulary.mjs` (in `pnpm lint`) moved
> every name `AWAITING` held to `VOCABULARY` — the twenty-eight names it held for OQ-157, and OQ-127's three, which it
> held from the stall watch's build until this ruling — and added OQ-76's two: thirty-three words in all, each cited to
> this directive, `PD-CHAT-009` or `PD-TOOLS-011`. `AWAITING` is empty, so a new name fails the gate again. Its test
> checks that each cited directive's entry states its word in backticks, as it already checked a requirement's, and that
> this entry and the gate state the split of twenty-eight held and five raised beside them. Nothing in the rule was
> wrong. The issue kinds are not gated: no gate reads an issue's kind. Every other kind the product writes is named by a
> requirement of its own domain but one, `resumed_under_changed_instructions`, which [`PD-ORCH-005`](#pd-orch-005)
> clause 14 coined and OQ-105's ruling kept as built (revision 7): that directive's word, as this entry's three are its
> own (read by hand on this day, over the source of `f94ab75`, and again of `395b73e` once `fin21` had landed). The row
> is in [`../architecture/first-executions.md`](../architecture/first-executions.md). *Corrected in place 2026-10-06,
> before it landed (the verifier's review): this entry first gave the sum, thirty-three, as the count the product wrote
> under no word and the gate moved, where twenty-eight were held and five raised beside them; and it said every other
> issue kind was named by a requirement, which a second reading of the kinds found untrue of PD-ORCH-005's one.*

---

<a id="pd-chat-009"></a>

### PD-CHAT-009 — the user's chat controls are recorded under the chat domain's timeline words

The chat domain SHALL have a timeline-event vocabulary of its own, whose words name what the user did with the
conversation's controls and what became of it:

- `steering_submitted`, `steering_injected` and `steering_not_delivered` — a steering prompt submitted by the user,
  delivered into its agent's conversation, and one the run ended before delivering (REQ-MONITOR-133, REQ-MONITOR-134);
- `prompt_queued`, `prompt_edited`, `prompt_removed` and `prompt_triggered` — a prompt queued for the next iteration,
  edited, removed, and become a task (REQ-CHAT-035, REQ-CHAT-037, REQ-CHAT-038, REQ-CHAT-040);
- `todo_edited` — a todo item added, updated or removed by the user;
- `entry_model_switched` and `entry_reasoning_switched` — the entry model or reasoning level switched by the user;
- `transcript_cleared` — the transcript cleared by the user (REQ-CHAT-081);
- `run_paused_message_limit` and `pause_resolved` — the run pausing at the message limit (REQ-ORCH-087), and that pause
  resolved by the user.

Each entry is written when the fact occurs, on the session's timeline, and is among the records the session domain's
export reaches. REQ-ORCH-139's closure over these words is [`PD-ORCH-014`](#pd-orch-014)'s.

**Why, and what it costs.** These thirteen were written with no vocabulary's word (OQ-157). They are the user's own
actions, so they belong to the domain whose controls produce them rather than to domain 01's list of what a run does. A
person reading the export after the fact can tell what the user did from what the run did. What it costs: a second
domain now fixes timeline words, and a reader of domain 03 has to know that this entry holds them.

> **New:** no live requirement covers this.

*Raised by the owner, 2026-10-06, ruling OQ-157 as recommended; logged as [R-071](requests.md#r-071). Built as `PD-CHAT-007`
and renumbered `PD-CHAT-009` before it landed, `main`'s `PD-CHAT-007` and `PD-CHAT-008` having landed meanwhile.*

> **First execution, 2026-10-06, built under [R-071](requests.md#r-071):** with `PD-ORCH-014`'s, as one gate; the
> thirteen names were already written as stated, and the gate cites each to this entry. Nothing in the text was wrong.

---

<a id="pd-tools-011"></a>

### PD-TOOLS-011 — a user's own terminal action and the user's presence have their words

**The audit's two members.** A permission-audit entry that records a user's own terminal action (REQ-SHELL-107)
carries the decision `user-input` and the source `user`. `user-input` SHALL be a member of the decision vocabulary that
an audit entry and its `permission.decision` event are read against, beside REQ-TOOLS-012's three. `user` SHALL be a
member of REQ-TOOLS-028's decision-source vocabulary, its thirteenth. No policy resolution yields either. What
REQ-TOOLS-012 says of resolution is unchanged: it yields `allow`, `ask` or `deny`, and the dispatcher handles only
`allow` or `deny`. Only the entry of a user's own terminal action carries the two.

**The presence words.** Domain 05's timeline words SHALL also hold `user_away` and `user_returned`: the run marking its
user away when an approval wait ended by timeout, and the user's next input to the session ending that stretch
(PD-TOOLS-005). Each entry carries the expired timeout, in seconds, as `after_seconds`.

**Why, and what it costs.** The terminal's audit entry was written with REQ-SHELL-107's two words, which neither closed
vocabulary held, so a decision-log reader enumerating them would not recognise it (OQ-54). The presence transitions were
session-log lines only (OQ-76), so an autopsy reading the store or the export saw a row of `permission_denied` issues and
not the instant the user went away or came back. What it costs: the audit's vocabularies are no longer the policy's, and
a reader must tell an audit decision from a policy outcome. The product keeps them apart in code (`AUDIT_DECISIONS` and
`AUDIT_DECISION_SOURCES` beside `DECISIONS` and `DECISION_SOURCES` in `packages/contracts/src/tools.ts`).

> **Narrows:** REQ-TOOLS-012, REQ-TOOLS-028

*Raised by the owner, 2026-10-06, ruling OQ-54 and OQ-76 as recommended; logged as [R-071](requests.md#r-071). Built as
`PD-TOOLS-007` and renumbered `PD-TOOLS-011` before it landed, `main`'s `PD-TOOLS-007` to `PD-TOOLS-010` having landed
meanwhile.*

> **First execution, 2026-10-06, built under [R-071](requests.md#r-071):** the rule held as written. The terminal's
> audit entry takes its two words from the audit's vocabularies (`USER_TERMINAL_DECISION` and `USER_TERMINAL_SOURCE` in
> `apps/desktop/src/run-host/terminal.ts`), and `UserPresence` writes `user_away` (actor `rotaris`) and `user_returned`
> (actor `user`) beside its two session-log lines, which keep their `WARNING` level so the stretch's end is visible
> wherever its start is (`packages/engine/src/run/presence.ts`). **What was measured.** `contracts.test.ts` and
> `presence.test.ts`, each red on `37f7a98`. **What was not measured.** No built-app or live run marked a user away.
> The row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).

> **Built-app execution of the presence words, 2026-10-13, plan fin42:** `pnpm approvals-proof`'s `away` launch marked a user
> away and back in the built app. One `user_away` entry (actor `rotaris`, `after_seconds: 12`) was written in the millisecond
> the first approval wait timed out, and one `user_returned` entry (actor `user`, `after_seconds: 12`) 3.5 s later, by the
> answer to the question tool's approval, with the session log's two lines at `WARNING` beside them. The rule held as written.
> The terminal's audit words (`user-input`, `user`) were not driven by it. A live run is still owed: `live-run.mjs`'s `away`
> scenario reads `user_away` against a real model, and `user_returned` is measured only in the proof.

---

<a id="pd-library-003"></a>

### PD-LIBRARY-003 — an artifact's body is its document, and a person's edit of it survives and travels

*Revision 2 (2026-10-13, [R-072](requests.md#r-072), ruling [OQ-272](../architecture/open-questions.md#oq-272)) — **the
frontmatter is the record's in the inspector and at a save**: clause (f)'s second sentence is replaced and clause (c) gains one
sentence, each replaced sentence quoted beneath its clause; the costs paragraph loses one cost and gains two, the replaced
wording quoted beneath it; REQ-LIBRARY-133 joins the Extends line.*

**(a) The body.** The record's `body_markdown` SHALL be the Markdown document REQ-LIBRARY-087 keeps on disk, created as
REQ-LIBRARY-090's rendering.

**(b) The submitted body, kept twice.** A publish SHALL keep the submitted body unchanged in `key_findings` and as the
document's Key Findings section. The section drops only the blank lines before the body's first line and after its last.
Both copies are intended.

**(c) An edit.** An edit replaces the document and stamps `edited_at`. `key_findings`, `summary` and every other column keep
their published values, as REQ-LIBRARY-094 is written, and REQ-LIBRARY-099's section filter reads those columns. A save writes
the record's frontmatter (with the new `edited_at`) in place of the document's leading block, or in front of the text when none
is found, as clause (d) does at a re-render. *(Revision 2, OQ-272.)*

> **Revision 1's clause (c) said, and no longer governs alone** (OQ-272): it ended at "and REQ-LIBRARY-099's section filter reads
> those columns." and said nothing of the frontmatter a save writes, so the document was written as the inspector sent it.

**(d) A re-render keeps the edit.** A re-render of a record a person has edited SHALL rewrite the document's leading
frontmatter block from the record, or put a block in front when none remains, and keep everything after it as saved. This
covers REQ-LIBRARY-095's supersession and REQ-LIBRARY-092's re-materialisation. A document that cannot be read is left as it
is; a document that is absent is written whole from the record.

**(e) The handoff carries the edit.** REQ-SESSION-115's handoff SHALL carry an edited artifact as its document with the
frontmatter removed, within the same 6,000 characters, and its header marks it `edited`. An unedited artifact, or one whose
document cannot be read, is carried from its columns as before.

**(f) The Preview.** The inspector's Preview (REQ-LIBRARY-132) SHALL render the document from below its leading frontmatter
block. The Markdown tab shows the whole document: its leading frontmatter block read-only, and the text below it in the editor;
Save sends the block as loaded followed by the edited text. *(Revision 2, OQ-272.)*

> **Revision 1 said, and no longer governs** (OQ-272): "The Markdown tab shows and edits the whole document."

A frontmatter block is one whose first line is `---`, which closes at the next `---` line, and in which every line between is
a `key: value` line.

**Why, and what it costs.** REQ-LIBRARY-087, REQ-ORCH-149 and REQ-SESSION-002 all make an artifact's body a file on disk that
the record never holds, and REQ-LIBRARY-093 says a publish's `body_markdown` is the submitted body unchanged: both cannot be
literally true of one stored thing ([OQ-210](../architecture/open-questions.md)). The build kept the document as the body and
the submitted body in `key_findings` and the Key Findings section, which REQ-LIBRARY-088, 093 and 087 together require; this
directive records that departure from REQ-LIBRARY-093's text. Confirming it exposed a defect: a re-render wrote the rendering
of the columns over a document a person had saved, while `edited_at` and ` · edited` stayed
([the defect note](../defects/fixed/a-re-render-writes-over-a-persons-saved-artifact-edit.md)). If the document is the body,
a re-render of an edited one refreshes only what the record owns, its frontmatter, and the person's correction is what the
next agent is handed. What it costs: an agent reading a published artifact sees its first line twice (in Summary and in Key
Findings) and a few hundred characters of frontmatter, which spend REQ-LIBRARY-098's budget a little faster; a large
published body is stored both in the record and on disk; after an edited child report is re-materialised the document keeps
the person's text while the columns, the Library summary and the section filter show the new report, so the two can
disagree, and ` · edited` is what says so; REQ-LIBRARY-134's empty-body fallback applies only to an empty or truncated file;
a person cannot change frontmatter text from the inspector, and none of their changes there were ever kept; and a document whose
block an earlier edit broke is shown whole and editable, its next save puts a fresh block in front, and the broken lines remain
as text (and travel in the handoff) until the person removes them. *(Revision 2, OQ-272.)*

> **Revision 1's costs said, and no longer govern** (OQ-272): "…and ` · edited` is what says so; a person who deleted the
> frontmatter sees it come back at the next re-render; and REQ-LIBRARY-134's empty-body fallback applies only to an empty or
> truncated file." Since revision 2 the inspector offers no way to delete the frontmatter, and a save puts it back at once.

> **Narrows:** REQ-LIBRARY-093, REQ-LIBRARY-095
> **Extends:** REQ-SESSION-115, REQ-LIBRARY-132, REQ-LIBRARY-133

*Revision 2, 2026-10-13 ([OQ-272](../architecture/open-questions.md#oq-272), ruled under [R-072](requests.md#r-072)):
REQ-LIBRARY-133 joins the Extends line with its back-pointer, and REQ-LIBRARY-132's back-pointer names revision 2.
REQ-LIBRARY-094, REQ-LIBRARY-095, REQ-LIBRARY-092 and REQ-SESSION-115 keep their text and their notes.*

*Raised under the owner's delegation, 2026-10-07; logged as [R-072](requests.md#r-072), the ruling of OQ-210, which weighed
advocate A's change of behaviour and advocate B's confirmation as built and followed both.*
Revision 2 logged as [R-072](requests.md#r-072) (OQ-272), ruled by the consortium under the owner's delegation on 2026-10-13:
the frontmatter shown read-only, and a save writing the record's frontmatter.

> **First execution, 2026-10-07 (bundle `fin28-artifacts`).** Clause (d) found a defect, the one the ruling named: a re-render
> wrote the whole rendering over an edited document
> ([the note](../defects/fixed/a-re-render-writes-over-a-persons-saved-artifact-edit.md)). `ArtifactStore.rerender`
> (`packages/engine/src/artifacts/store.ts`) now rewrites only the frontmatter (`renderFrontmatter`, `splitFrontmatter` in
> `packages/contracts/src/artifacts.ts`); `latestArtifactText` (`packages/engine/src/sessions.ts`) carries an edited document
> marked `edited`; `renderSidecar`'s Key Findings section drops only blank lines; the inspector's Preview starts below the
> frontmatter (`previewSource`). Clauses (a), (b) and (c) held as built. **What was measured.** Nine cases in
> `artifacts/artifacts.test.ts` (seven red on the code before), one in `session-resume.test.ts` (red before), the block
> definition in `contracts/src/artifacts.test.ts` and the Preview's source in `library/ArtifactInspector.test.ts`;
> `pnpm artifacts-proof`'s launch 4 asserts the Preview renders no frontmatter line, and passed (its inspector opened at the
> artifact's title). The built-app evidence for the Preview is `pnpm artifacts-proof`'s, its probe and its screenshots,
> where the plan had named `pnpm app:drive`, which was not run (corrected by fin30, 2026-10-07, which added launch 4's
> `inspector-preview.png`, taken while the Preview tab is shown: the launch's closing screenshot shows the Markdown tab and
> the saved edit; the fin30 run shows the dialog's Preview opening at "The scripted plan", no frontmatter line drawn).
> **What was not measured.** No built-app launch edits an artifact and then supersedes or re-reports it:
> that survival is measured on the real store on disk by the unit tests. The orchestrator's live run should show unedited
> artifacts read as before. The row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).
>
> **First live execution, 2026-10-07 (the final default live run at `a68f121`, pack `2026-10-07T06-48-50-123Z`):** what the
> paragraph above asked of the orchestrator's live run held. In the terminal session, iteration 2's fresh root read the child
> report `art_KKd3l5TA` with `artifact_read` (tool call `#24`), and it returned the document clause (a) makes the body: its
> frontmatter, title, Summary, Key Findings and Commands. Found nothing against the directive. **Not reached:** an edited
> artifact (clauses (c) to (e)) and the Key Findings section's indentation case; no person edited an artifact in the pack.
> The row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).
>
> **Clauses (c) to (e) in the built app, 2026-10-13 (fin42, item N57).** "No built-app launch edits an artifact and then
> supersedes or re-reports it" no longer holds. `pnpm artifacts-proof`'s launch 8 (`edited`) publishes `travel-plan` and a person
> edits and saves it in the Markdown tab: `edited_at` was stamped and `key_findings` kept the published body (c). Launch 9
> (`re-reported`) continues that session: the fresh root's first message carried `Artifact: <id> — Travel plan (agent_published,
> published, edited)` with the person's text and no frontmatter line (e), and its publish of `travel-plan-2` with `supersedes:
> travel-plan` rewrote the older document's frontmatter (`superseded_by`) and kept the person's text below it (d). **Found by
> building:** the first build of launch 8 typed where its click put the caret, the editor's centre, which is inside the
> frontmatter; the save stamped `edited_at` and the table showed ` · edited`, and launch 9's re-render rewrote the block, so the
> edit was gone while the handoff still named the artifact `edited`. That is clause (d) as written, and a cost the paragraph
> above does not name; raised as [OQ-272](../architecture/open-questions.md#oq-272), not decided. The proofs now take the caret
> below the frontmatter first. A person's edit live is asked by the default live run's `delegation-edit` launch, the
> orchestrator's to run. The row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).

> **First execution of revision 2, 2026-10-14 (fin43, `fin43-analysis-and-artifacts`), ruled by [R-072](requests.md#r-072)
> (OQ-272):** clauses (c) and (f) held as written. `ArtifactStore.editBody` (`packages/engine/src/artifacts/store.ts`) writes
> through `withRecordFrontmatter`, the rule `rerender` already used, with the record's new `edited_at`; `ArtifactInspector`
> (`packages/ui/src/library/ArtifactInspector.tsx`) holds the block apart (`inspectorDocument`), draws it read-only above the
> editor as "Record fields (read-only)" (`artifact-frontmatter`, a `<pre>` bounded to 30 % of the body with its own scroll,
> `--rt-font-mono`, `--rt-text-secondary`, `--rt-divider`, `--rt-surface-2`), previews and edits the text below it, sends
> `savedDocument(block, text)`, and refreshes the block from the saved document after a save. **What was measured.** Three
> cases in `artifacts/artifacts.test.ts` (a block with a changed title, a broken block, no block; each red on the code before,
> each surviving a supersession) and two existing ones restated for the block a save now writes; five cases in
> `library/ArtifactInspector.test.ts` (four red before). `pnpm artifacts-proof`, every launch green at a load average of 0.9 to
> 2.6 on four CPUs: launch 8 dropped its `Ctrl+End` chord, pressed the read-only block and typed there (focus stayed on the
> `<pre>`, the dialog stayed clean, nothing reached the document), pressed the editor's centre — now below the block (block
> 686×118 at y 510, editor 686×266 at y 636, in a 720×560 dialog) — and typed; the saved document's block carried the record's
> `id`, `slug`, `title`, `status`, `created_at` and `edited_at`, the typed text sat below it, and the shown block was refreshed
> with `edited_at`. Launch 9 read the handoff carry the person's text marked `edited` and the superseding publish keep it below a
> rewritten block that still carries `edited_at`. **What was not measured.** A live run (`delegation-edit`, the orchestrator's);
> a document whose block an earlier edit broke, in the built app (the unit cases carry it). **Found along the way:** the editor is
> drawn in the body's face, not the monospace one REQ-LIBRARY-132 asks for, because the adopted `textarea.input` rule outranks
> the inspector's class
> ([`the-artifact-inspectors-markdown-editor-is-not-drawn-in-the-monospace-face`](../defects/fixed/the-artifact-inspectors-markdown-editor-is-not-drawn-in-the-monospace-face.md),
> recorded, not repaired; repaired 2026-10-14 by fin44). The row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).


---

<a id="pd-library-004"></a>

### PD-LIBRARY-004 — a read marks the reading agent instance a consumer by its canonical name

Every successful `artifact_read`, filtered or full, SHALL append the reading agent instance's canonical name to the
artifact's `consumed_by`, at most once. That name is a child's canonical name (REQ-ORCH-044) or a root's recorded
`root_canonical_name`: the name REQ-LIBRARY-093 gives `created_by`. Two instances of one persona that read one artifact are
two consumers; one instance that reads twice is one consumer (REQ-LIBRARY-096). The received links of REQ-MONITOR-044,
REQ-MONITOR-052 and REQ-MONITOR-069 read these names.

**As built.** `ArtifactStore.markConsumed` in `packages/engine/src/artifacts/store.ts`, called by `artifactOps`'s `read` in
`packages/engine/src/artifacts/port.ts` with the calling agent's `canonicalName`; `agentArtifacts` in `packages/ui/src/agents.ts`
matches an agent's names against the consumers.

**Why, and what it costs.** REQ-LIBRARY-099 and REQ-TOOLS-148 say "the reading persona"; REQ-LIBRARY-096 says "the actor"
([OQ-211](../architecture/open-questions.md)). REQ-LIBRARY-093's reason for naming `created_by` by instance, that two instances
sharing a persona stay distinguishable, applies as much to who read an artifact, and OQ-125, confirmed under R-071, already
reads an agent's received artifacts from the consumers by name. The persona can be recovered from the instance; the instance
cannot be recovered from the persona. Under the persona reading the received links would be wrong whichever way they matched:
empty when matched by name, or crediting every sibling of the persona, and the run-level agent with every read of a child of
the entry persona, when matched by persona. What it costs: canonical names are unique only under one parent (REQ-ORCH-044), so
two children of different parents that share a name are one consumer, the same limit `created_by` already has; every iteration
root of one persona shares one root canonical name; a black-box comparison of `consumed_by` with the reference may differ, and
only the received links show it; and PD-LIBRARY-001's back-pointer phrase "marks the persona a consumer" now reads as the
instance.

> **Narrows:** REQ-LIBRARY-099, REQ-TOOLS-148

*Raised under the owner's delegation, 2026-10-07; logged as [R-072](requests.md#r-072), the ruling of OQ-211, which weighed
advocate A's and advocate B's recommendations, both to confirm as built with a directive, and followed both.*

> **Built 2026-10-07 (bundle `fin28-artifacts`), as built before.** Nothing in the code moved: the comments in `store.ts` and
> `port.ts` cite this entry, and three pinning tests hold it, each green on the build as it stood — two instances of one persona
> read one artifact and are two consumers in read order (`artifacts/artifacts.test.ts`), only the reading instance has the
> received link and its same-persona sibling none, and a child of the entry persona that reads does not credit the run-level
> agent (`ui/src/inspector-links.test.ts`). No mechanism ran for the first time, so no row is owed to
> [`../architecture/first-executions.md`](../architecture/first-executions.md), as the ruling decided.

---

<a id="pd-library-005"></a>

### PD-LIBRARY-005 — an improvement pass whose collector failed reads as the failure it is

**The case, stated exhaustively.** An improvement analysis job of either pass — the post-run analyst (REQ-LIBRARY-015) or the
retrospective ([`PD-LIBRARY-002`](#pd-library-002)) — ends with an empty artifact stored, and that artifact's `notes`:

1. begin "collector crashed: " (REQ-LIBRARY-023, a crash other than the timeout) or "collector parse failed: "
   (REQ-LIBRARY-022, the retry failed too). The pass SHALL then post its own failure warning in place of the zero-proposal info
   notice, with no action: "The completed run could not be reviewed for improvements" for the post-run pass, "The retrospective
   could not be completed" for the retrospective. Its detail SHALL read, for the post-run pass,
   "Session <sid> was not reviewed for improvements: <reason>. <artifact id> holds no proposals." and, for the retrospective,
   "This workspace's own history was not reviewed: <reason>. <artifact id> holds no proposals.", where <reason> is "the analysis
   call failed (<exc>)" for a crash and "the model's answer could not be read (<err>)" for a parse failure, <exc> and <err>
   being the text the stored notes carry after their prefix;
2. begin "collector timed out after <t> seconds" (REQ-LIBRARY-023). The pass SHALL post its zero-proposal info notice, with no
   action, as before. The post-run pass's detail is `PD-CONFIG-003` revision 2's, unchanged. A timed-out retrospective's detail
   SHALL read "The retrospective reached its <t>-second limit before it proposed anything." and SHALL name no control: its bound,
   `retrospective_timeout`, has none (`PD-LIBRARY-002`).

In both cases the artifact is stored and the proposal list re-read exactly as for any artifact (REQ-LIBRARY-124's first
sentence, REQ-LIBRARY-035(e)). Every other empty artifact — notes absent, or REQ-LIBRARY-046's duplicate-suppression note — keeps
its pass's zero-proposal info notice and its detail. A job that ended without an artifact keeps REQ-LIBRARY-124's warning
(`PD-LIBRARY-002` (c)'s for a retrospective), with the reason the job carried.

**Disjoint from the other narrowing of REQ-LIBRARY-124.** `PD-LIBRARY-002` revision 2 (c) decides **the retrospective's three
notices** — the titles a retrospective's proposals, its zero-proposal result and its failure carry. This directive decides
**which notice an empty artifact of a failed collector posts**, for both passes, and the timed-out retrospective's detail; its
revision 4 adds to (c) the one sentence that hands those cases here. Neither restates the other.

**Why, and what it costs.** REQ-LIBRARY-023 stores an empty artifact for a crashed collector, and REQ-LIBRARY-124 reads every
artifact with zero proposals as "a result with zero proposals", its warning reserved for "a job that ended without producing an
artifact". So a pass that never reached the model — the retrospective's 401 in the live run at `ce5f952`, the analyst's answer
twice unreadable — was told to the person as one that looked and found nothing ("The retrospective found nothing to propose",
"Nothing was proposed in impart_dL3YK5Xd."), which REQ-NOTIFY-100's truthfulness and REQ-NOTIFY-254 ("No failure is reported by
silence") read against ([OQ-285](../architecture/open-questions.md#oq-285);
[`a-crashed-improvement-collector-reads-as-an-analysis-that-found-nothing`](../defects/fixed/a-crashed-improvement-collector-reads-as-an-analysis-that-found-nothing.md)).
The warning tells the person the review did not happen and why, the same notice a job with no artifact already earns; naming
the artifact says where the notes are kept. A timeout is different in kind: the pass ran and was cut at a bound the person can
read, so it keeps the info notice, with `PD-CONFIG-003` revision 2's precedent (OQ-223) extended to the retrospective without a
control, since none exists. What it costs: a stored artifact now reports as a failure, so the Library holds an artifact the
notice called a failed review; the post-run warning's title is REQ-LIBRARY-124's failure wording on a result the requirement
counts as a success; and the product departs from an implementation built from the specification alone, which posts the info
notice for every empty artifact. REQ-LIBRARY-022, REQ-LIBRARY-023, REQ-LIBRARY-024, REQ-LIBRARY-035, REQ-NOTIFY-100,
REQ-NOTIFY-254, `PD-CONFIG-003` revision 2 and OQ-223 are cited and not changed.

> **Narrows:** REQ-LIBRARY-124

*Ruled under the owner's delegation, 2026-10-14 ([OQ-285](../architecture/open-questions.md#oq-285); dated 2026-10-13 until fin46
corrected it from the consortium's ruling record); logged as
[R-072](requests.md#r-072). Narrows REQ-LIBRARY-124 for both passes. Comes with `PD-LIBRARY-002` revision 4, ruled with it, which
names this directive in its clause (c). `PD-CONFIG-003` revision 2 is unchanged. The build's reading, kept as the falsified one:
an empty artifact whose collector crashed or could not be parsed posts the zero-proposal info notice and "Nothing was proposed in
<id>.".*

> **First execution, 2026-10-14, built under [R-072](requests.md#r-072) (fin44, `fin44-improvement-failures`), with
> `PD-LIBRARY-002` revision 4:** the rule held as written. `@rotaris/contracts` exports `COLLECTOR_CRASHED_PREFIX`,
> `COLLECTOR_PARSE_FAILED_PREFIX` and `COLLECTOR_TIMED_OUT_PREFIX`, and `analyzeImprovement`
> (`packages/engine/src/improvements/analyst.ts`) writes its three notes with them. `emptyArtifactNotice`
> (`apps/desktop/src/main/improvement-notice.ts`) replaces `zeroProposalDetail`: it returns the level, title and detail for every
> empty artifact. The coordinator's `stored` in `apps/desktop/src/main/index.ts` raises that notice with no action and, for a
> failed collector, writes a warning line to the application log. `failed` shares `passFailureTitle` and `passFailureDetail`.
> **What was measured.** `improvement-notice.test.ts` covers crash, parse failure, timeout and a clean empty result for each
> pass (red before the change: the old module gave "Nothing was proposed in <id>." for all but the post-run timeout).
> `analyst.test.ts` pins the prefixes the notes begin with, and `scripted-client.test.ts` pins the proof's new `crash` (an HTTP
> 401) and `garbage` (no JSON, twice) analyst scripts. In the built app, `pnpm retrospective-proof` read 61 of 61 in each of two
> runs, at a load average of 1.0 to 2.1 on four CPUs. Its launch 9 stored "collector crashed: Unauthorized" and showed the
> warning "The retrospective could not be completed", with "This workspace's own history was not reviewed: the analysis call
> failed (Unauthorized). impart_… holds no proposals.", no action and a `warning` log line. The parse-failure launch did the same
> with "the model's answer could not be read (collector output is invalid JSON: …)". Launch 5 read "The retrospective reached its
> 5-second limit before it proposed anything." On a build with the old `index.ts` and `improvement-notice.ts` the same proof read
> 56 of 61: both launches showed "The retrospective found nothing to propose" at `info` with "Nothing was proposed in <id>.", and
> no log line was written. **Found:** nothing beyond the defect the ruling repaired. **What was not measured.** The post-run
> pass's warning in the built app (no proof drives a run whose analyst fails; the unit cases carry it), and a live run: the
> orchestrator's `ask-retrospective` with the analyst's key withheld. Repairs
> [`a-crashed-improvement-collector-reads-as-an-analysis-that-found-nothing`](../defects/fixed/a-crashed-improvement-collector-reads-as-an-analysis-that-found-nothing.md).
> The row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).

---

<a id="pd-session-002"></a>

### PD-SESSION-002 — summary.md's mostly-elided artifacts are the attached artifacts a delegated agent was not given

The Warnings section of `summary.md` (REQ-SESSION-140) SHALL count as its mostly-elided artifacts every artifact a delegating
agent attached to a delegated agent (`attach_artifacts`, REQ-TOOLS-152) that the agent's `PRIOR AGENT CONTEXT (FULL)` block
left out because it did not fit that block's budget (REQ-LIBRARY-098). Each pair of agent and artifact counts once, however
many times that agent's payload was assembled. The count is taken over REQ-LIBRARY-098's context-selection diagnostic as the
session's timeline records it (`context_selection`, PD-ORCH-014). No retention cap trims that diagnostic, so the count reads
as a plain number, and `0` when nothing was left out. The line SHALL state what it counts, how many agents it concerns, and
the record it is counted from. Not counted: entries left out of the sibling index (REQ-LIBRARY-097), the continuation
handoff's cut of the latest artifact (REQ-SESSION-115), an unresolvable reference, and a document that could not be read.
Every other clause of REQ-SESSION-140 still governs, and the Metrics section's context-selection line keeps reading `n/a`,
because REQ-SESSION-133's context-selection ring is not kept (ADR-0024).

**As built.** `StoreDal.elidedAttachmentRowsOf` (`packages/store/src/dal.ts`) reads each `context_selection` entry's
`task_id` and `attached_elided` over the timeline's primary key, inside `summaryFactsOf`'s one read transaction;
`elidedAttachmentsOf` (`packages/engine/src/run/summary.ts`) counts the distinct pairs and the agents, skipping metadata it
cannot read; `warningLines` writes
`- Mostly-elided artifacts: N (attached artifacts a delegated agent was not given because they did not fit its context budget, across M agents; counted from the timeline's context_selection entries, which name each)`,
and at `0` the same words without the agents. The entry is written by `artifactContext` in
`packages/engine/src/children/orchestration.ts`.

**Why, and what it costs.** The specification names the kind and defines it nowhere (OQ-207): the line as built could
never show a value. This is the one elision a delegating agent chose and a child was promised — an attached artifact is
handed over in full or not at all — and the store already records it, whole, on a timeline no cap trims. What it costs:
"mostly" is read as "wholly"; the line reads `0` in most sessions, since attachments rarely overflow the budget; a continued
session whose latest artifact the handoff cut to 6,000 characters raises no warning; and every save's rebuild reads the
session's `context_selection` entries.

> **Extends:** REQ-SESSION-140

*Ruled under the owner's delegation, 2026-10-07; logged as [R-072](requests.md#r-072), the ruling of OQ-207.*

> **First execution, 2026-10-07, built by fin28 under [R-072](requests.md#r-072):** the rule held as written; nothing in the
> text was wrong. **What was measured.** `elidedAttachmentsOf`'s cases (none, one entry with two ids, a retry's second
> entry counted once, two children, malformed metadata skipped) and the Warnings line at `0`, `1` and `3` in
> `run/summary.test.ts`; the read itself, its order and its plan over the primary key in `store.test.ts`; the live run's
> reading in `lib/summary-sections.test.ts`; each red on `d12f1f2`. `sessions-proof`'s seed holds the built app's line to a
> plain `0` naming the `context_selection` entries. **What was not measured.** No built-app or live run delegated with
> attachments that overflowed the 48,000-character budget, so a non-zero line has been seen in unit tests only. **Found on
> the way:** the delegate tool's observation counts attachments before the budget applies, and REQ-TOOLS-152 budgets the
> section at 100,000 characters where REQ-LIBRARY-098 and the build use 48,000
> ([`the-attached-artifact-budget-is-48000-characters-where-req-tools-152-sets-100000-and-drops-every-later-one.md`](../defects/fixed/the-attached-artifact-budget-is-48000-characters-where-req-tools-152-sets-100000-and-drops-every-later-one.md),
> recorded, not repaired). The row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).

> **Cross-reference, 2026-10-07 ([OQ-221](../architecture/open-questions.md), under [R-072](requests.md#r-072)):** no clause
> above changes, so this directive gains no revision. "That block's budget (REQ-LIBRARY-098)" now reads as
> [`PD-TOOLS-006`](#pd-tools-006) revision 5's 100,000-character section and its skip-and-continue rule. The count reads the
> distinct agent-and-artifact pairs whose body did not fit that section after the attachments carried before it; for every
> child whose payload was assembled, those are exactly the ids its delegate observation named as left out for size. The note
> found on the way above is repaired by that revision.

> **Reported back 2026-10-13:** "a non-zero line has been seen in unit tests only" no longer holds for the built app.
> `pnpm artifacts-proof` launch 7 (`attached`, PD-TOOLS-006 revision 5's first execution, 2026-10-07) attached three artifacts
> and a reference, one of them left out for size, and the session's `summary.md` read "Mostly-elided artifacts: 1"
> ([`PD-TOOLS-006`](#pd-tools-006)). The live half stays open: no live run has yet attached artifacts to a delegation. The
> row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).

---

<a id="pd-session-003"></a>

### PD-SESSION-003 — an error-path tool record's arguments keep their shape, and what is never cut stays whole past 2,000 characters

When a tool call ends in error, its record's arguments are cut (REQ-SESSION-136) under these clauses:

- **(a)** The 2,000 characters are counted over the arguments' JSON text. Arguments that fit are stored unchanged.
- **(b)** Arguments that do not fit keep their shape: every key and every array element stays.
- **(c)** Only free-text string values are cut, longest first, in key order on a tie. Each cut value ends with
  REQ-SESSION-194's `...`, counted inside its own length, and cutting stops when the text fits.
- **(d)** A value is a path, an identifier or a timestamp when its key's last word, in snake or camel case, is one of:
  `path(s)`, `file(s)`, `filename`, `dir`, `directory`, `cwd`, `url`, `uri`, `id(s)`, `slug`, `ref(s)`, `hash`, `name(s)`,
  `at`, `timestamp`, `time`, `date`, `since`, `until`. The same holds when the key is one of `persona`, `supersedes`,
  `depends_on`, `continuation_of`, `write_scope`, `inherited_context` or `attach_artifacts`. Such a value, and everything
  beneath it, is never cut. Numbers, booleans and null are never cut.
- **(e)** When the values kept whole pass 2,000 on their own, every free-text value is cut to the marker alone and the
  stored arguments go over 2,000 characters.
- **(f)** The result stays one text: its head is kept and the marker is appended.

Every other clause of REQ-SESSION-136 and REQ-SESSION-194 still governs; a call that succeeded keeps its arguments and result
whole, as before.

**As built.** `cutArguments`, `argumentKeptWhole`, `WHOLE_WORDS` and `WHOLE_KEYS` (`packages/engine/src/run/cut.ts`), called
by `SessionWriter.settleToolCall` (`packages/engine/src/session-writer.ts`) for an error-path record; the result through
`cut`. The live run counts arguments over 2,000 characters as a NOTE (`overCapArgs`, `apps/desktop/scripts/lib/error-record-cuts.mjs`).

**Why, and what it costs.** REQ-SESSION-136 caps error-path arguments at 2,000 characters without saying what is counted,
and REQ-SESSION-194, which names that cut among those its marker governs, ends "Counts, identifiers, paths and timestamps
are never truncated" (OQ-209). A path or an identifier cut short gives a false account to the person reading the record
after a failure, and nothing in the product relies on 2,000 as a bound: a call that succeeded keeps its arguments whole,
with no cap. Measuring the JSON text keeps one bound in the common case; measuring each value would bound nothing. The key
name is the only test that reaches an MCP tool, whose schema has no kind for a path or an identifier. What it costs: 2,000
characters is not an invariant for error-path arguments, so no reader may size for it; and the key test is a heuristic for
MCP tools — a `file` or `name` key holding content is kept whole, and an identifier under an unusual key (`target`,
`selector`) can be cut.

> **Narrows:** REQ-SESSION-136, REQ-SESSION-194

*Raised by fin23, 2026-10-06, as OQ-209; ruled 2026-10-07 under the owner's delegation, logged as [R-072](requests.md#r-072).
The ruling names it PD-SESSION-002; it is PD-SESSION-003 by the number the orchestrator assigned, since OQ-207's directive
takes PD-SESSION-002.*

> **As ruled, 2026-10-07 (fin28):** the reading was built before the ruling (fin23, 2026-10-06) and confirmed by it, so this
> is no first execution, and no row is owed in [`../architecture/first-executions.md`](../architecture/first-executions.md)
> (the ruling, following advocate B and `PD-SESSION-001`'s precedent). One gap was repaired with it: `delegate`'s
> `inherited_context` and `attach_artifacts` joined clause (d)'s keys
> ([`a-delegate-calls-sibling-and-artifact-ids-can-be-cut-in-an-error-path-record.md`](../defects/fixed/a-delegate-calls-sibling-and-artifact-ids-can-be-cut-in-an-error-path-record.md)),
> and `cut.test.ts` classifies every argument key of every built-in tool.

---

<a id="pd-tools-012"></a>

### PD-TOOLS-012 — the code-intelligence runtime's marker directory is a hard-coded ignore component, and every agent is told what the product's own workspace directories are

*Revision 2 (2026-10-07, R-072, the ruling of OQ-230 on finding D4 of the final duress live run at `a68f121`) — the heading
widens, the clause marked "— revision 2" below is added, the disposition gains REQ-WORKSPACE-060, and two sentences of
revision 1 no longer govern (quoted beside the new clause). Revision 1's heading was: "PD-TOOLS-012 — the code-intelligence
runtime's marker directory is a hard-coded ignore component", and its disposition: "Extends: REQ-TOOLS-140".*

The directory that holds the code-intelligence runtime's per-project marker file SHALL be a member of REQ-TOOLS-140's
hard-coded ignore components, beside `.rotaris`, matched at any depth. Its name is the first segment of the marker path in
REQ-MCP-116's binding manifest, and the code SHALL NOT write it as a literal. REQ-TOOLS-139's grep and glob scans and
REQ-TOOLS-134's directory and parent listings therefore skip it as they skip `.rotaris`, by reference to REQ-TOOLS-140; a
file inside it named by its path is still served by `read_file` and `haet_read` (REQ-TOOLS-139). Nothing else about the
directory changes: `.rotaris/` alone goes in `.gitignore` and the marker's directory in the repository's `info/exclude`
(OQ-161, ruled as built), the marker and its memories stay in the workspace root and are reached through the memory tools
(REQ-MCP-102), and where an isolated tree's memories live stays with OQ-195, deferred.

**What every agent is told about the product's own directories — revision 2.** Every agent built for a session SHALL
receive one product statement as its own always-active context unit, placed after REQ-WORKSPACE-060's four units: the entry
agent and every child, whether its persona is built in or configured (REQ-CONFIG-100). The statement is independent of
context-file injection (REQ-WORKSPACE-047): a workspace with no instruction files, no skills, or injection disabled still
gives it. Every prompt that carries the statement SHALL carry the same characters in the same order. The wording is the
implementation's; it SHALL carry four points, each true in every workspace:

- (a) the workspace scope directory and the directory holding REQ-MCP-116's marker, named from their single sources and never
  written as literals, and that where present they hold the application's own state and its code-intelligence runtime's
  project data;
- (b) that the application keeps them out of version control with lines it writes itself: the scope directory in the
  workspace's `.gitignore`, and the marker's directory in the repository's `info/exclude` only when the workspace is a
  repository's top level, so elsewhere version control may list it as untracked;
- (c) that glob, grep and directory listings never show them and a terminal does;
- (d) that unless the task concerns them, they stay out of documents, reports, findings, answers and project memories, and are
  not counted as changes to the workspace.

Revision 1 said, and no longer governs: "Nothing else about the directory changes" — the agents are now told about it — and,
among its costs, "An agent with a terminal can still list it with `find` or `ls -a`", which revision 2 answers. The rest of
revision 1 stands: the directory, the exclude line, the tool descriptions and the memories already written are unchanged.

**Why, and what it costs.** OQ-161's ruling accepted that the file tools list the directory on one run's evidence (the duress
run at `27a5127`: 38 calls by 5 agents and 80 rows naming it, three of the verifier's five defects about it). The two duress
runs since measured the cost again and found it larger. At `c2fdd6a` (finding L3), 5 agents made 41 calls and wrote 112 rows
naming it, and 37 of the failed child d2's 45 requests, 1,142.5 s of its 1,222.6 s of generation, reasoned about `.serena`,
`.rotaris` or `.git` on the run's critical path; both defects the user was told of were about product files. At `c2a9444`
(finding N6), 28 calls and 96 rows named it, a memory was written into the tree and the delivered overview listed the
runtime's files as repository files. The build already handled the directory two ways: REQ-TOOLS-140's `cache` hid its
`cache/` and listed the rest. What it costs: a user who tracks the directory themselves (a shared `project.yml` or shared
memories) loses glob, grep and listings over it from the product's agents, as REQ-TOOLS-140 already does for `build`, `out`,
`target`, `.idea` and `.vscode`; `read_file` by path, the memory tools and the terminal still reach it. A nested directory of
that name, in a subproject, is hidden too. An agent with a terminal can still list it with `find` or `ls -a`. REQ-TOOLS-140 is
a closed list, so black-box conformance against it sees one extra member.

**Revision 2's why and cost.** The final duress run at `a68f121` (finding D4; session `e6747bd0`) measured what revision 1
left: the file tools were clean (six whole-tree `glob **/*` calls and `**/.*` listed neither directory), and the terminal
carried the rest — 21 calls and 32 rows naming the directories; line 224 of the delivered `docs/verification.md` discussing the
marker directory's files; the answer's "Remains" relaying that `docs/overview.md` claims everything gitignored is absent while
both are present (a claim written by a docs-writer that holds no terminal, so the hidden directories read as absent); and
`edit_memory` #311 writing into the project memory that "absence must be checked with `ls`". It was the third duress run in a
row whose report to the user carried product files (at `c2fdd6a` 41 calls and 112 rows, both of the user's defects about them;
at `c2a9444` 28 and 96, the overview listing the runtime's files). A unit, not the terminal's description, because the writer
of the false claim held no terminal. What it costs: about 80 tokens per request; a fifth always-active unit that black-box
conformance against REQ-WORKSPACE-060 sees; a statement that may prime an agent to mention the directories, or to hold back a
fact about them that matters; a poorer fit for a user who tracks the marker directory; and no change to memories already
written.

> **Extends:** REQ-TOOLS-140, REQ-WORKSPACE-060

*Raised under the owner's delegation, 2026-10-07, ruling OQ-215 (the consortium's ruling of live-run findings L3 and N6);
logged as [R-072](requests.md#r-072).* *Revision 2 raised under the owner's delegation, 2026-10-07, ruling OQ-230
(live-run finding D4); logged as [R-072](requests.md#r-072).*

> **First execution, 2026-10-07, built under [R-072](requests.md#r-072):** the rule held as written. `IGNORE_COMPONENTS`
> (`packages/agent-tools/src/tools/search.ts`) takes `CODE_INTELLIGENCE_MARKER_SEGMENTS[0]` from `@rotaris/config`, and the
> one set already fed both the scan's walker and `read_file`'s directory listing (`listing`, `files.ts`). **Found:** the parent
> listing of a missing path read the directory unfiltered, so it listed every ignore component, `.rotaris` included; it now
> reads the same set
> ([`a-missing-paths-parent-listing-shows-the-ignore-components.md`](../defects/fixed/a-missing-paths-parent-listing-shows-the-ignore-components.md)).
> **What was measured.** The case "the code-intelligence marker directory is a hard-coded ignore component, named by the
> manifest" in `packages/agent-tools/src/tools/tools.test.ts`, red on `d12f1f2` (glob `**/*` listed
> `.serena/memories/m.md` and `.serena/project.yml`): glob, grep, the root listing and a missing path's parent listing
> skip the directory, and its marker file named by path is served; and the parent-listing case beside it, red on `d12f1f2`. **What was not measured.** No live run: the next duress
> run is the measurement (file-tool rows under the directory near zero, no marker files in the delivered overview, `git
> status` still clean). The row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).
>
> **First live execution, 2026-10-07 (the final default live run at `a68f121`, pack `2026-10-07T06-48-50-123Z`; a default
> pack, not the duress run named above):** none of the pack's 165 tool records names the marker directory in its arguments
> or its result, terminal included. The one whole-tree scan, the requirements session's `#1` `glob **/*` at the worktree's
> root 5 s after the code-intelligence server started there, returned 17 paths and none under the directory; at `c2a9444`
> the same scenario's first look at its worktree listed it. **Not shown:** that the directory existed at that instant (the
> run's sandbox is gone), and the duress measurement above, which is still owed. The row is in
> [`../architecture/first-executions.md`](../architecture/first-executions.md).
>
> **Revision 1, first duress execution, 2026-10-07 (the duress run at `a68f121`, pack `2026-10-07T07-09-30-708Z`, session
> `e6747bd0`, finding D4):** the rule held as written. The six whole-tree `glob **/*` calls (#1, #24, #29, #73, #126, #135) and
> `**/.*` (#65) listed neither directory; 0 file-tool calls named one as a path; the delivered overview listed no marker files.
> **What it did not reach:** the terminal — 5 terminal commands put the directories in front of the agents, and 21 calls and 32
> rows named them, which reached the delivered report, the answer and a project memory. That remainder is revision 2's. The row is
> in [`../architecture/first-executions.md`](../architecture/first-executions.md).
>
> **Revision 2, first execution, 2026-10-07, built under [R-072](requests.md#r-072) (fin32):** the rule held as written.
> `PRODUCT_DIRECTORIES_UNIT` (`packages/config/src/product-directories.ts`) carries points (a) to (d) with both names built from
> `WORKSPACE_SCOPE_DIR` and `CODE_INTELLIGENCE_MARKER_SEGMENTS[0]`; `SkillHost.contextUnits` (`apps/desktop/src/run-host/skills.ts`)
> pushes it last on every call; the engine was unchanged (`withContextUnits` already appends the units after any persona's
> prompt, the entry agent's and each child's). **What was measured.** `product-directories.test.ts` (the four points, the names
> from their sources, no literal in the source); seven cases in `apps/desktop/src/run-host/skills.test.ts` red on the code before
> (the statement last with and without context files, skills and force-loaded bodies; alone with no instruction file, the skill
> switch off or an unreadable body; between the closed files and the MCP section); a guard in
> `packages/engine/src/run/record.test.ts` (the entry agent and a child whose persona carries a configured prompt both end their
> units with the run host's last one, before the MCP section); `pnpm mcp-proof`'s launch 1 on the built app, the orchestrator's
> recorded prompt carrying the statement alone between the closed `AGENTS.md` and the MCP section. **Found:** the statement is
> 599 characters, nearer 150 tokens a request than the ruling's estimate of about 80 (*corrected by the bundle's review,
> 2026-10-07:* that statement left out point (b)'s last words, that elsewhere version control may list the marker's directory
> as untracked; with them it is 662 characters, nearer 165 tokens —
> [`the-product-statement-leaves-out-that-the-marker-directory-may-show-as-untracked`](../defects/fixed/the-product-statement-leaves-out-that-the-marker-directory-may-show-as-untracked.md)); and a session started with no `configure`
> (a process-wide model, which only tests and scripts use) receives no units at all, the statement included. **What was not
> measured.** No live run: the next default and duress runs are the measurement — no delivered file, answer or memory naming
> either directory, calls and rows naming them well below 21 and 32, and in the default run no priming. The row is in
> [`../architecture/first-executions.md`](../architecture/first-executions.md).

> **Reported back 2026-10-13 (fin41), from the live packs at `552d346` (default and duress) and `0bc3eee`**: revision 1's duress
> measure and revision 2's default and duress measures. Evidence:
> [`live-552d346-default-autopsy.md`](../architecture/live-runs/live-552d346-default-autopsy.md),
> [`live-552d346-duress-autopsy.md`](../architecture/live-runs/live-552d346-duress-autopsy.md),
> [`live-0bc3eee-default-autopsy.md`](../architecture/live-runs/live-0bc3eee-default-autopsy.md).
>
> - **Revision 2's statement reached every agent:** 144 of 144 agent requests at `552d346`'s default pack, 188 of 188 in its
>   duress pack, 188 of 188 at `0bc3eee`.
> - **Duress: held.** No file-tool result listed `.serena`, and no memory, answer or delivered file named it; the one deliverable
>   naming `.rotaris` is `docs/overview.md`'s faithful quote of the workspace's `.gitignore` line (`#64`). 23 calls and 33 rows
>   name either directory, against 21 and 32 at `a68f121`, but the two counts are not like for like: 15 of the 23 calls are that
>   `.gitignore` line read back (directly or through `docs/overview.md`), 3 are e2's reads into `.rotaris` hunting the answer V1
>   cut, 3 are terminal listings that show them (`#31`'s `ls -a`, `#215`, `#229`), and 2 are the verifier's `find` excluding
>   both. Calls naming `.serena` itself: 5.
> - **Default: no delivered file names either directory in either pack, and the priming clause is mixed.** At `552d346`
>   `.serena` showed only in two terminal listings (requirements `#36`, `#53`), no answer, child report or artifact named it,
>   and the worktree's `git status` (`#22`, `#35`) listed no `.serena/`. At `0bc3eee` two of the coordinator's briefs named
>   both directories as tooling not to write about (requirements `#65`, `#90`) and the verifier's report repeated it (`#108`),
>   so the default run carried some priming, though nothing delivered named them.
>
> The rows are in [`../architecture/first-executions.md`](../architecture/first-executions.md).

---

<a id="pd-git-001"></a>

### PD-GIT-001 — isolation counts the runs that could share the launch's working tree

In REQ-GIT-119, REQ-GIT-120 and REQ-MONITOR-251, a run SHALL count as active for a launch or a continue in a workspace when
it is active (REQ-SHELL-122's test) and either **belongs to that workspace**, whatever tree it runs in, or **writes in a tree
that is that workspace's folder, lies inside it or contains it**. Paths are compared whole component by component under the
canonical rule, so `/repo2` lies neither inside `/repo` nor around it. A run of an unrelated project never counts. Concretely:

- **One count, asked of the run host by main.** Main asks it with the window's workspace; the launch path and the dialog
  read the same answer, and nothing else decides either.
- **The launch dialog shows main's answer when it opens.** Above zero, or a count that cannot be read: the isolation
  checkbox is pre-checked and disabled with REQ-GIT-119's tooltip and hint. Otherwise it is unchecked and enabled, with
  REQ-GIT-118's normal hint.
- **`session.start` forces the default tree on the same answer** for a launch without an explicit tree, a count that cannot
  be read forcing it too; and every time it forces the placement it raises an informational notice scoped to the new session
  whose message is REQ-GIT-119's hint and whose detail names the branch actually made — so a run that became active after
  the dialog opened never places a session where the person did not see it go.
- **REQ-GIT-120's refusal to continue a base-tree session** (one with no worktree binding, its Branch `—`) is built on the
  same count with that session excluded, at every path that starts a further run of it — a message to it at rest, Continue,
  the retry, the plan gate's relaunch — with REQ-GIT-120's text. Loading or focusing a session stays allowed (PD-SHELL-002).

REQ-GIT-124 (the integration's own per-workspace count), REQ-MONITOR-256 (already narrowed by PD-ORCH-005) and
REQ-MONITOR-258 (whose launch clause cites REQ-MONITOR-251) are cited as support and left as they are.

**Why, and what it costs.** OQ-224 (the consortium's GI1). The dialog and main disagreed: the dialog locked for a busy
session of its own workspace, main forced a worktree for a run in any project, so an idle project's launch shown on the base
tree landed in `.rotaris/worktrees/<id>` on a branch nobody chose, its edits missing from the checkout the person looks at
until an integration (REQ-GIT-124/125) merged them; and in a plain folder, a repository with no commit, a detached HEAD or a
subfolder workspace the forced launch failed (REQ-GIT-006), about a run in another window. The requirements were written when
one instance held one workspace, so every run then could share the tree; PD-SHELL-002 already locks the dialog "while any
run is active in the workspace" and leaves "a window of another project … untouched". What it costs: REQ-GIT-120's literal
"any" and REQ-MONITOR-251's "second concurrent launch" no longer hold across projects; a workspace opened inside another open
workspace is locked whenever the outer one runs on its base tree, and since isolation needs a Git root (REQ-GIT-006) a launch
there can then only fail or attach, as a non-Git workspace's launch already does while its own run is active; a run started
after the dialog opened still places the launch in a worktree, which the notice now says; and continuing an old base-tree
session while another base-tree run of the same project executes is refused, which no user has met before.

> **Narrows:** REQ-GIT-119, REQ-GIT-120, REQ-MONITOR-251

*Raised under the owner's delegation, 2026-10-07, ruling OQ-224 (the consortium's question GI1, both advocates followed);
logged as [R-072](requests.md#r-072).*

> **First execution, 2026-10-07, built under [R-072](requests.md#r-072) (fin29):** the directive held as written, and two
> claims the record carried were false. **Found:** `session.start`'s forced isolation asked the instance's count, a reading
> fin28's repair round 1 made deliberate (`32ac0c0`), now kept falsified beside its replacement in PD-SHELL-009's first
> execution, ADR-0013's sixth execution and the process view; and REQ-GIT-120's refusal to continue a base-tree session was
> not built at all
> ([`a-base-tree-session-continues-beside-another-run-in-its-workspace.md`](../defects/fixed/a-base-tree-session-continues-beside-another-run-in-its-workspace.md)).
> **As built.** `Sessions.activeRunsSharing` and `treesOverlap`, and `baseTreeBusy` with `BASE_TREE_BUSY_REFUSAL` at the four
> paths that start a further run of a session (`packages/engine/src/sessions.ts`); `runs.active`'s `scope: 'sharing'`
> (`packages/contracts/src/process-protocol.ts`, `apps/desktop/src/run-host/dispatch.ts`); `session.newId`'s
> `isolationRequired` and `session.start`'s force and notice (`apps/desktop/src/main/commands/session.ts`), the hint one text
> in `ISOLATION_REQUIRED_HINT` (`packages/contracts/src/commands.ts`); `isolationRequiredOf` (`packages/ui/src/StartSessionDialog.tsx`)
> read by the renderer's launch dialog. **What was measured.** `commands/session.test.ts` (an idle project's launch shares its
> own base tree while another project runs; a sharing run forces the worktree and raises the notice; an unreadable count
> forces; `session.newId`'s three answers), four cases red on the source before; `run.test.ts`'s PD-GIT-001 cases (the overlap
> rule by component and case, the count over same, inner, outer and unrelated roots with the outer isolated run not counting
> for an inner folder, and the refusal: refused for the prompt, the retry and Continue beside a base-tree run of the same
> workspace with nothing written, allowed beside an unrelated project's run, after that run ended, and for an isolated session,
> the load allowed throughout), red with the refusal removed; `dispatch.test.ts`'s `sharing` hop; `start-session-isolation.test.ts`
> (the dialog locked, unlocked, and locked on an answer that does not say). Driven: `pnpm part-j-proof`'s two-window launch,
> where with A's project running, B's dialog read unchecked and enabled with REQ-GIT-118's hint, and B's unchecked launch ended
> `completed` on B's base tree with no worktree binding (B is no Git repository, so under the instance-wide force it could not
> have started). **What was not measured.** The running window's dialog locked in the built app (A's run is held at its approval
> dialog there, which is modal; the lock is pinned by the dialog and command cases), the forced-placement notice in the built
> app (no proof starts a run between a dialog's opening and its acceptance), and the refusal driven through the UI. The row is
> in [`../architecture/first-executions.md`](../architecture/first-executions.md). *Found by the landing gate (fin29's
> review):* the refusal met two cases the build had not run, `children.test.ts`'s PD-ORCH-005 clause 4 and clause 6, which
> continued a paused base-tree session in `C:/ws` beside a second base-tree run of `C:/ws` — exactly what REQ-GIT-120 now
> refuses. What they pin is REQ-CONFIG-094's per-model cap across the process, so their second session is now another
> project's (`C:/other`), and both pass; the refusal itself stays pinned by `run.test.ts`.

---

<a id="pd-orch-015"></a>

### PD-ORCH-015 — a root that answers with its plan open is corrected in its own conversation; a held answer is carried to the next root and announced

When the coordinating root of an execution iteration answers `succeeded` while items of its own plan that its task answers
for are still open (REQ-ORCH-029, REQ-ORCH-075 under `PD-ORCH-012`), the run SHALL send it a plan correction in its own
conversation before its task is re-queued, up to **the larger of 1 and the validation-retry setting**
(`runtime.auto_retries_validation`) times, so a setting of 0 no longer means no correction. Where an earlier turn of the
same execution wrote an answer, the correction SHALL say that the answer has been shown to the person, and in every case it
SHALL ask the root to record each item's true state with the todo tool, `COMPLETED` where the work is done and `ABANDONED`
where it will not be done, without redoing done work or repeating its answer. The validation-retry setting itself, and what
it counts for validation-class model failures (REQ-ORCH-092, REQ-CONFIG-120, REQ-NOTIFY-100), are unchanged.

Where the corrections are spent and the task is still re-queued (REQ-ORCH-075) or given up on (REQ-ORCH-077) for an open
plan, the run SHALL write one `system` row in the transcript saying that the coordinator answered with items of its plan not
done, naming them, and that the task was not marked complete and returned to the queue, or given up on at the retry limit.
A re-queued task's continuation payload SHALL carry, beside the marker block, the answer the held iteration wrote (the
longest answer of its root's execution), cut to 6,000 characters and labelled as the previous iteration's answer the person
was shown; only the same task's next fresh root receives it, it is kept with the task until then, and it is dropped when
the task completes or is given up on. The run SHALL never mark a plan item itself.

**Why, and what it costs.** OQ-225, from finding P1 of the final default live run at `a68f121`: a coordinator answered its
request in full while its plan's "report" item still read `PENDING`. With REQ-ORCH-078's default of 0 the hold sent the item
past the one agent that held the evidence to a fresh root that REQ-ORCH-072, REQ-ORCH-075 and REQ-TOOLS-155 keep blind;
it redid the whole task, told the person the report was never delivered, and could have ended a met request `failed` at
REQ-ORCH-077's limit. The correction was already built and pinned for a positive setting; a floor of one at the correction
site is the smallest change that lets a met request close `succeeded`, and keeping it off the shared setting's default
leaves validation retries as they were. What it costs: one more model call, carrying the root's whole conversation, on every
iteration whose root answers with an item open, which REQ-ORCH-029's todo clause under OQ-213 now makes common; a reply that
may restate the whole answer; a weak model that may tick an item it did not do to satisfy the correction (the same exposure
the marker already had); a setting of 0 no longer turns the correction off; and up to 6,000 more characters in a re-queued
root's first message, carrying a wrong answer as it stands.

> **Narrows:** REQ-ORCH-078
> **Extends:** REQ-ORCH-075

*Raised under the owner's delegation, 2026-10-07, ruling OQ-225 (the consortium's ruling P1 of the final default live run);
logged as [R-072](requests.md#r-072).*

> **First execution, 2026-10-07, built under [R-072](requests.md#r-072) (fin31):** the directive was built as written, at the
> correction site the G5 repair had already pinned for a positive setting. **(1) The count** is `max(1,
> RunConfig.validationRetries)` in `Run.turn`'s correction closure (`packages/engine/src/run/run.ts`); `ladder.ts` and
> `RUN_CONFIG_DEFAULTS` are untouched, so validation-class model failures still retry 0 times by default. **(2) The answer**
> is the closure's `answer`: the first non-empty text a turn of the execution wrote, replaced only by a longer one, so a
> correction answered "Recorded." (or a `todo` write and no text) keeps the answer the person saw as the iteration's report,
> summary and held answer. The ruling's text said both "the last non-empty text" and "replaces it only when it is longer";
> the build reads the second, which is what its own step 5 tests ("Recorded." keeps the answer). **(3) PD-ORCH-009 revision
> 2** is the re-prompt's condition `answer === ''`. **(4) The fallback**: `Task.heldAnswer` (`todo.ts`), cut to
> `HELD_ANSWER_LIMIT` (6,000), stored beside `planLeftOpen` and deleted wherever it is; `planCarryText(open, heldAnswer)`
> labels it; `planHeldRowText` writes the `system` row for a re-queue and for a give-up. **Found:** nothing against the text.
> **What was measured.** `packages/engine/src/run/coordinator-plan.test.ts`'s block "a root that answers with its plan open is
> corrected in its own conversation; a held answer is carried and announced", eight cases, seven red on `a68f121` (the eighth,
> a setting of 2 sending two corrections, guards the count): the default-configuration case closes `['succeeded']` in four
> model requests with no `ANSWER_REPROMPT` and no `incomplete_execution` issue; a correction answered "Recorded." keeps the
> answer as the summary; a root asked once more and still silent is corrected without "has been shown"; an ignored
> correction gives `partial, succeeded`, one `system` row and a fresh root handed the held answer; the answer survives a later
> run and reaches no other task; it is cut at 6,000; a root that never finishes is corrected once per iteration, given up on,
> and the give-up announced. The existing G5 cases were re-scripted with a root that ignores its correction, and still pin
> the re-queue. `run-pure.test.ts` pins the three texts. In the built app, `pnpm part-h-proof`'s new `plan-correction` launch
> (scripted `planopen,report,plandone`, no `delegation_strategy`) closed one iteration `succeeded`, `completed` /
> `tasks_complete`, with the warning "a correction is sent into its conversation (1 of 1, REQ-ORCH-078, PD-ORCH-015)" in its
> log and no held-answer row; with the floor removed it read `partial`, `succeeded` (load average 12–17 on 4 CPUs, beside
> sibling plans). **What was not measured.** The live terminal scenario: the next default live run (the orchestrator's) should
> show iteration 1 closing `succeeded` after at most one correction step (one `todo` write, about 5–15 s), one "a correction
> is sent" warning, no second iteration, no re-delegation and no `background_output` refusal, and the session ending
> `completed` / `tasks_complete` inside the 420 s wait. The row is in
> [`../architecture/first-executions.md`](../architecture/first-executions.md).

> **Reported back 2026-10-13 (fin41), from the live packs at `552d346` (default and duress) and `0bc3eee`**: **NOT REACHED** in any
> of the three. Every root closed its own plan before it answered: 0 of 174, 199 and 215 requests carry "of your plan not
> complete" or "previous iteration on this task", and every iteration closed `succeeded` on the first try. At `552d346`
> terminal's coordinator closed both items itself (`#20`, `#21`) before answering, so no correction was owed; at `0bc3eee` it
> ran the shapes itself. Found nothing, because nothing met the case. Evidence:
> [`live-552d346-default-autopsy.md`](../architecture/live-runs/live-552d346-default-autopsy.md),
> [`live-552d346-duress-autopsy.md`](../architecture/live-runs/live-552d346-duress-autopsy.md),
> [`live-0bc3eee-default-autopsy.md`](../architecture/live-runs/live-0bc3eee-default-autopsy.md).
> The rows are in [`../architecture/first-executions.md`](../architecture/first-executions.md).

> *fin42, the same day:* the terminal outcome the measure above names held at `552d346` — one iteration, `completed` /
> `tasks_complete` inside the wait — by the model's own behaviour, not through the correction, so the live measure stays owed
> and a default run cannot be relied on to owe it; fin42 adds the opt-in `plan-open` scenario, which asks for it.

> **The held answer in the built app, and the live scenario written, 2026-10-13 (fin42, the survey's N56).** `pnpm
> part-h-proof`'s new `plan-held` launch (scripted provider, free) drives the path the `plan-correction` launch above does not:
> a coordinating root that answers with its report item `PENDING` and answers its one correction with text again
> (`planopen,report,report,plandone,report`). The iterations read `partial` then `succeeded`; one correction warning; one `system`
> row, "Iteration 1: the coordinator answered with 1 item of its plan not done: Report the scripted work. The task was not marked
> complete and was returned to the queue."; and iteration 2's fresh root, read from its stored conversation (`agent_messages`),
> was handed the marker and "Your previous iteration answered as follows, and the person was shown it:" with iteration 1's answer
> in its first message; it recorded the item and the session ended `completed` / `tasks_complete` (the whole proof 2 min 39 s at
> a load of 6 to 7 on four CPUs beside the sibling plan). **Found nothing against the text.** The live half is written, not run:
> the opt-in `plan-open` scenario (`live-run.mjs --only=plan-open`, `lib/plan-open-reading.mjs`) asks a real model for a
> three-item plan answered with the third item `PENDING`. Its `plan-open` launch should show one "a correction is sent" warning,
> the correction in the root's own conversation saying the answer was shown, no answer re-prompt, no held row, one iteration
> `succeeded` and `completed` / `tasks_complete`; its `plan-held` launch, told to answer a correction with one word, should show
> the held row, the next root's first request carrying the marker and an answer of the session, and its outcome. A model that
> closes its plan before answering makes either launch a NOTE, "not reached". The run is the orchestrator's. The row is in
> [`../architecture/first-executions.md`](../architecture/first-executions.md).

---

<a id="pd-tools-013"></a>

### PD-TOOLS-013 — a call its run cancels reads `interrupted`

*Revision 2 (2026-10-13, [R-072](requests.md#r-072)) — **every call its run cancels**, the ruling of
[OQ-238](../architecture/open-questions.md#oq-238) (GC1) under the owner's delegation: the title and the scope widen from the
terminal to every tool call the run's signal cuts off, in the section **A call its run cancels, of any tool** after the
terminal's; REQ-TOOLS-092, REQ-SANDBOX-025 and REQ-SESSION-139 join the Narrows line. The terminal's clause stands as written.*

> *Revision 1's title said, and no longer governs:* "a terminal call its run cancels reads `interrupted`" — the scope it
> named was the foreground `terminal` call alone.

A foreground `terminal` call that its run cancels SHALL be recorded as interrupted: `failure_kind` and `outcome_kind`
`interrupted`, `outcome_severity` `warning`, `is_error` true, no exit code, and `timeout` false. Its run cancels it when
the tool context's signal is aborted before the command completes: a pause past REQ-ORCH-134's tool deadline, a stop, a
quit, the explicit cancel, an agent's cancellation or its limit, and a cancel that lands during OQ-144's first-call
handshake. The call ends the command's process tree and restarts the session, as built, and re-applies PD-TOOLS-001's
snapshot. `kill_status` is `session_reset` or `reset_failed`. Its detail SHALL say that the run cancelled the call before
the command completed, or before the command was written so that it never ran, what became of the session, that shell
state was lost, and what was restored; it SHALL NOT say that the command exceeded its timeout. Its output is labelled
`[terminal_output]`.

- **REQ-TOOLS-100:** the `failure_kind` vocabulary holds a fifth member, `interrupted`.
- **REQ-TOOLS-112:** the `outcome_kind` vocabulary holds an eleventh member, `interrupted`, and test 1 maps the failure kind
  `interrupted` to `interrupted` / `warning`.
- **REQ-SESSION-136:** a tool call recorded as interrupted under PD-ORCH-005 clause 3 files no outcome-driven issue. That
  covers the terminal's call under this directive, and the question tool's, the delegation tool's and a withdrawn approval's
  as the gate already records them.

The hard-timeout reading (exit code 124, `timeout`, `terminal_timeout`) stays reserved for a call that reached its hard
bound, as REQ-TOOLS-097, REQ-TOOLS-099 and REQ-TOOLS-179 state; those three, and REQ-TOOLS-103, are untouched.

**A call its run cancels, of any tool — revision 2.** Every tool call that its run's signal cuts off before it completes
SHALL be recorded with failure kind `interrupted`, SHALL file no outcome-driven issue, and SHALL be answered to its agent as
interrupted, as the turn already answers it:

- **(a) — revision 2.** A call whose executor throws while the call's signal is aborted SHALL be recorded with failure kind
  `interrupted` and the text "The '<tool>' call was cancelled by the run before it completed."
- **(b) — revision 2.** A fetch the run's signal ends SHALL be recorded with `failure_kind` `interrupted`, `error_class`
  `InterruptedError` and the detail "The fetch of <url> was cancelled by the run before it completed." This kind sits outside
  REQ-TOOLS-092's three groups (policy refusal, transient fault, call fault): it is the run's rest. `timeout` still wins when
  the deadline expired first, and the fetch's eight other kinds are unchanged.
- **(c) — revision 2.** An MCP call the run's signal ends SHALL be recorded with failure kind `interrupted` and a text naming
  the tool and the server and saying that the run cancelled the call before it completed and that it was not retried. The
  allowance-timeout reading is tested first and still reads `timeout`, filing `terminal_timeout`; a server fault with no
  cancel still reads `execution_error` and files `tool_error`.
- **(d) — revision 2.** None of these files an outcome-driven issue. No `outcome_kind` is added to them, so OQ-208's ruling
  stands. REQ-SESSION-139's histogram derives the bucket `interrupted` for a record that carries no `outcome_kind` and whose
  failure kind is `interrupted`; that also reaches a released delegation wait.

- **REQ-TOOLS-092 and REQ-SANDBOX-025 — revision 2:** the fetch vocabulary holds a ninth member, `interrupted`, and
  REQ-SANDBOX-025's "mints no further kind" holds except for it.
- **REQ-SESSION-139 — revision 2:** the derived buckets are rejected, tool-error, success, unknown and `interrupted`.
- **REQ-SESSION-136 — revision 2:** the exemption above reaches every call recorded under (a) to (c).

**Why revision 2, and what it costs.** Revision 1 repaired the terminal's cancel and left three siblings saying otherwise:
the gate's catch recorded an executor's throw on the cancel as `cancelled`, a kind no vocabulary holds; fetch recorded it as
`network_error`, the kind of a real transport fault; and the MCP catch recorded it as `execution_error`, though the SDK call
receives the run's signal. Each filed a `tool_error` warning that `summary.md`'s Tool errors line counts, for every quit,
stop or pause past the tool deadline that cut such a call, while the turn already answered the call as interrupted. One
word for one fact, and the gate's existing branch, cost: a ninth fetch kind that a reader of exported fetch records meets
for the first time, a fifth histogram bucket beside REQ-SESSION-139's four, and the cause of the cancel read from the turn,
not from the call.

**Why, and what it costs.** The build reported every cancel as a hard timeout: exit 124, "The command exceeded its timeout
of 100 seconds", `TimeoutError`, a `terminal_timeout` issue at `error`, and a Timeouts count in `summary.md`. In the final
default live run at `a68f121` (session `5df89df3`, call `#36`) a quit cut a 45 s wedge after 3,505 ms, and the record
claimed the 100 s bound had been hit; on Continue the agent would have read the same. REQ-TOOLS-103's `execution_error`
would have told the truth about the cause but read a deliberate cancel as a backend fault at severity `error` and filed a
`tool_error` warning for every quit. The product already has the word: the question tool, the delegation tool and a
withdrawn approval carry `interrupted`, and the gate settles that kind as interrupted with no issue. What it costs: two
closed vocabularies that REQ-TOOLS-100 calls exact gain a member, so a reader of exported records that assumed the closed
sets meets a new token; severity `warning` with `is_error` true is the one terminal kind whose `is_error` is not derived
from its severity; and the terminal's own text cannot tell a quit from a stop or a child's limit, so the cause comes from the
turn's interrupted result, and a child's limit that cut a call is recorded at the child, not at the call.

> **Narrows:** REQ-TOOLS-100, REQ-TOOLS-112, REQ-SESSION-136, REQ-TOOLS-092, REQ-SANDBOX-025, REQ-SESSION-139

*Revision 2's disposition (2026-10-13): REQ-TOOLS-092, REQ-SANDBOX-025 and REQ-SESSION-139 join the Narrows line. The ruling
(GC1) named REQ-SESSION-139, and kept REQ-TOOLS-112 and REQ-SESSION-136, as extended; OQ-237 (GV1), ruled and built the same
day, reads a change to an exact enumeration as a narrowing, and REQ-SESSION-139's derivation "into rejected, tool-error,
success or unknown" gains a fifth bucket, so all three are narrowed. No other directive holds a verb on REQ-TOOLS-092,
REQ-SANDBOX-025 or REQ-SESSION-139.*

*Corrected 2026-10-13 under [OQ-237](../architecture/open-questions.md) (GV1, [R-072](requests.md#r-072)): the three are
narrowed, as the ruling named them. This directive's case and `PD-TOOLS-009`'s on REQ-TOOLS-112 are disjoint (a cancel that
has no exit code; exit 1 from a diff or a search), and so are its case and `PD-SESSION-003`'s on REQ-SESSION-136 (which
issues are filed; how the error-path arguments are cut). The disposition read until then, and the reason it gave, no longer
govern:* "> **Extends:** REQ-TOOLS-112, REQ-SESSION-136" — *"The ruling named all three as narrowed. The symbol generator
admits one directive per verb on a requirement (`README.md`: "precedence must be unambiguous"), and `PD-TOOLS-009` already
narrows REQ-TOOLS-112 and `PD-SESSION-003` REQ-SESSION-136, so those two are named as extended, as OQ-218's build did for
PD-CONFIG-003; the case each one meets is stated above, exhaustively. Found while building, 2026-10-07."*

*Raised under the owner's delegation, 2026-10-07, ruling OQ-226 (the consortium's ruling of finding P2 of the final default
live run at `a68f121`); logged as [R-072](requests.md#r-072).*

> **First execution, 2026-10-07, built under [R-072](requests.md#r-072) (fin31):** the rule held as written, and the ruling's
> dispositions did not *(corrected 2026-10-13: they stand as the ruling named them, OQ-237)*: the generator admits one directive per verb on a requirement, so REQ-TOOLS-112 and REQ-SESSION-136,
> already narrowed by `PD-TOOLS-009` and `PD-SESSION-003`, are named as extended (above). `ForegroundSession.run`
> (`packages/agent-tools/src/terminal/foreground.ts`) returns `cancelled` with no exit code from both abort branches, and
> `terminal/index.ts` records the call `interrupted` / `warning`, `InterruptedError`, `is_error` true; the gate's existing
> `interrupted` branch files no issue, and `sessionMetrics` counts the call under `interrupted`, not Timeouts, with neither
> changed. **Found nothing else**: the turn already answered the call as interrupted (`callSignal.aborted`), so the cause
> sentence the agent reads on Continue was in place, and only the body under it was false. **What was measured.**
> `terminal.test.ts`'s handshake cancel case, its new mid-command cancel case (`sleep 5` cancelled at 300 ms: `interrupted`,
> the restore named, no timeout, the next call in the restored directory with the variable) and its classify case, each red
> on `fee3593`; `gate.test.ts` and `summary.test.ts` as guards; `pnpm driver-proof`'s launch 13d, a quit during `sleep 60`
> under a 100 s bound in the built app, red on `fee3593` (`timeout`, 124, "exceeded its timeout of 100 seconds",
> `terminal_timeout` at `error`) and green after (`interrupted`, no exit code, `kill_status` `session_reset`, no issue).
> **What was not measured.** No live run: the next default live run's quit is the measurement.
> *(2026-10-13, fin42, N51: no longer left to a quit that happens to land on a call. No live quit had cut one in the 552d346
> default and duress packs or at 0bc3eee, so the live run gained the `cut` scenario, which cuts a foreground `sleep 60` on
> purpose; see revision 2's built-app report below. Not yet run.)*
> The row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).

> **Revision 2's first execution, 2026-10-13, built under [R-072](requests.md#r-072) (fin34):** the revision held as
> written. **(a)** The gate's catch (`packages/agent-tools/src/gate.ts`) records a throw under an aborted signal as
> `interrupted`, "The '<tool>' call was cancelled by the run before it completed.", where it wrote `cancelled`; the gate's
> existing `interrupted` branch then marks the call interrupted and files no issue, unchanged. **(b)** Fetch's
> `transportFailure` (`packages/agent-tools/src/tools/fetch.ts`) returns `interrupted` / `InterruptedError` after its deadline
> test, and `FETCH_FAILURE_KINDS` holds the ninth kind. **(c)** The MCP executor's catch (`apps/desktop/src/run-host/mcp.ts`)
> tests the allowance first, then the abort. **(d)** `outcomeOf` (`packages/engine/src/export.ts`) derives a record with no
> `outcome_kind` and failure kind `interrupted` to `interrupted`. **Found nothing else**: the turn already answered each such
> call as interrupted, and no reader of the histogram assumed four buckets (`summary.md` prints the buckets it is given).
> **What was measured.** `gate.test.ts`'s revision 2 case, `fetch.test.ts`'s cancel case, `mcp.test.ts`'s cancel case and
> `summary.test.ts`'s `interrupted` bucket case, each red before the code and green after, beside guards that a throw with
> no cancel still reads `execution_error` / `tool_error`, a fetch deadline that expired first still reads `timeout`, and an
> exhausted MCP allowance still reads `timeout` / `terminal_timeout`; `pnpm fetch-proof`'s ninth launch, `cancelled`, a
> SIGTERM quit while the loopback server holds the request, red with (a) and (b) reverted (`failed / network_error`) and
> green after (`interrupted`, `InterruptedError`, 360 ms, the session `paused`, no issue for the call). **What was not
> measured.** No proof drives a cancelled MCP call or a throwing executor in the built app, and no live run: the first live
> quit that cuts a fetch or an MCP call is the measurement. The row is in
> [`../architecture/first-executions.md`](../architecture/first-executions.md).

> **Reported back 2026-10-13 (fin41), from the live packs at `552d346` (default and duress) and `0bc3eee`**: **NOT REACHED** in any
> of the three. No tool call was cut in flight at any quit; every run ended before its capture's quit, and 0 tool records read
> `interrupted`. The neighbour case held at `552d346`: the resume Pause left three calls of the step it ended unstarted
> (rows 12 to 14), each reading "This call was not run: it was interrupted by the pause before it started …" with no
> `tool_calls` record and no issue. Found nothing, because nothing met the case. Evidence:
> [`live-552d346-default-autopsy.md`](../architecture/live-runs/live-552d346-default-autopsy.md),
> [`live-552d346-duress-autopsy.md`](../architecture/live-runs/live-552d346-duress-autopsy.md),
> [`live-0bc3eee-default-autopsy.md`](../architecture/live-runs/live-0bc3eee-default-autopsy.md).
> The rows are in [`../architecture/first-executions.md`](../architecture/first-executions.md).

> **Revision 2 in the built app, and the live measurement written, 2026-10-13 (fin42, N51):** the revision held as written
> where fin34 had pinned it by unit cases alone. **What was measured.** `pnpm mcp-proof`'s launches 2c quit the application
> by SIGTERM while the fixture holds `slow` (60 s, under a 120 s allowance): `cancel` read the MCP executor's catch, failed /
> `interrupted`, "The call to 'slow' on MCP server 'alpha' was cancelled by the run before it completed; it was not retried."
> (562 ms), no issue, no `outcome_kind`, the session `paused`, and `summary.md`'s "Tool outcomes: success 0, tool_error 0,
> rejected 0, unknown 0, interrupted 1" with "Tool errors: 0"; `cancel-throw` read the gate's catch through the run host's
> new verification seam `ROTARIS_CAPTURE_THROW_ON_ABORT` (`apps/desktop/src/run-host/throw-on-abort.ts`, compiled out of a
> packaged build), "The 'slow' call was cancelled by the run before it completed." (493 ms), with the same issues and
> bucket. Each was red with its branch reverted: (c) without its abort test read `execution_error`, "failed: AbortError:
> This operation was aborted", and (a) with its pre-revision form read `cancelled`. Load average 5.7 to 7.1 on four CPUs,
> beside a sibling plan. **Found nothing else**: no executor the product ships throws on its abort (fetch, the MCP executor
> and the terminal each return their own `interrupted` observation), which is why (a) needed a seam to be reached at all.
> **What was not measured.** No live run: the live run's `cut` scenario (`apps/desktop/scripts/lib/cut-scenario.mjs`,
> default set) asks a real model for one foreground `echo started > CUT-STARTED.txt && sleep 60` under a 90 s timeout and
> quits by SIGTERM once the call's record is open and the file marked; it must read revision 1's terminal record
> (`interrupted`, no exit code, `"timeout":false`, a session reset, no `terminal_timeout` or `tool_error` issue) and
> `summary.md`'s `interrupted` bucket with Timeouts 0. It is written and unit-tested, and is the orchestrator's to run. A fetch
> or MCP call cut live stays unmeasured: the scenario cuts the terminal, the case the record has never seen live. The row is
> in [`../architecture/first-executions.md`](../architecture/first-executions.md).

---

<a id="pd-orch-016"></a>

### PD-ORCH-016 — a raw-count fallback reads four consecutive calls as evidence only when they are the same action

When the loop classifier fails, or is cut at its bound, on a raw-count trigger, four or more consecutive tool calls SHALL
count as evidence of a loop only when each is the same action as the others by REQ-ORCH-101's comparison: the same tool
name and identical whole arguments, with no part of the arguments disregarded. Assistant text between the calls does not
break the run. Calls of one tool with differing arguments are counts alone, whatever the tool's facet, and declare no loop.
Every other clause of REQ-ORCH-104 and REQ-NOTIFY-109 still governs: the message limb (the last three messages with text,
normalised-equal, per OQ-126), the repetition and cycle rule, the stuck rule and the deterministic message.

**Why, and what it costs.** Finding D6 of the final duress live run at `a68f121` (session `e6747bd0`): the limb's first live
firing was on four `read_file` calls (#229 to #232) over `test/extra.test.js` and `docs/decisions.md` by a child checking its
own document; timeline entry 43 told it to "Pause and reassess read_file around docs/decisions.md …", and it spent a 24.5 s
step answering. With a model that reasons before it answers, the classifier was cut in all 9 classifications across three
duress packs (`c2fdd6a` 4, `c2a9444` 2, `a68f121` 3), so the fallback decides every raw-count activation, and the
classifier's one late answer judged edits and verification reads to be no loop. [`PD-ORCH-001`](#pd-orch-001) is the
precedent: the owner narrowed supervision before where its unmarked "pause and reassess" fell on legitimate work. What it
costs: while the classifier is cut, a single-tool loop with varied arguments goes undeclared at a raw-count activation — it is
still ended by REQ-ORCH-102's escalation at the third consecutive activation, or bounded by the stall watch and the child's
ceiling; and the limb then adds evidence only where four identical calls follow a raw-count trigger already pending, or where
`repetition_threshold` is above 4. No tool family is exempted: the product has no read-only predicate for terminal or MCP
calls, and four different edits in a row are as ordinary as four reads.

> **Narrows:** REQ-ORCH-104, REQ-NOTIFY-109

*Cites without changing: REQ-ORCH-101 (the single sameness rule), REQ-NOTIFY-108, REQ-NOTIFY-102, REQ-NOTIFY-106,
REQ-CONFIG-467, OQ-114's kept 2.0 s bound and OQ-126's ruling on the message limb. It narrows REQ-ORCH-104's clause "≥ 4
consecutive same-tool calls" and REQ-NOTIFY-109's clause "back-to-back invocations of the same tool" alone.*

*Ruled under the owner's delegation, 2026-10-07; logged as [R-072](requests.md#r-072), the ruling of
[OQ-232](../architecture/open-questions.md) (finding D6). No earlier owner ruling is revised. Numbered PD-ORCH-016: fin31's
PD-ORCH-015 (P1) was assigned the number before it.*

> **First execution, 2026-10-07, built by fin32 (branch `fin32-child-reports-and-limits`):** the rule was built as written.
> `rawFallbackHasEvidence` (`packages/engine/src/run/supervisor.ts`) compares the last four tool events by `fingerprint` — the
> tool name and the whole arguments, the comparison REQ-ORCH-101's triggers already use — where it compared `event.name`;
> nothing else in the supervisor changed. **What was measured.** `supervisor.test.ts`'s REQ-ORCH-104 block: the D6 shape (two
> steps with text, each reading `test/extra.test.js` and `docs/decisions.md` with differing arguments, behind a pending
> raw-count trigger and a rejecting classifier) gives `continue`; four edits of one document with different arguments give
> `continue`; the case that pinned four greps with different arguments as evidence now gives `continue` — the three red on the
> code before — and four identical reads still give `inject`, naming "read_file around docs/decisions.md". In the built app,
> `pnpm part-h-proof`'s two new launches (`raw-count-varied`, `raw-count-same`: the tool threshold at 4, the repetition and
> cycle triggers out of reach, the classifier held past its 2.0 s bound, four `read_file` calls in one step) record no
> activation for four files and one `raw-count` activation naming `README.md` for one file read four times (green at a load
> of about 10 to 14 on four CPUs; on a build of the old comparison `raw-count-varied` was red, one activation "Pause and
> reassess read_file around docs/b.md"); a new scripted
> step, `reads4`, makes the four calls in one step, since every other scripted step speaks "Calling read_file." and would meet
> the message limb first. The text met the code in no other place. **What was not measured:** a live run since the change. The
> row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).

> **Reported back 2026-10-13 (fin41), from the live packs at `552d346` (default and duress) and `0bc3eee`**: **reached once, held, not
> discriminating.** The supervisor activated once in the three packs, at the duress orchestrator's 60th call (`#300`, `grep`,
> 09:06:51.839); the loop classifier was cut at 1,994 ms by the activation budget, the run went on 2.02 s after `#300` started
> (the loop-classification cap held), and the raw-count fallback found no evidence: the last four calls were three `read_file`
> calls on three windows and the `grep`, so `continue`, with no injection and no timeline entry. The rule's discriminating
> case was one call away: `#296` to `#299` were four `read_file` calls, which the name-only reading would have counted, but the
> trigger fell on the `grep`. No agent of either default pack came near 60 calls (25 and 37 at most). Evidence:
> [`live-552d346-duress-autopsy.md`](../architecture/live-runs/live-552d346-duress-autopsy.md),
> [`live-552d346-default-autopsy.md`](../architecture/live-runs/live-552d346-default-autopsy.md),
> [`live-0bc3eee-default-autopsy.md`](../architecture/live-runs/live-0bc3eee-default-autopsy.md).
> The rows are in [`../architecture/first-executions.md`](../architecture/first-executions.md).

---

<a id="pd-tools-014"></a>

### PD-TOOLS-014 — a `haet_edit` miss that matches but for whitespace names the level and quotes the file's lines

*Revision 2 (2026-10-13, [R-072](requests.md#r-072), ruling [OQ-252](../architecture/open-questions.md#oq-252)) — **a quote
whose text occurs more than once**: clause 5 and the "Several windows" paragraph each gain the flag, and revision 1's text is
quoted beneath each.*

*Revision 3 (2026-10-13, [R-072](requests.md#r-072), ruling [OQ-280](../architecture/open-questions.md#oq-280) with
[`PD-TOOLS-019`](#pd-tools-019)) — **the line endings at level 3**: the case's level-3 parenthetical names the carriage return
set aside, and clause 2 at level 3 adds one sentence when the line endings differ too; revision 2's text is quoted beside each
changed clause. [`PD-TOOLS-015`](#pd-tools-015) clause 4's refusal inherits the sentence through clause 2.*

*Revision 4 (2026-10-14, [R-072](requests.md#r-072), ruling [OQ-295](../architecture/open-questions.md#oq-295) with
[`PD-TOOLS-020`](#pd-tools-020)) — **blank lines at level 3**: the case's level-3 parenthetical names the lines with no visible
character, and clause 2's level-3 sentence names the lines that hold one when the window holds a blank line; revision 3's text
is quoted beneath each. `PD-TOOLS-015` clause 4's refusal inherits the wording through clause 2.*

**The case, stated exhaustively.** `haet_edit` or its alias `haet` is called with a `content_hash` equal to the SHA-256 of the
file's current bytes, `old_string` and `new_string` different, `replace_all` false; `old_string` matches nowhere at REQ-TOOLS-136
level 1; and it matches at level 2 (each line equal once trailing whitespace, a carriage return included, is ignored) or level 3
(each line equal once one uniform leading prefix is added or removed, a carriage return ending a line set aside
(`PD-TOOLS-019`), and a line with no visible character matching a line with none, whatever whitespace either holds
(`PD-TOOLS-020`)) *(— revision 4)*. Everything outside this case is REQ-TOOLS-189's, exactly as written.

> Revision 3 said, and no longer governs: "… or level 3 (each line equal once one uniform leading prefix is added or removed, a
> carriage return ending a line set aside (`PD-TOOLS-019`))" — under which a blank line took part in the shift, so a block with a
> blank interior line never reached level 3 and its miss was the plain one.

> Revision 2 said, and no longer governs: "… or level 3 (each line equal once one uniform leading prefix is added or removed)."
> — which, as built, compared the `\r` of a CRLF line, so an LF `old_string` one indent off never reached level 3 on a CRLF file.

**One window.** The edit SHALL NOT be applied, the file SHALL NOT be written, no undo entry SHALL be pushed, and the read
record SHALL NOT change; the call fails. Its reply SHALL open with the sentence `old_string was not found exactly in <path>.`
and then:

1. name the match level in the specification's words ("match level 2" or "match level 3") and the window's 1-based line range;
2. say in words what differs: at level 2, the lines whose trailing whitespace or carriage return differs; at level 3, the
   leading prefix the file's lines carry in addition to, or instead of, `old_string`'s, quoted as JSON with its length, and,
   when any window line and its `old_string` line differ by a trailing `\r`, the sentence `The line endings differ too: CRLF in
   the file and LF in old_string. The quoted text carries the file's line endings.` (or, the other way round, `LF in the file
   and CRLF in old_string`, read on the first such line) *(— revision 3)*; when the window holds a line with no visible
   character, the level-3 sentence reads `Every line of the file that holds a visible character carries the leading prefix …
   in addition to old_string's indentation.` (deeper) or `Every line of old_string that holds a visible character carries the
   leading prefix … that the file's lines do not.` (shallower), and is otherwise unchanged *(— revision 4)*;

   > Revision 3 said, and no longer governs, the level-3 sentence alone: "Every line of the file carries the leading prefix …"
   > (and "Every line of old_string carries …") — false of a blank line once `PD-TOOLS-020` leaves it out of the shift.

   > Revision 2 said, and no longer governs: "say in words what differs: at level 2, the lines whose trailing whitespace or
   > carriage return differs; at level 3, the leading prefix the file's lines carry in addition to, or instead of,
   > `old_string`'s, quoted as JSON with its length;" — silent on the line endings a level-3 window and `old_string` may differ
   > in once `PD-TOOLS-019` sets the `\r` aside.
3. state that the caller's content_hash is still current and that nothing was written;
4. ask that `new_string` carry the file's indentation and line endings;
5. quote the window's exact text — the file's lines over that range joined by `\n`, so that sent back as `old_string` with the
   same hash it matches at level 1 — as one JSON string, when that string is at most 30,000 characters. A longer window SHALL
   NOT be quoted, and the reply SHALL direct `haet_read` with that window's offset and limit instead. When the quoted text
   occurs more than once in the file at REQ-TOOLS-136 level 1, the reply SHALL say so among its facts, before the quote: it
   SHALL name the count and the line where each occurrence starts, listing at most 10 and then "and N more"; it SHALL NOT say
   the quote matches exactly when sent back alone; and it SHALL ask that a neighbouring line, unchanged, be added to both
   `old_string` and `new_string`, giving `haet_read`'s offset and limit for the window and one line on each side, clamped to the
   file. The over-30,000-character direction carries the same sentence. The quote SHALL NOT be widened *(— revision 2)*;

   > Revision 1 said, and no longer governs: "quote the window's exact text — the file's lines over that range joined by `\n`,
   > so that sent back as `old_string` with the same hash it matches at level 1 — as one JSON string, when that string is at
   > most 30,000 characters. A longer window SHALL NOT be quoted, and the reply SHALL direct `haet_read` with that window's
   > offset and limit instead;" — silent on whether that level-1 match is unique, so a quote whose text recurs inside a longer
   > line was promised to match exactly and the retry was refused "Found 2 occurrences".
6. end with: if these are not the lines meant, read the file again with `haet_read`.

The facts SHALL come before the quote, so that REQ-SESSION-136's 2,000-character error record keeps them.

**Several windows.** When more than one window matches at the deciding level, the reply SHALL open with the same sentence,
name the level and each window's starting line, quote nothing, and direct `haet_read` with an offset and limit. When any
window's text occurs more than once in the file at level 1, the reply SHALL add clause 5's sentence for those windows: the
count and the lines where each occurrence starts, at most 10, and a neighbouring line, unchanged, in both `old_string` and
`new_string`, with `haet_read`'s offset and limit for the window and one line on each side *(— revision 2)*.

> Revision 1 said, and no longer governs: "When more than one window matches at the deciding level, the reply SHALL open with
> the same sentence, name the level and each window's starting line, quote nothing, and direct `haet_read` with an offset and
> limit." — whose "send its exact text as old_string" fails the same way when the windows' text is identical.

**Unchanged.** A level-4 match and no match reply as REQ-TOOLS-189 fixes ("… Read it again with haet_read."); `replace_all`
true keeps its own miss; the stale-hash refusal keeps its words and its rule that it SHALL NOT quote the file's content; and
`haet_edit` still applies a level-1 match only. REQ-TOOLS-136's levels are unchanged, and `write_file` is untouched.

**Why, and what it costs.** The final duress live run at `a68f121` (finding D5; pack `2026-10-07T07-09-30-708Z`, session
`e6747bd0`) measured the miss as built: wave3 failed 6 of its 14 `haet_edit` calls with "not found exactly" and followed each
near miss with a `sed -n … | cat -A` probe (#293, #298, #305, #322), and wave3b did the same after #382 (#380, #385, #386) —
7 failed edits, about 14 extra steps and 63 s inside the two children the 1200 s ceiling cut off. Replayed through the build's
`matchEdit` over `docs/verification.md` rebuilt from the store (every `haet_edit`'s hash checked against the rebuilt bytes),
#292, #297, #304, #315, #321 and #382 each match one window at level 3; #290 only at level 4. The build had computed that fact
and discarded it, and a re-read shows the caller the same invisible whitespace it misjudged. The quote is safe because it is
sent only after the hash matched: it is text the caller's hash already names, and the stale-hash case, where the content has
moved, keeps its rule. A JSON string is chosen over REQ-TOOLS-134's `N: line` form because these misses are about characters
nobody can see — a trailing space, a tab, a `\r`. On a CRLF file a multi-line `old_string` written with LF matches only at
level 2, and the quote shows the `\r`. Applying at level 2 or 3 was rejected: `write_file`'s level-3 apply writes `new_string`
unshifted, so a caller wrong about the indentation in `old_string` would land a mis-indented block beside a success, and a
level-2 apply drops trailing spaces and `\r`. What it costs: each near miss is still one failed call and one `tool_error` issue
(REQ-SESSION-136); a second implementation built from the specification alone returns the plain miss; and a near-miss reply
carries up to the window's size.

> **Narrows:** REQ-TOOLS-189

*Raised under the owner's delegation, 2026-10-07, ruling live-run finding D5 (OQ-231); logged as [R-072](requests.md#r-072).*

> **First execution, 2026-10-07, built under [R-072](requests.md#r-072) (fin32):** the rule held as written. `matchEdit`
> (`packages/agent-tools/src/tools/files.ts`) returns an `EditMatch` whose level-3 result carries each window's `shifts`;
> `haetEditTool`'s miss branch answers a level-2 or level-3 match through `nearMissMessage` and keeps REQ-TOOLS-189's reply for
> a level-4 match or none; `haet_edit`'s description gains the sentence. **What was measured.** Five cases under "PD-TOOLS-014"
> in `packages/agent-tools/src/tools/tools.test.ts`, each red on the code before (trailing spaces; a CRLF file with an LF
> `old_string`, the quote carrying `\r` and the retry leaving no LF-only line; two spaces more, one fewer and a tab; several
> windows; a window over 30,000 characters), and a sixth guarding the unchanged replies (level 4, no match, `replace_all`, the
> stale hash naming no hash and quoting nothing). The pack's own misses, replayed through the built tool over
> `docs/verification.md` rebuilt from the store: #290 still reads the plain miss (level 4); #292, #297, #304, #315, #321 and
> #382 each name their lines at match level 3 and "the leading prefix \" \" (1 character) that the file's lines do not", and
> each quote sent back with the same hash applied (6 of 6). **Found:** every one of the six carried the same extra space in
> `new_string`, so a retry with the quote and the model's own `new_string` would still write the block one space deep; the
> reply's "Give new_string the file's indentation" is the only guard, and `write_file`'s level-3 apply, which writes such a
> `new_string` unshifted beside a success, is raised as OQ-233. **What was not measured.** No live run: the next default and
> duress runs are the measurement, read by `live-run.mjs`'s NOTE (`lib/near-miss-edits.mjs`: near misses, terminal probes
> before the next edit, target 0, and retries that succeeded). No proof script drives `haet_edit` in the built app; the
> executor runs unchanged inside the run host. The row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).
>
> **Found by the bundle's review, 2026-10-07, before it landed:** the build first took every level-2 or level-3 result as a
> near miss, and `matchEdit` finds an empty or whitespace-only `old_string` at level 2 on any blank line; the reply then quoted
> `""` (or a blank line) and promised it would match exactly, which clause 5's quote never can, so the caller retried the same
> string forever. The miss branch now answers through `nearMissMessage` only when `old_string` holds a visible character, and an
> empty or whitespace-only `old_string` keeps REQ-TOOLS-189's plain reply; with a visible character every matching window holds
> it, so the quote is non-empty text of the file and clause 5 holds. Pinned by a seventh case under "PD-TOOLS-014", red on the
> code before ([`haet-edit-quotes-an-empty-window-for-a-blank-old-string`](../defects/fixed/haet-edit-quotes-an-empty-window-for-a-blank-old-string.md)).
>
> **Revision 2's first execution, 2026-10-13, built under [R-072](requests.md#r-072) (fin36):** the rule held as written.
> `nearMissMessage` (`packages/agent-tools/src/tools/files.ts`) counts each quoted window's occurrences with `levelOneLines`,
> the search `matchEdit`'s level 1 runs, and adds the flag only when the text occurs more than once; both voices (this
> directive's and `PD-TOOLS-015`'s) take it through the one function. **What was measured.** Four cases under "PD-TOOLS-014"
> and one under "PD-TOOLS-015" in `packages/agent-tools/src/tools/tools.test.ts`, each red on the code before: `x = 1` /
> `max = 1` with `old_string` `x = 1 ` (the flag before the quote, no "matches exactly", the bare retry refused "Found 2
> occurrences of old_str at lines 1, 2", the retry with line 2 in both strings applied); twelve occurrences listed as ten "and 2
> more"; a window over 30,000 characters that recurs; identical several windows flagged, distinct ones word for word; and
> `write_file`'s level-3 refusal in `read_file`'s voice, its retry the same. **Found:** the several-windows case pinned since
> revision 1 (`x \ny\nx \ny\n`, `old_string` `x\ny`) has two identical windows, so its reply now carries the flag — the
> ruling's reading that identical windows are the several-windows reply's common case, met by the very case that pinned it;
> its expectation was updated, and a distinct-windows case keeps revision 1's words. **What was not measured.** No live run: the
> next default and duress runs are the measurement, read by `live-run.mjs`'s NOTE (`lib/near-miss-edits.mjs` now counts
> retries refused "Found N occurrences", target 0). Repairs
> [`a-near-miss-quote-that-occurs-more-than-once-is-promised-to-match-exactly`](../defects/fixed/a-near-miss-quote-that-occurs-more-than-once-is-promised-to-match-exactly.md).
> The row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).

> **Reported back 2026-10-13 (fin41), from the live packs at `552d346` (default and duress) and `0bc3eee`**: **NOT REACHED** in any
> of the three. Every `haet_edit` and `write_file` edit applied first time or failed on a stale hash, never on a level-2 or level-3
> near miss (3 + 9 edits at `552d346`'s default pack, 13 + 5 in its duress pack, 21 at `0bc3eee`), and the harness NOTE read "no
> haet_edit miss matched at match level 2 or 3" each time. Found nothing, because nothing met the case. Evidence:
> [`live-552d346-default-autopsy.md`](../architecture/live-runs/live-552d346-default-autopsy.md),
> [`live-552d346-duress-autopsy.md`](../architecture/live-runs/live-552d346-duress-autopsy.md),
> [`live-0bc3eee-default-autopsy.md`](../architecture/live-runs/live-0bc3eee-default-autopsy.md).
> The rows are in [`../architecture/first-executions.md`](../architecture/first-executions.md).

> **In the built app, 2026-10-13 (fin42, N52):** `pnpm edits-proof` drove this directive through the run host on a CRLF, tab-indented fixture it generates (`apps/desktop/scripts/lib/crlf-fixture.mjs`), the scripted coordinator's calls sent by the new step `tool:<key>`; load average 6.8 to 12.2 on four CPUs beside a sibling plan. **Held as written.** `near`: a `haet_edit` whose two-line LF `old_string` met the CRLF file at match level 2 was refused, named "match level 2" and lines 2-3 before the quote, and quoted the window as `"\tconst greeting = 'Hello';\r\n\tif (name) {\r"`; `retry`, that quote sent back with the same hash, applied with `PD-TOOLS-017`'s sentence before ` content_hash:`; the file stayed CRLF throughout, and `lib/near-miss-edits.mjs`'s reading counted one level-2 miss, retried, not probed. **Found:** on a CRLF file an LF `old_string` one indent off never reaches level 3 (the `\r` takes part in level 3's comparison), so this directive's level-3 near miss is not given there: the plain miss is ([`on-a-crlf-file-an-lf-old-string-one-indent-off-skips-match-level-3`](../defects/fixed/on-a-crlf-file-an-lf-old-string-one-indent-off-skips-match-level-3.md), raised as [OQ-280](../architecture/open-questions.md#oq-280)). **What was not measured.** No live run. The live run's `crlf` scenario (`apps/desktop/scripts/lib/crlf-scenario.mjs`, default set) is written and unit-tested and is the orchestrator's to run; what it reads depends on the shapes the model chooses. The row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).

> **Revision 4's first execution, 2026-10-14 (fin44):** reported under [`PD-TOOLS-020`](#pd-tools-020), with which it was
> built and measured (`tools.test.ts`, "PD-TOOLS-020": the qualified sentence in `haet_edit`'s near miss and in `PD-TOOLS-015`
> clause 4's refusal, both red on `a3be56c`).

> **Since `PD-TOOLS-019` and revision 3, 2026-10-14 (fin43):** the "Found" above is repaired: level 3 sets a line's trailing `\r` aside, so an LF `old_string` one indent off on a CRLF file is this directive's level-3 near miss, and the reply names the line endings (clause 2, revision 3). `edits-proof`'s new `near-lf` step asserts it in the built app, with its quote retried by `retry-lf` and applied; the row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).

---

<a id="pd-tools-015"></a>

### PD-TOOLS-015 — a level-3 `write_file` edit carries the window's shift into `new_string` when `new_string` shares `old_string`'s indentation, and refuses when it cannot tell

**The case, stated exhaustively.** `write_file` is called with `operation: edit`, `replace_all` false, `old_string` and
`new_string` different, and `old_string` holding a visible (non-whitespace) character; `old_string` matches nowhere at
REQ-TOOLS-136 levels 1 and 2, and it matches exactly one window at level 3 with the leading prefix P (added to `old_string`'s
lines when the file's are deeper, removed from them when the file's are shallower). Let O be the leading whitespace of
`old_string`'s first line that holds a visible character, W the leading whitespace of the window's corresponding line, and N
the leading whitespace of `new_string`'s first line that holds a visible character. Level 3 requires O and W to differ, so the
clauses below are disjoint. Everything outside this case — several level-3 windows, levels 1, 2 and 4, `replace_all`, an
`old_string` with no visible character, and `haet_edit` and its alias `haet` ([`PD-TOOLS-014`](#pd-tools-014)) — is
REQ-TOOLS-135's and REQ-TOOLS-136's, exactly as written.

> Level 3's comparison is narrowed by [`PD-TOOLS-019`](#pd-tools-019) ([OQ-280](../architecture/open-questions.md#oq-280)).

> *Since [`PD-TOOLS-020`](#pd-tools-020) (2026-10-14, [OQ-295](../architecture/open-questions.md#oq-295)):* this case now reaches
> blocks holding blank lines — a line of `old_string` with no visible character matches a window line with none at any shift —
> and O and W above are where level 3 measures its prefix. The clauses are unchanged; what a blank line of `new_string` paired
> with a blank line of `old_string` writes is `PD-TOOLS-016` revision 4's.

1. **No visible character.** When `new_string` holds no visible character (a deletion), it SHALL be written as given and the
   reply SHALL be REQ-TOOLS-136's, unchanged.
2. **N equals O: the shift.** `new_string` SHALL take the window's shift. In the deeper direction P is prepended to every line
   of `new_string` that holds a visible character. In the shallower direction every such line must begin with P, and P is
   removed from each. Lines with no visible character are written as given. The success SHALL keep REQ-TOOLS-135's message and
   "Match level: 3." and add: `new_string was shifted by the same leading prefix <P as JSON> (<n> character(s) added|removed)
   to the file's indentation.`
3. **N equals W: as given.** `new_string` SHALL be written as given, and the success SHALL add after "Match level: 3.":
   `new_string already carries the file's indentation and was written as given.`
4. **Otherwise: refused.** In every other case — N equal to neither, or a shallower shift that a line of `new_string` holding a
   visible character cannot take because it does not begin with P — the edit SHALL NOT be applied, the file SHALL NOT be
   written, no undo entry SHALL be pushed, and the read record SHALL NOT change; the call fails. The reply SHALL open
   `old_string matches <path> only at match level 3 (indentation shift), and new_string's indentation matches neither
   old_string's nor the file's, so nothing was written.` — or, when a line lacks P, name that line of `new_string` and the
   prefix in place of the second clause — and then give `PD-TOOLS-014`'s clauses 1, 2, 5 and 6 with these differences: there
   is no hash, so its clause 3 is the opening's "nothing was written"; its clause 4 asks that both `old_string` and
   `new_string` carry the file's indentation; the quote, sent back as `old_string`, needs no hash; and every pointer names
   `read_file`. The window is quoted as one JSON string of at most 30,000 characters; a longer window is not quoted and the
   reply gives `read_file`'s offset and limit instead. The facts SHALL come before the quote, so that REQ-SESSION-136's
   2,000-character error record keeps them. Since `PD-TOOLS-014` revision 2 (2026-10-13, [OQ-252](../architecture/open-questions.md#oq-252)),
   this clause inherits revised clause 5's flag, in `write_file`'s voice (`read_file`, no hash): a quote whose text occurs more
   than once in the file at level 1 is preceded by the count and the lines, is not said to match exactly, and asks for a
   neighbouring line, unchanged, in both strings.

**Why, and what it costs.** REQ-TOOLS-136 says a level-3 window "still matches" and that "a window match replaces whole
lines", and is silent on whether the replacement takes the shift that let `old_string` match; the build wrote `new_string`
unshifted (OQ-233). The only measurement points one way: in OQ-231's replay of the final duress pack at `a68f121`, all six
level-3 misses (#292, #297, #304, #315, #321, #382) carried the same extra space in `new_string` as in `old_string`, so through
`write_file` each would have landed one space off beside a success — a Markdown list item or code block changed, a Python or
YAML meaning changed. Shifting unconditionally breaks the opposite case, a `new_string` already at the file's depth, which as
built writes correctly. The indentation of `new_string`'s first visible line separates the two readable cases, and the tool
already holds the prefix (`EditMatch.shifts`); where the line matches neither, the tool cannot tell what the caller meant, and
a refusal costs one call where a wrong success costs a corrupted file the user may never notice. What it costs: one failed call
and one REQ-SESSION-136 `tool_error` issue per ambiguous level-3 edit; `write_file` and `haet_edit` differ at level 3 (the one
refuses every level-3 match, the other applies two of its cases); an implementation built from the specification alone writes
unshifted; and a caller that deliberately indents a block by exactly P while sharing `old_string`'s wrong indentation is shifted
twice, which takes a coincidence.

> **Narrows:** REQ-TOOLS-136
> **Extends:** REQ-TOOLS-135

*Ruled under the owner's delegation, 2026-10-13 ([OQ-233](../architecture/open-questions.md#oq-233)); logged as [R-072](requests.md#r-072).
Narrows REQ-TOOLS-136 (a level-3 match the case names is refused rather than applied, and one is applied with a shifted
`new_string`); extends REQ-TOOLS-135 (one sentence added to the edit's success).*

> **First execution, 2026-10-13, built under [R-072](requests.md#r-072) (fin35):** the rule held as written. `shiftNewString`
> (`packages/agent-tools/src/tools/files.ts`) returns the replacement — `shifted`, `as-given`, `blank` — or `refuse` with the
> line of `new_string` lacking the prefix; `writeFileTool`'s edit branch calls it for one level-3 window of an `old_string`
> with a visible character, applies the result with the clause's sentence after "Match level: 3.", or refuses through
> `nearMissMessage`, which now takes the tool's wording (`NearMissVoice`: opening sentence, hash sentence or none, the request,
> `haet_read` or `read_file`) so that `haet_edit`'s replies stay byte-identical; `EditMatch.shifts`'s comment no longer says
> `write_file` ignores it, and `write_file`'s description gains one sentence. **What was measured.** Nine cases under
> "PD-TOOLS-015" in `packages/agent-tools/src/tools/tools.test.ts` and one added expectation on the existing "level 3" case,
> red on the code before with seven of the nine (one space too deep in both strings, shifted; a tab too shallow, shifted; blank and
> whitespace-only lines of `new_string` left as given in both directions; the pinned case's "already carries the file's
> indentation"; a third depth refused with the file's bytes and undo stack unchanged and the quote applying when sent back; a
> shallower shift a line cannot take, refused naming line 2; a window over 30,000 characters not quoted, `read_file`'s offset
> and limit given), and two guards green before and after (a deletion's reply unchanged; levels 2 and 4, two level-3 windows,
> `replace_all` and `haet_edit`'s level-3 near miss word for word). **The pack replayed.** `docs/verification.md` rebuilt from the
> `a68f121` duress pack's store (`write_file` #289's create, then every `haet_edit` and `replace_content` that succeeded, in
> order; the hash of every `haet_edit` checked against the rebuilt bytes: every applied one, and 7 of the 8 that failed, #326 stale in the run too), and the
> six level-3 misses sent through the built `write_file`: #292, #297, #304, #315, #321 and #382 each applied with `new_string
> was shifted by the same leading prefix " " (1 character removed)`, the replacement's first line at the window's own
> depth (6 of 6); #290 still applies at level 4. **What was not measured.** No live run: `haet_edit` is preferred, so the next
> default and duress runs may not send a `write_file` edit that matches only at level 3; no proof script drives `write_file`
> in the built app, and the executor runs unchanged inside the run host. **Found:** the level-2 apply beside it writes
> `new_string`'s LF lines into a CRLF file, which this directive does not decide (raised as
> [OQ-246](../architecture/open-questions.md#oq-246),
> [`a-write-file-edit-at-match-level-2-on-a-crlf-file-writes-lf-lines-among-crlf-ones`](../defects/fixed/a-write-file-edit-at-match-level-2-on-a-crlf-file-writes-lf-lines-among-crlf-ones.md)).
> The row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).

> **Reported back 2026-10-13 (fin41), from the live packs at `552d346` (default and duress) and `0bc3eee`**: **NOT REACHED** in any
> of the three. No `write_file` edit result said "shifted" or was refused; each `old_string` was among the lines the agent had read
> or written, so all matched at level 1 by that proxy. Found nothing, because nothing met the case. Evidence:
> [`live-552d346-default-autopsy.md`](../architecture/live-runs/live-552d346-default-autopsy.md),
> [`live-552d346-duress-autopsy.md`](../architecture/live-runs/live-552d346-duress-autopsy.md),
> [`live-0bc3eee-default-autopsy.md`](../architecture/live-runs/live-0bc3eee-default-autopsy.md).
> The rows are in [`../architecture/first-executions.md`](../architecture/first-executions.md).

> **In the built app, 2026-10-13 (fin42, N52):** `pnpm edits-proof` drove this directive through the run host on a CRLF, tab-indented fixture it generates (`apps/desktop/scripts/lib/crlf-fixture.mjs`), the scripted coordinator's calls sent by the new step `tool:<key>`; load average 6.8 to 12.2 on four CPUs beside a sibling plan. **Held as written, for the `old_string` that reaches level 3 on a CRLF file.** `shift`: an `old_string` one tab shallow that carries the file's `\r`s matched at level 3 and applied with "new_string was shifted by the same leading prefix \"\t\" (1 character added) to the file's indentation." and `PD-TOOLS-016`'s CRLF sentence, the block at the file's depth and every line CRLF. **Found:** the shape a model sends, an LF `old_string` one tab shallow (`shift-lf`, recorded and not asserted), does not reach level 3 on a CRLF file: it applied at "Match level: 4 (similarity: 0.91). Verify the result." and wrote the block one tab too shallow beside a success — the case this directive was ruled to prevent, one level down ([`on-a-crlf-file-an-lf-old-string-one-indent-off-skips-match-level-3`](../defects/fixed/on-a-crlf-file-an-lf-old-string-one-indent-off-skips-match-level-3.md), raised as [OQ-280](../architecture/open-questions.md#oq-280)). **What was not measured.** No live run. The live run's `crlf` scenario (`apps/desktop/scripts/lib/crlf-scenario.mjs`, default set) is written and unit-tested and is the orchestrator's to run; what it reads depends on the shapes the model chooses. The row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).

> **Since `PD-TOOLS-019`, 2026-10-14 (fin43):** the one-tab-shallow LF `old_string` on a CRLF file that `edits-proof`'s `shift-lf` step recorded at level 4 now matches at level 3, so clause 2 applies to it: `shift-lf` is asserted ("Match level: 3." with this directive's shift sentence, then `PD-TOOLS-016`'s CRLF sentence, the block at the file's depth), and clause 4's refusal carries `PD-TOOLS-014` revision 3's line-ending sentence through clause 2 (pinned in `tools.test.ts` under "PD-TOOLS-019"); the row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).

---

<a id="pd-tools-016"></a>

### PD-TOOLS-016 — a window-match `write_file` edit keeps the file's line endings and the bytes of the lines it leaves unchanged

*Revision 2 (2026-10-13, [R-072](requests.md#r-072), ruling [OQ-254](../architecture/open-questions.md#oq-254)) — **level 1 and
`replace_all` are [`PD-TOOLS-017`](#pd-tools-017)'s**: the case's "Everything outside this case" names it, and the cost sentence
no longer says an exact `old_string` converts endings; revision 1's text is quoted beneath each.*

*Revision 3 (2026-10-13, [R-072](requests.md#r-072), ruling [OQ-260](../architecture/open-questions.md#oq-260)) — **a window
edit whose carried result equals the file is refused**: clause 4 is added, and the cost sentence says so; revision 2's cost
text is quoted beneath it. The case is unchanged: it already held the edit clause 4 refuses.*

*Revision 4 (2026-10-14, [R-072](requests.md#r-072), ruling [OQ-295](../architecture/open-questions.md#oq-295) with
[`PD-TOOLS-020`](#pd-tools-020)) — **level 3's blank lines are the window's own**: clause 1's heading and scope read "at level 2,
and at level 3 for blank lines"; revision 3's clause 1 heading is quoted beneath it.*

**The case, stated exhaustively.** `write_file` is called with `operation: edit`, `replace_all` false, `old_string` and
`new_string` different, and `old_string` matches nowhere at REQ-TOOLS-136 level 1 and exactly one window at level 2, 3 or 4. At
level 3 this directive applies after [`PD-TOOLS-015`](#pd-tools-015) has decided the replacement, and its refusal is unchanged.
Everything outside this case — several windows, and `haet_edit` and its alias `haet` at levels 2 and 3
([`PD-TOOLS-014`](#pd-tools-014)) — is REQ-TOOLS-135's and REQ-TOOLS-136's, exactly as written; level 1 and `replace_all`, through
both tools, keep a CRLF file's line endings by [`PD-TOOLS-017`](#pd-tools-017), which reads clause 2's test; and REQ-TOOLS-136's
levels and their order are unchanged *(— revision 2)*.

> Level 3's comparison is narrowed by [`PD-TOOLS-019`](#pd-tools-019) ([OQ-280](../architecture/open-questions.md#oq-280)).

> Revision 1 said, and no longer governs: "Everything outside this case — level 1, `replace_all`, several windows, and
> `haet_edit` and its alias `haet` ([`PD-TOOLS-014`](#pd-tools-014)) — is REQ-TOOLS-135's and REQ-TOOLS-136's, exactly as
> written, and REQ-TOOLS-136's levels and their order are unchanged."

1. **Pairing, at level 2, and at level 3 for blank lines** *(— revision 4)*. The lines of `new_string` SHALL be paired with the
   lines of `old_string` by exact text equality: first the longest run of equal leading lines; then the longest run of equal trailing lines, which does not overlap
   the leading run; then a longest common subsequence of the lines between, chosen by this walk from the front — pair the two
   current lines when they are equal; otherwise skip the `old_string` line when that leaves the remaining common subsequence no
   shorter, and skip the `new_string` line otherwise. When the lines between are more than 4,000,000 line pairs (the product of
   their counts), only the two runs pair. Every paired line of `new_string` SHALL be written as the corresponding line of the
   window, verbatim, including its trailing whitespace and carriage return. At level 3 the pairing runs over `old_string` and
   `new_string` as the caller gave them, before `PD-TOOLS-015`'s shift, and only a pair whose `old_string` line holds no visible
   character is written as the window's line; every other line of the replacement is `PD-TOOLS-015`'s *(— revision 4)*.

   > Revision 3 said, and no longer governs, the heading alone: "**Pairing, at level 2 only.**" — under which a blank line that
   > `PD-TOOLS-020` matches without its whitespace would be written as `new_string` gave it, dropping a whitespace-only line's
   > bytes or a CRLF window's `\r` where clause 2 does not restore it.
2. **Line endings, at levels 2, 3 and 4.** The window is CRLF when at least one of its lines is followed by a line break in the
   file and every such line ends in `\r`; a window with no such line is CRLF when the file's lines outside it pass the same
   test. On a CRLF window, every line of the replacement that a line break follows in the result SHALL gain `\r` when it lacks
   one; a `\r` is never doubled, and the replacement's last line is followed by a line break exactly when the window's last line
   was. Any other window's unpaired lines are written as given.
3. **Success.** When clause 2 added at least one `\r`, the success SHALL add the sentence `new_string was written with the
   file's CRLF line endings.` after "Match level: N." — after `PD-TOOLS-015`'s sentence at level 3, and after "Verify the
   result." at level 4. Every other success is unchanged.
4. **No-op, at levels 2, 3 and 4** *(— revision 3)*. When the single window's result, after `PD-TOOLS-015` and clauses 1 and
   2, equals the file's bytes, the call SHALL fail before writing: no undo entry is pushed and the read record does not change.
   The reply SHALL be: `old_string matches <p> only at match level <N> (lines <a>-<b>), and those lines already hold new_string
   as this edit would write it; nothing to change. Use write_file's 'overwrite' to write a file exactly as given.` — for a
   one-line window `(line <a>)`. The lines are the window's, numbered from 1 and cut at the file's last line.

**Why, and what it costs.** REQ-TOOLS-136 says "a window match replaces whole lines" and is silent on what the replacement lines
carry. On a CRLF file a multi-line `old_string` written with `\n` alone matches only at level 2, since stripping trailing
whitespace strips the `\r`, and the build wrote `new_string`'s LF lines over the window: probed at `d1f081c`, `one\r\ntwo\r\nthree\r\n`
edited `one\ntwo` → `ONE\ntwo` left `ONE\ntwo\nthree\r\n` beside "2 lines replaced by 2 at line 1 (+2 -2)", the unchanged `two`
counted as changed because it lost its `\r`, and a replaced line's trailing spaces that `new_string` does not repeat (a Markdown
hard break) were dropped. Windows is the only platform shipped (`PD-STARTUP-001`), where CRLF files are ordinary, so this is the
common multi-line edit. Line endings belong to the file and say nothing of the caller's intent, and a line the caller repeats
from `old_string` unchanged was not meant to change, so the tool already knows what to write; there is nothing ambiguous to
refuse, and a level-2 refusal would fix nothing (its retry matches at level 1 and writes `new_string`'s LF lines verbatim).
Levels 3 and 4 share the apply: an LF `old_string` with a typo on a CRLF file matches at level 4 and wrote the same mixed
endings. The walk is the one the diff row's line LCS already takes, written out so a second implementation can reproduce it.
Clause 4 *(— revision 3)*: carried this way, a window edit can land on the window's own bytes, and the build rewrote the
file unchanged beside a success — probed by fin38, `one\r\ntwo\r\nthree\r\n` edited `one \ntwo` → `one\ntwo` answered "2 lines
replaced by 2 at line 1 (+0 -0). Match level: 2. new_string was written with the file's CRLF line endings.", false three times
over, with an undo entry that restored the same content and pushed a real one out of REQ-TOOLS-132's ten; an LF file does the
same at level 2 (`foo ` → `foo` on `foo`), and a level-4 retry of an edit that already landed does it on any file. Every other
edit path refuses its no-op (REQ-TOOLS-135's identical strings, `haet_edit`, `PD-TOOLS-017` clause 3), and clause 4's reply
differs from `PD-TOOLS-017`'s because at levels 2 to 4 the difference may be whitespace, indentation or a fuzzy near miss
rather than line endings. What it costs: a window edit can no longer convert CRLF lines to LF, nor strip an unchanged line's
trailing whitespace, and a window edit that would leave the file's bytes unchanged is refused rather than applied *(— revision
3)* —
`overwrite` still does either, and an exact level-1 `old_string` still strips an unchanged line's trailing whitespace other
than its `\r` ([`PD-TOOLS-017`](#pd-tools-017)) *(— revision 2)*; where `old_string` repeats a line, the walk fixes which copy's
bytes a paired line takes; `write_file` and `haet_edit` still differ at level 2 (one applies, the other refuses with the
quote); and an implementation built from the specification alone writes `new_string` as given.

> Revision 1 said, and no longer governs: "`overwrite` or an exact level-1 `old_string` still does either" — false once
> `PD-TOOLS-017` keeps a CRLF file's line endings at level 1 too.

> Revision 2 said, and no longer governs: "What it costs: a window edit can no longer convert CRLF lines to LF, nor strip an
> unchanged line's trailing whitespace —" — it applied an edit that changed nothing as a success.

> **Extends:** REQ-TOOLS-136, REQ-TOOLS-135

*Ruled under the owner's delegation, 2026-10-13 ([OQ-246](../architecture/open-questions.md#oq-246)); logged as [R-072](requests.md#r-072).
Extends REQ-TOOLS-136 (fills its silence on what a window match's replacement lines carry) and REQ-TOOLS-135 (one sentence
added to the edit's success).*

> **First execution, 2026-10-13, built under [R-072](requests.md#r-072) (fin36):** the rule held as written. `carryWindow`
> (`packages/agent-tools/src/tools/files.ts`) returns the replacement and whether it added a `\r`; `writeFileTool`'s edit branch
> calls it for every single-window match above level 1, after `shiftNewString` at level 3, and appends clause 3's sentence;
> clause 1's pairing is `linePairs` in `diff.ts`, which shares the head-and-tail trim and the table walk (`commonEnds`,
> `tableWalk`) with `lcsChanges`, so the pairing and the diff row's count come from one walk and the row's drawing is unchanged;
> `write_file`'s description gains one sentence. **What was measured.** Twelve cases under "PD-TOOLS-016" in
> `packages/agent-tools/src/tools/tools.test.ts`, ten red on the code before (the probe, now `ONE\r\ntwo\r\nthree\r\n` with
> "(+1 -1)" and the sentence; an added line; an interior hard break between two changed lines; a changed line's own trailing
> spaces; a window ending at the unterminated last line; a one-line window read from the file, and an LF file beside it; a level-4
> LF `old_string`; a level-3 shift; the walk's choice between repeated lines; and the guard, red on the description sentence
> alone), two guards green before and after (a `new_string` already in CRLF, no doubled `\r`, no sentence; a mixed window), and
> four `linePairs` cases in `diff.test.ts`, one checking that every unpaired line is one the diff row counts. Every earlier
> `write_file`, `haet_edit` and diff case is unchanged. **Found:** the walk's tie rule chooses a later copy of a repeated
> line (`p q q r` → `P q R` pairs the second `q`), as the directive states; and level 1 is not covered: an exact match writes
> `new_string`'s LF lines into a CRLF file through both tools and `replace_all`, recorded as
> [`a-level-1-edit-writes-new-strings-lf-lines-into-a-crlf-file`](../defects/fixed/a-level-1-edit-writes-new-strings-lf-lines-into-a-crlf-file.md)
> and raised as [OQ-254](../architecture/open-questions.md#oq-254) for a ruling. **What was not measured.** No live run: the live-run fixtures are LF files on Linux, and none of the six
> autopsies records a level-2 `write_file` edit; no proof script drives `write_file` in the built app, and the executor runs
> unchanged inside the run host. Repairs
> [`a-write-file-edit-at-match-level-2-on-a-crlf-file-writes-lf-lines-among-crlf-ones`](../defects/fixed/a-write-file-edit-at-match-level-2-on-a-crlf-file-writes-lf-lines-among-crlf-ones.md).
> The row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).

> **Revision 3's first execution, 2026-10-13, built under [R-072](requests.md#r-072) (fin39):** clause 4 held as written.
> `writeFileTool`'s edit branch compares the window path's result with the file right after `applyWindow` and before the undo
> entry, the read record and the write, and refuses a result equal to the file through `windowNoOpMessage`
> (`packages/agent-tools/src/tools/files.ts`); the level-1 and `replace_all` paths and `haetEditTool` are unchanged, and the
> description lists no edit outcome, so it is unchanged for this clause. **What was measured.** Four cases under "PD-TOOLS-016
> revision 3" in `packages/agent-tools/src/tools/tools.test.ts`, each red on the code before and each asserting the exact reply, the
> file's bytes, the read record and `undo` answering "No edit history for <p>.": the probe (`one \ntwo` → `one\ntwo` on
> `one\r\ntwo\r\nthree\r\n`, level 2, "lines 1-2"); an LF file at level 2 (`foo ` → `foo` on `foo\n`, "line 1"); a level-3
> as-given `new_string` equal to the window (`a\nb` → `  a\n  b`); a level-4 retry of an edit already applied (an `old_string`
> with a typo, `new_string` the file's lines). One guard group is green before and after: a level-2 edit changing one byte applies
> with its success, and `PD-TOOLS-017`'s no-op keeps its text. **Found:** the clause's "lines <a>-<b>" needed a reading for a
> window that takes in the empty element after the file's final line break (`foo \n` → `foo\n` on `foo\n` matches a two-element
> window at level 2); the lines are cut at the file's last line, so it reads "line 1", stated in the clause and pinned by a case.
> *Corrected 2026-10-13 (fin40):* the build cut only the window's last line, so a window wholly in that empty element (`' '` →
> `''` on `foo\n`, level 2 at element 1) still named "(line 2)" for a one-line file (fin39's reviewer); `windowNoOpMessage` now
> cuts the first line too and it reads "line 1", pinned beside the case above
> ([`a-window-no-op-refusal-names-a-line-after-the-files-last-line`](../defects/fixed/a-window-no-op-refusal-names-a-line-after-the-files-last-line.md)).
> **What was not measured.** No live run: the live-run fixtures are LF files on Linux, and none of the six autopsies records a
> window edit that lands on the file's own bytes; no proof script drives `write_file` in the built app. Repairs
> [`a-window-edit-that-lands-on-the-files-own-bytes-is-applied-as-a-success`](../defects/fixed/a-window-edit-that-lands-on-the-files-own-bytes-is-applied-as-a-success.md).
> The row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).

> **Reported back 2026-10-13 (fin41), from the live packs at `552d346` (default and duress) and `0bc3eee`**: **NOT REACHED** in any
> of the three. The fixtures are LF files on Linux and no edit needed a window match.
> Found nothing, because nothing met the case. Evidence:
> [`live-552d346-default-autopsy.md`](../architecture/live-runs/live-552d346-default-autopsy.md),
> [`live-552d346-duress-autopsy.md`](../architecture/live-runs/live-552d346-duress-autopsy.md),
> [`live-0bc3eee-default-autopsy.md`](../architecture/live-runs/live-0bc3eee-default-autopsy.md).
> The rows are in [`../architecture/first-executions.md`](../architecture/first-executions.md).

> **Revision 4's first execution, 2026-10-14 (fin44):** reported under [`PD-TOOLS-020`](#pd-tools-020), with which it was
> built and measured (`tools.test.ts`, "PD-TOOLS-020": a whitespace-only window line paired with blank `old_string` and
> `new_string` lines written byte for byte, red on `a3be56c`; `edits-proof`'s `blank-lf`, the CRLF blank line the file's own).

> **In the built app, 2026-10-13 (fin42, N52):** `pnpm edits-proof` drove this directive through the run host on a CRLF, tab-indented fixture it generates (`apps/desktop/scripts/lib/crlf-fixture.mjs`), the scripted coordinator's calls sent by the new step `tool:<key>`; load average 6.8 to 12.2 on four CPUs beside a sibling plan. **Held as written.** `window`: a two-line LF `old_string` matched the CRLF file at level 2 only and applied with "Match level: 2." and the CRLF sentence, the unchanged line written verbatim and the file CRLF throughout (clauses 1 to 3); `noop-window`: the same window with `new_string` already what the file holds was refused in clause 4's words, "old_string matches crlf/window.js only at match level 2 (lines 2-3), and those lines already hold new_string as this edit would write it; …" (revision 3), the bytes unchanged; `shift` carried the endings at level 3 after `PD-TOOLS-015`'s sentence. **What was not measured.** No live run. The live run's `crlf` scenario (`apps/desktop/scripts/lib/crlf-scenario.mjs`, default set) is written and unit-tested and is the orchestrator's to run; what it reads depends on the shapes the model chooses. The row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).

---

<a id="pd-tools-017"></a>

### PD-TOOLS-017 — an exact or replace-all edit keeps a CRLF file's line endings

**The case, stated exhaustively.** `write_file` is called with `operation: edit` and `old_string` matches at REQ-TOOLS-136
level 1, or `replace_all` is true; or `haet_edit` or its alias `haet` is called with a current `content_hash` and `old_string`
matches at level 1, or `replace_all` is true; in every case `old_string` is not empty and differs from `new_string`. Levels 2 to 4
stay [`PD-TOOLS-016`](#pd-tools-016)'s, [`PD-TOOLS-015`](#pd-tools-015)'s (level 3, `replace_all` false) and
[`PD-TOOLS-014`](#pd-tools-014)'s, so the cases are disjoint; matching itself is unchanged, and everything
outside this case is REQ-TOOLS-135's, REQ-TOOLS-136's and REQ-TOOLS-189's, exactly as written.

1. **The test, for each occurrence.** The touched lines run from the line holding the span's first character to the line
   holding its last (a line break belongs to the line it ends). The occurrence is CRLF by `PD-TOOLS-016` clause 2's test read on
   those lines: at least one of them is followed by a line break in the file, and every such line ends in `\r`. When no touched
   line is followed by a line break, the file's other lines are read the same way.
2. **The write.** For a CRLF occurrence, every `\n` that lies within the written replacement, and a `\n` that is the character
   directly after it in the result, SHALL gain a `\r` when the character before it in the result is not `\r`. A `\r` is never
   doubled, and no other byte changes. Every other occurrence is written as given.
3. **No-op.** When the result's bytes equal the file's, the call SHALL fail before writing: no undo entry is pushed and the read
   record does not change. The reply SHALL be: `old_string and new_string differ only in line endings, which an edit keeps as
   the file's; nothing to change. Use write_file's 'overwrite' to change a file's line endings.`
4. **Success.** When at least one `\r` was added, the success SHALL add the sentence `new_string was written with the file's
   CRLF line endings.` after REQ-TOOLS-135's message, and for `haet_edit` and `haet` before ` content_hash:`. The line counts
   describe the bytes written.

**Why, and what it costs.** REQ-TOOLS-136's level 1 is "exact" and its replace-all "replaces every exact occurrence as plain
text", and REQ-TOOLS-189's `haet_edit` matches "exact text"; the build wrote `new_string` as given, so on a CRLF file a one-line
anchor replaced by several lines written with `\n` alone left LF lines among CRLF ones beside a clean success: probed by fin36,
`one\r\ntwo\r\n` edited `one` → `ONE\nX` left `ONE\nX\r\ntwo\r\n`, through both tools and `replace_all`
([OQ-254](../architecture/open-questions.md#oq-254)). Windows is the only platform shipped (`PD-STARTUP-001`), where CRLF files are
ordinary, and this is the commonest small edit. `PD-TOOLS-016` already ruled that line endings belong to the file and say
nothing of the caller's intent; its own recovery path finished mixed too, since `PD-TOOLS-014`'s quote ends in the file's `\r`
(`one\r\ntwo\r`) and a retry with `ONE\ntwo` took that `\r` with it, which is why clause 2 reads the result and covers the
break after the span. Level-1 drift also defeated `PD-TOOLS-016` later, since a window holding an LF line fails its test. What it
costs: an edit can no longer write LF lines into a CRLF file (`write_file`'s `overwrite` still can; `haet_edit` has no
overwrite); an edit that differs only in line endings is refused rather than applied; a mixed file keeps the old behaviour; a
model that predicts its own bytes may meet one `PD-TOOLS-014` near miss over a span it wrote with LF; and an implementation built
from the specification alone writes `new_string` as given.

> **Narrows:** REQ-TOOLS-136, REQ-TOOLS-189
> **Extends:** REQ-TOOLS-135

*Ruled under the owner's delegation, 2026-10-13 ([OQ-254](../architecture/open-questions.md#oq-254)); logged as [R-072](requests.md#r-072).
Narrows REQ-TOOLS-136 (level 1's "exact" and replace-all's "as plain text" keep a CRLF occurrence's line endings) and
REQ-TOOLS-189 (`haet_edit`'s level-1 apply, whose matching stays exact); extends REQ-TOOLS-135 (one success sentence and one
refusal).*

> **First execution, 2026-10-13, built under [R-072](requests.md#r-072) (fin38):** the rule held as written. `carryExact`
> (`packages/agent-tools/src/tools/files.ts`) walks the occurrences of one exact `old_string` — the single level-1 match, or every
> `replace_all` occurrence — and builds the result as it goes, so clause 2's "the character before it in the result" is read on
> what is already written, the previous occurrence's replacement included; `crlfLines`, factored out of `carryWindow`, is the one
> test both directives read. `writeFileTool`'s edit branch and `haetEditTool` call it at level 1 and for `replace_all`, refuse
> through clause 3 before the undo entry and the write, append clause 4's sentence, and pass the written replacements to
> `replaceAllMessage`, which now splices them into each region; `applyMatch` lost its level-1 branch and became `applyWindow`.
> Both descriptions say "An edit keeps a CRLF file's line endings". **What was measured.** Nine cases under "PD-TOOLS-017" and
> the reversed pinned case under "PD-TOOLS-016" in `packages/agent-tools/src/tools/tools.test.ts`, nine red on the code before
> (the probe, `ONE\r\nX\r\ntwo\r\n` with "1 line replaced by 2 at line 1 (+2 -1)" and the sentence; `haet_edit` and `haet` at level
> 1, the sentence before ` content_hash:`; the `PD-TOOLS-014` retry `one\r\ntwo\r` → `ONE\ntwo`, giving `ONE\r\ntwo\r\nthree\r\n`;
> `\r\ntwo` → `\nTWO`; `replace_all` through both tools, counted "2 lines replaced by 4 (+4 -2)", and over a CRLF region and an
> LF region, carried in the CRLF region only; the no-op `a\r\nb` → `a\nb` refused through both tools and by `replace_all`, the
> file and the undo stack unchanged; a span in the unterminated last line read from the file's other lines; the descriptions),
> one group of guards green before and after (a `new_string` already in CRLF, no doubled `\r` and no sentence; an LF file; a
> mixed span; a one-line `new_string`). Every earlier `write_file`, `haet_edit`, `replace_all` and diff case is unchanged.
> **Found:** the probe the ruling asked for — a `PD-TOOLS-016` window edit can land on the file's own bytes beside a success:
> `one \ntwo` → `one\ntwo` on `one\r\ntwo\r\nthree\r\n` answers "(+0 -0). Match level: 2. new_string was written with the file's
> CRLF line endings." with the file unchanged and an undo entry pushed, recorded as
> [`a-window-edit-that-lands-on-the-files-own-bytes-is-applied-as-a-success`](../defects/fixed/a-window-edit-that-lands-on-the-files-own-bytes-is-applied-as-a-success.md)
> and raised as [OQ-260](../architecture/open-questions.md#oq-260); and `insert` writes LF lines into a CRLF file
> (`a\r\nb\r\n` with `X` at line 1 gives `a\r\nX\nb\r\n`), recorded as
> [`a-write-file-insert-writes-lf-lines-into-a-crlf-file`](../defects/fixed/a-write-file-insert-writes-lf-lines-into-a-crlf-file.md) and
> raised as [OQ-259](../architecture/open-questions.md#oq-259). A `replace_all` whose `old_string` is empty is outside the case
> and keeps its build. **Found in review (fin38):** `crlfLines` walked every line of the file for each question, and a `replace_all` asks once
> per occurrence, so carrying one grew with the square of the file's length — 2,852 ms for 50,000 CRLF lines with a token on each
> (load 1.8 on 4 CPUs), where the split and join it replaced was linear. It now reads only the lines it tests, and the unterminated
> last element's other lines once per call; the same file carries in 27 ms and 200,000 lines in 141 ms (load 0.8), and a case
> under "PD-TOOLS-017" counts the test's reads (at most 4 for two lines of 10,000; 10,004 before the repair).
> **What was not measured.** No live run: the live-run fixtures are LF files on Linux, and none of the six
> autopsies records an edit on a CRLF file; no proof script drives `write_file` or `haet_edit` in the built app, and the
> executors run unchanged inside the run host. Repairs
> [`a-level-1-edit-writes-new-strings-lf-lines-into-a-crlf-file`](../defects/fixed/a-level-1-edit-writes-new-strings-lf-lines-into-a-crlf-file.md).
> The row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).

> **In the built app, 2026-10-13 (fin42, N52):** `pnpm edits-proof` drove this directive through the run host on a CRLF, tab-indented fixture it generates (`apps/desktop/scripts/lib/crlf-fixture.mjs`), the scripted coordinator's calls sent by the new step `tool:<key>`; load average 6.8 to 12.2 on four CPUs beside a sibling plan. **Held as written.** `exact`: a one-line anchor replaced by two LF lines at level 1 landed CRLF with clause 4's sentence and no match level named; `replace-all`: `alpha` replaced by two LF lines at both occurrences landed CRLF with the sentence; `noop-endings`: an exact `old_string` with CRLF and `new_string` the same with LF was refused in clause 3's words; `retry` (`haet_edit`) placed the sentence before ` content_hash:` (clause 4). **What was not measured.** No live run. The live run's `crlf` scenario (`apps/desktop/scripts/lib/crlf-scenario.mjs`, default set) is written and unit-tested and is the orchestrator's to run; what it reads depends on the shapes the model chooses. The row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).

---

<a id="pd-tools-018"></a>

### PD-TOOLS-018 — a `write_file` insert keeps a CRLF file's line endings

**The case, stated exhaustively.** `write_file` is called with `operation: insert` on an existing, previously read file, with
`insert_line` in bounds and `content` not empty. Everything else is REQ-TOOLS-135's, [`PD-TOOLS-016`](#pd-tools-016)'s and
[`PD-TOOLS-017`](#pd-tools-017)'s, exactly as written; `create` and `overwrite` still write the caller's bytes.

1. **The test.** The insertion is CRLF by `PD-TOOLS-016` clause 2's test, read on the file's line before the insertion point and
   the line at it, where those exist: at least one of them is followed by a line break in the file, and every such line ends in
   `\r`. When neither is followed by a line break, the file's other lines are read the same way. An empty file is not CRLF.
2. **The write.** For a CRLF insertion, every line break the insert writes SHALL gain `\r` when the character before it in the
   result is not `\r`: the break after each inserted line that a break follows, and the break added after a previously
   unterminated last line. A `\r` is never doubled, no byte of the file's existing lines changes, and every other insertion is
   written as given.
3. **Success.** When at least one `\r` was added, the success SHALL add the sentence `content was written with the file's CRLF
   line endings.` after "Inserted N lines into <p> at line L.". The line counts are unchanged.

**Why, and what it costs.** REQ-TOOLS-135's `insert` names `insert_line` and its bounds and is silent on the line endings the
inserted lines carry. The build joined the file's lines and `content`'s with `\n`, so on a CRLF file the inserted lines were LF
among CRLF ones beside a clean success: probed by fin38, `a\r\nb\r\n` with `X` at line 1 left `a\r\nX\nb\r\n`
([OQ-259](../architecture/open-questions.md#oq-259)). Windows is the only platform shipped (`PD-STARTUP-001`), where CRLF files
are ordinary, and a model writing JSON tool arguments almost never sends `\r`. `PD-TOOLS-016` and `PD-TOOLS-017` ruled that line
endings belong to the file and say nothing of the caller's intent, and LF lines an insert leaves behind later fail their test, so
their guarantees decayed wherever an insert had been. It is a directive of its own rather than a revision of `PD-TOOLS-017`,
whose case is `operation: edit` and whose no-op and `content_hash:` clauses cannot apply to an insert. What it costs: an insert
can no longer write LF lines into a CRLF file (`overwrite` and `create` still write the caller's bytes); the test is local, so a
mixed neighbourhood is written as given and existing drift is not repaired; and an implementation built from the specification
alone writes `content` as given.

> **Extends:** REQ-TOOLS-135

*Ruled under the owner's delegation, 2026-10-13 ([OQ-259](../architecture/open-questions.md#oq-259)); logged as [R-072](requests.md#r-072).
Extends REQ-TOOLS-135 (fills its silence on the line endings an insert writes, and adds one success sentence). Names
`PD-TOOLS-016`, whose clause 2 test it reads, and `PD-TOOLS-017`, whose write rule and sentence it mirrors; neither is revised.*

> **First execution, 2026-10-13, built under [R-072](requests.md#r-072) (fin39):** the rule held as written. `carryInsert`
> (`packages/agent-tools/src/tools/files.ts`) places the inserted lines as the insert always did and, for non-empty `content`,
> reads `crlfLines` (the test `PD-TOOLS-016` and `PD-TOOLS-017` share) on `text.split('\n')` at the line before the insertion
> point and the line at it; on a CRLF insertion each inserted line a line break follows, and a previously unterminated last line
> the insert extends, gains `\r` when it lacks one. `writeFileTool`'s insert branch calls it and appends clause 3's sentence; its
> description says "An edit or an insert keeps a CRLF file's line endings" (`haet_edit`'s, which has no insert, is unchanged).
> **What was measured.** Seven cases under "PD-TOOLS-018" in `packages/agent-tools/src/tools/tools.test.ts`, red on the code
> before: the probe (`a\r\nb\r\n` + `X` at 1 → `a\r\nX\r\nb\r\n`, "Inserted 1 line into p.txt at line 1." and the sentence); a
> three-line insert; line 0; the end of a terminated CRLF file (`a\r\nb\r\nX\r\n`); the end of an unterminated one (`a\r\nb` +
> `X\n` → `a\r\nb\r\nX\r\n`, and + `c` → `a\r\nb\r\nc`); undo restoring the original bytes after a carried insert; the
> description. One guard group is green before and after: content already in CRLF (no doubled `\r`, no sentence), an LF file, an
> empty file, a mixed neighbourhood written as given; and the existing insert case is unchanged. **Found:** nothing beyond the
> ruling; the empty file, line 0 and both ends come out of `crlfLines`' fallback as the ruling read them. **What was not
> measured.** No live run: the live-run fixtures are LF files on Linux, and none of the six autopsies records an insert into a CRLF
> file; no proof script drives `write_file` in the built app, and the executor runs unchanged inside the run host. Repairs
> [`a-write-file-insert-writes-lf-lines-into-a-crlf-file`](../defects/fixed/a-write-file-insert-writes-lf-lines-into-a-crlf-file.md).
> The row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).

> **In the built app, 2026-10-13 (fin42, N52):** `pnpm edits-proof` drove this directive through the run host on a CRLF, tab-indented fixture it generates (`apps/desktop/scripts/lib/crlf-fixture.mjs`), the scripted coordinator's calls sent by the new step `tool:<key>`; load average 6.8 to 12.2 on four CPUs beside a sibling plan. **Held as written.** `insert`: two LF lines inserted at line 0 of a CRLF file landed CRLF with "Inserted 2 lines into crlf/exact.js at line 0." and clause 3's sentence. Red with clause 1's test forced false (the pre-directive insert): the two inserted lines LF-only and no sentence. **What was not measured.** No live run. The live run's `crlf` scenario (`apps/desktop/scripts/lib/crlf-scenario.mjs`, default set) is written and unit-tested and is the orchestrator's to run; what it reads depends on the shapes the model chooses. The row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).


---

<a id="pd-tools-019"></a>

### PD-TOOLS-019 — a match at level 3 compares each line without its carriage return

**The case, stated exhaustively.** An edit's `old_string` matches nowhere at REQ-TOOLS-136 level 1 or level 2. Level 3 SHALL
then compare each line of every candidate window, and each line of `old_string`, with one trailing `\r` set aside. The leading
prefix SHALL be measured, added and removed on those lines. A window equal under that reading matches at level 3. Levels 1, 2
and 4, their order, and the rule that the first matching level decides are unchanged.

What a level-3 match then does stays as follows: [`PD-TOOLS-015`](#pd-tools-015) for `write_file`'s single window,
[`PD-TOOLS-016`](#pd-tools-016) for the bytes written (whose clause 2 carries the CRLF endings), and
[`PD-TOOLS-014`](#pd-tools-014) for `haet_edit`'s near miss, whose revision 3 names the line endings when a window line and its
`old_string` line differ by a trailing `\r`. The quote stays the file's exact lines joined by `\n`, `\r`s included.

**Disjoint from the earlier narrowings of REQ-TOOLS-136.** This directive changes **which windows match** at level 3;
`PD-TOOLS-015` governs **what a level-3 apply writes**; [`PD-TOOLS-017`](#pd-tools-017) governs level 1 and `replace_all`. None
of the three restates another.

> *Since [`PD-TOOLS-020`](#pd-tools-020) (2026-10-14, [OQ-295](../architecture/open-questions.md#oq-295)):* which windows match at
> level 3 is decided by this directive and `PD-TOOLS-020` together — this one sets one trailing `\r` aside on every line, and
> `PD-TOOLS-020` then compares lines with no visible character by having none and measures the prefix on the first visible line.
> The two are disjoint: neither restates the other.

**Why, and what it costs.** On a CRLF file every line ends in `\r`, and an `old_string` a model writes in a JSON string almost
never carries one. Level 2 already strips the `\r` with the trailing whitespace, but level 3 compared lines exactly, so an LF
`old_string` one uniform indent off never matched a CRLF file at level 3 ([OQ-280](../architecture/open-questions.md#oq-280)).
Measured in the built app (`pnpm edits-proof`, `shift-lf`) and with the tools directly: `write_file` applied the three-line block
at "Match level: 4 (similarity: 0.91). Verify the result." and wrote it **one tab too shallow beside a success**, and `haet_edit`
gave the plain miss with no quote; a shorter window read "not found at any of the four match levels". That is the case
`PD-TOOLS-015` was ruled to prevent (OQ-233's reason: a mis-indented block never lands beside a success), one level down, and
Windows is the only platform shipped (`PD-STARTUP-001`), where CRLF files are ordinary. What it costs: some edits that applied at
level 4 are shifted, written as given or refused at level 3 instead; the near-miss quote of such a window carries `\r`s the
caller must send back; and the product departs from an implementation built from the specification alone, which compares level
3 exactly.

> **Narrows:** REQ-TOOLS-136

*Ruled under the owner's delegation, 2026-10-13 ([OQ-280](../architecture/open-questions.md#oq-280)); logged as [R-072](requests.md#r-072).
Narrows REQ-TOOLS-136 (level 3's comparison sets one trailing `\r` aside on both sides). Names `PD-TOOLS-015` and `PD-TOOLS-017`,
the earlier narrowings of REQ-TOOLS-136, and `PD-TOOLS-014` (revision 3, ruled with it) and `PD-TOOLS-016`; none of the last
three is otherwise revised.*

> **First execution, 2026-10-14, built under [R-072](requests.md#r-072) (fin43):** the rule held as written. `matchEdit`
> (`packages/agent-tools/src/tools/files.ts`) reads each window line and each `old_string` line through `body` (one trailing `\r`
> removed) at level 3 only, and computes the indent, the shift and the comparison on those; `starts` and `shifts` are returned as
> before, so `shiftNewString`, `carryWindow` and both tools' branches still receive the window's raw lines. `nearMissMessage`'s
> level-3 branch adds `PD-TOOLS-014` revision 3's sentence, read on the first line whose `\r` differs. **What was measured.**
> Eight cases under "PD-TOOLS-019" in `packages/agent-tools/src/tools/tools.test.ts`, seven red on the code before: the CRLF
> `render` loop with an LF `old_string` one tab shallow through `write_file` (level 3, `PD-TOOLS-015`'s shift sentence then
> `PD-TOOLS-016`'s CRLF sentence, the block at the file's depth with no LF-only line), the same one tab deep, a `new_string` at the
> file's depth written as given, one at a third depth refused with the bytes and the undo stack unchanged and the reply naming the
> line endings, `haet_edit`'s level-3 near miss naming them with a quote carrying `\r` and its retry applying at level 1 wholly
> CRLF (`PD-TOOLS-017`), the defect note's short `check` window reaching level 3, and a `\r`-carrying `old_string` on an LF file
> (the reply naming the endings the other way round); the eighth guards agreeing endings (no sentence) and the level-4 typo test.
> The existing `\r`-carrying level-3 case and the level-4 LF case stay green unchanged. In the built app, `pnpm edits-proof` green
> at load 1.0 to 1.5 on four CPUs: `shift-lf` asserted (level 3, both sentences, exact bytes), and the new `near-lf` and
> `retry-lf` steps through `haet_edit` (the level-3 near miss naming the line endings, its quote applying, the file wholly CRLF).
> **Found:** a block with a blank interior line never reaches level 3, on LF and CRLF alike — not decided by this ruling, recorded
> as [`a-block-with-a-blank-interior-line-never-matches-at-level-3`](../defects/fixed/a-block-with-a-blank-interior-line-never-matches-at-level-3.md)
> and raised as [OQ-295](../architecture/open-questions.md#oq-295). **What was not measured.** A live run: the `crlf` scenario
> (`lib/crlf-scenario.mjs`) now fails a level-4 window edit whose `old_string` was a uniform indent off, checks a level-3 one lands
> at the file's depth and a level-3 near miss names the endings, and is the orchestrator's to run. Repairs
> [`on-a-crlf-file-an-lf-old-string-one-indent-off-skips-match-level-3`](../defects/fixed/on-a-crlf-file-an-lf-old-string-one-indent-off-skips-match-level-3.md).
> The row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).

---

<a id="pd-tools-020"></a>

### PD-TOOLS-020 — level 3 matches blank lines by having no visible character

**The case, stated exhaustively.** An edit's `old_string` matches nowhere at REQ-TOOLS-136 level 1 or level 2, and level 3 is
tried, each line read with one trailing `\r` set aside ([`PD-TOOLS-019`](#pd-tools-019)). Then:

1. a line of `old_string` with no visible (non-whitespace) character SHALL match a window line with no visible character, at any
   shift and whatever whitespace either holds, and SHALL NOT match a window line that holds one;
2. the leading prefix SHALL be measured on `old_string`'s first line that holds a visible character and the window's line at the
   same index (`PD-TOOLS-015`'s O and W), and SHALL be added to or removed from only the lines that hold a visible character,
   each such pair equal once it is;
3. an `old_string` with no visible character SHALL NOT match at level 3.

Levels 1, 2 and 4, their order, and the rule that the first matching level decides are unchanged.

**Disjoint from the other narrowings of REQ-TOOLS-136.** This directive and `PD-TOOLS-019` decide **which windows match** at
level 3; [`PD-TOOLS-015`](#pd-tools-015) decides **what a level-3 apply writes** for `write_file`'s single window (it already
writes a `new_string` line with no visible character as given); [`PD-TOOLS-016`](#pd-tools-016) decides **the bytes** — by its
revision 4, a blank line of `new_string` paired with a blank line of `old_string` is written as the window's own line, byte for
byte; [`PD-TOOLS-017`](#pd-tools-017) governs level 1 and `replace_all`. [`PD-TOOLS-014`](#pd-tools-014) revision 4 names the
lines that hold a visible character in its level-3 sentence when the window holds a blank one. None restates another.

**Why, and what it costs.** REQ-TOOLS-136's level 3 adds or removes "one and the same leading-whitespace prefix … to every line of
the candidate", and is silent on a line with no visible character. As built, a blank line took the prefix like any other — the bare
prefix in the deeper direction, a failed `startsWith` in the shallower — while the file's blank line is empty, so an indentation-
shifted block holding a blank line never matched at level 3 ([OQ-295](../architecture/open-questions.md#oq-295)). Measured with
`matchEdit` on `a`, `\t\tx = 1;`, an empty line, `\t\ty = 2;`, `z`: the block one tab shallow or one tab deep reached level 4 on an
LF file (similarity 0.89 and 0.90), where `write_file` applied it unshifted beside "Verify the result.", and nothing on a CRLF file.
A blank line inside a function body or between two statements is the commonest shape a multi-line edit carries, so the guarantee
`PD-TOOLS-015` was ruled for — a mis-indented block never lands beside a success — did not hold for it, and `haet_edit` gave the
plain miss. Editors do not indent blank lines consistently, so a blank line says nothing about the block's depth; reading it by
having no visible character is the reading `PD-TOOLS-015` already gives a blank `new_string` line. What it costs: level 3 takes
cases level 4 took, and a whitespace-only line of the file is matched by an empty one of `old_string` (and kept, byte for byte,
by `PD-TOOLS-016` revision 4); a blank line can no longer tell two otherwise equal windows apart at level 3; and the product
departs from an implementation built from the specification alone, which shifts every line.

> **Narrows:** REQ-TOOLS-136

*Ruled under the owner's delegation, 2026-10-14 ([OQ-295](../architecture/open-questions.md#oq-295); dated 2026-10-13 until fin46
corrected it from the consortium's ruling record); logged as
[R-072](requests.md#r-072). Narrows REQ-TOOLS-136 at level 3 only. Comes with `PD-TOOLS-014` revision 4 and `PD-TOOLS-016`
revision 4, ruled with it; names `PD-TOOLS-015`, `PD-TOOLS-017` and `PD-TOOLS-019`, the other narrowings of REQ-TOOLS-136, each
carrying an in-place note where its text meets this one. The build's reading, kept as the falsified one: a blank line takes part
in level 3's shift like any other.*

> **First execution, 2026-10-14, built under [R-072](requests.md#r-072) (fin44, `fin44-supervision-and-match`), with
> `PD-TOOLS-014` revision 4 and `PD-TOOLS-016` revision 4:** the rule held as written. `matchEdit`
> (`packages/agent-tools/src/tools/files.ts`) finds `old_string`'s first line with a visible character, skips a window whose line
> at that index is blank or at the same depth, takes the prefix from those two lines, and compares each pair — two blank lines
> equal, a blank and a visible one unequal, two visible ones by the shifted equality as before; `starts` and `shifts` keep their
> shape. `carryWindow` takes `new_string` as the caller gave it (the level-3 caller passes `a.new_string`) and at level 3 writes
> each line `linePairs` pairs with a blank `old_string` line as the window's own; the CRLF carry and `PD-TOOLS-016` clause 4's
> no-op refusal are unchanged. `nearMissMessage`'s level-3 sentence adds "that holds a visible character" only when a window line
> has none. **What was measured.** Nine cases under "PD-TOOLS-020" in `packages/agent-tools/src/tools/tools.test.ts`, each red
> on `a3be56c` (the defect note's four cells through `write_file`; a blank first line of `old_string`; a whitespace-only window
> line kept byte for byte; a blank `old_string` line never matching a visible window line; `haet_edit`'s qualified near miss and
> its quote retried at level 1; a `PD-TOOLS-015` clause 4 refusal in the qualified wording), and a guard case green before and
> after (no visible character never at level 3; level 2 first); every earlier `PD-TOOLS-014` to `PD-TOOLS-019` case unchanged
> and green. In the built app, `pnpm edits-proof` green at load 1.7 to 2.5 on 4 CPUs with a new `blank-lf` step on the CRLF
> fixture (`lib/crlf-fixture.mjs`'s `BLANK_LINES`): "Match level: 3." with the shift sentence and the CRLF sentence, "(+1 -1)",
> the exact bytes, the blank line the file's own `\r\n`; on a build with `a3be56c`'s `files.ts` the same step failed — "Match
> level: 4 (similarity: 0.89). Verify the result.", the block one tab too shallow. **Found:** on that nine-line CRLF file the
> as-built result was level 4, not the "no match" the defect note's five-line file gave; the cell depends on the window's
> similarity, and both readings are outside level 3. **What was not measured.** No live run: the `crlf` scenario, which fails a
> level-4 window edit whose `old_string` was a uniform indent off, is the orchestrator's. Repairs
> [`a-block-with-a-blank-interior-line-never-matches-at-level-3`](../defects/fixed/a-block-with-a-blank-interior-line-never-matches-at-level-3.md).
> The row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).

---

<a id="pd-mcp-004"></a>

### PD-MCP-004 — a code-intelligence symbol rename is preceded by a referencing-symbol search of the same symbol

**The case.** An agent calls the bundled code-intelligence runtime's **symbol rename** (REQ-MCP-015's EDIT tier) on the server
whose entry carries the built-in code-intelligence name, under whatever name the model calls it (a `tool_name_map` rename of
REQ-MCP-005, or REQ-MCP-057's collision prefix, included). Another server's tool of the same name, and every other tool of the
EDIT tier, is not this case.

1. **The manifest.** REQ-MCP-116's binding manifest SHALL also record a **warm-up**, keyed by capability: the EDIT tier's symbol
   rename is warmed by the READ tier's referencing-symbol search, together with the names of the arguments the two share — the
   symbol's name path and the file that declares it (as the pinned runtime spells them, `name_path` and `relative_path`). The
   generator SHALL refuse a manifest in which either tool is not reported by the runtime's `tools/list`, or in which either
   tool's listed input schema lacks either argument, so an upstream rename fails a build and never a rename.
2. **The search.** Before the product forwards every such rename to the server, it SHALL send that server the
   referencing-symbol search with exactly the two shared arguments copied from the rename's own call, and SHALL discard the
   answer, an answer marked as an error included. The search is the product's own request, made as REQ-MCP-070's and
   REQ-MCP-071's are: no persona grant, `disabled_tools` or `tool_name_map` applies to it (REQ-MCP-064 reads post-connect
   probes the same way), and it never reaches the model.
3. **The record.** The search SHALL write no tool-call record, no total, no histogram bucket, no child-report entry and no
   notice. The session record shows the rename's one row, as before.
4. **The allowance.** The search and the rename SHALL be held to the rename's one REQ-MCP-003 allowance, measured from the
   dispatch of the rename: the rename is forwarded with what the search left. A search that exhausts the allowance ends the
   rename as REQ-MCP-003's failed call, unsent. A search that fails otherwise (an error result, a thrown fault, a lost
   connection) still lets the rename go ahead, the failure written to the application log. A cancel by the run during the search
   stops it, and the rename is not sent (`PD-TOOLS-013`'s `interrupted`).

   *Ruling note, 2026-10-14 ([OQ-299](../architecture/open-questions.md#oq-299), ruled under [R-072](requests.md#r-072)): when
   the search ends with the rename's allowance spent and the run's cancel also holds, the allowance governs: the rename ends as
   REQ-MCP-003's failed call (timeout), unsent, as `PD-TOOLS-013` revision 2 (c) reads the rename's own catch. This holds whether
   the search failed or answered. The Extends line is unchanged.*

Everything else stands: the rename's arguments, result and reach observation (OQ-245) are the runtime's and the run host's as
before, and the search changes nothing in the workspace.

**Why, and what it costs.** The pinned runtime (`serena-agent` 1.7.0) waits for the TypeScript language server to load the
project before a references request and not before a rename, so the first rename of a server session that needs the server's
cross-file view renamed the declaring file alone and reported success: `code-intel-proof`'s eleventh launch
(`child-rename-cold`) and four arrangements over the runtime's stdio branch, a copy of the live run's `todo-app` fixture among
them, each changed one file, while the same rename after one referencing-symbol search reached every file
([OQ-273](../architecture/open-questions.md#oq-273)). A model reaches for a rename precisely so that it does not have to edit
the referencing files one by one, and nothing told it they were left behind. What it costs: every rename makes one server
request the model did not make, and spends part of its allowance on it; the manifest gains a capability of the binding that
rests on the runtime's internals (a later pin may make the search unnecessary, or insufficient), so `code-intel-proof`'s
eleventh launch is re-run on every pin change as its acceptance gate; and the product departs from an implementation built from
the specification alone, which forwards the rename as the model made it. Precedent for a request the product makes on its own:
REQ-MCP-070's `lsp_init` and REQ-MCP-071's binding probe.

> **Extends:** REQ-MCP-116, REQ-MCP-015

*Ruled under the owner's delegation, 2026-10-13 ([OQ-273](../architecture/open-questions.md#oq-273), option (a)); logged as
[R-072](requests.md#r-072). Extends REQ-MCP-116 (the manifest records the pairing and the argument names) and governs what
REQ-MCP-015's EDIT-tier symbol rename reaches on the bundled server.*

> **First execution, 2026-10-14, built under [R-072](requests.md#r-072) (fin43):** the rule held as written. The manifest's
> `warmUps` names the pairing by capability with `name_path` and `relative_path`; the generator refuses either tool unlisted or
> either argument missing from either schema, and passed against the bundled runtime (24 tools, `--check` equal).
> `codeIntelligenceWarmUp` (`packages/config/src/mcp/code-intelligence.ts`) answers by the server-reported name; the MCP executor
> (`apps/desktop/src/run-host/mcp.ts`) asks it only of the `code_intelligence` server, after `connect`, inside `observeReach`.
> Clause 4's two exits keep the order the rename's own catch has (the allowance before the abort, `PD-TOOLS-013` revision 2), and
> a search the server answers after the run's cancel, or after the whole allowance, also stops the rename unsent. **What was
> measured.** Eight cases under "PD-MCP-004" in `apps/desktop/src/run-host/mcp.test.ts`, seven red before the change: the order
> and the two arguments, an error answer discarded, a thrown fault logged once at `warn` with the rename still sent, a cancel
> during the search (`interrupted`, nothing sent), one allowance (the rename sent with 180 s after a 120 s search; a search that
> spends it is the REQ-MCP-003 timeout, unsent), a `tool_name_map` rename warmed, another server's same-named tool and another
> EDIT tool not warmed, one settled row and no issue. In the built app, `code-intel-proof` launch 11 (`child-rename-cold`) green:
> both files renamed, report and artifact listing both, no reference-search row; red with the warm-up switched off. **What was
> not measured.** A live run: the opt-in `rename` scenario now reads a cold rename that leaves a referencing file behind as a
> finding against this directive, and is the orchestrator's to run. Repairs
> [`a-symbol-rename-that-is-the-servers-first-cross-file-request-renames-the-declaring-file-alone`](../defects/a-symbol-rename-that-is-the-servers-first-cross-file-request-renames-the-declaring-file-alone.md).
> The row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).

> **Corrected 2026-10-14 (fin44, `fin44-optional-findings`):** clause 3 was not held for one failure. The search went through
> the same connection call as a model's, which raises REQ-MCP-069's unreachable notice when the transport closes, so a server
> lost during the search was announced by the search even when the rename then reconnected and succeeded. The search is now
> sent quietly (`SessionConnections.call`'s `quiet`): a lost transport is released and logged as before, and only the rename
> may warn. Repairs
> [`a-rename-warm-up-that-loses-its-connection-raises-the-servers-unreachable-notice`](../defects/fixed/a-rename-warm-up-that-loses-its-connection-raises-the-servers-unreachable-notice.md).

> **First live execution, 2026-10-15, reported back by fin47 (`fin47-rename-and-optionals`): the rule held as written, and its
> reason is falsified for a workspace with no project file.** The opt-in live `rename` scenario at `3c03287` (pack
> `2026-10-15T05-00-55-983Z`) failed its PD-MCP-004 check: the run host sent the search (no warning logged), the rename said
> `(1 changes applied)` and changed `src/todos.js` alone, and the child mended `src/App.jsx` and `src/todos.test.js` by hand.
> ~~"four arrangements over the runtime's stdio branch, a copy of the live run's `todo-app` fixture among them, each changed one
> file, while the same rename after one referencing-symbol search reached every file"~~ — *the search was measured to help only in
> the arrangement with a `tsconfig.json`. Where no `tsconfig.json` or `jsconfig.json` covers the files, as in the `todo-app`
> fixture (a Vite React shape), the TypeScript language server holds only the open files in an inferred project; the runtime opens
> the declaring file alone, so the search answers `{}` and the rename stays in that file however long the server has run
> (measured over the bundled runtime: the search, a second search 15 s later, and overviews of both importers all left it at one
> file; an empty `jsconfig.json`, or the importers held open, made it reach all three).* What to do there is
> [OQ-362](../architecture/open-questions.md#oq-362), open; `code-intel-proof` launch 13 (`child-rename-cold-js`) pins it red in the
> built app. Reopens
> [`a-symbol-rename-that-is-the-servers-first-cross-file-request-renames-the-declaring-file-alone`](../defects/a-symbol-rename-that-is-the-servers-first-cross-file-request-renames-the-declaring-file-alone.md).
> The row is in [`../architecture/first-executions.md`](../architecture/first-executions.md).

---

<a id="pd-orch-017"></a>

### PD-ORCH-017 — children have no fixed model-step cap

A delegated child MUST NOT end a conversation or return a partial report merely because it has taken a fixed number of model steps. This applies to fresh, resumed, nested and continued children. The run's iteration limit, child timeout, cancellation, pause and loop supervision retain their existing meanings. The root's internal step bound is unchanged.

**Why, and what it costs.** A productive child can need more than 100 model steps. The internal backstop otherwise ends that work independently of progress. Removing it leaves the existing child timeout and loop supervision responsible for bounding a child.

> **Extends:** REQ-ORCH-088

*Raised by the owner, 2026-10-16; logged as [R-073](requests.md#r-073).*

**First execution, 2026-10-16.** The real-store child regression completes 105 tool calls and answers on model step 106; the focused engine, turn and back-pointer run passes 1,012 tests across 36 suites. The rebuilt application's whole `part-h-proof` passes, including `child-over-100`: one succeeded child with 105 tool calls and no step-bound warning. Its first fixture incorrectly inherited the proof helper's `single` strategy and created no child; the corrected fixture uses the ordinary delegation strategy and fails if no child runs. Lint and typecheck pass. The full gate remains red on Windows symbolic-link privileges, MCP scratch cleanup and other timeouts; continuation's later-run launch, compression startup and three resilience scenarios also failed. This is not a green landing gate or a live-model execution of the change.

**Follow-up under R-074, 2026-10-16.** The full unit gate subsequently passes while awake (6,500 tests), as do the complete MCP proof and continuation proof. Windows shutdown now gives the server stdin EOF before its runner is tree-killed at the grace bound, and path-observation fixtures use junctions without skipping their assertions. Other UI-proof readings remain recorded separately; no live-model execution is claimed.

---

<a id="pd-chat-010"></a>

### PD-CHAT-010 — the transcript's tool-rendering verbosity is one slider with five ordered stops

Settings › Display › Transcript SHALL hold one slider, **Timeline detail**, with five evenly spaced ordered stops. Only
its two ends carry a word of their own — **Compact** and **Expanded**; the selected stop's name is stated as the
slider's value, so the three interior stops are readable as they are chosen. The stops govern what the transcript draws
of **tool calls only**: prompt and answer messages are drawn at every stop, and REQ-CHAT-167's reasoning control is
independent of the slider and keeps its own preference.

The stops, in order, MUST be:

1. **Compact** — grouping on, and every tool row drawn as a row collapsed to its name and chevron with **no `⤷` preview
   on any unopened row**, the most recent pair included. The activity line's in-flight statement (REQ-CHAT-065) is
   untouched.
2. **Brief** — exactly REQ-CHAT-067 and [`PD-CHAT-004`](directives.md#pd-chat-004) as they read before this directive:
   grouping on, and all but the most recent tool-call/result pair collapsed to name and chevron, the most recent pair
   keeping REQ-CHAT-061's preview.
3. **Standard**, the default — grouping on and auto-collapse off: today's default pair, so nothing on screen changes.
4. **Detailed** — grouping off: no run folds into an activity line and every tool row is drawn as its own row, collapsed
   with its `⤷` preview.
5. **Expanded** — grouping off, and every tool row that has something to reveal is drawn already open, exactly as a row
   the reader opened is drawn by REQ-CHAT-061; what the open card contains is governed by REQ-CHAT-061 and
   REQ-CHAT-166 as it already is.

A move MUST take effect immediately on the rows already on screen and MUST NOT move the reader's position
(REQ-CHAT-071). A row the user has expanded or collapsed by hand keeps the state the user gave it, overriding the stop
for that row until its expansion state is reset (REQ-CHAT-059).

The stop is a desktop preference, stored under the registered key `display/toolVerbosity` as an integer from **1**
(Compact) to **5** (Expanded), defaulting to **3** (Standard). It is written user-wide the moment it moves like every
desktop preference (REQ-CONFIG-405), needs no Save, and Discard does not undo it; restoring it into the control emits
no change (REQ-CONFIG-419). The slider **replaces** `display/autoCollapseTools` and `display/groupToolCalls`, which are
retired from the store's key set and never written again. Where the new key is absent and either retired key is present,
the stop is read from the pair once and nothing is written back: grouping off → **Detailed**; grouping on with
auto-collapse on → **Brief**; grouping on with auto-collapse off → **Standard**. The retired keys are never rewritten or
removed, and a `display/toolVerbosity` value that is absent, unreadable or not an integer from 1 to 5 reads as
**Standard**.

**Why, and what it costs.** Two independent booleans described the mechanisms and not what a reader wants: "how much of
a tool call do I want to see" is one axis, and its ends — nothing but the call's name, everything open — were not
reachable by any setting of the pair. The five stops order the existing two mechanisms and add those two ends, with the
middle stop left as the product's default so that a reader who never touches the slider sees no change. What it costs:
one combination of the retired pair, grouping off with auto-collapse on, has no stop and lands **Detailed** — the rows
stay individual and regain the previews auto-collapse had removed. It is the only combination the slider cannot
reproduce, and it is the direction that shows more rather than less. The four REQ-CHAT-166 content controls stay a
separate workspace setting, so **Expanded** says what is open and not how many lines an open card draws.

**Recorded, not built.** On 2026-10-19 the surface still draws the two switches; nothing in this entry describes the
built product. The change owes its first execution, and this entry's own readings are owed with it.

> **Narrows:** REQ-CHAT-061, REQ-CHAT-067, REQ-CONFIG-403, REQ-CONFIG-405, REQ-SHELL-006
> **Extends:** REQ-CHAT-061

*Raised by the owner, 2026-10-19; logged as [R-076](requests.md#r-076).*

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
