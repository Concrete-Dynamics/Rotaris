import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeClock } from '@rotaris/kernel';
import { mergeProviderRecord, parseSnapshot, ProjectSettingsStore, readProjectSnapshot, REFUSED_SECRET, screenSecrets, serializeSnapshot, type ProviderRecord } from './project-settings.js';
import { assignSlots } from './slots.js';
import type { DiscoveredModel } from './discovery.js';

let dir: string;
let clock: FakeClock;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'rotaris-snap-')); clock = new FakeClock(); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

const NOW = '2026-09-05T10:00:00.000Z';
const dm = (id: string, extra: Partial<DiscoveredModel> = {}): DiscoveredModel => ({ id, qualifiedId: `p/${id}`, displayName: null, capabilities: {}, limits: {}, pricing: {}, raw: {}, ...extra });
function storeAt(path: string, warn: string[] = []) {
  return new ProjectSettingsStore({ path, lock: { pid: process.pid, startedAt: NOW, timers: clock, monotonic: clock }, timers: clock, warn: (m) => warn.push(m) });
}

describe('project_settings.yaml (REQ-PROVIDER-084..087)', () => {
  it('round-trips with keys in written order, non-ASCII literal, a picked-first model order, and a duplicate kept-first with a warning', async () => {
    const path = join(dir, 'project_settings.yaml');
    const s = storeAt(path);
    const models = [dm('zeta'), dm('gpt-4o-mini', { displayName: 'Mini ✓' }), dm('gpt-4o'), dm('claude-haiku-4.5')];
    const picks = assignSlots(models.map((m) => ({ qualifiedId: m.qualifiedId, id: m.id, available: true })));
    const { record, preserved } = mergeProviderRecord(null, models, picks, { id: 'p', displayName: 'Prövider', family: 'openai-compatible', baseUrl: 'https://x.example/v1', authenticated: true }, NOW);
    expect(preserved).toBe(0);
    expect((await s.upsertProvider(record)).ok).toBe(true);
    const text = readFileSync(path, 'utf8');
    expect(text.startsWith('version: 1\nproviders:\n  p:\n    id: p\n    display_name: Prövider\n')).toBe(true);
    expect(text).toContain('Mini ✓');
    expect(text).not.toContain('\\u');
    const back = readProjectSnapshot(path);
    expect(back.ok).toBe(true);
    if (back.ok && back.value) {
      const rec = back.value.providers['p']!;
      expect(rec.models.slice(0, 3).map((m) => m.id)).toEqual([picks.picks.small, picks.picks.medium, picks.picks.large]);
      expect(rec.models.map((m) => m.id).slice(3)).toEqual(['p/zeta']);
      expect(rec.large_model).toBe(picks.large_model);
      expect(rec.discovered_at).toBe(NOW);
    }
    expect(existsSync(`${path}.lock`)).toBe(false);
    const warn: string[] = [];
    const dup = parseSnapshot(text.replace('    models:\n', '    models:\n      - id: p/zeta\n        discovered_at: 2026-09-05T10:00:00.000Z\n'), path, (m) => warn.push(m));
    expect(dup.ok).toBe(true);
    expect(warn.some((w) => w.includes('duplicate model id p/zeta'))).toBe(true);
  });
  it('preserves previously known models a refresh did not return, sorted and appended, and counts them (REQ-PROVIDER-083)', () => {
    const first = mergeProviderRecord(null, [dm('a'), dm('b'), dm('c')], assignSlots([]), { id: 'p', displayName: 'P', family: null, baseUrl: null, authenticated: true }, NOW);
    const second = mergeProviderRecord(first.record, [dm('b')], assignSlots([{ qualifiedId: 'p/b', id: 'b', available: true }]), { id: 'p', displayName: 'P', family: null, baseUrl: null, authenticated: true }, '2026-09-06T00:00:00.000Z');
    expect(second.preserved).toBe(2);
    expect(second.record.models.map((m) => m.id)).toEqual(['p/b', 'p/a', 'p/c']);
    expect(second.record.models[0]!.discovered_at).toBe('2026-09-06T00:00:00.000Z');
    expect(second.record.models[1]!.discovered_at).toBe(NOW);
  });
  it('rejects an unsupported version, an unknown key, a bad timestamp — naming the path (REQ-PROVIDER-084/085)', () => {
    const p = '/x/project_settings.yaml';
    expect((parseSnapshot('version: 2\nproviders: {}\n', p) as { error: string }).error).toBe(`Invalid project snapshot at ${p}: unsupported project snapshot version`);
    expect((parseSnapshot('version: 1\nextra: 1\n', p) as { error: string }).error).toContain("unknown key 'extra'");
    expect((parseSnapshot('version: 1\nproviders:\n  q:\n    id: q\n    display_name: Q\n    authenticated: true\n    discovered_at: yesterday\n    models: []\n', p) as { error: string }).error).toContain('discovered_at');
    expect((parseSnapshot('version: 1\nproviders:\n  q:\n    id: q\n    display_name: Q\n    authenticated: true\n    discovered_at: 2026-09-05T10:00:00Z\n    models: []\n    colour: red\n', p) as { error: string }).error).toContain("unknown key 'colour'");
    expect(parseSnapshot(': [', p).ok).toBe(false);
  });
  it('REQ-PROVIDER-072 (amended, OQ-21): a decimal-string price survives the write and the read exactly, and a hand-written number reads as its text', () => {
    const rec: ProviderRecord = { id: 'p', display_name: 'P', authenticated: true, discovered_at: NOW, models: [{ id: 'p/m', capabilities: {}, limits: {}, pricing: { input_cost_per_token: '0.0000025', output_cost_per_token: '0.00001' }, discovered_at: NOW }] };
    const text = serializeSnapshot({ version: 1, providers: { p: rec } });
    const back = parseSnapshot(text, 'p.yaml');
    expect(back.ok && back.value.providers['p']!.models[0]!.pricing).toEqual({ input_cost_per_token: '0.0000025', output_cost_per_token: '0.00001' });
    // Written quoted, so the file states a string and no reader takes it as a double.
    expect(text).toContain('input_cost_per_token: "0.0000025"');
    const edited = parseSnapshot(text.replace('"0.0000025"', '2.5e-6'), 'p.yaml');
    expect(edited.ok && edited.value.providers['p']!.models[0]!.pricing['input_cost_per_token']).toBe('0.0000025');
  });
  it('the secret screen refuses secret-like keys and values, exempting only the price and limit keys (REQ-PROVIDER-086)', async () => {
    const rec: ProviderRecord = { id: 'p', display_name: 'P', authenticated: true, discovered_at: NOW, models: [{ id: 'p/m', capabilities: {}, limits: { context_window: 1, max_tokens: 2 }, pricing: { input_cost_per_token: 0.1, output_cost_per_token: 0.2 }, discovered_at: NOW }] };
    expect(screenSecrets({ version: 1, providers: { p: rec } })).toBeNull();
    expect(screenSecrets({ providers: { p: { ...rec, models: [{ ...rec.models[0]!, capabilities: { access_token: 'x' } }] } } })).toBe('providers.p.models[0].capabilities.access_token');
    expect(screenSecrets({ providers: { p: { ...rec, display_name: 'Bearer ghp_abc' } } })).toBe('providers.p.display_name');
    expect(screenSecrets({ providers: { p: { ...rec, display_name: 'sk-or-v1-abc' } } })).toBe('providers.p.display_name');
    expect(screenSecrets({ providers: { p: { ...rec, models: [{ ...rec.models[0]!, capabilities: { session_id: 'x' } }] } } })).toBe('providers.p.models[0].capabilities.session_id');
    expect(screenSecrets({ providers: { p: { ...rec, models: [{ ...rec.models[0]!, capabilities: { 'x-ghu_y': 'x' } }] } } })).toBe('providers.p.models[0].capabilities.x-ghu_y');
    expect(screenSecrets({ providers: { p: { ...rec, models: [{ ...rec.models[0]!, pricing: { image_cost_per_image: '0.01', token_price: 1 } }] } } })).toBe('providers.p.models[0].pricing.token_price');
    const path = join(dir, 'project_settings.yaml');
    const s = storeAt(path);
    await s.upsertProvider(rec);
    const before = readFileSync(path, 'utf8');
    const r = await s.upsertProvider({ ...rec, display_name: 'ghp_leak' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.headline).toBe(`${REFUSED_SECRET} providers.p.display_name`);
    expect(readFileSync(path, 'utf8')).toBe(before);
  });
  it('upsert creates the file; remove reports whether anything was removed (REQ-PROVIDER-087); an invalid file fails the read naming the path', async () => {
    const path = join(dir, 'nested', 'project_settings.yaml');
    const s = storeAt(path);
    const rec: ProviderRecord = { id: 'deepseek', display_name: 'DeepSeek', authenticated: true, discovered_at: NOW, models: [] };
    expect((await s.upsertProvider(rec)).ok).toBe(true);
    expect(await s.removeProvider('nope')).toEqual({ ok: true, value: { removed: false } });
    expect(await s.removeProvider('deepseek')).toEqual({ ok: true, value: { removed: true } });
    expect(readProjectSnapshot(path)).toEqual({ ok: true, value: { version: 1, providers: {} } });
    writeFileSync(path, 'version: 7\n');
    const bad = s.read();
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toBe(`Invalid project snapshot at ${path}: unsupported project snapshot version`);
    expect(serializeSnapshot({ version: 1, providers: {} })).toBe('version: 1\nproviders: {}\n');
  });
});
