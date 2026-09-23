import { describe, expect, it } from 'vitest';
import { validateWriteScope, WriteClaims, writeScopeBlock } from './write-scope.js';

describe('PD-TOOLS-006 — the write_scope argument', () => {
  it('rejects an empty pattern, an absolute one and one reaching outside the root, naming the pattern', () => {
    expect(validateWriteScope([])).toEqual({ ok: true, patterns: [] });
    expect(validateWriteScope(['src/**', 'docs/*.md'])).toEqual({ ok: true, patterns: ['src/**', 'docs/*.md'] });
    expect(validateWriteScope(['src/**', ''])).toMatchObject({ ok: false, reason: expect.stringContaining('empty pattern') });
    expect(validateWriteScope(['   '])).toMatchObject({ ok: false });
    for (const absolute of ['/etc/**', '\\\\server\\share\\x', 'C:/repo/**', 'c:\\repo']) {
      expect(validateWriteScope([absolute])).toEqual({ ok: false, reason: `write_scope pattern '${absolute}' is absolute; write it relative to the workspace root.` });
    }
    for (const escaping of ['..', '../x/**', 'src/../../x', 'a\\..\\..\\b']) {
      expect(validateWriteScope([escaping])).toEqual({ ok: false, reason: `write_scope pattern '${escaping}' reaches outside the workspace root.` });
    }
    // Climbing back down inside the root stays inside it.
    expect(validateWriteScope(['src/../lib/**'])).toEqual({ ok: true, patterns: ['src/../lib/**'] });
  });
});

describe('PD-TOOLS-006 — claims', () => {
  const live = new Set(['bg_aaaaaaaa', 'bg_bbbbbbbb']);
  const isLive = (id: string) => live.has(id);
  const none = () => false;

  it('a live claim refuses a path its patterns match, case-insensitively, and names the pattern as written', () => {
    const claims = new WriteClaims();
    claims.claim('bg_aaaaaaaa', 'api', 'coding-agent', ['src/api/**', 'src/../lib/*.ts']);
    expect(claims.refusalFor('src/api/users/x.ts', isLive, none)).toEqual({ taskId: 'bg_aaaaaaaa', canonicalName: 'api', persona: 'coding-agent', pattern: 'src/api/**' });
    expect(claims.refusalFor('SRC/Api/x.ts', isLive, none)?.pattern).toBe('src/api/**');
    expect(claims.refusalFor('lib/a.ts', isLive, none)?.pattern).toBe('src/../lib/*.ts');
    expect(claims.refusalFor('src/ui/x.ts', isLive, none)).toBeNull();
  });

  it('the child accepted first holds an overlap, and the holder alone decides — its own descendants may write there', () => {
    const claims = new WriteClaims();
    claims.claim('bg_aaaaaaaa', 'first', 'coding-agent', ['src/**']);
    claims.claim('bg_bbbbbbbb', 'second', 'tester', ['src/tests/**']);
    expect(claims.refusalFor('src/tests/a.test.ts', isLive, none)?.canonicalName).toBe('first');
    // The second child writing into the overlap is refused by the first; the first writing there is not refused by the second.
    expect(claims.refusalFor('src/tests/a.test.ts', isLive, (id) => id === 'bg_bbbbbbbb')?.canonicalName).toBe('first');
    expect(claims.refusalFor('src/tests/a.test.ts', isLive, (id) => id === 'bg_aaaaaaaa')).toBeNull();
  });

  it('a claim lapses when its child is no longer live, and a child without a scope claims nothing', () => {
    const claims = new WriteClaims();
    claims.claim('bg_aaaaaaaa', 'api', 'coding-agent', ['src/**']);
    claims.claim('bg_bbbbbbbb', 'plain', 'coding-agent', []);
    expect(claims.refusalFor('src/a.ts', (id) => id !== 'bg_aaaaaaaa', none)).toBeNull();
    expect(claims.live(isLive).map((c) => c.canonicalName)).toEqual(['api']);
    claims.release('bg_aaaaaaaa');
    expect(claims.refusalFor('src/a.ts', isLive, none)).toBeNull();
  });
});

describe('PD-TOOLS-006 — the disclosure block', () => {
  it('lists the own scope, then the others under their canonical names, marking an ancestor; nothing when there is nothing', () => {
    expect(writeScopeBlock(undefined)).toBe('');
    expect(writeScopeBlock({ own: [], others: [] })).toBe('');
    const block = writeScopeBlock({
      own: ['src/ui/**'],
      others: [
        { taskId: 'bg_aaaaaaaa', canonicalName: 'api', patterns: ['src/api/**', 'tests/api/**'], heldByAncestor: false },
        { taskId: 'bg_bbbbbbbb', canonicalName: 'lead', patterns: ['src/**'], heldByAncestor: true },
      ],
    });
    expect(block.split('\n')).toEqual([
      'Write scopes:',
      "- Yours: 'src/ui/**'. Other agents of this run may not write into these paths while you run; you are not limited to them.",
      '- Held by other agents that were running when you started. write_file and haet_edit refuse a write into these paths while their holder runs, unless the holder is an agent you work under:',
      "  - api: 'src/api/**', 'tests/api/**'",
      "  - lead: 'src/**' (you work under this agent, so its scope does not fence you)",
    ]);
  });
});
