# UI Performance Benchmark — Benchmark surface

Part 4 of 5 of [domain 21](../21-ui-performance-benchmark.md), which indexes every part.

## Data & Formats

All formats below are observable contracts of the benchmark: the files it writes, and the reports it presents and exports (REQ-UIBENCH-115).

### Benchmark surface

The benchmark has no command-line surface, no subcommands, no flags, and no exit codes. Its four operations — capture, replay, inspect, compare — are started from the performance-benchmark card in the Settings view's About tab and from nowhere else (REQ-UIBENCH-110, REQ-UIBENCH-111); their inputs are chosen through the product's session list and the platform file choosers; their outcomes are reported in the interface (REQ-UIBENCH-114). Iteration processes are started by the desktop application itself and are not invocable by anything else (REQ-UIBENCH-037).

### Session input (consumed by capture)

Capture reads a session, not a directory. Which session is settled by workspace plus session id (REQ-SESSION-001) and this document names no path; what it reads is the resumable state the sessions domain fixes plus three optional bulk parts, on the precedence of REQ-SESSION-036.

```
THE SUBJECT = (workspace, session id), chosen from the product's own session list
  resumable state                    # required
  transcript rows                    # optional: {"events": [...]}
  edit diffs                         # optional: {"diffs": [...]}
  configuration snapshot             # optional: {"config_snapshot": {...}}, from the launch audit
```

That layout is the one REQ-SESSION-036 defines and REQ-SESSION-037 orders; those requirements are normative for the file names, which of them are required, and the precedence between them, and the sketch above is a reader's aid that neither adds a file nor fixes one. There is no whole-state fallback file (REQ-SESSION-037). A session `schema_version` above the supported version is refused (REQ-UIBENCH-016, REQ-SESSION-038).

### Fixture file (schema version 1)

A single JSON object (2-space indent, ASCII-escaped, UTF-8, no trailing newline):

```
{
  "schema_version": 1,
  "source_checksum": "<sha256 hex over the session's recorded state, canonically serialized>",
  "transcript":  [ { timestamp, role, text, kind?, tool?, detail?, full_text?,
                     full_detail?, diff?, persona?, event_key?, status?,
                     duration?, started_at?, char_count?, stream_id? }, ... ],
  "agents":      [ { id, name, persona, state?, model?, task_title?, depth?,
                     tool_call_count?, token_count?, cost_label?, elapsed_s?,
                     error_text? }, ... ],
  "todos":       [ { id, phase_id, status, text, phase_name? }, ... ],
  "artifacts":   [ { id, slug, title, kind?, status?, importance?, summary?,
                     source_persona?, created_at? }, ... ],
  "kpis":        { cumulative_tokens?, cumulative_cost_label?, token_history?,
                   tool_calls?, tool_call_breakdown?, files_touched?, uncommitted? },
  "run_state":   { session_name?, session_status?, run_state?, active_model? },
  "fixture_checksum": "<sha256 hex of canonical JSON minus this key>"
}
```

Every optional entry key above is closed: a key outside these sets fails the iteration that rebuilds it (REQ-UIBENCH-033). Types and absent-defaults are fixed by REQ-UIBENCH-027 through REQ-UIBENCH-032.

Canonical JSON for checksumming: sorted keys, compact `,`/`:` separators, ASCII-escaped, UTF-8 bytes. Must never contain top-level `config`, `credentials`, `environment`, or `workspace` — capture never writes one and the loader refuses one (REQ-UIBENCH-024).

### Replay run directory

```
<output>/
  fixture.json            # byte-for-byte copy of the input fixture
  iteration-000.jsonl     # one per iteration that completed all phases
  iteration-001.jsonl
  iteration-NNN.crash     # only for crashed iterations; content: "exit_code=<n>\n"
  iteration-NNN.log       # only for crashed iterations; that iteration's captured output
  summary.json            # the inspect report + top-level fixture_checksum
  summary.md              # human digest
```

### Iteration record file (JSON Lines, run schema version 2)

Seven records per healthy iteration, compact separators, ASCII-escaped, one per line:

```
{"schema_version":2,"iteration":0,"phase":"<phase name>","elapsed_s":...,
 "wall_ms":...,"cpu_ms":...,"rss_bytes":...,"threads":...,"handles":<int|null>,
 "widgets":...,"ui_objects":...,"event_loop_lag_ms":...,"settle_timed_out":<bool>,
 "markdown_cache":{"hits":..,"misses":..,"entries":..,"chars":..,
                   "max_entries":256,"max_chars":2000000},
 "transcript_operations":{"noop":..,"insert":..,"remove":..,"update":..,
                          "refused":..,"reset":..}}
```

Phase-specific additions: the `tail_replacements_1000` record adds `rss_samples` (11 values), `widgets_samples` (11 values, the same 11 replacement indices) and `rss_second_half_growth_bytes`; the final `resize_sequence` record adds `rss_slope_bytes_per_second` and `fixture_checksum`.

Phase names: `construct_window`, `apply_fixture`, `ordered_appends`, `streaming_updates`, `tail_replacements_1000`, `unchanged_state`, `resize_sequence`.

### Run summary (`summary.json` / the inspect report)

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
               "tail_second_half_growth_bytes_raw",
               "widgets_samples_raw" },
  "invariants": { "fixture_checksum_stable", "operation_counts_identical",
                  "thread_delta_within_one", "widgets_no_accumulation",
                  "markdown_cache_bounded",
                  "tail_second_half_growth_below_64_mib",
                  "interface_lag_within_budget" }
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

### Comparison report (the compare report)

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

Iteration processes receive the invoking environment with every variable the product itself reads removed, plus overrides that force: rendering with no on-screen output, one fixed platform-independent widget style, display scale factor 1, `LANG=C`, `LC_ALL=C`, `XDG_CONFIG_HOME` set to that iteration's own temporary settings directory, and one benchmark-private variable naming that directory. Only `LANG`, `LC_ALL`, and `XDG_CONFIG_HOME` are named contractually; the remaining override names and values are private to the implementation, because nothing outside the product can start an iteration (REQ-UIBENCH-037, REQ-UIBENCH-039). Run schema version 2 identifies the record and summary formats of this benchmark only.
