## The preference root honours `XDG_CONFIG_HOME` on every platform, where OQ-33 was ruled Linux-only

OQ-33 was ruled on 2026-10-06 (R-071) as "keep it Linux-only, as built": the configuration-home variable
`REQ-UIBENCH-039` names is honoured on Linux alone, the benchmark-private variable carrying the same job elsewhere. The
build does not match that reading for the desktop preference store. `resolvePreferenceRoot` reads the benchmark override,
then `XDG_CONFIG_HOME`, and only then branches by platform, so a Windows or macOS user whose environment sets
`XDG_CONFIG_HOME` (common under MSYS2, Cygwin or a cross-platform shell setup) has the preference store moved under it.
`resolveUserDirs`, which places the configuration and data directories, honours it on Linux alone, so on those two
platforms the preference store and the rest of the per-user state can part.

Noticed 2026-10-06 while ruling OQ-33 (fin20); not repaired, since the ruling task changes no product code. The ruling
entry records the difference.

## Specs

OQ-33 as ruled; REQ-UIBENCH-039; ADR-0042's resolution order ("benchmark override, configuration home, then the
platform's machine-local settings location"), which states the order without restricting the middle step to Linux;
REQ-STARTUP-145's per-user location.

## Relevant files

- `packages/platform/src/preferences.ts` — `resolvePreferenceRoot`: `XDG_CONFIG_HOME` is read before the platform branch.
- `packages/platform/src/dirs.ts` — `resolveUserDirs`: `XDG_CONFIG_HOME` and `XDG_DATA_HOME` are read in the Linux
  (`default`) branch only.

## Outcome

Repaired 2026-10-06 (fin22, bundle `fin22-window-strip-config`). `resolvePreferenceRoot`
(`packages/platform/src/preferences.ts`) reads `XDG_CONFIG_HOME` in its Linux branch alone (the branch `resolveUserDirs`
reads it in, everything but Windows and macOS), after the benchmark override and never on Windows or macOS, where the
benchmark-private variable `ROTARIS_PREFERENCES_ROOT` carries the job, as OQ-33 was ruled. ADR-0042's first-execution
paragraph keeps its old order beside the correction; the process and state-ownership views say "config home (Linux)".

Pinned by `packages/platform/src/platform.test.ts` ("honours the configuration-home variable on Linux alone"), which
switches the platform parameter across Linux, Windows and macOS with `XDG_CONFIG_HOME` set, checks the benchmark override
wins on each, and that the preference store and `resolveUserDirs`' configuration directory honour the variable on the same
platforms; it fails on the previous code (Windows answered `\x\cfg\Rotaris\Rotaris`). `pnpm config-proof` passes on this
Linux host, where the answer is unchanged; the Windows and macOS answers are pinned by the unit test only, since this host
runs neither.
