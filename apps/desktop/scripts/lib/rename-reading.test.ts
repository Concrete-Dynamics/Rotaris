/**
 * The live `rename` scenario's readings (fin42, N59; OQ-245, OQ-272): not reached, a warm rename that reached every file, and a
 * cold one that renamed the declaring file alone — read from the store and the files, never from the model's prose.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error — the reader is plain ESM beside the script that runs it.
import { RENAME_FILES, RENAME_FROM, RENAME_TO, namesIdentifier, renameReading } from './rename-reading.mjs';

const fixture = resolve(import.meta.dirname, '..', 'fixtures', 'todo-app');
const original = Object.fromEntries((RENAME_FILES as string[]).map((f) => [f, readFileSync(join(fixture, f), 'utf8')]));
const renamed = (only?: string[]) => Object.fromEntries(Object.entries(original).map(([f, t]) => [f, only === undefined || only.includes(f) ? t.replace(/\bremaining\(/g, `${RENAME_TO}(`).replace(/([{,]\s*)remaining(\s*[,}])/g, `$1${RENAME_TO}$2`) : t]));
const call = (ordinal: number, tool_name: string, args: Record<string, unknown> = {}, agent_name = 'Coding Agent 1', status = 'ok') => ({ ordinal, tool_name, agent_name, status, args, result: 'ok' });
const RENAME = { name_path: RENAME_FROM, relative_path: 'src/todos.js', new_name: RENAME_TO };
const child = (edited: string[]) => ({ canonical_name: 'Coding Agent 1', persona: 'coding-agent', report: JSON.stringify({ edited_files: edited }) });

describe('rename reading (live-run `rename`, OQ-245, OQ-272, REQ-MCP-015)', () => {
  it('the fixture declares, calls and imports the symbol in exactly the three files, and its test title is not a use', () => {
    for (const f of RENAME_FILES as string[]) expect(namesIdentifier(original[f], RENAME_FROM), f).toBe(true);
    expect(namesIdentifier("test('the three filters and the remaining count', () => {", RENAME_FROM)).toBe(false);
    expect(namesIdentifier(`export function ${RENAME_TO}(todos) {`, RENAME_FROM)).toBe(false);
    for (const f of RENAME_FILES as string[]) expect(namesIdentifier(renamed()[f], RENAME_FROM), f).toBe(false);
  });

  it('no rename_symbol call is "not reached", whatever the files say', () => {
    const r = renameReading({ calls: [call(1, 'write_file', { path: 'src/todos.js' })], files: renamed(), children: [child(['src/todos.js'])] });
    expect(r.reached).toBe(false);
    expect(r.leftBehind).toEqual([]);
  });

  it('a rename after a reference search that reached every file, listed in the report and the artifact', () => {
    const all = [...(RENAME_FILES as string[])];
    const r = renameReading({ calls: [call(1, 'find_referencing_symbols', { name_path: RENAME_FROM, relative_path: 'src/todos.js' }), call(2, 'rename_symbol', RENAME)], files: renamed(), children: [child(all)], artifacts: [{ edited_files: JSON.stringify(all.map((path) => ({ path }))) }] });
    expect(r).toMatchObject({ reached: true, searchedFirst: true, cold: false, leftBehind: [], carrying: all, mendedAfter: [], reportMissing: [], artifactMissing: [], oq272: false });
  });

  it('a cold rename that changed the declaring file alone is OQ-272\'s signature, and the report is judged against what changed', () => {
    const r = renameReading({ calls: [call(1, 'rename_symbol', RENAME)], files: renamed(['src/todos.js']), children: [child(['src/todos.js'])], artifacts: [{ edited_files: JSON.stringify(['src/todos.js']) }] });
    expect(r).toMatchObject({ cold: true, leftBehind: ['src/App.jsx', 'src/todos.test.js'], carrying: ['src/todos.js'], reportMissing: [], artifactMissing: [], oq272: true });
  });

  it('a cold rename whose importing files another tool mended afterwards is still OQ-272\'s signature', () => {
    const r = renameReading({
      calls: [call(1, 'rename_symbol', RENAME), call(2, 'haet_edit', { path: 'src/App.jsx' }), call(3, 'write_file', { path: './src/todos.test.js' }), call(4, 'write_file', { path: 'src/other.js' })],
      files: renamed(), children: [child(['src/todos.js', 'src/App.jsx', 'src/todos.test.js'])],
    });
    expect(r).toMatchObject({ cold: true, leftBehind: [], mendedAfter: ['src/App.jsx', 'src/todos.test.js'], oq272: true, reportMissing: [] });
  });

  it('a report that misses a file the rename changed is named, and a search by another agent does not warm this one', () => {
    const r = renameReading({ calls: [call(1, 'find_referencing_symbols', {}, 'Coding Agent 2'), call(2, 'rename_symbol', RENAME)], files: renamed(), children: [child(['src/todos.js'])], artifacts: [] });
    expect(r.searchedFirst).toBe(false);
    expect(r.reportMissing).toEqual(['src/App.jsx', 'src/todos.test.js']);
    expect(r.artifactMissing).toEqual(RENAME_FILES);
  });
});
