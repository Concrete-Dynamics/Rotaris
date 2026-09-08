import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { instructionFiles, INSTRUCTION_FILE_NAMES } from './snapshot.js';

const made: string[] = [];
const workspace = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'rotaris-instructions-'));
  made.push(dir);
  return dir;
};
afterEach(() => { for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe('REQ-CONFIG-277 — the Instructions inventory', () => {
  it('lists nothing without a workspace, and nothing in a workspace that has neither file', () => {
    expect(instructionFiles('')).toEqual([]);
    expect(instructionFiles('   ')).toEqual([]);
    expect(instructionFiles(workspace())).toEqual([]);
  });

  it('lists the two files where they exist, in the requirement’s order, by absolute path', () => {
    const root = workspace();
    writeFileSync(join(root, 'AGENTS.override.md'), 'override\n');
    expect(instructionFiles(root)).toEqual([{ name: 'AGENTS.override.md', path: join(root, 'AGENTS.override.md') }]);
    writeFileSync(join(root, 'AGENTS.md'), 'standing\n');
    expect(instructionFiles(root)).toEqual([
      { name: 'AGENTS.md', path: join(root, 'AGENTS.md') },
      { name: 'AGENTS.override.md', path: join(root, 'AGENTS.override.md') },
    ]);
    expect(INSTRUCTION_FILE_NAMES).toEqual(['AGENTS.md', 'AGENTS.override.md']);
  });

  it('a directory carrying one of the names is not an instruction file', () => {
    const root = workspace();
    mkdirSync(join(root, 'AGENTS.md'));
    expect(instructionFiles(root)).toEqual([]);
  });
});
