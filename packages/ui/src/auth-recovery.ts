import type { AuthRecoveryModel, AuthRecoveryPayload } from '@rotaris/contracts';

/**
 * REQ-NOTIFY-072..074 — the authentication recovery dialog's pure half: its title, the provider's error as it is drawn, and
 * the model list its first path offers. The dialog (`AuthRecoveryDialog.tsx`) draws what these answer and decides nothing.
 */

/** REQ-NOTIFY-073: the drawn error is cut to this many characters, then an ellipsis. */
export const AUTH_ERROR_LIMIT = 320;

/** REQ-NOTIFY-073: the provider's own error text, runs of whitespace collapsed, truncated to 320 characters plus an ellipsis. */
export function providerErrorText(text: string): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed.length > AUTH_ERROR_LIMIT ? `${collapsed.slice(0, AUTH_ERROR_LIMIT)}…` : collapsed;
}

/** REQ-NOTIFY-072: the model the dialog is about — the one that failed, else the active one where the failed one is unknown. */
export function recoveryModel(payload: Pick<AuthRecoveryPayload, 'failed' | 'active'>): AuthRecoveryModel | null {
  return payload.failed ?? payload.active;
}

/** REQ-NOTIFY-072: titled for authentication failure and naming the model that failed, or the active model where it is unknown. */
export function recoveryTitle(payload: Pick<AuthRecoveryPayload, 'failed' | 'active'>): string {
  const model = recoveryModel(payload);
  return model === null ? 'Authentication failed' : `Authentication failed for ${model.model}`;
}

/** REQ-NOTIFY-074: each listed model is labelled with its model name and its provider. */
export function modelLabel(model: Pick<AuthRecoveryModel, 'model' | 'providerName'>): string {
  return `${model.model} · ${model.providerName}`;
}

const pair = (m: Pick<AuthRecoveryModel, 'provider' | 'model'>): string => `${m.provider}|${m.model}`;

/**
 * REQ-NOTIFY-074: the first path's list — models from providers other than the one that failed, ahead of any others; where
 * no other provider offers a model, every model except the one that failed. The model that failed is never listed: retrying
 * it with the same credentials is what REQ-NOTIFY-068 forbids. A key listed twice is listed once, in the order given.
 */
export function recoveryModelList<M extends AuthRecoveryModel & { readonly key: string }>(models: readonly M[], failed: Pick<AuthRecoveryModel, 'provider' | 'model'> | null): readonly M[] {
  const seen = new Set<string>();
  const candidates = models.filter((m) => {
    if (seen.has(m.key) || (failed !== null && pair(m) === pair(failed))) return false;
    seen.add(m.key);
    return true;
  });
  if (failed === null) return candidates;
  const others = candidates.filter((m) => m.provider !== failed.provider);
  const same = candidates.filter((m) => m.provider === failed.provider);
  return [...others, ...same];
}
