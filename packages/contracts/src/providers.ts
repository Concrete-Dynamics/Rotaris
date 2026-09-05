import { z } from 'zod';

/**
 * What the renderer sees of the provider subsystem (ADR-0030): rows, statuses, masked values, outcomes,
 * the authentication window's payload — and never a credential value. `providers.test.ts` asserts that
 * no field of any schema here has a secret-looking name (ADR-0030 consequence 2); the pasted key travels
 * inward only, on the `provider.signIn` command, and comes back as the display mask alone.
 */
export const SIGN_IN_METHOD_NAMES = ['device-code', 'browser-pkce', 'api-key'] as const;
export type SignInMethodName = (typeof SIGN_IN_METHOD_NAMES)[number];

/** REQ-NOTIFY-200: the seven states, each with its own label; colour never carries the state alone. */
export const PROVIDER_STATE_NAMES = ['checking', 'coming_soon', 'error', 'healthy', 'unauthenticated', 'unknown', 'warning'] as const;
export type ProviderStateName = (typeof PROVIDER_STATE_NAMES)[number];
export const PROVIDER_STATE_LABELS: Readonly<Record<ProviderStateName, string>> = Object.freeze({
  checking: 'Checking…', coming_soon: 'Coming soon', error: 'Error', healthy: 'Healthy', unauthenticated: 'Not authenticated', unknown: 'Not checked', warning: 'Partly usable',
});

export const CREDENTIAL_STATUS_NAMES = ['authenticated', 'unauthenticated', 'expired', 'refreshing'] as const;

export const ProviderHealthSchema = z.object({
  state: z.enum(PROVIDER_STATE_NAMES),
  detail: z.string(),
  available: z.boolean(),
});
export type ProviderHealthPayload = z.infer<typeof ProviderHealthSchema>;

/** REQ-PROVIDER-140: one row of the provider list. */
export const ProviderRowSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  method: z.enum(SIGN_IN_METHOD_NAMES).nullable(),
  methodLabel: z.string(),
  authenticated: z.boolean(),
  status: z.enum(CREDENTIAL_STATUS_NAMES),
  /** REQ-PROVIDER-107: the display mask of a stored value, or null when none is stored. */
  displayMask: z.string().nullable(),
  baseUrl: z.string().nullable(),
  modelCount: z.number().int().nonnegative(),
  userDefined: z.boolean(),
  available: z.boolean(),
  lastError: z.string().nullable(),
  health: ProviderHealthSchema.nullable(),
});
export type ProviderRow = z.infer<typeof ProviderRowSchema>;

/** REQ-PROVIDER-117: one entry of the add-provider selector. */
export const ProviderChoiceSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  method: z.enum(SIGN_IN_METHOD_NAMES),
  methodLabel: z.string(),
  /** REQ-PROVIDER-117's destination hint, by connection mode. */
  hint: z.string(),
  /** REQ-PROVIDER-052: the endpoint URL the custom mode defaults to; null for a fixed endpoint. */
  defaultBaseUrl: z.string().nullable(),
  custom: z.boolean(),
  /** REQ-PROVIDER-142: shown as coming soon and not selectable. */
  available: z.boolean(),
  unavailabilityReason: z.string().nullable(),
});
export type ProviderChoice = z.infer<typeof ProviderChoiceSchema>;

export const PROVIDER_DIALOG_MODES = ['add', 'authenticate', 'reauthenticate'] as const;
export type ProviderDialogMode = (typeof PROVIDER_DIALOG_MODES)[number];

/** What the authentication window reads (REQ-PROVIDER-116/117). */
export const ProviderDialogPayloadSchema = z.object({
  mode: z.enum(PROVIDER_DIALOG_MODES),
  /** Fixed for authenticate/reauthenticate; null in add mode until chosen. */
  providerId: z.string().nullable(),
  displayName: z.string().nullable(),
  choices: z.array(ProviderChoiceSchema),
});
export type ProviderDialogPayload = z.infer<typeof ProviderDialogPayloadSchema>;

/** The sign-in flow's one outcome (REQ-PROVIDER-012/142), plus the two in-flow choices the desktop asks. */
export const ProviderSignInResultSchema = z.discriminatedUnion('outcome', [
  z.object({ outcome: z.literal('signed-in'), id: z.string(), displayName: z.string(), discovered: z.number().int().nonnegative(), message: z.string(), keyValidated: z.boolean() }),
  z.object({ outcome: z.literal('needs-confirmation'), id: z.string(), message: z.string() }),
  z.object({ outcome: z.literal('no-models'), id: z.string(), message: z.string() }),
  z.object({ outcome: z.literal('cancelled') }),
  z.object({ outcome: z.literal('failed'), message: z.string() }),
]);
export type ProviderSignInResult = z.infer<typeof ProviderSignInResultSchema>;

export const ProviderActionResultSchema = z.object({ ok: z.boolean(), message: z.string() });
export type ProviderActionResult = z.infer<typeof ProviderActionResultSchema>;

/** REQ-WORKSPACE-152 (3): the notice's recovery command the renderer resolves to the add-provider window. */
export const PROVIDERS_ADD_COMMAND = 'providers.add' as const;
