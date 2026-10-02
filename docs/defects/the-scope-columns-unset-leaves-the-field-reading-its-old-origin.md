## The Scope column's Unset leaves the field reading its old origin

On Settings → Personas, a role field whose origin equals the selected edit scope offers **Unset**. Clicking it records
the pending unset: Save and Discard appear, and the model control shows the empty choice. The Scope column, though,
keeps drawing the field's read-back origin, for example `model: workspace`, and keeps offering Unset beside it, until
the save is made and the snapshot is read again. REQ-CONFIG-341 says the click "marks the field's origin as `default`".

Seen 2026-10-02 with `pnpm app:drive` over a scratch workspace whose `agents.yaml` sets only
`personas.tester.model: large_model`. With Workspace selected, `tester` read `model: workspace` with Unset. After Unset
was clicked, Save and Discard were enabled and the row still read `model: workspace` with Unset. Found while repairing
[`fixed/the-scope-column-names-the-built-in-origin-built-in-not-default.md`](fixed/the-scope-column-names-the-built-in-origin-built-in-not-default.md),
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
