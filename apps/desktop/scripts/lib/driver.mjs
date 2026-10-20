/**
 * The driver's client half — what a proof or the `drive` CLI holds.
 *
 * One socket, one request at a time on the wire per id, every op awaited. The point of the whole seam is that a
 * step can WAIT for the condition it needs instead of being scheduled at a wall-clock offset and hoping, so the
 * client exposes `waitFor` first and everything else on top of it.
 *
 * Nothing here is product code. See `apps/desktop/src/main/driver.ts` for the seam it speaks to.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { connect as connectSocket } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { app as appDirectory, cleanEnvironment, electron, hostSwitches, mainEntry, proofIsolationEnv } from './harness.mjs';
import { drainGroup, endedHow, endOverrun, exitWithin, hasExited, logTail, trackLaunch } from './bounded-launch.mjs';

const POSIX = process.platform !== 'win32';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Wait for the launch to write its endpoint file, then read the port and the secret out of it. */
export async function readEndpoint(endpointFile, { timeoutMs = 60_000 } = {}) {
  const started = Date.now();
  for (;;) {
    if (existsSync(endpointFile)) {
      try {
        const endpoint = JSON.parse(readFileSync(endpointFile, 'utf8'));
        if (endpoint && endpoint.port) return endpoint;
      } catch { /* half-written: the next poll reads it whole */ }
    }
    if (Date.now() - started > timeoutMs) throw new Error(`the app wrote no driver endpoint at ${endpointFile} within ${timeoutMs} ms`);
    await sleep(100);
  }
}

/** A connected client. Every method resolves with the seam's value or rejects with the seam's own sentence. */
export async function connect(endpointFile, { timeoutMs = 60_000 } = {}) {
  const endpoint = await readEndpoint(endpointFile, { timeoutMs });
  const socket = await new Promise((resolve, reject) => {
    const s = connectSocket({ port: endpoint.port, host: '127.0.0.1' }, () => resolve(s));
    s.on('error', reject);
  });
  socket.setEncoding('utf8');

  const pending = new Map();
  let buffer = '';
  let nextId = 1;
  let closed = null;
  socket.on('data', (chunk) => {
    buffer += chunk;
    let newline = buffer.indexOf('\n');
    while (newline !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf('\n');
      if (line === '') continue;
      let reply;
      try { reply = JSON.parse(line); } catch { continue; }
      const waiter = pending.get(reply.id);
      if (!waiter) continue;
      pending.delete(reply.id);
      if (reply.ok) waiter.resolve(reply.value);
      else waiter.reject(new Error(reply.error ?? 'the driver refused without a reason'));
    }
  });
  const fail = (cause) => {
    closed = cause;
    for (const [, waiter] of pending) waiter.reject(cause);
    pending.clear();
  };
  socket.on('close', () => fail(new Error('the driver connection closed')));
  socket.on('error', (cause) => fail(cause instanceof Error ? cause : new Error(String(cause))));

  const send = (op, args = {}) => {
    if (closed) return Promise.reject(closed);
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      socket.write(`${JSON.stringify({ id, token: endpoint.token, op, ...args })}\n`);
    });
  };

  return {
    endpoint,
    send,
    ping: () => send('ping'),
    /**
     * A4: the main windows open, most recently focused first — what a two-window assertion reads — and, under
     * `auxiliary`, each one's persona windows, open approval dialog and terminal window by their role selectors.
     */
    windows: () => send('windows'),
    /**
     * A4: point every op after this one at a window, by index, by a suffix of its workspace path, or by a role —
     * `persona:<persona>`, `approval`, `terminal`, `auth-recovery`. Pass nothing to go back to the active window. A selector matching no
     * window is refused, not ignored. Any op's options may carry `window` instead, for that op alone.
     */
    useWindow: (which) => send('useWindow', which === undefined ? {} : { window: String(which) }),
    waitFor: (selector, options = {}) => send('waitFor', { selector, ...options }),
    click: (selector, options = {}) => send('click', { selector, ...options }),
    type: (text, options = {}) => send('type', { text, ...options }),
    chord: (chord) => send('chord', { chord }),
    inspect: (selector) => send('inspect', { selector }),
    probe: (selector) => send('probe', { selector }),
    eval: (expression) => send('eval', { expression }),
    deferProjectOffer: (delayMs = 650) => send('deferProjectOffer', { delayMs }),
    screenshot: (path) => send('screenshot', { path }),
    resize: (width, height) => send('resize', { width, height }),
    command: (request) => send('command', { request }),
    /** The host's close of the selected window (`BrowserWindow.close()`: Alt+F4, the taskbar), guarded as a person's close. */
    closeWindow: () => send('closeWindow'),
    /**
     * The application's quit — `app.quit()`, the run host's `shutdown` with it — or, with `{ immediate: true }`, the
     * immediate exit, which leaves a live run as a crash leaves it. Resolves with the seam's `{ quitting, how }`, or
     * `undefined` when the connection went first.
     */
    quit: (options = {}) => send('quit', options.immediate === true ? { immediate: true } : {}).catch(() => undefined),
    close: () => { socket.destroy(); },
  };
}

/**
 * Launch the built app with the driver listening, and return a connected client.
 *
 * `detached` keeps the app alive after the caller exits — what the CLI's `start` needs and a proof never wants.
 * The log is a file rather than a pipe because the app outlives the process that started it.
 *
 * `cwd` is the directory the launch runs in, `apps/desktop` unless the caller names one. A launch with no `workspace`
 * (or a remembered one that is gone) opens it (REQ-SHELL-010 (c), REQ-WORKSPACE-007), so such a launch names a directory
 * of its own, emptied and in no repository (`lib/working-directory.mjs`), and never runs here: here it opened the
 * checkout's `apps/desktop` and set up code intelligence in the product's source
 * (`docs/defects/fixed/workspace-proof-and-updater-proof-launches-with-no-workspace-argument-open-the-checkout.md`).
 */
export async function startApp({ root, workspace, cwd = appDirectory, extra = {}, electronArgs = [], detached = false, dialect = 'scripted', timeoutMs = 60_000 }) {
  mkdirSync(root, { recursive: true });
  const endpointFile = join(root, 'endpoint.json');
  const logFile = join(root, 'app.log');
  rmSync(endpointFile, { force: true });
  const local = join(root, 'local');
  const preferences = join(root, 'preferences');
  mkdirSync(local, { recursive: true });
  mkdirSync(preferences, { recursive: true });

  const out = openSync(logFile, 'a');
  // On POSIX every launch leads its own process group, so the launch can be ended as a whole — what its main process
  // leaves running is drained at its end (`stopApp`, `drainGroup`) and SIGKILLed at the proof's exit or on a fatal signal
  // (`trackLaunch`). Until 2026-10-07 a proof's launch shared the proof's group and a proof exited beside its zygotes
  // and a Git view's `git diff` (finacc3 A2-19, `docs/defects/fixed/a-proof-exits-while-processes-of-the-app-it-launched-still-run.md`).
  const group = detached || POSIX;
  const env = {
    ...cleanEnvironment(),
    ...proofIsolationEnv({ profileRoot: root, local, preferences }),
    ROTARIS_MODEL_DIALECT: dialect,
    ROTARIS_DRIVER: endpointFile,
    ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    ...extra,
  };
  const child = spawn(electron, [mainEntry, ...hostSwitches, ...electronArgs, ...(workspace ? [workspace] : [])], {
    cwd,
    detached: group,
    windowsHide: false,
    stdio: ['ignore', out, out],
    env,
  });
  if (detached) child.unref();
  // The environment marks what the launch starts in groups of its own, so its drain reaches them too (`drainGroup`).
  else trackLaunch(child, env);
  writeFileSync(join(root, 'app.pid'), `${child.pid}\n`);

  const driver = await connectOrEnd(child, endpointFile, logFile, { timeoutMs, group });
  return { child, driver, endpointFile, logFile, local, preferences };
}

/**
 * Connect to a launch's driver, or END the launch and say so. A launch whose driver never answers is not left running:
 * a non-detached child holds the proof's event loop open, so the proof would hang at its end with the application
 * still up beside it. `endOverrun` ends it (SIGTERM, `graceMs`, SIGKILL — to its group when `group`) before the
 * failure is thrown, and the failure carries what ended it and the log's last lines.
 */
export async function connectOrEnd(child, endpointFile, logFile, { timeoutMs = 60_000, graceMs = 10_000, group = false } = {}) {
  try {
    return await connect(endpointFile, { timeoutMs });
  } catch (cause) {
    const ended = hasExited(child) ? null : await endOverrun(child, { graceMs, group });
    if (group) await drainGroup(child);
    const fate = ended
      ? `the launch was ended: ${endedHow(ended)}`
      : `the launch had already exited ${child.exitCode ?? child.signalCode}`;
    const tail = existsSync(logFile) ? logTail(readFileSync(logFile, 'utf8'), 20) : '(no log)';
    throw new Error(`${cause.message}; ${fate}\n--- the app's last words ---\n${tail}`);
  }
}

/**
 * `{ value }` or `{ error }` once `pending` settles, or `null` when `ms` passes first — a bound on one driver request,
 * whose socket may be connected to a main process that no longer answers.
 */
export function within(pending, ms) {
  let timer;
  return Promise.race([
    Promise.resolve(pending).then((value) => ({ value }), (error) => ({ error })),
    new Promise((resolve) => { timer = setTimeout(() => resolve(null), ms); }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * End a driven launch within a bound, whatever the main process does. With `screenshot`, the closing picture is asked
 * for first, at most `quitMs`; then the driver's `quit`, at most `quitMs`; then at most `graceMs` for the process to
 * exit. One that has not exited by then — because it did not answer, or answered and stayed — is ENDED (`endOverrun`:
 * SIGTERM, the same grace, SIGKILL) and the result says so: a proof reports `overran` as a failure
 * (`stopOverrunMessage`) rather than moving on with an application still running beside the next launch. No step here
 * waits without a bound, so the whole ending is at most `2 × quitMs + 2 × graceMs` and the SIGKILL's reaping.
 */
export async function stopApp(started, { graceMs = 15_000, quitMs = 10_000, screenshot } = {}) {
  let pictured = null;
  if (screenshot) {
    const shot = await within(started.driver.screenshot(screenshot), quitMs);
    pictured = shot === null ? `unanswered within ${quitMs} ms` : shot.error ? `refused: ${shot.error.message ?? shot.error}` : 'taken';
  }
  const quit = await within(started.driver.quit(), quitMs);
  started.driver.close();
  const quitAnswered = quit !== null;
  const exit = await exitWithin(started.child, graceMs);
  if (exit) return { exit, overran: null, quitAnswered, screenshot: pictured, group: await drainGroup(started.child) };
  const ended = await endOverrun(started.child, { graceMs, group: POSIX });
  return { exit: ended.exit, overran: { quitAnswered, quitMs, afterQuitMs: graceMs, ...ended }, quitAnswered, screenshot: pictured, group: await drainGroup(started.child) };
}

/**
 * End a driven launch the proof has already asked to quit (or given up on): at most `graceMs` for the main process to
 * exit, SIGTERM then SIGKILL to its group if it does not, then the rest of its group drained (`drainGroup`). For a
 * proof's own `finally`, where `stopApp`'s screenshot and quit request have no place. Resolves with the drain's account.
 */
export async function endLaunch(child, { graceMs = 10_000 } = {}) {
  if (!hasExited(child) && (await exitWithin(child, graceMs)) === null) await endOverrun(child, { graceMs, group: POSIX });
  return drainGroup(child);
}

/** The sentence a proof throws for a driven launch `stopApp` had to end: what the quit did, what ended it, its last words. */
export function stopOverrunMessage(name, stopped, log) {
  const o = stopped.overran;
  const quit = o.quitAnswered
    ? `did not exit within ${o.afterQuitMs} ms of the driver's quit`
    : `did not answer the driver's quit within ${o.quitMs} ms, nor exit ${o.afterQuitMs} ms after it`;
  return `${name} ${quit}: ${endedHow(o)}.\n--- the launch's last words ---\n${logTail(log)}`;
}

/**
 * Poll `probe` (async, any value) until `accept(value)` holds, or throw at `timeoutMs` naming `what` and the last value
 * seen — the waiting primitive for a condition that is not one selector: a store row, a probe's attribute, an absence.
 * An aborted `signal` ends the wait at its next poll, so a caller that has given up on a launch does not leave it polling.
 */
export async function until(probe, accept, { timeoutMs = 15_000, intervalMs = 150, what = 'the condition', signal } = {}) {
  const started = Date.now();
  let last;
  for (;;) {
    if (signal?.aborted) throw new Error(`${what}: abandoned (${signal.reason instanceof Error ? signal.reason.message : String(signal.reason ?? 'aborted')})`);
    try { last = await probe(); } catch (cause) { last = { error: cause instanceof Error ? cause.message : String(cause) }; }
    if (accept(last)) return last;
    if (Date.now() - started > timeoutMs) throw new Error(`${what} did not hold within ${timeoutMs} ms; last seen ${JSON.stringify(last)?.slice(0, 600)}`);
    await sleep(intervalMs);
  }
}

/**
 * A real click that is known to have reached its target: the driver's settled click (`settle: true` — pressed once the
 * match holds still and is the element at its own centre, and refused when the press met something else), repeated
 * only when a press is refused for not landing, up to `attempts` presses in all. Any other refusal — nothing matched,
 * a match that never settled — is thrown at once. Resolves with the driver's reply and every press that missed, so a
 * proof can say a click needed a second press rather than hide it
 * (`docs/defects/fixed/driver-proof-clicks-pop-out-at-a-box-the-notice-banner-moves.md`).
 */
export async function clickLanded(driver, selector, { text, timeoutMs = 15_000, attempts = 3 } = {}) {
  const missed = [];
  for (;;) {
    try {
      const reply = await driver.click(selector, { ...(text === undefined ? {} : { text }), timeoutMs, settle: true });
      return { ...reply, missed };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      if (!/ did not land: /.test(message)) throw cause;
      missed.push(message);
      if (missed.length >= attempts) throw new Error(`${missed.length} press(es) on ${JSON.stringify(selector)} did not land: ${missed.join(' / ')}`);
    }
  }
}

/**
 * Choose `value` in the control at `selector`, whichever of the product's two chooser kinds it is — waiting for it
 * first. A native `<select>` takes the value through the prototype setter and a `change` event (what React listens
 * to), and the choice is confirmed once the control shows it; the design system's `SearchableSelect` is a button and a listbox, so it is driven as a person drives it: a real
 * click on the trigger, then a real click on the `[role="option"]` carrying the wanted `data-value`, each waiting for
 * its control. Resolves with the kind driven; rejects when the control, or the option, never appears.
 */
export async function choose(driver, selector, value, { timeoutMs = 15_000 } = {}) {
  await driver.waitFor(selector, { timeoutMs });
  const kind = await driver.eval(`document.querySelector(${JSON.stringify(selector)}) instanceof HTMLSelectElement ? 'native' : 'design-system'`);
  if (kind === 'native') {
    const chosen = await driver.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (![...el.options].some((o) => o.value === ${JSON.stringify(value)})) return 'no such option';
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return 'dispatched';
    })()`);
    if (chosen !== 'dispatched') throw new Error(`${selector} offers no ${JSON.stringify(value)}`);
    // A CONTROLLED select snaps back to its prop on the same turn and shows the choice only once the product's own
    // state has taken it — so the choice is confirmed by waiting for that, not by reading the element straight away.
    await until(() => driver.eval(`document.querySelector(${JSON.stringify(selector)})?.value ?? null`), (v) => v === value, { timeoutMs, what: `${selector} showing ${JSON.stringify(value)}` });
    return { kind, value };
  }
  await driver.click(selector, { timeoutMs });
  await driver.click(`[role="option"][data-value=${JSON.stringify(value)}]`, { timeoutMs });
  return { kind, value };
}
