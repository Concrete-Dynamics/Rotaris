import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { bootstrapConfigFile, commitConfigFields, readInitializationState, recordPatch, starterDocument } from '@rotaris/config';
import { nodeClocks } from '@rotaris/platform';
import { bootstrapAtOpen } from './open-bootstrap.js';

/**
 * `docs/defects/fixed/a-first-run-workspace-never-gets-the-starter-agents-yaml.md` (REQ-CONFIG-025, REQ-CONFIG-028,
 * REQ-WORKSPACE-038). At the open, ADR-0064's initialization recorded its first outcome through the scoped per-field
 * writer into a workspace file that did not exist yet, and the only bootstrap, the one a sign-in asks for, then found
 * that file non-blank and wrote nothing.
 */
const dirs: string[] = [];
const tmp = (): string => { const d = mkdtempSync(join(tmpdir(), 'rotaris-open-bootstrap-')); dirs.push(d); return d; };
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

function scope(): { configDir: string; workspaceRoot: string; agents: string } {
  const configDir = join(tmp(), 'config');
  const workspaceRoot = join(tmp(), 'ws');
  mkdirSync(configDir, { recursive: true });
  mkdirSync(workspaceRoot, { recursive: true });
  return { configDir, workspaceRoot, agents: join(workspaceRoot, '.rotaris', 'agents.yaml') };
}

/** Initialization's marker writer as main wires it: the per-field path (`config.setField`, scope workspace). */
async function recordSetupSuccess(configDir: string, workspaceRoot: string): Promise<void> {
  const state = readInitializationState(join(workspaceRoot, '.rotaris', 'agents.yaml'));
  const patch = recordPatch(state, [{ id: 'code-intelligence-setup', outcome: 'completed' }], 'non-code', '2026-10-03T04:58:42.726Z');
  const r = await commitConfigFields(configDir, workspaceRoot, 'workspace', patch, nodeClocks().timers);
  expect(r.ok).toBe(true);
}

const NULLS = ['default_summary_model', 'default_summary_model_thinking', 'large_model', 'large_model_thinking', 'medium_model', 'medium_model_thinking', 'small_model', 'small_model_thinking', 'fallback_model', 'fallback_model_thinking', 'improvement_collector_model', 'improvement_collector_model_thinking'];

describe('the starter agents.yaml at the open (REQ-CONFIG-025, REQ-CONFIG-028)', () => {
  it('the defect: initialization recording first leaves the file without the starter, and the sign-in bootstrap then reports exists', async () => {
    const s = scope();
    await recordSetupSuccess(s.configDir, s.workspaceRoot);
    expect(readFileSync(s.agents, 'utf8')).not.toContain('default_persona');
    expect(bootstrapConfigFile(s.agents)).toEqual({ ok: true, value: 'exists' });
    expect(readFileSync(s.agents, 'utf8')).not.toContain('default_persona');
  });

  it('bootstrapped at the open, the file keeps the whole starter when initialization records into it (REQ-WORKSPACE-038, REQ-WORKSPACE-079)', async () => {
    const s = scope();
    const lines: string[] = [];
    expect(bootstrapAtOpen(s.configDir, s.workspaceRoot, (m) => lines.push(m))).toBe('written');
    expect(lines).toEqual([`configuration bootstrap at the open of ${s.workspaceRoot}: written`]);
    // REQ-WORKSPACE-078: the starter carries no `initialization:` key, so the workspace still reads as never initialized.
    expect(readInitializationState(s.agents)).toEqual({ completed: [], skipped: [], lastRun: null, classification: null });
    await recordSetupSuccess(s.configDir, s.workspaceRoot);
    const text = readFileSync(s.agents, 'utf8');
    // The starter's header, persona and twelve nulls survive the marker write, in place (REQ-CONFIG-252).
    expect(text.startsWith(starterDocument())).toBe(true);
    expect(text).toContain('default_persona: orchestrator\n');
    for (const key of NULLS) expect(text).toContain(`\n${key}: null\n`);
    expect(readInitializationState(s.agents)).toMatchObject({ completed: ['code-intelligence-setup'], classification: 'non-code' });
    // The sign-in's later bootstrap finds the starter and leaves it (REQ-WORKSPACE-135).
    expect(bootstrapConfigFile(s.agents)).toEqual({ ok: true, value: 'exists' });
  });

  it('an existing file is never written over at the open (REQ-CONFIG-026)', () => {
    const s = scope();
    mkdirSync(join(s.workspaceRoot, '.rotaris'));
    writeFileSync(s.agents, 'initialization:\n  completed: []\n');
    expect(bootstrapAtOpen(s.configDir, s.workspaceRoot, () => undefined)).toBe('exists');
    expect(readFileSync(s.agents, 'utf8')).toBe('initialization:\n  completed: []\n');
  });

  it('a blank file needs the bootstrap; a directory declines (REQ-CONFIG-028)', () => {
    const s = scope();
    mkdirSync(join(s.workspaceRoot, '.rotaris'));
    writeFileSync(s.agents, '  \n');
    expect(bootstrapAtOpen(s.configDir, s.workspaceRoot, () => undefined)).toBe('written');
    expect(readFileSync(s.agents, 'utf8')).toBe(starterDocument());
    rmSync(s.agents);
    mkdirSync(s.agents);
    expect(bootstrapAtOpen(s.configDir, s.workspaceRoot, () => undefined)).toBe('declined-directory');
  });

  it('a declined target is logged as a warning, as REQ-CONFIG-028 calls it needing attention; a written one is not', () => {
    const s = scope();
    const lines: Array<[string, string | undefined]> = [];
    const log = (message: string, level?: 'info' | 'warn') => { lines.push([message, level]); };
    expect(bootstrapAtOpen(s.configDir, s.workspaceRoot, log)).toBe('written');
    rmSync(s.agents);
    mkdirSync(s.agents);
    expect(bootstrapAtOpen(s.configDir, s.workspaceRoot, log)).toBe('declined-directory');
    rmSync(s.agents, { recursive: true });
    writeFileSync(s.agents, Buffer.from([0xff, 0xfe, 0xfd]));
    expect(bootstrapAtOpen(s.configDir, s.workspaceRoot, log)).toBe('declined-not-utf8');
    expect(lines.map(([, level]) => level ?? 'info')).toEqual(['info', 'warn', 'warn']);
  });

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)('a file that cannot be read declines with a warning and the open goes on (REQ-CONFIG-028)', () => {
    const s = scope();
    mkdirSync(join(s.workspaceRoot, '.rotaris'));
    writeFileSync(s.agents, 'default_persona: mine\n');
    chmodSync(s.agents, 0o000);
    const lines: Array<[string, string | undefined]> = [];
    expect(bootstrapAtOpen(s.configDir, s.workspaceRoot, (m, level) => lines.push([m, level]))).toBe('refused');
    expect(lines[0]?.[1]).toBe('warn');
    chmodSync(s.agents, 0o644);
    expect(readFileSync(s.agents, 'utf8')).toBe('default_persona: mine\n');
  });

  it('a refused write is a warning and the open goes on: `.rotaris` is a file, so the starter cannot be put in place', () => {
    const s = scope();
    writeFileSync(join(s.workspaceRoot, '.rotaris'), 'not a directory\n');
    const lines: Array<[string, string | undefined]> = [];
    expect(bootstrapAtOpen(s.configDir, s.workspaceRoot, (m, level) => lines.push([m, level]))).toBe('refused');
    expect(lines).toHaveLength(1);
    expect(lines[0]?.[0]).toMatch(/^configuration bootstrap at the open of .* declined: /);
    expect(lines[0]?.[1]).toBe('warn');
    expect(readFileSync(join(s.workspaceRoot, '.rotaris'), 'utf8')).toBe('not a directory\n');
  });
});

/**
 * The workspace service's `handle` is a composition root over `process.parentPort` and cannot be run in a test, so the
 * one fact this repair needs from it, that the open bootstraps before it answers, is read from its source (the pattern
 * of `main/launch-artifact.test.ts`). Main awaits that answer before it opens the initialization coordinator
 * (`openWorkspaceInner`), so the bootstrap lands before initialization's first recording.
 */
describe('the workspace service bootstraps in its open, before it answers (REQ-CONFIG-025)', () => {
  const source = readFileSync(join(import.meta.dirname, 'index.ts'), 'utf8');
  const openCase = /case 'workspace\.open': \{([\s\S]*?)\n {4}\}/.exec(source)?.[1] ?? '';

  it('the open case bootstraps the workspace file once the store is open, then answers with the open', () => {
    expect(openCase).not.toBe('');
    const opened = openCase.indexOf('openOwn(req.workspaceRoot)');
    const booted = openCase.indexOf('bootstrapAtOpen(dirs.config, req.workspaceRoot, log)');
    expect(opened).toBeGreaterThan(-1);
    expect(booted).toBeGreaterThan(opened);
    expect(openCase.indexOf('return', booted)).toBeGreaterThan(booted);
    expect(openCase).toMatch(/kind === 'workspace\.opened'\) bootstrapAtOpen/);
  });

  it("main opens the initialization coordinator only after the service's open has answered", () => {
    const main = readFileSync(join(import.meta.dirname, '..', 'main', 'index.ts'), 'utf8');
    const open = main.indexOf("svc.link.request({ kind: 'workspace.open', workspaceRoot: key }");
    const init = main.indexOf('initialization.open(key,');
    expect(open).toBeGreaterThan(-1);
    expect(main.slice(open - 30, open)).toContain('await');
    expect(init).toBeGreaterThan(open);
  });
});
