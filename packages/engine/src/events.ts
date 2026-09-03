import { err, ok, type Result } from '@rotaris/kernel';

/**
 * The wire event: ADR-0009's one serialiser, shared by the live channel and
 * the write path, so that what is stored is byte for byte what the wire
 * emitted (REQ-EVENTS-080) and an export is a concatenation, never a rebuild
 * (REQ-EVENTS-104).
 *
 * REQ-EVENTS-064: compact JSON, no spaces after separators, keys sorted,
 * non-ASCII escaped — two equal events serialise to byte-identical lines.
 * REQ-EVENTS-065 / REQ-EVENTS-089: one line; a carriage return or line feed
 * surviving serialisation is refused rather than emitted.
 * REQ-EVENTS-066: non-string keys become strings (JSON objects already have
 * string keys in this runtime; stated for the record).
 */

/** REQ-EVENTS-041: exactly these 23, closed. */
export const EVENT_CATALOGUE = [
  'session.start', 'session.end', 'iteration.start', 'iteration.end',
  'child.spawn', 'child.transition', 'child.complete',
  'tool.start', 'tool.finish', 'permission.decision',
  'verifier.result', 'verifier.progress',
  'transcript.row', 'usage.update', 'error', 'result',
  'hook.start', 'hook.finish',
  'checkpoint.created', 'checkpoint.restored',
  'gate.decision', 'gate.repair', 'approval.requested',
] as const;
export type EventKind = (typeof EVENT_CATALOGUE)[number];
export const EVENT_KINDS: ReadonlySet<string> = new Set(EVENT_CATALOGUE);

export const EVENT_SCHEMA_VERSION = 1;

/** The envelope every event carries; the payload is the type's own. */
export interface WireEvent {
  readonly event: EventKind;
  readonly session_id: string;
  /** ISO-8601 UTC. */
  readonly timestamp: string;
  readonly schema_version: number;
  readonly iteration?: number;
  readonly [field: string]: unknown;
}

export interface SerializeFailure {
  readonly code: 'not-serializable' | 'line-break';
  readonly event: string;
  readonly reason: string;
}

/** Deterministic canonical form: sorted keys at every depth, non-ASCII escaped. */
function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`non-finite number ${String(value)}`);
    return JSON.stringify(value);
  }
  if (typeof value === 'string') return escapeNonAscii(JSON.stringify(value));
  if (typeof value === 'bigint' || typeof value === 'function' || typeof value === 'symbol') {
    throw new TypeError(`${typeof value} is not serialisable`);
  }
  if (value === undefined) throw new TypeError('undefined is not serialisable');
  if (Array.isArray(value)) return `[${value.map((v) => canonical(v === undefined ? null : v)).join(',')}]`;
  if (value instanceof Map) throw new TypeError('Map is not serialisable; convert to an object first (REQ-EVENTS-066)');
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
  return `{${keys.map((k) => `${escapeNonAscii(JSON.stringify(String(k)))}:${canonical(obj[k])}`).join(',')}}`;
}

function escapeNonAscii(jsonString: string): string {
  return jsonString.replace(/[\u007f-\uffff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

export function serializeEvent(e: WireEvent): Result<string, SerializeFailure> {
  let line: string;
  try {
    line = canonical(e);
  } catch (cause) {
    return err({ code: 'not-serializable', event: e.event, reason: String(cause) });
  }
  if (/[\r\n]/.test(line)) return err({ code: 'line-break', event: e.event, reason: 'a line break survived serialisation' });
  return ok(line);
}

/** REQ-EVENTS-068: a line whose `event` lies outside the catalogue is refused, never inferred. */
export function parseEventLine(line: string): Result<WireEvent, { code: 'malformed' | 'unknown-event'; reason: string }> {
  let v: unknown;
  try {
    v = JSON.parse(line);
  } catch (cause) {
    return err({ code: 'malformed', reason: String(cause) });
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return err({ code: 'malformed', reason: 'not an object' });
  const o = v as Record<string, unknown>;
  if (typeof o['event'] !== 'string' || !EVENT_KINDS.has(o['event'])) return err({ code: 'unknown-event', reason: String(o['event']) });
  if (typeof o['session_id'] !== 'string' || typeof o['timestamp'] !== 'string' || typeof o['schema_version'] !== 'number') {
    return err({ code: 'malformed', reason: 'envelope incomplete' });
  }
  return ok(o as unknown as WireEvent);
}

/** REQ-EVENTS-056: the closed record-kind tokens a locator may name, and the locator's one form. */
export const RECORD_KINDS = ['issues', 'tool_call_evidence', 'permission_audit'] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];
export function locator(kind: RecordKind, id: string | number): string {
  return `${kind}#${String(id)}`;
}
