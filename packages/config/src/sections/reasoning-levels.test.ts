import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { capabilityReasoningLevels, snapshotCandidateNames, snapshotCapabilityRecords } from '../project-settings.js';
import { offeredReasoningLevels, readModelEntry } from './models.js';
import { readSnapshot } from '../snapshot.js';
import { loadConfiguration } from '../load.js';
import type { ProblemSink } from './field.js';

const dirs: string[] = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'rotaris-reasoning-')); dirs.push(d); return d; };
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

const entryOf = (fields: Record<string, unknown>) => {
  const sink: ProblemSink = { errors: [], warnings: [] };
  const entry = readModelEntry('m', { provider: 'openai-compatible--ds41', model_id: 'ds41', ...fields }, sink);
  expect(sink.errors).toEqual([]);
  return entry!;
};

/**
 * REQ-CONFIG-332 with REQ-CONFIG-069/091/092/202: the levels a model offers — the closed slot/model vocabulary less
 * `auto`, filtered to the entry's own `reasoning_effort_map` keys where it declares any (a map value is a
 * provider-dialect spelling and never a level, so `xhigh` — outside the vocabulary — can never surface), else
 * intersected with the model's catalog capability record; a model with neither offers nothing.
 */
describe('REQ-CONFIG-332 — the offered reasoning levels (the truth table)', () => {
  it('a stated reasoning_effort_map’s keys are the offered levels, in the vocabulary’s order, not the map’s', () => {
    // The ds41 case: a locally hosted endpoint that understands low/high/max only, mapping `max` onto `xhigh`.
    const ds41 = entryOf({ reasoning_effort_map: { max: 'xhigh', low: 'low', high: 'high' } });
    expect(offeredReasoningLevels(ds41, [])).toEqual(['low', 'high', 'max']);
  });

  it('a map key outside the vocabulary never surfaces, however the map is written: `xhigh` is a value spelling, not a level', () => {
    // REQ-CONFIG-092: `xhigh` reaches a provider as a map VALUE; the loader's own thinking reader would reject it as a
    // level (packages/config/src/load.ts, readSlots), so a surface that offered it would write a file the loader refuses.
    expect(offeredReasoningLevels(entryOf({ reasoning_effort_map: { low: 'low', xhigh: 'xhigh' } }), [])).toEqual(['low']);
    expect(offeredReasoningLevels(entryOf({ reasoning_effort_map: { xhigh: 'xhigh' } }), [])).toEqual([]);
  });

  it('an empty map falls through to the capability record: vocabulary ∩ declared levels, in vocabulary order', () => {
    expect(offeredReasoningLevels(entryOf({}), ['low', 'high'])).toEqual(['low', 'high']);
    // The record’s own order and duplicates never matter; the vocabulary’s does.
    expect(offeredReasoningLevels(entryOf({}), ['max', 'medium', 'max', 'low'])).toEqual(['low', 'medium', 'max']);
    // A level the record names that the vocabulary does not know (a future spelling) is not offered.
    expect(offeredReasoningLevels(entryOf({}), ['low', 'xhigh', 'none'])).toEqual(['low']);
    // The record may not introduce `auto`: REQ-CONFIG-093 keeps it reachable only through the appending rule.
    expect(offeredReasoningLevels(entryOf({}), ['auto', 'low'])).toEqual(['low']);
  });

  it('the full set reads back in the vocabulary’s order: low, medium, high, max', () => {
    expect(offeredReasoningLevels(entryOf({}), ['low', 'medium', 'high', 'max'])).toEqual(['low', 'medium', 'high', 'max']);
  });

  it('a model with neither a map nor a capability record offers no levels at all', () => {
    expect(offeredReasoningLevels(entryOf({}), [])).toEqual([]);
    expect(offeredReasoningLevels(entryOf({ reasoning_effort_map: {} }), [])).toEqual([]);
  });
});

describe('REQ-CONFIG-332 / REQ-CONFIG-096 — matching a configured model to its snapshot capability record', () => {
  const entry = (fields: Record<string, unknown>) => entryOf(fields);

  it('tries the REQ-CONFIG-096 ladder: key with a slash, bare model_id, stripped model_id, then each re-qualified', () => {
    expect(snapshotCandidateNames('ds41', entry({ model_id: 'ds41' }))).toEqual(['ds41', 'openai-compatible--ds41/ds41']);
    // Every candidate is re-qualified in the order the requirement lists them: the key, the bare id, the stripped id.
    expect(snapshotCandidateNames('vendor/model-x', entry({ model_id: 'model-x' }))).toEqual(['vendor/model-x', 'model-x', 'openai-compatible--ds41/vendor/model-x', 'openai-compatible--ds41/model-x']);
    expect(snapshotCandidateNames('m', entry({ model_id: 'org/model', auth_provider: 'codex' }))).toEqual(['org/model', 'model', 'openai/org/model', 'openai/model', 'openai-compatible--ds41/org/model', 'openai-compatible--ds41/model']);
  });

  it('reads capabilities.reasoning_levels — the product’s own name for the raw supported_reasoning_levels', () => {
    expect(capabilityReasoningLevels({ reasoning_levels: ['low', 'high'] })).toEqual(['low', 'high']);
    expect(capabilityReasoningLevels({ reasoning_levels: ['low', 7, '', null, 'high'] })).toEqual(['low', 'high']);
    expect(capabilityReasoningLevels({ reasoning_levels: 'low' })).toEqual([]);
    expect(capabilityReasoningLevels({})).toEqual([]);
    expect(capabilityReasoningLevels(undefined)).toEqual([]);
  });

  it('keys records by the snapshot model’s qualified id, first occurrence winning', () => {
    const records = snapshotCapabilityRecords({
      version: 1,
      providers: {
        zeta: { id: 'zeta', display_name: 'Zeta', authenticated: true, discovered_at: '2026-11-08T10:00:00Z', models: [{ id: 'zeta/m', capabilities: { reasoning_levels: ['max'] }, limits: {}, pricing: {}, discovered_at: '2026-11-08T10:00:00Z' }] },
        alpha: { id: 'alpha', display_name: 'Alpha', authenticated: false, discovered_at: '2026-11-08T10:00:00Z', models: [{ id: 'alpha/m', capabilities: { reasoning_levels: ['low'] }, limits: {}, pricing: {}, discovered_at: '2026-11-08T10:00:00Z' }] },
      },
    });
    expect(records['zeta/m']).toEqual({ reasoning_levels: ['max'] });
    // Unauthenticated providers’ models still carry a record: REQ-CONFIG-034’s filter governs the FOLD, not the catalogue.
    expect(records['alpha/m']).toEqual({ reasoning_levels: ['low'] });
  });
});

/**
 * REQ-CONFIG-332: the projection the settings snapshot carries, end to end through the loader — the map route
 * (the ds41 case), the capability-record route, and the no-input route, all in one load.
 */
describe('REQ-CONFIG-332 — the snapshot’s modelReasoning projection', () => {
  const NOW = '2026-11-08T10:00:00.000Z';

  it('every configured key maps to its offered levels; an entry with neither input maps to the empty list', () => {
    const globalDir = join(tmp(), 'config');
    const workspaceRoot = join(tmp(), 'ws');
    mkdirSync(globalDir, { recursive: true });
    mkdirSync(join(workspaceRoot, '.rotaris'), { recursive: true });
    writeFileSync(join(globalDir, 'agents.yaml'), [
      'models:',
      '  ds41: { provider: openai-compatible--ds41, model_id: ds41, base_url: http://127.0.0.1:8000/v1, reasoning_effort_map: { low: low, high: high, max: xhigh } }',
      '  capped: { provider: openai-compatible--pool, model_id: capped, auth_provider: pool }',
      '  bare: { provider: openai-compatible--pool, model_id: bare }',
      '',
    ].join('\n'));
    writeFileSync(join(globalDir, 'project_settings.yaml'), [
      'version: 1',
      'providers:',
      '  pool:',
      '    id: pool',
      '    display_name: Pool',
      '    authenticated: true',
      `    discovered_at: ${NOW}`,
      '    models:',
      '      - id: pool/capped',
      '        capabilities: { reasoning_levels: [low, high] }',
      '        limits: {}',
      '        pricing: {}',
      `        discovered_at: ${NOW}`,
      '',
    ].join('\n'));
    const loaded = loadConfiguration({ globalDir, workspaceRoot });
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const snapshot = readSnapshot(globalDir, workspaceRoot, undefined, { globalDir, home: tmp(), machineDir: tmp(), platform: 'linux' });
    expect(snapshot.modelReasoning).toEqual({
      // The map wins where an author stated one: ds41 understands low/high/max — never `xhigh`, a value spelling.
      ds41: ['low', 'high', 'max'],
      // The capability record of the model the ladder resolved to, through the auth provider's qualified id.
      capped: ['low', 'high'],
      // REQ-CONFIG-034 keys a folded snapshot model under its qualified id; that key reads the same record.
      'pool/capped': ['low', 'high'],
      // A model with neither a map nor a capability record offers nothing — the shipped defaults included.
      bare: [],
      'gpt-4o': [],
      'gpt-4o-mini': [],
    });
    expect(snapshot.models).toEqual(['bare', 'capped', 'ds41', 'gpt-4o', 'gpt-4o-mini', 'pool/capped']);
    // REQ-CONFIG-254: `auto` never appears among a model’s offered levels.
    for (const levels of Object.values(snapshot.modelReasoning)) expect(levels).not.toContain('auto');
  });

  it('a fatal snapshot carries the field as an empty record (REQ-CONFIG-478)', () => {
    const globalDir = join(tmp(), 'config');
    const workspaceRoot = join(tmp(), 'ws');
    mkdirSync(globalDir, { recursive: true });
    mkdirSync(join(workspaceRoot, '.rotaris'), { recursive: true });
    // A YAML syntax fault aborts the load (REQ-CONFIG-019), so the snapshot is the fatal one.
    writeFileSync(join(workspaceRoot, '.rotaris', 'agents.yaml'), 'models: [unclosed\n');
    const snapshot = readSnapshot(globalDir, workspaceRoot, undefined, { globalDir, home: tmp(), machineDir: tmp(), platform: 'linux' });
    expect(snapshot.loadOk).toBe(false);
    expect(snapshot.modelReasoning).toEqual({});
  });
});
