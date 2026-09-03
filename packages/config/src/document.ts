import { parseDocument, isMap, isSeq, isScalar, isNode, type Document, type Node, type YAMLMap, type YAMLSeq } from 'yaml';
import { err, ok, type Result } from '@rotaris/kernel';

/**
 * ADR-0036 alternative B: configuration is parsed to the document tree over a tri-state model — a key
 * that is absent, a key that is present with a null value, and a key with a value are three different
 * things (REQ-CONFIG-056/057; REQ-HOOKS-011 relies on the distinction). The default 1.2 core schema is
 * used, under which `on`/`off` stay strings and only the literal boolean spellings fold (REQ-CONFIG-015,
 * REQ-CONFIG-020); an unknown language tag is resolved as a string by the library and is not an error.
 *
 * This is the loader's first slice. It reads sections; it writes nothing; it takes no database handle.
 */
export type Tri<T> = { readonly kind: 'absent' } | { readonly kind: 'null' } | { readonly kind: 'value'; readonly value: T };
export const ABSENT: Tri<never> = { kind: 'absent' };
export const NULL: Tri<never> = { kind: 'null' };

export interface ParsedConfig {
  readonly doc: Document.Parsed;
  /** The top-level mapping, or null when the document is empty or its top level is not a mapping. */
  readonly root: YAMLMap | null;
  readonly topLevelType: TypeName;
}

export type TypeName = 'mapping' | 'list' | 'string' | 'number' | 'boolean' | 'null';

export function typeNameOf(node: unknown): TypeName {
  if (node === null || node === undefined) return 'null';
  if (isMap(node)) return 'mapping';
  if (isSeq(node)) return 'list';
  if (isScalar(node)) {
    const v = node.value;
    if (v === null || v === undefined) return 'null';
    if (typeof v === 'number' || typeof v === 'bigint') return 'number';
    if (typeof v === 'boolean') return 'boolean';
    return 'string';
  }
  if (Array.isArray(node)) return 'list';
  if (typeof node === 'object') return 'mapping';
  if (typeof node === 'number') return 'number';
  if (typeof node === 'boolean') return 'boolean';
  return 'string';
}

/** Parse one configuration file's text. A YAML error is a load failure for that scope (REQ-CONFIG-024: fatal). */
export function parseConfig(text: string): Result<ParsedConfig, { readonly reason: string }> {
  const doc = parseDocument(text, { schema: 'core', version: '1.2', prettyErrors: true, uniqueKeys: true });
  if (doc.errors.length > 0) return err({ reason: doc.errors.map((e) => e.message.split('\n')[0] ?? e.message).join('; ') });
  const contents = doc.contents;
  if (contents === null || (isScalar(contents) && (contents.value === null || contents.value === undefined))) {
    return ok({ doc, root: null, topLevelType: 'null' });
  }
  if (!isMap(contents)) return ok({ doc, root: null, topLevelType: typeNameOf(contents) });
  return ok({ doc, root: contents, topLevelType: 'mapping' });
}

/** The tri-state lookup of one key on a mapping: absent, present-with-null, or the node. */
export function triOf(map: YAMLMap | null, key: string): Tri<Node> {
  if (map === null || !map.has(key)) return ABSENT;
  const node = map.get(key, true);
  if (node === undefined || node === null) return NULL;
  if (isScalar(node) && (node.value === null || node.value === undefined)) return NULL;
  if (!isNode(node)) return NULL;
  return { kind: 'value', value: node };
}

export function asMap(node: Node): YAMLMap | null {
  return isMap(node) ? node : null;
}
export function asSeq(node: Node): YAMLSeq | null {
  return isSeq(node) ? node : null;
}
/** The plain JavaScript value of a node (scalars, lists and mappings), for fields that need no tri-state. */
export function plainOf(node: Node | null | undefined): unknown {
  if (node === null || node === undefined) return null;
  return (node as { toJSON(): unknown }).toJSON();
}
/** REQ-CONFIG-020: a value the parser folded to a boolean is un-folded to its lower-cased spelling before a vocabulary check. */
export function vocabularyText(node: Node | null | undefined): string | null {
  if (node === null || node === undefined || !isScalar(node)) return null;
  const v = node.value;
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (v === null || v === undefined) return null;
  return String(v);
}
