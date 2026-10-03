import type { CaptureHost } from './host.js';
import { onConsoleWarning } from './console-relay.js';
import { installFinish, installPromptSeam } from './probe.js';

export type { CaptureHost, CaptureStep } from './host.js';
export { chordEvent, parseSelectors, parseSteps } from './host.js';

/**
 * A verification hook for the walking skeleton and the release gate's first-paint check
 * (REQ-STARTUP-156): capture the painted window to a file and exit. Not a user-facing surface.
 *
 * Returns `false` when no capture was asked for, so the caller can say so in its log.
 *
 * The three branches, and why they are three modules:
 *
 *  1. **The theme proof** (`./theme-proof.js`) takes the launch over entirely — it walks the views and
 *     exits itself, so nothing below it runs.
 *  2. **The scriptable seams** (`./seams.js`) are reached ONLY through the dynamic import below, inside
 *     `if (__ROTARIS_SEAMS__)`. A packaged build folds that flag to `false`, rollup removes the branch,
 *     and the chunk is then unreferenced — so none of those variables' names reach the shipped bundle.
 *     `scripts/package.mjs` asserts this and fails the package if it stops being true.
 *  3. **The packaged probe** (`./probe.js`) is the part a shipped build still answers: the typed prompt
 *     and the photograph that ends the launch. It is statically imported and it ships.
 */
export async function runCapture(host: CaptureHost): Promise<boolean> {
  const capture = process.env['ROTARIS_CAPTURE_PNG'];
  if (!capture) return false;

  // Every proof: a renderer error is logged here, so a blank window is explained by its log and not by its PNG (Part O).
  onConsoleWarning(host.win.webContents, ({ message, sourceId, lineNumber }) => host.log(`capture: renderer console: ${message} (${sourceId}:${lineNumber})`));

  // The READ is behind the flag, not just the branch. `__ROTARIS_SEAMS__` is false in a packaged build, so this
  // is a constant `undefined` there and rollup removes the whole pass — seven views, every Settings category, a
  // tab through every focusable control, the theme switch — and the variable's name with it. The first attempt
  // guarded only the `if`, which left `ROTARIS_THEME_PROOF_DIR` in the shipped bundle and failed the seam check.
  const proofDir = __ROTARIS_SEAMS__ ? process.env['ROTARIS_THEME_PROOF_DIR'] : undefined;
  if (proofDir) {
    const { runThemeProof } = await import('./theme-proof.js');
    runThemeProof(host, proofDir);
    return true;
  }

  // Read here rather than in `seams.js` because the packaged prompt seam times itself against it: a launch that
  // first opens a stored session needs the transcript on screen before the composer means anything.
  const resumeWanted = __ROTARIS_SEAMS__ ? process.env['ROTARIS_CAPTURE_RESUME'] : undefined;
  const prompt = process.env['ROTARIS_CAPTURE_PROMPT'];
  if (prompt) installPromptSeam(host, prompt, Boolean(resumeWanted));

  if (__ROTARIS_SEAMS__) {
    const { installSeams } = await import('./seams.js');
    installSeams(host, { prompt, resumeWanted });
  }

  installFinish(host, capture, prompt);
  return true;
}
