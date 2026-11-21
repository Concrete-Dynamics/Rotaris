import { describe, expect, it } from 'vitest';
import { snapshotLayer, type ProjectSnapshot } from './project-settings.js';

/** R-111 — REQ-PROVIDER-082/090/091: what discovery learned about a model's route and availability reaches the configuration layer. */
describe('the snapshot as a layer: API mode carried through, unavailable models never usable entries', () => {
  const at = '2026-11-20T00:00:00.000Z';
  const model = (id: string, capabilities: Record<string, unknown>) => ({ id, capabilities, limits: {}, pricing: {}, discovered_at: at });
  const snapshot: ProjectSnapshot = { version: 1, providers: {
    copilot: { id: 'copilot', display_name: 'GitHub Copilot', authenticated: true, discovered_at: at, base_url: 'https://api.tenant.githubcopilot.com', models: [
      model('copilot/gpt-4.1', { availability: 'available', api_mode: 'chat' }),
      model('copilot/gpt-5-codex', { availability: 'available', api_mode: 'responses' }),
      model('copilot/opus', { availability: 'policy_disabled', availability_detail: 'terms' }),
      model('copilot/odd', { availability: 'no_supported_route' }),
      model('copilot/plain', {}),
    ] },
  } };

  it('emits an entry per available model with its API mode and the provider base, and none for an unavailable one', () => {
    const { layer } = snapshotLayer(snapshot);
    const models = layer!['models'] as Record<string, Record<string, unknown>>;
    expect(Object.keys(models).sort()).toEqual(['copilot/gpt-4.1', 'copilot/gpt-5-codex', 'copilot/plain']);
    expect(models['copilot/gpt-5-codex']).toMatchObject({ provider: 'openai-compatible', model_id: 'gpt-5-codex', auth_provider: 'copilot', base_url: 'https://api.tenant.githubcopilot.com', api_mode: 'responses' });
    expect(models['copilot/gpt-4.1']).toMatchObject({ api_mode: 'chat' });
    expect(models['copilot/plain']).not.toHaveProperty('api_mode');
  });
});
