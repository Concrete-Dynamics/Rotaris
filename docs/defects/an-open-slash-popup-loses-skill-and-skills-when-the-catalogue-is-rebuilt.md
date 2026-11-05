## An open slash popup loses /skill and /skills when the catalogue is rebuilt

The composer's catalogue registry is a memo (`buildCatalogue`, `packages/ui/src/WorkspaceView.tsx`) rebuilt whenever the
stash count, the reachable set or the command context changes. `buildCatalogue` (`packages/ui/src/slash/catalogue.ts`) puts
the built-ins, the palette mirrors, the cached skill commands and the cached prompt-file commands on the new registry, but
the two fixed skill commands REQ-CHAT-162 names, `/skill <path>` and `/skills`, are registered only by effects in
`packages/ui/src/slash/controls.tsx`. The popup's list is a memo of the text and the registry, so when a rebuild lands while
the popup is open, the list is computed from a registry that does not yet hold the two, and the effects that register them
afterwards do not recompute it: `/skill` and `/skills` disappear from the open popup until the next keystroke. This is the
AO-2 shape `buildCatalogue`'s own comment describes ("a command registered only by an effect is invisible until the next
keystroke"), which the skill and prompt-file commands were repaired for and the two fixed commands were not.

Seen 2026-11-04 on Windows 11 ARM64 (Node 26.13.0, CPU load 69 %, no other Electron running) in `pnpm slash-proof
--skip-build` on branch `hrda-accept1-4` (acceptance hrda AF-16's repair): the eval at 2400 ms listed 37 rows ending in
`skill`, `skills`, with `/worktree` unavailable ("No git service is available for this workspace."); the workspace service's
git view arrived at 2406 ms; the inspect at 2500 ms found 35 rows, `/worktree` available and no `/skill` or `/skills`, and the
proof stopped at "expected every command listed (≥ 27 rows: 15 built-ins + the palette mirrors); got 37" (the eval and the
inspect disagreeing). It depends on the git view landing between the two reads, so a run where it lands earlier passes that
check; this one is the first reading of it. Not caused by that branch's change, which moves only the proof's home.

Seen twice more on 2026-11-05 on the same host, by the bundle's review on `hrda-accept1-4` rebased onto `70436c90`
(`pnpm slash-proof --skip-build`, CPU load 62 % and 77 %, no other Electron running): both runs stopped at line 300, "the
built-ins and mirrors carry the action badge and the two fixed skill commands the skill badge — no other kind: action". In
both, the second git view arrived about 270 to 300 ms before the eval at 2400 ms, and the eval and the inspect at 2500 ms
agreed on 35 rows with no `/skill` or `/skills`. So a rebuild while the popup is open loses the two from both reads, not only
from the second, and on this host it now stops every run of the catalogue launch. A Linux launch has always run with no skill
discovered, as every launch here does since AF-16's repair, so the reading is not that repair's; it was hidden on Windows by
the operator's own skill (perhaps because its registration re-rendered the popup; not traced).

## Specs

REQ-CHAT-024 ("a bare `/` lists everything") and REQ-CHAT-162 (the two fixed skill commands, members of the catalogue
REQ-CHAT-028 to 034 and 159 to 162 define): until the next keystroke after a rebuild, the open popup lists neither.

## Relevant files

- `packages/ui/src/slash/catalogue.ts`: `buildCatalogue`, which registers the cached families but not the two fixed commands.
- `packages/ui/src/slash/controls.tsx`: the two effects that register `/skill` and `/skills` on each new registry.
- `packages/ui/src/WorkspaceView.tsx`: the registry memo and its inputs.
- `apps/desktop/scripts/slash-proof.mjs`: the check that read it (the popup's eval and inspect at 2400 and 2500 ms).
