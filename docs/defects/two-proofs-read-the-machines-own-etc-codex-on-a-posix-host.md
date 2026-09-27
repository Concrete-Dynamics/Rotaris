## Two proofs read the machine's own `/etc/codex` on a POSIX host

`skills-proof` isolates the home-relative skill roots through `ROTARIS_CAPTURE_SKILLS_HOME`, but the skill search's
machine-wide root, `/etc/codex/skills` (REQ-WORKSPACE-051, every platform with an `/etc` hierarchy), is still the
machine's own. `settings-proof` isolates the home-relative instruction bases through
`ROTARIS_CAPTURE_INSTRUCTIONS_HOME`, but not the machine-wide instruction base `/etc/codex`. On a Linux or macOS
host that holds either — the Codex CLI's own locations — `skills-proof`'s exact skill list and `settings-proof`'s
exact Instructions inventory would both fail on what the operator's machine holds rather than on the product. Neither
fails in this container, which has no `/etc/codex`. Noticed 2026-09-27 while building `pnpm injection-proof`, which
isolates the instruction base with `ROTARIS_CAPTURE_INSTRUCTIONS_MACHINE`.

## Specs

None contradicted. AGENTS.md states that each proof launches the built application against a scratch profile; these
two leave one root of the operator's machine inside that profile.

## Relevant files

- `apps/desktop/scripts/skills-proof.mjs`: the launch environment, which names a scratch home and no machine-wide root.
- `apps/desktop/scripts/settings-proof.mjs`: the same, for the Instructions inventory.
- `packages/config/src/skills/roots.ts`: `skillRoots`, where `/etc/codex/skills` is a literal with no injectable directory.
- `apps/desktop/src/run-host/host.ts`, `apps/desktop/src/workspace-service/index.ts`: where the instruction base's
  seam is read. `settings-proof` needs only to set it; the skill root has no seam yet.
