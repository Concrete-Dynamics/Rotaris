## A failing edit loop on one file cost a fresh approval per retry

Observed 2026-09-21, run `1ddeb71b` (NodeGrade, `v1-7e814b4aba02273c0589405a68a5fc5c`): the `Finish-specs-index-wave-row` child spent its last stretch retrying edits to `specs/index.md` — `haet_edit` stale-hash (`changed since the hash you hold was taken`), `old_string was not found exactly`, then MCP `replace_content` `PatternError: missing ), unterminated subpattern` (the needle is a regex, so a literal parenthesis fails at parse) followed by `ValueError: No matches of search expression found` (issues ord 7–10; tool_calls ord 335–433). The timeline interleaves a user approval before nearly every retry (ord 54, 55, 57, 64, 66, 67 around failures at 53 and 65), and the loop supervisor fired once (ord 58: `Pause and reassess haet_read around specs/index.md`). The rejections themselves fired as specified; what multiplied their price is that each same-shape retry re-entered the approval wait instead of being answerable once.

## Specs

No contradiction: the hash/old_string rejections direct the caller to re-read as specified, and each call waits its own approval budget (REQ-TOOLS-052/055/178). Recorded as friction — a retry loop on a failing edit pays wall time plus a user action per attempt.

## Relevant files

- `packages/agent-tools/src/tools/files.ts` — `haetEditTool` rejection paths.
- `packages/agent-tools/src/gate.ts` — per-call approval waits; nothing batches a retry.
- `packages/config/src/mcp/code-intelligence-manifest.generated.ts` — `replace_content` is the MCP edit tool whose needle parses as regex.

Noticed 2026-09-21 by the run-autopsy of run `1ddeb71b`.
