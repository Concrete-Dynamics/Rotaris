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

## Outcome

Settled 2026-10-13 by [OQ-235](../../archive/architecture/open-questions/51-spikes-and-later-questions-18.md#oq-235), ruled under the owner's delegation
([R-072](../../product/requests.md#r-072)): the reach clause governs reach and OQ-65's ruling governs the switches.
`PD-LIBRARY-002` revision 2 names the set — the instruction files discovered at the workspace root, of those enabled under
REQ-WORKSPACE-048's master switch and the per-file switches — and keeps the reach clause word for word. Repaired in plan
fin34: `SkillHost.retrospectiveInstructionFiles` (`apps/desktop/src/run-host/skills.ts`) keeps the `workspace:` entries of
the one computation's enabled set, and `dispatch`'s `retrospective.capture` passes it where it passed `instructionFiles`
whole; injection is unchanged. Pinned by four cases in `apps/desktop/src/run-host/skills.test.ts`, red before, and by
`pnpm retrospective-proof`'s OQ-235 check (37 of 37).
