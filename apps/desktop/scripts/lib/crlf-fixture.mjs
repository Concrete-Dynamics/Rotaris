/**
 * The CRLF, tab-indented fixture the edit directives are measured on (fin42, N52): `PD-TOOLS-014` to `PD-TOOLS-018` keep a
 * CRLF file's line endings and read a near miss, and every live and built-app edit until fin42 met LF files. The fixture is
 * GENERATED at run time and never committed: `.gitattributes` (`* text=auto eol=lf`) would normalise a committed CRLF file,
 * and `tools/check-line-endings.mjs` refuses one. `edits-proof.mjs` (scripted) and the live run's `crlf` scenario both write it
 * with `writeCrlfFixture`, and read the result with `lineEndings`.
 *
 * Nothing here is product code.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Lines joined by CRLF, with a final CRLF: the shape a Windows editor saves. */
export const crlf = (lines) => `${lines.join('\r\n')}\r\n`;

/** A small JavaScript function indented with tabs, the shape most edits meet. */
export const GREET_LINES = [
  'function greet(name) {',
  "\tconst greeting = 'Hello';",
  '\tif (name) {',
  '\t\treturn `${greeting}, ${name}`;',
  '\t}',
  '\treturn greeting;',
  '}',
];

/** One level deeper inside its function, for a `write_file` edit whose `old_string` lost a tab (PD-TOOLS-015). */
export const CHECK_LINES = [
  'function check(name) {',
  '\tif (name) {',
  '\t\treturn name;',
  '\t}',
  "\treturn 'nobody';",
  '}',
];

/**
 * A loop two levels deep, for the shape a model sends on Windows: an LF `old_string` one tab shallow. It matches at level 3 on an
 * LF copy and, since `PD-TOOLS-019`, on a CRLF file too; until then the lines' `\r` kept it from level 3 and it landed at level 4
 * (`docs/defects/fixed/on-a-crlf-file-an-lf-old-string-one-indent-off-skips-match-level-3.md`).
 */
export const RENDER_LINES = [
  'function render(items) {',
  '\tconst out = [];',
  '\tfor (const item of items) {',
  '\t\tif (item.visible) {',
  '\t\t\tout.push(`<li>${item.label}</li>`);',
  '\t\t}',
  '\t}',
  "\treturn out.join('');",
  '}',
];

/**
 * A loop body with a blank interior line, the commonest shape a multi-line edit carries. An LF `old_string` one tab shallow over
 * the body reaches level 3 since `PD-TOOLS-020` (OQ-295); until then a blank line took part in the shift and the block landed at
 * level 4, or matched nothing on a CRLF file (`docs/defects/fixed/a-block-with-a-blank-interior-line-never-matches-at-level-3.md`).
 */
export const BLANK_LINES = [
  'function total(items) {',
  '\tlet sum = 0;',
  '\tfor (const item of items) {',
  '\t\tconst price = item.price;',
  '',
  '\t\tsum += price;',
  '\t}',
  '\treturn sum;',
  '}',
];

/** A word that occurs twice, for `replace_all` (PD-TOOLS-017). */
export const LIST_LINES = ['alpha', 'beta', 'alpha'];

/** Writes each `{ path: lines }` under `root` as a CRLF file, the directories made; returns the paths written. */
export function writeCrlfFixture(root, files) {
  const written = [];
  for (const [path, lines] of Object.entries(files)) {
    const file = join(root, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, crlf(lines));
    written.push(path);
  }
  return written;
}

/**
 * How a file's lines end: `{ crlf, lfOnly, lfOnlyLines, final }` — the count of `\r\n` breaks, the count of `\n` breaks with no
 * `\r` before them and their 1-based line numbers, and whether the file ends in a break. A file every edit kept CRLF has
 * `lfOnly` 0.
 */
export function lineEndings(text) {
  const lines = String(text).split('\n');
  const lfOnlyLines = [];
  let crlfCount = 0;
  for (let i = 0; i < lines.length - 1; i += 1) {
    if (lines[i].endsWith('\r')) crlfCount += 1;
    else lfOnlyLines.push(i + 1);
  }
  return { crlf: crlfCount, lfOnly: lfOnlyLines.length, lfOnlyLines, final: String(text).endsWith('\n') };
}
