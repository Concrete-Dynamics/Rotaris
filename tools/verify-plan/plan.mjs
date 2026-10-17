#!/usr/bin/env node
// @ts-check
// Local verification planner: given a diff, print the gate, the complete
// affected proof suites, and the architecture documents to consult. An unmapped
// path requires explicit review — it is never treated as "no proofs".
//
// Makes AGENTS.md's "run the whole suite a part touches" rule mechanical.
// Proofs measure the built app; live-run and slice-proof are never scheduled.
//
// Usage (`pnpm verify:plan [flags]`):
//   (none)              working tree + index + untracked against merge-base with main
//                       (origin/main if main is missing)
//   --base=<ref>        merge-base of HEAD and this ref (tries origin/<ref> if the ref is missing)
//   --files <path>…     classify these paths; do not read git. Flags after --files stay flags.
//   --json              the plan as JSON
//   --strict            exit 2 when review is required
//
// Reads git; writes nothing. The pure classifier is exported for the test beside this file.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { AREAS, NEVER_AUTOMATIC, RULES } from './map.mjs';
export { AREAS, NEVER_AUTOMATIC, RULES };

const USAGE = `pnpm verify:plan [flags]
  (none)              working tree + index + untracked against merge-base with main
                      (origin/main if main is missing)
  --base=<ref>        merge-base of HEAD and this ref (tries origin/<ref> if the ref is missing)
  --files <path>…     classify these paths; do not read git. Flags after --files stay flags.
  --json              the plan as JSON
  --strict            exit 2 when review is required
`;

const PROOF_FILE = /^apps\/desktop\/scripts\/([a-z0-9-]+)-proof(?:\.mjs|\/)/;
const GLOSSARY = /(?:^|\/)CONTEXT(?:-MAP)?\.md$/;

/** @param {string} p */
export function normalizePath(p) {
  return p.replace(/\\/g, '/').replace(/^\.\//, '');
}

/**
 * @param {string} path
 * @param {string} pattern
 */
export function pathMatches(path, pattern) {
  const p = normalizePath(path);
  const pat = normalizePath(pattern);
  if (pat.endsWith('/')) return p === pat.slice(0, -1) || p.startsWith(pat);
  // A trailing hyphen is a stem family (`session-` → session-writer.ts), not a file.
  if (pat.endsWith('-')) return p.startsWith(pat);
  return p === pat || p.startsWith(`${pat}/`) || p.startsWith(`${pat}.`);
}

/** @param {string} path */
export function skipped(path) {
  const p = normalizePath(path);
  return p.includes('/node_modules/') || p.startsWith('node_modules/')
    || p.startsWith('packages/kernel/src/generated/');
}

/**
 * Longest matching rule(s). Equal length is a union.
 * @param {string} path
 * @param {readonly import('./map.mjs').Rule[]} [rules]
 */
export function matchingRules(path, rules = RULES) {
  const p = normalizePath(path);
  let bestLen = -1;
  /** @type {import('./map.mjs').Rule[]} */
  const hits = [];
  for (const rule of rules) {
    let len = -1;
    for (const pat of rule.paths) {
      if (pathMatches(p, pat) && pat.length > len) len = pat.length;
    }
    if (len < 0) continue;
    if (len > bestLen) {
      bestLen = len;
      hits.length = 0;
      hits.push(rule);
    } else if (len === bestLen) {
      hits.push(rule);
    }
  }
  return hits;
}

/**
 * @param {string} path
 * @returns {string | null}
 */
export function proofScriptOf(path) {
  const m = PROOF_FILE.exec(normalizePath(path));
  return m ? `${m[1]}-proof` : null;
}

/**
 * Co-located tests an agent can run before the whole gate.
 * @param {string[]} paths
 * @param {(p: string) => boolean} [exists]
 */
export function narrowTests(paths, exists = () => false) {
  /** @type {Set<string>} */
  const tests = new Set();
  for (const raw of paths) {
    const p = normalizePath(raw);
    if (/\.test\.(?:ts|tsx|mjs|js)$/.test(p) || /\.spec\.(?:ts|tsx|mjs|js)$/.test(p)) {
      tests.add(p);
      continue;
    }
    const stem = p.replace(/\.(?:ts|tsx|mjs|js)$/, '');
    if (stem === p) continue;
    for (const cand of [`${stem}.test.ts`, `${stem}.test.tsx`, `${stem}.test.mjs`, `${stem}.test.js`]) {
      if (exists(cand)) tests.add(cand);
    }
  }
  return [...tests].sort();
}

/**
 * Every proof script the map names, including extras on rules.
 * @param {Readonly<Record<string, import('./map.mjs').Area>>} [areas]
 * @param {readonly import('./map.mjs').Rule[]} [rules]
 */
export function proofsInMap(areas = AREAS, rules = RULES) {
  /** @type {Set<string>} */
  const out = new Set();
  for (const area of Object.values(areas)) {
    for (const p of area.proofs) out.add(p);
  }
  for (const rule of rules) {
    for (const p of rule.proofs ?? []) out.add(p);
  }
  return out;
}

/**
 * @typedef {{
 *   path: string,
 *   areas: string[],
 *   proofs: string[],
 *   views: string[],
 *   review: string | null,
 *   notes: string[],
 *   unknown: boolean,
 * }} PathClass
 */

/**
 * @param {string} path
 * @returns {PathClass}
 */
export function classifyPath(path) {
  const p = normalizePath(path);
  /** @type {Set<string>} */
  const areas = new Set();
  /** @type {Set<string>} */
  const proofs = new Set();
  /** @type {Set<string>} */
  const views = new Set();
  /** @type {Set<string>} */
  const notes = new Set();
  /** @type {string[]} */
  const reviews = [];
  let unknown = false;

  if (skipped(p)) {
    return { path: p, areas: [], proofs: [], views: [], review: null, notes: ['skipped'], unknown: false };
  }

  if (GLOSSARY.test(p)) {
    return { path: p, areas: ['known'], proofs: [], views: [], review: null, notes: [], unknown: false };
  }

  const script = proofScriptOf(p);
  if (script) {
    if (NEVER_AUTOMATIC.includes(script)) notes.add(`${script} is never automatic (AGENTS.md)`);
    else proofs.add(script);
  }

  const rules = matchingRules(p);
  if (rules.length === 0 && !script) {
    unknown = true;
    reviews.push('unmapped path; do not skip proofs by omission — name the suite this file belongs to');
  }
  for (const rule of rules) {
    for (const id of rule.areas ?? []) areas.add(id);
    for (const proof of rule.proofs ?? []) proofs.add(proof);
    for (const view of rule.views ?? []) views.add(view);
    for (const note of rule.notes ?? []) notes.add(note);
    if (rule.review) reviews.push(rule.review);
  }

  for (const id of [...areas]) {
    const area = AREAS[id];
    if (!area) continue;
    for (const n of area.neighbors ?? []) areas.add(n);
  }
  for (const id of areas) {
    const area = AREAS[id];
    if (!area) continue;
    for (const proof of area.proofs) proofs.add(proof);
    for (const view of area.views) views.add(view);
  }

  for (const proof of [...proofs]) {
    if (NEVER_AUTOMATIC.includes(proof)) {
      proofs.delete(proof);
      notes.add(`${proof} is never automatic (AGENTS.md)`);
    }
  }

  return {
    path: p,
    areas: [...areas].sort(),
    proofs: [...proofs].sort(),
    views: [...views].sort(),
    review: reviews.length ? reviews.join('; ') : null,
    notes: [...notes],
    unknown,
  };
}

/**
 * @typedef {{
 *   paths: PathClass[],
 *   gate: string[],
 *   tests: string[],
 *   proofs: string[],
 *   views: string[],
 *   areas: string[],
 *   review: Array<{ path: string, reason: string }>,
 *   notes: string[],
 *   unknown: string[],
 * }} Plan
 */

/**
 * @param {string[]} files
 * @param {{ exists?: (p: string) => boolean }} [opts]
 * @returns {Plan}
 */
export function planFor(files, opts = {}) {
  const paths = files.map(classifyPath);
  /** @type {Set<string>} */
  const proofs = new Set();
  /** @type {Set<string>} */
  const views = new Set();
  /** @type {Set<string>} */
  const areas = new Set();
  /** @type {Set<string>} */
  const notes = new Set();
  /** @type {Array<{ path: string, reason: string }>} */
  const review = [];
  /** @type {string[]} */
  const unknown = [];

  for (const row of paths) {
    for (const p of row.proofs) proofs.add(p);
    for (const v of row.views) views.add(v);
    for (const a of row.areas) if (a !== 'known') areas.add(a);
    for (const n of row.notes) notes.add(n);
    if (row.review) review.push({ path: row.path, reason: row.review });
    if (row.unknown) unknown.push(row.path);
  }

  const gate = files.length === 0 ? [] : ['pnpm check'];

  return {
    paths,
    gate,
    tests: narrowTests(files, opts.exists),
    proofs: [...proofs].sort(),
    views: [...views].sort(),
    areas: [...areas].sort(),
    review,
    notes: [...notes].sort(),
    unknown,
  };
}

/**
 * @param {Plan} plan
 * @param {{ base?: string, count?: number }} [meta]
 */
export function formatPlan(plan, meta = {}) {
  const lines = [];
  const needsReview = plan.review.length > 0 || plan.unknown.length > 0;
  const count = meta.count ?? plan.paths.length;
  const against = meta.base ? ` against ${meta.base}` : '';
  lines.push(`Verification plan${needsReview ? '  REVIEW REQUIRED' : ''}`);
  lines.push(`  ${count} path${count === 1 ? '' : 's'}${against}`);
  if (count === 0) {
    lines.push('');
    lines.push('nothing to verify');
    return lines.join('\n');
  }

  lines.push('');
  lines.push('Gate');
  for (const g of plan.gate) {
    lines.push(`  ${g}`);
    lines.push('    symbols, typecheck, lint, tests — green before each commit');
  }

  if (plan.tests.length > 0) {
    lines.push('');
    lines.push('Narrow tests');
    for (const t of plan.tests) lines.push(`  pnpm vitest run ${t}`);
  }

  lines.push('');
  if (plan.proofs.length === 0) {
    lines.push('Proofs');
    lines.push('  (none — no affected proof suite)');
  } else {
    const titles = plan.areas.map((id) => AREAS[id]?.title ?? id);
    lines.push(titles.length > 0 ? `Proofs  (complete suites: ${titles.join(', ')})` : 'Proofs');
    lines.push('  pnpm build');
    lines.push('    proofs measure the built app');
    for (const p of plan.proofs) lines.push(`  pnpm ${p}`);
  }

  lines.push('');
  lines.push('Architecture');
  if (plan.views.length === 0) {
    lines.push('  (none named for these paths)');
  } else {
    for (const v of plan.views) {
      lines.push(`  ${v}`);
      lines.push('    consult before modifying; maintain after in the same commit');
    }
  }

  if (plan.review.length > 0) {
    lines.push('');
    lines.push('Review required');
    for (const r of plan.review) {
      lines.push(`  ${r.path}`);
      lines.push(`    ${r.reason}`);
    }
  }

  if (plan.notes.length > 0) {
    lines.push('');
    lines.push('Notes');
    for (const n of plan.notes) lines.push(`  ${n}`);
  }

  return lines.join('\n');
}

/**
 * @typedef {(args: string[]) => string} GitRun
 * @typedef {{
 *   help: boolean,
 *   json: boolean,
 *   strict: boolean,
 *   base: string | undefined,
 *   files: string[] | null,
 *   unknown: string[],
 * }} ParsedArgs
 */

/**
 * Flags after `--files` stay flags. Paths that start with `--` are not files.
 * @param {string[]} args
 * @returns {ParsedArgs}
 */
export function parseArgs(args) {
  let help = false;
  let json = false;
  let strict = false;
  /** @type {string | undefined} */
  let base;
  /** @type {string[] | null} */
  let files = null;
  /** @type {string[]} */
  const unknown = [];

  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--help' || a === '-h') { help = true; continue; }
    if (a === '--json') { json = true; continue; }
    if (a === '--strict') { strict = true; continue; }
    if (a.startsWith('--base=')) {
      base = a.slice('--base='.length);
      if (!base) unknown.push('--base (missing value)');
      continue;
    }
    if (a === '--base') {
      const next = args[i + 1];
      if (!next || next.startsWith('--')) {
        unknown.push('--base (missing value)');
        continue;
      }
      base = next;
      i += 1;
      continue;
    }
    if (a === '--files') {
      if (files === null) files = [];
      while (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        i += 1;
        files.push(normalizePath(args[i]));
      }
      continue;
    }
    unknown.push(a);
  }
  return { help, json, strict, base, files, unknown };
}

/**
 * `main` on a clone that only has `origin/main` is the usual miss. A simple
 * name that is not a local ref tries `origin/<name>` next; anything else is
 * used as given.
 * @param {string} requested
 * @param {GitRun} git
 */
export function resolveCompareRef(requested, git) {
  const tried = [requested];
  if (/^[A-Za-z0-9._-]+$/.test(requested)) tried.push(`origin/${requested}`);
  /** @type {string[]} */
  const missing = [];
  for (const ref of tried) {
    try {
      git(['rev-parse', '--verify', ref]);
      return ref;
    } catch {
      missing.push(ref);
    }
  }
  throw new Error(`verify-plan: no ref '${requested}' (tried ${missing.join(', ')})`);
}

/** @param {string} root */
function defaultGit(root) {
  /** @param {string[]} args */
  return (args) => {
    try {
      return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
    } catch (err) {
      const e = /** @type {Error & { stderr?: string }} */ (err);
      const detail = typeof e.stderr === 'string' && e.stderr.trim() ? e.stderr.trim() : e.message;
      throw new Error(`verify-plan: git ${args.join(' ')} failed: ${detail}`);
    }
  };
}

/**
 * Working tree, index and untracked against the merge-base of HEAD and `base`.
 * A git failure throws — it is never treated as an empty plan.
 * @param {string} root
 * @param {string} [requested]
 * @param {{ git?: GitRun }} [opts]
 */
export function collectGitPaths(root, requested = 'main', opts = {}) {
  const git = opts.git ?? defaultGit(root);
  const compare = resolveCompareRef(requested, git);
  const mergeBase = git(['merge-base', 'HEAD', compare]);
  if (!mergeBase) {
    throw new Error(`verify-plan: git merge-base HEAD ${compare} produced no commit`);
  }
  /** @type {Set<string>} */
  const names = new Set();
  for (const args of [
    ['diff', '--name-only', '--diff-filter=ACMRD', mergeBase],
    ['diff', '--name-only', '--diff-filter=ACMRD'],
    ['diff', '--name-only', '--cached', '--diff-filter=ACMRD'],
    ['ls-files', '--others', '--exclude-standard'],
  ]) {
    for (const line of git(args).split('\n')) {
      if (line) names.add(normalizePath(line));
    }
  }
  return { base: mergeBase, files: [...names].sort() };
}

/**
 * True when this module is the process entry. `resolve` so a relative
 * `process.argv[1]` matches `import.meta.url` on Windows.
 * @param {string | undefined} argv1
 * @param {string} [metaUrl]
 */
export function isMainModule(argv1, metaUrl = import.meta.url) {
  return argv1 !== undefined && metaUrl === pathToFileURL(resolve(argv1)).href;
}

if (isMainModule(process.argv[1])) {
  const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
  try {
    const parsed = parseArgs(process.argv.slice(2));
    if (parsed.help) {
      process.stdout.write(USAGE);
      process.exit(0);
    }
    if (parsed.unknown.length > 0) {
      process.stderr.write(`verify-plan: unknown argument ${parsed.unknown.join(' ')} (known: --base --files --json --strict)\n`);
      process.exit(2);
    }
    /** @type {string[]} */
    let files;
    /** @type {string | undefined} */
    let against;
    if (parsed.files !== null) {
      files = parsed.files;
      against = undefined;
    } else {
      const collected = collectGitPaths(root, parsed.base ?? 'main');
      files = collected.files;
      against = collected.base;
    }
    const plan = planFor(files, { exists: (p) => existsSync(join(root, p)) });
    if (parsed.json) {
      process.stdout.write(`${JSON.stringify({ base: against, ...plan }, null, 2)}\n`);
    } else {
      process.stdout.write(`${formatPlan(plan, { base: against, count: files.length })}\n`);
    }
    if (parsed.strict && (plan.review.length > 0 || plan.unknown.length > 0)) process.exit(2);
  } catch (err) {
    const e = /** @type {Error} */ (err);
    process.stderr.write(`${e.message}\n`);
    process.exit(2);
  }
}
