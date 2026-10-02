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

`code-intel-proof`'s section 1 does not fail on this; it hangs, because its branch client never notices the child
exiting ([note](code-intel-proofs-branch-client-waits-forever-on-a-child-that-has-exited.md); repaired 2026-09-28, it
now fails with the child's exit).

## Repaired 2026-09-28 under R-062

**The reading.** REQ-MCP-033 fixes that the token launches the application's own executable with the token as its
first argument, and REQ-STARTUP-002 and REQ-STARTUP-015 fix what that launch is observable as (no console, no window,
nothing fetched); none of the three says whether the launch carries the parent's Chromium switches. Raised as **OQ-82**
and built under this reading: the launch carries exactly the sandbox switch the parent was started with
(`--no-sandbox`) and nothing else of its command line — the sandbox is a property of the host the parent already
measured, and a child of the same executable cannot measure it differently. **The token stays the first argument**,
as REQ-MCP-033 states; the switch stands between it and the `--` separator, and REQ-STARTUP-015's "no argument
vocabulary beyond it" holds, because the switch is Chromium's and the sentinel drops it before the runtime sees it.
*(Superseded, kept beside its replacement: the first build that day put the switch in front of the token and read
"first argument" as "the first argument that is not that switch". The verifier found that a reinterpretation of a
stated clause; the placement above keeps it.)*

**What changed.** `@rotaris/platform`'s `chromium-switches.ts` is the one definition: `inheritedChromiumSwitches(argv)`
and `withoutInheritedSwitches(afterToken)` (it replaced the first build's `afterInheritedSwitches(argv, from)`). Main
forks the run host with the switch it was started with (a utility process's argv is what it is forked with,
`main/index.ts`); the run host's `code-intelligence-launch.ts` (`codeIntelligenceLaunchFor`) puts it between the token
and `--` — packaged `[token, --no-sandbox, --]`, development `[index.js, token, --no-sandbox, --]` — never after the
`--` where the runtime would read it; the sentinel (`main/sentinel.ts`) reads the token at its fixed index and drops the
switch standing before the separator. Tests: `chromium-switches.test.ts` (4 cases) and `code-intelligence-launch.test.ts`
(4 cases: the argument builder packaged and in development, with and without the switch, the token at index 0 packaged
and 1 in development, and no other switch inherited).

**What was shown, and what was not.** `apps/desktop/resources/code-intelligence/` is absent on this tree and
`pnpm code-intel:bundle` refuses off Windows (ADR-0035), so `pnpm code-intel-proof` could not run. The built app was
driven as root under Xvfb (`pnpm app:drive`) against a scratch workspace holding one TypeScript file: the run host's
log line reads the launch `… builtin:code-intelligence --no-sandbox -- project create <root>` (the first build's line
had the switch before the token), and the project setup's `create` step now reaches the
sentinel — it exits **127** with "the bundled code-intelligence runtime is not present in this installation", the
sentinel's own refusal, where before it died with **SIGTRAP** before any JavaScript ran. The runtime itself serving
as root is not shown here; it waits for a tree with the bundle.
Measured directly as root on the built tree: `electron out/main/index.js builtin:code-intelligence --no-sandbox --
start-mcp-server` exits 127 at the sentinel, the same line without the switch dies with SIGTRAP (exit 133); with a
stand-in `bin/python3` under the git-ignored `apps/desktop/resources/` (removed after), the runtime received
`start-mcp-server --transport stdio` and no switch, and its exit status 7 came back as the child's. The new placement is
unmeasured on Windows (IC-3).
