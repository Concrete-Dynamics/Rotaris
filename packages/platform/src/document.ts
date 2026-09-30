import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, writeSync, chmodSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { countNoun, err, type Failure, failure, type Millis, ok, type Result, type Timers } from '@rotaris/kernel';

/**
 * ADR-0004 — one document primitive, three write shapes, and a guarded read.
 *
 * Replace: stage into the target's own parent, write, fsync the staged file,
 * rename over the target, remove the staged file on every failure path, apply
 * the declared mode. No directory fsync — measured to fail with EPERM on
 * every spelling via the naive call, and no requirement asks for one (D-27).
 *
 * The retry ladder: on Windows a rename over an existing file fails on a
 * transient handle (D-06) — and on shared storage 6.2 % of the time with no
 * other opener at all (D-25). The retry MUST NOT be conditioned on being able
 * to attribute the failure to another process (REQ-TRACE-061). The ladder's
 * constants are the caller's, because each domain declares its own; the
 * primitive takes them as a parameter and states none.
 *
 * Exclusive create: create with O_EXCL; on already-exists, read what is there
 * and use it — not an error (D-29). Never replaces.
 *
 * Guarded read: read; if the decode fails while the file is known to exist,
 * retry once before reporting, keyed on decode-failure-after-stat rather than
 * on emptiness (REQ-CONFIG-017 makes empty legitimate).
 *
 * Rule 1: readers hold no descriptor across a call. Every read here is
 * open-read-close.
 */

export interface RetryLadder {
  /** Delays before each retry, in order. Length is the maximum number of retries. */
  readonly delays: readonly Millis[];
}
export const NO_RETRY: RetryLadder = { delays: [] };

export interface ReplaceOptions {
  /** Numeric mode to apply after the rename; where given, it is read back (REQ-PROVIDER-016). */
  readonly mode?: number;
  readonly ladder?: RetryLadder;
  readonly timers?: Timers;
  /** Create the parent directory when the store declares it may be missing (REQ-TRACE-061). */
  readonly createParent?: boolean;
}

function stagePath(target: string): string {
  return join(dirname(target), `.${basename(target)}.staging-${process.pid}-${Math.random().toString(36).slice(2, 8)}`);
}

function transient(code: string | undefined): boolean {
  return code === 'EPERM' || code === 'EACCES' || code === 'EBUSY';
}

/** Replace the whole of `target` with `content`, atomically as a reader observes. */
export async function replaceDocument(target: string, content: string | Uint8Array, opts: ReplaceOptions = {}): Promise<Result<{ attempts: number }, Failure>> {
  /**
   * A destination the caller chose can refuse the parent itself — a file standing where the directory would go,
   * a folder the account may not write into, a path that is not one. This function's whole contract is a
   * `Result`, and a raised `mkdirSync` escaped it: found by A9's destination-failure coverage, where the export
   * of REQ-EVENTS-145 goes to a destination the user picked in a file chooser and the failure must reach them as
   * the recoverable refusal REQ-TRACE-061 requires, not as an exception thrown through the run host's command.
   */
  if (opts.createParent) {
    try { mkdirSync(dirname(target), { recursive: true }); }
    catch (e) { return err(failure('document.parent', 'The destination folder could not be created', String(e), e)); }
  }
  const staged = stagePath(target);
  try {
    const fd = openSync(staged, 'w');
    try {
      if (typeof content === 'string') writeSync(fd, content); else writeSync(fd, content);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  } catch (e) {
    rmSync(staged, { force: true });
    return err(failure('document.stage', 'Could not write the staged file', String(e), e));
  }

  const ladder = opts.ladder ?? NO_RETRY;
  let attempt = 0;
  for (;;) {
    attempt += 1;
    try {
      renameSync(staged, target);
      break;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      const delay = ladder.delays[attempt - 1];
      if (transient(code) && delay !== undefined && opts.timers) {
        await new Promise<void>((resolve) => opts.timers!.after(delay, resolve));
        continue;
      }
      rmSync(staged, { force: true });
      return err(failure('document.replace', 'Could not replace the document', `${code ?? 'unknown'} after ${countNoun(attempt, 'attempt')}: ${target}`, e));
    }
  }

  if (opts.mode !== undefined) {
    try {
      chmodSync(target, opts.mode);
      const back = statSync(target).mode & 0o777;
      // On Windows chmod only carries the write bit; the ACL adapter (ADR-0029) does the rest and reads it back.
      if (process.platform !== 'win32' && back !== opts.mode) {
        return err(failure('document.mode', 'The protection could not be established', `wanted ${opts.mode.toString(8)}, read back ${back.toString(8)}`));
      }
    } catch (e) {
      return err(failure('document.mode', 'The protection could not be applied', String(e), e));
    }
  }
  return ok({ attempts: attempt });
}

/** Synchronous replace for the one gesture whose durability is part of its completion: theme selection (ADR-0042). */
export function replaceDocumentSync(target: string, content: string | Uint8Array, opts: Omit<ReplaceOptions, 'ladder' | 'timers'> = {}): Result<{ attempts: 1 }, Failure> {
  if (opts.createParent) mkdirSync(dirname(target), { recursive: true });
  const staged = stagePath(target);
  try {
    const fd = openSync(staged, 'w');
    try {
      if (typeof content === 'string') writeSync(fd, content); else writeSync(fd, content);
      fsyncSync(fd);
    } finally { closeSync(fd); }
    renameSync(staged, target);
    if (opts.mode !== undefined) chmodSync(target, opts.mode);
    return ok({ attempts: 1 });
  } catch (e) {
    rmSync(staged, { force: true });
    return err(failure('document.replace.sync', 'Could not replace the document synchronously', String(e), e));
  }
}

export type ExclusiveCreate = { readonly minted: true } | { readonly minted: false; readonly existing: string };

/** Create `target` exclusively with `content`; if it already exists, return its contents instead (D-29). */
export function exclusiveCreate(target: string, content: string): Result<ExclusiveCreate, Failure> {
  mkdirSync(dirname(target), { recursive: true });
  let fd: number;
  try {
    fd = openSync(target, 'wx');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EEXIST') {
      try {
        return ok({ minted: false, existing: readFileSync(target, 'utf8') });
      } catch (re) {
        return err(failure('document.exclusive.read', 'The existing document could not be read', String(re), re));
      }
    }
    return err(failure('document.exclusive', 'Could not create the document', String(e), e));
  }
  try {
    writeSync(fd, content);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  return ok({ minted: true });
}

export type ReadOutcome<T> = { readonly state: 'absent' } | { readonly state: 'readable'; readonly value: T } | { readonly state: 'unreadable'; readonly raw: string; readonly reason: string };

/**
 * Guarded read: open-read-close; a decode failure while the file is known to
 * exist is retried once before being reported. Absent is not an error.
 */
export function guardedRead<T>(target: string, decode: (raw: string) => T): ReadOutcome<T> {
  const attempt = (): ReadOutcome<T> | 'retry' => {
    let raw: string;
    try {
      raw = readFileSync(target, 'utf8');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { state: 'absent' };
      return { state: 'unreadable', raw: '', reason: String(e) };
    }
    try {
      return { state: 'readable', value: decode(raw) };
    } catch (e) {
      try {
        statSync(target);
      } catch {
        return { state: 'absent' };
      }
      return raw.length === 0 || e ? 'retry' : { state: 'unreadable', raw: raw.slice(0, 200), reason: String(e) };
    }
  };
  const first = attempt();
  if (first !== 'retry') return first;
  const second = attempt();
  if (second !== 'retry') return second;
  let raw = '';
  try {
    raw = readFileSync(target, 'utf8');
  } catch {
    return { state: 'absent' };
  }
  return { state: 'unreadable', raw: raw.slice(0, 200), reason: 'decode failed twice while the file exists' };
}
