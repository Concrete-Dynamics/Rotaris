import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Spike 7's generator (`docs/architecture/spikes/traceability-scale.md`): a requirement store of the order of
 * 10^3 documents and a source tree of the order of 10^3 files carrying 10^4 annotation sites, so REQ-TRACE-501's
 * parse budget and REQ-TRACE-088's sweep budget can be measured under the reference conditions. Deterministic: the
 * same options produce byte-identical trees. Not exported from the package index; the proof and the tests use it.
 */
export interface ScaleOptions {
  readonly blocks: number;
  readonly childrenPerBlock: number;
  readonly implFiles: number;
  readonly testFiles: number;
  readonly sitesPerFile: number;
  readonly prefix?: string;
}

export const SPIKE_7: ScaleOptions = { blocks: 15, childrenPerBlock: 99, implFiles: 800, testFiles: 200, sitesPerFile: 10 };

export interface ScaleShape { readonly documents: number; readonly requirements: number; readonly files: number; readonly sites: number; readonly bytes: number }

const WORDS = ['the', 'engine', 'shall', 'report', 'every', 'document', 'once', 'and', 'never', 'twice', 'so', 'a', 'reader', 'sees', 'one', 'state', 'of', 'each', 'file', 'within', 'an', 'invocation', 'while', 'nothing', 'is', 'carried', 'between', 'two'];

function prose(seed: number, sentences: number): string {
  const out: string[] = [];
  for (let s = 0; s < sentences; s += 1) {
    const words: string[] = [];
    for (let w = 0; w < 12 + ((seed + s) % 7); w += 1) words.push(WORDS[(seed * 7 + s * 3 + w) % WORDS.length]!);
    out.push(`${words.join(' ')}.`);
  }
  return out.join(' ');
}

function document(prefix: string, n: number, epic: boolean, seed: number): string {
  const status = epic ? 'approved' : n % 50 === 0 ? 'deprecated' : n % 10 === 0 ? 'draft' : 'approved';
  const technical = !epic && n % 7 === 0;
  const lines = ['---', `req-id: ${prefix}-${n}`, `status: ${status}`];
  if (epic) lines.push('trace: optional', 'test: optional');
  lines.push(`title: Requirement ${n} ${epic ? 'epic' : 'behaviour'}`);
  if (technical) lines.push('type: technical', `derived-from: ${prefix}-${n - 1}`);
  lines.push(`priority: P${(n % 3) + 1}`, `date: 2026-0${(n % 8) + 1}-1${n % 9}`, '---', '', `# ${prefix}-${n} - Requirement ${n}`, '', prose(seed, 6), '', prose(seed + 1, 5), '', prose(seed + 2, 4), '', '## Acceptance criteria', '', `- ${prose(seed + 3, 2)}`, `- ${prose(seed + 4, 2)}`, '');
  return lines.join('\n');
}

function implFile(prefix: string, index: number, sites: number, max: number): string {
  const lines = ['// generated for spike 7; annotation sites built deliberately', `import { traces } from 'rotaris-traceability';`, `import { Requirement } from './requirement_ids';`, ''];
  for (let s = 0; s < sites; s += 1) {
    const n = 100 + ((index * 31 + s * 17) % max);
    const m = 100 + ((index * 13 + s * 5) % max);
    const variant = (index + s) % 5;
    if (variant === 0) lines.push(`@traces(${prefix}_${n})`, `export class Site${index}_${s} { run(): number { return ${n}; } }`, '');
    else if (variant === 1) lines.push(`export function site${index}_${s}(): number { return ${n}; }`, `traces(${prefix}_${n}, ${prefix}_${m});`, '');
    else if (variant === 2) lines.push(`traces(`, `  Requirement.${prefix}_${n},`, `  Requirement.${prefix}_${m},`, `);`, `export const value${index}_${s} = ${n};`, '');
    else if (variant === 3) lines.push(`traces(${n});`, `export const bare${index}_${s} = ${n};`, '');
    else lines.push(`@traces(${prefix}_${n})`, `export class Other${index}_${s} { get(): number { return ${m}; } }`, '');
  }
  return lines.join('\n');
}

function testFile(prefix: string, index: number, sites: number, max: number): string {
  const lines = ['// generated for spike 7', `import { covers } from 'rotaris-traceability';`, ''];
  for (let s = 0; s < sites; s += 1) {
    const n = 100 + ((index * 23 + s * 11) % max);
    if ((index + s) % 3 === 0) lines.push(`// covers: ${prefix}-${n}`, `export function testSite${index}_${s}(): void { }`, '');
    else lines.push(`@covers(${prefix}_${n})`, `export function testCase${index}_${s}(): void { }`, '');
  }
  return lines.join('\n');
}

/** Write the tree under `dir` (created); returns its shape. */
export function generateScaleRepository(dir: string, opts: ScaleOptions = SPIKE_7): ScaleShape {
  const prefix = opts.prefix ?? 'REQ';
  const store = join(dir, 'docs', 'requirements');
  mkdirSync(store, { recursive: true });
  let documents = 0;
  let requirements = 0;
  let bytes = 0;
  const write = (path: string, text: string): void => { writeFileSync(path, text); bytes += Buffer.byteLength(text); };
  write(join(store, 'README.md'), '# Requirements\n\nThis directory holds the store; this file carries no frontmatter.\n');
  documents += 1;
  for (let b = 1; b <= opts.blocks; b += 1) {
    const epic = b * 100;
    const stem = `${prefix}-${epic}-epic-${b}`;
    write(join(store, `${stem}.md`), document(prefix, epic, true, epic));
    documents += 1;
    requirements += 1;
    mkdirSync(join(store, stem), { recursive: true });
    for (let c = 1; c <= opts.childrenPerBlock; c += 1) {
      const n = epic + c;
      write(join(store, stem, `${prefix}-${n}-requirement-${n}.md`), document(prefix, n, false, n));
      documents += 1;
      requirements += 1;
    }
  }
  const max = opts.blocks * 100;
  mkdirSync(join(dir, 'src'), { recursive: true });
  mkdirSync(join(dir, 'tests'), { recursive: true });
  let files = 0;
  let sites = 0;
  for (let i = 0; i < opts.implFiles; i += 1) {
    write(join(dir, 'src', `module-${i}.ts`), implFile(prefix, i, opts.sitesPerFile, max));
    files += 1;
    sites += opts.sitesPerFile;
  }
  for (let i = 0; i < opts.testFiles; i += 1) {
    write(join(dir, 'tests', `module-${i}.ts`), testFile(prefix, i, opts.sitesPerFile, max));
    files += 1;
    sites += opts.sitesPerFile;
  }
  write(join(dir, 'rotaris-traceability.json'), `${JSON.stringify({ layout: { requirements_dir: 'docs/requirements', id_prefix: prefix, generated_path: 'src/requirement_ids.ts', impl_roots: ['src'], test_roots: ['tests'] } }, null, 2)}\n`);
  return { documents, requirements, files, sites, bytes };
}
