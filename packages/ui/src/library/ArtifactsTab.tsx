import { useEffect, useMemo, useState } from 'react';
import type { ArtifactRowPayload } from '@rotaris/contracts';
import type { LibraryTabProps } from './types.js';

/**
 * REQ-LIBRARY-108 / REQ-LIBRARY-136 — the Library's Artifacts tab: one accented card holding a flat table of
 * the loaded session's artifacts, and the primary control that opens the inspector for the selected row.
 *
 * Structure is `docs/spec`'s (the card's title and note, the six columns, the empty label and the button
 * label are the requirement's words); craft is the adopted design language's — the `card`, `ov-card__head`,
 * `table` and `empty-state` patterns every other view already draws, tokens by name and never a literal.
 */

export interface ArtifactsTabProps extends LibraryTabProps {
  /** Reads the loaded session's artifacts. Called on mount and whenever `revision` moves (REQ-LIBRARY-105). */
  readonly onRead: () => Promise<{ ok: true; sessionId: string | null; artifacts: readonly ArtifactRowPayload[]; warnings: readonly string[] } | { ok: false; reason: string }>;
  /** REQ-LIBRARY-108: "Inspect / edit selected" and a double-click both request the inspector for that artifact. */
  readonly onInspect: (id: string) => void;
}

/**
 * REQ-LIBRARY-104: case-insensitive substring matching over title + producer + persona + kind + status. The
 * query arrives already case-folded from the shell, so the fold happens once for all three tabs.
 */
export function artifactMatches(row: ArtifactRowPayload, query: string): boolean {
  if (query === '') return true;
  return `${row.title} ${row.producer} ${row.persona} ${row.kind} ${row.status}`.toLowerCase().includes(query);
}

/** REQ-LIBRARY-108: the status cell appends ` · edited` when the record has been hand-edited. */
export function statusCell(row: ArtifactRowPayload): string {
  return row.edited ? `${row.status} · edited` : row.status;
}

export function ArtifactsTab({ query, revision, onRead, onInspect }: ArtifactsTabProps) {
  const [rows, setRows] = useState<readonly ArtifactRowPayload[]>([]);
  const [warnings, setWarnings] = useState<readonly string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // REQ-LIBRARY-105: the tab re-reads when the revision moves, and a change that arrived while the Library was
  // off screen is read on the next mount. Nothing here caches: the answer is the stored state each time.
  useEffect(() => {
    let live = true;
    void onRead().then((r) => {
      if (!live) return;
      setLoaded(true);
      if (!r.ok) { setError(r.reason); return; }
      setError(null);
      setRows(r.artifacts);
      setWarnings(r.warnings);
    });
    return () => { live = false; };
  }, [onRead, revision]);

  const visible = useMemo(() => rows.filter((r) => artifactMatches(r, query)), [rows, query]);
  // REQ-LIBRARY-111's discipline applied here: a selection that survived the refresh is kept; one that did not is dropped.
  const selectedRow = visible.find((r) => r.id === selected) ?? null;

  return (
    <section className="card card--accent library-artifacts" aria-label="Session artifacts" data-testid="library-artifacts" data-artifact-count={String(visible.length)} data-loaded={loaded ? 'yes' : 'no'}>
      <div className="ov-card__head">
        <span className="card-kicker">Session artifacts</span>
        <span className="card-meta">Everything agents published or reported in the loaded session.</span>
      </div>
      {error !== null && <div className="composer__error" role="alert" data-testid="library-artifacts-error">{error}</div>}
      {/* REQ-LIBRARY-091: hydration never raises; what it could not read is stated beside what it could. */}
      {warnings.map((w, i) => <div key={i} className="composer__hint" role="status" data-testid="library-artifacts-warning">{w}</div>)}
      {visible.length === 0
        ? (
          <div className="empty-state" data-testid="library-artifacts-empty">
            <span className="empty-state-title">No artifacts have been published in this session.</span>
            <span className="empty-state-hint">An agent publishes one with the artifact_write tool, and every child report is recorded here when its task ends.</span>
          </div>
        )
        : (
          // REQ-LIBRARY-108: columns auto-size to contents on every refresh — `table-layout: auto` is that rule,
          // and it re-applies on each render because the widths are the browser's function of the cells.
          <table className="table library-artifacts__table" aria-label="Session artifacts">
            <thead>
              <tr><th>Title</th><th>Producer</th><th>Persona</th><th>Kind</th><th>Status</th><th>Created</th></tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.id} className={`library-artifacts__row${row.id === selected ? ' is-selected' : ''}`}
                  data-artifact-id={row.id} data-artifact-slug={row.slug} data-artifact-importance={row.importance}
                  aria-selected={row.id === selected}
                  onClick={() => setSelected(row.id)}
                  onDoubleClick={() => onInspect(row.id)}>
                  <td className="library-artifacts__title" title={row.summary}>{row.title}</td>
                  <td className="library-artifacts__producer mono">{row.producer || '—'}</td>
                  <td className="library-artifacts__persona">{row.persona || '—'}</td>
                  <td className="library-artifacts__kind">{row.kind}</td>
                  <td className="library-artifacts__status" data-status={row.status} data-edited={row.edited ? 'yes' : 'no'}>{statusCell(row)}</td>
                  <td className="library-artifacts__created mono" title={row.createdAt}>{row.createdLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      <div className="library-artifacts__actions">
        <button type="button" className="btn btn-primary" data-testid="library-artifacts-inspect" disabled={selectedRow === null}
          title={selectedRow === null ? 'Select an artifact to inspect or edit it.' : `Inspect ${selectedRow.title}`}
          onClick={() => { if (selectedRow) onInspect(selectedRow.id); }}>Inspect / edit selected</button>
      </div>
    </section>
  );
}
