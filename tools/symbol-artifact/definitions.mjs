// @ts-check
// What `pnpm symbols` reads as the definition of a requirement, and from which files (ADR-0040 #4): one module, so the
// generator (`generate.mjs`) and the archive's specification kind (`tools/archive/spec.mjs`, R-092), which must leave
// every definition where the generator finds it, read the same shapes from the same files.
//
// The files are `docs/spec/NN-<domain>.md` and the parts each indexes (`tools/record-parts.mjs`), and nothing else:
// `docs/spec/resolutions/` holds the rounds' records, and `docs/archive/spec/` the archived text of withdrawn and
// superseded requirements, which defines no identifier (`archive-not-read.test.ts`).
import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { partsOf } from '../record-parts.mjs';

// Three definition shapes the corpus uses, and only these — matching the registrar's mechanical count of 4,397
// identifiers.
export const BULLET = /^-\s+\*\*(REQ-[A-Z]+-\d+)\*\*(.*)$/;
export const HEADING = /^\*\*(REQ-[A-Z]+-\d+)\*\*\s*[—:](.*)$/;
export const SECTION = /^#{2,5}\s+(REQ-[A-Z]+-\d+)(.*)$/;
export const WITHDRAWN = /\*Withdrawn\.?\*/i;

/**
 * The specification's files the generator reads, in order, relative to `specDir` with forward slashes: each domain's
 * file, then its parts. A domain over the document budget is an index at `NN-<domain>.md` and its parts in
 * `NN-<domain>/` (since 2026-10-26).
 * @param {string} specDir absolute path of `docs/spec`
 * @returns {string[]}
 */
export function specFiles(specDir) {
  return readdirSync(specDir)
    .filter((f) => /^\d\d-.*\.md$/.test(f))
    .sort()
    .flatMap((f) => [f, ...partsOf(join(specDir, f)).map((p) => relative(specDir, p).split(sep).join('/'))]);
}
