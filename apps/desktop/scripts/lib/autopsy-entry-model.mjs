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
 * and a root move recording `switch_pending: true` is read before the pending switch, which applies after it (the
 * engine's copy says why; a store recording neither reads each record where it stands). A
 * continuation recording no snapshot
 * returns the root to the last switched key, though a switch is held on its run alone and the new run starts on its
 * configuration's model (the engine's copy says so; the-autopsy-reader-keeps-a-switched-key-across-a-continuation-that-records-no-snapshot); and an entry naming a child alive at its instant is that child's,
 * even where a root of the same name was alive too (OQ-158).
 */
export function entryModelKeys(launchAuditPayload, timeline, children) {
  // `configured`: the key the configuration names (snapshot or switch); `base` departs from it only while a move is in force.
  const clone = (s) => ({ ...s, keys: [...s.keys], overrides: new Map(s.overrides) });
  const effective = (s) => {
    if (s.base === null) return null;
    if (s.base.pair === null) return s.overrides.size > 0 ? ENTRY_KEY_UNDETERMINED : s.base.label;
    let label = s.base.label;
    let pair = s.base.pair;
    for (let hops = 0; hops < 8; hops++) {
      const o = s.overrides.get(pair);
      if (!o || o.to === pair) break;
      label = o.key;
      if (o.to === null) return s.overrides.size > 1 ? ENTRY_KEY_UNDETERMINED : label;
      pair = o.to;
    }
    return label;
  };
  const add = (s, key) => { if (key !== null && key !== '' && s.keys[s.keys.length - 1] !== key) s.keys.push(key); };
  const fromSnapshot = (s, snapshot) => {
    const e = snapshotEntry(snapshot);
    if (!e) {
      // A continuation recording no entry model is still a new run, whose root cell is built from the configured model.
      if (s.fellBack) { s.fellBack = false; s.base = s.configured; add(s, s.configured === null ? ENTRY_KEY_UNDETERMINED : effective(s)); }
      return;
    }
    s.models = e.models;
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
      const key = str(meta?.model_key);
      if (typeof meta?.provider !== 'string' || typeof meta?.model !== 'string' || key === '') return;
      const to = typeof meta.to_provider === 'string' && typeof meta.to_model === 'string' ? `${meta.to_provider}|${meta.to_model}` : modelPair(s.models, key);
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

  let s = { models: {}, base: null, configured: null, fellBack: false, keys: [], overrides: new Map() };
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
    } else if (move !== null && pending !== null && move.switch_pending === true) {
      // `switch_pending`: the root moved on the cell from before the switch, which then applies after the move.
      pending.ahead = [...pending.ahead, ...pending.after, t];
      pending.after = [];
      replay(pending);
    } else {
      // `switch_pending: false`: the root's turn had applied the switch before this move, read as recorded.
      if (move !== null && move.switch_pending === false) pending = null;
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
