## The code-intelligence server dies when the app runs as root

Started as root on Linux with `--no-sandbox`, the application paints and runs, but the project setup fails with
"Project setup did not finish": `code-intelligence-setup → failure — … exited with signal SIGTRAP; its last output:
… Running as root without --no-sandbox is not supported`. The reserved token launches the application's own
executable (`process.execPath`, plus the main bundle in development) with only the token and `--`. The child is a
fresh Chromium, so it does not inherit the parent's `--no-sandbox` and aborts before serving. The `index` and
`memory` steps are then not attempted, and the workspace is only partly set up.

Found 2026-09-27 driving the development build as root in a cloud container. Linux release artifacts are withheld
under IC-3, and running as root is not a supported configuration anyone has ruled on. So this is recorded, not
repaired.

**Added 2026-09-28 (R-062, the proof sweep).** The repair has a second half the first paragraph does not name. The
sentinel (`apps/desktop/src/main/sentinel.ts`) reads the token at a **fixed index** — `process.argv[2]` for the
development entry, `[1]` packaged — and Electron keeps a Chromium switch in `process.argv` (measured: `electron
main.js --no-sandbox builtin:code-intelligence -- x` gives `argv[2] === '--no-sandbox'`). Chromium honours a switch
only ahead of a bare `--`. So a child launched as `<exe> [main] --no-sandbox builtin:code-intelligence -- …` survives
as root but is not recognised as the server, and `<exe> [main] builtin:code-intelligence --no-sandbox -- …` is
recognised but hands `--no-sandbox` to the runtime. Inheriting the parent's switch therefore also means the sentinel
finding the token past one. `pnpm code-intel-proof`'s branch launch passes `hostSwitches` before the token, the only
place Chromium reads it, and fails as root on this tree for exactly this reason (its section 1) until the sentinel is
repaired; the proof is not changed to work around it.

## Specs

- `REQ-MCP-033` / `REQ-STARTUP-002`: the application launches its own executable to host the bundled
  code-intelligence server. Whether that launch must carry the parent's Chromium switches is not stated.

## Relevant files

- `apps/desktop/src/run-host/host.ts`: `codeIntelligenceLaunch`, the command and arguments the reserved token runs.
- `packages/mcp/src/setup.ts`: the setup steps that report the failure and skip `index` and `memory`.

**Two more proofs stop on it (2026-09-28, R-062).** With every proof now launching as root, `pnpm notice-proof` fails
its first check — the notice on screen is "Project setup did not finish", REQ-NOTIFY-024's one slot holding the setup
failure where REQ-NOTIFY-224's "Workspace hooks need review" was expected — and `pnpm init-proof` fails its first —
the background task recorded nothing, because `code-intelligence-setup` failed at `create` with SIGTRAP and the marker
records only a completed task. Both logs carry `mcp setup: create failed — exited with signal SIGTRAP … Running as
root without --no-sandbox is not supported`. Neither proof is at fault, and neither is changed; both measure again once
this note's repair lands.
