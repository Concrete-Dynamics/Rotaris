## The Scope column names the built-in origin `built-in`, not `default`

REQ-CONFIG-341 fixes the Scope column's origin vocabulary at exactly `workspace`, `global`, `discovered` and `default`,
`default` marking a built-in value. The product uses `built-in` for that fourth member throughout. The contract's
`CONFIG_ORIGINS` is `['workspace', 'global', 'discovered', 'built-in']`. The model-preference read-back
(`slotPreferences`, `rolePreferences`) returns `'built-in'` for a slot or a role field no file and no snapshot states.
Settings → Models draws that word beside a slot (`.settings__origin`) and in a role's stacked Scope rows (`model:` and
`reasoning:`). A user reading the column sees a word the specification does not have where it requires `default`. The
chain the column reports, workspace > global > discovered > (`built-in` in place of `default`), is otherwise the one
the requirement states.

Noticed 2026-10-01 by the verifier of the `fin2-config-readings` repair of
[`fixed/a-discovered-slot-with-a-reasoning-level-reads-back-as-built-in.md`](fixed/a-discovered-slot-with-a-reasoning-level-reads-back-as-built-in.md)
(that repair's own evidence read "built-in" on the slots the snapshot did not supply), and confirmed by reading the code
on that branch. Not repaired: renaming the member touches the contract, the read-back, the surface and their tests, and
falls outside that task.

## Specs

- REQ-CONFIG-341: "The origin vocabulary is exactly `workspace`, `global`, `discovered` and `default` … `default` a
  built-in". The product's fourth member is `built-in`, so the vocabulary is not the one stated. Clicking **Unset**
  "marks the field's origin as `default`"; the column has no such word to show.
- REQ-CONFIG-031: the layer order the chain matches. This is not contradicted; only the name of the bottom layer's
  origin is.
- `docs/spec/resolutions/15-settings-configuration.md` row 21: the vocabulary is the layer set, reported in layer
  order. It names the bottom member `default` too.

## Relevant files

- `packages/contracts/src/config.ts`: `CONFIG_ORIGINS`, the vocabulary that crosses to the renderer, with `built-in`
  as its fourth member.
- `packages/config/src/preferences.ts`: `Origin` (line 13), and `slotPreferences` and `rolePreferences`, which return
  `'built-in'`.
- `packages/ui/src/settings/ConfigSettings.tsx`: the slot row's `view?.origin ?? 'built-in'`, and the role's
  `model:`/`reasoning:` origin rows, which draw the word as it arrives.
- `packages/config/src/preferences.test.ts` and the Settings tests and proofs that assert `built-in` (to be found and
  changed with the repair).
