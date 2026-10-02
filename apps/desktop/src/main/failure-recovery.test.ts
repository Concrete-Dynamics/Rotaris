import { describe, expect, it } from 'vitest';
import type { ReauthPrompt } from '@rotaris/contracts';
import { createFailureRecovery, type FailureRecoveryDeps, type ProviderDescription, type RestartAnswer } from './failure-recovery.js';
import type { ReportInput } from './notices.js';

const RESTARTED: RestartAnswer = { ok: true, value: { failed: { provider: 'scripted', model: 'alpha', key: 'alpha' }, fallback: { provider: 'scripted-b', model: 'beta', key: 'beta' } } };
const AUTH = 'scripted authentication failure (HTTP 401) — HTTP 401 — Incorrect API key provided';

interface Extra {
  readonly provider?: ProviderDescription;
  readonly save?: { ok: true } | { ok: false; message: string };
  readonly applies?: 'next-iteration' | 'next-run' | Error;
}
function harness(answer: RestartAnswer | Error = RESTARTED, configured = true, extra: Extra = {}) {
  const reports: ReportInput[] = [];
  const acks: { kind: string; title: string; body?: string }[] = [];
  const restarts: string[] = [];
  const logs: string[] = [];
  const published: { sessionId: string; prompt: ReauthPrompt | null }[] = [];
  const saved: { id: string; key: string }[] = [];
  const repinned: { sessionId: string; provider: string; model: string }[] = [];
  const deps: FailureRecoveryDeps = {
    publishPrompt: (sessionId, prompt) => published.push({ sessionId, prompt }),
    describeProvider: (id) => extra.provider ?? { provider: { id, name: `Provider ${id}` }, method: 'api-key' },
    saveKey: async (id, key) => { saved.push({ id, key }); return extra.save ?? { ok: true }; },
    repinPrimary: async (sessionId, p) => { repinned.push({ sessionId, provider: p.provider, model: p.model }); if (extra.applies instanceof Error) throw extra.applies; return { ok: true, applies: extra.applies ?? 'next-iteration' }; },
    notices: { report: async (r) => { reports.push(r); return { id: reports.length, shown: true }; }, acknowledge: (kind, title, body) => { acks.push({ kind, title, ...(body === undefined ? {} : { body }) }); } },
    restartOnFallback: async (sid) => { restarts.push(sid); if (answer instanceof Error) throw answer; return answer; },
    configurationService: () => configured,
    log: (m) => logs.push(m),
  };
  return { recovery: createFailureRecovery(deps), reports, acks, restarts, logs, published, saved, repinned };
}

describe('main/failure-recovery — each class\'s recovery (REQ-NOTIFY-060/063/064/069/070)', () => {
  it('REQ-NOTIFY-064: anything else raises an error notice saying the session and the draft were kept, the text as detail, returning to the workspace view', async () => {
    const h = harness();
    expect(await h.recovery.onRunFailed({ sessionId: 'S1', error: 'The model returned nothing.' })).toBe('generic');
    expect(h.reports).toEqual([{ severity: 'error', title: 'The run failed', message: 'The session and the draft were kept.', detail: 'The model returned nothing.', persistent: true, action: { label: 'Return to the workspace', action: { kind: 'open-view', view: 'workspace' } } }]);
    expect(h.restarts).toEqual([]);
  });

  it('REQ-NOTIFY-063: a quota failure keeps its own notice and action', async () => {
    const h = harness();
    expect(await h.recovery.onRunFailed({ sessionId: 'S1', error: 'HTTP 429 — Too Many Requests' })).toBe('quota');
    expect(h.reports[0]).toMatchObject({ severity: 'error', title: 'The provider limit was reached; the session is preserved', action: { action: { kind: 'open-settings', category: 'models' } } });
  });

  it('REQ-NOTIFY-070: a first authentication failure restarts on the fallback and acknowledges both models, with no notice', async () => {
    const h = harness();
    expect(await h.recovery.onRunFailed({ sessionId: 'S1', error: AUTH })).toBe('authentication-restarted');
    expect(h.restarts).toEqual(['S1']);
    expect(h.acks).toEqual([{ kind: 'fail', title: 'Authentication failed on scripted/alpha', body: 'The run restarted on the fallback model scripted-b/beta, which stays in use for this session.' }]);
    expect(h.reports).toEqual([]);
    expect(h.recovery.fallbackOf('S1')).toEqual(RESTARTED.ok ? RESTARTED.value : undefined);
  });

  it('a second authentication failure of the session is not restarted again; until the recovery dialog is built it takes the generic notice (REQ-NOTIFY-072, part C)', async () => {
    const h = harness();
    await h.recovery.onRunFailed({ sessionId: 'S1', error: AUTH });
    expect(await h.recovery.onRunFailed({ sessionId: 'S1', error: AUTH })).toBe('generic');
    expect(h.restarts).toEqual(['S1']);
    expect(h.reports[0]).toMatchObject({ title: 'The run failed', detail: AUTH });
    // REQ-NOTIFY-078: clearing the bookkeeping makes a further fallback attempt available.
    h.recovery.clearFallback('S1');
    expect(await h.recovery.onRunFailed({ sessionId: 'S1', error: AUTH })).toBe('authentication-restarted');
  });

  it('REQ-NOTIFY-069/070: a refused restart, a missing run channel or a missing configuration service each fall to the generic notice', async () => {
    for (const [answer, configured] of [[{ ok: false, reason: 'No fallback model is configured.' }, true], [new Error('the run host is gone'), true], [RESTARTED, false]] as const) {
      const h = harness(answer, configured);
      expect(await h.recovery.onRunFailed({ sessionId: 'S1', error: AUTH })).toBe('generic');
      expect(h.reports).toHaveLength(1);
      expect(h.reports[0]).toMatchObject({ title: 'The run failed', message: 'The session and the draft were kept.', detail: AUTH });
      expect(h.acks).toEqual([]);
      expect(h.recovery.fallbackOf('S1')).toBeUndefined();
      expect(h.restarts).toHaveLength(configured ? 1 : 0);
    }
  });
});

describe('main/failure-recovery — the non-modal re-authentication prompt (REQ-NOTIFY-071/078, ADR-0048)', () => {
  it('REQ-NOTIFY-071: a successful fallback restart opens the prompt naming the primary, the fallback and the provider\'s error', async () => {
    const h = harness();
    await h.recovery.onRunFailed({ sessionId: 'S1', error: AUTH });
    expect(h.published).toEqual([{ sessionId: 'S1', prompt: { sessionId: 'S1', primary: { provider: 'scripted', model: 'alpha', modelKey: 'alpha' }, fallback: { provider: 'scripted-b', model: 'beta', modelKey: 'beta' }, provider: { id: 'scripted', name: 'Provider scripted' }, method: 'api-key', error: AUTH } }]);
    expect(h.recovery.promptOf('S1')?.error).toBe(AUTH);
  });

  it('no prompt opens where the restart did not happen', async () => {
    const h = harness({ ok: false, reason: 'No fallback model is configured.' });
    await h.recovery.onRunFailed({ sessionId: 'S1', error: AUTH });
    expect(h.published).toEqual([]);
    expect(h.recovery.promptOf('S1')).toBeUndefined();
  });

  it('REQ-NOTIFY-071: dismissing closes the prompt and keeps the fallback (its bookkeeping stands)', async () => {
    const h = harness();
    await h.recovery.onRunFailed({ sessionId: 'S1', error: AUTH });
    expect(h.recovery.dismissPrompt('S1')).toBe(true);
    expect(h.published.at(-1)).toEqual({ sessionId: 'S1', prompt: null });
    expect(h.repinned).toEqual([]);
    expect(h.recovery.fallbackOf('S1')).toBeDefined();
    expect(h.recovery.dismissPrompt('S1')).toBe(false);
  });

  it('REQ-NOTIFY-078: submitting saves the key, clears the bookkeeping, re-pins the primary and says it applies from the next iteration', async () => {
    const h = harness();
    await h.recovery.onRunFailed({ sessionId: 'S1', error: AUTH });
    expect(await h.recovery.submitPrompt('S1', 'sk-new')).toEqual({ ok: true, applies: 'next-iteration' });
    expect(h.saved).toEqual([{ id: 'scripted', key: 'sk-new' }]);
    expect(h.repinned).toEqual([{ sessionId: 'S1', provider: 'scripted', model: 'alpha' }]);
    expect(h.recovery.fallbackOf('S1')).toBeUndefined();
    expect(h.published.at(-1)).toEqual({ sessionId: 'S1', prompt: null });
    expect(h.acks.at(-1)).toEqual({ kind: 'ok', title: 'Re-authenticated Provider scripted', body: 'The run switches back to scripted/alpha from the next iteration.' });
    // A further fallback attempt is available again.
    expect(await h.recovery.onRunFailed({ sessionId: 'S1', error: AUTH })).toBe('authentication-restarted');
  });

  it('REQ-NOTIFY-078: with no key and no live run, nothing is saved and the primary is used for the next run', async () => {
    const h = harness(RESTARTED, true, { applies: 'next-run' });
    await h.recovery.onRunFailed({ sessionId: 'S1', error: AUTH });
    expect(await h.recovery.submitPrompt('S1', '  ')).toEqual({ ok: true, applies: 'next-run' });
    expect(h.saved).toEqual([]);
    expect(h.acks.at(-1)).toEqual({ kind: 'ok', title: 'Re-authenticated Provider scripted', body: 'scripted/alpha will be used for the next run.' });
  });

  it('a key that cannot be stored raises an error acknowledgement naming the failure, and the prompt stays with the fallback (REQ-NOTIFY-077\'s words)', async () => {
    const h = harness(RESTARTED, true, { save: { ok: false, message: 'Validation failed for Provider scripted: HTTP 401' } });
    await h.recovery.onRunFailed({ sessionId: 'S1', error: AUTH });
    expect(await h.recovery.submitPrompt('S1', 'sk-bad')).toEqual({ ok: false, message: 'Validation failed for Provider scripted: HTTP 401' });
    expect(h.acks.at(-1)).toEqual({ kind: 'fail', title: 'The key could not be stored', body: 'Validation failed for Provider scripted: HTTP 401' });
    expect(h.repinned).toEqual([]);
    expect(h.recovery.promptOf('S1')).toBeDefined();
    expect(h.recovery.fallbackOf('S1')).toBeDefined();
  });

  it('a re-pin that fails leaves the prompt open and the bookkeeping standing: the session is still on the fallback (REQ-NOTIFY-075, REQ-NOTIFY-078)', async () => {
    const h = harness(RESTARTED, true, { applies: new Error('the run host stopped') });
    await h.recovery.onRunFailed({ sessionId: 'S1', error: AUTH });
    expect(await h.recovery.submitPrompt('S1', '')).toEqual({ ok: false, message: 'the run host did not answer (Error: the run host stopped)' });
    expect(h.acks.at(-1)).toMatchObject({ kind: 'fail', title: 'scripted/alpha could not be re-pinned' });
    expect(h.recovery.promptOf('S1')).toBeDefined();
    expect(h.recovery.fallbackOf('S1')).toBeDefined();
    // A further authentication failure is the fallback's own: not restarted automatically again.
    expect(await h.recovery.onRunFailed({ sessionId: 'S1', error: AUTH })).toBe('generic');
    expect(h.restarts).toEqual(['S1']);
  });

  it('REQ-NOTIFY-030: every open prompt is readable, by session, for a window that mounts after it opened', async () => {
    const h = harness();
    await h.recovery.onRunFailed({ sessionId: 'S1', error: AUTH });
    await h.recovery.onRunFailed({ sessionId: 'S2', error: AUTH });
    expect(h.recovery.openPrompts().map((p) => p.sessionId)).toEqual(['S1', 'S2']);
    h.recovery.dismissPrompt('S1');
    expect(h.recovery.openPrompts().map((p) => p.sessionId)).toEqual(['S2']);
  });

  it('a device-code or browser provider takes no key: a typed key is refused with the reason the prompt shows', async () => {
    const reason = 'GitHub Copilot signs in with "Code shown here, entered at the provider", which this build does not provide yet.';
    const h = harness(RESTARTED, true, { provider: { provider: { id: 'copilot', name: 'GitHub Copilot' }, method: 'unavailable', unavailableReason: reason } });
    await h.recovery.onRunFailed({ sessionId: 'S1', error: AUTH });
    expect(await h.recovery.submitPrompt('S1', 'anything')).toEqual({ ok: false, message: reason });
    expect(h.saved).toEqual([]);
    // Switching back without a key is still offered (re-authenticated elsewhere).
    expect(await h.recovery.submitPrompt('S1', '')).toEqual({ ok: true, applies: 'next-iteration' });
  });
});

