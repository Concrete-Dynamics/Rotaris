import { createServer, type Server, type Socket } from 'node:net';
import { randomBytes } from 'node:crypto';
import { rmSync, writeFileSync } from 'node:fs';
import { millis, type MonotonicClock, type Timers } from '@rotaris/kernel';
import type { BrowserWindow } from 'electron';
import type { CommandOutcome } from '@rotaris/contracts';

/**
 * THE DRIVER — a request/reply seam for the proofs and for a person (or an agent) debugging the built app.
 * Verification only; it is not a product surface and no requirement names it.
 *
 * **Why it exists.** The sixty-seven `ROTARIS_CAPTURE_*` seams beside it all share one shape: a step is
 * scheduled at a wall-clock offset (`selector>>text@1500`), fired at whatever the window happens to be showing
 * then, and read back by grepping the log. That shape cannot wait for anything, so every proof that uses it
 * encodes a guess about how long the machine will take. Three recorded reds were that guess being wrong on a
 * loaded machine and nothing else — the Git proof probing 1.2 s after a create that was still in flight is the
 * clearest. A step that can WAIT for the condition it needs cannot fail that way, which is the whole of this
 * file's reason: `waitFor` is the mechanism, and the ops are what became possible once replies existed.
 *
 * **What it is not.** It is not a second way to reach product behaviour. `command` relays the SAME
 * `runCommand` the renderer's channel reaches, so a proof that drives a command drives the product's own path;
 * everything else here moves a pointer, presses a key, or reads the document the user is looking at.
 *
 * **The token is not decoration.** This listens on a loopback socket and `eval` runs arbitrary script in the
 * renderer, so without one, any process on the machine could drive a window the user has signed into. The
 * secret is minted per launch and written to the endpoint file, which the OS protects by the profile it sits
 * in; a request without it is refused and the connection dropped. The seam is reachable only when
 * `ROTARIS_DRIVER` names a path at launch — the packaged app carries the code and never listens.
 */

export interface DriverDeps {
  /** The window the driver acts on; `null` once it is gone, which every op reports rather than throwing. */
  window: () => BrowserWindow | null;
  timers: Timers;
  monotonic: MonotonicClock;
  log: (message: string) => void;
  /** The product's own command path — the same function the renderer's channel reaches. */
  command: (request: unknown) => Promise<CommandOutcome>;
  quit: () => void;
}

export interface Driver {
  close(): void;
}

interface Request {
  id?: number;
  token?: string;
  op?: string;
  selector?: string;
  text?: string;
  expression?: string;
  path?: string;
  chord?: string;
  enter?: boolean;
  width?: number;
  height?: number;
  timeoutMs?: number;
  request?: unknown;
}

/** A rectangle the renderer measured, and what the element said. */
interface Found {
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const POLL_MS = 100;

/**
 * The one locator. A match is the first element matching `selector` — and, where `text` is given, whose trimmed
 * text is exactly that — with a non-zero box. Zero-size is not a match because a control in a collapsed panel is
 * present in the document and cannot be clicked: a driver that clicked it would report a success the user could
 * not have had.
 */
function locateScript(selector: string, text: string | undefined): string {
  const match = text === undefined ? 'true' : `(element.textContent || '').trim() === ${JSON.stringify(text)}`;
  return `(() => {
    const element = [...document.querySelectorAll(${JSON.stringify(selector)})].find((element) => ${match});
    if (!element) return null;
    element.scrollIntoView({ block: 'center', inline: 'nearest' });
    const r = element.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return null;
    return { x: r.x, y: r.y, width: r.width, height: r.height, text: (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' ? element.value : (element.textContent || '')).trim().slice(0, 600) };
  })()`;
}

/** The inspect payload: every match's box, attributes and text, plus the viewport and what holds focus. */
function inspectScript(selector: string): string {
  return `(() => {
    const describe = (el) => ({ tag: el.tagName.toLowerCase(), id: el.id || null, className: typeof el.className === 'string' ? el.className : null, label: el.getAttribute('aria-label'), testId: el.getAttribute('data-testid') });
    return {
      viewport: { width: innerWidth, height: innerHeight },
      active: document.activeElement ? describe(document.activeElement) : null,
      matches: [...document.querySelectorAll(${JSON.stringify(selector)})].map((el) => {
        const r = el.getBoundingClientRect();
        return { rect: { x: r.x, y: r.y, width: r.width, height: r.height }, attrs: Object.fromEntries([...el.attributes].map((a) => [a.name, a.value])), text: (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' ? el.value : (el.textContent || '')).trim().slice(0, 600) };
      }),
    };
  })()`;
}

/** The probe payload the `*-proof` scripts already read: text, value where a control has one, and the data/aria attributes. */
function probeScript(selector: string): string {
  return `(() => [...document.querySelectorAll(${JSON.stringify(selector)})].map((el) => ({ text: (el.textContent || '').trim().slice(0, 400), ...('value' in el && (el.tagName === 'SELECT' || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') ? { value: String(el.value) } : {}), data: Object.fromEntries([...el.attributes].filter((a) => a.name.startsWith('data-') || a.name.startsWith('aria-')).map((a) => [a.name, a.value])) })))()`;
}

/** `Ctrl+Shift+K`, and `Ctrl++` for the key that is itself a plus. The same parse the capture seams use. */
function chordEvent(chord: string): { keyCode: string; modifiers: ('control' | 'shift' | 'alt')[] } {
  const parts = chord.endsWith('++') ? [...chord.slice(0, -2).split('+'), '+'] : chord.split('+');
  const modifiers: ('control' | 'shift' | 'alt')[] = [];
  let keyCode = '';
  for (const part of parts) {
    if (part === 'Ctrl') modifiers.push('control');
    else if (part === 'Shift') modifiers.push('shift');
    else if (part === 'Alt') modifiers.push('alt');
    else keyCode = part;
  }
  return { keyCode, modifiers };
}

export function startDriver(endpointFile: string, deps: DriverDeps): Driver {
  const token = randomBytes(16).toString('hex');
  const sockets = new Set<Socket>();

  /**
   * Drop the listener and the endpoint file.
   *
   * **The first execution found this in the wrong place** (2026-09-11, `pnpm driver-proof`): it hung on
   * `app.on('will-quit')` alone, and `app.exit()` — which is how the `quit` op ends the process, and how every
   * capture seam beside it ends one — emits NO `will-quit` and no `quit`. The file therefore outlived the
   * process it described, so the next `pnpm app:drive` command read a port nothing was listening on and failed
   * with a connection error instead of "no app is being driven". The falsified assumption is kept here rather
   * than repaired quietly: an Electron exit path is not one path, and a cleanup that matters must be called by
   * the op that knows it is ending as well as hung on the event that usually fires.
   */
  const cleanup = (): void => {
    for (const socket of sockets) socket.destroy();
    server.close();
    try { rmSync(endpointFile, { force: true }); } catch { /* the endpoint file is evidence, not state; its removal never fails a run */ }
  };

  const windowOrThrow = (): BrowserWindow => {
    const win = deps.window();
    if (!win || win.isDestroyed()) throw new Error('the main window is gone');
    return win;
  };

  const evaluate = async (script: string): Promise<unknown> => windowOrThrow().webContents.executeJavaScript(script) as Promise<unknown>;

  /** Poll until the selector matches or the deadline passes. The ONE waiting primitive; every other wait is this one. */
  const waitFor = (selector: string, text: string | undefined, timeoutMs: number): Promise<Found & { waitedMs: number }> =>
    new Promise((resolve, reject) => {
      const started = deps.monotonic.now();
      let inFlight = false;
      const poll = deps.timers.every(millis(POLL_MS), () => {
        if (inFlight) return;
        inFlight = true;
        void evaluate(locateScript(selector, text))
          .then((found) => {
            inFlight = false;
            if (found !== null && found !== undefined) {
              poll.cancel();
              resolve({ ...(found as Found), waitedMs: Math.round(deps.monotonic.now() - started) });
              return;
            }
            if (deps.monotonic.now() - started > timeoutMs) {
              poll.cancel();
              reject(new Error(`nothing matched ${JSON.stringify(selector)}${text === undefined ? '' : ` with text ${JSON.stringify(text)}`} within ${timeoutMs} ms`));
            }
          })
          .catch((cause: unknown) => {
            inFlight = false;
            poll.cancel();
            reject(cause instanceof Error ? cause : new Error(String(cause)));
          });
      });
    });

  const clickAt = (x: number, y: number): void => {
    const wc = windowOrThrow().webContents;
    wc.sendInputEvent({ type: 'mouseMove', x, y });
    wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
    wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
  };

  const handle = async (request: Request): Promise<unknown> => {
    const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    switch (request.op) {
      case 'ping':
        return { pid: process.pid, window: deps.window() !== null };
      case 'waitFor': {
        if (!request.selector) throw new Error('waitFor needs a selector');
        return waitFor(request.selector, request.text, timeoutMs);
      }
      case 'click': {
        if (!request.selector) throw new Error('click needs a selector');
        const found = await waitFor(request.selector, request.text, timeoutMs);
        const x = Math.round(found.x + found.width / 2);
        const y = Math.round(found.y + found.height / 2);
        clickAt(x, y);
        return { x, y, text: found.text, waitedMs: found.waitedMs };
      }
      case 'type': {
        const wc = windowOrThrow().webContents;
        // `keyDown` + `char` + `keyUp` per character: a chord alone moves no caret and inserts nothing, and the
        // renderer needs the `char` event — the same lesson the type-at seam carries.
        for (const ch of request.text ?? '') {
          wc.sendInputEvent({ type: 'keyDown', keyCode: ch });
          wc.sendInputEvent({ type: 'char', keyCode: ch });
          wc.sendInputEvent({ type: 'keyUp', keyCode: ch });
        }
        if (request.enter === true) {
          wc.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
          wc.sendInputEvent({ type: 'char', keyCode: 'Return' });
          wc.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
        }
        return { typed: (request.text ?? '').length, enter: request.enter === true };
      }
      case 'chord': {
        if (!request.chord) throw new Error('chord needs a chord');
        const { keyCode, modifiers } = chordEvent(request.chord);
        const wc = windowOrThrow().webContents;
        wc.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
        wc.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
        return { chord: request.chord };
      }
      case 'inspect': {
        if (!request.selector) throw new Error('inspect needs a selector');
        return evaluate(inspectScript(request.selector));
      }
      case 'probe': {
        if (!request.selector) throw new Error('probe needs a selector');
        return evaluate(probeScript(request.selector));
      }
      case 'eval': {
        if (!request.expression) throw new Error('eval needs an expression');
        return evaluate(`(async () => { try { return await (${request.expression}); } catch (cause) { return { error: String(cause) }; } })()`);
      }
      case 'screenshot': {
        if (!request.path) throw new Error('screenshot needs a path');
        const image = await windowOrThrow().webContents.capturePage();
        writeFileSync(request.path, image.toPNG());
        return { path: request.path };
      }
      case 'resize': {
        const win = windowOrThrow();
        if (!request.width || !request.height) throw new Error('resize needs a width and a height');
        win.setContentSize(request.width, request.height);
        const [width, height] = win.getContentSize();
        return { width, height };
      }
      case 'command':
        return deps.command(request.request);
      case 'quit':
        // The reply goes out first, then the seam takes itself down, then the process ends. In that order: a
        // client that is told "quitting" and then finds the endpoint file still there has been told a falsehood.
        deps.timers.after(millis(50), () => { cleanup(); deps.quit(); });
        return { quitting: true };
      default:
        throw new Error(`unknown op ${JSON.stringify(request.op ?? '')}`);
    }
  };

  const server: Server = createServer((socket) => {
    sockets.add(socket);
    socket.setEncoding('utf8');
    let buffer = '';
    socket.on('data', (chunk: string) => {
      buffer += chunk;
      let newline = buffer.indexOf('\n');
      while (newline !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf('\n');
        if (line === '') continue;
        let request: Request;
        try { request = JSON.parse(line) as Request; }
        catch (cause) { socket.write(`${JSON.stringify({ ok: false, error: `unreadable request: ${String(cause)}` })}\n`); continue; }
        if (request.token !== token) {
          deps.log('driver: a request arrived without the launch secret; the connection was dropped');
          socket.write(`${JSON.stringify({ id: request.id ?? null, ok: false, error: 'the launch secret did not match' })}\n`);
          socket.destroy();
          return;
        }
        const id = request.id ?? null;
        void handle(request)
          .then((value) => { socket.write(`${JSON.stringify({ id, ok: true, value })}\n`); deps.log(`driver: ${request.op ?? '?'} ${request.selector ?? request.chord ?? ''} → ok`); })
          .catch((cause: unknown) => {
            const error = cause instanceof Error ? cause.message : String(cause);
            socket.write(`${JSON.stringify({ id, ok: false, error })}\n`);
            deps.log(`driver: ${request.op ?? '?'} ${request.selector ?? request.chord ?? ''} → ${error}`);
          });
      }
    });
    socket.on('error', () => socket.destroy());
    socket.on('close', () => sockets.delete(socket));
  });

  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    const port = address !== null && typeof address === 'object' ? address.port : 0;
    writeFileSync(endpointFile, `${JSON.stringify({ port, pid: process.pid, token })}\n`);
    deps.log(`driver: listening on 127.0.0.1:${port}; endpoint ${endpointFile}`);
  });

  return { close: cleanup };
}
