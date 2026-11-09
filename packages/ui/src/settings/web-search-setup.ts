import type { CommandOutcome, CommandRequest, McpHealth, McpSecretRow, McpSecretWriteOutcome, McpSecretsView, McpServerRow } from '@rotaris/contracts';

/**
 * THE `web_search` SETUP CARD'S PURE HALF — the preset table, the stanza it hands over, the situation it is in, its
 * sentences, and the presses that send the four commands (`web-search-setup.test.ts`, `web-search-press.test.ts`).
 * Everything here is data and functions over props, so every state and every press is testable without a window, and
 * `McpSettings.tsx`'s `WebSearchSetupCard` only draws it.
 *
 * REQ-MCP-111: the dedicated control stores the built-in `web_search` server's key without the user naming the server
 * or the variable, and it is visible whether or not `web_search` is enabled. REQ-CONFIG-181 and resolution 15/03 #44
 * leave the VENDOR to the implementation and bind none — the preset list below is therefore content, recorded in one
 * table (this one) and deliberately not bound by the specification: replacing a vendor is an edit here and no spec
 * change.
 */

/**
 * The server name and the variable REQ-MCP-111's control writes: the shipped default's own entry key (REQ-CONFIG-181
 * builds `mcp_servers.web_search` whose url carries `${ROTARIS_SEARCH_API_KEY}` — one home for the literal is
 * `packages/config/src/mcp/defaults.ts`'s `WEB_SEARCH_KEY_VARIABLE`, which this package cannot import: `@rotaris/ui`
 * does not depend on `@rotaris/config`, so the requirement fixes the pair and this module is the UI's statement of it).
 */
export const WEB_SEARCH_SERVER = 'web_search';
export const WEB_SEARCH_KEY_VARIABLE = 'ROTARIS_SEARCH_API_KEY';

/** REQ-CONFIG-181's shipped url, shown as the example stanza before a preset is chosen. */
export const WEB_SEARCH_SHIPPED_URL = `https://search.rotaris.invalid/mcp?key=\${${WEB_SEARCH_KEY_VARIABLE}}`;

export interface WebSearchPreset {
  readonly id: string;
  readonly name: string;
  /** One line, ending in a period (the design brief §6's copy rule). */
  readonly description: string;
  /** The url the stanza declares, with the key placeholder where the provider takes it in the url. */
  readonly url: string;
  /** `false` for a provider whose key must travel in a header: the placeholder cannot ride the url there. */
  readonly keyInUrl: boolean;
  /** The header a header-auth provider's key travels in; set only when `keyInUrl` is false. */
  readonly keyHeader?: string;
  /** REQ-CHAT-076's link the row offers; `null` where there is no key page to open (a self-hosted server). */
  readonly keyPage: string | null;
}

/**
 * The vendor list (REQ-CONFIG-181, resolution 15/03 #44: the implementation's choice, deliberately not bound). One
 * entry exercises the other key flavour REQ-MCP-111 has to speak about — a key in a header, which the url-placeholder
 * control cannot satisfy (REQ-MCP-088 resolves placeholders in a remote entry's URL and nowhere else) — and two leave
 * the host to the user. Where a hosted MCP endpoint is not certain, the stanza carries the host to replace rather than
 * a guessed address, and `webSearchStanza` marks it an example.
 */
export const WEB_SEARCH_PRESETS: readonly WebSearchPreset[] = [
  {
    id: 'tavily',
    name: 'Tavily',
    description: 'A hosted search API for agents, with the key in the url.',
    url: `https://mcp.tavily.com/mcp/?tavilyApiKey=\${${WEB_SEARCH_KEY_VARIABLE}}`,
    keyInUrl: true,
    keyPage: 'https://app.tavily.com/home',
  },
  {
    id: 'brave',
    name: 'Brave Search',
    description: 'An independent index, reached through a Brave MCP front you run; the key travels as a request header.',
    url: 'https://<your-brave-mcp-host>/mcp',
    keyInUrl: false,
    keyHeader: 'X-Subscription-Token',
    keyPage: 'https://api-dashboard.search.brave.com/app/documentation',
  },
  {
    id: 'searxng',
    name: 'Your own SearXNG',
    description: 'Your own instance behind an MCP front; replace the host and drop the key if yours needs none.',
    url: `https://<your-searxng-host>/mcp?key=\${${WEB_SEARCH_KEY_VARIABLE}}`,
    keyInUrl: true,
    keyPage: null,
  },
  {
    id: 'other',
    name: 'Something else',
    description: 'Any other http search server you already run; replace the host in the stanza.',
    url: `https://<your-search-server>/mcp?key=\${${WEB_SEARCH_KEY_VARIABLE}}`,
    keyInUrl: true,
    keyPage: null,
  },
];

export function webSearchPreset(id: string | null): WebSearchPreset | null {
  if (id === null) return null;
  return WEB_SEARCH_PRESETS.find((p) => p.id === id) ?? null;
}

export interface WebSearchStanza {
  readonly text: string;
  /** True where the stanza carries a part the user must replace (a host, or a key to insert). */
  readonly example: boolean;
  /** The sentence under the stanza naming what to replace; null when nothing needs replacing. */
  readonly note: string | null;
}

/**
 * The stanza step 2 hands over: exactly `mcp_servers.web_search` with the chosen host, REQ-CONFIG-181's
 * `request_timeout: 600`, `enabled: true` — the durable enablement route REQ-MCP-115 names — and
 * `${ROTARIS_SEARCH_API_KEY}` where the provider takes the key in the url. REQ-CONFIG-350/464: this is TEXT for the
 * user's own file edit; the screen writes none of it and creates no server.
 *
 * A header-auth preset gets NO placeholder in its header: REQ-MCP-088's substitution runs over a remote entry's URL
 * only (`resolveRemoteUrl`), so a `${ROTARIS_SEARCH_API_KEY}` written into a header would stay literal forever and the
 * stanza would mislead. The header carries `<your key>` and the note says the value is inserted by hand — which is
 * also why step 3 hides itself for that preset.
 */
export function webSearchStanza(preset: WebSearchPreset | null): WebSearchStanza {
  const url = preset?.url ?? WEB_SEARCH_SHIPPED_URL;
  const header = preset !== null && !preset.keyInUrl ? preset.keyHeader ?? null : null;
  const lines = [
    'mcp_servers:',
    `  ${WEB_SEARCH_SERVER}:`,
    '    type: http',
    `    url: ${url}`,
  ];
  if (header !== null) lines.push('    headers:', `      ${header}: <your key>`);
  lines.push('    request_timeout: 600', '    enabled: true');
  // REQ-CONFIG-181's shipped host is a deliberately unreachable example (`search.rotaris.invalid`), so the default
  // stanza is marked as one too — the design brief §4 has the first-use cell say exactly that.
  const note = header !== null
    ? 'example — replace the host and put your key in the header value'
    : (preset === null || url.includes('<')) ? 'example — replace the host' : null;
  return { text: `${lines.join('\n')}\n`, example: note !== null, note };
}

/** REQ-CONFIG-350/464, in words on the card: the file edit is the user's and this screen authors no server. */
export const WEB_SEARCH_NOT_WRITTEN_BY_US = "Rotaris does not write this for you: a tool server's address is configuration you review.";

/** REQ-CONFIG-437: the file is NAMED; before the listing answers, the sentence names the file to look for. */
export function webSearchFileLine(configFile: string | null): string {
  return `File: ${configFile ?? "this workspace's configuration file (not read yet)"}`;
}

/** REQ-MCP-110's last sentence, with the refresh B1 + slice A made true. */
export const WEB_SEARCH_TAKE_EFFECT = 'A stored secret takes effect on the next configuration load; the row above refreshes with it.';

/** REQ-MCP-084/110: an empty value is refused and writes nothing — the store's own rule, refused here before anything is sent. */
export const EMPTY_KEY_REFUSAL = 'Enter the key before storing it; nothing was written.';

/** REQ-MCP-115: which control is in force — a stored key does not turn an entry the file holds disabled on (and only the row's toggle writes `enabled`). */
export const WEB_SEARCH_NEEDS_ENABLED = 'The file still needs `enabled: true`: the key is stored, but a server the configuration holds disabled stays off until the file says so — or until the row above is switched on, which writes it.';

/** Design state 2: the user's own declaration already stands, so step 2 hands over nothing to paste. */
export const WEB_SEARCH_DECLARATION_STANDS = 'Your declaration stands: the entry is already declared in the file, so there is nothing to paste here — step 3 is the next one.';

export const WEB_SEARCH_NO_ENTRY = 'No `web_search` entry is configured. Declare one under `mcp_servers` in this workspace\'s configuration file — a tool-server declaration is configuration you review, and this screen writes none of it.';

/** REQ-MCP-111/REQ-CONFIG-181: the key control belongs to the shipped `http` default, not to every transport. */
export function webSearchOtherTransport(type: McpServerRow['type']): string {
  return `The \`web_search\` entry here is a ${type} server. This key control belongs to the shipped http default, whose url carries the placeholder; for another transport, edit the configuration file and handle its key there.`;
}

/** The reason step 3 hides itself for a header-auth preset (design state 6, REQ-CONFIG-181, REQ-MCP-088). */
export function webSearchHeaderKeyNote(preset: WebSearchPreset, configFile: string | null): string {
  return `This provider's key travels in a header, not in the url, and the key control satisfies the url placeholder only: insert the value into ${preset.keyHeader ?? 'the header'} in ${configFile ?? 'the configuration file'} yourself. Step 3 does not apply to this preset.`;
}

/** REQ-CONFIG-225: the entry is unavailable while its url keeps a placeholder, with and without a stored key. */
export function webSearchUnresolvedNote(unresolved: readonly string[], hasStoredKey: boolean): string {
  const list = unresolved.map((v) => `\${${v}}`).join(', ');
  return hasStoredKey
    ? `The stored key satisfies nothing yet: the entry's url still carries ${list}, which no stored secret or environment variable resolved.`
    : `The entry's url still carries ${list}, which no stored secret or environment variable resolved; storing the key in step 3 is what satisfies it.`;
}

export const WEB_SEARCH_WORKING_SUMMARY = (scope: string): string =>
  `Everything this guide needs is in place: the http entry is declared, its url is resolved and it is enabled, and the key is stored (${scope}).`;

/** State 5's recovery sentence, shown as the probe's message beside its own detail. */
export const WEB_SEARCH_WRONG_ENDPOINT = "The server did not answer: the endpoint is wrong, the server is down, or the key is not accepted. Correct the entry's url in the file, reload the category, and test again.";

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

/**
 * REQ-SHELL-145/146: the preset radios are one tab station and the arrows move within it (REQ-CONFIG-348's selection
 * idiom, drawn as the repo's other radiogroups are). Pure so the keyboard behaviour is testable without a window.
 */
export function presetAfter(current: string | null, key: string): string | null {
  const ids = WEB_SEARCH_PRESETS.map((p) => p.id);
  if (key === 'Home') return ids[0] ?? null;
  if (key === 'End') return ids[ids.length - 1] ?? null;
  if (key !== 'ArrowDown' && key !== 'ArrowRight' && key !== 'ArrowUp' && key !== 'ArrowLeft') return null;
  const step = key === 'ArrowDown' || key === 'ArrowRight' ? 1 : -1;
  const at = current === null ? (step === 1 ? -1 : 0) : ids.indexOf(current);
  const next = (at + step + ids.length) % ids.length;
  return ids[next] ?? null;
}

/**
 * REQ-SHELL-145/146 with REQ-CONFIG-348's selection idiom: the preset radios are ONE tab station — the selected
 * radio carries `tabIndex` 0 and every other −1, and, the group holding no selection yet, the FIRST is the station,
 * so the group is reachable by Tab and the arrows (which move the selection with the focus, `presetAfter`) stay the
 * way in. Roving tabIndex, 2026-11-09: every radio used to be its own tab stop.
 */
export function presetTabIndex(current: string | null, id: string): 0 | -1 {
  const first = WEB_SEARCH_PRESETS[0]?.id ?? null;
  // A stale id (a preset withdrawn since the selection was made) leaves the group reachable all the same: the
  // station falls back to the first radio rather than to none, which would make the whole group unreachable.
  const station = WEB_SEARCH_PRESETS.some((p) => p.id === current) ? current : first;
  return id === station ? 0 : -1;
}

export interface WebSearchFacts {
  /** The sentence naming why the card is disabled (no workspace/service, or a fatal load), or null. */
  readonly unavailable: string | null;
  readonly row: McpServerRow | null;
  readonly storedKey: McpSecretRow | null;
  readonly health: McpHealth;
}

/**
 * The states table of the design brief §4/§10, as one closed vocabulary the card renders from. `fresh` is the shipped
 * default (origin `default`, no stored key); `needs-key` is a user declaration with no key yet — a different state
 * because there is nothing to hand over in step 2, the entry already standing in the file. `stored` is a keyed,
 * resolved, enabled entry the probe has not yet confirmed: steps 1–3 stay readable (the mask, the delete, the
 * afresh-store) and the collapse waits for `ready`, the probe's own Healthy (design §5.4's "both done — working").
 */
export type WebSearchSituation = 'unavailable' | 'no-entry' | 'other-transport' | 'fresh' | 'needs-key' | 'needs-enabled' | 'needs-unresolved' | 'wrong-endpoint' | 'stored' | 'ready';

export function webSearchSituation(facts: WebSearchFacts): WebSearchSituation {
  if (facts.unavailable !== null) return 'unavailable';
  const { row } = facts;
  if (row === null) return 'no-entry';
  if (row.type !== 'http') return 'other-transport';
  if (facts.storedKey === null) return row.origin === 'default' ? 'fresh' : 'needs-key';
  if (!row.enabled) return 'needs-enabled';
  if (row.unresolved.length > 0) return 'needs-unresolved';
  if (facts.health.state === 'unreachable') return 'wrong-endpoint';
  return facts.health.state === 'healthy' ? 'ready' : 'stored';
}

/** `Workspace`/`Global` as the write commands' scope vocabulary (REQ-CONFIG-463's opening choice). */
export type WebSearchScope = 'workspace' | 'global';
export const WEB_SEARCH_SCOPE_LABELS: Readonly<Record<WebSearchScope, string>> = { workspace: 'Workspace', global: 'Global' };

/**
 * The card's one in-flight state, one case per control that must not overlap itself (design brief §4's disabled
 * column; rework round 1, 2026-11-09): the three presses that touch the file (`store`, `remove`, `open`) and the
 * probe. While one holds, every control of the card is disabled, so two writes cannot race and a completion cannot
 * clear a draft typed meanwhile.
 */
export type WebSearchInFlight = 'store' | 'remove' | 'open' | 'probe';

/** The in-flight state said in words (REQ-SHELL-149: a state readable as text, never by a disabled control alone). */
export const WEB_SEARCH_IN_FLIGHT: Readonly<Record<WebSearchInFlight, string>> = {
  store: 'Storing the key…',
  remove: 'Deleting the stored key…',
  open: 'Opening the configuration file…',
  probe: 'Checking the server…',
};

/** REQ-MCP-110's confirmation, re-worded from the write's own masked outcome (the B1 reply) — never a value. */
export function storedKeySentence(outcome: Pick<McpSecretWriteOutcome, 'server' | 'key' | 'scope' | 'masked'>): string {
  const base = `Stored \`${outcome.key}\` for \`${outcome.server}\` (${outcome.scope})`;
  return outcome.masked === null ? `${base}.` : `${base}, value \`${outcome.masked}\`.`;
}

export function deletedKeySentence(outcome: Pick<McpSecretWriteOutcome, 'server' | 'key' | 'scope' | 'removed'>): string {
  return outcome.removed
    ? `Deleted \`${outcome.key}\` from \`${outcome.server}\` (${outcome.scope}).`
    : `No stored key was found for \`${outcome.server}\` in the ${outcome.scope} scope; nothing changed.`;
}

/** REQ-SHELL-144: each control's accessible name identifies it and its server. */
export const WEB_SEARCH_CONTROLS = {
  store: `Store the key for ${WEB_SEARCH_SERVER}`,
  delete: `Delete the stored key for ${WEB_SEARCH_SERVER}`,
  check: `Check the status of ${WEB_SEARCH_SERVER}`,
  key: (name: string): string => `Get a key from ${name}`,
} as const;

/**
 * THE PRESSES — which command each action of the card sends (REQ-MCP-110/111 with REQ-MCP-092 and REQ-CHAT-076). The
 * card takes these as props (`bindWebSearchSetup`), so the component holds no bridge and the command kinds a press
 * sends are assertable; `useMcp` binds them to `bridge.command` and the category's own re-reads.
 *
 *   - `Store the key` → `mcp.setSecret` (the value travels INWARD; the answer is the masked confirmation alone,
 *     REQ-MCP-081), and an empty value is refused HERE with nothing sent (REQ-MCP-084/110: refused, nothing written);
 *   - `Delete the stored key` → `mcp.unsetSecret` (REQ-MCP-110's delete);
 *   - `Get a key ↗` → the EXISTING `shell.openExternal` (REQ-CHAT-076; main's http/https-only guard does the policing);
 *   - `Open the file` → the configuration file through main's opener, `shell.openConfigFile` (REQ-CONFIG-350/464/437:
 *     the screen names the file and offers to open it; it authors nothing, and the renderer names no path);
 *   - `Check status` → the EXISTING single-server probe `mcp.probe {name}` (REQ-MCP-092).
 * After a write the listing and the secrets view are read again — B1's write fires the one `mcp.reload` seam in main,
 * so the row refreshes without a restart.
 */
export interface WebSearchSetupHandlers {
  readonly onOpenFile: () => Promise<{ ok: true } | { ok: false; message: string }>;
  readonly onGetKey: (preset: WebSearchPreset) => Promise<{ ok: true } | { ok: false; message: string }>;
  readonly onStoreKey: (value: string, scope: WebSearchScope) => Promise<{ ok: true; outcome: McpSecretWriteOutcome } | { ok: false; message: string }>;
  readonly onDeleteKey: (scope: WebSearchScope) => Promise<{ ok: true; outcome: McpSecretWriteOutcome } | { ok: false; message: string }>;
  readonly onProbe: () => Promise<McpHealth>;
}

export interface WebSearchSetupDeps {
  readonly command: (req: CommandRequest) => Promise<CommandOutcome>;
  /**
   * The re-read after a write: the listing and the secrets view. The card's own view is the one read with
   * `server: 'web_search'` (its stored key, REQ-MCP-083/110) — the category's chooser-filtered view may name another
   * server and never blanks the card (Minor 2, 2026-11-09).
   */
  readonly read: () => Promise<void>;
}

/** ADR-0019: `bridge.command` rejects when main's handler throws or the channel is gone, and the caller is a click handler. */
async function send(deps: WebSearchSetupDeps, req: CommandRequest): Promise<CommandOutcome> {
  try { return await deps.command(req); }
  catch (cause) { return { ok: false, code: 'command.unreachable', headline: 'The application did not answer', detail: cause instanceof Error ? cause.message : String(cause) }; }
}

export async function pressStoreWebSearchKey(deps: WebSearchSetupDeps, value: string, scope: WebSearchScope): Promise<{ ok: true; outcome: McpSecretWriteOutcome } | { ok: false; message: string }> {
  // REQ-MCP-084/110: refused here, and changed nothing anywhere — no command leaves the window.
  if (value === '') return { ok: false, message: EMPTY_KEY_REFUSAL };
  const outcome = await send(deps, { kind: 'mcp.setSecret', server: WEB_SEARCH_SERVER, key: WEB_SEARCH_KEY_VARIABLE, value, scope });
  if (!outcome.ok) return { ok: false, message: outcome.detail ?? outcome.headline };
  await deps.read();
  return { ok: true, outcome: outcome.value as McpSecretWriteOutcome };
}

export async function pressDeleteWebSearchKey(deps: WebSearchSetupDeps, scope: WebSearchScope): Promise<{ ok: true; outcome: McpSecretWriteOutcome } | { ok: false; message: string }> {
  const outcome = await send(deps, { kind: 'mcp.unsetSecret', server: WEB_SEARCH_SERVER, key: WEB_SEARCH_KEY_VARIABLE, scope });
  if (!outcome.ok) return { ok: false, message: outcome.detail ?? outcome.headline };
  await deps.read();
  return { ok: true, outcome: outcome.value as McpSecretWriteOutcome };
}

export async function pressGetWebSearchKey(deps: Pick<WebSearchSetupDeps, 'command'>, preset: WebSearchPreset): Promise<{ ok: true } | { ok: false; message: string }> {
  if (preset.keyPage === null) return { ok: false, message: `${preset.name} has no key page to open; declare its address in the configuration file.` };
  const outcome = await send({ ...deps, read: async () => undefined }, { kind: 'shell.openExternal', url: preset.keyPage });
  return outcome.ok ? { ok: true } : { ok: false, message: outcome.detail ?? outcome.headline };
}

export async function pressOpenWebSearchFile(deps: Pick<WebSearchSetupDeps, 'command'>): Promise<{ ok: true } | { ok: false; message: string }> {
  const outcome = await send({ ...deps, read: async () => undefined }, { kind: 'shell.openConfigFile' });
  return outcome.ok ? { ok: true } : { ok: false, message: outcome.detail ?? outcome.headline };
}

export async function pressCheckWebSearch(deps: Pick<WebSearchSetupDeps, 'command'>): Promise<McpHealth> {
  const outcome = await send({ ...deps, read: async () => undefined }, { kind: 'mcp.probe', name: WEB_SEARCH_SERVER });
  if (!outcome.ok) return { state: 'unreachable', detail: outcome.detail ?? outcome.headline };
  const result = (outcome.value as { name: string; health: McpHealth }[])[0];
  return result?.health ?? { state: 'unreachable', detail: 'no answer' };
}

/** The whole handler set, bound to one sender — what `useMcp` spreads into the card's props. */
export function bindWebSearchSetup(deps: WebSearchSetupDeps): WebSearchSetupHandlers {
  return {
    onOpenFile: () => pressOpenWebSearchFile(deps),
    onGetKey: (preset) => pressGetWebSearchKey(deps, preset),
    onStoreKey: (value, scope) => pressStoreWebSearchKey(deps, value, scope),
    onDeleteKey: (scope) => pressDeleteWebSearchKey(deps, scope),
    onProbe: () => pressCheckWebSearch(deps),
  };
}
