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

## Progress — part A built 2026-10-02 (the note stays open until part D)

The triage split this gap in four parts (A to D). **Part A** (REQ-NOTIFY-060/064/067/068/069/070, REQ-MONITOR-147's first
half, REQ-SESSION-026, REQ-CONFIG-067) is built:

- **The classes.** `apps/desktop/src/main/failure-class.ts` classifies a run's failure text in REQ-NOTIFY-060's order —
  authentication by REQ-NOTIFY-067's markers (`401` standing alone, so `4010` does not match), the sandbox class (never
  matched: nothing reports a refused sandboxed launch to main), quota, anything else — pinned by a table in
  `failure-class.test.ts`. `apps/desktop/src/main/failure-recovery.ts` is now the one writer of a run failure's notice.
- **The generic notice** (REQ-NOTIFY-064): "The run failed", "The session and the draft were kept.", the failure text as
  detail, `Return to the workspace` (`open-view: workspace`) — `failure-recovery.test.ts`, and `resilience-proof`'s `fatal`.
- **The first authentication failure** (REQ-NOTIFY-070): with a run channel and the session's configuration service
  (REQ-NOTIFY-069), main asks the run host `session.restartOnFallback`; `Sessions.restartOnFallback` reads the model the
  root's failing call was addressed to (`Run.failedEntryModel`), pins `fallback_model` keyed by that pair as the
  session's model override — the `model_override` timeline entry (`cause: authentication`) that `ResilienceMemory`
  rehydrates, so the pin outlives the failed run and a reload — and re-submits the last prompt. Main raises an error
  acknowledgement naming both models. A refusal (no fallback, the fallback being the model that failed, no prompt), a
  restart that cannot begin (the pin taken back with `cleared: true`), or a second authentication failure publishes the
  generic notice. The system row announcing the restart is written only once the restart has begun (every refusal
  passed, just before the restarted prompt's user row), so a restart that cannot begin leaves no row claiming one — the
  first build wrote it ahead of `prompt`'s refusals and left it standing beside the generic notice, which the verifier of
  2026-10-02 found; the "cannot begin" case now asserts the rows. Pinned in `packages/engine/src/run/ladder.test.ts` ("REQ-NOTIFY-070 / REQ-MONITOR-147 /
  REQ-SESSION-026 …"), `resilience.test.ts`, `autopsy.test.ts`, and shown by `resilience-proof`'s new `auth-fallback`
  scenario (`fail:401:only=scripted`, `fallback_model: beta`). REQ-NOTIFY-068 holds: the 401 is not retried on the pair.
- **Readings** the build proceeds under (the restart re-submits the prompt as a new row, a restart that cannot begin takes
  the pin back, the first-failure bookkeeping lives in main for the process's life): OQ-179.

## Progress — part B built 2026-10-02

**Part B** (REQ-NOTIFY-071/078, ADR-0048's non-modal window-level level) is built: a successful fallback restart opens
`packages/ui/src/ReauthPrompt.tsx` in the window that follows the session (channel 13, `reauth:prompt`). It names the
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
every case. Pinned by `packages/ui/src/reauth-prompt.test.ts` (its copy and state), `apps/desktop/src/main/failure-recovery.test.ts`
(the prompt's answers) and the REQ-NOTIFY-078 case in `packages/engine/src/run/ladder.test.ts` (the switch from the next
iteration; a reload replays it); shown by `resilience-proof`'s `auth-fallback` (the prompt present, its words, and the
composer usable behind it — the element under its own centre, focused, enabled, no `aria-modal`).

*Repair round, 2026-10-02 (the verifier's findings on part B).* The prompt was first mounted beside the shell `fixed` at
the window's top corner (copied from `.project-setup`) and covered the title bar's session browser, minimise, maximise,
close and the notice's dismissal while open; it is now drawn in AppShell's `windowPanel` slot inside the rail-and-view
region, below the title bar and the notice slot, and `auth-fallback` asserts every title-bar and notice-slot button is
the element under its own centre (the same fault in the setup dialog is recorded in
[`the-project-setup-dialog-is-drawn-over-the-title-bar-window-controls.md`](the-project-setup-dialog-is-drawn-over-the-title-bar-window-controls.md)).
It was also one prompt per window, sent to the window following the session, so it stood over whichever session that
window focused next and acted on its own; channel 13 now carries `{sessionId, prompt}` to every main window, each holds
the prompts by session and draws the followed session's alone (REQ-NOTIFY-030; `reauthPromptFor` in
`reauth-prompt.test.ts`), and `reauth.read` gives a reloaded or new window the prompts already open. A re-pin that fails
now leaves the first-failure bookkeeping standing (the session is still on the fallback; `failure-recovery.test.ts`).

**Still owed:** part C, REQ-NOTIFY-072's 560 px
recovery dialog on a second failure or with no usable fallback (until it lands both take the generic notice, and `fatal`
asserts that notice rather than the dialog); part D, the dialog's re-authenticate path (REQ-NOTIFY-076/077). Device-code
and browser re-authentication can only say the method is unavailable, since those sign-in flows are still owed
(`packages/providers/src/catalogue.ts`).

