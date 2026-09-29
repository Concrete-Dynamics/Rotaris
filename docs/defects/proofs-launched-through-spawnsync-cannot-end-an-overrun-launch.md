## Proofs that launch through `spawnSync` cannot end a launch that overruns its timeout

Thirty-three proof scripts under `apps/desktop/scripts/` launch Electron with `spawnSync(electron|exe, …, { timeout })`,
at thirty-four sites. `spawnSync`'s timeout does not bound the launch. At the timeout Node sends SIGTERM and closes its
own ends of the child's standard output and error, and then waits, without a bound, for the process to exit. The
application's quit path writes a line to the closed stream at once and loops on the EPIPE
(`a-quit-with-its-standard-output-closed-loops-on-its-own-epipe.md`), so the process never exits and the proof never
returns. *(2026-09-29, R-067: that loop is repaired — `fixed/a-quit-with-its-standard-output-closed-loops-on-its-own-epipe.md`
— and a launch whose pipes are closed as it is signalled now quits in about 60 ms, measured with an async launch; the
`spawnSync` sites were not re-run. The sentence above is kept as it was written.)* Nothing is reported, and the proof hangs until something outside kills it. `resilience-proof`'s override launch
was seen alive 649 s into a 180 s timeout. On 2026-09-28 a scratch `spawnSync` of scenario 4's launch with a 20 s timeout
had not returned at 70 s, when a second SIGTERM from outside ended it.

A launch overruns when the condition it waits for never comes: a seam addressed to a control the design system
replaced, a result that never arrives, a hang in the product. So this is the failure mode of every stale seam and
every product hang these proofs could meet. They turn into a stuck proof rather than a red.

## Specs

None contradicted by the product. The defect is the harness's, the proofs are evidence
(`.claude/rules/tests-and-proofs.md`), and a proof that cannot fail is not evidence. The product half is its own note.

## Relevant files

- `apps/desktop/scripts/*.mjs`: every `spawnSync(electron, …)` or `spawnSync(exe, …)` with a `timeout` (`grep -l
  "spawnSync(electron\|spawnSync(exe" apps/desktop/scripts/*.mjs`).
- `apps/desktop/scripts/lib/bounded-launch.mjs`: `spawnBounded`, `spawnSync`'s return shape from a launch that is
  ended within its bound (SIGTERM with the pipes open, a grace, SIGKILL to the group) and reported (`overrunMessage`).
  `resilience-proof` is on it since 2026-09-28, and `lib/launch-sites.test.ts` scans it for `hostSwitches` as it scans
  `spawnSync`.

Noticed 2026-09-28 while repairing `resilience-proof`'s overrun under R-062. Only that proof was moved onto
`spawnBounded`. Moving the others changes each one's `launch`, which `harness.mjs` deliberately left per script, and
turns each from synchronous to asynchronous. That was outside the item.
