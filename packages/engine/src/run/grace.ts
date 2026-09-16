import { millis, type Millis } from '@rotaris/kernel';

/**
 * ADR-0014 rule 1: the one 30 s allowance. It is shared by the cancellation grace, the force-exit
 * backstop and — since REQ-ORCH-088's landing was built — the window a child gets to finish the step
 * it is in before it is cut off.
 *
 * It sits in a module of its own rather than in `run.ts` because `children/orchestration.ts` is the
 * third reader and `run.ts` already imports that file. Read across that cycle, the constant is
 * `undefined` at module-initialisation time, and a timer armed with `undefined` gets a NaN deadline
 * that never comes due — a child asked to land would then never be cut off at all. That was measured,
 * not feared: the backstop's first regression test hung on exactly it before this file existed.
 */
export const STOP_GRACE: Millis = millis(30_000);
