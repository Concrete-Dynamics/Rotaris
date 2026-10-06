/**
 * The autopsy reader counts as retried only a command that was run again: the whole command and its session action
 * (finding D6 of the default live run at 1763f7f), by the same agent (finding H8 of the duress live run at 27a5127). The
 * shapes are those runs' own: the requirements scenario's `cd <worktree> && …` commands, the frictions scenario's
 * `send_signal` and `query` of one background session, and the duress scenario's suite run once by each of two agents.
 */
import { describe, expect, it } from 'vitest';
import { retriedCommands, retryKeyOf } from './autopsy-retries.mjs';

const cd = 'cd /tmp/rotaris-live-run/2026-10-03T05-56-27-364Z/workspace/.rotaris/requirements/worktrees/rotaris-req-req-104-u1 && ';
/** Calls by one agent, as the D6 cases were written: the args alone, each made by `a`. */
const byOne = (calls: readonly (Record<string, unknown> | null)[]) => calls.map((args) => ({ agent: 'a', args }));

describe('the autopsy reader\'s retried commands (R-043)', () => {
  it('commands sharing a prefix past 120 characters are different commands, and none of them was retried', () => {
    expect(cd.length).toBeGreaterThan(100);
    const calls = [
      { command: `${cd}git status --short && git log --oneline -5 && node --version` },
      { command: `${cd}git diff --stat && ls node_modules 2>/dev/null | head -3` },
      { command: `${cd}git diff` },
      { command: `${cd}node --test 2>&1 | tail -30` },
      { command: `${cd}node --test 2>&1 | tail -5` },
      { command: `${cd}echo '--- a ---' && cat -n src/todos.js` },
      { command: `${cd}echo '--- b ---' && cat -n src/todos.test.js` },
    ];
    expect(retriedCommands(byOne(calls))).toEqual([]);
  });

  it('a send_signal and a query of one session, both carrying `true`, are two actions, not a retry', () => {
    const calls = [
      { command: 'true', session_action: 'send_signal', session_id: 'ts_92897550', signal: 'SIGINT' },
      { command: 'true', session_action: 'query', session_id: 'ts_92897550' },
    ];
    expect(retriedCommands(byOne(calls))).toEqual([]);
  });

  it('the same command run again is a retry, whitespace aside, and so is the same action repeated', () => {
    const calls = [
      { command: `${cd}node --test` }, { command: `${cd}node  --test ` }, { command: `${cd}node --test` },
      { command: 'true', session_action: 'query', session_id: 'ts_1' }, { command: 'true', session_action: 'query', session_id: 'ts_1' },
      { command: 'true' },
    ];
    expect(retriedCommands(byOne(calls))).toEqual([{ agent: 'a', label: `${cd}node --test`, times: 3 }, { agent: 'a', label: '[query] true', times: 2 }]);
  });

  it('H8 (27a5127): the same command run once by each of two agents is no retry; the same agent running it twice still is', () => {
    const suite = 'cd /tmp/rotaris-live-run/2026-10-06T01-47-53-900Z/workspace && node --test 2>&1 | tail -40';
    // #137 by wave2d at 01:55:23 and #300 by the continuation at 02:37:04: two agents, each once.
    expect(retriedCommands([{ agent: 'wave2d-reconcile-docs', args: { command: suite } }, { agent: 'wave3-verification-report', args: { command: suite } }])).toEqual([]);
    // The continuation running it a second time is its retry, and only its own calls are counted.
    expect(retriedCommands([
      { agent: 'wave2d-reconcile-docs', args: { command: suite } },
      { agent: 'wave3-verification-report', args: { command: suite } },
      { agent: 'wave3-verification-report', args: { command: suite } },
    ])).toEqual([{ agent: 'wave3-verification-report', label: suite, times: 2 }]);
  });

  it('a call with no command is not counted', () => {
    expect(retryKeyOf({ session_action: 'query' })).toBeNull();
    expect(retryKeyOf(null)).toBeNull();
    expect(retryKeyOf({ command: '   ' })).toBeNull();
  });
});
