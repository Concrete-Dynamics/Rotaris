import { DEFAULT_PRESET, HEADLESS_POLICIES, PERMISSION_PRESETS, resolvePreset, type HeadlessPolicy, type PermissionPreset } from '@rotaris/contracts';
import { isAbsolute } from 'node:path';
import { FieldReader, sectionMap, typeName, vocabularyString, type Problem, type ProblemSink } from './field.js';

/**
 * The `runtime:` section (REQ-CONFIG-111..131, 467..476): every key with its type, range and default; the
 * same schema validates on load and on assignment (REQ-CONFIG-111 — `validateRuntimeField` is that one
 * path). Keys other domains own are validated by their rules: presets (REQ-TOOLS-041/046), the headless
 * policy (REQ-TOOLS-065), confinement (REQ-SANDBOX-048..051), egress (REQ-SANDBOX-001/002).
 */
export const SANDBOX_MODES = ['off', 'workspace-write', 'read-only'] as const;
export type SandboxMode = (typeof SANDBOX_MODES)[number];
export const EGRESS_POLICIES = ['allow', 'ask', 'deny'] as const;
export type EgressPolicy = (typeof EGRESS_POLICIES)[number];
export const RUN_START_MODES = ['auto', 'plan'] as const;
export type RunStartMode = (typeof RUN_START_MODES)[number];

export interface RuntimeSection {
  readonly max_children: number;
  readonly max_active_children: number;
  readonly max_depth: number;
  readonly max_iterations: number;
  readonly message_limit: number | null;
  readonly child_timeout: number;
  readonly child_stall_timeout: number;
  readonly llm_response_timeout: number;
  readonly model_timeout: number;
  readonly tool_call_timeout: number;
  readonly summary_timeout: number;
  readonly shell_command_timeout: number;
  readonly shell_max_background_sessions: number;
  readonly shell_background_timeout: number;
  readonly terminal_stream_enabled: boolean;
  readonly terminal_stream_interval_ms: number;
  readonly terminal_stream_buffer_kb: number;
  readonly improvement_collector_enabled: boolean;
  readonly improvement_collector_timeout: number;
  readonly claude_sdk_native_loop: boolean;
  readonly auto_retries_transient: number;
  readonly auto_retries_validation: number;
  readonly session_log_level: string;
  readonly permission_mode: PermissionPreset;
  readonly allow_outside_workspace: boolean;
  readonly allow_unsandboxed_autonomous: boolean;
  readonly headless_approval_policy: HeadlessPolicy;
  readonly approval_timeout_seconds: number;
  readonly sandbox_mode: SandboxMode;
  readonly sandbox_writable_roots: readonly string[];
  readonly sandbox_allow_network: boolean;
  readonly network_egress_policy: EgressPolicy;
  readonly network_allowed_hosts: readonly string[];
  readonly network_denied_hosts: readonly string[];
  readonly classify_completion: boolean;
  readonly validate_intent: boolean;
  readonly relentless: boolean;
  readonly relentless_max_cycles: number;
  readonly memory_diagnostics_enabled: boolean;
  readonly memory_diagnostics_top_frames: number;
  readonly graceful_pause_tool_deadline: number;
  readonly shutdown_drain_timeout: number;
  readonly loop_classification_timeout: number;
  readonly additional_read_only_roots: readonly string[];
  readonly keep_going: boolean;
  readonly event_retention_per_session: number;
  readonly task_consecutive_retry_limit: number;
  readonly relentless_audit_timeout: number;
  readonly run_start_mode: RunStartMode;
}

export const RUNTIME_DEFAULTS: RuntimeSection = {
  max_children: 20, max_active_children: 6, max_depth: 3, max_iterations: 20, message_limit: null,
  child_timeout: 1200, child_stall_timeout: 90, llm_response_timeout: 120,
  model_timeout: 120, tool_call_timeout: 30, summary_timeout: 120,
  shell_command_timeout: 100, shell_max_background_sessions: 20, shell_background_timeout: 3600,
  terminal_stream_enabled: true, terminal_stream_interval_ms: 100, terminal_stream_buffer_kb: 256,
  improvement_collector_enabled: true, improvement_collector_timeout: 60,
  claude_sdk_native_loop: true, auto_retries_transient: 1, auto_retries_validation: 0,
  session_log_level: 'WARNING', permission_mode: DEFAULT_PRESET, allow_outside_workspace: false, allow_unsandboxed_autonomous: false,
  headless_approval_policy: 'deny', approval_timeout_seconds: 300,
  sandbox_mode: 'off', sandbox_writable_roots: [], sandbox_allow_network: false,
  network_egress_policy: 'ask', network_allowed_hosts: [], network_denied_hosts: [],
  classify_completion: true, validate_intent: false, relentless: false, relentless_max_cycles: 3,
  memory_diagnostics_enabled: false, memory_diagnostics_top_frames: 8, graceful_pause_tool_deadline: 30, shutdown_drain_timeout: 120,
  loop_classification_timeout: 2, additional_read_only_roots: [], keep_going: false,
  event_retention_per_session: 20_000, task_consecutive_retry_limit: 3, relentless_audit_timeout: 60, run_start_mode: 'auto',
};

export const RUNTIME_KEYS: readonly (keyof RuntimeSection)[] = Object.keys(RUNTIME_DEFAULTS) as (keyof RuntimeSection)[];

/** REQ-SANDBOX-050 / REQ-CONFIG-468: absolute in POSIX or Windows spelling; blank entries dropped. */
function absoluteRoots(r: FieldReader, key: string, blankRule: 'drop' | 'reject'): readonly string[] {
  const out: string[] = [];
  r.stringList(key).forEach((entry, i) => {
    const text = entry.trim();
    if (text === '') { if (blankRule === 'reject') r.error(`${key}.${i}`, 'must not be blank'); return; }
    if (!isAbsolute(text) && !/^[A-Za-z]:[\\/]/.test(text) && !text.startsWith('/')) { r.error(`${key}.${i}`, `'${text}' must be an absolute path (POSIX or Windows spelling)`); return; }
    out.push(text);
  });
  return out;
}

/** REQ-SANDBOX-004: a host pattern keeps its text apart from trimming; a blank pattern is dropped. */
function hostPatterns(r: FieldReader, key: string): readonly string[] {
  return r.stringList(key).map((h) => h.trim()).filter((h) => h !== '');
}

export function readRuntimeSection(value: unknown, sink: ProblemSink): RuntimeSection {
  const r = new FieldReader(sectionMap(value, 'runtime', sink), 'runtime', sink);
  r.warnUnknown(RUNTIME_KEYS);
  const d = RUNTIME_DEFAULTS;

  // REQ-TOOLS-046: an unrecognised mode resolves to the strictest preset with a warning, never a failure.
  const modeText = vocabularyString(r.raw('permission_mode'));
  const mode = resolvePreset(modeText ?? '');
  if (mode.warned) r.warn('permission_mode', `unrecognised permission mode '${modeText ?? ''}'; the strictest preset (restricted) is used (REQ-TOOLS-046)`);
  // REQ-TOOLS-065: an unrecognised policy behaves as deny.
  const headlessText = vocabularyString(r.raw('headless_approval_policy'));
  const headlessNormalised = (headlessText ?? d.headless_approval_policy).trim().toLowerCase();
  const headless: HeadlessPolicy = (HEADLESS_POLICIES as readonly string[]).includes(headlessNormalised) ? (headlessNormalised as HeadlessPolicy) : 'deny';
  if (headlessText !== null && headless !== headlessNormalised) r.warn('headless_approval_policy', `unrecognised headless approval policy '${headlessText}'; behaving as deny (REQ-TOOLS-065)`);

  return {
    max_children: r.int('max_children', d.max_children, { min: 0 }),
    max_active_children: r.int('max_active_children', d.max_active_children, { min: 1 }),
    max_depth: r.int('max_depth', d.max_depth, { min: 1 }),
    max_iterations: r.int('max_iterations', d.max_iterations, { min: 1 }),
    message_limit: r.intOrNull('message_limit', { min: 1 }),
    child_timeout: r.int('child_timeout', d.child_timeout, { min: 1 }),
    child_stall_timeout: r.int('child_stall_timeout', d.child_stall_timeout, { min: 1 }),
    llm_response_timeout: r.int('llm_response_timeout', d.llm_response_timeout, { min: 30 }),
    model_timeout: r.int('model_timeout', d.model_timeout, { min: 1 }),
    tool_call_timeout: r.int('tool_call_timeout', d.tool_call_timeout, { min: 1 }),
    summary_timeout: r.int('summary_timeout', d.summary_timeout, { min: 1 }),
    shell_command_timeout: r.int('shell_command_timeout', d.shell_command_timeout, { min: 1 }),
    shell_max_background_sessions: r.int('shell_max_background_sessions', d.shell_max_background_sessions, { min: 1 }),
    shell_background_timeout: r.int('shell_background_timeout', d.shell_background_timeout, { min: 1 }),
    terminal_stream_enabled: r.bool('terminal_stream_enabled', d.terminal_stream_enabled),
    terminal_stream_interval_ms: r.int('terminal_stream_interval_ms', d.terminal_stream_interval_ms, { min: 20, max: 2000 }),
    terminal_stream_buffer_kb: r.int('terminal_stream_buffer_kb', d.terminal_stream_buffer_kb, { min: 0, max: 8192 }),
    improvement_collector_enabled: r.bool('improvement_collector_enabled', d.improvement_collector_enabled),
    improvement_collector_timeout: r.int('improvement_collector_timeout', d.improvement_collector_timeout, { min: 1 }),
    claude_sdk_native_loop: r.bool('claude_sdk_native_loop', d.claude_sdk_native_loop),
    auto_retries_transient: r.int('auto_retries_transient', d.auto_retries_transient, { min: 0 }),
    auto_retries_validation: r.int('auto_retries_validation', d.auto_retries_validation, { min: 0 }),
    // REQ-CONFIG-121: documented vocabulary, not validated against it.
    session_log_level: r.string('session_log_level', d.session_log_level),
    permission_mode: mode.preset,
    allow_outside_workspace: r.bool('allow_outside_workspace', d.allow_outside_workspace),
    allow_unsandboxed_autonomous: r.bool('allow_unsandboxed_autonomous', d.allow_unsandboxed_autonomous),
    headless_approval_policy: headless,
    approval_timeout_seconds: r.float('approval_timeout_seconds', d.approval_timeout_seconds, { min: 0 }),
    sandbox_mode: r.vocabulary('sandbox_mode', d.sandbox_mode, SANDBOX_MODES, { normalise: 'trim-lower' }),
    sandbox_writable_roots: absoluteRoots(r, 'sandbox_writable_roots', 'drop'),
    sandbox_allow_network: r.bool('sandbox_allow_network', d.sandbox_allow_network),
    network_egress_policy: r.vocabulary('network_egress_policy', d.network_egress_policy, EGRESS_POLICIES, { normalise: 'trim-lower' }),
    network_allowed_hosts: hostPatterns(r, 'network_allowed_hosts'),
    network_denied_hosts: hostPatterns(r, 'network_denied_hosts'),
    classify_completion: r.bool('classify_completion', d.classify_completion),
    validate_intent: r.bool('validate_intent', d.validate_intent),
    relentless: r.bool('relentless', d.relentless),
    relentless_max_cycles: r.int('relentless_max_cycles', d.relentless_max_cycles, { min: 1 }),
    memory_diagnostics_enabled: r.bool('memory_diagnostics_enabled', d.memory_diagnostics_enabled),
    memory_diagnostics_top_frames: r.int('memory_diagnostics_top_frames', d.memory_diagnostics_top_frames, { min: 0, max: 50 }),
    graceful_pause_tool_deadline: r.float('graceful_pause_tool_deadline', d.graceful_pause_tool_deadline, { min: 5, max: 120 }),
    shutdown_drain_timeout: r.float('shutdown_drain_timeout', d.shutdown_drain_timeout, { min: 0 }),
    loop_classification_timeout: r.float('loop_classification_timeout', d.loop_classification_timeout, { exclusiveMin: 0 }),
    additional_read_only_roots: absoluteRoots(r, 'additional_read_only_roots', 'reject'),
    keep_going: r.bool('keep_going', d.keep_going),
    event_retention_per_session: r.int('event_retention_per_session', d.event_retention_per_session, { min: 0 }),
    task_consecutive_retry_limit: r.int('task_consecutive_retry_limit', d.task_consecutive_retry_limit, { min: 1 }),
    relentless_audit_timeout: r.int('relentless_audit_timeout', d.relentless_audit_timeout, { min: 1 }),
    run_start_mode: r.vocabulary('run_start_mode', d.run_start_mode, RUN_START_MODES),
  };
}

/**
 * REQ-CONFIG-111: assignment-time validation is the load's schema over one key. Returns the problems the
 * load would report for `{ [key]: value }` (an unknown key is a problem here, since a surface never
 * writes one).
 */
export function validateRuntimeField(key: string, value: unknown): readonly Problem[] {
  if (!(RUNTIME_KEYS as readonly string[]).includes(key)) return [{ path: `runtime.${key}`, message: `unknown runtime key '${key}'` }];
  const sink: ProblemSink = { errors: [], warnings: [] };
  readRuntimeSection({ [key]: value }, sink);
  // A coerced value (an unknown preset or policy) is accepted by the load; a surface must not install one.
  const coerced = sink.warnings.filter((w) => w.path === `runtime.${key}`);
  return [...sink.errors, ...coerced];
}

export function describeRuntimeValue(value: unknown): string {
  return typeof value === 'string' ? `'${value}'` : typeName(value) === 'mapping' ? '(mapping)' : String(value);
}

export { PERMISSION_PRESETS };
