/**
 * The archive's migration (`tools/archive/migrate.mjs`, R-092), over a fixture record on disk: two live parts of an
 * open-questions record, the record files and code that link into them. What it must do is what a landing relies on
 * when it re-runs the script after a rebase: move exactly the settled entries, leave an index line, repoint every link
 * so that the link gate passes, and change nothing on a second run.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error — the tools directory is plain ESM, run by node without a build step.
import { commit, compress, indexLine, plan, qualifying, rebase, settledAs, tightenIndexLines, titleOf } from './migrate.mjs';
// @ts-expect-error — the tools directory is plain ESM, run by node without a build step.
import { checkRecord } from '../check-record-links.mjs';
// @ts-expect-error — the tools directory is plain ESM, run by node without a build step.
import { checkTree } from '../check-open-question-claims.mjs';
// @ts-expect-error — the tools directory is plain ESM, run by node without a build step.
import { measure } from '../check-doc-budget.mjs';

const PART1 = 'docs/architecture/open-questions/01-fixture-questions.md';
const PART2 = 'docs/architecture/open-questions/02-fixture-questions.md';
const ARCHIVE1 = 'docs/archive/architecture/open-questions/01-fixture-questions.md';
const ARCHIVE2 = 'docs/archive/architecture/open-questions/02-fixture-questions.md';

/** The fixture tree, by repository-relative path. */
const FIXTURE: Record<string, string> = {
  'docs/README.md': ['# The record', '', '## The archive', '', 'What moves there.', ''].join('\n'),
  // Joined, so that the link gate's code pass does not read a fixture's path as a pointer to a real note.
  [['docs', 'defects', 'fixed', 'a-note.md'].join('/')]: '# A note\n',
  'docs/product/requests.md': ['# Requests', '', '| <a id="r-071"></a>R-071 | the owner ruled |', ''].join('\n'),
  'docs/architecture/open-questions.md': [
    '# Open questions',
    '',
    '| Part | Section | Holds |',
    '|---|---|---|',
    '| [01](open-questions/01-fixture-questions.md) | Fixture questions (1/2) | OQ-1 – OQ-4 |',
    '| [02](open-questions/02-fixture-questions.md) | Fixture questions (2/2) | OQ-5, OQ-6 |',
    '',
  ].join('\n'),
  [PART1]: [
    '# Open questions — Fixture questions (1 of 2)',
    '',
    'Part 1 of 2 of the [open-questions record](../open-questions.md), which indexes every part. Holds OQ-1 – OQ-4.',
    '',
    '<a id="oq-1"></a>',
    '',
    '**OQ-1 — Still open?** *(REQ-X-1.)* See [OQ-2](#oq-2) and [the note](../../defects/fixed/a-note.md).',
    '',
    '<a id="oq-2"></a>',
    '',
    '**OQ-2 — A ruled one?** *(REQ-X-2.)* Cites `../../defects/fixed/a-note.md` and [OQ-1](#oq-1).',
    '',
    '**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** as built.',
    '',
    '**OQ-3 — Deferred one.** **Deferred 2026-10-06** by the owner.',
    '',
    '**OQ-4 — Decision closed, 2026-09-07.** Nothing more.',
    '',
  ].join('\n'),
  [PART2]: [
    '# Open questions — Fixture questions (2 of 2)',
    '',
    'Part 2 of 2 of the [open-questions record](../open-questions.md), which indexes every part. Holds OQ-5, OQ-6.',
    '',
    '<a id="oq-5"></a>',
    '',
    '**OQ-5 — Withdrawn?** **Withdrawn 2026-10-07:** no longer asked.',
    '',
    '<a id="oq-6"></a>',
    '',
    '**OQ-6 — Open still.** Raised 2026-10-08.',
    '',
  ].join('\n'),
  'docs/architecture/elsewhere.md': [
    '# Elsewhere',
    '',
    'See [OQ-2](open-questions/01-fixture-questions.md#oq-2), [OQ-5](open-questions/02-fixture-questions.md#oq-5) and',
    '[OQ-1](open-questions/01-fixture-questions.md#oq-1); in code, `open-questions/01-fixture-questions.md#oq-2` is text.',
    '',
  ].join('\n'),
  'docs/spec/01-domain.md': '# Domain\n\nREQ-X-2 (see [OQ-2](../architecture/open-questions/01-fixture-questions.md#oq-2)).\n',
  'packages/kernel/CONTEXT.md': '# Kernel\n\n[OQ-5](../../docs/architecture/open-questions/02-fixture-questions.md#oq-5)\n',
  'AGENTS.md': '# Rules\n\n[OQ-2](docs/architecture/open-questions/01-fixture-questions.md#oq-2)\n',
  'apps/desktop/src/a.ts': [
    '// docs/architecture/open-questions/01-fixture-questions.md#oq-2 ruled it;',
    '// docs/architecture/open-questions/01-fixture-questions.md#oq-1 still asks.',
    'export const a = 1;',
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

const read = (path: string, at = root) => readFileSync(join(at, path), 'utf8');

/** Every file under a root, by repository-relative path, with its text. */
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

/** Plan and write: what `pnpm archive:migrate` does. */
function migrate(at = root, options = {}) {
  const result = plan(at, options);
  commit(result.changed);
  return result;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'archive-migrate-'));
  write(root, FIXTURE);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('archive:migrate — what moves', () => {
  it('starts from a fixture the link gate passes', () => {
    expect(checkRecord(root).problems).toEqual([]);
  });

  it('moves the settled entries, in their order, and leaves the open and the deferred ones live', () => {
    const { moves } = migrate();
    expect(moves).toEqual([
      { n: 2, from: PART1, to: ARCHIVE1 },
      { n: 4, from: PART1, to: ARCHIVE1 },
      { n: 5, from: PART2, to: ARCHIVE2 },
    ]);
  });

  it('leaves one index line where each moved entry stood, and rewrites what the part says it holds', () => {
    migrate();
    expect(read(PART1)).toBe(
      [
        '# Open questions — Fixture questions (1 of 2)',
        '',
        'Part 1 of 2 of the [open-questions record](../open-questions.md), which indexes every part. Holds OQ-1, OQ-3; ' +
          'OQ-2, OQ-4 archived in [the archive](../../archive/architecture/open-questions/01-fixture-questions.md).',
        '',
        '<a id="oq-1"></a>',
        '',
        '**OQ-1 — Still open?** *(REQ-X-1.)* See [OQ-2](../../archive/architecture/open-questions/01-fixture-questions.md#oq-2) ' +
          'and [the note](../../defects/fixed/a-note.md).',
        '',
        '- OQ-2 — A ruled one?; ruled 2026-10-06; [archived](../../archive/architecture/open-questions/01-fixture-questions.md#oq-2)',
        '',
        '**OQ-3 — Deferred one.** **Deferred 2026-10-06** by the owner.',
        '',
        '- OQ-4 — Decision closed, 2026-09-07; closed 2026-09-07; [archived](../../archive/architecture/open-questions/01-fixture-questions.md#oq-4)',
        '',
      ].join('\n'),
    );
    expect(read('docs/architecture/open-questions.md')).toContain(
      '| [01](open-questions/01-fixture-questions.md) | Fixture questions (1/2) | OQ-1, OQ-3; OQ-2, OQ-4 [archived](../archive/architecture/open-questions/01-fixture-questions.md) |',
    );
    expect(read('docs/architecture/open-questions.md')).toContain(
      '| [02](open-questions/02-fixture-questions.md) | Fixture questions (2/2) | OQ-6; OQ-5 [archived](../archive/architecture/open-questions/02-fixture-questions.md) |',
    );
  });

  it('moves an entry whole under its own anchor, writing one where it had none, its relative paths reaching the same files', () => {
    migrate();
    const archived = read(ARCHIVE1);
    expect(archived.startsWith('# Archived open questions — Fixture questions (1 of 2)\n\n')).toBe(true);
    expect(archived).toContain('[part 01](../../../architecture/open-questions/01-fixture-questions.md)');
    expect(archived).toContain(
      [
        '<a id="oq-2"></a>',
        '',
        '**OQ-2 — A ruled one?** *(REQ-X-2.)* Cites `../../../defects/fixed/a-note.md` and [OQ-1](../../../architecture/open-questions/01-fixture-questions.md#oq-1).',
        '',
        '**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** as built.',
        '',
        '<a id="oq-4"></a>',
        '',
        '**OQ-4 — Decision closed, 2026-09-07.** Nothing more.',
        '',
      ].join('\n'),
    );
    expect(archived.match(/id="oq-2"/g)).toHaveLength(1);
  });

  it('repoints every link to a moved anchor, in the record and in the code, and leaves the others', () => {
    migrate();
    expect(read('docs/architecture/elsewhere.md')).toContain('[OQ-2](../archive/architecture/open-questions/01-fixture-questions.md#oq-2)');
    expect(read('docs/architecture/elsewhere.md')).toContain('[OQ-5](../archive/architecture/open-questions/02-fixture-questions.md#oq-5)');
    expect(read('docs/architecture/elsewhere.md')).toContain('[OQ-1](open-questions/01-fixture-questions.md#oq-1)');
    expect(read('docs/architecture/elsewhere.md')).toContain('`open-questions/01-fixture-questions.md#oq-2` is text');
    expect(read('docs/spec/01-domain.md')).toBe('# Domain\n\nREQ-X-2 (see [OQ-2](../archive/architecture/open-questions/01-fixture-questions.md#oq-2)).\n');
    expect(read('packages/kernel/CONTEXT.md')).toContain('(../../docs/archive/architecture/open-questions/02-fixture-questions.md#oq-5)');
    expect(read('AGENTS.md')).toContain('(docs/archive/architecture/open-questions/01-fixture-questions.md#oq-2)');
    expect(read('apps/desktop/src/a.ts')).toBe(
      [
        '// docs/archive/architecture/open-questions/01-fixture-questions.md#oq-2 ruled it;',
        '// docs/architecture/open-questions/01-fixture-questions.md#oq-1 still asks.',
        'export const a = 1;',
        '',
      ].join('\n'),
    );
  });

  it('leaves a record the gates pass: every link resolves, the archive is within the budget and measured by it', () => {
    migrate();
    expect(checkRecord(root).problems).toEqual([]);
    const sizes = measure(root);
    expect(sizes.has(ARCHIVE1)).toBe(true);
    expect(sizes.has(ARCHIVE2)).toBe(true);
  });

  it('keeps a moved question settled for the claims gate, which reads the archive with the live parts', () => {
    // Built in pieces, so that the claims gate, reading this file over the real tree, does not read it as a claim.
    const stays = ['stays', 'open'].join(' ');
    write(root, { 'apps/desktop/src/b.ts': `// OQ-2 ${stays}; OQ-1 ${stays}.\n` });
    migrate();
    expect(checkTree(root).map((p: { file: string; numbers: number[] }) => [p.file, p.numbers])).toEqual([['apps/desktop/src/b.ts', [2]]]);
  });
});

describe('archive:migrate — a re-run', () => {
  it('changes nothing on a second run', () => {
    migrate();
    const before = snapshot(root);
    const again = plan(root);
    expect(again.moves).toEqual([]);
    expect(again.changed.size).toBe(0);
    commit(again.changed);
    expect(snapshot(root)).toEqual(before);
  });

  it('gives the same output for the same input', () => {
    const twin = mkdtempSync(join(tmpdir(), 'archive-migrate-twin-'));
    try {
      write(twin, FIXTURE);
      migrate(root);
      migrate(twin);
      expect(snapshot(twin)).toEqual(snapshot(root));
    } finally {
      rmSync(twin, { recursive: true, force: true });
    }
  });

  it('writes nothing while planning: a dry run leaves the tree as it was', () => {
    const before = snapshot(root);
    const { moves, changed } = plan(root);
    expect(moves).toHaveLength(3);
    expect(changed.size).toBeGreaterThan(0);
    expect(snapshot(root)).toEqual(before);
  });

  it('moves a question ruled after the first run to the end of its archive, and repoints a link added to an old anchor', () => {
    migrate();
    write(root, {
      [PART2]: read(PART2).replace('**OQ-6 — Open still.** Raised 2026-10-08.', '**OQ-6 — Open still.** Raised 2026-10-08.\n\n**Ruled 2026-10-09 under R-072:** as built.'),
      'docs/architecture/late.md': '# Late\n\n[OQ-4](open-questions/01-fixture-questions.md#oq-4), from a branch that rebased.\n',
    });
    const { moves } = migrate();
    expect(moves).toEqual([{ n: 6, from: PART2, to: ARCHIVE2 }]);
    expect(read(ARCHIVE2).indexOf('**OQ-6')).toBeGreaterThan(read(ARCHIVE2).indexOf('**OQ-5'));
    expect(read(PART2)).toContain(
      [
        '- OQ-5 — Withdrawn?; withdrawn 2026-10-07; [archived](../../archive/architecture/open-questions/02-fixture-questions.md#oq-5)',
        '- OQ-6 — Open still; ruled 2026-10-09; [archived](../../archive/architecture/open-questions/02-fixture-questions.md#oq-6)',
      ].join('\n'),
    );
    expect(read(PART2)).toContain('which indexes every part. Holds no live entry; OQ-5, OQ-6 archived in [the archive]');
    expect(read('docs/architecture/late.md')).toContain('[OQ-4](../archive/architecture/open-questions/01-fixture-questions.md#oq-4)');
    expect(checkRecord(root).problems).toEqual([]);
    expect(plan(root).changed.size).toBe(0);
  });

  it('continues an archive file that would pass the budget in the next, and the index lines name the file that holds each', () => {
    const { moves } = migrate(root, { budget: { lines: 12, bytes: 32 * 1024 } });
    expect(moves.map((m: { n: number; to: string }) => [m.n, m.to])).toEqual([
      [2, ARCHIVE1],
      [4, 'docs/archive/architecture/open-questions/01-fixture-questions-continued-2.md'],
      [5, ARCHIVE2],
    ]);
    expect(read('docs/archive/architecture/open-questions/01-fixture-questions-continued-2.md')).toMatch(/^# Archived open questions — Fixture questions \(1 of 2\), continued \(2\)\n/);
    expect(read(PART1)).toContain('[archived](../../archive/architecture/open-questions/01-fixture-questions-continued-2.md#oq-4)');
    expect(checkRecord(root).problems).toEqual([]);
    expect(plan(root, { budget: { lines: 12, bytes: 32 * 1024 } }).changed.size).toBe(0);
  });

  it('refuses an entry that alone passes the budget, naming it, and writes nothing', () => {
    const before = snapshot(root);
    expect(() => plan(root, { budget: { lines: 6, bytes: 32 * 1024 } })).toThrow(/OQ-2 alone passes the document budget/);
    expect(snapshot(root)).toEqual(before);
  });
});

describe('archive:migrate --check', () => {
  it('is red while a settled entry is live and green once the migration has run', () => {
    expect(qualifying(root)).toEqual([
      { n: 2, part: PART1 },
      { n: 4, part: PART1 },
      { n: 5, part: PART2 },
    ]);
    migrate();
    expect(qualifying(root)).toEqual([]);
    expect(existsSync(join(root, ARCHIVE1))).toBe(true);
  });
});

describe('archive:migrate — the pieces', () => {
  it('titles an entry by its opening bold, markup dropped', () => {
    expect(titleOf('**OQ-3 — Is a second instance supported? *Resolved: no.***', 3)).toBe('Is a second instance supported? Resolved: no');
    expect(titleOf('**OQ-9 — The [catalogue](x.md) and `key`.** *(ADR-1.)*', 9)).toBe('The catalogue and `key`');
    expect(titleOf(`**OQ-1 — ${'word '.repeat(40)}**`, 1).endsWith(' …')).toBe(true);
  });

  it('says how an entry was settled, with the date beside the words', () => {
    expect(settledAs('**Ruled 2026-10-06 by the owner:** as built.')).toBe('ruled 2026-10-06');
    expect(settledAs('**OQ-7 — Decision closed, 2026-09-07.**')).toBe('closed 2026-09-07');
    expect(settledAs('**OQ-11 — Resolved by dissolution.**')).toBe('resolved');
    expect(settledAs('**Withdrawn 2026-10-07:** no longer asked.')).toBe('withdrawn 2026-10-07');
    expect(settledAs('*(~~Open.~~ Ruled 2026-10-06.)*')).toBe('ruled 2026-10-06');
  });

  it('writes runs of three or more as a range', () => {
    expect(compress([2, 3, 4, 6, 7, 9, 10, 11, 12, 1])).toBe('OQ-2 – OQ-4, OQ-6, OQ-7, OQ-9 – OQ-12, OQ-1');
    expect(compress([])).toBe('');
  });

  it('joins index lines that follow one another into one list', () => {
    const a = indexLine(1, 'A', 'ruled', 'x.md#oq-1');
    const b = indexLine(2, 'B', 'closed', 'x.md#oq-2');
    expect(tightenIndexLines([a, '', '', b, '', 'text', '', a])).toEqual([a, b, '', 'text', '', a]);
  });

  it('rebases a relative link, a same-file anchor and a ../ path in inline code; leaves the rest', () => {
    const from = join(root, PART1);
    const to = join(root, ARCHIVE1);
    const tree = { exists: (p: string) => existsSync(p) };
    expect(rebase('[a](#oq-1) [b](../open-questions.md) [c](https://example.com) `../../defects/fixed/a-note.md` `../nowhere.md`', from, to, tree)).toBe(
      '[a](../../../architecture/open-questions/01-fixture-questions.md#oq-1) [b](../../../architecture/open-questions.md) [c](https://example.com) `../../../defects/fixed/a-note.md` `../nowhere.md`',
    );
  });
});

