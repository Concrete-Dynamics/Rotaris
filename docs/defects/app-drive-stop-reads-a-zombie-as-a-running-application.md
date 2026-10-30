## `pnpm app:drive stop` reads a zombie as a running application

`stop` waits for the driven process to end by asking whether its pid exists. Where the process that adopts a detached launch does
not reap its children, the ended application stays a zombie (`Zs`, `[electron] <defunct>`), so `stop` reports "is still running
after 60000 ms — its shutdown has not finished" for an application that wrote `quit: exiting with status 0` about a second after
the quit. Measured 2026-10-30 on the Linux agent host, on a launch with no dictation and no capture.

The same host turns four tests of `packages/agent-tools/src/terminal/terminal.test.ts` red (`REQ-SHELL-092, REQ-TOOLS-098: the
window's kill of a soft-paused command`): `alive` asks `process.kill(pid, 0)`, which answers yes for a zombie, so a killed
grandchild reads as alive. They pass when the command runs under a process that sets `PR_SET_CHILD_SUBREAPER` and reaps. Both are
one fact about the host and neither reader tells a zombie from a running process.

## Specs

None: a verification tool's report, not the product.

## Relevant files

- `apps/desktop/scripts/drive.mjs`: the `stop` command's wait
- `apps/desktop/scripts/lib/driver.mjs`: `startApp`, the detached launch
- `packages/agent-tools/src/terminal/terminal.test.ts`: `alive`
