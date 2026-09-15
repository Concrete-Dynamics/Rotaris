## Classification is decided by the code-intelligence runtime's 152-extension list, not the specified 23

The contains-code test that decides whether a workspace's symbols are indexed —
`workspaceContainsCode` in `apps/desktop/src/run-host/mcp.ts` — answers by asking
`hasIndexableExtension`, which matches against `CODE_INTELLIGENCE_MANIFEST.extensions`:
**152 suffixes generated from serena-agent 1.7.0's own language-server coverage**
(`.tf`, `.tfstate`, `.tfvars`, `.nix`, `.config`, `.sh`, `.bash`, `.ps1`, `.erb`, `.svelte`,
`.vue`, `.qml`, `.shader`, `.wgsl`, …).

`REQ-WORKSPACE-099` fixes the source-extension set at **exactly 23** entries and makes it
overridable per workspace through `project_init.source_extensions` in
`.rotaris/agents.yaml`. `REQ-CONFIG`'s `SECTION_KEYS` already admits `project_init` as a
valid section (`packages/config/src/keys.ts:27`), so a user may write that key today and
nothing will read it.

The two sets disagree on real trees in both directions, and the disagreement is not
cosmetic — it decides whether a 1800 s indexing stage runs:

- A workspace holding only `main.tf` and `deploy.sh` classifies as **code** under the
  manifest and as **non-code** under the specification.
- A workspace holding only `App.fs` classifies as code under both, but a workspace whose
  only sources are `.r` files is matched by the manifest's `.R`/`.r` pair and by the
  specification's `.r` — agreement here is coincidence, not design.

A secondary, narrower gap sits beside it. The ignore matching runs through the search
tool's reader (`parseGitignore`/`ignoredBy`, `packages/agent-tools/src/tools/search.ts`),
which the comment above it calls "a small gitignore reader". It **does** implement the two
things `REQ-WORKSPACE-100` names by name — `!` negation and `**` path patterns — and it
**does** apply last-match-wins, so the headline obligation is met. What it does not
implement is the rest of the grammar that requirement calls "full": character classes
(`[a-z]`, `[!0-9]`) are escaped and matched literally, and the escape sequences `\#`,
`\!` and a trailing `\ ` are not honoured. A workspace whose `.gitignore` excludes
`vendor/[a-z]*/` therefore has those files counted.

## Specs

- **`REQ-WORKSPACE-099`** — "The default source-extension set SHALL be exactly these 23
  entries: `.py .js .ts .jsx .tsx .rs .go .java .c .cpp .h .hpp .rb .php .swift .kt .scala
  .cs .fs .ex .exs .r .jl`, and **the same set SHALL apply everywhere classification is
  decided**. It SHALL be overridable per workspace via `project_init.source_extensions` in
  `.rotaris/agents.yaml`, with entries normalized (lower-cased, a leading dot added, blanks
  dropped)." Both halves are contradicted: a second set is in use, and the override is read
  by nothing.
- **`REQ-WORKSPACE-098`** — makes classification the verdict `code` when at least one file
  beneath the root "carries an extension from the configured source-extension set". The
  set in force is not a configured one.
- **`REQ-WORKSPACE-091`** — the indexing and memory-seeding stages are skipped "For a
  workspace classified `non-code` (`REQ-WORKSPACE-098`)", which binds `REQ-MCP-099`'s
  `needsCode` input to this domain's classification rather than to the runtime's list.
- **`REQ-WORKSPACE-100`** — "The full gitignore pattern grammar SHALL be honored, negation
  patterns (`!`) and `**` path patterns included, with the last pattern matching a path
  deciding it". Met for everything it names explicitly; character classes and escapes are
  outside what the current reader honours.

## Relevant files

- `apps/desktop/src/run-host/mcp.ts` — `workspaceContainsCode`, the walk. Correct in its
  traversal (breadth-first, VCS directories skipped, no symlink followed, root `.gitignore`
  only); wrong in the set it matches against.
- `packages/config/src/mcp/code-intelligence.ts` — `hasIndexableExtension` and
  `CODE_INTELLIGENCE_EXTENSIONS`, both reading the generated manifest.
- `packages/config/src/mcp/code-intelligence-manifest.generated.ts` — the 152 entries.
  This file is correct for what it is: the runtime's own indexing coverage, generated and
  diff-checked by `pnpm package`. It is simply not this domain's classification set.
- `packages/config/src/keys.ts:27` — `project_init` declared and unread.
- `packages/agent-tools/src/tools/search.ts` — `parseGitignore`, `ignoredBy`, `loadRules`.
