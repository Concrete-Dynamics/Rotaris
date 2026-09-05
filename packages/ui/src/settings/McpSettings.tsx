import { useState } from 'react';
import type { McpHealth, McpListing, McpSecretsView, McpServerRow } from '@rotaris/contracts';

/**
 * REQ-MCP-091/092/108/109/115, REQ-CONFIG-350..353/437: the "MCP Servers" category. Structure from docs/spec; craft from
 * docs/design (tokens by name — the status dot, the toggle, the settings grid and the card are the adopted components).
 * The "Configured servers" card lists EVERY configured server, disabled ones included, with the four-state health as
 * text beside the indicator, the `{name} · {type}` label, the masked muted line, the origin word and the toggle; the
 * header's "Check status" probes sequentially through the run host; the secrets card is the READ side only (the write
 * controls of REQ-MCP-110/111 are owed, said so on the card); the machine-setup action is present, disabled, with its
 * sentence (REQ-MCP-095/112 are owed with ADR-0035).
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
}

const HEALTH_TEXT: Record<McpHealth['state'], string> = { unknown: 'Unknown', checking: 'Checking…', healthy: 'Healthy', unreachable: 'Unreachable' };

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
      <div className="card settings__card" data-mcp-setup>
        <div className="card-kicker">Machine setup</div>
        <div className="settings__action">
          <button type="button" className="btn btn-secondary" disabled title="The bundled code-intelligence runtime and its setup manifest are not built yet (ADR-0035).">Check developer tooling and package caches</button>
          <span className="text-secondary settings__hint">Re-runs the checks of the developer tooling and the package caches the MCP servers depend on. Not available: the setup manifest of the bundled runtime is not built yet (ADR-0035).</span>
        </div>
      </div>
    </div>
  );
}
