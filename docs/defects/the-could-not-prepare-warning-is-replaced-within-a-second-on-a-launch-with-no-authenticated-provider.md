## The could-not-prepare warning is replaced within a second on a launch with no authenticated provider

Noticed 2026-10-31 while running the portable's notice on Windows 11 (the built app, a `run-scoped` marker beside
`electron.exe`). The warning is raised from the post-show activation and is on screen at once. On a profile with no
authenticated provider, the "No model provider is authenticated yet" notice is published at the open's 800 ms slot and
replaces it under REQ-NOTIFY-024's one slot: a waited probe read the warning, and a probe at 1,400 ms read only the
provider notice. A replaced notice does not return, so the warning stays only in the diagnostics
(`diagnostics: notice #1 warning …`, "no session applies").

A portable's first launch on a profile with no provider is the likely case, and it is also where a user is told nothing
else about the slow start. REQ-NOTIFY-024 is applied as written; the two requirements only meet here. Whether the warning
should outlast that notice, and how, is not decided by this note.

## Specs

- REQ-STARTUP-165 (c): the outcome "SHALL be reported … once per such run, after the window is painted, on the persistent,
  non-modal, non-blocking notice surface". Whether under a second on that surface meets it is the open point.
- REQ-NOTIFY-024: one notice is current, the most recently published, with nothing queued or restored.

## Relevant files

- `apps/desktop/src/main/index.ts` — `postShowActivation` raises the warning; `NO_PROVIDER_HEADLINE` is the notice that replaces it.
- `apps/desktop/src/main/preparation-notice.ts` — the warning.
- `docs/architecture/adr/0054-packaging-artifacts-and-self-update/03-decision.md` — "How the application learns of it", which records the same slot's replacement by a project-setup failure.
