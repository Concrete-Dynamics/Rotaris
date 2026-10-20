## `pnpm app:drive start` with no `--workspace` opens the checkout's `apps/desktop`

`drive.mjs`'s `start` hands `startApp` no workspace when `--workspace` is not given, and `startApp` runs the launch with
`apps/desktop` as its working directory unless its caller names another (`cwd`, since plan `loc1`'s `proof-cwd` bundle).
With no workspace argument and nothing remembered in the `.drive/` profile, or a remembered workspace that is gone, the app
opens its working directory (REQ-SHELL-010 (c), REQ-WORKSPACE-007, `MainWindows.resolveStartup`). So a drive started
without `--workspace` opens the checkout's `apps/desktop`, runs the bundled code-intelligence setup over the product's own
source, writes `apps/desktop/.rotaris` and `apps/desktop/.serena`, and shows the checkout in the Git view.

The script already refuses a `--workspace` inside the checkout, with the reason "a driven app writes into its workspace;
use a path outside the repository" (the run of 2026-09-18 left `.rotaris`/`.serena` residue that way). The launch with no
`--workspace` reaches the same place by the other door. It is the class of the repaired
[`workspace-proof-and-updater-proof-launches-with-no-workspace-argument-open-the-checkout.md`](fixed/workspace-proof-and-updater-proof-launches-with-no-workspace-argument-open-the-checkout.md)
and
[`settings-proofs-no-workspace-launches-open-the-repositorys-apps-desktop-and-index-it.md`](fixed/settings-proofs-no-workspace-launches-open-the-repositorys-apps-desktop-and-index-it.md),
in the debugging driver rather than a proof.

Noticed by reading, while repairing the first of those notes (plan `loc1`, 2026-10-20); not launched, and not repaired: it
is outside that task. The likely repair is the same: `start` with no `--workspace` names an emptied directory of its own
under `.drive/` (`lib/working-directory.mjs`'s `emptyWorkingDirectory`) as `startApp`'s `cwd`. Whether a drive with no
`--workspace` should instead keep the profile's remembered workspace across starts is the driver's design, not the
product's.

## Specs

None is contradicted by the product: REQ-SHELL-010 (c) is what it does. The driver gives it the checkout as the working
directory, against its own rule that a driven app's workspace is never inside the checkout.

## Relevant files

- `apps/desktop/scripts/drive.mjs`, `case 'start'`: the `--workspace` refusal, and the `startApp` call with no workspace
  and no `cwd`.
- `apps/desktop/scripts/lib/driver.mjs`, `startApp`: `cwd` defaults to `apps/desktop`.
- `apps/desktop/scripts/lib/working-directory.mjs`: `emptyWorkingDirectory` and `assertOpened`.
