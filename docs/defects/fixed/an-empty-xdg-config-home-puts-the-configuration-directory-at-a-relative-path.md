## An empty XDG_CONFIG_HOME puts the configuration directory at a relative path

On Linux, `resolveUserDirs` (`packages/platform/src/dirs.ts`) takes `XDG_CONFIG_HOME` with `??`, so a variable that is set
but empty (`XDG_CONFIG_HOME=`) is used as it stands: the configuration directory becomes `join('', 'rotaris')`, the
relative path `rotaris`, resolved against whatever the process's working directory is. `XDG_DATA_HOME` is read the same
way, so an empty one puts the data directory at a relative `rotaris` too. The XDG Base Directory Specification, which the
Linux spelling follows, says a variable that is "either not set or empty" takes its default (`$HOME/.config`,
`$HOME/.local/share`).

The desktop preference root (`resolvePreferenceRoot`, `packages/platform/src/preferences.ts`) reads the same variable with
`||` and so falls back to `~/.config` on an empty one: with `XDG_CONFIG_HOME=` the two part, the preference store under
`~/.config/Rotaris/Rotaris` and the rest of the per-user state under a relative `rotaris`. The platform-switch test
beside them (`packages/platform/src/platform.test.ts`, "honours the configuration-home variable on Linux alone") asserts
that the two never part for a set variable and does not cover the empty string.

Noticed 2026-10-06 by the verifier of fin22's bundle `fin22-window-strip-config`, which made the preference root read the
variable on Linux alone (OQ-33); recorded by that bundle's repair round, not repaired.

## Outcome

Repaired 2026-10-07 (finacc3, acceptance finding F06). `xdgBaseDirectory` (`packages/platform/src/dirs.ts`) is now the one
reading of an XDG base-directory variable: a value that is unset or empty takes its default, as the XDG Base Directory
Specification says ("either not set or empty" takes the default). `resolveUserDirs`'s Linux branch reads `XDG_CONFIG_HOME` and `XDG_DATA_HOME` through it, and
`resolvePreferenceRoot` (`packages/platform/src/preferences.ts`) reads `XDG_CONFIG_HOME` through it too, so the preference
store and the configuration directory can no longer part over the variable's value. Pinned by
`packages/platform/src/platform.test.ts` ("on Linux an empty XDG variable takes its default, as the XDG Base Directory
Specification says (REQ-CONFIG-001, REQ-STARTUP-145)"), which fails on
the old `??` reading (`expected 'rotaris' to be '/home/me/.config/rotaris'`) and also holds the two roots together for an
unset, empty and absolute value. Shown on the built app (Linux, 2026-10-07, load about 2 on 4 CPUs), launched for
40 s under `xvfb-run` with `env -i`, an isolated `HOME`, `XDG_CONFIG_HOME=` and `XDG_DATA_HOME=`, from an empty scratch
working directory. The unrepaired build (the branch's base, `b888b8d`; no `XDG_RUNTIME_DIR`, so the instance socket sat
beside the data) wrote `machine-id`, `instance.json`, `workspaces/` and its socket to `<working directory>/rotaris/`, while
its preference store went to `$HOME/.config/Rotaris/Rotaris/`. The repaired build (with a short `XDG_RUNTIME_DIR` for the
socket, as the proof harness sets one, since the scratch data directory's own path overflows the 108-byte socket cap) wrote
`machine-id`, `instance.json` and `workspaces/` to `$HOME/.local/share/rotaris/`, its preference store to the same
`$HOME/.config/Rotaris/Rotaris/`, nothing under the working directory, and loaded its main window.
A relative value, which the same specification calls invalid, is not part of this repair: a first attempt rejected any value
`posix.isAbsolute` refuses, and `apps/desktop/scripts/lib/proof-isolation.test.ts` failed three cases, since the proof harness
models a POSIX launch planned from a Windows host with values like `D:/repo/.proof/…`. It is recorded on its own
(`docs/defects/a-relative-xdg-config-home-or-xdg-data-home-is-used-as-it-stands.md`).

## Specs

REQ-CONFIG-001 (the global scope on Linux is `~/.config/rotaris/`, the conventional user configuration directory) and
REQ-STARTUP-145 (the per-user location); the XDG Base Directory Specification (an empty variable takes its default).
REQ-UIBENCH-039 sets `XDG_CONFIG_HOME` for a benchmark iteration and is not affected.

## Relevant files

- `packages/platform/src/dirs.ts` — `resolveUserDirs`'s Linux branch, `??` on `XDG_CONFIG_HOME` and `XDG_DATA_HOME`.
- `packages/platform/src/preferences.ts` — `resolvePreferenceRoot`'s Linux branch, `||` on `XDG_CONFIG_HOME`.
- `packages/platform/src/platform.test.ts` — the platform-switch test that pins the two together for a set variable only.
