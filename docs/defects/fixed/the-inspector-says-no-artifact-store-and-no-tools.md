## The inspector says there is no artifact store and no resolved tools

The agent inspector draws "No artifacts yet — this build has no artifact store." unconditionally, and "No tools
resolved." for the run-level agent. The artifact store exists since Part Y and held seven `child_report` artifacts in
the live run; the orchestrator made 2 to 15 calls per session. Both sentences are false in every screenshot.
`codebase.md` still lists "artifact links from the agent inspector" as owed, and its own parenthesis says the store
exists.

Live-run finding: K1 (live runs of 2026-09-29)

## Specs

- `REQ-MONITOR-052`: the inspector links an agent's artifacts.
- `REQ-MONITOR-060`: the declared tools stand in where no resolved set is known.

## Evidence

- Pack `.live-run/runs/2026-09-29T02-41-56-779Z/` (the sweep worktree; git-ignored): every scenario PNG with the inspector open; the store held 7 `child_report` artifacts and 2–15 orchestrator
  calls per session.

## Relevant files

- `packages/ui/src/Inspector.tsx:60` — `NO_ARTIFACTS`; `:172` — drawn unconditionally; `:159` — "No tools resolved.".
- `packages/ui/src/PersonaWindow.tsx:156` — the same tools sentence.
- `docs/architecture/codebase.md:2036` — Part R's row, "artifact links from the agent inspector" owed.

## Repaired — 2026-09-29

Repaired 2026-09-29 under R-067, as the feature `docs/architecture/codebase.md`'s Part R row listed owed.

- **The run-level agent's tools (REQ-MONITOR-060/061).** The entry role has no `children` row, and the renderer let the
  snapshot role's `tools` stand in — what the files state, empty for every built-in role, hence "No tools resolved.". Now
  `SessionRecord.entryTools` carries the live run's root-port resolution (`ToolPort.resolvedTools`, so a coordinator's
  withheld write, terminal and commit tools are absent) and the tracker's called and active tools; with no run live the
  role's DECLARED tools stand in — the snapshot's new `declaredTools`, by the rule the run host's persona resolver applies
  (`declaredToolsOf`; the built-in roles' tool declarations moved from the engine to `contracts/src/roles.ts` for it).
- **Artifact links (REQ-MONITOR-044/052/068/069).** `SessionRecord.artifacts` carries the session's artifacts not
  superseded (a body-free read per snapshot, `StoreDal.artifactLinksOf`). The inspector draws the shown agent's produced and
  received artifacts as links with their ready flag in words, and the false sentence is gone (`NO_ARTIFACTS` now reads "This
  agent has produced and received no artifacts yet."); a link deep-links to the Library's Artifacts tab and opens the
  artifact inspector. The persona window's persona-wide card lists every instance's artifacts and its tools card the
  instance's own links, which open the artifact inspector in that window. The reading of what a link opens is OQ-123.

Evidence:
- Unit: `packages/ui/src/inspector-links.test.ts`, `packages/engine/src/agent-links.test.ts`,
  `apps/desktop/src/run-host/tools.test.ts` ("REQ-MONITOR-060/061: the port reports its resolved native tools"),
  `packages/config/src/snapshot.test.ts`, `packages/contracts/src/contracts.test.ts`, `packages/store/src/store.test.ts`
  (the query plan), `apps/desktop/src/renderer/agent-links-wiring.test.ts`.
- `pnpm artifacts-proof` item 2: at rest the inspector follows the orchestrator, its chips are marked from its history
  (`delegate:used`, `artifact_write:used`), its produced link names the artifact it published, and following it opens the
  Library on the Artifacts tab with the artifact inspector on that id. On the code before the repair it fails on
  `delegate:not used` (the chips carried no history).
- `pnpm mission-proof` item 6: the running coordinator's chips at 3 s are its run's resolution — `delegate:used`, no
  `write_file`, `terminal` or `git_commit`.
- `pnpm live-run --confirm --only=ask` against `katalyst` (pack `.live-run/runs/2026-09-29T11-48-13-397Z`, `ask.png`): the
  inspector shows the orchestrator's tools with `read_file used`, and the artifacts line reads the new sentence.

