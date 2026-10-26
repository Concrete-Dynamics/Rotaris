# Open questions — Spikes, and the questions raised since (8 of 35)

Part 41 of 68 of the [open-questions record](../open-questions.md), which indexes every part. Holds OQ-178 – OQ-184.

**OQ-178 — Which notice offers REQ-NOTIFY-045's retry, when a notice carries one action?** *(REQ-NOTIFY-044, whose
vocabulary includes "retry the failed run under REQ-NOTIFY-045"; REQ-NOTIFY-045; REQ-NOTIFY-030; REQ-NOTIFY-066;
REQ-SHELL-114, a notice's "optional action (label plus action identifier)"; REQ-NOTIFY-061, "offers no retry";
REQ-NOTIFY-062, "an action opening the cloud account surface"; REQ-NOTIFY-063, "offering another model or a retry once the
provider resets … and offering an action opening model settings"; REQ-NOTIFY-064, "an action returning to the workspace
view". Raised 2026-10-02 by the repair of
[`the-retry-run-notice-action-has-no-target.md`](../../defects/fixed/the-retry-run-notice-action-has-no-target.md),
as OQ-177, and renumbered OQ-178 at its merge because `origin/main` had taken OQ-176 meanwhile and this branch's OQ-176
became OQ-177. ~~Open.~~ Ruled 2026-10-06.)*

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** kept as built: no run-failure notice carries a Retry action, each class keeping the action its requirement names and REQ-NOTIFY-063's retry staying in its message, and the composer keeps the draft, so the user resends it with one press of Send. The `retry-run` action keeps its target for a notice that carries it. No requirement names a notice that carries the retry, so this ruling settles it.

REQ-NOTIFY-045 says what a retry does and REQ-NOTIFY-044 lists it among a notice's actions, and REQ-NOTIFY-061 takes the
trouble to say its notice offers none, which reads as though another failure notice does. But every failure class names
its notice's action, and none names the retry: REQ-NOTIFY-062's opens the cloud account, REQ-NOTIFY-063's opens model
settings, REQ-NOTIFY-064's and REQ-NOTIFY-061's return to the workspace view; REQ-SHELL-114 gives a notice one action.
REQ-NOTIFY-063 "offers" a retry in words beside its action, and it is the only failure notice that mentions one. The
specification also says nothing of the composer after the draft has been resubmitted from a notice.

**What the build proceeds under** (`apps/desktop/src/renderer/session-actions.ts`, `retryRun`;
`apps/desktop/src/renderer/main.tsx`, `dispatchNoticeAction`): the action has its target, and no run-failure notice
carries it — each class keeps the action its requirement names, and REQ-NOTIFY-063's retry stays in its message ("Choose
another model, or retry once the provider resets."). Activated, the action resubmits the composer's draft as the window
last published it (REQ-CHAT-014), else as stored (REQ-NOTIFY-066), else — the draft blank — the focused session's newest
`user` row, the prompt the engine's own continue reads as the last one; it goes through the composer's submit path to
the session the window follows (REQ-NOTIFY-030), and is refused, with the reason in a warning notice, when no session
is followed or there is nothing to resubmit. The composer keeps the draft: nothing outside the composer clears it. *Since
2026-10-02 (fin8, the repair of
[`the-retry-action-reads-the-last-prompt-from-the-resident-window.md`](../../defects/fixed/the-retry-action-reads-the-last-prompt-from-the-resident-window.md)
and
[`the-retry-action-resubmits-a-prompt-without-its-images.md`](../../defects/fixed/the-retry-action-resubmits-a-prompt-without-its-images.md)):*
the blank-draft branch is the engine's (`session.retry`, `Sessions.retry`). It reads the last submitted prompt over every
row, released ones included, where the window had searched its replica's resident window and refused once the prompt was
released; and it resubmits the prompt's images with it, read back from the session's directory and verified by digest,
where the window had re-sent the text alone. A missing or altered image refuses the retry, naming the image. A non-blank
draft is still resubmitted as its text (OQ-183).

**What a ruling decides.** Which notice carries the retry — REQ-NOTIFY-063's in place of, or beside, its model-settings
action (which REQ-SHELL-114's single action would then have to allow), REQ-NOTIFY-064's, or none — and whether a draft a
retry resubmitted is cleared from the composer as a submitted one is.

**OQ-179 — What does the recovery dialog's re-authenticate path offer for a provider whose key the model configuration
carries?** *(REQ-NOTIFY-076, "For key-based providers it offers a masked key field with a save-and-retry control … For
browser and device-code providers it starts that provider's own flow in place"; REQ-NOTIFY-077; REQ-NOTIFY-202;
REQ-CONFIG-083 and REQ-PROVIDER-092, a model's `api_key` / `api_key_env`, read per request, when it names no
`auth_provider`; REQ-PROVIDER-118/140, "Authentication is managed by model configuration." for a provider that resolves to
no sign-in method. Raised 2026-10-02 by the 401 note's part D on `fin6-auth-recovery-2`. ~~Open.~~ Ruled 2026-10-06.)*

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** the build is accepted: for a provider whose key the model configuration carries (`api_key` or `api_key_env` with no `auth_provider`), the recovery dialog's second path shows REQ-PROVIDER-118/140's sentence and says to correct the key the model configuration names, then retry, with no key field and no save-and-retry control. Such a provider resolves to no sign-in method and is neither of REQ-NOTIFY-076's two kinds, so this ruling settles it.

REQ-NOTIFY-076 sorts the provider that failed into two kinds: key-based, re-authenticated through a key field, and
browser or device-code, through their own flow. A model can also reach a provider with a key it states itself — `api_key`
or `api_key_env` in `agents.yaml`, with no `auth_provider` — and then no provider record or credential-store entry exists
for it: a key typed into the dialog and stored would never be read by that model, so "save and retry" would retry with the
same credentials, which REQ-NOTIFY-068 forbids. The scripted test provider is one such provider. The specification does not
say what the dialog's second path offers for it.

**What the build proceeds under** (`ProviderService.reauthentication` in `packages/providers/src/signin.ts`;
`AuthRecoveryDialog.tsx`): a provider id that resolves to no sign-in method reads `configuration`, and the dialog's second
path shows REQ-PROVIDER-118/140's sentence and says to correct the key the model configuration names, then retry — no key
field, no save-and-retry control, and nothing directing the user to a shell or a terminal. The first path (another model) is
unaffected. Device-code and browser providers read `unavailable` and say their flow is not provided by this build (the flows
are owed, `packages/providers/src/catalogue.ts`); that is a gap of the build, not of the specification, and is recorded on
[the 401 note](../../defects/fixed/a-401-ends-the-run-with-a-bare-failure-notice-and-no-authentication-recovery.md).

**What a ruling decides.** Whether such a provider is offered a key field at all — writing the key into the configuration
the model reads (a write into the user's project files, which REQ-NOTIFY-047 keeps out of notice actions but not out of a
dialog), or into the credential store with the model then pointed at it — or only the sentence this build shows.

**OQ-180 — Where does a board run that stops at its iteration limit rest, and does automatic scheduling start it again?**
*(REQ-TRACE-477, a flow's ending delivered to the surface told it began; REQ-TRACE-482, "the system itself picks up the
next candidate as capacity becomes available"; REQ-TRACE-463; REQ-TRACE-476, "without re-running completed units".
Raised 2026-10-02 by the repair of
[`a-rejected-card-back-in-ready-can-never-start-its-next-unit.md`](../../defects/fixed/a-rejected-card-back-in-ready-can-never-start-its-next-unit.md),
bundle `fin9-queue-dispatch-and-disclosure`, as OQ-179, and renumbered OQ-180 when the bundle merged `origin/main`,
which had taken OQ-179 meanwhile. Open until 2026-10-06; ruled that day by the owner, and built.)*

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** an iteration-limit stop is a failure — the
card moves to Blocked with a `run-failure` blocker, as a user's stop already does, so a person decides when to resume it
(the blocker's resume provisions the next unit), and automatic scheduling never restarts it on its own. Read, where the
ruling leaves it open, as covering every run that persists `stopped` — REQ-MONITOR-029's `max_iterations`, which a time
limit (REQ-ORCH-069) reaches as well, the coordinator reading the persisted status alone — while an explicit cancel
(`cancelling`) still rests the card in Ready. The requirements were silent on this ending, so the ruling alone settles it.
Built the same day (`outcomeOf`, `apps/desktop/src/main/requirements-runs.ts`; plan fin21). The reading below is kept as
the build proceeded under it until then.

A board run that reaches its iteration limit persists `stopped`; main's coordinator classifies `stopped` and `cancelling`
as `cancelled` (`outcomeOf`, `apps/desktop/src/main/requirements-runs.ts`), and a `cancelled` ending rests the card in
`ready` (`recordRunEnded`, `packages/workspace/src/delivery/transition.ts`). The specification classifies a board run's
ending as completed (review) or not, and says a run-time block returns to the released state; it names no state for a
run that ended neither completed nor failed, and nothing bounds how often automatic scheduling may pick the same card up.

**What the build proceeds under**: as built — the card rests in `ready` on its next unit, and under `automatic` the
dispatch that follows every run's end starts that unit at once on a fresh worktree (the repair above), the finished
unit's tree kept; under `manual` it waits for the queue's release. So a requirement whose runs keep reaching the limit is
re-run, one unit after another, until a person holds it or the queue is stopped.

**What a ruling decides.** Whether an iteration-limited run ends `cancelled` into `ready`, or `failed` into `blocked` with
a `run-failure` blocker (whose resume provisions the next unit), as a stop by the user has since R-067; and, if it rests
in `ready`, whether automatic scheduling may pick it up again without bound.

**OQ-181 — Where does REQ-NOTIFY-071's prompt stand "beside the continuing run", and is it drawn while the window shows
another view?** *(REQ-NOTIFY-071, "a successful fallback restart opens a non-modal re-authentication prompt beside the
continuing run"; ADR-0048's non-modal window-level level, "an in-window panel that does not trap focus and leaves the rest
navigable"; REQ-SHELL-022's minimum; REQ-CHAT-010's 180 px transcript floor; REQ-NOTIFY-030. Raised 2026-10-02 by the
401 note's part B, second repair round,
[`a-401-ends-the-run-with-a-bare-failure-notice-and-no-authentication-recovery.md`](../../defects/fixed/a-401-ends-the-run-with-a-bare-failure-notice-and-no-authentication-recovery.md),
as OQ-180, and renumbered OQ-181 at the branch's merge beside the note's parts C and D (2026-10-02) because `origin/main` had
taken OQ-179 meanwhile and the branch's own OQ-179 took OQ-180 (since renumbered OQ-182, at the branch's third merge,
because `origin/main` had taken OQ-180). ~~Open.~~ Ruled 2026-10-06.)*

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** the build's placement and visibility are accepted as they are: the prompt is drawn in flow in the Workspace view, between the run header and the transcript, yields to an expanded plan gate as a bar of its title and its answers, and is not drawn while another view is shown, the window holding it by session and drawing it again when the Workspace view returns. "Beside the continuing run" is the Workspace view's run column.

The requirement places the prompt by the run, not by the window, and the level ADR-0048 gives it requires the rest of the
window to stay navigable while it is open — and it stays open until it is answered. Two overlay placements were built
and both covered controls in the built app: `fixed` at the window's top corner (the title bar's Sessions, minimise,
maximise, close and the notice's dismissal), then `absolute` at the top corner of the rail-and-view region (at the
1000x680 minimum the run header's model and reasoning switches and Compress context; with a key field, the composer's
submit; in the other views each one's top-right controls). Any overlay that stays open covers something at some size.
The specification does not say which region "beside the continuing run" is, nor whether the prompt is drawn while the
window shows a view other than the one the run is shown in.

**What the build proceeds under** (`WorkspaceView`'s `reauthPrompt` row, `packages/ui/src/shell.css`):
- the prompt is drawn **in flow in the Workspace view**, the view that shows the run, as its own row of the view's grid
  between the run header and the transcript (the plan gate's kind of place, REQ-SHELL-168). It overlays nothing at any
  window size: the transcript keeps REQ-CHAT-010's floor and the prompt takes what is left, scrolling when that is less
  than it needs with its answers pinned to its floor ~~— at every size~~ (*corrected 2026-10-02, the third repair round*:
  beside an EXPANDED plan gate the transcript is not drawn and the gate's row has no floor, and the prompt, sized first,
  left the gate 42 px with its three answers unreachable at 1000x680. There the prompt **yields to the gate** as the
  transcript does, one action away: it is drawn as a bar — its title and its answers on one row — and its sentence, the
  provider's words and the key's hint are drawn again when the gate is collapsed or answered; the gate, the run's stop
  and the reading area (REQ-ORCH-153, PD-ORCH-002 revision 2), takes the rest. A ruling may also decide whether REQ-NOTIFY-071's
  quote may be withheld from view that way while a plan awaits a decision);
- it is **not drawn while another view is shown**. The window keeps holding it (by session, REQ-NOTIFY-030) and draws it
  again when the Workspace view returns; the run's acknowledgement (REQ-NOTIFY-070) is the window-wide signal, shown in
  any view. A key half-typed into the field is not kept across a view change.

**What a ruling decides.** Whether "beside the continuing run" means the Workspace view's run column (as built), a region
of the window shown in every view (which then has to take space from every view at REQ-SHELL-022's minimum), or a
separate window; and whether a prompt the user has not answered should be reachable from the other views. *Added at the
fourth repair round (2026-10-02, the verifier's optional findings):* in the bar beside an expanded plan gate the only words
drawn are its title, "Re-authenticate <provider>", and its answers — so while a plan awaits a decision the bar names
neither the primary model that failed nor that the run continues on the fallback (REQ-NOTIFY-071's two statements), and
for a provider re-authenticated elsewhere — a device-code or browser provider, whose method this build does not provide,
or one whose key the model configuration carries — it does not say that the method is unavailable here: those sentences,
with the provider's quoted error, are in the document and drawn again when the gate is collapsed or answered. A ruling
may decide whether any of them must stay drawn in the bar (each one taken from the height the plan, the largest part of
the gate under PD-ORCH-002, keeps at REQ-SHELL-022's minimum).

**OQ-182 — What is REQ-NOTIFY-070's restart "with the same prompt", what does "the fallback bookkeeping is cleared" take back,
and how long does "the first authentication failure of a session" last?** *(REQ-NOTIFY-070, "the run restarts with the
same prompt. Where the restart cannot begin, the fallback bookkeeping is cleared and the generic failure notice is
published instead"; REQ-NOTIFY-069, "a recorded last prompt"; REQ-NOTIFY-045, whose retry "resubmits the current composer
draft, or the last submitted prompt"; REQ-NOTIFY-072/075, "a second authentication failure"; REQ-SESSION-026. Raised
2026-10-02 by the 401 note's part A,
[`a-401-ends-the-run-with-a-bare-failure-notice-and-no-authentication-recovery.md`](../../defects/fixed/a-401-ends-the-run-with-a-bare-failure-notice-and-no-authentication-recovery.md),
as OQ-177, renumbered OQ-179 at its first merge because `origin/main` had taken OQ-177 and OQ-178 meanwhile, and renumbered
OQ-180 at its second (2026-10-02, beside the note's parts C and D) because `origin/main` had taken OQ-179 meanwhile, part D's
question above, and renumbered OQ-182 at its third (2026-10-02) because `origin/main` had taken OQ-180 meanwhile (bundle
`fin9-queue-dispatch-and-disclosure`'s question above) and the branch's own OQ-181 kept its number; the branch's commit
subjects say OQ-177, and those of its fourth repair round OQ-180. Open until 2026-10-06; ruled that day by the owner, and built.)*

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** every reading below is accepted as built — the
restart appends the last prompt as a new user turn (a run a plan decision launched relaunched as that decision), a restart
that cannot begin takes the pin back, the pin moves every agent on the failed pair, a first failure with no usable fallback
spends the session's first failure, the bookkeeping lasts for the life of the process, and a session not on screen restarts
when it is focused — with one change: **the restart re-sends the prompt's images with its text**, read back from the
session's directory by path and verified by digest through the retry's read-back (`readBackAttachments`). Read the way the
retry reads it, where the ruling leaves the detail open: an image that can no longer be read back, or a model the restart
runs on (the fallback, or the model chosen in the dialog) that declares no image input (REQ-CHAT-171), refuses the restart
by name rather than restarting with less than was sent, so the restart cannot begin, nothing is pinned, and main publishes
the generic notice; a last prompt of images alone is restarted with its images. REQ-NOTIFY-070's "the same prompt" reads so;
no requirement's text is departed from, so the ruling alone settles it. Built the same day (`Sessions.lastPromptOf`, plan
fin21). Corrected the same day at the build's verification: the automatic restart's fallback that declares no image input
does not end at the generic notice — for this prompt it is REQ-NOTIFY-072's "no usable fallback" (`NO_USABLE_FALLBACK`,
`apps/desktop/src/main/auth-fallback.ts`), so main opens the recovery dialog, where a model that takes images can be
chosen; an image that can no longer be read back, and a model chosen in the dialog that takes no image input, still end
at the generic notice. The reading below is kept as the build proceeded under it until then.

Three things the requirements leave to the build:

- **The restart.** REQ-NOTIFY-070 does not say whether restarting "with the same prompt" records the prompt again or
  continues the failed run's request without a new user turn, nor what becomes of the prompt's image attachments.
- **The clearing.** Where the restart cannot begin, "the fallback bookkeeping is cleared". The fallback was pinned before
  the restart was tried (a run resolves its model at start); the requirement does not say whether that pin stands.
- **The session's first failure.** "The first authentication failure of a session" has no stated lifetime: across an
  application restart, the session is the same session, but nothing says the bookkeeping is durable.

**What the build proceeds under** (`Sessions.restartOnFallback`, `apps/desktop/src/main/auth-fallback.ts` — `failure-recovery.ts` until the merge beside parts C and D):
- the restart **re-submits the last user prompt as a new user row** (`Sessions.prompt`), so the transcript shows it sent
  twice, preceded by a system row naming the model that failed and the fallback; the prompt's text is re-sent and its
  attachments are not (the row keeps only their metadata, REQ-CHAT-170);
- *since the fourth repair round (2026-10-02)*, **a run a plan decision launched is relaunched as that decision**
  (`Sessions.relaunchAfterAuthFailure`, the dialog's restarts included): approve carries the plan as the user left it
  again, revise starts the same further cycle with the plan as it stood and the changes stated (REQ-ORCH-154), and no
  prompt is re-submitted — a decision is no prompt. Re-submitting the last user row there had opened a fresh cycle from the
  original prompt and dropped the revise's changes and the plan they revised. A relaunched approval whose run abandoned
  its task appends the request again, as a re-submitted prompt does; a relaunched revise appends none, its work still
  pending. The decision is kept in memory with the run it launched, as the failed model is;
- where the restart cannot begin, **the pin is taken back** as well — a `model_override` entry carrying `cleared: true` —
  so the session stays on the model it had and the generic notice says what happened;
- the "fallback attempted" bookkeeping lives **in main for the life of the process**. The pin itself is durable, so after
  a relaunch the session runs on the fallback, and a failure there is a failure of the fallback, which is not tried again
  (REQ-NOTIFY-075's reading) — the dialog's case.
- Because the restart is a further run of the session, its todo still holds the failed run's task as abandoned
  (REQ-ORCH-074), so a restart that succeeds ends "The run completed with failures: 1 completed, 1 abandoned" — seen in
  `resilience-proof`'s `auth-fallback` run on 2026-10-02. The build leaves it so: the failed run's task did fail.
- The pin is keyed by the **pair** that failed (`provider|model`), as a wait's choice is, so every agent of the session on
  that pair — a child on the primary model included — moves to the fallback; REQ-NOTIFY-070 says "that session's model
  override", which is the one session-wide override REQ-SESSION-026 names.
- *Since the merge beside the note's parts C and D (2026-10-02):* **a first failure with no usable fallback spends the
  session's first failure too.** It opens the recovery dialog (REQ-NOTIFY-072's "a first one with no usable fallback"), and
  the session's next authentication failure — a model chosen by hand in the dialog, or a later prompt after the dialog was
  cancelled — is "a second authentication failure" and the dialog's again, even where a usable fallback has been configured
  meanwhile; only REQ-NOTIFY-078's submission, or a restart that could not begin, makes the next failure the first again
  (`auth-fallback.ts`'s `spent`).
- *Since the same merge:* **a session not on screen is restarted when it is focused.** REQ-NOTIFY-032 holds an unfocused
  session's class publication until a main window follows it, and the automatic restart is the authentication class's
  recovery, so it waits with the rest (`RunFailurePublisher`): the session stays failed under REQ-NOTIFY-032's warning, and
  its restart, its acknowledgement and its prompt arrive with the focus change (REQ-NOTIFY-030). The dialog's restarts
  (`Sessions.restartAfterAuthFailure`, parts C and D) re-submit the prompt as this one does.

**What a ruling decides.** Whether the restart appends a user turn or continues the failed request (and so whether the
failed run's task stays abandoned beside the restart's); whether attachments are re-sent; whether a restart that could not begin leaves the pin standing; whether the first-failure bookkeeping outlives
the application; whether the pin covers every agent on the failed pair or the entry agent alone; whether a first failure
with no usable fallback spends the session's automatic fallback; whether a session not on screen is restarted at once,
in the background, or when it is focused; and whether "the same prompt" of a run a plan decision launched is that decision
(as built) or the session's last prompt.

**OQ-183 — Does REQ-NOTIFY-045's "current composer draft" include the images the composer holds?** *(REQ-NOTIFY-045,
"resubmits the current composer draft"; REQ-NOTIFY-066, the draft stored under `composerDraft`; REQ-CHAT-014, the draft
published to application state; REQ-CHAT-011/170/171/172, a submission's attachments and their gates. Raised 2026-10-02 by
the repair of
[`the-retry-action-resubmits-a-prompt-without-its-images.md`](../../defects/fixed/the-retry-action-resubmits-a-prompt-without-its-images.md)
(fin8). Open.)*

**Deferred 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)).**

The retry resubmits "the current composer draft" where there is one. The composer holds images beside its text
(REQ-CHAT-170..172), but the draft the specification stores and publishes (REQ-NOTIFY-066, REQ-CHAT-014) is text, and
nothing says whether images held in the composer at the moment a notice's retry is activated belong to "the draft" the
retry resubmits, or stay in the composer for the user's own submission.

**What the build proceeds under** (`retryRun`, `apps/desktop/src/renderer/session-actions.ts`): a non-blank draft is
resubmitted as its text alone, as the stored and published draft is text; images held in the composer are not sent by
the retry and stay where they are. A blank draft resubmits the session's last submitted prompt with its images
(`Sessions.retry`, OQ-178's reading since 2026-10-02).

**What a ruling decides.** Whether a retry of a non-blank draft carries the images the composer holds (and so whether the
composer publishes them to application state as it does its text), and whether they are then cleared from the composer.

**OQ-184 — Where does REQ-SANDBOX-121's workspace indicator stand, and in what words?** *(Asked until 2026-10-02 as "…and
what does it say after a refused continuation of a confined session?"; that third part was not open and is withdrawn, below.)
(REQ-SANDBOX-121, "A workspace indicator naming the backend appears only for a session whose recorded result is confined"; REQ-MONITOR-257 and REQ-NOTIFY-030, "the sandbox indicator"; REQ-NOTIFY-061, "The sandbox indicator
stops describing the run as sandboxed"; REQ-SHELL-038, the strip's items left to right, a closed list; REQ-SHELL-047, "An
item added to the strip is given its threshold here"; REQ-TOOLS-184. Raised 2026-10-02 by the repair of
[`no-workspace-indicator-names-the-confinement-backend.md`](../../defects/fixed/no-workspace-indicator-names-the-confinement-backend.md)
(fin8). ~~Open.~~ Ruled 2026-10-06.)*

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** kept as built, and added to the specification's status-strip item list at that position: the indicator `sandbox: <backend>` (or `sandbox: confined`), named "Confinement backend", stands right after the file-access flag and before the mode flag, and is shown at every width. [`PD-SHELL-008`](../../product/directives/pd-shell-008.md#pd-shell-008) narrows REQ-SHELL-038, REQ-SHELL-047 and REQ-SANDBOX-121.

Two things the requirements leave to the build:

- **Where it stands.** REQ-SANDBOX-121 calls it a *workspace* indicator and places it nowhere; REQ-SHELL-038 lists the
  strip's items and has none for it, and REQ-SHELL-047 says an item added to the strip gets its responsive threshold there,
  which it has not.
- **Its words.** "Naming the backend" fixes the backend's name and nothing else; REQ-TOOLS-184's flags take their
  tooltips' wording from the settings pages, which this indicator is not among.
- ~~**A refused continuation.**~~ *Withdrawn 2026-10-02 (fin8, repair round 1): not open.* It read: "A confined session
  whose next run is refused at the confinement gate (REQ-NOTIFY-061) started no run, and its record still says its last
  run was confined. REQ-NOTIFY-061 has the indicator 'stop describing the run as sandboxed'; whether 'the run' is the
  refused one (which the indicator never described) or the session's latest result is not said." fin8's verifier found the
  reading empty the clause: a refused START leaves no session (REQ-SANDBOX-120), so no indicator is drawn for it either
  way, and the only indicator that can stop is the one a refused continuation would otherwise keep showing. The clause is
  plain, and the build now meets it (below).

**What the build proceeds under** (`statusStripSandboxItem`, `packages/ui/src/composer.ts`; `apps/desktop/src/renderer/main.tsx`):
an inert text item in the status strip, right after the workspace-scope flag, reading `sandbox: <backend>` (or
`sandbox: confined` for a record written before the backend was recorded, whose start event no longer holds it), with the
accessible name "Confinement backend" and a tooltip worded as the settings page's Sandbox mode control words confinement,
joined to the short form as REQ-SHELL-041's flags are. It is shown at every width (no REQ-SHELL-047 threshold). It reads
the focused session's record, so it is absent with no session focused — where a refused start leaves the window, no
session remaining (REQ-SANDBOX-120). After a run of an existing session is refused at the confinement gate (a prompt, a
retry, a continue, a plan decision, an authentication restart) the engine publishes the record no longer sandboxed and with
no backend (`Sessions.refusedAtStart`, `packages/engine/src/sessions.ts`), so the item is gone beside the refusal notice
until a run of the session starts again; the stored row keeps the fact of the run that started (REQ-SANDBOX-094). Until
that repair the reading here was that the item kept describing the last run that started and the refusal changed no
record; the verifier's finding above withdrew it.

**What a ruling decides.** Whether the indicator belongs in the status strip (and then its place among REQ-SHELL-038's items
and its REQ-SHELL-047 threshold) or on another workspace surface; its wording beyond the backend's name.
