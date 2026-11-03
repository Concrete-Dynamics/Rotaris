#!/usr/bin/env node
// `docs/research/` holds research-derived guidance: `optimization/` (2026-09-21) and `design/` (2026-11-01, the
// design-system overhaul). A guide there is only worth its sources and its date — a claim with no reference is an
// opinion, and a guide whose review date nobody moves is one nobody re-read. For the design corpus two more sections
// carry the load: "How this applies here" is where a derivative reads, and "Where this disagrees with the adopted
// material" is where an open question comes from (`docs/research/design/README.md`, "Shared document structure").
// None of that is something the doc budget or the link check sees.
//
// This gate reads every `NN-*.md` under `docs/research/<corpus>/` and each corpus's `REFERENCES.md`, and fails on a
// guide with no review-date line or a required section heading missing. It prints the oldest review date and never
// fails on age: a calendar-driven red would turn the gate red on a quiet day with nobody to fix it, and the gate is
// never retried.
//
// Runs as part of `pnpm lint`. Reads the tree; costs no subprocess. The pure part is exported for the test beside it.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** A review-date line, as the optimization guides write it ("Reference review date") and the design guides ("Review date"). */
export const REVIEW_DATE = /^\*\*(?:Reference )?[Rr]eview date:\*\*\s*(\d{4}-\d{2}-\d{2})/m;
/** A guide: two digits, a dash, a slug. */
export const GUIDE_NAME = /^\d{2}-[^/\\]+\.md$/;
/** Headings every guide must carry. */
export const REQUIRED_HEADINGS = ['References and further reading'];
/** Headings the design corpus must carry besides. */
export const DESIGN_HEADINGS = ['How this applies here', 'Where this disagrees with the adopted material'];

/**
 * The `##`/`###` headings of a Markdown text, their numbering stripped ("## 9. References and further reading" → "References and further reading").
 * @param {string} text
 */
export function headings(text) {
  return [...text.matchAll(/^#{2,3}\s+(?:\d+(?:\.\d+)*\.?\s+)?(.+?)\s*$/gm)].map((m) => (m[1] ?? '').trim());
}

/**
 * The problems of one file.
 * @param {string} path repository-relative, forward slashes
 * @param {string} text
 * @param {{ guide: boolean, design: boolean }} kind `guide`: a numbered guide (sections required); `design`: under `docs/research/design/`
 * @returns {{ problems: string[], reviewDate: string | null }}
 */
export function inspect(path, text, kind) {
  /** @type {string[]} */
  const problems = [];
  const date = REVIEW_DATE.exec(text);
  if (!date) problems.push(`${path}: no review-date line (\`**Review date:** YYYY-MM-DD\`)`);
  if (kind.guide) {
    const present = new Set(headings(text));
    const required = kind.design ? [...REQUIRED_HEADINGS, ...DESIGN_HEADINGS] : REQUIRED_HEADINGS;
    for (const heading of required) if (!present.has(heading)) problems.push(`${path}: no "${heading}" section`);
  }
  return { problems, reviewDate: date?.[1] ?? null };
}

/**
 * Every file this gate reads: `docs/research/<corpus>/NN-*.md` and `docs/research/<corpus>/REFERENCES.md`.
 * @param {string} root
 * @returns {{ path: string, kind: { guide: boolean, design: boolean } }[]}
 */
export function guideFiles(root) {
  const research = join(root, 'docs', 'research');
  if (!existsSync(research)) return [];
  /** @type {{ path: string, kind: { guide: boolean, design: boolean } }[]} */
  const files = [];
  for (const corpus of readdirSync(research).sort()) {
    const dir = join(research, corpus);
    if (!statSync(dir).isDirectory()) continue;
    for (const name of readdirSync(dir).sort()) {
      const guide = GUIDE_NAME.test(name);
      if (!guide && name !== 'REFERENCES.md') continue;
      files.push({ path: relative(root, join(dir, name)).split(sep).join('/'), kind: { guide, design: corpus === 'design' } });
    }
  }
  return files;
}

/**
 * Whole days between a review date and now, never below zero; `null` when the date does not parse.
 * @param {string} reviewDate YYYY-MM-DD
 * @param {number} now epoch milliseconds
 */
export function ageInDays(reviewDate, now) {
  const then = Date.parse(`${reviewDate}T00:00:00Z`);
  return Number.isNaN(then) ? null : Math.max(0, Math.floor((now - then) / 86_400_000));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const files = guideFiles(root);
  /** @type {string[]} */
  const problems = [];
  /** @type {string[]} */
  const dates = [];
  for (const { path, kind } of files) {
    const result = inspect(path, readFileSync(join(root, path), 'utf8'), kind);
    problems.push(...result.problems);
    if (result.reviewDate) dates.push(result.reviewDate);
  }
  if (problems.length > 0) {
    console.error(`check-research-guides: ${problems.length} problem(s) (docs/research/design/README.md, "Shared document structure"):`);
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }
  const oldest = dates.sort()[0];
  const age = oldest ? ageInDays(oldest, Date.now()) : null;
  console.log(`check-research-guides: ${files.length} research files carry a review date and their required sections${oldest ? `; the oldest review date is ${oldest} (${age} days ago)` : ''}`);
}
