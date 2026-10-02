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
- **D — not yet built** (the same bundle's next task).

## Specs

- REQ-NOTIFY-060 — the authentication class is matched first; here it is never matched.
- REQ-NOTIFY-067..079 — the authentication recovery (fallback restart, re-authentication prompt, recovery dialog) is not
  built.
- REQ-NOTIFY-064 — the generic failure notice states neither that the session and the draft were kept nor offers the
  action returning to the workspace view.
- REQ-NOTIFY-068 holds: a 401 is not retried (`resilience-proof`'s `fatal` asserts one call).

## Relevant files

- `apps/desktop/src/main/index.ts` — the run-result handler: the quota class (REQ-NOTIFY-063) and the bare fallback
  `raiseNotice(sev, e.result.summary, e.result.error)`, with no authentication class ahead of them.
- `apps/desktop/scripts/resilience-proof.mjs` — the `fatal` scenario, which shows the notice a 401 gets today.
- `apps/desktop/src/run-host/scripted-client.ts` — the `fail:401` fault step.
