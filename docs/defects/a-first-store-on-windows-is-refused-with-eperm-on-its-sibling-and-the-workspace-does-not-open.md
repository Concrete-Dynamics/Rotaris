## A first store on Windows is refused with EPERM on its sibling, and the workspace does not open

The Windows ARM64 session's C5 ran `pnpm part-j-proof` five times (Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64,
Electron 44.1.1 arm64, dev tree, Git Bash, at `51d85dd7`; each run started once the host's CPU read under 40% three times
running). On four of the five, the `pause` scenario's launch — a fresh profile, a workspace never opened before — could not
make its first store:

```
workspace.open refused: {"kind":"refused","code":"request.failed","headline":"Error: EPERM, Permission denied: \\?\<profile>\local\rotaris\data\workspaces\.<id> '\\?\<profile>\local\rotaris\data\workspaces\.<id>'"}
```

`.<id>` is OQ-281's first-store sibling (`firstStoreSibling`, `packages/store/src/layout.ts`). The application went on with no
workspace open ("run refused before start: no workspace is open"), its Pause and Continue never appeared, and the proof
stopped at "expected one workspace database … found 0". The other scenarios of the same runs (`queue`, `steer`,
`steer-early`, and on the fifth run every scenario through the two-window launch) made their first stores without a word,
and it was always `pause`. Why that one, and what held the sibling, is not established.

What is established: the message's shape (`EPERM, Permission denied: <path> '<path>'`) is the one Node 24's `rmSync` raises,
not `renameSync`'s (`EPERM: operation not permitted, rename '…' -> '…'`). `installFirstStore` removes the sibling in three
places, `maxRetries: 3` each: before it makes the sibling, in the create's `catch`, and after its five rename attempts
(`INSTALL_TRIES`, 50 ms apart) when the last is refused. So either a removal of a sibling something still held was refused,
or the rename was refused past its 250 ms and the removal that follows it was refused too and replaced the rename's error.
That masking is the same shape the repaired `a-first-store-at-247-to-251-characters-cannot-be-created-on-windows.md` names
for the create's `catch`, left in the rename's. A scratch reproduction outside the application (a sibling directory, a
WAL-mode SQLite file created and closed in it, `origin.txt` written, renamed at once; 80 times, in the proof's directory and
in a scratch directory) was never refused, so the holder is in the application's own launch or in what the host does to a
launch, not in the sequence alone.

## Specs

REQ-SESSION-043 (the store is created at a workspace's first open) and OQ-281's ruling (a first store is made whole in its
sibling and renamed into place, retrying a refusal the platform makes transiently): a refusal that outlasts the retries
leaves a workspace that does not open, on a fresh profile, four times in five here. REQ-SESSION-202's empty place did not
occur; the place stayed absent, as OQ-281 intends.

## Relevant files

- `packages/store/src/resolve.ts` — `installFirstStore`: the three removals, the rename's five tries, the removal after them
  whose error replaces the rename's.
- `packages/store/src/layout.ts` — `firstStoreSibling`.
- `apps/desktop/src/main/index.ts` — logs `workspace.open refused` and goes on with no workspace.
- `apps/desktop/scripts/part-j-proof.mjs` — the `pause` scenario, the launch that met it.
