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
- `.gitattributes` — its comment over the file's own `text eol=lf` line gave the NUL byte as the reason for that line.

## Repaired — 2026-10-06 (fin21, bundle `fin21-leftover-notes`)

`mergeSecrets` writes its separator as the escape `\u0000` in both template literals; the string at run time is the same
NUL, and `tr -cd '\000' < packages/config/src/mcp/environment.ts | wc -c` now answers 0. A scan of every tracked `.ts`,
`.tsx`, `.mjs`, `.js`, `.cjs`, `.md`, `.json`, `.yaml`, `.yml` and `.css` file found no other NUL byte. The commit that
makes the change is itself still shown as `Binary files differ` (its old side holds the bytes); every later change to
the file diffs as text.

Pinned by `packages/config/src/mcp/mcp.test.ts`, "the merge keys a server and a key apart, and its source carries no NUL
byte Git would read as binary": `a b`/`c` and `a`/`b c` stay two entries (they would collide under a printable
separator such as a space), and the module's source bytes hold no NUL (red before the repair: "expected true to be
false").

`.gitattributes` carried the old reason: a comment saying the file "holds a literal NUL byte as a map-key separator, so
git's binary heuristic reads it as binary", over a line `packages/config/src/mcp/environment.ts text eol=lf` declared for
that reason. The repair's first commit (`3f5531e`) left that comment standing after it stopped being true; the
verifier of fin21 found it. The comment now keeps the old reason quoted and marked "No longer true (2026-10-06)" beside
the replacement (the separator is written as the escape, the file holds no NUL, git reads it as text), and points at
this note. The file's own line is **dropped**: `*.ts text eol=lf` already gives the file the same attributes
(`git check-attr -a packages/config/src/mcp/environment.ts` answers `text: set`, `eol: lf` before and after), so it was
redundant even when the NUL was there. `git ls-files --eol` reads the index copy as `i/lf` (text), and
`git grep -I mergeSecrets` finds the file on the branch and skips it as binary at `origin/main`.
