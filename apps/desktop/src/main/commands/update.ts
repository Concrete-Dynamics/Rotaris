import type { CommandContext, CommandHandlers } from './context.js';

/**
 * THE UPDATER's two commands (first-release-plan.md §4.6; REQ-STARTUP-116, REQ-STARTUP-120, REQ-STARTUP-121) — the
 * targets of the `install-update` and `restart` notice actions REQ-NOTIFY-044 named with no target until 2026-09-28.
 *
 * Each is a plain relay: the updater holds the offer, decides whether an operation is already in flight
 * (REQ-STARTUP-114) and answers with a `CommandOutcome`; the renderer sends no version, no asset name and no URL, so
 * a window cannot install anything main did not itself offer (REQ-STARTUP-108, REQ-STARTUP-111).
 */
export function updateCommands(ctx: Pick<CommandContext, 'updater'>): Pick<CommandHandlers, 'update.install' | 'update.restart' | 'update.cancel' | 'update.state'> {
  return {
    'update.install': () => ctx.updater.install(),
    'update.restart': () => ctx.updater.restart(),
    /*
     * REQ-STARTUP-170 (PD-STARTUP-008 item 1, UD-2; R-117): the `cancel-update` action, from the download notice or the
     * title-bar indicator. Not an operation of REQ-STARTUP-114: the updater ends the one download it holds, and answers
     * once the transfer has ended or its 2 s bound has passed.
     */
    'update.cancel': () => ctx.updater.cancel(),
    // PD-SHELL-018 (R-117): channel 17's payload as it stands, for a window that mounts after a download started.
    'update.state': async () => ({ ok: true, value: ctx.updater.updateState() }),
  };
}
