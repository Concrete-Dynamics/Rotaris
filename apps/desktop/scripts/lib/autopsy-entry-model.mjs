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
 * Each child's model key, keyed by the name its own records carry: its canonical name (REQ-ORCH-044), which its turns
 * run under, so its tool calls and the ladder's entries about it name it by that — never by `given_name`, which differs
 * whenever the model's words hold a space, punctuation or a reused name (the live pack 2026-10-01T17-04-24-814Z).
 */
export function childModelKeys(children) {
  return new Map(children.map((c) => [c.canonical_name, c.model_key]));
}

/** Printed where the record cannot say which key the entry agent ran on: an override may or may not have moved it. */
export const ENTRY_KEY_UNDETERMINED = 'undetermined';

/**
 * Every key the entry agent ran on, in order, consecutive repeats folded; empty when nothing records one. The configured
 * key (launch audit, continuations, switches) carried through the session's `model_override` entries, each of which
 * moves the root exactly when it replaces the `provider|model` pair the root's key resolves to (REQ-MONITOR-303,
 * REQ-ORCH-091 d; the run resolves the root through every override of the session), and moved by the ladder's two
 * automatic moves of an agent no child is (`childNames`, the canonical names of `childModelKeys`): `quota_fallback_model` to its `to_key` (REQ-ORCH-091 b,
 * REQ-NOTIFY-082) and `llm_unresponsive` to the one `models:` key resolving to its recorded pair, else the pair itself
 * (REQ-ORCH-090). A child's move leaves the root where it is; the next continuation ends a move (its snapshot's key, or
 * the configured key when it records none), and so does a switch — read so even onto the model already configured,
 * which the run does not rebuild the root's cell for (the engine's copy says why).
 */
export function entryModelKeys(launchAuditPayload, timeline, childNames) {
  const children = new Set(childNames);
  const keys = [];
  let models = {};
  let base = null;
  // The key the configuration names (snapshot or switch); `base` departs from it only while a ladder move is in force.
  let configured = null;
  let fellBack = false;
  const overrides = new Map();
  const effective = () => {
    if (base === null) return null;
    if (base.pair === null) return overrides.size > 0 ? ENTRY_KEY_UNDETERMINED : base.label;
    let label = base.label;
    let pair = base.pair;
    for (let hops = 0; hops < 8; hops++) {
      const o = overrides.get(pair);
      if (!o || o.to === pair) break;
      label = o.key;
      if (o.to === null) return overrides.size > 1 ? ENTRY_KEY_UNDETERMINED : label;
      pair = o.to;
    }
    return label;
  };
  const add = (key) => { if (key !== null && key !== '' && keys[keys.length - 1] !== key) keys.push(key); };
  const fromSnapshot = (snapshot) => {
    const e = snapshotEntry(snapshot);
    if (!e) {
      // A continuation recording no entry model is still a new run, whose root cell is built from the configured model.
      if (fellBack) { fellBack = false; base = configured; add(configured === null ? ENTRY_KEY_UNDETERMINED : effective()); }
      return;
    }
    models = e.models;
    base = configured = { label: e.label, pair: e.pair };
    fellBack = false;
    add(effective());
  };
  if (launchAuditPayload !== undefined && launchAuditPayload !== null) fromSnapshot(parseJson(launchAuditPayload)?.config_snapshot);
  for (const t of timeline) {
    if (t.name === 'run_continuation_intent') fromSnapshot(parseJson(t.metadata)?.config_snapshot);
    else if (t.name === 'entry_model_switched') {
      const key = str(parseJson(t.metadata)?.model);
      if (key === '') continue;
      base = configured = { label: modelLabel(models, key), pair: modelPair(models, key) };
      fellBack = false;
      add(effective());
    } else if (t.name === 'model_override') {
      const meta = parseJson(t.metadata);
      const key = str(meta?.model_key);
      if (typeof meta?.provider !== 'string' || typeof meta?.model !== 'string' || key === '') continue;
      const to = typeof meta.to_provider === 'string' && typeof meta.to_model === 'string' ? `${meta.to_provider}|${meta.to_model}` : modelPair(models, key);
      overrides.set(`${meta.provider}|${meta.model}`, { key, to });
      add(effective());
    } else if (t.name === 'quota_fallback_model' || t.name === 'llm_unresponsive') {
      const meta = parseJson(t.metadata);
      if (typeof meta?.agent !== 'string' || children.has(meta.agent) || typeof meta.to_provider !== 'string' || typeof meta.to_model !== 'string') continue;
      const pair = `${meta.to_provider}|${meta.to_model}`;
      const toKey = str(meta.to_key);
      if (t.name === 'quota_fallback_model' && toKey !== '') base = { label: modelLabel(models, toKey), pair };
      else {
        const labels = new Set(Object.keys(models).filter((k) => modelPair(models, k) === pair).map((k) => modelLabel(models, k)));
        base = { label: labels.size === 1 ? [...labels][0] : `${meta.to_provider}/${meta.to_model}`, pair };
      }
      fellBack = true;
      add(effective());
    }
  }
  return keys;
}

/** The label the reader prints the entry agent's calls under. */
export function entryKeyLabel(keys) {
  return keys.length > 0 ? keys.join(' → ') : 'session';
}
