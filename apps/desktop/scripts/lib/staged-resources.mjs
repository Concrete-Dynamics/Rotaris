// @ts-check
/**
 * Files a proof puts in a directory it does not own, and gives back.
 *
 * `settings-proof` measures both branches of the About page's two files (REQ-SHELL-140, REQ-SHELL-142). The built app,
 * launched as `electron apps/desktop/out/main/index.js`, reads them from the source tree's `apps/desktop/resources/`
 * (`about.ts`: `process.resourcesPath` is Electron's own there), which is also where `pnpm build-id` and `pnpm notices`
 * write the real ones. So the proof must first move a real file aside (the absent branch), then put its own there (the
 * present branch), and at the end leave the directory exactly as it found it: no fixture left behind, no real file
 * clobbered.
 *
 * The stash is the record. A real file is MOVED into the stash before its name is declared proof-owned, and a name is
 * declared before anything is written under it. The ledger then says, for each owned name, what the proof has put there:
 * nothing yet; something being written now; or a file it wrote, by its SHA-256 and modification time. So `restore` can
 * tell the proof's file from one written by someone else after the proof took the name — a `pnpm build-id` or
 * `pnpm notices` run between an interrupted proof and the next. The proof's file goes, and what was moved aside comes
 * back. A file someone else wrote since is newer than the one moved aside, so it stays and the stashed one is dropped.
 * A proof killed at any point (a signal, a power cut) is repaired by the next run's `restore`, which is why the stash
 * lives outside the proof's evidence directory — that one is deleted at the start of every run.
 *
 * One window is not closed: while a name is being written, whatever stands there is taken for the proof's. A proof
 * killed during that write, followed by a real generation before the next run, loses the real file. The window is the
 * length of one write — for `settings-proof`, one run of `pnpm build-id`.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const LEDGER = 'owned.json';
/** What the proof has put under an owned name. */
const NOTHING = null;
const WRITING = 'writing';

/** A rename, or a copy and a removal where the two paths are on different filesystems. */
function move(from, to) {
  try { renameSync(from, to); } catch (e) {
    if (/** @type {NodeJS.ErrnoException} */ (e).code !== 'EXDEV') throw e;
    copyFileSync(from, to);
    rmSync(from);
  }
}

/**
 * A file's identity for `restore`: its content and when it was last written. The time is there because a real writer
 * can write the same bytes the proof did (`pnpm build-id` over the same tree), and that file is still not the proof's.
 * @param {string} path @returns {{ sha256: string, mtimeMs: number } | null}
 */
function markOf(path) {
  try { return { sha256: createHash('sha256').update(readFileSync(path)).digest('hex'), mtimeMs: statSync(path).mtimeMs }; } catch { return null; }
}

/** @param {string} stash @returns {Record<string, null | 'writing' | { sha256: string, mtimeMs: number }>} */
function ledger(stash) {
  try {
    const value = JSON.parse(readFileSync(join(stash, LEDGER), 'utf8'));
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}
function record(stash, entries) { writeFileSync(join(stash, LEDGER), JSON.stringify(entries)); }

/**
 * Give `dir` back what a stage (this run's, or an interrupted earlier run's) took from it, and forget the stage.
 * Answers what it did, one line per name, for the proof's evidence.
 * @param {string} dir @param {string} stash @returns {string[]}
 */
export function restore(dir, stash) {
  if (!existsSync(stash)) return [];
  const did = [];
  const entries = ledger(stash);
  // Every declared name, and every file in the stash whether declared or not: a file moved aside by a stage that died
  // before declaring it is still the real one, and removing the stash without it would lose it.
  const names = new Set([...Object.keys(entries), ...readdirSync(stash).filter((n) => n !== LEDGER)]);
  for (const name of names) {
    const here = join(dir, name);
    const stashed = join(stash, name);
    const state = entries[name] ?? NOTHING;
    const standing = markOf(here);
    const proofs = standing !== null && (state === WRITING || (state !== NOTHING && state.sha256 === standing.sha256 && state.mtimeMs === standing.mtimeMs));
    if (standing !== null && !proofs) {
      // Written by someone else after the proof took the name: newer than anything the stash holds.
      const dropped = existsSync(stashed);
      rmSync(stashed, { force: true });
      did.push(`${name}: a file written since the proof took the name stands there; kept${dropped ? ', and the older one moved aside dropped' : ''}`);
      continue;
    }
    rmSync(here, { force: true });
    if (existsSync(stashed)) { move(stashed, here); did.push(`${name}: the file that was there is back`); }
    else did.push(`${name}: removed; nothing was there before`);
  }
  rmSync(stash, { recursive: true, force: true });
  return did;
}

/**
 * Take `names` in `dir` for the proof: each real file is moved into `stash`, then the name is declared owned. After
 * this, `dir` holds none of them, which is the absent branch; `put` or `produce` writes the present one.
 * @param {string} dir @param {string} stash @param {readonly string[]} names
 */
export function stage(dir, stash, names) {
  mkdirSync(stash, { recursive: true });
  const entries = ledger(stash);
  for (const name of names) {
    if (name in entries) continue;
    const real = join(dir, name);
    if (existsSync(real)) move(real, join(stash, name));
    entries[name] = NOTHING;
    record(stash, entries);
  }
}

/**
 * Have `write` write a proof-owned name in `dir` — the proof's own text, or a real writer run on the proof's behalf —
 * and record what it wrote. Refuses a name `stage` did not take, so no real file is ever overwritten. Answers what
 * `write` answered. A `write` that throws leaves the name marked as being written, so `restore` removes what it left.
 * @template T @param {string} dir @param {string} stash @param {string} name @param {() => T} write @returns {T}
 */
export function produce(dir, stash, name, write) {
  const entries = ledger(stash);
  if (!(name in entries)) throw new Error(`${name} was not staged in ${dir}; writing it would overwrite a file the proof does not own`);
  entries[name] = WRITING;
  record(stash, entries);
  const answer = write();
  entries[name] = markOf(join(dir, name)) ?? NOTHING;
  record(stash, entries);
  return answer;
}

/**
 * Write a proof-owned name's content in `dir` (`produce`, with the text as the write).
 * @param {string} dir @param {string} stash @param {string} name @param {string} text
 */
export function put(dir, stash, name, text) {
  produce(dir, stash, name, () => writeFileSync(join(dir, name), text));
}
