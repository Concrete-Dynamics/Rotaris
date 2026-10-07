import { describe, expect, it } from 'vitest';
import { fileWriters, scopeWithoutWriterReason, validateWriteScope, WriteClaims, writeScopeBlock, writesFiles } from './write-scope.js';
import { BUILT_IN_PERSONAS, type Persona, type PersonaResolver } from './personas.js';

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

describe('PD-TOOLS-006 revision 3 (OQ-112) — a write scope is for a persona that can write files (REQ-TOOLS-152, REQ-TOOLS-006)', () => {
  const p = (name: string, tools: readonly string[], extra: Partial<Persona> = {}): Persona => ({ name, tools, coordinatorOnly: false, readOnly: false, canPublishArtifacts: false, systemPrompt: '', implementer: false, ...extra });

  it('a persona writes files when it would be granted write_file, haet_edit or haet after the controls', () => {
    expect(writesFiles(BUILT_IN_PERSONAS['codebase-analyst'])).toBe(false);
    expect(writesFiles(BUILT_IN_PERSONAS['docs-writer'])).toBe(true);
    expect(writesFiles(p('editor', ['read_file', 'haet']))).toBe(true);
    expect(writesFiles(p('writer', ['write_file']))).toBe(true);
    // REQ-TOOLS-006: coordinator_only removes all three, and read_only keeps only the read-only class, which holds none.
    expect(writesFiles(BUILT_IN_PERSONAS.orchestrator)).toBe(false);
    expect(writesFiles(p('locked', ['read_file', 'write_file'], { readOnly: true }))).toBe(false);
    // The directive's stated cost: a tool the claim does not fence is not a file-writing tool here.
    expect(writesFiles(BUILT_IN_PERSONAS.verifier)).toBe(false);
  });

  it('REQ-TOOLS-006 (4) (OQ-145): the tool_restrictions entry naming the persona, in its own map or its parentPersona\'s, is applied like the other controls', () => {
    // Its own map: an entry naming another role leaves it whole; the entry naming it is an allowed-tool list.
    expect(writesFiles(p('writer', ['read_file', 'write_file'], { toolRestrictions: { tester: ['read_file'] } }))).toBe(true);
    expect(writesFiles(p('writer', ['read_file', 'write_file'], { toolRestrictions: { writer: ['read_file'] } }))).toBe(false);
    // An alias in the list names its tool.
    expect(writesFiles(p('editor', ['haet_edit'], { toolRestrictions: { editor: ['haet'] } }))).toBe(true);
    // The parent agent's map, by the entry naming the persona.
    const lead = { toolRestrictions: { writer: ['read_file'] } };
    expect(writesFiles(p('writer', ['read_file', 'write_file']), lead)).toBe(false);
    expect(writesFiles(p('other', ['read_file', 'write_file']), lead)).toBe(true);
    // The writers the refusal names are the ones this parent agent lets write.
    expect(fileWriters(undefined, { toolRestrictions: { 'coding-agent': ['read_file'], tester: ['read_file', 'write_file'] } })).toEqual(['tester', 'docs-writer', 'refactorer']);
  });

  it("the catalogue's writers: the built-in table in its order, or the configured known roles resolved", () => {
    expect(fileWriters(undefined)).toEqual(['coding-agent', 'tester', 'docs-writer', 'refactorer']);
    const table: Record<string, Persona> = { orchestrator: BUILT_IN_PERSONAS.orchestrator, scribe: p('scribe', ['haet_edit']), 'codebase-analyst': BUILT_IN_PERSONAS['codebase-analyst'], frozen: p('frozen', ['write_file'], { readOnly: true }) };
    const resolver: PersonaResolver = { resolve: (n) => (table[n] ? { persona: table[n]!, alias: null } : null), knownRoles: () => Object.keys(table) };
    expect(fileWriters(resolver)).toEqual(['scribe']);
    expect(fileWriters({ ...resolver, knownRoles: () => ['codebase-analyst'] })).toEqual([]);
  });

  it('the reason says the persona cannot write files and names those that can, where there are any', () => {
    expect(scopeWithoutWriterReason('codebase-analyst', ['coding-agent', 'docs-writer'])).toBe(
      "write_scope was given to 'codebase-analyst', which cannot write files: it holds no file-writing tool (write_file, haet_edit). The delegation was not started. Personas that can write files: coding-agent, docs-writer. Delegate the writing to a persona that can, or delegate to 'codebase-analyst' without a write_scope.",
    );
    expect(scopeWithoutWriterReason('librarian', [])).not.toContain('Personas that can write files');
  });
});
