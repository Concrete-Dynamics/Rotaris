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
