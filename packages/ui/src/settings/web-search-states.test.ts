import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ConfigSnapshot, McpHealth, McpListing, McpSecretRow, McpSecretsView, McpServerRow } from '@rotaris/contracts';
import { McpSettings, type McpSettingsProps } from './McpSettings.js';
import { SettingsPageContext } from './page.js';
import { WEB_SEARCH_ABOUT, WEB_SEARCH_KEY_VARIABLE, WEB_SEARCH_SERVER } from './web-search-setup.js';

/**
 * THE WEB SEARCH PANEL'S STATES, rendered (R-118; `renderToStaticMarkup` as `skills-fatal.test.ts`). Each case asserts
 * what the state must show and what it must not, and states the one reason it can fail for. REQ-SHELL-149: each state is
 * text; REQ-MCP-110: the field never carries a stored value; REQ-CONFIG-424/478: with no service or a fatal load nothing
 * is pressable; §1.7: one filled control in every state.
 */
const KEY = `\${${WEB_SEARCH_KEY_VARIABLE}}`;
const row = (over: Partial<McpServerRow> = {}): McpServerRow => ({
  name: WEB_SEARCH_SERVER, type: 'http', line: `https://mcp.tavily.com/mcp/?tavilyApiKey=${KEY}`, origin: 'default',
  enabled: false, overridden: false, available: false, availabilityDetail: '', unresolved: [WEB_SEARCH_KEY_VARIABLE], expectedKeys: [], ...over,
});
/** The shipped default once its key is stored: the url resolves, the entry ships enabled: false. */
const keyed = (over: Partial<McpServerRow> = {}): McpServerRow => row({ line: 'https://mcp.tavily.com/mcp/?tavilyApiKey=***', unresolved: [], available: true, ...over });
const listing = (rows: McpServerRow[]): McpListing => ({ configFile: '/ws/.rotaris/agents.yaml', rows });
const keyRow = (scope: 'Workspace' | 'Global' = 'Workspace'): McpSecretRow => ({ server: WEB_SEARCH_SERVER, key: WEB_SEARCH_KEY_VARIABLE, masked: '***', scope });
const secrets = (rows: McpSecretRow[]): McpSecretsView => ({ servers: [WEB_SEARCH_SERVER], rows, expected: [], server: null });
const inert = async () => ({ ok: false as const, message: 'not pressed here', lines: [] });

const props = (over: Partial<McpSettingsProps> = {}): McpSettingsProps => ({
  listing: listing([row()]), loading: false, error: null, health: {}, probing: false,
  onRefresh: () => undefined, onProbeAll: async () => undefined,
  onToggle: async () => ({ ok: true, message: '' }),
  secrets: secrets([]), webSearchSecrets: secrets([]), onSecretsServer: () => undefined, setup: null,
  onSetupStart: async () => ({ ok: true, message: '' }), onSetupCancel: async () => undefined,
  webSearchSetup: {
    onSaveAndTest: inert, onEnableAndTest: inert, onUseProvider: inert,
    onDeleteKey: async () => ({ ok: false as const, message: 'not pressed here' }),
    onProbe: async () => ({ state: 'unknown' as const }),
    onOpenFile: async () => ({ ok: true as const }),
    onGetKey: async () => ({ ok: true as const }),
  },
  ...over,
});
const render = (over: Partial<McpSettingsProps> = {}): string => renderToStaticMarkup(createElement(McpSettings, props(over)));
const panel = (html: string): string => html.slice(html.indexOf('data-mcp-websearch-setup'), html.indexOf('data-mcp-setup'));
const health = (h: McpHealth): Record<string, McpHealth> => ({ [WEB_SEARCH_SERVER]: h });
const fills = (html: string): number => (panel(html).match(/btn-primary/g) ?? []).length;

describe('the web search panel, state by state', () => {
  it('the shipped default with no key: Tavily, a key link, an empty password field, Save and test as the one fill, "Needs a key" — fails if the first run asks for anything but the key', () => {
    const html = render();
    const p = panel(html);
    expect(p).toContain('data-websearch-situation="needs-key"');
    expect(p).toContain('data-websearch-provider="tavily"');
    expect(p).toContain('>Tavily<');
    expect(p).toContain('data-websearch-get-key');
    expect(p).toContain('Paste your key');
    expect(p).toContain('Save and test');
    expect(p).toContain('Needs a key');
    expect(fills(html)).toBe(1);
    expect(p).toMatch(/btn-primary[^"]*"[^>]*data-websearch-save/);
    // The stanza is not in front of the user: it waits behind its disclosure, closed.
    expect(p).toMatch(/<button[^>]*aria-expanded="false"[^>]*data-websearch-other-control/);
    expect(p).toMatch(/id="websearch-other"[^>]*hidden/);
  });

  it('a stored key on an entry still configured off: the mask, Replace and test, Delete, "Off", and Turn on and test as the one fill — fails if the panel implies the key alone turned search on', () => {
    const html = render({ listing: listing([keyed()]), webSearchSecrets: secrets([keyRow()]) });
    const p = panel(html);
    expect(p).toContain('data-websearch-situation="off"');
    expect(p).toContain('Stored in the Workspace scope, value <span class="mono" data-mask="true">***</span>');
    expect(p).toContain('Replace and test');
    expect(p).toContain('data-websearch-delete');
    expect(p).toContain('>Off<');
    expect(p).toContain('Turn on and test');
    expect(fills(html)).toBe(1);
    expect(p).toMatch(/btn-primary[^"]*"[^>]*data-websearch-enable/);
  });

  it('on and healthy: the health in words with the tool count, Test as the one fill — fails if a working panel keeps asking for setup', () => {
    const html = render({ listing: listing([keyed({ enabled: true })]), webSearchSecrets: secrets([keyRow()]), health: health({ state: 'healthy', toolCount: 3 }) });
    const p = panel(html);
    expect(p).toContain('data-websearch-situation="ready"');
    expect(p).toContain('Healthy · 3 tools');
    expect(fills(html)).toBe(1);
    expect(p).toMatch(/btn-primary[^"]*"[^>]*data-websearch-check/);
    expect(p).not.toContain('Needs a key');
  });

  it('unreachable: the status says so and the server\'s own detail is kept — fails if the failure is drawn by colour alone', () => {
    const p = panel(render({ listing: listing([keyed({ enabled: true })]), webSearchSecrets: secrets([keyRow()]), health: health({ state: 'unreachable', detail: '401 Unauthorized' }) }));
    expect(p).toContain('data-websearch-situation="failing"');
    expect(p).toContain('>Unreachable<');
    expect(p).toContain('401 Unauthorized');
  });

  it('a keyless provider (Exa) shows no key field and offers the test — fails if a provider that needs no key asks for one', () => {
    const p = panel(render({ listing: listing([row({ line: 'https://mcp.exa.ai/mcp', unresolved: [], available: true, enabled: true, origin: 'yaml' })]) }));
    expect(p).toContain('data-websearch-provider="exa"');
    expect(p).not.toContain('data-websearch-key-field');
    expect(p).toContain('data-websearch-check');
  });

  it('an entry pointing at a host the table does not know is "Your own server" and names its host — fails if an unknown endpoint is passed off as Tavily', () => {
    const p = panel(render({ listing: listing([row({ line: `https://search.example.org/mcp?key=${KEY}`, origin: 'yaml' })]) }));
    expect(p).toContain('data-websearch-provider="other"');
    expect(p).toContain('Your own server');
    expect(p).toContain('search.example.org');
    expect(p).not.toContain('data-websearch-get-key');
  });

  it('a stored key that leaves a placeholder unresolved says which and how to fix it (REQ-CONFIG-225) — fails if the panel asks again for a key it holds', () => {
    const p = panel(render({ listing: listing([row({ unresolved: ['OTHER_VAR'] })]), webSearchSecrets: secrets([keyRow()]) }));
    expect(p).toContain('data-websearch-situation="unresolved"');
    expect(p).toContain('${OTHER_VAR}');
    expect(p).not.toContain('Needs a key');
  });

  it('a session override reads as off for this session and points at the row\'s switch (REQ-MCP-115) — fails if the panel offers to override the row', () => {
    const p = panel(render({ listing: listing([keyed({ enabled: true, overridden: true })]), webSearchSecrets: secrets([keyRow()]) }));
    expect(p).toContain('switched off for this session');
    expect(p).not.toContain('data-websearch-enable');
  });

  it('another transport says the key field does not apply and draws none — fails if a stdio entry renders the key field', () => {
    const p = panel(render({ listing: listing([row({ type: 'stdio', line: 'npx -y some-search', unresolved: [] })]) }));
    expect(p).toContain('data-websearch-situation="other-transport"');
    expect(p).toContain('stdio server');
    expect(p).not.toContain('data-websearch-key-field');
  });

  it('a chooser filtered to another server does not blank the panel\'s stored key — fails if the panel reads the chooser\'s view', () => {
    const chooser: McpSecretsView = { servers: [WEB_SEARCH_SERVER, 'browser'], rows: [], expected: [], server: 'browser' };
    const p = panel(render({ listing: listing([keyed()]), secrets: chooser, webSearchSecrets: secrets([keyRow()]) }));
    expect(p).toContain('data-websearch-stored');
    expect(p).toContain('data-websearch-delete');
  });

  it('no web_search entry renders the empty state naming the file, with Open the file as its fill (REQ-CONFIG-437) — fails if the panel guides a server the file does not declare', () => {
    const html = render({ listing: listing([row({ name: 'browser', type: 'stdio' })]) });
    const p = panel(html);
    expect(p).toContain('data-websearch-situation="no-entry"');
    expect(p).toContain('No web_search entry is configured');
    expect(p).toContain('File: /ws/.rotaris/agents.yaml');
    expect(fills(html)).toBe(1);
    expect(p).not.toContain('data-websearch-key-field');
  });

  it('a fatal load draws the report and no controls (REQ-CONFIG-478) — fails if the panel offers the key over a configuration that did not load', () => {
    const fatal = { loadOk: false, fatal: '/w/.rotaris/agents.yaml: bad indentation', files: { workspace: '/w/.rotaris/agents.yaml', global: '/g/agents.yaml' } } as unknown as ConfigSnapshot;
    const p = panel(render({ fatal }));
    expect(p).toContain('data-websearch-situation="unavailable"');
    expect(p).toContain('bad indentation');
    expect(p).not.toContain('data-websearch-key-field');
    expect(p).not.toContain('<button');
  });

  it('no configuration service renders the refusal and no controls (REQ-CONFIG-424) — fails if the panel stays pressable while nothing can be written', () => {
    const p = panel(render({ error: 'Open a workspace first', listing: null }));
    expect(p).toContain('data-websearch-situation="unavailable"');
    expect(p).toContain('Open a workspace first');
    expect(p).not.toContain('<button');
  });

  it('the explanation is closed until asked for, and open with the page\'s "show every explanation" (PD-CONFIG-012 clause 4) — fails if the prose stands in front of the field', () => {
    const closed = panel(renderToStaticMarkup(createElement(SettingsPageContext.Provider, { value: { title: 'section', explain: false } }, createElement(McpSettings, props()))));
    expect(closed).toMatch(/<button[^>]*aria-expanded="false"[^>]*data-websearch-about-control/);
    expect(closed).toMatch(/id="websearch-about"[^>]*hidden/);
    const open = panel(renderToStaticMarkup(createElement(SettingsPageContext.Provider, { value: { title: 'section', explain: true } }, createElement(McpSettings, props()))));
    expect(open).not.toContain('data-websearch-about-control');
    for (const sentence of WEB_SEARCH_ABOUT) expect(open).toContain(sentence);
  });

  it('the key field is the one password field, with no autofill — fails if a second, unmasked control for the key appears', () => {
    const p = panel(render());
    expect(p.match(/type="password"/g)).toHaveLength(1);
    expect(p).toMatch(/autoComplete="off"|autocomplete="off"/);
  });

  it('the provider disclosure offers a press that writes the chosen provider, and marks the one in use (PD-CONFIG-013) — fails if choosing a provider is still only a stanza', () => {
    const p = panel(render());
    expect(p).toContain('data-websearch-use');
    expect(p).toContain('Tavily is in use');
    expect(p).toContain('writes its address to the configuration file');
    expect(p).toContain('Or declare the entry yourself:');
    expect(p).not.toContain('data-websearch-own-url');
  });

  it('a keyless provider with a key still stored says the key is not sent to it — fails if a stored key reads as one Exa uses', () => {
    const p = panel(render({ listing: listing([row({ line: 'https://mcp.exa.ai/mcp', unresolved: [], available: true, enabled: true, origin: 'yaml' })]), webSearchSecrets: secrets([keyRow()]) }));
    expect(p).toContain('Exa searches without a key, so the stored key is not sent to it.');
    expect(fills(render({ listing: listing([row({ line: 'https://mcp.exa.ai/mcp', unresolved: [], available: true, enabled: true, origin: 'yaml' })]), webSearchSecrets: secrets([keyRow()]) }))).toBe(1);
  });
});
