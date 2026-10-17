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
//   --base=<ref>        compare against this ref (default: main)
//   --files <path>…     classify these paths; do not read git
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
  --base=<ref>        compare against this ref (default: main)
  --files <path>…     classify these paths; do not read git
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
 * @param {string} root
 * @param {string} base
 */
export function collectGitPaths(root, base) {
  /** @param {string[]} args */
  const git = (args) => {
    try {
      return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
    } catch {
      return '';
    }
  };
  let mergeBase = base;
  const mb = git(['merge-base', 'HEAD', base]);
  if (mb) mergeBase = mb;
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(USAGE);
    process.exit(0);
  }
  const json = args.includes('--json');
  const strict = args.includes('--strict');
  const filesAt = args.indexOf('--files');
  /** @type {string | undefined} */
  let base;
  for (const a of args) {
    if (a.startsWith('--base=')) base = a.slice('--base='.length);
  }
  const baseIdx = args.indexOf('--base');
  if (baseIdx >= 0 && args[baseIdx + 1] && !args[baseIdx + 1].startsWith('--')) base = args[baseIdx + 1];

  const known = new Set(['--json', '--strict', '--help', '-h', '--files', '--base']);
  const unknownArgs = args.filter((a, i) => {
    if (known.has(a) || a.startsWith('--base=')) return false;
    if (filesAt >= 0 && i > filesAt) return false;
    if (baseIdx >= 0 && i === baseIdx + 1) return false;
    return true;
  });
  if (unknownArgs.length > 0) {
    process.stderr.write(`verify-plan: unknown argument ${unknownArgs.join(' ')} (known: --base --files --json --strict)\n`);
    process.exit(2);
  }

  /** @type {string[]} */
  let files;
  /** @type {string | undefined} */
  let against;
  if (filesAt >= 0) {
    files = args.slice(filesAt + 1).map(normalizePath);
    against = undefined;
  } else {
    const collected = collectGitPaths(root, base ?? 'main');
    files = collected.files;
    against = collected.base;
  }

  const plan = planFor(files, { exists: (p) => existsSync(join(root, p)) });
  if (json) {
    process.stdout.write(`${JSON.stringify({ base: against, ...plan }, null, 2)}\n`);
  } else {
    process.stdout.write(`${formatPlan(plan, { base: against, count: files.length })}\n`);
  }
  if (strict && (plan.review.length > 0 || plan.unknown.length > 0)) process.exit(2);
}
