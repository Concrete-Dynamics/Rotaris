/**
 * The autopsy reader's entry-agent model key (`apps/desktop/scripts/autopsy.mjs`), pure so that
 * `autopsy-entry-model.test.ts` can pin it against the engine's own `entryModelKeys` (`packages/engine/src/autopsy.ts`),
 * which this mirrors line for line: the script reads the store with `better-sqlite3` and cannot import the engine's
 * TypeScript.
 *
 * Live-run finding a71-13 (`docs/defects/fixed/the-autopsy-reader-attributes-the-roots-calls-to-its-childrens-model-key.md`):
 * the store records a model key for each child and none in the children record for the root, and the reader used to
 * give the root its children's key whenever they shared one. The root's key is read instead from what the store records
 * of the root itself — the launch audit's configuration snapshot (REQ-SESSION-138), each continuation's own snapshot
 * (`run_continuation_intent`) and each switch (`entry_model_switched`, REQ-MONITOR-142), carried through each
 * `model_override` of the pair it runs on (REQ-MONITOR-303) and through the ladder's automatic fallbacks of the root
 * (REQ-ORCH-090, REQ-ORCH-091 b) — and is `session` only when none of them names one.
 */

/** The loader's own prefixes for the models it copies (`packages/config/src/keys.ts`; REQ-CONFIG-076..081). */
const SYNTHETIC_PREFIXES = ['__startup_slot__:', '__persona__:'];
const isSynthetic = (name) => SYNTHETIC_PREFIXES.some((p) => name.startsWith(p));
const str = (v) => (typeof v === 'string' ? v : '');
const isMap = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const parseJson = (text) => {
  try { const v = JSON.parse(text); return isMap(v) ? v : undefined; } catch { return undefined; }
};
const copiedFields = (entry) => {
  if (!isMap(entry)) return '';
  const { thinking: _t, reasoning_effort: _r, ...rest } = entry;
  return JSON.stringify(Object.keys(rest).sort().map((k) => [k, rest[k]]));
};

/** The label a recorded model name reads as: a loader-made copy reads as its one original, else as its own name. */
function modelLabel(models, model) {
  if (!isSynthetic(model)) return model;
  const copied = copiedFields(models[model]);
  const origins = copied === '' ? [] : Object.keys(models).filter((k) => !isSynthetic(k) && copiedFields(models[k]) === copied);
  return origins.length === 1 ? origins[0] : model;
}

/** The `provider|model` pair a `models:` key resolves to in a snapshot (the run's override identity), or null. */
function modelPair(models, key) {
  const entry = models[key];
  if (!isMap(entry) || typeof entry.model_id !== 'string') return null;
  const provider = entry.auth_provider ?? entry.provider;
  return typeof provider === 'string' ? `${provider}|${entry.model_id}` : null;
}

/** What one configuration snapshot records of its entry role's model, or null. */
function snapshotEntry(snapshot) {
  if (!isMap(snapshot)) return null;
  const role = str(snapshot.default_persona);
  const persona = role !== '' && isMap(snapshot.personas) ? snapshot.personas[role] : undefined;
  const model = isMap(persona) ? str(persona.model) : '';
  if (model === '') return null;
  const models = isMap(snapshot.models) ? snapshot.models : {};
  return { models, label: modelLabel(models, model), pair: modelPair(models, model) };
}

/**
 * Each child's model key over its lifetime, keyed by the name its own records carry: its canonical name (REQ-ORCH-044),
 * which its turns run under, so its tool calls and the ladder's entries about it name it by that — never by `given_name`,
 * which differs whenever the model's words hold a space, punctuation or a reused name (the live pack
 * 2026-10-01T17-04-24-814Z). A canonical name is unique only per parent and iteration, so each name maps to every child
 * that carried it, as `{ model_key, spawned_at, completed_at }` windows ordered by spawn, and a record is attributed by its
 * name and instant (`childKeyAt`; the engine's copy says why).
 */
export function childModelKeys(children) {
  const byName = new Map();
  for (const c of [...children].sort((a, b) => (a.spawned_at < b.spawned_at ? -1 : a.spawned_at > b.spawned_at ? 1 : 0))) {
    const windows = byName.get(c.canonical_name) ?? [];
    windows.push({ model_key: c.model_key, spawned_at: c.spawned_at, completed_at: c.completed_at ?? null });
    byName.set(c.canonical_name, windows);
  }
  return byName;
}

/** The label of a record two children of one name could have made, their windows overlapping: both keys, never one by guess. */
export const ambiguousChildKey = (keys) => `ambiguous (${keys.join(' | ')})`;

/**
 * The child model key a record of `name` made at `at` is attributed to: the one child of that name alive then, every key
 * (`ambiguousChildKey`) when windows of different keys hold the instant, and null when none was alive — the root's.
 */
export function childKeyAt(children, name, at) {
  const keys = [...new Set((children.get(name) ?? []).filter((w) => w.spawned_at <= at && (w.completed_at === null || at <= w.completed_at)).map((w) => w.model_key))];
  if (keys.length === 0) return null;
  return keys.length === 1 ? keys[0] : ambiguousChildKey(keys);
}

/** Printed where the record cannot say which key the entry agent ran on: an override may or may not have moved it. */
export const ENTRY_KEY_UNDETERMINED = 'undetermined';

/**
 * Every key the entry agent ran on, in order, consecutive repeats folded; empty when nothing records one. The configured
 * key (launch audit, continuations, switches) carried through the session's `model_override` entries, each of which
 * moves the root exactly when it replaces the `provider|model` pair the root's key resolves to (REQ-MONITOR-303,
 * REQ-ORCH-091 d; the run resolves the root through every override of the session), and moved by the ladder's two
 * automatic moves of an agent no child of its name was alive for at the entry's instant (`children`, from
 * `childModelKeys`, read through `childKeyAt`): `quota_fallback_model` to its `to_key` (REQ-ORCH-091 b,
 * REQ-NOTIFY-082) and `llm_unresponsive` to the one `models:` key resolving to its recorded pair, else the pair itself
 * (REQ-ORCH-090). A child's move leaves the root where it is; the next continuation ends a move (its snapshot's key, or
 * the configured key when it records none), and so does a switch the run rebuilt the root's cell for — not one it
 * records `rebuilds: false` on, onto the model the cell was last built from (a store recording no `rebuilds` reads as
 * rebuilt; since OQ-177 the run records `rebuilds: true` on every switch, so only older stores carry `false`). A switch or a wait choice that `supersedes` a switch the run had not applied yet reads the timeline as if
 * that switch were not recorded — the state before it, the key it printed taken back, every record since read again —
 * and a root move or a child's wait choice recording `switch_pending: true` is read before the pending switch, which
 * applies after it (the engine's copy says why; a store recording neither reads each record where it stands). A
 * continuation recording no snapshot after a switch onto another key than the last snapshot's prints `undetermined`,
 * since whether the switch reaches the new run is OQ-185's open question (the engine's copy says so; until 2026-10-02 the
 * switched key was kept: the-autopsy-reader-keeps-a-switched-key-across-a-continuation-that-records-no-snapshot); and an
 * entry naming a child alive at its instant is that child's, even where a root of the same name was alive too (OQ-158).
 */
export function entryModelKeys(launchAuditPayload, timeline, children) {
  // `configured`: the key the configuration names (snapshot or switch); `base` departs from it only while a move is in force.
  const clone = (s) => ({ ...s, keys: [...s.keys], overrides: new Map(s.overrides) });
  /** The root's chain of overrides followed from `base`: the key it ends on, that key's pair, and the pairs it left. */
  const walk = (s) => {
    if (s.base === null) return null;
    if (s.base.pair === null) return { label: s.overrides.size > 0 ? ENTRY_KEY_UNDETERMINED : s.base.label, pair: null, path: [] };
    let label = s.base.label;
    let pair = s.base.pair;
    const path = [];
    for (;;) {
      if (path.includes(pair)) {
        // A cycle (a store from before the run took a superseded override back): the newest override's target, as the engine's copy.
        const order = [...s.overrides.keys()];
        const newest = path.slice(path.indexOf(pair)).reduce((a, b) => (order.indexOf(b) > order.indexOf(a) ? b : a));
        const o = s.overrides.get(newest);
        return { label: o.key, pair: o.to, path };
      }
      const o = s.overrides.get(pair);
      if (!o || o.to === pair) break;
      path.push(pair);
      label = o.key;
      if (o.to === null) return { label: s.overrides.size > 1 ? ENTRY_KEY_UNDETERMINED : label, pair: null, path };
      pair = o.to;
    }
    return { label, pair, path };
  };
  const effective = (s) => walk(s)?.label ?? null;
  const add = (s, key) => { if (key !== null && key !== '' && s.keys[s.keys.length - 1] !== key) s.keys.push(key); };
  const fromSnapshot = (s, snapshot) => {
    const e = snapshotEntry(snapshot);
    if (!e) {
      // A switch onto another key since the last snapshot naming one: whether it reaches this run is OQ-185's open question, and
      // the snapshot does not say which model the run was configured with — undetermined until a record names one.
      if (s.configured !== null && s.configured.label !== s.snapshotLabel) {
        s.base = s.configured = { label: ENTRY_KEY_UNDETERMINED, pair: null };
        s.fellBack = false;
        add(s, ENTRY_KEY_UNDETERMINED);
        return;
      }
      // A continuation recording no entry model is still a new run, whose root cell is built from the configured model.
      if (s.fellBack) { s.fellBack = false; s.base = s.configured; add(s, s.configured === null ? ENTRY_KEY_UNDETERMINED : effective(s)); }
      return;
    }
    s.models = e.models;
    s.snapshotLabel = e.label;
    s.base = s.configured = { label: e.label, pair: e.pair };
    s.fellBack = false;
    add(s, effective(s));
  };
  /** A root ladder move the record names, or null: an entry naming a child alive at its instant is that child's. */
  const rootMove = (t) => {
    if (t.name !== 'quota_fallback_model' && t.name !== 'llm_unresponsive') return null;
    const meta = parseJson(t.metadata);
    if (meta === undefined || typeof meta.agent !== 'string' || childKeyAt(children, meta.agent, t.at) !== null || typeof meta.to_provider !== 'string' || typeof meta.to_model !== 'string') return null;
    return meta;
  };
  /** One record read as it applies to the root, with no regard to when the run applied a switch (the loop sees to that). */
  const read = (s, t) => {
    if (t.name === 'run_continuation_intent') fromSnapshot(s, parseJson(t.metadata)?.config_snapshot);
    else if (t.name === 'entry_model_switched') {
      const meta = parseJson(t.metadata);
      const key = str(meta?.model);
      if (key === '') return;
      s.configured = { label: modelLabel(s.models, key), pair: modelPair(s.models, key) };
      // `rebuilds: false`: the run did not rebuild the root's cell, so a ladder move in force stands; none recorded: rebuilt.
      if (meta?.rebuilds === false && s.fellBack) return;
      s.base = s.configured;
      s.fellBack = false;
      add(s, effective(s));
    } else if (t.name === 'model_override') {
      const meta = parseJson(t.metadata);
      // An entry carrying `cleared: true` takes the pin on its pair back (REQ-NOTIFY-070/078), or an override a later wait
      // choice superseded (REQ-ORCH-091 d), as the engine's copy reads it (until 2026-10-02 skipped here:
      // the-scripts-autopsy-reader-ignores-a-taken-back-pin).
      if (typeof meta?.provider === 'string' && typeof meta?.model === 'string' && meta?.cleared === true) {
        // A wait choice of the pair took back an override from it (`cause: 'superseded'`): a root that had followed it
        // (`root_cell: 'followed'`: on any pair of the chain from its target on) stays on the chain, read at its end; one still on the pair (`on_pair`) never ran on the target, so the key
        // printed for it is taken back. None recorded (fin6's pins): as before. The engine's copy says why.
        const cleared = `${meta.provider}|${meta.model}`;
        const before = walk(s);
        if (meta.root_cell === 'followed' && before !== null && before.path.includes(cleared)) {
          s.base = { label: before.label, pair: before.pair };
          s.fellBack = true;
        }
        s.overrides.delete(cleared);
        const after = effective(s);
        if (meta.root_cell === 'on_pair' && before !== null && before.path.includes(cleared) && s.keys.at(-1) === before.label && s.keys.at(-2) === after) s.keys.pop();
        else add(s, after);
        return;
      }
      const key = str(meta?.model_key);
      if (typeof meta?.provider !== 'string' || typeof meta?.model !== 'string' || key === '') return;
      const to = typeof meta.to_provider === 'string' && typeof meta.to_model === 'string' ? `${meta.to_provider}|${meta.to_model}` : modelPair(s.models, key);
      s.overrides.delete(`${meta.provider}|${meta.model}`);
      s.overrides.set(`${meta.provider}|${meta.model}`, { key, to });
      add(s, effective(s));
    } else {
      const meta = rootMove(t);
      if (meta === null) return;
      const pair = `${meta.to_provider}|${meta.to_model}`;
      const toKey = str(meta.to_key);
      if (t.name === 'quota_fallback_model' && toKey !== '') s.base = { label: modelLabel(s.models, toKey), pair };
      else {
        const labels = new Set(Object.keys(s.models).filter((k) => modelPair(s.models, k) === pair).map((k) => modelLabel(s.models, k)));
        s.base = { label: labels.size === 1 ? [...labels][0] : `${meta.to_provider}/${meta.to_model}`, pair };
      }
      s.fellBack = true;
      add(s, effective(s));
    }
  };

  let s = { models: {}, base: null, configured: null, snapshotLabel: null, fellBack: false, keys: [], overrides: new Map() };
  if (launchAuditPayload !== undefined && launchAuditPayload !== null) fromSnapshot(s, parseJson(launchAuditPayload)?.config_snapshot);
  // A switch the run has not applied yet (it applies at the root's next turn, which the record does not show): the state
  // before it, the records known to precede that turn (read before it) and those whose place is unknown (read after it).
  let pending = null;
  const replay = (p) => {
    s = clone(p.before);
    for (const t of p.ahead) read(s, t);
    read(s, p.switched);
    for (const t of p.after) read(s, t);
  };
  for (const t of timeline) {
    const meta = t.name === 'entry_model_switched' || t.name === 'model_override' ? parseJson(t.metadata) : undefined;
    const move = rootMove(t);
    // Where the record places it against a pending switch: a root move's `switch_pending`, or a child's wait choice's.
    const placed = move !== null ? move.switch_pending : t.name === 'model_override' ? meta?.switch_pending : undefined;
    if (t.name === 'run_continuation_intent') {
      // A new run, whose root cell is its own: no switch of the run before it is pending in it.
      pending = null;
      read(s, t);
    } else if (t.name === 'entry_model_switched' && str(meta?.model) !== '') {
      if (meta?.supersedes === true && pending !== null) {
        // The pending switch never applied, so it is read as if not recorded (the key it printed taken back with it), and
        // every record since it precedes this one, read from the state before it.
        pending = { before: pending.before, switched: t, ahead: [...pending.ahead, ...pending.after], after: [] };
        replay(pending);
      } else {
        pending = { before: clone(s), switched: t, ahead: [], after: [] };
        read(s, t);
      }
    } else if (t.name === 'model_override' && meta?.supersedes === true && pending !== null) {
      // The root's own wait choice replaced the pending switch, which never ran.
      const p = pending;
      pending = null;
      s = clone(p.before);
      for (const r of [...p.ahead, ...p.after, t]) read(s, r);
    } else if (placed === true && pending !== null) {
      // `switch_pending`: the root moved on the cell from before the switch (by the ladder, or by following a child's wait
      // choice from its next call), and the switch then applies after it, its rebuild resolving through the choice.
      pending.ahead = [...pending.ahead, ...pending.after, t];
      pending.after = [];
      replay(pending);
    } else {
      // `switch_pending: false`: the root's turn had applied the switch before this move or choice, read as recorded.
      if (placed === false) pending = null;
      else pending?.after.push(t);
      read(s, t);
    }
  }
  return s.keys;
}

/** The label the reader prints the entry agent's calls under. */
export function entryKeyLabel(keys) {
  return keys.length > 0 ? keys.join(' → ') : 'session';
}
