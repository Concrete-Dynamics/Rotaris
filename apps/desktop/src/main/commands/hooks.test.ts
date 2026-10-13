import { describe, expect, it } from 'vitest';
import type { BrowserWindow } from 'electron';
import { FakeClock } from '@rotaris/kernel';
import type { ProcessReply, RunHostRequest } from '@rotaris/contracts';
import { hooksCommands } from './hooks.js';
import type { CommandAt, CommandContext, MainWindowState } from './context.js';

/**
 * REQ-HOOKS-106/107 and ESC-34 (REQ-NOTIFY-044) at main's hooks facet: the review a notice action asks for is the
 * workspace the action names, whichever window it was activated in, and the decision taken in that review is stored
 * against the workspace the dialog was opened for, never against whichever main window a dialog's command resolves to
 * (docs/defects/fixed/a-hook-review-notice-for-another-workspace-opens-nothing.md). Driven with plain objects where the
 * run host, the review flow and the dialog were, as `skills.test.ts` drives its facet.
 */
function fakeRunHost(reply: (req: RunHostRequest) => ProcessReply) {
  const asked: RunHostRequest[] = [];
  const link: CommandContext['runHost'] = {
    request: async (req) => { asked.push(req as RunHostRequest); return reply(req as RunHostRequest); },
  };
  return { link, asked };
}

const windowOn = (workspaceId: string, workspace: string, senderId: number): CommandAt => ({
  w: { workspaceId, workspace, followedSessionId: null } as MainWindowState,
  senderId,
  awaitWorkspace: async () => undefined,
});

function facet(host: ReturnType<typeof fakeRunHost>) {
  const reviews: { asking: MainWindowState | undefined; workspace: string | undefined }[] = [];
  const reviewPayloads: CommandContext['reviewPayloads'] = new Map();
  const logged: string[] = [];
  const commands = hooksCommands({
    clocks: new FakeClock(),
    log: (m) => { logged.push(m); },
    openHookReview: async (asking, workspace) => { reviews.push({ asking, workspace }); return { ok: true }; },
    reviewPayloads,
    runHost: host.link,
  });
  return { commands, reviews, reviewPayloads, logged };
}

describe('hooks.review and hooks.reviewDecide across workspaces (ESC-34, REQ-NOTIFY-044, REQ-HOOKS-106/107)', () => {
  it('hands a notice action\'s named workspace to the review flow beside the window it was activated in, and none for the Hooks tab\'s control', async () => {
    const f = facet(fakeRunHost(() => ({ kind: 'ack' })));
    const inB = windowOn('ws-B', '/work/b', 1);
    expect(await f.commands['hooks.review']({ kind: 'hooks.review', workspace: '/work/a' }, inB)).toEqual({ ok: true });
    expect(await f.commands['hooks.review']({ kind: 'hooks.review' }, inB)).toEqual({ ok: true });
    expect(f.reviews).toEqual([{ asking: inB.w, workspace: '/work/a' }, { asking: inB.w, workspace: undefined }]);
  });

  it('stores the decision against the workspace the dialog was opened for, not the active window\'s', async () => {
    const host = fakeRunHost(() => ({ kind: 'ack' }));
    const f = facet(host);
    const dialog = { isDestroyed: () => false, close: () => undefined } as unknown as BrowserWindow;
    f.reviewPayloads.set(7, { workspace: '/work/a', workspaceId: 'ws-A', entries: [], decided: false, win: dialog });
    // The dialog's command resolves to the active main window, which holds workspace B.
    const out = await f.commands['hooks.reviewDecide']({ kind: 'hooks.reviewDecide', trusted: false }, windowOn('ws-B', '/work/b', 7));
    expect(out).toEqual({ ok: true });
    expect(host.asked).toEqual([{ kind: 'hooks.decide', workspaceId: 'ws-A', trusted: false }]);
    expect(f.logged).toContain('hook review → refused for /work/a');
    // Decided once: a second answer from the same dialog is refused and asks nothing.
    expect((await f.commands['hooks.reviewDecide']({ kind: 'hooks.reviewDecide', trusted: true }, windowOn('ws-B', '/work/b', 7))).ok).toBe(false);
    expect(host.asked).toHaveLength(1);
  });
});
