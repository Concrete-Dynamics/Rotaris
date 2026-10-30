# `live-run` — Running it

Part 3 of 12 of [the live-run record](../live-run.md), which indexes every part.

## Running it

```
pnpm live-run                        # the plan, the endpoint, the ceiling, the key's source — it does not spend
pnpm live-run --confirm              # the run, against the default endpoint
pnpm live-run --confirm --endpoint=openrouter
pnpm live-run --confirm --gui        # the same run, with the window on screen to watch
```

`--confirm` is required. The full flag list (`--endpoint`, `--model`, `--base-url`, `--budget`,
`--max-tokens`, `--only`, `--max-iterations`, `--gui`, `--keep`, `--skip-build`, `--keep-runs`,
`--session-log-level`, `--app-log-level`, `--no-record-traffic`, `--duress-fixture`) is in the script's own header —
`pnpm live-run --help` prints it.

**The bundled code-intelligence runtime is a precondition.** With `--skip-build` a tree without it refuses at once, naming
`pnpm code-intel:bundle`; without `--skip-build` the run builds it before the first launch. Every launch then states
whether its code-intelligence discovery succeeded (a failure, or a listing of no tool, is a FAIL; a launch that starts no run is a NOTE). Until
2026-10-03 a `--skip-build` run on a tree without the bundle passed while code intelligence never ran
(`docs/defects/fixed/the-live-run-runs-without-the-code-intelligence-bundle-and-passes-without-saying-so.md`).

**The default scenarios measure several mechanisms at once, so a feature is proved working beside the others and
costs no scenario of its own.** `edit` splits REQ-103 between two children writing in parallel under declared write
scopes (PD-TOOLS-006), and every scenario that reads a session asserts its price exactly (PD-MONITOR-001 revision 2).
A new mechanism joins an existing scenario where one exercises it; a scenario of its own is the exception.

**One scenario is not in the default set and only runs when named**: `duress`, the long run. The ordinary live
run is a smoke test and stays one; a scenario that trebles its wall clock belongs behind `--only=duress`, and a
scenario nobody can leave out is a scenario people stop running.

The `requirements` scenario waits for the board rather than for a clock: every press after the release
names the state it needs, `LIVE_RUN_BOARD_MS` (900 s) is the deadline for all of them, and the capture
ends when the accept lands. A quick model does not pay the deadline; a slow one fails **once**, saying the
window expired, and the presses it never made are noted rather than reported as faults of the board.

The run is **unattended and the window is hidden** unless `--gui` says otherwise. `--gui` changes one
thing, `windowsHide` on the spawn: the scenarios are driven from inside the main process with
`sendInputEvent`/`executeJavaScript`, which need no focus, so watching cannot disturb the run and the
evidence is byte-identical either way. Typing into a shown window does reach the product, so watch it
rather than use it.
