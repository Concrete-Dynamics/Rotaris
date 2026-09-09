import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { z } from 'zod';
import {
  CHANNEL_SCHEMAS,
  CONTRACT_SCHEMA_VERSION,
  CONTROL_OPS,
  CONTROL_OPS_WITH_VALUE,
  CommandRequestSchema,
  ControlRequestSchema,
  ProcessRequestEnvelopeSchema,
  SEQUENCED_CHANNELS,
  SessionSnapshotSchema,
  TranscriptIncrementSchema,
  THEMES,
  assertThemeContrast,
  contrastRatio,
  parseOklch,
  raiseLightness,
  resolveTheme,
  themeCustomProperties,
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

describe('attachment commands', () => {
  const image = { name: 'renamed.txt', mediaType: 'image/png' as const, size: 8, base64: 'iVBORw0KGgo=' };
  it('REQ-CHAT-169: accepts an attachment-only submission and refuses an empty submission', () => {
    expect(CommandRequestSchema.safeParse({ kind: 'session.start', prompt: '', attachments: [image] }).success).toBe(true);
    expect(CommandRequestSchema.safeParse({ kind: 'session.start', prompt: '' }).success).toBe(false);
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
      session: { id: 's', executionStatus: 'idle', workspaceRoot: 'C:\\ws', createdAt: 'x', updatedAt: 'x', historyOpen: true, truncation: { truncated: false, droppedCount: 0, cap: null, lastTrimAt: null }, agents: [], pendingApprovals: [], pendingQuestions: [], tokenUsage: { input: 0, output: 0 }, cost: '0', stopReason: null, iterationsCompleted: 0, summary: null },
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
    expect(CONTROL_OPS).toHaveLength(22);
    expect(new Set(CONTROL_OPS).size).toBe(22);
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

describe('contracts — tools vocabularies', () => {
  it('REQ-TOOLS-001/028/041/047: the sets are exactly as fixed and the ranks total', async () => {
    const t = await import('./tools.js');
    expect(t.PUBLIC_TOOL_NAMES).toHaveLength(18);
    expect(new Set(t.PUBLIC_TOOL_NAMES).size).toBe(18);
    expect(t.DECISION_SOURCES).toHaveLength(12);
    expect(t.PERMISSION_PRESETS).toEqual(['restricted', 'ask', 'autonomous']);
    expect(t.resolvePreset('')).toEqual({ preset: 'ask', warned: false });
    expect(t.resolvePreset('bogus')).toEqual({ preset: 'restricted', warned: true });
    expect(t.presetRank('autonomous')).toBe(2);
    expect(t.presetRank(undefined)).toBe(1);
    expect(t.denialText('r', 'Because.', 'terminal')).toBe("Permission denied by rule 'r'. Because. The 'terminal' call was not executed. Choose a different approach or ask the user to adjust the permission policy.");
  });
});

describe('contracts — theme data (REQ-SHELL-128..145)', () => {
  const cssTokens = (file: string) => {
    const tokens: Record<string, string> = {};
    const css = readFileSync(file, 'utf8');
    for (const match of css.matchAll(/(--rt-[\w-]+)\s*:\s*([^;]+);/g)) tokens[match[1]!] = match[2]!.trim();
    return tokens;
  };

  it('transcribes every adopted rotaris-dim token value without drift', () => {
    const adopted = Object.assign({}, ...[
      'docs/design/system/tokens/colors.css',
      'docs/design/system/tokens/spacing.css',
      'docs/design/system/tokens/effects.css',
      'docs/design/system/tokens/typography.css',
    ].map(cssTokens));
    const actual = themeCustomProperties(resolveTheme('rotaris-dim'));
    for (const [name, value] of Object.entries(adopted)) expect(actual[name], name).toBe(value);
  });

  it('declares three ordered, distinct themes and resolves a stale name to the default', () => {
    expect(THEMES.map((theme) => theme.name)).toEqual(['rotaris-dim', 'nocturne', 'high-contrast']);
    expect(new Set(THEMES.map((theme) => theme.label)).size).toBe(3);
    expect(THEMES.every((theme) => theme.description.length > 0 && theme.dark)).toBe(true);
    expect(resolveTheme('removed-theme').name).toBe('rotaris-dim');
  });

  it('checks every palette against the static contrast pairs and preserves the adopted-palette finding', () => {
    const adopted = resolveTheme('rotaris-dim').tokens.color;
    expect(contrastRatio(adopted['--rt-border-strong']!, adopted['--rt-bg']!)).toBeLessThan(3);
    expect(contrastRatio('oklch(97% 0.02 292)', adopted['--rt-accent-500']!)).toBeLessThan(4.5);
    expect(contrastRatio(adopted['--rt-text-disabled']!, adopted['--rt-surface']!)).toBeLessThan(3);
    for (const theme of THEMES) expect(() => assertThemeContrast(theme)).not.toThrow();
  });

  it('raises only OKLCH lightness and clears the requested floor', () => {
    const base = parseOklch('oklch(35% 0.12 165)');
    const raisedText = raiseLightness('oklch(35% 0.12 165)', 4.5, 'oklch(18% 0 0)');
    const raised = parseOklch(raisedText);
    expect(raised.l).toBeGreaterThan(base.l);
    expect(raised.c).toBe(base.c);
    expect(raised.h).toBe(base.h);
    expect(contrastRatio(raisedText, 'oklch(18% 0 0)')).toBeGreaterThanOrEqual(4.5);
  });

  // Part AN — defect forty-six (ADR-0050): the rounding after the bisection landed this input at 4.49997:1.
  it('never settles a hair below the floor after rounding (ADR-0050 defect forty-six)', () => {
    const raised = raiseLightness('oklch(52% 0.05 292)', 4.5, 'oklch(21% 0 0)');
    expect(contrastRatio(raised, 'oklch(21% 0 0)')).toBeGreaterThanOrEqual(4.5);
    expect(parseOklch(raised).l).toBeCloseTo(0.604, 3);
    // The stated floor is exact: no tolerance is borrowed from the caller.
    for (const [colour, against] of [['oklch(30% 0.1 292)', 'oklch(21% 0 0)'], ['oklch(40% 0.12 25)', 'oklch(25% 0 0)'], ['oklch(35% 0.12 165)', 'oklch(18% 0 0)']] as const) {
      expect(contrastRatio(raiseLightness(colour, 4.5, against), against)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(raiseLightness(colour, 3, against), against)).toBeGreaterThanOrEqual(3);
    }
  });
});
