import { useState } from 'react';
import { PROVIDER_STATE_LABELS, type ProviderRow, type ProviderStateName } from '@rotaris/contracts';
import { Button as DesignButton } from '../design-system/index.js';
import { Checkbox as DesignCheckbox, Input as DesignInput } from '../design-system/index.js';
import { ConfirmDialog, EmptyState, Table as DesignTable, TableCard, Tooltip as DesignTooltip } from '../design-system/index.js';

/**
 * REQ-CONFIG-329's providers card and REQ-PROVIDER-140/141: one right-aligned "Add endpoint" action
 * (user-wide), one row per provider, and, opened per row, its settings - the masked key field
 * (api-key providers only, empty keeps the current one), the base URL (instances only), Save,
 * Validate, Re-authenticate, Sign out and, for a user-defined instance, Delete behind a confirmation
 * naming it. Every outcome is reported in the row.
 *
 * Row anatomy is REQ-CONFIG-367's: a status line - an indicator whose tooltip is the provider
 * detail, the provider label, the status word spelled beside the indicator (REQ-CONFIG-368, the
 * vocabulary of REQ-NOTIFY-200), and a detail line - plus the one destination sentence of
 * REQ-CONFIG-370 and a right-aligned action row. Status colours are REQ-CONFIG-369's pairs: the
 * indicator takes the ramp step that owes 3:1 against the card, the word the step that owes 4.5:1,
 * mapped checking=informational, healthy=success, warning=caution, unauthenticated and error=
 * failure, unknown and coming_soon=idle. The empty state is REQ-CONFIG-388's. Sign out asks a plain
 * confirmation naming the provider (REQ-CONFIG-383); delete asks a warning whose default is Cancel
 * (REQ-CONFIG-385). Language from the design system (.table-card, .status-dot, .tag, .empty-state,
 * .check); structure from the specification.
 */

/** REQ-CONFIG-369's colour pairs: [indicator step, word step], total over REQ-NOTIFY-200's states. */
const STATE_TONES: Readonly<Record<ProviderStateName | 'idle', { dot: string; word: string }>> = Object.freeze({
  checking: { dot: 'var(--rt-info-500)', word: 'var(--rt-info-300)' },
  healthy: { dot: 'var(--rt-ok)', word: 'var(--rt-axis-y-300)' },
  warning: { dot: 'var(--rt-warn)', word: 'var(--rt-axis-x-300)' },
  unauthenticated: { dot: 'var(--rt-fail)', word: 'var(--rt-danger-300)' },
  error: { dot: 'var(--rt-fail)', word: 'var(--rt-danger-300)' },
  unknown: { dot: 'var(--rt-text-tertiary)', word: 'var(--rt-text-tertiary)' },
  coming_soon: { dot: 'var(--rt-text-tertiary)', word: 'var(--rt-text-tertiary)' },
  idle: { dot: 'var(--rt-text-tertiary)', word: 'var(--rt-text-tertiary)' },
});

/** REQ-CONFIG-368: the status word, underscores replaced by spaces; an unrecognized value falls back to idle (REQ-CONFIG-369). */
function stateWord(row: ProviderRow): { name: ProviderStateName; label: string } {
  const name: ProviderStateName = row.health?.state ?? (row.available ? 'unknown' : 'coming_soon');
  const label = PROVIDER_STATE_LABELS[name] ?? PROVIDER_STATE_LABELS.unknown;
  return { name, label: label.replaceAll('_', ' ') };
}

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
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const act = async (what: string, fn: () => Promise<{ ok: boolean; message: string }>) => {
    if (busy) return;
    setBusy(what);
    const r = await fn();
    setBusy(null);
    setMessage({ ok: r.ok, text: r.message });
    if (r.ok && what === 'save') setApiKey('');
  };
  const { name: stateName, label: word } = stateWord(row);
  const tone = STATE_TONES[stateName] ?? STATE_TONES.idle;
  const canKey = row.method === 'api-key';
  // REQ-CONFIG-372: the action's text follows stored credentials, its accessible name the live connection.
  const authAction = row.authenticated ? 'Re-authenticate' : 'Authenticate';
  const authName = row.health && ['unauthenticated', 'unknown'].includes(row.health.state) ? 'Authenticate' : 'Re-authenticate';
  return (
    <>
      <tr data-provider={row.id} data-authenticated={row.authenticated ? 'yes' : 'no'} data-health={stateName}>
        <td>
          <div className="provider-row__status">
            <DesignTooltip content={row.health?.detail || word} placement="top">
              <span className="provider-row__dot" data-state={stateName} style={{ background: tone.dot }} />
            </DesignTooltip>
            <span className="provider-row__name">{row.displayName}</span>
            <span className="mono text-tertiary settings__origin">{row.id}</span>
            <span className="provider-row__word" style={{ color: tone.word }}>{word}</span>
          </div>
          <div className="provider-row__detail text-tertiary">{row.health?.detail || row.methodLabel}</div>
          {row.displayMask ? <div className="mono text-tertiary settings__origin" data-mask>{row.displayMask}</div> : null}
        </td>
        <td className="settings__action">
          <div className="provider-row__actions">
            <DesignButton
              type="button"
              className={row.authenticated ? 'btn btn-secondary btn-compact' : 'btn btn-primary btn-compact'}
              aria-label={`${authName} ${row.displayName}`}
              disabled={busy !== null}
              onClick={() => { if (canKey) setMessage({ ok: true, text: 'Enter a replacement key above and save it.' }); else props.onReauthenticate(row.id); }}
            >
              {authAction}
            </DesignButton>
            <DesignButton
              type="button"
              className="btn btn-ghost btn-compact"
              disabled={busy !== null || !row.authenticated}
              onClick={() => setConfirmSignOut(true)}
            >
              Sign out
            </DesignButton>
            <DesignButton type="button" className="btn btn-link btn-compact" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
              {open ? 'Close' : 'Settings'}
            </DesignButton>
          </div>
        </td>
      </tr>
      {open && (
        <tr className="provider-settings" data-provider-settings={row.id}>
          <td colSpan={2}>
            <div className="provider-settings__panel">
              <div className="card-kicker">{row.displayName} settings</div>
              <div className="provider-settings__fields">
                <label className="provider-dialog__field">
                  <span className="text-secondary">API key{canKey ? ' (leave empty to keep the current key)' : ''}</span>
                  <DesignInput className="input mono" type="password" autoComplete="off" value={apiKey} disabled={!canKey || busy !== null} onChange={(e) => setApiKey(e.currentTarget.value)} aria-label={`API key for ${row.displayName}`} title={canKey ? undefined : `${row.displayName} does not sign in with a key`} />
                </label>
                <label className="provider-dialog__field">
                  <span className="text-secondary">Base URL{row.userDefined ? '' : ' (fixed for this provider)'}</span>
                  <DesignInput className="input mono" value={baseUrl} disabled={!row.userDefined || busy !== null} onChange={(e) => setBaseUrl(e.currentTarget.value)} aria-label={`Base URL for ${row.displayName}`} />
                </label>
                {canKey && (
                  <DesignCheckbox
                    className="provider-settings__opt"
                    label="Skip validation on save"
                    hint="The key is stored without a catalog check."
                    checked={skipValidation}
                    disabled={busy !== null}
                    onChange={(e) => setSkipValidation(e.currentTarget.checked)}
                  />
                )}
              </div>
              <div className="provider-settings__actions">
                <DesignButton type="button" className="btn btn-primary btn-compact" disabled={busy !== null} onClick={() => { void act('save', () => props.onSave(row.id, { apiKey, baseUrl: row.userDefined && baseUrl.trim() !== (row.baseUrl ?? '') ? baseUrl.trim() : null, validate: !skipValidation })); }}>{busy === 'save' ? 'Saving…' : 'Save'}</DesignButton>
                <DesignButton type="button" className="btn btn-secondary btn-compact" disabled={busy !== null} onClick={() => { void act('validate', () => props.onValidate(row.id)); }}>{busy === 'validate' ? 'Validating…' : 'Validate'}</DesignButton>
                <DesignButton type="button" className="btn btn-secondary btn-compact" disabled={busy !== null} onClick={() => { void act('check', async () => { await props.onCheck(row.id); return { ok: true, message: 'Checked.' }; }); }}>{busy === 'check' ? 'Checking…' : 'Check health'}</DesignButton>
                {row.userDefined && <DesignButton type="button" className="btn btn-danger btn-compact" disabled={busy !== null} onClick={() => setConfirmDelete(true)}>Delete</DesignButton>}
              </div>
              {message && <p className={message.ok ? 'text-secondary' : 'composer__error'} role={message.ok ? 'status' : 'alert'} data-provider-message>{message.text}</p>}
            </div>
          </td>
        </tr>
      )}
      {confirmSignOut && (
        <ConfirmDialog
          title={`Sign out of ${row.displayName}?`}
          confirmLabel="Sign out"
          cancelLabel="Keep it"
          onConfirm={() => { setConfirmSignOut(false); void act('sign-out', () => props.onSignOut(row.id)); }}
          onCancel={() => setConfirmSignOut(false)}
        >
          Stored authentication for {row.displayName} is removed. Its configuration stays; you can sign in again at any time.
        </ConfirmDialog>
      )}
      {confirmDelete && (
        <ConfirmDialog
          title={`Delete ${row.displayName}?`}
          danger
          confirmLabel={`Delete ${row.displayName}`}
          cancelLabel="Keep it"
          onConfirm={() => { setConfirmDelete(false); void act('delete', () => props.onDelete(row.id)); }}
          onCancel={() => setConfirmDelete(false)}
        >
          The endpoint <strong>{row.displayName}</strong> ({row.id}) is removed with its stored key and catalog entry. Workspace model references will not be changed.
        </ConfirmDialog>
      )}
    </>
  );
}

export function ProvidersCard(props: ProvidersCardProps) {
  const [refreshing, setRefreshing] = useState<string | null>(null);
  return (
    <TableCard
      className="providers-card"
      title="Providers"
      data-providers
      actions={
        <div className="providers-card__actions">
          <DesignButton type="button" className="btn btn-secondary btn-compact" disabled={refreshing !== null} onClick={() => { setRefreshing('…'); void props.onRefreshAll().then((r) => setRefreshing(r.message)); }}>Refresh catalogs</DesignButton>
          <DesignButton type="button" className="btn btn-primary btn-compact" onClick={props.onAdd} data-action="add-endpoint">Add endpoint</DesignButton>
        </div>
      }
      footer="Endpoints are user-wide: a provider added here is available to every workspace. Only a masked form of a stored key is ever shown."
    >
      {props.error && <p className="composer__error" role="alert">{props.error}</p>}
      {refreshing && refreshing !== '…' && <p className="text-secondary" role="status">{refreshing}</p>}
      {props.rows.length === 0 ? (
        <EmptyState
          icon="ph-plugs-connected"
          title={props.loading ? 'Reading providers…' : 'No providers yet'}
          hint="No providers were discovered. A provider or model endpoint must be configured before starting a run."
          action={<DesignButton type="button" className="btn btn-primary btn-compact" onClick={props.onAdd}>Add endpoint</DesignButton>}
        />
      ) : (
        <DesignTable className="table providers-card__table" aria-label="Providers">
          <thead>
            <tr><th>Provider</th><th><span className="visually-hidden">Actions</span></th></tr>
          </thead>
          <tbody>
            {props.rows.map((row) => <Row key={row.id} row={row} props={props} />)}
          </tbody>
        </DesignTable>
      )}
    </TableCard>
  );
}