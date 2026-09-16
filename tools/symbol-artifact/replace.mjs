// @ts-check
// REQ-TRACE-061 / REQ-TRACE-502 (OQ-41) — the atomic replacement the requirement-symbol artifact is written
// through, and the bounded ladder behind it.
//
// This is a plain Node module with nothing installed, because its callers are a build script and vitest's
// before-collection hook; `@rotaris/platform`'s primitive (ADR-0004) is not reachable from either. What is
// shared with that primitive is the contract and the constants, and both are the requirement's rather than
// this file's: a staged file in the target's own parent, a rename over the target, the staged file removed on
// every failure path, and on exhaustion a stated failure with the previous file exactly as it stood.
//
// The falsified reading, kept beside its replacement: the generator wrote the artifact with one `writeFileSync`
// over the target. Two obligations it could not meet, both reachable in the case OQ-41 keeps open — a
// REQ-TRACE-182 test session regenerating in the same checkout as another invocation. A concurrent reader could
// observe a PARTIAL artifact, which REQ-TRACE-502 forbids in terms; and a transient replacement failure
// (constraint D-06, measured on Windows against any open handle) escaped uncharacterised.

import { renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

/** REQ-TRACE-061: four delays behind five attempts in total; the last begins no more than 0.75 s after the first. */
export const LADDER_MS = [50, 100, 200, 400];

/** A transient replacement condition: Windows against an open handle, and shared storage with no opener at all. */
function transient(code) {
  return code === 'EPERM' || code === 'EACCES' || code === 'EBUSY';
}

/**
 * A synchronous sleep. These callers are scripts whose whole job is one file and which have no event loop to
 * yield to; `Atomics.wait` is the runtime's own blocking wait and needs nothing installed.
 */
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Replace the whole of `target` with `text`, atomically as a reader observes it.
 *
 * @param {string} target absolute path; its parent must exist
 * @param {string} text the whole new contents
 * @returns {number} the attempt the replacement succeeded on, 1 through 5
 * @throws {Error} on exhaustion, naming the code and the attempts, with `target` left exactly as it stood
 */
export function replaceAtomically(target, text) {
  const staged = join(dirname(target), `.${basename(target)}.staging-${process.pid}-${Math.random().toString(36).slice(2, 8)}`);
  for (let attempt = 1; ; attempt += 1) {
    try {
      // The STAGING write is inside the ladder, not before it. This function declares ONE failure shape — the
      // sentence below, naming the code and the attempts — and a staging refusal used to escape it raw, as
      // `EACCES: permission denied, open '<staged>'`. It is the same condition the ladder exists for: on a
      // write-denied parent the refusal lands here, and on Windows against an open handle it lands on the
      // rename. Re-writing the same bytes on a later attempt is idempotent (defect, found on Linux, 2026-09-16).
      writeFileSync(staged, text);
      renameSync(staged, target);
      return attempt;
    } catch (e) {
      const code = /** @type {NodeJS.ErrnoException} */ (e).code;
      const delay = LADDER_MS[attempt - 1];
      if (transient(code) && delay !== undefined) { sleepSync(delay); continue; }
      rmSync(staged, { force: true });
      throw new Error(`${basename(target)} could not be replaced (${code ?? 'unknown'} after ${attempt} attempt(s)); it was left exactly as it stood`);
    }
  }
}
