import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { asSessionId, FakeClock, mintMachineId, type MachineId, type SessionId } from '@rotaris/kernel';
import { forgetSpelling, migrateStore, openStore, RESIDENT_ROW_CAP, StoreDal } from '@rotaris/store';
import { Sessions } from './index.js';
import { sessionTaskTitle } from './todo-view.js';

/*
 * REQ-SESSION-042 / REQ-SESSION-154 with REQ-SESSION-030/032: the session list labels each row from its listing record
 * alone — the task title derived from the persisted todo (the newest top-level task), else the session id — and reads no
 * transcript. Before the repair of `docs/defects/fixed/the-session-list-reads-each-sessions-transcript-for-its-label.md`
 * `Sessions.list` read every listed session's resident rows and labelled it with the oldest resident prompt, so a session
 * whose first prompt was released past the resident window was listed under another name after a long run.
 */
const HOST = mintMachineId('0000000000000000000000000000000c') as MachineId;
const WS = 'C:/ws';

const planner = (...phases: (readonly { text: string; name?: string }[])[]) => JSON.stringify({
  schema_version: 1,
  phases: phases.map((tasks, p) => ({ id: `0000000${p}`, name: p === 0 ? 'main' : `phase ${p}`, tasks: tasks.map((t, i) => ({ id: `t${p}${i}`, ...t, state: 'complete', consecutiveRetries: 0 })) })),
});

describe('REQ-SESSION-032: the task title derived from the persisted todo', () => {
  it('is the last non-blank task name across phases, a task\'s name where it has one, skipping blank names and empty phases', () => {
    expect(sessionTaskTitle(planner([{ text: 'first' }, { text: 'second' }]))).toBe('second');
    expect(sessionTaskTitle(planner([{ text: 'first' }], [{ text: 'later phase' }], []))).toBe('later phase');
    expect(sessionTaskTitle(planner([{ text: 'kept' }], [{ text: '   ' }]))).toBe('kept');
    expect(sessionTaskTitle(planner([{ text: 'a queued prompt\'s text', name: 'Queued Prompt: 1a2b3c4d' }]))).toBe('Queued Prompt: 1a2b3c4d');
    // The version-2 envelope: the planner's document is the session's task list; the agent's own plan is not its title.
    const agent = { schema_version: 1, phases: [{ id: 'p', name: 'agent', tasks: [{ id: 'a', name: 'an agent step', description: 'd', state: 'PENDING' }] }] };
    expect(sessionTaskTitle(JSON.stringify({ schema_version: 2, planner: JSON.parse(planner([{ text: 'the task' }])), agent }))).toBe('the task');
  });

  it('is empty when there is none: no todo, a malformed one, only blank names', () => {
    expect(sessionTaskTitle(null)).toBe('');
    expect(sessionTaskTitle('')).toBe('');
    expect(sessionTaskTitle('{not json')).toBe('');
    expect(sessionTaskTitle(planner([{ text: '' }], []))).toBe('');
  });
});

describe('REQ-SESSION-042: Sessions.list reads nothing but the listing records', () => {
  let dir: string;
  let dal: StoreDal;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rotaris-list-'));
    const db = openStore(join(dir, 'workspace.db'));
    migrateStore(db);
    dal = new StoreDal(db);
  });
  afterEach(() => { dal.db.close(); forgetSpelling(dir); rmSync(dir, { recursive: true, force: true }); });

  const sessions = () => new Sessions({
    clocks: new FakeClock(), publisher: { increment: () => undefined, snapshot: () => undefined }, pid: 77, host: HOST,
    retentionCap: 20_000, warn: () => undefined, mintSessionId: () => 'S-new', model: null,
    sessionFilesDir: (_store, sid) => join(dir, 'sessions', sid), isProcessAlive: () => false,
  });
  const plant = (raw: string, todo: string | null, updated: string): SessionId => {
    const sid = asSessionId(raw);
    dal.upsertSession({ session_id: raw, execution_status: 'completed', workspace_root: WS, created_at: '2026-10-02T10:00:00.000Z', updated_at: updated, worktree: null });
    if (todo !== null) dal.updateSessionRun(sid, { todo });
    return sid;
  };

  it('labels each row with its task title, else its id, with the transcript unreadable', () => {
    // The first prompt released past the resident window by a long run: the label is the task title all the same.
    const long = plant('S-long', planner([{ text: 'the first prompt' }, { text: 'the newest prompt' }]), '2026-10-02T10:09:00.000Z');
    dal.transaction(() => {
      dal.appendRow(long, 0, 'user', true, 'the first prompt', '2026-10-02T10:00:00.000Z');
      for (let i = 1; i <= RESIDENT_ROW_CAP + 10; i++) dal.appendRow(long, i, i % 2 === 0 ? 'agent' : 'tool', true, `row ${i}`, '2026-10-02T10:01:00.000Z');
      dal.appendRow(long, RESIDENT_ROW_CAP + 11, 'user', true, 'the newest prompt', '2026-10-02T10:02:00.000Z');
      while (dal.residentCount(long) > RESIDENT_ROW_CAP) dal.releaseOldestPage(long, dal.nextPageNumber(long));
    });
    plant('S-one', planner([{ text: 'a single prompt' }]), '2026-10-02T10:08:00.000Z');
    // A row written before any run saved its todo (or by an older version): the reader default, the session id.
    const bare = plant('S-bare', null, '2026-10-02T10:07:00.000Z');
    dal.appendRow(bare, 0, 'user', true, 'a prompt the listing must not read', '2026-10-02T10:00:00.000Z');
    // Building the list reads no transcript: a DAL whose transcript reads throw still answers.
    const sealed = Object.create(dal) as StoreDal;
    for (const read of ['residentRows', 'rowsBefore', 'pageRows'] as const) {
      (sealed as unknown as Record<string, unknown>)[read] = () => { throw new Error(`the listing read the transcript (${read})`); };
    }
    expect(sessions().list(sealed, WS).map((r) => [r.sessionId, r.label])).toEqual([
      ['S-long', 'the newest prompt'],
      ['S-one', 'a single prompt'],
      ['S-bare', 'S-bare'],
    ]);
  });
});
