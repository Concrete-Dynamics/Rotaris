import { describe, expect, it } from 'vitest';
import { capabilityLevelsForEntry, offeredReasoningLevels, providerEffort, readModelEntry, snapshotCapabilityRecords, type ProblemSink } from '@rotaris/config';
import { modelOfItem } from './discovery.js';
import { mergeProviderRecord, parseSnapshot, serializeSnapshot, type ProviderRecord } from './project-settings.js';
import { assignSlots } from './slots.js';

/**
 * PD-CONFIG-006 (REQ-PROVIDER-072 extended, REQ-CONFIG-202/332): the ACCEPTANCE CHAIN, end to end —
 * a discovery payload → `modelOfItem` → `mergeProviderRecord` → `serializeSnapshot` → `parseSnapshot` →
 * `snapshotCapabilityRecords` + `capabilityReasoningLevels` (`@rotaris/config`) → `offeredReasoningLevels`
 * returns exactly the levels the payload declared, `off` and `xhigh` included. Every step is the real one and
 * the middle of the chain is the real serialized string, never an inspected object: what is proved is that the
 * levels survive the document that actually lands on disk.
 *
 * Before PD-CONFIG-006 the vocabulary was closed at five, so `off` and `xhigh` — levels an endpoint such as the
 * owner's locally hosted `ds41` does honour — were clipped away on the last step. The negative control beside
 * this file's sibling (`packages/config/src/sections/reasoning-levels.test.ts`) runs the same declared record
 * against the pre-change five and shows them clipped.
 */

const NOW = '2026-11-08T10:00:00.000Z';

const entryOf = (fields: Record<string, unknown>): ReturnType<typeof readModelEntry> => {
  const sink: ProblemSink = { errors: [], warnings: [] };
  // The configured entry names the provider the snapshot's records are keyed under, which is the ladder's last rung.
  const entry = readModelEntry('ds41', { provider: 'ds41-local', model_id: 'ds41', ...fields }, sink);
  expect(sink.errors).toEqual([]);
  return entry;
};

/** The chain as the product runs it, stopping at the offered set; the serialized string is returned for inspection. */
function offeredThroughTheSnapshot(payload: Record<string, unknown>): { readonly offered: readonly string[]; readonly text: string; readonly record: ProviderRecord } {
  const model = modelOfItem(payload, 'ds41-local')!;
  const { record } = mergeProviderRecord(null, [model], assignSlots([]), { id: 'ds41-local', displayName: 'DS41 local', family: 'openai-compatible', baseUrl: 'http://127.0.0.1:8000/v1', authenticated: true }, NOW);
  const text = serializeSnapshot({ version: 1, providers: { 'ds41-local': record } });
  const parsed = parseSnapshot(text, 'project_settings.yaml');
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) throw new Error(parsed.error);
  const records = snapshotCapabilityRecords(parsed.value);
  const entry = entryOf({})!;
  const offered = offeredReasoningLevels(entry, capabilityLevelsForEntry('ds41', entry, records));
  return { offered, text, record };
}

describe('PD-CONFIG-006 — the acceptance chain, payload → offered levels, through the real serialized string', () => {
  it('a payload declaring off/low/high/xhigh/max has exactly those offered, through the write, the parse and the projection', () => {
    const declared = ['off', 'low', 'high', 'xhigh', 'max'];
    const { offered, text, record } = offeredThroughTheSnapshot({ id: 'ds41', display_name: 'DS41', capabilities: { reasoning_levels: declared } });

    // The step that carries the declaration onto disk wrote it under the product's own name (REQ-PROVIDER-072).
    expect(record.models[0]!.capabilities['reasoning_levels']).toEqual(declared);
    // The real serialized document — what `ProjectSettingsStore` writes and the loader folds — carries the key.
    expect(text).toContain('reasoning_levels:');
    expect(text).toContain('- off');
    expect(text).toContain('- xhigh');
    // And the offered set is exactly the declared levels, in the vocabulary's own order: nothing clipped, nothing added.
    expect(offered).toEqual(declared);
    expect(offered).not.toContain('auto');
    expect(offered).not.toContain('none');
  });

  it('a payload declaring only off and xhigh is offered exactly those two — the levels the old five clipped away', () => {
    const { offered } = offeredThroughTheSnapshot({ id: 'ds41', capabilities: { reasoning_levels: ['off', 'xhigh'] } });
    expect(offered).toEqual(['off', 'xhigh']);
  });

  it('a payload declaring the raw `supported_reasoning_levels` reaches the control through the same chain', () => {
    const { offered, text } = offeredThroughTheSnapshot({ id: 'ds41', supported_reasoning_levels: ['minimal', 'low', 'xhigh'] });
    // `minimal` is no level of this vocabulary, so it is not offered; the two that are arrive in the vocabulary's order.
    expect(offered).toEqual(['low', 'xhigh']);
    expect(text).toContain('reasoning_levels:');
  });

  it('a payload declaring no levels carries no key through the snapshot and offers nothing — never a guess', () => {
    const { offered, text } = offeredThroughTheSnapshot({ id: 'ds41' });
    expect(offered).toEqual([]);
    expect(text).not.toContain('reasoning_levels');
  });

  it('an entry whose map declares the levels remains the model’s source, and `off` reaches the endpoint through it', () => {
    // The other half of PD-CONFIG-006: the map route, unchanged in shape, now admitting `off` and `xhigh` as levels.
    const entry = entryOf({ reasoning_effort_map: { off: 'none', low: 'low', high: 'high', xhigh: 'xhigh', max: 'max' } })!;
    expect(offeredReasoningLevels(entry, [])).toEqual(['off', 'low', 'high', 'xhigh', 'max']);
    // REQ-CONFIG-092 extended: `off` reaches the endpoint as its map entry; with no entry for it, nothing is sent.
    expect(providerEffort(entryOf({ thinking: 'off', reasoning_effort_map: { off: 'none' } })!)).toBe('none');
    expect(providerEffort(entryOf({ thinking: 'off' })!)).toBeNull();
    expect(providerEffort(entryOf({ thinking: 'xhigh' })!)).toBe('xhigh');
  });
});
