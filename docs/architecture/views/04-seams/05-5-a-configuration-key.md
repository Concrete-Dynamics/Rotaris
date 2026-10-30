# Seams — what to touch, in what order, to add one of the things this product adds most often — 5. A configuration key

Part 5 of 8 of [the seams](../04-seams.md), which indexes every part.

## 5. A configuration key

Three tiers, one writer.

| # | File | What lands here |
|---|---|---|
| 1 | `packages/config/src/sections/<section>.ts` | the schema and the default |
| 2 | `packages/config/src/defaults.ts`, `merge.ts`, `tiers.ts` | the layered merge, if the key is not a plain scalar in an existing section |
| 3 | `packages/config/src/snapshot.ts` | only if layer 3 (the discovery snapshot) supplies it |
| 4 | `packages/config/src/writers.ts` | only if a surface saves it |
| 5 | `apps/desktop/src/run-host/configuration.ts` | Tier B — what a run resolves at start |
| 6 | `packages/ui/src/settings/…` | the Settings surface |

A key the Settings screen *edits* takes four more, and they are the ones a first attempt forgets:
`packages/contracts/src/config.ts` (the snapshot field and the save payload's key), then
`packages/ui/src/settings/config-state.ts` — `PendingSettings`, `pendingFrom`, `rebasePending`,
`PendingChange`, `applyChange` and `savePayload`, in that order. A key touching fewer than all six of
those is a key that saves and does not mark dirty, or marks dirty and does not survive a reload.
`instructions.overrides` (`PD-WORKSPACE-002`) is the worked example, and `skills.overrides` the one
before it. A key that also reaches a run start through the live state, as the delegation limits do, joins
`TIER_B_RUNTIME_KEYS` (`packages/config/src/tiers.ts`): `runtime.child_timeout` (`PD-CONFIG-003`, 2026-10-07) is the
latest but one — seconds in the file and the snapshot, whole minutes on the screen (`timeoutMinutesForDisplay`,
`timeoutSecondsFromInput`), a stored value the control cannot show kept as stored until the field is changed; then
`runtime.improvement_collector_timeout` (`PD-CONFIG-003` revision 2, 2026-10-07), whole seconds clamped 10–600
(`improvementTimeoutForDisplay`, `improvementTimeoutFromInput`, `storedImprovementTimeoutNote`). **Since that revision the
desktop save's runtime keys are a closed list**, `DESKTOP_SAVE_RUNTIME_KEYS` in `packages/contracts/src/config.ts`:
`DesktopSaveSchema` refuses any other runtime key, `DesktopSave.runtime` (`packages/config/src/writers.ts`) is typed from
it, the screen's runtime keys (`pendingFrom`) must equal it and `TIER_B_RUNTIME_KEYS` must equal it less the six
confinement and egress fields (`improvement-timeout.test.ts`, `writers.test.ts`), so a runtime key the screen edits is
added in the list or the save refuses it.

`dictation:` (OQ-457, 2026-10-30) is the worked example of a section **no run reads**: stop 5 is not crossed, main reads the snapshot at each press, and its rule for a value (`dictationFieldProblem` in `packages/contracts/src/config.ts`) is the one the loader, the save schema and the field share.

A persona field the engine must act on rides on `Persona` (`packages/engine/src/children/personas.ts`), set in
`personaResolverFor` (`apps/desktop/src/run-host/configuration.ts`) from the loaded entry: `delegates_to` (REQ-CONFIG-101) is
the latest (OQ-229, 2026-10-07), parsed and validated for years and read by nothing until it became `Persona.delegatesTo`,
which `delegationTargetsFor` narrows by. A field read nowhere but the loader is a key that validates and does nothing.

Invariants:

- **Configuration is resolved once per run start.** A run does not re-read; a surface that changes a value
  changes the next run, not the running one. Two readers deliberately break this and say so where they do:
  the `skills:` section and the `instructions:` policy are read from the **saved** file at each gesture,
  because both gate something happening now rather than a run that started earlier.
- **The workspace service is the only writer** (`config.read` / `config.save` / `config.setField`, each
  followed by the load again). The run host never writes a configuration file.
- The writer **re-emits hand-authored YAML with its comments**. Inline-comment spacing collapsing on
  re-emission was the eleventh first-execution defect — if you touch the writer, prove the comments survive.
- `initialization:` / `project_init:` are read **outside** the layered merge, because `REQ-WORKSPACE-078`
  names one file.
- **A role edit is held per (role, scope), each field within** (`REQ-CONFIG-259`, `REQ-CONFIG-341`'s "pending unset of
  (role, field, scope)"). The pending entry (`PendingRoleEdit`, `ui/src/settings/config-state.ts`), the save contract
  (`RoleEditSchema`: `{ workspace?, global? }`, strict) and the writer (`saveDesktop`'s `roleEditAt`) keep each scope's
  field edits apart, so one role's edits at two scopes, the same field's included, each land in their own file. The
  first repair's one scope per field was falsified by a model Unset at Workspace followed by a model pick at Global
  (2026-10-02).

---
