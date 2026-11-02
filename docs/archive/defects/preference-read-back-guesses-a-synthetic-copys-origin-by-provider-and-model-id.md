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

## Repaired 2026-09-30 under R-067 (acceptance round 1, finding A42)

Confirmed on the branch first: `packages/config/src/preferences.test.ts`, a new file over the real loader and the real
snapshot layer with two authenticated `openai-compatible` endpoints serving one model id (`alpha` inserted first), read the
second endpoint's synthetic slot copy back as `openai-compatible--alpha/qwen` and a role on the second endpoint with
`thinking: low` as `effectiveModel: openai-compatible--alpha/qwen` — two failing cases on the unrepaired code.

What changed: both read-backs in `packages/config/src/preferences.ts` — the slot fallback (REQ-CONFIG-253) and the role's
effective model (REQ-CONFIG-255) — unwrap through the origin the loader recorded when it made the copy
(`syntheticOriginOf` over `LoadedConfiguration.syntheticOrigins`), the same unwrap the run host's cap and meter keys already
use. `unwrapSynthetic`, the guess by `provider` and `model_id`, is deleted; its one other caller, a case in
`packages/config/src/load.test.ts`, now asks `syntheticOriginOf`.

Found while repairing it: `syntheticOriginOf` followed at most **four** recorded origins. A slot whose chain passes through
earlier slots' copies records the previous copy as its origin, so a chain of five or more slots with levels stopped on a
synthetic name — `__startup_slot__:improvement_collector_model` for `medium_model` in the new case — where the guess this
replaces had happened to reach a concrete key, and where the run host would have counted the cap under a synthetic name.
The walk now follows the recorded origins to the end and stops on a name already visited. Pinned by
`packages/config/src/load.test.ts` ("REQ-CONFIG-094/253: a slot chained through five earlier slots' copies still unwraps to
the key at the end of the chain"), which fails on the four-hop form with exactly that name.

Pinned by `packages/config/src/preferences.test.ts` (three cases: the slot, the role with a level, the role without one)
and the chained-slot case above; `pnpm vitest run packages/config/` 257 of 257 green under Node 24.

Shown in the built app (`pnpm build`, then `pnpm app:drive start` under Xvfb as root against a scratch workspace stating
`small_model_thinking: high` and a `verifier` role on `openai-compatible--beta/qwen` with `thinking: low`, and the same two
endpoints in the profile's `project_settings.yaml`): the renderer's `config.read`, answered by the workspace service,
reads `small_model` back as `openai-compatible--beta/qwen` and the verifier's effective model as
`openai-compatible--beta/qwen`, with both keys listed. No proof or live-run scenario found this note — it was found by
reading — and the live run cannot show it: one endpoint (`katalyst`) is registered, so no two keys collide.

The same read-back names that slot's origin `built-in` although the discovery snapshot supplied it; recorded, not repaired
here: [`a-discovered-slot-with-a-reasoning-level-reads-back-as-built-in.md`](a-discovered-slot-with-a-reasoning-level-reads-back-as-built-in.md), since repaired (2026-10-01).
