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
  *As first built the declared tools also stood in for a LIVE run-level agent whose root port had not resolved yet — a
  follow-up or continued run is presented live from `starting`, and the port resolves only after the pre-flight — so for
  those seconds a coordinator listed the write, terminal and commit tools REQ-MONITOR-061 forbids; found by the verifier of
  the repair and repaired the same day (below). The sentence above was not true of the code until then.*
- **Artifact links (REQ-MONITOR-044/052/068/069).** `SessionRecord.artifacts` carries the session's artifacts not
  superseded (a body-free read per snapshot, `StoreDal.artifactLinksOf`). The inspector draws the shown agent's produced and
  received artifacts as links with their ready flag in words, and the false sentence is gone (`NO_ARTIFACTS` now reads "This
  agent has produced and received no artifacts yet."); a link deep-links to the Library's Artifacts tab and opens the
  artifact inspector. The persona window's persona-wide card lists every instance's artifacts and its tools card the
  instance's own links, which open the artifact inspector in that window. The reading of what a link opens is OQ-125.

Evidence:
- Unit: `packages/ui/src/inspector-links.test.ts`, `packages/engine/src/agent-links.test.ts`,
  `apps/desktop/src/run-host/tools.test.ts` ("REQ-MONITOR-060/061: the port reports its resolved native tools"),
  `packages/config/src/snapshot.test.ts`, `packages/contracts/src/contracts.test.ts`, `packages/store/src/store.test.ts`
  (the query plan), `apps/desktop/src/renderer/agent-links-wiring.test.ts`.
- `pnpm artifacts-proof` item 2: ~~at rest~~ **while the delegating run is still active** (corrected at verification: the
  10 s probes and the 11 s click land before the run ends, and `children-inspector.png` reads "Run active" — first written
  "at rest", which the built app never exercised) the inspector follows the orchestrator, its chips are the live root port's
  resolution (`background_output` and `wait_for_tasks`, which no declaration names, now asserted) marked from its history
  (`delegate:used`, `artifact_write:used`), its produced link names the artifact it published, and following it opens the
  Library on the Artifacts tab with the artifact inspector on that id. On the code before the repair it fails on
  `delegate:not used` (the chips carried no history).
- `pnpm artifacts-proof` item 5 (added at verification): the reopened session AT REST, in a freshly opened process — the
  orchestrator's declared tools stand in, in the declaration's order, marked from the reopened history
  (`artifact_write:used`, read under the latest iteration's `root_persona`), and its produced link is still drawn
  (`missing-body-inspector.png`).
- `pnpm mission-proof` item 6: the running coordinator's chips at 3 s are its run's resolution — `delegate:used`, no
  `write_file`, `terminal` or `git_commit`.
- `pnpm live-run --confirm --only=ask` against `katalyst` (pack `.live-run/runs/2026-09-29T11-48-13-397Z`, `ask.png`): the
  inspector shows the orchestrator's tools with `read_file used`, and the artifacts line reads the new sentence.

## Repair round 1 — the verifier's findings, 2026-09-29

- **A live run-level agent with no resolution listed its declared tools (REQ-MONITOR-060/061).** `Run.entryTools.resolved`
  is empty until `Run.iterate` sets the root port, after the pre-flight (about 4 s in the verifier's live run), and a
  follow-up or continued run already holds `runStartedAt`, so the run-level agent is presented live from `starting`. The
  declared set stood in there, a coordinator's withheld tools included. Now `runLevelGrant` (`packages/ui/src/agents.ts`)
  lists nothing while the agent is live and unresolved, and `resolvedTools` never lets the declared tools stand in for a
  live run-level agent (REQ-MONITOR-060: the persona has a live instance). Pinned by
  `packages/ui/src/inspector-links.test.ts` ("a live run-level agent whose port has not resolved yet lists no declared
  tool"), red before the change, and by `agents.test.ts`'s run-level case, which had asserted the declared set for a
  RUNNING agent.
- **The port's reported set is its callable native set.** `ToolPort.resolvedTools` returned the resolution's names whether
  or not an executor held them; it now returns the native names the callable map kept, so the inspector cannot list a
  name the agent cannot call.
- **The proof's description.** Item 2 was described as reading the inspector at rest; it reads a running run (corrected
  above, in `AGENTS.md` and in the proof's comment). The at-rest reading is item 5's.
- **ADR-0048** still said "Artifact links are empty (no artifact store)"; reported back in place.
- **Re-run after the round.** `pnpm artifacts-proof` and `pnpm mission-proof` exit 0 on the built branch; item 5's chips
  at rest are the orchestrator's declaration with `artifact_write:used`, and its produced link reads `scripted-plan`.
  `pnpm live-run --confirm --only=ask` against `katalyst` passed again (pack `.live-run/runs/2026-09-29T13-21-18-407Z`,
  `ask.png`): the completed run's inspector lists the root port's resolution (`read_file used`, `background_output`,
  `wait_for_tasks`, no write, terminal or commit tool) and the new artifacts sentence. It was started only after another
  workflow's live run had ended, since the sweep would otherwise have deleted that run's sandbox
  ([`a-live-run-sweeps-a-concurrent-live-runs-sandbox`](a-live-run-sweeps-a-concurrent-live-runs-sandbox.md)).
