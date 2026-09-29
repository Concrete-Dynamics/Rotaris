import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { pausePendingAfter } from './composer.js';

/**
 * REQ-MONITOR-296 / REQ-NOTIFY-050 — the Mission view's Pause (the note "the Mission view's pause reads pausing after the
 * session rests"). The mark the view sets when a pause is accepted belongs to the run that accepted it: it ends when that
 * run leaves the busy states or another session is shown, by the composer's rule. The view is stateful and vitest has no
 * DOM, so what pins its use of the rule is its source, as `composer.test.ts` pins the Workspace's; `mission-proof`'s
 * third launch reads the built view's Pause at rest.
 */
describe('REQ-MONITOR-296: the Mission view\'s pause mark belongs to the run that accepted the pause', () => {
  const text = readFileSync(new URL('./MissionView.tsx', import.meta.url), 'utf8');
  it('clears the mark through the composer\'s rule whenever the scope changes', () => {
    expect(text).toContain('const pauseScope: PauseScope = { sessionId: session?.id ?? null, busy: session !== null && isBusy(session.executionStatus) };');
    expect(text).toContain('if (pausePending && !pausePendingAfter(pausePending, pauseScopeSeen, pauseScope)) setPausePending(false);');
  });
  it('the rule it reads ends the mark once the session rests `paused`, which REQ-NOTIFY-050 does not count as busy', () => {
    expect(pausePendingAfter(true, { sessionId: 's1', busy: true }, { sessionId: 's1', busy: false })).toBe(false);
  });
});
