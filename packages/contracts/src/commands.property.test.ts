/**
 * Property tests over `CommandRequestSchema`, the one outward channel's request (ADR-0044, ADR-0019; R-091,
 * hardening.md §3.5 row 7). `commands.test.ts` holds the worked examples; this file holds what must be true of every
 * input a renderer can send: the parse never throws, a non-object is refused, a valid request survives a JSON round trip
 * whole, and an unknown top-level key is stripped. String bounds are not asserted here (OQ-467's bounds have their own
 * tests); a generated value meets whatever bounds the schema declares, read from the schema.
 *
 * Valid requests are generated per `kind` from the schema itself (`schema-arbitrary.test-support.ts`), so a new kind is
 * generated without an edit here; "every kind is generated" fails, naming it, if one cannot be.
 *
 * Seeded: each property runs `numRuns: 500` from `SEED`, so a run is the same 500 cases every time. A failure prints
 * the counterexample with its seed and path; `fc.assert(…, { seed, path })` with the printed values replays it alone.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CommandRequestSchema } from './commands.js';
import { anyInput, arbitraryOf, inputJsonSchema, droppedKeys, nonObject, unknownKey, variantsOf, type JsonSchema } from './schema-arbitrary.test-support.js';

const SEED = 20261103;
const RUNS = { seed: SEED, numRuns: 500 } as const;

const variants = variantsOf(inputJsonSchema(CommandRequestSchema));
const kindOf = (variant: JsonSchema): string => String(variant.properties?.['kind']?.const);
const kinds = variants.map(kindOf);

/** One kind's request as a sender may write it, kept only where the schema (refinements included) parses it. */
interface Generated {
  readonly variant: JsonSchema;
  readonly request: Record<string, unknown>;
}
const validRequest: fc.Arbitrary<Generated> = fc
  .constantFrom(...variants)
  .chain((variant) => arbitraryOf(variant).map((request) => ({ variant, request: request as Record<string, unknown> })))
  .filter(({ request }) => CommandRequestSchema.safeParse(request).success);

describe('contracts — CommandRequestSchema, as properties (ADR-0044)', () => {
  it('every kind is generated: each kind of the union yields a request the schema parses', () => {
    const missing = variants.filter(
      (variant) => !fc.sample(arbitraryOf(variant), { seed: SEED, numRuns: 50 }).some((request) => CommandRequestSchema.safeParse(request).success),
    );
    expect(missing.map(kindOf)).toEqual([]);
    expect(new Set(kinds).size).toBe(kinds.length);
  });

  it('never throws, whatever it is handed', () => {
    const shaped = fc
      .tuple(fc.constantFrom(...kinds), fc.dictionary(fc.string({ maxLength: 12 }), anyInput, { maxKeys: 4 }))
      .map(([kind, rest]) => ({ ...rest, kind }));
    fc.assert(
      fc.property(fc.oneof(anyInput, fc.jsonValue({ maxDepth: 4 }), shaped), (input) => {
        let result: { success: boolean } | undefined;
        expect(() => {
          result = CommandRequestSchema.safeParse(input);
        }).not.toThrow();
        expect(typeof result?.success).toBe('boolean');
      }),
      RUNS,
    );
  });

  it('refuses every value that is not an object', () => {
    fc.assert(
      fc.property(nonObject, (input) => {
        expect(CommandRequestSchema.safeParse(input).success).toBe(false);
      }),
      RUNS,
    );
  });

  it('keeps every field of a valid request, and a JSON round trip of the parsed request parses to the same value', () => {
    fc.assert(
      fc.property(validRequest, ({ request }) => {
        const parsed = CommandRequestSchema.parse(request);
        expect(droppedKeys(request, parsed)).toEqual([]);
        expect(CommandRequestSchema.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
      }),
      RUNS,
    );
  });

  it('strips an unknown top-level key on every kind (z.object, not strict): the request parses as it would without it', () => {
    const withExtra = validRequest.chain(({ variant, request }) =>
      fc.tuple(unknownKey(new Set(Object.keys(variant.properties ?? {}))), fc.jsonValue({ maxDepth: 2 })).map(([key, value]) => ({ request, key, value })),
    );
    fc.assert(
      fc.property(withExtra, ({ request, key, value }) => {
        const extended = { ...request, [key]: value };
        const parsed = CommandRequestSchema.safeParse(extended);
        expect(parsed.success, key).toBe(true);
        expect(Object.hasOwn(parsed.data ?? {}, key), key).toBe(false);
        expect(parsed.data).toEqual(CommandRequestSchema.parse(request));
      }),
      RUNS,
    );
  });
});
