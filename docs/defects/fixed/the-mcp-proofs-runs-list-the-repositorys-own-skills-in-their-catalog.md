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

## Repaired — 2026-10-06 (fin21, bundle `fin21-leftover-notes`)

`apps/desktop/scripts/mcp-proof.mjs` runs `git init -q` in its workspace when it holds no `.git` entry, as a project is a
repository and as `code-intel-proof`, `slash-proof` and others already do, so REQ-WORKSPACE-051's project walk stops at the
workspace and the catalog lists nothing of this checkout. Launch 1 now asserts the shape the live run has: no "Portable
skills available" line and no name of a directory under `.agents/skills/` in the orchestrator's prompt, and the MCP section
standing directly after the instruction files' end comment (`results.json`'s `discovery.repositorySkillsInPrompt`, empty).

Shown with the proof, as root under Xvfb, Node 24, `--skip-build` after `pnpm build`: before the `git init`, with the new
assertion, launch 1 was red with "the orchestrator's prompt carries a skill catalog the workspace never declared
(build-ui, debug-ui, orchestrated-build, review-ui, run-autopsy): the project walk left the workspace" (load 3.7); after it
the whole proof passed (exit 0, load 3.2 to 7.3). The same commit wraps launch 1's `AGENTS.md` removal in `try`/`finally`
(a verifier's finding), so a launch that throws no longer leaves the file for the launches after it.

Not changed: the other proofs whose workspace lies under `.proof/` without a `.git`. Of the proofs that read the prompt
the model port received, `injection-proof` already makes its workspace a repository, and `plan-gate-proof` and
`notice-proof` read particular parts of it and none asserts on what follows the instruction files; whether the others' runs
carry the catalog was not measured.
