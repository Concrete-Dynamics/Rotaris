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

## Repaired 2026-09-28 under R-062

**The reading.** REQ-MCP-033 fixes that the token launches the application's own executable with the token as its
first argument, and REQ-STARTUP-002 and REQ-STARTUP-015 fix what that launch is observable as (no console, no window,
nothing fetched); none of the three says whether the launch carries the parent's Chromium switches. Raised as **OQ-76**
and built under this reading: the launch carries exactly the sandbox switch the parent was started with
(`--no-sandbox`) and nothing else of its command line — the sandbox is a property of the host the parent already
measured, and a child of the same executable cannot measure it differently. The token is still the first argument
that is not that switch, so a hand-written entry is unchanged.

**What changed.** `@rotaris/platform`'s `chromium-switches.ts` is the one definition: `inheritedChromiumSwitches(argv)`
and `afterInheritedSwitches(argv, from)`. Main forks the run host with the switch it was started with (a utility
process's argv is what it is forked with, `main/index.ts`); the run host's `code-intelligence-launch.ts`
(`codeIntelligenceLaunchFor`) puts it immediately before the token, never after the `--` where the runtime would
read it; the sentinel (`main/sentinel.ts`) finds the token past it. Tests: `chromium-switches.test.ts` (3 cases) and
`code-intelligence-launch.test.ts` (4 cases, the argument builder packaged and in development, with and without the
switch, and no other switch inherited).

**What was shown, and what was not.** `apps/desktop/resources/code-intelligence/` is absent on this tree and
`pnpm code-intel:bundle` refuses off Windows (ADR-0035), so `pnpm code-intel-proof` could not run. The built app was
driven as root under Xvfb (`pnpm app:drive`) against a scratch workspace holding one TypeScript file: the run host's
log line reads the launch with `--no-sandbox` before the token, and the project setup's `create` step now reaches the
sentinel — it exits **127** with "the bundled code-intelligence runtime is not present in this installation", the
sentinel's own refusal, where before it died with **SIGTRAP** before any JavaScript ran. The runtime itself serving
as root is not shown here; it waits for a tree with the bundle.
