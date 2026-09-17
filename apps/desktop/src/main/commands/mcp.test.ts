import { describe, expect, it } from 'vitest';
import type { ProcessReply, RunHostRequest } from '@rotaris/contracts';
import { mcpCommands } from './mcp.js';
import { refusal } from './context.js';
import type { CommandAt, CommandContext, MainWindowState } from './context.js';

/**
 * The commands main answers used to be cases in a closure inside `main()`: to reach one, a test had to
 * start Electron, build a window and fork the run host. They are modules now, and this is what that
 * buys — a facet driven through its own interface, with a plain object where the run host was.
 *
 * `mcp` is the thinnest facet on purpose: every handler names a workspace, asks the run host, and turns
 * anything but the expected reply into a refusal. Those three moves are shared by fifty-odd commands, so
 * proving them here proves the shape.
 */

/** The run host, stood in for. The context asks for `request` and nothing else, so this is the whole adapter. */
function fakeRunHost(reply: (req: RunHostRequest) => ProcessReply) {
  const asked: RunHostRequest[] = [];
  const link: CommandContext['runHost'] = {
    request: async (req) => { asked.push(req as RunHostRequest); return reply(req as RunHostRequest); },
  };
  return { link, asked };
}

const windowOn = (workspaceId: string | null): CommandAt => ({
  w: { workspaceId, workspace: workspaceId === null ? '(no workspace)' : 'D:/work' } as MainWindowState,
  senderId: 1,
  awaitWorkspace: async () => undefined,
});

describe('the MCP commands, driven without a process behind them', () => {
  it('refuses before it asks when the window has no workspace open', async () => {
    const host = fakeRunHost(() => ({ kind: 'ack' }));
    const out = await mcpCommands({ runHost: host.link })['mcp.list']({ kind: 'mcp.list' }, windowOn(null));
    expect(out).toEqual({ ok: false, code: 'workspace.none', headline: 'Open a workspace first' });
    // The point of the gate: nothing crossed the process seam at all.
    expect(host.asked).toEqual([]);
  });

  it('names the window\'s workspace in the request and answers with what the run host sent', async () => {
    const listing = { servers: [] };
    const host = fakeRunHost(() => ({ kind: 'mcp.list', listing } as unknown as ProcessReply));
    const out = await mcpCommands({ runHost: host.link })['mcp.list']({ kind: 'mcp.list' }, windowOn('ws-7'));
    expect(out).toEqual({ ok: true, value: listing });
    expect(host.asked).toEqual([{ kind: 'mcp.list', workspaceId: 'ws-7' }]);
  });

  it('carries an omitted name as an absent field rather than an explicit undefined, and widens the bound for a full probe', async () => {
    const host = fakeRunHost(() => ({ kind: 'mcp.probe', results: [] } as unknown as ProcessReply));
    const commands = mcpCommands({ runHost: host.link });
    await commands['mcp.probe']({ kind: 'mcp.probe' }, windowOn('ws-7'));
    await commands['mcp.probe']({ kind: 'mcp.probe', name: 'serena' }, windowOn('ws-7'));
    expect(host.asked[0]).toEqual({ kind: 'mcp.probe', workspaceId: 'ws-7' });
    expect(Object.hasOwn(host.asked[0]!, 'name')).toBe(false);
    expect(host.asked[1]).toEqual({ kind: 'mcp.probe', workspaceId: 'ws-7', name: 'serena' });
  });

  it('turns a refusal into the refusal, and a reply of the wrong kind into one too (ADR-0019: nothing throws)', async () => {
    const refused = await mcpCommands({
      runHost: fakeRunHost(() => ({ kind: 'refused', code: 'mcp.unreadable', headline: 'the file is malformed', detail: 'line 3' })).link,
    })['mcp.list']({ kind: 'mcp.list' }, windowOn('ws-7'));
    expect(refused).toEqual({ ok: false, code: 'mcp.unreadable', headline: 'The MCP servers could not be listed', detail: 'the file is malformed: line 3' });

    const surprised = await mcpCommands({ runHost: fakeRunHost(() => ({ kind: 'ack' })).link })['mcp.list']({ kind: 'mcp.list' }, windowOn('ws-7'));
    expect(surprised).toEqual({ ok: false, code: 'reply.unexpected', headline: 'The MCP servers could not be listed', detail: 'unexpected reply ack' });
  });

  it('keeps the refusal\'s own code and folds its two lines into one detail', () => {
    expect(refusal({ kind: 'refused', code: 'x.y', headline: 'head', detail: '' }, 'asked')).toEqual({ ok: false, code: 'x.y', headline: 'asked', detail: 'head' });
    expect(refusal({ kind: 'ack' }, 'asked')).toEqual({ ok: false, code: 'reply.unexpected', headline: 'asked', detail: 'unexpected reply ack' });
  });
});
