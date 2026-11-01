## Outcome: repaired 2026-11-01

The sentence in `AGENTS.md`'s "Process state" now says continuous integration landed under R-079 and names
`.github/workflows/ci.yml`; the rest of the list (the release pipeline's inputs, the Linux and macOS builds, the hardware
checks) stays as the owner left it. Fixed in the docs-only branch of [R-091](../../product/requests.md#r-091).

## `AGENTS.md` still counts continuous integration as owed after R-079

`AGENTS.md`, "Process state", read: "On 2026-10-06 the owner counted the work as finished without the release pipeline and
its inputs (signing, the licence inputs, the icon), continuous integration, the Linux and macOS builds and the owner's
hardware checks (R-071): each stays owed where it is recorded, and none is an agent's to start." Continuous integration has
existed since R-079: `.github/workflows/ci.yml` runs `pnpm check` and a development package on every push and pull
request. An agent reading the rules file alone would count CI as not started and not theirs to start.

## Specs

None. A statement of the record about itself, stale since R-079 landed.

## Relevant files

- `AGENTS.md` — the "Process state" paragraph.
- `.github/workflows/ci.yml` — the workflow, its header citing R-079.
- `docs/product/requests.md` — R-071 and R-079.
