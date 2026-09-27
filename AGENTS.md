# Agents working in this repository

`CLAUDE.md` states what governs this repository: the clean-room boundary, the approved inputs, the process
state, the architecture views and the design language. Read it first — nothing here relaxes any of it.

[`CONTEXT-MAP.md`](CONTEXT-MAP.md) is the vocabulary those documents fix: one `CONTEXT.md` per context, every
term derived from `docs/spec/` and citing the requirement that owns it. Read it before naming anything new,
and prefer its word over a synonym you would otherwise reach for.

[`docs/module-map.md`](docs/module-map.md) is the shallowest map — which package owns a thing, the file to
open first, and where its tests are. Read it when the question is *where*; the proof index below answers
*what re-verifies it*.

This file covers the two checks `CLAUDE.md` does not spell out: **`pnpm app:drive`** (free, interactive
debugging of the built app) and **`pnpm live-run`** (the only check that spends real money) — and indexes the
proof scripts, so the evidence for an area can be found without reading forty script headers.

## The proof scripts — which one covers what

`pnpm check` (symbols, typecheck, lint, tests) is the gate every commit passes. Beside it sit the **proof
scripts**: each launches the **built** application against a scratch profile and measures a mechanism in the
product rather than in a unit test. Every one is a first execution's evidence, and the area it covers is the
area it re-verifies.

Two rules about them. **Run the whole suite a part touches, not the one script named after it** — a change
that moves a shared seam breaks a neighbour's proof, and that is the point of having them. And a proof is
**evidence, not a test of the harness**: a red is a defect of the product until the harness is shown to be
wrong.

| Area | Script | What it measures |
|---|---|---|
| **The run** | `part-h-proof` | the loop supervisor and `continue` (ADR-0059) |
| | `part-j-proof` | the control channel: a queued message at the iteration boundary, a steer, a graceful pause, the message-limit pause |
| | `plan-gate-proof` | the plan gate held, edited, answered (ADR-0062) |
| | `resilience-proof` | the model ladder, the waits, the fallbacks, against scripted faults |
| | `compression-proof` | context compression and its timeline entries (ADR-0060) |
| | `checkpoint-proof` | the capture at iteration close through to the desktop restore (ADR-0039) |
| | `sessions-proof` | the session browser's actions: repair, delete with ref cleanup, the exports |
| **Tools** | `fetch-proof` | `fetch` and its egress policy, read from saved configuration at **every** call |
| | `questions-proof` | `ask_questions`, the trailer row, the stepper, the two control operations |
| | `todo-proof` | the todo source priority, write-through edits, the pane |
| | `attachments-proof` | content validation, ceilings, the capability gate, durable metadata |
| | `artifacts-proof` | the session artifact store, the Artifacts tab, the inspector |
| | `mcp-proof` | MCP declared three ways, against a real fixture server (ADR-0033/0034) |
| | `code-intel-proof` | the bundled code-intelligence runtime and its manifest (ADR-0035) |
| | `skills-proof` | portable skill discovery, with a scratch home (ADR-0063) |
| | `injection-proof` | workspace-context injection as the model port **received** it — order, the per-file switches, OQ-64, a worktree's execution root — and REQ-WORKSPACE-049's cold-cache p95 over 20 separate processes (`--skip-latency` skips it; cold only on Linux) |
| | `sandbox-proof` | OS-level confinement (ADR-0022) — **`win32` is outside the platform set; read what it says it cannot prove** |
| | `terminal-stream-proof` | the stream in the run host against a **real PTY** (ADR-0021) |
| **Configuration and startup** | `config-proof` | hand-authored, commented files surviving every write (ADR-0036/0037) |
| | `init-proof` | project initialization resolved once per workspace open (ADR-0064) |
| | `workspace-proof` | reaching a project folder from inside the application: resolution, gates, switch |
| | `settings-proof` | the Settings categories and the save bar |
| **Surfaces** | `overview-proof` | the Overview painted from the run and the store |
| | `transcript-proof` | the projection, the caches, the empty state (ADR-0045/0046) |
| | `rows-proof` | the one row renderer, in both of its surfaces at once |
| | `composer-proof` | the composer's chips, drafts, history recall and run header |
| | `slash-proof` | the composer's slash-command catalogue |
| | `chat-controls-proof` | manual compression, the transcript clear, the prompt-file commands |
| | `palette-proof` | one action vocabulary reaching the screen three ways |
| | `notice-proof` | the notice store and its chain (ADR-0049) |
| | `library-proof` | the Library shell and its Prompts tab |
| | `mission-proof` | the Mission view, the per-agent inspector, the persona windows |
| | `git-proof` | the Git view and the worktrees |
| | `terminal-proof` | the terminal grid, the pop-out window, the transcript preview (ADR-0047) |
| | `improvements-proof` | the reviewed-improvement lifecycle end to end |
| | `retrospective-proof` | the retrospective pass, driven from its surfaces against the built app (PD-LIBRARY-002) |
| | `theme-proof` | the themes and scales, rendered — plus two counterfactuals that must stay red |
| | `layout-proof` | the Workspace view's grid, **measured** at the sizes the specification names |
| **Requirements** | `requirements-proof` | the delivery store and the board (ADR-0041) |
| | `requirements-runs-proof` | runs started from the board, against a real scratch repository |
| | `traceability-proof` | the traceability engine, including spike 7's scale store (ADR-0040) |
| **The record itself** | `directive-proof` | that a directive's precedence over a requirement is machine-checked, not asserted in prose |
| **Whole product** | `slice-proof` | sign-in through the product and one run on a real model |
| | `driver-proof` | the driver seam `pnpm app:drive` depends on |
| | `ui-audit` / `ui-review` | what the browser **built** at every size; the deterministic pack a report-only critic reads |
| | `live-run` | the built product against a real endpoint and a real key — **money; never automatic** |

## Repository UI skills

Three portable workflows live under `.agents/skills/`, where REQ-WORKSPACE-051 makes them discoverable from
this repository: **`build-ui`** for creating or substantially restyling a surface, **`debug-ui`** for a bounded
rendered defect, and **`review-ui`** for a report-only external critique. Their `.claude/skills/` entries are thin
compatibility routers; the portable files are canonical.

`build-ui` and `debug-ui` may change source within the authority of the current task. `review-ui` writes only
evidence under `.ui-review/`. Its critique is proposed evidence and reaches implementation through a separate,
authorized build or debug pass. A complete review loop has at most three iterations.

## Driving the built app — `pnpm app:drive`

The fastest way to see what a surface actually does without editing a proof script and waiting out a
launch. It spends nothing, talks to no provider by default (the scripted dialect), and runs against a
scratch profile under `.drive/`. Full usage is in the script's own header
(`apps/desktop/scripts/drive.mjs`) — `pnpm app:drive` with no command prints it.

```
pnpm build                                  # it drives the BUILT app, so build first
pnpm app:drive start [--workspace=PATH] [--fresh] [--dialect=scripted]
pnpm app:drive waitFor ".app-shell"         # waits for it; never a fixed sleep
pnpm app:drive click ".nav-item" --text=Git
pnpm app:drive inspect ".composer"          # boxes, attributes, text, what holds focus
pnpm app:drive shot screen.png              # a PNG you can open, or read in a transcript
pnpm app:drive log --tail=40                # what the app printed
pnpm app:drive stop
```

`command` is relayed to main's own `runCommand` — the same path the renderer's channel reaches — so driving a
command drives the product, not a stand-in for it. The seam (`apps/desktop/src/main/driver.ts`) exists only
when `ROTARIS_DRIVER` names an endpoint file at launch; it is verification only, and `pnpm driver-proof`
is its proof.

Two habits worth keeping: **`shot` produces a PNG an agent can read directly**, which is the cheapest way to meet
`CLAUDE.md`'s "match after drawing" obligation; and a step that needs a condition should `waitFor` it rather than
sleep, because the reason this seam exists is that fixed offsets have produced false reds three times.

## The live run — `pnpm live-run`

Every other check in this repository answers the model itself. `pnpm test` uses scripted clients; each
`*-proof` script scripts the dialect or the run host. They prove the mechanism and they cannot prove that the
product works against a real model: a real endpoint, a real key, a real catalogue, real tool calls, a real
workspace changed on disk.

`pnpm live-run` does exactly that, against whichever OpenAI-compatible endpoint the owner registered, in a
throwaway workspace, for a few cents.

### When to run it

After a major feature lands — a part closed, a lane merged, a store migration, anything that touches the run
loop, the tools, the providers or the shell. It is a smoke test of the whole product, not a unit check; it does
not replace the part's own proof, it follows it.

It is **never** automatic. It is not in `pnpm check`, `pnpm test` collects nothing from it, and no hook or CI
step may call it. It runs when the owner asks for it, or when an agent asks the owner and is told yes.
An agent must not run it on its own initiative: it costs money the owner pays.

### Registering an endpoint, and storing its key

Any OpenAI-compatible endpoint works — a self-hosted or custom model as readily as a hosted one. Register it
once (`pnpm live-run --add-endpoint`; `pnpm live-run --endpoints` lists what is registered). The full flag
list is in the script's own header (`apps/desktop/scripts/live-run.mjs`, `USAGE`) — `pnpm live-run --help`
prints it.

The registry is `~/.rotaris/live-run/endpoints.json`. Keys live beside it, one file per endpoint, never in this
repository and never on a command line: on Windows `~/.rotaris/live-run/<name>.key.dpapi`, encrypted with DPAPI
— readable by **this account on this machine** and by nothing else — with the file's ACL reduced to the owner;
elsewhere `~/.rotaris/live-run/<name>.key` at mode 600. Where DPAPI is unavailable the key goes into
`<name>.key` with an owner-only ACL, and the script says so — the weaker protection is never silent.
`ROTARIS_LIVE_API_KEY` in the environment wins over the stored file, for a one-off or a machine where the hidden
prompt cannot run.

The script substitutes the key out of every log it writes and then asserts that no log holds a bearer or
anything shaped like an API key; the sign-in goes through the product's own dialog, so the credential lands in
the sandbox's credential store the way a person's would.

### Running it

```
pnpm live-run                        # the plan, the endpoint, the ceiling, the key's source — it does not spend
pnpm live-run --confirm              # the run, against the default endpoint
pnpm live-run --confirm --endpoint=openrouter
pnpm live-run --confirm --gui        # the same run, with the window on screen to watch
```

`--confirm` is required. The full flag list (`--endpoint`, `--model`, `--base-url`, `--budget`,
`--max-tokens`, `--only`, `--max-iterations`, `--gui`, `--keep`, `--skip-build`, `--keep-runs`,
`--session-log-level`, `--no-record-traffic`, `--duress-fixture`) is in the script's own header —
`pnpm live-run --help` prints it.

**The default scenarios measure several mechanisms at once, so a feature is proved working beside the others and
costs no scenario of its own.** `edit` splits REQ-103 between two children writing in parallel under declared write
scopes (PD-TOOLS-006), and every scenario that reads a session asserts its price exactly (PD-MONITOR-001 revision 2).
A new mechanism joins an existing scenario where one exercises it; a scenario of its own is the exception.

**One scenario is not in the default set and only runs when named**: `duress`, the long run. The ordinary live
run is a smoke test and stays one; a scenario that trebles its wall clock belongs behind `--only=duress`, and a
scenario nobody can leave out is a scenario people stop running.

The `requirements` scenario waits for the board rather than for a clock: every press after the release
names the state it needs, `LIVE_RUN_BOARD_MS` (900 s) is the deadline for all of them, and the capture
ends when the accept lands. A quick model does not pay the deadline; a slow one fails **once**, saying the
window expired, and the presses it never made are noted rather than reported as faults of the board.

The run is **unattended and the window is hidden** unless `--gui` says otherwise. `--gui` changes one
thing, `windowsHide` on the spawn: the scenarios are driven from inside the main process with
`sendInputEvent`/`executeJavaScript`, which need no focus, so watching cannot disturb the run and the
evidence is byte-identical either way. Typing into a shown window does reach the product, so watch it
rather than use it.

### What it costs, and what stops it

Two bounds always hold: the model the owner chose, and `runtime.max_iterations` written into the sandbox's
`agents.yaml`, so one confused run cannot spend the lot. The third is whatever the endpoint allows, and the
script names which one it used rather than implying a number it cannot know: **nothing** for an endpoint
registered `--unmetered` (the owner's own hardware — tokens counted, nothing stopping on them, unless the
invocation names a ceiling itself); else the **provider's own figure** (OpenRouter's `GET /key`); else the
**registered prices** over the store's token counts; else **tokens alone** against `--max-tokens`.

Crossing whichever ceiling applies stops the run there, records the figure and reports a failure.

**`--max-iterations` defaults to 500, raised from 15 on 2026-09-22 by the owner's decision.** Fifteen was a
bound while every scenario was a short task; the long run made it the thing being measured rather than a bound
on it — a delegating run reaches 15 while it is still commissioning, and then reports its own ceiling as a
result about the product. What the raise gives up is worth knowing before running against a metered endpoint:
the accounting gate between scenarios still holds, and so do `--budget` and `--max-tokens`, but there is no
longer a tight bound **within** one run. The endpoint it was raised for is registered `--unmetered`, where the
cost of a long run is wall clock. Name `--max-iterations` yourself on an endpoint that charges.

`--context=<tokens>` is for an endpoint whose `/models` payload does not declare a context window in a key
discovery reads — vLLM's `max_model_len` is one such. The number is written into the sandbox's `agents.yaml` as
`max_input_tokens` on a `models:` entry that **replaces** the snapshot layer's entry for the same model as
a whole (provider, `model_id`, `auth_provider`, `base_url` with it), which is what keeps the leased bearer
reaching the right endpoint.

### What it does

The workspace is a copy of `apps/desktop/scripts/fixtures/todo-app` in the system temp directory — a small
React todo application, its `docs/requirements/`, pure list functions in `src/todos.js` and a `node --test`
suite that needs nothing installed. It is committed to a fresh Git repository before the app opens it, so the
change can be read back from `git diff`. Its store is the conventional shape of `REQ-TRACE-002` — an epic at the
root and its children in the sibling directory — and its identifiers are `REQ-TRACE-022` identifiers, so the
requirements board can read it as readily as the agent can. Two requirements are approved and deliberately
unimplemented, one per path: `REQ-103` (clear the completed todos) is the work the third scenario hands over in
the composer, and `REQ-104` (count the completed todos) is the work the fourth releases from the board, so
neither path depends on what the other did.

| Scenario | What runs | What is asserted |
| --- | --- | --- |
| `sign-in` | Settings → Models → Add endpoint, filled and pressed in the product's dialog | the credential file, the snapshot's authenticated record, the catalogue, the bootstrapped `agents.yaml`, no credential in any log |
| `ask` | one real run: read `src/todos.js`, answer | the leased bearer, a request to the endpoint, a completed session, settled tool rows, usage figures, an answer naming the real exports |
| `edit` | one real run: implement `REQ-103`, then run the suite in the terminal | `clearCompleted` exported and tested, the terminal tool used, the session's tool-call total agreeing with the ring across every agent (`REQ-MONITOR-102`), `git diff` non-empty, and **`node --test` run again by the script itself** — the agent's own report is never the evidence |
| `requirements` | the board: `REQ-104` selected, the move control pressed, the release confirmed, the run watched to review and its decision taken | the card's own trail `backlog → running → review → done`, exactly one release and an accept in the delivery history, the run record carrying its session identifier and the permissions it was granted (`REQ-TRACE-464/472`), real usage from the endpoint, the run confined to a worktree of its own, `completedCount` exported and tested **inside that worktree**, and **`node --test` run there by the script itself** |
| `shell` | a relaunch with no prompt | Overview painted from the store: the sessions the runs left, the repository card's branch |
| `frictions` | one real run engineered to trip the inducible autopsy frictions, read back from the store | first-use `write_file` with no operation repair, SIGINT delivered with no platform refusal — **red by design until the fixes land**; the exit-trace friction is recorded but not inducible on demand, and the stall-abort one moved to `faults` |
| `faults` | two runs against an endpoint the proxy makes misbehave: a 429-then-500 ladder, and a stream that stops mid-answer with the socket open | the ladder run still completes; the stalled run does **not** report `user_cancelled` with nobody having pressed anything (defect 82's shape), **and the product is shown to have noticed the stall** in its own `issues` row — the negative alone would pass on a run that met no fault at all |
| `terminal` | one run issuing six commands the record names verbatim: a multi-line here-string, forty long lines, a wedge with no `timeout`, an exit-0 output carrying `FAILED`, a `git diff` exiting 1, a pipeline through a pipe | the here-string terminated; all forty lines arrived, none concatenated, none carrying an escape sequence; a call with no `timeout` was still bounded; exit 1 from `git diff` was not `shell_failure`; **no end marker in anything the model read**. The other two are NOTEs — they fire as their requirements specify — and a shape the model never issued is a NOTE too |
| `duress` | **opt-in** (`--only=duress`): one delegating run of **three dependent waves, six children**, under `LIVE_RUN_DURESS_MS` (default 40 min) against `--duress-fixture` | the autopsy's coherence section is clean (no null summary on a stopped run, no tokens against a zero cost); no child ended `failed` with nothing to say; a child that ran commands reported them; the `compressions` aggregate agrees with the timeline. Length, children and compressions are **reported**, so a run that was not duress says so |

An endpoint that discovers no model catalogue is not a dead end. The sign-in takes the dialog's own "Continue
anyway" (the zero-model recovery), the catalogue check is recorded as a **NOTE** rather than a silent pass, and
the script writes the `models:` entry the run needs into the sandbox's `agents.yaml` by hand — provider,
`model_id`, `auth_provider`, `base_url`, and the prices if they were registered — which is the same shape the
snapshot layer would have produced (`REQ-CONFIG-082..097`, `REQ-PROVIDER-091`).

### The evidence pack, and what it is for

Evidence lands in `.live-run/runs/<stamp>/` (gitignored). **Packs accumulate** — `.live-run/latest.txt` names the
newest and `--keep-runs` (default 10) prunes the oldest — so two runs can be compared, which they could not be
while each run emptied the directory.

At the pack's root: `results.json` with every check, the accounting kind and the spend; `agents.yaml` as the run
saw it; `build.log`; and **`workspace.db`, the store copied out of the sandbox before it is deleted**. Then one
directory per scenario:

| file | what it holds |
|---|---|
| `app.log` | the launch verbatim, key substituted out and asserted free of a bearer |
| `app.filtered.log` | the same log with a child MCP server's stderr dropped, consecutive repeats collapsed and the sandbox path shortened — two thirds of a launch log is one language server booting (OQ-63 rules that the *product's* log keeps every level, so this is the reader filtering, never the product) |
| `autopsy.txt` | `apps/desktop/scripts/autopsy.mjs` over that scenario's session |
| `session.log` | the product's own per-session log, at `--session-log-level` (default `INFO`) |
| `transcript.md` | every transcript row in full, not the 400 characters `results.json` keeps |
| `model-traffic.jsonl` | **what the model was sent and what came back** — request and response bodies, status and duration per call. The product logs a method and a URL and nothing else, so this exists nowhere else |
| `*.png` | the end of the scenario, plus one a fifth and one three fifths through its wait |
| `node-test.log`, `diff.txt`, `changed/` | where the scenario produces them |

**That shape is the run-autopsy skill's input.** `.agents/skills/run-autopsy/SKILL.md` asks for a launch log, the
session store and a session id; the live run produced all three and used to delete two of them with the sandbox,
which is why every defect that skill has found came from a session somebody drove by hand. Read a pack with
`pnpm autopsy .live-run/runs/<stamp>/workspace.db <session-id>`, or point the skill at the pack directory.

The sandbox itself is deleted at the end unless `--keep`. The record of what happened in it is not.

### The `faults` scenario — the endpoint misbehaving, on purpose

The proxy is in the path, so it can also be told to misbehave on a **named call**. Two launches:

- **`faults-ladder`** — a 429 on the second completion and a 500 on the third, neither of which reaches the
  endpoint, so the injected calls cost nothing. It asks whether the ladder waits, falls back and still finishes
  (`REQ-ORCH-091..094`).
- **`faults-stall`** — the bytes stop mid-answer and the socket stays **open**. It asks the eighty-second
  defect's question: a model timeout once collapsed into the same `aborted` flag a user's stop sets, and the run
  reported `user_cancelled` with nobody having pressed anything. The check is that it does not do so again.

This makes the first of the two frictions the `frictions` scenario reports as uncoverable inducible on demand;
that row's note points here. A rule names the **1-based index** of the call it fires at, deliberately: "the
second completion" is a reproduction, "some completion" is a coincidence.

**Both were executed against a real endpoint on 2026-09-22 and both passed on the product's side**
(`docs/architecture/first-executions.md`; pack `.live-run/runs/2026-09-22T09-05-35-955Z`). The ladder made five
calls against two refusals and completed; the stalled stream was noticed by the **idle bound at 120.5 s**,
classified `transient_llm_error`, retried at 121.5 s and finished — the first live evidence that the
eighty-second defect's repair holds.

Two things about the scenario itself were wrong and are repaired: the stalled call was **absent from the pack**
(its record was written only when the proxy let the socket go, and the product recovered first —
`docs/defects/fixed/the-stalled-call-was-the-one-call-missing-from-the-pack.md`), and
`stop_reason !== 'user_cancelled'` is a check that **cannot fail**, since a run that met no fault ends
`tasks_complete` too. It now carries a positive half: the product's own `issues` row must show it noticed, and
what it classified must not be fatal. `LIVE_RUN_STALL_HOLD_MS` must outlast the product's `llm_response_timeout`
(120 s) or the scenario measures the proxy letting go instead.

`faults-stall` holds the socket for `LIVE_RUN_STALL_HOLD_MS` (default five minutes) before letting go, so the
scenario is the slow one — it is opt-in with the others under `--only=`.

### The two duress scenarios, and the rule they obey

`terminal` and `duress` exist to enter one gap `docs/architecture/codebase.md` names: the live run "runs short
tasks against an unmetered endpoint, so it holds **no generation near the model timeout, no multi-line command,
and no re-spawn**" — and all seven defects one hand-driven session found lived in exactly that gap.

**The rule both obey is from the same page: replay the shape the record names, never a plausible family
resembling it.** Sixty real-PTY runs at four geometries could not reproduce a concatenation the live run had
shown, because the trigger was an *empty write between two non-empty ones* and none of the sixty carried it.
Sixty negative runs are not a negative result when none of them carries the input that failed. So `terminal`
issues the recorded commands verbatim, and asserts from `tool_calls` — what the agent passed, what came back —
rather than from what the model says it did.

**Three of the six shapes are NOTEs, on purpose.** The `FAILED`-marker warning and the pipe-to-shell deny fire
exactly as `REQ-TOOLS-113` and `REQ-TOOLS-036/038` specify; their notes exist to measure what they cost, not to
accuse the product. A shape the model never issued is also a NOTE. Reporting a faithful behaviour as a fault is
how a scenario teaches its reader to ignore it — the mistake the board scenario made twice.

`duress` asserts **coherence, not correctness**: a long run's failures are mostly records disagreeing with each
other, and `apps/desktop/scripts/autopsy.mjs` already computes most of them. What the model produced is never
asserted — a weak model doing the work badly is a fact about the model. Whether the run was long *at all* is
reported rather than assumed, including a note when it stopped at `--max-iterations` and was therefore bounded
by the harness rather than by the work.

**Its length comes from the work asked for, not from the fixture's weight** — ruled 2026-09-22, when a larger
fixture was considered and not taken. A five-file repository and a five-hundred-file one delegate exactly as
much as the prompt commissions, and a second fixture is a second tree to keep in step with five other
scenarios' prompts. So the prompt is **three dependent waves** — three children, then two that reconcile what
the three produced, then one that verifies all of it — because the parent's conversation grows monotonically
across waves, which is what reaches compression and re-spawn. A single wave of parallel children finishes in
minutes and measures the short path under a longer deadline. `--duress-fixture` remains for the question that
is about size specifically.

The shapes and the two readers live in `apps/desktop/scripts/lib/terminal-shapes.mjs`, pinned by
`terminal-shapes.test.ts` — a pattern that stopped matching its own command would turn every check in the
scenario into "never attempted" without anybody being told, so the test asserts the round trip in both
directions: every shape matches its own command, and none matches another's.

**`terminal` was executed against a real endpoint on 2026-09-22 and every check passed**: all six shapes were
issued, the here-string terminated, forty distinct lines arrived with none concatenated and no escape sequence
surviving, `git diff` exiting 1 read as `outcome success` rather than `shell_failure` — ESC-41's carve-out
proven live on the same machine whose unit test for it is red for an unrelated timeout — and no `__rot_` marker
reached the model. One shape did not reach its question: the wedge **soft-paused before the hard cap**, so
`hardMs`'s own bound is still unmeasured live, and the scenario says so rather than implying otherwise.

**`duress` has not been executed.** It owes its row in `docs/architecture/first-executions.md`.

**The traffic is recorded through a loopback proxy**, so the sandbox's `base_url` is the proxy and the endpoint
is one hop further on. Two consequences worth knowing before reading a pack: a `model request POST` line in
`app.log` names the proxy rather than the endpoint, and it is `model-traffic.jsonl` that says the call reached
the endpoint and what it answered. The proxy forwards chunks as they arrive and buffers nothing — a streamed
completion reaches the product exactly as the endpoint sent it, which
`apps/desktop/scripts/lib/model-traffic.test.ts` pins with a case that fails if it ever stops being true.
`--no-record-traffic` takes the proxy out of the path for the run where the proxy itself is the suspect.
Credentials never reach the file: `authorization` and the api-key spellings are replaced before it is written,
and the live run asserts that in `ask`.

The sandbox holds a **real credential** — the app writes the leased key into its own store, as it would on the
owner's machine — so the credential directory is deleted on every exit path there is: the normal end, `--keep`,
a thrown error, and a Ctrl-C. `--keep` keeps the workspace and the store to read and marks the directory `KEPT`;
the next run sweeps every unmarked leftover, and takes the credentials out of the marked ones too.

### Reading a failure

Each check prints `PASS`, `FAIL` or `NOTE` with its own sentence, so a red names the assertion rather than the
run. `results.json` holds the same list plus the per-scenario detail — iterations, tokens, tool names, the
answer, the diffstat. A failure in `edit` is usually worth reading beside `edit/changed/` and `edit/diff.txt`:
what the agent wrote is as informative as what the app did with it. A weaker or smaller model failing `edit`
while `ask` passes is a fact about the model, not necessarily about the product — say which you think it is.

Read the scenario's **`autopsy.txt` first** and its `app.filtered.log` second; `transcript.md` and the verbatim
`app.log` are there for the question the first two raise. A check that went red without the autopsy showing a
cause is itself worth reporting — it means the store recorded nothing about the failure.

A live-run failure is a **defect of the product**, not of the harness, until the harness is shown to be wrong.
Record what it found where the mechanism was decided, as the standing policy in `CLAUDE.md` requires.

### What the first execution found — 2026-09-11

Twenty-six checks, all green, against the owner's own vLLM endpoint (unmetered, the discovered model): sign-in
through the product's dialog, a run that read a file and answered, a run that implemented `REQ-TODO-003` — the
identifier it carried that day; the store was renumbered to `REQ-101`..`REQ-104` on 2026-09-11 so the board could
read it, and this record is left saying what it said — two
delegated children, twenty-five tool calls, the suite green when this script ran it itself — and the Overview
painted from the store afterwards. The credential reached no log.

### What the fifth scenario's first execution found — 2026-09-11

Twenty-one checks, all green, against the same endpoint: `REQ-104` selected on the board, released, and the run
that followed watched `backlog → running → review` and accepted into `done` — the product's own timestamps putting
the run at **101.6 s**, 82,786 tokens in and 2,005 out over one iteration, twelve distinct tools including a
delegated child and the terminal, the run confined to `rotaris-req-req-104-u1`, and `node --test` green inside that
worktree when this script ran it. The scenario itself found nothing; the defect it exists to catch was found by the
hand-driven precursor it was written from — the **eighty-first**, recorded in `codebase.md`'s live-run section: a
store whose every document the engine rejected read exactly like an empty store, because this fixture's own
identifiers were not identifiers and no surface but the board had ever parsed them.

It still found a defect, in the way this record says it would, and not through a red check — the persisted
tool-call total was the entry agent's own, not the session's (`REQ-MONITOR-102`), recorded in
`docs/architecture/first-executions.md`'s live-run row. The `edit` scenario now compares the session's counter
with the ring, by agent — the assertion that would have failed before the fix.

Two things it surfaced that are **not** defects, recorded so they are not re-investigated: the Overview metric
cards read the *attached* session, so they are zero in the `shell` scenario by design; and `iterations_completed`
counts run-loop passes, not model turns, so one prompt is one iteration however many tools it dispatched.

One thing left alone: an MCP server whose handshake predates `server/discover` logs a wall of validation errors to
stderr while the client recovers and connects (`packages/mcp/src/client.ts`). Nothing breaks and the fallback is
measured; the noise is the server's own, and quieting it is a decision for `REQ-MCP-048`'s record, not this one.

### The fixture

`apps/desktop/scripts/fixtures/todo-app` is checked in and is part of the repository's own `pnpm check` surface
only as text — nothing installs or builds it. Keep it dependency-free: the suite must run with a bare
`node --test`, because the sandbox has no network and nothing installed. Its `AGENTS.md` is the instructions
the agent under test reads, and the live run exercises that path too; change it deliberately.

Its requirement store is read by the **board** as well as by the agent, so two things about it are load-bearing:
the identifiers stay `REQ-TRACE-022` identifiers — the prefix, a hyphen, decimal digits and nothing else — and the
layout stays `REQ-TRACE-002`'s conventional shape. A store that breaks either is not a smaller store; it is a store
the engine rejects wholesale, which is what the board reads as empty. Renaming a requirement there also changes what
the `edit` prompt and the `requirements` scenario name: change the three together.
