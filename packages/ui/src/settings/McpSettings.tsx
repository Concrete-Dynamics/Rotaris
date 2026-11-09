import { useRef, useState } from 'react';
import type { ConfigSnapshot, McpHealth, McpListing, McpProvisioning, McpSecretsView, McpServerRow, McpSetupStatus, McpSetupStep } from '@rotaris/contracts';
import { Button as DesignButton, Card as DesignCard, Input as DesignInput, Select as DesignSelect, Table as DesignTable } from '../design-system/index.js';
import { Confirm } from './Confirm.js';
import { Fatal } from './ConfigSettings.js';
import {
  deletedKeySentence, mcpHealthText, presetAfter, presetTabIndex, storedKeySentence, webSearchFileLine, webSearchHeaderKeyNote, webSearchOtherTransport,
  webSearchPreset, webSearchProbeBasis, webSearchPressFailure, webSearchSituation, webSearchStanza, webSearchStoredKey, webSearchUnresolvedNote,
  MCP_HEALTH_TEXT,
  WEB_SEARCH_CONTROLS, WEB_SEARCH_DECLARATION_STANDS, WEB_SEARCH_IN_FLIGHT, WEB_SEARCH_KEY_VARIABLE, WEB_SEARCH_NEEDS_ENABLED,
  WEB_SEARCH_NO_ENTRY, WEB_SEARCH_NOT_WRITTEN_BY_US, WEB_SEARCH_PRESETS, WEB_SEARCH_REFRESH_FAILED, WEB_SEARCH_SERVER, WEB_SEARCH_TAKE_EFFECT, WEB_SEARCH_WORKING_SUMMARY, WEB_SEARCH_WRONG_ENDPOINT,
  type WebSearchInFlight, type WebSearchPreset, type WebSearchScope, type WebSearchSetupHandlers,
} from './web-search-setup.js';

/**
 * REQ-MCP-091/092/108/109/115, REQ-CONFIG-350..353/437: the "MCP Servers" category. Structure from docs/spec; craft from
 * docs/design (tokens by name — the status dot, the toggle, the settings grid and the card are the adopted components).
 * The "Configured servers" card lists EVERY configured server, disabled ones included, with the four-state health as
 * text beside the indicator, the `{name} · {type}` label, the masked muted line, the origin word and the toggle; the
 * header's "Check status" probes sequentially through the run host; the secrets card is the READ side, and since
 * 2026-11-09 the WRITE side of REQ-MCP-110/111 is built — the guided `Set up web search` card below (B2) stores,
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
   * The guided card's OWN secrets view (Minor 2, 2026-11-09): read with `server: 'web_search'` and never the
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
   * OQ-279 / REQ-CONFIG-478: the configuration snapshot when it did not load — the guided card draws its empty state and
   * disables its controls, as Skills, Models, Personas and Runtime do (REQ-CONFIG-424 for the no-service half).
   */
  readonly fatal?: ConfigSnapshot | undefined;
  /**
   * The guided `web_search` card's presses (REQ-MCP-110/111/092, REQ-CHAT-076, REQ-CONFIG-437): `bindWebSearchSetup`
   * over `bridge.command` — the card itself holds no bridge, and a press's command kinds are pinned in
   * `web-search-press.test.ts`.
   */
  readonly webSearchSetup: WebSearchSetupHandlers;
}

const HEALTH_TEXT: Record<McpHealth['state'], string> = { unknown: 'Unknown', checking: 'Checking…', healthy: 'Healthy', unreachable: 'Unreachable' };
const STEP_TEXT: Record<McpSetupStep['status'], string> = { pending: 'Not started', running: 'In progress…', succeeded: 'Succeeded', failed: 'Failed', 'skipped-no-code': 'Skipped — no code', 'not-attempted': 'Not attempted' };
const OUTCOME_TEXT: Record<NonNullable<McpSetupStatus['outcome']>, string> = { completed: 'Completed', failed: 'Only partly set up', cancelled: 'Cancelled', unavailable: 'Not available' };

function Row({ row, health, probing, onToggle }: { row: McpServerRow; health: McpHealth; probing: boolean; onToggle: McpSettingsProps['onToggle'] }) {
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
      <td data-origin>{row.origin}</td>
      <td>
        <DesignButton type="button" className={`toggle${on ? ' is-on' : ''}`} role="switch" aria-checked={on} aria-label={accessibleName} aria-description={accessibleDescription} disabled={!row.available || busy} title={title} onClick={() => { void toggle(); }} />
        <div className="text-tertiary settings__hint" data-enablement>{enablement}</div>
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
      <p className="text-secondary">
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
            : <DesignButton type="button" className="btn btn-primary btn-compact" disabled={setup === null} onClick={() => { void start(); }} data-action="setup-start">{setup?.state === 'finished' ? 'Set up again' : 'Set up code intelligence for this workspace'}</DesignButton>}
        </div>
      </div>
      <p className="text-secondary">Creates the bundled runtime's project for this workspace, indexes it and initialises its project memories — three steps, in order, each bounded; a workspace without code gets the project only. Runs in the background; you can cancel between steps or while a step is running.</p>
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
 * THE GUIDED `web_search` CARD — the four steps of the design brief (`reports/rotaris-websearch-setting-card-design-brief.md`,
 * `docs/design/README.md` §7 consulted): REQ-MCP-111's dedicated key control with REQ-MCP-110's add/change/delete and
 * scope choice, REQ-CONFIG-350/464's boundary — the screen NAMES the file and hands over the stanza, it authors no
 * server — REQ-CONFIG-437's named remedy, REQ-MCP-092's single-server probe with REQ-CONFIG-353's four-state
 * vocabulary as TEXT beside the indicator (REQ-SHELL-149), REQ-CONFIG-424/478's empty state with the controls
 * disabled. Steps 1, 2 and 4 write nothing; step 3 is the one write, through the commands B1 built
 * (`mcp.setSecret`/`mcp.unsetSecret`), whose masked confirmation alone comes back (REQ-MCP-081). The enable toggle's
 * semantics are untouched (REQ-MCP-094/115, REQ-CONFIG-349): this card offers no second enable path.
 */
function WebSearchSetupCard(props: McpSettingsProps) {
  const row = (props.listing?.rows ?? []).find((r) => r.name === WEB_SEARCH_SERVER) ?? null;
  const storedKey = webSearchStoredKey(props.webSearchSecrets);
  const health: McpHealth = props.health[WEB_SEARCH_SERVER] ?? { state: 'unknown' };
  const fatalLoad = props.fatal !== undefined && !props.fatal.loadOk;
  // REQ-CONFIG-424/478: with no configuration service (the listing read's refusal) or a fatal load, the card renders
  // its empty state and its controls are disabled; the words are the layer's that determined the condition.
  const unavailable = fatalLoad
    ? 'The configuration could not be loaded, so there is nothing this card can guide you to yet. Fix the reported problem, then reload this category.'
    : props.error;
  const [presetId, setPresetId] = useState<string | null>(null);
  const [keyDraft, setKeyDraft] = useState('');
  const [scope, setScope] = useState<WebSearchScope>('workspace');
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [inFlight, setInFlight] = useState<WebSearchInFlight | null>(null);
  const [probingMessage, setProbingMessage] = useState<string | null>(null);
  const [liveHealth, setLiveHealth] = useState<McpHealth | null>(null);
  /**
   * Round-2 Major 3: the BASIS `liveHealth` was taken under — the card's own probe result is read only while the
   * inputs it observed still hold (see `webSearchProbeBasis`).
   */
  const [probeBasis, setProbeBasis] = useState<string | null>(null);
  const [refreshNote, setRefreshNote] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [openFailure, setOpenFailure] = useState<string | null>(null);
  const [copyNote, setCopyNote] = useState<string | null>(null);
  const preset = webSearchPreset(presetId);
  const stanza = webSearchStanza(preset);
  /**
   * Round-2 Major 3 (finding: `liveHealth` was never invalidated): the card's own probe result is keyed to the inputs
   * it was taken under — the entry, the stored key, the card's other situation inputs and the PARENT health. The
   * moment any of those changes, `liveHealth` no longer describes the current state and the parent's health takes
   * over, so an earlier Healthy can never keep a changed, untested endpoint `ready`/collapsed, and an older card
   * result can never override a newer category probe. The result is also dropped after a successful write, whose key
   * value the card cannot observe (it sees the mask alone). The preset radio is not an input: the probe tests the
   * entry in the file, and choosing a preset changes only the stanza step 2 hands over.
   */
  const situationInputs = webSearchProbeBasis({ unavailable, row, storedKey, health });
  const shownHealth = liveHealth !== null && probeBasis === situationInputs ? liveHealth : health;
  /** Major 1 (rework round 1, 2026-11-09): the situation reads the card's OWN probe result (`liveHealth`), so the Test
   * step genuinely decides `ready`/`wrong-endpoint` — a Healthy probe collapses the steps, a failing one takes an
   * already-ready card back to `wrong-endpoint`. The parent row's health is untouched (the category's probe owns it,
   * and it supersedes a card result whose inputs have changed). */
  const situation = webSearchSituation({ unavailable, row, storedKey, health: shownHealth });
  const disabled = unavailable !== null;
  const collapsed = situation === 'ready' && !expanded;
  /** Major 2: ONE in-flight state covers the three file presses and the probe; every control is disabled while it
   * holds, and the card says which one it is (design brief §4's disabled-during-write, REQ-SHELL-149 in words). */
  const busy = inFlight !== null;
  const radios = useRef(new Map<string, HTMLButtonElement>());

  const store = async () => {
    if (busy) return;
    setRefusal(null); setConfirmation(null); setRefreshNote(null); setInFlight('store');
    /**
     * Round-2 Major 2: the press is a click handler, so nothing it awaits may reject out of it — a rejection would
     * skip `setInFlight(null)` and leave the card disabled forever, reporting nothing. The helper is total now (it
     * answers a failed re-read as words), and this catch/finally is the card's own guarantee that the busy state is
     * cleared and a failure is SAID, whatever a broken binding does.
     */
    try {
      const r = await props.webSearchSetup.onStoreKey(keyDraft, scope);
      if (!r.ok) { setRefusal(r.message); return; }
      setKeyDraft('');
      setConfirmation(storedKeySentence(r.outcome));
      // The write changed the key the probe observed, and the card's probe result cannot describe the new key.
      setLiveHealth(null); setProbeBasis(null);
      if (r.refreshFailure !== null) setRefreshNote(WEB_SEARCH_REFRESH_FAILED(r.refreshFailure));
    } catch (cause) {
      setRefusal(webSearchPressFailure(cause));
    } finally {
      setInFlight(null);
    }
  };
  const remove = async () => {
    if (busy) return;
    setConfirmingDelete(false); setRefusal(null); setConfirmation(null); setRefreshNote(null); setInFlight('remove');
    try {
      const r = await props.webSearchSetup.onDeleteKey(scope);
      if (!r.ok) { setRefusal(r.message); return; }
      setConfirmation(deletedKeySentence(r.outcome));
      setLiveHealth(null); setProbeBasis(null);
      if (r.refreshFailure !== null) setRefreshNote(WEB_SEARCH_REFRESH_FAILED(r.refreshFailure));
    } catch (cause) {
      setRefusal(webSearchPressFailure(cause));
    } finally {
      setInFlight(null);
    }
  };
  const openFile = async () => {
    if (busy) return;
    setOpenFailure(null); setInFlight('open');
    try {
      const r = await props.webSearchSetup.onOpenFile();
      if (!r.ok) setOpenFailure(r.message);
    } catch (cause) {
      setOpenFailure(webSearchPressFailure(cause));
    } finally {
      setInFlight(null);
    }
  };
  const getKey = async (p: WebSearchPreset) => {
    setOpenFailure(null);
    try {
      const r = await props.webSearchSetup.onGetKey(p);
      if (!r.ok) setOpenFailure(r.message);
    } catch (cause) {
      setOpenFailure(webSearchPressFailure(cause));
    }
  };
  const check = async () => {
    if (busy) return;
    setInFlight('probe'); setProbingMessage(null);
    try {
      const result = await props.webSearchSetup.onProbe();
      setLiveHealth(result); setProbeBasis(situationInputs);
      setProbingMessage(result.state === 'unreachable' ? WEB_SEARCH_WRONG_ENDPOINT : `The server answered: ${mcpHealthText(result)}.`);
    } catch (cause) {
      setProbingMessage(webSearchPressFailure(cause));
    } finally {
      setInFlight(null);
    }
  };
  const copy = () => {
    setCopyNote(null);
    // The one clipboard write of this card, as the transcript's copy and the notice's are: no value of a secret
    // ever reaches it (the stanza carries the placeholder, never a key).
    void navigator.clipboard?.writeText(stanza.text).then(() => setCopyNote('Copied the stanza.')).catch(() => setCopyNote('The clipboard refused the copy.'));
  };
  const onRadioKey = (event: { key: string; preventDefault: () => void }) => {
    const next = presetAfter(presetId, event.key);
    if (next === null || busy) return;
    event.preventDefault();
    setPresetId(next);
    // REQ-SHELL-146 with REQ-SHELL-145: the arrows move the selection and the focus with it (roving tabIndex — the
    // selected radio is the group's one tab station; `presetTabIndex`). Until 2026-11-09 the focus stayed put.
    radios.current.get(next)?.focus();
  };
  const scopeLabels: Readonly<Record<WebSearchScope, string>> = { workspace: 'Workspace', global: 'Global' };
  const hideKeyStep = preset !== null && !preset.keyInUrl;

  if (situation === 'no-entry') {
    return (
      <DesignCard className="card settings__card" data-mcp-websearch-setup data-websearch-situation={situation}>
        <div className="card-kicker">Set up web search</div>
        <p className="text-secondary" data-websearch-empty>{WEB_SEARCH_NO_ENTRY}</p>
        <p className="text-tertiary settings__hint" data-websearch-file>{webSearchFileLine(props.listing?.configFile ?? null)}</p>
      </DesignCard>
    );
  }

  // REQ-CONFIG-424/478 (the design brief §4's disabled column): with no configuration service — the listing read's
  // refusal is `props.error` — or a configuration that did not load, the card draws its empty state and nothing is
  // pressable; the report a fatal load owes is `Fatal`'s, the same card the Skills, Models and Runtime categories draw.
  if (situation === 'unavailable') {
    return (
      <DesignCard className="card settings__card" data-mcp-websearch-setup data-websearch-situation={situation}>
        <div className="card-kicker">Set up web search</div>
        <p className="text-secondary" data-websearch-empty>{unavailable}</p>
        {fatalLoad && props.fatal !== undefined ? <Fatal snapshot={props.fatal} /> : null}
        <p className="text-tertiary settings__hint" data-websearch-file>{webSearchFileLine(props.listing?.configFile ?? null)}</p>
      </DesignCard>
    );
  }

  return (
    <DesignCard className="card settings__card" data-mcp-websearch-setup data-websearch-situation={situation}>
      <div className="providers-card__head">
        <div className="card-kicker">Set up web search</div>
      </div>
      <p className="text-secondary">Point the built-in web-search server at a provider you have a key for: choose a provider, put the declaration in your configuration file, paste the key and test it.</p>

      {collapsed ? (
        <p role="status" data-websearch-summary>
          {WEB_SEARCH_WORKING_SUMMARY(storedKey?.scope ?? scopeLabels[scope])}{' '}
          <DesignButton type="button" className="btn btn-link btn-compact" data-websearch-change onClick={() => setExpanded(true)}>Change</DesignButton>
        </p>
      ) : (
        <>
          <div className="card-kicker" data-websearch-step="provider">Step 1</div>
          <h2 className="settings__heading">Choose your search provider</h2>
          <div role="radiogroup" aria-label="Search provider" data-websearch-presets onKeyDown={onRadioKey}>
            {WEB_SEARCH_PRESETS.map((p) => (
              <div key={p.id} className="settings__action" data-websearch-preset={p.id} data-preset-selected={presetId === p.id ? 'yes' : 'no'}>
                <DesignButton
                  ref={(el) => { if (el === null) radios.current.delete(p.id); else radios.current.set(p.id, el); }}
                  type="button" role="radio" aria-checked={presetId === p.id} tabIndex={presetTabIndex(presetId, p.id)} disabled={disabled || busy}
                  className={`seg-opt${presetId === p.id ? ' is-active' : ''}`}
                  aria-label={`${p.name} — ${p.description}`}
                  onClick={() => setPresetId(p.id)}
                >
                  {p.name}
                </DesignButton>
                <span className="text-secondary settings__hint">{p.description}</span>
                {p.keyPage !== null ? (
                  <DesignButton type="button" className="btn btn-link btn-compact" data-websearch-key={p.id} aria-label={WEB_SEARCH_CONTROLS.key(p.name)} disabled={disabled || busy} onClick={() => { void getKey(p); }}>Get a key ↗</DesignButton>
                ) : null}
              </div>
            ))}
          </div>
          {openFailure !== null ? <p className="composer__error" role="alert" data-websearch-open-failure>{openFailure}</p> : null}

          <div className="card-kicker" data-websearch-step="declaration">Step 2</div>
          <h2 className="settings__heading">Put this in your configuration file</h2>
          {situation === 'needs-key' ? (
            <p className="text-secondary" data-websearch-declaration-stands>{WEB_SEARCH_DECLARATION_STANDS}</p>
          ) : (
            <>
              <pre className="mono" data-websearch-stanza>{stanza.text}</pre>
              {stanza.note !== null ? <p className="text-tertiary settings__hint" data-websearch-example>{stanza.note}</p> : null}
              <div className="settings__action">
                <DesignButton type="button" className="btn btn-secondary btn-compact" data-websearch-copy disabled={disabled || busy} onClick={copy}>Copy</DesignButton>
                <DesignButton type="button" className="btn btn-secondary btn-compact" data-websearch-open disabled={disabled || busy || props.listing === null} title={props.listing === null ? "The configuration file's path is not known until the listing is read." : undefined} aria-description={props.listing === null ? "Disabled: the configuration file's path is not known until the listing is read." : undefined} onClick={() => { void openFile(); }}>Open the file</DesignButton>
                {copyNote !== null ? <span className="text-tertiary settings__hint" role="status">{copyNote}</span> : null}
              </div>
            </>
          )}
          <p className="text-tertiary settings__hint" data-websearch-file>{webSearchFileLine(props.listing?.configFile ?? null)}</p>
          <p className="text-tertiary settings__hint" data-websearch-note>{WEB_SEARCH_NOT_WRITTEN_BY_US}</p>

          {situation === 'other-transport' && row !== null ? <p className="text-secondary" data-websearch-other-transport>{webSearchOtherTransport(row.type)}</p> : null}

          {situation !== 'other-transport' ? (
            <>
              <div className="card-kicker" data-websearch-step="key">Step 3</div>
              <h2 className="settings__heading">Paste the key</h2>
              {hideKeyStep && preset !== null ? (
                <p className="text-secondary" data-websearch-header-key>{webSearchHeaderKeyNote(preset, props.listing?.configFile ?? null)}</p>
              ) : (
                <>
                  <div className="settings__action">
                    <label htmlFor="websearch-key">Search API key</label>
                    <DesignInput
                      id="websearch-key" type="password" autoComplete="off" className="input" data-websearch-key-field
                      aria-label="Search API key" aria-description="Never shown again after it is stored; the stored value is only ever displayed masked."
                      value={keyDraft} disabled={disabled || busy} onChange={(e) => setKeyDraft(e.currentTarget.value)}
                    />
                  </div>
                  <div className="settings__action">
                    <label htmlFor="websearch-scope">Scope</label>
                    <DesignSelect id="websearch-scope" className="input select settings__select" aria-label="Scope" data-websearch-scope value={scope} disabled={disabled || busy} onChange={(e) => setScope(e.currentTarget.value === 'global' ? 'global' : 'workspace')}>
                      <option value="workspace">Workspace</option>
                      <option value="global">Global</option>
                    </DesignSelect>
                    <DesignButton type="button" className="btn btn-primary btn-compact" data-websearch-store aria-label={WEB_SEARCH_CONTROLS.store} disabled={disabled || busy} onClick={() => { void store(); }}>Store the key</DesignButton>
                    {storedKey !== null ? <DesignButton type="button" className="btn btn-secondary btn-compact" data-websearch-delete aria-label={WEB_SEARCH_CONTROLS.delete} disabled={disabled || busy} onClick={() => setConfirmingDelete(true)}>Delete the stored key</DesignButton> : null}
                  </div>
                  {storedKey !== null ? (
                    <p className="text-secondary settings__hint" data-websearch-stored>Stored for <span className="mono">{storedKey.server}</span> in the {storedKey.scope} scope, value <span className="mono" data-mask>{storedKey.masked}</span>. Storing again replaces it; the field above never shows the stored value.</p>
                  ) : null}
                  {refusal !== null ? <p className="composer__error" role="alert" data-websearch-refusal>{refusal}</p> : null}
                  {confirmation !== null ? <p role="status" data-websearch-confirmation>{confirmation}</p> : null}
                  <p className="text-tertiary settings__hint" data-websearch-take-effect>{WEB_SEARCH_TAKE_EFFECT}</p>
                  {situation === 'needs-enabled' ? <p className="text-secondary" data-websearch-needs-enabled>{WEB_SEARCH_NEEDS_ENABLED}</p> : null}
                  {situation === 'needs-unresolved' ? <p className="text-secondary" data-websearch-unresolved-after-key>{webSearchUnresolvedNote(row?.unresolved ?? [], true)}</p> : null}
                </>
              )}
            </>
          ) : null}
        </>
      )}

      {/*
        Step 4 is OUTSIDE the collapse: the design brief §4 has the finished state collapse steps 1–3 to a summary and
        leave the test offered ("step 4 offers the test; the card says nothing more is needed").
      */}
      <div className="card-kicker" data-websearch-step="test">Step 4</div>
      <h2 className="settings__heading">Test it</h2>
      <div className="settings__action">
        <DesignButton type="button" className="btn btn-secondary btn-compact" data-websearch-check aria-label={WEB_SEARCH_CONTROLS.check} disabled={disabled || busy} onClick={() => { void check(); }}>{inFlight === 'probe' ? 'Checking…' : 'Check status'}</DesignButton>
        <span>
          <span className="mcp__dot" data-state={inFlight === 'probe' ? 'checking' : shownHealth.state} aria-hidden="true" />{' '}
          <span data-websearch-health data-health={shownHealth.state}>{inFlight === 'probe' ? MCP_HEALTH_TEXT.checking : mcpHealthText(shownHealth)}</span>
        </span>
      </div>
      {inFlight !== null ? <p role="status" className="text-secondary" data-websearch-in-flight>{WEB_SEARCH_IN_FLIGHT[inFlight]}</p> : null}
      {shownHealth.state === 'unreachable' && shownHealth.detail ? <p className="text-tertiary settings__hint mono" data-websearch-health-detail>{shownHealth.detail}</p> : null}
      {probingMessage !== null ? <p role="status" className="text-secondary" data-websearch-probe-message>{probingMessage}</p> : null}
      {/* Round-2 Major 2: the write stood and the re-read after it did not — said, not swallowed. Outside the
          collapse, so it is readable in every situation (a successful store usually collapses the steps). */}
      {refreshNote !== null ? <p className="composer__error" role="alert" data-websearch-refresh-failure>{refreshNote}</p> : null}
      {/* REQ-CONFIG-225/371: the row's own words for why nothing connects — a placeholder still unresolved, or the host's
          own availability detail (a remote entry's missing prerequisite). Text, never a second rule of this card's. */}
      {row !== null && row.unresolved.length > 0 && (situation === 'fresh' || situation === 'wrong-endpoint') ? <p className="text-tertiary settings__hint" data-websearch-unresolved>{webSearchUnresolvedNote(row.unresolved, situation === 'wrong-endpoint')}</p> : null}
      {row !== null && !row.available && row.unresolved.length === 0 ? <p className="text-tertiary settings__hint" data-websearch-blocked>{row.availabilityDetail}</p> : null}

      {confirmingDelete ? (
        <Confirm
          title="Delete the stored key?"
          body={`This removes ${WEB_SEARCH_KEY_VARIABLE} for ${WEB_SEARCH_SERVER} from the ${scopeLabels[scope]} secrets file. Storing it again means pasting the key afresh; nothing else in the file is touched.`}
          onYes={() => { void remove(); }}
          onCancel={() => setConfirmingDelete(false)}
        />
      ) : null}
    </DesignCard>
  );
}

export function McpSettings(props: McpSettingsProps) {
  const rows = props.listing?.rows ?? [];
  const [probeMessage, setProbeMessage] = useState<string | null>(null);
  const probeAll = async () => { setProbeMessage(null); await props.onProbeAll(); setProbeMessage('Probed every configured server.'); };
  const chosen = props.secrets?.server ?? null;
  return (
    <div className="settings__section" data-mcp-settings>
      <h1 className="display">MCP Servers</h1>
      <DesignCard className="card settings__card" data-mcp-servers>
        <div className="providers-card__head">
          <div className="card-kicker">Configured servers</div>
          <div className="providers-card__actions">
            <DesignButton type="button" className="btn btn-secondary btn-compact" onClick={props.onRefresh} disabled={props.loading}>Reload</DesignButton>
            <DesignButton type="button" className="btn btn-primary btn-compact" aria-description="Probe every configured MCP server" disabled={props.probing || rows.length === 0} onClick={() => { void probeAll(); }} data-action="check-status">{props.probing ? 'Checking…' : 'Check status'}</DesignButton>
          </div>
        </div>
        <p className="text-secondary">Every server the configuration declares, whether or not it is enabled. Health is probed on demand and never remembered across launches; the switch turns a server off for this session only, and switching on a server the configuration holds disabled writes `enabled: true` to the configuration file.</p>
        {props.error ? <p className="composer__error" role="alert">{props.error}</p> : null}
        {probeMessage ? <p className="text-secondary" role="status">{probeMessage}</p> : null}
        {rows.length === 0 ? (
          <p className="text-secondary" data-mcp-empty>{props.loading ? 'Reading the configuration…' : `No tool servers are configured. Declare them under mcp_servers in ${props.listing?.configFile ?? 'the workspace configuration file'}.`}</p>
        ) : (
          <DesignTable className="table settings__grid" aria-label="Configured MCP servers">
            <thead><tr><th>Health</th><th>Server</th><th>Origin</th><th>Enabled</th></tr></thead>
            <tbody>
              {rows.map((row) => <Row key={row.name} row={row} health={props.health[row.name] ?? { state: 'unknown' }} probing={props.probing} onToggle={props.onToggle} />)}
            </tbody>
          </DesignTable>
        )}
      </DesignCard>
      <WebSearchSetupCard {...props} />
      <SetupCard setup={props.setup} onStart={props.onSetupStart} onCancel={props.onSetupCancel} />
      <DesignCard className="card settings__card" data-mcp-secrets>
        <div className="card-kicker">Stored secrets</div>
        <p className="text-secondary">What the two secrets files hold, per server and key, with every value masked. Adding, changing and deleting a secret is built on the `Set up web search` card above, for the built-in server's key; any other server's secrets are edited in <code className="mono">secrets.yaml</code> beside the configuration file (workspace or global). A stored secret takes effect on the next configuration load.</p>
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
