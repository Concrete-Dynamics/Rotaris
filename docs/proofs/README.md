# The proof registry — which proof covers what

> **Generated** by `pnpm proofs:index` from [`tools/proof-registry/registry.mjs`](../../tools/proof-registry/registry.mjs);
> `pnpm lint` fails when this file is stale. Edit the registry, not this file.

Every proof launches the **built** application against a scratch profile and measures a mechanism in the
product rather than in a unit test. `pnpm check` — symbols, typecheck, lint, tests — is the gate every change
passes before it lands; these are the evidence beside it. Two rules govern their use, stated in
[`AGENTS.md`](../../AGENTS.md): run the whole suite a part touches, not the one script named after it — a change
that moves a shared seam breaks a neighbour's proof — and treat a red as a defect of the product until the
harness is shown to be wrong.

`pnpm <id>` runs an entry; the flags column is what a runner may pass it, `--skip-build` reusing the current
build where it stands. Unless its platform clauses say otherwise an entry runs to its end on Windows, Linux and
macOS; on a headless Linux host that means a display (`xvfb-run`, the wrapper the orchestrated build uses).
`live-run` is the one entry that spends real money against a metered endpoint; it is never automatic, and
`slice-proof` runs on its terms. A proof's detailed record — what it measures, version by version — is the
document its name links to.

## The run

| Proof | What it measures | Requires | Flags | Platforms | Neighbours |
|---|---|---|---|---|---|
| [`part-h-proof`](part-h-proof.md) | the loop supervisor and `continue` (ADR-0059), and the plan correction around a plan left open | — | `--skip-build` | all hosts | `part-j-proof`, `continuation-proof`, `plan-gate-proof`, `resilience-proof`, `compression-proof`, `mission-proof`, `todo-proof` |
| [`part-j-proof`](part-j-proof.md) | the control channel: queued messages, steering, pause and resume, the message-limit pause, a close during a run, and two windows at once (PD-SHELL-009) | — | `--skip-build` | all hosts | `part-h-proof`, `driver-proof`, `exit-trace-proof`, `notice-proof`, `approvals-proof`, `updater-proof` |
| [`continuation-proof`](continuation-proof.md) | PD-ORCH-004 revisions 3 and 4: a child cut off while making progress leaves a continuation offer a later root takes up | — | `--only=<scenario>[,…]`, `--skip-build` | all hosts | `part-h-proof`, `resilience-proof`, `mission-proof` |
| [`plan-gate-proof`](plan-gate-proof.md) | the plan gate held, edited and answered (ADR-0062) | — | `--skip-build` | all hosts | `part-h-proof`, `mission-proof` |
| [`resilience-proof`](resilience-proof.md) | the model ladder, the waits and the fallbacks, against scripted faults, and the recovery surfaces they raise | — | `--only=<scenario>[,…]`, `--skip-build` | all hosts | `part-h-proof`, `continuation-proof`, `compression-proof`, `mission-proof`, `notice-proof` |
| [`compression-proof`](compression-proof.md) | context compression and its timeline entries (ADR-0060), and the counts it reports | — | `--skip-build` | all hosts | `part-h-proof`, `resilience-proof`, `mission-proof` |
| [`checkpoint-proof`](checkpoint-proof.md) | the capture at iteration close through to the desktop restore (ADR-0039) | — | `--skip-build` | all hosts — its `hook-capture` launch reads a hook-written file on POSIX hosts (REQ-HOOKS-082) | `sessions-proof`, `restore-kill-proof`, `git-proof` |
| [`sessions-proof`](sessions-proof.md) | the session browser's actions: repair, delete with ref cleanup, the exports | — | `--skip-build` | all hosts | `checkpoint-proof`, `store-resolution-proof` |
| [`restore-kill-proof`](restore-kill-proof.md) | ADR-0058's restore killed between its two renames, and the next open putting the displaced store back (OQ-266) | — | `--trials=<n>` | all hosts | `checkpoint-proof`, `store-resolution-proof`, `workspace-proof` |
| [`store-resolution-proof`](store-resolution-proof.md) | a store's place holding no store resolved in Settings › Project — the refusal, the restore, the new store (OQ-281) | — | `--skip-build` | all hosts | `sessions-proof`, `restore-kill-proof`, `workspace-proof` |

## Tools

| Proof | What it measures | Requires | Flags | Platforms | Neighbours |
|---|---|---|---|---|---|
| [`fetch-proof`](fetch-proof.md) | `fetch` and its egress policy, read from saved configuration at every call | — | `--skip-build` | all hosts | `terminal-stream-proof`, `mcp-proof` |
| [`edits-proof`](edits-proof.md) | the edit directives PD-TOOLS-014 to PD-TOOLS-020, on a CRLF, tab-indented fixture | — | `--skip-build` | all hosts | `tool-shapes-proof`, `live-run` |
| [`questions-proof`](questions-proof.md) | `ask_questions`, the trailer row, the stepper, the two control operations | — | `--skip-build` | all hosts | `approvals-proof`, `transcript-proof` |
| [`approvals-proof`](approvals-proof.md) | approval waits through real dialogs under `ask`, the away and session rules included (PD-TOOLS-004/005/011) | — | `--only=<launch>[,…]`, `--skip-build` | all hosts | `questions-proof`, `part-j-proof` |
| [`todo-proof`](todo-proof.md) | the todo source priority, write-through edits, the pane | — | — | all hosts | `mission-proof`, `delegation-proof`, `part-h-proof` |
| [`attachments-proof`](attachments-proof.md) | content validation, ceilings, the capability gate, durable metadata | — | — | all hosts | `artifacts-proof`, `transcript-proof` |
| [`artifacts-proof`](artifacts-proof.md) | the session artifact store, the Artifacts tab, the inspector | — | `--skip-build` | all hosts | `library-proof`, `retrospective-proof`, `attachments-proof` |
| [`mcp-proof`](mcp-proof.md) | MCP declared three ways, against a real fixture server (ADR-0033/0034) | — | `--skip-build` | all hosts — its `.cmd`-runner check (REQ-MCP-113) is asserted on win32 only and stated not applicable elsewhere; the rest of the launch is measured on every platform | `fetch-proof`, `injection-proof`, `code-intel-proof`, `skills-proof` |
| [`code-intel-proof`](code-intel-proof.md) | the bundled code-intelligence runtime and its manifest (ADR-0035) | code-intelligence bundle | `--steps=<launch numbers or ranges>`, `--keep`, `--skip-build` | all hosts — its window sampler is Windows-only; elsewhere section 1 records the no-window check **not measured** with its reason (the instrument is missing, not the requirement) | `mcp-proof`, `injection-proof`, `init-proof`, `live-run` |
| [`skills-proof`](skills-proof.md) | portable skill discovery, with a scratch home and a scratch machine-wide root (ADR-0063) | — | `--skip-build` | all hosts — its scratch machine-wide root is exercised off Windows only (`ROTARIS_CAPTURE_SKILLS_MACHINE`) | `injection-proof`, `mcp-proof` |
| [`injection-proof`](injection-proof.md) | workspace-context injection as the model port received it — order, the per-file switches, a worktree's execution root — and REQ-WORKSPACE-049's cold-cache p95 | — | `--skip-latency`, `--latency-runs=<n>`, `--skip-build` | all hosts — the cold-cache latency reading is cold only on Linux; elsewhere it is labelled WARM and is not assessed against the bound | `mcp-proof`, `code-intel-proof`, `skills-proof` |
| [`sandbox-proof`](sandbox-proof.md) | OS-level confinement (ADR-0022): the host's own verdict, the refusal path where no backend exists, and REQ-SANDBOX-127's effects where one does | — | `--skip-build` | all hosts — its effects (REQ-SANDBOX-127) run only where a backend exists — bwrap on Linux, Seatbelt on macOS; on win32 and on Linux without bwrap it proves the refusal path | `terminal-proof`, `terminal-stream-proof` |
| [`terminal-stream-proof`](terminal-stream-proof.md) | the stream in the run host against a real PTY (ADR-0021), each command spelled in the host's shell | a packaged build for `--packaged` | `--packaged` | all hosts — its real-PTY section spells each command in the host's shell: PowerShell on Windows, the POSIX shell elsewhere (REQ-TOOLS-104) | `terminal-proof`, `sandbox-proof`, `tool-shapes-proof`, `fetch-proof` |
| [`tool-shapes-proof`](tool-shapes-proof.md) | two shapes of a tool call the live run could not be sure to ask: a terminal call's hard cap, and `write_file` with no operation | — | `--skip-build` | all hosts | `edits-proof`, `terminal-stream-proof` |
| [`delegation-proof`](delegation-proof.md) | three delegation features no built-app run had driven: follow-up, `delegates_to`, and swarm | — | `--skip-build` | all hosts | `mission-proof`, `todo-proof` |

## Configuration and startup

| Proof | What it measures | Requires | Flags | Platforms | Neighbours |
|---|---|---|---|---|---|
| [`config-proof`](config-proof.md) | hand-authored, commented files surviving every write (ADR-0036/0037) | — | `--skip-build` | all hosts | `settings-proof`, `notice-proof` |
| [`init-proof`](init-proof.md) | project initialization resolved once per workspace open (ADR-0064) | code-intelligence bundle | `--skip-build` | all hosts | `workspace-proof`, `notice-proof`, `code-intel-proof` |
| [`workspace-proof`](workspace-proof.md) | reaching a project folder from inside the application: resolution, gates, switch, and the initialization run's lifecycle | — | `--skip-build` | all hosts — scenario 8d kills the run host through `/proc` (Linux); scenarios 13b and 13c exercise the data and config directories off Windows and on Linux (REQ-STARTUP-145) | `init-proof`, `notice-proof`, `store-resolution-proof`, `restore-kill-proof`, `exit-trace-proof` |
| [`settings-proof`](settings-proof.md) | the Settings categories and the save bar, and the forms' Unset and announcement behaviour | — | `--skip-build` | all hosts | `config-proof`, `updater-proof`, `palette-proof` |
| [`updater-proof`](updater-proof.md) | the updater on the one path a development host can execute, and the two artifact variables' isolation | — | `--skip-build` | all hosts — the check, download, apply and restart against a real artifact are owed to the next Windows package (a Windows x64 host, deferred with the pipeline under R-071; IC-3 binds Linux and macOS artifacts), so the unsaved-settings guard is unit-tested over fakes and no development-host launch reaches it | `settings-proof`, `part-j-proof` |
| [`exit-trace-proof`](exit-trace-proof.md) | the exit trace's crash handlers in the built app (PD-MONITOR-002), and the quit paths beside them | — | `--skip-build` | all hosts | `part-j-proof`, `workspace-proof` |

## Surfaces

| Proof | What it measures | Requires | Flags | Platforms | Neighbours |
|---|---|---|---|---|---|
| [`overview-proof`](overview-proof.md) | the Overview painted from the run and the store | — | `--skip-build` | all hosts | `transcript-proof` |
| [`transcript-proof`](transcript-proof.md) | the projection, the caches, the empty state (ADR-0045/0046), and REQ-CHAT-055's append comparison | — | `--only=<stages>`, `--skip-build` | all hosts — stage 3c needs a window a window manager does not clamp; a host that clamps the window records the stage NOT ASKED in the verdict | `rows-proof`, `chat-controls-proof`, `attachments-proof`, `questions-proof`, `overview-proof` |
| [`rows-proof`](rows-proof.md) | the one row renderer, in both of its surfaces at once | — | `--skip-build` | all hosts | `transcript-proof`, `update-depth-proof` |
| [`update-depth-proof`](update-depth-proof.md) | two children streaming long deliberations at once on the Workspace view, under the `pendingLanes` trap (live-run finding D8) | — | `--skip-build` | all hosts | `rows-proof`, `mission-proof` |
| [`composer-proof`](composer-proof.md) | the composer's chips, drafts, history recall and run header, and Stop run's own control | — | `--skip-build` | all hosts | `slash-proof`, `chat-controls-proof` |
| [`slash-proof`](slash-proof.md) | the composer's slash-command catalogue | — | `--skip-build` | all hosts | `composer-proof`, `theme-proof` |
| [`chat-controls-proof`](chat-controls-proof.md) | manual compression, the transcript clear, the prompt-file commands | — | `--skip-build` | all hosts | `transcript-proof`, `composer-proof` |
| [`palette-proof`](palette-proof.md) | one action vocabulary reaching the screen three ways | — | `--only=<stages>[,…]`, `--skip-build` | all hosts — ADR-0048's host-input reading (`os-input.ps1`: a real Win32 click and keystrokes, and `IsWindowEnabled`) runs on win32 only; elsewhere its `results.json` states it not applicable and why, while the application's own `isEnabled` reading is still asserted | `settings-proof`, `notice-proof`, `mission-proof` |
| [`notice-proof`](notice-proof.md) | the notice store and its chain (ADR-0049), the configuration faults it raises, and the actions it reaches | — | `--only=<sections>`, `--skip-build` | all hosts | `part-j-proof`, `workspace-proof`, `palette-proof`, `config-proof`, `init-proof`, `resilience-proof` |
| [`library-proof`](library-proof.md) | the Library shell and its Prompts tab | — | `--skip-build` | all hosts | `artifacts-proof`, `retrospective-proof` |
| [`mission-proof`](mission-proof.md) | the Mission view, the per-agent inspector, the persona windows, and the tags and clocks they draw | — | `--skip-build` | all hosts | `part-h-proof`, `continuation-proof`, `resilience-proof`, `compression-proof`, `plan-gate-proof`, `todo-proof`, `delegation-proof`, `update-depth-proof`, `palette-proof`, `driver-proof` |
| [`git-proof`](git-proof.md) | the Git view, the worktrees, and the status strip's branch item | — | `--skip-build` | all hosts | `checkpoint-proof`, `requirements-runs-proof`, `layout-proof` |
| [`terminal-proof`](terminal-proof.md) | the terminal grid, the pop-out window, the transcript preview (ADR-0047) | — | `--skip-tests` | all hosts — its live section spells the size probe, the motion command and the flood in the shell its harness reports (REQ-TOOLS-104) | `terminal-stream-proof`, `sandbox-proof`, `live-run` |
| [`improvements-proof`](improvements-proof.md) | the reviewed-improvement lifecycle end to end | — | `--skip-build` | all hosts | `retrospective-proof` |
| [`retrospective-proof`](retrospective-proof.md) | the retrospective pass, driven from its surfaces against the built app (PD-LIBRARY-002), and the post-run analysis beside it | — | `--skip-build` | all hosts | `improvements-proof`, `library-proof`, `artifacts-proof` |
| [`theme-proof`](theme-proof.md) | the themes and scales, rendered — plus counterfactuals that must stay red | — | `--theme=<name>`, `--scale=<n>`, `--counterfactual=<name>`, `--output=<dir>`, `--skip-build` | all hosts | `slash-proof`, `layout-proof`, `ui-audit` |
| [`layout-proof`](layout-proof.md) | the Workspace view's grid, measured at the sizes the specification names | — | `--skip-build` | all hosts | `theme-proof`, `git-proof` |

## Requirements

| Proof | What it measures | Requires | Flags | Platforms | Neighbours |
|---|---|---|---|---|---|
| [`requirements-proof`](requirements-proof.md) | the delivery store and the board (ADR-0041) | — | `--skip-build` | all hosts | `requirements-runs-proof`, `traceability-proof`, `directive-proof` |
| [`requirements-runs-proof`](requirements-runs-proof.md) | runs started from the board, against a real scratch repository | — | — | all hosts | `requirements-proof`, `git-proof` |
| [`traceability-proof`](traceability-proof.md) | the traceability engine, including spike 7's scale store (ADR-0040) | — | `--skip-build` | all hosts | `requirements-proof`, `directive-proof` |

## The record itself

| Proof | What it measures | Requires | Flags | Platforms | Neighbours |
|---|---|---|---|---|---|
| [`directive-proof`](directive-proof.md) | that a directive's precedence over a requirement is machine-checked, not asserted in prose | — | — | all hosts | `requirements-proof`, `traceability-proof` |

## Whole product

| Proof | What it measures | Requires | Flags | Platforms | Neighbours |
|---|---|---|---|---|---|
| [`slice-proof`](slice-proof.md) | sign-in through the product and one run on a real model, on live-run's terms (R-068) | a registered endpoint with a stored key | `--endpoint=<name>`, `--paste-key`, `--from=<scenario>`, `--resume`, `--skip-build` | all hosts | `live-run` |
| [`driver-proof`](driver-proof.md) | the driver seam `pnpm app:drive` depends on | — | `--skip-build` | all hosts | `part-j-proof`, `mission-proof` |
| [`ui-audit`](ui-audit.md) | what the browser built at every size | — | `--sizes=<w×h,…>`, `--views=<n,…>`, `--discard-critique`, `--no-overlays`, `--skip-build` | all hosts | `ui-review`, `theme-proof` |
| [`ui-review`](ui-review.md) | the deterministic pack a report-only critic reads | — | `--iteration=<n>`, `--reshoot`, `--validate=<path>` | all hosts | `ui-audit` |
| [`live-run`](live-run.md) | the built product against a real endpoint and a real key — money; never automatic against a metered endpoint | code-intelligence bundle; a registered endpoint with a stored key | `--confirm`, `--endpoint=<name>`, `--only=<scenario>[,…]`, `--skip-build`, `--gui`, `--keep`, `--keep-runs=<n>`, `--budget=<usd>`, `--max-tokens=<n>`, `--max-iterations=<n>`, `--context=<tokens>`, `--no-record-traffic`, `--duress-fixture=<path>` | all hosts | `slice-proof`, `code-intel-proof`, `edits-proof`, `terminal-proof` |

