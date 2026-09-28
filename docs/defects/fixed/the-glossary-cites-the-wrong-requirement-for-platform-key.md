## The glossary cites the wrong requirement for "Platform key"

`packages/shell/CONTEXT.md` defines **Platform key** as "the per-platform selector a manifest's artifacts are chosen by"
and cites `REQ-STARTUP-059`. `REQ-STARTUP-059` is the tool-server package-pin discipline and does not use the term. The
requirement that owns it is `REQ-STARTUP-060`, which fixes the three keys (`windows-x64`, `macos-arm64`, `linux-x86_64`),
the raw `<os>-<machine>` fallback, and that the keys are shared between release artifact naming, updater asset selection
and manifest artifact selection. The glossary's definition is also narrower than the requirement: it names only the
manifest's use, not artifact naming or the updater. An agent that looks the word up from the glossary is sent to the wrong
requirement, and reads a meaning that leaves out two of the key's three uses.

The entry predates the setup manifest. Noticed 2026-09-28 by the independent verification of the setup-manifest item
(first-release-plan.md §4.1, R-062) and recorded by its repair; not repaired there, because the glossary is outside the
item.

## Specs
Contradicts `REQ-STARTUP-060` (the term's owner, and the three uses it names). The glossary's rule (`CONTEXT-MAP.md`: each
entry cites its owning `REQ-<DOMAIN>-<NNN>`) is the one broken.

## Relevant files
- `packages/shell/CONTEXT.md` — the "Platform key" entry, citing `REQ-STARTUP-059`.
- `docs/spec/11-startup-distribution-updates.md` — `REQ-STARTUP-059` and `REQ-STARTUP-060`.
- `tools/release-naming/src/index.ts` and `packages/config/src/setup-manifest.ts` — the two `PLATFORM_KEYS` lists, held
  equal by `tools/release-guard/src/pins.test.ts`.

## Repaired 2026-09-28 under R-062

The entry now cites `REQ-STARTUP-060` and states what the requirement says the key is: the selector shared by release
artifact naming, updater asset selection and manifest artifact selection — one of the three fixed keys, or the raw
`<os>-<machine>` fallback. The definition states what the key **is**; the three key values and the fallback's shape
stay in the requirement, per `CONTEXT-MAP.md`'s rule ("Rules, defaults, figures and shapes stay in `docs/spec/`").
No code changed and no test pins it: the glossary is prose with no reader in the build, and `pnpm symbols` holds only
that the identifier it cites exists. Verified by reading `REQ-STARTUP-060` in `docs/spec/11-startup-distribution-updates.md`
against the entry, and by `tools/check-record-links.mjs` over the glossary (the entry carries no link).
