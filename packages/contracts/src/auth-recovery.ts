import { z } from 'zod';

/**
 * REQ-NOTIFY-072..077, REQ-NOTIFY-079/080 (the 401 note's parts C and D) — the authentication recovery dialog, as it
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

/**
 * REQ-NOTIFY-076: how this build re-authenticates the provider that failed. `api-key` offers the masked key field and the
 * save-and-retry control. `unavailable` is a device-code or browser provider — whose sign-in flows are owed
 * (`packages/providers/src/catalogue.ts`) — or one the catalogue marks unavailable; `message` says so, and no path sends the
 * user to a shell, a terminal or a separate program. `configuration` is a provider this application holds no credential
 * for (one whose key the model configuration carries, REQ-PROVIDER-118/140); `message` says so (OQ-179).
 */
export const AUTH_RECOVERY_METHODS = ['api-key', 'unavailable', 'configuration'] as const;
export type AuthRecoveryMethod = (typeof AUTH_RECOVERY_METHODS)[number];

export const AuthRecoveryPayloadSchema = z.object({
  sessionId: z.string().min(1),
  /** REQ-NOTIFY-072: the model that failed, or null where the run did not record it — the dialog then names `active`. */
  failed: AuthRecoveryModelSchema.nullable(),
  active: AuthRecoveryModelSchema.nullable(),
  /** REQ-NOTIFY-074: every configured model a restart can pin, unordered — the dialog orders and filters (`recoveryModelList`). */
  models: z.array(AuthRecoveryModelSchema.extend({ key: z.string() })),
  /** REQ-NOTIFY-073: the provider's own error text, as the run reported it; the dialog collapses and truncates it. */
  error: z.string(),
  /** REQ-NOTIFY-076: the provider that failed and how it can be re-authenticated here. */
  reauth: z.object({ provider: z.string(), providerName: z.string(), method: z.enum(AUTH_RECOVERY_METHODS), message: z.string() }),
});
export type AuthRecoveryPayload = z.infer<typeof AuthRecoveryPayloadSchema>;

/**
 * The dialog's commands. `authRecovery.retry` pins the chosen model and restarts the run (REQ-NOTIFY-074);
 * `authRecovery.reauthenticate` stores the key through the provider key store and restarts (REQ-NOTIFY-076/077) — the key
 * goes to the credential store or nowhere and is never logged (REQ-PROVIDER-131); `authRecovery.cancel` closes the dialog
 * and does nothing else (REQ-NOTIFY-080). Each acts on the session the asking window was opened for, never one it names.
 */
export const AUTH_RECOVERY_COMMAND_SCHEMAS = [
  z.object({ kind: z.literal('authRecovery.payload') }),
  z.object({ kind: z.literal('authRecovery.retry'), modelKey: z.string().min(1) }),
  z.object({ kind: z.literal('authRecovery.reauthenticate'), apiKey: z.string() }),
  z.object({ kind: z.literal('authRecovery.cancel') }),
] as const;

/** What a retry or a re-authentication answered: `ok` once the run restarted (the window then closes); else the sentence the dialog shows. */
export type AuthRecoveryResult = { readonly ok: true } | { readonly ok: false; readonly message: string };
