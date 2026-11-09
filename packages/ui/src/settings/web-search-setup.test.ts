import { describe, expect, it } from 'vitest';
import type { McpHealth, McpSecretRow, McpSecretsView, McpServerRow } from '@rotaris/contracts';
import {
  mcpHealthText, presetAfter, presetTabIndex, storedKeySentence, deletedKeySentence, webSearchFileLine, webSearchOtherTransport, webSearchPreset, webSearchProbeBasis, webSearchSituation,
  webSearchStanza, webSearchStoredKey, webSearchUnresolvedNote,
  WEB_SEARCH_IN_FLIGHT, WEB_SEARCH_KEY_VARIABLE, WEB_SEARCH_PRESETS, WEB_SEARCH_SERVER, WEB_SEARCH_SHIPPED_URL,
} from './web-search-setup.js';

/**
 * REQ-CONFIG-181 (resolution 15/03 #44): the preset list is content, and the stanza step 2 hands over is what the
 * user's own file edit needs — the http entry with the placeholder the key control satisfies, `enabled: true`, and NO
 * placeholder anywhere the substitution cannot reach (REQ-MCP-088 resolves a remote url and nothing else, so a header
 * value must not pretend to take `${ROTARIS_SEARCH_API_KEY}`). Each case below fails for ONE reason, written beside it.
 */
describe('the web_search stanza and presets (REQ-CONFIG-181, REQ-MCP-111)', () => {
  it('the shipped default renders as the example stanza: REQ-CONFIG-181\'s vendor-free url, timeout 600, enabled true — fails if the default url, timeout or enablement is not the shipped one', () => {
    const stanza = webSearchStanza(null);
    expect(stanza.text).toBe(
      'mcp_servers:\n  web_search:\n    type: http\n    url: ' + WEB_SEARCH_SHIPPED_URL + '\n    request_timeout: 600\n    enabled: true\n',
    );
    expect(stanza.text).toContain(`\${${WEB_SEARCH_KEY_VARIABLE}}`);
    expect(stanza.note).toBe('example — replace the host');
    expect(stanza.example).toBe(true);
  });

  it('a key-in-url preset carries the placeholder and needs no note — fails if the placeholder is dropped from the url or a spurious note appears', () => {
    const tavily = webSearchPreset('tavily')!;
    const stanza = webSearchStanza(tavily);
    expect(stanza.text).toContain(`https://mcp.tavily.com/mcp/?tavilyApiKey=\${${WEB_SEARCH_KEY_VARIABLE}}`);
    expect(stanza.text).toContain('enabled: true');
    expect(stanza.note).toBeNull();
    expect(stanza.example).toBe(false);
  });

  it('a header-auth preset keeps the header free of the placeholder the substitution cannot reach — fails if the header carries ${ROTARIS_SEARCH_API_KEY} or the note hides the manual step', () => {
    const brave = webSearchPreset('brave')!;
    const stanza = webSearchStanza(brave);
    expect(stanza.text).toContain('    headers:\n      X-Subscription-Token: <your key>\n');
    // The url is the host to replace, and no line of the stanza carries the placeholder for this preset: REQ-MCP-088
    // substitutes a remote entry's url only, so a placeholder in the header would stay literal forever.
    expect(stanza.text).not.toContain(`\${${WEB_SEARCH_KEY_VARIABLE}}`);
    expect(stanza.note).toBe('example — replace the host and put your key in the header value');
  });

  it('every preset names a http stanza with type http and enabled true — fails if a preset omits a field the declaration needs', () => {
    for (const preset of WEB_SEARCH_PRESETS) {
      const stanza = webSearchStanza(preset);
      expect(stanza.text).toContain(`mcp_servers:\n  ${WEB_SEARCH_SERVER}:\n    type: http\n`);
      expect(stanza.text).toContain('request_timeout: 600');
      expect(stanza.text.trimEnd().endsWith('enabled: true')).toBe(true);
    }
  });

  it('an unknown preset id answers null and the shipped stanza — fails if a stale id renders another vendor\'s url', () => {
    expect(webSearchPreset('nope')).toBeNull();
    expect(webSearchStanza(webSearchPreset('nope')).text).toContain('search.rotaris.invalid');
  });
});

/** The states table of the design brief §4/§10 as the one vocabulary the card switches on. */
const row = (over: Partial<McpServerRow> = {}): McpServerRow => ({
  name: WEB_SEARCH_SERVER, type: 'http', line: 'https://x/mcp', origin: 'default',
  enabled: true, overridden: false, available: true, availabilityDetail: '', unresolved: [], expectedKeys: [], ...over,
});
const keyRow = (scope: 'Workspace' | 'Global', over: Partial<McpSecretRow> = {}): McpSecretRow => ({ server: WEB_SEARCH_SERVER, key: WEB_SEARCH_KEY_VARIABLE, masked: '***', scope, ...over });
const secrets = (rows: McpSecretRow[]): McpSecretsView => ({ servers: [WEB_SEARCH_SERVER], rows, expected: [], server: null });
const unknown: McpHealth = { state: 'unknown' };

describe('the situation the card renders from (design brief §4/§10)', () => {
  it('unavailable wins over everything — fails if the fatal/no-service state renders as a working flow', () => {
    expect(webSearchSituation({ unavailable: 'no workspace', row: row(), storedKey: keyRow('Workspace'), health: { state: 'healthy' } })).toBe('unavailable');
  });
  it('no entry: the empty state — fails if the card guides a server the file does not declare', () => {
    expect(webSearchSituation({ unavailable: null, row: null, storedKey: null, health: unknown })).toBe('no-entry');
  });
  it('another transport: the http-key control does not pretend to cover it — fails if a stdio/sse entry renders the key step', () => {
    expect(webSearchSituation({ unavailable: null, row: row({ type: 'stdio' }), storedKey: null, health: unknown })).toBe('other-transport');
    expect(webSearchSituation({ unavailable: null, row: row({ type: 'sse' }), storedKey: null, health: unknown })).toBe('other-transport');
  });
  it('fresh is the shipped default with no key; a user declaration with no key is needs-key — fails if the origin is ignored where the design brief separates the two', () => {
    expect(webSearchSituation({ unavailable: null, row: row({ origin: 'default', unresolved: [WEB_SEARCH_KEY_VARIABLE] }), storedKey: null, health: unknown })).toBe('fresh');
    expect(webSearchSituation({ unavailable: null, row: row({ origin: 'yaml', unresolved: [WEB_SEARCH_KEY_VARIABLE] }), storedKey: null, health: unknown })).toBe('needs-key');
  });
  it('a stored key with the entry still disabled is needs-enabled (REQ-MCP-115) — fails if enablement is read from the key instead of the entry', () => {
    expect(webSearchSituation({ unavailable: null, row: row({ enabled: false }), storedKey: keyRow('Workspace'), health: unknown })).toBe('needs-enabled');
  });
  it('a stored key that satisfies no placeholder is needs-unresolved — fails if the row\'s unresolved list is ignored when a key exists', () => {
    expect(webSearchSituation({ unavailable: null, row: row({ unresolved: ['OTHER_VAR'] }), storedKey: keyRow('Workspace'), health: unknown })).toBe('needs-unresolved');
  });
  it('an unreachable probe on a resolved, enabled entry is wrong-endpoint — fails if the probe outcome is not consulted', () => {
    expect(webSearchSituation({ unavailable: null, row: row(), storedKey: keyRow('Workspace'), health: { state: 'unreachable', detail: 'ECONNREFUSED' } })).toBe('wrong-endpoint');
  });
  it('resolved, enabled and keyed with a healthy probe is ready (and collapses) — fails if any one of the three is not required', () => {
    expect(webSearchSituation({ unavailable: null, row: row(), storedKey: keyRow('Global'), health: { state: 'healthy', toolCount: 3 } })).toBe('ready');
    expect(webSearchSituation({ unavailable: null, row: row({ enabled: false }), storedKey: keyRow('Global'), health: unknown })).not.toBe('ready');
    expect(webSearchSituation({ unavailable: null, row: row(), storedKey: null, health: unknown })).not.toBe('ready');
  });
  it('a keyed, resolved, enabled entry the probe has not confirmed is `stored`, not `ready` — fails if the finished state is claimed before the probe answered Healthy (design §5.4: the collapse is for "both done — working")', () => {
    expect(webSearchSituation({ unavailable: null, row: row(), storedKey: keyRow('Workspace'), health: unknown })).toBe('stored');
    expect(webSearchSituation({ unavailable: null, row: row(), storedKey: keyRow('Workspace'), health: { state: 'checking' } })).toBe('stored');
  });
});

describe('the four-state health as text (REQ-CONFIG-353, REQ-SHELL-149)', () => {
  it('healthy names the tool count with the noun agreeing — fails if the count is dropped or never pluralised', () => {
    expect(mcpHealthText({ state: 'healthy', toolCount: 3 })).toBe('Healthy · 3 tools');
    expect(mcpHealthText({ state: 'healthy', toolCount: 1 })).toBe('Healthy · 1 tool');
    expect(mcpHealthText({ state: 'healthy' })).toBe('Healthy · 0 tools');
  });
  it('the other three states are their own words — fails if a state is rendered as a colour or a different word', () => {
    expect(mcpHealthText({ state: 'unknown' })).toBe('Unknown');
    expect(mcpHealthText({ state: 'checking' })).toBe('Checking…');
    expect(mcpHealthText({ state: 'unreachable', detail: 'x' })).toBe('Unreachable');
  });
});

describe('the sentences the card says (REQ-MCP-110/084/083, REQ-CONFIG-437)', () => {
  it('the confirmation is re-worded from the write\'s own masked outcome, name, key, scope and mask — fails if any of the four is missing', () => {
    expect(storedKeySentence({ server: WEB_SEARCH_SERVER, key: WEB_SEARCH_KEY_VARIABLE, scope: 'Workspace', masked: '***' }))
      .toBe('Stored `ROTARIS_SEARCH_API_KEY` for `web_search` (Workspace), value `***`.');
  });
  it('a delete states whether it removed anything (REQ-CONFIG-217) — fails if a found-nothing delete reads as a deletion', () => {
    expect(deletedKeySentence({ server: WEB_SEARCH_SERVER, key: WEB_SEARCH_KEY_VARIABLE, scope: 'Global', removed: true })).toContain('Deleted');
    expect(deletedKeySentence({ server: WEB_SEARCH_SERVER, key: WEB_SEARCH_KEY_VARIABLE, scope: 'Global', removed: false })).toContain('nothing changed');
  });
  it('the file line names the listing\'s own configFile, and says so when the listing has not answered — fails if the path is guessed or the wait is hidden', () => {
    expect(webSearchFileLine('/ws/.rotaris/agents.yaml')).toBe('File: /ws/.rotaris/agents.yaml');
    expect(webSearchFileLine(null)).toContain('not read yet');
  });
  it('the other-transport sentence names the transport and points at the file — fails if it promises the key control for a stdio entry', () => {
    const sentence = webSearchOtherTransport('stdio');
    expect(sentence).toContain('stdio');
    expect(sentence).toContain('shipped http default');
  });
  it('the unresolved note says whether a key exists yet (REQ-CONFIG-225) — fails if the same words are used for both states', () => {
    expect(webSearchUnresolvedNote(['ROTARIS_SEARCH_API_KEY'], false)).toContain('storing the key in step 3 is what satisfies it');
    expect(webSearchUnresolvedNote(['ROTARIS_SEARCH_API_KEY'], true)).toContain('satisfies nothing yet');
  });
  it('the stored-key lookup prefers the Workspace scope and reads only the one server/key pair (REQ-MCP-083) — fails if a row of another server or key can satisfy it', () => {
    expect(webSearchStoredKey(secrets([keyRow('Global'), keyRow('Workspace')]))?.scope).toBe('Workspace');
    expect(webSearchStoredKey(secrets([keyRow('Global')]))?.scope).toBe('Global');
    expect(webSearchStoredKey(secrets([keyRow('Workspace', { key: 'OTHER' }), keyRow('Workspace', { server: 'other' })]))).toBeNull();
    expect(webSearchStoredKey(null)).toBeNull();
  });

  it('the preset keyboard follows one tab station with the arrows wrapping, plus Home and End (REQ-SHELL-145/146) — fails if an arrow leaves the group open or wraps wrongly', () => {
    const ids = WEB_SEARCH_PRESETS.map((p) => p.id);
    expect(presetAfter(null, 'ArrowDown')).toBe(ids[0]);
    expect(presetAfter(null, 'ArrowUp')).toBe(ids[ids.length - 1]);
    expect(presetAfter(ids[ids.length - 1]!, 'ArrowDown')).toBe(ids[0]);
    expect(presetAfter(ids[0]!, 'ArrowLeft')).toBe(ids[ids.length - 1]);
    expect(presetAfter(ids[1]!, 'Home')).toBe(ids[0]);
    expect(presetAfter(ids[1]!, 'End')).toBe(ids[ids.length - 1]);
    expect(presetAfter(ids[1]!, 'Enter')).toBeNull();
  });

  it('the radios are ONE tab station (REQ-SHELL-145; roving tabIndex, rework round 1): the selected radio carries 0 and every other −1, and the first is the station while nothing is selected — fails if every radio is its own tab stop', () => {
    expect(WEB_SEARCH_PRESETS.map((p) => presetTabIndex(null, p.id))).toEqual([0, -1, -1, -1]);
    expect(WEB_SEARCH_PRESETS.map((p) => presetTabIndex('brave', p.id))).toEqual([-1, 0, -1, -1]);
    expect(WEB_SEARCH_PRESETS.map((p) => presetTabIndex('other', p.id))).toEqual([-1, -1, -1, 0]);
    // A stale id (a preset withdrawn since the selection was made) leaves the group reachable all the same.
    expect(WEB_SEARCH_PRESETS.map((p) => presetTabIndex('gone', p.id))).toEqual([0, -1, -1, -1]);
  });

  it('the in-flight vocabulary names each press that must not overlap itself (design brief §4\'s disabled-during-write; rework round 1, Major 2) — fails if a press the card blocks is missing from the words', () => {
    expect(Object.keys(WEB_SEARCH_IN_FLIGHT).sort()).toEqual(['open', 'probe', 'remove', 'store']);
    expect(WEB_SEARCH_IN_FLIGHT.store).toContain('Storing');
    expect(WEB_SEARCH_IN_FLIGHT.probe).toContain('Checking');
  });
});

/**
 * Round-2 Major 3, corrected in round 3 (Major 1): the basis a card probe result is kept under — the one place the
 * invalidation rule's CONTENT lives (the card in `McpSettings.tsx` keys its result to this plus the identity of the
 * two views it read). Equality means "the same inputs the probe observed", inequality "this result describes an older
 * state and the parent's health takes over". The stored key's MASK is deliberately not part of it: production masks
 * every value identically (`REDACTION_MARK`), so a basis carrying the mask would claim a detection it can never make.
 */
describe('the basis a card probe result is kept under (round-2 Major 3; round-3 Major 1)', () => {
  const facts = (over: Partial<Parameters<typeof webSearchProbeBasis>[0]> = {}) => ({
    unavailable: null, row: row(), storedKey: keyRow('Workspace'), health: { state: 'unknown' } as McpHealth, ...over,
  });
  it('the same inputs give the same basis and the classification-relevant difference changes it — fails if a changed endpoint, key name/scope, availability or health leaves a stale probe result current', () => {
    expect(webSearchProbeBasis(facts())).toBe(webSearchProbeBasis(facts()));
    // The entry: a changed url/line (what a probe observes) changes the basis; so does its enablement and the row's identity.
    expect(webSearchProbeBasis(facts({ row: row({ line: 'https://elsewhere.example/mcp' }) }))).not.toBe(webSearchProbeBasis(facts()));
    expect(webSearchProbeBasis(facts({ row: row({ enabled: false }) }))).not.toBe(webSearchProbeBasis(facts()));
    // The stored key's identity: another variable or scope is another key.
    expect(webSearchProbeBasis(facts({ storedKey: keyRow('Workspace', { key: 'OTHER_VAR' }) }))).not.toBe(webSearchProbeBasis(facts()));
    expect(webSearchProbeBasis(facts({ storedKey: keyRow('Global') }))).not.toBe(webSearchProbeBasis(facts()));
    // The parent health: a newer probe result supersedes the card's older one.
    expect(webSearchProbeBasis(facts({ health: { state: 'healthy', toolCount: 2 } }))).not.toBe(webSearchProbeBasis(facts()));
    // The service's own fact.
    expect(webSearchProbeBasis(facts({ unavailable: 'no workspace' }))).not.toBe(webSearchProbeBasis(facts()));
  });
  it('the stored key\'s MASK is NOT part of the basis — the production mask is one constant for every value, so keying on it would claim a replacement the card cannot see (round-3 Major 1) — fails if the basis carries the mask again and the card pretends to detect a value change', () => {
    // The real mask arrives as `***` whatever the value was (redaction.ts's REDACTION_MARK, run-host/mcp.ts's
    // `secrets()`): a `***new` fixture was an impossible input that let round 2 "prove" a detection that never fires.
    expect(webSearchProbeBasis(facts({ storedKey: keyRow('Workspace', { masked: '***' }) }))).toBe(webSearchProbeBasis(facts()));
    expect(webSearchProbeBasis(facts({ storedKey: keyRow('Workspace', { masked: '***new' }) }))).toBe(webSearchProbeBasis(facts()));
  });
  it('`elapsedMs` is NOT part of the basis — fails if a probe timing that says nothing about the classification invalidates a current result', () => {
    expect(webSearchProbeBasis(facts({ health: { state: 'healthy', toolCount: 2, elapsedMs: 12 } })))
      .toBe(webSearchProbeBasis(facts({ health: { state: 'healthy', toolCount: 2, elapsedMs: 999 } })));
  });
});
