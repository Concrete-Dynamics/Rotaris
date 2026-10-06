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
 * **`format` is an annotation.** JSON Schema 2020-12 (the dialect MCP names) makes `format` an annotation unless a
 * validator opts into assertion; zod asserts it. A string `format` keyword is dropped before compiling, so a call the
 * server's own schema would accept is never refused for a format the server does not check.
 *
 * **A schema that cannot be compiled leaves the tool callable.** The MCP requirements drop a discovered tool for an empty
 * or non-string name only (REQ-MCP-052), and a persona's callable set is every granted tool that survives
 * `disabled_tools` (REQ-MCP-055, REQ-MCP-059); nothing there drops one for a schema this product's validator cannot read
 * (`if`/`then`/`else`, `dependentRequired`, an external `$ref`, a pattern the host's regular expressions reject). Such a
 * tool keeps the object check alone — a `tools/call` carries an arguments object — and `compiled: false` with the reason,
 * so the caller can say so once.
 */
export interface AdvertisedSchemaCheck {
  readonly schema: z.ZodType<Record<string, unknown>>;
  readonly compiled: boolean;
  /** Why the schema could not be compiled; null when it was. */
  readonly reason: string | null;
}

/** Keywords whose values are data, not schemas: nothing inside them is a `format` keyword. */
const DATA_KEYWORDS = new Set(['enum', 'const', 'default', 'examples']);

function withoutFormatAssertions(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(withoutFormatAssertions);
  if (node === null || typeof node !== 'object') return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === 'format' && typeof value === 'string') continue;
    out[key] = DATA_KEYWORDS.has(key) ? value : withoutFormatAssertions(value);
  }
  return out;
}

export function advertisedSchemaCheck(inputSchema: Readonly<Record<string, unknown>>): AdvertisedSchemaCheck {
  const object = z.record(z.string(), z.unknown());
  let compiled: z.ZodType;
  try {
    compiled = z.fromJSONSchema(withoutFormatAssertions(inputSchema) as Parameters<typeof z.fromJSONSchema>[0]);
  } catch (cause) {
    return { schema: object, compiled: false, reason: cause instanceof Error ? cause.message : String(cause) };
  }
  const schema = object.superRefine((value, ctx) => {
    let result: ReturnType<typeof compiled.safeParse>;
    try {
      result = compiled.safeParse(value);
    } catch {
      return; // A check that cannot run is no refusal: the object check stands, as for a schema that would not compile.
    }
    if (result.success) return;
    for (const issue of result.error.issues) ctx.addIssue({ code: 'custom', path: [...issue.path], message: issue.message });
  });
  return { schema, compiled: true, reason: null };
}
