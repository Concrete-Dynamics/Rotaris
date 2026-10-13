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

## Repaired — 2026-10-13 (fin41)

- `.claude/skills/run-autopsy/SKILL.md` — the router, in the shape of the other four: the skill's name, description and
  argument hint copied from `.agents/skills/run-autopsy/SKILL.md`, and a body that sends the reader there.
- `tools/skill-routers.test.ts` — for every directory under `.agents/skills/` holding a `SKILL.md`, a router exists at
  `.claude/skills/<name>/SKILL.md`, names the skill, describes it, carries its argument hint and points at the canonical
  file. Without the router the run-autopsy case fails ("`.claude/skills/run-autopsy/SKILL.md` is missing"; 1 failed, 5
  passed); with it, 6 passed.
- `AGENTS.md` — "Repository UI skills" names run-autopsy as the post-run forensic skill with its router.
- `docs/architecture/codebase.md` — the "three portable skills" sentence keeps its count as of 2026-09-12 and gains a
  dated note: five since.
