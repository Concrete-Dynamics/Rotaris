#!/usr/bin/env node
// The record is read by agents that load a document whole, and a document past a few hundred lines costs them the
// context the work needed: on 2026-10-26 `open-questions.md` was 16,723 lines and `directives.md` 9,904. The owner
// asked for a bound, fixed once and for all ("Das sollte man generell festlegen"), and the bound and its
// sources are in `docs/README.md`, "The document budget": at most 500 lines and 32 KiB per Markdown file.
//
// This gate reads every record file (`recordFiles`, the set `check-record-links.mjs` reads, the archive under
// `docs/archive/` among them: an archived part is held to the budget like a live one, R-092) and fails on one over the
// budget that `tools/doc-budget-baseline.json` does not list. The baseline is the debt the split of 2026-10-26 did
// not reach, and it only shrinks: a listed file back within the budget fails until its line is removed, so a payment
// is recorded where it was made. A listed file that no longer exists is reported and passes, since removing a file
// is a payment too and may land from another branch. A listed file may grow; splitting it is what pays it off.
//
// Runs as part of `pnpm lint`. Reads the tree; costs no subprocess. The pure part is exported for the test beside
// this file.
import { existsSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { recordFiles } from './check-record-links.mjs';

/** At most this many lines in one Markdown file of the record. */
export const MAX_LINES = 500;
/** At most this many bytes, about 8,000 tokens: whichever bound is reached first. */
export const MAX_BYTES = 32 * 1024;

/**
 * The size of one file's text, counted the way an editor shows it.
 * @param {string} text
 */
export function sizeOf(text) {
  const lines = text === '' ? 0 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
  return { lines, bytes: Buffer.byteLength(text, 'utf8') };
}

/**
 * The verdict over measured sizes and the baseline.
 * @param {Map<string, { lines: number, bytes: number }>} sizes repository-relative path → size
 * @param {string[]} baseline the listed paths
 * @returns {{ over: string[], paid: string[], gone: string[], debt: string[] }} `over`: over the budget and not listed;
 *   `paid`: listed and within it; `gone`: listed and absent; `debt`: listed and still over it
 */
export function verdict(sizes, baseline) {
  const listed = new Set(baseline);
  const within = (/** @type {{ lines: number, bytes: number }} */ s) => s.lines <= MAX_LINES && s.bytes <= MAX_BYTES;
  const over = [...sizes].filter(([path, s]) => !within(s) && !listed.has(path)).map(([path]) => path);
  const paid = baseline.filter((path) => sizes.has(path) && within(/** @type {{ lines: number, bytes: number }} */ (sizes.get(path))));
  const gone = baseline.filter((path) => !sizes.has(path));
  const debt = baseline.filter((path) => sizes.has(path) && !paid.includes(path));
  return { over: over.sort(), paid, gone, debt };
}

/** @param {string} root */
export function measure(root) {
  /** @type {Map<string, { lines: number, bytes: number }>} */
  const sizes = new Map();
  for (const file of recordFiles(root)) sizes.set(relative(root, file).split(sep).join('/'), sizeOf(readFileSync(file, 'utf8')));
  return sizes;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const baselinePath = join(root, 'tools', 'doc-budget-baseline.json');
  const baseline = existsSync(baselinePath) ? /** @type {{ over: string[] }} */ (JSON.parse(readFileSync(baselinePath, 'utf8'))).over : [];
  const sizes = measure(root);
  const { over, paid, gone, debt } = verdict(sizes, baseline);
  const show = (/** @type {string} */ p) => `${p} (${sizes.get(p)?.lines} lines, ${Math.round((sizes.get(p)?.bytes ?? 0) / 1024)} KiB)`;
  for (const path of gone) console.log(`check-doc-budget: ${path} is listed in tools/doc-budget-baseline.json and no longer exists; its line can go`);
  if (over.length > 0 || paid.length > 0) {
    console.error(`check-doc-budget: ${over.length + paid.length} problem(s) against the document budget (${MAX_LINES} lines, ${MAX_BYTES / 1024} KiB):`);
    for (const path of over) console.error(`  - ${show(path)} is over the budget: split it into an index and parts (docs/README.md, "The document budget")`);
    for (const path of paid) console.error(`  - ${show(path)} is within the budget now: remove its line from tools/doc-budget-baseline.json`);
    process.exit(1);
  }
  console.log(`check-doc-budget: ${sizes.size} record files, ${sizes.size - debt.length} within ${MAX_LINES} lines and ${MAX_BYTES / 1024} KiB; ${debt.length} listed as debt in tools/doc-budget-baseline.json`);
}
