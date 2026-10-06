/**
 * PD-TOOLS-007 and PD-TOOLS-008 as the live run reads them from the tool-call record, pinned against the shapes the
 * recorded runs held (duress at 27a5127, finding H6; default `frictions` at 71ad8e8, finding a71-7).
 */
import { describe, expect, it } from 'vitest';
// @ts-expect-error — the reader is plain ESM beside the script that runs it.
import { todoActiveReadings, writeSelectorReadings } from './tool-frictions.mjs';

const ords = (calls: { ordinal: number }[]) => calls.map((c) => c.ordinal);

describe('writeSelectorReadings (PD-TOOLS-007)', () => {
  const refusal = "write_file requires an operation: one of create, edit, overwrite, insert, undo. Example: {…}. (operation: Invalid option)";
  it('the duress run\'s shape refused is the old reading; the same call read as a create is the new one', () => {
    const calls = [
      { ordinal: 81, tool_name: 'write_file', status: 'failed', args: { path: 'docs/api.md', content: '# API\n' }, result: refusal },
      { ordinal: 83, tool_name: 'write_file', status: 'ok', args: { operation: 'create', path: 'docs/overview.md', content: 'x' }, result: 'Created docs/overview.md: 1 line created. (sha256 ab)' },
      { ordinal: 90, tool_name: 'write_file', status: 'ok', args: { path: 'docs/d.md', content: 'x', operation: 'create' }, result: "Created docs/d.md: 1 line created. (sha256 ab)\nNo operation was given, so this call was read as 'create': docs/d.md did not exist. Name the operation on every write_file call." },
    ];
    const r = writeSelectorReadings(calls);
    expect(ords(r.refusedInferable)).toEqual([81]);
    expect(ords(r.inferred)).toEqual([90]);
  });

  it('a refusal that says its file exists, or of a call carrying another operation\'s field, is not the old shape', () => {
    const calls = [
      { ordinal: 1, tool_name: 'write_file', status: 'failed', args: { path: 'a.md', content: 'x' }, result: "write_file requires an operation: … a.md already exists, so the call was not read as a create; name 'overwrite' or 'edit'. (…)" },
      { ordinal: 2, tool_name: 'write_file', status: 'failed', args: { path: 'a.md', content: 'x', insert_line: 0 }, result: refusal },
      { ordinal: 3, tool_name: 'haet_edit', status: 'failed', args: { path: 'a.md', content: 'x' }, result: refusal },
    ];
    expect(writeSelectorReadings(calls)).toEqual({ inferred: [], refusedInferable: [] });
  });
});

describe('todoActiveReadings (PD-TOOLS-008)', () => {
  it('the frictions run of 2026-10-01: the refusal named 3c55ec35, and the update of it was refused as unknown', () => {
    const calls = [
      { ordinal: 8, tool_name: 'todo', status: 'failed', args: { operation: 'update', task_id: '3c55ec35', state: 'COMPLETED' }, result: "Unknown task id '3c55ec35'. Available phases: (none). Available tasks: (none)." },
      { ordinal: 1, tool_name: 'todo', status: 'failed', args: { operation: 'replace' }, result: 'Only one task can be IN_PROGRESS at a time. Active task: 3c55ec35 (Create friction-probe.txt). Mark it COMPLETED or ABANDONED before moving another task to IN_PROGRESS.' },
      { ordinal: 9, tool_name: 'todo', status: 'failed', args: { operation: 'update', task_id: 'ffffffff' }, result: "Unknown task id 'ffffffff'. Available phases: (none)." },
    ];
    const r = todoActiveReadings(calls);
    expect(ords(r.phantoms)).toEqual([8]);
    expect(r.severalActive).toEqual([]);
  });

  it('the new refusal names no id, and is counted', () => {
    const calls = [{ ordinal: 1, tool_name: 'todo', status: 'failed', args: { operation: 'replace' }, result: "Only one task can be IN_PROGRESS at a time. The submitted list marks 2 tasks IN_PROGRESS ('a', 'b'), so the replace was rejected and nothing was saved. Send it again with at most one task IN_PROGRESS." }];
    expect(todoActiveReadings(calls)).toEqual({ severalActive: calls, phantoms: [] });
  });
});
