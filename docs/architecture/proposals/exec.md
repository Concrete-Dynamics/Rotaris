# EXEC slice — architecture proposals

**Slice:** tool execution and its confinement.
**Domains owned:** 05 (`REQ-TOOLS`, agent tooling, terminal execution, permissions, approvals) and
10 (`REQ-SANDBOX`, command sandboxing and network egress policy).
**Status:** proposal. Nothing here is a decision; the Architecture Gate is not open.

## 1. Scope

This slice owns everything between "the model asked for a tool call" and "the call ran, or did not,
and the record says which":

- the public tool registry and its per-tool capability declarations (REQ-TOOLS-001 to REQ-TOOLS-010);
- the single permission gate every dispatch passes (REQ-TOOLS-011 to REQ-TOOLS-032);
- command-line decomposition and pattern matching (REQ-TOOLS-033 to REQ-TOOLS-040);
- the three permission presets, mode resolution and the unattended downgrade (REQ-TOOLS-041 to
  REQ-TOOLS-049, REQ-TOOLS-067 to REQ-TOOLS-077, REQ-SANDBOX-098 to REQ-SANDBOX-107);
- the approval flow, interactive and headless (REQ-TOOLS-050 to REQ-TOOLS-066);
- the permission audit trail and the verification-gate evidence file (REQ-TOOLS-078 to REQ-TOOLS-083,
  REQ-TOOLS-190, REQ-SANDBOX-112);
- terminal execution — foreground, background, outcome classification, live streaming
  (REQ-TOOLS-095 to REQ-TOOLS-113, REQ-TOOLS-126 to REQ-TOOLS-128, REQ-TOOLS-179, REQ-TOOLS-187);
- OS-level confinement on every supported platform (REQ-TOOLS-114 to REQ-TOOLS-125,
  REQ-SANDBOX-048 to REQ-SANDBOX-097, REQ-SANDBOX-127, REQ-SANDBOX-128);
- network egress policy and the `fetch` tool (REQ-TOOLS-084 to REQ-TOOLS-094, REQ-SANDBOX-001 to
  REQ-SANDBOX-047);
- secret redaction as a shared pass (REQ-TOOLS-171 to REQ-TOOLS-174);
- custom tool plugins and the MCP grant/narrowing surface as *gate* clients (REQ-TOOLS-161 to
  REQ-TOOLS-170).

The workspace file tools, search tools, task-list, artifact and delegation tools
(REQ-TOOLS-129 to REQ-TOOLS-158, REQ-TOOLS-188, REQ-TOOLS-189) sit inside domain 05 but their
substance belongs to other slices (workspace/context, library/artifacts, run orchestration). This
document treats them only where they constrain the gate, the registry, or the execution host — the
path fence as a permission input (REQ-TOOLS-018, REQ-TOOLS-129 to REQ-TOOLS-132), the `operation`
argument name that keeps `write_file` out of the command facet (REQ-TOOLS-135), and the atomic-write
and undo obligations that fix where file I/O may run (REQ-TOOLS-132).

The integrated terminal panel itself (REQ-SHELL-079 to REQ-SHELL-111, REQ-SHELL-166) belongs to the
desktop-shell slice, but its backend contract is ours: it is a *view onto agent-owned terminal
streams*, and every constraint it places on how those streams are produced is recorded here.

---

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
  *Narrowed 2026-09-27 by [`PD-TOOLS-004`](../../product/directives.md#pd-tools-004): for the public `write_file`
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

### 2.12 Secret redaction

- **C-138 (hard).** One shared pass backs **seven** surfaces — approval prompt, audit log, event
  stream, application log files, user-visible error text, persisted documents, lifecycle-hook
  payloads — and none of them carries redaction rules of its own (REQ-TOOLS-171). One definition of
  the algorithm, the marker, the display mask and the value-prefix list.
- **C-139 (hard).** Four ordered layers with exact semantics: `key=value`/`key: value` with
  secret-looking keys; `--flag value` with secret-looking flags; the value after `Bearer`/`Basic`/
  `token` compared case-insensitively; and a value-shape sweep for `ghp_`, `ghs_`, `ghu_`, `gho_`,
  `sk-`, `sk_`, `iv1.`, `eyj`, recognized case-insensitively and only at a token boundary. In layers
  1–3 the replaced value spans exactly one value token: to the matching closing quote when quoted
  (quotes retained around the mask), otherwise to the first following whitespace or end of string
  (REQ-TOOLS-171).
- **C-140 (hard).** The key-name test is a fixed segmentation: strip a leading run of `-`, split on
  every run of non-alphanumeric characters, and match a **whole** segment case-insensitively against
  a closed sixteen-word list. `--api-key` and `GITHUB_TOKEN` are secret-looking; `keyboard_layout` and
  `--secretly-verbose` are not (REQ-TOOLS-172). When the key is secret-looking the **entire** value is
  masked, not merely the credential-shaped part.
- **C-141 (hard).** The mask is exactly `***`, identical on every surface, carrying no character of
  the value and no indication of its length; only the value is replaced, so program names, subcommands
  and flag names survive; the pass is idempotent; and the recognized set is complete, so a string
  carrying none of it reaches its destination unaltered (REQ-TOOLS-171).
- **C-142 (hard).** The **display mask** is a different function and the two are never substituted:
  ≤ 4 characters → `****`; longer → first 2 + `****` + last 2, so a rendering is always 4 or 8
  characters and never discloses length. It is the only rendering of a stored secret any interface
  shows (REQ-TOOLS-171).
- **C-143 (hard).** Redaction on events must hold "no matter how the event was assembled or which of
  its fields were set last", and `permission.decision` summaries are described as re-redacted on
  construction *and on assignment* (REQ-TOOLS-173, REQ-TOOLS-083, Data & Formats). This is an
  invariant on the type, not a discipline at call sites.

### 2.13 Extension points: plugins and MCP

- **C-144 (hard, and a stack conflict).** Custom tool plugins are `*.py` files under
  `<workspace>/.rotaris/plugins`, listed per persona under `custom_tools:`, each defining exactly one
  tool definition, loaded when that persona's agent is built, executing **inside the host process**
  with exactly the OS privileges that process holds and no confinement of their own
  (REQ-TOOLS-161, REQ-TOOLS-163, REQ-TOOLS-165, Data & Formats on-disk layout). A TypeScript/Node
  host cannot import a Python module into its own process. See ADR-EXEC-12 — **ESCALATE**.
- **C-145 (hard).** Discovery is not loading: a file's presence in the plugin folder grants nothing;
  the settings inventory must list every `*.py` file in that folder *and state in text, never by
  colour alone, whether it is loaded and by which personas* (REQ-TOOLS-161, REQ-TOOLS-165,
  REQ-SHELL-149).
- **C-146 (hard).** Duplicate registered plugin names after configuration resolution, and a plugin
  registering under a name the persona also declares under `tools:`, are **startup errors** — they
  are ambiguities about which tool a name means, not absences (REQ-TOOLS-162, REQ-TOOLS-002,
  REQ-TOOLS-164).
- **C-147 (hard).** Every plugin argument and return value must be expressible as JSON (or a declared
  schema type); plugin exceptions become structured tool errors with type and message to the model and
  stack traces to debug logs only; a plugin is built with and invoked under the same run-scoped
  context a built-in receives (REQ-TOOLS-163). This JSON constraint is also what licenses the compact
  JSON comparison of C-23.
- **C-148 (hard).** `tools:` never names an MCP server. Exactly one key grants a server
  (`mcp_servers`) and one narrows it (`mcp_tools`); no entry grants the whole surface; a server's own
  disabled-tools list applies on top and a denial always beats a grant (REQ-TOOLS-001,
  REQ-TOOLS-166).
- **C-149 (hard).** Grant matching accepts the original name or that name carrying one of three
  provider prefixes (`<server>_`, `mcp-<server>-`, `mcp__<server>__`), the unprefixed name always
  remaining a match. A grant naming a tool the server does not ship is logged once per process and
  never fails the run — a shipped surface is a runtime fact. A `mcp_tools` key naming a server absent
  from that persona's `mcp_servers` is a configuration-validation error — a static contradiction
  (REQ-TOOLS-168, REQ-TOOLS-169). Static typos fail; host facts warn.

### 2.14 Cross-cutting isolation and lifecycle

- **C-150 (hard).** Permission state never crosses a session or run boundary and nothing falls back
  from one to another when its own state is missing: an approval answered in one session never
  authorizes a call in another; one run's decisions never appear in another's audit trail; a mode
  change in one session never alters another's; a call that cannot be attributed to a run never
  borrows a live run's sandbox specification or egress configuration (REQ-TOOLS-176).
- **C-151 (hard).** Teardown ordering is specified: discarding a session's approval host cancels all
  waiting approvals (waiters resolve cancelled → deny); run or scheduler stop releases blocked calls
  the same way; discarding the session's mode override at run end prevents a resumed session
  inheriting a mid-run switch (REQ-TOOLS-177, REQ-TOOLS-075).
- **C-152 (hard).** Agents are constructed with **no** built-in run-termination tool; a run terminates
  when the agent produces a user-addressed message and requests no tool call in the same turn. The
  never-gated loop-control names of C-27 are retained only for personas or providers that still
  surface such a tool (REQ-TOOLS-180).
- **C-153 (hard).** The event envelope carries `schema_version`, `event`, ISO-8601 UTC `timestamp` and
  `session_id`, and consumers must ignore unknown fields (REQ-TOOLS-182). `session.start` carries
  `permission_mode` (effective) and `sandboxed` (verdict); `tool.start`/`tool.finish` carry redacted
  arguments clipped at 240 characters plus outcome and duration (REQ-TOOLS-181, REQ-TOOLS-173,
  REQ-SANDBOX-109, REQ-SANDBOX-110).

---

## 3. Open questions

These are places where the specification is silent, under-determined, or internally inconsistent
across the two domains I own. Each is raised rather than invented around.

- **OQ-1 — Backend selection for the terminal is unspecified.** REQ-TOOLS-100 fixes the closed
  `backend` vocabulary {`single-session`, `tmux-pool`}, REQ-TOOLS-099 fixes `kill_status` values that
  only a pane-based pool can produce (`pane_replaced`, `replace_failed`), and REQ-TOOLS-103 specifies
  pooled-recovery behaviour in detail. Nothing states when a pooled backend is used, whether it is
  required to exist, or what selects it. If both must ship, a POSIX-only pooled backend cannot exist
  on Windows, where REQ-TOOLS-104 mandates PowerShell. See ADR-EXEC-06 (ESCALATE).
- **OQ-2 — The payload of a stream frame is under-determined.** REQ-TOOLS-127 describes `delta` and
  `screen` frames in terms of *text*, and requires the closing `screen` frame's text to equal the
  observation's final plain output. REQ-SHELL-095, REQ-SHELL-098 and REQ-SHELL-166 require a full VT
  character grid with alternate-screen fidelity, per-cell attributes and 16 ANSI colours. Plain text
  cannot carry the second; VT bytes are not "the observation's final output text". A rule is needed
  for what a frame carries and how the terminal `screen` frame relates to the observation text.
  See ADR-EXEC-07.
- **OQ-3 — Shell state under confinement.** Foreground calls accumulate working directory, exported
  variables and aliases in a persistent shell (REQ-TOOLS-097), but a confined command is rendered as
  `<launcher> … /bin/sh -c '<command>'` submitted into that shell (REQ-SANDBOX-079), so a `cd` or an
  `export` inside a confined command lives in the inner `sh` and dies with it. Does shell state
  persist across sandboxed foreground calls? The two requirements describe different behaviour for
  `sandbox_mode: off` and `workspace-write` and neither says so.
- **OQ-4 — Host canonicalization contradicts itself across the two domains.** REQ-TOOLS-086 says the
  normalizer strips IPv6 brackets and then **re-brackets bare IPv6 literals**; REQ-SANDBOX-006
  requires `http://[::1]:9000/` → `::1`, unbracketed, as a stated required result. One of the two must
  give way. Recommended reading: REQ-SANDBOX-006, which owns egress classification and states
  concrete required results.
- **OQ-5 — "Leaves nothing behind" versus the documented empty `.git/`.** REQ-SANDBOX-077 requires
  every carve-out to exist only inside the confined mount view, with the host filesystem holding
  exactly what it held before, and forbids a backend that cannot do so from creating anything.
  REQ-TOOLS-123 records as a "documented, deliberate artifact" that an empty `.git/` may appear inside
  a writable root on Linux. These cannot both hold.
- **OQ-6 — `error_class` is language-shaped.** REQ-TOOLS-101 fixes `ValueError` as an observable
  value, and REQ-SANDBOX-083 defines the sandbox case as "the type name of the failure" — an
  implementation-language-dependent string on an otherwise machine-readable field. Either
  `error_class` is a closed product vocabulary (in which case the sandbox and terminal values need
  enumerating) or it is free text (in which case `ValueError` is not a contract).
- **OQ-7 — REQ-TOOLS-049 implies configurable rule lists that no key defines.** "Rule lists replace
  rather than deep-merge across layers" reads as though a user may author permission rules, but no
  configuration key anywhere in domains 05, 10 or 15 defines one, and the presets of REQ-TOOLS-042 to
  REQ-TOOLS-045 are fixed. Either user rule authoring is in scope and needs a key and a settings
  surface, or the sentence covers only the host lists and should say so.
- **OQ-8 — Proxy behaviour for `fetch` is unstated.** Nothing says whether `fetch` honours system or
  environment proxy settings. It matters: a proxy changes which host a connection is actually opened
  to, and REQ-SANDBOX-022 promises a denied host observes zero connection attempts.
- **OQ-9 — Signals on Windows.** REQ-TOOLS-096 and REQ-TOOLS-110 fix a signal vocabulary
  (`SIGTERM`/`SIGINT`/`SIGKILL`/`SIGHUP`) and REQ-TOOLS-109 fixes SIGTERM → 5 s grace → SIGKILL for
  background termination. Windows has no signals; a `send_signal` call there has no faithful mapping,
  and the specification neither maps them nor refuses them.
- **OQ-10 — Stderr in foreground capture.** REQ-TOOLS-098 requires the soft-pause detail to tell the
  agent the process "may be writing to stderr" and to suggest re-running with `2>&1`, which only makes
  sense if stderr is *not* captured; a PTY-backed persistent shell (required by C-91) necessarily
  merges it. The advisory text is required content either way, but the underlying capture semantics
  should be stated.

---

## 4. ADR proposals

Numbers are slice-local (`ADR-EXEC-NN`); the synthesis step assigns final numbers.

---

### ADR-EXEC-01 — Tool execution runs in one long-lived runtime process, not in the Electron main process

**Decision to be made.** Which process hosts the permission gate, the tool executors, the terminal
sessions, the confinement wrapper and the egress client — and how many such processes exist.

**Constraints that bear on it.** C-01 (one shipped executable), C-02 (one process hosts several
runs, no cross-run leakage), C-03 (nothing survives application exit), C-05 (availability verdict
must be stable for application lifetime), C-06 and C-07 (100 ms budgets; the 5.0 s trial must not sit
on them), C-72 (long-lived shells), C-73 (per-session foreground serialization, cross-session
concurrency), C-91 (real PTYs), C-144 and C-147 (plugin code runs in the host process with its
privileges), C-150 (no state crosses a session or run).

**Alternatives.**

1. *Everything in the Electron main process.* Native modules load there; there is no IPC hop between
   the gate and the approval dialog; the availability cache trivially has application lifetime (C-05);
   teardown on quit is one code path. Against: the main process owns window management and services
   every renderer IPC message, and this slice puts genuinely heavy, genuinely blocking work on it —
   SHA-256 over files for `haet_read` (REQ-TOOLS-189), real-path resolution on every path-scoped
   decision (C-24), JSONL compaction (C-63), tokenizing every command line, and PTY read pumps for
   every live session at up to 50 samples/second each (C-88). Missing REQ-SHELL-150's 100 ms gesture
   budget under load is a build failure, not a degradation. Worse, a crash in a native module or in
   plugin code (C-144, which is by definition unconfined third-party code) takes the windows with it.
2. *One runtime process per run.* Maximal isolation; a run that wedges cannot affect another; kill is
   trivially scoped. Against: the specification repeatedly *assumes* the opposite — "two runs in one
   process never lend each other an allow-list" (REQ-TOOLS-089), "when one process hosts two live
   runs, one confined and one not" (REQ-SANDBOX-096), "two concurrent runs in one process each apply
   their own lists" (REQ-SANDBOX-038). Those requirements remain satisfiable under per-run processes
   (vacuously), but the availability cache of C-05 would then be per-run, and REQ-SANDBOX-067's
   "at most once per process, cached" would either re-probe per run (a 5 s cost per launch, and a
   verdict that can differ between two live runs, which C-05 forbids) or need a separate owner
   anyway. Per-run processes also multiply the cost of the shared machinery — the redaction pass, the
   tokenizer, the policy tables — for no requirement that asks for it.
3. *One dedicated runtime process, forked from the shipped binary, hosting all runs.* Chosen.

**Recommendation.** Alternative 3: one long-lived runtime process, created at application start and
living exactly as long as the application, forked via `electron.utilityProcess.fork` (checked against
the current Electron `utility-process` API documentation: forks a Node-enabled child using Chromium's
Services API, with `MessagePortMain` transport, `stdio` control and native-addon support). Main keeps
windows, dialogs, settings persistence and the approval presenter; the renderer draws. Runs are
objects inside the runtime, and every run-scoped value — policy, sandbox specification, egress
configuration, artifact store — is carried in an explicit `RunContext` threaded through dispatch
rather than read from module state (C-02, C-150). A call with no `RunContext` takes the
`unrestricted` default of C-04; a call with an ambiguous one is refused.

Reasoning: it satisfies C-01 because `utilityProcess.fork` re-enters the shipped Electron binary with
a bundled script path — no second executable is installed or published, and it is *not* the reserved
`builtin:code-intelligence` argv token, which stays reserved for REQ-MCP-033. It satisfies C-07 by
construction, because nothing this slice does sits on main's message loop. It gives crash isolation
for C-144's unconfined plugin code. And because the runtime's lifetime equals the application's,
C-05's "within one process the verdict never changes … cleared only by the explicit re-check or by
restarting the application" is directly implementable there.

**Consequences accepted.**

- The approval flow crosses a process boundary (ADR-EXEC-05 handles the failure modes).
- Terminal frames cross a process boundary. Given C-91's 100 ms echo budget, a `MessagePortMain`
  should be transferred to the renderer for terminal traffic rather than relaying every frame through
  main.
- Native modules (the PTY binding, and the SQLite driver if the runtime touches it) must be rebuilt
  against Electron's ABI (`@electron/rebuild`) and shipped unpacked from the asar. This is a
  build-pipeline obligation the packaging slice inherits.
- Killing the runtime does **not** by itself satisfy C-03: descendants outlive their parent on both
  platforms. The runtime must own an explicit kill group — a POSIX process group per background
  session (already mandated by REQ-TOOLS-107) and, on Windows, a Job Object with
  `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` covering the subtree — so that "whatever ends it" includes a
  crash and not only a quit. Without the Job Object, C-03 is unmet on Windows and should be recorded
  as unmet rather than assumed.
- Diagnostics (REQ-STARTUP-134) must be able to count and name the runtime's execution contexts.

**Revisit if.** The product gains a second window class needing synchronous access to execution state;
or a plugin host arrives that must be a separate process anyway (ADR-EXEC-12), in which case the "one
runtime" premise should be re-opened rather than a second process added silently; or Electron's
utility-process API stops supporting native addons.

---

### ADR-EXEC-02 — The tool registry is a declarative capability table with a direction-aware, fail-closed accessor

**Decision to be made.** How the eighteen public tool names, their capability declarations and the two
tool classes are represented, and how a rule anywhere in the product asks what a tool does.

**Constraints.** C-09 (closed name set, alias `haet`), C-10 (three independent facets, a property of
the tool not of its arguments, stated in exactly one place), C-11 (undeclared tools read fail-closed
*in the direction of the reading rule*), C-12 (two classes stated against the declaration and held
consistent by construction; membership is not itself a facet), C-13 (four-stage removal-only
pipeline), C-14 (prompt listing and callable set from one resolution), C-15/C-16 (degradation with
stable reason codes).

**Alternatives.**

1. *Facets as properties on each tool implementation object* — each executor declares its own facets
   beside its handler. Natural for an author and keeps the declaration next to the code. Against:
   C-10 requires the registry to be "the product's single definition", and C-11 requires that a tool
   *outside* the registry has no declaration at all. If facets live on implementations, a plugin or
   MCP tool can assert facets it must not have and nothing structural stops it. It also turns C-12's
   class-consistency invariant into a runtime assertion rather than a compile-time fact.
2. *A single frozen table keyed by name, with the classes declared beside it and a typed accessor
   whose signature demands the reading direction.* Chosen.
3. *Facets inferred from a tool's JSON schema* — a tool with a `path` argument reads files, a tool
   with a `command` argument runs commands. Superficially attractive because it would extend to
   plugin and MCP tools and would remove the awkwardness of undeclared tools. Ruled out flatly by
   C-10 and C-11: `terminal` declares running commands whatever it is given, `git_commit` declares
   reading *and* writing despite leaving the working tree alone, and no facet may be inferred from a
   name, a description, or anything a tool says about itself. Recorded because it is the design a
   reader will reach for when the undeclared-tool rule starts to hurt.

**Recommendation.** Alternative 2. One module owns a frozen record from tool name to
`{ readsWorkspaceFiles, writesWorkspaceFiles, runsCommands }`, with the alias table beside it. The
read-only class and the network class are literal sets in the same module, guarded by a
test-enforced invariant that no read-only member declares writing or running and that the network
class is a subset of the read-only class (C-12). The accessor is not `getFacets(name)` but a pair —
`grantsOn(name, facet)` and `withholdsOn(name, facet)` — so C-11's direction-sensitivity lives in the
type system rather than in a reviewer's memory: an unknown name answers `false` to the first and
`true` to the second, always.

Narrowing (C-13) is a fold over an explicitly ordered array of four stage functions, each of type
`Set<ToolName> -> Set<ToolName>` and each asserted (in tests) to return a subset of its input.
`coordinator_only` is expressed as removal of the closed five-name list REQ-TOOLS-006 states, so
adding a read tool later needs no edit here. The resolution runs once per agent construction and its
single result feeds both the prompt renderer and the callable set (C-14) — one value, two readers,
which is the only shape that cannot drift.

**Consequences accepted.**

- Adding a public tool name is a code change in one file plus a declaration and cannot be done by
  configuration. That is the point: C-09 makes the set closed.
- Plugin and MCP tools get nothing from the registry, so any rule that widens on a facet never widens
  for them. Plugin authors will find this restrictive; C-11 requires it.
- The `tools:` validator needs the workspace's configured MCP server list, because an entry naming a
  configured server must fail with an extra sentence pointing at `mcp_servers` (C-09, C-148). That is
  a real coupling and belongs in the module boundary rather than being discovered later.

**Revisit if.** A requirement adds a fourth facet — REQ-TOOLS-001 anticipates growth in *names*, not
in facets; or plugin tools gain a declared and validated capability contract, which is a
product-owner decision rather than an architectural one.

---

### ADR-EXEC-03 — The policy is an immutable ordered value with matchers compiled at build time

**Decision to be made.** How a permission policy is represented, evaluated, validated and replaced
while a run is live.

**Constraints.** C-18 (three-value vocabulary, never raises), C-19 (unconditional fail-closed with a
fixed rule id and a host-interactivity-dependent outcome), C-20 (twelve decision sources), C-23 (five
facets, compact-JSON argument comparison), C-24 (path scope over seven keys, real-path resolution,
unresolvable counts as outside), C-25 (ordered, first match wins, four validity conditions, never
decides a call when invalid), C-26 (session approvals before policy rules, most recent first,
surviving replacement), C-31 (replacement governs the very next call, no rebuild), C-38 (command
patterns validated eagerly at build, host patterns lazily at classification), C-42/C-43 (fixed preset
set and fixed family composition order), C-32 (in-memory shape free).

**Alternatives.**

1. *Policy as a compiled decision function per preset* — three hand-written closures: fast, type-safe,
   no interpretation. Against: C-25's validity conditions are conditions on a *list of rules with
   ids* ("two rules carry the same id", "any rule id is empty"), which a closure has no
   representation of. C-26's session approvals must be matched ahead of the closure with ids numbered
   in grant order. And the audit's `rule_id`, the refusal text's `<rule_id>`, and the settings
   surface all need the rule table to be inspectable data. A closure would carry a parallel table
   anyway, at which point the table is the real representation.
2. *Policy as data, matchers interpreted per call* — a plain array of rule records, patterns tokenized
   and globbed on every evaluation. Simple, obviously correct, no build step. Against: C-38 requires a
   non-tokenizable or empty pattern to be a **policy-build-time** error with a specific message;
   interpreting per call defers that to the first matching request, which REQ-TOOLS-034 explicitly
   rejects ("so typos fail loudly rather than silently matching nothing"). It also re-tokenizes the
   same ~40 starter patterns on every dispatch, on a path that gates every tool call.
3. *An immutable value whose matchers are compiled once when the policy is built.* Chosen.

**Recommendation.** Alternative 3. `Policy` is a frozen `{ presetName, defaultDecision, rules }` where
each rule holds its id, description, outcome and up to five pre-compiled facet matchers. Building a
policy is a pure function of (preset name, egress configuration, workspace root): it composes the four
rule families in REQ-TOOLS-041's fixed order, tokenizes every command pattern eagerly and throws
REQ-TOOLS-034's error on failure, and runs C-25's four validity checks. Building is the only step that
can fail; evaluation cannot.

Evaluation is a pure function `(Policy, SessionApprovals, PermissionRequest) -> Decision`, wrapped by
a single `try` implementing C-19 and nothing else. Session approvals are a separate per-session list
scanned most-recent-first *before* the policy (C-26), which is precisely what lets them survive policy
replacement with no migration step — they were never part of the policy.

Argument comparison uses one canonical-JSON encoder (keys sorted ascending by code point, shortest
round-tripping numbers, no insignificant whitespace) per C-23; strings compare as themselves.
Path-scope evaluation (C-24) is the one impure step because it must resolve real paths through
symlinks and junctions; it takes an injected resolver so the "unresolvable counts as outside" branch
is directly testable, and a resolver failure produces a *non-match*, never an exception that would
divert the call into C-19's fail-closed path by accident.

Replacement (C-31) is an atomic pointer swap on a per-run `PolicyContext`. Because `Policy` is frozen
and evaluation is pure, an in-flight decision reading the old value and the next decision reading the
new one is exactly the specified behaviour, with no lock and no agent rebuild.

**Consequences accepted.**

- The fixed rule ids of REQ-TOOLS-039, REQ-TOOLS-042 to REQ-TOOLS-045, REQ-TOOLS-085 and the Data &
  Formats identifier list become string constants under a snapshot test. A typo in any of them is a
  conformance failure, so they belong in one table rather than at construction sites.
- Host-pattern validation stays lazy (C-38), so a policy can build successfully and a fetch can still
  fail with `egress_policy_error`. That asymmetry is specified and must be preserved, not tidied away.
- The gate must know host interactivity before the approval flow, to satisfy C-19's ask-versus-deny
  split. The evaluation environment therefore carries an attendedness flag derived from the *same*
  presenter-registration fact as C-46 — one source of truth, read twice.

**Revisit if.** OQ-7 resolves toward user-authored rules, which adds a configuration-to-policy
compilation step and per-rule settings validation; or a requirement makes evaluation depend on mutable
state (a rate limit, a per-run counter), at which point "evaluation is pure" stops being free.

---

### ADR-EXEC-04 — A purpose-built shell tokenizer and segmenter, not a general shell parser and not regular expressions

**Decision to be made.** What implements C-33 to C-37 — tokenization, compound-line decomposition,
glob token matching and the unconfident predicate.

**Constraints.** C-33 (token-by-token glob matching, trailing `*` matching zero or more), C-34 (first
token folds case, later tokens do not, identically everywhere), C-35 (seven operators, longest first,
quote- and escape-aware, introducing operator retained with the segment), C-36 (closed unconfident
predicate, including redirection stripping and two closed head lists), C-37 (never raises; exactly one
unconfident segment on total failure), C-38 (pattern errors at build time), C-40 (the network
catalogue runs on the same machinery), C-41 (one POSIX-shaped tokenizer everywhere, PowerShell
included).

**Alternatives.**

1. *An off-the-shelf shell parser or lexer.* Gets quoting and escaping right without new code and is
   the obvious reuse. Against: C-37 requires the decomposer to *never raise* and to yield exactly one
   unconfident segment on unparseable input; general parsers raise, and wrapping one in a `catch` that
   fabricates a segment reproduces most of the work anyway. C-35 requires the introducing operator to
   be retained per segment — a detail no general lexer exposes, yet the pipe-to-shell matcher needs to
   know a segment followed `|` specifically. C-36's redirection rule ("anything beginning with `>` or
   `<`") and its detection of `$( )` and backticks *including inside double quotes* are product rules,
   not shell rules. A library would end up driven and post-processed to the point where it contributes
   only its quote state machine.
2. *Regular expressions over the raw command line.* Rejected outright by C-33 — matching is defined
   token-by-token and never against raw text, and REQ-TOOLS-033 states the failing consequences
   (`git status` must not fire on `git status-check`). Recorded because it is the cheap path someone
   will propose when the scanner needs a small change.
3. *A small purpose-built scanner producing (introducing operator, tokens, unconfident reason) tuples
   per segment.* Chosen.

**Recommendation.** Alternative 3: one scanner that walks the line once tracking single-quote,
double-quote and backslash state; emits operator boundaries longest-first; collects tokens per
segment; stops the matched token stream at the first redirection token; and records a reason when a
segment is unconfident. It exposes exactly two entry points — `decompose(line)` for command lines,
never throwing, and `tokenizePattern(text)` for rule patterns, throwing REQ-TOOLS-034's error. Glob
matching per token is a small `*`/`?` matcher rather than a translation to a regular expression, so a
`*` in a pattern token cannot acquire regex semantics; the first token compares case-folded and every
later token does not (C-34).

Reasoning: the required behaviour is a *closed* specification, not "POSIX shell semantics". Every edge
the spec cares about is enumerated in C-35 and C-36, and every edge it does not care about is not
required to be right. Owning the scanner makes C-37's never-raises property structural, makes the
unconfident reason available for diagnostics, and makes the whole thing table-testable against the
worked consequences the requirements already state.

**Consequences accepted.**

- We own a security-relevant parser. It must be fuzzed against the invariant that `decompose` never
  throws and always returns at least one segment, and property-tested in the fail-closed direction:
  any input the scanner is unsure about classifies unconfident, never confident-and-empty.
- C-41 stands: on Windows this POSIX-shaped scanner reads PowerShell lines, so backtick escapes and
  `$( )` subexpressions classify as command substitution and therefore *ask* under `restricted` and
  `ask`. That over-triggers rather than under-triggers and matches the domain's posture, but it is a
  real friction for Windows users and belongs in the tool description rather than being discovered.
- One scanner serves the network catalogue (C-40), the starter rules (C-39) and any future matcher, so
  a change to tokenization changes all of them at once. That is desirable and must be stated: the
  scanner has one behaviour, versioned by its tests.

**Revisit if.** A requirement asks for platform-native tokenization (a PowerShell-shaped scanner on
Windows), which REQ-TOOLS-033's "identically on every platform and every backend" currently forbids;
or the unconfident predicate stops being closed.

---

### ADR-EXEC-05 — The approval wait registry lives with the gate; the presenter is a revocable remote capability

**Decision to be made.** Where pending approvals are held, how an `ask` reaches a person, and what
happens when the presenter is absent, slow, broken, or on the far side of a process boundary that has
just gone away.

**Constraints.** C-51 (one call suspended, session keeps running), C-52 (three options, three terminal
states, fixed mappings), C-53 (the enumerated registry semantics, including "waiting on an unknown id
resolves cancelled immediately" and bulk cancel), C-54 (one shared budget, `0` = indefinite), C-55
(nine-field JSON-serializable payload mirrored into session state), C-56 (`approval.requested`
published for headless asks too, with `resolver` and null `timeout_seconds`), C-57 (answers only from
the host UI), C-58 (presenter-error and fail-closed paths), C-59 (headless policy: never a silent
allow, never a hang), C-60 (single dialog per window, ordered queue, 100 ms hand-off, revocation,
undeliverable-answer state), C-61 (strict both-sided pairing), C-46 (attended ⇔ a presenter is
registered), C-19 (fail-closed ask-vs-deny depends on attendedness), C-151 (teardown cancels every
waiter).

**Alternatives.**

1. *Registry in the Electron main process, gate calls out and awaits.* The dialog, the queue and the
   pending map all sit next to the window; C-60's "one dialog per window, oldest first" is local
   bookkeeping. Against: C-19 and C-59 require that an `ask` raised when the presenter is unreachable
   resolves *without a prompt and without a hang*. If the registry is in main and the channel to main
   is what has failed, the runtime has no registry to fall back to and must invent a timeout-based
   guess. The gate would also have to make a cross-process call on the decision path even to discover
   that there is nothing to call, which puts C-19's fail-closed branch behind an IPC round trip.
2. *Registry in the runtime; the presenter is a capability registered by main over the channel.*
   Chosen.
3. *No registry — the gate blocks on a promise per call with no central map.* Rejected against C-53:
   duplicate-id rejection, resolve/cancel of unknown ids, bulk cancel, and C-55's "pending approvals
   are visible in session state as a mapping from request id to payload" all require a first-class,
   enumerable map. Recorded because a promise-per-call is the natural first sketch.

**Recommendation.** Alternative 2. The runtime owns a `PendingApprovals` map per session, keyed by
request id, implementing C-53's semantics exactly, including the deliberately odd ones (waiting on an
unknown id resolves *cancelled*, not rejected). "Attended" is one boolean per session in the runtime:
true exactly while main holds a live presenter registration for that session (C-46). Registration is
explicit and revocable, and it is revoked automatically when the channel to main closes — so a lost
channel makes every session unattended, which routes every ask to the headless policy of C-59 and
makes C-19 resolve `deny` rather than `ask`. That is the correct fail-closed direction and it is
reached without a timeout.

Flow: the gate resolves `ask` → publishes `approval.requested` with `resolver: "brokered"` and the
configured `timeout_seconds` (C-56) → inserts the payload into `PendingApprovals` and mirrors it into
session state (C-55) → posts a present-request to main → awaits a settled outcome. Main owns the
per-window dialog queue (C-60) and nothing else: it never decides, it only presents and returns one
of the three answers. If presenting raises, main returns a `presenter-error` outcome and the runtime
discards the pending entry and denies (C-58). If the answer cannot be delivered — the runtime settled
the wait first, by timeout or cancellation — main is told, and the dialog enters C-60's
buttons-disabled status-line state rather than closing on an answer nobody received.

For a session with no presenter the gate never posts anything: it publishes `approval.requested` with
`resolver: "headless"`, `timeout_seconds: null` and `unattended_reason: "headless-policy"` (C-56),
applies `runtime.headless_approval_policy`, and returns. No wait is created at all, which is what
"meaning no wait occurs" in REQ-TOOLS-061 requires.

The timeout is implemented as an explicit deadline on the wait rather than a per-wait timer, with `0`
meaning *no deadline registered* (C-54) — the wait is then released only by an answer or by a
cancellation. Bulk cancel (C-53, C-151) walks the map for a session or for everything and settles each
waiter `cancelled`, which the mapping of C-52 turns into `deny` with source `cancelled`.

Pairing (C-61) is enforced at the point the decision record is built: the request id is attached only
when the source is one of the seven approval-resolution sources *and* the session id and tool name
match the pending payload; otherwise the field is empty. That check reads the payload, so it must
happen before the entry is removed from the map.

**Consequences accepted.**

- The runtime, not main, decides that a session is unattended, so main must register and revoke
  presenters explicitly and promptly — in particular on window close and on session focus change
  (REQ-SHELL-110, REQ-SHELL-111) — or a torn-down presenter will be treated as live until the channel
  notices.
- A run that starts while main is wedged (not crashed) will still see a live registration and will
  post present-requests that never resolve. C-54's timeout is the only backstop, and with
  `approval_timeout_seconds: 0` there is none. This is a genuine liveness hole created by the
  specification's "0 means wait forever" (C-54) combined with C-60's undeliverable-answer state; it
  should be mitigated by a channel-level liveness signal rather than by shortening the user's
  configured wait.
- C-60's queue is per *window*, but the wait registry is per *session*, and a window can change which
  session it is focused on. The mapping between the two is main's, and the ordering guarantee
  ("oldest first by `approval.requested` publication order") must therefore be carried in the payload
  as a monotonic sequence number rather than inferred from arrival order at main.
- Session state mirroring (C-55) means a pending approval is written to persisted session state and
  removed on settlement, so a crash can leave a stale pending entry. Resume must treat any pending
  entry read from disk as cancelled, since C-57 forbids anything but the host UI from answering it and
  the waiting agent no longer exists.

**Revisit if.** The product gains a second presenter kind (a system notification that can be answered,
a remote approver), at which case "registered presenter" stops being a boolean and C-46's definition
of attended needs re-reading; or `approval_timeout_seconds: 0` is reconsidered.

---

### ADR-EXEC-06 — PTY-backed persistent foreground sessions; pipe-backed background sessions; one shipped backend

**Decision to be made.** How the `terminal` tool executes commands: what a "terminal session" is, how
foreground and background differ mechanically, and which of the two specified backend names ships.

**Constraints.** C-69 (fixed action schema and key vocabulary), C-70 (two bounds; hard timeout kills
the whole process tree and restarts the session; soft pause only without an explicit `timeout`), C-71
(100,000-character oldest-first cap), C-72 (shell state persists and is observably lost on hard
timeout), C-73 (one foreground command per session, waiting; cross-session concurrency; background
never occupies a session), C-74 (`backend` and `kill_status` vocabularies; pooled-recovery behaviour;
observational parity), C-75 (PowerShell on Windows; availability from presence alone), C-76 (loads
regardless of the host's own stdio and encoding), C-77 (background = own subprocess, merged pipes, own
process group), C-79 (exit-code contract), C-84 (never a partial observation), C-91 (a real PTY, with
the process's own reported size equal to the grid's), C-107 (only new command strings are wrapped),
C-112 (the confined command enters the shell as text), C-03 (nothing survives application exit).

**Alternatives.**

1. *Fresh child process per foreground call, pipes only.* Simple, exact exit codes, clean stdout/stderr
   separation, trivially correct truncation. Fatal against C-72 — working directory and exported
   variables must persist across calls and must be *observably lost* on a hard timeout — and against
   C-91, which requires a real pseudo-terminal whose reported size follows the grid.
2. *One PTY per call.* Keeps the PTY requirement and gives a clean exit status per child. Still fails
   C-72's persistence, and re-pays PTY setup on every call.
3. *One long-lived PTY-hosted interactive shell per terminal session, with an out-of-band completion
   protocol; background commands spawned separately with merged pipes.* Chosen.

**Recommendation.** Alternative 3.

*Foreground.* Each terminal session owns one pseudo-terminal running the platform's interactive shell
— `/bin/sh` or the user's login shell on POSIX, `pwsh` else `powershell` on Windows (C-75). A command
is submitted as a line; completion and exit status are recovered by an out-of-band marker protocol
(write the command, then a delimiter-emitting echo of the shell's exit-status variable, and scan the
byte stream for a nonce that cannot appear in ordinary output). This is the price of C-72: a
persistent shell has no per-command wait, so the exit status of C-79 must be manufactured from the
stream. The nonce must be per-session and per-call, and the protocol must survive a command that
itself prints something resembling the delimiter — which argues for a random nonce rather than a fixed
sentinel.

The session is a small state machine — idle, running, resetting — with a queue of one, so a second
foreground call waits (C-73). The hard timeout kills the process tree (POSIX: signal the foreground
process group of the PTY; Windows: the Job Object of ADR-EXEC-01) and then *restarts the session*,
which is exactly the observable C-70 and C-72 require and is where `kill_status: session_reset` /
`reset_failed` come from.

*Background.* A background call is a plain subprocess, shell-interpreted, stdout and stderr merged into
one pipe, stdin piped, its own process group on POSIX and inside the Job Object on Windows (C-77). It
never touches a terminal session, so C-73's concurrency statement holds by construction. Termination
is SIGTERM → grace-until-exit, capped at 5 s → SIGKILL (C-77); on Windows, where signals do not exist,
this maps onto graceful-close-then-terminate and OQ-9 records that the specification supplies no
mapping.

*Library.* `node-pty` for the PTY. Checked against its current documentation: Linux/macOS/Windows
support, Windows via the ConPTY API requiring Windows 10 1809 or later, winpty support removed;
`spawn(file, args, { cols, rows, cwd, env })`, `onData`, `onExit`, `resize(cols, rows)` and
`kill(signal?)` where the signal argument is ignored on Windows. `resize` is what satisfies C-91's
"the size the process itself reports equals the columns and rows the grid last reported". The
"signal ignored on Windows" note is a direct input to OQ-9.

*Backend name.* Ship `single-session` and stamp it on every observation. `tmux-pool` is a specified
vocabulary value with specified recovery behaviour and specified `kill_status` values
(`pane_replaced`, `replace_failed`) that only a pane-based pool can produce, and the specification
never says when it is selected — OQ-1.

> **ESCALATE — does `tmux-pool` ship?** Building a second, tmux-dependent backend costs a real
> engineering effort, is POSIX-only (so it cannot exist on the Windows/PowerShell backend of C-75),
> adds an external dependency the product does not otherwise have, and must be held observationally
> identical to `single-session` under C-74. Building only `single-session` leaves REQ-TOOLS-103's
> pooled-recovery behaviour and two of REQ-TOOLS-099's four `kill_status` values unreachable, which a
> conformance suite reading the specification literally would score as a gap. The options are: (a)
> ship one backend and withdraw `tmux-pool`, `pane_replaced` and `replace_failed`, keeping the field
> for forward compatibility; (b) ship both, accepting the cost and the platform asymmetry; (c) keep
> both names but define the pooled one as a future backend, which leaves a specified behaviour with no
> implementation. This changes what the product *is* only in the sense of what a conformance claim can
> say, so it is the product owner's call, not this slice's.

**Consequences accepted.**

- The exit status of a foreground command is derived from a marker protocol rather than from
  `waitpid`. It is therefore possible for a pathological command to forge one. The nonce must be
  unguessable per call, and the protocol must be tested against a command that echoes attacker-chosen
  text.
- Under a PTY, stdout and stderr are merged and the shell echoes the submitted line. The capture
  handed to the agent must strip the echoed command and the marker frames; C-81's output-derived
  warning checks then run over the cleaned text, or they will match the command line itself
  (`FAILED ` in a command, for instance). OQ-10 records the stderr advisory that sits awkwardly with
  a merged PTY.
- `background=true` gives pipes, not a PTY, so a background session's terminal-window tab has no real
  terminal to resize; C-89 and REQ-SHELL-106 already anticipate this ("a resize always resizes the
  emulated screen — even when the backend is gone — and then the real terminal when possible").
- C-107 and C-112 mean the confinement wrapper is a *string typed into the live shell*, not an argv
  array. Nothing about the PTY design may weaken that; see ADR-EXEC-08.
- `node-pty` is a native module, so ADR-EXEC-01's rebuild-and-unpack obligation is load-bearing, and
  the ConPTY floor of Windows 10 1809 becomes a platform requirement the distribution slice must
  state.

**Revisit if.** The escalation above is decided; or a requirement arrives that needs a true per-command
exit status (which would push toward alternative 2 and force C-72 to be re-read); or `node-pty` stops
being maintained, in which case the PTY port defined here is the seam to replace.

---

### ADR-EXEC-07 — The runtime owns the authoritative emulated screen; frames carry VT bytes with an explicit final-text frame

**Decision to be made.** Where the terminal emulator lives, what a stream frame carries, and how the
transcript preview and the terminal window are kept identical.

**Constraints.** C-85 (stream naming), C-86 (frame types; the closing `screen` frame's text equals the
observation's final output), C-87 (streaming changes nothing the agent sees; no output dropped or
reordered when repaints cannot keep up), C-88 (sampling period, replay buffer, `0` disabling replay),
C-89 (control channel: send-keys, resize, interrupt, kill), C-90 (a real character grid with
alternate-screen and per-cell attributes), C-91 (real PTY; 100 ms echo; ordering and fidelity; resize
propagated to the process), C-92 (preview and window identical at the same time; no line shown twice
on attach), C-93 (retained screen state is queryable, and its absence means "show the empty state" not
"fabricate a terminal"), C-95 (off-screen surfaces do zero work yet are current on show), C-71 (the
observation's own 100,000-character cap), and OQ-2.

**Alternatives.**

1. *Emulator in each view (xterm.js per surface); the runtime ships raw PTY bytes.* Least work in the
   runtime, and xterm.js is the mature renderer. Against C-92 and C-93: two independent emulators are
   only identical if both consumed the same bytes from the same origin, so a late attach must replay,
   and the replay buffer is a *byte* buffer capped at 256 KiB (C-88) which may not contain the origin.
   Worse, C-93 asks whether "retained screen state still exists" — a question the runtime must answer
   before any view is built, and a view-side emulator cannot answer it. With `terminal_stream_buffer_kb: 0`
   replay is disabled entirely and this alternative can show nothing on attach, while C-92 still
   demands the preview and the window agree.
2. *Emulator in the runtime, frames carry rendered cells; views are dumb painters.* C-92 and C-93 fall
   out trivially — one screen, several views. Against: C-86 describes frames in terms of *text*, and a
   full cell array at 100 ms per live stream is a large, chatty payload for something the shell slice
   would rather hand to xterm.js. It also forces the runtime to own attribute and colour semantics
   that REQ-SHELL-098 maps onto theme tokens in the renderer.
3. *Emulator in the runtime as the authority for retention and identity; frames carry VT bytes;
   views run a display emulator fed those bytes.* Chosen.

**Recommendation.** Alternative 3. The runtime holds a headless emulator per stream — an xterm.js
headless instance with a serialization addon is the obvious fit, and the emulator is the *port*, not
the choice — which consumes PTY output at the C-88 sampling period and maintains: the current screen,
the retained scrollback, the running flag, the exit code, and a `truncated` flag set once retained
frames were dropped (C-89). That object answers C-93's "does retained screen state exist" and is
explicitly *not persisted*, which is why a session read back from storage produces no tabs.

Frames carry VT byte payloads. A `delta` frame is the bytes appended since the previous frame. A
`screen` frame is a serialization of the current screen, emitted on attach and on resync, so a late
attacher receives one `screen` followed by `delta`s and can never show a line twice (C-92) regardless
of the replay-buffer size — which is what makes `terminal_stream_buffer_kb: 0` survivable. Both views
run a display emulator fed the same frame sequence from the same subscription point, so C-92's
"identical cells at the same time" holds by construction rather than by luck.

Because the runtime and the views run the same emulator implementation over the same bytes, the
identity in C-92 is an equality of *inputs*, which is testable: a golden byte stream must produce the
same serialized screen in the runtime and in a view.

**On OQ-2.** C-86's closing frame is required to carry "text equal to the observation's final output
text", which is plain, 100,000-character-capped, oldest-first-truncated text (C-71) — not VT. The
proposal is to emit the closing frame as a `screen` frame whose payload is that plain text, carrying
an explicit marker that it is a literal replacement rather than a VT serialization, so a display can
reset its screen and write it verbatim. This satisfies the letter of C-86 while keeping every earlier
frame VT-faithful, and it is harmless because the process has ended by then (REQ-SHELL-091: output
stays readable and copyable). **This is a reading, not a fact**, and OQ-2 should be resolved before it
is relied on: the alternative reading is that the specification intends plain text throughout, which
would contradict C-90 and C-91.

**Consequences accepted.**

- The runtime pays for one emulator per live stream. C-95's "off-screen surfaces do zero work" applies
  to *surfaces*, not to the runtime's retention — the emulator keeps consuming while nobody watches,
  because C-87 requires the observation to be identical whether or not anyone is attached.
- The C-88 sampling period (default 100 ms, floor 20 ms) governs frame emission, but C-91's 100 ms
  echo budget is measured key-press to painted frame and includes two process hops. At the 100 ms
  default the budget is not met for echo; the sampling period must be treated as a *ceiling on
  batching* with an immediate flush after a keystroke, or the interval lowered for armed streams. This
  is a genuine tension between REQ-TOOLS-126's default and REQ-SHELL-166's budget and should be
  recorded as such.
- Control traffic (send-keys, resize, interrupt, kill) travels the opposite direction on the same
  channel and must be ordered with respect to nothing — C-91 requires only that keystrokes reach the
  *process* in order, which the runtime guarantees by writing them to the PTY in receipt order.
- Retained screen state is not persisted, so C-93's "a session read back from storage produces no
  terminal tabs" is satisfied by doing nothing, which is the correct amount of work.

**Revisit if.** OQ-2 resolves the other way; or a requirement asks for terminal scrollback to survive a
restart, which would make the emulator's state persistent and change everything above; or the shell
slice chooses a renderer whose emulator cannot be run headless, in which case alternative 2 becomes
the fallback.

---

### ADR-EXEC-08 — Confinement is a two-implementation port behind a rendering-and-quoting core, with the availability verdict owned at application lifetime

**Decision to be made.** How OS-level confinement is structured across three platforms, where the
availability verdict is computed and cached, how the rendered invocation is built safely, and what
happens on the platform that has no mechanism at all.

**Constraints.** C-97/C-98 (three modes, two sources, no third route), C-99/C-100 (closed platform
set; mechanism chosen before PATH; native Windows unavailable with fixed remediation), C-101 (probe
order, no subprocess after a failed step), C-102/C-103 (demonstrated not inferred; literal trial
invocations; no emulated backend; conformance by observable effect on a real host), C-104 (no silent
fallback, structurally), C-105 (a session that cannot get its confinement does not start, and the
refusal is the run stream's first and only entry), C-106 (a wrap failure refuses one command, exit
126, session continues), C-107 (only new command strings wrapped; both-flags case wrapped;
idempotent), C-108/C-109/C-110 (writable-root computation, the `.git`/`.rotaris` exclusion attached to
the name, the three Linux carve-out cases, nothing left on the host), C-112 (single shell argument;
quoting is a security boundary), C-113 (working directory untouched), C-114 (the agent sees its own
command), C-115 (four-condition relabelling over both streams), C-116 (in-sandbox denials passed
through uninterpreted), C-117/C-118 (status pair; resolved afresh per call, worktree-aware), C-05/C-06
(verdict cached at application lifetime; probe off the interface thread), C-119 (verification checks
go through the same enforcement point; hooks deliberately outside it).

**Alternatives.**

1. *A container or VM per run* (Docker, a microVM). Stronger and more uniform isolation, and it would
   give Windows a story. Ruled out by REQ-TOOLS-115 — "Sandboxing is per-command wrapping of the
   command string; no containers are involved" — and by C-113, since a container changes the process's
   view of the filesystem root and the working directory in ways C-113 and REQ-SANDBOX-127's
   working-directory effect forbid. Also incompatible with C-112's requirement that the wrapper be a
   string entering an existing persistent shell.
2. *One abstract "sandbox" interface with a rich API that each platform implements independently.*
   The obvious object-oriented shape. Against: C-109's parity requirement, C-110's carve-out cases and
   C-112's quoting rule are the parts most likely to diverge, and they are exactly the parts that are
   *shared logic* (which roots are writable, which names are protected, whether each protected name
   exists) rather than platform mechanism. Two independent implementations of the shared part is how
   C-109's parity gets broken.
3. *A shared core computing the confinement specification, and a thin per-platform renderer that only
   turns that specification into a command string.* Chosen.

**Recommendation.** Alternative 3, with four distinct pieces:

- **Specification computation (shared).** From the run's mode, the session's actual execution
  directory (worktree-aware, C-118), `runtime.sandbox_writable_roots` and
  `runtime.sandbox_allow_network`, compute an ordered, de-duplicated effective writable-root list
  (C-108), the two protected names per writable root with each name's existence classified into
  C-110's three cases, and the network flag. This is a pure function, tested once, identical on both
  platforms — which is how C-109's parity is obtained rather than hoped for. Missing roots are skipped
  with a log entry, never an error.
- **Rendering (per platform, thin).** Seatbelt: emit an SBPL profile with allowances first and the
  carve-out denials after them (C-110), then
  `sandbox-exec -p '<profile>' /bin/sh -c '<command>'`. Bubblewrap: emit the fixed option sequence
  with writable binds and then carve-outs (`--ro-bind-try` or `--tmpfs`+`--remount-ro`), then
  `bwrap <options…> -- /bin/sh -c '<command>'`. Neither renderer decides anything; both consume the
  specification.
- **Quoting (shared, single-purpose).** One POSIX shell-quoting function and one SBPL string-escaping
  function, each used everywhere and nowhere else, with property tests over paths containing quotes,
  backslashes, spaces, newlines and non-ASCII. C-112 makes this a security boundary because the
  wrapper is text submitted to a live shell (C-107), not an argv array — a crafted workspace path that
  escapes its literal would let a command author its own confinement rules.
- **Availability (owned at application lifetime).** The probe implements C-101's cost ordering
  exactly, runs off any interface thread, is bounded at 5.0 s with no extension and no retry, and its
  verdict is a `{ available, backend, reason, remediation }` value cached for the life of the
  application (C-05). Because ADR-EXEC-01 gives the runtime application lifetime, the cache lives
  there; the settings re-check control (REQ-SANDBOX-129) is the one operation that clears it, and it
  returns the label to a checking state inside 100 ms while the trial runs behind it (C-06).

Failure handling follows the two-level rule the specification insists on: a session whose requested
mode is unavailable **does not start** (C-105), and a wrap that fails at command time on a host that
passed the start-time gate refuses that one command with `sandbox_unavailable` / exit 126 and leaves
the session running (C-106). Those are separate code paths and neither may be reached by the other's
error handling — C-104 and REQ-SANDBOX-084 are explicit that no general retry or error handler may
absorb a confinement failure into an unconfined execution.

**On native Windows.**

> **ESCALATE — Windows users get no confinement at all.** C-99 closes the platform set at `darwin` and
> `linux` and forbids adding identifiers; C-97 forbids an opportunistic "confine where possible" mode.
> A Windows user therefore runs every agent command unconfined, and an unattended `autonomous` run on
> Windows is always downgraded to `ask` unless they set `runtime.allow_unsandboxed_autonomous: true`
> (C-45), at which point the agent runs unattended and unconfined on their machine. Technical options
> exist — AppContainer with a restricted token, a Job Object with UI and process limits, a filter
> driver, or launching commands inside WSL2 — and each would change what the product *does for a
> Windows user*. Adopting any of them contradicts C-99 and C-97 as written. The options are: (a)
> accept the specification and document plainly, on the settings surface and in the launch advisory,
> that Windows has no confinement; (b) amend REQ-SANDBOX-065 to admit a third platform with a
> genuinely enforcing mechanism, accepting that C-103's "demonstrated on a real host" obligation then
> extends to a third CI platform; (c) treat WSL2 as the supported Windows path and say so in the
> product's system requirements rather than only in a remediation string. This is a product decision.

**Consequences accepted.**

- C-103 forces real macOS and real Linux hosts into the conformance pipeline. No emulated or recorded
  backend can stand in, and the six effects of REQ-SANDBOX-127 must be exercised end to end on each.
  A Windows-only development machine can never exercise confinement, which makes this the slice most
  exposed to "works on my machine".
- `sandbox-exec` has long carried a deprecation notice on macOS. The specification names it literally
  (C-102) and hands its exact invocation to the user as a copyable remediation (REQ-SANDBOX-073), so
  it must be verified as present and functional on every macOS version the distribution slice claims,
  and the risk of its removal is a standing item rather than a discovered surprise.
- C-110's "nothing left on the host" and C-113's "documented empty `.git/`" contradict each other
  (OQ-5). The recommendation is to implement C-110 — refuse rather than create — and to raise the
  contradiction, because C-110 is the fail-closed reading and is stated as an obligation on the
  backend.
- Sandboxed foreground commands run inside a nested `/bin/sh -c`, so shell state accumulated by such a
  command does not persist (OQ-3). This is an observable behavioural difference between
  `sandbox_mode: off` and an active mode that the specification does not acknowledge, and it must be
  resolved before the terminal tool's description is written, since the description is what tells the
  agent whether `cd` persists.
- Lifecycle hooks run outside confinement and outside the policy (C-119). That boundary must be stated
  in the product documentation, not only in the specification.

**Revisit if.** The Windows escalation is decided; or macOS removes `sandbox-exec`; or a requirement
asks for read restriction inside confinement, which C-111 currently forbids and which would change the
profile and the bind set fundamentally.

---

### ADR-EXEC-09 — `fetch` is a hand-driven redirect loop over a manual-redirect HTTP client in the runtime

**Decision to be made.** How the egress policy is enforced for the one tool whose connections the
product opens itself, and which HTTP client that is.

**Constraints.** C-120 (two enforcement points, not to be conflated), C-122 (canonicalization with
required results, IDNA both ways, unknown host = deny/remote/matches-nothing), C-123 (label-wise
matching, single leading `*.`, bare name excluded, other `*` an error), C-124 (denied → allowed →
default; closed disposition vocabulary), C-125/C-126 (textual locality, no name resolution, and the
accepted consequence), C-127 (classify before any connection; never follow redirects automatically;
20-hop budget), C-128 (exhaustive redirect resolution rules), C-129 (`ask` belongs to the gate; the
named host pre-seeded; a new `ask` host mid-chain refused), C-130 (eight closed failure kinds, three
fixed error classes), C-131 (six malformed conditions before any connection; `timeout: 0` = no limit),
C-132 (three-level timeout precedence, reported), C-133 (window then cap; window alone never sets
`truncated`), C-134 (fixed rendering), C-135/C-136 (per-run saved configuration; permissive fallback
with no run), C-137 (the URL is the gated subject).

**Alternatives.**

1. *Electron's `net` module (Chromium's network stack).* Honours system proxy configuration, has a
   mature TLS stack, and exposes a `redirect` event that can cancel a hop. Against: it lives in main
   or in a session-bound context, and ADR-EXEC-01 puts tool execution in the runtime; C-127's promise
   that "a denied host observes zero connection attempts" is easier to guarantee when the code decides
   to open a socket than when it cancels a redirect a stack has already begun. Its proxy behaviour is
   also a hidden third party in a promise about which host is contacted (OQ-8).
2. *Node's built-in `fetch` (undici) with `redirect: 'manual'`, driving the chain by hand.* Chosen.
3. *A raw `http`/`https` request implementation.* Maximum control, and it would make "zero connection
   attempts" trivially auditable. Against: it re-implements TLS session handling, decompression,
   header parsing and character-set handling for no requirement that asks for it, and every one of
   those is a place to be wrong.

**Recommendation.** Alternative 2, structured as three separable pieces so that each is testable
without a network:

- **A pure classifier.** `canonicalizeHost(input) -> string`, `matchPattern(pattern, host) -> boolean`,
  `classify(policy, host) -> allow | ask | deny`, and `isLocal(host) -> boolean`. All pure, all
  table-tested against the worked examples the requirements state, which are numerous and exact
  (C-122, C-123, C-124, C-125). Canonicalization uses the WHATWG URL parser plus `url.domainToASCII`
  for IDNA; the IPv6 and IPv4-mapped canonicalization C-125(d) requires falls out of WHATWG parsing,
  which normalizes `::ffff:127.0.0.1` and `::ffff:7f00:1` to the same form. OQ-4 must be resolved
  first, because REQ-TOOLS-086 and REQ-SANDBOX-006 disagree on whether the canonical form of an IPv6
  literal is bracketed; the recommendation is REQ-SANDBOX-006's unbracketed form, which is the one
  with stated required results.
- **A hand-driven redirect loop.** Classify → open one request with redirects disabled → if 3xx,
  resolve the location per C-128's exhaustive rules, classify the *resolved absolute* URL, and loop,
  up to 20 hops. A per-request `permittedHosts` set is seeded with the named host (C-129) and grows as
  hosts classify `allow`, so a hop back onto a permitted host is not re-gated. A new host classifying
  `ask` mid-chain is refused, because there is no way to prompt in flight.
- **A validation front door.** C-131's six conditions are checked before anything else and produce
  `invalid_request` with `error_class: InvalidFetchRequest`, null `status_code` and a detail naming
  the parameter, its value and the constraint. `timeout: 0` is carried as *no deadline*, which means
  it must not be handed to a timeout helper that treats 0 as "already expired".

Shaping (C-133) is applied after the body is decoded: window first, cap second, `truncated` set only
by the cap. Rendering (C-134) is one function with a snapshot test, since the block names and the
sorted-keys/nulls-omitted rule are observable.

**Consequences accepted.**

- C-126 stands: classification is textual, so an allow-listed name resolving to a private or
  link-local address is permitted, and no DNS pinning is performed. This is the specification's choice
  and must be documented on the settings surface rather than silently strengthened — strengthening it
  would break REQ-SANDBOX-018's explicit "the test is textual and performs no name resolution".
- Proxy behaviour is unspecified (OQ-8). undici does not honour `HTTP_PROXY` by default, so choosing
  it makes "no proxy" the de facto answer. That is the fail-closed direction for C-127's zero-
  connection promise, but it will surprise corporate users and should be an explicit decision rather
  than a library default.
- C-120 and C-121 remain: this ADR gives per-host control only for `fetch`. Terminal commands get the
  heuristic of C-40 plus, inside confinement, a binary switch — and on Windows not even that. A
  loopback-proxy design that would give per-host filtering for terminal traffic on every platform was
  considered and is **rejected**, because REQ-SANDBOX-047 places destination-aware filtering of
  terminal traffic explicitly out of scope and would require TLS interception to be effective. If the
  product owner wants it, that is a scope change, not an implementation choice.
- The permissive fallback of C-136 is a real code path (a fetch with no owning run) and must be
  exercised in tests, or it will rot into the only path where an allow-everything policy is
  constructed.

**Revisit if.** OQ-4 or OQ-8 resolves; or REQ-SANDBOX-047 is reopened; or a requirement asks for
egress control over MCP servers' own network traffic, which nothing currently covers and which this
design does not reach.

---

### ADR-EXEC-10 — Redaction is one pure pass behind a branded type, applied at construction

**Decision to be made.** How the single redaction pass is placed so that seven surfaces cannot drift,
including under the specification's unusual "no matter which of its fields were set last" clause.

**Constraints.** C-138 (one pass, seven surfaces, none carrying rules of its own), C-139 (four ordered
layers with exact token semantics), C-140 (fixed segmentation and a closed sixteen-word list; whole
value masked when the key is secret-looking), C-141 (`***`, idempotent, complete recognized set),
C-142 (the display mask is a different function, never substituted), C-143 (the invariant holds
however the event was assembled), C-22 (request summary vs argument summary, never substituted),
C-66 (audit entries carry no argument values beyond the redacted facet).

**Alternatives.**

1. *Redact at each sink* — the audit writer, the event publisher, the logger and the dialog each call
   the pass. Simple and obvious. Against C-138 and C-143: a new sink is one forgotten call away from
   leaking, and C-143's "no matter which of its fields were set last" is specifically a statement about
   *assembly*, not about output, which a sink-side pass cannot make.
2. *Redact at one serialization choke point* — a single encoder through which every persisted or
   published value passes. Better; the sink count drops to one. Against: the approval dialog is not a
   serialization surface, and neither is user-visible error text; both are named in C-138. And a value
   that is copied out of an event before encoding (a log line assembled from the same object) escapes.
3. *A branded `Redacted` type produced only by the pass, with every event, audit and payload shape
   typed to accept only it.* Chosen.

**Recommendation.** Alternative 3. One module exports `redact(text): Redacted`,
`displayMask(secret): string`, and the branded type; the brand is unforgeable outside the module.
Every field the specification requires to be redacted — `summary` on `permission.decision` and
`approval.requested`, `command` and `argument_summary` on the approval payload, `arguments` on
`tool.start`, the hook payload's argument rendering, the audit entry's `summary` — is typed
`Redacted`, so a value that has not been through the pass cannot be assigned to it. C-143 is then a
compile-time property rather than a review discipline: there is no assembly order in which an
unredacted string reaches one of those fields.

The pass itself is a pure string function implementing C-139's four layers in order with C-141's
idempotence as a property test (`redact(redact(x)) === redact(x)` for arbitrary `x`). The key test of
C-140 is a separate pure predicate, reused by layers 1 and 2 and by the structured-payload rule that
masks a whole value under a secret-looking mapping key.

`displayMask` lives in the same module precisely so a reader sees both and sees that they are
different (C-142), and it is typed to return a plain string, not `Redacted`, so the two can never be
substituted by accident.

The two *renderings* of C-22 are separate functions with separate types (`RequestSummary`,
`ArgumentSummary`), both producing `Redacted`, so that the audit writer cannot be handed an argument
summary and the dialog cannot be handed a request summary. The specification is emphatic that these
are never substituted; making them distinct types is the cheapest way to guarantee it.

**Consequences accepted.**

- The brand is viral in the types that carry it. That is the cost of C-143 and it is worth paying only
  on the fields the specification names, not on every string in the product.
- The recognized set is closed (C-141), which means the pass will *not* catch a credential shape the
  list does not name. That is specified — "an implementation recognizing exactly those and nothing
  further is conformant" — and it must not be quietly extended, because REQ-TOOLS-171 also guarantees
  that a string carrying none of them reaches its destination unaltered. Adding a heuristic would
  break that guarantee.
- Layer 3's one-value-token rule produces `--token *** def`, which looks like a bug to a first-time
  reader. It is specified verbatim (C-139) and needs a comment citing the requirement, or someone will
  "fix" it.
- C-94 means the audit file has a second producer — user keystrokes taken in the terminal window —
  which must go through the same pass and the same writer (ADR-EXEC-11).

**Revisit if.** A requirement adds a credential prefix or a key word, which would be a change to a
closed vocabulary and therefore a specification amendment; or a surface appears that must show a
stored secret in clear, which C-142 currently forbids outright.

---

### ADR-EXEC-11 — Evidence files are append-and-compact JSONL behind one serialized writer per session

**Decision to be made.** How the permission audit trail and the verification-gate evidence file are
written, given that they are workspace-observable files with a ring-retention rule, two producers, and
a "never break dispatch" obligation.

**Constraints.** C-62 (fixed path, one object per line, decision order, interleaved mode changes),
C-63 (never altered, never inserted ahead, trimmed to the 5000 most recent, a reader sees a suffix
byte-for-byte as written), C-64 (every decision recorded; a raising sink warns and never breaks
dispatch), C-65 (correct session, or no entry at all and no error), C-66 (fixed fields; no argument
values), C-67 (per-entry side effects: issue, timeline event, stream event), C-68 (concurrent deciders,
one ordering), C-94 (a second producer: user terminal input), C-138 (redaction before writing).

**Alternatives.**

1. *SQLite as the store of record, with the JSONL file materialized on read.* Fits the candidate
   stack's persistence choice, gives cheap retention (`DELETE` by rowid) and cheap queries. Against:
   C-62 fixes the file as a workspace-observable artifact and C-63 fixes byte-level properties of it —
   "every retained entry byte-for-byte as it was written". Materializing on read means the file does
   not exist between reads, which is not what "are written to" describes, and a crash would lose
   entries a caller believes were recorded. Materializing on write means a dual write, at which point
   SQLite is a cache for a file that is already the contract.
2. *Plain append with periodic compaction, behind one serialized writer per session file.* Chosen.
3. *Segmented files with whole-segment deletion* (write to `permissions.0.jsonl`, roll, delete old).
   Avoids rewriting a large file. Against C-62's fixed single path: a reader is promised one file at
   one location, and segment rolling would either break that or need a merge on read.

**Recommendation.** Alternative 2. One writer object per session file, owning an in-process queue so
that concurrent deciders serialize into decision order (C-68) and mode-change entries interleave in
the same stream (C-62). Writes are appends. Retention is a compaction step, triggered when the entry
count exceeds the 5000 cap by a hysteresis margin rather than on every entry: read, drop the oldest
prefix, write a temporary file, `fsync`, rename over the original. Rename is what preserves C-63's
"every retained entry byte-for-byte" — a reader either sees the pre-compaction file or the
post-compaction file, never a half-rewritten one. The writer keeps its own entry count so compaction
does not need to re-read to decide.

Both producers go through the same writer: the gate's decisions and mode changes, and the terminal
window's user-originated input entries (C-94), the latter arriving from main and being redacted by the
same pass (C-138) before they reach the queue. Two writers on one file would break C-63's ordering and
its atomicity.

Every write is best-effort with respect to the caller: a failure logs a warning and returns, and the
decision, the mode change or the keystroke proceeds regardless (C-64). Failures are counted so a
persistently failing evidence directory becomes a session issue rather than a silent hole.

The three per-entry side effects of C-67 — the `permission_denied` issue, the `permission_approved`
timeline event, the `permission.decision` stream event — are emitted by the same call that enqueues
the entry, so the four cannot diverge, and none of them is allowed to fail the dispatch either.

Relationship to the candidate stack's event journal: the journal may carry these records as well, and
projecting into the JSONL file from the journal is a legitimate variant. What is not legitimate is
making the file a derived artifact that can be absent or stale, because C-62 and C-63 make it the
observable contract.

**Consequences accepted.**

- Compaction is O(file) and runs on the writer's queue, so it must not run on any path with a latency
  budget. Under ADR-EXEC-01 it is in the runtime, off every interface thread (C-07).
- The 5000-entry cap is per file, not per session-day, so a long session silently loses its early
  history. That is specified (C-63) and must be visible to whoever builds a diagnostics view over the
  file, or they will present a truncated history as a complete one.
- C-65's "a decision taken outside every registered session writes no entry and reports no error"
  means the writer must be *absent*, not failing, in that case — the code path is a no-op, not a
  swallowed error.
- The verification-gate file (REQ-TOOLS-190) uses the same writer with its own path and cap, so the
  retention logic is written once.

**Revisit if.** A requirement adds a query over the audit trail that a linear file cannot serve, at
which point a SQLite index *beside* the file (not instead of it) becomes the shape to consider; or the
cap or the path changes.

---

### ADR-EXEC-12 — Custom tool plugins: the specified plugin language and the chosen stack are incompatible (ESCALATE)

**Decision to be made.** What a custom tool plugin is written in, where it executes, and what
"inside the host process" means once the host process is Node.

**Constraints.** C-144 (plugins are `*.py` files under `<workspace>/.rotaris/plugins`, listed per
persona under `custom_tools:`, each defining exactly one tool definition, loaded when the persona's
agent is built, executing inside the host process with exactly that process's OS privileges and no
confinement of their own), C-145 (discovery is not loading; the inventory lists every `*.py` file and
states in text whether it is loaded and by which personas), C-146 (duplicate names and collisions with
public names are startup errors), C-147 (JSON-expressible arguments and returns; exceptions become
structured tool errors; the same run-scoped context a built-in receives), C-17 (plugin dispatch still
passes the gate), C-01 (one shipped executable, nothing else installed).

**The problem.** The specification fixes the plugin file extension as `.py` in two places — the
settings inventory (REQ-TOOLS-165) and the on-disk layout — and fixes execution as *in-process with
the host's privileges* (REQ-TOOLS-163). A TypeScript/Node host cannot import a Python module into its
own process. This is the point in my slice where a requirement and the candidate stack are genuinely
incompatible, and no amount of implementation cleverness closes it.

**Alternatives.**

1. *Bundle a Python runtime and host plugins in a sidecar process.* Preserves the file format, the
   folder, the per-persona loading and the settings inventory exactly. Against: it violates
   REQ-TOOLS-163's literal "inside the host process" — the privilege statement survives (a sidecar
   run as the same user under no confinement holds the same OS privileges), but the in-process claim
   does not. It sits badly with C-01: shipping a CPython interpreter inside the bundle arguably makes
   a second executable available to an installation, which REQ-STARTUP-002 forbids, and even read
   charitably it adds tens of megabytes and a second supply chain to sign, notarize and update. It
   also needs a serialization boundary that C-147's JSON constraint happens to make tractable.
2. *Change the plugin language to JavaScript/TypeScript.* Plugins become `*.js`/`*.mjs` loaded by
   dynamic `import()` in the runtime, genuinely in-process, genuinely holding the host's privileges,
   with exceptions becoming structured tool errors naturally. Everything else in C-144 to C-147 —
   per-persona loading, one definition per file, duplicate detection, degradation on load failure,
   the inventory tab — is unchanged. Against: it contradicts REQ-TOOLS-165 and the on-disk layout as
   written, and it changes what a user can write, so it is not this slice's decision to take.
3. *Embed Python in WebAssembly.* Keeps `.py` and stays in-process. Against: it cannot satisfy
   REQ-TOOLS-163's premise at all — a WASM Python has no unrestricted filesystem or subprocess access,
   so a plugin would *not* hold the privileges the host holds, and REQ-TOOLS-163's whole point is that
   a plugin is a privileged extension whose confinement the product cannot enforce. It would also be
   an unusual and slow host for a tool that is supposed to be a thin extension point.
4. *Drop custom plugins.* Removes a capability the specification carries. Not this slice's call.

**Recommendation — and it is an escalation, not a decision.**

> **ESCALATE.** The architectural recommendation, if the product owner is willing to amend the
> requirement, is **alternative 2**: plugins are JavaScript or TypeScript modules loaded by dynamic
> `import()` inside the runtime process, with `REQ-TOOLS-165`'s `*.py` and the on-disk layout amended
> to the corresponding extensions. It is the only option that satisfies REQ-TOOLS-163 as written —
> genuinely in-process, genuinely holding the host's privileges — while keeping every other property
> of REQ-TOOLS-161 to REQ-TOOLS-165 intact and costing nothing in bundle size or supply chain. If the
> product owner instead requires that existing Python plugin files keep working, that is a decision to
> take alternative 1 and to accept a bundled interpreter, a second signing and update surface, and a
> re-reading of REQ-TOOLS-163's "inside the host process" as "with the host's privileges". Choosing
> the plugin language changes what a user can write and therefore what the product is; it belongs to
> the product owner.

Whichever is chosen, the surrounding architecture is the same and can be settled now: the loader is
per-persona and explicit (C-145 — the folder never auto-loads), one definition per file, failures
degrade the agent's tool set with a stable reason code plus a session issue (C-15), duplicate
registered names and collisions with public tool names are startup errors (C-146), plugin dispatch
passes the same gate as everything else (C-17), and a plugin receives the same `RunContext` a built-in
receives (C-147, ADR-EXEC-01). The undeclared-capability rule of C-11 applies to plugin tools
unchanged: they declare no facet, and every rule reads them fail-closed in its own direction.

**Consequences accepted.**

- Under either choice, plugins remain unconfined code in a process that holds the user's privileges,
  and no permission rule can change that. REQ-TOOLS-163 says so; the settings inventory should say so
  too, beside the load-state text of C-145, so a user copying a file into that folder understands what
  naming it in `custom_tools:` grants.
- Under alternative 2, ADR-EXEC-01's crash-isolation argument becomes load-bearing rather than
  precautionary: a plugin that throws asynchronously or leaks handles takes down the runtime, not the
  windows.
- Under alternative 1, the plugin sidecar becomes a third process and ADR-EXEC-01's "one runtime"
  premise should be re-opened rather than extended silently.

**Revisit if.** The escalation is decided; or a requirement arrives asking for plugin confinement,
which would contradict REQ-TOOLS-163 and would be a much larger change than a language choice.

---

## 5. Summary of items for the product owner

| # | Item | Where |
|---|---|---|
| 1 | Does the `tmux-pool` terminal backend ship, or is it withdrawn together with `pane_replaced` and `replace_failed`? | ADR-EXEC-06, OQ-1 |
| 2 | Native Windows has no confinement mechanism at all under REQ-SANDBOX-065. Accept, amend, or make WSL2 the supported Windows path? | ADR-EXEC-08 |
| 3 | Custom tool plugins are specified as in-process Python; the stack is Node. Amend the language, bundle an interpreter, or drop the capability? | ADR-EXEC-12, C-144 |

Ten further open questions (OQ-1 to OQ-10) are specification questions rather than product decisions
and are listed in section 3. OQ-2 (stream frame payload), OQ-3 (shell state under confinement) and
OQ-4 (contradictory host canonicalization) block ADR-EXEC-07, ADR-EXEC-08 and ADR-EXEC-09
respectively and should be resolved before those are ratified.
