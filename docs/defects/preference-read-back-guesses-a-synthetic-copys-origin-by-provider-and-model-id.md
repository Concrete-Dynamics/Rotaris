## Preference read-back guesses a synthetic copy's origin by provider and model id

The model-preference read-back (`slotPreferences` and the role records in `packages/config/src/preferences.ts`) unwraps a
loader-owned synthetic name (`__startup_slot__:<slot>`, `__persona__:<role>`) with `unwrapSynthetic`, which does not know
the copy's origin: it returns the first non-synthetic `models:` key with the same `provider` and `model_id`, ignoring the
key the copy was actually made from (and `base_url`). Where two keys name the same provider model — every endpoint
registered for the live run has provider `openai-compatible`, so two endpoints serving one model id collide — a role on
`openai-compatible--beta/qwen` with `thinking` set reads back as `openai-compatible--alpha/qwen`, and an editor offering
that value would silently move the role to the other endpoint.

Noticed 2026-09-29 while repairing live-run finding D5 on `fix-child-spawn` (verifier round 1), where the same guess put a
child under the wrong key. The loader now records each copy's source key (`LoadedConfiguration.syntheticOrigins`,
`syntheticOriginOf` in `packages/config/src/slots.ts`); the read-back does not yet use it.

## Specs

- `REQ-CONFIG-253`: a slot absent from the raw file "falls back to the resolved configuration with synthetic names
  unwrapped" — unwrapped to the model the synthetic was copied from, not to another key naming the same provider model.
- `REQ-CONFIG-255`: "the effective resolved model with a role-level synthetic unwrapped".
- `REQ-CONFIG-094` states the distinction the guess erases: two `models:` keys naming the same provider model are
  different entries.

## Relevant files

- `packages/config/src/slots.ts` — `unwrapSynthetic`, the guess; `syntheticOriginOf` and `SlotResolution.syntheticOrigins`, the recorded origin.
- `packages/config/src/preferences.ts` — the two `unwrapSynthetic` calls (the slot fallback and the role's effective model).
- `packages/config/src/load.test.ts` — the existing `unwrapSynthetic` test, which uses a configuration with one key per provider model.
