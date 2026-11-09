import { describe, expect, it } from 'vitest';
import type { ProcessReply, RunHostRequest, WorkspaceServiceRequest } from '@rotaris/contracts';
import { canonicalPath } from '@rotaris/platform';
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
    request: async (req) => { asked.push(req); return reply(req); },
  };
  return { link, asked };
}

/** The workspace service, stood in for: this facet reaches it for the two secret writes alone (REQ-MCP-110). */
function fakeService(reply: (req: WorkspaceServiceRequest) => ProcessReply, workspace = 'D:/work') {
  const asked: WorkspaceServiceRequest[] = [];
  const services = new Map([[canonicalPath(workspace), { link: { request: async (req: WorkspaceServiceRequest) => { asked.push(req); return reply(req); } } }]]) as unknown as CommandContext['services'];
  return { services, asked };
}

/** The facet's whole slice: the run host, the services map, and the two lines a write may leave. */
function facet(host: ReturnType<typeof fakeRunHost>, service: ReturnType<typeof fakeService> = fakeService(() => ({ kind: 'refused', code: 'x', headline: 'none' })), lines: string[] = []) {
  return mcpCommands({
    log: (m) => { lines.push(m); },
    raiseNotice: (severity, headline, detail) => { lines.push(`notice:${severity}:${headline}:${detail ?? ''}`); },
    runHost: host.link,
    services: service.services,
  });
}

const windowOn = (workspaceId: string | null): CommandAt => ({
  w: { workspaceId, workspace: workspaceId === null ? '(no workspace)' : 'D:/work' } as MainWindowState,
  senderId: 1,
  awaitWorkspace: async () => undefined,
});

describe('the MCP commands, driven without a process behind them', () => {
  it('refuses before it asks when the window has no workspace open', async () => {
    const host = fakeRunHost(() => ({ kind: 'ack' }));
    const out = await facet(host)['mcp.list']({ kind: 'mcp.list' }, windowOn(null));
    expect(out).toEqual({ ok: false, code: 'workspace.none', headline: 'Open a workspace first' });
    // The point of the gate: nothing crossed the process seam at all.
    expect(host.asked).toEqual([]);
  });

  it('names the window\'s workspace in the request and answers with what the run host sent', async () => {
    const listing = { servers: [] };
    const host = fakeRunHost(() => ({ kind: 'mcp.list', listing } as unknown as ProcessReply));
    const out = await facet(host)['mcp.list']({ kind: 'mcp.list' }, windowOn('ws-7'));
    expect(out).toEqual({ ok: true, value: listing });
    expect(host.asked).toEqual([{ kind: 'mcp.list', workspaceId: 'ws-7' }]);
  });

  it('carries an omitted name as an absent field rather than an explicit undefined, and widens the bound for a full probe', async () => {
    const host = fakeRunHost(() => ({ kind: 'mcp.probe', results: [] } as unknown as ProcessReply));
    const commands = facet(host);
    await commands['mcp.probe']({ kind: 'mcp.probe' }, windowOn('ws-7'));
    await commands['mcp.probe']({ kind: 'mcp.probe', name: 'serena' }, windowOn('ws-7'));
    expect(host.asked[0]).toEqual({ kind: 'mcp.probe', workspaceId: 'ws-7' });
    expect(Object.hasOwn(host.asked[0]!, 'name')).toBe(false);
    expect(host.asked[1]).toEqual({ kind: 'mcp.probe', workspaceId: 'ws-7', name: 'serena' });
  });

  it('turns a refusal into the refusal, and a reply of the wrong kind into one too (ADR-0019: nothing throws)', async () => {
    const refused = await facet(fakeRunHost(() => ({ kind: 'refused', code: 'mcp.unreadable', headline: 'the file is malformed', detail: 'line 3' })))['mcp.list']({ kind: 'mcp.list' }, windowOn('ws-7'));
    expect(refused).toEqual({ ok: false, code: 'mcp.unreadable', headline: 'The MCP servers could not be listed', detail: 'the file is malformed: line 3' });

    const surprised = await facet(fakeRunHost(() => ({ kind: 'ack' })))['mcp.list']({ kind: 'mcp.list' }, windowOn('ws-7'));
    expect(surprised).toEqual({ ok: false, code: 'reply.unexpected', headline: 'The MCP servers could not be listed', detail: 'unexpected reply ack' });
  });

  it('keeps the refusal\'s own code and folds its two lines into one detail', () => {
    expect(refusal({ kind: 'refused', code: 'x.y', headline: 'head', detail: '' }, 'asked')).toEqual({ ok: false, code: 'x.y', headline: 'asked', detail: 'head' });
    expect(refusal({ kind: 'ack' }, 'asked')).toEqual({ ok: false, code: 'reply.unexpected', headline: 'asked', detail: 'unexpected reply ack' });
  });
});

/**
 * PD-CONFIG-006's seam, reused: a `config.setField` whose patch touches `mcp_servers` makes main ask the run host to
 * drop its cached resolution and read the file again. A stored secret changes what that resolution reads just as an
 * `enabled` write does, so the two secret writes fire the SAME `mcp.reload` — next `mcp.list` and next run read the
 * store — and never a second reload path of their own.
 */
describe('mcp.setSecret / mcp.unsetSecret — the write goes through the service, the answer is masked, the reload follows (REQ-MCP-110/111)', () => {
  it('relays the store to the workspace service with the named scope and answers with the service\'s masked confirmation alone', async () => {
    const service = fakeService(() => ({ kind: 'mcp.secretWritten', server: 'web_search', key: 'ROTARIS_SEARCH_API_KEY', scope: 'Workspace', masked: '***', removed: false }));
    const host = fakeRunHost(() => ({ kind: 'ack' }));
    const out = await facet(host, service)['mcp.setSecret']({ kind: 'mcp.setSecret', server: 'web_search', key: 'ROTARIS_SEARCH_API_KEY', value: 'sk-live' }, windowOn('ws-7'));
    expect(out).toEqual({ ok: true, value: { kind: 'mcp.secretWritten', server: 'web_search', key: 'ROTARIS_SEARCH_API_KEY', scope: 'Workspace', masked: '***', removed: false } });
    // The value travels inward; nothing about it comes back and no line holds it.
    expect(service.asked).toEqual([{ kind: 'mcp.setSecret', workspaceRoot: canonicalPath('D:/work'), server: 'web_search', key: 'ROTARIS_SEARCH_API_KEY', value: 'sk-live' }]);
    expect(JSON.stringify(out)).not.toContain('sk-live');
    // The successful write is followed by the one existing reload seam, exactly once.
    expect(host.asked).toEqual([{ kind: 'mcp.reload', workspaceId: 'ws-7' }]);
  });

  it('names the global scope when the surface chose it, and omits the field when it did not (REQ-CONFIG-463)', async () => {
    const service = fakeService(() => ({ kind: 'mcp.secretWritten', server: 's', key: 'K', scope: 'Global', masked: '***', removed: false }));
    const host = fakeRunHost(() => ({ kind: 'ack' }));
    const commands = facet(host, service);
    await commands['mcp.setSecret']({ kind: 'mcp.setSecret', server: 's', key: 'K', value: 'v', scope: 'global' }, windowOn('ws-7'));
    await commands['mcp.setSecret']({ kind: 'mcp.setSecret', server: 's', key: 'K', value: 'v' }, windowOn('ws-7'));
    expect(service.asked[0]).toMatchObject({ scope: 'global' });
    expect(Object.hasOwn(service.asked[1]!, 'scope')).toBe(false);
  });

  it('raises the refusal the service sent and does NOT reload after it — one reason: a failed write still fires the reload', async () => {
    const service = fakeService(() => ({ kind: 'refused', code: 'mcp.secret.empty-value', headline: 'The secret could not be stored', detail: '/ws/.rotaris/secrets.yaml: the value is empty' }));
    const host = fakeRunHost(() => ({ kind: 'ack' }));
    const lines: string[] = [];
    const out = await facet(host, service, lines)['mcp.setSecret']({ kind: 'mcp.setSecret', server: 's', key: 'K', value: '' }, windowOn('ws-7'));
    expect(out).toEqual({ ok: false, code: 'mcp.secret.empty-value', headline: 'The secret could not be stored', detail: 'The secret could not be stored: /ws/.rotaris/secrets.yaml: the value is empty' });
    expect(lines.some((l) => l.startsWith('notice:error:The secret could not be stored'))).toBe(true);
    // The reload is for a SUCCESSFUL write only: nothing was written, so nothing is stale.
    expect(host.asked).toEqual([]);
  });

  it('deletes through the service and carries the not-found answer as a success with no mask, without a reload (REQ-CONFIG-217)', async () => {
    const service = fakeService(() => ({ kind: 'mcp.secretWritten', server: 's', key: 'K', scope: 'Workspace', masked: null, removed: false }));
    const host = fakeRunHost(() => ({ kind: 'ack' }));
    const out = await facet(host, service)['mcp.unsetSecret']({ kind: 'mcp.unsetSecret', server: 's', key: 'K' }, windowOn('ws-7'));
    expect(out).toEqual({ ok: true, value: { kind: 'mcp.secretWritten', server: 's', key: 'K', scope: 'Workspace', masked: null, removed: false } });
    // Nothing was written, so nothing is stale: no reload is asked for.
    expect(host.asked).toEqual([]);
  });

  it('a delete that removed the key DOES reload, like a set — one reason: the change-based trigger drops the removed case', async () => {
    const service = fakeService(() => ({ kind: 'mcp.secretWritten', server: 's', key: 'K', scope: 'Workspace', masked: '***', removed: true }));
    const host = fakeRunHost(() => ({ kind: 'ack' }));
    await facet(host, service)['mcp.unsetSecret']({ kind: 'mcp.unsetSecret', server: 's', key: 'K' }, windowOn('ws-7'));
    expect(host.asked).toEqual([{ kind: 'mcp.reload', workspaceId: 'ws-7' }]);
  });

  it('refuses before it asks when no workspace is open, or when the service for it is not running', async () => {
    const host = fakeRunHost(() => ({ kind: 'ack' }));
    const service = fakeService(() => ({ kind: 'ack' }));
    const commands = facet(host, service);
    expect(await commands['mcp.setSecret']({ kind: 'mcp.setSecret', server: 's', key: 'K', value: 'v' }, windowOn(null))).toMatchObject({ ok: false, code: 'workspace.none' });
    const other = mcpCommands({ log: () => undefined, raiseNotice: () => undefined, runHost: host.link, services: new Map() });
    expect(await other['mcp.unsetSecret']({ kind: 'mcp.unsetSecret', server: 's', key: 'K' }, windowOn('ws-7'))).toMatchObject({ ok: false, code: 'workspace.none' });
    expect(service.asked).toEqual([]);
    expect(host.asked).toEqual([]);
  });
});
