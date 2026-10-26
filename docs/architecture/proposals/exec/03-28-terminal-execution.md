# EXEC slice — architecture proposals — 2.8 Terminal execution

Part 3 of 9 of [the exec proposal](../exec.md), which indexes every part.

### 2.8 Terminal execution

- **C-69 (hard).** The tool name is exactly `terminal`; its action schema is fixed, including the
  special-key vocabulary for `is_input=true` (`C-c`, `C-d`, `C-z`, any `C-<letter>`, `UP`, `DOWN`,
  `LEFT`, `RIGHT`, `HOME`, `END`, `PGUP`, `PGDN`, `TAB`, `ESC`, `BS`, `ENTER`), the session-action
  vocabulary, the signal vocabulary and the `ts_XXXXXXXX` id format (REQ-TOOLS-095, REQ-TOOLS-096).
- **C-70 (hard).** Foreground bounds are two and the first reached governs. A hard wall-clock timeout
  (the call's `timeout`, else `runtime.shell_command_timeout`, default 100 s) terminates *the entire
  process tree*, restarts the terminal session, and returns an observation stating shell state was
  lost. A soft pause fires only when the call supplied **no** `timeout` and 30 seconds pass with no
  output, returning exit code −1 while the process keeps running (REQ-TOOLS-097, REQ-TOOLS-098,
  REQ-CONFIG-116).
- **C-71 (hard).** Captured foreground output is capped at 100,000 characters per call, truncated from
  the **oldest** end so the newest output survives, with `output_truncated: true` in the diagnostic
  block only when truncation occurred (REQ-TOOLS-097, REQ-TOOLS-100). Background output is buffered to
  1 MB per session, truncated the same direction, with the read cursor adjusted so polling stays
  consistent (REQ-TOOLS-108).
- **C-72 (hard).** Shell state — working directory, exported variables, aliases, background jobs —
  persists across foreground calls in a session and is *observably* lost on a hard timeout
  (REQ-TOOLS-097). This forces a long-lived interactive shell per terminal session, not a fresh
  process per call.
- **C-73 (hard).** Each terminal session runs at most one foreground command at a time; a second
  foreground call against a busy session **waits**. Sessions belonging to different agents run
  concurrently, bounded only by host resources. Background sessions never occupy a terminal session
  and are fully concurrent up to `runtime.shell_max_background_sessions` (default 20, min 1)
  (REQ-TOOLS-187, REQ-TOOLS-108, REQ-SANDBOX-089).
- **C-74 (hard).** `backend` is stamped on every observation as `single-session` or `tmux-pool`, and
  `kill_status` ∈ {`session_reset`, `pane_replaced`, `reset_failed`, `replace_failed`}
  (REQ-TOOLS-099, REQ-TOOLS-100). The pooled backend has specified recovery behaviour — at most 3
  recoveries in a 10-second window, a fourth yielding an `execution_error` naming the count and that
  the pooled backend's server may be unreachable, a completed command clearing the count
  (REQ-TOOLS-103). The two backends must be observationally identical apart from the name
  (REQ-TOOLS-187). **The specification never states how a backend is selected, nor when `tmux-pool`
  is used** — see OQ-1.
- **C-75 (hard).** On Windows the terminal runs commands through PowerShell, and the tool description
  must warn about heredocs, arrays, `[[ … ]]` and `source` while stating that `&&`, `;`, `2>&1` and
  `$env:VAR` work. Backend availability is decided **solely** by the presence of `pwsh` or
  `powershell` on the host — never by how quickly anything responds, so a loaded host is never
  reported as lacking PowerShell (REQ-TOOLS-104).
- **C-76 (hard).** The terminal tool must load and register however the application process was
  started and whatever its own stdout/stderr are attached to — a console, a pipe, or nothing, with or
  without a reported encoding — and the agent must observe an identical tool surface and identical
  observations in every case (REQ-TOOLS-106). Encoding of captured output is a property of the child,
  never of the host's own streams.
- **C-77 (hard).** Background sessions spawn in their own OS subprocess, shell-interpreted, stdout and
  stderr merged to a pipe, stdin piped, cwd = the tool's working dir, own process group on POSIX; the
  spawn returns immediately with a fixed text, `session_status="running"` and exit code 0
  (REQ-TOOLS-107). Termination is SIGTERM → up to 5 s grace, returning as soon as the process exits →
  SIGKILL (REQ-TOOLS-109). Status vocabulary is exactly {`running`, `completed`, `failed`, `killed`,
  `timeout`}.
- **C-78 (hard).** `failure_kind` is exactly {`timeout`, `invalid_request`, `execution_error`,
  `sandbox_unavailable`}; `outcome_kind` is exactly the ten values of REQ-TOOLS-112 and
  `outcome_severity` exactly {`info`, `warning`, `error`}; classification is a fixed six-test ordered
  cascade with specified severities per background status (REQ-TOOLS-100, REQ-TOOLS-112).
- **C-79 (hard).** Exit codes are a cross-surface contract: 124 hard timeout (foreground and
  background), 126 sandbox unavailable / never ran, −1 soft pause (foreground) or killed
  (background), otherwise the command's real outcome (REQ-TOOLS-179, REQ-SANDBOX-083).
- **C-80 (hard).** Every observation carries a `[terminal_diagnostic]` JSON block with sorted keys and
  null-valued keys dropped, and every observation renders an output section — `[terminal_output]`,
  or `[partial_terminal_output]` after a hard timeout, or the `(no output)` placeholder — never
  omitted (REQ-TOOLS-098, REQ-TOOLS-100).
- **C-81 (hard).** Three output-derived warning checks over a zero-exit command's output, each
  contributing at most one warning, all three matched case-insensitively, with a fixed marker
  precedence order; plus an exit-code-independent pipeline check which is the only output-derived
  warning a non-zero-exit observation may carry; warnings de-duplicated keeping first position
  (REQ-TOOLS-113).
- **C-82 (hard).** Request-validation failures return `invalid_request` observations with
  `error_class` **`ValueError`** and the exact messages of REQ-TOOLS-101. `error_class` is thus a
  fixed observable string, not "whatever the implementation language calls its exception" — even
  though REQ-SANDBOX-083 defines the sandbox case as "the type name of the failure" (see OQ-6).
- **C-83 (hard).** `reset=true` creates a fresh session before running anything, with the command
  labels `[RESET]` / `[RESET] <command>` and a confirmation observation for the empty-command case
  (REQ-TOOLS-102). It is rejected in combination with `is_input=true`, and `background=true` is
  rejected with `is_input`, `reset`, or an empty command (REQ-TOOLS-101).
- **C-84 (hard).** A terminal call always returns an ordinary or a structured error observation; a
  backend failure never surfaces as a partial or malformed observation (REQ-TOOLS-103).

### 2.9 Terminal streaming and the terminal window

- **C-85 (hard).** Stream names are `fg:<scope>` where `<scope>` is the run identifier or the literal
  `root`, and `bg:<session_id>` using the `ts_XXXXXXXX` id (REQ-TOOLS-127).
- **C-86 (hard).** Frames are typed `delta`, `screen` or `meta`. A completed foreground stream ends
  with a `screen` frame whose text **equals the observation's final output text**, then the stream is
  closed carrying the exit code (REQ-TOOLS-127).
- **C-87 (hard).** Streaming changes nothing the agent sees: with or without a consumer, and whether
  or not publishing succeeds, the command still runs to completion and the observation is identical;
  the only detectable difference is whether a live preview existed (REQ-TOOLS-127). Reinforced from
  the shell side: a command's completion time and output are the same whether the terminal window is
  open, closed, hidden or visible, and no output is dropped or reordered when repaints cannot keep up
  (REQ-SHELL-103, REQ-SHELL-166).
- **C-88 (hard).** Streaming configuration: `runtime.terminal_stream_enabled` (default true, disabling
  costs the live view never the command), `runtime.terminal_stream_interval_ms` (default 100, range
  20–2000, the **output sampling period**), `runtime.terminal_stream_buffer_kb` (default 256, range
  0–8192, the per-stream replay buffer, 0 disabling replay) (REQ-TOOLS-126).
- **C-89 (hard).** Displays talk back through a registered stream-control channel — send-keys, resize
  and interrupt for foreground; send-keys, interrupt (SIGINT) and kill for background — without
  knowing what drives the stream. A stream info record carries command, running flag, start time,
  exit code and a `truncated` flag set once replay frames were dropped (REQ-TOOLS-128).
- **C-90 (hard).** The window is a **character grid**, not an append-only log, and the behaviour is
  checkable: cursor addressing overwrites addressed cells, entering the alternate screen replaces
  visible content and leaving it restores what was there, and a self-rewriting progress line updates
  in place (REQ-SHELL-095). Per-cell bold/italic/underline, reverse video, and the 16 ANSI colours as
  theme tokens are required (REQ-SHELL-098).
- **C-91 (hard).** Interactive input and resize must be demonstrated against a **real pseudo-terminal**,
  not a simulated stream, with: keystroke-to-frame inside 100 ms; keystrokes reaching the process in
  order, none dropped, duplicated or reordered, encoded exactly per REQ-SHELL-096; interrupt and
  end-input observably acting within 500 ms; and **the size the process itself reports for its
  terminal equal to the columns and rows the grid last reported**, no later than the process's first
  output after the resize, with a full-screen program repainting without corrupted cells
  (REQ-SHELL-166, REQ-SHELL-100). Together with C-90 this makes a real PTY mandatory for foreground
  agent commands.
- **C-92 (hard).** For any one stream, the transcript preview and the terminal window show identical
  visible cells, identical running/exited state and identical truncation indication at the same time;
  moving between them never shows older output in one (REQ-SHELL-102). Opening a terminal for a
  command that already produced output shows retained output at once and never shows a line twice,
  including while retained and fresh output are both arriving (REQ-SHELL-104).
- **C-93 (hard).** Bringing a stream forward creates its tab **only if retained screen state still
  exists**; when nothing is retained the window stays on its empty state rather than fabricating a
  terminal, and a session read back from storage produces no terminal tabs at all (REQ-SHELL-085,
  REQ-SHELL-104). Retained screen state is therefore a first-class, queryable, non-persisted object.
- **C-94 (hard).** A key pressed in the window reaches the process only after the user deliberately
  arms take-control; interrupt and end-input need no arming; user terminal input is **not** an agent
  tool call — it bypasses permission patterns but is written to the session's permission audit log as
  user-originated input, redacted, one entry per submitted line (REQ-SHELL-089, REQ-SHELL-093,
  REQ-SHELL-107). The audit file is therefore written by two producers, not one.
- **C-95 (hard).** An off-screen surface performs zero repaints and runs zero refresh timers, yet shows
  fully current content the instant it becomes visible, within the 100 ms budget (REQ-SHELL-151,
  REQ-SHELL-084, REQ-SHELL-086). Retention must be independent of whether anyone is watching.
- **C-96 (free).** The wire encoding of a frame — see ADR-EXEC-07; the specification's wording is
  under-determined here (OQ-2).

### 2.10 OS-level confinement

- **C-97 (hard).** Confinement is opt-in per session over exactly {`off` (default), `workspace-write`,
  `read-only`}, case-insensitive, with YAML boolean false coerced to `"off"`, unrecognized values
  rejected at load *and* at assignment, and the three spellings stable persisted values
  (REQ-SANDBOX-048, REQ-SANDBOX-049, REQ-SANDBOX-055, REQ-TOOLS-114). An opportunistic fourth mode
  meaning "confine where possible" is explicitly forbidden (REQ-SANDBOX-048).
- **C-98 (hard).** The mode has **exactly two sources**: the layered configuration key
  `runtime.sandbox_mode`, and the per-session launch-dialog override. No environment variable, no
  launch argument, no other route (REQ-SANDBOX-122, REQ-TOOLS-114).
- **C-99 (hard).** The platform→mechanism map is closed at exactly two identifiers, `darwin` →
  Seatbelt (`sandbox-exec`) and `linux` (WSL2 included) → bubblewrap (`bwrap`), compared by exact
  equality after trim and lowercase. Everything else including `win32` is unrecognized: `available`
  false, backend name `unavailable`. The mechanism is chosen **before** PATH is consulted, so macOS
  without `sandbox-exec` still names Seatbelt (REQ-SANDBOX-065, REQ-TOOLS-115). No alias may be
  added.
- **C-100 (hard).** Native Windows has no confinement backend at all. The remediation must offer WSL2
  with bubblewrap (quoting `sudo apt-get install bubblewrap`) or leaving `runtime.sandbox_mode` at
  `off` (REQ-SANDBOX-073, REQ-TOOLS-115).
- **C-101 (hard).** Probing proceeds in increasing cost — platform check, then launcher lookup on
  PATH, then a trial launch — and **no subprocess is spawned once an earlier step has failed**
  (REQ-SANDBOX-066).
- **C-102 (hard).** Availability is *demonstrated*, never inferred. The trial runs the real mechanism,
  at most once per process, cached; the verdict is binary; a clear success is the only "available";
  a timeout, an error or an unreadable result is "unavailable" (REQ-SANDBOX-067, REQ-SANDBOX-068,
  REQ-TOOLS-119). The trial invocations are fixed literally: macOS
  `sandbox-exec -p "(version 1)(allow default)" /usr/bin/true`; Linux the product's own read-only
  rendering with the network namespace unshared, **ending in `-- /bin/sh -c 'true'`**, never a bare
  `-- true` (REQ-SANDBOX-070). Rendering either trial reads no path on the filesystem.
- **C-103 (hard).** No simulated, stubbed, recorded or emulated backend ever yields "available", and
  conformance is demonstrated by running the trial *and a subsequent sandboxed command* end to end on
  each supported platform (REQ-TOOLS-119, REQ-SANDBOX-127). Conformance is judged by **observable
  effect on a live process on a real host** — six named effects — and a rendering that matches the
  spec word for word without producing the effect is non-conformant.
- **C-104 (hard).** There is no silent fallback, structurally: preparing a command for confinement
  yields either a new confined command string or an availability error, never the original command.
  Mode `off` is the single exception and does no probing at all (REQ-SANDBOX-074, REQ-SANDBOX-088,
  REQ-TOOLS-118).
- **C-105 (hard).** A session requiring confinement the host cannot deliver **does not start**;
  no session, no session lock, no snapshot is left behind; the availability reason and remediation
  are reported; the run's event stream carries that refusal as its first and only entry, with no
  run-start event and no agent activity before or after (REQ-SANDBOX-094, REQ-SANDBOX-095,
  REQ-SANDBOX-097, REQ-SANDBOX-126, REQ-TOOLS-118). The availability decision is settled before the
  run does anything else and is written into run state before the session is announced ready.
- **C-106 (hard).** A wrap failure at command time refuses only that command — `sandbox_unavailable`,
  exit 126, `is_error`, outcome severity error, `error_class` = the failure's type name, and a detail
  saying the session requires confinement, that it could not be applied, and that the command was
  therefore not executed. The session continues and the next command re-renders afresh
  (REQ-SANDBOX-083, REQ-SANDBOX-078, REQ-TOOLS-118). It must never be absorbed by general error or
  retry handling (REQ-SANDBOX-084).
- **C-107 (hard).** Only a *new command string* is wrapped: keystroke input, empty-command polls,
  `list`, and control calls carrying only a session id are excluded; `background=true` spawns **are**
  wrapped; a request carrying both a background flag and a session id counts as a new spawn and is
  wrapped, so the documented-invalid combination cannot become a single-field bypass; wrapping is
  idempotent per issuance and wrappers never nest (REQ-TOOLS-120, REQ-SANDBOX-080 to REQ-SANDBOX-082).
- **C-108 (hard).** Writability: `read-only` grants no writable root; `workspace-write` grants the
  session's *actual* execution directory (the worktree when worktree isolation is in use, otherwise
  the workspace) first, then each configured additional root, duplicates removed keeping the first
  (REQ-SANDBOX-058, REQ-SANDBOX-091). A configured root missing at render time is **skipped with a
  log entry**, not an error, and is not writable in that command even if the command creates it,
  because the writable set is fixed when the invocation is rendered. Every active mode leaves the
  platform temporary location writable.
- **C-109 (hard).** `.git` and `.rotaris` are always read-only inside confinement, with no setting
  able to remove the exclusion, and the exclusion attaches to the **name** a command would use rather
  than to what it points at, so writing through a link or a stand-in file is still refused
  (REQ-SANDBOX-056, REQ-SANDBOX-057, REQ-TOOLS-116). Backend parity is required, including for a
  protected subpath that does not yet exist.
- **C-110 (hard).** The Linux carve-out rendering is fixed by case: outside every writable root →
  nothing extra; existing inside a writable root → `--ro-bind-try <p> <p>`; absent inside a writable
  root → `--tmpfs <p>` then `--remount-ro <p>`. Races land on the restrictive side, and a symlink
  with no target counts as absent. **No carve-out may leave anything on the host filesystem**; a
  backend that cannot establish one without creating a host-visible file or directory must refuse the
  command instead (REQ-SANDBOX-077, REQ-SANDBOX-078). The macOS profile places its denials **after**
  every allowance, because position decides effect (REQ-SANDBOX-075).
- **C-111 (hard).** Read access inside confinement is deliberately unrestricted — a confined command
  can read anywhere, and `runtime.additional_read_only_roots` therefore widens the *file tools'* path
  fence only and interacts with confinement not at all (REQ-SANDBOX-060, REQ-SANDBOX-053,
  REQ-TOOLS-132).
- **C-112 (hard).** The submitted command travels into confinement as a **single shell argument**
  (`/bin/sh -c '<command>'`) and is never split apart again; every embedded path and every rendered
  argument is quoted so that no crafted workspace path can end its enclosing literal and introduce
  rules of its own (REQ-SANDBOX-063, REQ-SANDBOX-064, REQ-SANDBOX-079). Quoting is a security
  boundary here, not a formatting nicety, because the wrapper is a *string submitted to a live shell*
  rather than an argv array.
- **C-113 (hard).** The confinement wrapper never changes the working directory; the persistent shell
  owns it, and the working directory a command observes must be unchanged by confinement on every
  platform (REQ-SANDBOX-062, REQ-TOOLS-123, REQ-SANDBOX-127). A documented, deliberate artifact is
  allowed on Linux: an empty `.git/` may appear inside a writable root that had none (REQ-TOOLS-123)
  — which sits awkwardly beside C-110's "leaves nothing behind" (OQ-5).
- **C-114 (hard).** The echoed command in a sandboxed observation is the command the agent submitted,
  never the wrapped form; wrapper argument lists and profile text never appear in agent-visible output
  (REQ-TOOLS-121, REQ-SANDBOX-086).
- **C-115 (hard).** Launch-failure relabelling requires **all four** conditions: the command was
  confined by this call; exit status nonzero; no failure kind assigned yet; and every non-empty line
  of the captured output — stdout and stderr **together** — begins with `bwrap:`, `sandbox-exec:` or
  `sandbox_apply:`. One unprefixed non-empty line on either stream prevents relabelling, as does no
  output at all. Background sessions get the same re-read at `query`/`kill` time (REQ-TOOLS-122,
  REQ-SANDBOX-085).
- **C-116 (hard).** A denial *inside* active confinement is the host's own and is passed through
  uninterpreted, un-normalized, un-annotated and un-retried; no requirement turns on an error number
  or a system-log entry; such a command is an ordinary nonzero-exit command and is never labelled
  `sandbox_unavailable` (REQ-SANDBOX-128).
- **C-117 (hard).** Confinement status is a pair (active, backend name) where active requires selected
  **and** available; selected-but-unavailable reports `(false, "")` with the backend name left empty
  so no record names a mechanism that never ran (REQ-SANDBOX-093, REQ-TOOLS-125). The pair is
  reported identically by the session snapshot, the workspace badge and the `session.start` event
  (REQ-TOOLS-124).
- **C-118 (hard).** The specification is resolved afresh for **each call**, from the issuing run's
  configuration and the conversation's actual working directory, worktree-aware (REQ-TOOLS-124).
- **C-119 (hard).** Verification checks and probes run through the same terminal enforcement point as
  everything else — no separate, less-checked execution path exists (REQ-SANDBOX-123). Lifecycle
  hooks sit deliberately **outside** both confinement and the permission policy, executed in the
  user's own shell on the host, with the audit trail as the only accountability and the boundary
  documented (REQ-SANDBOX-124, REQ-HOOKS-030).

### 2.11 Network egress

- **C-120 (hard).** Two enforcement points with different mechanisms, and they must not be conflated.
  For `fetch` — connections the product makes itself — per-host allow/ask/deny with pre-connection
  classification. For terminal commands — a static pattern recognizer at permission time, plus, only
  inside confinement, a **binary** network on/off switch (REQ-SANDBOX-047, REQ-SANDBOX-059,
  REQ-TOOLS-117, REQ-TOOLS-094). Destination-aware filtering of terminal traffic is explicitly out of
  scope and the limitation must be documented.
- **C-121 (hard).** Consequence of C-120 and C-100: on native Windows there is **no** egress
  enforcement for terminal commands at all — only the permission heuristic.
- **C-122 (hard).** Host canonicalization is a fixed function with required results: lowercase; drop
  user-info; drop port; unbracket IPv6; drop one trailing root dot; IDNA/punycode for non-ASCII; and
  Unicode and punycode spellings interchangeable in both directions. Where IDNA conversion does not
  succeed, the trimmed lower-cased original stands and is still compared literally. Unreadable input
  yields the empty string, the "unknown host", which classifies deny, matches no pattern, and counts
  as remote (REQ-SANDBOX-006 to REQ-SANDBOX-008, REQ-SANDBOX-013, REQ-SANDBOX-019).
- **C-123 (hard).** Pattern grammar is exact-host or a single leading `*.` and nothing else; matching
  advances whole DNS labels so a hit part-way through a label never counts; `*.example.com` covers
  `api.` and `a.b.` but **not** bare `example.com`; lookalikes never match. Any other use of `*` is
  an error naming the pattern and showing the literal supported form `*.example.com`
  (REQ-SANDBOX-009 to REQ-SANDBOX-012, REQ-TOOLS-085).
- **C-124 (hard).** Consultation order is denied list, then allowed list, then default disposition, so
  a specific denial outranks a broader allow wildcard (REQ-SANDBOX-014, REQ-SANDBOX-015). Disposition
  vocabulary is exactly {`allow`, `ask`, `deny`}, default `ask`, matched after trim and case-fold, any
  other spelling refused at load and unable to be installed later by any route including the settings
  surface (REQ-SANDBOX-001, REQ-SANDBOX-002, REQ-SANDBOX-017).
- **C-125 (hard).** "Local" is textual and performs **no name resolution**: the three loopback names,
  the whole `127.0.0.0/8` range, IPv6 loopback in any spelling canonicalizing to `::1`, and
  IPv4-mapped/compatible literals whose embedded address is in `127.0.0.0/8`. Everything else is
  remote and gated, explicitly including `0.0.0.0`, `::`, private ranges and link-local
  `169.254.169.254` (REQ-SANDBOX-018, REQ-SANDBOX-019, REQ-TOOLS-087). A name that resolves to
  loopback is still remote.
- **C-126 (accepted consequence).** Because classification is textual, an allow-listed name that
  resolves to a private or metadata address is permitted, and no DNS-pinning or post-resolution check
  is specified. This is the specification's deliberate choice; it must be documented rather than
  silently strengthened.
- **C-127 (hard).** Classification happens **before any connection is opened**, for the named URL and
  again for every redirect target; a denied host observes zero connection attempts and zero requests
  (REQ-SANDBOX-022). Redirects are never followed automatically; each hop is re-classified before it
  is fetched; the hop budget is 20 (REQ-SANDBOX-023, REQ-SANDBOX-024, REQ-TOOLS-090). This forbids
  any HTTP client configured to follow redirects itself.
- **C-128 (hard).** Redirect resolution is specified exhaustively: absolute targets used as given;
  relative values resolved as a URI reference against the hop that returned them, and the *resolved
  absolute URL* is what gets classified; a 3xx with no/empty/whitespace location ends the chain and
  is the final result, an error only if its own status is ≥ 400; an internationalized location is
  canonicalized before classification; a location that cannot be resolved to an absolute URL bearing
  a host yields the unknown host and is refused with no connection opened (REQ-SANDBOX-031).
- **C-129 (hard).** The `ask` disposition belongs to the gate, not the executor: by execution time the
  named host is already approved and pre-seeded as permitted for that request; a hop onto a **new**
  host classifying `ask` is refused with `egress_redirect_denied` and an instruction to request the
  final host directly; a hop onto an already-permitted host (path change, http→https, allow-listed
  host) is not re-gated (REQ-TOOLS-091, REQ-SANDBOX-027 to REQ-SANDBOX-030).
- **C-130 (hard).** The fetch failure-kind vocabulary is closed and exactly eight spellings —
  `egress_denied`, `egress_redirect_denied`, `egress_policy_error`, `too_many_redirects`,
  `invalid_request`, `timeout`, `network_error`, `http_error` — with `invalid_request` spelled
  identically to the terminal observation's member of the same name (REQ-TOOLS-092, REQ-SANDBOX-025).
  Each kind carries a fixed `error_class`: `NetworkEgressDenied` for the three egress refusals,
  `TooManyRedirects`, `InvalidFetchRequest` (REQ-SANDBOX-026, REQ-SANDBOX-024, REQ-SANDBOX-020).
- **C-131 (hard).** A malformed request is refused **before any connection**, with six enumerated
  conditions, null `status_code` and a detail naming the offending parameter, its value and the
  constraint it broke (REQ-SANDBOX-020). `timeout: 0` is carried through as given and means *no time
  limit* — the same reading `runtime.approval_timeout_seconds: 0` carries (REQ-SANDBOX-020,
  REQ-SANDBOX-053).
- **C-132 (hard).** The fetch timeout precedence chain is exactly three levels, highest first: the
  call's `timeout`; the owning run's `runtime.tool_call_timeout` (default 30 s); the built-in 10.0 s
  reachable **only** where there is no owning run. A lower level never overrides a higher, and
  whichever supplied the value is reported as `timeout_seconds` (REQ-SANDBOX-021, REQ-CONFIG-115,
  REQ-TOOLS-093).
- **C-133 (hard).** Response shaping is a fixed two-step: take the 1-based inclusive `from_line`/
  `to_line` window, then cap at `max_lines` (default 1000) setting `truncated`. Lines left out by the
  window **alone** never make `truncated` true; a window starting past the end yields no lines with
  `truncated` false (REQ-SANDBOX-034).
- **C-134 (hard).** Model-facing rendering is structurally fixed: failures render an error header, a
  `[fetch_diagnostic]` JSON block with sorted keys and nulls omitted and `failure_kind` always
  present, and a `[fetch_output]` block when a body was received; successes render five header lines
  in order then the body (REQ-SANDBOX-036).
- **C-135 (hard).** The policy is read from the owning run's current *saved* configuration at each
  call; a saved edit takes effect on the following fetch with no restart; unsaved settings-surface
  edits reach nothing, and starting a session in that state produces a non-blocking warning naming
  which settings differ (REQ-SANDBOX-038, REQ-SANDBOX-118, REQ-TOOLS-089).
- **C-136 (hard).** A fetch with no run-scoped configuration falls back to a fully permissive policy;
  this is not ungated overall because permission-layer gating still applies ahead of execution
  (REQ-SANDBOX-037, REQ-TOOLS-089).
- **C-137 (hard).** The URL itself is the gated subject of a fetch permission decision and appears as
  the gated command in decisions and the audit trail (REQ-SANDBOX-042) — which is exactly why C-21
  selects `url` as a command facet.
