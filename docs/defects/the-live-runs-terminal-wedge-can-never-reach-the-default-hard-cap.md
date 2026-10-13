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
