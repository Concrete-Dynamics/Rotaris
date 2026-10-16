## The symbolic-link cases fail rather than skip on a Windows host without the symlink privilege

Found 2026-10-15 by the full suite on Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, Electron 44.1.1 arm64, dev
tree, pwsh 7.6.7, Developer Mode off and the shell not elevated, at `b9e30052` (A1 of the Windows ARM64 session). Two cases
go red in their setup, every run: `observe.test.ts`'s "a sibling's write noted against the real path is left out when the
root is given through a symbolic link (fin36)" and `observe-root.test.ts`'s "a workspace whose two resolutions differ is
walked …". Each calls `symlinkSync` on a directory and gets `EPERM: operation not permitted`: creating a symbolic link on
Windows needs Developer Mode or the `SeCreateSymbolicLinkPrivilege` an elevated shell holds.

They measure nothing of OQ-245 on such a host and read as a failure of it. Other suites here skip on what the host cannot
give (`it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)` for permission refusals); these two neither skip
nor try a junction, which Windows creates for a directory without the privilege.

Not repaired (record-only; it is host-dependent, and E5 of the session runs them with the privilege).

## Specs

None. OQ-245's cases are the evidence for `observeReach` taking its root in the native spelling, and here they are
silently unmeasured.

## Relevant files

- `packages/agent-tools/src/tools/observe.test.ts` (line 103) and `packages/agent-tools/src/tools/observe-root.test.ts`
  (line 37): the `symlinkSync` calls.

## Outcome

Repaired 2026-10-16 under R-074. Both fixtures use directory junctions on Windows and directory symbolic links elsewhere. The original two cases fail EPERM on this host; the repaired cases run and pass without elevated privileges or skips. The observation and exclusion assertions are unchanged.
