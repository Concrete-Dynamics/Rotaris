## A discovered slot with a reasoning level reads back as built-in

`slotPreferences` (`packages/config/src/preferences.ts`) names a slot's origin `discovered` only when the resolved value is
string-equal to the value the snapshot layer supplied (`config.discoveredSlots[slot] === resolved`). A slot whose value the
snapshot supplied and whose reasoning level a file states (`small_model_thinking: high`, no `small_model`) resolves to the
loader's synthetic copy `__startup_slot__:small_model` (REQ-CONFIG-076), which never equals the discovered key, so the slot
reads back with the discovered key as its value and `built-in` as its origin. The Scope column (REQ-CONFIG-341) would then
report the default layer for a value the discovery snapshot contributed.

Noticed 2026-09-30 while repairing
[`fixed/preference-read-back-guesses-a-synthetic-copys-origin-by-provider-and-model-id.md`](fixed/preference-read-back-guesses-a-synthetic-copys-origin-by-provider-and-model-id.md)
(acceptance round 1, finding A42): in that repair's fixture (`packages/config/src/preferences.test.ts`, two endpoints, the
second's snapshot suggesting `small_model`, the workspace stating only `small_model_thinking: high`) the read-back's value is
`openai-compatible--beta/qwen` and its origin `built-in`, with `discoveredSlots` `{ small_model: 'openai-compatible--beta/qwen' }`.
Measured by a probe in that test, and in the built app: `pnpm app:drive`'s `config.read` over the same files answers
`{ slot: 'small_model', value: 'openai-compatible--beta/qwen', origin: 'built-in', thinking: 'high' }`. Not repaired there
(out of that task's scope).

## Specs

REQ-CONFIG-341: `discovered` marks a value contributed by the provider/model discovery snapshot layer (REQ-CONFIG-034);
the precedence chain reported is workspace > global > discovered > default. REQ-CONFIG-253: the fallback value is the
resolved configuration with synthetic names unwrapped — the origin comparison is made against the wrapped name.

## Relevant files

- `packages/config/src/preferences.ts` — `slotPreferences`, the `origin` comparison against the unwrapped-not-yet resolved value.
- `packages/config/src/load.ts` — `discoveredSlots`, the snapshot layer's slot values.
- `packages/config/src/preferences.test.ts` — the two-endpoint fixture that shows it.
