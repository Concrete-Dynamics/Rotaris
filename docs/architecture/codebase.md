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
| `@rotaris/platform` | main, run host, workspace service | clocks, per-user dirs (local-not-roaming), atomic document, liveness probe + lock predicate, machine id, canonical path, instance record + claim, spawn; the installed product version (`version.ts`, the one reader main's About and the run host's MCP handshake share — REQ-STARTUP-007/158) | ADR-0004, ADR-0055, REQ-STARTUP-145, REQ-SESSION-046/051–054 |
| `@rotaris/config` | run host, workspace service | ADR-0036's loader, first slice: the YAML document tree over a tri-state model (`yaml@2.9`), the `hooks:` section read per scope and merged with the displaced lists kept, REQ-HOOKS-025's one command-pattern definition; takes no database handle; since 2026-09-28 the setup-manifest schema (`setup-manifest.ts`, zod, strict — what the shipped `apps/desktop/resources/setup-manifest.json` must be, validated by the test beside it and read by the pre-build guard; its product consumer, machine setup, is not built) | ADR-0036, REQ-HOOKS-007–018, REQ-HOOKS-025, REQ-STARTUP-058/059 |
| `@rotaris/hooks` | run host | ADR-0015: the matcher, the payload builder over kernel's one redaction pass, the runner (fresh process per invocation, resolve on exit plus a grace, kill the started process only), the verdicts and every message text, the trust gate and fingerprint, the external import, the policy file, the per-session `HookEngine`, the tab summary; the engine's `HookPort` and the gate's `ToolHooks` are filled at the run-host root | ADR-0015, REQ-HOOKS-019–139 |
| `@rotaris/store` | run host, workspace service | open (WAL read back, write probe, one canonical spelling), schema v2 + migrations, the DAL (rows with residency, events with the derived envelope and three declared indexes, the truncation record), identifier + resolution, backup, the corrected restore; **`delivery/`** — store v15's seven delivery tables and the one DAL that writes them in one transaction (ADR-0041, Part AK) | ADR-0058, ADR-0005, ADR-0009 |
| `@rotaris/engine` | run host | **children/**: the ledger over the writer's one transition function, admission, the scheduler run to quiescence, the one wait, the child's execution and report, the parent's resume loop, the sweeps, the built-in persona table;  `SessionWriter` (one transaction per unit of work, residency release, trim, sticky failure, the launch audit, the timeline, the terminal transaction), the one serialiser and the 23-type catalogue, `ProjectionOwner` (resident rows, the counter, growth tick, attach/reconcile), `Sessions` (the registry, the control channel, the run-active predicate), `run/` (`Run`, `StopRequest`, the stop conditions and every total mapping, the todo, the aggregates, `EventBus`, `SummaryWriter`), `RefusalLease`, `HookPort` (the engine's view of ADR-0015; `hooks-port.ts`), **intent/** (the classifier ladder, the gate), **playbooks/** (the catalogue, the matrix, the render, the clamp), `Preflight` | ADR-0008, ADR-0009, ADR-0010, ADR-0013, ADR-0014, ADR-0043 |
| `@rotaris/model` | run host | the two ports (`ModelClient`, `AgentBackend`), `DefaultAgentBackend`, `ScriptedModelClient` (tests), `AiSdkModelClient` (pinned SDK, one decorated `fetch`); engine → model is a downward edge in the matrix | ADR-0026, ADR-0027 |
| `@rotaris/agent-tools` | run host | the registry (facets, classes, the four-stage fold), the scanner, the egress classifier and **the `fetch` executor** (the front door, the per-call policy read, the redirect loop, the rendering — Part N), the policy (build once, evaluate pure, the atomic swap, session approvals), the approvals registry + presenter capability with the liveness lapse, the ONE gate (`REQ-TOOLS-175`'s order, both hook slots empty), the file/hash-anchored/search/todo executors, the terminal (PTY + marker protocol, background sessions, classification); the engine's `ToolPort` is filled at the run-host root, never by an import; **`terminal/streams.ts`** — the live-stream registry (ADR-0021, Part AL: one `@xterm/headless` emulator per stream, the ceiling-plus-flush with the 20 ms floor, the closing frame), fed by taps on the foreground and background sessions | ADR-0016–0020, ADR-0023 (classifier), ADR-0024 |
| `@rotaris/mcp` | run host | the MCP client (Part S): the owned stdio transport, the SDK's protocol layer and remote transports, the three connection paths, the nine-value identity, the code-point order; the bundled runtime's launch owed | ADR-0033–0035 |
| `@rotaris/workspace` | workspace service | the backup and the two-phase restore around the store's mechanism (assessment, the identifier cases, ESC-26's establishment after the store is whole); **`git/`** — ADR-0038's one invocation helper (the env scrub, the network refusal, the rendering, the bounded spawn), the repository reads behind the Overview's card, the Git view's reads (`view.ts`), the worktree writes (`worktrees.ts`) and REQ-GIT-003's exclusion (`paths.ts`); checkpoints, traceability, delivery next; **`traceability/`** — ADR-0040 (Part AJ): the hand-written frontmatter reader, the streaming store parse, the layout configuration and root discovery, the built-in TypeScript convention and the language seam, the sweep, the verification pass in REQ-TRACE-091's order, the TypeScript symbol artifact, the three baselines and the tombstone log, the change comparison, the coverage query, the store probe, the progress protocol, cancellation by a shared flag; jobs pure over bytes, run in-thread or on a terminable worker (`worker.ts`); `engine.ts` is the one I/O owner and the seam's `TraceabilityEngine`; **`delivery/`** — ADR-0041 (Part AK): the transition function (`decide` pure, the single-flight admission, one transaction), the reader and writer handles, the release gate, the projection as one frozen value, the restart reap | REQ-SESSION-201, ADR-0058, ESC-26, ADR-0038, ADR-0036–0041 |
| `@rotaris/shell` | main | `UpdateRelay` (fan-out, order across both channels, message counters), `ProcessLink` (bounded request/reply, and the child's narrow requests back to main) | ADR-0044, ADR-0013, ADR-0002 c.7, c.11 |
| `@rotaris/ui-core` | renderer | the replica store with the step-0 sequence check, the decline, paging older rows, rows kept across a snapshot; the notice store; **no React**; the requirements display mapping (`requirements/display.ts`, pure, `now` supplied — REQ-TRACE-380, Part AK) | ADR-0043, ADR-0046, ADR-0049, ADR-0057, REQ-SESSION-161 |
| `@rotaris/ui` | renderer | `AppShell` (with the one persistent notice), `NavRail`, `WorkspaceView` (user/agent/system rows, the growing row, the composer, the stop control), `SettingsView` (the thirteen categories; Project hosts backup and restore), local shell state, the design system wired in; **`terminal/`** (Part AM, ADR-0047 B): the emulator port with two adapters over one parser (`@xterm/headless` for the preview and tests, `@xterm/xterm` opened once per stream for the grid), the per-renderer stream set, the five-rule key priority, the wheel with the carried remainder, the selection extraction, the audit buffer, the geometry guard, the window (tabs, tick, four banners, kill dialog, empty state), the grid and the transcript preview block; **`slash/`** (Part AN): the composer's slash catalogue — parser, registry, built-ins plus the palette mirror, highlighting, popup; `RunHeader.tsx` extracted from `WorkspaceView`; **`requirements/graph.ts` and `GraphPane.tsx`** — the relationship graph as a presentation centred on ONE requirement (Part R″, REQ-TRACE-322..333) — and **`panes-host.ts`**, the pure half of hosting Part AP’s five panes | ADR-0048, ADR-0049, REQ-SHELL-024–028, -049, -114, -153, REQ-CHAT-001–005, -011, REQ-SESSION-186, -201, REQ-CONFIG-268/269 |
| `tools/symbol-artifact` | build + test | generates `kernel/src/generated/requirements.ts` from `docs/spec` | ADR-0040 #4, ADR-0056 |
| `tools/release-naming` | build | the four artifact names, the one authority; the release-tag grammar and its channel (`parseReleaseTag`) | REQ-STARTUP-031, REQ-STARTUP-027/029 |
| `tools/release-guard` | release pipeline | `pnpm release:guard <tag>`, the pre-build guard. It checks the tag's version against the one declared place (`apps/desktop/package.json`), and the setup manifest's pins against the default configuration's `npx`/`uvx` launches (the manifest exists since 2026-09-28 at `apps/desktop/resources/setup-manifest.json`, its shape `@rotaris/config`'s `SetupManifestSchema`; the guard passes `v0.1.0`; `pins.test.ts` holds the schema's platform keys equal to `release-naming`'s, REQ-STARTUP-060). Exit 0/1/2; `cli.mjs` boots the TypeScript through Vite's module runner | REQ-STARTUP-028/158/059/149, ADR-0054 |
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
- **A relative link in the record reaches what it names** — `tools/check-record-links.mjs` (in `pnpm lint`, beside
  `check-request-log.mjs` and `check-directive-register.mjs`) fails on a Markdown link under `docs/`, in
  `CONTEXT-MAP.md`, `AGENTS.md`, `CLAUDE.md` or a `packages/**/CONTEXT.md` whose target file does not exist or
  whose `#fragment` names no heading or anchor in it; fenced and inline code and HTML comments are text, not links.
  A defect note moved to `docs/defects/fixed/` takes every link to it along in the same commit, or the gate says
  which one stayed behind (since 2026-09-28, R-062).
- **A design-equivalent control is written once** — `tools/check-ui-language.mjs` (in `pnpm lint`, beside
  `check-theme-colours.mjs`) fails on a raw `button`, `input`, `textarea`, `select` or `table` anywhere under
  `packages/ui/src` or `apps/desktop/src/renderer` except `design-system/` itself, which is where they live.
  Literal spacing, type, radius and motion values are held at a **committed baseline that only shrinks**: a new
  one fails, and a paid-off one fails too until the baseline is lowered (`--write-baseline`), so an allowance
  freed in one file cannot be re-spent in another. A textarea, a file input, a canvas, an SVG and the terminal
  grid keep their own markup and consume the shared classes and tokens.
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

`apps/desktop/scripts/package.mjs`: the code-intelligence bundle and its manifest check; then **the About page's two
files** — `pnpm notices` (REQ-STARTUP-143's validation, before freezing; its refusal refuses the package) and
`pnpm build-id` (REQ-SHELL-140), both writing into `apps/desktop/resources/` (first-release-plan.md §4.4); then
`electron-vite build` **with `ROTARIS_BUILD=package`, which compiles the
verification seams out** (`__ROTARIS_SEAMS__`; the driver and every scriptable capture seam leave the bundle, the
probe's three below stay), then **the seam check** — the built bundle read back and asserted to carry those three and
none of the scriptable ones, an assertion about the artifact for rule 1a's reason and deliberately not numbered into
N3's five; then `electron-builder --win` with two hooks
(`scripts/build-hooks.cjs`) — `beforeBuild` removes every copy's `build/`, stamps the rebuild marker and runs
@electron/rebuild by name over the binding set, cold, from source; `afterPack` holds rule 1a (a compiled
binary newer than the marker, byte-identical in `app.asar.unpacked`, no prebuild in the asar index), the
`REQ-STARTUP-031` name, the "runtime" rule (the bundled interpreter answers its pins from inside the artifact), the
"assets" rule (both files at the root of the artifact's resources as their steps wrote them, the identifier naming the
tree being packed, the tool server's licence text once — `scripts/lib/about-assets.mjs`) and rule 4
(`scripts/native-load-probe.cjs` as the packaged `Rotaris.exe` under `ELECTRON_RUN_AS_NODE`, reporting what
`dlopen` opened); then the packaged application runs a scripted session with a
terminal call against a scratch store under `release/scratch/`. Evidence in `release/load-proof.json`.
`ROTARIS_IC6_COUNTERFACTUAL=no-force|keep-prebuild` constructs D10's condition; the build must refuse, and a run
that ends before `electron-builder` says the counterfactual was not exercised. `ROTARIS_PACKAGE_DIR_ONLY=1` stops at
`win-unpacked`; `ROTARIS_PACKAGE_SKIP_APP=1` skips the launch; `ROTARIS_PACKAGE_WITHOUT_NOTICES=1` goes on past a
refusing `pnpm notices` to a development package without the notices file (first-release-plan.md §4.4; refused on a
tag build). A cold rebuild of both bindings is ~3 minutes on every run, by design. Windows only (IC-3). The app's `dependencies`
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
   tick, `usage.update` is recorded once per completed provider request that moved the cumulative totals (OQ-8: the usage a retried failure reported is counted, identical totals raise nothing), `iteration.end` is recorded, the stop conditions are evaluated between
   iterations, and teardown records the system row, records `session.end` then
   `result` and the terminal status in one durable transaction **while still holding the lock** (A3, REQ-EVENTS-098),
   releases it in guaranteed cleanup after the sink is detached, then rebuilds `summary.md` off the path.
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
   fallback; per-model `timeout` and `num_retries` (the dispatch layer's retries, which come before the ladder's — ruled
2026-09-29, OQ-110). The record's `wait` and the Workspace header that counts down and
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
   the state read, `interrupted` saved durably, the `session.interrupted_recovered` entry (REQ-SESSION-062's fixed type, severity, message and metadata keys — corrected under OQ-46) written under the lock, the lock
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
   disabled window can still be raised to the foreground. That host-input half runs on Windows only. Since 2026-09-28
   the proof states it not applicable elsewhere and asserts the application's own reading there
   ([note](../defects/fixed/palette-proof-reads-the-win32-host-input-on-every-platform.md)). **Found — one defect:** binding Ctrl+L and Ctrl+Return through
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
   through the first configured model slot over a three-rung ladder bounded at 12.0 s (8.0 s until ESC-35) — every failure the fallback
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
renderer errors, then writes its result table under `.proof/theme-proof/`. Two counterfactual commands lower text or
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
and no lock left behind). Its evidence lands under `.proof/part-h-proof/`.

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
and `ROTARIS_CAPTURE_WAIT_MS` are verification seams; a third `>>key` segment on the fill seam fills the key field and presses the dialog's own button, which is how `pnpm live-run` signs in unattended (`AGENTS.md`); `ROTARIS_CAPTURE_PROVIDER_EMPTY_OK` takes the
zero-model alert's own "Continue anyway", so an endpoint whose `/models` answers with nothing does not strand a run
that no one is watching.

**What `pnpm slice-proof` does.** It builds Electron and carries ONE scratch profile across five launches, because
the credential the owner pastes in the first must be the one the third leases: (1) first launch — the notice, Settings
→ Models → Add endpoint with the label and URL filled, the owner pastes the OpenRouter key (never read from the
environment, never logged), then the credential file's five keys and exact protection, the snapshot's record and
picks, the bootstrapped `agents.yaml`, and a log free of the key are asserted; (2) the three tier slots set to
`anthropic/claude-haiku-4.5` and saved; (3) one real run — the lease, the request to OpenRouter, a settled tool row,
usage figures and the terminal result from the store; (4) spike 6's live harness against the same endpoint with the
stored credential; (3b, Part L) three more real runs, one prompt per intent family, each asserted to classify from the small
slot and never fall back, the answering rung recorded; (5) sign-out from the card — the file gone, the snapshot kept, a prompt refused. `--resume` keeps
the profile and skips the paste; `--skip-build` skips the build. Evidence lands under `.proof/slice-proof/`. `--from=<scenario>` replays the
earlier scenarios from their evidence. On 2026-09-05 every scenario passed on the owner's re-run with an OpenRouter
key (`.proof/slice-proof/results.json`), after two runs that each found a defect.

**What `pnpm live-run` does.** It is the only check here that answers to a real model rather than a scripted one,
and the only one that spends money, so it never runs on its own: `pnpm check` does not reach it and without
`--confirm` it prints its plan and exits. The workspace is a COPY of `apps/desktop/scripts/fixtures/todo-app` in
the system temp directory — a React todo application with its requirements and a `node --test` suite needing
nothing installed — committed to a fresh Git repository so the change can be read back from `git diff`. Its store is
the conventional shape of REQ-TRACE-002 and its identifiers are REQ-TRACE-022 identifiers, so the requirements BOARD
reads it as readily as the agent does; `REQ-103` and `REQ-104` are approved and unimplemented there on purpose, one
for each path. Five scenarios over one scratch profile: (1) sign-in through the
product's own dialog, filled and pressed by the third `>>key` segment of the fill seam — the credential file, the
snapshot record, the discovered catalogue and logs free of the key; (2) one real run that reads and answers — the
lease, the request, a completed session, settled tool rows, usage; (3) one real run that implements the requirement
and runs the suite in the terminal — asserted from the files, from `git diff` and by the script running `node --test`
ITSELF, because the agent's own report is never the evidence; (4) the requirements BOARD, where nothing is typed —
`REQ-104` selected, the move control pressed, the release confirmed, and the run that follows watched from `backlog`
through `running` to `review`, its decision taken and the card left resting in `done`, asserted from the board, from
the delivery store's own rows, from the worktree the run was confined to and by running `node --test` inside it;
(5) a relaunch with no prompt — Overview painted from
the store. The endpoint is the owner's: `--add-endpoint` registers a name, the label the product will show, the base
URL, the model and optional prices in `~/.rotaris/live-run/endpoints.json`, with the key beside it, one file per
endpoint, DPAPI-encrypted on Windows (PowerShell 7 probed first, since 5.1 cannot always load the cmdlets; an
owner-only ACL where no host can, said aloud) and mode 600 elsewhere — never on a command line, never in the repository;
every log is substituted and then asserted to hold no bearer. Two bounds on the cost always hold — the model the
owner chose and `runtime.max_iterations` written into the sandbox — and the third is whatever the endpoint allows,
named in the output rather than inferred: none at all for an endpoint registered `--unmetered` (the owner's own
hardware — tokens counted and reported, nothing stopping on them, unless the invocation names a ceiling itself),
else the provider's own figure where it answers `GET /key` (OpenRouter), else the registered prices over the
store's token counts, else tokens alone against `--max-tokens`. `--context=<tokens>` covers an endpoint whose
`/models` declares its window in a key discovery does not read (vLLM's `max_model_len`): it becomes
`max_input_tokens` on the written entry. An endpoint that
discovers no catalogue is not a dead end: the sign-in takes the dialog's own "Continue anyway" and the script writes
the `models:` entry the run needs (REQ-CONFIG-082..097, the shape `snapshotLayer` would have produced). Evidence
under `.live-run/runs/<stamp>/`, one directory per scenario, packs accumulating to `--keep-runs` (default 10);
`AGENTS.md` is its standing instruction. **The pack became the run-autopsy skill's input on 2026-09-22, and was
not before it**: the skill asks for a launch log, the session store and a session id, and this script produced
all three and deleted two of them with the sandbox — so each scenario now leaves `autopsy.txt`, the product's own
`session.log`, the full `transcript.md` and a filtered copy of the launch log beside the verbatim one, and the
store is copied out before the sandbox goes. Until then every defect that skill found came from a session driven
by hand, and the live run had found exactly one defect in its life, which was its own.

**What the model was sent, and what came back, is recorded by a loopback proxy** the sandbox's `base_url` points
at (`apps/desktop/scripts/lib/model-traffic.mjs`, `--no-record-traffic` to bypass). The product emits one line
per call — `run-host/host.ts`'s `onRequest`: a method, a URL, and whether an authorization header was set — and
no body, status or duration anywhere; the only body that survives a real call is 500 characters of a failed
response kept on a `ModelError`. So the proxy adds a record the product cannot, without changing the product:
it is a raw pipe, forwarding chunks as they arrive, because a buffering proxy would remove the streaming the run
loop is built on and leave every assertion green — the harness measuring a product that exists only while it is
measured, which is the shape of the two false-symptom repairs above. `model-traffic.test.ts` pins that property
with a case that hangs if the pipe ever buffers, verified by making it buffer. Credentials are replaced in the
record before it is written and the `ask` scenario asserts it.

**The proxy's own first execution found that it could not answer a single call, and the reason is kept beside
its replacement.** The script launched every scenario with `spawnSync`, which blocks the Node event loop until
the child exits; a listener on a blocked loop accepts nothing, so the connection sat in the kernel's backlog and
was served only after the scenario that made it was over. A probe measured it rather than reasoned about it — a
child `fetch`ing a counting server while the parent sat in `spawnSync` reported `NO ANSWER after 6012 ms` and the
server had served **0** requests. Nine unit tests were green throughout, every one of them exercising the proxy
from a loop that was free: the same shape as 2026-09-12's finding that a proof which cannot fail is a finding.
`runElectron` now spawns asynchronously and resolves on `close`, keeping the SIGKILL-on-timeout behaviour its
callers read; the regression guard asserts **both legs**, that the `spawnSync` child is not served and the
`spawn` child is, because without the first the second could pass for an unrelated reason
(`docs/defects/fixed/the-recording-proxy-could-not-answer-while-spawnsync-blocked.md`).

**A proxy in the path can also misbehave on purpose, which is the `faults` scenario.** A rule names a kind
(`status`, `cut`, `stall`, `malformed`), the path it watches and the **1-based index** of the call it fires at,
and fires once — the index is the point, because "the second completion" is a reproduction and "some completion"
is a coincidence. `faults-ladder` answers 429 then 500 without contacting the endpoint (so the injected calls
spend nothing) and asks whether the ladder waits, falls back and still finishes; `faults-stall` stops the bytes
mid-answer with the socket open and asks the **eighty-second defect's** question, which is whether a model
timeout is still collapsed into the flag a user's stop sets and reported as `user_cancelled`. This makes the
first of the two frictions the `frictions` scenario records as uncoverable inducible on demand. **Neither
product check has yet run against a real endpoint**: the mechanism is unit-tested against a loopback upstream,
what the checks claim about the product is unverified, and that first execution owes its row in
`first-executions.md`. *Both ran live on 2026-09-22 (the row is there). The ladder half is corrected 2026-09-29 (R-067, OQ-110): the
429 and the 500 are retried by the model client's dispatch layer (REQ-CONFIG-086's `num_retries`, default 5) before the
ladder sees them, which the owner ruled is the specification's order; the scenario shows the run surviving the refusals,
not the ladder waiting or falling back.*

**Two scenarios enter the gap this page names below** — "short tasks against an unmetered endpoint, so no
generation near the model timeout, no multi-line command, and no re-spawn", where all seven of one session's
defects lived. `terminal` issues **six commands the record names verbatim**: the multi-line here-string that lost
its newlines in the PTY, forty long lines for the concatenation the sixty runs missed and the VT strip the
agent's capture was left out of, a wedge supplying no `timeout` for the `hardMs` that was read nowhere, an exit-0
output carrying `FAILED`, a `git diff` exiting 1 for ESC-41's carve-out, and a read-only pipeline through a pipe.
The shapes, their patterns and the two readers live in `apps/desktop/scripts/lib/terminal-shapes.mjs` and are
pinned by `terminal-shapes.test.ts` **because that is the part of the scenario that can be wrong silently**: a
pattern that stopped matching its own command would turn every check in it into "the model never attempted it",
which is a NOTE, a green run, and a question nobody is told has stopped being asked. The test pins the round
trip in both directions — every shape matches its own command, no shape matches another's — measured by
breaking one pattern and confirming the red, then restoring it. Writing it found one defect in the reader as
first drafted: `diagnosticOf` took the FIRST `[terminal_diagnostic]` block, and an observation whose output
quotes an earlier one would have had a previous call's exit code read as its own; it takes the last now.
It reads `tool_calls` — `args.command` and the `[terminal_diagnostic]` block — never the model's prose, and the
shapes whose behaviour is faithful to a requirement (`REQ-TOOLS-113`'s marker, `REQ-TOOLS-036/038`'s deny) are
**NOTEs measuring their cost** rather than checks accusing the product; so is a shape the model never issued.
That split is deliberate: a scenario that reports a faithful behaviour as a fault teaches its reader to ignore
it, which is what the board scenario did twice. `duress` is the length, **opt-in under `--only=duress`** because
a thirty-minute scenario inside a smoke test is a smoke test nobody runs; it asserts **coherence rather than
correctness** — the autopsy's own two booleans, a failed child with an empty `final_response` (the eighty-second
defect's shape at the child level), a child that ran commands and reported none (the eighty-eighth), and the
`compressions` aggregate against the `context_compressed` timeline entries (the eighty-seventh) — and it
**reports whether it was long at all**, including when it stopped at `--max-iterations` and was bounded by the
harness rather than by the work. `--duress-fixture` replaces the workspace for the whole run and is refused
alongside any other scenario, because one sandbox holds one store and every other prompt names `todo-app`'s
files.

**`failed-word` stopped being a NOTE on 2026-09-27 (`PD-TOOLS-003`), and the paragraph above is kept as it was
written.** The shape printed `FAILED` in capitals, and its warning was faithful to `REQ-TOOLS-113`'s marker. The
directive matches that marker in capitals only, which put the shape on the other side of the rule from the
record it claimed to replay. It now prints the record's own lower-case docker line,
`failed to connect to the docker API`, and the scenario checks that the line reached the output at exit 0, was not
`suspicious_success` and carried no failure-marker warning — a regression guard, as `diff-exit-1` is for ESC-41.
That positive half reads the output through a new `outputOf`, because the diagnostic block repeats the command
and a pattern taken from the command matches the whole result whether or not anything was printed. The deny is
the one faithful behaviour still measured as a NOTE. **The guard has not run against a real endpoint**; the next
live run of `terminal` is its first.

**The five decisions this scenario was held on were taken on 2026-09-22**, four by the owner and one delegated:
the endpoint is the unmetered `katalyst`, the wall clock is **40 minutes**, it stays **opt-in**, its assertions
stay coherence-shaped, and **`--max-iterations` rises from 15 to 500**. That last one is a bound being loosened
and is recorded as such. Fifteen was a bound while every scenario here was a short task; the long run turned it
into the thing being measured — a delegating run reaches 15 while it is still commissioning and then reports its
own ceiling as a result about the product. The accounting gate between scenarios still holds and so do
`--budget` and `--max-tokens`; what no longer holds is a tight bound **within** one run, which is why the raise
is safe on the unmetered endpoint it was made for and worth naming explicitly on one that charges. The fixture
was the delegated decision and the ruling was **not** to add a larger tree: a five-file repository and a
five-hundred-file one delegate exactly as much as the prompt commissions, and a second fixture is a second tree
to keep in step with five other scenarios' prompts. The length comes from **three dependent waves** instead —
three children, two reconciling what they produced, one verifying all of it — under which the parent's
conversation grows monotonically, which is what reaches compression and re-spawn. A single wave of parallel
children finishes in minutes and measures the short path under a longer deadline.

**`faults` and `terminal` were first executed on 2026-09-22 and the product answered every question they were
built to ask** — the row is in `first-executions.md`. The stall was noticed by the idle bound at **120.5 s**,
classified `transient_llm_error` and retried, which is the **first live evidence that the eighty-second
defect's repair holds**; `git diff` exiting 1 read as `outcome success`, which is **ESC-41's carve-out proven
live** on the same machine whose unit test for it is red for an unrelated timeout. What was wrong was the
harness, twice. The stalled call's record was written only on release and the product recovered first, so the
one call the scenario exists for was the one call missing from the pack
(`docs/defects/fixed/the-stalled-call-was-the-one-call-missing-from-the-pack.md`). And
`stop_reason !== 'user_cancelled'` passes just as well on a run that met no fault at all, so it now carries a
positive half read from the product's own `issues` table — the stall must be shown to have been noticed, and
what it was classified as must not be fatal. Two smaller ones: the wedge **soft-paused before the hard cap**,
so `hardMs`'s own question is still unmeasured live and now says so; and `duress`'s `zero cost with tokens`
check would have reported a fault on an unmetered endpoint that has no cost to record, so it is conditioned on
the accounting kind — caught before the forty-minute scenario was run rather than after. ~~`duress` has not been
executed; it owes its row.~~ *`duress` was executed on 2026-09-29 and has its row in `first-executions.md`.*

**What the board's live path found on its first execution — 2026-09-11, and the eighty-first defect.** The fifth
scenario was written after a hand-driven precursor took the same path, and the precursor is what found the defect;
the scenario passed 21 checks at once and found nothing of its own. **The eighty-first: a requirement store whose
every document the engine REJECTED read exactly like a store nobody had written to.** `RequirementsView` decided its
body state from the card count alone, so a configured source with no cards printed `EMPTY_STORE_SENTENCE` — "holds no
requirement documents yet" — and named nothing, while `BoardProjection.parseErrors` had carried the engine's own
errors the whole time and the no-source branch two lines above was already rendering them. The fix is `bodyStateOf`
in the board's pure model (REQ-TRACE-380), a fourth stated state for a store that will not parse, and — the same
defect in its quieter form — a stated count and error list when the store parses only in PART, since REQ-TRACE-026
drops each rejected document silently and a board missing a requirement looks exactly like a board that has them all.
**Why it hid is the finding, and it is the fixture's fault rather than the board's:** `fixtures/todo-app` shipped
`req-id: REQ-TODO-001..003`, which REQ-TRACE-022 does not admit as identifiers at all, and no check ever noticed
because the live run reads those documents only as **prose** for the agent — the one surface that parses them is the
board, and until this scenario existed the board had never been pointed at that workspace. The store is renumbered to
an epic and four children; `AGENTS.md`'s fixture section now states both constraints as load-bearing.
**`REQ-TRACE-515` was minted for this on 2026-09-11**, because the board's obligation here was inferred from a field
the projection already carried and was stated nowhere — which is exactly why the build satisfied it in the no-source
branch and not in the other; the round is recorded in `docs/spec/resolutions/08-requirements-traceability.md`. **The tally
stands at eighty-one.** The precursor also produced two *harness* mistakes worth keeping separate from it: it read
transcript tool rows as `kind = 'tool_call'` where they are `kind = 'tool'`, and it asserted an elevation disclosure
in a sandbox that opts in to unattended work, where REQ-TRACE-474 requires there to be none.

**A third harness mistake in the same scenario, found 2026-09-13 and repaired the same day: it pressed the review
decision on a clock.** The four presses after the release fired at offsets measured from the end of
`LIVE_RUN_BOARD_MS`, whatever the board happened to be showing by then. Against `qwen3.8-flash-next` — the model the
endpoint now serves, and the one `--no-discover-model` no longer hides — 240 s expired with the board-started run
about half-way through, and **one timing failure became three**, two of which accused the product of faults it had
not committed: "the card rests in running", "the history lacks the accept". Both were true statements about a card
that accept had been pressed at while it was still running, which the board had correctly declined to move. Re-running
the one scenario at 900 s with nothing else changed passed every check, which is how the harness was shown to be the
wrong one — `AGENTS.md`'s standing rule is to believe the harness first, and that rule is what makes a harness that
manufactures false product symptoms expensive rather than merely annoying.

The repair is the one the scenario's own comment now carries: **nothing it presses is pressed on a clock.** The
`selector@~ms` deadline that clicks already had was extended to `ROTARIS_CAPTURE_KEYS` (`Return>>selector@~ms`,
because Enter opens the *focused* card under REQ-TRACE-484 and means nothing before the click has landed) and to
`ROTARIS_CAPTURE_EVAL_AT` (`expression>>selector@~ms`, because a read of what something left behind has a
precondition, while a read that watches a value *change* wants the appointment and keeps the plain form). A third
form, `ROTARIS_CAPTURE_WAIT=js:<expression>`, ends the capture when the accept lands rather than at the far end of
the window — so the deadline became a bound that a quick model does not pay, where the old shape always cost
`window + 17 s`. An expiry is now **one** failure, and the presses never made are noted with what each wait did
rather than reported as evidence about the board. The note is
a defect note (removed once repaired); it stays, with its repair recorded in it.

**The first repair was itself wrong, and the live run caught it before it landed** — kept beside its replacement
because it sharpens the finding. Enter was gated on `[data-req-card="REQ-104"]:focus`, which matched **63 ms into
the run**, because the opening click focuses the card: Enter opened the detail at 3 s, the Review control appeared,
and the press waiting for that control opened a review pane over a card that had not been released. The board work
itself was sound in that run — the card reached `review` in 520 s, `completedCount` was exported, the worktree's
suite was green — and the scenario still failed. **A state-driven press aimed at a state that is also true before
the thing it waits for is no better than a clock, and is harder to see**, because the clock at least fails visibly.
The gate became `[data-req-card="REQ-104"][data-column="review"]:focus`, which cannot hold before the release.

**A measured negative, kept so it is not re-attempted: turning `code_intelligence` OFF makes the board scenario
slower, not faster.** The scenario costs six to thirteen minutes against this endpoint, nearly all of it the model's
own loop, and the spread between two runs of identical code had looked like the symbol server's doing — seven tool
names and 153 k input tokens in six minutes where the agent stayed off it, seventeen and 291 k in 12.9 minutes where
it did not, including three `*_memory` calls over a workspace deleted at the end. A `--lean` flag disabling the one
shipped-enabled server (REQ-MCP-010) was built to test that reading and **falsified it on the first run**: without
the symbol server the agent brute-forces the same task with `read_file` 44 times, `terminal` 41 and `grep` 37 —
**144 tool calls and no review at all** inside the 900 s deadline, against 7 to 17 calls when it has the server. The
flag was discarded rather than merged. Removing a capability does not remove the work; it moves it into more, cheaper
round trips, and round trips are what the wall clock measures. Harness iteration belongs in
`pnpm requirements-runs-proof`, which drives the real delivery service, traceability engine, store and Git helper
with only the run host scripted and no model at all.

That failing run is also the repair above proving itself under the exact condition that produced the defect: **one**
failure for the expiry — "the window expired with the card where the trail leaves it" — and a `NOTE` reading "the
review was never offered, so the accept was not pressed — review control: expired; decision: expired; confirmation:
expired". No accusation against the board, where the old shape would have manufactured two.

**What an owner's own run found — 2026-09-12, and the seven defects eighty-two to eighty-eight.** Not a harness
and not a scenario: a 22-minute run in a scratch workspace, twelve children, 226 tool calls, 686k tokens, stopped
by hand because it was going in circles. It commissioned the same architecture design three times and produced
seven markdown files and no code. Reading the session store afterwards found seven defects, and the reason it
found them where 26 green live-run checks had not is worth stating plainly: `pnpm live-run` runs short tasks
against an unmetered endpoint, so it holds **no generation near the model timeout, no multi-line command, and no
re-spawn**. Every one of the seven lived in exactly that gap.

**The eighty-second, and the one that explains the circling: a model timeout reported itself as a user abort.**
`AbortSignal.any([req.signal, timeoutSignal])` merged the two, and both failure paths collapsed them into
`fromError`'s single `aborted` flag, which returns `code: 'aborted'` unconditionally. `classifyFailure` reads
that as *the run is stopping* and returns `fatal` — no retry, no wait, no same-tier fallback, and the streamed
text discarded. Four of eleven children died that way with an empty `final_response`, each **125.2, 125.5 and
125.6 s** after its last tool call: `model_timeout` at 120 s plus report assembly. Two things were wrong, not
one. The class is now decided by **which** signal fired, and the bound is an **idle** bound re-armed on every
part, because REQ-CONFIG-115 fixes "the model HTTP timeout" and applying it to total stream duration means no
answer longer than two minutes can ever complete. ADR-0027's fourth execution has it. **A reading falsified in
the brief this was built from, kept here:** the `catch` path was described as already correct because it read
`req.signal.aborted || timeoutSignal.aborted`; that expression is precisely the collapse, and the thrown path
was as wrong as the streamed one.

**Eighty-three to eighty-six, all in the terminal, all in ADR-0020's note.** `hardMs` was passed by `index.ts`
and read nowhere in the repository, so a foreground call that supplied no `timeout` had the soft pause and **no
hard cap at all** — REQ-TOOLS-097 requires both bounds with the first to fire governing. An `as` cast on the
same line is what stripped the excess-property check `tsc` would have failed on. Two commands sat wedged for
68 s and 49 s and were killed by hand while the diagnostic reported `timeout_seconds: 100`. A multi-line command
lost its newlines in the PTY, so a here-string never terminated; carrying it needs the payload sent whole, and
**the approved shape was falsified twice by measurement** — `&` runs it in a child scope, and neither `&` nor
dot-sourcing propagates `$?`, so the marker protocol gained a nonce-named `$global:<end>_ok` and consequence 1's
forgery argument is unchanged. The capture was VT-stripped where ADR-0020's own words had said the ADR-0021
emulator would land with streaming; it landed for the live stream in Part AL and the agent's capture was left
behind, so the terminal window and the agent read different renderings of the same bytes. And the end marker
leaked into what the model read — `Property : __rot_…_e:0`, verbatim — because detection matched it **unanchored**
while removal matched it **anchored**, the sibling of the seventh first-execution defect on the removal side.

**The strongest finding of the day is not any of the seven; it is how the fourth was nearly mis-attributed.**
Sixty real-PTY runs at four geometries could not reproduce the concatenation the run showed, and the conclusion
drawn was that the evidence belonged to the newline fold instead. The store falsifies that without a shell:
ordinals 193 and 200 are **503 and 385 characters on one line**, so the fold cannot reach them. The trigger the
sixty missed is narrow — an **empty write between two non-empty ones** — present in both production commands and
in none of the sixty. Reproduced against the unfixed strip it returns the production strings byte for byte.
**Sixty negative runs are not a negative result when none of them carries the input that failed**, and the
reproduction was owed to the recorded command rather than to a plausible family resembling it.

**Eighty-seven and eighty-eight, the record describing a run that did not happen.** The session `compressions`
aggregate was declared, rehydrated and copied into every save, and nothing ever added to it — three
`context_compressed` entries against a persisted `0`, while REQ-MONITOR-086's per-agent counter said three
(REQ-SESSION-139, ADR-0008). And the child report hardcoded `commands: []` at all three construction sites and
took `edited_files` from whatever the summarising model wrote: the child that wrote five files and ran eight
commands reported neither, another reported a prose sentence where the schema asks for paths. Both are now
derived from the transcript the report is built from. **The bound on that, stated rather than hidden:** a
compression replaces the conversation (REQ-MONITOR-084), so a child compressed mid-task no longer carries its
earliest calls, and the derived lists are of what survives. **And nothing yet reads `report.commands`** — the
field is correct and no surface shows it.

**Why the tests did not catch four of the seven, which is one shape repeated.** A test asserted the mechanism in
the single configuration where it worked. REQ-TOOLS-097's hard timeout had a passing test that supplied an
explicit `timeout` — the path where the timer *is* armed — while the no-timeout test asserted only the soft
pause, so the requirement's actual claim, *whichever bound is reached first*, was never tested. `Aggregates`
rehydrated `compressions: 0` and asserted `0` came back, an assertion that could only ever see zero. `report.ts`
had no test file at all. And `ai-sdk-client.test.ts` aborted only the caller's signal. **A further trap, recorded
because it would have produced a green suite over a broken build:** `FakeClock` cannot be used for the timeout
tests, since `AbortSignal.timeout` reads the platform clock and a controlled clock makes both new tests pass
against the unfixed code. They read real time under a 300 ms bound. **The tally stands at eighty-eight.**

**Verified on merged main** (`76e3667`): the symbol generator unchanged at 4,399 identifiers, `tsc --noEmit`
green, `eslint` and `check-line-endings` green, the suite at **1,532 passed and 25 skipped** with one red —
`mcp.test.ts`'s stderr capture, which passes alone and whose own fixed 400 ms wait for a spawned child is the
same class of defect as the three terminal time-guesses this work hardened. The baseline before the merges
failed **four** under the same load; three of them were those terminal tests and are now stable. Each of the
seven fixes was checked by reverting its source against its new test and reading the red, rather than by
trusting the report that it had been.

**That last red, closed the same way, and this time the failure itself was reproduced (2026-09-12).**
`mcp.test.ts`'s stderr capture started a second Node process, slept a fixed **400 ms**, and then read the log. The
arrival was measured rather than guessed: **61, 68 and 93 ms** with that file alone, **239 ms** under the full suite —
**161 ms of margin**, the same knife edge the resilience probes sat on — and **446 and 472 ms** under the suite with
eight cores deliberately busy, which is past the bound. Under sixteen busy cores the unfixed test fails verbatim as the
sweep saw it, `AssertionError: expected undefined to be defined`, and the deadline form passes on the same machine in
the same minute with the line arriving at 446 ms. A module-level `until(hit, boundMs = 10_000)` now polls every 25 ms
and returns the milliseconds waited, or `null` at the bound, so the assertion that follows fails for its own reason and
says how long it gave. `pnpm check` is green with **nothing red**, which it had not been. **What the sweep found
beside it:** with eight cores busy, `checkpoints.test.ts` blew vitest's own 30 s `testTimeout` doing real Git work —
a load artifact of that measurement, not an appointment, and it did not recur unloaded. Two fixed sleeps of the same
shape remain and are named here rather than changed under this commit: `terminal.test.ts:230` (3,500 ms) and
`streams.test.ts:392` (2,300 ms), both waiting on a real PTY; `streams.test.ts` already carries the `until` helper
they want, at its line 313 (both lines as of 2026-09-28, R-062).

**What `pnpm overview-proof` does.** It builds Electron and carries one scratch profile across four launches against
a scratch Git repository it creates (one commit, one untracked file): (1) a fresh launch — Overview is the first view
painted, the onboarding empty state, the repository read logged with its time; (1b) the same with `PATH` emptied of
Git — the reads end in the empty state and no dialog; (2) a scripted run whose first model call waits 21 s
(`wait:<ms>`, three sample periods), delegates one child and reads a file, driven from the Workspace view with the
Overview read afterwards through `ROTARIS_CAPTURE_END_VIEW` and `ROTARIS_CAPTURE_PROBE` — the header, the tokens card
against the store, the sparkline's sample count, the cost qualifier, the tool chips against `tool_calls`, the agents
caption against the ledger and the configured caps, the branch, the session row with its duration and focused
marker; (3) a relaunch — the samples identical and a pane split written to the preference store restored. Evidence
under `.proof/overview-proof/`. On 2026-09-05 it passed once the start-time read was corrected (entry 19).

**What `pnpm fetch-proof` does.** It builds Electron, starts a `node:http` server on 127.0.0.1 that records every
request path, and launches the app seven times against a scratch workspace whose `agents.yaml` it rewrites between
launches, each run scripted `fetch:<url>,answer`: `/ok` under `autonomous`; the same under `ask` with zero approval
requests; `/redirect` (302 to `localhost`, a different host name) refused, then followed once `localhost` is
allow-listed; `127.0.0.1` denied so the server sees nothing; `/404` as `http_error` with the body; `/slow` under a
one-second `tool_call_timeout`. The tool row's observation is read from `tool_calls`; the per-call policy read's cost
from the run host's log. Evidence under `.proof/fetch-proof/`.

**What `pnpm git-proof` does.** It builds Electron, makes a scratch repository with a local bare remote (one commit
ahead, so a local-tinted row and `ahead 1` exist) and a `.gitignore` holding `.rotaris/`, and launches the app seven
times: the Git view painted (header, the one worktree row with its markers, three history rows, the checkpoints
card's sentence, the strip, the divider moved by keyboard and written to `panels/git`); a worktree created through
the dialog beside the workspace; an isolated session started through the launch dialog whose scripted `write_file`
lands in `.rotaris/worktrees/<sid>` and not in the base; the manual worktree deleted through the two-step confirm
against Git's real refusal; a relaunch restoring the split; `PATH` without Git (the empty header, the notice, no
dialog); a plain folder in the OS temp directory (no notice). Evidence under `.proof/git-proof/`.

**What `pnpm checkpoint-proof` does.** It builds Electron and launches the app twelve times against a scratch repository:
two scripted iterations capture checkpoints 1 and 2 (the refs, the fixed identity, the message, HEAD and the index bytes
unchanged, the card's rows); a read-only run records nothing; a hand edit then a restore of checkpoint 1 through the
preview-first dialog (the warning, the checkbox, the safety checkpoint holding the edit, `last_restored_sequence`, the
notice); a session with no rows, a ref deleted from outside, a live run's refusal, a stale session repaired on opening; a
retention of two trimming rows and refs together; an isolated run whose checkpoints land in the shared repository and
whose restore touches the worktree only; `enabled: false`. Figures — invocations and times per capture, preview and
restore — land in `.proof/checkpoint-proof/results.json`. The Git proof's isolated launch now asserts one checkpoint row where it asserted the card's
empty sentence: an isolated run records a checkpoint by REQ-GIT-044's default, which the merge found by failing that launch.

**What `pnpm resilience-proof` does.** It builds Electron and launches the app nine times with scripted fault steps: a 429
with `retry-after: 2` (the countdown, the auto-resume); a 429 with no header (the 60 s local wait, cancelled from the
header with REQ-NOTIFY-063's notice); a quota with a same-tier candidate (the transparent fallback); a quota with none
(the indefinite wait, `setModel` from the header, the override honoured after a relaunch); an unresponsive model with
and without a role fallback; a hung child under a small `child_timeout` with and without a fallback; a 503 (one
transient retry) and a 401 (no retry). Evidence under `.proof/resilience-proof/`. **Since 2026-09-28 (R-062)** the override
launch is driven (the header's `SearchableSelect` chosen by real clicks, `override.steps.json`), every launch is
bounded — the ten seam-driven ones by `spawnBounded`, the driven one by the driver's `stopApp`, both ending an overrun
through `lib/bounded-launch.mjs` by SIGTERM, a grace, then SIGKILL and reporting it with its log tail — and every
scenario runs to its end with its failure listed in `results.json`
([note](../defects/fixed/resilience-proofs-override-launch-selects-a-native-select-the-wait-header-no-longer-draws.md)).
`spawnSync`'s own timeout could not bound a launch: it closes the pipes as it signals, and the application's quit then
loops on its own EPIPE ([note](../defects/a-quit-with-its-standard-output-closed-loops-on-its-own-epipe.md), open).

**A probe is a deadline, not an appointment (2026-09-12).** Three of this proof's assertions were mid-run DOM probes
fired at a fixed instant — `.wait-header@1700` — and they failed intermittently on a busy machine with nothing wrong
under them: measured that day, 4/5 green quiet and 1/4 green while three worktrees were building Electron.
`ROTARIS_CAPTURE_PROBE_AT`, `_CLICKS`, `_SELECT` and `_PNG_AT` now accept `@~ms`, which WAITS for the selector to match
and acts as soon as it does, giving up at `ms`; plain `@ms` is untouched, because a proof that samples one selector at
7500, 8500 and 9500 ms is watching a value change and waiting-for-present would collapse the series into three readings
of the first match. **The margin the old form had was 169 ms**: the header lands at ~1531 ms and the appointment was at
1700. That is the whole defect, and it is why the failures moved between three different probes rather than settling on
one. The clicks were worse — the cancel dialog's button was clicked at a fixed 2800 ms whether or not the click at 2200
had opened it. **What could not be shown:** the ambient flake was not reproducible on demand afterwards (the baseline
went 6/6 green under CPU load and under a concurrent Electron proof), so the mechanism was demonstrated directly
instead — an appointment moved to 300 ms reproduces the original error text verbatim, `the wait header was not on
screen 1.7 s into the run`, and the deadline form passes on the same machine in the same minute. An absence still
cannot be waited FOR, so the one probe that reads the header GONE stays an appointment and was moved out to 9 s.

**What `pnpm mission-proof` does.** It builds Electron and launches the app ten times for eight items: the Mission view
painted with the run row, the tree and the table, elapsed advancing between two probes; the three trees' parity and a
23-agent republish timed against the 250 ms budget; a pause refused with a child selected and honoured with the run
selected; a cancel naming the agent and its cascade; open-agent under both preferences — the inspector pinned, then one
persona window per persona reused, hidden on close, shown again, destroyed on a new session; the inspector following the
latest author, pinning, steering, the chips' order across a state change; the strategy and depth controls written to
`agents.yaml` and read back in Settings; every surface showing a planted running child settled. Figures — the refresh
time, the persona window's first paint — land in `.proof/mission-proof/results.json`.

**What `pnpm mcp-proof` does.** It builds Electron and launches the app nine times against hand-written fixture servers
(`scripts/fixtures/mcp-fixture-server.mjs`, four protocol eras, pid files per launch): discovery and the byte-exact prompt
section with the inert grant reported once and the discovery file hashed unchanged; a call end to end with `tool.start`
before the answer and a `request_timeout` exhausted; one process per server for two concurrent children and the next
child; a mid-run narrowing refused; a server crashing after connect, warned once, re-established by the next call; the
drop rules per persona and a session toggle gone after a relaunch; the Settings category probing every row twice with the
`.cmd` stand-in for `browser` healthy through the wrap; two fatal YAML defects reported together and the same defects
dropped from a discovery file; a server that never answers `initialize` bounded at 35 s with the exit 1.5 s after the
quit. Evidence under `.proof/mcp-proof/`. **Launches 6 and 7 are driven (2026-09-28, R-062):** the toggle, the prompt,
both `Check status` presses, the secrets choice and every read wait for their conditions through `lib/driver.mjs`
rather than firing at offsets, each step recorded in `<name>.steps.json`; the offsets had made two REQ-MCP-115 reds on a
loaded Linux host that the product had not earned
([note](../defects/fixed/mcp-proofs-drop-rules-launch-clicks-at-a-fixed-offset.md)).


**What `pnpm sessions-proof` does.** It builds Electron and launches the app ten times against a scratch store and
repository: a stale session repaired one at a time and all at once (a live lock held by a child process this script
spawns is left alone; "nothing was stale" on a second press); a delete with two checkpoint refs, an isolated session's
refs in the shared repository, a session whose repository moved, a live run refused; the four-record export of a
capped audit and of an empty session, and the trajectory export of one, of two in reverse order, of a resumed and of a
capped history — every file parsed by a SEPARATE node process holding no product code; an unreadable session listed
and deleted; the backup disclosure panel. Evidence under `.proof/sessions-proof/`.

**What `pnpm code-intel-proof` does.** After `pnpm code-intel:bundle` (once per checkout; the tree is git-ignored), it
launches the app seven times: the branch guard on the dev entry and, under `ROTARIS_CODE_INTEL_PACKAGED=1`, on
`win-unpacked` (JSON-RPC and nothing but a tolerated blank line on standard output, no window, the exit status
propagated); discovery of the real runtime through the token with the tier's names in the prompt and the memories
block; the workspace binding on the launch line; a real `get_symbols_overview` call; the three-step project setup —
completed, skipped on the marker, `skipped-no-code`, a launch-less entry refused, a cancel mid-step; the manifest's
drift refused; the packaged binary with outbound traffic blocked, which names the fetch it needs (IC-7). Evidence under
`.proof/code-intel-proof/`. Its branch client is `scripts/lib/line-rpc-client.mjs` (2026-09-28, R-062): every pending
request rejects when the child exits, errors or is killed by the guard, with the exit status and standard error's tail,
so a branch that dies fails the launch in seconds instead of hanging it (`line-rpc-client.test.ts`, 12 cases).

**What `pnpm config-proof` does.** It builds Electron and launches the app five times against commented files at
both scopes: Settings → Runtime toggles "Allow outside workspace" through its confirmation and saves (every other
line as written, the global file untouched); Settings → Models chooses a slot and its strength and saves; a toggle
then Discard writes nothing; the composer's control writes `runtime.permission_mode` with no run active; a file
with `max_depth: many` refuses the run naming the file, the workspace scope and `runtime.max_depth`, and the corrected
file runs to completion. Its evidence lands under `.proof/config-proof/`; the load time is read from the app log. The
Discard scenario is seeded as a workspace already initialized, because a never-initialized one gets the
initialization record written into the same file during the launch wherever the code-intelligence bundle is present.
Its Runtime steps wait for their controls and are read back from the log (2026-09-28, R-062;
[the note](../defects/fixed/config-proofs-discard-scenario-counts-the-initialization-record-as-a-discard-write.md)).

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
card and injected; Pause then the composer's Continue run leave the pause row and two run starts, and a worker thread
sampling the store while the app runs shows the pause released the lock and the continued run held it throughout
(ADR-0005, 2026-09-29, R-067) and the paused session's summary naming no stop (REQ-ORCH-082 rule 1, OQ-118); a `message_limit`
of one pauses the run, the dialog answers "double" and the doubled limit persists; a session left paused at the limit
is resumed on relaunch through the one reap and its dialog answers "cancel"; a user-initiated close during a run
records `application_shutdown` with the terminal pair and no lock. Its evidence lands under `.proof/part-j-proof/`. The queue
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
tab. Evidence under `.proof/library-proof/`. Two of its assertions were rewritten at the Parts X/Y merge and the reason is
recorded there: the store version is asserted as "at least v11" (the ladder is asserted whole in `store.test.ts`) and
the Artifacts tab's body is now the real tab rather than the placeholder Part X supplied.

**What `pnpm artifacts-proof` does.** It launches the app six times: a scripted run publishes through
`artifact_write` and the row appears on the next refresh with no restart, its body file sits in the session's files
directory, and its sidecar is parsed by a **stock YAML parser in a separate node process** — frontmatter, then the
sections REQ-LIBRARY-090 names, in its order, with the empty ones absent; a two-child run materialises exactly two
`child_report` artifacts, each with one `artifact_published` timeline entry whose id is linked back onto the record;
an invalid tag refuses the publish whole, leaving no row and no file, in REQ-LIBRARY-089's own words; the inspector
opens on the selected row, saves, and the status cell reads `published · edited`, and re-opening the same id
re-raises the one dialog rather than a second; a body file deleted underneath leaves the record listed with Save
disabled and the failure stated once; and PD-LIBRARY-001's launch (2026-09-14) runs a child through three ordered
terminal calls — success, exit 7, and one the permission gate denies — and holds the whole command-ledger path at
once: the ledger in SQLite in the exact run order with the denied command carrying no exit status, the orchestrator
reading the report back through `artifact_read` with `sections: ['commands']` and receiving **only** the Commands
section (the tool path whose private allow-list closeout planning found predated the directive and silently returned
the whole document), the sidecar carrying the same statuses in words, and the inspector rendering that ledger. The
scripted dialect gained a verification-only `terminal:<key>` step for it, its arguments from `ROTARIS_SCRIPT_TERMINAL_ARGS` in the
shape of the artifact and MCP argument maps. Evidence under `.proof/artifacts-proof/`. Every launch clicks the Artifacts tab after
switching view — the Library opens on Prompts, REQ-LIBRARY-103's first tab.

## The driver — a step that waits instead of guessing (2026-09-11)

Two changes to how this repository verifies itself, taken together on 2026-09-11. Neither is product behaviour and
no requirement names either; both are listed here because the proofs are the evidence and a change to how they
work is a change to what the evidence means.

**The extraction.** `apps/desktop/scripts/lib/harness.mjs` holds what twenty-eight `*-proof` scripts each carried a
copy of: `cleanEnvironment` (twenty-eight copies, twenty-seven of them identical and the twenty-eighth differing
only in the name of a loop variable), `findDatabases` (twenty-one) and `oneDatabase` (twelve of the fifteen; the
other three close over their own `local` and keep it). The bodies moved unchanged — a proof green before the move
is green for the same reason after it, which is why the move was made mechanically and verified by re-running
`part-j-proof` rather than by reading. About 430 lines of duplication went. **`launch` was deliberately NOT
extracted**: twenty-six scripts define one and twenty are genuinely different, so a common form would be a rewrite
of the evidence rather than a move of it, and the driver below removes the pressure that produced the variants.

**The driver.** `apps/desktop/src/main/driver.ts`, reached only when `ROTARIS_DRIVER` names an endpoint file at
launch, opens a loopback listener and answers newline-delimited JSON: `waitFor`, `click` (by selector, optionally
by the name on screen), `type`, `chord`, `inspect`, `probe`, `eval`, `screenshot`, `resize`, `command` (relayed to
main's own `runCommand`, never around it) and `quit`. The client is `scripts/lib/driver.mjs`; `pnpm app:drive` is
the one-command-at-a-time CLI over it and `pnpm driver-proof` is its proof. Since 2026-09-28 the client also carries
`until` (a wait on a condition that is not one selector — a store row, an attribute), `choose` (either chooser kind: a
native `<select>` confirmed once the control shows the value, or the design system's `SearchableSelect` by two real
clicks) and `stopApp` (the closing picture and the quit, each within a bound, then SIGTERM, a grace and SIGKILL
through `lib/bounded-launch.mjs` for an application that does not exit, reported rather than absorbed), and `startApp`
ends a launch whose driver never answers before it throws (`lib/driver.test.ts`); `mcp-proof`'s launches 6 and 7 were
the first to use them.

**Why it exists, stated as the thing it replaces.** The sixty-seven `ROTARIS_CAPTURE_*` seams share one shape: a
step scheduled at a wall-clock offset, fired at whatever the window is showing then, read back by grepping the
log. That shape cannot wait, so every proof using it encodes a guess about how fast the machine will be. Three
recorded reds were that guess being wrong and nothing else — `git-proof` probing 1.2 s after a create still in
flight is the clearest, and the 2026-09-08 sweep's "three of the four were measurement defects" is the same
disease in its other form. `waitFor` is the whole mechanism; the rest of the ops are what replies made possible.
The first run reports what the wait was worth rather than asserting it: the shell arrived **411 ms** after the
connection, a number no fixed offset could have known.

**A secret per launch, and why.** The listener carries an `eval` that runs script in a window the user may have
signed into, so a request without the per-launch secret written into the endpoint file is refused and the
connection dropped. The proof asserts both halves — the refusal, and that the refusal does not take the window
down with it.

**What the first execution found.** The endpoint file **outlived the process it described**. Cleanup hung on
`app.on('will-quit')`, and `app.exit()` — how the `quit` op ends the process, and how every capture seam beside it
ends one — emits neither `will-quit` nor `quit`. The next `pnpm app:drive` command therefore read a live-looking
port nothing was listening on and failed with a connection error where it should have said "no app is being
driven". The falsified assumption is kept beside its replacement in `driver.ts`: an Electron exit path is not one
path, and a cleanup that matters is called by the op that knows it is ending as well as hung on the event that
usually fires. Fixed, re-run, fourteen checks green.

**Not a row in `first-executions.md`, and the reason is checkable.** That register is for a mechanism **the
architecture record decided**; no ADR decided this one, and its own tail excludes proof and harness findings on
exactly that principle. If the driver is later given an ADR — the open question is whether a verification seam of
this reach deserves one — its first execution is recorded here and the register would point at this section.

**The seams stop shipping — the same day.** Until now the packaged application compiled the whole capture surface
in, gated on an environment variable **at launch**: about 240 lines of main that could click, type and evaluate
script in a window the user had signed into, available to anything that could set a variable in the app's
environment. The gate is now at **build time**. `electron.vite.config.ts` defines `__ROTARIS_SEAMS__`;
`scripts/package.mjs` builds with `ROTARIS_BUILD=package`, which makes it false, and rollup removes every branch
behind it — the scripted clicks, the typed text, the chords, the renderer `eval`, the notices, the drags, the OS
input, the persona seams, the theme proof's whole capture pass, and `driver.ts` in its entirety. What survives is
the three the packaged probe itself drives (`ROTARIS_CAPTURE_PNG`, `_PROMPT`, `_AFTER_MS`). Main's bundle goes from
325,694 to 273,691 bytes. **An environment variable cannot turn the seams back on in a binary built without them**,
which is why the gate is a build-time constant and not a run-time check.

`package.mjs` asserts it on the artifact rather than on the source — **the seam check**, deliberately un-numbered
because ADR-0056's five rules are the native-module obligation and its own rule 5 is a different subject. The
reasoning is rule 1a's: a `define` that stopped being applied, or a guard someone moved outside the block, would
leave the surface in the product and change nothing a source reading would notice.

**What that check found, immediately, in its author's own work.** The first attempt guarded the `if` and not the
environment **read**, so `const proofDir = process.env['ROTARIS_THEME_PROOF_DIR']` and the driver's endpoint read
survived into the shipped bundle with their variable names. Both reads are behind the flag now. The check failing
its author before it ever failed anyone else is the argument for having written it as an assertion about the
artifact.

**A trap closed on the way:** `pnpm package` leaves `out/` holding the seam-free build, and every `*-proof` script
launches `out/main/index.js` and drives those seams — so the next proof run after a package would have failed for a
reason nobody would have guessed from its output. The script now says so on exit — since 2026-09-27 only when the
build ran (`docs/defects/fixed/pnpm-package-announced-a-seam-free-build-it-had-not-made.md`).

Verified on 2026-09-11: `pnpm package` (`ROTARIS_PACKAGE_DIR_ONLY=1`) **PASSED** in 277 s with the seam check as
its fourth step — rule 1a and rule 4 holding as before, and the packaged app, built without the seams, opening a
store and settling a terminal call at store v15; `driver-proof` 14/14 and `part-j-proof` green against a normal
build afterwards.

**What the driver found the day it was built — the eighty-second, eighty-third and eighty-fourth defects.** The
owner opened the Workspace view maximized and asked whether a layout fault could be seen. It could, and the seam
turned "it looks wrong" into three named faults in about twenty minutes, two of them in code that had shipped for
weeks and appeared in every wide-window screenshot any proof had ever taken.

**The eighty-second — a dead class name winning on specificity.** `shell.css` carried
`.workspace:not(.workspace--with-agents):not(.workspace--narrow)` for "the workspace with no agents column", and
**`workspace--with-agents` is set nowhere in this codebase**. Three class selectors (0,3,0) therefore beat
`.workspace--with-sidebar` (0,1,0) on the very element that rule was written for, so the two-column template won in
every wide window while `.agents` kept `grid-area: agents` — a name that template does not declare. A named area
that does not exist is not an error: the browser invents implicit tracks for it. Measured, `.workspace` computed to
**four columns and seven rows against a two-by-five template**: at 1920×983 a 259 px column and a 167 px row of dead
space with the agents pane stranded where they crossed; at 1000×680 the invented tracks overflowed the box by 144 px
and pushed the composer, the inspector and the agents pane past the bottom of the window, **taking `Start run` with
them**. The rules are removed rather than repaired, with the falsified reason kept where they stood.

**The eighty-third — a breakpoint that worked once and never again.** `useNarrow` built its `MediaQueryList` during
render, and `matchMedia` returns a NEW object on every call, so the effect's dependency changed on every render and
the listener was torn down and re-attached continuously; `matches` was read only to seed the state. A `change`
delivered while nothing was attached was therefore lost **for ever**. At 1000 px wide the query reported `true`
while the component still rendered the wide layout — at the exact size **REQ-MONITOR-051** says the workspace must
remain usable. A listener armed by hand in the same window received the event, which is what cleared the platform
and convicted the hook. The list is made once now, and the effect re-reads `matches` when it attaches: state written
only by an event cannot recover from one that never arrives.

**The eighty-fourth — in the driver itself.** Its `resize` op called `setContentSize`, which is a **no-op on a
maximized window**, and returned the unchanged size as though it had worked; a three-size sweep was measured at one
size and read as three. It leaves the maximized state first now, and refuses loudly when the host will not give the
size asked for.

**The eighty-fifth — a modal painted under the composer, and the repair of the eighty-second is what reached it.**
`chat-controls-proof` went red on the corrected layout and green without it, so the layout repair was the suspect;
driving the app to the dialog and asking the document what was at the confirm button's own centre answered it
otherwise. The button's box was right, the backdrop was correctly `position: fixed; inset: 0` over the whole
viewport, no ancestor carried a transform or a `contain` — and `document.elementFromPoint` at that centre returned
**the composer's textarea**. The design system's `.dialog-backdrop` carries no `z-index`, and the dialog is
rendered from the transcript toolbar, an EARLIER grid item than the composer; a later sibling therefore paints over
an application-modal dialog. Removing the dead row moved the composer down across the button, and what had been
operable by luck stopped being operable at all. **This is a defect of the product, latent since the dialog was
built and shared by every `ConfirmDialog` in it** — not of the repair that exposed it. `shell.css` lifts the
backdrop to 50, above the slash popup and the artifact inspector and below the acknowledgement toast, in the same
place the session browser's backdrop was already lifted for the same reason.

The lesson it carries is the one this whole day is about: **a presence assertion cannot see a stacking defect**.
Every proof that touched this dialog asserted that it was there, that its text was verbatim and that its buttons
were named — and the one that clicked it did so through a seam that reports "clicked" whether or not anything
received the click.

**`pnpm layout-proof` is the assertion whose absence let all this live.** Nothing had ever asserted that the grid a
stylesheet DEFINES is the grid the browser BUILDS. It measures the Workspace at 1400×900, at REQ-MONITOR-051's
1000×680 floor and maximized, and asserts: no implicit tracks (computed track count against declared area count),
every child's `grid-area` naming a declared area (the cause, not the symptom), nothing leaving the window with the
run control checked by name, the rows fitting their box, and the narrow layout engaging **after a live resize**
rather than at startup — which is the one form in which the eighty-third defect is visible. Run before the repair it
failed **thirteen of seventeen**; after it, seventeen of seventeen. Two more checks came with the eighty-fifth —
the modal's hit test and its confirmation — and the second of those failed on its own first execution against
correct behaviour, asserting an empty transcript where the product had legitimately rewritten the record under a
live run. The assertion is the user row's absence now, and the reason is kept beside it.

**What is still owed.** No existing proof has been rewritten onto the driver — the protocol is proved by its own
proof and not yet by a migrated one. And the strip covers **main only**: the renderer bundle still carries Part AA's
`rows-proof` role, which is a fixture surface with no input injection, named here so its survival is a decision
rather than an oversight.

## Two main windows behind one builder (2026-09-12)

The main window had been constructed inline in `main()` with its state in local variables — one window by
construction, and every consumer that needed "the" window written on that assumption. `buildMainWindow({
workspace, origin })` builds it now, its state lives on a record in a registry keyed by `webContents` id, and
the driver seam can address a window by index or by a suffix of its workspace path, refusing a selector that
matches nothing. The first executions are reported at ADR-0048 (the registry over *main* windows) and ADR-0055
(the builder, and consequence 6's two entrances); **both found nothing**, and the three defects they exposed
belonged to the code they replaced. A throwaway probe called the builder twice and read both renderers' title
bars, each naming its own workspace path; closing one left the survivor usable.

**The eighty-sixth — `layout-proof` pressed a chord ten milliseconds after the shell appeared, and had been
passing on luck.** The step sent `Ctrl+2` to reach the Workspace view; the driver's `chord` op carries no
readiness wait, and nothing in the step said the view had mounted. It passed for as long as the first paint
stayed cheap. `REQ-SHELL-022`'s geometry — enforced here for the first time, the window having opened 1280x820
with no minimum at all — made the first paint dearer, and the step went red against a product that was
correct: a throwaway probe showed `data-view` reaching `workspace` and the body growing from 7,303 to 40,185
bytes. The step clicks the navigation rail and waits for the view now, and a sweep of every chord-using script
found no second instance of the same race.

## The first two product directives (2026-09-12)

`PD-SHELL-001` (a chosen folder may be opened in an additional main window) and `PD-WORKSPACE-001` (choosing
the folder already open offers a new session) are the first entries in `docs/product/`, written the day after
the layer that holds them. The classification, the dispositions and the back-pointers are recorded there and
in `requests.md`; what belongs here is what writing them cost.

**The eighty-seventh — the register's own proof assumed the register would stay empty.** `pnpm
directive-proof` fell from 25/25 to 21/25 the moment two real directives existed, and neither the generator
nor the directives were wrong: the proof appended each fixture to the *committed* register and then asserted
absolutes about the result — `DIRECTIVE_COUNT = 1`, each precedence map anchored at its first line. Three of
the four failures were that arithmetic. The fourth was a check that had **stopped checking**: the
counterfactual for a disposition with no directive above it injects a bare disposition line, and appended
below two committed directives there was always a directive above it, so the generator was right to accept it
— the proof would have gone on printing a pass for a refusal it no longer exercised. The fixture register is
written in full now rather than appended to, and what the committed register claims is checked against the
artifact by a test that knows neither count: `DIRECTIVE_COUNT` equals the number of `PD` symbols beside it.
25/25.

The same genre as the eighty-sixth above, one register apart: a check that passed on a condition nobody had
promised would hold. There it was a cheap first paint; here it was an empty register, which is the one thing a
register exists to stop being.

## Opening a project from inside the application (2026-09-12)

Before this, the only route to a workspace was a launch argument: with none, `currentWorkspace` was the string
`(no workspace)` and some fifteen commands refused with "Open a workspace before …". `REQ-SHELL-010`'s
precedence, `REQ-SHELL-011`'s deferred offer, `REQ-SHELL-021`'s three gates, `REQ-SHELL-017`–`019`'s switch and
the title-bar chip of `REQ-SHELL-035` / `REQ-WORKSPACE-016`/`017` are all built, reported in place at ADR-0055.
`workspace/lastOpened` is registered in `PREFERENCE_KEYS` and deliberately **absent** from
`PREFERENCE_COMMAND_KEYS`: that list is an allow-list, so main owning the key is a property of the contract
rather than a convention anyone must remember.

**The eighty-eighth — the title bar had never put the workspace chip where `REQ-SHELL-033` puts it.**
That requirement fixes the strip's contents left to right: brand mark, wordmark, version label, *the workspace
chip as a centred region*, then the session control. What was drawn put the path last — a plain `<span>` after
the flexible spacer and after the Sessions button, hard against the right edge. The chip becoming a control is
a requirement that had not been built and is not the defect; its **position** is, because that ordering was
live when the strip was drawn and reading the requirement was all it would have taken. Found by drawing the
chip against the requirement rather than against the strip, which is the only reason it was found at all: no
proof asserts the title bar's order, and none of the seven views' layout assertions can see it.

Two hazards of the label rules, neither a defect because neither shipped, both worth the record because the
obvious implementation has each:

- **A budget read from the chip's own box ratchets shut.** `REQ-WORKSPACE-149` rule 2 measures against "the
  rendered width available to that label", and the available width had to come from the chip's *slot* — a flex
  item with a zero basis, whose width is therefore independent of the text inside it. Measuring the pill itself
  would have worked once and then never recovered: each shortening narrows the pill, and the narrower pill
  would be the next budget, so a widening window would never restore the path.
- **The measurement cannot happen while rendering.** `react-hooks/refs` refused the first version for reading
  `ref.current` during render, and the rule was right about more than style: the boxes that decide the label
  are the ones this render is about to produce, so a mid-render read measures the previous frame. The label is
  state written from a layout effect, which is also what makes the `ResizeObserver` and the first paint agree.

**Three obligations have nothing in this codebase to stand on, and are stated rather than passed silently.**
`REQ-WORKSPACE-109`'s initialization-cancellation machinery does not exist — three literal occurrences, all in
`docs/spec` — so `REQ-WORKSPACE-013` is **not** reported complete. No in-flight worktree integration is
observable from main (`worktree.integrate`: none; `'integrating'`: one occurrence, an unread member of
`MERGE_STATUSES`), so `REQ-SHELL-021`'s second gate is written in its place in the fixed order as an explicit
no-op that names the state it would read. And this product has **no session name**: `SessionRecordSchema`
carries an identifier, a status, a workspace root, timestamps and run state, so `REQ-WORKSPACE-017`'s "the
current session name (or `—` when there is none)" can only honestly render `—`, which the chip does.

## The two directives, built — and what the directive layer learned about itself (2026-09-12)

`PD-SHELL-001` (a chosen folder may open in an *additional* main window, by a palette entry or the chip with the
platform's secondary-activation modifier) and `PD-WORKSPACE-001` (choosing the folder a window already has open
offers a new session) are built. `workspace.choose` carries a `newWindow` flag decided by the **gesture**, before
the chooser opens, because a native chooser carries no buttons of ours (`REQ-SHELL-164`) and the two routes differ
in exactly one way that matters: the add route evaluates none of `REQ-SHELL-021`'s gates and closes no window.
`REQ-STARTUP-163`'s rule — cited by both directives rather than restated — settles all three same-folder cases in
one place: the requesting window offers a session, another window is surfaced, nobody holding it means the route
decides.

**The eighty-ninth — a verification seam no harness could reach.** Stage B's project-folder seam read its answer
behind `capturing`, which is `ROTARIS_CAPTURE_PNG` — and that same variable arms the screenshot-and-exit path. A
proof that set the seam to answer the chooser would have had the app photograph itself and quit instead, so the
seam existed and was unreachable by the only harness that can drive the flow. It is gated on `__ROTARIS_SEAMS__`
now, exactly as the driver endpoint is, and it takes a `;;`-separated queue of answers, because one launch has to
answer the chooser differently several times over and a single value forces a relaunch per assertion — which is
how a proof ends up measuring a different process from the one whose behaviour it claims.

**What the directive layer learned about itself, one day after it was written.** Both directives were buildable
as *behaviour*. Neither named every requirement it had to govern. `PD-WORKSPACE-001` asks for a transient notice
carrying an action; `REQ-NOTIFY-013` is the product's single definition of that surface and its structure carries
none, and `REQ-NOTIFY-003` says an outcome carrying a recovery action is *additionally* published as a persistent
notice — which this offer deliberately is not. The directive named only `REQ-WORKSPACE-010` and `REQ-SHELL-021`.
Under the layer's own rule — a directive governs over the requirements it names, per identifier and never
wholesale — that is not a judgement call an implementer may make silently; building it as written would have been
an ungoverned deviation from two requirements. The dispositions now name both, with back-pointers at each, and
`REQ-NOTIFY-013` turned out to prescribe the remedy in its own closing sentence: *a surface that needs different
behaviour extends this requirement rather than adding a second acknowledgement surface beside it.*

One thing was deliberately **not** widened. `REQ-SHELL-115` fixes what a persistent banner action may do as a
closed list of thirteen operations, and starting a session is not among them. Rather than add a member — a product
statement no directive asked for — the transient's action is its own closed one-member type, and
`notices.test.ts` asserts that the banner union still refuses `start-session`. The cheap widening is the one a
later part would reach for, so the assertion is what keeps the list closed.

**`pnpm workspace-proof` — 24 passed, 0 failed, 2 skipped, and every defect it found was its own.** The flow is
measured against the built app: the working-directory fallback, `REQ-SHELL-011`'s deferral at 1002 ms against a
650 ms floor, `REQ-SHELL-012`'s exact reminder, a remembered folder reopened with no prompt, a vanished one
falling back **without** being overwritten, the chip's name, tooltip and description verbatim, a hostile folder
name rendered as text, the 1000×680 floor, Return activating the chip, `REQ-SHELL-017`'s build-before-close and
its preference written only afterwards, `REQ-SHELL-018`'s discarded replacement on a veto, `REQ-SHELL-019`'s
sentence with the old window still usable, and `PD-SHELL-001`'s two windows alive at once with no gate evaluated
and both answering for themselves.

Five defects, all in the harness, and **each one would have read as a product failure**:

- A folder literally named `<b>bold</b>` cannot exist on Windows, so rule 3's fixture killed the run before it
  measured anything. The entity form (`project-&lt;b&gt;-and-{x}`) is the better test anyway: if any surface ever
  rendered that label as markup, `&lt;b&gt;` would *display* as `<b>`.
- `d.command` resolves an already-parsed value while `d.eval` resolves a string. Parsing a command's answer
  failed at the first assertion with `"[object Object]" is not valid JSON`.
- `d.windows()` answers `{ windows, selected }`, not a list. Three window assertions compared `undefined`,
  printed `? window(s)` and reported FAIL about a product that had done exactly the right thing.
- `d.chord` sends `keyDown` and `keyUp` and **no `char` event**, which is what Chromium needs to perform a
  focused button's native activation; `type`'s Enter path sends all three. So "Return activates the chip" failed
  for want of a keystroke. Asserting through `type` keeps the activation the platform's, which is the whole
  reason the chip is a real `<button>` — the fix was to send the right key, never to weaken the claim.
- `session.start` **carries** its prompt and the schema refuses a start without one, so `{ kind: 'session.start' }`
  was answered `command.malformed` and the active-run gate went unexercised. This one is the most instructive:
  the harness reported it as a SKIP with an honest reason, and a skip reads as "the product cannot be asked
  this" when what was true is "the proof asked wrongly". Gate 3 is the only place `REQ-SHELL-021`'s exact
  sentence is checked, so it was repaired rather than left skipped, and the choose is now issued with no wait
  after the start — a sleep there would let a scripted run finish first and turn a real gate into a no-op that
  passes.

Two further lessons are in the file itself. A proof that dies mid-run reports *nothing* about the assertions
below the crash, which reads exactly like a shorter proof — so a harness error is now recorded as a failed check
rather than allowed to kill the process. And one app runs at a time: seven live Electron processes were competing
with a 650 ms measurement, and a finished launch's socket rejecting with nobody awaiting it took the run down
twice. The two remaining skips are stated rather than quietly passed, and both are properties of this build
rather than of the proof: gate 2 has no worktree-integration state to read, and `REQ-STARTUP-043` has no
observable unshown interval on a route that shows its window in the same turn it builds it. Gate 3 is not among
them — it passes, with the requirement's own sentence and no chooser opened.

**Driven by hand two days later: the ninetieth defect.** The proof above was green on 26 checks when the surface
was put under `pnpm app:drive` on 2026-09-12. Four of the five rule-2 checks it carries now did not exist, and
the one that did could not fail.

**The ninetieth — the chip's elision budget could latch onto a wrong answer and stay there.** `WorkspaceChip`
computed what the chip spends on its own furniture as `button.offsetWidth - span.offsetWidth`, reasoning that the
difference between the chip and its label is the padding, the border, the gaps, the folder glyph and the session
tail. That holds only while the span is *shrunk to fit*. Take one measurement while the span still stands at its
full width inside a clamped button and the spend is **negative**: the budget comes out larger than the label
itself, every candidate "fits", and the label is left whole and drawn clipped — the one outcome
`REQ-WORKSPACE-149` rule 2 forbids. Nothing re-fires afterwards, because the slot's width has not changed, so the
wrong answer is stable for the life of the window. It appeared twice, intermittently — once across four widths in
the debugging session, once in the proof's own run — with green runs on either side of both. The budget is now the
slot's inner width less the chip's borders, padding, gaps and `flex: none` children, so no term in it depends on
the label; the gaps are counted from the fixed children rather than from the children present, because a budget
that grew by one gap the moment the label disappeared could show and hide it alternately at one slot width.

Two repairs sit beside it. `elideMiddle` now refuses a measurer that charges nothing for a label with characters,
and hides the label instead: `measurerFor` answers `() => 0` wherever a canvas 2D context or the computed font is
unavailable, and with that measurer every candidate fits — which, in a window that really was drawn, is a full
absolute path in a chip too small for it. The falsified reason is kept beside its replacement: zero was called
"the right answer where there is no width", which is true of a test renderer, where the available width is zero
as well and the clause above it has already answered. And `.title-bar__spacer` is deleted — the eighty-eighth
defect's repair removed its only use and left the rule standing.

**Four harness defects, three of which read as product failures.**

- The rule-2 check **could not fail**. It resized to `REQ-SHELL-022`'s own floor of 1000 px, where the centred
  slot is still some 760 px and every fixture path fits whole, and then let `narrow.label === wide.label` mean
  "zero ellipses is correct". It passed having measured nothing, and the latch lived behind it. The budget is
  squeezed directly now — `max-width` on the slot, which is what the layout itself varies — at widths no window
  on this platform can reach.
- **`pnpm app:drive` could not hand a seam to the app it drives.** `startApp` builds the child's environment from
  `cleanEnvironment()`, which deletes every `ROTARIS_*` name so a proof measures the product rather than the shell
  it was started from. An exported `ROTARIS_CAPTURE_PROJECT_FOLDER` therefore never arrived: the chip's click
  opened the **real** native chooser, nothing appeared in the document, and that read as a control wired to
  nothing — a diagnosis stated twice before the log was read properly. `--env=KEY=VALUE` hands one over
  explicitly, and the reply names which seams were armed.
- **No check had ever exercised the chip's own click.** Every other assertion drives `workspace.choose` through
  the driver's command op, so an unwired handler — or a missing `onChooseWorkspace` prop, which leaves
  `onChoose?.()` a silent no-op — would have passed all of them. The pointer route is asserted now, beside the
  Return route that was already there.
- The counterfactual **failed to fail**. Pinning the span with `width: 444px` changes only the flex base size, and
  a span with `flex-shrink: 1` and the stylesheet's `min-width: 0` shrank straight past it to 198 px: the forced
  state never existed and the check reported PASS against the very arithmetic it was written to catch. Pinned with
  `flex-shrink: 0` and a real `min-width` it fails before the repair and passes after, with the span still
  unshrunk at 444 px — which is the repair itself, rather than a number that moved.

The proof is **29 passed, 0 failed, 2 skipped**, the two skips being the same properties of this build as before.
Every squeeze step is read twice and reports whether the two readings agreed: a label read after the observer has
delivered but before React has committed is the frame *before* the change, and one reading cannot tell that apart
from a label that never moves at all.

## The adopted language, drawn once — and the evidence a critic reads (2026-09-12)

The owner asked whether the repository's skills, instructions and workflows could make UI generation and debugging
better. Classified **covered** as R-007: `docs/design/README.md` §7 already governs generation, REQ-SHELL-128..160
already govern rendered evidence, and REQ-WORKSPACE-051/053 already govern repository-local portable skills. Nothing
here changes what the product does. What it changes is **where a control is written, and what can be measured about
one** — `packages/ui/src/design-system/` (twenty-seven briefs, twenty-nine typed exports, sixty-nine drawing files
migrated onto it), `tools/check-ui-language.mjs` in `pnpm lint`, `pnpm ui-review`'s evidence pack, `theme-proof` moved
onto the driver, and three portable skills under `.agents/skills/` with thin `.claude/skills/` routers.

**Eight defects, the ninety-first to the ninety-eighth, and six of the eight were in the measuring code.** That ratio
is the finding, not a coincidence: this delivery is almost entirely measurement, and measurement is where this project
has repeatedly found its faults.

**The ninety-first — the theme matrix's focus section had been photographing a still image.** `webContents.capturePage()`
answers with the last COMPOSITED frame, and a window Windows has decided is occluded composites nothing. **Thirty-two
consecutive focus captures were byte-identical to `settings-13.png`** — the capture succeeded, the PNG was written, the
PNG decoded, the pixels were measured, and the section concluded that **no control in this product paints a focus ring**:
ratio 1.000 for every nav item and every Settings category, on every theme at every scale. Nothing about the failure
looked like a harness fault; it looked like a wholesale accessibility violation. A capture that must be new now says so —
one pixel of resize forces a frame, three refusals are reported as a stale capture, and a stale capture is excluded from
the ratios rather than counted as a failing one. With fresh frames the section passes everywhere: **31 of 32 captures
tested, minima 3.27 to 7.12 against a floor of 3**, one skipped because that Tab landed on no measurable control. The
counterfactual is worth stating too — `--counterfactual=focus` would have "failed" against the frozen frame as
convincingly as against a real one, so it discriminated nothing while looking like it discriminated everything.

**The ninety-second — a control disabled by `aria-disabled` was held to the enabled floor.** Mission's Pause is
`aria-disabled` rather than `disabled`, because REQ-TRACE-435's shape requires it to stay focusable and carry its reason;
it wears the disabled colour all the same. The metadata's disabled test read `:disabled` alone, so the proof measured a
disabled label against 4.5:1 instead of REQ-SHELL-145's 3:1. **The floor follows the appearance, not the attribute that
produced it.** Correcting it did not make the red go away — it made it exact, which is the next paragraph.

**The ninety-third is the product's, and it belongs to the owner: OQ-56.** With the frozen frames gone and the floors
right, one thing is left standing in the whole matrix. `--rt-text-disabled` is transcribed from the adopted
`docs/design/system/tokens/colors.css` at `oklch(52% 0 0)`, and against the default palette's own surfaces that clears
**3.22:1 on `--rt-bg`, 3.07:1 on `--rt-chrome`, 2.90:1 on `--rt-surface`, 2.56:1 on `--rt-surface-2` and 2.48:1 on
`--rt-hover`**. REQ-SHELL-145 asks for 3:1 **on every background the token is actually painted on**, and the rendered
proof measures 2.898:1 on a card — for "Cancel selection" (`disabled`) and Mission's "Pause" (`aria-disabled`) — at
100 %, 125 %, 150 % and 200 %. `nocturne` (60%) and `high-contrast` (62%) clear every surface. **At 175 % it passes, at
3.030:1**, which is the sharpest thing the matrix says about this token: the same pair, the same palette, and one
scale's device-pixel rounding is the whole distance to the floor. A value that four scales fail and the fifth clears by
three hundredths is not a value anyone chose — it is one nobody had measured.
**`static-contrast.ts` passed it because it checks the page ground alone — which is REQ-SHELL-160 (a)'s own sentence**,
"a token pair that computes correctly but paints over a different surface fails". Widening that check is one line and
`oklch(58% 0 0)` clears every surface while staying far under the dimness ceiling; **neither is an agent's to do**, because
one changes approved design material and the other changes an approved requirement. So the token is unchanged, the
narrow check stays narrow with its reason written beside it, `docs/design/README.md` §5 item 1 records that the
acceptance item it had flagged as "specifically at risk" has now been settled from pixels and failed, and OQ-56 carries
the two resolutions. `pnpm theme-proof` is red on `rotaris-dim`'s `contrast` section and on nothing else until it is answered.

**The critic ran, in a fresh context, and it is worth what it cost.** `pnpm ui-review` captured twenty-six PNGs — seven
views at two sizes, six overlays at two sizes — with geometry, computed-style landmarks, eight evaluated layout
contracts per view and **zero deterministic findings**; an agent with no memory of building any of it read the pack and
returned **twelve findings, four high, seven medium, one low**, every one citing `geometry.json` or `styles.json` by
number. The deterministic layer had reported the surfaces CLEAN, and it was right: nothing was clipped, buried,
unreachable or outside its box. What the critic found is the class of thing no assertion here was ever written to
catch — **ten distinct interactive heights across the pack**, three different treatments for "this one is selected"
with one of them outside the declared tints, empty-state panels at 84 % of a view's height around three lines of copy,
and a table whose right edge lands at 1400.44 px in a 1400 px window. **Two lessons, both cheap to state and neither
obvious before the pack existed.** A screenshot pack read by something that did not build the product is a different
instrument from a proof, and it should be run as one. And the containment check did not report that 1400.44 — a finding
against the probe, which the next round owes.

**The critic dropped one of its own findings, and that is the part worth keeping.** It had read `.btn-secondary` in the
downscaled captures as a filled light block, which would have violated the one-filled-control rule outright. Before
writing it down it decoded the PNGs and sampled the pixels: the secondary's ground is `rgb(34,34,34)` against the
primary's `rgb(103,78,176)`, the perceptual read of a shrunk screenshot was simply wrong, and the rule holds. **A critic
that judges from an impression of a picture is worth nothing here**; one that measures before it files is the whole
difference, and it is why the pack ships geometry and computed styles beside the PNGs rather than PNGs alone.

**One was repaired, ten were carried, and the difference is the point.** UIR-008: the banner's two controls were direct
children of a `flex-start` row with only the dismiss centring itself, so their centres sat **5.42 px apart on every view
at both sizes** — the first misalignment on every screen in the product. They share one cross-centred row now and an
`align-y` contract between them, and iteration 2 measures both middles at **81.62** where they had been 76.19 and 81.62.
**The other eleven were not an agent's to act on**, and saying why is the whole discipline: seven touch geometry or an
information architecture the specification owns, one — the native checkboxes — is **OQ-57**, because
`docs/design/` contains no checkbox at all and drawing one would invent a member of the adopted language, and the rest
are readings of the design material that the material should settle. Their dispositions are written into
`critique.json` beside them, each with its reason, and **the dispositions are this session's, not the owner's** — the
file says so in the field that records who wrote them. **Only one of the three cycles the plan allows was spent**: a
second pass over eleven unchanged surfaces would return the same eleven findings and read like progress.

**The ninety-eighth — the iteration series broke on the round where something was repaired.** `ui-review` keyed its
output directory on `HEAD`, and acting on a finding changes `HEAD`, so `iteration-2` never found `iteration-1`'s
critique and a three-round series could not link once. The pack keeps the revision it was shot at — that is its
provenance — and the chain now looks across revisions for the newest `iteration-(N-1)/critique.json`. Found by running
the loop rather than by reading it.

**The matrix was run twice and the two passes are identical.** Fifteen runs each — three themes × five scales — naming
the same two strings at the same 2.898:1 on the same four scale points, with **zero stale captures**, **31 of 32 focus
captures tested and one skipped** in every one of the thirty runs, and **no text skipped for animating** in either pass,
which is the mid-fade repair holding. A verdict that reproduces exactly is what makes the one red attributable to the
palette rather than to the machine.

**Repaired on the way, and NOT a new number: the mid-fade contrast reading.** 2026-09-08 diagnosed five strings at about
1.26:1 in the startup notice and attributed them to the notice being photographed mid-fade. It was diagnosed then and
never repaired; it reappeared here at high-contrast × 2. Waiting harder is not enough on its own — **the notice mounts
after the settle that preceded the capture**, so its animation was not in the list that was awaited. Settling is a loop
now, and the metadata carries, per string, whether that element's subtree was still animating when the frame was taken;
a string that was moving is reported as skipped with its reason and never as a floor violation. Every section of the
proof now reports **discovered, tested and skipped**, because "no failures" over an empty sample is the shape of a proof
that cannot fail.

**The ninety-fourth — `composer-proof` failed on a preference that is none of its business.** Its REQ-SHELL-006 check
read `!JSON.stringify(preferences).includes('alpha')` — the whole serialised document — to assert that no workspace path
is spelled into a *key*. Main's `workspace/lastOpened`, added the same day by the startup-resolution work, stores a
workspace path as a legitimate **value**, and the document-wide scan began failing a registration it was never about.
The assertion reads keys now. **The date it went red is stated and the falsified text is kept beside its replacement.**

**The ninety-fifth — the language guard watched half the code that draws.** `check-ui-language.mjs` scanned
`packages/ui/src` and stopped, and `apps/desktop/src/renderer/main.tsx` — 120 KB, the terminal and persona window
bodies — was outside it, where one raw `<button>` toggle sat. A guard that names a rule and enforces it over part of the
tree is worse than no guard, because the part it does not reach reads as compliant. It scans both roots now, and the
toggle is the shared `ToggleSwitch` — which was also about to carry **two accessible names**, since the caller names it
by visible text with `aria-labelledby` and the component always set `aria-label`.

**The ninety-sixth — `TextArea` published another component's name into every capture.** It emitted
`data-ui-component="Input"`, so every geometry and style row for a textarea in every evidence pack was filed under a
component it is not. Nothing rendered differently; the *evidence* was wrong, which is the failure mode this whole
delivery is supposed to make impossible.

**The ninety-seventh — the class helper repeated the token the caller already carried.** The parser-based migration
passes each caller's exact class string through, so `Button` received `className="btn btn-primary btn-compact"` and
composed `"btn btn btn-primary btn-compact"`. CSS does not care; a selector written against `className` does, and every
migrated control in the product carried it. `classes()` keeps the first occurrence of each token now.

**What the baseline is, and why it can only fall.** 163 normalized literal spacing, type, radius and motion entries
remain, 157 of them in `shell.css`. The check fails on a new one **and on a paid-off one** until the baseline is lowered,
so an allowance freed in one file cannot be re-spent in another; `compareDebt` is a pure function with both directions
pinned by a unit test. The same split runs through the audit: the probe inside `ui-audit.mjs` now only **measures**, and
`lib/layout-relations.mjs` decides, with all nine relations and both directions of each failure covered by fixed
numbers — a verdict reached inside the page can only be exercised by launching the product.

**Verified on the merged branch.** `pnpm check` green (symbol generator, `tsc --noEmit`, `eslint`, **1,598 passed and 25
skipped across 135 files**) and `pnpm build`. **Of the thirty-seven proof scripts, thirty-six ran — `slice-proof` alone
needs the owner's pasted key — and the list was generated from the filesystem rather than typed.** Thirty-two passed on
the first sweep, `code-intel-proof` among them.
**Three of the four reds pass alone on an idle machine** — `composer-proof` after the repair above, and `mcp-proof` (229 s)
and `transcript-proof` (its 1200-row growth bound, 39.1 ms against 22.1 ms) unchanged, which is the standing rule that a
batch runner's exit code is not a verdict. The fourth is OQ-56 and stays red by decision, not by accident.

## All twelve critic findings, repaired and measured (2026-09-13)

The owner read the dispositions of the first critic pass and answered them in five words — *"i want you
to fix ALL of them"* — including the four this session had carried back as needing a ruling. Logged as
**R-008**, classified **covered** with one open question answered: eleven are craft against the adopted
language, and the twelfth (UIR-004) **closes OQ-57**, because `docs/design/` defines no checkbox and
only the owner could decide that the product draws one.

**Every finding is stated as a number the evidence measured before and after**, from the two packs' own
`geometry.json` and `styles.json` rather than from a claim:

| # | What it was | What it is |
|---|---|---|
| UIR-001 | status strip `scrollWidth` **1847** against `clientWidth` 1400 and 1000 | **1400/1400** and **1000/1000** |
| UIR-002 | a branch fragmented across six lines | elided; **0 boxes past the viewport** at either size |
| UIR-003 | page headers **30.39, 51.81, 51.44**, two absent | **32** on every view that draws one |
| UIR-004 | the platform's own 13 × 24 box, `border-radius: 0` | **2 `Checkbox` components** in the pack; seven call sites |
| UIR-005 | active option `oklch(0.29 0 0)` at **14 px** | `--rt-accent-tint-14` at **11 px** |
| UIR-006 | **eleven** distinct interactive heights | **three** — 24, 32, and the composer textarea at 80 |
| UIR-007 | largest empty state **1236 × 636 = 71 %** of its view | **555 × 185 = 21 %** |
| UIR-008 | the banner's two control centres **5.42 px** apart | both at **81.63** |
| UIR-009 | four unrelated bands at 1000 × 680 | two declared rows at both sizes |
| UIR-010 | two selects' left edges **51.04 px** apart; one **729.2 px** wide to hold "single" | one label column; fields bounded to content |
| UIR-011 | a **393 × 24** button carrying two clauses | **134 × 24**, elided, the sentence unchanged where the requirement puts it |
| UIR-012 | rightmost extent **1400.44** in a 1400 px window; a **2230 px** history | **1400.00**, and **1063** |

**Three of the twelve were not what the critic thought, and that is worth more than the repairs.**
UIR-001 reads as a craft preference and is a **`REQ-SHELL-038` violation**: the requirement says "a long
one is clipped with an ellipsis and keeps its full text in the tooltip", and the items were
`flex: 0 0 auto`, so nothing ever shrank, no ellipsis ever happened, and the strip overflowed instead.
UIR-003 reads as a design choice and was a **missing declaration**: `.display` was defined *nowhere* in
the product, so an `h1` carrying it fell back to the browser's 2em wherever a view had not overridden it
— Library and Settings at 32 px, Overview and Git overriding to 18, Mission to 20, Requirements to 14.
And **UIR-011 could not be done as asked**: `REQ-TRACE-390` requires the accessible description to equal
the **visible** text, so replacing the sentence with a verb would break the clause the control exists
for. It was bounded and elided instead, which is the repair the language already makes elsewhere.

**UIR-005 found the adopted material disagreeing with itself.** `system/components.css` line 65 draws
`.seg-opt.is-active` with `background: var(--rt-surface-2)` — a neutral block off the ground ramp — and
§1.2 of the README that **adopts** that sheet says selection is "a tint plus accent ink, never an
outlined box and never a filled block", with three tints and no fourth to be invented. The README wins,
because it is the document that adopts; §1.2 now records where the two differ so the next reader does
not have to find it again. The other half of that finding was a plain drift: `font: inherit` had
discarded the adopted `.seg-opt`'s own `--rt-text-xs`.

**Six values were named rather than invented.** `--rt-control-height` (32) and
`--rt-control-height-compact` (24) are read off the adopted `.btn` and `.btn-compact` — 7 px padding over
`--rt-text-sm` at 1.2 with a hairline is 32, and `.input` already declared `min-height: 32px` outright.
`--rt-prose-measure` (340) is the one width the sheet states for a block of secondary text,
`.empty-state-hint`'s. `--rt-label-column`, `--rt-field-min` and `--rt-tick-width` are the three the
material does not state, and all six are declared in the theme data where the rendered proof can see
them — **a token name that resolves to nothing is worse than an honest literal**, which this record
learned in wave 3, and is why not one of them is a bare `var(--rt-thing, 12px)` fallback.

**The ratchet worked in the direction it was built for.** The repairs took the literal-geometry baseline
from **163 entries to 158** — `font-size: 18px` and `20px` gone with the per-view titles, four
`min-height` literals gone with the control scale — and the check refused to pass until the baseline was
lowered to record it, twice, because that is what "a paid-off allowance cannot be re-spent elsewhere"
means in practice. Five new literals appeared in the first draft of the checkbox and the guard caught
every one: a visually-hidden input's `1px` pair, the tick's `2px`, a `420px` cap and a `32px` fallback.
The checkbox was rebuilt around `appearance: none` on the real input — a better control anyway, since
the focus ring now lands where the keyboard does — and the rest became tokens or a `vh`.

**Verified.** `pnpm check` green (**1,601 passed, 25 skipped**), `pnpm build`, and eight proofs over
every surface that changed — `layout-proof`, `git-proof`, `requirements-proof`, `sessions-proof`,
`settings-proof`, `composer-proof`, `mission-proof`, `library-proof` — all green. `pnpm ui-review`
reports **0 deterministic findings** on the repaired build, and a second critic cycle read the new pack
in a fresh context to check the twelve rather than take them on trust.


**The second critic cycle checked the twelve rather than taking them on trust, and it is the reason this
paragraph is not a victory lap.** A fresh-context agent read the repaired pack, decoded pixels rather than
trusting the downscaled captures, and returned **six verified-resolved, six partial, and twelve new
findings**. It reproduced every number claimed above from the packs' own evidence. What it caught is that
**three repairs were the same mistake in different clothes — a bound applied to a child rather than to the
box the child lives in**: the status strip fitted by cutting nine of twelve items to six-character stubs
rather than by priority; the worktrees table stopped fragmenting words and took a 549.48 px floor inside a
346 px card, putting the danger-styled Delete off the card; and the Library panel shrank past its card,
leaving 248 px of bare ground above a one-sentence message. **All three are repaired** — priority elision
behind a `data-elide` marker, `table-layout: fixed` so the table takes its card (340 px in a 346 px card),
and the panel sitting where its first row would. The strip now fits exactly at 1400 and overflows by 79 px
at 1000, down from 847, with the remainder reachable through the scroll affordance REQ-SHELL-038 keeps.

**Nine findings are carried, and one of the critic's readings is wrong.** UIR-018 calls
`--rt-accent-tint-14` a fourth tint strength; it is the third of the three §1.2 declares. What is fair in it
is that two selection idioms now differ in strength — tint-10 on the rail, tint-14 on the segmented control
— and which one a control takes is the material's to say. The Git header at 1000 × 680 reports
`clientHeight` 56 against `scrollHeight` 76, a control sitting outside its header with nothing clipped;
**not repaired**, because the cause is a wrapping flex line and guessing at one from a capture is how a
repair becomes a regression. The dot grid still paints under the copy, which is the motif's own material.

**The ninety-ninth defect — re-running an iteration deleted the critique written for it.** `ui-audit`
empties its output directory before it captures, which is right for evidence and fatal for the one file in
there that is not evidence: a critique is the only record of a reading and it costs a whole pass to produce.
The second cycle's file was destroyed by a re-capture minutes after it was written, and its content survives
only in the session transcript and in this paragraph. `ui-review` refuses an iteration that already holds a
critique now, and `--reshoot` is how you say the loss is intended. **Found by running the loop, again.**

**The refusal was not enough, because the wrapper is not the only way in.** The same critique was destroyed a
second time on 2026-09-13 — the directory that held it now carries one 1400x900 Overview capture where the
pack had twenty-six images — and the refusal had nothing to say about it, because a refusal in `ui-review`
guards the door while the deletion lives in `ui-audit`, which anyone may run directly with `--output=` aimed
anywhere. So the tool preserves rather than refuses now: emptying the output directory carries `critique.json`
across the wipe, and `--discard-critique` (which `ui-review --reshoot` passes) is the one way to lose it on
purpose. **Preserving beats refusing when the thing being protected is not reproducible**: every other file in
a pack comes back by capturing again, and a reading does not. The skill says so too — a critique is the least
durable file in the pack, `.ui-review/` is ignored by git, and the findings belong in the report the critic
hands back, not only at a path.

### UIR-014 was `flex-shrink`, and the guard that now catches its whole class

The one finding carried out of the second cycle is repaired. It read as a wrapping defect and was not: every
view is a `flex-direction: column` box, so its header is a flex **item** carrying the default `flex-shrink: 1`.
When a short window's content exceeds it the column takes the difference out of whichever child will give, and
`min-height` — which reads like a floor — only says how far. At 1000x680 the Git header's actions wrap to a
second line, its content stands 76 px tall, and the column shrank the **box** to 56 while the content kept its
size. Nothing was clipped, because a header does not scroll: the second line paid out below the box and the
worktrees card, painted later, covered it. That is why "Merge selected" ended at y 231.25 beneath a card border
at y 227 with its own bottom border never drawn at all. `.page-header { flex: 0 0 auto }` is the whole repair —
a header shows its content or the view scrolls; it is never the thing that gives way. It is the second cycle's
own lesson mirrored: the bound was on the header, and what the header needed was to refuse to shrink.

**An ancestor's scroll is no excuse, which is why the check is strict.** `.git` is itself `overflow: auto`, so
the overflowing content did extend the view's scroll height — and scrolling never revealed it, because the next
card paints over that region. A box that cannot show its own content is a finding even inside a scroll
container. `shrunkBoxes` in `lib/layout-relations.mjs` is that verdict, pure and unit-tested in both directions,
and `ui-audit` reports it as **`SHRUNK`**: a marked box whose content exceeds it on an axis whose `overflow` is
`visible`. It is not `text-fit`, which is opt-in and published by a component about itself — and which caught
nothing here, because nobody thought to publish it on a header. This asks the question of every marked box.

**It was proved against the defect before being trusted.** With the repair reverted the sweep reports
`client height 56 holds content 76 and does not scroll` on `.page-header.git__header` — the critic's two numbers,
reached deterministically — and with it in place the header measures 830 by 830 and the finding is gone. Across
fourteen captures the new check is quiet: one finding, and a real one the critic missed.

**That finding is open, and it is the fixed-layout table's bill coming due.** `table-layout: fixed` fitted the
worktrees table to its card, which is what UIR-002 asked for; what `SHRUNK` measured is the cost. Seven columns
share 342 px at 1000x680 — 48.56 px each — and **six of the seven hold content wider than their column**:
heading "Branch" 59, `mainbase` 71 (elided), `idle · ready` 59, `+0 -0 / 0` 73, the Delete button 58. Each one
with `overflow: visible` paints across its neighbour, and because only the last column can overflow the table
itself, the table reports 350 inside 340. Two repairs were tried and **measured afterwards rather than
announced**: confining the heading cells did not move the 350 (their overflow lands on the next heading, inside
the table), and letting the action cell wrap did not either (a 58 px button cannot wrap below its own width).
Neither was kept. What the numbers say is that `.git__body` hands the checkpoint column its full 480 px and the
seven-column table the remainder, and choosing between a narrower checkpoint column, a stacked layout and fewer
columns at the minimum size is the design material's call — not a CSS nudge at the end of a repair round.

**The layout contract's first evaluation on the window controls, and the audit that could not survive it
(2026-09-28, R-062).** The controls `PD-SHELL-003` added wrote their contract by hand as `{"relations":[…]}`; the
CONTRACTS sweep iterates an array, threw in the renderer on every view (the title bar is on all seven), and the script
died on the driver's `{ error }` answer, so no pack could be produced on any view. Repaired in three parts: the controls
(and the Proposals tab, the one other hand-written attribute) publish through `layoutContractAttributes`; `pnpm lint`
refuses a `data-ui-contract` written anywhere else in the drawing roots (`tools/ui-contract-publisher.mjs`, called from
`check-ui-language.mjs`); and `ui-audit` reads each answer through `lib/audit-answer.mjs`, so a thrown expression is an
`AUDIT-ERROR` finding naming the view, the size and the expression, and a non-array contract is a `schema` finding for
its own box. First run of the whole sweep with the controls' contract in it: 14 captures and 12 overlay captures,
**0 findings**, 9 contracts per capture, the containment in `shell-title` passing. What it could not show: About is a
Settings category, not a view, so no pack reaches it and the owed critique of the About caption is still owed
(`../defects/fixed/the-window-controls-contract-is-an-object-and-kills-every-ui-audit.md`). One more defect in the same
script was found by the counterfactual and recorded, not repaired: a `CONTRACT` finding's own `kind` is overwritten by
the relation's (`../defects/a-contract-finding-in-ui-audit-is-filed-under-its-relation-kind.md`).

### The third cycle's critique, recovered from the reader rather than from the disk

The file was gone; the reading was not. The critic still held its own transcript, so the twenty-four entries came
back verbatim in three messages and were written to the path the tool now protects — twelve verification entries
and twelve findings, **valid against the schema on the first parse**. Its evidence arrays name files that no
longer exist, which is the true cost of defect 99: the observations' numbers are the only remaining check on them,
and a fourth reader could not re-measure a single one. **Ask a critic for its findings in the message, not for a
path to them.**

**Two of the twelve are misreadings, and both were settled from the source rather than argued.** UIR-018 reports
`.seg-opt.is-active` painting an alpha of 0.18 where the language declares three tints — but the theme data
defines `--rt-accent-tint-14` as `oklch(59% 0.160 292 / 0.18)`, and the rule cites the token, not a number: the
name is the tint's nominal strength, not its alpha, and the three declared tints are 0.09, 0.13 and 0.18. There is
no literal to lint. UIR-022 reports the Library's violet kicker as an outlier against eight grey ones — but
`.card-accented .card-kicker { color: var(--rt-accent-300) }` is declared in the **adopted**
`docs/design/system/components.css`, and the stash card takes `card-accented` deliberately. What is fair in it is
the question of whether that card should be the accented one, which is an information-architecture choice and not
a defect. Both readings were reasonable from a screenshot; neither survives the source.

**UIR-024 repaired and measured**: the Mission captions spanned both columns, so the form had three left edges
where the label column was introduced to give it two — label ink at 145, field at 272.98, and a caption starting
at 145 that belonged to the field. `grid-column: 2` puts each caption under the control it describes, measured at
**272.98 at both window sizes**.

**UIR-023 attempted, measured, and reverted — the finding is fair and the obvious repair is worse.** The rail's
seven items are sized to their own labels (54, 58.73, 54, 70.98, 54, 54, 54), so the selection tint changes shape
as the user moves. `align-self: stretch` does equalise them — measured at one width and one x across every view —
and then the rail resolves to its `min-width` rather than to its longest label, and the new sweep immediately
reported **every item in the pack holding 57 px of content in a 54 px box**: "Requirements" clipped, which is the
one thing REQ-SHELL-029 names this rail's width for. A constant tint box is craft; an ellipsis in the primary
navigation is a requirement. **The guard caught the repair within minutes of being merged, which is what it is
for.** Whatever answers this has to widen the rail and equalise the items in one move, and the rail's declared
width is the design material's to change.

**Seven remain open with written reasons**: UIR-013 (the strip elides all twelve items rather than dropping the
lowest-priority ones and middle-eliding the path), UIR-015 and the seven-column table above, UIR-016 (the Library
card did not shrink with its panel), UIR-017 (the dot motif paints under the copy — the motif is the material's
own), UIR-019 (the session browser's empty message inherits a column's alignment), UIR-020 (the slash catalogue's
kind tag is not a column) and UIR-021 (the composer's kickers carry values the controls already state). Four want
a decision from the design material; three are drawable but touch spec-owned surfaces, and none should be guessed
at from a pack that no longer exists.

**The hundredth defect — the artifact port's private section list, found by planning a directive's closeout.**
`PD-LIBRARY-001` widened the section vocabulary with `commands`, and the store's own filter took the widening the
day the directive landed — its test has been green since. What nobody had tested is the only path a model reaches:
`artifactOps.read` in the engine port filtered every `artifact_read` request through its own `SECTION_NAMES`
list, which predated the directive and never gained the section, so a filtered read for `commands` matched
nothing and **fell through to the full document**. A model asking for the command ledger received the whole
artifact and every request read as success — the falsest kind of green, because the store test proves the
mechanism and the drift lived one seam above it. Found while planning the directive's built-app evidence, not by
a red check: the unit suite could not see it because the tool path had no test. The repair is the one the
vocabulary asks for — the port imports contracts' `ARTIFACT_SECTIONS` and no longer holds a copy — pinned by a
regression through `artifactOps.read` and held shut by `pnpm artifacts-proof`'s sixth launch, which drives the
whole path in the built app: a child runs three ordered terminal calls (success, exit 7, one the gate denies),
and the ledger lands in SQLite in the exact run order, comes back through the real filtered tool read as **only**
the Commands section, sits in the sidecar with the same statuses in words, and renders in the inspector. The scripted dialect gained a
verification-only `terminal:<key>` step for it. `REQ-TOOLS-148` now takes that widened vocabulary through the
directive too. Recorded in a defect note (removed once repaired);
the first execution is in `docs/architecture/first-executions.md` and the directive's own record.

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

**C2-1 repaired — 2026-09-11, and the fix was to make the two orders indistinguishable rather than to pick a winner.** The defect was a stored composer draft discarded by a Library load that beat it to the composer: the draft arrives over a command round trip, the load two animation frames after the view switch, and `REQ-CHAT-015` adopts a draft only into an empty composer, so whichever landed second lost. Part C″ found it, measured it as appended in three runs of four and replaced in the fourth, and correctly declined to repair it because the file was outside its row. **The repair does not order the race**; it makes the loser impossible. A pure `adoptDraft(current, loaded, draft)` beside `composeWithStashed` composes a draft that lands after a bare load **before** it, on `REQ-CHAT-044`'s one-blank-line terms — the same string the other order already produced. Text the user typed is still never composed over. Because both orders now agree, `library-proof`'s two-branch assertion, which had been pinning a coin toss on purpose, **collapses to one expected string** that fails if either half regresses. **No defect is numbered and the tally stays at eighty**: this is the repair of a defect already counted as the seventy-ninth, not a new finding. What the pass did add is a reading corrected by the linter rather than by a test — the marker was first a `useRef`, and `react-hooks/refs` refused it because the adoption runs during render by design; it is `useState`, which is what a value written in an event and read in render should always have been.

**Four open questions ruled, 2026-09-11, and none of them cost a defect.** The owner closed **OQ-5**, **OQ-38**, **OQ-55** and **OQ-45** together — the first time a single ruling closed more than one, and it happened for a reason worth keeping: three of the four had been **priced by measurement before they were put**, so what reached the owner was not a question but a bill with two columns. The register moves from forty-five open to **forty-one**. **The tally does not move and stays at eighty**, which is stated rather than left to be inferred: nothing here was found by executing a mechanism, and a reading replaced by a ruling is a different event from a defect found by running the thing.

**Two readings became the specification, and the second was narrowed in becoming it.** `REQ-TOOLS-127` now says the closing terminal frame is a literal replacement carrying a marker that it is one, and says why the conflict with `REQ-SHELL-095/098` was never real — **they bind different instants**, the grid requirements governing the stream while the process runs and the closing frame arriving after it has exited. The amendment also widened that sentence from *foreground* to every stream, because all three executions had emitted a closing frame for `bg:` streams and a proof asserted it: **the code was ahead of the requirement, which is a thing to look for and not a thing to be pleased about.** `REQ-CONFIG-117` makes `terminal_stream_interval_ms` a ceiling on batching rather than a fixed cadence — the strict reading was never rulable, because it puts `REQ-SHELL-166` out of reach at another requirement's own default — and then **narrows who holds the licence to beat it**: input the user has directed at a stream whose control they have taken, never output, and **never an agent's own `is_input` call**, which the first execution had armed on the reading that an agent's keystroke is "the same as the user's". That reading is falsified and kept beside its replacement in ADR-0021 and in the code that held it. Its price was the one Part T″ had measured without being able to attribute: fifty frames a second per stream, spent on streams nobody was watching, is why twenty background sessions alone offered `REQ-MONITOR-306`'s entire aggregate. They now offer two hundred. One call site removed, one regression pin that asserts **both** halves together — that an agent does not arm and that the control surface still does — because either alone would pass a build that had lost the other.

**`REQ-CONFIG-116` gives `shell_max_background_sessions` a maximum of 64**, taking `REQ-TRACE-481`'s ceiling and its reason rather than inventing a figure, and rejecting an out-of-range value at load on the terms `REQ-CONFIG-473` and `REQ-CONFIG-476` already use. That discharges **ADR-0021's "The cap is load-bearing" obligation 2**, open since the record was written: the staleness law Part T″ measured now has both its terms, and at the maximum `(20 agents + 64) × windows` stays under the thousand-stream crossing for any window count a user can produce. `REQ-TOOLS-126`'s new citation of `REQ-MONITOR-306` also discharges the half of **ESC-22** that domain 05 had been recorded as owing since 2026-09-02 — *an implementer reading `REQ-TOOLS-126` alone would build per-stream sampling with no aggregate* — which nobody had gone back for.

**ADR-0061 takes the improvement artifact store's write path**, and the lesson of OQ-45 is not about storage. That question had been answerable since **2026-09-02**, when ESC-30 ruled its product half; what remained was a record nobody had written, and it survived nine days and three waves because each record that might have held it was about something else — ADR-0003 and ADR-0004 reasoned from a file model SR-4 had removed, and ADR-0041 correctly declined it while taking the export. **A question can stay open long after it has stopped being a question**, and the register cannot tell the difference on its own. The record takes the second horn: the version write stays outside the artifact write's all-or-nothing boundary as `REQ-LIBRARY-047` requires, with two counters each written by the transaction that owns the fact it counts, and it decides the one thing no requirement states — that a never-recorded version raises no notice but **is stated on the history surface `REQ-LIBRARY-168` already draws**, because the one place a person looks should not be the one place the store's own knowledge of its gaps is hidden. The store, workspace-service owner, bounded post-run capture, no-tools analyst and application-wide FIFO were built on 2026-09-14; the Proposals surface, Overview card, approved-only executor, verifier writer, dedicated checkpoints, desktop export and confirmed rollback completed the lifecycle on 2026-09-15. `pnpm improvements-proof` holds its six verification lanes.

**Wave 3 of the three-lane build — 2026-09-11, and the plan is finished.** Three agents closed the three lanes in the same worktrees (R″ the Requirements lane, T″ the terminal, C″ the CHAT surfaces). For the first time the branches shared **not one file**, so the merge held no conflict at all — the collision surface a wave presents is a property of how its rows were drawn, and by the third wave the rows had stopped overlapping. Gate 3 carried a check the earlier gates did not, and it is the check that earned its place: **every number a handoff reported was audited** — measured on an idle machine or not, assertion still able to fail or not, count read from the product or from the proof's own model. R″ failed its first round on eight findings and passed its second; C″ passed at once; T″ passed on everything but one sentence, and the manager reworded that sentence rather than spend a repair round on a comment.

**Twelve defects, sixty-nine to eighty, and two of them are the product's.** **T2-1** (the seventy-eighth): `REQ-MONITOR-306`'s delivery bound was enforced on each window's own ledger, and the requirement bounds every window **taken together**, so one session shown in two main windows delivered **2,000 frames a second against a bound of 1,000** while each window's ledger read a compliant 1,000. It survived two waves behind a code comment that quoted the requirement's counting rule — "a stream shown in more than one window counts once per window" — and dropped the clause that rule counts into. **C2-1** (the seventy-ninth) is **not repaired and is user-visible**: a prompt loaded from the Library races the composer's stored draft, and whichever lands second is discarded, because `REQ-CHAT-015` adopts a draft only into an empty composer — measured as appended in three runs of four and replaced in the fourth. Part C″ declined to repair it because the fix belongs in `WorkspaceView.tsx`'s draft adoption, which its row did not own; ADR-0042's seventh execution note carries the shape a fix must take.

**Four of R″'s nine were found by the gate against the BUILT product, and no test could have found them.** The relationship graph's node controls were in the DOM, focusable, carrying their identifiers and kinds — and never painted: `.req-graph__columns` is a flex item whose `overflow-x` is not `visible`, so its automatic minimum size is zero, the edge list took the free space, and ten node buttons were shrunk to height 0 and clipped away. The pane host's own chrome had no rule anywhere and drew as an unpadded block. Three token-shaped names — `--rt-control-sm`, `--rt-focus-width`, `--rt-focus-offset` — are defined nowhere, so what rendered was the fallback literal: **a token name that resolves to nothing is worse than an honest literal, because it reads as compliance.** And one `REQ-TRACE-497` clause asserted nothing at all, guarded by `if (rail !== null)` in a stage that folds no column. **Why the proofs passed is the finding**: every assertion in that stage read attributes through `querySelectorAll` and none read a box.

**A requirement quoted in part is a requirement misread.** T2-1's reading passed every review for two waves because the quotation looked like the requirement. What caught it was not a re-reading but an arrangement no proof had built — a second window. The one unit test that already had two windows asserted the bound "at either window", which a per-window ledger satisfies by construction: a proof that could not fail. Beside the sixty-eighth defect's lesson, this is the second of the same family in two days, and the family is *the measurement agreed with the code because it was written from the code*.

**Verified on merged main** (`bf55233`): the symbol generator unchanged at 4,398 identifiers, `tsc --noEmit` green, `eslint` green, the suite at **1,494 passed and 25 skipped** with four failures across three files that **each pass alone** — `guard.test.ts` 5/5 (its red was a thirty-second cap on a walk of every file under `packages/` and `apps/`, not a `REQ-TRACE-399` violation), `terminal.test.ts` 19/19, `mcp.test.ts` 15/15 — and `pnpm build`. **Of the thirty-three proof scripts, thirty-two ran and twenty-nine pass**, nothing skipped; `slice-proof` alone was not run because it needs the owner's pasted key. **The list was generated from `ls apps/desktop/scripts/*-proof.mjs` rather than typed**, which is how `attachments-proof` and `todo-proof` returned to the sweep after merge 2's hand-written list had silently dropped them — both pass. **The reds are three, not four:** `part-h-proof`'s window sizing, `theme-proof`'s disabled-contrast finding and `transcript-proof`'s 1200-row bound (64.7 ms against 45), each measured with 2.6 GB or more free after the machine was twice killed for low memory mid-sweep and the runner was changed to **wait for memory rather than measure a starved machine**. `library-proof` has left that list: Part C″ closed `REQ-CHAT-044` by correcting a reading Part AB had falsified on 2026-09-08, not by relaxing the assertion. **The tally stands at eighty.** **All seven primary views were then walked in the built product on merged main** — Ctrl+1 to Ctrl+7 in REQ-SHELL-049s order and back to Overview — and each `.app-shell` reported its own `data-view` and a full-size box; the viewport measured **1264 x 755**, so the plan verification width is read from the product rather than assumed, and the run logged nothing error-shaped.

**Wave 2 of the three-lane build — 2026-09-10.** The same five worktrees carried the second wave (AJ′ the parse-requiring checks and the reachable operations, AK′ the board, AP the panes and the runs, AL′ the terminal wired end to end, AO the chat controls and the prompt files), and the wave cost three model-usage interruptions before it finished: two limits killed every agent at once with nothing committed, and the recovery was to relaunch the same workflow with one added paragraph telling each agent that the dirty tree it found was its own predecessor's and to commit the first green slice early. **Merge order was AK′, AP, AJ′, AL′, AO**, and the twenty-four conflicts sorted into five kinds, only one of which is keep-both: disjoint banner blocks; a shared array or object where both sides added an entry and concatenation would have produced two arrays; a shared import line where the wider form must win or a symbol binds twice; a paragraph one side had extended rather than duplicated; and — the one that mattered — **each side's real implementation against the other's placeholder**, in `workspace-service/delivery.ts`, where AJ′ ran the four operations and refused the source writer while main did the reverse, so keeping both texts would have left every `case` label twice with a stub shadowing the implementation beside it.

**The board that shipped was chosen on measurement.** Two Requirements views existed: one committed directly to `main` on 2026-09-10 and Part AK′'s. They export a symbol of the same name through `packages/ui/src/index.ts`, so both merge cleanly as text and then fail the build on an ambiguous re-export. The owner asked for the better implementation. The withdrawn view was 266 lines citing ONE requirement identifier, with a 57-line test citing none; the board kept is 2,288 lines across fourteen files citing ninety, with a 295-line unit test citing eighteen and an Electron proof of sixty-nine assertions over twenty-seven. In a record whose rule is that implementation cites what it satisfies, a traceability view citing one identifier is not traceable. The unrelated layout work in the same commit — the status strip's scroll affordance, the git checkpoint table's scroll container, the composer's rules and their regression test — was kept in full (`e88c57d`).

**Three defects, and all three are the merge's own** (sixty-one to sixty-three). The sixty-first: the repair of the sixtieth taught `sessions-proof` to plant a `delivery_runs` row with a literal INSERT, which tripped REQ-TRACE-399's guard that no module writes the delivery store around the one DAL; the guard already exempted every `.test.ts`, and the proof harnesses under `apps/desktop/scripts/` are the same category, so the exemption is stated rather than the assertion deleted (`327a3e1`). The sixty-second: a blanket `git add -A` tracked two files of proof evidence, because Part AK′ renamed `delivery-proof` to `requirements-proof` and took the ignore line with it, leaving the old evidence directory unignored. The sixty-third, and the one only the merge could show: **two Parts registered the same two preference keys with DIFFERENT coercions** — same names, same defaults, one comparing a stored string exactly and one trimming and lower-casing it first. Each branch compiled alone; together they are an object literal with a property named twice. The tolerant pair stays, because this table's own rule is that a boolean read tolerates however the backend spelled it, and deduplicating by line number would have quietly made two preferences case-sensitive (`7c8260c`). **A duplicate sweep written for the occasion reported all eight of its checks CLEAN minutes before `tsc` found this**: a sweep localises a problem and is worth nothing as evidence of its absence.

**Verified on merged main** (`7c8260c`): the symbol generator, `tsc --noEmit` with zero errors, `eslint`, the test suite at 1,474 passed and 25 skipped with the only red the known parallel-pool signature (`terminal.test.ts`, 19/19 alone), and `pnpm build`. Of the thirty-three proof scripts, thirty were run - `slice-proof` needs the owner's pasted key, and `attachments-proof` and `todo-proof` were simply missed off the list, which is a finding against the sweep rule and not against any Part. Twenty-six of the thirty pass. Four reds are the ones recorded above and unchanged by this wave (`transcript-proof`'s 1200-row timing bound, `library-proof`'s REQ-CHAT-044 double append owed to the CHAT domain, `part-h-proof`'s window sizing and `theme-proof`'s disabled-contrast finding). `code-intel-proof` is green as of 2026-09-11, at the cost of the sixty-eighth defect, and the reason first recorded for its redness was falsified by the very run it was owed; the paragraphs below keep both. The proof pass itself found four more, sixty-four to sixty-seven: three count pins `palette-proof` had as literals and the merge outran; the renderer's `control` helper discarding the engine's refusal message and substituting the caller's fallback, which was true until Part AO armed the operations and false the moment it did; an assertion in `slash-proof` demanding a race it could not win; and `code-intel-proof` indexing an empty step list so that silence failed as a type error. **The tally stands at sixty-eight**, the last of them below.

**The sixty-eighth defect: a proof that read the wrong store, and the reading that hid it.** The run owed on an idle machine failed a third time, in a third place, with 2.9 GB free - so load was never the cause, and the reason recorded for the first two failures is kept here beside its replacement: *"it passed at merge 1, wave 2 touched none of its code, and it failed twice in two different places with one call taking 241 s, which is a timing-dependent harness on a machine that was being killed for low memory."* What was actually there: the proof drives two workspaces - `workspace`, which holds one TypeScript file, and `workspace-nocode`, which holds none - and the product keys each store directory by a hash of the workspace path. The read was *the last `workspace.db` by path sort*, which names whichever hash sorts last rather than the workspace the launch was given; in this checkout `workspace` hashes to `v1-08b5...` and `workspace-nocode` to `v1-fb8c...`, so section 4 read the no-code store, found no `get_symbols_overview` row in it, and reported the call as unmade - while its own run log held the language server's answer (`{"Class": ["Counter"], "Function": ["greet"], "Interface": ["Greeter"]}`) and the row sat in the other store with status `ok`. Sorted hashes are fixed within a checkout and arbitrary across checkouts, which is why the same bytes passed in the worktree they were written in and could not pass here. The proof now takes the newest session across every store and asserts it began after the launch being measured - the premise every section already meant - and section 4 passes with the wrong store still on disk beside the right one. The whole proof then passed on a clean profile in 558 s, every section, which is the first green `code-intel-proof` since merge 1.

**Two further readings the same evidence corrects.** The 241-second call was the harness's flat `ROTARIS_CAPTURE_AFTER_MS` window and not work: the language server answered 20 s into the launch, the run ended `completed` at 24 s, and the proof then waited out the remaining 218 s - a window sized for the cold provisioning path that a kept runtime home never takes, so wave 3 should poll for the row rather than wait the ceiling. And *"wave 2 touched none of its code"* was asserted without being measured: wave 2 changed `session-writer.ts`, `run.ts`, `turn.ts`, `sessions.ts` and `dal.ts`, every one of them on the path this proof reads. The claim happened to be true of the outcome - the row was written correctly - but it was not evidence when it was offered, and an attribution that names a merge innocent has to measure the merge.

**And three of that batch's reds were the runner's own.** `config-proof`, `fetch-proof` and `mcp-proof` passed at merge 1, failed in the merge-2 batch, and pass alone on an idle machine at 46, 72 and 177 seconds against merge 1's 49, 72 and 177 - with the same result keys and the same line counts as the runs that had passed. Their logs hold no assertion failure at all: what the batch recorded was a non-zero exit after complete output, the Windows teardown contention the sweep's own sweep-and-retry rule exists for. **A batch runner's exit code is not a verdict**, and a red it reports is re-run alone before it is written down - the alarming strings in those three logs (`NetworkEgressDenied`, a `ghost` server running `no-such-command-xyz`) are their own intended fixtures, and read as failures only to a reader in a hurry. Recorded here because the first draft of this paragraph counted twenty-six passes with three of them assumed rather than measured. They are measured now.

**REQ-TRACE-239 is met, and the first reading of it was load.** On merged main with the machine idle the requirements proof passes six times of six: the board draws in 38–43 ms on the fixture and 54–59 ms on fifteen hundred requirements, and the hundred-millisecond switch to a hundred populated columns is never missed. The three misses at 103–112 ms were measured on the branch while this machine was twice being killed for low memory. They are kept beside the replacement rather than deleted, because a budget measured on a starved machine is not measured at all, and the falsified reading is the useful half of the record. The board earns the number.

**Wave 1 of the three-lane build — 2026-09-09.** Five Parts were built at once in five worktrees by five agents (the plan: the Requirements view as lane R, the live terminal as lane T, the CHAT domain's owed surfaces as lane C), verified by a read-only gate that ran each worktree's `pnpm check` and proof twice, and merged in the order AK, AJ, AL, AM, AN. The merge found what the five green branches could not: a keep-both conflict resolver that de-duplicated identical lines dropped a closing brace from a `case` block (git had aligned two different blocks' `}`), so every merge is now checked by brace count against base, ours and theirs before it is committed; AJ's `OBLIGATIONS` (the change-obligation texts) and AK's `OBLIGATIONS` (the evidence kinds) collided in the `@rotaris/workspace` barrel and the first is `CHANGE_OBLIGATIONS` now; the two seam-copy files each side had written to compile alone (`terminal.ts`, `terminal-keys.ts`, `requirements.ts`) were dropped for the owner's; AK's `ENGINE_NOT_MERGED` stub gave way to AJ's engine in the workspace service's case. The five Parts numbered their defects from forty-six each; the sequence is renumbered in merge order and the tally stood at sixty when this paragraph was written: AK 46, AJ 47–49, AL 50–52, AM 53–55, AN 56–58, and the merge's own fifty-nine — `emulator.ts`'s default imports of the two xterm packages, which vitest's CommonJS interop tolerated and `electron-vite build` refused, so the run-host bundle failed on the merged main while every branch had been green; a gate that admits a Part touching a composition root must also build, and gate 2 does. The merge-1 proof pass over the whole suite then found the sixtieth: `sessions-proof` (Part U) pinned the count of tables carrying a `session_id` at fifteen and asserted the cascade empties every one, and AK's `delivery_runs` — ruled to carry the column as a fact with no foreign key (REQ-TRACE-476) — broke the pin on the merged main alone; the proof now reads the cascade premise from the schema and proves the run row survives the delete (%(sessions)s). The same pass found that the runtime view's §7 held no row for v15's seven tables although `views/README.md` said the view had been reconciled — the row is written now, a records defect of the merge and not of the tally. Of the suite's other reds, `library-proof`, `transcript-proof` and `theme-proof` are the three recorded above, unchanged by wave 1 (`transcript-proof`: %(transcript)s); `git-proof`'s create scenario probed the worktree table 1.2 s after the create while the post-create re-read (eleven reads at ~900 ms each on a machine running five build agents) was still in flight — the same window-sizing shape as `part-h-proof`'s, and %(git)s. Rulings the build needed and the plan had not made are recorded in the plan's Reservations table dated 2026-09-09 (the `process-protocol.ts` banner blocks, the `kind` discriminator on terminal commands, a channel's counter line and a migration's test pins riding with their reservations, the worker entry, the `.gitignore` and `eslint.config.js` lines per proof). Two lessons for the next wave: a message to a finished agent resumes it into its worktree, so a tree handed to another agent gets one stand-down message and nothing else; and agents spawned under plan mode inherit it and must be approved through `ExitPlanMode` before they can edit.

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
| ~~the bundled code-intelligence runtime~~ **done 2026-09-06** (Part T; `pnpm code-intel-proof`; ADR-0035 first executed; spikes 5 and the bundle taken; **IC-7 proposed**; built in parallel with Part U) | `main` (`sentinel.ts`), `config` (`mcp/code-intelligence*.ts`, the generated manifest), `mcp` (`setup.ts`, the probe), `run-host` (`mcp.ts`), `ui` (`McpSettings.tsx`), `contracts` (`mcp.ts`), `apps/desktop/scripts/code-intelligence/`, `electron-builder.yml`, `package.mjs`, `build-hooks.cjs` | ~~**IC-7** — the language servers (the owner's)~~ **adopted 2026-09-06, option 2 (ESC-32)** — declared in the manifest against the runtime's defaults, disclosed on the MCP category (`REQ-MCP-118`); ~~the notices generator's section (`REQ-STARTUP-141/142/143`) is IC-7's owed half~~ **discharged 2026-09-27** (`pnpm notices` lists them); macOS/Linux bundles (IC-3); the machine-setup half of REQ-MCP-112 and the warm steps of 095/096 (with the onboarding task registry, REQ-MCP-045/098); the ONBOARDING tier's grantee (`project-initializer` is not a built-in role); REQ-MCP-034's isolated-tree root (the configuration resolves per workspace); nested `.gitignore` files in the contains-code walk; the runtime's stderr volume and its 4.5 s discovery per process (stated, not changed); the `.serena/` reading confirmed by the owner |
| ~~the Overview view~~ **done 2026-09-05** (Part M; `pnpm overview-proof`; ADR-0038 first executed) | `ui`, `engine` (the sampler), `store` (v7), `workspace` (`git/`), `workspace-service`, `main`, `contracts`, `platform` | ~~the Mission view the tree card links to~~ **built 2026-09-05** (Part R); ~~REQ-SHELL-125's start-session dialog (worktree and sandbox choices)~~ **built 2026-09-05** (Part O); ~~the Git view — its notice when Git is missing (ADR-0038 c.1), worktrees, the history table~~ **built 2026-09-05** (Part O), checkpoints; the credit tile and the limits card once Part K's usage tiles exist; the proposals card with the Proposals surface; a cost label with a configured rate (REQ-MONITOR-166's other two qualifiers); a requirement tag on a session (REQ-MONITOR-172) once traceability exists |
| ~~checkpoints~~ **done 2026-09-05** (Part P; `pnpm checkpoint-proof`; ADR-0039 first executed; built in parallel with Part Q) | `workspace` (`git/checkpoints.ts`), `store` (v9), `engine` (the port, the writer's two units), `contracts`, `workspace-service`, `main`, `run-host`, `ui`, `config` (the `checkpoints` section) | ~~REQ-GIT-069's ref cleanup when a session is deleted~~ **built 2026-09-06** (Part U); `manual` checkpoints (no surface asks); REQ-HOOKS-082 with checkpoints; the two events in REQ-SESSION-199's export; ~~improvement checkpoints (`REQ-LIBRARY-*`)~~ **built 2026-09-15** under `refs/rotaris/improvements/` with independent retention and rollback safety; a non-UTF-8 path and a submodule, read not measured |
| ~~the model resilience paths~~ **done 2026-09-05** (Part Q; `pnpm resilience-proof`; ADR-0027 third, ADR-0012 fourth, ADR-0010 third execution) | `engine` (`run/resilience.ts`, `ladder.ts`, `waits.ts`), `model`, `contracts` (`wait`), `run-host`, `main`, `ui` | REQ-ORCH-093's context-window condensation; REQ-ORCH-089's stall watchdog and its badge; a real provider's 429 (a slice-proof scenario for the owner); REQ-NOTIFY-062's hosted-credit branch; REQ-ORCH-146's native loop; rate-limit-reset headers |
| ~~the Git view and the worktrees~~ **done 2026-09-05** (Part O; `pnpm git-proof`; ADR-0038 second executed; built in parallel with Part N) | `ui`, `workspace` (`git/`), `workspace-service`, `main`, `contracts`, `store` (v8), `engine` (the effective root), `platform` | ~~checkpoints (ADR-0039)~~ **built 2026-09-05** (Part P); integration and "Merge selected" (REQ-GIT-083, 125..135); REQ-GIT-084's focus requests; the set-up-Git-here offer (REQ-GIT-113/114, in the Requirements area); requirement-execution worktrees; `git_commit` (REQ-GIT-144); `worktree_storage_subpath` read from configuration (REQ-GIT-073 / REQ-CONFIG-068); REQ-SANDBOX-119's probe-driven checkbox; a notice queue so the Git notice and the first-launch notice coexist (ADR-0049) |
| ~~the build's load proof~~ **done 2026-09-04** — `pnpm package` (`apps/desktop/scripts/`), **IC-6 discharged**; the first packaged window was blank (the ninth defect) | `apps/desktop/electron-builder.yml`, `scripts/build-hooks.cjs`, `scripts/native-load-probe.cjs`, `scripts/package.mjs` | the portable's stub (ADR-0054), signing, the release gate, an icon; IC-3 item 3 |
| ~~a terminal save's durability~~ **harness built 2026-09-04** (`packages/store/spike/`, `power-loss.spike.test.ts`) | `store` (the settings are the store's; the writer's raise-and-lower is `dal.ts`'s) | **the power-loss test's fault half — the owner's power cut or kernel crash** (`spikes/power-loss.md` §4) |
| ~~the two undesigned themes~~ **done 2026-09-04** — `pnpm theme-proof`; **IC-2 discharged** | `contracts` (theme data and colour math), `platform` (preferences), `main`, `ui`, `apps/desktop/scripts` | different-scale multi-monitor drag on owner hardware; macOS/Linux native surfaces stay with IC-3 |
| ~~the Library view, its shell and its Prompts tab~~ **done 2026-09-07** (Part X; `pnpm library-proof`; ADR-0042 fourth and ADR-0058 executed, both **found nothing**; built in parallel with Part Y) | `ui` (`library/`: `LibraryView`, `PromptsTab`, `StashDialog`, `ProposalsTab`, `types.ts`), `contracts` (`library.ts`, `improvements.ts`, channel 9, prompt and improvement commands), `store` (v11 prompts, v18 improvements), `run-host`, `main` (`library.ts`, the revision and lifecycle coordination), `renderer`, `workspace-service` | ~~`/stash` and `/pop` (REQ-LIBRARY-142) wait on the composer's slash catalogue~~ **built 2026-09-09** (Part AN); ~~the Proposals surface, Overview proposals card, review lifecycle, executor, export and rollback~~ **built 2026-09-15** (`pnpm improvements-proof`); demo mode (REQ-LIBRARY-119/143) waits on REQ-SHELL-162's demo window; REQ-CHAT-044's blank-line append is vacuously satisfied on the Library's own routes until REQ-SHELL-159's composer draft exists |
| ~~the session artifact store, the Artifacts tab and the inspector~~ **done 2026-09-07** (Part Y; `pnpm artifacts-proof`; **ADR-0051 first executed**, ADR-0003 and ADR-0058 executed; four defects, the thirty-third to the thirty-sixth; built in parallel with Part X) | `store` (v12, `artifacts` and its declared index), `engine` (`artifacts/`: record, sidecar, store, context, port), `agent-tools` (`tools/artifacts.ts`, the three executors the registry already named), `ui` (`markdown/`, `library/ArtifactsTab.tsx`, `library/ArtifactInspector.tsx`), `contracts` (`artifacts.ts`), `run-host`, `main`, `renderer` | ~~the improvement artifacts of REQ-LIBRARY-042ff~~ **their v18 store, workspace-service owner and post-run analyst were built 2026-09-14; their review, execution, export and rollback lifecycle completed 2026-09-15** (this is a different store from the session `artifacts` table of REQ-LIBRARY-087); the agent inspector's artifact links, which Part R owes; ~~the improvement checkpoints Part P owed~~ **built 2026-09-15**; ~~a Markdown link that OPENS~~ **built 2026-09-07** (Part AA added `shell.openExternal`; an `http(s)` link opens in the system browser, a `file:` reference is refused by scheme, and a platform refusal is reported rather than passing silently); ~~the transcript's own use of that renderer~~ **built 2026-09-07** (Part AA; agent-message rows render through `ui/markdown`, and nothing renders Markdown a second way) |
| ~~the transcript engine: ADR-0045's recycled pool, ADR-0046's steps 3-5, the projection, the anchor, search and paging~~ **done 2026-09-07** (Part Z; `pnpm transcript-proof`; **ADR-0045 first executed and ADR-0046's first note**, covering steps 0-2 too, which had shipped under ADR-0043's note; built in parallel with Part AA) | `ui` (`transcript/`: `types`, `constants`, `project`, `projector`, `pool`, `cache`, `search`, `TranscriptPane`), `ui-core` (step 3's row counters), `contracts` (`chars`, `streamId`, `stalledSince`, `display/groupTools`), `config` (`display-section.ts`), `model` (`reasoning.ts`), `engine` (`session-writer`, `projection-owner`, `run/turn`) | REQ-CHAT-055/154/157 are **built but cannot be discharged** — the benchmark replay harness those three name as the deciding authority is ADR-0053's and is not built — *and REQ-CHAT-055's append comparison, red in `transcript-proof` from 2026-09-22, ~~passes again since 2026-09-28~~ ~~**is still not reliably green**~~ **passes again since 2026-09-29** (the R-048 measurement round under R-062: the pane projects once per change of inputs and bounded, the offset table and the surface value once per change of theirs, and ~~the per-increment cost no longer grows with depth~~ the per-increment cost at parity in fix round 1's six traced pairs; the fix round passed four runs of six, never three in a row, the loaded side about two thirds of a frame over at the median; fix round 2 repaired the bounded projection's cut to read the rows hygiene keeps and passed two runs of six on a shared host — nine passes in fifteen since the fix rounds began — the loaded side about a frame and a half over at the median (+24.1 ms), its per-increment script at parity in two traced pairs of five and 2.5–4.8 ms higher on the loaded side in three, so whether the cost still grows with depth is unshown; fix round 3 (record only) re-ran that build three times on a quiet host, three passes (+2.9, +11.0, +0.9 ms) with the loaded side's script still 1.2–4.2 ms higher per increment in each traced pair — six passes in twelve on that build with fix round 2's and the verifier's, thirteen in twenty-one since the fix rounds began; ~~the note is open in `docs/defects/`~~ the CPU-profile round (2026-09-29) named the loaded side's extra script by function — the transcript's own passes over every displayed row, 1.03 ms of +1.50 ms of script an increment — and repaired them in `transcript/` (`reuseOffsets` and its `MeasureLedger`, `updateShape`, `placementsFrom`, the carried reach, a run's beginning and end bounded), after which twelve consecutive runs passed and sixteen of seventeen in all, the one red on a saturated host (a series on a host that stays quiet is still owed), the loaded side's script +0.24 ms an increment over their traced pairs; the note is in `docs/defects/fixed/`, the measurement point reported back into ADR-0045, OQ-89 raised on the reading under a burst — OQ-76 on its branch, renumbered at the merge)*; REQ-CHAT-073 is met in one clause of two (no Clear action exists, section 14 being out of plan); REQ-CHAT-051 is met for approvals and **pending for questions** until Part AC widens `pendingQuestions`; ~~the live-terminal clauses of REQ-CHAT-063 and 066 are implemented and unexercised (nothing publishes a terminal frame, ADR-0021)~~ **a producer and a preview exist since 2026-09-09** (Parts AL and AM; the live-stream measurement is AL′'s); REQ-CONFIG-472's Display settings category (the read path and the caps are built, the surface is not) |
| ~~the transcript's row renderers~~ **done 2026-09-07** (Part AA; `pnpm rows-proof`; **ADR-0051's second execution**; built in parallel with Part Z) | `ui` (`transcript/Row.tsx` — the ONE row renderer, a pure function of its props; `TranscriptSurface.tsx`; `RowProof.tsx`; `markdown/` consumed), `contracts` + `main` (`shell.openExternal`), `platform` (`display/showReasoning`, `display/autoCollapseTools`) | ~~REQ-CHAT-076's live-terminal pop-out is implemented and unexercised (ADR-0021)~~ **the preview block draws the screen since 2026-09-09** (Part AM; the pop-out window's mounting is AL′'s); the parse cache's live-row rule (`peek` against `parse`) is Part Z's REQ-CHAT-058 and is owed; REQ-CHAT-163 was reassigned to Part Z mid-plan as stream-side work and REQ-CHAT-164 split, Z detecting the stall and AA drawing it |
| ~~the composer's chips, its drafts, its history and the run header~~ **done 2026-09-07** (Part AB; `pnpm composer-proof`; ADR-0042's fifth execution, **found nothing** in the store and one thing in the seam above it; **OQ-51 raised against REQ-CHAT-039**; built in parallel with Part AC) | `ui` (`composer.ts`, `WorkspaceView.tsx`), `platform` (`preferences.ts` — the first PARAMETRISED key family, `workspaces/{key}/composerDraft`), `contracts` (`composer.readDraft`/`writeDraft`, key-less by design), `engine` (`sessions.ts` the queue, `session-writer.ts`), `store` (**v13**, `queued_prompts.context_snapshot`), `main`, `renderer` | **OQ-51 is open and blocks the unscoped half of REQ-CHAT-039** — the column is `NOT NULL` and the owner's 2026-09-07 amendment of REQ-CHAT-041 assigns one session-scoped queue without amending 039 beside it; REQ-CHAT-008's recovery state is unit-tested but unmeasured in the product; REQ-CHAT-158's model-call boundary is approximated from the newest row because no field publishes one (owed: a `SessionRecord` field); REQ-CHAT-007's second limb is implemented and **unreachable**; REQ-CHAT-155 is met in two limbs of three; **Parts AD and AE must take v14 and v15** |
| ~~structured questions and the stepper~~ **done 2026-09-07** (Part AC; `pnpm questions-proof`; **ADR-0010's fourth execution and ADR-0016's fifth**; built in parallel with Part AB) | `agent-tools` (`tools/questions.ts`, the executor the registry had named since Part B), `contracts` (`pendingQuestions` widened, `approval.raise`), `engine` (`sessions.ts` the two control arms, `run/run.ts`, `run/turn.ts`, `children/personas.ts`), `ui` (`QuestionStepper.tsx`, the trailer's question arm), `run-host`, `main`, `renderer` | REQ-SESSION-025's persistence limb (`pendingQuestions` is derived from the live run, never mirrored to a column — a wait restored from disk has no waiting call behind it, which is the false success REQ-CHAT-102 forbids); whether a delegated child may ask the user (**raised against REQ-TOOLS-002**, and it is NOT in the register — the manager entered it as OQ-52); closing the OS window rather than the modal is implemented via `beforeunload` and unexercised |
| ~~the editable task plan~~ **done 2026-09-08** (Part AD; `pnpm todo-proof`; ADR-0059's fourth execution) | `engine` (`todo-view.ts`, `run/run.ts`, `run/todo.ts`, `sessions.ts`), `agent-tools` (`tools/todo.ts`), `contracts` (`channels.ts`), `ui` (`TodoPane.tsx`, `WorkspaceView.tsx`), `run-host` | REQ-CHAT-085..091 are met; a child's plan is edited only through the run that owns it |
| ~~durable image attachments~~ **done 2026-09-08** (Part AE; `pnpm attachments-proof`; store **v14**) | `engine` (`attachments.ts`), `store` (v14, `transcript_rows.attachments`), `contracts`, `ui`, `main`, `renderer` | REQ-CHAT-046/153/173; a model that declares no image input refuses the attachment rather than dropping it |
| ~~the four Settings categories that could be reached~~ **done 2026-09-08** (Part AG; `pnpm settings-proof`; ADR-0036 third and ADR-0037 second execution; two defects, both about a null meaning "no limit") | `ui` (`settings/{DisplaySettings,Inventories,About}.tsx`, `config-state.ts`), `config` (`display-section.ts` — the key names REQ-CONFIG-172 states), `contracts` + `main` (`shell.openThirdPartyLicenses`, `shell.hello`) | Skills waits on portable-skill discovery and Plugins on REQ-TOOLS-161's loader, each saying which mechanism it waits for; REQ-SHELL-140's build identifier and REQ-SHELL-142's notices bundle have no asset in any build here and are owed to ADR-0054 — *2026-09-27: the notices bundle has its generator (`pnpm notices`) and the About page reads it under REQ-STARTUP-141's name, the lowercase lookup repaired; carrying both assets into the artifact is `first-release-plan.md` §4.4* — *later that day: §4.4 built; `pnpm build-id` writes the identifier, `pnpm package` runs both steps and `extraResources` carries both, and `settings-proof` measures the present branch of each (launch 1′)* |
| ~~context compression~~ **done 2026-09-08** (Part AH; `pnpm compression-proof`; **ADR-0060 first executed**; five defects, the forty-first to the forty-fifth, three of them found only on the first live run against a real provider) | `engine` (`run/conversation.ts`, `run/compression.ts`, `run/{turn,ladder,run}.ts`, `children/{orchestration,activity}.ts`, `session-writer.ts`, `todo-view.ts`, `sessions.ts`), `contracts` (`channels.ts`, `children.ts`), `run-host` (`compressorOf`, `compressionTriggerFor`, `contextLimitsOf`, the scripted faults), `ui` | **§10's manual compression is a part of its own** — `forceCompression`'s arm, the run-header control (REQ-CHAT-078..081) and REQ-MONITOR-090..097's concurrent pass over every live conversation, which ADR-0060 decision 1 exists to make buildable; **OQ-53** on the venue REQ-CONFIG-135 names; REQ-MONITOR-088's context-card caption and REQ-MONITOR-089's fall measured on a surface; a real provider's context rejection; a child's own compression in the app; `compressor.timeout_seconds` expiring; a compression during a parent resume, so `parent_resume_bad_request` is implemented and unmeasured |
| ~~the delivery store, the board projection and the requirements contracts~~ **done 2026-09-09** (Part AK; `pnpm delivery-proof`; **ADR-0041 first executed**; the forty-sixth defect, and the sixtieth at the merge-1 proof pass — `sessions-proof`'s fifteen-table cascade pin; built in parallel with Parts AJ, AL, AM and AN) | `store` (v15, `delivery/`), `workspace` (`delivery/`), `contracts` (`requirements.ts`, channel 10), `ui-core` (`requirements/display.ts`), `workspace-service` (`delivery.ts`), `main` (`requirements.ts`), `preload`, `shell` (the counter) | the board itself (AK′); runs from the board and the queue's persistence (AP: ~~`requirements.scheduling.*` unregistered, the controls are in memory at `manual`/2~~ **registered 2026-09-10** (Part AP); ~~`start` on `requirements.queue.set`~~ **added** (Part AP); REQ-TRACE-514's export; eight relation tokens with no data source in the document format; `superseded` health unreachable; ~~`edit`/`create` (AP)~~ **built 2026-09-10** (`requirements.source.write`, the create/edit pane); `accept-proposal`/`accept-change-work` remain stated refusals — **OQ-45 is closed (ADR-0061, 2026-09-11) and these now wait on the store being built rather than on the record being written**; ~~the five panes mounted and reachable~~ **hosted and closed 2026-09-11** (Part R″: the board hosts Part AP's five panes through a registry that proves REQ-TRACE-369's reuse rather than mere presence, the elevation's disclosure stands between the first action of a launch and any write, and `pnpm requirements-proof` drives REQ-TRACE-499 — release, run, review, accept, then an edit on disk and `needs-update` — over the shipped composition, with the transition times read from the store's own history rows rather than from the moments the proof looked); the relationship graph is **built as a presentation, not an axis** (REQ-TRACE-322..333, 505) |
| ~~the traceability engine~~ **done 2026-09-09** (Part AJ; `pnpm traceability-proof`; **ADR-0040 first executed**; spike 7 taken — `spikes/traceability-scale.md`; defects forty-seven to forty-nine) | `workspace` (`traceability/`), `workspace-service` (`traceability.ts`, `traceability-worker.ts`), `contracts` (`traceability.*` protocol), `apps/desktop/scripts/fixtures/requirements-store/` | the syntax-tree parser for REQ-TRACE-104 rule 1 and 109/110 (OQ-24, AJ′ — measured against the spike's 1,000-file tree); the consumer package the artifact imports from (`rotaris-traceability`; REQ-TRACE-176/182/183); the orphan-test baseline's first real write once the parser exists; a contended replace (OQ-41); ~~the Settings card and the `requirements.operation` relay (AJ′)~~ **built 2026-09-10**; ~~AK's `compareReqIds` adopted for the engine's own ordering (REQ-TRACE-289)~~ **adopted**; the published consumer package stays not-built with its reason (REQ-TRACE-152); **the growth assertion made honest 2026-09-11** (Part R″, answering OQ-24: the linear-growth ratio was a quotient of two single wall-clock readings and had gone red once at 3.06 against 3.0; it is now the minimum of three readings on each side, with a work-count ratio asserted unconditionally beside it and the timing recorded rather than asserted below a 25 ms floor — the threshold was not moved) |
| ~~the terminal stream in the run host~~ **done 2026-09-09** (Part AL; `pnpm terminal-stream-proof`; **ADR-0021 first executed** against a real PTY; defects fifty to fifty-two, the last being two registered keys nothing read, and fifty-nine at the merge — the default imports the bundler refused; *its real-PTY half first run on a POSIX shell 2026-09-28 (R-062): it had spoken PowerShell to `/bin/sh` and measured nothing off Windows. It is now spelled in the host's shell, and it passed three times on Linux, `../defects/fixed/terminal-stream-proofs-real-pty-half-speaks-powershell-to-a-posix-shell.md`*) | `agent-tools` (`terminal/streams.ts`, the emulator port, the taps), `engine` (the row's `streamId`, published never recorded), `contracts` (`terminal.ts`, `TerminalFrameSchema` with `sessionId` and `seq`), `shell` (`subscribersOf`), `run-host` (`terminal.ts`, `tools.ts` reads the background limits), `main` (`terminal.ts`: the per-window `FrameDeliveryLimiter` under REQ-MONITOR-306, merged never dropped) | the window role and its lifecycle, the toolbar control, Ctrl+Shift+T, `terminal/autoOpen`, session-focus and new-session clearing (AL′); ~~REQ-SHELL-166 against the real PTY through the window (AL′)~~ **measured 2026-09-10**; REQ-MONITOR-306 across two windows (T″); ~~a stated maximum on `shell_max_background_sessions` (OQ-55)~~ **set 2026-09-11: `REQ-CONFIG-116` makes the key `int 1–64`**; the audit entry's vocabulary (OQ-54); a mid-run `meta` delivered after a merged delta under saturation carries a lower `seq` (a regression test owed); **defect T2-1, 2026-09-11** (Part T″) — REQ-MONITOR-306's bound was enforced on each window's own ledger, and the requirement bounds every window **taken together**, so one session shown in two main windows delivered **2,000 frames/s against a bound of 1,000** while each window's ledger read a compliant 1,000; one shared ledger now, drained a segment per window so a saturating window cannot starve its neighbour, and the falsified reading is kept beside its replacement in the file that meets it; ~~`runtime.shell_max_background_sessions` has no stated maximum~~ ~~**priced, not set**~~ **SET 2026-09-11 at 1–64, and ADR-0021's obligation 2 is discharged with it** (OQ-55 closed) |
| ~~the terminal grid, the pop-out window's content and the transcript preview~~ **done 2026-09-09** (Part AM; `pnpm terminal-proof`; **ADR-0047 first executed** over a scripted frame source; defects fifty-three to fifty-five; the sixteen ANSI colours as `--rt-term-*` tokens in all three palettes with their own contrast floor; *its live section first run on a POSIX shell 2026-09-28 (R-062): three commands had spoken PowerShell to `/bin/sh`. They are now spelled in the host's shell, and the proof passed 116/116 three times on Linux, `../defects/fixed/terminal-proofs-live-section-drives-a-posix-shell-with-powershell.md`*) | `ui` (`terminal/`), `contracts` (`terminal-keys.ts`, `theme/themes.ts`, `static-contrast.ts`), `transcript/Row.tsx` (the preview block), `apps/desktop/scripts/terminal-proof/` | ~~the window role, title and lifecycle, the toolbar control, Ctrl+Shift+T, the auto-open preference, session focus and new-session clearing (REQ-SHELL-080/081/086/108..111, AL′)~~ **built 2026-09-10**; REQ-SHELL-166 against a real PTY and REQ-SHELL-102 on a live stream (AL′/T″); REQ-SHELL-107's write is the run host's; **closed 2026-09-11** (Part T″: REQ-SHELL-102's three surfaces measured equal on a live stream, the packaged `runtime.terminal_stream_enabled=false` section, and ADR-0021's obligation 2 measured rather than argued). **Three things remain and each is stated, not silent:** defect AL2-3's mid-command resize is measured and NOT repaired because the repair is an ADR-0020 revision; REQ-SHELL-166's full-screen-program limb has no such program in the harness; and the terminal WINDOW is not opened under a packaged launch |
| ~~the composer's slash-command catalogue~~ **done 2026-09-09** (Part AN; `pnpm slash-proof`; ADR-0050 second, ADR-0049 third, ADR-0048 second execution; defects fifty-six to fifty-eight; `RunHeader.tsx` extracted with the two slots AL′ and AO fill) | `ui` (`slash/`, `RunHeader.tsx`, `WorkspaceView.tsx`, `library/StashDialog.tsx`), `renderer` (the `slash` host wiring), `contracts/theme/colour.ts` (the corrector no longer settles below its floor) | `notice.report` so a renderer can raise the one persistent notice (ADR-0049 defect fifty-seven — the composer draws its own banner meanwhile; AO); `/model`'s withheld-by-provider limb (no per-model verdict reaches the composer); ~~skill commands (REQ-CHAT-034/162 wait on REQ-WORKSPACE-056..064)~~ **built** — the generated commands and `/skill <path>` 2026-09-15 (ADR-0063), `/skills` 2026-09-27 (`first-release-plan.md` §2.2; see the portable-skills row); ~~prompt files (REQ-CHAT-160/161, AO)~~ **built 2026-09-10**, registered where `buildCatalogue` builds the registry because an effect-time registration can never be seen by the popup's memo; ~~`/compress` and `/clear` reach the run host and meet its default refusal until AO arms the two ops~~ **both armed 2026-09-10**; ~~REQ-CHAT-028's rebuild, `/theme`, `/logout` and REQ-CHAT-027's three palettes~~ **measured live 2026-09-11** (Part C″; ADR-0050's third and ADR-0060's fourth execution). Owes: `/model`'s withheld-by-provider limb (no per-model verdict reaches the composer), ~~skill commands (REQ-CHAT-034/162, waiting on REQ-WORKSPACE-056..064)~~ **built**, as above, REQ-CHAT-084's busy-transcript limb (no producer), REQ-MONITOR-091's refusal (unreachable by a scripted run), `/logout` against a provider with a validated key (no credential on this machine), ~~and **defect C2-1's draft race**, which is silent loss of a user's composer text and whose repair belongs in `WorkspaceView.tsx`'s draft adoption~~ **repaired 2026-09-11** — `adoptDraft` composes a draft that lands after a load instead of discarding it, so both orders of the race leave the same text (ADR-0042's seventh execution note carries the shape and the one design reading the linter corrected) |
| ~~opening a project from inside the application~~ **built 2026-09-12** (the builder and the registry over MAIN windows deepened into `MainWindows`, then startup resolution, the deferred first-paint offer, the gated replacement and the title-bar chip; ADR-0048 and ADR-0055 report in place, both finding the sequencing sound; defects eighty-six to eighty-eight; the first two product directives, `PD-SHELL-001` and `PD-WORKSPACE-001`, were minted beside it) | `main` (`MainWindows`, `createElectronMainWindowAdapter`, `workspace.choose`, `switchWorkspace`, `raiseTransient`, the driver seam's window selector), `contracts` (`workspace.choose`), `platform` (`workspace/lastOpened`, main-only by construction), `ui` (`WorkspaceChip.tsx`, `workspace-label.ts`, `AppShell.tsx`, `shell.css`), `renderer` (`home` from `shell.hello`, the chip's handler) | **`pnpm workspace-proof` verified** — multi-window, add/replace, attribution, hand-over, and per-window deferred cancellation paths confirmed passing; **Stage C** — `PD-SHELL-001`'s palette entry and modifier-click and `PD-WORKSPACE-001`'s `start-session` notice action; and the five things the specification asks for that nothing here can yet meet: `REQ-WORKSPACE-013`'s cancellation clause (`REQ-WORKSPACE-109`'s machinery does not exist), `REQ-SHELL-021`'s worktree gate (no such state is observable from main), `REQ-WORKSPACE-017`'s session name (the product has none), `REQ-STARTUP-166`'s workspace-storage determination, and `REQ-SHELL-124`'s dialog as a standalone surface — gate 1 reuses `__rotarisCloseGuard`, not a new dialog. Demo mode (`REQ-SHELL-162`) is a construction parameter the builder does not take yet |
| ~~the adopted language drawn once, and the evidence a critic reads~~ **built 2026-09-12** (`packages/ui/src/design-system/`, the twenty-seven briefs; `tools/check-ui-language.mjs`; `pnpm ui-review`; `theme-proof` moved onto the driver; the three portable skills under `.agents/skills/`; defects ninety-one to ninety-seven, **five of them in the measuring code**) | `ui` (`design-system/`, and sixty-nine drawing files migrated onto it), `renderer` (`main.tsx`'s one remaining raw control), `apps/desktop/scripts` (`ui-audit.mjs`, `ui-review.mjs`, `theme-proof.mjs`, `lib/layout-relations.mjs`, `composer-proof.mjs`), `tools` (`check-ui-language.mjs`, `ui-language-debt.mjs`, `ui-language-baseline.json`, `migrate-ui-primitives.mjs`), `.agents/skills/{build-ui,debug-ui,review-ui}` | **OQ-56 — the adopted `--rt-text-disabled` misses REQ-SHELL-145's 3:1 floor on every surface but the page ground in `rotaris-dim`**, and `pnpm theme-proof`'s `contrast` section stays red there until the owner rules between amending the design material and amending the requirement; 163 normalized legacy geometry entries remain as a burn-down baseline (`shell.css` holds 157 of them); the critic is **report-only and opt-in** — it edits evidence files alone and a finding becomes code only when the implementation lead applies it; product-side image transport for the built-in `ui-verifier` persona is a **separate future request** (it reads the textual manifest and the deterministic findings meanwhile); keyboard, pointer and focus BEHAVIOUR of the shared components is proven against the built product and not in vitest, because this repository has no DOM there and a fake one is a second opinion about a document that does not exist; `docs/design/mockup/` is still read for craft and never for structure (`REQ-SHELL-023` governs) |
| ~~portable skill discovery~~ **built 2026-09-15** (ADR-0063 first executed; `pnpm skills-proof`, 8 checks over 7 launches; defects **101** and **102**, the first in the code the feature had to correct to be buildable) | `config` (`skills/`, `sections/skills.ts`, `writers.ts`, `snapshot.ts`, `load.ts`), `contracts` (`skills.ts`, `config.ts`, `commands.ts`, `process-protocol.ts`), `engine` (`withContextUnits`, `RunSetup.contextUnits`, `ChildrenDeps.contextUnits`), `agent-tools` (`files.ts` — the fence per tool), `run-host` (`skills.ts`, `tools.ts`, `index.ts`), `main` (the relay and the chooser), `ui` (`settings/SkillsSettings.tsx`, `slash/skills.ts`, `slash/registry.ts`'s `unregister`, `shell-state.ts`) | REQ-WORKSPACE-051..069, 072, 073, 151 are met. **Three ESCs and two OQs were raised before any code** (ESC-37 the per-prompt payload against the session-long block, ESC-38 five columns against seven, ESC-39 a taken command name skipped against suffixed; OQ-58 whose session "the current session" names, OQ-59 a chooser restricted to a file *or* a directory), each with the reading the build proceeds under. ~~**`/skills`, REQ-CHAT-162's listing command, is NOT built** and says so where it would register (`SKILLS_LISTING_NOT_BUILT`): it writes a saved system row, which only the run host can do and no renderer command reaches; every fact it would carry is in the Settings tab, which that requirement requires anyway.~~ **`/skills` built 2026-09-27** (`first-release-plan.md` §2.2; `pnpm skills-proof` gains two launches — the row drawn, the session reopened, the row still there): the renderer command `skills.list`, main naming the followed session, the run host writing ONE `system` row through that session's writer (`run-host/skills.ts`'s `writeSkillListing`), the row's text fixed once in `contracts/skills.ts` and drawn as the listing by `transcript/Row.tsx`; no store change. Building it found that a skill named `skill` took `/skill <path>`'s name or lost its own depending on effect order (`docs/defects/fixed/a-skill-named-skill-takes-the-skill-command.md`, repaired with it); its gate found the same hole in the prompt-file registrar (`a-prompt-file-named-skills-takes-the-skills-command.md`) and a description's bare URL no longer drawn as a link (REQ-CHAT-076), both repaired before merge; it raised **OQ-67** — the listing's reach from the Settings tab, whose header actions REQ-WORKSPACE-067 fixes at two, and `/skills` from a window following no session. ~~Workspace-context injection (REQ-WORKSPACE-041..050) and persona memory remain unbuilt~~ **injection built 2026-09-22** under `PD-WORKSPACE-002` (`first-executions.md`); persona memory remains unbuilt and is a **named empty slot** in REQ-WORKSPACE-060's ordered unit list rather than a shape a later part must re-cut |
| ~~the retrospective pass~~ **built 2026-09-17** (Part AT; `PD-LIBRARY-002`, ADR-0065 first executed; `pnpm retrospective-proof`, 29 checks over six launches and four scratch profiles; defects **119** — the Proposals tab drawing a BLANK cell where a retrospective's source session would be — and **120**, REQ-LIBRARY-125/126's two activity indicators, specified in Part AF and drawn by nothing until this part; the sibling's own completion notice, wrong in three ways against `REQ-LIBRARY-124`, repaired here as **124**; the wider sweep found **121**, **122** and **123**, three proofs left red on `main` by the changes that moved what they measure, and behind them two the staleness had hidden, recorded and not repaired: **125**, `plan_cycles` has no cascade so a session delete keeps its plan text, and **126**/**127**, the Start session dialog accepting a gesture and creating neither a session nor a reason, on a surface `ui-audit` then measured as fitting no supported window) | `contracts` (`improvements.ts` — `source_kind`, the nullable `source_session_id` under a `superRefine`, `pass` and the `retrospective` sources block; `process-protocol.ts` — `retrospective.capture`; `commands.ts`; `config.ts`), `store` (**v19**: the `improvement_artifacts` rebuild and both indexes recreated with it), `engine` (`improvements/retrospective.ts` beside `capture.ts`, the analyst's second system text and per-entry attribution), `config` (the three keys the directive fixes), `run-host` (`retrospectiveOf`, the capture, `improvement.analyze`'s run-free branch), `main` (`commands/improvements.ts`, the per-gesture no-model notice, the completion notice branching on the pass), `ui` (`ImprovementActivity.tsx`, `AppShell.tsx`, `RunHeader.tsx`, `library/ProposalsTab.tsx`, `OverviewView.tsx`, `commands/registry.ts`, `shell-state.ts`), `renderer` (channel 11's first consumer) | **The lifecycle needed no change to carry a second pass**: the FIFO, the cancel, the shutdown discard, the save, the canonical reread, review, history, the executor, the checkpoints and the rollback are the objects they were, which is ADR-0065 decision 1 measured rather than argued. Owed: nothing of the directive — `REQ-LIBRARY-017`'s fence stands untouched on the per-run pass, and the retrospective's evidence bounds are constants rather than settings on REQ-LIBRARY-165's rule. The pass reads only this workspace's own record and makes no network call a run does not already make |
| the first release, Windows only (R-051, `PD-STARTUP-001`) — **planned 2026-09-25** in [`first-release-plan.md`](first-release-plan.md); **§4.1's version guard built 2026-09-27** (`tools/release-guard`, ADR-0054's first-execution note; the running app now reports the declared version — on the About row, not Electron's, and in every MCP handshake, not a literal); **§4.3 the notices generator built 2026-09-27** (`tools/notices/`, `pnpm notices`; IC-7 discharged, the pipeline's evidence owed; the About page's lowercase lookup repaired; OQ-72, OQ-73, OQ-74 raised, and OQ-75 by its gate review — raised as OQ-66 to OQ-69 and renumbered at the merge); **§4.4 the two bundled assets built 2026-09-27** (`tools/build-id/`, `pnpm build-id`; `package.mjs` runs both steps, `extraResources` carries both, `afterPack`'s "assets" rule; the tool server's dist-info licence left out of the artifact, REQ-STARTUP-015; `ROTARIS_PACKAGE_WITHOUT_NOTICES=1` for a development package); **§4.1's setup manifest built 2026-09-28** (`apps/desktop/resources/setup-manifest.json`, committed; `packages/config/src/setup-manifest.ts`'s schema and its 14 cases; `extraResources` carries it; `pnpm release:guard v0.1.0` exit 0 on both halves; OQ-87 and OQ-88 raised (as OQ-76 and OQ-77 on its branch, renumbered at the merge); its consumer, the machine-setup flow, is not built); **§4.6 the updater built 2026-09-28** (`apps/desktop/src/main/updater/`, ADR-0054's "The updater" note, `pnpm updater-proof`; the compiled-in key set EMPTY until O-2 writes the public half into `updater/keys.ts`, so every install refuses at the signature step until then; the apply and restart steps unit-tested over fakes and owed their run against a real Windows artifact; the restart as ADR-0055's hand-over of the record, `inheritInstance`; OQ-83, OQ-84, OQ-85 raised (as OQ-76 to OQ-78 on its branch, renumbered at the merge); `redirector.gvt1.com` noticed and filed in `../defects/` — repaired 2026-09-28, the cause measured as Electron's spellchecker fetching a Hunspell dictionary rather than the component updater (`main/runtime-requests.ts`; the proof now asserts zero connections; OQ-93 raised); repaired at verification the same day — the classification order under an inherited `APPIMAGE`, the record passed only to a successor a waiting restart started, no re-offer of an installed update, the `.old` cleanup once per launch — and OQ-86 raised; at the second verification a refused record pass now fails the restart, `updater/successor.ts`; the same day the two artifact variables no longer reach the product's children — main's first statement takes them for the classification alone, `platform/artifact-environment.ts`, OQ-90 raised; repaired 2026-09-28, the record passes in two steps — offered, acknowledged within the hand-over interval, then rewritten — so it is never left naming a successor that stopped waiting, ADR-0055 *Amended 2026-09-28*) | `.github/workflows/`, `tools/` (the guards, the ~~notices and~~ body ~~generators~~ generator; `tools/notices/` and `tools/build-id/` landed), `apps/desktop/` (`electron-builder.yml` for the icon, §4.9 — its `extraResources` landed; ~~`resources/`~~; the icon, the portable's stub), `main` (~~the updater~~ `updater/` landed), `run-host` + `ui` (`/skills`); the injection proof: `run-host` (`skills.ts`, `host.ts`, `scripted-client.ts`), `config` (`instructions.ts`, `snapshot.ts`), `workspace-service` (`index.ts`), `apps/desktop/scripts` (`injection-proof.mjs`, `lib/harness.mjs`, `package.mjs`) | the owner's rulings and inputs in the plan's §6 — **O-3's address in `tools/notices/release-inputs.json`, and O-11's twelve reviewed exceptions, before notices validation can pass — until then `pnpm package` refuses**; OQ-74's ruling for `dotenv` 0.9.9; ~~`/skills` (REQ-CHAT-162)~~ **built 2026-09-27**, OQ-67 open against it; ~~REQ-WORKSPACE-049's bound and an injection proof~~ **built 2026-09-27** (`pnpm injection-proof`; the bound met on Linux at p95 20.29 ms, **the Windows gate-class reading still owed**; OQ-68 raised; ~~the skill search's `/etc/codex/skills` still unisolated in three proofs and REQ-WORKSPACE-045's decoding half unmet~~ **both repaired 2026-09-28** (R-062: `SkillRootsEnv.machineDir` under the one machine-wide directory, `ROTARIS_CAPTURE_SKILLS_MACHINE`; a fatal `TextDecoder` at `NODE_DISCOVERY_PORTS.readFile`; OQ-79 raised; the two notes in `docs/defects/fixed/`)); the pipeline and gate of its §4–§5 ~~, the notices step's wiring into `package.mjs` and `extraResources` among them (§4.4)~~ (wired 2026-09-27), and the "assets" rule's first run against a real `win-unpacked` (the next Windows package); the bundled interpreter's linked libraries, which the notices file does not list (OQ-72). ~~**The setup manifest of REQ-STARTUP-058 is owed and was scheduled nowhere.** Until it exists at `apps/desktop/resources/setup-manifest.json`, the guard's pin half fails every tag, and §4.3's notices section has no source to be generated from.~~ **Built 2026-09-28**: the manifest exists and is packed, and the guard passes; ~~the notices generator still reads `pins.json` rather than it, so its file says the manifest pins no machine tools, which is now false (OQ-73 decides whose reader follows)~~ **repaired 2026-09-28** (R-062; `../defects/fixed/the-notices-file-says-the-setup-manifest-pins-no-machine-tools.md`): the generator reads the shipped manifest in its schema's shape and lists Git and ripgrep, saying machine setup is not yet in the build (OQ-73's reading), then the tool-server packages (REQ-STARTUP-152; OQ-92); the flow that consumes the manifest — machine setup, REQ-STARTUP-060 onward, REQ-MCP-112's setup half, REQ-STARTUP-061's fingerprint — is not built and not in this plan. ~~The prerelease naming repair is owed too~~ **repaired 2026-09-28** (R-062; `apps/desktop/scripts/lib/artifact-names.mjs`, `package.mjs` writing `release/electron-builder.package.yml`, `build-hooks.cjs`'s `checkNaming` over the declared text and its `artifactBuildCompleted` hook; `../defects/fixed/a-prerelease-version-reaches-the-installer-hyphenated.md`; OQ-80 raised on the installer's own metadata; the Windows package that shows it still owed, IC-3). OQ-69, OQ-70 and OQ-71 are open (raised as OQ-66 to OQ-69, renumbered at the merge) |
| macOS / Linux artifacts | `electron-builder.yml`, `platform/src/instance.ts` | IC-3; kept out of releases by `PD-STARTUP-001` until it is withdrawn |
