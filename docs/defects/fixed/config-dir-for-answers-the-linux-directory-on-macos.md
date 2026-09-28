## `configDirFor` answers the Linux directory on macOS

`apps/desktop/scripts/lib/harness.mjs`'s `configDirFor(local, platform)` has two answers. On `win32` it gives
`<local>/rotaris/config`. On every other platform, `darwin` included, it gives `<local>/rotaris/config/rotaris`, the
`XDG_CONFIG_HOME` answer. On macOS the product does not read `XDG_CONFIG_HOME`. `resolveUserDirs` composes its
configuration directory from the home directory, `~/Library/Application Support/rotaris`. So on macOS every proof that
writes the scratch global configuration through `configDirFor` writes where the product never reads. That is the
defect R-062 repaired for Linux, still present for the third platform. `proof-isolation.test.ts` skips `darwin` in the
comparison that would show it ("composed from HOME, not from the pairs; not a `local`-rooted answer"), and the harness
sets `HOME` only when a caller names one. A macOS answer therefore needs the scratch home the launch was given, not
`local`.

Found 2026-09-28 in the review of R-062's proof sweep. The first-executions row for that sweep already states it as
what could not be shown. No macOS host exists (IC-3), so nothing was measured, and this is recorded, not repaired.

## Specs

None contradicted by the product. REQ-CONFIG-001 spells the macOS global scope as
`~/Library/Application Support/rotaris/`, and the product resolves exactly that. The harness's copy of the rule
disagrees with it on `darwin`, so a proof run there would produce no evidence for the configuration it writes.

## Relevant files

- `apps/desktop/scripts/lib/harness.mjs`: `configDirFor`, which gives the POSIX `XDG` answer for `darwin`.
- `packages/platform/src/dirs.ts`: `resolveUserDirs`, whose `darwin` case composes from `home`.
- `apps/desktop/scripts/lib/proof-isolation.test.ts`: the loop that `continue`s past `darwin`.

## Repaired 2026-09-28 under R-062

**What changed, in the harness only** (`apps/desktop/scripts/lib/harness.mjs`; nothing in the product moved):

- `configDirFor(local, platform, home)` takes the scratch home the launch was given and answers
  `<home>/Library/Application Support/rotaris` on `darwin`, the directory `resolveUserDirs` composes there. `home`
  defaults to `scratchHomeFor(local)` — `home` beside `local` in the scratch profile, the sibling convention `roaming`
  already follows — so the thirteen call sites that pass `local` alone (in thirteen scripts) get the answer for the home their launch now runs
  with. The Windows and Linux answers are unchanged and ignore `home`.
- `dataSubdirFor` had the same gap: `workspacesRootFor` and `tokensDirFor` gave `darwin` the `XDG_DATA_HOME` answer.
  They take the same `home` and answer `<home>/Library/Application Support/rotaris/data/{workspaces,tokens}`, which is
  `dataLayout(resolveUserDirs(darwin))`.
- `proofIsolationEnv` sets `HOME` on **every** POSIX launch: the caller's `home` when it names one, `scratchHomeFor(local)`
  otherwise. Before, it set `HOME` only when a caller named one, and only `injection-proof` did, so a macOS launch from
  any other proof would have written the operator's own `~/Library/Application Support/rotaris`. It takes the launch's
  `platform` as a parameter (default the host's) so the answer is decidable from any host; a Windows launch never gets
  `HOME`, even when a caller names one, because overriding it there kills Electron before it paints.
- `injection-proof` passes the home it hands its launch to `configDirFor` as well, which is what the rule's comment
  asks of a caller with a home of its own (its home is the default one, so the directory it names does not move).

**What pins it.** `apps/desktop/scripts/lib/proof-isolation.test.ts` no longer skips `darwin`: the loop over `win32`,
`linux` and `darwin` hands each platform the environment its launch gets and the home that launch runs with, feeds it to
`resolveUserDirs`, and asserts `configDirFor`, `workspacesRootFor` and `tokensDirFor` equal the product's answers on all
three. Two new cases pin the rest: every POSIX launch gets a scratch home (the caller's, or `scratchHomeFor(local)`)
and a Windows launch never does; and on macOS the copy follows a caller-named home and nothing else. The macOS case
that pinned "isolated only when the caller names a scratch home" now pins that the pairs alone leave a macOS launch in
the operator's directory and the harness's `HOME` moves it into the profile.

**The Linux answer is unchanged, and the new `HOME` did not disturb a Linux launch** — run as root under Xvfb, Node 24,
after one `pnpm build`, with the sweep agent's proofs running at the same time in another worktree:
`pnpm driver-proof --skip-build` 14 passed, 0 failed (Chromium created its cache under the profile's `app/home`, not
under `/root`); `pnpm settings-proof --skip-build` exit 0; and, because `HOME` now moves for launches that never had
it moved, `skills-proof` (exit 0, 7 skills discovered, the policy launch and `/skills` row as before), `config-proof`
(exit 0) and `mcp-proof` (exit 0, all nine launches, launch 9 exiting 1,024 ms after its quit).

**What could not be shown.** Nothing runs on macOS here: there is no macOS host (IC-3). The `darwin` answer is argued
from `dirs.ts` and pinned by the parameterised test, not measured. **The first macOS run must show**, for a proof that
writes the global configuration through `configDirFor` (`config-proof`, `skills-proof`'s policy launch, `mcp-proof`):
that the launch's `HOME` is the profile's `home`; that the product reads the file the proof wrote at
`<profile>/home/Library/Application Support/rotaris/`; that the workspace store appears below
`…/rotaris/data/workspaces` where `workspacesRootFor` looks; and that nothing is written below the operator's own
`~/Library/Application Support/rotaris`. It must also show that an Electron launch on macOS survives a moved `HOME`,
which on Windows it does not; if it does not, the macOS half of this repair is the thing that is wrong. The proofs
not re-run here on Linux with the moved `HOME` (every one but the five above) take it for the first time on their
next run.
