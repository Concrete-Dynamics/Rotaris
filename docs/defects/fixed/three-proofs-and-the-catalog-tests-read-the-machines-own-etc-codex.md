## Three proofs and the skill-catalog tests read the machine's own `/etc/codex` on a POSIX host

The skill search's machine-wide root, `/etc/codex/skills` (REQ-WORKSPACE-051, every platform with an `/etc`
hierarchy), is a literal in `skillRoots` with no injectable directory. So everything that runs skill discovery on
Linux or macOS reads the operator's own:

- **`skills-proof`** isolates the home-relative skill roots through `ROTARIS_CAPTURE_SKILLS_HOME`, but not this one.
  Its exact skill list would fail on a host that holds a skill there.
- **`injection-proof`** isolates every *instruction* base (the machine-wide one through
  `ROTARIS_CAPTURE_INSTRUCTIONS_MACHINE`) and, on POSIX, `HOME`. But its run host still opens `/etc/codex/skills` on
  every launch, measured with `strace` on 2026-09-27. A skill there would enter the scripted model's catalog and the
  captured model calls. No assertion there is exact over the catalog, so it would not go red.
- **The catalog cases of `apps/desktop/src/run-host/skills.test.ts`** run discovery on the host's platform. With a
  private `/etc` holding `codex/skills/zeta/SKILL.md` bind-mounted over the real one (`unshare -m`), three failed:
  "discovers on a cold cache…", "REQ-WORKSPACE-058: session creation clears the cache…" and "REQ-WORKSPACE-062: an
  unreadable body adds no block…". The instruction base's half of the same gap in those tests is repaired
  ([`fixed/the-instruction-discovery-tests-read-the-machines-own-etc-codex.md`](fixed/the-instruction-discovery-tests-read-the-machines-own-etc-codex.md)).

A fourth case is the instruction base itself: **`settings-proof`** isolates the home-relative instruction bases
through `ROTARIS_CAPTURE_INSTRUCTIONS_HOME` but not the machine-wide `/etc/codex`, so its exact Instructions inventory
would fail on a host holding `/etc/codex/AGENTS.md`. That seam now exists; the proof only has to set it.

None of these fails in this container, which has no `/etc/codex`. Noticed 2026-09-27 while building
`pnpm injection-proof`; widened the same day by the gate's verification of it, which traced the injection proof's
launches.

## Specs

None contradicted. AGENTS.md states that each proof launches the built application against a scratch profile; these
leave one root of the operator's machine inside that profile, and the unit tests leave it inside their scratch tree.

## Relevant files

- `packages/config/src/skills/roots.ts`: `skillRoots`, where `/etc/codex/skills` is a literal with no injectable
  directory. The repair is a seam there, threaded as `machineDir` already is for the instruction base.
- `apps/desktop/src/run-host/skills.ts`: `SkillHost.catalog`, which passes no such directory to `discoverSkills`.
- `apps/desktop/scripts/skills-proof.mjs`, `apps/desktop/scripts/injection-proof.mjs`: the launch environments.
- `apps/desktop/scripts/settings-proof.mjs`: needs only `ROTARIS_CAPTURE_INSTRUCTIONS_MACHINE` set.
- `apps/desktop/src/run-host/skills.test.ts`: `host()`, the catalog cases.
- `apps/desktop/src/run-host/host.ts`, `apps/desktop/src/workspace-service/index.ts`: where the instruction base's
  seam is read today.
