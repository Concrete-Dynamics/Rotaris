import { Ajv, type ErrorObject, type Options, type ValidateFunction } from 'ajv';
import { Ajv2019 } from 'ajv/dist/2019.js';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { z } from 'zod';

/**
 * REQ-TOOLS-032 for a tool whose parameters are a JSON Schema rather than a zod schema — an MCP tool, whose model-facing
 * parameters are its server's own `inputSchema` (ADR-0034, `toolSpec`). The gate validates every call against the
 * executor's `schema` and nothing else, so an executor that advertises a JSON Schema must hand the gate a zod schema that
 * checks THAT schema; until 2026-10-06 the MCP executor handed it `z.record(z.string(), z.unknown())`, every object passed,
 * and a call missing three required properties was sent to the server (live-run finding G3,
 * docs/defects/fixed/an-mcp-tool-call-that-fails-its-advertised-input-schema-reaches-the-server.md).
 *
 * **The validator is ajv 8, the JSON Schema engine the MCP SDK itself bundles and validates with.** ADR-0033 leaves schema
 * validation to the SDK; `@modelcontextprotocol/client` 2.0.0 carries ajv 8 inside its own bundle (its
 * `AjvJsonSchemaValidator`), but that validator hands back one flattened error string and the SDK does not export its
 * 2020-12 engine — its documentation says to declare `ajv` to construct one. The gate needs each violation's location (the
 * refusal names it, and REQ-TOOLS-032's array repair asks whether the schema refuses one field), so this package declares
 * `ajv` 8.20.0, the version the lockfile already carried, and builds the engines as the SDK does: the dialect from
 * `$schema` (none or 2020-12 → `Ajv2020`, 2019-09 → `Ajv2019`, draft-07 or draft-06 → the draft-07 `Ajv`, any other not
 * compiled), `strict: false`, `validateSchema: false`, `allErrors: true` — every violation in one refusal, so one re-issue
 * can repair them all.
 *
 * **Why not zod's `z.fromJSONSchema`, which the first two repairs used (2026-10-06).** It reads JSON Schema as zod would:
 * each verifier round found another keyword it reads differently — a pattern compiled without the `u` flag, `integer` capped
 * at 2^53, `enum` and `const` compared by identity instead of deep equality, a constraint dropped inside `oneOf` letting two
 * branches match — and each was a call the server accepts, refused on every re-issue. Rewriting the schema around each
 * difference treated symptoms; a JSON Schema validator has none of them by construction.
 *
 * **Checked, never rewritten.** The schema the gate receives is the plain object record, refined by the compiled check: its
 * output is the call's own arguments (ajv runs without `useDefaults`, `coerceTypes` or `removeAdditional`), so a valid call
 * reaches the server exactly as the model wrote it. What the server makes of them is the server's business.
 *
 * **What is read as an annotation, or left unasserted.** A refusal tells the model its call is invalid, and one for a call
 * the server accepts is a refusal no re-issue recovers from, so where this product cannot read a keyword as JSON Schema does,
 * it does not assert it.
 *  - `format` is an annotation, as JSON Schema 2020-12 (the dialect MCP names) has it unless a validator opts into assertion
 *    (`validateFormats: false`; the SDK's own default asserts it, and that is the one setting taken differently).
 *  - A `pattern` that is no ECMA-262 regular expression under the `u` flag (a Python named group, an identity escape) is
 *    removed before compiling, and the rest of the schema still binds, when removing it can only widen what the schema
 *    accepts: when the schema holds no `not`, `oneOf`, `if` or `maxContains` anywhere, each of which can refuse MORE once a
 *    constraint beneath it is gone (two `oneOf` branches both matching, a `not` matching). Otherwise, and for a
 *    `patternProperties` name that is no such expression (which properties it governs cannot be known), the schema is not
 *    compiled. The walk goes by keyword position, so a property NAMED `pattern` or `oneOf` is a property, not the keyword.
 *
 * **`$async` is removed wherever it stands as a keyword.** It is ajv's own keyword, not JSON Schema's, so any other reader of
 * the server's schema ignores it; honoured, ajv compiled an asynchronous validator whose Promise the refinement read as a
 * pass and whose rejection for an invalid call nothing handled, so every call was sent and the run host was left a stray
 * rejection (the fin18 verifier's probe,
 * docs/defects/fixed/an-advertised-schema-marked-async-compiles-a-check-that-never-refuses.md).
 *
 * **A schema that cannot be compiled leaves the tool callable.** The MCP requirements drop a discovered tool for an empty
 * or non-string name only (REQ-MCP-052), and a persona's callable set is every granted tool that survives
 * `disabled_tools` (REQ-MCP-055, REQ-MCP-059); nothing there drops one for a schema this product's validator cannot read (an
 * external `$ref`, a dialect other than the four above, a tuple `items` in a 2020-12 schema). Such a tool keeps the object
 * check alone — a `tools/call` carries an arguments object — and `compiled: false` with the reason, so the caller can say so
 * once.
 */
export interface AdvertisedSchemaCheck {
  readonly schema: z.ZodType<Record<string, unknown>>;
  readonly compiled: boolean;
  /** Why the schema could not be compiled; null when it was. */
  readonly reason: string | null;
}

/** Keywords whose value is one schema (`items` may also be a list, draft 7's tuple). */
const SCHEMA_VALUED = new Set(['items', 'additionalItems', 'additionalProperties', 'not', 'contains', 'propertyNames', 'if', 'then', 'else', 'unevaluatedItems', 'unevaluatedProperties', 'contentSchema']);
/** Keywords whose value maps names to schemas (draft 7's `dependencies` may map a name to a list of names instead). */
const SCHEMA_MAPS = new Set(['properties', 'patternProperties', '$defs', 'definitions', 'dependentSchemas', 'dependencies']);
/** Keywords whose value lists schemas. */
const SCHEMA_LISTS = new Set(['allOf', 'anyOf', 'oneOf', 'prefixItems']);
/** Keywords that can refuse more once a constraint in a schema beneath them is removed. */
const NOT_MONOTONE = new Set(['not', 'oneOf', 'if', 'maxContains']);

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => v !== null && typeof v === 'object' && !Array.isArray(v);

function isUnicodeRegExp(pattern: string): boolean {
  try {
    new RegExp(pattern, 'u');
    return true;
  } catch {
    return false;
  }
}

interface Walk { unreadPatterns: number; notMonotone: string | null }

/** The schema without the patterns no `u`-flag expression reads, counted; throws for a `patternProperties` name of that kind. */
function withoutUnreadPatterns(node: unknown, walk: Walk): unknown {
  if (Array.isArray(node)) return node.map((n) => withoutUnreadPatterns(n, walk));
  if (!isObject(node)) return node; // `true`, `false`, or not a schema (the validator decides).
  const out: Json = {};
  for (const [key, value] of Object.entries(node)) {
    if (NOT_MONOTONE.has(key)) walk.notMonotone ??= key;
    // ajv's own keyword, not JSON Schema's: honoured, it compiles a validator that returns a Promise (see the header).
    if (key === '$async') continue;
    if (key === 'pattern' && typeof value === 'string' && !isUnicodeRegExp(value)) {
      walk.unreadPatterns += 1;
      continue;
    }
    if (SCHEMA_VALUED.has(key) || (SCHEMA_LISTS.has(key) && Array.isArray(value))) out[key] = withoutUnreadPatterns(value, walk);
    else if (SCHEMA_MAPS.has(key) && isObject(value)) {
      if (key === 'patternProperties') {
        const unread = Object.keys(value).find((name) => !isUnicodeRegExp(name));
        if (unread !== undefined) throw new Error(`patternProperties name /${unread}/ is not an ECMA-262 regular expression under the u flag`);
      }
      out[key] = Object.fromEntries(Object.entries(value).map(([name, sub]) => [name, withoutUnreadPatterns(sub, walk)]));
    } else out[key] = value;
  }
  return out;
}

const ENGINE_OPTIONS: Options = { strict: false, validateSchema: false, validateFormats: false, allErrors: true, unicodeRegExp: true };
const DRAFT_2020 = ['https://json-schema.org/draft/2020-12/schema', 'http://json-schema.org/draft/2020-12/schema'];
const DRAFT_2019 = ['https://json-schema.org/draft/2019-09/schema', 'http://json-schema.org/draft/2019-09/schema'];
const DRAFT_07 = ['https://json-schema.org/draft-07/schema', 'http://json-schema.org/draft-07/schema', 'https://json-schema.org/draft-06/schema', 'http://json-schema.org/draft-06/schema'];

/**
 * The engine for the schema's declared dialect, by the MCP SDK's rule (its `declaredDialect`). A fresh engine per schema:
 * ajv files every compiled schema under its `$id`, and two servers (or one server reconnected) may advertise the same `$id`.
 */
function engineFor(schema: Json): Ajv {
  const declared = schema['$schema'];
  if (typeof declared !== 'string') return new Ajv2020(ENGINE_OPTIONS);
  const uri = declared.replace(/#$/, '');
  if (DRAFT_2020.includes(uri)) return new Ajv2020(ENGINE_OPTIONS);
  if (DRAFT_2019.includes(uri)) return new Ajv2019(ENGINE_OPTIONS);
  if (DRAFT_07.includes(uri)) return new Ajv(ENGINE_OPTIONS);
  throw new Error(`the schema declares a dialect the validator does not read ("$schema": "${declared.slice(0, 200)}")`);
}

interface Issue { readonly path: string[]; readonly message: string }

/** One violation, located where the model has to change the call: a missing or an unexpected property names that property. */
function issueOf(error: ErrorObject): Issue {
  const path = error.instancePath === '' ? [] : error.instancePath.slice(1).split('/').map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'));
  const params = error.params as Record<string, unknown>;
  const missing = params['missingProperty'];
  if (error.keyword === 'required' && typeof missing === 'string') return { path: [...path, missing], message: 'required property is missing' };
  const extra = error.keyword === 'additionalProperties' ? params['additionalProperty'] : error.keyword === 'unevaluatedProperties' ? params['unevaluatedProperty'] : undefined;
  if (typeof extra === 'string') return { path: [...path, extra], message: 'is not a property the schema allows' };
  return { path, message: error.message ?? `fails "${error.keyword}"` };
}

export function advertisedSchemaCheck(inputSchema: Readonly<Record<string, unknown>>): AdvertisedSchemaCheck {
  const object = z.record(z.string(), z.unknown());
  let validate: ValidateFunction;
  try {
    const walk: Walk = { unreadPatterns: 0, notMonotone: null };
    const readable = withoutUnreadPatterns(JSON.parse(JSON.stringify(inputSchema)), walk) as Json;
    if (walk.unreadPatterns > 0 && walk.notMonotone !== null) {
      throw new Error(`a pattern is not an ECMA-262 regular expression under the u flag, and without it the schema's "${walk.notMonotone}" could refuse a valid call`);
    }
    validate = engineFor(readable).compile(readable);
  } catch (cause) {
    return { schema: object, compiled: false, reason: cause instanceof Error ? cause.message : String(cause) };
  }
  const schema = object.superRefine((value, ctx) => {
    let errors: readonly ErrorObject[];
    try {
      const verdict: unknown = validate(value);
      // A check that answers anything but a boolean is not a check this refinement can read; `$async` is stripped above,
      // so this is a guard, and a Promise it might still hold is given a handler rather than left to reject unheard.
      if (typeof verdict !== 'boolean') {
        if (verdict instanceof Promise) verdict.catch(() => undefined);
        return;
      }
      if (verdict) return;
      errors = validate.errors ?? [];
    } catch {
      return; // A check that cannot run is no refusal: the object check stands, as for a schema that would not compile.
    }
    const seen = new Set<string>();
    for (const error of errors) {
      const issue = issueOf(error);
      const key = JSON.stringify(issue);
      if (seen.has(key)) continue;
      seen.add(key);
      ctx.addIssue({ code: 'custom', path: issue.path, message: issue.message, params: { keyword: error.keyword } });
    }
  });
  return { schema, compiled: true, reason: null };
}
