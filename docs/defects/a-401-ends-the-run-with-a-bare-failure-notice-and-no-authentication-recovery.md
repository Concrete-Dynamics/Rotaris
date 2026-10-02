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
([`fixed/resilience-proofs-cancel-scenario-reads-a-failed-project-setup-in-place-of-the-limit-notice.md`](fixed/resilience-proofs-cancel-scenario-reads-a-failed-project-setup-in-place-of-the-limit-notice.md)).
The scenario now asserts what the product does — the 401's failure text as the notice's detail, no retry, no wait — and
not the recovery above; it should assert REQ-NOTIFY-072's dialog (with no fallback configured) once the class is built.
Recorded, not repaired: building the class is product work of its own (a dialog surface, a fallback restart, a
re-authentication path).

## Parts built — the note stays open until every part has landed

The third triage (2026-10-02) split the repair in four parts over two bundles: **A** the classifier, REQ-NOTIFY-064's generic
notice and the first-failure fallback pin and restart (REQ-NOTIFY-060/064/067..070); **B** the non-modal re-authentication
prompt (REQ-NOTIFY-071/078); **C** the 560 px modal recovery dialog (REQ-NOTIFY-072..075/079/080); **D** its re-authenticate
path (REQ-NOTIFY-076/077).

- **A and B are not on `origin/main`.** They were built on `fin6-auth-recovery-1`, which ended unverified and did not merge.
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
    beta are both absent and gpt-4o is what is left. In memory: an application restart forgets the set.
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
    against the filtered list and the refused pairs (`AuthRecovery.retry`) rather than the payload alone.

**Why the note is still open.** Parts C and D are built; A and B are not on this base (above). The note closes when the
first-failure fallback restart and the non-modal prompt land — `fin6-auth-recovery-1` or a rebuild of it — and then the
reading recorded above (every authentication failure opens the dialog) is retired.

## Specs

- REQ-NOTIFY-060 — the authentication class is matched first; here it is never matched.
- REQ-NOTIFY-067..079 — the authentication recovery (fallback restart, re-authentication prompt, recovery dialog) is not
  built. *Since 2026-10-02 (parts C and D): REQ-NOTIFY-067's classifier, the recovery dialog (REQ-NOTIFY-072..075/079/080)
  and its key path (REQ-NOTIFY-076/077) are built; REQ-NOTIFY-070/071/078 are not, and REQ-NOTIFY-076's device-code and
  browser branch says the method is unavailable.*
- REQ-NOTIFY-064 — the generic failure notice states neither that the session and the draft were kept nor offers the
  action returning to the workspace view. *Built 2026-10-02 (`genericFailureNotice` in
  `apps/desktop/src/main/run-failure-notice.ts`; pinned by its test and `resilience-proof`'s `generic` scenario).*
- REQ-NOTIFY-068 holds: a 401 is not retried (`resilience-proof`'s `fatal` asserts one call). *Since repair round 1, no
  pair that failed authentication is offered or retried again until its provider's credentials change.*
- REQ-NOTIFY-030/032 — *since repair round 1 a failure of a session no main window follows raises REQ-NOTIFY-032's warning
  and holds its class publication (the dialog included) until the session is followed.*

## Relevant files

- `apps/desktop/src/main/index.ts` — the run-result handler: the quota class (REQ-NOTIFY-063) and the bare fallback
  `raiseNotice(sev, e.result.summary, e.result.error)`, with no authentication class ahead of them.
- `apps/desktop/scripts/resilience-proof.mjs` — the `fatal` scenario, which shows the notice a 401 gets today.
- `apps/desktop/src/run-host/scripted-client.ts` — the `fail:401` fault step, and since 2026-10-02 its `:only=` and
  `:unless-key=` forms.
- `apps/desktop/src/main/run-failure-notice.ts` — every run-ending notice's words and the focus gate (repair round 1).
- `apps/desktop/src/main/failure-class.ts`, `apps/desktop/src/main/auth-recovery.ts`, `packages/ui/src/AuthRecoveryDialog.tsx`,
  `packages/providers/src/signin.ts` (`reauthentication`, `reauthenticateWithKey`), `packages/engine/src/sessions.ts`
  (`authRecoveryFacts`, `restartAfterAuthFailure`) — parts C and D.
