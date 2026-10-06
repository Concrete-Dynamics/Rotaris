## The MCP proof's runs list the repository's own skills in their catalog

`pnpm mcp-proof` keeps its workspace at `.proof/mcp-proof/profile/workspace`, inside the repository checkout, and makes no
`.git` entry there. The project-scope skill search walks from the workspace root up to the nearest ancestor holding a `.git`
entry (REQ-WORKSPACE-051), so it ends at the checkout's root and finds the repository's own `.agents/skills/`. Every agent of
the proof's runs is then given a skill catalog listing this repository's development skills (`build-ui`, `debug-ui`,
`review-ui`), which have nothing to do with the run.

Seen 2026-10-06 by plan fin19 while extending the proof's first launch to read the system prompt the model port received
(`.proof/mcp-proof/discovery.model-requests.jsonl`): the orchestrator's prompt carried "Portable skills available in this
workspace." and a `build-ui` line after the instruction files. No assertion of the proof depends on the catalog today, so
nothing goes red. But what the proof's agents receive changes whenever a repository skill is added, renamed or
re-described. And a proof that reads the whole prompt (as launch 1 does since fin19) has to allow for content the fixture
never declared. Other proofs whose workspace lies under `.proof/` without a `.git` entry are likely to share it; only this
proof was looked at.

## Specs

None contradicted: the walk is REQ-WORKSPACE-051's and the product is right to take it. The defect is the proof's
isolation: its workspace inherits the checkout's skills (the same class as
`docs/defects/fixed/three-proofs-and-the-catalog-tests-read-the-machines-own-etc-codex.md`, where the machine's own
`/etc/codex` reached proofs).

## Relevant files

- `apps/desktop/scripts/mcp-proof.mjs` — `root` and `workspace` under `.proof/mcp-proof/profile/`, no `.git` written there.
- `packages/config/src/skills/roots.ts` — the project walk that stops at the nearest `.git` entry.
- `.agents/skills/` — the repository's own skills the catalog lists.

Noticed 2026-10-06 by plan fin19 (task 1, H4's proof). Open; not repaired here.
