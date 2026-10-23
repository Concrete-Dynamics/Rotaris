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
