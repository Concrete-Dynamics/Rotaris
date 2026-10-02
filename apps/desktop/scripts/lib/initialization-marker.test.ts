/**
 * The answered project-setup section a proof writes into its scratch workspace, read by the product's own reader.
 *
 * `chat-controls-proof`'s first scenario read "Project setup did not finish" as the compress pass's notice in any
 * checkout without the bundled code-intelligence runtime
 * (`docs/defects/fixed/chat-controls-proof-reads-a-failed-project-setup-as-the-compress-passs-notice.md`): the
 * workspace had never been initialized, so the one registered task started in the background at open
 * (REQ-WORKSPACE-083), failed, and its notice took the one slot (REQ-NOTIFY-024). What is decided here is that the
 * section `lib/initialization-marker.mjs` states leaves that task neither pending nor background under the product's
 * `readInitializationState` and `deriveSets`, and that the proof writes it and checks the launch honoured it. Whether the
 * built app then starts no setup is the proof's own guard to measure.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { deriveSets, readInitializationState, TaskRegistry } from '@rotaris/config';
import { CODE_INTELLIGENCE_TASK_ID } from '../../src/main/initialization.js';
import { backgroundSetupStarted, INITIALIZATION_TASK_ID, SETUP_ANSWERED } from './initialization-marker.mjs';

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

/** A scratch workspace `agents.yaml` shaped as the proof writes it, with or without the section. */
function agentsFile(withSection: boolean): string {
  const dir = mkdtempSync(join(tmpdir(), 'rotaris-init-marker-'));
  dirs.push(dir);
  const file = join(dir, 'agents.yaml');
  writeFileSync(file, [
    '# scratch configuration written by the proof script',
    'default_persona: orchestrator',
    'mcp_servers:', '  code_intelligence: { enabled: false }',
    ...(withSection ? SETUP_ANSWERED : []), '',
  ].join('\n'));
  return file;
}

/** The registry as the product holds it: the one shipped task, applicable (REQ-WORKSPACE-090 ignores `enabled`), background. */
function registry(): TaskRegistry {
  const r = new TaskRegistry();
  r.register({ id: CODE_INTELLIGENCE_TASK_ID, label: 'Code intelligence project setup', description: '', applicable: () => true, run: async () => { throw new Error('not run here'); } });
  return r;
}

describe('the answered project-setup section a proof writes (REQ-WORKSPACE-081, REQ-WORKSPACE-083, REQ-WORKSPACE-111)', () => {
  it('names the task id the product registers', () => {
    expect(INITIALIZATION_TASK_ID).toBe(CODE_INTELLIGENCE_TASK_ID);
  });

  it('REQ-WORKSPACE-083: without the section the task is background, so it starts by itself at open', async () => {
    const sets = await deriveSets(registry(), readInitializationState(agentsFile(false)), () => undefined, { workspaceRoot: 'C:/ws' });
    expect(sets.background.map((t) => t.id)).toEqual([CODE_INTELLIGENCE_TASK_ID]);
  });

  it('REQ-WORKSPACE-081/111: with it the task is skipped — neither pending nor background — and the workspace is initialized', async () => {
    const state = readInitializationState(agentsFile(true));
    expect(state.skipped).toEqual([CODE_INTELLIGENCE_TASK_ID]);
    expect(state.completed).toEqual([]);
    expect(state.lastRun).not.toBeNull();
    const sets = await deriveSets(registry(), state, () => undefined, { workspaceRoot: 'C:/ws' });
    expect(sets.pending).toEqual([]);
    expect(sets.background).toEqual([]);
  });

  it('recognises the coordinator\'s own start line and nothing else', () => {
    expect(backgroundSetupStarted('[main] info    initialization: running code-intelligence-setup for /w (background)')).toBe(true);
    expect(backgroundSetupStarted('[main] info    initialization: /w — 0 pending (0 needing consent), 1 runnable')).toBe(false);
    expect(backgroundSetupStarted('[main] info    run host: mcp setup: create running')).toBe(false);
  });
});

/**
 * Each proof that reads the notice slot without project setup as its subject, with the line its `launch()` ends before.
 * `notice-proof` read "Project setup did not finish" in place of REQ-NOTIFY-224's hook-review notice
 * (`docs/defects/fixed/notice-proof-reads-a-failed-project-setup-in-place-of-the-hook-review-notice.md`).
 */
const SLOT_READERS = [
  { proof: 'chat-controls-proof', ids: 'REQ-CHAT-080, REQ-NOTIFY-024', launchEnd: 'const match =' },
  { proof: 'notice-proof', ids: 'REQ-NOTIFY-224, REQ-NOTIFY-024', launchEnd: 'const escape =' },
];

describe.each(SLOT_READERS)('$proof keeps a background project setup out of the notice slot it reads ($ids)', ({ proof, launchEnd }) => {
  const text = readFileSync(resolve(import.meta.dirname, '..', `${proof}.mjs`), 'utf8');

  it('writes the answered section into every scenario\'s workspace configuration', () => {
    const scenario = text.slice(text.indexOf('function scenario('), text.indexOf('async function launch('));
    expect(scenario).toMatch(/\.\.\.SETUP_ANSWERED/);
  });

  it('fails a launch whose log shows the setup started anyway, before reading any notice', () => {
    const start = text.indexOf('async function launch(');
    const launch = text.slice(start, text.indexOf(launchEnd, start));
    expect(launch).toMatch(/if \(backgroundSetupStarted\(log\)\) throw/);
  });
});
