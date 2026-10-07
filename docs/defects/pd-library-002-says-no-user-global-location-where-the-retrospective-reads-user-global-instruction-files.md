## PD-LIBRARY-002 says "no user-global location" where the retrospective reads user-global instruction files

`PD-LIBRARY-002`'s "Reach, and the boundary it holds" says a retrospective "SHALL NOT read outside the workspace: no
other workspace's record, no user-global location". OQ-65, ruled 2026-10-06 under R-071, holds that the retrospective
reads exactly the instruction-file set injection reads, and since `PD-WORKSPACE-002` that set includes files under the
Rotaris global configuration directory, `~/.agents`, `~/.config/opencode`, `~/.openhands` and `/etc/codex`.
`apps/desktop/src/run-host/skills.ts` serves both readers from one computation (`instructionFiles` →
`enabledUnder`, discovering under `globalDir`, `home` and `machineDir`). So the built retrospective reads user-global
and machine-wide files the directive's reach clause rules out, and the two owner decisions (R-033's directive and
R-071's ruling) disagree on the record. It may also surprise a user who reads the directive as a privacy boundary.

Recorded 2026-10-07 from the R-072 consortium's ruling on OQ-222 (BP1), whose two advocates both raised it; not
repaired, since which decision governs is the owner's (or the delegated round's) to settle.

## Specs

- `PD-LIBRARY-002`, "Reach, and the boundary it holds" (`docs/product/directives.md`).
- OQ-65's ruling (`docs/architecture/open-questions.md`) and `PD-WORKSPACE-002`'s discovery bases.

## Relevant files

- `apps/desktop/src/run-host/skills.ts` — `instructionFiles`, the one discovery both readers use.
- `docs/spec/13-workspace-context-onboarding.md` — REQ-WORKSPACE-041 and its two notes.
