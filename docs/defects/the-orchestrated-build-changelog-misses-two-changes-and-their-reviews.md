## The orchestrated-build changelog misses two changes and their reviews

The skill's own improvement steps (SKILL.md "Improving this skill", steps 2 and 4) were not finished for its 2026-10-13
changes. `faf9525` (the "Disk is the session's allowance" bullet in `references/environment.md`) has no CHANGELOG entry
and no recorded skill-review. `d92e595` (the detached duress launch) has an entry but no recorded skill-review, and its
"Not run: a duress launch in this form" was never followed up. The `c735074` entry says the skill-review was not run,
although the fin38 bundle's reviewer applied `references/skill-review.md`'s checklist to it, so the record understates
what was done. And `tools/orchestrated-build-skill.test.ts`'s header still lists "serialized merges" among the pinned
mechanisms, which the 2026-10-07 change retired for per-bundle reviewer landings.

Found by the 2026-10-13 survey at `6de2a67` (item N97).

## Specs

- None. The skill's own rule: `.agents/skills/orchestrated-build/SKILL.md`, "Improving this skill", steps 2 and 4.

## Relevant files

- `.agents/skills/orchestrated-build/CHANGELOG.md` — the 2026-10-13 entries.
- `.agents/skills/orchestrated-build/references/environment.md` — the bullet `faf9525` added (Load).
- `.agents/skills/orchestrated-build/profiles/rotaris-crw.json` — the duress command `d92e595` changed.
- `tools/orchestrated-build-skill.test.ts:3` — the header comment.
