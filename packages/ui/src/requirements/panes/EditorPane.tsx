import { useEffect, useId, useState } from 'react';
import type { ReqId } from '@rotaris/contracts';
import { Button as DesignButton, Input as DesignInput, Select as DesignSelect, TextArea as DesignTextArea } from '../../design-system/index.js';

/**
 * Part AP — the editor and the creation panes (spec 08 §Editing and Creating Requirements, REQ-TRACE-434..444; the
 * failures of REQ-TRACE-498's four source rows). Both raise intents and write nothing themselves (REQ-TRACE-439): the
 * host sends `requirements.source.write` with the draft and shows what came back. Craft from the mockup's
 * `New requirement` dialog (docs/design/README.md §7): a one-sentence body under the title, labelled fields in a
 * two-column grid, the description as the tall field, the identifier line in the mono face above the actions.
 */
export interface EditorPaneProps {
  readonly id: ReqId | null;
  readonly title: string;
  readonly description: string;
  /** REQ-TRACE-438: the version the edit applies to (the canonical hash), shown so a saved edit names what it changed. */
  readonly version: string | null;
  /** REQ-TRACE-435/438: the read-only form — the one sentence and the artifact to open — or the writable form. */
  readonly readOnly: { readonly sentence: string; readonly artifact: string } | null;
  /** REQ-CONFIG-198 `confirm_source_writes`: when true the save asks once before it writes. */
  readonly confirmWrites?: boolean | undefined;
  /** REQ-TRACE-440's three intents. */
  readonly onSave: (draft: { readonly id: ReqId; readonly title: string; readonly description: string }) => Promise<{ ok: true } | { ok: false; reason: string }>;
  readonly onOpenArtifact: (artifact: string) => void;
  readonly onLeave: () => void;
}
export const EDITOR_EMPTY_HEADING = 'No requirement is open for editing';
export const SAVE_RETRY = 'Retry saving the requirement';
export const SAVE_DISMISS = 'Dismiss the save failure';

export function EditorPane(p: EditorPaneProps) {
  const headingId = useId();
  if (p.id === null) return <div className="req-pane req-pane--editor" role="region" aria-labelledby={headingId}><h2 id={headingId} className="req-pane__title">{EDITOR_EMPTY_HEADING}</h2></div>;
  if (p.readOnly !== null) {
    // REQ-TRACE-435/438/498: the read-only form — the sentence, the artifact named, a control that opens it; never a disabled field.
    return (
      <div className="req-pane req-pane--editor" role="region" aria-labelledby={headingId} data-testid="req-pane-editor-readonly">
        <h2 id={headingId} className="req-pane__title">{p.id} is read-only here</h2>
        <p className="req-pane__notice" title={p.readOnly.sentence} aria-description={p.readOnly.sentence}>{p.readOnly.sentence}</p>
        <p className="req-pane__mono">{p.readOnly.artifact}</p>
        <div className="dialog-actions">
          <DesignButton type="button" className="btn btn-secondary" onClick={p.onLeave} aria-label="Leave without saving">Close</DesignButton>
          <DesignButton type="button" className="btn btn-primary" onClick={() => p.onOpenArtifact(p.readOnly!.artifact)} aria-label={`Open the artifact ${p.readOnly.artifact}`}>Open the artifact</DesignButton>
        </div>
      </div>
    );
  }
  // Part AP — REQ-TRACE-436/438: the writable form owns the draft being typed, so it is a component of its own, keyed
  // by the requirement and the text it was opened on. React resets that state by identity; the effect that assigned it
  // on every prop change (the first build of this pane) is refused by `react-hooks/set-state-in-effect` — defect AP-1.
  // The key's separator is written as a Unicode escape and NEVER as a raw byte: a raw NUL in the source makes git
  // classify this file as binary, which costs the diff, the three-way merge, the line-ending normalisation and every
  // grep that honours binary detection — including the sweeps that read the REQ annotations in this file.
  return <EditorForm p={p} headingId={headingId} key={`${p.id}\u0000${p.title}\u0000${p.description}`} />;
}

function EditorForm({ p, headingId }: { readonly p: EditorPaneProps; readonly headingId: string }) {
  const [title, setTitle] = useState(p.title);
  const [description, setDescription] = useState(p.description);
  const [failure, setFailure] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const dirty = title !== p.title || description !== p.description;
  const save = async () => {
    setSaving(true);
    const r = await p.onSave({ id: p.id!, title, description });
    setSaving(false);
    setConfirming(false);
    // REQ-TRACE-436: a failed write preserves the input and states the failure with named retry and dismissal.
    if (!r.ok) setFailure(r.reason); else setFailure(null);
  };
  return (
    <div className="req-pane req-pane--editor" role="region" aria-labelledby={headingId} data-testid="req-pane-editor">
      <h2 id={headingId} className="req-pane__title">Edit {p.id}</h2>
      <p className="req-pane__lead">Written back into the project's own artifact; a delivered requirement then needs an update.</p>
      <p className="req-pane__mono req-pane__version" data-testid="req-pane-editor-version">Applies to version {p.version === null ? '(unknown)' : p.version.slice(0, 8)}</p>
      <label className="field"><span className="field-label">Title</span><DesignInput className="input" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Requirement title" /></label>
      <label className="field"><span className="field-label">Description</span><DesignTextArea className="input req-pane__textarea" value={description} onChange={(e) => setDescription(e.target.value)} aria-label="Requirement description" /></label>
      {failure !== null && (
        <div className="req-pane__notice req-pane__notice--error" role="alert" data-testid="req-pane-editor-failure">
          <span>{failure}</span>
          <DesignButton type="button" className="btn btn-secondary" onClick={() => { void save(); }} aria-label={SAVE_RETRY}>Retry</DesignButton>
          <DesignButton type="button" className="btn btn-link" onClick={() => setFailure(null)} aria-label={SAVE_DISMISS}>Dismiss</DesignButton>
        </div>
      )}
      {confirming && (
        <div className="req-pane__notice" role="alertdialog" aria-label="Confirm writing into the source">
          <span>Write the title and description of {p.id} into the project's own artifact?</span>
          <DesignButton type="button" className="btn btn-secondary" onClick={() => setConfirming(false)}>Cancel</DesignButton>
          <DesignButton type="button" className="btn btn-primary" onClick={() => { void save(); }} disabled={saving}>Write</DesignButton>
        </div>
      )}
      <div className="dialog-actions">
        <DesignButton type="button" className="btn btn-secondary" onClick={p.onLeave} aria-label="Cancel and leave without saving">Cancel</DesignButton>
        {/* REQ-TRACE-438: the save control's enabled state tracks the fields. */}
        <DesignButton type="button" className="btn btn-primary" disabled={!dirty || title.trim() === '' || saving} onClick={() => { if (p.confirmWrites) setConfirming(true); else void save(); }} aria-label={`Save ${p.id}`}>{saving ? 'Saving…' : 'Save'}</DesignButton>
      </div>
    </div>
  );
}

// ---- creation (REQ-TRACE-442..444) ----

export interface CreatePaneProps {
  /** REQ-TRACE-444: only sources declaring the create capability are offered; none ⇒ no editor. */
  readonly sources: readonly { readonly key: string; readonly label: string; readonly canCreate: boolean }[];
  readonly epics: readonly { readonly id: ReqId; readonly title: string }[];
  /** Every requirement a technical one may derive from. */
  readonly origins: readonly ReqId[];
  /** REQ-TRACE-443: the location the write produces, or the inability reported. */
  readonly previewLocation: (epic: ReqId | undefined) => Promise<{ ok: true; id: ReqId; location: string; confirmSourceWrites: boolean } | { ok: false; reason: string }>;
  readonly onCreate: (draft: CreateDraft) => Promise<{ ok: true; id: ReqId; path: string } | { ok: false; reason: string }>;
  readonly onLeave: () => void;
}
export interface CreateDraft { readonly source: string; readonly epic?: ReqId; readonly kind: 'product' | 'technical'; readonly derivedFrom: readonly ReqId[]; readonly title: string; readonly prose: string; readonly priority?: string }
/** REQ-TRACE-443: the previewed path with the title's slug substituted by the same rule the write applies (REQ-GIT-139's slug over the title). */
export function locationWithTitle(location: string, title: string): string {
  const folded = title.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '');
  const slug = folded.slice(0, 40).replace(/[-.]+$/, '') || 'x';
  return location.replace('<slug>', slug);
}

export function CreatePane(p: CreatePaneProps) {
  const headingId = useId();
  const creatable = p.sources.filter((s) => s.canCreate);
  const [source, setSource] = useState(creatable[0]?.key ?? '');
  const [epic, setEpic] = useState<string>('');
  const [kind, setKind] = useState<'product' | 'technical'>('product');
  const [derived, setDerived] = useState<string>('');
  const [title, setTitle] = useState('');
  const [prose, setProse] = useState('');
  const [priority, setPriority] = useState('');
  const [preview, setPreview] = useState<{ ok: true; id: ReqId; location: string; confirmSourceWrites: boolean } | { ok: false; reason: string } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: ReqId; path: string } | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { let alive = true; void p.previewLocation(epic === '' ? undefined : epic).then((r) => { if (alive) setPreview(r); }); return () => { alive = false; }; }, [epic, p]);
  if (creatable.length === 0) {
    // REQ-TRACE-444: a workspace with no writable store gets a board and no editor.
    return <div className="req-pane req-pane--create" role="region" aria-labelledby={headingId}><h2 id={headingId} className="req-pane__title">No source can be created into</h2><p className="req-pane__notice">{p.sources.length === 0 ? 'No requirement store is open.' : 'The requirement store is read-only for this account, so nothing can be created here.'}</p><div className="dialog-actions"><DesignButton type="button" className="btn btn-secondary" onClick={p.onLeave}>Close</DesignButton></div></div>;
  }
  const originMissing = kind === 'technical' && derived === '';
  const create = async () => {
    setSaving(true);
    const r = await p.onCreate({ source, ...(epic === '' ? {} : { epic }), kind, derivedFrom: derived === '' ? [] : [derived], title, prose, ...(priority === '' ? {} : { priority }) });
    setSaving(false);
    if (!r.ok) { setFailure(r.reason); return; }
    setFailure(null); setCreated({ id: r.id, path: r.path });
  };
  return (
    <div className="req-pane req-pane--create" role="region" aria-labelledby={headingId} data-testid="req-pane-create">
      <h2 id={headingId} className="req-pane__title">New requirement</h2>
      <p className="req-pane__lead">Written back to the source document; the identifier and the location follow that source's own conventions.</p>
      <div className="req-pane__grid">
        <label className="field"><span className="field-label">Source</span><DesignSelect className="input select" value={source} onChange={(e) => setSource(e.target.value)} aria-label="Source to write into">{creatable.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</DesignSelect></label>
        <label className="field"><span className="field-label">Epic</span><DesignSelect className="input select" value={epic} onChange={(e) => setEpic(e.target.value)} aria-label="Epic it belongs under"><option value="">none</option>{p.epics.map((e) => <option key={e.id} value={e.id}>{e.id} — {e.title}</option>)}</DesignSelect></label>
        <label className="field"><span className="field-label">Kind</span><DesignSelect className="input select" value={kind} onChange={(e) => setKind(e.target.value as 'product' | 'technical')} aria-label="Product or technical requirement"><option value="product">product</option><option value="technical">technical</option></DesignSelect></label>
        <label className="field"><span className="field-label">Derives from{kind === 'technical' ? ' (required)' : ''}</span><DesignSelect className="input select" value={derived} onChange={(e) => setDerived(e.target.value)} aria-label="Requirement it derives from" disabled={kind !== 'technical'}><option value="">none</option>{p.origins.map((o) => <option key={o} value={o}>{o}</option>)}</DesignSelect></label>
        <label className="field"><span className="field-label">Priority</span><DesignInput className="input" value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Priority" placeholder="none" /></label>
      </div>
      <label className="field"><span className="field-label">Title</span><DesignInput className="input" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Requirement title" placeholder="e.g. Export the audit trail" /></label>
      <label className="field"><span className="field-label">Description</span><DesignTextArea className="input req-pane__textarea" value={prose} onChange={(e) => setProse(e.target.value)} aria-label="Requirement description" placeholder="What must hold true, stated so it can be verified." /></label>
      {/* REQ-TRACE-443/498: the location the write produces, or the inability shown in the form — never a guessed path. */}
      <p className="req-pane__mono req-pane__location" data-testid="req-pane-create-location">{preview === null ? 'Deriving the identifier and location…' : preview.ok ? `${preview.id} at ${locationWithTitle(preview.location, title)}` : `Location cannot be previewed: ${preview.reason}`}</p>
      {originMissing && <p className="req-pane__notice" role="status">A technical requirement is not creatable without an origin: choose the requirement it derives from.</p>}
      {failure !== null && <div className="req-pane__notice req-pane__notice--error" role="alert" data-testid="req-pane-create-failure"><span>{failure}</span><DesignButton type="button" className="btn btn-secondary" onClick={() => { void create(); }} aria-label="Retry creating the requirement">Retry</DesignButton><DesignButton type="button" className="btn btn-link" onClick={() => setFailure(null)} aria-label="Dismiss the creation failure">Dismiss</DesignButton></div>}
      {created !== null && <p className="req-pane__notice" role="status" data-testid="req-pane-create-done">{created.id} was created at {created.path}; it appears on the board in the first column and can be released.</p>}
      <div className="dialog-actions">
        <DesignButton type="button" className="btn btn-secondary" onClick={p.onLeave} aria-label="Cancel and leave without creating">Cancel</DesignButton>
        <DesignButton type="button" className="btn btn-primary" disabled={title.trim() === '' || originMissing || saving || preview === null || !preview.ok || created !== null} onClick={() => { void create(); }} aria-label="Create the requirement">{saving ? 'Creating…' : 'Create requirement'}</DesignButton>
      </div>
    </div>
  );
}
