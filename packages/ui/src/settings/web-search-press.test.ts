import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CommandOutcome, CommandRequest, McpHealth } from '@rotaris/contracts';
import {
  bindWebSearchSetup, pressCheckWebSearch, pressDeleteWebSearchKey, pressGetWebSearchKey, pressOpenWebSearchFile, pressStoreWebSearchKey, webSearchPreset,
  EMPTY_KEY_REFUSAL, WEB_SEARCH_KEY_VARIABLE, WEB_SEARCH_SERVER,
} from './web-search-setup.js';

/**
 * THE WIRING — the command kinds a press of the guided card SENDS (REQ-MCP-110/111 with REQ-MCP-092, REQ-CHAT-076,
 * REQ-CONFIG-437). A helper-level case is not enough by itself; this drives the same handler set the card is handed
 * (`bindWebSearchSetup`, which is what `useMcp` spreads into the props) and asserts each press's request, its order and
 * its re-read. Each case states the ONE reason it can fail for.
 */
const recorder = (answers: (req: CommandRequest) => CommandOutcome) => {
  const sent: CommandRequest[] = [];
  let reads = 0;
  const deps = { command: async (req: CommandRequest) => { sent.push(req); return answers(req); }, read: async () => { reads += 1; return { ok: true as const }; } };
  return { deps, sent, reads: () => reads };
};
const masked = (scope: 'Workspace' | 'Global' = 'Workspace') => ({ ok: true as const, value: { server: WEB_SEARCH_SERVER, key: WEB_SEARCH_KEY_VARIABLE, scope, masked: '***', removed: false } });

describe('the presses the guided card sends (REQ-MCP-110/111)', () => {
  it('Store the key sends one mcp.setSecret with the card\'s server, the key variable, the value INWARD and the chosen scope, then re-reads — fails if the server, the key name, the scope or the value does not cross exactly as REQ-MCP-111 and REQ-CONFIG-463 fix them', async () => {
    const { deps, sent, reads } = recorder(() => masked());
    const r = await pressStoreWebSearchKey(deps, 'sk-live-123', 'workspace');
    expect(r.ok).toBe(true);
    expect(r.ok === true && r.refreshFailure).toBeNull();
    expect(sent).toEqual([{ kind: 'mcp.setSecret', server: WEB_SEARCH_SERVER, key: WEB_SEARCH_KEY_VARIABLE, value: 'sk-live-123', scope: 'workspace' }]);
    expect(reads()).toBe(1);
  });

  it('an empty value is refused HERE and sends nothing (REQ-MCP-084/110) — fails if an empty store reaches main or the refusal is not the fixed sentence', async () => {
    const { deps, sent, reads } = recorder(() => masked());
    const r = await pressStoreWebSearchKey(deps, '', 'workspace');
    expect(r).toEqual({ ok: false, message: EMPTY_KEY_REFUSAL });
    expect(sent).toEqual([]);
    expect(reads()).toBe(0);
  });

  it('a refused write keeps main\'s own words, sends no re-read and no second command — fails if a refusal is swallowed, re-read anyway, or retried', async () => {
    const { deps, sent, reads } = recorder(() => ({ ok: false, code: 'mcp.secret.empty-value', headline: 'The secret could not be stored', detail: '/ws/.rotaris/secrets.yaml: the value is empty' }));
    const r = await pressStoreWebSearchKey(deps, 'x', 'workspace');
    expect(r).toEqual({ ok: false, message: '/ws/.rotaris/secrets.yaml: the value is empty' });
    expect(sent.map((s) => s.kind)).toEqual(['mcp.setSecret']);
    expect(reads()).toBe(0);
  });

  it('a rejected re-read after a STANDING write is answered as words, never a rejection (round-2 Major 2): the outcome travels, the failure travels beside it, and the press resolves — fails if the helper awaits `deps.read()` unguarded, which would strand the card\'s in-flight state', async () => {
    const sent: CommandRequest[] = [];
    const deps = { command: async (req: CommandRequest) => { sent.push(req); return masked(); }, read: async () => { throw new Error('Render frame was disposed'); } };
    let rejected: unknown;
    let r: Awaited<ReturnType<typeof pressStoreWebSearchKey>> | undefined;
    try { r = await pressStoreWebSearchKey(deps, 'sk-live-123', 'workspace'); } catch (e) { rejected = e; }
    expect(rejected).toBeUndefined();
    expect(r?.ok).toBe(true);
    expect(r?.ok === true && r.outcome.masked).toBe('***');
    expect(r?.ok === true && r.refreshFailure).toBe('Render frame was disposed');
    expect(sent).toHaveLength(1);
    // The delete shares the shape: its re-read is total too.
    const del = await pressDeleteWebSearchKey(deps, 'workspace');
    expect(del.ok).toBe(true);
    expect(del.ok === true && del.refreshFailure).toBe('Render frame was disposed');
  });

  it('a refused re-read does not throw but is not swallowed either: the resolved {ok:false} travels as words to refreshFailure (round-3 Minor) — fails if the helper reads only a THROWN failure and reports a stale view as refreshed', async () => {
    const sent: CommandRequest[] = [];
    const deps = { command: async (req: CommandRequest) => { sent.push(req); return masked(); }, read: async () => ({ ok: false as const, message: 'Open a workspace first' }) };
    const r = await pressStoreWebSearchKey(deps, 'sk-live-123', 'workspace');
    expect(r.ok).toBe(true);
    expect(r.ok === true && r.outcome.masked).toBe('***');
    expect(r.ok === true && r.refreshFailure).toBe('Open a workspace first');
    // The delete shares the shape: its re-read observes its outcome too.
    const del = await pressDeleteWebSearchKey(deps, 'workspace');
    expect(del.ok).toBe(true);
    expect(del.ok === true && del.refreshFailure).toBe('Open a workspace first');
    expect(sent).toHaveLength(2);
  });

  it('Delete the stored key sends one mcp.unsetSecret with the scope and re-reads — fails if the delete uses setSecret, names another scope, or leaves the listing stale', async () => {
    const { deps, sent, reads } = recorder(() => masked('Global'));
    const r = await pressDeleteWebSearchKey(deps, 'global');
    expect(r.ok).toBe(true);
    expect(sent).toEqual([{ kind: 'mcp.unsetSecret', server: WEB_SEARCH_SERVER, key: WEB_SEARCH_KEY_VARIABLE, scope: 'global' }]);
    expect(reads()).toBe(1);
  });

  it('Get a key sends the EXISTING shell.openExternal with the preset\'s page, and nothing when the preset names none (REQ-CHAT-076) — fails if a deep link bypasses the one guarded opener or a null page is still sent', async () => {
    const { deps, sent } = recorder(() => ({ ok: true, value: {} }));
    const tavily = webSearchPreset('tavily')!;
    expect(await pressGetWebSearchKey(deps, tavily)).toEqual({ ok: true });
    expect(sent).toEqual([{ kind: 'shell.openExternal', url: tavily.keyPage }]);
    sent.length = 0;
    const searx = webSearchPreset('searxng')!;
    const r = await pressGetWebSearchKey(deps, searx);
    expect(r.ok).toBe(false);
    expect(sent).toEqual([]);
  });

  it('Open the file sends shell.openConfigFile and carries no path (REQ-CONFIG-350/464/437) — fails if the renderer names a path or reaches another opener', async () => {
    const { deps, sent } = recorder(() => ({ ok: true, value: { path: '/ws/.rotaris/agents.yaml' } }));
    expect(await pressOpenWebSearchFile(deps)).toEqual({ ok: true });
    expect(sent).toEqual([{ kind: 'shell.openConfigFile' }]);
  });

  it('Check status sends the EXISTING single-server probe with the server\'s name (REQ-MCP-092) — fails if it probes every server or names none', async () => {
    const { deps, sent } = recorder(() => ({ ok: true, value: [{ name: WEB_SEARCH_SERVER, health: { state: 'healthy', toolCount: 3 } }] }));
    expect(await pressCheckWebSearch(deps)).toEqual({ state: 'healthy', toolCount: 3 });
    expect(sent).toEqual([{ kind: 'mcp.probe', name: WEB_SEARCH_SERVER }]);
  });

  it('a probe refusal answers unreachable with the refusal\'s own detail (REQ-CONFIG-353) — fails if a refused probe is thrown or answered healthy', async () => {
    const { deps } = recorder(() => ({ ok: false, code: 'mcp.unreachable', headline: 'The MCP server could not be probed', detail: 'connect ECONNREFUSED' }));
    expect(await pressCheckWebSearch(deps)).toEqual({ state: 'unreachable', detail: 'connect ECONNREFUSED' });
  });

  it('the handler set the card is handed is exactly these five presses (what useMcp spreads in) — fails if the card gains a press this set does not carry, or the set gains one the card has no control for', async () => {
    const { deps, sent } = recorder((req) => req.kind === 'mcp.probe' ? { ok: true, value: [] } : masked());
    const handlers = bindWebSearchSetup(deps);
    expect(Object.keys(handlers).sort()).toEqual(['onDeleteKey', 'onGetKey', 'onOpenFile', 'onProbe', 'onStoreKey']);
    await handlers.onOpenFile();
    await handlers.onGetKey(webSearchPreset('tavily')!);
    await handlers.onStoreKey('k', 'workspace');
    await handlers.onDeleteKey('workspace');
    await handlers.onProbe();
    expect(sent.map((s) => s.kind)).toEqual(['shell.openConfigFile', 'shell.openExternal', 'mcp.setSecret', 'mcp.unsetSecret', 'mcp.probe']);

    // The card's own source draws no control outside this set: each data-websearch action maps to one handler above.
    const source = readFileSync(new URL('./McpSettings.tsx', import.meta.url), 'utf8');
    expect(source).toContain('props.webSearchSetup.onStoreKey(');
    expect(source).toContain('props.webSearchSetup.onDeleteKey(');
    expect(source).toContain('props.webSearchSetup.onOpenFile()');
    expect(source).toContain('props.webSearchSetup.onGetKey(');
    expect(source).toContain('props.webSearchSetup.onProbe()');
    // REQ-CONFIG-350/464: the card sends no write of the declaration — the only commands it reaches are the five above.
    expect(source).not.toContain("'config.setField'");
    expect(source).not.toContain("'mcp.setEnabled'");
  });

  it('a throwing bridge is answered as a refusal, never an unhandled rejection (ADR-0019) — fails if a gone channel rejects out of a click handler', async () => {
    const deps = { command: async (): Promise<CommandOutcome> => { throw new Error('Render frame was disposed'); }, read: async () => ({ ok: true as const }) };
    const r: McpHealth = await pressCheckWebSearch(deps);
    expect(r.state).toBe('unreachable');
    const stored = await pressStoreWebSearchKey(deps, 'k', 'workspace');
    expect(stored.ok).toBe(false);
  });
});
