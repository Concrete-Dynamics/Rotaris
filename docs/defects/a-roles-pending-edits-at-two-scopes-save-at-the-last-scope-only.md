## A role's pending edits at two scopes save at the last scope only

The Personas table keeps one pending entry per role, and that entry holds one `scope`. Every change to the role
(a model picked, a reasoning level picked, an Unset clicked) overwrites the entry's `scope` with the edit scope
selected at that moment and keeps the entry's other fields. So edits made to one role at two scopes collapse onto the
last one. Take a role whose model origin is `workspace` and whose reasoning origin is `global`. With Workspace selected,
click the model's Unset; switch the edit scope to Global and click the reasoning's Unset. The entry becomes
`{ scope: 'global', unsetModel: true, unsetThinking: true }`, and the save asks the global layer to unset the model, which
it does not hold, while the workspace override the user cleared stays in place. Picking a model at Workspace and then a
reasoning level at Global moves the model write to the global layer in the same way.

Since the Scope column now reads a pending unset as `default` at every scope
([the fixed note](fixed/the-scope-columns-unset-leaves-the-field-reading-its-old-origin.md)), nothing on screen shows
that the model's unset moved scope before the save.

Seen by reading the code while repairing the Scope column (fin5, 2026-10-02, the first verifier's optional finding); not
driven in the built app.

## Specs

REQ-CONFIG-341: clicking Unset "records a pending unset of (role, field, scope)". The scope belongs to each field's
pending edit, and a later edit of the other field at another scope must not move it. REQ-CONFIG-031 (the layer order
the save writes into) is affected through it: the user's cleared override survives at the layer they cleared it in.

## Relevant files

- `packages/ui/src/settings/config-state.ts`: `PendingSettings.roles` (one `scope` per role entry); `applyChange`'s
  `'role'` case (`next = { ...current, scope: change.scope, … }` keeps the earlier field's edit and replaces its scope);
  `savePayload`'s roles block (one `scope` per role in the payload).
- `packages/ui/src/settings/ConfigSettings.tsx`: the role table's controls and Unset buttons, which pass the edit scope
  selected at the time of the click.
- The desktop save path that writes `roles` into a layer (one scope per role), which would need a per-field scope too.
