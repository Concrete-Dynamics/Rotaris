// @ts-check
// The requirement-symbol artifact (ADR-0040 #4, ADR-0056): a TypeScript module
// generated from docs/spec so that a requirement identifier cited in code is a
// typed reference, and a withdrawn one warns at every reference (REQ-TRACE-181,
// at editor level through JSDoc @deprecated).
//
// It also generates the product-directive symbols from docs/product/directives.md.
// A directive governs over every requirement it names (docs/product/README.md), so
// the artifact carries the disposition both ways: PD.supersedes / narrows / extends
// list what each directive reaches, and SUPERSEDED_BY / NARROWED_BY / EXTENDED_BY
// answer the question a reader of code actually has — "is the requirement I am about
// to cite still the thing that governs?" A superseded requirement is marked
// @deprecated for the same reason a withdrawn one is: prose nobody parses is prose
// that drifts.
//
// Shared by the build and by vitest's globalSetup, so the two cannot drift.

import { readdirSync, readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const specDir = join(repo, 'docs', 'spec');
const directivesFile = join(repo, 'docs', 'product', 'directives.md');
const outDir = join(repo, 'packages', 'kernel', 'src', 'generated');
const outFile = join(outDir, 'requirements.ts');

// Two definition shapes the corpus uses, and only these — matching the
// registrar's mechanical count of 4,397 identifiers.
const BULLET = /^-\s+\*\*(REQ-[A-Z]+-\d+)\*\*(.*)$/;
const HEADING = /^\*\*(REQ-[A-Z]+-\d+)\*\*\s*[—:](.*)$/;
const SECTION = /^#{2,5}\s+(REQ-[A-Z]+-\d+)(.*)$/;
const WITHDRAWN = /\*Withdrawn\.?\*/i;

/** @type {Map<string, {domain: string, file: string, line: number, withdrawn: boolean}>} */
const ids = new Map();
for (const file of readdirSync(specDir).filter((f) => /^\d\d-.*\.md$/.test(f)).sort()) {
  // A checkout under core.autocrlf=true (a git worktree on Windows) carries CRLF; `.` never matches `\r`, so a
  // split on `\n` alone left every definition unmatched and wrote an EMPTY artifact without a word (Part N found it).
  const lines = readFileSync(join(specDir, file), 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    const m = BULLET.exec(line) ?? HEADING.exec(line) ?? SECTION.exec(line);
    if (!m) return;
    const id = m[1];
    if (ids.has(id)) return; // first definition wins; duplicates are the registrar's problem
    const domain = id.split('-')[1];
    ids.set(id, { domain, file, line: i + 1, withdrawn: WITHDRAWN.test(m[2] ?? '') });
  });
}

const sorted = [...ids.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
const withdrawn = sorted.filter(([, v]) => v.withdrawn).length;
// An empty artifact is never right: the corpus defines thousands of identifiers, and code cites them by name.
if (sorted.length === 0) throw new Error(`symbol artifact: no requirement identifier was found under ${specDir}; the artifact was not written`);

// --- product directives -------------------------------------------------------
// The same three definition shapes, one prefix along. Unlike the corpus, zero is a
// legitimate answer: the register starts empty and stays that way until the owner
// decides something.
const PD_BULLET = /^-\s+\*\*(PD-[A-Z]+-\d+)\*\*(.*)$/;
const PD_HEADING = /^\*\*(PD-[A-Z]+-\d+)\*\*\s*[—:](.*)$/;
const PD_SECTION = /^#{2,5}\s+(PD-[A-Z]+-\d+)(.*)$/;
const DISPOSITION = /^>?\s*\*\*(Supersedes|Narrows|Extends|New):\*\*\s*(.*)$/;
const RETIRED = /^PD-(TUI|CLI)-/; // domains 17 and 18 are closed here as they are in the corpus

/** @type {Map<string, {domain: string, line: number, withdrawn: boolean, stated: boolean, supersedes: string[], narrows: string[], extends: string[]}>} */
const directives = new Map();
if (existsSync(directivesFile)) {
  const lines = readFileSync(directivesFile, 'utf8').split(/\r?\n/);
  /** @type {string | null} */
  let current = null;
  // The register carries its own entry template inside an HTML comment. Parsing it would
  // mint a directive nobody wrote, against identifiers chosen to read well in an example.
  let inComment = false;
  lines.forEach((line, i) => {
    if (inComment) {
      if (line.includes('-->')) inComment = false;
      return;
    }
    if (line.includes('<!--') && !line.includes('-->')) {
      inComment = true;
      return;
    }
    const m = PD_BULLET.exec(line) ?? PD_HEADING.exec(line) ?? PD_SECTION.exec(line);
    if (m) {
      const id = m[1];
      if (RETIRED.test(id)) {
        throw new Error(`symbol artifact: ${id} (docs/product/directives.md:${i + 1}) is in a retired domain; PD-TUI and PD-CLI are closed`);
      }
      if (directives.has(id)) {
        throw new Error(`symbol artifact: ${id} is defined twice in docs/product/directives.md (line ${i + 1}); identifiers are never reused`);
      }
      current = id;
      directives.set(id, {
        domain: id.split('-')[1],
        line: i + 1,
        withdrawn: WITHDRAWN.test(m[2] ?? ''),
        // Whether the directive stated a disposition at all, which "New" does while naming
        // nothing. Counting the identifiers alone would refuse every directive that displaces
        // nothing — the first execution of this generator did exactly that.
        stated: false,
        supersedes: [],
        narrows: [],
        extends: [],
      });
      return;
    }
    const d = DISPOSITION.exec(line);
    if (!d) return;
    if (!current) {
      throw new Error(`symbol artifact: a "${d[1]}" disposition at docs/product/directives.md:${i + 1} precedes any directive`);
    }
    const entry = directives.get(current);
    if (!entry) return;
    entry.stated = true;
    if (d[1] === 'New') return; // names no identifier, by definition
    const named = (d[2] ?? '').match(/REQ-[A-Z]+-\d+/g) ?? [];
    if (named.length === 0) {
      throw new Error(`symbol artifact: ${current}'s "${d[1]}" disposition (docs/product/directives.md:${i + 1}) names no requirement identifier`);
    }
    const key = d[1] === 'Supersedes' ? 'supersedes' : d[1] === 'Narrows' ? 'narrows' : 'extends';
    entry[key].push(...named);
  });
}

// Every disposition is checked against the corpus. A typo here would otherwise produce a
// directive that reaches nothing and a requirement that still silently governs — the exact
// failure the back-pointer discipline exists to prevent, and the one a reader cannot see.
/** @type {Map<string, string>} */
const supersededBy = new Map();
/** @type {Map<string, string>} */
const narrowedBy = new Map();
/** @type {Map<string, string>} */
const extendedBy = new Map();
for (const [id, v] of directives) {
  const where = `docs/product/directives.md:${v.line}`;
  if (!v.stated && !v.withdrawn) {
    throw new Error(`symbol artifact: ${id} (${where}) states no disposition; every directive names what it supersedes, narrows or extends, or declares itself New`);
  }
  for (const [verb, list, into] of /** @type {const} */ ([
    ['supersedes', v.supersedes, supersededBy],
    ['narrows', v.narrows, narrowedBy],
    ['extends', v.extends, extendedBy],
  ])) {
    for (const req of list) {
      const target = ids.get(req);
      if (!target) throw new Error(`symbol artifact: ${id} ${verb} ${req} (${where}), which docs/spec does not define`);
      if (target.withdrawn) throw new Error(`symbol artifact: ${id} ${verb} ${req} (${where}), which is withdrawn in place and carries no behaviour`);
      const held = into.get(req);
      if (held && held !== id) throw new Error(`symbol artifact: ${req} is ${verb} by both ${held} and ${id} (${where}); precedence must be unambiguous`);
      into.set(req, id);
    }
  }
}
for (const req of supersededBy.keys()) {
  // A requirement cannot both stop governing and keep governing in the narrowed case.
  if (narrowedBy.has(req)) throw new Error(`symbol artifact: ${req} is both superseded by ${supersededBy.get(req)} and narrowed by ${narrowedBy.get(req)}`);
}

const directivesSorted = [...directives.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
const directivesWithdrawn = directivesSorted.filter(([, v]) => v.withdrawn).length;

/** @param {Map<string, string>} m */
const emitMap = (m) =>
  [...m.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([req, pd]) => `  '${req}': '${pd}',\n`)
    .join('');

let src = `// GENERATED by tools/symbol-artifact/generate.mjs from docs/spec and docs/product — do not edit.
// ${sorted.length} requirement identifiers, ${withdrawn} withdrawn in place.
// ${directivesSorted.length} product directives, ${directivesWithdrawn} withdrawn in place.

export type RequirementId = keyof typeof REQ;

export interface RequirementSymbol {
  readonly id: string;
  readonly domain: string;
  readonly file: string;
  readonly line: number;
  readonly withdrawn: boolean;
}

export const REQ = {
`;
for (const [id, v] of sorted) {
  const pd = supersededBy.get(id);
  if (v.withdrawn) src += `  /** @deprecated Withdrawn in place — REQ-TRACE-181. */\n`;
  else if (pd) src += `  /** @deprecated Superseded by ${pd} — docs/product/directives.md. Cite the directive, not this. */\n`;
  else if (narrowedBy.has(id)) src += `  /** Narrowed by ${narrowedBy.get(id)} — docs/product/directives.md. It governs in the case it names. */\n`;
  else if (extendedBy.has(id)) src += `  /** Extended by ${extendedBy.get(id)} — docs/product/directives.md. This still governs in full. */\n`;
  src += `  '${id}': { id: '${id}', domain: '${v.domain}', file: '${v.file}', line: ${v.line}, withdrawn: ${v.withdrawn} },\n`;
}
src += `} as const satisfies Record<string, RequirementSymbol>;

export const REQUIREMENT_COUNT = ${sorted.length};
export const WITHDRAWN_COUNT = ${withdrawn};

/**
 * Product directives (docs/product/README.md). A directive governs over every requirement it
 * names, per identifier and never wholesale.
 */
export type DirectiveId = keyof typeof PD;

export interface DirectiveSymbol {
  readonly id: string;
  readonly domain: string;
  readonly file: string;
  readonly line: number;
  readonly withdrawn: boolean;
  /** Requirements this directive replaces. They no longer govern. */
  readonly supersedes: readonly string[];
  /** Requirements that still govern, except in the case this directive names. */
  readonly narrows: readonly string[];
  /** Requirements that still govern in full; this directive adds behaviour beside them. */
  readonly extends: readonly string[];
}

export const PD = {
`;
for (const [id, v] of directivesSorted) {
  if (v.withdrawn) src += `  /** @deprecated Withdrawn in place. */\n`;
  const lists = `supersedes: [${v.supersedes.map((r) => `'${r}'`).join(', ')}], narrows: [${v.narrows.map((r) => `'${r}'`).join(', ')}], extends: [${v.extends.map((r) => `'${r}'`).join(', ')}]`;
  src += `  '${id}': { id: '${id}', domain: '${v.domain}', file: 'directives.md', line: ${v.line}, withdrawn: ${v.withdrawn}, ${lists} },\n`;
}
src += `} as const satisfies Record<string, DirectiveSymbol>;

export const DIRECTIVE_COUNT = ${directivesSorted.length};

/** Requirement → the directive that replaced it. Citing the key in code is a defect. */
export const SUPERSEDED_BY = {
${emitMap(supersededBy)}} as const satisfies Partial<Record<RequirementId, DirectiveId>>;

/** Requirement → the directive that carved a case out of it. Both govern; read the directive first. */
export const NARROWED_BY = {
${emitMap(narrowedBy)}} as const satisfies Partial<Record<RequirementId, DirectiveId>>;

/** Requirement → the directive that added behaviour beside it. The requirement is untouched. */
export const EXTENDED_BY = {
${emitMap(extendedBy)}} as const satisfies Partial<Record<RequirementId, DirectiveId>>;
`;

mkdirSync(outDir, { recursive: true });
const unchanged = existsSync(outFile) && readFileSync(outFile, 'utf8') === src;
if (!unchanged) writeFileSync(outFile, src);
if (!process.env.SYMBOLS_QUIET) {
  console.log(
    `symbol artifact: ${sorted.length} identifiers (${withdrawn} withdrawn), ${directivesSorted.length} directives (${supersededBy.size} superseded, ${narrowedBy.size} narrowed, ${extendedBy.size} extended) → ${outFile}${unchanged ? ' (unchanged)' : ''}`,
  );
}
