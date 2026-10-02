/**
 * REQ-NOTIFY-060 — a failed run's failure is matched against four classes in this order, the first match handling it:
 * an authentication failure; a sandboxed launch that was refused; a quota or rate limit; anything else.
 *
 * Pure: the failure text the run reported (`RunResult.error`) and the one fact the text cannot carry. Main's run-result
 * handler is the caller (`index.ts`).
 */
export type RunFailureClass = 'authentication' | 'sandbox' | 'quota' | 'generic';

/**
 * REQ-NOTIFY-067's markers, matched ignoring case. `401` counts only standing alone — not inside a longer number or word,
 * so `4010` or `E401x` does not match — and is tested apart (`STANDING_401`).
 */
export const AUTHENTICATION_MARKERS = ['api key not valid', 'authentication error', 'authentication fail', 'authenticationerror', 'incorrect api key', 'invalid api key', 'invalid_api_key', 'unauthorized'] as const;
const STANDING_401 = /(?<![\p{L}\p{N}_])401(?![\p{L}\p{N}_])/u;

/** REQ-NOTIFY-062/063's rate-limit or quota marker, as main matched it before the classes were built (Part Q). */
const QUOTA = /rate.?limit|quota|429|too many requests/i;

/** REQ-NOTIFY-067: whether the failure text counts as an authentication failure. */
export function isAuthenticationFailure(text: string): boolean {
  const lower = text.toLowerCase();
  return STANDING_401.test(lower) || AUTHENTICATION_MARKERS.some((m) => lower.includes(m));
}

/** REQ-NOTIFY-062/063/093: whether the failure text carries a rate-limit or quota marker, whatever the run's class. */
export function isQuotaFailure(text: string): boolean {
  return QUOTA.test(text);
}

export interface RunFailureFacts {
  /**
   * REQ-NOTIFY-061: a sandbox mode was requested and the run never reached a started state. A refused confinement mode is
   * refused before a run exists and has its own notice where the start, the prompt or the continue is refused
   * (`confinementRefusalNotice`, `commands/session.ts`), so the run-result handler never sets this; it keeps the class's
   * place in the order.
   */
  readonly sandboxRefused?: boolean;
}

export function classifyRunFailure(error: string | null, facts: RunFailureFacts = {}): RunFailureClass {
  const text = error ?? '';
  if (isAuthenticationFailure(text)) return 'authentication';
  if (facts.sandboxRefused === true) return 'sandbox';
  if (isQuotaFailure(text)) return 'quota';
  return 'generic';
}
