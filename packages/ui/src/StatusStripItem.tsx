import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Button as DesignButton } from './design-system/index.js';
import type { StripItem } from './composer.js';
import { measurerFor, spentBesideLabel } from './label-measure.js';
import { rowLabel } from './workspace-label.js';

/**
 * One item of REQ-SHELL-038's status strip. Most items are text that keeps REQ-SHELL-038's end ellipsis when too long; the
 * workspace-path link (REQ-WORKSPACE-019) and the branch item (REQ-WORKSPACE-020) carry `middle`, and their label is drawn
 * under REQ-WORKSPACE-149 rule 2 instead: shortened from the MIDDLE, the removed span one `…`, against the width the strip
 * gives the item, recomputed whenever that width changes, and hidden rather than clipped where even `…` does not fit.
 *
 * Until 2026-10-03 both were ordinary items cut at their end by CSS, so a deep workspace path kept its head and lost the
 * folder name that tells workspaces apart
 * (`docs/defects/fixed/the-status-strips-workspace-path-elides-at-its-end-not-its-middle.md`).
 *
 * How the width is had without a loop. The item asks the row for its whole label (`flex-basis` = the full label's
 * measured width plus what the box spends beside it, `rowLabel`) and may be shrunk below that, to nothing (the
 * `data-middle` rule in shell.css); the label is then shortened against the box's border-box width less the same spend. The box's width
 * comes from that basis and the row, never from the text drawn in it, so shortening the label cannot move the width that
 * shortened it. A ResizeObserver on the box re-runs the measurement on every change — a window resize, a neighbour's text
 * changing, a theme moving a font. The tooltip and the accessible description always carry the full text (REQ-SHELL-022).
 */
export function StatusStripItem({ item }: { readonly item: Exclude<StripItem, { kind: 'spacer' }> }) {
  const box = useRef<HTMLElement | null>(null);
  const text = useRef<HTMLSpanElement | null>(null);
  const middle = item.middle === true;
  /** The drawn label; the full text until the first measurement replaces it, before that paint. */
  const [label, setLabel] = useState<string | null>(item.text);
  const [basis, setBasis] = useState<number | null>(null);

  const remeasure = useCallback(() => {
    const el = box.current;
    if (!el || !middle) return;
    // The label inherits the box's face and size, so the box measures for it while the label is hidden.
    const next = rowLabel(item.text, spentBesideLabel(el, text.current), el.getBoundingClientRect().width, measurerFor(text.current ?? el));
    setBasis(next.basis);
    setLabel(next.label);
  }, [item.text, middle]);

  useLayoutEffect(() => { remeasure(); }, [remeasure]);
  // REQ-WORKSPACE-149 rule 2: "recomputed whenever that width changes".
  useLayoutEffect(() => {
    const el = box.current;
    if (!middle || !el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => { remeasure(); });
    observer.observe(el);
    return () => { observer.disconnect(); };
  }, [middle, remeasure]);

  const setBox = useCallback((el: HTMLElement | null) => { box.current = el; }, []);
  const suffix = item.kind === 'text' ? item.suffix : undefined;
  // REQ-SHELL-042: the branch icon in the accent colour, a CSS token, so a theme change redraws it with the rest.
  const icon = item.kind === 'text' && item.icon ? <i className={`ph ${item.icon} status-strip__icon`} aria-hidden="true" /> : null;
  const content = middle
    ? (<>
        {icon}
        {/* Hidden entirely rather than drawn clipped where even `…` will not fit (rule 2, REQ-WORKSPACE-021). */}
        {label !== null && <span ref={text} className="status-strip__label">{label}</span>}
        {suffix && <span className="status-strip__suffix">{suffix}</span>}
      </>)
    : (<>{icon}{`${item.text}${suffix ?? ''}`}</>);
  const sizing = middle && basis !== null ? ({ '--status-strip-label-basis': `${basis}px` } as CSSProperties) : undefined;
  const elide = !middle && item.text.length > 28 ? '1' : undefined;
  if (item.kind === 'link') {
    return (
      <DesignButton ref={setBox} type="button" className="btn btn-link status-strip__item status-strip__link" data-elide={elide} data-middle={middle ? '1' : undefined} style={sizing}
        aria-label={item.name} aria-description={item.title} title={item.title} data-testid={item.testId} onClick={item.onActivate}>{content}</DesignButton>
    );
  }
  return (
    <span ref={setBox} className="status-strip__item" data-elide={elide} data-middle={middle ? '1' : undefined} style={sizing}
      aria-label={item.name} aria-description={item.title} title={item.title} data-branch-state={item.state} data-figure={item.figure ? '1' : undefined} data-strong={item.strong ? '1' : undefined} data-testid={item.testId}>{content}</span>
  );
}
