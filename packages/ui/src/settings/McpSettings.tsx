import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConfigSnapshot, McpHealth, McpListing, McpProvisioning, McpSecretsView, McpServerRow, McpSetupStatus, McpSetupStep } from '@rotaris/contracts';
import { Button as DesignButton, Card as DesignCard, Input as DesignInput, Select as DesignSelect, Table as DesignTable } from '../design-system/index.js';
import { Confirm } from './Confirm.js';
import { Fatal } from './ConfigSettings.js';
import {
  deletedKeySentence, mcpHealthText, presetAfter, presetTabIndex, storedKeySentence, webSearchAboutControlLabel, webSearchFileLine, webSearchHeaderKeyNote,
  webSearchOtherTransport, webSearchPreset, webSearchProbeBasis, webSearchPressFailure, webSearchRowSetupVisible, webSearchSituation, webSearchStanza,
  webSearchStepFor, webSearchStepLabel, webSearchStepShortLabel, webSearchStoredKey, webSearchUnresolvedNote,
  MCP_HEALTH_TEXT,
  WEB_SEARCH_ABOUT, WEB_SEARCH_ABOUT_CONTROL, WEB_SEARCH_CONTROLS, WEB_SEARCH_DECLARATION_STANDS, WEB_SEARCH_IN_FLIGHT, WEB_SEARCH_KEY_VARIABLE,
  WEB_SEARCH_NEEDS_ENABLED, WEB_SEARCH_NO_ENTRY, WEB_SEARCH_PRESETS, WEB_SEARCH_REFRESH_FAILED, WEB_SEARCH_SERVER, WEB_SEARCH_SETUP_ROW_ACTION,
  WEB_SEARCH_SETUP_ROW_DESCRIPTION, WEB_SEARCH_SETUP_ROW_LABEL, WEB_SEARCH_STEPS, WEB_SEARCH_WORKING_SUMMARY, WEB_SEARCH_WRONG_ENDPOINT,
  type WebSearchInFlight, type WebSearchPreset, type WebSearchScope, type WebSearchSetupHandlers, type WebSearchStepId,
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
  /**
   * The row control's focus route (stepper/inline-help change, 2026-11-09): the card REGISTERS a function that focuses
   * the bar control of the step the current situation needs, and unregisters it when it unmounts (`null`) — so the
   * category's row can land the user on that step without knowing the card's step layout, and neither side reaches
   * into the other's props (a ref passed through props may not be written by the receiver).
   */
  readonly onSetupFocusRoute?: ((focus: (() => void) | null) => void) | undefined;
}

const HEALTH_TEXT: Record<McpHealth['state'], string> = { unknown: 'Unknown', checking: 'Checking…', healthy: 'Healthy', unreachable: 'Unreachable' };
const STEP_TEXT: Record<McpSetupStep['status'], string> = { pending: 'Not started', running: 'In progress…', succeeded: 'Succeeded', failed: 'Failed', 'skipped-no-code': 'Skipped — no code', 'not-attempted': 'Not attempted' };
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
      <td data-origin>{row.origin}</td>
      <td>
        <DesignButton type="button" className={`toggle${on ? ' is-on' : ''}`} role="switch" aria-checked={on} aria-label={accessibleName} aria-description={accessibleDescription} disabled={!row.available || busy} title={title} onClick={() => { void toggle(); }} />
        {/*
          The way INTO the guided card, beside the switch and in the same cell (one line, one column): it stands while
          the row IS the shipped http default with no key stored yet (`webSearchRowSetupVisible`) — the state the card
          exists for — and its press focuses the bar control of the step the situation needs. Its visible words are
          REQ-CONFIG-350/464's boundary said honestly: this screen sets the key up, it authors no server.
        */}
        {showWebSearchSetup ? (
          <DesignButton type="button" className="btn btn-link btn-compact" data-websearch-row-setup
            aria-label={WEB_SEARCH_SETUP_ROW_LABEL} aria-description={WEB_SEARCH_SETUP_ROW_DESCRIPTION}
            onClick={() => onOpenWebSearchSetup?.()}>{WEB_SEARCH_SETUP_ROW_ACTION}</DesignButton>
        ) : null}
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
            : <DesignButton type="button" className="btn btn-secondary btn-compact" disabled={setup === null} onClick={() => { void start(); }} data-action="setup-start">{setup?.state === 'finished' ? 'Set up again' : 'Set up code intelligence for this workspace'}</DesignButton>}
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
  /**
   * Rounds 2 and 3, Major 3 (as corrected): the card's own probe result and the evidence it was taken under — the
   * BASIS (the serialised situation inputs, `webSearchProbeBasis`) and the two views the render read it from. The
   * result is the card's alone: the parent row's health is never written by a card probe.
   */
  const [probe, setProbe] = useState<{ readonly basis: string; readonly health: McpHealth; readonly read: McpSecretsView | null; readonly listed: McpListing | null } | null>(null);
  const [refreshNote, setRefreshNote] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  /**
   * The two disclosures of this change (2026-11-09): the info region behind the head's icon control, and the step
   * bar's own bodies. `closedSteps` names the BODIES THE USER CLOSED (`open === !closedSteps.has(id)`), so every body
   * starts open and nothing is gated: the guide names the position (`aria-current="step"`) without withholding a
   * step, and the one state that closes anything remains the existing `ready` collapse.
   */
  const [aboutOpen, setAboutOpen] = useState(false);
  /**
   * FND-2 of the Opus 5.5 review (2026-11-09): after Yes the confirmation closes, `Confirm`'s own focus return
   * finds its opener gone (the delete button is disabled while the press is in flight and removed once the key is
   * gone, so `opener.isConnected` is false) and focus fell to `body`. This counter is set on a SUCCESSFUL delete and
   * read by an effect that lands focus on the step that now needs the user — the same route the row's control uses.
   * It is a counter, not a boolean, so two deletes in a row each move focus.
   */
  const [focusAfterRemoval, setFocusAfterRemoval] = useState(0);
  const [closedSteps, setClosedSteps] = useState<ReadonlySet<WebSearchStepId>>(() => new Set<WebSearchStepId>());
  const stepRefs = useRef(new Map<WebSearchStepId, HTMLButtonElement>());
  const stepBodyRefs = useRef(new Map<WebSearchStepId, HTMLDivElement>());
  const [openFailure, setOpenFailure] = useState<string | null>(null);
  const [copyNote, setCopyNote] = useState<string | null>(null);
  const preset = webSearchPreset(presetId);
  const stanza = webSearchStanza(preset);
  /**
   * The inputs the card's own probe result is kept under (round-2 Major 3): the entry, the stored key and the card's
   * other situation facts in one serialised BASIS (`webSearchProbeBasis`), the PARENT health included — a result kept
   * under a basis that still holds is about the current state, and a newer category probe supersedes one whose inputs
   * moved. The preset radio is not an input: the probe tests the entry in the file, and choosing a preset changes only
   * the stanza step 2 hands over.
   */
  const situationInputs = webSearchProbeBasis({ unavailable, row, storedKey, health });
  /**
   * Round-3 Major 2 (with Major 1): the result is read only while BOTH witnesses still hold — the basis, and the
   * IDENTITY of the two views the render read it against. A configuration change or a write re-reads the listing and
   * the card's secrets view, and a replaced key arrives behind the one constant mask (`REDACTION_MARK`), so a fresh
   * read of either view is the only witness the card has that something it cannot see may have changed —
   * `webSearchProbeBasis` carries no mask for exactly that reason.
   *
   * A stale result is DISCARDED, never merely bypassed: the `setProbe(null)` below is React's documented adjustment
   * of state during a render, so an older result can never come back when the inputs return to an earlier value —
   * without it, a stale Unreachable would be read again after the parent health went Checking and back to Healthy, and
   * a fresh read would leave `ready` standing over a key the probe never saw. A newer category probe wins outright.
   */
  const probeStale = probe !== null && (probe.basis !== situationInputs || probe.read !== props.webSearchSecrets || probe.listed !== props.listing);
  if (probeStale) setProbe(null);
  const shownHealth = probe !== null && !probeStale ? probe.health : health;
  /** Major 1 (rework round 1, 2026-11-09): the situation reads the card's OWN probe result, so the Test step
   * genuinely decides `ready`/`wrong-endpoint` — a Healthy probe collapses the steps, a failing one takes an
   * already-ready card back to `wrong-endpoint`. The parent row's health is untouched (the category's probe owns it,
   * and it supersedes a card result whose inputs or views have changed). */
  const situation = webSearchSituation({ unavailable, row, storedKey, health: shownHealth });
  const disabled = unavailable !== null;
  const collapsed = situation === 'ready' && !expanded;
  /** The step the bar marks and the row control targets (REQ-SHELL-149: the position is also the number in the label). */
  const current = webSearchStepFor(situation);
  const stepOpen = (id: WebSearchStepId) => !closedSteps.has(id);
  const toggleStep = (id: WebSearchStepId) => setClosedSteps((closed) => { const next = new Set(closed); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  /**
   * The row's focus route (FND-1 of the Opus 5.5 review, 2026-11-09): the press lands the user on the step's OWN
   * first control — the provider radios, `Copy`, the key field, `Check status` — and NOT on the bar control, which is
   * a disclosure toggle: focusing that one made the next Enter/Space CLOSE the very body the user had just been sent
   * to, while `WEB_SEARCH_SETUP_ROW_DESCRIPTION` says "Moves to ... the step that needs you". A body the user had
   * closed is OPENED first (never focused through a fold), and the bar control stays the fallback for the case the
   * body holds nothing focusable — so the route always lands somewhere and never strands focus.
   *
   * `current` is read through a ref that an effect keeps up to date, so the route is REGISTERED once and a re-render
   * never leaves a stale closure behind; `McpSettings` holds the function and the cleanup hands `null` back, so a card
   * that unmounts leaves no route behind.
   */
  const currentRef = useRef(current);
  useEffect(() => { currentRef.current = current; }, [current]);
  /** A press that had to OPEN a body lands once that state has committed (the `closedSteps` effect below). */
  const [pendingLand, setPendingLand] = useState(0);
  const focusCurrentStep = useCallback(() => {
    const id = currentRef.current;
    const body = stepBodyRefs.current.get(id);
    // A static render (the tests) hands a stub here, not a DOM node; a stub has no `querySelector` and no `hidden`.
    const queryable = body !== undefined && typeof body.querySelector === 'function' ? body : null;
    if (queryable !== null && queryable.hidden) {
      setClosedSteps((closed) => { if (!closed.has(id)) return closed; const next = new Set(closed); next.delete(id); return next; });
      setPendingLand((n) => n + 1);
      return;
    }
    const inner = queryable?.querySelector<HTMLElement>('[tabindex="0"]')
      ?? queryable?.querySelector<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)');
    (inner ?? stepRefs.current.get(id))?.focus();
  }, []);
  const registerSetupFocus = props.onSetupFocusRoute;
  useEffect(() => {
    if (registerSetupFocus === undefined) return undefined;
    registerSetupFocus(focusCurrentStep);
    return () => { registerSetupFocus(null); };
  }, [registerSetupFocus, focusCurrentStep]);
  /** The body a press had to open is committed now: land inside it. */
  useEffect(() => {
    if (pendingLand === 0) return;
    focusCurrentStep();
  }, [pendingLand, focusCurrentStep]);
  /** FND-2: the delete took the control focus was on with it; land on the step that needs the user now. */
  useEffect(() => {
    if (focusAfterRemoval === 0) return;
    focusCurrentStep();
  }, [focusAfterRemoval, focusCurrentStep]);
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
      // The write changed the key the probe observed, and the card's probe result cannot describe the new key
      // (round-2 Major 3; round-3 Major 1: the write path is also the one replacement this card can observe — the
      // value itself never reaches it, and the re-reads that follow the write would move the views' identity anyway).
      setProbe(null);
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
      setProbe(null);
      if (r.refreshFailure !== null) setRefreshNote(WEB_SEARCH_REFRESH_FAILED(r.refreshFailure));
      // FND-2 (Opus 5.5 review, 2026-11-09): the delete carries its own opener away; the effect above lands focus on
      // the step that needs the user now, so it never falls to `body`.
      setFocusAfterRemoval((n) => n + 1);
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
      setProbe({ basis: situationInputs, health: result, read: props.webSearchSecrets, listed: props.listing });
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
      {/*
        The head: the kicker and, on its right, the ONE icon control of this change (`ph ph-info`, REQ-SHELL-144's
        named control). The three sentences that used to stand here as loose prose now sit behind it (progressive
        disclosure): the bar below carries the flow, so the summary of it, the boundary sentence and the
        take-effect sentence are explanations rather than the next action. No dialog and no focus change: the
        region is a disclosure, Escape stays the window's (REQ-SHELL-055 untouched).
      */}
      <div className="providers-card__head">
        <div className="card-kicker">Set up web search</div>
        <DesignButton type="button" className="btn btn-ghost btn-icon"
          aria-label={webSearchAboutControlLabel(aboutOpen)} aria-expanded={aboutOpen} aria-controls="websearch-about" title={WEB_SEARCH_ABOUT_CONTROL}
          data-websearch-about-control disabled={disabled} onClick={() => setAboutOpen((v) => !v)}>
          <i className="ph ph-info" aria-hidden="true" />
        </DesignButton>
      </div>
      {/*
        The region is ALWAYS rendered and `hidden` while closed, exactly as the step bodies are: `aria-controls`
        from the control above then always names an element that exists (a dangling id is not a disclosure), and the
        prose stays out of sight (`hidden`, not merely dimmed) so the closed card says what it did before. The three
        sentences are the same three, word for word (REQ-MCP-111, REQ-CONFIG-350/464, REQ-MCP-110).
      */}
      <div id="websearch-about" data-websearch-about hidden={!aboutOpen}>
        {WEB_SEARCH_ABOUT.map((sentence) => <p key={sentence} className="text-secondary settings__hint">{sentence}</p>)}
      </div>

      {collapsed ? (
        <p role="status" data-websearch-summary>
          {WEB_SEARCH_WORKING_SUMMARY(storedKey?.scope ?? scopeLabels[scope])}{' '}
          <DesignButton type="button" className="btn btn-link btn-compact" data-websearch-change onClick={() => setExpanded(true)}>Change</DesignButton>
        </p>
      ) : (
        <>
          {/*
            The step bar (REQ-MCP-111's walk, REQ-SHELL-149): four named controls over their own bodies. Nothing is
            gated — every body starts OPEN and a control closes only the body it names — and the current step is a
            NUMBER in TEXT (`Step 2 · …`) beside `aria-current="step"`, never colour alone. The controls are ordinary
            buttons, so no roving tabIndex moves here (that stays the preset radios', Minor 1 of 2026-11-09).
          */}
          <ol className="settings__steps settings__steps--bar" aria-label="Web search setup steps" data-websearch-step-bar>
            {WEB_SEARCH_STEPS.map((s, i) => (
              <li key={s.id}>
                <DesignButton
                  ref={(el) => { if (el === null) stepRefs.current.delete(s.id); else stepRefs.current.set(s.id, el); }}
                  type="button" className={`btn btn-ghost btn-compact${current === s.id ? ' is-active' : ''}`}
                  aria-expanded={stepOpen(s.id)} aria-controls={`websearch-step-${s.id}`} aria-current={current === s.id ? 'step' : undefined}
                  aria-label={webSearchStepLabel(i, s)}
                  data-websearch-step-control={s.id} data-step-current={current === s.id ? 'yes' : 'no'}
                  disabled={disabled} onClick={() => toggleStep(s.id)}>{webSearchStepShortLabel(i)}</DesignButton>
              </li>
            ))}
          </ol>

          <div id="websearch-step-provider" data-websearch-step-body="provider" hidden={!stepOpen('provider')} ref={(el) => { if (el === null) stepBodyRefs.current.delete('provider'); else stepBodyRefs.current.set('provider', el); }}>
            <h2 className="settings__heading">{WEB_SEARCH_STEPS[0]?.title}</h2>
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
                    <DesignButton type="button" className="btn btn-link btn-compact" data-websearch-key={p.id} aria-label={WEB_SEARCH_CONTROLS.key(p.name)} disabled={disabled || busy} onClick={() => { void getKey(p); }}>Get a key <i className="ph ph-arrow-square-out" aria-hidden="true" /></DesignButton>
                  ) : null}
                </div>
              ))}
            </div>
            {openFailure !== null ? <p className="composer__error" role="alert" data-websearch-open-failure>{openFailure}</p> : null}
          </div>

          <div id="websearch-step-declaration" data-websearch-step-body="declaration" hidden={!stepOpen('declaration')} ref={(el) => { if (el === null) stepBodyRefs.current.delete('declaration'); else stepBodyRefs.current.set('declaration', el); }}>
            <h2 className="settings__heading">{WEB_SEARCH_STEPS[1]?.title}</h2>
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
          </div>

          {/*
            The key body stands in EVERY situation (never omitted): its bar control names step 3, and where the
            control does not apply — a `web_search` entry of another transport (REQ-CONFIG-181: the key control
            belongs to the shipped http default) — the body says so in words (REQ-SHELL-149) instead of leaving the
            bar's `aria-controls` pointing at no element.
          */}
          <div id="websearch-step-key" data-websearch-step-body="key" hidden={!stepOpen('key')} ref={(el) => { if (el === null) stepBodyRefs.current.delete('key'); else stepBodyRefs.current.set('key', el); }}>
            <h2 className="settings__heading">{WEB_SEARCH_STEPS[2]?.title}</h2>
            {situation === 'other-transport' && row !== null ? (
              <p className="text-secondary" data-websearch-other-transport>{webSearchOtherTransport(row.type)}</p>
            ) : hideKeyStep && preset !== null ? (
              <p className="text-secondary" data-websearch-header-key>{webSearchHeaderKeyNote(preset, props.listing?.configFile ?? null)}</p>
            ) : (
              <>
                <div className="settings__action">
                  <label htmlFor="websearch-key">Search API key</label>
                  <DesignInput
                    id="websearch-key" type="password" autoComplete="off" className="input settings__key-field" data-websearch-key-field
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
                {situation === 'needs-enabled' ? <p className="text-secondary" data-websearch-needs-enabled>{WEB_SEARCH_NEEDS_ENABLED}</p> : null}
                {situation === 'needs-unresolved' ? <p className="text-secondary" data-websearch-unresolved-after-key>{webSearchUnresolvedNote(row?.unresolved ?? [], true)}</p> : null}
              </>
            )}
          </div>
        </>
      )}

      {/*
        Step 4 is OUTSIDE the collapse: the design brief §4 has the finished state collapse steps 1–3 to a summary and
        leave the test offered ("step 4 offers the test; the card says nothing more is needed"). Like the others it has
        its own body, open by default and closable through its bar control — but where the bar is not drawn (the
        `ready` collapse, or `expanded` leaving the summary standing) the test body is FORCED open: a body the user
        closed while the bar stood must never be stranded hidden once the bar is gone (a fold with no opener is a
        defect, and the test is what the finished state is for).
      */}
      <div id="websearch-step-test" data-websearch-step-body="test" hidden={!collapsed && !stepOpen('test')} ref={(el) => { if (el === null) stepBodyRefs.current.delete('test'); else stepBodyRefs.current.set('test', el); }}>
        <h2 className="settings__heading">{WEB_SEARCH_STEPS[3]?.title}</h2>
        <div className="settings__action">
          <DesignButton type="button" className={collapsed ? 'btn btn-primary btn-compact' : 'btn btn-secondary btn-compact'} data-websearch-check aria-label={WEB_SEARCH_CONTROLS.check} disabled={disabled || busy} onClick={() => { void check(); }}>{inFlight === 'probe' ? 'Checking…' : 'Check status'}</DesignButton>
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
      </div>

      {confirmingDelete ? (
        <Confirm
          title="Delete the stored key?"
          body={`This removes ${WEB_SEARCH_KEY_VARIABLE} for ${WEB_SEARCH_SERVER} from the ${scopeLabels[scope]} secrets file. Storing it again means pasting the key afresh; nothing else in the file is touched.`}
          busy={busy}
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
  /**
   * The row's way into the guided card (stepper/inline-help change, 2026-11-09): the cell holds the function the card
   * registers (the current step's bar control), and the row's control stands only while it can still do something —
   * `webSearchRowSetupVisible` is read PER ROW at the call site below (never once for the table: one shared value
   * would hand every server this card's way in), against the SAME `web_search` row the card reads and the card's OWN
   * secrets view (Minor 2 of 2026-11-09: never the chooser's filtered one).
   */
  const setupFocus = useRef<(() => void) | null>(null);
  const registerSetupFocus = useCallback((focus: (() => void) | null) => { setupFocus.current = focus; }, []);
  return (
    <div className="settings__section" data-mcp-settings>
      <h1 className="display">MCP Servers</h1>
      <DesignCard className="card settings__card" data-mcp-servers>
        <div className="providers-card__head">
          <div className="card-kicker">Configured servers</div>
          <div className="providers-card__actions">
            <DesignButton type="button" className="btn btn-secondary btn-compact" onClick={props.onRefresh} disabled={props.loading}>Reload</DesignButton>
            {/* FND-3 of the Opus 5.5 review (2026-11-09): §1.7's one filled control is per screen/view, and this
                view carried THREE `.btn-primary` at once (this one, the guided card's `Store the key`, and the code
                intelligence card's action). The card-head action is the mockup's own secondary variant —
                `SETTINGS`' Providers card head draws `Check status` as `btn btn-secondary btn-compact` — so the
                fill belongs to the one control that writes something, the guided card's `Store the key`. */}
            <DesignButton type="button" className="btn btn-secondary btn-compact" aria-description="Probe every configured MCP server" disabled={props.probing || rows.length === 0} onClick={() => { void probeAll(); }} data-action="check-status">{props.probing ? 'Checking…' : 'Check status'}</DesignButton>
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
              {rows.map((row) => <Row key={row.name} row={row} health={props.health[row.name] ?? { state: 'unknown' }} probing={props.probing} onToggle={props.onToggle} showWebSearchSetup={webSearchRowSetupVisible(row, webSearchStoredKey(props.webSearchSecrets))} onOpenWebSearchSetup={() => setupFocus.current?.()} />)}
            </tbody>
          </DesignTable>
        )}
      </DesignCard>
      <WebSearchSetupCard {...props} onSetupFocusRoute={registerSetupFocus} />
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
