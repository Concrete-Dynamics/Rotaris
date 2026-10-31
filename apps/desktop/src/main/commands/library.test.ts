import { describe, expect, it, vi } from 'vitest';
import { FakeClock } from '@rotaris/kernel';
import type { ProcessReply, RunHostRequest } from '@rotaris/contracts';
import { libraryCommands } from './library.js';
import type { CommandAt, CommandContext, MainWindowState } from './context.js';

/** The platform's opener as Open log reaches it (`shell.openPath`); a case says what it answers, or that it never does. */
const opener = vi.hoisted(() => ({ open: (_path: string): Promise<string> => Promise.resolve('') }));
vi.mock('electron', () => ({ shell: { openPath: (path: string) => opener.open(path) } }));

/**
 * REQ-SESSION-202 with REQ-SESSION-043 at main's library facet: a workspace whose store the open refused — a place holding
 * no store, or a cut restore whose store could not be put back (OQ-266) — is listed as that condition, never as an empty
 * list and never as "no workspace". Driven with plain objects where the run host and the window were.
 */
function facet(storeRefusal: CommandContext['storeRefusal']) {
  const asked: RunHostRequest[] = [];
  const runHost: CommandContext['runHost'] = { request: async (req) => { asked.push(req as RunHostRequest); return { kind: 'session.list', sessions: [] } as unknown as ProcessReply; } };
  const commands = libraryCommands({ runHost, storeRefusal } as unknown as Parameters<typeof libraryCommands>[0]);
  return { commands, asked };
}
const at = (workspaceId: string | undefined): CommandAt => ({
  w: { workspaceId, workspace: '/work/a', followedSessionId: null } as unknown as MainWindowState,
  senderId: 1,
  awaitWorkspace: async () => undefined,
});

describe('session.list over a store the open refused (REQ-SESSION-202, REQ-SESSION-043, OQ-266)', () => {
  it('answers with the condition the open found, and asks the run host nothing', async () => {
    const held = { code: 'workspace.store-missing', headline: 'The session store for this workspace is not where it is kept', detail: 'The place … exists and the store is not in it.' };
    const f = facet((workspace) => (workspace === '/work/a' ? held : undefined));
    expect(await f.commands['session.list']({ kind: 'session.list' }, at(undefined))).toEqual({ ok: false, ...held });
    expect(f.asked).toEqual([]);
  });

  it('(as before) with no refusal held, a window with no workspace is told to open one, and an open one lists', async () => {
    const f = facet(() => undefined);
    expect(await f.commands['session.list']({ kind: 'session.list' }, at(undefined))).toEqual({ ok: false, code: 'workspace.none', headline: 'Open a workspace before browsing sessions' });
    expect(await f.commands['session.list']({ kind: 'session.list' }, at('ws-A'))).toEqual({ ok: true, value: { sessions: [] } });
  });
});

/**
 * REQ-SESSION-191's Open log, with REQ-SHELL-040's sibling rule that neither failure of the opener is silent: the platform's
 * opener can leave its promise unsettled where the handler cannot be launched (measured 2026-10-02 on a Linux host with no
 * `xdg-open`), and until 2026-10-31 the command waited on it for good
 * (`docs/defects/fixed/open-log-waits-on-the-platform-opener-without-a-bound.md`). The run host and the window are plain objects.
 */
describe('session.openLog over an opener that never answers (REQ-SESSION-191, REQ-SHELL-040)', () => {
  const log = '/work/a/.rotaris/sessions/s-1/session.log';
  function openLog(clock: FakeClock) {
    const runHost: CommandContext['runHost'] = {
      request: async () => ({ kind: 'session.files', files: { directory: '/work/a/.rotaris/sessions/s-1', log, summary: null, artifacts: null } }) as unknown as ProcessReply,
    };
    const commands = libraryCommands({ runHost, clocks: { timers: clock.timers } } as unknown as Parameters<typeof libraryCommands>[0]);
    return commands['session.openLog']({ kind: 'session.openLog', sessionId: 's-1' }, at('ws-A'));
  }
  const flush = () => new Promise((resolve) => { setImmediate(resolve); });

  it('answers session.open-failed once the bound passes, and not a moment before', async () => {
    const clock = new FakeClock();
    const asked: string[] = [];
    opener.open = (path) => { asked.push(path); return new Promise<string>(() => undefined); };
    let outcome: unknown;
    void Promise.resolve(openLog(clock)).then((o) => { outcome = o; });
    await flush();
    expect(asked).toEqual([log]);
    clock.advance(4_999);
    await flush();
    expect(outcome).toBeUndefined();
    clock.advance(1);
    await flush();
    // THE FALSIFIER: until 2026-10-31 `outcome` stayed undefined here — the command never answered.
    expect(outcome).toEqual({ ok: false, code: 'session.open-failed', headline: 'The log could not be opened', detail: 'the platform opener did not answer within 5 s' });
    expect(clock.pendingCount()).toBe(0);
  });

  it('(as before) the opener\'s success opens the log, and its refusal is the detail', async () => {
    const clock = new FakeClock();
    opener.open = async () => '';
    expect(await openLog(clock)).toEqual({ ok: true, value: { path: log } });
    opener.open = async () => 'Failed to open path';
    expect(await openLog(clock)).toEqual({ ok: false, code: 'session.open-failed', headline: 'The log could not be opened', detail: 'Failed to open path' });
    expect(clock.pendingCount()).toBe(0);
  });
});
