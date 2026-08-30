---
reference: ROTARIS-CRW-001
domain: cli-headless
date: 2026-08-29
status: draft
---

# Command-Line and Headless Entry Points

## Overview

The product ships two command-line entry points: an interactive-capable one (`rotaris-cli`) that can open a terminal user interface, and a headless one (`rotaris-headless`) that never initializes any terminal UI and is intended for CI, scripts, and background execution. Wherever a command exists on both, the two surfaces behave identically apart from the closed list of divergences REQ-CLI-005 enumerates. A run started from either surface produces the same session artifacts on disk, the same machine-readable event stream when asked for one, and a process exit code derived from the same single run outcome that decides the printed text and the final stream event.

## Requirements

### Entry Points and Surfaces

**REQ-CLI-001** — Two console commands are installed: `rotaris-cli` (interactive-capable) and `rotaris-headless` (headless). Each prints a one-line product description in its help output, and the headless command's description marks it as the headless variant. Both are executable without any graphical or desktop component present.

**REQ-CLI-002** — No invocation of the headless entry point puts a terminal user interface on screen. Three checks make that observable. First, neither stdout nor stderr contains the escape byte `0x1B` anywhere in the process's output, so there is no alternate-screen switch, no cursor-visibility change, and no positioning or colour sequence. Second, every command of REQ-CLI-003 runs to completion with stdin, stdout, and stderr each attached to a file or a pipe rather than to a terminal, and returns the exit code it would have returned with a terminal attached. Third, where the process was started from a terminal, that terminal's echo and line-discipline settings after the process exits equal their values before it started, so no raw-mode switch is left behind. `rotaris-headless version` with all three standard streams redirected produces the output of REQ-CLI-010 and no further byte.

**REQ-CLI-003** — The headless surface exposes exactly these commands and groups: `run`, `sessions`, `version`, `setup`, `login`, `logout`, `checkpoints {list, restore}`, `events {list, replay, export}`, `requirements {run, list, verify, evaluate, migrate}`, and `providers {delete}`.

**REQ-CLI-004** — The interactive-capable surface exposes a superset: everything in REQ-CLI-003 plus `models refresh`, `providers {list, set-key, set-base-url, validate, reauth}`, `secrets {set, unset, unset-all, list}`, `config set-tavily-key`, and `improvements {list, show, rollback}`.

**REQ-CLI-005** — Where a command appears on both surfaces, invoking it with the same arguments against the same workspace state yields the same exit code and the same bytes on stdout, save for the divergences this document states. The complete list of stated divergences is:

- the headless surface draws no terminal user interface (REQ-CLI-002, REQ-CLI-047);
- the headless surface never starts the interactive login flow or the startup model editor of its own accord (REQ-CLI-041);
- headless `run` demands a task or `--session` and fails without one (REQ-CLI-045), and it resumes a `--session` given with no task (REQ-CLI-046) in circumstances where the interactive-capable surface would instead refuse the invocation (REQ-CLI-026);
- an `--output-format` value outside the choice set is refused during headless argument parsing (REQ-CLI-012) rather than by the check of REQ-CLI-025, though both exit 2;
- the headless surface renders a choice as a numbered prompt in every circumstance (REQ-CLI-129);
- headless diagnostics carry the `[INFO] `, `[WARN] `, and `[ERROR] ` prefixes of REQ-CLI-149.

Any observable divergence outside this list violates this requirement.

**REQ-CLI-006** — Given the headless entry point is invoked with no command at all, then help text is printed and the process exits 0.

**REQ-CLI-007** — Given a command group is invoked with no subcommand, or with a run of words that names no command in that group (`checkpoints` on its own, for example), then help text for the group is printed and the process exits 1. Open Question 10 records which stream carries that help text and whether the exit code is meant to differ from REQ-CLI-006.

**REQ-CLI-008** — Given `--help` or `-h` is supplied explicitly to the root parser, to a group, or to any subcommand on either surface, then usage text is written to stdout, stderr receives no byte, and the process exits 0. This covers an explicit request for help and nothing else: an invocation carrying no command at all falls under REQ-CLI-006 and one naming a group without a subcommand under REQ-CLI-007, and this requirement constrains neither the stream nor the exit code of those two cases.

**REQ-CLI-009** — Every argument of every command and group carries help text, and that text is non-empty. Where an optional argument takes a value and omitting it selects a particular value, that value appears literally in the argument's help text. Both properties are decided by walking the help output of every command and group and reading each argument entry; no judgement about wording quality is involved. Open Question 43 records whether a boolean flag must likewise state that it is off when omitted.

**REQ-CLI-010** — Given `version` (or `--version`) on either surface, then stdout contains exactly `Rotaris <version>`, stderr is empty, and the exit code is 0.

### Global Output and Exit Conventions

**REQ-CLI-011** — Success exits 0; failure exits non-zero. Human-readable errors, warnings, prompts, and progress diagnostics go to stderr; machine-consumable or primary structured output goes to stdout.

**REQ-CLI-012** — Given an argument-parsing failure on either surface — an unknown flag, a missing required argument, or, on the headless surface, a value outside a declared choice set — then the process exits 2 and a diagnostic is written to stderr; for an unknown flag that diagnostic names the argument text that could not be recognized. On the interactive-capable surface an `--output-format` value outside the choice set is instead handled by REQ-CLI-025, which also exits 2.

**REQ-CLI-013** — Given a failing operation on any command, then the process must not terminate with an uncaught exception or a stack trace on stderr; every failure path is converted into a message plus an integer exit code.

### First-Run Machine Provisioning

**REQ-CLI-014** — Given any command other than `setup`, `version`, or `--version` is invoked on either surface, when dispatch begins, then first-run machine-tool provisioning is attempted before the command executes, and its progress lines are written to stderr prefixed `setup: `.

**REQ-CLI-015** — Given an installation that carries no bundled machine tooling to provision, then automatic provisioning takes no step: no line beginning `setup: ` reaches stderr, nothing is prompted for, the outcome reported is `complete`, and the requested command then runs exactly as it would have. Open Question 9 records the observable property that distinguishes such an installation from one that does carry tooling; until that is settled, a test cannot select the case this requirement describes.

**REQ-CLI-016** — Given automatic provisioning encounters a failing step, then it continues with remaining steps rather than aborting, and the requested command still runs.

### `run` — Arguments and Defaults

**REQ-CLI-017** — `run` accepts an optional positional task string plus: `--background`/`-b` (flag, default false), `--workspace`/`-w` PATH (default: current working directory), `--session`/`-s` ID, `--isolate` (flag), `--worktree` PATH, `--worktree-branch` NAME, `--config`/`-c` PATH, `--persona`/`-p` NAME, `--max-iterations` N, `--unsafe-outside-workspace` (flag, default false), `--output-format` with choices `text` (default) and `stream-json`, and `--logout` PROVIDER.

**REQ-CLI-018** — The workspace argument is always resolved to an absolute, symlink-resolved path before any configuration is loaded or any session is created; every subsequent path decision uses that resolved root.

**REQ-CLI-019** — `--max-iterations` overrides the configured iteration cap for this run only. When neither the flag nor configuration supplies a value, the effective cap is 20.

**REQ-CLI-020** — `--persona` overrides the configured default persona for this run only; `--unsafe-outside-workspace` enables file operations outside the workspace root for this run only. Neither is persisted to configuration files.

**REQ-CLI-021** — Given `--config PATH`, then the YAML at that path is overlaid field-wise on the resolved configuration, the workspace root remains the resolved workspace (the overlay cannot move it), and the session's persisted configuration snapshot reflects the overlaid values.

**REQ-CLI-022** — Given a `--config` overlay that sets only some fields of a persona (for example only its model), then the fields of that persona the overlay does not mention keep the values they held before the overlay was applied (for example the persona's system-prompt file reference). This field-wise behaviour is a property of the `--config` overlay; REQ-CLI-029 governs how the global and workspace layers combine, and Open Question 11 records the unsettled interaction between the two.

### `run` — Flag Gates and Their Order

**REQ-CLI-023** — On the interactive-capable surface these gates are evaluated in order and the first one that applies decides the outcome: (1) `--logout`, (2) an `--output-format` value outside the choice set, (3) `stream-json` with no task, (4) a worktree option without both `--background` and a task. On the headless surface a value outside a declared choice set is rejected during argument parsing with exit 2 (REQ-CLI-012), before any of these gates is reached.

**REQ-CLI-024** — Given `run --logout PROVIDER`, then the logout is performed and the process returns immediately: no configuration is loaded, no session is created, and no run starts.

**REQ-CLI-025** — Given an `--output-format` value that is neither `text` nor `stream-json` on the interactive-capable surface, then stderr receives `Error: unknown --output-format '<value>'; expected one of text, stream-json.` and the process exits 2. On the headless surface the same input is rejected by argument parsing with exit 2.

**REQ-CLI-026** — Given `--output-format stream-json` with no task on the interactive-capable surface, then stderr receives `Error: --output-format stream-json requires a task; it cannot start the interactive TUI.` and the process exits 2. On the headless surface `run` without a task is governed by REQ-CLI-045 whatever `--output-format` was given.

**REQ-CLI-027** — Given `--output-format stream-json` with a task, then the run is forced into background mode so that no terminal UI can ever claim stdout.

**REQ-CLI-028** — Given any of `--isolate`, `--worktree`, or `--worktree-branch` without both `--background` and a task, then stderr receives `Worktree session options require a task with --background.` and the process exits 1.

### Configuration Loading and Error Presentation

**REQ-CLI-029** — Configuration is assembled by merging a global layer with a workspace layer, the workspace layer winning. Scalar fields override one field at a time. Across those two layers, list-valued sections and the mapping-valued sections named here — tool lists, MCP server definitions, and model entries (REQ-CLI-032) — are substituted whole rather than combined element by element. This describes the global-to-workspace layering; the `--config` overlay is governed by REQ-CLI-021 and REQ-CLI-022.

**REQ-CLI-030** — Given configuration fails schema validation, then no stack trace reaches the terminal; instead each problem is printed to stderr as `Config error: <message>` and the process exits 1.

**REQ-CLI-031** — A configuration validation message occupies one line and reads `<config path>: <problem>`. The path names the offending value by walking from the root of the configuration document, one dot between segments, so a problem with a named persona is located as `personas.<persona-name>`. The problem is a plain-language phrase addressed to whoever edits the file; it carries no class or type name, no numeric or symbolic error code, and no term belonging to the vocabulary of a schema-checking library. A value the schema requires but the file omits is reported as `missing required field`, giving in full `personas.<persona-name>: missing required field`. Open Question 44 records the other problem phrases the schema layer can produce.

**REQ-CLI-032** — Given a model entry is missing required fields, then the problem is reported as exactly two messages: `Model '<name>' is incomplete: missing required field(s) '<f1>', '<f2>'.` and `Model entries are full replacements across config scopes, so any override for '<name>' must include '<fields>'.`

**REQ-CLI-033** — Given a configuration load fails specifically because model overrides are incomplete in their identifier or provider fields (the signature of a stale discovery snapshot), then the CLI writes `Detected incomplete provider model overrides. Refreshing authenticated provider models...` to stderr, performs a non-interactive model refresh across all authenticated providers, prints that refresh's summary, and retries the configuration load exactly once. Both surfaces implement this recovery.

**REQ-CLI-034** — Given the single retry in REQ-CLI-033 still fails, then the config errors are printed as `Config error: <message>` lines and the process exits 1. The total number of load attempts in this scenario is exactly two.

**REQ-CLI-035** — Semantic validation of the loaded configuration reports at least these six conditions. Each occurrence yields its own message, so a condition met N times yields N messages, and each message is delivered on stderr in the form REQ-CLI-030 and REQ-CLI-040 prescribe:
- no models are configured at all — `No models configured. Run 'rotaris-cli login' to authenticate a provider.`
- a startup model slot is left unset — a message beginning `<slot> is unconfigured.` that names the `rotaris-cli login` command as the remedy;
- a persona names a model that is not declared — `Persona '<persona>' references unknown model '<model>'`;
- the configured default persona is not declared — `Default persona '<persona>' does not exist`;
- personas delegate to one another in a cycle — a message naming the personas that form the cycle;
- the same tool is declared more than once — a message naming the duplicated tool.

Open Question 12 records the message texts that are not fixed above.

**REQ-CLI-036** — Given a semantic error that instructs the user to log in, and the interactive-capable surface is running not in background mode, then stderr receives `No models configured. Launching 'rotaris-cli login' to set up a provider...`, the interactive login flow runs, and on success configuration is reloaded and revalidated.

**REQ-CLI-037** — Given that auto-launched login fails, then its failure message is printed and the process exits 1.

**REQ-CLI-038** — Given `--background` is in effect, then auto-login is never launched; the validation errors are printed and the process exits 1.

**REQ-CLI-039** — Given every semantic error still outstanding concerns a persona referencing a model that is not declared, the interactive-capable surface is in use, and `--background` is not in effect, then stderr receives one `Config error: <message>` line for each outstanding error, then the single line `Launching startup model editor to fix model assignments...`, in that order and with nothing written to stdout; the terminal UI then opens with its model-assignment editor focused, and the process exits 0 once the user closes that UI. Open Question 5 records whether exit 0 is still correct where the editor is closed with the assignments unfixed.

**REQ-CLI-040** — Given semantic errors that match none of the special cases above, then each is printed as `Config error: <message>` and the process exits 1.

**REQ-CLI-041** — The headless surface performs the same load and the same single startup-recovery retry, but never auto-launches login and never opens a model editor: any residual validation error prints `Config error:` lines to stderr and returns 1.

**REQ-CLI-042** — Given a run started on the interactive-capable surface that is not in background mode, when `<workspace>/.rotaris/agents.yaml` assigns none of the startup model slots `small_model`, `medium_model`, `large_model`, `default_summary_model`, `fallback_model`, and `improvement_collector_model`, and the resolved configuration nevertheless supplies a value for at least one of them, then before the run proceeds the terminal UI opens on a review of the assignments the resolved configuration supplies for those slots. Given that workspace file assigns even one of the slots, no review appears. The headless surface never shows this review (REQ-CLI-041). Open Question 13 records whether `gatekeeper_model` belongs to the slot set this requirement tests, since REQ-CLI-137 walks seven slots and this one names six.

### `run` — Interactive Path

**REQ-CLI-043** — Given no task, or a task without `--background`, on the interactive-capable surface, then the terminal UI is started with the resolved workspace root and the resolved configuration (including the default persona, `orchestrator` when unset), a double-interrupt handler is installed for the duration, the handler is restored when the UI exits, and the process exits 0.

**REQ-CLI-044** — While the terminal UI is running, a first interrupt requests a graceful stop and a second interrupt requests a forced stop.

### `run` — Headless Differences

**REQ-CLI-045** — Given the headless `run` with neither a task nor `--session`, then stderr receives `Error: task is required for headless mode`, stdout is empty, and the process exits 1.

**REQ-CLI-046** — Given the headless `run` with `--session ID` and no task, then the named session is resumed with an empty task.

**REQ-CLI-047** — The headless `run` never falls back to a terminal UI; it always takes the background execution path regardless of whether `--background` was passed.

**REQ-CLI-048** — Worktree options (`--isolate`, `--worktree`, `--worktree-branch`) are forwarded to the run with identical meaning on both surfaces.

### Pre-Run Request Validation

**REQ-CLI-049** — Argument combinations that cannot start a run are rejected before any session is created, each producing a message that begins with the literal prefix `Error: `, an error run outcome, and exit code 1:
- `--isolate` together with `--worktree` → `Error: choose either --isolate or --worktree, not both.`
- `--worktree-branch` without `--isolate` → `Error: --worktree-branch requires --isolate.`
- any worktree option together with `--session` → `Error: worktree options apply only when creating a new session.`

**REQ-CLI-050** — Given a pre-run rejection, then no session identifier is announced (there is nothing to resume), and when a machine-readable stream was requested exactly one terminal `result` event is still emitted.

**REQ-CLI-051** — A message that already begins with `Error: ` is printed verbatim on the text channel and is never given a second `Error: ` prefix.

### Session Resolution and Worktree Binding

**REQ-CLI-052** — Given `--session ID`, then the recorded session state is loaded and its exclusive lock acquired. If the lock cannot be acquired, the run fails before starting with `Error: unable to acquire lock for session <id>` and exit 1.

**REQ-CLI-053** — Given a session is resumed, then before the run proceeds every child record the previous process left in a non-terminal state is closed out as `cancelled` and stamped with the time it was settled, while records already in a terminal state (`succeeded`, `failed`, `cancelled`, `blocked`) keep their recorded outcome, completion time, and artifacts. The configuration is then re-rooted into the worktree recorded on that session.

**REQ-CLI-054** — Given no `--session`, then a new session is created with an identifier of the form `YYYYMMDD-HHMMSS-<12 lowercase hex characters>`.

**REQ-CLI-055** — Given `--isolate` on a new session, then a dedicated Git worktree is created for that session on a new branch. Unless `--worktree-branch` supplies a name, the branch name is derived from `rotaris/session/<session_id>`. Whatever the source of the name, the branch that is actually created carries a name Git accepts, so after a successful launch `git branch --list` in the repository shows exactly one branch for the session and `git worktree list` shows the worktree bound to it. Open Question 14 records the sanitization rules that turn a supplied or derived name into an acceptable one; without them the branch a given input produces cannot be predicted.

**REQ-CLI-056** — Given an explicitly supplied `--worktree-branch` that cannot be sanitized into a valid Git branch name, then the run fails with `Invalid Git branch name: '<branch>'`.

**REQ-CLI-057** — Given the chosen branch name already exists, then creation retries deterministically with suffixes `-2`, `-3`, and so on for at most 50 attempts; on exhaustion the run fails with `Could not find a free branch name for '<branch>' after 50 attempts.` Only name collisions are retried; other Git failures surface immediately.

**REQ-CLI-058** — Created worktrees are placed under a configurable storage sub-path whose default value is `worktrees`, so a worktree created with the default in force is found at `<root>/worktrees/` and `git worktree list` reports it there. Open Question 15 records the root that sub-path is taken relative to and the configuration key that sets it; until both are fixed, the absolute location of a created worktree is not determined by this document.

**REQ-CLI-059** — Given `--worktree PATH`, then the path must already exist and must belong to the same repository as the workspace; otherwise the run fails with `Worktree directory does not exist: <path>` or `Attached path is not a worktree of this workspace repository.`

**REQ-CLI-060** — Given worktree binding fails for a newly created session, then that session is deleted, its lock is released, and the run fails before starting with `Error: could not create or attach the requested worktree: <detail>` and exit 1. A resumed session is never deleted by a failed launch.

### Launch Gate: Sandbox Availability

**REQ-CLI-061** — Given the configuration asks for an OS sandbox the host cannot provide, then the run does not start, no agent work is performed, the outcome status is error, and the process exits 1. No session identifier is announced, since there is nothing to resume (REQ-CLI-050). The reported message names the sandbox facility that is unavailable and states what the operator must install or enable to make it available. A requested `stream-json` stream holds exactly one line, a `result` event (REQ-CLI-087). Open Question 16 records the configuration key that requests a sandbox and the exact remediation wording.

**REQ-CLI-062** — The sandbox field reported at session start describes whether sandboxing is actually available on this host, not merely whether it was requested in configuration.

### Background Run Lifecycle and Persistence-Visible Effects

**REQ-CLI-063** — Given the same task, the same workspace, and the same configuration, a background run started from `rotaris-cli`, from `rotaris-headless`, from the desktop application, or through the programmatic entry point yields: the same set of file names beneath the session directory (REQ-CLI-213); events built on the same envelope and drawn from the same type vocabulary (REQ-CLI-088, REQ-CLI-090); and an outcome status drawn from the set of REQ-CLI-105 carrying the same meaning in each case. The persisted session state snapshot carries no field naming the entry point, the surface, or the command that started the run, so comparing the state snapshots of two such sessions cannot tell which produced which.

**REQ-CLI-064** — Given a background run starts, then the session directory `<workspace>/.rotaris/sessions/<session_id>/` receives at minimum: `run.log`, `summary.md`, `evidence/debug.log`, `evidence/events.jsonl`, `evidence/permissions.jsonl`, and `evidence/tool-calls.jsonl`.

**REQ-CLI-065** — Once a background run has launched, the session's persisted execution status reads `running`, the file `<session_dir>/evidence/debug.log` exists and receives that session's log output at the configured session log level, and the session diagnostics hold exactly two boundary rows for the run — one written when it starts and one when it ends — both attributed to the same actor. Open Question 17 records the configuration key and default for the session log level and the actor label those two rows carry.

**REQ-CLI-066** — Every run persists its events to `evidence/events.jsonl` unconditionally, whether or not a live stream was requested; asking for no stream still writes the file — it only means nothing is streamed out.

**REQ-CLI-067** — Given the event store cannot be opened or written, then the run carries on with a logged warning and, when streaming, keeps streaming; persistence trouble is never allowed to fail a run.

**REQ-CLI-068** — Lifecycle hook execution is ordered so that a hook reacting to the end of an iteration runs before that iteration's checkpoint is captured, ensuring the checkpoint includes the hook's effects.

**REQ-CLI-069** — Given the workspace has not been approved for hook execution, then no hook declared by the workspace configuration is run, while hooks declared in the user's own configuration run as usual. One notice is delivered on the run's human-readable text channel and recorded in the session diagnostics, carrying all of: the number of workspace-declared hooks that were not run, the path of the workspace configuration file that declared them, a statement that a workspace-declared hook runs shell commands and that this workspace has not been reviewed and approved, where the reader grants that approval, and the number of the reader's own hooks that ran unaffected. No `hook.start` or `hook.finish` event is published for a workspace-declared hook in such a run. Approval is decided against the base workspace even when the run is bound to a worktree; a hook that does run starts with its working directory set to the run's effective workspace root — the bound worktree when there is one, otherwise the workspace root. Open Question 18 records how a workspace is approved.

**REQ-CLI-070** — Given hooks were not run because the workspace is unapproved, or a hook was switched off during the run after repeated failures, then exactly one tally notice for each of those two situations is delivered after the run has finished. The tally for switched-off hooks carries the number of hooks switched off, a statement that they stay off for the remainder of the session, and a pointer to the session diagnostics where the output of those hooks can be read. Neither tally names an individual hook. Open Question 19 records how many failures switch a hook off and which channel carries the tally.

**REQ-CLI-071** — Provider credentials are prepared once for the whole run; any provider whose credentials cannot be resolved is recorded on the session diagnostics timeline rather than failing the launch.

**REQ-CLI-072** — Background runs record their own transcript. The first row is the user's task; the run's classified intent is recorded as a system row `Intent classified: <intent>`; the final system row for a normally completed run is `Run completed.` Every row carries a timestamp.

**REQ-CLI-073** — Given intent classification fails, then the run continues and the transcript row is amended with the fallback detail, for example `Intent classified: moderate_feature (fallback: classification pre-flight error: <detail>)`.

**REQ-CLI-074** — The classified intent of a run selects the delegation budget the run is held to: a cap on children active at once, a cap on children in total, and a cap on delegation depth. Absent a narrowing intent the caps are 6 active, 20 total, and depth 3. A small-feature intent narrows them to 2 active, 6 total, and depth 2. No intent widens a cap past the default. The caps are observable in the recorded child history: at no moment does the number of children in a non-terminal state exceed the active cap, the number of children created over the whole run exceed the total cap, or the length of a delegation chain exceed the depth cap. Open Question 20 records the full intent vocabulary and the cap values each intent selects.

**REQ-CLI-075** — Given a run stops because it reached its message limit, then the hand-off outlives the process: once the process has exited, the file `<session_dir>/.message_limit_paused` is present and the session's persisted execution status reads `paused_message_limit`. Open Question 21 records what sets the message limit, and Open Question 24 records the outcome and exit code that status produces, which REQ-CLI-105 does not map.

**REQ-CLI-076** — Permission decisions taken during a run are appended to `<session_dir>/evidence/permissions.jsonl`, and the effective permission mode is announced into the session record at run start.

**REQ-CLI-077** — Token usage figures published for a run are cumulative over that run. Reading the run's `usage.update` events in the order they arrive, no reported total is ever smaller than the corresponding total in the event before it. The totals carried by `session.end`, and the totals carried by the terminal `result`, both equal the totals of the last `usage.update` the run published.

**REQ-CLI-078** — Whatever ends a run — normal completion, failure, an interrupt, or an abrupt crash — the session lock is no longer held once the process has exited, and a stream that was requested receives `session.end` and then its terminal `result` before the stream ends. Artifacts belong to exactly one run: every line of a session directory's `run.log` and every record under its `evidence/` directory was produced by the run that owns that session, and no byte is added to that directory after the run's terminal `result` has been emitted. Two runs carried out one after the other therefore leave two session directories, neither holding anything belonging to the other.

**REQ-CLI-079** — Outcome recording: an unhandled failure sets execution status `failed` and records a transcript row `Run failed: <formatted error>`; a cancellation sets status `paused` and records `Run paused: interrupted by user.`; a normal return takes the status summarized from recorded progress.

**REQ-CLI-080** — Given the caller requested cancellation, then the reported outcome is always interrupted, even when the underlying work happened to complete before the cancellation took effect. A cancelled run must never also be reported as successful.

**REQ-CLI-081** — For a run started from either command-line surface, any improvement artifact the run produced is complete before the process exits. Once the process has returned its exit code, that artifact is present under `<workspace>/.rotaris/improvement_artifacts/`, is readable in full, and is reported by `improvements list`. A caller that waits for the process to exit therefore needs no polling, no retry, and no delay before reading it.

### Output Channels

**REQ-CLI-082** — `--output-format` accepts exactly `text` (default) and `stream-json` on both surfaces. The flag selects an output channel only and has no effect on execution. Explicitly passing `text` produces byte-identical output to omitting the flag.

**REQ-CLI-083** — Text channel: human-readable progress goes to stdout and errors to stderr. The first line is `Created session <id>` for a new session or `Resuming session <id>` for a resumed one, printed at the moment the session starts rather than after the run, so another terminal can reach the session while it is still going.

**REQ-CLI-084** — Text channel outcomes: a successful run prints `Done.`; a run that produced its own summary prints that summary instead of `Done.`; an interrupted run prints `Interrupted.` preceded by a newline; an error prints `Error: <message>` to stderr; a failed run prints its summary to stderr.

**REQ-CLI-085** — In `text` mode stdout carries no event stream: no line written to stdout parses as a JSON object bearing an `event` field, and no `stream-json` line is produced on stdout at all. Prose a run's own summary happens to contain is outside this requirement, since REQ-CLI-084 puts that summary on the text channel unaltered. The choice of channel changes nothing about persistence: `evidence/events.jsonl` is written exactly as REQ-CLI-066 requires.

**REQ-CLI-086** — In `stream-json` mode stdout carries one JSON object per line and nothing else. Every human-readable message — including the session announcement, `Done.`, warnings, prompts, and interrupt-handler messages — is redirected to stderr.

**REQ-CLI-087** — In `stream-json` mode a run that starts opens its stream with `session.start` and closes it with `result`, and `session.end` precedes that `result` on every path. Exactly one `result` is emitted per invocation. A run that never starts emits a lone `result`, with neither `session.start` nor `session.end` — this covers both a rejection by pre-run request validation (REQ-CLI-049, REQ-CLI-050) and a refusal by the sandbox launch gate (REQ-CLI-061), and in each case the stream holds exactly one line (REQ-CLI-103).

### Event Stream Schema

**REQ-CLI-088** — Every event is a JSON object carrying at least these four fields: `schema_version`, an integer, currently `1`; `event`, a string naming one of the types listed in REQ-CLI-090; `timestamp`, an ISO-8601 timestamp expressed in UTC; and `session_id`, the identifier of the session that emitted it. Fields beyond these four are fixed per event type: REQ-CLI-091 for `session.start` and `session.end`, REQ-CLI-092 for `tool.start` and `tool.finish`, REQ-CLI-093 for `transcript.row`, REQ-CLI-110 for `result`, and REQ-CLI-209 for `approval.requested`. Open Question 45 records the payloads of the event types in REQ-CLI-090 that no requirement here specifies.

**REQ-CLI-089** — While `schema_version` reads `1`, a release may add a field to an event type. It may not drop a field this document specifies, rename such a field, give an existing name a different meaning, or change the type of a value. Consumers ignore fields they do not recognize, which is what makes adding a field safe. Any change outside that allowance requires `schema_version` to be raised above 1. The wire schema version is counted independently of the version stamped on the session state stored on disk and of the programmatic API version (REQ-CLI-222): the three advance separately, and any two of them being equal at a given moment is coincidence rather than a guarantee.

**REQ-CLI-090** — The version-1 event type union comprises: `session.start`, `session.end`, `iteration.start`, `iteration.end`, `child.spawn`, `child.transition`, `child.complete`, `tool.start`, `tool.finish`, `permission.decision`, `verifier.result`, `verifier.progress`, `transcript.row`, `usage.update`, `error`, `result`, plus `hook.start`, `hook.finish`, `checkpoint.created`, `checkpoint.restored`, `gate.decision`, `gate.repair`, and `approval.requested`.

**REQ-CLI-091** — `session.start` reports the task, the workspace, the persona, the configured permission mode, the sandbox availability verdict, and the iteration cap. `session.end` reports status, stop reason, iterations completed, duration in seconds, token usage, and cost.

**REQ-CLI-092** — `tool.start` names the tool being invoked and carries the arguments it was invoked with, redacted per REQ-CLI-095. `tool.finish` carries an outcome classification drawn from a fixed vocabulary and the elapsed time of the call as a whole number of milliseconds. Every `tool.start` in a run is followed by exactly one `tool.finish` for the same call. Open Question 22 records the outcome vocabulary, the field names of both events, and the field that pairs a finish with its start; until those are settled, only the pairing count and the millisecond unit are testable.

**REQ-CLI-093** — A `transcript.row` event is published twice for a row: once when the row first appears and once when it reaches its settled content. Both publications carry the row's position within the transcript, and a consumer keyed on that position holds one row per position however many publications it received. Every string the payload contains, at any depth of nesting, is redacted under REQ-CLI-095 before any length limit is applied; a string that is still longer than 16,000 characters is published as its first 15,999 characters followed by a single `…`, so the published string is exactly 16,000 characters and its last character marks it as shortened. Since redaction runs first, a shortened string cannot expose part of a credential that redaction removes from the full string. Open Question 23 records which payload field carries the row position.

**REQ-CLI-094** — Every event round-trips through parsing: an event bearing an additional unrecognized field is still accepted by a version-1 parser, and structured payloads (child report artifacts, token snapshots, cost snapshots) travel as plain serialized data, so reading them requires no product-specific library.

### Secret Redaction

**REQ-CLI-095** — Redaction covers every string of every published event, at any depth of nesting, whatever the event type — including tool arguments, permission-decision summaries, approval summaries, and transcript rows. A credential that reaches an event by any route is redacted before the event is serialized; no event payload is exempt. The diagnostic file `evidence/tool-calls.jsonl` is not a published event stream and is governed by REQ-CLI-213; Open Question 42 records whether it must be redacted as well, since REQ-CLI-225 requires that credentials never appear unmasked in product output.

**REQ-CLI-096** — Given a credential value appears inside a tool invocation (for example an inline environment assignment of an access token), then that value appears under no key of any serialized event, while the surrounding human-readable text remains legible.

**REQ-CLI-097** — The same redaction rule serves both the machine-readable stream and any interactive approval prompt, so a value hidden in one is hidden in the other.

### Stream Writer Robustness

**REQ-CLI-098** — Each event occupies exactly one line of the stream and that line ends with a newline character. An event becomes readable at the moment it occurs: a consumer reading the stream line by line obtains a complete event without having to wait for the next event to be produced or for the run to reach its end.

**REQ-CLI-099** — No line of the stream mixes content from two events. Whatever rate events are produced at, and however many are produced at the same moment, every line taken on its own parses as one complete JSON object, and no line carries a fragment of a different event.

**REQ-CLI-100** — Given the consumer stops reading and closes the pipe before the run has ended — `rotaris-headless run ... | head -5`, for example — then the run continues to its own outcome and the process exits with the code that outcome dictates under REQ-CLI-105. Nothing about the closed pipe is written to either stream, and the outcome status recorded for the run is the one it would have reached had the consumer kept reading to the end.

**REQ-CLI-101** — Given an event cannot be serialized, then it is dropped with a logged warning rather than aborting the stream or the run.

**REQ-CLI-102** — Ending the stream more than once is harmless: a second or later request to end it changes nothing observable and reports no error. After the stream has ended, the process can still write to stdout and what it writes appears there. Each event line goes to whatever stdout is bound to when that line is produced, so a stdout redirected to a file, connected to a pipe, or captured by a parent process receives the events.

### Terminal Result and Exit Codes

**REQ-CLI-103** — Every exit path of a streamed run emits exactly one terminal `result` event: a pre-run argument rejection emits a lone `result` with status error; a mid-run crash still closes the stream with status error; an interrupt closes it with status interrupted.

**REQ-CLI-104** — A consumer of one invocation observes one terminal `result` event and no other: not none, and not two, whether the run reached its work or was refused before it started. It is the last event of the `stream-json` stream, and the last event a programmatic subscriber receives.

**REQ-CLI-105** — The status carried inside the final `result` event determines the code the process exits with, so the printed outcome, the event payload, and the exit code always agree. The complete mapping is: `completed` → 0, `failed` → 1, `error` → 1, `max_iterations` → 2, `interrupted` → 130.

**REQ-CLI-106** — A status not present in that mapping is a defect and must fail loudly rather than defaulting to success.

**REQ-CLI-107** — Outcome derivation never itself raises, and resolves in this precedence: an explicit error message wins over everything (status error, summary `Run failed: <error>`); an interrupt flag wins over recorded progress (summary `Run interrupted before completion.`); interrupt-class stop reasons (`stopped by user`, `interrupted by user`, `user cancelled at message limit`) yield interrupted; the failure-class stop reason `agent session aborted` yields failed no matter how much work had already succeeded, so an escalated child never reports success in CI.

**REQ-CLI-108** — Otherwise: a summarized status of `failed` yields failed; `paused` yields interrupted; `completed` with stop reason `iteration limit reached` yields max-iterations, otherwise completed. An unrecognized summarized status yields error with a message stating the status was not recognized and the outcome is unknown; it never falls through to success.

**REQ-CLI-109** — Given no progress record exists for the run, then the outcome is taken from the session's terminal execution status: `completed` yields completed, `failed` yields failed, and `paused` yields interrupted. Any other value, and an absent value, yield error carrying a message that states either that the run ended without a terminal status or that no run progress was recorded and the outcome is unknown; whichever message is used, this case exits 1 per REQ-CLI-105 and never yields completed. Open Question 24 records the outcome for `paused_message_limit` and which of the two error messages applies to which case.

**REQ-CLI-110** — The `result` payload carries: `session_id`, `status`, `summary`, `stop_reason`, `iterations_completed`, `report` (the last report artifact, reduced to its identifier, agent name, status, and path), `tokens`, `cost`, and `error`. An absent cost field means no cost data was collected at all; a cost field that is present but marked unavailable means model calls occurred for which no price could be determined.

### Interrupt Handling

**REQ-CLI-111** — Given a first interrupt signal, then the message `Interrupt received. Stopping all agents. Press Ctrl+C again to force exit immediately.` is emitted (surrounded by newlines) and a graceful stop is requested.

**REQ-CLI-112** — Given a second interrupt signal, then `Second interrupt received. Force exiting now.` is emitted, the forced-stop callback runs, the previous signal handler is restored, and the process terminates immediately with code 130.

**REQ-CLI-113** — An exception raised by an interrupt callback is logged and never propagated out of the signal handler.

**REQ-CLI-114** — In background mode both the first and the second interrupt set the shared cancellation signal; in `stream-json` mode the handler's own messages go to stderr so the very first interrupt cannot corrupt the JSON stream.

**REQ-CLI-115** — Cancellation requests a graceful stop; a stop that arrives before the run loop exists is remembered and replayed once, and a cancellation that arrives before the loop exists skips starting the agent run entirely.

**REQ-CLI-116** — Given a graceful stop does not complete within 30 seconds, then the run is hard-cancelled.

**REQ-CLI-117** — An interrupt raised inside a running loop is still converted into an orderly cancellation, so the lock on the session is still released and a terminal `result` event is still emitted.

**REQ-CLI-118** — The observable outcome of an interrupt is: status interrupted, exit code 130, `Interrupted.` on the text channel (on stderr when streaming), and a closed stream terminated by a `result` event.

### `sessions`

**REQ-CLI-119** — `sessions [--workspace/-w PATH] [--repair]` exists on both surfaces with identical behavior. Given a workspace with no sessions, then nothing is printed, stderr is empty, and the exit code is 0.

**REQ-CLI-120** — Each listed session occupies one line: two leading spaces, then `<session_id>`, two spaces, `<updated_at>` or the literal `unknown` where no update time is recorded, two spaces, `<schema_version>` or the literal `?` where none is recorded, two spaces, `<execution_status>` or the literal `unknown` where none is recorded. Sessions the product classifies as internal are omitted from the listing; Open Question 25 records what makes a session internal, without which a test cannot construct a session that must not appear.

**REQ-CLI-121** — Given a session's recorded owning process is no longer alive, then ` (stale)` is appended to its status (for example `running (stale)`) on both surfaces. Staleness is decided by process-liveness of the identifier recorded in the session lock; as long as that owner is still alive, staleness is never reported; an unreadable lock is likewise never treated as repairable.

**REQ-CLI-122** — `--repair` acts on every session whose recorded owning process is no longer alive: it sets that session's persisted execution status to `interrupted` and deletes its lock file. Each repair prints one line of the form `  repaired <session_id>  <old_status> -> interrupted  (<reason>)`, with two leading spaces, two spaces between fields, and a parenthesized reason that names the process identifier that is no longer running. Sessions whose owning process is still alive are left untouched, and one line is printed per session actually repaired. Open Question 26 records the exact wording of that parenthesized reason.

**REQ-CLI-123** — Given `--repair` finds nothing to repair, then `No session was left marked as running by a stopped process.` is printed. Repair is idempotent, exits 0 either way, and the ordinary listing is still printed after the repair output.

**REQ-CLI-124** — Given a session has been repaired, then its directory holds no `lock` file and its persisted execution status reads `interrupted`. A `checkpoints restore` issued against that session therefore acquires the lock and proceeds rather than failing with the lock error of REQ-CLI-052, and `run --session <id>` likewise acquires it. Open Question 27 records whether repair is required to unblock any operation beyond those two.

### `login`

**REQ-CLI-125** — `login [PROVIDER] [--reauth] [--workspace/-w PATH]` exists on both surfaces with the same three arguments and one shared flow; the surfaces differ only in the prompt presentation. Success prints the result message and exits 0; failure prints the message and exits 1. On the interactive-capable surface an interrupt during login prints `Cancelled.` and exits 1.

**REQ-CLI-126** — Before anything else, login ensures the global configuration directory exists, and additionally `$HOME/.config/rotaris` when a home directory is set. A failure to create either produces the warning `Failed to create global config directory: <detail>` but does not abort the flow.

**REQ-CLI-127** — Given `login` is invoked with no provider argument, then a chooser offers the built-in catalog in this order, with these identifiers and display names:

| Position | Identifier | Catalog display name | Chooser row |
| --- | --- | --- | --- |
| 1 | `concrete-cloud` | Rotaris Cloud (recommended) | as the display name, marked unavailable with the suffix ` — Coming soon` |
| 2 | `copilot` | GitHub Copilot | as the display name |
| 3 | `codex` | OpenAI Codex | `OpenAI Codex (Sign in with ChatGPT)` |
| 4 | `openai-compatible` | OpenAI-compatible | as the display name |
| 5 | `claude-code` | Claude Code (subscription) | as the display name |
| 6 | `deepseek` | DeepSeek | as the display name |

The chooser presents these six rows, in this order, and the identifier a chosen row resolves to is the one in the Identifier column. Open Question 46 records whether configured OpenAI-compatible instances appear in the chooser alongside the six built-in entries.

**REQ-CLI-128** — Given the unavailable cloud entry is chosen, then login fails with the message `Rotaris Cloud is coming soon.` and exits 1. Given a provider identifier that is in neither the built-in catalog nor the set of configured instances, then login fails with `Unknown provider: <id>` and exits 1. Given the chooser is cancelled, then the result reports the login as cancelled and the process exits 1, matching the failure exit of REQ-CLI-125. Open Question 48 records which of the three unknown-provider forms this document states — this one, REQ-CLI-155's, and REQ-CLI-159's — is canonical, since they differ in wording and in exit code.

**REQ-CLI-129** — Given both stdin and stdout are terminals, then the chooser is an arrow-key menu whose title carries the suffix "(Use Up/Down, Enter to confirm, Esc to cancel)", navigation wraps around, Enter confirms, Escape or an interrupt or end-of-input cancels, and the cursor is hidden for the duration. Otherwise a numbered prompt (`1) <name>`, `2) <name>`, ...) is used, where empty or invalid input cancels. The headless surface always uses the numbered prompt.

**REQ-CLI-130** — For browser-based providers, stored credentials are checked first: an already-authenticated provider prints `Using stored authentication for <name>.` and skips authentication. `--reauth` first discards stored credentials, printing `Discarded stored authentication for <name>.`, and forces a fresh sign-in.

**REQ-CLI-131** — A device-code sign-in prints its instruction message followed by `URL: <verification_url>` and `Code: <user_code>`. A browser-redirect sign-in prints `Opening your browser for login...` and `If your browser did not open, visit: <url>`, with a provider-specific instruction line where applicable (for example `Sign in with ChatGPT to authenticate Codex.`). Authentication errors print their message and exit as a failure.

**REQ-CLI-132** — After successful authentication, model discovery runs. A discovery error yields `Model discovery failed for <name>: <error>` and fails the login.

**REQ-CLI-133** — Given discovery returns no models, then a menu titled `No models were discovered. Choose recovery:` offers exactly the options `1) retry`, `2) try other provider`, `3) advanced config`, and `4) abort`. `retry` repeats discovery for the same provider and is granted at most 2 times per login; a further request prints `Model discovery retry limit reached.` and presents the menu again without running discovery. `try other provider` restarts the login from the provider chooser of REQ-CLI-127. `advanced config` enters the flow of REQ-CLI-140. `abort` fails the login with `Model discovery aborted` and exits 1 per REQ-CLI-125. Open Question 47 records whether the two-retry budget is reset when `try other provider` moves the flow to a different provider.

**REQ-CLI-134** — An OpenAI-compatible sign-in collects three values in this order. First a label, which is required; omitting it is reported as `OpenAI-compatible label is required.` and the sign-in fails. Second an endpoint URL, prompted as `Endpoint URL`; an empty answer selects `https://api.openai.com/v1`, the answer is normalized before use, and a value that cannot be parsed as a URL is rejected with an error message. Third an API key, which is required and is entered without echo. Open Question 28 records the normalization rules and the exact invalid-URL message, without which the second value's accept/reject boundary is not testable.

**REQ-CLI-135** — An OpenAI-compatible instance identifier is `openai-compatible--<slug>`, where the slug is the label lowercased with runs of non-alphanumeric characters collapsed to `-`. A label that produces an empty slug is rejected with a message requiring at least one alphanumeric character.

**REQ-CLI-136** — Given an OpenAI-compatible instance with the same identifier already exists and `--reauth` was not given, then the user is asked `Replace the existing provider instance '<label>'?` defaulting to no; declining reports cancellation.

**REQ-CLI-137** — Once an OpenAI-compatible sign-in has succeeded, the flow asks `Configure startup model assignments now?` with yes as the default. Accepting walks the startup model slots in the order `default_summary_model`, `improvement_collector_model`, `gatekeeper_model`, `small_model`, `medium_model`, `large_model`, `fallback_model`, asking for a model for each and offering a reasoning-effort value alongside it. The flow then asks `Configure persona-specific model overrides now?` with no as the default. Every assignment the user makes is written to `<workspace>/.rotaris/agents.yaml`; declining a question leaves the part of that file it would have written untouched.

**REQ-CLI-138** — A DeepSeek sign-in prompts `DeepSeek API key` without echo (required), discovers models against the DeepSeek endpoint, falls back to the advanced-configuration flow when zero models are discovered, and stores the key on success.

**REQ-CLI-139** — A subscription-token sign-in prints instructions for generating the token, then prompts `Claude Code subscription token (sk-ant-oat...)` with echo suppressed. A token whose shape is rejected fails the login, exits 1 per REQ-CLI-125, and its rejection message is printed unaltered. This provider runs no model discovery at all: it draws on a fixed built-in model list, so the zero-models recovery menu of REQ-CLI-133 never appears for it. On success the token is stored as REQ-CLI-145 describes. Open Question 29 records the accepted token shape and the contents of the built-in list, without which neither the rejection boundary nor the resulting model set is testable.

**REQ-CLI-140** — The advanced-configuration flow writes a minimal bootstrap `<workspace>/.rotaris/agents.yaml` (default persona `orchestrator`) without ever overwriting an existing file, opens the user's editor blocking on that file, re-validates the workspace configuration and reports each remaining error, and reports `manual config required`; the login is successful only if validation is then clean.

**REQ-CLI-141** — Editor resolution prefers `$EDITOR`, then `$VISUAL` (each split as a shell command and resolved on the executable search path), then the platform's default opener (`xdg-open` on Linux, `open` on macOS, `cmd /c start` on Windows). With no editor available the flow errors with `No editor found for this platform.` A non-zero editor exit reports `Editor exited with status <N>.` together with the editor's own error output.

**REQ-CLI-142** — On a successful login the flow: writes the bootstrap workspace configuration file if absent and reports whether it did; persists discovered models into the global discovery snapshot; offers `Open advanced config in your editor?` (default no); prints any residual configuration problems as `Post-login config warning: ...`; and returns `Login complete for <name>; discovered <N> model(s).`

**REQ-CLI-143** — After a discovery has been written into the snapshot, the snapshot has these observable properties. Every model the discovery returned appears in it, including each one the provider reported as unavailable, and an unavailable model carries the reason given for its being unavailable, so a later listing can show the model and the reason together. A model the provider did not report as usable is never assigned to a startup model slot. Where the provider named its own recommendation for `small_model`, `medium_model`, `large_model`, or `fallback_model`, the snapshot carries that recommendation in the slot. Models the snapshot already held that this discovery did not return are still present afterwards, and the count of those is the `preserved <M> previous model(s)` figure REQ-CLI-158 reports.

**REQ-CLI-144** — Running `login` again adds a provider without displacing providers already configured; API-key providers support multiple labelled instances. Later runs reuse the stored credentials, refreshing them when required, with no user interaction.

### Credential Storage

**REQ-CLI-145** — Credentials are stored as one JSON file per provider under a per-user data directory at `tokens/<provider_id>.json` (on Linux, `~/.local/share/rotaris/tokens/`). Each file may hold an access token, a refresh token, an expiry, an account identifier, and additional attributes such as the provider family and API base URL.

**REQ-CLI-146** — On POSIX systems the token directory is created with owner-only permissions (0700) and token files with owner-only read/write (0600). On Windows the files rely on profile access control and no permission claim is made.

**REQ-CLI-147** — Token writes are atomic (write to a temporary file in the same directory, then replace), so a crash never leaves a partially written credential file. A token file that cannot be read degrades to "no stored credentials" with a logged warning rather than failing the command.

**REQ-CLI-148** — Credential and configuration directories left by the product's previous name are adopted once by renaming them to the current names when the current path does not yet exist, so existing sign-ins keep working. A failed rename leaves the legacy directory untouched and emits a warning.

### Headless Prompt Conventions

**REQ-CLI-149** — On the headless surface, informational messages carry the prefix `[INFO] `, warnings `[WARN] `, and errors `[ERROR] `. Warnings and errors are written to stderr. Wherever another requirement reserves stdout — `stream-json` output (REQ-CLI-086, REQ-CLI-224) and the single-word `setup` outcome (REQ-CLI-173) — informational messages go to stderr as well, so the reservation holds. Open Question 30 records the stream for informational messages outside those reserved cases, where this requirement and REQ-CLI-011 disagree.

**REQ-CLI-150** — Headless confirmations render as `<prompt> [y/N]` or `<prompt> [Y/n]` according to their default, accept `y`, `yes`, `n`, and `no` case-insensitively, and treat any other input as the default. Headless model choices are numbered, with a `0) inherit/default` option whenever skipping is allowed.

### `logout`

**REQ-CLI-151** — Sign-out is reachable three ways with identical semantics: `logout [PROVIDER]` on either surface, and `run --logout PROVIDER` on either surface. It is always scoped to a single provider, clears that provider's stored credentials, retains its configuration, and reports one of exactly three results: credentials removed, nothing was stored, or the attempt failed.

**REQ-CLI-152** — Given no provider argument and an interactive terminal, then a selector offers just those providers for which credentials are stored, labelled with their catalog display name, or as `<snapshot display name> [<instance id>]` for OpenAI-compatible instances, or the bare identifier when no better label exists.

**REQ-CLI-153** — Given no provider argument and no interactive terminal, then the command fails with `Provider is required when interactive selection is unavailable.` and exit 1.

**REQ-CLI-154** — Given no provider holds credentials, then `No providers are available for logout.` is reported with exit 1. Given the selector is cancelled, then `Logout cancelled.` is reported with exit 1.

**REQ-CLI-155** — The provider identifier is trimmed and lowercased before resolution, and outcomes are:
- credentials existed → deleted, message `Signed out of <id>.`, exit 0;
- no credentials → `No stored tokens for <id>; nothing to do.`, exit 0 (a no-op is success);
- unknown provider → `Unknown provider: '<id>'. Known providers: <list>. OpenAI-compatible instances use ids like 'openai-compatible--my-label'.`, exit 2;
- deletion failed at the filesystem level → `Logout failed for <id>: <detail>`, exit 1.

**REQ-CLI-156** — For a hosted-cloud provider identifier, logout attempts one token revocation request against the provider before deleting the local credential, and abandons that request after 10 seconds. Whether the request succeeds, fails, or times out, local deletion still happens and the reported logout outcome is the one REQ-CLI-155 gives for the local deletion; the revocation attempt delays the command by at most 10 seconds beyond what a local-only logout would take. For every other provider identifier no revocation request is made at all. Open Question 31 records which identifiers count as hosted-cloud.

### `models refresh` and `providers` (Interactive Surface)

**REQ-CLI-157** — `models refresh [--provider ID] [--workspace/-w PATH]` re-synchronizes discovered models for every known provider (the built-in catalog union the providers recorded in the snapshot), or for one provider when targeted. The command exits 1 whenever the overall result is anything but success — including a failure of, or ineligibility of, an explicitly targeted provider.

**REQ-CLI-158** — A targeted but unauthenticated provider reports `Skipped <name>: not authenticated. Run 'rotaris-cli login <id>' first.` and counts as a failure. Each authenticated provider prints `Refreshing models for <name>...` followed by either `Model discovery failed for <name>: <error>` or `No models discovered for <name>.` (both failures) or `Refreshed <name>; discovered <N> model(s)[, preserved <M> previous model(s)].`

**REQ-CLI-159** — An unknown `--provider` value reports `Unknown provider: <id>. Known providers: <list>.` A bulk run ends with `Refresh complete: <N> provider(s) succeeded.` only when there were zero failures and zero skips; otherwise `Refresh finished: <parts>` where parts may include `<N> failed` and `<N> skipped (not authenticated)`. Residual configuration problems are printed as `Post-refresh config warning: ...`.

**REQ-CLI-160** — Given discovery is refused with an authentication or authorization error, then the stored credentials for that provider are discarded and `Discarded stored authentication for <name>.` is printed — except for the subscription-based Codex provider, where a still-valid token can coexist with a temporary refusal to list the model catalog.

**REQ-CLI-161** — `providers list` prints one line per known provider — the built-in catalog, plus every entry recorded in the discovery snapshot, plus every instance holding stored credentials — in the form `<provider_id>: <display_name> (<auth_flow>, authenticated|not authenticated[, key=<masked>][, base_url=<url>])`. The `key=` part appears only where a key is stored and the `base_url=` part only where a base URL is recorded. A masked key shows its first two and last two characters with asterisks in place of everything between them; a key of four characters or fewer is shown entirely as asterisks, and no listing ever shows a stored key in full. `<auth_flow>` is `api-key` for the OpenAI-compatible family and for DeepSeek, `device-code` for Copilot, `browser-redirect` for Codex and for the hosted-cloud identifiers, and `api-key` for any other provider. Open Question 32 records how many asterisks a masked value contains.

**REQ-CLI-162** — `providers set-key PROVIDER [--api-key KEY] [--no-validate]` prompts `API key` without echo when the key is omitted; refuses providers that do not use API keys with `<name> uses <flow>; use reauth instead.`; validates by attempting discovery unless `--no-validate` is given, refusing with `Validation failed for <name>: <error|no models discovered.>`; reports `Updated API key for <name>.` on success; exits 1 on failure.

**REQ-CLI-163** — `providers set-base-url PROVIDER BASE_URL [--no-validate]` normalizes the URL and errors on an invalid one; validates by discovery when credentials are stored; updates both the stored credential's base-URL attribute and the snapshot; reports `Updated base URL for <name>.`; exits 1 on failure.

**REQ-CLI-164** — `providers validate [PROVIDER] [--workspace]` performs the same work as `models refresh` for the given scope and exits 1 on failure. `providers reauth PROVIDER [--workspace]` runs the login flow forcing re-authentication and exits 1 on failure.

**REQ-CLI-165** — `providers delete PROVIDER [--yes/-y]` exists on both surfaces and deletes only user-defined OpenAI-compatible instances. A built-in provider is refused with `Provider <id> is built-in or not user-defined.` and an unrecognized instance with `Unknown user-defined provider: <id>.`; both exit 2.

**REQ-CLI-166** — Deletion confirms interactively with `Delete <id> user-wide? Workspace model references will not be changed. [y/N]`; declining prints `Deletion cancelled.` and exits 0. Given a non-interactive invocation without `--yes`, then `Error: non-interactive provider deletion requires --yes` is reported with exit 2. On success `Deleted user-defined provider <id>.` is printed to stdout, and both the snapshot entry and the stored credentials are removed. Failure messages go to stderr, success messages to stdout.

### `secrets` and `config` (Interactive Surface)

**REQ-CLI-167** — The secrets store manages per-MCP-server environment values as a mapping of server name to environment-variable name and value, held in `secrets.yaml` in either the workspace configuration directory (default) or the global configuration directory with `--global`/`-g`. Writes are atomic, and the configuration directory is guarded by a version-control ignore entry so secrets are not accidentally committed.

**REQ-CLI-168** — `secrets set SERVER KEY [VALUE] [--workspace/-w] [--global/-g]` prompts `Enter value for <KEY>` without echo when the value is omitted; an empty value aborts with `Aborted: no value provided.` and exit 1; success prints `✓ Set <server>.<KEY> = <masked>`, where masking shows the first two and last two characters with the middle replaced by dots and values of four characters or fewer are fully dotted.

**REQ-CLI-169** — `secrets unset SERVER KEY` prints `✓ Removed <server>.<KEY>` or `Not found: <server>.<KEY>`, exiting 0 in both cases. `secrets unset-all SERVER` prints `✓ Cleared <N> secret(s) for <server>` or `No secrets found for: <server>`.

**REQ-CLI-170** — `secrets list [--workspace]` prints a table titled "MCP Server Secrets" with columns Server, Key, and Value (masked), merging the global and workspace scopes and sorting the rows; an empty store prints `No secrets stored.`

**REQ-CLI-171** — `config set-tavily-key [KEY] [--workspace] [--global]` is a shorthand for setting the `TAVILY_API_KEY` value of the `tavily` server; it prompts `Enter Tavily API key` when the key is omitted, aborts an empty value with `Aborted: no key provided.` and exit 1, and reports `✓ Tavily API key saved: TAVILY_API_KEY = <masked>` on success.

### `setup`

**REQ-CLI-172** — `setup [--workspace/-w PATH]` exists on both surfaces and brings the managed machine tooling into a usable state: it detects what is already present, installs or repairs what is missing or broken, records the location of each managed tool, and pre-computes the workspace's merged MCP server configuration so a later run does not pay that cost. The managed tooling includes at least a version-control executable and a content-search executable. Given setup reports `complete`, then every managed tool it recorded exists at the recorded path and can be executed there. Open Question 33 records the full set of managed tools, without which "every managed tool" cannot be enumerated by a test.

**REQ-CLI-173** — All setup progress, per-step names, failure details, completion details, and cancellation messages go to stderr. Stdout receives exactly one word — the outcome — which is one of `complete`, `degraded`, `cancelled`, or `already-running`.

**REQ-CLI-174** — Setup exits 1 for the `degraded` and `cancelled` outcomes and 0 otherwise.

**REQ-CLI-175** — At most one `setup` runs on a machine at a time, enforced by an exclusive lock held under the global data directory for the duration of the command. Given a second invocation while the lock is held, then that invocation performs no provisioning step, leaves every managed tool as it found it, writes to stderr a line saying machine setup is already running, writes `already-running` and no other byte to stdout, and exits 0. Open Question 33 records the lock's path and the exact text of that stderr line.

**REQ-CLI-176** — Setup state is resumable: a versioned record persists per-step state, per-step outcomes, the paths of managed tools, and any capabilities left degraded, so a re-run continues rather than restarting from scratch.

**REQ-CLI-177** — The explicitly invoked `setup` command stops at the first failing step, whereas the automatic first-run provisioning of REQ-CLI-014 continues past failures and only emits `setup: ` diagnostic lines.

### Shared Conventions for the Object-Management Groups

**REQ-CLI-178** — Each command in the `checkpoints`, `improvements`, `events`, and `requirements` groups accepts `--workspace`/`-w PATH`; omitting it selects the current working directory. The destructive commands in those groups — `checkpoints restore` and `improvements rollback` — additionally accept `--yes`/`-y` and `--force`, and `providers delete` accepts `--yes`/`-y` on the same terms (REQ-CLI-165, REQ-CLI-166). Every command in these groups exits with a code drawn from REQ-CLI-179, except the `requirements` group, whose own convention is REQ-CLI-197, so a caller can decide what happened from the exit code alone without parsing any output.

**REQ-CLI-179** — Their exit-code convention is: 0 = the command carried out its stated action, including returning an empty result or accepting a declined confirmation; 1 = the operation ran and was refused or failed, with the reason on stderr; 2 = the addressed object does not exist, a filter value could not be parsed, or a destructive action was requested unattended without `--yes`.

**REQ-CLI-180** — Empty results are answers, not failures: sessions listing, checkpoint listing, improvement listing, event listing and replay, and the requirements listing, verification, evaluation, and migration commands all exit 0 when there is nothing to report.

### `checkpoints`

**REQ-CLI-181** — `checkpoints list --session/-s ID [-w PATH]` exists on both surfaces and prints exactly one row per checkpoint recorded for that session; a row carries at least the checkpoint's sequence number, and that number is the value `checkpoints restore --sequence` accepts for the same checkpoint. Given the session has no recorded checkpoint, then `No checkpoints are recorded for session <id>.` is written to stderr, stdout is empty, and the command exits 0. Open Question 34 records the columns that make up a row and the order rows are printed in; until it is settled, only the row count and the presence of the sequence number are testable.

**REQ-CLI-182** — `checkpoints restore --session/-s ID --sequence N [--force] [--yes/-y] [-w PATH]` first prints a preview of what the restore would do. Given the sequence does not exist, then `No checkpoint <N> is recorded for session <id>.` is reported with exit 2.

**REQ-CLI-183** — Given the preview reports the restore is blocked and `--force` was not given, then the restore is still attempted so that the refusal is captured in the session's recorded history, the blocking reason is written to stderr, and the command exits 1.

**REQ-CLI-184** — Given stdin is not a terminal and `--yes` was not given, then `Error: a non-interactive restore requires --yes.` is reported with exit 2 rather than blocking on a prompt that will never be answered.

**REQ-CLI-185** — Interactively, the command confirms with `Restore checkpoint <N> into <tree_root>? [y/N]`; declining prints `Restore cancelled.` and exits 0 leaving the tree untouched.

**REQ-CLI-186** — On success the command prints `Restored checkpoint <N>; <K> file(s) changed.` followed by either `Safety checkpoint <M> holds the pre-restore state.` or `No safety checkpoint was needed: the working tree already matched the last commit.`

### `improvements` (Interactive Surface)

**REQ-CLI-187** — `improvements list [-w PATH]` prints one row per improvement artifact stored in the workspace, ordered by the artifact's generation timestamp with the most recent first; a row carries at least the artifact identifier, and that identifier is the value `improvements show` and `improvements rollback` accept for the same artifact. Given the workspace holds no artifact, then `No improvement artifacts exist in <workspace>.` is written to stderr, stdout is empty, and the command exits 0. Open Question 34 records the columns that make up a row; until it is settled, only the row count, the ordering, and the presence of the identifier are testable.

**REQ-CLI-188** — `improvements show ARTIFACT_ID` prints a header with the generation timestamp, the source session, proposal status counts, and a rollback point rendered as `<ref> (<short commit>)` or `no rollback point recorded`, optionally a rolled-back timestamp, then the proposal rows and the version history. An unknown identifier reports `No improvement artifact <id> exists in <workspace>.` with exit 2.

**REQ-CLI-189** — `improvements rollback ARTIFACT_ID [--force] [--yes]` prints a preview; a blocked rollback without `--force` prints the reason and exits 1; a non-interactive invocation without `--yes` reports `Error: a non-interactive rollback requires --yes.` with exit 2; interactively it confirms with `Roll back improvement <id> in <tree_root>? [y/N]`.

**REQ-CLI-190** — A successful rollback prints `Rolled back improvement <id>; <K> file(s) changed.`, optionally `<N> proposal(s) returned to pending_review: <ids>` and `Safety checkpoint <sequence> holds the pre-rollback state.` A bookkeeping problem discovered after the tree was restored is reported as a warning on stderr without failing the command.

### `events`

**REQ-CLI-191** — `events list` prints, newest first, every session for which an event history was stored; when there are none, `No session in <workspace> has a stored event history.` is written to stderr with exit 0.

**REQ-CLI-192** — `events replay SESSION [-t/--type TYPE]... [-i/--iteration N]... [--since ISO] [--until ISO] [--json]` prints the stored event history of one session, restricted to the events the supplied filters admit and in the order the events were stored. A session identifier with no stored history is reported as `No stored session <id> exists in <workspace>.` with exit 2. A `--since` or `--until` value that is not an ISO-8601 timestamp is reported as `Error: --since/--until expects an ISO-8601 timestamp, not <value>.` with exit 2. A filter set that admits no event is an answer, not a failure: nothing is printed to stdout and the command exits 0 (REQ-CLI-180). Open Question 35 records how repeated `--type` and `--iteration` values combine and what the output looks like without `--json`; until both are settled, only the `--json` form and the two error cases above are testable.

**REQ-CLI-193** — Given `--json`, then the stored lines are re-emitted byte-for-byte, so one consumer can read a replayed history and a live `stream-json` run without distinguishing between them.

**REQ-CLI-194** — An unreadable line in a stored history produces `Warning: skipped unreadable event-store <detail>.` on stderr and is never fatal. Event types produced by newer builds are displayed rather than dropped.

**REQ-CLI-195** — `events export SESSION... [-o/--output PATH]` produces one trajectory document when a single session identifier is given and one batch document covering all of them when several are given. Two conditions are reported as warnings on stderr and neither fails the command: a session holding more than one run, where the warning states that the document covers every one of those runs; and a history from which the store's per-session retention cap discarded lines, where the warning states that events were discarded and that the document therefore covers only part of the run. That cap is 20,000 events per session by default and discards the oldest lines first, so a session whose history exceeded the cap exports a document covering only its later events. Given `--output PATH`, the documents are written there and `Wrote <N> trajectory document(s) to <path>.` is printed to stderr; given no `--output`, the documents are printed to stdout as pretty-printed JSON with object keys in sorted order. Both conditions exit 0. Open Question 36 records the document schema and the exact wording of the two warnings.

**REQ-CLI-196** — The `events` group is available on the headless surface identically, because a CI job with no terminal and only an exit code is the primary consumer of stored histories.

### `requirements`

**REQ-CLI-197** — The `requirements` group is present on both surfaces and follows its own exit-code convention in place of REQ-CLI-179:

| Code | Meaning |
| --- | --- |
| 0 | An answer was produced, an empty answer included. |
| 1 | The flow ran to its end and produced nothing reviewable: the requirement is left in the blocked state, and stderr names the stage that blocked it. |
| 2 | The invocation could not be carried out at all — there is no requirement store, the named requirement is not in the store, the named base commit does not resolve, the migration worklist is empty, the subcommand required `--actor` and it was not supplied, or the release was refused. |

**REQ-CLI-198** — `requirements run REQUIREMENT [-w PATH] [-c CONFIG] [--max-iterations N] [--base COMMIT] [--flow-id ID] [--actor NAME]` carries a single requirement through to a reviewable result without reading stdin and without ever prompting, so it can run with stdin closed. Progress goes to stderr. On success stdout receives exactly one line, the outcome, and no line of stderr begins `Error: `; on failure stdout is empty and stderr receives exactly one line beginning `Error: `. The exit code follows REQ-CLI-197. Open Question 37 records what makes a requirement eligible for this command, and Open Question 49 the vocabulary the single stdout outcome line is drawn from.

**REQ-CLI-199** — `requirements run` exits 1 when the configuration cannot be read or fails schema validation. It does not apply the semantic checks of REQ-CLI-035 as a precondition: given a configuration that parses and passes schema validation but whose model assignments cannot be used, the command still begins its flow, and the requirement ends in the blocked state with the blocking stage named on stderr, rather than the command reporting a startup failure and refusing to begin. On either surface, and whatever the configuration says, the command starts no login flow and opens no model editor.

**REQ-CLI-200** — `requirements list [-w]` prints requirement rows with their delivery state; an absent store prints `No requirement store exists in <workspace>.` and an empty store prints `The requirement store in <workspace> is empty.`, both to stderr with exit 0.

**REQ-CLI-201** — `requirements verify [-w]` runs the check suite once and `requirements evaluate [-w]` re-evaluates propagation; both put detail lines on stderr and one summary line on stdout, and both report the no-store sentence with exit 0 when there is no store.

**REQ-CLI-202** — `requirements migrate [REQUIREMENT] [-w] [--actor NAME]` with no argument lists the identifiers waiting on the migration worklist, reporting `No migration worklist is waiting in <workspace>.` when there are none. With an argument it records approval and plans a single execution unit; it modifies no source file, since carrying the work out is the job of `requirements run`.

### Unattended Safety and Approval Policy

**REQ-CLI-203** — `runtime.permission_mode` accepts `restricted`, `ask` (default), and `autonomous`, is overridable per persona, and treats any unrecognized value as `restricted`.

**REQ-CLI-204** — `runtime.allow_outside_workspace` defaults to false and is set for a single run by `--unsafe-outside-workspace`.

**REQ-CLI-205** — `runtime.allow_unsandboxed_autonomous` defaults to false. Given it is false, the session has no route to a human for approvals, and `autonomous` mode is requested while the host provides no OS sandbox, then the effective permission mode for that session is `ask` rather than `autonomous`. The effective mode — not the requested one — is what is recorded in the session record at run start and what `session.start` reports, so a consumer reading `session.start` sees `ask` in this case. Open Question 38 records the test that decides whether a session has a route to a human; until it is settled, the condition that triggers the downgrade cannot be constructed by a test.

**REQ-CLI-206** — `runtime.headless_approval_policy` defaults to `deny` and controls how an approval request is resolved when the host cannot ask a human: `deny` refuses the single tool call and lets the agent re-plan; `abort` refuses it and stops the run. Any unrecognized value behaves as `deny`.

**REQ-CLI-207** — `runtime.approval_timeout_seconds` is expressed in seconds and defaults to 300.0. The value 0 means an approval request waits with no deadline at all. A negative value is not a permitted configuration value. Open Question 39 records how a negative value is reported and what decision an expired request produces; neither is determined here, so a test can pin only the default and the meaning of 0.

**REQ-CLI-208** — Given a run is cancelled or fails while an approval request is still waiting for a decision, then the run reaches its terminal `result` and the process exits: it does not stay alive waiting for a decision that will not arrive, and it does not first wait out `runtime.approval_timeout_seconds`. Given the permission mode in force is changed while a run is under way, then the change reaches that run and nothing else: no configuration file on disk is written, and a run started afterwards begins from the mode the configuration states. Open Question 40 records what, if anything, is published for an approval request still outstanding when the run ends.

**REQ-CLI-209** — An `approval.requested` event is published before the request starts waiting for a decision. Its payload carries:

- `request_id` — the identifier that the `permission.decision` resolving this request repeats verbatim, so the two events can be paired on it.
- `agent_name` — the name of the agent whose call is being gated. Where the requester is a delegated child, this string equals character for character the name that child's `child.spawn` carried, so the two events join on equality. Where the requester is a run's entry agent, this is that agent's persona name and no `child.spawn` exists to join against. The field is blank only where no agent identity is bound to the request; where a name exists it is reported unaltered, never shortened or normalized.
- `persona` — the persona the request was matched against, blank only where the request carried none.
- `tool_name` — the tool call being gated.
- `rule_id` — the permission rule that gated it.
- `summary` — a single-line rendering of what approval is sought, redacted under REQ-CLI-095.
- `resolver` — the resolver that will decide the request, drawn from a fixed vocabulary that includes `brokered` and `headless`.
- `timeout_seconds` — the deadline that resolver will apply, or null where the request does not wait at all.
- `unattended_reason` — populated only where the request has no route to a human, the case REQ-CLI-206 governs, and blank for as long as an answer from a person remains possible.

A request that is later left unanswered until its deadline therefore carries a blank `unattended_reason`, since the field is fixed at publication. The fate of such a request is reported on the paired `permission.decision`, so a consumer that needs to know how a request ended joins the two events on `request_id` instead of reading either alone. Open Question 41 records the complete value vocabularies for `resolver` and `unattended_reason`.

**REQ-CLI-210** — A subscriber that fails while handling an event produces only a logged warning; the run itself is unaffected.

### Persistence Layout and Environment

**REQ-CLI-211** — The global configuration directory (on Linux `~/.config/rotaris/`) holds `agents.yaml`, `project_settings.yaml` (the provider and model discovery snapshot written by login and refresh), `secrets.yaml` when the global scope is used, and a `tools/` directory. The workspace layer at `<workspace>/.rotaris/` holds `agents.yaml`, `models.yml`, `secrets.yaml`, `tools/`, `sessions/<session_id>/`, and `improvement_artifacts/`.

**REQ-CLI-212** — Legacy workspace directories left by the product's previous name (a `.geraet-ai` directory in a workspace, and the corresponding legacy global configuration and data directories) are renamed once to their current equivalents when the current path does not already exist; a failed rename leaves the legacy directory in place with a warning.

**REQ-CLI-213** — A session directory contains: a schema-versioned JSON state snapshot; a `lock` file recording the identifier of the owning process and the time the lock was taken; `run.log`; `summary.md`; `evidence/debug.log`; `evidence/events.jsonl`, the persisted wire stream; `evidence/permissions.jsonl`; `evidence/tool-calls.jsonl`, a local diagnostic record of tool arguments as invoked, which is not part of the published wire schema and to which the event redaction of REQ-CLI-095 does not apply; and, once a message-limit pause has occurred, the `.message_limit_paused` marker file. Open Question 42 records whether `evidence/tool-calls.jsonl` must itself be redacted, since REQ-CLI-225 requires credentials never to appear unmasked in product output and this requirement exempts that file from event redaction.

**REQ-CLI-214** — Environment variables consumed by this domain are `EDITOR` and `VISUAL` (advanced-configuration editor), `HOME` (creation of the additional configuration directory during login), and `COLUMNS` (help-table width; narrow terminals may truncate flag names in help output).

**REQ-CLI-215** — Platform-dependent behaviour is confined to the cases a requirement in this document names, which are exactly: how keystrokes are read for the arrow-key selector (REQ-CLI-129); which default opener stands in for an unset editor (REQ-CLI-141); the permissions applied to credential files and their directory (REQ-CLI-146); the additional `$HOME/.config/rotaris` directory created during login where a home directory is set (REQ-CLI-126); and the filesystem locations of the per-user configuration and data directories, for which this document gives Linux paths as examples (REQ-CLI-145, REQ-CLI-211). Outside those cases the same command with the same inputs produces the same observable outcome — the same stdout, the same stderr, and the same exit code — on every supported platform.

### Programmatic Entry Point

**REQ-CLI-216** — A run started through the in-process programmatic entry point is an ordinary session. Given the same inputs as a command-line run, it produces the same set of file names beneath the session directory (REQ-CLI-213), the same events in the same order (REQ-CLI-217), and an outcome whose status maps through REQ-CLI-105 to the code the command line would have exited with. The session is listed by `sessions` in the line format of REQ-CLI-120, and `run --session <id>` at the terminal acquires its lock and resumes it. As REQ-CLI-063 requires, no field of the persisted session state names the entry point that started it.

**REQ-CLI-217** — Events delivered programmatically are identical in shape to the `stream-json` output, with `session.start` first and `result` last.

**REQ-CLI-218** — A slow consumer never stalls a run. Delivery to the caller passes through a buffer holding at most 1024 events; once it is full, additional events are dropped instead of suspending the agent that produced them partway through a tool call. The count of dropped events is exposed to the caller and reads zero whenever the consumer has kept pace; a positive count says the event stream the caller saw is incomplete. Dropping never alters the terminal outcome, which reaches the caller as a returned value rather than being recovered from the stream.

**REQ-CLI-219** — A programmatic cancellation behaves like an interrupt at the terminal: the outcome is interrupted with exit-equivalent code 130.

**REQ-CLI-220** — Worktree options mirror the CLI flags with the same mutual-exclusion rules, and an impossible combination is returned as an error result rather than raised as an exception.

**REQ-CLI-221** — An approval resolver callback returns one of `approve_once`, `approve_session`, or `deny`; any other return value, and any exception raised by the callback, is treated as a denial.

**REQ-CLI-222** — The programmatic surface declares an API version of `"1"`, counted separately from both the event schema version and the version of the session state stored on disk; only names it exports explicitly are stable.

### Cross-Cutting Invariants

**REQ-CLI-223** — A single run outcome feeds the printed result, the terminal `result` event payload, and the exit code the process returns, so all three always agree.

**REQ-CLI-224** — In `stream-json` mode stdout carries exclusively schema-valid JSON lines; every diagnostic, prompt, warning, and interrupt message goes to stderr; and the format flag never alters run behavior.

**REQ-CLI-225** — Credentials never appear in serialized events, never appear in provider error messages (an API key in a provider settings failure is replaced with `[redacted]`), and never appear unmasked in any listing. The one file this document places outside that rule is `evidence/tool-calls.jsonl` (REQ-CLI-213), whose status Open Question 42 records.

**REQ-CLI-226** — Destructive operations (checkpoint restore, improvement rollback, provider deletion) refuse to run unattended without `--yes`, exiting 2, rather than blocking on a prompt that will never be answered. A declined confirmation is a success (exit 0) that leaves the tree untouched.

**REQ-CLI-227** — Exactly one process runs a given session at a time, enforced by a filesystem lock recording the owning process identifier, released on every exit path including crashes and interrupts.

**REQ-CLI-228** — The session announcement line is printed the moment the session exists, not after the run ends, so a long run can be reached from another terminal; a run that never starts announces no session identifier because there is nothing to resume.

## Data & Formats

### Event envelope (wire schema version 1)

Every line of the `stream-json` stdout stream, and every line of `evidence/events.jsonl`, is a single JSON object with:

| Field | Type | Meaning |
| --- | --- | --- |
| `schema_version` | integer | Currently `1`. Versioned separately from the session state format on disk and from the programmatic API. |
| `event` | string | Type discriminator, one of the types in REQ-CLI-090. |
| `timestamp` | string | ISO-8601, UTC. |
| `session_id` | string | Identifier of the emitting session. |
| ... | varies | Type-specific payload fields. |

Fields a parser does not recognize are ignored, so a version-1 consumer can read output emitted by a newer release.

### Terminal `result` payload

`session_id`, `status` (one of `completed`, `failed`, `error`, `max_iterations`, `interrupted`), `summary`, `stop_reason`, `iterations_completed`, `report` (last report artifact reduced to identifier, agent name, status, path), `tokens`, `cost` (absent = no cost data at all; present but marked unavailable = calls occurred but were unpriced), `error`.

### Exit codes

| Context | Code | Meaning |
| --- | --- | --- |
| `run` | 0 | completed |
| `run` | 1 | failed or error (including all pre-run rejections) |
| `run` | 2 | iteration cap reached |
| `run` | 130 | interrupted |
| Object groups | 0 | stated action carried out, including empty results and declined confirmations |
| Object groups | 1 | operation ran and was refused or failed |
| Object groups | 2 | object not found, unparseable filter, or destructive action unattended without `--yes` |
| `setup` | 0 / 1 | `complete` or `already-running` / `degraded` or `cancelled` |
| Any | 2 | argument parsing failure |

### Session identifier

`YYYYMMDD-HHMMSS-<12 lowercase hex characters>`.

### Sessions listing line

Two leading spaces, then `<session_id>`, two spaces, `<updated_at or "unknown">`, two spaces, `<schema_version or "?">`, two spaces, `<execution_status or "unknown">`, with ` (stale)` appended to the status when the owning process is dead.

### Session directory layout

```
<workspace>/.rotaris/sessions/<session_id>/
  <state snapshot, schema-versioned JSON>
  lock                          # owning process id + acquisition time
  run.log
  summary.md
  .message_limit_paused         # present only after a message-limit pause
  evidence/
    debug.log
    events.jsonl                # persisted wire stream
    permissions.jsonl           # approval decisions
    tool-calls.jsonl            # verbatim diagnostics, outside the wire schema
```

### Configuration layout

```
<global config dir>/            # e.g. ~/.config/rotaris/
  agents.yaml
  project_settings.yaml         # provider/model discovery snapshot
  secrets.yaml                  # when --global is used
  tools/

<workspace>/.rotaris/
  agents.yaml
  models.yml
  secrets.yaml
  tools/
  sessions/
  improvement_artifacts/
```

Workspace values override global values field by field; list- and mapping-valued sections are substituted whole instead of being combined element by element.

### Credential files

`<per-user data dir>/tokens/<provider_id>.json`, one file per provider (or per OpenAI-compatible instance, whose identifier is `openai-compatible--<slug>`). Directory mode 0700 and file mode 0600 on POSIX; written atomically.

### Secrets file

`secrets.yaml` maps an MCP server name to a mapping of environment variable name to value, in either the workspace or the global configuration directory.

### Trajectory export document

One document per session, or a batch document covering several, emitted as pretty-printed key-sorted JSON on stdout or written to a path; carries a readable flag indicating whether the underlying history was truncated by the store's per-session retention cap (20,000 events by default, oldest lines dropped first).

## Open Questions

1. The interactive-capable `run` appears to ignore `--session`, a `--background` flag with no task, and a task without `--background`, letting all three fall through to a plain terminal-UI launch. No test or documentation pins this, so it is unclear whether these are intended behaviors, whether the terminal UI should receive the task and session, or whether they should be rejected as argument errors.
2. Headless `run --session ID` with no task resumes with an empty task string. The intended semantics of an empty-task resume — whether the agent continues its prior objective, waits, or errors — is not established.
3. Runtime emission of the later-added event types (`hook.start`, `hook.finish`, `checkpoint.created`, `checkpoint.restored`, `gate.decision`, `gate.repair`, `approval.requested`) is only partially wired. Which subsystems must emit which of these, and under what conditions, needs to be settled before consumers can rely on them.
4. Windows credential file protection relies on user profile access control with no explicit permission enforcement. Whether an explicit ACL hardening step is required is unresolved.
5. Precisely which output the interactive-capable surface produces when the startup model editor is opened after configuration errors (and whether exiting that editor without fixing the errors should still exit 0) is not fully pinned.
6. The boundary of the stable programmatic API is asserted (only explicitly exported names), but which internal entry point third parties may not depend on needs an explicit, testable statement.
7. Cost reporting distinguishes "no cost data" from "unpriced calls", but the exact conditions that produce the unpriced state across providers are not enumerated.
8. The per-session event retention cap and the programmatic delivery bound are both stated as defaults; which of them is operator-configurable, and through which configuration key, is not settled here.
9. REQ-CLI-015: what observable property of an installation decides that it carries no bundled machine tooling and that automatic provisioning is therefore a no-op? A test cannot currently tell the two installation kinds apart.
10. REQ-CLI-006 vs REQ-CLI-007: an invocation with no command at all exits 0 while a group invoked with no subcommand exits 1. Is that asymmetry intended, and which stream carries the help text in the exit-1 case? REQ-CLI-008 fixes stdout only for an explicit `--help`.
11. REQ-CLI-022 vs REQ-CLI-029: a `--config` overlay merges persona entries field by field, while the global-to-workspace layering substitutes mapping-valued sections whole. Do persona entries also merge field by field across the global and workspace layers, or is the overlay the only place that happens? Which reading is canonical?
12. REQ-CLI-035: the exact text is fixed for three of the six semantic conditions. What are the full messages for an unconfigured startup slot (the text after `<slot> is unconfigured.`), for a delegation cycle among personas, and for a duplicate tool declaration?
13. REQ-CLI-042 vs REQ-CLI-137: REQ-CLI-137 walks seven startup slots including `gatekeeper_model`, while REQ-CLI-042's first-run review is triggered by six slots that exclude it. Is `gatekeeper_model` a startup slot for the purposes of the first-run review, and is either list the canonical set?
14. REQ-CLI-055, REQ-CLI-056: what are the sanitization rules that turn a supplied or derived branch name into one Git accepts — which characters are removed, which are substituted, and by what? Without them, REQ-CLI-056's rejection case cannot be reproduced.
15. REQ-CLI-058: the worktree storage sub-path defaults to `worktrees`, but relative to which root (the workspace root, `<workspace>/.rotaris/`, or the global data directory), and which configuration key sets it?
16. REQ-CLI-061: which configuration key requests an OS sandbox, what values does it take, and what is the exact remediation text printed when the host cannot provide the requested sandbox?
17. REQ-CLI-065: which configuration key sets the per-session log level, what is its default, and what actor label is recorded on the run-start and run-end diagnostics rows?
18. REQ-CLI-069: how does a workspace become approved for hook execution — which command or surface grants the approval, where is the grant recorded, and what does the notice name as the place to perform the review?
19. REQ-CLI-070: how many failures switch a hook off for the remainder of a session, are they counted consecutively or in total, and on which channel is each of the two tally notices delivered?
20. REQ-CLI-074: what is the full vocabulary of classified intents (REQ-CLI-073 mentions `moderate_feature`, REQ-CLI-074 a small-feature intent), and what active, total, and depth caps does each select?
21. REQ-CLI-075: what sets the message limit that produces a `paused_message_limit` pause — which configuration key, what default, and is the limit counted per run or per session?
22. REQ-CLI-092: what is the fixed outcome vocabulary carried by `tool.finish`, and what are the field names of `tool.start` and `tool.finish`?
23. REQ-CLI-093: which field of a `transcript.row` payload carries the row position that a consumer keys replacement on?
24. REQ-CLI-109: with no progress record, what outcome does a terminal execution status of `paused_message_limit` produce, and which of the two error messages (`Run ended without a terminal status.` versus the no-progress-recorded wording) applies to which case?
25. REQ-CLI-120: what makes a session internal and therefore omitted from `sessions` output?
26. REQ-CLI-122: what is the exact text of the parenthesized reason on a repair line — the wording around the process identifier that is no longer running?
27. REQ-CLI-124: besides `checkpoints restore` and `run --session`, which operations is a repaired session required to unblock, and which requirement governs each of them?
28. REQ-CLI-134, REQ-CLI-163: what are the URL normalization rules applied to an endpoint or base URL (scheme defaulting, trailing-slash handling, path preservation), and what is the exact message for a URL that cannot be parsed?
29. REQ-CLI-139: what token shape is accepted for the Claude Code subscription token beyond the `sk-ant-oat` prefix shown in the prompt, and which models make up the fixed built-in list used in place of discovery?
30. REQ-CLI-149 vs REQ-CLI-011: REQ-CLI-011 assigns human-readable diagnostics to stderr, while REQ-CLI-149 puts headless `[INFO] ` messages on stdout. Outside the cases where stdout is explicitly reserved, which stream is canonical for `[INFO] `?
31. REQ-CLI-156: which provider identifiers count as hosted-cloud for the purposes of remote token revocation? REQ-CLI-127 lists only `concrete-cloud`, which is itself marked unavailable.
32. REQ-CLI-161, REQ-CLI-168: how many mask characters replace the middle of a masked value — a fixed count, or one per hidden character? The two requirements also differ in mask character (asterisk versus dot); is that intended?
33. REQ-CLI-172, REQ-CLI-175: which executables exactly make up the managed machine tooling, what is the path of the setup lock under the global data directory, and what is the exact text of the already-running announcement?
34. REQ-CLI-181, REQ-CLI-187: what columns make up a checkpoint listing row and an improvement listing row, and in what order are checkpoint rows printed?
35. REQ-CLI-192: how do repeated `--type` and `--iteration` values combine (union within an option, intersection across options?), and what is the output format of a replay without `--json`?
36. REQ-CLI-195: what fields make up a trajectory document and a batch document, and what is the exact wording of the multiple-runs warning and the truncated-history warning?
37. REQ-CLI-198: what makes a requirement eligible for `requirements run`, and what happens when one that is not eligible is named — is that the exit-2 unknown-requirement case or something else?
38. REQ-CLI-205: what test decides that a session has no route to a human for approvals — the headless surface, `--background`, a non-terminal stdin, or `runtime.headless_approval_policy` being in force?
39. REQ-CLI-207: how is a negative `runtime.approval_timeout_seconds` reported — as a `Config error:` with exit 1, or coerced to a valid value? And what decision is recorded when an approval request reaches its deadline unanswered?
40. REQ-CLI-208: when a run ends with an approval request still outstanding, is a `permission.decision` emitted for it, and if so with what decision value?
41. REQ-CLI-209: what is the complete value vocabulary for `resolver` beyond `brokered` and `headless`, and what values can `unattended_reason` take?
42. REQ-CLI-213 vs REQ-CLI-225: `evidence/tool-calls.jsonl` records tool arguments as invoked and sits outside the wire schema, while REQ-CLI-225 requires that credentials never appear unmasked in product output. Must this file be redacted, and if not, what protects it on disk?
43. REQ-CLI-009: must a boolean flag whose omission simply leaves it off also state that default in its help text, or does the "state the value that applies when omitted" rule bind only options that take a value?
44. REQ-CLI-031: `missing required field` is the only problem phrase this document fixes. What is the complete set of problem phrases a schema validation message can carry after the config path — for a wrong value type, an out-of-range value, an unknown key, and any other condition the schema can reject?
45. REQ-CLI-088: which payload fields do the event types that no requirement specifies carry — `iteration.start`, `iteration.end`, `child.spawn`, `child.transition`, `child.complete`, `permission.decision`, `verifier.result`, `verifier.progress`, `usage.update`, `error`, `hook.start`, `hook.finish`, `checkpoint.created`, `checkpoint.restored`, `gate.decision`, and `gate.repair`? Without them a version-1 consumer cannot be written against anything but the six specified types.
46. REQ-CLI-127 vs REQ-CLI-128: REQ-CLI-128 accepts a provider identifier drawn from either the built-in catalog or the set of configured instances, but REQ-CLI-127's chooser lists only the six built-in entries. Does the no-argument chooser also list configured OpenAI-compatible instances, and if so at what positions?
47. REQ-CLI-133: is the budget of two discovery retries reset when `try other provider` restarts the flow against a different provider, or does the budget span the whole `login` invocation regardless of provider?
48. REQ-CLI-128 vs REQ-CLI-155 vs REQ-CLI-159: an unrecognized provider identifier is reported three different ways — `Unknown provider: <id>` with exit 1 from `login`, `Unknown provider: '<id>'. Known providers: <list>. ...` with exit 2 from `logout`, and `Unknown provider: <id>. Known providers: <list>.` from `models refresh`. Is that divergence intended per command, or is one message and one exit code canonical for all three?
49. REQ-CLI-198: `requirements run` prints exactly one outcome line to stdout on success. What vocabulary is that line drawn from, and is it a fixed enum or free text?
