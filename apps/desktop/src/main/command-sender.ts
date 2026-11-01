/**
 * Who may send a command, and which main window it speaks for (ADR-0044, REQ-SHELL-020; the Electron security checklist,
 * item 17; R-091, `docs/architecture/hardening.md` §3.1).
 *
 * Until 2026-11-01 a sender was trusted by its id alone: `MainWindows.forCommand` answered an id it did not know for the active
 * window, and nothing read the frame that sent the message. Now the IPC handler asks two things before `runCommand`:
 *
 * 1. **The frame is the application's own page** (`isApplicationPage`, OQ-466's one predicate): the URL of `senderFrame`, the
 *    frame that sent the message, not the window's. A frame that is gone, or any other page, is refused.
 * 2. **The sender is a window the application opened**: a main window; a persona or terminal window, which speaks for the
 *    main window that owns it (ADR-0048 B); or a dialog main presented over one of those — the approval, pause,
 *    authentication-recovery, provider and hook-review dialogs, each built with `parent` — which speaks for the main window it
 *    was raised over, found by walking its parents (`commandWindowFor`). Anything else is refused in a packaged build. A build
 *    with the verification seams (`__ROTARIS_SEAMS__`) keeps the active-window answer for such a sender, which is the answer
 *    the seams and the driver mean when they speak for no window (they call `runCommand` directly and never cross this check).
 *
 * A refusal is `command.untrustedSender`, a value and not a throw (ADR-0019), with one `warning` line naming the frame's origin
 * alone (PD-MONITOR-002).
 */
import type { CommandOutcome } from '@rotaris/contracts';
import { isApplicationPage, urlOriginForLog, type ApplicationPages } from './permissions.js';

export const UNTRUSTED_SENDER = 'command.untrustedSender';

/**
 * The main window `senderId` speaks for: its own record where it is a main window or one's persona or terminal window
 * (`lookup`), else the first such record up its chain of parent windows (`parentOf`, a dialog's `parent`). Undefined for a
 * sender no window the application opened stands behind. A cycle ends the walk.
 */
export function commandWindowFor<W>(senderId: number, lookup: (id: number) => W | undefined, parentOf: (id: number) => number | undefined): W | undefined {
  const seen = new Set<number>();
  for (let at: number | undefined = senderId; at !== undefined && !seen.has(at); at = parentOf(at)) {
    const found = lookup(at);
    if (found !== undefined) return found;
    seen.add(at);
  }
  return undefined;
}

export type SenderVerdict =
  | { readonly admitted: true }
  | { readonly admitted: false; readonly outcome: CommandOutcome; readonly warning: string };

export interface SenderFacts {
  readonly senderId: number;
  /** `event.senderFrame?.url`, or undefined where the frame is gone. */
  readonly frameUrl: string | undefined;
  /** Whether `commandWindowFor` found a main window for the sender. */
  readonly known: boolean;
}

/** The two checks, in order. `admitUnknown` is `__ROTARIS_SEAMS__`: true only in a build that carries the verification seams. */
export function commandSenderVerdict(sender: SenderFacts, own: ApplicationPages, admitUnknown: boolean): SenderVerdict {
  if (!isApplicationPage(sender.frameUrl, own)) {
    return {
      admitted: false,
      outcome: { ok: false, code: UNTRUSTED_SENDER, headline: "The command came from a page that is not the application's" },
      warning: `command refused: sent from ${urlOriginForLog(sender.frameUrl)}, which is not the application's own page (Electron security checklist 17; OQ-466)`,
    };
  }
  if (!sender.known && !admitUnknown) {
    return {
      admitted: false,
      outcome: { ok: false, code: UNTRUSTED_SENDER, headline: 'The command came from a window the application did not open' },
      warning: `command refused: sender ${sender.senderId} is no window the application opened (Electron security checklist 17)`,
    };
  }
  return { admitted: true };
}

/** The slice of Electron's `IpcMainInvokeEvent` the check reads. */
export interface CommandEvent {
  readonly sender: { readonly id: number };
  readonly senderFrame?: { readonly url: string } | null;
}

export interface CommandAdmission {
  /** `MainWindows.standingBehind` with the dialogs' parents: undefined for a sender no window of the application stands behind. */
  readonly standingBehind: (senderId: number) => unknown;
  readonly own: ApplicationPages;
  /** `__ROTARIS_SEAMS__`. */
  readonly admitUnknown: boolean;
  readonly warn: (message: string) => void;
}

/** The IPC handler's check: undefined where the command may go on to `runCommand`, else the refusal it is answered with. */
export function refuseCommandSender(event: CommandEvent, deps: CommandAdmission): CommandOutcome | undefined {
  const senderId = event.sender.id;
  let frameUrl: string | undefined;
  try { frameUrl = event.senderFrame?.url; } catch { frameUrl = undefined; } // a frame disposed before it is read throws
  const verdict = commandSenderVerdict({ senderId, frameUrl, known: deps.standingBehind(senderId) !== undefined }, deps.own, deps.admitUnknown);
  if (verdict.admitted) return undefined;
  deps.warn(verdict.warning);
  return verdict.outcome;
}
