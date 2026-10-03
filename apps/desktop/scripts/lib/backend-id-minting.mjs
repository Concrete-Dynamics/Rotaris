/**
 * REQ-CHAT-089: what `todo-proof` reads from the engine's sources to say that every backend task and phase id is minted
 * in one form — 8 lowercase hexadecimal characters, fixed when the task or phase is created.
 *
 * Since 2026-10-01 (`6edee1f`, `7aff14b`) one minter makes every such id: `mintTodoId` in
 * `packages/engine/src/run/todo.ts`, which draws `randomBytes(4).toString('hex')`, lowers the draw, and keeps it only
 * when it matches `BACKEND_TODO_ID` (`/^[0-9a-f]{8}$/`) and no id in `taken` already is. The proof used to look for the
 * UUID-slicing spelling an agent task's id had before that, in `run.ts` alone, and went red when the spelling moved
 * although the requirement was still met
 * (`docs/defects/fixed/todo-proofs-stable-backend-ids-check-looks-for-an-id-minting-form-that-moved-out-of-run-ts.md`).
 * So this reads the property where it now lives: the minter's form, and that every site the engine assigns a backend
 * id from goes through it. What the minter yields is measured by `packages/engine/src/run/todo.test.ts`, which the
 * proof runs beside these checks.
 */

/** The UUID-slicing form a backend id was cut by before `mintTodoId`; a second minter of that form would escape the one form. */
const UUID_SLICE = /randomUUID\(\)\s*\.replaceAll\([^)]*\)\s*\.slice\(\s*0\s*,\s*8\s*\)/;

/** A source imports `mintTodoId` from the todo module (`./todo.js` beside it, `./run/todo.js` from the engine root) and calls it. */
function mintsThroughMinter(source, from) {
  const imported = new RegExp(`import\\s*\\{[^}]*\\bmintTodoId\\b[^}]*\\}\\s*from\\s*'${from.replaceAll('.', '\\.')}'`).test(source);
  return imported && /\bmintTodoId\(/.test(source.replace(/import\s*\{[^}]*\}\s*from\s*'[^']*';?/g, ''));
}

/**
 * Each check by name, `true` where it holds. `sources` holds the text of `run/todo.ts` (`todo`), `run/run.ts` (`run`),
 * `sessions.ts` (`sessions`) and `todo-view.ts` (`todoView`), all under `packages/engine/src/`.
 */
export function backendIdChecks(sources) {
  const { todo, run, sessions, todoView } = sources;
  const minter = /export function mintTodoId\([^)]*\)[^{]*\{([\s\S]*?)\n\}/.exec(todo)?.[1] ?? '';
  const signature = /export function mintTodoId\(([^\n]*)\)/.exec(todo)?.[1] ?? '';
  return {
    // Exactly eight characters, lowercase hexadecimal only: an uppercase range would let two ids differ only in case.
    formDeclared: /export const BACKEND_TODO_ID = \/\^\[0-9a-f\]\{8\}\$\/;/.test(todo),
    // Four random bytes in hexadecimal are eight characters; the draw is lowered and kept only in the declared form, unused.
    minterDrawsTheForm: /randomBytes\(4\)\.toString\('hex'\)/.test(signature)
      && /\.toLowerCase\(\)/.test(minter)
      && /BACKEND_TODO_ID\.test\(id\)\s*&&\s*!taken\.has\(id\)/.test(minter),
    // A planner task (`run.ts` `mintTaskId`), a child's or an at-rest edit (`sessions.ts`), an agent todo's edit (`todo-view.ts`).
    runMints: mintsThroughMinter(run, './todo.js'),
    sessionsMint: mintsThroughMinter(sessions, './run/todo.js'),
    todoViewMints: mintsThroughMinter(todoView, './run/todo.js'),
    noSecondMinter: ![todo, run, sessions, todoView].some((source) => UUID_SLICE.test(source)),
  };
}
