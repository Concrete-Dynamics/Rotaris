## The live run's terminal wedge can never reach the default hard cap

The `terminal` scenario of `pnpm live-run` asks REQ-TOOLS-097's default-path hard cap (`hardMs`, the
`runtime.shell_command_timeout` of REQ-CONFIG-116, 100 s by default) with one shape, `wedge`:
`node -e "setTimeout(() => {}, 45000)"`, issued with no `timeout`. That command prints nothing, and a call that supplies no
`timeout` arms REQ-TOOLS-098's 30 s no-output soft pause together with the hard cap
(`packages/agent-tools/src/terminal/index.ts`, `foreground.ts`: "the two bounds are armed TOGETHER and whichever is reached
first governs"). A silent command soft-pauses at 30 s, 70 s before the cap, every time. So the scenario's branch that reads
the hard cap (`d?.timeout === true`) can never be taken, and its NOTE "the wedge did not reach the hard cap — it
soft-paused first; the hard bound is unmeasured this run" is built into the shape, not the model's choice. The 2026-10-13
survey found that NOTE in the default runs at `552d346` and `0bc3eee`, and `first-executions.md`'s 2026-09-22 row and
`codebase.md` still read "`hardMs`'s own question is still unmeasured live".

The other suggested repair, a supplied `timeout` above the soft-pause threshold, would not ask it either: a supplied
`timeout` turns the soft pause off and is itself the hard bound (REQ-TOOLS-097), so `hardMs` is never read.

The product is not at fault: a real-PTY unit test covers the default-path cap
(`terminal.test.ts`, "a call that supplies NO timeout is still bounded by runtime.shell_command_timeout",
`commandTimeoutS: 1`: exit 124, `timeout: true`, `kill_status: session_reset`). What is missing is the built-app and live
measurement the scenario claims to take.

## Specs

- None in the product. The harness's own claim is contradicted: the scenario's shape table says `wedge` replays "`hardMs`
  passed and read nowhere: a call supplying no `timeout` had the soft pause and no hard cap (REQ-TOOLS-097)", and the shape
  as written cannot reach that cap.

## Relevant files

- `apps/desktop/scripts/lib/terminal-shapes.mjs` — the `wedge` shape (a silent 45 s command).
- `apps/desktop/scripts/live-run.mjs` — the terminal scenario's wedge reading and its NOTE.
- `packages/agent-tools/src/terminal/index.ts`, `packages/agent-tools/src/terminal/foreground.ts` — the two bounds armed
  together.
- `packages/agent-tools/src/terminal/terminal.test.ts` — the unit test that does reach the cap.

Noticed 2026-10-13 by the survey of what is left (item N60 (a)); recorded by fin42 before its repair.

## Repaired — 2026-10-13

Repaired by fin42 (`fin42-live-gaps`), in the harness alone; the product's cap was never at fault. The suggested other repair,
`runtime.shell_command_timeout` below 30 s for the whole `terminal` launch, was not taken: it would cap `wedge-again` (45 s)
before its soft pause, and OQ-164's command-behind-a-pause question with it.

- `apps/desktop/scripts/lib/terminal-shapes.mjs` gains a shape, `steady`, last on both platforms: a `node -e` command printing
  `tick-<n>` every 2 s for 65 lines (130 s), issued with no `timeout`. It never goes quiet for the 30 s no-output window and
  runs 30 s past the 100 s default cap, so the cap is the bound that ends it. And `hardCapReading`, which reads such a call:
  `capped` (a hard timeout naming the configured cap), `supplied` (a caller's own `timeout`, so `hardMs` unasked: a NOTE),
  `paused`, `other-cap` and `uncapped` (each a FAIL), `other` (a NOTE).
- `apps/desktop/scripts/live-run.mjs`'s `terminal` scenario reads `steady` with it against `DEFAULT_SHELL_COMMAND_TIMEOUT_S`
  and checks the call ended at the cap, the session reset, the printed lines kept and the reset's report; the wedge's old NOTE
  now says the wedge soft-paused as a silent command must. The run's wait carries the shape's 130 s.
- `apps/desktop/scripts/tool-shapes-proof.mjs` (`pnpm tool-shapes-proof`, new) takes the same shape through the built
  application with the scripted client: `runtime.shell_command_timeout: 4` saved, a call with no `timeout` printing every
  0.5 s. Run 2026-10-13 under `xvfb-run` at load 5.2 (a sibling plan's agents on the host): hard timeout at 4 s, exit 124,
  `session_reset`, 7 tick lines kept, 4,232 ms, a `terminal_timeout` issue referencing the call.

Pinned by "prints more often than the no-output window and for longer than the default hard cap" (both platforms), "prints one
tick line per interval, run for real", and the two `hardCapReading` cases in `apps/desktop/scripts/lib/terminal-shapes.test.ts`,
all seven red on the module before (`steady` absent, `hardCapReading is not a function`). The live measurement is the next
default live run's: its `terminal` scenario should PASS "a call supplying no timeout that kept printing was ended by the 100 s
default hard cap" at about 100 s with `kill_status session_reset`.
