## A role model edit choosing the baseline option writes `model: null`, which is fatal to the next load

The Personas category's model selector offers a baseline option — "Inherited (…)" or
"Unset (…)" — whose empty value the control maps to `null`
(`packages/ui/src/settings/ConfigSettings.tsx`). The desktop save carries that null through
`RoleEditSchema` (which permits `model: null`) and `applyRoleEdit` wrote it **literally**:
`entry.set('model', null)` produced `personas.<role>: { model: null }` in the edited scope's
`agents.yaml`.

The persona reader requires `name` and `model` as strings (REQ-CONFIG-098); a written null is
`missing required field`, and any persona schema error is fatal to the whole configuration
load — every scope, every section, exactly as the intent-classifier defect of the same day.
The user's next Settings visit (or any skills read) showed "Configuration could not be
loaded" naming the file the save itself had just broken: the product wrote a configuration it
cannot read back.

Found live on 2026-09-16: a global-scoped save left `personas.orchestrator: {thinking: null,
model: null}` in the user's global `agents.yaml` and the workspace fatal'd immediately after
the save reported success. The slot selectors do not have this bug — REQ-CONFIG-256's "only
when the store value is non-empty" guard keeps an empty slot selection from writing — but the
role path has no equivalent guard.

## Specs

- `REQ-CONFIG-041` — a written null overrides nothing; the unset spelling at an edited scope
  is the key's removal (the writer's own discipline everywhere else it handles null).
- `REQ-CONFIG-256` — the desktop save writes an empty slot selection by leaving the key alone;
  the role path should follow the same "empty means leave-it/inherit" rule rather than emit a
  value the loader rejects.
- `REQ-CONFIG-098` — a persona entry requires `name` and `model` as strings; a writer that
  produces an entry violating the reader's own schema is a defect of the writer.
- `REQ-CONFIG-464` — the screen edits values; it never authors configuration the product
  cannot then load.

## Relevant files

- `packages/config/src/writers.ts` — `applyRoleEdit`: wrote `model: null` literally; the fix
  treats `model: null` as the unset spelling (removes the key), matching `unsetModel`.
- `packages/ui/src/settings/ConfigSettings.tsx` — the model select's baseline option maps to
  `null`; unchanged (the mapping is right — the writer's interpretation was wrong).
- `packages/contracts/src/config.ts` — `RoleEditSchema` permits `model: null`; unchanged, as
  null is now a meaningful edit carrying "unset".
