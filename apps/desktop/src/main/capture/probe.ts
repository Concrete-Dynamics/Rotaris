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

/** One keyboard event as `webContents.sendInputEvent` takes it. */
export interface TypedEvent {
  readonly type: 'keyDown' | 'char' | 'keyUp';
  readonly keyCode: string;
  readonly modifiers?: readonly ('shift' | 'control')[];
}

/**
 * The events that type `prompt` into the composer as a person types it, then submit it.
 *
 * Each character is one `char` event — the renderer needs the `char`, and a chord alone inserts nothing. A line break
 * is not a character the composer takes that way: a `char` of `\n` inserts nothing, so every line of a multi-line
 * prompt used to arrive joined to the next ("in order,each waiting", the duress live run of 2026-09-29, live-run
 * finding H-e). It is typed as the composer receives a typed one instead — Shift+Enter, `keyDown`, `char` and `keyUp`
 * each carrying `shift` — which REQ-CHAT-001 makes a newline and never a submit, so the prompt cannot go early either.
 * A `\r` is dropped, so a CRLF prompt breaks its lines once. The one unmodified Enter at the end submits (REQ-CHAT-001).
 */
export function promptEvents(prompt: string): TypedEvent[] {
  const events: TypedEvent[] = [];
  const enter = (modifiers?: readonly ('shift' | 'control')[]) => {
    for (const type of ['keyDown', 'char', 'keyUp'] as const) events.push(modifiers === undefined ? { type, keyCode: 'Return' } : { type, keyCode: 'Return', modifiers });
  };
  for (const ch of prompt) {
    if (ch === '\r') continue;
    if (ch === '\n') enter(['shift']);
    else events.push({ type: 'char', keyCode: ch });
  }
  enter();
  return events;
}

/**
 * The typed prompt. Real input events, not a script: Ctrl+2 opens Workspace (REQ-SHELL-049), Ctrl+L
 * focuses the composer (REQ-CHAT-002), the text is typed with its line breaks as Shift+Enter, Enter submits
 * (REQ-CHAT-001) — `promptEvents`.
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
      for (const event of promptEvents(prompt)) wc.sendInputEvent(event.modifiers === undefined ? { type: event.type, keyCode: event.keyCode } : { type: event.type, keyCode: event.keyCode, modifiers: [...event.modifiers] });
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
 *
 * How the launch ends. A capture whose wait was satisfied, or that had none, ends by the immediate exit it always
 * has: what it waited for has happened, and a proof may read what the immediate exit leaves (part-j-proof reads a
 * paused session's lock surviving it). A capture whose wait TIMED OUT ends through the application's quit
 * (`host.quit`) instead: what it waited for — a run's result, as a rule — has not happened, so a run may still be live,
 * and the immediate exit left it as a crash leaves it, `running` with no stop reason and its last usage unwritten
 * (the duress live run of 2026-09-29, session `379f1490`;
 * `docs/defects/fixed/the-drivers-quit-skips-the-applications-shutdown.md`). The quit brings it to rest as a
 * person's quit at that moment would (PD-ORCH-005 clause 3).
 */
export function installFinish(host: CaptureHost, capture: string, prompt: string | undefined): void {
  const after = Number(process.env['ROTARIS_CAPTURE_AFTER_MS'] ?? (prompt ? 3_000 : 1_500));
  const wait = process.env['ROTARIS_CAPTURE_WAIT'];
  const waitBound = Number(process.env['ROTARIS_CAPTURE_WAIT_MS'] ?? 600_000);
  const endView = Number(process.env['ROTARIS_CAPTURE_END_VIEW'] ?? 0);
  const probes = parseSelectors(process.env['ROTARIS_CAPTURE_PROBE']);

  const finish = (timedOut = false) => host.clocks.timers.after(millis(after), async () => {
    if (endView > 0) {
      host.win.webContents.sendInputEvent({ type: 'keyDown', keyCode: String(endView), modifiers: ['control'] });
      host.win.webContents.sendInputEvent({ type: 'keyUp', keyCode: String(endView), modifiers: ['control'] });
      await pause(host, Number(process.env['ROTARIS_CAPTURE_END_VIEW_MS'] ?? 2_500));
    }
    for (const selector of probes) {
      // `value` rides along for a control (a select, an input), since its text is every option it offers (Part R's proof reads the strategy selector).
      // `fontSize` is the computed one, so a proof can hold two texts to one type token (the About caption, 2026-09-28) without a second seam.
      const found = await host.win.webContents.executeJavaScript(`(() => [...document.querySelectorAll(${JSON.stringify(selector)})].map((el) => ({ text: (el.textContent || '').trim().slice(0, 400), fontSize: getComputedStyle(el).fontSize, ...('value' in el && (el.tagName === 'SELECT' || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') ? { value: String(el.value) } : {}), data: Object.fromEntries([...el.attributes].filter((a) => a.name.startsWith('data-') || a.name.startsWith('aria-value')).map((a) => [a.name, a.value])) })))()`) as unknown;
      host.log(`capture: probe ${selector} → ${JSON.stringify(found)}`);
    }
    const img = await host.win.webContents.capturePage();
    writeFileSync(capture, img.toPNG());
    host.log(`captured ${capture}`);
    if (timedOut) { host.log('capture: ending through the application\'s quit (the wait timed out; a run may still be live)'); host.quit(); return; }
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
    else if (host.clocks.monotonic.now() - started > waitBound) { poll.cancel(); host.log(`capture: wait for ${wait} timed out after ${waitBound} ms`); finish(true); }
  });
}
