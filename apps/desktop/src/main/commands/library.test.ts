import { describe, expect, it, vi } from 'vitest';
import type { ProcessReply, RunHostRequest } from '@rotaris/contracts';
import { libraryCommands } from './library.js';
import type { CommandAt, CommandContext, MainWindowState } from './context.js';

vi.mock('electron', () => ({ shell: {} }));

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
