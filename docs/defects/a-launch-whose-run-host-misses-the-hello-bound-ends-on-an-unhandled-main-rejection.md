## A launch whose run host misses the hello bound ends on an unhandled main rejection

Seen 2026-10-21 by the reviewer of plan loc1's bundle `loc1-terminal-kill`. It ran `code-intel-proof` alone in its landing tree
`C:/dev/Rotaris-crw-wt-integ-loc1-loc1-terminalkill` at `edd65901`: Windows 11 ARM64, build 26200, Node 24.18.0 arm64,
Electron 44.1.1 arm64, CPU load 22 % at the proof's start and up to 100 % during it, 4 to 25 Electron processes of other
trees. The proof's `child-edit` launch refused with "child-edit overran its 240000 ms bound: SIGTERM ended it after 1901 ms".
The launch's log shows the instance claimed at 18:03:26.374Z, and five seconds later this:
`error UNHANDLED rejection in main: Error: no reply to hello within 5000 ms`. The builder of the same bundle saw "no reply to
hello" on `child-edit` at the bundle's fork point `0d89e971` too (its report). So the bundle did not cause it, and the proof
does not touch the bundle's code.

In `apps/desktop/src/main/index.ts` main awaits `runHost.request({ kind: 'hello', … }, millis(5_000))` at launch. When a loaded
host gives the run host no answer in 5 s, the rejection is not handled: the application neither reports a launch failure
nor retries, and the proof reads the result as an overrun. Not shown here: whether the run host was slow to start or never
answered, and whether the same happens off Windows. The cause is not identified.

Not repaired (record-only).

## Specs

None identified with certainty. A launch failure that surfaces only as an unhandled rejection in main's log, and not as an
error the user sees, sits beside the startup requirements (REQ-STARTUP-*) on reporting a failed start; which one governs is
left to whoever repairs this.

## Relevant files

- `apps/desktop/src/main/index.ts` — the `hello` request to the run host, bounded at 5,000 ms.
- `apps/desktop/src/run-host/dispatch.ts` — the run host's `hello` answer.
- `apps/desktop/scripts/code-intel-proof.mjs` — the `child-edit` launch that met it.
