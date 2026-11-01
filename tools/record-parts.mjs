// A record over the document budget (`docs/README.md`, "The document budget") is split: its index keeps the
// record's path, `<name>.md`, and its parts sit beside it in `<name>/`, each a Markdown file whose name sorts in
// the record's order. A gate or a test that reads the record whole reads it here, so that the split changes what
// an agent loads and never what a checker sees.
//
// A part's ruled, closed and withdrawn entries move to the archive (`docs/README.md`, "The archive"; R-092):
// `docs/archive/` mirrors the record's paths, so the archived parts of `docs/<path>/<name>.md` sit in
// `docs/archive/<path>/<name>/`, one file per live part under the live part's own name, continued in
// `<part>-continued-<k>.md` where one file would pass the budget. `tools/archive/migrate.mjs` writes them. A gate
// that asks what the record holds, rather than what an agent loads, reads the live parts and the archived ones alike
// (`readRecordWithArchive`).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The parts of a split record, in order: every `.md` file in the directory named like its index, sorted by name.
 * Empty for a record that was never split.
 * @param {string} index absolute path of the record's index (`…/<name>.md`)
 * @returns {string[]}
 */
export function partsOf(index) {
  const dir = index.replace(/\.md$/, '');
  if (dir === index || !existsSync(dir) || !statSync(dir).isDirectory()) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .sort()
    .map((name) => join(dir, name));
}

/**
 * The record whole: its index, then each part, joined by a newline.
 * @param {string} index absolute path of the record's index
 * @returns {string}
 */
export function readRecord(index) {
  return [index, ...partsOf(index)].map((file) => readFileSync(file, 'utf8')).join('\n');
}

/** A continuation of an archived part: `<part>-continued-<k>.md`. */
export const CONTINUED = /^(.*)-continued-(\d+)\.md$/;

/**
 * Where the archive mirrors a record file: `<root>/docs/<path>` → `<root>/docs/archive/<path>`. `undefined` for a file
 * outside `docs/`, or one already in the archive.
 * @param {string} file absolute path under a repository's `docs/`
 * @returns {string | undefined}
 */
export function archivePathOf(file) {
  const slashed = file.replace(/\\/g, '/');
  const cut = slashed.lastIndexOf('/docs/');
  if (cut < 0) return undefined;
  const rest = slashed.slice(cut + '/docs/'.length);
  if (rest.startsWith('archive/')) return undefined;
  return join(file.slice(0, cut), 'docs', 'archive', ...rest.split('/'));
}

/**
 * The order of archived part names: by the live part's name, each followed by its continuations in number order.
 * @param {string} a
 * @param {string} b
 */
export function archiveOrder(a, b) {
  /** @returns {[string, number]} */
  const key = (/** @type {string} */ name) => {
    const m = CONTINUED.exec(name);
    return m ? [`${m[1]}.md`, Number(m[2])] : [name, 1];
  };
  const [ka, na] = key(a);
  const [kb, nb] = key(b);
  return ka < kb ? -1 : ka > kb ? 1 : na - nb;
}

/**
 * The archived parts of a split record, in order: every `.md` file in the archive's mirror of the record's folder,
 * each live part's archive followed by its continuations. Empty where nothing was archived.
 * @param {string} index absolute path of the record's index (`…/docs/<path>/<name>.md`)
 * @returns {string[]}
 */
export function archivePartsOf(index) {
  const mirror = archivePathOf(index);
  if (mirror === undefined) return [];
  const dir = mirror.replace(/\.md$/, '');
  if (dir === mirror || !existsSync(dir) || !statSync(dir).isDirectory()) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .sort(archiveOrder)
    .map((name) => join(dir, name));
}

/**
 * The record whole with its archive: its index and parts (`readRecord`), then each archived part, joined by a newline.
 * @param {string} index absolute path of the record's index
 * @returns {string}
 */
export function readRecordWithArchive(index) {
  return [index, ...partsOf(index), ...archivePartsOf(index)].map((file) => readFileSync(file, 'utf8')).join('\n');
}
