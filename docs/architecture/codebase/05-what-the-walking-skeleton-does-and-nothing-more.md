# The codebase — how the architecture is laid out in code — What the walking skeleton does, and nothing more

Part 5 of 22 of [the codebase record](../codebase.md), which indexes every part.

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
   persistent notice; the status strip shows the presentation vocabulary (its run item was dropped on 2026-10-02, fin10:
   REQ-SHELL-038's closed list has no run state, and the run header and the Mission subtitle carry it). Every event is recorded then
   forwarded on the bus with the 5 s bound. **No tool, no child, no hook, no intent classification, no
   verification**: one task, one agent, one turn per iteration.

**Where the model comes from — the configuration files and the credential store** (`apps/desktop/src/run-host/
configuration.ts`, ADR-0036/0037, built 2026-09-05; ADR-0028/0029/0030/0032, built 2026-09-05): the entry role's
`models:` entry — its `base_url` or the provider's known endpoint (`openai`), `api_mode` → dialect — loaded once per
run start from the snapshot (layer 3: every authenticated provider's discovered models, keyed by qualified id, with
`auth_provider`) and the two scopes' files, with the screen's live state on top. A model naming an `auth_provider`
authenticates with the bearer **main leases the run host** at run start (`credentials.lease`); a model naming none
uses its `api_key` or `api_key_env`, read per request. `ROTARIS_MODEL_DIALECT=scripted` selects the scripted client
for every model (verification only) and is **the last environment stopgap** — since 2026-10-14 read behind `__ROTARIS_SEAMS__`
(`scriptedDialect`), so a packaged build has no such switch; a `models:` entry with provider
`scripted` does the same per entry, only where the seams are compiled in (`isScriptedProvider`, OQ-312 ruled 2026-10-14 under
R-072, no directive): a packaged build carries no scripted client at all, and there a `scripted` entry with no `base_url` is a
provider the build knows no endpoint for, refused as any other, and one with a `base_url` an OpenAI-compatible provider name.
*(It read "in every build (in a packaged one with the fixed `PACKAGED_SCRIPT`)" until fin46 built the ruling.)* A fatal file, no model at all ("No model configured") or an unauthenticated
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
   `json_schema` rung, none with a confidence (the endpoint accepts the schema and does not enforce it). Since 2026-10-13
   (OQ-258, fin38) the strict rung's user text names the object's three keys (`KEYS_INSTRUCTION`): a reasoning model never sees
   the schema while it reasons, and at `552d346` it was cut at the 12 s bound deliberating over key names. The proof's
   scratch workspace now runs autonomous after the starter file is asserted, so no one sits at the approval dialog.

19. **the Overview view (2026-09-05, Part M):** REQ-SHELL-026's startup view drawn — the header with the session
   label, status and runtime; the resizable two-column body whose split persists under `panels/overview` (since 2026-10-14 the registered `panels/overview/state`, `/panes` and `panels/version`)
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
   (`classifyExplained`, REQ-SANDBOX-026); no proxy by construction (~~OQ-37 stays open~~ *OQ-37 closed 2026-09-07: explicit direct transport for every hop*). `pnpm fetch-proof` runs seven
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
   two columns under `panels/git` (since 2026-10-14 `panels/git/state` and `/panes`), the worktrees table with multi-row selection and the per-row delete, the history
   table, the checkpoints card **in its empty states only** (ADR-0039 not executed — a status note says so), the
   policy card, Merge selected disabled (integration owed); the worktree dialog with `validateBranchName` shared
   through contracts; the two-step delete; REQ-SHELL-125's **start-session dialog** — isolation with the generated
   branch, attach through the folder chooser, the sandbox selector with REQ-SANDBOX-130's disclosure — whose choices
   the composer's next submission carries; the isolated session: main mints the id, the service binds **before** the
   run host is asked (a failed bind has no session to delete), the binding on the session row (store v8), the run's
   effective root the worktree while the record and the configuration stay with the base; REQ-GIT-104's
   fixed-identity notice; the strip's branch item. `pnpm git-proof` drives seven launches: painted, a worktree
   created through the dialog, an isolated run whose `write_file` lands in the worktree and not the base, the forced
   delete against a real refusal, the split restored, `PATH` without Git, a plain folder (since the acceptance repair F8,
   2026-10-03, an eighth launch reopens the isolated session with its branch one commit ahead of its own upstream: the
   strip's ` ↑1` for the worktree branch, read as each worktree row's `upstreamAhead`, and REQ-WORKSPACE-020's worktree
   clause in the accessible description alone). **Found:** nothing in the
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
2026-09-29, OQ-110; each one it absorbs is a WARNING line in the session log, `ModelRequest.onRetry` → `TurnSink.retried`
→ `dispatchRetryLine`, and an exhausted budget hands the ladder the last attempt's error, built the same day). The record's `wait` and the Workspace header that counts down and
   offers keep waiting (no operation; since 2026-10-06, PD-MONITOR-004 revision 2, `setModel` with the record's `wait.modelKey` marked
   `keepWaiting` with the wait's agent and attempt in the wait that never auto-resumes, `Run.keepWaiting`: a retry of the
   agents parked on the waiting pair alone), change model (`setModel`) and cancel — REQ-MONITOR-004's
   enumeration stays at twenty-two. `pnpm resilience-proof` drives nine launches through scripted fault steps. **Found — four defects in
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
   `interface/agentPopOut` preference with its toggle (since 2026-10-14 the registered `interface/agentPopout`); `AgentRecord` grown by eight of REQ-MONITOR-044's fields
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
   per-child evidence in `children.granted_mcp` (since 2026-10-01 the grant the child's port put in force, recorded once it
   is ready, with `children.granted_tools` — the spawn recorded the persona's declared set before any control until then —
   and marked `recorded`, so an empty native grant is drawn as none, `AgentRecord.grantRecorded`); the session override held in the run host; the Settings category
   (`McpSettings.tsx`: every configured row with its four-state health as text, origin, the switch and its wording, the
   secrets read side masked). **Placement read against the record:** every path lives in the **run host**, the one
   holder REQ-MCP-047 now asks for — ADR-0034 consequence 3 falsified and kept. OQ-22 read as overlay on the parent
   environment, flagged for the owner *(ruled 2026-10-06, [R-071](../../product/requests.md#r-071): the overlay ratified as built, with no scrubbing)*. **Shipped `enabled: false` on `code_intelligence`** by the owner's decision until
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
