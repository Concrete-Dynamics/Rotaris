import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeClock } from '@rotaris/kernel';
import { configureRun } from './configuration.js';

/** PD-ORCH-021 at the run-host root: the stop's strategy at the start, and what `RunSpend.at` yields once the intent is known. */
let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'rotaris-rh-spend-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

const AGENTS = `models:
  s: { provider: openai-compatible, model_id: s, base_url: https://x.example/v1 }
  m: { provider: openai-compatible, model_id: m, base_url: https://x.example/v1 }
  l: { provider: openai-compatible, model_id: l, base_url: https://x.example/v1 }
small_model: s
medium_model: m
large_model: l
`;

function configured(agents: string, moneyStop?: 'money_saver' | 'small_budget' | 'regular' | 'strong_budget' | 'token_burner', live: Record<string, unknown> = {}) {
  mkdirSync(join(dir, 'config'), { recursive: true });
  mkdirSync(join(dir, 'ws', '.rotaris'), { recursive: true });
  writeFileSync(join(dir, 'ws', '.rotaris', 'agents.yaml'), agents);
  const deps = { clocks: new FakeClock(), globalDir: join(dir, 'config'), env: {}, scriptedClient: () => { throw new Error('not scripted'); }, onRequest: () => {}, log: () => {}, liveState: () => live, bearers: () => ({}) };
  const r = configureRun(join(dir, 'ws'), true, deps, moneyStop === undefined ? undefined : { moneyStop });
  if (!r.ok) throw new Error(r.error.reason);
  return r.value;
}

describe('PD-ORCH-021 — the run host reads the money slider', () => {
  it('clause 9: the session stop governs; absent, the configured default does', () => {
    expect(configured(AGENTS).spend?.startStop).toBe('regular');
    expect(configured(`${AGENTS}rotaris:\n  money_slider: strong_budget\n`).spend?.startStop).toBe('strong_budget');
    expect(configured(`${AGENTS}rotaris:\n  money_slider: strong_budget\n`, 'money_saver').spend?.startStop).toBe('money_saver');
  });

  it('clause 3: the strategy is applied at the start, before the intent is known', () => {
    expect(configured(AGENTS, 'money_saver').runtime.runOverride).toBe('single');
    expect(configured(AGENTS, 'small_budget').runtime.runOverride).toBe('lead');
    expect(configured(AGENTS, 'token_burner').runtime.runOverride).toBeNull();
    // A strategy the user set is never moved.
    expect(configured(`${AGENTS}rotaris:\n  delegation_strategy: swarm\n`, 'money_saver').runtime.runOverride).toBe('swarm');
  });

  it('clauses 3 and 4: at strong budget the entry role runs one tier up, except for an answer', () => {
    const run = configured(AGENTS, 'strong_budget');
    expect(run.model.config.model.modelId).toBe('l');
    const build = run.spend!.at('strong_budget', 'moderate_feature');
    expect(build.entry).toBeNull(); // the orchestrator already runs on the largest tier
    expect(build.budget).toMatchObject({ maxActive: 8, maxTotal: 30 });
    expect(build.widening).toBe('one_wider');
    const answer = run.spend!.at('strong_budget', 'question');
    expect(answer.budget.maxActive).toBe(run.runtime.childBudget?.maxActive);
    expect(answer.audit.levers['runtime.max_active_children']).toBe('unchanged');
  });

  it('clause 3: money saver runs the entry role one tier down unless the intent is a large build', () => {
    const run = configured(AGENTS, 'money_saver');
    const asked = run.spend!.at('money_saver', 'question');
    expect(asked.entry?.model.modelId).toBe('m');
    expect(run.spend!.at('money_saver', 'whole_project').entry).toBeNull();
  });

  it('clause 10: the personas a child is delegated under are the stop\'s; token burner moves a delegated role one tier up', () => {
    const run = configured(AGENTS);
    expect(run.spend!.at('regular', 'moderate_feature').personas.resolve('coding-agent')?.persona.modelRef?.modelId).toBe('m');
    expect(run.spend!.at('token_burner', 'moderate_feature').personas.resolve('coding-agent')?.persona.modelRef?.modelId).toBe('l');
    expect(run.spend!.at('small_budget', 'moderate_feature').personas.resolve('coding-agent')?.persona.modelRef?.modelId).toBe('s');
  });

  it('clause 7: the audit names the stop and each lever as moved, set or unchanged', () => {
    const audit = configured(`${AGENTS}runtime:\n  max_children: 25\n`, 'token_burner').spend!.at('token_burner', 'moderate_feature').audit;
    expect(audit.stop).toBe('token_burner');
    expect(audit.levers['runtime.max_children']).toBe('set');
    expect(audit.levers['runtime.max_active_children']).toBe('moved');
    expect(audit.levers['personas.coding-agent.model']).toBe('moved');
  });
});
