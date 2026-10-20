## workspace-proof's and updater-proof's launches with no workspace argument open the checkout and index it

## Outcome: repaired 2026-10-20 (plan `loc1`, `proof-cwd`)

**Confirmed first, on this branch** (`0d89e971`, with `startApp`'s new `cwd` defaulting to `apps/desktop`, so the proofs
unchanged), on Windows 11 ARM64, Node 24.18.0, at a CPU load of 25 % with no other Electron. `workspace-proof
--skip-build` passed 49 checks (5 skipped). Its `cold` and `gone` launches read "the window is open on
C:\dev\Rotaris-crw-wt-loc1-proofcwd\apps\desktop"; `app-cold/app.log` reads "mcp setup: started for …\apps\desktop",
then "create running" with `project create …\apps\desktop`, and `apps/desktop/.rotaris` appeared in the tree, which had
none before. The quit cancelled `create`, so no `.serena` was written and no index ran this time.

**Repaired in the harness. The product is unchanged**, because REQ-SHELL-010 (c) and REQ-WORKSPACE-007 are what it does.

- `apps/desktop/scripts/lib/driver.mjs`: `startApp` takes `cwd`, the directory the launch runs in, `apps/desktop` when
  the caller names none.
- `apps/desktop/scripts/workspace-proof.mjs`: the `cold` and `gone` launches each run in
  `.proof/workspace-proof/app-<name>/working-directory`, made by `emptyWorkingDirectory`. The REQ-SHELL-010 (c) and
  REQ-WORKSPACE-007 checks now also require `assertOpened`: the launch's log names exactly that directory. A last check
  holds that the checkout's `apps/desktop` gained no `.rotaris` or `.serena` while the proof ran.
- `apps/desktop/scripts/updater-proof.mjs`: stage 1 runs in `.proof/updater-proof/working-directory`, with a check that
  it opened that directory and the same residue check.
- `apps/desktop/scripts/lib/working-directory.mjs`: `setupResidue`, the two names the code-intelligence setup leaves in
  a directory it ran in.

**Pinned by** `apps/desktop/scripts/lib/driver-start.test.ts` (new, 2 cases): `startApp`'s launch, a real Node child in
place of Electron, runs in the directory its caller names, and in `apps/desktop` when it names none. With `cwd` put back
to `apps/desktop` the first case fails ("expected 'c:\dev\rotaris-crw-wt-loc1-proofcwd\a…' to be
'c:\users\ganga\appdata\local\temp\dri…'"). `working-directory.test.ts` gains 2 cases for `setupResidue`, one holding
its names to `apps/desktop/.gitignore`'s.

**Shown by** `workspace-proof --skip-build` after the repair, with `apps/desktop/.rotaris` removed first: 50 passed, 0
failed, 5 skipped, at a load near 100 % from other agents' gates and no other Electron at its start. `cold` and `gone`
opened their own working directories, and "no launch opened the checkout … before [], after the same". `updater-proof
--skip-build`: stage 1's 9 checks and the two new ones passed ("opened its own empty working directory, never the
checkout — C:\dev\Rotaris-crw-wt-loc1-proofcwd\.proof\updater-proof\working-directory"; "before [], after the same"), and
`apps/desktop` held no `.rotaris` or `.serena` after both proofs. Its stage 2, which this repair does not touch, failed
its three checks in that run and in a re-run alone; that is Windows-only and recorded separately in
[`updater-proofs-children-stage-captures-before-its-terminal-call-on-windows.md`](../updater-proofs-children-stage-captures-before-its-terminal-call-on-windows.md).

**Not repaired here:** `pnpm app:drive start` with no `--workspace` reaches the same place through the same `startApp`
default, recorded in
[`app-drive-start-with-no-workspace-opens-the-checkout.md`](../app-drive-start-with-no-workspace-opens-the-checkout.md).

---

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
[`settings-proofs-no-workspace-launches-open-the-repositorys-apps-desktop-and-index-it.md`](settings-proofs-no-workspace-launches-open-the-repositorys-apps-desktop-and-index-it.md),
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
