## A process exit after an orderly run-end left no diagnosable trace

Observed 2026-09-20, run `7bd9c19d` (punchclock_v2, launched via `pnpm --filter @rotaris/desktop dev`): the store ends orderly — `session.end`, `result`, and transcript row 912 all written 2026-09-20T23:09:05.039Z — and afterwards no `electron` process, no dev-server `node` process, no `Crashpad` or dump directory under `%APPDATA%/@rotaris/desktop`, and no main-process log for the dev run (the detached launch's stdio redirect captured nothing; `.autopsy-app.log` predates the run, `.drive/app.log` covers only the earlier scripted run). The owner-reported "crashed somehow" can neither be confirmed nor refuted from any artifact: a crash and a quiet quit look identical here.

## Specs

No requirement contradicted from this autopsy — recorded for the gap: the store's power-loss work (OQ-12) covers the session record, but nothing covers the process exit itself.

## Relevant files

- `packages/store/spike/power-loss-writer.cjs`, `packages/store/src/power-loss.spike.test.ts` — the store-level power-loss coverage that does exist.
- `apps/desktop/src` — no crash-reporter registration found there at the time of this note.

Noticed 2026-09-20 by the run-autopsy of run `7bd9c19d`.
