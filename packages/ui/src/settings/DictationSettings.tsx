import { DICTATION_BACKEND_NAMES, dictationFieldProblem, type DictationConfigView } from '@rotaris/contracts';
import { Input as DesignInput, Select as DesignSelect } from '../design-system/index.js';
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

/** OQ-457, PD-CONFIG-005: Settings › Models › Dictation, saved with the rest of the screen. Each backend shows only what it reads. */
export function DictationSettings({ value, onChange }: { value: DictationConfigView; onChange: (change: PendingChange) => void }) {
  return (
    <section aria-label="Dictation" data-testid="settings-dictation">
      <h2 className="settings__heading">Dictation</h2>
      <p className="text-secondary settings__hint">The composer's microphone uses this model. Rotaris downloads nothing by itself, and the recording goes only where you point it here.</p>
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
        <Field id="dictation-auth-provider" label="Provider credential" hint="Optional. A signed-in provider whose credential is sent as the bearer." field="provider" value={value.provider} onChange={onChange} />
      </>}
      {value.backend !== 'off' && <Field id="dictation-language" label="Language" hint="Optional. A language tag such as en or de; empty lets the model detect it." field="language" value={value.language} onChange={onChange} />}
    </section>
  );
}
