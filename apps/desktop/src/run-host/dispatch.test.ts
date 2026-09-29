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
