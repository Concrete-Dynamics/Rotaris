## The Scope column's Unset leaves the field reading its old origin

On Settings → Personas, a role field whose origin equals the selected edit scope offers **Unset**. Clicking it records
the pending unset: Save and Discard appear, and the model control shows the empty choice. The Scope column, though,
keeps drawing the field's read-back origin, for example `model: workspace`, and keeps offering Unset beside it, until
the save is made and the snapshot is read again. REQ-CONFIG-341 says the click "marks the field's origin as `default`".

Seen 2026-10-02 with `pnpm app:drive` over a scratch workspace whose `agents.yaml` sets only
`personas.tester.model: large_model`. With Workspace selected, `tester` read `model: workspace` with Unset. After Unset
was clicked, Save and Discard were enabled and the row still read `model: workspace` with Unset. Found while repairing
[`the-scope-column-names-the-built-in-origin-built-in-not-default.md`](the-scope-column-names-the-built-in-origin-built-in-not-default.md),
which gave the column the word `default`; not repaired.

## Specs

- `REQ-CONFIG-341`: "Clicking it marks the field's origin as `default` and records a pending unset of (role, field,
  scope)." The pending unset is recorded; the origin is not marked. "Discarding restores model, scope and reasoning to
  their previous values" is unaffected.

## Relevant files

- `packages/ui/src/settings/ConfigSettings.tsx`: the role row's Scope cell draws `r.modelOrigin` and `r.thinkingOrigin`
  from the snapshot, and offers Unset on `origin === scope`, without reading `pending.roles[role].unsetModel` or
  `unsetThinking`.
- `packages/ui/src/settings/config-state.ts`: `applyChange`'s `role` case, which records `unsetModel` / `unsetThinking`.

## Outcome — repaired 2026-10-02 (fin5, branch `fin5-gate-and-scope`)

Confirmed first in the built app on origin/main `f2bddcf`, over the note's scratch workspace (`agents.yaml` sets only
`personas.tester.model: large_model`): with Workspace selected the `tester` row's `settings__scope` cell read
`model: workspace` with Unset; after Unset was clicked Save and Discard appeared and the cell still read
`model: workspace` with Unset.

`scopeCellOf(row, pending, scope)` in `packages/ui/src/settings/config-state.ts` now decides, per field, the origin the
Scope cell draws and whether it offers Unset. A pending unset of the field (`unsetModel` / `unsetThinking`) draws
`default` and offers no Unset, since `default` is never an edit scope; otherwise the field draws the read-back origin
and offers Unset where that origin equals the selected edit scope, as before. `PersonasSettings` in
`ConfigSettings.tsx` renders the cell from it. The pending unset reads `default` whichever edit scope is selected,
since switching scope is a view selection. A value picked after the unset clears it (`applyChange` already sets
`unsetModel: false`), and the field reads its read-back origin again.

Pinned by `packages/ui/src/settings/config-state.test.ts`, "REQ-CONFIG-341 — the Scope column reads the pending unset"
(four cases): nothing pending reads `workspace` with Unset at Workspace and without it at Global; Unset clicked reads
`default` with no Unset at either scope, and the saved state (what Discard restores) reads `workspace` with Unset again;
a pending reasoning unset leaves the model at its origin; a value picked after the unset reads the origin again. All
four failed before the repair (`scopeCellOf` did not exist, and the cell read the snapshot alone). In the built app
after the repair, same workspace: before the click `tester` read `model: workspace` with Unset; after it every row read
`model: default` / `reasoning: default` and no Unset was left in the column, with Save and Discard shown; after Discard
`tester` read `model: workspace` with Unset again.
