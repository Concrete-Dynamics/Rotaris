## Memory reads answered through read_file name no tool

Observed 2026-09-20, run `2e21e324`: `tool_calls` ord 198–199 — `read_file` on `memory:punchclock/build-and-styling-gotchas` and `memory:tooling/format-and-workspace-hazards` — failed with `File not found: memory:…. Its parent directory does not exist either.` Transcript thinking row 333 shows the intent: the orchestrator had listed those names via `list_memories`, and the tester reached for them through `read_file`. The refusal names no tool; the content lives behind `read_memory`.

## Specs

No requirement contradicted — a refusal-shape gap: the `memory:` namespace is answered by the code-intelligence `read_memory` tool, but the `read_file` refusal does not say so.

## Relevant files

- `packages/agent-tools/src/tools/files.ts` — the `read_file` not-found path (`Its parent directory does not exist either.`).
- `packages/config/src/mcp/code-intelligence-manifest.generated.ts` — `read_memory`/`list_memories` as the memory tools.

Noticed 2026-09-20 by the run-autopsy of run `2e21e324`.

**Repaired 2026-09-22.** `missingPathMessage` asks `namespacedElsewhere` first, and a path whose leading
segment is `memory:` is answered by the namespace rather than by the filesystem:

```
Memory not found through read_file: memory:punchclock/build-and-styling-gotchas.
'memory:' is not a path on disk — it is the code-intelligence server's own namespace. Read it with
read_memory (memory_file_name: 'punchclock/build-and-styling-gotchas'), and list what is there with
list_memories.
```

The name is carried through so the retry is a copy rather than a second guess, and `list_memories` is named
beside it because that is how the agent in run `2e21e324` got the names in the first place. REQ-TOOLS-134's
parent listing is unchanged for every path that is one — the branch returns before it. The two tool names
are repeated rather than imported from the manifest: the run host's tool layer may not depend on
`@rotaris/config`, and the comment above the helper says where the real mapping lives.

Measured: a new case in `packages/agent-tools/src/tools/tools.test.ts` asserts the refusal names both tools
and no longer says `Its parent directory does not exist either.`; the file is green (19 passed).
