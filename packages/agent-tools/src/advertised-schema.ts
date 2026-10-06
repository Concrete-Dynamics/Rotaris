import { z } from 'zod';

/**
 * REQ-TOOLS-032 for a tool whose parameters are a JSON Schema rather than a zod schema — an MCP tool, whose model-facing
 * parameters are its server's own `inputSchema` (ADR-0034, `toolSpec`). The gate validates every call against the
 * executor's `schema` and nothing else, so an executor that advertises a JSON Schema must hand the gate a zod schema that
 * checks THAT schema; until 2026-10-06 the MCP executor handed it `z.record(z.string(), z.unknown())`, every object passed,
 * and a call missing three required properties was sent to the server (live-run finding G3,
 * docs/defects/fixed/an-mcp-tool-call-that-fails-its-advertised-input-schema-reaches-the-server.md).
 *
 * **The validator is zod's own `z.fromJSONSchema`.** zod is the one validation library the workspace already ships
 * (`apps/desktop` declares it, ADR-0016's executors are written in it), and its 4.x line carries a JSON Schema reader; the
 * only JSON Schema validators in the lockfile (`ajv` 6 and 8) are there for eslint and electron-builder, development tools
 * that never reach the packaged app, so using one would add a runtime dependency where none is needed. zod calls the reader
 * semi-experimental; the lockfile pins zod exactly, and the tests beside this module and the MCP executor pin the behaviour
 * the gate relies on.
 *
 * **Checked, never rewritten.** The schema the gate receives is the plain object record, refined by the compiled check: its
 * output is the call's own arguments, so a valid call reaches the server exactly as the model wrote it — no `default`
 * filled in, no property the schema does not name stripped. What the server makes of them is the server's business.
 *
 * **Read as JSON Schema reads it, or not asserted.** The schema is rewritten before zod reads it wherever zod's reading
 * and JSON Schema's differ, and a keyword that cannot be read faithfully is left unasserted rather than read wrongly: a
 * refusal tells the model its call is invalid, and one for a call the server accepts is a refusal no re-issue recovers
 * from. The rewrite walks the schema by keyword position (`properties` maps names to schemas, `enum` holds data, and so on),
 * so a property NAMED `format`, `pattern` or `enum` is a property, never the keyword.
 *  - `format` is an annotation. JSON Schema 2020-12 (the dialect MCP names) makes it one unless a validator opts into
 *    assertion; zod asserts it. It is dropped before compiling.
 *  - `pattern` is an ECMA-262 regular expression with Unicode semantics, the `u` flag. zod compiles it without the flag, so
 *    `\p{L}` reads as the text "p{L}" and `.` as one UTF-16 unit; the fin18 verifier's `{name: "Zoë"}` against
 *    `^\p{L}+$` was refused although the server accepts it. A pattern zod reads exactly as the `u` flag does (printable
 *    ASCII without a property escape, a code point escape, `.`, a negated class or a negated class escape) stays zod's;
 *    any other is taken out of zod's hands and checked here with the flag wherever it binds the value unconditionally (the
 *    schema itself, `properties`, `patternProperties`, `additionalProperties`, `items`, `prefixItems`, `allOf`, a local
 *    `$ref`), and left unasserted inside `anyOf`, `oneOf`, `not`, `if`, `contains` and `propertyNames`, where it would
 *    decide a branch. A pattern that is not a valid regular expression under the flag (a Python named group, an identity
 *    escape) is not asserted either; the rest of the schema still binds.
 *  - `integer` has no bound. zod's `int()` stops at 2^53 - 1; JSON Schema's integer is any number with no fractional
 *    part, so it is read as a number that is a multiple of 1.
 *
 * **A schema that cannot be compiled leaves the tool callable.** The MCP requirements drop a discovered tool for an empty
 * or non-string name only (REQ-MCP-052), and a persona's callable set is every granted tool that survives
 * `disabled_tools` (REQ-MCP-055, REQ-MCP-059); nothing there drops one for a schema this product's validator cannot read
 * (`if`/`then`/`else`, `dependentRequired`, an external `$ref`, a `patternProperties` name zod would read differently).
 * Such a tool keeps the object check alone — a `tools/call` carries an arguments object — and `compiled: false` with the
 * reason, so the caller can say so once.
 */
export interface AdvertisedSchemaCheck {
  readonly schema: z.ZodType<Record<string, unknown>>;
  readonly compiled: boolean;
  /** Why the schema could not be compiled; null when it was. */
  readonly reason: string | null;
}

/** The private keyword a rewritten schema carries a Unicode pattern under, for `unicodePatternIssues`; zod keeps it as metadata. */
const UNICODE_PATTERN = 'x-rotaris-unicode-pattern';

/** Keywords whose value is one schema (`items` may also be a list, draft 7's tuple). */
const SCHEMA_VALUED = new Set(['items', 'additionalItems', 'additionalProperties', 'not', 'contains', 'propertyNames', 'if', 'then', 'else', 'unevaluatedItems', 'unevaluatedProperties', 'contentSchema']);
/** Keywords whose value maps names to schemas. */
const SCHEMA_MAPS = new Set(['properties', 'patternProperties', '$defs', 'definitions', 'dependentSchemas']);
/** Keywords whose value lists schemas. */
const SCHEMA_LISTS = new Set(['allOf', 'anyOf', 'oneOf', 'prefixItems']);

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => v !== null && typeof v === 'object' && !Array.isArray(v);

const compiledPatterns = new Map<string, RegExp | null>();

/** The pattern under the `u` flag, compiled once per process; null when it is no regular expression under the flag. */
function unicodeRegExp(pattern: string): RegExp | null {
  let re = compiledPatterns.get(pattern);
  if (re === undefined) {
    try {
      re = new RegExp(pattern, 'u');
    } catch {
      re = null;
    }
    compiledPatterns.set(pattern, re);
  }
  return re;
}

/**
 * Whether zod's `new RegExp(pattern)` matches exactly what `new RegExp(pattern, 'u')` matches. Conservative: printable ASCII
 * only, and none of the constructs whose meaning the flag changes (`\p`/`\P`, `\u`, `.`, `[^…]`, `\S`/`\W`/`\D`, which
 * count a code point outside the BMP as two characters without it), and valid both ways.
 */
function zodReadsAsUnicode(pattern: string): boolean {
  if (!/^[\x20-\x7e]*$/.test(pattern)) return false;
  let inClass = false;
  for (let i = 0; i < pattern.length; i += 1) {
    const c = pattern[i];
    if (c === '\\') {
      const next = pattern[i + 1];
      if (next === undefined || 'pPuSWD'.includes(next)) return false;
      i += 1;
    } else if (inClass) {
      if (c === ']') inClass = false;
    } else if (c === '[') {
      if (pattern[i + 1] === '^') return false;
      inClass = true;
    } else if (c === '.') {
      return false;
    }
  }
  try {
    new RegExp(pattern);
  } catch {
    return false;
  }
  return unicodeRegExp(pattern) !== null;
}

function integerAsNumber(type: unknown): { type: unknown; allOf?: Json[] } {
  if (type === 'integer') return { type: 'number', allOf: [{ type: 'number', multipleOf: 1 }] };
  if (!Array.isArray(type) || !type.includes('integer')) return { type };
  if (type.includes('number')) return { type: type.filter((t) => t !== 'integer') };
  return {
    type: type.map((t) => (t === 'integer' ? 'number' : t)),
    allOf: [{ anyOf: type.map((t) => (t === 'integer' ? { type: 'number', multipleOf: 1 } : { type: t })) }],
  };
}

/** One schema, rewritten for zod as the module comment says. Throws where the schema cannot be read faithfully at all. */
function forZod(node: unknown): unknown {
  if (!isObject(node)) return node; // `true`, `false`, or not a schema (zod decides).
  const out: Json = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === 'format' && typeof value === 'string') continue;
    if (key === 'pattern' && typeof value === 'string') {
      if (zodReadsAsUnicode(value)) out[key] = value;
      else if (unicodeRegExp(value) !== null) out[UNICODE_PATTERN] = value;
      continue;
    }
    if (key === 'items' && Array.isArray(value)) out[key] = value.map(forZod);
    else if (SCHEMA_VALUED.has(key)) out[key] = forZod(value);
    else if (SCHEMA_LISTS.has(key) && Array.isArray(value)) out[key] = value.map(forZod);
    else if (SCHEMA_MAPS.has(key) && isObject(value)) {
      if (key === 'patternProperties') {
        const unread = Object.keys(value).find((name) => !zodReadsAsUnicode(name));
        if (unread !== undefined) throw new Error(`patternProperties name /${unread}/ is not read with Unicode semantics by the validator`);
      }
      out[key] = Object.fromEntries(Object.entries(value).map(([name, sub]) => [name, forZod(sub)]));
    } else out[key] = value;
  }
  if (out['type'] !== undefined) {
    const { type, allOf } = integerAsNumber(out['type']);
    out['type'] = type;
    if (allOf) out['allOf'] = [...(Array.isArray(out['allOf']) ? out['allOf'] : []), ...allOf];
  }
  return out;
}

function resolveLocal(root: Json, ref: string): unknown {
  if (!ref.startsWith('#')) return undefined;
  let at: unknown = root;
  for (const raw of ref.slice(1).split('/').filter(Boolean)) {
    const segment = decodeURIComponent(raw).replace(/~1/g, '/').replace(/~0/g, '~');
    if (!isObject(at) && !Array.isArray(at)) return undefined;
    at = (at as Json)[segment];
  }
  return at;
}

interface PatternIssue { readonly path: PropertyKey[]; readonly message: string }

/** The Unicode patterns `forZod` took out of zod's hands, checked wherever they bind the value unconditionally. */
function unicodePatternIssues(schema: unknown, value: unknown, path: PropertyKey[], root: Json, out: PatternIssue[], depth: number): void {
  if (!isObject(schema) || depth > 64) return;
  if (typeof schema['$ref'] === 'string') unicodePatternIssues(resolveLocal(root, schema['$ref']), value, path, root, out, depth + 1);
  const pattern = schema[UNICODE_PATTERN];
  if (typeof pattern === 'string' && typeof value === 'string' && unicodeRegExp(pattern)?.test(value) === false) {
    out.push({ path, message: `Invalid string: must match pattern /${pattern}/u` });
  }
  if (Array.isArray(schema['allOf'])) for (const sub of schema['allOf']) unicodePatternIssues(sub, value, path, root, out, depth + 1);
  if (isObject(value)) {
    const properties = isObject(schema['properties']) ? schema['properties'] : {};
    const patterned = isObject(schema['patternProperties']) ? Object.entries(schema['patternProperties']) : [];
    for (const [name, member] of Object.entries(value)) {
      let named = Object.hasOwn(properties, name);
      if (named) unicodePatternIssues(properties[name], member, [...path, name], root, out, depth + 1);
      for (const [key, sub] of patterned) {
        if (unicodeRegExp(key)?.test(name) !== true) continue;
        named = true;
        unicodePatternIssues(sub, member, [...path, name], root, out, depth + 1);
      }
      if (!named) unicodePatternIssues(schema['additionalProperties'], member, [...path, name], root, out, depth + 1);
    }
  }
  if (Array.isArray(value)) {
    const prefix = Array.isArray(schema['prefixItems']) ? schema['prefixItems'] : Array.isArray(schema['items']) ? schema['items'] : [];
    const rest = Array.isArray(schema['items']) ? schema['additionalItems'] : schema['items'];
    value.forEach((element, i) => unicodePatternIssues(i < prefix.length ? prefix[i] : rest, element, [...path, i], root, out, depth + 1));
  }
}

export function advertisedSchemaCheck(inputSchema: Readonly<Record<string, unknown>>): AdvertisedSchemaCheck {
  const object = z.record(z.string(), z.unknown());
  let rewritten: Json;
  let compiled: z.ZodType;
  try {
    rewritten = forZod(JSON.parse(JSON.stringify(inputSchema))) as Json;
    // A registry of its own: zod files a schema's unknown keywords as metadata, and an `id` there would collide in the
    // global registry with the same schema compiled again (a reconnect, a second persona).
    compiled = z.fromJSONSchema(rewritten as Parameters<typeof z.fromJSONSchema>[0], { registry: z.registry() });
  } catch (cause) {
    return { schema: object, compiled: false, reason: cause instanceof Error ? cause.message : String(cause) };
  }
  const schema = object.superRefine((value, ctx) => {
    let result: ReturnType<typeof compiled.safeParse>;
    const patterns: PatternIssue[] = [];
    try {
      result = compiled.safeParse(value);
      unicodePatternIssues(rewritten, value, [], rewritten, patterns, 0);
    } catch {
      return; // A check that cannot run is no refusal: the object check stands, as for a schema that would not compile.
    }
    // Each issue keeps its code (`invalid_type`, `expected: array`, …) as well as its path and message, so the gate's array
    // repair can read where the schema expects an array (`repairArrayFields`).
    if (!result.success) for (const issue of result.error.issues) ctx.addIssue({ ...issue, path: [...issue.path] } as Parameters<typeof ctx.addIssue>[0]);
    for (const issue of patterns) ctx.addIssue({ code: 'custom', path: issue.path, message: issue.message });
  });
  return { schema, compiled: true, reason: null };
}
