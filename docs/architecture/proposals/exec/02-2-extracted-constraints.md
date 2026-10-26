# EXEC slice — architecture proposals — 2. Extracted constraints

Part 2 of 9 of [the exec proposal](../exec.md), which indexes every part.

## 2. Extracted constraints

Each constraint is labelled **hard** (the specification fixes an observable only some designs can
produce), **strong hint** (not fixed, but one design makes several requirements natural), or
**free** (genuinely an implementation choice, recorded because a later reader will wonder).

### 2.1 Execution host and process topology

- **C-01 (hard).** Exactly one executable ships. No console, headless, benchmark or other secondary
  executable may be published or made available by an installation; the single reserved argv token
  `builtin:code-intelligence` names a child the product starts of *itself*, not a user invocation
  (REQ-STARTUP-002, REQ-STARTUP-015, REQ-MCP-033). Any "separate runtime process" must therefore be
  the shipped binary re-entered, or a runtime the shipped binary already contains — never a second
  installed program.
- **C-02 (hard).** A single process hosts more than one live run, and runs must not leak into each
  other: two runs in one process never lend each other an egress allow-list (REQ-TOOLS-089,
  REQ-SANDBOX-038), one confined and one unconfined run coexist in one process each following the
  setting in force when it began (REQ-SANDBOX-096), and a call is decided under the policy, sandbox
  specification, egress configuration and artifact store of its own issuing run and no other
  (REQ-TOOLS-009, REQ-TOOLS-176). Run context is a value threaded through dispatch, never process
  or module state.
- **C-03 (hard).** Once the application has exited, no background command it started is still
  running and no terminal resource it opened is still held — *whatever ended it*, not only an
  orderly quit (REQ-TOOLS-111). This requires OS-level kill-group ownership of the whole descendant
  tree (POSIX process groups are already mandated by REQ-TOOLS-107), not merely a shutdown handler.
- **C-04 (hard).** A tool call that belongs to no run at all is decided by a rule-less allow-default
  policy reported as preset `unrestricted`, with a warning logged per decision; a call that belongs
  to *some* run but cannot be attributed while more than one run is live is **refused**, not guessed
  (REQ-TOOLS-029, REQ-TOOLS-009). Attribution must therefore be structural, not ambient.
- **C-05 (hard).** Sandbox availability is probed at most once per process and the verdict never
  changes within that process; it is cleared only by the explicit settings re-check control or by
  restarting the *application* (REQ-SANDBOX-067, REQ-SANDBOX-129, REQ-TOOLS-119). Whichever process
  owns the cache must have application lifetime, or the invariant is observably broken by a runtime
  restart.
- **C-06 (hard).** The availability probe never runs on the thread that draws the interface, and the
  settings label enters its checking state inside the 100 ms responsiveness budget while the trial
  may take up to 5.0 s (REQ-SANDBOX-069, REQ-SANDBOX-129, REQ-SHELL-150).
- **C-07 (strong hint).** Every interface surface this slice feeds is on a 100 ms budget: status-strip
  flags reflect a change within 100 ms, the next queued approval dialog is presented within 100 ms of
  the previous closing (REQ-TOOLS-184, REQ-TOOLS-063), and a keystroke into an armed terminal is
  visible within the 100 ms gesture budget (REQ-SHELL-166, REQ-SHELL-150). Long or blocking work in
  tool execution — tokenizing, hashing, SHA-256 over files, JSONL compaction, the sandbox trial —
  must not sit on any path that services those budgets.
- **C-08 (free).** How many OS threads or worker contexts the runtime uses. The only obligation is
  that the diagnostics record can count and name them (REQ-STARTUP-134).

### 2.2 Tool registry and capability declarations

- **C-09 (hard).** The public tool name set is closed and enumerated: exactly the eighteen names of
  REQ-TOOLS-001, with `haet` an alias resolving to the same tool as `haet_edit`. Any other `tools:`
  entry fails configuration validation with an error naming the persona, the entry and the accepted
  names; an entry naming a configured MCP server fails the same way with an extra sentence pointing
  at `mcp_servers` (REQ-TOOLS-002).
- **C-10 (hard).** Every registry name carries a three-facet capability declaration — reads workspace
  files / writes workspace files / runs commands — each declared or not, and the declaration is a
  property of the tool, never of the content it is handed (`terminal` declares running commands
  whatever command it is given; a command that writes a file does not make `terminal` a writer)
  (REQ-TOOLS-001). The per-name declarations are fixed in that requirement and must exist in exactly
  one place in the product.
- **C-11 (hard).** A tool outside the registry — a plugin tool or an MCP tool — carries **no**
  declaration, and no facet is inferred from its name, description or self-description. It is read
  fail-closed *in the direction of the reading rule*: a rule that grants on a declared facet sees
  nothing declared and does not grant; a rule that withholds, refuses or blocks on a declared facet
  sees all three declared and withholds (REQ-TOOLS-001). One accessor cannot serve both directions;
  the direction is part of the query.
- **C-12 (hard).** Two tool classes are stated against the declaration and must stay consistent with
  it by construction, not by a second decision: the read-only class is exactly
  {`grep`, `glob`, `fetch`, `haet_read`, `read_file`, `artifact_read`, `artifact_list`,
  `artifact_write`}, and the network class is exactly {`fetch`} (REQ-TOOLS-007, REQ-SANDBOX-039).
  Class membership is *not* a facet and is not derivable from the facets.
- **C-13 (hard).** Narrowing is a four-stage pipeline that can only remove, applied in the fixed order
  run-scoped allow-list → `coordinator_only` → `read_only` → `tool_restrictions`; no later stage
  restores what an earlier one removed and none adds a tool the persona did not declare; every
  removal is logged with the persona and the removing control (REQ-TOOLS-006). `coordinator_only`
  removes exactly `terminal`, `write_file`, `haet_edit`, `haet`, `git_commit` and nothing else.
- **C-14 (hard).** The prompt's tool listing and the callable tool set are produced from the same
  resolution and are always equal — for built-ins (REQ-TOOLS-010) and for MCP grants
  (REQ-TOOLS-167). Two code paths that "agree" are non-conformant; there must be one.
- **C-15 (hard).** A missing runtime prerequisite removes a tool and records a stable machine-readable
  reason code; it never fails agent construction. The reasons that must be distinguishable are
  enumerated, and an unloadable `custom_tools:` plugin joins them as a further distinguishable code
  plus a session issue naming persona, path and cause (REQ-TOOLS-004, REQ-TOOLS-164).
- **C-16 (free).** The concrete spelling of each reason code, provided it is stable and documented
  (REQ-TOOLS-004).

### 2.3 The permission gate

- **C-17 (hard).** Exactly one gate, no ungated dispatch path, for built-in, plugin and MCP calls
  alike (REQ-TOOLS-011, REQ-TOOLS-163). A provider-side tool-execution feature that would step
  around it is forbidden: provider built-in tools are off by default and any provider-routed call is
  executed by the product's own path (REQ-SANDBOX-125).
- **C-18 (hard).** Decision vocabulary is exactly {`allow`, `ask`, `deny`}; resolution never raises to
  the dispatcher; an `ask` is always resolved through the approval flow before the dispatcher sees
  anything, so the dispatcher only ever handles `allow` or `deny` (REQ-TOOLS-012).
- **C-19 (hard).** Fail-closed is unconditional. Any exception during resolution yields rule id
  `failclosed:unresolvable-policy`, source `fail-closed`, decision `ask` on interactive hosts /
  `deny` on headless hosts, never `allow`, with the reason
  `The permission policy could not be resolved (<detail>); failing closed to <ask|deny>.`
  (REQ-TOOLS-020). The gate must therefore know host interactivity at decision time, before the
  approval flow is reached.
- **C-20 (hard).** Decision-source vocabulary is closed and exactly twelve values: `rule`,
  `session-rule`, `preset`, `builtin`, `fail-closed`, `user-once`, `user-session`, `user-deny`,
  `headless-policy`, `timeout`, `cancelled`, `presenter-error` (REQ-TOOLS-028). These are persisted
  and streamed and must round-trip.
- **C-21 (hard).** A permission request carries tool name, persona, the arguments as a name→value
  mapping, and **at most one** command facet selected purely by argument name: `command` if present
  and a string, else `url` if present and a string, else none (REQ-TOOLS-015). Selection by name
  alone is normative — a plugin tool naming a string argument `command` does supply a facet, and
  `write_file`'s selector is named `operation` precisely so it cannot (REQ-TOOLS-135).
- **C-22 (hard).** Two renderings exist and are never substituted. *Request summary* =
  `<tool>: <redacted command facet>` or `<tool>(<sorted argument keys>)`, and it is what appears in
  audit entries and in `permission.decision` / `approval.requested` events and in a session rule's
  description. *Argument summary* = sorted `key=value` lines, appearing only in the approval payload
  and dialog (REQ-TOOLS-016, REQ-TOOLS-057, REQ-TOOLS-079, REQ-TOOLS-083).
- **C-23 (hard).** A rule constrains any combination of five facets — tool names (case-insensitive
  set), personas, path scope, a command matcher, an exact argument set — and fires only when every
  populated facet matches; an unpopulated facet constrains nothing (REQ-TOOLS-017). Exact-argument
  matching compares key sets and, per key, textual value; **non-string values compare by compact
  JSON**: no insignificant whitespace, keys sorted ascending by code point, numbers in shortest
  round-tripping form, so `1` and `1.0` compare equal (REQ-TOOLS-017).
- **C-24 (hard).** Path-scope evaluation reads only the seven argument keys
  {`path`, `file_path`, `filename`, `paths`, `base_path`, `dir`, `directory`}; relative paths resolve
  against the workspace root; `inside_workspace` requires *every* path inside, `outside_workspace`
  fires on the *first* escape; an unresolvable path counts as outside (REQ-TOOLS-018). Path
  resolution follows symlinks and junctions to a real path (REQ-TOOLS-129) — an I/O operation on the
  decision path.
- **C-25 (hard).** A policy is an ordered rule list plus a default decision plus a preset name;
  first match in list order wins and no later rule affects it. A policy is invalid when the preset
  name is empty, a rule id is empty, two ids collide, or an outcome is outside the vocabulary; an
  invalid policy errors naming the defect at the latest when the first call would be decided under
  it, and never decides a call (REQ-TOOLS-019).
- **C-26 (hard).** Session approvals are matched **before** any policy rule, most recent grant first,
  and they outlive policy replacement and mode change unchanged — none dropped, none newly matching
  (REQ-TOOLS-023). Their ids are `session:allow:<n>`, numbered from 1 in grant order, and a grant
  matches only the same tool name (case-insensitive), same persona, and either a byte-identical
  pre-redaction command facet or the same exact argument set (REQ-TOOLS-024).
  *Narrowed 2026-09-27 by [`PD-TOOLS-004`](../../../product/directives/pd-tools-004.md#pd-tools-004): for the public `write_file`
  and `haet_edit` a grant matches the same resolved set of paths from the same persona, whatever the other arguments;
  the text above is kept as proposed.*
- **C-27 (hard).** Loop-control names `finish`, `finishtool`, `think`, `thinktool` are never gated,
  matched case-insensitively, resolving allow with source `builtin` and rule id
  `builtin:meta-tool` (REQ-TOOLS-014).
- **C-28 (hard).** A deny does not abort the run: it returns a tool-result error carrying the original
  tool-call id, with exactly the refusal text of REQ-TOOLS-013. A malformed tool payload takes the
  same shape after repair fails (REQ-TOOLS-032), as does a `pre_tool` hook block (REQ-TOOLS-031,
  REQ-HOOKS-049, REQ-HOOKS-071).
- **C-29 (hard).** Payload repair runs *before* schema validation and must implement exactly three
  repairs: closing structures left open by truncation; reading a single object as a one-element array
  for the five named fields `tasks`, `phases`, `files`, `items`, `test_cases`; and recovering a
  truncated run-completion payload as `{"message": <recovered text>}` (REQ-TOOLS-032).
- **C-30 (hard).** Dispatch order is fixed: permission resolution → (allow branch only) pre-execution
  hooks → tool execution → post-execution hooks → observation normalization and diagnostics
  (REQ-TOOLS-175, REQ-TOOLS-031, REQ-HOOKS-004, REQ-HOOKS-068). A denied call starts no hook process.
  The post-execution hook sees the result already truncated to REQ-HOOKS-066's 4096-character cap.
- **C-31 (hard).** Replacing the policy mid-run governs the agent's very next call with no restart, no
  reconnection and no agent rebuild; decisions already returned keep their outcome (REQ-TOOLS-025).
  The same holds for the workspace-scope opt-out (REQ-TOOLS-191).
- **C-32 (free).** How the rule table is stored in memory, provided ordering, id uniqueness and
  atomic replacement hold.

### 2.4 Command-line analysis

- **C-33 (hard).** Matching is token-by-token, never against raw text. Pattern and command segment are
  each split under shell tokenization rules; the *i*-th pattern token glob-matches the *i*-th command
  token; a trailing `*` matches any number of further tokens (including zero); without it the token
  counts must be equal (REQ-TOOLS-033, resolution OQ 18).
- **C-34 (hard).** The **first token of a segment folds case; every later token is case-sensitive**,
  identically on every platform and every backend. `rm -rf *` fires on `RM -rf /`; `git status` fires
  on neither `git status-check` nor `git STATUS` (REQ-TOOLS-033). Because switches keep their case,
  both spellings are listed where both are wanted (`rmdir /s *` and `rmdir /S *`) (REQ-TOOLS-039).
- **C-35 (hard).** Compound lines decompose on `&&`, `||`, `;;`, `;`, `|`, `&` and newline, longest
  operator first, respecting single/double quotes and backslash escapes; each segment matches
  independently; the introducing operator is retained with the segment because the pipe-to-shell
  matcher needs it (REQ-TOOLS-035, REQ-TOOLS-038).
- **C-36 (hard).** "Unconfident" is a closed predicate: command substitution (`$(…)` or backticks
  outside single quotes, including inside double quotes); untokenizable text; no command after
  redirection stripping; an indirection head from
  {`eval`, `exec`, `source`, `.`, `xargs`, `env`, `nohup`, `time`}; or a shell head from
  {`sh`, `bash`, `zsh`, `dash`, `ksh`, `fish`, `cmd`, `powershell`, `pwsh`} with `-c`/`-Command`/`/c`/`/C`
  or with no arguments. Redirection tokens end the matched token stream (REQ-TOOLS-036).
- **C-37 (hard).** Decomposition never raises; an unparseable line still yields exactly one segment,
  classified unconfident, so every input produces something for the escalation matcher (REQ-TOOLS-037).
- **C-38 (hard).** A non-tokenizable or empty *pattern* is a policy-**build**-time error
  (REQ-TOOLS-034) — eager validation. Host patterns are the opposite: wildcard grammar is *not*
  validated at load, and an invalid stored pattern surfaces at classification time as a refused
  fetch with `egress_policy_error` (REQ-SANDBOX-004, REQ-SANDBOX-016). Two validation times, both
  mandatory.
- **C-39 (hard).** The nine starter rules occupy fixed positions (five denies at 1–5, four asks at
  6–9) with the exact rule ids and pattern lists of REQ-TOOLS-039, and belong to the shipped presets
  only — the rule-less `unrestricted` default does not carry them (REQ-TOOLS-040).
- **C-40 (hard).** The network-command catalogue is closed and exhaustive, exactly the patterns of
  REQ-TOOLS-094, evaluated as a pattern matcher over segments; one matching segment settles the line;
  a bare `curl` or bare `npx` matches. It is a permission heuristic and explicitly **not** an
  enforcement boundary (REQ-TOOLS-094, REQ-SANDBOX-043).
- **C-41 (accepted consequence, hard).** One POSIX-shaped tokenizer serves every platform, including
  the PowerShell backend. A PowerShell line using a backtick escape or a `$( )` subexpression will be
  classified unconfident and therefore *ask* in the supervised presets, because REQ-TOOLS-036's list
  is fixed and platform-independent. This is over-triggering, not under-triggering, and is the
  fail-closed direction the domain requires.

### 2.5 Presets, mode resolution and downgrade

- **C-42 (hard).** Exactly three presets, spelled `restricted`, `ask`, `autonomous`; stable persisted
  values; totally ordered by restrictiveness 0 < 1 < 2; default `ask`; an unrecognized name resolves
  to `restricted` with a logged warning, an empty/absent name to the default; resolution never raises;
  startup refuses to proceed if any preset lacks a rank (REQ-TOOLS-041, REQ-TOOLS-046, REQ-TOOLS-047,
  REQ-SANDBOX-046). One definition, cited everywhere else.
- **C-43 (hard).** Rule families compose into each preset in a fixed, behaviourally load-bearing order:
  (1) fetch/egress, (2) destructive commands, (3) network-command classification, (4) read-only
  (REQ-TOOLS-041). Because first match wins, host-scoped fetch gating is evaluated before any blanket
  read-only allowance (REQ-SANDBOX-039).
- **C-44 (hard).** `autonomous` carries only the five destructive denies — no fetch pair, no
  network-command rule, no ask rule of any kind, and no path-scoped ask ever
  (REQ-TOOLS-044, REQ-SANDBOX-045). Outside-workspace access under `autonomous` either succeeds via
  the opt-out or fails with the path-fence error; it never prompts.
- **C-45 (hard).** The downgrade has exactly three conjunctive conditions — unattended, unsandboxed,
  and not opted in via `runtime.allow_unsandboxed_autonomous` — applies only to a permissive mode
  (today only `autonomous`), goes no further than `ask`, leaves `ask` and `restricted` untouched, and
  never raises (REQ-TOOLS-067, REQ-SANDBOX-099). Its user-facing reason is a verbatim pattern
  (REQ-TOOLS-068).
- **C-46 (hard).** "Unattended" is exactly "the session has no registered approval presenter", whether
  none was ever wired or the presenter was torn down (REQ-TOOLS-053, REQ-TOOLS-069, REQ-SANDBOX-101).
  Only presence is tested, not whether the presenter later answers. This is the sole definition; every
  other reading of "headless" in the corpus reduces to it.
- **C-47 (hard).** "Sandboxed" for the downgrade test means *requested and proved usable*, never
  configured alone. Because a session requesting an unavailable sandbox does not start at all, at
  resolution time unsandboxed ⇔ `runtime.sandbox_mode == off` (REQ-TOOLS-070, REQ-TOOLS-118,
  REQ-SANDBOX-095, REQ-SANDBOX-098).
- **C-48 (hard).** Mode selection precedence at agent construction: a persona `permission_mode` pin
  beats a session override *unless* the override is at least as restrictive as the pin, in which case
  the override wins; with neither, `runtime.permission_mode` applies; the result is then put through
  the downgrade for that agent's own context (REQ-TOOLS-048, REQ-TOOLS-074, REQ-SANDBOX-103,
  REQ-SANDBOX-106). Skipped personas are listed alphabetically in the audit entry, the log line and
  the user-facing confirmation.
- **C-49 (hard).** A session stores the **requested** mode, not the effective one, so agents started
  later re-resolve for the circumstances then in force (REQ-TOOLS-073, REQ-SANDBOX-106); but the
  run-start event reports the **effective** mode after tightening (REQ-SANDBOX-110), stamped together
  with the sandbox flag and backend name from *one* reading of status (REQ-SANDBOX-104,
  REQ-TOOLS-071).
- **C-50 (hard).** The unattended-run advisory is empty exactly when an unattended run in that
  workspace would raise no `ask` at all — today only when the effective mode is `autonomous`; it names
  all three resolving settings, is shown in the desktop interface before the run begins with the
  effective mode and sandbox status, is dismissible, and never blocks the launch (REQ-TOOLS-072,
  REQ-TOOLS-192, REQ-SANDBOX-107).

### 2.6 Approvals

- **C-51 (hard).** An `ask` suspends exactly one tool call, identified by its own request id; the
  session's other agents keep running and can raise approvals of their own (REQ-TOOLS-050,
  REQ-TOOLS-053). Suspension must be per-call and non-blocking for the session.
- **C-52 (hard).** Options are exactly three (approve once, approve for session, deny); terminal wait
  states are exactly three (resolved, cancelled, timed out); each maps to a fixed decision, rule id,
  source and reason clause (REQ-TOOLS-051, REQ-TOOLS-052).
- **C-53 (hard).** Wait-registry semantics are enumerated and must all hold: empty request id rejected;
  duplicate pending id rejected with `Approval '<id>' is already pending.`; resolving or cancelling an
  unknown id fails without side effect; waiting on an unknown id resolves *cancelled immediately*; a
  request discarded before it was shown counts as cancelled; bulk-cancel releases every waiter and is
  used on run cancellation, shutdown and host teardown (REQ-TOOLS-054, REQ-TOOLS-177, REQ-ORCH-132).
- **C-54 (hard).** The wait budget is `runtime.approval_timeout_seconds` — one key, shared with the
  user-question wait, float ≥ 0, default 300.0, `0` meaning wait without limit (still released by
  cancellation/shutdown/teardown), negative rejected at load (REQ-TOOLS-055, REQ-TOOLS-178,
  REQ-CONFIG-126). A zero-timeout wait must not be implemented with a timer that fires immediately.
- **C-55 (hard).** The approval payload is a fixed nine-field record, fully JSON-serializable, written
  into session state when presented and removed on answer/timeout/cancellation (REQ-TOOLS-056,
  REQ-TOOLS-060). `argument_summary` clips each value at 240 characters with a trailing `…` and is
  empty when a command facet exists.
- **C-56 (hard).** Every `ask` — interactive **or** headless — publishes `approval.requested` before
  the wait begins, with `resolver` ∈ {`brokered`, `headless`}, `timeout_seconds` null on the headless
  path (meaning no wait occurs at all), and `unattended_reason` `headless-policy` there
  (REQ-TOOLS-061). A failed publish never fails the dispatch.
- **C-57 (hard).** Approval answers can come only from the host UI. Nothing in agent output or tool
  output can satisfy an approval (REQ-TOOLS-059).
- **C-58 (hard).** A presenter that raises causes the pending request to be discarded and the call
  denied with source `presenter-error` (REQ-TOOLS-058). Approval resolution that raises, or returns
  another `ask`, denies with source `fail-closed` and a fixed reason tail (REQ-TOOLS-026).
- **C-59 (hard).** A session with no registered presenter routes every ask through
  `runtime.headless_approval_policy` ∈ {`deny` (default), `abort`}, unrecognized behaving as `deny`;
  `abort` invokes the session's registered abort hook and degrades to `deny` with a warning when none
  is registered. With no approval resolver wired at all, a built-in fail-safe resolver denies with
  source `headless-policy` (REQ-TOOLS-064, REQ-TOOLS-065, REQ-TOOLS-066). Never a silent allow, never
  a hang.
- **C-60 (hard).** The dialog is modal, minimum 560×380 logical pixels, **has no default action**,
  places initial focus on Deny, and answers Deny on Escape and on window close; exactly one dialog is
  open per window; queued requests are presented oldest-first by `approval.requested` publication
  order, the next within 100 ms of the previous closing; a request answered or cancelled elsewhere
  closes its open dialog without asking again; a request that timed out or was cancelled while queued
  is dropped unshown and counts as cancelled; an undeliverable answer leaves the dialog open with all
  three buttons disabled and a status line (REQ-TOOLS-063, REQ-TOOLS-185). The queue is therefore a
  *shared, ordered, revocable* structure spanning the gate and the window.
- **C-61 (hard).** A recorded decision carries the `request_id` only when it directly resolved a raised
  approval, checked strictly (approval-resolution source; matching session id and tool name); any
  mismatch yields an empty id. Pairing works from both sides, so every answered `approval.requested`
  is matched by exactly one `permission.decision` bearing the same id (REQ-TOOLS-062, REQ-TOOLS-183).

### 2.7 Audit and evidence persistence

- **C-62 (hard).** Permission decisions and mode changes go to
  `<workspace>/.rotaris/sessions/<session_id>/evidence/permissions.jsonl`, one JSON object per line,
  in the order decisions were taken, interleaved so a top-to-bottom reader recovers which mode
  governed any decision from the nearest preceding mode-change entry (REQ-TOOLS-078, REQ-TOOLS-082,
  REQ-SANDBOX-112).
- **C-63 (hard).** The file is a **ring**: content is never altered, no entry is ever inserted ahead of
  one already present, and the only removal is retention trimming to the 5000 most recent entries,
  each new entry beyond that displacing the oldest still held. A reader sees a suffix of the history
  in write order, every retained entry byte-for-byte as written (REQ-TOOLS-078). The
  verification-gate file obeys the same rule with its own 5000 cap (REQ-TOOLS-190).
- **C-64 (hard).** Every resolved decision is recorded, allows included; a raising audit sink logs a
  warning and never breaks dispatch (REQ-TOOLS-027, REQ-TOOLS-076). Durability is therefore
  best-effort at this surface while the decision itself is not.
- **C-65 (hard).** Entries land under the session whose call was decided and never another's; an agent
  serving two sessions in turn writes each entry under the session it was serving; a decision taken
  outside every registered session writes no entry and reports no error (REQ-TOOLS-080,
  REQ-TOOLS-176).
- **C-66 (hard).** A decision entry carries exactly the eleven listed fields and, beyond the redacted
  command facet inside `summary`, **no argument values at all** (REQ-TOOLS-079). A mode-change entry
  always carries `skipped_personas`, present even when empty (REQ-TOOLS-082).
- **C-67 (hard).** Per-entry side effects are fixed: a deny records a `permission_denied` issue with a
  named severity, actor, message shape, evidence reference and metadata; a `user-once`/`user-session`
  approval emits a `permission_approved` timeline event; every entry publishes `permission.decision`
  on the session event bus (REQ-TOOLS-081).
- **C-68 (strong hint).** Several agents in one session decide calls concurrently and every entry must
  land in decision order in one file. A single serialized writer per session file is the only
  straightforward way to satisfy C-62 and C-63 together.
