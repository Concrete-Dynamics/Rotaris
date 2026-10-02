// @ts-check
/**
 * The live run's startup sweep of `$TMPDIR/rotaris-live-run/`, told a leftover from a live sibling.
 *
 * Every live run makes its sandbox there, and the sandbox holds a real credential (the app writes the leased key into
 * its own store). The sweep exists so a run that died without its cleanup does not strand that key: a leftover loses
 * its credentials, and its whole directory unless `--keep` marked it `KEPT`. It used to treat EVERY directory there as
 * a leftover. When two live runs overlapped on one host — two worktrees, or two workflows — the one that started second
 * deleted the first one's workspace, store and key while that run's app was still using them; the first run spent its
 * tokens and died reading its store back (`expected one workspace database … found 0`), six times on 2026-09-29/30
 * (`docs/defects/fixed/a-live-run-sweeps-a-concurrent-live-runs-sandbox.md`).
 *
 * The rule now: each run writes `OWNER` into its sandbox the moment it makes it — its pid and its start — and the sweep
 * reads it before touching anything.
 *
 *   - `OWNER` names a process that exists (`pidExists`, the same probe the proofs' lock reading uses): a live sibling.
 *     Left alone — its credentials too, because it is signed in with them.
 *   - `OWNER` names a process that is gone: a leftover, swept at once.
 *   - `OWNER` is older than `LIVE_RUN_CEILING_MS` whatever the probe says: a pid can be reused, and no live run lasts
 *     that long, so it is a leftover whose pid now belongs to something else. Swept.
 *   - No `OWNER` (a run that predates this rule, or one caught in the instant between making its directory and writing
 *     the file): its age is read from the stamp the directory is named by, or its mtime. Swept only once older than
 *     the ceiling, so a still-running run on an older copy of the script is not deleted under it; the cost is that such
 *     a leftover keeps its credential in the temp directory until then, where before it kept it until the next run.
 *   - `KEPT` is honoured as before, but only for a leftover: a kept directory's credentials are dropped, the rest stays.
 *
 * A sweep that cannot remove a directory (a locked handle — measured 2026-09-19, a language server holding the old
 * workspace open) reports it and continues; the next run tries again.
 *
 * Nothing here is product code. It runs only from `live-run.mjs`.
 */

import { existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pidExists } from './lock-holder.mjs';

export const OWNER_FILE = 'OWNER';
export const KEPT_FILE = 'KEPT';

/**
 * Far longer than any live run lasts. The longest on this host's evidence packs took about forty minutes (the duress
 * scenario, 2026-09-29, 03:06 to 03:46; the whole default set 03:05 after starting at 02:41), and the workflows bound a
 * run at an hour (`timeout 3600`). Past this, a pid that probes alive is taken as reused, not as the run's.
 */
export const LIVE_RUN_CEILING_MS = 12 * 60 * 60 * 1000;

/**
 * Written by a run into its own sandbox, immediately after making it.
 * @param {string} dir
 * @param {{ pid?: number, startedAt?: Date }} [who]
 */
export function writeOwner(dir, { pid = process.pid, startedAt = new Date() } = {}) {
  writeFileSync(join(dir, OWNER_FILE), `${JSON.stringify({ pid, startedAt: startedAt.toISOString() })}\n`);
}

/**
 * @param {string} dir
 * @returns {{ pid: number, startedAt: number } | null} null when absent or unreadable
 */
export function readOwner(dir) {
  let text;
  try { text = readFileSync(join(dir, OWNER_FILE), 'utf8'); } catch { return null; }
  try {
    const parsed = JSON.parse(text);
    const startedAt = Date.parse(parsed?.startedAt);
    if (!Number.isInteger(parsed?.pid) || parsed.pid <= 0 || !Number.isFinite(startedAt)) return null;
    return { pid: parsed.pid, startedAt };
  } catch { return null; }
}

/**
 * The instant a sandbox's name records: `live-run.mjs` names it `new Date().toISOString()` with `:` and `.` as `-`.
 * @param {string} name
 * @returns {number | null}
 */
export function stampTime(name) {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/.exec(name);
  if (!m) return null;
  const t = Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`);
  return Number.isFinite(t) ? t : null;
}

/**
 * What the sweep does with one directory, and why.
 * @param {string} dir
 * @param {string} name
 * @param {{ now: number, probe: (pid: number) => boolean, ownPid: number }} ctx
 * @returns {{ action: 'leave' | 'drop-credentials' | 'remove', reason: string }}
 */
export function sweepVerdict(dir, name, { now, probe, ownPid }) {
  const owner = readOwner(dir);
  const leftover = (reason) => existsSync(join(dir, KEPT_FILE))
    ? /** @type {const} */ ({ action: 'drop-credentials', reason: `${reason}; kept by --keep` })
    : /** @type {const} */ ({ action: 'remove', reason });
  if (owner !== null) {
    const age = now - owner.startedAt;
    if (age > LIVE_RUN_CEILING_MS) return leftover(`its owner (pid ${owner.pid}) started ${Math.round(age / 3_600_000)} h ago, past any live run`);
    if (owner.pid !== ownPid && probe(owner.pid)) return { action: 'leave', reason: `a live run (pid ${owner.pid}) is using it` };
    return leftover(`its owner (pid ${owner.pid}) is gone`);
  }
  let born = stampTime(name);
  if (born === null) { try { born = statSync(dir).mtimeMs; } catch { born = now; } }
  const age = now - born;
  if (age <= LIVE_RUN_CEILING_MS) return { action: 'leave', reason: `no ${OWNER_FILE}, and too recent (${Math.round(age / 60_000)} min) to be taken for a leftover` };
  return leftover(`no ${OWNER_FILE}, made ${Math.round(age / 3_600_000)} h ago`);
}

/**
 * Sweeps `root`, never touching a directory a live run owns.
 * @param {string} root
 * @param {{
 *   dropCredentials: (dir: string) => void,
 *   now?: number, probe?: (pid: number) => boolean, ownPid?: number,
 *   remove?: (dir: string) => void, warn?: (message: string) => void,
 * }} deps
 * @returns {{ dir: string, action: 'leave' | 'drop-credentials' | 'remove', reason: string }[]}
 */
export function sweepSandboxes(root, { dropCredentials, now = Date.now(), probe = pidExists, ownPid = process.pid,
  remove = (dir) => rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }),
  warn = (message) => console.error(message) }) {
  const outcomes = [];
  for (const name of existsSync(root) ? readdirSync(root) : []) {
    const dir = join(root, name);
    try { if (!statSync(dir).isDirectory()) continue; } catch { continue; }
    const verdict = sweepVerdict(dir, name, { now, probe, ownPid });
    outcomes.push({ dir, ...verdict });
    if (verdict.action === 'leave') continue;
    try {
      dropCredentials(dir);
      if (verdict.action === 'remove') remove(dir);
    } catch (cause) {
      warn(`warning: the previous sandbox could not be swept (${dir}): ${cause instanceof Error ? cause.message : String(cause)} — continuing with a fresh one.`);
    }
  }
  return outcomes;
}
