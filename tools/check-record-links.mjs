#!/usr/bin/env node
// A defect note is repaired by moving it to `docs/defects/fixed/`, and nothing
// moved the links that named it at its old path. Six of them dangled on
// 2026-09-28, beside an ADR cited by a filename it never had — every one a
// one-target edit, and every one invisible until somebody followed the link
// (`docs/defects/fixed/record-links-still-name-defect-notes-at-their-pre-fixed-paths.md`).
//
// This gate reads every relative Markdown link in the record and fails on one
// that reaches nothing: the target file or directory must exist, and a fragment
// (`#anchor`) must name a heading, or an explicit `<a id>` / `{#id}`, in the file
// it points at. Links inside fenced code and inline code are text, not links, and
// are skipped; so is anything inside an HTML comment, which does not render.
//
// The record, for this gate, is: every `.md` under `docs/`, `CONTEXT-MAP.md`,
// `AGENTS.md`, `CLAUDE.md`, and every `CONTEXT.md` under `packages/` (the
// glossaries the context map names, nested ones included).
//
// A second pass reads the code. Comments, tests and proof scripts under `apps/`,
// `packages/` and `tools/` cite defect notes by their repository path
// (`docs/defects/….md`), which is not a Markdown link, so the first pass never
// saw one; nineteen such pointers had outlived the move of their note on
// 2026-10-03 (`docs/defects/fixed/code-comments-cite-defect-notes-at-paths-they-no-longer-have.md`).
// Every such path must name a note that exists, and must be written whole, on one
// line: the first form of this pass read only a path reaching `.md` on its line,
// so eleven pointers a comment wrapped onto its next line and two abbreviated
// with `…` passed unread, and would have passed after their note moved (the
// verifier of fin13; `partialDefectPaths`). The directory itself and a `….md` or
// `*.md` placeholder name no note and are left alone.
//
// A third pass reads the record's prose. The record cites notes by their
// repository path written as inline code as well as by link, and moves had left
// eighteen such paths behind by 2026-10-03, which neither pass read
// (`docs/defects/fixed/the-records-prose-names-defect-notes-at-paths-they-no-longer-have.md`).
// Every `docs/defects/….md` path in an inline code span of a record file must name
// a note that exists, unless it is history kept on purpose and marked so on its
// own line (`prosePointers`, `checkProseFile`); `docs/product/requests.md` is not
// read (`PROSE_EXEMPT`, which says why).
//
// Runs as part of `pnpm lint`. Reads the tree; costs no subprocess. The pure
// parts are exported for the test beside this file.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// ---------------------------------------------------------------- the text

/**
 * Blank what does not render as a link, keeping every newline so that line
 * numbers still point at the file: fenced code (``` or ~~~, any indent up to
 * three spaces), inline code (one or more backticks, closed by the same run
 * within one paragraph), and HTML comments.
 * @param {string} text
 * @returns {string}
 */
export function withoutCode(text) {
  const blank = (/** @type {string} */ s) => s.replace(/[^\n]/g, ' ');
  let out = text.replace(/<!--[\s\S]*?-->/g, blank);
  // Fenced blocks: an opening fence of N backticks or tildes closes on a line
  // holding at least N of the same character and nothing else. An unclosed
  // fence runs to the end of the file, as CommonMark reads it.
  out = out.replace(/^( {0,3})(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^ {0,3}\2[ \t]*$|(?![\s\S]))/gm, blank);
  // Inline code: a run of backticks closed by an equal run in the same
  // paragraph — a code span may wrap a line but never crosses a blank one, so
  // a stray backtick cannot pair with one paragraphs later and hide the links
  // between them. A run with no partner is literal text and stays.
  out = out.replace(/(`+)(?!`)(?:(?!\n[ \t]*\n)[\s\S])*?[^`]\1(?!`)/g, blank);
  return out;
}

/**
 * Every inline Markdown link `[text](target)` and image `![alt](target)` in the
 * text, with its 1-based line. The target may be `<angle-bracketed>` and may
 * carry a `"title"` after a space; both are stripped. Reference definitions
 * (`[label]: target`) are read too, since they resolve exactly like inline ones.
 * @param {string} text already passed through `withoutCode`
 * @param {string} [raw] the same file before blanking, so the reported link text keeps its
 *        backticks; `withoutCode` preserves every offset, so the two index alike
 * @returns {{ line: number, text: string, target: string }[]}
 */
export function extractLinks(text, raw = text) {
  /** @type {{ line: number, text: string, target: string }[]} */
  const links = [];
  const lineOf = (/** @type {number} */ index) => text.slice(0, index).split('\n').length;
  // `[text](target)` — the text may hold one level of nested brackets (an
  // image inside a link, or `[`REQ-X`]`), the target no unescaped `)` except
  // inside a balanced pair.
  const INLINE = /\[((?:[^[\]]|\[[^[\]]*\])*)\]\(\s*(<[^>]*>|(?:[^\s()]|\([^\s()]*\))+)(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g;
  for (const match of text.matchAll(INLINE)) {
    const textStart = match.index + 1;
    links.push({
      line: lineOf(match.index),
      text: raw.slice(textStart, textStart + match[1].length),
      target: unwrap(match[2]),
    });
  }
  const DEFINITION = /^ {0,3}\[([^\]]+)\]:\s+(<[^>]*>|\S+)/gm;
  for (const match of text.matchAll(DEFINITION)) {
    links.push({ line: lineOf(match.index), text: match[1], target: unwrap(match[2]) });
  }
  links.sort((a, b) => a.line - b.line);
  return links;
}

/** @param {string} target */
const unwrap = (target) => (target.startsWith('<') && target.endsWith('>') ? target.slice(1, -1) : target);

/**
 * A relative link is one this repository can answer for: no scheme, no
 * protocol-relative `//`, not an absolute path (there is no site root to resolve
 * it against). `mailto:`, `https:` and the like are somebody else's.
 * @param {string} target
 */
export function isRelative(target) {
  if (target === '') return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return false;
  if (target.startsWith('//') || target.startsWith('/')) return false;
  return true;
}

// ------------------------------------------------------------- the anchors

/**
 * The anchors a Markdown file answers to: GitHub's slug of every ATX heading
 * (lowercased, markup and punctuation dropped, spaces to hyphens, a `-N` suffix
 * on a repeat), plus every explicit `<a id="…">`, `<a name="…">`, `id="…"` on
 * any element, and `{#id}` heading suffix.
 * @param {string} text the raw file
 * @returns {Set<string>}
 */
export function anchorsOf(text) {
  const anchors = new Set();
  /** @type {Map<string, number>} */
  const seen = new Map();
  const visible = withoutCode(text);
  // Headings are read from the text with fences blanked (a `#` inside a code
  // block is not a heading) but with inline code kept, since `## The \`store\``
  // slugs to `the-store`.
  const fencesOnly = text
    .replace(/<!--[\s\S]*?-->/g, (s) => s.replace(/[^\n]/g, ' '))
    .replace(/^( {0,3})(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^ {0,3}\2[ \t]*$|(?![\s\S]))/gm, (s) =>
      s.replace(/[^\n]/g, ' '),
    );
  for (const match of fencesOnly.matchAll(/^ {0,3}#{1,6}[ \t]+(.+?)[ \t]*#*[ \t]*$/gm)) {
    let heading = match[1];
    const custom = /\{#([^}\s]+)\}\s*$/.exec(heading);
    if (custom !== null) {
      anchors.add(custom[1]);
      heading = heading.slice(0, custom.index);
    }
    const slug = githubSlug(heading);
    const count = seen.get(slug) ?? 0;
    seen.set(slug, count + 1);
    anchors.add(count === 0 ? slug : `${slug}-${count}`);
  }
  for (const match of visible.matchAll(/<[a-z][^>]*\s(?:id|name)="([^"]+)"/gi)) anchors.add(match[1]);
  return anchors;
}

/**
 * GitHub's heading slug: inline markup rendered away (code spans keep their
 * text, links keep theirs, emphasis and strikethrough marks dropped), then
 * lowercased, everything but letters, numbers, spaces, hyphens and underscores
 * removed, spaces to hyphens.
 * @param {string} heading
 */
export function githubSlug(heading) {
  const rendered = heading
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*|__|~~|\*|_(?=\s|$)|(?<=\s|^)_/g, '')
    .replace(/<[^>]+>/g, '');
  return rendered
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s\-_]/gu, '')
    .replace(/\s/g, '-');
}

// ------------------------------------------------------------- the verdict

/**
 * Check one file's links against the disk.
 * @param {string} file absolute path of the Markdown file
 * @param {{ read?: (path: string) => string, exists?: (path: string) => boolean, isDirectory?: (path: string) => boolean }} [io]
 * @returns {{ file: string, line: number, text: string, target: string, reason: string }[]}
 */
export function checkFile(file, io = {}) {
  const read = io.read ?? ((p) => readFileSync(p, 'utf8'));
  const exists = io.exists ?? existsSync;
  const isDirectory = io.isDirectory ?? ((p) => statSync(p).isDirectory());
  /** @type {Map<string, Set<string>>} */
  const anchorCache = new Map();
  const anchorsIn = (/** @type {string} */ path) => {
    let found = anchorCache.get(path);
    if (found === undefined) {
      found = anchorsOf(read(path));
      anchorCache.set(path, found);
    }
    return found;
  };

  const problems = [];
  const text = read(file);
  for (const link of extractLinks(withoutCode(text), text)) {
    if (!isRelative(link.target)) continue;
    const hash = link.target.indexOf('#');
    const pathPart = hash === -1 ? link.target : link.target.slice(0, hash);
    const fragment = hash === -1 ? '' : link.target.slice(hash + 1);
    let decodedPath;
    try {
      decodedPath = decodeURIComponent(pathPart);
    } catch {
      decodedPath = pathPart;
    }
    const targetPath = decodedPath === '' ? file : resolve(dirname(file), decodedPath);
    if (!exists(targetPath)) {
      problems.push({ file, ...link, reason: 'the target does not exist' });
      continue;
    }
    if (fragment === '') continue;
    if (isDirectory(targetPath)) {
      problems.push({ file, ...link, reason: 'the target is a directory, which has no anchors' });
      continue;
    }
    if (!targetPath.endsWith('.md')) continue; // an anchor into a non-Markdown file is not ours to read
    let wanted;
    try {
      wanted = decodeURIComponent(fragment);
    } catch {
      wanted = fragment;
    }
    const anchors = anchorsIn(targetPath);
    if (!anchors.has(wanted) && !anchors.has(wanted.toLowerCase())) {
      problems.push({ file, ...link, reason: `no heading or anchor \`#${wanted}\` in the target` });
    }
  }
  return problems;
}

/**
 * The record's files, under a repository root.
 * @param {string} root
 * @returns {string[]}
 */
export function recordFiles(root) {
  /** @type {string[]} */
  const files = [];
  /** @param {string} dir @param {(name: string) => boolean} keep */
  const walk = (dir, keep) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir).sort()) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full, keep);
      else if (keep(entry)) files.push(full);
    }
  };
  walk(join(root, 'docs'), (name) => name.endsWith('.md'));
  for (const top of ['CONTEXT-MAP.md', 'AGENTS.md', 'CLAUDE.md']) {
    const full = join(root, top);
    if (existsSync(full)) files.push(full);
  }
  walk(join(root, 'packages'), (name) => name === 'CONTEXT.md');
  return files;
}

/**
 * Run the gate over a root; returns the problems and the number of links read.
 * @param {string} root
 */
export function checkRecord(root) {
  const problems = [];
  let links = 0;
  for (const file of recordFiles(root)) {
    links += extractLinks(withoutCode(readFileSync(file, 'utf8'))).filter((l) => isRelative(l.target)).length;
    problems.push(...checkFile(file));
  }
  return { problems, links, files: recordFiles(root).length };
}

// ------------------------------------------------------ the code's pointers

/** The directories whose files the second pass reads, under the repository root. */
export const CODE_ROOTS = ['apps', 'packages', 'tools'];
/** What is built, installed or generated is not written by anyone, so it cites nothing. */
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'out', 'dist', 'coverage', 'release']);
const CODE_FILE = /\.(?:[cm]?[jt]sx?|css|html|json|ya?ml)$/;

/**
 * Every repository path to a defect note in a text, with its 1-based line: `docs/defects/` followed by a
 * file name ending `.md`, under `fixed/` or not. A path is read wherever it stands — comment, string or
 * template — since a pointer printed by a proof is as much a pointer as one in a comment.
 * @param {string} text
 * @returns {{ line: number, target: string }[]}
 */
export function defectPointers(text) {
  /** @type {{ line: number, target: string }[]} */
  const pointers = [];
  for (const match of text.matchAll(/docs\/defects\/[A-Za-z0-9_./-]*?\.md(?![A-Za-z0-9_-])/g)) {
    pointers.push({ line: text.slice(0, match.index).split('\n').length, target: match[0] });
  }
  return pointers;
}

/**
 * Every `docs/defects/` path in a text that no pass can check, with its 1-based line: one a comment wraps across a
 * line (at a hyphen, at a dot, or right after the slash, so the line ends inside the path) or abbreviates with `…`.
 * Such a path is read as written, which is not a note's path, so it passed the gate whether its note had moved or
 * not; a pointer is written whole, on one line. What is left alone is what names no note: the directory itself
 * (`docs/defects/` or `docs/defects/fixed/` followed by anything but a name or the line's end) and a placeholder
 * of `…` or `*` alone (a `docs/defects/….md` path, a `*.md` glob). A whole path is `defectPointers`'s to read.
 * @param {string} text
 * @returns {{ line: number, target: string }[]}
 */
export function partialDefectPaths(text) {
  /** @type {{ line: number, target: string }[]} */
  const partial = [];
  for (const match of text.matchAll(/docs\/defects\/(?:fixed\/)?/g)) {
    const start = match.index;
    const after = text.slice(start + match[0].length);
    if (/^[A-Za-z0-9_./-]*?\.md(?![A-Za-z0-9_-])/.test(after)) continue; // whole: defectPointers reads it
    const run = /^[A-Za-z0-9_.…*-]*/.exec(after)?.[0] ?? '';
    const atLineEnd = /^[ \t]*(?:\r?\n|$)/.test(after.slice(run.length));
    const named = /[A-Za-z0-9_]/.test(run.replace(/\.md$/, '')); // a `….md` placeholder names nothing
    if (named || (run === '' && atLineEnd)) {
      partial.push({ line: text.slice(0, start).split('\n').length, target: match[0] + run });
    }
  }
  return partial;
}

/**
 * The code's files, under a repository root: every source, style, markup and data file in `CODE_ROOTS`,
 * skipping dot-directories and what a build or an install writes.
 * @param {string} root
 * @returns {string[]}
 */
export function codeFiles(root) {
  /** @type {string[]} */
  const files = [];
  /** @param {string} dir */
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir).sort()) {
      if (entry.startsWith('.') || SKIPPED_DIRECTORIES.has(entry)) continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (CODE_FILE.test(entry)) files.push(full);
    }
  };
  for (const top of CODE_ROOTS) walk(join(root, top));
  return files;
}

/**
 * Check one code file's defect-note paths against the disk, resolved from the repository root.
 * @param {string} root
 * @param {string} file absolute path
 * @param {{ read?: (path: string) => string, exists?: (path: string) => boolean }} [io]
 * @returns {{ file: string, line: number, text: string, target: string, reason: string }[]}
 */
export function checkCodeFile(root, file, io = {}) {
  const read = io.read ?? ((p) => readFileSync(p, 'utf8'));
  const exists = io.exists ?? existsSync;
  const text = read(file);
  return [
    ...defectPointers(text)
      .filter((pointer) => !exists(join(root, pointer.target)))
      .map((pointer) => ({ file, line: pointer.line, text: 'defect note', target: pointer.target, reason: 'no note at this path' })),
    ...partialDefectPaths(text).map((pointer) => ({
      file,
      line: pointer.line,
      text: 'defect note',
      target: pointer.target,
      reason: 'a path wrapped across a line or abbreviated, which no pass can check: write it whole, on one line',
    })),
  ].sort((a, b) => a.line - b.line);
}

/**
 * Run the second pass over a root; returns the problems and the number of pointers read.
 * @param {string} root
 */
export function checkCode(root) {
  const problems = [];
  let pointers = 0;
  const files = codeFiles(root);
  for (const file of files) {
    pointers += defectPointers(readFileSync(file, 'utf8')).length;
    problems.push(...checkCodeFile(root, file));
  }
  return { problems, pointers, files: files.length };
}

// ------------------------------------------------- the record's prose pointers

/**
 * Files of the record the third pass does not read, each with the reason. The pass fails a line, so a file only the
 * orchestrator may edit would turn every workflow agent's gate red on a line that agent is forbidden to touch; its
 * pointers are kept by its owner, and its Markdown links are still read by the first pass.
 * @type {ReadonlyMap<string, string>}
 */
export const PROSE_EXEMPT = new Map([
  [
    'docs/product/requests.md',
    "the request log is the orchestrator's alone to edit (.agents/skills/orchestrated-build/references/repository.md), " +
      'so a workflow agent that moves a note cannot take its pointers there along',
  ],
]);

/**
 * The explicit mark of a deliberate historical path: an HTML comment, which does not render, on the same line as the
 * path and naming it exactly, `<!-- historical-path: docs/defects/….md -->` (several paths separated by spaces). It
 * keeps that path on that line and nothing else, and it is checked itself: a mark naming no path written as inline code
 * on its line, or a path a note is at, fails, so a mark can neither outlive its line nor hide a live pointer.
 */
const HISTORICAL_MARK = /<!--\s*historical-path:([^>]*?)-->/g;

/**
 * The record's prose pointers: every repository path to a defect note (`defectPointers`) written as inline code in a
 * Markdown file, in a sentence or in a link's text, with its 1-based line; and every historical-path mark, with the line
 * it stands on and each path it names. Fenced code is an example, not a pointer, and is skipped; so is a path inside an
 * HTML comment, other than the mark's own, and a mark written inside inline code (an example of one).
 * @param {string} text the raw Markdown file
 * @returns {{ pointers: { line: number, target: string }[], marks: { line: number, target: string }[] }}
 */
export function prosePointers(text) {
  const blank = (/** @type {string} */ s) => s.replace(/[^\n]/g, ' ');
  const lineOf = (/** @type {number} */ index) => text.slice(0, index).split('\n').length;
  const FENCE = /^( {0,3})(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^ {0,3}\2[ \t]*$|(?![\s\S]))/gm;
  const SPAN = /(`+)(?!`)((?:(?!\n[ \t]*\n)[\s\S])*?[^`])\1(?!`)/g;
  const unfenced = text.replace(FENCE, blank);
  /** @type {{ line: number, target: string }[]} */
  const pointers = [];
  for (const span of unfenced.replace(/<!--[\s\S]*?-->/g, blank).matchAll(SPAN)) {
    const at = span.index + span[1].length;
    for (const pointer of defectPointers(span[2])) pointers.push({ line: lineOf(at) + pointer.line - 1, target: pointer.target });
  }
  /** @type {{ line: number, target: string }[]} */
  const marks = [];
  for (const mark of unfenced.replace(SPAN, blank).matchAll(HISTORICAL_MARK)) {
    for (const target of mark[1].trim().split(/\s+/).filter((t) => t !== '')) marks.push({ line: lineOf(mark.index), target });
  }
  return { pointers, marks };
}

/**
 * Check one record file's prose pointers against the disk, resolved from the repository root: a path that names no note
 * fails unless a historical-path mark on its line names it, and a mark fails when it keeps nothing or keeps a live path.
 * @param {string} root
 * @param {string} file absolute path
 * @param {{ read?: (path: string) => string, exists?: (path: string) => boolean }} [io]
 * @returns {{ file: string, line: number, text: string, target: string, reason: string }[]}
 */
export function checkProseFile(root, file, io = {}) {
  const read = io.read ?? ((p) => readFileSync(p, 'utf8'));
  const exists = io.exists ?? existsSync;
  const { pointers, marks } = prosePointers(read(file));
  const same = (/** @type {{ line: number, target: string }} */ a, /** @type {{ line: number, target: string }} */ b) => a.line === b.line && a.target === b.target;
  return [
    ...pointers
      .filter((p) => !exists(join(root, p.target)) && !marks.some((m) => same(m, p)))
      .map((p) => ({ file, line: p.line, text: 'defect note', target: p.target, reason: 'no note at this path' })),
    ...marks
      .filter((m) => !pointers.some((p) => same(p, m)))
      .map((m) => ({ file, line: m.line, text: 'historical-path', target: m.target, reason: 'the mark names no path written as inline code on its line' })),
    ...marks
      .filter((m) => pointers.some((p) => same(p, m)) && exists(join(root, m.target)))
      .map((m) => ({ file, line: m.line, text: 'historical-path', target: m.target, reason: 'marked historical, but a note is at this path: a live pointer is checked, not kept' })),
  ].sort((a, b) => a.line - b.line);
}

/**
 * Run the third pass over a root: every record file (`recordFiles`) but those `PROSE_EXEMPT` names. Returns the problems,
 * the number of paths read and the number kept by a mark.
 * @param {string} root
 */
export function checkProse(root) {
  const problems = [];
  let pointers = 0;
  let kept = 0;
  const files = recordFiles(root).filter((f) => !PROSE_EXEMPT.has(relative(root, f).split(sep).join('/')));
  for (const file of files) {
    const found = prosePointers(readFileSync(file, 'utf8'));
    pointers += found.pointers.length;
    kept += found.marks.length;
    problems.push(...checkProseFile(root, file));
  }
  return { problems, pointers, kept, files: files.length };
}

/** @param {string} root @param {ReturnType<typeof checkFile>[number]} problem */
export const formatProblem = (root, problem) =>
  `${relative(root, problem.file).split(sep).join('/')}:${problem.line}: [${problem.text}](${problem.target}) — ${problem.reason}`;

// ---------------------------------------------------------------- the run

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (invokedDirectly) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const { problems, links, files } = checkRecord(root);
  const code = checkCode(root);
  if (problems.length > 0) {
    console.error(`check-record-links: ${problems.length} dangling link(s) in the record:`);
    for (const problem of problems) console.error(`  - ${formatProblem(root, problem)}`);
    console.error('');
    console.error('A relative link in docs/, CONTEXT-MAP.md, AGENTS.md, CLAUDE.md or a packages/**/CONTEXT.md must');
    console.error('reach an existing file or directory, and a `#fragment` must name a heading or an explicit anchor');
    console.error('in that file. A defect note moved to docs/defects/fixed/ takes every link to it along, in the');
    console.error('same commit (CLAUDE.md, "Defects noticed along the way").');
  }
  if (code.problems.length > 0) {
    if (problems.length > 0) console.error('');
    console.error(`check-record-links: ${code.problems.length} defect-note path(s) in the code name no note:`);
    for (const problem of code.problems) console.error(`  - ${relative(root, problem.file).split(sep).join('/')}:${problem.line}: ${problem.target} — ${problem.reason}`);
    console.error('');
    console.error('A docs/defects/….md path in apps/, packages/ or tools/ — a comment, a test, a proof\'s printed line —');
    console.error('must name a note that exists, written whole on one line so that this pass can read it. A note moved');
    console.error('to docs/defects/fixed/ takes these pointers along too.');
  }
  const prose = checkProse(root);
  if (prose.problems.length > 0) {
    if (problems.length > 0 || code.problems.length > 0) console.error('');
    console.error(`check-record-links: ${prose.problems.length} defect-note path(s) in the record's prose name no note:`);
    for (const problem of prose.problems) console.error(`  - ${relative(root, problem.file).split(sep).join('/')}:${problem.line}: ${problem.target} — ${problem.reason}`);
    console.error('');
    console.error('A docs/defects/….md path written as inline code in the record is a pointer like a link: a note moved');
    console.error('to docs/defects/fixed/ takes it along. A path kept on purpose as history (a repaired note quoting where');
    console.error('a note stood, a struck-through passage) is marked on its own line: <!-- historical-path: <the path> -->.');
    console.error(`Not read by this pass: ${[...PROSE_EXEMPT].map(([f, why]) => `${f}, since ${why}`).join('; ')}.`);
  }
  if (problems.length > 0 || code.problems.length > 0 || prose.problems.length > 0) process.exit(1);
  console.log(`check-record-links: ${links} relative links in ${files} files, every one resolves; ${code.pointers} defect-note paths in ${code.files} code files, every one whole and present; ${prose.pointers} in the record's prose, every one present or marked historical (${prose.kept} marked)`);
}
