import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { instructionFiles, INSTRUCTION_FILE_NAMES } from './snapshot.js';
// The machine-wide base follows the skills ladder's own predicate (REQ-WORKSPACE-051), imported from there.
import { hasEtcHierarchy } from './skills/roots.js';

const made: string[] = [];
const dir = (prefix: string): string => {
  const d = mkdtempSync(join(tmpdir(), prefix));
  made.push(d);
  return d;
};
afterEach(() => { for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true }); });

/** An isolated discovery env: a scratch global dir and a scratch home holding no files. */
const isolated = () => ({ globalDir: dir('rotaris-instructions-global-'), home: dir('rotaris-instructions-home-'), platform: 'linux' as const });

describe('PD-WORKSPACE-002 — the Instructions inventory', () => {
  it('lists nothing without a workspace, and nothing in a workspace that has no file', () => {
    const env = isolated();
    expect(instructionFiles('', env)).toEqual([]);
    expect(instructionFiles('   ', env)).toEqual([]);
    expect(instructionFiles(dir('rotaris-instructions-'), env)).toEqual([]);
  });

  it('lists the workspace files where they exist, in discovery order, by absolute path', () => {
    const env = isolated();
    const root = dir('rotaris-instructions-');
    writeFileSync(join(root, 'AGENTS.override.md'), 'override\n');
    expect(instructionFiles(root, env)).toEqual([
      { id: 'workspace:AGENTS.override.md', name: 'AGENTS.override.md', path: join(root, 'AGENTS.override.md'), source: 'workspace' },
    ]);
    writeFileSync(join(root, 'AGENTS.md'), 'standing\n');
    writeFileSync(join(root, 'CLAUDE.md'), 'claude\n');
    writeFileSync(join(root, 'CLAUDE.override.md'), 'claude override\n');
    expect(instructionFiles(root, env)).toEqual([
      { id: 'workspace:AGENTS.md', name: 'AGENTS.md', path: join(root, 'AGENTS.md'), source: 'workspace' },
      { id: 'workspace:AGENTS.override.md', name: 'AGENTS.override.md', path: join(root, 'AGENTS.override.md'), source: 'workspace' },
      { id: 'workspace:CLAUDE.md', name: 'CLAUDE.md', path: join(root, 'CLAUDE.md'), source: 'workspace' },
      { id: 'workspace:CLAUDE.override.md', name: 'CLAUDE.override.md', path: join(root, 'CLAUDE.override.md'), source: 'workspace' },
    ]);
    expect([...INSTRUCTION_FILE_NAMES]).toEqual(['AGENTS.md', 'AGENTS.override.md', 'CLAUDE.md', 'CLAUDE.override.md']);
  });

  it('a directory carrying one of the names is not an instruction file', () => {
    const env = isolated();
    const root = dir('rotaris-instructions-');
    mkdirSync(join(root, 'AGENTS.md'));
    expect(instructionFiles(root, env)).toEqual([]);
  });

  it('lists the global pair after the workspace files', () => {
    const home = dir('rotaris-instructions-home-');
    const globalDir = dir('rotaris-instructions-global-');
    const env = { globalDir, home, platform: 'linux' as const };
    const root = dir('rotaris-instructions-');
    writeFileSync(join(root, 'AGENTS.md'), 'standing\n');
    writeFileSync(join(globalDir, 'AGENTS.md'), 'global standing\n');
    writeFileSync(join(globalDir, 'CLAUDE.md'), 'global claude\n');
    expect(instructionFiles(root, env)).toEqual([
      { id: 'workspace:AGENTS.md', name: 'AGENTS.md', path: join(root, 'AGENTS.md'), source: 'workspace' },
      { id: 'global:AGENTS.md', name: 'AGENTS.md', path: join(globalDir, 'AGENTS.md'), source: 'global' },
      { id: 'global:CLAUDE.md', name: 'CLAUDE.md', path: join(globalDir, 'CLAUDE.md'), source: 'global' },
    ]);
  });

  it('lists the home-relative bases in order, and the machine base off Windows only', () => {
    const home = dir('rotaris-instructions-home-');
    const globalDir = dir('rotaris-instructions-global-');
    const root = dir('rotaris-instructions-');
    mkdirSync(join(home, '.agents'), { recursive: true });
    mkdirSync(join(home, '.config', 'opencode'), { recursive: true });
    writeFileSync(join(home, '.agents', 'CLAUDE.md'), 'user agents claude\n');
    writeFileSync(join(home, '.config', 'opencode', 'AGENTS.md'), 'user opencode agents\n');
    const env = { globalDir, home, platform: 'linux' as const };
    const listed = instructionFiles(root, env);
    expect(listed.map((f) => f.id)).toEqual(['user-agents:CLAUDE.md', 'user-opencode:AGENTS.md']);
    expect(listed[0]).toMatchObject({ name: 'CLAUDE.md', source: 'user (~/.agents)' });
    expect(listed[1]).toMatchObject({ name: 'AGENTS.md', source: 'user (~/.config/opencode)' });
    // The machine-wide base follows the skill platform rule: read where an `/etc` hierarchy exists, nowhere else.
    expect(hasEtcHierarchy('linux')).toBe(true);
    expect(hasEtcHierarchy('darwin')).toBe(true);
    expect(hasEtcHierarchy('win32')).toBe(false);
  });
});
