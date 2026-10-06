import { describe, expect, it } from 'vitest';
import type { AuthRecoveryPayload, ProcessReply } from '@rotaris/contracts';
import { AuthRecovery, KEY_NOT_STORED, RESTART_AFTER_REAUTH_FAILED, type AuthRecoveryDeps } from './auth-recovery.js';

const facts = (over: Partial<Extract<ProcessReply, { kind: 'session.authRecovery' }>> = {}): ProcessReply => ({
  kind: 'session.authRecovery', sessionId: 'S1',
  failed: { key: 'alpha', provider: 'scripted', model: 'alpha' },
  active: { key: 'alpha', provider: 'scripted', model: 'alpha' },
  models: [{ key: 'alpha', provider: 'scripted', model: 'alpha' }, { key: 'beta', provider: 'scripted-b', model: 'beta' }],
  lastPrompt: true, ...over,
});

type Stored = Awaited<ReturnType<AuthRecoveryDeps['reauthenticate']>>;
function harness(answers: (req: Parameters<AuthRecoveryDeps['request']>[0]) => ProcessReply | Promise<ProcessReply>, store: (id: string, key: string) => Stored = () => ({ ok: true, message: 'Validated scripted.' })) {
  const presented: AuthRecoveryPayload[] = [];
  const closed: string[] = [];
  const requests: Parameters<AuthRecoveryDeps['request']>[0][] = [];
  const acknowledged: { kind: string; title: string; body?: string }[] = [];
  const stored: { id: string; key: string }[] = [];
  const logged: string[] = [];
  const cleared: string[] = [];
  const recovery = new AuthRecovery({
    request: async (req) => { requests.push(req); return await answers(req); },
    providerName: (id) => (id === 'scripted-b' ? 'Scripted B' : id),
    present: (p) => presented.push(p),
    close: (sid) => closed.push(sid),
    log: (m) => logged.push(m),
    reauthentication: (id) => (id === 'copilot' ? { method: 'unavailable', message: 'GitHub Copilot signs in with a code, which this build does not provide yet.' } : { method: 'api-key', message: `Enter a new API key for ${id}.` }),
    reauthenticate: async (id, key) => { stored.push({ id, key }); return store(id, key); },
    acknowledge: (kind, title, body) => acknowledged.push({ kind, title, ...(body === undefined ? {} : { body }) }),
    clearForRunStart: (sid) => cleared.push(sid),
  });
  return { recovery, presented, closed, requests, acknowledged, stored, logged, cleared };
}

describe('main/auth-recovery — the recovery dialog\'s coordinator (REQ-NOTIFY-069/072/074/080)', () => {
  it('REQ-NOTIFY-058: a restart the dialog asks for clears the session\'s notice once the run host restarted it, and only then', async () => {
    // docs/defects/fixed/a-prompt-or-retry-that-starts-a-run-does-not-clear-the-sessions-notice.md
    let restart: ProcessReply = { kind: 'session.authRestarted', sessionId: 'S1', pinned: null };
    const h = harness((req) => req.kind === 'session.authRecovery' ? facts() : restart);
    await h.recovery.onAuthenticationFailure('S1', 'HTTP 401');
    expect(await h.recovery.retry(h.presented[0]!, 'beta')).toEqual({ ok: true });
    expect(h.cleared).toEqual(['S1']);
    expect(await h.recovery.reauthenticate(h.presented[0]!, 'sk-new')).toEqual({ ok: true });
    expect(h.cleared).toEqual(['S1', 'S1']);
    restart = { kind: 'refused', code: 'session.run-active', headline: 'A run is already active.' };
    expect(await h.recovery.retry(h.presented[0]!, 'beta')).toMatchObject({ ok: false });
    expect(await h.recovery.reauthenticate(h.presented[0]!, 'sk-new')).toMatchObject({ ok: false });
    h.recovery.cancel(h.presented[0]!);
    expect(h.cleared).toEqual(['S1', 'S1']);
  });

  it('opens the dialog over the run host\'s facts, every model named with its provider', async () => {
    const h = harness(() => facts());
    expect(await h.recovery.onAuthenticationFailure('S1', 'HTTP 401 — Incorrect API key provided')).toEqual({ opened: true });
    expect(h.presented).toHaveLength(1);
    expect(h.presented[0]).toMatchObject({ sessionId: 'S1', error: 'HTTP 401 — Incorrect API key provided', failed: { model: 'alpha', providerName: 'scripted' } });
    // REQ-NOTIFY-068: the pair that failed is not offered at all.
    expect(h.presented[0]!.models.map((m) => [m.key, m.providerName])).toEqual([['beta', 'Scripted B']]);
  });

  it('REQ-NOTIFY-068 with REQ-NOTIFY-075: a pair that failed authentication earlier in the session is neither offered nor retried until its provider\'s credentials change', async () => {
    const gamma = { key: 'gamma', provider: 'openai', model: 'gpt-4o' };
    const all = [{ key: 'alpha', provider: 'scripted', model: 'alpha' }, { key: 'beta', provider: 'scripted-b', model: 'beta' }, gamma];
    let failedNow = { key: 'alpha', provider: 'scripted', model: 'alpha' };
    const h = harness((req) => req.kind === 'session.authRecovery' ? facts({ failed: failedNow, active: failedNow, models: all })
      : { kind: 'session.authRestarted', sessionId: 'S1', pinned: null });
    await h.recovery.onAuthenticationFailure('S1', 'HTTP 401');
    expect(h.presented[0]!.models.map((m) => m.key)).toEqual(['beta', 'gamma']);
    // beta, chosen by hand, fails too: the reopened dialog offers neither beta nor alpha — alpha's credentials did not change.
    failedNow = { key: 'beta', provider: 'scripted-b', model: 'beta' };
    await h.recovery.onAuthenticationFailure('S1', 'HTTP 401');
    expect(h.presented[1]!.models.map((m) => m.key)).toEqual(['gamma']);
    // A payload older than a failure cannot bring the pair back: the retry refuses it, and nothing is restarted.
    const restarts = () => h.requests.filter((r) => r.kind === 'session.authRestart').length;
    const r = await h.recovery.retry(h.presented[0]!, 'beta');
    expect(r).toMatchObject({ ok: false, message: expect.stringMatching(/beta \(Scripted B\) already failed authentication/) });
    expect(await h.recovery.retry(h.presented[1]!, 'alpha')).toEqual({ ok: false, message: 'alpha is not among the models this dialog offers.' });
    expect(restarts()).toBe(0);
    // Another session's refusals are its own.
    await h.recovery.onAuthenticationFailure('S2', 'HTTP 401');
    expect(h.recovery.refusedPair('S2', { provider: 'scripted', model: 'alpha' })).toBe(false);
    // alpha's provider is signed in again under Settings: alpha may be offered again; beta stays refused.
    h.recovery.credentialsChanged('scripted');
    expect(h.recovery.refusedPair('S1', { provider: 'scripted', model: 'alpha' })).toBe(false);
    expect(h.recovery.refusedPair('S1', { provider: 'scripted-b', model: 'beta' })).toBe(true);
    failedNow = { key: 'gamma', provider: 'openai', model: 'gpt-4o' };
    await h.recovery.onAuthenticationFailure('S1', 'HTTP 401');
    expect(h.presented.at(-1)!.models.map((m) => m.key)).toEqual(['alpha']);
  });

  it('REQ-NOTIFY-068: re-authenticating the failed provider in the dialog lets its pairs be offered again', async () => {
    const h = harness((req) => req.kind === 'session.authRecovery' ? facts() : { kind: 'session.authRestarted', sessionId: 'S1', pinned: null });
    await h.recovery.onAuthenticationFailure('S1', 'HTTP 401');
    expect(h.recovery.refusedPair('S1', { provider: 'scripted', model: 'alpha' })).toBe(true);
    expect(await h.recovery.reauthenticate(h.presented[0]!, 'k')).toEqual({ ok: true });
    expect(h.recovery.refusedPair('S1', { provider: 'scripted', model: 'alpha' })).toBe(false);
  });

  it('a refusal because a run of the session is active again marks the failure superseded', async () => {
    const h = harness(() => ({ kind: 'refused', code: 'session.run-active', headline: 'The session cannot be recovered here', detail: 'A run is already active.' }));
    expect(await h.recovery.onAuthenticationFailure('S1', 'x')).toMatchObject({ opened: false, stale: true });
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

  it('REQ-NOTIFY-076: the payload names the failed provider and how it is re-authenticated here', async () => {
    const h = harness(() => facts());
    await h.recovery.onAuthenticationFailure('S1', 'HTTP 401');
    expect(h.presented[0]!.reauth).toEqual({ provider: 'scripted', providerName: 'scripted', method: 'api-key', message: 'Enter a new API key for scripted.' });
    const unknown = harness(() => facts({ failed: null, active: { key: 'c', provider: 'copilot', model: 'c' } }));
    await unknown.recovery.onAuthenticationFailure('S1', 'HTTP 401');
    expect(unknown.presented[0]!.reauth).toMatchObject({ provider: 'copilot', method: 'unavailable' });
  });

  it('REQ-NOTIFY-076: a stored key restarts the run on the same model and closes the dialog; the key is never logged', async () => {
    const h = harness((req) => req.kind === 'session.authRecovery' ? facts() : { kind: 'session.authRestarted', sessionId: 'S1', pinned: null });
    await h.recovery.onAuthenticationFailure('S1', 'HTTP 401');
    expect(await h.recovery.reauthenticate(h.presented[0]!, 'sk-fresh-secret')).toEqual({ ok: true });
    expect(h.stored).toEqual([{ id: 'scripted', key: 'sk-fresh-secret' }]);
    expect(h.requests.at(-1)).toEqual({ kind: 'session.authRestart', sessionId: 'S1', modelKey: null });
    expect(h.closed).toEqual(['S1']);
    expect(h.acknowledged).toEqual([]);
    expect(JSON.stringify(h.logged)).not.toContain('sk-fresh-secret');
  });

  it('REQ-NOTIFY-076: a blank key, an unavailable method or a key the provider refused is the dialog\'s sentence, nothing restarted', async () => {
    const h = harness(() => facts(), () => ({ ok: false, stage: 'validation', message: 'Validation failed for scripted: 401' }));
    await h.recovery.onAuthenticationFailure('S1', 'HTTP 401');
    const payload = h.presented[0]!;
    expect(await h.recovery.reauthenticate(payload, '  ')).toEqual({ ok: false, message: 'Enter the new API key for scripted.' });
    expect(await h.recovery.reauthenticate({ ...payload, reauth: { ...payload.reauth, method: 'unavailable', message: 'not here' } }, 'k')).toEqual({ ok: false, message: 'not here' });
    expect(await h.recovery.reauthenticate(payload, 'bad')).toEqual({ ok: false, message: 'Validation failed for scripted: 401' });
    expect(h.requests.filter((r) => r.kind === 'session.authRestart')).toEqual([]);
    expect(h.acknowledged).toEqual([]);
    expect(h.closed).toEqual([]);
  });

  it('a key stored whose discovered models could not be recorded still restarts, and is never told as a key that could not be stored', async () => {
    const h = harness((req) => req.kind === 'session.authRecovery' ? facts() : { kind: 'session.authRestarted', sessionId: 'S1', pinned: null }, () => ({ ok: false, stage: 'catalog', message: 'The key for scripted was saved, but its discovered models could not be recorded: disk full' }));
    await h.recovery.onAuthenticationFailure('S1', 'HTTP 401');
    expect(await h.recovery.reauthenticate(h.presented[0]!, 'k')).toEqual({ ok: true });
    expect(h.acknowledged).toEqual([]);
    expect(h.requests.at(-1)).toEqual({ kind: 'session.authRestart', sessionId: 'S1', modelKey: null });
    expect(h.recovery.refusedPair('S1', { provider: 'scripted', model: 'alpha' })).toBe(false);
  });

  it('REQ-NOTIFY-077: a key that cannot be stored, and a restart refused after a stored key, each raise their own error acknowledgement', async () => {
    const storage = harness(() => facts(), () => ({ ok: false, stage: 'storage', message: 'No credential was stored: the credential store could not be protected' }));
    await storage.recovery.onAuthenticationFailure('S1', 'HTTP 401');
    expect(await storage.recovery.reauthenticate(storage.presented[0]!, 'k')).toEqual({ ok: false, message: `${KEY_NOT_STORED}: No credential was stored: the credential store could not be protected` });
    expect(storage.acknowledged).toEqual([{ kind: 'fail', title: KEY_NOT_STORED, body: 'scripted: No credential was stored: the credential store could not be protected' }]);
    expect(storage.requests.filter((r) => r.kind === 'session.authRestart')).toEqual([]);

    const restart = harness((req) => req.kind === 'session.authRecovery' ? facts() : { kind: 'refused', code: 'session.run-active', headline: 'The run could not be restarted', detail: 'A run is already active.' });
    await restart.recovery.onAuthenticationFailure('S1', 'HTTP 401');
    const r = await restart.recovery.reauthenticate(restart.presented[0]!, 'k');
    expect(r.ok).toBe(false);
    expect(restart.acknowledged).toEqual([{ kind: 'fail', title: RESTART_AFTER_REAUTH_FAILED, body: 'scripted was re-authenticated and its key is saved; The run could not be restarted: A run is already active.' }]);
    expect(restart.closed).toEqual([]);
  });
});
