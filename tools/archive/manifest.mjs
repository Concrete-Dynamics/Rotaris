// The archive's own guard (R-092; `docs/archive/README.md`): nothing in `docs/archive/` is edited by hand after it moves,
// and only `tools/archive/migrate.mjs` writes there. The rule was a sentence until this module; now every run of the
// migration writes `docs/archive/manifest.json`, one SHA-256 per archived entry, and `--check` (in `pnpm lint`) compares
// the archive as it stands with it, naming each entry that differs.
//
// An entry is what a reader would point at: in an archive file, the text from one column-0 anchor (`<a id="…"></a>`) to
// the next, keyed `<path>#<anchor>`, and the file's opening before its first anchor, keyed `<path>`; a file with no anchor
// (a repaired defect note) is one entry, keyed `<path>`. Paths are relative to `docs/archive/`. The text is hashed with
// its line endings read as LF and its trailing whitespace dropped, so a checkout's line endings never read as an edit.
// `docs/archive/README.md` is written by hand and is not an entry; neither is the manifest itself.
//
// `--check` fails on three things: an entry whose hash differs (edited by hand), an entry the manifest does not hold (a
// file or a passage added by hand: a repaired note moved straight to `archive/defects/` is registered by the next
// `pnpm archive:migrate`), and an entry the manifest holds that the archive no longer has (removed by hand). Running the
// migration rewrites the manifest from the archive as it then stands, which is how a deliberate change is accepted and
// how a rebase that conflicts on the manifest is resolved: re-run it, never merge the file by hand.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

/** The archive and its manifest, relative to the repository root, and the files in it that are not entries. */
export const ARCHIVE_DIR = 'docs/archive';
export const MANIFEST = 'docs/archive/manifest.json';
const NOT_ENTRIES = new Set(['README.md', 'manifest.json']);

/** A column-0 anchor line, which opens an entry. */
const ANCHOR = /^<a (?:id|name)="([^"]+)"><\/a>\s*$/;

/** The SHA-256 of an entry's text, its line endings read as LF and its trailing whitespace dropped. */
export const hashOf = (/** @type {string} */ text) => createHash('sha256').update(text.replace(/\r\n?/g, '\n').replace(/\s+$/, '')).digest('hex');

/**
 * An archive file's entries, in order, by key: `<path>` for the opening (or the whole file), `<path>#<anchor>` for each
 * anchored block; a second block under one anchor takes `~2`, and so on.
 * @param {string} path relative to `docs/archive/`, forward slashes
 * @param {string} text
 * @returns {[string, string][]} key and text
 */
export function entriesOf(path, text) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  /** @type {[string, string[]][]} */
  const blocks = [[path, []]];
  /** @type {Map<string, number>} */
  const seen = new Map();
  for (const line of lines) {
    const m = ANCHOR.exec(line);
    if (m) {
      const n = (seen.get(m[1]) ?? 0) + 1;
      seen.set(m[1], n);
      blocks.push([`${path}#${m[1]}${n > 1 ? `~${n}` : ''}`, [line]]);
    } else blocks.at(-1)?.[1].push(line);
  }
  return blocks.filter(([, body], i) => i > 0 || blocks.length === 1 || body.join('').trim() !== '').map(([key, body]) => [key, body.join('\n')]);
}

/**
 * The archive's files, relative to `docs/archive/`, sorted: on disk, and, given a tree, as a run leaves it.
 * @param {string} root
 * @param {import('./text.mjs').Tree} [tree]
 * @returns {string[]}
 */
export function archiveFiles(root, tree) {
  const top = resolve(root, ...ARCHIVE_DIR.split('/'));
  /** @type {Set<string>} */
  const out = new Set();
  const walk = (/** @type {string} */ dir) => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith('.md')) out.add(full);
    }
  };
  walk(top);
  if (tree) {
    for (const p of tree.mem.keys()) if (p.startsWith(top + sep) && p.endsWith('.md')) out.add(p);
    for (const p of tree.removed) out.delete(p);
  }
  return [...out]
    .map((p) => p.slice(top.length + 1).split(sep).join('/'))
    .filter((p) => !NOT_ENTRIES.has(p))
    .sort();
}

/**
 * Every archived entry's hash, by key, sorted.
 * @param {string} root
 * @param {{ read: (p: string) => string }} reader
 * @param {import('./text.mjs').Tree} [tree]
 * @returns {Map<string, string>}
 */
export function hashes(root, reader, tree) {
  /** @type {Map<string, string>} */
  const out = new Map();
  for (const path of archiveFiles(root, tree)) {
    for (const [key, text] of entriesOf(path, reader.read(join(root, ...ARCHIVE_DIR.split('/'), ...path.split('/'))))) out.set(key, hashOf(text));
  }
  return new Map([...out].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

/** The manifest's text for a set of hashes. */
export function manifestText(/** @type {Map<string, string>} */ entries) {
  return `${JSON.stringify(
    {
      about:
        'Written by tools/archive/migrate.mjs (pnpm archive:migrate): one SHA-256 per archived entry, keyed by its path under ' +
        'docs/archive/ and its anchor. Never edited by hand; `--check` (in pnpm lint) fails while the archive differs from it, ' +
        'and a re-run rewrites it (docs/archive/README.md).',
      entries: Object.fromEntries(entries),
    },
    null,
    2,
  )}\n`;
}

/**
 * Write the manifest of the archive as the run leaves it into the tree.
 * @param {string} root
 * @param {import('./text.mjs').Tree} tree
 */
export function planManifest(root, tree) {
  const entries = hashes(root, tree, tree);
  if (entries.size === 0 && !existsSync(join(root, ...MANIFEST.split('/')))) return;
  tree.write(join(root, ...MANIFEST.split('/')), manifestText(entries));
}

/**
 * Where the archive on disk differs from its manifest, one line per entry: what `--check` fails on.
 * @param {string} root
 * @returns {string[]}
 */
export function manifestProblems(root) {
  const now = hashes(root, { read: (p) => readFileSync(p, 'utf8') });
  const path = join(root, ...MANIFEST.split('/'));
  if (!existsSync(path)) return now.size === 0 ? [] : [`${MANIFEST} is missing while the archive holds ${now.size} entries`];
  /** @type {Record<string, string>} */
  let recorded;
  try {
    recorded = JSON.parse(readFileSync(path, 'utf8')).entries ?? {};
  } catch (error) {
    return [`${MANIFEST} does not parse (${error instanceof Error ? error.message : String(error)})`];
  }
  /** @type {string[]} */
  const out = [];
  for (const [key, hash] of now) {
    const was = recorded[key];
    if (was === undefined) out.push(`${ARCHIVE_DIR}/${key} is not in the manifest (written by hand, not by the script)`);
    else if (was !== hash) out.push(`${ARCHIVE_DIR}/${key} was edited by hand (its hash differs from the manifest's)`);
  }
  for (const key of Object.keys(recorded)) if (!now.has(key)) out.push(`${ARCHIVE_DIR}/${key} is in the manifest and no longer in the archive (removed by hand)`);
  return out;
}
