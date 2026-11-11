import { useEffect, useId, useRef, useState } from 'react';
import { PROVIDER_STATE_LABELS, type ProviderRow, type ProviderStateName } from '@rotaris/contracts';
import { Button as DesignButton, Checkbox as DesignCheckbox, Input as DesignInput, ConfirmDialog, EmptyState, Table as DesignTable, TableCard, Tooltip as DesignTooltip } from '../design-system/index.js';

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
 *
 * PD-CONFIG-009: the card draws ONE filled control, "Add endpoint" in its head, in every state of the list. A row's
 * actions keep REQ-CONFIG-371's order and are drawn as a hairline, bare text or a link; a row's settings draw Save
 * first and as a hairline; the empty state names the head's control and draws none of its own.
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

/**
 * What a press of Authenticate answers on a provider that signs in with a stored key, stated in the row's settings
 * under the key field. With a key stored it is REQ-PROVIDER-141's: "a replacement key must be entered and saved".
 * With none stored it says the provider signs in with a key (REQ-PROVIDER-050 states that answer for DeepSeek; every
 * `api-key` provider is treated so).
 */
export const KEY_PROVIDER_REPLACE_SENTENCE = 'Enter a replacement key in the field above and save it.';
export const KEY_PROVIDER_FIRST_SENTENCE = 'This provider signs in with an API key. Enter the key in the field above and save it.';

/**
 * What a press of a row's Authenticate does. A provider that signs in with a stored key has no flow to start: the
 * press opens the row's settings, moves focus to the key field and states the sentence there (REQ-PROVIDER-141);
 * every other provider's press starts its flow (REQ-PROVIDER-142). Until 2026-11-11 the key provider's press set
 * the sentence and left the settings closed, where the sentence is drawn: three of the six built-in rows answered
 * their first control with nothing on screen.
 */
export function authenticatePress(row: Pick<ProviderRow, 'method' | 'authenticated'>): { readonly kind: 'key-field'; readonly message: string } | { readonly kind: 'flow' } {
  if (row.method !== 'api-key') return { kind: 'flow' };
  return { kind: 'key-field', message: row.authenticated ? KEY_PROVIDER_REPLACE_SENTENCE : KEY_PROVIDER_FIRST_SENTENCE };
}

/**
 * REQ-CONFIG-372: the action's TEXT follows stored credentials, its ACCESSIBLE NAME whether the provider is connected
 * now. Connected is a health that says so: `healthy`, or `warning` ("Partly usable"). A row nobody has checked
 * (`health` null), one being checked, one in error and one unavailable are not known to be connected and are named
 * "Authenticate". Until 2026-11-11 the name was taken from the set REQ-CONFIG-372 gives the dialog's re-authentication
 * flag (everything outside `unauthenticated` and `unknown`), and a null health fell to "Re-authenticate": every row
 * of a fresh list showed one word and was named the other (UIR-405 of that day's critiques).
 */
const CONNECTED_STATES: readonly ProviderStateName[] = ['healthy', 'warning'];
export function authenticateWords(row: Pick<ProviderRow, 'authenticated' | 'health'>): { readonly text: 'Authenticate' | 'Re-authenticate'; readonly name: 'Authenticate' | 'Re-authenticate' } {
  const connected = row.health !== null && CONNECTED_STATES.includes(row.health.state);
  return { text: row.authenticated ? 'Re-authenticate' : 'Authenticate', name: connected ? 'Re-authenticate' : 'Authenticate' };
}

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
  const { text: authAction, name: authName } = authenticateWords(row);
  // REQ-PROVIDER-141: a key provider's press moves focus to the key field. The field exists only once the settings are
  // open, so the press asks (`keyFocus`) and the effect answers after the field is in the tree.
  const keyField = useRef<HTMLInputElement>(null);
  const [keyFocus, setKeyFocus] = useState(0);
  useEffect(() => { if (keyFocus > 0) keyField.current?.focus(); }, [keyFocus]);
  const messageId = useId();
  return (
    <>
      <tr data-provider={row.id} data-authenticated={row.authenticated ? 'yes' : 'no'} data-health={stateName}>
        <td>
          <div className="provider-row__status">
            <DesignTooltip content={row.health?.detail || word} placement="top">
              <span className="provider-row__dot" data-state={stateName} style={{ background: tone.dot }} />
            </DesignTooltip>
            <span className="provider-row__name" title={row.displayName}>{row.displayName}</span>
            <span className="mono text-tertiary settings__origin">{row.id}</span>
            <span className="provider-row__word" style={{ color: tone.word }}>{word}</span>
          </div>
          <div className="provider-row__detail text-tertiary">{row.health?.detail || row.methodLabel}</div>
          {row.displayMask ? <div className="mono text-tertiary settings__origin" data-mask>{row.displayMask}</div> : null}
        </td>
        {/* UIR-309: a table cell, not `.settings__action`'s wrapping flex line — a flex box in a cell's place is only as
            tall as its own buttons, so the row's rule under it stood 17 px above the rule under the first cell. */}
        <td className="provider-row__action-cell">
          <div className="provider-row__actions">
            {/* PD-CONFIG-009: first in the row and a hairline, whether or not credentials are stored — the label
                (REQ-CONFIG-372), the status word and the indicator say which, and the fill is the card head's.
                What the press does is `authenticatePress`'s. */}
            <DesignButton
              type="button"
              className="btn btn-secondary btn-compact"
              aria-label={`${authName} ${row.displayName}`}
              disabled={busy !== null}
              onClick={() => { const press = authenticatePress(row); if (press.kind === 'key-field') { setOpen(true); setMessage({ ok: true, text: press.message }); setKeyFocus((n) => n + 1); } else props.onReauthenticate(row.id); }}
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
                  <DesignInput ref={keyField} className="input mono" type="password" autoComplete="off" value={apiKey} disabled={!canKey || busy !== null} onChange={(e) => setApiKey(e.currentTarget.value)} aria-label={`API key for ${row.displayName}`} aria-describedby={message ? messageId : undefined} title={canKey ? undefined : `${row.displayName} does not sign in with a key`} />
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
                <DesignButton type="button" className="btn btn-secondary btn-compact" data-action="save-provider" disabled={busy !== null} onClick={() => { void act('save', () => props.onSave(row.id, { apiKey, baseUrl: row.userDefined && baseUrl.trim() !== (row.baseUrl ?? '') ? baseUrl.trim() : null, validate: !skipValidation })); }}>{busy === 'save' ? 'Saving…' : 'Save'}</DesignButton>
                <DesignButton type="button" className="btn btn-secondary btn-compact" disabled={busy !== null} onClick={() => { void act('validate', () => props.onValidate(row.id)); }}>{busy === 'validate' ? 'Validating…' : 'Validate'}</DesignButton>
                <DesignButton type="button" className="btn btn-secondary btn-compact" disabled={busy !== null} onClick={() => { void act('check', async () => { await props.onCheck(row.id); return { ok: true, message: 'Checked.' }; }); }}>{busy === 'check' ? 'Checking…' : 'Check health'}</DesignButton>
                {row.userDefined && <DesignButton type="button" className="btn btn-danger btn-compact" disabled={busy !== null} onClick={() => setConfirmDelete(true)}>Delete</DesignButton>}
              </div>
              {message && <p id={messageId} className={message.ok ? 'text-secondary' : 'composer__error'} role={message.ok ? 'status' : 'alert'} data-provider-message>{message.text}</p>}
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

export const READING_PROVIDERS = 'Reading providers…';
/** REQ-CONFIG-388's two statements, and REQ-NOTIFY-006's instruction: the control that puts a provider here, by its name. */
export const NO_PROVIDERS_HINT = 'No providers were discovered. A provider or model endpoint must be configured before starting a run: use Add endpoint above.';

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
        // A read in flight is not an empty list: it stood under "Reading providers…" with the sentence "No providers
        // were discovered." beneath it. REQ-CONFIG-388's state is drawn once the read has answered, and names the head's
        // control rather than drawing a second "Add endpoint" 60 px under the first (PD-CONFIG-009; REQ-NOTIFY-006).
        // A read that failed is stated by the error above and by nothing else: the empty state's sentence is for a
        // read that answered with no provider.
        props.loading ? <p className="text-secondary providers-card__reading" role="status" data-providers-reading>{READING_PROVIDERS}</p> : props.error !== null ? null : (
          <EmptyState
            icon="ph-plugs-connected"
            title="No providers yet"
            hint={NO_PROVIDERS_HINT}
            data-providers-empty
          />
        )
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