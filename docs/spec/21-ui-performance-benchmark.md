---
reference: ROTARIS-CRW-001
domain: ui-performance-benchmark
date: 2026-08-29
status: draft
---

# Installed UI Performance Benchmark Command

## Overview

The desktop package installs a separate, non-interactive command-line program, `rotaris-benchmark`, that captures the UI-visible portion of a persisted session into a self-checksummed JSON fixture, replays that fixture through the desktop application's own rendering path in fresh, headless, environment-pinned child processes, and reports timing, memory, and structural determinism metrics. Four public subcommands — `capture`, `replay`, `inspect`, `compare` — support the workflow "capture once, replay on two product revisions, compare the runs". Replay drives seven fixed workload phases per iteration (window construction, bulk state application, incremental appends, simulated token streaming, 1000 tail replacements, an idempotent re-application, and a resize sweep), records one JSON-lines metric record per phase, and derives per-run summaries containing raw values, percentile aggregates, robust memory-trend slopes, and six boolean determinism/leak invariants. The tool is a report generator, not a gate: invariant violations and crashed iterations are reported in the output, never in the exit code.

## Requirements

### Identity, installation, and invocation surface

- **REQ-UIBENCH-001** — The benchmark is a standalone console command named `rotaris-benchmark`, installed together with the desktop application when the desktop package is installed through a package manager. It is not included in frozen/bundled desktop installers; it exists only in environments where the desktop package is installed as a normal package.
- **REQ-UIBENCH-002** — The first whitespace-delimited token of every usage message, every help message, and every exit-2 argument-error message (REQ-UIBENCH-095) is the literal string `rotaris-benchmark`. That token does not vary with how the program was started: a renamed copy, a symbolic link, and an absolute-path invocation all emit byte-identical usage and help text. Help output lists the four subcommands of REQ-UIBENCH-005 and names no other command. The exit-1 messages of REQ-UIBENCH-096 and REQ-UIBENCH-097 fall outside this rule — in particular the single line required by REQ-UIBENCH-096 carries no program-name prefix.
- **REQ-UIBENCH-003** — The program is purely non-interactive: no prompts, no progress output, no color or terminal-detection behavior, and no visible window of its own (replay renders the product UI offscreen in child processes).
- **REQ-UIBENCH-004** — The published command surface is exactly the four subcommands of REQ-UIBENCH-005, and `--help` lists those four and nothing else. External callers may depend on those four forms alone: no alias, abbreviation, or further argument form is part of the interface, is documented in help output, or has help of its own. Any argument list an external caller supplies that does not form one of the four documented commands is an argument error — usage text on stderr, exit code 2 (REQ-UIBENCH-095).

### Command-line grammar

- **REQ-UIBENCH-005** — Exactly four public subcommands are accepted, and a subcommand is mandatory:
  - `capture SESSION_DIR --output PATH` — write the rendered-in-the-UI portion of a stored session out to a fixture file;
  - `replay FIXTURE --output PATH [--iterations N]` — re-render a fixture inside newly spawned child processes, collecting the results into a run directory;
  - `inspect RUN_DIR` — reduce the contents of one run directory to a JSON report on stdout;
  - `compare BASE_RUN CANDIDATE_RUN` — emit a JSON delta report between two run directories on stdout.
  Invoking with no arguments or an unknown subcommand prints usage text to stderr and exits with code 2.
- **REQ-UIBENCH-006** — `--output` is mandatory for both `capture` and `replay`; omitting it is a usage error (usage on stderr, exit code 2).
- **REQ-UIBENCH-007** — `--iterations` on `replay` accepts an integer and defaults to 3. A non-integer value is a usage error (exit code 2).
- **REQ-UIBENCH-008** — `replay --iterations N` with an integer N below 1 writes the single line `--iterations must be at least 1` to stderr, writes nothing to stdout, and exits with code 1. Nothing on the filesystem is created, modified, or removed before that exit — in particular the `--output` directory is not created. This value error is not a member of the exit-2 argument-error class of REQ-UIBENCH-095, and its message carries no program-name prefix (REQ-UIBENCH-002).
- **REQ-UIBENCH-009** — Every successful subcommand exits with code 0, as does a child iteration process that completes successfully.
- **REQ-UIBENCH-010** — `inspect` and `compare` print their entire report to stdout as JSON with 2-space indentation and lexicographically sorted keys, and print nothing else to stdout.
- **REQ-UIBENCH-011** — `capture` prints only its one-line privacy warning to stdout (REQ-UIBENCH-022); `replay`'s own process prints no report to stdout. Replay child processes inherit the parent's stdout/stderr uncaptured, so any diagnostic output they emit passes through verbatim.

### `capture` subcommand

- **REQ-UIBENCH-012** — A successful `capture` reads one stored session directory and produces one file: the JSON fixture at the `--output` path, carrying the top-level keys fixed by REQ-UIBENCH-018 and no others. It starts no child process and opens no network connection. Nothing is written outside that path and the parent directories created for it (REQ-UIBENCH-021), and every file beneath `SESSION_DIR` holds the same bytes after the command as before it. A capture that fails any check of REQ-UIBENCH-013 through REQ-UIBENCH-017 exits 1 having created or modified no output file.
- **REQ-UIBENCH-013** — If `SESSION_DIR` does not exist or is not a directory, capture fails with exit code 1 and a diagnostic naming the missing path.
- **REQ-UIBENCH-014** — `SESSION_DIR` is first expanded to an absolute, symlink-free path, and the location checks below run against that expanded path — so a relative argument, or `.` naming the current directory, is accepted whenever the directory it denotes sits in the right place. The expanded path must be `<workspace>/.rotaris/sessions/<session-id>` (parent directory named `sessions`, grandparent named `.rotaris`). Otherwise capture fails with exit code 1 and a diagnostic containing the exact sentence `SESSION_DIR must be <workspace>/.rotaris/sessions/<session-id>`. The workspace root is derived from the session path as the directory containing `.rotaris`.
- **REQ-UIBENCH-015** — Session state is loaded with the same precedence the desktop application uses:
  1. the split on-disk layout — `state/resume.json` (required for this path), plus optional `state/ui_transcript.json` holding `{"events": [...]}`, `state/ui_edit_diffs.json` holding `{"diffs": [...]}`, and `state/run_config.json` holding `{"config_snapshot": {...}}`;
  2. failing that, the legacy single-file layout `snapshot.json` directly under the session directory.
  If neither layout is present, capture fails with exit code 1 and a diagnostic `Session snapshot not found for <session-id>`.
- **REQ-UIBENCH-016** — When session state comes from the legacy `snapshot.json` file, a declared session schema version greater than 1 makes capture exit 1 with a diagnostic containing `Unsupported session schema version: <N>` and no output file. The split layout of REQ-UIBENCH-015 carries no such check, so the same session declaring version 2 is captured normally when it is stored in split form. The two intake paths therefore disagree on the same declared version; which behaviour is canonical is unresolved — see Open Questions.
- **REQ-UIBENCH-017** — Capture projects the session against the workspace configuration stored under the workspace root derived in REQ-UIBENCH-014. Two captures of the same unchanged session directory taken under two different workspace configurations may therefore differ in fixture content and in `fixture_checksum`, while `source_checksum` is unchanged between them because it depends on the session files alone (REQ-UIBENCH-019). If the workspace configuration cannot be read or cannot be parsed, capture exits 1 with a diagnostic naming the configuration path that failed, prints no privacy warning (REQ-UIBENCH-022), and leaves no output file. Which configuration files are consulted, and which of them must be present, is not fixed by this document — see Open Questions.
- **REQ-UIBENCH-018** — A fixture written by `capture` is one JSON object whose top-level keys are exactly `schema_version` (the integer 1), `source_checksum`, `transcript` (list), `agents` (list, ordered as the UI displays them), `todos` (list), `artifacts` (list), `kpis` (object), `run_state` (object), and `fixture_checksum` — no more and no fewer. This constrains capture's output only. What a fixture must contain in order to load is the shorter list of REQ-UIBENCH-024, and a fixture produced by other means may carry additional top-level keys and still load (REQ-UIBENCH-026). The prohibition of REQ-UIBENCH-023 likewise binds what capture emits and is not among the load-time checks, so a fixture built elsewhere that carries a prohibited key still loads.
- **REQ-UIBENCH-019** — `source_checksum` is a SHA-256 digest written as exactly 64 lowercase hexadecimal characters. Its input is every regular file at any depth beneath `SESSION_DIR` with no exclusions — dot-prefixed names and files inside dot-prefixed directories included — each identified by its path relative to `SESSION_DIR` written with `/` as the separator. Those relative paths are placed in bytewise ascending order, and for each file in that order the digest consumes the UTF-8 bytes of the relative path immediately followed by the file's own bytes, with no separator between them and none after the last. Directories and non-regular entries contribute nothing. Two session directories whose file names and file contents agree therefore produce the same `source_checksum` on any host, whatever its path separator, locale, or filesystem name encoding. How symbolic links found beneath `SESSION_DIR` participate is not fixed here — see Open Questions.
- **REQ-UIBENCH-020** — `fixture_checksum` is the SHA-256 hex digest of the canonical JSON serialization of the fixture object with the `fixture_checksum` key removed. Canonical serialization means: keys sorted, compact separators (`,` and `:` with no spaces), non-ASCII characters escaped, encoded as UTF-8 bytes. Checksums are therefore identical across locales, platforms, and filesystem encodings.
- **REQ-UIBENCH-021** — The fixture file is written as JSON with 2-space indentation, non-ASCII characters escaped, UTF-8 encoding, and no trailing newline. Missing parent directories of the output path are created. An existing output file is silently overwritten.
- **REQ-UIBENCH-022** — After a successful capture, the program prints exactly one line to stdout — `WARNING: this fixture contains transcript and tool content required for faithful rendering. Review it before sharing.` — and exits 0.
- **REQ-UIBENCH-023** — A fixture must not carry top-level keys named `config`, `credentials`, `environment`, or `workspace`. Nothing else is stripped or masked: conversation and tool text appear in `transcript` in full, at the length the UI would render. Every successful capture announces that residual content on stdout (REQ-UIBENCH-022).

### Fixture format and validation

- **REQ-UIBENCH-024** — Loading a fixture (by `replay` and by a child iteration) enforces three checks in this order, each failing with exit code 1 and the exact diagnostic shown:
  1. the top-level value is a JSON object and `schema_version` equals 1, else `unsupported Rotaris benchmark fixture schema`;
  2. `fixture_checksum` is a string equal to the recomputed canonical checksum (REQ-UIBENCH-020), else `fixture checksum mismatch`;
  3. the six keys `transcript`, `agents`, `todos`, `artifacts`, `kpis`, `run_state` are all present, else `fixture is missing UI-visible state`.
  These three are the only load-time checks; entry-level constraints are enforced later, per REQ-UIBENCH-033.
- **REQ-UIBENCH-025** — The checksum covers every top-level key except `fixture_checksum` itself — including `schema_version` and `source_checksum` — so mutating any covered field (for example emptying `transcript`) makes loading fail with the checksum-mismatch diagnostic.
- **REQ-UIBENCH-026** — `source_checksum` is produced by capture but is not required at load time: a hand-built fixture without it (or with an arbitrary value) loads, provided its `fixture_checksum` is consistent. Unknown extra top-level keys are permitted at load time but participate in the checksum.
- **REQ-UIBENCH-027** — A `transcript` entry must carry `timestamp`, `role`, and `text`. It may also carry any of `kind`, `tool`, `detail`, `full_text`, `full_detail`, `diff` (a nested object or null), `persona`, `event_key`, `status`, `duration`, `started_at`, `char_count`, and `stream_id`. An absent `kind` is treated as the value `"message"`; an absent optional key is otherwise equivalent to that key present at its default. An entry carrying a key outside the required and optional sets above fails the iteration that rebuilds it (REQ-UIBENCH-033) rather than the fixture load. The permitted values and types of the optional keys, and the default each takes when absent, are not fixed by this document — see Open Questions.
- **REQ-UIBENCH-028** — An `agents` entry must carry `id`, `name`, and `persona`. Where it carries `state`, that value must be one of `running`, `waiting`, `queued`, `done`, `failed`, `cancelled`. The order of the list is the order in which the agents are displayed. An entry may carry display keys beyond the four named here, but only keys drawn from the set the replay side accepts; a key outside that set, and a `state` value outside the six, fail the iteration that rebuilds the entry (REQ-UIBENCH-033) and never the fixture load, whose checks REQ-UIBENCH-024 lists exhaustively. Which further display keys are accepted, and whether `state` is mandatory, are not fixed here — see Open Questions.
- **REQ-UIBENCH-029** — Each `todos` entry requires `id`, `phase_id`, `status` (one of `done`, `active`, `open`), and `text`; `phase_name` is optional. Violations surface per REQ-UIBENCH-033.
- **REQ-UIBENCH-030** — An `artifacts` entry must carry `id`, `slug`, and `title`; an absent `kind` is treated as the value `"child_report"`. Further display keys may be present under the same accepted-key rule that governs `agents` (REQ-UIBENCH-028), and a key outside the accepted set fails the iteration per REQ-UIBENCH-033. Whether `kind` is drawn from a closed vocabulary, and which further display keys are accepted, are not fixed here — see Open Questions.
- **REQ-UIBENCH-031** — `kpis` must be a JSON object. Each of its keys — `cumulative_tokens`, `cumulative_cost_label`, `token_history`, `tool_calls`, `tool_call_breakdown`, `files_touched`, `uncommitted` — is optional, so `{}` is a valid value for the whole object and every absent key takes its default. A key outside that set fails the iteration per REQ-UIBENCH-033. The type and default value of each key are not fixed here — see Open Questions.
- **REQ-UIBENCH-032** — `run_state` must be a JSON object whose keys are drawn from `session_name`, `session_status`, `run_state`, and `active_model`. Where the inner `run_state` key is present, its value must be one of `idle`, `starting`, `running`, `pausing`, `paused`, `completed`, `failed`, `cancelling`, `cancelled`. Any other value of that key, and any key outside the four, fail the iteration that rebuilds the object (REQ-UIBENCH-033) rather than the fixture load. Which of the four keys are mandatory, and what values `session_status` may take, are not fixed here — see Open Questions.
- **REQ-UIBENCH-033** — Entry-level constraints are enforced as an iteration rebuilds the fixture's content, not when the fixture is loaded. An entry in `transcript`, `agents`, `todos`, `artifacts`, `kpis`, or `run_state` that carries a key outside the accepted set, or an enumeration value outside the sets fixed by REQ-UIBENCH-028, REQ-UIBENCH-029, and REQ-UIBENCH-032, makes the iteration handling it terminate with a non-zero status. For an iteration at index NNN this is observable as: no `iteration-NNN.jsonl` file in the run directory; an `iteration-NNN.crash` file recording that non-zero status (REQ-UIBENCH-041); every remaining iteration still executed; `replay` still exiting 0; and the run summary counting that iteration in `crashes` while it contributes nothing to `iterations` or `records`.

### `replay` subcommand — orchestration

- **REQ-UIBENCH-034** — Replay's observable order of operations is: (1) fully validate and load the fixture (all REQ-UIBENCH-024 errors occur before anything is created on disk); (2) create the output run directory; (3) freeze the fixture into the run directory; (4) run the requested iterations sequentially; (5) compute the run summary; (6) write the summary files.
- **REQ-UIBENCH-035** — The output run directory is created, including missing parents; if it already exists, replay fails with exit code 1 and creates or modifies nothing inside it.
- **REQ-UIBENCH-036** — The input fixture is copied byte-for-byte to `<output>/fixture.json`, preserving formatting verbatim, and child iterations replay this frozen copy.
- **REQ-UIBENCH-037** — Each of the N iterations runs in a fresh child process of the same benchmark program, started by the parent, writing to `<output>/iteration-NNN.jsonl`, where NNN is the zero-based iteration index zero-padded to 3 digits. Iterations run strictly sequentially in order 0..N−1, never in parallel.
- **REQ-UIBENCH-038** — One temporary settings directory is created per replay run, is shared by all iterations, and is deleted when replay finishes. It isolates the child processes from the user's real application settings; it does not isolate iterations from one another (settings written by iteration 0 are visible to iteration 1).
- **REQ-UIBENCH-039** — Each iteration process receives the invoking environment unchanged apart from a fixed set of overrides that: make the interface render with no on-screen output; pin one platform-independent widget style; pin a display scale factor of 1; set `LANG=C` and `LC_ALL=C`; set the standard user-configuration-home variable `XDG_CONFIG_HOME` to the run-scoped temporary settings directory of REQ-UIBENCH-038; and name that same directory in one benchmark-private variable. Testable consequence: changing the host's display scaling, widget style, colour theme, or locale settings and replaying the same fixture again leaves the structural counters (`widgets`, `qobjects`, `transcript_operations`) and all six invariants unchanged. The names and values of the overrides other than `LANG`, `LC_ALL`, and `XDG_CONFIG_HOME` are not fixed by this document — see Open Questions.
- **REQ-UIBENCH-040** — `replay` imposes no time limit: none on a single iteration, none on the run as a whole, and it never ends an iteration that is still running. An iteration that never finishes therefore leaves `replay` running until something outside the program intervenes; no timeout diagnostic is emitted, no exit code is reserved for a timeout, and no crash marker is written for that case. A caller that needs an upper bound must impose it from outside.
- **REQ-UIBENCH-041** — When a child iteration exits non-zero, the parent writes `<output>/iteration-NNN.crash` containing exactly `exit_code=<n>` followed by one newline, then continues with the remaining iterations. Replay itself still exits 0; crash evidence surfaces only in the run summary's `crashes` count.
- **REQ-UIBENCH-042** — After all iterations, replay computes the same summary `inspect` would produce, adds one top-level `fixture_checksum` key holding the loaded fixture's checksum, and writes `<output>/summary.json` (2-space indent, sorted keys) and `<output>/summary.md`. The top-level `fixture_checksum` key appears only in replay-written summaries, not in ad-hoc `inspect` output.
- **REQ-UIBENCH-043** — `summary.md` is UTF-8 text whose content is, in this order and with nothing else: the line `# Rotaris replay benchmark`; an empty line; the line `Iterations: <n>`, where `<n>` is the summary's `iterations` value; an empty line; then exactly one line for each phase present in the summary's `phases` object, the phases taken in bytewise ascending name order, each reading `- <phase>: wall p50 <x> ms; CPU p50 <y> ms`, where `<x>` and `<y>` are the p50 values of that phase's `wall_ms` and `cpu_ms` blocks. The file ends with a newline. A summary holding no phases yields no phase lines (REQ-UIBENCH-105). How `<x>` and `<y>` are rendered as decimal numbers is not fixed here — see Open Questions.
- **REQ-UIBENCH-044** — The resulting run directory is the unit consumed by `inspect` and `compare` and contains: `fixture.json` (verbatim input copy), `iteration-NNN.jsonl` (one per iteration that completed all phases), optional `iteration-NNN.crash` markers, `summary.json`, and `summary.md`.

### Child iteration behavior

- **REQ-UIBENCH-045** — Every child iteration re-runs all three checks of REQ-UIBENCH-024 against the frozen `fixture.json` before it opens any window. A run directory whose frozen fixture was altered after replay wrote it therefore yields crashed iterations and crash markers, not measurements.
- **REQ-UIBENCH-046** — A replay run leaves the invoking user's stored desktop-application settings exactly as it found them: no such file is created, read, modified, or deleted, and every one of them holds the same bytes after the run as before it. Anything an iteration stores is confined to the run-scoped temporary settings directory of REQ-UIBENCH-038 and disappears with that directory when replay finishes, so a completed run leaves no file behind outside its own output directory. A host on which the desktop application has never been installed or configured therefore replays a fixture to the same structural counters and the same invariant values as a host on which it has been used heavily.
- **REQ-UIBENCH-047** — Before the measured window exists, each iteration selects the same platform-independent widget style its environment already names (REQ-UIBENCH-039), loads the typefaces shipped inside the product package, and applies the product's own theme, so none of the three is taken from the host. Testable consequence: installing or removing fonts on the host, changing the host's default widget style, and changing the host's theme preference each leave a replay of the same fixture reporting the same `widgets` values and the same structural counters as before the change. Which typefaces the package ships and which theme is applied is fixed by the desktop application rather than by this document — see Open Questions.
- **REQ-UIBENCH-048** — The two canonical window sizes are 1000×680 and 1440×900; the window is initially sized to 1440×900.
- **REQ-UIBENCH-049** — Every phase record carries `event_loop_lag_ms`, a number of milliseconds rounded to 3 decimals reporting the longest single interruption to the interface's responsiveness observed between the previous record of that iteration and this one. The value is never negative and is 0 when the interface stayed responsive for the whole of that interval. It describes that interval alone and is not accumulated, so a delay reported in one record is never reported again in a later one. Observation runs continuously over the measured part of an iteration — it starts before the first phase and stops when the last phase's record is taken — so every instant of the iteration falls inside exactly one record's interval. The interval at which responsiveness is observed, and therefore the granularity of the reported figure, is not fixed by this document — see Open Questions.
- **REQ-UIBENCH-050** — Every record reports, for the process that produced it: `rss_bytes`, its resident memory in bytes; `threads`, the number of operating-system threads it currently has; and `handles`, the number of operating-system handles it currently holds open — open handles on Windows, open file descriptors on POSIX systems — or null on a platform that exposes no such counter or when the count cannot be obtained. Each record also reports two structural counts of the interface: `widgets`, the number of interface elements alive in the process, and `qobjects`, a second and broader count of live interface objects belonging to the constructed window, which is 0 in any record taken while no window exists. `rss_bytes`, `threads`, `widgets`, and `qobjects` are non-negative integers; `handles` is a non-negative integer or null. What an implementation must count under `widgets` and under `qobjects` is not fixed here — only their stability within a run is constrained (REQ-UIBENCH-085) — see Open Questions.
- **REQ-UIBENCH-051** — `wall_ms` is the real time and `cpu_ms` the processor time the measuring process spent on a phase, both in milliseconds rounded to 3 decimals. Both cover the phase's work up to the point at which the interface has finished showing that work's effect, so the cost of rendering what a phase changed is charged to that phase and never to a later one; in `resize_sequence` each resize is complete before the next one starts. The remaining values of the record — the process and structural counts of REQ-UIBENCH-050, `markdown_cache`, and `transcript_operations` — describe the state reached once the phase is complete in that sense. `elapsed_s` is the time in seconds, rounded to 3 decimals, since a time origin fixed once per iteration before its first phase, so within one iteration `elapsed_s` never decreases from one of the seven records to the next.
- **REQ-UIBENCH-052** — The child's record file is JSON Lines: one record per phase (7 per healthy iteration), compact separators, non-ASCII escaped, one newline per record. The file is created only after all phases complete: a child that crashes mid-run leaves no record file for that iteration — only the parent's crash marker. On the healthy path the child writes all seven records, closes the window, and exits 0.

### Replay phases

- **REQ-UIBENCH-053** — Every iteration executes exactly seven phases, once each, in this fixed order: `construct_window`, `apply_fixture`, `ordered_appends`, `streaming_updates`, `tail_replacements_1000`, `unchanged_state`, `resize_sequence`.
- **REQ-UIBENCH-054** — `construct_window`: the product's main window is created against the interface state the fixture will drive, sized to 1440×900, and shown with no on-screen output (REQ-UIBENCH-003). It is the only phase allowed to change the number of interface elements alive in the process: from the moment this phase's record is taken until the iteration ends, the `widgets` value must not change. REQ-UIBENCH-085 reports a weaker, per-phase form of the same rule as a boolean; which of the two is canonical is unresolved — see Open Questions.
- **REQ-UIBENCH-055** — `apply_fixture`: the entire fixture state is applied to the interface in one pass — agents (with `state` values checked against REQ-UIBENCH-028), todos, artifacts, KPIs, session name, session status, run state (with its value checked against REQ-UIBENCH-032), active model, and the complete transcript assigned in bulk rather than entry by entry.
- **REQ-UIBENCH-056** — `ordered_appends`: the transcript is cleared, then every transcript event of the fixture is added back individually, in fixture order, one event per update rather than in bulk — the same way events arrive in the live application.
- **REQ-UIBENCH-057** — `streaming_updates` (simulated token streaming): clears the transcript; for each event in order, the event's `text` is revealed as a sequence of prefixes of lengths 0, 256, 512, … (capped at the full text length), each step performing a full transcript assignment of all previously completed events plus a copy of the current event truncated to the revealed prefix. The final step always includes the full text; an event with empty text still produces exactly one (empty-prefix) step.
- **REQ-UIBENCH-058** — `tail_replacements_1000`: the text of the transcript's last entry is replaced exactly 1000 times, the whole transcript being re-applied after each replacement. Let L be the number of characters in that entry's text when the phase begins, or 1 if that count would be 0. Replacement i, for i from 0 through 999, uses i written in decimal and zero-padded to 8 digits, extended on the right with `x` characters to length L and then truncated to length L. If the transcript holds no entry when the phase begins, one substitute entry is inserted first — `timestamp` `00:00`, `role` `agent`, `text` of 256 `x` characters — so that the 1000 replacements always take place. Resident memory is sampled 11 times, at the replacement indices 0, 100, 200, 300, 400, 500, 600, 700, 800, 900, and 999; this phase's record carries those 11 values in that order as `rss_samples`, and carries `rss_second_half_growth_bytes`, the value sampled at index 999 minus the value sampled at index 500. Whether a sample is taken before or after the replacement at its index is applied is not fixed here — see Open Questions.
- **REQ-UIBENCH-059** — `unchanged_state`: the fixture's complete state is applied a second time, identical to the state already displayed. The record closing this phase reports the same displayed content, the same `widgets` count, and the same transcript row structure as the state that preceded the phase.
- **REQ-UIBENCH-060** — `resize_sequence`: resizes the window through 1000×680 → 1440×900 → 1180×760 → 1000×680 → 1440×900, settling after each resize, ending at 1440×900.
- **REQ-UIBENCH-061** — The final (resize-phase) record of each iteration additionally carries `rss_slope_bytes_per_second` — the ordinary-least-squares slope over that iteration's seven per-phase (elapsed_s, RSS) points — and `fixture_checksum`, the checksum of the fixture that was replayed.

### Per-record schema (run schema version 2)

- **REQ-UIBENCH-062** — A phase record is a JSON object whose keys are `schema_version` (the integer 2), `iteration` (integer), `phase` (one of the seven names listed in REQ-UIBENCH-053), `elapsed_s` (seconds to 3 decimals), `wall_ms` and `cpu_ms` (milliseconds to 3 decimals), `rss_bytes` (integer), `threads` (integer), `handles` (integer or null), `widgets` (integer), `qobjects` (integer), `event_loop_lag_ms` (milliseconds to 3 decimals), `markdown_cache` (object), and `transcript_operations` (object). Those keys carry the meanings fixed by REQ-UIBENCH-049, REQ-UIBENCH-050, REQ-UIBENCH-051, REQ-UIBENCH-063, and REQ-UIBENCH-064. Records of two phases carry additional keys of their own: `tail_replacements_1000` (REQ-UIBENCH-058) and `resize_sequence` (REQ-UIBENCH-061). A record the benchmark writes carries no key beyond those.
- **REQ-UIBENCH-063** — `markdown_cache` reports six values for the cache the interface keeps of rendered message bodies: `hits` and `misses`, running totals over the life of the process that wrote the record; `entries` and `chars`, the occupancy at the moment the record was taken, expressed in cached items and in characters; and `max_entries` and `max_chars`, the capacities that occupancy is held to. Every record the benchmark writes reports all six keys, with `max_entries` 256 and `max_chars` 2000000. Whether a record's occupancy actually lies within its stated capacities is not assumed anywhere: REQ-UIBENCH-086 evaluates it and reports the answer, which matters because a run directory may also hold records the benchmark did not write (REQ-UIBENCH-075). The all-zero block of REQ-UIBENCH-076 is a substitution a reader makes for an absent block, never a value the benchmark emits. What `chars` counts is not fixed here — see Open Questions.
- **REQ-UIBENCH-064** — `transcript_operations` is an object of exactly six non-negative integer counters — `noop`, `insert`, `remove`, `update`, `refused`, `reset` — each a running total, over the life of the process that wrote the record, of the transcript updates that fell into that category. No counter decreases from one record of an iteration to the next, so every phase's block is a cumulative total and the `resize_sequence` record holds that iteration's final totals. The totals are a function of the sequence of transcript states applied and of nothing else, so two iterations replaying the same fixture end with identical values for all six counters; REQ-UIBENCH-083 reports that agreement as a boolean. The rule that assigns an update to one of the six categories is not fixed here — see Open Questions.

### `inspect` subcommand

- **REQ-UIBENCH-065** — `inspect RUN_DIR` builds its report from the run directory's `iteration-*.jsonl` files together with its `iteration-*.crash` files (REQ-UIBENCH-069), and writes nothing to disk. Record files are read in bytewise ascending filename order and their records concatenated in that order. That read order fixes two things and nothing else: the order of every `*_raw` list in the report, and which record counts as first and last for REQ-UIBENCH-108. Which records belong to which iteration is decided solely by each record's own `iteration` value (REQ-UIBENCH-068, REQ-UIBENCH-073) and never by the name of the file that carried it, so the number of record files present and the reported `iterations` value need not agree. `inspect` never reads `summary.json`, even when the directory holds one, so its report always reflects the record files as they currently stand; `compare` deliberately prefers `summary.json` (REQ-UIBENCH-089).
- **REQ-UIBENCH-066** — Record reading is crash-tolerant: lines that fail JSON or text decoding, and decoded values that are not objects, are skipped. Given a record file ending in a truncated final line, all complete preceding records are still used.
- **REQ-UIBENCH-067** — The summary is a JSON object with top-level keys: `schema_version` (2), `iterations`, `records` (the total count of records read across all record files), `phases`, `crashes`, `fixture_checksums`, `process`, and `invariants` (plus `fixture_checksum` only when written by `replay`, per REQ-UIBENCH-042).
- **REQ-UIBENCH-068** — `iterations` is the number of distinct `iteration` values found across every record read. It is neither the requested iteration count nor the number of record files: an iteration that terminated before its record file was written contributes nothing; all records carrying no `iteration` value form one bucket that counts once; and one `iteration` value appearing in two different files still counts once. The same grouping by `iteration` value governs the per-iteration series of REQ-UIBENCH-073.
- **REQ-UIBENCH-069** — `crashes` is the count of files matching `iteration-*.crash` in the run directory.
- **REQ-UIBENCH-070** — `phases` maps each phase name (sorted) to: percentile blocks for `wall_ms` and `cpu_ms`, plus `rss_bytes_raw`, `threads_raw`, `widgets_raw`, and `operations_raw` (the per-record `transcript_operations`, defaulting to `{}`). Every per-record measurement is retained in its unreduced form in addition to the computed percentile blocks, so a consumer can recompute any statistic from the summary alone.
- **REQ-UIBENCH-071** — A percentile block has the shape `{raw: [...], p50, p95, min, max, mean}`; `min`, `max`, and `mean` are null for empty input, and `mean` is the arithmetic mean.
- **REQ-UIBENCH-072** — `fixture_checksums` is the sorted, de-duplicated list of every `fixture_checksum` value found in records (one per healthy iteration).
- **REQ-UIBENCH-073** — The `process` block contains: `rss_start` (first record in file order), `rss_peak` (maximum), `rss_end` (last record in file order), `rss_slope_bytes_per_second_raw` (the per-iteration in-child OLS slopes), `event_loop_lag_ms` (a percentile block over all records, missing values counted as 0.0), `threads_raw`, `handles_raw`, `widgets_raw`, `rss_theil_sen_bytes_per_second_raw` (one robust slope per iteration, records grouped by their `iteration` value with a default group of 0), `rss_theil_sen_bytes_per_second_p50` (the median of those slopes), and `tail_second_half_growth_bytes_raw` (the values from REQ-UIBENCH-058).
- **REQ-UIBENCH-074** — Inspecting an empty run directory — or a nonexistent path, which yields the same empty file set rather than an error — degrades gracefully: `iterations` 0, `records` 0, empty `phases`, all `process` scalars null and lists empty, and all invariants vacuously true.
- **REQ-UIBENCH-075** — Only files matching `iteration-*.jsonl` and `iteration-*.crash` are consulted; other files in the run directory are ignored. Any matching record file — including hand-added ones — is merged in sorted filename order; inspect trusts the directory contents.
- **REQ-UIBENCH-076** — `wall_ms` and `cpu_ms` must be present in every record read: a record lacking either makes `inspect` exit 1 with a diagnostic (REQ-UIBENCH-097). Every other per-record key may be absent, with these reader-side substitutions: a `markdown_cache` that is absent or is not an object reads as all six values 0, which passes the bound check of REQ-UIBENCH-086; a `transcript_operations` that is absent or is not an object reads as `{}`; an absent `event_loop_lag_ms` reads as 0.0. What an absent `rss_bytes`, `threads`, `widgets`, or `handles` contributes to the corresponding `*_raw` list is not fixed here — see Open Questions.

### Statistics semantics

- **REQ-UIBENCH-077** — Percentile: null for empty input; otherwise values are sorted and linearly interpolated between closest ranks at position (n−1)·q (the inclusive/"linear" method). The p50 of an even-sized list is the midpoint average of the two central values.
- **REQ-UIBENCH-078** — Linear (OLS) slope: null for fewer than 2 points; 0.0 when all x values are identical; otherwise the ordinary-least-squares slope.
- **REQ-UIBENCH-079** — Robust (Theil–Sen) slope: null when fewer than two points are supplied. When more than 2000 points are supplied, the series is first thinned to at most 2000 by retaining the point at index 0 and every k-th point after it, with k = ceil(n / 2000); a series of 2000 points or fewer is used whole. The reported value is then the median, computed as in REQ-UIBENCH-077, of the slopes of all pairs of points taken from the retained series, excluding every pair whose two x values are equal. If no pair survives that exclusion the result is null, since a median over an empty input is null.
- **REQ-UIBENCH-080** — Both the least-squares trend and the robust Theil–Sen trend appear in the summary's `process` block, so a single memory outlier cannot mask or fake a leak trend.

### Report invariants

- **REQ-UIBENCH-081** — `invariants` is an object of exactly six booleans (REQ-UIBENCH-082 through REQ-UIBENCH-087); all six are true for a healthy multi-iteration replay of a valid fixture.
- **REQ-UIBENCH-082** — `fixture_checksum_stable`: at most one distinct `fixture_checksum` value appears across all records — every iteration replayed the same fixture.
- **REQ-UIBENCH-083** — `operation_counts_identical`: the canonical (sorted-keys) serializations of the `transcript_operations` of every `resize_sequence` record — i.e. each iteration's final cumulative counters — are identical across iterations. This is the core determinism claim: fresh processes replaying the same fixture apply identical sequences of transcript updates.
- **REQ-UIBENCH-084** — `thread_delta_within_one`: the maximum minus the minimum native thread count across all records is at most 1 (vacuously true with no thread data).
- **REQ-UIBENCH-085** — `widgets_stable_after_warmup` is true exactly when, taking each phase other than `construct_window` on its own, every record of that phase reports one and the same `widgets` value; it is true when no such record exists. As written it compares records only inside a single phase, so records of two different non-construction phases may report different `widgets` values without making it false. That is weaker than the rule REQ-UIBENCH-054 states, and the two differ observably for a hand-assembled run directory (REQ-UIBENCH-075); which is canonical is unresolved — see Open Questions.
- **REQ-UIBENCH-086** — `markdown_cache_bounded`: in every record, `markdown_cache.entries` ≤ `max_entries` and `markdown_cache.chars` ≤ `max_chars` (missing cache info defaults to 0 and passes).
- **REQ-UIBENCH-087** — `tail_second_half_growth_below_64_mib`: every `rss_second_half_growth_bytes` value is strictly less than 64 MiB (67108864 bytes) — the memory-leak tripwire for the 1000-replacement tail phase.
- **REQ-UIBENCH-088** — Invariants are informational: neither `inspect` nor `replay` changes its exit code when an invariant is false. Automation must evaluate the JSON itself.

### `compare` subcommand

- **REQ-UIBENCH-089** — `compare BASE_RUN CANDIDATE_RUN` loads each side from `<dir>/summary.json` when that file exists, otherwise computes the summary from the directory's record files on the fly. Since replay always writes `summary.json`, comparing two replay outputs is a pure file read. This is a deliberate difference from `inspect` (REQ-UIBENCH-065): where a written `summary.json` no longer matches the directory's record files, `compare` reports the file's figures and `inspect` reports the records'.
- **REQ-UIBENCH-090** — The comparison report has the shape `{"base": "<path as given>", "candidate": "<path as given>", "phases": {...}}`, where `phases` covers the sorted union of phase names from both sides, and each phase maps each of the two metrics `wall_ms` and `cpu_ms` to `{"base": <base p50>, "candidate": <candidate p50>, "delta": candidate − base, "percent": delta / base × 100}`.
- **REQ-UIBENCH-091** — Missing-data semantics: if either side lacks the phase/metric p50, `delta` and `percent` are null; if `delta` exists but the base p50 is 0, `percent` is null (no division by zero).
- **REQ-UIBENCH-092** — For every metric entry of the report: `delta` is the candidate run's p50 minus the base run's p50, in the metric's own unit of milliseconds, and `percent` is that same difference expressed as a percentage of the base run's p50. A positive `delta` or `percent` therefore means the candidate was slower than the base, and a negative one means it was faster. Neither value is rounded, clamped, or compared against any threshold, and neither affects the exit code (REQ-UIBENCH-093).
- **REQ-UIBENCH-093** — `compare` compares only per-phase p50 wall and CPU times. It does not compare RSS, invariants, lag, or checksums; it imposes no thresholds; it never verifies the two runs used the same fixture (consumers can check each summary's `fixture_checksum`/`fixture_checksums`); and it always exits 0 — it is a report generator, not a pass/fail gate. Comparing two directories that lack both `summary.json` and record files yields an empty `phases` object rather than an error.

### Exit codes and error inventory

- **REQ-UIBENCH-094** — Exit 0: successful `capture`; `replay` completing its iterations (even when some or all iterations crashed); `inspect`; `compare`; a child iteration process that completed successfully.
- **REQ-UIBENCH-095** — Exit 2: argument errors — a missing or unknown subcommand, a missing `--output`, a non-integer `--iterations`, wrong positional arguments, and any other argument list that does not form one of the four documented commands (REQ-UIBENCH-004) — always with usage text on stderr carrying the prefix of REQ-UIBENCH-002. An `--iterations` value that does parse as an integer but is below 1 is not in this class: it exits 1 per REQ-UIBENCH-008 and REQ-UIBENCH-096.
- **REQ-UIBENCH-096** — Exit 1 with a single clean stderr line: `--iterations must be at least 1`.
- **REQ-UIBENCH-097** — Exit 1 with a diagnostic (an error report identifying the cause, not required to be a single clean line) for: missing session directory; malformed session-directory location (REQ-UIBENCH-014); missing session snapshot (REQ-UIBENCH-015); unsupported session schema version (REQ-UIBENCH-016); the three fixture validation failures (REQ-UIBENCH-024); pre-existing replay output directory (REQ-UIBENCH-035); unreadable/undecodable fixture or summary JSON; workspace-configuration load failure during capture; a phase record missing `wall_ms`/`cpu_ms` during inspect (REQ-UIBENCH-076).

### Determinism and performance envelope

- **REQ-UIBENCH-098** — Every input that shapes a measurement is fixed by the benchmark rather than taken from the host: rendering produces no on-screen output; the widget style is one platform-independent choice; the display scale factor is 1; the locale is C; settings are written to a directory created fresh for the run; typefaces come from the product package; the theme is the product's own; the window sizes are those of REQ-UIBENCH-048 and REQ-UIBENCH-060; the seven phases of REQ-UIBENCH-053 run once each in that order; the workloads are fixed (256-character streaming steps, 1000 tail replacements, the fixed resize list); iterations run one at a time in fresh processes; and the fixture is frozen and checksum-verified before each iteration. Testable consequence: changing the host's theme, locale, display scaling, installed fonts, or stored desktop settings between two replays of the same fixture leaves the structural counters, the six invariants, and the `records` and `iterations` counts identical, while the timing and memory values may differ (REQ-UIBENCH-099).
- **REQ-UIBENCH-099** — The published determinism claim: two fresh headless replays of the same fixture produce identical per-iteration cumulative operation counters and satisfy all six invariants with zero crashes. Timing and memory values (wall, CPU, lag, RSS) are explicitly not expected to be identical between runs — only structural counters must match; timings are reported as distributions.
- **REQ-UIBENCH-100** — Replay works from a hand-built minimal fixture with a valid checksum: no captured session is required to run the replay/inspect/compare pipeline.

### Edge cases

- **REQ-UIBENCH-101** — `replay --iterations 1` is valid: percentile blocks degenerate to single-element raw lists where p50 = p95 = min = max = mean = the value, and `operation_counts_identical` is vacuously true.
- **REQ-UIBENCH-102** — A fixture with an empty transcript: `ordered_appends` appends nothing and `streaming_updates` iterates nothing, but `tail_replacements_1000` still performs all 1000 replacements against the substitute entry, so the tail-leak tripwire always produces data.
- **REQ-UIBENCH-103** — A transcript event whose text is the empty string still produces one streaming step, and the tail phase's minimum replacement width of 1 prevents a zero-width replacement.
- **REQ-UIBENCH-104** — Overwrite asymmetry (deliberate): `capture` silently overwrites an existing output file; `replay` refuses an existing output directory.
- **REQ-UIBENCH-105** — A replay in which every iteration crashed still exits 0 and produces a run directory with no record files, a summary reporting `iterations` 0, `records` 0, `crashes` N, empty `phases`, vacuously-true invariants, and the top-level `fixture_checksum`; `summary.md` shows `Iterations: 0` and no phase bullets.
- **REQ-UIBENCH-106** — Non-ASCII transcript text round-trips through fixtures, records, and summaries as ASCII escape sequences; no checksum or output depends on the host locale or filesystem encoding.
- **REQ-UIBENCH-107** — The summary's `iterations` value can legitimately under-report the requested iteration count when iterations crash before writing records (REQ-UIBENCH-068).
- **REQ-UIBENCH-108** — `process.rss_start` and `process.rss_end` are the `rss_bytes` values of the first and last records in read order (bytewise ascending filename order, then order within each file), not of the lowest- and highest-numbered `iteration` values. For a run directory written by `replay`, where filenames and iteration indices agree, `rss_end` is therefore the last phase of the highest-numbered iteration that produced records.
- **REQ-UIBENCH-109** — `qobjects` is present in every phase record and is reported for information only: none of the six invariants of REQ-UIBENCH-081 reads it, no threshold applies to it, and no value it takes — however large, and however much it varies between records or between iterations — changes an exit code or makes `capture`, `replay`, `inspect`, or `compare` fail. `widgets` is the only structural count any invariant constrains (REQ-UIBENCH-085).

## Data & Formats

All formats below are externally observable contracts of the command.

### Session input layout (consumed by `capture`)

```
<workspace>/.rotaris/sessions/<session-id>/
  state/resume.json                  # split layout (preferred)
  state/ui_transcript.json           # optional: {"events": [...]}
  state/ui_edit_diffs.json           # optional: {"diffs": [...]}
  state/run_config.json              # optional: {"config_snapshot": {...}}
  snapshot.json                      # legacy single-file fallback
```

Session schema versions above 1 are rejected on the legacy path only (REQ-UIBENCH-016; see Open Questions).

### Fixture file (schema version 1)

A single JSON object (2-space indent, ASCII-escaped, UTF-8, no trailing newline):

```
{
  "schema_version": 1,
  "source_checksum": "<sha256 hex over session files, path+content, sorted>",
  "transcript":  [ { timestamp, role, text, kind?, tool?, detail?, full_text?,
                     full_detail?, diff?, persona?, event_key?, status?,
                     duration?, started_at?, char_count?, stream_id? }, ... ],
  "agents":      [ { id, name, persona, state?, <further accepted display fields> }, ... ],
  "todos":       [ { id, phase_id, status, text, phase_name? }, ... ],
  "artifacts":   [ { id, slug, title, kind?, <further accepted display fields> }, ... ],
  "kpis":        { cumulative_tokens?, cumulative_cost_label?, token_history?,
                   tool_calls?, tool_call_breakdown?, files_touched?, uncommitted? },
  "run_state":   { session_name, session_status, run_state, active_model },
  "fixture_checksum": "<sha256 hex of canonical JSON minus this key>"
}
```

Canonical JSON for checksumming: sorted keys, compact `,`/`:` separators, ASCII-escaped, UTF-8 bytes. Must never contain top-level `config`, `credentials`, `environment`, or `workspace`.

### Replay run directory

```
<output>/
  fixture.json            # byte-for-byte copy of the input fixture
  iteration-000.jsonl     # one per iteration that completed all phases
  iteration-001.jsonl
  iteration-NNN.crash     # only for crashed iterations; content: "exit_code=<n>\n"
  summary.json            # inspect output + top-level fixture_checksum
  summary.md              # human digest
```

### Iteration record file (JSON Lines, run schema version 2)

Seven records per healthy iteration, compact separators, ASCII-escaped, one per line:

```
{"schema_version":2,"iteration":0,"phase":"<phase name>","elapsed_s":...,
 "wall_ms":...,"cpu_ms":...,"rss_bytes":...,"threads":...,"handles":<int|null>,
 "widgets":...,"qobjects":...,"event_loop_lag_ms":...,
 "markdown_cache":{"hits":..,"misses":..,"entries":..,"chars":..,
                   "max_entries":256,"max_chars":2000000},
 "transcript_operations":{"noop":..,"insert":..,"remove":..,"update":..,
                          "refused":..,"reset":..}}
```

Phase-specific additions: the `tail_replacements_1000` record adds `rss_samples` (11 values) and `rss_second_half_growth_bytes`; the final `resize_sequence` record adds `rss_slope_bytes_per_second` and `fixture_checksum`.

Phase names: `construct_window`, `apply_fixture`, `ordered_appends`, `streaming_updates`, `tail_replacements_1000`, `unchanged_state`, `resize_sequence`.

### Run summary (`summary.json` / `inspect` stdout)

```
{
  "schema_version": 2,
  "iterations": <distinct iteration count>,
  "records": <record count>,
  "crashes": <crash-marker count>,
  "fixture_checksum": "<only in replay-written summaries>",
  "fixture_checksums": [ ...sorted distinct... ],
  "phases": { "<phase>": { "wall_ms": <pctl block>, "cpu_ms": <pctl block>,
                           "rss_bytes_raw": [...], "threads_raw": [...],
                           "widgets_raw": [...], "operations_raw": [...] } },
  "process": { "rss_start", "rss_peak", "rss_end",
               "rss_slope_bytes_per_second_raw", "event_loop_lag_ms": <pctl block>,
               "threads_raw", "handles_raw", "widgets_raw",
               "rss_theil_sen_bytes_per_second_raw",
               "rss_theil_sen_bytes_per_second_p50",
               "tail_second_half_growth_bytes_raw" },
  "invariants": { "fixture_checksum_stable", "operation_counts_identical",
                  "thread_delta_within_one", "widgets_stable_after_warmup",
                  "markdown_cache_bounded",
                  "tail_second_half_growth_below_64_mib" }
}
```

Percentile block: `{"raw": [...], "p50", "p95", "min", "max", "mean"}` (nulls on empty input).

### `summary.md`

```
# Rotaris replay benchmark

Iterations: <n>

- <phase>: wall p50 <x> ms; CPU p50 <y> ms
...
```

### `compare` stdout

```
{
  "base": "<path as given>",
  "candidate": "<path as given>",
  "phases": { "<phase>": {
      "wall_ms": {"base", "candidate", "delta", "percent"},
      "cpu_ms":  {"base", "candidate", "delta", "percent"} } }
}
```

`delta` = candidate − base; `percent` = delta / base × 100; nulls per REQ-UIBENCH-091; sign convention per REQ-UIBENCH-092.

### Environment contract

Iteration processes receive the full invoking environment plus overrides that force: rendering with no on-screen output, one fixed platform-independent widget style, display scale factor 1, `LANG=C`, `LC_ALL=C`, `XDG_CONFIG_HOME` set to a run-scoped temporary settings directory, and one benchmark-private variable naming that directory. The benchmark reads no other product environment variable. Run schema version 2 identifies the record and summary formats of this command only.

## Open Questions

1. REQ-UIBENCH-040 / REQ-UIBENCH-098: no absolute wall-clock, CPU, or memory figure is fixed for any phase on any platform, and replay is explicitly unbounded in time. Should the specification state an upper time budget that a conformant replay of a minimal fixture must meet on named reference hardware, or is the tool purely comparative?
2. REQ-UIBENCH-027: whether a transcript entry carrying a nested `diff` payload renders under replay exactly as it renders in the live application is not specified.
3. REQ-UIBENCH-011: child stdout/stderr passes through unfiltered. Whether the UI toolkit's own diagnostics may legitimately appear there during headless replay, and whether callers must tolerate them, is unspecified.
4. REQ-UIBENCH-039: which inherited (non-overridden) parent environment variables, if any, must be neutralised to protect replay determinism is unspecified.
5. REQ-UIBENCH-038: all iterations of a run share one settings directory, so settings an earlier iteration writes are visible to a later one. Is per-iteration isolation required, or is sharing intended?
6. REQ-UIBENCH-050: on which platforms `handles` may legitimately be null, and whether a null there should be reported anywhere other than the raw list, is unspecified.
7. REQ-UIBENCH-015: whether `capture` must support any on-disk session layout other than the split layout and the single legacy file is unspecified.
8. REQ-UIBENCH-052 / REQ-UIBENCH-068: may a child exit 0 without having written its record file (which would silently lower the reported `iterations` with no crash marker to explain it)? If not, that prohibition should be stated as a requirement.
9. REQ-UIBENCH-015 / REQ-UIBENCH-016: the session schema-version check applies only on the legacy single-file path. Which behaviour is canonical — reject a too-new version on both layouts, or on the legacy layout alone?
10. REQ-UIBENCH-076: `inspect` fails hard on a record missing `wall_ms`/`cpu_ms` while defaulting every other missing field. Is that strictness intended, and if so should the same strictness extend to `phase` and `iteration`?
11. REQ-UIBENCH-004 / REQ-UIBENCH-037: replay executes each iteration in a separate process. Is the argument form by which such a process is started part of the compatibility surface — must a third party be able to run a single iteration directly, and if so under which documented subcommand — or is it entirely the implementation's to choose?
12. REQ-UIBENCH-039 / REQ-UIBENCH-046: the names and values of the environment variables that force offscreen rendering, the fixed widget style, the display scale factor of 1, and the benchmark-private settings directory are not stated anywhere in this document. If external tooling has to set, override, or observe them, they must be named here.
13. REQ-UIBENCH-050 / REQ-UIBENCH-062 / REQ-UIBENCH-109: the record field `qobjects` names a GUI-framework-specific object concept while constraining nothing and gating nothing. Should the field keep that name for output compatibility, or be renamed to a framework-neutral one — a breaking change to run schema version 2?
14. REQ-UIBENCH-054 / REQ-UIBENCH-085: REQ-UIBENCH-054 forbids any widget-count change after `construct_window`, which implies every non-construction record shares one `widgets` value; REQ-UIBENCH-085 as written only requires agreement within each phase. Which is canonical for the reported boolean? The two differ observably for a hand-assembled run directory (REQ-UIBENCH-075).
15. REQ-UIBENCH-017: which workspace configuration files `capture` must read, and which of them are mandatory for capture to succeed, is not determined by this document.
16. REQ-UIBENCH-019: how symbolic links found beneath `SESSION_DIR` participate in `source_checksum` — followed, skipped, or hashed as links — is not determined.
17. REQ-UIBENCH-027: the permitted values and types of the optional transcript fields `role`, `status`, `duration`, `started_at`, `char_count`, and `stream_id` (and the units of the numeric ones) are not determined, nor is the default each optional field takes when it is absent — only `kind`'s default of `"message"` is fixed.
18. REQ-UIBENCH-028: is `state` mandatory in an `agents` entry, and if it is absent, what value does replay assume?
19. REQ-UIBENCH-030: is `kind` on an `artifacts` entry drawn from a closed vocabulary, and if so which values does it admit besides the default `child_report`?
20. REQ-UIBENCH-031: the default value and type of each `kpis` key when the key is absent is not determined.
21. REQ-UIBENCH-032: which of `session_name`, `session_status`, `run_state`, and `active_model` are mandatory, and what values `session_status` may take, is not determined.
22. REQ-UIBENCH-043: how the p50 values are formatted in `summary.md` — number of decimal places, trailing zeros, and whether large values may appear in exponent notation — is not determined.
23. REQ-UIBENCH-047: the identity of the font faces shipped in the product package and of the product theme applied before measurement is not determined here; it belongs to the desktop UI domain and should be cross-referenced once fixed.
24. REQ-UIBENCH-063: whether `chars` counts the characters of the cached source text or of the rendered output, and whether `hits`/`misses` are meant to be cumulative per child process (as stated) or per iteration, is not determined.
25. REQ-UIBENCH-064: the precise rule that assigns a transcript update to one of `noop`, `insert`, `remove`, `update`, `refused`, `reset` is not determined — in particular what distinguishes `refused` from `noop`, and which operations count as `reset`. Without it, REQ-UIBENCH-083 is testable only as "two runs agree", not as "the counters are correct".
26. REQ-UIBENCH-076: what a record missing `rss_bytes`, `threads`, `widgets`, or `handles` contributes to the corresponding `*_raw` list — nothing at all, or a null entry — is not determined, and it changes list lengths that consumers may compare.
27. REQ-UIBENCH-051: a phase's timing closes only once the interface has finished showing that phase's effect, but nothing bounds how long an iteration may wait for that if the interface keeps generating further work. Must the wait be abandoned after a stated time limit, and if so what limit and what is then reported?
28. REQ-UIBENCH-049: the interval at which the interface's responsiveness is observed is not stated, so `event_loop_lag_ms` values produced by two conformant implementations are not comparable in magnitude. If the figure is meant to be comparable across implementations, the observation interval must be fixed here.
29. REQ-UIBENCH-050 / REQ-UIBENCH-085: what an implementation must count under `widgets`, and what under `qobjects`, is not defined, so only their stability within a run is testable and their absolute values cannot be compared between implementations or between product revisions. Should counting rules be fixed, or are these values explicitly implementation-relative?
30. REQ-UIBENCH-058: whether each of the 11 `rss_samples` values is read before or after the replacement at that index is applied is not determined; the two readings shift every sample by one replacement and change `rss_second_half_growth_bytes`.
31. REQ-UIBENCH-018 / REQ-UIBENCH-023 / REQ-UIBENCH-024: the prohibition on top-level `config`, `credentials`, `environment`, and `workspace` keys binds what `capture` writes, but the load-time checks are exhaustive and do not include it, so a fixture built elsewhere carrying such a key loads and replays. Should the loader reject those keys, and with which diagnostic and exit code?
32. REQ-UIBENCH-028 / REQ-UIBENCH-030: `agents` and `artifacts` entries may carry further display keys, but only keys the replay side accepts, and the accepted set is not enumerated anywhere in this document. Until it is, "carries an unaccepted key" (REQ-UIBENCH-033) cannot be tested against the specification alone; the accepted key sets should be listed here.
