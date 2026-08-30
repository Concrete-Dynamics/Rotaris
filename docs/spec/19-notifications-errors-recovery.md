---
reference: ROTARIS-CRW-001
domain: notifications-errors-recovery
date: 2026-08-29
status: draft
---

# Notifications, Error Handling, and Recovery

## Overview

This document states what Rotaris shows a user about the progress and outcome of work, and what it does when work does not succeed. It covers the two feedback channels and the rule for choosing between them; the content, identity and lifetime of a persistent notice; the vocabularies of run and child state that reach the screen; the classification of a failed run and the recovery each class offers; the bounded automatic recovery the runtime performs unprompted — provider fallback, quota waiting, transient retry, loop supervision, verification repair; the detection and repair of state left behind by a stopped process; and the obligations of each surface that reports any of this, namely the desktop window, the interactive terminal host, the command-line clients and the session directory on disk.

Requirements are grouped by the scope of what they govern, from surfaces shared by everything, through a single run and the calls it makes, through delegated work and its evidence, through recovery of state after a crash, to the requirement-delivery surfaces, the workspace and machine configuration, and the application itself. Numeric values are defaults unless stated otherwise. Where a list has no observable order, it is given alphabetically or by ascending severity.

## Requirements

### A1. Guarantees that bind every requirement below

**REQ-NOTIFY-254** — No failure is reported by silence. Every refusal carries a reason worded by the layer that determined it, and no record of a terminal unsuccessful outcome in this domain — a run record, a unit failure, a blocked requirement, a hook refusal, a checkpoint refusal — can be stored without one.

**REQ-NOTIFY-255** — Where this domain asks whether something is still running — a session's process, the flow owning a requirement, the precondition guarding a worktree integration — and the question cannot be answered, the answer taken is that it is running. No automatic path treats an unanswered liveness question as evidence that work has stopped, and a state entered on such an answer is left only through an explicit repair (REQ-NOTIFY-153, REQ-NOTIFY-161).

**REQ-NOTIFY-256** — Inspecting state never changes it. Every repair is requested rather than automatic, yields the same result when requested again, and is announced through at least one of: a notice, a line of command-line output, a returned sentence, a timeline entry.

**REQ-NOTIFY-257** — Verification results, completion-gate decisions, repair decisions and completion-contract fields are written by the execution runtime alone. Values for any of those fields appearing in model-authored output are discarded before a report is stored.

**REQ-NOTIFY-258** — No state is distinguishable by colour alone. Severity is carried by a border together with a glyph; a boundary holds at least 3:1 contrast against the surface behind it and text at least 4.5:1; transient and persistent surfaces draw from one glyph set; and every notice exposes its severity word in its accessible name.

**REQ-NOTIFY-259** — Each window presents one persistent notice at a time; the most recent publication is the one presented; a starting run clears only unscoped notices and notices scoped to that same session; and a dismissal identified by notice identifier cannot remove a notice published after it.

**REQ-NOTIFY-260** — A failed operation keeps everything it was given. Composer drafts, the failed session, submitted prompts, produced artifacts, worktrees and branches all remain afterwards.

**REQ-NOTIFY-261** — A fact is worded once, by the component holding it, and carried unchanged by every surface reporting it. This binds the missing-quality-gate warning, blocker reasons, checkpoint preview verbs, the awaiting-input sentence, refused board transitions and sandbox launch refusals.

**REQ-NOTIFY-262** — Four orderings are observable. The dismissed update version is recorded before the notice naming it is cleared. Clearing a notice at run start yields the same outcome whichever order the start and completion events arrive in across threads. A post-crash repair makes the corrected status durable before the lock file is removed. Verification evidence is attached to a report before any outcome is finalised, so a passing exit and a failing exit both carry it.

### A2. What every workflow makes visible

**REQ-NOTIFY-001** — Six conditions are distinguishable on screen for every workflow a user can start, each visible as soon as it holds and without the user opening, expanding or querying anything: offered but not yet run, including any first-run setup it still needs; executing; finished with a result; finished with nothing to show; failed with one concrete next step named; failed with no next step available, carrying technical detail the user can select and copy. For any two conditions a workflow can reach, its presentation in one differs from its presentation in the other.

**REQ-NOTIFY-002** — The prerequisites of a workflow — provider, model, workspace, branch, path, session — are checked before it begins expensive work, and each unmet prerequisite is named. No workflow begins work that cannot succeed, and none ends without either a result or a stated failure.

**REQ-NOTIFY-010** — Each primary view — dashboard, git, library, mission, requirements, settings, workspace — carries onboarding for its empty condition, a primary action appropriate to what it holds, progress presentation for its long operations, and disabled-reason text on the controls it disables.

### A3. Regions, controls and confirmations

**REQ-NOTIFY-006** — A card, table, list, pane or tab holding zero items shows, throughout, a sentence naming why it holds nothing and at least one instruction or control that would put something in it. Both parts appear in that region's accessible tree and are announced as ordinary content of it.

**REQ-NOTIFY-007** — Repeating the gesture that began an action already in flight — the same button, the same menu entry, the same keystroke — begins no second instance of it. While the action runs, unrelated controls respond, the window repaints, and move, resize and close are honoured.

**REQ-NOTIFY-008** — A disabled control names the condition that disables it, in adjacent text or in its tooltip, and exposes that same reason to assistive technology.

**REQ-NOTIFY-009** — A destructive action is confirmed by a dialog naming exactly what it will affect. Unsaved settings are held under three explicit choices: save, discard, cancel.

### A4. Choosing a channel

**REQ-NOTIFY-003** — A transient acknowledgement on its own is sufficient reporting only for an event that is none of the following: a failure, a refusal, an outcome carrying a recovery action. Each of those three is additionally published as a persistent notice and so stays readable after the acknowledgement lifetime of REQ-NOTIFY-011 has elapsed. Any other event may be acknowledged transiently and reported nowhere else.

**REQ-NOTIFY-004** — When an operation fails, the input the user supplied to it — a composed prompt among others — is still present and can be submitted again unchanged.

**REQ-NOTIFY-005** — An error reaches the user in two parts. Its headline is one plain sentence naming what did not work, readable by someone with no knowledge of the internals. Stack traces, provider response payloads and subprocess output appear only in a separate detail area the user can select and copy. An error whose headline is raw diagnostic output does not satisfy this requirement.

### A5. Transient acknowledgements

**REQ-NOTIFY-011** — A transient acknowledgement takes itself off screen 4200 ms after it becomes visible.

**REQ-NOTIFY-012** — A transient acknowledgement is placed with respect to its host window rather than the screen. It clears the title bar, keeps a non-zero gap from every window edge it approaches, and is drawn over all other content of that window so that nothing covers it. Moving or resizing the window restores the same position relative to the window with no user action.

**REQ-NOTIFY-013** — A transient acknowledgement wraps its text within a bounded width: at most 520 px in the single-message form, and 360 px in the stacked form, reduced to the host width less its margins where the host is narrower.

**REQ-NOTIFY-014** — A transient acknowledgement has two presentations, neutral and error, told apart by their borders. Neither fills the acknowledgement's background with a status colour. In every theme offered, the border holds at least 3:1 contrast and the text at least 4.5:1 against the surface behind them. The presentation belongs to the message currently shown: changing theme while an acknowledgement is visible leaves it in the presentation its own message calls for, and an error acknowledgement never repaints as a neutral one.

**REQ-NOTIFY-015** — A transient acknowledgement never takes keyboard focus. One appearing while the user types leaves the caret position and the input focus untouched.

**REQ-NOTIFY-016** — Where acknowledgements stack, three are visible at most; publishing a fourth removes the oldest immediately.

**REQ-NOTIFY-017** — In a stack, the newest acknowledgement occupies the slot nearest the anchoring corner and earlier ones move away from it. No existing acknowledgement is reordered or replaced where it stands.

**REQ-NOTIFY-018** — An acknowledgement carries one of four kinds, given here in ascending severity: `info`, `ok`, `warn`, `fail`. The glyph a kind uses is the glyph the corresponding notice severity uses.

**REQ-NOTIFY-019** — An acknowledgement's accessible name is its kind word followed by its title, the kind words being Notice, Done, Warning and Failed. Its body text becomes its accessible description. Kind is never signalled by colour alone.

**REQ-NOTIFY-020** — A timeout of zero or less leaves the acknowledgement on screen until something removes it, and the countdown can be restarted. Only the close control accepts interaction. Closing an acknowledgement in the same instant its timer expires removes it once and raises nothing.

**REQ-NOTIFY-021** — The close control's accessible name identifies the acknowledgement it removes. One clear operation removes every visible acknowledgement at once; changing view and shutting down each perform it.

**REQ-NOTIFY-022** — A transient acknowledgement animates into place by default. Where the operating system reports a preference for reduced motion, its first painted frame is already at its final position at full opacity and nothing moves or fades afterwards. That preference changes motion only: the same message appears, it leaves after the same 4200 ms, and no acknowledgement is suppressed, delayed or reordered.

### A6. Persistent notices: fields, identity and lifetime

**REQ-NOTIFY-023** — A persistent notice carries an identifier; a severity, being one of `info`, `success`, `warning`, `error` in ascending order; a title; a message body, possibly empty; a block of technical detail the user can copy, possibly empty; a `persistent` flag; an action label together with the identifier of the action it invokes, either of which may be empty; and a session identifier, possibly empty. The `persistent` flag has one observable effect, given in REQ-NOTIFY-040: whether a dismiss control is offered. A notice with the flag clear stays on screen exactly as long as one with it set.

**REQ-NOTIFY-024** — One notice is current at any moment, and it is the one published most recently. A publication replaces whatever notice was current, whichever session either concerns, and the replaced notice does not return unprompted. Replacement is a distinct event from clearing: the scoping rules of REQ-NOTIFY-028 and REQ-NOTIFY-029 govern what a starting run clears, and they exempt nothing from being replaced.

**REQ-NOTIFY-025** — Notice identifiers are unique within an application session and increase monotonically.

**REQ-NOTIFY-026** — A clear request carrying no identifier removes whatever notice is current. A clear request carrying an identifier removes the current notice only where the identifiers match, so dismissing a notice already superseded leaves its successor standing.

**REQ-NOTIFY-027** — A notice outlives the acknowledgement lifetime of REQ-NOTIFY-011 without limit and stays until dismissed or superseded. Notices are not written to disk: no notice published before an application restart appears after it.

**REQ-NOTIFY-033** — A notice raised by work the user did not start appears without the user clicking, refreshing or changing view. Where several notices are published in quick succession, the one on screen once the burst has been delivered is the last published, no earlier publication surfaces after a later one, and no publication in the burst is dropped before reaching the surface.

### A7. Persistent notices: where and how they are drawn

**REQ-NOTIFY-034** — The application window renders the current notice as a single inline banner at the top of the window, below the title bar. A secondary or popped-out window renders its own banner, and activating an action in that banner is handled identically to activating the same action in the main window.

**REQ-NOTIFY-035** — A persistent notice signals severity with a border and a glyph, never by filling its background with the severity colour. It is bordered on all four sides and carries a rule down its left edge three times that border's width, both in the severity's colour, with the glyph in the severity's text colour. Against the surface behind them, border and left rule hold at least 3:1 contrast, and glyph and body text at least 4.5:1, in every theme offered.

**REQ-NOTIFY-036** — Severity glyphs are `i` for info, `✓` for success, `!` for warning and `×` for error, and are the same glyphs the corresponding acknowledgement kinds use.

**REQ-NOTIFY-037** — The title is always rendered. The message row and the detail row are rendered only where their text is non-empty. Detail text can be selected with the mouse.

**REQ-NOTIFY-038** — A copy control appears exactly where the detail block is non-empty, and activating it places the detail text on the system clipboard. Its accessible name states that it copies technical detail.

**REQ-NOTIFY-039** — An action control appears exactly where both an action label and an action identifier are present, and activating it dispatches that action identifier.

**REQ-NOTIFY-040** — A dismiss control appears exactly where the notice's `persistent` flag is set; activating it clears that notice and, under REQ-NOTIFY-026, cannot clear a notice that has since replaced it. A notice with the flag clear offers no dismiss control and cannot be removed by the user directly. No notice leaves on a timer: a notice leaves the surface only by replacement under REQ-NOTIFY-024, by a clear performed under REQ-NOTIFY-029 or REQ-NOTIFY-058, or, where the flag is set, by the user dismissing it.

**REQ-NOTIFY-041** — The banner's accessible name opens with the notice's severity word — `info`, `success`, `warning` or `error` — and continues with its title. Its accessible description is the message body followed by the technical detail; where only one of the two is present the description is that one; where neither is present the banner exposes no accessible description.

**REQ-NOTIFY-042** — Clearing the current notice hides the banner and releases the identifier it held.

**REQ-NOTIFY-043** — The banner can carry a thin progress meter. It is hidden unless asked for, and is removed whenever a different notice is displayed. Where no percentage is known the bar is absent rather than estimated. Percentages are clamped to the range 0 to 100. The fill is drawn in the accent colour at every value. The meter's label is also its accessible name, and the banner text states the same count in words.

### A8. Which session a notice belongs to

**REQ-NOTIFY-028** — A notice with an empty session identifier belongs to whichever run is focused. A notice carrying a session identifier concerns that other session and is treated as unread.

**REQ-NOTIFY-029** — A starting run clears the standing notice only where that notice's session identifier is empty or equal to the starting session's. A notice about a different session survives an unrelated run start, whatever order the start and completion events arrive in across threads.

**REQ-NOTIFY-030** — Changing the focused session moves every recovery affordance with it. Afterwards, a retry resubmits the newly focused session's draft, or that session's last submitted prompt where the draft is empty, and never the previously focused session's; the newly focused session still has its first automatic authentication fallback available under REQ-NOTIFY-070, whether or not the previously focused session spent one; the sandbox indicator describes the newly focused session; and the live output on screen belongs to that session alone.

**REQ-NOTIFY-031** — A run other than the focused one reaching a terminal state that is not a failure raises a persistent notice naming that session and the state it reached, with severity `success` where the state normalises to `completed` and `info` for every other non-failure terminal state. Its body states that the session on screen is unaffected and that the finished session can be opened for review, and it offers an action focusing that session. Publishing it changes neither the focused session nor what the focused view shows, and the session list shows the finished session's new state. A failure of a non-focused run is reported under REQ-NOTIFY-032 and raises nothing under this requirement.

**REQ-NOTIFY-032** — A run other than the focused one that fails raises a persistent notice of severity `warning` naming that session, carrying in its copyable detail the failure text exactly as the run reported it, and offering an action focusing that session. It replaces the completion notice of REQ-NOTIFY-031 rather than accompanying it.

### A9. What a notice can offer the user

**REQ-NOTIFY-044** — A notice action comes from a fixed vocabulary, and activating one produces the stated result: focus a named session; initialize or resolve a project; install a pending update; open a named view; open settings at a named tab; open the hosted-cloud account surface; open the library at a named tab; restart after an update has been installed; retry the failed run under REQ-NOTIFY-045; revert a recorded proposal review decision; save settings. An action concerning a particular object — a session, a settings tab, a library tab, a proposal decision — carries that object's identity, and activating it acts on that object without asking the user anything further.

**REQ-NOTIFY-045** — Activating a retry action resubmits the current composer draft, or the last submitted prompt where the draft is empty.

**REQ-NOTIFY-046** — Reverting a proposal review decision from a notice takes effect on activation, with no second confirmation.

**REQ-NOTIFY-047** — An offer to run a recovery step that writes into the user's project — placing the workspace under version control, for instance — is presented inside the view that reported the unmet precondition, and that step's outcome, successful or not, is reported in that same view. Activating a notice action writes nothing into the user's project.

### B1. Authentication failures

**REQ-NOTIFY-067** — A failure counts as an authentication failure where its text contains, ignoring case, any of `401` standing alone, `api key not valid`, `authentication error`, `authentication fail`, `authenticationerror`, `incorrect api key`, `invalid api key`, `invalid_api_key`, `unauthorized`.

**REQ-NOTIFY-068** — An authentication failure is never retried against the same provider with the same credentials. Recovery changes the model or the credentials.

**REQ-NOTIFY-069** — Automatic authentication recovery is attempted only where a run channel, a configuration service and a recorded last prompt all exist. Otherwise the failure takes the generic notice path of REQ-NOTIFY-064.

**REQ-NOTIFY-070** — On the first authentication failure of a session, where a fallback model is configured and differs from the model that failed, the fallback is pinned as that session's model override, an error acknowledgement names the model that failed and the fallback now in use, and the run restarts with the same prompt. Where the restart cannot begin, the fallback bookkeeping is cleared and the generic failure notice is published instead.

**REQ-NOTIFY-071** — A successful fallback restart opens a non-modal re-authentication prompt beside the continuing run. It names the primary model that failed, states that the run continues on the fallback and that re-authenticating switches back from the next iteration, quotes the provider's error, and offers a dismissal meaning that the fallback is kept.

**REQ-NOTIFY-072** — A second authentication failure, or a first one with no usable fallback, opens a modal recovery dialog 560 px wide, titled for authentication failure and naming the model that failed, or naming the active model where the model is unknown.

**REQ-NOTIFY-073** — The recovery dialog reproduces the provider's own error text, with runs of whitespace collapsed and the result truncated to 320 characters followed by an ellipsis, drawn in the failure text colour.

**REQ-NOTIFY-074** — The recovery dialog's first path lists models from providers other than the one that failed, ahead of any others, each labelled with its model name and its provider. Where no other provider offers a model, every model except the one that failed is listed. The retry control is disabled while the list is empty. Choosing a model pins it and restarts the run.

**REQ-NOTIFY-075** — A model chosen by hand in the recovery dialog that also fails authentication reopens the recovery dialog; the automatic fallback that already failed is not tried again.

**REQ-NOTIFY-076** — The recovery dialog's second path re-authenticates the provider that failed. For key-based providers it offers a masked key field with a save-and-retry control enabled only while the field is non-blank. For browser and device-code providers it gives the instruction to run `rotaris-cli login {provider}` in a terminal and offers a control confirming that re-authentication has been done. Either submits a re-authentication request naming the provider, with an empty key for the external flows.

**REQ-NOTIFY-077** — A key that cannot be stored produces an error acknowledgement naming the storage failure. A run that cannot be restarted after successful re-authentication produces an error acknowledgement stating that.

**REQ-NOTIFY-078** — Submitting the non-modal prompt saves any key supplied, clears the automatic-fallback bookkeeping so a further fallback attempt is available, and re-pins the primary model. Where the run is still active and supports changing model mid-run, an acknowledgement states that the switch takes effect from the next iteration; otherwise an acknowledgement states that the primary model will be used for the next run.

**REQ-NOTIFY-079** — At most one authentication dialog is visible. Opening the modal recovery dialog closes any non-modal re-authentication prompt that is open.

**REQ-NOTIFY-080** — Cancelling the recovery dialog closes it and does nothing else; the run stays failed and its notice stays on screen.

### B2. Failed runs: classification and the recovery each class offers

**REQ-NOTIFY-060** — A failed run has its session status set to failed, and the failure is then matched against four classes in this order: an authentication failure; a sandboxed launch that was refused; a quota or rate limit; anything else. The first class that matches handles the failure, and no later class is applied.

**REQ-NOTIFY-061** — Where a sandbox mode was requested and the run never reached a started state, the error notice reproduces the refusal wording as received, unedited, in both its message and its copyable detail, including any remediation that wording contains. It offers an action returning to the workspace view and offers no retry. The sandbox indicator stops describing the run as sandboxed. Reporting this case with the generic wording of REQ-NOTIFY-064, or offering a retry, does not satisfy this requirement.

**REQ-NOTIFY-062** — Where the failure text carries a rate-limit or quota marker, matched ignoring case, and the run used the hosted cloud provider with a credit balance already read, a fresh credit read is requested, and an error notice reports the refreshed balance and its state, states that the session is preserved, offers topping up the account or choosing a model on another provider, carries the failure text as detail, and offers an action opening the cloud account surface.

**REQ-NOTIFY-063** — A rate-limit or quota failure on any other provider raises an error notice stating that the provider limit was reached and that the session is preserved, offering another model or a retry once the provider resets, carrying the failure text as detail, and offering an action opening model settings.

**REQ-NOTIFY-064** — A failure matching no earlier class raises an error notice stating that the run failed and that the session and the draft were kept, carrying the failure text as detail and offering an action returning to the workspace view.

**REQ-NOTIFY-065** — Every error notice carries severity `error`, has its `persistent` flag set, and carries copyable detail. Producers include checkpoint listing and restore failure, context compression that did not complete, project-initialization failure, prompt-history save failure, run failure, slash-command failure, transcript-clear failure, update-install failure, version-control refresh failure, and worktree creation and deletion failure.

**REQ-NOTIFY-066** — The composer draft is stored per workspace in the local application settings under the key `workspaces/{workspace_path}/composerDraft`. It survives failure, view changes and application restart, and remains available to the retry action of REQ-NOTIFY-045.

### B3. Loop and stuck-state supervision

**REQ-NOTIFY-102** — Where no loop occurs, a run with supervision enabled is indistinguishable from the same run with supervision disabled: no corrective message appears in the conversation or the transcript, no supervision entry appears in the session timeline or in diagnostics, and no transcript row is attributable to supervision.

**REQ-NOTIFY-103** — On a loop being declared, a corrective message is placed in the session's own context, either directing the agent to different work or requiring it to re-examine its current approach. The message is composed for that activation from that session's recent context: two activations whose recent context differs produce different text, and the text is not drawn from a fixed set of alternatives. It names no supervision feature, no loop detection and no component. It is placed in the session context only and is never presented to the user as a message in its own right.

**REQ-NOTIFY-104** — Detection counters reset after each activation. Consecutive activations with no user instruction between them are counted, and a new user instruction resets that count.

**REQ-NOTIFY-105** — More than two consecutive activations with no intervening user instruction end the session. The stop is reported as an escalation naming three facts: the session, the number of consecutive activations, and that repeated looping caused it.

**REQ-NOTIFY-106** — At most 2 seconds pass between a session's recent activity satisfying the criteria of REQ-NOTIFY-108 and the corrective message of REQ-NOTIFY-103 being present in that session's context.

**REQ-NOTIFY-107** — Supervision state belongs to one session and is never read or written by another.

**REQ-NOTIFY-108** — A loop is declared primarily from repetition in the recent action sequence: by default, four consecutive actions of the same signature, or a cycle of two to four actions repeating three times. Volume serves only as a backstop, defaulting to 60 tool calls or 60 messages. Two combination modes are configurable: `independent`, the default, in which either signal declares a loop on its own; and `weighted`, in which tool activity weighs 0.6, message activity weighs 0.4, and a combined score of 1.0 declares a loop. At most the 24 most recent events and 8000 characters of transcript are examined.

**REQ-NOTIFY-109** — Where the classifier call fails, the decision is made from the collected signals alone: a repetition trigger declares a loop; a volume trigger declares a loop only where repeated assistant messages or back-to-back invocations of the same tool corroborate it, and never from the counts by themselves.

**REQ-NOTIFY-110** — A configuration setting turns supervision off. While it is off, a run proceeds with no corrective message injected, no loop escalation, and no supervision entry in the timeline or in diagnostics, and the absence is reported neither as an error nor as a degraded state. A configuration that omits the setting behaves as enabled. Changing the desktop's runtime toggle applies to runs started afterwards; a run already under way is unaffected.

**REQ-NOTIFY-111** — A child task reporting a stuck condition it can recover from does not end as a failure: it receives a corrective instruction and resumes from where it stopped. The third such recovery within one child task escalates on the terms of REQ-NOTIFY-105. A child task reporting a condition it cannot recover from fails immediately, with no corrective attempt. Where no corrective instruction can be composed for a recoverable stuck condition, a fixed instruction addressing a repeated read-then-edit cycle is used in its place and the task continues.

**REQ-NOTIFY-112** — Separately from loop supervision, a child task ending in a recovery-eligible outcome receives at most one corrective message about its lack of progress. The count is per child task, so a second such message is never sent to the same child however often the outcome recurs. A child task on an answer-only route receives none.

### B4. Message limits

**REQ-NOTIFY-244** — `message_limit` accepts a positive integer, or null or zero meaning disabled, which is the default.

**REQ-NOTIFY-245** — The message count increases by one per completed orchestration iteration and is stored in session state, so it survives a crash and a reattachment. Iterations already counted are never put to the user again.

**REQ-NOTIFY-246** — The limit is evaluated between iterations. While a run is paused at its limit, no model request is dispatched and no child task is spawned.

**REQ-NOTIFY-247** — The interactive confirmation at the limit states the current count, the limit and the estimated token usage, and offers three actions: continue, bound to `c` and Enter; double the limit, bound to `d`; cancel the run, bound to `x` and Escape.

**REQ-NOTIFY-248** — A background run pauses itself at the same boundary: the file `.message_limit_paused` is written in the session directory, the execution status becomes `paused_message_limit`, and the session stays paused indefinitely until reattached. Reattaching presents the confirmation at once, and a command-palette entry for continuing a paused session is enabled only in that state.

### B5. Quota and usage limits

**REQ-NOTIFY-081** — Usage-limit responses, HTTP 429 among them, are handled during execution and do not reach the user as a raw failure.

**REQ-NOTIFY-082** — Where a model reports a usage limit and another model of the same tier is offered by a different provider, execution continues on that other model without asking the user. Tier is the role recorded for the exhausted model: `small_model`, `medium_model` or `large_model`. A candidate is a model whose recorded role equals the exhausted model's role and whose provider differs from the exhausted model's. Candidates are taken configured-first and then discovered, and a model present in both is considered once.

**REQ-NOTIFY-083** — Where the fallback model also hits a limit, or where no fallback exists, the run is suspended in a wait state; it does not fail.

**REQ-NOTIFY-084** — Where the provider supplies retry-after or rate-limit-reset information, the resume time is taken from it, with a floor of 1 second. Accepted forms are an explicit retry-after value carrying a unit suffix for seconds or minutes, and the plain-language phrasing `try again in N <unit>`; minute units are converted to seconds.

**REQ-NOTIFY-085** — With no usable retry-after information, the wait is computed locally and determined entirely by the attempt number, with no randomisation: 60 seconds for the first attempt, doubled for each further attempt, capped at 300 seconds.

**REQ-NOTIFY-086** — While suspended, the interactive host offers three choices and no others: keep waiting, bound to Escape and `W`; change model, bound to `M`; cancel the run, bound to `C`. A help line names all three.

**REQ-NOTIFY-087** — Where auto-resume is permitted, the wait ends by itself once the computed interval has elapsed, and execution retries. Where auto-resume is not permitted, the wait continues until the user decides.

**REQ-NOTIFY-088** — A structured provider quota-exhaustion error — `insufficient_quota` or `insufficient-quota`, or plain-language exhaustion such as an exceeded current quota or a direction to check plan and billing — marks that provider and model exhausted for the rest of the session. Auto-resume onto it is refused, and recovery requires a different eligible model or an explicit choice by the user.

**REQ-NOTIFY-089** — A model chosen by hand during a wait is kept for the rest of the session and overrides the tier whose quota was exhausted, so later calls in that session do not return to the exhausted model.

**REQ-NOTIFY-090** — Quota recovery leaves inspectable evidence: a timeline entry for a quota-driven model change; a warning-severity diagnostics issue naming the requested model, the fallback model and whether the provider is exhausted; and, where a wait is entered, a diagnostics issue recording the attempt number, the model, the computed wait in seconds, whether auto-resume is allowed and whether the provider is exhausted.

**REQ-NOTIFY-091** — A failure counts as rate limiting where the provider raises its own rate-limit exception type, or where its failure text contains `429`, `rate limit` or `too many requests` as a substring, compared ignoring case. Quota exhaustion is classified under REQ-NOTIFY-088 and is never reported as rate limiting. Where the provider's quota error identifies the exhausted model, that model name appears in the message required by REQ-NOTIFY-092; where it does not, that message states the condition and omits the model name.

**REQ-NOTIFY-092** — Every runtime error the user reads names both the condition and the next step, and one condition yields one wording: two occurrences of the same condition differ only in the values substituted into the text. By condition: quota exhaustion names the exhausted model, states that retrying the same provider and model will keep failing, and directs the user to switch model or add credit to the provider account; rate limiting states the interval to wait where the provider supplied one under REQ-NOTIFY-084 and otherwise directs the user to wait, naming no interval; provider unavailability states that the provider is temporarily unreachable and directs the user to retry, naming no interval; a credential or HTTP header containing a non-ASCII character directs the user to enter the provider key again using its exact ASCII value; a rejected request parameter names the parameter, and, where the backend accepts only a reduced parameter set, states that as well.

**REQ-NOTIFY-093** — On the desktop, a quota or rate-limit condition that ends a run is reported through the failure classification of REQ-NOTIFY-062 and REQ-NOTIFY-063.

### B6. Run lifecycle vocabulary and run controls

**REQ-NOTIFY-048** — One normalised lifecycle vocabulary reaches the screen, its members being `cancelled`, `cancelling`, `completed`, `failed`, `idle`, `paused`, `pausing`, `running` and `starting`. A raw backend or persisted status string is never rendered.

**REQ-NOTIFY-049** — A status recorded by a backend or read from persisted state is presented through that vocabulary as follows: a value already in the vocabulary presents as itself; `attached` and `background` present as `running`; `succeeded` and `done` present as `completed`; `error` presents as `failed`; `interrupted` presents as `idle`, consistent with a repaired session presenting as not busy under REQ-NOTIFY-151 and REQ-NOTIFY-160. Any other value presents as `idle`.

**REQ-NOTIFY-050** — A run is busy while its normalised state is `starting`, `running`, `pausing` or `cancelling`.

**REQ-NOTIFY-051** — The prompt composer is locked while the focused run is busy. Starting a new run is presented distinctly from continuing a completed or paused session.

**REQ-NOTIFY-052** — Progress is shown for the whole time a pause, a cancellation, a context compression, a refresh or an authentication operation is in flight.

**REQ-NOTIFY-053** — Cancelling a run or an agent requires confirmation. The confirmation names every live descendant that will also be cancelled, states that the cancellation cannot be undone within the session, places initial keyboard focus on the choice that cancels nothing, and marks the confirming control as destructive with an accessible description stating that the action is irreversible.

**REQ-NOTIFY-054** — Where a status was shown optimistically and the underlying operation then refuses, the status returns to its previous value and an error acknowledgement states that the operation is no longer possible.

**REQ-NOTIFY-055** — Closing the application while runs are active raises a confirmation stating how many runs are active and that work in flight may not finish. Confirming requests shutdown of every active run.

**REQ-NOTIFY-056** — Closing the application while an isolated worktree integration is running is refused, with a message asking the user to keep the application open until the integration finishes.

**REQ-NOTIFY-057** — A shutdown that no user gesture initiated raises no interactive dialog.

**REQ-NOTIFY-058** — A run starting sets its session status to running, clears any notice that is unscoped or scoped to that same session, records the sandbox verdict for that session, attaches its output streams and shows the workspace view.

**REQ-NOTIFY-059** — The focused run reaching `completed` raises a persistent success notice inviting review of the transcript and the session artifacts, with an action opening the artifacts library. Any other terminal status of the focused run produces only a transient acknowledgement naming that status; the failure detail arrives through the classification of REQ-NOTIFY-060.

### B7. Transient failures and bounded operations

**REQ-NOTIFY-094** — A failure is transient where the provider raises its own rate-limit or service-unavailable exception type, or where its text or type name contains any of `apiconnectionerror`, `connection aborted`, `connection error`, `connection reset`, `incomplete chunked read`, `peer closed connection`, `service unavailable`, `temporarily unavailable`, `timed out`, `timeout`, `transport`. An interruption of a response already streaming is transient.

**REQ-NOTIFY-095** — These are not transient and are never retried automatically: an overall operation timeout, a request-encoding error caused by non-ASCII content, an insufficient-quota error, an authentication error.

**REQ-NOTIFY-096** — A transient failure inside a delegated child task is retried up to `runtime.auto_retries_transient`, default 1. Each retry waits a number of seconds equal to the attempt number, capped at 2, logs a warning naming the attempt and the limit, and files a diagnostics issue recording the attempt.

**REQ-NOTIFY-097** — Where the transient retry bound is spent, or the failure was never transient, the child task fails as an orchestration outcome in its own right — not as a crash of the scheduler, and not silently.

**REQ-NOTIFY-098** — A provider refusing a requested structured-output format does not fail the operation: the operation completes in the next format that provider accepts, and no error about the refusal reaches the user. Within one run of the application, a format a given model has already refused is not requested from that model again. A restarted application requests the preferred format from that model once more, with no user action.

**REQ-NOTIFY-099** — Where a model produces no event within `runtime.llm_response_timeout`, default 120 seconds and no lower than 30, the model is treated as unresponsive and the persona-level fallback model is activated where one is configured. The child task continues rather than being terminated.

**REQ-NOTIFY-100** — Seven operations are bounded independently, and each bound can be changed without changing another: a child task's total run, `runtime.child_timeout`, default 1200 s; a child task producing no output, `runtime.child_stall_timeout`, default 90 s; one tool call, 30 s; one shell command, 100 s; generating a summary, 120 s; a loop-classification call, 20 s; post-run improvement analysis, `runtime.improvement_collector_timeout`, default 60 s. Exceeding a bound ends only the operation that bound governs, and the result is reported as that operation's own timeout rather than as a failure of the run containing it. `runtime.auto_retries_validation` defaults to 0, so by default a validation failure is reported once and the validation is not repeated.

**REQ-NOTIFY-101** — Where intent classification times out, fails, or returns a value with no mapping, a generic default intent is used and the run continues. Classification failure never stops a run.

### C1. Child dependencies and terminal child states

**REQ-NOTIFY-113** — A child task starts only once every task named in its dependency list has reached `succeeded` and has produced its mandatory report artifact. A dependency without its report artifact does not count as satisfied.

**REQ-NOTIFY-114** — A cycle among dependencies is a validation error, and the child it affects is not started.

**REQ-NOTIFY-115** — A child task does not start by itself while any task in its dependency list ended `blocked`, `cancelled` or `failed`. Its own state reads `blocked`, and it continues to read `blocked` until a user or a re-delegation acts on it.

**REQ-NOTIFY-116** — A child task ends in exactly one of `blocked`, `cancelled`, `failed` or `succeeded`, and reports no state afterwards. `blocked` is among those final states and is reachable from every state that is not already final. The answer to whether a child has finished is the same wherever it is asked — in the delegation display, in a dependant's readiness check, in a post-crash sweep, at re-delegation.

**REQ-NOTIFY-117** — Child state is projected for display as follows: waiting on dependencies and waiting on a model slot render as waiting; `blocked` renders in the failed presentation; summarizing renders as running; an unrecognised value renders as queued. Declared dependencies are carried through and drawn in the delegation tree.

**REQ-NOTIFY-118** — A child reaching a terminal state during a tool call has its live tool indicators cleared, so a stopped agent shows no tool in progress.

**REQ-NOTIFY-119** — A transcript tool row carries a status of `blocked`, `failed`, `ok` or `running`. `blocked` is the presentation for a tool call the permission policy refused and for a verification check that was skipped; neither is presented as success.

**REQ-NOTIFY-120** — Where a loaded snapshot's session status states that no run can still be active, agents still marked running are settled: `completed`, `succeeded` and `done` become done; `failed` and `error` become failed; every other value becomes cancelled. Their activity text states that they ended with the run, and their active tools are cleared. A session status of `idle` leaves agents untouched. A stale or older-format snapshot therefore never renders a finished run above a live activity indicator.

**REQ-NOTIFY-121** — Once a process holds a session's `lock`, no child record left by an earlier occupant of that session reads as unfinished: every such record reads `cancelled`, carries a completion time, and shows no tool call in progress. Performing this again on the same session changes nothing further.

### C2. Child reports and re-delegation

**REQ-NOTIFY-122** — Every terminal child state produces a report artifact, generated by a separate inexpensive summarizing agent whose only task is to summarize, and the parent reads that artifact rather than the child's raw transcript. It is typed JSON requiring at least `agent_name`, `persona` and `status`.

**REQ-NOTIFY-123** — On resume, the parent receives the structured report artifacts of children that have newly reached a terminal state, together with the current state of all its children, and may re-delegate any of that work. A re-delegation receives a fresh unique name formed from the original name and a numeric suffix.

**REQ-NOTIFY-124** — Failure detail presented to a host has internal prefixing removed, so the underlying provider or tool reason is what the user reads. The failure detail travels to the parent on the report artifact.

**REQ-NOTIFY-125** — Where an iteration ends with work incomplete while background children are still in flight, the re-queued task payload lists each in-flight task by name, persona, task identifier and state, instructs that they are not to be re-delegated because they are running and will produce their artifacts on their own, and instructs that only the remaining incomplete items be worked. Any continuation block left by an earlier attempt is removed before a new one is appended.

### C3. Verification evidence and completion gating

**REQ-NOTIFY-126** — Verification results are stored in the child report as a structured evidence field carrying a verdict of `failed`, `passed` or `skipped`, and that verdict survives a JSON round trip. A suite that never ran reads `skipped` and never `passed`.

**REQ-NOTIFY-127** — Fields that only the execution runtime may set — verification evidence, gate decision, repair decision, completion-contract fields — are removed from model-authored output before the report is stored.

**REQ-NOTIFY-128** — A completion gate decision is one of `exempt`, `gated` or `passed`, and is applied after the completion classifier has run. A completion verdict reached over failing blocking checks is downgraded, and the overruled verdict is retained for audit.

**REQ-NOTIFY-129** — A check the permission policy denied is recorded `skipped` and counts as missing evidence, never as passing. A failing advisory check does not gate and is named in the outcome.

**REQ-NOTIFY-130** — The decision is `exempt` where no suite ran at all: a read-only task, an explicitly empty `verifier.checks`, a suite that could not be detected, or a degraded path in which verification itself failed.

**REQ-NOTIFY-131** — A gated report is rewritten to a partial status, so the existing re-queue behaviour applies. The decision is emitted as a completion-gate timeline event. Setting `verifier.gate_completion` to false for a workspace stops gating there, while checks still run and evidence is still reported.

**REQ-NOTIFY-132** — Failing blocking checks cause the work to be re-delegated with the failing evidence attached: the next attempt's execution payload carries a block naming each failing blocking check with its name, its command, its status, its exit code, an excerpt of its output and the path to its full log. That block replaces any block injected by an earlier attempt.

**REQ-NOTIFY-133** — Each gated iteration spends one attempt from `verifier.max_repair_attempts`, default 2 and configurable down to 0. At 0, a gated result is reported as a failure and no further attempt is made. The budget covers one task at a time, starts each run full, and returns to full once that task's checks pass. A re-queue caused by ordinary incomplete work spends none of it. A repair attempt is otherwise an ordinary iteration and counts against the run's iteration limit and against any limit on repeating the same task.

**REQ-NOTIFY-134** — Where the repair budget is spent, the report becomes failed naming the checks that failed, escalation is emitted both as a timeline event and to the host hook, and the session's other tasks continue. Scheduling of a repair attempt is likewise emitted as a timeline event.

**REQ-NOTIFY-135** — `invalid` is recorded for a check that cannot be run as written, and it is reported distinctly from a check that ran and found a defect. An `invalid` check does not gate, spends no repair attempt, and contributes nothing to the failing-check block of REQ-NOTIFY-132. Where another check of the same role and the same severity is available, the suite runs that one in its place, at most once per role per session, and the substitution appears in the suite's reported results.

**REQ-NOTIFY-136** — A change that weakens a gate — dropping a role, lowering a severity, emptying the suite — is outside the authority of every automatic path and becomes an approval-gated improvement proposal. Repeat proposals for the same change are collapsed into one.

**REQ-NOTIFY-137** — While a workspace declares no quality gate, work still completes, and every report of the run states the gap: the child report records that no gate is established, and the run header and the session summary each display a warning for as long as that holds. Every surface displays the identical sentence, character for character, and no surface composes wording of its own. Two sentences exist: one used where a gate-authoring note was found in the workspace, which cites that note, and one used where none was found. Each states that this workspace has no quality gate and how the user declares one through `verifier.checks`, or states that nothing verified this run.

**REQ-NOTIFY-138** — For a workspace with no project yet, the missing-gate warning is empty rather than displayed. Setting `verifier.checks` to an empty list ends the warning permanently; setting it to a non-empty suite ends gate authoring. `verifier.author_gate`, default true, switches gate authoring off; while off, every gate write is routed to an approval proposal.

### C4. Verification while a suite runs

**REQ-NOTIFY-139** — A verification suite is observable while it runs, not only once it has finished. The user is told the suite has started before its first check runs. Every check is reported twice, once on starting and once on settling, and each report names the check, its position within the total number of checks, and the number of seconds it is allowed. Suite start, check start and check finish are each recorded in the session timeline, so watching a suite live and reading the same suite back from the timeline afterwards yield the same events in the same order.

**REQ-NOTIFY-140** — On the desktop, a run that is verifying is distinguishable from a run doing other work. The run header names the check now running, its position within the suite, how long it has been running and how long it is allowed. The transcript gains one row per check, counting upward while the check runs and settling to that check's outcome, its duration and an excerpt of its output. Run controls behave exactly as they do elsewhere in the run, and the normalised lifecycle state stays `running` for the whole suite. The activity label states that verification is in progress and gives the check position, in the form `unit tests (2/3)`.

**REQ-NOTIFY-141** — While a suite runs, the user can read all of the following without opening a panel or a dialog: that verification is active; the name and the command of the check now running; its position within the total; how long it has been running, advancing continuously rather than only when a new event arrives; and the number of seconds it is allowed. The missing-gate warning of REQ-NOTIFY-137 is displayed whenever it applies, including at times when no suite is running.

**REQ-NOTIFY-142** — Check outcomes map to transcript row statuses: `passed` to `ok`, `failed` to `failed`, `timeout` to `failed`, `skipped` to `blocked`.

**REQ-NOTIFY-143** — A skip the user asks for is not a failure. The skip delivers the terminal's interrupt to the check's process group. A command that traps the interrupt and keeps running is abandoned after a 5-second grace period and its terminal is torn down; only in that abandoned case is the execution environment rebuilt.

**REQ-NOTIFY-144** — A suite is bounded: one check per semantic role, and a whole-suite budget, `verifier.suite_timeout`, default 900 seconds, bounding the run end to end. Each check carries its own timeout, default 600 seconds, and no check is given more time than the suite budget has left. A check the remaining budget cannot start is recorded `skipped`, naming the exhausted suite budget in seconds and directing the user to raise it or shorten the checks ahead of it.

**REQ-NOTIFY-145** — Check execution inherits the standard outcome classification, so an exit status of 0 whose output reports test failures is reported as failed; the permission policy, so a denied check is `skipped`, names the rule it violated, and never passes; and sandboxing. The full output of every check is stored under the session's `evidence/verifier/` directory, and suite completion or skipping is recorded as a timeline entry.

### D1. Checkpoints: listing, preview and restore

**REQ-NOTIFY-188** — Checkpoint availability is the engine's verdict and carries its own unavailability reason. A separate blocked reason covers restore refusals not tied to any particular checkpoint; a session still running is currently the only such reason.

**REQ-NOTIFY-189** — A checkpoint preview states whether restoring it requires an explicit overwrite opt-in — the case where dirty paths are present or the blocked reason is forceable — and whether it is restorable at all — the case where there is no blocked reason, or the blocked reason is forceable.

**REQ-NOTIFY-190** — A restore outcome reports whether the restore happened, how many files changed, the sequence number of the pre-restore safety checkpoint with zero meaning none was needed, and any blocking reason.

**REQ-NOTIFY-191** — Preview lines, and the per-path verb in each of them, come from the engine. The presentation layer renders them as given and derives no verb of its own from a status letter.

**REQ-NOTIFY-192** — A request to list checkpoints made while the checkpoint channel is occupied is re-attempted every 150 ms until it can be served, and is not reported as a failure. Preview and restore each display a window-modal progress dialog naming the operation and the checkpoint it concerns, showing indeterminate progress, offering no cancel control, and carrying an accessible name identifying it as checkpoint progress.

**REQ-NOTIFY-193** — Three refusals produce acknowledgements: a restore attempted with no workspace open produces an error acknowledgement saying so; a restore attempted while checkpoints are still being read produces an acknowledgement asking the user to try again shortly; a failed inspection produces an error acknowledgement stating that the checkpoint could not be inspected.

**REQ-NOTIFY-194** — A preview that is not restorable publishes an error notice naming the checkpoint and carrying the engine's blocked reason. A failed restore publishes an error notice naming the checkpoint and carrying the engine's reason, or, where no reason is available, stating that the working tree was left unchanged.

**REQ-NOTIFY-195** — A failed checkpoint listing publishes an error notice stating that the session's checkpoints could not be read and that the session store for this workspace could not be reached, carrying the raw message as copyable detail.

**REQ-NOTIFY-196** — A successful restore publishes a persistent success notice naming the checkpoint and the number of files changed, and stating either which safety checkpoint holds the pre-restore state, or that no safety checkpoint was needed because the tree already matched the last commit. Version-control state and the checkpoint list are refreshed afterwards.

**REQ-NOTIFY-197** — Each opening of the restore preview describes the checkpoint about to be restored now. Content belonging to an earlier restore is never shown again, whether that earlier restore completed, failed or was cancelled.

**REQ-NOTIFY-198** — Cancelling a restore produces an acknowledgement stating that the working tree was not changed.

### D2. Requirement flows abandoned mid-run

**REQ-NOTIFY-161** — A requirement left in a running state by a stopped process is corrected only where three facts hold together: no flow in the current process owns that requirement; no session behind any of its in-flight runs is alive; and nothing has shown a sign of life within the abandonment grace period.

**REQ-NOTIFY-162** — The abandonment grace period is 15 minutes, measured from the most recent of the delivery state's last change time, the flow record's last update time, and each in-flight run's start time. A flow with no run record yet is covered by the first two of those, so a flow started moments ago is never closed.

**REQ-NOTIFY-163** — The correction closes in-flight run records as interrupted, with a failure reason stating that no process owned the run any more and that a recovery pass closed it. Worktree, branch, commits and changed files are left as they are.

**REQ-NOTIFY-164** — The delivery item moves from running to blocked, attributed to a system recovery actor, with a run-failure cause and a reason stating that the run's process is gone and naming the ISO timestamp since which nothing has owned the work.

**REQ-NOTIFY-165** — The recovery pass produces the same result when run again, and returns one sentence per freed requirement in the form `{requirement_id}: Running → Blocked — {reason}`.

**REQ-NOTIFY-166** — Where a session store cannot be opened, or a liveness probe raises, every session is reported live and no correction is made.

**REQ-NOTIFY-167** — A restart rebuilds units, runs and worktrees from persisted state; a run whose process is gone is carried as interrupted rather than running; no requirement is returned to the backlog; the queue resumes where it stopped without re-running a finished unit; and closing the application mid-run and reopening it finds the work where it was left.

**REQ-NOTIFY-168** — A run record that is both terminal and unsuccessful cannot be stored without a stated failure reason.

### D3. Sessions left by a stopped process: detection

**REQ-NOTIFY-146** — A session whose process stops without writing a terminal execution status keeps the status it last wrote. Until it is repaired it reads as active, and every operation requiring a non-busy session — a checkpoint restore, a worktree integration, a session-list action — sees it as busy.

**REQ-NOTIFY-147** — A session is live exactly where its `lock` file exists and the process id recorded in that file is alive.

**REQ-NOTIFY-148** — A session is stale exactly where its execution status is one of `background`, `cancelling`, `pausing`, `running` or `starting` and it is not live. A session carrying a terminal status is never stale, whatever the lock file says.

**REQ-NOTIFY-149** — Two observations, and only these two, make a session read as not live: the `lock` file is absent, or the operating system reports definitively that the process id recorded in it is not running. Every other observation leaves the session reading live, including a `lock` file that exists but cannot be read, one that can be read but records no process id, one recording a value that is not a positive integer, and a query about that process id that fails or returns no answer.

**REQ-NOTIFY-150** — Detection reads session metadata and the `lock` file only. It never reads a state snapshot and never writes. No read path, listing sessions among them, repairs anything.

**REQ-NOTIFY-154** — Asking whether a session's process is alive does not disturb that process. On every supported operating system, and after any number of such questions, a running session continues exactly as before: it is not interrupted, suspended or terminated, it receives no signal, and its output is what it would have been. Three readings are wrong in a stated direction. A session whose process the operating system cannot distinguish from a running one reads live although it has ended. A session whose recorded process id has since been reissued to an unrelated process reads live. A session owned by a process on a different machine sharing the same workspace generally reads not live; running two machines against one workspace is unsupported.

### D4. Sessions left by a stopped process: repair and how it is announced

**REQ-NOTIFY-151** — A repaired session's execution status reads `interrupted`, a value outside the active set of REQ-NOTIFY-148, so the session no longer reads as busy. That status is durable on disk before the orphaned `lock` file is removed. Two consequences are observable: a process dying part-way through a repair leaves the session reading `interrupted` with its `lock` file still present, and never leaves it reading as still running with the `lock` file already gone; and a repair whose lock removal fails still leaves the session usable.

**REQ-NOTIFY-152** — A repair files a warning-severity diagnostics timeline entry attributed to the system actor, naming the previous status and the reason the session was judged not live, and stating that the status was set to `interrupted`.

**REQ-NOTIFY-153** — A session is repaired only when a repair is requested. Requesting a repair of a session that is live, one already carrying a terminal status, or one whose files cannot be read or written leaves it exactly as it was, and is reported as nothing to do — not as an error, and never through an error notice. Requesting it again after a successful repair changes nothing further. A repair can be requested over a whole workspace at once, in which case every session reading stale is repaired and each repaired session is reported on its own line under REQ-NOTIFY-155.

**REQ-NOTIFY-155** — Both command-line clients offer `sessions --repair`, described as marking every session whose process died as interrupted so its checkpoints can be restored and its workspace integrated again. It prints one line per repaired session in the form `repaired {id}  {old_status} -> interrupted  ({reason})`, or a single sentence stating that no session was left marked as running by a stopped process.

**REQ-NOTIFY-156** — The plain session listing appends a stale marker to the status of a stale session.

**REQ-NOTIFY-157** — The desktop treats a stale session as not running and repairs it on the user's action path: where a checkpoint listing shows a session as busy while the process probe reports its process dead, a repair is requested, and is skipped where the repair channel is already busy. On repair, a persistent warning notice states the previous status, the reason, and that the session was marked interrupted so its checkpoints can be restored again, and the session list is refreshed. Afterwards, checkpoints are available, the persisted status reads `interrupted`, and the `lock` file is gone.

**REQ-NOTIFY-158** — A session that is genuinely live stays refused, and the refusal states which claim is being made. Two reasons exist and stay distinct: the session is still running, so a restore would race the run's own writes and the user should wait for it to finish or pause it first; or liveness could not be confirmed, so no restore will be risked and the user should try again shortly. The disabled restore control carries the applicable reason in both its tooltip and its accessible description.

**REQ-NOTIFY-159** — A stale session does not block a worktree integration: the integration's precondition check does not treat it as busy, and the integration proceeds. That check repairs nothing and writes nothing — after it has run, the session's recorded execution status, its `lock` file and its timeline are exactly as they were.

**REQ-NOTIFY-160** — A repaired session presents as not busy. An interrupted session and one that never ran may present alike in the normalised lifecycle vocabulary.

### E1. Board refusals, blockers and standing banners

**REQ-NOTIFY-178** — A requirement that cannot be moved where the user dropped it returns to the column it came from, and the refusal is stated in a message that stays on screen until the user dismisses it or the condition it names is satisfied. That message uses the wording supplied with the refusal, names the precondition that was not met, and states what would satisfy it. A refusal reported only as a transient acknowledgement, and a card that returns with no message, both fail this requirement.

**REQ-NOTIFY-179** — While a card is being dragged, columns it cannot reach are indicated by more than colour.

**REQ-NOTIFY-180** — A refused move is not an error state of the board view and is not counted as a board error.

**REQ-NOTIFY-181** — Each standing feedback entry renders as its own persistent banner with its own severity and its own dismiss control, whose accessible name identifies the requirement whose feedback it dismisses.

**REQ-NOTIFY-182** — Five kinds of blocker exist, each with a defined display and a defined way for the user to answer it. A conflict blocker shows both conflicting requirements together and lets the user choose one of them or open either. A decision blocker shows the question and, for each option, what choosing it leads to, and lets the user choose one. A dependency blocker shows what is being waited for and lets the user open it. A person-stated blocker shows the reason that person recorded and lets the user resume from the point at which the block was raised. A run-failure blocker shows the reason the run gave and lets the user open that run.

**REQ-NOTIFY-183** — A blocker's reason, its question and the consequence of each of its options are displayed word for word as supplied, and the board substitutes no wording of its own. Answering a blocker does not itself perform the work: the answer is submitted as an ordinary board change, subject to the same validation and the same refusal feedback as any other board change under REQ-NOTIFY-178. The requirement then resumes from the state recorded when it was blocked.

**REQ-NOTIFY-184** — A blocker offering the user no choice is still displayed, and still offers at least one thing to do: a blocker waiting on a dependency offers to open that dependency, and a run failure with no retries left offers to open the failed run.

**REQ-NOTIFY-185** — Three further board surfaces exist: a banner listing blocked requirements with a per-row control returning each one; a banner narrating a running board-wide verification pass through the inline progress meter of REQ-NOTIFY-043 with a percentage and a counted label, carrying no action, dismiss or copy control; and a banner offering adoption of newly discovered requirements, whose dismissal means the finding is put away.

**REQ-NOTIFY-186** — The board renders verdicts produced elsewhere and derives none of its own.

**REQ-NOTIFY-187** — Evidence recorded for a requirement reads stale as soon as either value it was recorded against under REQ-NOTIFY-176 stops matching: the recorded commit is no longer the requirement's current commit, or the recorded requirement-text hash differs from the hash of the requirement's current text. Either one alone suffices, so evidence can go stale without the requirement's own text having changed. Stale evidence is never displayed as passing, and detecting it changes the affected requirement's status rather than leaving it untouched.

### E2. Requirement units: failure and bounded retry

**REQ-NOTIFY-169** — A unit whose run failed reads as failed and shows the reason it failed. Every unit reading as failed carries a non-empty reason on every surface it appears on — board, listing, message and persisted record alike — and an attempt to record a unit failure with no reason is refused rather than stored.

**REQ-NOTIFY-170** — The worktree and the branch of a failed unit are kept for inspection and are never removed automatically; only the user removes them.

**REQ-NOTIFY-171** — Retries are counted and bounded, and the bound is stated to the user. `requirements.execution.retry_limit` defaults to 1, giving 2 attempts per unit, and the stated bound reads as a number of attempts and a number of retries.

**REQ-NOTIFY-172** — Where the retry bound is spent, the requirement moves to blocked naming the last failure, and a failed unit never leaves its requirement in a running state. An attempt to retry beyond the bound is an error, not a further silent run.

**REQ-NOTIFY-173** — Re-queuing a unit for retry increases its retry count and leaves the previous failure reason readable on the unit.

**REQ-NOTIFY-174** — A unit failure produces a single-line message in the form `{requirement}/{unit}: attempt {n} failed ({used}/{limit} retries used) — {reason}; work kept at {worktree_path}`.

**REQ-NOTIFY-175** — A unit reads as complete only where every one of the following is recorded as met: its tests were updated and executed; its work is traceable to the requirement it implements; its worktree is clean; its authorship is attributed; and no known drift remains. Values for these supplied in model output are discarded before the result is recorded. A unit whose tool calls the permission policy refused and which produced no commits reads as failed and names the refused tools; it never reads as succeeded. A result meeting some but not all of these conditions names each unmet condition separately.

**REQ-NOTIFY-176** — A unit's verification runs against that unit's own worktree rather than the main workspace, so changes made in the main workspace after that worktree was created do not alter the unit's verdict. The evidence recorded names the commit the verification ran against and a hash of the requirement text it verified, and both are readable from that evidence afterwards.

**REQ-NOTIFY-177** — Abandoning a unit or a requirement is an explicit user action and keeps the record of what was attempted.

### F1. Lifecycle hooks

**REQ-NOTIFY-223** — A lifecycle-hook advisory raised during a run becomes a persistent warning notice whose title states that hooks need attention, carrying the engine's message and an action opening hook settings.

**REQ-NOTIFY-224** — Where a workspace declares hooks the user has not reviewed, a persistent warning notice states how many are unreviewed, states that workspace hooks run shell commands supplied by the repository's own authors, states that those hooks stay skipped until the user reviews and allows them, and offers an action opening the review. While that condition holds, the notice is published once. The review dialog never opens by itself at startup; it opens when the user asks for it.

**REQ-NOTIFY-225** — Both allow and refuse verdicts are persisted, so a refusal holds and the next session does not ask again.

**REQ-NOTIFY-226** — A hook's command text is displayed only inside the review dialog the user opened. It appears in no notice, acknowledgement, tab, tooltip or other surface, and once that dialog is closed it is displayed nowhere.

**REQ-NOTIFY-227** — Hook trust is reported by exactly one of four statements, exactly one of which applies at any moment: the workspace declares no hooks; it declares hooks that have not been reviewed, stating how many under REQ-NOTIFY-224; its hooks have been reviewed and allowed; its hooks have been reviewed and refused. Every surface reporting hook trust uses these four and adds no fifth.

**REQ-NOTIFY-228** — Where a workspace declares no hooks of its own, an acknowledgement states that plainly instead of an empty list being shown.

### F2. Optional components and degraded features

**REQ-NOTIFY-236** — A failing step of first-run machine setup reports the tool it was installing or configuring, the command it ran, the exit status that command returned, and the reason it failed. It offers two choices: run the step again, or carry on without that tool. Setup never comes to rest on a failed step with no choice available.

**REQ-NOTIFY-237** — Choosing to carry on opens the application with exactly the affected feature degraded and everything else intact.

**REQ-NOTIFY-238** — With no network available, setup runs to completion: steps that only inspect the machine still run and report what they found, every step that would have downloaded something reports that the network could not be reached, and the run ends by naming each feature that is degraded and then opens the application.

**REQ-NOTIFY-239** — An optional integration is available where its prerequisite runtime is present on the machine, and unavailable otherwise. The bundled installer never downloads a third-party language runtime to satisfy one.

**REQ-NOTIFY-240** — Setup records completed steps and resumes at the first incomplete step after a crash or a cancellation; it runs once, with per-tool top-ups afterwards; it verifies downloads by checksum; and it never requests elevated privileges.

**REQ-NOTIFY-241** — The command-line client mirrors setup headlessly through `rotaris-cli setup`, printing one line per step and exiting with a non-zero status on failure.

**REQ-NOTIFY-242** — A configured MCP server reports health as one of `checking`, `healthy`, `unknown` or `unreachable`, with a detail string and an optional tool count. Probes run one per server, sequentially, on a background worker, so an unreachable server is one degraded row rather than a settings view that stops responding.

**REQ-NOTIFY-243** — Each of the following costs one feature rather than the application. A missing or unrenderable brand image is replaced by a drawn single-letter mark. A model absent from the context-length registry has its input passed through untruncated, with no default length invented for it. A demo configuration with no persistence service turns each persistence-touching action into an error acknowledgement stating that the action is unavailable in that mode. Legacy whole-state session files remain loadable. Where a provider SDK's exception types are unavailable, error classification falls back to matching failure text under REQ-NOTIFY-067, REQ-NOTIFY-091 and REQ-NOTIFY-094. A malformed skill definition produces a warning and session startup continues. Streaming Markdown renders partial input as readable text and resolves to the correct final rendering once the remainder arrives. `runtime.terminal_stream_enabled` set false costs the live view while the command still runs and still reports its result. A missing or foreign traceability baseline is reported as there being no baseline.

### F3. Project initialization

**REQ-NOTIFY-229** — Project initialization presents all six conditions of REQ-NOTIFY-001: never initialized, listing the tasks that are pending; running; resolved with at least one completed task, as the result condition; resolved with nothing pending and nothing applicable, as the empty condition; a recorded last error alongside tasks still pending, as the actionable failure, where the retry offered re-runs exactly those pending tasks and nothing already completed; and an initialization run that itself failed, as the non-actionable failure, reported as a persistent error notice with copyable detail under REQ-NOTIFY-233 and REQ-NOTIFY-235.

**REQ-NOTIFY-230** — The initialization prompt is raised only for tasks requiring a human answer. Deterministic background tasks never raise it, and it is never raised while initialization is already running.

**REQ-NOTIFY-231** — Re-reading a workspace's configuration while the initialization state is unchanged changes nothing the user can see: the dialog neither opens nor closes, does not reset, keeps any text the user has typed, and a prompt the user has already dismissed stays dismissed. Only a change in the initialization state itself changes what is displayed.

**REQ-NOTIFY-232** — The initialization outcome notice uses each task's own summary sentence where one exists, and otherwise states the number of setup tasks that finished.

**REQ-NOTIFY-233** — The initialization detail block is copyable and is structured as one line per task giving its identifier and its status, one indented line per step giving its name, its status and its detail, and an indented error line where a message exists.

**REQ-NOTIFY-234** — An unrecognised setup task identifier is displayed as its raw identifier.

**REQ-NOTIFY-235** — A failure of a foreground initialization run and a failure of a background initialization run each publish a persistent error notice with copyable detail.

### F4. Providers: health, truthful status and settings-level recovery

**REQ-NOTIFY-199** — Local authentication status is checked, and a provider reporting credentials is validated by calling a free capability endpoint — model discovery, or that provider's equivalent — rather than being trusted.

**REQ-NOTIFY-200** — A provider's status indicator reads exactly one of seven states — `checking`, `coming_soon`, `error`, `healthy`, `unauthenticated`, `unknown`, `warning` — each carrying its own text label distinct from the other six, so the state is readable without colour. A provider reads `healthy` only after the capability call of REQ-NOTIFY-199 has succeeded for it within the current check; one not yet checked reads `unknown`; one being checked reads `checking`; one whose credentials the provider rejected reads `unauthenticated`. A stored credential on its own never makes a provider read `healthy`.

**REQ-NOTIFY-201** — Each provider row offers authenticating or re-authenticating and logging out, and logging out is confirmed first.

**REQ-NOTIFY-202** — Authentication uses a modal that either prompts for an API key without echoing it or presents device-code or browser instructions, validates the credential before saving it, and persists discovered models as the command-line login does. Device and browser instructions include the target URL rendered as an activatable link and the code to enter, and state that the browser may have opened already.

**REQ-NOTIFY-203** — Network and authentication work runs off the interface thread. Every exception it raises is surfaced to the user, and failures appear in the provider's own row or in the modal that triggered them, never as an application-level crash and never as a silent no-op.

**REQ-NOTIFY-204** — A status line reporting a failure still reads as a failure after the colour theme changes while it is on screen: both its wording and its failure presentation survive the change, and a visible error is never repainted as an ordinary progress message.

**REQ-NOTIFY-205** — A model the provider reports as unavailable stays in the model list, marked unavailable, with one sentence in the provider's own wording stating why it is unavailable and what the user can do about it. Unavailable models are never dropped, so the list continues to name every model the provider accounts for.

**REQ-NOTIFY-206** — Across a provider-health update the settings list is steady: rows keep their order and their place on screen, the list's scroll offset is unchanged, and any selection or keyboard focus inside the list is where it was. A row whose displayed values did not change does not visibly change.

**REQ-NOTIFY-207** — A subscription-limits refresh that fails, or that finds the provider still unauthenticated, leaves the previously displayed values in place and raises no error.

**REQ-NOTIFY-208** — An empty provider list shows a quick-start empty state carrying a per-provider quick-start destination.

**REQ-NOTIFY-209** — Hosted-cloud credit is displayed in each of its four phases — `error`, `loading`, `ready`, `signed_out` — and none of the four renders as blank or as an absence. In the ready phase the balance carries one of four labels: Funded, Out of credit, Overdrawn, Unknown state. A ready balance that cannot fund the next call is displayed as unable to proceed rather than as funded. A failed read displays its technical detail in copyable form rather than a paraphrase of it. The balance is displayed as an absolute amount of credit, never as a percentage or a proportional meter.

**REQ-NOTIFY-210** — Provider identity used by settings and by the authentication and quota recovery surfaces — connection mode, destination, operator, privacy information — comes from one runtime provider catalog, and from no second list held in the interface.

### G1. Application updates

**REQ-NOTIFY-211** — Only standalone packaged builds check for an update; an installation made by a package manager does not check.

**REQ-NOTIFY-212** — The application checks once per launch against the vendor's published release feed and abandons the check after at most 10 seconds. Where the network cannot be reached, or the feed has not answered within that time, startup is unaffected: no notice, no acknowledgement and no error appears, nothing waits on the check, and the user is asked nothing.

**REQ-NOTIFY-213** — A non-success or malformed response, a missing release and a rate-limited request included, is logged, and nothing the user can see is disrupted.

**REQ-NOTIFY-214** — Versions are compared as semantic versions, and prereleases and drafts are ignored. No user-facing opt-out from checking exists.

**REQ-NOTIFY-215** — Where a newer version is found, a non-blocking persistent info notice offers it once the main window is visible, naming the version, carrying the release summary or, where none exists, directing the user to the full release notes, and offering an action that installs it.

**REQ-NOTIFY-216** — Closing the update notice without choosing is itself the answer that the user is to be reminded at the next launch. The dismissed version is persisted, and only that version is suppressed; a newer version is offered again.

**REQ-NOTIFY-217** — The update notice's identifier is retained, so dismissing an unrelated notice never records a dismissed version. The dismissed version is recorded before the notice is cleared.

**REQ-NOTIFY-218** — Download progress is reported inside the notice that made the offer: its title names the version being downloaded, and its body states the percentage complete and that the download will be verified against the published checksum when it finishes. Where the total size is unknown, downloaded megabytes are stated instead. Progress text is updated only on whole-percent changes.

**REQ-NOTIFY-219** — A downloaded update is installed only after its SHA-256 digest has been compared with the digest published for that release in `SHA256SUMS.txt` and the two match. Where they differ, the update stops, the installed application is left exactly as it was, and the failure is reported under REQ-NOTIFY-221. No signature is verified: a matching digest establishes that the download is the published file and nothing about who published it.

**REQ-NOTIFY-220** — Installation follows the package flavour: a portable Linux bundle is replaced in place; a portable Windows executable is moved aside and the new one put in its place; an installed Windows build launches its installer and the application exits; a macOS disk image is mounted and revealed for the user to complete the move.

**REQ-NOTIFY-221** — A failed update publishes a persistent error notice stating that the update was not installed, that the application is unchanged, and that the user can try again or download the release manually, with copyable detail and a retry action.

**REQ-NOTIFY-222** — A completed update publishes a persistent success notice. Where the application can restart itself, that notice offers a restart action. Where an external installer must take over, the notice states instead that the installer will finish the update, and the window closes on its own 1200 ms after the notice appears, with no user action. Where a restart the user asked for does not happen, the failure notice of REQ-NOTIFY-221 is published in its place.

### G2. Window chrome and attention state

**REQ-NOTIFY-249** — The title bar carries session status as a single tag-styled chip combining the status indicator and the status word, never as a free-floating dot beside a word.

**REQ-NOTIFY-250** — A subordinate indicator one size step smaller than the status chip reports background post-run improvement analysis, labelled to state that a review is in progress and describing that the user can continue working. It is shown only while that analysis is in flight.

**REQ-NOTIFY-251** — Post-run improvement analysis never blocks or alters a run. On failure, or on exceeding `runtime.improvement_collector_timeout`, default 60 seconds, it yields an empty artifact.

**REQ-NOTIFY-252** — A run waiting on a person — for an approval it raised, or for an answer to a question it asked — is displayed as awaiting input. This holds for every session and not only the focused one, so a background run waiting for an answer is visibly waiting without being focused first. One sentence states that condition, worded identically on every surface that states it, and where the condition does not hold that sentence appears nowhere.

**REQ-NOTIFY-253** — Where a todo edit cannot be written through to the live run, the persisted session state is reloaded and the user is told that the todo changed elsewhere and that the latest session state was loaded.

## Data & Formats

### Session directory contents

Paths are listed alphabetically; the order carries no meaning.

| Path | Content |
| --- | --- |
| `.message_limit_paused` | Present while a background run is paused at its message limit |
| `evidence/` | Raw debug and conversation logs; a run log path is retained as a compatibility pointer |
| `evidence/verifier/` | Full output of every verification check |
| `issues.json` | Diagnostics issues with severity, message and metadata |
| `lock` | JSON object carrying a process id and an acquisition timestamp; its presence plus a live process id defines liveness |
| `metadata.json` | Session metadata, execution status included |
| `metrics.json` | Session metrics |
| `state/` | Split state files: resume state, run configuration, transcript for display |
| `summary.md` | Human-readable session summary |
| `timeline.jsonl` | Compact JSON-lines event timeline |

Session snapshots and diagnostics live under the main workspace and never inside a worktree. Legacy whole-state session files remain loadable; new sessions do not write them. The per-session debug log level defaults to WARNING.

### Persistent notice shape

`{ id, severity: info|success|warning|error, title, message, details, persistent: bool, action_label, action_id, session_id }`. `details` is the copyable technical block. An empty `session_id` scopes the notice to the focused run.

### Notice action vocabulary

A notice action is carried as an opaque identifier chosen by the implementation. The vocabulary it must express is the one given in REQ-NOTIFY-044: focusing a named session, parameterised by session identifier; initializing or resolving a project; installing a pending update and restarting after one; navigating to a named view; opening settings at a named tab, the hook-settings tab included, and saving settings; opening the library at a named tab, artifacts and proposals included; retrying the failed run; reverting a recorded proposal review decision, parameterised by the artifact, the proposal and the prior decision. An action carrying a parameter encodes that parameter alongside the action, so the handler acts without a further lookup.

### Status vocabularies

Members are listed alphabetically except where a severity ordering is stated.

- Normalised run lifecycle: `cancelled`, `cancelling`, `completed`, `failed`, `idle`, `paused`, `pausing`, `running`, `starting`.
- Persisted execution statuses treated as active: `background`, `cancelling`, `pausing`, `running`, `starting`. Post-crash repair writes `interrupted`, which is outside that set. A background run paused at its message limit carries `paused_message_limit`.
- Terminal child states: `blocked`, `cancelled`, `failed`, `succeeded`.
- Transcript tool row status: `blocked`, `failed`, `ok`, `running`.
- Notice severity, ascending: `info`, `success`, `warning`, `error`. Acknowledgement kind, ascending: `info`, `ok`, `warn`, `fail`.
- Verification verdict: `failed`, `passed`, `skipped`; `invalid` additionally exists as a check outcome. Completion gate decision: `exempt`, `gated`, `passed`.
- Provider status: `checking`, `coming_soon`, `error`, `healthy`, `unauthenticated`, `unknown`, `warning`.
- Hosted-cloud credit phase: `error`, `loading`, `ready`, `signed_out`. Credit label: Funded, Out of credit, Overdrawn, Unknown state.
- MCP server health: `checking`, `healthy`, `unknown`, `unreachable`.

### Report artifact read by a parent in place of a child transcript

Typed JSON requiring at least `agent_name`, `persona` and `status`, optionally carrying verification evidence with its verdict and per-check results, gate state, and repair decision. Those optional fields are set by the execution runtime alone and are stripped from model output.

### Timeline and diagnostics entries produced by this domain

Each is a distinctly typed record in the session timeline or the diagnostics log. Type naming is left to the implementation; the set must be distinguishable. Listed alphabetically by what each records:

- a completion-gate decision;
- a post-crash status repair of a session;
- a provider marked exhausted for the session;
- a quota-driven model change, and the quota fallback that caused it;
- a repair attempt being scheduled, and repair escalation once the budget is spent;
- the start of an orchestration iteration;
- a transient model failure that was retried automatically;
- verification suite start, per-check start, per-check finish, and suite completion or skipping.

### Command-line output formats

- Headless setup: one line per step; a non-zero exit status on failure.
- Recovery-pass sentence, one per freed requirement: `{requirement_id}: Running → Blocked — {reason}`.
- Repaired session line: `repaired {session_id}  {old_status} -> interrupted  ({reason})`; where nothing was repaired, a single sentence stating that no session was left marked as running by a stopped process.
- Session listing: a stale marker appended to the status of a stale session.
- Unit failure line: `{requirement}/{unit}: attempt {n} failed ({used}/{limit} retries used) — {reason}; work kept at {worktree_path}`.

### Retry-after forms accepted from a provider

An explicit retry-after value carrying a unit suffix of `s`, `sec`, `seconds`, `m`, `min` or `minutes`; and the plain-language phrasing `try again in N \<unit\>`. Minutes are converted to seconds, and the effective wait is at least 1 second.

### Configuration keys named in this document

| Key | Default |
| --- | --- |
| `message_limit` | null or 0, meaning disabled |
| `requirements.execution.retry_limit` | 1, giving 2 attempts |
| `runtime.auto_retries_transient` | 1 |
| `runtime.auto_retries_validation` | 0 |
| `runtime.child_stall_timeout` | 90 s |
| `runtime.child_timeout` | 1200 s |
| `runtime.improvement_collector_timeout` | 60 s |
| `runtime.llm_response_timeout` | 120 s, minimum 30 s |
| `runtime.session_log_level` | WARNING |
| `runtime.terminal_stream_enabled` | true |
| `verifier.author_gate` | true |
| `verifier.checks` | unset |
| `verifier.gate_completion` | true |
| `verifier.max_repair_attempts` | 2 |
| `verifier.suite_timeout` | 900 s |
| `workspaces/{workspace_path}/composerDraft` | empty |

### Consolidated thresholds and timings

Rows are listed alphabetically by behaviour; the order carries no meaning.

| Behaviour | Value |
| --- | --- |
| Abandoned requirement flow, grace period | 15 minutes |
| Acknowledgement lifetime | 4200 ms |
| Acknowledgement width, single form / stacked form | at most 520 px / 360 px |
| Acknowledgements visible at once, stacked form | 3 |
| Checkpoint listing re-attempt while the channel is busy | 150 ms |
| Child task, no output produced | 90 s |
| Child task, total run | 1200 s |
| Interrupted verification check, grace before abandonment | 5 s |
| Loop activation cycle, end to end | 2 s |
| Loop classification call | 20 s |
| Loop escalation | more than 2 consecutive activations |
| Loop repetition trigger | 4 identical action signatures, or a 2–4 action cycle repeated 3 times |
| Loop volume backstop | 60 tool calls, 60 messages |
| Model response, fallback trigger | 120 s, minimum 30 s |
| Post-run improvement analysis | 60 s |
| Provider-supplied retry-after | overrides local backoff, minimum 1 s |
| Quota wait, base / cap / growth | 60 s / 300 s / doubling per attempt |
| Requirement unit retries | 1 retry, giving 2 attempts |
| Session polling, followed session / owned-session reconcile | 750 ms / 2000 ms |
| Shell command | 100 s |
| Stall-recovery messages per child task | 1 |
| Summary generation | 120 s |
| Tool call | 30 s |
| Transcript row-growth publish throttle | 50 ms; new rows publish immediately |
| Transient auto-retries / delay per retry | 1 / attempt number in seconds, capped at 2 s |
| Update check | at most 10 s |
| Validation auto-retries | 0 |
| Verification, per check | 600 s |
| Verification, whole suite | 900 s |
| Verification repair attempts | 2 |
| Window close after installer hand-off | 1200 ms |

## Open Questions

### Behaviour not yet settled

1. Rendered outcome where several producers publish a notice within one event-loop turn, beyond newest-wins and the cross-session rule of REQ-NOTIFY-029.
2. Whether the stacked acknowledgement surface of REQ-NOTIFY-016 through REQ-NOTIFY-022 is reachable in the shipped desktop product, or whether one acknowledgement at a time is all that ships. Both contracts are stated here.
3. What the desktop shows while a run is suspended in a quota wait under REQ-NOTIFY-083, REQ-NOTIFY-086 and REQ-NOTIFY-087, as distinct from having failed. The wait decision surface is stated for the interactive terminal host only.
4. Row-level wording of provider failure presentations in settings (REQ-NOTIFY-200, REQ-NOTIFY-203). The status vocabulary and the threading rule are settled; the microcopy is not.
5. Refresh cadence of update download progress where the server omits a content length (REQ-NOTIFY-218).
6. What the user sees when the diagnostics view itself cannot read or render its data.
7. Whether notice identifiers or notice content survive re-creation of the main window within one process (REQ-NOTIFY-025, REQ-NOTIFY-027).
8. Which terminal run statuses produce the plain transient acknowledgement of REQ-NOTIFY-059 rather than a notice.
9. The desktop path for a session carrying `paused_message_limit` (REQ-NOTIFY-248).
10. Which surface reports the run channel's refresh-failure signal.
11. Whether `interrupted` warrants a presentation of its own rather than presenting as `idle` (REQ-NOTIFY-049, REQ-NOTIFY-160).

### Requirements that contradict one another

12. REQ-NOTIFY-044 places initializing or resolving a project in the notice action vocabulary, and REQ-NOTIFY-229 requires initialization's actionable-failure condition to offer a retry of its pending tasks; REQ-NOTIFY-047 forbids any notice action that writes into the user's project. Which is canonical?
13. REQ-NOTIFY-003 requires every failure, refusal and recovery-bearing outcome to stay readable, and REQ-NOTIFY-028 treats a notice about another session as unread; REQ-NOTIFY-024 keeps one notice and lets a later publication discard it. Must a replaced notice stay retrievable somewhere, or is single-slot replacement canonical?
14. REQ-NOTIFY-032 gives a non-focused run's failure severity `warning`, while REQ-NOTIFY-065 requires every error notice, run failure included, to carry severity `error` with the persistent flag set. Also open: whether such a failure additionally produces the classification notice of REQ-NOTIFY-060, and if so which of the two survives on screen under REQ-NOTIFY-024.
15. REQ-NOTIFY-049 has no entry for `paused_message_limit`, so the status written by REQ-NOTIFY-248 presents as `idle` while the run is paused and a command-palette entry for continuing it is enabled. Should it map to `paused`, to `idle`, or to a value not yet in the vocabulary?
16. REQ-NOTIFY-106 bounds a whole activation cycle at 2 seconds while REQ-NOTIFY-100 allows the loop-classification call 20 seconds. Is the classifier cut short at the cycle budget and treated as a failed classification under REQ-NOTIFY-109, or does the 2-second bound exclude that call?
17. REQ-NOTIFY-146 states that an unrepaired stale session is seen as busy by a worktree integration, while REQ-NOTIFY-159 states that a stale session never blocks one. Confirm that REQ-NOTIFY-146 describes the pre-repair reading only and that REQ-NOTIFY-159 binds the integration gate.

### Values left open

18. REQ-NOTIFY-012 — the corner of the host window an acknowledgement anchors to, and the pixel size of its margin from the window edges.
19. REQ-NOTIFY-014 — which border treatment separates the error presentation of an acknowledgement from the neutral one: colour, weight, and which edges are drawn.
20. REQ-NOTIFY-022 — the direction and the duration of the default entry animation.
21. REQ-NOTIFY-035 — the numeric width of a persistent notice's border. Only the 3× ratio of the left rule to that border and the contrast floors are fixed.
22. REQ-NOTIFY-019 and REQ-NOTIFY-041 — the text joining the severity or kind word to the title in an accessible name, and the body to the technical detail in an accessible description.
23. REQ-NOTIFY-044 — the full sets of view names, settings-tab names and library-tab names a notice action may target. This document names the workspace view, the artifacts and proposals library tabs, and the model-settings and hook-settings tabs.
24. REQ-NOTIFY-082 — which tier applies where the model that hit its usage limit has no recorded role of `small_model`, `medium_model` or `large_model`.
25. REQ-NOTIFY-098 — the ordered set of structured-output formats, and therefore which format is the next one a provider accepts.
26. REQ-NOTIFY-100 — the configuration key names for the tool-call, shell-command and summary-generation bounds.
27. REQ-NOTIFY-108 — what constitutes an action signature: which properties of two actions must be equal for repetition detection to count them the same.
28. REQ-NOTIFY-112 — which child-task outcomes are recovery-eligible, and therefore which earn the single lack-of-progress message.
29. REQ-NOTIFY-137 — what counts as a gate-authoring note found in the workspace, and therefore which of the two fixed sentences applies.
30. REQ-NOTIFY-175 — what counts as known drift for the unit completion contract.
31. REQ-NOTIFY-182 — what the board displays, and what it lets the user do, for a blocker whose kind is none of the five defined kinds.
32. REQ-NOTIFY-187 — which status a requirement takes when its evidence is found stale, and what the user sees while the resulting re-verification is outstanding.
33. REQ-NOTIFY-192 — whether the 150 ms re-attempt of a checkpoint listing is bounded, and what the user sees if the channel never becomes free.
34. REQ-NOTIFY-200 — the conditions under which a provider reads `warning`, `error` or `coming_soon`. Entry conditions are stated for `unknown`, `checking`, `healthy` and `unauthenticated` only.
35. REQ-NOTIFY-209 — whether a ready balance that cannot fund the next call takes one of the four credit labels or a fifth of its own.
36. REQ-NOTIFY-224 — the scope over which the unreviewed-hooks notice counts as published once: per workspace, per launch, or per declared set of hooks.
37. REQ-NOTIFY-227 — which of the four hook-trust statements applies where a workspace gains further hooks after a review, so that some are reviewed and some are not.

