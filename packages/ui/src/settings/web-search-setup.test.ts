import { describe, expect, it } from 'vitest';
import type { McpServerRow } from '@rotaris/contracts';
import {
  deletedKeySentence, mcpHealthText, storedKeySentence, webSearchFileLine, webSearchHost, webSearchKeyApplies, webSearchOtherTransport, webSearchPreset,
  webSearchProbeBasis, webSearchProbeSentence, webSearchProviderOf, webSearchRowSetupVisible, webSearchSituation, webSearchStanza, webSearchStatus,
  webSearchStoredKey, webSearchUnresolvedNote,
  WEB_SEARCH_KEY_VARIABLE, WEB_SEARCH_PRESETS, WEB_SEARCH_SERVER,
} from './web-search-setup.js';

/**
 * The web search panel's pure half (R-119): the provider table, the stanza, the situation and the status words, and the
 * sentences — each case says the one reason it can fail for.
 */
const KEY = `\${${WEB_SEARCH_KEY_VARIABLE}}`;
const row = (over: Partial<McpServerRow> = {}): McpServerRow => ({
  name: WEB_SEARCH_SERVER, type: 'http', line: `https://mcp.tavily.com/mcp/?tavilyApiKey=${KEY}`, origin: 'default',
  enabled: false, overridden: false, available: false, availabilityDetail: '', unresolved: [WEB_SEARCH_KEY_VARIABLE], expectedKeys: [], ...over,
});
const keyRow = { server: WEB_SEARCH_SERVER, key: WEB_SEARCH_KEY_VARIABLE, masked: '***', scope: 'Workspace' as const };
const facts = (over: Partial<Parameters<typeof webSearchSituation>[0]> = {}) => ({ unavailable: null, row: row(), storedKey: null, health: { state: 'unknown' as const }, ...over });

describe('the provider table (REQ-CONFIG-181 leaves the vendor to the implementation)', () => {
  it('Tavily comes first and is the shipped default\'s url exactly — fails if the panel names another provider than the one the entry ships with', () => {
    expect(WEB_SEARCH_PRESETS[0]?.id).toBe('tavily');
    expect(WEB_SEARCH_PRESETS[0]?.url).toBe(`https://mcp.tavily.com/mcp/?tavilyApiKey=${KEY}`);
  });

  it('every provider that needs a key carries the placeholder in its url, and none puts a key in a header — fails if a preset would leave the key unresolvable (REQ-MCP-088)', () => {
    for (const p of WEB_SEARCH_PRESETS) {
      expect(p.url.includes(KEY)).toBe(p.needsKey);
      expect(p.description.endsWith('.')).toBe(true);
    }
  });

  it('a configured entry is recognised by its host, through the mask — fails if a masked key makes the url unreadable', () => {
    expect(webSearchHost('https://mcp.tavily.com/mcp/?tavilyApiKey=***')).toBe('mcp.tavily.com');
    expect(webSearchProviderOf(row({ line: 'https://mcp.tavily.com/mcp/?tavilyApiKey=***' }))?.id).toBe('tavily');
    expect(webSearchProviderOf(row({ line: 'https://mcp.linkup.so/mcp?apiKey=***' }))?.id).toBe('linkup');
    expect(webSearchProviderOf(row({ line: 'https://mcp.exa.ai/mcp' }))?.id).toBe('exa');
    expect(webSearchProviderOf(row({ line: 'https://search.example.org/mcp' }))).toBeNull();
    expect(webSearchHost('npx -y something')).toBeNull();
  });

  it('an unknown id answers null — fails if a stale selection draws a provider that does not exist', () => {
    expect(webSearchPreset('nope')).toBeNull();
    expect(webSearchPreset(null)).toBeNull();
  });
});

describe('the stanza "Use a different provider" hands over (REQ-CONFIG-350/464: text for the user\'s own edit)', () => {
  it('is exactly the web_search entry on http with the timeout and enabled: true — fails if the stanza drifts from REQ-CONFIG-181', () => {
    const s = webSearchStanza(webSearchPreset('linkup')!);
    expect(s.text).toBe(`mcp_servers:\n  web_search:\n    type: http\n    url: https://mcp.linkup.so/mcp?apiKey=${KEY}\n    request_timeout: 600\n    enabled: true\n`);
    expect(s.note).toBeNull();
  });

  it('a provider whose host the user supplies says to replace it — fails if the placeholder host goes out unexplained', () => {
    expect(webSearchStanza(webSearchPreset('own')!).note).toContain('Replace the host');
  });
});

describe('the situation the panel renders from', () => {
  it('walks the shipped default from needing a key to ready — fails if any step of the one path is misread', () => {
    expect(webSearchSituation(facts())).toBe('needs-key');
    // The key resolves the url; the entry ships enabled: false.
    expect(webSearchSituation(facts({ row: row({ unresolved: [], available: true }), storedKey: keyRow }))).toBe('off');
    expect(webSearchSituation(facts({ row: row({ unresolved: [], available: true, enabled: true }), storedKey: keyRow }))).toBe('untested');
    expect(webSearchSituation(facts({ row: row({ unresolved: [], available: true, enabled: true }), storedKey: keyRow, health: { state: 'healthy', toolCount: 2 } }))).toBe('ready');
    expect(webSearchSituation(facts({ row: row({ unresolved: [], available: true, enabled: true }), storedKey: keyRow, health: { state: 'unreachable' } }))).toBe('failing');
  });

  it('unavailable, no entry and another transport win before anything else — fails if the panel offers the key over a state it cannot act on', () => {
    expect(webSearchSituation(facts({ unavailable: 'no service' }))).toBe('unavailable');
    expect(webSearchSituation(facts({ row: null }))).toBe('no-entry');
    expect(webSearchSituation(facts({ row: row({ type: 'stdio' }) }))).toBe('other-transport');
  });

  it('a stored key that leaves a placeholder unresolved is `unresolved`, not `needs-key` — fails if the panel asks again for a key it holds', () => {
    expect(webSearchSituation(facts({ storedKey: keyRow }))).toBe('unresolved');
    expect(webSearchSituation(facts({ row: row({ unresolved: ['OTHER'] }) }))).toBe('unresolved');
  });

  it('an entry switched off for this session is `off` — fails if a session override reads as on', () => {
    expect(webSearchSituation(facts({ row: row({ unresolved: [], available: true, enabled: true, overridden: true }), storedKey: keyRow }))).toBe('off');
  });

  it('every situation the main panel draws states its status in words (REQ-SHELL-149) — fails if a state is told by the dot alone', () => {
    for (const s of ['needs-key', 'unresolved', 'off', 'untested', 'failing', 'ready'] as const) expect(webSearchStatus(s, { state: 'healthy', toolCount: 1 }).text).not.toBe('');
    expect(webSearchStatus('ready', { state: 'healthy', toolCount: 3 })).toEqual({ text: 'Healthy · 3 tools', dot: 'healthy' });
    expect(webSearchStatus('untested', { state: 'checking' }).dot).toBe('checking');
  });
});

describe('whether the key field applies, and the row\'s way in', () => {
  it('applies to an http entry that takes the key in its url, or holds one; not to a keyless one or another transport — fails if Exa asks for a key', () => {
    expect(webSearchKeyApplies(row(), null)).toBe(true);
    expect(webSearchKeyApplies(row({ unresolved: [], line: 'https://mcp.tavily.com/mcp/?tavilyApiKey=***' }), keyRow)).toBe(true);
    expect(webSearchKeyApplies(row({ unresolved: [], line: 'https://mcp.exa.ai/mcp' }), null)).toBe(false);
    expect(webSearchKeyApplies(row({ unresolved: [], line: 'https://mcp.linkup.so/mcp?apiKey=***' }), null)).toBe(true);
    expect(webSearchKeyApplies(row({ type: 'stdio' }), null)).toBe(false);
  });

  it('the row offers "Add a key" only while its url waits on the key and none is stored — fails if a configured row keeps the offer', () => {
    expect(webSearchRowSetupVisible(row(), null)).toBe(true);
    expect(webSearchRowSetupVisible(row(), keyRow)).toBe(false);
    expect(webSearchRowSetupVisible(row({ unresolved: [] }), null)).toBe(false);
    expect(webSearchRowSetupVisible(row({ name: 'browser' }), null)).toBe(false);
  });
});

describe('the sentences (REQ-MCP-110/081, REQ-CONFIG-225/353/437)', () => {
  it('a store and a delete are said from the write\'s masked outcome — fails if a value could ever appear', () => {
    expect(storedKeySentence({ scope: 'Workspace', masked: '***' })).toBe('Key stored (Workspace), value ***.');
    expect(deletedKeySentence({ scope: 'Global', removed: true })).toBe('Key deleted from the Global scope.');
    expect(deletedKeySentence({ scope: 'Global', removed: false })).toContain('nothing changed');
  });

  it('the health words, the probe sentence, the file line, the unresolved note and the transport note — fails if one loses its subject', () => {
    expect(mcpHealthText({ state: 'healthy', toolCount: 1 })).toBe('Healthy · 1 tool');
    expect(webSearchProbeSentence({ state: 'unreachable' })).toContain('did not answer');
    expect(webSearchProbeSentence({ state: 'healthy', toolCount: 2 })).toBe('The server answered: Healthy · 2 tools.');
    // A probe lists tools and runs no search; Tavily answered Healthy to a made-up key (R-119), so a keyed Healthy says so.
    expect(webSearchProbeSentence({ state: 'healthy', toolCount: 2 }, true)).toContain('checks the key itself when an agent first searches');
    expect(webSearchFileLine('/ws/.rotaris/agents.yaml')).toBe('File: /ws/.rotaris/agents.yaml');
    expect(webSearchFileLine(null)).toContain('not read yet');
    expect(webSearchUnresolvedNote(['A'])).toContain('${A}');
    expect(webSearchOtherTransport('stdio')).toContain('stdio');
  });

  it('the stored key prefers the Workspace scope where both hold one (REQ-MCP-083) — fails if the Global key shadows the workspace\'s', () => {
    const view = { servers: [WEB_SEARCH_SERVER], rows: [{ ...keyRow, scope: 'Global' as const }, keyRow], expected: [], server: null };
    expect(webSearchStoredKey(view)?.scope).toBe('Workspace');
    expect(webSearchStoredKey(null)).toBeNull();
  });

  it('the probe basis moves with the entry and the key\'s scope but not with the mask — fails if a constant mask is read as evidence', () => {
    const a = webSearchProbeBasis(facts({ storedKey: keyRow }));
    expect(webSearchProbeBasis(facts({ storedKey: { ...keyRow, masked: '****' } }))).toBe(a);
    expect(webSearchProbeBasis(facts({ storedKey: { ...keyRow, scope: 'Global' } }))).not.toBe(a);
    expect(webSearchProbeBasis(facts({ storedKey: keyRow, row: row({ enabled: true }) }))).not.toBe(a);
  });
});
