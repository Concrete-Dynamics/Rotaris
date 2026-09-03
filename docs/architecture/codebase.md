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
| `@rotaris/store` | run host, workspace service | open (WAL read back, write probe, one canonical spelling), schema v2 + migrations, the DAL (rows with residency, events with the derived envelope and three declared indexes, the truncation record), identifier + resolution, backup, the corrected restore | ADR-0058, ADR-0005, ADR-0009 |
| `@rotaris/engine` | run host | `SessionWriter` (one transaction per unit of work, residency release, trim, sticky failure, the launch audit, the timeline, the terminal transaction), the one serialiser and the 23-type catalogue, `ProjectionOwner` (resident rows, the counter, growth tick, attach/reconcile), `Sessions` (the registry, the control channel, the run-active predicate), `run/` (`Run`, `StopRequest`, the stop conditions and every total mapping, the todo, the aggregates, `EventBus`, `SummaryWriter`), `RefusalLease`; tools, children, hooks next | ADR-0008, ADR-0009, ADR-0010, ADR-0013, ADR-0014, ADR-0043 |
| `@rotaris/model` | run host | the two ports (`ModelClient`, `AgentBackend`), `DefaultAgentBackend`, `ScriptedModelClient` (tests), `AiSdkModelClient` (pinned SDK, one decorated `fetch`); engine → model is a downward edge in the matrix | ADR-0026, ADR-0027 |
| `@rotaris/agent-tools` · `mcp` | run host | port shapes today; executors, gate, terminal, confinement, egress, the MCP transport next | ADR-0016–0025, ADR-0033–0035 |
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

**Where the model comes from is a stopgap at the run-host root** (`apps/desktop/src/run-host/index.ts`),
not a settings surface: `ROTARIS_MODEL_BASE_URL`, `ROTARIS_MODEL_ID`, `ROTARIS_MODEL_DIALECT` and
`ROTARIS_MODEL_API_KEY_ENV` (the *name* of the variable holding the key) build the AI SDK client;
`ROTARIS_MODEL_DIALECT=scripted` selects a built-in scripted client for verification; with nothing set a
run is refused before it starts with one `result` of status `error` (REQ-EVENTS-021). It goes when
ADR-0036 (configuration) and ADR-0029 (credentials) land.

9. **the backup and the restore behind the real run host (2026-09-03):** Settings → Project offers both.
   A backup is taken in the workspace service while runs continue; a restore is refused while a run is
   active, otherwise assessed read-only, confirmed through main's message boxes (what it does to the
   store now; both identifiers and ESC-26's three outcomes where they differ; foreign lock rows as one
   condition with the risk), performed by the service with the run host told to refuse, close, and
   reopen through narrow requests back to main, and the workspace re-handed to the run host afterwards.
   The previous store is displaced and kept. **Found:** ADR-0058's case (b) has no route in the product,
   because opening a workspace mints its identifier before a restore can be asked for.

Every view body but Workspace and Settings reads "Not drawn yet"; Settings draws only Project.

## Where the next work lands

| When the build reaches | It lands in | And owes |
|---|---|---|
| ~~the session writer + projection owner + one transcript row end to end~~ **done 2026-09-03**; spikes 8 and 18 taken | `engine`, `store` (DAL), `shell` (relay), `ui-core` | — |
| ~~the run loop consuming the prompt: iteration, the model port, `session.end`/`result`, status transitions~~ **done 2026-09-03**; spike 6 taken in its structural half | `engine`, `model`, `contracts`, `ui-core`, `ui` | spike 6's live half (an endpoint from the owner); ADR-0026's parameterised conformance suite once a second backend exists |
| tools and the permission gate, then children and the scheduler, hooks, intent classification | `agent-tools`, `engine` | ADR-0024's evidence rings, the session log (`REQ-SESSION-142`), the remaining 20 control ops |
| ~~the restore behind a real run host~~ **done 2026-09-03** | `workspace`, `workspace-service`, `main`, `contracts`, `shell`, `ui` | IC-5 discharged; IC-4 half 1 discharged, **half 2 awaits the owner's rename and reboot** (`spikes/machine-identifier-rename.md`); the kill-in-the-gap case; ADR-0005's reap-and-repair for a stale session a backup carried |
| the build's load proof | `apps/desktop/electron-builder.yml` + a build script | IC-6 |
| a terminal save's durability | `engine` (writer) | the power-loss test |
| the two undesigned themes | `ui` | IC-2 |
| macOS / Linux artifacts | `electron-builder.yml`, `platform/src/instance.ts` | IC-3 |
