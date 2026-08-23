---
req-id: SWR-3003
status: approved
trace: required
test: required
title: "In-App Update Notification"
epic: SWR-3000
date: 2026-08-11
---

# SWR-3003 — In-App Update Notification

When Rotaris is running as a standalone binary, it must check for a newer
version on launch by querying the GitHub Latest Release API. If a newer version
is available, the user must be shown a non-blocking notification with the options
to update immediately or be reminded on the next launch. Choosing to update must
download the correct platform artifact, verify its integrity, install it by the
means that platform actually supports, and tell the user what happens next.

The **launch-time check itself is always enabled for supported standalone desktop
builds**. Rotaris exposes no user-facing setting, persisted application option or
supported configuration switch that disables this check. This does not make
updates mandatory: downloading and installing a discovered update remains an
explicit user action.

## Scope

- **In scope**: Launch-time update check via the GitHub Releases API
  (`/repos/Concrete-Dynamics/Rotaris/releases/latest`). Version comparison between the
  running version and the release `tag_name`. A non-blocking notification with
  "Update now" and "Remind next launch" actions. Download of the artifact that
  matches how this copy was installed, SHA256 verification against the release's
  own `SHA256SUMS.txt`, and installation by the per-platform strategy in AC-011.
  Dismissed-version persistence so that "Remind next launch" suppresses the
  notification only for the same version. Graceful handling of network
  unavailability (no notification, no error). The update check itself has no
  user-facing opt-out.
- **Out of scope**: Update checks for pip-installed Rotaris (users update via
  `pip install --upgrade`) and for the two console binaries — the notification is
  a desktop surface. Background periodic checks during a running session. Delta /
  binary-patch updates. Rollback on failed launch after update. Forced / security
  updates that install without user consent. Any distribution channel other than
  GitHub Releases.

## Acceptance criteria

**Detection**

- **AC-001**: The update check runs only when Rotaris detects it is running as
  a standalone binary (e.g., `sys.frozen` or equivalent PyInstaller runtime
  marker). Pip-installed instances skip the check entirely.
- **AC-002**: On every launch of a supported standalone desktop build, the app
  fetches the latest release from the GitHub API with a reasonable timeout (≤10
  seconds). If the network is unreachable or the request times out, the app starts
  normally without any notification or error.
- **AC-003**: If the API returns a non-200 status or malformed response, the
  app logs the failure and starts normally without user-visible disruption. This
  includes the 404 returned while the repository has no release at all, and the
  403 returned when the unauthenticated rate limit is exhausted.
- **AC-004**: The running version is compared to the release `tag_name` using
  semantic versioning. Pre-release tags and drafts are ignored — SWR-3002's tag
  grammar already rejects anything but `v<major>.<minor>.<patch>`, so this is one
  rule enforced in one place rather than restated here.
- **AC-015**: No Settings control, persisted user preference or supported desktop
  configuration option can disable the standalone launch-time update check. Test
  seams may replace the release source, but production user configuration cannot
  suppress the check.

**Notification**

- **AC-005**: If the latest release version is greater than the running
  version, a non-blocking notification appears after the main window is visible.
  It must not block interaction with the rest of the application.
- **AC-006**: The notification offers two explicit actions: "Update now" and
  "Remind next launch." Closing it without choosing an action is equivalent to
  "Remind next launch."
- **AC-007**: Choosing "Remind next launch" dismisses the notification and
  persists the dismissed version identifier. On the next launch the update check
  still runs. If the latest version equals the dismissed version, no notification
  is shown; if a newer version exists, the notification appears again.
- **AC-008**: The notification displays the new version number and a brief
  summary of changes (the first sentence or bullet from the release body, if
  available).

**Download & install**

- **AC-009**: Choosing "Update now" downloads the artifact matching this
  installation — not merely this platform — to a temporary directory. Progress is
  shown to the user.
- **AC-010**: After download, the artifact's SHA256 hash is verified against the
  `SHA256SUMS.txt` published with the release. A mismatch aborts the update with a
  user-visible error and leaves the current installation intact. This establishes
  integrity, not authenticity: nothing Rotaris ships is signed (SWR-3001), so a
  matching hash proves the bytes are the ones the manifest names and nothing more.
- **AC-011**: On successful verification, the update is installed by the strategy
  that the installation flavour actually supports (amended 2026-08-13 — the
  original text named one strategy per operating system, which is the wrong axis:
  Windows ships two flavours and macOS ships an unsigned one):
  - **Linux AppImage** — the downloaded AppImage replaces the file named by the
    `APPIMAGE` environment variable and is made executable. Legal while running:
    the mounted inode outlives the rename.
  - **Windows portable** — the running `.exe` is renamed aside and the new one
    moved into its place. Windows forbids overwriting a running image but permits
    renaming it; the leftover is deleted on the next launch.
  - **Windows installed** — the verified `setup.exe` is launched and Rotaris
    closes. The onedir tree under `%LOCALAPPDATA%` holds loaded DLLs that nothing
    can replace in place, and the NSIS installer already owns shortcuts, uninstall
    registry keys and stale-file removal; reimplementing that as a file-by-file
    swap would leave a half-updated install behind.
  - **macOS** — the verified DMG is mounted and revealed to the user, who drags
    the app to Applications as they did on first install. Replacing the bundle
    automatically is not shipped because the app is unsigned and un-notarized: a
    DMG the app downloads itself carries `com.apple.quarantine`, and a bundle
    swapped in under that attribute is refused by Gatekeeper as damaged. This is
    revisited together with code signing.
- **AC-012**: A failed installation (permissions, disk space, filesystem error)
  is reported to the user with a clear message. Nothing is moved or renamed until
  the replacement has been downloaded and verified, so a failure at any point
  leaves the current installation exactly as it was.
- **AC-013**: After a strategy that replaced the binary in place, the user is
  shown a "Restart now / Later" prompt. "Restart now" terminates the current
  process and launches the new binary; "Later" dismisses the prompt and the new
  binary runs on the next manual launch. The two hand-off strategies in AC-011
  (Windows installed, macOS) invert this ordering by necessity — the application
  closes or steps aside *before* the install happens — and say so in the message
  rather than promising a restart they do not control.

**Version resolution**

- **AC-014**: The desktop version is the reference for comparison and its
  artifact is the download target. Since SWR-3002 the two packages carry one
  product version, so this cannot disagree with `rotaris-core`; the rule is kept
  because the desktop is the surface that shows the notification.

## Test portfolio

| Level         | Productive scenario                                                                                                                              | Exercised boundary                                        | Planned/covering test                        |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- | --------------------------------------------- |
| Unit          | A pip install never checks; every supported frozen flavour checks on launch; each frozen flavour identifies itself from the markers it actually has; a user is offered a newer version and not an older, equal or pre-release one; the offered download is the one their install can use; a checksum manifest round-trips with the one the release wrote | `detect_install`, `is_newer`, `asset_for`, `parse_checksums` | `tests/unit/updates/test_update_check.py`     |
| Unit          | No persisted desktop setting can suppress the release check; test injection can replace the release source without becoming a production opt-out | update configuration boundary | `tests/unit/updates/test_update_check_policy.py` |
| Unit          | A tampered download is refused and deleted; each flavour's install strategy does what that platform permits and nothing else                      | `verify`, `apply_update`                                    | `tests/unit/updates/test_update_apply.py`     |
| Integration   | A launch with no network, with no release published yet, with the rate limit exhausted, and with a truncated response body all start the app silently | `latest_release` over HTTP (`respx`)                        | `tests/integration/test_update_api.py`        |
| Integration   | The whole download → verify → install path over a real temporary filesystem, including the mismatch that must leave the install untouched         | `stage` → `verify` → `apply_update`                         | `tests/integration/test_update_download.py`   |
| User-flow E2E | An outdated build checks on every launch; "Remind next launch" suppresses only that version's notification, a newer one shows again, and "Update now" ends in a restart prompt | `MainWindow` + `UpdateBridge` with an injected release source | `apps/rotaris/tests/test_update_ui.py`        |

Dismissal is desktop state in `QSettings`, so its test lives with the desktop
suite rather than in `tests/unit`. The rest of the logic is in
`src/rotaris_core/updates/`, deliberately outside `rotaris_core.packaging`, which
stays stdlib-only because SWR-3002's release workflow runs it on a bare runner.

Epic: [Distribution & Updates](../3000-distribution-updates.md)
