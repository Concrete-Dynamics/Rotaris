import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeClock } from '@rotaris/kernel';
import { CATALOGUE, RungMemory, type PreflightContext } from '@rotaris/engine';
import type { AgentBackend, ModelRef } from '@rotaris/model';
import { runPreflight, type PreflightDeps } from './intent.js';

/**
 * The run host's pre-flight (REQ-ORCH-005) with OQ-162 as ruled (R-071, `PD-ORCH-005` revision 7 clause 40): an intent
 * carried in is in effect as it stands — no classification call — and the grant and the playbooks are resolved for it.
 */
describe('run-host/intent — the pre-flight', () => {
  const MODEL: ModelRef = { providerId: 'p', modelId: 'small', dialect: 'chat' };
  let dir: string;
  let calls: number;
  let deps: PreflightDeps;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rotaris-intent-'));
    calls = 0;
    const backend: AgentBackend = { ownsTheLoop: false, runTurn: async () => { calls += 1; throw new Error('no classification request was expected'); } };
    deps = {
      clocks: new FakeClock(), backend, runModel: MODEL, credentialFor: () => async () => 'k', modelTimeoutMs: 1_000, globalDir: join(dir, 'global'),
      tier: null, slots: { small: MODEL, fallback: null, summary: null }, runOverride: null, memory: new RungMemory(), log: () => undefined,
    };
  });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });
  const ctx = (over: Partial<PreflightContext> = {}): PreflightContext => ({ sessionId: 'S1', workspaceRoot: join(dir, 'ws'), prompt: 'fix the typo', signal: new AbortController().signal, warn: () => undefined, ...over });

  it('OQ-162: a carried intent makes no classification call and is in effect with the grant and the playbook its category maps to', async () => {
    const carried = { category: 'single_file_change' as const, confidence: null, reason: 'carried', fallback: false, carried_over: true };
    const p = await runPreflight(ctx({ intent: carried, previousIntent: 'question', hasUnfinishedWork: true }), deps);
    expect(calls).toBe(0);
    expect(p.intent).toEqual(carried);
    // REQ-ORCH-016: the simplest intents grant the entry role the direct-work bundle, carried or classified alike.
    expect(p.grant).toBe('direct-work');
    expect(p.route).toBe('work');
    expect(p.playbookFor('orchestrator')).not.toBe('');
  });

  it('without one it classifies, as before: the call is made (and here fails, so REQ-ORCH-007\'s fallback is in effect)', async () => {
    const p = await runPreflight(ctx(), deps);
    expect(calls).toBeGreaterThan(0);
    expect(p.intent).toMatchObject({ category: 'moderate_feature', fallback: true });
  });
  /*
   * K3 of the default live run at c2fdd6a (`docs/defects/fixed/the-entry-roles-route-slot-says-the-coordinator-routed-the-task-to-it.md`):
   * the root's playbook told the coordinator "the coordinator routed it to you", on a direct-work run too (PD-ORCH-006).
   */
  it('REQ-ORCH-019/027: the root is given the entry role\'s ROUTE wording and the audit records it; a delegated child keeps `routed`', async () => {
    for (const category of ['explicit_trivial', 'moderate_feature'] as const) {
      const p = await runPreflight(ctx({ intent: { category, confidence: null, reason: 'carried', fallback: false, carried_over: true } }), deps);
      const root = p.playbookFor('orchestrator', true);
      expect(root).toContain(`ROUTE: ${CATALOGUE.ROUTE!['entry']}`);
      expect(root).not.toMatch(/coordinator routed it to you/);
      expect(p.playbookFor('orchestrator')).toContain(`ROUTE: ${CATALOGUE.ROUTE!['routed']}`);
      expect(p.playbookFor('coding-agent')).toContain(`ROUTE: ${CATALOGUE.ROUTE!['routed']}`);
      expect(p.resolvedPlaybooks['orchestrator']).toMatchObject({ cell: { ROUTE: 'entry' }, text: root });
      expect(p.resolvedPlaybooks['coding-agent']!.cell.ROUTE).toBe('routed');
    }
  });
});
