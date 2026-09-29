import { describe, expect, it } from 'vitest';
import { SKILL_LISTING_NO_SESSION, type ProcessReply, type RunHostRequest } from '@rotaris/contracts';
import { canonicalPath } from '@rotaris/platform';
import { skillsCommands } from './skills.js';
import type { CommandAt, CommandContext, MainWindowState } from './context.js';

/**
 * REQ-CHAT-162's `/skills`, at main: the facet names the window's workspace and the session it follows, and never
 * lets a renderer name either — the same discipline every skills command keeps. Driven with a plain object where the
 * run host was, as `mcp.test.ts` drives its facet.
 */
function fakeRunHost(reply: (req: RunHostRequest) => ProcessReply) {
  const asked: RunHostRequest[] = [];
  const link: CommandContext['runHost'] = {
    request: async (req) => { asked.push(req as RunHostRequest); return reply(req as RunHostRequest); },
  };
  return { link, asked };
}

const windowOn = (workspace: string | null, followedSessionId: string | null): CommandAt => ({
  w: { workspaceId: workspace === null ? null : 'ws-1', workspace: workspace ?? '(no workspace)', followedSessionId } as MainWindowState,
  senderId: 1,
  awaitWorkspace: async () => undefined,
});

const facet = (host: ReturnType<typeof fakeRunHost>) => skillsCommands({ runHost: host.link, chooseSkillFile: async () => null });

describe('skills.list — the /skills listing, relayed for the window that asked', () => {
  it('refuses before it asks when the window has no workspace open', async () => {
    const host = fakeRunHost(() => ({ kind: 'ack' }));
    const out = await facet(host)['skills.list']({ kind: 'skills.list' }, windowOn(null, null));
    expect(out).toEqual({ ok: false, code: 'workspace.none', headline: 'Open a workspace first' });
    expect(host.asked).toEqual([]);
  });

  it('OQ-67 (b): refuses before it asks when the window follows no session — a row must be saved WITH one', async () => {
    const host = fakeRunHost(() => ({ kind: 'ack' }));
    const out = await facet(host)['skills.list']({ kind: 'skills.list' }, windowOn('/work/project', null));
    expect(out).toEqual({ ok: false, code: 'session.none', headline: SKILL_LISTING_NO_SESSION });
    expect(host.asked).toEqual([]);
  });

  it('names the followed session and the canonical workspace root, and answers with the count and the row index', async () => {
    const host = fakeRunHost(() => ({ kind: 'skills.listed', count: 3, index: 7 }));
    const out = await facet(host)['skills.list']({ kind: 'skills.list' }, windowOn('/work/project', 'S-1'));
    expect(out).toEqual({ ok: true, value: { count: 3, index: 7 } });
    expect(host.asked).toEqual([{ kind: 'skills.list', workspaceRoot: canonicalPath('/work/project'), sessionId: 'S-1' }]);
  });

  it('turns the run host\'s refusal into the outcome a surface can show, detail and all', async () => {
    const host = fakeRunHost(() => ({ kind: 'refused', code: 'session.not-loaded', headline: 'The skills could not be listed in the transcript', detail: 'not loaded' }));
    const out = await facet(host)['skills.list']({ kind: 'skills.list' }, windowOn('/work/project', 'S-1'));
    expect(out).toEqual({ ok: false, code: 'session.not-loaded', headline: 'The skills could not be listed in the transcript', detail: 'The skills could not be listed in the transcript: not loaded' });
  });
});
