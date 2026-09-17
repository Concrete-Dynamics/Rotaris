import { BrowserWindow } from 'electron';
import { CHANNEL } from '@rotaris/contracts';
import { canonicalPath } from '@rotaris/platform';
import { createRequirementsRelay } from '../requirements.js';
import { userInfo } from 'node:os';
import { type CommandContext, type CommandHandlers } from './context.js';

/**
 * THE REQUIREMENTS BOARD — the relay (spec 08, ADR-0041) and the runs started from it. The ACTOR is stamped
 * in the relay and nowhere else (REQ-CONFIG-198: a command from a window is the OS account main runs as),
 * the workspace is the one this window has open, and a write broadcasts channel 10 AFTER the reply.
 */
export function requirementsCommands(
  ctx: Pick<CommandContext, 'log' | 'requirementsRuns' | 'services'>,
): Pick<CommandHandlers, 'requirements.runs' | 'requirements'> {
  const { log, requirementsRuns, services } = ctx;
  return {
    // Part AP — the board's run coordinator answers the renderer's one command (spec 08 §Runs Started from the Board): a launch
    // preview with the two preferences folded in, a dispatch after an act or a queue change, the permanent suppression, the live runs.
    'requirements.runs': (req) => {
      return requirementsRuns.handle(req);
    },
    // Part AK — the requirements family (spec 08; ADR-0041). The ACTOR is stamped here and nowhere else
    // (REQ-CONFIG-198: a command from a window is the OS account main runs as); the workspace is the one this
    // instance has open; the service answers from its store; a write broadcasts channel 10 AFTER the reply.
    'requirements': (req, { w, senderId, awaitWorkspace }) => {
      return createRequirementsRelay({
        currentWorkspace: () => (w.workspaceId && w.workspace !== '(no workspace)' ? canonicalPath(w.workspace) : undefined),
        awaitWorkspace,
        request: (root, r, bound) => services.get(root)?.link.request(r, bound),
        person: () => { try { return userInfo().username; } catch { return process.env['USERNAME'] ?? process.env['USER'] ?? 'unknown'; } },
        broadcast: (payload) => { for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed()) window.webContents.send(CHANNEL.requirementsChanged, payload); },
        log,
      }).handle(req.command, { kind: 'window', webContentsId: senderId });
    },
  };
}
