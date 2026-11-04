import { millis, type Millis, type TimerHandle, type Timers } from '@rotaris/kernel';

/**
 * OQ-485 (ruled 2026-11-04 under the owner's delegation, R-072; PD-MONITOR-002): a message refused at a process boundary
 * leaves one `warning` line in the application log, and a burst of them is bounded. This is the bound, shared by main's two
 * boundaries — the process link to a child (`process-link.ts`) and the renderer's command channel
 * (`apps/desktop/src/main/command-dispatch.ts`).
 *
 * Per boundary and per class: the first refusal of a class opens a window of `REFUSAL_FOLD_WINDOW_MS` on the clock ports
 * (`rotaris/no-bare-timers`) and is written in full; refusals inside the window are only counted; when the window closes,
 * or the boundary ends (`flush`), one line gives the count, and the next refusal after that opens a new window. A flooding
 * child or a compromised page therefore writes at most two lines per class per minute. A window in which nothing more was
 * refused closes without a line: a count of none says nothing the first line did not.
 *
 * The full line is built only when it is written (ADR-0044 consequence 3: main adds no work on the relay path, and a
 * refusal inside a window costs a counter's increment).
 */
export const REFUSAL_FOLD_WINDOW_MS: Millis = millis(60_000);

interface OpenWindow {
  counted: number;
  readonly handle: TimerHandle;
  readonly folded: (count: number) => string;
}

export class RefusalFold {
  private readonly open = new Map<string, OpenWindow>();

  constructor(
    private readonly timers: Timers,
    private readonly write: (line: string) => void,
    private readonly windowMs: Millis = REFUSAL_FOLD_WINDOW_MS,
  ) {}

  /**
   * One refusal of class `key`: written in full (`line`) when no window of that class is open, counted otherwise.
   * `folded` builds the count line written when the window closes with refusals counted in it.
   */
  refuse(key: string, line: () => string, folded: (count: number) => string): void {
    const open = this.open.get(key);
    if (open) {
      open.counted += 1;
      return;
    }
    const handle = this.timers.after(this.windowMs, () => { this.close(key); });
    this.open.set(key, { counted: 0, handle, folded });
    this.write(line());
  }

  /** The boundary ended: every open window closes now, each with its count line where it counted any. */
  flush(): void {
    for (const [key, open] of [...this.open]) {
      open.handle.cancel();
      this.close(key);
    }
  }

  private close(key: string): void {
    const open = this.open.get(key);
    if (!open) return;
    this.open.delete(key);
    if (open.counted > 0) this.write(open.folded(open.counted));
  }
}

/** How many issue paths a refusal line names, how deep each goes and how long a key may be before it is written `[key]`. */
export const REFUSAL_PATHS_MAX = 3;
export const REFUSAL_PATH_DEPTH_MAX = 4;
const KEY = /^[A-Za-z_][A-Za-z0-9_]{0,31}$/;

/**
 * The first issue paths of a refusal, capped so they cannot become a payload (OQ-485): at most `REFUSAL_PATHS_MAX`
 * distinct paths, each cut to `REFUSAL_PATH_DEPTH_MAX` segments (`…` marks a cut). A number is an index (`[3]`); a key
 * that is not a short identifier is data — a record key the sender chose — and is written `[key]`, as OQ-467's headline
 * writes it. Nothing else of the message reaches the line: never a value, never zod's message, which can quote one.
 */
export function refusalPaths(issues: readonly { readonly path: readonly PropertyKey[] }[]): string[] {
  const out: string[] = [];
  for (const issue of issues) {
    let text = '';
    for (const key of issue.path.slice(0, REFUSAL_PATH_DEPTH_MAX)) {
      if (typeof key === 'number') text += `[${key}]`;
      else if (typeof key === 'string' && KEY.test(key)) text += text === '' ? key : `.${key}`;
      else text += '[key]';
    }
    if (issue.path.length > REFUSAL_PATH_DEPTH_MAX) text += '…';
    if (text === '') text = '(the message)';
    if (!out.includes(text)) out.push(text);
    if (out.length === REFUSAL_PATHS_MAX) break;
  }
  return out;
}
