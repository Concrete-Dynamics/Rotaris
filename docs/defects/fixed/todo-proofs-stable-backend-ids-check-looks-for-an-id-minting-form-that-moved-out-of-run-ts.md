## todo-proof's `stableBackendIds` check looks for an id-minting form that moved out of `run.ts`

`pnpm todo-proof` decides `stableBackendIds` by searching `packages/engine/src/run/run.ts` for the literal form
`replaceAll('-', '').slice(0, 8)`: the way an agent task's id was cut from a UUID when the proof was written (Part AD,
2026-09-08). Commits `6edee1f` and `7aff14b` (2026-10-01) moved every backend task and phase id onto one minter,
`mintTodoId` in `packages/engine/src/run/todo.ts` (`randomBytes(4).toString('hex')`, accepted only when it matches
`BACKEND_TODO_ID`, `/^[0-9a-f]{8}$/`, and is not already taken), and `run.ts` now calls it (`mintTaskId`). The literal
is gone, so the field is `false` and the proof is red although the product meets the requirement: its four vitest
suites pass 46/46 and every other field is `true`.

The proof is stale, not the product: it pinned a spelling, not the property. The last todo-proof pass in the record is
fin1's at 2026-10-01 08:17, before the change, so no gate after it ran the proof. Found by acceptance round 1 on merged
main (finding F4): red twice, about 5 s each, load 0.40 alone; confirmed on branch `finacc-accept1-2` over `1763f7f`
(load 0.15).

## Specs

None contradicted by the product. The proof no longer measures REQ-CHAT-089 (backend task and phase ids are
8-character lowercase hexadecimal strings, fixed when created): it reports a met requirement as unmet.

## Relevant files

- `apps/desktop/scripts/todo-proof.mjs`: `stableBackendIds`, the literal search over `run.ts`.
- `packages/engine/src/run/todo.ts`: `BACKEND_TODO_ID` and `mintTodoId`, where every backend id is minted now.
- `packages/engine/src/run/run.ts`: `mintTaskId`, which mints a planner task's id through `mintTodoId`.
- `packages/engine/src/sessions.ts`, `packages/engine/src/todo-view.ts`: the other callers of `mintTodoId` (a
  child's or an at-rest edit, an agent todo's edit).

## Repaired — 2026-10-03 (acceptance round 1, finding F4)

**The check reads the property, not a spelling.** `stableBackendIds` is now the conjunction of
`apps/desktop/scripts/lib/backend-id-minting.mjs`'s `backendIdChecks`, over the four engine sources that make a backend
id: `BACKEND_TODO_ID` is declared as exactly `/^[0-9a-f]{8}$/` (`formDeclared`); `mintTodoId` draws
`randomBytes(4).toString('hex')`, lowers it, and keeps it only when `BACKEND_TODO_ID.test(id) && !taken.has(id)`
(`minterDrawsTheForm`); `run.ts`, `sessions.ts` and `todo-view.ts` each import `mintTodoId` and call it (`runMints`,
`sessionsMint`, `todoViewMints`); and none of the four still cuts an id from a UUID (`noSecondMinter`). The proof writes
each named check into `results.json` as `stableBackendIdChecks`, so a red names the piece that failed. What the minter
yields, rather than how it reads, is measured by `packages/engine/src/run/todo.test.ts` (50 draws of the form, an
uppercase draw lowered, a non-hex or taken draw skipped), which the proof's vitest run now includes beside its four
suites. No product code changed: the engine already met REQ-CHAT-089.

**Pinned by** `apps/desktop/scripts/lib/backend-id-minting.test.ts`: the checks hold on the engine as it is (and the old
literal is absent from `run.ts`, so the old check could only be red there), and each fails alone when the declared form
admits uppercase or another length, when the minter draws another width, stops lowering, or drops the form or the taken
test, or when `run.ts`, `sessions.ts` or `todo-view.ts` stops going through `mintTodoId` (the `run.ts` case writes the
old UUID-slicing form back, which also trips `noSecondMinter`).

**Shown by** `pnpm todo-proof` on branch `finacc-accept1-2`: `PASSED`, every field `true`, five suites and 64 tests
(load 0.27).
