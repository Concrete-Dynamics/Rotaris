#!/usr/bin/env node
// The directive register has the request log's shape and, until now, none of its
// enforcement: contiguous per-domain identifiers, anchors cited from other
// documents, and a declared total written in prose. Prose is what goes stale.
// `docs/product/directives.md` said **Thirteen** above fourteen entries for the
// span between `d79d9f7` adding `PD-LIBRARY-002` and somebody noticing while
// writing `PD-ORCH-003` — the same failure, to the word, that put seventeen rows
// under "Sixteen" in the request log and got `check-request-log.mjs` written.
//
// The generated artifact cannot catch this. `DIRECTIVE_COUNT` in
// `packages/kernel/src/generated/requirements.ts` is written by the generator
// from the register it has just parsed, and the test beside it compares that
// number against the `PD` symbols the same run emitted: both sides come from one
// read, so the pair agrees with itself whatever the prose above them says. The
// prose is the only independent side, which is why this gate reads it.
//
// It holds five things about `docs/product/directives.md`:
//   1. every entry's anchor agrees with the identifier its heading prints;
//   2. no identifier appears twice;
//   3. identifiers run contiguously from 001 WITHIN EACH DOMAIN — the register's
//      rule, and not the request log's single sequence;
//   4. the Count section's declared total, spelled in words, is the number of
//      entries. A revision keeps its number and adds no entry, so the total is
//      the number of headings and never the highest identifier — the shortcut
//      the request log is allowed to take does not hold here;
//   5. every `directives.md#pd-…` link anywhere in `docs/` resolves to a real
//      entry.
//
// Runs as part of `pnpm lint`. Reads `docs/`; costs no subprocess.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const registerPath = join(root, 'docs', 'product', 'directives.md');

/**
 * An HTML comment does not render, so an entry inside one is not an entry. The
 * register ends with a commented `Entry shape:` block carrying a worked
 * `PD-CHAT-001` with a real-looking anchor; counted, it is a twentieth directive
 * that does not exist and a duplicate of the fourth. The generator skips it for
 * the same reason. Newlines survive so that line numbers still point at the file.
 * @param {string} text
 */
const uncommented = (text) =>
  text.replace(/<!--[\s\S]*?-->/g, (comment) => comment.replace(/[^\n]/g, ' '));

const source = uncommented(readFileSync(registerPath, 'utf8'));

const problems = [];
/** @param {string} message */
const fail = (message) => problems.push(message);

// ------------------------------------------------------------- number words

const UNITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen',
  'eighteen', 'nineteen'];
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

/**
 * The count is spelled in words, which is the register's own voice and not
 * something this gate is entitled to change — so the gate carries the table
 * instead. One to ninety-nine, hyphenated or spaced; a bare number is taken too,
 * so that a register that ever switches form is not made un-checkable by this file.
 * @param {string} word
 * @returns {number | null}
 */
function wordToNumber(word) {
  const w = word.trim().toLowerCase();
  if (/^\d+$/.test(w)) return Number.parseInt(w, 10);
  const unit = UNITS.indexOf(w);
  if (unit > 0) return unit;
  const compound = /^([a-z]+)[-\s]([a-z]+)$/.exec(w);
  if (compound !== null) {
    const tens = TENS[compound[1]];
    const ones = UNITS.indexOf(compound[2]);
    if (tens !== undefined && ones > 0 && ones < 10) return tens + ones;
    return null;
  }
  return TENS[w] ?? null;
}

// ---------------------------------------------------------------- the entries

// An entry is an explicit anchor and the heading beneath it, with only blank
// lines between:
//   <a id="pd-shell-001"></a>
//
//   ### PD-SHELL-001 — a chosen project folder may be opened …
const ENTRY = /^<a id="pd-([a-z]+)-(\d+)"><\/a>\s*\n\s*\n###\s+PD-([A-Z]+)-(\d+)\s/gm;

/** @type {{ anchor: string, domain: string, number: number, printed: string, line: number }[]} */
const entries = [];
for (const match of source.matchAll(ENTRY)) {
  const line = source.slice(0, match.index).split('\n').length;
  entries.push({
    anchor: `pd-${match[1]}-${match[2]}`,
    domain: match[3],
    number: Number.parseInt(match[4], 10),
    printed: `PD-${match[3]}-${match[4]}`,
    line,
  });
  if (match[1].toUpperCase() !== match[3] || match[2] !== match[4]) {
    fail(
      `line ${line}: the anchor says pd-${match[1]}-${match[2]} and the heading prints ` +
        `PD-${match[3]}-${match[4]}. A link to one reaches the other.`,
    );
  }
}

// A heading with no anchor above it is unreachable by every citation in the
// repository, and would also be invisible to the count below — so it is named
// rather than skipped.
const HEADING = /^###\s+PD-([A-Z]+)-(\d+)\s/gm;
const anchored = new Set(entries.map((e) => e.printed));
for (const match of source.matchAll(HEADING)) {
  const printed = `PD-${match[1]}-${match[2]}`;
  if (anchored.has(printed)) continue;
  const line = source.slice(0, match.index).split('\n').length;
  fail(`line ${line}: ${printed} has no \`<a id="${printed.toLowerCase()}"></a>\` anchor above it, so nothing can cite it.`);
}

if (entries.length === 0) {
  console.error('check-directive-register: docs/product/directives.md holds no entries at all.');
  console.error('An entry is `<a id="pd-domain-nnn"></a>`, a blank line, then `### PD-DOMAIN-NNN — …`.');
  console.error('Either the register was emptied or the entry shape changed — this gate reads that');
  console.error('shape and nothing else.');
  process.exit(1);
}

// 2 — no identifier twice. Identifiers are stable and permanent; a directive
// that has not reached `main` is renumbered, never doubled up.
/** @type {Map<string, typeof entries>} */
const byId = new Map();
for (const entry of entries) {
  const seen = byId.get(entry.printed);
  if (seen === undefined) byId.set(entry.printed, [entry]);
  else seen.push(entry);
}
for (const [printed, group] of byId) {
  if (group.length > 1) {
    fail(
      `${printed} appears ${group.length} times, at lines ${group.map((e) => e.line).join(', ')}. ` +
        'A changed directive gets a new REVISION in place, not a second heading; two branches that ' +
        'minted the same number settle it by the one that reached `main` first keeping it.',
    );
  }
}

// 3 — contiguous from 001 within each domain. `docs/product/README.md`:
// "Numbering runs contiguously from 1 within each domain, with no gap and no duplicate."
/** @type {Map<string, number[]>} */
const byDomain = new Map();
for (const entry of entries) {
  const seen = byDomain.get(entry.domain);
  if (seen === undefined) byDomain.set(entry.domain, [entry.number]);
  else seen.push(entry.number);
}
for (const [domain, numbers] of [...byDomain].sort((a, b) => a[0].localeCompare(b[0]))) {
  const sorted = [...new Set(numbers)].sort((a, b) => a - b);
  const highest = sorted[sorted.length - 1];
  if (sorted[0] !== 1) fail(`domain ${domain}'s lowest directive is PD-${domain}-${String(sorted[0]).padStart(3, '0')}, not PD-${domain}-001.`);
  const missing = [];
  for (let n = 1; n <= highest; n += 1) if (!sorted.includes(n)) missing.push(n);
  if (missing.length > 0) {
    fail(
      `domain ${domain} is missing ${missing.map((n) => `PD-${domain}-${String(n).padStart(3, '0')}`).join(', ')}. ` +
        'Numbering is contiguous within a domain — a withdrawn directive keeps its entry and its number.',
    );
  }
}

// 4 — the declared total is the number of entries. This is the check the note
// `the-directive-registers-count-is-prose-with-no-checker.md` was written for.
const countSection = /^##\s+Count\s*$([\s\S]*?)^---\s*$/m.exec(source);
if (countSection === null) {
  fail('there is no `## Count` section ending in a `---` rule. The declared total lives there.');
} else {
  const declared = /\*\*([A-Za-z-]+|\d+)\.\*\*/.exec(countSection[1]);
  if (declared === null) {
    fail(
      'the Count section declares no total. Write it as `**Nineteen.**` — a bolded number word ending ' +
        'in a full stop — so that this gate can read the claim rather than trust it.',
    );
  } else {
    const total = wordToNumber(declared[1]);
    if (total === null) {
      fail(
        `the Count section says **${declared[1]}.**, which this gate cannot read as a number. ` +
          'It knows one to ninety-nine in words, hyphenated or spaced, and bare digits.',
      );
    } else if (total !== entries.length) {
      fail(
        `the Count section declares **${declared[1]}** and the register holds ${entries.length} entries. ` +
          'A commit that adds a directive updates the count in the same commit; a REVISION changes ' +
          'neither the number nor the count.',
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

// 5 — every citation reaches an entry. Inside the register itself a citation is
// a bare `#pd-…`; everywhere else it carries the filename.
const CITATION = /(?:directives\.md)?#(pd-[a-z]+-\d+)\)/g;
const defined = new Set(entries.map((e) => e.anchor));
for (const file of markdownUnder(join(root, 'docs'))) {
  const text = uncommented(readFileSync(file, 'utf8'));
  const isRegister = file === registerPath;
  for (const match of text.matchAll(CITATION)) {
    if (!isRegister && !match[0].startsWith('directives.md')) continue;
    if (defined.has(match[1])) continue;
    const line = text.slice(0, match.index).split('\n').length;
    fail(
      `${relative(root, file).split(sep).join('/')}:${line} cites ${match[1].toUpperCase()}, ` +
        'which the directive register does not define.',
    );
  }
}

// ------------------------------------------------------------------- verdict

if (problems.length > 0) {
  console.error(`check-directive-register: ${problems.length} problem(s) in docs/product/directives.md:`);
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error('');
  console.error('The rules are docs/product/README.md §Identifiers and §What binds a change:');
  console.error('  identifiers PD-DOMAIN-NNN, contiguous from 1 within a domain, never reused;');
  console.error('  a changed directive gets a new revision in place, not a new number;');
  console.error('  a commit that adds, revises or withdraws one updates this register in the same commit.');
  process.exit(1);
}

const domains = [...byDomain.keys()].sort().map((d) => `${d}×${byDomain.get(d).length}`).join(', ');
console.log(`check-directive-register: ${entries.length} entries (${domains}), no duplicate and no gap`);
