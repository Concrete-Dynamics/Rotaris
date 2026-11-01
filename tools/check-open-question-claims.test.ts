/**
 * The gate over claims about open questions, against the tree and over fixtures for what it must tell apart: a settled
 * question called open fails, an open or deferred one passes, history that says it was ruled passes, a settled question's
 * answer called the build's reading fails unless its ruling stands beside it, and a question said to be raised fails
 * unless its sentence names one. Acceptance finding F16 of finacc3 (2026-10-06):
 * `docs/defects/fixed/records-and-code-comments-describe-ruled-questions-as-open-and-cite-questions-never-raised.md`.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error — the tools directory is plain ESM, run by node without a build step.
import { checkTree, claimsIn, entriesOf, entryState, numbersOf, questionStates } from './check-open-question-claims.mjs';

const RECORD = [
  '**OQ-1 — Decision closed, 2026-09-07.** The queue is scoped.',
  '',
  '**OQ-2 — A question the owner ruled?** *(REQ-X-1. ~~Open.~~ Ruled 2026-10-06.)*',
  '',
  '**Ruled 2026-10-06 by the owner:** confirmed as built.',
  '',
  '**OQ-3 — A question still open?** *(REQ-X-2. Open, the owner\'s.)*',
  '',
  '**OQ-4 — A question the owner deferred.**',
  '',
  '**Deferred 2026-10-06 by the owner.**',
  '',
  '**OQ-5 — Another ruled one?** *(REQ-X-3.)*',
  '',
  '**Ruled 2026-10-06 by the owner:** as recommended.',
  '',
  '## Escalations',
  '',
  'Text after a heading belongs to no question, RULED or not.',
  '',
  '**OQ-6 — Resolved.** See above.',
].join('\n');

type Claim = { line: number; kind: 'open' | 'reading' | 'unraised'; numbers: number[]; text: string };

describe('check-open-question-claims (F16)', () => {
  it('no claim in the code or the record that describes the build is refuted by the open-questions record', () => {
    expect(checkTree(join(import.meta.dirname, '..'))).toEqual([]);
  });

  it('reads each question\'s state from its entry: ruled, closed and resolved are settled, a deferral is deferred, else open', () => {
    const states = questionStates(RECORD);
    expect(Object.fromEntries(states)).toEqual({ 1: 'settled', 2: 'settled', 3: 'open', 4: 'deferred', 5: 'settled', 6: 'settled' });
  });

  it('expands a range and keeps a list', () => {
    expect(numbersOf('OQ-114 to OQ-116')).toEqual([114, 115, 116]);
    expect(numbersOf('OQ-58 and OQ-59')).toEqual([58, 59]);
    expect(numbersOf('[OQ-67](open-questions.md)')).toEqual([67]);
  });

  describe('over fixtures', () => {
    const states = questionStates(RECORD);
    const claims = (text: string): Claim[] => claimsIn(text, states);

    it('a settled question called open fails, in each form the record and the code used', () => {
      const text = [
        'no proxy by construction (OQ-2 stays open).',
        '',
        'OQ-5 to OQ-6 are open against the live runs\' figures.',
        '',
        '| Skills | built; OQ-2 open against its reach from Settings | §2 |',
        '| Next | **ruled 2026-09-27** | §2 |',
        '',
        ' * so the pass stays bounded — the build\'s reading, asked as OQ-5.',
        '',
        '- *The open question.* [OQ-2](open-questions.md): the listing.',
        '',
        'carried as open question **OQ-1**.',
        '',
        'the note stays open for residuals 1 and 3 (OQ-5). The view says so.',
      ].join('\n');
      expect(claims(text).map((c) => [c.line, c.kind, c.numbers])).toEqual([
        [1, 'open', [2]],
        [3, 'open', [5, 6]],
        [5, 'open', [2]],
        [8, 'open', [5]],
        [10, 'open', [2]],
        [12, 'open', [1]],
        [14, 'open', [5]],
      ]);
    });

    it('an open or deferred question may be called open, and history that says it was ruled passes', () => {
      const text = [
        'OQ-3 stays open, and OQ-4 is open too.',
        '',
        '[OQ-2](open-questions.md) stays open for it — *ruled 2026-10-06 as built*.',
        '',
        '~~OQ-5 is open and blocks the unscoped half~~ — withdrawn since.',
        '',
        'the build\'s reading of OQ-2 while it was open.',
      ].join('\n');
      expect(claims(text)).toEqual([]);
    });

    it('a settled question\'s answer called the build\'s reading fails unless its ruling stands beside it (repair round 1)', () => {
      const text = [
        'draws them on a crash-left session too (OQ-2\'s reading).',
        '',
        ' * the tokens item (OQ-5\'s build reading).',
        '',
        'which persona is drawn; this is the build\'s reading, recorded beside OQ-1. Until then it read the first.',
        '',
        'drawn as built (OQ-2\'s reading, confirmed 2026-10-06 by R-071).',
        '',
        'Confirmed 2026-10-06: OQ-5\'s reading holds.',
        '',
        ' * Until 2026-10-06 this read: "nothing is re-sent (OQ-2\'s reading)".',
        '',
        'the open one (OQ-3\'s reading) and the deferred one (OQ-4\'s reading) are the build\'s to proceed under.',
        '',
        'a side reading (OQ-5\'s reading), not ruled.',
        '',
        'drawn as the latest root (OQ-2\'s reading). Until 2026-10-01 the first root was drawn.',
      ].join('\n');
      expect(claims(text).map((c) => [c.line, c.kind, c.numbers])).toEqual([
        [1, 'reading', [2]],
        [3, 'reading', [5]],
        [5, 'reading', [1]],
        [15, 'reading', [5]],
        [17, 'reading', [2]],
      ]);
    });

    it('a bare "closed" after an open claim is no ruling', () => {
      expect(claims('OQ-2 stays open; the socket is closed after use.').map((c) => [c.line, c.kind, c.numbers])).toEqual([[1, 'open', [2]]]);
    });

    it('a question said to be raised fails unless its sentence names one', () => {
      const text = [
        '/**',
        ' * The decision taken here. The tension is raised as an open question rather than',
        ' * resolved by silently storing the body twice.',
        ' *',
        ' * The canonical name is recorded. Raised as an open question (OQ-3) rather than settled here.',
        ' */',
      ].join('\n');
      expect(claims(text).map((c) => [c.line, c.kind])).toEqual([[2, 'unraised']]);
    });
  });
});

/*
 * The entries the archive's migration moves are the entries this gate reads (`entriesOf`, `entryState`: one rule), and
 * a question moved to `docs/archive/` stays settled here (R-092).
 */
describe('check-open-question-claims — the entries, and the archive', () => {
  it('reads an entry with the anchors above it, up to the next entry, escalation, heading or index line', () => {
    const text = [
      '<a id="oq-1"></a>',
      '',
      '**OQ-1 — One?** Asked.',
      '',
      '**OQ-51** (a bold mention opening a line of prose is no entry) and more.',
      '',
      '<a id="oq-2"></a>',
      '**OQ-2 — Two?** Asked.',
      '',
      '- OQ-3 — Three; ruled 2026-10-06; [archived](../../archive/x.md#oq-3)',
      '',
      '**OQ-4 — Four?** Asked.',
      '',
      '**ESC-9 — An escalation.** **Ruled 2026-10-06.**',
      '',
      '**OQ-5 — Five?** Asked.',
      '## A heading',
      'After it.',
    ].join('\n');
    expect(entriesOf(text).map((e: { n: number; anchor: number; start: number; end: number }) => [e.n, e.anchor, e.start, e.end])).toEqual([
      [1, 0, 2, 5],
      [2, 6, 7, 8],
      [4, 11, 11, 12],
      [5, 15, 15, 16],
    ]);
    // An index line stands between OQ-2 and OQ-4 and an escalation after OQ-4: neither lends its "ruled" to them.
    expect(Object.fromEntries(questionStates(text))).toEqual({ 1: 'open', 2: 'open', 4: 'open', 5: 'open' });
  });

  it('reads one entry\'s state by the same rule the migration moves by', () => {
    expect(entryState('**OQ-1 — x** **Deferred 2026-10-06**, ruled later? **Ruled 2026-10-07.**')).toBe('deferred');
    expect(entryState('**OQ-1 — x** **Ruled 2026-10-07.**')).toBe('settled');
    expect(entryState('**OQ-1 — x** Asked.')).toBe('open');
  });

  it('holds a question archived under docs/archive/ settled, so a claim that calls it open fails', () => {
    const root = mkdtempSync(join(tmpdir(), 'oq-claims-archive-'));
    const put = (path: string, text: string) => {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    };
    try {
      put('docs/architecture/open-questions.md', '# Open questions\n');
      put('docs/architecture/open-questions/01-part.md', '# Part\n\n**OQ-1 — Open?** Asked.\n\n- OQ-2 — Ruled; ruled 2026-10-06; [archived](../../archive/architecture/open-questions/01-part.md#oq-2)\n');
      put('docs/archive/architecture/open-questions/01-part.md', '# Archived\n\n<a id="oq-2"></a>\n\n**OQ-2 — Ruled?** **Ruled 2026-10-06 by the owner:** as built.\n');
      put('apps/desktop/src/a.ts', '// OQ-1 stays open.\n// OQ-2 stays open.\n');
      expect(checkTree(root).map((p: { file: string; line: number; numbers: number[] }) => [p.file, p.line, p.numbers])).toEqual([['apps/desktop/src/a.ts', 2, [2]]]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
