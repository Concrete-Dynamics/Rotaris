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

**What changed.** REQ-CONFIG-259 reads "Role edits carry a per-field scope", and the repair carries that through all
three steps:

- the pending entry (`PendingRoleEdit` in `packages/ui/src/settings/config-state.ts`) holds `modelScope` and
  `thinkingScope`, and `applyChange` sets only the scope of the field a change touches. A later edit of the same
  field replaces that field's pending edit, scope included; the other field keeps its own.
- `savePayload` emits each field with its own scope.
- the contract (`RoleEditSchema` in `packages/contracts/src/config.ts`) carries `modelScope` and `thinkingScope` in place
  of the one `scope`, and refuses a field edited without its scope. `toDesktopSave` (`packages/config/src/snapshot.ts`)
  passes both through.
- the writer (`saveDesktop` in `packages/config/src/writers.ts`) splits each role edit by layer (`roleEditAt`), applies
  the workspace's part to the workspace file and the global's part to the global file, and writes each file once.
  A field edited with no scope is refused as `invalid` before any file is touched.

`applyRoleEdit` now takes the field edits alone (`RoleFieldEdits`), which is what the model-preference path always passed.

**Pinned by** the three `config-state.test.ts` cases: the two Unsets at two scopes; a model picked at Workspace that
survives a reasoning level picked at Global; and a later edit of the same field replacing its scope while the other
field keeps its own. Three `writers.test.ts` cases cover the two-scope unset (the workspace's model removed, the global
reasoning removed and the global model kept, the load reading the global model), the two-scope pick, and the refusal of
an unscoped field. A `contracts.test.ts` case covers the schema's admission and refusals. `settings-proof`'s launch 9
(`personas-two-scopes`) passed on the repair with the whole proof at a load average of 3.0 rising to 4.8: the workspace
file lost the tester's `personas` entry, the global file kept `tester: model: small_model` alone, and the row read
`model: global` and `reasoning: default` after the save.
