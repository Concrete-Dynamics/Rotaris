## The secret merge keys carry literal NUL bytes, so Git treats their file as binary

`mergeSecrets` in `packages/config/src/mcp/environment.ts` joins a server name and a key into one map key with a
separator written as a **literal NUL byte** inside each of its two template literals (lines 60 and 61 at `27a5127`;
`tr -cd '\000' < packages/config/src/mcp/environment.ts | wc -c` answers 2 there). Git's binary heuristic sees the NUL,
so `git diff`, `git show` and `git log -p` print `Binary files differ` for every change to the file and
`git diff --numstat` reports `-  -`: a change to how secrets are merged and resolved, including the unresolved-placeholder
lines of REQ-CONFIG-465, cannot be read in a review diff, and `grep` without `-a` reports the file as binary too. The
behaviour is not wrong at run time: the separator cannot occur in a server name or a key, which is why it was chosen.
Writing it as the escape `\u0000` keeps the same string and makes the file text again.

Noticed 2026-10-06 by the verifier of fin18 (bundle `fin18-rail-label-and-observations`), whose review of
`dd9216f`'s change to this file met the binary diff; confirmed on `27a5127`. Recorded, not repaired: the file is
outside that bundle's tasks.

## Specs

None contradicted. The defect is in the repository's reviewability, not in the product's behaviour.

## Relevant files

- `packages/config/src/mcp/environment.ts` — `mergeSecrets`, the two template literals with the NUL separator.
- `packages/config/src/mcp/mcp.test.ts` — the merge's tests, which would pin the escape's equivalence.
