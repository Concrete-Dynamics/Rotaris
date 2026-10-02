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
