# The codebase — how the architecture is laid out in code

> The picture of what this map describes — packages and edges, processes and messages, a run's lifecycle — is [`views/`](views/README.md), kept in step with the code by the rule in `CLAUDE.md`.

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
| `@rotaris/contracts` | any | channel schemas (zod), command envelope, 21 control ops, `PRIMARY_VIEWS`, process protocols, the status vocabularies and presentation mapping (`status.ts`), `CONTRACT_SCHEMA_VERSION`, the requirements seam (`requirements.ts`: the engine's record types, the board vocabularies, the `requirements.*` commands, channel 10 — Part AK), the terminal seam (`terminal.ts`: `TerminalStreamMeta`, the seven `terminal.*` commands — Part AL) and the closed key vocabulary (`terminal-keys.ts`, one table shared by the grid and the PTY writer — Part AM) | ADR-0010, ADR-0044, REQ-SHELL-023, REQ-SESSION-073, REQ-NOTIFY-048/049/050 |
| `@rotaris/platform` | main, run host, workspace service | clocks, per-user dirs (local-not-roaming), atomic document, liveness probe + lock predicate, machine id, canonical path, instance record + claim, spawn | ADR-0004, ADR-0055, REQ-STARTUP-145, REQ-SESSION-046/051–054 |
| `@rotaris/config` | run host, workspace service | ADR-0036's loader, first slice: the YAML document tree over a tri-state model (`yaml@2.9`), the `hooks:` section read per scope and merged with the displaced lists kept, REQ-HOOKS-025's one command-pattern definition; takes no database handle | ADR-0036, REQ-HOOKS-007–018, REQ-HOOKS-025 |
| `@rotaris/hooks` | run host | ADR-0015: the matcher, the payload builder over kernel's one redaction pass, the runner (fresh process per invocation, resolve on exit plus a grace, kill the started process only), the verdicts and every message text, the trust gate and fingerprint, the external import, the policy file, the per-session `HookEngine`, the tab summary; the engine's `HookPort` and the gate's `ToolHooks` are filled at the run-host root | ADR-0015, REQ-HOOKS-019–139 |
| `@rotaris/store` | run host, workspace service | open (WAL read back, write probe, one canonical spelling), schema v2 + migrations, the DAL (rows with residency, events with the derived envelope and three declared indexes, the truncation record), identifier + resolution, backup, the corrected restore; **`delivery/`** — store v15's seven delivery tables and the one DAL that writes them in one transaction (ADR-0041, Part AK) | ADR-0058, ADR-0005, ADR-0009 |
| `@rotaris/engine` | run host | **children/**: the ledger over the writer's one transition function, admission, the scheduler run to quiescence, the one wait, the child's execution and report, the parent's resume loop, the sweeps, the built-in persona table;  `SessionWriter` (one transaction per unit of work, residency release, trim, sticky failure, the launch audit, the timeline, the terminal transaction), the one serialiser and the 23-type catalogue, `ProjectionOwner` (resident rows, the counter, growth tick, attach/reconcile), `Sessions` (the registry, the control channel, the run-active predicate), `run/` (`Run`, `StopRequest`, the stop conditions and every total mapping, the todo, the aggregates, `EventBus`, `SummaryWriter`), `RefusalLease`, `HookPort` (the engine's view of ADR-0015; `hooks-port.ts`), **intent/** (the classifier ladder, the gate), **playbooks/** (the catalogue, the matrix, the render, the clamp), `Preflight` | ADR-0008, ADR-0009, ADR-0010, ADR-0013, ADR-0014, ADR-0043 |
| `@rotaris/model` | run host | the two ports (`ModelClient`, `AgentBackend`), `DefaultAgentBackend`, `ScriptedModelClient` (tests), `AiSdkModelClient` (pinned SDK, one decorated `fetch`); engine → model is a downward edge in the matrix | ADR-0026, ADR-0027 |
| `@rotaris/agent-tools` | run host | the registry (facets, classes, the four-stage fold), the scanner, the egress classifier and **the `fetch` executor** (the front door, the per-call policy read, the redirect loop, the rendering — Part N), the policy (build once, evaluate pure, the atomic swap, session approvals), the approvals registry + presenter capability with the liveness lapse, the ONE gate (`REQ-TOOLS-175`'s order, both hook slots empty), the file/hash-anchored/search/todo executors, the terminal (PTY + marker protocol, background sessions, classification); the engine's `ToolPort` is filled at the run-host root, never by an import; **`terminal/streams.ts`** — the live-stream registry (ADR-0021, Part AL: one `@xterm/headless` emulator per stream, the ceiling-plus-flush with the 20 ms floor, the closing frame), fed by taps on the foreground and background sessions | ADR-0016–0020, ADR-0023 (classifier), ADR-0024 |
| `@rotaris/mcp` | run host | the MCP client (Part S): the owned stdio transport, the SDK's protocol layer and remote transports, the three connection paths, the nine-value identity, the code-point order; the bundled runtime's launch owed | ADR-0033–0035 |
| `@rotaris/workspace` | workspace service | the backup and the two-phase restore around the store's mechanism (assessment, the identifier cases, ESC-26's establishment after the store is whole); **`git/`** — ADR-0038's one invocation helper (the env scrub, the network refusal, the rendering, the bounded spawn), the repository reads behind the Overview's card, the Git view's reads (`view.ts`), the worktree writes (`worktrees.ts`) and REQ-GIT-003's exclusion (`paths.ts`); checkpoints, traceability, delivery next; **`traceability/`** — ADR-0040 (Part AJ): the hand-written frontmatter reader, the streaming store parse, the layout configuration and root discovery, the built-in TypeScript convention and the language seam, the sweep, the verification pass in REQ-TRACE-091's order, the TypeScript symbol artifact, the three baselines and the tombstone log, the change comparison, the coverage query, the store probe, the progress protocol, cancellation by a shared flag; jobs pure over bytes, run in-thread or on a terminable worker (`worker.ts`); `engine.ts` is the one I/O owner and the seam's `TraceabilityEngine`; **`delivery/`** — ADR-0041 (Part AK): the transition function (`decide` pure, the single-flight admission, one transaction), the reader and writer handles, the release gate, the projection as one frozen value, the restart reap | REQ-SESSION-201, ADR-0058, ESC-26, ADR-0038, ADR-0036–0041 |
| `@rotaris/shell` | main | `UpdateRelay` (fan-out, order across both channels, message counters), `ProcessLink` (bounded request/reply, and the child's narrow requests back to main) | ADR-0044, ADR-0013, ADR-0002 c.7, c.11 |
| `@rotaris/ui-core` | renderer | the replica store with the step-0 sequence check, the decline, paging older rows, rows kept across a snapshot; the notice store; **no React**; the requirements display mapping (`requirements/display.ts`, pure, `now` supplied — REQ-TRACE-380, Part AK) | ADR-0043, ADR-0046, ADR-0049, ADR-0057, REQ-SESSION-161 |
| `@rotaris/ui` | renderer | `AppShell` (with the one persistent notice), `NavRail`, `WorkspaceView` (user/agent/system rows, the growing row, the composer, the stop control), `SettingsView` (the thirteen categories; Project hosts backup and restore), local shell state, the design system wired in; **`terminal/`** (Part AM, ADR-0047 B): the emulator port with two adapters over one parser (`@xterm/headless` for the preview and tests, `@xterm/xterm` opened once per stream for the grid), the per-renderer stream set, the five-rule key priority, the wheel with the carried remainder, the selection extraction, the audit buffer, the geometry guard, the window (tabs, tick, four banners, kill dialog, empty state), the grid and the transcript preview block; **`slash/`** (Part AN): the composer's slash catalogue — parser, registry, built-ins plus the palette mirror, highlighting, popup; `RunHeader.tsx` extracted from `WorkspaceView` | ADR-0048, ADR-0049, REQ-SHELL-024–028, -049, -114, -153, REQ-CHAT-001–005, -011, REQ-SESSION-186, -201, REQ-CONFIG-268/269 |
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

**The file-descriptor gate (the toolchain's fourth defect, 2026-09-05; ADR-0056's third execution).** electron-builder's
node-module collector runs `pnpm list --prod --json --depth Infinity` in `apps/desktop`, and pnpm opens every `package.json` at
once; on this tree the command died with `EMFILE` and the build was refused before it started (found by Part S's console
spike). `scripts/fd-gate.cjs` bounds `fs.open`/`fs.readFile` to 200 in flight and is loaded through `NODE_OPTIONS=--require` for the
electron-builder step only — never for the packaged application's launch. A pitfall for whoever changes the step: a
wrapper that drops the originals' own properties (`fs.realpath.native`) breaks fs-extra at once.

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

**Where the model comes from — the configuration files and the credential store** (`apps/desktop/src/run-host/
configuration.ts`, ADR-0036/0037, built 2026-09-05; ADR-0028/0029/0030/0032, built 2026-09-05): the entry role's
`models:` entry — its `base_url` or the provider's known endpoint (`openai`), `api_mode` → dialect — loaded once per
run start from the snapshot (layer 3: every authenticated provider's discovered models, keyed by qualified id, with
`auth_provider`) and the two scopes' files, with the screen's live state on top. A model naming an `auth_provider`
authenticates with the bearer **main leases the run host** at run start (`credentials.lease`); a model naming none
uses its `api_key` or `api_key_env`, read per request. `ROTARIS_MODEL_DIALECT=scripted` selects the scripted client
for every model (verification only) and is **the last environment stopgap**; a `models:` entry with provider
`scripted` does the same per entry. A fatal file, no model at all ("No model configured") or an unauthenticated
entry provider ("Provider authentication required", REQ-WORKSPACE-137) refuses the run before it starts
(REQ-EVENTS-021, REQ-CONFIG-478). Since Part L every call resolves **the credential of the model it goes to**
(`credentialFor`; ADR-0030 second execution): the classifier's slot, the loop classifier's model, the summariser on
`default_summary_model` and a child persona's own model each carry their own bearer or key, and a slot whose provider
was not leased is skipped with a warning. (Until then every call authenticated as the entry model — the reason kept
in `configuration.ts`'s header.)

17. **the vertical slice — a provider signed in through the product, a run on a real model (2026-09-05):** the
   `providers` package in main (ADR-0028/0029/0030/0032 first executed): the six-record catalogue checked at start,
   the credential store under `<data>/tokens/` with its Windows protection applied and read back, generic discovery,
   deterministic slot assignment, `project_settings.yaml` behind the secret screen, the API-key flow; the snapshot
   folded as configuration layer 3; the bearers leased to the run host per run start; the providers card, the
   authentication window, the first-launch notice, the two refusals. **Executed against OpenRouter by the owner's
   own paste:** the sign-in discovered 431 models, protected the file, wrote the snapshot with picks and the starter
   `agents.yaml`, and the slots saved; the first real run reached the endpoint. **Found — four:** the Windows grant
   leaves a foreign entry (thirteenth, the spike); a reload from elsewhere kept stale pending Settings (fourteenth,
   ADR-0037); the adapter put the system prompt where the pinned SDK refuses it, so no real call had ever left the
   machine (fifteenth, ADR-0027); and a public catalog validates no key (OQ-50) — the value the owner first pasted
   was of another vendor's shape and was stored as authenticated. **The run on a real model completed** on the owner's
   re-run: one iteration, one `read_file` call settled through the gate, 5,911 input and 139 output tokens, the
   terminal pair, the answer naming the heading; spike 6's live half four of four; sign-out and the refusal that
   follows it. **Also found there:** the intent classifier's first real answer was conversational, not the JSON
   the ladder asks for, so the pre-flight fell to its fallback intent — REQ-ORCH-005's ladder against a real
   small model is owed a prompt that a real model answers as asked. A load with 431 discovered models takes
   117–175 ms (ADR-0036's figure was 4.5 ms with two).

18. **the small-model path on a real provider (2026-09-05, Part L):** the classifier's frame rebuilt from what the
   slice found — the request quoted between delimiters, the system prompt forbidding the model to act on it, an
   instruction on every rung, the first balanced object taken from a prefaced answer, and a structured rung answered
   without JSON remembered as unsupported so the ladder descends (the sixteenth defect; ADR-0026's third execution;
   the same frame in the loop classifier). Credentials resolved **per model** (ADR-0030's second execution): the
   classifier, the loop classifier, the summariser on `default_summary_model` (REQ-CONFIG-065) and every child
   persona's model each authenticate as themselves; an unleased slot is skipped (REQ-ORCH-009). `pnpm slice-proof`
   gains the `intents` scenario — three real runs, one prompt per intent family, each asserted to classify from the
   small slot and never fall back, the answering rung recorded. **Measured on the owner's re-run:** the first attempt
   fell again — the model put the category under its own key (`classification`) and the parser knew two names; now
   any string value naming a category counts. Then `question`, `explicit_trivial`, `small_feature`, all on the
   `json_schema` rung, none with a confidence (the endpoint accepts the schema and does not enforce it). The proof's
   scratch workspace now runs autonomous after the starter file is asserted, so no one sits at the approval dialog.

19. **the Overview view (2026-09-05, Part M):** REQ-SHELL-026's startup view drawn — the header with the session
   label, status and runtime; the resizable two-column body whose split persists under `panels/overview`
   (REQ-SHELL-069, ADR-0042); the tokens card over the history **the run samples** (every 10 s on the clock port,
   once at the end, 120 kept, `token_samples` on the session row — store v7) with the sparkline empty below two
   samples and the cost label carrying its qualifier; the tool-calls chips from `tool_calls`; the repository card
   on **ADR-0038's first execution** (the git helper in the workspace service, five bounded reads, ≈430 ms, every
   failure an empty value and no dialog); the agents card against the configured caps; the sessions card as a run
   switcher; the right column's four tiles, the credit and limits tiles and the proposals card in their empty states,
   the agent tree the same component as the Workspace sidebar's. **Found — the seventeenth defect:** the window
   paints before the workspace opens, so the view's start-time reads were refused with "no workspace" (ADR-0055 note;
   those reads now wait for the open in flight); **and the eighteenth:** the preference store serialised its first nested
   value as `{}` — a replacer array filters every level (ADR-0042 note). `pnpm overview-proof` passed on the first
   complete run.

20. **the `fetch` tool and the egress it enforces (2026-09-05, Part N; built in parallel with 21, each in its own
   worktree):** ADR-0023's second execution — the validation front door (REQ-SANDBOX-020), the egress policy **read from
   the saved files at every call** (`egressReader`; no live state, REQ-SANDBOX-038/118, 1.7–1.8 ms (median 1.7) per read), the
   timeout precedence with the level named (REQ-SANDBOX-021), the hand-driven redirect loop that classifies the named
   host and every hop before a connection is opened (REQ-SANDBOX-022..031), the eight failure kinds of REQ-TOOLS-092,
   the shaping and the rendering under exact-string tests; a refusal names the policy input that produced it
   (`classifyExplained`, REQ-SANDBOX-026); no proxy by construction (OQ-37 stays open). `pnpm fetch-proof` runs seven
   scenarios behind the real run host against a recording loopback server: allowed, allowed under `ask` with no
   dialog, a redirect refused then followed once allow-listed, a denied host that **sees nothing**, a 404, a
   run-level timeout — the saved edits between launches are REQ-SANDBOX-038 executed. **Found — the nineteenth
   defect:** the direct-work grant of REQ-ORCH-016 had never reached the entry role — the port recognised the entry
   by `parentId === 'root'` after Part B had renamed the root to `root:<iteration>`; masked because every proof ran
   under `single` or an intent granting nothing, and `fetch` was the first tool reachable only through the bundle
   (`isEntryPort`: the port at depth 0; the reason kept beside it). Two harness findings beside it: the symbol
   generator wrote an empty artifact on a CRLF checkout without a word (it refuses now), and the proof's server
   lived in a process blocked on Electron.

21. **the Git view and the worktrees (2026-09-05, Part O):** ADR-0038's second execution — the reads of REQ-GIT-105
   through the one helper (the two gates, the branch and upstream, `status`/`diff` under REQ-GIT-003's exclusion
   applied by us, `worktree list --porcelain` with the base tree by common directory (REQ-GIT-106), thirty `log`
   rows with the local flag as the reachability set (REQ-GIT-108), two reads per linked tree; **11 reads in 658–694 ms with one linked tree, 13 in 757–811 ms with two** on this
   machine) and the first writes (`worktree add -b` collision-safe on REQ-GIT-010's exact three phrases, `worktree
   remove [--force]` with Git's own refusal recognised as the one force cures, the attach check; REQ-GIT-013's ladder
   verbatim, REQ-GIT-012's two lines the only rewording, 30 s per invocation). The view: REQ-GIT-075's header, the
   two columns under `panels/git`, the worktrees table with multi-row selection and the per-row delete, the history
   table, the checkpoints card **in its empty states only** (ADR-0039 not executed — a status note says so), the
   policy card, Merge selected disabled (integration owed); the worktree dialog with `validateBranchName` shared
   through contracts; the two-step delete; REQ-SHELL-125's **start-session dialog** — isolation with the generated
   branch, attach through the folder chooser, the sandbox selector with REQ-SANDBOX-130's disclosure — whose choices
   the composer's next submission carries; the isolated session: main mints the id, the service binds **before** the
   run host is asked (a failed bind has no session to delete), the binding on the session row (store v8), the run's
   effective root the worktree while the record and the configuration stay with the base; REQ-GIT-104's
   fixed-identity notice; the strip's branch item. `pnpm git-proof` drives seven launches: painted, a worktree
   created through the dialog, an isolated run whose `write_file` lands in the worktree and not the base, the forced
   delete against a real refusal, the split restored, `PATH` without Git, a plain folder. **Found:** nothing in the
   helper or the reads; three findings in the new screen and the seams, fixed in place (a fresh array per render
   looped React; an occluded window stops painting so the capture lagged the DOM — throttling off while capturing;
   a "plain folder" under the checkout is inside a repository, REQ-GIT-103 as written). ADR-0049's single notice slot
   let the first-launch notice replace the Git one a second later — recorded, owed a queue.

22. **checkpoints — ADR-0039's first execution (2026-09-05, Part P; built in parallel with 23, each in its own worktree):**
   the four specifics of the decision executed — the private index set after the scrub through a `setEnv` seam on the one
   helper, the exclusion applied by us over `ls-files` and handed to `update-index` on standard input, `gc.auto=0` on every
   invocation, the filtered-HEAD comparison built lazily; store **v9** (`checkpoints` keyed by session and sequence,
   `sessions.last_restored_sequence`); the writer's `recordCheckpoint` and `recordRestore` as one transaction each with the
   timeline entry and the event, published after the refs; the run host reaches Git **only through main's relay to the
   workspace service** (three asks beside `credentials.lease`); one capture per closing iteration, before the hooks'
   `iteration_end`, sequence = max(rows, live refs) + 1, the credited child or none; the card alive with local-time labels;
   the preview-first restore flow with its seven gates, the safety checkpoint, the dirty warning and its checkbox, the
   single-flight gate and the 150 ms retry, REQ-GIT-094's repair on opening a stale session's checkpoints. **Measured**
   (`pnpm checkpoint-proof`, twelve launches): a capture is 12 Git invocations in 1.18–1.20 s in the service, 1.26–1.28 s end to end through main (2.0 s when the retention prune follows); a confirmed restore ≈2.5 s end to end (a 12-invocation preview ≈1.0 s, the safety capture, the 2-invocation restore 0.24 s); the refs of a trimmed
   retention deleted after the rows; an isolated run's checkpoints in the shared repository and its restore in the
   worktree only; `.rotaris/` in no recorded tree. **Found — three defects in existing code:** the helper's network
   chokepoint took the first non-option argument as the subcommand, so a network subcommand behind `-c gc.auto=0` would
   have passed (twenty-fourth; ADR-0038); the environment denylist held fourteen names but not REQ-GIT-031's — the six
   identity variables were missing (twenty-fifth; ADR-0038); and the Git view's refresh after a restore rewrote the
   repository's index through `diff … HEAD`, which a read must not do — `diff-index` and `--no-optional-locks` now
   (twenty-sixth; ADR-0038). The resumed session's unfed run was found here too, independently of 23.

23. **the model resilience paths (2026-09-05, Part Q):** REQ-ORCH-091's ladder at the model **step** — quota, rate limit,
   context window, validation, transient, fatal classified in that order over the port's error (the mapping extended so
   every shape carries the provider's message and the raw `retry-after`); a quota marks the pair exhausted for the
   session; at most one same-tier fallback per agent over the run host's catalogue (roles from the slots and the snapshot's
   picks, a different provider); otherwise the **suspended wait** — the provider's retry-after (floor 1 s) else
   60·2^(n−1) s capped at 300 s — resolved by the clock port, by `cancel` or by `setModel`, which persists the override as a
   timeline entry rehydrated on resume (the wire-event catalogue is closed at 23, so no event); the unresponsive-model
   fallback after `llm_response_timeout` on the first model event; the hard child timeout's one retry on the role's
   fallback; per-model `timeout` and `num_retries`. The record's `wait` and the Workspace header that counts down and
   offers keep waiting (no operation), change model (`setModel`) and cancel — REQ-MONITOR-004's enumeration stays at
   twenty-two. `pnpm resilience-proof` drives nine launches through scripted fault steps. **Found — four defects in
   existing code:** the transient retry re-ran the whole turn and would have replayed executed tool calls under fresh ids
   (twentieth; ADR-0027); `runtime.child_timeout` was loaded since Part C and reached no run (twenty-first; ADR-0012);
   main's `config.read` raced the workspace open, so the run header's model list had been empty since Part J
   (twenty-second; ADR-0027); and a resumed session's writer fed the projection owner only, so a continuation's events
   never reached the bus and `run.result` never reached main (twenty-third; ADR-0027).

24. **the agent surfaces (2026-09-05, Part R; built in parallel with 25, each in its own worktree):** the Mission view —
   REQ-SHELL-023's third, the last primary view without a body and the one with no design at all — over the ONE
   `AgentTree` component (REQ-MONITOR-038: the Workspace sidebar, the Overview card and Mission show one agent set from
   one replica; a 23-agent record republished with Mission visible repainted in ≈12–18 ms against the 250 ms budget), the
   run row above the tree for the whole-run pause (REQ-MONITOR-274/276: a pause with a child selected is refused
   client-side with its sentence, the control never sent), the destructive cancel naming the agent with its cascade
   count, the strategy selector and depth control writing `rotaris.delegation_strategy` and `runtime.max_depth` through
   `config.setField`, the per-row-memoised activity table (REQ-MONITOR-116/275/281); the per-agent inspector in the
   Workspace view (REQ-MONITOR-050..067: persona tabs, following the latest author with a visible tag, pinning, the ring
   with the threshold, the run-level-only model and reasoning controls with their notes, chips marked active/used/not
   used in a stable order, a drawer below 1180 px); the persona pop-out windows through **ADR-0048's window registry,
   first executed** (`main/windows.ts`: one window per persona, `Rotaris · {persona}`, 820×620, reused with the tab
   selected, hidden on close, destroyed with the main window, on a new session and on a different session loaded, the
   raise a request; a full renderer of the one bundle under `role=persona`, subscribing for itself on `visibilitychange`,
   its refreshes coalesced at 120 ms; first paint 292–307 ms on creation, 468–644 ms after a hide/show); the
   `interface/agentPopOut` preference with its toggle; `AgentRecord` grown by eight of REQ-MONITOR-044's fields
   (reasoning, the prompt reading and the limit, granted, called and active tools, the delegation session, the inherited
   context) maintained incrementally by the writer's `AgentActivity`, never recomputed over the transcript. `pnpm
   mission-proof` drives ten launches for eight items. **Found — two defects in existing code:** main's
   `session.subscribe` bound every window's subscription to the MAIN window's sink, so a second renderer on one session
   would have fed the main window twice and itself never (twenty-seventh; ADR-0043); and the projection owner published
   the whole-session record on a save only, so from Part B on every agent surface saw a child's state up to 10 s late and
   never a tool as active — now a commit carrying a child or tool event publishes it, coalesced to one read per 80 ms
   tick (twenty-eighth; ADR-0043; the uncoalesced form cost 50 ms per tool call and missed the Part J proof's budget).

25. **the MCP client and its configuration pipeline — ADR-0033 and ADR-0034's first execution (2026-09-05, Part S):**
   **the two owed spikes taken first** (`spikes/mcp-negotiation.md`: over `OwnedStdioTransport` the SDK spawns NO
   sibling probe under any mode — REQ-MCP-067's process count is held by the transport's shape, not by a pin, the
   decision's reason falsified and kept; `'auto'` reaches all four fixture eras, the mode shipped; ESC-12 option (a)
   taken. `spikes/mcp-console-suppression.md`: the packaged `Rotaris.exe` spawning `cmd.exe /c node <fixture>` showed
   no window at any sample — every post-launch process at handle 0 and `tasklist` title `N/A` — and the reserved token's
   child fails at spawn, `ENOENT`, not with a window); `@modelcontextprotocol/client` **2.0.0** pinned; the owned stdio
   transport (three piped streams, `windowsHide`, stderr through `redact()`, terminate → 5 s → force-kill of the tree);
   the three paths — discovery memoised on the nine-value identity with the 35 s outer watchdog (measured 35,008 ms, the
   application exiting 1.5 s after the quit), the probe that never caches, the session connections under a keyed
   single-flight with the shutdown latch (one process per server per session — the pid files count one discovery
   launch and one session launch); the pure pipeline in `config/src/mcp/` (entry schema, the two discovery files read
   byte-identically, the merge with the origin map, command resolution with the reserved token first, one availability
   rule on the platform's one PATH lookup, environment and secrets read, the five grant cases with `undefined` ≠ `[]`,
   the normalised description, the byte-exact prompt section) returning `{ value, diagnostics }` at every stage with
   ONE sink fanning out to the 8 s notice and the `mcp_config` issue; MCP tools as executors outside the registry
   through the ONE gate (fail-closed per ADR-0016: withheld under `restricted`/`read_only`, asked under `ask`); the
   per-child evidence in `children.granted_mcp`; the session override held in the run host; the Settings category
   (`McpSettings.tsx`: every configured row with its four-state health as text, origin, the switch and its wording, the
   secrets read side masked). **Placement read against the record:** every path lives in the **run host**, the one
   holder REQ-MCP-047 now asks for — ADR-0034 consequence 3 falsified and kept. OQ-22 read as overlay on the parent
   environment, flagged for the owner. **Shipped `enabled: false` on `code_intelligence`** by the owner's decision until
   ADR-0035 executes, recorded beside REQ-CONFIG-181. `pnpm mcp-proof` drives nine launches (discovery ≈300–350 ms per
   fixture, connect 105 ms). **Found — one defect in existing code:** the platform's one spawn helper could not start
   a package runner on Windows — `npx`/`uvx` are `.cmd` scripts `spawn` cannot start by name — so the shipped `browser`
   default and REQ-MCP-113's "SHALL start" were false for every such entry (twenty-ninth; ADR-0033/0034; a `.cmd`/`.bat`
   resolution now launches through `cmd.exe /d /s /c`). **The merge found the fix incomplete twice**, neither counted:
   the lookup returned Node's extensionless `npx` before `npx.cmd` (PATHEXT decides on win32 now), and the child was
   spawned with the server's map ALONE and never the parent environment — the note had claimed the overlay; `parentEnv`
   is threaded from the run host to the transport and never into the identity. The proof's `browser` stand-in is a
   `.cmd` runner over the fixture, healthy through the wrap in the built application.


26. **the session browser's actions — repair, delete, export (2026-09-06, Part U; built in parallel with 27, each in its
   own worktree):** the explicit repair as ONE unit shared with REQ-GIT-094's open-time repair (the liveness predicate,
   the state read, `interrupted` saved durably, the `session_marked_interrupted` entry written under the lock, the lock
   released last; per session the id, the stuck status, the new status and the reason; "nothing was stale" said rather
   than nothing); the delete in REQ-SESSION-166's order — state → the refs through a fourth checkpoint ask
   `checkpoint.deleteNamespace` (REQ-GIT-069, best-effort, the vanished tree logged) → one transaction cascading
   thirteen tables → the session's files — refused for a live session with its own sentence, a no-op for a missing one,
   working on an unreadable one; the two exports through the platform's save dialog and ADR-0004's atomic write — the
   four records in ADR-0024's form (the rings with `complete` and `dropped`, the ordinal beside every entry; the metrics
   document rebuilt) and the trajectory document with REQ-EVENTS-144's batch wrapper, a stock parser reading both in a
   separate node process; the browser's Actions menu, the destructive confirmation naming the session, the unreadable row
   with its parse detail, Repair all stale, the whole-store backup and restore surfaced, the REQ-SESSION-200 disclosure
   as a panel; open-log and reveal-files for the files that exist (`summary.md` always; `session.log` only once a
   warning was logged; no artifact bodies). `pnpm sessions-proof` drives ten launches (a delete with two refs 862 ms; a
   2.2 MB records export 54 ms). **Found — three defects in existing code:** the listing carried a second liveness
   predicate beside `Sessions.liveness()` and the two disagreed on a lock this process holds with no run behind it
   (thirtieth; ADR-0005); the `session.start` payload carried `workspace` and a boolean `sandboxed` where REQ-SESSION-193
   fixes `workspace_root` and `sandbox {enabled, backend}` (thirty-first; ADR-0024); and the timeline table holds neither
   REQ-SESSION-134's `id` nor its `severity` (thirty-second; ADR-0024; **repaired 2026-09-06** — store v10 adds both columns, every writer mints the id, a pre-v10 entry keeps an empty one and the export omits the field; the repair's own reading found `hook_run` carrying a `severity` key REQ-HOOKS-119's closed metadata inventory does not name, and moved it to the column). Not a defect, a
   reliance made explicit: the cascade rested on SQLite's `foreign_keys` default; `openStore` sets and reads it back.

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
   (12 / 19 names), REQ-MCP-034's binding on the launch subcommand, REQ-MCP-071's probe, REQ-MCP-102's memories block;
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
   the name from the manifest, a reading flagged for the owner; and the 4.5 s discovery pushed five proofs' fixed
   windows, which now switch the entry off in their scratch configuration (Part J, resilience, fetch, mission) or carry
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
   cannot yet carry out recorded in `OMITTED_COMMANDS` with the reason. The palette is a 560×420 application-modal
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
   disabled window can still be raised to the foreground. **Found — one defect:** binding Ctrl+L and Ctrl+Return through
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
   this record to run clean against the scripted client on its first execution. **Then, on the first real call
   (the slice, 2026-09-05): the sixteenth defect** — the small model answered the request instead of labelling it
   and the ladder never descended (entry 18; ADR-0026's third execution).

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
ADR-0029 (closed by Part K's lease); the composer's write also updating the pending state (REQ-CONFIG-423); the proof
scripts writing a scratch `agents.yaml`. `ROTARIS_CAPTURE_CLICKS` and `ROTARIS_CAPTURE_SELECT` are verification seams.
`project-settings.ts` is the snapshot's reader and its layer (REQ-CONFIG-034), kept in `config` because the loader
folds it and may not import `providers`.

**Providers.** `packages/providers/src/` — `catalogue.ts` (the six frozen records, `validateCatalog()` at build and at
main's start), `credentials/` (`store.ts`, the protection adapter `protect.ts` with its read-back, the adjacent lock
`lock.ts`), `discovery.ts` (the generic discoverer with REQ-PROVIDER-071's total mapping), `slots.ts` with
`tiers.data.ts` (deterministic tier assignment), `limits.data.ts` (the known-limits table), `project-settings.ts` (the
snapshot's writer, merge and secret screen), `signin.ts` (`ProviderService`: the API-key flow, replace-key,
validate, sign-out, delete, refresh, health, the list, the lease). Instantiated by **main only** (ADR-0030); the run
host asks `credentials.lease` per run start and is answered the bearers. Contracts carry `ProviderRow`,
`ProviderDialogPayload` and the outcome shapes, none with a secret-looking field (a test); `provider.signIn` is the one
command carrying a pasted key inward. Surfaces: the providers card under Settings → Models (`ui/src/settings/
Providers.tsx`), the authentication window `?role=provider` (`ui/src/ProviderDialog.tsx`), the first-launch notice
with "Add a provider", the two refusals with "Open Settings"; a sign-in asks the workspace service `config.bootstrap`
for the starter `agents.yaml`. Decisions taken here for the owner: the OpenAI-compatible instance only (the other
two sign-in methods, Copilot's and codex's discovery, the bridges, the usage and credit tiles owed); `/reset` before
the grant on Windows; `<data>/tokens` replacing the reserved `credentials`; the lock inside the directory (OQ-19); the
shipped capability metadata empty (OQ-18); REQ-PROVIDER-091's override read as the named-entry overlay; the zero-model
recovery without "edit by hand" (no configuration editor). `ROTARIS_CAPTURE_PROVIDER_FILL`, `ROTARIS_CAPTURE_WAIT`
and `ROTARIS_CAPTURE_WAIT_MS` are verification seams.

**What `pnpm slice-proof` does.** It builds Electron and carries ONE scratch profile across five launches, because
the credential the owner pastes in the first must be the one the third leases: (1) first launch — the notice, Settings
→ Models → Add endpoint with the label and URL filled, the owner pastes the OpenRouter key (never read from the
environment, never logged), then the credential file's five keys and exact protection, the snapshot's record and
picks, the bootstrapped `agents.yaml`, and a log free of the key are asserted; (2) the three tier slots set to
`anthropic/claude-haiku-4.5` and saved; (3) one real run — the lease, the request to OpenRouter, a settled tool row,
usage figures and the terminal result from the store; (4) spike 6's live harness against the same endpoint with the
stored credential; (3b, Part L) three more real runs, one prompt per intent family, each asserted to classify from the small
slot and never fall back, the answering rung recorded; (5) sign-out from the card — the file gone, the snapshot kept, a prompt refused. `--resume` keeps
the profile and skips the paste; `--skip-build` skips the build. Evidence lands under `.slice-proof/`. `--from=<scenario>` replays the
earlier scenarios from their evidence. On 2026-09-05 every scenario passed on the owner's re-run with an OpenRouter
key (`.slice-proof/results.json`), after two runs that each found a defect.

**What `pnpm overview-proof` does.** It builds Electron and carries one scratch profile across four launches against
a scratch Git repository it creates (one commit, one untracked file): (1) a fresh launch — Overview is the first view
painted, the onboarding empty state, the repository read logged with its time; (1b) the same with `PATH` emptied of
Git — the reads end in the empty state and no dialog; (2) a scripted run whose first model call waits 21 s
(`wait:<ms>`, three sample periods), delegates one child and reads a file, driven from the Workspace view with the
Overview read afterwards through `ROTARIS_CAPTURE_END_VIEW` and `ROTARIS_CAPTURE_PROBE` — the header, the tokens card
against the store, the sparkline's sample count, the cost qualifier, the tool chips against `tool_calls`, the agents
caption against the ledger and the configured caps, the branch, the session row with its duration and focused
marker; (3) a relaunch — the samples identical and a pane split written to the preference store restored. Evidence
under `.overview-proof/`. On 2026-09-05 it passed once the start-time read was corrected (entry 19).

**What `pnpm fetch-proof` does.** It builds Electron, starts a `node:http` server on 127.0.0.1 that records every
request path, and launches the app seven times against a scratch workspace whose `agents.yaml` it rewrites between
launches, each run scripted `fetch:<url>,answer`: `/ok` under `autonomous`; the same under `ask` with zero approval
requests; `/redirect` (302 to `localhost`, a different host name) refused, then followed once `localhost` is
allow-listed; `127.0.0.1` denied so the server sees nothing; `/404` as `http_error` with the body; `/slow` under a
one-second `tool_call_timeout`. The tool row's observation is read from `tool_calls`; the per-call policy read's cost
from the run host's log. Evidence under `.fetch-proof/`.

**What `pnpm git-proof` does.** It builds Electron, makes a scratch repository with a local bare remote (one commit
ahead, so a local-tinted row and `ahead 1` exist) and a `.gitignore` holding `.rotaris/`, and launches the app seven
times: the Git view painted (header, the one worktree row with its markers, three history rows, the checkpoints
card's sentence, the strip, the divider moved by keyboard and written to `panels/git`); a worktree created through
the dialog beside the workspace; an isolated session started through the launch dialog whose scripted `write_file`
lands in `.rotaris/worktrees/<sid>` and not in the base; the manual worktree deleted through the two-step confirm
against Git's real refusal; a relaunch restoring the split; `PATH` without Git (the empty header, the notice, no
dialog); a plain folder in the OS temp directory (no notice). Evidence under `.git-proof/`.

**What `pnpm checkpoint-proof` does.** It builds Electron and launches the app twelve times against a scratch repository:
two scripted iterations capture checkpoints 1 and 2 (the refs, the fixed identity, the message, HEAD and the index bytes
unchanged, the card's rows); a read-only run records nothing; a hand edit then a restore of checkpoint 1 through the
preview-first dialog (the warning, the checkbox, the safety checkpoint holding the edit, `last_restored_sequence`, the
notice); a session with no rows, a ref deleted from outside, a live run's refusal, a stale session repaired on opening; a
retention of two trimming rows and refs together; an isolated run whose checkpoints land in the shared repository and
whose restore touches the worktree only; `enabled: false`. Figures — invocations and times per capture, preview and
restore — land in `.checkpoint-proof/results.json`. The Git proof's isolated launch now asserts one checkpoint row where it asserted the card's
empty sentence: an isolated run records a checkpoint by REQ-GIT-044's default, which the merge found by failing that launch.

**What `pnpm resilience-proof` does.** It builds Electron and launches the app nine times with scripted fault steps: a 429
with `retry-after: 2` (the countdown, the auto-resume); a 429 with no header (the 60 s local wait, cancelled from the
header with REQ-NOTIFY-063's notice); a quota with a same-tier candidate (the transparent fallback); a quota with none
(the indefinite wait, `setModel` from the header, the override honoured after a relaunch); an unresponsive model with
and without a role fallback; a hung child under a small `child_timeout` with and without a fallback; a 503 (one
transient retry) and a 401 (no retry). Evidence under `.resilience-proof/`.

**What `pnpm mission-proof` does.** It builds Electron and launches the app ten times for eight items: the Mission view
painted with the run row, the tree and the table, elapsed advancing between two probes; the three trees' parity and a
23-agent republish timed against the 250 ms budget; a pause refused with a child selected and honoured with the run
selected; a cancel naming the agent and its cascade; open-agent under both preferences — the inspector pinned, then one
persona window per persona reused, hidden on close, shown again, destroyed on a new session; the inspector following the
latest author, pinning, steering, the chips' order across a state change; the strategy and depth controls written to
`agents.yaml` and read back in Settings; every surface showing a planted running child settled. Figures — the refresh
time, the persona window's first paint — land in `.mission-proof/results.json`.

**What `pnpm mcp-proof` does.** It builds Electron and launches the app nine times against hand-written fixture servers
(`scripts/fixtures/mcp-fixture-server.mjs`, four protocol eras, pid files per launch): discovery and the byte-exact prompt
section with the inert grant reported once and the discovery file hashed unchanged; a call end to end with `tool.start`
before the answer and a `request_timeout` exhausted; one process per server for two concurrent children and the next
child; a mid-run narrowing refused; a server crashing after connect, warned once, re-established by the next call; the
drop rules per persona and a session toggle gone after a relaunch; the Settings category probing every row twice with the
`.cmd` stand-in for `browser` healthy through the wrap; two fatal YAML defects reported together and the same defects
dropped from a discovery file; a server that never answers `initialize` bounded at 35 s with the exit 1.5 s after the
quit. Evidence under `.mcp-proof/`.


**What `pnpm sessions-proof` does.** It builds Electron and launches the app ten times against a scratch store and
repository: a stale session repaired one at a time and all at once (a live lock held by a child process this script
spawns is left alone; "nothing was stale" on a second press); a delete with two checkpoint refs, an isolated session's
refs in the shared repository, a session whose repository moved, a live run refused; the four-record export of a
capped audit and of an empty session, and the trajectory export of one, of two in reverse order, of a resumed and of a
capped history — every file parsed by a SEPARATE node process holding no product code; an unreadable session listed
and deleted; the backup disclosure panel. Evidence under `.sessions-proof/`.

**What `pnpm code-intel-proof` does.** After `pnpm code-intel:bundle` (once per checkout; the tree is git-ignored), it
launches the app seven times: the branch guard on the dev entry and, under `ROTARIS_CODE_INTEL_PACKAGED=1`, on
`win-unpacked` (JSON-RPC and nothing but a tolerated blank line on standard output, no window, the exit status
propagated); discovery of the real runtime through the token with the tier's names in the prompt and the memories
block; the workspace binding on the launch line; a real `get_symbols_overview` call; the three-step project setup —
completed, skipped on the marker, `skipped-no-code`, a launch-less entry refused, a cancel mid-step; the manifest's
drift refused; the packaged binary with outbound traffic blocked, which names the fetch it needs (IC-7). Evidence under
`.code-intel-proof/`.

**What `pnpm config-proof` does.** It builds Electron and launches the app five times against commented files at
both scopes: Settings → Runtime toggles "Allow outside workspace" through its confirmation and saves (every other
line as written, the global file untouched); Settings → Models chooses a slot and its strength and saves; a toggle
then Discard writes nothing; the composer's control writes `runtime.permission_mode` with no run active; a file
with `max_depth: many` refuses the run naming the file, the workspace scope and `runtime.max_depth`, and the corrected
file runs to completion. Its evidence lands under `.config-proof/`; the load time is read from the app log.

**The control channel.** `contracts/src/control.ts` (the twenty-two operations, the pause payload), store v6
(`queued_prompts`, `sessions.message_limit`, `sessions.paused_at_count`), the writer's units, `engine/src/run/run.ts`
(pause, the limit, the queue's consumption, steering, todo edits, the entry switch), `run/turn.ts` (the injection,
the extra round, the stuck producer), `Sessions.control` and `Sessions.continueSession`; `run.paused` and
`session.continue` cross the boundary; main opens the pause window (`?role=pause`) and relays the continuation;
`ui/src/PauseDialog.tsx` and the composer's queue panel, Steer, Pause, Continue, the confirmations and the run
header's selectors. Decisions taken here for the owner: a manual pause ends the run as `user_cancelled` (the closed
set has no `paused`); the pause at the limit writes no terminal pair; operations with no mechanism answer false.
`ROTARIS_CAPTURE_TYPE`, `ROTARIS_CAPTURE_PAUSE_ANSWER` and `ROTARIS_CAPTURE_QUIT_MS` are verification seams.

**What `pnpm part-j-proof` does.** It builds Electron and launches the app six times against scratch stores: a
message typed during a run is queued and consumed once as a completed task; a steer is submitted from the composer's
card and injected; Pause then the composer's Continue run leave the pause row and two run starts; a `message_limit`
of one pauses the run, the dialog answers "double" and the doubled limit persists; a session left paused at the limit
is resumed on relaunch through the one reap and its dialog answers "cancel"; a user-initiated close during a run
records `application_shutdown` with the terminal pair and no lock. Its evidence lands under `.part-j-proof/`. The queue
launch's capture sat on a knife-edge the Parts R and S merge found (2026-09-05): the launch reaches `session.start` about
1.2 s in and the run needs about 8 s from there — a silent 4.2 s gap at the iteration boundary of a scripted run,
identical on both branches and on main, not diagnosed — so three runs landed 100 ms either side of the 9 s capture; it
waits 13 s now, the assertion being consumption, not a budget.

**The Library view.** `contracts/src/library.ts` (the two prompt lists, the closed four a "library change" is, and
`LIBRARY_TABS` left where it already was in `notices.ts` rather than restated), store **v11** (`prompt_history` and
`prompt_stash`, the first workspace-scoped tables here), the DAL's four prompt calls with the adjacent-duplicate rule
and the caps beside the insert, the run host's three session-less `prompts.*` requests, main's `library.ts` (the
revision, whose `bump` takes a member of a four-valued union so a settings write cannot reach it) and channel 9
`library:changed`; `ui/src/library/` (the shell with the one search field, the Prompts tab's resizable split under
`panels/library`, the stash dialog) and the composer's Stash control. `contracts/src/artifacts.ts`, store **v12**
(`artifacts` and its declared index — REQ-LIBRARY-087's "record and index written as one indivisible step" is one row
and one index on rows, and the file-era reading is kept beside it), `engine/src/artifacts/` (record, sidecar, store,
context, port), `agent-tools/src/tools/artifacts.ts` (the three executors the registry had named since Part B),
`ui/src/markdown/` (**ADR-0051's first execution** — parse to a tree, render the tree to elements, never a markup
string, with the bounded cache) and `ui/src/library/{ArtifactsTab,ArtifactInspector}.tsx`. Artifact bodies are files
named flat beside the session's other files (`artifact-<id>.md`), because REQ-SESSION-002 closes that directory to
three kinds of file and a subdirectory's standing under that sentence is arguable. `ROTARIS_CAPTURE_PROMPTS` and the
scripted client's `artifact:<tool>[:<key>]` step are the verification seams.

**What `pnpm library-proof` does.** It launches the app six times over four scratch profiles: Ctrl+6 shows the view
with its title, its one field and the three tabs in order; a prompt stashed from the composer is in the store and is
still in the stash after the application is quit and **relaunched**; "Use" copies into the composer, switches view and
focuses it while the entry stays stashed, and "Use and remove" under a filter removes the row chosen and not the row
at that screen position; twenty writes in a burst settle with the last visible and the typed search text untouched;
201 history entries leave 200 with the oldest gone and no notice; a notice carrying `open-library` opens the named
tab. Evidence under `.library-proof/`. Two of its assertions were rewritten at the Parts X/Y merge and the reason is
recorded there: the store version is asserted as "at least v11" (the ladder is asserted whole in `store.test.ts`) and
the Artifacts tab's body is now the real tab rather than the placeholder Part X supplied.

**What `pnpm artifacts-proof` does.** It launches the app five times: a scripted run publishes through
`artifact_write` and the row appears on the next refresh with no restart, its body file sits in the session's files
directory, and its sidecar is parsed by a **stock YAML parser in a separate node process** — frontmatter, then the
sections REQ-LIBRARY-090 names, in its order, with the empty ones absent; a two-child run materialises exactly two
`child_report` artifacts, each with one `artifact_published` timeline entry whose id is linked back onto the record;
an invalid tag refuses the publish whole, leaving no row and no file, in REQ-LIBRARY-089's own words; the inspector
opens on the selected row, saves, and the status cell reads `published · edited`, and re-opening the same id
re-raises the one dialog rather than a second; a body file deleted underneath leaves the record listed with Save
disabled and the failure stated once. Evidence under `.artifacts-proof/`. Every launch clicks the Artifacts tab after
switching view — the Library opens on Prompts, REQ-LIBRARY-103's first tab.

## Verifying a part runs the WHOLE proof suite, not its neighbours

Every part until now named a handful of proofs to keep green — its own, and the two or three whose surfaces it
touched. On 2026-09-08 the manager ran all twenty-two for the first time and **four were red**: `part-j-proof`
and `part-h-proof` since Part T (2026-09-06), `theme-proof` since Part V (the same day), and `code-intel-proof`.
None was caused by the part that broke it, and none was caught for two days, because no list named them.

**Three of the four were measurement defects, and each read convincingly as a product defect.** Part T's shipped
`code_intelligence` entry costs about 4.5 s of discovery at every run start, and a continuation pays it twice, so
windows sized before it stopped fitting: a paused run was still executing when its capture closed and the quit
cancelled it (`user_cancelled` against a session still `running`, which reads as a teardown defect), and a loop
scenario reached two supervisor activations of the three it needs (no stop reason at all, which reads as a
supervisor defect). Part V's startup notice fades in, and the theme proof photographed it mid-fade, measuring its
text at about a quarter opacity — contrast near 1.26 against a 4.5 floor on **every theme at every scale**, which
reads as the accessibility floor being violated wholesale. It was not.

So the rule is: **a batch's verification sweeps every `*-proof` script**, and a proof that a change elsewhere
falsified is repaired in the commit that finds it, with the date it went red stated. A named subset cannot catch
a proof broken by a part that never mentions it, and the three above show what that costs — not a missed defect,
but a false one, sitting in the evidence, waiting to be believed. `code-intel-proof` needs the runtime's
TypeScript language server provisioned on first use, so it is IC-7's and the owner's rather than a session's.

**The sweep of 2026-09-08 (Part AH), and what attributing a red proof actually takes.** Twenty-four scripts ran;
`slice-proof` was not among them (it needs the owner's pasted key) and `code-intel-proof` stays IC-7's. Nineteen
were green, `compression-proof` was green, and **four were red**. Each was then re-run against **clean HEAD with
Part AH stashed**, because the rule above says to repair what *this* change falsified and nothing tells you which
that is until you measure it. All four were red on HEAD too, so none is Part AH's:

- **`theme-proof`** — `FAIL focus` on every theme at every scale and `rotaris-dim @ 2: FAIL contrast`. These are the
  two findings the 2026-09-08 theme measurement already recorded as undiagnosed and the owner's; **IC-2 is not
  re-discharged** and this is that state, not a new one.
  *Corrected 2026-09-09 (Part AI), which had to measure this proof to attribute its own colour changes.* The
  contrast failure is **not** `@ 2` — it is every scale, identically, and the note above understated it by reading
  one line of the summary. It is **two labels on the Mission view**, `Pause` and `Cancel selection`, both at a ratio
  of **2.90** against floors of 4.5 and 3; the figure does not move with scale because nothing about it is
  scale-dependent. Measured on Part AI's tree and on clean HEAD in the same hour, byte for byte the same failures,
  so it is neither Part AH's nor Part AI's — it is IC-2's, still open, and now diagnosed.

  **The diagnosis, and why the arithmetic could not see it.** Both labels are disabled controls and both are painted
  in `--rt-text-disabled`, which is why the two ratios are identical: `shell.css` already replaces the design's
  `.btn:disabled { opacity: .42 }` with `opacity: 1; color: var(--rt-text-disabled)`, and Mission's `Pause` reaches
  the same token through `[aria-disabled='true']`. In `rotaris-dim` that token is `oklch(52% 0 0)`, and against the
  five grounds it is actually painted on it measures **3.22 on `--rt-bg`, 2.99 on `--rt-chrome`, 2.91 on
  `--rt-surface`, 2.56 on `--rt-surface-2` and 2.56 on `--rt-hover`** — it clears 3:1 on exactly one of them.
  `static-contrast.ts` checks it against **`--rt-bg` alone**, where it passes, while every other readable colour in
  that file is checked against all five; so the gate is green, `contracts.test.ts` separately *asserts* the failure
  on `--rt-surface` as a preserved finding of the adopted palette, and the two never meet. `theme-proof` reads
  pixels and therefore sees it, which is the whole reason `REQ-SHELL-160` requires pixels.

  **What would fix it, and why Part AI did not.** `REQ-SHELL-134` permits one correction — raise perceptual
  lightness — and **59 %** is the lowest whole step clearing 3:1 on all five grounds (worst 3.32 on `--rt-hover`,
  4.31 on `--rt-bg`, against a half-enabled ceiling of 7.43). `nocturne` (60 %) and `high-contrast` (55 %) already
  clear theirs. Part AI made that change, found it red against `contracts.test.ts`'s two guards — the zero-drift
  transcription of `docs/design/system/tokens/colors.css` and the line that *deliberately* preserves this failure —
  and **reverted it**. Editing an adopted token and rewriting the test that records the finding is a decision about
  IC-2, and IC-2 is the owner's; **no condition may be downgraded by the person doing the work**. The numbers are
  left here so the decision can be made without repeating the measurement.
- **`part-h-proof`** — "loop supervisor stop reason was absent": the scenario reached fewer activations than the
  three it needs. This is the same window-sizing shape that Part T's 4.5 s discovery cost produced above, repaired
  once on 2026-09-08 and red again on a loaded machine. The windows are sized for an idle one.
- **`library-proof`** — `REQ-CHAT-044`: applying a stash onto a non-empty composer produced `alpha one` twice. The
  Library's own row above says the requirement was "vacuously satisfied on the Library's own routes **until
  REQ-SHELL-159's composer draft exists**". Part AB built that draft on 2026-09-08, so the owe came due and the
  proof's expectation is the stale half. **This is a repair of its own and belongs to the CHAT domain**, not to a
  commit about compression; it is stated here rather than folded into one.
- **`transcript-proof`** — appending at 1200 rows measured 66.1 ms against 41.3 ms empty, over its bound. A timing
  bound on a machine running the rest of the suite beside it.

**Two of the reds this batch met were not defects at all, and one of them cost a second measurement to prove it.**
`checkpoint-proof` failed its `ref-gone` scenario once with an empty refusal dialog, passed on HEAD, and then
**passed twice in a row on the very tree that had just failed** — a timed click sequence read before the dialog
was up. `packages/agent-tools/src/terminal/terminal.test.ts` fails under the full parallel `pnpm test` with a
**different PTY case each run** and passes in isolation and on HEAD. Both are the section's own lesson arriving
again: the expensive failure of a proof suite is not the defect it misses but the one it invents. **Re-run a red
proof, and measure HEAD, before attributing it to the change in your hand.**

**The design language was adopted on 2026-09-01 and first measured against the built interface on 2026-09-08**,
after the owner reported that the Workspace and the transcript do not look like the material. The reading is in
`docs/design/README.md` §7.1 and the obligation it produced is in `CLAUDE.md` and §7: **consult the mockup before
drawing a surface — `pnpm mockup` — and match it after.** What the reading found is worth carrying here, because
it is not the shape the complaint suggested. The tokens hold: no source file carries a literal colour, the
renderer imports the design system's three stylesheets, and 59 of the 96 class names its component CSS defines
are named in a `className`, the rest belonging mostly to components no screen has needed yet. The transcript's *treatments* hold too, and for a reason the record had not stated plainly —
`REQ-CHAT-060`, `REQ-CHAT-061` and `REQ-CHAT-062` write the mockup's own monospace one-liners and its
`INPUT`/`OUTPUT` card as requirements, so specification and design agree there and `transcript/Row.tsx` follows
both. Where they disagree — `REQ-CHAT-057`'s 52 px and 112 px columns against the mockup's right-aligned user
bubble — §2's rule already decided it for the specification, and the build is correct. **What no source asked for
is the container**: `shell.css`'s `.row` wraps every row, of every role, in a `--rt-surface` card with a border
and a radius, which `REQ-CHAT-057` does not mention and which in the mockup is earned — the user's own tinted
bubble, an expanded tool call, an artifact preview, the terminal block and the approval card have a surface, and
an agent's prose and every one-liner sit directly on the background. That invention is the whole of the visible drift, and it is about six declarations.
**Tokens are not compliance**, which is the lesson the obligation is written to carry: a change can cite every
token by name and still invent the composition the language had already decided.

**Part AI carried out the repair the same day the reading deferred it**, the owner having set compliance as the
goal; `docs/design/README.md` §7.2 lists the six changes and the deferral is kept above them. `.row` gave up the
universal card and a surface became something a row earns — the user's own message, an expanded tool call, an
approval, a user-made diff — while an agent's prose, every one-liner and a group's members sit on the background.
Prose took the material's 78 % measure, a system row took the notice pattern, a tool one-liner moved to axis Y
(`REQ-CHAT-060` names no colour and the material does), the run header's state became the design's `Tag` with a
status dot rather than coloured text with four per-state overrides, and the command palette gained the
`.cmdk-foot` the material draws. **`REQ-CHAT-057`'s geometry is untouched and `rows-proof` still measures it** —
what changed is what neither the specification nor the design had asked for, which is the only part §7.1 said was
free to change.

**Wave 1 of the three-lane build — 2026-09-09.** Five Parts were built at once in five worktrees by five agents (the plan: the Requirements view as lane R, the live terminal as lane T, the CHAT domain's owed surfaces as lane C), verified by a read-only gate that ran each worktree's `pnpm check` and proof twice, and merged in the order AK, AJ, AL, AM, AN. The merge found what the five green branches could not: a keep-both conflict resolver that de-duplicated identical lines dropped a closing brace from a `case` block (git had aligned two different blocks' `}`), so every merge is now checked by brace count against base, ours and theirs before it is committed; AJ's `OBLIGATIONS` (the change-obligation texts) and AK's `OBLIGATIONS` (the evidence kinds) collided in the `@rotaris/workspace` barrel and the first is `CHANGE_OBLIGATIONS` now; the two seam-copy files each side had written to compile alone (`terminal.ts`, `terminal-keys.ts`, `requirements.ts`) were dropped for the owner's; AK's `ENGINE_NOT_MERGED` stub gave way to AJ's engine in the workspace service's case. The five Parts numbered their defects from forty-six each; the sequence is renumbered in merge order and **the tally stands at sixty**: AK 46, AJ 47–49, AL 50–52, AM 53–55, AN 56–58, and the merge's own fifty-nine — `emulator.ts`'s default imports of the two xterm packages, which vitest's CommonJS interop tolerated and `electron-vite build` refused, so the run-host bundle failed on the merged main while every branch had been green; a gate that admits a Part touching a composition root must also build, and gate 2 does. The merge-1 proof pass over the whole suite then found the sixtieth: `sessions-proof` (Part U) pinned the count of tables carrying a `session_id` at fifteen and asserted the cascade empties every one, and AK's `delivery_runs` — ruled to carry the column as a fact with no foreign key (REQ-TRACE-476) — broke the pin on the merged main alone; the proof now reads the cascade premise from the schema and proves the run row survives the delete (%(sessions)s). The same pass found that the runtime view's §7 held no row for v15's seven tables although `views/README.md` said the view had been reconciled — the row is written now, a records defect of the merge and not of the tally. Of the suite's other reds, `library-proof`, `transcript-proof` and `theme-proof` are the three recorded above, unchanged by wave 1 (`transcript-proof`: %(transcript)s); `git-proof`'s create scenario probed the worktree table 1.2 s after the create while the post-create re-read (eleven reads at ~900 ms each on a machine running five build agents) was still in flight — the same window-sizing shape as `part-h-proof`'s, and %(git)s. Rulings the build needed and the plan had not made are recorded in the plan's Reservations table dated 2026-09-09 (the `process-protocol.ts` banner blocks, the `kind` discriminator on terminal commands, a channel's counter line and a migration's test pins riding with their reservations, the worker entry, the `.gitignore` and `eslint.config.js` lines per proof). Two lessons for the next wave: a message to a finished agent resumes it into its worktree, so a tree handed to another agent gets one stand-down message and nothing else; and agents spawned under plan mode inherit it and must be approved through `ExitPlanMode` before they can edit.

## Where the next work lands

| When the build reaches | It lands in | And owes |
|---|---|---|
| ~~the session writer + projection owner + one transcript row end to end~~ **done 2026-09-03**; spikes 8 and 18 taken | `engine`, `store` (DAL), `shell` (relay), `ui-core` | — |
| ~~the run loop consuming the prompt: iteration, the model port, `session.end`/`result`, status transitions~~ **done 2026-09-03**; spike 6 taken in its structural half | `engine`, `model`, `contracts`, `ui-core`, `ui` | ~~spike 6's live half~~ **taken 2026-09-05** (OpenRouter, four of four; ADR-0027's fallback withdrawn); ADR-0026's parameterised conformance suite once a second backend exists |
| ~~tools and the permission gate~~ **done 2026-09-03**, then ~~children and the scheduler~~ **done 2026-09-03**, ~~hooks~~ **done 2026-09-04**, ~~intent classification~~ **done 2026-09-04**, ~~the loop supervisor and `continue`~~ **done 2026-09-05** (ADR-0059; `pnpm part-h-proof`), ~~the control channel~~ **done 2026-09-05** (ADR-0010; `pnpm part-j-proof`) — the row is exhausted | `agent-tools`, `engine`, `config`, `hooks`, `ui` | ~~the fallback-model and rate-limit paths~~ **built 2026-09-05** (Part Q), `REQ-ORCH-030`, ~~the session browser's repair, delete, export and store actions (`REQ-SESSION-182`)~~ **built 2026-09-06** (Part U), ~~the delegation-context header and scope toggle (`REQ-CHAT-068/069`)~~ **built 2026-09-07** (Part AA); ~~the export of the four records (`REQ-SESSION-199`)~~ **built 2026-09-06** (Part U), ~~`fetch` (ADR-0023 over ADR-0036)~~ **built 2026-09-05** (Part N; `pnpm fetch-proof`; owes the egress settings surface REQ-SANDBOX-113..118 and OQ-37), ~~the terminal's live streaming (ADR-0021) and its four control operations~~ **built 2026-09-09** (Parts AL and AM), OQ-39's sizing under load; ~~`REQ-ORCH-093`'s context-window condensation~~ **built 2026-09-08** (Part AH; ADR-0060; `pnpm compression-proof`); for the control channel (~~the operations~~ **built 2026-09-05**; `pnpm part-j-proof`): ~~structured questions~~ **built 2026-09-07** (Part AC), compression (§10's manual arm — the engine half is Part AH's), the verification skip, the transcript clear, the stall-evaluation injection leg (REQ-MONITOR-135), ~~the inspector and persona windows~~ **built 2026-09-05** (Part R), REQ-MONITOR-132's quit warning, a todo-edit surface (Part AD's, batch 3); for hooks: ~~worktree working directories~~ **built 2026-09-05** (Part O), `verifier_finished`, REQ-HOOKS-082 with checkpoints, a notice queue (ADR-0049); for configuration (~~ADR-0036~~ **built 2026-09-05**; `pnpm config-proof`): ~~the auto-discovered-server layer and `mcp_servers`~~ **built 2026-09-05** (Part S), secrets, REQ-CONFIG-183's strict `requirements:` block, the security policy card, the Display/Skills/MCP/Plugins/Tools categories, the write path's timing; for providers (~~ADR-0028/0029/0030/0032~~ **built 2026-09-05**, the OpenAI-compatible instance; `pnpm slice-proof`): the device-code and PKCE authenticators with the loopback listener, Copilot's and codex's discovery and bridges, the usage and credit tiles, keep-fresh renewal, the configuration editor of REQ-PROVIDER-097, the model picker's live per-provider loading (145), the runtime `/model` override (146), `unavailable_models`, the shipped capability metadata (OQ-18), `warning` health; for the intent (~~the classifier prompt a real small model answers as asked~~ **built 2026-09-05**, Part L): REQ-ORCH-012's prior-response route, plan mode (REQ-ORCH-152..154); ~~per-slot credential resolution~~ **built 2026-09-05** |
| ~~the restore behind a real run host~~ **done 2026-09-03** | `workspace`, `workspace-service`, `main`, `contracts`, `shell`, `ui` | IC-5 discharged; IC-4 half 1 discharged, **half 2 awaits the owner's rename and reboot** (`spikes/machine-identifier-rename.md`); the kill-in-the-gap case; ADR-0005's reap-and-repair for a stale session a backup carried |
| ~~the agent surfaces~~ **done 2026-09-05** (Part R; `pnpm mission-proof`; ADR-0048 first executed, ADR-0043 fourth; built in parallel with Part S) | `ui` (`MissionView`, `AgentTable`, `Inspector`, `PersonaWindow`, `agents.ts`), `contracts` (`children.ts`, `commands.ts`), `engine` (`children/activity.ts`, the projection), `main` (`windows.ts`), `renderer` (the `persona` role), `platform` (the preference) | application-modality across windows (ADR-0048's registry disabling input routing — no application-modal surface exists); the persona window's terminal-preview parity (REQ-SHELL-075 b, ADR-0021); artifact links from the agent inspector (the store exists since Part Y; the inspector does not link into it yet); the compression count (REQ-MONITOR-281 — the record has none); REQ-MONITOR-067's withheld models (no provider reports one); the run-level agent's own prompt reading and tool history (no channel field); a declined raise induced; the Overview card's tree on the shared selection; the Mission table's width at 1264 px (its last column clips) |
| ~~the MCP client and its configuration pipeline~~ **done 2026-09-05** (Part S; `pnpm mcp-proof`; ADR-0033 and ADR-0034 first executed, ADR-0016 fourth; spikes 3 and 4 taken; built in parallel with Part R) | `mcp`, `config` (`mcp/`, the section), `agent-tools` (executors outside the registry), `run-host` (`mcp.ts`), `main`, `contracts` (`mcp.ts`), `ui` (`settings/McpSettings.tsx`), `platform` (`findExecutable`, `windowsLaunchOf`), `kernel` (`order.ts`) | ~~**ADR-0035 entirely**~~ **built 2026-09-06** (Part T; the machine-setup half of 112 and 095/096 still owed, IC-7 proposed); the secrets write surface (REQ-MCP-084/110/111); the palette entry (REQ-MCP-108); a real third-party server and the two remote transports against a live endpoint; `web_search` and `browser` live; a per-session `closeSession` once the engine releases a lock per session; the environment scrub before the overlay (OQ-22, the owner's); ~~`pnpm package`'s `EMFILE` refusal~~ **gated 2026-09-05** (`scripts/fd-gate.cjs`) |
| ~~the session browser's actions~~ **done 2026-09-06** (Part U; `pnpm sessions-proof`; ADR-0005/0003/0024/0058 executed, ADR-0039 second; built in parallel with Part T) | `engine` (`export.ts`, `sessions.ts`), `store` (the delete, the readers), `run-host` (`session-actions.ts`), `workspace-service` (the fourth checkpoint ask), `main` (the save dialogs), `contracts`, `ui` (`SessionBrowser.tsx`) | ~~REQ-SESSION-134's timeline `id` and `severity` (the thirty-second defect — a migration)~~ **repaired 2026-09-06** (store v10; the ADR-0024 note; a pre-v10 entry keeps an empty id and the export omits the field); the palette entries (REQ-SHELL-048); ~~the artifact bodies of REQ-SESSION-002 (no library)~~ **built 2026-09-07** (Part Y; named flat, `artifact-<id>.md`, and Part U's `SESSION_ARTIFACTS_DIR` was the thirty-third defect); the multi-session host's focus switch; REQ-EVENTS-172's JSON-lines export (the event view's); an isolated session's worktree directory on delete (REQ-GIT-111) |
| ~~the notice pipeline and the one transient acknowledgement surface~~ **done 2026-09-06** (Part V; `pnpm notice-proof`; ADR-0049 executed in full, its "Revisit if" answered; built in parallel with Part W) | `main` (`notices.ts`), `contracts` (`notices.ts`, channel 8), `ui-core` (the acknowledgement stack), `ui` (`Notice.tsx`, `Acknowledgements.tsx`), `run-host` (`timeline.append`), `engine` (the notice's session) | the application diagnostics for a warning with no session (the diagnostics store of REQ-STARTUP-130ff is not built, so it is a log line); REQ-SHELL-118's update-offer notice updated in place; the seven action members with no target in this build (update, restart, cloud, project init, retry, proposal revert, settings save); ~~`open-library` until the Library view exists~~ **dispatching 2026-09-07** (Part X; the named tab selects itself, measured by both proofs); **the two open questions were ruled 2026-09-06 as ESC-33 and ESC-34** (`owner-decisions.md`; the tenth amendment round in `../clean-room/specification-gate.md`), and what ESC-34 leaves owed is navigating between workspaces from a notice — a review action naming a workspace other than the open one opens nothing — and `REQ-WORKSPACE-152` (1)'s re-authenticate entry, which no notice names |
| ~~the command palette, keyboard help and application modality~~ **done 2026-09-06** (Part W; `pnpm palette-proof`; REQ-SHELL-048's one vocabulary; ADR-0048's modality first executed; built in parallel with Part V) | `ui` (`commands/`), `main` (`windows.ts` the family modality, `index.ts` the command), `contracts` (`window.modality`), `renderer` | ~~Ctrl+F (no transcript search panel)~~ **built 2026-09-07** (Part Z; the panel is the pane's, REQ-CHAT-074), Ctrl+Shift+T (the window component exists since Part AM; its role, mounting and the entry are AL′'s), the demo entry (REQ-SHELL-162), REQ-CHAT-167's reasoning toggle (the preference key is unregistered); ~~the composer's slash catalogue consuming this registry (REQ-SHELL-056, REQ-CHAT-028 — the CHAT domain's)~~ **built 2026-09-09** (Part AN); the palette in auxiliary windows |
| ~~the bundled code-intelligence runtime~~ **done 2026-09-06** (Part T; `pnpm code-intel-proof`; ADR-0035 first executed; spikes 5 and the bundle taken; **IC-7 proposed**; built in parallel with Part U) | `main` (`sentinel.ts`), `config` (`mcp/code-intelligence*.ts`, the generated manifest), `mcp` (`setup.ts`, the probe), `run-host` (`mcp.ts`), `ui` (`McpSettings.tsx`), `contracts` (`mcp.ts`), `apps/desktop/scripts/code-intelligence/`, `electron-builder.yml`, `package.mjs`, `build-hooks.cjs` | ~~**IC-7** — the language servers (the owner's)~~ **adopted 2026-09-06, option 2 (ESC-32)** — declared in the manifest against the runtime's defaults, disclosed on the MCP category (`REQ-MCP-118`); the notices generator's section (`REQ-STARTUP-141/142/143`) is IC-7's owed half; macOS/Linux bundles (IC-3); the machine-setup half of REQ-MCP-112 and the warm steps of 095/096 (with the onboarding task registry, REQ-MCP-045/098); the ONBOARDING tier's grantee (`project-initializer` is not a built-in role); REQ-MCP-034's isolated-tree root (the configuration resolves per workspace); nested `.gitignore` files in the contains-code walk; the runtime's stderr volume and its 4.5 s discovery per process (stated, not changed); the `.serena/` reading confirmed by the owner |
| ~~the Overview view~~ **done 2026-09-05** (Part M; `pnpm overview-proof`; ADR-0038 first executed) | `ui`, `engine` (the sampler), `store` (v7), `workspace` (`git/`), `workspace-service`, `main`, `contracts`, `platform` | ~~the Mission view the tree card links to~~ **built 2026-09-05** (Part R); ~~REQ-SHELL-125's start-session dialog (worktree and sandbox choices)~~ **built 2026-09-05** (Part O); ~~the Git view — its notice when Git is missing (ADR-0038 c.1), worktrees, the history table~~ **built 2026-09-05** (Part O), checkpoints; the credit tile and the limits card once Part K's usage tiles exist; the proposals card once the **Proposals tab** exists (the Library itself was built 2026-09-07, Parts X and Y; the third tab waits on OQ-45's write path); a cost label with a configured rate (REQ-MONITOR-166's other two qualifiers); a requirement tag on a session (REQ-MONITOR-172) once traceability exists |
| ~~checkpoints~~ **done 2026-09-05** (Part P; `pnpm checkpoint-proof`; ADR-0039 first executed; built in parallel with Part Q) | `workspace` (`git/checkpoints.ts`), `store` (v9), `engine` (the port, the writer's two units), `contracts`, `workspace-service`, `main`, `run-host`, `ui`, `config` (the `checkpoints` section) | ~~REQ-GIT-069's ref cleanup when a session is deleted~~ **built 2026-09-06** (Part U); `manual` checkpoints (no surface asks); REQ-HOOKS-082 with checkpoints; the two events in REQ-SESSION-199's export; improvement checkpoints (`REQ-LIBRARY-*`); a non-UTF-8 path and a submodule, read not measured |
| ~~the model resilience paths~~ **done 2026-09-05** (Part Q; `pnpm resilience-proof`; ADR-0027 third, ADR-0012 fourth, ADR-0010 third execution) | `engine` (`run/resilience.ts`, `ladder.ts`, `waits.ts`), `model`, `contracts` (`wait`), `run-host`, `main`, `ui` | REQ-ORCH-093's context-window condensation; REQ-ORCH-089's stall watchdog and its badge; a real provider's 429 (a slice-proof scenario for the owner); REQ-NOTIFY-062's hosted-credit branch; REQ-ORCH-146's native loop; rate-limit-reset headers |
| ~~the Git view and the worktrees~~ **done 2026-09-05** (Part O; `pnpm git-proof`; ADR-0038 second executed; built in parallel with Part N) | `ui`, `workspace` (`git/`), `workspace-service`, `main`, `contracts`, `store` (v8), `engine` (the effective root), `platform` | ~~checkpoints (ADR-0039)~~ **built 2026-09-05** (Part P); integration and "Merge selected" (REQ-GIT-083, 125..135); REQ-GIT-084's focus requests; the set-up-Git-here offer (REQ-GIT-113/114, in the Requirements area); requirement-execution worktrees; `git_commit` (REQ-GIT-144); `worktree_storage_subpath` read from configuration (REQ-GIT-073 / REQ-CONFIG-068); REQ-SANDBOX-119's probe-driven checkbox; a notice queue so the Git notice and the first-launch notice coexist (ADR-0049) |
| ~~the build's load proof~~ **done 2026-09-04** — `pnpm package` (`apps/desktop/scripts/`), **IC-6 discharged**; the first packaged window was blank (the ninth defect) | `apps/desktop/electron-builder.yml`, `scripts/build-hooks.cjs`, `scripts/native-load-probe.cjs`, `scripts/package.mjs` | the portable's stub (ADR-0054), signing, the release gate, an icon; IC-3 item 3 |
| ~~a terminal save's durability~~ **harness built 2026-09-04** (`packages/store/spike/`, `power-loss.spike.test.ts`) | `store` (the settings are the store's; the writer's raise-and-lower is `dal.ts`'s) | **the power-loss test's fault half — the owner's power cut or kernel crash** (`spikes/power-loss.md` §4) |
| ~~the two undesigned themes~~ **done 2026-09-04** — `pnpm theme-proof`; **IC-2 discharged** | `contracts` (theme data and colour math), `platform` (preferences), `main`, `ui`, `apps/desktop/scripts` | different-scale multi-monitor drag on owner hardware; macOS/Linux native surfaces stay with IC-3 |
| ~~the Library view, its shell and its Prompts tab~~ **done 2026-09-07** (Part X; `pnpm library-proof`; ADR-0042 fourth and ADR-0058 executed, both **found nothing**; built in parallel with Part Y) | `ui` (`library/`: `LibraryView`, `PromptsTab`, `StashDialog`, `types.ts`), `contracts` (`library.ts`, channel 9, the three `prompts.*`), `store` (v11, the two prompt tables and their DAL), `run-host`, `main` (`library.ts`, the revision), `renderer` | ~~`/stash` and `/pop` (REQ-LIBRARY-142) wait on the composer's slash catalogue~~ **built 2026-09-09** (Part AN); demo mode (REQ-LIBRARY-119/143) waits on REQ-SHELL-162's demo window; **the Proposals tab is a part of its own and begins with the ADR that closes OQ-45's storage half** — no ADR owns the improvement artifact store's write path, so the tab ships as a placeholder that says why; REQ-CHAT-044's blank-line append is vacuously satisfied on the Library's own routes until REQ-SHELL-159's composer draft exists |
| ~~the session artifact store, the Artifacts tab and the inspector~~ **done 2026-09-07** (Part Y; `pnpm artifacts-proof`; **ADR-0051 first executed**, ADR-0003 and ADR-0058 executed; four defects, the thirty-third to the thirty-sixth; built in parallel with Part X) | `store` (v12, `artifacts` and its declared index), `engine` (`artifacts/`: record, sidecar, store, context, port), `agent-tools` (`tools/artifacts.ts`, the three executors the registry already named), `ui` (`markdown/`, `library/ArtifactsTab.tsx`, `library/ArtifactInspector.tsx`), `contracts` (`artifacts.ts`), `run-host`, `main`, `renderer` | the improvement artifacts of REQ-LIBRARY-042ff (the Proposals part's, blocked on OQ-45); the agent inspector's artifact links, which Part R owes; the improvement checkpoints Part P owes; ~~a Markdown link that OPENS~~ **built 2026-09-07** (Part AA added `shell.openExternal`; an `http(s)` link opens in the system browser, a `file:` reference is refused by scheme, and a platform refusal is reported rather than passing silently); ~~the transcript's own use of that renderer~~ **built 2026-09-07** (Part AA; agent-message rows render through `ui/markdown`, and nothing renders Markdown a second way) |
| ~~the transcript engine: ADR-0045's recycled pool, ADR-0046's steps 3-5, the projection, the anchor, search and paging~~ **done 2026-09-07** (Part Z; `pnpm transcript-proof`; **ADR-0045 first executed and ADR-0046's first note**, covering steps 0-2 too, which had shipped under ADR-0043's note; built in parallel with Part AA) | `ui` (`transcript/`: `types`, `constants`, `project`, `pool`, `cache`, `search`, `TranscriptPane`), `ui-core` (step 3's row counters), `contracts` (`chars`, `streamId`, `stalledSince`, `display/groupTools`), `config` (`display-section.ts`), `model` (`reasoning.ts`), `engine` (`session-writer`, `projection-owner`, `run/turn`) | REQ-CHAT-055/154/157 are **built but cannot be discharged** — the benchmark replay harness those three name as the deciding authority is ADR-0053's and is not built; REQ-CHAT-073 is met in one clause of two (no Clear action exists, section 14 being out of plan); REQ-CHAT-051 is met for approvals and **pending for questions** until Part AC widens `pendingQuestions`; ~~the live-terminal clauses of REQ-CHAT-063 and 066 are implemented and unexercised (nothing publishes a terminal frame, ADR-0021)~~ **a producer and a preview exist since 2026-09-09** (Parts AL and AM; the live-stream measurement is AL′'s); REQ-CONFIG-472's Display settings category (the read path and the caps are built, the surface is not) |
| ~~the transcript's row renderers~~ **done 2026-09-07** (Part AA; `pnpm rows-proof`; **ADR-0051's second execution**; built in parallel with Part Z) | `ui` (`transcript/Row.tsx` — the ONE row renderer, a pure function of its props; `TranscriptSurface.tsx`; `RowProof.tsx`; `markdown/` consumed), `contracts` + `main` (`shell.openExternal`), `platform` (`display/showReasoning`, `display/autoCollapseTools`) | ~~REQ-CHAT-076's live-terminal pop-out is implemented and unexercised (ADR-0021)~~ **the preview block draws the screen since 2026-09-09** (Part AM; the pop-out window's mounting is AL′'s); the parse cache's live-row rule (`peek` against `parse`) is Part Z's REQ-CHAT-058 and is owed; REQ-CHAT-163 was reassigned to Part Z mid-plan as stream-side work and REQ-CHAT-164 split, Z detecting the stall and AA drawing it |
| ~~the composer's chips, its drafts, its history and the run header~~ **done 2026-09-07** (Part AB; `pnpm composer-proof`; ADR-0042's fifth execution, **found nothing** in the store and one thing in the seam above it; **OQ-51 raised against REQ-CHAT-039**; built in parallel with Part AC) | `ui` (`composer.ts`, `WorkspaceView.tsx`), `platform` (`preferences.ts` — the first PARAMETRISED key family, `workspaces/{key}/composerDraft`), `contracts` (`composer.readDraft`/`writeDraft`, key-less by design), `engine` (`sessions.ts` the queue, `session-writer.ts`), `store` (**v13**, `queued_prompts.context_snapshot`), `main`, `renderer` | **OQ-51 is open and blocks the unscoped half of REQ-CHAT-039** — the column is `NOT NULL` and the owner's 2026-09-07 amendment of REQ-CHAT-041 assigns one session-scoped queue without amending 039 beside it; REQ-CHAT-008's recovery state is unit-tested but unmeasured in the product; REQ-CHAT-158's model-call boundary is approximated from the newest row because no field publishes one (owed: a `SessionRecord` field); REQ-CHAT-007's second limb is implemented and **unreachable**; REQ-CHAT-155 is met in two limbs of three; **Parts AD and AE must take v14 and v15** |
| ~~structured questions and the stepper~~ **done 2026-09-07** (Part AC; `pnpm questions-proof`; **ADR-0010's fourth execution and ADR-0016's fifth**; built in parallel with Part AB) | `agent-tools` (`tools/questions.ts`, the executor the registry had named since Part B), `contracts` (`pendingQuestions` widened, `approval.raise`), `engine` (`sessions.ts` the two control arms, `run/run.ts`, `run/turn.ts`, `children/personas.ts`), `ui` (`QuestionStepper.tsx`, the trailer's question arm), `run-host`, `main`, `renderer` | REQ-SESSION-025's persistence limb (`pendingQuestions` is derived from the live run, never mirrored to a column — a wait restored from disk has no waiting call behind it, which is the false success REQ-CHAT-102 forbids); whether a delegated child may ask the user (**raised against REQ-TOOLS-002**, and it is NOT in the register — the manager entered it as OQ-52); closing the OS window rather than the modal is implemented via `beforeunload` and unexercised |
| ~~the editable task plan~~ **done 2026-09-08** (Part AD; `pnpm todo-proof`; ADR-0059's fourth execution) | `engine` (`todo-view.ts`, `run/run.ts`, `run/todo.ts`, `sessions.ts`), `agent-tools` (`tools/todo.ts`), `contracts` (`channels.ts`), `ui` (`TodoPane.tsx`, `WorkspaceView.tsx`), `run-host` | REQ-CHAT-085..091 are met; a child's plan is edited only through the run that owns it |
| ~~durable image attachments~~ **done 2026-09-08** (Part AE; `pnpm attachments-proof`; store **v14**) | `engine` (`attachments.ts`), `store` (v14, `transcript_rows.attachments`), `contracts`, `ui`, `main`, `renderer` | REQ-CHAT-046/153/173; a model that declares no image input refuses the attachment rather than dropping it |
| ~~the four Settings categories that could be reached~~ **done 2026-09-08** (Part AG; `pnpm settings-proof`; ADR-0036 third and ADR-0037 second execution; two defects, both about a null meaning "no limit") | `ui` (`settings/{DisplaySettings,Inventories,About}.tsx`, `config-state.ts`), `config` (`display-section.ts` — the key names REQ-CONFIG-172 states), `contracts` + `main` (`shell.openThirdPartyLicenses`, `shell.hello`) | Skills waits on portable-skill discovery and Plugins on REQ-TOOLS-161's loader, each saying which mechanism it waits for; REQ-SHELL-140's build identifier and REQ-SHELL-142's notices bundle have no asset in any build here and are owed to ADR-0054 |
| ~~context compression~~ **done 2026-09-08** (Part AH; `pnpm compression-proof`; **ADR-0060 first executed**; five defects, the forty-first to the forty-fifth, three of them found only on the first live run against a real provider) | `engine` (`run/conversation.ts`, `run/compression.ts`, `run/{turn,ladder,run}.ts`, `children/{orchestration,activity}.ts`, `session-writer.ts`, `todo-view.ts`, `sessions.ts`), `contracts` (`channels.ts`, `children.ts`), `run-host` (`compressorOf`, `compressionTriggerFor`, `contextLimitsOf`, the scripted faults), `ui` | **§10's manual compression is a part of its own** — `forceCompression`'s arm, the run-header control (REQ-CHAT-078..081) and REQ-MONITOR-090..097's concurrent pass over every live conversation, which ADR-0060 decision 1 exists to make buildable; **OQ-53** on the venue REQ-CONFIG-135 names; REQ-MONITOR-088's context-card caption and REQ-MONITOR-089's fall measured on a surface; a real provider's context rejection; a child's own compression in the app; `compressor.timeout_seconds` expiring; a compression during a parent resume, so `parent_resume_bad_request` is implemented and unmeasured |
| ~~the delivery store, the board projection and the requirements contracts~~ **done 2026-09-09** (Part AK; `pnpm delivery-proof`; **ADR-0041 first executed**; the forty-sixth defect, and the sixtieth at the merge-1 proof pass — `sessions-proof`'s fifteen-table cascade pin; built in parallel with Parts AJ, AL, AM and AN) | `store` (v15, `delivery/`), `workspace` (`delivery/`), `contracts` (`requirements.ts`, channel 10), `ui-core` (`requirements/display.ts`), `workspace-service` (`delivery.ts`), `main` (`requirements.ts`), `preload`, `shell` (the counter) | the board itself (AK′); runs from the board and the queue's persistence (AP: `requirements.scheduling.*` unregistered, the controls are in memory at `manual`/2); `start` on `requirements.queue.set`; REQ-TRACE-514's export; eight relation tokens with no data source in the document format; `superseded` health unreachable; `edit`/`create` (AP) and `accept-proposal`/`accept-change-work` (OQ-45) as stated refusals |
| ~~the traceability engine~~ **done 2026-09-09** (Part AJ; `pnpm traceability-proof`; **ADR-0040 first executed**; spike 7 taken — `spikes/traceability-scale.md`; defects forty-seven to forty-nine) | `workspace` (`traceability/`), `workspace-service` (`traceability.ts`, `traceability-worker.ts`), `contracts` (`traceability.*` protocol), `apps/desktop/scripts/fixtures/requirements-store/` | the syntax-tree parser for REQ-TRACE-104 rule 1 and 109/110 (OQ-24, AJ′ — measured against the spike's 1,000-file tree); the consumer package the artifact imports from (`rotaris-traceability`; REQ-TRACE-176/182/183); the orphan-test baseline's first real write once the parser exists; a contended replace (OQ-41); the Settings card and the `requirements.operation` relay (AJ′); AK's `compareReqIds` adopted for the engine's own ordering (REQ-TRACE-289) |
| ~~the terminal stream in the run host~~ **done 2026-09-09** (Part AL; `pnpm terminal-stream-proof`; **ADR-0021 first executed** against a real PTY; defects fifty to fifty-two, the last being two registered keys nothing read, and fifty-nine at the merge — the default imports the bundler refused) | `agent-tools` (`terminal/streams.ts`, the emulator port, the taps), `engine` (the row's `streamId`, published never recorded), `contracts` (`terminal.ts`, `TerminalFrameSchema` with `sessionId` and `seq`), `shell` (`subscribersOf`), `run-host` (`terminal.ts`, `tools.ts` reads the background limits), `main` (`terminal.ts`: the per-window `FrameDeliveryLimiter` under REQ-MONITOR-306, merged never dropped) | the window role and its lifecycle, the toolbar control, Ctrl+Shift+T, `terminal/autoOpen`, session-focus and new-session clearing (AL′); REQ-SHELL-166 against the real PTY through the window (AL′); REQ-MONITOR-306 across two windows (T″); a stated maximum on `shell_max_background_sessions` (OQ-55); the audit entry's vocabulary (OQ-54); a mid-run `meta` delivered after a merged delta under saturation carries a lower `seq` (a regression test owed) |
| ~~the terminal grid, the pop-out window's content and the transcript preview~~ **done 2026-09-09** (Part AM; `pnpm terminal-proof`; **ADR-0047 first executed** over a scripted frame source; defects fifty-three to fifty-five; the sixteen ANSI colours as `--rt-term-*` tokens in all three palettes with their own contrast floor) | `ui` (`terminal/`), `contracts` (`terminal-keys.ts`, `theme/themes.ts`, `static-contrast.ts`), `transcript/Row.tsx` (the preview block), `apps/desktop/scripts/terminal-proof/` | the window role, title and lifecycle, the toolbar control, Ctrl+Shift+T, the auto-open preference, session focus and new-session clearing (REQ-SHELL-080/081/086/108..111, AL′); REQ-SHELL-166 against a real PTY and REQ-SHELL-102 on a live stream (AL′/T″); REQ-SHELL-107's write is the run host's |
| ~~the composer's slash-command catalogue~~ **done 2026-09-09** (Part AN; `pnpm slash-proof`; ADR-0050 second, ADR-0049 third, ADR-0048 second execution; defects fifty-six to fifty-eight; `RunHeader.tsx` extracted with the two slots AL′ and AO fill) | `ui` (`slash/`, `RunHeader.tsx`, `WorkspaceView.tsx`, `library/StashDialog.tsx`), `renderer` (the `slash` host wiring), `contracts/theme/colour.ts` (the corrector no longer settles below its floor) | `notice.report` so a renderer can raise the one persistent notice (ADR-0049 defect fifty-seven — the composer draws its own banner meanwhile; AO); `/model`'s withheld-by-provider limb (no per-model verdict reaches the composer); skill commands (REQ-CHAT-034/162 wait on REQ-WORKSPACE-056..064); prompt files (REQ-CHAT-160/161, AO); `/compress` and `/clear` reach the run host and meet its default refusal until AO arms the two ops |
| macOS / Linux artifacts | `electron-builder.yml`, `platform/src/instance.ts` | IC-3 |
