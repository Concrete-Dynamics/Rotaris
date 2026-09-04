# The codebase — how the architecture is laid out in code

- **Created:** 2026-09-03, with the walking skeleton (the first production code in this repository).
- **Governs:** where a thing goes, what it may import, and which lint proves it.
- **Reads with:** [`README.md`](README.md) §1 (the four process kinds), the ADRs each package cites,
  and [`implementation-conditions.md`](implementation-conditions.md).

## Packages follow process boundaries, not features

The ADRs' hardest rules are about *which process may hold what*: main never opens the store (W-01);
renderers are sandboxed with no filesystem (ADR-0044); only the run host holds session locks
(ADR-0005); only the workspace service resolves an identifier or runs a migration (W-18, W-02). A
feature package importable from any process cannot make those rules structural. So the packages are
layers with a downward-only dependency direction, and `eslint-plugin-boundaries` fails `pnpm lint` on
a violation — `tools/eslint-rules/rules.test.ts` proves it does.

```
apps/desktop/src/{main, preload, renderer, run-host, workspace-service}   composition roots
   │  the only places `electron` is imported (and packages/shell/src/electron/, its adapters)
   ▼
shell        ui / ui-core        engine · agent-tools · model · mcp        workspace
(main-side)  (renderer-side)     (run-host-side)                           (workspace-service-side)
   │              │                       │                                    │
   │              │                       ▼                                    ▼
   │              │                     store   ─ better-sqlite3 behind one DAL; schema; restore
   │              │                       │
   ▼              │                       ▼
platform   ◄──────┼──────────────── (never from ui / ui-core)   Node adapters, no Electron
   │              │
   ▼              ▼
contracts  ◄─── the five channels, commands, control ops, the seven views, process protocols
   │
   ▼
kernel     pure: Result, ids, time, the clock ports, generated requirement symbols
```

| Package | Process | Holds | Cites |
|---|---|---|---|
| `@rotaris/kernel` | any | `Result`, branded ids, `Millis`/`Instant`/`Budget`, `MonotonicClock`/`WallClock`/`Timers`, `FakeClock`, `REQ` (generated) | ADR-0006 |
| `@rotaris/contracts` | any | channel schemas (zod), command envelope, 21 control ops, `PRIMARY_VIEWS`, process protocols, the status vocabularies and presentation mapping (`status.ts`), `CONTRACT_SCHEMA_VERSION` | ADR-0010, ADR-0044, REQ-SHELL-023, REQ-SESSION-073, REQ-NOTIFY-048/049/050 |
| `@rotaris/platform` | main, run host, workspace service | clocks, per-user dirs (local-not-roaming), atomic document, liveness probe + lock predicate, machine id, canonical path, instance record + claim, spawn | ADR-0004, ADR-0055, REQ-STARTUP-145, REQ-SESSION-046/051–054 |
| `@rotaris/config` | run host, workspace service | ADR-0036's loader, first slice: the YAML document tree over a tri-state model (`yaml@2.9`), the `hooks:` section read per scope and merged with the displaced lists kept, REQ-HOOKS-025's one command-pattern definition; takes no database handle | ADR-0036, REQ-HOOKS-007–018, REQ-HOOKS-025 |
| `@rotaris/hooks` | run host | ADR-0015: the matcher, the payload builder over kernel's one redaction pass, the runner (fresh process per invocation, resolve on exit plus a grace, kill the started process only), the verdicts and every message text, the trust gate and fingerprint, the external import, the policy file, the per-session `HookEngine`, the tab summary; the engine's `HookPort` and the gate's `ToolHooks` are filled at the run-host root | ADR-0015, REQ-HOOKS-019–139 |
| `@rotaris/store` | run host, workspace service | open (WAL read back, write probe, one canonical spelling), schema v2 + migrations, the DAL (rows with residency, events with the derived envelope and three declared indexes, the truncation record), identifier + resolution, backup, the corrected restore | ADR-0058, ADR-0005, ADR-0009 |
| `@rotaris/engine` | run host | **children/**: the ledger over the writer's one transition function, admission, the scheduler run to quiescence, the one wait, the child's execution and report, the parent's resume loop, the sweeps, the built-in persona table;  `SessionWriter` (one transaction per unit of work, residency release, trim, sticky failure, the launch audit, the timeline, the terminal transaction), the one serialiser and the 23-type catalogue, `ProjectionOwner` (resident rows, the counter, growth tick, attach/reconcile), `Sessions` (the registry, the control channel, the run-active predicate), `run/` (`Run`, `StopRequest`, the stop conditions and every total mapping, the todo, the aggregates, `EventBus`, `SummaryWriter`), `RefusalLease`, `HookPort` (the engine's view of ADR-0015; `hooks-port.ts`), **intent/** (the classifier ladder, the gate), **playbooks/** (the catalogue, the matrix, the render, the clamp), `Preflight` | ADR-0008, ADR-0009, ADR-0010, ADR-0013, ADR-0014, ADR-0043 |
| `@rotaris/model` | run host | the two ports (`ModelClient`, `AgentBackend`), `DefaultAgentBackend`, `ScriptedModelClient` (tests), `AiSdkModelClient` (pinned SDK, one decorated `fetch`); engine → model is a downward edge in the matrix | ADR-0026, ADR-0027 |
| `@rotaris/agent-tools` | run host | the registry (facets, classes, the four-stage fold), the scanner, the egress classifier, the policy (build once, evaluate pure, the atomic swap, session approvals), the approvals registry + presenter capability with the liveness lapse, the ONE gate (`REQ-TOOLS-175`'s order, both hook slots empty), the file/hash-anchored/search/todo executors, the terminal (PTY + marker protocol, background sessions, classification); the engine's `ToolPort` is filled at the run-host root, never by an import | ADR-0016–0020, ADR-0023 (classifier), ADR-0024 |
| `@rotaris/mcp` | run host | the transport shape today; the MCP client next | ADR-0033–0035 |
| `@rotaris/workspace` | workspace service | the backup and the two-phase restore around the store's mechanism (assessment, the identifier cases, ESC-26's establishment after the store is whole), git denylist + network set; config, git helper, checkpoints, traceability, delivery next | REQ-SESSION-201, ADR-0058, ESC-26, ADR-0036–0041 |
| `@rotaris/shell` | main | `UpdateRelay` (fan-out, order across both channels, message counters), `ProcessLink` (bounded request/reply, and the child's narrow requests back to main) | ADR-0044, ADR-0013, ADR-0002 c.7, c.11 |
| `@rotaris/ui-core` | renderer | the replica store with the step-0 sequence check, the decline, paging older rows, rows kept across a snapshot; the notice store; **no React** | ADR-0043, ADR-0046, ADR-0049, ADR-0057, REQ-SESSION-161 |
| `@rotaris/ui` | renderer | `AppShell` (with the one persistent notice), `NavRail`, `WorkspaceView` (user/agent/system rows, the growing row, the composer, the stop control), `SettingsView` (the thirteen categories; Project hosts backup and restore), local shell state, the design system wired in | ADR-0048, ADR-0049, REQ-SHELL-024–028, -049, -114, -153, REQ-CHAT-001–005, -011, REQ-SESSION-186, -201, REQ-CONFIG-268/269 |
| `tools/symbol-artifact` | build + test | generates `kernel/src/generated/requirements.ts` from `docs/spec` | ADR-0040 #4, ADR-0056 |
| `tools/release-naming` | build | the four artifact names, the one authority | REQ-STARTUP-031 |
| `tools/eslint-rules` | lint | `no-bare-timers`, `no-electron-outside-roots` | ADR-0006 |

**Dependency injection is constructor injection at the composition roots.** No container. Every I/O
capability is a port in `kernel` (or a small interface beside its consumer) with one adapter; the
five entries wire the real ones, tests wire fakes. That is what lets the apply pipeline run in a
plain process with no React and the restore run against a fake run host with a controlled clock.

## The disciplines, mechanised

- **Boundaries** — the matrix in `eslint.config.js`; `apps/desktop` is split into its five roots so
  the renderer cannot reach `platform` or `store` and main cannot reach `store`.
- **No bare timers in engine code** — `rotaris/no-bare-timers` over `kernel`, `engine`, `agent-tools`,
  `workspace`, `store`, `platform`, `model`, `mcp` and the two utility-process roots. Named
  exceptions: `kernel/src/clock/` (it *is* a clock) and `platform/src/clock.ts` (it *is* the adapter).
- **No `electron` outside the roots** — `rotaris/no-electron-outside-roots`.
- **No Node built-ins in renderer code** — `no-restricted-imports` over `ui`, `ui-core`, renderer, preload.
- **The IPC payloads carry no secret** — `contracts.test.ts` walks every channel schema.
- **The symbol artifact is regenerated before collection** — vitest `globalSetup`, same generator as
  the build. A withdrawn identifier is `@deprecated` and warns at every reference (REQ-TRACE-181).
- **A window is held by id, never by handle, past its creation** — `webContents` on a destroyed
  window throws, and a throw from a `closed` handler during exit wedges the process behind a modal
  error dialog (ADR-0044 first-execution note). The relay attaches by id; `send` checks `isDestroyed()`.
- **Nothing in main reaches the platform's own presenter** — every dialog is opened in its asynchronous form (ADR-0019),
  and main logs an uncaught exception instead of letting the platform show it in a native error box, which is the
  same synchronous modal by another door (found on the approval dialog's first execution).
- **A hook process is killed alone; a terminal command's tree is killed together** — ADR-0015 forbids widening a
  hook's termination to its group and ADR-0020 requires it for a command; the two paths share no kill code
  (`hooks/runner.ts` calls `kill()` on the one process, `terminal/foreground.ts` runs `taskkill /T`).
- **The redaction pass is bounded, not merely correct** — every pattern that scans an unbounded alphanumeric run
  is capped or anchored (ADR-0007 first-execution note); `redaction.test.ts` pins 100 KB under 50 ms.
- **A PTY repeats the marker back before honouring it** — the terminal's end-marker detection matches the marker
  FOLLOWED BY DIGITS on the VT-stripped stream, never the first occurrence of the marker text, because the
  echoed wrapper carries that text (ADR-0020 first-execution note). `node-pty` loads from its prebuilds under
  Node and Electron alike and is externalised beside `better-sqlite3`.
- **The engine owns the `ToolPort` and `GateSink` interfaces; the run-host root fills them** — `engine` never
  imports `agent-tools` and `agent-tools` never imports `engine`, so the boundaries matrix has no edge between
  them to police.
- **Icons are `@phosphor-icons/web` classes** (`ph ph-<name>`), imported in the renderer root; the
  design assets carry the same two fonts and are not referenced directly.
- **A whole-session update keeps the transcript rows** — `REQ-MONITOR-216` omits the transcript from it, so
  it cannot say which rows survived; the increment after an attach or a reconcile upserts by index. The
  first run loop's status saves emptied a transcript still being written before this was so (ADR-0043
  correction note). A test pins it.
- **Every total mapping between the closed vocabularies lives once** — `contracts/src/status.ts` for what a
  surface needs, `engine/src/run/stop-conditions.ts` for what a run decides; a token outside a closed set
  yields `error` with a diagnostic, never a guessed success (REQ-EVENTS-026, REQ-SESSION-187).
- **Implementation conditions are markers at the module they bind** — `TODO(IC-4)` in
  `platform/src/machine-id.ts` (half 2, the rename), `TODO(IC-6)` in `apps/desktop/electron-builder.yml`.
  IC-5's marker went with its discharge.
- **A verification run drives the dialogs from the environment** — with `ROTARIS_CAPTURE_PNG` set, main
  answers the save and open dialogs from `ROTARIS_CAPTURE_BACKUP_TO` / `ROTARIS_CAPTURE_RESTORE_FROM`
  and every message box from `ROTARIS_CAPTURE_ANSWERS`, logging each box's full text; a user-driven run
  never enters those branches. A box with no scripted answer is a real dialog and blocks — by design.

## A test reads the plan, not only the time

Spike 8 found an index that was declared, migrated, present and never chosen by the planner; every
test had passed because none reads a query plan. `store.test.ts` now asserts the plan of each budgeted
query (`REQ-EVENTS-117`'s axes, `REQ-SESSION-042`'s listing) names its index. Add one for every index
you declare; a timing alone reads as "slow", not as "dead".

## What `pnpm package` does, and refuses

`apps/desktop/scripts/package.mjs`: `electron-vite build`; `electron-builder --win` with two hooks
(`scripts/build-hooks.cjs`) — `beforeBuild` removes every copy's `build/`, stamps the rebuild marker and runs
@electron/rebuild by name over the binding set, cold, from source; `afterPack` holds rule 1a (a compiled
binary newer than the marker, byte-identical in `app.asar.unpacked`, no prebuild in the asar index), rule 4
(`scripts/native-load-probe.cjs` as the packaged `Rotaris.exe` under `ELECTRON_RUN_AS_NODE`, reporting what
`dlopen` opened) and the `REQ-STARTUP-031` name; then the packaged application runs a scripted session with a
terminal call against a scratch store under `release/scratch/`. Evidence in `release/load-proof.json`.
`ROTARIS_IC6_COUNTERFACTUAL=no-force|keep-prebuild` constructs D10's condition; the build must refuse.
`ROTARIS_PACKAGE_DIR_ONLY=1` stops at `win-unpacked`; `ROTARIS_PACKAGE_SKIP_APP=1` skips the launch. A cold
rebuild of both bindings is ~3 minutes on every run, by design. Windows only (IC-3). The app's `dependencies`
are exactly what electron-vite externalises for main and the run host — the workspace packages are
`devDependencies`, bundled through aliases; the renderer dedupes `react`, `react-dom` and `zustand`
(`spikes/native-load-proof.md` §4).

## What the walking skeleton does, and nothing more

`pnpm build` then `electron apps/desktop/out/main/index.js`:

1. main claims the instance with our own record file (ADR-0055 alt I) before `app.whenReady()`;
2. forks the run host and answers its `hello`;
3. opens one sandboxed window that paints the shell — title bar, notice slot, the seven-view rail in
   `REQ-SHELL-023`'s order with `Ctrl+1..7`, an empty view body, the status strip — in `rotaris-dim`;
4. a workspace directory on the command line is handed to a per-workspace service, which establishes
   the identifier, opens and migrates the store, and hands the **resolved path** to the run host;
5. a second launch is handed over and exits with no window; a carried workspace is honoured;
6. a run-host exit is logged and **not** re-forked (ADR-0002).

7. **the first mechanism with behaviour (2026-09-03):** a prompt submitted in the Workspace view's
   composer starts a session in the run host — session row, lock row, history open, `session.start` —
   and records the prompt as row 0 (`user`) with its `transcript.row` event in one transaction; the
   projection owner publishes the snapshot and the increment with one counter; main relays; the
   replica applies with the step-0 check; the row paints with role `you` and its time.

8. **the run loop (2026-09-03):** the prompt is consumed. The session goes `starting` → `running`
   (REQ-SESSION-087: aggregates rehydrated, the one-shot launch audit, `run_start`), one iteration runs
   the root agent over the model port, an `agent` row appears on the first delta and grows on the 50 ms
   tick, `usage.update` and `iteration.end` are recorded, the stop conditions are evaluated between
   iterations, and teardown records the system row, releases the lock, records `session.end` then
   `result` and the terminal status in one durable transaction, then rebuilds `summary.md` off the path.
   The stop control cancels gracefully and a second press forces; the outcome is presented once as the
   persistent notice; the status strip shows the presentation vocabulary. Every event is recorded then
   forwarded on the bus with the 5 s bound. **No tool, no child, no hook, no intent classification, no
   verification**: one task, one agent, one turn per iteration.

**Where the model comes from — the configuration files** (`apps/desktop/src/run-host/configuration.ts`,
ADR-0036/0037, built 2026-09-05): the entry role's `models:` entry — its `base_url` or the provider's known endpoint
(`openai`), `api_mode` → dialect, `api_key` or `api_key_env` read per request — loaded once per run start with the
screen's live state on top. `ROTARIS_MODEL_DIALECT=scripted` selects the scripted client for every model
(verification only); a `models:` entry with provider `scripted` does the same per entry. A fatal file or an
unreachable entry model refuses the run before it starts (REQ-EVENTS-021, REQ-CONFIG-478). The classifier,
summariser and loop slots authenticate with the entry model's resolver until ADR-0029 (credentials) lands.

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
   order over actions (whole-argument sameness), a small-model classifier on the intent ladder bounded by
   `runtime.loop_classification_timeout`, `REQ-ORCH-104`'s fallbacks, escalation at the third consecutive
   activation — the child failed with `circuit_breaker_escalation`, the root's run ended `agent_session_aborted`;
   `circuit_breaker:` in `agents.yaml`; "● CB armed" in the status strip. A stored session is listed and opened
   from the title bar's "Sessions" browser (`REQ-SHELL-126`), its lock re-claimed with one local reap, its
   orphaned children settled `cancelled` before the first iteration (`REQ-ORCH-053`'s route), and the next prompt
   **continues** it: the row first, then a run on the same session with the previous intent carried over when
   the fresh classification is unusable and the `REQ-SESSION-115` payload under its budgets; ordinals continue
   the series. **Found:** the supervisor's repetition and cycle triggers were judged over a series holding the
   assistant's text — the tenth defect (ADR-0059).

13. **intent classification and the playbooks (2026-09-04):** before the coordinator exists the prompt is classified
   through the first configured model slot over a three-rung ladder bounded at 8.0 s — every failure the fallback
   intent with a reason, shown in the Workspace view and recorded in the launch audit with the grant and the
   resolved playbooks; the two simplest intents (or a `single` override) grant the entry role the direct-work
   bundle by facet; every role's instructions carry the playbook its row resolves to (role × intent-or-group-or-
   default × tier-or-any, overrides from `playbooks/` at two scopes, unknown names warned and ignored); the BUDGET
   slot clamps the child policy. Settings → Personas lists the catalogue. **Found: nothing** — the first part of
   this record to run clean against the scripted client on its first execution.

12. **lifecycle hooks (2026-09-03/04):** the set is resolved once at run start from the two `agents.yaml` scopes,
   gated on provenance (a workspace's list runs only under a stored approval keyed by its fingerprint; withheld
   hooks are announced once and the displaced global entries reinstated), narrowed by the policy toggles, joined
   by the enabled Claude Code imports, and fixed for the run. `session_start` fires ahead of iteration 1,
   `iteration_end` before the next iteration, `child_completed` once a child settles, `session_end` with the one
   status string; a permitted tool call passes the `pre_tool` slot (a stop is a `blocked` row with REQ-HOOKS-049's
   text) and, having run, the `post_tool` slot (feedback in the same result, or a following user message).
   Every invocation is one `hook.start`/`hook.finish` pair and one `hook_run` entry written before the event;
   a warning is a `hook_failure` issue; three failures switch a hook off once. Settings → Hooks is the one venue
   for the trust decision; its review dialog is the only surface that shows a command. **Found:** kernel's
   redaction pass was quadratic (the eighth defect, on ADR-0007); on Windows a timed-out hook always spends the
   5 s grace because `cmd.exe` is never the command; the single notice slot loses the advisory to the run's outcome.

11. **children and the scheduler (2026-09-03):** the orchestrator is coordination-only (`REQ-ORCH-029`; `ROTARIS_RUN_OVERRIDE=single`
   grants it the direct-work bundle and withholds `delegate`). A `delegate` call is admitted through the five checks in
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
   `fetch`, `git_commit`, `artifact_*`, `ask_questions` and the delegation tools are removed by the registry
   with a reason code until their ADRs land. **Found:** ADR-0020's marker detection read the PTY's echo of
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

Every view body but Workspace and Settings reads "Not drawn yet"; Settings draws Models, Personas, Runtime, Interface, Hooks and Project.

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
role the direct-work bundle and withholds `delegate`); **the per-model cap** is each entry's `max_parallel`. **A bound
of 100 model steps per turn** (`RUN_CONFIG_DEFAULTS.maxStepsPerTurn`) is a final belt behind the loop supervisor
(`REQ-ORCH-099..107`, built 2026-09-05 — ADR-0059). `ROTARIS_CHILD_SCRIPT` and the
`delegate:<persona>:<name>[:after]` and `fail` steps drive the scripted client's children for verification only. The `todo` tool's list is per session in memory; its persistence waits on the
per-child record of Part B (`REQ-ORCH-043`). `ROTARIS_SCRIPT` drives the scripted client's tool calls for
verification only. **The hooks read their two file scopes for real** (`<config>/agents.yaml` and
`<workspace>/.rotaris/agents.yaml`, REQ-CONFIG-001) through `@rotaris/config`; `ROTARIS_CONFIG_DIR` and
`ROTARIS_CLAUDE_SETTINGS_PATH` are the specification's own variables (REQ-HOOKS-110/115), not stopgaps.
`ROTARIS_CAPTURE_HOOK_REVIEW`, `ROTARIS_CAPTURE_REVIEW_PNG`, `ROTARIS_CAPTURE_SETTINGS` and
`ROTARIS_CAPTURE_ACTION=hooks-review` drive the review dialog and the Hooks tab for verification only.
**The classifier's model slots come from the configuration** (`small_model`, `fallback_model`, `default_summary_model`
resolved to `models:` entries; ADR-0036) and **the tier is the one remaining environment stopgap** (`ROTARIS_MODEL_TIER`,
ADR-0028's; unset → undetermined → medium with REQ-ORCH-023's header). `<config>/intent-tools.yaml` and the two
`playbooks/` directories are this build's file formats (decision 5 of the intent part). `ROTARIS_INTENT_SCRIPT`
(`<category>` | `garbage` | `timeout` | `reject` | `none`) drives the scripted client's classifier for verification
only. The `normal` cell no longer stands in: the BUDGET slot clamps.

**Themes and preferences.** Built-in themes are typed data in `packages/contracts/src/theme/`; the colour
mathematics and static contrast assertions live beside the data because main needs the dark flag and window
ground before first paint. UI projects the selected theme to `--rt-*` custom properties. The preference store
is a typed closed registry in `packages/platform/src/preferences.ts`, rooted by
`ROTARIS_PREFERENCES_ROOT`, then the standard configuration home, then the platform per-user settings location.
The theme write is synchronous and flushed. `ROTARIS_CAPTURE_THEME`, `ROTARIS_CAPTURE_SCALE` and
`ROTARIS_THEME_PROOF_DIR` are verification seams.

**What `pnpm theme-proof` does.** It builds Electron and launches one isolated process for each of three themes
at scale factors 1, 1.25, 1.5, 1.75 and 2. Each process captures all seven views, all thirteen Settings
categories, keyboard focus positions and a live theme switch. The script samples painted PNG pixels, checks
focus bands, rail-label fit, vector-icon scale, complete recolouring, preserved composer/view state and
renderer errors, then writes its result table under `.theme-proof/`. Two counterfactual commands lower text or
focus contrast and must exit non-zero. The first execution and its coverage boundary are
`spikes/theme-proof.md`.

**The loop supervisor and `continue`.** `packages/engine/src/run/supervisor.ts` (ADR-0059) and
`packages/config/src/circuit-breaker-section.ts`; the classifier at the run-host root (`run-host/loop.ts`).
`SessionWriter.open` and `Sessions.resume`/`prompt` (`engine/src/sessions.ts`) are the route; `session.list`
and `session.resume` cross the boundary as commands and run-host requests; `ui/src/SessionBrowser.tsx` is the
surface, a window-modal overlay opened from the title bar. The host-level circuit-breaker toggle is the
environment stopgap `ROTARIS_CIRCUIT_BREAKER=off` until Settings → Runtime (`REQ-CONFIG-323`).
`ROTARIS_SCRIPT=loop:<tool>:<n>`, `ROTARIS_LOOP_SCRIPT` and `ROTARIS_CAPTURE_RESUME` are verification seams.
Decisions taken here for the owner: the supervisor's shape (ADR-0059); the belt of 100 steps stays; the
browser offers **open** only; steering and todo corrections wait, and with them the consecutive counter's
reset on anything but a real prompt.

**What `pnpm part-h-proof` does.** It builds Electron and launches the app three times against scratch stores:
once with a scripted agent repeating one tool call (asserting three activations, one escalation issue and the
`agent_session_aborted` stop reason from the store); then a first run that completes, a `running` child row
planted by hand, and a relaunch that opens the stored session from the Sessions browser and continues it
(asserting the identity, the row order, the carried-intent status row, the settled child, one ordinal series
and no lock left behind). Its evidence lands under `.part-h-proof/`.

**Configuration.** `packages/config/src/` — `load.ts` (the one entry point, no database handle), `merge.ts` (the four
classes; the overlay shared with the per-field writer through a mapping adapter), `sections/`, `slots.ts`, `validate.ts`,
`writers.ts` (bootstrap, per-field, desktop save, model preferences), `tiers.ts` (Tier B), `preferences.ts` and
`snapshot.ts` (what the screen reads). The run host resolves a run's setup in `run-host/configuration.ts`; the
workspace service commits Tier A; contracts carry `ConfigSnapshot`, `DesktopSave`, `LiveState` and the `config:changed`
channel. Decisions taken here for the owner: the built-in roles' default tiers; `api_key_env` as the credential until
ADR-0029; the composer's write also updating the pending state (REQ-CONFIG-423); the proof scripts writing a scratch
`agents.yaml`. `ROTARIS_CAPTURE_CLICKS` and `ROTARIS_CAPTURE_SELECT` are verification seams.

**What `pnpm config-proof` does.** It builds Electron and launches the app five times against commented files at
both scopes: Settings → Runtime toggles "Allow outside workspace" through its confirmation and saves (every other
line as written, the global file untouched); Settings → Models chooses a slot and its strength and saves; a toggle
then Discard writes nothing; the composer's control writes `runtime.permission_mode` with no run active; a file
with `max_depth: many` refuses the run naming the file, the workspace scope and `runtime.max_depth`, and the corrected
file runs to completion. Its evidence lands under `.config-proof/`; the load time is read from the app log.

## Where the next work lands

| When the build reaches | It lands in | And owes |
|---|---|---|
| ~~the session writer + projection owner + one transcript row end to end~~ **done 2026-09-03**; spikes 8 and 18 taken | `engine`, `store` (DAL), `shell` (relay), `ui-core` | — |
| ~~the run loop consuming the prompt: iteration, the model port, `session.end`/`result`, status transitions~~ **done 2026-09-03**; spike 6 taken in its structural half | `engine`, `model`, `contracts`, `ui-core`, `ui` | spike 6's live half (an endpoint from the owner); ADR-0026's parameterised conformance suite once a second backend exists |
| ~~tools and the permission gate~~ **done 2026-09-03**, then ~~children and the scheduler~~ **done 2026-09-03**, ~~hooks~~ **done 2026-09-04**, ~~intent classification~~ **done 2026-09-04**, ~~the loop supervisor and `continue`~~ **done 2026-09-05** (ADR-0059; `pnpm part-h-proof`) — the row is exhausted | `agent-tools`, `engine`, `config`, `hooks`, `ui` | the fallback-model and rate-limit paths, `REQ-ORCH-030`, the session browser's repair, delete, export and store actions (`REQ-SESSION-182`), the pause-resolution dialogs (`REQ-ORCH-086`, `REQ-SESSION-109/110`), steering and todo corrections, the stuck report's producer (`REQ-ORCH-096`), the delegation-context header and scope toggle (`REQ-CHAT-068/069`); the export of the four records (`REQ-SESSION-199`), `fetch` (ADR-0023 over ADR-0036), the terminal's live streaming (ADR-0021), OQ-39's sizing under load; the remaining 17 control ops; for hooks: worktree working directories, `verifier_finished`, REQ-HOOKS-082 with checkpoints, a notice queue (ADR-0049); for configuration (~~ADR-0036~~ **built 2026-09-05**; `pnpm config-proof`): the discovery layers and `mcp_servers`, secrets, providers and credentials (ADR-0028/0029, `ROTARIS_MODEL_TIER`), REQ-CONFIG-183's strict `requirements:` block, the security policy card, the Display/Skills/MCP/Plugins/Tools categories, the write path's timing; for the intent: the classifier against a real provider, REQ-ORCH-012/013's route, plan mode (REQ-ORCH-152..154) |
| ~~the restore behind a real run host~~ **done 2026-09-03** | `workspace`, `workspace-service`, `main`, `contracts`, `shell`, `ui` | IC-5 discharged; IC-4 half 1 discharged, **half 2 awaits the owner's rename and reboot** (`spikes/machine-identifier-rename.md`); the kill-in-the-gap case; ADR-0005's reap-and-repair for a stale session a backup carried |
| ~~the build's load proof~~ **done 2026-09-04** — `pnpm package` (`apps/desktop/scripts/`), **IC-6 discharged**; the first packaged window was blank (the ninth defect) | `apps/desktop/electron-builder.yml`, `scripts/build-hooks.cjs`, `scripts/native-load-probe.cjs`, `scripts/package.mjs` | the portable's stub (ADR-0054), signing, the release gate, an icon; IC-3 item 3 |
| ~~a terminal save's durability~~ **harness built 2026-09-04** (`packages/store/spike/`, `power-loss.spike.test.ts`) | `store` (the settings are the store's; the writer's raise-and-lower is `dal.ts`'s) | **the power-loss test's fault half — the owner's power cut or kernel crash** (`spikes/power-loss.md` §4) |
| ~~the two undesigned themes~~ **done 2026-09-04** — `pnpm theme-proof`; **IC-2 discharged** | `contracts` (theme data and colour math), `platform` (preferences), `main`, `ui`, `apps/desktop/scripts` | different-scale multi-monitor drag on owner hardware; macOS/Linux native surfaces stay with IC-3 |
| macOS / Linux artifacts | `electron-builder.yml`, `platform/src/instance.ts` | IC-3 |
