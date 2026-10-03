/**
 * REQ-CHAT-089, REQ-TOOLS-144: what `todo-proof` reads from the sources to say that every task and phase id the backend
 * auto-generates is minted in one form — 8 lowercase hexadecimal characters, fixed when the task or phase is created.
 *
 * Two minters make such ids, and this reads both:
 * - **The engine's** — every task and phase id the engine assigns. Since 2026-10-01 (`6edee1f`, `7aff14b`) that is
 *   `mintTodoId` in `packages/engine/src/run/todo.ts`, which draws `randomBytes(4).toString('hex')`, lowers the draw, and
 *   keeps it only when it matches `BACKEND_TODO_ID` (`/^[0-9a-f]{8}$/`) and no id in `taken` already is. `run.ts`,
 *   `sessions.ts` and `todo-view.ts` assign ids through it.
 * - **The agent `todo` tool's** — `hexId` in `packages/agent-tools/src/tools/todo.ts` (`randomBytes(4).toString('hex')`),
 *   which auto-generates the ids of the agent plan's phases and tasks (REQ-TOOLS-144). It does not go through
 *   `mintTodoId` and has no check against ids already taken; its draw is eight lowercase hex characters by construction.
 *   An id the model supplies in a `replace` is kept as the model wrote it: that id is not auto-generated, and this proof
 *   does not read it as covered.
 *
 * The proof used to look for the UUID-slicing spelling an agent task's id had before 2026-10-01, in `run.ts` alone, and
 * went red when the spelling moved although the requirement was still met
 * (`docs/defects/fixed/todo-proofs-stable-backend-ids-check-looks-for-an-id-minting-form-that-moved-out-of-run-ts.md`).
 * So this reads the property where it lives. What `mintTodoId` yields is measured by
 * `packages/engine/src/run/todo.test.ts`, and the ids `add_phase` and `add_task` report through `hexId` are read as eight
 * lowercase hex characters by `packages/agent-tools/src/tools/tools.test.ts`; the proof runs both beside these checks.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** The UUID-slicing form a backend id was cut by before `mintTodoId`; a second minter of that form would escape the one form. */
const UUID_SLICE = /randomUUID\(\)\s*\.replaceAll\([^)]*\)\s*\.slice\(\s*0\s*,\s*8\s*\)/;

/** A source imports `mintTodoId` from the todo module (`./todo.js` beside it, `./run/todo.js` from the engine root) and calls it. */
function mintsThroughMinter(source, from) {
  const imported = new RegExp(`import\\s*\\{[^}]*\\bmintTodoId\\b[^}]*\\}\\s*from\\s*'${from.replaceAll('.', '\\.')}'`).test(source);
  return imported && /\bmintTodoId\(/.test(source.replace(/import\s*\{[^}]*\}\s*from\s*'[^']*';?/g, ''));
}

/** Every non-test TypeScript source under `root`, keyed by its path relative to `repo`. */
function sourcesUnder(repo, root) {
  const out = {};
  for (const entry of readdirSync(join(repo, root), { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) continue;
    const path = join(entry.parentPath, entry.name);
    out[path.slice(repo.length + 1).replaceAll('\\', '/')] = readFileSync(path, 'utf8');
  }
  return out;
}

/**
 * The sources `backendIdChecks` reads, from the repository at `repo`: the four engine files that make or assign an id,
 * the agent `todo` tool, and every other source under `packages/engine/src` and `packages/agent-tools/src` (`elsewhere`),
 * which `noSecondMinter` scans for the UUID-slicing form.
 */
export function backendIdSources(repo) {
  const named = {
    todo: 'packages/engine/src/run/todo.ts',
    run: 'packages/engine/src/run/run.ts',
    sessions: 'packages/engine/src/sessions.ts',
    todoView: 'packages/engine/src/todo-view.ts',
    agentTodo: 'packages/agent-tools/src/tools/todo.ts',
  };
  const elsewhere = { ...sourcesUnder(repo, 'packages/engine/src'), ...sourcesUnder(repo, 'packages/agent-tools/src') };
  const sources = { elsewhere };
  for (const [key, path] of Object.entries(named)) {
    sources[key] = readFileSync(join(repo, path), 'utf8');
    delete elsewhere[path];
  }
  return sources;
}

/**
 * Each check by name, `true` where it holds. `sources` is what `backendIdSources` returns: `todo` (`run/todo.ts`), `run`
 * (`run/run.ts`), `sessions` (`sessions.ts`) and `todoView` (`todo-view.ts`) under `packages/engine/src/`; `agentTodo`
 * (`packages/agent-tools/src/tools/todo.ts`); and `elsewhere`, every other source by path (may be empty).
 */
export function backendIdChecks(sources) {
  const { todo, run, sessions, todoView, agentTodo, elsewhere = {} } = sources;
  const minter = /export function mintTodoId\([^)]*\)[^{]*\{([\s\S]*?)\n\}/.exec(todo)?.[1] ?? '';
  const signature = /export function mintTodoId\(([^\n]*)\)/.exec(todo)?.[1] ?? '';
  const agentBody = agentTodo.replace(/export const hexId = [^\n]*\n/, '');
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
    // The agent `todo` tool's own minter: four random bytes in hexadecimal (lowercase by construction), called, and the
    // tool's only source of an id — no UUID, `Math.random` or other draw beside it. It has no taken check.
    agentToolDrawsTheForm: /export const hexId = \(\): string => randomBytes\(4\)\.toString\('hex'\);/.test(agentTodo)
      && /\bhexId\(\)/.test(agentBody)
      && !/randomUUID|Math\.random|randomBytes\(|randomInt\(/.test(agentBody),
    // No source under the engine or the agent tools still cuts an id from a UUID.
    noSecondMinter: ![todo, run, sessions, todoView, agentTodo, ...Object.values(elsewhere)].some((source) => UUID_SLICE.test(source)),
  };
}

/** The proof's `stableBackendIds` field: every named check holds. */
export function stableBackendIds(checks) {
  return Object.values(checks).every(Boolean);
}
