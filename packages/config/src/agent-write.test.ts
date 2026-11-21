/**
 * PD-CONFIG-014 clause 2: one key written for the `configure` tool through the scoped per-field path, then the load —
 * and a value the load refuses is not left standing.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Timers } from '@rotaris/kernel';
import { commitAgentConfigKey } from './snapshot.js';
import { writeConfigKey } from './writers.js';

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

function scope(): { globalDir: string; workspaceRoot: string; wsFile: string } {
  const base = mkdtempSync(join(tmpdir(), 'rotaris-agent-write-'));
  dirs.push(base);
  const globalDir = join(base, 'config');
  const workspaceRoot = join(base, 'ws');
  mkdirSync(globalDir, { recursive: true });
  mkdirSync(join(workspaceRoot, '.rotaris'), { recursive: true });
  return { globalDir, workspaceRoot, wsFile: join(workspaceRoot, '.rotaris', 'agents.yaml') };
}

/** Timers that fire at once: the writer's retry ladder is never reached on a plain temp directory. */
const timers = {
  after: (_ms: unknown, fn: () => void) => { const h = setTimeout(fn, 0); return { cancel: () => { clearTimeout(h); } }; },
  every: (_ms: unknown, fn: () => void) => { const h = setInterval(fn, 1); return { cancel: () => { clearInterval(h); } }; },
} as unknown as Timers;

describe('writeConfigKey (PD-CONFIG-014 clause 2)', () => {
  it('writes one nested key, keeps comments and every other key, and reports what the file stated before', async () => {
    const s = scope();
    writeFileSync(s.wsFile, '# keep me\nruntime:\n  max_depth: 4 # inline\n  max_iterations: 10\nmedium_model: a\n');
    const r = await writeConfigKey(s.wsFile, ['runtime', 'max_iterations'], 25);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toMatchObject({ stated: true, before: 10 });
    const text = readFileSync(s.wsFile, 'utf8');
    expect(text).toContain('# keep me');
    expect(text).toContain('max_depth: 4 # inline');
    expect(text).toContain('max_iterations: 25');
    // A scalar replaced in place keeps the comment on its line.
    writeFileSync(s.wsFile, 'runtime:\n  permission_mode: autonomous # keep\n');
    await writeConfigKey(s.wsFile, ['runtime', 'permission_mode'], 'restricted');
    expect(readFileSync(s.wsFile, 'utf8')).toBe('runtime:\n  permission_mode: restricted # keep\n');
    expect(text).toContain('medium_model: a');
  });

  it('removes a key when the value is undefined, and creates a missing file holding only the key', async () => {
    const s = scope();
    const created = await writeConfigKey(s.wsFile, ['display', 'show_tool_inputs'], false);
    expect(created.ok && created.value).toMatchObject({ stated: false, previousText: null });
    expect(readFileSync(s.wsFile, 'utf8')).toContain('show_tool_inputs: false');
    const removed = await writeConfigKey(s.wsFile, ['display', 'show_tool_inputs'], undefined);
    expect(removed.ok && removed.value).toMatchObject({ stated: true, before: false });
    expect(readFileSync(s.wsFile, 'utf8')).not.toContain('show_tool_inputs');
  });

  it('replaces a mapping value whole rather than merging into it', async () => {
    const s = scope();
    writeFileSync(s.wsFile, 'instructions:\n  overrides:\n    a: off\n    b: on\n');
    await writeConfigKey(s.wsFile, ['instructions', 'overrides'], { c: 'off' });
    const text = readFileSync(s.wsFile, 'utf8');
    expect(text).toContain('c: off');
    expect(text).not.toContain('a: off');
  });

  it('refuses an invalid runtime value and an unparseable file, writing nothing', async () => {
    const s = scope();
    writeFileSync(s.wsFile, 'runtime:\n  max_iterations: 10\n');
    expect((await writeConfigKey(s.wsFile, ['runtime', 'permission_mode'], 'no-such-mode')).ok).toBe(false);
    expect(readFileSync(s.wsFile, 'utf8')).toBe('runtime:\n  max_iterations: 10\n');
    writeFileSync(s.wsFile, 'runtime: [unclosed\n');
    expect((await writeConfigKey(s.wsFile, ['medium_model'], 'x')).ok).toBe(false);
    expect(readFileSync(s.wsFile, 'utf8')).toBe('runtime: [unclosed\n');
  });
});

describe('commitAgentConfigKey (PD-CONFIG-014 clause 2)', () => {
  it('writes, loads again and answers the snapshot with the key\'s prior state', async () => {
    const s = scope();
    writeFileSync(s.wsFile, '# mine\nruntime:\n  max_iterations: 10\n');
    const r = await commitAgentConfigKey(s.globalDir, s.workspaceRoot, 'workspace', ['runtime', 'max_iterations'], 30, timers);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r).toMatchObject({ file: s.wsFile, stated: true, before: 10 });
    expect(r.snapshot.fatal ?? null).toBeNull();
    expect(readFileSync(s.wsFile, 'utf8')).toContain('max_iterations: 30');
  });

  it('puts the file back exactly when the load refuses the value', async () => {
    const s = scope();
    const original = '# mine\nmodels:\n  local:\n    provider: openai\n    model_id: m\n';
    writeFileSync(s.wsFile, original);
    // A model entry with no model_id does not load (REQ-CONFIG-238).
    const r = await commitAgentConfigKey(s.globalDir, s.workspaceRoot, 'workspace', ['models', 'local'], { provider: 'openai' }, timers);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.refusal.fault).toContain('would not load');
    expect(readFileSync(s.wsFile, 'utf8')).toBe(original);
  });

  it('removes a file it created when the load refuses what it wrote', async () => {
    const s = scope();
    const r = await commitAgentConfigKey(s.globalDir, s.workspaceRoot, 'workspace', ['models', 'broken'], { provider: 'openai' }, timers);
    expect(r.ok).toBe(false);
    expect(existsSync(s.wsFile)).toBe(false);
  });

  it('writes the global file when the scope is global', async () => {
    const s = scope();
    const r = await commitAgentConfigKey(s.globalDir, s.workspaceRoot, 'global', ['medium_model'], 'x', timers);
    expect(r.ok && r.file).toBe(join(s.globalDir, 'agents.yaml'));
    expect(existsSync(s.wsFile)).toBe(false);
  });
});
