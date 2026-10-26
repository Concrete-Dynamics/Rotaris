/**
 * The agent configuration has one copy of everything (AGENTS.md, "Agent harnesses — one set of files"). The rules are
 * the root `AGENTS.md`, which Claude Code and Codex both load; the skills are `.agents/skills/<name>/`, which Codex
 * discovers and Claude Code 2.1.310 does not, so Claude reaches each through a router at `.claude/skills/<name>/SKILL.md`;
 * the path-scoped rules are `.claude/rules/`, which only Claude Code loads by path, so `AGENTS.md` indexes them.
 *
 * This pins what keeps that from drifting:
 * - every portable skill has its router, and the router's `name`, `description` and `argument-hint` are the canonical
 *   file's own and it points at that file (run-autopsy had none until 2026-10-13,
 *   `docs/defects/fixed/the-run-autopsy-skill-has-no-claude-skills-router.md`; this file was `skill-routers.test.ts`
 *   until 2026-10-26, which pinned the router but let its description differ);
 * - a router carries no instructions of its own, and no router stands without a canonical skill;
 * - the root `CLAUDE.md` is the single line `@AGENTS.md`: Claude Code skips `AGENTS.md` whenever it finds a `CLAUDE.md`
 *   (the root or any directory above it, as on the Linux agent host), and the import is what still loads it;
 * - every path-scoped rule is named in `AGENTS.md`'s index, for the harnesses that do not load them;
 * - `AGENTS.md` stays under 32 KiB, the part of it Codex reads (`project_doc_max_bytes`'s default).
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..');
const portable = join(root, '.agents', 'skills');
const routers = join(root, '.claude', 'skills');
const rules = join(root, '.claude', 'rules');
const agentsMd = join(root, 'AGENTS.md');

const frontmatter = (file: string): { fields: Record<string, string>; body: string } => {
  const text = readFileSync(file, 'utf8');
  const block = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!block) return { fields: {}, body: text };
  const fields: Record<string, string> = {};
  for (const line of block[1].split('\n')) {
    const m = /^([a-z-]+):\s*(.*)$/.exec(line);
    if (m) fields[m[1]] = m[2];
  }
  return { fields, body: text.slice(block[0].length) };
};

const skillDirs = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(dir, d.name, 'SKILL.md')))
    .map((d) => d.name);

const skills = skillDirs(portable);

describe('the portable skills and their .claude/skills routers', () => {
  it('finds the portable skills', () => {
    expect(skills).toContain('run-autopsy');
    expect(skills).toContain('orchestrated-build');
  });

  it.each(skills)('%s has a router that carries the canonical fields and points at the canonical file', (name) => {
    const router = join(routers, name, 'SKILL.md');
    expect(existsSync(router), `.claude/skills/${name}/SKILL.md is missing`).toBe(true);
    const own = frontmatter(join(portable, name, 'SKILL.md')).fields;
    const routed = frontmatter(router);
    expect(routed.fields.name).toBe(name);
    expect(routed.fields.description, 'a router describes the skill in the canonical words').toBe(own.description);
    expect(routed.fields['argument-hint']).toBe(own['argument-hint']);
    expect(routed.body).toContain(`.agents/skills/${name}/SKILL.md`);
  });

  it.each(skills)('%s: its router is a pointer, with no instructions of its own', (name) => {
    const body = frontmatter(join(routers, name, 'SKILL.md')).body.trim();
    expect(body.split('\n'), 'a router body is one line').toHaveLength(1);
    expect(readdirSync(join(routers, name)), 'a router directory holds SKILL.md alone').toEqual(['SKILL.md']);
  });

  it('no router stands without a canonical skill', () => {
    expect(skillDirs(routers).sort()).toEqual([...skills].sort());
  });
});

describe('the rules have one home', () => {
  it('has a root CLAUDE.md that only imports AGENTS.md, so it holds no rule of its own', () => {
    const claudeMd = join(root, 'CLAUDE.md');
    expect(existsSync(claudeMd), 'without it a CLAUDE.md above the checkout hides AGENTS.md from Claude Code').toBe(true);
    expect(readFileSync(claudeMd, 'utf8').trim()).toBe('@AGENTS.md');
  });

  it('keeps AGENTS.md inside the 32 KiB Codex reads', () => {
    expect(statSync(agentsMd).size).toBeLessThan(32 * 1024);
  });

  it('indexes every path-scoped rule in AGENTS.md', () => {
    const text = readFileSync(agentsMd, 'utf8');
    const files = readdirSync(rules).filter((f) => f.endsWith('.md'));
    expect(files.length).toBeGreaterThan(1);
    for (const file of files) expect(text, `AGENTS.md does not index .claude/rules/${file}`).toContain(`\`.claude/rules/${file}\``);
  });
});
