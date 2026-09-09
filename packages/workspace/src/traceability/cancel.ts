/**
 * Cancellation (REQ-TRACE-220 to REQ-TRACE-229): a token safe to set from another thread, a cancelled predicate,
 * and a checkpoint that raises a dedicated error whose message states that a requirement index refresh was
 * cancelled and, optionally, where. Checkpoints sit between one document and the next and between one artifact and
 * the next (222), so the worst-case waste is a single read and a read under way is never interrupted.
 *
 * Two carriers, because the passes are synchronous loops: an `AbortSignal` (the seam's `PassOptions.signal`) for the
 * in-thread case, and an `Int32Array` over a `SharedArrayBuffer` for the worker-thread case, where a message could
 * not be observed until the loop yielded but an atomic store is observed at the very next checkpoint.
 */
export interface CancelToken {
  readonly signal?: AbortSignal;
  readonly flag?: Int32Array;
}

export class CancelledError extends Error {
  constructor(readonly where?: string) {
    super(`the requirement index refresh was cancelled${where === undefined ? '' : ` (${where})`}`);
    this.name = 'CancelledError';
  }
}

export function sharedCancelFlag(): Int32Array {
  return new Int32Array(new SharedArrayBuffer(4));
}

export function raiseCancelFlag(flag: Int32Array): void {
  Atomics.store(flag, 0, 1);
}

export function isCancelled(token: CancelToken | undefined): boolean {
  if (token === undefined) return false;
  if (token.signal?.aborted) return true;
  return token.flag !== undefined && Atomics.load(token.flag, 0) !== 0;
}

/** Raise `CancelledError` when the token is set; a pass calls this between one unit of work and the next. */
export function checkpoint(token: CancelToken | undefined, where?: string): void {
  if (isCancelled(token)) throw new CancelledError(where);
}

/** REQ-TRACE-224: a fresh token per pass, never carried over; the signal is one-way and never clears. */
export function freshToken(signal?: AbortSignal, flag?: Int32Array): CancelToken {
  const t: { signal?: AbortSignal; flag?: Int32Array } = {};
  if (signal !== undefined) t.signal = signal;
  if (flag !== undefined) t.flag = flag;
  return t;
}
