## The adoption suite's symbolic-link cases fail rather than skip on a Windows host without the symlink privilege

Found 2026-10-31 by `pnpm check` on Windows 11 Home (build 26300), Node 26.13.0, Developer Mode off and the shell not
elevated, on `main` at `c583e1bc` and again on `fix/unreadable-workspace-id-is-reported` (PR #42), which does not touch the
file. Two cases of `packages/workspace/src/adoption/adoption.test.ts` go red in their setup, every run, alone or in the suite:
"never walks node_modules, hidden directories or the scope directory, and never follows a symbolic link out" (line 94) and "a
store directory that is a symbolic link out of the workspace is refused" (line 153). Each calls `symlinkSync` on a directory and
gets `EPERM: operation not permitted`: creating a symbolic link on Windows needs Developer Mode or the
`SeCreateSymbolicLinkPrivilege` an elevated shell holds.

It is the shape of
`docs/defects/fixed/the-symbolic-link-cases-fail-rather-than-skip-on-a-windows-host-without-the-symlink-privilege.md`
(2026-10-15, `observe.test.ts` and `observe-root.test.ts`), whose repair under R-074 gave those fixtures a directory junction
on Windows and a symbolic link elsewhere; the adoption suite was not in that note's scope and kept the bare `symlinkSync`. On
such a host the gate reads red for a host condition, and the two REQ-ADOPT cases they carry (a link out of the workspace is
not followed; a store directory that is a link out is refused) are silently unmeasured. The CI runner (windows-latest) holds
the privilege, so the gate there is unaffected.

Not repaired here (noticed while repairing PR #42's own Windows reds, out of that work's scope).

## Specs

REQ-ADOPT-005 to REQ-ADOPT-010 (the detection pass never follows a link out) and REQ-ADOPT-011 to REQ-ADOPT-017 (an
untrusted interpretation naming a store directory that is a link out is refused): the cases are their evidence, and on this
host they measure nothing.

## Relevant files

- `packages/workspace/src/adoption/adoption.test.ts`, lines 94 and 153: the `symlinkSync` calls.
- `packages/agent-tools/src/tools/observe.test.ts` and `observe-root.test.ts`: the junction-on-win32 fixture the earlier
  repair used, the shape a repair here would follow (a junction is a directory link Windows creates without the privilege,
  and what the detection pass meets on a Windows workspace).

## Outcome

Repaired 2026-10-31. Both `symlinkSync` calls pass a third argument, `process.platform === 'win32' ? 'junction' : 'dir'`,
the shape `observe.test.ts` and `observe-root.test.ts` took under R-074; every assertion is unchanged. Measured on the host
that found it (Windows 11 Home 26300, Developer Mode off, the shell not elevated and holding no
`SeCreateSymbolicLinkPrivilege`): before, both cases red in their setup with `EPERM: operation not permitted, symlink …`;
after, `pnpm vitest run packages/workspace/src/adoption/adoption.test.ts` is green, 29 passed and none skipped. On the same
host a junction is created without the privilege, `readdirSync`'s entry for it answers `isSymbolicLink()` true and
`realpathSync` resolves it to its target, so the product code under test — the detection walk, which skips an entry that is a
link (`detect.ts`), and the adapter's root check, which resolves the real path (`adapter.ts`, `insideRoot`) — treats a junction
exactly as it treats a symbolic link, and the two cases measure the product on a Windows workspace, where a junction is what it
carries. Nothing in the product changed. The cleanup is the suite's existing `rmSync(root, { recursive: true, force: true })`,
which removes a tree holding a junction without error on this host.
