import { namesCredential, redact, REDACTION_MARK } from '@rotaris/kernel';
import type { HookEvent, LifecycleHookEvent } from '@rotaris/contracts';

/**
 * The stdin payload (REQ-HOOKS-057..067, REQ-HOOKS-075..077): one UTF-8 JSON object, every string at
 * every level passed through the ONE redaction pass of REQ-TOOLS-171 (kernel's `redact`), a string under
 * a credential-named key (REQ-TOOLS-172's test, kernel's `namesCredential`) replaced whole, shapes kept,
 * and the caller's data never altered (masking works on a copy). Building never fails.
 */
export const PAYLOAD_MAX_DEPTH = 12;
export const RESULT_TEXT_CAP = 4096;
export const RESERVED_LIFECYCLE_KEYS: ReadonlySet<string> = new Set(['event', 'session_id', 'workspace']);

function maskText(s: string): string {
  return redact(s);
}

/** REQ-HOOKS-060..063: the structural masking walk. `underCredential` masks every string beneath in its entirety. */
export function maskDeep(value: unknown, underCredential = false, depth = 0, walking: Set<object> = new Set()): unknown {
  if (typeof value === 'string') return underCredential ? REDACTION_MARK : maskText(value);
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return 'NaN';
    if (value === Infinity) return 'Infinity';
    if (value === -Infinity) return '-Infinity';
    return value;
  }
  if (typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Uint8Array) return maskDeep(new TextDecoder('utf-8', { fatal: false }).decode(value), underCredential, depth, walking);
  if (typeof value === 'function' || typeof value === 'symbol') return textForm(value, underCredential);
  if (typeof value !== 'object') return textForm(value, underCredential);
  if (walking.has(value)) return '<recursive>';
  if (depth > PAYLOAD_MAX_DEPTH) return textForm(value, underCredential);
  walking.add(value);
  try {
    if (value instanceof Date) return maskText(value.toISOString());
    if (Array.isArray(value) || value instanceof Set) {
      const out: unknown[] = [];
      for (const item of value) out.push(maskDeep(item, underCredential, depth + 1, walking));
      return out;
    }
    if (value instanceof Map) {
      const out: Record<string, unknown> = {};
      for (const [k, v] of value) {
        const key = maskText(String(k));
        out[key] = maskDeep(v, underCredential || namesCredential(String(k)), depth + 1, walking);
      }
      return out;
    }
    const out: Record<string, unknown> = {};
    let entries: [string, unknown][];
    try {
      entries = Object.entries(value as Record<string, unknown>);
    } catch (cause) {
      return { payload: textForm(String(cause), underCredential) };
    }
    for (const [k, v] of entries) {
      const key = maskText(k);
      out[key] = maskDeep(v, underCredential || namesCredential(k), depth + 1, walking);
    }
    return out;
  } finally {
    walking.delete(value);
  }
}

function textForm(value: unknown, underCredential: boolean): string {
  if (underCredential) return REDACTION_MARK;
  try {
    return maskText(String(value));
  } catch {
    const typeName = value === null ? 'null' : typeof value === 'object' ? (value as object).constructor?.name ?? 'object' : typeof value;
    return `<unrepresentable ${typeName}>`;
  }
}

/** REQ-HOOKS-066: a result text capped at 4096 characters with the marker beyond them. */
export function capResultText(text: string): string {
  const cps = Array.from(text);
  if (cps.length <= RESULT_TEXT_CAP) return text;
  return `${cps.slice(0, RESULT_TEXT_CAP).join('')}\n[truncated: ${cps.length} characters]`;
}

export interface ToolResultItem {
  readonly kind: 'observation' | 'error';
  readonly text: string;
}

export interface ToolPayloadInput {
  readonly event: 'pre_tool' | 'post_tool';
  readonly toolName: string;
  readonly arguments: Readonly<Record<string, unknown>>;
  readonly sessionId: string;
  readonly workspace: string;
  /** The shell command line for `terminal`; empty otherwise (REQ-HOOKS-057). */
  readonly command: string;
  readonly results?: readonly ToolResultItem[];
}

/** REQ-HOOKS-057/065/066: exactly the six keys, plus `result` only where a result exists. */
export function buildToolPayload(input: ToolPayloadInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    event: input.event,
    tool_name: input.toolName,
    arguments: maskDeep(input.arguments),
    session_id: input.sessionId,
    workspace: input.workspace,
    command: maskText(input.command),
  };
  if (input.event === 'post_tool' && input.results !== undefined && input.results.length > 0) {
    const items = input.results.map((r) => ({ [r.kind]: maskText(capResultText(r.text)) }));
    payload['result'] = items.length === 1 ? items[0] : items;
  }
  return payload;
}

/** REQ-HOOKS-075: the per-event fields, each rendered under its fallback rule. */
export type LifecycleFields = Readonly<Record<string, unknown>>;

const STRING_FIELDS: Readonly<Record<LifecycleHookEvent, readonly string[]>> = {
  session_start: ['task'],
  session_end: ['status'],
  child_completed: ['child_id', 'child_name', 'persona', 'state', 'status', 'summary'],
  verifier_finished: ['skip_reason'],
  iteration_end: ['outcome', 'child_name', 'status', 'summary'],
};

function asText(v: unknown): string {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string') return v;
  try { return String(v); } catch { return ''; }
}

/** REQ-HOOKS-058/059/075/077: the three base keys, reserved; the occurrence's fields as siblings. */
export function buildLifecyclePayload(event: LifecycleHookEvent, sessionId: string, workspace: string, fields: LifecycleFields): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of STRING_FIELDS[event]) out[key] = asText(fields[key]);
  if (event === 'verifier_finished') {
    const it = fields['iteration'];
    out['iteration'] = Number.isInteger(it) ? it : 0;
    out['executed'] = fields['executed'] === true;
    out['passed'] = fields['passed'] === true;
    const fc = fields['failed_checks'];
    out['failed_checks'] = Array.isArray(fc) ? fc.map(asText) : [];
  }
  if (event === 'iteration_end') {
    const it = fields['iteration'];
    out['iteration'] = Number.isInteger(it) ? it : 0;
  }
  // Any further caller field rides as a sibling; the three reserved names are dropped without comment.
  for (const [k, v] of Object.entries(fields)) {
    if (RESERVED_LIFECYCLE_KEYS.has(k) || k in out) continue;
    out[k] = v;
  }
  const masked = maskDeep(out) as Record<string, unknown>;
  return { event, session_id: sessionId, workspace, ...masked };
}

/** REQ-HOOKS-031/067: the bytes — one document, the closing brace last, no trailing byte. */
export function serializePayload(payload: Record<string, unknown>): Uint8Array {
  let text: string;
  try {
    text = JSON.stringify(payload);
  } catch (cause) {
    text = JSON.stringify({ payload: maskText(String(cause)) });
  }
  return new TextEncoder().encode(text);
}

export function isLifecycleEvent(e: HookEvent): e is LifecycleHookEvent {
  return e !== 'pre_tool' && e !== 'post_tool';
}
