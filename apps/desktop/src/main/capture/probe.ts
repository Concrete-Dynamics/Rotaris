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
 * Nothing here may be scripted from outside beyond those. A new variable in this file ships unless it is
 * read behind `__ROTARIS_SEAMS__` on the read's own line, as the verification-only ones below are
 * (`_PROMPT_MS`, `_WAIT`, `_WAIT_MS`, `_END_VIEW`, `_END_VIEW_MS`, `_PROBE`; since 2026-10-14, when a packaged
 * build was found still answering them); put it in `seams.ts` unless the packaged probe itself needs it.
 * `scripts/lib/seam-check.test.ts` fails a capture variable read off the flag in any module a packaged build keeps.
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
  return [...textEvents(prompt, 'char'), ...enterEvents()];
}

/** One Enter — `keyDown`, `char` and `keyUp` — unmodified (REQ-CHAT-001's submit) or carrying `shift` (its newline). */
function enterEvents(modifiers?: readonly ('shift' | 'control')[]): TypedEvent[] {
  return (['keyDown', 'char', 'keyUp'] as const).map((type) => (modifiers === undefined ? { type, keyCode: 'Return' } : { type, keyCode: 'Return', modifiers }));
}

/**
 * The events that type `text` into whatever holds focus, submitting nothing — the ONE place a typed line break is decided,
 * shared by the prompt above, the driver's `type` and the scriptable seams' TYPE and TYPE_AT steps (named here without their
 * variables, which a packaged build must not carry).
 *
 * `per` keeps each site's own shape for an ordinary character: `char` is one `char` event (the prompt and the TYPE seam),
 * `key` is `keyDown`, `char`, `keyUp` (the driver and TYPE_AT). A `\n` is never sent as a character at any site: it is
 * Shift+Enter, which a textarea takes as a newline and REQ-CHAT-001 makes the composer's newline, never its submit. A `\r`
 * is dropped. Until 2026-09-30 the three other sites sent a `\n` as a `char` (or as a `keyDown` whose key code was
 * `\n`), which is the shape that dropped the duress prompt's line breaks (live-run finding H-e;
 * `docs/defects/fixed/the-driver-and-the-type-seams-type-a-newline-as-a-character.md`).
 */
export function textEvents(text: string, per: 'char' | 'key'): TypedEvent[] {
  const events: TypedEvent[] = [];
  for (const ch of text) {
    if (ch === '\r') continue;
    if (ch === '\n') events.push(...enterEvents(['shift']));
    else if (per === 'char') events.push({ type: 'char', keyCode: ch });
    else events.push({ type: 'keyDown', keyCode: ch }, { type: 'char', keyCode: ch }, { type: 'keyUp', keyCode: ch });
  }
  return events;
}

/** A `TypedEvent` in the shape `webContents.sendInputEvent` takes (its `modifiers` a mutable array). */
export function inputEvent(event: TypedEvent): { type: TypedEvent['type']; keyCode: string; modifiers?: ('shift' | 'control')[] } {
  return event.modifiers === undefined ? { type: event.type, keyCode: event.keyCode } : { type: event.type, keyCode: event.keyCode, modifiers: [...event.modifiers] };
}

/** `textEvents` followed by one unmodified Enter — what a typed step that submits sends. */
export function submitEvents(text: string, per: 'char' | 'key'): TypedEvent[] {
  return [...textEvents(text, per), ...enterEvents()];
}

/**
 * The typed prompt. Real input events, not a script: Ctrl+2 opens Workspace (REQ-SHELL-049), Ctrl+L
 * focuses the composer (REQ-CHAT-002), the text is typed with its line breaks as Shift+Enter, Enter submits
 * (REQ-CHAT-001) — `promptEvents`.
 *
 * The capture's `_PROMPT_MS` seam says when (read behind the build-time flag, so a packaged build types at the default; its
 * full name is not written in this comment, which a packaged bundle keeps) — the MCP proof toggles a Settings control first,
 * and a launch that resumes a stored session first needs the transcript on screen before the composer means anything.
 */
export function installPromptSeam(host: CaptureHost, prompt: string, resuming: boolean): PromptTyping {
  let sentAt: number | null = null;
  host.clocks.timers.after(millis(Number((__ROTARIS_SEAMS__ ? process.env['ROTARIS_CAPTURE_PROMPT_MS'] : undefined) ?? (resuming ? 2_600 : 800))), () => {
    const wc = host.win.webContents;
    wc.sendInputEvent({ type: 'keyDown', keyCode: '2', modifiers: ['control'] });
    wc.sendInputEvent({ type: 'keyUp', keyCode: '2', modifiers: ['control'] });
    host.clocks.timers.after(millis(200), () => {
      wc.sendInputEvent({ type: 'keyDown', keyCode: 'L', modifiers: ['control'] });
      wc.sendInputEvent({ type: 'keyUp', keyCode: 'L', modifiers: ['control'] });
      for (const event of promptEvents(prompt)) wc.sendInputEvent(inputEvent(event));
      sentAt = host.clocks.monotonic.now();
    });
  });
  return { sentAt: () => sentAt };
}

/**
 * The typed prompt as `installFinish` sees it: when its last event was handed to the renderer, or null before. Handing them
 * over is immediate; the renderer then takes them one at a time, which is the part that takes long — the final default live
 * run at a68f121 typed the terminal scenario's 5,755 characters for about 27 s (live-run finding P6).
 */
export interface PromptTyping {
  readonly sentAt: () => number | null;
}

/** The composer's text, or null where there is no composer — what tells `installFinish` the typed prompt has been submitted. */
const COMPOSER_TEXT = "document.querySelector('textarea.composer__input')?.value ?? null";

/**
 * The end of the launch: wait, open a last view, read the probes, photograph, exit.
 *
 * `ROTARIS_CAPTURE_AFTER_MS` lets a verification run wait for the run loop to finish before the capture.
 * The seams below are verification only, read behind the build-time flag, and named here by their suffixes alone: a
 * packaged bundle keeps this comment and must carry none of their names (`scripts/lib/seam-check.mjs`).
 * `_WAIT=file:<path>|result|js:<expression>`, bounded by `_WAIT_MS`: the
 * AFTER timer starts only once the file exists, the first terminal result was presented, or the
 * expression answers truthy — how the slice proof waits for the credential file (the stored key it filled, or
 * one the owner pasted) and for a real run, and how the board scenario waits for the accept it pressed to
 * land rather than for a clock. Without it a scenario
 * whose work is state-driven still costs its whole deadline.
 *
 * `_END_VIEW=<n>`: open view n (Ctrl+n) once the wait is over and before the capture, so a
 * proof can drive a run from the Workspace view and read the Overview afterwards.
 * `_PROBE="selector;;…"`: each selector's text and `data-*` attributes logged as JSON
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
 *
 * When the wait starts. With a typed prompt (`typing`), the bound counts from the moment the prompt was SUBMITTED — the
 * composer, which held the typed text, reads empty again — not from this call, so the budget measures the run and not the
 * typing (live-run finding P6: the terminal scenario's session started 27.4 s into its 420 s wait). Until a submission is seen
 * the bound counts from this call, as before, so a prompt never submitted, or typed for longer than the whole bound, still
 * ends the capture.
 * The prompt is still typed one character at a time: what a person does, and what the packaged probe exercises.
 */
export function installFinish(host: CaptureHost, capture: string, prompt: string | undefined, typing?: PromptTyping): void {
  const after = Number(process.env['ROTARIS_CAPTURE_AFTER_MS'] ?? (prompt ? 3_000 : 1_500));
  // The wait, the last view and the probes are verification seams the packaged probe does not use (`package.mjs` sets its
  // three alone): each is read behind the build-time flag, so a packaged build carries none of them
  // (docs/defects/fixed/a-packaged-build-still-answers-capture-variables-beyond-the-probes-three.md).
  const wait = __ROTARIS_SEAMS__ ? process.env['ROTARIS_CAPTURE_WAIT'] : undefined;
  const waitBound = Number((__ROTARIS_SEAMS__ ? process.env['ROTARIS_CAPTURE_WAIT_MS'] : undefined) ?? 600_000);
  const endView = Number((__ROTARIS_SEAMS__ ? process.env['ROTARIS_CAPTURE_END_VIEW'] : undefined) ?? 0);
  const probes = parseSelectors(__ROTARIS_SEAMS__ ? process.env['ROTARIS_CAPTURE_PROBE'] : undefined);

  const finish = (timedOut = false) => host.clocks.timers.after(millis(after), async () => {
    if (endView > 0) {
      host.win.webContents.sendInputEvent({ type: 'keyDown', keyCode: String(endView), modifiers: ['control'] });
      host.win.webContents.sendInputEvent({ type: 'keyUp', keyCode: String(endView), modifiers: ['control'] });
      await pause(host, Number((__ROTARIS_SEAMS__ ? process.env['ROTARIS_CAPTURE_END_VIEW_MS'] : undefined) ?? 2_500));
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
  const installed = host.clocks.monotonic.now();
  // P6: the submission the wait counts from. The composer is read on the same poll; text seen in it and then none means the
  // Enter was taken. A short prompt can be typed between two reads, so an empty composer a poll after the events were all
  // handed over counts as well.
  let submittedAt: number | null = null;
  let sawText = false;
  const watchSubmission = (): void => {
    const sentAt = typing?.sentAt() ?? null;
    if (submittedAt !== null || sentAt === null) return;
    void host.win.webContents.executeJavaScript(COMPOSER_TEXT)
      .then((text: unknown) => {
        if (submittedAt !== null || typeof text !== 'string') return;
        if (text !== '') { sawText = true; return; }
        const now = host.clocks.monotonic.now();
        if (!sawText && now - sentAt < 500) return;
        submittedAt = now;
        host.log(`capture: the prompt was submitted ${Math.round(now - installed)} ms after the wait was installed; the wait for ${wait} counts from here`);
      })
      .catch(() => undefined);
  };
  const poll = host.clocks.timers.every(millis(500), () => {
    if (expression !== null && !jsHit) {
      void host.win.webContents.executeJavaScript(`(async () => { try { return Boolean(await (${expression})); } catch { return false; } })()`)
        .then((hit: unknown) => { jsHit = hit === true; })
        .catch(() => { jsHit = false; });
    }
    watchSubmission();
    const started = submittedAt ?? installed;
    if (satisfied()) { poll.cancel(); host.log(`capture: wait for ${wait} satisfied after ${Math.round(host.clocks.monotonic.now() - started)} ms`); finish(); }
    else if (host.clocks.monotonic.now() - started > waitBound) { poll.cancel(); host.log(`capture: wait for ${wait} timed out after ${waitBound} ms${submittedAt === null && typing !== undefined ? ' (no submission of the typed prompt was seen; counted from the launch)' : ''}`); finish(true); }
  });
}
