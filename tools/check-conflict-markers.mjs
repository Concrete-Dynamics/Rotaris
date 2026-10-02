#!/usr/bin/env node
// A merge's conflict markers never reach a commit. In TypeScript a marker fails the typecheck, but in Markdown,
// JSON read as text, a YAML file or any other file the gate does not parse, nothing else reads it: the merge of
// `origin/main` into `fin3-setup-words` (361f71c) committed one block in `docs/architecture/first-executions.md`
// and the whole of `pnpm check` passed over it
// (docs/defects/fixed/the-gate-passes-a-committed-merge-conflict-marker.md).
//
// What counts as a marker, as git writes one: a line that BEGINS with seven `<`, seven `|` or seven `>` followed by
// a space or the end of the line, and a line that is exactly seven `=`. The last is also a legal Markdown setext
// heading underline, so it counts only between an opening `<` marker and its closing `>` marker. A marker shown as
// an example is indented (or quoted), never at column 0, and passes.
//
// It reads every tracked text file twice over: the working copy (what the next `git add` stages) and the index
// (what the next commit carries), since either can hold a marker the other has lost. One `git grep` per side
// names the candidate files; only those are read. Runs as part of `pnpm lint`.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const OPEN = '<'.repeat(7);
const BASE = '|'.repeat(7);
const SEPARATOR = '='.repeat(7);
const CLOSE = '>'.repeat(7);

/** True when `line` starts with `marker` followed by a space or nothing — git's own shape. */
function isMarker(line, marker) {
  return line.startsWith(marker) && (line.length === marker.length || line[marker.length] === ' ');
}

/**
 * Every conflict-marker line in one text, `{ line, marker }` with a 1-based line number. An opening, base or
 * closing marker counts wherever it stands at column 0; a separator counts only inside an open block.
 * @param {string} text
 * @returns {{ line: number, marker: string }[]}
 */
export function markersIn(text) {
  const found = [];
  let open = false;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\r$/, '');
    if (isMarker(line, OPEN)) {
      found.push({ line: i + 1, marker: OPEN });
      open = true;
    } else if (isMarker(line, BASE)) {
      found.push({ line: i + 1, marker: BASE });
    } else if (line === SEPARATOR) {
      if (open) found.push({ line: i + 1, marker: SEPARATOR });
    } else if (isMarker(line, CLOSE)) {
      found.push({ line: i + 1, marker: CLOSE });
      open = false;
    }
  }
  return found;
}

/** The pattern `git grep` narrows the files by; the separator alone never makes a file a candidate. */
const CANDIDATE = `^(${OPEN}|${CLOSE}|\\|{7})( |$)`;

/** Paths `git grep` names in `root`, over the working copy or (`cached`) the index; null when not a git checkout. */
function candidates(root, cached) {
  try {
    const out = execFileSync('git', ['grep', '-l', '-I', '-z', ...(cached ? ['--cached'] : []), '-E', CANDIDATE], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.split('\0').filter((p) => p !== '');
  } catch (error) {
    // `git grep` exits 1 when nothing matches: that is the green answer, not a failure.
    if (error && typeof error === 'object' && 'status' in error && error.status === 1) return [];
    return null;
  }
}

/**
 * The markers in `root`'s tracked files, each as `{ where, path, line, marker }` (`where` is `working copy` or
 * `index`), or `null` when `root` is not a git checkout.
 * @param {string} root
 */
export function checkRepository(root) {
  const working = candidates(root, false);
  const index = candidates(root, true);
  if (working === null || index === null) return null;
  const problems = [];
  for (const path of working) {
    let text;
    try { text = readFileSync(join(root, path), 'utf8'); } catch { continue; }
    for (const m of markersIn(text)) problems.push({ where: 'working copy', path, ...m });
  }
  for (const path of index) {
    let text;
    try {
      text = execFileSync('git', ['show', `:${path}`], {
        cwd: root,
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch {
      continue; // an unmerged path has no stage-0 entry; its working copy was read above
    }
    for (const m of markersIn(text)) problems.push({ where: 'index', path, ...m });
  }
  return problems;
}

if (process.argv[1] && import.meta.filename === process.argv[1]) {
  const problems = checkRepository(join(import.meta.dirname, '..'));
  if (problems === null) {
    // Not a git checkout (a packaged tarball, a sandbox): nothing to ask, as check-line-endings does.
    console.log('check-conflict-markers: not a git checkout, skipped');
  } else if (problems.length > 0) {
    console.error(`check-conflict-markers: ${problems.length} merge-conflict marker line${problems.length === 1 ? '' : 's'} in tracked files:`);
    for (const p of problems) console.error(`  ${p.path}:${p.line}: ${p.marker} (${p.where})`);
    console.error('');
    console.error('Resolve the merge by reading both sides (docs/clean-room/agent-workflow.md, "Merge back"), then stage the path again.');
    process.exitCode = 1;
  } else {
    console.log('check-conflict-markers: no merge-conflict marker in a tracked file');
  }
}
