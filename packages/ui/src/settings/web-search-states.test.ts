import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ConfigSnapshot, McpHealth, McpListing, McpSecretRow, McpSecretsView, McpServerRow } from '@rotaris/contracts';
import { McpSettings, type McpSettingsProps } from './McpSettings.js';
import { WEB_SEARCH_KEY_VARIABLE, WEB_SEARCH_SERVER, WEB_SEARCH_SHIPPED_URL } from './web-search-setup.js';

/**
 * THE GUIDED CARD'S STATES, rendered (the design brief §4/§10's table; `renderToStaticMarkup` as `skills-fatal.test.ts`).
 * Every case asserts what the state must SHOW and what it must NOT (the forbidden sentence), and states the ONE reason it
 * can fail for. REQ-SHELL-149: each state is text; REQ-MCP-110: the field never carries a stored value; REQ-CONFIG-350/464:
 * the card hands over the stanza and names the file and authors no server; REQ-CONFIG-424/478: with no service or a fatal
 * load the card draws its empty state and the controls are disabled.
 */
const row = (over: Partial<McpServerRow> = {}): McpServerRow => ({
  name: WEB_SEARCH_SERVER, type: 'http', line: 'https://x/mcp', origin: 'default',
  enabled: true, overridden: false, available: true, availabilityDetail: '', unresolved: [], expectedKeys: [], ...over,
});
const listing = (rows: McpServerRow[]): McpListing => ({ configFile: '/ws/.rotaris/agents.yaml', rows });
const keyRow = (scope: 'Workspace' | 'Global' = 'Workspace', masked = '***'): McpSecretRow => ({ server: WEB_SEARCH_SERVER, key: WEB_SEARCH_KEY_VARIABLE, masked, scope });
const secrets = (rows: McpSecretRow[]): McpSecretsView => ({ servers: [WEB_SEARCH_SERVER], rows, expected: [], server: null });

const props = (over: Partial<McpSettingsProps> = {}): McpSettingsProps => ({
  listing: listing([row()]), loading: false, error: null, health: {}, probing: false,
  onRefresh: () => undefined, onProbeAll: async () => undefined,
  onToggle: async () => ({ ok: true, message: '' }),
  secrets: secrets([]), webSearchSecrets: secrets([]), onSecretsServer: () => undefined, setup: null,
  onSetupStart: async () => ({ ok: true, message: '' }), onSetupCancel: async () => undefined,
  webSearchSetup: {
    onOpenFile: async () => ({ ok: true as const }),
    onGetKey: async () => ({ ok: true as const }),
    onStoreKey: async () => ({ ok: true as const, outcome: { server: WEB_SEARCH_SERVER, key: WEB_SEARCH_KEY_VARIABLE, scope: 'Workspace' as const, masked: '***', removed: false } }),
    onDeleteKey: async () => ({ ok: true as const, outcome: { server: WEB_SEARCH_SERVER, key: WEB_SEARCH_KEY_VARIABLE, scope: 'Workspace' as const, masked: null, removed: false } }),
    onProbe: async () => ({ state: 'unknown' as const }),
  },
  ...over,
});
const render = (over: Partial<McpSettingsProps> = {}): string => renderToStaticMarkup(createElement(McpSettings, props(over)));
const health = (h: McpHealth): Record<string, McpHealth> => ({ [WEB_SEARCH_SERVER]: h });

describe('the guided Set up web search card — every state of the brief\'s table', () => {
  it('nothing done yet (fresh): the four steps, the shipped stanza as an example, an empty masked field, Unknown, and no stored-key sentences — fails if the shipped default renders as a working server, a pre-filled field, or a hidden step', () => {
    const html = render({ secrets: null, health: health({ state: 'unknown' }) });
    expect(html).toContain('data-mcp-websearch-setup');
    expect(html).toContain('data-websearch-situation="fresh"');
    expect(html).toContain('Choose your search provider');
    expect(html).toContain('Put this in your configuration file');
    expect(html).toContain('Paste the key');
    expect(html).toContain('Test it');
    expect(html).toContain('example — replace the host');
    expect(html).toContain(WEB_SEARCH_SHIPPED_URL.replace(/&/g, '&amp;'));
    expect(html).toContain('type="password"');
    expect(html).toContain('value=""');
    // The masked field is never pre-filled (REQ-MCP-110), so no stored-value sentence stands where nothing is stored.
    expect(html).not.toContain('Storing again replaces it');
    expect(html).toContain('Unknown');
  });

  it('a user\'s own url with no key yet (needs-key): step 2 stands down and says the declaration stands — fails if the card hands over a stanza for an entry the file already declares', () => {
    const html = render({ listing: listing([row({ origin: 'yaml', unresolved: [WEB_SEARCH_KEY_VARIABLE] })]), secrets: secrets([]) });
    expect(html).toContain('data-websearch-situation="needs-key"');
    expect(html).toContain('Your declaration stands');
    expect(html).not.toContain('data-websearch-stanza');
  });

  it('a key stored but the entry still enabled:false says the file still needs enabled: true (REQ-MCP-115) — fails if the card implies the key alone turns the server on', () => {
    const html = render({ listing: listing([row({ enabled: false })]), secrets: secrets([keyRow()]), webSearchSecrets: secrets([keyRow()]) });
    expect(html).toContain('data-websearch-situation="needs-enabled"');
    expect(html).toContain('enabled: true');
    expect(html).toContain('stays off until the file says so');
  });

  it('everything working collapses steps 1–3 to a one-line summary with a Change action — fails if the finished state stays permanent furniture', () => {
    const html = render({ secrets: secrets([keyRow()]), webSearchSecrets: secrets([keyRow()]), health: health({ state: 'healthy', toolCount: 2 }) });
    expect(html).toContain('data-websearch-situation="ready"');
    expect(html).toContain('data-websearch-summary');
    expect(html).toContain('Change');
    expect(html).not.toContain('data-websearch-stanza');
    // Step 4 stays reachable (the test action is the point of the finished state).
    expect(html).toContain('data-websearch-check');
    expect(html).toContain('Healthy · 2 tools');
  });

  it('a wrong endpoint: step 4 says Unreachable with the server\'s own detail, and never the working summary — fails if the unreachable detail is dropped or the state claims success', () => {
    const html = render({ secrets: secrets([keyRow()]), webSearchSecrets: secrets([keyRow()]), health: health({ state: 'unreachable', detail: 'connect ECONNREFUSED 127.0.0.1:9' }) });
    expect(html).toContain('data-websearch-situation="wrong-endpoint"');
    expect(html).toContain('Unreachable');
    expect(html).toContain('connect ECONNREFUSED 127.0.0.1:9');
    expect(html).not.toContain('data-websearch-summary');
  });

  it('a key already stored shows only the mask, never a value, and the field is still empty (REQ-MCP-110/081) — fails if the stored value or mask is put into the field', () => {
    const html = render({ secrets: secrets([keyRow('Global', '***')]), webSearchSecrets: secrets([keyRow('Global', '***')]) });
    expect(html).toContain('data-websearch-situation="stored"');
    expect(html).toContain('Storing again replaces it');
    expect(html).toContain('data-mask');
    expect(html).toContain('value=""');
    expect(html).toContain('Delete the stored key');
    // The mask is the one mask; nothing echoes a value the card was never given.
    expect(html.match(/value="\*\*\*"/)).toBeNull();
  });

  it('a web_search entry of another transport says the key control belongs to the http default and points at the file — fails if a stdio entry renders the key step', () => {
    const html = render({ listing: listing([row({ type: 'stdio', line: 'npx -y something' })]), secrets: null, webSearchSecrets: null });
    expect(html).toContain('data-websearch-situation="other-transport"');
    expect(html).toContain('This key control belongs to the shipped http default');
    expect(html).not.toContain('data-websearch-key-field');
  });

  it('Minor 2 (rework round 1): a chooser filtered to another server does not blank the card\'s stored-key state — the card reads its OWN view, and its delete action stays — fails if the card is fed the chooser\'s rows', () => {
    // The chooser's view names another server and holds no web_search row; the card's own view holds the key.
    const chooser: McpSecretsView = { servers: ['other'], rows: [{ server: 'other', key: 'TOKEN', masked: '***', scope: 'Workspace' }], expected: [], server: 'other' };
    const html = render({ secrets: chooser, webSearchSecrets: secrets([keyRow()]) });
    expect(html).toContain('data-websearch-situation="stored"');
    expect(html).toContain('Storing again replaces it');
    expect(html).toContain('data-websearch-delete');
    // And the reverse: the card's view holding no key means no stored state, whatever the chooser shows.
    const empty = render({ secrets: chooser, webSearchSecrets: secrets([]) });
    expect(empty).toContain('data-websearch-situation="fresh"');
    expect(empty).not.toContain('Delete the stored key');
  });

  it('no web_search entry at all renders the empty state naming the file (REQ-CONFIG-437) — fails if the card appears for a server the file does not declare', () => {
    const html = render({ listing: listing([row({ name: 'browser', type: 'stdio' })]), secrets: secrets([]) });
    expect(html).toContain('data-websearch-situation="no-entry"');
    expect(html).toContain('No `web_search` entry is configured');
    expect(html).toContain('File: /ws/.rotaris/agents.yaml');
    expect(html).not.toContain('data-websearch-presets');
  });

  it('a fatal load draws the report and no controls (REQ-CONFIG-478) — fails if the card offers the flow over a configuration that did not load', () => {
    const fatal = { loadOk: false, fatal: '/w/.rotaris/agents.yaml: bad indentation', files: { workspace: '/w/.rotaris/agents.yaml', global: '/g/agents.yaml' } } as unknown as ConfigSnapshot;
    const html = render({ fatal });
    expect(html).toContain('data-websearch-situation="unavailable"');
    expect(html).toContain('Configuration could not be loaded');
    expect(html).toContain('bad indentation');
    expect(html).not.toContain('data-websearch-store');
  });

  it('no configuration service (the listing read\'s refusal) renders the refusal and no controls (REQ-CONFIG-424) — fails if the card stays pressable while nothing can be read or written', () => {
    const html = render({ error: 'Open a workspace first', listing: null, loading: false });
    expect(html).toContain('data-websearch-situation="unavailable"');
    expect(html).toContain('Open a workspace first');
    expect(html).not.toContain('data-websearch-store');
  });

  it('step 2 states in words that this is a file edit the screen does not make (REQ-CONFIG-350/464) — fails if the boundary sentence disappears or the screen claims to write the declaration', () => {
    const html = render({ secrets: null });
    expect(html).toContain('Rotaris does not write this for you');
    expect(html).toContain('Open the file');
    expect(html).toContain('File: /ws/.rotaris/agents.yaml');
    // The card writes no url or enabled (REQ-CONFIG-350/464): its only write commands are the secret ones.
    expect(html).not.toContain('writes enabled: true');
  });

  it('step 3 says a stored secret takes effect on the next load and that the row refreshes with it — fails if the take-effect sentence is missing', () => {
    const html = render({ secrets: null });
    expect(html).toContain('takes effect on the next configuration load');
    expect(html).toContain('the row above refreshes with it');
  });

  it('the key field carries no autofill hook and no second control for the key — fails if a second, unmasked control for the key appears', () => {
    const html = render({ secrets: null });
    expect(html.match(/type="password"/g)).toHaveLength(1);
    expect(html).toMatch(/autoComplete="off"|autocomplete="off"/);
  });
});
