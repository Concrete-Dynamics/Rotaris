import { execFile } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { type BrowserWindow, screen } from 'electron';
import { millis } from '@rotaris/kernel';
import { CHANNEL, CONTRACT_SCHEMA_VERSION, type NoticeAction, type NoticeSeverity } from '@rotaris/contracts';
import { type CaptureHost, type CaptureStep, centre, chordEvent, clickAt, onStep, parseSelectors, parseSteps, pause, settleAt } from './host.js';

/**
 * THE SCRIPTABLE SEAMS — clicks, typed text, chords, renderer `eval`, notices, prompts, drags, OS input,
 * the persona windows, the gap injection. Verification only, and **a packaged build has none of them**.
 *
 * This module is reached by ONE dynamic import, inside `if (__ROTARIS_SEAMS__)` in `./index.ts`. With
 * `ROTARIS_BUILD=package` that flag is `false`, rollup removes the branch, and the chunk then has no
 * reference at all — so every variable named below leaves the bundle with it. `scripts/package.mjs`
 * asserts exactly that and fails the package otherwise.
 *
 * Before this module the same code was four hundred lines inline in `main()`, guarded by the same flag
 * and relying on rollup to eliminate the branch in place. The gate is unchanged; what changed is that it
 * is now a boundary you can see.
 *
 * Without the gate at all the shipped binary carried all of it, able to click, type and evaluate script
 * in a window the user had signed into, for anything that could set a variable in the app's environment.
 * The proofs need that surface; the product never did.
 */

export interface SeamOptions {
  /** The typed prompt, when there is one — the stop control's seam only means something after a submit. */
  readonly prompt: string | undefined;
  /** `ROTARIS_CAPTURE_RESUME`, read by `./index.ts` because the packaged prompt seam times itself against it. */
  readonly resumeWanted: string | undefined;
}

export function installSeams(host: CaptureHost, options: SeamOptions): void {
  const { win, clocks, log } = host;
  const steps = (raw: string | undefined): CaptureStep[] => parseSteps(raw);
  const firstPersona = () => host.personaWindows.list().map((p) => host.personaWindows.entry(p.persona)).find((e) => e !== undefined && !e.win.isDestroyed()) ?? null;

  // ROTARIS_CAPTURE_RESUME=<sessionId|latest>: the user's route to a stored session — the title bar's
  // "Sessions" control opens the browser (REQ-SHELL-126), the row's "Open" loads it (REQ-SESSION-118).
  // Runs after the workspace is open (the list is the workspace's); the prompt seam then continues it.
  if (options.resumeWanted) {
    const resumeWanted = options.resumeWanted;
    clocks.timers.after(millis(600), async () => {
      const control = await centre(win, `document.querySelector('.title-bar__sessions')`);
      if (!control) { log('capture: no "Sessions" control on screen'); return; }
      clickAt(win, control);
      await pause(host, 700);
      const rowFinder = resumeWanted === 'latest' ? `document.querySelector('.session-browser tr[data-session-id] button')` : `document.querySelector('.session-browser tr[data-session-id=${JSON.stringify(resumeWanted)}] button')`;
      const open = await centre(win, rowFinder);
      if (!open) { log(`capture: no session row for "${resumeWanted}" in the browser`); return; }
      clickAt(win, open);
      log(`capture: opened session "${resumeWanted}" from the browser`);
    });
  }

  // ROTARIS_CAPTURE_ACTION=backup|restore at ROTARIS_CAPTURE_ACTION_MS: the command a Settings action sends.
  const action = process.env['ROTARIS_CAPTURE_ACTION'];
  if (action === 'backup' || action === 'restore' || action === 'hooks-review') {
    clocks.timers.after(millis(Number(process.env['ROTARIS_CAPTURE_ACTION_MS'] ?? 1_500)), async () => {
      const outcome = await host.command({ kind: action === 'backup' ? 'workspace.backup' : action === 'restore' ? 'workspace.restore' : 'hooks.review' });
      log(`capture: ${action} → ${JSON.stringify(outcome)}`);
    });
  }

  // ROTARIS_CAPTURE_VIEW=<n>: open view n and, for Settings, click the Project category.
  const view = Number(process.env['ROTARIS_CAPTURE_VIEW'] ?? 0);
  if (view > 0) {
    clocks.timers.after(millis(Number(process.env['ROTARIS_CAPTURE_VIEW_MS'] ?? 600)), async () => {
      const wc = win.webContents;
      wc.sendInputEvent({ type: 'keyDown', keyCode: String(view), modifiers: ['control'] });
      wc.sendInputEvent({ type: 'keyUp', keyCode: String(view), modifiers: ['control'] });
      if (view === 7) {
        await pause(host, 200);
        const rect = await wc.executeJavaScript(`(() => { const b = [...document.querySelectorAll('.nav-list__item')].find((x) => x.textContent === ${JSON.stringify(process.env['ROTARIS_CAPTURE_SETTINGS'] ?? 'Project')}); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`) as { x: number; y: number } | null;
        if (rect) clickAt(win, rect);
      }
    });
  }

  // ROTARIS_CAPTURE_MODE=<preset> at ROTARIS_CAPTURE_MODE_MS: click the mode selector's option, then the confirmation (REQ-TOOLS-077).
  const modeAt = Number(process.env['ROTARIS_CAPTURE_MODE_MS'] ?? 0);
  const modeWanted = process.env['ROTARIS_CAPTURE_MODE'];
  if (modeWanted && modeAt > 0) {
    const click = async (selector: string, text: string | null) => {
      const rect = await win.webContents.executeJavaScript(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(selector)})].find((x) => ${text === null ? 'true' : `x.textContent.trim() === ${JSON.stringify(text)}`}); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`) as { x: number; y: number } | null;
      if (!rect) { log(`capture: no "${text ?? selector}" control on screen`); return false; }
      clickAt(win, rect);
      log(`capture: clicked "${text ?? selector}"`);
      return true;
    };
    clocks.timers.after(millis(modeAt), async () => {
      // PD-CHAT-001 replaced the always-drawn segmented row with a press-revealed popover, so the three presets are
      // reached in two clicks now: the chip, then the option. The option's own text is label + hint, so the click
      // lands on `.chip-menu__label`, whose text is the preset alone. (This seam still read `.seg-opt` until Part AT;
      // `docs/defects/fixed/the-config-proof-clicks-a-control-that-became-a-popover.md`.)
      if (!(await click('[data-testid="chip-mode"] .chip-menu', null))) return;
      await pause(host, 200);
      if (!(await click('.chip-menu__panel .chip-menu__label', modeWanted))) return;
      if (modeWanted === 'autonomous') { await pause(host, 300); await click('.dialog-actions .btn-danger', 'Switch to autonomous'); }
    });
  }

  // ROTARIS_CAPTURE_CLICKS="selector>>text@ms;;…": real clicks on Settings controls, for the configuration proof.
  for (const step of steps(process.env['ROTARIS_CAPTURE_CLICKS'])) {
    onStep(host, step, async () => {
      const rect = await win.webContents.executeJavaScript(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(step.selector)})].find((x) => ${step.arg === null ? 'true' : `x.textContent.trim() === ${JSON.stringify(step.arg)}`}); if (!b) return null; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`) as { x: number; y: number } | null;
      if (!rect) { log(`capture: no "${step.arg ?? step.selector}" control on screen`); return; }
      clickAt(win, rect);
      log(`capture: clicked "${step.arg ?? step.selector}"`);
    });
  }

  // ROTARIS_CAPTURE_TYPE="text@ms;;…": real key events into whatever control holds focus, then Enter (the composer's submit, REQ-CHAT-001).
  for (const step of steps(process.env['ROTARIS_CAPTURE_TYPE'])) {
    clocks.timers.after(millis(step.at), () => {
      const wc = win.webContents;
      // `>>composer` first focuses the composer with Ctrl+L (REQ-CHAT-002); `>>no-enter` leaves the text in the focused control.
      if (step.arg === 'composer') { wc.sendInputEvent({ type: 'keyDown', keyCode: 'L', modifiers: ['control'] }); wc.sendInputEvent({ type: 'keyUp', keyCode: 'L', modifiers: ['control'] }); }
      for (const ch of step.selector) wc.sendInputEvent({ type: 'char', keyCode: ch });
      if (step.arg !== 'no-enter') { wc.sendInputEvent({ type: 'keyDown', keyCode: 'Return' }); wc.sendInputEvent({ type: 'char', keyCode: 'Return' }); wc.sendInputEvent({ type: 'keyUp', keyCode: 'Return' }); }
      log(`capture: typed "${step.selector}"`);
    });
  }

  /**
   * ROTARIS_CAPTURE_KEYS="keyCode@ms;;…": one real key press (down and up) into whatever holds focus — how the Git
   * proof drags the divider with Left after clicking it (REQ-SHELL-069).
   *
   * `keyCode>>selector@~ms` presses as soon as the selector matches, giving up at `ms` — the same opt-in deadline
   * `selector@~ms` gives a click, for the presses that have a precondition rather than an appointment. The board
   * scenario needs it: Enter opens the focused card's detail (REQ-TRACE-484), so the press is meaningless until
   * the card it is aimed at is the focused one, and the moment that happens is the model's to choose, not ours.
   */
  for (const step of steps(process.env['ROTARIS_CAPTURE_KEYS'])) {
    void (async () => {
      if (step.until) await settleAt(host, { selector: step.arg ?? '*', arg: null, at: step.at, until: true });
      else await pause(host, step.at);
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode: step.selector });
      win.webContents.sendInputEvent({ type: 'keyUp', keyCode: step.selector });
      log(`capture: key ${step.selector}`);
    })();
  }

  // Part W's seams. ROTARIS_CAPTURE_CHORDS="Ctrl+K@ms;;F1@ms;;Escape@ms": one real chord (down and up, with its
  // modifiers) into the main window — how the palette proof presses Ctrl+K, Ctrl+,, Ctrl+Return, F1 and Escape.
  for (const step of steps(process.env['ROTARIS_CAPTURE_CHORDS'])) {
    void (async () => {
      // The keys loop waits for its target; a chord does the same when `~` is used, so a press lands on a
      // state the run reaches when it reaches it rather than at an appointment the run can miss.
      if (step.until) await settleAt(host, { selector: step.selector, arg: null, at: step.at, until: true });
      else await pause(host, step.at);
      const { keyCode, modifiers } = chordEvent(step.selector);
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
      win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
      log(`capture: chord ${step.selector} at ${step.at}`);
    })();
  }

  // ROTARIS_CAPTURE_TYPE_AT="text@ms;;…": real characters into whatever holds focus (a chord alone moves no caret and
  // inserts nothing — the renderer needs the `char` event), so the proof fills the palette's filter field as a user does.
  for (const step of steps(process.env['ROTARIS_CAPTURE_TYPE_AT'])) {
    clocks.timers.after(millis(step.at), () => {
      for (const ch of step.selector) {
        win.webContents.sendInputEvent({ type: 'keyDown', keyCode: ch });
        win.webContents.sendInputEvent({ type: 'char', keyCode: ch });
        win.webContents.sendInputEvent({ type: 'keyUp', keyCode: ch });
      }
      log(`capture: type-at ${step.at} ${JSON.stringify(step.selector)}`);
    });
  }

  // ROTARIS_CAPTURE_INSPECT_AT="selector@ms;;…": every match's bounding rectangle, every attribute and its text, plus the
  // viewport and the focused element — the palette's 560×420 measured, its names read, focus return checked (REQ-SHELL-051/052).
  const inspectScript = (selector: string) => `(() => { const d = (el) => ({ tag: el.tagName.toLowerCase(), id: el.id || null, className: typeof el.className === 'string' ? el.className : null, label: el.getAttribute('aria-label'), testId: el.getAttribute('data-testid') }); return { viewport: { width: innerWidth, height: innerHeight }, active: document.activeElement ? d(document.activeElement) : null, matches: [...document.querySelectorAll(${JSON.stringify(selector)})].map((el) => { const r = el.getBoundingClientRect(); return { rect: { x: r.x, y: r.y, width: r.width, height: r.height }, attrs: Object.fromEntries([...el.attributes].map((a) => [a.name, a.value])), text: (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' ? el.value : (el.textContent || '')).trim().slice(0, 600) }; }) }; })()`;
  for (const step of steps(process.env['ROTARIS_CAPTURE_INSPECT_AT'])) {
    void (async () => {
      // The click loops wait for their element; the inspector follows the same `~` rule so a waited-for
      // measurement lands when the element exists rather than at an appointment the run may miss.
      if (step.until) await settleAt(host, { selector: step.selector, arg: null, at: step.at, until: true });
      else await pause(host, step.at);
      const found = await win.webContents.executeJavaScript(inspectScript(step.selector)).catch((cause: unknown) => ({ error: String(cause) })) as unknown;
      log(`capture: inspect-at ${step.at} ${step.selector} → ${JSON.stringify(found)}`);
    })();
  }

  // Part V's seams. ROTARIS_CAPTURE_NOTICES='<json>@ms;;…': one publication through the REAL store — the same
  // `report`/`acknowledge`/`dismiss`/`clearForRunStart` the product calls, never a shortcut to the channel — so the
  // proof exercises the queue, the record and the scoping rules rather than a stand-in for them.
  // The JSON is `{op:'report'|'acknowledge'|'dismiss'|'run-start', …}`.
  for (const step of steps(process.env['ROTARIS_CAPTURE_NOTICES'])) {
    clocks.timers.after(millis(step.at), () => {
      let parsed: Record<string, unknown>;
      try { parsed = JSON.parse(step.selector) as Record<string, unknown>; }
      catch (cause) { log(`capture: notices at ${step.at} — unreadable step: ${String(cause)}`); return; }
      const op = String(parsed['op'] ?? 'report');
      if (op === 'acknowledge') { host.notices.acknowledge(parsed['kind'] as 'info' | 'ok' | 'warn' | 'fail', String(parsed['title']), parsed['body'] === undefined ? undefined : String(parsed['body'])); log(`capture: notices at ${step.at} acknowledge ${String(parsed['title'])}`); return; }
      if (op === 'dismiss') { void host.notices.dismiss(parsed['id'] === undefined ? undefined : Number(parsed['id'])).then(() => log(`capture: notices at ${step.at} dismiss ${String(parsed['id'] ?? 'current')} → current ${host.notices.current()?.id ?? 'null'}`)); return; }
      if (op === 'run-start') { void host.notices.clearForRunStart(String(parsed['sessionId'])).then(() => log(`capture: notices at ${step.at} run-start ${String(parsed['sessionId'])} → current ${host.notices.current()?.id ?? 'null'}`)); return; }
      void host.notices.report({
        severity: (parsed['severity'] ?? 'info') as NoticeSeverity, title: String(parsed['title']),
        ...(parsed['message'] === undefined ? {} : { message: String(parsed['message']) }),
        ...(parsed['detail'] === undefined ? {} : { detail: String(parsed['detail']) }),
        ...(parsed['persistent'] === undefined ? {} : { persistent: Boolean(parsed['persistent']) }),
        ...(parsed['sessionId'] === undefined ? {} : { sessionId: String(parsed['sessionId']) }),
        ...(parsed['action'] === undefined ? {} : { action: parsed['action'] as { label: string; action: NoticeAction } }),
        ...(parsed['acknowledge'] === undefined ? {} : { acknowledge: parsed['acknowledge'] as { kind: 'info' | 'ok' | 'warn' | 'fail'; body?: string } }),
      }).then((r) => log(`capture: notices at ${step.at} report #${r.id} shown=${r.shown} → current ${host.notices.current()?.id ?? 'null'}`));
    });
  }

  // Part X's seam. ROTARIS_CAPTURE_PROMPTS="history>>text@ms;;stash>>text@ms": one saved-prompt write through the REAL
  // command — the same `prompts.push` a surface sends, so the store, the caps, the duplicate suppression and the library
  // revision are all exercised rather than stood in for. `{n}` before the text pushes n entries with the index appended,
  // which is how a proof reaches REQ-LIBRARY-139's cap without an env var per row.
  for (const step of steps(process.env['ROTARIS_CAPTURE_PROMPTS'])) {
    clocks.timers.after(millis(step.at), async () => {
      const list = step.selector === 'stash' ? 'stash' : 'history';
      const raw = step.arg ?? '';
      const repeat = /^\{(\d+)\}(.*)$/.exec(raw);
      const count = repeat ? Number(repeat[1]) : 1;
      const template = repeat ? repeat[2] ?? '' : raw;
      let failures = 0;
      for (let n = 1; n <= count; n += 1) {
        const outcome = await host.command({ kind: 'prompts.push', list, text: repeat ? `${template}${n}` : template });
        if (!outcome.ok) failures += 1;
      }
      log(`capture: prompts at ${step.at} ${list} ×${count} → ${failures === 0 ? 'ok' : `${failures} refused`}, revision ${host.libraryRevision.value}`);
    });
  }

  // ROTARIS_CAPTURE_TEXT_AT="needle@ms": whether the document's rendered text contains the needle — a keyword must be
  // matched and never displayed (REQ-SHELL-053).
  for (const step of steps(process.env['ROTARIS_CAPTURE_TEXT_AT'])) {
    clocks.timers.after(millis(step.at), async () => {
      const found = await win.webContents.executeJavaScript(`document.body.innerText.includes(${JSON.stringify(step.selector)})`).catch(() => 'error') as unknown;
      log(`capture: text-at ${step.at} ${JSON.stringify(step.selector)} → ${String(found)}`);
    });
  }

  // ROTARIS_CAPTURE_ORDER_AT="arm@ms;;read@ms": a mutation log over the document — the instant the palette left the DOM and
  // the instant the shell's view changed, in the order they happened (REQ-SHELL-052: close first, then run).
  for (const step of steps(process.env['ROTARIS_CAPTURE_ORDER_AT'])) {
    clocks.timers.after(millis(step.at), async () => {
      if (step.selector === 'arm') {
        const armed = await win.webContents.executeJavaScript(`(() => { const log = []; const t0 = performance.now(); window.__rotarisOrder = log; const shell = document.querySelector('.app-shell'); const view0 = shell?.getAttribute('data-view'); const mo = new MutationObserver((records) => { for (const r of records) { if (r.type === 'childList') for (const n of r.removedNodes) if (n.nodeType === 1 && (n.matches('[data-testid="command-palette"]') || n.querySelector('[data-testid="command-palette"]'))) log.push({ event: 'palette-removed', at: performance.now() - t0 }); if (r.type === 'attributes' && r.target === shell && r.attributeName === 'data-view') log.push({ event: 'view-changed', from: r.oldValue, to: shell.getAttribute('data-view'), at: performance.now() - t0 }); } }); mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['data-view'] }); return { armed: true, view: view0, palette: document.querySelector('[data-testid="command-palette"]') !== null }; })()`).catch((cause: unknown) => ({ error: String(cause) })) as unknown;
        log(`capture: order-at ${step.at} arm → ${JSON.stringify(armed)}`);
      } else {
        const read = await win.webContents.executeJavaScript(`({ events: window.__rotarisOrder ?? null, view: document.querySelector('.app-shell')?.getAttribute('data-view'), palette: document.querySelector('[data-testid="command-palette"]') !== null })`).catch((cause: unknown) => ({ error: String(cause) })) as unknown;
        log(`capture: order-at ${step.at} read → ${JSON.stringify(read)}`);
      }
    });
  }

  // ROTARIS_CAPTURE_RESIZE="WxH@ms": the main window resized to that content size — the 1000×680 minimum of REQ-SHELL-022.
  for (const step of steps(process.env['ROTARIS_CAPTURE_RESIZE'])) {
    clocks.timers.after(millis(step.at), () => {
      const [w, h] = step.selector.split('x').map(Number);
      if (w && h) { win.setContentSize(w, h); log(`capture: resize at ${step.at} → content ${win.getContentSize().join('×')}`); }
    });
  }

  // ROTARIS_CAPTURE_OS_INPUT="click:<selector>@ms;;type:<text>@ms;;where@ms" with ROTARIS_CAPTURE_OS_INPUT_SCRIPT=<ps1>: input
  // delivered by the OPERATING SYSTEM to the first persona window — the cursor moved over the element and a real button
  // click, real keystrokes to whatever window the host holds as foreground (only ever one of ours; the script checks) — so
  // ADR-0048's application modality is observed as the host enforces it. Injected events bypass `setEnabled(false)`
  // (they enter the renderer below the host's input block), which is why this seam exists (ADR-0048's Part W note).
  const osScript = process.env['ROTARIS_CAPTURE_OS_INPUT_SCRIPT'];
  const handleOf = (w: BrowserWindow): string => { const b = w.getNativeWindowHandle(); return b.length >= 8 ? b.readBigUInt64LE(0).toString() : String(b.readUInt32LE(0)); };
  const runOs = (args: string[]): Promise<string> => new Promise((resolve) => {
    if (!osScript) { resolve('no script'); return; }
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', osScript, ...args], { timeout: 20_000, windowsHide: true }, (error, stdout, stderr) => resolve(error ? `error: ${error.message} ${stderr}` : String(stdout).trim()));
  });
  for (const step of steps(process.env['ROTARIS_CAPTURE_OS_INPUT'])) {
    clocks.timers.after(millis(step.at), async () => {
      const e = firstPersona();
      if (!e) { log(`capture: os-input ${step.at} ${step.selector}: no persona window`); return; }
      const own = [handleOf(win), handleOf(e.win)];
      const colon = step.selector.indexOf(':');
      const op = colon === -1 ? step.selector : step.selector.slice(0, colon);
      const arg = colon === -1 ? '' : step.selector.slice(colon + 1);
      if (op === 'click') {
        const local = await e.win.webContents.executeJavaScript(`(() => { const el = document.querySelector(${JSON.stringify(arg)}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`).catch(() => null) as { x: number; y: number } | null;
        if (!local) { log(`capture: os-input ${step.at} click ${arg}: no such element in the persona window`); return; }
        const content = e.win.getContentBounds();
        const point = screen.dipToScreenPoint({ x: Math.round(content.x + local.x), y: Math.round(content.y + local.y) });
        e.win.moveTop();
        const out = await runOs(['click', String(point.x), String(point.y), own[0]!, own[1]!]);
        log(`capture: os-input ${step.at} click ${arg} at screen ${point.x},${point.y} (persona hwnd ${own[1]}, enabled=${e.win.isEnabled()}) → ${out}`);
      } else if (op === 'type') {
        const out = await runOs(['type', arg, own[0]!, own[1]!]);
        log(`capture: os-input ${step.at} type ${JSON.stringify(arg)} (persona hwnd ${own[1]}, enabled=${e.win.isEnabled()}) → ${out}`);
      } else {
        const out = await runOs(['where', '0', '0', own[0]!, own[1]!]);
        log(`capture: os-input ${step.at} where (main hwnd ${own[0]}, persona hwnd ${own[1]}, enabled=${e.win.isEnabled()}) → ${out}`);
      }
    });
  }

  // ROTARIS_CAPTURE_PNG_AT="path@ms;;…": a capture of the painted window at that time, beside the one at the end — the wait
  // header read by eye while the run still waits (Part Q's proof).
  for (const step of steps(process.env['ROTARIS_CAPTURE_PNG_AT'])) {
    void (async () => {
      // `path@~ms` waits for `ROTARIS_CAPTURE_PNG_WHEN` to be on screen first, so the picture is OF something.
      await settleAt(host, step.until ? { ...step, selector: process.env['ROTARIS_CAPTURE_PNG_WHEN'] ?? step.selector, arg: null } : step);
      const image = await win.webContents.capturePage();
      writeFileSync(step.selector, image.toPNG());
      log(`capture: png-at ${step.until ? '~' : ''}${step.at} → ${step.selector}`);
    })();
  }

  // ROTARIS_CAPTURE_PROBE_AT="selector@ms;;…": a probe taken mid-run at that time (the same JSON as the end probes), so a proof
  // can read a state that is gone by the capture — the wait header's countdown (Part Q's proof).
  for (const step of steps(process.env['ROTARIS_CAPTURE_PROBE_AT'])) {
    onStep(host, step, async () => {
      const found = await win.webContents.executeJavaScript(`(() => [...document.querySelectorAll(${JSON.stringify(step.selector)})].map((el) => ({ text: (el.textContent || '').trim().slice(0, 400), data: Object.fromEntries([...el.attributes].filter((a) => a.name.startsWith('data-') || a.name.startsWith('aria-value')).map((a) => [a.name, a.value])) })))()`) as unknown;
      // The label keeps the REQUESTED form, `~` included, so a reader of the log can tell a sampled instant
      // from a waited-for one, and `probes(log, 'probe-at <n>')` in a proof still matches what it asked for.
      log(`capture: probe-at ${step.until ? '~' : ''}${step.at} ${step.selector} → ${JSON.stringify(found)}`);
    });
  }

  // Part AC's seam. ROTARIS_CAPTURE_QUESTION_ELSEWHERE="<option>@ms": the prompt the open stepper is showing, answered from
  // ANOTHER surface — main reads the request id off the stepper and sends `answerQuestion` itself. REQ-CHAT-098 then requires
  // the modal to close programmatically without emitting a second decision, and the proof asserts exactly that by counting
  // the controls the renderer sent afterwards.
  for (const step of steps(process.env['ROTARIS_CAPTURE_QUESTION_ELSEWHERE'])) {
    clocks.timers.after(millis(step.at), async () => {
      const found = await win.webContents.executeJavaScript('(() => { const el = document.querySelector(\'[data-testid="question-stepper"]\'); return el ? { requestId: el.getAttribute("data-request"), sessionId: el.getAttribute("data-session") } : null; })()') as { requestId: string; sessionId: string } | null;
      if (!found) { log(`capture: question-elsewhere ${step.at} → no stepper on screen`); return; }
      const r = await host.runHost.request({ kind: 'session.control', request: { op: 'answerQuestion', sessionId: found.sessionId, args: { requestId: found.requestId, selected: { [step.selector]: 'answered elsewhere' }, freeform: {} } } }, millis(10_000)).catch(() => null);
      log(`capture: question-elsewhere ${step.at} ${found.requestId} → ${r && r.kind === 'control.result' ? (r.result.ok ? 'delivered' : 'false') : 'undelivered'}`);
    });
  }

  // Part AA's seam. ROTARIS_CAPTURE_DRAG_AT="selector@ms;;…": a REAL pointer selection across the matched element — press just
  // inside its top-left, move, release just inside its bottom-right — then the resulting document selection logged.
  // REQ-CHAT-075 requires selection "in every row category including rows whose body is rendered Markdown", and a Range set
  // by script would prove the document model rather than the pointer.
  for (const step of steps(process.env['ROTARIS_CAPTURE_DRAG_AT'])) {
    clocks.timers.after(millis(step.at), async () => {
      const box = await win.webContents.executeJavaScript(`(() => { const el = document.querySelector(${JSON.stringify(step.selector)}); if (!el) return null; el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })()`) as { x: number; y: number; width: number; height: number } | null;
      if (!box) { log(`capture: drag-at ${step.at} ${step.selector} → no such element`); return; }
      const from = { x: Math.round(box.x + 2), y: Math.round(box.y + 4) };
      const to = { x: Math.round(box.x + box.width - 2), y: Math.round(box.y + box.height - 4) };
      win.webContents.sendInputEvent({ type: 'mouseDown', x: from.x, y: from.y, button: 'left', clickCount: 1 });
      win.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round((from.x + to.x) / 2), y: Math.round((from.y + to.y) / 2), button: 'left' });
      win.webContents.sendInputEvent({ type: 'mouseMove', x: to.x, y: to.y, button: 'left' });
      win.webContents.sendInputEvent({ type: 'mouseUp', x: to.x, y: to.y, button: 'left', clickCount: 1 });
      await pause(host, 120);
      const selected = await win.webContents.executeJavaScript('String(document.getSelection() ?? "")') as string;
      log(`capture: drag-at ${step.at} ${step.selector} → ${JSON.stringify(selected)}`);
    });
  }

  // ROTARIS_CAPTURE_SHOT="path@ms;;…": a PNG of the main window at that time, so a proof can keep a dialog mid-flow (the
  // checkpoint proof's confirmation dialog, REQ-GIT-097); the final capture still happens at the end.
  for (const step of steps(process.env['ROTARIS_CAPTURE_SHOT'])) {
    clocks.timers.after(millis(step.at), async () => {
      try {
        // The same probes as the final capture, logged under a `shot-probe` prefix, so what the dialog showed is asserted, not eyeballed.
        for (const selector of parseSelectors(process.env['ROTARIS_CAPTURE_PROBE'])) {
          const found = await win.webContents.executeJavaScript(`(() => [...document.querySelectorAll(${JSON.stringify(selector)})].map((el) => ({ text: (el.tagName === 'TEXTAREA' ? el.value : (el.textContent || '')).trim().slice(0, 600), data: Object.fromEntries([...el.attributes].filter((a) => a.name.startsWith('data-') || a.name.startsWith('aria-') || a.name === 'disabled' || a.name === 'title').map((a) => [a.name, a.value])) })))()`) as unknown;
          log(`capture: shot-probe ${selector} → ${JSON.stringify(found)}`);
        }
        writeFileSync(step.selector, (await win.webContents.capturePage()).toPNG());
        log(`captured shot ${step.selector}`);
      } catch (cause) { log(`capture: shot ${step.selector} failed: ${String(cause)}`); }
    });
  }

  // Part R's seams. ROTARIS_CAPTURE_WINDOWS_AT="ms;;ms": the registry's persona windows — title, size, visible, minimized —
  // logged as JSON (REQ-SHELL-072/076/078). ROTARIS_CAPTURE_PERSONA_PNG_AT="path@ms" and
  // ROTARIS_CAPTURE_PERSONA_PROBE_AT="selector@ms": a capture of, and a probe inside, the FIRST persona window.
  // ROTARIS_CAPTURE_PERSONA_CLOSE_AT="ms": the user's close of that window (hides it). ROTARIS_CAPTURE_PERSONA_STEER="text@ms":
  // the steer card's text set and "Send steer" clicked inside it (REQ-MONITOR-070).
  // ROTARIS_CAPTURE_VIEWS="n@ms;;n@ms": Ctrl+n at each time — a sequence of views in one launch (the parity probes of REQ-MONITOR-038).
  for (const step of steps(process.env['ROTARIS_CAPTURE_VIEWS'])) {
    clocks.timers.after(millis(step.at), () => {
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode: step.selector, modifiers: ['control'] });
      win.webContents.sendInputEvent({ type: 'keyUp', keyCode: step.selector, modifiers: ['control'] });
      log(`capture: view ${step.selector} at ${step.at}`);
    });
  }

  /**
   * ROTARIS_CAPTURE_OPEN_AT="<sessionId>@ms;;…": the same route the resume seam takes — the title bar's "Sessions"
   * control, then that row's "Open" — repeated, so ONE process can hold three transcripts of different lengths in
   * turn. ADR-0045's element-count invariant is a within-iteration claim, so measuring it across three processes
   * would not be measuring it at all.
   */
  for (const step of steps(process.env['ROTARIS_CAPTURE_OPEN_AT'])) {
    clocks.timers.after(millis(step.at), async () => {
      const control = await centre(win, `document.querySelector('.title-bar__sessions')`);
      if (!control) { log(`capture: open-at ${step.at}: no "Sessions" control on screen`); return; }
      clickAt(win, control);
      await pause(host, 700);
      const open = await centre(win, `document.querySelector('.session-browser tr[data-session-id=${JSON.stringify(step.selector)}] button')`);
      if (!open) { log(`capture: open-at ${step.at}: no session row for "${step.selector}"`); return; }
      clickAt(win, open);
      log(`capture: open-at ${step.at} opened session "${step.selector}"`);
    });
  }

  /**
   * Part Z's seams.
   *
   * ROTARIS_CAPTURE_EVAL_AT="<expression>@ms": one expression evaluated in the renderer at that time and logged
   * as JSON. The transcript proof reads ADR-0045's structural counts, the replica's six row-level counters and
   * the apply-to-paint samples through it, and drives the scroller with it — all of which are values the product
   * already computes for itself. It reads and moves nothing a user cannot reach; the counting rule it calls
   * (`window.__rotarisCounts`) is the product's ONE definition (ADR-0045's closing obligation), not a restatement.
   *
   * `<expression>>>selector@~ms` reads as soon as the selector matches, giving up at `ms`. A reading taken at an
   * appointment is the right shape for watching a value CHANGE — which is why the plain form stays and the poll
   * schedules keep using it — and the wrong shape for reading the state left behind by something the product did
   * when it was ready: that read has a precondition, and pinning it to a clock reports whatever the clock found.
   */
  for (const step of steps(process.env['ROTARIS_CAPTURE_EVAL_AT'])) {
    void (async () => {
      if (step.until) await settleAt(host, { selector: step.arg ?? '*', arg: null, at: step.at, until: true });
      else await pause(host, step.at);
      const found = await win.webContents.executeJavaScript(`(async () => { try { return await (${step.selector}); } catch (cause) { return { error: String(cause) }; } })()`).catch((cause: unknown) => ({ error: String(cause) })) as unknown;
      log(`capture: eval-at ${step.at} ${step.selector} → ${JSON.stringify(found)}`);
    })();
  }

  /**
   * ROTARIS_CAPTURE_GAP_AT="count@ms": `count` transcript publications delivered to the window with a sequence
   * number far above the one it expects — the deliberately dropped publication of ADR-0046 consequence 2, which
   * is the only way step 0's branch is ever executed. The FIRST is the gap the surface refuses; the rest arrive
   * while it is reconciling and are dropped by the subscription handler without reaching the apply stage, which
   * is what makes exactly one `refused` and one `reset` a property of the fixture rather than of arrival timing
   * (REQ-UIBENCH-083). The payloads are well formed; only the number is wrong.
   */
  for (const step of steps(process.env['ROTARIS_CAPTURE_GAP_AT'])) {
    clocks.timers.after(millis(step.at), () => {
      const followed = host.followedSessionId();
      if (!followed) { log(`capture: gap-at ${step.at}: no session followed`); return; }
      const count = Math.max(1, Number(step.selector) || 1);
      for (let i = 0; i < count; i += 1) {
        win.webContents.send(CHANNEL.transcriptIncrement, {
          v: CONTRACT_SCHEMA_VERSION, sessionId: followed, seq: 1_000_000 + i, earliestChanged: 0, rows: [], diffs: [], personas: [],
        });
      }
      log(`capture: gap-at ${step.at} → ${count} publications numbered from 1000000`);
    });
  }

  // ROTARIS_CAPTURE_RECONCILE_AT="ms;;ms": a whole read of the followed session at that time — one publication while a chosen
  // view is visible, for REQ-MONITOR-038's refresh measurement on a stored record.
  for (const step of steps(process.env['ROTARIS_CAPTURE_RECONCILE_AT'])) {
    clocks.timers.after(millis(step.at), () => {
      const followed = host.followedSessionId();
      if (followed) { void host.command({ kind: 'session.reconcile', sessionId: followed }); log(`capture: reconcile at ${step.at}`); }
      else log(`capture: reconcile at ${step.at}: no session followed`);
    });
  }

  for (const step of steps(process.env['ROTARIS_CAPTURE_WINDOWS_AT'])) {
    clocks.timers.after(millis(step.at), () => { log(`capture: windows-at ${step.at} → ${JSON.stringify(host.personaWindows.list())}`); });
  }

  for (const step of steps(process.env['ROTARIS_CAPTURE_PERSONA_PNG_AT'])) {
    clocks.timers.after(millis(step.at), async () => {
      const e = firstPersona();
      if (!e) { log(`capture: persona-png-at ${step.at}: no persona window`); return; }
      try { writeFileSync(step.selector, (await e.win.webContents.capturePage()).toPNG()); log(`capture: persona-png-at ${step.at} → ${step.selector} ("${e.persona}")`); } catch (cause) { log(`capture: persona-png-at failed: ${String(cause)}`); }
    });
  }

  for (const step of steps(process.env['ROTARIS_CAPTURE_PERSONA_PROBE_AT'])) {
    clocks.timers.after(millis(step.at), async () => {
      const e = firstPersona();
      if (!e) { log(`capture: persona-probe-at ${step.at} ${step.selector} → null`); return; }
      const found = await e.win.webContents.executeJavaScript(`(() => [...document.querySelectorAll(${JSON.stringify(step.selector)})].map((el) => ({ text: (el.tagName === 'TEXTAREA' ? el.value : (el.textContent || '')).trim().slice(0, 400), data: Object.fromEntries([...el.attributes].filter((a) => a.name.startsWith('data-') || a.name.startsWith('aria-') || a.name === 'title').map((a) => [a.name, a.value])) })))()`).catch((cause: unknown) => `error: ${String(cause)}`) as unknown;
      log(`capture: persona-probe-at ${step.at} ${step.selector} → ${JSON.stringify(found)}`);
    });
  }

  for (const step of steps(process.env['ROTARIS_CAPTURE_PERSONA_CLOSE_AT'])) {
    clocks.timers.after(millis(step.at), () => { const e = firstPersona(); if (e) { e.win.close(); log(`capture: persona-close-at ${step.at} ("${e.persona}") → visible=${e.win.isVisible()} destroyed=${e.win.isDestroyed()}`); } else log(`capture: persona-close-at ${step.at}: no persona window`); });
  }

  for (const step of steps(process.env['ROTARIS_CAPTURE_PERSONA_STEER'])) {
    clocks.timers.after(millis(step.at), async () => {
      const e = firstPersona();
      if (!e) { log(`capture: persona-steer-at ${step.at}: no persona window`); return; }
      const done = await e.win.webContents.executeJavaScript(`(() => { const el = document.querySelector('[data-testid="persona-steer"]'); if (!el) return 'no box'; const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; setter.call(el, ${JSON.stringify(step.selector)}); el.dispatchEvent(new Event('input', { bubbles: true })); const b = document.querySelector('[data-testid="persona-send"]'); if (!b) return 'no send'; b.click(); return 'sent'; })()`).catch((cause: unknown) => `error: ${String(cause)}`) as string;
      log(`capture: persona-steer-at ${step.at} → ${done}`);
    });
  }

  // ROTARIS_CAPTURE_QUIT_MS: a user-initiated close of the main window at that time — the quit path of REQ-MONITOR-131, not the capture's exit.
  const quitAt = Number(process.env['ROTARIS_CAPTURE_QUIT_MS'] ?? 0);
  if (quitAt > 0) clocks.timers.after(millis(quitAt), () => { log('capture: closing the main window (user-initiated)'); win.close(); });

  // ROTARIS_CAPTURE_SELECT="selector>>value@ms;;…": a value chosen in a select, for the configuration proof.
  for (const step of steps(process.env['ROTARIS_CAPTURE_SELECT'])) {
    clocks.timers.after(millis(step.at), async () => {
      const done = await win.webContents.executeJavaScript(`(() => { const el = document.querySelector(${JSON.stringify(step.selector)}); if (!el) return false; const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; setter.call(el, ${JSON.stringify(step.arg ?? '')}); el.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`) as boolean;
      log(`capture: select ${step.selector} = ${step.arg ?? ''} → ${done ? 'chosen' : 'no such control'}`);
    });
  }

  // ROTARIS_CAPTURE_STOP_MS: press the stop control with a real click at its measured position (REQ-SESSION-186).
  const stopAt = Number(process.env['ROTARIS_CAPTURE_STOP_MS'] ?? 0);
  if (options.prompt && stopAt > 0) {
    clocks.timers.after(millis(stopAt), async () => {
      const rect = await win.webContents.executeJavaScript(`(() => { const b = document.querySelector('.composer__actions .btn-danger'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, label: b.textContent }; })()`) as { x: number; y: number; label: string } | null;
      if (!rect) { log('capture: no stop control on screen'); return; }
      clickAt(win, rect);
      log(`capture: clicked "${rect.label}" at ${Math.round(rect.x)},${Math.round(rect.y)}`);
    });
  }
}
