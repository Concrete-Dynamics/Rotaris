import { useState } from 'react';
import type { McpHealth, McpListing, McpSecretsView, McpServerRow, McpSetupStatus, McpSetupStep } from '@rotaris/contracts';

/**
 * REQ-MCP-091/092/108/109/115, REQ-CONFIG-350..353/437: the "MCP Servers" category. Structure from docs/spec; craft from
 * docs/design (tokens by name — the status dot, the toggle, the settings grid and the card are the adopted components).
 * The "Configured servers" card lists EVERY configured server, disabled ones included, with the four-state health as
 * text beside the indicator, the `{name} · {type}` label, the masked muted line, the origin word and the toggle; the
 * header's "Check status" probes sequentially through the run host; the secrets card is the READ side only (the write
 * controls of REQ-MCP-110/111 are owed, said so on the card).
 *
 * ADR-0035 (Part T): the "Code intelligence" card carries REQ-MCP-112's action for THIS workspace — "Set up code
 * intelligence for this workspace" — with REQ-MCP-099's three steps as text (which is in progress, which finished and
 * how), cancellable, one final outcome of three, re-runnable, a second concurrent run refused by the run host. The
 * machine-setup half of REQ-MCP-112 (developer tooling, package caches) and the warm steps of REQ-MCP-095/096 belong
 * with the onboarding domain's task registry (REQ-MCP-045/098), which does not exist; the bundle makes them moot for
 * `code_intelligence`, and the card says so as text (REQ-SHELL-149).
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
  readonly onSecretsServer: (server: string | null) => void;
  /** REQ-MCP-099/112: the project setup's status as the run host holds it; null before the first read. */
  readonly setup: McpSetupStatus | null;
  readonly onSetupStart: () => Promise<{ ok: boolean; message: string }>;
  readonly onSetupCancel: () => Promise<void>;
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
  // REQ-MCP-115: which of the two controls is in force, as text.
  const enablement = !row.enabled ? 'Configured off (enabled: false in the configuration file).' : row.overridden ? 'Overridden for this session — not persistent. To make it durable, set enabled in the configuration file.' : row.available ? 'On.' : 'Off: the command was not found on the executable search path.';
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
        <button type="button" className={`toggle${on ? ' is-on' : ''}`} role="switch" aria-checked={on} aria-label={`Enable ${row.name} for this session`} aria-description={enablement} disabled={!row.available || busy} title={!row.available ? 'The command was not found on the executable search path.' : undefined} onClick={() => { void toggle(); }} />
        <div className="text-tertiary settings__hint" data-enablement>{enablement}</div>
        {message ? <div className="composer__error" role="alert">{message}</div> : null}
      </td>
    </tr>
  );
}

/** REQ-MCP-112: progress per step as text, one final outcome, cancel while running, re-run when finished. */
function SetupCard({ setup, onStart, onCancel }: { setup: McpSetupStatus | null; onStart: McpSettingsProps['onSetupStart']; onCancel: McpSettingsProps['onSetupCancel'] }) {
  const [message, setMessage] = useState<string | null>(null);
  const running = setup?.state === 'running';
  const start = async () => { setMessage(null); const r = await onStart(); if (!r.ok) setMessage(r.message); };
  return (
    <div className="card settings__card" data-mcp-setup data-setup-state={setup?.state ?? 'unknown'} data-setup-outcome={setup?.outcome ?? ''}>
      <div className="providers-card__head">
        <div className="card-kicker">Code intelligence</div>
        <div className="providers-card__actions">
          {running
            ? <button type="button" className="btn btn-secondary btn-compact" onClick={() => { void onCancel(); }} data-action="setup-cancel">Cancel</button>
            : <button type="button" className="btn btn-primary btn-compact" disabled={setup === null} onClick={() => { void start(); }} data-action="setup-start">{setup?.state === 'finished' ? 'Set up again' : 'Set up code intelligence for this workspace'}</button>}
        </div>
      </div>
      <p className="text-secondary">Creates the bundled runtime's project for this workspace, indexes it and initialises its project memories — three steps, in order, each bounded; a workspace without code gets the project only. Runs in the background; you can cancel between steps or while a step is running.</p>
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
    </div>
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
      <div className="card settings__card" data-mcp-servers>
        <div className="providers-card__head">
          <div className="card-kicker">Configured servers</div>
          <div className="providers-card__actions">
            <button type="button" className="btn btn-secondary btn-compact" onClick={props.onRefresh} disabled={props.loading}>Reload</button>
            <button type="button" className="btn btn-primary btn-compact" aria-description="Probe every configured MCP server" disabled={props.probing || rows.length === 0} onClick={() => { void probeAll(); }} data-action="check-status">{props.probing ? 'Checking…' : 'Check status'}</button>
          </div>
        </div>
        <p className="text-secondary">Every server the configuration declares, whether or not it is enabled. Health is probed on demand and never remembered across launches; the switch turns a server off for this session only.</p>
        {props.error ? <p className="composer__error" role="alert">{props.error}</p> : null}
        {probeMessage ? <p className="text-secondary" role="status">{probeMessage}</p> : null}
        {rows.length === 0 ? (
          <p className="text-secondary" data-mcp-empty>{props.loading ? 'Reading the configuration…' : `No tool servers are configured. Declare them under mcp_servers in ${props.listing?.configFile ?? 'the workspace configuration file'}.`}</p>
        ) : (
          <table className="table settings__grid" aria-label="Configured MCP servers">
            <thead><tr><th>Health</th><th>Server</th><th>Origin</th><th>Enabled</th></tr></thead>
            <tbody>
              {rows.map((row) => <Row key={row.name} row={row} health={props.health[row.name] ?? { state: 'unknown' }} probing={props.probing} onToggle={props.onToggle} />)}
            </tbody>
          </table>
        )}
      </div>
      <SetupCard setup={props.setup} onStart={props.onSetupStart} onCancel={props.onSetupCancel} />
      <div className="card settings__card" data-mcp-secrets>
        <div className="card-kicker">Stored secrets</div>
        <p className="text-secondary">What the two secrets files hold, per server and key, with every value masked. Adding, changing and deleting a secret here is not built yet; edit <code className="mono">secrets.yaml</code> beside the configuration file (workspace or global). A stored secret takes effect on the next configuration load.</p>
        <div className="settings__action">
          <label htmlFor="mcp-secrets-server">View</label>
          <select id="mcp-secrets-server" className="input select settings__select" aria-label="Secrets for" value={chosen ?? ''} onChange={(e) => props.onSecretsServer(e.currentTarget.value === '' ? null : e.currentTarget.value)}>
            <option value="">All servers</option>
            {(props.secrets?.servers ?? []).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        {props.secrets && props.secrets.servers.length === 0 ? (
          <p className="text-secondary" data-secrets-empty="no-servers">No server is configured, so there is nothing a secret could belong to.</p>
        ) : props.secrets && props.secrets.rows.length === 0 ? (
          <p className="text-secondary" data-secrets-empty={chosen === null ? 'none-at-all' : 'none-for-server'}>{chosen === null ? 'No server holds a stored secret.' : `${chosen} holds no stored secret.`}</p>
        ) : props.secrets ? (
          <table className="table settings__grid" aria-label="Stored secrets">
            <thead><tr><th>Server</th><th>Key</th><th>Value</th><th>Scope</th></tr></thead>
            <tbody>
              {props.secrets.rows.map((r) => <tr key={`${r.server} ${r.key}`} data-secret-row={`${r.server}.${r.key}`}><td className="mono">{r.server}</td><td className="mono">{r.key}</td><td className="mono" data-mask>{r.masked}</td><td data-scope>{r.scope}</td></tr>)}
            </tbody>
          </table>
        ) : <p className="text-secondary">Reading…</p>}
        {chosen !== null && props.secrets ? (
          <div className="settings__hint text-secondary" data-expected-keys>
            {props.secrets.expected.length === 0 ? `${chosen} declares no env keys.` : <>Expected keys of {chosen}: {props.secrets.expected.map((e) => <span key={e.key} className="mono" data-expected={e.key} data-satisfied={e.satisfied ? 'yes' : 'no'}>{e.key} ({e.satisfied ? 'stored' : 'missing'}) </span>)}</>}
          </div>
        ) : null}
      </div>
    </div>
  );
}
