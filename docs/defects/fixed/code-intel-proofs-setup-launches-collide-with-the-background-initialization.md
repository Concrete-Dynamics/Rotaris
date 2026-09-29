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

## Repaired 2026-09-28 under R-062

**What changed** (the harness only; no product file). The workspace file `code-intel-proof`'s `launch()` writes before
every launch now carries an `initialization:` section that resolves `code-intelligence-setup` as skipped, with a
`last_run` stamp (REQ-WORKSPACE-078, REQ-WORKSPACE-111). No launch starts the background task, so section 5's click is
the only setup running and the `.serena` marker is the one that setup writes. A user who skipped the prompt and later
presses the MCP card's action is in the same position. `launch()` also fails a launch whose log shows
`initialization: running code-intelligence-setup`, naming the launch, so a later change that brings the background
task back fails with its cause and not as `[pending, pending, pending]`.

**What pins it.** The proof itself: it is harness code with no unit beside it. The guard in `launch()` is what catches
a regression. It was exercised red once on 2026-09-29, from a temporary copy of the proof with the marker lines
removed, run as `--steps=5` and deleted afterwards. The first setup launch logged `running code-intelligence-setup …
(background)`, and the proof failed after 91 s with `setup: the workspace's initialization started
code-intelligence-setup in the background beside this launch's own; see setup.log`. The failure names the launch and
its cause, not `[pending, pending, pending]`.

**Measured** as root under Xvfb on Linux, Node 24, `--skip-build`, three consecutive runs of the whole proof in
`/home/user/Rotaris-crw-wt-prfb5`, all passed (521 s, 522 s and 521 s; see ADR-0035, "The proof on Linux as root").
Section 5 read `succeeded succeeded succeeded` (create 1.5–1.8 s, index 2.8–3.3 s, memory 1.5–1.8 s), creation
skipped on the marker, `succeeded skipped-no-code skipped-no-code`, the launch-less entry refused, and a cancel
mid-step reading `failed not-attempted not-attempted`.
