import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveMoneyStop } from '@rotaris/contracts';
import { loadConfiguration, type LoadedConfiguration } from './load.js';
import { applyMoneyResolution, moneyLeversOf } from './money-slider.js';
import { overlayLiveState, resolveAgain } from './tiers.js';

const dirs: string[] = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'rotaris-money-')); dirs.push(d); return d; };
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

const MODELS = `models:
  s: { provider: openai-compatible, model_id: s, base_url: https://x.example/v1 }
  m: { provider: openai-compatible, model_id: m, base_url: https://x.example/v1 }
  l: { provider: openai-compatible, model_id: l, base_url: https://x.example/v1 }
small_model: s
medium_model: m
large_model: l
`;

function load(workspace: string, global = ''): LoadedConfiguration {
  const globalDir = join(tmp(), 'config');
  const workspaceRoot = join(tmp(), 'ws');
  mkdirSync(globalDir, { recursive: true });
  mkdirSync(join(workspaceRoot, '.rotaris'), { recursive: true });
  if (global !== '') writeFileSync(join(globalDir, 'agents.yaml'), global);
  writeFileSync(join(workspaceRoot, '.rotaris', 'agents.yaml'), workspace);
  const r = loadConfiguration({ globalDir, workspaceRoot, keepIgnored: false });
  if (!r.ok) throw new Error(`load failed: ${r.error.lines.join(' | ')}`);
  return r.value;
}

const apply = (cfg: LoadedConfiguration, stop: Parameters<typeof resolveMoneyStop>[1], hold: Parameters<typeof resolveMoneyStop>[2] = 'none') => {
  const r = applyMoneyResolution(cfg, resolveMoneyStop(moneyLeversOf(cfg), stop, hold), (top, strategy) => resolveAgain(cfg, top, strategy));
  if (!r.ok) throw new Error(r.error.lines.join(' | '));
  return r.value;
};

describe('PD-ORCH-021 — the money slider over a loaded configuration', () => {
  it('clause 9: rotaris.money_slider is read from the workspace over the global file; an unknown value warns and leaves the default', () => {
    expect(load(MODELS).moneySlider).toMatchObject({ stop: 'regular', origin: 'default' });
    expect(load(`${MODELS}rotaris:\n  money_slider: token_burner\n`, 'rotaris:\n  money_slider: money_saver\n').moneySlider).toMatchObject({ stop: 'token_burner', origin: 'workspace' });
    expect(load(MODELS, 'rotaris:\n  money_slider: money_saver\n').moneySlider).toMatchObject({ stop: 'money_saver', origin: 'global' });
    const bad = load(`${MODELS}rotaris:\n  money_slider: lavish\n`);
    expect(bad.moneySlider.stop).toBe('regular');
    expect(bad.moneySlider.warnings.join(' ')).toContain('lavish');
  });

  it('clause 2: a lever a file states is set; one no file states is the default the stop may move', () => {
    const levers = moneyLeversOf(load(`${MODELS}runtime:\n  max_children: 25\npersonas:\n  orchestrator:\n    thinking: high\n`));
    expect(levers.maxTotal).toEqual({ value: 25, origin: 'workspace' });
    expect(levers.maxActive.origin).toBe('default');
    expect(levers.strategy.origin).toBe('default');
    const orchestrator = levers.roles.find((r) => r.role === 'orchestrator')!;
    expect(orchestrator.model).toEqual({ value: 'large_model', origin: 'default' });
    expect(orchestrator.thinking).toEqual({ value: 'high', origin: 'workspace' });
    expect(levers.slots).toEqual({ small_model: 's', medium_model: 'm', large_model: 'l' });
  });

  it('clause 2: a lever the live state changed is set as a saved one is', () => {
    const files = load(MODELS);
    const live = overlayLiveState(files, { runtime: { max_active_children: 3 }, delegationStrategy: 'swarm' });
    if (!live.ok) throw new Error('overlay failed');
    const levers = moneyLeversOf(live.value, files);
    expect(levers.maxActive).toEqual({ value: 3, origin: 'workspace' });
    expect(levers.strategy).toEqual({ value: 'swarm', origin: 'workspace' });
  });

  it('clause 3: token burner moves every unset role one tier up and raises the limits; regular moves nothing', () => {
    const cfg = load(MODELS);
    expect(apply(cfg, 'regular')).toBe(cfg);
    const burned = apply(cfg, 'token_burner');
    expect(burned.personas['coding-agent']?.model).toBe('l');
    expect(burned.runtime.max_active_children).toBe(12);
    expect(burned.runtime.max_children).toBe(40);
    expect(burned.runtime.max_depth).toBe(cfg.runtime.max_depth);
  });

  it('clause 3: money saver runs the entry role one tier down on single; a stated role model is never moved', () => {
    const cfg = load(`${MODELS}personas:\n  coding-agent:\n    model: s\n`);
    const saved = apply(cfg, 'money_saver');
    expect(saved.delegationStrategy).toBe('single');
    expect(saved.personas['orchestrator']?.model).toBe('m');
    expect(saved.personas['coding-agent']?.model).toBe('s');
    expect(apply(cfg, 'token_burner').personas['coding-agent']?.model).toBe('s');
  });

  it('nothing is written: the loaded configuration is unchanged after a resolution is applied', () => {
    const cfg = load(MODELS);
    const before = JSON.stringify(cfg.merged);
    apply(cfg, 'token_burner');
    expect(JSON.stringify(cfg.merged)).toBe(before);
  });
});
