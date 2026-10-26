## AGENTS.md says the driver's stop asks a close guard

`AGENTS.md`'s "Driving the built app" said that `pnpm app:drive stop` is "a person's quit" and that "a close guard that
keeps the application (unsaved settings) leaves it driven so the dialog can be answered". Since OQ-298's ruling
(2026-10-14) the quit `stop` sends asks no close guard — unsaved settings stay unsaved — as `apps/desktop/scripts/drive.mjs`
states in its header and beside `case 'stop'`. An agent reading `AGENTS.md` would have waited for a dialog that never
comes. Found on 2026-10-26 while the agent configuration was consolidated into `AGENTS.md`, and repaired there: the
sentence now says no close guard is asked.

## Specs

None contradicted by the product; the text contradicted [OQ-298](../../architecture/open-questions.md#oq-298)'s ruling
as the driver implements it.

## Relevant files

- `AGENTS.md` — "Driving the built app — `pnpm app:drive`", the `stop` paragraph, repaired.
- `apps/desktop/scripts/drive.mjs` — the header and the `stop` comment, which were already right.
