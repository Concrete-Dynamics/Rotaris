import type { CommandOutcome, CommandRequest, McpHealth, McpListing, McpSecretRow, McpSecretWriteOutcome, McpSecretsView, McpServerRow } from '@rotaris/contracts';

/**
 * THE WEB SEARCH PANEL'S PURE HALF — the provider table, the situation the panel is in, its sentences, and the presses
 * (`web-search-setup.test.ts`, `web-search-press.test.ts`). Everything here is data and functions over props, so every
 * state and every press is testable without a window, and `McpSettings.tsx`'s `WebSearchPanel` only draws it.
 *
 * R-117 (2026-11-21) replaced the four-step card that stood here with one panel: the provider the entry points at, the
 * key, and the status. The shipped entry now names a real endpoint (`packages/config/src/mcp/defaults.ts`), so for the
 * default the key is all a user supplies; `Save and test` stores it, switches an entry configured off on (PD-CONFIG-006
 * revision 2) and probes it (REQ-MCP-092). Another provider is still a file edit (REQ-CONFIG-350/464), offered behind
 * "Use a different provider" with the stanza to paste.
 *
 * REQ-MCP-111: the dedicated control stores the built-in `web_search` server's key without the user naming the server
 * or the variable, and it is visible whether or not `web_search` is enabled. REQ-CONFIG-181 leaves the VENDOR to the
 * implementation and binds none — the provider table below is content: replacing a vendor is an edit here and in the
 * shipped default, and no spec change.
 */

/**
 * The server name and the variable REQ-MCP-111's control writes (REQ-CONFIG-181). One home for the literal is
 * `packages/config/src/mcp/defaults.ts`'s `WEB_SEARCH_KEY_VARIABLE`, which this package cannot import: `@rotaris/ui`
 * does not depend on `@rotaris/config`, so the requirement fixes the pair and this module is the UI's statement of it.
 */
export const WEB_SEARCH_SERVER = 'web_search';
export const WEB_SEARCH_KEY_VARIABLE = 'ROTARIS_SEARCH_API_KEY';
const KEY = `\${${WEB_SEARCH_KEY_VARIABLE}}`;

export interface WebSearchPreset {
  readonly id: string;
  readonly name: string;
  /** One line, ending in a period (§1.11). */
  readonly description: string;
  /** The url the stanza declares, with the key placeholder where the provider takes it. */
  readonly url: string;
  /** The host the provider answers on, by which a configured entry is recognised; null for a host the user supplies. */
  readonly host: string | null;
  /** Whether the url carries the key placeholder (REQ-MCP-088 substitutes in the url and nowhere else). */
  readonly needsKey: boolean;
  /** REQ-CHAT-076's link to the provider's key page; null where there is none. */
  readonly keyPage: string | null;
}

/**
 * The providers (R-117; vendor documentation read 2026-11-21). Each takes its key in the url, or needs none — a provider
 * whose key travels only in a header is left out, because the key control satisfies a url placeholder and nothing else
 * (REQ-MCP-088), and a key written into a header would sit in the configuration file as plain text.
 *
 *   - Tavily: `https://mcp.tavily.com/mcp/?tavilyApiKey=<key>` — the shipped default;
 *   - Linkup: `https://mcp.linkup.so/mcp?apiKey=<key>`;
 *   - Exa: `https://mcp.exa.ai/mcp`, searched without a key at a free rate limit;
 *   - your own server: any http MCP search server, its host replaced by the user.
 */
export const WEB_SEARCH_PRESETS: readonly WebSearchPreset[] = [
  {
    id: 'tavily', name: 'Tavily', description: 'A hosted search API made for agents; the built-in default.',
    url: `https://mcp.tavily.com/mcp/?tavilyApiKey=${KEY}`, host: 'mcp.tavily.com', needsKey: true, keyPage: 'https://app.tavily.com/home',
  },
  {
    id: 'linkup', name: 'Linkup', description: 'A hosted search API with sourced answers.',
    url: `https://mcp.linkup.so/mcp?apiKey=${KEY}`, host: 'mcp.linkup.so', needsKey: true, keyPage: 'https://app.linkup.so',
  },
  {
    id: 'exa', name: 'Exa', description: 'A hosted search index; searches without a key, at a free rate limit.',
    url: 'https://mcp.exa.ai/mcp', host: 'mcp.exa.ai', needsKey: false, keyPage: null,
  },
  {
    id: 'own', name: 'Your own server', description: 'Any http MCP search server you run, such as a SearXNG front; replace the host.',
    url: `https://<your-search-server>/mcp?key=${KEY}`, host: null, needsKey: true, keyPage: null,
  },
];

export function webSearchPreset(id: string | null): WebSearchPreset | null {
  if (id === null) return null;
  return WEB_SEARCH_PRESETS.find((p) => p.id === id) ?? null;
}

/** The host a row's line names, or null when the line is not a url (a stdio entry, or text the mask made unparsable). */
export function webSearchHost(line: string): string | null {
  try { return new URL(line.replace(/\*+/g, 'x')).host || null; } catch { return null; }
}

/** The provider an entry points at: the preset whose host its url names, or null for a host this table does not know. */
export function webSearchProviderOf(row: McpServerRow | null): WebSearchPreset | null {
  if (row === null) return null;
  const host = webSearchHost(row.line);
  return host === null ? null : WEB_SEARCH_PRESETS.find((p) => p.host === host) ?? null;
}

/**
 * The stanza "Use a different provider" hands over: exactly `mcp_servers.web_search` with the chosen url,
 * REQ-CONFIG-181's `request_timeout: 600` and `enabled: true` — the durable enablement REQ-MCP-115 names.
 * REQ-CONFIG-350/464: this is TEXT for the user's own file edit; the screen writes none of it.
 */
export interface WebSearchStanza {
  readonly text: string;
  /** The sentence under the stanza naming what to replace; null when nothing needs replacing. */
  readonly note: string | null;
}

export function webSearchStanza(preset: WebSearchPreset): WebSearchStanza {
  const text = ['mcp_servers:', `  ${WEB_SEARCH_SERVER}:`, '    type: http', `    url: ${preset.url}`, '    request_timeout: 600', '    enabled: true', ''].join('\n');
  return { text, note: preset.host === null ? 'Replace the host with your server’s.' : null };
}

/** REQ-CONFIG-437: the file is NAMED; before the listing answers, the sentence names the file to look for. */
export function webSearchFileLine(configFile: string | null): string {
  return `File: ${configFile ?? "this workspace's configuration file (not read yet)"}`;
}

/** The four-state vocabulary of REQ-CONFIG-353/REQ-MCP-092, as text (REQ-SHELL-149: never colour alone). */
export const MCP_HEALTH_TEXT: Record<McpHealth['state'], string> = { unknown: 'Unknown', checking: 'Checking…', healthy: 'Healthy', unreachable: 'Unreachable' };

export function mcpHealthText(health: McpHealth): string {
  return health.state === 'healthy' ? `${MCP_HEALTH_TEXT.healthy} · ${health.toolCount ?? 0} tool${health.toolCount === 1 ? '' : 's'}` : MCP_HEALTH_TEXT[health.state];
}

/** REQ-MCP-083/110: the one stored key for the server, Workspace preferred where both scopes hold one. */
export function webSearchStoredKey(secrets: McpSecretsView | null): McpSecretRow | null {
  const rows = (secrets?.rows ?? []).filter((r) => r.server === WEB_SEARCH_SERVER && r.key === WEB_SEARCH_KEY_VARIABLE);
  return rows.find((r) => r.scope === 'Workspace') ?? rows[0] ?? null;
}

export interface WebSearchFacts {
  /** The sentence naming why the panel is disabled (no workspace/service, or a fatal load), or null. */
  readonly unavailable: string | null;
  readonly row: McpServerRow | null;
  readonly storedKey: McpSecretRow | null;
  readonly health: McpHealth;
}

/**
 * The panel's closed vocabulary of situations (R-117):
 *   - `unavailable`, `no-entry`, `other-transport`: nothing the key control can act on, each said in words;
 *   - `needs-key`: the entry's url still carries `${ROTARIS_SEARCH_API_KEY}` and no key is stored;
 *   - `unresolved`: a key is stored (or none is needed) and the url still carries a placeholder nothing resolved;
 *   - `off`: everything resolves, and the entry is configured off or switched off for this session;
 *   - `untested`: on and resolved, and no probe has answered yet;
 *   - `failing` / `ready`: the probe's Unreachable / Healthy.
 */
export type WebSearchSituation = 'unavailable' | 'no-entry' | 'other-transport' | 'needs-key' | 'unresolved' | 'off' | 'untested' | 'failing' | 'ready';

export function webSearchSituation(facts: WebSearchFacts): WebSearchSituation {
  if (facts.unavailable !== null) return 'unavailable';
  const { row } = facts;
  if (row === null) return 'no-entry';
  if (row.type !== 'http') return 'other-transport';
  if (row.unresolved.length > 0) return facts.storedKey === null && row.unresolved.includes(WEB_SEARCH_KEY_VARIABLE) ? 'needs-key' : 'unresolved';
  if (!row.enabled || row.overridden) return 'off';
  if (facts.health.state === 'unreachable') return 'failing';
  return facts.health.state === 'healthy' ? 'ready' : 'untested';
}

/** The status the panel's head states, in words (REQ-SHELL-149), and the dot state it stands beside. */
export function webSearchStatus(situation: WebSearchSituation, health: McpHealth): { readonly text: string; readonly dot: McpHealth['state'] } {
  switch (situation) {
    case 'needs-key': return { text: 'Needs a key', dot: 'unknown' };
    case 'unresolved': return { text: 'Not resolved', dot: 'unreachable' };
    case 'off': return { text: 'Off', dot: 'unknown' };
    case 'untested': return { text: health.state === 'checking' ? MCP_HEALTH_TEXT.checking : 'Not tested yet', dot: health.state === 'checking' ? 'checking' : 'unknown' };
    case 'failing': return { text: 'Unreachable', dot: 'unreachable' };
    case 'ready': return { text: mcpHealthText(health), dot: 'healthy' };
    case 'unavailable': case 'no-entry': case 'other-transport': return { text: '', dot: 'unknown' };
  }
}

/** Whether the key control applies: the entry takes the key in its url, or one is stored for it. */
export function webSearchKeyApplies(row: McpServerRow | null, storedKey: McpSecretRow | null): boolean {
  if (row === null || row.type !== 'http') return false;
  // A resolved url reaches the renderer masked (REQ-MCP-081: the key's value reads `***`), an unresolved one with its placeholder.
  return storedKey !== null || row.unresolved.includes(WEB_SEARCH_KEY_VARIABLE) || row.line.includes(KEY) || row.line.includes('***');
}

/** The sentences behind the panel's explanation control (PD-CONFIG-012 clause 4: closed until asked for). */
export const WEB_SEARCH_ABOUT: readonly string[] = [
  'Agents search the web through the provider named here, and your queries go to that provider under your key.',
  'Save and test stores the key in the secrets file of the scope you choose, switches the server on (which writes enabled: true to the configuration file) and checks that it answers.',
  'Another provider is declared in the configuration file: Rotaris does not write a tool server’s address for you.',
];

/** REQ-SHELL-144: the explanation control's accessible name and tooltip — it names the surface, never a generic `Info`. */
export const WEB_SEARCH_ABOUT_CONTROL = 'About web search';

/** The disclosure that holds the file edit (REQ-CONFIG-350/464). */
export const WEB_SEARCH_OTHER_PROVIDER = 'Use a different provider';
export const WEB_SEARCH_OTHER_PROVIDER_LEDE = 'Choose one, put its declaration in your configuration file, then reload. A provider that takes a key reads the one stored above.';

export const WEB_SEARCH_NO_ENTRY = "No web_search entry is configured. Declare one under mcp_servers in this workspace's configuration file; this screen writes no tool server.";

/** REQ-MCP-111/REQ-CONFIG-181: the key control belongs to an http entry, not to every transport. */
export function webSearchOtherTransport(type: McpServerRow['type']): string {
  return `The web_search entry here is a ${type} server. The key field belongs to an http entry whose url carries the key; for this one, edit the configuration file and handle its key there.`;
}

/** REQ-CONFIG-225: what keeps a stored key from resolving the entry. */
export function webSearchUnresolvedNote(unresolved: readonly string[]): string {
  const list = unresolved.map((v) => `\${${v}}`).join(', ');
  return `The entry's url carries ${list}, which no stored secret or environment variable resolves. Correct the url in the configuration file, or set the variable.`;
}

export const WEB_SEARCH_OFF = 'The server is off. Turn it on to let agents search.';

/**
 * The probe's answer, as the panel states it after a test. REQ-MCP-092's probe connects and lists the server's tools;
 * it runs no search, and a provider may list its tools without checking the key — Tavily does (driven 2026-11-21, R-117:
 * a made-up key answered Healthy). So a Healthy answer on a keyed entry says what it proved and what it did not.
 */
export function webSearchProbeSentence(health: McpHealth, keyed = false): string {
  if (health.state === 'unreachable') return 'The server did not answer: the key may not be accepted, the endpoint may be wrong, or the service may be down.';
  const answered = `The server answered: ${mcpHealthText(health)}.`;
  return keyed && health.state === 'healthy' ? `${answered} The provider checks the key itself when an agent first searches.` : answered;
}

/** REQ-MCP-084/110: an empty value is refused and writes nothing — refused here before anything is sent. */
export const EMPTY_KEY_REFUSAL = 'Paste the key first; nothing was written.';

/**
 * REQ-MCP-108's one venue with REQ-MCP-111's visible-anyway rule: the server row offers the way into the panel while
 * the row is `web_search`, http, its url waits on the key, and no key is stored for it yet.
 */
export function webSearchRowSetupVisible(row: McpServerRow | null, storedKey: McpSecretRow | null): boolean {
  return row !== null && row.name === WEB_SEARCH_SERVER && row.type === 'http' && storedKey === null && row.unresolved.includes(WEB_SEARCH_KEY_VARIABLE);
}

export const WEB_SEARCH_SETUP_ROW_ACTION = 'Add a key';
export const WEB_SEARCH_SETUP_ROW_LABEL = `Add a key for ${WEB_SEARCH_SERVER}`;
export const WEB_SEARCH_SETUP_ROW_DESCRIPTION = 'Moves to the web search key field below.';

/** `Workspace`/`Global` as the write commands' scope vocabulary (REQ-CONFIG-463's opening choice). */
export type WebSearchScope = 'workspace' | 'global';
export const WEB_SEARCH_SCOPE_LABELS: Readonly<Record<WebSearchScope, string>> = { workspace: 'Workspace', global: 'Global' };

/**
 * The BASIS a panel probe result is kept under: the serialised situation inputs it was taken against, so a result is
 * read only while they still hold (a changed entry, key or newer category probe drops it). The stored key's mask is
 * deliberately NOT part of it — every value masks identically (`REDACTION_MARK`), so a replaced key arrives with a
 * byte-identical mask; the panel's own write drops the result at the press, and a fresh read of either view is the
 * other witness (`McpSettings.tsx`).
 */
export function webSearchProbeBasis(facts: WebSearchFacts): string {
  const { row, storedKey, health } = facts;
  return JSON.stringify([
    facts.unavailable,
    row === null ? null : [row.name, row.type, row.line, row.origin, row.enabled, row.overridden, row.available, row.availabilityDetail, [...row.unresolved]],
    storedKey === null ? null : [storedKey.server, storedKey.key, storedKey.scope],
    [health.state, health.toolCount ?? null, health.detail ?? null],
  ]);
}

/** The panel's one in-flight state: while one holds, every control is disabled, so two writes cannot race. */
export type WebSearchInFlight = 'save' | 'enable' | 'remove' | 'open' | 'probe';

/** The in-flight state said in words (REQ-SHELL-149). */
export const WEB_SEARCH_IN_FLIGHT: Readonly<Record<WebSearchInFlight, string>> = {
  save: 'Storing the key, switching the server on and checking it…',
  enable: 'Switching the server on and checking it…',
  remove: 'Deleting the stored key…',
  open: 'Opening the configuration file…',
  probe: 'Checking the server…',
};

/** REQ-MCP-110's confirmation, from the write's own masked outcome — never a value. */
export function storedKeySentence(outcome: Pick<McpSecretWriteOutcome, 'scope' | 'masked'>): string {
  return outcome.masked === null ? `Key stored (${outcome.scope}).` : `Key stored (${outcome.scope}), value ${outcome.masked}.`;
}

export function deletedKeySentence(outcome: Pick<McpSecretWriteOutcome, 'scope' | 'removed'>): string {
  return outcome.removed ? `Key deleted from the ${outcome.scope} scope.` : `No key was stored in the ${outcome.scope} scope; nothing changed.`;
}

/** REQ-SHELL-144: each control's accessible name identifies it and its server. */
export const WEB_SEARCH_CONTROLS = {
  save: `Save the key for ${WEB_SEARCH_SERVER} and test it`,
  enable: `Turn on ${WEB_SEARCH_SERVER} and test it`,
  delete: `Delete the stored key for ${WEB_SEARCH_SERVER}`,
  check: `Test ${WEB_SEARCH_SERVER}`,
  key: (name: string): string => `Get a key from ${name}`,
} as const;

/**
 * THE PRESSES — which commands each action of the panel sends (REQ-MCP-110/111 with REQ-MCP-092, REQ-CHAT-076 and
 * PD-CONFIG-006 revision 2). The panel takes these as props (`bindWebSearchSetup`), so the component holds no bridge.
 *
 *   - `Save and test` → `mcp.setSecret`, the re-read, then the enable step, then `mcp.probe`;
 *   - `Turn on and test` → the enable step, then `mcp.probe`;
 *   - `Delete` → `mcp.unsetSecret`;
 *   - `Test` → `mcp.probe {name}`;
 *   - `Get a key ↗` → `shell.openExternal`; `Open the file` → `shell.openConfigFile`.
 *
 * The enable step reads the listing afresh (`mcp.list`) — the props the press began with predate the write — and, on an
 * available `web_search` entry configured off, hands that row to `enable`, which is the row switch's own durable press
 * (`pressMcpToggle`, bound in the renderer). An entry configured on, or still unresolved, is not written.
 */
export interface WebSearchSetupHandlers {
  readonly onSaveAndTest: (value: string, scope: WebSearchScope) => Promise<WebSearchSaveReply>;
  readonly onEnableAndTest: () => Promise<WebSearchSaveReply>;
  readonly onDeleteKey: (scope: WebSearchScope) => Promise<WebSearchWriteReply>;
  readonly onProbe: () => Promise<McpHealth>;
  readonly onOpenFile: () => Promise<{ ok: true } | { ok: false; message: string }>;
  readonly onGetKey: (preset: WebSearchPreset) => Promise<{ ok: true } | { ok: false; message: string }>;
}

/** A write's outcome, or the words of a refusal; `refreshFailure` is the re-read's refusal where the write stood. */
export type WebSearchWriteReply =
  | { readonly ok: true; readonly outcome: McpSecretWriteOutcome; readonly refreshFailure: string | null }
  | { readonly ok: false; readonly message: string };

/** What a save-and-test or enable-and-test press reports: each finished step's words, in order, and the probe's answer. */
export type WebSearchSaveReply =
  | { readonly ok: true; readonly lines: readonly string[]; readonly health: McpHealth | null; readonly refreshFailure: string | null }
  | { readonly ok: false; readonly message: string; readonly lines: readonly string[] };

export type WebSearchRefreshReply = { readonly ok: true } | { readonly ok: false; readonly message: string };

export interface WebSearchSetupDeps {
  readonly command: (req: CommandRequest) => Promise<CommandOutcome>;
  /** The re-read after a write — the listing and the secrets views — answering its own outcome. */
  readonly read: () => Promise<WebSearchRefreshReply>;
  /** The row switch's durable ON press (PD-CONFIG-006), handed the freshly read row. */
  readonly enable: (row: McpServerRow) => Promise<{ ok: boolean; message: string }>;
}

/** ADR-0019: `bridge.command` rejects when main's handler throws or the channel is gone, and the caller is a click handler. */
async function send(deps: Pick<WebSearchSetupDeps, 'command'>, req: CommandRequest): Promise<CommandOutcome> {
  try { return await deps.command(req); }
  catch (cause) { return { ok: false, code: 'command.unreachable', headline: 'The application did not answer', detail: cause instanceof Error ? cause.message : String(cause) }; }
}

/** The re-read after a write, made total: a thrown or refused read comes back as words, never as a rejection. */
async function refreshAfterWrite(deps: Pick<WebSearchSetupDeps, 'read'>): Promise<string | null> {
  try {
    const outcome = await deps.read();
    return outcome.ok ? null : outcome.message;
  } catch (cause) { return cause instanceof Error ? cause.message : String(cause); }
}

export async function pressCheckWebSearch(deps: Pick<WebSearchSetupDeps, 'command'>): Promise<McpHealth> {
  const outcome = await send(deps, { kind: 'mcp.probe', name: WEB_SEARCH_SERVER });
  if (!outcome.ok) return { state: 'unreachable', detail: outcome.detail ?? outcome.headline };
  const result = (outcome.value as { name: string; health: McpHealth }[])[0];
  return result?.health ?? { state: 'unreachable', detail: 'no answer' };
}

/**
 * The enable step and the probe, shared by both presses: read the listing afresh, switch an available entry configured
 * off on through the row's own press, and probe. An entry still unresolved is reported, not probed; one switched off
 * for this session is left as it is (the session switch is the row's, REQ-MCP-094).
 */
async function enableAndProbe(deps: WebSearchSetupDeps, lines: string[]): Promise<WebSearchSaveReply> {
  let enable: { ok: boolean; message: string } | null;
  const listed = await send(deps, { kind: 'mcp.list' });
  if (!listed.ok) return { ok: false, message: `The server list could not be read: ${listed.detail ?? listed.headline}`, lines };
  const row = (listed.value as McpListing).rows.find((r) => r.name === WEB_SEARCH_SERVER) ?? null;
  if (row === null) return { ok: false, message: WEB_SEARCH_NO_ENTRY, lines };
  if (row.unresolved.length > 0) return { ok: false, message: webSearchUnresolvedNote(row.unresolved), lines };
  if (row.overridden) {
    lines.push('The server is switched off for this session; switch it on in the list above to use it.');
    return { ok: true, lines, health: null, refreshFailure: null };
  }
  if (!row.enabled && row.available) {
    try { enable = await deps.enable(row); }
    catch (cause) { enable = { ok: false, message: cause instanceof Error ? cause.message : String(cause) }; }
    if (!enable.ok) return { ok: false, message: enable.message, lines };
    lines.push('Switched on: enabled: true is written to the configuration file.');
  }
  const health = await pressCheckWebSearch(deps);
  lines.push(webSearchProbeSentence(health, webSearchKeyApplies(row, null)));
  return { ok: true, lines, health, refreshFailure: null };
}

export async function pressSaveAndTest(deps: WebSearchSetupDeps, value: string, scope: WebSearchScope): Promise<WebSearchSaveReply> {
  // REQ-MCP-084/110: refused here, and changed nothing anywhere — no command leaves the window.
  if (value.trim() === '') return { ok: false, message: EMPTY_KEY_REFUSAL, lines: [] };
  const stored = await send(deps, { kind: 'mcp.setSecret', server: WEB_SEARCH_SERVER, key: WEB_SEARCH_KEY_VARIABLE, value: value.trim(), scope });
  if (!stored.ok) return { ok: false, message: stored.detail ?? stored.headline, lines: [] };
  const lines = [storedKeySentence(stored.value as McpSecretWriteOutcome)];
  const first = await refreshAfterWrite(deps);
  const rest = await enableAndProbe(deps, lines);
  const last = await refreshAfterWrite(deps);
  return rest.ok ? { ...rest, refreshFailure: last ?? first } : rest;
}

export async function pressEnableAndTest(deps: WebSearchSetupDeps): Promise<WebSearchSaveReply> {
  const rest = await enableAndProbe(deps, []);
  const last = await refreshAfterWrite(deps);
  return rest.ok ? { ...rest, refreshFailure: last } : rest;
}

export async function pressDeleteWebSearchKey(deps: WebSearchSetupDeps, scope: WebSearchScope): Promise<WebSearchWriteReply> {
  const outcome = await send(deps, { kind: 'mcp.unsetSecret', server: WEB_SEARCH_SERVER, key: WEB_SEARCH_KEY_VARIABLE, scope });
  if (!outcome.ok) return { ok: false, message: outcome.detail ?? outcome.headline };
  const refreshFailure = await refreshAfterWrite(deps);
  return { ok: true, outcome: outcome.value as McpSecretWriteOutcome, refreshFailure };
}

/** The write stood, the re-read after it did not — said, not swallowed (REQ-SHELL-149: text). */
export const WEB_SEARCH_REFRESH_FAILED = (detail: string): string =>
  `The change went through, but the list could not be refreshed: ${detail}. Reload to see the new state.`;

/** A press whose handler rejected anyway: the panel reports it and keeps its controls usable. */
export function webSearchPressFailure(cause: unknown): string {
  return `The action did not finish: ${cause instanceof Error ? cause.message : String(cause)}. Try again, or reload if the view looks stale.`;
}

export async function pressGetWebSearchKey(deps: Pick<WebSearchSetupDeps, 'command'>, preset: WebSearchPreset): Promise<{ ok: true } | { ok: false; message: string }> {
  if (preset.keyPage === null) return { ok: false, message: `${preset.name} has no key page to open.` };
  const outcome = await send(deps, { kind: 'shell.openExternal', url: preset.keyPage });
  return outcome.ok ? { ok: true } : { ok: false, message: outcome.detail ?? outcome.headline };
}

export async function pressOpenWebSearchFile(deps: Pick<WebSearchSetupDeps, 'command'>): Promise<{ ok: true } | { ok: false; message: string }> {
  const outcome = await send(deps, { kind: 'shell.openConfigFile' });
  return outcome.ok ? { ok: true } : { ok: false, message: outcome.detail ?? outcome.headline };
}

/** The whole handler set, bound to one sender — what `useMcp` spreads into the panel's props. */
export function bindWebSearchSetup(deps: WebSearchSetupDeps): WebSearchSetupHandlers {
  return {
    onSaveAndTest: (value, scope) => pressSaveAndTest(deps, value, scope),
    onEnableAndTest: () => pressEnableAndTest(deps),
    onDeleteKey: (scope) => pressDeleteWebSearchKey(deps, scope),
    onProbe: () => pressCheckWebSearch(deps),
    onOpenFile: () => pressOpenWebSearchFile(deps),
    onGetKey: (preset) => pressGetWebSearchKey(deps, preset),
  };
}
