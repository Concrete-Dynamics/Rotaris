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

## Outcome — repaired 2026-11-04 (R-091, hardening §3.2 row 2; OQ-462 (2))

Reproduced first on this host at `hrd1-child-process-failure` (Windows 11 ARM64, Node 26.13.0, Electron 44.3.0, CPU at 100 %
from other sessions' work): a driven launch's run host wrote its first line about 5.8 s after main claimed the instance and
main ended on `UNHANDLED rejection in main: NoReplyWithinBound: no reply to hello within 5000 ms`, with no window. The
`hello` is now awaited through `boundedReady` (`apps/desktop/src/main/child-supervision.ts`), which never rejects: a miss is
written at `error`, the run host is ended through `endBeforeMain`, every later request to it is refused at once
(`runHost.notStarted`), and the launch goes on to paint, where "The run host did not start" stands as OQ-462 (1) and (2)
rule. Measured after the change on the same loaded host: `exit-trace-proof`'s `orderly` launch missed the bound on its own
load (its window then loaded 2.4 s later, no unhandled rejection), and its `not-ready-run-host` launch, which silences the
run host through the seam `ROTARIS_CAPTURE_CHILD_FAULT=run-host:silent`, painted its window with the notice, answered a
run-host command in 0 ms with the refusal and quit 0. Pinned by `child-supervision.test.ts` and that launch. Whether 5 s is
the right bound on a loaded host — the miss is now a run host gone for the session rather than a launch gone — is
[OQ-473](../../architecture/open-questions/71-spikes-and-later-questions-38.md#oq-473).
