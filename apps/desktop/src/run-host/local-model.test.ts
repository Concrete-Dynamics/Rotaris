/**
 * R-088 — every agent role on the owner's locally hosted `ds41`. The layer is APPLIED to a scratch configuration
 * directory by the same function `pnpm local-model:apply` runs, LOADED by the product's loader, and RESOLVED through the
 * run host's own resolvers — the persona resolver a delegation reads (REQ-CONFIG-098), the classifier's slots
 * (REQ-ORCH-009), the compressor, the summariser, both improvement passes — never through the draft alone.
 *
 * The set asserted is the WHOLE set: the thirteen built-in roles, `intent-classifier`, and every persona the loaded
 * configuration knows, so a role added later that the layer does not bind fails here instead of silently falling back
 * to a shipped default. No model is reached: resolution is configuration, and the endpoint is a reserved `.invalid` host.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BUILT_IN_ROLE_NAMES } from '@rotaris/contracts';
import { applyLocalModel, LOCAL_MODEL_ROLES, loadConfiguration, localModelLayer, MODEL_SLOTS, syntheticOriginOf } from '@rotaris/config';
import { classifierSlotsOf, compressorOf, improvementCollectorOf, modelRefOf, personaResolverFor, retrospectiveOf, summariserOf } from './configuration.js';

const BASE_URL = 'http://ds41.invalid/v1';
const SPEC = { label: 'ds41', modelId: 'ds41', baseUrl: `${BASE_URL}/`, apiKeyEnv: 'DS41_API_KEY' } as const;
const DS41 = { providerId: 'openai-compatible--ds41', modelId: 'ds41', baseUrl: BASE_URL };

let dir = '';
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'rotaris-ds41-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

async function loaded() {
  const applied = await applyLocalModel(join(dir, 'config'), SPEC);
  if (!applied.ok) throw new Error(JSON.stringify(applied.error));
  const r = loadConfiguration({ globalDir: join(dir, 'config'), workspaceRoot: join(dir, 'ws'), snapshotPath: null, keepIgnored: false, env: {} });
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
}

describe('R-088: every agent role resolves to ds41', () => {
  it('names every built-in role and the classifier, and nothing else, in the layer', () => {
    expect([...LOCAL_MODEL_ROLES].sort()).toEqual([...BUILT_IN_ROLE_NAMES, 'intent-classifier'].sort());
    const layer = localModelLayer(SPEC);
    expect(layer.ok && Object.keys(layer.value['personas'] as object).sort()).toEqual([...LOCAL_MODEL_ROLES].sort());
  });

  it('resolves the WHOLE set of roles — built-in, classifier, and any persona the configuration knows — to the ds41 entry and its base URL', async () => {
    const cfg = await loaded();
    expect(cfg.warnings.filter((w) => /ds41/.test(w))).toEqual([]);
    const personas = personaResolverFor(cfg, false, () => undefined);
    const every = [...new Set([...BUILT_IN_ROLE_NAMES, 'intent-classifier', ...Object.keys(cfg.personas)])].sort();
    expect(every.length).toBeGreaterThanOrEqual(14);
    const resolved = Object.fromEntries(every.map((role) => {
      const p = personas.resolve(role)?.persona;
      return [role, p?.modelRef === undefined ? null : { providerId: p.modelRef.providerId, modelId: p.modelRef.modelId, baseUrl: p.modelRef.baseUrl, key: p.modelKey }];
    }));
    expect(resolved).toEqual(Object.fromEntries(every.map((role) => [role, { ...DS41, key: 'ds41' }])));
  });

  it('resolves every model slot, the classifier\'s ladder, the compressor, the summariser and both improvement passes to ds41', async () => {
    const cfg = await loaded();
    for (const slot of MODEL_SLOTS) {
      const name = cfg.slots[slot];
      expect({ slot, origin: name === null ? null : syntheticOriginOf(name, cfg.syntheticOrigins) }).toEqual({ slot, origin: 'ds41' });
      expect(modelRefOf(cfg, name, false)).toMatchObject(DS41);
    }
    const ladder = classifierSlotsOf(cfg, false);
    for (const ref of [ladder.small, ladder.fallback, ladder.summary]) expect(ref).toMatchObject(DS41);
    for (const pass of [compressorOf(cfg, false), summariserOf(cfg, false), improvementCollectorOf(cfg, false), retrospectiveOf(cfg, false)]) expect(pass?.model).toMatchObject(DS41);
    expect(modelRefOf(cfg, cfg.circuitBreaker.model, false)).toMatchObject(DS41);
  });

  it('commits no address or key: the key is an environment variable name, and applying twice changes nothing', async () => {
    await loaded();
    const file = join(dir, 'config', 'agents.yaml');
    const first = readFileSync(file, 'utf8');
    expect(first).toContain('api_key_env: DS41_API_KEY');
    expect(first).not.toMatch(/api_key:/);
    const again = await applyLocalModel(join(dir, 'config'), SPEC);
    expect(again.ok).toBe(true);
    expect(readFileSync(file, 'utf8')).toBe(first);
  });

  it('refuses an endpoint with no scheme or host, and writes nothing', async () => {
    const r = await applyLocalModel(join(dir, 'config'), { ...SPEC, baseUrl: 'ds41:8000' });
    expect(r.ok).toBe(false);
  });
});
