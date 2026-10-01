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
 * (`run_continuation_intent`) and each switch (`entry_model_switched`, REQ-MONITOR-142) — and is `session` only when
 * none of them names one.
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

/** The entry role's resolved model in one configuration snapshot; a loader-made copy reads as its one original. */
export function snapshotEntryKey(snapshot) {
  if (!isMap(snapshot)) return null;
  const role = str(snapshot.default_persona);
  const persona = role !== '' && isMap(snapshot.personas) ? snapshot.personas[role] : undefined;
  const model = isMap(persona) ? str(persona.model) : '';
  if (model === '') return null;
  if (!isSynthetic(model)) return model;
  const models = isMap(snapshot.models) ? snapshot.models : {};
  const copied = copiedFields(models[model]);
  const origins = copied === '' ? [] : Object.keys(models).filter((k) => !isSynthetic(k) && copiedFields(models[k]) === copied);
  return origins.length === 1 ? origins[0] : model;
}

/** Every key the entry agent ran on, in order, consecutive repeats folded; empty when nothing records one. */
export function entryModelKeys(launchAuditPayload, timeline) {
  const keys = [];
  const add = (key) => { if (key !== null && key !== '' && keys[keys.length - 1] !== key) keys.push(key); };
  if (launchAuditPayload !== undefined && launchAuditPayload !== null) add(snapshotEntryKey(parseJson(launchAuditPayload)?.config_snapshot));
  for (const t of timeline) {
    if (t.name === 'run_continuation_intent') add(snapshotEntryKey(parseJson(t.metadata)?.config_snapshot));
    else if (t.name === 'entry_model_switched') add(str(parseJson(t.metadata)?.model) || null);
  }
  return keys;
}

/** The label the reader prints the entry agent's calls under. */
export function entryKeyLabel(keys) {
  return keys.length > 0 ? keys.join(' → ') : 'session';
}
