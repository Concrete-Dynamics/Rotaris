import type { WebContents } from 'electron';

const held = new WeakSet<WebContents>();

/**
 * Verification only (the scriptable capture seams; the driver has its own `emulateFocus` op): makes the page behave as focused whether or not its
 * window holds OS focus, through the DevTools protocol's `Emulation.setFocusEmulationEnabled`.
 *
 * Why: Chromium moves focus on a press, paints `:focus-visible` and reports `document.hasFocus()` only in a page whose
 * window holds OS focus, and a freshly launched proof window on a Linux (X11) host sometimes does not — the window
 * manager leaves focus where it was. A synthetic press (`sendInputEvent`) then reaches the element and moves no focus,
 * so `requirements-proof`'s fold stage (REQ-TRACE-320) read the host's window focus instead of the product (`docs/archive/defects/requirements-proof-fold-stage-depends-on-the-launched-window-holding-os-focus.md`).
 * Emulating page focus removes the window manager from the measurement; `win.focus()` alone is a request a window
 * manager may refuse.
 *
 * Idempotent per web contents. Never throws: a page that cannot be held (a debugger already attached, a destroyed
 * page) is logged and left as it is, so the measurement proceeds and a red still says what it met.
 */
export async function holdPageFocus(wc: WebContents, log: (message: string) => void): Promise<void> {
  if (held.has(wc)) return;
  held.add(wc);
  try {
    if (wc.isDestroyed()) return;
    if (!wc.debugger.isAttached()) wc.debugger.attach('1.3');
    await wc.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true });
  } catch (cause) {
    log(`page focus: could not hold the page focused: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
}
