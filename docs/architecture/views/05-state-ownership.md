# State ownership — which process owns a fact, and where it lives

Six homes. A fact lives in exactly one of them, and the process that owns it is the only one that writes it.
This view exists because the facts were true but scattered — across the process view's ownership table, the
runtime view's store and configuration sections, and the preference rules stated inline in a command list —
and "who owns this?" is the question a change asks first.

The short rule, which the rest of this file only makes precise:

```
UI state        → the renderer that draws it
process state   → the process that holds the resource
business state  → the workspace store
source state    → the filesystem and Git
credentials     → main, and main alone
```

## Volatile — lost when the process ends

| Fact | Owner | Where | Who may write it |
|---|---|---|---|
| The replica — one session's rows and record, mirrored | renderer (per window) | `packages/ui/src/…`, fed by channels 1 and 2 | the channel's publisher, never the surface |
| View, guards, expansion maps, context menus, the acknowledgement stack | renderer | `packages/ui/src/shell-state.ts` and each surface | that renderer only |
| Settings pending state (unsaved edits) | renderer | the Settings surface | that renderer; the close guard reads it |
| An optimistic cancel of one agent, from the confirmation to the engine's next record (REQ-MONITOR-128/296, OQ-128) | renderer (per window) | `packages/ui/src/cancel-overlay.ts`, the window's store in `apps/desktop/src/renderer/shell.ts` (`cancelOverlays`) | that window's `cancelAgent` only: `begin` before the op is sent, `refuse` on a refusal, `accept` on an acceptance. It is laid over the replica's record where the Workspace, Mission, Overview and persona roots read the session (`useShownSession`, `useCancelOverlaid`) and is never written into the replica, whose two writers stay the channel's |
| Window registry, keyed by `webContents` id; focus order | main | `apps/desktop/src/main/main-windows.ts` | main |
| Approval dialog queue, per window | main | `main/index.ts` | main; the run host asks, main presents |
| The single current notice, and its serialised chain | main | `main/notices.ts` | main |
| The held update offer, the one update operation in flight, and the notice the offer lives in (its id) — the updater, 2026-09-28 | main | `main/updater/updater.ts` | main; a renderer's `update.install`/`update.restart` names nothing, and a second operation while one runs is refused (REQ-STARTUP-114) |
| The installation flavour and the update target (REQ-STARTUP-106) | main | `main/updater/classify.ts`, decided once at start from the artifact the launch started from | nobody after start: it is stable across launches of one installation and takes no user input |
| The application log's threshold (`PD-MONITOR-002`) | main | `main/index.ts`, over `main/app-log.ts` | nobody: read once from `ROTARIS_APP_LOG_LEVEL` when main starts; no command, key or setting reaches it |
| The improvement queue, the one active job and **which pass it is** (`post_run` / `retrospective`, Part AT — `PD-LIBRARY-002`) | main | `main/improvements.ts` | main; the run host analyses the job it is handed and owns no queue, and a retrospective is an ordinary member of the same FIFO |
| The improvement activity a surface draws (`active`, `pass`) | renderer (per window) | `packages/ui/src/shell-state.ts` — `improvementAnalysis` | channel 11's publisher only; the two indicators (REQ-LIBRARY-125/126) read it and never set it |
| Credential leases handed out for a run | main | `packages/providers` | main |
| Session locks this instance holds | run host | `packages/engine/src/sessions.ts` | run host — a run, released at its teardown; `resume` when a session is loaded; a continue (`prompt`, `continueSession`, `planDecision`) before its first write, held by the run it launches and given back when it launches none (`holdForContinue`, ADR-0005, R-067); and `cancelPausedAtRest` for its write while the session rests, taken and given back, a dead local holder reaped by the same `claimLockReaping` as `SessionWriter.open` (`lockForWrite`, PD-ORCH-005 clause 16, OQ-101); they end with the application because main is gone only after the run host (`endBeforeMain`, `main/exit.ts`) — a lock a run host ended at quit leaves names a dead pid and is reaped on the next claim (REQ-SESSION-047) |
| Live runs, writers, projection owners | run host | `engine/sessions.ts`, `session-writer.ts` | run host |
| The tool gate, per session; hooks, per run | run host | `packages/agent-tools`, `packages/hooks` | run host |
| Live write-scope claims and each child's scope disclosure (PD-TOOLS-006) | run host | `packages/engine/src/children/write-scope.ts`, held by the iteration's `IterationChildren` | `IterationChildren.delegate` only; the claim belongs to one run and is never persisted, so a continued session starts with none — the declared patterns are stored with the child's record (`children.write_scope`, PD-TOOLS-006 revision 2), from which a resumed child claims again |
| A child's inherited-context block — the completed siblings' reports its `delegate` call named, rendered at the call (REQ-TOOLS-152, REQ-TOOLS-154 item (5)) | run host | `packages/engine/src/children/orchestration.ts` (`IterationChildren.inherited`), beside the attachment list | `IterationChildren.delegate` only, read once by `execute` for the payload; never persisted — the ids are on `children.inherited_context`, which of them counted is not |
| A child's sibling-index suppression — its `delegate` call's `suppress_auto_context` (REQ-TOOLS-152, REQ-TOOLS-154 item (3)) | run host | the store (`children.suppress_auto_context`, v25) | `ChildLedger.spawn` only, at the call; read by `IterationChildren.artifactContext` at every payload assembly, a retry's and a resumed child's included — persisted, unlike the inherited-context block. The role's `skip_auto_sibling_context` (REQ-CONFIG-107) is configuration, read at each assembly and never copied onto the row |
| The run coming to rest — its cause (`restCause`), the pause's tool deadline, the held scheduler, each child execution's own abort (PD-ORCH-005) | run host | `packages/engine/src/run/run.ts`, `children/orchestration.ts`, `children/scheduler.ts` | the run only: `pause()`, the stop listener, `cancelAgent`; never persisted — what outlives a rest is each agent's `paused` row, the iteration's interruption and the conversation record |
| Which agent started each background terminal session (PD-ORCH-005 clause 10) | run host | `BackgroundSession.owner` in `packages/agent-tools/src/terminal/background.ts` | the terminal tool at the session's start, from the port that agent was built with (`run-host/tools.ts`); persisted as `agent_terminals` below |
| A child's progress log — when its last tool call completed, the workspace paths it changed (PD-ORCH-004) | run host | `packages/engine/src/children/cut-off.ts` (`ProgressLog`), one per child execution in `IterationChildren.execute` | that child's own turn only (`onToolCompleted`); never persisted — what outlives it is the report's `cut_off` and the continuation's `children.continuation_of` |
| The run's away mark — the user treated as away after an approval wait expired unanswered, with the timeout in seconds (PD-TOOLS-005) | run host | `packages/engine/src/run/presence.ts` (`UserPresence`), one per run on `Sessions`' `Live.presence` and every agent's `ToolPortContext.presence`, a delegated child's included | set only by the gate's timeout arm (`markAway`, through `GateDeps.presence`); cleared only by `Sessions`' input arms (`returned` — `control`'s common line and its `clearTranscript` branch, `controlAsync`'s `forceCompression`, the id-routed answers); never persisted — the next run installs a fresh holder, so no run starts away |
| Configuration resolved for a run (Tier B) | run host | `run-host/configuration.ts` | resolved at run start; never re-read mid-run |
| The portable-skill catalog | run host | `run-host/skills.ts` | cleared at **session** creation, not per run |
| MCP connections and their stdio children | run host | `run-host/mcp.ts` | run host, per session |
| Live terminal streams and their emulators | run host | `run-host/terminal.ts` | run host; frames go out on channel 3 |
| The workspace identifier; the open store handle | workspace service | `workspace-service/index.ts` | one service per open workspace |
| The board projection, frozen per generation | workspace service | `workspace-service/delivery.ts` | the service's one transaction |

## Durable — survives the application

| Fact | Home | Written by | Read by |
|---|---|---|---|
| Sessions, runs, agents, timeline, checkpoints, artifacts, delivery, requirements | `workspace.db` (SQLite, WAL) under `%LOCALAPPDATA%/rotaris/data/workspaces/<id>/` | the run host through the session writer; the workspace service for delivery, Git and checkpoints | both children; **never main** |
| Every agent's conversation record, and each execution iteration with its root's task id (`PD-ORCH-005` clause 1; `agent_messages`, `iterations`) | `workspace.db`, beside the session it belongs to, and deleted with it | the run host, by the agent's own `Conversation` as it changes (`run/record.ts`'s recorder → `SessionWriter.recordAgentMessage`), by `Sessions.launchContinuation` for what a continue tells a resumed root — its background sessions' notice, the open continuation offers (PD-ORCH-004 revision 3) and the message it delivers (clause 4) — while a fresh execution root's first message, recorded by its own recorder, carries the offers its launch content does not (PD-ORCH-004 revision 4), and the run at an iteration's begin and close (`openIteration`, `endIteration`); the transcript clear deletes closed iterations' entries | **the resume**: a continue loads each resumed agent's conversation from it (`ConversationRecord.load`, from the last replacement forward) and the open row's root; the projection, which reads the open row for the Continue action's count (`resumableOf`, clause 6); the crash record (`run/crash.ts`), which answers a dead run's unanswered calls; the run that declines an open iteration |
| The session's tool-call total and the per-agent counts that hold it (REQ-MONITOR-102; `sessions.tool_calls`, `children.tool_calls`, `iterations.root_tool_calls` — v26) | `workspace.db` | the run host only, through `SessionWriter.countToolCalls`, which writes the total with the agent's count in one transaction: the run when the root's turn returns and when the stop's grace gives up on it (from its record), a child's execution when it resumes (the calls its record holds beyond its count) and when it settles or rests (REQ-ORCH-097's cadence — OQ-116 asks about the lag during a pass); the crash record at a repair or a continue, which adds what a dead run's root and unfinished children's records hold beyond their counts (the repair of `a-roots-calls-before-a-crash-never-reach-the-session-total.md`). Every save copies the run's aggregate total over it | the whole-session update (`SessionRecord.toolCalls.total`), whose displayed total is the persisted one; the agents panel, which derives the root's figure as the total less the children's |
| The fingerprint of the instructions and tools each agent started with (`PD-ORCH-005` revision 4 clause 14; `agent_fingerprints`) | `workspace.db`, beside the agent's conversation record, and deleted with its session | the run host only: `ConversationRecord.fingerprint` → `SessionWriter.recordAgentFingerprint` at an execution's first model step, once — never replaced; the transcript clear deletes closed iterations' rows | the same check at a resumed execution's first step, which compares and states a changed one as a `resumed_under_changed_instructions` warning issue and a transcript `system` row |
| Each agent's rest — `children.interruption`, `children.resume_state`; the open iteration's `iterations.interruption`; each background session's end (`agent_terminals`) (`PD-ORCH-005` clauses 2, 3 and 10) | `workspace.db` | the run host only: the run at a rest (`restChild`, `recordIterationInterruption`, `restTerminals`), the terminal attribution at a session's start and self-end, `Sessions.closeAll` at a quit, and the crash record at a repair or a continue — **never at a load** (clause 8), nor at the at-rest cancel; `cancelPausedAtRest` moves the child and its `paused` descendants `paused` → `cancelled` (`children.state`), the rest columns kept (PD-ORCH-005 clause 16), and a crash-left one from the state it is stored in, its calls the crash cut off answered, writing no crash record (clauses 3 and 8, OQ-101) | the projection (`toAgentRecord`'s `interruption` and its `paused` presentation, clause 13, with `crashLeftOf` naming what a crash not yet recorded left, OQ-100; `resumableOf` → `SessionRecord.resumable`, the Continue action's count, clause 6); the resume, which moves each paused agent back (`resumeChild`, clearing both columns) and tells it of its background sessions (clause 10); the run that declines the iteration; the at-rest cancel (`cancelPausedAtRest`), which reads `crashLeftOf` and the rest columns to choose what it cancels |
| Session artifact bodies | files beside the session's other files | the run host | the run host, the Library |
| `agents.yaml`, `models.yml` — global (`%LOCALAPPDATA%/rotaris/config/`) and per workspace (`<ws>/.rotaris/`) | the filesystem | **the workspace service only** | the run host at every run start |
| `project_settings.yaml` — the discovery snapshot, configuration layer 3 | `%LOCALAPPDATA%/rotaris/config/` | main (upsert, remove) and the workspace service | the run host at every load |
| `preferences.json` | `ROTARIS_PREFERENCES_ROOT` → config home → per-user | **main only** | main; renderers reach the allow-listed subset through `prefs.get/set` |
| The waved-off update version — `updates/dismissedVersion`, one string, never a list (REQ-STARTUP-116/117/146) | `preferences.json` | **main only**, when the update-offer notice is dismissed and before it is cleared | main, at every check; no renderer (absent from the allow-list) |
| The compiled-in release-verification key set (REQ-STARTUP-167/168) | `main/updater/keys.ts`, in main's bundle — empty until O-2 | **the build**, and only the build: nothing at run time adds to, replaces or disables it | main, at every install |
| `tokens/<provider_id>.json` (+ `.lock`), owner and SYSTEM only | `%LOCALAPPDATA%/rotaris/data/` | **main only**, under the adjacent lock | main; the run host is **leased bearers**, never the file |
| The instance record and the machine id | `%LOCALAPPDATA%/rotaris/data/` | main, at the claim; and the holder, rewriting it with a successor's fields, only while a restart it started waits for that successor (`acceptSuccessor`, REQ-STARTUP-121/161 — an unsolicited announcement is refused and the record left as it is; an accepted one the record cannot be passed to leaves it as it is too and fails the waiting restart, `onRecordPassFailed`) | main |
| The initialization marker | the workspace | the workspace service | main's coordinator; read outside the layered merge |
| Source, tests, branches, worktrees | the workspace and its Git repository | agents through tools; **every `git` invocation is the workspace service's** | everyone, through their owner |

## The rules that make the table hold

- **Main never opens the workspace store and never writes a session** (W-01). It is the window, dialog,
  notice, preference, theme and credential process, and nothing else durable.
- **Only the workspace service migrates the store** (W-02), and only it spawns Git. The run host asks main,
  which asks the service.
- **The run host never writes a configuration file** and never reads `tokens/`. It receives leases.
- **A renderer owns nothing durable.** It touches no file, no store and no credential, and it does not even
  navigate — a link asks main (`shell.openExternal`).
- **A per-workspace preference key is minted by main** from the workspace that window opened, so a window
  cannot name another window's state. The renderer sends a literal placeholder or nothing.
- **A fact with two homes is a defect**, not a cache. Where one is needed anyway — the replica, the board
  projection, the skill catalog — the copy is derived, has one publisher, and is thrown away rather than
  reconciled.

Configuration's three tiers, and where each layer comes from, stay in
[`03-runtime-view.md` §8](03-runtime-view.md); the store's table-by-table detail stays in its §7. This view
carries ownership only.
