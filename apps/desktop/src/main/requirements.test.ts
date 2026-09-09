import { describe, expect, it } from 'vitest';
import type { ProcessReply, WorkspaceServiceRequest } from '@rotaris/contracts';
import { millis } from '@rotaris/kernel';
import { actorFor, createRequirementsRelay } from './requirements.js';

/**
 * Main's requirements relay (Part AK): the actor is stamped from where the command arrived (REQ-CONFIG-198), the
 * workspace is replaced with the open one, and channel 10 is broadcast only from a reply that carries `changed`.
 */
function harness(reply: ProcessReply | Error, workspace: string | null = 'C:\\ws') {
  const sent: WorkspaceServiceRequest[] = [];
  const broadcasts: unknown[] = [];
  const relay = createRequirementsRelay({
    currentWorkspace: () => workspace ?? undefined,
    awaitWorkspace: () => Promise.resolve(),
    request: (root, req) => { sent.push(req); expect(root).toBe(workspace); return reply instanceof Error ? Promise.reject(reply) : Promise.resolve(reply); },
    person: () => 'gang',
    broadcast: (p) => { broadcasts.push(p); },
    log: () => undefined,
  });
  return { relay, sent, broadcasts };
}

describe('createRequirementsRelay', () => {
  it('REQ-CONFIG-198: a command from a window is a person named by the OS account; anything else is the system', () => {
    expect(actorFor({ kind: 'window', webContentsId: 3 }, () => 'gang')).toEqual({ kind: 'user', person: 'gang' });
    expect(actorFor({ kind: 'other', what: 'scheduler' }, () => 'gang')).toEqual({ kind: 'system' });
  });
  it('replaces the named workspace with the open one and relays with the actor stamped', async () => {
    const h = harness({ kind: 'requirements.result', value: { cards: [] } });
    const out = await h.relay.handle({ name: 'requirements.board', workspace: 'D:\\somewhere-else' }, { kind: 'window', webContentsId: 1 });
    expect(out).toEqual({ ok: true, value: { cards: [] } });
    expect(h.sent).toEqual([{ kind: 'requirements.command', workspaceRoot: 'C:\\ws', command: { name: 'requirements.board', workspace: 'C:\\ws' }, actor: { kind: 'user', person: 'gang' } }]);
    expect(h.broadcasts).toEqual([]);
  });
  it('broadcasts channel 10 exactly when the reply carries `changed` (persist before publish)', async () => {
    const h = harness({ kind: 'requirements.result', value: { ok: true }, changed: { generation: 4, affected: ['REQ-101'] } });
    await h.relay.handle({ name: 'requirements.act', workspace: 'C:\\ws', id: 'REQ-101', action: 'release' }, { kind: 'window', webContentsId: 1 });
    expect(h.broadcasts).toEqual([{ v: 1, workspace: 'C:\\ws', generation: 4, affected: ['REQ-101'] }]);
  });
  it('a refusal, an unexpected reply and a failed ask are outcomes, never throws; no workspace is stated', async () => {
    expect(await harness({ kind: 'refused', code: 'workspace.none', headline: 'no' }).relay.handle({ name: 'requirements.board', workspace: 'x' }, { kind: 'window', webContentsId: 1 })).toMatchObject({ ok: false, code: 'workspace.none' });
    expect(await harness({ kind: 'pong' }).relay.handle({ name: 'requirements.board', workspace: 'x' }, { kind: 'window', webContentsId: 1 })).toMatchObject({ ok: false, code: 'reply.unexpected' });
    expect(await harness(new Error('the service did not answer within 120000 ms')).relay.handle({ name: 'requirements.board', workspace: 'x' }, { kind: 'window', webContentsId: 1 })).toMatchObject({ ok: false, code: 'requirements.ask', detail: 'the service did not answer within 120000 ms' });
    expect(await harness({ kind: 'pong' }, null).relay.handle({ name: 'requirements.board', workspace: 'x' }, { kind: 'window', webContentsId: 1 })).toMatchObject({ ok: false, code: 'workspace.none' });
    void millis;
  });
});
