import type { CommandContext, CommandHandlers } from './context.js';

/**
 * REQ-NOTIFY-072..077, REQ-NOTIFY-080 (the 401 note's parts C and D) — the authentication recovery dialog's payload and its
 * answers. A payload is keyed by the SENDER, as a pause or provider window's is: the dialog asking is not a main window, and
 * what it acts on is the session it was opened for, never one it names. Main holds the dialog (`auth-recovery.ts`).
 */
export function authRecoveryCommands(ctx: Pick<CommandContext, 'authRecovery' | 'authRecoveryPayloads'>): Pick<CommandHandlers, 'authRecovery.payload' | 'authRecovery.retry' | 'authRecovery.reauthenticate' | 'authRecovery.cancel'> {
  const { authRecovery, authRecoveryPayloads } = ctx;
  const none = { ok: false as const, code: 'authRecovery.none', headline: 'This window was not opened for an authentication recovery' };
  return {
    'authRecovery.payload': (_req, { senderId }) => {
      const p = authRecoveryPayloads.get(senderId);
      return p ? { ok: true, value: p } : none;
    },
    'authRecovery.retry': async (req, { senderId }) => {
      const p = authRecoveryPayloads.get(senderId);
      if (!p) return none;
      // REQ-NOTIFY-074: only a model the dialog listed is pinned; anything else is the dialog's mistake, not a choice.
      if (!p.models.some((m) => m.key === req.modelKey)) return { ok: true, value: { ok: false, message: `${req.modelKey} is not among the models this dialog offers.` } };
      return { ok: true, value: await authRecovery.retry(p, req.modelKey) };
    },
    'authRecovery.reauthenticate': async (req, { senderId }) => {
      const p = authRecoveryPayloads.get(senderId);
      if (!p) return none;
      // REQ-NOTIFY-076: the key goes to the provider key store or nowhere; it is never logged (REQ-PROVIDER-131).
      return { ok: true, value: await authRecovery.reauthenticate(p, req.apiKey) };
    },
    'authRecovery.cancel': (_req, { senderId }) => {
      const p = authRecoveryPayloads.get(senderId);
      if (!p) return none;
      authRecovery.cancel(p);
      return { ok: true };
    },
  };
}
