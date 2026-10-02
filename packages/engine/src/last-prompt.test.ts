import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { asSessionId, FakeClock, mintMachineId, type MachineId, type SessionId } from '@rotaris/kernel';
import { forgetSpelling, migrateStore, openStore, RESIDENT_ROW_CAP, StoreDal } from '@rotaris/store';
import { answer, DefaultAgentBackend, ScriptedModelClient, type ModelRequest, type ScriptedCall } from '@rotaris/model';
import { RUN_CONFIG_DEFAULTS, Sessions, type RunConfig } from './index.js';
import { persistAttachments } from './attachments.js';
import { lastSubmittedPrompt } from './sessions.js';

/*
 * REQ-NOTIFY-045 / REQ-NOTIFY-069 / REQ-SESSION-192 / REQ-ORCH-004: the session's last submitted prompt is read over every
 * row, resident or released, by one helper (`lastSubmittedPrompt`) that the retry, the continue, the plan decision and the
 * authentication restarts share. Before the repair of
 * `docs/defects/fixed/the-continue-reads-the-last-prompt-from-the-resident-window-and-falls-back-to-the-session-id.md` and
 * `docs/defects/fixed/the-retry-action-reads-the-last-prompt-from-the-resident-window.md`, the engine searched the resident
 * rows only (falling back to the session id as the prompt's text) and the retry was the renderer's, over its replica's
 * window.
 */
const HOST = mintMachineId('0000000000000000000000000000000e') as MachineId;
const WS = 'C:/ws';
const MODEL = { providerId: 'p', modelId: 'm', dialect: 'chat' as const };
const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
const SHOT = { name: 'shot.png', mediaType: 'image/png' as const, size: PNG.length, base64: PNG.toString('base64') };

describe('the session\'s last submitted prompt — one reading over every row, and the retry that resubmits it', () => {
  let dir: string;
  let dal: StoreDal;
  let clock: FakeClock;
  let minted = 0;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rotaris-last-prompt-'));
    const db = openStore(join(dir, 'workspace.db'));
    migrateStore(db);
    dal = new StoreDal(db);
    clock = new FakeClock();
  });
  afterEach(() => { dal.db.close(); forgetSpelling(dir); rmSync(dir, { recursive: true, force: true }); });

  const filesOf = (sid: string) => join(dir, 'sessions', sid);
  function sessionsWith(script: (turn: number) => ScriptedCall, over: { images?: boolean } = {}) {
    const client = new ScriptedModelClient([]);
    const original = client.stream.bind(client);
    let turn = 0;
    client.stream = (req) => { client.push(script(++turn)); return original(req); };
    const config: RunConfig = { ...RUN_CONFIG_DEFAULTS, model: over.images === false ? MODEL : { ...MODEL, acceptsImageInput: true }, credentialFor: () => async () => 'k' };
    const sessions = new Sessions({
      clocks: clock, publisher: { increment: () => undefined, snapshot: () => undefined }, pid: 91, host: HOST, retentionCap: 20_000, warn: () => undefined,
      mintSessionId: () => `L${++minted}`, model: { backend: new DefaultAgentBackend(client), config }, sessionFilesDir: (_d, sid) => filesOf(sid),
      runtime: { permissionMode: 'ask', allowUnsandboxedAutonomous: false, sandbox: { requested: false, available: false, backend: '' }, sessionLogLevel: 'WARNING', drainTimeoutMs: 0 },
      attended: () => true,
    });
    return { sessions, client };
  }
  const userRows = (sid: SessionId) => dal.rowsBefore(sid, dal.nextRowIndex(sid), 1_000_000).filter((r) => r.kind === 'user').reverse();
  const text = (r: ModelRequest) => r.messages.flatMap((m) => m.content.map((p) => (p.kind === 'text' ? p.text : ''))).join('\n');

  /**
   * A session a process left with its prompt (one PNG attached) and then more rows than the resident window holds, so the
   * prompt has been released to a page (REQ-SESSION-192) — planted as rows, as a reopened session is read.
   */
  function plantReleased(raw: string, status: string, prompt = 'the prompt that failed'): SessionId {
    const sid = asSessionId(raw);
    dal.upsertSession({ session_id: raw, execution_status: status, workspace_root: WS, created_at: '2026-10-02T10:00:00.000Z', updated_at: '2026-10-02T10:05:00.000Z', worktree: null });
    const saved = persistAttachments(filesOf(raw), [SHOT]);
    if (!saved.ok) throw new Error(saved.reason);
    dal.transaction(() => {
      dal.appendRow(sid, 0, 'user', true, prompt, '2026-10-02T10:00:00.000Z', { attachments: JSON.stringify(saved.attachments) });
      for (let i = 1; i <= RESIDENT_ROW_CAP + 10; i++) dal.appendRow(sid, i, i % 2 === 0 ? 'agent' : 'tool', true, `row ${i}`, '2026-10-02T10:01:00.000Z');
      while (dal.residentCount(sid) > RESIDENT_ROW_CAP) dal.releaseOldestPage(sid, dal.nextPageNumber(sid));
    });
    expect(dal.residentRows(sid).some((r) => r.kind === 'user')).toBe(false);
    return sid;
  }

  it('reads the newest user row over released pages too, with its stored images; a session with none has none', () => {
    const sid = plantReleased('R1', 'failed');
    const last = lastSubmittedPrompt(dal, sid);
    expect(last).toMatchObject({ index: 0, text: 'the prompt that failed', attachments: [{ name: 'shot.png', mediaType: 'image/png', size: PNG.length }] });
    expect(last!.attachments[0]!.digest).toMatch(/^[0-9a-f]{64}$/);
    // A blank row with no image is no prompt; one carrying images alone is.
    dal.appendRow(sid, dal.nextRowIndex(sid), 'user', true, '  \n', '2026-10-02T10:06:00.000Z');
    expect(lastSubmittedPrompt(dal, sid)?.text).toBe('the prompt that failed');
    const imageOnly = persistAttachments(filesOf('R1'), [SHOT]);
    if (!imageOnly.ok) throw new Error(imageOnly.reason);
    dal.appendRow(sid, dal.nextRowIndex(sid), 'user', true, '', '2026-10-02T10:07:00.000Z', { attachments: JSON.stringify(imageOnly.attachments) });
    expect(lastSubmittedPrompt(dal, sid)).toMatchObject({ text: '', attachments: [{ name: 'shot.png' }] });
    dal.upsertSession({ session_id: 'R0', execution_status: 'idle', workspace_root: WS, created_at: '2026-10-02T10:00:00.000Z', updated_at: '2026-10-02T10:00:00.000Z', worktree: null });
    dal.appendRow(asSessionId('R0'), 0, 'system', true, 'nothing yet');
    expect(lastSubmittedPrompt(dal, asSessionId('R0'))).toBeNull();
  });

  it('REQ-NOTIFY-045: the retry resubmits a released prompt — a second user row with the same text, and a run on it', async () => {
    const sid = plantReleased('R2', 'failed');
    const { sessions, client } = sessionsWith(() => answer('done'));
    expect(sessions.resume(dal, WS, sid).ok).toBe(true);
    const retried = sessions.retry(sid);
    if (!retried.ok) throw new Error(retried.error.reason);
    expect(retried.value.body).toBe('the prompt that failed');
    expect((await sessions.running(sid)!).status).toBe('completed');
    expect(userRows(sid).map((r) => r.body)).toEqual(['the prompt that failed', 'the prompt that failed']);
    expect(text(client.requests[0]!)).toContain('the prompt that failed');
  });

  it('nothing submitted is the only "no prompt" refusal; a live run is refused as a prompt is', async () => {
    dal.upsertSession({ session_id: 'R6', execution_status: 'idle', workspace_root: WS, created_at: '2026-10-02T10:00:00.000Z', updated_at: '2026-10-02T10:00:00.000Z', worktree: null });
    dal.appendRow(asSessionId('R6'), 0, 'system', true, 'nothing yet');
    const { sessions } = sessionsWith(() => answer('never'));
    expect(sessions.resume(dal, WS, asSessionId('R6')).ok).toBe(true);
    expect(sessions.retry(asSessionId('R6'))).toEqual({ ok: false, error: { code: 'no-prompt', reason: 'No prompt has been submitted in this session, so there is nothing to retry.' } });
    expect(sessions.retry(asSessionId('R-unknown'))).toMatchObject({ ok: false, error: { code: 'not-live' } });
  });

  it('REQ-ORCH-004: the continue reads a released prompt as the latest request, never the session id', async () => {
    const sid = plantReleased('R7', 'paused', 'carry on with the refactor');
    const { sessions, client } = sessionsWith(() => answer('continued'));
    expect(sessions.resume(dal, WS, sid).ok).toBe(true);
    const continued = sessions.continueSession(sid, 'continue');
    if (!continued.ok) throw new Error(continued.error.reason);
    await sessions.running(sid)!;
    const sent = text(client.requests[0]!);
    expect(sent).toContain('Latest user request:\ncarry on with the refactor');
    expect(sent).not.toContain('Latest user request:\nR7');
  });
});
