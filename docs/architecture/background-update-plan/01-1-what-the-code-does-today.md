# Background updates — installable from a release, downloaded by itself, applied at the next start — 1. What the code does today

Part 1 of 8 of [this document](../background-update-plan.md), which indexes every part.

## 1. What the code does today

Read, not run, on `main` at `b0d1b3ff` (2026-10-22). Paths are under `apps/desktop/src/main/updater/` unless named.

| Fact | Where |
|---|---|
| The check runs from every window's post-show activation, once per window; one operation (check or install) in flight | `index.ts:1550`; `updater.ts:504` (`activate`), `:286` (`guard`) |
| **The download starts only on a click.** `install()` refuses unless an offer is held, and is reached only through the notice's `Update now` / `Try again` (`update.install`) | `updater.ts:520`; `commands/update.ts:13` |
| The download notice keeps the offer's identity, `Downloading Rotaris {v}`, not persistent, **its one action `Update now` disabled** — there is no cancel | `updater.ts:249` (`downloadingFace`) |
| The install sequence is REQ-STARTUP-122's: manifest and signature fetched (each read whole, at most 1 MiB), signature verified, then parsed, then the asset streamed in 1 MiB chunks and hashed as written | `install.ts:114`, `:68` (`SMALL_RESPONSE_LIMIT`); `download.ts:30` |
| **The asset stream is not bounded** by the size the feed states: a body of any length is written to disk before the digest can refuse it | `download.ts:30` (`streamInChunks`) — [note](../../defects/the-update-download-writes-whatever-length-the-server-sends.md) |
| **Staging is the platform's temporary directory** (`<os temp>/rotaris-update-*`), created fresh per attempt; **nothing is persisted** — no pending record, no download survives the process | `electron.ts:105`; `install.ts:134` |
| The apply follows the verified download at once. **Portable:** the artifact is swapped while the application runs — copy to `<name>.update`, delete the old backup, rename the target to `<name>.old`, rename the new file in; `Update installed` + `Restart now` | `strategies.ts:67`; `updater.ts:395` |
| **Between those two renames the artifact's path names nothing.** A process ended there leaves only `<name>.old` and `<name>.update`, and no launch can repair it, since the file a user starts is gone | `strategies.ts:92`, `:98` — [note](../../defects/the-portable-swap-leaves-the-artifact-path-empty-between-its-two-renames.md) |
| **Installer:** the verified setup is started with no arguments (its own pages, if any), `Finish the update`, and every window closes 1200 ms later; the setup's staging directory is left in the temporary directory and nothing ever removes it | `strategies.ts:113`; `updater.ts:404`; `install.ts:197` — [fixed note](../../defects/fixed/the-installer-hand-offs-staging-directory-is-never-removed.md) |
| `Restart now` exists for the in-place flavour only; it is REQ-STARTUP-121's hand-over through the instance record to a successor started with `builtin:update-successor` | `updater.ts:547`, `:412`; `successor.ts`; `index.ts:537` |
| The guards a clicked close asks — unsaved settings (OQ-311), worktree integration (OQ-361), the active-run box (OQ-86) — are asked at the click and again immediately before the hand-off, for `Restart now` and for the installer's `Update now` / `Try again` | `updater.ts:492` (`confirmAtHandOff`), `:156` (`mustAskAtHandOff`) |
| A quit waits at most 5000 ms for update work, then aborts a download and discards its partial file | `index.ts:2011`; `updater.ts:583` |
| The classification reads the artifact (never the running image); a packaged Windows build is **installed** only if `HKCU\Software\Rotaris\InstallDir` exists and contains the artifact | `classify.ts:121` |
| **The installer was one-click** and, on `b0d1b3ff`, was not measured to write `InstallDir`. electron-builder's one-click NSIS installs under `%LOCALAPPDATA%\Programs\…`; a build it installs then classifies itself **not updatable** and never checks. Repaired on `main` on 2026-10-23 (`nsis.oneClick: false`, `apps/desktop/resources/installer.nsh` writing `HKCU\Software\Rotaris\InstallDir`) and not yet measured on a real artifact | `electron-builder.yml:79` — [fixed note](../../defects/fixed/the-windows-installer-is-one-click-with-no-pages-and-no-directory-choice.md) |
| The compiled-in key set is **empty** (O-2): every install refuses at the signature, nothing downloaded | `keys.ts:36` |
| The portable artifact **does not exist**: its launcher stub (first-release plan §4.5) is unbuilt, so only the installer can be released | [`first-release-plan.md`](../first-release-plan.md) §4.5 |
| Never executed against a real artifact: a check reaching the endpoint, an offer, a download, either apply, the restart between two processes | ADR-0054 "The updater", *What was executed, and what was not* |

A development launch and every proof are classified not updatable and issue no request (`pnpm updater-proof`). Development
launches resolve the same per-user directories an installed build does (`packages/platform/src/dirs.ts`), which is why
REQ-STARTUP-173 requires a not-updatable build to leave a pending update untouched.

---
