## The live run's create-shape reading differs from the product's `createOnlyTarget`

PD-TOOLS-007's reading in the live run (`createShaped` in `apps/desktop/scripts/lib/tool-frictions.mjs`) decides which
refused `write_file` calls the product should have read as a create. The product decides it in `createOnlyTarget`
(`packages/agent-tools/src/tools/files.ts`): a path (`path ?? file_path`) that is a non-empty string, `content` a string,
none of `old_string`, `new_string` or `insert_line`, and `replace_all` not `true`; any other key is let through (the
`write_file` schema is not strict and strips it). The harness differs:

- it drops a call carrying `replace_all: false`, or any key outside `path`, `file_path` and `content`, which the product
  still infers — a refusal of such a call (the old shape) passes in silence;
- it accepts `path: ''`, which the product refuses without inferring — a false FAIL, `outside('')` resolving to the
  workspace itself;
- it takes a `path: null` beside a `file_path` as the path, where the product's `??` passes over it to `file_path`;
- on cut arguments a non-string value (`replace_all: false`) ends the reading, so a key after it is never seen.

A fifth difference was found by the repair's parity test: a `file_path` that is no string beside a string `path` (or a
`replace_all` that is no boolean) passes `createOnlyTarget` but fails `writeSchema`, which the gate applies to the inferred
call (`Gate.dispatch` in `packages/agent-tools/src/gate.ts`), so the product infers nothing; the harness called it
create-shaped.

Found by fin23's verifier (plan fin23, landed at `d653d89`).

## Specs

None contradicted by the product: this is the harness. It bears on the verification of PD-TOOLS-007 (the inferred
create) and REQ-TOOLS-135 (the `write_file` operations and their fields).

## Relevant files

- `apps/desktop/scripts/lib/tool-frictions.mjs` — `createShaped`, `argumentFields`, `prefixFields`.
- `packages/agent-tools/src/tools/files.ts` — `createOnlyTarget`, `writeSchema`.

## Outcome

Repaired 2026-10-06 by fin25 (bundle `fin25-harness-and-record`). `createShaped` in
`apps/desktop/scripts/lib/tool-frictions.mjs` now reads what the product reads: no `operation`; none of `old_string`,
`new_string`, `insert_line`, whatever its value; `replace_all` absent or `false`; `path` and `file_path` each absent or a
string, the target `path ?? file_path` not empty; `content` a string; any other key let through. On cut arguments
`prefixFields` reads a literal value (`true`, `false`, `null`, a number) and goes on, a literal the cut reached read as
unknown. One difference is kept and stated in the code: a key the cut took away is not seen, so a cut call whose
`old_string` came after its content is still called create-shaped. Since fin23's second repair the session writer keeps an
error-path record's arguments an object (OQ-209), so only an older pack or store holds such a string.

Pinned by `apps/desktop/scripts/lib/tool-frictions.test.ts` ("the create shape agrees with the product's inference"):
nineteen argument shapes, each run through the product's own `writeFileTool` (`inferArguments`, then `writeSchema` as the
gate applies it) and through the harness, agreeing on every one — `replace_all: false`, an extra key, an empty path (alone
and beside a `file_path`) and a `file_path` that is no string were red on the old reader — and a case for cut arguments
carrying `replace_all: false`, `true`, an extra key, an empty path, and a literal the cut split.
