## workspace-proof's and updater-proof's launches with no workspace argument open the checkout and index it

The driver's `startApp` (`apps/desktop/scripts/lib/driver.mjs`) runs every launch with `apps/desktop` as its working
directory. With no workspace argument and nothing remembered, or a remembered workspace that is gone, the app opens its
working directory (REQ-SHELL-010 (c), REQ-WORKSPACE-007, `MainWindows.resolveStartup`). Three proof launches give it
no argument:

- `workspace-proof` scenario 1/2 (`cold`), which measures exactly that fallback;
- `workspace-proof`'s `gone` launch, with a remembered workspace that no longer exists;
- `updater-proof`'s first stage.

So each one opens `apps/desktop` of the checkout the proof runs in, which is the product's own source in a git checkout.
The background initialization runs the bundled code-intelligence setup there. At acceptance (`3c03287`, the
`Rotaris-crw-wt-accept` tree), each of the three logs "main window 1 loaded for …/apps/desktop" and then "mcp setup:
index running". The setup writes `apps/desktop/.rotaris` and `apps/desktop/.serena` into the checkout. Both are
git-ignored by `apps/desktop/.gitignore`, which exists for them.

Nothing was seen to outlive those launches: no `bounded-launch` line in their acceptance logs. Each such launch still
indexes the product's source beside the measurement, and its Git view reads the checkout. That is the same class as the
repaired
[`settings-proofs-no-workspace-launches-open-the-repositorys-apps-desktop-and-index-it.md`](fixed/settings-proofs-no-workspace-launches-open-the-repositorys-apps-desktop-and-index-it.md),
whose `index` stage outlived the capture seam's exit. Noticed while repairing that note, and recorded, not repaired:
it is outside that task.

## Specs

None is contradicted by the product. REQ-SHELL-010 (c) is what it does. What the proofs measure is the fallback to the
working directory, and they give it the checkout as that directory. `workspace-proof`'s check reads only that the window
is "open on" a directory other than the sentinel, so an empty scratch directory would serve it as well.

## Relevant files

- `apps/desktop/scripts/lib/driver.mjs`, `startApp`: `cwd: appDirectory` for every launch.
- `apps/desktop/scripts/workspace-proof.mjs`: `launch('cold', …)` and `launch('gone', …)`, with no `workspace`.
- `apps/desktop/scripts/updater-proof.mjs`: the stage-1 `startApp({ root: output, … })`, with no `workspace`.
- `apps/desktop/scripts/lib/working-directory.mjs`: `emptyWorkingDirectory` and `assertOpened`, which `settings-proof`
  uses for the same case.
