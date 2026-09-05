import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { isSecretLookingName } from '@rotaris/kernel';
import { ProviderChoiceSchema, ProviderDialogPayloadSchema, ProviderHealthSchema, ProviderRowSchema, ProviderSignInResultSchema } from './providers.js';
import { ConfigSnapshotSchema } from './config.js';
import { CHANNEL_SCHEMAS } from './channels.js';

/** Every key at every depth of a zod object shape. */
function keysOf(schema: z.ZodTypeAny, path = ''): string[] {
  const out: string[] = [];
  if (schema instanceof z.ZodObject) {
    for (const [k, v] of Object.entries(schema.shape)) { out.push(path ? `${path}.${k}` : k); out.push(...keysOf(v as z.ZodTypeAny, path ? `${path}.${k}` : k)); }
  } else if (schema instanceof z.ZodArray) {
    out.push(...keysOf(schema.element as z.ZodTypeAny, `${path}[]`));
  } else if (schema instanceof z.ZodNullable || schema instanceof z.ZodOptional) {
    out.push(...keysOf(schema.unwrap() as z.ZodTypeAny, path));
  } else if (schema instanceof z.ZodDiscriminatedUnion || schema instanceof z.ZodUnion) {
    for (const o of (schema as unknown as { options: z.ZodTypeAny[] }).options) out.push(...keysOf(o, path));
  }
  return out;
}

describe('ADR-0030 consequence 2: no shape that reaches a renderer has a field named like a credential', () => {
  it('provider rows, health, choices, the dialog payload and the sign-in outcome carry only masked values and statuses', () => {
    const offenders = [ProviderRowSchema, ProviderHealthSchema, ProviderChoiceSchema, ProviderDialogPayloadSchema, ProviderSignInResultSchema]
      .flatMap((s) => keysOf(s)).filter((k) => isSecretLookingName(k.split('.').pop()!.replace('[]', '')));
    expect(offenders).toEqual([]);
  });
  it('the configuration snapshot and every channel payload are equally clean', () => {
    const offenders = [ConfigSnapshotSchema, ...Object.values(CHANNEL_SCHEMAS)].flatMap((s) => keysOf(s as z.ZodTypeAny)).filter((k) => isSecretLookingName(k.split('.').pop()!.replace('[]', '')));
    expect(offenders).toEqual([]);
  });
  it('a row parses with a display mask and never with a raw value field', () => {
    const row = { id: 'openai-compatible--openrouter', displayName: 'OpenRouter', method: 'api-key', methodLabel: 'Paste an API key', authenticated: true, status: 'authenticated', displayMask: 'sk****ef', baseUrl: 'https://openrouter.ai/api/v1', modelCount: 3, userDefined: true, available: true, lastError: null, health: null };
    expect(ProviderRowSchema.safeParse(row).success).toBe(true);
    expect(Object.keys(ProviderRowSchema.shape)).not.toContain('accessToken');
  });
});
