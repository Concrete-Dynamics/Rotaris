import { describe, expect, it } from 'vitest';
import { createFailureRecovery, type FailureRecoveryDeps, type RestartAnswer } from './failure-recovery.js';
import type { ReportInput } from './notices.js';

const RESTARTED: RestartAnswer = { ok: true, value: { failed: { provider: 'scripted', model: 'alpha', key: 'alpha' }, fallback: { provider: 'scripted-b', model: 'beta', key: 'beta' } } };
const AUTH = 'scripted authentication failure (HTTP 401) — HTTP 401 — Incorrect API key provided';

function harness(answer: RestartAnswer | Error = RESTARTED, configured = true) {
  const reports: ReportInput[] = [];
  const acks: { kind: string; title: string; body?: string }[] = [];
  const restarts: string[] = [];
  const logs: string[] = [];
  const deps: FailureRecoveryDeps = {
    notices: { report: async (r) => { reports.push(r); return { id: reports.length, shown: true }; }, acknowledge: (kind, title, body) => { acks.push({ kind, title, ...(body === undefined ? {} : { body }) }); } },
    restartOnFallback: async (sid) => { restarts.push(sid); if (answer instanceof Error) throw answer; return answer; },
    configurationService: () => configured,
    log: (m) => logs.push(m),
  };
  return { recovery: createFailureRecovery(deps), reports, acks, restarts, logs };
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
