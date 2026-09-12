import { useCallback, useEffect, useRef, useState } from 'react';
import { ConfirmDialog } from '../ConfirmDialog.js';
import { Markdown } from '../markdown/Markdown.js';
import { Button as DesignButton, TextArea as DesignTextArea } from '../design-system/index.js';

/**
 * REQ-LIBRARY-131..135 — the artifact inspector and editor.
 *
 * It is **modeless**: several may be open at once, they do not block the window behind them, and opening an
 * id that is already open re-raises the visible one instead of duplicating it (the host keeps the list and
 * bumps `raised`; this component brings itself to the front and takes focus when it moves). 720×560, titled
 * `Artifact · <slug>`, with the artifact's title in heading style and the monospace metadata line
 * `<id> · <kind> · <status>[ · by <producer-or-persona>][ · edited]`.
 *
 * "Preview" is first and is rendered Markdown through ADR-0051's renderer — the same module the transcript
 * will use, never a second way of rendering — and re-renders on every keystroke; "Markdown" is second and is
 * a plain-text editor in a measured monospace face. Save persists ONLY the body (REQ-LIBRARY-094 keeps the
 * metadata immutable) and the footer then reads "Saved." or `Save failed: <err>`. A load failure leaves the
 * editor read-only with Save disabled; an empty stored body falls back to the rendered sidecar form of the
 * record, which the load reports as such.
 */
export interface ArtifactLoaded {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly artifactKind: string;
  readonly status: string;
  readonly producer: string;
  readonly persona: string;
  readonly edited: boolean;
  readonly body: string;
  /** REQ-LIBRARY-134: the body was empty and what is shown is the rendered sidecar form of the record. */
  readonly fallback: boolean;
}

export interface ArtifactInspectorProps {
  readonly id: string;
  /** REQ-LIBRARY-131: bumped by the host when the same id is opened again; the dialog re-raises and refocuses. */
  readonly raised: number;
  readonly onLoad: (id: string) => Promise<{ ok: true; artifact: ArtifactLoaded } | { ok: false; reason: string }>;
  readonly onSave: (id: string, body: string) => Promise<{ ok: true; editedAt: string } | { ok: false; reason: string }>;
  readonly onClose: (id: string) => void;
  readonly onOpenLink?: ((href: string) => void) | undefined;
}

/** REQ-LIBRARY-131's metadata line, exactly. */
export function metadataLine(a: Pick<ArtifactLoaded, 'id' | 'artifactKind' | 'status' | 'producer' | 'persona' | 'edited'>): string {
  const by = a.producer || a.persona;
  return `${a.id} · ${a.artifactKind} · ${a.status}${by ? ` · by ${by}` : ''}${a.edited ? ' · edited' : ''}`;
}

export function ArtifactInspector({ id, raised, onLoad, onSave, onClose, onOpenLink }: ArtifactInspectorProps) {
  const [artifact, setArtifact] = useState<ArtifactLoaded | null>(null);
  const [text, setText] = useState('');
  const [saved, setSaved] = useState('');
  const [tab, setTab] = useState<'preview' | 'markdown'>('preview');
  const [status, setStatus] = useState('');
  const [readOnly, setReadOnly] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const frame = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    void onLoad(id).then((r) => {
      if (!live) return;
      if (!r.ok) {
        // REQ-LIBRARY-134: read-only, Save disabled, and the stated message. `Unknown artifact: '<id>'` arrives as the reason.
        setStatus(r.reason.startsWith('Unknown artifact') ? r.reason : `Could not load artifact: ${r.reason}`);
        setReadOnly(true);
        return;
      }
      setArtifact(r.artifact);
      setText(r.artifact.body);
      setSaved(r.artifact.body);
      setReadOnly(false);
      setStatus(r.artifact.fallback ? 'The stored body is empty; the record’s rendered form is shown.' : '');
    });
    return () => { live = false; };
  }, [id, onLoad]);

  // REQ-LIBRARY-131: re-raising takes focus; the host bumps `raised` rather than mounting a second dialog.
  useEffect(() => { frame.current?.focus(); }, [raised]);

  const dirty = !readOnly && text !== saved;
  const requestClose = useCallback(() => { if (dirty) setConfirming(true); else onClose(id); }, [dirty, id, onClose]);

  const save = async () => {
    if (readOnly) return;
    setBusy(true);
    const r = await onSave(id, text);
    setBusy(false);
    // REQ-LIBRARY-133: the footer's two states, worded by the requirement.
    if (!r.ok) { setStatus(`Save failed: ${r.reason}`); return; }
    setSaved(text);
    setStatus('Saved.');
    setArtifact((a) => (a ? { ...a, edited: true } : a));
  };

  return (
    <div ref={frame} className="artifact-inspector" role="dialog" aria-label={`Artifact · ${artifact?.slug ?? id}`} tabIndex={-1}
      data-testid="artifact-inspector" data-artifact-id={id} data-raised={String(raised)} data-dirty={dirty ? 'yes' : 'no'}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); requestClose(); } }}>
      <header className="artifact-inspector__head">
        <h2 className="artifact-inspector__title">{artifact?.title ?? id}</h2>
        <span className="artifact-inspector__meta mono" data-testid="artifact-inspector-meta">{artifact ? metadataLine(artifact) : id}</span>
        <DesignButton type="button" className="btn btn-ghost btn-compact artifact-inspector__close" aria-label="Close the artifact inspector" onClick={requestClose}>Close</DesignButton>
      </header>
      <div className="artifact-inspector__tabs" role="tablist" aria-label="Artifact body">
        <DesignButton type="button" role="tab" aria-selected={tab === 'preview'} className={`tab${tab === 'preview' ? ' is-active' : ''}`} data-testid="artifact-tab-preview" onClick={() => setTab('preview')}>Preview</DesignButton>
        <DesignButton type="button" role="tab" aria-selected={tab === 'markdown'} className={`tab${tab === 'markdown' ? ' is-active' : ''}`} data-testid="artifact-tab-markdown" onClick={() => setTab('markdown')}>Markdown</DesignButton>
      </div>
      <div className="artifact-inspector__body">
        {tab === 'preview'
          // REQ-LIBRARY-132: the preview re-renders on every keystroke — it reads `text`, not the saved body.
          ? <Markdown source={text} onOpenLink={onOpenLink} className="artifact-inspector__preview" testId="artifact-preview" />
          : (
            <DesignTextArea className="input artifact-inspector__editor mono" aria-label="Artifact Markdown" data-testid="artifact-editor"
              value={text} readOnly={readOnly} spellCheck={false} onChange={(e) => setText(e.currentTarget.value)} />
          )}
      </div>
      <footer className="artifact-inspector__foot">
        <span className="artifact-inspector__status" role="status" data-testid="artifact-inspector-status">{status}</span>
        <DesignButton type="button" className="btn btn-primary" data-testid="artifact-save" data-enabled={readOnly || busy ? 'no' : 'yes'} disabled={readOnly || busy} onClick={() => { void save(); }}>{busy ? 'Saving…' : 'Save'}</DesignButton>
      </footer>
      {confirming && (
        // REQ-LIBRARY-135: the wording is the requirement's; Cancel is the default and keeps the dialog open.
        <ConfirmDialog title="Discard changes?" body="This artifact has unsaved edits. Discard them?" confirmLabel="Discard" cancelLabel="Cancel" destructive
          onConfirm={() => { setConfirming(false); onClose(id); }} onCancel={() => setConfirming(false)} testId="artifact-discard" />
      )}
    </div>
  );
}
