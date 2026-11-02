/**
 * The owner decisions' kind of the archive (`tools/archive/owner-decisions.mjs`, R-092), over a fixture register on
 * disk: one part holding an escalation ruled and carried by the specification, one ruled and carried by nobody, one
 * raised and not ruled, and a combined heading; the specification that carries the first; a record file that links
 * the moved entry by its heading. What a landing relies on: exactly the ruled and landed entries move, an index line
 * stays, every link follows, and a second run changes nothing.
 */
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error — the tools directory is plain ESM, run by node without a build step.
import { commit, plan, stillLive } from './migrate.mjs';
// @ts-expect-error — the tools directory is plain ESM, run by node without a build step.
import { entriesOf, hasLanded, headingIds, idsIn, indexLine, isRuled, qualifying, specificationCarries } from './owner-decisions.mjs';
// @ts-expect-error — the tools directory is plain ESM, run by node without a build step.
import { checkRecord } from '../check-record-links.mjs';

const PART = 'docs/architecture/owner-decisions/01-escalations.md';
const ARCHIVE = 'docs/archive/architecture/owner-decisions/01-escalations.md';

const FIXTURE: Record<string, string> = {
  'docs/README.md': ['# The record', '', '## The archive', '', 'What moves there.', ''].join('\n'),
  'docs/architecture/owner-decisions.md': [
    '# Product-owner decisions on the architecture record',
    '',
    '| Part | What it holds |',
    '|---|---|',
    '| [01](owner-decisions/01-escalations.md) | Escalations; ESC-1 — landed; ESC-2 — unlanded |',
    '',
  ].join('\n'),
  [PART]: [
    '# Product-owner decisions on the architecture record — Escalations',
    '',
    'Part 1 of 1 of [the owner decisions](../owner-decisions.md), which indexes every part.',
    '',
    '## Escalations — ruled 2026-08-31',
    '',
    'Delegated by the owner.',
    '',
    '### ESC-1 — a ruling the specification carries',
    '',
    '**Decided: preserve comments.** See [the spec](../../spec/01-domain.md) and [ESC-2](#esc-2--a-ruling-nobody-carries).',
    '',
    '### ESC-2 — a ruling nobody carries',
    '',
    '**Decided: accept the gap as specified.**',
    '',
    '### ESC-3 — raised and not ruled',
    '',
    '**Raised 2026-10-22, open — the owner\'s to rule.** Nothing is decided.',
    '',
    '### ESC-4, ESC-5 and ESC-7 to ESC-8 — ruled 2026-09-02',
    '',
    '**Decided:** all four as recommended.',
    '',
    '---',
    '',
  ].join('\n'),
  'docs/spec/01-domain.md': [
    '# Domain',
    '',
    // eslint-disable-next-line rotaris/requirement-citations-resolve -- a made-up identifier in a fixture record
    '**REQ-X-1** — Comments are preserved. *Amended 2026-09-01 under ESC-1.*',
    '',
    'The round applied ESC-4, ESC-5 and ESC-7 to ESC-8. ESC-2 is still unmade.',
    '',
    '> **ESC-3 raises** a question nobody answered.',
    '',
  ].join('\n'),
  'docs/architecture/elsewhere.md': '# Elsewhere\n\n[ESC-1](owner-decisions/01-escalations.md#esc-1--a-ruling-the-specification-carries) and [ESC-2](owner-decisions/01-escalations.md#esc-2--a-ruling-nobody-carries).\n',
  'apps/desktop/src/a.ts': '// docs/architecture/owner-decisions/01-escalations.md#esc-1--a-ruling-the-specification-carries ruled it.\nexport const a = 1;\n',
};

let root: string;

function write(at: string, files: Record<string, string>) {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(at, path)), { recursive: true });
    writeFileSync(join(at, path), text);
  }
}

const read = (path: string) => readFileSync(join(root, path), 'utf8');

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
  root = mkdtempSync(join(tmpdir(), 'archive-owner-decisions-'));
  write(root, FIXTURE);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('owner decisions — what qualifies', () => {
  it('starts from a fixture the link gate passes', () => {
    expect(checkRecord(root).problems).toEqual([]);
  });

  it('reads the identifiers a heading names, ranges expanded, and none it only mentions', () => {
    expect(headingIds('### ESC-22, ESC-24 and ESC-27 to ESC-31 — ruled 2026-09-02')).toEqual(['ESC-22', 'ESC-24', 'ESC-27', 'ESC-28', 'ESC-29', 'ESC-30', 'ESC-31']);
    expect(headingIds('### ESC-43 — domain 19 was never swept after ESC-8 and SR-1')).toEqual(['ESC-43']);
    expect(headingIds('### OQ-62 — a provider-reported cost, ruled')).toEqual([]);
    expect(idsIn('applied SR-1 to SR-3 and GD-4')).toEqual(['SR-1', 'SR-2', 'SR-3', 'GD-4']);
  });

  it('moves an entry ruled and carried by the specification, and leaves one ruled and carried by nobody', () => {
    const spec = specificationCarries(root);
    const entries = entriesOf(read(PART));
    const byId = (id: string) => entries.find((e: { ids: string[] }) => e.ids[0] === id);
    expect(isRuled(byId('ESC-1'))).toBe(true);
    expect(hasLanded(byId('ESC-1'), spec).landed).toBe(true);
    expect(isRuled(byId('ESC-2'))).toBe(true);
    expect(hasLanded(byId('ESC-2'), spec)).toEqual({ landed: false, evidence: ['ESC-2: no sentence of docs/spec/ carries it'] });
    expect(isRuled(byId('ESC-3'))).toBe(false);
    expect(hasLanded(byId('ESC-4'), spec).landed).toBe(true);
    expect(qualifying(root).map((q: { ids: string[] }) => q.ids.join(','))).toEqual(['ESC-1', 'ESC-4,ESC-5,ESC-7,ESC-8']);
  });

  it('reads a ruling the specification carries as a directive, by its back-pointer', () => {
    // eslint-disable-next-line rotaris/requirement-citations-resolve -- a made-up identifier in a fixture record
    write(root, { 'docs/spec/01-domain.md': `${read('docs/spec/01-domain.md')}\nREQ-X-2 is narrowed by PD-X-001.\n` });
    // eslint-disable-next-line rotaris/requirement-citations-resolve -- a made-up identifier in a fixture record
    const entry = { ids: ['ESC-2'], body: '**Ruled 2026-10-06:** the built behaviour is kept, by [`PD-X-001`](x.md).' };
    // eslint-disable-next-line rotaris/requirement-citations-resolve -- a made-up identifier in a fixture record
    expect(hasLanded(entry, specificationCarries(root))).toEqual({ landed: true, evidence: ['ESC-2: its ruling is PD-X-001, which the specification names'] });
  });

  it('reads the specification\'s archived text too: a ruling a withdrawn requirement\'s moved text carries has landed', () => {
    expect(specificationCarries(root).rulings.has('ESC-2')).toBe(false);
    write(root, { 'docs/archive/spec/01-domain.md': '# Archived — Domain\n\nThe round applied ESC-2 here before the requirement was withdrawn.\n' });
    expect(specificationCarries(root).rulings.get('ESC-2')).toMatch(/^docs\/archive\/spec\/01-domain\.md: The round applied ESC-2/);
  });
});

describe('owner decisions — the move', () => {
  it('moves the qualifying entries whole under their own anchors and leaves an index line for each', () => {
    const { moves } = migrate();
    expect(moves).toEqual([
      { kind: 'owner-decision', id: 'ESC-1', from: PART, to: ARCHIVE },
      { kind: 'owner-decision', id: 'ESC-4, ESC-5 and ESC-7 to ESC-8', from: PART, to: ARCHIVE },
    ]);
    expect(read(PART)).toBe(
      [
        '# Product-owner decisions on the architecture record — Escalations',
        '',
        'Part 1 of 1 of [the owner decisions](../owner-decisions.md), which indexes every part. Archived in ' +
          '[the archive](../../archive/architecture/owner-decisions/01-escalations.md), one index line each here: ESC-1; ESC-4, ESC-5 and ESC-7 to ESC-8.',
        '',
        '## Escalations — ruled 2026-08-31',
        '',
        'Delegated by the owner.',
        '',
        '- ESC-1 — a ruling the specification carries; ruled 2026-08-31; [archived](../../archive/architecture/owner-decisions/01-escalations.md#esc-1)',
        '',
        '### ESC-2 — a ruling nobody carries',
        '',
        '**Decided: accept the gap as specified.**',
        '',
        '### ESC-3 — raised and not ruled',
        '',
        "**Raised 2026-10-22, open — the owner's to rule.** Nothing is decided.",
        '',
        '- ESC-4, ESC-5 and ESC-7 to ESC-8 — ruled 2026-09-02; [archived](../../archive/architecture/owner-decisions/01-escalations.md#esc-4)',
        '',
        '---',
        '',
      ].join('\n'),
    );
    const archived = read(ARCHIVE);
    expect(archived.startsWith('# Archived owner decisions — Escalations\n\n')).toBe(true);
    expect(archived).toContain(
      [
        '<a id="esc-1"></a>',
        '',
        '### ESC-1 — a ruling the specification carries',
        '',
        '**Decided: preserve comments.** See [the spec](../../../spec/01-domain.md) and [ESC-2](../../../architecture/owner-decisions/01-escalations.md#esc-2--a-ruling-nobody-carries).',
      ].join('\n'),
    );
    expect(read('docs/architecture/owner-decisions.md')).toContain(
      '| [01](owner-decisions/01-escalations.md) | Escalations; ESC-1 — landed; ESC-2 — unlanded — archived in [the archive](../archive/architecture/owner-decisions/01-escalations.md): ESC-1; ESC-4, ESC-5 and ESC-7 to ESC-8 |',
    );
  });

  it('repoints a link to a moved heading, in the record and in the code, and leaves a link to one that stays', () => {
    migrate();
    expect(read('docs/architecture/elsewhere.md')).toContain('[ESC-1](../archive/architecture/owner-decisions/01-escalations.md#esc-1--a-ruling-the-specification-carries)');
    expect(read('docs/architecture/elsewhere.md')).toContain('[ESC-2](owner-decisions/01-escalations.md#esc-2--a-ruling-nobody-carries)');
    expect(read('apps/desktop/src/a.ts')).toContain('docs/archive/architecture/owner-decisions/01-escalations.md#esc-1--a-ruling-the-specification-carries');
    expect(checkRecord(root).problems).toEqual([]);
  });

  it('changes nothing on a second run, and --check is red before the move and green after', () => {
    expect(stillLive(root)).toEqual([
      `ESC-1 in ${PART} (a ruled escalation the specification carries)`,
      `ESC-4, ESC-5, ESC-7, ESC-8 in ${PART} (a ruled escalation the specification carries)`,
    ]);
    migrate();
    const before = snapshot(root);
    const again = plan(root);
    expect(again.moves).toEqual([]);
    expect(again.changed.size).toBe(0);
    expect(snapshot(root)).toEqual(before);
    expect(stillLive(root)).toEqual([]);
  });

  it('moves a ruling the specification absorbs later to the end of the archive', () => {
    migrate();
    write(root, { 'docs/spec/01-domain.md': `${read('docs/spec/01-domain.md')}\nESC-2 was applied 2026-11-01.\n` });
    const { moves } = migrate();
    expect(moves).toEqual([{ kind: 'owner-decision', id: 'ESC-2', from: PART, to: ARCHIVE }]);
    expect(read(ARCHIVE).indexOf('### ESC-2')).toBeGreaterThan(read(ARCHIVE).indexOf('### ESC-4'));
    expect(read(PART)).toContain('one index line each here: ESC-1; ESC-2; ESC-4, ESC-5 and ESC-7 to ESC-8.');
    expect(checkRecord(root).problems).toEqual([]);
  });

  it('writes an index line that says "ruled" once', () => {
    expect(indexLine('ESC-37, ESC-38', 'the two, ruled', '2026-09-27', 'a.md#esc-37')).toBe('- ESC-37, ESC-38 — the two; ruled 2026-09-27; [archived](a.md#esc-37)');
    expect(indexLine('ESC-9', 'session retention', undefined, 'a.md#esc-9')).toBe('- ESC-9 — session retention; ruled; [archived](a.md#esc-9)');
  });
});
