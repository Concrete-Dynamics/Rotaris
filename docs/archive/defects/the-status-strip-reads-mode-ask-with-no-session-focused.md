## The status strip reads `mode: ask` whenever no session is focused

With no session focused, the status strip's permission item falls back to the literal `ask`, whatever preset is
configured or in force. In the live run it read "no session · mode: ask" while the workspace's configuration set
`runtime.permission_mode: autonomous` and a session was executing autonomously. The strip is a permanent safety
indicator, and it understated the mode.

Live-run finding: L7 (live runs of 2026-09-29)

## Specs

- `REQ-TOOLS-184`: the strip shows `mode: <preset>` permanently; the preset shown is not the one configured.

## Evidence

- Pack `.live-run/runs/2026-09-29T02-41-56-779Z/` (the sweep worktree; git-ignored): `shell/shell.png`, `requirements/requirements.png` and `requirements.early.png` read "no session · mode: ask";
  `agents.yaml` sets `runtime.permission_mode: autonomous`; session `360c8ac1` ran autonomous.

## Relevant files

- `apps/desktop/src/renderer/main.tsx:1181` — `` `mode: ${session?.permissionMode ?? 'ask'}` ``.
- `apps/desktop/src/renderer/main.tsx:1035` — the configured preset, read only for the launch dialog.

## Outcome

**Repaired 2026-09-29 under R-067.** The strip's permission item is now `statusStripModeItem`
(`packages/ui/src/composer.ts`), a function of two values:

- the focused session's own mode;
- with no session focused, the configured preset (`runtime.permission_mode` from the configuration snapshot). That is
  the preset the next run starts from, which the composer's mode chip already names (REQ-CONFIG-288's reading).

Before any configuration has been read, a missing key resolves to REQ-TOOLS-046's shipped default through
`resolvePreset`. That is the one case in which `ask` is still shown without being configured. The shell (`App` in
`apps/desktop/src/renderer/main.tsx`) reads the snapshot through `useConfigSnapshot`, which re-reads on every
configuration change.

**Pinned by** the REQ-TOOLS-184 case in `packages/ui/src/composer.test.ts`. It covers `autonomous` and `restricted`
configured with no session, a focused session's own mode over a different configured one, and the default when
nothing is read. The case was red against the old literal fallback, receiving `mode: ask` where it expected
`mode: autonomous`.

**Built-app evidence (`pnpm app:drive`):** the workspace's `agents.yaml` set `runtime.permission_mode: autonomous`
and no session was focused.

- The unrepaired build's strip read `no session · … · mode: ask`.
- The repaired build's strip read `no session · … · mode: autonomous` (screenshot taken).
- After a `config.setField` to `restricted`, the repaired strip read `mode: restricted` with no relaunch.

**Live evidence:** `pnpm live-run --only=requirements` passed against the `katalyst` endpoint (pack
`.live-run/runs/2026-09-30T00-51-42-344Z/` of the `fix-status-text` worktree; git-ignored). The finding was measured
on the same scenario, whose `agents.yaml` sets `runtime.permission_mode: autonomous`. Its `requirements.early.png`
(the board run executing) and `requirements.png` (after the accept) now both read `no session · main · mode:
autonomous`, where the 2026-09-29 pack read `mode: ask`.
