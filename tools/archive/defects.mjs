// The archive's fourth kind (R-092; `docs/README.md`, "The archive"; `docs/architecture/hardening.md` §6 row 5): a
// repaired defect note is history, and it lives in `docs/archive/defects/<name>.md`. Until 2026-11-01 a repaired note
// moved to `docs/defects/fixed/` instead, beside the open ones' folder, and 831 had gathered there; that folder is
// retired. This kind moves every note still under it, so a note a branch moved to `fixed/` before it rebased over the
// retirement moves on the next run too, and repoints every pointer to it:
//
//   - a Markdown link in the record (the files `recordFiles` reads, the archive among them) whose target is the note;
//   - a `docs/defects/fixed/<name>.md` path written anywhere in a record file, and one written relative to its file
//     (`../defects/fixed/<name>.md`), as inline code or as text; the request log is the orchestrator's alone to edit
//     (`PROSE_EXEMPT`), so in it only link targets move, as the open questions' move did;
//   - a `docs/defects/fixed/<name>.md` path in the code (`apps/`, `packages/`, `tools/`), in the repository's agent
//     instructions (`.agents/`, `.claude/`, `.github/`) and in the root's own files (`.gitattributes`, `package.json`),
//     which cite notes the same way; and there a `../defects/fixed/<name>.md` a generator writes into a page under
//     `docs/` (the proof registry's), as `../archive/defects/<name>.md`: both folders sit two below `docs/`, so the
//     same prefix reaches either, wherever the path is read from.
//
// A pointer is repointed when the note it names is in the archive, whether this run moved it or an earlier one did,
// so a pointer another branch adds to an old path is repointed by the next run. The note's own text keeps its words;
// only its relative paths are rewritten to reach the same files from its new folder. Two notes of one name collide:
// the run stops and names both, since whether they are one defect is a reader's call (`references/repository.md`,
// "Merge conflicts").
import { existsSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { PROSE_EXEMPT, codeFiles, isRelative, recordFiles } from '../check-record-links.mjs';
import { decoded, rebase, relativeLink, rewriteLinkTargets, slashed, splitTarget } from './text.mjs';

/** The retired folder, and the archive's, relative to the repository root. */
export const FIXED_DIR = ['docs', 'defects', 'fixed'].join('/');
export const ARCHIVE_DEFECTS = 'docs/archive/defects';

/** The repository's agent instructions, which cite notes by their repository path as the code does. */
const INSTRUCTION_ROOTS = ['.agents', '.claude', '.github'];
const INSTRUCTION_FILE = /\.(?:md|[cm]?js|ts|json|ya?ml)$/;

/**
 * The notes still under the retired folder, by name, in order.
 * @param {string} root
 * @returns {string[]}
 */
export function qualifying(root) {
  const dir = join(root, ...FIXED_DIR.split('/'));
  return existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith('.md') && statSync(join(dir, n)).isFile()).sort() : [];
}

/**
 * Move every note under the retired folder into the archive, in the tree; returns what moved.
 * @param {string} root
 * @param {import('./text.mjs').Tree} tree
 * @returns {{ kind: 'defect', id: string, from: string, to: string }[]}
 */
export function planDefects(root, tree) {
  const from = join(root, ...FIXED_DIR.split('/'));
  const into = join(root, ...ARCHIVE_DEFECTS.split('/'));
  const names = qualifying(root);
  /** @type {Map<string, string>} */
  const moved = new Map(names.map((n) => [resolve(from, n), resolve(into, n)]));
  for (const name of names) {
    const there = join(into, name);
    if (tree.exists(there) && tree.read(there) !== tree.read(join(from, name))) {
      throw new Error(`${FIXED_DIR}/${name} and ${ARCHIVE_DEFECTS}/${name} are two notes of one name: merge them if they ` +
        'describe one defect, else rename the later one and repoint its links (.agents/skills/orchestrated-build/references/repository.md, "Merge conflicts")');
    }
  }
  for (const name of names) {
    const old = join(from, name);
    const next = join(into, name);
    tree.write(next, rebase(tree.read(old), old, next, tree, moved));
    tree.remove(old);
  }
  return names.map((name) => ({ kind: 'defect', id: name, from: `${FIXED_DIR}/${name}`, to: `${ARCHIVE_DEFECTS}/${name}` }));
}

/** A note path from the root, under the retired folder. */
const ROOT_FIXED = /(?<![A-Za-z0-9_.-])docs\/defects\/fixed\/([A-Za-z0-9_.-]+?\.md)(?![A-Za-z0-9_-])/g;
/** A note path relative to its file, under the retired folder. */
const RELATIVE_FIXED = /(?<![A-Za-z0-9_./-])((?:\.\.\/)+)defects\/fixed\/([A-Za-z0-9_.-]+?\.md)(?![A-Za-z0-9_-])/g;

/**
 * Repoint every pointer to a note under the retired folder that the archive holds (see the header).
 * @param {string} root
 * @param {import('./text.mjs').Tree} tree
 */
export function repointDefects(root, tree) {
  const fixed = resolve(root, ...FIXED_DIR.split('/'));
  const into = join(root, ...ARCHIVE_DEFECTS.split('/'));
  const archived = new Set(tree.list(into));
  if (archived.size === 0) return;
  /** Where a path that reached the retired folder reaches now: its note in the archive, the archive for the folder, or `undefined`. */
  const now = (/** @type {string} */ abs) =>
    abs === fixed ? into : dirname(abs) === fixed && archived.has(basename(abs)) ? join(into, basename(abs)) : undefined;
  const fromRoot = (/** @type {string} */ text) =>
    text.replace(ROOT_FIXED, (whole, name) => (archived.has(name) ? `${ARCHIVE_DEFECTS}/${name}` : whole));

  const docs = resolve(root, 'docs');
  const written = [...tree.mem.keys()].filter((f) => f.endsWith('.md') && f.startsWith(docs + sep));
  const record = [...new Set([...recordFiles(root).map((f) => resolve(f)), ...written])].filter((f) => tree.exists(f)).sort();
  for (const file of record) {
    const text = tree.read(file);
    // A link from an open note reads `fixed/<name>.md`, so the folder's name alone is what every pointer holds.
    if (!text.includes('fixed/')) continue;
    let next = rewriteLinkTargets(text, (target) => {
      if (!isRelative(target)) return target;
      const { path, fragment } = splitTarget(target);
      if (path === '') return target;
      const moved = now(resolve(dirname(file), decoded(path)));
      return moved === undefined ? target : `${relativeLink(file, moved)}${path.endsWith('/') ? '/' : ''}${fragment}`;
    });
    if (!PROSE_EXEMPT.has(slashed(root, file))) {
      next = fromRoot(next).replace(RELATIVE_FIXED, (whole) => {
        const moved = now(resolve(dirname(file), whole));
        return moved === undefined ? whole : relativeLink(file, moved);
      });
    }
    if (next !== text) tree.write(file, next);
  }

  const instructions = INSTRUCTION_ROOTS.flatMap((top) => walk(join(root, top)));
  const own = readdirSync(root)
    .filter((name) => ROOT_FILE.test(name) && name !== 'pnpm-lock.yaml' && statSync(join(root, name)).isFile())
    .map((name) => join(root, name))
    .filter((file) => !record.includes(resolve(file)));
  for (const file of [...codeFiles(root), ...instructions, ...own]) {
    const text = tree.read(file);
    if (!text.includes('defects/fixed/')) continue;
    const next = fromRoot(text).replace(RELATIVE_FIXED, (whole, up, name) => (archived.has(name) ? `${up}archive/defects/${name}` : whole));
    if (next !== text) tree.write(file, next);
  }
}

/** A file of the repository's root that may cite a note: a dotfile of settings, or a manifest or script. */
const ROOT_FILE = /^\.[a-z]+$|\.(?:md|json|ya?ml|[cm]?[jt]s)$/;

/** The instruction files under a folder, skipping nested worktrees, installs and what a run writes. */
function walk(/** @type {string} */ dir) {
  /** @type {string[]} */
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir).sort()) {
    if (name === 'node_modules' || name === 'worktrees' || name.endsWith('.local.json')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (INSTRUCTION_FILE.test(name)) out.push(full);
  }
  return out;
}
