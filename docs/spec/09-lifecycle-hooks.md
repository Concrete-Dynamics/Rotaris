---
reference: ROTARIS-CRW-001
domain: lifecycle-hooks
date: 2026-08-29
status: draft
---

# User-Defined Lifecycle Hook Commands

## Overview

Users can attach shell commands ("hooks") to named points during a run: around tool calls, and at session, iteration, child-agent, and verifier boundaries. Every hook is handed a secret-masked JSON description of what happened on standard input, is given a wall-clock budget to finish in, and answers with its exit status. Only a hook attached to the point before a tool call is capable of stopping anything. Hooks are declared in layered YAML configuration; commands declared by a repository stay inert until the user reviews and approves them; hooks configured for an external agent can optionally be imported; and every invocation is recorded both in session diagnostics and on the event stream.

## Requirements

### Event Model

- **REQ-HOOKS-001** — The system SHALL recognize exactly seven hook events in two families: tool events `pre_tool` and `post_tool`, and lifecycle events `session_start`, `session_end`, `iteration_end`, `child_completed`, and `verifier_finished`. No other event name is valid in configuration.

- **REQ-HOOKS-002** — Only tool hooks SHALL be able to influence the run via exit code. Lifecycle hooks are strictly informational: given a lifecycle hook with any configuration (including `required: true`), when it exits with any code, then the run proceeds unaffected.

- **REQ-HOOKS-003** — Events SHALL fire at these points: `pre_tool` immediately before a permitted tool call runs; `post_tool` once a tool call has run; `session_start` once per run, ahead of the first iteration; `session_end` once per run, on each of the ways a run can finish: success, failure, a requested stop, cancellation, and interruption; `iteration_end` at the close of each finished iteration; `child_completed` once a delegated child agent has finished, whatever its final state; `verifier_finished` once for every completion-verifier pass, executed or skipped.

- **REQ-HOOKS-004** — Permission policy SHALL be evaluated before hooks: given a tool call the policy denies, no hook process starts and no hook event fires for that call. `post_tool` SHALL fire only for calls that ran to completion — not for a policy denial, and not for a call stopped by a `pre_tool` hook.

- **REQ-HOOKS-005** — Given a tool call that ran but did not succeed (the tool returned an error rather than an observation), the `post_tool` hooks SHALL still fire, and the payload's `result` field SHALL carry `{"error": "<text>"}`.

- **REQ-HOOKS-006** — Given a programmatic request to fire a lifecycle event name the system does not recognize, the engine SHALL do nothing and return zero outcomes (recording the fact at debug log level only), so that new event names can be introduced without breaking older components.

### Configuration Schema and Validation

- **REQ-HOOKS-007** — Hooks SHALL be declared under a `hooks:` key of the layered YAML agent configuration, in either the global scope (the per-user configuration directory's `agents.yaml`) or the workspace scope (`<workspace>/.rotaris/agents.yaml`).

- **REQ-HOOKS-008** — Each hook entry SHALL support exactly these fields with these defaults:
  - `event` (string, required, no default): must name one of the seven events listed in REQ-HOOKS-001; surrounding whitespace is removed before validation.
  - `command` (string, required): must not be blank or whitespace-only; otherwise kept exactly as written (no whitespace trimming).
  - `name` (string, default `""`): display label; if it reduces to empty after trimming, the hook's stable id is displayed instead.
  - `matcher` (string, default `""`): empty selects every applicable occurrence; trimmed; must parse as a valid command pattern when configuration is loaded.
  - `timeout_seconds` (number, default `60.0`): must be strictly greater than 0.
  - `required` (boolean, default `false`): has meaning only for `pre_tool` (see REQ-HOOKS-048).
  - `enabled` (boolean, default `true`): `false` leaves the entry declared but non-executing; the entry keeps its place in the list, so ids assigned to the entries around it do not shift.
  - `source` (string, default `""`): filled in while loading; any value written by hand SHALL be replaced.

- **REQ-HOOKS-009** — The hooks section SHALL support: `enabled` (boolean, default `true`) as a single on/off control for the whole feature — when `false`, nothing runs but declarations remain; `entries` (list, default empty — no hooks ship with the product); and `superseded_entries` (list, default empty, filled in only while loading, never written by hand).

- **REQ-HOOKS-010** — A list-shorthand spelling `hooks: [ <entries> ]` SHALL be accepted and normalized to `hooks: { entries: [...] }`; both spellings produce identical behavior, including the recorded declaring scope.

- **REQ-HOOKS-011** — A bare `hooks:` key (YAML null) and a bare `entries:` key SHALL parse as *unset*, not *empty*: the inherited entry list is kept. A `hooks:` value that is neither a mapping nor a list SHALL fail loading with an error of the form: `Invalid 'hooks' section: expected a mapping or a list of hook entries, got <type>`.

- **REQ-HOOKS-012** — An invalid entry SHALL make configuration loading fail: the load SHALL surface an error naming the YAML path of the offending field, SHALL produce no configuration, and SHALL neither drop, ignore, nor repair the entry. `<i>` is the entry's position within the `entries` list of the scope being loaded, counted from `0` across every declared entry, entries with `enabled: false` included:
  - Unknown event name — path `hooks.entries.<i>.event`; message `hook event '<v>' is not a known lifecycle hook event; expected one of: ...`, quoting the rejected value and listing all seven names of REQ-HOOKS-001.
  - Matcher that will not tokenize, an unclosed quote for instance — path `hooks.entries.<i>.matcher`; message `hook matcher '<v>' is not a usable command pattern: ...`.
  - Blank or whitespace-only command — path `hooks.entries.<i>.command`; message `hook 'command' must not be blank`.
  - `timeout_seconds` of zero or less — path `hooks.entries.<i>.timeout_seconds`.

  Open Questions 11 and 12 record that the message text for the timeout failure, and whether one failure or every failure is reported, are not fixed here.

### Configuration Layering and Provenance

- **REQ-HOOKS-013** — Scope precedence SHALL be: built-in defaults, then global, then workspace. A scope that supplies an `entries` list SHALL substitute its own list for the inherited one in full, which lets a narrower scope remove an entry it inherited; a scope that supplies only `enabled` SHALL leave the inherited entries in place.

- **REQ-HOOKS-014** — Every entry SHALL be tagged with the scope that declared it (`default`, `global`, or `workspace`) while that scope is being loaded, ahead of the merge, so the tag is still accurate after merging. A configuration assembled in memory without going through the loader SHALL resolve as scope `default`.

- **REQ-HOOKS-015** — When one scope's `entries` list supersedes an inherited list, the displaced entries — together with anything previously displaced — SHALL be kept in the winning scope's `superseded_entries`. Keeping them is purely a record; it grants nothing and decides nothing about trust.

- **REQ-HOOKS-016** — Given a configuration file named explicitly on the command line (a `--config <path>` override), its hook entries SHALL carry no scope tag, SHALL resolve as scope `default`, and SHALL therefore be trusted. This is deliberate: naming a file on the command line is an act by the user, whereas a workspace's own configuration can travel in with a checkout the user merely opened.

### Hook Identity and Ordering

- **REQ-HOOKS-017** — When `hooks.enabled` is `false`, both the effective hook set and the resolved superseded set SHALL be empty.

- **REQ-HOOKS-018** — Each resolved hook SHALL have a stable id of the form `<source>:<index>:<event>` (e.g. `workspace:0:post_tool`) unless it carries an explicit external identity (see REQ-HOOKS-114). `<index>` is the entry's ordinal within the list declared by its own scope, assigned while disabled entries are still present, so switching one entry off leaves every other entry's id unchanged. Each scope has its own independent index sequence.

- **REQ-HOOKS-019** — Selecting the hooks for one event SHALL preserve declaration order.

- **REQ-HOOKS-020** — The scope names treated as trusted SHALL be exactly `default`, `global`, and `workspace` (the last only once approved, see REQ-HOOKS-090). Any other scope value SHALL be refused by the trust gate; there is no permissive branch for unfamiliar scopes. Imported external hooks use the scope value `external:claude-code`, which is intentionally not in this set.

### Matcher Semantics

- **REQ-HOOKS-021** — Matchers SHALL apply only to tool events. A lifecycle event has nothing to select against, so its hooks fire on every occurrence whatever `matcher` says.

- **REQ-HOOKS-022** — An empty matcher SHALL select every tool call, whether or not that call supplies a shell command.

- **REQ-HOOKS-023** — A hook that carries a non-empty set of tool names (only imported hooks do) SHALL match when the tool name is a member of that set, compared exactly; its string matcher plays no part.

- **REQ-HOOKS-024** — Where the call supplies a non-blank shell command, the matcher SHALL be read as a command pattern and tested against every segment of a command line built from several commands, so that in `git status && rm -rf /` the second command is examined too.

- **REQ-HOOKS-025** — A command pattern SHALL be evaluated as follows. The candidate command line is first divided, outside quotes, at each of `&&`, `||`, `;`, `|`, `&`, and a line break; the pattern is tested against each resulting segment, and a match on any segment is a match (so `rm -rf /` inside `git status && rm -rf /` is examined). Within a segment, both pattern and candidate are split into tokens under shell quoting rules. Tokens are compared position by position, each comparison a case-sensitive shell-style glob in which `*` matches any run of characters. The segment matches only when its token count equals the pattern's, with one exception: where the pattern's final token is a bare `*`, the segment may carry any number of further tokens, zero included. Matching is positional and never a substring search: `echo git push` does not match `git push *`. Open Questions 13 and 27 record that glob constructs other than `*`, and the quoting convention under which pattern and candidate are split into tokens on each platform, are not fixed by this document.

- **REQ-HOOKS-026** — Consequence to document and test: `git push *` (with space) matches both `git push` and `git push --force`; `git push*` (no space) is a two-token pattern that matches `git push` on its own and nothing longer.

- **REQ-HOOKS-027** — An empty matcher selects every tool call (REQ-HOOKS-008, REQ-HOOKS-022); what follows governs non-empty matchers only. Where the text a matcher is tested against (REQ-HOOKS-029) is empty or whitespace only, the matcher SHALL instead be compared with the tool name as one case-sensitive shell-style glob: `read_f*` selects `read_file` and does not select `READ_FILE`. Where that text is non-blank — a file-editing tool's requested action name included — the call SHALL be matched as a command pattern under REQ-HOOKS-024 and REQ-HOOKS-025, and the tool name SHALL play no part.

- **REQ-HOOKS-028** — Matching SHALL be defined for every input: a command line that cannot be tokenized (for example an unclosed quote), or a matcher that will not parse at match time, SHALL yield "no match" rather than turning the tool call into a failure.

- **REQ-HOOKS-029** — The text a matcher is tested against SHALL be the same facet the permission policy matches on, taken from the call's arguments: for the shell tool (`terminal`) that is the command line; for a file-editing tool it is the name of the action requested — one of `create`, `edit`, `overwrite`, `insert`, `undo` — so the matcher `create` selects every file creation whatever the path.

### Execution Engine

- **REQ-HOOKS-030** — Each invocation SHALL run the configured `command` as a newly started process handed to the host platform's command interpreter, so that operators, quoting, redirection, and executable lookup written into `command` take effect exactly as they would were the same line typed at that platform's shell prompt. The process's working directory SHALL be the tree the run is changing: the isolated worktree for a run confined to one, and otherwise the workspace itself (REQ-HOOKS-084). Open Question 14 records that the interpreter used on each platform, and whether the payload's `workspace` field reports the base workspace or the worktree, are not fixed by this document.

- **REQ-HOOKS-031** — The payload SHALL be delivered as exactly one UTF-8 JSON object written to the hook process's standard input, and standard input SHALL then be closed, so that a hook reading to end-of-input terminates. No part of the payload SHALL be placed on the process's command line or in its environment: a tool argument containing `; rm -rf /` reaches the hook only as text inside the JSON document and is never interpreted. A hook that writes to standard output or standard error before or while it reads the payload SHALL NOT stall the invocation. Whatever the process wrote SHALL be reported subject to the limits of REQ-HOOKS-037, except in the two cases where there is nothing to report: the grace period of REQ-HOOKS-033 also expired, or no process was started at all (REQ-HOOKS-035). Open Question 28 records that whether a single trailing newline may follow the JSON object on the wire is not fixed here.

- **REQ-HOOKS-032** — The hook process SHALL inherit the host environment, with any per-run variable overrides supplied by the embedding application taking precedence. The product itself contributes no hook-specific environment variables.

- **REQ-HOOKS-033** — Each invocation SHALL be bounded by the hook's `timeout_seconds` of wall-clock time. On expiry the hook process SHALL be terminated, and at most a further 5.0 seconds SHALL be spent completing that termination and collecting output the process had already produced; where that grace period also expires, the outcome reports empty output rather than the run waiting any longer. Termination SHALL reach only the process that was started and SHALL NOT be widened to its process group, so a descendant that has detached from it may keep running after the timeout. The outcome SHALL record `timed_out = true` and no exit status (surfaced per REQ-HOOKS-036). The invocation SHALL therefore return no later than `timeout_seconds` plus 5.0 seconds of grace plus the time taken to start one process: a hook given a 0.3 s budget whose command sleeps for 60 s SHALL return without waiting for that sleep, and far inside the 60 s.

- **REQ-HOOKS-034** — Given a resolved hook whose timeout is zero or negative because it was constructed programmatically without configuration validation, execution SHALL substitute the 60-second default instead of running with no limit.

- **REQ-HOOKS-035** — If the command cannot be launched at all (for example because the working directory does not exist), the outcome SHALL have no exit code, empty output, a description of the launch failure, and a user-facing warning containing "could not run"; no error propagates into the run.

- **REQ-HOOKS-036** — The state in which a hook returned no exit status at all (launch failure, or termination on timeout) SHALL be represented by one fixed value that means the same thing on every operating system, rather than by whatever a platform reports for a signalled process; consumers must therefore read the `timed_out` flag rather than infer anything from an exit value. That fixed value is `-1`, and it is what appears wherever an outcome's exit code is recorded verbatim — the session timeline entry's `exit_code` metadata and its message text (REQ-HOOKS-119). On the session event stream the same state is normalized to `exit_code: null` (REQ-HOOKS-125), so a stream consumer never sees `-1`.

- **REQ-HOOKS-037** — Standard output and standard error SHALL be captured separately and decoded as UTF-8, with bytes that are not valid UTF-8 replaced rather than causing the capture to fail. Each stream SHALL be limited to 16384 bytes, the two limits applying independently of one another. Where a stream exceeded that limit, the retained portion SHALL be followed by the marker `\n[truncated: <total> bytes of output, 16384 kept]`, `<total>` being the size the stream would have had untruncated. A stream at or below the limit SHALL carry no marker. Open Question 15 records that whether the cut is taken on the raw bytes or on the decoded text, and whether the marker counts toward the limit, are not fixed here.

- **REQ-HOOKS-038** — Each outcome SHALL record the elapsed wall-clock time as a whole number of milliseconds, measured over the entire invocation including any timeout handling.

- **REQ-HOOKS-039** — Every invocation SHALL yield an outcome, whatever the host does. An interpreter or executable that is not installed, a working directory that cannot be used, and a process ended by a signal SHALL each yield an outcome carrying one of the warnings defined in REQ-HOOKS-052, after which the tool call or lifecycle point continues. A diagnostics location that cannot be written SHALL NOT produce a warning and SHALL NOT change the outcome; it degrades to a log entry per REQ-HOOKS-121. None of these conditions SHALL raise an error into the run, end the run, alter its terminal status, or leave it waiting beyond the bound of REQ-HOOKS-033. Open Question 16 records that the exit value reported for a hook ended by a signal is not fixed by this document.

- **REQ-HOOKS-040** — Every applicable hook for an event SHALL run, in declaration order, even after one of them has decided to stop the call; the decision that takes effect is the first stopping outcome, determined once all applicable hooks have finished.

- **REQ-HOOKS-041** — Where a session has no hook eligible to run for an event, that event SHALL yield zero outcomes and nothing observable: no process is started, no `hook.start` or `hook.finish` is published, no `timeline.jsonl` or `issues.json` entry is written, and no file is read or written on account of hooks. The once-per-session announcement of hooks the trust gate withheld (REQ-HOOKS-127) is the only event this rule does not suppress.

- **REQ-HOOKS-042** — Where a session has several tool calls outstanding at the same moment, the following SHALL hold. A hook's failures count against one allowance per stable id for the whole session, whichever call produced them, so three failures spread over three simultaneous calls switch the hook off at precisely the point three consecutive failures would (REQ-HOOKS-055). Reaching that point SHALL yield one switch-off warning and one switched-off id and no repeat of either, however many outstanding calls met the failing hook at once. A hook that consumes its entire budget on one call SHALL NOT delay the hooks of any other outstanding call, which begin and finish on their own schedule.

### Exit-Code Semantics and Blocking

- **REQ-HOOKS-043** — For `pre_tool`: exit `0` lets the call proceed with no feedback and no warning; exit `2` stops the call, and what the hook wrote to standard error becomes the refusal that reaches the agent in place of the tool's output; any other exit produces a warning and the call proceeds.

- **REQ-HOOKS-044** — For `post_tool`: exit `0` yields nothing; exit `2` puts what the hook wrote to standard error into the conversation in addition to whatever the tool itself produced (the call already happened and is not rolled back); any other exit produces a warning.

- **REQ-HOOKS-045** — For lifecycle events: any non-zero exit — `2` included — is a warning only; the outcome always records that nothing was stopped, whatever `required` says. A lifecycle hook exiting `2` does count as a failure against the switch-off allowance, unlike a tool hook exiting `2`.

- **REQ-HOOKS-046** — Exit `2` from a `pre_tool` or `post_tool` hook is the hook working as designed and SHALL NOT count against the failure allowance: a guard that correctly stops calls is never switched off for doing so (five consecutive stops leave it enabled and file no failure issue). Exactly three situations count as a failure: the budget expired, the process could not be started, and the process exited with a code this specification assigns no meaning to.

- **REQ-HOOKS-047** — Nothing except a `pre_tool` hook SHALL ever be capable of stopping a call, regardless of what any other resolution step concludes; this SHALL be enforced rather than merely assumed.

- **REQ-HOOKS-048** — `required: true` SHALL NOT be interpreted as "any non-zero exit stops the call". A `pre_tool` hook that ran to completion and exited 1, 3, or 127 is simply misbehaving: warning, call proceeds, `required` or not. `required` changes behavior only where the hook returned no verdict at all (timeout or launch failure): without it, such a case proceeds with a warning; with it, the call is stopped and the agent is told which of the two happened. On a `post_tool` hook and on any lifecycle hook the flag is simply ignored.

### Message Formats (Agent- and User-Visible)

- **REQ-HOOKS-049** — The refusal an agent receives from a stopping `pre_tool` hook SHALL be exactly: `Blocked by hook '<name>'. <reason> The '<tool>' call was not executed. Choose a different approach or ask the user to adjust the hook configuration.` With an empty tool name the middle sentence reads `The call was not executed.`

- **REQ-HOOKS-050** — The `<reason>` in the refusal SHALL be: the hook's trimmed standard error; or `The hook gave no reason.` when the hook exited 2 having written nothing to standard error; or `The hook timed out after <budget> s.` when a `required` hook timed out; or `The hook could not be started.` when a `required` hook failed to launch.

- **REQ-HOOKS-051** — `post_tool` feedback text SHALL be: `Hook '<name>' reported after the '<tool>' call: <stderr>` (or `after the call:` with no tool name); empty standard error renders as `(the hook wrote nothing to stderr)`. Where one call produces several such texts they SHALL be joined with `\n` before delivery.

- **REQ-HOOKS-052** — Warning texts SHALL be:
  - launch failure: `Hook '<name>' (<event>) could not run: <crash reason>`
  - timeout: `Hook '<name>' (<event>) timed out after <budget> s and was terminated.`
  - exit code with no assigned meaning: `Hook '<name>' (<event>) exited <code>.` followed, where either stream produced text, by an excerpt taken from standard error — or from standard output where standard error is empty — with each run of whitespace reduced to a single space and the result limited to 200 characters, a trailing `…` marking an excerpt that was cut.

  `<name>` is the hook's display name, or its stable id where no name is configured (REQ-HOOKS-008); `<event>` is one of the seven event names. Open Questions 17 and 29 record that the numeric rendering of `<budget>`, whether the `…` counts toward the 200 characters, and how the excerpt is joined to the sentence before it are unspecified.

- **REQ-HOOKS-053** — On the invocation that reaches the switch-off limit (see REQ-HOOKS-055), the warning SHALL gain, on that occasion only: `Hook '<name>' failed <count> times and is disabled for the rest of this session.`

- **REQ-HOOKS-054** — At the end of a run the switched-off-hook advisory SHALL be delivered on the host's notice channel (REQ-HOOKS-087). It SHALL be the empty string where that run switched no hook off. Otherwise it SHALL read `<N> hook(s) failed repeatedly and was/were switched off for the rest of this session. See the session's diagnostics for the command output.`, `<N>` being the number of hooks switched off under REQ-HOOKS-055. The advisory SHALL disclose that count and nothing further: no hook name, no command, no matcher, and no other configuration text SHALL appear in it. Hook warnings SHALL reach the user's warning channel only; no hook warning text SHALL appear in anything delivered to the agent. Open Question 18 records whether this advisory inflects for `<N>` of 1 the way REQ-HOOKS-101 does.

### Failure Budget and Auto-Disable

- **REQ-HOOKS-055** — Once one hook (identified by stable id) has failed three times inside a single session, it SHALL be switched off and not invoked again before that session ends. The switch-off warning is emitted on the third failure and on no other occasion; afterwards the hook is skipped without comment — zero outcomes, no further warnings. (Five failing rounds therefore produce outcome counts 1, 1, 1, 0, 0 with exactly one switch-off warning.)

- **REQ-HOOKS-056** — Once switched off, the hook's id SHALL be visible in the engine's set of switched-off hooks, and an event whose hooks have all been switched off reports "no hooks". Failure tallies and the switched-off set belong to a single session; the next run begins with both empty.

### Payload Content and Redaction

- **REQ-HOOKS-057** — A tool payload SHALL always carry exactly the keys `event`, `tool_name`, `arguments`, `session_id`, `workspace` (path as a string), and `command` (the empty string for a tool that has no shell command, so that a hook script may index all six keys unconditionally). The `result` key SHALL appear only when a result exists — in practice only on `post_tool`; a `pre_tool` payload never has it.

- **REQ-HOOKS-058** — A lifecycle payload SHALL always carry `event`, `session_id`, and `workspace`; whatever fields the particular occurrence contributes are placed as siblings of those three, not nested under a sub-object. An occurrence that contributes no fields produces a payload of exactly those three keys.

- **REQ-HOOKS-059** — The names `event`, `session_id`, and `workspace` SHALL be reserved: caller-supplied lifecycle fields using those names are dropped without comment, so event data cannot impersonate the session identity that a shared hook script may branch on.

- **REQ-HOOKS-060** — Secret masking SHALL follow the payload's structure and reach every level of it: every string, however deeply nested, is passed through one common masking routine, and the surrounding shapes are left as they are rather than being flattened.

- **REQ-HOOKS-061** — Masking SHALL replace a recognized value with `***` and SHALL leave the text around it intact, so `Bearer sk-live-1` becomes `Bearer ***` and `Bearer` stays legible. The passes SHALL be applied to each string in this order: (1) `key=value` and `key: value` assignments whose key names a credential; (2) `--flag value` pairs whose flag names a credential; (3) the value following `Bearer`, `Basic`, or `token`; (4) values recognized by their opening characters — `ghp_`, `ghs_`, `ghu_`, `gho_`, `sk-`, `sk_`, `iv1.`, `eyj` — compared without regard to case and only where the prefix begins at a word boundary. A key or flag names a credential when it is, or is an underscore-joined name built around, one of `api_key`, `api_keys`, `key`, `keys`, `token`, `tokens`, `secret`, `secrets`, `password`, `passwords`, `passwd`, `credential`, `credentials`, `auth`; `GITHUB_TOKEN` and `AWS_SECRET_ACCESS_KEY` are such names. Key names SHALL be compared without regard to case. Masking SHALL be idempotent: masking an already-masked string SHALL leave it unchanged. Open Questions 19 and 30 record that the extent of the value replaced in passes (1) and (2), and whether the scheme keywords of pass (3) are compared without regard to case, are not fixed here.

- **REQ-HOOKS-062** — A string stored under a mapping key that names a credential SHALL arrive as `***` in its entirety, whatever the string looks like: `{"password": "the meeting is at noon"}` reaches the hook as `{"password": "***"}`. A string stored under any other key SHALL arrive unaltered but for whatever the passes of REQ-HOOKS-061 find within it, so `{"note": "run the tests"}` arrives verbatim. A mapping key names a credential exactly when it meets the credential-name test of REQ-HOOKS-061 — the same list of names, the same case-insensitive comparison, and the same allowance for underscore-joined names — so `password`, `api_key`, and `GITHUB_TOKEN` are credential names both as mapping keys and as the left-hand side of a `key=value` assignment inside a string. Open Question 20 records the treatment of a list or mapping stored under a credential-named key.

- **REQ-HOOKS-063** — Building a payload SHALL always produce one JSON object that parses (REQ-HOOKS-067), SHALL never fail, and SHALL never alter the caller's data. The substitutions below apply at every nesting level:
  - A value JSON cannot express is written as its text form; where producing that text form itself raises, the placeholder `<unrepresentable <TypeName>>` is written instead, `<TypeName>` naming the value's type.
  - Ordered and unordered collections are written as JSON arrays; not-a-number and positive and negative infinity are written in text form so that the document stays valid JSON; raw byte values are decoded as UTF-8 with replacement and then masked.
  - A container encountered again while it is still being walked is written as `"<recursive>"`; a value merely referenced from two places is written out in full at each of them.
  - A value nested more than 12 levels deep is written as its masked text form.
  - Mapping keys are converted to text and masked.
  - Where iterating the top-level mapping itself raises, the result is still a JSON object: a single key `payload` holding the masked text form of the offending value.

  Open Question 21 records that the level at which depth counting starts and the exact text used for the non-finite numbers are not fixed here.

- **REQ-HOOKS-064** — Masking an already-masked payload SHALL change nothing, and the caller's own data SHALL still hold the original values afterwards, since masking works on a copy.

- **REQ-HOOKS-065** — Where the engine is wired into real tool dispatch, arguments SHALL be shaped as follows: for the `terminal` tool, `arguments.command` holds the shell line next to the action's other (masked) fields; for a tool provided over MCP, that tool's own fields sit under `arguments.data` (so `arguments.data.api_key` arrives as `"***"`).

- **REQ-HOOKS-066** — The `post_tool` payload's `result` SHALL render what the agent was given for that call: `{"observation": "<text>"}` where the call produced an observation, `{"error": "<text>"}` where it produced an error (REQ-HOOKS-005). Where the call produced exactly one such item, `result` is that object; where it produced several, `result` is an array of them in the order the agent received them; where it produced none, the `result` key is absent altogether. Each `<text>` SHALL be limited to 4096 characters, and text that was cut SHALL end with the marker `\n[truncated: <total> characters]`, `<total>` being its length in characters before cutting. Open Question 31 records that whether the marker counts toward the 4096 characters is not fixed here.

- **REQ-HOOKS-067** — The bytes written to standard input SHALL form one valid JSON document and nothing else, and decoding it SHALL reproduce exactly the structure described in REQ-HOOKS-057 to REQ-HOOKS-066. Characters outside ASCII are carried as UTF-8. A Windows path such as `C:\repo\src` is escaped on the wire and decodes back to one backslash per separator. A hook that reads standard input to end-of-input, decodes UTF-8, and parses the result as JSON therefore recovers the payload unchanged, with no framing, length prefix, or second document to strip first. Open Question 28 records that whether a single trailing newline may follow the object is not fixed here.

### Tool-Dispatch Integration

- **REQ-HOOKS-068** — Tool hooks SHALL sit entirely within the branch the permission engine takes for permitted calls: only a permitted call reaches hook dispatch, and a denied call gets the permission system's own refusal with no hook process started. It follows that a `pre_tool` hook whose matcher targets something the built-in policy always denies (for example destructive commands rejected in every mode) will never fire; hooks cover the cases the policy leaves open.

- **REQ-HOOKS-069** — Hooks SHALL be attached per session and looked up per call: changing a session's attached hook set takes effect on the very next call, and a session with nothing attached dispatches exactly as though the feature were absent (one lookup and nothing more, with no extra content added to results). Attaching under an empty session identifier SHALL be rejected with an error; looking up an empty or unknown identifier yields nothing; detaching an unknown identifier does nothing and is not an error; attaching again replaces the previous set entirely.

- **REQ-HOOKS-070** — Sessions SHALL be isolated from one another: hooks attached to one session never fire for another session's tool calls, and there is no fallback to some other session's set. A tool call belonging to no session runs no hooks.

- **REQ-HOOKS-071** — A `pre_tool` stop SHALL reach the agent as an error result bearing the same call correlation id and tool name as the attempted call, containing the refusal text unchanged, delivered on the tool-result channel so the agent can choose another approach. The tool itself is never invoked for a stopped call.

- **REQ-HOOKS-072** — Stopping a call SHALL count as one refused tool invocation and nothing more: the run's terminal status is untouched by it, and the agent goes on to its next piece of work.

- **REQ-HOOKS-073** — The dispatcher SHALL consult hooks only for the events the session has actually declared hooks for: a session declaring only `post_tool` hooks incurs no cost at `pre_tool`.

- **REQ-HOOKS-074** — `post_tool` feedback SHALL travel in the same correlated result message that carries whatever the tool itself returned, so that no additional content is placed between an assistant's tool-call block and the corresponding results — an arrangement some model providers reject when several calls are issued together. Where the call produced no observation (the tool errored), the feedback SHALL instead be delivered as a following user-role message so that it is not dropped.

### Lifecycle Event Delivery

- **REQ-HOOKS-075** — Lifecycle payloads SHALL carry these data fields beside the three base keys of REQ-HOOKS-058. A string field whose value is absent SHALL be rendered as `""`; a string field holding a value of an unexpected type SHALL be converted to text, and where that conversion fails the field SHALL be `""`. An `iteration` that is not a whole number SHALL be reported as `0` (REQ-HOOKS-077). No field value can cause payload construction to fail.
  - `session_start`: `task` (string) — the run's own statement of the task, which need not repeat the user's prompt word for word.
  - `session_end`: `status` (string) — the run's terminal status, or `""` where no status could be derived, which consumers SHALL read as *unknown* and not as failure.
  - `child_completed`: `child_id`, `child_name`, `persona`, `state`, `status`, `summary` (all strings).
  - `verifier_finished`: `iteration` (integer), `executed` (boolean), `passed` (boolean), `skip_reason` (string), `failed_checks` (array of strings — the names of the failed checks that block).
  - `iteration_end`: `iteration` (integer), `outcome` (string), `child_name` (string), `status` (string), `summary` (string).

  Open Question 22 records that the permitted values of `status`, `state`, and `outcome` are not enumerated anywhere in this document; Open Question 32 records that the fallback for an absent or unconvertible `executed` or `passed` is not fixed here.

- **REQ-HOOKS-076** — Each lifecycle occurrence SHALL fire each attached hook exactly once. In a run in which all five events occur once, the order is `session_start`, `child_completed`, `verifier_finished`, `iteration_end`, `session_end`, matching where each occurs.

- **REQ-HOOKS-077** — Iteration numbers in `iteration_end` payloads SHALL begin at 1 for the first completed iteration and follow the loop from there (iterations 1, 2, 7 report 1, 2, 7, never a fixed 0). An iteration value that is not a whole number is reported as 0.

- **REQ-HOOKS-078** — Given a run with no hooks for a lifecycle event, no payload SHALL be assembled and no process started for occurrences of that event.

- **REQ-HOOKS-079** — A lifecycle occurrence SHALL always complete. A hook that cannot be executed SHALL yield the matching warning of REQ-HOOKS-052; data the payload cannot render SHALL be substituted per REQ-HOOKS-063 with no warning at all; any other fault raised while delivering the event SHALL reduce to a log entry. In each case the occurrence's remaining hooks still run, the run continues to its next step, its terminal status is unaffected, and no error reaches the agent. No such condition SHALL hold the run beyond the per-hook bound of REQ-HOOKS-033.

- **REQ-HOOKS-080** — Lifecycle hooks SHALL run in line with the run loop: a hook that consumes its whole budget holds the run up for that long, and `timeout_seconds` is the user's means of controlling this. Ordering guarantees: the `iteration_end` hook for iteration N finishes before iteration N+1 begins, and a `session_end` hook is guaranteed to run before shutdown.

- **REQ-HOOKS-081** — `session_start` SHALL fire ahead of the first iteration; `session_end` SHALL fire once per run on every exit path, after the final status has been decided. The status string SHALL be derived once per run and used for both destinations, so the value a `session_end` hook reads on standard input is character-for-character the value carried by the session-end wire event; the two can never disagree about how the run ended, and both carry `""` where the status could not be derived.

- **REQ-HOOKS-082** — `iteration_end` hooks SHALL finish before that iteration's checkpoint is taken, so that any edit such a hook makes to the working tree — reformatting sources, emitting a build artifact — is captured by that iteration's checkpoint rather than the next one's.

### Run Wiring, Notices, Teardown

- **REQ-HOOKS-083** — A hook declared in the layered YAML configuration SHALL execute only where the trust gate permitted it, on every host alike — desktop, headless, and programmatic embedding: a run's native hook set starts from the gate's permitted output, never from the raw resolved configuration, and the policy toggles of REQ-HOOKS-116 then remove any native hook switched off there. Hooks imported from an external agent are outside this gate's remit and are governed instead by the toggles of REQ-HOOKS-115 to REQ-HOOKS-117.

- **REQ-HOOKS-084** — The trust decision SHALL be looked up against the base workspace — the repository the user opened and reviewed — even when the run itself executes inside a throwaway isolated worktree; the hook processes still start in whichever tree the run is changing.

- **REQ-HOOKS-085** — A failure to assemble the run's hook set at start-up SHALL NOT end the run: the run continues with no hooks and logs a warning (`Could not resolve this run's hooks; continuing without them.`).

- **REQ-HOOKS-086** — Where the trust gate withheld hooks, the notice SHALL be recorded in two places: as an issue in the session's diagnostics with kind `hook_trust`, severity `warning`, actor `hooks`, and metadata carrying `blocked` (how many were withheld), `restored` (how many were reinstated per REQ-HOOKS-098) and `workspace` (the path the trust decision was looked up against, as a string), so that hosts with no user present can find it afterwards; and, where the host offers a notice channel, as text on that channel. Headless runs print the notice to the console so that hooks withheld on purpose can be told apart from hooks that are broken.

- **REQ-HOOKS-087** — At the end of a run, on both the success and failure paths: any switched-off-hook advisory is sent to the host's notice channel, and the session's hook attachment is removed, so that an attachment left behind cannot cause one run's hooks to fire for a later run started inside the same process.

- **REQ-HOOKS-088** — A run in which nothing was withheld and nothing was switched off SHALL produce no hook notices at all.

- **REQ-HOOKS-089** — Desktop and headless runs SHALL share one execution lifecycle: in a desktop run an `iteration_end` hook from an approved workspace demonstrably executes, and one from an unapproved workspace demonstrably does not, accompanied by a warning notice whose text contains "not been reviewed" and never contains the repository's command text.

### Workspace Trust Gate

- **REQ-HOOKS-090** — The gate SHALL decide on the declared provenance of a hook and SHALL NOT judge what its command does: no command is inspected for apparent danger, and no such inspection may be relied on to withhold anything. (Comparing the fingerprint of REQ-HOOKS-091, which covers command text, detects change to the declared set; it is not a judgement about the command.) For hooks resolved from the layered YAML configuration the rules are: a `global` or `default` hook is always permitted; a `workspace` hook is permitted only while a stored approval exists whose fingerprint equals the fingerprint of the current workspace hook set (REQ-HOOKS-091); an entry carrying no scope tag resolves as `default` before the gate is applied (REQ-HOOKS-014, REQ-HOOKS-016) and is therefore permitted; a hook carrying any other scope value is withheld, with no permissive branch for an unfamiliar value. Declaration order SHALL be preserved within the permitted group and within the withheld group. Hooks imported from an external agent carry scope `external:claude-code` and do not reach this gate at all (REQ-HOOKS-117), so this scope vocabulary says nothing about whether they run.

- **REQ-HOOKS-091** — The workspace hook fingerprint SHALL be the SHA-256 digest, rendered as 64 lowercase hexadecimal characters, of the canonical JSON document `{"version": 1, "hooks": [ {command, event, matcher, name, required, timeout_seconds}, ... ]}` — keys sorted, compact separators, ASCII-escaped — built from the workspace-scoped entries in declaration order. Observable consequences: computing the digest repeatedly over the same set yields the same 64 characters every time; the digest changes when any `command`, `event`, `matcher` (a matcher widened to empty included), `name`, `required`, or `timeout_seconds` changes, and when an entry is added, removed, or moved; it does not change when a `global` or `default` hook is edited; a workspace declaring no hooks yields the digest of the empty list, which equals the digest computed where only always-trusted-scope hooks are present and differs from that of every non-empty workspace set. `enabled` and `source` are not part of the document, so toggling `enabled` alone leaves the digest unchanged. `version` is part of the document, so raising it invalidates every stored decision. Open Question 23 records whether entries with `enabled: false` belong in the fingerprinted list, and how that squares with REQ-HOOKS-093.

- **REQ-HOOKS-092** — The first encounter with an unapproved workspace that declares hooks SHALL withhold those hooks and make a review request pending, carrying the fully resolved absolute workspace path with symbolic links followed, the fingerprint of the pending set, and exactly the workspace-declared hooks in declaration order. No review is pending when the workspace declares no hooks, or when a stored decision — approval or rejection — already covers the current set.

- **REQ-HOOKS-093** — Decision lifecycle:
  - Approving lets the workspace hooks run on later loads and clears the pending review.
  - Any change to the workspace hook set (rewriting, adding, removing, reordering) invalidates the decision: the hooks are withheld again and a fresh review with a new fingerprint becomes pending. An approval granted for one set therefore confers nothing on a command that has since been altered, nor on an entry added beside it.
  - A rejection persists: it is stored, it keeps withholding, and the user is not asked again while the set is unchanged; the question returns once the hooks change.
  - Clearing the decision re-applies the gate immediately; clearing when none is stored is harmless (a file that is not there is treated as success), while a removal that fails for any other reason SHALL surface as an error — an approval that survives an attempted revocation would keep letting hooks run.

- **REQ-HOOKS-094** — Reading a stored decision SHALL default to "not approved" and SHALL never fail outright: a missing file or state directory, unparsable JSON, a truncated file, JSON whose top level is the wrong type, an empty object, a missing fingerprint, a fingerprint that is not 64 hex characters, a `trusted` value that is not strictly a boolean (a number or a string is never taken as consent), a decision timestamp that cannot be parsed, an unrecognized version, or finding a directory at the path the file was expected at — each of these reads as "no decision", hence not approved. A decision timestamp with no timezone is taken as UTC.

- **REQ-HOOKS-095** — A decision recorded against one hook set SHALL NOT carry over to a different one: where the stored fingerprint and the computed fingerprint differ, the hooks are withheld. Transplanting a `.rotaris/` state directory from a checkout whose hooks were approved into a checkout whose hooks are different therefore confers no permission on the latter.

- **REQ-HOOKS-096** — Writing a decision SHALL: check the shape of the fingerprint first (reporting `Not a hook-set digest: ...` and writing nothing if it is malformed); create the `.rotaris` directory if it is absent; write the file atomically; and report any write failure rather than absorb it — a caller that wrongly believed a rejection had been persisted would go on invoking the very hooks the user declined.

- **REQ-HOOKS-097** — The workspace SHALL be reduced to an absolute path with symbolic links followed before the decision file is located, so an approval granted under an absolute path still applies when the same workspace is later referred to as `.`. The set permitted to run SHALL be exactly the in-memory sequence that was fingerprinted, with no reload between fingerprinting and permitting. The disk is consulted only when that sequence actually contains workspace hooks.

### Scope Fallback on Refusal

- **REQ-HOOKS-098** — Substitution of one scope's list for another's SHALL apply only among trusted scopes. Where workspace hooks were withheld, the global and default entries that their list had displaced SHALL be put back into the permitted set — but only entries whose own scope is always trusted, so that a displaced workspace-scoped list cannot regain execution by way of this fallback. An entry whose id is already permitted is not added a second time. The gate's result exposes the permitted set (originally permitted, then reinstated, in declaration order), the withheld set, the reinstated set, and a notice string.

- **REQ-HOOKS-099** — Reinstatement follows from withholding and is not a lasting merge: once the user approves the workspace list, it substitutes for the inherited one in full (withheld and reinstated sets both empty, notice empty).

- **REQ-HOOKS-100** — End-to-end guarantee: given an unapproved workspace whose hook list is hostile, no process is started for the repository's hook; a `pre_tool` guard declared in global scope still stops the command it was written to stop; a `session_end` hook declared in global scope still fires; and the notice the user sees names neither, giving only how many were withheld and which configuration file declared them.

### Untrusted-Hooks Notice Hygiene

- **REQ-HOOKS-101** — The withheld-hooks notice SHALL be the empty string when nothing was withheld; otherwise exactly: `Skipped <N> hook(s) declared by this workspace's .rotaris/agents.yaml: workspace hooks run shell commands and this workspace has not been reviewed and trusted yet. Review the hooks in Rotaris to allow them to run.` — with singular and plural forms used correctly ("1 hook", never "1 hooks"). Where reinstatement returned the user's own hooks, the notice gains: ` Your own <M> configured hook(s) still run(s).` (singular/plural on both the noun and the verb).

- **REQ-HOOKS-102** — Notices and diagnostics about withheld hooks SHALL disclose only how many hooks were withheld and the path of the configuration file that declared them (plus the counts and workspace path of REQ-HOOKS-086). The `name` and the `command` of a withheld workspace hook SHALL appear on none of these surfaces: the notice text, console output, `issues.json`, `timeline.jsonl`, and the session event stream. Given an entry whose `name` embeds an ANSI escape sequence that clears the terminal and whose `command` pipes a download into a shell, no escape byte, no fragment of that command, and no host name taken from it SHALL be present in any of them. The review dialog of REQ-HOOKS-106, which the user opens deliberately, is the only surface on which that text is displayed. Open Question 33 records the conflict between this rule and the `hook_name` field that REQ-HOOKS-123 and REQ-HOOKS-126 place on a withheld hook's `hook.finish`.

### Desktop Settings and Review Dialog

- **REQ-HOOKS-103** — The hooks settings tab SHALL present a tree table whose accessible name is `Lifecycle hooks`, holding one top-level row per owning agent — `Rotaris` for this product's own hooks and `Claude Code` for imported ones, corresponding to the agent ids `rotaris` and `claude-code` of REQ-HOOKS-115 — with that agent's hooks as child rows. Each hook row SHALL show, in this column order: name, event, matcher — rendered as `every matching call` where the matcher is empty — source, and status. The status column SHALL carry exactly one of `inactive`, `disabled by agent`, `disabled`, `blocked — not reviewed`, `active`. A workspace hook the trust gate withheld SHALL show `blocked — not reviewed`, and SHALL show `active` once the workspace is approved and nothing else suppresses it. Open Question 24 records that the conditions selecting `inactive`, `disabled by agent`, and `disabled` are not stated in this document.

- **REQ-HOOKS-104** — The tab SHALL offer a "Review workspace hooks" button that opens the review dialog, together with a summary label describing the current decision ("not been reviewed" before any decision; "will not run" after a rejection) and a notice pointing at the pending review (its title contains "unreviewed"); the dialog never opens on its own. Command text SHALL NOT appear anywhere else in the window — not in the table, in tooltips, in notices, or in accessible descriptions.

- **REQ-HOOKS-105** — The trust summary the settings surfaces work from SHALL report, for the workspace it was asked about: the workspace path; a status drawn from `none`, `review`, `trusted`, `refused`; the current workspace fingerprint (REQ-HOOKS-091); one entry per hook stating whether the gate permitted or withheld it; the workspace-declared hooks awaiting review; and the trust notice text of REQ-HOOKS-101. The status SHALL be `none` where the workspace declares no hooks, `review` where it declares hooks no stored decision covers, `trusted` where a stored approval matches the current fingerprint, and `refused` where a stored rejection matches it. Hooks reinstated under REQ-HOOKS-098 SHALL be reported as permitted even though the workspace's own list had displaced them, so that the summary describes what will actually run. Hook text in the summary SHALL be masked per REQ-HOOKS-133. A configuration that cannot be read SHALL yield a summary carrying no hook entries rather than an error. Open Question 34 records that the status reported in that case is not fixed here.

- **REQ-HOOKS-106** — The review dialog SHALL be modal, SHALL be titled `Review this workspace's hooks`, and SHALL be at least 620×440 in size. It SHALL state the workspace path; SHALL state the count in the form `declares N hook(s) in .rotaris/agents.yaml`; and SHALL state that the entries are shell commands supplied by the repository's authors that will run on this machine under the user's own account. Each hook SHALL be rendered read-only in a fixed-width block carrying its name, its event, `matches` followed by the matcher (or `every tool call` where the matcher is empty), `timeout <n>s` annotated `(blocks the tool call on failure)` where `required` is true and `(advisory)` otherwise, and the command exactly as written — no re-wrapping, escaping, abbreviation, or styling that would let the displayed text differ from the text that will execute. This dialog SHALL be the only surface in the product that displays a hook command (REQ-HOOKS-102). Open Question 35 records that the units of the 620×440 minimum, and whether `declares N hook(s)` inflects at `N` of 1, are not fixed here.

- **REQ-HOOKS-107** — Dialog buttons SHALL be "Do not run these hooks" (reject role, the default, holding initial focus and activated by Enter) and "Allow these hooks" (styled to signal risk, requiring an explicit click), each with an accessible description of what it will do. Leaving without choosing counts as rejection: Escape, the window close control, and any other dismissal all resolve as not approved. However the dialog is left, it SHALL report its decision once and only once — the first exit path taken is the one that reports. A failure to write the decision is shown as an error label in the dialog rather than passing unnoticed.

- **REQ-HOOKS-108** — Whole-flow guarantees: rejecting writes `trusted: false` to the workspace decision file and does not ask again on reload; approving writes `trusted: true`, the tab moves the row to `active`, and the summary status becomes `trusted`.

- **REQ-HOOKS-109** — Agent rows and hook rows in the tab SHALL carry checkboxes; clearing one is saved to the global external-hooks policy file, persists across a refresh of the tab, and never alters the external agent's own settings file.

### External-Agent Hook Import (Claude Code)

- **REQ-HOOKS-110** — Discovery SHALL read the user-level Claude Code settings JSON — by default `~/.claude/settings.json`, which the environment variable `ROTARIS_CLAUDE_SETTINGS_PATH` can point elsewhere — and SHALL only ever read it (the file is byte-for-byte unchanged after any toggling in the interface). A problem reading it yields no records plus one of: `Claude Code global settings were not found.` / `Claude Code hooks could not be read: <err>` / `Claude Code global settings contain no hook declarations.`

- **REQ-HOOKS-111** — Event mapping SHALL be: `PreToolUse` → `pre_tool`, `PostToolUse` → `post_tool`, `SessionStart` → `session_start`, `SessionEnd` → `session_end`, `SubagentStop` → `child_completed`. Any other external event produces a record marked unusable with the explanation `The Claude Code <event> lifecycle event has no Rotaris equivalent.`

- **REQ-HOOKS-112** — Tool-matcher mapping (for the two tool events only): empty or `*` selects all tools; otherwise the matcher is split at `|` and `,` into selectors, each selector is mapped to a set of this product's tool names — `Bash` → {`terminal`}, `PowerShell` → {`terminal`}, `Read` → {`read_file`, `haet_read`}, `Edit` → {`haet_edit`}, `Write` → {`write_file`} — and the union of those sets becomes the imported hook's set of tool names (matched exactly, per REQ-HOOKS-023). Surrounding whitespace on a selector is ignored, and an empty selector between two delimiters contributes nothing. A matcher containing any regular-expression metacharacter (`^ $ . * + ? [ ] ( ) { } \`) is unusable (`Regular-expression matchers are unavailable in Rotaris.`), as is a selector that is not recognized (`Claude Code tool selector '<x>' has no Rotaris equivalent.`).

- **REQ-HOOKS-113** — Every unusable record SHALL remain visible with its explanation rather than being dropped silently. Further explanations: a handler that is not a command handler (`<type> handlers are unavailable in Rotaris.`), a blank command (`The command handler has no command.`), an `if` predicate (`` Claude Code `if` predicates require tool arguments that Rotaris does not expose here. ``), a timeout that cannot be parsed (`The command handler timeout is invalid.`), and a timeout of zero or less (`The command handler timeout must be positive.`).

- **REQ-HOOKS-114** — A usable record SHALL become an effective hook with: display name `Claude Code <event>`, `<event>` being the external event name; the event it maps to under REQ-HOOKS-111; an empty matcher string; the command exactly as declared externally; the handler's timeout in seconds, or `60` where the handler declares none; `required = false`; scope `external:claude-code`; the set of tool names derived under REQ-HOOKS-112; and a stable identity `claude-code:` followed by 20 hexadecimal characters taken from a SHA-256 digest over the record's identifying facets — agent id, source path, event, external matcher, the handler's canonical JSON, the index of the handler group, and the index of the handler within that group. Observable consequences: rediscovering the same unchanged file yields the same identity every time; changing any one of those facets yields a different identity; and two otherwise identical handlers at different positions in the file have different identities. Open Question 25 records that the exact input serialization fed to the digest, and which 20 characters of the digest are taken and in which letter case, are not fixed here.

- **REQ-HOOKS-115** — The global runtime policy SHALL live at `<config-dir>/external-hooks.json`, where `<config-dir>` is the value of the environment variable `ROTARIS_CONFIG_DIR` when that variable is set to a non-blank value (leading and trailing whitespace ignored, `~` expanded) and otherwise `~/.config/rotaris` on every platform. It is stored as JSON `{"version": 1, "agents": {<agent-id>: bool}, "hooks": {<record-id>: bool}}`, with keys sorted, two-space indentation, and an atomic write. A policy file that cannot be read or does not parse loads as empty, meaning everything is on. Any agent or hook not mentioned defaults to on. A hook is on when both its agent toggle and its own toggle are on, so switching an individual hook off survives switching its whole agent off and on again.

- **REQ-HOOKS-116** — The same policy file SHALL also govern this product's own hooks, which are grouped under the agent id `rotaris` (imported ones under `claude-code`): a native hook is skipped when either the `rotaris` agent toggle or an entry under its own stable id is `false`. The run's hook set is assembled as the surviving native, trust-gated hooks in declaration order, followed by the enabled imported hooks.

- **REQ-HOOKS-117** — At run time, only records that are usable and switched on execute; an imported hook that is selected runs through the ordinary engine and receives the native payload shape, while one that is switched off never starts a process. The workspace trust gate does not apply to imported hooks — the settings toggles are how the user consents to them — and their scope value would in any case be withheld as unrecognized if it ever reached the gate.

### Persistence, Audit, Diagnostics

- **REQ-HOOKS-118** — A snapshot of the effective hook set SHALL be written once at session start to `state/run_config.json` in the session directory, as `"hooks": [ {hook_id, name, event, matcher, source, command}, ... ]` covering the enabled resolved set, with each command stored masked, because a hook command line often contains a credential and this file is readable by anyone who can look inside the session directory. Editing the configuration afterwards cannot alter this record. A run with hooks switched off, or with none at all, records an explicit empty list, so that an auditor can distinguish "there were no hooks" from "this was not recorded"; entries that are switched off do not appear.

- **REQ-HOOKS-119** — Every completed invocation SHALL append one `hook_run` entry to the session's `timeline.jsonl`: `severity` = `warning` where the outcome carried a warning and `info` otherwise; `actor` = the hook's display name; `message` = `Hook '<name>' (<event>) exited <exit_code> in <duration_ms> ms` (with `<exit_code>` rendered as `-1` where the hook produced no exit status, per REQ-HOOKS-036); `metadata` = `{hook_id, hook_name, event, source, exit_code, duration_ms, timed_out, blocked}` — `exit_code` here likewise carries `-1`, not `null`, for that state — plus `tool_name` where there is one and `stdout` / `stderr` only where non-empty (already limited to 16 KiB each). Entries appear in the order the invocations happened.

- **REQ-HOOKS-120** — Every outcome carrying a warning SHALL additionally record an issue in the session's `issues.json`: kind `hook_failure`, severity `warning`, actor = hook name, message = the warning text, with the same metadata. A guard that legitimately stopped a call records nothing. Hooks withheld by the gate are recorded under kind `hook_trust` (REQ-HOOKS-086).

- **REQ-HOOKS-121** — The durable diagnostics entry SHALL be written before the corresponding completion event is published, so that an event lost on the stream does not also take the evidence of the invocation with it. Where the diagnostics directory cannot be written to, the entry degrades to a log line instead: the trail is kept wherever keeping it is possible, and its loss never interferes with the run.

- **REQ-HOOKS-122** — Hook processes SHALL be exempt from the tool permission policy and from any sandbox: they are the user's own code, executing directly on the host. Nothing else in the system observes them, so the diagnostics written under REQ-HOOKS-118 to REQ-HOOKS-121 are the sole evidence that a hook executed at all — which is what those requirements exist to guarantee.

### Wire Events

- **REQ-HOOKS-123** — Two event types SHALL exist on the session event stream: `hook.start` and `hook.finish`, both carrying `hook_id`, `hook_name`, `lifecycle_point` (the hook event name), `scope` (the configuration source), and `tool_name` (empty for lifecycle hooks).

- **REQ-HOOKS-124** — `hook.start` SHALL additionally carry `command`, holding the configured command with the masking of REQ-HOOKS-061 applied; an unmasked hook command line SHALL never appear on the stream. For every invocation the `hook.start` SHALL become observable before that invocation's `hook.finish` and before any effect the hook process has, so that a consumer reading the stream while a hook is still occupying its budget sees the `hook.start` with no `hook.finish` yet paired to it. `hook.start` has no counterpart in the durable diagnostics, which record completed invocations only (REQ-HOOKS-119).

- **REQ-HOOKS-125** — `hook.finish` SHALL carry `exit_code` (integer or `null`, with the no-exit-status state always appearing as `null` here), `duration_ms` (number or `null`), `blocked` (which can be true only for `pre_tool`), `timed_out`, `skipped`, `skip_reason`, and `output` = standard output and standard error, each trimmed and each limited to 16 KiB, joined with `\n` and masked as part of constructing the event; they are joined because a refusal reason arrives on standard error while ordinary output arrives on standard output.

- **REQ-HOOKS-126** — A hook the trust gate withheld SHALL produce only a `hook.finish`, with `skipped = true`, `skip_reason = "untrusted_workspace"` (the only defined reason), and null `exit_code` and `duration_ms`; no process existed, so no `hook.start` accompanies it. The reason for emitting anything at all is that a configured hook absent from the stream could not be told apart from one that ran and had no effect.

- **REQ-HOOKS-127** — Each hook the trust gate withheld SHALL be announced exactly once per session as one `hook.finish` of the shape given in REQ-HOOKS-126, however many tool calls and lifecycle points follow in that session and however many times the announcement is triggered. The announcement SHALL be observable no later than the session's first hook-related event, so a consumer attached from the start of the session sees every withheld hook before the first `hook.start`. Triggering the announcement again SHALL add no further events to the stream.

- **REQ-HOOKS-128** — Publishing to the stream SHALL be attempted but not depended upon, and SHALL be isolated from the rest: a broken stream or an event that cannot be constructed reduces to a log entry and never causes a hook to be skipped, to fail, or to run twice. The error path for a withheld-hook publication logs the hook id only and never the command, which at that point is still an unmasked shell command line.

### Cross-Cutting Invariants

- **REQ-HOOKS-129** — No hook-related condition SHALL end a run, alter its terminal status, or leave it waiting beyond the per-hook bound of REQ-HOOKS-033. Anything that goes wrong while executing a hook, building a payload, publishing a wire event, or emitting a notice SHALL reduce to a user-facing warning where REQ-HOOKS-052 defines one for it, and to a log entry in every other case; no other hook fault is surfaced to the user as a warning. The withheld-hooks notice (REQ-HOOKS-086, REQ-HOOKS-101), the switched-off advisory (REQ-HOOKS-054), and the start-up message of REQ-HOOKS-085 are notices about configuration rather than execution faults and are unaffected by this rule. The only hook outcome that changes what the run does is a `pre_tool` hook's stopping verdict (REQ-HOOKS-043, REQ-HOOKS-048), which refuses one tool call and nothing further (REQ-HOOKS-072).

- **REQ-HOOKS-130** — Every hook actually invoked for an event occurrence SHALL produce exactly one outcome, exactly one `hook_run` timeline entry, and exactly one `hook.start`/`hook.finish` pair: N occurrences of an event with one applicable hook produce N of each, never more and never fewer. Two cases produce fewer records by design: a hook the trust gate withheld produces exactly one `hook.finish` and nothing else — no outcome, no timeline entry, no `hook.start` (REQ-HOOKS-126); and a hook switched off by the failure budget produces none of them for occurrences after the switch-off (REQ-HOOKS-055). Records may also be absent where the durable trail could not be written (REQ-HOOKS-121) or the stream could not be published to (REQ-HOOKS-128); neither loss changes how many times the hook actually ran.

- **REQ-HOOKS-131** — The hook set resolved for a run SHALL be fixed when the run starts: configuration edited on disk while the run is under way SHALL NOT change which hooks run, nor the snapshot of REQ-HOOKS-118, nor the fingerprint the trust decision was checked against. Two within-session changes are defined, and both replace or remove whole entries rather than editing one: a session's attachment may be replaced in full, taking effect from the next tool call (REQ-HOOKS-069), and a hook may be switched off for the remainder of the session by the failure budget (REQ-HOOKS-055). Open Question 36 records whether a change to the external-hooks policy file (REQ-HOOKS-115, REQ-HOOKS-116) made while a run is under way affects that run.

- **REQ-HOOKS-132** — The stable hook id SHALL be unique within one loaded configuration, SHALL be unaffected by neighbouring entries being switched off, and SHALL be the key that links warnings, diagnostics files, wire events, the switched-off set, the desktop policy toggles, and the start-up snapshot to one another.

- **REQ-HOOKS-133** — Text drawn from configuration or from tool arguments SHALL be masked per REQ-HOOKS-061 and REQ-HOOKS-062 wherever it is carried. The channels that carry such text are exactly these five: the JSON payload on a hook's standard input, at every level of it (REQ-HOOKS-060); the `command` recorded for each hook in `state/run_config.json` (REQ-HOOKS-118); the `command` field of `hook.start` (REQ-HOOKS-124); the `output` field of `hook.finish` (REQ-HOOKS-125); and the hook data reported by the desktop trust summary (REQ-HOOKS-105). It follows that, given a hook whose command contains `--token ghp_example` and a tool argument containing `api_key=secretvalue`, neither `ghp_example` nor `secretvalue` SHALL appear in the payload the hook reads, in `state/run_config.json`, or in any event on the session stream. Open Question 26 records that whether the `stdout` and `stderr` recorded in `timeline.jsonl` (REQ-HOOKS-119) are masked is not stated.

- **REQ-HOOKS-134** — Directions of failure are fixed: reading a trust decision defaults to "not approved" when anything is wrong; failing to write a trust decision is reported rather than absorbed, since an absorbed rejection would leave hooks running; and a hook that fails to execute lets the agent carry on (warning, then proceed) — except a `required` pre-tool hook that returned no verdict, which stops the call.

### Performance Contracts

- **REQ-HOOKS-135** — Validating hook configuration (REQ-HOOKS-012), resolving the effective hook set (REQ-HOOKS-013 to REQ-HOOKS-018), computing a workspace fingerprint (REQ-HOOKS-091), and building a payload (REQ-HOOKS-063) SHALL each be possible with no run under way, and doing any of them SHALL leave every run untouched: no hook process is started, no wire event is published, no session diagnostics are written, and no run's hook set changes. Taken with REQ-HOOKS-041, REQ-HOOKS-073, and REQ-HOOKS-078, this bounds what a run does on account of hooks: a session with no hooks starts no process and writes no hook record for any event, and a session declaring hooks for one event builds payloads for that event alone. Open Question 7 records that this document fixes no numeric performance bound.

## Data & Formats

### Configuration (YAML)

Declared under `hooks:` in `agents.yaml` at either scope. Both spellings are equivalent:

```yaml
hooks:
  enabled: true            # feature on/off, default true
  entries:
    - event: pre_tool      # one of the seven event names
      command: "./check.sh"
      name: "Guard"        # optional display label
      matcher: "git push *" # optional; empty = every occurrence
      timeout_seconds: 60.0 # > 0; default 60.0
      required: false
      enabled: true
```

```yaml
hooks:                     # list shorthand
  - event: session_end
    command: "notify-send done"
```

Scopes: built-in defaults, then `agents.yaml` in the per-user configuration directory (global), then `<workspace>/.rotaris/agents.yaml` (workspace). Directories left behind by the product's former name are adopted once by renaming — a per-user `geraet-ai` directory to the current per-user directory, and a workspace's `.geraet-ai` to `.rotaris` — and only where the current path does not already exist. A rename that fails is not fatal: the legacy directory stays in use and a warning is logged.

### Hook stdin payload (JSON, UTF-8, one object)

Tool events:

```json
{
  "event": "pre_tool",
  "tool_name": "terminal",
  "arguments": { "command": "git push origin main", "token": "***" },
  "session_id": "<id>",
  "workspace": "<absolute path>",
  "command": "git push origin main"
}
```

- `command` is `""` for tools with no shell command; for a file-editing tool the text matched against is the requested action name (`create`/`edit`/`overwrite`/`insert`/`undo`).
- Tools provided over MCP place their fields under `arguments.data`.
- `post_tool` adds `result`: `{"observation": "<text>"}` or `{"error": "<text>"}` (object or array; at most 4096 characters per text, with a truncation marker).

Lifecycle events: always `event`, `session_id`, `workspace`, plus that event's own top-level fields (REQ-HOOKS-075). Event data cannot replace those three base keys.

Every string at every level is masked with `***` per REQ-HOOKS-061/062.

### Trust decision file

`<workspace>/.rotaris/hook-trust.json` — a JSON object containing exactly:

```json
{
  "decided_at": "2026-08-29T12:00:00+00:00",
  "digest": "<64 lowercase hex chars>",
  "trusted": true,
  "version": 1
}
```

Written atomically with two-space indentation, sorted keys, and a trailing newline. `decided_at` is a timezone-aware UTC ISO-8601 value ending `+00:00`. Any file that is not exactly version 1 and correctly shaped reads as not approved.

The fingerprint is the SHA-256 hex digest of the canonical JSON `{"version": 1, "hooks": [ {command, event, matcher, name, required, timeout_seconds}, ... ]}` (keys sorted, compact separators, ASCII) covering the workspace-scoped entries in declaration order.

### External-hooks policy file

`<config-dir>/external-hooks.json`, where `<config-dir>` is `ROTARIS_CONFIG_DIR` when set to a non-blank value and `~/.config/rotaris` otherwise:

```json
{
  "agents": { "claude-code": true, "rotaris": true },
  "hooks": { "claude-code:<20 hex>": false, "workspace:0:pre_tool": false },
  "version": 1
}
```

Keys sorted, two-space indentation, trailing newline, atomic write; a missing or malformed file means everything on; ids not mentioned default to on; a hook runs when its agent and its own toggle are both on. Agent ids: `rotaris` for this product's own hooks, `claude-code` for imported ones.

### Session diagnostics

- `state/run_config.json`: `"hooks": [ {hook_id, name, event, matcher, source, command}, ... ]` — enabled set only, commands masked, explicit `[]` when there are none.
- `timeline.jsonl`: one `hook_run` line per completed invocation (fields per REQ-HOOKS-119). `exit_code` is `-1` where the hook produced no exit status.
- `issues.json`: `hook_failure` entries for outcomes carrying a warning; a `hook_trust` entry (metadata `blocked`, `restored`, `workspace`) when the gate withheld hooks.

### Wire events (session stream)

- `hook.start`: `hook_id`, `hook_name`, `lifecycle_point`, `scope`, `tool_name`, `command` (masked). Published before the process starts.
- `hook.finish`: the same identity fields plus `exit_code` (int|null), `duration_ms` (number|null), `blocked`, `timed_out`, `skipped`, `skip_reason` (`"untrusted_workspace"` is the only defined value), `output` (masked, standard output and standard error joined with `\n`).

### Environment variables

- `ROTARIS_CLAUDE_SETTINGS_PATH` — points at the external agent settings file (default `~/.claude/settings.json`).
- `ROTARIS_CONFIG_DIR` — points at the configuration directory used to locate `external-hooks.json`; when unset or blank that directory is `~/.config/rotaris`.

## Open Questions

1. REQ-HOOKS-033 requires termination to reach the launched process and not its process group. Is anything required of that process's descendants — must a descendant still attached to it stop, and is a detached descendant permitted to outlive the run? The requirement leaves the fate of descendants to the platform; is that deliberate?
2. REQ-HOOKS-033 bounds an invocation by the budget plus 5.0 s of grace. What behaviour is required where the host cannot terminate the process even after that grace period — must the run continue regardless of the still-running process, and must anything be reported to the user?
3. Are hook invocations required to appear on any interface activity feed? This document drives only the notice channel, logged warnings, the session diagnostics files, and the `hook.start` / `hook.finish` wire events; is that the complete set of surfaces, or must a hook execution also surface in a run's activity feed?
4. REQ-HOOKS-040 requires every applicable hook to run even after one has decided to stop the call, the first stopping outcome being the one that takes effect. Is the observable difference — the later hooks' side effects, their wire events, and their timeline entries — something users may rely on, or may an implementation stop dispatching once a hook has refused the call?
5. REQ-HOOKS-019 fixes declaration order for selection. Does the same order govern execution where several hooks are attached to one lifecycle (non-tool) event, and must each finish before the next starts, as REQ-HOOKS-080 requires of the run loop as a whole?
6. REQ-HOOKS-032 lets an embedding application supply per-run environment overrides for hook processes. Is any host required to offer this, and is there a user-facing way to configure such overrides, or is it available to embedders only?
7. No numeric performance bound for hooks is fixed anywhere in this document; REQ-HOOKS-135 states only the qualitative contract. Is a bound on the start-up cost of the hooks feature, or on per-call dispatch cost, required — and if so, what is it?
8. REQ-HOOKS-042 fixes the observable guarantees for tool calls outstanding at the same time. Is there a maximum number of simultaneous calls a session must support, and must those guarantees — one shared failure tally, one switch-off warning, one event pair per invocation — hold at every degree of concurrency?
9. REQ-HOOKS-061 lists the credential key names and value prefixes that must be recognized. Is that list exhaustive — is an implementation recognizing exactly those and nothing more conformant — or is it a floor that implementations are expected to extend?
10. This document specifies no way to grant or revoke workspace hook trust outside the desktop review dialog (REQ-HOOKS-104 to REQ-HOOKS-108). Must a headless or programmatic host be able to approve or revoke a workspace's hooks, and through what interface? As written, such a host can only ever withhold unapproved hooks.
11. REQ-HOOKS-012 gives literal message text for three of the four validation failures but none for a `timeout_seconds` of zero or less. What exact message must that failure produce?
12. REQ-HOOKS-012: where several entries are invalid at once, must loading report the first failure only, or all of them? The requirement fixes that no entry is silently dropped, but not how many errors surface.
13. REQ-HOOKS-025 fixes the meaning of `*` inside a pattern token. Are the other conventional glob constructs — `?` and character classes such as `[abc]` — also honoured, and are they usable in the trailing bare-`*` position? A pattern such as `git push -?` cannot be evaluated from the current text.
14. REQ-HOOKS-030: which interpreter runs a hook command on each platform (POSIX shell, `cmd.exe`, PowerShell)? Related, and separately unresolved: REQ-HOOKS-057 requires a `workspace` field in every payload while REQ-HOOKS-084 distinguishes the base workspace from the isolated worktree the process runs in — which of the two does `workspace` report?
15. REQ-HOOKS-037: is the 16384-byte limit applied to the raw bytes before decoding (which can split a multi-byte character at the cut) or to the decoded text? And does the `\n[truncated: ...]` marker count toward the limit or extend beyond it?
16. REQ-HOOKS-036 says the fixed no-exit-status value covers a launch failure and a termination on timeout, and warns against reading whatever a platform reports for a signalled process; REQ-HOOKS-039 requires a defined outcome for a hook ended by a signal it did not receive from the timeout path. Does such a hook report the fixed value (`-1` on the timeline, `null` on the stream) or the platform's raw code, and does it produce the "exited `<code>`" warning of REQ-HOOKS-052? These two readings are both defensible; which is canonical?
17. REQ-HOOKS-050 and REQ-HOOKS-052 both interpolate `<budget>` into user-visible text without fixing its numeric rendering (`0.3` or `0.30`, `60` or `60.0`). REQ-HOOKS-052 also leaves open whether the trailing `…` is counted within the 200-character excerpt limit or appended to it.
18. REQ-HOOKS-054 gives the advisory as `<N> hook(s) failed repeatedly and was/were switched off ...` while REQ-HOOKS-101 requires correct singular and plural forms in the withheld-hooks notice. Does the end-of-run advisory inflect for `<N>` of 1, or is `hook(s)` / `was/were` emitted literally?
19. REQ-HOOKS-061: for `key=value`, `key: value`, and `--flag value`, how far does the replaced value extend — to the next whitespace, to the end of the line, or to a closing quote? The answer decides what `--token abc def` and `password: a b` mask to.
20. REQ-HOOKS-062 requires the whole value under a credential-named key to become `***`, while REQ-HOOKS-060 requires masking to follow the payload's structure and leave surrounding shapes intact. Where a credential-named key holds a list or a mapping rather than a string, is the whole container replaced by `"***"`, or is it walked with each string inside it masked individually?
21. REQ-HOOKS-063: at what level does the 12-level depth count begin — is the top-level payload object level 0 or level 1? And what exact text represents not-a-number and positive and negative infinity in the payload?
22. REQ-HOOKS-075 makes `session_end.status`, `child_completed.state`, `child_completed.status`, and `iteration_end.outcome` strings a hook script may branch on, but no vocabulary for them is stated anywhere in this document. REQ-HOOKS-003 names success, failure, a requested stop, cancellation, and interruption as the ways a run can end without saying those are the literal strings. What are the permitted values of each field?
23. REQ-HOOKS-091 fingerprints `command`, `event`, `matcher`, `name`, `required`, and `timeout_seconds` but not `enabled`, while REQ-HOOKS-093 says any change to the workspace hook set invalidates the decision. Are entries with `enabled: false` included in the fingerprinted list at all? If they are excluded, flipping `enabled` changes the digest and revokes the approval; if they are included, a disabled entry approved once can later be switched on without a fresh review. Which is canonical? The same question applies to the pending-review list of REQ-HOOKS-092.
24. REQ-HOOKS-103 fixes the status vocabulary and the two trust-related values, but not which condition produces `inactive`, which produces `disabled by agent`, and which produces `disabled`. Candidate sources are `hooks.enabled: false`, an entry's own `enabled: false`, the agent toggle of REQ-HOOKS-115, the per-hook toggle of REQ-HOOKS-115, and an unusable imported record (REQ-HOOKS-113) — the mapping is not stated.
25. REQ-HOOKS-114 names the facets fed to the imported-hook identity digest but not the byte sequence built from them, so identities are reproducible within one implementation and not necessarily comparable across implementations. Is cross-implementation stability of `claude-code:<20 hex>` required — for example so an `external-hooks.json` policy file remains valid across implementations?
26. REQ-HOOKS-133 lists the channels that must carry masked text and REQ-HOOKS-125 requires the `hook.finish` `output` field to be masked, but REQ-HOOKS-119 describes the `stdout` and `stderr` recorded in `timeline.jsonl` without saying whether masking applies. Are they masked?
27. REQ-HOOKS-025 splits both the pattern and each candidate segment into tokens "under shell quoting rules" without naming the convention. Are POSIX quoting rules used on every platform, or the host platform's own? The answer decides how a Windows candidate such as `copy C:\repo\a C:\repo\b` tokenizes, and whether a backslash in a pattern is an escape character or a literal.
28. REQ-HOOKS-031 requires exactly one JSON object on standard input and REQ-HOOKS-067 requires "one valid JSON document and nothing else". May a single trailing newline follow the object, or must the final byte be the closing brace? A hook comparing the raw bytes, rather than parsing them, can tell the difference.
29. REQ-HOOKS-052 gives the exact sentence `Hook '<name>' (<event>) exited <code>.` and then requires an excerpt of the hook's output to follow it "where either stream produced text", without fixing how the two are joined — a single space, a newline, a colon, or some other separator. What is the exact rendering?
30. REQ-HOOKS-061 states that credential key names are compared without regard to case and that the value prefixes of pass (4) are matched without regard to case, but says nothing about the scheme keywords of pass (3). Do `bearer`, `BASIC`, and `Token` trigger masking, or only the exact spellings `Bearer`, `Basic`, and `token`?
31. REQ-HOOKS-066 limits each `result` text to 4096 characters and appends `\n[truncated: <total> characters]` where the text was cut. Does that marker count toward the 4096 characters or extend beyond them? (Open Question 15 asks the same of REQ-HOOKS-037.)
32. REQ-HOOKS-075 declares `executed` and `passed` as booleans and `iteration` as an integer, while also requiring an absent or unconvertible value to be rendered as `""`. REQ-HOOKS-077 fixes `0` for a non-integral `iteration`, but nothing fixes the boolean case. What does a `verifier_finished` payload carry for `executed` or `passed` when the occurrence supplies neither — `false`, `""`, or an absent key — and may a field declared boolean ever hold a string?
33. REQ-HOOKS-123 requires every `hook.start` and `hook.finish` to carry `hook_name`, and REQ-HOOKS-126 requires a withheld hook to emit a `hook.finish`; REQ-HOOKS-102 requires that a withheld workspace hook's configured `name` never appear on the session event stream. Both readings are defensible. Does a withheld hook's `hook.finish` carry the configured display name, its stable id, or an empty string?
34. REQ-HOOKS-105 requires a configuration that cannot be read to yield a summary with no hook entries rather than an error, but does not say which of `none`, `review`, `trusted`, `refused` that summary reports — nor what the settings tab and the pending-review notice must show in that state. Which status applies?
35. REQ-HOOKS-106 requires the review dialog to be "at least 620×440 in size" without naming the unit (device pixels, logical pixels, or a toolkit unit), so the minimum cannot be tested as written. It also spells the count as `declares N hook(s)`: does that inflect at `N` of 1, as REQ-HOOKS-101 requires of the withheld-hooks notice? (Open Question 18 asks the same of REQ-HOOKS-054.)
36. REQ-HOOKS-131 fixes a run's hook set at run start, while REQ-HOOKS-117 describes the external-hooks toggles as consulted "at run time" and REQ-HOOKS-109 lets a user clear a checkbox at any moment. Does switching a hook or an agent off in the desktop settings affect a run already under way, or only runs started afterwards? Both readings are defensible; which is canonical?
