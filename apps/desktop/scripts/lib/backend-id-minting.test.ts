/**
 * What `todo-proof` reads to say every auto-generated task and phase id is minted in one form (REQ-CHAT-089,
 * REQ-TOOLS-144) — the engine's `mintTodoId` and the agent todo tool's `hexId` — against the sources as they are and
 * against each way the property could be lost
 * (`docs/defects/fixed/todo-proofs-stable-backend-ids-check-looks-for-an-id-minting-form-that-moved-out-of-run-ts.md`).
 */
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error — the proof library is plain ESM beside the scripts that run it.
import { backendIdChecks, backendIdSources, stableBackendIds } from './backend-id-minting.mjs';

type Sources = { todo: string; run: string; sessions: string; todoView: string; agentTodo: string; elsewhere: Record<string, string> };
const check = backendIdChecks as (sources: Sources) => Record<string, boolean>;
const stable = stableBackendIds as (checks: Record<string, boolean>) => boolean;

const repo = resolve(import.meta.dirname, '..', '..', '..', '..');
const sources = (backendIdSources as (repo: string) => Sources)(repo);
const failing = (s: Sources): string[] => Object.entries(check(s)).filter(([, held]) => !held).map(([name]) => name);
const UUID_SLICE = "randomUUID().replaceAll('-', '').slice(0, 8)";

describe('backendIdChecks — every auto-generated task and phase id in one form (REQ-CHAT-089, REQ-TOOLS-144)', () => {
  it('reads the four engine files, the agent todo tool, and every other engine and agent-tools source', () => {
    expect(sources.todo).toContain('export function mintTodoId(');
    expect(sources.agentTodo).toContain('export const hexId');
    const paths = Object.keys(sources.elsewhere);
    expect(paths).toContain('packages/engine/src/session-writer.ts');
    expect(paths).toContain('packages/agent-tools/src/tools/files.ts');
    // The named files are read once, as themselves, and no test file is scanned.
    expect(paths).not.toContain('packages/engine/src/run/todo.ts');
    expect(paths).not.toContain('packages/agent-tools/src/tools/todo.ts');
    expect(paths.some((path) => path.endsWith('.test.ts'))).toBe(false);
  });

  it('holds on the sources as they are, where run.ts mints through mintTodoId and carries no UUID-slicing form', () => {
    expect(failing(sources)).toEqual([]);
    expect(stable(check(sources))).toBe(true);
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
    const run = sources.run.replace('return mintTodoId(taken);', `return ${UUID_SLICE};`);
    expect(failing({ ...sources, run })).toEqual(['runMints', 'noSecondMinter']);
    expect(failing({ ...sources, sessions: sources.sessions.replaceAll('mintTodoId(', 'otherMint(') })).toEqual(['sessionsMint']);
    expect(failing({ ...sources, todoView: sources.todoView.replace(/import \{ mintTodoId, /, 'import { ') })).toEqual(['todoViewMints']);
  });

  it('fails when the agent todo tool draws another width or form, stops using hexId, or draws an id beside it', () => {
    const declared = "export const hexId = (): string => randomBytes(4).toString('hex');";
    expect(sources.agentTodo).toContain(declared);
    expect(failing({ ...sources, agentTodo: sources.agentTodo.replace(declared, "export const hexId = (): string => randomBytes(8).toString('hex');") })).toEqual(['agentToolDrawsTheForm']);
    expect(failing({ ...sources, agentTodo: sources.agentTodo.replace(declared, "export const hexId = (): string => randomBytes(4).toString('base64');") })).toEqual(['agentToolDrawsTheForm']);
    expect(failing({ ...sources, agentTodo: sources.agentTodo.replaceAll('hexId()', 'otherId()') })).toEqual(['agentToolDrawsTheForm']);
    expect(failing({ ...sources, agentTodo: sources.agentTodo.replace('{ id: hexId(), name, tasks: [] }', '{ id: String(Math.random()), name, tasks: [] }') })).toEqual(['agentToolDrawsTheForm']);
    // A UUID-sliced id in the tool is a second minter as well as a draw beside hexId.
    expect(failing({ ...sources, agentTodo: sources.agentTodo.replace('{ id: hexId(), name, tasks: [] }', `{ id: ${UUID_SLICE}, name, tasks: [] }`) })).toEqual(['agentToolDrawsTheForm', 'noSecondMinter']);
  });

  it('fails when any other engine or agent-tools source cuts an id from a UUID', () => {
    const elsewhere = { ...sources.elsewhere, 'packages/engine/src/session-writer.ts': `${sources.elsewhere['packages/engine/src/session-writer.ts']}\nconst id = ${UUID_SLICE};\n` };
    expect(failing({ ...sources, elsewhere })).toEqual(['noSecondMinter']);
    expect(stable(check({ ...sources, elsewhere }))).toBe(false);
  });
});
