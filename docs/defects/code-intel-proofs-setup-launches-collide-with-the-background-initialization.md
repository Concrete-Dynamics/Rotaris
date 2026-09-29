## `code-intel-proof`'s setup launches collide with the background initialization the product now starts at open

Section 5 of `apps/desktop/scripts/code-intel-proof.mjs` measures the MCP category's project setup action (REQ-MCP-099).
It opens Settings › MCP Servers, clicks `button[data-action="setup-start"]` 2,500 ms after load, and reads the three
steps. The proof was written in Part T (2026-09-06). ADR-0064's project initialization (Part AS, 2026-09-15) came
later, and it registers `code-intelligence-setup` as a **background** task that starts by itself whenever a
never-initialized workspace opens (REQ-WORKSPACE-083, REQ-WORKSPACE-088). The proof's `launch()` rewrites the workspace
`agents.yaml` before every launch, and the file it writes has no `initialization:` section. So every launch opens a
never-initialized workspace, and the same setup is already running when the proof clicks.

Measured 2026-09-28 as root under Xvfb on Linux, Node 24, in this worktree's first full run after section 1's repair
(sections 1–4 passed). The `setup` launch logged `initialization: running code-intelligence-setup … (background)` at
+3 ms of the resolution and `mcp setup: create running`. The proof's click landed 1.7 s later. The run host refused it
with "A code-intelligence setup is already running for this workspace; wait for it to finish or cancel it first."
(`run-host/mcp.ts`, the product's correct answer). The card kept its three steps at "Not started", and section 5 failed
with `setup: [pending, pending, pending]`. The background run itself succeeded (create 2,018 ms, index 3,047 ms,
memory 1,514 ms), so the product did the work and the proof did not measure the action it names. The setup launches
also race the background run for the `.serena` marker that `setup-again` and `setup-nocode` assert on.

## Specs

None contradicted by the product. The refusal is right, and REQ-WORKSPACE-103 says a background task renders no
progress live, so the MCP card's untouched steps are right too. The proof's fixture is stale: it predates the
background task and does not account for it, so section 5 measures a collision instead of REQ-MCP-099's action.

## Relevant files

- `apps/desktop/scripts/code-intel-proof.mjs`: `WORKSPACE`, the workspace file `launch()` writes before every launch,
  and section 5's five setup launches.
- `apps/desktop/src/main/initialization.ts`: the default background task and its start at resolution.
- `apps/desktop/src/run-host/mcp.ts`: the "already running" refusal.
