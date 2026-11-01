#!/usr/bin/env node
// @ts-check
// The requirement coverage report: for every live shipping requirement, the files of this repository that cite it —
// implementation, tests, and the built-app proofs and live-run scenarios — so that the specification's map onto the
// code can be read rather than guessed (whats-next item N90, 2026-10-13).
//
// `AGENTS.md` ("Traceability") asks that implementation work cite the requirement
// ids it satisfies; nothing measured whether it did. `pnpm symbols` writes the typed identifier artifact and the
// directive back-pointers only, and the product's own traceability engine (ADR-0040) serves a user's repository, not
// `docs/spec/`. This report is that measure, and it is **report-only**: it never fails, and an uncited requirement is
// not by that alone unbuilt — some built areas cite nothing. Separating the two is triage, which this report feeds
// (`--sections` groups the uncited by the specification's own headings: a section wholly uncited reads differently
// from one requirement missing in a cited section).
//
// What it counts.
//   - The denominator, "live shipping": every identifier in the generated artifact
//     (`packages/kernel/src/generated/requirements.ts`, written by `pnpm symbols` from `docs/spec/`) that is not
//     withdrawn in place, not in a retired domain (`REQ-TUI`, `REQ-CLI`: `docs/spec/README.md`, "Domains 17 and 18
//     are retired … excluded from the shipping total"), and not superseded by a product directive (`SUPERSEDED_BY`:
//     a superseded requirement no longer governs, and the code cites the directive instead). A requirement a
//     directive narrows or extends still governs and stays in.
//   - A citation: an identifier written in a tracked file under `packages/`, `apps/` or `tools/` (TypeScript,
//     JavaScript, JSON, YAML or CSS), with the forms the code uses expanded — `REQ-X-001..004`, `REQ-X-001 to 004`,
//     `REQ-X-001 through 004`, `REQ-X-001/002/003`, `REQ-X-001, 002 and 003`. A range wider than 60 is read as two
//     identifiers, not a range. The generated artifact is not read (it names every identifier), nor this directory
//     (its fixtures are made up).
//   - Each citing file is one of three kinds: `test` (a `.test.` or `.spec.` file), `proof` (under
//     `apps/desktop/scripts/`: the proof scripts, the live run and their helpers) or `implementation` (the rest).
//   - Beside each requirement, the directives that narrow or extend it and whether those are cited — a requirement
//     cited nowhere whose directive is cited may be built under the directive's name.
//
// Usage (`pnpm req-coverage [flags]`):
//   (none)            the summary: totals, then one line per domain
//   --uncited         every live requirement cited nowhere, with its specification file, line and section
//   --sections        the uncited, grouped by specification section, sections with the most uncited first
//   --domain=<D>      restrict the listings and the JSON to one domain (`CONFIG`, `NOTIFY`, …)
//   --json[=<path>]   the full per-requirement report as JSON (stdout, or the path given)
//   --since[=<ref>]   branch-relative (ReqToCode §3.6; R-092): the identifiers the files this branch touches cite now
//                     and did not at its merge-base with <ref> (default `origin/main`), and the ones they no longer
//                     cite; with --json, that report alone as JSON
//   --drift           drift (ReqToCode §4.7; R-092): every live requirement whose definition changed in a commit
//                     later than the last commit touching every implementation file that cites it — the code may
//                     predate the requirement's current text; with --json, that report alone as JSON
//
// Reads the tree and runs `git ls-files` (and, for --since and --drift, `git merge-base`, `diff`, `show`, `log` and
// `blame`); writes nothing unless `--json=<path>` names a file. The pure parts are exported for the test beside this
// file, and the git readers take the repository root, so the test runs them over a fixture repository.
import { execFile, execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { REDIRECTING } from '../build-id/build-id.mjs';

/** Domains whose identifiers are retired as a whole and excluded from the shipping total (`docs/spec/README.md`). */
export const RETIRED_DOMAINS = Object.freeze(['TUI', 'CLI']);

/** The widest `..` / `to` / `through` span read as a range; a wider one is two identifiers. */
export const MAX_RANGE = 60;

/** File types read for citations. */
const SOURCE = /\.(?:ts|tsx|mts|cts|mjs|cjs|js|jsx|json|ya?ml|css)$/;

/** Paths never read: the generated artifact names every identifier; this tool's own fixtures are made up. */
const SKIPPED = [/^packages\/kernel\/src\/generated\//, /^tools\/requirement-coverage\//, /(^|\/)node_modules\//];

/**
 * One citation run: an identifier, then any continuation of the forms the code uses. The continuation's numbers are
 * three digits not followed by a fourth, so `REQ-X-001, 2026-10-13` reads as one identifier; and a bare number followed by a
 * unit (`QUANTITY`, in any case) after a loose separator (a comma, `and`, `to`, `through`) is a quantity, not a
 * continuation, so `REQ-X-001, 200 ms` credits no REQ-X-200 and `REQ-X-001 to 100 notices` expands no range. A tight
 * separator (`..`, `–`, `/`) only ever joins identifiers, so `REQ-X-031..033 calls` is the range whatever follows it.
 */
const UNITS = ['ms', 's', 'sec', 'seconds?', 'minutes?', 'min', 'hours?', 'px', '(?:k|m|g)b', 'bytes?', 'characters?', 'chars',
  'lines?', 'tokens?', 'notices?', 'items?', 'calls?', 'files?', 'times', 'days?', 'rows?', 'entries', 'percent'];
/**
 * A unit in any case, each letter spelled as its own two-case class rather than scoped with `(?i:…)`: Node 24.11's V8
 * (13.6.233) loses a scoped `i` from alternatives that share a prefix, so `(?i:ms|min)` does not match `MS`.
 * @param {string} unit
 */
const anyCase = (unit) => unit.replace(/[a-z]/g, (c) => `[${c}${c.toUpperCase()}]`);
const QUANTITY = String.raw`(?!\s*(?:%|(?:${UNITS.map(anyCase).join('|')})\b))`;
const IDENTIFIER = String.raw`(?:REQ|PD)-[A-Z]+-\d{3}(?!\d)`;
const TIGHT = String.raw`(?:\.\.|–|\/)`;
const LOOSE = String.raw`(?:,\s*(?:and\s+)?|\s+(?:and|to|through)\s+)`;
const STEP_IN_RUN = String.raw`(?:\s*${TIGHT}\s*(?:${IDENTIFIER}|\d{3}(?!\d))|\s*${LOOSE}\s*(?:${IDENTIFIER}|\d{3}(?!\d)${QUANTITY}))`;
const RUN = new RegExp(String.raw`\b(REQ|PD)-([A-Z]+)-(\d{3})(?!\d)((?:${STEP_IN_RUN})*)`, 'g');
const STEP = new RegExp(String.raw`(\.\.|–|\/|,\s*(?:and\s+)?|\s(?:and|to|through)\s)\s*(?:(REQ|PD)-([A-Z]+)-)?(\d{3})(?!\d)`, 'g');

const pad = (/** @type {number} */ n) => String(n).padStart(3, '0');

/**
 * Every requirement and directive identifier a text cites, ranges expanded.
 * @param {string} text
 * @returns {Set<string>}
 */
export function citationsIn(text) {
  /** @type {Set<string>} */
  const out = new Set();
  for (const m of text.matchAll(RUN)) {
    let kind = m[1];
    let domain = m[2];
    let prev = Number(m[3]);
    out.add(`${kind}-${domain}-${m[3]}`);
    for (const s of (m[4] ?? '').matchAll(STEP)) {
      const sep = s[1].trim();
      const num = Number(s[4]);
      if (s[2] !== undefined) {
        // A full identifier in the run: a range only within one series.
        const same = s[2] === kind && s[3] === domain;
        if (same && isRange(sep) && num > prev && num - prev <= MAX_RANGE) {
          for (let n = prev + 1; n < num; n += 1) out.add(`${kind}-${domain}-${pad(n)}`);
        }
        kind = s[2];
        domain = s[3];
      } else if (isRange(sep) && num > prev && num - prev <= MAX_RANGE) {
        for (let n = prev + 1; n < num; n += 1) out.add(`${kind}-${domain}-${pad(n)}`);
      }
      out.add(`${kind}-${domain}-${s[4]}`);
      prev = num;
    }
  }
  return out;
}

/** @param {string} sep */
function isRange(sep) {
  return sep === '..' || sep === '–' || sep === 'to' || sep === 'through';
}

/**
 * What kind of evidence a citing file is.
 * @param {string} path repository-relative, forward slashes
 * @returns {'test' | 'proof' | 'implementation'}
 */
export function kindOf(path) {
  if (/\.(?:test|spec)\.[a-z]+$/.test(path)) return 'test';
  if (path.startsWith('apps/desktop/scripts/')) return 'proof';
  return 'implementation';
}

/**
 * The specification's section heading in force at each line of a spec file: the nearest heading above it that is not
 * itself a requirement's definition.
 * @param {string} text
 * @returns {(line: number) => string}
 */
export function sectionsOf(text) {
  /** @type {Array<[number, string]>} */
  const heads = [];
  text.split(/\r?\n/).forEach((line, i) => {
    const m = /^(#{2,4})\s+(?!REQ-)(.+?)\s*$/.exec(line);
    if (m) heads.push([i + 1, m[2]]);
  });
  return (line) => {
    let found = '';
    for (const [at, title] of heads) {
      if (at > line) break;
      found = title;
    }
    return found;
  };
}

/**
 * @typedef {{ id: string, domain: string, file: string, line: number, withdrawn: boolean }} Requirement
 * @typedef {{ id: string, supersedes: readonly string[], narrows: readonly string[], extends: readonly string[] }} Directive
 * @typedef {{ implementation: string[], test: string[], proof: string[] }} Cites
 * @typedef {{ id: string, relation: 'narrows' | 'extends', cited: boolean }} DirectiveLink
 * @typedef {{ id: string, domain: string, spec: string, line: number, section: string,
 *   cites: Cites, directives: DirectiveLink[], status: 'uncited' | 'implementation-only' | 'tested' }} Row
 */

/**
 * The report over a set of requirements, directives and citing files.
 * @param {{ requirements: Requirement[], directives: Directive[], files: Map<string, string>,
 *   sectionOf?: (spec: string, line: number) => string }} input
 *   `files` maps a repository-relative path to its text.
 */
export function buildReport({ requirements, directives, files, sectionOf = () => '' }) {
  /** @type {Set<string>} */
  const superseded = new Set(directives.flatMap((d) => d.supersedes));
  /** @type {Map<string, Cites>} */
  const cited = new Map();
  for (const [path, text] of files) {
    const kind = kindOf(path);
    for (const id of citationsIn(text)) {
      let entry = cited.get(id);
      if (!entry) {
        entry = { implementation: [], test: [], proof: [] };
        cited.set(id, entry);
      }
      entry[kind].push(path);
    }
  }
  /** @type {Map<string, DirectiveLink[]>} */
  const links = new Map();
  for (const d of directives) {
    const isCited = cited.has(d.id);
    for (const [relation, ids] of /** @type {const} */ ([['narrows', d.narrows], ['extends', d.extends]])) {
      for (const id of ids) {
        const list = links.get(id) ?? [];
        list.push({ id: d.id, relation, cited: isCited });
        links.set(id, list);
      }
    }
  }
  const excluded = { withdrawn: 0, retired: 0, superseded: 0 };
  /** @type {Row[]} */
  const rows = [];
  for (const r of requirements) {
    if (r.withdrawn) { excluded.withdrawn += 1; continue; }
    if (RETIRED_DOMAINS.includes(r.domain)) { excluded.retired += 1; continue; }
    if (superseded.has(r.id)) { excluded.superseded += 1; continue; }
    const c = cited.get(r.id) ?? { implementation: [], test: [], proof: [] };
    const cites = { implementation: [...c.implementation].sort(), test: [...c.test].sort(), proof: [...c.proof].sort() };
    const status = cites.test.length + cites.proof.length > 0 ? 'tested'
      : cites.implementation.length > 0 ? 'implementation-only' : 'uncited';
    rows.push({ id: r.id, domain: r.domain, spec: r.file, line: r.line, section: sectionOf(r.file, r.line), cites,
      directives: links.get(r.id) ?? [], status });
  }
  return { total: requirements.length, excluded, rows };
}

/**
 * Per-domain counts, worst first by requirements cited nowhere.
 * @param {Row[]} rows
 */
export function byDomain(rows) {
  /** @type {Map<string, { domain: string, live: number, uncited: number, implementationOnly: number, tested: number, proved: number, uncitedViaDirective: number }>} */
  const out = new Map();
  for (const r of rows) {
    const d = out.get(r.domain) ?? { domain: r.domain, live: 0, uncited: 0, implementationOnly: 0, tested: 0, proved: 0, uncitedViaDirective: 0 };
    d.live += 1;
    if (r.status === 'uncited') {
      d.uncited += 1;
      if (r.directives.some((l) => l.cited)) d.uncitedViaDirective += 1;
    }
    if (r.status === 'implementation-only') d.implementationOnly += 1;
    if (r.status === 'tested') d.tested += 1;
    if (r.cites.proof.length > 0) d.proved += 1;
    out.set(r.domain, d);
  }
  return [...out.values()].sort((a, b) => b.uncited - a.uncited || a.domain.localeCompare(b.domain));
}

/**
 * The uncited, grouped by specification section, the sections with the most uncited first.
 * @param {Row[]} rows
 */
export function uncitedBySection(rows) {
  /** @type {Map<string, { spec: string, section: string, live: number, uncited: string[] }>} */
  const out = new Map();
  for (const r of rows) {
    const key = `${r.spec}\u0000${r.section}`;
    const s = out.get(key) ?? { spec: r.spec, section: r.section, live: 0, uncited: [] };
    s.live += 1;
    if (r.status === 'uncited') s.uncited.push(r.id);
    out.set(key, s);
  }
  return [...out.values()].filter((s) => s.uncited.length > 0)
    .sort((a, b) => b.uncited.length - a.uncited.length || a.spec.localeCompare(b.spec) || a.section.localeCompare(b.section));
}

/**
 * Reads the repository: the generated artifact, the tracked files under `packages/`, `apps/` and `tools/`, the spec.
 * @param {string} root
 */
export async function readTree(root) {
  const artifact = join(root, 'packages', 'kernel', 'src', 'generated', 'requirements.ts');
  if (!existsSync(artifact)) throw new Error(`no ${artifact}: run \`pnpm symbols\` first`);
  const mod = await import(pathToFileURL(artifact).href);
  /** @type {Requirement[]} */
  const requirements = Object.values(mod.REQ);
  /** @type {Directive[]} */
  const directives = Object.values(mod.PD);
  const listed = execFileSync('git', ['-C', root, 'ls-files', '-z', 'packages', 'apps', 'tools'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\0').filter((p) => p && SOURCE.test(p) && !SKIPPED.some((s) => s.test(p)));
  /** @type {Map<string, string>} */
  const files = new Map();
  for (const p of listed) {
    const abs = join(root, p);
    if (existsSync(abs)) files.set(p, readFileSync(abs, 'utf8'));
  }
  /** @type {Map<string, (line: number) => string>} */
  const specs = new Map();
  const sectionOf = (/** @type {string} */ spec, /** @type {number} */ line) => {
    let fn = specs.get(spec);
    if (!fn) {
      fn = sectionsOf(readFileSync(join(root, 'docs', 'spec', spec), 'utf8'));
      specs.set(spec, fn);
    }
    return fn(line);
  };
  return { requirements, directives, files, sectionOf };
}

/** @param {Row[]} rows */
function totals(rows) {
  const uncited = rows.filter((r) => r.status === 'uncited');
  return {
    live: rows.length,
    uncited: uncited.length,
    uncitedViaDirective: uncited.filter((r) => r.directives.some((l) => l.cited)).length,
    implementationOnly: rows.filter((r) => r.status === 'implementation-only').length,
    tested: rows.filter((r) => r.status === 'tested').length,
    proved: rows.filter((r) => r.cites.proof.length > 0).length,
  };
}

/**
 * The summary text.
 * @param {ReturnType<typeof buildReport>} report
 */
export function summaryText(report) {
  const t = totals(report.rows);
  const lines = [
    `requirement coverage: ${report.total} identifiers; ${t.live} live shipping (excluded: ${report.excluded.withdrawn} withdrawn, ${report.excluded.retired} in retired domains, ${report.excluded.superseded} superseded by a directive)`,
    `  cited nowhere ${t.uncited} (of them ${t.uncitedViaDirective} named by a directive that is cited), implementation only ${t.implementationOnly}, cited by a test or a proof ${t.tested} (by a proof ${t.proved})`,
    '  report-only: an uncited requirement is not by that alone unbuilt; --uncited and --sections list them for triage',
    '',
    `  ${'domain'.padEnd(10)} ${'live'.padStart(5)} ${'nowhere'.padStart(8)} ${'impl-only'.padStart(10)} ${'tested'.padStart(7)} ${'proof'.padStart(6)}`,
  ];
  for (const d of byDomain(report.rows)) {
    lines.push(`  ${d.domain.padEnd(10)} ${String(d.live).padStart(5)} ${String(d.uncited).padStart(8)} ${String(d.implementationOnly).padStart(10)} ${String(d.tested).padStart(7)} ${String(d.proved).padStart(6)}`);
  }
  return lines.join('\n');
}

// ── Branch-relative citations (`--since`; ReqToCode §3.6, R-092) ─────────────────────────────────────────────────

/** @param {string} path repository-relative, forward slashes */
const inScope = (path) => /^(?:packages|apps|tools)\//.test(path) && SOURCE.test(path) && !SKIPPED.some((s) => s.test(path));

/**
 * What the touched files cite now and did not, and cited and no longer do — pure over their two texts.
 * @param {{ before: Map<string, string>, after: Map<string, string>, citedInTree?: Set<string> }} input
 *   `before` and `after` map each touched path to its text at the merge-base and now (`''` where it is absent);
 *   `citedInTree` is every identifier the whole tree cites now, so a drop still cited by an untouched file says so.
 */
export function branchCitations({ before, after, citedInTree = new Set() }) {
  /** @param {Map<string, string>} texts */
  const citing = (texts) => {
    /** @type {Map<string, Set<string>>} */
    const out = new Map();
    for (const [path, text] of texts) {
      for (const id of citationsIn(text)) out.set(id, (out.get(id) ?? new Set()).add(path));
    }
    return out;
  };
  const was = citing(before);
  const now = citing(after);
  const order = (/** @type {string} */ a, /** @type {string} */ b) => a.localeCompare(b);
  return {
    files: [...new Set([...before.keys(), ...after.keys()])].sort(order),
    cites: [...now.keys()].filter((id) => !was.has(id)).sort(order)
      .map((id) => ({ id, files: [...(now.get(id) ?? [])].sort(order) })),
    drops: [...was.keys()].filter((id) => !now.has(id)).sort(order)
      .map((id) => ({ id, files: [...(was.get(id) ?? [])].sort(order), citedElsewhere: citedInTree.has(id) })),
  };
}

/** @param {NodeJS.ProcessEnv} env */
function gitEnvironment(env) {
  const out = { ...env };
  for (const name of REDIRECTING) delete out[name];
  return out;
}
/** @param {string} root @param {string[]} args */
const git = (root, args) => execFileSync('git', ['-C', root, ...args], {
  encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, env: gitEnvironment(process.env), stdio: ['ignore', 'pipe', 'pipe'],
});
const gitAsync = promisify(execFile);
/** @param {string} root @param {string[]} args */
const gitLater = async (root, args) => (await gitAsync('git', ['-C', root, ...args], {
  encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, env: gitEnvironment(process.env),
})).stdout;
/** @param {string} text NUL-separated names */
const names = (text) => text.split('\0').filter(Boolean);

/**
 * The branch's touched files and their two texts: the working tree (committed and not) against the merge-base with
 * `ref`, plus the untracked files, within the scope the report reads.
 * @param {string} root
 * @param {string} [ref]
 */
export function readBranch(root, ref = 'origin/main') {
  const base = git(root, ['merge-base', ref, 'HEAD']).trim();
  const touched = [...new Set([
    ...names(git(root, ['diff', '--name-only', '--no-renames', '-z', base])),
    ...names(git(root, ['ls-files', '--others', '--exclude-standard', '-z'])),
  ])].filter(inScope).sort();
  /** @type {Map<string, string>} */
  const before = new Map();
  /** @type {Map<string, string>} */
  const after = new Map();
  for (const path of touched) {
    let was = '';
    try { was = git(root, ['show', `${base}:${path}`]); } catch { /* absent at the merge-base */ }
    before.set(path, was);
    const abs = join(root, path);
    after.set(path, existsSync(abs) ? readFileSync(abs, 'utf8') : '');
  }
  return { ref, base, before, after };
}

/**
 * The branch-relative report over the repository at `root`: what `pnpm verify:plan` names as the requirements a diff
 * cites (bundle H2 wires it there).
 * @param {string} root
 * @param {string} [ref]
 */
export function branchReport(root, ref = 'origin/main') {
  const { base, before, after } = readBranch(root, ref);
  /** @type {Set<string>} */
  const citedInTree = new Set();
  const listed = git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard', 'packages', 'apps', 'tools']);
  for (const p of names(listed)) {
    if (!inScope(p) || after.has(p)) continue;
    const abs = join(root, p);
    if (existsSync(abs)) for (const id of citationsIn(readFileSync(abs, 'utf8'))) citedInTree.add(id);
  }
  return { ref, base, ...branchCitations({ before, after, citedInTree }) };
}

/** @param {ReturnType<typeof branchReport>} r */
export function branchText(r) {
  const list = (/** @type {string[]} */ ids) => (ids.length > 0 ? ids.join(', ') : 'nothing');
  return [
    `since ${r.ref} (merge-base ${r.base.slice(0, 10)}): ${r.files.length} touched file${r.files.length === 1 ? '' : 's'} in scope`,
    `  this branch cites: ${list(r.cites.map((c) => c.id))}`,
    `  drops: ${list(r.drops.map((d) => `${d.id}${d.citedElsewhere ? '' : ' (now cited nowhere)'}`))}`,
  ].join('\n');
}

// ── Drift (`--drift`; ReqToCode §4.7, R-092) ─────────────────────────────────────────────────────────────────────

/**
 * The lines a requirement's definition spans: its definition line and the plain lines continuing it, up to a blank
 * line, a heading, a list item, a blockquote (the specification's notes and back-pointers) or the next definition.
 * @param {string[]} lines the file's lines
 * @param {number} line the definition line, 1-based
 * @returns {[number, number]} first and last line, 1-based, inclusive
 */
export function definitionSpan(lines, line) {
  let end = line;
  while (end < lines.length) {
    const next = lines[end] ?? '';
    if (next.trim() === '' || /^\s*>/.test(next) || /^#/.test(next) || /^- /.test(next) || /\*\*(?:REQ|PD)-[A-Z]+-\d{3}\*\*/.test(next)) break;
    end += 1;
  }
  return [line, end];
}

/**
 * `git blame --porcelain` read as one entry per final line: the commit that last wrote it, its committer time, and
 * the line's text.
 * @param {string} text
 * @returns {Array<{ commit: string, time: number, text: string }>} index 0 is line 1
 */
export function parseBlame(text) {
  /** @type {Map<string, number>} */
  const times = new Map();
  /** @type {Array<{ commit: string, time: number, text: string }>} */
  const out = [];
  let commit = '';
  let final = 0;
  for (const row of text.split('\n')) {
    const head = /^([0-9a-f]{40}) \d+ (\d+)(?: \d+)?$/.exec(row);
    if (head) { commit = head[1]; final = Number(head[2]); continue; }
    const time = /^committer-time (\d+)$/.exec(row);
    if (time) { times.set(commit, Number(time[1])); continue; }
    if (row.startsWith('\t')) out[final - 1] = { commit, time: 0, text: row.slice(1) };
  }
  for (const entry of out) if (entry) entry.time = times.get(entry.commit) ?? 0;
  return out;
}

/** A line's text with its link targets dropped: a verbatim move into a deeper folder rewrites `](../x)` alone. */
const movedText = (/** @type {string} */ text) => text.replace(/\]\([^)]*\)/g, ']()').trimEnd();

/**
 * The lines a commit removed, from `git show -U0 --no-renames <commit>`: a line it removed and also added is a line it
 * moved, and its history is the history it had where it was removed from.
 * @param {string} text
 * @returns {Map<string, { file: string, line: number }>} the moved text (`movedText`) → where it stood before
 */
export function parseRemoved(text) {
  /** @type {Map<string, { file: string, line: number }>} */
  const removed = new Map();
  let file = '';
  let old = 0;
  for (const row of text.split('\n')) {
    if (row.startsWith('--- ')) { file = row === '--- /dev/null' ? '' : row.slice(6); continue; }
    if (row.startsWith('+++ ')) continue;
    const hunk = /^@@ -(\d+)(?:,(\d+))? \+/.exec(row);
    if (hunk) { old = Number(hunk[1]); if (hunk[2] === '0') old += 1; continue; }
    if (row.startsWith('-') && file) {
      const key = movedText(row.slice(1));
      if (!removed.has(key)) removed.set(key, { file, line: old });
      old += 1;
    }
  }
  return removed;
}

/**
 * `git log --format=@@%H %ct --name-only` read as each path's latest commit (the log is newest first).
 * @param {string} text
 * @returns {Map<string, { commit: string, time: number }>}
 */
export function parseLastTouch(text) {
  /** @type {Map<string, { commit: string, time: number }>} */
  const out = new Map();
  let current = { commit: '', time: 0 };
  for (const row of text.split('\n')) {
    const head = /^@@([0-9a-f]{40}) (\d+)$/.exec(row);
    if (head) { current = { commit: head[1], time: Number(head[2]) }; continue; }
    if (row && !out.has(row)) out.set(row, current);
  }
  return out;
}

/**
 * The drifted requirements — pure over when each definition last changed and when each citing file was last touched.
 * A requirement drifts when its definition changed strictly later than every implementation file citing it; one with
 * no implementation citation is the coverage report's uncited, not drift.
 * @param {{ rows: Row[], definitions: Map<string, { commit: string, time: number }>, touched: Map<string, { commit: string, time: number }> }} input
 */
export function driftReport({ rows, definitions, touched }) {
  const day = (/** @type {number} */ t) => new Date(t * 1000).toISOString().slice(0, 10);
  const cited = rows.filter((r) => r.cites.implementation.length > 0);
  const drifted = [];
  for (const r of cited) {
    const def = definitions.get(r.id);
    if (!def) continue;
    /** @type {{ file: string, commit: string, time: number } | null} */
    let latest = null;
    for (const file of r.cites.implementation) {
      const t = touched.get(file);
      // A file no commit holds (untracked) is newer than any definition.
      if (!t) { latest = null; break; }
      if (!latest || t.time > latest.time) latest = { file, ...t };
    }
    if (!latest || def.time <= latest.time) continue;
    drifted.push({
      id: r.id, spec: `docs/spec/${r.spec}:${r.line}`,
      definition: { commit: def.commit, date: day(def.time) },
      latest: { file: latest.file, commit: latest.commit, date: day(latest.time) },
    });
  }
  drifted.sort((a, b) => b.definition.date.localeCompare(a.definition.date) || a.id.localeCompare(b.id));
  return { citedByImplementation: cited.length, drifted };
}

/**
 * When each requirement's definition last changed, read from the repository at `root` as of HEAD: `git blame` of each
 * specification file, and through every commit that only moved a line (the 2026-10-26 split of each domain into its
 * parts moved every definition), the blame of the file it moved from, at that commit's parent.
 * @param {string} root
 * @param {Array<{ id: string, spec: string, line: number }>} requirements `spec` relative to `docs/spec/`
 * @param {{ concurrency?: number }} [options]
 */
export async function readDefinitionChanges(root, requirements, { concurrency = 8 } = {}) {
  /** @type {Map<string, Promise<Array<{ commit: string, time: number, text: string }>>>} */
  const blames = new Map();
  /** @param {string} rev @param {string} file */
  const blame = (rev, file) => {
    const key = `${rev}:${file}`;
    let p = blames.get(key);
    if (!p) { p = gitLater(root, ['blame', '--porcelain', rev, '--', file]).then(parseBlame, () => []); blames.set(key, p); }
    return p;
  };
  /** @type {Map<string, Promise<Map<string, { file: string, line: number }>>>} */
  const moves = new Map();
  /** @param {string} commit */
  const removedBy = (commit) => {
    let p = moves.get(commit);
    if (!p) { p = gitLater(root, ['show', '--format=', '-U0', '--no-renames', commit, '--', 'docs/spec']).then(parseRemoved, () => new Map()); moves.set(commit, p); }
    return p;
  };
  /** @param {{ commit: string, time: number, text: string }} entry */
  const origin = async (entry) => {
    let at = entry;
    for (let depth = 0; depth < 8; depth += 1) {
      const from = (await removedBy(at.commit)).get(movedText(at.text));
      if (!from) return at;
      const before = (await blame(`${at.commit}^`, from.file))[from.line - 1];
      if (!before) return at;
      at = before;
    }
    return at;
  };
  /** @type {Map<string, { commit: string, time: number }>} */
  const out = new Map();
  const files = [...new Set(requirements.map((r) => r.spec))];
  let next = 0;
  const worker = async () => {
    while (next < files.length) {
      const spec = files[next++];
      const lines = await blame('HEAD', `docs/spec/${spec}`);
      const texts = lines.map((l) => l?.text ?? '');
      for (const r of requirements.filter((x) => x.spec === spec)) {
        const [start, end] = definitionSpan(texts, r.line);
        let last = null;
        for (let n = start; n <= end; n += 1) {
          const entry = lines[n - 1];
          if (!entry) continue;
          const o = await origin(entry);
          if (!last || o.time > last.time) last = { commit: o.commit, time: o.time };
        }
        if (last) out.set(r.id, last);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, worker));
  return out;
}

/**
 * The drift report over the repository at `root`.
 * @param {string} root
 * @param {ReturnType<typeof buildReport>} report
 */
export async function readDrift(root, report) {
  const cited = report.rows.filter((r) => r.cites.implementation.length > 0);
  const definitions = await readDefinitionChanges(root, cited.map((r) => ({ id: r.id, spec: r.spec, line: r.line })));
  const touched = parseLastTouch(git(root, ['log', '--format=@@%H %ct', '--name-only', 'HEAD', '--', 'packages', 'apps', 'tools']));
  return driftReport({ rows: report.rows, definitions, touched });
}

/** @param {ReturnType<typeof driftReport>} d */
export function driftText(d) {
  const lines = [
    `drift: ${d.drifted.length} of ${d.citedByImplementation} live requirements cited by implementation changed their definition after every implementation file citing them was last touched (report-only; the code may predate the requirement's current text)`,
  ];
  for (const x of d.drifted) {
    lines.push(`  ${x.id}  defined ${x.definition.date} (${x.definition.commit.slice(0, 10)})  ${x.spec}  latest citing ${x.latest.date} (${x.latest.commit.slice(0, 10)}) ${x.latest.file}`);
  }
  return lines.join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
  const args = process.argv.slice(2);
  const flag = (/** @type {string} */ name) => args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  const value = (/** @type {string} */ name) => flag(name)?.split('=').slice(1).join('=') || undefined;
  const known = ['uncited', 'sections', 'domain', 'json', 'since', 'drift'];
  const unknown = args.filter((a) => !known.some((k) => a === `--${k}` || a.startsWith(`--${k}=`)));
  if (unknown.length > 0) {
    process.stderr.write(`req-coverage: unknown argument ${unknown.join(' ')} (known: ${known.map((k) => `--${k}`).join(' ')})\n`);
    process.exit(2);
  }
  const domain = value('domain');
  // `--since` and `--drift` are their own reports: each prints alone, and with --json the JSON holds only them.
  if (flag('since') || flag('drift')) {
    /** @type {{ since?: ReturnType<typeof branchReport>, drift?: ReturnType<typeof driftReport> }} */
    const out = {};
    if (flag('since')) out.since = branchReport(root, value('since') ?? 'origin/main');
    if (flag('drift')) {
      const d = await readDrift(root, buildReport(await readTree(root)));
      out.drift = domain ? { ...d, drifted: d.drifted.filter((x) => x.id.startsWith(`REQ-${domain}-`)) } : d;
    }
    if (flag('json')) {
      const text = `${JSON.stringify(out.since && out.drift ? out : out.since ?? out.drift, null, 2)}\n`;
      const path = value('json');
      if (path) writeFileSync(resolve(path), text);
      else process.stdout.write(text);
    } else {
      process.stdout.write(`${[out.since && branchText(out.since), out.drift && driftText(out.drift)].filter(Boolean).join('\n\n')}\n`);
    }
    process.exit(0);
  }
  const report = buildReport(await readTree(root));
  const rows = domain ? report.rows.filter((r) => r.domain === domain) : report.rows;
  if (flag('json')) {
    const text = `${JSON.stringify({ ...report, rows, domains: byDomain(report.rows) }, null, 2)}\n`;
    const out = value('json');
    if (out) writeFileSync(resolve(out), text);
    else process.stdout.write(text);
    if (!out) process.exit(0);
  }
  process.stdout.write(`${summaryText(report)}\n`);
  if (flag('uncited')) {
    process.stdout.write('\ncited nowhere:\n');
    for (const r of rows.filter((x) => x.status === 'uncited')) {
      const via = r.directives.filter((l) => l.cited).map((l) => `${l.relation} by ${l.id}, cited`);
      process.stdout.write(`  ${r.id}  docs/spec/${r.spec}:${r.line}  ${r.section}${via.length ? `  (${via.join('; ')})` : ''}\n`);
    }
  }
  if (flag('sections')) {
    process.stdout.write('\nuncited by specification section (uncited/live):\n');
    for (const s of uncitedBySection(rows)) {
      process.stdout.write(`  ${s.uncited.length}/${s.live}  ${s.spec} § ${s.section || '(before the first section)'}: ${s.uncited.map((id) => id.split('-').at(-1)).join(' ')}\n`);
    }
  }
}
