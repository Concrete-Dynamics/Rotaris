## fetch-proof's cancelled launch reads Windows' SIGTERM as a failed quit

Windows-only; for the Windows session; seen on Windows 11 ARM64 (build 26200), Node 24.18.0 arm64,
`C:/dev/Rotaris-crw-wt-loc1-confinementr` at `143b2010` and `C:/dev/Rotaris-crw-wt-loc1-confinementr-base` at `0d89e971`
(2026-10-20/21, plan loc1, bundle `loc1-confinement-retro`). Recorded, not repaired: this plan repairs no Windows-only red.

`pnpm fetch-proof` scenario 9 (`cancelled`, PD-TOOLS-013 revision 2, OQ-238) quits the application while the server holds a
fetch by `process.kill(app.pid, 'SIGTERM')`, then requires the process to exit 0 ("cancelled: the quit by SIGTERM exited 1"). On
Windows Node has no SIGTERM to deliver: `process.kill` with `SIGTERM` terminates the process outright, so no orderly quit runs and
the exit status is 1 whatever the product does. The proof threw at that line on both trees, three times (once in a loaded sweep,
then alone on each tree at a CPU load of 73 to 74 % with 15 to 20 of another tree's Electron processes), so scenario 9's
readings (`interrupted`, `InterruptedError`, no issue filed) were never taken. `exit-trace-proof` met the same platform fact and
was repaired on `main` by sending what Windows can send (`51d85dd7`); `fetch-proof` was not.

## Specs

None contradicted by the product. The proof's quit instrument assumes a POSIX signal; PD-TOOLS-013 revision 2's reading is not
reached on win32.

## Relevant files

- `apps/desktop/scripts/fetch-proof.mjs` — scenario 9 (`cancelled`): `process.kill(app.pid, 'SIGTERM')` and the exit-0 check.
- `apps/desktop/scripts/exit-trace-proof.mjs` — the form `51d85dd7` gave a quit on Windows.
