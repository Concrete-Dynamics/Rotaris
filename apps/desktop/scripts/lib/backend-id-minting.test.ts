/**
 * What `todo-proof` reads to say every backend task and phase id is minted in one form (REQ-CHAT-089), against the
 * engine's sources as they are and against each way the property could be lost
 * (`docs/defects/fixed/todo-proofs-stable-backend-ids-check-looks-for-an-id-minting-form-that-moved-out-of-run-ts.md`).
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error — the proof library is plain ESM beside the scripts that run it.
import { backendIdChecks } from './backend-id-minting.mjs';

type Sources = { todo: string; run: string; sessions: string; todoView: string };
const check = backendIdChecks as (sources: Sources) => Record<string, boolean>;

const engine = resolve(import.meta.dirname, '..', '..', '..', '..', 'packages', 'engine', 'src');
const read = (path: string): string => readFileSync(join(engine, path), 'utf8');
const sources: Sources = { todo: read('run/todo.ts'), run: read('run/run.ts'), sessions: read('sessions.ts'), todoView: read('todo-view.ts') };
const failing = (s: Sources): string[] => Object.entries(check(s)).filter(([, held]) => !held).map(([name]) => name);

describe('backendIdChecks — every backend id through the one minter (REQ-CHAT-089)', () => {
  it('holds on the engine as it is, where run.ts mints through mintTodoId and carries no UUID-slicing form', () => {
    expect(failing(sources)).toEqual([]);
    // The form the proof used to require is gone from run.ts, so the old check could only be red here.
    expect(/replaceAll\('-', ''\)\.slice\(0, 8\)/.test(sources.run)).toBe(false);
  });

  it('fails when the declared form admits uppercase or another length', () => {
    expect(failing({ ...sources, todo: sources.todo.replace('/^[0-9a-f]{8}$/', '/^[0-9a-fA-F]{8}$/') })).toEqual(['formDeclared']);
    expect(failing({ ...sources, todo: sources.todo.replace('/^[0-9a-f]{8}$/', '/^[0-9a-f]{6,8}$/') })).toEqual(['formDeclared']);
  });

  it('fails when the minter draws another width, stops lowering, or keeps a draw without the form or the taken check', () => {
    expect(failing({ ...sources, todo: sources.todo.replace("randomBytes(4).toString('hex')", "randomBytes(8).toString('hex')") })).toEqual(['minterDrawsTheForm']);
    expect(failing({ ...sources, todo: sources.todo.replace('draw().toLowerCase()', 'draw()') })).toEqual(['minterDrawsTheForm']);
    expect(failing({ ...sources, todo: sources.todo.replace('BACKEND_TODO_ID.test(id) && !taken.has(id)', '!taken.has(id)') })).toEqual(['minterDrawsTheForm']);
  });

  it('fails when a site that assigns a backend id stops going through mintTodoId', () => {
    const run = sources.run.replace('return mintTodoId(taken);', "return randomUUID().replaceAll('-', '').slice(0, 8);");
    expect(failing({ ...sources, run })).toEqual(['runMints', 'noSecondMinter']);
    expect(failing({ ...sources, sessions: sources.sessions.replaceAll('mintTodoId(', 'otherMint(') })).toEqual(['sessionsMint']);
    expect(failing({ ...sources, todoView: sources.todoView.replace(/import \{ mintTodoId, /, 'import { ') })).toEqual(['todoViewMints']);
  });
});
