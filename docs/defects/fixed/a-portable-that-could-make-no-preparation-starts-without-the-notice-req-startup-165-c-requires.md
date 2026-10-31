## A portable that could make no preparation starts without the notice REQ-STARTUP-165 (c) requires

Noticed 2026-10-23 while building the portable's launcher stub (the packaging brief of that day; ADR-0054 P4). Where
the per-user data directory accepts no preparation, the stub places the payload for that run alone, starts it, and
records in the placement's marker `outcome run-scoped` and `unprepared-root <the root it could not prepare into>`
(`pnpm portable-proof` A7 measures exactly that). Nothing in the application reads that marker: no notice is raised, so
a user whose storage refuses preparations sees an artifact that is slow on every launch with nothing saying why — the
outcome ADR-0054 consequences 9 and 14 call the worse of the two failures, because it is invisible. The stub's half is
built; the application's half is not, and was out of the brief's scope ("no product logic outside packaging").

## Specs

- REQ-STARTUP-165 (c): "That outcome SHALL be reported … once per such run, after the window is painted, on the
  persistent, non-modal, non-blocking notice surface the update offer of REQ-STARTUP-116 appears on, at warning
  severity", conveying that the artifact could not prepare itself, which storage, and that every launch will cost the
  same until it accepts a preparation.
- REQ-STARTUP-150: "an artifact that could produce no preparation at all is always warned about".

## Relevant files

- `apps/desktop/launcher/src/main.rs` — `run_scoped` and `marker_text`: the marker the application would read, beside its own image.
- `apps/desktop/scripts/portable-proof.mjs` — A7, the marker's two lines measured.
- `apps/desktop/src/main/` — where the post-show notice would be raised (ADR-0054, "How the application learns of it"; its order is ADR-0055's).

## Repaired — 2026-10-31

*Falsified by the repair: "Nothing in the application reads that marker: no notice is raised" no longer holds.*

The application's half, on ADR-0054's channel and ADR-0055 phase −1's order. `apps/desktop/src/main/preparation-notice.ts`
reads `.rotaris-preparation` beside `process.execPath` — the executable the launch runs, so the tree the stub placed — and
answers a finding only for header `rotaris-preparation 1` with `outcome run-scoped`; `prepared` (the four silent outcomes),
no marker (every source-tree, installed and AppImage launch), another format and an unreadable file answer nothing. Main
reads it once after the instance claim, before the window, and holds it; the post-show activation of `main-windows.ts`
raises it beside the update check, through `notices.report` at warning severity, keyed so a second window does not raise it
again. The notice names the per-user data directory above the stub's `prepared` root, never that root or the run's
placement, and uses none of REQ-STARTUP-166's words (workspace, shared, synchronised, project).

Pinned in `preparation-notice.test.ts` (12 cases: every word, every silent case). Run end to end on Linux x86_64 without
the Rust stub: a tree placed as `portable-proof.mjs`'s `application()` places one, holding a real marker in the stub's
format, launched with `--ozone-platform=headless` — `outcome run-scoped` put the warning banner on screen by the probe
300 ms into the capture; `outcome prepared` and no marker drew nothing. `pnpm portable-proof` (the stub's own A7 plus the notice) was not run:
this host has no cargo. Never run on Windows.
