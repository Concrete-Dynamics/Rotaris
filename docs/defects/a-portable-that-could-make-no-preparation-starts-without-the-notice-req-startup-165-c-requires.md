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
