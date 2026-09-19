import type { BrowserWindow } from 'electron';
import type { Clocks } from '@rotaris/kernel';
import { millis } from '@rotaris/kernel';
import type { CommandOutcome, ProcessReply, RunHostRequest } from '@rotaris/contracts';
import type { ProcessLink } from '@rotaris/shell';
import type { PersonaWindows } from '../windows.js';
import type { NoticeStore } from '../notices.js';

/**
 * CAPTURE — the scripted launch that ends in a photograph, and the grammar it is written in.
 *
 * A capture is verification only. It is not a user-facing surface and no product path reaches it:
 * `ROTARIS_CAPTURE_PNG` names the file the painted window is written to, and every other variable
 * below scripts what happens between the first paint and that photograph. `pnpm app:drive` is the
 * opposite seam — a window that stays up and answers questions — and lives in `driver.ts`.
 *
 * This module exists so the grammar has a type and a test. Before it, the whole script was parsed
 * keyword by keyword inside `main()`, which meant the only way to find out that a proof's step list
 * was malformed was to launch Electron and read a log.
 *
 * WHAT MAY BE IMPORTED FROM WHERE, and why it matters (ADR-0056; `scripts/package.mjs`'s seam check):
 *
 *  - This file and `probe.ts` are reached by a static import from `main/index.ts`. They may name
 *    only the three variables a PACKAGED build still answers — `ROTARIS_CAPTURE_PNG`, `_PROMPT`,
 *    `_AFTER_MS` — because everything they name survives into the shipped bundle.
 *  - `seams.ts` and `theme-proof.ts` hold every scriptable variable and are reached ONLY by a
 *    dynamic import inside `if (__ROTARIS_SEAMS__)`. With the flag false rollup removes the branch,
 *    the chunk is then unreachable, and the names go with it.
 *
 * Putting a scriptable variable's name in this file would ship it. The check in
 * `scripts/package.mjs` fails the package when that happens; it is not a matter of taste.
 */
export interface CaptureHost {
  /** The FIRST main window. A capture is a photograph of one window, so the seams drive this one. */
  readonly win: BrowserWindow;
  /** The persona-window registry of that window (REQ-SHELL-072/076/078). */
  readonly personaWindows: PersonaWindows;
  /** The session the window follows, read at the moment a step fires rather than captured at launch. */
  readonly followedSessionId: () => string | null;
  readonly clocks: Clocks;
  readonly log: (message: string) => void;
  /** `runCommand` itself, so a seam drives the renderer's own path and never a shortcut past it. */
  readonly command: (request: unknown) => Promise<CommandOutcome>;
  /** The real notice store — the queue, the record and the scoping rules, not a stand-in for them. */
  readonly notices: NoticeStore;
  readonly libraryRevision: { readonly value: number };
  readonly runHost: ProcessLink<RunHostRequest>;
  /** The theme in force now; the theme proof switches away from it and back. */
  readonly themeName: () => string;
  /** Whether the first terminal result has been presented — what `ROTARIS_CAPTURE_WAIT=result` waits on. */
  readonly resultSeen: () => boolean;
  readonly exit: (code: number) => void;
}

/** Whatever `ask` returns for a request the capture makes on the run host's behalf. */
export type CaptureReply = ProcessReply;

/**
 * One step of a capture script: `selector>>arg@ms`, or `selector>>arg@~ms` for the waiting form.
 *
 * `selector` carries whatever the step's own variable means by it — a CSS selector for a click, the
 * text for a typed step, a path for a photograph, a JSON document for a notice. `arg` is the
 * optional second half after `>>`.
 */
export interface CaptureStep {
  readonly selector: string;
  readonly arg: string | null;
  readonly at: number;
  /**
   * `@ms` fires once at that instant; `@~ms` waits for the selector to MATCH and acts as soon as it
   * does, giving up at `ms` — the time becomes a deadline rather than an appointment.
   *
   * The distinction is opt-in because both readings are wanted. A proof that samples the same
   * selector at 7500, 8500 and 9500 ms is watching a value CHANGE, and waiting-for-present would
   * collapse the series into three readings of the first match. A proof that asserts "the wait
   * header was on screen during the wait" wants the header, not the instant: pinning it to 1700 ms
   * makes a busy machine indistinguishable from a broken product, which is how `resilience-proof`
   * came to fail on three different probes with nothing wrong with the code under them (measured
   * 2026-09-12: 4/5 green quiet, 1/4 green under load).
   */
  readonly until: boolean;
}

/** `"a@100;;b>>c@~200"` — the whole grammar, and the only place it is read. */
export function parseSteps(raw: string | undefined): CaptureStep[] {
  return (raw ?? '').split(';;').map((s) => s.trim()).filter((s) => s !== '').map((s) => {
    const rawAt = s.slice(s.lastIndexOf('@') + 1);
    const until = rawAt.startsWith('~');
    const at = Number(until ? rawAt.slice(1) : rawAt);
    const body = s.slice(0, s.lastIndexOf('@'));
    const sep = body.indexOf('>>');
    return { selector: sep === -1 ? body : body.slice(0, sep), arg: sep === -1 ? null : body.slice(sep + 2), at, until };
  });
}

/** `"selector;;selector"` — the probe lists, which carry no time and no argument. */
export function parseSelectors(raw: string | undefined): string[] {
  return (raw ?? '').split(';;').map((s) => s.trim()).filter((s) => s !== '');
}

/**
 * `Ctrl+Shift+K` → the input event's parts. `++` is a literal plus with a modifier before it, which
 * is how the palette proof presses Ctrl++ without the split eating the key.
 */
export function chordEvent(chord: string): { keyCode: string; modifiers: ('control' | 'shift' | 'alt')[] } {
  const parts = chord.endsWith('++') ? [...chord.slice(0, -2).split('+'), '+'] : chord.split('+');
  const modifiers: ('control' | 'shift' | 'alt')[] = [];
  let keyCode = '';
  for (const p of parts) { if (p === 'Ctrl') modifiers.push('control'); else if (p === 'Shift') modifiers.push('shift'); else if (p === 'Alt') modifiers.push('alt'); else keyCode = p; }
  return { keyCode, modifiers };
}

/** The renderer expression a `~` step polls. Exported for the test, which is the only other reader. */
export function matchProbe(selector: string, text: string | null): string {
  return `(() => [...document.querySelectorAll(${JSON.stringify(selector)})].some((x) => ${text === null ? 'true' : `x.textContent.trim() === ${JSON.stringify(text)}`}))()`;
}

/** A promise that resolves after `ms` on the clock ports — never a bare timer (`rotaris/no-bare-timers`). */
export function pause(host: CaptureHost, ms: number): Promise<void> {
  return new Promise<void>((resolve) => { host.clocks.timers.after(millis(ms), () => resolve()); });
}

/** A real click at a point in the window's content, as the host delivers one. */
export function clickAt(win: BrowserWindow, point: { x: number; y: number }): void {
  win.webContents.sendInputEvent({ type: 'mouseDown', x: Math.round(point.x), y: Math.round(point.y), button: 'left', clickCount: 1 });
  win.webContents.sendInputEvent({ type: 'mouseUp', x: Math.round(point.x), y: Math.round(point.y), button: 'left', clickCount: 1 });
}

/** A real double-click at a point: two press-release pairs with clickCount 2, as the renderer delivers one. */
export function doubleClickAt(win: BrowserWindow, point: { x: number; y: number }): void {
  const at = { x: Math.round(point.x), y: Math.round(point.y) };
  win.webContents.sendInputEvent({ type: 'mouseDown', ...at, button: 'left', clickCount: 1 });
  win.webContents.sendInputEvent({ type: 'mouseUp', ...at, button: 'left', clickCount: 1 });
  win.webContents.sendInputEvent({ type: 'mouseDown', ...at, button: 'left', clickCount: 2 });
  win.webContents.sendInputEvent({ type: 'mouseUp', ...at, button: 'left', clickCount: 2 });
}

/** The centre of whatever the finder expression returns, or null when it matches nothing. */
export function centre(win: BrowserWindow, finder: string): Promise<{ x: number; y: number } | null> {
  return win.webContents.executeJavaScript(`(() => { const b = ${finder}; if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`) as Promise<{ x: number; y: number } | null>;
}

/** Resolves when the step's selector (and its optional exact text) matches, or at the deadline. Never throws. */
export async function settleAt(host: CaptureHost, step: CaptureStep): Promise<void> {
  if (!step.until) { await pause(host, step.at); return; }
  const deadline = Date.now() + step.at;
  const probe = matchProbe(step.selector, step.arg);
  for (;;) {
    const hit = await host.win.webContents.executeJavaScript(probe).catch(() => false) as boolean;
    if (hit) { host.log(`capture: ${step.selector} matched with ${deadline - Date.now()} ms to spare`); return; }
    if (Date.now() >= deadline) { host.log(`capture: ${step.selector} never matched within ${step.at} ms`); return; }
    await pause(host, 50);
  }
}

/** Schedules `body` for the step's instant, or for the moment its selector matches. */
export function onStep(host: CaptureHost, step: CaptureStep, body: () => void | Promise<void>): void {
  void (async () => {
    await settleAt(host, step);
    await body();
  })();
}
