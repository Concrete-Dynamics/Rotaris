## A relative XDG_CONFIG_HOME or XDG_DATA_HOME is used as it stands

On Linux, `resolveUserDirs` (`packages/platform/src/dirs.ts`) and `resolvePreferenceRoot`
(`packages/platform/src/preferences.ts`) read `XDG_CONFIG_HOME` and `XDG_DATA_HOME` through `xdgBaseDirectory`, which since
finacc3 gives an unset or empty variable its default but passes any other value through. A relative value
(`XDG_DATA_HOME=data`) therefore puts the per-user directories relative to whatever the process's working directory is, the
harm the empty case had. The XDG Base Directory Specification says every path in these variables must be absolute and that a
relative one should be considered invalid and ignored. The two roots do not part over it: both read the same value.

A repair that ignored any value `posix.isAbsolute` refuses was tried and taken out: `apps/desktop/scripts/lib/proof-isolation.test.ts`
failed three cases ("a Linux launch opens its store under the profile…", "the harness's own directory rules agree with the
product's…", "the instance socket stays short enough…"), because the proof harness plans a POSIX launch from any host and
spells a Windows host's scratch profile as `D:/repo/.proof/…`, which a POSIX check calls relative. The repair has to settle
how those cross-host cases are spelled first.

Noticed 2026-10-07 by the builder of finacc3's bundle `finacc3-accept1-12` while repairing the empty case
(`docs/defects/fixed/an-empty-xdg-config-home-puts-the-configuration-directory-at-a-relative-path.md`); recorded, not repaired.

## Outcome

Repaired 2026-10-07 (fin30, branch `fin30-platform-paths`; finacc3 round 2 finding A2-06). The cross-host spelling was settled
first: a launch runs on the host that plans it, so a POSIX launch's scratch profile is that host's own absolute POSIX path, and
`apps/desktop/scripts/lib/proof-isolation.test.ts` now spells each platform's profile the way its own host does (`D:\repo\…` for a
Windows launch, `/repo/…` for a Linux or macOS one) instead of planning a POSIX launch from a Windows profile; `proofIsolationEnv`
(`apps/desktop/scripts/lib/harness.mjs`) refuses, loudly, a POSIX launch whose profile is not an absolute POSIX path, which a
POSIX machine would now ignore. With that settled, `xdgBaseDirectory` (`packages/platform/src/dirs.ts`) gives a value
`posix.isAbsolute` refuses its default, as the XDG Base Directory Specification says, and `resolveUserDirs` and
`resolvePreferenceRoot` both read through it. `apps/desktop/scripts/autopsy.mjs`, which copies the rule to find a store, takes the
variable only when it is absolute too.

Pinned by `packages/platform/src/platform.test.ts` ("on Linux a relative XDG variable is ignored and takes its default"), red on
the old reading (`expected { …(2) } to deeply equal { …(2) }`), and by `proof-isolation.test.ts`'s new refusal case. Shown on the
built app by `pnpm workspace-proof`'s scenario 13c (Linux, 2026-10-07): launched with `XDG_CONFIG_HOME=rel-config` and
`XDG_DATA_HOME=rel-data` from `apps/desktop`, the store, the machine identifier and the instance record were below the launch's
home (`<home>/.local/share/rotaris`) and no product directory was made in the working directory; the whole proof 58 passed,
0 failed, 2 skipped (load 4.5 to 7.7 on 4 CPUs). The same scenario on the unrepaired base (`a68f121`, a throwaway worktree with
only the proof file changed, load 5.7 to 9.3) failed it: no store under the home, and `rel-data/rotaris` made under
`apps/desktop`. Electron's own Chromium profile still went to `rel-config/Electron` in both runs: main never places it, and that is
recorded on its own (`docs/defects/fixed/electrons-own-profile-is-written-outside-the-per-user-directories.md`).

## Specs

REQ-STARTUP-145 and REQ-CONFIG-001 (the platform-conventional per-user locations, never one relative to the working
directory); the XDG Base Directory Specification (a relative path in these variables is invalid and ignored).

## Relevant files

- `packages/platform/src/dirs.ts` — `xdgBaseDirectory`, which passes a relative value through.
- `apps/desktop/scripts/lib/proof-isolation.test.ts`, `apps/desktop/scripts/lib/harness.mjs` — the cross-host cases that spell
  a POSIX launch's values from a Windows profile.
