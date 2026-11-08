import type { CommandOutcome, LiveStatePayload } from '@rotaris/contracts';

/**
 * ADR-0037 Tier B / REQ-CONFIG-262 with REQ-SHELL-020 and REQ-NOTIFY-023: **which main window's Settings screen owns
 * the run host's one live state**, and what the run host must hold when windows come and go.
 *
 * The run host keeps ONE live state for the whole process (`run-host/host.ts`: `let liveState`), and main forwards
 * whatever a window sends (`commands/config.ts`). With two main windows (REQ-SHELL-020) each may hold its own Settings
 * screen, so the state cannot simply be "whatever arrived last and stayed": a window leaving must not leave the host
 * holding the departed window's values while another window's screen is still open (that would use one form's settings
 * while the other is on screen), and it must not clear a screen still open either.
 *
 * The rule, therefore, is **each holding window keeps its own contribution, and the run host holds the most recently
 * published one among the windows still holding a screen** — the product's existing last-write-wins tie-break, narrowed
 * to the windows that still have a form on screen. A window letting go re-publishes the surviving owner's contribution
 * (or "none", when it was the last), so what a run resolves is always some live screen's values and never a departed
 * one's.
 *
 * A contribution ends when its window's screen goes (`release`), when its DOCUMENT is replaced or lost (`gone` — a
 * close, a lost renderer, a reload), because a form nobody can look at must not outrank the file at the next run start.
 * Both are reported by `MainWindows`; the renderer's own cleanup covers only the ordinary case of leaving Settings,
 * since a close and a reload destroy the document without unmounting React.
 *
 * The EMPTY state is this product's established spelling of "no live values", not an invention here: the board
 * elevation sends `config.liveState {}` right after its granted start for the same purpose
 * (`02-process-view/02-message-families-3.md`), and every field of `LiveState` is optional, so it overlays nothing
 * (`overlayLiveState`, `packages/config/src/tiers.ts`).
 */
export interface LiveStateArbiter {
  /** `wcId`'s Settings screen published its current values; they become the run host's live state. */
  readonly publish: (wcId: number, state: LiveStatePayload) => void;
  /** `wcId`'s Settings screen is gone. A surviving holder's contribution is restored, or "none" if it held the last. */
  readonly release: (wcId: number) => void;
  /** `wcId`'s DOCUMENT is gone — closed, reloaded, or its renderer lost. Same rule as `release`. */
  readonly gone: (wcId: number) => void;
  /** How many windows hold a published screen right now. Read by the log and a test; no surface reads it. */
  readonly holders: () => number;
}

/** What the arbiter needs: the one send to the run host, and a line to report a refusal with. */
export interface LiveStateArbiterDeps {
  readonly send: (state: LiveStatePayload) => Promise<CommandOutcome>;
  readonly log: (message: string, level?: 'info' | 'warn') => void;
}

/**
 * Whether a payload is the empty state — every field absent. `LiveStateSchema` holds each field optional, so this is
 * the state a run host process starts with, and the one that overlays nothing.
 */
export function isEmptyLiveState(state: LiveStatePayload): boolean {
  return Object.keys(state).length === 0;
}

export function createLiveStateArbiter({ send, log }: LiveStateArbiterDeps): LiveStateArbiter {
  /**
   * Each holding window's last contribution, in the order they were published: a `Map` iterates in insertion order, and
   * a re-publish deletes before it sets, so the LAST entry is the owner whose values the run host holds.
   */
  const contributions = new Map<number, LiveStatePayload>();
  /**
   * One send, its outcome logged and never rethrown. Every caller is either a command answer or a window's teardown,
   * and neither may throw — a teardown that threw would take the window's close with it.
   */
  const forward = (state: LiveStatePayload, why: string): void => {
    void send(state).then((r) => { if (!r.ok) log(`the live settings (${why}) were refused: ${r.headline}${r.detail === undefined ? '' : ` — ${r.detail}`}`, 'warn'); }, (cause: unknown) => { log(`the live settings (${why}) could not be handed over: ${cause instanceof Error ? cause.message : String(cause)}`, 'warn'); });
  };
  /** One window lets go: a surviving owner is restored, or the run host is told "none" when it was the last holder. */
  const letGo = (wcId: number, why: string): void => {
    const owner = [...contributions.keys()][contributions.size - 1];
    if (!contributions.delete(wcId)) return;
    /*
     * The run host holds the MOST RECENT publisher's state, so it has to be told something only when the window
     * letting go was that publisher — a window that published before another never had its values in force, and its
     * departure changes nothing.
     */
    if (contributions.size === 0) { forward({}, why); return; }
    if (wcId !== owner) { log(`${why}; window ${owner} still holds the live settings and the run host already has them`); return; }
    // The survivor's VALUES, re-forwarded rather than assumed: the run host is holding the departed window's.
    const [survivor, state] = [...contributions.entries()][contributions.size - 1]!;
    log(`${why}; window ${survivor}'s settings screen still holds the live settings, so the run host is given its values`);
    forward(state, `window ${survivor}'s settings screen (restored after ${why})`);
  };
  return {
    publish: (wcId, state) => {
      if (isEmptyLiveState(state)) { log(`window ${wcId} published an empty live state; a window lets go with \`release\`, so its 'none' is ignored here`); return; }
      // Delete first so this window becomes the most recent publisher, which is the one the run host holds.
      contributions.delete(wcId);
      contributions.set(wcId, state);
      forward(state, `window ${wcId}'s settings screen`);
    },
    release: (wcId) => { letGo(wcId, `window ${wcId} left Settings`); },
    gone: (wcId) => { letGo(wcId, `window ${wcId} went with live settings published`); },
    holders: () => contributions.size,
  };
}
