# Agents working in this repository

`CLAUDE.md` states what governs this repository: the clean-room boundary, the approved inputs, the process
state, the architecture views and the design language. Read it first — nothing here relaxes any of it.

This file covers one thing it does not: **the live run**, the only check here that spends real money.

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
once:

```
pnpm live-run --add-endpoint     # name, label, base URL, model id, optional prices, then the key (hidden prompt)
pnpm live-run --endpoints        # what is registered, which is the default, which has a key
pnpm live-run --add-endpoint --name=custom --label="My Endpoint" --base-url=https://host/v1 \
              --model=my-model --context=256000 --unmetered
                                 # the same, scripted; any field left out is asked for, and a terminal-less
                                 # shell must supply the key in ROTARIS_LIVE_API_KEY. Re-registering an
                                 # existing name keeps its stored key.
pnpm live-run --set-default=<name>
pnpm live-run --set-key    --endpoint=<name>
pnpm live-run --forget-key --endpoint=<name>
pnpm live-run --remove-endpoint=<name>
```

The **base URL** is the part before `/chat/completions` (the same string the product's "Add endpoint" dialog
takes). The **label** is what the product shows, and it decides the provider id the app stores the credential
under: `openai-compatible--<label lowercased, every run of non-alphanumerics one dash>` (`REQ-PROVIDER-051`). The
**model id** is whatever that endpoint calls the model. The two **prices**, in USD per million tokens, are
optional and only affect what the budget ceiling can measure (below).

The registry is `~/.rotaris/live-run/endpoints.json`. Keys live beside it, one file per endpoint, never in this
repository and never on a command line: on Windows `~/.rotaris/live-run/<name>.key.dpapi`, encrypted with DPAPI
— readable by **this account on this machine** and by nothing else, a copied file being useless elsewhere — with
the file's ACL reduced to the owner; elsewhere `~/.rotaris/live-run/<name>.key` at mode 600.
DPAPI needs a PowerShell host that can load `Microsoft.PowerShell.Security`, so the script probes PowerShell 7
first and Windows PowerShell second — 5.1 cannot always load it. Where neither can, the key goes into
`<name>.key` with its ACL cut to this account alone, and `--add-endpoint` and `--set-key` print which protection
they used: the weaker one is never silent.
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
```

`--confirm` is required. Useful flags: `--endpoint=<name>`, `--model=<id>` and `--base-url=<url>` (one-run
overrides), `--budget=<usd>` (default `1.00`), `--max-tokens=<n>` (default 500 000), `--only=ask,edit,shell`,
`--max-iterations=<n>` (default 15), `--keep` (keep the sandbox), `--skip-build`.

### What it costs, and what stops it

Two bounds always hold: the model the owner chose, and `runtime.max_iterations` written into the sandbox's
`agents.yaml`, so one confused run cannot spend the lot. The third depends on what the endpoint will tell us,
and the script names which one it used rather than implying a number it cannot know:

0. **nothing** — an endpoint registered `--unmetered`, meaning the owner's own hardware, carries no third bound
   at all. Tokens are still counted and reported; nothing stops on them. Naming `--budget=` or `--max-tokens=`
   on the command line puts a ceiling back for that one run.
1. **the provider's own figure** — OpenRouter answers `GET /key` with credits used; read before the first
   scenario and after each real run, the difference is what was actually spent;
2. **the registered prices** — the store's token counts times the USD per million entered at `--add-endpoint`;
3. **tokens alone** — an endpoint that reports no cost and carries no prices has no money figure at all, so the
   ceiling becomes `--max-tokens` instead, and `--budget` is not pretended to apply.

Crossing whichever ceiling applies stops the run there, records the figure and reports a failure.

`--context=<tokens>` is for an endpoint whose `/models` payload does not declare a context window in a key
discovery reads — vLLM's `max_model_len` is one such. The number is written into the sandbox's `agents.yaml` as
`max_input_tokens` on a `models:` entry. That entry **replaces** the snapshot layer's entry for the same model as
a whole, so the script writes the provider, `model_id`, `auth_provider` and `base_url` with it rather than the
lone field, which is what keeps the leased bearer reaching the right endpoint.

### What it does

The workspace is a copy of `apps/desktop/scripts/fixtures/todo-app` in the system temp directory — a small
React todo application, its `docs/requirements/`, pure list functions in `src/todos.js` and a `node --test`
suite that needs nothing installed. It is committed to a fresh Git repository before the app opens it, so the
change can be read back from `git diff`. `REQ-TODO-003` (clear the completed todos) is approved and
deliberately unimplemented there: it is the work the third scenario hands over.

| Scenario | What runs | What is asserted |
| --- | --- | --- |
| `sign-in` | Settings → Models → Add endpoint, filled and pressed in the product's dialog | the credential file, the snapshot's authenticated record, the catalogue, the bootstrapped `agents.yaml`, no credential in any log |
| `ask` | one real run: read `src/todos.js`, answer | the leased bearer, a request to the endpoint, a completed session, settled tool rows, usage figures, an answer naming the real exports |
| `edit` | one real run: implement `REQ-TODO-003`, then run the suite in the terminal | `clearCompleted` exported and tested, the terminal tool used, the session's tool-call total agreeing with the ring across every agent (`REQ-MONITOR-102`), `git diff` non-empty, and **`node --test` run again by the script itself** — the agent's own report is never the evidence |
| `shell` | a relaunch with no prompt | Overview painted from the store: the sessions the two runs left, the repository card's branch |

An endpoint that discovers no model catalogue is not a dead end. The sign-in takes the dialog's own "Continue
anyway" (the zero-model recovery), the catalogue check is recorded as a **NOTE** rather than a silent pass, and
the script writes the `models:` entry the run needs into the sandbox's `agents.yaml` by hand — provider,
`model_id`, `auth_provider`, `base_url`, and the prices if they were registered — which is the same shape the
snapshot layer would have produced (`REQ-CONFIG-082..097`, `REQ-PROVIDER-091`).

Evidence lands in `.live-run/` (gitignored): a PNG and a log per scenario, `results.json` with every check, the
accounting kind and the spend, `agents.yaml` as the run saw it, `diff.txt` and `changed/` for what the agent
wrote, `node-test.log` for the independent reading. The sandbox is deleted at the end unless `--keep`.

The sandbox holds a **real credential** — the app writes the leased key into its own store, as it would on the
owner's machine — so the credential directory is deleted on every exit path there is: the normal end, `--keep`,
a thrown error, and a Ctrl-C. `--keep` keeps the workspace and the store to read and marks the directory `KEPT`;
the next run sweeps every unmarked leftover, and takes the credentials out of the marked ones too.

### Reading a failure

Each check prints `PASS`, `FAIL` or `NOTE` with its own sentence, so a red names the assertion rather than the
run. `results.json` holds the same list plus the per-scenario detail — iterations, tokens, tool names, the
answer, the diffstat. A failure in `edit` is usually worth reading beside `.live-run/changed/` and `diff.txt`:
what the agent wrote is as informative as what the app did with it. A weaker or smaller model failing `edit`
while `ask` passes is a fact about the model, not necessarily about the product — say which you think it is.

A live-run failure is a **defect of the product**, not of the harness, until the harness is shown to be wrong.
Record what it found where the mechanism was decided, as the standing policy in `CLAUDE.md` requires.

### What the first execution found — 2026-09-11

Twenty-six checks, all green, against the owner's own vLLM endpoint (`Qwen/Qwen3.6-35B-A3B`, unmetered): sign-in
through the product's dialog, a run that read a file and answered, a run that implemented `REQ-TODO-003` — two
delegated children, twenty-five tool calls, the suite green when this script ran it itself — and the Overview
painted from the store afterwards. The credential reached no log.

It still found a defect, in the way this record says it would, and not through a red check:

**The persisted tool-call total was the entry agent's own, not the session's** (`REQ-MONITOR-102`). The store held
`sessions.tool_calls = 9` where the ring held 25 rows: `orchestrator` 9, `coding-agent` 13, `tester` 3. Two
surfaces read it. Overview's "Tool calls" card showed 9 of 25. Worse, the Inspector's synthetic run row computes
`max(0, total − Σ per-agent)`, which on any run that delegated is `max(0, 9 − 16)` — so the entry agent that had
just dispatched nine calls was drawn as **"0 tool calls"**. `run.ts` added only the entry agent's turns to the
aggregates; a child's count reached `children.tool_calls` and stopped there. The fix passes the run's aggregate a
counter the child settles into (`ChildrenDeps.countToolCalls`), so the total is maintained rather than recomputed,
as ADR-0008 requires, and every descendant counts once.

**The harness's own gap, from the same finding:** it asserted tool *names* and never tool *counts*, which is why
twenty-six green checks sat above a wrong number. The `edit` scenario now compares the session's counter with the
ring, by agent — the assertion that would have failed before the fix.

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
