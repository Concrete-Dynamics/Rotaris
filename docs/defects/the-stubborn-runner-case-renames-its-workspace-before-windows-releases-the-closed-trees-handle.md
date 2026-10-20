## The stubborn-runner case renames its workspace before Windows releases the closed tree's handle

Windows-only; for the Windows session; seen on Windows 11 ARM64 (build 26200), Node 24.18.0 arm64,
`C:/dev/Rotaris-crw-wt-integ-loc1-loc1-rename` at `2857c532` (loc1's `rename` bundle, `loc1-rename`, rebased onto `origin/main`
for its landing gate). Recorded by that bundle's review, which touched nothing under `packages/mcp/`; not repaired here.

`pnpm check` on that head failed one case of `packages/mcp/src/mcp.test.ts`, "REQ-MCP-066/067: a runner whose server ignores EOF is
closed as a tree at the grace bound", with `EBUSY: resource busy or locked, rename '…\rotaris-mcp-<id>\stubborn-workspace' ->
'…\stubborn-workspace-closed'` at its first `renameSync`. The run started at a CPU load of 11 % and ended at 54 %, with seven other
trees' Electron processes alive on the shared desktop. The file alone passed straight after (22 of 22). The case's
`OwnedStdioTransport.close()` ends the `.cmd` runner and its `node` child as a tree, and the case then renames the child's working
directory at once to show that nothing holds it. On Windows the handle a terminated process held on its working directory is not
always released by the time `close()` resolves, so a loaded host can make the rename meet a handle that is about to go. The four
earlier full gates of the same day on that bundle (one green, three red on other timing cases) passed this case, so whether
`close()` ever resolves before the tree has really gone, rather than only before Windows has released its handles, is not decided
by this reading.


*Seen again 2026-10-21* (the Windows ARM64 session, the full gate on `af692eea`, a documentation-only head, with another
worktree's tests running beside it): the same case was the gate's one red of 6,934. Alone on a quiet host straight after it
passed three times of three. The gate's red was pushed by the session's own landing script, which did not then check the
gate's result (it does now).

## Specs

None contradicted on the evidence: REQ-MCP-066 and REQ-MCP-067 ask that a close end the server's process tree, which the passing
runs show. If `close()` does resolve while a member of the tree still runs, that would contradict REQ-MCP-067's tree close; the
failing run did not record whether the `node` child was still alive at the rename.

## Relevant files

- `packages/mcp/src/mcp.test.ts` — the case, `renameSync(workspace, moved)` straight after `t.close()`.
- `packages/mcp/src/` — `OwnedStdioTransport`'s close and its Windows tree termination (ADR-0033, ADR-0007).
