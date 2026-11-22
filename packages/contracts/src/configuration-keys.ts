/**
 * PD-CONFIG-014 clause 4: every configuration key belongs to exactly one class, stated here, in the one place the
 * `configure` tool, the permission gate and the workspace service read.
 *
 * - `ordinary` — what a run does within the authority it already has. A `set` is approved as a file write is, under the
 *   permission mode in effect.
 * - `authority` — what widens or narrows what a later run may do, or where the conversation and its commands go. A `set`
 *   always asks the user, in every mode, and no allow rule, preset or earlier answer pre-approves it.
 * - `never` — a credential. Refused outright.
 * - `unknown` — not a key this build's configuration defines (or a value only the loader computes). Refused.
 *
 * A key is a dotted path into `agents.yaml` (`runtime.permission_mode`, `personas.coding-agent.model`). The class is
 * decided by the path alone, so the gate can rule on a call before anything is read.
 */

export const CONFIG_KEY_CLASSES = ['ordinary', 'authority', 'never', 'unknown'] as const;
export type ConfigKeyClass = (typeof CONFIG_KEY_CLASSES)[number];

/** The two scopes a `set` may name (REQ-CONFIG-001). */
export const CONFIGURE_SCOPES = ['workspace', 'global'] as const;
export type ConfigureScope = (typeof CONFIGURE_SCOPES)[number];

/** The longest dotted key the tool takes, in characters; a longer one is no key of the configuration. */
export const CONFIG_KEY_PATH_MAX = 200;

/** The top-level replace keys an agent may set (REQ-CONFIG-040's table, less the location of the worktrees). */
const ORDINARY_TOP: ReadonlySet<string> = new Set([
  'default_persona',
  'default_summary_model', 'improvement_collector_model', 'retrospective_model', 'gatekeeper_model', 'small_model', 'medium_model', 'large_model', 'fallback_model',
  'default_summary_model_thinking', 'improvement_collector_model_thinking', 'retrospective_model_thinking', 'gatekeeper_model_thinking',
  'small_model_thinking', 'medium_model_thinking', 'large_model_thinking', 'fallback_model_thinking',
  'inject_agents_md',
]);

/** Sections an agent may set field by field; their keys change what a run does, not what it may do. */
const ORDINARY_SECTIONS: ReadonlySet<string> = new Set(['compressor', 'circuit_breaker', 'transcript', 'display', 'requirements', 'skills', 'checkpoints', 'instructions', 'unavailable_models']);

/**
 * Whole top-level keys of the authority class: tool servers (an entry is a command the product executes), hooks (commands
 * run at lifecycle points), the initialisation commands, the verifier's checks (commands), the integration settings, the
 * worktrees' location on disk, and the separate `rotaris:` lookup.
 */
const AUTHORITY_TOP: ReadonlySet<string> = new Set(['mcp_servers', 'hooks', 'initialization', 'project_init', 'verifier', 'integration', 'worktree_storage_subpath', 'rotaris']);

/** `runtime:` keys that decide what a later run may do: approvals, the fence, the sandbox and the network. */
const AUTHORITY_RUNTIME: ReadonlySet<string> = new Set([
  'permission_mode', 'allow_outside_workspace', 'additional_read_only_roots', 'allow_unsandboxed_autonomous',
  'headless_approval_policy', 'approval_timeout_seconds',
  'sandbox_mode', 'sandbox_allow_network', 'sandbox_writable_roots',
  'network_egress_policy', 'network_allowed_hosts', 'network_denied_hosts',
]);

/** A role's fields that grant or withhold tools, servers, delegation and approvals. */
const AUTHORITY_PERSONA: ReadonlySet<string> = new Set([
  'tools', 'delegates_to', 'custom_tools', 'mcp_servers', 'mcp_tools', 'tool_restrictions',
  'coordinator_only', 'read_only', 'can_publish_artifacts', 'permission_mode',
]);

/** A model entry's fields that decide where the conversation is sent and how it is authenticated. */
const AUTHORITY_MODEL: ReadonlySet<string> = new Set(['provider', 'base_url', 'auth_provider', 'api_key_env', 'api_mode', 'extra_body']);

/** Keys the loader computes and never serialises (REQ-CONFIG-072). */
const COMPUTED_TOP: ReadonlySet<string> = new Set(['workspace_root', 'metadata_workspace_root', 'mcp_server_sources', 'resolved_persona_model_tiers']);

/** A segment naming a credential, wherever it stands: never written by an agent. */
const CREDENTIAL_SEGMENT = /(^|_)(api_key|apikey|token|secret|password|passphrase|bearer|credential|credentials)$/i;

const SEGMENT = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;

/** The dotted key as its segments, or null when it is not one (empty, a bad segment, too long). */
export function configKeySegments(key: string): readonly string[] | null {
  if (key.length === 0 || key.length > CONFIG_KEY_PATH_MAX) return null;
  const parts = key.split('.');
  // A role or model name may hold a dot only where the file spells it so; the tool takes the simple form.
  if (parts.some((p) => p.length === 0 || !SEGMENT.test(p))) return null;
  return parts;
}

/** PD-CONFIG-014 clause 4: the class of a dotted key. */
export function configKeyClass(key: string): ConfigKeyClass {
  const parts = configKeySegments(key);
  if (parts === null) return 'unknown';
  if (parts.some((p) => CREDENTIAL_SEGMENT.test(p))) return 'never';
  const [top, second, third] = parts as [string, string | undefined, string | undefined];
  if (COMPUTED_TOP.has(top)) return 'unknown';
  if (AUTHORITY_TOP.has(top)) return 'authority';
  if (ORDINARY_TOP.has(top)) return parts.length === 1 ? 'ordinary' : 'unknown';
  if (ORDINARY_SECTIONS.has(top)) return 'ordinary';
  if (top === 'runtime') {
    if (second === undefined) return 'authority';
    return AUTHORITY_RUNTIME.has(second) ? 'authority' : 'ordinary';
  }
  if (top === 'personas') {
    // A whole role, or a whole `personas:` map, carries its grants with it.
    if (second === undefined || third === undefined) return 'authority';
    return AUTHORITY_PERSONA.has(third) ? 'authority' : 'ordinary';
  }
  if (top === 'models') {
    if (second === undefined || third === undefined) return 'authority';
    return AUTHORITY_MODEL.has(third) ? 'authority' : 'ordinary';
  }
  if (top === 'dictation') return second === 'base_url' || second === 'backend' || second === undefined ? 'authority' : 'ordinary';
  return 'unknown';
}

/**
 * PD-CONFIG-014 clauses 3 and 4: whether a `set` must ask the user whatever the permission mode says — an authority key,
 * or any key in the global scope (a change there reaches every workspace, so it is the user's to make).
 */
export function configureSetAlwaysAsks(key: string, scope: string | undefined): boolean {
  return configKeyClass(key) === 'authority' || scope === 'global';
}

/** What `explain` says of a key's class, in the reader's terms. */
export function configKeyClassSentence(klass: ConfigKeyClass): string {
  switch (klass) {
    case 'ordinary': return 'An ordinary key: changing it is approved as a file edit is, under the permission mode in effect.';
    case 'authority': return 'An authority key: it decides what a later run may do, so changing it always asks the user, in every permission mode.';
    case 'never': return 'A credential: the configure tool never reads or writes it. The user stores it in Settings.';
    case 'unknown': return 'Not a key this build\'s configuration defines.';
  }
}

/**
 * PD-CONFIG-014 revision 3 (clause 7): the last line of a set's result — the change as data, so the transcript row that
 * holds the result can offer its Undo after a relaunch from the recorded output alone, with no store column.
 */
export const CONFIGURE_CHANGE_PREFIX = 'configure-change: ';

/** The change a set made: `stated` false means the file did not state the setting before, so an Undo removes it. */
export interface ConfigureChangeRecord {
  readonly setting: string;
  readonly scope: ConfigureScope;
  readonly stated: boolean;
  readonly before?: unknown;
  readonly after: unknown;
}

/** The record a `configure` result carries on its last line, or null (a read, a refusal, a result from before the record). */
export function configureChangeOf(output: string | undefined): ConfigureChangeRecord | null {
  if (output === undefined) return null;
  const line = output.split('\n').reverse().find((l) => l.startsWith(CONFIGURE_CHANGE_PREFIX));
  if (line === undefined) return null;
  try {
    const v = JSON.parse(line.slice(CONFIGURE_CHANGE_PREFIX.length)) as Partial<ConfigureChangeRecord>;
    if (typeof v.setting !== 'string' || (v.scope !== 'workspace' && v.scope !== 'global') || typeof v.stated !== 'boolean' || !('after' in v)) return null;
    return { setting: v.setting, scope: v.scope, stated: v.stated, ...(v.stated ? { before: v.before } : {}), after: v.after };
  } catch {
    return null;
  }
}

