import { type CommandContext, type CommandHandlers } from './context.js';

/**
 * DIALOGS — the payload an approval or a pause window was opened for, and the two gestures that raise one.
 * A payload is keyed by the SENDER, not by the window a command is answered for: the dialog asking is not a
 * main window, and what it wants is its own. Main raises and shows; it never decides an approval.
 */
export function dialogsCommands(
  ctx: Pick<CommandContext, 'dialogPayloads' | 'log' | 'mainWindows' | 'pausePayloads' | 'presentPause'>,
): Pick<CommandHandlers, 'approval.payload' | 'approval.raise' | 'pause.payload' | 'pause.present'> {
  const { dialogPayloads, log, mainWindows, pausePayloads, presentPause } = ctx;
  return {
    'approval.payload': (_req, { senderId }) => {
      const p = dialogPayloads.get(senderId);
      return p ? { ok: true, value: p } : { ok: false, code: 'approval.none', headline: 'This window was not opened for an approval' };
    },
    'approval.raise': (req, { w }) => {
      // Part AC — REQ-CHAT-098/103: the approval trailer re-opens what is already up. Main raises; it never decides.
      const open = mainWindows.openDialog(w.wcId);
      if (!open || open.requestId !== req.requestId || open.win.isDestroyed()) return { ok: false, code: 'approval.none', headline: 'No approval dialog is open for that request' };
      open.win.show();
      open.win.focus();
      log(`approval ${req.requestId} raised from the transcript trailer`);
      return { ok: true };
    },
    'pause.payload': (_req, { senderId }) => {
      const p = pausePayloads.get(senderId);
      return p ? { ok: true, value: p } : { ok: false, code: 'pause.none', headline: 'This window was not opened for a pause' };
    },
    'pause.present': (req) => {
      void presentPause(req.payload);
      return { ok: true };
    },
  };
}
