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

/**
 * THE STEP BAR, THE INFO DISCLOSURE AND THE ROW'S OWN OFFER (the stepper/inline-help change, 2026-11-09). The guided
 * card is walked through four named steps (REQ-MCP-111's own walk: a provider, the declaration, the key, the test),
 * the explanatory sentences sit behind one icon control instead of in front of the first step (progressive
 * disclosure — nothing here is gated, every body starts open), and the server row offers the way INTO the card while
 * it can still do something (`webSearchRowSetupVisible`). Everything in this section is data or a pure read over
 * props, so the labels, the current step and the row control's visibility are assertable without a window
 * (`web-search-stepper.test.ts`); `McpSettings.tsx` only draws them. REQ-SHELL-149: a step's number is TEXT
 * (`Step 2 · …`), never colour alone; REQ-SHELL-144: each of these controls carries a name — the step label itself,
 * `WEB_SEARCH_ABOUT_CONTROL`, `WEB_SEARCH_SETUP_ROW_LABEL`.
 */
export type WebSearchStepId = 'provider' | 'declaration' | 'key' | 'test';

/** One step of the bar: the id its control and body are marked with, and the heading its body carries. */
export interface WebSearchStep { readonly id: WebSearchStepId; readonly title: string; }

/**
 * The four steps in order; `title` is the body's own heading (today's `h2` texts, word for word). The list is the ONE
 * home of the bar's order and numbering — the card maps over it, so a fifth step would be an edit here and nowhere
 * else.
 */
export const WEB_SEARCH_STEPS: readonly WebSearchStep[] = [
  { id: 'provider', title: 'Choose your search provider' },
  { id: 'declaration', title: 'Put this in your configuration file' },
  { id: 'key', title: 'Paste the key' },
  { id: 'test', title: 'Test it' },
];

/**
 * The visible label of one bar control: `Step 1 · Choose your search provider`. The number is made HERE, from the
 * step's position in `WEB_SEARCH_STEPS` (never spelled in the JSX), so the bar's numbering has one home and the
 * label is assertable as text (REQ-SHELL-149).
 */
export function webSearchStepLabel(index: number, step: WebSearchStep): string {
  return `Step ${index + 1} · ${step.title}`;
}

/**
 * The step that needs the user next, situation for situation (`aria-current="step"` and the row control's focus
 * target both read this). `fresh`/`other-transport` stand at the choice — no key can be pasted before a provider is
 * chosen, and the key control belongs to the shipped `http` default (REQ-CONFIG-181). `needs-key` and
 * `needs-unresolved` land on `key`: step 3 owns the field and REQ-CONFIG-225's unresolved sentence.
 * `needs-enabled` lands on `declaration` (step 2) instead: the key is ALREADY stored there (REQ-MCP-115), and what
 * still needs the user is the durable enablement — `enabled: true` in the file, or the row switched on, which writes
 * it — a configuration edit, which is step 2's business, not the key step's; `WEB_SEARCH_NEEDS_ENABLED` still says so
 * in step 3's body (design note §4's own row, F2 of the PR #77 UI review, 2026-11-09). A stored key is at `test` —
 * REQ-MCP-092's probe is what decides whether anything is left to do.
 */
const WEB_SEARCH_STEP_FOR: Readonly<Record<WebSearchSituation, WebSearchStepId>> = {
  unavailable: 'provider', 'no-entry': 'provider', 'other-transport': 'provider', fresh: 'provider',
  'needs-key': 'key', 'needs-enabled': 'declaration', 'needs-unresolved': 'key',
  stored: 'test', 'wrong-endpoint': 'test', ready: 'test',
};

export function webSearchStepFor(situation: WebSearchSituation): WebSearchStepId {
  return WEB_SEARCH_STEP_FOR[situation];
}

/**
 * The sentences behind the head's icon control — the card's prose disclosure, word for word as they stood before this
 * change (only their fundstelle moves): the flow's summary, whose content the bar now carries (REQ-MCP-111);
 * REQ-CONFIG-350/464's boundary sentence; and REQ-MCP-110's take-effect sentence. The wording is the implementation's
 * (REQ-CONFIG leaves it open); the three statements do not change.
 */
export const WEB_SEARCH_ABOUT: readonly string[] = [
  'Point the built-in web-search server at a provider you have a key for: choose a provider, put the declaration in your configuration file, paste the key and test it.',
  WEB_SEARCH_NOT_WRITTEN_BY_US,
  WEB_SEARCH_TAKE_EFFECT,
];

/** REQ-SHELL-144: the icon control's accessible name and tooltip — it names the surface, never a generic `Info`. */
export const WEB_SEARCH_ABOUT_CONTROL = 'About web search setup';

/**
 * The control's name per state: the same control hides the region once it is open, so the name says which press is
 * offered (one sentence; the closed name is `WEB_SEARCH_ABOUT_CONTROL`, the brief's own JSX and the row of §D.2's
 * test both tie the closed state to that constant).
 */
export function webSearchAboutControlLabel(open: boolean): string {
  return open ? 'Hide help about the web search setup' : WEB_SEARCH_ABOUT_CONTROL;
}

/**
 * REQ-MCP-108's one venue with REQ-MCP-111's visible-anyway rule: THIS row offers the way INTO the guided card, and
 * the offer stands only while the row is the one the card is about, the transport is the one the key control belongs
 * to, the entry is the SHIPPED default (a user's own declaration is already guided by the card's `needs-key` step,
 * REQ-CONFIG-225), and no key is stored for it yet (REQ-MCP-110; with a key stored, the card is where it is changed,
 * and the offer would promise nothing new). The row's own NAME is part of the predicate, so the call site passes each
 * row and no row other than `web_search` can ever offer it.
 */
export function webSearchRowSetupVisible(row: McpServerRow | null, storedKey: McpSecretRow | null): boolean {
  return row !== null && row.name === WEB_SEARCH_SERVER && row.type === 'http' && row.origin === 'default' && storedKey === null;
}

/**
 * The row control's visible words — the surface's own name, and NOT "Add provider": REQ-CONFIG-350/464 let this
 * screen create no server, and a string says what it does.
 */
export const WEB_SEARCH_SETUP_ROW_ACTION = 'Set up web search';

/** REQ-SHELL-144: the row control's accessible name identifies it and its server. */
export const WEB_SEARCH_SETUP_ROW_LABEL = `Set up web search for ${WEB_SEARCH_SERVER}`;

/** What the press does, as the accessible description: the step it lands on, and the boundary REQ-CONFIG-350/464 draw.
 *  It says `Moves to`, not `Opens`: the card is rendered unconditionally (there is no closed card the press makes
 *  visible), and the press sets FOCUS on the current step's bar control, bringing that already-present region into
 *  view (F4 of the PR #77 UI review, 2026-11-09). */
export const WEB_SEARCH_SETUP_ROW_DESCRIPTION = 'Moves to the `Set up web search` card in this category at the step that needs you; the provider\'s declaration is a file edit you make.';

/** `Workspace`/`Global` as the write commands' scope vocabulary (REQ-CONFIG-463's opening choice). */
export type WebSearchScope = 'workspace' | 'global';
export const WEB_SEARCH_SCOPE_LABELS: Readonly<Record<WebSearchScope, string>> = { workspace: 'Workspace', global: 'Global' };

/**
 * Round-2 Major 3, corrected in round 3: the BASIS a card probe result is kept under — the serialised situation
 * inputs it was taken against. `WebSearchFacts` IS those inputs (the entry, the stored key, the two other facts, and
 * the health), so a card's own probe result is read only while this basis still holds: a changed entry, a changed
 * situation input or a changed (newer) parent health drops a result that describes an older state, so an earlier
 * Healthy can never keep a changed, untested endpoint `ready`, and an older card result can never override a newer
 * category probe. Round-3 Major 1: the basis describes only what the card can OBSERVE, and the stored key's mask is
 * deliberately NOT part of it — production masks every value identically (`REDACTION_MARK`, `run-host/mcp.ts`'s
 * `secrets()`), so a replaced key in the same scope arrives with a byte-identical mask and a basis carrying it would
 * claim an invalidation it can never see (the round-2 tests steered a CHANGING mask production never supplies). The
 * key replacement the card CAN observe is its own write, which drops the result at the press; a replacement OUTSIDE
 * the card is invisible to the card by design (REQ-MCP-081 keeps the value from it), and the row's own state is what
 * carries it: the entry's resolution/availability is in the basis, and the category's reload re-reads the row. Where
 * the value can change with every observable field equal, the honest reading is the one this basis states: the card's
 * result is about the entry it probed, not about the value behind it.
 *
 * The card's own preset selection is deliberately NOT part of the basis: the probe tests the LIVE entry in the file,
 * and the radio only chooses the stanza step 2 hands over — selecting another preset changes nothing a probe observed.
 * `elapsedMs` is left out for the same reason: it is not an input of the classification.
 */
export function webSearchProbeBasis(facts: WebSearchFacts): string {
  const { row, storedKey, health } = facts;
  return JSON.stringify([
    facts.unavailable,
    row === null ? null : [row.name, row.type, row.line, row.origin, row.enabled, row.overridden, row.available, row.availabilityDetail, [...row.unresolved]],
    // Round-3 Major 1: server, key and scope only — the mask says nothing a basis could key on (see above).
    storedKey === null ? null : [storedKey.server, storedKey.key, storedKey.scope],
    [health.state, health.toolCount ?? null, health.detail ?? null],
  ]);
}

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
  readonly onStoreKey: (value: string, scope: WebSearchScope) => Promise<WebSearchWriteReply>;
  readonly onDeleteKey: (scope: WebSearchScope) => Promise<WebSearchWriteReply>;
  readonly onProbe: () => Promise<McpHealth>;
}

/**
 * REQ-MCP-110's write outcome, or the words of a refusal. `refreshFailure` is the re-read's own refusal for the case
 * the write STOOD but the view could not be refreshed (round-2 Major 2): the card reports it instead of pretending
 * the view is current, and it is the honest alternative to rejecting the press — a rejection out of a click handler
 * would strand the card's in-flight state and leave the card disabled, reporting nothing.
 */
export type WebSearchWriteReply =
  | { readonly ok: true; readonly outcome: McpSecretWriteOutcome; readonly refreshFailure: string | null }
  | { readonly ok: false; readonly message: string };

/**
 * Round-3 Minor: the post-write re-read's OUTCOME — a refreshed view, or the refusal's own words. `bridge.command`
 * refuses inside a RESOLVED `CommandOutcome` rather than throwing, so the binder's reads answer a refusal here; the
 * press helper reads it (`refreshAfterWrite`) so a refused refresh travels to `refreshFailure` instead of being read
 * as a successful refresh of a view that never arrived.
 */
export type WebSearchRefreshReply = { readonly ok: true } | { readonly ok: false; readonly message: string };

export interface WebSearchSetupDeps {
  readonly command: (req: CommandRequest) => Promise<CommandOutcome>;
  /**
   * The re-read after a write: the listing and the secrets view. The card's own view is the one read with
   * `server: 'web_search'` (its stored key, REQ-MCP-083/110) — the category's chooser-filtered view may name another
   * server and never blanks the card (Minor 2, 2026-11-09). Round-3 Minor: the read ANSWERS — `{ ok: true }` when the
   * view was refreshed, the refusal's words when the command refused — because a refused command resolves in this
   * codebase rather than throwing, and a refusal the helper could not see is a stale view reported as current.
   */
  readonly read: () => Promise<WebSearchRefreshReply>;
}

/** ADR-0019: `bridge.command` rejects when main's handler throws or the channel is gone, and the caller is a click handler. */
async function send(deps: WebSearchSetupDeps, req: CommandRequest): Promise<CommandOutcome> {
  try { return await deps.command(req); }
  catch (cause) { return { ok: false, code: 'command.unreachable', headline: 'The application did not answer', detail: cause instanceof Error ? cause.message : String(cause) }; }
}

export async function pressStoreWebSearchKey(deps: WebSearchSetupDeps, value: string, scope: WebSearchScope): Promise<WebSearchWriteReply> {
  // REQ-MCP-084/110: refused here, and changed nothing anywhere — no command leaves the window.
  if (value === '') return { ok: false, message: EMPTY_KEY_REFUSAL };
  const outcome = await send(deps, { kind: 'mcp.setSecret', server: WEB_SEARCH_SERVER, key: WEB_SEARCH_KEY_VARIABLE, value, scope });
  if (!outcome.ok) return { ok: false, message: outcome.detail ?? outcome.headline };
  const refreshFailure = await refreshAfterWrite(deps);
  return { ok: true, outcome: outcome.value as McpSecretWriteOutcome, refreshFailure };
}

export async function pressDeleteWebSearchKey(deps: WebSearchSetupDeps, scope: WebSearchScope): Promise<WebSearchWriteReply> {
  const outcome = await send(deps, { kind: 'mcp.unsetSecret', server: WEB_SEARCH_SERVER, key: WEB_SEARCH_KEY_VARIABLE, scope });
  if (!outcome.ok) return { ok: false, message: outcome.detail ?? outcome.headline };
  const refreshFailure = await refreshAfterWrite(deps);
  return { ok: true, outcome: outcome.value as McpSecretWriteOutcome, refreshFailure };
}

/**
 * The re-read after a write, made TOTAL (round-2 Major 2) and OUTCOME-AWARE (round-3 Minor): the binder's `read`
 * awaits bridge commands, the press is a click handler, and nothing it awaits may reject out of it. Round 2 made the
 * refusal TRAVEL (the words come back in `refreshFailure`, the card says the view is stale — `WEB_SEARCH_REFRESH_FAILED`)
 * and cleared the busy state in the card's `finally`; an unguarded `await deps.read()` used to reject out of the press
 * and skip `setInFlight(null)`, leaving the card disabled forever and silent.
 *
 * Round-3 Minor: a THROWN failure was never the whole story. `bridge.command` answers a refused command as a resolved
 * `{ ok: false, … }`, the binder's reads used to swallow that (`if (r.ok)`), and a refused refresh then resolved as a
 * successful one: `refreshFailure` came back `null` and a stale view stood with no warning — the very thing round-2
 * Major 2 was meant to prevent. `WebSearchSetupDeps.read` now ANSWERS its outcome (`WebSearchRefreshReply`), and this
 * helper reads it beside the throw, carrying a refusal's words to the card unchanged.
 */
async function refreshAfterWrite(deps: WebSearchSetupDeps): Promise<string | null> {
  try {
    const outcome = await deps.read();
    return outcome.ok ? null : outcome.message;
  } catch (cause) { return cause instanceof Error ? cause.message : String(cause); }
}

/** Round-2 Major 2: the write stood, the re-read after it did not — said, not swallowed (REQ-SHELL-149: text). */
export const WEB_SEARCH_REFRESH_FAILED = (detail: string): string =>
  `The write went through, but the category could not be refreshed: ${detail}. Reload the category to see the new state.`;

/**
 * Round-2 Major 2: a press whose handler rejected anyway (a binding that broke, a bridge that threw before `send`
 * could answer it) — the card reports it, keeps its controls usable, and never leaves a rejection unhandled.
 */
export function webSearchPressFailure(cause: unknown): string {
  return `The action did not finish: ${cause instanceof Error ? cause.message : String(cause)}. Try again, or reload the category if the view looks stale.`;
}

export async function pressGetWebSearchKey(deps: Pick<WebSearchSetupDeps, 'command'>, preset: WebSearchPreset): Promise<{ ok: true } | { ok: false; message: string }> {
  if (preset.keyPage === null) return { ok: false, message: `${preset.name} has no key page to open; declare its address in the configuration file.` };
  const outcome = await send({ ...deps, read: async () => ({ ok: true }) }, { kind: 'shell.openExternal', url: preset.keyPage });
  return outcome.ok ? { ok: true } : { ok: false, message: outcome.detail ?? outcome.headline };
}

export async function pressOpenWebSearchFile(deps: Pick<WebSearchSetupDeps, 'command'>): Promise<{ ok: true } | { ok: false; message: string }> {
  const outcome = await send({ ...deps, read: async () => ({ ok: true }) }, { kind: 'shell.openConfigFile' });
  return outcome.ok ? { ok: true } : { ok: false, message: outcome.detail ?? outcome.headline };
}

export async function pressCheckWebSearch(deps: Pick<WebSearchSetupDeps, 'command'>): Promise<McpHealth> {
  const outcome = await send({ ...deps, read: async () => ({ ok: true }) }, { kind: 'mcp.probe', name: WEB_SEARCH_SERVER });
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
