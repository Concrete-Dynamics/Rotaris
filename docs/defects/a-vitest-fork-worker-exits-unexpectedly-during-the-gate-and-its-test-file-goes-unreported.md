## A Vitest fork worker exits unexpectedly during the gate, and its test file goes unreported

On 2026-10-21 `pnpm check` went red in `pnpm worktree:land`'s landing tree at `3e87742b` (Windows 11 ARM64, build 26200,
Node 24.11.0) with no failing test. Its test stage ended:

```
Error: [vitest-pool]: Worker forks emitted error.
Caused by: Error: Worker exited unexpectedly
 Test Files  468 passed | 5 skipped (473)
      Tests  6826 passed | 127 skipped (6953)
     Errors  1 error
```

The same tree has 474 test files and 6965 tests: `pnpm check` in the branch's own worktree, on the same content before
it was committed, reported 474 files and 6838 passed tests, and so did `vitest run --reporter=json` in the landing tree straight after the red, with
no failure. So one test file, with 12 passing tests, ran in a worker that died and was never reported. Vitest names no
file for a worker that exits, and 14 files carry exactly 12 passing tests, so which one it was is not known. The worker
printed nothing of its own before it went. The `AttachConsole failed` traces from node-pty's
`conpty_console_list_agent.js` that surround it are printed by green runs on this host too. No application error event
was logged in the half hour after, and the host had 2.8 GB of 16 GB free shortly after the run.

The gate is right to go red here: a file that never reported is not a pass. The defect is that a worker can die at
random under the full suite and the report cannot say which file it took. Found while landing the root `README.md`.
Not reproduced and not repaired.

## Specs

None in `docs/spec/`. This is the test runner, not product behaviour.

## Relevant files

- `vitest.config.ts` — sets no `pool`, so Vitest 4's default, `forks`, runs each file in a child process.
- The 14 candidates, each with 12 passing tests in the green JSON run: `packages/config/src/config.test.ts`,
  `packages/mcp/src/setup.test.ts`, `packages/ui/src/plan-gate.test.ts`, `packages/ui/src/reauth-prompt.test.ts`,
  `packages/ui/src/slash/prompts.test.ts`, `packages/engine/src/run/offers.test.ts`,
  `apps/desktop/src/renderer/notice-action-refusal.test.ts`, `apps/desktop/src/main/improvement-notice.test.ts`, and in
  `apps/desktop/scripts/lib/`: `driver.test.ts`, `initialization-marker.test.ts`, `line-rpc-client.test.ts`,
  `renderer-console.test.ts`, `staged-resources.test.ts` and `summary-sections.test.ts`.
