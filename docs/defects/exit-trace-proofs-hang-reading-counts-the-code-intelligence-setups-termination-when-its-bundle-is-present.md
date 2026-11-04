## exit-trace-proof's hang reading counts the code-intelligence setup's termination when its bundle is present

`exit-trace-proof`'s `hang` launch (OQ-298, PD-SHELL-010) asks the application to quit while the main window's renderer is
suspended, and checks that the process exits "well under the probe's 5000 ms bound", since no close guard is asked. The
proof's workspace leaves code intelligence disabled, but initialization still runs `code-intelligence-setup` at the open
(REQ-WORKSPACE-084). When the tree has no bundled runtime (`pnpm code-intel:bundle` not run) that setup fails at once and
the quit takes about 1 to 4 s. When the bundle is present, the setup's child (`electron.exe … builtin:code-intelligence
-- project create`) is still running at the quit, and the run host's shutdown cancels it and waits for its termination
(`McpHost.endSetup`, PD-MCP-003's grace, then `taskkill /T`): on 2026-11-04 (Windows 11 ARM64, Node 26.13.0, Electron
44.3.0, CPU 85 % at the proof's start, 8 Electron processes of other trees, at `hrd1-child-process-failure`) the log reads
"mcp setup: ended by the run host's shutdown" at 09.084 and "create failed — cancelled while running; the child was
terminated" at 12.621, and the check read 7457 ms from the quit to the exit. A second run on the same branch without the
bundle read 7284 ms once and passed twice, so load adds to it as well. The guard is not what the time is spent on: no
close-guard or PD-SHELL-010 line is written.

So the reading mixes two mechanisms — the quit asking no guard, and an in-flight setup's bounded termination — and goes red
on the second whenever a setup is running. Found while running the proof for R-091 bundle B1; not caused by it, and not
repaired here.

## Specs

None contradicted by the product: PD-MCP-003 bounds a setup's termination at the shutdown, and OQ-298's quit asks no guard.
The check's bound (`RENDERER_LIVENESS_BOUND_MS`, 5 s) is the guard's, so what is open is the proof's isolation of the
mechanism it names: let the setup finish before the quit, give the workspace no setup to run, or bound the reading by the
guard's own lines rather than by the exit.

## Relevant files

- `apps/desktop/scripts/exit-trace-proof.mjs` — the `hang` launch and its "well under the probe's bound" check.
- `apps/desktop/src/run-host/mcp.ts` — `endSetup`, the setup's cancellation at the run host's shutdown.
- `packages/mcp/src/setup.ts` — `terminateSetupChild`, the grace and the tree kill.
- `apps/desktop/scripts/lib/code-intelligence-bundle.mjs` — whether the bundled runtime is present in a tree.
