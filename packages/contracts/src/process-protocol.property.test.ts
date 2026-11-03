/**
 * Property tests over `ProcessMessageSchema`, what a utility process sends main: a reply, an event or a service ask
 * (ADR-0044; R-091, hardening.md §3.5 row 7). `contracts.test.ts` holds the worked examples; this file holds what must be
 * true of every message: the parse never throws, a non-object is refused, a valid message survives a JSON round trip
 * whole, and an unknown key on the envelope is stripped. String bounds are not asserted here; a generated value meets
 * whatever bounds the schema declares, read from the schema.
 *
 * Valid messages are generated per envelope and per inner `kind` from the schema itself
 * (`schema-arbitrary.test-support.ts`); "every kind is generated" fails, naming it, if one cannot be.
 *
 * Seeded: each property runs `numRuns: 500` from `SEED`, so a run is the same 500 cases every time. A failure prints
 * the counterexample with its seed and path; `fc.assert(…, { seed, path })` with the printed values replays it alone.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ProcessMessageSchema } from './process-protocol.js';
import { anyInput, arbitraryOf, inputJsonSchema, droppedKeys, nonObject, unknownKey, variantsOf, type JsonSchema } from './schema-arbitrary.test-support.js';

const SEED = 20261103;
const RUNS = { seed: SEED, numRuns: 500 } as const;

const envelopes = variantsOf(inputJsonSchema(ProcessMessageSchema));
/** Every key any envelope declares: an unknown key must name none of them, or it could select another envelope. */
const envelopeKeys = new Set(envelopes.flatMap((envelope) => Object.keys(envelope.properties ?? {})));

/** The envelope's one union-valued field (`reply`, `event`, `request`) and the variants inside it. */
function innerOf(envelope: JsonSchema): { readonly field: string; readonly variants: readonly JsonSchema[] } {
  const entry = Object.entries(envelope.properties ?? {}).find(([, schema]) => schema.oneOf !== undefined || schema.anyOf !== undefined);
  if (entry === undefined) throw new Error('an envelope with no union-valued field');
  return { field: entry[0], variants: variantsOf(entry[1]) };
}

/** One envelope with its inner field fixed to one variant. */
function envelopeWith(envelope: JsonSchema, field: string, variant: JsonSchema): JsonSchema {
  return { ...envelope, properties: { ...envelope.properties, [field]: variant } };
}

const cases = envelopes.flatMap((envelope) => {
  const { field, variants } = innerOf(envelope);
  return variants.map((variant) => ({ name: `${field}:${String(variant.properties?.['kind']?.const)}`, schema: envelopeWith(envelope, field, variant) }));
});

interface Generated {
  readonly message: Record<string, unknown>;
}
const validMessage: fc.Arbitrary<Generated> = fc
  .constantFrom(...cases)
  .chain(({ schema }) => arbitraryOf(schema).map((message) => ({ message: message as Record<string, unknown> })))
  .filter(({ message }) => ProcessMessageSchema.safeParse(message).success);

describe('contracts — ProcessMessageSchema, as properties (ADR-0044)', () => {
  it('every kind is generated: each envelope and each kind inside it yields a message the schema parses', () => {
    const missing = cases.filter(({ schema }) => !fc.sample(arbitraryOf(schema), { seed: SEED, numRuns: 50 }).some((message) => ProcessMessageSchema.safeParse(message).success));
    expect(missing.map(({ name }) => name)).toEqual([]);
    expect(envelopes.length).toBe(3);
  });

  it('never throws, whatever it is handed', () => {
    const shaped = fc
      .tuple(fc.constantFrom(...cases), fc.dictionary(fc.string({ maxLength: 12 }), anyInput, { maxKeys: 4 }), anyInput)
      .map(([{ name }, rest, inner]) => {
        const [field, kind] = name.split(':') as [string, string];
        return { ...rest, v: 1, [field]: inner !== null && typeof inner === 'object' ? { ...inner, kind } : { kind } };
      });
    fc.assert(
      fc.property(fc.oneof(anyInput, fc.jsonValue({ maxDepth: 4 }), shaped), (input) => {
        let result: { success: boolean } | undefined;
        expect(() => {
          result = ProcessMessageSchema.safeParse(input);
        }).not.toThrow();
        expect(typeof result?.success).toBe('boolean');
      }),
      RUNS,
    );
  });

  it('refuses every value that is not an object', () => {
    fc.assert(
      fc.property(nonObject, (input) => {
        expect(ProcessMessageSchema.safeParse(input).success).toBe(false);
      }),
      RUNS,
    );
  });

  it('keeps every field of a valid message, and a JSON round trip of the parsed message parses to the same value', () => {
    fc.assert(
      fc.property(validMessage, ({ message }) => {
        const parsed = ProcessMessageSchema.parse(message);
        expect(droppedKeys(message, parsed)).toEqual([]);
        expect(ProcessMessageSchema.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
      }),
      RUNS,
    );
  });

  it('strips an unknown key on the envelope (z.object, not strict): the message parses as it would without it', () => {
    const withExtra = validMessage.chain(({ message }) =>
      fc.tuple(unknownKey(envelopeKeys), fc.jsonValue({ maxDepth: 2 })).map(([key, value]) => ({ message, key, value })),
    );
    fc.assert(
      fc.property(withExtra, ({ message, key, value }) => {
        const parsed = ProcessMessageSchema.safeParse({ ...message, [key]: value });
        expect(parsed.success, key).toBe(true);
        expect(Object.hasOwn(parsed.data ?? {}, key), key).toBe(false);
        expect(parsed.data).toEqual(ProcessMessageSchema.parse(message));
      }),
      RUNS,
    );
  });
});
