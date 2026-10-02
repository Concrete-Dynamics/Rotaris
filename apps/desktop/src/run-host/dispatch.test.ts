import { describe, expect, it } from 'vitest';
import type { RunHostRequest } from '@rotaris/contracts';
import { dispatch } from './dispatch.js';
import type { RunHost } from './host.js';

/**
 * PD-ORCH-005 clause 6: the run host's hop of "continue without them". The renderer's command and main's forwarding are
 * pinned beside their own units; this is the hop between them and the engine, where a dropped flag would turn a decline
 * into a resume and nothing else would notice. `dispatch` only destructures its host before the switch, so a host that
 * holds the two members this case reads is enough.
 */
describe('session.continue carries the decline to the engine (PD-ORCH-005 clause 6)', () => {
  const hostFor = (seen: unknown[]) => ({
    continuationLeaseForSession: async () => null,
    log: () => undefined,
    sessions: { continueSession: (...args: unknown[]) => { seen.push(args); return { ok: true, value: { resumed: true, messageLimit: null } }; } },
  }) as unknown as RunHost;

  it('passes `withoutPaused` through when the command declines, and resumes (the default) when it does not', async () => {
    const seen: unknown[] = [];
    const host = hostFor(seen);
    const declined: RunHostRequest = { kind: 'session.continue', sessionId: 'S1', action: 'continue', withoutPaused: true };
    const resumed: RunHostRequest = { kind: 'session.continue', sessionId: 'S1', action: 'continue' };
    expect(await dispatch(declined, host)).toEqual({ kind: 'session.continued', sessionId: 'S1', resumed: true, messageLimit: null });
    expect(await dispatch(resumed, host)).toEqual({ kind: 'session.continued', sessionId: 'S1', resumed: true, messageLimit: null });
    expect(seen).toEqual([['S1', 'continue', { withoutPaused: true }], ['S1', 'continue', { withoutPaused: false }]]);
  });
});

/**
 * REQ-NOTIFY-045 with REQ-PROVIDER-066 (OQ-178's reading; the repair of
 * `docs/defects/fixed/the-retry-action-reads-the-last-prompt-from-the-resident-window.md`): the run host's hop of the
 * retry. A retry launches a run as a prompt does, so the continuation lease is refreshed before the engine is asked, and a
 * lease refusal comes back without the engine ever hearing of it; the engine's refusals reach main with their codes and
 * their words, the confinement gate's under a start's headline (REQ-NOTIFY-061). Pinned after fin8's verifier found no test
 * of this case.
 */
describe('session.retry refreshes the lease, then asks the engine, and passes its refusals through (REQ-NOTIFY-045)', () => {
  const hostFor = (order: string[], lease: unknown, answer: unknown) => ({
    continuationLeaseForSession: async (sid: string) => { order.push(`lease ${sid}`); return lease; },
    log: () => undefined,
    sessions: { retry: (sid: string) => { order.push(`retry ${sid}`); return answer; } },
  }) as unknown as RunHost;
  const retry: RunHostRequest = { kind: 'session.retry', sessionId: 'S1' };

  it('acknowledges a retry the engine took, after the lease', async () => {
    const order: string[] = [];
    expect(await dispatch(retry, hostFor(order, null, { ok: true, value: { index: 4 } }))).toEqual({ kind: 'ack' });
    expect(order).toEqual(['lease S1', 'retry S1']);
  });

  it('a lease refusal comes back before the engine is asked', async () => {
    const order: string[] = [];
    const leaseRefused = { kind: 'refused', code: 'credentials.unavailable', headline: 'The provider credentials could not be read' };
    expect(await dispatch(retry, hostFor(order, leaseRefused, { ok: true, value: { index: 4 } }))).toEqual(leaseRefused);
    expect(order).toEqual(['lease S1']);
  });

  it('passes the engine\'s `no-prompt`, `attachment-unavailable` and `confinement` refusals through with their words', async () => {
    const cases: readonly [string, string, string][] = [
      ['no-prompt', 'No prompt has been submitted in this session, so there is nothing to retry.', 'The prompt could not be retried'],
      ['attachment-unavailable', 'The last prompt was not retried, because its image shot.png could not be read back: it is no longer available.', 'The prompt could not be retried'],
      ['confinement', 'Confinement is unavailable: bwrap is not on PATH. Install bubblewrap.', 'The run was refused before it started'],
    ];
    for (const [code, reason, headline] of cases) {
      const order: string[] = [];
      expect(await dispatch(retry, hostFor(order, null, { ok: false, error: { code, reason } }))).toEqual({ kind: 'refused', code: `session.${code}`, headline, detail: reason });
      expect(order).toEqual(['lease S1', 'retry S1']);
    }
    // A run already active is refused in the engine's own words, as a prompt's is.
    expect(await dispatch(retry, hostFor([], null, { ok: false, error: { code: 'run-active', reason: 'A run is already active.' } }))).toEqual({ kind: 'refused', code: 'session.run-active', headline: 'A run is already active.', detail: 'A run is already active.' });
  });
});

/**
 * PD-ORCH-005 clause 9 (defect `an-approval-asked-after-the-last-window-closes-is-denied`, R-067): the revoke's hop. Main
 * marks the revoke its quit causes; a dropped flag would leave the run host unattended with no quit under way, and what an
 * agent asked in the quit's gap would be denied again with nothing else to notice.
 */
describe('presenter.revoke carries the quit to the presenter registry (PD-ORCH-005 clause 9)', () => {
  it('passes `quitting` through, and an unmarked revoke is an ordinary one', async () => {
    const seen: unknown[] = [];
    const host = { log: () => undefined, presenters: { revoke: (...args: unknown[]) => { seen.push(args); } } } as unknown as RunHost;
    expect(await dispatch({ kind: 'presenter.revoke', windowId: '7', quitting: true }, host)).toEqual({ kind: 'ack' });
    expect(await dispatch({ kind: 'presenter.revoke', windowId: '8' }, host)).toEqual({ kind: 'ack' });
    expect(seen).toEqual([['7', true], ['8', false]]);
  });
});

/**
 * REQ-WORKSPACE-092/109 (defect `an-orderly-quit-during-the-background-setup-warns-its-cancellation-could-not-be-delivered`,
 * fixed): the run host's shutdown is what ends a code-intelligence setup at an orderly quit. `McpHost.endSetup` is pinned
 * beside its own unit and the group termination in `packages/mcp`; this is the one call that joins them to the quit. With
 * it replaced by `Promise.resolve()` the built app quit in 144 ms and a step and the process it had started were both still
 * running 5 s after the exit (`workspace-proof` 8f measures that end to end). So: `shutdown` asks the setup to end, and
 * neither closes a store nor schedules the exit until the setup has ended.
 */
describe('shutdown ends the code-intelligence setup before the run host exits (REQ-WORKSPACE-092, REQ-WORKSPACE-109)', () => {
  it('calls McpHost.endSetup first and awaits it before the stores close and the exit is scheduled', async () => {
    const order: string[] = [];
    let endSetup: () => void = () => undefined;
    const host = {
      log: () => undefined,
      clocks: { timers: { after: () => { order.push('exit scheduled'); } } },
      improvementControllers: new Map(),
      improvementContexts: new Map(),
      presenters: { stop: () => { order.push('presenters.stop'); } },
      sessions: { closeAll: async () => { order.push('sessions.closeAll'); } },
      stores: new Map([['W1', { db: { close: () => { order.push('store closed'); } } }]]),
      mcp: {
        endSetup: () => { order.push('mcp.endSetup'); return new Promise<void>((resolve) => { endSetup = () => { order.push('setup ended'); resolve(); }; }); },
        discovery: { closeAll: async () => { order.push('discovery.closeAll'); } },
        closeAll: async () => { order.push('mcp.closeAll'); },
      },
    } as unknown as RunHost;
    let replied = false;
    const reply = dispatch({ kind: 'shutdown', deadlineMs: 30_000 }, host).then((r) => { replied = true; return r; });
    // Every other step of the shutdown settles at once; the setup has not ended yet.
    await new Promise((resolve) => setImmediate(resolve));
    expect(order[0]).toBe('mcp.endSetup');
    expect(order).toContain('mcp.closeAll');
    expect(order).not.toContain('store closed');
    expect(order).not.toContain('exit scheduled');
    expect(replied).toBe(false);
    endSetup();
    expect(await reply).toEqual({ kind: 'ack' });
    expect(order.slice(-3)).toEqual(['setup ended', 'store closed', 'exit scheduled']);
  });
});
