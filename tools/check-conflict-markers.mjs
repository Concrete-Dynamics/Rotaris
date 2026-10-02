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

/**
 * Runs git in `root` with colour off, whatever the user's or the host's configuration says: `color.ui=always` or
 * `color.grep=always` wraps every path `git grep -l` names in ANSI escapes, no such file exists, and a reader that
 * skipped the unreadable name answered green over a staged block (the first verifier's finding on this gate).
 * @param {string} root
 * @param {string[]} args
 */
function git(root, args) {
  return execFileSync('git', ['-c', 'color.ui=false', '-c', 'color.grep=false', ...args], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/** True when `root` is inside a git work tree; false when git is missing or `root` is not a checkout. */
function isCheckout(root) {
  try {
    return git(root, ['rev-parse', '--is-inside-work-tree']).trim() === 'true';
  } catch {
    return false;
  }
}

/** Why a git call failed, in one line: its stderr when it wrote one, else the error's own message. */
function reasonOf(error) {
  const stderr = error && typeof error === 'object' && 'stderr' in error ? String(error.stderr).trim() : '';
  return stderr !== '' ? stderr.split('\n')[0] : String(error instanceof Error ? error.message : error);
}

/**
 * Paths `git grep` names in `root`, over the working copy or (`cached`) the index. `git grep` exiting 1 is the
 * green answer (nothing matched); any other failure in a checkout throws, so a broken checkout cannot read as
 * "skipped" or as clean.
 */
function candidates(root, cached) {
  try {
    const out = git(root, ['grep', '--no-color', '-l', '-I', '-z', ...(cached ? ['--cached'] : []), '-E', CANDIDATE]);
    return out.split('\0').filter((p) => p !== '');
  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error && error.status === 1) return [];
    throw new Error(`git grep${cached ? ' --cached' : ''} failed: ${reasonOf(error)}`);
  }
}

/** The paths with an unmerged entry in the index (stages 1 to 3, no stage 0). */
function unmergedPaths(root) {
  const out = git(root, ['ls-files', '-u', '-z']);
  const paths = new Set();
  for (const record of out.split('\0')) {
    const tab = record.indexOf('\t');
    if (tab !== -1) paths.add(record.slice(tab + 1));
  }
  return paths;
}

/**
 * The markers in `root`'s tracked files, each as `{ where, path, line, marker }` (`where` is `working copy` or
 * `index`), or `null` when `root` is not a git checkout. A candidate path the check cannot read is a problem too,
 * `{ where, path, unreadable }`, never a silent skip; the one exception is an unmerged path, which has no stage-0
 * entry to read from the index and whose working copy is read instead.
 * @param {string} root
 */
export function checkRepository(root) {
  if (!isCheckout(root)) return null;
  const working = candidates(root, false);
  const index = candidates(root, true);
  const problems = [];
  for (const path of working) {
    let text;
    try {
      text = readFileSync(join(root, path), 'utf8');
    } catch (error) {
      problems.push({ where: 'working copy', path, unreadable: reasonOf(error) });
      continue;
    }
    for (const m of markersIn(text)) problems.push({ where: 'working copy', path, ...m });
  }
  const unmerged = index.length > 0 ? unmergedPaths(root) : new Set();
  for (const path of index) {
    let text;
    try {
      text = git(root, ['cat-file', 'blob', `:${path}`]);
    } catch (error) {
      if (unmerged.has(path)) continue; // no stage-0 entry; its working copy was read above
      problems.push({ where: 'index', path, unreadable: reasonOf(error) });
      continue;
    }
    for (const m of markersIn(text)) problems.push({ where: 'index', path, ...m });
  }
  return problems;
}

if (process.argv[1] && import.meta.filename === process.argv[1]) {
  let problems;
  try {
    problems = checkRepository(join(import.meta.dirname, '..'));
  } catch (error) {
    // A checkout git cannot grep (a corrupt index, a broken object store) has no answer to give: red, not skipped.
    console.error(`check-conflict-markers: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  if (problems === null) {
    // Not a git checkout (a packaged tarball, a sandbox): nothing to ask, as check-line-endings does.
    console.log('check-conflict-markers: not a git checkout, skipped');
  } else if (problems.length > 0) {
    console.error(`check-conflict-markers: ${problems.length} problem${problems.length === 1 ? '' : 's'} in tracked files (a merge-conflict marker, or a candidate it could not read):`);
    for (const p of problems) {
      if ('unreadable' in p) console.error(`  ${p.path}: could not be read (${p.where}): ${p.unreadable}`);
      else console.error(`  ${p.path}:${p.line}: ${p.marker} (${p.where})`);
    }
    console.error('');
    console.error('Resolve the merge by reading both sides (docs/clean-room/agent-workflow.md, "Merge back"), then stage the path again.');
    process.exitCode = 1;
  } else {
    console.log('check-conflict-markers: no merge-conflict marker in a tracked file');
  }
}
