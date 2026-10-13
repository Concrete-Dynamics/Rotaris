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

## Repaired — 2026-10-13 (fin41)

The CHANGELOG is append-only, so one new entry ("the improvement steps the 2026-10-13 changes left") records `faf9525`
with its evidence checked (ENOSPC lines at 09:39–09:44 UTC on 2026-10-07 in the orchestrator's session transcript); that
fin38's reviewer applied `references/skill-review.md` to `c735074` and passed it (its transcript, run `wf_6808e87e-364`);
the skill-review of `faf9525` and `d92e595`, applied with the fixed prompt by fin41's builder, which built neither (PASS
for both); and `d92e595`'s follow-up: the duress run at `552d346` was launched detached, but by the orchestrator's own
`setsid nohup timeout 9600 …` command rather than the profile's, with no `exit=` line, and passed in 55 minutes, so the
profile's exact command has still not been sent. The self-test's header comment names each bundle's review and landing
in place of the retired "serialized merges".

Verified: `node .agents/skills/orchestrated-build/scripts/orchestration.mjs self-test` (all checks passed) and
`pnpm vitest run tools/orchestrated-build-skill.test.ts` (1 passed). No behaviour changed, so no test fails without it.
