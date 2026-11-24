import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeClock, mintMachineId, type SessionId } from '@rotaris/kernel';
import { migrateStore, openStore, StoreDal, forgetSpelling } from '@rotaris/store';
import { answer, DefaultAgentBackend, ScriptedModelClient, toolCalls, type ChatMessage, type ModelRef, type ModelRequest, type ScriptedCall } from '@rotaris/model';
import { RUN_CONFIG_DEFAULTS, Sessions, type AdvisorOps, type PortToolCall, type Publisher, type ToolPort, type ToolPortContext } from '../index.js';
import { ADVISOR_SYSTEM_PROMPT } from './advisor.js';
import { SUPERVISOR_DEFAULTS, type LoopClassifier } from './supervisor.js';
import { ADVISOR_NUDGE_SENTENCE } from './turn.js';

const HOST = mintMachineId('0000000000000000000000000000000e');
const MODEL: ModelRef = { providerId: 'p', modelId: 'm', dialect: 'chat' };
const STRONG: ModelRef = { providerId: 'p', modelId: 'strong', dialect: 'chat' };
const NONE: Publisher = { increment: () => undefined, snapshot: () => undefined };
const read = (id: string): ScriptedCall => toolCalls([{ callId: id, name: 'read_file', args: { path: 'README.md' } }]);
const userTexts = (req: ModelRequest): string[] => req.messages.filter((m) => m.role === 'user').map((m) => m.content.map((p) => (p.kind === 'text' ? p.text : '')).join(''));

/**
 * PD-TOOLS-022 inside a run: the session hands every port the run's advisor (clause 4), a dispatched call carries the
 * calling turn's conversation (clause 2), a consult is one request on the advisor's model counted on the run (clause 3),
 * and a corrective message names the advisor while the agent can still consult it (clause 10).
 */
describe('PD-TOOLS-022: the advisor inside a run', () => {
  let dir: string;
  let dal: StoreDal;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rotaris-advisor-turn-'));
    const db = openStore(join(dir, 'workspace.db'));
    migrateStore(db);
    dal = new StoreDal(db);
  });
  afterEach(() => { dal.db.close(); forgetSpelling(dir); rmSync(dir, { recursive: true, force: true }); });

  function sessionsWith(calls: ScriptedCall[], opts: { usesLeft?: number; classifier?: LoopClassifier; onDispatch?: (c: PortToolCall, advisor: AdvisorOps | undefined) => Promise<string> } = {}) {
    const client = new ScriptedModelClient(calls);
    const seen: { calls: PortToolCall[]; contexts: ToolPortContext[] } = { calls: [], contexts: [] };
    let n = 0;
    const sessions = new Sessions({
      clocks: new FakeClock(), publisher: NONE, pid: 79, host: HOST, retentionCap: 20_000, warn: () => undefined, mintSessionId: () => `V${++n}`,
      model: {
        backend: new DefaultAgentBackend(client), config: { ...RUN_CONFIG_DEFAULTS, model: MODEL, credentialFor: () => async () => 'k' },
        advisor: { model: STRONG, thinking: 'high', label: 'strong', maxUses: 3, timeoutMs: 60_000 },
      },
      sessionFilesDir: (_d, sid) => join(dir, 'sessions', sid),
      tools: (ctx) => {
        seen.contexts.push(ctx);
        const port: ToolPort = {
          specs: () => [{ name: 'read_file', description: 'read', parameters: { type: 'object' } }],
          dispatch: async (c) => { seen.calls.push(c); const text = await (opts.onDispatch?.(c, ctx.advisor) ?? Promise.resolve('# Rotaris')); return { text, isError: false, status: 'ok', durationMs: 0, label: c.name, args: {} }; },
          cancelPending: () => 0, setMode: () => ({ requested: 'ask', effective: 'ask', downgraded: false, reason: '', previous: 'ask' }), currentMode: () => 'ask', answerApproval: () => false,
          ...(opts.usesLeft === undefined ? {} : { advisorUsesLeft: () => opts.usesLeft! }),
        };
        return port;
      },
      attended: () => true,
      runtime: { permissionMode: 'ask', allowUnsandboxedAutonomous: false, sandbox: { requested: false, available: false, backend: '' }, sessionLogLevel: 'WARNING' },
      ...(opts.classifier ? { supervisor: () => ({ config: SUPERVISOR_DEFAULTS, classifier: opts.classifier! }) } : {}),
    });
    return { sessions, client, seen };
  }

  it('every port is handed the run\'s advisor, and a call carries the calling turn\'s conversation', async () => {
    const { sessions, seen } = sessionsWith([read('r1'), answer('Done.')]);
    const sid = (sessions.start(dal, 'C:/ws', 'Read the README.') as { value: SessionId }).value;
    expect((await sessions.running(sid)!).status).toBe('completed');
    expect(seen.contexts.length).toBeGreaterThan(0);
    for (const ctx of seen.contexts) expect(ctx.advisor).toMatchObject({ model: STRONG, entryModel: MODEL, maxUses: 3 });
    const conversation: readonly ChatMessage[] = seen.calls[0]!.conversation!();
    expect(conversation.some((m) => m.role === 'user' && m.content.some((p) => p.kind === 'text' && p.text.includes('Read the README.')))).toBe(true);
  });

  it('a consult is one request with no tools on the advisor\'s model, over the conversation, counted on the run', async () => {
    // The scripted client answers in order: the agent's tool call, the advisor's answer, the agent's last message.
    const { sessions, client, seen } = sessionsWith([read('r1'), answer('Check the heading level.'), answer('Done.')], {
      onDispatch: async (c, advisor) => {
        const out = await advisor!.consult({ messages: c.conversation!(), question: 'What should I check?', agent: c.agentName, persona: c.persona }, new AbortController().signal);
        return out.ok ? out.advice : out.reason;
      },
    });
    const sid = (sessions.start(dal, 'C:/ws', 'Read the README.') as { value: SessionId }).value;
    expect((await sessions.running(sid)!).status).toBe('completed');
    expect(client.requests).toHaveLength(3);
    const consult = client.requests[1]!;
    expect(consult.model).toEqual(STRONG);
    expect(consult.tools ?? []).toEqual([]);
    expect(JSON.stringify(consult)).toContain(ADVISOR_SYSTEM_PROMPT.slice(0, 60));
    expect(userTexts(consult)[0]).toContain('Read the README.');
    expect(userTexts(consult)[0]).toContain('<question>\nWhat should I check?\n</question>');
    expect(seen.calls).toHaveLength(1);
    // The agent read the advice as the call's result.
    expect(JSON.stringify(client.requests[2]!.messages)).toContain('Check the heading level.');
    // Three requests' usage on the session: the two of the agent's turn and the advisor's (REQ-EVENTS-053).
    const session = dal.getSession(sid)!;
    expect(session.tokens_input).toBe(client.requests.length * 10);
  });

  describe('clause 10: the corrective message names the advisor while the agent can still consult it', () => {
    const classifier: LoopClassifier = { classify: async () => ({ loop_detected: true, reason: 'stuck', corrective_message: 'Stop re-reading the same file and try another approach.' }) };
    const script = (): ScriptedCall[] => [read('r1'), read('r2'), read('r3'), read('r4'), answer('Done.')];
    const corrective = (requests: readonly ModelRequest[]): string[] => requests.flatMap(userTexts).filter((t) => t.startsWith('Stop re-reading'));

    it('with consults left, the sentence follows the message', async () => {
      const { sessions, client } = sessionsWith(script(), { classifier, usesLeft: 2 });
      const sid = (sessions.start(dal, 'C:/ws', 'Read the README.') as { value: SessionId }).value;
      await sessions.running(sid)!;
      const found = corrective(client.requests);
      expect(found.length).toBeGreaterThan(0);
      for (const text of found) expect(text).toBe(`Stop re-reading the same file and try another approach. ${ADVISOR_NUDGE_SENTENCE}`);
    });

    it('with none left, or no advisor tool, the message stands alone', async () => {
      for (const usesLeft of [0, undefined]) {
        const { sessions, client } = sessionsWith(script(), { classifier, ...(usesLeft === undefined ? {} : { usesLeft }) });
        const sid = (sessions.start(dal, 'C:/ws', 'Read the README.') as { value: SessionId }).value;
        await sessions.running(sid)!;
        const found = corrective(client.requests);
        expect(found.length).toBeGreaterThan(0);
        for (const text of found) expect(text).toBe('Stop re-reading the same file and try another approach.');
      }
    });
  });
});
