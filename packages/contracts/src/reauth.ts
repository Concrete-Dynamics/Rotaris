import { z } from 'zod';
import { CONTRACT_SCHEMA_VERSION } from './version.js';

/**
 * REQ-NOTIFY-071 / REQ-NOTIFY-078 (the 401 note's part B) — the non-modal re-authentication prompt, as it crosses
 * from main to the window that follows the session. ADR-0048 fixes its modality: non-modal and window-level, an
 * in-window panel that traps no focus and leaves the rest of the window usable (the composer included).
 *
 * Main opens it after a successful fallback restart (REQ-NOTIFY-070) and is the only one that closes it: on the
 * dismissal (the fallback is kept), on a submission that succeeded (REQ-NOTIFY-078), or when it is replaced.
 */
export const REAUTH_METHODS = ['api-key', 'unavailable', 'none'] as const;

/** A model as the run named it; `modelKey` is its `models:` key (never a credential — ADR-0030 consequence 2's name rule). */
const PairSchema = z.object({ provider: z.string(), model: z.string(), modelKey: z.string().nullable() });

export const ReauthPromptSchema = z.object({
  sessionId: z.string().min(1),
  /** The primary model that failed authentication, and the fallback the run continues on. */
  primary: PairSchema,
  fallback: PairSchema,
  /** The provider whose credentials were refused: its store id and the name the surfaces give it. */
  provider: z.object({ id: z.string(), name: z.string() }),
  /**
   * How this build can re-authenticate it: `api-key` offers the masked key field; `unavailable` — a device-code or
   * browser provider, whose sign-in flows are owed (`packages/providers/src/catalogue.ts`) — states that in
   * `unavailableReason`; `none` is a provider this application holds no credential for (one configured by model
   * configuration alone), where only switching back is offered.
   */
  method: z.enum(REAUTH_METHODS),
  unavailableReason: z.string().optional(),
  /** REQ-NOTIFY-071: the provider's own error, quoted. */
  error: z.string(),
});
export type ReauthPrompt = z.infer<typeof ReauthPromptSchema>;

/** Channel 13: the window's prompt, or null when it closes. */
export const ReauthPromptPublishSchema = z.object({ v: z.literal(CONTRACT_SCHEMA_VERSION), prompt: ReauthPromptSchema.nullable() });
export type ReauthPromptPublish = z.infer<typeof ReauthPromptPublishSchema>;

/**
 * The prompt's two answers. `reauth.submit` saves any key supplied, clears the automatic-fallback bookkeeping and
 * re-pins the primary model (REQ-NOTIFY-078); `reauth.dismiss` closes the prompt and keeps the fallback (REQ-NOTIFY-071).
 * The key goes to main's credential store or nowhere; it is never logged (REQ-PROVIDER-131).
 */
export const REAUTH_COMMAND_SCHEMAS = [
  z.object({ kind: z.literal('reauth.submit'), sessionId: z.string().min(1), apiKey: z.string() }),
  z.object({ kind: z.literal('reauth.dismiss'), sessionId: z.string().min(1) }),
] as const;

/** What a submission answered: the acknowledgement already raised says the rest; a refusal names why and the prompt stays. */
export type ReauthSubmitResult = { readonly ok: true; readonly applies: 'next-iteration' | 'next-run' } | { readonly ok: false; readonly message: string };
