## A key provider's Authenticate changes nothing on screen while its settings are closed

**Outcome: repaired 2026-11-11** on `feat/r-097-ui-ux-overhaul`, in the change that gave the providers card one filled
control ([`PD-CONFIG-009`](../../product/directives/pd-config-009.md#pd-config-009)). The press opens the row's settings
and states its sentence there: `authenticatePress` in `packages/ui/src/settings/Providers.tsx` decides which of the two
a press does, `packages/ui/src/settings/Providers.test.ts` holds it, and a drive of the built application read the
opened settings and the sentence after one press on DeepSeek's row.

Found on 2026-11-11 while measuring the Models category for the critique's UIR-307, and reproduced on the built
application at `ab29f51b` (`pnpm app:drive`, 1000×680). A provider whose sign-in method is `api-key` has no flow to
start, so its row's Authenticate set a sentence ("Enter a replacement key above and save it.") in the row's own state.
That sentence is drawn inside the row's settings, which the press did not open. With the settings closed, as they are
when the category opens, the press changed nothing on screen: no settings, no sentence, no dialog. Three of the six
built-in rows are key providers (`claude-code`, `deepseek`, `openai-compatible`), and Authenticate was each row's filled
control.

## Specs

REQ-PROVIDER-050, of DeepSeek, "a plain API-key provider": its interactive authenticate step "always fails with a message
stating that the provider uses a stored API key and that the key is created or replaced from provider settings". The
build gives every `api-key` provider's row that answer. The message existed and was not shown.

## Relevant files

- `packages/ui/src/settings/Providers.tsx` — the row, `authenticatePress`, `KEY_PROVIDER_AUTH_SENTENCE`.
- `packages/ui/src/settings/Providers.test.ts` — the rule's test.
