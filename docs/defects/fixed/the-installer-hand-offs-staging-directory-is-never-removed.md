## The installer hand-off's staging directory is never removed

Noticed 2026-10-22 while reading the updater for R-084's plan; read, not run. After a verified download on the installed
flavour, `runInstall` deliberately leaves `<os temp>/rotaris-update-<random>/` in place, because the setup executable runs
from it. Nothing removes it afterwards: not the installer, not the updated build's first launch, not a later check. Each
installer update therefore leaves one installer's worth of bytes (the size of a release's setup executable) in the user's
temporary directory, until the platform's own cleanup reaches it. Never executed against a real artifact.

## Specs

- None directly: REQ-SHELL-121 bounds what a quit leaves ("no partially written and no locked file"), and this file is
  neither. REQ-STARTUP-178 (decided, R-084) requires an installer started from a pending update to be removed by the first
  launch of the updated version that paints.

## Relevant files

- `apps/desktop/src/main/updater/install.ts` — the last lines of `runInstall` (`if (applied.outcome === 'replaced') await discard();`).
- `apps/desktop/src/main/updater/electron.ts` — the staging port, `mkdtemp(join(tmpdir(), 'rotaris-update-'))`.

## Repaired — 2026-10-30

REQ-STARTUP-178's own terms, before the background-update plan's pending update exists. Immediately before the setup is
started, `runInstall`'s new `beforeHandOff` lets the updater write `<data>/updates/installer-handoff.json` (`recordHandOff`,
`install.ts`). The record holds the version being installed and the staging directory the setup runs from. A new hand-off
first removes the directory an earlier record named, so at most one is kept. A setup that cannot be started clears the
record along with its discarded staging.

At a launch's first check — the launch-time step that also runs REQ-STARTUP-115's cleanup, after the main window was
shown — `removeHandedOffStaging` removes the recorded directory and clears the record, once the running version is the
recorded one or newer. An older running version (the installer cancelled, failed or still open) removes nothing. A
removal that fails keeps the record for a later launch and is logged, not reported. Only a `rotaris-update-` directory is
ever removed on the record's word. The process that handed off never removes its own installer's directory, because the
step runs once per process, before any install. A build classified not updatable never reads the record.

Pinned in `updater.test.ts` and `install.test.ts` over fakes. Not yet executed against a real installer on a Windows host
(IC-3). Whether Windows refuses to delete the setup executable while the installer's finish page still runs it — the
case the retry exists for — is unmeasured. An installer that is cancelled leaves its directory until the next hand-off
supersedes it, or until the user next updates.
