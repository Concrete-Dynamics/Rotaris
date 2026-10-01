/**
 * Live-run finding a71-13: the autopsy reader printed the entry agent under its children's model key whenever they shared
 * one. The script's reader and the engine's (`readAutopsy`) now both take the root's key from the root's own records;
 * this pins the script's copy against the engine's on the same inputs, so the two cannot drift apart.
 */
import { describe, expect, it } from 'vitest';
import { entryModelKeys as engineEntryModelKeys } from '@rotaris/engine';
// @ts-expect-error — the reader's helpers are plain ESM beside the scripts that run them.
import { entryKeyLabel, entryModelKeys } from './autopsy-entry-model.mjs';

const snapshot = (model: string, models: Record<string, unknown> = {}) => ({ default_persona: 'orchestrator', personas: { orchestrator: { model } }, models });
const audit = (model: string, models: Record<string, unknown> = {}) => JSON.stringify({ config_snapshot: snapshot(model, models) });
const entry = (name: string, metadata: unknown) => ({ name, metadata: JSON.stringify(metadata) });
const base = { provider: 'openai-compatible', model_id: 'm', base_url: 'http://e', thinking: null };

const CASES: readonly [string, string | undefined, readonly { name: string; metadata: string }[], readonly string[]][] = [
  ['nothing recorded', undefined, [], []],
  ['the launch audit alone', audit('root-model'), [], ['root-model']],
  ['a launch audit with no entry model', JSON.stringify({ config_snapshot: {} }), [], []],
  ['a switch and two continuations, a repeat folded', audit('root-model'), [entry('entry_model_switched', { model: 'child-model' }), entry('run_continuation_intent', { config_snapshot: snapshot('child-model') }), entry('run_continuation_intent', { config_snapshot: snapshot('third-model') })], ['root-model', 'child-model', 'third-model']],
  ['an override names no agent, so it is not the root\'s', audit('root-model'), [entry('model_override', { model_key: 'other' })], ['root-model']],
  ['a role\'s reasoning copy reads as its one original', audit('__persona__:orchestrator', { 'root-model': base, '__persona__:orchestrator': { ...base, thinking: 'high' } }), [], ['root-model']],
  ['two originals match: the recorded name stands', audit('__persona__:orchestrator', { a: base, b: base, '__persona__:orchestrator': { ...base, thinking: 'high' } }), [], ['__persona__:orchestrator']],
  ['unreadable metadata is skipped', audit('root-model'), [{ name: 'entry_model_switched', metadata: '{' }], ['root-model']],
];

describe('the autopsy reader\'s entry-agent model key (live-run finding a71-13)', () => {
  it.each(CASES)('%s', (_name, payload, timeline, expected) => {
    expect(entryModelKeys(payload, timeline)).toEqual(expected);
    expect(engineEntryModelKeys(payload, timeline)).toEqual(expected);
  });

  it('labels the keys in order, and `session` only when none is recorded', () => {
    expect(entryKeyLabel([])).toBe('session');
    expect(entryKeyLabel(['root-model'])).toBe('root-model');
    expect(entryKeyLabel(['root-model', 'child-model'])).toBe('root-model → child-model');
  });
});
