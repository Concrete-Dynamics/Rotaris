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
    // The arguments keep their shape: an object with every key, the free text cut and marked, the path and the operation whole.
    const stored = entry['args'] as Record<string, unknown>;
    expect(Object.keys(stored).sort()).toEqual(['content', 'operation', 'path']);
    expect(stored['path']).toBe('/tmp/verify.mjs');
    expect(stored['operation']).toBe('create');
    expect(stored['content']).toMatch(/^\/\/ a long script\ncheck\(x, 1\);\n.*\.\.\.$/su);
    expect(args.content.startsWith((stored['content'] as string).slice(0, -3))).toBe(true);
    expect(JSON.stringify(stored).length).toBeLessThanOrEqual(2_000);
    expect(entry['result']).toBe(`${result.slice(0, 1_997)}...`);
    expect((entry['result'] as string).length).toBe(2_000);
  });

  // The fin23 verifier's finding on the first repair, which stored cut args as the marked head of their JSON text: REQ-SESSION-194
  // ends "Counts, identifiers, paths and timestamps are never truncated", and the model, not the product, sets the key order.
  it('keeps a path whole when the model serialised it after a long value', () => {
    const args = { content: 'x'.repeat(1_990), path: '/ws/src/x.ts' };
    const entry = settled(args, { is_error: true, result: 'refused' });
    const stored = entry['args'] as Record<string, unknown>;
    expect(stored['path']).toBe('/ws/src/x.ts');
    expect(stored['content']).toBe(`${'x'.repeat((stored['content'] as string).length - 3)}...`);
    expect(JSON.stringify(stored).length).toBe(2_000);
  });

  it('keeps identifiers, counts and timestamps whole wherever they stand', () => {
    const args = { note: 'n'.repeat(2_500), task_ids: ['t-1', 't-2'], limit: 123_456, since: '2026-10-06T17:41:48.175Z', items: [{ title: 'a'.repeat(900), file_path: '/ws/a.ts' }] };
    const stored = settled(args, { is_error: true, result: 'refused' })['args'] as Record<string, unknown>;
    expect(stored['task_ids']).toEqual(['t-1', 't-2']);
    expect(stored['limit']).toBe(123_456);
    expect(stored['since']).toBe('2026-10-06T17:41:48.175Z');
    expect((stored['items'] as { file_path: string }[])[0]!.file_path).toBe('/ws/a.ts');
    expect(stored['note']).toMatch(/^n+\.\.\.$/u);
    expect(JSON.stringify(stored).length).toBeLessThanOrEqual(2_000);
  });

  // PD-SESSION-003 (OQ-209, ruled 2026-10-07 under R-072): a path longer than the cap on its own. REQ-SESSION-194's "never
  // truncated" governs, so the path stays whole, the free text is cut to the marker alone, and the record exceeds 2,000 characters.
  it('keeps a path longer than the cap whole and cuts the free text to the marker (PD-SESSION-003)', () => {
    const path = `/ws/${'d/'.repeat(1_100)}x.ts`;
    const stored = settled({ path, content: 'c'.repeat(500) }, { is_error: true, result: 'refused' })['args'] as Record<string, unknown>;
    expect(stored['path']).toBe(path);
    expect(stored['content']).toBe('...');
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
