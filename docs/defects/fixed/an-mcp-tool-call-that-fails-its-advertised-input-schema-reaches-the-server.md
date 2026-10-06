## An MCP tool call that fails its advertised input schema reaches the server

The model is handed an MCP tool's parameters as the server's own `inputSchema` (ADR-0034, `toolSpec`), but the gate
validates every call against the executor's zod `schema`, and an MCP executor's `schema` is
`z.record(z.string(), z.unknown())`: any object passes. So REQ-TOOLS-032's refusal of a schema-invalid payload can never
fire for an MCP tool. A call missing a required property, carrying a property of the wrong type, or a value outside an
`enum` is executed: it is sent to the server, which answers with its own validation error (or, for a server that does not
validate, acts on the arguments). The call is recorded `failed` with `failure_kind: tool_error`, `outcome_kind: mcp`
instead of the gate's `invalid_request`, and the model reads the server's raw error text rather than the gate's
"do not match its schema … Re-issue the call with corrected arguments".

Live-run finding: G3 of the final default live run at `27a5127`.

Recorded 2026-10-06 from the autopsy of that run.

## Specs

- `REQ-TOOLS-032`: "A payload still schema-invalid after repair is returned to the model as a recoverable tool-result
  error … naming the tool and the schema violation and asking for a corrected re-issue. The call is not executed". The
  schema the model was given is the server's `inputSchema`; a call that fails it is executed.
- `REQ-SESSION-136`: such a refusal is a failure filed as `tool_error` referencing the tool-call record, which the gate's
  `refuseInvalid` already does for a built-in tool; an MCP call never reaches it.

## Evidence

Default pack `.live-run/runs/2026-10-06T01-30-08-282Z/` (the `live` worktree; git-ignored), scenario `requirements`,
session `41677019`:

- `requirements/model-traffic.jsonl`, line 28 (0-based; the verifier's request) offers `edit_memory` with
  `required: ["memory_name", "needle", "repl", "mode"]`.
- The store's tool row #45 (`workspace.db`, `tool_calls.ordinal` 45) is that call with `{content, memory_name}` only:
  `failed`, `failure_kind tool_error`, `outcome_kind mcp`, and issue 1 (`tool_error`) references it. The server answered
  "Error executing tool edit_memory: 3 validation errors for applyArguments / needle Field required … repl … mode …".
- `requirements/transcript.md`, rows 84 and 85: "edit_memory content memory_name [failed]", then "I used the wrong tool —
  I should use write_memory"; the memory the verifier meant to keep was never written.

## Relevant files

- `apps/desktop/src/run-host/mcp.ts:331-332` — `executorsFor`: `schema: z.record(z.string(), z.unknown())` beside
  `parameters: { ...tool.inputSchema }`.
- `packages/agent-tools/src/gate.ts:307-312` — the gate's schema check, `executor.schema.safeParse(repaired)`, and its
  `invalid_request` refusal.
- `apps/desktop/src/run-host/tools.ts:236` — `toolSpec`: the model is handed `parameters` where an executor has them.

## Repaired — 2026-10-06 (fin18)

An MCP executor's `schema` is now `advertisedSchemaCheck(tool.inputSchema)`
(`packages/agent-tools/src/advertised-schema.ts`, used by `McpHost.executorsFor` in `apps/desktop/src/run-host/mcp.ts`,
compiled once per discovered schema): the object record refined by zod's `z.fromJSONSchema` reading of the schema the model
was handed. A call that fails it takes the gate's existing path for a built-in tool's schema failure: "The arguments for
'<tool>' do not match its schema (<path>: <violation>; …). Re-issue the call with corrected arguments.", `failed`,
`invalid_request`, one `tool_error` issue referencing the record, and the call is never sent. The refinement's output is
the call's own arguments, so a valid call reaches the server exactly as written: no `default` filled in, no unnamed
property stripped.

- **Validator.** zod's own reader: zod is already the workspace's one runtime validation library (declared by
  `apps/desktop`, pinned at 4.5.4 in the lockfile). The lockfile's only JSON Schema validators, `ajv` 6 and 8, come with
  eslint and electron-builder, which never reach the packaged app; using one would have added a runtime dependency.
- **`format` is read as an annotation**, as JSON Schema 2020-12 has it: zod would assert it, and a call the server's own
  schema accepts must not be refused for a format the server does not check.
- **A schema the reader cannot compile** (`if`/`then`/`else`, `dependentRequired`, an external `$ref`, a pattern the
  host's regular expressions reject) leaves the tool callable under the object check alone, said once per process at
  info ("mcp: the input schema of '<tool>' on MCP server '<server>' could not be compiled (…)"). The MCP requirements drop a
  discovered tool for an empty or non-string name only (REQ-MCP-052), and the callable set is every granted tool that
  survives `disabled_tools` (REQ-MCP-055, REQ-MCP-059); none drops a tool for its schema.
- The scripted dialect's fixed MCP arguments now give a renamed or prefixed fixture tool (`beta_echo`, `gamma_slow`) its
  original's arguments: `{}` for an `echo` is now, correctly, refused.

Pinned by tests that fail without the repair:

- `apps/desktop/src/run-host/mcp.test.ts`, "an MCP call checked against the input schema the model was given": the run's own
  `edit_memory` schema and call (`{content, memory_name}`), under the test's own name `amend_note` (REQ-MCP-116 keeps the
  runtime's tool names in its manifest alone; `code-intelligence.test.ts` fails a quoted one written elsewhere), refused at
  a real gate as `invalid_request` with a `tool_error` issue and never sent (red before: the call reached the connection);
  an enum and a type violation refused; a valid call with an unnamed property sent unchanged; an uncompilable schema
  callable under the object check and said once at info.
- `packages/agent-tools/src/gate.test.ts`, "REQ-TOOLS-032 for a tool advertised by JSON Schema": the exact refusal text, the
  record and the issue; a valid call executed with its own arguments; `format` not asserted while a property named
  `format` still binds; uncompilable schemas; local `$ref`, `anyOf` and `additionalProperties: false` bound.
- `pnpm mcp-proof`, new launch 2b (`schema`): `echo` without `text` refused (`invalid_request`, the text, the issue) with
  nothing reaching the fixture's `--call-file`; `beta_echo` with an extra property received by the fixture exactly as
  written. Green on 2026-10-06 (load average 2.5 to 2.9 on 4 CPUs).
- `pnpm code-intel-proof` against the bundled runtime: PASSED on 2026-10-06 (load average 2.5 to 4.0 on 4 CPUs). Every one
  of the runtime's 22 advertised schemas compiled (no "could not be compiled" line in any launch's log), and the scripted
  `list_memories` and `get_symbols_overview {relative_path}` calls passed the check and succeeded.

## Corrected — 2026-10-06 (fin18, repair round 1)

The fin18 verifier found the repair above refusing calls the server's own schema accepts, which REQ-TOOLS-032 does not
allow and which no re-issue recovers from. The claims it falsified are kept here as written above, beside what replaced
them:

- "the object record refined by zod's `z.fromJSONSchema` reading of the schema the model was handed" assumed zod reads
  JSON Schema as JSON Schema does. It does not everywhere. `pattern` is an ECMA-262 regular expression with Unicode
  semantics (the `u` flag), and zod compiles it without the flag: `{name: "Zoë"}` against `^\p{L}+$` was refused ("must
  match pattern"), since `\p{L}` read as the text "p{L}". `integer` is bounded at 2^53 - 1 by zod's `int()`, and JSON Schema
  sets no bound.
- "a pattern the host's regular expressions reject" made the whole schema uncompilable, so one Python-only pattern (a
  server written in Python, as this run's was, may advertise one) dropped every other check of that tool.
- "`format` is read as an annotation" held only where `format` was not inside the schema of a property named `enum`,
  `const`, `default` or `examples`, which the keyword stripper treated as data and did not enter.
- "a valid call reaches the server exactly as written" was false for an object under one of REQ-TOOLS-032's five array
  field names, which the gate wrapped before the check saw it: recorded and repaired on its own,
  `docs/defects/fixed/the-gate-wraps-an-object-in-an-array-where-the-schema-does-not-expect-one.md`.

`advertisedSchemaCheck` now rewrites the schema before zod reads it, walking it by keyword position (so a property named
like a keyword is a property). `format` is dropped. `integer` is read as a number that is a multiple of 1. A `pattern` zod
reads exactly as the `u` flag does (printable ASCII without `\p`, `\u`, `.`, a negated class or `\S`/`\W`/`\D`) stays zod's.
Any other valid one is checked by the module itself, with the flag, wherever it binds the value unconditionally (the
schema, `properties`, `patternProperties`, `additionalProperties`, `items`, `prefixItems`, `allOf`, a local `$ref`), and
is left unasserted inside `anyOf`, `oneOf`, `not`, `if` and the like, where it would decide a branch. A pattern that is no
regular expression under the flag is left unasserted, and the rest of the schema still binds. A `patternProperties` name
zod would read differently makes the schema uncompilable (object check alone), since zod alone decides which names it
covers. The compiled schema is filed in a registry of its own, not zod's global one. Each zod issue is passed on with its
code, which the gate's array repair reads.

Pinned in `packages/agent-tools/src/gate.test.ts`, "REQ-TOOLS-032: a call the advertised JSON Schema accepts is never
refused": `\p{L}` accepting "Zoë" and refusing "Zoë 2" (text "must match pattern /^\p{L}+$/u"); a code point outside the
BMP one character to `^.$` and `^[^ ]{1,2}$`; Unicode patterns binding through `items`, `additionalProperties`, `allOf` and
a local `$ref` with their paths; a Python named group and a `u`-invalid identity escape unasserted while `required` and
`integer` still bind; a Unicode pattern in an `anyOf` branch not refusing that branch; 2^60 accepted as an integer, 1.5,
-1 under `minimum: 0`, and 7 under `multipleOf: 5` refused, and `["integer", "null"]` taking null and 7 but not 1.5; a
`format` inside properties named `enum` and `default` not asserted. All seven were red on the round-0 module. In
`apps/desktop/src/run-host/mcp.test.ts`, the verifier's `\p{L}` probe through `McpHost.executorsFor` and a real gate: "Zoë"
sent unchanged, "Zoë 2" refused as `invalid_request` and not sent (red before). `pnpm mcp-proof --skip-build` passed on
2026-10-06 at 03:55–03:58 UTC on `1db233a` (load average 12 to 15 on 4 CPUs), 04:16–04:19 on the merge `361fe1c` (9 to 10)
and 04:35–04:38 on `ea31a8d` (5 to 10): `echo` without `text` refused (`invalid_request`, the gate's text, nothing
reaching the fixture), the valid call received as written. `pnpm code-intel-proof --skip-build` passed at 03:58–04:08 on
`1db233a` (about 10 to 15) and 04:19–04:28 on `361fe1c` (6 to 10), with no "could not be compiled" line in its logs.

## Corrected — 2026-10-06 (fin18, repair round 2)

The fin18 verifier found the round-1 check still refusing calls the server's own schema accepts. The claims it falsified,
kept as written above, beside what replaced them:

- "left unasserted inside `anyOf`, `oneOf`, `not`, `if` and the like, where it would decide a branch" called leaving a
  pattern out lenient. For `anyOf` it is; for `oneOf` it is not: with a constraint gone two branches can match, and
  `oneOf` then refuses. `{src: {url: "file:/x"}}` against a `oneOf` of `^https://.+` and `^file:` branches was refused
  ("more than one option matched") although only the second branch matches; so were `"123"` against `^\p{L}+$` /
  `^[0-9]+$` and `"xy"` against `^a.c$` / `maxLength: 2`. (`not` and `if` have the same property: a dropped constraint
  inside them refuses more, not less.)
- The module comment's "read as JSON Schema reads it, or not asserted" did not hold for `enum` and `const`, which zod's
  reader compares by identity (or misreads, for an array `const`), where JSON Schema compares by deep equality: `{x: 1}`
  against `enum: [{x: 1}, 2]`, `[1, 2]` against `enum: [[1, 2], "x"]`, `["x"]` against `const: ["x"]`, `{x: [1]}` against
  `const: {x: [1]}` and `{mode: "auto"}` against `anyOf: [{const: {mode: "auto"}}, {type: "string"}]` were all refused.
- The round-0 choice of validator, "zod's own reader … using [ajv] would have added a runtime dependency", rested on two
  readings that do not hold: that zod's reader reads JSON Schema as JSON Schema does (four keywords in two rounds showed
  otherwise, and each rewrite around one was a new place to be wrong), and that ajv never reaches the packaged app
  (`@modelcontextprotocol/client` 2.0.0, a runtime dependency since ADR-0033, carries ajv 8 inside its own bundle as its
  `AjvJsonSchemaValidator`).

**The root cause** was the validator, not any one keyword: zod's `z.fromJSONSchema` converts JSON Schema into zod, and
reads it as zod would. `advertisedSchemaCheck` now validates with **ajv 8.20.0**, the engine the MCP SDK bundles,
declared by `packages/agent-tools` and `apps/desktop` (ADR-0056's rule) at the version the lockfile already carried. It is
declared directly because the SDK's validator returns one flattened error string and does not export its 2020-12 engine,
and the gate's refusal and REQ-TOOLS-032's array repair need each violation's location. The engines are built as the SDK
builds them (the dialect from `$schema`: none or 2020-12, 2019-09, draft-07/06; any other is not compiled; `strict: false`,
`validateSchema: false`, `allErrors: true`), with `validateFormats: false` so `format` stays an annotation. Patterns
carry the `u` flag, `enum` and `const` compare by deep equality, `integer` has no bound, `oneOf` is decided exactly, and
`if`/`then`/`else`, `dependentRequired` and `unevaluatedProperties` now bind instead of leaving the schema uncompiled. The
round-1 rewrites (the pattern split, the integer rewrite, the `format` stripper, the private registry) are gone. One walk
remains: a `pattern` that is no regular expression under the `u` flag is removed when removing it can only widen what the
schema accepts (no `not`, `oneOf`, `if` or `maxContains` anywhere in it), and otherwise the schema is not compiled (object
check alone); a `patternProperties` name of that kind leaves it uncompiled too. A refusal now names a missing property as
"<name>: required property is missing" and an unexpected one as "<name>: is not a property the schema allows"; other
violations carry ajv's own message (`must match pattern "^file:"`, `must be equal to one of the allowed values`).

Pinned by tests that fail on the round-1 module:

- `packages/agent-tools/src/gate.test.ts`, "REQ-TOOLS-032: a call the advertised JSON Schema accepts is never refused": the
  verifier's three `oneOf` probes accepted, with `ftp://a`, `a1` and `abcd` still refused; an object `enum`, an array
  `enum`, an array `const`, an object `const` and a `const` object inside `anyOf` accepted, and their near misses refused;
  a pattern no `u`-flag expression reads under `oneOf` or `not` leaving the schema uncompiled (the valid call sent), while
  under a property NAMED `oneOf` it is removed and `required` still binds. In "REQ-TOOLS-032 for a tool advertised by JSON
  Schema": `if`/`then`/`else`, `dependentRequired` and `unevaluatedProperties` binding; a draft-04 schema uncompiled.
- `apps/desktop/src/run-host/mcp.test.ts`: probe 1 and an object `enum` through `McpHost.executorsFor` and a real gate,
  the valid call sent unchanged and the near misses refused as `invalid_request`; the uncompiled case now a draft-04 schema.
- Every round-0 and round-1 test passes unchanged against the new check except for the refusal wording (the required
  property, the pattern message) and the uncompilable example (`if`/`then`/`else` now compiles).
- `pnpm mcp-proof --skip-build` on the built head (`7b2f292`), 2026-10-06 05:39–05:42 UTC (load average 6 to 10 on 4
  CPUs): launch 2b's `echo` without `text` refused as `invalid_request` with "text: required property is missing", nothing
  reaching the fixture; the valid call received as written. ajv's compiled validators run in the built run host.
- `pnpm code-intel-proof --skip-build`, 05:42–05:51 UTC (load 6 to 8): PASSED; all 22 of the bundled runtime's schemas
  compiled (no "could not be compiled" line in its logs), and the scripted calls passed the check and succeeded.
