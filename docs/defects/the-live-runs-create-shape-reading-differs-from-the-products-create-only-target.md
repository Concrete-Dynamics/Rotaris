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

Found by fin23's verifier (plan fin23, landed at `d653d89`).

## Specs

None contradicted by the product: this is the harness. It bears on the verification of PD-TOOLS-007 (the inferred
create) and REQ-TOOLS-135 (the `write_file` operations and their fields).

## Relevant files

- `apps/desktop/scripts/lib/tool-frictions.mjs` — `createShaped`, `argumentFields`, `prefixFields`.
- `packages/agent-tools/src/tools/files.ts` — `createOnlyTarget`, `writeSchema`.
