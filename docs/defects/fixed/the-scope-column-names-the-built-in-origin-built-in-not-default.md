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
[`a-discovered-slot-with-a-reasoning-level-reads-back-as-built-in.md`](a-discovered-slot-with-a-reasoning-level-reads-back-as-built-in.md)
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

## Outcome

**Repaired 2026-10-02** (second repair round over the open notes, bundle `fin3-surface-words`).

**Confirmed first** by three tests in `packages/config/src/preferences.test.ts` that failed on the unrepaired tree:
`CONFIG_ORIGINS` read `['workspace', 'global', 'discovered', 'built-in']`, and `large_model` (stated by no file, not
supplied by the snapshot) and the built-in role `tester`'s model and reasoning read back `built-in`.

**What changed.** The vocabulary's fourth member is `default`, REQ-CONFIG-341's word: `CONFIG_ORIGINS` in
`packages/contracts/src/config.ts`; `Origin` in `packages/config/src/preferences.ts`, now the contract's type
(`(typeof CONFIG_ORIGINS)[number]`) so the read-back cannot name a member the contract does not have; the three
read-back sites in `slotPreferences` and `rolePreferences`; and the slot row's fallback in
`packages/ui/src/settings/ConfigSettings.tsx`. The tool inventory's `built-in` source (REQ-CONFIG-277), the playbook
catalogue's `built-in` source and the role model select's "Unset (built-in)" label are other vocabularies and were left
alone. The origin crosses only the settings channel and is never stored, so nothing is migrated.

**Pinned by** the case "the origin vocabulary is the one REQ-CONFIG-341 states (REQ-CONFIG-341, REQ-CONFIG-031)" in
`preferences.test.ts` (the vocabulary and its order; a slot and a role field no file and no snapshot states read
`default`; every origin the read-back gives is a member), and the renamed assertion of the earlier case. Fixtures and
assertions in `writers.test.ts`, `load.test.ts`, `config-state.test.ts` and `run-start-hint.test.ts` now carry
`default`. In the built app (`pnpm app:drive` over a scratch workspace whose `agents.yaml` sets only
`personas.tester.model`), Settings → Models drew `default` beside all seven slots (`.settings__origin`), and Settings
→ Personas drew `model: default` and `reasoning: default` on every role, except `tester`'s `model: workspace` with
its Unset. `settings-proof` passed after the repair. `config-proof` passed on its second run; its first, with the host's load average between 5 and 8 and another plan's launches running, stopped at `runtime-save` with the "Yes" and "Save" steps never pressed, a stage that reads no origin.

Noticed while driving it, and recorded rather than repaired: the Scope column's Unset neither marks the field
`default` while the unset is pending
([`the-scope-columns-unset-leaves-the-field-reading-its-old-origin.md`](the-scope-columns-unset-leaves-the-field-reading-its-old-origin.md), repaired 2026-10-02)
nor names the field and the role in its accessible name
([`../the-scope-columns-unset-is-named-unset-and-nothing-else.md`](../the-scope-columns-unset-is-named-unset-and-nothing-else.md)).
