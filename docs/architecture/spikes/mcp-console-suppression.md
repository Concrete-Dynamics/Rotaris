# MCP console-suppression spike — no console window at any point, on the packaged build

- **Date:** 2026-09-05
- **Host:** Windows 11 Pro 10.0.26200, x64; Electron 44.1.1; Node 24.11.0 (the host's node.exe as the fixture's runtime)
- **Command:** `ROTARIS_PACKAGE_DIR_ONLY=1 ROTARIS_PACKAGE_SKIP_APP=1 pnpm package`, then
  `node apps/desktop/scripts/mcp-console-spike.mjs` (evidence under `.mcp-proof/console-spike/`)
- **Requirements:** REQ-MCP-113, REQ-MCP-033 (the reserved token's child)
- **Decision records:** ADR-0033 consequence 3; spike-list item 4 in `open-questions.md`

## What was asked

`REQ-MCP-113` is written to be tested negatively: the application is a graphical process owning no console; it
must create the child's three standard streams itself, never require a console, and **no console window may
appear at any point**. ADR-0033 required this "verified, not assumed" on a packaged build spawning a console
application, and the same for the reserved token's child.

## What ran

The packaged `Rotaris.exe` (`release/win-unpacked`, electron-builder's `--dir` output after the cold native
rebuild of ADR-0056 — rule 1a and rule 4 passed) ran a scripted session against a scratch profile whose
persona carried two servers:

- `console`: `C:\WINDOWS\system32\cmd.exe /c node <fixture> --pid-file …` — a console application launched
  through a console application, the worst case a user's configuration can produce (`cmd` is in
  `REQ-MCP-029`'s known-executable set and `npx.cmd`/`uvx.cmd` reach `cmd.exe` the same way after Part S's
  `.cmd` wrap).
- `token`: `builtin:code-intelligence --transport stdio` — the reserved token, expected to fail until ADR-0035
  exists.

The scripted orchestrator called `echo` on `console`. Meanwhile the spike script sampled the host with
PowerShell: every `cmd`, `node` and `conhost` process whose start time is after the launch, its
`MainWindowHandle` and `MainWindowTitle`, and `tasklist /v`'s "Window Title" column for those same pids (which
reads `N/A` for a process with no window).

## Result

**PASS.** Across three runs of the spike (the first two with a coarser verdict, corrected below), every process
started after the launch had `MainWindowHandle` 0 and a `tasklist` window title of `N/A` at every sample; the
`echo` call succeeded in the packaged application's store (`tool_calls` row `ok`, result "hello from the
scripted agent"); the fixture was launched twice (one discovery, one session connection), both invisible.

| Run | Samples | Post-launch processes seen | Window handles ≠ 0 | Titled windows | Tools arrived |
|---|---:|---|---:|---:|---|
| final | 3 | `cmd#46872`, `node#12932`, four `conhost` | 0 | 0 | yes |
| earlier | 14–15 | the same shape, per sample | 0 | 0 (see below) | yes |

**The reserved token's child fails at spawn, not with a window:** `discovery of 'token' failed (spawn
builtin:code-intelligence ENOENT) in 108 ms` — the OS reports the missing executable (`REQ-MCP-107` case 1),
discovery degrades to the empty list, the run proceeds. Until ADR-0035 gives the token a launch, that is the
recorded behaviour.

## Two things the measurement itself taught

1. **Every `CREATE_NO_WINDOW` child gets a headless `conhost.exe`.** Node's `windowsHide` is
   `CREATE_NO_WINDOW`, which allocates a new, hidden console — a `conhost.exe` per child, handle 0, no title.
   The first verdict counted any `conhost` sighting as a failure and so failed on the spike script's *own*
   PowerShell and `tasklist` children. A headless conhost is not a window; the corrected verdict counts it like
   any other process (handle 0, title `N/A`).
2. **`tasklist /v` prints the console title of a visible console** — the host runs unrelated `cmd.exe` shells
   (the agent harness's) whose title is `C:\WINDOWS\system32\cmd.exe`. The first verdict read every `cmd.exe`
   title on the machine; the corrected one reads only the pids started after the launch, and for those it is
   `N/A` throughout.

## Toolchain finding beside the spike (the manager's to place — the map's pitfalls)

`pnpm package` was **refused twice** on this machine before the packaged build existed: electron-builder's
node-module collector runs `pnpm ls --json --long --depth=Infinity --prod` in `apps/desktop`, and that command
fails with `EMFILE: too many open files` — reproducibly, alone on an idle host, and **in the main checkout
`D:\Development\Apps\Rotaris-crw` as well**, so it is not this branch's dependency (the tree has grown past the
number of `package.json` files pnpm 11.9.0 opens concurrently on Windows). The build that passed ran with
`NODE_OPTIONS=--require <shim>` where the shim gates `fs/promises` opens to 200 in flight (kept beside this
record in the session's scratch, not in the repository). IC-6's `pnpm package` would refuse today for the same
reason; a durable remedy (a gate in `scripts/package.mjs`, or a pnpm setting) is owed and is not this part's.

## Not measured

A `.cmd` runner *through the packaged build* (the dev build's unit test covers the `.cmd` wrap; the packaged
spike used `cmd.exe /c` directly, which exercises the same console-allocation path); the two remote transports
(no process to observe); a launch from an interpreted (non-frozen) installation (`REQ-MCP-033`'s first branch).
