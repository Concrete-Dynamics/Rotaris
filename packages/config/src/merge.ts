import { LEGACY_ROLE_ALIASES } from '@rotaris/contracts';
import { keyClass, NAMED_ENTRY_KEYS, type KeyClass } from './keys.js';

/**
 * The four merge classes of REQ-CONFIG-040..050, and nothing else (REQ-CONFIG-461): replace-if-not-null;
 * named entries that union by name and overlay one level of immediate fields; sections that overlay per
 * field recursively through nested mappings; computed keys that never come from a file. No list's CONTENTS
 * ever merge (REQ-CONFIG-050).
 *
 * The section overlay is written once over a mapping adapter so the loader (plain values) and the scoped
 * per-field writer (the YAML document tree, comments intact) run the SAME function — ADR-0036's
 * "divergence a compile-time impossibility".
 */
export type PlainMap = Record<string, unknown>;

export interface MapOps<M> {
  isMap(value: unknown): value is M;
  keys(map: M): readonly string[];
  get(map: M, key: string): unknown;
  set(map: M, key: string, value: unknown): void;
  /** A deep copy of a value taken from a lower layer, so a later overlay never mutates the source. */
  clone(value: unknown): unknown;
}

export function isPlainMap(value: unknown): value is PlainMap {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function clonePlain<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => clonePlain(v)) as unknown as T;
  if (isPlainMap(value)) {
    const out: PlainMap = {};
    for (const [k, v] of Object.entries(value)) out[k] = clonePlain(v);
    return out as T;
  }
  return value;
}

export const PLAIN_OPS: MapOps<PlainMap> = {
  isMap: isPlainMap,
  keys: (m) => Object.keys(m),
  get: (m, k) => m[k],
  set: (m, k, v) => { m[k] = v; },
  clone: clonePlain,
};

/**
 * REQ-CONFIG-047/048: a section overlay — every field the patch states overlays the target's, recursively
 * wherever both hold a mapping at the same path; a field the patch does not state is inherited. A list or
 * a scalar in the patch replaces whatever the target held (REQ-CONFIG-050).
 */
export function overlaySection<M>(target: M, patch: M, ops: MapOps<M>): void {
  for (const key of ops.keys(patch)) {
    const incoming = ops.get(patch, key);
    const current = ops.get(target, key);
    if (ops.isMap(incoming) && ops.isMap(current)) overlaySection(current, incoming, ops);
    else ops.set(target, key, ops.clone(incoming));
  }
}

/**
 * REQ-CONFIG-043..046: one named entry overlaid onto an inherited one — immediate fields only; a nested
 * mapping or a list inside the entry is replaced wholesale. A null field CLEARS (REQ-CONFIG-053).
 */
export function overlayEntry<M>(target: M, patch: M, ops: MapOps<M>): void {
  for (const key of ops.keys(patch)) ops.set(target, key, ops.clone(ops.get(patch, key)));
}

export interface Layer {
  /** Where the layer came from, for the unknown-key warning (REQ-CONFIG-040 "naming the key and the file"). */
  readonly source: string;
  readonly value: PlainMap;
}

export interface MergeWarning {
  readonly source: string;
  readonly path: string;
  readonly message: string;
}

export interface Merged {
  readonly value: PlainMap;
  readonly warnings: readonly MergeWarning[];
}

/** REQ-CONFIG-031: layers fold in the order given, later winning, under the four classes. */
export function mergeLayers(layers: readonly Layer[], classify: (key: string) => KeyClass = keyClass): Merged {
  const value: PlainMap = {};
  const warnings: MergeWarning[] = [];
  for (const layer of layers) {
    for (const [key, incoming] of Object.entries(layer.value)) {
      switch (classify(key)) {
        case 'replace':
          // REQ-CONFIG-052: null and absent are the same thing for this class.
          if (incoming !== null && incoming !== undefined) value[key] = clonePlain(incoming);
          break;
        case 'named': {
          if (!isPlainMap(incoming)) break;
          const existing = isPlainMap(value[key]) ? (value[key] as PlainMap) : {};
          for (const [name, entry] of Object.entries(incoming)) {
            const current = existing[name];
            if (isPlainMap(entry) && isPlainMap(current)) overlayEntry(current, entry, PLAIN_OPS);
            else existing[name] = clonePlain(entry);
          }
          value[key] = existing;
          break;
        }
        case 'section': {
          // REQ-CONFIG-054: a bare section key means unset and contributes nothing.
          if (incoming === null || incoming === undefined) break;
          if (!isPlainMap(incoming)) { value[key] = clonePlain(incoming); break; }
          const current = isPlainMap(value[key]) ? (value[key] as PlainMap) : {};
          overlaySection(current, incoming, PLAIN_OPS);
          value[key] = current;
          break;
        }
        case 'computed':
          // REQ-CONFIG-049: a computed key written into a file has no effect.
          break;
        case 'separate':
          break;
        case 'unknown':
          warnings.push({ source: layer.source, path: key, message: `unknown top-level key '${key}' contributes nothing and is left in place` });
          break;
      }
    }
  }
  return { value, warnings };
}

/**
 * REQ-CONFIG-062: legacy role-name canonicalisation, applied to ONE scope's value before any merge. Two keys
 * that canonicalise to the same role are field-merged, later winning per field; non-string keys and
 * non-mapping role values pass through untouched.
 */
export function canonicaliseRoles(value: PlainMap, aliases: Readonly<Record<string, string>> = LEGACY_ROLE_ALIASES): PlainMap {
  const canon = (name: unknown): unknown => (typeof name === 'string' && aliases[name] !== undefined ? aliases[name] : name);
  const out: PlainMap = { ...value };
  if (typeof out['default_persona'] === 'string') out['default_persona'] = canon(out['default_persona']);
  const personas = out['personas'];
  if (isPlainMap(personas)) {
    const rewritten: PlainMap = {};
    for (const [key, role] of Object.entries(personas)) {
      const target = String(canon(key));
      let entry: unknown = role;
      if (isPlainMap(role)) {
        const copy: PlainMap = { ...role };
        if (typeof copy['name'] === 'string') copy['name'] = canon(copy['name']);
        if (Array.isArray(copy['delegates_to'])) copy['delegates_to'] = copy['delegates_to'].map(canon);
        if (isPlainMap(copy['tool_restrictions'])) {
          const restrictions: PlainMap = {};
          for (const [k, v] of Object.entries(copy['tool_restrictions'])) restrictions[String(canon(k))] = v;
          copy['tool_restrictions'] = restrictions;
        }
        entry = copy;
      }
      const current = rewritten[target];
      rewritten[target] = isPlainMap(current) && isPlainMap(entry) ? { ...current, ...entry } : entry;
    }
    out['personas'] = rewritten;
  }
  return out;
}

export const NAMED_ENTRY_KEY_SET: ReadonlySet<string> = new Set(NAMED_ENTRY_KEYS);
