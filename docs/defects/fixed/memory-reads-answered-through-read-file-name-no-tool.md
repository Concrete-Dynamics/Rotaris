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

**Corrected the same day, by the repository's own gate.** The first version of this repair wrote the two
tool names as literals in `files.ts`, reasoning that the run host's tool layer may not depend on
`@rotaris/config`. That reasoning was wrong about the rule that matters: **REQ-MCP-116 makes the generated
manifest the only place a runtime tool name is written**, and `code-intelligence.test.ts` failed `pnpm check`
naming both offending files. The dependency direction was the real constraint, not a licence to restate.

So the names are **injected**. `readFileTool(state, fence, memoryTools?)` takes them, `run-host/tools.ts`
reads them from `CODE_INTELLIGENCE_MEMORY_GATE` — the manifest's ordered `[listing, reading]` pair — and
hands them over at the one place the tool is built. With no names given the refusal still corrects the
shape of the mistake (`'memory:' is not a path on disk`) and simply cannot name the way out, which is
better than naming a tool a build might not carry. The test uses stand-in names for the same reason a test
file may not spell the real ones, and that is also what proves they are injected rather than baked in.
