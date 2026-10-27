// A record over the document budget (`docs/README.md`, "The document budget") is split: its index keeps the
// record's path, `<name>.md`, and its parts sit beside it in `<name>/`, each a Markdown file whose name sorts in
// the record's order. A gate or a test that reads the record whole reads it here, so that the split changes what
// an agent loads and never what a checker sees.
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
