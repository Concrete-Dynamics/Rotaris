import { basename } from 'node:path';
import { isPlainMap } from '../merge.js';
import { normalizeSkillName } from './names.js';

/**
 * REQ-WORKSPACE-052 — `~/.openhands/skills/.installed.json`, a third party's file this product reads and
 * does not define. A skill directory whose name (or normalized name) matches a disabled entry is skipped.
 *
 * Three shapes are accepted, because the file is not ours and has been written all three ways:
 *
 * 1. a map with a `disabled: [names]` list;
 * 2. a map whose VALUES are maps carrying `disabled: true` — any of the entry key, a `name` field or a
 *    `path` field identifies the skill;
 * 3. a list of maps carrying `disabled: true`, identified the same way.
 *
 * **An unreadable manifest logs a warning and disables nothing.** Not "disables everything", and not a
 * failure: a file this product did not write and cannot repair must never be able to take a skill away
 * silently, and must never stop a workspace opening.
 *
 * Every identifier is recorded twice — as written and normalized — so a manifest naming `PDF Render`
 * disables the directory `pdf-render`, which is what "(or normalized name)" asks for.
 */
export interface DisabledSkills {
  /** Raw and normalized spellings together; membership is tested against both. */
  readonly names: ReadonlySet<string>;
  /** The reason the manifest contributed nothing, when it did not parse. Null on success and on absence. */
  readonly warning: string | null;
}

export const NO_DISABLED_SKILLS: DisabledSkills = { names: new Set(), warning: null };

function identify(add: (value: unknown) => void, key: string | null, entry: Record<string, unknown>): void {
  if (key !== null) add(key);
  add(entry['name']);
  // A `path` identifies the skill by its DIRECTORY name — the manifest points at the install, not the file.
  if (typeof entry['path'] === 'string') add(basename(entry['path'].replace(/[\\/]+$/, '')));
}

/**
 * Parse the manifest's text. `null` text means the file is absent, which is the ordinary case and not a
 * warning; a string that does not parse, or parses to something none of the three shapes fits, warns.
 */
export function readInstalledManifest(text: string | null, path: string): DisabledSkills {
  if (text === null) return NO_DISABLED_SKILLS;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    return { names: new Set(), warning: `${path} could not be read as JSON (${cause instanceof Error ? cause.message : String(cause)}); no skill is disabled by it` };
  }
  const names = new Set<string>();
  const add = (value: unknown): void => {
    if (typeof value !== 'string') return;
    const raw = value.trim();
    if (raw === '') return;
    names.add(raw);
    const normalized = normalizeSkillName(raw);
    if (normalized !== '') names.add(normalized);
  };

  // Shape 3: a list of entries.
  if (Array.isArray(parsed)) {
    for (const entry of parsed) if (isPlainMap(entry) && entry['disabled'] === true) identify(add, null, entry);
    return { names, warning: null };
  }
  if (!isPlainMap(parsed)) {
    return { names: new Set(), warning: `${path} holds neither a mapping nor a list; no skill is disabled by it` };
  }
  // Shape 1: an explicit list of disabled names, which may sit beside shape 2's entries.
  const disabled = parsed['disabled'];
  if (Array.isArray(disabled)) for (const name of disabled) add(name);
  // Shape 2: entries keyed by name.
  for (const [key, entry] of Object.entries(parsed)) {
    if (key === 'disabled') continue;
    if (isPlainMap(entry) && entry['disabled'] === true) identify(add, key, entry);
  }
  return { names, warning: null };
}

/** REQ-WORKSPACE-052: matched against the DIRECTORY name and its normal form, before the file is opened. */
export function isDisabled(disabled: DisabledSkills, directoryName: string): boolean {
  return disabled.names.has(directoryName) || disabled.names.has(normalizeSkillName(directoryName));
}
