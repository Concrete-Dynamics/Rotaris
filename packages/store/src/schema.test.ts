import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CURRENT_SCHEMA_VERSION, MIGRATIONS, type Migration } from './schema.js';

/**
 * Hardening C2 (`docs/architecture/hardening.md` §3.3 row 3; REQ-SESSION-013, REQ-SESSION-038): a shipped migration is
 * never edited, and the rule is held by its SQL text, not only by the `to` ladder `store.test.ts` asserts. Every shipped
 * migration's SQL, normalised to LF, has its SHA-256 committed in `migrations.sha256.json` beside `schema.ts`, keyed by
 * `to`. This test recomputes each one and never writes the manifest: an edited migration fails with "has shipped", a new
 * one fails with the exact line to append, so appending is a two-line change and editing is not one at all.
 */
const MANIFEST_FILE = 'packages/store/src/migrations.sha256.json';
const manifest = JSON.parse(readFileSync(fileURLToPath(new URL('./migrations.sha256.json', import.meta.url)), 'utf8')) as Record<string, string>;

/** The digest the manifest holds: the migration's SQL with every line ending made LF, so a checkout's endings never move it. */
function migrationDigest(sql: string): string {
  return createHash('sha256').update(sql.replace(/\r\n?/g, '\n'), 'utf8').digest('hex');
}

/** Every way `migrations` and `rows` disagree, each a sentence an author can act on; none when they agree. */
function manifestProblems(migrations: readonly Migration[], rows: Readonly<Record<string, string>>): string[] {
  const problems: string[] = [];
  const named = new Set<string>();
  for (const m of migrations) {
    const key = String(m.to);
    named.add(key);
    const digest = migrationDigest(m.sql);
    const held = rows[key];
    if (held === undefined) {
      problems.push(`migration v${key} has no row in ${MANIFEST_FILE}: append its hash with it, as the line  "${key}": "${digest}"`);
    } else if (held !== digest) {
      problems.push(
        `migration v${key} has shipped and must not change: its SQL now hashes to ${digest}, ${MANIFEST_FILE} holds ${held}. ` +
          'Append a new migration to MIGRATIONS instead (.claude/rules/store.md)',
      );
    }
  }
  for (const key of Object.keys(rows)) {
    if (!named.has(key)) problems.push(`${MANIFEST_FILE} holds v${key}, which no migration in MIGRATIONS has: a shipped migration was removed or renumbered`);
  }
  return problems;
}

describe('the shipped migrations are immutable (hardening C2; REQ-SESSION-013, REQ-SESSION-038)', () => {
  it('holds one SHA-256 per migration, and every shipped migration still hashes to it', () => {
    expect(manifestProblems(MIGRATIONS, manifest)).toEqual([]);
    // The manifest's rows are the ladder itself, and `CURRENT_SCHEMA_VERSION` stays derived from its last entry.
    expect(Object.keys(manifest).map(Number)).toEqual(MIGRATIONS.map((m) => m.to));
    expect(CURRENT_SCHEMA_VERSION).toBe(MIGRATIONS[MIGRATIONS.length - 1]!.to);
  });

  it('fails an edit to a shipped migration’s SQL, however small, and says it shipped', () => {
    for (const at of [0, 6, MIGRATIONS.length - 1]) {
      const edited = MIGRATIONS.map((m, i) => (i === at ? { ...m, sql: `${m.sql} ` } : m));
      const problems = manifestProblems(edited, manifest);
      expect(problems).toHaveLength(1);
      expect(problems[0]).toMatch(new RegExp(`^migration v${MIGRATIONS[at]!.to} has shipped and must not change`));
    }
    // A changed statement, not only whitespace.
    const target = MIGRATIONS.find((m) => m.to === 35)!;
    const rewritten = MIGRATIONS.map((m) => (m === target ? { ...m, sql: m.sql.replace("DEFAULT '[]'", "DEFAULT '{}'") } : m));
    expect(rewritten.find((m) => m.to === 35)!.sql).not.toBe(target.sql);
    expect(manifestProblems(rewritten, manifest)).toEqual([expect.stringMatching(/^migration v35 has shipped and must not change/)]);
  });

  it('fails a new migration with no row, naming the exact line to append', () => {
    const next: Migration = { to: CURRENT_SCHEMA_VERSION + 1, sql: '\n      ALTER TABLE sessions ADD COLUMN x TEXT;\n    ' };
    const problems = manifestProblems([...MIGRATIONS, next], manifest);
    expect(problems).toEqual([`migration v${next.to} has no row in ${MANIFEST_FILE}: append its hash with it, as the line  "${next.to}": "${migrationDigest(next.sql)}"`]);
    // Appending that line is all it takes.
    expect(manifestProblems([...MIGRATIONS, next], { ...manifest, [String(next.to)]: migrationDigest(next.sql) })).toEqual([]);
  });

  it('fails a migration removed or renumbered under its row', () => {
    expect(manifestProblems(MIGRATIONS.slice(0, -1), manifest)).toEqual([expect.stringMatching(new RegExp(`holds v${CURRENT_SCHEMA_VERSION}, which no migration`))]);
  });

  it('hashes the SQL with its line endings normalised, so a CRLF checkout reads the same digest', () => {
    const sql = MIGRATIONS[0]!.sql;
    expect(migrationDigest(sql.replace(/\n/g, '\r\n'))).toBe(migrationDigest(sql));
    expect(migrationDigest(sql)).toBe(manifest['1']);
  });
});
