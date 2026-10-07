## An empty XDG_RUNTIME_DIR puts the instance socket in the working directory

Off Windows, the single-instance claim (`socketDirectoryFor`, `packages/platform/src/instance.ts`) takes the directory of its
hand-over socket from `XDG_RUNTIME_DIR` with `??`, so a variable that is set but empty (`XDG_RUNTIME_DIR=`) is used as it
stands: `endpointFor` answers `posix.join('', 'instance-<pid>-<nonce>.sock')`, a socket relative to whatever the process's
working directory is, and a relative value is used the same way. Seen on the built app (Linux, 2026-10-07): launched with
`XDG_RUNTIME_DIR=` from an empty scratch directory, the instance listened on `<working directory>/instance-2787-43749334.sock`
and the file was still there after the launch was stopped. A second launch from another working directory would look for the
record's endpoint by that relative path. The XDG Base Directory Specification treats a relative path as invalid, and says an
application whose `XDG_RUNTIME_DIR` is not set falls back to a replacement directory with similar capabilities.

The proof harness's comment on its short runtime directory (`apps/desktop/scripts/lib/harness.mjs`, `proofIsolationEnv`)
says "the product never reads this variable"; the claim does read it.

Noticed 2026-10-07 by the builder of finacc3's bundle `finacc3-accept1-12` while showing the empty-`XDG_CONFIG_HOME` repair
on the built app (`docs/defects/fixed/an-empty-xdg-config-home-puts-the-configuration-directory-at-a-relative-path.md`);
recorded, not repaired.

## Outcome

Repaired 2026-10-07 (fin30, branch `fin30-platform-paths`; finacc3 round 2 finding A2-05), with the deep-data-directory defect
(`docs/defects/fixed/a-deep-data-directory-leaves-the-launch-windowless.md`) by one change: `socketDirectoryCandidates`
(`packages/platform/src/instance.ts`) takes `XDG_RUNTIME_DIR` only when it is absolute, as the XDG Base Directory Specification
says of every path in its variables, so an empty or relative value is ignored and the socket goes beside the record in the data
directory, or, where that is too deep, in a private `rotaris-<uid>` below the temporary directory. No candidate is ever relative,
so the record never names an endpoint that depends on the working directory. The harness's comment (`proofIsolationEnv`,
`apps/desktop/scripts/lib/harness.mjs`) is corrected in place, the old sentence quoted beside the new one.

`XDG_RUNTIME_DIR` stays a variable the claim reads. It is a platform convention of the same kind as `XDG_CONFIG_HOME`,
`XDG_DATA_HOME` and `LOCALAPPDATA`, which REQ-STARTUP-145's "platform-conventional" locations bring with them and REQ-STARTUP-147
does not list either; it moves only the hand-over socket, never the record (REQ-STARTUP-161 keeps that in the data directory),
and it cannot start a second instance.

Pinned by `packages/platform/src/instance.test.ts`: "an empty or relative XDG_RUNTIME_DIR is ignored: the socket is never
addressed relative to the working directory" fails on the old claim (`expected false to be true` on the endpoint's being absolute;
that run left `instance-18548-1fd3bc70.sock` in the test's working directory, the worktree root, removed by hand), and the pure
candidates case holds `''`, `run` and `D:/run` out. Shown on the built app by `pnpm workspace-proof`'s scenario 13b (Linux,
2026-10-07): with `XDG_RUNTIME_DIR=` the launch from the proof's deep profile painted, its record named
`/tmp/rotaris-0/instance-30499-….sock`, a second launch was handed over through it, and no `instance-*.sock` was in the working
directory (`apps/desktop`) during the launch or after it ended. On the unrepaired base (`a68f121`) the same scenario failed: the record
named `instance-16264-230abf4f.sock`, a relative path, and that file was in `apps/desktop` while the launch ran.

## Specs

REQ-STARTUP-145 (per-user state in the platform-conventional per-user locations, never one relative to the working
directory) and REQ-STARTUP-161/164 (the single-instance record and its hand-over, which a relative endpoint makes depend on
the working directory). REQ-STARTUP-147 lists the environment variables the startup domain reads and does not name
`XDG_RUNTIME_DIR`.

## Relevant files

- `packages/platform/src/instance.ts` — `socketDirectoryFor` (`??` on `XDG_RUNTIME_DIR`) and `endpointFor`.
- `apps/desktop/scripts/lib/harness.mjs` — `proofIsolationEnv`'s comment that the product never reads the variable.
