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

**Raised with the owner, 2026-09-22 — [R-047](../../product/requests.md#r-047).** Repairing this note means
changing behaviour a live requirement states exactly, which `docs/product/README.md` sends to a `PD` and
an implementer may not mint. The request is logged with the requirements a directive would have to name,
so the decision is in front of the owner rather than waiting in a defect note.

**Ruled 2026-09-23 — [`PD-TOOLS-004`](../../product/directives.md#pd-tools-004), [R-048](../../product/requests.md#r-048).** The approval-per-retry
half is decided: a session approval of a `write_file` or `haet_edit` call now covers later calls from the same
persona on the same set of paths, whatever their other arguments, so one "approve for session" covers a retry
loop like this one. The MCP edit tool (`replace_content`) is outside the directive, because its arguments
declare no path the policy can read; its regex-needle failure stays as recorded. The note stays open until
the directive is built.

## Repaired 2026-09-27 ([R-057](../../product/requests.md#r-057))

[`PD-TOOLS-004`](../../product/directives.md#pd-tools-004) is built. A grant made by "approve for session" on a call
of the public `write_file` or `haet_edit` (`haet` folded into `haet_edit`) now stores the set of paths its REQ-TOOLS-018 path
arguments resolved to — each joined to the workspace root, then through the gate's real-path resolver — when the grant
is made. A later call of the same tool from the same persona whose own set is exactly that one is allowed by the grant
(`session:allow:<n>`, source `session-rule`) without a dialog, whatever its `old_string`, `content_hash` or `write_file`
operation. A different path, persona or tool, a superset or subset of the paths, or any path that cannot be resolved
asks again; a call with no path key falls back to REQ-TOOLS-024's exact match, which every other tool keeps — an MCP
tool offered under the name `write_file` or `haet` included, told apart from the public tool by the executor that
serves it rather than by its name. The rule is `resolvedPathSet` and `approvalMatches` in
`packages/agent-tools/src/policy.ts`; `PolicyContext.grant` takes the root, the resolver and the `publicTool`
predicate, `packages/agent-tools/src/gate.ts` passes them, and `apps/desktop/src/run-host/tools.ts` supplies the
predicate.

The MCP `replace_content` half is unchanged, as ruled: its grant still needs the exact argument set, and its
regex-needle failure belongs to the code-intelligence server.

Evidence: `policy.test.ts` gains nine `PD-TOOLS-004` cases over a real temporary directory with the run host's resolver
(this note's loop, an `edit` grant covering `overwrite`/`insert`/`undo` and other spellings of the path, the negatives
above, the alias both ways, a link resolved at grant time, and an MCP edit tool, `git_commit` and `terminal` still
matched exactly — the MCP one a stand-in, since REQ-MCP-116 keeps `replace_content`'s name to its manifest). `gate.test.ts` gains one: an edit approved for the session, then two retries with another
`old_string` and hash — one through the alias `haet` — pass with no second dialog, while the same edit from another
persona and an edit of another path each ask again. With `policy.ts` restored to its previous text all ten fail. The
independent review then found a server's own `write_file` scoped by path by its name alone; three cases pin the repair
(`policy.test.ts`, `gate.test.ts`, and `apps/desktop/src/run-host/tools.test.ts` through the real port with a stand-in
MCP host) and fail with the `publicTool` check removed. Not measured: the built app was not driven and no live run
replayed run `1ddeb71b`'s loop.
