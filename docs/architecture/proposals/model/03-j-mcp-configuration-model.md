# Architecture proposals — MODEL slice — J. MCP configuration model

Part 3 of 8 of [the model proposal](../model.md), which indexes every part.

### J. MCP configuration model

- **J1 — HARD.** The server-entry schema is closed and singly defined — fifteen fields with stated
  types and defaults — and a document that presents, validates, stores, merges or documents an entry
  cites it rather than restating (`REQ-MCP-001`, with `enabled` behavior at `REQ-CONFIG-465`).
- **J2 — HARD.** Defects behave differently by source: a defect in a YAML-scope entry fails the
  configuration load and **every** defect is reported, not only the first; the same defect in an
  `mcp.json` entry drops that entry alone with a warning and never fails the load
  (`REQ-MCP-002`, `REQ-MCP-023`). Validation must therefore accumulate diagnostics and be
  parameterised by source severity.
- **J3 — HARD.** `request_timeout` is per call, measured from dispatch to receipt of result, uniform
  across that server's tools, does not govern discovery or probing, defaults to 300 seconds, and a
  zero/negative/non-whole value is rejected at load rather than treated as unset. Exhaustion yields
  a failed tool result the agent receives, a `failed` tool row, an open and still-usable connection,
  and a run that continues; the product does not retry (`REQ-MCP-003`).
- **J4 — HARD.** Name algebra: candidate spellings are the literal name **plus** the unprefixed
  remainder when the name begins `<server>_`, `mcp-<server>-` or `mcp__<server>__` — added, never
  substituted (`REQ-MCP-057`). Denial by `disabled_tools` outranks every grant (`REQ-MCP-004`,
  `REQ-MCP-056`). Renames apply only to survivors, leave descriptions unchanged, make the
  replacement the only callable name, and are matched **against the server-reported name only** for
  disable and grant purposes — "renaming is a presentation decision and never a permission decision"
  (`REQ-MCP-005`). Two collisions are configuration errors.
- **J5 — HARD.** The static `tools` list on an entry has no effect on what is advertised or callable
  (`REQ-MCP-006`) — it exists in the schema and is inert.
- **J6 — HARD.** Grant resolution has five named cases and cases (b) "no entry → everything" and (c)
  "empty list → nothing" must be **distinguishable in the resulting surface** (`REQ-MCP-055`). A
  representation that collapses "absent" and "empty" cannot produce this.
- **J7 — HARD.** Three shipped defaults with fixed names, transports, enablement and — for
  `web_search` — a 600-second timeout; only `code_intelligence` is enabled; no field beyond those
  named may be set on them (`REQ-MCP-010`, `REQ-CONFIG-181`). No `lsp` and no git-inspection server
  ships (`REQ-MCP-012`, `REQ-MCP-013`).
- **J8 — HARD.** Exactly one **code-intelligence binding manifest** is the single place the pinned
  runtime's identifiers are written — distribution id, pinned `MAJOR.MINOR.PATCH`, transport and
  mode arguments, launch subcommand, both project-selection options, marker file name, the three
  setup subcommands, the indexable extension list, and the four tiers' tool names plus three
  never-grant names. It is not user-editable, is not read at run time from any location a user can
  write, and does not vary by workspace (`REQ-MCP-116`). Build checks verify tier cardinalities
  (10/7/2/1), pairwise disjointness, absence of never-grant names, and that every name is reported
  by the pinned runtime's `tools/list`; a failing build must not ship (`REQ-MCP-015`,
  `REQ-MCP-011`, `REQ-MCP-095`).
- **J9 — HARD.** Merge order is defaults → discovered → global YAML → workspace YAML, field-wise for
  same-named entries, with a machine-maintained origin map recording `yaml | discovered-project |
  discovered-user | default` that is never user-settable (`REQ-MCP-025`, `REQ-MCP-026`,
  `REQ-MCP-008`).
- **J10 — HARD.** `mcp.json` files are consumed strictly read-only and must be **byte-for-byte
  identical** after any number of loads; an unrecognised key inside an entry is warned about at most
  once per (file, server, key) per load and does *not* skip the entry (`REQ-MCP-027`). Warning
  de-duplication is per load, not per process — a different scope than the once-per-process rules
  elsewhere in the domain (`REQ-MCP-041`, `REQ-MCP-048`, `REQ-MCP-058`). Discovery reads at most two
  files at fixed platform locations, skipping user-level discovery entirely when `APPDATA` is unset
  (`REQ-MCP-017`).
- **J11 — HARD.** Command resolution is an ordered rule set in which the reserved token
  `builtin:code-intelligence` is recognised **before every other rule** and is never looked up on
  PATH (`REQ-MCP-033`), path-like forms are never rewritten (`REQ-MCP-028`), a fixed 23-name
  known-executable set passes through (`REQ-MCP-029`), `uvx:` / `npm:` / `@scope` shorthands expand
  (`REQ-MCP-030`, `REQ-MCP-031`), and any other bare name passes through with no guessing
  (`REQ-MCP-032`).
- **J12 — HARD.** The normalized runtime description has an exactly-equal key set with `timeout`
  absent when `request_timeout` is unset, "so a consumer can compare the description's key set
  against this list exactly"; filtering, renaming and grants are applied *before* it is produced and
  are never expressed as keys; a remote entry is never PATH-checked while producing it; and **it is
  produced for every agent backend the product supports — a backend that cannot be given external
  tool servers is not a supported backend** (`REQ-MCP-043`).
- **J13 — HARD.** One ordering rule for every ordered presentation in the domain: ascending
  code-point order over the raw string, case-sensitive, locale-independent, identical on every
  platform (`REQ-MCP-117`). This forbids `String.prototype.localeCompare` and forbids `Intl`
  collation anywhere in this domain.

### K. MCP runtime

- **K1 — HARD.** Discovery is `initialize` then `tools/list` over the configured transport with a
  30-second default, and **every** request returns no later than the timeout plus 5 seconds,
  for every caller and every surface; an outstanding discovery must never delay process exit past
  that bound (`REQ-MCP-046`, `REQ-MCP-053`). A watchdog independent of the transport's own timeout
  is required.
- **K2 — HARD.** Discovery is memoised on an identity of exactly nine values — name, `type`,
  `command`, `args`, `env`, `cwd`, `url`, `headers`, workspace root — and a difference in any one
  re-interrogates; a configuration reload invalidates every entry. It is **per process and never
  shared**: never written to disk, never cached across launches, never coordinated between
  instances, and two instances may legitimately hold different tool lists (`REQ-MCP-047`).
- **K3 — HARD.** Discovery failure never raises: it returns an empty list, warns at most once per
  identity, and remembers the failure so later persona resolutions can warn (`REQ-MCP-048`,
  `REQ-MCP-042`). A stdio teardown error *after* the list was received is ignored and logged at
  debug; before, it is a failure (`REQ-MCP-051`).
- **K4 — HARD.** A health probe is deliberately uncached: probing n times contacts the server n
  times, no probe reports a carried-over outcome, it returns within 8 seconds, never raises, leaves
  discovery state untouched, and still runs for a server whose discovery failed (`REQ-MCP-054`).
  Probe and discovery must not share a connection or a cache.
- **K5 — HARD.** Exactly one shared connection per server per session — and for `stdio`, exactly one
  server process — opened on first demand, reused by every agent, closed exactly once at session end
  (lock release or application exit). Two concurrent requests for the same server yield one
  connection; while one server is starting, calls to already-connected servers must complete without
  waiting; a request after shutdown fails naming the server and leaves nothing open; releasing a
  superseded connection leaves the current one usable; shutdown is idempotent (`REQ-MCP-066`,
  `REQ-MCP-067`). This is a keyed single-flight registry with a shutdown latch.
- **K6 — HARD.** A child conversation ending leaves connections and stdio processes alive for the
  next child. Concurrent calls over one connection all complete and each receives its own response,
  and **the session keeps emitting its events while a call is outstanding** — `tool.start` is
  observable before the call returns and every other catalog event is emitted at its normal point,
  however many calls are outstanding (`REQ-MCP-068`). This forbids serialising a connection behind a
  mutex and forbids blocking the event pump on a tool call.
- **K7 — HARD.** Post-connect hooks read the **unfiltered** tool list so no grant configuration can
  disarm them (`REQ-MCP-064`). The `lsp` init hook is keyed on the *configured name* `lsp` and a
  reported tool `lsp_init`, 15 seconds, and on failure that server contributes nothing to the
  triggering agent but a later agent retries from scratch (`REQ-MCP-070`). The code-intelligence
  binding probe is keyed on the built-in name, matches the memory-listing tool by trailing segment,
  15 seconds, and on failure warns but leaves the connection open and the tools offered
  (`REQ-MCP-071`).
- **K8 — HARD.** A mid-run `tools/list` update recomputes the callable set by the same decision and
  may only ever **narrow** it: a withdrawn or now-denied name stops being callable immediately, a
  newly introduced name never becomes callable for the rest of that connection, and an update in
  which nothing survives empties that server's contribution. Narrowing does not close the
  connection, fail the run, or re-render the prompt (`REQ-MCP-060`, `REQ-MCP-062`).
- **K9 — HARD.** A server that becomes unreachable after connecting is handled per call and never by
  failing the run: the call in flight fails like an exhausted allowance, one warning per server per
  session, **no retry and no automatic reconnection**, and a later call may re-establish the
  connection and succeed (`REQ-MCP-069`).
- **K10 — HARD.** Windows `stdio` launch guarantee, stated as a host condition to be tested
  negatively: the application is a graphical process owning no console whose own standard streams may
  be absent, closed, or not usable pipes. The product creates the child's three standard streams
  itself for every launch, never inherits or reuses the parent's, never requires a console to exist,
  and never allocates or shows one — **no console window at any point**. The same rule applies on
  every platform and to the reserved token's child, which is the application's own executable
  (`REQ-MCP-113`).
- **K11 — HARD.** The reserved token resolves to the bundled server: in a frozen installation
  "through the application's own executable with the same token `builtin:code-intelligence` as its
  first argument"; such a process answers MCP on its standard streams, **presents no user interface,
  opens no window**, and terminates with the server's own exit status (`REQ-MCP-033`).
- **K12 — HARD.** Warnings reach the user through exactly two channels — an 8-second warning toast
  and a persisted session issue with kind `mcp_config`, severity `warning`, actor `orchestrator`
  (`REQ-MCP-044`). A launch failure whose cause chain holds an MCP connection error produces
  **exactly one** diagnostic — never zero, never two — chosen by the first of two cases
  (`REQ-MCP-107`).
- **K13 — HARD.** Prompt rendering is byte-exact where it is stated: `_No MCP servers configured._`
  as the entire body when nothing is active; `` `name` `` for a server with no known tools versus
  ``**`name`**`` for one with tools; `- `, code-formatted tool name, and ` — ` before a non-empty
  description; both levels ordered by J13; and the printed names are exactly the callable names
  after denial, grants and renaming (`REQ-MCP-101`, `REQ-MCP-062`). The memories protocol block is
  gated on two specific grants and must carry the same characters in the same order in every prompt
  that has it (`REQ-MCP-102`).
- **K14 — HARD.** Enablement is consulted afresh at every persona resolution; changing it mid-run
  never crashes the run and takes effect on the next iteration (`REQ-MCP-078`). There are exactly
  two controls and no third store: the durable `enabled` field and a session-only desktop override
  discarded at exit (`REQ-MCP-115`, `REQ-MCP-094`).

### L. MCP secrets and environment

- **L1 — HARD.** `secrets.yaml` per scope beside `agents.yaml`, atomic writes with parent directories
  created; unreadable/invalid/non-mapping loads as empty; non-mapping server values skipped; keys
  and values coerced to strings; an empty key or empty coerced value skipped at load with a warning
  and **refused** at write, so masking's shortest input is one character (`REQ-MCP-082`,
  `REQ-MCP-084`). Merged view is global then workspace with workspace winning (`REQ-MCP-083`).
- **L2 — HARD.** Environment resolution happens **during loading**, so agent construction, discovery
  and probes all see the same resolved values: a value that is exactly `${VAR}` is replaced from the
  process environment and the key is **omitted entirely** when the variable is unset — the literal
  placeholder is never passed to a server; any other value is kept as-is; stored secrets overlay
  last and always win (`REQ-MCP-087`, `REQ-MCP-090`). For remote servers `${VAR}` inside the URL is a
  *substring* substitution with stored secret before process environment, and an unresolvable
  placeholder stays literal with a warning (`REQ-MCP-088`) — which is how the `web_search` entry is
  marked unavailable until the key is supplied (`REQ-CONFIG-181`, `REQ-CONFIG-225`).
- **L3 — OPEN.** Whether the spawned child inherits the parent process environment beyond the
  resolved `env` map is not stated anywhere in domain 16. See **OQ-5**.

### M. Setup and packaging

- **M1 — HARD.** Warm-step derivation is fully specified: only `stdio` entries whose resolved
  command *file name* matches `uvx | uvx.cmd | npx | npx.cmd` **case-insensitively on every
  platform**; per-family package extraction rules; the `uvx` executable argument taken from the
  first resolved argument after the spec that does not begin with `-`, with the step omitted rather
  than guessed when there is none; `npx` resolved to an absolute path and the step omitted when
  `npx` is absent; ids `warm:<family>:<package>`, labels `Warm <package>`, capability tag
  `"<server> MCP server"`, duplicates collapsed to one step (`REQ-MCP-096`).
- **M2 — HARD.** Project setup runs three ordered steps at 300 / 1800 / 120 seconds with UTF-8 child
  encoding, 0.25-second polling, a 5-second terminate grace then force-kill (on Windows the whole
  process tree), failing output truncated to its **last** 400 characters, and the status vocabulary
  `succeeded | failed | skipped-no-code | not-attempted` with a failure stopping the steps that
  follow (`REQ-MCP-099`).
- **M3 — HARD.** "Contains code" is a bounded filesystem walk honoring version-control ignore rules,
  traversing non-excluded dot directories, following no symlink out of the workspace, stopping at
  the first qualifying file, performed once per setup run and reused for both gated steps
  (`REQ-MCP-099`).
- **M4 — HARD.** The command line for setup is *derived* from the configured entry — resolved
  command plus exactly the argument prefix preceding the launch subcommand — and no substitute
  command may be used; a remote entry, an empty command, or arguments with no launch subcommand
  produce a non-retryable failure (`REQ-MCP-036`).
- **M5 — HARD.** Workspace binding appends exactly two arguments (the project-path option and the
  run's workspace root) at the end when the args contain the launch subcommand and no
  project-selection argument, matched on the launch subcommand alone independently of the entry's
  name; a server launched with a project path must not advertise its project-switching or
  configuration-introspection tools (`REQ-MCP-034`). For an isolated working tree the appended path
  is that tree's root, so binding is per-run, not per-configuration.
- **M6 — CONFLICT.** `REQ-MCP-033` specifies the sentinel argv branch as answering "the MCP protocol
  as the code-intelligence server on its standard streams", while `REQ-MCP-036` + `REQ-MCP-099`
  require the same derived command to accept the runtime's `create`, `index` and memory
  subcommands. See **OQ-6**.

---
