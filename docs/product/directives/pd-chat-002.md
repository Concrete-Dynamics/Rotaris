[Product directives](../directives.md) › PD-CHAT-002

<a id="pd-chat-002"></a>

### PD-CHAT-002 — structured questions present an auto-opened, docked all-in-one form and a rendered transcript summary

*Revision 2 (2026-09-28, [R-064](../requests.md#r-064)) — **a prompt the application's quit dismisses**, the last sentence
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

*Raised by the owner, 2026-09-13; logged as [R-011](../requests.md#r-011). Revision 2 logged as [R-064](../requests.md#r-064).*

> **First execution of revision 2, 2026-09-28, ruled by [R-064](../requests.md#r-064) and built with `PD-ORCH-005` revision 4
> under [R-065](../requests.md#r-065):** the sentence was already built when the owner ruled it; main drops the dock's
> cancellation while the application quits. The build re-cited that guard to this revision, and found one case beside
> it: a question pending in a plan cycle when the quit lands was cancelled by the run. A stop or a quit during a plan
> cycle now withdraws it ([OQ-108](../../architecture/open-questions.md)).
>
> **What was measured.** `session.test.ts` and `plan-gate.test.ts`, each red when its limb is reverted. **What was not
> measured.** No built-app quit with a question open was driven for this revision; phase 7 of revisions 2 and 3 drove
> one. The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).
