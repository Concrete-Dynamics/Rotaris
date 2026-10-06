/**
 * PD-TOOLS-007 and PD-TOOLS-008 as the live run reads them from the tool-call record, pinned against the shapes the
 * recorded runs held (duress at 27a5127, finding H6; default `frictions` at 71ad8e8, finding a71-7).
 */
import { describe, expect, it } from 'vitest';
// @ts-expect-error — the reader is plain ESM beside the script that runs it.
import { argumentFields, runWideReadings, todoActiveReadings, writeSelectorReadings } from './tool-frictions.mjs';

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
    expect(writeSelectorReadings(calls)).toEqual({ inferred: [], refusedInferable: [], refusedFenced: [] });
  });

  /*
   * The session writer stores an error-path record's arguments over 2,000 characters as their JSON cut to a string
   * (REQ-SESSION-136), so a refused whole-file write — the duress shape the reading exists for — was never create-shaped
   * (finding M2 of the c2a9444 default run:
   * `docs/defects/fixed/the-live-runs-tool-friction-checks-read-two-scenarios-and-miss-a-refused-call-whose-arguments-were-cut.md`).
   */
  const cut = (args: Record<string, unknown>, marker = '') => `${JSON.stringify(args).slice(0, 2000 - marker.length)}${marker}`;
  const long = 'export const x = "a\\b";\n'.repeat(200);

  it('a refused whole-file write whose arguments were cut to a string is the old shape, with or without REQ-SESSION-194\'s marker', () => {
    const calls = [
      { ordinal: 5, tool_name: 'write_file', status: 'failed', args: cut({ path: 'src/big.ts', content: long }), result: refusal },
      { ordinal: 6, tool_name: 'write_file', status: 'failed', args: cut({ file_path: 'src/big.ts', content: long }, '...'), result: refusal },
    ];
    expect(ords(writeSelectorReadings(calls).refusedInferable)).toEqual([5, 6]);
    expect(argumentFields(calls[0]!.args)).toMatchObject({ cut: true });
    expect(argumentFields(calls[0]!.args).fields.get('path')).toEqual({ value: 'src/big.ts', complete: true });
    expect(argumentFields(calls[0]!.args).fields.get('content').complete).toBe(false);
  });

  it('cut arguments that name an operation, carry another operation\'s field, or lost their path to the cut are not the old shape', () => {
    const calls = [
      { ordinal: 1, tool_name: 'write_file', status: 'failed', args: cut({ operation: 'create', path: 'a.ts', content: long }), result: refusal },
      { ordinal: 2, tool_name: 'write_file', status: 'failed', args: cut({ path: 'a.ts', old_string: 'x', content: long }), result: refusal },
      { ordinal: 3, tool_name: 'write_file', status: 'failed', args: cut({ content: long, path: 'a.ts' }), result: refusal },
      { ordinal: 4, tool_name: 'write_file', status: 'failed', args: '{"path": 7, "content": "x"', result: refusal },
      { ordinal: 5, tool_name: 'write_file', status: 'failed', args: 'not json at all', result: refusal },
    ];
    expect(writeSelectorReadings(calls)).toEqual({ inferred: [], refusedInferable: [], refusedFenced: [] });
  });

  it('the requirements session at c2a9444: ordinal 62, cut, names a path outside the workspace, which the fence refuses — the directive\'s own refusal', () => {
    const outside = (path: string) => path.startsWith('/') && !path.startsWith('/tmp/rotaris-live-run/');
    const call = { ordinal: 62, tool_name: 'write_file', status: 'failed', args: cut({ path: '/tmp/rotaris-verify-req104.mjs', content: long }), result: refusal };
    expect(writeSelectorReadings([call], { outside })).toEqual({ inferred: [], refusedInferable: [], refusedFenced: [call] });
    expect(ords(writeSelectorReadings([call]).refusedInferable)).toEqual([62]);
  });
});

describe('runWideReadings (PD-TOOLS-007, PD-TOOLS-008, REQ-SESSION-136)', () => {
  const refusal = 'write_file requires an operation: one of create, edit, overwrite, insert, undo. (operation: Invalid option)';
  it('the c2a9444 default run: the requirements and resume sessions held what the frictions session did not', () => {
    const outside = (path: string) => path.startsWith('/tmp/rotaris-verify');
    const sessions = [
      { scenario: 'resume', issues: [], calls: [{ ordinal: 9, tool_name: 'write_file', status: 'ok', callId: 'r9', failureKind: null, args: { operation: 'create', path: 'NOTES.md', content: 'x' }, result: "Created NOTES.md.\nNo operation was given, so this call was read as 'create': NOTES.md did not exist. Name the operation on every write_file call." }] },
      { scenario: 'requirements', issues: [{ kind: 'tool_error', evidence_ref: 'tool_call_evidence#q62' }], calls: [{ ordinal: 62, tool_name: 'write_file', status: 'failed', callId: 'q62', failureKind: 'invalid_request', args: `${JSON.stringify({ path: '/tmp/rotaris-verify-req104.mjs', content: 'y'.repeat(3000) }).slice(0, 2000)}`, result: refusal }] },
      { scenario: 'frictions', issues: [], calls: [{ ordinal: 1, tool_name: 'write_file', status: 'ok', callId: 'f1', failureKind: null, args: { operation: 'create', path: 'friction-probe.txt', content: 'probe-ok\n' }, result: 'Created friction-probe.txt.' }] },
    ];
    const r = runWideReadings(sessions, { outside });
    expect(r.read).toEqual(['resume', 'requirements', 'frictions']);
    expect(r.refused.map((c: { scenario: string; ordinal: number }) => [c.scenario, c.ordinal])).toEqual([['requirements', 62]]);
    expect(r.unfiled).toEqual([]);
    expect(r.inferred.map((c: { scenario: string; ordinal: number }) => [c.scenario, c.ordinal])).toEqual([['resume', 9]]);
    expect(r.refusedInferable).toEqual([]);
    expect(r.refusedFenced.map((c: { scenario: string; ordinal: number }) => [c.scenario, c.ordinal])).toEqual([['requirements', 62]]);
    // An issue that names another call leaves the refusal unfiled, in its own scenario.
    expect(runWideReadings([{ ...sessions[1]!, issues: [{ kind: 'tool_error', evidence_ref: 'tool_call_evidence#other' }] }]).unfiled.map((c: { scenario: string }) => c.scenario)).toEqual(['requirements']);
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
