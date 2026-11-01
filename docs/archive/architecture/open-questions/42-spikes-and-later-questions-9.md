# Archived open questions — Spikes, and the questions raised since (9 of 35)

The ruled, closed, resolved and withdrawn entries of [part 42](../../../architecture/open-questions/42-spikes-and-later-questions-9.md) of the [open-questions record](../../../architecture/open-questions.md), each moved here whole, under its own anchor, by `pnpm archive:migrate` (`tools/archive/migrate.mjs`); the part keeps one index line for each. Only the script writes here ([the archive](../../../README.md#the-archive)).

<a id="oq-185"></a>

**OQ-185 — Does a mid-run switch of the entry model or reasoning level reach the session's next run?** *(REQ-MONITOR-142,
"A switch of the run's entry model, or of its entry reasoning level, applies from the next iteration onward", its row
saying "it applies from the next iteration"; REQ-MONITOR-143, after the loop has closed "a switch still records the
override"; REQ-SESSION-026, "A mid-session runtime model override (active model key and runtime model configurations) MUST
persist across calls and across reloads of the session"; REQ-MONITOR-146, "Composer-side model, persona, and reasoning
choices apply to the next prompt". Raised 2026-10-02 by
[`an-entry-switch-made-in-a-runs-last-iteration-does-not-reach-a-continuation.md`](../../../defects/fixed/an-entry-switch-made-in-a-runs-last-iteration-does-not-reach-a-continuation.md)
(fin8, ladder-overrides, task 2), as OQ-183, and renumbered OQ-185 at its merge because `origin/main` had taken OQ-183
and OQ-184 meanwhile. Open until 2026-10-06; ruled that day by the owner, and built.)*

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** keep the switch scoped to its own run, as built,
and reword its row to say it applies for the rest of this run (after the iteration in flight), leaving the composer's model
chip — and, read the same way, its reasoning chip — as the one control for the next run; a reasoning switch is ruled with
the model switch. Minted as [`PD-MONITOR-006`](../../../product/directives/pd-monitor-006.md#pd-monitor-006), narrowing REQ-MONITOR-142 (the
row's words) and REQ-SESSION-026 (a header switch is not the session-wide override), and built the same day (plan fin21).

A switch of the entry model or reasoning level from the run header or the inspector (`setModel`, `setReasoning`) is held
on its `Run` (`entryOverride`). When the iteration in flight is the run's last, the next iteration is a continuation —
the user's next prompt starts a new `Run`, built from the configuration (`Sessions.launchContinuation`) — so the switch
never applies, though its row said it applies from the next iteration. The requirements pull two ways. REQ-MONITOR-142
speaks of "the run's" entry model and "the next iteration", which a continuation is in the session's numbering;
REQ-MONITOR-143 keeps the override recorded once the loop has closed, which has a purpose only if something later reads
it; and REQ-SESSION-026 makes a mid-session runtime model override persist "across calls and across reloads of the
session". Against them, REQ-MONITOR-146 gives the next run its own selector — the composer's "Model for the next run",
which writes the entry persona's model into the configuration — and a switch that reached the next run would sit beside
that chip, which shows the configured model, with no rule for which wins.

**What the build proceeds under** (`packages/engine/src/run/run.ts`, `entryOverride`, `setEntryModel`,
`setEntryReasoning`; `packages/engine/src/sessions.ts`, `launchContinuation`): a switch **ends with its run**. Its row
still says "it applies from the next iteration", which is true while the run has a next iteration of its own (a queued
prompt, a task added while it runs) and untrue when it has none. A change-model resolution of a wait (REQ-ORCH-091 d) is
not such a switch: its override is session-wide and reaches every later run. The autopsy reader prints the entry key
`undetermined` after a continuation whose snapshot names no entry model when a switch onto another key preceded it
([the repair](../../../defects/fixed/the-autopsy-reader-keeps-a-switched-key-across-a-continuation-that-records-no-snapshot.md)),
so its reading is right under either answer; a continuation whose snapshot names the entry model says which it ran on.

**What a ruling decides.** Whether a switch made from the run header or the inspector reaches the session's next run
(recorded session-wide, as REQ-SESSION-026's override, and taken by the continuation unless the composer's next-run choice
differs), or ends with its run (and its row then says so when no further iteration of the run is queued); the same for a
reasoning switch; and, if it reaches the next run, how it stands beside the composer's next-run chip.

<a id="oq-186"></a>

**OQ-186 — Which models does the quota-wait surface's "change model" list: REQ-MONITOR-193's candidates or REQ-NOTIFY-074's
list?** *(REQ-MONITOR-303, "a model picker offering the fallback candidates of REQ-MONITOR-193, listing excluded pairs with
their reason rather than hiding them (REQ-MONITOR-194)"; REQ-MONITOR-193, "exactly the configured models … whose size tier
equals the current model's tier, less any model excluded … in the order their models are declared"; REQ-NOTIFY-263,
"Changing model opens the model list of REQ-NOTIFY-074 and pins the chosen model for the session under REQ-NOTIFY-089";
REQ-NOTIFY-074, "lists models from providers other than the one that failed, ahead of any others … Where no other provider
offers a model, every model except the one that failed is listed"; REQ-MONITOR-194, "from any model selector or from the
quota-wait decision surface … listed there rather than hidden, annotated". Raised 2026-10-02 by the repair of
[`the-quota-wait-picker-lists-every-model-without-marking-the-excluded-pairs.md`](../../../defects/fixed/the-quota-wait-picker-lists-every-model-without-marking-the-excluded-pairs.md)
(fin8, bundle `fin8-noticed-gaps-4`), as OQ-185, and renumbered OQ-186 at its merge of `origin/main` because the
ladder-overrides bundle had taken OQ-185 meanwhile. ~~Open.~~ Ruled 2026-10-06.)*

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** the current full list is accepted: the picker offers every configured model key, alphabetically, the waiting model included, with a pair held out of quota annotated and choosable, and both requirements are amended to describe it. [`PD-MONITOR-004`](../../../product/directives/pd-monitor-004.md#pd-monitor-004) narrows REQ-MONITOR-303 and REQ-NOTIFY-263.

Two requirements describe the one control. REQ-MONITOR-303 lists REQ-MONITOR-193's candidates — the same-tier configured
models from any provider, in declaration order, less the pairs held out of quota — and beside them the excluded pairs,
annotated; a model of another tier is not offered, and a model that resolves through no tier alias "may still be chosen
explicitly" without saying from where. REQ-NOTIFY-263 opens REQ-NOTIFY-074's list — every model, other providers first,
the one that failed left out, each labelled with its model name and its provider — which has no tier and lists no excluded
pair as such, and REQ-NOTIFY-074 written for the authentication recovery dialog leaves the failed model out where
REQ-MONITOR-194 would have the waiting pair, when it is the one held out of quota, listed and annotated. They agree on
one thing: REQ-MONITOR-194 asks every model selector to list an excluded pair annotated with its reason, and an explicit
choice of it to clear its exclusion.

**What the build proceeds under** (`WaitHeader` and `waitModelOptions`, `packages/ui/src/WorkspaceView.tsx`; the record's
`wait.excluded`, `excludedModelKeys` in `packages/engine/src/run/resilience.ts`): what both agree on, over the list as it
was built. The picker lists every configured model key as the configuration snapshot gives them (alphabetical; the
waiting model included), which holds REQ-MONITOR-193's candidates and REQ-NOTIFY-074's models alike, with neither one's
filter nor its order applied; a key whose provider-and-model pair the session recorded out of quota is listed in place,
annotated "provider reported insufficient quota in this session", and stays choosable. Choosing it is the run's explicit
choice (`setEntryModel`), which clears the chosen pair's exclusion (`ResilienceMemory.clearExhausted`, plan fin8's
ladder-overrides bundle) and, in a quota wait on that very pair, resolves the wait as a retry on it with no override
persisted. (Built first on `origin/main` 4ae715a, where that choice cleared nothing and the waiting pair was refused as "the
model that is waiting"; the ladder-overrides merge brought the clearing.) No model is labelled with its provider.

**What a ruling decides.** Which list the picker offers — REQ-MONITOR-193's same-tier candidates beside the excluded pairs,
REQ-NOTIFY-074's (other providers first, each labelled with its provider), or one ahead of the other — and in which order;
whether the waiting pair is listed when it is not held out of quota (a rate-limit wait); and whether a model of no tier is
offered here.

<a id="oq-187"></a>

**OQ-187 — Where does the project setup consent dialog stand: over a corner of the view, or in a region of the window that
takes room from every view?** *(REQ-WORKSPACE-106, "a non-modal, window-level dialog (the rest of the app stays
navigable)"; REQ-WORKSPACE-105, opened by itself once per workspace open and open until answered; ADR-0048's non-modal
window-level level, "an in-window panel that does not trap focus and leaves the rest navigable"; REQ-SHELL-022's 1000x680
minimum; REQ-SHELL-024's vertical order. Raised 2026-10-02 by the repair of
[`the-project-setup-dialog-is-drawn-over-the-title-bar-window-controls.md`](../../../defects/fixed/the-project-setup-dialog-is-drawn-over-the-title-bar-window-controls.md)
(fin8, bundle `fin8-noticed-gaps-4`), as OQ-186, and renumbered OQ-187 at its merge of `origin/main` because the
ladder-overrides bundle had taken OQ-185 meanwhile. ~~Open.~~ Ruled 2026-10-06.)*

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** the current floating placement is accepted: an overlay of the rail-and-view region at its top corner, inset by `--rt-space-4`, below the title bar and the notice slot, bounded by that region and scrolling with its answers pinned when shorter than it needs. It traps no focus, Escape answers it as a skip, and it lies over the view's top corner while it is open; "the rest of the app stays navigable" is met by controls reachable from the keyboard and, once it is answered, from the pointer.

The dialog is window-level: it belongs to no view and is shown whichever view is on screen, so the decision it waits on is
not lost by navigating. Every placement of such a surface takes something. Fixed at the window's corner it lay over the
title bar's Sessions, Minimize, Maximize and Close window and the notice's answers (the defect above). An overlay of the
rail-and-view region leaves the window's chrome and the notice reachable and lies over the view's top corner instead. A
region of the window laid out in flow — a band below the notice slot, or a column beside the view — overlays nothing but
takes its height or width from every view, which at REQ-SHELL-022's minimum some views do not have to give (the
Workspace view's transcript floor and composer alone are most of it). The re-authentication prompt, ADR-0048's other
surface of this level, was moved in flow because it belongs to one view (OQ-181); this one does not. The specification
does not say which the setup dialog takes, nor whether "the rest of the app stays navigable" is met by controls that are
reachable from the keyboard, and from the pointer once the dialog is answered, but not by the pointer while it is open.

**What the build proceeds under** (`AppShell`'s `windowDialog` slot, `packages/ui/src/AppShell.tsx`; `.project-setup` in
`packages/ui/src/shell.css`): an overlay of the rail-and-view region, `absolute` at its top corner with the language's
`--rt-space-4` inset, bounded by that region (scrolling, its answers pinned to its floor, when shorter than it needs). It
begins below the title bar and the notice slot at any notice height, so no title-bar control and no notice answer is
under it (`init-proof`'s `consent` scenario measures five, none covered). It lies over the view's top corner: measured in
the built app on 2026-10-02, at 1440x900 the Overview's List sessions and New session and the Workspace inspector's
Persona, Steer, Cancel and Pop out; at 1000x680 also the run header's model and reasoning switches and the composer's
right part (its Send is disabled while this prompt is unanswered, REQ-WORKSPACE-112), and the top-right controls of the
other views (Git's New worktree, Library's search, Settings' model rows). It traps no focus (no `aria-modal`, no backdrop),
so they stay reachable from the keyboard (not measured), and Escape answers the dialog as a skip (REQ-WORKSPACE-107).

**What a ruling decides.** Whether the dialog may lie over the view while it is open (and then which corner), or stands in
a region of its own that every view yields room to at REQ-SHELL-022's minimum (and then which, with what bound on its
height), or in another form — collapsed to a bar until opened, as the re-authentication prompt yields beside an expanded
plan gate.

<a id="oq-188"></a>

**OQ-188 — What does "Keep waiting" on the quota-wait surface do: resolve the wait as a retry now, or leave it as it is?**
*(REQ-MONITOR-303, "keep waiting, which resolves the wait as a retry and returns the status to `running`"; spec resolution 29,
which fixes the three choices and "what each does"; REQ-NOTIFY-263's three choices; REQ-MONITOR-192 and REQ-NOTIFY-087, the
auto-resume variant ending by itself when its interval elapses; REQ-MONITOR-004's closed enumeration of twenty-two operations;
REQ-MONITOR-194. Raised 2026-10-02 by task 1 of plan fin10's `fin10-quota-exclusions-and-choices` bundle, recording
[`keep-waiting-on-the-quota-wait-header-sends-nothing-where-it-should-resolve-the-wait-as-a-retry.md`](../../../defects/fixed/keep-waiting-on-the-quota-wait-header-sends-nothing-where-it-should-resolve-the-wait-as-a-retry.md).
Open; owner-only, as every question this round raises. Ruled 2026-10-06 by the owner, and built.)*

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** keep waiting retries the same model at once in
the out-of-quota wait (the variant that never auto-resumes), clearing its out-of-quota mark through the existing retry path
— read onto the existing switch of the entry model, which the header sends with the waiting pair's key, now carried on the
record's `wait` as `modelKey`, so REQ-MONITOR-004's twenty-two operations are unchanged — and stays a plain acknowledgement in
the timed wait, whose timer already retries. Written as [`PD-MONITOR-004`](../../../product/directives/pd-monitor-004.md#pd-monitor-004)'s revision 2 (minted on its branch as a
directive of its own and folded in at the landing rebase), narrowing REQ-MONITOR-303, and built the same day (plan fin21). The reading taken where the ruling leaves a detail open, as
corrected in that plan's repair round 1: "retry the same model" moves no other agent — keep waiting resumes only the agents
parked out of quota on the waiting pair and persists no override, an agent parked on another pair keeping its own wait — and
the press is marked as keep waiting and names the wait it answers, so a second press for a wait already retried is refused
rather than read as a switch of the entry model.

ADR-0010's third execution (2026-09-05) read keep waiting as "the absence of a decision": the header acknowledges ("Still
waiting.") and sends nothing, so the wait goes on as it was — the exhausted variant until a person decides, the auto-resume
variant until its timer retries. That reading cites REQ-NOTIFY-263 and REQ-MONITOR-192 and predates REQ-MONITOR-303, which
says keep waiting resolves the wait as a retry, in both variants alike. For the exhausted variant the two readings are not in
tension with any other requirement: retrying is the only thing keep waiting can resolve to, and a retry of a pair the user
chose to keep waiting on is an explicit choice of it (REQ-MONITOR-194), which clears its exclusion — the build already does
this when the waiting pair is chosen in the picker (`setEntryModel`'s quota-retry branch). For the auto-resume variant an
immediate retry ends the provider's own interval early, where REQ-MONITOR-192 says "the wait timing out resolves as a retry"
and REQ-NOTIFY-087 "the wait ends by itself once the computed interval has elapsed"; whether keep waiting retries at once
there, or only acknowledges and lets the timer retry, the specification does not settle. Either retry needs a means on the
control channel: no operation of REQ-MONITOR-004's closed twenty-two names it, so it would be read onto an existing one (the
quota-retry branch of `setModel` with the waiting key serves the exhausted variant only when the waiting pair is a configured
key) or added.

**What the build proceeds under** (as built, unchanged): keep waiting is the absence of a decision in both variants — the
header acknowledges and sends nothing; the exhausted variant ends only by a change of model or a cancel, the auto-resume
variant by its timer as well. No loop with the pre-call exclusion read (`resilientStep`, since the same bundle) is possible,
because nothing is retried.

**What a ruling decides.** Whether keep waiting resolves the exhausted variant as a retry of the waiting pair (and then that
it clears the pair's exclusion as an explicit choice does); whether it retries the auto-resume variant at once or leaves its
timer to retry; and whether either is a new operation or a reading of an existing one.

<a id="oq-189"></a>

**OQ-189 — What does a configured model slot call when the session holds its pair out of quota or has replaced it?**
*(REQ-MONITOR-194, "neither retried automatically nor offered as an automatic fallback candidate", and spec resolution 21,
which reads the exclusion as governing automatic behaviour; REQ-ORCH-091 (d), the override "for the rest of the session";
REQ-MONITOR-080, a configured compression model used, else the agent's own; REQ-ORCH-114, the classifier's slot order.
Raised 2026-10-03 by task 2 of plan fin10's `fin10-quota-exclusions-and-choices` bundle, recording
[`a-configured-model-slot-is-called-on-a-pair-the-session-replaced-or-holds-out-of-quota.md`](../../../defects/fixed/a-configured-model-slot-is-called-on-a-pair-the-session-replaced-or-holds-out-of-quota.md).
Numbered 189, the next free on the branch after its OQ-188; renumbered at the merge if taken meanwhile. Open; owner-only, as
every question this round raises. Ruled 2026-10-06 by the owner, and built.)*

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** every helper call — the intent and loop
classifiers, a configured compressor, the summariser and the post-run analyst — follows the session's model override as the
summariser already did; where the pair it reaches is held out of quota with nothing replacing it, a compression runs on the
calling agent's current model, and the classifiers and the analyst make no call. The summariser, which the ruling does not
name, is read as the condensing call it is beside compression: it summarises the child on the model the child ran on, and
writes the fallback report where that is held out of quota too; and a configured `compressor.model` yields to the exclusion
of its pair. Minted as [`PD-MONITOR-007`](../../../product/directives/pd-monitor-007.md#pd-monitor-007), narrowing REQ-MONITOR-080, REQ-ORCH-009,
REQ-ORCH-114, REQ-ORCH-100, REQ-CONFIG-065 and REQ-LIBRARY-037, and built the same day (plan fin21).

The run's auxiliary calls — the intent classifier and the pre-flight, the loop classifier, a configured compressor, the
post-run analyst, and the summariser — take configured slots. Since fin10 an agent's own calls — its model steps, and a
compression pass on its own model where no `compressor.model` is configured — never reach a pair the session holds out of
quota: the cell is settled before every call and before the turn's compression check (`settleBeforeCall`, which sends the
agent to its same-tier candidate or a wait), and a manual pass in the span before the agent's next call moves it makes no
call and fails with its reason. (Corrected in place at the bundle's first repair round, 2026-10-03. The sentence first read
"Since fin10 an agent's own calls never reach a pair the session holds out of quota (the ladder's pre-call read sends the
agent to its same-tier candidate or a wait)", which was false of the branch as first built: the turn's automatic compression
check ran before the ladder's pre-call move, so a root resumed on a pair its child had just excluded compressed on that pair,
at its threshold, and only then moved — the verifier's reproduction.) Since fin8 these slots follow a session-wide override; the summariser follows the override but not the exclusion, and the others follow
neither. For the override the requirements point one way (REQ-ORCH-091 d keeps it "for the rest of the session", and it
replaces a pair, not an agent's choice); for the exclusion they do not say what replaces the slot: a same-tier candidate
(REQ-ORCH-091 b is an agent's ladder, and these calls have none), the slot order's next entry (REQ-ORCH-114 names one for the
classifier alone), the calling agent's own model (REQ-MONITOR-080's default for the compressor), or skipping the call (which
REQ-ORCH-114 allows for the classifier when no slot resolves) — nor whether a configured `compressor.model` still "wins" over
an exclusion of its pair.

**What the build proceeds under** (as built, unchanged): each configured slot is called as configured. A session that has
recorded its small model out of quota still sends the classifier, the loop classifier, a configured compressor and the
analyst to it; a real provider refuses those calls and each path's own failure handling applies (the classifier skips, the
compression pass fails and is reported, the analyst's run is reported failed).

**What a ruling decides.** Whether these calls follow a session-wide override (and then all of them, as the summariser does);
what each calls when its configured pair is excluded and nothing replaces it; and whether a configured `compressor.model`
yields to the exclusion of its pair.

<a id="oq-190"></a>

**OQ-190 — Whose tokens does the status strip's tokens item count: the workspace's runs, or the focused session's?**
*(REQ-SHELL-044, "The tokens item reads the running total of tokens used"; REQ-SHELL-045, the cost item's figure is "the
model provider's reported cost for this workspace's runs so far"; REQ-SHELL-038, the items' accessible names, "Tokens used"
and "Cost so far". Raised 2026-10-02 by the repair of
[`the-status-strip-applies-no-responsive-hiding-and-overflows-at-the-minimum-window.md`](../../../defects/fixed/the-status-strip-applies-no-responsive-hiding-and-overflows-at-the-minimum-window.md)
(fin10, bundle `fin10-strip-notices-and-listing`). Raised as OQ-188; renumbered 190 at the merge, since origin/main took 188 and 189 meanwhile. ~~Open.~~ Ruled 2026-10-06.)*

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** accepted: the tokens item counts the workspace's runs, as the cost item does, the sum of every stored session's `tokens_input + tokens_output` for this workspace, and its tooltip says so ("Tokens used by this workspace's runs so far: {n} tok."). REQ-SHELL-044 names no scope, so this ruling settles it.

REQ-SHELL-045 scopes the cost to this workspace's runs and its tooltip says so. REQ-SHELL-044 says "the running total of
tokens used" and names no scope: not the workspace's runs, not the focused session's, not the current run's. The two items
stand side by side, so a reader compares them, and a session-scoped token count beside a workspace-scoped cost would make
that comparison wrong without saying so.

**What the build proceeds under** (`workspaceUsage`, `packages/engine/src/workspace-usage.ts`; `stripItems`,
`packages/ui/src/composer.ts`): the workspace's runs, as the cost is — the sum of every stored session's
`tokens_input + tokens_output` for this workspace, read from the run host on the `workspace.usage` command when the strip
mounts, when the focused session's own usage moves and every five seconds (a background session's run moves it too). Its
tooltip says so: "Tokens used by this workspace's runs so far: {n} tok."

**What a ruling decides.** The scope of REQ-SHELL-044's running total (the workspace's runs, the focused session, the
current run), and whether the tooltip names it.

<a id="oq-191"></a>

**OQ-191 — The workspace domain states five things about the status strip that the shell domain, which owns it, states
otherwise.** *(REQ-SHELL-040, "Neither failure is silent", with the resolution of `docs/spec/resolutions/12-desktop-shell-windows.md`
item 7, "Silent failure is dropped"; REQ-WORKSPACE-019, "a failure to open SHALL be silent"; REQ-SHELL-041, the
`unsaved settings` explanation conveys "that runs keep using the last saved values until they are saved", and the mode
flag's explanation is given word for word; REQ-WORKSPACE-022, the same flag's explanation conveys "that runs use the values
on screen rather than the values on disk", and the mode flag's conveys "exactly the following and no more: which permission
mode is in force and that it decides whether a tool call is allowed outright, put to the user, or refused", the redaction
flag's "that secrets are removed from what is recorded and displayed and that this cannot be turned off", and the
circuit-breaker flag's "that the circuit breaker is armed and will halt a run that trips it"; REQ-SHELL-047,
"This document owns the status strip". Raised 2026-10-02 by the repair of
[`the-status-strip-applies-no-responsive-hiding-and-overflows-at-the-minimum-window.md`](../../../defects/fixed/the-status-strip-applies-no-responsive-hiding-and-overflows-at-the-minimum-window.md)
(fin10, bundle `fin10-strip-notices-and-listing`). Raised as OQ-189; renumbered 191 at the merge, since origin/main took 188 and 189 meanwhile. ~~Open.~~ Ruled 2026-10-06. *Amended 2026-10-03 (fin10's repair round): raised as "three
things", it missed the redaction and circuit-breaker explanations, which REQ-WORKSPACE-022's "exactly the following and no
more" bounds as well; both are added below.*)*

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** the shell specification's five statements stand, and the workspace specification is amended to match them: the path link's failure is reported, the `unsaved settings` explanation says runs keep using the last saved values, and the mode, redaction and circuit-breaker explanations are REQ-SHELL-041's word for word. [`PD-WORKSPACE-007`](../../../product/directives/pd-workspace-007.md#pd-workspace-007) narrows REQ-WORKSPACE-019 and REQ-WORKSPACE-022.

Five statements disagree:

- **The workspace-path link's failure.** REQ-SHELL-040 (amended by the shell domain's resolution 7) reports a failure to open
  the folder on the transient error surface with the path attempted; REQ-WORKSPACE-019 still says the failure is silent.
- **What `unsaved settings` explains.** REQ-SHELL-041: runs keep using the last saved values until the edits are saved.
  REQ-WORKSPACE-022: runs use the values on screen rather than the values on disk. They are opposite claims about which
  values a run uses; the product's runs read the saved configuration (ADR-0037's Tier B, applied at the next run start).
- **The mode flag's explanation.** REQ-SHELL-041 gives the sentence ("Permission mode {mode}: how much agents may do
  without asking. Change it under the composer or in Settings → Runtime."); REQ-WORKSPACE-022 bounds it to the mode in
  force and that it decides allow, ask or refuse, "and no more", which the shell's second sentence exceeds.
- **The redaction flag's explanation.** REQ-SHELL-041 gives the sentence ("Secret redaction: anything that looks like a
  credential is masked before it reaches a model or the transcript."); REQ-WORKSPACE-022 bounds it to two facts, that
  secrets are removed from what is recorded and displayed and that this cannot be turned off, "and no more". The shell's
  sentence does not say it cannot be turned off, and adds "before it reaches a model", which the bound excludes.
- **The circuit-breaker flag's explanation.** REQ-SHELL-041 gives the sentence ("Circuit breaker: Rotaris stops a run that
  keeps repeating a failing step."); REQ-WORKSPACE-022 bounds it to that the circuit breaker is armed and will halt a run
  that trips it, "and no more". The shell's sentence says what trips it (a repeated failing step) and does not say it is
  armed.

The file-access flag's two explanations are not among them: REQ-WORKSPACE-022 fixes that pair word for word and
REQ-SHELL-041 asks only that they use the Settings control's words, which REQ-WORKSPACE-022's pair does (REQ-WORKSPACE-148's
control "lets agents read and write outside this workspace folder").

**What the build proceeds under** (`apps/desktop/src/main/commands/workspace.ts`'s `workspace.openFolder`,
`apps/desktop/src/renderer/strip-facts.ts`, `statusStripSafetyFlags` in `packages/ui/src/composer.ts`): the shell domain's
statements, since REQ-SHELL-047 says that document owns the strip and its resolution 7 is the later decision. A folder that
cannot be opened raises the transient error naming the path (an opener that never answers counts after 5 s,
`apps/desktop/src/main/open-folder.ts`); `unsaved settings` reads "The Settings view is holding edits that have not been
saved; runs keep using the last saved values until they are saved."; the mode, redaction and circuit-breaker flags'
sentences are REQ-SHELL-041's word for word; the file-access pair is REQ-WORKSPACE-022's.

**What a ruling decides.** Which domain's statement stands for each of the five, and an amendment to the other.

*2026-10-21 (the Windows ARM64 session's D2): the ruled strip measured on Windows — its workspace link opened Explorer on the workspace in 622–1,402 ms against the 5 s bound, and logged the opening (PD-WORKSPACE-007, "As built").*
