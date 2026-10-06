## A 401 ends the run with a bare failure notice and no authentication recovery

A run whose model call fails authentication (HTTP 401, "Incorrect API key provided") ends `failed` and main raises
`raiseNotice(sev, e.result.summary, e.result.error)` — "The run failed: <failure text>", the failure text as detail,
Copy and Dismiss, and no action (`apps/desktop/src/main/index.ts`, the run-result handler; its own comment says "The
authentication and sandbox classes ahead of it are not built either"). REQ-NOTIFY-060 matches a failed run against the
authentication class **first**, and REQ-NOTIFY-067's markers (`401` standing alone, `incorrect api key`, …) match this
text, so the run should take the authentication recovery: the configured fallback pinned and the run restarted with an
acknowledgement and the non-modal re-authentication prompt (REQ-NOTIFY-070, REQ-NOTIFY-071), or, with no usable
fallback, the 560 px modal recovery dialog with its other-provider model list and its re-authenticate path
(REQ-NOTIFY-072..079). None of that exists. Where REQ-NOTIFY-069 does send the failure to the generic path, the notice
falls short there too: REQ-NOTIFY-064 requires it to state that the session and the draft were kept and to offer an
action returning to the workspace view, and the notice raised offers no action and says neither.

Seen 2026-10-01 in `pnpm resilience-proof`'s `fatal` scenario (scripted `fail:401`; `results.json` `fatal.notice`:
"×The run failed: scripted authentication failure (HTTP 401) — HTTP 401 — Incorrect API key provided Details … Copy
Dismiss"), while repairing that scenario to assert its own notice
([`fixed/resilience-proofs-cancel-scenario-reads-a-failed-project-setup-in-place-of-the-limit-notice.md`](resilience-proofs-cancel-scenario-reads-a-failed-project-setup-in-place-of-the-limit-notice.md)).
The scenario now asserts what the product does — the 401's failure text as the notice's detail, no retry, no wait — and
not the recovery above; it should assert REQ-NOTIFY-072's dialog (with no fallback configured) once the class is built.
Recorded, not repaired: building the class is product work of its own (a dialog surface, a fallback restart, a
re-authentication path).

## Parts built — the note stayed open until every part had landed

The third triage (2026-10-02) split the repair in four parts over two bundles: **A** the classifier, REQ-NOTIFY-064's generic
notice and the first-failure fallback pin and restart (REQ-NOTIFY-060/064/067..070); **B** the non-modal re-authentication
prompt (REQ-NOTIFY-071/078); **C** the 560 px modal recovery dialog (REQ-NOTIFY-072..075/079/080); **D** its re-authenticate
path (REQ-NOTIFY-076/077).

- ~~**A and B are not on `origin/main`.**~~ *Merged beside C and D on 2026-10-02 (the section "The four parts together",
  below); the reading this bullet records is retired.* They were built on `fin6-auth-recovery-1`, which ended unverified and did not merge.
  Bundle `fin6-auth-recovery-2` was told to build C and D on `origin/main` as it stood (`dc796f5`), so it built the
  share of A that C cannot run without — the classifier in REQ-NOTIFY-060's order (`apps/desktop/src/main/failure-class.ts`,
  REQ-NOTIFY-067's markers, `401` standing alone) and REQ-NOTIFY-064's generic notice (the run failed, the session and the
  draft were kept, the failure text as detail, `open-view: workspace`) — and not the fallback pin and restart, nor B's prompt.
  **The reading this build proceeds under until A lands:** every authentication failure REQ-NOTIFY-069's preconditions admit
  opens C's dialog, a first one with a usable fallback included; the configured fallback is then one of the models listed to
  choose by hand. When A lands, its restart goes ahead of the dialog in the run-result handler and the dialog keeps
  REQ-NOTIFY-072's two cases.
- **C — built 2026-10-02 on `fin6-auth-recovery-2`.** Main classifies the failed run; for the authentication class it asks the
  run host for the facts (`session.authRecovery`: the model the failed root call was addressed to, the active model, every
  configured model a restart can reach, whether a last prompt is recorded — `Sessions.authRecoveryFacts`), raises the class's
  error notice ("Authentication failed", the session and the draft kept, the failure text as detail, `open-view: workspace`)
  and opens the dialog (`apps/desktop/src/main/auth-recovery.ts`): a modal window 560 px wide over the main window following
  the session, one at a time (REQ-NOTIFY-079), drawn by `packages/ui/src/AuthRecoveryDialog.tsx` from design-system controls.
  Its title names the model that failed, else the active one; the provider's error is collapsed and cut at 320 characters
  plus an ellipsis in `--rt-danger-300`; the models of other providers come first, then the failed provider's others, the
  failed model never (`recoveryModelList`); Retry is disabled while the list is empty. Retry pins the chosen model against
  the failed pair and restarts with the same prompt (`session.authRestart` → `Sessions.restartAfterAuthFailure`, the
  `model_override` entry `ResilienceMemory.rehydrate` replays, so the pin survives a reload — REQ-SESSION-026); a pin away from
  the chosen model is taken back, and a restart that cannot begin takes its pin back (`cleared: true`). A chosen model that
  fails too reopens the dialog naming it (REQ-NOTIFY-075). Cancel closes the dialog and nothing else (REQ-NOTIFY-080).
  Pinned by `failure-class.test.ts`, `auth-recovery.test.ts` (main and ui), the `REQ-NOTIFY-072/074` block of
  `ladder.test.ts`, `resilience.test.ts` and `scripted-client.test.ts`; shown by `pnpm resilience-proof`'s `fatal` scenario,
  now driven: a 401 with no fallback configured opens the dialog (title, 560 px, the error in the failure colour, the other
  providers' models), Cancel leaves the run failed and the notice on screen, a second prompt reopens it, beta is chosen and
  refused too, the dialog comes back naming beta, and the run completes on gpt-4o.
- **D — built 2026-10-02 on `fin6-auth-recovery-2`.** The dialog's second path, "Re-authenticate <provider>", names how the
  provider that failed can be re-authenticated here (`ProviderService.reauthentication`): a key-based provider gets a masked
  key field and **Save and retry**, enabled only while the field is non-blank; main stores the key through the provider key
  store (`ProviderService.reauthenticateWithKey`, the same validate-then-save path `providers.save` takes: discovery against
  the provider's catalog before anything is stored, REQ-NOTIFY-202), refreshes what depends on the provider, and restarts the
  run with the same prompt on the same model (`session.authRestart` with no key; the continuation lease carries the new
  credential — REQ-NOTIFY-068's "the credentials change"). A key the provider refuses stays in the dialog as its sentence; a
  key that cannot be **stored** raises the error acknowledgement "The key could not be stored" naming the storage failure,
  and a run that cannot be restarted after a stored key raises "The run could not be restarted after re-authentication"
  (REQ-NOTIFY-077). **Device-code and browser providers** (Copilot, Codex, Claude Code) can only be told that their method
  is not provided by this build, because those sign-in flows are owed (`packages/providers/src/catalogue.ts`'s header): the
  dialog says so and offers no key field, so REQ-NOTIFY-076's "starts that provider's own flow in place … a control
  confirming that re-authentication has been completed" is **not met** for them until the flows exist. A provider whose key
  the model configuration carries reads "managed by model configuration" (OQ-179, raised with that reading). No path names a
  shell, a terminal or a separate program. Pinned by `signin.test.ts` (the method per provider, the stages, a storage failure),
  `auth-recovery.test.ts` (main: the key path, both acknowledgements; ui: the field, the disabled control, the unavailable
  sentence), the `REQ-NOTIFY-076` case of `ladder.test.ts` and `scripted-client.test.ts`'s `:unless-key=`; shown by
  `pnpm resilience-proof`'s new `reauth` scenario: an OpenAI-compatible instance signed in with a stale key fails the run,
  the dialog offers the masked field, the new key is validated against the catalog, saved, and the run restarts on the same
  model with it and completes, no pin written and the key in no log line.

- **Repair round 1 (2026-10-02), after the verifier's three blocking findings on C.**
  - *REQ-NOTIFY-068 across failures.* The dialog had left out only the pair that failed last, so after alpha failed and beta
    (chosen by hand) failed too, the reopened dialog offered alpha again and a retry called it with credentials that had not
    changed; `ladder.test.ts` and the `fatal` proof pinned that. Now main records, by session, every provider/model pair that
    failed authentication since its provider's credentials last changed (`AuthRecovery.refusedPair`): such a pair is left out
    of the payload's models and refused by a retry, and leaves the set when its provider's credentials change — the dialog's
    re-authentication, or a sign-in, a saved key, a sign-out or a removal under Settings (`commands/providers.ts`). Main holds
    it because the credential store is main's; the engine's restart still accepts any configured model, and its
    `REQ-NOTIFY-075` case is now the one where alpha's credentials changed first. `fatal`'s third dialog asserts alpha and
    beta are both absent and gpt-4o is what is left. In memory: an application restart forgets the set (and the focus gate's
    held publication with it — repair round 2, below).
  - *REQ-NOTIFY-030/032.* The dialog had opened over the active main window for a session no window followed, and the class
    notice was raised at once. A failed run's class publication now goes through a focus gate (`RunFailurePublisher`,
    `apps/desktop/src/main/run-failure-notice.ts`): a session a main window follows publishes its class at once; any other
    raises REQ-NOTIFY-032's warning (naming the session, the failure text as detail, the action focusing it) and nothing else,
    and its class notice — and for this class the dialog — arrives when a main window follows the session
    (`session.subscribe`). This applies to every failure class, not only this one. Pinned by `run-failure-notice.test.ts`,
    `session.test.ts` and `main-windows.test.ts`; not shown in the built app (no proof drives two sessions).
  - *REQ-NOTIFY-064 pinned.* The generic, authentication and quota notices are built by pure helpers beside the classifier
    (`run-failure-notice.ts`) and pinned word for word by `run-failure-notice.test.ts`; a failed run with no failure text now
    takes the generic notice too (its summary the detail). `resilience-proof`'s new `generic` scenario (scripted `fail`, an
    HTTP 400) asserts the notice's words, its detail, its persistence, its session, no recovery dialog, and that **Back to the
    workspace** returns to the workspace view from Overview.
  - *Carried from the verifier's optional findings.* The model list is a keyboard radio group (the arrow keys, Home and End
    move the choice — `radioStep`, pinned in `packages/ui/src/auth-recovery.test.ts`); the retry guard checks the chosen key
    against the filtered list and the refused pairs (`AuthRecovery.retry`) rather than the payload alone. For D: a key that
    was stored but whose discovered models could not be recorded is now its own stage (`catalog`), so it is no longer told
    as "The key could not be stored" — the run restarts with the stored key and the shortfall is logged (`signin.test.ts`,
    `auth-recovery.test.ts`).

- **Repair round 2 (2026-10-02), after the verifier's blocking finding on the release under Settings.** The four call sites
  in `apps/desktop/src/main/commands/providers.ts` that release a provider's refused pairs had no test: turning
  `credentialsChanged` into a no-op there left the gate green, though a key re-entered under Settings after a 401 would then
  leave the provider's models refused for the rest of the application session. `commands/providers.test.ts` now drives
  `providersCommands` with a stand-in provider service and a spy recovery, and each case fails without its call. Writing it
  showed the release keyed to the command's answer rather than to the credential store, wrong both ways: a sign-out that
  failed, named no known provider or found nothing stored released the pairs although no credential changed; and a save
  whose key **was** stored but whose discovered models could not be recorded (`catalog`) released nothing although the
  credential changed. `replaceKey` now answers with its refusing stage (`ReauthenticationOutcome`, as the dialog's key path
  does); `providers.save` releases on success or `catalog`, `providers.signOut` only on `signed-out`. A sign-in that signed
  in, and a removal that succeeded, release; a refused sign-in, a blank key, a base URL alone, an earlier refusal of the
  key and a refused removal do not.
  - *In memory, both halves.* Besides the refused pairs, the focus gate's held class publication
    (`RunFailurePublisher.held`) lives only in memory: after an application restart a background 401 that was waiting for
    its session's focus never opens its dialog, and only REQ-NOTIFY-032's warning remains (persistent, with the failure text
    and the action focusing the session).

~~**Why the note is still open.** Parts C and D are built; A and B are not on this base (above).~~ The note closes when the
first-failure fallback restart and the non-modal prompt land — `fin6-auth-recovery-1` or a rebuild of it — and then the
reading recorded above (every authentication failure opens the dialog) is retired. *Both landed beside C and D on
`fin6-auth-recovery-1` on 2026-10-02 (below).*

## Specs

- REQ-NOTIFY-060 — the authentication class is matched first; here it is never matched.
- REQ-NOTIFY-067..079 — the authentication recovery (fallback restart, re-authentication prompt, recovery dialog) is not
  built. *Since 2026-10-02 (parts C and D): REQ-NOTIFY-067's classifier, the recovery dialog (REQ-NOTIFY-072..075/079/080)
  and its key path (REQ-NOTIFY-076/077) are built; ~~REQ-NOTIFY-070/071/078 are not~~ (parts A and B, merged beside them the
  same day: REQ-NOTIFY-070's restart ahead of the dialog, REQ-NOTIFY-071/078's prompt, REQ-NOTIFY-079's closing of the prompt
  by the dialog), and REQ-NOTIFY-076's device-code and browser branch says the method is unavailable.*
- REQ-NOTIFY-064 — the generic failure notice states neither that the session and the draft were kept nor offers the
  action returning to the workspace view. *Built 2026-10-02 (`genericFailureNotice` in
  `apps/desktop/src/main/run-failure-notice.ts`; pinned by its test and `resilience-proof`'s `generic` scenario).*
- REQ-NOTIFY-068 holds: a 401 is not retried (`resilience-proof`'s `fatal` asserts one call). *Since repair round 1, no
  pair that failed authentication is offered or retried again until its provider's credentials change.*
- REQ-NOTIFY-030/032 — *since repair round 1 a failure of a session no main window follows raises REQ-NOTIFY-032's warning
  and holds its class publication (the dialog included) until the session is followed.*

## Relevant files

- `apps/desktop/src/main/index.ts` — the run-result handler: ~~the quota class (REQ-NOTIFY-063) and the bare fallback
  `raiseNotice(sev, e.result.summary, e.result.error)`, with no authentication class ahead of them~~ since 2026-10-02
  `runEndingPublication` and the focus gate, the automatic fallback (`authFallback`) and the dialog (`authRecovery`) wired.
- `apps/desktop/scripts/resilience-proof.mjs` — ~~the `fatal` scenario, which shows the notice a 401 gets today~~ `fatal`,
  `reauth`, `generic` and `auth-fallback` (four launches).
- `apps/desktop/src/run-host/scripted-client.ts` — the `fail:401` fault step, and since 2026-10-02 its `:only=` and
  `:unless-key=` forms.
- `apps/desktop/src/main/run-failure-notice.ts` — every run-ending notice's words and the focus gate (repair round 1).
- `apps/desktop/src/main/failure-class.ts`, `apps/desktop/src/main/auth-recovery.ts`, `packages/ui/src/AuthRecoveryDialog.tsx`,
  `packages/providers/src/signin.ts` (`reauthentication`, `reauthenticateWithKey`), `packages/engine/src/sessions.ts`
  (`authRecoveryFacts`, `restartAfterAuthFailure`) — parts C and D.
- `apps/desktop/src/main/auth-fallback.ts` (`failure-recovery.ts` until the merge), `apps/desktop/src/main/commands/reauth.ts`,
  `packages/engine/src/sessions.ts` (`restartOnFallback`, `repinPrimary`), `packages/engine/src/run/run.ts`
  (`recordRootModelFailure`, `rebuildEntryFromMemory`) — parts A and B.
- `packages/ui/src/ReauthPrompt.tsx`, `packages/ui/src/WorkspaceView.tsx` (`reauthPrompt`), `packages/ui/src/shell.css`
  (`.reauth-prompt`, the `reauth` grid row) — part B's prompt and its placement.

## Progress — part A built 2026-10-02 (on `fin6-auth-recovery-1`)

The triage split this gap in four parts (A to D). **Part A** (REQ-NOTIFY-060/064/067/068/069/070, REQ-MONITOR-147's first
half, REQ-SESSION-026, REQ-CONFIG-067) is built:

- **The classes.** `apps/desktop/src/main/failure-class.ts` classifies a run's failure text in REQ-NOTIFY-060's order —
  authentication by REQ-NOTIFY-067's markers (`401` standing alone, so `4010` does not match), the sandbox class (never
  matched: nothing reports a refused sandboxed launch to main), quota, anything else — pinned by a table in
  `failure-class.test.ts`. ~~`apps/desktop/src/main/failure-recovery.ts` is now the one writer of a run failure's notice.~~
  *Since the merge beside parts C and D, `run-failure-notice.ts` is (its classifier twin was the same table; the two are one
  file, both tables kept), and `failure-recovery.ts`, renamed `auth-fallback.ts`, holds the automatic half alone.*
- **The generic notice** (REQ-NOTIFY-064): "The run failed", "The session and the draft were kept.", the failure text as
  detail, ~~`Return to the workspace`~~ (`open-view: workspace`) — ~~`failure-recovery.test.ts`, and `resilience-proof`'s
  `fatal`~~. *At the merge part C's twin of it was kept — the same words, the action labelled **Back to the workspace**,
  pinned by `run-failure-notice.test.ts` and `generic` — and this one removed.*
- **The first authentication failure** (REQ-NOTIFY-070): with a run channel and the session's configuration service
  (REQ-NOTIFY-069), main asks the run host `session.restartOnFallback`; `Sessions.restartOnFallback` reads the model the
  root's failing call was addressed to (`Run.failedEntryModel`), pins `fallback_model` keyed by that pair as the
  session's model override — the `model_override` timeline entry (`cause: authentication`) that `ResilienceMemory`
  rehydrates, so the pin outlives the failed run and a reload — and re-submits the last prompt. Main raises an error
  acknowledgement naming both models. ~~A refusal (no fallback, the fallback being the model that failed, no prompt), a
  restart that cannot begin (the pin taken back with `cleared: true`), or a second authentication failure publishes the
  generic notice.~~ *Since the merge beside part C:* no usable fallback (none, the fallback being the model that failed, or
  the failed model unknown) and a second authentication failure open the recovery dialog; no prompt, a restart that cannot
  begin (the pin taken back with `cleared: true`), a missing run channel or configuration service publish the generic
  notice. The system row announcing the restart is written only once the restart has begun (every refusal
  passed, just before the restarted prompt's user row), so a restart that cannot begin leaves no row claiming one — the
  first build wrote it ahead of `prompt`'s refusals and left it standing beside the generic notice, which the verifier of
  2026-10-02 found; the "cannot begin" case now asserts the rows. Where the restart fails after the announcement (the
restarted prompt's own user row cannot be written), a second row says it could not restart and the session stays on the
failed pair, and the pin is taken back — pinned by the "user row cannot be written" case (second repair round). Pinned in `packages/engine/src/run/ladder.test.ts` ("REQ-NOTIFY-070 / REQ-MONITOR-147 /
  REQ-SESSION-026 …"), `resilience.test.ts`, `autopsy.test.ts`, and shown by `resilience-proof`'s new `auth-fallback`
  scenario (`fail:401:only=scripted`, `fallback_model: beta`). REQ-NOTIFY-068 holds: the 401 is not retried on the pair.
- **Plan mode** (third repair round, 2026-10-02). A first 401 in a session whose run starts in plan mode
  (`runtime.run_start_mode: plan`, REQ-ORCH-152/153) fell on the plan cycle's turn, which recorded the run's failure but
  not the model it was calling (`failedModel` was set by an iteration's failed turn alone), so `restartOnFallback` refused
  it with `no-model-failure` and the generic notice was published — no restart, no prompt (the verifier's reproduction in
  the built app). Every root turn now records the two together (`Run.recordRootModelFailure`, from `iterate` and from
  `parkAtPlanGate`). The restart re-submits the prompt under the same mode, so it is a plan cycle on the fallback that parks
  at the gate. Pinned by the REQ-ORCH-153 case in `ladder.test.ts` (red on the code before: `no-model-failure`) and a
  plan cycle that ends on no model failure still refused; shown by `auth-fallback`'s third launch, `auth-fallback-plan`.
- **A revise cycle** (fourth repair round, 2026-10-02, the verifier's blocking finding). The plan-mode repair above made
  every plan cycle's turn record the failed model — the cycle a **revise** launches included — and the restart re-submitted
  the session's last user row through `promptHeld`, which carries no plan override: so a revise whose turn failed on a first
  401 came back as an ordinary new cycle from the original prompt (`changes: ''`), the changes the user stated and the plan
  they revised reaching the fallback nowhere (REQ-ORCH-154: revise "starts a further plan cycle with the plan as it
  currently stands and the changes stated"), and the prompt shown sent twice. An approved plan's run failing the same way
  lost the user's edit of the plan. **Root cause:** a restart rebuilt the failed run's launch from the last user row alone,
  so anything that launch carried beyond it — a plan decision's section, its cycle and its changes — was dropped. The
  dialog's restarts (`restartAfterAuthFailure`, parts C and D) shared it. **Repair:** every authentication restart relaunches
  what the failed run was launched to do (`Sessions.relaunchAfterAuthFailure`): `planDecision` records the decision with the
  run it launched (`Live.planLaunch`: approve or revise, the cycle, the plan as it stood — the edit where there is one — and
  the changes), and a restart of THAT run relaunches the same decision (`relaunchPlanDecision`: the same plan section, the
  same cycle override, the gate left as the decision settled it, nothing re-submitted, since a decision is no prompt); any
  other run re-submits the last prompt as before. The relaunch lets the todo decide whether to append the request: a failed
  revise cycle took up no task, so the work is still pending and nothing is appended; a failed approved run abandoned its
  task (REQ-ORCH-074), so the request is appended again and the plan carried out, as a re-submitted prompt's would be.
  Pinned by four `ladder.test.ts` cases — a revise relaunched on the fallback (its changes and the plan it revised in the
  fallback's request, cycle 2 with the changes, one user row, and approving it carries the work out once), an approval
  relaunched with the user's edit, the dialog's restart of a failed revise, and a later prompt's restart re-submitting that
  prompt — the first three red on the code before (the fallback's request held no `USE-THE-ZEBRA-LIBRARY`, no
  `THE-EDITED-STEP`); shown by `resilience-proof`'s new driven `auth-fallback-revise` launch, red on a build of the code
  before ("the restarted revise at the gate did not hold": cycle 2 recorded with `changes: ''` and the prompt in two user rows)
  and green after (calls `scripted/alpha`, `deepseek/alpha`, `scripted-b/beta`; cycle 2 with the changes; one user row; the
  gate reading "You asked for: USE-THE-ZEBRA-LIBRARY" beside the prompt's bar).
- **Readings** the build proceeds under (the restart re-submits the prompt as a new row — a plan decision's run relaunched
  as that decision instead, since the fourth repair round — a restart that cannot begin takes the pin back, the
  first-failure bookkeeping lives in main for the process's life): OQ-182 (raised as OQ-177, renumbered
  OQ-179, then OQ-180, then OQ-182 at the branch's merges).

## Progress — part B built 2026-10-02

**Part B** (REQ-NOTIFY-071/078, ADR-0048's non-modal window-level level) is built: a successful fallback restart opens
`packages/ui/src/ReauthPrompt.tsx` ~~in the window that follows the session~~ (superseded by both repair rounds below: in
every main window, drawn for the followed session alone, in flow in the Workspace view; channel 13, `reauth:prompt`). It names the
primary that failed, states that the run continues on the fallback and that re-authenticating switches back from the next
iteration, quotes the provider's error, and offers "Keep the fallback" (the dismissal, `reauth.dismiss`). Its submit
(`reauth.submit`) saves a key typed for a key-based provider through the credential store (`providers.replaceKey`; a key
that cannot be stored is acknowledged as an error naming why and the prompt stays), clears main's first-failure
bookkeeping, and has the run host re-pin the primary (`Sessions.repinPrimary`: the pin taken back with `cleared: true`, and
a live run rebuilding the root's cell at its next turn, `Run.rebuildEntryFromMemory`); the acknowledgement says "from the
next iteration" or "for the next run". **A device-code or browser provider is offered no key field: the prompt states in
the provider service's own words (`unavailableMethodMessage`) that this build does not provide that sign-in yet**, since
those flows are owed (`packages/providers/src/catalogue.ts`); a provider the application holds no credential for (one
configured by model configuration alone) is told where its key comes from. Switching back without a key is offered in
every case. Pinned by `packages/ui/src/reauth-prompt.test.ts` (its copy and state), `apps/desktop/src/main/failure-recovery.test.ts` (now `auth-fallback.test.ts`)
(the prompt's answers) and the REQ-NOTIFY-078 case in `packages/engine/src/run/ladder.test.ts` (the switch from the next
iteration; a reload replays it); shown by `resilience-proof`'s `auth-fallback` (the prompt present, its words, and the
composer usable behind it — the element under its own centre, focused, enabled, no `aria-modal`).

*Repair round, 2026-10-02 (the verifier's findings on part B).* The prompt was first mounted beside the shell `fixed` at
the window's top corner (copied from `.project-setup`) and covered the title bar's session browser, minimise, maximise,
close and the notice's dismissal while open; it ~~is now~~ was then drawn in AppShell's `windowPanel` slot inside the rail-and-view
region, below the title bar and the notice slot (superseded by the second round below), and `auth-fallback` asserts every title-bar and notice-slot button is
the element under its own centre (the same fault in the setup dialog is recorded in
[`the-project-setup-dialog-is-drawn-over-the-title-bar-window-controls.md`](the-project-setup-dialog-is-drawn-over-the-title-bar-window-controls.md)).
It was also one prompt per window, sent to the window following the session, so it stood over whichever session that
window focused next and acted on its own; channel 13 now carries `{sessionId, prompt}` to every main window, each holds
the prompts by session and draws the followed session's alone (REQ-NOTIFY-030; `reauthPromptFor` in
`reauth-prompt.test.ts`), and `reauth.read` gives a reloaded or new window the prompts already open. A re-pin that fails
now leaves the first-failure bookkeeping standing (the session is still on the fallback; `failure-recovery.test.ts`, now `auth-fallback.test.ts`).

*Second repair round, 2026-10-02.* The `windowPanel` placement was still an overlay: at REQ-SHELL-022's 1000x680 minimum
it covered the run header's model and reasoning switches and Compress context, under an API-key provider's taller prompt
the composer's submit, and in the other views their top-right controls; the proof had measured only the opening size
with the shortest prompt. The prompt is now **laid out in flow**: the Workspace view draws it (`WorkspaceView`'s
`reauthPrompt`) as its own grid row, `reauth`, between the run header and the transcript, in every template of the view's
grid, and AppShell's `windowPanel` slot is gone. The transcript keeps REQ-CHAT-010's floor and the prompt takes what is
left ~~at every size~~ (falsified beside an expanded plan gate: third round below); shorter than it needs, the card scrolls with its answers (the key field and the two buttons, one wrapping row)
pinned sticky to its floor, as the plan gate's are, and the key's hint describes the field. Where "beside the continuing
run" stands, and that the prompt is not drawn while another view is shown, is raised as **OQ-181** (raised as OQ-180,
renumbered at the merge beside parts C and D) with that reading.
Pinned by `reauth-prompt.test.ts` (the prompt's row in the Workspace view, no `fixed`/`absolute`/`z-index` in its rule, the
`reauth` area and a `minmax(0, auto)` track in every grid template, the sticky answers); shown by `auth-fallback` in two
launches — the opening size with alpha on `scripted` (no key field) and 1000x680 with alpha on `deepseek` (an API-key
provider, with the key field) — each asserting that no on-screen control outside the prompt has the prompt at its centre
(`underPrompt` empty: 45 and 33 controls tested) and that the prompt's own key field and answers are each the element
under their own centre. The proof run against the second placement failed at its first launch with `Persona|orchestrator|Agent model` under the prompt.

*Third repair round, 2026-10-02.* "The prompt takes what is left" held only while the transcript is drawn. Beside an
EXPANDED plan gate the transcript is not drawn and the gate's row is `minmax(0, 1fr)`, floor 0; an `auto` maximum is grown
before a flexible track is expanded (CSS Grid §12.5-12.7), so the prompt took its whole height first and, at 1000x680 with
the key field, left the gate 42 px with Approve, Revise and Cancel — the three answers the run is stopped on
(REQ-ORCH-153) — unreachable (the verifier's measurement). The state is reachable as soon as a plan-mode 401 restarts (part
A's plan-mode repair above), and by keeping the fallback and sending the next prompt in plan mode. Beside an expanded gate
the prompt now **yields as the transcript does** (PD-ORCH-002 revision 2: one action away): it is drawn as a **bar**, its
title and its answers (the key field with its label inline, and the two buttons) on one wrapping row, nothing pinned since
nothing scrolls, and no height written; its sentence, the provider's words and the key's hint stay in the document (the
dialog's description) and are drawn again the moment the gate is collapsed or answered. The gate's row takes the rest at
every size from REQ-SHELL-022's minimum up (*corrected 2026-10-06*: true, but it did not keep the plan the largest part
of the gate, as the next sentences take it to. With a persistent notice on screen the rest at the minimum is short of the
gate's parts, and every part but the plan kept its content height. finacc2's acceptance (A2) read the plan 18 px beside the todo's 56 at 1000x680
with this bar and a "Session … failed" notice; repaired by a floor for the plan and a todo that yields first,
`docs/defects/fixed/the-expanded-plan-gate-gives-the-whole-loss-to-the-plan-when-a-notice-shares-the-window.md`). A bounded band (a fixed `max-height` in tokens) was the first form of this
repair and was dropped before it was committed: weighed against the gate's parts as the proof measured them (heading,
intent, todo, revision field and answers, about 210 px of the roughly 380 px the two rows share at 1000x680), any band that
still holds the prompt's title and answers leaves the plan no height, where PD-ORCH-002 makes it the largest part of the
gate. Pinned by `reauth-prompt.test.ts` (the bar's rules keyed on the expanded gate alone, no height written, nothing else
hiding the prompt's words — red before); shown by `auth-fallback-plan` at 1000x680 with the key field, which asserts the
gate expanded, the prompt drawn as its bar, each of the gate's three answers and each of the prompt's controls the element
under its own centre, and the plan the largest part of the gate (red on the code before: the gate 82 px, the plan 18).

~~**Still owed:** part C, REQ-NOTIFY-072's 560 px
recovery dialog on a second failure or with no usable fallback (until it lands both take the generic notice, and `fatal`
asserts that notice rather than the dialog); part D, the dialog's re-authenticate path (REQ-NOTIFY-076/077).~~ *Built on
`fin6-auth-recovery-2` and merged here, 2026-10-02 (above and below).* Device-code
and browser re-authentication can only say the method is unavailable, since those sign-in flows are still owed
(`packages/providers/src/catalogue.ts`).

## The four parts together — merged 2026-10-02

`origin/main` took parts C and D (`fin6-auth-recovery-2`, built on `dc796f5` without A and B) while A and B stood on
`fin6-auth-recovery-1`; the branch's fourth repair round merged them. Both had built REQ-NOTIFY-060's classifier and
REQ-NOTIFY-064's notice; the merge keeps one of each and orders the rest:

- **One classifier, one writer of the words.** `apps/desktop/src/main/failure-class.ts` is part C's
  (`classifyRunFailure`, `isQuotaFailure`), its test the union of both tables (`4010`, `1401`, `E401x`, `401_error` not
  matching). Every run-ending notice is `run-failure-notice.ts`'s, behind the focus gate (REQ-NOTIFY-030/032).
- **The automatic fallback ahead of the dialog** (REQ-NOTIFY-070 before REQ-NOTIFY-072). The focus gate
  (`RunFailurePublisher.publish`) asks `main/auth-fallback.ts` first for an authentication failure: a first failure with a
  usable fallback restarts on it (its acknowledgement, the prompt) and nothing more is published; a second failure, or a
  first with no usable fallback — the run host's refusal codes `session.no-fallback`, `session.fallback-failed`,
  `session.no-model-failure` (`NO_USABLE_FALLBACK`) — opens the dialog beside the class's notice; REQ-NOTIFY-069's
  preconditions or a restart that cannot begin publish the generic notice; a run active again raises nothing. A first
  failure with no usable fallback spends the session's first failure, so a model chosen by hand that fails too reopens the
  dialog and never the fallback (REQ-NOTIFY-075); and an unfocused session's restart waits for its focus with the rest of
  its class's publication — both readings added to OQ-182.
- **REQ-NOTIFY-079.** The dialog's opening closes every re-authentication prompt open (`closePrompts` →
  `closeAllPrompts`), each session keeping its fallback.
- **REQ-NOTIFY-068 across the two halves.** The primary the automatic fallback restarted away from joins the dialog's
  refused pairs (`AuthRecovery.refuse`), so a dialog opened after the fallback failed too offers neither; a key saved
  through the prompt goes through the dialog's key path (`ProviderService.reauthenticateWithKey`: validated, stored, the
  refusing stage named — REQ-NOTIFY-077's acknowledgement for a storage failure alone) and releases the provider's pairs
  (`credentialsChanged`).
- **The prompt's method** is read as the dialog reads it (`ProviderService.reauthentication`): a key-based provider gets the
  key field, a device-code or browser provider the unavailable sentence, one whose key the model configuration carries
  (OQ-179) the offer to switch back alone.

Pinned by `run-failure-notice.test.ts` (the order: a restart publishes nothing more and opens no dialog; the dialog's
opening closes the prompts; an unfocused session's restart waits for its focus), `auth-fallback.test.ts` (the refusal
codes, the spent first failure, the refused primary, the key's stages, `closeAllPrompts`), `failure-class.test.ts`, and the
two `ladder.test.ts` blocks (A's and C's restarts side by side, one harness option `configureRefusesFrom`). The proofs:
`fatal` (no usable fallback: the automatic fallback asked first and finding none, then the dialog), `auth-fallback` (the
restart, no dialog), and the new `auth-fallback-dialog` (driven; the fallback refused too: the dialog naming beta, the
prompt closed as it opened, neither alpha nor beta offered, the run completed on gpt-4o).

~~**Why the note is still open.** The fourth repair round's blocking finding is part A's: a revise cycle that failed on a
first 401 was restarted from the original prompt as a fresh plan cycle, dropping the stated changes and the plan they
revised.~~ Repaired the same day (part A's fourth-round bullet above).

## Outcome — repaired 2026-10-02

A 401 no longer ends the run with a bare notice. A failed run is classified in REQ-NOTIFY-060's order and published
behind the focus gate; an authentication failure takes the automatic fallback on the session's first failure (the pin, the
acknowledgement, the restart with the same prompt — or the same plan decision — and the non-modal re-authentication prompt
beside the continuing run), and the 560 px recovery dialog on a second failure or where no usable fallback exists (other
providers' models first, the provider's error, Retry, the re-authenticate path, Cancel); anything else takes REQ-NOTIFY-064's
notice with the action back to the workspace. Pinned by `failure-class.test.ts`, `run-failure-notice.test.ts`,
`auth-fallback.test.ts`, `auth-recovery.test.ts` (main and ui), `reauth-prompt.test.ts`, `signin.test.ts`,
`commands/providers.test.ts`, `ladder.test.ts`, `resilience.test.ts`, `autopsy.test.ts` and `scripted-client.test.ts`;
shown by `pnpm resilience-proof`'s `fatal`, `reauth`, `generic`, `auth-fallback` (three launches),
`auth-fallback-dialog` and `auth-fallback-revise`.

**Not met, and not this note's:** REQ-NOTIFY-076's second branch — "for browser and device-code providers it starts that
provider's own flow in place … and offers a control confirming that re-authentication has been completed" — waits for the
device-code and browser-PKCE authenticators the build does not have (`packages/providers/src/catalogue.ts`'s header;
[`../../architecture/first-release-plan.md`](../../architecture/first-release-plan.md)'s deferred product gaps); until they
exist the dialog and the prompt say the method is not provided by this build. **Open questions** the build proceeds under:
OQ-179 (a provider whose key the model configuration carries), OQ-182 (the restart's readings), OQ-181 (where the prompt
stands).
