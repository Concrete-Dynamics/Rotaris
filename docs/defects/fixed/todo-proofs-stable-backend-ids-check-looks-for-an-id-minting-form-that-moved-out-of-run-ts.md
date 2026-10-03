## todo-proof's `stableBackendIds` check looks for an id-minting form that moved out of `run.ts`

`pnpm todo-proof` decides `stableBackendIds` by searching `packages/engine/src/run/run.ts` for the literal form
`replaceAll('-', '').slice(0, 8)`: the way an agent task's id was cut from a UUID when the proof was written (Part AD,
2026-09-08). Commits `6edee1f` and `7aff14b` (2026-10-01) moved every task and phase id the engine assigns onto one
minter, `mintTodoId` in `packages/engine/src/run/todo.ts` (`randomBytes(4).toString('hex')`, accepted only when it
matches `BACKEND_TODO_ID`, `/^[0-9a-f]{8}$/`, and is not already taken), and `run.ts` now calls it (`mintTaskId`). The
agent's own `todo` tool keeps a second minter, `hexId` in `packages/agent-tools/src/tools/todo.ts`
(`randomBytes(4).toString('hex')`, with no check against ids already taken), for the phases and tasks of the agent plan
it auto-generates (REQ-TOOLS-144). *Corrected in place 2026-10-03, verifier round 1:* this paragraph first said the two
commits "moved every backend task and phase id onto one minter, `mintTodoId`", the overstatement
`a-queued-prompts-task-id-is-not-eight-hex-characters.md` had already corrected in its own outcome; the tool's `hexId`
never went through `mintTodoId`. The literal
is gone, so the field is `false` and the proof is red although the product meets the requirement: its four vitest
suites pass 46/46 and every other field is `true`.

The proof is stale, not the product: it pinned a spelling, not the property. The last todo-proof pass in the record is
fin1's at 2026-10-01 08:17, before the change, so no gate after it ran the proof. Found by acceptance round 1 on merged
main (finding F4): red twice, about 5 s each, load 0.40 alone; confirmed on branch `finacc-accept1-2` over `1763f7f`
(load 0.15).

## Specs

None contradicted by the product. The proof no longer measures REQ-CHAT-089 (backend task and phase ids are
8-character lowercase hexadecimal strings, fixed when created): it reports a met requirement as unmet. REQ-TOOLS-144
(the agent `todo` tool's "stable auto-generated 8-hex-character ids") is the tool's half of the same form.

## Relevant files

- `apps/desktop/scripts/todo-proof.mjs`: `stableBackendIds`, the literal search over `run.ts`.
- `packages/engine/src/run/todo.ts`: `BACKEND_TODO_ID` and `mintTodoId`, where every id the engine assigns is minted
  now. (*Corrected in place 2026-10-03:* first written "where every backend id is minted now".)
- `packages/agent-tools/src/tools/todo.ts`: `hexId`, the agent `todo` tool's own minter for the ids it auto-generates.
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

**Corrected in place, verifier round 1 (2026-10-03).** The first form of this repair said, in this note, in the
library's header and in the proof's comment, that every backend task and phase id is minted by `mintTodoId`, and its
`noSecondMinter` read only the four engine files. The verifier found the agent `todo` tool's own minter, `hexId` in
`packages/agent-tools/src/tools/todo.ts:17`, which auto-generates the agent plan's phase and task ids (REQ-TOOLS-144)
without `mintTodoId` and without a taken check, so the claim and the check's name reached further than the check. The
wording is narrowed in all three places to the ids the engine assigns, with `hexId` named as the second minter, and the
check now reads it:

- `agentToolDrawsTheForm`: `hexId` is declared as `randomBytes(4).toString('hex')` (eight lowercase hexadecimal
  characters by construction), the tool calls it, and the tool draws no id any other way (no `randomUUID`,
  `Math.random`, `randomInt` or second `randomBytes`). It has no taken check, and this check does not claim one: a
  repeat among the tool's own ids is left to the 2^32 draw. An id the model supplies in a `replace` is kept as the model
  wrote it (`p.id ?? hexId()`, `t.id ?? hexId()`); it is not auto-generated, and this proof does not read it as covered.
- `noSecondMinter` scans every non-test source under `packages/engine/src` and `packages/agent-tools/src`, not only the
  named files, for the UUID-slicing form.
- `backendIdSources(repo)` reads those sources and `stableBackendIds(checks)` folds the checks, both in the library, so
  the proof's wiring (which files it reads, how `stableBackendIds` is decided) is pinned with the checks.

What the tool's `hexId` yields is read by `packages/agent-tools/src/tools/tools.test.ts`, already in the proof's vitest
run: the ids `add_phase` and `add_task` report must be exactly eight lowercase hexadecimal characters. Pinned by
`backend-id-minting.test.ts` (7 tests): the sources read (the named files once, every other engine and agent-tools
source, no test file), and each new check failing alone when `hexId` draws another width or encoding, stops being
called, or has a `Math.random` draw beside it, and when any other engine source carries the UUID-slicing form. Shown by
`pnpm todo-proof`: `PASSED`, every field and all seven `stableBackendIdChecks` `true`.
