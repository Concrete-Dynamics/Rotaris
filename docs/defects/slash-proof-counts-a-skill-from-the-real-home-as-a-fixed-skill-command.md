## slash-proof counts a skill from the real home as a fixed skill command

`pnpm slash-proof` stops at "exactly /skill and /skills carry the skill badge (ADR-0063): caveman,skill,skills". The proof says
its launch discovers no skill, but on a host with a skill under the user's real home (`~/.agents/skills/caveman` here) that skill
reaches the launch, so the launch's home is not isolated for skill discovery. Seen 2026-11-01 on Windows 11 ARM64, Node 26.13.0,
on `fix/workspace-open-warmup-off-the-loop` and on a control build of it at `c6110962`, with the same message. The proof stops
here, so its later checks did not run on this host. That the home is the route is inferred from the skill's presence there; it
was not traced.

## Specs

None contradicted by the product: REQ-WORKSPACE-051 names the home as a skill root. The proof's claim of isolation is what is wrong.

## Relevant files

- `apps/desktop/scripts/slash-proof.mjs`: the exact-set assertion and the comment resting it on the launch's isolation.
