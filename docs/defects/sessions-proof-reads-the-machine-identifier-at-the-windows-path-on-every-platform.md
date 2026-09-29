## sessions-proof reads the machine identifier at the Windows path on every platform

`pnpm sessions-proof` exits 1 on Linux in about 31 s, deterministically, in both of the sweep's runs on 2026-09-28.
It crashes with `ENOENT` while planting the sessions for launch 4, `repair-all`. Its `machineId()` reads
`<local>/rotaris/data/machine-id`, which is where the product keeps the identifier on Windows only.

The product writes the identifier at `dataLayout(resolveUserDirs()).machineId`, which is `join(dirs.data, 'machine-id')`
(`packages/platform/src/dirs.ts`, minted by `readOrMintMachineId` in `apps/desktop/src/run-host/host.ts`). `dirs.data`
is different on each platform:

- on Windows, `%LOCALAPPDATA%\rotaris\data`;
- on Linux, `$XDG_DATA_HOME/rotaris`, so the file is `<local>/rotaris/data/rotaris/machine-id` under the harness's
  `XDG_DATA_HOME=<local>/rotaris/data`;
- on macOS, `~/Library/Application Support/rotaris/data`.

The file existed at the Linux location in the sweep's profile. The script's Windows spelling is a literal in the
script: `harness.mjs` already has a tested copy of the product's directory rule for the other sub-locations
(`workspacesRootFor`, `tokensDirFor`), but none for the machine identifier.

The identifier is `host` in the planted `C-deadlock` and `D-live` locks. With it unreadable, `repair-all` and every
launch after it went unmeasured on Linux: `export-records`, `export-trajectory`, `unreadable`, `delete`, `isolated`
and `delete-isolated`. The three launches before it passed in both runs.

## Specs

The harness contradicts no requirement of the product. It fails to measure REQ-SESSION-057, REQ-SESSION-059,
REQ-SESSION-060 and REQ-GIT-160 (launch 4) and everything after on any platform but Windows. REQ-SESSION-046 fixes the
identifier's location: "the machine-local location the store lives in (REQ-STARTUP-145)". The product keeps it there,
beside `workspaces/`, and the proof looks for it elsewhere.

## Relevant files

- `apps/desktop/scripts/sessions-proof.mjs`: `machineId()`, the literal `join(local, 'rotaris', 'data', 'machine-id')`.
- `apps/desktop/scripts/lib/harness.mjs`: `workspacesRootFor` and `tokensDirFor`, the copies of the product's rule
  that the machine identifier lacks.
- `apps/desktop/scripts/lib/proof-isolation.test.ts`: checks those copies against `resolveUserDirs`/`dataLayout` on
  all three platforms.
- `packages/platform/src/dirs.ts`: `dataLayout().machineId`, the product's answer.
