import { PERMISSION_PRESETS, type PermissionPreset } from '@rotaris/contracts';
import { isPlainMap } from '../merge.js';
import { ROLE_REASONING_LEVELS, type RoleReasoning } from '../keys.js';
import { FieldReader, typeName, vocabularyString, type ProblemSink } from './field.js';

/**
 * `personas:` entries (REQ-CONFIG-098..110): `name` and `model` required; capability lists replaced
 * wholesale on override (REQ-CONFIG-101, the merge's doing); an unrecognised `permission_mode` falls back
 * to `restricted` rather than failing the load (REQ-CONFIG-109). What a role's prompt and tool grant
 * mean is the engine's; this is the file's shape.
 */
export interface PersonaEntry {
  readonly name: string;
  readonly model: string;
  readonly purpose: string | null;
  readonly system_prompt: string | null;
  readonly system_prompt_file: string | null;
  readonly model_family_variants: Readonly<Record<string, string>> | null;
  readonly tools: readonly string[];
  readonly delegates_to: readonly string[];
  readonly custom_tools: readonly string[];
  readonly mcp_servers: readonly string[];
  readonly mcp_tools: Readonly<Record<string, readonly string[]>> | null;
  readonly tool_restrictions: Readonly<Record<string, readonly string[]>> | null;
  readonly coordinator_only: boolean;
  readonly read_only: boolean;
  readonly can_publish_artifacts: boolean;
  readonly skip_auto_sibling_context: boolean;
  readonly stall_timeout: number | null;
  readonly permission_mode: PermissionPreset | null;
  readonly fallback_model: string | null;
  readonly summary_model: string | null;
  readonly thinking: RoleReasoning | null;
}

export const PERSONA_ENTRY_KEYS = [
  'name', 'model', 'purpose', 'system_prompt', 'system_prompt_file', 'model_family_variants', 'tools', 'delegates_to', 'custom_tools',
  'mcp_servers', 'mcp_tools', 'tool_restrictions', 'coordinator_only', 'read_only', 'can_publish_artifacts', 'skip_auto_sibling_context',
  'stall_timeout', 'permission_mode', 'fallback_model', 'summary_model', 'thinking',
] as const;

export function readPersonaEntry(role: string, value: unknown, sink: ProblemSink): PersonaEntry | null {
  const base = `personas.${role}`;
  if (!isPlainMap(value)) { sink.errors.push({ path: base, message: `a personas entry must be a mapping, got ${typeName(value)}` }); return null; }
  const r = new FieldReader(value, base, sink);
  r.warnUnknown(PERSONA_ENTRY_KEYS);
  const name = r.requiredString('name');
  const model = r.requiredString('model');
  const purpose = r.stringOrNull('purpose');
  // REQ-CONFIG-099: one line.
  if (purpose !== null && /[\r\n]/.test(purpose)) r.error('purpose', 'must be a single line: a multi-line purpose is rejected');
  // REQ-CONFIG-109: unrecognised → restricted, never a load failure.
  let permissionMode: PermissionPreset | null = null;
  const modeRaw = r.raw('permission_mode');
  if (modeRaw !== undefined && modeRaw !== null) {
    const text = vocabularyString(modeRaw);
    if (text !== null && (PERMISSION_PRESETS as readonly string[]).includes(text)) permissionMode = text as PermissionPreset;
    else { permissionMode = 'restricted'; r.warn('permission_mode', `unrecognised permission mode '${text ?? typeName(modeRaw)}' for role ${role}; falling back to restricted (REQ-CONFIG-109)`); }
  }
  const entry: PersonaEntry = {
    name: name ?? role,
    model: model ?? '',
    purpose,
    system_prompt: r.stringOrNull('system_prompt'),
    system_prompt_file: r.stringOrNull('system_prompt_file'),
    model_family_variants: r.stringMapOrNull('model_family_variants'),
    tools: r.stringList('tools'),
    delegates_to: r.stringList('delegates_to'),
    custom_tools: r.stringList('custom_tools'),
    mcp_servers: r.stringList('mcp_servers'),
    mcp_tools: r.stringListMapOrNull('mcp_tools'),
    tool_restrictions: r.stringListMapOrNull('tool_restrictions'),
    coordinator_only: r.bool('coordinator_only', false),
    read_only: r.bool('read_only', false),
    can_publish_artifacts: r.bool('can_publish_artifacts', false),
    skip_auto_sibling_context: r.bool('skip_auto_sibling_context', false),
    stall_timeout: r.intOrNull('stall_timeout', { min: 1 }),
    permission_mode: permissionMode,
    fallback_model: r.stringOrNull('fallback_model'),
    summary_model: r.stringOrNull('summary_model'),
    thinking: r.vocabularyOrNull('thinking', ROLE_REASONING_LEVELS),
  };
  return name === null || model === null ? null : entry;
}

export function readPersonasSection(value: unknown, sink: ProblemSink): Record<string, PersonaEntry> {
  const out: Record<string, PersonaEntry> = {};
  if (value === undefined || value === null) return out;
  if (!isPlainMap(value)) { sink.errors.push({ path: 'personas', message: `must be a mapping of role entries, got ${typeName(value)}` }); return out; }
  for (const [role, entry] of Object.entries(value)) {
    const read = readPersonaEntry(role, entry, sink);
    if (read) out[role] = read;
  }
  return out;
}
