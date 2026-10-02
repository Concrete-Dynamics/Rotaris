import { z } from 'zod';

/**
 * REQ-NOTIFY-072..075, REQ-NOTIFY-079/080 (the 401 note's part C) — the authentication recovery dialog, as it
 * crosses from main to the modal window that draws it and back. Main opens it when a run's failure is classified as an
 * authentication failure (REQ-NOTIFY-060/067) and the session can be restarted (REQ-NOTIFY-069); the window reads its
 * payload by its own command, as the pause and provider windows do (ADR-0048), and answers with one of its gestures.
 */

/** REQ-NOTIFY-072: the recovery dialog is 560 px wide — the window's fixed width, which the requirement owns. */
export const AUTH_RECOVERY_DIALOG_WIDTH = 560;

/** A model as the dialog names it: its `models:` key (null where the run named a model no entry produced), its provider, its model id. */
export const AuthRecoveryModelSchema = z.object({
  key: z.string().nullable(),
  provider: z.string(),
  /** The provider's display name where the provider store knows one, else the provider id. */
  providerName: z.string(),
  model: z.string(),
});
export type AuthRecoveryModel = z.infer<typeof AuthRecoveryModelSchema>;

export const AuthRecoveryPayloadSchema = z.object({
  sessionId: z.string().min(1),
  /** REQ-NOTIFY-072: the model that failed, or null where the run did not record it — the dialog then names `active`. */
  failed: AuthRecoveryModelSchema.nullable(),
  active: AuthRecoveryModelSchema.nullable(),
  /** REQ-NOTIFY-074: every configured model a restart can pin, unordered — the dialog orders and filters (`recoveryModelList`). */
  models: z.array(AuthRecoveryModelSchema.extend({ key: z.string() })),
  /** REQ-NOTIFY-073: the provider's own error text, as the run reported it; the dialog collapses and truncates it. */
  error: z.string(),
});
export type AuthRecoveryPayload = z.infer<typeof AuthRecoveryPayloadSchema>;

/**
 * The dialog's commands. `authRecovery.retry` pins the chosen model and restarts the run (REQ-NOTIFY-074);
 * `authRecovery.cancel` closes the dialog and does nothing else (REQ-NOTIFY-080). Each acts on the session the asking window was opened for, never one it names.
 */
export const AUTH_RECOVERY_COMMAND_SCHEMAS = [
  z.object({ kind: z.literal('authRecovery.payload') }),
  z.object({ kind: z.literal('authRecovery.retry'), modelKey: z.string().min(1) }),
  z.object({ kind: z.literal('authRecovery.cancel') }),
] as const;

/** What a retry answered: `ok` once the run restarted (the window then closes); else the sentence the dialog shows. */
export type AuthRecoveryResult = { readonly ok: true } | { readonly ok: false; readonly message: string };
