## A delegate call's sibling and artifact ids can be cut in an error-path record

An error-path tool record's arguments are cut to 2,000 characters by `cutArguments` (`packages/engine/src/run/cut.ts`),
which keeps a value whole when its key names a path, an identifier or a timestamp: the key's last word is in `WHOLE_WORDS`,
or the key is one of this product's own in `WHOLE_KEYS` (`persona`, `supersedes`, `depends_on`, `continuation_of`,
`write_scope`). `delegate`'s `inherited_context` (the task ids of siblings whose results the child inherits) and
`attach_artifacts` (artifact ids or slugs) are identifiers by REQ-TOOLS-152 (`packages/agent-tools/src/tools/delegation.ts`,
`delegateSchema`), but neither key's last word says so and neither was in `WHOLE_KEYS`. A failed `delegate` call whose
id lists were long enough for the arguments to need a cut once its `task` had been cut to the marker had its ids cut as
free text, each ending with `...`: the record named sibling tasks and artifacts that do not exist.

Written 2026-10-07 by fin28 on OQ-209's ruling under the owner's delegation (R-072), which found the gap through both of its
advocates and has it repaired as a defect.

## Specs

REQ-SESSION-194's last sentence, "Counts, identifiers, paths and timestamps are never truncated", which governs the
error-path cut REQ-SESSION-136 names; `PD-SESSION-003` (d), which lists `inherited_context` and `attach_artifacts` among the
keys kept whole.

## Relevant files

- `packages/engine/src/run/cut.ts` — `WHOLE_KEYS`, `argumentKeptWhole`, `cutArguments`.
- `packages/agent-tools/src/tools/delegation.ts` — `delegateSchema`: `inherited_context` and `attach_artifacts`.
- `packages/engine/src/run/cut.test.ts` — the key classification and the cut.
