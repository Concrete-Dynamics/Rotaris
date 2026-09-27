// @ts-check
/**
 * Files a proof puts in a directory it does not own, and gives back.
 *
 * `settings-proof` measures both branches of the About page's two bundled assets (REQ-SHELL-140, REQ-SHELL-142). The
 * built app, launched as `electron apps/desktop/out/main/index.js`, reads them from the source tree's
 * `apps/desktop/resources/` (`about.ts`: `process.resourcesPath` is Electron's own there), which is also where
 * `pnpm build-id` and `pnpm notices` write the real ones. So the proof must first move a real file aside (the absent
 * branch), then put its own there (the present branch), and at the end leave the directory exactly as it found it:
 * no fixture left behind, no real file clobbered.
 *
 * The stash is the record. A real file is MOVED into the stash before its name is declared proof-owned, and a name is
 * declared before any fixture is written under it, so at every instant `restore` knows what to do: a stashed file goes
 * back over whatever stands in its place, and an owned name with nothing stashed is removed. A proof killed between the
 * two (a signal, a power cut) is repaired by the next run's `restore`, which is why the stash lives outside the proof's
 * evidence directory — that one is deleted at the start of every run.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const LEDGER = 'owned.json';

/** A rename, or a copy and a removal where the two paths are on different filesystems. */
function move(from, to) {
  try { renameSync(from, to); } catch (e) {
    if (/** @type {NodeJS.ErrnoException} */ (e).code !== 'EXDEV') throw e;
    copyFileSync(from, to);
    rmSync(from);
  }
}

/** @param {string} stash @returns {string[]} */
function owned(stash) {
  try { const names = JSON.parse(readFileSync(join(stash, LEDGER), 'utf8')); return Array.isArray(names) ? names : []; } catch { return []; }
}

/**
 * Give `dir` back what a stage (this run's, or an interrupted earlier run's) took from it, and forget the stage.
 * Answers what it did, one line per name, for the proof's evidence.
 * @param {string} dir @param {string} stash @returns {string[]}
 */
export function restore(dir, stash) {
  if (!existsSync(stash)) return [];
  const did = [];
  // Every declared name, and every file in the stash whether declared or not: a file moved aside by a stage that died
  // before declaring it is still the real one, and removing the stash without it would lose it.
  const names = new Set([...owned(stash), ...readdirSync(stash).filter((n) => n !== LEDGER)]);
  for (const name of names) {
    const stashed = join(stash, name);
    rmSync(join(dir, name), { force: true });
    if (existsSync(stashed)) { move(stashed, join(dir, name)); did.push(`${name}: the file that was there is back`); }
    else did.push(`${name}: removed; nothing was there before`);
  }
  rmSync(stash, { recursive: true, force: true });
  return did;
}

/**
 * Take `names` in `dir` for the proof: each real file is moved into `stash`, then the name is declared owned. After
 * this, `dir` holds none of them, which is the absent branch; `put` writes the present one.
 * @param {string} dir @param {string} stash @param {readonly string[]} names
 */
export function stage(dir, stash, names) {
  mkdirSync(stash, { recursive: true });
  const declared = owned(stash);
  for (const name of names) {
    if (declared.includes(name)) continue;
    const real = join(dir, name);
    if (existsSync(real)) move(real, join(stash, name));
    declared.push(name);
    writeFileSync(join(stash, LEDGER), JSON.stringify(declared));
  }
}

/**
 * Write a proof-owned name's content in `dir`. Refuses a name `stage` did not take, so no real file is ever overwritten.
 * @param {string} dir @param {string} stash @param {string} name @param {string} text
 */
export function put(dir, stash, name, text) {
  if (!owned(stash).includes(name)) throw new Error(`${name} was not staged in ${dir}; writing it would overwrite a file the proof does not own`);
  writeFileSync(join(dir, name), text);
}
