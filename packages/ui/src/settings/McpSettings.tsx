import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { SettingsPageContext, SettingsTitle } from './page.js';
import type { ConfigSnapshot, InboundExposure, McpHealth, McpListing, McpProvisioning, McpSecretsView, McpServerRow, McpSetupStatus, McpSetupStep } from '@rotaris/contracts';
import { Button as DesignButton, Card as DesignCard, Input as DesignInput, Select as DesignSelect, Table as DesignTable } from '../design-system/index.js';
import { Confirm } from './Confirm.js';
import { Fatal } from './ConfigSettings.js';
import {
  deletedKeySentence, webSearchFileLine, webSearchHost, webSearchKeyApplies, webSearchOtherTransport, webSearchPreset, webSearchProbeBasis,
  webSearchProbeSentence, webSearchPressFailure, webSearchProviderOf, webSearchRowSetupVisible, webSearchSituation, webSearchStanza, webSearchStatus,
  webSearchStoredKey, webSearchUnresolvedNote,
  WEB_SEARCH_ABOUT, WEB_SEARCH_ABOUT_CONTROL, WEB_SEARCH_CONTROLS, WEB_SEARCH_EDIT_YOURSELF, WEB_SEARCH_IN_FLIGHT, WEB_SEARCH_KEY_VARIABLE, WEB_SEARCH_NO_ENTRY, WEB_SEARCH_OFF, WEB_SEARCH_OTHER_PROVIDER,
  WEB_SEARCH_OTHER_PROVIDER_LEDE, WEB_SEARCH_PRESETS, WEB_SEARCH_REFRESH_FAILED, WEB_SEARCH_SCOPE_LABELS, WEB_SEARCH_SERVER, WEB_SEARCH_SETUP_ROW_ACTION,
  WEB_SEARCH_SETUP_ROW_DESCRIPTION, WEB_SEARCH_SETUP_ROW_LABEL,
  type WebSearchInFlight, type WebSearchPreset, type WebSearchSaveReply, type WebSearchScope, type WebSearchSetupHandlers,
} from './web-search-setup.js';

/**
 * REQ-MCP-091/092/108/109/115, REQ-CONFIG-350..353/437: the "MCP Servers" category. Structure from docs/spec; craft from
 * docs/design (tokens by name — the status dot, the toggle, the settings grid and the card are the adopted components).
 * The "Configured servers" card lists EVERY configured server, disabled ones included, with the four-state health as
 * text beside the indicator, the `{name} · {type}` label, the masked muted line, the origin word and the toggle; the
 * header's "Check status" probes sequentially through the run host; the secrets card is the READ side, and since
 * 2026-11-09 the WRITE side of REQ-MCP-110/111 is built — the `Web search` panel below (R-119) stores,
 * replaces and deletes the built-in server's key through `mcp.setSecret`/`mcp.unsetSecret` (B1).
 *
 * ADR-0035 (Part T): the "Code intelligence" card carries REQ-MCP-112's action for THIS workspace — "Set up code
 * intelligence for this workspace" — with REQ-MCP-099's three steps as text (which is in progress, which finished and
 * how), cancellable, one final outcome of three, re-runnable, a second concurrent run refused by the run host. The
 * machine-setup half of REQ-MCP-112 (developer tooling, package caches) and the warm steps of REQ-MCP-095/096 belong
 * with the onboarding domain's task registry (REQ-MCP-045/098), which does not exist; the bundle makes them moot for
 * `code_intelligence`, and the card says so as text (REQ-SHELL-149).
 *
 * ESC-32 / IC-7 (2026-09-06): the card also carries REQ-MCP-118's language-server disclosure — the runtime is installed,
 * its language servers are not: each is downloaded at the first use of a symbol tool for that language, into the
 * runtime's store under the per-user data directory; the declared packages (name, version, licence, source) come from
 * the run host's status, which reads the binding manifest (REQ-MCP-116). Text only; present whenever the card is.
 */
export interface McpSettingsProps {
  readonly listing: McpListing | null;
  readonly loading: boolean;
  readonly error: string | null;
  /** Health per server name; absent means `unknown` (never persisted, REQ-MCP-092). */
  readonly health: Readonly<Record<string, McpHealth>>;
  readonly probing: boolean;
  readonly onRefresh: () => void;
  readonly onProbeAll: () => Promise<void>;
  readonly onToggle: (name: string, enabled: boolean) => Promise<{ ok: boolean; message: string }>;
  readonly secrets: McpSecretsView | null;
  /**
   * The web search panel's OWN secrets view (Minor 2, 2026-11-09): read with `server: 'web_search'` and never the
   * chooser's, so the category's stored-secrets filter (which may name another server) cannot blank the card's
   * stored-key state or take away its delete action. The parent row's view stays `secrets`.
   */
  readonly webSearchSecrets: McpSecretsView | null;
  readonly onSecretsServer: (server: string | null) => void;
  /** REQ-MCP-099/112: the project setup's status as the run host holds it; null before the first read. */
  readonly setup: McpSetupStatus | null;
  readonly onSetupStart: () => Promise<{ ok: boolean; message: string }>;
  readonly onSetupCancel: () => Promise<void>;
  /**
   * OQ-279 / REQ-CONFIG-478: the configuration snapshot when it did not load — the web search panel draws its empty state and
   * disables its controls, as Skills, Models, Personas and Runtime do (REQ-CONFIG-424 for the no-service half).
   */
  readonly fatal?: ConfigSnapshot | undefined;
  /**
   * The web search panel's presses (REQ-MCP-110/111/092, REQ-CHAT-076, REQ-CONFIG-437): `bindWebSearchSetup`
   * over `bridge.command` — the card itself holds no bridge, and a press's command kinds are pinned in
   * `web-search-press.test.ts`.
   */
  readonly webSearchSetup: WebSearchSetupHandlers;
  /**
   * ADR-0067 / REQ-MCP-120: the inbound surface's control — the one switch that exposes the product to external agents
   * for THIS session. Off by default, never persisted; the card shows the port and the token while it is on. It sits in
   * the register of the per-server enable toggle and adds no configuration key (REQ-MCP-120).
   */
  readonly inbound?: InboundSurfaceProps | undefined;
  /**
   * The row control's focus route: the panel REGISTERS a function that focuses its key field, and unregisters it when
   * it unmounts (`null`) — so the category's row can land the user there without knowing the panel's layout, and
   * neither side reaches into the other's props (a ref passed through props may not be written by the receiver).
   */
  readonly onSetupFocusRoute?: ((focus: (() => void) | null) => void) | undefined;
}

/**
 * ADR-0067 / REQ-MCP-120: the inbound surface's control, as the MCP category draws it. `exposure` is what main holds
 * (off until the user turns it on, per session); `onToggle` presses the switch and answers the fresh exposure, whose
 * `token` is present on the enabling press alone (REQ-MCP-121: shown once).
 */
export interface InboundSurfaceProps {
  readonly exposure: InboundExposure | null;
  readonly onToggle: (enabled: boolean) => Promise<{ ok: boolean; message: string }>;
}

const HEALTH_TEXT: Record<McpHealth['state'], string> = { unknown: 'Unknown', checking: 'Checking…', healthy: 'Healthy', unreachable: 'Unreachable' };

/**
 * ADR-0067 / REQ-MCP-120: the inbound surface's card. One switch, in the register of the per-server enable toggle —
 * off by default, per session, never persisted — describing what the surface is and how to reach it (REQ-MCP-119: a
 * loopback address and the ephemeral port the OS chose), with the bearer token shown ONCE when it is switched on
 * (REQ-MCP-121). It adds no configuration key: the card says so rather than letting the user take it for a toggle that
 * did not stick.
 */
function InboundSurfaceCard({ inbound }: { inbound: InboundSurfaceProps }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const on = inbound.exposure?.enabled ?? false;
  const port = inbound.exposure?.port ?? null;
  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    const r = await inbound.onToggle(!on);
    setBusy(false);
    if (!r.ok) { setMessage(r.message); return; }
    setMessage(null);
    // REQ-MCP-121: the token is shown once — the enabling press's own answer carries it, and nothing else does.
    setToken(inbound.exposure?.token ?? null);
  };
  return (
    <DesignCard className="card settings__card" data-mcp-inbound>
      <div className="providers-card__head">
        <div className="card-kicker">External agents</div>
        <div className="providers-card__actions">
          <DesignButton type="button" className={`toggle${on ? ' is-on' : ''}`} role="switch" aria-checked={on} aria-label={on ? 'Turn the external agents surface off' : 'Turn the external agents surface on for this session'} disabled={busy} onClick={() => { void toggle(); }} data-inbound-toggle />
        </div>
      </div>
      <p className="text-secondary settings__lede">Serves this running instance to external agents over MCP on the loopback interface only — <code className="mono">127.0.0.1</code> and <code className="mono">::1</code> — on an ephemeral port. Two tools are offered: one to start a run in the workspace that is open, one to read that run’s state. Approvals and questions are still answered here, by you; the caller can only start and watch. Off until you switch it on, and for this session only — quitting the application revokes it. This is not an entry in your configuration file.</p>
      {on ? (
        <div data-inbound-exposure>
          <p className="text-secondary"><span className="card-kicker">Address</span> <code className="mono" data-inbound-address>{port === null ? '(binding…)' : `http://127.0.0.1:${port}/mcp`}</code></p>
          {token !== null ? (
            <p className="text-secondary" data-inbound-token><span className="card-kicker">Bearer token</span> <code className="mono">{token}</code> — shown once. Give it to the agent that may call this surface; it is required on every request, and switching the surface off invalidates it.</p>
          ) : (
            <p className="text-secondary" data-inbound-token-hidden>The bearer token is shown once, when the surface is switched on. Switch it off and on again to mint a new one.</p>
          )}
        </div>
      ) : null}
      {message ? <p className="composer__error" role="alert">{message}</p> : null}
    </DesignCard>
  );
}const STEP_TEXT: Record<McpSetupStep['status'], string> = { pending: 'Not started', running: 'In progress…', succeeded: 'Succeeded', failed: 'Failed', 'skipped-no-code': 'Skipped — no code', 'not-attempted': 'Not attempted' };
const OUTCOME_TEXT: Record<NonNullable<McpSetupStatus['outcome']>, string> = { completed: 'Completed', failed: 'Only partly set up', cancelled: 'Cancelled', unavailable: 'Not available' };

function Row({ row, health, probing, onToggle, onOpenWebSearchSetup, showWebSearchSetup }: { row: McpServerRow; health: McpHealth; probing: boolean; onToggle: McpSettingsProps['onToggle']; onOpenWebSearchSetup?: (() => void) | undefined; showWebSearchSetup?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const on = row.enabled && !row.overridden && row.available;
  const stateText = health.state === 'healthy' ? `${HEALTH_TEXT.healthy} · ${health.toolCount ?? 0} tool${health.toolCount === 1 ? '' : 's'}` : HEALTH_TEXT[health.state];
  const tooltip = health.state === 'unreachable' ? health.detail ?? '' : undefined;
  // PD-CONFIG-006: an available row whose configured value is `false` is the one case the press is DURABLE — it writes
  // `mcp_servers.<name>.enabled: true` through the scoped per-field write path, so its switch, its accessible name and
  // its hint say so rather than promising a session toggle (REQ-MCP-115: the category says plainly which control is in
  // force and names `enabled` and the file as the way to make it persistent).
  // REQ-MCP-115: which of the two controls is in force, as text. REQ-MCP-091/092 fix the tooltip sentence for the case
  // those requirements were written for — a stdio entry whose command was not found on the executable search path — and
  // it is kept verbatim for every stdio row. REQ-CONFIG-371 gives the general rule the sentence is an instance of ("the
  // detail a row shows for an unavailable thing names the missing prerequisite"), and for a REMOTE entry the missing
  // prerequisite is its url: REQ-CONFIG-225 marks an entry whose url still carries an unresolved placeholder unavailable.
  // So a remote row reads the host's own detail. Until 2026-11-08 every unavailable row read the PATH sentence, which on
  // a remote row named a command the entry does not have.
  const unavailableText = row.type !== 'stdio' && row.availabilityDetail !== '' ? row.availabilityDetail : 'the command was not found on the executable search path';
  const enablement = !row.enabled ? 'Configured off (enabled: false in the configuration file).' : row.overridden ? 'Overridden for this session — not persistent. To make it durable, set enabled in the configuration file.' : row.available ? 'On.' : `Off: ${unavailableText}`;
  const durablePress = !row.enabled && row.available;
  const accessibleName = durablePress ? `Enable ${row.name}` : `Enable ${row.name} for this session`;
  const accessibleDescription = durablePress
    ? `Configured off (enabled: false in the configuration file). Switching on writes enabled: true to the configuration file; the change is persistent.`
    : enablement;
  const title = !row.available ? unavailableText : durablePress ? 'Switching this on writes enabled: true to the configuration file; the change is persistent.' : undefined;
  const toggle = async () => {
    if (busy || !row.available) return;
    setBusy(true);
    const r = await onToggle(row.name, !on);
    setBusy(false);
    setMessage(r.ok ? null : r.message);
  };
  return (
    <tr data-mcp-server={row.name} data-health={health.state} data-enabled={on ? 'yes' : 'no'} data-overridden={row.overridden ? 'yes' : 'no'} data-available={row.available ? 'yes' : 'no'}>
      <td>
        <span className={`mcp__dot${health.state === 'checking' && !probing ? '' : ''}`} data-state={health.state} aria-hidden="true" />
        <span data-health-text title={tooltip}>{stateText}</span>
        {health.state === 'unreachable' && health.detail ? <div className="text-tertiary settings__hint" data-health-detail>{health.detail}</div> : null}
      </td>
      <td>
        <div><span className="mono">{row.name}</span> · {row.type}</div>
        <div className="mono text-tertiary settings__origin" data-line>{row.line}</div>
        {row.unresolved.length > 0 ? <div className="text-tertiary settings__hint">Present but unavailable: {row.unresolved.map((v) => `\${${v}}`).join(', ')} unresolved.</div> : null}
      </td>
      <td data-origin>{row.origin === 'default' ? <span className="settings__lede">{row.origin}</span> : row.origin}</td>
      <td>
        <DesignButton type="button" className={`toggle${on ? ' is-on' : ''}`} role="switch" aria-checked={on} aria-label={accessibleName} aria-description={accessibleDescription} disabled={!row.available || busy} title={title} onClick={() => { void toggle(); }} />
        {/*
          The way INTO the web search panel, beside the switch: it stands while the row waits on its key and none is
          stored (`webSearchRowSetupVisible`), and its press lands on the panel's key field.
        */}
        {showWebSearchSetup ? (
          <DesignButton type="button" className="btn btn-link btn-compact" data-websearch-row-setup
            aria-label={WEB_SEARCH_SETUP_ROW_LABEL} aria-description={WEB_SEARCH_SETUP_ROW_DESCRIPTION}
            onClick={() => onOpenWebSearchSetup?.()}>{WEB_SEARCH_SETUP_ROW_ACTION}</DesignButton>
        ) : null}
        <div className={`text-tertiary settings__hint${row.overridden || (row.enabled && !row.available) ? '' : ' settings__lede'}`} data-enablement>{enablement}</div>
        {message ? <div className="composer__error" role="alert">{message}</div> : null}
      </td>
    </tr>
  );
}

/** REQ-MCP-118: the language-server disclosure — text, never colour; readable before any fetch it describes. */
function LanguageServers({ provisioning }: { provisioning: McpProvisioning }) {
  return (
    <div data-language-servers>
      <div className="card-kicker">Language servers</div>
      <p className="text-secondary settings__lede">
        The bundled runtime is installed with Rotaris; the language servers its symbol tools use are not. At the first use of a symbol tool for a
        language, the runtime downloads that language's server into <span className="mono" data-language-server-store>{provisioning.store}</span>.
        Nothing is downloaded before then.
      </p>
      <ul className="settings__hint" aria-label="Declared language servers">
        {provisioning.servers.map((s) => s.packages.map((p) => (
          <li key={`${s.language}/${p.name}`} data-language-server={p.name} data-language={s.language} data-version={p.version}>
            <span className="mono">{p.name} {p.version}</span> — {s.language}; licence {p.license}; via {s.provisioner} from <span className="mono">{p.source}</span>
          </li>
        )))}
      </ul>
      <p className="text-tertiary settings__hint">A further language the runtime supports obtains its server the same way at first use and is not declared here.</p>
    </div>
  );
}

/** REQ-MCP-112: progress per step as text, one final outcome, cancel while running, re-run when finished. */
function SetupCard({ setup, onStart, onCancel }: { setup: McpSetupStatus | null; onStart: McpSettingsProps['onSetupStart']; onCancel: McpSettingsProps['onSetupCancel'] }) {
  const [message, setMessage] = useState<string | null>(null);
  const running = setup?.state === 'running';
  const start = async () => { setMessage(null); const r = await onStart(); if (!r.ok) setMessage(r.message); };
  return (
    <DesignCard className="card settings__card" data-mcp-setup data-setup-state={setup?.state ?? 'unknown'} data-setup-outcome={setup?.outcome ?? ''}>
      <div className="providers-card__head">
        <div className="card-kicker">Code intelligence</div>
        <div className="providers-card__actions">
          {running
            ? <DesignButton type="button" className="btn btn-secondary btn-compact" onClick={() => { void onCancel(); }} data-action="setup-cancel">Cancel</DesignButton>
            : <DesignButton type="button" className="btn btn-secondary btn-compact" disabled={setup === null} onClick={() => { void start(); }} data-action="setup-start">{setup?.state === 'finished' ? 'Set up again' : 'Set up code intelligence for this workspace'}</DesignButton>}
        </div>
      </div>
      <p className="text-secondary settings__lede">Creates the bundled runtime's project for this workspace, indexes it and initialises its project memories — three steps, in order, each bounded; a workspace without code gets the project only. Runs in the background; you can cancel between steps or while a step is running.</p>
      {setup ? <LanguageServers provisioning={setup.provisioning} /> : null}
      {message ? <p className="composer__error" role="alert" data-setup-refused>{message}</p> : null}
      {setup === null ? <p className="text-secondary">Reading…</p> : (
        <>
          <ol className="settings__steps" aria-label="Setup steps" data-setup-steps>
            {setup.steps.map((s) => (
              <li key={s.id} data-setup-step={s.id} data-step-status={s.status}>
                <span className="mcp__dot" data-state={s.status === 'running' ? 'checking' : s.status === 'succeeded' ? 'healthy' : s.status === 'failed' ? 'unreachable' : 'unknown'} aria-hidden="true" />
                <span>{s.label}: </span><span data-step-text>{STEP_TEXT[s.status]}{s.elapsedMs !== null && s.status === 'succeeded' && s.elapsedMs > 0 ? ` (${(s.elapsedMs / 1000).toFixed(1)} s)` : ''}</span>
                {s.detail ? <div className="text-tertiary settings__hint mono" data-step-detail>{s.detail}</div> : null}
              </li>
            ))}
          </ol>
          {setup.state === 'finished' && setup.outcome ? <p role="status" data-setup-message><strong>{OUTCOME_TEXT[setup.outcome]}.</strong> {setup.message}</p> : null}
          {setup.state === 'running' ? <p role="status" className="text-secondary" data-setup-message>Running{setup.containsCode === false ? ' — the workspace contains no code, so indexing and the memory store will be skipped' : ''}…</p> : null}
          {setup.invocation ? <p className="text-tertiary settings__hint mono" data-setup-invocation>Runs {setup.invocation}</p> : null}
        </>
      )}
      <p className="text-tertiary settings__hint">The machine-setup half of this action — checking developer tooling and warming package caches for the other servers — is not built: it belongs with the onboarding task registry, which does not exist yet; the bundled runtime needs neither.</p>
    </DesignCard>
  );
}

/**
 * THE WEB SEARCH PANEL (R-119, 2026-11-21) — REQ-MCP-111's dedicated key control with REQ-MCP-110's add, replace and
 * delete and its scope choice, REQ-MCP-092's single-server probe with REQ-CONFIG-353's vocabulary as TEXT beside the
 * indicator (REQ-SHELL-149), and PD-CONFIG-006 revision 2's one-press enable. It replaced a four-step card: what a user
 * of the shipped default does is paste a key and press one button, so the panel is three ledger rows — the provider the
 * entry points at, the key, the status — and another provider waits behind "Use a different provider", where one press
 * writes its url (PD-CONFIG-013) and the stanza stays offered for an edit by hand. The logic is `web-search-setup.ts`'s.
 */
function WebSearchPanel(props: McpSettingsProps) {
  const row = (props.listing?.rows ?? []).find((r) => r.name === WEB_SEARCH_SERVER) ?? null;
  const storedKey = webSearchStoredKey(props.webSearchSecrets);
  const health: McpHealth = props.health[WEB_SEARCH_SERVER] ?? { state: 'unknown' };
  const fatalLoad = props.fatal !== undefined && !props.fatal.loadOk;
  // REQ-CONFIG-424/478: with no configuration service (the listing read's refusal) or a fatal load, the panel draws its
  // empty state and nothing is pressable; the words are the layer's that determined the condition.
  const unavailable = fatalLoad
    ? 'The configuration could not be loaded, so web search cannot be set up yet. Fix the reported problem, then reload.'
    : props.error;
  const { explain } = useContext(SettingsPageContext);
  const provider = webSearchProviderOf(row);
  const host = row === null ? null : webSearchHost(row.line);
  const [keyDraft, setKeyDraft] = useState('');
  const [scope, setScope] = useState<WebSearchScope>('workspace');
  const [lines, setLines] = useState<readonly string[]>([]);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [refreshNote, setRefreshNote] = useState<string | null>(null);
  const [inFlight, setInFlight] = useState<WebSearchInFlight | null>(null);
  /**
   * The panel's own probe result and the evidence it was taken under — the BASIS (`webSearchProbeBasis`) and the
   * identity of the two views it was read against. A result is read only while all three still hold; a stale one is
   * DISCARDED during render (React's documented adjustment), so an older Healthy never stands over a changed entry, a
   * replaced key (whose mask is byte-identical) or a newer category probe. The parent row's health is never written.
   */
  const [probe, setProbe] = useState<{ readonly basis: string; readonly health: McpHealth; readonly read: McpSecretsView | null; readonly listed: McpListing | null } | null>(null);
  /**
   * A probe a save or enable press made is about the state those presses LEFT, which the props reach once the press's
   * own re-read has landed. It is held until the press settles, then kept under the views of that render like a Test
   * press's result.
   */
  const [pendingProbe, setPendingProbe] = useState<McpHealth | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [otherOpen, setOtherOpen] = useState(false);
  const [presetId, setPresetId] = useState<string | null>(null);
  const [ownUrl, setOwnUrl] = useState('');
  const [copyNote, setCopyNote] = useState<string | null>(null);
  const [openFailure, setOpenFailure] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const keyField = useRef<HTMLInputElement | null>(null);
  const radios = useRef(new Map<string, HTMLButtonElement>());

  const situationInputs = webSearchProbeBasis({ unavailable, row, storedKey, health });
  const probeStale = probe !== null && (probe.basis !== situationInputs || probe.read !== props.webSearchSecrets || probe.listed !== props.listing);
  // The report under the status describes the result being dropped, so it goes with it.
  if (probeStale) { setProbe(null); setLines([]); }
  const shownHealth = probe !== null && !probeStale ? probe.health : health;
  const situation = webSearchSituation({ unavailable, row, storedKey, health: inFlight === 'probe' ? { state: 'checking' } : shownHealth });
  const status = webSearchStatus(situation, inFlight === 'probe' ? { state: 'checking' } : shownHealth);
  const keyApplies = webSearchKeyApplies(row, storedKey);
  const busy = inFlight !== null;
  const canEnable = situation === 'off' && row !== null && !row.overridden;
  const canTest = situation === 'untested' || situation === 'failing' || situation === 'ready';
  // §1.7: one filled control in every state — the act the panel waits on. Typing a key makes saving it that act.
  const fill: 'save' | 'enable' | 'test' = keyApplies && (storedKey === null || keyDraft !== '') ? 'save' : canEnable ? 'enable' : 'test';
  const chosen = webSearchPreset(presetId) ?? provider ?? WEB_SEARCH_PRESETS[0]!;
  /** PD-CONFIG-013: a hosted provider the entry already reaches has nothing to write. */
  const inUse = chosen.host !== null && provider?.id === chosen.id;
  const stanza = webSearchStanza(chosen);

  /** The row's "Add a key" lands on the key field (REQ-MCP-108's one venue: the way in stays in this category). */
  const registerSetupFocus = props.onSetupFocusRoute;
  useEffect(() => {
    if (registerSetupFocus === undefined) return undefined;
    registerSetupFocus(() => { keyField.current?.focus(); });
    return () => { registerSetupFocus(null); };
  }, [registerSetupFocus]);

  /** Every press shares one frame: clear the last report, hold the in-flight state, and always release it. */
  const run = async (kind: WebSearchInFlight, act: () => Promise<void>) => {
    if (busy) return;
    setRefusal(null); setRefreshNote(null); setLines([]); setInFlight(kind);
    try { await act(); } catch (cause) { setRefusal(webSearchPressFailure(cause)); } finally { setInFlight(null); }
  };
  const report = (r: WebSearchSaveReply) => {
    setLines(r.lines);
    if (!r.ok) { setRefusal(r.message); return; }
    if (r.refreshFailure !== null) setRefreshNote(WEB_SEARCH_REFRESH_FAILED(r.refreshFailure));
  };
  const save = () => run('save', async () => {
    const r = await props.webSearchSetup.onSaveAndTest(keyDraft, scope);
    if (r.ok || r.lines.length > 0) setKeyDraft('');
    report(r);
    setProbe(null);
    if (r.ok && r.health !== null) setPendingProbe(r.health);
  });
  const enable = () => run('enable', async () => {
    const r = await props.webSearchSetup.onEnableAndTest();
    report(r);
    setProbe(null);
    if (r.ok && r.health !== null) setPendingProbe(r.health);
  });
  const test = () => run('probe', async () => {
    const result = await props.webSearchSetup.onProbe();
    setProbe({ basis: situationInputs, health: result, read: props.webSearchSecrets, listed: props.listing });
    setLines([webSearchProbeSentence(result, keyApplies && (provider === null || provider.needsKey))]);
  });
  const remove = () => run('remove', async () => {
    try {
      const r = await props.webSearchSetup.onDeleteKey(storedKey?.scope === 'Global' ? 'global' : 'workspace');
      if (!r.ok) { setRefusal(r.message); return; }
      setLines([deletedKeySentence(r.outcome)]);
      setProbe(null);
      if (r.refreshFailure !== null) setRefreshNote(WEB_SEARCH_REFRESH_FAILED(r.refreshFailure));
    } finally {
      setConfirmingDelete(false);
      keyField.current?.focus();
    }
  });
  const chooseProvider = () => run('provider', async () => {
    const r = await props.webSearchSetup.onUseProvider(chosen, ownUrl, scope);
    report(r);
    if (r.ok) { setOwnUrl(''); setProbe(null); }
  });
  const openFile = () => run('open', async () => {
    setOpenFailure(null);
    const r = await props.webSearchSetup.onOpenFile();
    if (!r.ok) setOpenFailure(r.message);
  });
  const getKey = async (p: WebSearchPreset) => {
    setOpenFailure(null);
    try {
      const r = await props.webSearchSetup.onGetKey(p);
      if (!r.ok) setOpenFailure(r.message);
    } catch (cause) { setOpenFailure(webSearchPressFailure(cause)); }
  };
  if (pendingProbe !== null && !busy) {
    setProbe({ basis: situationInputs, health: pendingProbe, read: props.webSearchSecrets, listed: props.listing });
    setPendingProbe(null);
  }
  const copy = () => {
    setCopyNote(null);
    // The stanza carries the placeholder, never a key: no value of a secret reaches the clipboard.
    void navigator.clipboard?.writeText(stanza.text).then(() => setCopyNote('Copied.')).catch(() => setCopyNote('The clipboard refused the copy.'));
  };
  const onRadioKey = (event: { key: string; preventDefault: () => void }) => {
    const next = presetAfter(chosen.id, event.key);
    if (next === null || busy) return;
    event.preventDefault();
    setPresetId(next);
    radios.current.get(next)?.focus();
  };

  if (situation === 'no-entry' || situation === 'unavailable') {
    return (
      <DesignCard className="card settings__card" data-mcp-websearch-setup data-websearch-situation={situation}>
        <div className="card-kicker">Web search</div>
        <p className="text-secondary" data-websearch-empty>{situation === 'no-entry' ? WEB_SEARCH_NO_ENTRY : unavailable}</p>
        {situation === 'unavailable' && fatalLoad && props.fatal !== undefined ? <Fatal snapshot={props.fatal} /> : null}
        {situation === 'no-entry' ? (
          <div className="settings__action">
            {/* The empty state's one filled control (§1.7): the remedy its sentence names (REQ-CONFIG-437). */}
            <DesignButton type="button" className="btn btn-primary btn-compact" data-websearch-open disabled={props.listing === null || busy} onClick={() => { void openFile(); }}>Open the file</DesignButton>
            {openFailure !== null ? <span className="composer__error" role="alert" data-websearch-open-failure>{openFailure}</span> : null}
          </div>
        ) : null}
        <p className="text-tertiary settings__hint" data-websearch-file>{webSearchFileLine(props.listing?.configFile ?? null)}</p>
      </DesignCard>
    );
  }

  return (
    <DesignCard className="card settings__card" data-mcp-websearch-setup data-websearch-situation={situation} data-websearch-fill={fill}>
      <div className="providers-card__head">
        <div className="card-kicker">Web search</div>
        {explain ? null : (
          <DesignButton type="button" className="btn btn-ghost btn-icon settings__info" aria-label={WEB_SEARCH_ABOUT_CONTROL} title={WEB_SEARCH_ABOUT_CONTROL}
            aria-expanded={aboutOpen} aria-controls="websearch-about" data-websearch-about-control onClick={() => setAboutOpen((v) => !v)}>
            <i className="ph ph-info" aria-hidden="true" />
          </DesignButton>
        )}
      </div>
      <div id="websearch-about" data-websearch-about hidden={!(explain || aboutOpen)}>
        {WEB_SEARCH_ABOUT.map((sentence) => <p key={sentence} className="text-secondary settings__hint">{sentence}</p>)}
      </div>

      <div className="settings__action" data-websearch-provider={provider?.id ?? 'other'}>
        <span>Provider</span>
        <span data-websearch-provider-name>{provider?.name ?? 'Your own server'}</span>
        {host !== null && provider?.host !== host ? <span className="mono text-tertiary" data-websearch-host>{host}</span> : null}
        {provider !== null && provider.keyPage !== null && keyApplies ? (
          <DesignButton type="button" className="btn btn-link btn-compact" data-websearch-get-key aria-label={WEB_SEARCH_CONTROLS.key(provider.name)} disabled={busy} onClick={() => { void getKey(provider); }}>
            Get a key <i className="ph ph-arrow-square-out" aria-hidden="true" />
          </DesignButton>
        ) : null}
      </div>

      {situation === 'other-transport' && row !== null ? <p className="text-secondary" data-websearch-other-transport>{webSearchOtherTransport(row.type)}</p> : null}

      {keyApplies ? (
        <div className="settings__action" data-websearch-key-row>
          <label htmlFor="websearch-key">API key</label>
          <div className="websearch__controls">
          <DesignInput ref={keyField} id="websearch-key" type="password" autoComplete="off" spellCheck={false} className="input mono settings__key-field" data-websearch-key-field
            placeholder={storedKey === null ? 'Paste your key' : 'Paste a new key'}
            aria-description="Never shown after it is stored; the stored value is only ever displayed masked."
            value={keyDraft} disabled={busy}
            onChange={(e) => setKeyDraft(e.currentTarget.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && keyDraft !== '') { e.preventDefault(); void save(); } }} />
          <DesignSelect className="input select settings__select" aria-label="Scope the key is stored in" data-websearch-scope value={scope} disabled={busy}
            onChange={(e) => setScope(e.currentTarget.value === 'global' ? 'global' : 'workspace')}>
            <option value="workspace">{WEB_SEARCH_SCOPE_LABELS.workspace}</option>
            <option value="global">{WEB_SEARCH_SCOPE_LABELS.global}</option>
          </DesignSelect>
          <DesignButton type="button" className={`btn ${fill === 'save' ? 'btn-primary' : 'btn-secondary'} btn-compact`} data-websearch-save aria-label={WEB_SEARCH_CONTROLS.save}
            disabled={busy}
            onClick={() => { void save(); }}>{inFlight === 'save' ? 'Saving…' : storedKey === null ? 'Save and test' : 'Replace and test'}</DesignButton>
          {storedKey !== null ? (
            <DesignButton type="button" className="btn btn-ghost btn-compact" data-websearch-delete aria-label={WEB_SEARCH_CONTROLS.delete} disabled={busy} onClick={() => setConfirmingDelete(true)}>Delete</DesignButton>
          ) : null}
          </div>
        </div>
      ) : null}
      {keyApplies && storedKey !== null ? (
        <div className="websearch__under">
          <p className="text-secondary settings__hint" data-websearch-stored>Stored in the {storedKey.scope} scope, value <span className="mono" data-mask>{storedKey.masked}</span>.</p>
          {provider !== null && !provider.needsKey ? <p className="text-secondary settings__hint" data-websearch-key-unused>{provider.name} searches without a key, so the stored key is not sent to it.</p> : null}
        </div>
      ) : null}

      {situation !== 'other-transport' ? (
        <div className="settings__action" data-websearch-status-row>
          <span>Status</span>
          <div className="websearch__controls">
          <span data-websearch-status>
            <span className="mcp__dot" data-state={status.dot} aria-hidden="true" />
            <span data-websearch-health data-health={shownHealth.state}>{status.text}</span>
          </span>
          {canEnable ? (
            <DesignButton type="button" className={`btn ${fill === 'enable' ? 'btn-primary' : 'btn-secondary'} btn-compact`} data-websearch-enable aria-label={WEB_SEARCH_CONTROLS.enable} disabled={busy} onClick={() => { void enable(); }}>
              {inFlight === 'enable' ? 'Turning on…' : 'Turn on and test'}
            </DesignButton>
          ) : (
            <DesignButton type="button" className={`btn ${fill === 'test' ? 'btn-primary' : 'btn-secondary'} btn-compact`} data-websearch-check aria-label={WEB_SEARCH_CONTROLS.check}
              disabled={busy || !canTest} title={canTest ? undefined : 'Nothing to test until the server is set up and on.'} onClick={() => { void test(); }}>
              {inFlight === 'probe' ? 'Testing…' : 'Test'}
            </DesignButton>
          )}
          </div>
        </div>
      ) : null}

      <div className="websearch__under websearch__report" data-websearch-report>
        {inFlight !== null ? <p role="status" className="text-secondary settings__hint" data-websearch-in-flight>{WEB_SEARCH_IN_FLIGHT[inFlight]}</p> : null}
        {lines.length > 0 ? <div role="status" data-websearch-result>{lines.map((l) => <p key={l} className="text-secondary settings__hint">{l}</p>)}</div> : null}
        {refusal !== null ? <p className="composer__error" role="alert" data-websearch-refusal>{refusal}</p> : null}
        {refreshNote !== null ? <p className="composer__error" role="alert" data-websearch-refresh-failure>{refreshNote}</p> : null}
        {situation === 'off' && row !== null && row.overridden ? <p className="text-secondary settings__hint" data-websearch-overridden>The server is switched off for this session. Switch it on in the list above.</p> : null}
        {situation === 'off' && lines.length === 0 && !(row?.overridden ?? false) ? <p className="text-secondary settings__hint" data-websearch-off>{WEB_SEARCH_OFF}</p> : null}
        {situation === 'unresolved' && row !== null ? <p className="text-secondary settings__hint" data-websearch-unresolved>{webSearchUnresolvedNote(row.unresolved)}</p> : null}
        {shownHealth.state === 'unreachable' && shownHealth.detail ? <p className="text-tertiary settings__hint mono" data-websearch-health-detail>{shownHealth.detail}</p> : null}
      </div>

      <DesignButton type="button" className="btn btn-link btn-compact websearch__more" aria-expanded={otherOpen} aria-controls="websearch-other" data-websearch-other-control onClick={() => setOtherOpen((v) => !v)}>
        <i className="ph ph-caret-right" aria-hidden="true" />{WEB_SEARCH_OTHER_PROVIDER}
      </DesignButton>
      <div id="websearch-other" data-websearch-other hidden={!otherOpen}>
        <p className="text-secondary settings__hint">{WEB_SEARCH_OTHER_PROVIDER_LEDE}</p>
        <div role="radiogroup" aria-label="Search provider" data-websearch-presets onKeyDown={onRadioKey}>
          {WEB_SEARCH_PRESETS.map((p) => (
            <div key={p.id} className="settings__action" data-websearch-preset={p.id} data-preset-selected={chosen.id === p.id ? 'yes' : 'no'}>
              <DesignButton
                ref={(el) => { if (el === null) radios.current.delete(p.id); else radios.current.set(p.id, el); }}
                type="button" role="radio" aria-checked={chosen.id === p.id} tabIndex={chosen.id === p.id ? 0 : -1} disabled={busy}
                className={`seg-opt${chosen.id === p.id ? ' is-active' : ''}`} aria-label={`${p.name} — ${p.description}`}
                onClick={() => setPresetId(p.id)}>{p.name}</DesignButton>
              <span className="text-secondary settings__hint">{p.description}</span>
            </div>
          ))}
        </div>
        {chosen.host === null ? (
          <DesignInput type="url" className="input mono websearch__url" data-websearch-own-url aria-label="Your search server's address"
            placeholder={`https://your-server/mcp?key=\${${WEB_SEARCH_KEY_VARIABLE}}`} spellCheck={false} autoComplete="off"
            value={ownUrl} disabled={busy} onChange={(e) => setOwnUrl(e.currentTarget.value)} />
        ) : null}
        <div className="settings__action">
          <DesignButton type="button" className="btn btn-secondary btn-compact" data-websearch-use disabled={busy || inUse}
            aria-description="Writes this provider's address to the configuration file of the scope chosen above."
            onClick={() => { void chooseProvider(); }}>{inFlight === 'provider' ? 'Writing…' : inUse ? `${chosen.name} is in use` : chosen.host === null ? 'Use this server' : `Use ${chosen.name}`}</DesignButton>
        </div>
        <p className="text-secondary settings__hint">{WEB_SEARCH_EDIT_YOURSELF}</p>
        <pre className="mono" data-websearch-stanza>{stanza.text}</pre>
        {stanza.note !== null ? <p className="text-tertiary settings__hint" data-websearch-example>{stanza.note}</p> : null}
        <div className="settings__action">
          <DesignButton type="button" className="btn btn-secondary btn-compact" data-websearch-copy disabled={busy} onClick={copy}>Copy</DesignButton>
          <DesignButton type="button" className="btn btn-secondary btn-compact" data-websearch-open disabled={busy || props.listing === null} onClick={() => { void openFile(); }}>Open the file</DesignButton>
          {copyNote !== null ? <span className="text-tertiary" role="status">{copyNote}</span> : null}
          {openFailure !== null ? <span className="composer__error" role="alert" data-websearch-open-failure>{openFailure}</span> : null}
        </div>
        <p className="text-tertiary settings__hint" data-websearch-file>{webSearchFileLine(props.listing?.configFile ?? null)}</p>
      </div>

      {confirmingDelete ? (
        <Confirm
          title="Delete the stored key?"
          body={`This removes the web search key from the ${storedKey?.scope ?? 'Workspace'} secrets file. Search stops working until a key is stored again; nothing else in the file is touched.`}
          busy={busy}
          onYes={() => { void remove(); }}
          onCancel={() => setConfirmingDelete(false)}
        />
      ) : null}
    </DesignCard>
  );
}

/** The provider radios' arrow keys (REQ-SHELL-145/146 with REQ-CONFIG-348's selection idiom): one tab station, the arrows move the selection and the focus. */
function presetAfter(current: string, key: string): string | null {
  const ids = WEB_SEARCH_PRESETS.map((p) => p.id);
  if (key === 'Home') return ids[0] ?? null;
  if (key === 'End') return ids[ids.length - 1] ?? null;
  if (key !== 'ArrowDown' && key !== 'ArrowRight' && key !== 'ArrowUp' && key !== 'ArrowLeft') return null;
  const step = key === 'ArrowDown' || key === 'ArrowRight' ? 1 : -1;
  const at = Math.max(0, ids.indexOf(current));
  return ids[(at + step + ids.length) % ids.length] ?? null;
}

export function McpSettings(props: McpSettingsProps) {
  const rows = props.listing?.rows ?? [];
  const [probeMessage, setProbeMessage] = useState<string | null>(null);
  const probeAll = async () => { setProbeMessage(null); await props.onProbeAll(); setProbeMessage('Probed every configured server.'); };
  const chosen = props.secrets?.server ?? null;
  /**
   * The row's way into the web search panel: the cell holds the function the panel
   * registers (its key field), and the row's control stands only while it can still do something —
   * `webSearchRowSetupVisible` is read PER ROW at the call site below (never once for the table: one shared value
   * would hand every server this card's way in), against the SAME `web_search` row the card reads and the card's OWN
   * secrets view (Minor 2 of 2026-11-09: never the chooser's filtered one).
   */
  const setupFocus = useRef<(() => void) | null>(null);
  const registerSetupFocus = useCallback((focus: (() => void) | null) => { setupFocus.current = focus; }, []);
  return (
    <div className="settings__section" data-mcp-settings>
      <SettingsTitle>MCP Servers</SettingsTitle>
      <DesignCard className="card settings__card" data-mcp-servers>
        <div className="providers-card__head">
          <div className="card-kicker">Configured servers</div>
          <div className="providers-card__actions">
            <DesignButton type="button" className="btn btn-secondary btn-compact settings__glyph ph ph-arrow-clockwise" title="Reload" onClick={props.onRefresh} disabled={props.loading}>Reload</DesignButton>
            {/* FND-3 of the Opus 5.5 review (2026-11-09): §1.7's one filled control is per screen/view, and this
                view carried THREE `.btn-primary` at once (this one, the web search panel's save, and the code
                intelligence card's action). The card-head action is the mockup's own secondary variant —
                `SETTINGS`' Providers card head draws `Check status` as `btn btn-secondary btn-compact` — so the
                fill belongs to the one control that writes something, the web search panel's `Save and test`. */}
            <DesignButton type="button" className="btn btn-secondary btn-compact settings__glyph ph ph-heartbeat" title="Check status" aria-description="Probe every configured MCP server" disabled={props.probing || rows.length === 0} onClick={() => { void probeAll(); }} data-action="check-status">{props.probing ? 'Checking…' : 'Check status'}</DesignButton>
          </div>
        </div>
        <p className="text-secondary settings__lede">Every server the configuration declares, whether or not it is enabled. Health is probed on demand and never remembered across launches; the switch turns a server off for this session only, and switching on a server the configuration holds disabled writes <code className="mono">enabled: true</code> to the configuration file.</p>
        {props.error ? <p className="composer__error" role="alert">{props.error}</p> : null}
        {probeMessage ? <p className="text-secondary" role="status">{probeMessage}</p> : null}
        {rows.length === 0 ? (
          <p className="text-secondary" data-mcp-empty>{props.loading ? 'Reading the configuration…' : `No tool servers are configured. Declare them under mcp_servers in ${props.listing?.configFile ?? 'the workspace configuration file'}.`}</p>
        ) : (
          <DesignTable className="table settings__grid" aria-label="Configured MCP servers">
            <thead><tr><th>Health</th><th>Server</th><th>Origin</th><th>Enabled</th></tr></thead>
            <tbody>
              {rows.map((row) => <Row key={row.name} row={row} health={props.health[row.name] ?? { state: 'unknown' }} probing={props.probing} onToggle={props.onToggle} showWebSearchSetup={webSearchRowSetupVisible(row, webSearchStoredKey(props.webSearchSecrets))} onOpenWebSearchSetup={() => setupFocus.current?.()} />)}
            </tbody>
          </DesignTable>
        )}
      </DesignCard>
      <WebSearchPanel {...props} onSetupFocusRoute={registerSetupFocus} />
      {/* ADR-0067 / REQ-MCP-120: the inbound surface's card — the one switch that exposes the product to external agents. */}
      {props.inbound ? <InboundSurfaceCard inbound={props.inbound} /> : null}
      <SetupCard setup={props.setup} onStart={props.onSetupStart} onCancel={props.onSetupCancel} />
      <DesignCard className="card settings__card" data-mcp-secrets>
        <div className="card-kicker">Stored secrets</div>
        <p className="text-secondary settings__lede">What the two secrets files hold, per server and key, with every value masked. The web search key is added, replaced and deleted in the Web search panel above; any other server's secrets are edited in <code className="mono">secrets.yaml</code> beside the configuration file (workspace or global). A stored secret takes effect on the next configuration load.</p>
        <div className="settings__action">
          <label htmlFor="mcp-secrets-server">View</label>
          <DesignSelect id="mcp-secrets-server" className="input select settings__select" aria-label="Secrets for" value={chosen ?? ''} onChange={(e) => props.onSecretsServer(e.currentTarget.value === '' ? null : e.currentTarget.value)}>
            <option value="">All servers</option>
            {(props.secrets?.servers ?? []).map((s) => <option key={s} value={s}>{s}</option>)}
          </DesignSelect>
        </div>
        {props.secrets && props.secrets.servers.length === 0 ? (
          <p className="text-secondary" data-secrets-empty="no-servers">No server is configured, so there is nothing a secret could belong to.</p>
        ) : props.secrets && props.secrets.rows.length === 0 ? (
          <p className="text-secondary" data-secrets-empty={chosen === null ? 'none-at-all' : 'none-for-server'}>{chosen === null ? 'No server holds a stored secret.' : `${chosen} holds no stored secret.`}</p>
        ) : props.secrets ? (
          <DesignTable className="table settings__grid" aria-label="Stored secrets">
            <thead><tr><th>Server</th><th>Key</th><th>Value</th><th>Scope</th></tr></thead>
            <tbody>
              {props.secrets.rows.map((r) => <tr key={`${r.server} ${r.key}`} data-secret-row={`${r.server}.${r.key}`}><td className="mono">{r.server}</td><td className="mono">{r.key}</td><td className="mono" data-mask>{r.masked}</td><td data-scope>{r.scope}</td></tr>)}
            </tbody>
          </DesignTable>
        ) : <p className="text-secondary">Reading…</p>}
        {chosen !== null && props.secrets ? (
          <div className="settings__hint text-secondary" data-expected-keys>
            {props.secrets.expected.length === 0 ? `${chosen} declares no env keys.` : <>Expected keys of {chosen}: {props.secrets.expected.map((e) => <span key={e.key} className="mono" data-expected={e.key} data-satisfied={e.satisfied ? 'yes' : 'no'}>{e.key} ({e.satisfied ? 'stored' : 'missing'}) </span>)}</>}
          </div>
        ) : null}
      </DesignCard>
    </div>
  );
}
