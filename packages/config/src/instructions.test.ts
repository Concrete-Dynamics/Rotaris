import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readInstructionsSection } from './sections/instructions.js';
import { instructionEnabled } from './snapshot.js';
import { enabledInstructionFiles, instructionSourceComment, mergeInstructionContext, type InstructionFileEntry } from './instructions.js';
import { loadConfiguration } from './load.js';
import { saveDesktop } from './writers.js';
import type { ProblemSink } from './sections/field.js';

const made: string[] = [];
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), 'rotaris-instructions-section-'));
  made.push(d);
  return d;
};
afterEach(() => { for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true }); });

const sink = (): ProblemSink & { errors: { path: string; message: string }[]; warnings: { path: string; message: string }[] } =>
  ({ errors: [], warnings: [] });

describe('PD-WORKSPACE-002 — the instructions: section reader', () => {
  it('reads an empty section as no policy, and a bare section as no policy', () => {
    expect(readInstructionsSection(undefined, sink())).toEqual({ overrides: {} });
    expect(readInstructionsSection(null, sink())).toEqual({ overrides: {} });
  });

  it('reads per-file states, and rejects a value outside on|off naming the file', () => {
    const s = sink();
    expect(readInstructionsSection({ overrides: { 'workspace:AGENTS.md': 'off', 'global:CLAUDE.md': 'on' } }, s)).toEqual({
      overrides: { 'workspace:AGENTS.md': 'off', 'global:CLAUDE.md': 'on' },
    });
    expect(s.errors).toEqual([]);
    const bad = sink();
    readInstructionsSection({ overrides: { 'workspace:AGENTS.md': 'sometimes' } }, bad);
    expect(bad.errors.length).toBe(1);
    expect(bad.errors[0]!.path).toContain('workspace:AGENTS.md');
  });

  it('rejects a non-mapping overrides value', () => {
    const s = sink();
    readInstructionsSection({ overrides: ['off'] }, s);
    expect(s.errors.length).toBe(1);
  });
});

describe('PD-WORKSPACE-002 — the enabled state and the layered policy', () => {
  it('absent means on; the master switch stands above every per-file policy', () => {
    expect(instructionEnabled(true, {}, 'workspace:AGENTS.md')).toBe(true);
    expect(instructionEnabled(true, { 'workspace:AGENTS.md': 'off' }, 'workspace:AGENTS.md')).toBe(false);
    expect(instructionEnabled(true, { 'workspace:AGENTS.md': 'on' }, 'workspace:AGENTS.md')).toBe(true);
    expect(instructionEnabled(false, {}, 'workspace:AGENTS.md')).toBe(false);
    expect(instructionEnabled(false, { 'workspace:AGENTS.md': 'on' }, 'workspace:AGENTS.md')).toBe(false);
  });

  it('the section merges per file: a workspace file naming one file leaves the global policy for the other standing', () => {
    const globalDir = join(tmp(), 'config');
    const workspaceRoot = join(tmp(), 'ws');
    mkdirSync(globalDir, { recursive: true });
    mkdirSync(join(workspaceRoot, '.rotaris'), { recursive: true });
    writeFileSync(join(globalDir, 'agents.yaml'), ['instructions:', '  overrides:', '    global:AGENTS.md: off', '    global:CLAUDE.md: off', ''].join('\n'));
    writeFileSync(join(workspaceRoot, '.rotaris', 'agents.yaml'), ['instructions:', '  overrides:', '    global:CLAUDE.md: on', ''].join('\n'));
    const loaded = loadConfiguration({ globalDir, workspaceRoot });
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.value.instructions.overrides).toEqual({ 'global:AGENTS.md': 'off', 'global:CLAUDE.md': 'on' });
    }
  });

  it('the desktop save writes the map sparsely, and a null removes a key', async () => {
    const globalDir = join(tmp(), 'config');
    const workspaceRoot = join(tmp(), 'ws');
    mkdirSync(globalDir, { recursive: true });
    mkdirSync(join(workspaceRoot, '.rotaris'), { recursive: true });
    const wsFile = join(workspaceRoot, '.rotaris', 'agents.yaml');
    const gFile = join(globalDir, 'agents.yaml');
    const r = await saveDesktop({ workspace: wsFile, global: gFile }, { instructions: { overrides: { 'workspace:AGENTS.md': 'off', 'global:CLAUDE.md': 'on' } } });
    expect(r.ok).toBe(true);
    const text = readFileSync(wsFile, 'utf8');
    expect(text).toContain('instructions:');
    expect(text).toContain('workspace:AGENTS.md: off');
    const r2 = await saveDesktop({ workspace: wsFile, global: gFile }, { instructions: { overrides: { 'workspace:AGENTS.md': null } } });
    expect(r2.ok).toBe(true);
    expect(readFileSync(wsFile, 'utf8')).not.toContain('workspace:AGENTS.md');
  });
});

/** An inventory entry, as discovery would hand it over. */
const entry = (id: string, name: string, path: string, source = 'workspace'): InstructionFileEntry => ({ id, name, path, source });

describe('PD-WORKSPACE-002 — the enabled set injection consumes', () => {
  const files = [
    entry('workspace:AGENTS.md', 'AGENTS.md', '/ws/AGENTS.md'),
    entry('workspace:AGENTS.override.md', 'AGENTS.override.md', '/ws/AGENTS.override.md'),
    entry('workspace:CLAUDE.md', 'CLAUDE.md', '/ws/CLAUDE.md'),
    entry('global:AGENTS.md', 'AGENTS.md', '/cfg/AGENTS.md', 'global'),
  ];

  it('REQ-WORKSPACE-048: the master switch stands above every per-file policy', () => {
    expect(enabledInstructionFiles(files, false, {})).toEqual([]);
    expect(enabledInstructionFiles(files, false, { 'workspace:AGENTS.md': 'on' })).toEqual([]);
  });

  it('REQ-WORKSPACE-042, narrowed: an override suppresses its OWN base and nothing else', () => {
    expect(enabledInstructionFiles(files, true, {}).map((f) => f.id)).toEqual([
      'workspace:AGENTS.override.md', 'workspace:CLAUDE.md', 'global:AGENTS.md',
    ]);
  });

  it('OQ-64 (ruled): suppression is computed over the ENABLED set, so switching the override off returns the base', () => {
    expect(enabledInstructionFiles(files, true, { 'workspace:AGENTS.override.md': 'off' }).map((f) => f.id)).toEqual([
      'workspace:AGENTS.md', 'workspace:CLAUDE.md', 'global:AGENTS.md',
    ]);
  });

  it('a file switched off contributes nothing, and every other file stands', () => {
    expect(enabledInstructionFiles(files, true, { 'global:AGENTS.md': 'off' }).map((f) => f.id)).toEqual([
      'workspace:AGENTS.override.md', 'workspace:CLAUDE.md',
    ]);
  });
});

describe('REQ-WORKSPACE-043/044/045 — the merged output', () => {
  const ports = (contents: Record<string, string>) => ({
    readFile: (path: string) => {
      const held = contents[path];
      if (held === undefined) throw new Error(`ENOENT: ${path}`);
      return held;
    },
  });

  it('REQ-WORKSPACE-043: a source comment per block, one blank line between, discovery order', () => {
    const warnings: string[] = [];
    const merged = mergeInstructionContext(
      [entry('a', 'AGENTS.md', '/ws/AGENTS.md'), entry('b', 'CLAUDE.md', '/ws/CLAUDE.md')],
      ports({ '/ws/AGENTS.md': 'first\n', '/ws/CLAUDE.md': 'second\n' }),
      (m) => warnings.push(m),
    );
    expect(merged).toBe(`${instructionSourceComment('/ws/AGENTS.md')}\nfirst\n\n${instructionSourceComment('/ws/CLAUDE.md')}\nsecond`);
    expect(warnings).toEqual([]);
  });

  it('REQ-WORKSPACE-045: a whitespace-only file is skipped silently, an unreadable one with a warning', () => {
    const warnings: string[] = [];
    const merged = mergeInstructionContext(
      [entry('a', 'AGENTS.md', '/ws/AGENTS.md'), entry('b', 'CLAUDE.md', '/ws/CLAUDE.md'), entry('c', 'AGENTS.md', '/cfg/AGENTS.md', 'global')],
      ports({ '/ws/AGENTS.md': '   \n\n', '/cfg/AGENTS.md': 'kept\n' }),
      (m) => warnings.push(m),
    );
    expect(merged).toBe(`${instructionSourceComment('/cfg/AGENTS.md')}\nkept`);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('/ws/CLAUDE.md');
  });

  it('REQ-WORKSPACE-044: the per-file limit cuts back to a line boundary, and a first line over it drops the file', () => {
    const warnings: string[] = [];
    const merged = mergeInstructionContext(
      [entry('a', 'AGENTS.md', '/ws/AGENTS.md')],
      ports({ '/ws/AGENTS.md': 'aaaa\nbbbb\ncccc\n' }),
      (m) => warnings.push(m),
      { perFile: 12 },
    );
    // Two whole lines fit in twelve bytes; the third is cut at the boundary, never mid-line.
    expect(merged).toBe(`${instructionSourceComment('/ws/AGENTS.md')}\naaaa\nbbbb`);
    expect(warnings[0]).toContain('truncated');
    const dropped: string[] = [];
    expect(mergeInstructionContext(
      [entry('a', 'AGENTS.md', '/ws/AGENTS.md')],
      ports({ '/ws/AGENTS.md': 'aaaaaaaaaaaaaaaa\n' }),
      (m) => dropped.push(m),
      { perFile: 4 },
    )).toBe('');
    expect(dropped[0]).toContain('first line alone exceeds');
  });

  it('REQ-WORKSPACE-044: the source comment is charged first, and a file with no budget left is dropped entire', () => {
    const warnings: string[] = [];
    const first = instructionSourceComment('/ws/AGENTS.md');
    const merged = mergeInstructionContext(
      [entry('a', 'AGENTS.md', '/ws/AGENTS.md'), entry('b', 'CLAUDE.md', '/ws/CLAUDE.md')],
      ports({ '/ws/AGENTS.md': 'aaaa\n', '/ws/CLAUDE.md': 'bbbb\n' }),
      (m) => warnings.push(m),
      // Room for the first block and not one byte of the second's comment.
      { total: first.length + 1 + 4 },
    );
    expect(merged).toBe(`${first}\naaaa`);
    expect(warnings.some((w) => w.includes('/ws/CLAUDE.md') && w.includes('dropped entire'))).toBe(true);
    expect(Buffer.byteLength(merged, 'utf8')).toBeLessThanOrEqual(first.length + 1 + 4);
  });

  it('REQ-WORKSPACE-044/049: the output never exceeds the total, and the same input yields the same bytes', () => {
    const body = `${'x'.repeat(40)}\n`.repeat(50);
    const files = [entry('a', 'AGENTS.md', '/ws/AGENTS.md'), entry('b', 'CLAUDE.md', '/ws/CLAUDE.md')];
    const content = ports({ '/ws/AGENTS.md': body, '/ws/CLAUDE.md': body });
    const once = mergeInstructionContext(files, content, () => undefined, { total: 900 });
    const twice = mergeInstructionContext(files, content, () => undefined, { total: 900 });
    expect(once).toBe(twice);
    expect(Buffer.byteLength(once, 'utf8')).toBeLessThanOrEqual(900);
    // No block ends mid-line: every line of the output is a whole line of a source file or a comment.
    for (const line of once.split('\n')) expect(line === '' || line.startsWith('<!-- source:') || line === 'x'.repeat(40)).toBe(true);
  });
});
