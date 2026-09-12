# Agents working in this repository

`CLAUDE.md` states what governs this repository: the clean-room boundary, the approved inputs, the process
state, the architecture views and the design language. Read it first — nothing here relaxes any of it.

[`CONTEXT-MAP.md`](CONTEXT-MAP.md) is the vocabulary those documents fix: one `CONTEXT.md` per context, every
term derived from `docs/spec/` and citing the requirement that owns it. Read it before naming anything new,
and prefer its word over a synonym you would otherwise reach for.

This file covers the two checks `CLAUDE.md` does not spell out: **`pnpm app:drive`** (free, interactive
debugging of the built app) and **`pnpm live-run`** (the only check that spends real money).

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
```

`--confirm` is required. The full flag list (`--endpoint`, `--model`, `--base-url`, `--budget`,
`--max-tokens`, `--only`, `--max-iterations`, `--keep`, `--skip-build`) is in the script's own
header — `pnpm live-run --help` prints it.

### What it costs, and what stops it

Two bounds always hold: the model the owner chose, and `runtime.max_iterations` written into the sandbox's
`agents.yaml`, so one confused run cannot spend the lot. The third is whatever the endpoint allows, and the
script names which one it used rather than implying a number it cannot know: **nothing** for an endpoint
registered `--unmetered` (the owner's own hardware — tokens counted, nothing stopping on them, unless the
invocation names a ceiling itself); else the **provider's own figure** (OpenRouter's `GET /key`); else the
**registered prices** over the store's token counts; else **tokens alone** against `--max-tokens`.

Crossing whichever ceiling applies stops the run there, records the figure and reports a failure.

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
