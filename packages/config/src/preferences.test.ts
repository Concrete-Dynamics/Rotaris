import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfiguration, type LoadedConfiguration } from './load.js';
import { CONFIG_ORIGINS } from '@rotaris/contracts';
import { rolePreferences, slotPreferences } from './preferences.js';

const dirs: string[] = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'rotaris-preferences-')); dirs.push(d); return d; };
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

/**
 * Two registered openai-compatible endpoints serving one model id — the live run's shape: both entries have provider
 * `openai-compatible` and model id `qwen`, and `alpha` sorts (and so is inserted) first. Only `beta` suggests a slot.
 */
const TWO_ENDPOINTS = `version: 1
providers:
  openai-compatible--alpha:
    id: openai-compatible--alpha
    display_name: Alpha
    authenticated: true
    base_url: https://alpha.example/v1
    discovered_at: 2026-09-29T10:00:00.000Z
    models:
      - { id: openai-compatible--alpha/qwen, capabilities: {}, limits: {}, pricing: {}, discovered_at: 2026-09-29T10:00:00.000Z }
  openai-compatible--beta:
    id: openai-compatible--beta
    display_name: Beta
    authenticated: true
    base_url: https://beta.example/v1
    small_model: openai-compatible--beta/qwen
    discovered_at: 2026-09-29T10:00:00.000Z
    models:
      - { id: openai-compatible--beta/qwen, capabilities: {}, limits: {}, pricing: {}, discovered_at: 2026-09-29T10:00:00.000Z }
`;

function loadTwoEndpoints(agents: string): LoadedConfiguration {
  const globalDir = join(tmp(), 'config');
  const workspaceRoot = join(tmp(), 'ws');
  mkdirSync(globalDir, { recursive: true });
  mkdirSync(join(workspaceRoot, '.rotaris'), { recursive: true });
  writeFileSync(join(globalDir, 'project_settings.yaml'), TWO_ENDPOINTS);
  writeFileSync(join(workspaceRoot, '.rotaris', 'agents.yaml'), agents);
  const r = loadConfiguration({ globalDir, workspaceRoot, keepIgnored: false });
  if (!r.ok) throw new Error(`load failed: ${r.error.lines.join(' | ')}`);
  return r.value;
}

describe('the read-back unwraps a synthetic copy to the models: key it was copied from (REQ-CONFIG-253, REQ-CONFIG-255, REQ-CONFIG-094)', () => {
  it('REQ-CONFIG-253: a slot the files do not state, carrying a reasoning level, reads back as its own endpoint, not the other endpoint serving the same model id', () => {
    const c = loadTwoEndpoints('small_model_thinking: high\n');
    // The fixture really is the collision: two keys, one provider model, and the slot a synthetic copy of the second.
    expect(c.models['openai-compatible--alpha/qwen']).toMatchObject({ provider: 'openai-compatible', model_id: 'qwen' });
    expect(c.models['openai-compatible--beta/qwen']).toMatchObject({ provider: 'openai-compatible', model_id: 'qwen' });
    expect(c.slots.small_model).toBe('__startup_slot__:small_model');
    const small = slotPreferences(c).find((p) => p.slot === 'small_model')!;
    expect(small).toMatchObject({ value: 'openai-compatible--beta/qwen', thinking: 'high' });
  });

  it('REQ-CONFIG-341: a slot the snapshot supplied, whose reasoning level a file states, reads back with origin discovered', () => {
    const c = loadTwoEndpoints('small_model_thinking: high\n');
    // The snapshot supplied the slot, and the reasoning level made the loader wrap it in a synthetic copy (REQ-CONFIG-076).
    expect(c.discoveredSlots).toEqual({ small_model: 'openai-compatible--beta/qwen' });
    expect(c.slots.small_model).toBe('__startup_slot__:small_model');
    const small = slotPreferences(c).find((p) => p.slot === 'small_model')!;
    expect(small).toEqual({ slot: 'small_model', value: 'openai-compatible--beta/qwen', origin: 'discovered', thinking: 'high' });
  });

  it('REQ-CONFIG-341: a slot the snapshot did not supply, whose reasoning level a file states, stays default', () => {
    const c = loadTwoEndpoints('large_model_thinking: high\n');
    expect(c.discoveredSlots).toEqual({ small_model: 'openai-compatible--beta/qwen' });
    const large = slotPreferences(c).find((p) => p.slot === 'large_model')!;
    expect(large).toMatchObject({ origin: 'default', thinking: 'high' });
  });

  it('REQ-CONFIG-255: a role with a reasoning level on the second endpoint reads back its effective model on that endpoint', () => {
    const c = loadTwoEndpoints('personas:\n  verifier:\n    model: openai-compatible--beta/qwen\n    thinking: low\n  tester:\n    model: openai-compatible--alpha/qwen\n    thinking: high\n');
    expect(c.personas['verifier']?.model).toBe('__persona__:verifier');
    const roles = Object.fromEntries(rolePreferences(c).map((r) => [r.role, r]));
    expect(roles['verifier']).toMatchObject({ rawModel: 'openai-compatible--beta/qwen', effectiveModel: 'openai-compatible--beta/qwen', rawThinking: 'low' });
    expect(roles['tester']).toMatchObject({ rawModel: 'openai-compatible--alpha/qwen', effectiveModel: 'openai-compatible--alpha/qwen', rawThinking: 'high' });
  });

  it('REQ-CONFIG-255: a role with no reasoning level keeps its own key unchanged', () => {
    const c = loadTwoEndpoints('personas:\n  verifier:\n    model: openai-compatible--beta/qwen\n');
    const verifier = rolePreferences(c).find((r) => r.role === 'verifier')!;
    expect(verifier.effectiveModel).toBe('openai-compatible--beta/qwen');
  });
});

/**
 * Defect note `the-scope-column-names-the-built-in-origin-built-in-not-default.md`: REQ-CONFIG-341 fixes the Scope
 * column's origin vocabulary at exactly `workspace`, `global`, `discovered` and `default`, `default` marking a built-in
 * value. The read-back named that fourth member `built-in`, and Settings → Models drew the word as it arrived.
 */
describe('the origin vocabulary is the one REQ-CONFIG-341 states (REQ-CONFIG-341, REQ-CONFIG-031)', () => {
  it('REQ-CONFIG-341: the vocabulary is exactly workspace, global, discovered and default, in the layer order', () => {
    expect([...CONFIG_ORIGINS]).toEqual(['workspace', 'global', 'discovered', 'default']);
  });
  it('REQ-CONFIG-341: a slot and a role field no file and no snapshot states read back as default', () => {
    const c = loadTwoEndpoints('small_model_thinking: high\n');
    const slots = Object.fromEntries(slotPreferences(c).map((p) => [p.slot, p]));
    // `large_model` is stated by no file and the snapshot supplies only `small_model`.
    expect(slots['large_model']).toMatchObject({ origin: 'default' });
    expect(slots['small_model']).toMatchObject({ origin: 'discovered' });
    const tester = rolePreferences(c).find((r) => r.role === 'tester')!;
    expect(tester).toMatchObject({ rawModel: null, modelOrigin: 'default', rawThinking: null, thinkingOrigin: 'default', inherited: true });
    for (const p of slotPreferences(c)) expect(CONFIG_ORIGINS).toContain(p.origin);
    for (const r of rolePreferences(c)) { expect(CONFIG_ORIGINS).toContain(r.modelOrigin); expect(CONFIG_ORIGINS).toContain(r.thinkingOrigin); }
  });
});
