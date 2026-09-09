import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { EncodedKey } from '@rotaris/contracts';
import { resolveTerminalColours, resolveTerminalFont, useThemeVersion } from './colours.js';
import { GeometryReporter, PREFERRED_COLS, PREFERRED_ROWS, proposeGeometry, type GridGeometry } from './geometry.js';
import { decideKey } from './keys.js';
import { GRID_DESCRIPTION, GRID_NAME } from './labels.js';
import { copyText, type CopyOutcome } from './selection.js';
import { WheelAccumulator } from './wheel.js';
import type { TerminalView } from './xterm-view.js';

/**
 * Part AM — the output grid (REQ-SHELL-095..101; ADR-0047 B). The library paints the screen; this component owns
 * everything the specification fixes differently from the library's defaults:
 *  - the five-rule key priority (`keys.ts`) and the arming gate — no keystroke reaches the process unarmed;
 *  - the wheel: three rows per notch, fractional remainder carried (`wheel.ts`), taken in the CAPTURE phase so the
 *    library's viewport never applies its own sensitivity;
 *  - selection extraction (`selection.ts`) and the empty-copy failure;
 *  - the cursor: painted only while the process runs, the grid has focus and the view is at the tail; filled while
 *    armed, hollow while read-only (an overlay the grid positions from the cursor cell);
 *  - geometry: the cell from the theme's monospace face, a 6 px gutter, 20×4 minimum, reported to the backend only
 *    on change and only while visible and meaningfully laid out; re-measured on theme change.
 * The widget's background is the theme's terminal ground on the host element itself, so no resize frame exposes the
 * platform surface colour.
 */
export interface TerminalGridProps {
  readonly view: TerminalView;
  readonly armed: boolean;
  readonly running: boolean;
  /** Rule 5: a key to forward, already encoded. */
  readonly onKey: (key: EncodedKey) => void;
  /** Rule 4: the rejected-input event (REQ-SHELL-090). */
  readonly onRejectedInput: () => void;
  /** Rule 1 and Ctrl+Shift+C: the copy's outcome — an empty selection is a failure. */
  readonly onCopy: (outcome: CopyOutcome) => void;
  /** REQ-SHELL-100: the grid's dimensions, only when they change and only while meaningfully laid out. */
  readonly onGeometry: (geometry: GridGeometry) => void;
  /** Bump to move keyboard focus into the grid (REQ-SHELL-085/089). */
  readonly focusRequest?: number | undefined;
}

/** A probe measured beside the grid with the theme's face: the cell before the library has painted anything. */
function measureProbe(host: HTMLElement, family: string, sizePx: number): { width: number; height: number } | null {
  const probe = document.createElement('span');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font-kerning:none;font-family:${family};font-size:${sizePx}px;line-height:normal`;
  probe.textContent = 'W'.repeat(32);
  host.append(probe);
  const rect = probe.getBoundingClientRect();
  probe.remove();
  return rect.width > 0 && rect.height > 0 ? { width: rect.width / 32, height: rect.height } : null;
}

function isLaidOut(host: HTMLElement): boolean {
  if (!host.isConnected) return false;
  if (typeof host.checkVisibility === 'function' && !host.checkVisibility()) return false;
  const rect = host.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && document.visibilityState !== 'hidden';
}

export function TerminalGrid({ view, armed, running, onKey, onRejectedInput, onCopy, onGeometry, focusRequest }: TerminalGridProps) {
  const host = useRef<HTMLDivElement>(null);
  const cursor = useRef<HTMLDivElement>(null);
  const wheel = useRef(new WheelAccumulator());
  const [focusWithin, setFocusWithin] = useState(false);
  const themeVersion = useThemeVersion();
  const [reported, setReported] = useState<{ readonly geometry: GridGeometry | null; readonly count: number }>({ geometry: null, count: 0 });
  const latest = useRef({ armed, running, onKey, onRejectedInput, onCopy, onGeometry });
  useEffect(() => { latest.current = { armed, running, onKey, onRejectedInput, onCopy, onGeometry }; });
  // One reporter for the grid's life: it reports only on change (REQ-SHELL-100) and the count is what the proof reads.
  const reporter = useRef<GeometryReporter | null>(null);
  // Defect forty-eight (ADR-0047 note): a theme change that alters the face also re-lays the tab's header in the SAME
  // frame, the host shrinks, and the resize observer measured it against the cell the library had painted with the OLD
  // face — one wrong geometry reached the process a frame before the right one. While a re-measure is pending, the
  // observer stays quiet; the frame after the library has repainted measures once, with the new cell.
  const remeasurePending = useRef(false);

  // Mount the library's container; name the element that actually takes focus (REQ-SHELL-095/099).
  useLayoutEffect(() => {
    const element = host.current;
    if (!element) return;
    view.attach(element);
    const textarea = view.terminal.textarea;
    if (textarea) {
      textarea.setAttribute('aria-label', GRID_NAME);
      textarea.setAttribute('data-testid', 'term-grid-input');
    }
    return () => { view.detach(); };
  }, [view]);

  // REQ-SHELL-099: the description states the input mode.
  useEffect(() => {
    view.terminal.textarea?.setAttribute('aria-description', armed ? GRID_DESCRIPTION.armed : GRID_DESCRIPTION.readOnly);
  }, [view, armed]);

  // The cursor overlay: repainted imperatively on every render/scroll/focus change, never through React state.
  const paintCursor = useCallback(() => {
    const overlay = cursor.current;
    if (!overlay) return;
    const { running: live, armed: taken } = latest.current;
    const focused = host.current?.matches(':focus-within') ?? false;
    const snap = view.snapshot();
    const box = live && focused && snap.atTail ? view.cursorBox() : null;
    if (!box) { overlay.hidden = true; return; }
    overlay.hidden = false;
    overlay.dataset['shape'] = taken ? 'filled' : 'hollow';
    overlay.style.transform = `translate(${box.left}px, ${box.top}px)`;
    overlay.style.width = `${box.width}px`;
    overlay.style.height = `${box.height}px`;
    if (host.current) host.current.dataset['atTail'] = String(snap.atTail);
  }, [view]);
  useEffect(() => view.subscribe(paintCursor), [view, paintCursor]);
  useEffect(() => { paintCursor(); }, [paintCursor, armed, running, focusWithin]);

  // REQ-SHELL-100 — measure, propose, report only on change and only while laid out; theme change re-measures.
  const measure = useCallback(() => {
    const element = host.current;
    if (!element) return;
    const root = document.documentElement;
    const font = resolveTerminalFont(root);
    const cell = view.cellSize() ?? measureProbe(element, font.family, font.sizePx);
    const rect = element.getBoundingClientRect();
    const proposal = proposeGeometry({ hostWidth: rect.width, hostHeight: rect.height, cellWidth: cell?.width ?? 0, cellHeight: cell?.height ?? 0, visible: isLaidOut(element) });
    reporter.current ??= new GeometryReporter((g) => { latest.current.onGeometry(g); setReported((r) => ({ geometry: g, count: r.count + 1 })); });
    if (proposal && reporter.current.offer(proposal)) view.resize(proposal.cols, proposal.rows);
  }, [view]);

  useLayoutEffect(() => {
    const root = document.documentElement;
    remeasurePending.current = true;
    view.applyTheme(resolveTerminalColours(root), resolveTerminalFont(root));
    // The library re-measures its own cell on the font change; measure after it has painted with the new face.
    const frame = requestAnimationFrame(() => { remeasurePending.current = false; measure(); });
    return () => cancelAnimationFrame(frame);
  }, [view, measure, themeVersion]);

  useEffect(() => {
    const element = host.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => { if (!remeasurePending.current) measure(); });
    observer.observe(element);
    const onVisibility = () => { if (!remeasurePending.current) measure(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', onVisibility); };
  }, [measure]);

  // REQ-SHELL-101: the wheel, ours, in the capture phase — the library's own handler never runs.
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const rows = wheel.current.rows(event.deltaY, event.deltaMode, view.rows);
      view.scrollRows(rows);
    };
    element.addEventListener('wheel', onWheel, { capture: true, passive: false });
    return () => element.removeEventListener('wheel', onWheel, { capture: true });
  }, [view]);

  useEffect(() => { if (focusRequest !== undefined && focusRequest > 0) view.focus(); }, [view, focusRequest]);

  const copy = () => {
    const outcome = copyText(view.selectionText());
    latest.current.onCopy(outcome);
  };

  // REQ-SHELL-097 — the five rules. Events bubble here from the library's textarea, which has already declined them.
  const onKeyDown = (event: React.KeyboardEvent) => {
    const decision = decideKey({ armed: latest.current.armed, running: latest.current.running, hasSelection: view.hasSelection() }, event);
    switch (decision.kind) {
      case 'copy': event.preventDefault(); copy(); return;
      case 'leave': case 'traverse': return; // the browser moves focus
      case 'scroll': event.preventDefault(); view.scrollTo(decision.to); return;
      case 'rejected': event.preventDefault(); latest.current.onRejectedInput(); return;
      case 'send': event.preventDefault(); latest.current.onKey(decision.key); return;
      case 'ignore': if (latest.current.armed) event.preventDefault(); return;
    }
  };

  return (
    <div
      ref={host}
      className="term-grid"
      data-testid="term-grid"
      data-armed={armed}
      data-running={running}
      data-focused={focusWithin}
      data-geometry-reports={reported.count}
      data-cols={reported.geometry?.cols ?? PREFERRED_COLS}
      data-rows={reported.geometry?.rows ?? PREFERRED_ROWS}
      onKeyDown={onKeyDown}
      onFocus={() => { setFocusWithin(true); }}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusWithin(false); }}
    >
      <div ref={cursor} className="term-cursor" data-testid="term-cursor" aria-hidden="true" hidden />
    </div>
  );
}
