import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { detectPlatform } from './commands/registry.js';
import { collapseHome, workspaceLabel } from './workspace-label.js';
import { measurerFor, spentBesideLabel } from './label-measure.js';
import { Button as DesignButton } from './design-system/index.js';

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

// The canvas measurer is `label-measure.ts`'s, shared with the status strip's path link and branch item (REQ-WORKSPACE-149
// rule 2 names all three), so the chip and the strip cannot measure a label differently.

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
   * The budget is the width the layout has for the label: the chip's **slot**, less what the chip spends on
   * itself. Neither half may depend on the label. The slot is a flex item with a zero basis, so the title bar
   * fixes its width and the text inside cannot move it; the spend is the chip's own borders, padding and gaps
   * plus its fixed children — the folder glyph and the session tail, both `flex: none` — so it is fixed too.
   * That independence is what makes this converge rather than ratchet.
   *
   * FALSIFIED, kept beside its replacement rather than repaired quietly. The spend used to be
   * `button.offsetWidth - span.offsetWidth`, reasoning that the difference between the chip and its label is
   * exactly the furniture. That holds only while the span is SHRUNK to fit. Take one measurement while the span
   * still stands at its full width inside a clamped button — which happened twice, intermittently, once in a
   * debugging session and once in the proof — and the spend is NEGATIVE: the budget comes out larger than the
   * label, every candidate "fits", and the label is left whole and drawn clipped, which is the one outcome rule
   * 2 forbids. Nothing then re-fires, because the slot's width has not changed, so the wrong answer is stable
   * for the life of the window. `pnpm workspace-proof` pins the span and asserts the budget ignores it.
   *
   * The gaps are counted from the FIXED children rather than from the children present, so the arithmetic does
   * not change when the label is hidden. A budget that grew by one gap the moment the label disappeared could
   * show and hide it alternately at one slot width; counting both gaps always keeps one decision boundary.
   */
  const remeasure = useCallback(() => {
    const button = chip.current;
    const slot = button?.parentElement;
    if (!button || !slot) return;
    const px = (value: string) => parseFloat(value) || 0;
    const slotStyle = getComputedStyle(slot);
    const inner = slot.clientWidth - px(slotStyle.paddingLeft) - px(slotStyle.paddingRight);
    const spent = spentBesideLabel(button, text.current);
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
    <DesignButton
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
    </DesignButton>
  );
}
