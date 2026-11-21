## The recovery surfaces do not start a browser or device-code sign-in in place

When a run fails authentication on a provider that signs in with a device code or on a browser page (`copilot`,
`codex`), the authentication recovery dialog and the re-authentication prompt cannot start that provider's flow. They
show a sentence sending the user to Settings → Models, where Re-authenticate opens the authentication window and runs
the flow. Since R-111 (2026-11-20) the flows exist; the two recovery surfaces were not connected to them. Before that
date both said the method was not provided by this build.

## Specs

REQ-NOTIFY-076: "For browser and device-code providers it starts that provider's own flow in place, on the terms of
REQ-NOTIFY-202, and offers a control confirming that re-authentication has been completed." REQ-NOTIFY-071/078 for the
non-modal prompt.

## Relevant files

- `apps/desktop/src/main/index.ts` — `recoveryMethodOf` maps the provider service's `interactive` method to `unavailable` with the sentence; `describeProvider` does the same for the prompt.
- `packages/providers/src/signin.ts` — `reauthentication` answers `interactive` for these providers; `signInInteractive` is the flow to start.
- `packages/contracts/src/auth-recovery.ts`, `packages/contracts/src/reauth.ts` — the two method vocabularies, neither of which has a value for an in-place flow.
- `packages/ui/src/AuthRecoveryDialog.tsx`, `packages/ui/src/ReauthPrompt.tsx` — the surfaces that would show the prompt and the confirming control.

## Repaired

2026-11-21, on [R-115](../../product/requests.md#r-115): both surfaces start the flow in place with the authentication window's own commands and offer the confirming control; main checks the provider before it restarts or switches back. Seen in the built application through the recovery dialog with the Claude Code tool; the non-modal prompt and a device-code or browser provider were not driven.
