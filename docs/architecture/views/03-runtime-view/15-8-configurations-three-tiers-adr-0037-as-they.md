# Runtime view — a run from prompt to terminal result, and everything that reaches into it — 8. Configuration's three tiers (ADR-0037) as they touch the run

Part 15 of 16 of [the runtime view](../03-runtime-view.md), which indexes every part.

## 8. Configuration's three tiers (ADR-0037) as they touch the run

- **A fatal load, said when the workspace opens (OQ-279, ruled 2026-10-13 under R-072; 2026-10-14).** "A workspace opens"
  means its configuration loads (REQ-CONFIG-478). Under a fatal load in either scope the window, the history, the repository
  view and Settings stay available and every run and isolated start is refused with the report (REQ-EVENTS-021,
  REQ-GIT-071), as before; what is new is that main reads the opened workspace's snapshot in the open's post-ack slot and,
  where `loadOk` is false, raises "The workspace configuration did not load" — `error`, persistent, the detail the snapshot's
  `fatal` (file, scope, key path), the action "Open Models settings" (the category whose card draws the report) — after the
  slot's other notices, so it stands. `ConfigFatalNotices` (`main/config-fatal-notice.ts`) keys it by the workspace, its load
  generation and the report; a clean load of that workspace — a snapshot `configAnnouncer` carries, or a run that starts —
  clears it compare-and-clear and advances the generation, so a fault that recurs is raised again. The run's own per-run
  reload is unchanged: correcting the file and starting a run is the recovery, with no relaunch (`notice-proof` 1c).
  **The readers outside the run's load follow it (2026-10-14, fin44):** none answers an unloaded configuration with defaults.
  The run host's `skills:` and instruction readers answer the report (`SavedRead`, `run-host/skills.ts`); the five `skills.*`
  requests refuse with code `config.fatal` and the report as detail — also when the file stops loading between the request's
  first read and a later one, which `SkillHost` signals with `SkillsUnloaded` and `dispatch.ts`'s `skillsAnswer` turns into the
  same refusal (2026-10-14, fin45) — so the Settings › Skills category draws the report
  (the `Fatal` card Models, Personas and Runtime draw) and the composer registers no skill command; an agent built while the
  file does not load gets the sections its run was configured with (`configuredRuns`), or no skill and no instruction file
  where no run of that session is known, and nothing read that way is cached for the workspace. The workspace service's
  requirements reader holds the report (`configFault`, `workspace-service/delivery.ts`), re-reads the file at each claim
  (`readSavedConfiguration`, which loads again only when a file it read has changed),
  launch preview and run-starting board action, and while it does not load the queue starts nothing — every candidate
  deferred with "The workspace configuration did not load, so nothing starts from the queue until it is corrected: <report>"
  (`scheduleQueue`'s `unconfigured`), the claim takes nothing, a run-starting action is refused and provisions nothing.
  **The report names the file that stated the rejected key (2026-10-14, fin45):** a fault found before the merge (a
  syntax error, the hooks section) carries its own file, and one found on the merged document (`resolveMerged`'s typed
  section readers) is attributed by `statingFile` (`packages/config/src/load.ts`) to the scope file stating the longest
  prefix of its path, the later in REQ-CONFIG-031's order on a tie, each `agents.yaml` read with its legacy role names
  canonicalised and each `models.yml` for `models:` alone; a path no scope file states names the workspace `agents.yaml`.
  The key is named as that file spells it (`spelledAsStated`, 2026-10-14, fin46): a role the file states under its legacy
  name keeps that name in the path, under `personas:` and in a role's `tool_restrictions:` (REQ-CONFIG-062), where until
  then the path carried the canonical name the file does not hold.
  Until then every merged-document fault named the workspace file and scope, so a global fault named a file that need not
  exist (REQ-CONFIG-478; `notice-proof` 1d). **A warning the same readers raise names its file too (2026-10-14, fin46):** an
  unknown key inside a merged section, a withdrawn `requirements:` key and the readers' other warnings reach the load's
  `warnings` as `<file> at <path> (<scope> scope): <message>`, the fatal report's form, the file found by `statingFileOf`
  (`statingFile`'s search, null where no scope file states the path); a warning on a value no scope file states keeps the
  bare `<path>: <message>`. Until then every such warning was the bare form, naming no file (REQ-CONFIG-233, REQ-CONFIG-183;
  `notice-proof` 1e). **Since 2026-10-14 (fin46) the attribution follows the merge:** a scope file
  that replaced the value wholesale at a prefix of the path (`replacedPrefixLength`, REQ-CONFIG-040..050's classes: a
  models or personas entry over a non-mapping, an entry's immediate field, a list, a scalar over a section's mapping) takes
  the fault (and a warning, through the same search) whatever an earlier file states beneath that prefix, so a field
  missing from an entry a later file replaced whole is no longer reported in the earlier file whose value the merge discarded
  (`docs/defects/fixed/a-fault-inside-a-wholesale-replaced-value-is-attributed-to-an-earlier-file-that-states-the-deeper-path.md`).

- **What no tier reaches — the update check (REQ-STARTUP-111, the updater of 2026-09-28).** Whether, when and
  where a supported standalone build checks for an update is decided by no configuration value in any tier, no
  preference, no environment variable and no control: the endpoint is a constant of `main/updater/feed.ts`, the
  once-per-window trigger is `MainWindows`' post-show activation, and the one preference the updater reads,
  `updates/dismissedVersion`, silences one version's offer and touches the check itself not at all. REQ-STARTUP-111's
  acceptance criterion is a property of the four closed enumerations — this section's keys among them — carrying no
  entry that names update checking, an endpoint, a release source or a channel; none does.
- **Tier A** — Settings Save, the diagnostics toggle, the composer's permission-mode control: the workspace
  service writes through one of the four writers and loads again; main announces `config:changed` to each main window
  and its persona and terminal windows (`configFamily`) with its own workspace's snapshot (`announceConfig`; since
  2026-10-03, before which every window took the written one; the same day's first form reached the main windows alone and
  left a persona window's snapshot stale). The Settings screen adopts each announcement keeping its edits
  (`adoptSnapshot` → `rebasePending`, `packages/ui/src/settings/config-state.ts`): a field the user has not changed takes
  the file's new value, a changed one stays, rebased against the saved half of the one form state the hook holds, so two
  announcements landing in one tick chain (since 2026-10-03, fin13: before, the previous saved values came from a ref an
  effect refreshed after render, and the second was rebased against the values from before the first). The permission
  mode is the one exception (REQ-CONFIG-423): a snapshot whose mode differs from the last saved one displaces an unsaved
  selection; one whose mode is unchanged keeps it (the reading OQ-197 raises).
- **Tier B** — at every run start the run host loads the files — layer 3, the discovery snapshot, folded first
  (REQ-CONFIG-034: an authenticated provider's models as entries keyed by qualified id with `auth_provider`, and its
  slot picks) — and overlays the screen's live state (`config.liveState`, handed over on every pending change), then
  runs the loader's own passes; **since 2026-10-14 (fin46) the handover applies the load's schema first (REQ-CONFIG-111,
  `liveStateProblems` in `packages/config/src/tiers.ts`): a state holding a value the load would reject is refused
  (`config.live-state-invalid`, the run host's warn line naming each path) and the state held before stays, so the passes
  never meet an overlay value at fault and never name a scope file for one** — until then the state was installed
  unchecked, and a live `max_depth: 0` was refused at run start in the name of a scope file that held another value
  (`docs/defects/fixed/a-live-setting-the-load-schema-rejects-is-reported-in-a-scope-file-that-does-not-hold-it.md`); the run's `RunConfig`, runtime posture, persona resolver, model references, entry
  tier, providers to lease and message limit come from that. Initial starts capture this once before
  credential preparation and pass the completed setup into `Sessions.start`. The authorized board grant
  is a separate per-launch input carrying both fields required by REQ-TRACE-470. The runtime keys the live state lays
  on are `TIER_B_RUNTIME_KEYS`: the permission mode, the depth cap, the fan-out limit, **the per-agent timeout
  (`child_timeout`, since 2026-10-07, PD-CONFIG-003 — the run's `childTimeoutMs`)**, the iteration cap, the outside-workspace
  switch, the improvement loop, **the improvement analysis timeout (`improvement_collector_timeout`, since 2026-10-07,
  PD-CONFIG-003 revision 2 — the bound the post-run analyst reads from the run's configuration)**, keep-going and the
  run-start mode.
- **Tier C** — everything else is read at the next load; nothing watches a file. **The `display:` section** —
  REQ-CHAT-166's four transcript caps, the reader `SECTION_KEYS` declared and nothing stood behind until Part Z —
  is Tier C: it is read by `loadConfiguration`, carried on the configuration snapshot, and reaches every window over
  `config:changed`, where a change re-projects the resident window once (which is a settings change, not transcript
  update content, so it sits outside what REQ-MONITOR-223 measures). REQ-CHAT-067's grouping switch is **not** here:
  it is a desktop preference (`display/groupToolCalls`, REQ-CONFIG-405), which is why the two live in different stores.
  **Part AG added the surface over it** (REQ-CONFIG-472): the four fields join destination 1's pending state and are
  committed by Save through Tier A, spelled in the file as REQ-CONFIG-172 fixes them (`tool_result_max_lines`,
  `tool_input_max_lines`, unlimited written as `0`) and read back into the same view field names. They are **not** in
  Tier B's live state — they change what is drawn, never what a run does — and the renderer publishes its pending
  values to the transcript so what is drawn follows the screen rather than the file. What that last clause can be
  observed to do is narrowed by the shell itself: Settings replaces the Workspace among REQ-SHELL-023's seven views,
  and REQ-CONFIG-286's guard will not let a dirty form be left, so pending and file cannot be seen to disagree over a
  visible transcript in the main window.
- **The Instructions inventory rides the same snapshot** (REQ-CONFIG-277, Part AG; narrowed by `PD-WORKSPACE-002`):
  `readSnapshot` adds a presence check over the workspace root's `AGENTS`/`CLAUDE` pairs and over the five further
  bases — the global configuration directory, `~/.agents`, `~/.config/opencode`, `~/.openhands` and, off Windows,
  `/etc/codex` — so the settings screen reads one shape and no new message crosses the boundary for it. It is a
  presence check and never a read of what those files say. The per-file `instructions.overrides` policy rides the
  same snapshot on a second field (`instructionsPolicy`), because the inventory says what exists and the policy says
  what is switched on, and the screen holds the second pending while the first is a fact about the disk. The
  discovery is **pure over an injected home and platform** (`ROTARIS_CAPTURE_INSTRUCTIONS_HOME` in the workspace
  service), the same seam the skills proof uses and for the same reason: overriding `HOME` kills Electron on Windows.
  The machine-wide base's directory is injected too (`ROTARIS_CAPTURE_INSTRUCTIONS_MACHINE`, read by the workspace
  service and the run host alike, compiled out of a packaged build), so a proof can place a file at every base
  without writing into the machine's own `/etc`; in the run host the same value moves the skill search's
  `/etc/codex/skills` as well (`ROTARIS_CAPTURE_SKILLS_MACHINE` is read first there, as `ROTARIS_CAPTURE_SKILLS_HOME` is
  for the home), so a driven run reads no skill of the operator's machine either.
- **The MCP layer (Part S)** — the two `mcp.json` files are layer 2 of the load (defaults → discovered → global → workspace,
  REQ-MCP-025), the merged `mcp_servers` map is resolved at load (origin, command, availability, environment with secrets
  overlaid, the URL, the normalised description) and rides on `LoadedConfiguration.mcp`; Tier B resolves it again over the
  overlaid document. The session enable-override is a third input to the persona surface, held in the run host only.
- **The `requirements:` block (Part AP)** — registered for the first time (`packages/config/src/sections/requirements.ts`)
  and read at load onto `LoadedConfiguration.requirements`. It is **Tier C with one Tier A writer**: the delivery queue's
  two persisted controls (`scheduling.mode` and `scheduling.max_concurrent_units`, REQ-TRACE-480) are written by the
  workspace service through `commitConfigFields(…, 'workspace', …)`, which loads again at once, so a change takes effect
  without a restart; the queue's stop is persisted nowhere, by requirement. REQ-CONFIG-183 makes every unknown key under
  `requirements:` a **hard load failure** — the opposite of the top level's silent drop — with REQ-CONFIG-183's two
  carved-out keys, each reported once and ignored so the workspace still opens: `execution.worktree_subpath`, which
  REQ-CONFIG-194 names as not a key of this domain (`NOT_A_KEY_WORKTREE_SUBPATH`, which says the rest of the configuration
  loaded since 2026-10-15, fin47, finding A8 — until then it said only that the key is ignored), and the withdrawn
  `delivery.store_subpath` (REQ-CONFIG-192;
  `WITHDRAWN_STORE_SUBPATH`, dropped from the block, since 2026-10-15, fin47 — until then it was carried unread and
  reported nothing). `evidence`, `delivery` and `board` are otherwise accepted as mappings and carried opaque until the
  part that consumes them validates them. `execution.branch_template` is checked at load against REQ-GIT-138's two
  forbidden namespaces on a **rendered** example rather than a literal prefix, so a template that would collide by
  construction is refused before anything is created from it. REQ-GIT-138's directory half is the top-level
  `worktree_storage_subpath`'s (`worktreeStorageCollision`, beside the template check): a value resolving to the fixed
  requirement checkout directory `.rotaris/requirements/worktrees` or inside it fails the load as a whole (since 2026-10-13,
  fin41; a value containing it loads, ruled (OQ-263, confirmed as built)). The key is read by main at an isolated start through the snapshot's
  `worktreeStorageSubpath` and sent on `worktree.create`'s session target (REQ-GIT-073); until 2026-10-13 it was read by
  nothing but the loader.
- **The `skills:` block (ADR-0063)** — registered for the first time (`packages/config/src/sections/skills.ts`)
  and read at load onto `LoadedConfiguration.skills`. It is **Tier C with one Tier A writer** (the Settings Skills
  tab's Save), but the thing it governs has a lifetime of its own: the **catalog** is the run host's, cached per
  resolved workspace root and cleared at **session creation** (REQ-WORKSPACE-058), which is neither Tier B's
  per-run-start nor Tier C's next-load. `skills.enabled` is read from the SAVED files at each force-load gesture
  rather than from a run's captured snapshot, on the `fetch` tool's precedent below, because REQ-WORKSPACE-073
  gates a gesture happening now and not a run that started earlier.
- **The `initialization:` and `project_init:` blocks (ADR-0064)** — registered for the first time, and the one
  pair in the file that is **not read through the layered merge at all**. REQ-WORKSPACE-078 names
  `<workspace>/.rotaris/agents.yaml` and only that file, so `readInitializationState` opens it directly: read
  through the merge, a *global* `agents.yaml` could declare one machine's marker for every workspace on it. That
  is also what lets REQ-WORKSPACE-115's refresh promise to show "the values the persisted section holds at that
  moment" while disturbing nothing else — it is one file, read on its own, on demand. Writes go the ordinary
  Tier A way (`config.setField` → `writeConfigFields`), each preceded by `config.bootstrap` so a missing file gets the
  starter first (REQ-WORKSPACE-040; `serviceMarkerWriter`, 2026-10-03: the per-field path itself still never
  bootstraps, REQ-CONFIG-030), and `overlaySection` replaces both id lists wholesale
  (REQ-CONFIG-050) while every other top-level key stays put. Because the lists are replaced wholesale, main's
  coordinator makes every marker write through a queue, one per workspace root (`InitializationCoordinator.marker`),
  one write at a time in the order asked, and builds each patch — a skip's, each of a run's recordings through
  `ExecuteDeps.commit`, the silent stamp — inside its turn from the file as the previous write left it; a skip
  decides which ids it leaves out in that turn too (ADR-0064, "Fourth round" and "Fifth round", 2026-09-29). A run of
  a workspace no window holds any more has its recordings refused inside their turn, so a close that lands while one
  waits still stops it (REQ-WORKSPACE-013, OQ-141; ADR-0064, "Sixth round").
  *Superseded 2026-09-29:* "the execution re-reads the section immediately before each recording: a skip answered
  while a background task ran was otherwise erased by that task's own outcome, which is the second defect ADR-0064's
  first execution found." The erasure was real; the re-read (`ExecuteDeps.reread`, now removed) did not end it,
  because a read taken before the write, outside the order the writes land in, still missed a skip whose write was in
  flight, and the skip built its own patch from the in-memory state the run's write had not reached yet.
  `project_init.source_extensions` is read from the same file and decides classification (REQ-WORKSPACE-099).
- **The one per-call read** — the `fetch` tool's egress policy and `tool_call_timeout` are loaded from the saved
  files at every call, without the live state (REQ-SANDBOX-038/118): a saved edit to the host lists reaches the
  next fetch of a running session with no restart, an unsaved settings edit reaches nothing. The read is
  `readSavedConfiguration`'s, which the requirements queue's reader shares: each process keeps the last answer per
  global directory and workspace beside a fingerprint (modification time, size, file id) of every file the load
  opened or looked for and of the environment, and returns it only while all are unchanged. The answer carries no
  tool servers, whose availability is a PATH lookup no fingerprint covers; a reader that needs them loads afresh.

### Post-run improvement state

The run host retains only the captured job's configured model context while it waits in main's application-wide FIFO.
Main holds the ordered queue and one active marker in memory; neither belongs to a session lock or delays the terminal
result. `improvement:activity` mirrors the queue shape to every renderer. The workspace service remains the single writer:
analysis output becomes visible only after `save-collected` commits and a canonical `get` rereads it. Workspace close and
application shutdown cancel both queued and active contexts. The durable state remains the v19
`improvement_artifacts` / `improvement_artifact_versions` pair and the session association described above.

**The retrospective pass adds no run state (Part AT; `PD-LIBRARY-002`, ADR-0065).** It has no run to retain: the run
host resolves the workspace's configuration and credentials per capture and holds nothing between them, and main's
queue, active marker and cancel are the same objects the post-run pass uses. Two additions are visible here. The
activity publication carries `pass`, which is what the two indicators (REQ-LIBRARY-125/126) label — built in this part,
after being specified and drawn by nothing since Part AF. And the configuration surface is exactly three keys, per
`PD-LIBRARY-002` (the sibling's rule at REQ-LIBRARY-165): `models.retrospective_model` and its
`retrospective_model_thinking` (editable slots, falling back to the medium tier by REQ-LIBRARY-040's rule) and
`runtime.retrospective_timeout` (integer seconds, default 120, minimum 1). The evidence bounds are constants in
`packages/engine/src/improvements/retrospective.ts`, not settings, on the same rule.

**What a pass tells the person when it ends (REQ-LIBRARY-124, `PD-LIBRARY-002` (c), `PD-LIBRARY-005`).** Main chooses the notice
from what the workspace service re-read, never from the run host's job. An artifact with proposals posts the success notice with
"Review proposals". An empty artifact is read by the prefix of its `notes`, which the analyst writes from the three
`COLLECTOR_*_PREFIX` constants in `@rotaris/contracts` (REQ-LIBRARY-022/023), through `emptyArtifactNotice`
(`apps/desktop/src/main/improvement-notice.ts`):

- `collector crashed: ` or `collector parse failed: ` is the pass's failure warning, with no action. Its detail gives the
  reason and "<artifact id> holds no proposals.", and main writes a warning line to the application log (since 2026-10-14,
  OQ-285).
- `collector timed out after <t> seconds` is the info notice. Its detail names the limit, and for the post-run pass the control
  that moves it (`PD-CONFIG-003` revision 2).
- Anything else is the info notice with "Nothing was proposed in <id>.".

A job that ended without an artifact posts the same warning title and detail through the coordinator's `failed`
(`passFailureTitle`, `passFailureDetail`). A cancelled one posts nothing (REQ-LIBRARY-127).
