/**
 * Every portable skill under `.agents/skills/` is canonical, and a Claude session reaches it as a skill only through a thin
 * router at `.claude/skills/<name>/SKILL.md` (AGENTS.md, "Repository UI skills"). This pins that each one has its router,
 * that the router carries the skill's name, a description and the skill's own argument hint, and that it sends the
 * reader to the canonical file. run-autopsy had none until 2026-10-13
 * (`docs/defects/fixed/the-run-autopsy-skill-has-no-claude-skills-router.md`).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..');
const portable = join(root, '.agents', 'skills');
const routers = join(root, '.claude', 'skills');

const frontmatter = (file: string): Record<string, string> => {
  const text = readFileSync(file, 'utf8');
  const block = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!block) return {};
  const fields: Record<string, string> = {};
  for (const line of block[1].split('\n')) {
    const m = /^([a-z-]+):\s*(.*)$/.exec(line);
    if (m) fields[m[1]] = m[2];
  }
  return fields;
};

const skills = readdirSync(portable, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(portable, d.name, 'SKILL.md')))
  .map((d) => d.name);

describe('the portable skills and their .claude/skills routers', () => {
  it('finds the portable skills', () => {
    expect(skills).toContain('run-autopsy');
    expect(skills).toContain('orchestrated-build');
  });

  it.each(skills)('%s has a router that names it and points at the canonical file', (name) => {
    const router = join(routers, name, 'SKILL.md');
    expect(existsSync(router), `.claude/skills/${name}/SKILL.md is missing`).toBe(true);
    const own = frontmatter(join(portable, name, 'SKILL.md'));
    const routed = frontmatter(router);
    expect(routed.name).toBe(name);
    expect(routed.description, 'a router describes the skill, so a session can choose it').toBeTruthy();
    expect(routed['argument-hint']).toBe(own['argument-hint']);
    expect(readFileSync(router, 'utf8')).toContain(`.agents/skills/${name}/SKILL.md`);
  });
});
