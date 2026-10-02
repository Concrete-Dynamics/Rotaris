/**
 * Live-run finding a71-13: the autopsy reader printed the entry agent under its children's model key whenever they shared
 * one. The script's reader and the engine's (`readAutopsy`) now both take the root's key from the root's own records;
 * this pins the script's copy against the engine's on the same inputs, so the two cannot drift apart — including the
 * ladder's automatic moves of the root
 * (`docs/defects/fixed/the-autopsy-reader-does-not-read-the-roots-automatic-model-fallbacks.md`).
 */
import { describe, expect, it } from 'vitest';
import { childKeyAt as engineChildKeyAt, childModelKeys as engineChildModelKeys, ENTRY_KEY_UNDETERMINED, entryModelKeys as engineEntryModelKeys } from '@rotaris/engine';
// @ts-expect-error — the reader's helpers are plain ESM beside the scripts that run them.
import { childKeyAt, childModelKeys, ENTRY_KEY_UNDETERMINED as SCRIPT_UNDETERMINED, entryKeyLabel, entryModelKeys } from './autopsy-entry-model.mjs';

const snapshot = (model: string, models: Record<string, unknown> = {}) => ({ default_persona: 'orchestrator', personas: { orchestrator: { model } }, models });
const audit = (model: string, models: Record<string, unknown> = {}) => JSON.stringify({ config_snapshot: snapshot(model, models) });
const T0 = '2026-10-01T10:00:00.000Z';
const entry = (name: string, metadata: unknown, at = T0) => ({ name, metadata: JSON.stringify(metadata), at });
/** Children alive for the whole session, by name: the shape `childModelKeys` builds from the children record. */
const kids = (...names: string[]) => new Map(names.map((n) => [n, [{ model_key: 'child-model', spawned_at: '', completed_at: null }]]));
const base = { provider: 'openai-compatible', model_id: 'm', base_url: 'http://e', thinking: null };
const paired = {
  'root-model': { provider: 'openai-compatible', auth_provider: 'katalyst', model_id: 'r' },
  'child-model': { provider: 'openai', auth_provider: null, model_id: 'c' },
  'spare-model': { provider: 'anthropic', auth_provider: null, model_id: 's' },
};
const override = (provider: string, model: string, key: string, toProvider: string, toModel: string) => entry('model_override', { provider, model, model_key: key, to_provider: toProvider, to_model: toModel });

type Entry = { name: string; metadata: string; at: string };
const CASES: readonly [string, string | undefined, readonly Entry[], readonly string[]][] = [
  ['nothing recorded', undefined, [], []],
  ['the launch audit alone', audit('root-model'), [], ['root-model']],
  ['a launch audit with no entry model', JSON.stringify({ config_snapshot: {} }), [], []],
  ['a switch and two continuations, a repeat folded', audit('root-model'), [entry('entry_model_switched', { model: 'child-model' }), entry('run_continuation_intent', { config_snapshot: snapshot('child-model') }), entry('run_continuation_intent', { config_snapshot: snapshot('third-model') })], ['root-model', 'child-model', 'third-model']],
  ['an override of the root\'s own pair moves it, and a continuation keeps the override', audit('root-model', paired), [override('katalyst', 'r', 'spare-model', 'anthropic', 's'), entry('run_continuation_intent', { config_snapshot: snapshot('root-model', paired) })], ['root-model', 'spare-model']],
  ['an override of a child\'s different pair leaves the root on its own key', audit('root-model', paired), [override('openai', 'c', 'spare-model', 'anthropic', 's')], ['root-model']],
  ['a later switch onto an overridden pair runs on the override', audit('root-model', paired), [override('openai', 'c', 'spare-model', 'anthropic', 's'), entry('entry_model_switched', { model: 'child-model' })], ['root-model', 'spare-model']],
  ['an override chain is followed', audit('root-model', paired), [override('katalyst', 'r', 'child-model', 'openai', 'c'), override('openai', 'c', 'spare-model', 'anthropic', 's')], ['root-model', 'child-model', 'spare-model']],
  ['an override the snapshot cannot place against the root makes the key undetermined', audit('root-model'), [override('openai', 'c', 'spare-model', 'anthropic', 's')], ['root-model', ENTRY_KEY_UNDETERMINED]],
  ['an override with no pair recorded is skipped', audit('root-model', paired), [entry('model_override', { model_key: 'other' })], ['root-model']],
  ['a role\'s reasoning copy reads as its one original', audit('__persona__:orchestrator', { 'root-model': base, '__persona__:orchestrator': { ...base, thinking: 'high' } }), [], ['root-model']],
  ['two originals match: the recorded name stands', audit('__persona__:orchestrator', { a: base, b: base, '__persona__:orchestrator': { ...base, thinking: 'high' } }), [], ['__persona__:orchestrator']],
  ['unreadable metadata is skipped', audit('root-model'), [{ name: 'entry_model_switched', metadata: '{', at: T0 }], ['root-model']],
];

describe('the autopsy reader\'s entry-agent model key (live-run finding a71-13)', () => {
  it.each(CASES)('%s', (_name, payload, timeline, expected) => {
    expect(entryModelKeys(payload, timeline, new Map())).toEqual(expected);
    expect(engineEntryModelKeys(payload, timeline, new Map())).toEqual(expected);
  });

  // The ladder's automatic moves (REQ-ORCH-090, REQ-ORCH-091 b): read for an agent no child is, never for a child.
  const sameTier = (agent: string, toProvider: string, toModel: string, toKey: string) => entry('quota_fallback_model', { agent, from_provider: 'katalyst', from_model: 'r', to_provider: toProvider, to_model: toModel, to_key: toKey, condition: 'rate_limit' });
  const unresponsive = (agent: string, toProvider: string, toModel: string) => entry('llm_unresponsive', { agent, from_provider: 'katalyst', from_model: 'r', to_provider: toProvider, to_model: toModel, threshold_seconds: 60 });
  const MOVES: readonly [string, string | undefined, readonly Entry[], readonly string[], readonly string[]][] = [
    ['the root\'s same-tier fallback moves it to the candidate\'s key', audit('root-model', paired), [sameTier('orchestrator', 'anthropic', 's', 'spare-model')], ['impl'], ['root-model', 'spare-model']],
    ['the root\'s unresponsive fallback moves it to the key resolving to the pair', audit('root-model', paired), [unresponsive('orchestrator', 'anthropic', 's')], ['impl'], ['root-model', 'spare-model']],
    ['an unresponsive fallback onto a pair no key resolves to reads as the pair', audit('root-model', paired), [unresponsive('orchestrator', 'mistral', 'x')], ['impl'], ['root-model', 'mistral/x']],
    ['two keys resolving to the pair: the pair stands', audit('root-model', { ...paired, 'spare-two': { provider: 'anthropic', auth_provider: null, model_id: 's' } }), [unresponsive('orchestrator', 'anthropic', 's')], [], ['root-model', 'anthropic/s']],
    ['a child\'s moves leave the root where it is', audit('root-model', paired), [sameTier('impl', 'anthropic', 's', 'spare-model'), unresponsive('impl', 'anthropic', 's')], ['impl'], ['root-model']],
    ['an override of the pair the root fell back to follows it', audit('root-model', paired), [sameTier('orchestrator', 'openai', 'c', 'child-model'), override('openai', 'c', 'spare-model', 'anthropic', 's')], ['impl'], ['root-model', 'child-model', 'spare-model']],
    ['a continuation\'s snapshot ends the root\'s move', audit('root-model', paired), [sameTier('orchestrator', 'anthropic', 's', 'spare-model'), entry('run_continuation_intent', { config_snapshot: snapshot('root-model', paired) })], ['impl'], ['root-model', 'spare-model', 'root-model']],
    ['a continuation recording no entry model still ends the root\'s move, back to the configured key', audit('root-model', paired), [sameTier('orchestrator', 'anthropic', 's', 'spare-model'), entry('run_continuation_intent', { config_snapshot: {} })], ['impl'], ['root-model', 'spare-model', 'root-model']],
    ['with no configured key ever recorded, it ends the move undetermined', undefined, [sameTier('orchestrator', 'anthropic', 's', 'spare-model'), entry('run_continuation_intent', { config_snapshot: {} })], [], ['spare-model', ENTRY_KEY_UNDETERMINED]],
    ['with no move in force, a continuation recording no entry model leaves the key', audit('root-model', paired), [entry('run_continuation_intent', { config_snapshot: {} })], [], ['root-model']],
    ['a switch the run rebuilds the root\'s cell for ends the root\'s move', audit('root-model', paired), [sameTier('orchestrator', 'anthropic', 's', 'spare-model'), entry('entry_model_switched', { model: 'child-model', rebuilds: true })], [], ['root-model', 'spare-model', 'child-model']],
    // run.ts `setEntryModel`: a switch onto the model the root's cell was last built from does not rebuild it (`rootResilience`), so the move stands.
    ['a switch onto the model already configured, which the run records it does not rebuild for, leaves the root\'s move in force', audit('root-model', paired), [sameTier('orchestrator', 'anthropic', 's', 'spare-model'), entry('entry_model_switched', { model: 'root-model', rebuilds: false })], [], ['root-model', 'spare-model']],
    ['… and the next continuation recording no entry model ends that move, back to the switched key', audit('root-model', paired), [sameTier('orchestrator', 'anthropic', 's', 'spare-model'), entry('entry_model_switched', { model: 'root-model', rebuilds: false }), entry('run_continuation_intent', { config_snapshot: {} })], [], ['root-model', 'spare-model', 'root-model']],
    ['a switch recording no rebuild with no move in force runs on the switched key', audit('root-model', paired), [entry('entry_model_switched', { model: 'child-model', rebuilds: true }), entry('entry_model_switched', { model: 'root-model', rebuilds: false })], [], ['root-model', 'child-model', 'root-model']],
    // A store written before the run recorded `rebuilds` keeps the earlier reading: the switch ends the move.
    ['a switch recording no `rebuilds` (an older store) ends the root\'s move', audit('root-model', paired), [sameTier('orchestrator', 'anthropic', 's', 'spare-model'), entry('entry_model_switched', { model: 'root-model' })], [], ['root-model', 'spare-model', 'root-model']],
    // The verifier's away-and-back case: two switches with no root turn between them. The first never applied, so the second
    // is read from the state before it, and the run (`rootResilience`) keeps the fallback the reader must keep too.
    ['away from the configured model and back with no turn between: the first never applied, the move stands', audit('root-model', paired), [sameTier('orchestrator', 'anthropic', 's', 'spare-model'), entry('entry_model_switched', { model: 'child-model', rebuilds: true, supersedes: false }), entry('entry_model_switched', { model: 'root-model', rebuilds: false, supersedes: true })], [], ['root-model', 'spare-model']],
    ['… and a third switch in the chain is read from the same state, never the superseded one\'s', audit('root-model', paired), [sameTier('orchestrator', 'anthropic', 's', 'spare-model'), entry('entry_model_switched', { model: 'child-model', rebuilds: true, supersedes: false }), entry('entry_model_switched', { model: 'root-model', rebuilds: false, supersedes: true }), entry('entry_model_switched', { model: 'child-model', rebuilds: true, supersedes: true })], [], ['root-model', 'spare-model', 'child-model']],
    ['a switch after the root\'s turn applied the one before it supersedes nothing: it is read as recorded', audit('root-model', paired), [sameTier('orchestrator', 'anthropic', 's', 'spare-model'), entry('entry_model_switched', { model: 'child-model', rebuilds: true, supersedes: false }), entry('entry_model_switched', { model: 'root-model', rebuilds: true, supersedes: false })], [], ['root-model', 'spare-model', 'child-model', 'root-model']],
    // run.ts: the root's own wait choice replaces a switch not yet applied; the choice moves the pair the root was waiting on.
    ['the root\'s wait choice that supersedes a pending switch moves the root from where it was, the switch never ran', audit('root-model', paired), [sameTier('orchestrator', 'anthropic', 's', 'spare-model'), entry('entry_model_switched', { model: 'child-model', rebuilds: true, supersedes: false }), entry('model_override', { provider: 'anthropic', model: 's', model_key: 'root-model', to_provider: 'katalyst', to_model: 'r', supersedes: true })], [], ['root-model', 'spare-model', 'root-model']],
    ['a move with no agent or no pair recorded is skipped', audit('root-model', paired), [entry('quota_fallback_model', { to_provider: 'anthropic', to_model: 's', to_key: 'spare-model' }), entry('llm_unresponsive', { agent: 'orchestrator' })], [], ['root-model']],
  ];
  it.each(MOVES)('%s', (_name, payload, timeline, children, expected) => {
    expect(entryModelKeys(payload, timeline, kids(...children))).toEqual(expected);
    expect(engineEntryModelKeys(payload, timeline, kids(...children))).toEqual(expected);
  });

  // The live pack 2026-10-01T17-04-24-814Z: a child given 'Run 13 shell commands verbatim' runs, calls and falls back as
  // 'Run-13-shell-commands-verbatim' (REQ-ORCH-044), so both readers know it by that name, never by the one it was given.
  it('knows a child by its canonical name, so its move leaves the root where it is', () => {
    const rows = [{ given_name: 'Run 13 shell commands verbatim', canonical_name: 'Run-13-shell-commands-verbatim', model_key: 'child-model', spawned_at: '2026-10-01T09:00:00.000Z', completed_at: null }];
    for (const keys of [childModelKeys(rows) as ReturnType<typeof engineChildModelKeys>, engineChildModelKeys(rows)]) {
      expect([...keys.keys()]).toEqual(['Run-13-shell-commands-verbatim']);
      const timeline = [sameTier('Run-13-shell-commands-verbatim', 'anthropic', 's', 'spare-model'), unresponsive('Run-13-shell-commands-verbatim', 'anthropic', 's')];
      expect(entryModelKeys(audit('root-model', paired), timeline, keys)).toEqual(['root-model']);
      expect(engineEntryModelKeys(audit('root-model', paired), timeline, keys)).toEqual(['root-model']);
    }
  });

  // The defect note's pair: two children of one session sharing the canonical name `impl` (REQ-ORCH-044 makes a name unique
  // per parent and iteration only), `big-model` in the first run and `small-model` in the second. Keyed by name alone, the
  // later child's key took every call of both.
  const T = (m: number) => `2026-10-01T10:${String(m).padStart(2, '0')}:00.000Z`;
  const runs = [
    { canonical_name: 'impl', model_key: 'big-model', spawned_at: T(2), completed_at: T(5) },
    { canonical_name: 'impl', model_key: 'small-model', spawned_at: T(10), completed_at: T(15) },
  ];
  const overlapping = [
    { canonical_name: 'impl', model_key: 'small-model', spawned_at: T(5), completed_at: null },
    { canonical_name: 'impl', model_key: 'big-model', spawned_at: T(2), completed_at: T(8) },
  ];
  const readers = [['script', childModelKeys, childKeyAt], ['engine', engineChildModelKeys, engineChildKeyAt]] as const;

  it.each(readers)('the %s reader attributes two same-named children by their lifetimes: each call to the child alive when it started, else the root', (_name, build, keyAt) => {
    const keys = build(runs);
    expect(keyAt(keys, 'impl', T(3))).toBe('big-model');
    expect(keyAt(keys, 'impl', T(5))).toBe('big-model');
    expect(keyAt(keys, 'impl', T(11))).toBe('small-model');
    // Outside every window of its name, and a name no child carries: the root's.
    expect(keyAt(keys, 'impl', T(7))).toBeNull();
    expect(keyAt(keys, 'orchestrator', T(3))).toBeNull();
  });

  it.each(readers)('the %s reader prints a call two overlapping windows of one name hold as ambiguous, naming both keys in spawn order', (_name, build, keyAt) => {
    const keys = build(overlapping);
    expect(keyAt(keys, 'impl', T(3))).toBe('big-model');
    expect(keyAt(keys, 'impl', T(6))).toBe('ambiguous (big-model | small-model)');
    expect(keyAt(keys, 'impl', T(9))).toBe('small-model');
  });

  it('a root named like an earlier child: the ladder\'s move of it after that child\'s lifetime moves the root, during it is the child\'s', () => {
    const rows = [{ canonical_name: 'planner', model_key: 'child-model', spawned_at: T(2), completed_at: T(5) }];
    const during = [entry('quota_fallback_model', { agent: 'planner', from_provider: 'openai', from_model: 'c', to_provider: 'anthropic', to_model: 's', to_key: 'spare-model' }, T(3))];
    const after = [entry('quota_fallback_model', { agent: 'planner', from_provider: 'katalyst', from_model: 'r', to_provider: 'anthropic', to_model: 's', to_key: 'spare-model' }, T(11))];
    for (const [read, keys] of [[entryModelKeys, childModelKeys(rows)], [engineEntryModelKeys, engineChildModelKeys(rows)]] as const) {
      expect(read(audit('root-model', paired), during, keys)).toEqual(['root-model']);
      expect(read(audit('root-model', paired), after, keys)).toEqual(['root-model', 'spare-model']);
    }
  });

  it('prints the same word for an undetermined key', () => {
    expect(SCRIPT_UNDETERMINED).toBe(ENTRY_KEY_UNDETERMINED);
  });

  it('labels the keys in order, and `session` only when none is recorded', () => {
    expect(entryKeyLabel([])).toBe('session');
    expect(entryKeyLabel(['root-model'])).toBe('root-model');
    expect(entryKeyLabel(['root-model', 'child-model'])).toBe('root-model → child-model');
  });
});
