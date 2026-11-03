/**
 * Values a zod schema accepts, generated from the schema itself (R-091, hardening.md §3.5 row 7): the schema is read
 * through zod's public `z.toJSONSchema` in its input form, and each JSON Schema keyword the contracts' schemas produce
 * becomes a fast-check arbitrary. A keyword this does not know throws, naming it, so a schema that grows one is noticed
 * here rather than generated wrongly. Refinements (`.refine`, `.superRefine`) have no JSON Schema form; a caller keeps
 * only the values the schema parses.
 *
 * Sizes are bounded so a value stays small: strings without a `maxLength` up to 12 graphemes, arrays without a
 * `maxItems` up to 3 items, records up to 3 keys, and `{}` (`z.unknown()`) a JSON value at most 2 deep. A number is
 * never `-0`, which JSON writes as `0`: that difference is JSON's, not the schema's.
 */
import fc from 'fast-check';
import { z } from 'zod';

export interface JsonSchema {
  readonly type?: string | readonly string[];
  readonly const?: unknown;
  readonly enum?: readonly unknown[];
  readonly anyOf?: readonly JsonSchema[];
  readonly oneOf?: readonly JsonSchema[];
  readonly allOf?: readonly JsonSchema[];
  readonly properties?: Readonly<Record<string, JsonSchema>>;
  readonly required?: readonly string[];
  readonly additionalProperties?: boolean | JsonSchema;
  readonly propertyNames?: JsonSchema;
  readonly items?: JsonSchema;
  readonly prefixItems?: readonly JsonSchema[];
  readonly format?: string;
  readonly minItems?: number;
  readonly maxItems?: number;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly pattern?: string;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly exclusiveMinimum?: number;
  readonly exclusiveMaximum?: number;
}

/** The keywords below that generate nothing of their own. */
const INERT = new Set(['$schema', 'default', 'description', 'title', 'examples', 'deprecated', 'readOnly']);
const KNOWN = new Set([
  'type', 'const', 'enum', 'anyOf', 'oneOf', 'allOf', 'properties', 'required', 'additionalProperties', 'propertyNames',
  'items', 'prefixItems', 'format', 'minItems', 'maxItems', 'minLength', 'maxLength', 'pattern', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum',
]);

/** The input-side JSON Schema of a zod schema: what a sender may write, defaults optional. */
export function inputJsonSchema(schema: z.ZodType): JsonSchema {
  return z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as JsonSchema;
}

/** The variants of a union at the schema's top: `oneOf` for a discriminated union, `anyOf` for a plain one. */
export function variantsOf(schema: JsonSchema): readonly JsonSchema[] {
  return schema.oneOf ?? schema.anyOf ?? [schema];
}

const INT32 = 2 ** 31 - 1;

/** A value with every `-0` written as `0`, as a JSON round trip writes it. */
export function withoutNegativeZero(value: unknown): unknown {
  if (typeof value === 'number') return value === 0 ? 0 : value;
  if (Array.isArray(value)) return value.map(withoutNegativeZero);
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, withoutNegativeZero(v)]));
  return value;
}

/** `{}` (`z.unknown()`): a JSON value at most 2 deep. */
const anyJson: fc.Arbitrary<unknown> = fc.jsonValue({ maxDepth: 2 }).map(withoutNegativeZero);
const noNegativeZero = (n: number): number => (n === 0 ? 0 : n);

function integerArbitrary(s: JsonSchema): fc.Arbitrary<number> {
  const min = s.minimum ?? (s.exclusiveMinimum !== undefined ? s.exclusiveMinimum + 1 : -INT32);
  const max = s.maximum ?? (s.exclusiveMaximum !== undefined ? s.exclusiveMaximum - 1 : INT32);
  const inner = fc.integer({ min: Math.max(min, -INT32), max: Math.min(max, INT32) });
  // A bound past 32 bits (`.int()`'s safe-integer ceiling) is met at the bound itself as well.
  return (max > INT32 ? fc.oneof(inner, fc.constant(max)) : inner).map(noNegativeZero);
}

function numberArbitrary(s: JsonSchema): fc.Arbitrary<number> {
  return fc
    .double({
      noNaN: true,
      noDefaultInfinity: true,
      min: s.minimum ?? s.exclusiveMinimum ?? -1e9,
      max: s.maximum ?? s.exclusiveMaximum ?? 1e9,
      minExcluded: s.minimum === undefined && s.exclusiveMinimum !== undefined,
      maxExcluded: s.maximum === undefined && s.exclusiveMaximum !== undefined,
    })
    .map(noNegativeZero);
}

function stringArbitrary(s: JsonSchema): fc.Arbitrary<string> {
  const minLength = s.minLength ?? 0;
  if (s.pattern !== undefined) {
    // The pattern decides the length; only a bound the schema declares beside it is applied.
    const lengthOk = (v: string): boolean => v.length >= minLength && v.length <= (s.maxLength ?? Infinity);
    return fc.stringMatching(new RegExp(s.pattern)).filter(lengthOk);
  }
  const maxLength = s.maxLength ?? Math.max(minLength, 12);
  // `minLength`/`maxLength` count UTF-16 units in zod; a grapheme may be two, so the bound is checked on the result.
  return fc.string({ unit: 'grapheme', minLength, maxLength }).filter((v) => v.length >= minLength && v.length <= maxLength);
}

function objectArbitrary(s: JsonSchema): fc.Arbitrary<Record<string, unknown>> {
  const properties = s.properties ?? {};
  const names = Object.keys(properties);
  if (names.length === 0 && s.additionalProperties !== undefined && s.additionalProperties !== false) {
    // A record: keys from `propertyNames`, values from `additionalProperties`.
    const key = s.propertyNames !== undefined ? (arbitraryOf(s.propertyNames) as fc.Arbitrary<string>) : fc.string({ maxLength: 8 });
    const value = s.additionalProperties === true ? anyJson : arbitraryOf(s.additionalProperties);
    const rest = fc.dictionary(key.filter((k) => k !== '__proto__'), value, { maxKeys: 3, noNullPrototype: true });
    // A record keyed by an enum is exhaustive in zod 4, and says so as `required`: those keys are always written.
    const required = s.required ?? [];
    if (required.length === 0) return rest;
    const always = fc.record(Object.fromEntries(required.map((name) => [name, value])) as Record<string, fc.Arbitrary<unknown>>);
    return fc.tuple(always, rest).map(([fixed, more]) => ({ ...more, ...fixed }));
  }
  const model: Record<string, fc.Arbitrary<unknown>> = {};
  for (const name of names) model[name] = arbitraryOf(properties[name]!);
  return fc.record(model, { requiredKeys: (s.required ?? []).filter((name) => names.includes(name)) });
}

/** An arbitrary for every value the JSON Schema `s` admits, within the size bounds above. */
export function arbitraryOf(s: JsonSchema): fc.Arbitrary<unknown> {
  for (const keyword of Object.keys(s)) {
    if (!KNOWN.has(keyword) && !INERT.has(keyword)) throw new Error(`schema-arbitrary: no generator for the keyword '${keyword}'`);
  }
  // A format zod writes always comes with the pattern that decides it (`z.iso.datetime()`'s `date-time`); alone it is unknown.
  if (s.format !== undefined && s.pattern === undefined) throw new Error(`schema-arbitrary: the format '${s.format}' with no pattern`);
  if (s.const !== undefined) return fc.constant(s.const);
  if (s.enum !== undefined) return fc.constantFrom(...s.enum);
  if (s.anyOf !== undefined || s.oneOf !== undefined) return fc.oneof(...(s.anyOf ?? s.oneOf ?? []).map((v) => arbitraryOf(v)));
  if (s.allOf !== undefined) {
    if (s.allOf.length !== 1) throw new Error('schema-arbitrary: an allOf of more than one schema');
    return arbitraryOf(s.allOf[0]!);
  }
  const types = s.type === undefined ? [] : Array.isArray(s.type) ? (s.type as readonly string[]) : [s.type as string];
  if (types.length === 0) return anyJson;
  return fc.oneof(
    ...types.map((type): fc.Arbitrary<unknown> => {
      switch (type) {
        case 'string':
          return stringArbitrary(s);
        case 'integer':
          return integerArbitrary(s);
        case 'number':
          return numberArbitrary(s);
        case 'boolean':
          return fc.boolean();
        case 'null':
          return fc.constant(null);
        case 'array':
          // A tuple (`z.tuple`) is its prefix exactly; a rest element is not generated.
          if (s.prefixItems !== undefined) return fc.tuple(...s.prefixItems.map((item) => arbitraryOf(item)));
          return fc.array(s.items !== undefined ? arbitraryOf(s.items) : anyJson, {
            minLength: s.minItems ?? 0,
            maxLength: Math.min(s.maxItems ?? 3, Math.max(s.minItems ?? 0, 3)),
          });
        case 'object':
          return objectArbitrary(s);
        default:
          throw new Error(`schema-arbitrary: no generator for the type '${type}'`);
      }
    }),
  );
}

/** Any value at all — boxed values, maps, sets, typed and sparse arrays, null prototypes, dates, big integers. */
export const anyInput: fc.Arbitrary<unknown> = fc.anything({
  maxDepth: 3,
  withBigInt: true,
  withBoxedValues: true,
  withDate: true,
  withMap: true,
  withSet: true,
  withNullPrototype: true,
  withObjectString: true,
  withSparseArray: true,
  withTypedArray: true,
});

/** Every value that is not a plain object: primitives, `null`, `undefined`, and arrays. */
export const nonObject: fc.Arbitrary<unknown> = fc.oneof(
  fc.string(),
  fc.double(),
  fc.bigInt(),
  fc.boolean(),
  fc.constant(null),
  fc.constant(undefined),
  fc.array(anyInput, { maxLength: 3 }),
);

/** A key none of `known` names (and never `__proto__`, which an object literal reads as its prototype). */
export function unknownKey(known: ReadonlySet<string>): fc.Arbitrary<string> {
  return fc.string({ minLength: 1, maxLength: 12 }).filter((key) => !known.has(key) && key !== '__proto__');
}

/**
 * The paths of every key `input` holds that `output` does not: a field the parse dropped. Values are not compared — a
 * declared normalisation (`.trim()`, a de-duplicating `.transform`) may change one — only whether each field survived.
 */
export function droppedKeys(input: unknown, output: unknown, path = ''): string[] {
  if (input === null || typeof input !== 'object' || output === null || typeof output !== 'object') return [];
  if (Array.isArray(input)) {
    if (!Array.isArray(output)) return [path];
    return input.flatMap((item, i) => (i < output.length ? droppedKeys(item, output[i], `${path}[${i}]`) : []));
  }
  return Object.keys(input).flatMap((key) =>
    Object.hasOwn(output, key) ? droppedKeys((input as Record<string, unknown>)[key], (output as Record<string, unknown>)[key], `${path}.${key}`) : [`${path}.${key}`],
  );
}
