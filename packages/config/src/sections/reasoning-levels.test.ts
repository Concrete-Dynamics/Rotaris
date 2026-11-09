import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { capabilityReasoningLevels, snapshotCandidateNames, snapshotCapabilityRecords } from '../project-settings.js';
import { offeredReasoningLevels, providerEffort, readModelEntry } from './models.js';
import { readSnapshot } from '../snapshot.js';
import { loadConfiguration } from '../load.js';
import { REASONING_LEVELS, ROLE_REASONING_LEVELS } from '../keys.js';
import { REASONING_LEVEL_NAMES, ROLE_REASONING_NAMES } from '@rotaris/contracts';
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
 * PD-CONFIG-007 (REQ-CONFIG-332 with REQ-CONFIG-069/091/092/202): the levels a model offers — the slot/model
 * vocabulary less `auto`, filtered to the entry's own `reasoning_effort_map` keys where it declares any (a map key
 * that IS a level surfaces — `xhigh` among them, a level in its own right since PD-CONFIG-007 — while a map VALUE is
 * a provider-dialect spelling and never a level), else intersected with the model's catalog capability record; a
 * model with neither offers nothing.
 */
describe('REQ-CONFIG-332 — the offered reasoning levels (the truth table)', () => {
  it('a stated reasoning_effort_map’s keys are the offered levels, in the vocabulary’s order, not the map’s', () => {
    // The ds41 case: a locally hosted endpoint that understands low/high/max only, mapping `max` onto `xhigh`.
    const ds41 = entryOf({ reasoning_effort_map: { max: 'xhigh', low: 'low', high: 'high' } });
    expect(offeredReasoningLevels(ds41, [])).toEqual(['low', 'high', 'max']);
  });

  it('a map key that IS a level surfaces; a map value never does', () => {
    // PD-CONFIG-007: `xhigh` is a level now (it reaches a provider unchanged, REQ-CONFIG-092), so a map declaring it
    // is a map declaring a level — while a bare `none` value stays the spelling `off` maps TO and is no level.
    expect(offeredReasoningLevels(entryOf({ reasoning_effort_map: { low: 'low', xhigh: 'xhigh' } }), [])).toEqual(['low', 'xhigh']);
    expect(offeredReasoningLevels(entryOf({ reasoning_effort_map: { off: 'none', low: 'low', xhigh: 'xhigh' } }), [])).toEqual(['off', 'low', 'xhigh']);
    // The loader's own thinking reader accepts `xhigh`, so a surface offering it writes a file the loader reads.
    expect(offeredReasoningLevels(entryOf({ reasoning_effort_map: { none: 'none' } }), [])).toEqual([]);
  });

  it('an empty map falls through to the capability record: vocabulary ∩ declared levels, in vocabulary order', () => {
    expect(offeredReasoningLevels(entryOf({}), ['low', 'high'])).toEqual(['low', 'high']);
    // The record’s own order and duplicates never matter; the vocabulary’s does.
    expect(offeredReasoningLevels(entryOf({}), ['max', 'medium', 'max', 'low'])).toEqual(['low', 'medium', 'max']);
    // PD-CONFIG-007: a record declaring `off` and `xhigh` has them offered — the widening is what delivers them.
    expect(offeredReasoningLevels(entryOf({}), ['off', 'none', 'low', 'high', 'xhigh', 'max'])).toEqual(['off', 'low', 'high', 'xhigh', 'max']);
    // A level the record names that the vocabulary does not know (a future spelling) is not offered.
    expect(offeredReasoningLevels(entryOf({}), ['low', 'ultra', 'none'])).toEqual(['low']);
    // The record may not introduce `auto`: REQ-CONFIG-093 keeps it reachable only through the appending rule.
    expect(offeredReasoningLevels(entryOf({}), ['auto', 'low'])).toEqual(['low']);
  });

  it('the full set reads back in the vocabulary’s order: off, low, medium, high, xhigh, max', () => {
    expect(offeredReasoningLevels(entryOf({}), ['off', 'low', 'medium', 'high', 'xhigh', 'max'])).toEqual(['off', 'low', 'medium', 'high', 'xhigh', 'max']);
  });

  it('a model with neither a map nor a capability record offers no levels at all', () => {
    expect(offeredReasoningLevels(entryOf({}), [])).toEqual([]);
    expect(offeredReasoningLevels(entryOf({ reasoning_effort_map: {} }), [])).toEqual([]);
  });
});

/**
 * PD-CONFIG-007 (REQ-CONFIG-069 narrowed, REQ-CONFIG-079 narrowed): the vocabulary itself, in both of its homes —
 * `@rotaris/config`'s `REASONING_LEVELS` and its mirror `REASONING_LEVEL_NAMES` in `@rotaris/contracts` — carries the
 * seven in the directive's own order, and a slot or model `thinking` value of `off` or `xhigh` LOADS where `none` and
 * any other unknown value is still rejected naming the accepted list (the load path, not only the constant).
 */
describe('PD-CONFIG-007 — the widened vocabulary', () => {
  it('the seven, in the directive’s order, in both homes; the per-role vocabulary keeps its derivation', () => {
    expect([...REASONING_LEVELS]).toEqual(['auto', 'off', 'low', 'medium', 'high', 'xhigh', 'max']);
    expect([...REASONING_LEVEL_NAMES]).toEqual(['auto', 'off', 'low', 'medium', 'high', 'xhigh', 'max']);
    expect([...ROLE_REASONING_LEVELS]).toEqual(['default', 'provider_default', 'auto', 'off', 'low', 'medium', 'high', 'xhigh', 'max']);
    expect([...ROLE_REASONING_NAMES]).toEqual(['default', 'provider_default', 'auto', 'off', 'low', 'medium', 'high', 'xhigh', 'max']);
  });

  const load = (workspaceText: string) => {
    const globalDir = join(tmp(), 'config');
    const workspaceRoot = join(tmp(), 'ws');
    mkdirSync(globalDir, { recursive: true });
    mkdirSync(join(workspaceRoot, '.rotaris'), { recursive: true });
    writeFileSync(join(workspaceRoot, '.rotaris', 'agents.yaml'), workspaceText);
    return loadConfiguration({ globalDir, workspaceRoot });
  };

  it('a slot and a model `thinking` of `off` or `xhigh` LOADS; the value is carried as the level it is', () => {
    const r = load([
      'large_model: m',
      'large_model_thinking: off',
      'models:',
      '  m: { provider: openai, model_id: m, thinking: xhigh }',
      '',
    ].join('\n'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.slotThinking.large_model).toBe('off');
    // The slot's reasoning synthesises the reserved copy carrying the level (REQ-CONFIG-076).
    expect(r.value.models['__startup_slot__:large_model']).toMatchObject({ thinking: 'off' });
    expect(r.value.models['m']).toMatchObject({ thinking: 'xhigh' });
  });

  it('a role `thinking` of `off` or `xhigh` LOADS and reaches the synthetic persona copy (REQ-CONFIG-079)', () => {
    const r = load([
      'models:',
      '  m: { provider: openai, model_id: m }',
      'personas:',
      '  verifier: { model: m, thinking: xhigh }',
      '  tester: { model: m, thinking: off }',
      '',
    ].join('\n'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.models['__persona__:verifier']).toMatchObject({ thinking: 'xhigh' });
    expect(r.value.models['__persona__:tester']).toMatchObject({ thinking: 'off' });
  });

  it('`none` — the spelling `off` maps TO — and every other unknown value is still rejected, naming the accepted list', () => {
    for (const bad of ['none', 'ultra', 'minimal']) {
      const r = load(`large_model: m\nlarge_model_thinking: ${bad}\nmodels:\n  m: { provider: openai, model_id: m }\n`);
      expect(r.ok).toBe(false);
      if (r.ok) continue;
      expect(r.error.path).toBe('large_model_thinking');
      expect(r.error.message).toContain('is not a reasoning level');
      expect(r.error.message).toContain('auto, off, low, medium, high, xhigh, max');
    }
    // The model-entry reader is the same rule: a `thinking` of `none` fails the load naming the field.
    const model = load('models:\n  m: { provider: openai, model_id: m, thinking: none }\n');
    expect(model.ok).toBe(false);
    if (!model.ok) expect(model.error.path).toBe('models.m.thinking');
  });
});

/**
 * PD-CONFIG-007 (REQ-CONFIG-092 extended, REQ-CONFIG-089/093): how a level reaches a provider — `off` sends no
 * reasoning-effort field where the entry's map holds no entry for it, its map entry where it holds one; `xhigh` passes
 * through unchanged like `low`; `max` still becomes `xhigh`; `auto` still sends nothing; an explicit `reasoning_effort`
 * still bypasses the whole path.
 */
describe('PD-CONFIG-007 — the effort a provider receives', () => {
  it('`off` with no map entry sends nothing; with one it is sent verbatim, so `off: none` reaches the endpoint as `none`', () => {
    expect(providerEffort({ thinking: 'off', reasoning_effort: null, reasoning_effort_map: {} })).toBeNull();
    expect(providerEffort({ thinking: 'off', reasoning_effort: null, reasoning_effort_map: { off: 'none' } })).toBe('none');
    // The map wins over every other treatment, `off` included.
    expect(providerEffort({ thinking: 'off', reasoning_effort: null, reasoning_effort_map: { off: 'disabled' } })).toBe('disabled');
  });

  it('`xhigh` passes through unchanged, `max` still becomes `xhigh`, `auto` still sends nothing', () => {
    expect(providerEffort({ thinking: 'xhigh', reasoning_effort: null, reasoning_effort_map: {} })).toBe('xhigh');
    expect(providerEffort({ thinking: 'max', reasoning_effort: null, reasoning_effort_map: {} })).toBe('xhigh');
    expect(providerEffort({ thinking: 'auto', reasoning_effort: null, reasoning_effort_map: {} })).toBeNull();
    // PD-CONFIG-007 leaves `auto`'s own handling untouched: it sends nothing and does not consult the map.
    expect(providerEffort({ thinking: 'auto', reasoning_effort: null, reasoning_effort_map: { auto: 'minimal' } })).toBeNull();
    // Unset keeps its meaning exactly: the provider or endpoint decides.
    expect(providerEffort({ thinking: null, reasoning_effort: null, reasoning_effort_map: {} })).toBeNull();
  });

  it('an explicitly configured `reasoning_effort` still bypasses the whole path and is sent verbatim', () => {
    expect(providerEffort({ thinking: 'off', reasoning_effort: 'explicit', reasoning_effort_map: { off: 'none' } })).toBe('explicit');
    expect(providerEffort({ thinking: 'xhigh', reasoning_effort: 'explicit', reasoning_effort_map: {} })).toBe('explicit');
  });
});

/**
 * PD-CONFIG-007 — the NEGATIVE CONTROL. The widening is the thing that delivers `off` and `xhigh`: the same declared
 * capability record, read against the vocabulary as it stood before this change (the closed five of REQ-CONFIG-069),
 * loses both levels. `preChangeVocabulary` restates that predicate deliberately — the point of a negative control is
 * that it fails to deliver what the change delivers — and the assertion beside it shows the current rule delivering
 * exactly those two levels from the same input, so the difference between the two is the vocabulary and nothing else.
 */
describe('PD-CONFIG-007 — the negative control: the pre-change five clip `off` and `xhigh`', () => {
  /** The old rule: `REASONING_LEVELS` as it stood, less `auto`, intersected with the declared levels, in its order. */
  const preChangeVocabulary = (declared: readonly string[]): readonly string[] =>
    ['auto', 'low', 'medium', 'high', 'max'].filter((level) => level !== 'auto').filter((level) => declared.includes(level));

  const declared = ['off', 'none', 'low', 'high', 'xhigh', 'max'];

  it('the declared record read against the old five yields low/high/max — `off` and `xhigh` clipped away', () => {
    expect(preChangeVocabulary(declared)).toEqual(['low', 'high', 'max']);
    // The current rule, over the same input, delivers the two the old one dropped — and those two are exactly the
    // difference between the two answers, so the vocabulary is the only thing that moved.
    const current = offeredReasoningLevels(entryOf({}), declared);
    expect(current).toEqual(['off', 'low', 'high', 'xhigh', 'max']);
    expect(current.filter((level) => !preChangeVocabulary(declared).includes(level))).toEqual(['off', 'xhigh']);
  });

  it('the same holds on the map route: a map declaring off/xhigh yields them now, and the old predicate could not', () => {
    const entry = entryOf({ reasoning_effort_map: { off: 'none', low: 'low', high: 'high', xhigh: 'xhigh' } });
    expect(offeredReasoningLevels(entry, [])).toEqual(['off', 'low', 'high', 'xhigh']);
    // The old vocabulary could not name either level, so neither could survive its filter.
    expect(preChangeVocabulary(['off', 'low', 'high', 'xhigh'])).toEqual(['low', 'high']);
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
      '  ds41: { provider: openai-compatible--ds41, model_id: ds41, base_url: http://127.0.0.1:8000/v1, reasoning_effort_map: { off: none, low: low, high: high, xhigh: xhigh, max: max } }',
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
      '        capabilities: { reasoning_levels: [off, low, high, xhigh, max] }',
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
      // The map wins where an author stated one: ds41's endpoint understands it and says so, `off`/`xhigh` included.
      ds41: ['off', 'low', 'high', 'xhigh', 'max'],
      // The capability record of the model the ladder resolved to, through the auth provider's qualified id.
      capped: ['off', 'low', 'high', 'xhigh', 'max'],
      // REQ-CONFIG-034 keys a folded snapshot model under its qualified id; that key reads the same record.
      'pool/capped': ['off', 'low', 'high', 'xhigh', 'max'],
      // A model with neither a map nor a capability record offers nothing — the shipped defaults included.
      bare: [],
      'gpt-4o': [],
      'gpt-4o-mini': [],
    });
    expect(snapshot.models).toEqual(['bare', 'capped', 'ds41', 'gpt-4o', 'gpt-4o-mini', 'pool/capped']);
    // REQ-CONFIG-254: `auto` never appears among a model’s offered levels.
    for (const levels of Object.values(snapshot.modelReasoning)) expect(levels).not.toContain('auto');
    // PD-CONFIG-007: the widened vocabulary is what delivers `off` and `xhigh`; the pre-change five clip them away.
    for (const levels of Object.values(snapshot.modelReasoning)) {
      for (const level of levels.filter((l) => l !== 'off' && l !== 'xhigh')) expect(REASONING_LEVELS).toContain(level);
    }
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
