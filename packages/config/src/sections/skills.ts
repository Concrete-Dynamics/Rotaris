import { FieldReader, sectionMap, typeName, vocabularyString, type ProblemSink } from './field.js';
import { isPlainMap } from '../merge.js';

/**
 * The `skills:` section (REQ-CONFIG-166..169), registered here for the first time — the key has been
 * section-class in `keys.ts` since Part I with nothing reading it, which is why the Settings Skills
 * category and the composer's skill commands both said they were waiting on a mechanism (ADR-0063).
 *
 * Three keys and nothing else:
 *
 * - `enabled` (bool, default true) — the master switch, read at agent CREATION (REQ-CONFIG-166): a
 *   policy changed mid-session governs the next agent built and never retracts a skill from one already
 *   running. There is no mid-session re-attachment path and this switch does not gate one.
 * - `overrides` — skill name → load mode, exactly `off | name-only | user-invocable-only | on`
 *   (REQ-CONFIG-167, REQ-WORKSPACE-062).
 * - `invocation_overrides` — skill name → invocation mode, exactly `default | manual-only | auto-only`
 *   (REQ-CONFIG-168, REQ-WORKSPACE-063).
 *
 * The maps overlay **per skill name** rather than wholesale, which the section-class merge already does
 * recursively (REQ-CONFIG-042/048): a workspace file naming one skill leaves every other skill's global
 * policy standing. That is `merge.ts`'s `overlaySection`, not a rule this reader implements — the reader
 * sees the merged result. It is pinned by test all the same, because it is the property REQ-CONFIG-169
 * turns on and nothing else in this file would catch its loss.
 *
 * A value outside either vocabulary is a **schema error** (fatal, REQ-CONFIG-229) naming the skill and
 * listing what is accepted, because a mistyped load mode would otherwise silently take the default and
 * put a skill in front of a model that the user had hidden — or hide one they had asked for.
 */
export const SKILL_LOAD_MODES = ['off', 'name-only', 'user-invocable-only', 'on'] as const;
export type SkillLoadMode = (typeof SKILL_LOAD_MODES)[number];

export const SKILL_INVOCATION_MODES = ['default', 'manual-only', 'auto-only'] as const;
export type SkillInvocationMode = (typeof SKILL_INVOCATION_MODES)[number];

/** REQ-WORKSPACE-065: a workspace with no recorded policy behaves as on-demand load with default invocation. */
export const DEFAULT_SKILL_LOAD_MODE: SkillLoadMode = 'name-only';
export const DEFAULT_SKILL_INVOCATION_MODE: SkillInvocationMode = 'default';

export interface SkillsSection {
  readonly enabled: boolean;
  readonly overrides: Readonly<Record<string, SkillLoadMode>>;
  readonly invocation_overrides: Readonly<Record<string, SkillInvocationMode>>;
}

export const SKILLS_DEFAULTS: SkillsSection = { enabled: true, overrides: {}, invocation_overrides: {} };
export const SKILLS_KEYS = Object.keys(SKILLS_DEFAULTS) as readonly (keyof SkillsSection)[];

/** One override map, every entry checked against its closed vocabulary; a bad value names the skill it was stated for. */
function readModeMap<T extends string>(r: FieldReader, key: string, accepted: readonly T[]): Readonly<Record<string, T>> {
  const raw = r.raw(key);
  if (raw === undefined || raw === null) return {};
  if (!isPlainMap(raw)) { r.error(key, `must be a mapping of skill name to mode, got ${typeName(raw)}`); return {}; }
  const out: Record<string, T> = {};
  for (const [name, value] of Object.entries(raw)) {
    const text = vocabularyString(value);
    if (text !== null && (accepted as readonly string[]).includes(text)) { out[name] = text as T; continue; }
    r.error(`${key}.${name}`, `'${text ?? typeName(value)}' is not an accepted value; expected one of: ${accepted.join(', ')}`);
  }
  return out;
}

export function readSkillsSection(value: unknown, sink: ProblemSink): SkillsSection {
  const r = new FieldReader(sectionMap(value, 'skills', sink), 'skills', sink);
  r.warnUnknown(SKILLS_KEYS);
  return {
    enabled: r.bool('enabled', SKILLS_DEFAULTS.enabled),
    overrides: readModeMap(r, 'overrides', SKILL_LOAD_MODES),
    invocation_overrides: readModeMap(r, 'invocation_overrides', SKILL_INVOCATION_MODES),
  };
}

/** REQ-CONFIG-167/168, REQ-WORKSPACE-068: the setters' own rejection messages, which the settings surface quotes verbatim. */
export const UNSUPPORTED_LOAD_MODE = 'Unsupported skill load mode: ';
export const UNSUPPORTED_INVOCATION_MODE = 'Unsupported skill invocation mode: ';

export function isSkillLoadMode(value: string): value is SkillLoadMode {
  return (SKILL_LOAD_MODES as readonly string[]).includes(value);
}
export function isSkillInvocationMode(value: string): value is SkillInvocationMode {
  return (SKILL_INVOCATION_MODES as readonly string[]).includes(value);
}
