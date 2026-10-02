import { describe, expect, it } from 'vitest';
import type { ReauthPrompt } from '@rotaris/contracts';
import { createAuthFallback, NO_USABLE_FALLBACK, type AuthFallbackDeps, type KeySaved, type ProviderDescription, type RestartAnswer } from './auth-fallback.js';
import { KEY_NOT_STORED } from './auth-recovery.js';

const RESTARTED: RestartAnswer = { ok: true, value: { failed: { provider: 'scripted', model: 'alpha', key: 'alpha' }, fallback: { provider: 'scripted-b', model: 'beta', key: 'beta' } } };
const AUTH = 'scripted authentication failure (HTTP 401) — HTTP 401 — Incorrect API key provided';
const refused = (code: string, reason = 'refused'): RestartAnswer => ({ ok: false, code, reason });

interface Extra {
  readonly provider?: ProviderDescription;
  readonly save?: KeySaved;
  readonly applies?: 'next-iteration' | 'next-run' | Error;
}
function harness(answer: RestartAnswer | Error = RESTARTED, configured = true, extra: Extra = {}) {
  const acks: { kind: string; title: string; body?: string }[] = [];
  const restarts: string[] = [];
  const logs: string[] = [];
  const published: { sessionId: string; prompt: ReauthPrompt | null }[] = [];
  const saved: { id: string; key: string }[] = [];
  const repinned: { sessionId: string; provider: string; model: string }[] = [];
  const refusedPairs: string[] = [];
  const changed: string[] = [];
  const deps: AuthFallbackDeps = {
    acknowledge: (kind, title, body) => { acks.push({ kind, title, ...(body === undefined ? {} : { body }) }); },
    publishPrompt: (sessionId, prompt) => published.push({ sessionId, prompt }),
    describeProvider: (id) => extra.provider ?? { provider: { id, name: `Provider ${id}` }, method: 'api-key' },
    saveKey: async (id, key) => { saved.push({ id, key }); return extra.save ?? { ok: true }; },
    repinPrimary: async (sessionId, p) => { repinned.push({ sessionId, provider: p.provider, model: p.model }); if (extra.applies instanceof Error) throw extra.applies; return { ok: true, applies: extra.applies ?? 'next-iteration' }; },
    restartOnFallback: async (sid) => { restarts.push(sid); if (answer instanceof Error) throw answer; return answer; },
    configurationService: () => configured,
    refusePair: (sid, p) => refusedPairs.push(`${sid}:${p.provider}/${p.model}`),
    credentialsChanged: (id) => changed.push(id),
    log: (m) => logs.push(m),
  };
  return { fallback: createAuthFallback(deps), acks, restarts, logs, published, saved, repinned, refusedPairs, changed };
}

describe('main/auth-fallback — the first authentication failure\'s automatic fallback (REQ-NOTIFY-069/070/072/075)', () => {
  it('REQ-NOTIFY-070: a first authentication failure restarts on the fallback and acknowledges both models — nothing more to publish', async () => {
    const h = harness();
    expect(await h.fallback.onAuthenticationFailure('S1', AUTH)).toEqual({ kind: 'restarted', restart: RESTARTED.ok ? RESTARTED.value : null });
    expect(h.restarts).toEqual(['S1']);
    expect(h.acks).toEqual([{ kind: 'fail', title: 'Authentication failed on scripted/alpha', body: 'The run restarted on the fallback model scripted-b/beta, which stays in use for this session.' }]);
    expect(h.fallback.fallbackOf('S1')).toEqual(RESTARTED.ok ? RESTARTED.value : undefined);
    // REQ-NOTIFY-068: the primary failed with the credentials it still has, so a later dialog will not offer it back.
    expect(h.refusedPairs).toEqual(['S1:scripted/alpha']);
  });

  it('REQ-NOTIFY-072/075: a second authentication failure of the session is the dialog\'s — the automatic fallback is not tried again', async () => {
    const h = harness();
    await h.fallback.onAuthenticationFailure('S1', AUTH);
    expect(await h.fallback.onAuthenticationFailure('S1', AUTH)).toMatchObject({ kind: 'dialog', reason: expect.stringContaining('scripted-b/beta was tried') });
    expect(h.restarts).toEqual(['S1']);
    // REQ-NOTIFY-030: another session still has its own first fallback.
    expect(await h.fallback.onAuthenticationFailure('S2', AUTH)).toMatchObject({ kind: 'restarted' });
    // REQ-NOTIFY-078: clearing the bookkeeping makes a further fallback attempt available.
    h.fallback.clearFallback('S1');
    expect(await h.fallback.onAuthenticationFailure('S1', AUTH)).toMatchObject({ kind: 'restarted' });
  });

  it('REQ-NOTIFY-072: no usable fallback — none configured, the fallback is the model that failed, the failed model unknown — is the dialog\'s, and spends the first failure', async () => {
    for (const code of NO_USABLE_FALLBACK) {
      const h = harness(refused(code, `refused ${code}`));
      expect(await h.fallback.onAuthenticationFailure('S1', AUTH)).toEqual({ kind: 'dialog', reason: `refused ${code}` });
      expect(h.acks).toEqual([]);
      expect(h.published).toEqual([]);
      expect(h.fallback.firstFailureSpent('S1')).toBe(true);
      expect(h.fallback.fallbackOf('S1')).toBeUndefined();
      // REQ-NOTIFY-075: the next failure — a model chosen by hand in the dialog — is the dialog's again, never the fallback's.
      expect(await h.fallback.onAuthenticationFailure('S1', AUTH)).toMatchObject({ kind: 'dialog' });
      expect(h.restarts).toEqual(['S1']);
    }
  });

  it('REQ-NOTIFY-069/070: a missing configuration service, a missing run channel or a restart that cannot begin is the generic notice\'s, the bookkeeping cleared', async () => {
    for (const [answer, configured] of [[refused('session.restart-failed', 'the disk is full'), true], [refused('session.configuration', 'the configuration no longer loads'), true], [refused('session.no-prompt'), true], [new Error('the run host is gone'), true], [RESTARTED, false]] as const) {
      const h = harness(answer, configured);
      expect((await h.fallback.onAuthenticationFailure('S1', AUTH)).kind).toBe('generic');
      expect(h.acks).toEqual([]);
      expect(h.published).toEqual([]);
      expect(h.fallback.firstFailureSpent('S1')).toBe(false);
      expect(h.restarts).toHaveLength(configured ? 1 : 0);
    }
  });

  it('a refusal because a run of the session is active again is stale: nothing is raised and nothing spent', async () => {
    const h = harness(refused('session.run-active', 'A run is already active.'));
    expect(await h.fallback.onAuthenticationFailure('S1', AUTH)).toEqual({ kind: 'stale', reason: 'A run is already active.' });
    expect(h.fallback.firstFailureSpent('S1')).toBe(false);
  });
});

describe('main/auth-fallback — the non-modal re-authentication prompt (REQ-NOTIFY-071/078/079, ADR-0048)', () => {
  it('REQ-NOTIFY-071: a successful fallback restart opens the prompt naming the primary, the fallback and the provider\'s error', async () => {
    const h = harness();
    await h.fallback.onAuthenticationFailure('S1', AUTH);
    expect(h.published).toEqual([{ sessionId: 'S1', prompt: { sessionId: 'S1', primary: { provider: 'scripted', model: 'alpha', modelKey: 'alpha' }, fallback: { provider: 'scripted-b', model: 'beta', modelKey: 'beta' }, provider: { id: 'scripted', name: 'Provider scripted' }, method: 'api-key', error: AUTH } }]);
    expect(h.fallback.promptOf('S1')?.error).toBe(AUTH);
  });

  it('REQ-NOTIFY-071: dismissing closes the prompt and keeps the fallback (its bookkeeping stands)', async () => {
    const h = harness();
    await h.fallback.onAuthenticationFailure('S1', AUTH);
    expect(h.fallback.dismissPrompt('S1')).toBe(true);
    expect(h.published.at(-1)).toEqual({ sessionId: 'S1', prompt: null });
    expect(h.repinned).toEqual([]);
    expect(h.fallback.fallbackOf('S1')).toBeDefined();
    expect(h.fallback.dismissPrompt('S1')).toBe(false);
  });

  it('REQ-NOTIFY-078: submitting saves the key, releases the provider\'s refused pairs, clears the bookkeeping, re-pins the primary and says it applies from the next iteration', async () => {
    const h = harness();
    await h.fallback.onAuthenticationFailure('S1', AUTH);
    expect(await h.fallback.submitPrompt('S1', 'sk-new')).toEqual({ ok: true, applies: 'next-iteration' });
    expect(h.saved).toEqual([{ id: 'scripted', key: 'sk-new' }]);
    expect(h.changed).toEqual(['scripted']);
    expect(h.repinned).toEqual([{ sessionId: 'S1', provider: 'scripted', model: 'alpha' }]);
    expect(h.fallback.fallbackOf('S1')).toBeUndefined();
    expect(h.published.at(-1)).toEqual({ sessionId: 'S1', prompt: null });
    expect(h.acks.at(-1)).toEqual({ kind: 'ok', title: 'Re-authenticated Provider scripted', body: 'The run switches back to scripted/alpha from the next iteration.' });
    // A further fallback attempt is available again.
    expect(await h.fallback.onAuthenticationFailure('S1', AUTH)).toMatchObject({ kind: 'restarted' });
  });

  it('REQ-NOTIFY-078: with no key and no live run, nothing is saved and the primary is used for the next run', async () => {
    const h = harness(RESTARTED, true, { applies: 'next-run' });
    await h.fallback.onAuthenticationFailure('S1', AUTH);
    expect(await h.fallback.submitPrompt('S1', '  ')).toEqual({ ok: true, applies: 'next-run' });
    expect(h.saved).toEqual([]);
    expect(h.changed).toEqual([]);
    expect(h.acks.at(-1)).toEqual({ kind: 'ok', title: 'Re-authenticated Provider scripted', body: 'scripted/alpha will be used for the next run.' });
  });

  it('REQ-NOTIFY-077: a key that cannot be STORED raises the error acknowledgement naming the storage failure; the prompt stays with the fallback', async () => {
    const h = harness(RESTARTED, true, { save: { ok: false, stage: 'storage', message: 'the keychain is locked' } });
    await h.fallback.onAuthenticationFailure('S1', AUTH);
    expect(await h.fallback.submitPrompt('S1', 'sk-good')).toEqual({ ok: false, message: `${KEY_NOT_STORED}: the keychain is locked` });
    expect(h.acks.at(-1)).toEqual({ kind: 'fail', title: KEY_NOT_STORED, body: 'Provider scripted: the keychain is locked' });
    expect(h.changed).toEqual([]);
    expect(h.repinned).toEqual([]);
    expect(h.fallback.promptOf('S1')).toBeDefined();
    expect(h.fallback.fallbackOf('S1')).toBeDefined();
  });

  it('REQ-NOTIFY-202: a key the provider refuses is the prompt\'s sentence — not "could not be stored" — and nothing changed', async () => {
    const h = harness(RESTARTED, true, { save: { ok: false, stage: 'validation', message: 'Validation failed for Provider scripted: HTTP 401' } });
    await h.fallback.onAuthenticationFailure('S1', AUTH);
    const acks = h.acks.length;
    expect(await h.fallback.submitPrompt('S1', 'sk-bad')).toEqual({ ok: false, message: 'Validation failed for Provider scripted: HTTP 401' });
    expect(h.acks).toHaveLength(acks);
    expect(h.changed).toEqual([]);
    expect(h.repinned).toEqual([]);
    expect(h.fallback.promptOf('S1')).toBeDefined();
  });

  it('a re-pin that fails leaves the prompt open and the bookkeeping standing: the session is still on the fallback (REQ-NOTIFY-075, REQ-NOTIFY-078)', async () => {
    const h = harness(RESTARTED, true, { applies: new Error('the run host stopped') });
    await h.fallback.onAuthenticationFailure('S1', AUTH);
    expect(await h.fallback.submitPrompt('S1', '')).toEqual({ ok: false, message: 'the run host did not answer (Error: the run host stopped)' });
    expect(h.acks.at(-1)).toMatchObject({ kind: 'fail', title: 'scripted/alpha could not be re-pinned' });
    expect(h.fallback.promptOf('S1')).toBeDefined();
    expect(h.fallback.fallbackOf('S1')).toBeDefined();
    // A further authentication failure is the fallback's own: the dialog's, not restarted automatically again.
    expect(await h.fallback.onAuthenticationFailure('S1', AUTH)).toMatchObject({ kind: 'dialog' });
    expect(h.restarts).toEqual(['S1']);
  });

  it('REQ-NOTIFY-030: every open prompt is readable, by session, for a window that mounts after it opened', async () => {
    const h = harness();
    await h.fallback.onAuthenticationFailure('S1', AUTH);
    await h.fallback.onAuthenticationFailure('S2', AUTH);
    expect(h.fallback.openPrompts().map((p) => p.sessionId)).toEqual(['S1', 'S2']);
    h.fallback.dismissPrompt('S1');
    expect(h.fallback.openPrompts().map((p) => p.sessionId)).toEqual(['S2']);
  });

  it('REQ-NOTIFY-079: the recovery dialog opening closes every open prompt; each session keeps its fallback', async () => {
    const h = harness();
    await h.fallback.onAuthenticationFailure('S1', AUTH);
    await h.fallback.onAuthenticationFailure('S2', AUTH);
    expect(h.fallback.closeAllPrompts('the recovery dialog opened')).toBe(2);
    expect(h.fallback.openPrompts()).toEqual([]);
    expect(h.published.slice(-2)).toEqual([{ sessionId: 'S1', prompt: null }, { sessionId: 'S2', prompt: null }]);
    expect(h.fallback.fallbackOf('S1')).toBeDefined();
    expect(h.fallback.closeAllPrompts('again')).toBe(0);
  });

  it('a device-code or browser provider takes no key: a typed key is refused with the reason the prompt shows', async () => {
    const reason = 'GitHub Copilot signs in with "Code shown here, entered at the provider", which this build does not provide yet.';
    const h = harness(RESTARTED, true, { provider: { provider: { id: 'copilot', name: 'GitHub Copilot' }, method: 'unavailable', unavailableReason: reason } });
    await h.fallback.onAuthenticationFailure('S1', AUTH);
    expect(await h.fallback.submitPrompt('S1', 'anything')).toEqual({ ok: false, message: reason });
    expect(h.saved).toEqual([]);
    // Switching back without a key is still offered (re-authenticated elsewhere).
    expect(await h.fallback.submitPrompt('S1', '')).toEqual({ ok: true, applies: 'next-iteration' });
  });
});
