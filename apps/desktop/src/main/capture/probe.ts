import { existsSync, writeFileSync } from 'node:fs';
import { millis } from '@rotaris/kernel';
import { type CaptureHost, parseSelectors, pause } from './host.js';

/**
 * THE PACKAGED PROBE — the part of a capture a shipped build still answers.
 *
 * `scripts/package.mjs` builds with `__ROTARIS_SEAMS__` false and then asserts that the bundle keeps
 * exactly these three names and none of the scriptable ones: `ROTARIS_CAPTURE_PNG` (the photograph),
 * `ROTARIS_CAPTURE_PROMPT` (the one typed prompt) and `ROTARIS_CAPTURE_AFTER_MS` (when to photograph).
 * That is how the package proves itself: it launches its own binary, types a prompt and reads the PNG.
 *
 * Nothing here may be scripted from outside beyond those. A new variable in this file ships; put it in
 * `seams.ts` unless the packaged probe itself needs it.
 */

/**
 * The typed prompt. Real input events, not a script: Ctrl+2 opens Workspace (REQ-SHELL-049), Ctrl+L
 * focuses the composer (REQ-CHAT-002), the text is typed, Enter submits (REQ-CHAT-001).
 *
 * `ROTARIS_CAPTURE_PROMPT_MS` says when — the MCP proof toggles a Settings control first, and a launch
 * that resumes a stored session first needs the transcript on screen before the composer means anything.
 */
export function installPromptSeam(host: CaptureHost, prompt: string, resuming: boolean): void {
  host.clocks.timers.after(millis(Number(process.env['ROTARIS_CAPTURE_PROMPT_MS'] ?? (resuming ? 2_600 : 800))), () => {
    const wc = host.win.webContents;
    wc.sendInputEvent({ type: 'keyDown', keyCode: '2', modifiers: ['control'] });
    wc.sendInputEvent({ type: 'keyUp', keyCode: '2', modifiers: ['control'] });
    host.clocks.timers.after(millis(200), () => {
      wc.sendInputEvent({ type: 'keyDown', keyCode: 'L', modifiers: ['control'] });
      wc.sendInputEvent({ type: 'keyUp', keyCode: 'L', modifiers: ['control'] });
      for (const ch of prompt) wc.sendInputEvent({ type: 'char', keyCode: ch });
      wc.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
      wc.sendInputEvent({ type: 'char', keyCode: 'Return' });
      wc.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
    });
  });
}

/**
 * The end of the launch: wait, open a last view, read the probes, photograph, exit.
 *
 * `ROTARIS_CAPTURE_AFTER_MS` lets a verification run wait for the run loop to finish before the capture.
 * `ROTARIS_CAPTURE_WAIT=file:<path>|result|js:<expression>`, bounded by `ROTARIS_CAPTURE_WAIT_MS`: the
 * AFTER timer starts only once the file exists, the first terminal result was presented, or the
 * expression answers truthy — how the slice proof waits for a pasted key and for a real run, and how the
 * board scenario waits for the accept it pressed to land rather than for a clock. Without it a scenario
 * whose work is state-driven still costs its whole deadline.
 *
 * `ROTARIS_CAPTURE_END_VIEW=<n>`: open view n (Ctrl+n) once the wait is over and before the capture, so a
 * proof can drive a run from the Workspace view and read the Overview afterwards.
 * `ROTARIS_CAPTURE_PROBE="selector;;…"`: each selector's text and `data-*` attributes logged as JSON
 * before the capture — what a proof asserts against.
 */
export function installFinish(host: CaptureHost, capture: string, prompt: string | undefined): void {
  const after = Number(process.env['ROTARIS_CAPTURE_AFTER_MS'] ?? (prompt ? 3_000 : 1_500));
  const wait = process.env['ROTARIS_CAPTURE_WAIT'];
  const waitBound = Number(process.env['ROTARIS_CAPTURE_WAIT_MS'] ?? 600_000);
  const endView = Number(process.env['ROTARIS_CAPTURE_END_VIEW'] ?? 0);
  const probes = parseSelectors(process.env['ROTARIS_CAPTURE_PROBE']);

  const finish = () => host.clocks.timers.after(millis(after), async () => {
    if (endView > 0) {
      host.win.webContents.sendInputEvent({ type: 'keyDown', keyCode: String(endView), modifiers: ['control'] });
      host.win.webContents.sendInputEvent({ type: 'keyUp', keyCode: String(endView), modifiers: ['control'] });
      await pause(host, Number(process.env['ROTARIS_CAPTURE_END_VIEW_MS'] ?? 2_500));
    }
    for (const selector of probes) {
      // `value` rides along for a control (a select, an input), since its text is every option it offers (Part R's proof reads the strategy selector).
      const found = await host.win.webContents.executeJavaScript(`(() => [...document.querySelectorAll(${JSON.stringify(selector)})].map((el) => ({ text: (el.textContent || '').trim().slice(0, 400), ...('value' in el && (el.tagName === 'SELECT' || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') ? { value: String(el.value) } : {}), data: Object.fromEntries([...el.attributes].filter((a) => a.name.startsWith('data-') || a.name.startsWith('aria-value')).map((a) => [a.name, a.value])) })))()`) as unknown;
      host.log(`capture: probe ${selector} → ${JSON.stringify(found)}`);
    }
    const img = await host.win.webContents.capturePage();
    writeFileSync(capture, img.toPNG());
    host.log(`captured ${capture}`);
    host.exit(0);
  });

  if (!wait) { finish(); return; }
  // `js:` is read in the renderer, so its answer arrives a tick late; the flag carries it between polls. A throw
  // or a `null` is "not yet", never "satisfied" — a broken expression must not end the capture early and silently.
  let jsHit = false;
  const expression = wait.startsWith('js:') ? wait.slice(3) : null;
  const satisfied = () => (wait === 'result' ? host.resultSeen() : wait.startsWith('file:') ? existsSync(wait.slice(5)) : expression !== null ? jsHit : true);
  const started = host.clocks.monotonic.now();
  const poll = host.clocks.timers.every(millis(500), () => {
    if (expression !== null && !jsHit) {
      void host.win.webContents.executeJavaScript(`(async () => { try { return Boolean(await (${expression})); } catch { return false; } })()`)
        .then((hit: unknown) => { jsHit = hit === true; })
        .catch(() => { jsHit = false; });
    }
    if (satisfied()) { poll.cancel(); host.log(`capture: wait for ${wait} satisfied after ${Math.round(host.clocks.monotonic.now() - started)} ms`); finish(); }
    else if (host.clocks.monotonic.now() - started > waitBound) { poll.cancel(); host.log(`capture: wait for ${wait} timed out after ${waitBound} ms`); finish(); }
  });
}
