# Runtime view — a run from prompt to terminal result, and everything that reaches into it — 3. Inside a turn (`runTurn`, one agent conversation) (continued)

Part 5 of 16 of [the runtime view](../03-runtime-view.md), which indexes every part.

**The ladder over every model step (Part Q — `run/ladder.ts`, `run/resilience.ts`, `run/waits.ts`; REQ-ORCH-088/090/091/092,
REQ-NOTIFY-081..092/263).** It sits at the step, not the turn, so a retry re-issues the call over the conversation as it stands
and never replays an executed tool call. Each agent (the root for the run, every child) has a **cell**: its current model
choice (the session's override applied through `ResilienceMemory.effective` — where the cell is built, and again before
**every call** (`followOverride`), so an agent already on a pair a wait's choice replaced leaves it at its next call, the
root's resume after the waiting child's report included; the summariser, which has no ladder, carries its model through the
same overrides at each attempt, `SummariserDeps.resolve`; a wait choice of a pair — a change of model, or the waiting pair
itself chosen for a retry — first takes back any override an earlier choice set from that pair (`Run.takeBackOverrideOf`, a
`model_override` entry carrying `cleared: true`, `cause: 'superseded'` and `root_cell`, where the root's cell then is), so the
agent resumes on the pair chosen, an agent that had already followed the override stays on the chain it followed (a root on
any pair of it from the override's own target on is recorded `followed`, `Run.onChainFrom`, and moves on to the chain's end
from its next call), the chain never
cycles, and a cycle a store already holds ends on its newest override's target), its role's fallback (`personas.<role>.fallback_model`,
else the run-level `fallback_model` slot, never its own model), and three once-only marks — the role fallback (shared by the
unresponsive-model route and the hard child timeout, REQ-ORCH-144), the same-tier fallback, the wait attempt. On a failed step,
`classifyFailure` decides in this order: **quota** (structured `insufficient_quota`, "exceeded your current quota", "check your plan
and billing") → **rate limit** (429 or the three substrings) → **context window** (REQ-ORCH-093: condense and retry, below) → **validation** → **transient** (the port's fact, REQ-NOTIFY-094's phrases) → **fatal**. Transient and validation take
their own budgets (`auto_retries_transient`, `auto_retries_validation`) after min(2, n) s, each attempt a `transient_llm_error` /
`validation_llm_error` issue. A limit never touches those budgets: (a) a quota response marks `provider|model` exhausted — in
memory and as the `model_exhausted` timeline entry; an explicit choice of the pair clears it (REQ-MONITOR-194:
`clearExhausted`, a `model_exhausted` entry carrying `cleared: true`, replayed in order on resume) — from every selector: the
run header's and the inspector's switch and the wait's picker (`Run.clearChosenExclusion`), and since fin10 the composer's
next-run chip (`session.chooseNextModel` → `Sessions.chooseNextModel`, which reaches a session with no run too) and the
recovery dialog (`restartAfterAuthFailure`, restored if the restart cannot begin); the exclusion is read
**before every call** too (since fin10, `settleBeforeCall`: `followOverride`, then the exclusion; `runTurn` calls it
before its compression check and `resilientStep` before every call, a cell with nothing to settle taking the synchronous
`onExcludedPair`): a cell on a pair the session holds out of
quota — another agent's answer, or an earlier run's rehydrated — is not called but takes (b) then (c) at once (`limitPath`,
the move or the `model_wait` issue carrying `pre_call: true`, no second `model_exhausted`); (b) at most one same-tier candidate per agent (`sameTierCandidates` over the
run host's **catalogue**: same recorded role, a different provider identity — `auth_provider` else the family — configured first
then discovered from the snapshot's per-provider picks, exhausted and attempted pairs out) → the `quota_fallback_model` timeline entry and
`quota_fallback` warning issue — REQ-ORCH-139's words, under a rate limit as under exhaustion (`model_fallback` before A29's repair) — the step re-run; (c) else the **suspended wait**: the provider's retry-after (integer seconds, an HTTP date, a
suffixed value, `try again in N <unit>`) else 60·2^(attempt−1) s capped at 300 s, indefinite for an exhausted provider; the
`model_wait` issue and a system row; the session's status **`waiting`** (REQ-SESSION-073's own arm, presented as `running`) and
the record's `wait` published with every snapshot. The wait resolves by the timer (clock port), by `cancel` (the run ends
`user_cancelled` with the condition as its error → main's REQ-NOTIFY-063 notice), or by `setModel` (the pair overridden
session-wide, the `model_override` timeline entry, the agent re-run at once; a key that cannot be applied → `model_override_rejected`
and the header names why, the wait continues). **Unresponsive model:** while a role fallback is untried and `llm_response_timeout`
(≥ 30 s) sits below the agent's bound (the child timeout; the model timeout for the root), a timer on the clock port aborts a call
that produced no event of any kind and the step re-runs on the fallback (the `llm_unresponsive` timeline entry and issue — REQ-ORCH-139's word; `unresponsive_model_fallback` / `unresponsive_model` before A29's repair). A tool call's first streamed piece (`tool-input`) is such an event, so a step that opens with a long tool call is not given up on (since 2026-10-07). **Child timeout:**
expiry does not cut the child off — it **asks the child to land** (REQ-ORCH-088), by raising the same per-child flag
`runTurn` reads for REQ-MONITOR-123's pause, so the turn stops before its next model step with the step in flight
finished and its text intact. A hard-abort **backstop** is armed `STOP_GRACE` (30 s, `run/grace.ts`, ADR-0014 rule 1's
one allowance) behind it, for the child that cannot land inside the window; REQ-CONFIG-113's ceiling therefore still
bounds the child, at `child_timeout` and at most 30 s more — the bound `PD-ORCH-004` revision 5 writes down (OQ-196 as
ruled, 2026-10-06): a model step the backstop cuts keeps only its streamed reasoning, as `thinking` rows. Then, with a role fallback untried, the child runs once more on it (the `fallback_model` timeline entry and `timeout_fallback` issue — REQ-ORCH-139's words; `child_timeout_fallback` for both before A29's repair); else
it fails with `Child timed out after <N>s` and a report carrying what the child last **said** — the last assistant
message with text, not the last assistant message, which is usually the one that opened a tool call and spoke
nothing. Those words reach `last_response`; `final_response` stays empty, because REQ-ORCH-110's final response is
text no further tool activity followed. **A child cut off while making progress (PD-ORCH-004):** at the
expiry instant — not at the backstop — the child's `ProgressLog` answers whether it completed a tool call within the
final stall window (the role's `stall_timeout`, else `runtime.child_stall_timeout`, 90 s by default; the bound is
inclusive). If it did, and the child then ends failed on that timeout, the stored report gains `cut_off`: the statement,
the workspace paths its own file-writing calls changed with `ok` — `write_file`/`haet_edit`/`haet` and, since fin32, the
code-intelligence EDIT tier of REQ-MCP-015, each call's path read by the one `writtenPathsOf` (`children/report.ts`) the
report's edited files share, an EDIT-tier tool's from the argument the binding manifest's `editArguments` names (the name
matched in lower case, as the gate's fallback dispatches it, and since fin36 only among the callables the child's grant gives
the code-intelligence server, `editTierNamesOf` over `McpGrantEvidence.granted`, so another server's tool called like the tier
is no write (REQ-MCP-015; the name alone decides only before the port's grant is known), and since fin38 each such callable is
matched against the manifest by the name the server reports for it (`McpGrantEvidence.renamed`, REQ-MCP-005), so a
`tool_name_map` rename on the code-intelligence entry still reads as a write; resolved lexically against the root;
both attempts, in the order first changed, each once; the terminal outside, as PD-TOOLS-006 has it) — and, since fin35 (OQ-245), a cross-file
EDIT call (a rename, a cross-file replacement: `scope: 'reach'`) by the files the run host observed it change, whatever it
returned (`observeReach` around the MCP executor in `run-host/mcp.ts`, which since fin36 asks `codeIntelligenceEdit` only of the
code-intelligence server's tools, by the name the runtime reports: a snapshot of what the call can reach before and
after — since fin38 an asynchronous walk (`snapshotTree` over `node:fs/promises`, a directory's files read together in batches of `SNAPSHOT_STAT_BATCH`, 256, the limit checked after each since fin39), so the
run host's event loop keeps moving during it — less what another agent's native writes noted in the run host's `WriteJournal` meanwhile, carried as `observedPaths`
on the `PortToolResult` and the tool-result part, persisted with the conversation and never sent to a model); with no
observation (a walk the run host could not complete marks the call `unobserved`, which counts as having run even when it
erred), its argument file and "a <tool> call may have changed files the record cannot name", never "changed no
workspace paths", and — unless the child is itself a continuation — the offer naming `continuation_of`, which since 2026-10-06 also tells
the parent that a continuation starts with no memory, so it writes a complete brief (`PD-ORCH-004` revision 5, OQ-114; and
`delegate`'s description says the same). The report block and
`background_output` render it after the result text; nothing resumes the child. See §4 for the continuation.
Per-model `timeout` / `num_retries` ride the choice (REQ-ORCH-145). **`num_retries` is the dispatch layer's, not the
ladder's** (REQ-CONFIG-086, default 5; OQ-110): the model client hands it to the SDK as `maxRetries`, so a 429, a 5xx or a
connection failure is retried inside the call, with the SDK's own backoff, before any rung above sees it, and the ladder
takes over only when those retries are exhausted. Each retry absorbed there is reported as it is sent — the decorated
fetch sees a request follow a failed attempt of the same call, and calls `ModelRequest.onRetry` with the status met and the
delay waited on the monotonic clock; `DefaultAgentBackend` forwards it to `TurnSink.retried`, and the turn writes it through
the run's `warn` to the session log at WARNING (`dispatchRetryLine`, REQ-SESSION-142) — no issue and no timeline entry,
because the ladder was not reached. An exhausted budget is handed on as the **last attempt's** error (the SDK's
`RetryError` unwrapped in `fromError`), so its status and `retry-after` reach the ladder's classification. On resume the memory is
rehydrated from the timeline (`ResilienceMemory.rehydrate`), so a continuation never returns to an exhausted pair — unless an
explicit choice cleared its exclusion (REQ-MONITOR-194, a `model_exhausted` entry carrying `cleared: true`, replayed in order)
— and keeps the user's choice (REQ-SESSION-196).

**Context compression (Part AH — ADR-0060; `run/conversation.ts`, `run/compression.ts`; REQ-ORCH-093,
REQ-MONITOR-076..086, REQ-CONFIG-132..135).** The turn's history is a **`Conversation`** whose array is *swapped*,
never spliced: `snapshot()` hands the live array to a step, `replace()` installs a new one, so a request in flight
keeps what it was given. Two triggers reach the same mechanism. **Automatic** (REQ-MONITOR-076), between steps
where the supervisor's `check()` sits: the count is the provider's own last-prompt reading when the history still
matches it, else a character estimate at `chars_per_token`, and it is compared with `compressionTrigger()`'s
resolution of REQ-CONFIG-134 — capacity from the model's `context_compression_threshold`, else min(its
`max_input_tokens`, `compressor.default_threshold`), else the default — times `threshold_percentage`. The model
whose capacity is read, and the compressing model when `compressor.model` is not configured, are **read at each pass** from
the pair the agent's cell calls next, the session's overrides followed (`TurnCompression.compressor()`/`trigger()`;
`Run.callsOn` for the root, the child's own cell in `IterationChildren`), so a ladder move within the turn — a same-tier or
unresponsive fallback, a wait's choice, an override followed — takes the compression with it (REQ-MONITOR-079/080; until
2026-10-02, fin10, both were captured when the turn started, and a child's from its persona's configured model). The
automatic check comes **after** the cell is settled (`settleBeforeCall`), so it never reads, nor calls, a pair the session
holds out of quota; a pass that would call the agent's own excluded pair — a manual one while the agent awaits a tool or a
child — is withheld (`TurnCompression.withheld`): no call, a failure naming the reason (since the repair round of
2026-10-03; until 2026-10-06 a configured `compressor.model` was called as configured — since PD-MONITOR-007, OQ-189's ruling,
it follows the session's overrides and, where its pair is held out of quota, yields to the agent's own model, so this reads
whichever model the pass would call).
**Recovery** (REQ-ORCH-093), in the ladder's `context_window` arm: condense and retry, **at most twice for one
call**, the original rejection surfaced unchanged when the condensation itself fails; the issue is
`llm_bad_request`, or `parent_resume_bad_request` on the first call of a turn resumed with child reports. A
compression asks the `compressor.model` (else the agent's own, REQ-MONITOR-080) for a summary of **only** the slice
between the original request and the preserved turns (REQ-MONITOR-082 forbids sending the three survivors) — read by
`compressorTranscript`, each event whole and the slice whole up to the compressing model's own threshold at
`chars_per_token` (`CompressorDeps.inputTokens`, which `Run.compressionFor` resolves through `triggerFor`), past which it
keeps the start and the most recent part with the omission marked (OQ-156; the report pass's 12,000-character head cut
it once shared is gone) — then
rebuilds the conversation as REQ-MONITOR-084's five parts: the original request, the summary (clamped to 300 lines
and nothing else is, REQ-MONITOR-083), the todo items one for one, and the most recent `preserve_recent_turns`
turns verbatim — a **turn boundary being any message that is not a `tool` message**, so a cut can never orphan a
tool result from the call that named it. The system prompt and the tool definitions are part (1) and are not in
the conversation at all: they travel on every request. Each completion writes a **`context_compressed` timeline
entry** carrying REQ-CONFIG-135's four inputs and the trigger token number as separate fields beside
`count_source`, the before/after token and message counts and the latency; one `system` transcript row is rendered
from those fields; the log takes the same figures. That venue is **OQ-53** — the wire catalogue is closed at 23
kinds (REQ-EVENTS-041) and none reports a compression. *(OQ-53 ruled 2026-10-06, R-071: the timeline entry is the event,
and `context_compressed` is a word of `PD-ORCH-014`.)* `AgentActivity` counts completions and a session opened
again seeds the count by counting those entries, so REQ-MONITOR-086's "never counted a second time" holds by the
shape of the record. While a pass runs, `SessionRecord.compression` names the agent and is **published at once**
(`owner.reconcile()`), because a compressing pass writes nothing and a derived field is otherwise invisible
(REQ-MONITOR-085). A trigger that fires with **nothing between the original request and the preserved turns**
is a no-op, not a failure: it is logged once per agent and records no issue, because the trigger is evaluated
before every step and the condition persists (ADR-0060's second execution). **The trigger is also latched off**
for an agent once a compression is measured not to help — where the provider's count less the conversation's own
estimate (the system prompt and the tool definitions, which REQ-MONITOR-082 keeps whole) already reaches the
threshold, no compression can bring the count under it, and the reason is stated once with both figures. The
REQ-ORCH-093 recovery path is never latched. **`SessionRecord.entryContext`**
carries the entry role's latest prompt reading and its model's advertised limit (REQ-MONITOR-089) — the model the
root's ladder cell calls, after any move or override, since 2026-10-02 (REQ-MONITOR-049; the requested model's before): the entry
role has no `children` row, so this is the only route by which the synthetic root agent's meter gets a figure —
before it, a run that spawned no child drew zero however much it had spent. **`SessionRecord.entryTools`** (live-run
finding K1, 2026-09-29) is the same route for its tools: `resolved` is the native set the live run's root port kept
(`ToolPort.resolvedTools`, the one resolution's names the callable map kept, so a coordinator's withheld tools are absent —
REQ-MONITOR-061), `called`
and `active` the tracker's under the name the root dispatches as (`Run.entryTools`, `rootName`: a root resumed as the
entry role keeps the persona its iteration was opened with, OQ-97); with no run live nothing is
resolved, the history is read under the latest iteration's `root_persona` (`entryToolsOf`), or under the latest plan
cycle root's `root_persona` when that root opened after it (`plan_roots.opened_at`, store v30: PD-ORCH-003 re-arms `plan`
after an iteration, and the cycle's root runs fresh under a persona that may have been switched in between; the repair of
`a-plan-cycle-after-an-iteration-reads-the-tool-history-of-the-iterations-root.md`, 2026-10-01) — or, before any iteration,
under every name the tracker holds that is no child's, which can only be a plan cycle's root's, since a plan cycle has no
iteration row (REQ-ORCH-153; `AgentActivity.calledToolsWhere`, acceptance A21, 2026-09-29) — and the surface lets the
role's declared tools stand in (REQ-MONITOR-060; the snapshot's `declaredTools`). That role is the **latest** root's: the
surfaces draw the run-level agent's name, model, reasoning and stand-in tools (`entryRole`, `packages/ui/src/agents.ts`,
behind the renderer's `entryOf`) from **`SessionRecord.entryPersona`** while a run is live — the persona its root runs as
(`Run.entryPersona`, the run's `config.persona`, which its rows carry and its port resolves `entryTools` for), set from the
run's start, before that root has written a row; null on a stored record — and at rest from the persona of the transcript's
last row a root authored, of any kind a turn writes under its agent's persona and name (`agent`, `tool`, `thinking`,
`diff`), no child's, a row named for one of `SessionRecord.entryRoots` preferred. So they come from the persona whose tools
its chips show (the reading recorded beside OQ-97). Until 2026-10-01 the first root's `agent` row was read; the first repair
read the last root's `agent` row alone, and a live root whose first steps were tool calls, or that had written no row yet,
was drawn as the root before it (`after-an-entry-persona-switch-the-run-level-agent-is-drawn-as-the-first-roots-persona.md`).
The run-level agent's **model** alone departs from the entry role while its run is live: **`SessionRecord.entryModelKey`**
(2026-10-03, REQ-MONITOR-052/066/069) is the key the root's ladder cell runs on (`Run.entryModelKey`). The cell carries the
`models:` key its model was taken from (`AgentResilienceCell.key`), set at every assignment: the configured `RunConfig.modelKey`
or the switched key when the cell is built, the override followed, the same-tier candidate's key, the key chosen during a wait,
and null after a role's fallback (named by reference). A carried key that is a configured, non-copy key is the answer — so two
keys naming one provider's model (each with its own thinking) are told apart; otherwise (a discovered tier pick, a loader-made
copy, no carried key) it is the first configured non-copy key for the cell's provider-and-model pair, as the exclusions are
matched, else the carried key or `entryOf(catalogue, rootCell.model.model)`; null before the cell exists, on a stored record, or
when nothing names the pair. A same-tier, unresponsive-model or pre-call move changes it without touching the configuration, and
`runLevelAgent` names it (`runLevelModel`) — the inspector's Model field and the persona window's read-only model. A move
writes no row and saves nothing, so the ladder tells the run when a cell's model changes (`TurnResilience.moved`, at each
`cell.model` assignment in `ladder.ts`) and the run republishes the record (`ProjectionOwner.refreshRecord`, coalesced at
`RECORD_TICK`) — which keeps `entryContext`'s limit current through the call too. `entryRole`
keeps the configured key or the override in force, so the composer's chip and the strip's model item go on naming what the
next run starts with (REQ-MONITOR-146, REQ-SHELL-043). Until then the inspector named the configured key while the root ran on
the candidate (`fixed/the-inspector-names-the-configured-model-while-the-root-runs-on-a-same-tier-candidate.md`). A **child**
follows the same rule (2026-10-03, finacc F7): the run's `resilience.forChild` builds each execution's cell carrying the
row's `children.model_key` (or the override it follows) and keeps it by task id (`Run.childCells`). Once the cell has
left that pair or key, `Run.childModel` returns the key it runs on (`Run.keyOfCell`, `entryModelKey`'s rule) and that model's
advertised maximum input, and `toAgentRecord` reads both (`AgentFacts.liveModelFor`) for the agent's `model` and
`contextLimit`. With no live run, or for a child this run did not execute, the row's key stands. REQ-ORCH-088's timeout fallback
calls `TurnResilience.moved` too, so the record names the fallback while the retry runs. Until then a moved child was drawn
on its configured key against its limit (`fixed/a-child-moved-by-a-fallback-is-drawn-on-its-configured-model.md`). **`SessionRecord.entryStalledSeconds`**
(2026-09-30, OQ-153) is the same route for the root's stall watch's figure. **`SessionRecord.entryToolCalls`** (2026-10-01,
acceptance A20) is the run-level agent's tool-call count (REQ-MONITOR-044/052): the roots' share of the persisted total — the
total less every child's persisted `children.tool_calls` — plus the calls the live root has started in its running execution
that the total does not hold yet (`entryToolCallsOf`, `Run.entryUncountedToolCalls`: the tracker's count under `rootName`
less its count when the execution began, zero once its calls join the total). Null on a stored record, where the surface
derives it as the total less the children's (`runLevelAgent`). A root's calls joined the total only when its turn returned
(REQ-ORCH-097's cadence), so before this the meta line read `0 tool calls` while the root's turn ran. **Since OQ-116's ruling
(R-071, `PD-ORCH-008`, 2026-10-06)** every agent's call joins the total, with that agent's own count, as it completes
(`countRootCall` in `Run.turn`, `countCall` in `IterationChildren.execute`; a plan cycle's root on `sessions.plan_root_tool_calls`,
store v32, without releasing it), and the pass's end adds only what was not counted as it completed — so the live root's
uncounted calls are those in flight. A child's remainder is taken per attempt (fin22): each attempt's calls started and never
completed — every call its turns counted, a replay included (`attemptCounted`, from `TurnDeps.onToolCounted`, which the turn
fires as it counts a call), less its completed calls, whether or not it left an outcome — so an attempt REQ-ORCH-088's
fallback replaced never hides the retry's unfinished call behind the calls it completed, and a re-prompt or corrective turn
that raised loses none of its own. (fin22's first repair read a raised attempt's calls from `onToolStarted`, which a replay
never fires, and an attempt with an outcome from that outcome alone; both lost a call.) It is the
agent's own count (REQ-MONITOR-044/052), not REQ-MONITOR-101's aggregate run count for the synthetic root; which of the two
the run-level agent shows was **OQ-159**, ruled 2026-10-06 as built ([`PD-MONITOR-003`](../../../product/directives/pd-monitor-003.md#pd-monitor-003)):
the figure is the agent's own, and the run's aggregate is REQ-MONITOR-102's displayed total. **`SessionRecord.compressions`**
(2026-10-02) is the run-wide compression count (REQ-MONITOR-086): the live run's maintained aggregate (`Run.compressions`,
ADR-0008) while a run is live, else the stored `sessions.compressions` (`runCompressionsOf`, `toSessionRecord`) — raised at
the completion that raises the compressing agent's own count, a root's included. The run-level agent carries it as its
count (OQ-159's recorded reading, confirmed 2026-10-06 by R-071), and the inspector's ring caption and the persona window's context card draw it beside
the per-agent figures (`compressionLine`, REQ-MONITOR-281); until then the run-level agent summed `SessionRecord.agents`, the
children alone, so a root's compressions reached no surface. A LIVE run-level agent whose root port
has not resolved yet — the pre-flight, before `Run.iterate` sets the port — lists nothing (`runLevelGrant`), never the
declared set (REQ-MONITOR-061). **`SessionRecord.artifacts`** is the
session's artifacts not superseded, with producer, ready flag and consumers (`artifactLinksOf`, one body-free read through
`artifacts_by_created` per snapshot) — what the inspector's and the persona window's artifact links read (REQ-MONITOR-052/068/069).
**`SessionRecord.entryRoots`** names the entry role's roots, each once, by the name its rows and calls carry and its
canonical name: every iteration's (`root_persona`, `root_canonical_name`); then every plan cycle's, from the record its
turn's start wrote (`plan_roots`, **v30**, `StoreDal.planRootsOf`) — a plan cycle has no iteration row (REQ-ORCH-153); then
each root no row records that published — a plan cycle's from before v30 — by its publish's persona and `created_by`
(`StoreDal.rootPublishersOf`, a publish whose conversation is no child's and no iteration root's task id, through
`artifacts_by_created` per snapshot); then the live run's current root (`entryRootsOf`, `Run.currentRoot`). The session
lets go of a run once `start()` settles, a park at the plan gate included; *until v30 a plan cycle's root that published
nothing was therefore named only while its run was live, and what it read was no agent's received link at the gate
(`docs/defects/fixed/a-plan-cycles-root-that-publishes-nothing-is-named-only-while-its-run-is-live.md`, repaired under
R-067).* The surfaces know the run-level
agent by the entry persona and by these: it owns a named row carrying either (`ownRow`, which `rowsOf`, `scopedRows` and
`followedAgent` share; never by a named row's persona, which a child of the entry persona shares), and its artifact
links match either or a root's canonical name, which its publishes and reads record (REQ-LIBRARY-093). Before this, a
root whose name was not the entry persona fell outside it
(`docs/defects/fixed/the-run-level-agent-is-known-by-its-entry-persona-alone.md`).
