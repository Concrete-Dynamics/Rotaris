import { PUBLIC_TOOL_NAMES } from '@rotaris/contracts';
import { isTierAlias, MODEL_SLOTS, type ModelSlot } from './keys.js';
import type { ModelEntry } from './sections/models.js';
import type { PersonaEntry } from './sections/personas.js';
import { MISSING_REQUIRED, type Problem } from './sections/field.js';

/**
 * The two validation stages (REQ-CONFIG-229): schema problems are fatal and rendered one line per problem
 * (REQ-CONFIG-237, with the models gathering of REQ-CONFIG-238); referential problems are a message list
 * in REQ-CONFIG-231/232's order that never raises. The fatal report carries what REQ-CONFIG-478 requires:
 * the file, its scope, the key path, and that this build does not recognise it.
 */
export function renderProblems(problems: readonly Problem[]): string[] {
  const lines: string[] = [];
  const missingByModel = new Map<string, string[]>();
  for (const p of problems) {
    const m = /^models\.([^.]+)\.([^.]+)$/.exec(p.path);
    if (m && p.message === MISSING_REQUIRED) {
      const fields = missingByModel.get(m[1]!) ?? [];
      fields.push(m[2]!);
      missingByModel.set(m[1]!, fields);
      continue;
    }
    const message = p.message.replace(/\bfield required\b/g, MISSING_REQUIRED);
    lines.push(`${p.path === '' ? 'config' : p.path}: ${message}`);
  }
  if (missingByModel.size > 0) {
    const models = [...missingByModel.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, fields]) => `${name} (${[...new Set(fields)].sort().join(', ')})`);
    lines.push(`models with missing required fields: ${models.join('; ')}`);
    lines.push('a models: entry is replaced as a whole across configuration scopes, so an override of a model has to repeat provider and model_id even when only some other field is being changed');
  }
  return lines.length > 0 ? lines : ['the configuration is invalid'];
}

export interface FatalLoadReport {
  /** REQ-CONFIG-478: the offending file, by full path and by scope. */
  readonly file: string;
  readonly scope: 'global' | 'workspace';
  /** The rejected key or value's full path within the file; empty when the file itself is the fault. */
  readonly path: string;
  readonly message: string;
  readonly kind: 'unreadable' | 'encoding' | 'syntax' | 'top-level' | 'schema';
  /** Every problem of the load, rendered per REQ-CONFIG-237. */
  readonly lines: readonly string[];
}

/** REQ-CONFIG-478: what the report conveys, in one rendering a notice or a log can carry. */
export function renderFatal(report: FatalLoadReport): string {
  const where = report.path === '' ? report.file : `${report.file} at ${report.path}`;
  const remedy = report.kind === 'schema'
    ? 'This build does not recognise it. Correcting or removing that key in the named file and loading again is sufficient; nothing else needs to change.'
    : 'Correcting the named file and loading again is sufficient; nothing else needs to change.';
  return `${where} (${report.scope} scope): ${report.message}. ${remedy}`;
}

export interface ReferentialInput {
  readonly defaultPersona: string;
  readonly slots: Readonly<Record<ModelSlot, string | null>>;
  readonly models: Readonly<Record<string, ModelEntry>>;
  readonly personas: Readonly<Record<string, PersonaEntry>>;
  readonly compressorModel: string;
  /** Configured tool servers by name; none in this build. */
  readonly toolServers?: readonly string[];
  readonly publicToolNames?: readonly string[];
  /** REQ-CONFIG-034: the snapshot providers marked authenticated; empty means the sign-in hint applies. */
  readonly authenticatedProviders?: readonly string[];
}

/**
 * REQ-CONFIG-230 / REQ-WORKSPACE-133: appended to an unconfigured-model message whenever no authenticated provider
 * snapshot exists; it names no command. (Until Part K no snapshot existed and the hint always applied.)
 */
export const SIGN_IN_HINT = 'authenticate a model provider in Settings → Models before a model can be chosen';

/** REQ-CONFIG-231/232: the messages, in order; empty means valid. Never throws. */
export function referentialMessages(input: ReferentialInput): string[] {
  const messages: string[] = [];
  const models = input.models;
  const servers = new Set(input.toolServers ?? []);
  const accepted = [...(input.publicToolNames ?? PUBLIC_TOOL_NAMES)].sort();
  const acceptedSet = new Set(accepted);
  const modelKnown = (name: string | null): boolean => name !== null && Object.prototype.hasOwnProperty.call(models, name);

  const authenticated = new Set(input.authenticatedProviders ?? []);
  const hint = authenticated.size === 0 ? `; ${SIGN_IN_HINT}` : '';
  if (Object.keys(models).length === 0) messages.push(`no models are configured${hint}`);
  // REQ-CONFIG-083 / REQ-PROVIDER-092: a model that names a sign-in provider must name one the snapshot marks authenticated.
  for (const [name, entry] of Object.entries(models)) {
    if (entry.auth_provider !== null && !authenticated.has(entry.auth_provider)) messages.push(`models.${name}: auth_provider '${entry.auth_provider}' names no authenticated provider${hint}`);
  }

  for (const [role, persona] of Object.entries(input.personas)) {
    if (!modelKnown(persona.model)) messages.push(`persona ${role}: model '${persona.model}' names no configured model`);
    if (persona.summary_model !== null && !modelKnown(persona.summary_model)) messages.push(`persona ${role}: summary_model '${persona.summary_model}' names no configured model`);
    for (const target of persona.delegates_to) if (!Object.prototype.hasOwnProperty.call(input.personas, target)) messages.push(`persona ${role}: delegates_to '${target}' names no configured role`);
    for (const server of persona.mcp_servers) if (!servers.has(server)) messages.push(`persona ${role}: mcp_servers '${server}' names no configured tool server`);
    for (const server of Object.keys(persona.mcp_tools ?? {})) if (!persona.mcp_servers.includes(server)) messages.push(`persona ${role}: mcp_tools names '${server}', which the role does not list in mcp_servers; the grant confers nothing`);
    const all = [...persona.tools, ...persona.custom_tools];
    const duplicates = [...new Set(all.filter((name, i) => all.indexOf(name) !== i))].sort();
    if (duplicates.length > 0) messages.push(`persona ${role}: tools named more than once across tools and custom_tools: ${duplicates.join(', ')}`);
    for (const name of persona.tools) if (!acceptedSet.has(name) && !servers.has(name)) messages.push(`persona ${role}: tool '${name}' is neither an accepted public tool name nor a configured tool server; accepted names: ${accepted.join(', ')}`);
  }

  if (!Object.prototype.hasOwnProperty.call(input.personas, input.defaultPersona)) messages.push(`default_persona '${input.defaultPersona}' names no existing role`);
  const summary = input.slots.default_summary_model;
  if (summary === null) messages.push(`default_summary_model is unset${hint}`);
  else if (!modelKnown(summary)) messages.push(`default_summary_model '${summary}' names no configured model`);
  for (const tier of ['small_model', 'medium_model', 'large_model'] as const) {
    const v = input.slots[tier];
    if (v === null) messages.push(`${tier} is unset${hint}`);
    else if (!modelKnown(v)) messages.push(`${tier} '${v}' names no configured model${isTierAlias(v) ? ' (a tier alias that registered no substitution)' : ''}`);
  }
  const fallback = input.slots.fallback_model;
  if (fallback !== null && !modelKnown(fallback)) messages.push(`fallback_model '${fallback}' names no configured model`);
  if (!modelKnown(input.compressorModel)) messages.push(`compressor.model '${input.compressorModel}' names no configured model`);

  // Delegation cycles, reported as the cycle path sliced from the first repetition.
  const reported = new Set<string>();
  const visit = (role: string, path: string[]): void => {
    const at = path.indexOf(role);
    if (at !== -1) {
      const cycle = [...path.slice(at), role];
      const key = [...new Set(cycle)].sort().join('|');
      if (!reported.has(key)) { reported.add(key); messages.push(`delegation cycle: ${cycle.join(' → ')}`); }
      return;
    }
    const persona = input.personas[role];
    if (!persona) return;
    for (const next of persona.delegates_to) visit(next, [...path, role]);
  };
  for (const role of Object.keys(input.personas)) visit(role, []);

  return messages;
}

export { MODEL_SLOTS };
