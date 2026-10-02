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
([the fixed note](the-scope-columns-unset-leaves-the-field-reading-its-old-origin.md)), nothing on screen shows
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

## Outcome

**Repaired 2026-10-02** (fourth repair round over the open notes, bundle `fin7-queue-and-roles`; origin/main `dc796f5`).

**Confirmed first.** The three new cases in `packages/ui/src/settings/config-state.test.ts` were red on the code before.
The note's own sequence (model Unset at Workspace, then reasoning Unset at Global) saved `{ scope: 'global', unsetModel:
true, unsetThinking: true }`. `settings-proof`'s new launch 9 was red over a build of the unrepaired code too. The
scratch workspace's file set `personas.tester.model`, and the global file set the tester's model and `thinking: high`. Both
Unsets were clicked and saved, and then the workspace file still held the tester's model. The global file had been
reduced to `{}`: its model was unset at a layer the user never edited.

**What changed (first repair, commit `a30ef48`).** It gave each field one scope: the pending entry held `modelScope`
and `thinkingScope`, the contract carried them in place of the one `scope`, and the writer split each role edit by
layer. A later edit of the same field at the other scope replaced the earlier one, scope and all.

**Falsified by the verifier, 2026-10-02 (repair round 1), and kept here beside its replacement.** One scope per field
still dropped an edit. REQ-CONFIG-341 records "a pending unset of (role, field, **scope**)", and REQ-MONITOR-149 says an
edit at either scope "can be unset back to inherited" without mutating the other. Sequence: the tester holds a model in
both files; at Workspace the model's Unset is clicked; at Global a model is picked. The payload carried only
`{ modelScope: 'global', model: … }`. The workspace unset was gone, and the override the user cleared stayed in the
workspace file, shadowing the global pick: the same harm this note names. `settings-proof`'s new launch 10 reproduced
it over a build of the first repair. The workspace file still set `model: large_model`, and the global file held the pick.

**What changed (the repair that stands).** The pending edits are held per (role, scope), each field's edit within:

- the pending entry (`PendingRoleEdit` in `packages/ui/src/settings/config-state.ts`) is `{ workspace?, global? }`, each a
  `PendingRoleFields` (a model or its unset, a reasoning level or its unset). `applyChange` writes the change under its
  own scope and leaves the other scope's edits as they were. A later edit of the same field at the SAME scope replaces
  it there.
- `savePayload` emits each scope's field edits under that scope.
- `scopeCellOf` reads a field's pending unset at the layer the field's value came from, which is the override it clears.
  The Personas row's model and reasoning controls show the pending edit made at the selected scope
  (`ConfigSettings.tsx`), as the scope selector's hint says ("Switching scope shows that scope's values").
- the contract (`RoleEditSchema` in `packages/contracts/src/config.ts`) is `{ workspace?, global? }` of
  `RoleFieldEditsSchema`. Both are strict, so an entry in either earlier shape is refused rather than read as no edit.
  `toDesktopSave` (`packages/config/src/snapshot.ts`) passes both scopes through.
- the writer (`saveDesktop` in `packages/config/src/writers.ts`) takes each scope's part (`roleEditAt`), applies the
  workspace's to the workspace file and the global's to the global file, and writes each file once. A field can no
  longer arrive without a scope, so the first repair's "no scope" refusal is gone with the shape that allowed it.

`applyRoleEdit` takes the field edits alone (`RoleFieldEdits`), which is what the model-preference path always passed.

**Pinned by** four `config-state.test.ts` cases. The third is the verifier's sequence. Written against the first
repair's shape, it was red: its payload was `{ modelScope: 'global', model: 'gpt-4o-mini' }`, with no unset. The cases are:
- the two Unsets at two scopes;
- a model picked at Workspace that survives a reasoning level picked at Global;
- a model Unset at Workspace that survives a model picked at Global, both reaching the save (the verifier's sequence);
- a later edit at the same scope replacing the earlier one while the other scope keeps its own.

Three `writers.test.ts` cases cover:
- the two-scope unset: the workspace's model removed, the global reasoning removed and the global model kept, and the
  load reading the global model;
- the two-scope pick;
- one field at both scopes: the workspace override removed and the global pick written, with the load reading the pick.

A `contracts.test.ts` case covers the schema's admission and its refusal of both earlier shapes.

`settings-proof`'s launch 9 (`personas-two-scopes`) passed on the first repair, with the whole proof at a load average
of 3.0 rising to 4.8. The workspace file lost the tester's `personas` entry, the global file kept
`tester: model: small_model` alone, and the row read `model: global` and `reasoning: default` after the save.

Launch 10 (`personas-one-field-two-scopes`, new) clicks the model's Unset at Workspace, switches to Global, picks
`medium_model` there, and saves. Over a build of the first repair it was red: the workspace file still held
`model: large_model` (load 7.2). On this repair it was green: the workspace file lost its `personas` entry, the global
file held `tester: model: medium_model`, and the row read `model: global` (load 6.9).
