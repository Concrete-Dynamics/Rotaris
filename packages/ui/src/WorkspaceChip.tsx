import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { detectPlatform } from './commands/registry.js';
import { collapseHome, workspaceLabel } from './workspace-label.js';

/**
 * The title bar's workspace chip — REQ-SHELL-035, REQ-WORKSPACE-016 and REQ-WORKSPACE-017, drawn
 * under REQ-WORKSPACE-149's label rules.
 *
 * It is a real `<button>`, which is what meets REQ-SHELL-035's "activated by left-click release
 * inside it or by Return/Enter/Space": the platform gives a button exactly those three activations
 * and no others, so there is no key handler here to get wrong. A `div` with a click listener would
 * have needed one and would still have missed the click-release rule.
 *
 * The accessible name, the tooltip and the accessible description are the specification's strings,
 * verbatim. The description carries the **absolute** path however the label is collapsed or
 * shortened, which is what REQ-WORKSPACE-149's first two rules both require.
 *
 * The session half renders `—`. REQ-WORKSPACE-017 asks for "the current session name (or `—` when
 * there is none)" and this product has no session name: `SessionRecordSchema` carries an identifier,
 * a status, a workspace root, timestamps and run state, and nothing a person named. Rather than
 * invent one, the chip renders the requirement's own "none" and the residue is recorded.
 */
export interface WorkspaceChipProps {
  /** The absolute path, as main resolved it. Everything the rules call "full text" is this. */
  readonly path: string;
  /** The user's home directory, from `shell.hello` — a renderer cannot ask the platform (ADR-0051). */
  readonly home?: string | undefined;
  /** The current session's name, when the product ever has one; `—` is drawn for its absence. */
  readonly sessionName?: string | null | undefined;
  /**
   * Stage C — `PD-SHELL-001`: `newWindow` is true when the platform's secondary-activation modifier was held,
   * which is one of that directive's exactly two add-route gestures. The gesture decides the outcome before the
   * chooser opens, because a native chooser carries no buttons of ours (REQ-SHELL-164) and the two routes have
   * different gate sets — a replacement evaluates REQ-SHELL-021's three, an addition evaluates none.
   */
  readonly onChoose?: ((newWindow: boolean) => void) | undefined;
}

/**
 * One canvas per window measures every candidate label. Measuring on a canvas rather than in the
 * document is what keeps rule 2 free of a feedback loop: a candidate's width is read without the
 * candidate being laid out, so shortening the label cannot move the budget that decided it.
 *
 * An environment with no 2D context — a test renderer — measures everything as zero, so every label
 * fits and none is shortened. That is the right answer where there is no width: elision is a
 * property of a surface that was drawn, and nothing was.
 */
let scratch: HTMLCanvasElement | null = null;
function measurerFor(el: HTMLElement): (s: string) => number {
  scratch ??= document.createElement('canvas');
  const ctx = scratch.getContext('2d');
  const font = getComputedStyle(el).font;
  if (!ctx || font === '') return () => 0;
  ctx.font = font;
  return (s) => ctx.measureText(s).width;
}

export function WorkspaceChip({ path, home, sessionName, onChoose }: WorkspaceChipProps) {
  const chip = useRef<HTMLButtonElement | null>(null);
  const text = useRef<HTMLSpanElement | null>(null);
  /**
   * The measured label is state written from the layout effect, not something computed while
   * rendering: the measurement needs the boxes this render is about to produce, and a component
   * that read its own refs mid-render would be reading the previous frame (`react-hooks/refs`).
   * The initial value is the unshortened label, so the first paint shows the whole path rather
   * than nothing, and the measured answer replaces it before that paint.
   */
  const [label, setLabel] = useState<string | null>(() => collapseHome(path, home));

  /**
   * The budget is the width the layout has for the label, read from the chip's **slot** rather than
   * from the chip: the slot is a flex item with a zero basis, so its width is fixed by the title bar
   * and does not depend on the text inside it. What the chip spends on itself — padding, border,
   * gaps, the folder glyph, the separator and the session — is the difference between the chip's
   * width and the label's, which is likewise independent of what the label says. Both halves being
   * content-independent is what makes this converge instead of ratcheting: reading the budget from
   * the chip's own box would shrink with every pass and never recover on a widening window.
   */
  const remeasure = useCallback(() => {
    const button = chip.current;
    const slot = button?.parentElement;
    if (!button || !slot) return;
    const spent = button.offsetWidth - (text.current?.offsetWidth ?? 0);
    const style = getComputedStyle(slot);
    const inner = slot.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
    // The path span inherits the button's face and size, so the button is a faithful stand-in for
    // the metrics while the label is hidden and the span is not in the document.
    setLabel(workspaceLabel(path, home, inner - spent, measurerFor(text.current ?? button)));
  }, [path, home]);

  // Re-measure whenever the text to fit changed, or the fixed parts beside it did.
  useLayoutEffect(() => { remeasure(); }, [remeasure, sessionName]);

  // REQ-WORKSPACE-149 rule 2: "recomputed whenever that width changes". The observer is what makes
  // that true for a window resize, a theme change that moves a font, and a control appearing beside
  // the chip; a one-off measurement at mount would meet the rule only until the first of those.
  useLayoutEffect(() => {
    const slot = chip.current?.parentElement;
    if (!slot || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => { remeasure(); });
    observer.observe(slot);
    return () => { observer.disconnect(); };
  }, [remeasure]);

  const session = (sessionName ?? '').trim();
  return (
    <button
      ref={chip}
      type="button"
      className="title-bar__workspace"
      aria-label="Open project folder"
      aria-description={`Current project: ${path}. Opens the native project folder chooser.`}
      title="Open another project folder"
      // The secondary-activation modifier is the platform's own: Command on macOS, Control elsewhere. Reading
      // both would accept a Control-click on macOS, which that platform reserves for the context menu.
      onClick={(event) => { onChoose?.(detectPlatform() === 'mac' ? event.metaKey : event.ctrlKey); }}
    >
      <i className="ph ph-folder-open" aria-hidden="true" />
      {/* Hidden entirely rather than drawn clipped where even `…` will not fit (rule 2). */}
      {label !== null && <span ref={text} className="title-bar__workspace-path">{label}</span>}
      <span className="title-bar__workspace-tail">{` · ${session === '' ? '—' : session}`}</span>
    </button>
  );
}
