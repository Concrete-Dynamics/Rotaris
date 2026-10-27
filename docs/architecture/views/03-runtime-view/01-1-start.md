# Runtime view — a run from prompt to terminal result, and everything that reaches into it — 1. Start

Part 1 of 16 of [the runtime view](../03-runtime-view.md), which indexes every part.

## 1. Start

```mermaid
sequenceDiagram
  participant W as renderer (composer)
  participant M as main
  participant RH as run host (Sessions)
  participant CFG as config (loadConfiguration)
  participant WR as SessionWriter
  participant DB as workspace.db
  participant WS as workspace service (Git)

  W->>M: command session.start {prompt, isolation? {branch}, attach? {path}, sandboxMode?} — the launch dialog's choices ride the composer's next submission (REQ-SHELL-125)
  opt isolation or attach (Part O, REQ-GIT-022)
    M->>WS: (isolation only) config.read — the resolved view's loadOk and worktreeStorageSubpath (REQ-GIT-073); a view that did not load refuses the start here, `session.configuration` with the load's report, before anything is created (REQ-GIT-071/138)
    M->>WS: worktree.create {target: session {sessionId: the id session.newId minted, subpath: worktreeStorageSubpath}} — collision-safe, under <ws>/.rotaris/<subpath>/<sid> (default worktrees) — or worktree.checkAttach {path}
    WS-->>M: worktree.created {path, branch, baseBranch, baseRevision} | worktree.attachable | refused → "Error: could not create or attach the requested worktree: <detail>"; NO session exists (REQ-GIT-023 by construction)
  end
  M->>RH: session.start {workspaceId, prompt, sessionId?, effectiveRoot?, worktree?, sandboxMode?, boardPermissions?}
  RH->>RH: settleConfinement() — ADR-0022's probe, awaited BEFORE the run does anything else (REQ-SANDBOX-097); one per process, cached, bounded at 5.0 s, cleared only by the settings re-check (REQ-SANDBOX-067, -129). On win32 the platform check settles it and no subprocess is spawned (REQ-SANDBOX-066)
  RH->>CFG: configure(workspaceRoot): load the snapshot (layer 3) and both scopes' four files, overlay live state (Tier B), resolve — from the BASE workspace even for an isolated run (REQ-GIT-019)
  CFG->>CFG: the confinement gate — the effective mode is the layered key with the dialog's override folded in (REQ-SANDBOX-122); a non-off mode whose verdict is not `available` REFUSES here, before the lease, before the session row and before the lock, so nothing is left to clean up (REQ-SANDBOX-094/095)
  CFG-->>RH: RunSetup {model, runtime, personas, models, authProviders, tier} — or a fatal report / no entry model / the availability reason and remediation
  alt refused before it starts (REQ-EVENTS-021, REQ-EVENTS-024, REQ-CONFIG-478, REQ-SANDBOX-126, REQ-WORKSPACE-137 "No model configured")
    RH-->>M: refused {code, headline, detail} — `session.confinement` when the confinement gate refused (REQ-NOTIFY-060's second class)
    M-->>W: {ok:false} and a notice; nothing was recorded. A `session.confinement` refusal's notice is REQ-NOTIFY-061's (`confinementRefusalNotice`): the wording as received in its message and its copyable detail, one action opening the Workspace view, no retry — for a prompt or a continue the engine refuses at the same gate too
  else
    RH->>M: ask credentials.lease {providerIds} (ADR-0030; REQ-PROVIDER-066/067)
    M-->>RH: credentials.leased {bearers, report} — read per request by the resolver OF THE MODEL each call goes to (credentialFor; Part L); an unleased slot is skipped
    RH->>RH: complete the captured configuration with this launch's lease; Sessions.start consumes its prepared RunSetup
    alt the entry model's auth_provider is unresolved (REQ-WORKSPACE-137 "Provider authentication required")
      RH-->>M: refused; nothing was recorded
    end
    RH->>WR: SessionWriter.create — session row (with the worktree binding as JSON and the sandbox mode, v8) + lock row (INSERT OR IGNORE) in one transaction; the run's EFFECTIVE root (the tool fence, the terminal's and the hooks' cwd, the child payload's root) is the worktree path, the record stays anchored to the base (REQ-GIT-019)
    RH->>WR: appendRow('user', prompt) — row 0 and its transcript.row event
    RH->>RH: settleStaleChildren (REQ-ORCH-053; each child's open calls answered and its calls counted first, recordCutChild, REQ-MONITOR-102 / REQ-SESSION-129; each report materialised as an artifact, REQ-LIBRARY-092; each torn down, REQ-ORCH-098), SupervisorRegistry, hooks resolved once (ADR-0015)
    RH->>RH: new Run(...) then run.start()
    RH-->>M: session.started {sessionId}
    M-->>W: {ok:true}; the window subscribes → attach → snapshot then the resident rows (REQ-MONITOR-214)
  end
```

**What an agent's system prompt is made of (ADR-0063).** At every agent construction — the entry turn and each
child — the role's instructions (for the entry turn, fitted first to the grant the iteration runs under,
`Run.preflightInEffect` — a resumed iteration's carried grant, `PD-ORCH-005` clause 40: a coordinator granted the direct-work
bundle is told to do the work itself, `entryInstructionsFor`, OQ-202 as ruled, `PD-ORCH-006`; a turn the plan gate holds
keeps the persona's prompt) take its playbook (`withPlaybook`, REQ-ORCH-019; the entry turn the entry role's form,
`Preflight.playbookFor(persona, true)`, whose ROUTE slot is the catalogue's `entry` variant where its row resolves `routed`,
`entryCell`, while a delegated child of the same role reads `routed` — since 2026-10-06, K3 of the default live run at
`c2fdd6a`; the launch audit records the entry role's cell in that form — the entry role being the persona the root runs on, `PreflightDeps.entryRole` from `run.model.config.persona`, which also names the BUDGET row; an entry persona with no row clamps nothing) and then the session's
**always-active context units** (`withContextUnits`, REQ-WORKSPACE-060), in that requirement's order: workspace
context → the skill catalog → the force-loaded skill bodies → persona memory. **One of the four is not built**
(persona memory) and is an empty slot in the list rather than a shape a later part must re-cut.
Workspace-context injection (REQ-WORKSPACE-041..048, narrowed and extended by `PD-WORKSPACE-002`) fills the
first: `SkillHost.workspaceContext` calls **`SkillHost.instructionFiles`**, which reads the master switch
`inject_agents_md` and the per-file `instructions.overrides` policy from the **saved** configuration and
discovers the present instruction files over the workspace root and the five further bases; the context then
merges the enabled set into one block
(`mergeInstructionContext` — a source comment per file, one blank line between blocks, both size limits) and
caches it for as long as the session lasts (REQ-WORKSPACE-046), cleared by session creation and by a rescan, the
two events that already clear the catalog. `contextUnits` pushes that block as the first unit through
`instructionContextUnit`, which adds one blank line and `INSTRUCTION_FILES_END_COMMENT` after the last file, outside
the merged output and its total limit. Each file therefore runs from its source comment to the next source comment or to
that line, and whatever follows is not read as the last file's own: the skill catalog, or `runTurn`'s MCP section
(`withMcpSection`, REQ-MCP-101), which is appended after them. Until 2026-10-06 nothing closed the files, and in the duress
live run at `27a5127` agents read `## MCP servers` as part of `AGENTS.md`
(`docs/defects/fixed/nothing-marks-where-the-last-instruction-file-ends-so-agents-read-the-mcp-section-as-part-of-it.md`).
The always-active units are five since `PD-TOOLS-012` revision 2 (OQ-230): after REQ-WORKSPACE-060's four (workspace context,
skill catalog, force-loaded bodies, the persona-memory slot), `contextUnits` pushes `PRODUCT_DIRECTORIES_UNIT`
(`config/src/product-directories.ts`) on every call — with no instruction file, no skill and injection off too — so the entry
agent and every child, whatever its persona's prompt, is told that `.rotaris/` and the code-intelligence marker directory are
the product's, how they are kept out of version control, that the file tools hide them and a terminal shows them, and to keep
them out of what it writes. The engine is unchanged: `withContextUnits` appends the units after the persona's prompt in
`Run.turn` and in a child's construction (`orchestration.ts`), before the MCP section.

**The run override is the last thing an entry turn's prompt carries (REQ-ORCH-025).** After the MCP section `runTurn`
appends the run override's layer (`withRunOverrideLayer`, `run/turn.ts`, from `TurnDeps.runOverrideLayer`), which `Run`
builds for the entry turn with `runOverrideLayer` (`children/personas.ts`) from `RunDeps.runOverride`, itself
`RuntimePosture.runOverride` handed over by `Sessions` at the launch and at a continuation alike. Only `swarm` renders one:
`SWARM_INSTRUCTION`, under its own heading ``## Run override: `swarm` ``, demands maximum parallel delegation and says it takes
precedence over the playbook's CHUNKING and BUDGET guidance where they differ, within the child limits the run enforces;
while the plan gate holds the run (REQ-ORCH-153) `SWARM_PLAN_HELD_NOTE` points it at the plan. None under `single`, a capability
change; none for an entry role that declares no `delegate`; and none on a run the mapping in force grants the direct-work
bundle, on any turn, the held one and a continuation included (`PD-ORCH-006` revision 3, OQ-205 as ruled, R-072). Until finacc3's repair round 1 (2026-10-06) the layer was appended in `Run` after the playbook but before the
context units and the MCP section, and carried no precedence sentence: "the final layer" in name only.

**The cold path is timed, and it runs after first input.** `workspaceContext` reads the monotonic clock port four
times on a cache miss: before the saved-policy read, after it, after the discovery and after the merge. It then logs
one line, `workspace context: the enabled set of N instruction file(s) merged into B bytes in T ms (policy read …,
discovery …, merge …)`. That line is REQ-WORKSPACE-049's figure as the built app reports it, and `injection-proof`
reads it back. The policy read counts towards the figure because `PD-WORKSPACE-002` made the per-file policy part of
deciding what is merged. Nothing warms the merge at workspace open, as the catalog is warmed. The first read happens
at the first agent built for a session, in the run host, after the typed prompt has been recorded as row 0. It
therefore cannot delay the window's first input, and it never runs in the window's process. The first measurement
(2026-09-27, Linux) is in `first-release-plan.md` §3.2. The machine-wide directory is injectable
(`SkillHostDeps.machineDir`, `/etc/codex` when absent) and, since 2026-09-28, moves both discoveries at once: the
instruction base is the directory itself and REQ-WORKSPACE-051's fourth user-scope skill root is its `skills` child
(`SkillRootsEnv.machineDir`, `machineCodexDir` in `config/src/skills/roots.ts`, the one place the literal lives). It is
a verification seam in the built app (`ROTARIS_CAPTURE_SKILLS_MACHINE ?? ROTARIS_CAPTURE_INSTRUCTIONS_MACHINE`, compiled
out of a packaged build) and never widens the platform rule. The port every read goes through
(`NODE_DISCOVERY_PORTS.readFile`) decodes strictly since the same day: a file that is not UTF-8 throws, and the throw
reaches the arm each walk already had for an unreadable file — REQ-WORKSPACE-045's warning naming the path and the
error for an instruction file, REQ-WORKSPACE-053's skip with a reason for a `SKILL.md` (OQ-79), REQ-WORKSPACE-062's
"no block" for a force-loaded body, the disable manifest's unreadable arm, and REQ-WORKSPACE-057's "SKILL.md not found"
with the decoder's reason for a `SKILL.md` loaded by hand (`loadManualSkill`) — where the lenient decode had merged
replacement characters with no warning.

**The set is decided in one place because it has two readers.** `instructionFiles` is a method rather than a
step inside the context because the retrospective consumes the same list (`PD-LIBRARY-002` over
REQ-WORKSPACE-041). It used to hold its own copy of the rule — two names at the workspace root, no policy —
so it read files the user had switched off and could propose edits to them; the run host now computes the
set once and hands it to the engine, which owns no policy of its own. Whether a switch stated over what
agents are *given* binds an *analysis* is **OQ-65**, ruled that it does. Of that one set the retrospective is handed only
the files discovered at the workspace root (`retrospectiveInstructionFiles`, keyed on the `workspace:` id prefix):
`PD-LIBRARY-002` revision 2 keeps the global, home-relative and machine-wide bases out of the analysis while injection
still gives them to every agent (OQ-235). **`REQ-WORKSPACE-050` is met on both halves:** the instruction files
are read from the root the run **executes** in — the worktree of an isolated session — while the skill catalog
and the policy stay with the **base** workspace, so persistent workspace metadata stays with the base. The
execution root reaches the run host through `configure`'s context (`Sessions.setupFor`, from the start
argument's binding or, for a continuation, from the stored one), and the merge is cached per base root **and**
per execution root, so two sessions on one base with different trees never answer for each other. The per-file
switches are untouched by this: they key on a stable identity (`workspace:AGENTS.md`), not on a path.
The units arrive as a **getter**, called at construction and never
captured, so a skill invoked between prompts reaches the next agent built while one already running keeps the
context it was built with (REQ-CONFIG-166). Because the list is a property of the session and not of the role,
REQ-WORKSPACE-065's "every agent built for a session sees the same catalog" holds by construction.

`Run.start()` in order (REQ-SESSION-087): save `starting` → the pre-flight, during which the record's intent status
reads `classifying` (`Run.intentClassifying`, REQ-ORCH-014, a continuation's included, since 2026-10-01) (intent classification through the
small slot's rung ladder; the grant; the playbooks; the BUDGET cell — since 2026-10-06, OQ-162 as ruled by `PD-ORCH-005`
revision 7 clause 40, the Continue action and a message-limit resolution hand the pre-flight the intent in effect,
`PreflightContext.intent`, and it classifies nothing, so the status never reads `classifying` for it, `RunDeps.preflightCarries`; a continue by message that resumes an open iteration also runs the
resumed iteration's carried pre-flight, `RunDeps.resumedPreflight`, and `Run.preflightInEffect` is what the ports, the
entry turn's grant-fitted instructions, the playbooks and the clamp read until that iteration closes, when `nextIntentInEffect` records the message's classification as
a further `run_continuation_intent` entry with its row) → **the plan gate's hold settled** (on the run's own pre-flight) → the
launch audit (once per session, REQ-SESSION-138; a continuation's run records its payload as a
`run_continuation_intent` timeline entry instead, and the record's intent status, REQ-ORCH-014, reads the newest of
those, else the launch audit — `intentPayloadOf`, since 2026-10-01; OQ-162 — which is also REQ-ORCH-013's prior intent since
2026-10-06; a resumed iteration's entry carries the request's classification beside it as `next_run_intent`) → `run_start` timeline entry → hook trust announced → the
effective permission posture (PD-TOOLS-002: the requested mode, never a downgrade row) → save `running`, which writes `run_started_at` as the instant of the `starting` save, so the run's duration (REQ-CHAT-158's frozen header value, the inspector's run-level row, the session list's duration label) counts the pre-flight for a continuation as for a launch (since 2026-10-06; live-run finding G8) → `session_start` hooks → **the plan cycle
if the gate holds**, otherwise the loop — for a run that resumes an open iteration, the loop, holding before its
first new iteration if the gate would hold (PD-ORCH-003 revision 2).

**The plan gate (Part; ADR-0062, REQ-ORCH-152/153/154, PD-ORCH-003).** In `plan` mode a run whose classified
intent is outside REQ-ORCH-021's answer group **and whose session holds no approved release** is a sequence of
**run segments**: one or more plan cycles, then one execution segment. The release clause is PD-ORCH-003's — an
approval reaches the session, so every run after it in that session goes straight to execution until the user
re-arms the gate (`session.planRearm`, sent by the composer's run-start chip) or starts a new session. The hold is settled once, after the pre-flight and before anything it withholds, and never cleared in
place — so a segment's grants are constant and the model's listing and callable set stay one resolution
(REQ-TOOLS-010). **A run that resumes an open iteration (PD-ORCH-003 revision 2; OQ-104)** runs that iteration unheld,
whatever the mode and the release; when the gate would hold the run, the loop holds once the resumed iteration has
closed and the stop conditions found work left — after the pause, the stop and the message limit have had their say,
and before the first new iteration — and parks there (`parkAtPlanGate(resumed)`), its plan cycle told the tasks still
pending ahead of the launch content (`resumedWorkSection`), which it is told the resumed iteration carried out only
when that iteration closed the continue's message as done (`done`, `pending` or `none`: PD-ORCH-005 clause 17). The
launch content after it is the payload the continue built before that iteration ran, so its handoff predates the close
(OQ-104, "The handoff after the preamble is the continue's", which the repair of
`every-iteration-is-sent-the-prompt-the-run-was-launched-with.md` left as it reads). A message-limit pause that wins there leaves
nothing open and the continue's message `complete`, and its resolution appends that message again, as the Continue
action does on the other routes to that state (OQ-103). A plan
decision relaunches with `RunDeps.appendsTask: false`:
the held run's stored todo already carries the gated work, and the last user row is not a new task. A held segment takes **one turn of the entry role** through the ordinary `turn()` path, numbered
**iteration 0** (`root:0`) because a plan cycle is not an iteration, and then `parkAtPlanGate()` mirrors
`pauseAtLimit` exactly: status `awaiting_plan_decision` with the cycle, the cycle's row written in the same
durable transaction with a `plan_gate_opened` entry, **no terminal pair**, and an EMPTY stop reason
(REQ-MONITOR-301's set names no hold). The turn's report text IS the plan, verbatim — and the turn is TOLD so: `planRequestSection` (`run/plan-text.ts`, beside the `planSection` a decided cycle is handed back) prefixes both the task string and the initial content parts, because an initial turn built from `taskContent` never reads the string. Before 2026-09-16 the first cycle's turn received the user's bare prompt and read it as work to do. Both sections name the **product** as their speaker: they are delivered inside a `role: 'user'` payload, and `planSection` opened "The user approved this plan" until the same date — a user-role turn narrating the user. A held segment's turn also carries **no loop supervisor** (`PD-ORCH-001`, which narrows REQ-ORCH-099 and REQ-ORCH-101): `Run` attaches the supervisor per turn, and while the hold stands it attaches none. A run whose write and execute tools are withheld can only grep and read, which is REQ-ORCH-101's repetition trigger read literally; the corrective it injects is an unmarked `role: 'user'` message, so the run reads a user instruction no user gave while waiting for the decision of the actual user. Supervision attaches again on the first turn after the gate resolves, and the classifier keeps no state across the hold.

**What the reader sees while it holds (PD-ORCH-002 revision 2, 2026-09-17).** The gate is its own row of the
workspace grid, above the transcript, in two states the reader moves between in one action: **expanded**, the
state a gate opens in and the state a further cycle returns it to, where the gate's row takes the free space,
the transcript's row is zero and `.transcript` is not drawn at all; and **collapsed**, where the gate is a bar
in an `auto` row and the transcript reads under REQ-CHAT-010's own floor. `WorkspaceView` owns the state — the
GRID is what changes with it, published as `data-plan-gate-collapsed` beside `data-plan-gate` — and `PlanGate`
draws REQ-ORCH-153's three answers in **both** states, so no state and no window size can put the decision out
of reach. Revision 1 gave the transcript a floor of 220 px and capped the gate instead; the owner's capture of
2026-09-17 showed what that costs at the window the product is used at, and the CSS keeps the falsified reason
beside its replacement. Inside the expanded gate the plan's own text is the only part that grows (`flex: 1 1 auto`), and
it has a floor above the implied todo's cap (72 px in preview; in edit mode the adopted `textarea.input` rule's 80 px,
which outranks the field's class), raised in both modes to 112 px while the revision field is open, above that field at
its default height (102 px). Every other part keeps its content height (PD-ORCH-002 revision 2). When the row is
shorter than the gate's parts, as at REQ-SHELL-022's minimum with a persistent notice on screen, the plan stands at its
floor and the gate scrolls with its three answers pinned to its floor. Until 2026-10-06 the plan alone took the loss:
41 px beside the todo's 56 under a 97 px notice
(`docs/defects/fixed/the-expanded-plan-gate-gives-the-whole-loss-to-the-plan-when-a-notice-shares-the-window.md`).
Since 2026-10-07 every part but the plan is bounded below its floor (PD-ORCH-002 revision 3, OQ-204 ruled under R-072): a
later cycle's "You asked for" line (`.plan-gate__prior`) takes the todo's cap, scrolls inside itself and wraps an unbroken
run, so the plan stays the largest part the product sizes; a revision field the user drags taller keeps the user's height
and may then stand taller than the plan, the one case where "largest" yields.

While the hold stands, three places enforce the planning grants of REQ-ORCH-153 — the port's narrowing
(`createToolPort`, which only removes, and which hands the gate the set of names it removed), `Gate.dispatch`
ahead of the permission resolution (so a refused call's tool hooks never fire, REQ-HOOKS-004 — and which refuses
a name that is a tool, letting a name that is no tool reach REQ-TOOLS-032's unknown-tool answer instead of a
promise no approval can keep), and child admission (`IterationChildren.delegate`, which reads the role an alias names
through `personaOf` — `resolveRole` on the built-in table's path since 2026-09-30, as the ledger does) — and the hook engine
starts no process, emitting one `hook.finish` with `skip_reason: 'plan_gate'` per withheld invocation
(REQ-HOOKS-126). The check suite is unreachable rather than guarded: a held segment never enters the loop.

**Launch ownership (2026-09-13, REQ-TRACE-470/471).** `run-host/launch.ts` owns configuration capture,
credential preparation and pre-start refusal mapping. The board coordinator sends its authorized
`boardPermissions: permissive` on one start request. The run host applies autonomous mode and the
unsandboxed opt-in together to the captured runtime. Settings files and live state retain their values.
The configuration is loaded and validated before the credential wait; completing it builds the model
setup and authenticated catalogue from those captured inputs. Active tool ports, preflight, checkpoints
and supervision resolve their configuration by session identifier. A refused prompt for an active run
returns before another configuration load. Launch audits record effective permission and the complete
effective configuration snapshot: slots, redacted models, personas with prompt files resolved inline,
runtime and every other typed section, plus redacted MCP server declarations.

**The model client a run is handed (OQ-312, ruled 2026-10-14 under R-072, built by fin46).** `prepareRun` hands the run the
product's `AiSdkModelClient` for every `models:` entry, authenticated as configured, unless the entry is the scripted client's:
under the verification-only dialect switch (`scriptedDialect`), or for an entry naming the `scripted` provider — and both only
where the seams are compiled in (`isScriptedProvider`, `run-host/configuration.ts`). A packaged build carries no scripted client
(`host.ts` builds it behind `__ROTARIS_SEAMS__`), and a `scripted` entry there with no `base_url` refuses the start before any lease,
"No usable model is configured for the entry role" (REQ-EVENTS-021/019, `session.no-model`); with a `base_url` it is an
OpenAI-compatible provider name. ADR-0056 rule 4 (b)'s packaged launch runs against a loopback stub reached through that client.
*(Until then a packaged build answered a `scripted` entry with the stand-in and a fixed one-step script.)*

**The continuation lease (2026-09-14, REQ-PROVIDER-066).** The run-launching continuation commands —
`session.continue`, `session.prompt`, `session.planDecision`, and since 2026-10-02 `session.retry` (REQ-NOTIFY-045) — re-ask main for the credential lease
(`leaseForContinuation`) before the engine resolves the run's setup, and publish the fresh bearers under
the session's workspace root (`sessionRoots`, recorded at `session.start` and `session.resume`). Before the
repair, a resumed session's continuation read the previous launch's lease — empty after an application
restart — and its first model call went out with **no `Authorization` header** (the 401 recorded in
a defect note, removed once repaired). The refresh is invisible when main answers;
an entry provider main cannot resolve refuses with REQ-WORKSPACE-137's sentence, exactly as a launch does.
A session this process never started or resumed leases nothing — the engine's own `not-live` / `no-session`
refusals answer it.

**The continuation settles the confinement verdict first (2026-10-20, REQ-SANDBOX-097).** Every one of those commands, and the
restarts of REQ-NOTIFY-070 (`session.restartOnFallback`) and REQ-NOTIFY-074 (`session.authRestart`), runs in this order in the run
host's dispatch: `settleConfinement()` (the one cached probe, as at a run start), then the continuation lease (which settles again
before it prepares, a cached read), then the engine, whose `configure` meets ADR-0022's gate reading that settled verdict. A refused
mode then carries the backend's reason and remediation under `session.confinement`. Until then only a run start and a
`confinement.status` read settled it, and a continuation reached first read `null` and was refused "No OS-level confinement can be
used on this host." even where confinement was available
([the note](../../../defects/fixed/a-continuation-before-the-confinement-verdict-settles-is-refused-as-confinement-unavailable.md)).
