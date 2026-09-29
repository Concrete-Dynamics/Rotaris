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
  ([`fixed/the-instruction-discovery-tests-read-the-machines-own-etc-codex.md`](the-instruction-discovery-tests-read-the-machines-own-etc-codex.md)).

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

## Repaired — 2026-09-28 (R-062)

**The seam.** `SkillRootsEnv` gains `machineDir` (`packages/config/src/skills/roots.ts`): the fourth user-scope root is
`join(machineCodexDir(env.machineDir), 'skills')`, where `machineCodexDir` is `/etc/codex` for an absent or blank value
and the resolved directory otherwise. It moves the directory and nothing else — the root keeps its scope, its rank and
its platform rule, so Windows still searches no machine-wide root wherever it points. The instruction base reads the
same `MACHINE_CODEX_DIR` through the same function, so the two literals that used to sit in two files are one, on the
terms `hasEtcHierarchy` already set. `SkillHost.catalog` passes its existing `deps.machineDir` into `discoverSkills`, so
the one value the host already held for the instruction base now moves both discoveries; in the built app it is
`ROTARIS_CAPTURE_SKILLS_MACHINE ?? ROTARIS_CAPTURE_INSTRUCTIONS_MACHINE` (`apps/desktop/src/run-host/host.ts`),
mirroring the `SKILLS_HOME ?? INSTRUCTIONS_HOME` pair, read only under `__ROTARIS_SEAMS__` and named in
`scripts/package.mjs`'s forbidden list so a packaged bundle that still carried it would fail the seam check. The
workspace service keeps reading the instructions variable alone, as it does for `home`; it runs no skill discovery.

**The three proofs.** `skills-proof` sets `ROTARIS_CAPTURE_SKILLS_MACHINE` to `scratch/machine-codex` (and
`ROTARIS_CAPTURE_INSTRUCTIONS_MACHINE` to the same directory, since the workspace service's inventory reads only that
one and the run host reads the skills variable first, so no process of any of its launches opens `/etc/codex`) and stages
`skills/machine-skill/SKILL.md` there, so off Windows the seam is exercised in the built app: the discover launch's exact
list gains `machine-skill` (scope `user`), the discovery log's count follows the list, the `/skills` listing's entry
for it carries the scratch path, and the run launch's catalog names it. `injection-proof` already set
`ROTARIS_CAPTURE_INSTRUCTIONS_MACHINE`, which now moves the skill root too, and its header says so in place of the
"one root is still read" paragraph. `settings-proof` sets `ROTARIS_CAPTURE_INSTRUCTIONS_MACHINE` to `profile/machine-codex`,
so its exact Instructions inventory and its scripted run read neither the host's `/etc/codex/AGENTS.md` nor its
`/etc/codex/skills`.

**The catalog tests.** `apps/desktop/src/run-host/skills.test.ts`'s `host()` already named `join(home, 'machine')`; it
now reaches the skill root too. The isolation case records `readDir` beside `isFile` and asserts, for both helpers on a
pinned `linux` platform, that `<home>/machine/skills` was listed and nothing under `/etc/codex` was — red on any host
when the host loses its `machineDir` (checked by removing it from the `discoverSkills` call). A new case stages the
note's `zeta` under the scratch machine root and a same-named `alpha` under it and under the scratch home: `zeta` is
found as `user` scope from the scratch path, `alpha`'s workspace copy wins and shadows both, and on `win32` the root is
not searched. `packages/config/src/skills/skills.test.ts` pins the seam itself: `<machineDir>/skills` last among six
roots on Linux, nothing under `/etc/codex`, `machineCodexDir` folding absent and blank to the real directory, and no
fourth root on Windows whatever `machineDir` names.

**What was run.** `pnpm settings-proof` and `pnpm injection-proof --skip-latency` under Xvfb, and `pnpm skills-proof`
up to the point its policy launch fails on Linux for the reason
[`skills-proof-writes-its-global-policy-where-only-windows-reads-it.md`](skills-proof-writes-its-global-policy-where-only-windows-reads-it.md)
records. The launches before it (discover, commands, listing, listing-reopen) ran and read the machine root from the
scratch directory; the run launch after it reads the root too, and its assertion is the one that proves the injected
catalog names `machine-skill`, so on this host that assertion is written and not observed until that note is repaired.
The outcomes are in the first-executions row of 2026-09-28. On this host Chromium refuses to start as root without
`--no-sandbox`, which none of the three scripts passes yet (another item sweeps them); they were run through a
verification-only wrapper around the worktree's own `node_modules/electron/dist/electron` that inserts the switch after
the main entry, exactly as `hostSwitches` does in the driver, and nothing in the repository was changed for it.

**A fifth (2026-09-28, R-062).** `slash-proof` now asserts exactly two `skill`-badged rows, `/skill` and `/skills`
(ADR-0063 decision 5). A skill under the host's `/etc/codex/skills` would add a third, and the proof would go red on a
POSIX host that holds one, because the proof does not set `ROTARIS_CAPTURE_SKILLS_MACHINE`. Its assertion names that
dependency in a comment. The proof is not changed.

Repaired 2026-09-28 under R-062, on the branch `fix-config-isolation-decoding`.
