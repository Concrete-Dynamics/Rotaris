#!/usr/bin/env node
// An open question is the owner's: the build raises it and proceeds under a stated reading until the owner rules
// (`AGENTS.md`, "When the owner asks for something"; until R-072 "A question the specification leaves open is raised, never ruled by you"). Two kinds of sentence
// outlived that rule's bookkeeping, and nothing read either (acceptance finding F16 of finacc3, 2026-10-06,
// `docs/defects/fixed/records-and-code-comments-describe-ruled-questions-as-open-and-cite-questions-never-raised.md`),
// and its first repair found a third:
//
//   - a claim that a question is OPEN — "OQ-37 stays open", "OQ-114 to OQ-116 are open", "OQ-67 open against …",
//     "the build's reading, asked as OQ-120", "carried as open question OQ-1" — about a question the owner has ruled,
//     closed or withdrawn. After R-071 ruled every question then standing, a dozen such sentences stood in the code
//     and the record;
//   - a claim that a question was RAISED — "raised as an open question rather than settled here" — naming no
//     question. Three comments said so of questions `open-questions.md` never had, so the owner was never asked;
//   - a settled question's answer presented as the BUILD'S READING — "OQ-103's reading", "OQ-190's build reading",
//     "the build's reading, recorded beside OQ-97" — with nothing beside it saying the owner has answered. Of a
//     question still open it is what the build proceeds under; of a settled one it reads as unruled. Some sixty such
//     sentences stood in the code and the views after the first repair fixed three of them (repair round 1).
//
// This gate reads `docs/architecture/open-questions.md`, its parts and its archived parts under `docs/archive/`
// (`tools/record-parts.mjs`, `readRecordWithArchive`: a ruled question moved there is still settled) for each question's
// state (`questionStates`) and fails on
// any of the three (`claimsIn`) in the code (comments, tests and proofs under `apps/`, `packages/` and `tools/`) and
// in the parts of the record that describe the build as it stands: the architecture views, `codebase.md`,
// `first-release-plan.md`, the architecture README, `AGENTS.md`, `docs/module-map.md`, the domain glossaries
// (`CONTEXT-MAP.md` and each package's `CONTEXT.md`) and `.claude/rules/`. History passes when it says so: the
// sentence is struck through (`~~…~~`), or the words after the claim, up to the paragraph's end and at most 240
// characters, carry the ruling (`HISTORY`: ruled, confirmed, resolved, withdrawn, deferred, ratified, superseded, a
// ruling, "closed 2026-…", the request `R-NNN` that ruled it, "while it was open"); a reading may carry it earlier
// in its own sentence too, where "until 2026-…" also dates it as past. A bare "closed" or a "not ruled" is no
// ruling. A question still open, or deferred by the owner, may be called open and its answer the build's reading.
// `open-questions.md` itself, its parts and its archive (`docs/archive/`), the ADRs, the directives, `first-executions.md` and the defect notes keep their history
// as written and are not read.
//
// Runs as part of `pnpm lint`. Reads the tree; costs no subprocess. The pure parts are exported for the test beside
// this file.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { partsOf, readRecordWithArchive } from './record-parts.mjs';

// ---------------------------------------------------------------- the questions

/**
 * A question's entry opens a line: `**OQ-<n> — …`. A bold `**OQ-51**` opening a line of prose (the counts, a later
 * paragraph naming one) is a mention, not an entry; until the archive's migration moved entries by it this read
 * `^\*\*OQ-(\d+)\b`, and no question's state differed between the two readings on 2026-11-01.
 */
const ENTRY = /^\*\*OQ-(\d+) — /;
/** An escalation's entry, which no question's entry runs into. */
const ESCALATION = /^\*\*ESC-\d+\b/;
/** A heading, which ends the entry before it. */
const HEADING = /^#{1,6} /;
/** An explicit anchor alone on its line: it belongs to the entry it stands above. */
const ANCHOR_LINE = /^<a (?:id|name)="[^"]+"><\/a>\s*$/;
/**
 * The line a moved entry leaves in its live part (`tools/archive/migrate.mjs`): `- OQ-<n> — <title>; <state> <date>;
 * [archived](…#oq-<n>)`. It ends the entry above it, so that an open entry never reads its neighbour's state.
 */
export const INDEX_LINE = /^- OQ-(\d+) — .*\[archived\]\([^)\s]*#oq-\d+\)\s*$/;
/** The owner deferred it: still to be ruled, so it may be called open. */
const DEFERRED = /\*\*Deferred 20\d\d-\d\d-\d\d/;
/** The owner ruled, closed or withdrew it, or the specification resolved it. */
export const SETTLED = /\*\*(?:Ruled|RULED|Closed|CLOSED|Withdrawn|WITHDRAWN|Resolved|RESOLVED)\b|~~Open|\b(?:Ruled|Closed|Withdrawn|Resolved) 20\d\d-\d\d-\d\d|\bCLOSED\b|\bRULED\b|\bRESOLVED\b|\*Resolved\b|— Resolved\b|Decision closed|\(20\d\d-\d\d-\d\d\): closed\b/;

/**
 * One entry's state from its text: `deferred` where the owner deferred it, else `settled` where it was ruled, closed,
 * withdrawn or resolved, else `open`. The one rule this gate and the archive's migration both read: `pnpm
 * archive:migrate` moves an entry exactly when this calls its question settled.
 * @param {string} body
 * @returns {'open' | 'settled' | 'deferred'}
 */
export function entryState(body) {
  return DEFERRED.test(body) ? 'deferred' : SETTLED.test(body) ? 'settled' : 'open';
}

/**
 * Every question's entry in a text, in order: its number, the line its explicit anchors start on (`anchor`, the
 * entry's own line where it has none), the line it opens on (`start`), the line after its last (`end`, trailing blank
 * lines left out) and its text from `start` to `end` (`body`). An entry runs up to the next entry or the anchors above
 * it, an escalation, a heading, a moved entry's index line, or the text's end. Lines count from 0.
 * @param {string} text
 * @returns {{ n: number, anchor: number, start: number, end: number, body: string }[]}
 */
export function entriesOf(text) {
  const lines = text.split('\n');
  /** Where the explicit anchors above line `i` start: back over anchor and blank lines, to the first anchor. */
  const anchorAbove = (/** @type {number} */ i) => {
    let first = i;
    for (let k = i - 1; k >= 0 && (ANCHOR_LINE.test(lines[k]) || lines[k].trim() === ''); k--) if (ANCHOR_LINE.test(lines[k])) first = k;
    return first;
  };
  /** @type {number[]} */
  const stops = [];
  /** @type {{ n: number, anchor: number, start: number }[]} */
  const opened = [];
  lines.forEach((line, i) => {
    const m = ENTRY.exec(line);
    if (m) {
      const anchor = anchorAbove(i);
      opened.push({ n: Number(m[1]), anchor, start: i });
      stops.push(anchor);
    } else if (ESCALATION.test(line)) stops.push(anchorAbove(i));
    else if (HEADING.test(line) || INDEX_LINE.test(line)) stops.push(i);
  });
  return opened.map((e) => {
    let end = stops.find((s) => s > e.start) ?? lines.length;
    while (end > e.start + 1 && lines[end - 1].trim() === '') end--;
    return { ...e, end, body: lines.slice(e.start, end).join('\n') };
  });
}

/**
 * Each question's state, read from its entries (`entriesOf`, `entryState`). A question with two entries (one of them
 * a later note, or one live and one archived) takes the first reading that is not `open`.
 * @param {string} text the open-questions record, its live parts and its archived ones (`readRecordWithArchive`)
 * @returns {Map<number, 'open' | 'settled' | 'deferred'>}
 */
export function questionStates(text) {
  /** @type {Map<number, 'open' | 'settled' | 'deferred'>} */
  const states = new Map();
  for (const e of entriesOf(text)) {
    const before = states.get(e.n);
    if (before === undefined || before === 'open') states.set(e.n, entryState(e.body));
  }
  return states;
}

// ---------------------------------------------------------------- the claims

/** One question reference: `OQ-12`, `**OQ-12**`, `[OQ-12](open-questions.md)`. */
const REF = String.raw`\[?\*{0,2}OQ-\d+\*{0,2}\]?(?:\([^)\s]*\))?`;
/** A list of them: `OQ-58 and OQ-59`, `OQ-114 to OQ-116`, `OQ-1, OQ-2 and OQ-3`. */
const LIST = String.raw`${REF}(?:(?:\s*,\s*|\s+(?:and|to)\s+)${REF})*`;
/** The sentences that call a question open. */
const OPEN_CLAIMS = [
  new RegExp(String.raw`(${LIST})(?:'s)?\s+(?:is|are|stays?|remains?)(?:\s+(?:also|still))?\s+open\b`, 'g'),
  new RegExp(String.raw`(${LIST})\s+open\s+(?:against|on)\b`, 'g'),
  new RegExp(String.raw`\b(?:asked|carried)\s+as\s+(?:an?\s+)?(?:open\s+question\s+)?(${LIST})`, 'gi'),
  new RegExp(String.raw`\bopen question\.?\*?\s+(${LIST})`, 'gi'),
  new RegExp(String.raw`(${LIST})\s+asks\b[^.\n]{0,40},\s*open\b`, 'g'),
  new RegExp(String.raw`(${LIST})'s\s[^.]{0,60}?\bstay\s+open\b`, 'g'),
  new RegExp(String.raw`\bstays?\s+open\b[^.\n]{0,60}?\((${LIST})\)`, 'g'),
  new RegExp(String.raw`(${LIST})\b[^.]{0,240}?\buntil the owner rules\b`, 'g'),
];
/** The sentences that say a question was raised. */
const RAISED_CLAIM = /\b(?:raised|recorded|carried|left)\s+as\s+an?\s+open\s+question\b|\ban open question rather than\b|\bOpen question, not a settled reading\b/gi;
/**
 * The sentences that present a question's answer as the build's own reading: "OQ-103's reading", "OQ-190's build
 * reading", "the build's reading, recorded beside OQ-97". Of a question still open that is what the build proceeds
 * under; of a settled one it hides that the owner has answered, unless the words beside it say so (repair round 1 of
 * F16: the form stood in the views after the comments that used it were repaired).
 */
const READING_CLAIMS = [
  new RegExp(String.raw`(${LIST})'s\s+(?:(?:literal|build|built|recorded|own)\s+)?reading\b`, 'g'),
  new RegExp(String.raw`\bbuild's\s+reading\b[^.\n]{0,40}?\b(?:beside|of|under|as|in)\s+(${LIST})`, 'g'),
];
/**
 * What, beside a claim, says it is history: the ruling's own words, its date, or the owner's request that ruled it.
 * A bare "closed" is not one ("OQ-37 stays open; the socket is closed after use" is no history), and neither is "not
 * ruled".
 */
const HISTORY = /(?<!\bnot\s)\b(?:ruled|confirmed|withdrawn|deferred|resolved|ratified|superseded|supersedes|rulings?)\b|\b(?:closed|decided),?\s+20\d\d-\d\d-\d\d|\bdecision closed\b|\bR-\d{3}\b|\bwhile (?:it|they) (?:was|were) open\b|\bwhile OQ-\d+ was open\b/i;
/** What, earlier in a reading's own sentence, dates the claim as past: "Until 2026-10-06 this read: … (OQ-182's reading)". */
const UNTIL = /\buntil\s+20\d\d-\d\d-\d\d\b/i;

/** The question numbers a reference list names, ranges expanded. */
export function numbersOf(list) {
  const parts = [...list.matchAll(/OQ-(\d+)|\bto\b/g)];
  /** @type {number[]} */
  const out = [];
  for (let k = 0; k < parts.length; k++) {
    if (parts[k][1] === undefined) continue;
    const n = Number(parts[k][1]);
    const prev = out[out.length - 1];
    if (k >= 2 && parts[k - 1][0] === 'to' && prev !== undefined && n > prev && n - prev < 50) {
      for (let x = prev + 1; x <= n; x++) out.push(x);
    } else out.push(n);
  }
  return out;
}

/** The paragraph's end after `from`: a blank line, or the text's end. */
function paragraphEnd(text, from) {
  const m = /\n[ \t]*(?:\*|\/\/)?[ \t]*\n/.exec(text.slice(from));
  return m ? from + m.index : text.length;
}

/** Where the words that may annotate a claim at `at` end: its paragraph's end, or in a table row the row's own end. */
function claimEnd(text, at) {
  const lineStart = text.lastIndexOf('\n', at) + 1;
  if (/^\s*\|/.test(text.slice(lineStart, at + 1))) {
    const eol = text.indexOf('\n', at);
    return eol < 0 ? text.length : eol;
  }
  return paragraphEnd(text, at);
}

/** Whether `at` sits inside a struck-through span `~~…~~` of its paragraph. */
function struck(text, at) {
  const start = text.lastIndexOf('\n\n', at);
  const before = text.slice(start < 0 ? 0 : start, at);
  return ((before.match(/~~/g) ?? []).length % 2) === 1;
}

/** Where the sentence holding `from` starts: after the last sentence end before it, at most 400 characters back. */
function sentenceStart(text, from) {
  const head = text.slice(Math.max(0, from - 400), from);
  const ends = [...head.matchAll(/[.!?](?:\*|\)|`)*\s/g)];
  return ends.length > 0 ? from - head.length + ends[ends.length - 1].index + ends[ends.length - 1][0].length : Math.max(0, from - 400);
}

/** The sentence around [from, to): back to the last sentence end, on to the next. */
function sentenceAround(text, from, to) {
  const start = sentenceStart(text, from);
  const tail = text.slice(to, to + 400);
  const next = /[.!?](?:\*|\)|`)*(?:\s|$)/.exec(tail);
  return text.slice(start, next ? to + next.index + 1 : to + tail.length);
}

/**
 * Every claim in one text that the questions' states refute: `{ line, kind, numbers, text }`. `kind` is `open` for a
 * settled question called open, `unraised` for a question said to be raised that names none.
 * @param {string} text
 * @param {Map<number, 'open' | 'settled' | 'deferred'>} states
 */
export function claimsIn(text, states) {
  /** @type {{ line: number, kind: 'open' | 'reading' | 'unraised', numbers: number[], text: string }[]} */
  const found = [];
  const lineOf = (at) => text.slice(0, at).split('\n').length;
  const seen = new Set();
  /** @param {RegExp[]} res @param {'open' | 'reading'} kind */
  const scan = (res, kind) => {
    for (const re of res) {
      re.lastIndex = 0;
      for (const m of text.matchAll(re)) {
        const at = m.index ?? 0;
        const numbers = numbersOf(m[1]).filter((n) => states.get(n) === 'settled');
        if (numbers.length === 0 || struck(text, at)) continue;
        const after = text.slice(at + m[0].length, Math.min(claimEnd(text, at), at + m[0].length + 240));
        if (HISTORY.test(after)) continue;
        // A reading may be annotated before it too, in its own sentence: "confirmed 2026-10-06, OQ-81's reading".
        if (kind === 'reading') {
          const before = text.slice(sentenceStart(text, at), at);
          if (HISTORY.test(before) || UNTIL.test(before)) continue;
        }
        const key = `${lineOf(at)}:${numbers.join(',')}`;
        if (seen.has(key)) continue;
        seen.add(key);
        found.push({ line: lineOf(at), kind, numbers, text: m[0].replace(/\s+/g, ' ') });
      }
    }
  };
  scan(OPEN_CLAIMS, 'open');
  scan(READING_CLAIMS, 'reading');
  RAISED_CLAIM.lastIndex = 0;
  for (const m of text.matchAll(RAISED_CLAIM)) {
    const at = m.index ?? 0;
    if (struck(text, at)) continue;
    if (/OQ-\d+/.test(sentenceAround(text, at, at + m[0].length))) continue;
    found.push({ line: lineOf(at), kind: 'unraised', numbers: [], text: m[0] });
  }
  return found.sort((a, b) => a.line - b.line);
}

// ---------------------------------------------------------------- the tree

const CODE_ROOTS = ['apps', 'packages', 'tools'];
const CODE_EXT = /\.(?:ts|tsx|mts|cts|js|mjs|cjs)$/;
const SKIP_DIRS = new Set(['node_modules', 'out', 'dist', 'generated', 'release', '.vite', 'coverage']);
/** This gate and its test name the claims they look for. */
const SELF = new Set(['tools/check-open-question-claims.mjs', 'tools/check-open-question-claims.test.ts']);

function walk(dir, keep, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name) || name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, keep, out);
    else if (keep(name)) out.push(full);
  }
  return out;
}

/** @param {string} file */
const withParts = (file) => [file, ...partsOf(file)];

/** The files read: the code under the three roots, and the record that describes the build as it stands. */
export function filesOf(root) {
  const code = CODE_ROOTS.flatMap((r) => walk(join(root, r), (n) => CODE_EXT.test(n)));
  const record = [
    ...walk(join(root, 'docs', 'architecture', 'views'), (n) => n.endsWith('.md')),
    // Each with the parts it indexes, where it was split (`record-parts.mjs`).
    ...withParts(join(root, 'docs', 'architecture', 'codebase.md')),
    ...withParts(join(root, 'docs', 'architecture', 'first-release-plan.md')),
    ...withParts(join(root, 'docs', 'architecture', 'README.md')),
    join(root, 'AGENTS.md'),
    ...withParts(join(root, 'docs', 'proofs', 'live-run.md')),
    join(root, 'CONTEXT-MAP.md'),
    join(root, 'docs', 'module-map.md'),
    ...walk(join(root, '.claude', 'rules'), (n) => n.endsWith('.md')),
    ...CODE_ROOTS.flatMap((r) => walk(join(root, r), (n) => n === 'CONTEXT.md')),
  ].filter((f) => existsSync(f));
  return [...code, ...record].filter((f) => !SELF.has(relative(root, f).split(sep).join('/')));
}

/** Every refuted claim in the tree, `{ file, line, kind, numbers, text }`. */
export function checkTree(root) {
  const states = questionStates(readRecordWithArchive(join(root, 'docs', 'architecture', 'open-questions.md')));
  const problems = [];
  for (const file of filesOf(root)) {
    for (const c of claimsIn(readFileSync(file, 'utf8'), states)) problems.push({ file: relative(root, file).split(sep).join('/'), ...c });
  }
  return problems;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
  const problems = checkTree(root);
  for (const p of problems) {
    const named = p.numbers.map((n) => `OQ-${n}`).join(', ');
    const what = p.kind === 'open'
      ? `calls ${named} open, and open-questions.md records ${p.numbers.length > 1 ? 'them' : 'it'} settled`
      : p.kind === 'reading'
        ? `presents ${named} as the build's reading, and open-questions.md records ${p.numbers.length > 1 ? 'them' : 'it'} settled: say how it was ruled`
        : 'says a question was raised and names none: raise it in open-questions.md and cite its number';
    console.error(`${p.file}:${p.line}: "${p.text}" ${what}`);
  }
  if (problems.length > 0) {
    console.error(`check-open-question-claims: ${problems.length} claim(s) the open-questions record refutes`);
    process.exit(1);
  }
  console.log(`check-open-question-claims: ${filesOf(root).length} files read, no claim the open-questions record refutes`);
}
