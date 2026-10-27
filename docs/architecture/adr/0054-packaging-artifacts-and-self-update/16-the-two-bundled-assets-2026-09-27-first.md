# ADR-0054 — Packaging, the four artifacts, and self-update — The two bundled assets — 2026-09-27, first execution (`first-release-plan.md` §4.4)

Part 16 of 22 of [ADR-0054](../0054-packaging-artifacts-and-self-update.md), which indexes every part.

## The two bundled assets — 2026-09-27, first execution (`first-release-plan.md` §4.4)

*REQ-SHELL-140, REQ-SHELL-142, REQ-STARTUP-015, REQ-STARTUP-037, REQ-STARTUP-141, REQ-STARTUP-143, REQ-STARTUP-149.* The
packaged build now carries both files the About page asks this record for at the root of `process.resourcesPath`, where
`apps/desktop/src/main/about.ts` already looked. Four decisions were taken here, each recorded with its reason.

**1. What the build identifier is.** `pnpm build-id` (`tools/build-id/`) writes `apps/desktop/resources/build-id.txt`
(git-ignored) as one line: the full object name of the commit HEAD names, with `-dirty` appended when git reports a
change the commit does not hold — a modified, staged, deleted or untracked file that is not ignored (`git describe
--dirty`'s word). REQ-SHELL-140 fixes only that the value comes from a bundled text asset, and the specification's
appendix that the asset is one stripped line. The rest follows from what an identifier is for:

- Two builds of one commit from a clean tree carry the same identifier on every machine, and an identifier never
  names a commit the build did not come from.
- The full name, not an abbreviation: the length git abbreviates to grows with the clone's object count, so it is not
  a property of the commit.
- No tag and no `git describe`: whether a clone fetched its tags is not a property of the commit either.
- It reads the local repository only and never reaches the network. A tree git cannot name a commit for fails the step
  (exit 1, one `error:` line) and removes any earlier file, so a stale identifier is never frozen in its place.
- A build for a tag is not refused for `-dirty`. The specification does not forbid it, the identifier says it, and a
  release job's checkout is clean: `.gitattributes` forces LF and every file the build generates is ignored. *Decided
  2026-09-27, at the gate review's suggestion to record the choice.*

**2. `pnpm package` runs both steps before freezing, notices first.** After the code-intelligence bundle, because the
notices generator reads the runtime, and before `electron-vite build`, because a refusal should cost seconds. Both
files go to the root of the artifact's resources through two `extraResources` entries.

**3. What a local `pnpm package` does while O-3 is owed.** It fails. `pnpm notices` refuses until the owner writes O-3's
address, a maintainer signs O-11's twelve reviews and OQ-74 is ruled, and the package refuses with it, exiting 1 and
naming the flag below (REQ-STARTUP-143). This was measured: `REFUSED` at the notices step in 6.2 s, with the notices
step's fourteen `error:` lines above it. **`ROTARIS_PACKAGE_WITHOUT_NOTICES=1` is the one explicit way on.** Only the
value `1` sets it, and it passes over exit 1 only, never a usage error ~~or a crash~~ or a signal. ~~What it makes is a
development package with no notices file, because the refused step has already removed any earlier one.~~ Exit 1 is also
what a crash exits with: Node exits 1 on an uncaught exception, and the step makes exit 1 of an exception it catches.
So the flag passes over a crash as well, and an uncaught one removes nothing. `package.mjs` therefore removes any notices file
itself when it goes on without one (`settleNoticesStep`), and what it makes is a development package with no notices
file whatever ended the step. *Corrected 2026-09-27 by the gate review: the struck text claimed the flag never passed
over a crash, and it did, with a stale notices file left for `electron-builder` to carry and `afterPack` to accept.*
*A value other than `1` or empty is a usage error, and `pnpm package` exits 2 on it before any step runs
(REQ-STARTUP-149, `flagUsage`). Added 2026-09-27 by the review's second round: before it, such a value was found only
after the notices step, and the package exited 1 as though validation had refused.*
Such a package:

- shows REQ-SHELL-142's caption on its About page;
- carries no licence text for its shipped closure, and so not the tool server's (REQ-STARTUP-015/141/142);
- is announced as not releasable, in the step's line and again as the script's last line;
- carries a release artifact's name all the same. Its installer is `Rotaris-<version>-windows-x64-setup.exe`,
  REQ-STARTUP-031's name, and nothing on the file tells it from a release. Only `package.mjs`'s lines and
  `release/load-proof.json` do. What keeps it out of a release is the tag refusal below, because §4.2's workflow is the
  only route to one.

A build for a tag refuses the flag: `GITHUB_REF_TYPE=tag`, or `GITHUB_REF` under `refs/tags/`. §4.2's workflow therefore
cannot take this route even if it sets the flag. Only GitHub's variables are read, so a release built by any other route
is not recognised as one. `afterPack` refuses an artifact without the notices file unless the flag is set, and on a
build for a tag even when it is. So calling `electron-builder` directly does not get past either refusal. *The tag
half was added 2026-09-27 by the gate review. Before it, `afterPack` accepted the flag on a tag build.*

**4. Which copy of the tool server's licence text stands (plan §4.4's second fact).** REQ-STARTUP-015 wants exactly one
copy inside the bundle and cites REQ-STARTUP-142. REQ-STARTUP-142 requires the notices file to carry every shipped
dependency's full licence text, and `serena-agent` is one. So the copy REQ-STARTUP-142 compels is the one that stands,
and the copy this record named on 2026-09-06, under the distribution's `dist-info`, is the second. `electron-builder.yml`
filters it out of the artifact (`!runtime/**/serena_agent-*.dist-info/licenses/LICENSE`). The source tree keeps it,
because that is where the generator reads it. Nothing reads it at run time: the product never does, and `afterPack`'s
interpreter check reads `METADATA`. The requirements decide this between them, so no question is raised. On this tree's
real inputs the rendered notices text carries `serena-agent`'s MIT text exactly once (20.4 MB rendered, 1 occurrence).
The distribution's `RECORD` still lists the file it no longer carries in the artifact. Nothing in the artifact reads
`RECORD`; a tool that checks an installed distribution against it, as `pip uninstall` does, would find the file missing.
*Noted 2026-09-27 by the review's second round.*

**The evidence, and what it does not cover.**

- `afterPack` gains an "assets" rule (`apps/desktop/scripts/lib/about-assets.mjs`; *named `bundled-assets.mjs` until the
  gate review, which found the name taken: ~~REQ-STARTUP-143's "bundled asset" is a font family or the icon set~~
  `tools/notices/bundled-assets.json` already holds the bundled assets that carry a licence file, the three font
  families and the icon set. Corrected 2026-09-27 by the review's second round: the struck clause read REQ-STARTUP-143's
  licence-file clause as a definition. The specification lists both of this module's files among the bundled assets
  the shell reads (`docs/spec/12-desktop-shell-windows.md`, "Bundled assets read by the shell"; REQ-SHELL-140's
  "bundled text asset"), and the Distribution glossary now says so. The name stands: it says which surface the module
  serves*), which checks the artifact:
  - `build-id.txt` is one line, byte-identical to the file the step wrote, and names the tree being packed
    (`identifyBuild`, asked again at `afterPack`), so an identifier an earlier build left cannot be carried by an
    `electron-builder` called directly;
  - the notices file is byte-identical to ~~the one validation passed~~ the one in the source tree, or is absent only
    under the flag and never for a tag. *Corrected 2026-09-27 by the review's second round: `afterPack` does not run
    validation again, and nothing ties that file to the tree being packed as `identifyBuild` ties the identifier. On
    `pnpm package`'s path the file is this tree's, because the notices step has just regenerated or removed it; an
    `electron-builder` called directly carries whatever an earlier passing run left;*
  - no copy of the tool server's licence remains under its `dist-info`;
  - the notices file carries that licence text exactly once, read by the generator's own `normalize`.

  It fails the build naming each problem, including the case where a renamed distribution stops matching the filter.
  The count looks for a second copy at the `dist-info` path only, not across the rest of the artifact. On this tree
  the runtime carries the tool server's copyright line in that one file and no other.
- `about-assets.test.ts` runs the repository's own `electron-builder.yml` through electron-builder's own
  `getFileMatchers` and `copyFiles` (app-builder-lib 26.15.3, the yml parsed by the `js-yaml` it loads). The fixture
  tree is in both runtime layouts, with and without the notices file. Removing the filter or the build-id entry fails
  those cases.
- **No Windows package was run.** IC-3 bars a Linux artifact, and the Windows pack needs its own host. The "assets"
  rule's first run against a real `win-unpacked` is still owed, and it happens at the next `pnpm package` on Windows.
- `pnpm settings-proof` gains launch 1′, the present branch of each asset in the built app:
  - the Build row reads the identifier `pnpm build-id` wrote over this tree (`<HEAD>-dirty` while the change was
    uncommitted);
  - no caption stands under the licensing control;
  - the control opens `apps/desktop/resources/THIRD-PARTY-LICENSES.txt`.

  That notices file is a fixture, because `pnpm notices` refuses. The proof moves any real file aside first and gives
  it back byte for byte (`lib/staged-resources.mjs`). A run killed mid-launch is repaired by the next run. Both were
  measured: with real files present, with none, and after a `SIGKILL` during 1′.

  *Corrected 2026-09-27 by the gate review, on two points.* First, the repair could clobber a real file. If a real
  `pnpm build-id` or `pnpm notices` ran between a killed run and the next, the next run's restore put the stale file
  back over the new identifier, and deleted the new notices file. The stash's ledger now records each file the proof
  wrote by SHA-256 and modification time. A file that does not match is kept as newer, and the stashed one is dropped.
  The time is compared because `pnpm build-id` over the same tree writes the same bytes. Measured in the built app: a
  real identifier was staged, the proof was sent `SIGKILL` during 1′, and `pnpm build-id` then ran. The next run kept
  the new file, dropped the stashed one, removed the notices fixture, and passed. Second, the proof caught SIGINT and
  SIGTERM to give the files back. Node runs such a handler only after `spawnSync` returns. A script holding the same
  handler around a `spawnSync` showed that a SIGTERM during a launch was held until the launch ended, then ignored,
  and the script exited 0. The handlers are gone. `finally` covers a launch whose Electron dies, and the next run
  covers the proof's own death.

  *Corrected again 2026-09-27 by the review's second round, on two more points, each confirmed by its probe.* First,
  when the proof's fixture had been removed by another writer, the next run put the older stashed file back: a
  `pnpm notices` that refused after a killed run removed the fixture, and the notices file of an earlier passing run
  returned. A removal is now newer than the stash, like a write, so the name is left empty and the stashed file dropped.
  `restore` moves the stashed file over the proof's instead of removing the proof's first, so it never makes that state
  itself. Measured in the built app: a real identifier and an older notices file were staged, the proof was sent
  `SIGKILL` during 1′, and `pnpm notices` then refused and removed the fixture. The next run left the notices name
  empty, dropped the older file, put the identifier back byte for byte, and passed. Second, the ledger was written in
  place, and a kill during that write left it unreadable, so the fixture was kept and the real file dropped. The ledger
  is now written beside itself and renamed over. Two windows stay open, both while the proof has written nothing under
  a name, and `lib/staged-resources.mjs` names them: a write killed part-way, and a refusal during the absent-branch
  launch, which leaves no trace for the next run to read. *The same round added two smaller repairs: `package.mjs`
  reports a step it could not start as that, not as a signal, and `settings-proof` asks git for HEAD without the
  variables of an enclosing git process, as the writer does.*

**What this found.** No defect in the mechanism the record decided. It found one false statement nearby: `package.mjs`
said "`out/` now holds a SEAM-FREE build" after every run, including one refused before the build. That line now
prints only when the build ran (`docs/defects/fixed/pnpm-package-announced-a-seam-free-build-it-had-not-made.md`; the
closing lines are `scripts/lib/package-verdict.mjs`'s, tested). With it, a refusal writes an `error:` line to stderr
(REQ-STARTUP-149), and a counterfactual that ended before `electron-builder` is reported as not exercised. It also
found one craft note on the About page, recorded in `docs/defects/`. **Nothing in this record's decision changes.**
The gate review's corrections above change how decision 3 is carried out. They do not change the decision.
