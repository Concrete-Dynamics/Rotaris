/* eslint-disable rotaris/requirement-citations-resolve -- a fixture specification of made-up identifiers (REQ-X-…, PD-X-…) */
/**
 * The superseded requirements' kind of the archive (`tools/archive/spec.mjs`, R-092; `docs/architecture/hardening.md`
 * §6 row 6), over a fixture specification on disk whose artifact is written by a copy of the real generator: a
 * withdrawn requirement with paragraphs and sub-bullets under it, a superseded one with an example and its directive's
 * back-pointer, a withdrawn one of one line, a live one and a narrowed one with text of their own, and a withdrawn bold
 * paragraph followed by a second one. What a landing relies on: exactly the text beyond a withdrawn or superseded
 * definition moves, verbatim; the definition line and the back-pointer stay; the artifact the generator writes after
 * the move holds the same identifiers, files and flags (only `line` may change); a second run changes nothing.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { commit, plan, stillLive } from './migrate.mjs';
import { movedText, qualifying, qualifyingIds, regionOf } from './spec.mjs';
import { checkRecord } from '../check-record-links.mjs';

const REPO = join(import.meta.dirname, '..', '..');
const PART = 'docs/spec/01-domain/01-requirements.md';
const ARCHIVE = 'docs/archive/spec/01-domain/01-requirements.md';
const ARTIFACT = 'packages/kernel/src/generated/requirements.ts';
/** The generator and what it imports, copied into the fixture so that it reads the fixture's `docs/`. */
const GENERATOR = ['tools/symbol-artifact/generate.mjs', 'tools/symbol-artifact/definitions.mjs', 'tools/symbol-artifact/replace.mjs', 'tools/record-parts.mjs'];

const FIXTURE: Record<string, string> = {
  'docs/README.md': ['# The record', '', '## The archive', '', 'What moves there.', ''].join('\n'),
  'docs/product/directives.md': [
    '# Product directives',
    '',
    '<a id="pd-x-001"></a>',
    '',
    '### PD-X-001 — questions dock',
    '',
    '> **Supersedes:** REQ-X-002',
    '',
    '<a id="pd-x-002"></a>',
    '',
    '### PD-X-002 — one case carved out',
    '',
    '> **Narrows:** REQ-X-006',
    '',
  ].join('\n'),
  'docs/spec/01-domain.md': ['# Domain', '', 'Parts: [01](01-domain/01-requirements.md).', ''].join('\n'),
  [PART]: [
    '# Domain — Requirements',
    '',
    '## Behaviour',
    '',
    '- **REQ-X-001** — *Withdrawn.* It held a predecessor\'s layout; carried by REQ-X-004.',
    '',
    '  The layout was three files, each read in turn:',
    '',
    '  - `a` held the index;',
    '  - `b` held the [record](../../README.md).',
    '',
    '- **REQ-X-002** — The question opens a modal stepper,',
    '  one step at a time.',
    '',
    '  An example: three questions show three steps.',
    '',
    '  > **Superseded by [`PD-X-001`](../../product/directives.md#pd-x-001), 2026-09-13.** Questions dock at the',
    '  > bottom of the transcript.',
    '',
    '- **REQ-X-003** — *Withdrawn.* One line, carried by REQ-X-004.',
    '- **REQ-X-004** — The state is read in one place.',
    '',
    '  A live requirement\'s second paragraph stays.',
    '',
    '**REQ-X-005** — *Withdrawn.* A bold paragraph whose text',
    'runs on to a second line.',
    '',
    'Its second paragraph, with a [link](../01-domain.md).',
    '',
    '## Later',
    '',
    '- **REQ-X-006** — A narrowed requirement.',
    '',
    '  > **Narrowed by [`PD-X-002`](../../product/directives.md#pd-x-002), 2026-09-14.** One case.',
    '',
    '  Its own text stays: it still governs.',
    '',
  ].join('\n'),
};

let root: string;

function write(at: string, files: Record<string, string>) {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(at, path)), { recursive: true });
    writeFileSync(join(at, path), text);
  }
}

const read = (path: string) => readFileSync(join(root, path), 'utf8');

/** `pnpm symbols` over the fixture: the real generator, copied beside its `docs/`. */
function symbols(): string {
  execFileSync(process.execPath, [join(root, 'tools', 'symbol-artifact', 'generate.mjs')], { env: { ...process.env, SYMBOLS_QUIET: '1' } });
  return read(ARTIFACT);
}

/** The artifact with every definition's `line` read away: what must not change. */
const withoutLines = (artifact: string) => artifact.replace(/line: \d+/g, 'line: _');

function snapshot(at: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else out[relative(at, full).split(sep).join('/')] = readFileSync(full, 'utf8');
    }
  };
  walk(at);
  return out;
}

function migrate() {
  const result = plan(root);
  commit(result.changed);
  return result;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'archive-spec-'));
  write(root, FIXTURE);
  for (const file of GENERATOR) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    copyFileSync(join(REPO, file), join(root, file));
  }
  symbols();
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('archive:migrate — superseded and withdrawn requirements', () => {
  it('reads what qualifies from the artifact: withdrawn in place, or superseded; a narrowed one does not', () => {
    expect(Object.fromEntries(qualifyingIds(root)!)).toEqual({
      'REQ-X-001': { file: '01-domain/01-requirements.md', state: 'withdrawn' },
      'REQ-X-002': { file: '01-domain/01-requirements.md', state: 'superseded by PD-X-001' },
      'REQ-X-003': { file: '01-domain/01-requirements.md', state: 'withdrawn' },
      'REQ-X-005': { file: '01-domain/01-requirements.md', state: 'withdrawn' },
    });
    expect(checkRecord(root).problems).toEqual([]);
  });

  it('moves the text beyond each definition paragraph, and only that, in order', () => {
    const { moves } = migrate();
    expect(moves).toEqual([
      { kind: 'spec', id: 'REQ-X-001', from: PART, to: ARCHIVE },
      { kind: 'spec', id: 'REQ-X-002', from: PART, to: ARCHIVE },
      { kind: 'spec', id: 'REQ-X-005', from: PART, to: ARCHIVE },
    ]);
  });

  it('leaves the definition paragraph, one archived line and the back-pointer blockquote; a one-line, live or narrowed requirement is untouched', () => {
    migrate();
    expect(read(PART)).toBe([
      '# Domain — Requirements',
      '',
      '## Behaviour',
      '',
      '- **REQ-X-001** — *Withdrawn.* It held a predecessor\'s layout; carried by REQ-X-004.',
      '  *(Text archived: [docs/archive/spec/01-domain/01-requirements.md#req-x-001](../../archive/spec/01-domain/01-requirements.md#req-x-001) — withdrawn)*',
      '',
      '- **REQ-X-002** — The question opens a modal stepper,',
      '  one step at a time.',
      '  *(Text archived: [docs/archive/spec/01-domain/01-requirements.md#req-x-002](../../archive/spec/01-domain/01-requirements.md#req-x-002) — superseded by PD-X-001)*',
      '',
      '  > **Superseded by [`PD-X-001`](../../product/directives.md#pd-x-001), 2026-09-13.** Questions dock at the',
      '  > bottom of the transcript.',
      '',
      '- **REQ-X-003** — *Withdrawn.* One line, carried by REQ-X-004.',
      '- **REQ-X-004** — The state is read in one place.',
      '',
      '  A live requirement\'s second paragraph stays.',
      '',
      '**REQ-X-005** — *Withdrawn.* A bold paragraph whose text',
      'runs on to a second line.',
      '*(Text archived: [docs/archive/spec/01-domain/01-requirements.md#req-x-005](../../archive/spec/01-domain/01-requirements.md#req-x-005) — withdrawn)*',
      '',
      '## Later',
      '',
      '- **REQ-X-006** — A narrowed requirement.',
      '',
      '  > **Narrowed by [`PD-X-002`](../../product/directives.md#pd-x-002), 2026-09-14.** One case.',
      '',
      '  Its own text stays: it still governs.',
      '',
    ].join('\n'));
  });

  it('writes each moved text verbatim under its own anchor and heading, dedented, its relative paths reaching the same files', () => {
    migrate();
    const archived = read(ARCHIVE);
    expect(archived).toContain([
      '<a id="req-x-001"></a>',
      '',
      '### REQ-X-001',
      '',
      '*Withdrawn; defined in [`spec/01-domain/01-requirements.md`](../../../spec/01-domain/01-requirements.md), whose definition line stays.*',
      '',
      'The layout was three files, each read in turn:',
      '',
      '- `a` held the index;',
      '- `b` held the [record](../../../README.md).',
    ].join('\n'));
    expect(archived).toContain([
      '### REQ-X-002',
      '',
      '*Superseded by PD-X-001; defined in [`spec/01-domain/01-requirements.md`](../../../spec/01-domain/01-requirements.md), whose definition line stays.*',
      '',
      'An example: three questions show three steps.',
      '',
      '<a id="req-x-005"></a>',
    ].join('\n'));
    expect(archived).toContain('Its second paragraph, with a [link](../../../spec/01-domain.md).');
    expect(archived).not.toContain('Superseded by [`PD-X-001`]');
    expect(checkRecord(root).problems).toEqual([]);
  });

  it('leaves the artifact as it was but for the lines of the definitions below a move', () => {
    const before = read(ARTIFACT);
    migrate();
    const after = symbols();
    expect(after).not.toBe(before);
    expect(withoutLines(after)).toBe(withoutLines(before));
  });

  it('never reads the archive into the artifact: its headings define no identifier', () => {
    migrate();
    const artifact = symbols();
    expect(read(ARCHIVE)).toMatch(/^### REQ-X-001$/m);
    expect(artifact).not.toContain('archive');
    expect(artifact).toContain("'REQ-X-001': { id: 'REQ-X-001', domain: 'X', file: '01-domain/01-requirements.md', line: 5, withdrawn: true }");
  });

  it('changes nothing on a second run, and --check is red before the move and green after', () => {
    expect(stillLive(root)).toEqual([
      'REQ-X-001 at docs/spec/01-domain/01-requirements.md:5 (3 line(s) of a requirement withdrawn, beyond its definition)',
      'REQ-X-002 at docs/spec/01-domain/01-requirements.md:12 (1 line(s) of a requirement superseded by PD-X-001, beyond its definition)',
      'REQ-X-005 at docs/spec/01-domain/01-requirements.md:25 (1 line(s) of a requirement withdrawn, beyond its definition)',
    ]);
    migrate();
    symbols();
    expect(qualifying(root)).toEqual([]);
    expect(stillLive(root)).toEqual([]);
    const once = snapshot(root);
    expect(plan(root).changed.size).toBe(0);
    migrate();
    expect(snapshot(root)).toEqual(once);
  });

  it('moves text added later under an archived requirement to the end of its entry, keeping the one archived line', () => {
    migrate();
    const live = read(PART).replace('withdrawn)*\n\n- **REQ-X-002**', 'withdrawn)*\n\n  A sentence added later.\n\n- **REQ-X-002**');
    writeFileSync(join(root, PART), live);
    expect(qualifying(root).map((q: { id: string }) => q.id)).toEqual(['REQ-X-001']);
    migrate();
    expect(read(PART).match(/req-x-001\) — withdrawn\)\*/g)).toHaveLength(1);
    expect(read(PART)).not.toContain('A sentence added later.');
    expect(read(ARCHIVE)).toContain('- `b` held the [record](../../../README.md).\n\nA sentence added later.\n\n<a id="req-x-002"></a>');
  });

  it('finds nothing without an artifact', () => {
    rmSync(join(root, ARTIFACT));
    expect(qualifyingIds(root)).toBeUndefined();
    expect(plan(root).changed.size).toBe(0);
    expect(stillLive(root)).toEqual([]);
  });
});

describe('archive:migrate — a requirement\'s lines', () => {
  const lines = (text: string) => text.split('\n');
  it('keeps a wrapped definition paragraph and a back-pointer, moves the rest, and stops at the next column-0 line', () => {
    const text = lines([
      '- **REQ-X-1** — first,',
      '  wrapped.',
      '  - a sub-bullet',
      '',
      '  > **Superseded by PD-X-1.** Text',
      '  > continued.',
      '',
      '  > A quote of its own.',
      'A paragraph of the section.',
    ].join('\n'));
    const r = regionOf(text, 0);
    expect(r).toMatchObject({ shape: 'bullet', first: 2, end: 8, kept: [[4, 6]], marker: undefined });
    expect(r.moving).toEqual([2, 3, 6, 7]);
    expect(movedText(text, r.moving)).toBe('- a sub-bullet\n\n> A quote of its own.');
  });

  it('runs a bold paragraph\'s text to the next definition or heading, a fenced heading included', () => {
    const text = lines(['**REQ-X-1** — a paragraph.', '', '```', '# not a heading', '```', '', '**REQ-X-2** — next.'].join('\n'));
    const r = regionOf(text, 0);
    expect(r).toMatchObject({ shape: 'heading', first: 1, end: 5 });
    expect(movedText(text, r.moving)).toBe('```\n# not a heading\n```');
  });
});
