## A failing edit loop on one file cost a fresh approval per retry

Observed 2026-09-21, run `1ddeb71b` (NodeGrade, `v1-7e814b4aba02273c0589405a68a5fc5c`): the `Finish-specs-index-wave-row` child spent its last stretch retrying edits to `specs/index.md` — `haet_edit` stale-hash (`changed since the hash you hold was taken`), `old_string was not found exactly`, then MCP `replace_content` `PatternError: missing ), unterminated subpattern` (the needle is a regex, so a literal parenthesis fails at parse) followed by `ValueError: No matches of search expression found` (issues ord 7–10; tool_calls ord 335–433). The timeline interleaves a user approval before nearly every retry (ord 54, 55, 57, 64, 66, 67 around failures at 53 and 65), and the loop supervisor fired once (ord 58: `Pause and reassess haet_read around specs/index.md`). The rejections themselves fired as specified; what multiplied their price is that each same-shape retry re-entered the approval wait instead of being answerable once.

## Specs

No contradiction: the hash/old_string rejections direct the caller to re-read as specified, and each call waits its own approval budget (REQ-TOOLS-052/055/178). Recorded as friction — a retry loop on a failing edit pays wall time plus a user action per attempt.

## Relevant files

- `packages/agent-tools/src/tools/files.ts` — `haetEditTool` rejection paths.
- `packages/agent-tools/src/gate.ts` — per-call approval waits; nothing batches a retry.
- `packages/config/src/mcp/code-intelligence-manifest.generated.ts` — `replace_content` is the MCP edit tool whose needle parses as regex.

Noticed 2026-09-21 by the run-autopsy of run `1ddeb71b`.

**Improved 2026-09-22, and not closed — the approval-per-retry half is the owner's.** The loop this note
records is three refusals deep, and each arrived one at a time: a stale hash, then a blind retry, then
`old_string was not found exactly`. The stale-hash refusal had the new content in its hands and said nothing
about it. It now answers the one question that decides the caller's next move:

```
specs/index.md changed since the hash you hold was taken. Read it again with haet_read before retrying.
Your old_string is NO LONGER present in the current content — the edit may already have been applied, or
the region was rewritten. Read it before deciding whether it is still wanted.
```

The other branch says the `old_string` is still there and a re-read-and-retry should work. That collapses
two round trips into one for the case this run actually hit, and each round trip was a wall-clock wait plus
a user action.

**What was deliberately NOT done: hand back the current hash.** It is right there, and it would let a caller
retry without looking — but the hash moved because the content moved, so their `old_string` was computed
against text that is gone. Naming the hash buys a round trip and sells a wrong edit. The re-read direction
REQ-TOOLS-052 states is kept for the reason it exists, and the refusal still quotes no content, which
`tools.test.ts` pins beside the new assertions.

**What remains, and why it may not be repaired here.** That each same-shape retry re-enters its own approval
wait is REQ-TOOLS-055's shared budget working as specified. Batching an answer across retries is *behaviour
the owner wants instead of a live requirement*, which `docs/product/README.md` sends to a `PD`; an
implementer may not mint one. The MCP `replace_content` regex parse error belongs to the code-intelligence
server's own tool and is not this product's to change.

Measured: `packages/agent-tools/src/tools/tools.test.ts` covers both branches and the two things the
refusal must not do; 19 passed.
