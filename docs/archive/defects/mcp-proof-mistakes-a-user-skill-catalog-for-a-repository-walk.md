## MCP proof mistakes a user skill catalog for a repository walk

Found 2026-10-16 under R-074 on Windows ARM64. The first launch of `mcp-proof` completed, then its prompt assertion threw: `the orchestrator's prompt carries a skill catalog the workspace never declared (a catalog): the project walk left the workspace`. The captured request instead named the legitimate user-level `caveman` skill under `C:/Users/ganga/.agents/skills/`; none of this checkout's development skills appeared.

The proof correctly makes its scratch workspace a Git repository to stop project-scope skill discovery at that boundary. It then incorrectly rejects every catalog, including the independent user scope. Windows proof isolation deliberately keeps the real home because overriding it prevents Electron from painting. A real global skill therefore makes the MCP boundary proof red even when the project walk is contained.

## Specs

No product defect. REQ-WORKSPACE-051 includes user-level skill roots. This harness verifies REQ-WORKSPACE-043 and REQ-MCP-101, and guards against the previously repaired repository-skill leak.

## Relevant files

- `apps/desktop/scripts/mcp-proof.mjs` — discovery launch's prompt assertions.
- `apps/desktop/scripts/lib/harness.mjs` — Windows proof isolation preserves the real home.
- `packages/config/src/skills/roots.ts` — project and user scopes are independent.

## Outcome

Repaired 2026-10-16. The assertion still rejects repository skills; the closed instruction-file boundary is unchanged. It accepts a complete catalog block in the format the product emits before checking that the remaining text is exactly the product statement followed by the MCP section. Arbitrary text and skill bodies do not fit that catalog format. The failing capture is in `.proof/mcp-proof/discovery.model-requests.jsonl` of the child-cap worktree; it was re-executed with the real global skill present.
