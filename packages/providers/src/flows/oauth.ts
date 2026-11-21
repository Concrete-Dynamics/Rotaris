import { createHash, randomBytes } from 'node:crypto';
import { millis, type TimerHandle, type Timers } from '@rotaris/kernel';
import type { FetchLike } from '../discovery.js';

/**
 * ADR-0030 — what the interactive sign-in flows share: the two prompts of REQ-PROVIDER-012, the PKCE material of
 * REQ-PROVIDER-028, a cancellable wait on the timer port (REQ-PROVIDER-023/031/116: a cancellation ends a pending wait
 * early), a bounded request, and the UNVERIFIED claim read of ADR-0030 consequence 4.
 */
export type SignInPrompt =
  | { readonly kind: 'device-code'; readonly verificationUri: string; readonly userCode: string; readonly intervalSeconds: number; readonly expiresInSeconds: number }
  | { readonly kind: 'browser'; readonly url: string; readonly message: string };

export const CANCELLED_BY_USER = 'Cancelled by user';

/** What an authenticator needs from its caller; nothing here is a credential. */
export interface FlowDeps {
  readonly fetch: FetchLike;
  readonly timers: Timers;
  readonly signal?: AbortSignal;
  readonly prompt: (p: SignInPrompt) => void;
  readonly warn: (m: string) => void;
}

/** RFC 7636 §4.1: 32 random bytes, base64url without padding — 43 characters of the unreserved set (REQ-PROVIDER-028). */
export function pkceVerifier(random: (n: number) => Buffer = randomBytes): string {
  return random(32).toString('base64url');
}

export function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier, 'ascii').digest('base64url');
}

/** REQ-PROVIDER-028: a 32-byte URL-safe random state. */
export function oauthState(random: (n: number) => Buffer = randomBytes): string {
  return random(32).toString('base64url');
}

/** Resolves `true` after `ms`, or `false` the moment `signal` aborts; the timer never outlives the wait. */
export function cancellableWait(timers: Timers, ms: number, signal?: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal?.aborted) { resolve(false); return; }
    let handle: TimerHandle | null = null;
    const onAbort = (): void => { handle?.cancel(); resolve(false); };
    handle = timers.after(millis(ms), () => { signal?.removeEventListener('abort', onAbort); resolve(true); });
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** One request bounded by `timeoutMs` and by the flow's own cancellation. */
export async function boundedFetch(deps: Pick<FlowDeps, 'fetch' | 'signal'>, url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const bound = AbortSignal.timeout(timeoutMs);
  return deps.fetch(url, { ...init, signal: deps.signal ? AbortSignal.any([deps.signal, bound]) : bound });
}

export function formBody(fields: Readonly<Record<string, string>>): string {
  return new URLSearchParams(fields).toString();
}

/**
 * ADR-0030 consequence 4: the payload of a JWT, decoded and NOT VERIFIED. It is read for an account id the provider's
 * own endpoints then accept or refuse; it validates nothing and must never be used to decide that a token is genuine.
 */
export function unverifiedJwtClaims(token: string | null | undefined): Readonly<Record<string, unknown>> | null {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length < 2 || !parts[1]) return null;
  try {
    const claims: unknown = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return claims !== null && typeof claims === 'object' && !Array.isArray(claims) ? (claims as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function errorText(cause: unknown): string {
  return String((cause as Error)?.message ?? cause);
}
