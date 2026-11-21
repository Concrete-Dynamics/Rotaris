import { describe, expect, it } from 'vitest';
import type { CommandOutcome, CommandRequest, McpServerRow } from '@rotaris/contracts';
import {
  bindWebSearchSetup, pressUseWebSearchProvider, webSearchChosenUrl, pressCheckWebSearch, pressDeleteWebSearchKey, pressEnableAndTest, pressGetWebSearchKey, pressOpenWebSearchFile, pressSaveAndTest,
  webSearchPreset, EMPTY_KEY_REFUSAL, WEB_SEARCH_KEY_VARIABLE, WEB_SEARCH_SERVER,
} from './web-search-setup.js';

/**
 * THE PRESSES — what each act of the web search panel SENDS, in order (REQ-MCP-110/111, REQ-MCP-092, REQ-CHAT-076,
 * REQ-CONFIG-437, PD-CONFIG-006 revision 2). This drives the handler set the panel is handed (`bindWebSearchSetup`, what
 * `useMcp` spreads into the props). Each case states the ONE reason it can fail for.
 */
const row = (over: Partial<McpServerRow> = {}): McpServerRow => ({
  name: WEB_SEARCH_SERVER, type: 'http', line: 'https://mcp.tavily.com/mcp/?tavilyApiKey=***', origin: 'default',
  enabled: false, overridden: false, available: true, availabilityDetail: '', unresolved: [], expectedKeys: [], ...over,
});
const recorder = (answers: (req: CommandRequest) => CommandOutcome, listed: McpServerRow | null = row()) => {
  const log: string[] = [];
  const sent: CommandRequest[] = [];
  const enabled: McpServerRow[] = [];
  const deps = {
    command: async (req: CommandRequest) => {
      sent.push(req); log.push(req.kind);
      if (req.kind === 'mcp.list') return { ok: true as const, value: { configFile: '/ws/agents.yaml', rows: listed === null ? [] : [listed] } };
      return answers(req);
    },
    read: async () => { log.push('read'); return { ok: true as const }; },
    enable: async (r: McpServerRow) => { log.push('enable'); enabled.push(r); return { ok: true, message: 'web_search enabled' }; },
  };
  return { deps, sent, log, enabled };
};
const stored = { ok: true as const, value: { server: WEB_SEARCH_SERVER, key: WEB_SEARCH_KEY_VARIABLE, scope: 'Workspace', masked: '***', removed: false } };
const healthy = { ok: true as const, value: [{ name: WEB_SEARCH_SERVER, health: { state: 'healthy', toolCount: 2 } }] };
const answer = (req: CommandRequest): CommandOutcome => req.kind === 'mcp.setSecret' || req.kind === 'mcp.unsetSecret' ? stored : req.kind === 'mcp.probe' ? healthy : { ok: true, value: null };

describe('Save and test (REQ-MCP-111 with PD-CONFIG-006 revision 2)', () => {
  it('stores the key, re-reads, lists afresh, switches the configured-off entry on through the row\'s own press, probes, and re-reads — fails if a step is skipped or reordered', async () => {
    const r = recorder(answer);
    const reply = await pressSaveAndTest(r.deps, ' tvly-123 ', 'global');
    expect(r.log).toEqual(['mcp.setSecret', 'read', 'mcp.list', 'enable', 'mcp.probe', 'read']);
    expect(r.sent[0]).toEqual({ kind: 'mcp.setSecret', server: WEB_SEARCH_SERVER, key: WEB_SEARCH_KEY_VARIABLE, value: 'tvly-123', scope: 'global' });
    expect(r.enabled[0]?.name).toBe(WEB_SEARCH_SERVER);
    expect(reply).toEqual({ ok: true, lines: ['Key stored (Workspace), value ***.', 'Switched on: enabled: true is written to the configuration file.', 'The server answered: Healthy · 2 tools. The provider checks the key itself when an agent first searches.'], health: { state: 'healthy', toolCount: 2 }, refreshFailure: null });
  });

  it('an entry already on is not written — fails if a stored key rewrites enabled on a server that is on', async () => {
    const r = recorder(answer, row({ enabled: true }));
    await pressSaveAndTest(r.deps, 'k', 'workspace');
    expect(r.log).toEqual(['mcp.setSecret', 'read', 'mcp.list', 'mcp.probe', 'read']);
  });

  it('an entry switched off for this session is left as it is and not probed — fails if the panel overrides the row\'s session switch', async () => {
    const r = recorder(answer, row({ enabled: true, overridden: true }));
    const reply = await pressSaveAndTest(r.deps, 'k', 'workspace');
    expect(r.log).not.toContain('enable');
    expect(r.log).not.toContain('mcp.probe');
    expect(reply.ok && reply.lines.at(-1)).toContain('switched off for this session');
  });

  it('a url the key does not resolve is reported and nothing is enabled or probed (REQ-CONFIG-225) — fails if a broken entry is switched on', async () => {
    const r = recorder(answer, row({ unresolved: ['OTHER'] }));
    const reply = await pressSaveAndTest(r.deps, 'k', 'workspace');
    expect(r.log).toEqual(['mcp.setSecret', 'read', 'mcp.list', 'read']);
    expect(reply.ok).toBe(false);
    expect(!reply.ok && reply.message).toContain('${OTHER}');
    expect(reply.lines).toEqual(['Key stored (Workspace), value ***.']);
  });

  it('an empty or blank value is refused here and sends nothing (REQ-MCP-084/110) — fails if an empty store reaches main', async () => {
    const r = recorder(answer);
    expect(await pressSaveAndTest(r.deps, '   ', 'workspace')).toEqual({ ok: false, message: EMPTY_KEY_REFUSAL, lines: [] });
    expect(r.log).toEqual([]);
  });

  it('a refused write keeps main\'s words and goes no further — fails if a refused store is followed by an enable', async () => {
    const r = recorder((req) => req.kind === 'mcp.setSecret' ? { ok: false, code: 'x', headline: 'Refused', detail: 'disk full' } : answer(req));
    expect(await pressSaveAndTest(r.deps, 'k', 'workspace')).toEqual({ ok: false, message: 'disk full', lines: [] });
    expect(r.log).toEqual(['mcp.setSecret']);
  });

  it('a refused enable is reported with what already stood — fails if the stored key is not said beside the refusal', async () => {
    const r = recorder(answer);
    const deps = { ...r.deps, enable: async () => ({ ok: false, message: 'the file is read-only' }) };
    const reply = await pressSaveAndTest(deps, 'k', 'workspace');
    expect(reply).toEqual({ ok: false, message: 'the file is read-only', lines: ['Key stored (Workspace), value ***.'] });
  });

  it('a re-read that fails after a standing write travels as refreshFailure, never as a rejection — fails if the stale view goes unsaid', async () => {
    const r = recorder(answer);
    const deps = { ...r.deps, read: async () => ({ ok: false as const, message: 'the listing timed out' }) };
    const reply = await pressSaveAndTest(deps, 'k', 'workspace');
    expect(reply.ok && reply.refreshFailure).toBe('the listing timed out');
  });
});

describe('the other presses', () => {
  it('Turn on and test is the enable step and the probe, without a store — fails if it writes a secret', async () => {
    const r = recorder(answer);
    const reply = await pressEnableAndTest(r.deps);
    expect(r.log).toEqual(['mcp.list', 'enable', 'mcp.probe', 'read']);
    expect(reply.ok).toBe(true);
  });

  it('Delete sends one mcp.unsetSecret in the scope named and re-reads — fails if it names another scope', async () => {
    const r = recorder(answer);
    const reply = await pressDeleteWebSearchKey(r.deps, 'global');
    expect(r.sent).toEqual([{ kind: 'mcp.unsetSecret', server: WEB_SEARCH_SERVER, key: WEB_SEARCH_KEY_VARIABLE, scope: 'global' }]);
    expect(r.log).toEqual(['mcp.unsetSecret', 'read']);
    expect(reply.ok).toBe(true);
  });

  it('Test sends the single-server probe, and a refusal answers Unreachable with its words (REQ-MCP-092, REQ-CONFIG-353) — fails if a refused probe reads healthy', async () => {
    const r = recorder(answer);
    expect(await pressCheckWebSearch(r.deps)).toEqual({ state: 'healthy', toolCount: 2 });
    expect(r.sent).toEqual([{ kind: 'mcp.probe', name: WEB_SEARCH_SERVER }]);
    const refused = recorder(() => ({ ok: false, code: 'x', headline: 'No', detail: 'gone' }));
    expect(await pressCheckWebSearch(refused.deps)).toEqual({ state: 'unreachable', detail: 'gone' });
  });

  it('Get a key opens the provider\'s page through shell.openExternal, and nothing for a provider without one (REQ-CHAT-076) — fails if a page is opened another way', async () => {
    const r = recorder(answer);
    await pressGetWebSearchKey(r.deps, webSearchPreset('tavily')!);
    expect(r.sent).toEqual([{ kind: 'shell.openExternal', url: 'https://app.tavily.com/home' }]);
    expect((await pressGetWebSearchKey(r.deps, webSearchPreset('exa')!)).ok).toBe(false);
    expect(r.sent).toHaveLength(1);
  });

  it('Open the file sends shell.openConfigFile and names no path (REQ-CONFIG-437) — fails if the renderer names a path', async () => {
    const r = recorder(answer);
    await pressOpenWebSearchFile(r.deps);
    expect(r.sent).toEqual([{ kind: 'shell.openConfigFile' }]);
  });

  it('a throwing bridge is answered as a refusal, never an unhandled rejection (ADR-0019) — fails if a gone channel rejects out of a click handler', async () => {
    const deps = { command: async () => { throw new Error('channel closed'); }, read: async () => ({ ok: true as const }), enable: async () => ({ ok: true, message: '' }) };
    expect(await pressSaveAndTest(deps, 'k', 'workspace')).toEqual({ ok: false, message: 'channel closed', lines: [] });
    expect(await pressCheckWebSearch(deps)).toEqual({ state: 'unreachable', detail: 'channel closed' });
  });

  it('the handler set the panel is handed is exactly these seven presses — fails if a press is added or dropped without the panel knowing', () => {
    const set = bindWebSearchSetup(recorder(answer).deps);
    expect(Object.keys(set).sort()).toEqual(['onDeleteKey', 'onEnableAndTest', 'onGetKey', 'onOpenFile', 'onProbe', 'onSaveAndTest', 'onUseProvider']);
  });
});

describe('Use a provider (PD-CONFIG-013)', () => {
  it('writes mcp_servers.web_search.url — that field alone — in the scope, through config.setField, then re-reads — fails if it writes a key, another field or another entry', async () => {
    const r = recorder(answer);
    const reply = await pressUseWebSearchProvider(r.deps, webSearchPreset('linkup')!, '', 'workspace');
    expect(r.sent).toEqual([{ kind: 'config.setField', scope: 'workspace', patch: { mcp_servers: { web_search: { url: `https://mcp.linkup.so/mcp?apiKey=\${${WEB_SEARCH_KEY_VARIABLE}}` } } } }]);
    expect(r.log).toEqual(['config.setField', 'read']);
    expect(reply.ok && reply.lines[0]).toBe('Web search now reaches Linkup: its address is written to the Workspace configuration file.');
  });

  it('your own server writes the typed address, trimmed, and names its host — fails if the typed address is altered', async () => {
    const r = recorder(answer);
    const reply = await pressUseWebSearchProvider(r.deps, webSearchPreset('own')!, '  https://search.example.org/mcp?key=${ROTARIS_SEARCH_API_KEY} ', 'global');
    expect(r.sent[0]).toEqual({ kind: 'config.setField', scope: 'global', patch: { mcp_servers: { web_search: { url: 'https://search.example.org/mcp?key=${ROTARIS_SEARCH_API_KEY}' } } } });
    expect(reply.ok && reply.lines[0]).toContain('your server (search.example.org)');
  });

  it('an address that is empty, not a url, not http(s) or the template\'s own placeholder host is refused here and nothing is sent — fails if a broken address reaches the file', async () => {
    const own = webSearchPreset('own')!;
    for (const typed of ['', 'not a url', 'ftp://x/mcp', 'https://<your-search-server>/mcp', 'file:///etc/passwd']) {
      expect(webSearchChosenUrl(own, typed).ok).toBe(false);
    }
    const r = recorder(answer);
    expect((await pressUseWebSearchProvider(r.deps, own, 'ftp://x', 'workspace')).ok).toBe(false);
    expect(r.sent).toEqual([]);
  });

  it('a refused write keeps main\'s words — fails if a refused write is reported as done', async () => {
    const r = recorder(() => ({ ok: false, code: 'config.write-failed', headline: 'The setting could not be written', detail: 'agents.yaml: read-only' }));
    expect(await pressUseWebSearchProvider(r.deps, webSearchPreset('exa')!, '', 'workspace')).toEqual({ ok: false, message: 'agents.yaml: read-only', lines: [] });
  });
});
