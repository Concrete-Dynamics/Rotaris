import { createServer, type Server, type Socket } from 'node:net';
import { randomBytes } from 'node:crypto';
import { rmSync, writeFileSync } from 'node:fs';
import { millis, type MonotonicClock, type Timers } from '@rotaris/kernel';
import type { BrowserWindow } from 'electron';
import type { CommandOutcome } from '@rotaris/contracts';
import { inputEvent, submitEvents, textEvents } from './capture/probe.js';

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

/**
 * A window the driver can address that is not a main window
 * (`docs/defects/fixed/the-driver-cannot-address-persona-or-approval-windows.md`): a persona window (ADR-0048,
 * REQ-SHELL-072), the approval dialog a main window holds open (REQ-TOOLS-063), its terminal window (ADR-0047), or the
 * authentication recovery dialog presented over it (REQ-NOTIFY-072).
 */
export interface AuxiliaryWindow {
  /** What `window` and `useWindow` name it by: `persona:<persona>`, `approval`, `terminal` or `auth-recovery`. */
  readonly selector: string;
  readonly role: 'persona' | 'approval' | 'terminal' | 'auth-recovery';
  /** The main window it belongs to, by its index in `windows`. */
  readonly owner: number;
  readonly wcId: number;
  readonly visible: boolean;
  readonly win: BrowserWindow;
}

/** Whether a selector names an auxiliary window's role rather than a main window. */
export function namesAuxiliary(which: string): boolean {
  return which === 'approval' || which === 'terminal' || which === 'auth-recovery' || which.startsWith('persona:');
}

export interface DriverDeps {
  /**
   * The main window the driver acts on; `null` when the selector names none, which every op reports rather than
   * throwing. `which` is an index into the most-recently-focused ordering or a suffix of a window's workspace
   * path; absent means the active window, which is what every proof written before two windows existed meant.
   */
  window: (which?: string) => BrowserWindow | null;
  /** Every main window open, in that same order — what a proof asserting on two windows reads. */
  windows: () => readonly { readonly index: number; readonly workspace: string; readonly wcId: number }[];
  /**
   * Every auxiliary window open, main window by main window in that same order. A role selector (`persona:<name>`,
   * `approval`, `terminal`) resolves to the first one listed under it, so the active main window's comes first.
   */
  auxiliary: () => readonly AuxiliaryWindow[];
  timers: Timers;
  monotonic: MonotonicClock;
  log: (message: string) => void;
  /** The product's own command path — the same function the renderer's channel reaches. */
  command: (request: unknown, win: BrowserWindow) => Promise<CommandOutcome>;
  /** Verification only: arm REQ-SHELL-011's deferred offer for the selected main window. */
  deferProjectOffer: (win: BrowserWindow, delayMs: number) => void;
  /**
   * The application's quit — `app.quit()`, the path a person's quit takes: every main window closed through its close
   * guard, then `window-all-closed` asks the run host and each workspace service to `shutdown`, so a live run comes to
   * rest as PD-ORCH-005 clause 3 says a quit leaves it. What `quit` sends unless it is asked for the immediate exit.
   */
  quit: () => void;
  /**
   * The immediate exit (`exitCleanly`, the capture seam's): the run host is asked nothing and ended at once, so a live
   * run is left as a crash leaves it. Kept for a drive that means to leave that state (`quit` with `immediate`).
   */
  exit: () => void;
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
  /** A4: which window an op acts on, and what `useWindow` selects for the ops after it — a main or an auxiliary one. */
  window?: string;
  /** `quit` only: the immediate exit rather than the application's quit. */
  immediate?: boolean;
  enter?: boolean;
  /**
   * `click` only: click once the match has held still and is the element at its own centre, then confirm that the press
   * landed on it, and fail when it did not (`docs/defects/fixed/driver-proof-clicks-pop-out-at-a-box-the-notice-banner-moves.md`).
   */
  settle?: boolean;
  width?: number;
  height?: number;
  timeoutMs?: number;
  delayMs?: number;
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
/** How long `screenshot` waits for the renderer to present a frame before it captures regardless, and says so. */
export const PAINT_BOUND_MS = 1_000;

/**
 * How many frames `screenshot` lets the renderer begin before it captures. A frame the document has already changed for
 * is not on screen when the NEXT frame begins: it is committed, then rastered, activated, drawn and submitted, and
 * `capturePage()` copies what was last submitted. Measured 2026-09-29 on this Linux host (Xvfb, software compositing),
 * a shot straight after the first navigation to the Workspace — the heaviest first paint the rail has — in fresh
 * launches, with the document already showing the Workspace when the wait began: after one frame the shot still showed
 * the Overview in 16 launches of 20, after two in 12 of 52, after three in none of 40 on a quiet machine but 1 of 20
 * with three of the four cores busy, and after four in none of 55 (20 quiet, 20 with three cores busy, 15 at a load
 * average near 20). Four is taken. It is a count of frames and not of milliseconds, so a loaded machine's slower frames
 * lengthen it by themselves.
 */
export const PAINT_FRAMES = 4;

/** Resolves once the renderer has begun `PAINT_FRAMES` frames after the call. Evaluated in the window before a capture. */
export const PAINTED_SCRIPT = `new Promise((resolve) => { let left = ${PAINT_FRAMES}; const frame = () => { left -= 1; if (left === 0) resolve(true); else requestAnimationFrame(frame); }; requestAnimationFrame(frame); })`;

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

/** How many frames a settled click's target must hold the same box across before it is pressed. */
export const SETTLE_FRAMES = 2;
/**
 * The longest one of those frames is waited for. A window that is not painting (hidden, or occluded on some hosts)
 * begins no frame, and a settle measurement waiting on one would never answer, holding the poll and its timeout with it;
 * past this bound the second measurement is taken anyway, so the box is still compared across time.
 */
export const SETTLE_FRAME_BOUND_MS = 100;

/** A short description of an element, for a click that met something other than its target. */
const DESCRIBE_ELEMENT = `(el) => el ? (el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\\s+/).join('.') : '') + ((el.textContent || '').trim() ? ' "' + (el.textContent || '').trim().slice(0, 40) + '"' : '')) : 'nothing'`;

/**
 * A settled click's measurement (`settle: true`). The plain locator measures once, and `click` presses at that box's
 * centre some milliseconds later; when the document above the target changes in between, the press lands on whatever
 * moved under it. Driver-proof's 13c met exactly that on 2026-10-06: the Mission table's Pop out stood at y=199 for the
 * first frames after Ctrl+3 and at y=274, then y=296, once the provider notice filled the notice slot, so a press
 * measured before the notice opened no persona window and reported success
 * (`docs/defects/fixed/driver-proof-clicks-pop-out-at-a-box-the-notice-banner-moves.md`).
 *
 * So this measures the match, lets `SETTLE_FRAMES` frames begin, and measures again; it answers `settled` only when the
 * box is the same and the element at its centre is the match or inside it (what a pointer there would press). When it
 * is, it arms a one-shot capture listener for the next `mousedown`, which `LANDING_SCRIPT` reads after the press.
 */
function settleScript(selector: string, text: string | undefined): string {
  const match = text === undefined ? 'true' : `(element.textContent || '').trim() === ${JSON.stringify(text)}`;
  return `/* driver:settle */ (async () => {
    const describe = ${DESCRIBE_ELEMENT};
    const locate = () => [...document.querySelectorAll(${JSON.stringify(selector)})].find((element) => ${match});
    const box = (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
    let element = locate();
    if (!element) return null;
    element.scrollIntoView({ block: 'center', inline: 'nearest' });
    const before = box(element);
    for (let left = ${SETTLE_FRAMES}; left > 0; left -= 1) await new Promise((resolve) => { requestAnimationFrame(resolve); setTimeout(resolve, ${SETTLE_FRAME_BOUND_MS}); });
    element = locate();
    if (!element) return null;
    const r = box(element);
    if (r.width === 0 || r.height === 0) return null;
    const found = { ...r, text: (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' ? element.value : (element.textContent || '')).trim().slice(0, 600) };
    if (r.x !== before.x || r.y !== before.y || r.width !== before.width || r.height !== before.height) return { ...found, settled: false, why: 'moved from ' + JSON.stringify(before) };
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    if (hit !== element && !element.contains(hit)) return { ...found, settled: false, why: 'covered by ' + describe(hit) };
    const target = element;
    window.__rotarisDriverLanding = { landed: null, hit: null };
    window.__rotarisDriverLandingListener = (event) => {
      window.removeEventListener('mousedown', window.__rotarisDriverLandingListener, true);
      window.__rotarisDriverLanding = { landed: event.target === target || target.contains(event.target), hit: describe(event.target) };
    };
    window.addEventListener('mousedown', window.__rotarisDriverLandingListener, true);
    return { ...found, settled: true, why: '' };
  })()`;
}

/**
 * What the press `settleScript` armed for met: `{ landed, hit }`, or `landed: null` when no `mousedown` arrived within
 * the bound. Read through timers, not frames, so a window that stops painting still answers.
 */
export const LANDING_SCRIPT = `/* driver:landing */ new Promise((resolve) => {
  let left = 60;
  const look = () => {
    const seen = window.__rotarisDriverLanding;
    if ((seen && seen.landed !== null) || left === 0) {
      if (window.__rotarisDriverLandingListener) window.removeEventListener('mousedown', window.__rotarisDriverLandingListener, true);
      resolve(seen ?? { landed: null, hit: null });
      return;
    }
    left -= 1;
    setTimeout(look, 16);
  };
  look();
})`;

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
   *
   * Since 2026-09-29 `quit` sends the application's quit unless asked for the immediate exit, and only the
   * immediate exit calls this itself; the application's quit reaches `will-quit`, where main calls it.
   */
  const cleanup = (): void => {
    for (const socket of sockets) socket.destroy();
    server.close();
    try { rmSync(endpointFile, { force: true }); } catch { /* the endpoint file is evidence, not state; its removal never fails a run */ }
  };

  /**
   * A4: which window the ops act on. `useWindow` sets it, a per-request `window` overrides it for one op, and
   * absent means the active window — so every proof written when there was only one keeps its meaning.
   *
   * The per-request override was claimed here from A4 on and read by no op until 2026-09-29: every op resolved the
   * `useWindow` selection alone, and a request's `window` was ignored. Each op now resolves `request.window ?? selected`
   * (`target` in `handle`), which is what lets a drive answer an approval dialog in one request without moving the
   * selection off the main window.
   */
  let selected: string | undefined;

  /**
   * A selection that names no window is REFUSED, and the refusal says what is open.
   *
   * That is the eighty-fourth defect's lesson applied to a second case: the `resize` op used to call
   * `setContentSize` — a no-op on a maximized window — and then return `getContentSize()`, reporting a size
   * nobody had asked for, so a whole size sweep was measured at one size and read as three. A driver that
   * cannot do what it was told must say so, or every assertion downstream of it is about a window that never
   * existed. Selecting a window is the same shape: silently falling back to the active window would let a
   * two-window assertion pass while measuring one window twice.
   */
  /** The auxiliary windows open, as `windows` reports them: everything but the window object itself. */
  const auxiliaryListed = (): Omit<AuxiliaryWindow, 'win'>[] =>
    deps.auxiliary().filter((a) => !a.win.isDestroyed()).map(({ selector, role, owner, wcId, visible }) => ({ selector, role, owner, wcId, visible }));

  /**
   * Since 2026-09-29 a selector may name an auxiliary window by its role — `persona:<name>`, `approval`, `terminal`, `auth-recovery` —
   * as well as a main window by index or workspace suffix. Before, only main windows could be reached, so a persona
   * window's state was read from screen captures and an approval was answered through `session.control` rather than
   * in its dialog. A role word is a role, never a workspace suffix: a main window whose path ends in one is named with
   * its separator (`/terminal`), which is still a suffix of that path.
   */
  const resolve = (which: string | undefined): { win: BrowserWindow; main: boolean } | null => {
    if (which !== undefined && namesAuxiliary(which)) {
      const found = deps.auxiliary().find((a) => a.selector === which && !a.win.isDestroyed());
      return found ? { win: found.win, main: false } : null;
    }
    const win = deps.window(which);
    return win && !win.isDestroyed() ? { win, main: true } : null;
  };

  const resolvedOrThrow = (which = selected): { win: BrowserWindow; main: boolean } => {
    const found = resolve(which);
    if (!found) {
      if (which === undefined) throw new Error('the main window is gone');
      throw new Error(`no window matches ${JSON.stringify(which)}; open: ${JSON.stringify({ windows: deps.windows(), auxiliary: auxiliaryListed() })}`);
    }
    return found;
  };
  const windowOrThrow = (which = selected): BrowserWindow => resolvedOrThrow(which).win;

  const evaluate = async (script: string, which: string | undefined): Promise<unknown> => windowOrThrow(which).webContents.executeJavaScript(script) as Promise<unknown>;

  /**
   * Poll until the selector matches or the deadline passes. The ONE waiting primitive; every other wait is this one.
   * With `settle`, a match counts only once `settleScript` finds it settled; one that matched and never settled is
   * named in the refusal with why.
   */
  const waitFor = (selector: string, text: string | undefined, timeoutMs: number, which: string | undefined, settle = false): Promise<Found & { waitedMs: number }> =>
    new Promise((resolve, reject) => {
      const started = deps.monotonic.now();
      let inFlight = false;
      let unsettled = '';
      const poll = deps.timers.every(millis(POLL_MS), () => {
        if (inFlight) return;
        inFlight = true;
        void evaluate(settle ? settleScript(selector, text) : locateScript(selector, text), which)
          .then((found) => {
            inFlight = false;
            const measured = found as (Found & { settled?: boolean; why?: string }) | null | undefined;
            if (measured !== null && measured !== undefined && (!settle || measured.settled === true)) {
              poll.cancel();
              resolve({ x: measured.x, y: measured.y, width: measured.width, height: measured.height, text: measured.text, waitedMs: Math.round(deps.monotonic.now() - started) });
              return;
            }
            if (measured !== null && measured !== undefined) unsettled = measured.why ?? 'unsettled';
            if (deps.monotonic.now() - started > timeoutMs) {
              poll.cancel();
              const named = `${JSON.stringify(selector)}${text === undefined ? '' : ` with text ${JSON.stringify(text)}`}`;
              reject(new Error(unsettled === '' ? `nothing matched ${named} within ${timeoutMs} ms` : `${named} matched but did not settle within ${timeoutMs} ms: last ${unsettled}`));
            }
          })
          .catch((cause: unknown) => {
            inFlight = false;
            poll.cancel();
            reject(cause instanceof Error ? cause : new Error(String(cause)));
          });
      });
    });

  const clickAt = (x: number, y: number, which: string | undefined): void => {
    const wc = windowOrThrow(which).webContents;
    wc.sendInputEvent({ type: 'mouseMove', x, y });
    wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
    wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
  };

  const handle = async (request: Request): Promise<unknown> => {
    const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    /** A4: the window this op acts on — the request's own `window` for this op alone, else what `useWindow` selected. */
    const target = request.window ?? selected;
    switch (request.op) {
      case 'ping':
        return { pid: process.pid, window: resolve(target) !== null };
      /** A4: the main windows open, so a proof can assert on two of them rather than on "the" window — and the auxiliary ones. */
      case 'windows':
        return { windows: deps.windows(), auxiliary: auxiliaryListed(), selected: selected ?? null };
      /** A4: point the ops after this one at a window. Refuses rather than silently keeping the old one. */
      case 'useWindow': {
        const which = request.window;
        if (which === undefined) { selected = undefined; return { selected: null }; }
        windowOrThrow(which);
        selected = which;
        return { selected: which };
      }
      case 'waitFor': {
        if (!request.selector) throw new Error('waitFor needs a selector');
        return waitFor(request.selector, request.text, timeoutMs, target);
      }
      case 'click': {
        if (!request.selector) throw new Error('click needs a selector');
        const settle = request.settle === true;
        const found = await waitFor(request.selector, request.text, timeoutMs, target, settle);
        const x = Math.round(found.x + found.width / 2);
        const y = Math.round(found.y + found.height / 2);
        clickAt(x, y, target);
        if (!settle) return { x, y, text: found.text, waitedMs: found.waitedMs };
        // A settled click says whether the press met its target. A window the press closed cannot answer, and that is
        // `landed: null`, not a miss; a press that met something else is refused, naming what it met.
        const landing = await evaluate(LANDING_SCRIPT, target).catch(() => null) as { landed: boolean | null; hit: string | null } | null;
        if (landing?.landed === false) throw new Error(`the click at (${x}, ${y}) on ${JSON.stringify(request.selector)}${request.text === undefined ? '' : ` with text ${JSON.stringify(request.text)}`} did not land: the press met ${landing.hit ?? 'nothing'}`);
        return { x, y, text: found.text, waitedMs: found.waitedMs, landed: landing?.landed ?? null };
      }
      case 'type': {
        const wc = windowOrThrow(target).webContents;
        // `keyDown` + `char` + `keyUp` per character: a chord alone moves no caret and inserts nothing, and the
        // renderer needs the `char` event — the same lesson the type-at seam carries. A line break is Shift+Enter, never
        // a character (`textEvents`; REQ-CHAT-001's newline, so a multi-line text neither loses its breaks nor submits
        // early — `docs/defects/fixed/the-driver-and-the-type-seams-type-a-newline-as-a-character.md`).
        const text = request.text ?? '';
        for (const event of request.enter === true ? submitEvents(text, 'key') : textEvents(text, 'key')) wc.sendInputEvent(inputEvent(event));
        return { typed: (request.text ?? '').length, enter: request.enter === true };
      }
      case 'chord': {
        if (!request.chord) throw new Error('chord needs a chord');
        const { keyCode, modifiers } = chordEvent(request.chord);
        const wc = windowOrThrow(target).webContents;
        wc.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
        wc.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
        return { chord: request.chord };
      }
      case 'inspect': {
        if (!request.selector) throw new Error('inspect needs a selector');
        return evaluate(inspectScript(request.selector), target);
      }
      case 'probe': {
        if (!request.selector) throw new Error('probe needs a selector');
        return evaluate(probeScript(request.selector), target);
      }
      case 'eval': {
        if (!request.expression) throw new Error('eval needs an expression');
        return evaluate(`(async () => { try { return await (${request.expression}); } catch (cause) { return { error: String(cause) }; } })()`, target);
      }
      case 'screenshot': {
        if (!request.path) throw new Error('screenshot needs a path');
        /**
         * A fresh frame first (`docs/defects/fixed/the-drivers-shot-can-return-a-stale-frame.md`). `capturePage()` copies
         * the frame last presented, and a shot taken right after a click, a navigation or a dialog's close returned the
         * frame from BEFORE the change: byte-identical to the previous shot while `eval` in the same step read the new
         * document (measured again 2026-09-29 on the build before this repair: the first navigation of thirty-nine,
         * Overview to Workspace). So the renderer is waited on for `PAINT_FRAMES` frames first, then the capture is
         * taken (`webContents.invalidate()` was not taken: Electron documents it for offscreen rendering only). A window
         * that presents no frame (hidden, minimised) is captured after `PAINT_BOUND_MS` regardless, and the reply
         * says the paint was not confirmed rather than claiming a fresh picture.
         */
        const wc = windowOrThrow(target).webContents;
        const painted = await new Promise<boolean>((resolve) => {
          const bound = deps.timers.after(millis(PAINT_BOUND_MS), () => resolve(false));
          void (wc.executeJavaScript(PAINTED_SCRIPT) as Promise<unknown>).then(
            () => { bound.cancel(); resolve(true); },
            () => { bound.cancel(); resolve(false); },
          );
        });
        const image = await wc.capturePage();
        writeFileSync(request.path, image.toPNG());
        return { path: request.path, painted };
      }
      case 'maximize': {
        // Not the same as `resize` to the work area: the host decides a maximized window's frame, and a layout
        // defect that only appears at the size a person actually uses is one this op exists to reach.
        const win = windowOrThrow(target);
        win.maximize();
        const [width, height] = win.getContentSize();
        return { maximized: win.isMaximized(), width, height };
      }
      case 'resize': {
        const win = windowOrThrow(target);
        if (!request.width || !request.height) throw new Error('resize needs a width and a height');
        /**
         * The eighty-fourth defect, in this op's own first form (2026-09-11): `setContentSize` is a NO-OP on a
         * maximized window, and this returned `getContentSize()` — the unchanged size — as though it had worked.
         * A whole size sweep was measured at one size and read as three. Leave the maximized state first, and
         * then REFUSE rather than report a size nobody asked for: a driver that cannot do what it was told must
         * say so, or every assertion downstream of it is about a window that never existed.
         */
        const wasMaximized = win.isMaximized();
        if (wasMaximized) win.unmaximize();
        win.setContentSize(request.width, request.height);
        const size = win.getContentSize();
        const width = size[0] ?? 0;
        const height = size[1] ?? 0;
        if (Math.abs(width - request.width) > 2 || Math.abs(height - request.height) > 2) {
          throw new Error(`the window is ${width}×${height}, not the ${request.width}×${request.height} asked for (a minimum size or the host refused it)`);
        }
        return { width, height, wasMaximized };
      }
      case 'command':
        return deps.command(request.request, windowOrThrow(target));
      case 'deferProjectOffer': {
        const { win, main } = resolvedOrThrow(target);
        // REQ-SHELL-011's offer belongs to a main window; an auxiliary one has none to defer.
        if (!main) throw new Error(`deferProjectOffer needs a main window; ${JSON.stringify(target)} is not one`);
        deps.deferProjectOffer(win, request.delayMs ?? 650);
        return { windowId: win.webContents.id, delayMs: request.delayMs ?? 650 };
      }
      case 'quit':
        /**
         * The application's quit unless the immediate exit is asked for
         * (`docs/defects/fixed/the-drivers-quit-skips-the-applications-shutdown.md`). This op used to be the immediate
         * exit alone, which skips `window-all-closed`, where main asks the run host to `shutdown`: a driven quit was a
         * crash to a live run, and the session stayed `running` with no stop reason (measured 2026-09-29 on the build
         * before this repair). Now it is `app.quit()`, which a person's quit is.
         *
         * The immediate exit: the reply goes out first, then the seam takes itself down, then the process ends. In that
         * order: a client that is told "quitting" and then finds the endpoint file still there has been told a
         * falsehood. The application's quit leaves the seam up until `will-quit` (main closes it there): the shutdown
         * takes as long as it takes, and a close guard may keep the application — a window with unsaved settings asks
         * its person — which a driver must still be able to see and answer. The reply says which one was sent.
         */
        if (request.immediate === true) {
          deps.timers.after(millis(50), () => { cleanup(); deps.exit(); });
          return { quitting: true, how: 'immediate' };
        }
        deps.timers.after(millis(50), () => { deps.quit(); });
        return { quitting: true, how: 'quit' };
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
