## Outcome: repaired 2026-11-21 (R-112, PD-PROVIDER-002)

The provider is connected through the Claude Code tool the user installed and signed in to, and a `claude-code` model is
answered by that tool started as a subprocess with its own tools switched off and the product's tools served to it
(`apps/desktop/src/run-host/claude-cli/`). No token is pasted or stored: the pasted-token sign-in this note describes
as "ready" was withdrawn by the directive rather than offered. REQ-PROVIDER-048's precheck runs before every prompt.

## Claude Code (subscription) cannot be signed in to, because no local runtime uses its token

The `claude-code` provider is refused at sign-in. Its pasted subscription token is validated, classified and
catalogued in `packages/providers/src/flows/claude-code.ts` (REQ-PROVIDER-045, 047), but nothing in the run host
serves a `claude-code/<alias>` model: there is no subscription runtime that launches the locally installed Claude
Agent SDK with the token (REQ-PROVIDER-049) and no conflicting-credential precheck (REQ-PROVIDER-048). A token stored
today could be used by no run, and the provider's three models would still seed the startup slots ahead of every
other provider's (`claude-code` sorts first among authenticated ids), so every run would start on a model nothing can
reach. Until the runtime exists the sign-in is refused before anything is stored, and the authentication window lists
the provider as not selectable with the reason (R-111, 2026-11-20). Before that date the refusal read "signs in with
"Paste an API key", which this build does not provide yet", which named the wrong thing.

## Specs

REQ-PROVIDER-008, REQ-PROVIDER-044 to REQ-PROVIDER-049 (the paste-token sign-in, static discovery, the precheck and the
runtime's environment contract); REQ-PROVIDER-116/117/142 (the provider is offered for sign-in).

## Relevant files

- `packages/providers/src/signin.ts` — `signInWithKey` refuses a `local-sdk` entry (`localRuntimeOwed`); `reauthentication` answers `unavailable` for it.
- `packages/providers/src/flows/claude-code.ts` — the token validation, the status classification and the static catalogue, ready for the sign-in.
- `apps/desktop/src/main/index.ts` — `providerChoices` lists the provider as unavailable with the reason.
- `apps/desktop/src/run-host/configuration.ts` — where a model reference becomes a client; it knows two dialects and no local runtime.
