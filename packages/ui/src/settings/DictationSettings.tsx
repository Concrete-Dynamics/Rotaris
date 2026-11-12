import { useState, type ReactNode } from 'react';
import { DICTATION_BACKEND_NAMES, dictationFieldProblem, type DictationConfigView } from '@rotaris/contracts';
import { Button as DesignButton, Input as DesignInput, Select as DesignSelect } from '../design-system/index.js';
import type { PendingChange } from './config-state.js';

const BACKEND_LABELS: Readonly<Record<DictationConfigView['backend'], string>> = { off: 'Off', local: 'Local model', endpoint: 'OpenAI-compatible endpoint' };

function Field({ id, label, hint, field, value, onChange }: { id: string; label: string; hint: string; field: keyof DictationConfigView; value: string | null; onChange: (change: PendingChange) => void }) {
  const problem = dictationFieldProblem(field, value);
  return (
    <div className="settings__dictation-field">
      <label htmlFor={id}>{label}</label>
      <DesignInput id={id} className="input" value={value ?? ''} spellCheck={false} aria-describedby={`${id}-hint`} aria-invalid={problem !== null}
        onChange={(e) => { const next = e.currentTarget.value.trim(); onChange({ kind: 'dictation', key: field, value: next === '' && field !== 'local_model' ? null : next }); }} />
      <span id={`${id}-hint`} className={problem === null ? 'text-secondary settings__hint' : 'composer__error'} role={problem === null ? undefined : 'alert'}>{problem ?? hint}</span>
    </div>
  );
}

/**
 * PD-CONFIG-010: the dictation endpoint's bearer, as the Settings field holds it. The value typed here is what the endpoint
 * sends; it is stored outside every configuration file, and once stored the field is empty and the value is reported masked,
 * so the only acts it offers are replacement and removal. The write is immediate and outside Save — REQ-CONFIG-417's
 * destination 4, the one the provider credential operations use — which the hint says in words.
 *
 * `masked` is `undefined` until the first read answers, `null` when nothing is stored, and the masked value when something is.
 * The field never renders the stored value in any state, and no answer it receives carries it.
 */
export interface DictationCredentialFieldProps {
  readonly masked: string | null | undefined;
  readonly busy: boolean;
  readonly message: string | null;
  readonly onStore: (value: string) => void;
  readonly onClear: () => void;
}

export function DictationCredentialField({ masked, busy, message, onStore, onClear }: DictationCredentialFieldProps) {
  const [draft, setDraft] = useState('');
  const id = 'dictation-credential';
  const hintId = `${id}-hint`;
  const reading = masked === undefined;
  const stored = typeof masked === 'string';
  const submit = () => {
    const value = draft.trim();
    if (value === '' || busy || reading) return;
    onStore(value);
    setDraft('');
  };
  return (
    <div className="settings__dictation-field">
      <label htmlFor={id}>Provider credential</label>
      <div className="settings__action">
        <DesignInput id={id} className="input mono" type="password" autoComplete="off" spellCheck={false} value={draft} disabled={busy || reading}
          aria-label="Provider credential" aria-describedby={hintId} onChange={(e) => setDraft(e.currentTarget.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }} />
        <DesignButton type="button" className="btn btn-secondary btn-compact" disabled={busy || reading || draft.trim() === ''} onClick={submit}>{stored ? 'Replace the credential' : 'Store the credential'}</DesignButton>
        {stored ? <DesignButton type="button" className="btn btn-secondary btn-compact" disabled={busy} onClick={onClear}>Delete the stored credential</DesignButton> : null}
      </div>
      <span id={hintId} className="text-secondary settings__hint">
        {reading ? 'Reading the stored credential…'
          : stored ? `Stored, value ${masked}. Storing again replaces it; the field never shows the stored value.`
            : 'Optional. Sent as the bearer. Stored outside the configuration file and never shown again.'}
      </span>
      {message !== null ? <p className="composer__error" role="alert">{message}</p> : null}
    </div>
  );
}

/** OQ-457, PD-CONFIG-005, PD-CONFIG-010: Settings › Models › Dictation, saved with the rest of the screen. Each backend shows only what it reads. */
export function DictationSettings({ value, onChange, credential }: { value: DictationConfigView; onChange: (change: PendingChange) => void; credential?: ReactNode }) {
  return (
    <section aria-label="Dictation" data-testid="settings-dictation">
      <h2 className="settings__heading">Dictation</h2>
      <p className="text-secondary settings__hint">The composer's microphone uses this model. Rotaris downloads nothing by itself: a local model is read from this machine and the recording never leaves it, while an endpoint sends the recording to the host named above.</p>
      <div className="settings__dictation-field">
        <label htmlFor="dictation-backend">Model source</label>
        <DesignSelect id="dictation-backend" className="input select" value={value.backend} onChange={(e) => onChange({ kind: 'dictation', key: 'backend', value: e.currentTarget.value })}>
          {DICTATION_BACKEND_NAMES.map((name) => <option key={name} value={name}>{BACKEND_LABELS[name]}</option>)}
        </DesignSelect>
      </div>
      {value.backend === 'local' && <Field id="dictation-local-model" label="Local model name" hint="A Whisper model already on this machine, such as small or large-v3-turbo." field="local_model" value={value.local_model} onChange={onChange} />}
      {value.backend === 'endpoint' && <>
        <Field id="dictation-base-url" label="Base URL" hint="Where /audio/transcriptions is served, such as http://127.0.0.1:8000/v1." field="base_url" value={value.base_url} onChange={onChange} />
        <Field id="dictation-model" label="Model" hint="The name the endpoint knows it by." field="model" value={value.model} onChange={onChange} />
        {credential ?? <p className="text-secondary settings__hint">The credential field is not available in this window.</p>}
      </>}
      {value.backend !== 'off' && <Field id="dictation-language" label="Language" hint="Optional. A language tag such as en or de; empty lets the model detect it." field="language" value={value.language} onChange={onChange} />}
    </section>
  );
}
