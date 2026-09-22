## `app:drive --workspace` inside the checkout wrote scratch state into the repository

Observed 2026-09-18 while running the autopsy that found the other four: `pnpm app:drive start
--workspace=.drive-autopsy-ws` put a scratch workspace INSIDE the checkout, and its `.rotaris`/`.serena`
residue stayed on disk afterwards — twice over (once at the checkout root, once under `apps/desktop/`
when the guard test ran from the wrong directory).

A driven app writes into its workspace, so a workspace inside the checkout is never what a drive wants.
`apps/desktop/scripts/drive.mjs` now refuses a `--workspace` that resolves inside the repository (exit 2,
naming the path and pointing outside), computed against the `repo` root `lib/harness.mjs` already exports.

## Specs

No requirement contradicted — tooling hygiene for the driver seam (`AGENTS.md`'s `pnpm app:drive`).

## Relevant files

- `apps/desktop/scripts/drive.mjs` — the guard.
- `apps/desktop/scripts/lib/harness.mjs` — the `repo` root it computes against.

Noticed 2026-09-18 by the run-autopsy session itself; repaired on the same branch.

*Confirmed landed and filed 2026-09-22: `apps/desktop/scripts/drive.mjs:74-76` computes the path against
`repo` and refuses with `refusing --workspace inside the checkout: …`. The note recorded its own repair
and was never moved.*
