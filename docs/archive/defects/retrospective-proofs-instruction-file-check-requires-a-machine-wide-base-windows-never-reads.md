## retrospective-proof's instruction-file check requires a machine-wide base Windows never reads

Windows-only; for the Windows session; seen on Windows 11 ARM64 (build 26200), Node 24.18.0 arm64,
`C:/dev/Rotaris-crw-wt-loc1-confinementr` at `a325a8bd` (2026-10-20, plan loc1, bundle `loc1-confinement-retro`). Recorded, not
repaired: this plan repairs no Windows-only red.

`pnpm retrospective-proof` launch 1 (`pass`) plants an `AGENTS.md` under a scratch `~/.agents` and under a scratch machine-wide base
(`ROTARIS_CAPTURE_INSTRUCTIONS_MACHINE`), and its check "the retrospective reads the workspace root's instruction files and none
from the user-global or machine-wide bases (PD-LIBRARY-002 revision 2, OQ-235)" requires the run host's enabled set to name
`machine-codex:AGENTS.md` and its read line to say "1 of 3". On win32 the machine-wide base is never read, whatever the seam names: `hasEtcHierarchy` is false there
(`packages/config/src/skills/roots.ts`), and `packages/config/src/instructions.ts` says "a platform with no `/etc` hierarchy still
reads no machine-wide file whatever this names". The run host logged "2 of 2 instruction file(s) enabled … (workspace:AGENTS.md,
user-agents:AGENTS.md)" and "1 of 2 enabled instruction file(s) at the workspace root (workspace:AGENTS.md)" — the product's
reading of the directive is met (only the root's file is handed to the capture) — and the check went red on the absent
`machine-codex:` entry and the count it changes ("1 of 2"). Red on both of this bundle's runs (base and change); every other launch-1 check passed.

## Specs

None contradicted by the product. The proof's expectation contradicts the platform rule of `PD-WORKSPACE-002`'s machine-wide base
(read only where an `/etc` hierarchy exists), which the product implements; on win32 the check could require the base's absence
instead, or name the bases this platform reads.

## Relevant files

- `apps/desktop/scripts/retrospective-proof.mjs` — launch 1's instruction-file check (`/machine-codex:AGENTS\.md/` on the enabled set).
- `packages/config/src/skills/roots.ts` — `hasEtcHierarchy`, false on win32.
- `packages/config/src/instructions.ts` — the machine-wide base, pushed only where the platform has an `/etc` hierarchy.

## Outcome — repaired 2026-11-04 (the Overview audit's execution branch, with the landing it stopped)

The check takes the platform's rule: on win32 it requires the enabled set to name the workspace's and the user-global base and no
`machine-codex:` entry, and the read line "1 of 2"; elsewhere the three bases and "1 of 3", as before. Seen again on 2026-11-04 in
`pnpm worktree:land`'s proof run on `7d3e1c3a` (Windows 11 ARM64, Node 26.13.0): the same two log lines as above, every other
check of the suite green (83 of 84), the landing stopped with nothing pushed. The first green of the repaired check: `pnpm
retrospective-proof -- --skip-build` on the same head in the branch's tree, then the landing's own run.
