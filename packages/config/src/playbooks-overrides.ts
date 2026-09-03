import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { isMap } from 'yaml';
import { guardedRead } from '@rotaris/platform';
import { parseConfig, plainOf, typeNameOf } from './document.js';

/**
 * REQ-ORCH-026: playbook overrides at two scopes — `<config>/playbooks/` and `<workspace>/.rotaris/playbooks/`
 * — each a directory of YAML files, every file a mapping `SLOT: { variant: text }`. Field-wise: the
 * workspace's value for a (slot, variant) wins, the global's stands where the workspace is silent, the
 * built-in text where neither speaks. Whether a slot or a variant exists is the catalogue's to say, so
 * the reader carries names through and the engine rejects the unknown ones with a warning naming them.
 * Decision 5 of the plan: the file format is this build's, the specification fixing none.
 */
export type PlaybookOverrides = Readonly<Record<string, Readonly<Record<string, string>>>>;

export interface OverridesRead {
  readonly overrides: PlaybookOverrides;
  readonly warnings: readonly string[];
  readonly files: readonly string[];
}

export function readPlaybookOverrides(dir: string): OverridesRead {
  let names: string[];
  try {
    names = readdirSync(dir).filter((n) => /\.ya?ml$/i.test(n)).sort();
  } catch {
    return { overrides: {}, warnings: [], files: [] };
  }
  const out: Record<string, Record<string, string>> = {};
  const warnings: string[] = [];
  const files: string[] = [];
  for (const name of names) {
    const path = join(dir, name);
    const r = guardedRead(path, (raw) => raw);
    if (r.state !== 'readable') { if (r.state === 'unreadable') warnings.push(`playbook override ${path} could not be read: ${r.reason}`); continue; }
    files.push(path);
    const parsed = parseConfig(r.value);
    if (!parsed.ok) { warnings.push(`playbook override ${path} is not valid YAML: ${parsed.error.reason}`); continue; }
    const root = parsed.value.root;
    if (root === null) { if (parsed.value.topLevelType !== 'null') warnings.push(`playbook override ${path}: expected a mapping of slots, got ${parsed.value.topLevelType}`); continue; }
    for (const pair of root.items) {
      const slot = String(plainOf(pair.key as never) ?? '');
      const value = pair.value;
      if (!isMap(value)) { warnings.push(`playbook override ${path}: slot '${slot}' must map variants to text, got ${typeNameOf(value)}`); continue; }
      const variants = out[slot] ?? {};
      for (const v of value.items) {
        const variant = String(plainOf(v.key as never) ?? '');
        const text = plainOf(v.value as never);
        if (typeof text !== 'string') { warnings.push(`playbook override ${path}: ${slot}.${variant} must be text, got ${typeNameOf(v.value)}`); continue; }
        variants[variant] = text;
      }
      out[slot] = variants;
    }
  }
  return { overrides: out, warnings, files };
}

export function mergePlaybookOverrides(global: PlaybookOverrides, workspace: PlaybookOverrides): PlaybookOverrides {
  const out: Record<string, Record<string, string>> = {};
  for (const src of [global, workspace]) {
    for (const [slot, variants] of Object.entries(src)) {
      out[slot] = { ...(out[slot] ?? {}), ...variants };
    }
  }
  return out;
}
