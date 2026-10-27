# Background updates — installable from a release, downloaded by itself, applied at the next start — 8. Prior art, and why it is not the contract

Part 8 of 8 of [this document](../background-update-plan.md), which indexes every part.

## 8. Prior art, and why it is not the contract

`electron-updater`'s public documentation (electron-builder, read 2026-10-22) names the pattern this request resembles:
`autoDownload` (download as soon as an update is found), `autoInstallOnAppQuit` — since electron-builder 27 an
`autoInstallEvent` of `"onQuit"`, `"manual"` or `"onNextLaunch"` — and `quitAndInstall({ isSilent, isForceRunAfter })`, whose
NSIS form passes `--force-run` to the installer. The correspondence, and the difference:

- **`autoDownload`** ≈ REQ-STARTUP-169, but here the signature over `SHA256SUMS.txt` is verified before anything is parsed or
  downloaded, against keys compiled into the build — not a digest from a `latest.yml` beside the artifacts.
- **`autoInstallOnAppQuit` / `"onQuit"`** — install whenever the app quits — is **not** the owner's contract and is not
  built (175, UD-8 (i)). **Next start** is: the version that runs after the next start is the new one, applied by the
  launch that holds the instance record, before any work exists to interrupt.
- **`quitAndInstall`** ≈ `Restart now` (174), but behind the three guards a clicked close asks, and on the portable through
  ADR-0055's record hand-over rather than a quit.

ADR-0054's reasons for refusing `electron-updater` all still hold (extra published assets, its own verification source, a
replaced macOS bundle, channels and configurable feeds), and nothing here reopens Alternative A.
