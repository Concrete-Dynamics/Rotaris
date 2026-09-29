/**
 * REQ-STARTUP-121 / ADR-0055 ("The update restart is a hand-over of the record") — main's side of the wait for the
 * successor a `Restart now` started. Pure: the instance claim reports into it (`acceptSuccessor`, `onRecordPassed`,
 * `onRecordPassFailed` in `@rotaris/platform`'s `ClaimDeps`) and the updater's `startSuccessor` port awaits it.
 *
 * The wait settles exactly once, three ways:
 *   - the record passed to the successor → resolve, and the updater closes the windows;
 *   - the successor could not be started (the spawn failed) → reject;
 *   - the successor started and announced itself, was accepted, but the record could not be passed to it — the record
 *     no longer names this instance, the successor stopped waiting (it closed before acknowledging the offer, or its
 *     acknowledgement did not arrive within the hand-over interval — `instance.ts`'s two-step pass), or the record's
 *     atomic replacement failed → reject with that reason.
 * Every rejection reaches REQ-STARTUP-121's failure branch: nothing closes, `Update not installed` surfaces, and the
 * updater's one-operation-in-flight guard clears. The third way was missing at the first verification: the wait stayed
 * armed for ever and every later update action answered `update.busy`.
 *
 * It has no timeout (ADR-0055): a successor that never announces itself leaves this instance as it is.
 */
export interface SuccessorWait {
  /** Whether a restart is waiting for its successor — the one case in which the record may pass (REQ-STARTUP-161). */
  accepting(): boolean;
  /** The record has passed to the successor. */
  passed(): void;
  /** An accepted successor could not be given the record; `reason` says which check refused it. */
  failed(reason: string): void;
  /** Arm the wait, then start the successor through `spawn`; settles as the header states. */
  start(spawn: () => Promise<void>): Promise<void>;
}

/** The sentence a pass failure rejects with; the updater prefixes it with the target it could not start. */
export const passFailedSentence = (reason: string): string => `the record could not be passed to it — ${reason}`;

export function createSuccessorWait(): SuccessorWait {
  let pending: { resolve: () => void; reject: (cause: Error) => void } | undefined;
  const settle = (outcome: { ok: true } | { ok: false; cause: Error }): void => {
    const current = pending;
    if (current === undefined) return;
    pending = undefined;
    if (outcome.ok) current.resolve(); else current.reject(outcome.cause);
  };
  return {
    accepting: () => pending !== undefined,
    passed: () => { settle({ ok: true }); },
    failed: (reason) => { settle({ ok: false, cause: new Error(passFailedSentence(reason)) }); },
    start(spawn) {
      if (pending !== undefined) return Promise.reject(new Error('a restart is already waiting for its successor'));
      const waited = new Promise<void>((resolve, reject) => { pending = { resolve, reject }; });
      spawn().catch((cause: unknown) => { settle({ ok: false, cause: cause instanceof Error ? cause : new Error(String(cause)) }); });
      return waited;
    },
  };
}
