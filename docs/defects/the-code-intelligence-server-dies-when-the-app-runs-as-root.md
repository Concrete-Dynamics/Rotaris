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

## Specs

- `REQ-MCP-033` / `REQ-STARTUP-002`: the application launches its own executable to host the bundled
  code-intelligence server. Whether that launch must carry the parent's Chromium switches is not stated.

## Relevant files

- `apps/desktop/src/run-host/host.ts`: `codeIntelligenceLaunch`, the command and arguments the reserved token runs.
- `packages/mcp/src/setup.ts`: the setup steps that report the failure and skip `index` and `memory`.
