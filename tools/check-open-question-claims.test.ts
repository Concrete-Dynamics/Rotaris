/**
 * The gate over claims about open questions, against the tree and over fixtures for what it must tell apart: a settled
 * question called open fails, an open or deferred one passes, history that says it was ruled passes, and a question said
 * to be raised fails unless its sentence names one. Acceptance finding F16 of finacc3 (2026-10-06):
 * `docs/defects/fixed/records-and-code-comments-describe-ruled-questions-as-open-and-cite-questions-never-raised.md`.
 */
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error — the tools directory is plain ESM, run by node without a build step.
import { checkTree, claimsIn, numbersOf, questionStates } from './check-open-question-claims.mjs';

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

type Claim = { line: number; kind: 'open' | 'unraised'; numbers: number[]; text: string };

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
