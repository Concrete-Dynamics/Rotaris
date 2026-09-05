import { useState } from 'react';
import { PROVIDER_STATE_LABELS, type ProviderRow } from '@rotaris/contracts';

/**
 * REQ-CONFIG-329's providers card and REQ-PROVIDER-140/141: one right-aligned "Add endpoint" action (user-wide),
 * one row per provider — display name and id, the sign-in method's label or the managed-by-configuration
 * statement, whether authenticated, the display mask of a stored value, the base URL, the health state as a
 * text label — and, opened per row, its settings: the masked key field (api-key providers only, empty keeps
 * the current one), the base URL (instances only), Save, Validate, Re-authenticate, Sign out and, for a
 * user-defined instance, Delete behind a confirmation naming it. Every outcome is reported in the row.
 */
export interface ProvidersCardProps {
  readonly rows: readonly ProviderRow[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly onAdd: () => void;
  readonly onReauthenticate: (id: string) => void;
  readonly onCheck: (id: string) => Promise<void>;
  readonly onSave: (id: string, edit: { apiKey: string; baseUrl: string | null; validate: boolean }) => Promise<{ ok: boolean; message: string }>;
  readonly onValidate: (id: string) => Promise<{ ok: boolean; message: string }>;
  readonly onSignOut: (id: string) => Promise<{ ok: boolean; message: string }>;
  readonly onDelete: (id: string) => Promise<{ ok: boolean; message: string }>;
  readonly onRefreshAll: () => Promise<{ ok: boolean; message: string }>;
}

function Row({ row, props }: { row: ProviderRow; props: ProvidersCardProps }) {
  const [open, setOpen] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState(row.baseUrl ?? '');
  const [skipValidation, setSkipValidation] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const act = async (what: string, fn: () => Promise<{ ok: boolean; message: string }>) => {
    if (busy) return;
    setBusy(what);
    const r = await fn();
    setBusy(null);
    setMessage({ ok: r.ok, text: r.message });
    if (r.ok && what === 'save') setApiKey('');
  };
  const health = row.health ? PROVIDER_STATE_LABELS[row.health.state] : row.available ? PROVIDER_STATE_LABELS.unknown : PROVIDER_STATE_LABELS.coming_soon;
  const canKey = row.method === 'api-key';
  return (
    <>
      <tr data-provider={row.id} data-authenticated={row.authenticated ? 'yes' : 'no'}>
        <td><div>{row.displayName}</div><div className="mono text-tertiary settings__origin">{row.id}</div></td>
        <td>{row.methodLabel}</td>
        <td>{row.authenticated ? 'Authenticated' : 'Not authenticated'}{row.displayMask ? <div className="mono text-tertiary" data-mask>{row.displayMask}</div> : null}</td>
        <td className="mono">{row.baseUrl ?? '—'}</td>
        <td><span data-health={row.health?.state ?? 'unknown'}>{health}</span>{row.health && row.health.detail ? <div className="text-tertiary settings__hint">{row.health.detail}</div> : null}</td>
        <td className="settings__action">
          <button type="button" className="btn btn-link btn-compact" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? 'Close' : 'Settings'}</button>
        </td>
      </tr>
      {open && (
        <tr className="provider-settings" data-provider-settings={row.id}>
          <td colSpan={6}>
            <div className="card settings__card">
              <div className="card-kicker">{row.displayName} settings</div>
              <div className="provider-settings__fields">
                <label className="provider-dialog__field">
                  <span className="text-secondary">API key{canKey ? ' (leave empty to keep the current key)' : ''}</span>
                  <input className="input mono" type="password" autoComplete="off" value={apiKey} disabled={!canKey || busy !== null} onChange={(e) => setApiKey(e.currentTarget.value)} aria-label={`API key for ${row.displayName}`} title={canKey ? undefined : `${row.displayName} does not sign in with a key`} />
                </label>
                <label className="provider-dialog__field">
                  <span className="text-secondary">Base URL{row.userDefined ? '' : ' (fixed for this provider)'}</span>
                  <input className="input mono" value={baseUrl} disabled={!row.userDefined || busy !== null} onChange={(e) => setBaseUrl(e.currentTarget.value)} aria-label={`Base URL for ${row.displayName}`} />
                </label>
                {canKey && <label className="provider-settings__opt text-secondary"><input type="checkbox" checked={skipValidation} onChange={(e) => setSkipValidation(e.currentTarget.checked)} /> Skip validation on save (the key is stored without a catalog check)</label>}
              </div>
              <div className="dialog-actions">
                <button type="button" className="btn btn-primary btn-compact" disabled={busy !== null} onClick={() => { void act('save', () => props.onSave(row.id, { apiKey, baseUrl: row.userDefined && baseUrl.trim() !== (row.baseUrl ?? '') ? baseUrl.trim() : null, validate: !skipValidation })); }}>{busy === 'save' ? 'Saving…' : 'Save'}</button>
                <button type="button" className="btn btn-secondary btn-compact" disabled={busy !== null} onClick={() => { void act('validate', () => props.onValidate(row.id)); }}>{busy === 'validate' ? 'Validating…' : 'Validate'}</button>
                <button type="button" className="btn btn-secondary btn-compact" disabled={busy !== null} onClick={() => { if (canKey) setMessage({ ok: true, text: 'Enter a replacement key above and save it.' }); else props.onReauthenticate(row.id); }}>Re-authenticate</button>
                <button type="button" className="btn btn-secondary btn-compact" disabled={busy !== null || !row.authenticated} onClick={() => { void act('sign-out', () => props.onSignOut(row.id)); }}>{busy === 'sign-out' ? 'Signing out…' : 'Sign out'}</button>
                {row.userDefined && !confirmDelete && <button type="button" className="btn btn-danger btn-compact" disabled={busy !== null} onClick={() => setConfirmDelete(true)}>Delete</button>}
                <button type="button" className="btn btn-ghost btn-compact" disabled={busy !== null} onClick={() => { void act('check', async () => { await props.onCheck(row.id); return { ok: true, message: 'Checked.' }; }); }}>{busy === 'check' ? 'Checking…' : 'Check health'}</button>
              </div>
              {confirmDelete && (
                <div className="card provider-dialog__confirm" role="alertdialog" aria-label="Confirm deletion">
                  <p className="card-body">Delete the endpoint <strong>{row.displayName}</strong> ({row.id})? Its stored key and catalog entry are removed; workspace model references will not be changed.</p>
                  <div className="dialog-actions">
                    <button type="button" className="btn btn-secondary btn-compact" autoFocus onClick={() => setConfirmDelete(false)}>Keep it</button>
                    <button type="button" className="btn btn-danger btn-compact" onClick={() => { setConfirmDelete(false); void act('delete', () => props.onDelete(row.id)); }}>Delete {row.displayName}</button>
                  </div>
                </div>
              )}
              {message && <p className={message.ok ? 'text-secondary' : 'composer__error'} role={message.ok ? 'status' : 'alert'} data-provider-message>{message.text}</p>}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function ProvidersCard(props: ProvidersCardProps) {
  const [refreshing, setRefreshing] = useState<string | null>(null);
  return (
    <div className="card settings__card providers-card" data-providers>
      <div className="providers-card__head">
        <div className="card-kicker">Providers</div>
        <div className="providers-card__actions">
          <button type="button" className="btn btn-secondary btn-compact" disabled={refreshing !== null} onClick={() => { setRefreshing('…'); void props.onRefreshAll().then((r) => setRefreshing(r.message)); }}>Refresh catalogs</button>
          <button type="button" className="btn btn-primary btn-compact" onClick={props.onAdd} data-action="add-endpoint">Add endpoint</button>
        </div>
      </div>
      <p className="text-secondary">Endpoints are user-wide: a provider added here is available to every workspace. Sign in with a key; the key is validated against the provider's model catalog before it is stored, and only its masked form is ever shown.</p>
      {props.error && <p className="composer__error" role="alert">{props.error}</p>}
      {refreshing && refreshing !== '…' && <p className="text-secondary" role="status">{refreshing}</p>}
      <table className="table settings__grid providers-card__table" aria-label="Providers">
        <thead><tr><th>Provider</th><th>Sign-in</th><th>Status</th><th>Base URL</th><th>Health</th><th></th></tr></thead>
        <tbody>
          {props.rows.length === 0 && <tr><td colSpan={6} className="text-secondary">{props.loading ? 'Reading providers…' : 'No providers.'}</td></tr>}
          {props.rows.map((row) => <Row key={row.id} row={row} props={props} />)}
        </tbody>
      </table>
    </div>
  );
}
