## The run-autopsy skill has no .claude/skills router

Four of the five portable skills under `.agents/skills/` (build-ui, debug-ui, orchestrated-build, review-ui) carry a thin
router at `.claude/skills/<name>/SKILL.md` that makes them invocable in a Claude session; `run-autopsy` has none, so it
is reached only by path (the profile's `autopsy.method`, `references/live-runs.md`). `AGENTS.md`'s "Repository UI
skills" section names the other four and never names run-autopsy, and `docs/architecture/codebase.md` still counts
"three portable skills". Nothing records leaving it without a router as a decision.

Found by the 2026-10-13 survey at `6de2a67` (item N98).

## Specs

- None; repository tooling.

## Relevant files

- `.agents/skills/run-autopsy/SKILL.md` — the canonical skill, whose frontmatter a router copies.
- `.claude/skills/` — the four routers.
- `AGENTS.md` — "Repository UI skills".
- `docs/architecture/codebase.md` — the "three portable skills" sentence.
- `.agents/skills/orchestrated-build/profiles/rotaris-crw.json` — `autopsy.method`.
