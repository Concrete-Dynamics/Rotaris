# Notifications, Error Handling, and Recovery — A9. What a notice can offer the user

Part 2 of 7 of [domain 19](../19-notifications-errors-recovery.md), which indexes every part. Defines REQ-NOTIFY-044 – REQ-NOTIFY-263.

### A9. What a notice can offer the user

**REQ-NOTIFY-044** — A notice action comes from a fixed vocabulary, and activating one produces the stated result: focus a named session; open the project-initialization surface for a named workspace; install a pending update; open a named view; open settings at a named category; open the hosted-cloud account surface; open the library at a named tab; open the hook review for a named workspace, which REQ-NOTIFY-224's unreviewed-hooks notice offers; start the guided provider setup of REQ-WORKSPACE-152, at its catalog step or, where the action names a provider, at the authentication step for that provider; restart after an update has been installed; retry the failed run under REQ-NOTIFY-045; revert a recorded proposal review decision; save settings. No action in this vocabulary writes into the user's project: the project action navigates only, and initialization itself is started from the surface it opens, per REQ-NOTIFY-047; the hook-review action opens the review and allows nothing, the decision being taken in the review dialog of REQ-HOOKS-106; and the provider-setup action opens a flow that acts on the application's own credential store and on nothing in the project. The named view is one of the primary views fixed by REQ-SHELL-023, the named settings category is one of the identifiers fixed by REQ-CONFIG-269, the named library tab is one of the tab names fixed by REQ-LIBRARY-103, and the named provider is one the runtime provider catalog of REQ-NOTIFY-210 declares; this document adds no view, category or tab of its own, and an action naming a value outside the owning domain's vocabulary is not dispatched. An action concerning a particular object — a session, a workspace, a settings category, a library tab, a provider, a proposal decision — carries that object's identity, and activating it acts on that object without asking the user anything further. *Amended 2026-09-06 under ESC-34: the vocabulary named eleven actions and could express neither the review the notice of REQ-NOTIFY-224 must offer nor the guided setup the first-launch notice of REQ-WORKSPACE-152 (3) must start — the nearest member, opening settings at a category, reaches the surface beside each and not the surface itself, and REQ-WORKSPACE-152 draws that distinction deliberately between its clause (2), which leads to Settings, and its clause (3), which starts the flow. The notice pipeline's first execution (ADR-0049, Part V) built both actions and found the list closed against them. Ruled on the precedent of resolution 12, where this vocabulary was corrected to match REQ-NOTIFY-047 rather than the other way round: the enumeration had fallen behind the behaviour. Neither member weakens the closed property above.*

> **Narrowed by [`PD-STARTUP-008`](../../product/directives/pd-startup-008.md#pd-startup-008), 2026-10-22.** The vocabulary gains one action: cancel the running update download
> (REQ-STARTUP-170). No other action is added, and the closed property and every other clause still govern.
  > **Extended by [`PD-SHELL-001`](../../product/directives/pd-shell-001.md#pd-shell-001) revision 2, 2026-10-13.** An action naming a
  > workspace surfaces the main window holding it, else adds one for it on PD-SHELL-001's add terms (no gate, nothing
  > asked, nothing closed), and opens its surface there.
  > *Amended in place 2026-10-14 (revision 3, [OQ-292](../../architecture/open-questions/59-spikes-and-later-questions-26.md#oq-292)):* "focus a named session"
  > carries the session's workspace as well — in Data & Formats, "parameterised by session identifier and its workspace" —
  > taken from the run host's record of the session's root, and takes the same reach; the session is focused in the window
  > surfaced or added. A notice whose session's workspace is not known carries no action.

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

**REQ-NOTIFY-076** — The recovery dialog's second path re-authenticates the provider that failed. For key-based providers it offers a masked key field with a save-and-retry control enabled only while the field is non-blank. For browser and device-code providers it starts that provider's own flow in place, on the terms of REQ-NOTIFY-202, and offers a control confirming that re-authentication has been completed. Either submits a re-authentication request naming the provider, with an empty key for the external flows. No path in this dialog directs the user to a shell, a terminal or a separate program.

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

**REQ-NOTIFY-065** — Every error notice carries severity `error`, has its `persistent` flag set, and carries copyable detail. Producers include checkpoint listing and restore failure, context compression that did not complete, project-initialization failure, prompt-history save failure, run-channel refresh failure, run failure, slash-command failure, transcript-clear failure, update-install failure, version-control refresh failure, and worktree creation and deletion failure. A run-channel refresh failure is reported here and on no other surface; the notice carries the session identifier of the channel that failed, and the values already displayed for that session are left standing rather than blanked, so a refresh that could not be completed never presents as a run with no state. This requirement governs error notices; the attention notice REQ-NOTIFY-032 raises about a run that is not focused is not one of them, and its severity is fixed there.

**REQ-NOTIFY-066** — The composer draft is stored per workspace under the registered preference key `workspaces/{workspace-key}/composerDraft`, whose spelling belongs to the closed registry REQ-SHELL-006 makes and whose default and write behaviour are REQ-SHELL-159's; this domain restates none of them. What this domain relies on is that the draft outlives a run failure, a view change and an application restart, so it remains available to the retry action of REQ-NOTIFY-045.

### B3. Loop and stuck-state supervision

**REQ-NOTIFY-102** — Where no loop occurs, a run with supervision enabled is indistinguishable from the same run with supervision disabled: no corrective message appears in the conversation or the transcript, no supervision entry appears in the session timeline or in diagnostics, and no transcript row is attributable to supervision.

**REQ-NOTIFY-103** — On a loop being declared, a corrective message is placed in the session's own context, either directing the agent to different work or requiring it to re-examine its current approach. The message is composed for that activation from that session's recent context: two activations whose recent context differs produce different text, and the text is not drawn from a fixed set of alternatives. It names no supervision feature, no loop detection and no component. It is placed in the session context only and is never presented to the user as a message in its own right.

**REQ-NOTIFY-104** — Detection counters reset after each activation. Consecutive activations with no user instruction between them are counted, and a new user instruction resets that count.

**REQ-NOTIFY-105** — More than two consecutive activations with no intervening user instruction end the session. The stop is reported as an escalation naming three facts: the session, the number of consecutive activations, and that repeated looping caused it.

**REQ-NOTIFY-106** — At most 2 seconds pass between a session's recent activity satisfying the criteria of REQ-NOTIFY-108 and the corrective message of REQ-NOTIFY-103 being present in that session's context. That budget is end to end and binds every step inside it, the classification call included: the classifier is allowed whatever remains of the 2 seconds when it is dispatched, and exceeding that is a failed classification handled by REQ-NOTIFY-109 rather than a missed budget.

**REQ-NOTIFY-107** — Supervision state belongs to one session and is never read or written by another.

**REQ-NOTIFY-108** — Whether two of an agent's actions count as the same action, and the repetition, cycle and volume triggers that fire from that comparison together with the order they are evaluated in, are fixed by REQ-ORCH-101. This domain relies on that requirement and states no comparison rule, no trigger, no threshold and no evaluation order of its own. What it relies on in particular is that no part of an action's content is disregarded when two actions are compared: two long tool calls differing only near the end of their arguments are different actions, and no truncation and no normalisation of the compared text may make them the same. An agent's assistant messages count as actions for this purpose alongside its tool calls, compared by their full text on those same terms. The default figures behind the triggers — the repetition and cycle counts, the volume backstop, the two combination modes and their weights, the recent-event window and the length of transcript examined — are REQ-ORCH-100's, and this document holds no copy of any of them. Where supervision reads a session's recent activity it reads it on those terms and on no others.

**REQ-NOTIFY-109** — Where the classifier call fails, the decision is made from the collected signals alone: a repetition trigger declares a loop; a volume trigger declares a loop only where repeated assistant messages or back-to-back invocations of the same tool corroborate it, and never from the counts by themselves.
  > **Narrowed by [`PD-ORCH-016`](../../product/directives/pd-orch-016.md#pd-orch-016), 2026-10-07.** "Back-to-back invocations of
  > the same tool" corroborate a volume trigger only when they are the same action by REQ-ORCH-101's comparison — the same
  > tool name and identical whole arguments. The rest of the requirement governs as written.

**REQ-NOTIFY-110** — A configuration setting turns supervision off. While it is off, a run proceeds with no corrective message injected, no loop escalation, and no supervision entry in the timeline or in diagnostics, and the absence is reported neither as an error nor as a degraded state. A configuration that omits the setting behaves as enabled. Changing the desktop's runtime toggle applies to runs started afterwards; a run already under way is unaffected.

**REQ-NOTIFY-111** — A child task reporting a stuck condition it can recover from — one of the recovery-eligible conditions listed in REQ-NOTIFY-112 — does not end as a failure: it receives a corrective instruction and resumes from where it stopped. The third such recovery within one child task escalates on the terms of REQ-NOTIFY-105. A child task reporting a condition it cannot recover from fails immediately, with no corrective attempt. Where no corrective instruction can be composed for a recoverable stuck condition, a fixed instruction addressing a repeated read-then-edit cycle is used in its place and the task continues.

**REQ-NOTIFY-112** — An outcome is recovery-eligible exactly where the child did not reach `succeeded` and its last reported condition is one an instruction can address: it produced no output within `runtime.child_stall_timeout`; a single tool call or shell command exceeded its own bound under REQ-NOTIFY-100 while the child's own bound was still unspent; it reported incomplete work with its iteration allowance spent; or it repeated a read-then-edit cycle without producing a commit. Every other outcome is not recovery-eligible and earns no corrective message: `cancelled`; `blocked`; an authentication failure; a quota exhaustion; a refusal by the permission policy; a validation error in the task definition; and the child's own total bound `runtime.child_timeout` being exceeded. Separately from loop supervision, a child task ending in a recovery-eligible outcome receives at most one corrective message about its lack of progress. The count is per child task, so a second such message is never sent to the same child however often the outcome recurs. A child task on an answer-only route receives none.

### B4. Message limits

**REQ-NOTIFY-244** — The value space and default of `message_limit` are registered by REQ-CONFIG-112; this domain cites that registration and states no value space and no default of its own. What it relies on is that the key may carry no limit at all and does so by default: where it carries none, no run is paused at a limit, no background run records the paused status of REQ-NOTIFY-248, and the confirmation of REQ-NOTIFY-266 is never raised.

**REQ-NOTIFY-245** — The message count increases by one per completed orchestration iteration and is stored in session state, so it survives a crash and a later reopening of the session. Iterations already counted are never put to the user again.

**REQ-NOTIFY-246** — The limit is evaluated between iterations. While a run is paused at its limit, no model request is dispatched and no child task is spawned.

**REQ-NOTIFY-247** — *Withdrawn.* Its only surface was a text-mode confirmation addressed by single-key bindings, which this product does not have; the confirmation at the message limit is carried by REQ-NOTIFY-266.

**REQ-NOTIFY-248** — A background run pauses itself at the same boundary: the execution status becomes `paused_message_limit`, durably recorded before the run stops, and the session stays paused indefinitely until the user acts on it. The recorded status is the whole of the signal — no separate marker is written anywhere for another process to find, and none is needed, because the condition is recoverable from the session's record alone after the application has been closed and reopened (REQ-SESSION-107, REQ-ORCH-087). That status presents as `paused` under REQ-NOTIFY-049, so the session reads as paused rather than idle and is not busy under REQ-NOTIFY-050. Focusing such a session presents the confirmation of REQ-NOTIFY-266 at once, and a command-palette entry for continuing a paused session is enabled only in that state.

**REQ-NOTIFY-266** — The confirmation at the message limit is a window-modal dialog belonging to the session that reached the limit. It states the current message count, the limit in force and the estimated token usage the run has accrued, and it offers exactly three choices as controls: continue the run, double the limit, and cancel the run. Initial keyboard focus rests on continuing; Escape performs cancelling the run and marks that control as destructive under REQ-NOTIFY-053. No choice is available by a bare single-letter keystroke. While the dialog stands the run remains paused, no model request is dispatched and no child task is spawned, per REQ-NOTIFY-246. A run other than the focused one reaching its limit raises a persistent `info` notice naming that session and offering an action focusing it, rather than opening the dialog over unrelated work.

### B5. Quota and usage limits

**REQ-NOTIFY-081** — Usage-limit responses, HTTP 429 among them, are handled during execution and do not reach the user as a raw failure.

**REQ-NOTIFY-082** — Where a model reports a usage limit and another model of the same tier is offered by a different provider, execution continues on that other model without asking the user. Tier is the role recorded for the exhausted model: `small_model`, `medium_model` or `large_model`. A candidate is a model whose recorded role equals the exhausted model's role and whose provider differs from the exhausted model's. Candidates are taken configured-first and then discovered, and a model present in both is considered once. Where the exhausted model carries no recorded role, or carries one outside those three, no candidate can equal it and the candidate set is empty: no role is inferred or guessed for it, no automatic fallback is attempted, and the run enters the wait state of REQ-NOTIFY-083 directly.

**REQ-NOTIFY-083** — Where the fallback model also hits a limit, or where no fallback exists, the run is suspended in a wait state; it does not fail. The wait is presented, and the user's choices during it are offered, under REQ-NOTIFY-263.

**REQ-NOTIFY-084** — Where the provider supplies retry-after or rate-limit-reset information, the resume time is taken from it, with a floor of 1 second. Accepted forms are an explicit retry-after value carrying a unit suffix for seconds or minutes, and the plain-language phrasing `try again in N <unit>`; minute units are converted to seconds.

**REQ-NOTIFY-085** — With no usable retry-after information, the wait is computed locally and determined entirely by the attempt number, with no randomisation: 60 seconds for the first attempt, doubled for each further attempt, capped at 300 seconds.

**REQ-NOTIFY-086** — *Withdrawn.* Its only surface was a full-screen text-mode host addressed by single-key bindings, which this product does not have; the quota-wait decision surface is carried by REQ-NOTIFY-263.

**REQ-NOTIFY-087** — Where auto-resume is permitted, the wait ends by itself once the computed interval has elapsed, and execution retries. Where auto-resume is not permitted, the wait continues until the user decides, through the choices REQ-NOTIFY-263 offers.

**REQ-NOTIFY-088** — A structured provider quota-exhaustion error — `insufficient_quota` or `insufficient-quota`, or plain-language exhaustion such as an exceeded current quota or a direction to check plan and billing — marks that provider and model exhausted for the rest of the session. Auto-resume onto it is refused, and recovery requires a different eligible model or an explicit choice by the user.

**REQ-NOTIFY-089** — A model chosen by hand during a wait is kept for the rest of the session and overrides the tier whose quota was exhausted, so later calls in that session do not return to the exhausted model.
  > **Narrowed by [`PD-ORCH-013`](../../product/directives/pd-orch-013.md#pd-orch-013), 2026-10-06.** The model chosen during a wait
  > is kept for the rest of the session unless the user later chooses the exhausted model explicitly for the entry agent;
  > that choice takes the override back, and later calls may then return to the model chosen.

**REQ-NOTIFY-090** — Quota recovery leaves inspectable evidence: a timeline entry for a quota-driven model change; a warning-severity diagnostics issue naming the requested model, the fallback model and whether the provider is exhausted; and, where a wait is entered, a diagnostics issue recording the attempt number, the model, the computed wait in seconds, whether auto-resume is allowed and whether the provider is exhausted.

**REQ-NOTIFY-091** — A failure counts as rate limiting where the provider raises its own rate-limit exception type, or where its failure text contains `429`, `rate limit` or `too many requests` as a substring, compared ignoring case. Quota exhaustion is classified under REQ-NOTIFY-088 and is never reported as rate limiting. Where the provider's quota error identifies the exhausted model, that model name appears in the message required by REQ-NOTIFY-092; where it does not, that message states the condition and omits the model name.

**REQ-NOTIFY-092** — Every runtime error the user reads names both the condition and the next step, and one condition yields one wording: two occurrences of the same condition differ only in the values substituted into the text. By condition: quota exhaustion names the exhausted model, states that retrying the same provider and model will keep failing, and directs the user to switch model or add credit to the provider account; rate limiting states the interval to wait where the provider supplied one under REQ-NOTIFY-084 and otherwise directs the user to wait, naming no interval; provider unavailability states that the provider is temporarily unreachable and directs the user to retry, naming no interval; a credential or HTTP header containing a non-ASCII character directs the user to enter the provider key again using its exact ASCII value; a rejected request parameter names the parameter, and, where the backend accepts only a reduced parameter set, states that as well.

**REQ-NOTIFY-093** — On the desktop, a quota or rate-limit condition that ends a run is reported through the failure classification of REQ-NOTIFY-062 and REQ-NOTIFY-063.

**REQ-NOTIFY-263** — A run suspended in the quota wait of REQ-NOTIFY-083 is presented as waiting, never as failed and never as idle. Its normalised lifecycle state stays `running`, so the run stays busy under REQ-NOTIFY-050 and the composer stays locked under REQ-NOTIFY-051. The run header states that the run is waiting on a provider limit; names the provider and the model whose limit was reached; states whether that provider is marked exhausted under REQ-NOTIFY-088; and, where a resume time is known under REQ-NOTIFY-084 or REQ-NOTIFY-085, counts the remaining time down continuously rather than only when a new event arrives. Where auto-resume is not permitted it states instead that the run resumes only when the user decides. Exactly three choices are offered, as controls in that header and on no other surface: keep waiting, change model, and cancel the run. Changing model opens the model list of REQ-NOTIFY-074 and pins the chosen model for the session under REQ-NOTIFY-089. This holds for every session and not only the focused one, so a background run in a quota wait is visibly waiting without being focused first.

> **Narrowed by [`PD-MONITOR-004`](../../product/directives/pd-monitor-004.md#pd-monitor-004), 2026-10-06.** Changing model opens the
> quota wait's own list, every configured model key alphabetically with an out-of-quota pair annotated, not
> REQ-NOTIFY-074's list. Every other clause above still governs.
