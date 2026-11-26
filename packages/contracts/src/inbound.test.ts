import { describe, expect, it } from 'vitest';
import {
  INBOUND_FORBIDDEN_FIELDS, INBOUND_HOST_CREDENTIAL_LEASE_MS, INBOUND_LISTENER_ASK_BOUND_MS, INBOUND_START_BOUND_MS, INBOUND_TOOL_NAMES, InboundExposureSchema,
  InboundRunHandleSchema, InboundRunStatusInputSchema, InboundRunStatusSchema, InboundStartRunInputSchema, isInboundToolName,
} from './inbound.js';
import { InboundAnswerEnvelopeSchema, InboundListenerEnvelopeSchema, InboundListenerRequestSchema } from './inbound-protocol.js';

/**
 * ADR-0067 / REQ-MCP-119..130: the inbound surface's contract — exactly two tools, a start input with NO authority
 * field, a handle only this surface mints, and the exposure the settings row reads.
 */

describe('REQ-MCP-123/126 (BLOCKER 1, 2026-11-25): the two bounds are ONE chain, listener ask above main start', () => {
  it('every bound is above the one it depends on, so no two can drift apart', () => {
    // The run host may spend up to its credential lease before it answers `session.start`; main waits above that; and the
    // LISTENER waits above main, so a slow-but-confirmed start is delivered to the caller rather than timed out here.
    expect(INBOUND_START_BOUND_MS).toBeGreaterThan(INBOUND_HOST_CREDENTIAL_LEASE_MS);
    expect(INBOUND_LISTENER_ASK_BOUND_MS).toBeGreaterThan(INBOUND_START_BOUND_MS);
    // And the listener's bound leaves a real margin over main's, not a bare equality.
    expect(INBOUND_LISTENER_ASK_BOUND_MS - INBOUND_START_BOUND_MS).toBeGreaterThanOrEqual(30_000);
  });
});

describe('REQ-MCP-123: exactly two tools', () => {
  it('names the two accepted tools and no third', () => {
    expect([...INBOUND_TOOL_NAMES]).toEqual(['rotaris_start_run', 'rotaris_run_status']);
    expect(isInboundToolName('rotaris_start_run')).toBe(true);
    expect(isInboundToolName('rotaris_run_status')).toBe(true);
    expect(isInboundToolName('rotaris_list_files')).toBe(false);
  });
});

describe('REQ-MCP-124: the start tool carries a prompt alone, and an unknown field is refused', () => {
  it('accepts a prompt alone', () => {
    expect(InboundStartRunInputSchema.safeParse({ prompt: 'Do the thing.' }).success).toBe(true);
  });

  it('refuses each authority field by name rather than stripping it', () => {
    for (const field of INBOUND_FORBIDDEN_FIELDS) {
      const r = InboundStartRunInputSchema.safeParse({ prompt: 'p', [field]: 'anything' });
      expect(r.success, field).toBe(false);
      expect(r.success === false && JSON.stringify(r.error.issues)).toContain(field);
    }
  });

  it('refuses a missing, empty or wrongly-typed prompt', () => {
    expect(InboundStartRunInputSchema.safeParse({}).success).toBe(false);
    expect(InboundStartRunInputSchema.safeParse({ prompt: '' }).success).toBe(false);
    expect(InboundStartRunInputSchema.safeParse({ prompt: 42 }).success).toBe(false);
  });
});

describe('REQ-MCP-123/130: the handle and the status', () => {
  it('a handle this surface mints matches the pattern; anything else does not', () => {
    expect(InboundRunHandleSchema.safeParse(`inr_${'a'.repeat(32)}`).success).toBe(true);
    expect(InboundRunHandleSchema.safeParse('a-desktop-session-id').success).toBe(false);
    expect(InboundRunHandleSchema.safeParse(`inr_${'Z'.repeat(32)}`).success).toBe(false);
  });

  it('the status carries the product’s own vocabulary and nothing else', () => {
    const ok = InboundRunStatusSchema.safeParse({ run: `inr_${'a'.repeat(32)}`, sessionId: 'S-1', state: 'running', stopReason: null });
    expect(ok.success).toBe(true);
    // An unknown state is refused (the closed presentation set, REQ-NOTIFY-048).
    expect(InboundRunStatusSchema.safeParse({ run: `inr_${'a'.repeat(32)}`, sessionId: 'S-1', state: 'vibing', stopReason: null }).success).toBe(false);
    // An unknown stop reason is refused (REQ-MONITOR-301).
    expect(InboundRunStatusSchema.safeParse({ run: `inr_${'a'.repeat(32)}`, sessionId: 'S-1', state: 'stopped', stopReason: 'because' }).success).toBe(false);
  });

  it('REQ-MCP-123/130 (Minor, 2026-11-25): the status INPUT holds the handle to the surface’s own shape', () => {
    // A well-formed handle is accepted; anything else — an unrelated session id, a wrong-length body — is refused at
    // the input schema, so a malformed call is answered as a refusal rather than passed on to wait out a bound.
    expect(InboundRunStatusInputSchema.safeParse({ run: `inr_${'a'.repeat(32)}` }).success).toBe(true);
    expect(InboundRunStatusInputSchema.safeParse({ run: 'a-desktop-session-id' }).success).toBe(false);
    expect(InboundRunStatusInputSchema.safeParse({ run: `inr_${'a'.repeat(31)}` }).success).toBe(false);
    expect(InboundRunStatusInputSchema.safeParse({ run: '' }).success).toBe(false);
  });
});

describe('REQ-MCP-120: the exposure shape', () => {
  it('is off with no port and no token, and on with both', () => {
    expect(InboundExposureSchema.safeParse({ enabled: false, port: null }).success).toBe(true);
    expect(InboundExposureSchema.safeParse({ enabled: true, port: 51234, token: 'tok' }).success).toBe(true);
  });

  it('a port is never zero or negative (the OS chooses a positive ephemeral port)', () => {
    expect(InboundExposureSchema.safeParse({ enabled: true, port: 0 }).success).toBe(false);
    expect(InboundExposureSchema.safeParse({ enabled: true, port: -1 }).success).toBe(false);
  });
});

describe('REQ-MCP-127: the listener’s wire', () => {
  it('main’s three requests parse, and an unknown one does not', () => {
    expect(InboundListenerRequestSchema.safeParse({ kind: 'inbound.enable', token: 't' }).success).toBe(true);
    expect(InboundListenerRequestSchema.safeParse({ kind: 'inbound.disable' }).success).toBe(true);
    expect(InboundListenerRequestSchema.safeParse({ kind: 'inbound.state' }).success).toBe(true);
    expect(InboundListenerRequestSchema.safeParse({ kind: 'inbound.nope' }).success).toBe(false);
  });

  it('an envelope carries a correlation id', () => {
    expect(InboundListenerEnvelopeSchema.safeParse({ id: 1, request: { kind: 'inbound.state' } }).success).toBe(true);
    expect(InboundListenerEnvelopeSchema.safeParse({ request: { kind: 'inbound.state' } }).success).toBe(false);
  });
  it('an answer envelope is correlated to the ask it answers', () => {
    expect(InboundAnswerEnvelopeSchema.safeParse({ ask: 3, answer: { kind: 'refused', code: 'x', headline: 'y' } }).success).toBe(true);
    expect(InboundAnswerEnvelopeSchema.safeParse({ ask: 3 }).success).toBe(false);
  });
});
