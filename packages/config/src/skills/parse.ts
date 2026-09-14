import { parse as parseYaml } from 'yaml';
import { isPlainMap } from '../merge.js';
import { collapseWhitespace, normalizeSkillName } from './names.js';
import { DEFAULT_SKILL_INVOCATION_MODE, type SkillInvocationMode } from '../sections/skills.js';

/**
 * REQ-WORKSPACE-053, 055 and 056 — the `SKILL.md` document, a third-party format this product reads.
 *
 * A valid file begins with YAML frontmatter delimited by `---` lines; the frontmatter must be a
 * **mapping** and must carry `name` and `description`. An invalid file is **skipped with a logged
 * reason** and discovery continues — an invalid skill never crashes startup, which is the requirement's
 * own sentence and the reason every failure below returns a reason rather than throwing.
 *
 * **Why the `yaml` package and not a third hand-written reader.** This repository has two already, and
 * neither fits: `workspace/src/traceability/frontmatter.ts` is forbidden the dependency by ADR-0040 #2
 * so the engine runs embedded, and `workspace-service/prompts.ts` reads REQ-CHAT-160's flat
 * `key: value` grammar. This requirement needs a *nested* `trigger: {type, keywords: [...]}` and needs
 * "malformed YAML" as a distinct skip reason — a grammar that cannot be malformed cannot report it.
 * `config` already depends on `yaml` for the configuration documents.
 *
 * **Unknown fields are preserved** and available as raw metadata (053). Nothing in this build reads
 * them; they are carried because the requirement says a file's own fields survive the read, and a
 * reader that dropped them would make that false in a way no later part could repair.
 */
export interface SkillTrigger {
  readonly type: 'keyword';
  readonly keywords: readonly string[];
}

export interface ParsedSkill {
  /** The name as the file declares it, before normalisation — shown nowhere, kept for the command's own normal form (REQ-SHELL-056). */
  readonly declaredName: string;
  /** REQ-WORKSPACE-054's normal form: the skill's identity everywhere in this product. */
  readonly name: string;
  /** REQ-WORKSPACE-055: whitespace collapsed to single spaces. */
  readonly description: string;
  readonly trigger: SkillTrigger | null;
  /** REQ-WORKSPACE-056: derived from the frontmatter alone; a workspace override takes precedence later (063). */
  readonly invocation: SkillInvocationMode;
  /** REQ-WORKSPACE-053: every frontmatter field, including the ones this build does not know. */
  readonly raw: Readonly<Record<string, unknown>>;
  /** The document below the closing `---`, verbatim — what a force-loaded block carries (REQ-WORKSPACE-062). */
  readonly body: string;
}

export type SkillParse = { readonly ok: true; readonly skill: ParsedSkill } | { readonly ok: false; readonly reason: string };

/** The reasons REQ-WORKSPACE-053 names, as constants so the proof and the tests quote what the code emits. */
export const SKILL_NO_FRONTMATTER = 'missing frontmatter: the file does not begin with a --- line';
export const SKILL_UNCLOSED_FRONTMATTER = 'missing frontmatter: the opening --- is never closed';
export const SKILL_NOT_A_MAPPING = 'malformed frontmatter: the frontmatter is not a mapping';
export const SKILL_EMPTY_NAME = "invalid 'name': it normalises to an empty name";
export const skillMalformedYaml = (detail: string): string => `malformed YAML: ${detail}`;
export const skillMissingField = (field: string): string => `missing required field '${field}'`;
export const skillFieldType = (field: string, got: string): string => `'${field}' must be a string, got ${got}`;
export const skillUnsupportedTrigger = (detail: string): string => `unsupported trigger shape: ${detail}`;

/** Split the `---` fence off the front. Line endings are normalised for the split alone; the body keeps its own. */
function splitFrontmatter(text: string): { yaml: string; body: string } | { reason: string } {
  // A leading byte-order mark would otherwise make line 1 not equal `---`.
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const lines = source.split('\n');
  if (lines.length === 0 || lines[0]!.trimEnd() !== '---') return { reason: SKILL_NO_FRONTMATTER };
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i]!.trimEnd() === '---') return { yaml: lines.slice(1, i).join('\n'), body: lines.slice(i + 1).join('\n') };
  }
  return { reason: SKILL_UNCLOSED_FRONTMATTER };
}

/**
 * REQ-WORKSPACE-055 — the trigger. The canonical shape is `trigger: {type: keyword, keywords: [...]}`;
 * the legacy top-level `type:` plus `triggers:` aliases are accepted and normalised onto it. Only the
 * `keyword` type is supported; the keyword collection must contain **nothing but strings**; entries are
 * stripped and de-duplicated preserving order.
 *
 * Absence is not a fault — a skill with no trigger is ordinary, and yields `null`. What IS a fault is a
 * trigger the product cannot honour, because silently ignoring it would leave the author believing their
 * keywords were in force.
 */
export function readTrigger(fields: Readonly<Record<string, unknown>>): { ok: true; trigger: SkillTrigger | null } | { ok: false; reason: string } {
  const canonical = fields['trigger'];
  let type: unknown;
  let keywords: unknown;
  if (canonical !== undefined && canonical !== null) {
    if (!isPlainMap(canonical)) return { ok: false, reason: skillUnsupportedTrigger("'trigger' must be a mapping") };
    type = canonical['type'];
    keywords = canonical['keywords'];
  } else if (fields['triggers'] !== undefined || fields['type'] !== undefined) {
    type = fields['type'];
    keywords = fields['triggers'];
  } else {
    return { ok: true, trigger: null };
  }
  if (type === undefined || type === null) return { ok: false, reason: skillUnsupportedTrigger("no trigger type is stated; only 'keyword' is supported") };
  if (type !== 'keyword') return { ok: false, reason: skillUnsupportedTrigger(`'${String(type)}' is not supported; only 'keyword' is`) };
  if (keywords === undefined || keywords === null) return { ok: true, trigger: { type: 'keyword', keywords: [] } };
  if (!Array.isArray(keywords)) return { ok: false, reason: skillUnsupportedTrigger('the keyword collection must be a list of strings') };
  const out: string[] = [];
  for (const entry of keywords) {
    if (typeof entry !== 'string') return { ok: false, reason: skillUnsupportedTrigger(`the keyword collection must hold strings only, found ${entry === null ? 'null' : typeof entry}`) };
    const value = entry.trim();
    if (value !== '' && !out.includes(value)) out.push(value);
  }
  return { ok: true, trigger: { type: 'keyword', keywords: out } };
}

/**
 * REQ-WORKSPACE-056 — the invocation mode a file's own frontmatter derives:
 * `user-invocable: false` → auto-only; `disable-model-invocation: true` → manual-only; otherwise default.
 * Stated in that order, so a file carrying both reads as auto-only; the requirement lists them in that
 * order and states no combination rule, and a model-facing-only skill is the narrower of the two.
 */
export function readInvocation(fields: Readonly<Record<string, unknown>>): SkillInvocationMode {
  if (fields['user-invocable'] === false) return 'auto-only';
  if (fields['disable-model-invocation'] === true) return 'manual-only';
  return DEFAULT_SKILL_INVOCATION_MODE;
}

export function parseSkill(text: string): SkillParse {
  const split = splitFrontmatter(text);
  if ('reason' in split) return { ok: false, reason: split.reason };

  let parsed: unknown;
  try {
    parsed = parseYaml(split.yaml);
  } catch (cause) {
    return { ok: false, reason: skillMalformedYaml(cause instanceof Error ? cause.message.split('\n')[0]! : String(cause)) };
  }
  // An empty fence parses to null, which is not a mapping and cannot carry the two required fields.
  if (!isPlainMap(parsed)) return { ok: false, reason: SKILL_NOT_A_MAPPING };

  const declaredName = parsed['name'];
  if (declaredName === undefined || declaredName === null) return { ok: false, reason: skillMissingField('name') };
  if (typeof declaredName !== 'string') return { ok: false, reason: skillFieldType('name', typeof declaredName) };
  const name = normalizeSkillName(declaredName);
  if (name === '') return { ok: false, reason: SKILL_EMPTY_NAME };

  const description = parsed['description'];
  if (description === undefined || description === null) return { ok: false, reason: skillMissingField('description') };
  if (typeof description !== 'string') return { ok: false, reason: skillFieldType('description', typeof description) };

  const trigger = readTrigger(parsed);
  if (!trigger.ok) return { ok: false, reason: trigger.reason };

  return {
    ok: true,
    skill: {
      declaredName,
      name,
      description: collapseWhitespace(description),
      trigger: trigger.trigger,
      invocation: readInvocation(parsed),
      raw: parsed,
      body: split.body,
    },
  };
}
