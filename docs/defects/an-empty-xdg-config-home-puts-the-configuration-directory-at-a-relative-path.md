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

## Specs

REQ-CONFIG-001 (the global scope on Linux is `~/.config/rotaris/`, the conventional user configuration directory) and
REQ-STARTUP-145 (the per-user location); the XDG Base Directory Specification (an empty variable takes its default).
REQ-UIBENCH-039 sets `XDG_CONFIG_HOME` for a benchmark iteration and is not affected.

## Relevant files

- `packages/platform/src/dirs.ts` — `resolveUserDirs`'s Linux branch, `??` on `XDG_CONFIG_HOME` and `XDG_DATA_HOME`.
- `packages/platform/src/preferences.ts` — `resolvePreferenceRoot`'s Linux branch, `||` on `XDG_CONFIG_HOME`.
- `packages/platform/src/platform.test.ts` — the platform-switch test that pins the two together for a set variable only.
