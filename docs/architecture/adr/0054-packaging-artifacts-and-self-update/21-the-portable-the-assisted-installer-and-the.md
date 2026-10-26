# ADR-0054 — Packaging, the four artifacts, and self-update — The portable, the assisted installer and the icon — 2026-10-23, first execution (`first-release-plan.md` §4.5, §4.9)

Part 21 of 22 of [ADR-0054](../0054-packaging-artifacts-and-self-update.md), which indexes every part.

## The portable, the assisted installer and the icon — 2026-10-23, first execution (`first-release-plan.md` §4.5, §4.9)

*REQ-STARTUP-013, 016, 017, 031, 125, 147, 150, 165; O-4; built under the owner's packaging brief of 2026-10-23 (portable
and installer; its R-number is the orchestrator's to log in `../../product/requests.md`). Reported in place under the
standing policy; row in `../first-executions.md`. Built on Linux x86_64 (6.8, 4 cores), Node 26.8.1, rustc 1.99.1, on
`a118d59b`.* P4's stub is built — the second build technology this record carried "on paper" since the 2026-09-04
installer — and alongside it the installer turned assisted and the owner's icon wired in.

**What landed.**

1. **The stub, `apps/desktop/launcher/`** — Rust, **no crate at all**, where the spike's launcher had two pure-Rust
   dependencies: raw deflate is decoded by `src/inflate.rs`, written from RFC 1951, so nothing but the toolchain's
   standard library is linked (whether that owes a notices entry is **OQ-452**). It implements this record's
   preparation as written: the root is `<per-user data>\prepared` (`%LOCALAPPDATA%\rotaris\data\prepared`; the platform
   layer's roaming default is not used); the identity token is compiled into the stub — a 128-byte slot the assembler
   writes, read by a volatile load, so the fast path never opens the artifact; the marker carries the launcher format,
   the token, the outcome, the entry point and every file with its length, and the fast path stats every one (Defect
   B's check); the commit is displace-then-rename (Defect A's); any doubt prepares again in silence; the stub closes the
   artifact before it starts the payload, passes every argument on and publishes `ROTARIS_PORTABLE_ARTIFACT`, and on
   Windows exits. Where no preparation can be made it places the payload for that run — under the root first, then the
   temporary directory, clause (c)'s closed set of two — records `outcome run-scoped` and `unprepared-root` in that
   tree's marker, waits for the run and removes the tree.
2. **The assembly, `apps/desktop/scripts/lib/portable.mjs`** — stub ‖ chunks ‖ index ‖ footer. Each file is cut into
   chunks of at most 8 MiB, each one raw deflate stream (consequence 13: shipped compressed), decoded on up to eight
   threads. The token is the declared version and the first 16 hex digits of a SHA-256 over every directory, every
   file's mode, size, path and bytes, and the entry point.
3. **Who assembles it.** The Decision read "assembled by the release pipeline". *It is assembled by `pnpm package`*
   (step 2′), on the Windows runner, beside the installer, from the same `win-unpacked` and the same declared version,
   into `release/portable/` rather than `release/` — the CI job counts exactly one `Rotaris-*-windows-x64-*.exe` at
   `release/`'s top and uploads it, and that workflow was not this brief's to change. The pipeline's `portable` stage
   reads the artifact back (footer, index, token, the version's prefix, `Rotaris.exe` as its entry) and copies it into the
   release directory; it no longer refuses.
4. **Reclamation is the stub's, not the application's** — after it has started the application, best effort, only of
   trees nothing runs from (on Windows the rename aside fails while a file inside is open). This record put it in the
   application after its window is shown; the reading is raised as **OQ-453**.
5. **The installer is assisted** (`nsis.oneClick: false`, `allowToChangeInstallationDirectory: true`) with a project
   include, `apps/desktop/resources/installer.nsh` (`nsis.include`): the install-mode page forced to the current user,
   a Welcome page, the abort warning, `%LOCALAPPDATA%\Rotaris` as the default, and REQ-STARTUP-016's
   `HKCU\Software\Rotaris\InstallDir` written beside electron-builder's `HKCU\Software\<APP_GUID>\InstallLocation`, which
   it leaves as electron-builder manages it. "Packaged-state detection" above names `InstallDir` as the installer's
   discriminator; until this include nothing wrote it, so every installed build would have classified itself not
   updatable. An update now opens the installer's pages — **OQ-454**.
6. **The icon** (O-4): `apps/desktop/resources/icon.ico`, the owner's file (115,751 B; seven images, 16–256 px, 32-bit),
   as `win.icon`; the stub links it as a `.res` it writes itself (`launcher/build.rs`, `src/icon_res.rs`) on the MSVC
   target. `pnpm package` reads every image back out of the installer, `win-unpacked/Rotaris.exe` and the portable,
   byte for byte, as one icon group (`scripts/lib/pe-icons.mjs`), and fails the package otherwise.

**What was measured, on Linux** (`pnpm portable-proof`, 37 checks, all passing; the same stub built for the host):

- the preparing run and the reusing run, launched from a directory made read-only, which came out byte for byte
  unchanged — entries, sizes, times and the artifact's digest (clause (a)); the reusing run did not touch the marker;
- **nine damage classes, each redone silently with nothing stale left**: the marker deleted, naming another token, of
  another launcher format, unreadable; the entry point deleted; a listed file deleted, truncated (Defect B's case) or
  grown; a subtree removed;
- a second artifact preparing under its own token, and the superseded preparation reclaimed after its start;
- two launches racing on an empty root: both started, one preparation, no leftover;
- **consequence 14's unmeasured branch, the stub's half**: with the root refusing every write the artifact still
  started, from a placement in the transient-files storage that was gone afterwards, and that placement's marker named
  the root it could not prepare into. The application's half — the notice — **is not built**
  (`../../../defects/a-portable-that-could-make-no-preparation-starts-without-the-notice-req-startup-165-c-requires.md`);
- the built desktop application, as the payload of this host's Electron runtime, painted twice through the stub —
  preparing, then from the preparation — with `ROTARIS_PORTABLE_ARTIFACT` reaching main, the running image inside the
  preparation, and **the one process the product started from its own image (the code-intelligence branch) not
  inheriting the variable** (REQ-STARTUP-147, `PD-STARTUP-004`);
- with the 281.6 MiB, 73-file Electron runtime as the payload: assembled in 9.2 s into 119.0 MiB; prepared in
  **0.59–1.38 s** and reused in **≤ 0.01 s** (`time`'s resolution), four of each, warm cache, four cores. The Linux stub
  waits for the application where the Windows one exits; nothing about the Windows figures follows from these.

The installer was compiled on Linux with electron-builder's own makensis under warnings-as-errors, both the installer
and the uninstaller configuration, from a stand-in `win-unpacked` (the uninstaller extracted by electron-builder's own
`UninstallerReader` in place of wine), and **its icon group holds all seven images of `icon.ico` byte for byte**. That
proves the include compiles and the icon is wired; it proves nothing about the pages as drawn or the registry as written.

**What `pnpm package` now executes on the Windows runner** (step 3′, `release/load-proof.json` → `portableRun`): the
portable launched twice under a scratch `LOCALAPPDATA` — the stub's exit status and time, the paint, the marker, the
application's `update check:` line classifying it `portable` (so the variable reached main and the classification read
it), the artifact's directory unchanged, and **the artifact renamed aside and back while the application it started is
running** (REQ-STARTUP-125, the measurement this record's P1 failed with 79 `EBUSY`). Its result is the CI run of this
branch's pull request; this note does not claim it before it is read.

**Not measured, and owed:** an install and an uninstall on Windows (pages, `/S`, `/D=`, the two registry values);
REQ-STARTUP-156's gate on O-6's machine, including the portable's two runs there and a read-only or removable medium
proper; the run-scoped placement **under** the root (a root that accepts some writes but not a preparation) — only the
temporary-directory branch was driven; clause (d)'s "no network, no elevation" is still true by construction and not
traced; REQ-STARTUP-018's names (`../../../defects/the-installer-names-its-uninstall-entry-and-uninstaller-and-shortcuts-otherwise-than-req-startup-018.md`).
