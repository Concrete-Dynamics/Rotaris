import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import {
  CHANNEL_SCHEMAS,
  CONTRACT_SCHEMA_VERSION,
  CONTROL_OPS,
  CONTROL_OPS_WITH_VALUE,
  ControlRequestSchema,
  ProcessRequestEnvelopeSchema,
  SEQUENCED_CHANNELS,
  SessionSnapshotSchema,
  TranscriptIncrementSchema,
} from './index.js';

/** Walk a zod schema's object keys recursively. */
function keysOf(schema: z.ZodType, acc: Set<string> = new Set()): Set<string> {
  const def = (schema as unknown as { def?: Record<string, unknown> }).def ?? {};
  const type = def['type'] as string | undefined;
  if (type === 'object') {
    const shape = def['shape'] as Record<string, z.ZodType>;
    for (const [k, v] of Object.entries(shape)) {
      acc.add(k);
      keysOf(v, acc);
    }
  } else if (type === 'array') {
    keysOf(def['element'] as z.ZodType, acc);
  } else if (type === 'optional' || type === 'nullable' || type === 'default') {
    keysOf(def['innerType'] as z.ZodType, acc);
  } else if (type === 'union') {
    for (const o of def['options'] as z.ZodType[]) keysOf(o, acc);
  }
  return acc;
}

describe('contracts — schema version', () => {
  it('is pinned; bumping it is a contract change that must update the renderer decline path (ADR-0044)', () => {
    expect(CONTRACT_SCHEMA_VERSION).toBe(1);
  });
});

describe('contracts — the sequenced channels (REQ-MONITOR-214)', () => {
  it('both update channels carry the session id and the publisher-assigned sequence number', () => {
    for (const name of SEQUENCED_CHANNELS) {
      const ks = keysOf(CHANNEL_SCHEMAS[name]);
      expect(ks.has('sessionId')).toBe(true);
      expect(ks.has('seq')).toBe(true);
    }
  });
  it('a sequence number below 1 is rejected — the counter starts at 1', () => {
    const bad = SessionSnapshotSchema.safeParse({
      v: 1, sessionId: 's', seq: 0,
      session: { id: 's', executionStatus: 'idle', workspaceRoot: 'C:\\ws', createdAt: 'x', updatedAt: 'x', agents: [], pendingApprovals: [], pendingQuestions: [], tokenUsage: { input: 0, output: 0 } },
    });
    expect(bad.success).toBe(false);
  });
  it('the transcript increment carries the earliest-changed index (REQ-MONITOR-214)', () => {
    expect(keysOf(TranscriptIncrementSchema).has('earliestChanged')).toBe(true);
  });
});

describe('contracts — no credential and no diagnostics-bound content in any payload (ADR-0030, REQ-STARTUP-134)', () => {
  const FORBIDDEN = /token|secret|password|credential|apikey|api_key|authorization|bearer/i;
  it('no field name across every channel schema looks like a secret', () => {
    for (const [name, schema] of Object.entries(CHANNEL_SCHEMAS)) {
      for (const k of keysOf(schema)) {
        // `tokenUsage` is a count, not a credential; it is the one deliberate exception and is named here.
        if (k === 'tokenUsage') continue;
        expect(FORBIDDEN.test(k), `${name}.${k}`).toBe(false);
      }
    }
  });
});

describe('contracts — the control channel (ADR-0010, REQ-MONITOR-005/013)', () => {
  it('names exactly twenty-one operations and exactly two of them carry a string value', () => {
    expect(CONTROL_OPS).toHaveLength(21);
    expect(new Set(CONTROL_OPS).size).toBe(21);
    expect([...CONTROL_OPS_WITH_VALUE].sort()).toEqual(['createQueuedPrompt', 'submitSteeringPrompt']);
  });
  it('arguments are limited to text, numbers, booleans and simple collections — a nested object is refused', () => {
    expect(ControlRequestSchema.safeParse({ op: 'pause', sessionId: 's', args: { reason: 'x', n: 1 } }).success).toBe(true);
    expect(ControlRequestSchema.safeParse({ op: 'pause', sessionId: 's', args: { nested: { deep: { x: 1 } } } }).success).toBe(false);
  });
});

describe('contracts — process protocol (ADR-0002)', () => {
  it('a workspace.opened request hands the run host a resolved store path, never an identifier file', () => {
    const r = ProcessRequestEnvelopeSchema.safeParse({
      v: 1, id: 1, request: { kind: 'workspace.opened', workspaceId: 'v1-x', storeFile: 'C:\\store\\workspace.db', workspaceRoot: 'C:\\ws' },
    });
    expect(r.success).toBe(true);
  });
});
