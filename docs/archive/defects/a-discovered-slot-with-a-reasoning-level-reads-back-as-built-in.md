## A discovered slot with a reasoning level reads back as built-in

`slotPreferences` (`packages/config/src/preferences.ts`) names a slot's origin `discovered` only when the resolved value is
string-equal to the value the snapshot layer supplied (`config.discoveredSlots[slot] === resolved`). A slot whose value the
snapshot supplied and whose reasoning level a file states (`small_model_thinking: high`, no `small_model`) resolves to the
loader's synthetic copy `__startup_slot__:small_model` (REQ-CONFIG-076), which never equals the discovered key, so the slot
reads back with the discovered key as its value and `built-in` as its origin. The Scope column (REQ-CONFIG-341) would then
report the default layer for a value the discovery snapshot contributed.

Noticed 2026-09-30 while repairing
[`preference-read-back-guesses-a-synthetic-copys-origin-by-provider-and-model-id.md`](preference-read-back-guesses-a-synthetic-copys-origin-by-provider-and-model-id.md)
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

## Outcome — repaired 2026-10-01

**Found true on the branch** (`fin2-config-readings`, cut from `origin/main` at `f41dc2a`): a new case in
`packages/config/src/preferences.test.ts` ("REQ-CONFIG-341: a slot the snapshot supplied, whose reasoning level a file
states, reads back with origin discovered"), over the two-endpoint fixture and the workspace stating only
`small_model_thinking: high`, failed on the unrepaired read-back with `origin: 'built-in'`.

**The repair.** `slotPreferences` (`packages/config/src/preferences.ts`) unwraps the resolved value first
(`syntheticOriginOf` over `config.syntheticOrigins`, REQ-CONFIG-253) and makes the `discovered` comparison against the
unwrapped value, so a slot the snapshot supplied reads `discovered` whether or not a file's reasoning level wrapped it in
the loader's synthetic copy (REQ-CONFIG-076). The comparison can name nothing else `discovered`: it is reached only when
neither file states the slot, and then the snapshot layer, which sits above the defaults (REQ-CONFIG-031/034), is the one
that supplied any value `discoveredSlots` records. A second case pins that a slot the snapshot did not supply, with a
reasoning level stated, still reads `built-in`.

**Shown in the built app.** `pnpm build`, then `pnpm app:drive start --workspace=<scratch repository>` under Xvfb with
the fixture's snapshot as the drive profile's `project_settings.yaml` and the workspace's `agents.yaml` stating only
`small_model_thinking: high`: `config.read` answers
`{ slot: 'small_model', value: 'openai-compatible--beta/qwen', origin: 'discovered', thinking: 'high' }` — the Scope
column's source (REQ-CONFIG-341).
In the same driven launch, Settings → Models labels the row `small_model` `discovered` with `openai-compatible--beta/qwen`
(`.settings__origin`), where the other slots read `built-in`. `pnpm config-proof` and `pnpm settings-proof` pass on the
build; neither fixture has a snapshot-supplied slot with a reasoning level, so neither shows this case.
