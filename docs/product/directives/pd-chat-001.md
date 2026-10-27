[Product directives](../directives.md) › PD-CHAT-001

<a id="pd-chat-001"></a>

### PD-CHAT-001 — the composer's selector chips open their alternatives in a press-revealed popover

*Revision 4 (2026-09-28, [R-064](../requests.md#r-064)) — **the notices row and the paused continues**: two sentences of
"The strip" are replaced and a paragraph is added; the owner's ruling on OQ-98.
Revision 3 (2026-09-18, [R-041](../requests.md#r-041)) — **the compact strip**, below.
Revision 2 (2026-09-18, [R-040](../requests.md#r-040)) — the docked strip — is quoted where it is
replaced, never deleted. A changed directive takes a revision and never a new number
([`README.md`](../README.md)).*

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

*Raised by the owner, 2026-09-13; logged as [R-010](../requests.md#r-010). **Revised** at the owner's
request, 2026-09-18; logged as [R-040](../requests.md#r-040). **Revised again** at the owner's request,
2026-09-18; logged as [R-041](../requests.md#r-041). Revision 4 logged as [R-064](../requests.md#r-064).*

> **First execution of revision 4, 2026-09-28, ruled by [R-064](../requests.md#r-064) and built with `PD-ORCH-005` revision 4
> under [R-065](../requests.md#r-065):** the revision was built as written. The notices row already held the plan gate's
> hint, the pause's statement, the Continue action's count and "Continue without them"; the build added the tests that
> pin each there, and the paused strip's second continue now reads `Send`, named `Continue with a message`. The text met
> the code in two places, recorded in [OQ-103](../../architecture/open-questions.md) and [OQ-108](../../architecture/open-questions.md):
> - on a session a crash left, the two continues take the send pill's place as on a paused one;
> - three controls stand outside the dock and outside the notices row, and are read as outside this sentence: REQ-CHAT-021's
>   command banner, the refusal line with its recovery action, and REQ-CHAT-169's attachment list.
>
> **What was measured.** `continue-action.test.ts`; in the built app, the paused strip as one band
> with `Continue` and `Send`, and the count and the decline in the notices row, on a paused and a crash-left session.
> The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).
