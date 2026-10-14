import { useCallback, useEffect, useRef, useState } from 'react';
import { splitFrontmatter } from '@rotaris/contracts';
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
 * metadata immutable) and the footer then reads "Saved." or `Save failed: <err>`. PD-LIBRARY-003 revision 2 (f), OQ-272
 * ruled 2026-10-13 under R-072: the document's leading frontmatter block is the record's, so the Markdown tab shows it
 * read-only above the editor ("Record fields (read-only)", `artifact-frontmatter`), the editor holds the text below it,
 * the Preview renders that text, and Save sends the block as loaded followed by the edited text; the store writes the
 * record's own block in its place (revision 2 (c)). A document with no valid block is edited whole. A load failure
 * leaves the editor read-only with Save disabled; an empty stored body falls back to the rendered sidecar form of the
 * record, which the load reports as such and which is split the same way.
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
  /**
   * A load already answered, which the dialog opens on before `onLoad` answers. No host passes it: it lets a static render
   * (the unit test beside this file) draw the loaded dialog, where effects never run.
   */
  readonly preloaded?: ArtifactLoaded | undefined;
  /** The tab the dialog opens on; no host passes it (Preview, REQ-LIBRARY-132). It lets a static render draw the Markdown tab. */
  readonly initialTab?: 'preview' | 'markdown' | undefined;
}

/**
 * PD-LIBRARY-003 (f), OQ-210's ruling (R-072): the Preview renders the document from below its leading frontmatter block,
 * which the header's metadata line already states and which rendered as a run-on paragraph between two rules on every
 * artifact. Since revision 2 the inspector previews the editor's text, which is already below the block
 * (`inspectorDocument`); this stays for callers that hold a whole document.
 */
export function previewSource(text: string): string {
  return splitFrontmatter(text).rest;
}

/**
 * PD-LIBRARY-003 revision 2 (f): a loaded document as the inspector holds it — its leading frontmatter block, shown
 * read-only, and the text below it, which the editor holds and REQ-LIBRARY-135's `dirty` compares. A document with no
 * valid block (none, or one an edit broke) has `frontmatter` null and is edited whole.
 */
export interface InspectorDocument {
  readonly frontmatter: string | null;
  readonly text: string;
}

export function inspectorDocument(body: string): InspectorDocument {
  const split = splitFrontmatter(body);
  return { frontmatter: split.frontmatter, text: split.rest };
}

/** PD-LIBRARY-003 revision 2 (f): what Save sends — the block as loaded, followed by the edited text. */
export function savedDocument(frontmatter: string | null, text: string): string {
  return `${frontmatter ?? ''}${text}`;
}

/** REQ-LIBRARY-131's metadata line, exactly. */
export function metadataLine(a: Pick<ArtifactLoaded, 'id' | 'artifactKind' | 'status' | 'producer' | 'persona' | 'edited'>): string {
  const by = a.producer || a.persona;
  return `${a.id} · ${a.artifactKind} · ${a.status}${by ? ` · by ${by}` : ''}${a.edited ? ' · edited' : ''}`;
}

export function ArtifactInspector({ id, raised, onLoad, onSave, onClose, onOpenLink, preloaded, initialTab }: ArtifactInspectorProps) {
  const initial = inspectorDocument(preloaded?.body ?? '');
  const [artifact, setArtifact] = useState<ArtifactLoaded | null>(preloaded ?? null);
  // PD-LIBRARY-003 revision 2 (f): the block is held apart from the editor's text; `text` and `saved` are below it.
  const [frontmatter, setFrontmatter] = useState<string | null>(initial.frontmatter);
  const [text, setText] = useState(initial.text);
  const [saved, setSaved] = useState(initial.text);
  const [tab, setTab] = useState<'preview' | 'markdown'>(initialTab ?? 'preview');
  const [status, setStatus] = useState('');
  const [readOnly, setReadOnly] = useState(preloaded === undefined);
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
      const loaded = inspectorDocument(r.artifact.body);
      setFrontmatter(loaded.frontmatter);
      setText(loaded.text);
      setSaved(loaded.text);
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
    const sent = text;
    const r = await onSave(id, savedDocument(frontmatter, sent));
    setBusy(false);
    // REQ-LIBRARY-133: the footer's two states, worded by the requirement.
    if (!r.ok) { setStatus(`Save failed: ${r.reason}`); return; }
    setSaved(sent);
    setStatus('Saved.');
    setArtifact((a) => (a ? { ...a, edited: true } : a));
    // PD-LIBRARY-003 revision 2 (c): the store wrote the record's block (with `edited_at`, or a fresh one in front of a
    // document that had none), so the shown block is refreshed from the saved document; the editor's text is left alone.
    void onLoad(id).then((reloaded) => {
      if (!reloaded.ok) return;
      const block = splitFrontmatter(reloaded.artifact.body).frontmatter;
      if (block !== null) setFrontmatter(block);
    }, () => undefined);
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
      <div className={`artifact-inspector__body${tab === 'markdown' ? ' artifact-inspector__body--markdown' : ''}`}>
        {tab === 'preview'
          // REQ-LIBRARY-132: the preview re-renders on every keystroke — it reads `text`, not the saved body — and
          // PD-LIBRARY-003 (f) starts it below the frontmatter, which `text` already is (revision 2).
          ? <Markdown source={text} onOpenLink={onOpenLink} className="artifact-inspector__preview" testId="artifact-preview" />
          : (
            <>
              {frontmatter !== null && (
                // PD-LIBRARY-003 revision 2 (f): the record's fields, shown whole and selectable, never edited here. A
                // scrollable region of its own, height-bounded so the editor keeps the larger share of the body.
                <pre className="artifact-inspector__frontmatter mono" role="region" aria-label="Record fields (read-only)" tabIndex={0}
                  data-testid="artifact-frontmatter">{frontmatter.replace(/\r?\n$/, '')}</pre>
              )}
              <DesignTextArea className="input artifact-inspector__editor mono" aria-label="Artifact Markdown" data-testid="artifact-editor"
                value={text} readOnly={readOnly} spellCheck={false} onChange={(e) => setText(e.currentTarget.value)} />
            </>
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
