## Memory reads answered through read_file name no tool

Observed 2026-09-20, run `2e21e324`: `tool_calls` ord 198–199 — `read_file` on `memory:punchclock/build-and-styling-gotchas` and `memory:tooling/format-and-workspace-hazards` — failed with `File not found: memory:…. Its parent directory does not exist either.` Transcript thinking row 333 shows the intent: the orchestrator had listed those names via `list_memories`, and the tester reached for them through `read_file`. The refusal names no tool; the content lives behind `read_memory`.

## Specs

No requirement contradicted — a refusal-shape gap: the `memory:` namespace is answered by the code-intelligence `read_memory` tool, but the `read_file` refusal does not say so.

## Relevant files

- `packages/agent-tools/src/tools/files.ts` — the `read_file` not-found path (`Its parent directory does not exist either.`).
- `packages/config/src/mcp/code-intelligence-manifest.generated.ts` — `read_memory`/`list_memories` as the memory tools.

Noticed 2026-09-20 by the run-autopsy of run `2e21e324`.
