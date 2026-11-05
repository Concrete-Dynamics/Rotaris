// The folder indexes of the record (`docs/README.md`, "The document budget").
//
// A folder of the record that holds many peer documents and no index of its own cannot be traversed: an agent that
// lands on `docs/architecture/adr/` sees 66 filenames and 32 part folders, and nothing in the folder says what it is,
// which order the numbers run in, or where the list of the decisions lives. The record's answer is a `README.md` in
// each such folder: it names what the folder holds, states the rule that governs it, and lists its children (card
// 13b951ad, 2026-11-05). This module is the check beside them, in the gate's test stage
// (`tools/folder-indexes.test.ts`).
//
// Three checks, all over the tree:
//
//   1. `missingIndexes` — every folder under `docs/` that owes an index and has none. A folder owes one when it holds
//      at least `MIN_ENTRIES` Markdown files or at least `MIN_FOLDERS` subfolders. It does not owe one when it
//      carries a `README.md`; when it is the parts folder of a split document (`<name>/` beside `<name>.md`,
//      `README/` beside `README.md`), since a split is indexed by the document it came from and
//      `tools/record-parts.mjs` reads the two together; or when it is under `docs/archive/`, which mirrors the
//      record's paths, is written by `tools/archive/migrate.mjs` alone, and is indexed by `docs/archive/README.md`.
//   2. `unlistedChildren` — for the folders in `INDEXED_FOLDERS`, every direct child its `README.md` does not name.
//      The list is declared rather than inferred, because a complete listing is right for a handful of peer files and
//      is the *wrong* answer for the 857 repaired notes of `docs/archive/defects/`, whose rule is a name search —
//      `docs/archive/README.md` indexes the archive's folders itself: a folder that owes a complete list says so here.
//   3. `recordsOffTheIndex` — every record file in `docs/architecture/adr/` named in neither §7's table
//      (`docs/architecture/README/13-7-index-of-decisions.md`, the index of the decisions) nor the folder's own
//      `README.md`. That README deliberately does not republish all 66 rows: it names the records §7's table has not
//      reached, and this check is what keeps that list from going stale when §7 does (and vice versa).
//
// What it does not do: a link, an anchor or a heading is `tools/check-record-links.mjs`'s question and a file's size
// is `tools/check-doc-budget.mjs`'s. This module reads index files and the names in folders, nothing else.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';

/** The fewest documents a folder holds before it owes an index: below this a reader can read the listing itself. */
export const MIN_ENTRIES = 8;
/** The fewest subfolders a folder holds before it owes an index, whatever its own Markdown count. */
export const MIN_FOLDERS = 2;

/** The index's own name; never one of the entries an index lists. */
export const INDEX_NAME = 'README.md';

/** The archive mirrors the record's paths and only its script writes there (`docs/archive/README.md`). */
const ARCHIVE = 'docs/archive';

/**
 * The folders whose `README.md` promises the complete list of its direct children. Repository-relative, forward
 * slashes. Each holds peer documents or part folders, where a complete listing fits the document budget.
 */
export const INDEXED_FOLDERS = [
  'docs/architecture/proposals',
  'docs/architecture/spikes',
  'docs/design/system/components',
  'docs/design/system/guidelines',
  'docs/spec/resolutions',
];

/** `docs/architecture/adr` is checked the other way: its index defers to §7 rather than listing all 66 records. */
export const ADR_DIR = 'docs/architecture/adr';
/** §7 of the architecture README — "Index of decisions", the table of the decisions with their evidence. */
export const DECISION_INDEX = 'docs/architecture/README/13-7-index-of-decisions.md';

/** @param {string} root @param {string} p @returns {string} forward-slashed, relative to `root` */
const slashed = (/** @type {string} */ root, /** @type {string} */ p) => relative(root, p).split(sep).join('/');

/**
 * The documents of a folder, its own index excluded: an index is not one of its own entries. A "document" is what
 * an index here lists — a Markdown file or one of the design system's HTML specimen cards; every other file beside
 * them (`styles.css`, `base.css`) is not an entry and is a folder's own page, not one of its children.
 */
function documentsOf(/** @type {string} */ dir) {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name !== INDEX_NAME && /\.(?:md|html)$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

/** The subfolders of a folder; a parts folder (`<name>/` beside `<name>.md`) is a split, not a child. */
function foldersOf(/** @type {string} */ dir) {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => !existsSync(join(dirname(dir), `${name}.md`)))
    .sort();
}

/** Whether a folder is the parts folder of a split document: `<name>/` beside `<name>.md`. */
export function isPartsFolder(/** @type {string} */ dir) {
  const sibling = `${join(dirname(dir), dir.split(sep).pop() ?? '')}.md`;
  return existsSync(sibling) && statSync(sibling).isFile();
}

/**
 * Every folder under `docs/`, absolute, the archive's excluded (nothing there is indexed from here).
 * @param {string} root
 * @returns {string[]}
 */
export function docsFolders(root) {
  const docs = join(root, 'docs');
  if (!existsSync(docs)) return [];
  /** @type {string[]} */
  const found = [];
  const walk = (/** @type {string} */ dir) => {
    found.push(dir);
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) walk(join(dir, entry.name));
    }
  };
  walk(docs);
  return found.filter((dir) => slashed(root, dir) !== ARCHIVE && !slashed(root, dir).startsWith(`${ARCHIVE}/`));
}

/**
 * Whether a folder owes an index: enough children that a reader must choose among them, and none of its own.
 * @param {string} dir absolute
 * @returns {boolean}
 */
export function owesIndex(/** @type {string} */ dir) {
  if (!statSync(dir).isDirectory()) return false;
  if (existsSync(join(dir, INDEX_NAME))) return false;
  if (isPartsFolder(dir)) return false;
  return documentsOf(dir).length >= MIN_ENTRIES || foldersOf(dir).length >= MIN_FOLDERS;
}

/**
 * Every folder that owes an index and has none, repository-relative and sorted. Empty is the expected state.
 * @param {string} root
 * @returns {string[]}
 */
export function missingIndexes(/** @type {string} */ root) {
  return docsFolders(root)
    .filter(owesIndex)
    .map((dir) => slashed(root, dir))
    .sort();
}

/**
 * The direct children of the given folders that their index does not name; a folder with no index is one entry,
 * naming the index itself.
 * @param {string} root
 * @param {string[]} [folders] the folders that owe a complete list; `INDEXED_FOLDERS` by default, so a caller may
 *   exercise the rule over a scratch tree.
 * @returns {{ folder: string, child: string }[]}
 */
export function unlistedChildren(/** @type {string} */ root, /** @type {string[]} */ folders = INDEXED_FOLDERS) {
  /** @type {{ folder: string, child: string }[]} */
  const out = [];
  for (const folder of folders) {
    const dir = join(root, ...folder.split('/'));
    if (!existsSync(dir)) {
      out.push({ folder, child: '(the folder is missing)' });
      continue;
    }
    const index = join(dir, INDEX_NAME);
    if (!existsSync(index)) {
      out.push({ folder, child: INDEX_NAME });
      continue;
    }
    const text = readFileSync(index, 'utf8');
    for (const child of [...documentsOf(dir), ...foldersOf(dir)]) {
      if (!text.includes(child)) out.push({ folder, child });
    }
  }
  return out;
}

/**
 * Every record of the ADR folder that neither §7's table nor the folder's own index names.
 *
 * §7's table keys a row by the record's four-digit number (`| 0058 | … |`), and the folder's index by the file
 * (`[…](0058-….md)`) or by the number again, so a record counts as named by either index when its number or its
 * file name appears in it. This is what lets the folder's `README.md` carry the eight records §7 has not reached
 * while still failing when a ninth is added without a row anywhere.
 * @param {string} root
 * @returns {string[]} the record file names, sorted
 */
export function recordsOffTheIndex(/** @type {string} */ root) {
  const dir = join(root, ...ADR_DIR.split('/'));
  if (!existsSync(dir)) return [];
  const read = (/** @type {string} */ path) => (existsSync(path) ? readFileSync(path, 'utf8') : '');
  const named = `${read(join(dir, INDEX_NAME))}\n${read(join(root, ...DECISION_INDEX.split('/')))}`;
  return readdirSync(dir)
    .filter((name) => /^\d{4}-.*\.md$/.test(name))
    .filter((name) => !named.includes(name) && !new RegExp(`\\| ${name.slice(0, 4)} \\|`).test(named))
    .sort();
}

/** A problem, as the report line a reader fixes from. */
export const line = (/** @type {string} */ folder, /** @type {string} */ child) =>
  child === INDEX_NAME || child === '(the folder is missing)'
    ? `${folder}: ${child === INDEX_NAME ? 'owes an index — it holds enough children to need one' : child}`
    : `${folder}: does not name ${child}`;
