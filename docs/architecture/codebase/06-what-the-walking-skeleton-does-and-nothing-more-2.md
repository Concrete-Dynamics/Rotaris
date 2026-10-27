# The codebase — how the architecture is laid out in code — What the walking skeleton does, and nothing more (continued)

Part 6 of 22 of [the codebase record](../codebase.md), which indexes every part.

27. **the bundled code-intelligence runtime — ADR-0035's first execution (2026-09-06, Part T):** **the two spikes first**
   (`spikes/code-intelligence-bundle.md`: Serena 1.7.0 on Python 3.13.15, installed by uv 0.12.5 at build time into
   `resources/code-intelligence/`, 167 MiB in 10,603 files, answers `tools/list` from a cold launch in ≈5.5 s with nothing
   else installed — but provisions its language servers at first use, so **IC-7 is proposed**; `spikes/code-intelligence-
   branch.md`: Electron's own main entry with the token first is the mode that works, the four observables of ADR-0035
   consequence 1 held on the dev and the packaged binary — with two platform findings kept beside the branch: Electron
   exits −1 before any JavaScript when a scheme-looking positional is followed by another, so the launch is `Rotaris.exe
   builtin:code-intelligence --`, and it writes one CR LF to a piped standard output ≈50 ms after start, which the
   transport tolerates before the first message and nothing else); the pre-bootstrap branch `main/sentinel.ts`, the FIRST
   import of main, spawning the runtime on the parent's own pipes and exiting with its status, seeding the runtime's home
   under the per-user data directory with its dashboard, browser tab and network checks off (Serena opens a browser tab
   and phones home by default — REQ-MCP-033's "no UI" would have been false); the bundle step, `extraResources`, an
   `afterPack` rule that asks the interpreter for its version from inside `win-unpacked`; **the binding manifest
   generated from the runtime's own `tools/list`** (`code-intelligence-manifest.generated.ts`, committed; 10/7/2/1 tiers,
   disjoint, never-grant names checked against the runtime's whole vocabulary because the host-integration context
   withholds `open_dashboard` from the server's listing; `pnpm package` regenerates and refuses on a diff); the client's
   owed halves alive — `code_intelligence` **`enabled: true`** with the deviation's record kept, the persona grants
   (12 / 19 names), REQ-MCP-034's binding on the launch subcommand (an isolated run's bound to its worktree's root only
   from 2026-10-03, `configurationForExecutionRoot`; ADR-0034's "isolated-run binding, executed"), REQ-MCP-071's probe, REQ-MCP-102's memories block;
   REQ-MCP-099's three-step project setup in the run host (Serena's `project create` is interactive by construction —
   the runner answers each prompt with the runtime's default) behind REQ-MCP-112's action in the MCP category. `pnpm
   code-intel-proof` drives seven launches (a real symbol overview on a scratch TypeScript file; the packaged binary
   with the network blocked names `npm install typescript@5.9.3` — IC-7's evidence, and since ESC-32 a declared package at
   its declared version). **Found nothing in existing code;**
   two costs stated for the owner: every process's first run waits ≈4.5 s for the runtime's discovery, and the runtime
   writes ≈100 INFO lines to stderr per launch. **The merge found two consequences of the enabled entry:** the runtime
   creates `.serena/project.yml` in the workspace root whenever it starts with a project, so every first run left an
   untracked directory in the user's repository — the Git proof's isolated launch found the base tree dirty; the load's
   `.gitignore` amendment (REQ-CONFIG-013 / REQ-MCP-089) now keeps the marker's directory ignored beside `.rotaris/`,
   the name from the manifest, a reading flagged for the owner (*replaced 2026-10-01 under OQ-161*: `.rotaris/` alone
   in `.gitignore`, the marker's directory in the repository's own `info/exclude`, so no tracked file changes; *and since
   2026-10-07 under OQ-215 / `PD-TOOLS-012`* the marker's directory, named from the manifest, is a hard-coded ignore component of
   the search and listing tools in `agent-tools/src/tools/search.ts`; *and since 2026-10-07 under OQ-230 / `PD-TOOLS-012`
   revision 2* every agent is told what both directories are by `PRODUCT_DIRECTORIES_UNIT` (`config/src/product-directories.ts`),
   the last context unit `SkillHost.contextUnits` hands every agent); and
   the 4.5 s discovery pushed five proofs' fixed windows, which now switch the entry off in their scratch configuration (Part J, resilience, fetch, mission) or carry
   the cost (config); IC-6's packaged launch reads `session running` at its 9 s capture where it read `completed`. A
   stray `builtin/` directory in the main checkout dated from the branch spike: the pre-sentinel build launched here took
   the token for a workspace path and Windows's stream syntax made a directory of it — unreachable once the sentinel
   precedes `workspaceFromArgv`; removed, not committed.

28. **the notice pipeline and the one transient surface — ADR-0049 executed in full (2026-09-06, Part V; built in
   parallel with 29, each in its own worktree, merged here):** the store left `main/index.ts` for `main/notices.ts` —
   one serialised chain applying publications in acceptance order, **record-then-render** for a `warning` or an `error`
   (the entry goes to the session's timeline through the run host's new `timeline.append` **before** the broadcast,
   REQ-NOTIFY-268), compare-and-clear on dismissal, and the run-start clear that spares a notice about another session
   (REQ-NOTIFY-029/058). Two entry points and no third (REQ-NOTIFY-003): `report` raises the persistent notice,
   `acknowledge` raises a transient and its type has no place for an action or a severity. The action vocabulary is a
   closed union carrying each member's identity (REQ-NOTIFY-044, REQ-SHELL-115), checked at dispatch against the view
   ids and settings categories the owning domains export. `packages/ui/src/Acknowledgements.tsx` is the ONE transient
   surface (REQ-NOTIFY-013, REQ-SHELL-112/113), a stack per window, mounted in the main window and in every persona
   window; the Git view's private fixed toast is deleted, having been a second surface since Part O. No notice leaves on
   a timer any more (REQ-NOTIFY-040), so REQ-MCP-044's warning rides the new `acknowledgement:publish` channel instead
   of the slot's 8 s clear. **ADR-0049's "Revisit if" is answered, not repaired:** REQ-NOTIFY-024 forbids a queue, and
   what makes a replaced notice retrievable is the record. `pnpm notice-proof` drives three launches — the advisory
   burst reproduced with a global hook that fails until it is switched off (both notices published a millisecond apart,
   the slot holding one, the advisory read back out of the timeline with its body unchanged), the scoping and
   compare-and-clear rules, and the stack measured (520 px alone, 360 px stacked, 8 px gaps, 16 px from the window's own
   corner, three of four visible, nothing left after 4200 ms). **Found — one defect:** main built the run host's notice
   with an empty body, so the advisory's entire text was dropped on the way to both the screen and the record; the
   timeline entry existed and said nothing. Only the built application carried the field through every hop. **Two open
   questions for the owner:** REQ-MCP-044's 8 s against REQ-NOTIFY-011's 4200 ms, and two action members
   (REQ-NOTIFY-224's hook review, REQ-WORKSPACE-152's provider sign-in) that REQ-NOTIFY-044's list does not name.

29. **the command palette, keyboard help and application modality — REQ-SHELL-048's one vocabulary, ADR-0048's second
   execution (2026-09-06, Part W; built in parallel with 28):** `packages/ui/src/commands/` holds the registry — thirteen
   entries of REQ-SHELL-049's table with hidden keywords that are matched and never drawn, and four entries this window
   cannot yet carry out recorded in `OMITTED_COMMANDS` with the reason *(2026-10-13, fin41: one remains, "Open demo
   window"; "Search transcript" (Ctrl+F) and REQ-CHAT-167's "Toggle reasoning bodies" were withheld for reasons false
   since Parts Z and AA and are in the registry now — ADR-0048's last section)*. The palette is a 560×420 application-modal
   dialog that filters case-folded over label, keywords and identifier, auto-selects the first row, and **closes before
   it runs** (REQ-SHELL-052, read from a mutation log: the palette left the document at 204.8 ms and the view changed at
   204.9 ms). Keyboard help lists the twelve shortcut-bearing commands as keycaps with the Escape prose line in place of
   a row. `Kbd` announces a whole chord as one accessible name (REQ-SHELL-057) and the rail's description carries it
   (REQ-SHELL-058). ONE window keydown handler replaces the two effects that bound chords before, stands down while any
   `aria-modal` surface is open, and resolves window-level Escape only on Workspace. **ADR-0048's application modality
   is built and observed:** `window.modality` reaches main's registry, which disables every persona window of the family
   while a surface is open. `pnpm palette-proof` drives five launches and reads the block through the **operating
   system's own cursor and keyboard** — the injected events every other proof uses enter the renderer below the host's
   input block and would pass through a disabled window, which is recorded in ADR-0048 beside the reading that a
   disabled window can still be raised to the foreground. That host-input half runs on Windows only. Since 2026-09-28
   the proof states it not applicable elsewhere and asserts the application's own reading there
   ([note](../../defects/fixed/palette-proof-reads-the-win32-host-input-on-every-platform.md)). **Found — one defect:** binding Ctrl+L and Ctrl+Return through
   the registry deferred both by two animation frames, so a keystroke immediately after Ctrl+L reached whatever held
   focus before; the product's own prompt seam types at that speed and stopped submitting, which is how it surfaced.

16. **the control channel (2026-09-05):** REQ-MONITOR-004's twenty-two operations behind ADR-0010's channel 1 — the
   skeleton's list was the runtime's, not the requirement's, and is replaced. Queued prompts are a session-owned
   table consumed exactly once at every iteration boundary into a "Queued Prompts" phase; a steer is injected at
   the agent's next step and a finishing agent takes another round; a pause is whole-run and graceful, the session
   `paused` with its row and the composer's Continue running it on; the message limit pauses the run durably with
   the count and the limit, the dialog in its own window offers continue, double and cancel, and a session found
   paused at the limit raises it on attach; todo edits, the entry model and reasoning switch, the shutdown announce;
   the quit path during a run measured. **Found:** the steer's peek drained the queue — the twelfth defect (ADR-0010).

15. **configuration as files (2026-09-05):** `agents.yaml` and `models.yml` at both scopes are loaded once per run
   start with the screen's live state on top (ADR-0036, ADR-0037): the four merge classes, the typed `models:` /
   `personas:` / `runtime:` / `compressor:` / `circuit_breaker:` sections, tier aliases and reasoning synthesis, the
   two validation stages; a fatal file refuses the run naming file, scope and path, and correcting that key alone
   loads. The four writers edit the document in place; Settings → Models, Personas and Runtime edit destination 1
   with Save/Discard, the dirty state and the guard, the advanced card writing per field at once; the composer's
   permission-mode control writes its one key. Every runtime environment stopgap is gone but `ROTARIS_MODEL_TIER` and
   the scripted dialect. **Found:** re-emission collapses an inline comment's spacing — the eleventh defect (ADR-0036).

14. **the loop supervisor and `continue` (2026-09-05):** one hidden observer per agent conversation, fed by the turn
   after every assistant message and tool call and asked before every model step; triggers in `REQ-ORCH-101`'s
   order over actions (whole-argument sameness; since 2026-10-20 the arguments compared as one JSON value, key order no part
   of it, OQ-364), a small-model classifier on the intent ladder bounded by
   `runtime.loop_classification_timeout` (capped at what remains of `REQ-NOTIFY-106`'s 2 s budget, counted from the activity that satisfied the trigger, since fin35, `REQ-CONFIG-467`), `REQ-ORCH-104`'s fallbacks, escalation at the third consecutive
   activation — the child failed with `circuit_breaker_escalation`, the root's run ended `agent_session_aborted`;
   `circuit_breaker:` in `agents.yaml`; "● CB armed" in the status strip. A stored session is listed and opened
   from the title bar's "Sessions" browser (`REQ-SHELL-126`), its lock re-claimed with one local reap, its
   orphaned children settled `cancelled` before the first iteration (`REQ-ORCH-053`'s route), and the next prompt
   **continues** it: the row first, then a run on the same session with the previous intent carried over when
   the fresh classification is unusable and the `REQ-SESSION-115` payload under its budgets; ordinals continue
   the series. **Found:** the supervisor's repetition and cycle triggers were judged over a series holding the
   assistant's text — the tenth defect (ADR-0059).

13. **intent classification and the playbooks (2026-09-04):** before the coordinator exists the prompt is classified
   through the first configured model slot over a three-rung ladder bounded at 12.0 s (8.0 s until ESC-35) — every failure the fallback
   intent with a reason, shown in the Workspace view and recorded in the launch audit with the grant and the
   resolved playbooks; the two simplest intents (or a `single` override) grant the entry role the direct-work
   bundle by facet; every role's instructions carry the playbook its row resolves to (role × intent-or-group-or-
   default × tier-or-any, overrides from `playbooks/` at two scopes, unknown names warned and ignored); the BUDGET
   slot clamps the child policy. Settings → Personas lists the catalogue. **Found: nothing** — the first part of
   this record to run clean against the scripted client on its first execution. **Then, on the first real call
   (the slice, 2026-09-05): the sixteenth defect** — the small model answered the request instead of labelling it
   and the ladder never descended (entry 18; ADR-0026's third execution). **Since 2026-10-06 (OQ-202, `PD-ORCH-006`)**
   a coordinator its run grants the direct-work bundle is told to do the work itself (`entryInstructionsFor`), where
   its instructions had said it modified nothing while its listing offered the writing tools. **Since 2026-10-06 (K3 of
   the default live run at `c2fdd6a`)** the entry role's playbook takes the catalogue's `entry` ROUTE variant (`entryCell`)
   where its row resolves `routed`, so the coordinator is no longer told "the coordinator routed it to you"; a delegated
   child keeps `routed`. The entry role is the persona the root runs on (`PreflightDeps.entryRole`), which names the
   audited entry cell and the BUDGET row; it was the literal `orchestrator` until that repair's verifier found a run
   started as another persona audited with a cell no agent received.

12. **lifecycle hooks (2026-09-03/04):** the set is resolved once at run start from the two `agents.yaml` scopes,
   gated on provenance (a workspace's list runs only under a stored approval keyed by its fingerprint; withheld
   hooks are announced once and the displaced global entries reinstated), narrowed by the policy toggles, joined
   by the enabled Claude Code imports, and fixed for the run. `session_start` fires ahead of iteration 1,
   `iteration_end` before the next iteration, `child_completed` once a child settles (whichever path settles it inside
   a run, since 2026-09-30; OQ-154 asked about the paths outside one, and the owner's ruling of 2026-10-06,
   [`PD-HOOKS-001`](../../product/directives/pd-hooks-001.md#pd-hooks-001), fires none there), `session_end` with the one
   status string; a permitted tool call passes the `pre_tool` slot (a stop is a `blocked` row with REQ-HOOKS-049's
   text) and, having run, the `post_tool` slot (feedback in the same result, or a following user message).
   Every invocation is one `hook.start`/`hook.finish` pair and one `hook_run` entry written before the event;
   a warning is a `hook_failure` issue; three failures switch a hook off once. Settings → Hooks is the one venue
   for the trust decision; its review dialog is the only surface that shows a command. **Found:** kernel's
   redaction pass was quadratic (the eighth defect, on ADR-0007); on Windows a timed-out hook always spends the
   5 s grace because `cmd.exe` is never the command; the single notice slot loses the advisory to the run's outcome.

11. **children and the scheduler (2026-09-03):** the orchestrator is coordination-only (`REQ-ORCH-029`; `ROTARIS_RUN_OVERRIDE=single`
   grants it the direct-work bundle and withholds `delegate`; since 2026-10-07 the entry port's gate refuses a task's second
   work item until the coordinator has written its own todo list, `Run.todoListOwed`, OQ-213, and a background child's
   completion notification names the coordinator's open plan items, REQ-ORCH-059). A `delegate` call is admitted through the five checks in
   order and creates one row in the ledger — `queued`, `waiting_on_dependencies`, or `waiting_on_model_slot` behind a
   cap — and the scheduler's pass claims it (one conditional update), runs it as its own turn loop under its persona
   and tool grant, tags its rows by its canonical name, produces its report through the bounded summarising pass,
   settles it through the one transition function, and resumes the parent with the report. The tree beside the
   transcript paints every child's state; the run header cancels one. **Found:** the slot is held from the claim,
   not from `running` (a reading pinned by test); REQ-ORCH-053's sweep has no route until `continue` exists — the route exists since 2026-09-05 (entry 14).

10. **the permission gate and the first tools (2026-09-03):** the model is offered the ONE resolution's tool
   listing; a step's tool calls go through the gate — payload repaired and validated, permission resolved
   (never raises), an `ask` brokered to the approval dialog (a modal `BrowserWindow`, one per window, oldest
   first) or the headless policy, every decision audited into the ring with `permission.decision`, the
   evidence record opened at `tool.start` and settled once at `tool.finish`, a deny returned as
   `REQ-TOOLS-013`'s text and never an abort — then the tool runs and the turn steps again until no call is
   requested. Tool rows, the diff row, the trailer rows, the mode selector and the strip flags paint it.
   `read_file`, `write_file`, `haet_read`, `haet_edit`/`haet`, `grep`, `glob`, `todo`, `terminal` exist;
   `git_commit`, `artifact_*`, `ask_questions` and the delegation tools are removed by the registry
   with a reason code until their ADRs land (`fetch` landed 2026-09-05, entry 20). **Found:** ADR-0020's marker detection read the PTY's echo of
   the wrapper before the shell's frame (the seventh first-execution defect); main's dialog `closed` handler
   walked into the destroyed-window pitfall and the native error box it raised wedged main.

9. **the backup and the restore behind the real run host (2026-09-03):** Settings → Project offers both.
   A backup is taken in the workspace service while runs continue; a restore is refused while a run is
   active, otherwise assessed read-only, confirmed through main's message boxes (what it does to the
   store now; both identifiers and ESC-26's three outcomes where they differ; foreign lock rows as one
   condition with the risk), performed by the service with the run host told to refuse, close, and
   reopen through narrow requests back to main, and the workspace re-handed to the run host afterwards.
   The previous store is displaced and kept. **Found:** ADR-0058's case (b) has no route in the product,
   because opening a workspace mints its identifier before a restore can be asked for.

Every view body but Overview, Workspace, Git and Settings reads "Not drawn yet"; Settings draws Models, Personas, Runtime, Interface, Hooks and Project.

**The runtime keys come from `runtime:`** (ADR-0036, 2026-09-05; `runtimeFromConfiguration` in
`run-host/configuration.ts`): `permission_mode`, `approval_timeout_seconds`, `headless_approval_policy`,
`allow_outside_workspace`, `allow_unsandboxed_autonomous`, `session_log_level`, `shell_command_timeout`,
`additional_read_only_roots`, `max_depth`/`max_children`/`max_active_children` (the child budget, clamped by the
BUDGET cell), `max_iterations`, `task_consecutive_retry_limit`, `auto_retries_transient`, `model_timeout`,
`event_retention_per_session`, `shutdown_drain_timeout`, `loop_classification_timeout`. `sandbox_mode` is read
and never honoured (ADR-0022 has no backend here). **The persona table** (`engine/src/children/personas.ts`:
REQ-ORCH-028's thirteen roles, the two aliases, our own system prompts) is the built-in layer `personas:` overlays —
stated fields win, `system_prompt`/`system_prompt_file` replace the prompt, a configured role is a new role
(decision 3 of the plan); **the delegation strategy** is `rotaris.delegation_strategy` (`single` grants the entry
role the direct-work bundle and withholds `delegate`; `swarm` adds REQ-ORCH-025's demand for maximum parallel delegation to
the entry role's instructions as the last thing its prompt carries, after the MCP section, `runOverrideLayer` composed by
`runTurn`'s `withRunOverrideLayer`, since 2026-10-06 — none on a run granted the bundle, `PD-ORCH-006` revision 3, OQ-205 as ruled under R-072); **the per-model cap** is each entry's stated `max_parallel`, else the cap its provider's catalogue entry declares (`modelCapInForce`, PD-PROVIDER-001, since fin22), counted across every session the run host holds a place for, a paused child's kept place included
(`children/model-slots.ts`, since 2026-09-30 — acceptance A13; OQ-148, OQ-149, OQ-150). **A bound
of 100 model steps per root turn** (`RUN_CONFIG_DEFAULTS.maxStepsPerTurn`) is a final belt behind the loop supervisor; delegated children have no step cap (`PD-ORCH-017`, 2026-10-16)
(`REQ-ORCH-099..107`, built 2026-09-05 — ADR-0059). `ROTARIS_CHILD_SCRIPT` and the
`delegate:<persona>:<name>[:after]` and `fail` steps drive the scripted client's children for verification only. The `todo` tool's list is per session in memory; its persistence waits on the
per-child record of Part B (`REQ-ORCH-043`). `ROTARIS_SCRIPT` drives the scripted client's tool calls for
verification only; each agent keeps its own place in its list, and an agent resumed from its record (PD-ORCH-005, in the
same process or after a relaunch) carries on with the step after the ones that record holds (repaired 2026-09-29). **The hooks read their two file scopes for real** (`<config>/agents.yaml` and
`<workspace>/.rotaris/agents.yaml`, REQ-CONFIG-001) through `@rotaris/config`; `ROTARIS_CONFIG_DIR` and
`ROTARIS_CLAUDE_SETTINGS_PATH` are the specification's own variables (REQ-HOOKS-110/115), not stopgaps.
`ROTARIS_CAPTURE_HOOK_REVIEW`, `ROTARIS_CAPTURE_REVIEW_PNG`, `ROTARIS_CAPTURE_SETTINGS` and
`ROTARIS_CAPTURE_ACTION=hooks-review` drive the review dialog and the Hooks tab for verification only.
**The classifier's model slots come from the configuration** (`small_model`, `fallback_model`, `default_summary_model`
resolved to `models:` entries; ADR-0036) and **so does the tier** since Part K: the slot alias the entry role's model
resolved through (`resolved_persona_model_tiers`; none → undetermined → medium with REQ-ORCH-023's header).
`ROTARIS_MODEL_TIER` was the stopgap until then and is gone. `<config>/intent-tools.yaml` and the two
`playbooks/` directories are this build's file formats (decision 5 of the intent part). `ROTARIS_INTENT_SCRIPT`
(`<category>` | `garbage` | `timeout` | `reject` | `none`) drives the scripted client's classifier for verification
only. The `normal` cell no longer stands in: the BUDGET slot clamps.

**Themes and preferences.** Built-in themes are typed data in `packages/contracts/src/theme/`; the colour
mathematics and static contrast assertions live beside the data because main needs the dark flag and window
ground before first paint. UI projects the selected theme to `--rt-*` custom properties. The preference store
is a typed closed registry in `packages/platform/src/preferences.ts`, rooted by
`ROTARIS_PREFERENCES_ROOT`, then the standard configuration home on Linux alone (OQ-33, since fin22), then the platform per-user settings location.
The theme write is synchronous and flushed. `ROTARIS_CAPTURE_THEME`, `ROTARIS_CAPTURE_SCALE` and
`ROTARIS_THEME_PROOF_DIR` are verification seams.

**What `pnpm theme-proof` does.** It builds Electron and launches one isolated process for each of three themes
at scale factors 1, 1.25, 1.5, 1.75 and 2. Each process captures all seven views, all thirteen Settings
categories, keyboard focus positions and a live theme switch. The script samples painted PNG pixels, checks
focus bands, rail-label fit, vector-icon scale, complete recolouring, preserved composer/view state and
renderer errors, then writes its result table under `.proof/theme-proof/`. Since 2026-09-30 a text's contrast is read
only from its on-screen part: its box cut by the window and by every ancestor that clips it. A text with less than one
em on screen is reported as skipped, with its size, and is not measured (`apps/desktop/scripts/lib/text-sample.mjs`).
Before that, a status-strip item scrolled 1.2 px onto the screen was read as a glyph's edge
(`../../defects/fixed/theme-proofs-text-contrast-verdict-depends-on-the-checkouts-path.md`). Since 2026-10-01 the contrast
verdict is bounded by what it measured (`apps/desktop/scripts/lib/contrast-coverage.mjs`): every capture needs at least
one measured text inside its own surface (the view's root, or the Settings view's) and at most 25% of that surface's
texts skipped, and the run at most 10% of all its texts skipped; the skips are counted by reason. Before, a surface whose
own text was gone passed on the shell around it
(`../../defects/fixed/theme-proofs-contrast-verdict-sets-no-bound-on-the-texts-it-skips.md`). Three counterfactual commands
lower text or focus contrast, or push the Workspace view off the screen, and must exit non-zero. The first execution and its coverage boundary are
`spikes/theme-proof.md`.

**The loop supervisor and `continue`.** `packages/engine/src/run/supervisor.ts` (ADR-0059) and
`packages/config/src/circuit-breaker-section.ts`; the classifier at the run-host root (`run-host/loop.ts`).
`SessionWriter.open` and `Sessions.resume`/`prompt` (`engine/src/sessions.ts`) are the route; `session.list`
and `session.resume` cross the boundary as commands and run-host requests; `ui/src/SessionBrowser.tsx` is the
surface, a window-modal overlay opened from the title bar. The host-level circuit-breaker toggle is the
environment stopgap `ROTARIS_CIRCUIT_BREAKER=off` until Settings → Runtime (`REQ-CONFIG-323`).
`ROTARIS_SCRIPT=loop:<tool>:<n>`, `ROTARIS_LOOP_SCRIPT` and `ROTARIS_CAPTURE_RESUME` are verification seams.
Decisions taken here for the owner: the supervisor's shape (ADR-0059); the belt of 100 steps stays for roots only (children uncapped since PD-ORCH-017); the
browser offers **open** only; steering and todo corrections wait, and with them the consecutive counter's
reset on anything but a real prompt.

**What `pnpm part-h-proof` does.** It builds Electron and launches the app three times against scratch stores:
once with a scripted agent repeating one tool call (asserting three activations, one escalation issue and the
`agent_session_aborted` stop reason from the store); then a first run that completes, a `running` child row
planted by hand, and a relaunch that opens the stored session from the Sessions browser and continues it
(asserting the identity, the row order, the carried-intent status row, the settled child, one ordinal series
and no lock left behind). Since fin42 (N56) it also re-queues a coordinating root that ignored its plan correction and reads
the held answer in the next root's first message (`plan-held`, PD-ORCH-015), and meets PD-ORCH-009's silent root through the
scripted `silent` step (`answerless`, `answer-when-asked`), with loop supervision on and, since `PD-ORCH-009` revision 3
(OQ-282), no loop classification and no stuck activation for the re-prompted turn; since revision 4 (fin44, OQ-283 and OQ-284)
its `silent-correction` and `silent-child` launches show the same for a plan correction and a child's re-prompt, and since
revision 5 (fin45, OQ-296) its `silent-wait` launch for a root that waits silently on three background delegations in turn,
resumed each time with the child's report alone and never escalated; since 2026-10-20 (OQ-364, loc1) its `loop-reordered`
launch (`ROTARIS_SCRIPT=loop:readreorder:20`, one `read_file` value with its keys in the repeating order A, A, B) requires three
activations, the first `repetition`, one escalation and `agent_session_aborted` (`loop-reordered-observed.json`). Its evidence lands
under `.proof/part-h-proof/`.
