## The steady shapes case is too tight for a loaded host

`terminal-shapes.test.ts` runs the `steady` shape's command for real, so the line it prints is measured rather than
assumed: the command is `node -e "…setInterval…, 2000"`, and on Windows it is issued through `powershell.exe
-NoProfile -NonInteractive -Command`, so two ticks need two cold process starts — `powershell.exe`, then `node` —
plus `STEADY_INTERVAL_MS * 2` (4 s). The case killed the run at `STEADY_INTERVAL_MS * 2 + 1_500` (5.5 s) and
asserted both ticks had arrived.

Observed 2026-10-19: the worktree wrappers' first execution — the second `pnpm worktree:land` run of that session,
landing branch `tool-worktree` at `089afef2` (the wrappers' first-executions row) — redded under the full gate's
load on exactly this case, `expected [ 'tick-1' ] to deeply equal [ 'tick-1', 'tick-2' ]` (1 file failed, 460
passed), and stopped with nothing pushed; the same case in the same tree had passed the first landing's gate
minutes earlier. Measured quiet through the same chain, three runs: tick-1 at 2,230–2,260 ms and tick-2 at
4,221–4,259 ms — 1.3 s of the 5.5 s left for the gate's own load.

## Specs

None contradicted. The case measures the shape rather than assuming it (`REQ-TOOLS-097`, `REQ-CONFIG-116`); its
bound was a harness budget, not a product timing.

## Relevant files

- `apps/desktop/scripts/lib/terminal-shapes.test.ts` — the case's spawn and its timeout.

## Outcome

Repaired in the harness, 2026-10-19. The budget is `STEADY_INTERVAL_MS * 2 + 6_000`: a shape that stopped ticking
still fails (tick-2 never arrives), and a cold `powershell.exe`/`node` pair under the gate's load no longer does.
Green alone in the branch tree (`pnpm vitest run apps/desktop/scripts/lib/terminal-shapes.test.ts`); the landing
that carries this note re-runs the full gate on its own head and pushes only on green.
