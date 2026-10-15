## settings-proof's "no workspace" launches open the repository's `apps/desktop` and index it

## Outcome: repaired 2026-10-15 (fin47, `fin47-accept1-3`)

**Confirmed first, on this branch at `e37f651`** (`cb6d1d5` plus this note), as root under Xvfb, Node 24, load 0.7.
`settings-proof --skip-build` passed, and its four launches with no workspace argument each logged "main window 1
loaded for /home/user/Rotaris-crw-wt-fin47-a1-3/apps/desktop (origin launch)". Each ran the code-intelligence setup
there ("mcp setup: create running") and left `apps/desktop/.rotaris/` behind. That tree had never been set up, so the
exit cut the setup during `create`, not `index`, and no process outlived a launch this time. The two leftovers at
`3c03287` came from a tree whose `index` stage was running.

**Repaired in the harness. The product is unchanged**, because REQ-SHELL-010 (c) is what it does.

- `apps/desktop/scripts/lib/working-directory.mjs` (new) holds two helpers. `emptyWorkingDirectory` makes the directory
  a launch with no workspace argument runs in: new, empty, and in no git repository. It refuses one that lies in a
  repository, which a launch would open and index. `openedWorkspace` / `assertOpened` read from the launch's log what
  its first main window opened.
- `settings-proof` runs the four launches in `.proof/settings-proof/profile/working-directory`. The harness's git bar
  puts that directory in no repository. `launch()` asserts that each such launch opened exactly that directory. Its
  header and the Tools check now say what they measure: no workspace argument, and nothing open but that empty
  directory. `results.json` gains `openedWithoutArgument`, each launch's opened directory and any setup process that
  outlived it (evidence, not a check: a step left by the capture seam's exit is OQ-169's ruled case).

**Pinned by** `apps/desktop/scripts/lib/working-directory.test.ts`, with 8 cases. `assertOpened` fails acceptance's own
`no-workspace.log` line, which opened the checkout. A directory in a git repository is refused. The checkout's
`apps/desktop` reads as inside the repository. A directory under `.proof/` reads as in none, and is emptied of what an
earlier run left there.

**Shown by** `settings-proof --skip-build` at the repair, which passed, under Xvfb at load 1.8 to 5.0 with other lanes
running. All four launches opened `.proof/settings-proof/profile/working-directory`. The setup there completed with
"index skipped-no-code", so no index ran. No `bounded-launch` line was printed, and `apps/desktop/.rotaris` was not
recreated. A second run on the final head, at load 1.4 to 4.1, passed too. Its `openedWithoutArgument` names that
directory for all four launches, with `outlivedTheLaunch` empty for each. `create` succeeded in 2780 ms, and `index`
was again skipped because the directory holds no code. The proof with only the working directory put back to `apps/desktop` failed at its first launch: "Error:
no-workspace opened /home/user/Rotaris-crw-wt-fin47-a1-3/apps/desktop, not its empty working directory
/home/user/Rotaris-crw-wt-fin47-a1-3/.proof/settings-proof/profile/working-directory".

**Corrected in place:** the falsified sentence in
[`an-orderly-quit-during-the-background-setup-warns-its-cancellation-could-not-be-delivered.md`](an-orderly-quit-during-the-background-setup-warns-its-cancellation-could-not-be-delivered.md)
and in [ADR-0035](../../architecture/adr/0035-the-bundled-code-intelligence-runtime.md). Each keeps the struck sentence
beside the correction.

**Not repaired here:** two other proofs open the checkout the same way, and were recorded separately in
[`workspace-proof-and-updater-proof-launches-with-no-workspace-argument-open-the-checkout.md`](../workspace-proof-and-updater-proof-launches-with-no-workspace-argument-open-the-checkout.md).
The capture seam's immediate exit still sends no `shutdown`. That is a verification seam, and a step it leaves is
OQ-169's ruled case.

---

`settings-proof` makes four launches with no workspace argument: `no-workspace`, `about-present`, `about-minimum` and
`tools`. Each runs with its working directory set to `apps/desktop`. With no argument and nothing remembered, the app
opens its working directory (`MainWindows.resolveStartup`, REQ-SHELL-010 (c)). So every one of those launches opens
`apps/desktop` of the checkout the proof runs in, which is a real git checkout of the product's own source.

- The background initialization runs the bundled code-intelligence setup over it. That writes `apps/desktop/.serena`
  and `apps/desktop/.rotaris`, both git-ignored, and starts a real `project index` of the product's source.
- What the proof says it measures does not hold. Its header calls launch 1 "Electron started with no workspace", and its
  Tools check says REQ-CONFIG-277's inventory is "populated unconditionally — with no workspace open at all". In each
  launch a workspace is open, and it is the checkout.
- The capture seam's exit ends the run host without a `shutdown` (`exitCleanly` → `endRunHost`, `utilityProcess.kill`).
  A setup step runs in a process group and session of its own, so nothing ends it. The index's `python3` serena process
  and `uv` / `pyright-langserver` were still running more than 6 s after the app's group ended. `bounded-launch`'s sweep
  then ended them with SIGKILL, in `no-workspace` and `about-present`.
- That falsifies a line in the fixed note
  [`an-orderly-quit-during-the-background-setup-warns-its-cancellation-could-not-be-delivered.md`](an-orderly-quit-during-the-background-setup-warns-its-cancellation-could-not-be-delivered.md)
  and the same line in [ADR-0035](../../architecture/adr/0035-the-bundled-code-intelligence-runtime.md): "The bundled
  runtime … ends itself when its pipes close". That does not hold for an index that pyright serves.

The product's orderly quit is unaffected: the run host's `shutdown` ends a running setup (`McpHost.endSetup`), and
`workspace-proof` scenario 8f passed. A run host that ends without its `shutdown` leaves the step running, and OQ-169's
ruling (PD-WORKSPACE-006) covers that case: "nothing in main ends a lost run host's step processes".

Acceptance finding A5 of fin47 (harness defect, cosmetic). Found at `3c03287`; confirmed on this branch at `cb6d1d5`
(below).

## Specs

- `REQ-CONFIG-277`: the Tools inventory is populated unconditionally. The proof claims it measured this with no
  workspace open, and it measured it in a workspace (the checkout).
- `REQ-SHELL-010` (c): a launch carrying nothing opens on the working directory. This is the product behaving as
  specified. The proof gave it the checkout as that directory.
- `REQ-WORKSPACE-092`, `REQ-WORKSPACE-109`, `OQ-169` (`PD-WORKSPACE-006`): a step whose run host ends without its
  `shutdown` is not ended by main. This is ruled behaviour, and no defect of the product.

## Evidence

- Acceptance at `3c03287`: `scratchpad/accept1b/settings-proof.r1b.log`, lines 1 and 2: "bounded-launch: 2 / 4
  process(es) … outlived its group by 6000 ms and were ended with SIGKILL: … serena.cli … project index
  …/apps/desktop ;; … pyright-langserver --stdio".
- `.proof/settings-proof/no-workspace.log` in that tree, lines 4 to 22: "main window 1 loaded for …/apps/desktop" and
  "mcp setup: index running". Lines 51 to 59: "the run host exited (0) while code-intelligence-setup's setup was under way".
- `about-minimum.log` and `tools.log` open and index the same directory.

## Relevant files

- `apps/desktop/scripts/settings-proof.mjs`: `launch()` runs every launch with `cwd: app`. The four launches pass `null`
  for the workspace.
- `apps/desktop/src/main/main-windows.ts`: `resolveStartup`. With no argument and nothing remembered, it opens
  `currentDirectory()`.
- `apps/desktop/src/main/index.ts`: `exitCleanly` and `endRunHost`, the capture seam's immediate exit, which sends no
  `shutdown`.
- `docs/defects/fixed/an-orderly-quit-during-the-background-setup-warns-its-cancellation-could-not-be-delivered.md` and
  `docs/architecture/adr/0035-the-bundled-code-intelligence-runtime.md`: the falsified line.
