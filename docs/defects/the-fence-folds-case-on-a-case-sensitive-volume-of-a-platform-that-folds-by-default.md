## The fence folds case on a case-sensitive volume of a platform that folds by default

Since R-091's bundle D3 (2026-11-04) the fence compares resolved paths under the rule of the platform's DEFAULT file system
(`pathRuleFor(process.platform)`, `packages/agent-tools/src/tools/fence.ts`): case folded on Windows and macOS, exact
elsewhere. A volume or directory that departs from its platform's default is read by the default: a case-sensitive APFS volume
on macOS, or a Windows directory marked case-sensitive (`fsutil file setCaseSensitiveInfo`, which WSL sets on the folders it
makes). There a sibling of the workspace root that differs from it by case alone (`/Volumes/cs/Work` beside the root
`/Volumes/cs/work`) exists as a separate directory, resolves to its own real path, and is then folded by the fence into the
root's spelling, so `../Work/secret` reads as inside and is admitted for a write.

Reasoned from the code, not reproduced on this host (Windows 11 ARM64; no case-sensitive directory was made). The bundle's
brief set the platform default as the rule; asking the root's own volume (a probe of the root's real path under a case
variant, compared by identity) would follow the file system itself.

## Specs

REQ-TOOLS-129: "a link that escapes the root resolves outside and is rejected"; a path outside the root fails with the fixed
message. A case-variant sibling is outside the root on such a volume, and it is admitted.

## Relevant files

- `packages/agent-tools/src/tools/fence.ts` — `PathRule`, `pathRuleFor`, `PLATFORM_PATH_RULE`, `isInside`, `checkFence`.
- `packages/agent-tools/src/tools/fence.test.ts` — the rules each platform is held to, injected.
