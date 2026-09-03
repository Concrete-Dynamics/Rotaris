/**
 * A result that is a value, never a throw across a boundary.
 *
 * Every command over the IPC contract returns an explicit outcome rather than
 * throwing (ADR-0044), every control answers `false` rather than raising
 * (ADR-0010, REQ-MONITOR-005 to REQ-MONITOR-011), and every failure a user
 * sees needs a headline and a detail block (REQ-NOTIFY-005). This is the one
 * shape all of those share.
 */
export type Ok<T> = { readonly ok: true; readonly value: T };
export type Err<E> = { readonly ok: false; readonly error: E };
export type Result<T, E = Failure> = Ok<T> | Err<E>;

/** A failure a person may be shown: a headline, a detail block, and a stable code. */
export interface Failure {
  readonly code: string;
  readonly headline: string;
  readonly detail?: string;
  readonly cause?: unknown;
}

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const err = <E>(error: E): Err<E> => ({ ok: false, error });

export function failure(code: string, headline: string, detail?: string, cause?: unknown): Failure {
  const f: { code: string; headline: string; detail?: string; cause?: unknown } = { code, headline };
  if (detail !== undefined) f.detail = detail;
  if (cause !== undefined) f.cause = cause;
  return f;
}

export function isOk<T, E>(r: Result<T, E>): r is Ok<T> {
  return r.ok;
}

export function unwrap<T, E>(r: Result<T, E>): T {
  if (r.ok) return r.value;
  throw new Error(`unwrap on Err: ${JSON.stringify(r.error)}`);
}

export function mapResult<T, U, E>(r: Result<T, E>, f: (t: T) => U): Result<U, E> {
  return r.ok ? ok(f(r.value)) : r;
}
