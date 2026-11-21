## driver-proof's navigation shots confirm paint for only some of seven on the Linux agent host

`pnpm driver-proof`'s check "a shot straight after a navigation differs from the shot before it" goes red on the Linux agent
host with every one of its six navigations producing a new shot but paint confirmed for only some of the seven shots. Read
on 2026-11-21: 0/7 and 3/7 on the `auto-update-link-only` branch (beside other proofs, then alone), 1/7 on a detached
`origin/main` (`043c4c3f`) built and run alone, and green on the branch at the next lone run. The red is the host's, not a
change's: it follows load and repeats on `main`. Not investigated beyond those readings; the camera check beside it (OQ-459)
is a separate, recorded red.

## Specs

None contradicted by the product as far as read: every shot differed, so the driver showed each new view. The check holds the
driver's `shot` to "never the frame before a navigation" (`AGENTS.md`, "Driving the built app"), and its paint confirmation is
what flakes.

## Relevant files

- `apps/desktop/scripts/driver-proof.mjs` — the navigation-shot check and its paint-confirmation count.
- `apps/desktop/src/main/driver.ts` — `shot`, which waits four of the renderer's frames and answers `painted`.
- `docs/proofs/driver-proof.md` — the proof's record.
