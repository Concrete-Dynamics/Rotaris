#!/usr/bin/env node
// @ts-check
// The requirement coverage report: for every live shipping requirement, the files of this repository that cite it —
// implementation, tests, and the built-app proofs and live-run scenarios — so that the specification's map onto the
// code can be read rather than guessed (whats-next item N90, 2026-10-13).
//
// `CLAUDE.md` ("Traceability") and `docs/clean-room/provenance.md` ask that implementation work cite the requirement
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
//
// Reads the tree and runs `git ls-files`; writes nothing unless `--json=<path>` names a file. The pure parts are
// exported for the test beside this file.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
 * unit (`QUANTITY`) is a quantity, not a continuation, so `REQ-X-001, 200 ms` credits no REQ-X-200 and
 * `REQ-X-001 to 100 notices` expands no range.
 */
const QUANTITY = String.raw`(?!\s*(?:%|(?:ms|s|sec|seconds?|minutes?|min|hours?|px|[kKMG]B|bytes?|characters?|chars|lines?|tokens?|notices?|items?|calls?|files?|times|days?|rows?|entries|percent)\b))`;
const CONTINUATION = String.raw`(?:(?:REQ|PD)-[A-Z]+-\d{3}(?!\d)|\d{3}(?!\d)${QUANTITY})`;
const SEPARATOR = String.raw`(?:\.\.|–|\/|,\s*(?:and\s+)?|\s+(?:and|to|through)\s+)`;
const RUN = new RegExp(String.raw`\b(REQ|PD)-([A-Z]+)-(\d{3})(?!\d)((?:\s*${SEPARATOR}\s*${CONTINUATION})*)`, 'g');
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
  const args = process.argv.slice(2);
  const flag = (/** @type {string} */ name) => args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  const value = (/** @type {string} */ name) => flag(name)?.split('=').slice(1).join('=') || undefined;
  const known = ['uncited', 'sections', 'domain', 'json'];
  const unknown = args.filter((a) => !known.some((k) => a === `--${k}` || a.startsWith(`--${k}=`)));
  if (unknown.length > 0) {
    process.stderr.write(`req-coverage: unknown argument ${unknown.join(' ')} (known: ${known.map((k) => `--${k}`).join(' ')})\n`);
    process.exit(2);
  }
  const report = buildReport(await readTree(root));
  const domain = value('domain');
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
