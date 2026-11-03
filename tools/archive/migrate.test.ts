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
import { commit, compress, indexLine, plan, qualifying, rebase, settledAs, stillLive, tightenIndexLines, titleOf } from './migrate.mjs';
import { checkRecord } from '../check-record-links.mjs';
import { checkTree } from '../check-open-question-claims.mjs';
import { measure } from '../check-doc-budget.mjs';

const PART1 = 'docs/architecture/open-questions/01-fixture-questions.md';
const PART2 = 'docs/architecture/open-questions/02-fixture-questions.md';
const ARCHIVE1 = 'docs/archive/architecture/open-questions/01-fixture-questions.md';
const ARCHIVE2 = 'docs/archive/architecture/open-questions/02-fixture-questions.md';

/** The fixture tree, by repository-relative path. */
const FIXTURE: Record<string, string> = {
  'docs/README.md': ['# The record', '', '## The archive', '', 'What moves there.', ''].join('\n'),
  // Joined, so that the link gate's code pass does not read a fixture's path as a pointer to a real note.
  [['docs', 'archive', 'defects', 'a-note.md'].join('/')]: '# A note\n',
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
    // eslint-disable-next-line rotaris/requirement-citations-resolve -- a made-up identifier in a fixture record
    '**OQ-1 — Still open?** *(REQ-X-1.)* See [OQ-2](#oq-2) and [the note](../../archive/defects/a-note.md).',
    '',
    '<a id="oq-2"></a>',
    '',
    // eslint-disable-next-line rotaris/requirement-citations-resolve -- a made-up identifier in a fixture record
    '**OQ-2 — A ruled one?** *(REQ-X-2.)* Cites `../../archive/defects/a-note.md` and [OQ-1](#oq-1).',
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
        // eslint-disable-next-line rotaris/requirement-citations-resolve -- a made-up identifier in a fixture record
        '**OQ-1 — Still open?** *(REQ-X-1.)* See [OQ-2](../../archive/architecture/open-questions/01-fixture-questions.md#oq-2) ' +
          'and [the note](../../archive/defects/a-note.md).',
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
        // eslint-disable-next-line rotaris/requirement-citations-resolve -- a made-up identifier in a fixture record
        '**OQ-2 — A ruled one?** *(REQ-X-2.)* Cites `../../defects/a-note.md` and [OQ-1](../../../architecture/open-questions/01-fixture-questions.md#oq-1).',
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
    expect(moves.map((m) => ['n' in m ? m.n : m.id, m.to])).toEqual([
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
    expect(rebase('[a](#oq-1) [b](../open-questions.md) [c](https://example.com) `../../archive/defects/a-note.md` `../nowhere.md`', from, to, tree)).toBe(
      '[a](../../../architecture/open-questions/01-fixture-questions.md#oq-1) [b](../../../architecture/open-questions.md) [c](https://example.com) `../../defects/a-note.md` `../nowhere.md`',
    );
  });
});


/*
 * The defect notes' kind (`tools/archive/defects.mjs`): `docs/defects/fixed/` is retired, and every note under it moves
 * to `docs/archive/defects/` with every pointer to it. The fixture's repository paths are assembled from parts, so that
 * the link gate's code pass, which reads this file too, reads no fixture path as a pointer to a real note.
 */
describe('archive:migrate — the repaired defect notes', () => {
  const path = (...parts: string[]) => parts.join('/');
  const FIXED = path('docs', 'defects', 'fixed');
  const ARCHIVED = path('docs', 'archive', 'defects');
  const NOTES: Record<string, string> = {
    'docs/README.md': '# The record\n\n## The archive\n',
    [path(FIXED, 'one.md')]: '# One\n\nSee [two](two.md#two), [the open one](../open.md) and [the spec](../../spec/01.md).\n',
    [path(FIXED, 'two.md')]: '# Two\n\nRepaired; `../../architecture/x.md` holds it.\n',
    [path('docs', 'defects', 'open.md')]: `# Open\n\nIts sibling was [one](fixed/one.md); see \`${path(FIXED, 'one.md')}\`.\n`,
    'docs/spec/01.md': '# Spec\n',
    'docs/architecture/x.md': [
      '# X',
      '',
      `[one](../defects/fixed/one.md#one), \`${path(FIXED, 'two.md')}\`, \`../defects/fixed/two.md\`, and ${path(FIXED, 'one.md')} in text.`,
      `A path to a note no move made: \`${path(FIXED, 'never.md')}\`.`,
      '',
    ].join('\n'),
    'docs/product/requests.md': `| R-1 | [one](../defects/fixed/one.md) and \`${path(FIXED, 'one.md')}\` |\n`,
    'packages/kernel/CONTEXT.md': `# Kernel\n\n[two](../../${path(FIXED, 'two.md')})\n`,
    [path('docs', 'defects', 'linked.md')]: '# Linked\n\nOnly a link: [one](fixed/one.md#one), and the folder, [`fixed/`](fixed/).\n',
    'docs/architecture/register.md': '# Register\n\nNotes go to [`fixed/`](../defects/fixed/).\n',
    'apps/desktop/src/a.ts': `// ${path(FIXED, 'one.md')}, and ${path(FIXED, '')} the folder.\nexport const a = 1;\n`,
    '.agents/skills/s/SKILL.md': `Moved to \`${path(FIXED, 'two.md')}\`.\n`,
    '.github/workflows/ci.yml': `# (${path(FIXED, 'one.md')})\n`,
    '.gitattributes': `# (${path(FIXED, 'two.md')})\n*.md text\n`,
    'tools/gen.mjs': "export const line = '([note](../defects/fixed/two.md)), and [none](../defects/fixed/none.md)';\n",
  };
  let at: string;
  const readAt = (p: string) => readFileSync(join(at, p), 'utf8');

  beforeEach(() => {
    at = mkdtempSync(join(tmpdir(), 'archive-defects-'));
    write(at, NOTES);
  });

  afterEach(() => {
    rmSync(at, { recursive: true, force: true });
  });

  it('moves every note under the retired folder and removes the folder, the notes\' own paths reaching what they reached', () => {
    const { moves } = migrate(at);
    expect(moves).toEqual([
      { kind: 'defect', id: 'one.md', from: path(FIXED, 'one.md'), to: path(ARCHIVED, 'one.md') },
      { kind: 'defect', id: 'two.md', from: path(FIXED, 'two.md'), to: path(ARCHIVED, 'two.md') },
    ]);
    expect(existsSync(join(at, FIXED))).toBe(false);
    expect(readAt(path(ARCHIVED, 'one.md'))).toBe('# One\n\nSee [two](two.md#two), [the open one](../../defects/open.md) and [the spec](../../spec/01.md).\n');
    expect(readAt(path(ARCHIVED, 'two.md'))).toBe('# Two\n\nRepaired; `../../architecture/x.md` holds it.\n');
  });

  it('repoints links, root and relative paths in the record, paths in the code, the agent instructions and the root\'s files; in the request log, links alone', () => {
    migrate(at);
    expect(readAt('docs/architecture/x.md')).toBe(
      [
        '# X',
        '',
        `[one](../archive/defects/one.md#one), \`${path(ARCHIVED, 'two.md')}\`, \`../archive/defects/two.md\`, and ${path(ARCHIVED, 'one.md')} in text.`,
        `A path to a note no move made: \`${path(FIXED, 'never.md')}\`.`,
        '',
      ].join('\n'),
    );
    expect(readAt(path('docs', 'defects', 'linked.md'))).toBe('# Linked\n\nOnly a link: [one](../archive/defects/one.md#one), and the folder, [`fixed/`](../archive/defects/).\n');
    expect(readAt('docs/architecture/register.md')).toBe('# Register\n\nNotes go to [`fixed/`](../archive/defects/).\n');
    expect(readAt(path('docs', 'defects', 'open.md'))).toBe(`# Open\n\nIts sibling was [one](../archive/defects/one.md); see \`${path(ARCHIVED, 'one.md')}\`.\n`);
    expect(readAt('docs/product/requests.md')).toBe(`| R-1 | [one](../archive/defects/one.md) and \`${path(FIXED, 'one.md')}\` |\n`);
    expect(readAt('packages/kernel/CONTEXT.md')).toBe(`# Kernel\n\n[two](../../${path(ARCHIVED, 'two.md')})\n`);
    expect(readAt('apps/desktop/src/a.ts')).toBe(`// ${path(ARCHIVED, 'one.md')}, and ${path(FIXED, '')} the folder.\nexport const a = 1;\n`);
    expect(readAt('.agents/skills/s/SKILL.md')).toBe(`Moved to \`${path(ARCHIVED, 'two.md')}\`.\n`);
    expect(readAt('.github/workflows/ci.yml')).toBe(`# (${path(ARCHIVED, 'one.md')})\n`);
    expect(readAt('.gitattributes')).toBe(`# (${path(ARCHIVED, 'two.md')})\n*.md text\n`);
    // A generator's relative path reaches the archive by the same prefix, since both folders sit two below docs/.
    expect(readAt('tools/gen.mjs')).toBe("export const line = '([note](../archive/defects/two.md)), and [none](../defects/fixed/none.md)';\n");
    // Left as written: a path to a note no move made, which the prose pass names. Every link resolves.
    expect(checkRecord(at).problems).toEqual([]);
  });

  it('changes nothing on a second run, and --check is red while a note is under the retired folder', () => {
    expect(stillLive(at)).toEqual([`${path(FIXED, 'one.md')} (a repaired note under the retired fixed/ folder)`, `${path(FIXED, 'two.md')} (a repaired note under the retired fixed/ folder)`]);
    migrate(at);
    const before = snapshot(at);
    const again = plan(at);
    expect(again.moves).toEqual([]);
    expect(again.changed.size).toBe(0);
    expect(snapshot(at)).toEqual(before);
    expect(stillLive(at)).toEqual([]);
  });

  it('moves a note a branch moved to the retired folder before its rebase, and a pointer it added to the old path', () => {
    migrate(at);
    write(at, {
      [path(FIXED, 'three.md')]: '# Three\n\nAfter [one](one.md).\n',
      'docs/architecture/late.md': '# Late\n\n[three](../defects/fixed/three.md) and [one](../defects/fixed/one.md).\n',
    });
    const { moves } = migrate(at);
    expect(moves).toEqual([{ kind: 'defect', id: 'three.md', from: path(FIXED, 'three.md'), to: path(ARCHIVED, 'three.md') }]);
    expect(readAt(path(ARCHIVED, 'three.md'))).toBe('# Three\n\nAfter [one](one.md).\n');
    expect(readAt('docs/architecture/late.md')).toBe('# Late\n\n[three](../archive/defects/three.md) and [one](../archive/defects/one.md).\n');
    expect(checkRecord(at).problems).toEqual([]);
  });

  it('refuses two notes of one name, naming both, and writes nothing', () => {
    write(at, { [path(ARCHIVED, 'one.md')]: '# Another one\n' });
    const before = snapshot(at);
    expect(() => plan(at)).toThrow(/one\.md .* are two notes of one name/);
    expect(snapshot(at)).toEqual(before);
  });
});
