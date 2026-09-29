import type { CommandContext, CommandHandlers } from './context.js';

/**
 * THE UPDATER's two commands (first-release-plan.md §4.6; REQ-STARTUP-116, REQ-STARTUP-120, REQ-STARTUP-121) — the
 * targets of the `install-update` and `restart` notice actions REQ-NOTIFY-044 named with no target until 2026-09-28.
 *
 * Each is a plain relay: the updater holds the offer, decides whether an operation is already in flight
 * (REQ-STARTUP-114) and answers with a `CommandOutcome`; the renderer sends no version, no asset name and no URL, so
 * a window cannot install anything main did not itself offer (REQ-STARTUP-108, REQ-STARTUP-111).
 */
export function updateCommands(ctx: Pick<CommandContext, 'updater'>): Pick<CommandHandlers, 'update.install' | 'update.restart'> {
  return {
    'update.install': () => ctx.updater.install(),
    'update.restart': () => ctx.updater.restart(),
  };
}
