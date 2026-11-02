/**
 * The repository's security policy and code owners (R-091; `docs/architecture/hardening.md` §3.5 row 10, the OpenSSF
 * Scorecard's Security-Policy check). `SECURITY.md` at the root is what GitHub shows a reporter; this holds the parts a
 * reporter acts on: the private route, the supported line, the answer window, the record it points at, and the
 * clean-room note. `.github/CODEOWNERS` names an owner GitHub can request a review from.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..');
const read = (path: string): string => readFileSync(join(root, path), 'utf8');

describe('SECURITY.md', () => {
  const policy = existsSync(join(root, 'SECURITY.md')) ? read('SECURITY.md') : '';

  it('exists at the root, where GitHub looks for it', () => {
    expect(policy.length).toBeGreaterThan(0);
  });

  it('routes a report to a private security advisory on this repository, never a public issue', () => {
    expect(policy).toContain('https://github.com/Concrete-Dynamics/Rotaris/security/advisories/new');
    expect(policy).toMatch(/do\s+not open a public issue/);
  });

  it('names the supported versions, the answer window, and that there is no bounty', () => {
    expect(policy).toMatch(/## Supported versions/);
    expect(policy).toMatch(/latest release line/);
    expect(policy).toMatch(/Acknowledgement within \d+ days/);
    expect(policy).toMatch(/no bug bounty/);
  });

  it('points at the hardening record and the dependency-alert readings, and both links resolve', () => {
    const targets = [...policy.matchAll(/\]\(((?:docs\/)[^)#]+)\)/g)].map((m) => m[1] ?? '');
    expect(targets).toEqual(expect.arrayContaining(['docs/architecture/hardening.md', 'docs/architecture/dependency-alerts/']));
    for (const target of targets) expect(existsSync(join(root, target)), target).toBe(true);
    expect(statSync(join(root, 'docs/architecture/dependency-alerts')).isDirectory()).toBe(true);
  });

  it('asks a reporter not to quote the implementation this one replaces (the clean-room boundary)', () => {
    expect(policy).toMatch(/clean-room/);
    expect(policy).toMatch(/must therefore \*\*not quote/);
    expect(policy).toContain('AGENTS.md');
  });
});

describe('.github/CODEOWNERS', () => {
  const rules = existsSync(join(root, '.github', 'CODEOWNERS'))
    ? read('.github/CODEOWNERS')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith('#'))
    : [];

  it('names an owner for every path', () => {
    expect(rules.some((rule) => rule.split(/\s+/)[0] === '*')).toBe(true);
  });

  it('names users or teams only, never the organisation itself, which GitHub does not accept', () => {
    const owners = rules.flatMap((rule) => rule.split(/\s+/).slice(1));
    expect(owners.length).toBeGreaterThan(0);
    for (const owner of owners) {
      expect(owner, owner).toMatch(/^@[A-Za-z0-9-]+(?:\/[A-Za-z0-9._-]+)?$/);
      expect(owner, owner).not.toBe('@Concrete-Dynamics');
    }
  });
});
