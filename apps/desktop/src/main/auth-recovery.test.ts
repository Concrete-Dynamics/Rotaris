import { describe, expect, it } from 'vitest';
import type { AuthRecoveryPayload, ProcessReply } from '@rotaris/contracts';
import { AuthRecovery, type AuthRecoveryDeps } from './auth-recovery.js';

const facts = (over: Partial<Extract<ProcessReply, { kind: 'session.authRecovery' }>> = {}): ProcessReply => ({
  kind: 'session.authRecovery', sessionId: 'S1',
  failed: { key: 'alpha', provider: 'scripted', model: 'alpha' },
  active: { key: 'alpha', provider: 'scripted', model: 'alpha' },
  models: [{ key: 'alpha', provider: 'scripted', model: 'alpha' }, { key: 'beta', provider: 'scripted-b', model: 'beta' }],
  lastPrompt: true, ...over,
});

function harness(answers: (req: Parameters<AuthRecoveryDeps['request']>[0]) => ProcessReply | Promise<ProcessReply>) {
  const presented: AuthRecoveryPayload[] = [];
  const closed: string[] = [];
  const requests: Parameters<AuthRecoveryDeps['request']>[0][] = [];
  const recovery = new AuthRecovery({
    request: async (req) => { requests.push(req); return await answers(req); },
    providerName: (id) => (id === 'scripted-b' ? 'Scripted B' : id),
    present: (p) => presented.push(p),
    close: (sid) => closed.push(sid),
    log: () => undefined,
  });
  return { recovery, presented, closed, requests };
}

describe('main/auth-recovery — the recovery dialog\'s coordinator (REQ-NOTIFY-069/072/074/080)', () => {
  it('opens the dialog over the run host\'s facts, every model named with its provider', async () => {
    const h = harness(() => facts());
    expect(await h.recovery.onAuthenticationFailure('S1', 'HTTP 401 — Incorrect API key provided')).toEqual({ opened: true });
    expect(h.presented).toHaveLength(1);
    expect(h.presented[0]).toMatchObject({ sessionId: 'S1', error: 'HTTP 401 — Incorrect API key provided', failed: { model: 'alpha', providerName: 'scripted' } });
    expect(h.presented[0]!.models.map((m) => [m.key, m.providerName])).toEqual([['alpha', 'scripted'], ['beta', 'Scripted B']]);
  });

  it('REQ-NOTIFY-069: no recorded prompt, a refusal or no answer opens nothing, and says why', async () => {
    const noPrompt = harness(() => facts({ lastPrompt: false }));
    expect(await noPrompt.recovery.onAuthenticationFailure('S1', 'x')).toMatchObject({ opened: false, reason: expect.stringMatching(/no prompt/) });
    const refused = harness(() => ({ kind: 'refused', code: 'session.configuration', headline: 'The session cannot be recovered here', detail: 'the configuration no longer loads' }));
    expect(await refused.recovery.onAuthenticationFailure('S1', 'x')).toMatchObject({ opened: false, reason: expect.stringMatching(/configuration no longer loads/) });
    const silent = harness(() => { throw new Error('timed out'); });
    expect(await silent.recovery.onAuthenticationFailure('S1', 'x')).toMatchObject({ opened: false, reason: expect.stringMatching(/timed out/) });
    expect([...noPrompt.presented, ...refused.presented, ...silent.presented]).toEqual([]);
  });

  it('REQ-NOTIFY-074: a retry restarts on the chosen key and closes the dialog; a refusal is the dialog\'s sentence and it stays', async () => {
    let refuse = true;
    const h = harness((req) => req.kind === 'session.authRecovery' ? facts()
      : refuse ? { kind: 'refused', code: 'session.run-active', headline: 'The run could not be restarted', detail: 'A run is already active.' }
        : { kind: 'session.authRestarted', sessionId: 'S1', pinned: { from: { provider: 'scripted', model: 'alpha' }, to: { key: 'beta', provider: 'scripted-b', model: 'beta' } } });
    await h.recovery.onAuthenticationFailure('S1', 'HTTP 401');
    const payload = h.presented[0]!;
    expect(await h.recovery.retry(payload, 'beta')).toEqual({ ok: false, message: 'The run could not be restarted: A run is already active.' });
    expect(h.closed).toEqual([]);
    refuse = false;
    expect(await h.recovery.retry(payload, 'beta')).toEqual({ ok: true });
    expect(h.closed).toEqual(['S1']);
    expect(h.requests.filter((r) => r.kind === 'session.authRestart')).toEqual([{ kind: 'session.authRestart', sessionId: 'S1', modelKey: 'beta' }, { kind: 'session.authRestart', sessionId: 'S1', modelKey: 'beta' }]);
  });

  it('REQ-NOTIFY-080: cancel closes the dialog and asks the run host nothing', async () => {
    const h = harness(() => facts());
    await h.recovery.onAuthenticationFailure('S1', 'HTTP 401');
    const before = h.requests.length;
    h.recovery.cancel(h.presented[0]!);
    expect(h.closed).toEqual(['S1']);
    expect(h.requests.length).toBe(before);
  });
});
