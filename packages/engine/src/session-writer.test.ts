import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { asSessionId, FakeClock, mintMachineId, type MachineId } from '@rotaris/kernel';
import { forgetSpelling, migrateStore, openStore, StoreDal } from '@rotaris/store';
import { SessionWriter } from './session-writer.js';

const HOST = mintMachineId('0000000000000000000000000000000b') as MachineId;

/**
 * REQ-SESSION-136's error-path cut under REQ-SESSION-194's marker
 * (docs/defects/fixed/an-error-path-tool-record-cuts-its-arguments-and-result-without-the-cut-marker.md, live-run M3): on
 * error the record's arguments and result are cut to 2,000 characters, and a cut value ends with `...`, counted inside the
 * cap, so a reader can tell it from a whole one. Before the repair the cut was a bare `slice(0, 2000)`: three of the final
 * default live run's twelve error-path records were cut and none was marked.
 */
describe('SessionWriter — an error-path tool record marks the cut it makes (REQ-SESSION-136, REQ-SESSION-194)', () => {
  let dir: string;
  let dal: StoreDal;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rotaris-writer-'));
    const db = openStore(join(dir, 'workspace.db'));
    migrateStore(db);
    dal = new StoreDal(db);
  });
  afterEach(() => { dal.db.close(); forgetSpelling(dir); rmSync(dir, { recursive: true, force: true }); });

  /** One call opened and settled through the writer; the stored record's entry, parsed. */
  const settled = (args: Record<string, unknown>, settle: { is_error: boolean; result: string }): Record<string, unknown> => {
    const sessionId = asSessionId('s-cut');
    const created = SessionWriter.create(
      { dal, sessionId, wall: new FakeClock(), retentionCap: 20_000, warn: () => undefined, onCommitted: () => undefined },
      { workspaceRoot: '/ws', pid: 4242, host: HOST },
    );
    if (!created.ok) throw new Error(JSON.stringify(created.error));
    const open = { call_id: 'c1', agent_name: 'orchestrator', tool_name: 'write_file', args };
    const o = created.value.openToolCall(open);
    if (!o.ok) throw new Error(JSON.stringify(o.error));
    const s = created.value.settleToolCall(o.value, open, { status: settle.is_error ? 'failed' : 'ok', elapsed_ms: 2, is_error: settle.is_error, result: settle.result });
    expect(s.ok && s.value).toBe(true);
    return JSON.parse(dal.toolCallsOf(sessionId)[0]!.entry) as Record<string, unknown>;
  };

  it('cuts long arguments and a long result to 2,000 characters, the last three the marker', () => {
    const args = { operation: 'create', path: '/tmp/verify.mjs', content: `// a long script\n${'check(x, 1);\n'.repeat(400)}` };
    const result = `write_file refused: ${'r'.repeat(3_000)}`;
    const entry = settled(args, { is_error: true, result });
    // The arguments are the head of their JSON text, marked; a reader sees an object's text that does not close.
    expect(typeof entry['args']).toBe('string');
    expect(entry['args']).toBe(`${JSON.stringify(args).slice(0, 1_997)}...`);
    expect((entry['args'] as string).length).toBe(2_000);
    expect(entry['result']).toBe(`${result.slice(0, 1_997)}...`);
    expect((entry['result'] as string).length).toBe(2_000);
  });

  it('keeps arguments and a result that fit whole and unmarked, the arguments still an object', () => {
    const args = { command: 'ls /missing' };
    const exact = 'e'.repeat(2_000);
    const entry = settled(args, { is_error: true, result: exact });
    expect(entry['args']).toEqual(args);
    expect(entry['result']).toBe(exact);
  });

  it('never cuts a call that succeeded', () => {
    const args = { content: 'x'.repeat(5_000) };
    const result = 'y'.repeat(5_000);
    const entry = settled(args, { is_error: false, result });
    expect(entry['args']).toEqual(args);
    expect(entry['result']).toBe(result);
  });

  it('never cuts between the two halves of a surrogate pair', () => {
    const result = `${'z'.repeat(1_996)}😀${'z'.repeat(100)}`;
    const entry = settled({}, { is_error: true, result });
    expect(entry['result']).toBe(`${'z'.repeat(1_996)}...`);
  });
});
