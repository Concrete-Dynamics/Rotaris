#!/usr/bin/env node
// The request log has no allocator. An `R-NNN` is unique only against the `main`
// the session that wrote it last read, and this repository puts every change on a
// temporary branch in a temporary worktree — exactly the case where that is not
// the `main` the row lands on. Two sessions appended an `R-016` on 2026-09-14 and
// both merged; two appended an `R-018` the next day and the collision was caught
// by hand, at the merge, by someone who happened to look.
//
// This gate is the allocator's absence made loud. It cannot stop two worktrees
// choosing the same number — nothing can, short of a lock — but it makes the
// second one fail `pnpm lint` on the merge instead of landing beside the first.
//
// It holds five things about `docs/product/requests.md`:
//   1. every row's anchor agrees with the identifier it prints;
//   2. no identifier appears twice (the R-016 defect);
//   3. the identifiers run contiguously from 1, with no gap;
//   4. the Count section's declared range is the range that is actually there;
//   5. every `requests.md#r-nnn` link anywhere in `docs/` resolves to a real row —
//      the `PD` "Raised by" lines cite rows by anchor, and a duplicate anchor
//      silently redirects one of them.
//
// Runs as part of `pnpm lint`. Reads `docs/`; costs no subprocess.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const logPath = join(root, 'docs', 'product', 'requests.md');

/**
 * An HTML comment does not render, so a row inside one is not a row and an anchor
 * inside one is not an anchor. The log ends with a commented `Row shape:` block
 * carrying three example rows with real-looking ids; on this gate's first run it
 * reported them as duplicates of R-001..R-003, which is the shape of wrongness
 * that gets a check switched off. Newlines survive so that line numbers still
 * point at the file.
 * @param {string} text
 */
const uncommented = (text) =>
  text.replace(/<!--[\s\S]*?-->/g, (comment) => comment.replace(/[^\n]/g, ' '));

const source = uncommented(readFileSync(logPath, 'utf8'));

const problems = [];
/** @param {string} message */
const fail = (message) => problems.push(message);

// ---------------------------------------------------------------- the rows

// A row is a table line that opens with the anchor and prints the identifier:
// `| <a id="r-001"></a>R-001 | 2026-09-12 | "…" | covered | … |`
const ROW = /^\|\s*<a id="r-(\d+)"><\/a>\s*R-(\d+)\s*\|/gm;

/** @type {{ anchor: string, printed: string, number: number, line: number }[]} */
const rows = [];
for (const match of source.matchAll(ROW)) {
  const line = source.slice(0, match.index).split('\n').length;
  rows.push({
    anchor: match[1],
    printed: match[2],
    number: Number.parseInt(match[2], 10),
    line,
  });
}

if (rows.length === 0) {
  console.error('check-request-log: docs/product/requests.md holds no rows at all.');
  console.error('A row opens `| <a id="r-NNN"></a>R-NNN | <date> | … |`. Either the log was');
  console.error('emptied or the row shape changed — this gate reads that shape and nothing else.');
  process.exit(1);
}

// 1 — the anchor and the printed identifier are the same number.
for (const row of rows) {
  if (row.anchor !== row.printed) {
    fail(
      `line ${row.line}: the anchor says r-${row.anchor} and the row prints R-${row.printed}. ` +
        'A link to one reaches the other.',
    );
  }
}

// 2 — no identifier twice. This is the R-016 defect, and it is the whole reason
// this file exists: two rows, one anchor, and the second unreachable by link.
/** @type {Map<number, typeof rows>} */
const byNumber = new Map();
for (const row of rows) {
  const seen = byNumber.get(row.number);
  if (seen === undefined) byNumber.set(row.number, [row]);
  else seen.push(row);
}
for (const [number, group] of byNumber) {
  if (group.length > 1) {
    const lines = group.map((r) => r.line).join(', ');
    fail(
      `R-${String(number).padStart(3, '0')} appears ${group.length} times, at lines ${lines}. ` +
        'Identifiers are never reused; a row that has not yet reached `main` is renumbered to the ' +
        'next free identifier, keeping its text, and says in the row that it was.',
    );
  }
}

// 3 — contiguous from 1, no gap. A gap is a row somebody deleted, which the log
// forbids outright, or a number claimed in a worktree that never landed.
const numbers = [...byNumber.keys()].sort((a, b) => a - b);
const highest = numbers[numbers.length - 1];
const missing = [];
for (let n = 1; n <= highest; n += 1) if (!byNumber.has(n)) missing.push(n);
if (numbers[0] !== 1) fail(`the lowest identifier is R-${String(numbers[0]).padStart(3, '0')}, not R-001.`);
if (missing.length > 0) {
  fail(
    `${missing.length} identifier(s) missing below R-${String(highest).padStart(3, '0')}: ` +
      `${missing.map((n) => `R-${String(n).padStart(3, '0')}`).join(', ')}. ` +
      'Numbering is contiguous — a declined or deferred request keeps its row and its number.',
  );
}

// 4 — the Count section states the range, and the range is what is there. Prose
// counted in words is how "Sixteen. The count is the number of rows below" came
// to sit above seventeen rows for a day.
const countSection = /^##\s+Count\s*$([\s\S]*?)^---\s*$/m.exec(source);
if (countSection === null) {
  fail('there is no `## Count` section ending in a `---` rule. The declared range lives there.');
} else {
  const declared = /\bR-(\d+)\s+to\s+R-(\d+)\b/.exec(countSection[1]);
  if (declared === null) {
    fail(
      'the Count section declares no range. Write it as `R-001 to R-NNN` so that this gate can ' +
        'read the claim rather than trust it.',
    );
  } else {
    const from = Number.parseInt(declared[1], 10);
    const to = Number.parseInt(declared[2], 10);
    if (from !== 1) fail(`the Count section declares the range starting at R-${declared[1]}, not R-001.`);
    if (to !== highest) {
      fail(
        `the Count section declares R-${declared[1]} to R-${declared[2]}, but the highest row is ` +
          `R-${String(highest).padStart(3, '0')}.`,
      );
    }
    if (rows.length !== highest) {
      fail(
        `there are ${rows.length} rows but the highest identifier is ` +
          `R-${String(highest).padStart(3, '0')}. One row, one identifier.`,
      );
    }
  }
}

// -------------------------------------------------------------- the citations

/** @param {string} dir @returns {string[]} */
function markdownUnder(dir) {
  /** @type {string[]} */
  const found = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...markdownUnder(full));
    else if (entry.endsWith('.md')) found.push(full);
  }
  return found;
}

// 5 — every citation reaches a row. Inside the log itself a citation is a bare
// `#r-nnn`; everywhere else it carries the filename.
const CITATION = /(?:requests\.md)?#(r-\d+)\)/g;
const defined = new Set(rows.map((r) => `r-${r.anchor}`));
for (const file of markdownUnder(join(root, 'docs'))) {
  const text = uncommented(readFileSync(file, 'utf8'));
  const isLog = file === logPath;
  for (const match of text.matchAll(CITATION)) {
    // A bare `#r-nnn` only means a request row inside the log; elsewhere the
    // filename has to be there, or it is some other document's own anchor.
    if (!isLog && !match[0].startsWith('requests.md')) continue;
    if (defined.has(match[1])) continue;
    const line = text.slice(0, match.index).split('\n').length;
    fail(
      `${relative(root, file).split(sep).join('/')}:${line} cites ${match[1].toUpperCase()}, ` +
        'which the request log does not define.',
    );
  }
}

// ------------------------------------------------------------------- verdict

if (problems.length > 0) {
  console.error(`check-request-log: ${problems.length} problem(s) in docs/product/requests.md:`);
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error('');
  console.error('The rules are docs/product/README.md §Identifiers and the log\'s own header:');
  console.error('  identifiers R-NNN, contiguous from 1, never renumbered and never reused;');
  console.error('  a row is appended and never rewritten.');
  console.error('If you are merging and your number was taken while you worked, take the next free');
  console.error('one and say so in your row — the row that reached `main` first keeps the number.');
  process.exit(1);
}

console.log(
  `check-request-log: ${rows.length} rows, R-001 to R-${String(highest).padStart(3, '0')}, no duplicate and no gap`,
);
