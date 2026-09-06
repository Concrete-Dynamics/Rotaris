import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { asSessionId, FakeClock, millis, mintMachineId, mintWorkspaceId, type MachineId, type SessionId } from '@rotaris/kernel';
import { migrateStore, openStore, RELEASE_PAGE_SIZE, RESIDENT_ROW_CAP, StoreDal, forgetSpelling } from '@rotaris/store';
import type { SessionSnapshot, TranscriptIncrement } from '@rotaris/contracts';
import { createReplicaStore } from '@rotaris/ui-core';
import { answer, DefaultAgentBackend, ScriptedModelClient } from '@rotaris/model';
import { ProjectionOwner, RefusalLease, RUN_CONFIG_DEFAULTS, SequenceCounters, SessionWriter, Sessions, parseEventLine, serializeEvent, toSessionRecord, toTranscriptRow, type Publisher } from './index.js';

const HOST = mintMachineId('0000000000000000000000000000000a') as MachineId;

describe('engine — the refusal lease (ADR-0058 step 3b, IC-1 E3b)', () => {
  it('refuses while held, and re-admits by itself after the lease expires with nothing to release it', () => {
    const clock = new FakeClock();
    const lease = new RefusalLease(clock);
    const id = mintWorkspaceId('00000000000000000000000000000001');
    lease.refuse(id, millis(30_000));
    expect(lease.isRefusing(id)).toBe(true);
    clock.advance(29_999);
    expect(lease.isRefusing(id)).toBe(true);
    clock.advance(1);
    expect(lease.isRefusing(id)).toBe(false);
  });
});

describe('engine — the sequence counter (REQ-MONITOR-214)', () => {
  it('starts at 1 per session, rises by exactly one per stamp, and sessions do not share', () => {
    const c = new SequenceCounters();
    const a = asSessionId('a');
    const b = asSessionId('b');
    expect(c.stamp(a)).toBe(1);
    expect(c.stamp(a)).toBe(2);
    expect(c.stamp(b)).toBe(1);
    expect(c.peek(a)).toBe(3);
  });
});

describe('engine — the one serialiser (REQ-EVENTS-064/065/068/080/089)', () => {
  const base = { event: 'transcript.row' as const, session_id: 's', timestamp: '2026-09-03T00:00:00.000Z', schema_version: 1 };
  it('compact, keys sorted at every depth, non-ASCII escaped; two equal events are byte-identical', () => {
    const a = serializeEvent({ ...base, row: { z: 1, a: 'ü — ✓' }, index: 0 });
    const b = serializeEvent({ ...base, index: 0, row: { a: 'ü — ✓', z: 1 } });
    expect(a.ok && b.ok && a.value === b.value).toBe(true);
    if (!a.ok) return;
    expect(a.value).toBe('{"event":"transcript.row","index":0,"row":{"a":"\\u00fc \\u2014 \\u2713","z":1},"schema_version":1,"session_id":"s","timestamp":"2026-09-03T00:00:00.000Z"}');
    expect(/[^\x20-\x7e]/.test(a.value)).toBe(false);
  });
  it('a newline inside payload text is escaped, so the line stays one line', () => {
    const r = serializeEvent({ ...base, row: { text: 'two\nlines\r\n' } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(/[\r\n]/.test(r.value)).toBe(false);
  });
  it('a value that cannot be serialised fails as a value, never a throw', () => {
    const r = serializeEvent({ ...base, bad: 1n as unknown });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('not-serializable');
  });
  it('the reader refuses an event outside the catalogue rather than inferring one', () => {
    expect(parseEventLine('{"event":"made.up","session_id":"s","timestamp":"t","schema_version":1}').ok).toBe(false);
    expect(parseEventLine('{"event":"result","session_id":"s","timestamp":"t","schema_version":1}').ok).toBe(true);
  });
});

/** A publisher that records what it saw, in order, across both channels. */
function recorder(): Publisher & { seen: { channel: 'inc' | 'snap'; seq: number; payload: TranscriptIncrement | SessionSnapshot }[] } {
  const seen: { channel: 'inc' | 'snap'; seq: number; payload: TranscriptIncrement | SessionSnapshot }[] = [];
  return {
    seen,
    increment: (p) => seen.push({ channel: 'inc', seq: p.seq, payload: p }),
    snapshot: (p) => seen.push({ channel: 'snap', seq: p.seq, payload: p }),
  };
}

describe('engine — the session writer feeds the projection owner (ADR-0008, ADR-0043, ADR-0010)', () => {
  let dir: string;
  let dal: StoreDal;
  let clock: FakeClock;
  const warnings: string[] = [];
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rotaris-engine-'));
    const db = openStore(join(dir, 'workspace.db'));
    migrateStore(db);
    dal = new StoreDal(db);
    clock = new FakeClock();
    warnings.length = 0;
  });
  afterEach(() => { dal.db.close(); forgetSpelling(dir); rmSync(dir, { recursive: true, force: true }); });

  function open(sid: string, publisher: Publisher, cap = 20_000) {
    const sessionId = asSessionId(sid);
    let owner: ProjectionOwner | undefined;
    const created = SessionWriter.create(
      { dal, sessionId, wall: clock, retentionCap: cap, warn: (m) => warnings.push(m), onCommitted: (c) => owner?.onCommitted(c) },
      { workspaceRoot: 'C:\\ws', pid: 4242, host: HOST },
    );
    if (!created.ok) throw new Error(JSON.stringify(created.error));
    owner = new ProjectionOwner({
      sessionId, seq: new SequenceCounters(), timers: clock, publisher,
      readSession: () => toSessionRecord(dal.getSession(sessionId)!),
      readResident: () => dal.residentRows(sessionId).map(toTranscriptRow),
    });
    return { writer: created.value, owner, sessionId };
  }

  it('REQ-SESSION-089 / REQ-EVENTS-087: the record is opened, the lock taken and the history open in one step; session.start is ordinal 1', () => {
    const { sessionId } = open('s1', recorder());
    const row = dal.getSession(sessionId)!;
    expect(row.history_open).toBe(1);
    expect(dal.getLock(sessionId)?.pid).toBe(4242);
    const first = dal.eventsFrom(sessionId, 1, 1)[0]!;
    expect(first.kind).toBe('session.start');
    expect(first.ordinal).toBe(1);
    // REQ-EVENTS-080: the stored line IS the wire line, and it parses back to itself.
    expect(parseEventLine(first.payload).ok).toBe(true);
  });

  it('ADR-0024: a decision, a tool call and an issue each commit with their event; the audit refuses a foreign field; the wire row is masked', () => {
    const rec = recorder();
    const { writer, sessionId } = open('s-rings', rec);
    // a decision entry, id = ordinal, permission.decision in the same commit
    const d = writer.recordDecision({ timestamp: 't', session_id: sessionId, agent_id: 'orchestrator', persona: 'orchestrator', tool_name: 'terminal', decision: 'deny', rule_id: 'starter:deny-recursive-delete', source: 'rule', summary: 'terminal: rm -rf x', reason: 'r' });
    expect(d.ok && d.value).toBe(1);
    const audit = dal.auditOf(sessionId);
    expect(JSON.parse(audit[0]!.entry)).toMatchObject({ id: 1, decision: 'deny', rule_id: 'starter:deny-recursive-delete' });
    expect(Object.keys(JSON.parse(audit[0]!.entry))).not.toContain('args');
    const bad = writer.recordDecision({ timestamp: 't', session_id: sessionId, agent_id: 'a', persona: 'p', tool_name: 't', decision: 'allow', rule_id: 'r', source: 'rule', summary: 's', reason: 'r', args: { x: 1 } } as never);
    expect(bad.ok).toBe(false);
    expect(dal.auditOf(sessionId)).toHaveLength(1);
    // a mode change interleaves in the same ordinal series
    const m = writer.recordModeChange({ timestamp: 't', event: 'permission_mode_change', session_id: sessionId, agent_id: 'user', requested_mode: 'autonomous', effective_mode: 'autonomous', previous_mode: 'ask', source: 'user', reason: '', skipped_personas: [] });
    expect(m.ok && m.value).toBe(2);
    // the tool call: running at start, settled once, args unredacted in the record and masked on the wire
    const openCall = { call_id: 'c1', agent_name: 'orchestrator', tool_name: 'terminal', args: { command: 'curl --token abc123 https://x' } };
    const o = writer.openToolCall(openCall);
    expect(o.ok && o.value).toBe(1);
    expect(dal.toolCallsOf(sessionId)[0]).toMatchObject({ status: 'running', call_id: 'c1' });
    expect(dal.toolCallsOf(sessionId)[0]!.entry).toContain('abc123');
    const startEv = dal.eventsOfKind(sessionId, 'tool.start')[0]!;
    expect(startEv.payload).not.toContain('abc123');
    expect(startEv.payload).toContain('***');
    expect(writer.settleToolCall(1, openCall, { status: 'ok', elapsed_ms: 12, is_error: false, result: 'done' }).ok).toBe(true);
    expect(dal.toolCallsOf(sessionId)[0]).toMatchObject({ status: 'ok', elapsed_ms: 12 });
    const again = writer.settleToolCall(1, openCall, { status: 'failed', elapsed_ms: 13, is_error: true, result: 'x' });
    expect(again.ok && again.value).toBe(false);
    expect(dal.eventsOfKind(sessionId, 'tool.finish')).toHaveLength(1);
    // an issue: 12 hex, an `issue` timeline entry, an error event only at error severity
    const w = writer.recordIssue({ kind: 'permission_denied', severity: 'warning', actor: 'orchestrator', message: 'm', evidence_ref: 'permission_audit#1' });
    expect(w.ok && /^[0-9a-f]{12}$/.test(w.value as string)).toBe(true);
    expect(dal.eventsOfKind(sessionId, 'error')).toHaveLength(0);
    const e = writer.recordIssue({ kind: 'terminal_shell_failure', severity: 'error', actor: 'orchestrator', message: 'boom' });
    expect(dal.eventsOfKind(sessionId, 'error')).toHaveLength(1);
    expect(dal.eventsOfKind(sessionId, 'error')[0]!.payload).toContain(`issues#${e.ok ? e.value : ''}`);
    expect(dal.timelineOf(sessionId).filter((t) => t.name === 'issue')).toHaveLength(2);
    // REQ-SESSION-134 (the repair of Part U's defect 42): every entry carries its own 12-hex id, and an `issue` entry
    // takes the severity of the issue it mirrors rather than the default.
    expect(dal.timelineOf(sessionId).filter((t) => t.name === 'issue').map((t) => t.severity)).toEqual(['warning', 'error']);
    expect(writer.appendTimeline('run_start', 'rotaris', 'a run is starting.', {}).ok).toBe(true);
    expect(writer.appendTimeline('hook_run', 'A', "Hook 'A' (pre_tool) exited 1 in 5 ms", {}, 'warning').ok).toBe(true);
    const entries = dal.timelineOf(sessionId);
    expect(entries.every((t) => /^[0-9a-f]{12}$/.test(t.id))).toBe(true);
    expect(new Set(entries.map((t) => t.id)).size).toBe(entries.length);
    expect(entries.slice(-2).map((t) => [t.name, t.severity])).toEqual([['run_start', 'info'], ['hook_run', 'warning']]);
    // a tool row keeps its untruncated input in the record; the wire masks and clips it
    const r = writer.appendRow('tool', 'terminal: curl', false, { toolName: 'terminal', toolStatus: 'running', callKey: 'c1', input: 'curl --token abc123 ' + 'y'.repeat(20_000) });
    expect(r.ok).toBe(true);
    expect(dal.residentRows(sessionId)[0]!.input!.length).toBe(20_020);
    const rowEv = dal.eventsOfKind(sessionId, 'transcript.row').at(-1)!;
    expect(rowEv.payload).not.toContain('abc123');
    expect(JSON.parse(rowEv.payload).row.input.length).toBe(16_001);
    const settled = writer.settleRow(0, 'terminal: curl', { toolStatus: 'blocked', durationMs: 0.5, blockedReason: 'denied' });
    expect(settled.ok && settled.value.toolStatus).toBe('blocked');
    expect(dal.residentRows(sessionId)[0]).toMatchObject({ tool_status: 'blocked', duration_ms: 0.5, blocked_reason: 'denied' });
  });

  it('a second claim of the same session is refused as lock-held and steals nothing (REQ-SESSION-047)', () => {
    open('s1', recorder());
    const again = SessionWriter.create(
      { dal, sessionId: asSessionId('s1'), wall: clock, retentionCap: 0, warn: () => {}, onCommitted: () => {} },
      { workspaceRoot: 'C:\\ws', pid: 9999, host: HOST },
    );
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.code).toBe('lock-held');
    expect(dal.getLock(asSessionId('s1'))?.pid).toBe(4242);
  });

  it('REQ-EVENTS-072 / REQ-MONITOR-221: the row and its transcript.row event commit together, and the publication follows the commit', () => {
    const pub = recorder();
    const { writer, sessionId } = open('s1', pub);
    let observedAtPublish: { rows: number; events: number } | undefined;
    const spy: Publisher = { ...pub, increment: (p) => { observedAtPublish = { rows: dal.rowCount(sessionId), events: dal.eventCount(sessionId) }; pub.increment(p); } };
    const owner2 = new ProjectionOwner({ sessionId, seq: new SequenceCounters(), timers: clock, publisher: spy, readSession: () => toSessionRecord(dal.getSession(sessionId)!), readResident: () => [] });
    const w2 = new SessionWriter({ dal, sessionId, wall: clock, retentionCap: 0, warn: () => {}, onCommitted: (c) => owner2.onCommitted(c) });
    void writer;
    const r = w2.appendRow('user', 'hello', true);
    expect(r.ok).toBe(true);
    // At the instant of publication the row AND its event were already durable.
    expect(observedAtPublish).toEqual({ rows: 1, events: 2 });
    const ev = dal.eventsOfKind(sessionId, 'transcript.row')[0]!;
    const parsed = parseEventLine(ev.payload);
    expect(parsed.ok && (parsed.value as unknown as { index: number }).index).toBe(0);
  });

  it('REQ-MONITOR-214: every attach begins with a snapshot, then the resident transcript; the counter is shared by both channels', () => {
    const pub = recorder();
    const { writer, owner } = open('s1', pub);
    writer.appendRow('user', 'a', true);
    writer.appendRow('user', 'b', true);
    owner.attach();
    expect(pub.seen.map((s) => `${s.channel}:${s.seq}`)).toEqual(['inc:1', 'inc:2', 'snap:3', 'inc:4']);
    const attachInc = pub.seen[3]!.payload as TranscriptIncrement;
    expect(attachInc.earliestChanged).toBe(0);
    expect(attachInc.rows.map((r) => r.body)).toEqual(['a', 'b']);
  });

  it('end to end in one process: writer → owner → relay-shaped publisher → replica, with the step-0 check applied', () => {
    const replica = createReplicaStore({ requestReconcile: () => {} });
    replica.getState().follow('s1');
    const publisher: Publisher = { increment: (p) => replica.getState().applyIncrement(p), snapshot: (p) => replica.getState().applySnapshot(p) };
    const { writer, owner } = open('s1', publisher);
    writer.appendRow('user', 'first', true);
    // Not yet attached: the replica had no expectation, so the row was dropped, not refused.
    expect(replica.getState().counters.dropped).toBe(1);
    owner.attach();
    expect(replica.getState().rows.map((r) => r.body)).toEqual(['first']);
    writer.appendRow('assistant', 'partial', false);
    expect(replica.getState().rows[1]).toMatchObject({ index: 1, settled: false, body: 'partial' });
    // Growth: in memory, coalesced into a 50 ms trailing tick, no commit (REQ-MONITOR-219).
    owner.grow(1, 'partial and');
    owner.grow(1, 'partial and more');
    expect(replica.getState().rows[1]!.body).toBe('partial');
    clock.advance(49);
    expect(replica.getState().rows[1]!.body).toBe('partial');
    clock.advance(1);
    expect(replica.getState().rows[1]!.body).toBe('partial and more');
    expect(dal.residentRows(asSessionId('s1'))[1]!.body).toBe('partial');
    // Settle: committed, published, the second and last event for the index (REQ-EVENTS-052).
    writer.settleRow(1, 'partial and more, done');
    expect(replica.getState().rows[1]).toMatchObject({ settled: true, body: 'partial and more, done' });
    expect(dal.eventsOfKind(asSessionId('s1'), 'transcript.row')).toHaveLength(3);
    expect(replica.getState().counters).toMatchObject({ refused: 0, superseded: 0 });
    // REQ-MONITOR-242: what the surface holds equals what a reattach restores.
    expect(replica.getState().rows).toEqual(dal.residentRows(asSessionId('s1')).map(toTranscriptRow));
  });

  it('a row already settled cannot be settled twice — one or two events per index and never more (REQ-EVENTS-052)', () => {
    const { writer } = open('s1', recorder());
    writer.appendRow('user', 'x', true);
    const r = writer.settleRow(0, 'y');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('row-already-settled');
  });

  it('REQ-SESSION-192 / REQ-SESSION-131: the 5001st append releases the oldest 50 rows as one page, in the same transaction, indices untouched', () => {
    const pub = recorder();
    const { writer, owner, sessionId } = open('s1', pub);
    for (let i = 0; i < RESIDENT_ROW_CAP; i++) writer.appendRow('user', `r${i}`, true);
    expect(dal.residentCount(sessionId)).toBe(RESIDENT_ROW_CAP);
    writer.appendRow('user', 'overflow', true);
    expect(dal.residentCount(sessionId)).toBe(RESIDENT_ROW_CAP - RELEASE_PAGE_SIZE + 1);
    expect(dal.rowCount(sessionId)).toBe(RESIDENT_ROW_CAP + 1);
    const released = dal.rowsBefore(sessionId, RELEASE_PAGE_SIZE, RELEASE_PAGE_SIZE);
    expect(released).toHaveLength(RELEASE_PAGE_SIZE);
    expect(released.every((r) => r.page === 1)).toBe(true);
    expect(released.map((r) => r.row_index).sort((a, b) => a - b)).toEqual([...Array(RELEASE_PAGE_SIZE).keys()]);
    // The owner dropped the same rows and holds the window from index 50.
    expect(owner.lowestIndexHeld).toBe(RELEASE_PAGE_SIZE);
    expect(owner.residentRows).toHaveLength(RESIDENT_ROW_CAP - RELEASE_PAGE_SIZE + 1);
    // A released row is unreachable to the settle path (REQ-SESSION-131: never rewritten).
    expect(dal.settleRow(sessionId, 0, 'rewritten')).toBe(false);
    expect(dal.rowsBefore(sessionId, 1, 1)[0]!.body).toBe('r0');
  });

  it('REQ-EVENTS-091/092: the trim is its own transaction after the append that overflowed cap + cap ÷ 8, keeps the newest cap, and records four facts', () => {
    const cap = 16;
    const { writer, sessionId } = open('s1', recorder(), cap);
    const headroom = cap + Math.floor(cap / 8); // 18
    // session.start is ordinal 1; append until the history exceeds 18 events.
    for (let i = 0; i < headroom; i++) writer.appendRow('user', `r${i}`, true); // 19 events → trim
    expect(dal.eventCount(sessionId)).toBe(cap);
    const s = dal.getSession(sessionId)!;
    expect(s.truncated).toBe(1);
    expect(s.dropped_count).toBe(headroom + 1 - cap);
    expect(s.trim_cap).toBe(cap);
    expect(s.last_trim_at).not.toBeNull();
    expect(writer.droppedCount).toBe(3);
    // The newest cap survive, contiguous, and the oldest surviving ordinal is what it should be.
    const kept = dal.eventsFrom(sessionId, 1, 100);
    expect(kept[0]!.ordinal).toBe(headroom + 1 - cap + 1);
    expect(kept[kept.length - 1]!.ordinal).toBe(headroom + 1);
  });

  it('a cap of 0 never trims (REQ-EVENTS-091)', () => {
    const { writer, sessionId } = open('s1', recorder(), 0);
    for (let i = 0; i < 40; i++) writer.appendRow('user', `r${i}`, true);
    expect(dal.eventCount(sessionId)).toBe(41);
    expect(dal.getSession(sessionId)!.truncated).toBe(0);
  });

  it('REQ-EVENTS-088: the first recording failure is sticky, warned exactly once, and later recordings return a failure value', () => {
    const { writer, sessionId } = open('s1', recorder());
    writer.appendRow('user', 'ok', true);
    // Make the store unwritable underneath the writer: a read-only transaction forced by dropping the table.
    dal.db.exec('DROP TABLE events');
    const r1 = writer.appendRow('user', 'fails', true);
    const r2 = writer.appendRow('user', 'also fails', true);
    expect(r1.ok).toBe(false);
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error.code).toBe('history-failed');
    expect(warnings.filter((w) => w.includes('incomplete from this point'))).toHaveLength(1);
    // The failed unit of work left nothing behind: the row that failed is absent whole (REQ-SESSION-034).
    expect(dal.rowCount(sessionId)).toBe(1);
  });

  it('REQ-SESSION-070: a terminal-status save is committed at the stronger setting and is readable by another connection before it returns', () => {
    const { writer, sessionId } = open('s1', recorder());
    const other = openStore(join(dir, 'workspace.db'));
    const r = writer.save('completed');
    expect(r.ok).toBe(true);
    expect((other.prepare('SELECT execution_status AS s FROM sessions WHERE session_id = ?').get(sessionId) as { s: string }).s).toBe('completed');
    expect(dal.db.pragma('synchronous', { simple: true })).toBe(1); // NORMAL restored
    other.close();
  });

  it('Sessions: start records the prompt as row 0 kind user and runs it; attach and pageOlder serve a surface (REQ-CHAT-011, REQ-CHAT-165)', async () => {
    const pub = recorder();
    let n = 0;
    const model = { backend: new DefaultAgentBackend(new ScriptedModelClient([answer('done')])), config: { ...RUN_CONFIG_DEFAULTS, model: { providerId: 'p', modelId: 'm', dialect: 'chat' as const }, credentialFor: () => async () => 'k' } };
    const sessions = new Sessions({ clocks: clock, publisher: pub, pid: 1, host: HOST, retentionCap: 20_000, warn: () => {}, mintSessionId: () => `sid-${++n}`, model, sessionFilesDir: () => join(dir, 'sessions', `sid-${n}`) });
    const started = sessions.start(dal, 'C:\\ws', 'build me a thing');
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const sid: SessionId = started.value;
    expect(dal.residentRows(sid)[0]).toMatchObject({ row_index: 0, kind: 'user', body: 'build me a thing', settled: 1 });
    await sessions.running(sid);
    expect(dal.getSession(sid)!.execution_status).toBe('completed');
    expect(sessions.attach(sid)).toBe(true);
    const snap = pub.seen.filter((s) => s.channel === 'snap').at(-1)!.payload as SessionSnapshot;
    expect(snap.session).toMatchObject({ id: sid, executionStatus: 'completed', historyOpen: true, truncation: { truncated: false, droppedCount: 0 }, stopReason: 'tasks_complete' });
    sessions.prompt(sid, 'and another');
    const page = sessions.pageOlder(sid, 1)!;
    expect(page.rows.map((r) => r.body)).toEqual(['build me a thing']);
    expect(page.oldest).toBe(true);
    await sessions.closeAll();
    expect(dal.getLock(sid)).toBeUndefined();
  });
});
