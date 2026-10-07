## An MCP or fetch timeout files a `terminal_timeout` issue that names a terminal command

The gate's outcome-driven issues (`outcomeIssues` in `packages/agent-tools/src/gate.ts`) file `terminal_timeout` for any
call whose observation has `outcomeKind === 'timeout'` **or** `failureKind === 'timeout'`, always with the message
"A terminal command exceeded its timeout.". An MCP tool call that the server does not answer in its allowance settles with
`failureKind: 'timeout'` (`apps/desktop/src/run-host/mcp.ts`), and so does a fetch that runs out of time
(`packages/agent-tools/src/tools/fetch.ts`, `failure_kind: 'timeout'`), so each files an issue that tells the reader a
terminal command timed out when none ran. REQ-SESSION-136 fixes the issue kind for a timeout and leaves the message open;
the message is untrue for these tools.

The open note
[`summary-md-terminal-failures-and-timeouts-read-short-past-the-cap-with-no-flag.md`](summary-md-terminal-failures-and-timeouts-read-short-past-the-cap-with-no-flag.md)
also says that "a file or MCP tool's timeout files none of that kind", which the same line of `gate.ts` contradicts: an MCP
(or fetch) timeout does file `terminal_timeout`.

Noticed by both advocates of OQ-208's consortium (R-072, 2026-10-07) and recorded by fin28 while building that ruling, which
does not decide it. Recorded, not repaired.

## Specs

REQ-SESSION-136: "timeout → `terminal_timeout` (error)", each issue referencing the tool-call record; the message is not
fixed. No requirement is contradicted by the kind; the message misstates the call. The other note's sentence is a claim of
the record that the code contradicts.

## Relevant files

- `packages/agent-tools/src/gate.ts` — `outcomeIssues`, the `terminal_timeout` branch and its fixed message.
- `apps/desktop/src/run-host/mcp.ts` — an MCP call's `failureKind: 'timeout'`.
- `packages/agent-tools/src/tools/fetch.ts` — a fetch's `failure_kind: 'timeout'`.
- `docs/defects/fixed/summary-md-terminal-failures-and-timeouts-read-short-past-the-cap-with-no-flag.md` — the sentence the
  code contradicts (corrected in place by the same bundle).

## Outcome

Repaired 2026-10-07 by fin30 (finacc3 round 2, finding A2-08). `outcomeIssues` (`packages/agent-tools/src/gate.ts`) still
files `terminal_timeout` at `error` for every timeout, the kind REQ-SESSION-136 fixes; its message now follows the call. Only
the terminal's classification (REQ-TOOLS-112, `classifyOutcome`) gives an observation `outcome_kind: 'timeout'`, so that
observation keeps "A terminal command exceeded its timeout."; one that carries `failure_kind: 'timeout'` alone, an MCP call
or a fetch, reads "The '<tool>' call did not complete within its time allowance.". Pinned by "REQ-SESSION-136: a timeout
files terminal_timeout in the words of the call that ran out of time (finacc3 A2-08)" in
`packages/agent-tools/src/gate.test.ts` (red before: the fetch's issue read the terminal sentence). On the built app,
`pnpm mcp-proof`'s launch 2 (`slow` beyond `request_timeout: 2`) now asserts the issue referencing the call is
`terminal_timeout` and reads "The 'slow' call did not complete within its time allowance.", and `pnpm fetch-proof`'s launch 7
(`/slow` under `tool_call_timeout: 1`) asserts the same for "The 'fetch' call …"; both passed. The other note's sentence
is corrected in place, its old reading kept beside it.
