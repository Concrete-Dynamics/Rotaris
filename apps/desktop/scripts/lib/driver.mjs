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
    /** A4: the main windows open, most recently focused first — what a two-window assertion reads. */
    windows: () => send('windows'),
    /**
     * A4: point every op after this one at a window, by index or by a suffix of its workspace path. Pass
     * nothing to go back to the active window. A selector matching no window is refused, not ignored.
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
    quit: () => send('quit').catch(() => undefined),
    close: () => { socket.destroy(); },
  };
}

/**
 * Launch the built app with the driver listening, and return a connected client.
 *
 * `detached` keeps the app alive after the caller exits — what the CLI's `start` needs and a proof never wants.
 * The log is a file rather than a pipe because the app outlives the process that started it.
 */
export async function startApp({ root, workspace, extra = {}, electronArgs = [], detached = false, dialect = 'scripted', timeoutMs = 60_000 }) {
  mkdirSync(root, { recursive: true });
  const endpointFile = join(root, 'endpoint.json');
  const logFile = join(root, 'app.log');
  rmSync(endpointFile, { force: true });
  const local = join(root, 'local');
  const preferences = join(root, 'preferences');
  mkdirSync(local, { recursive: true });
  mkdirSync(preferences, { recursive: true });

  const out = openSync(logFile, 'a');
  const child = spawn(electron, [mainEntry, ...hostSwitches, ...electronArgs, ...(workspace ? [workspace] : [])], {
    cwd: appDirectory,
    detached,
    windowsHide: false,
    stdio: ['ignore', out, out],
    env: {
      ...cleanEnvironment(),
      ...proofIsolationEnv({ profileRoot: root, local, preferences }),
      ROTARIS_MODEL_DIALECT: dialect,
      ROTARIS_DRIVER: endpointFile,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      ...extra,
    },
  });
  if (detached) child.unref();
  writeFileSync(join(root, 'app.pid'), `${child.pid}\n`);

  const driver = await connect(endpointFile, { timeoutMs }).catch((cause) => {
    const tail = existsSync(logFile) ? readFileSync(logFile, 'utf8').split('\n').slice(-20).join('\n') : '(no log)';
    throw new Error(`${cause.message}\n--- the app's last words ---\n${tail}`);
  });
  return { child, driver, endpointFile, logFile, local, preferences };
}
