# Open-Question Resolutions — Settings and Configuration — Graphical-only sweep

Part 2 of 4 of [domain 15's resolutions](../15-settings-configuration.md), which indexes every part.

## Graphical-only sweep

This domain's open questions were disposed of **before** the product-owner decision of 2026-08-30 that
the product is one Electron desktop application with no command-line interface and no terminal user
interface. The sweep every other domain has already had is applied here now. Domains 17 and 18 are
retired and the identifiers `REQ-TUI-*` and `REQ-CLI-*` are withdrawn; nothing below cites one.

Two things the sweep deliberately does **not** touch, both named by the decision as remaining in
scope: the product running external programs — hook commands (REQ-CONFIG-154 to REQ-CONFIG-158),
verification check commands (REQ-CONFIG-145), tool servers on the stdio transport
(REQ-CONFIG-176), the agent's own terminal tool and its bounds (REQ-CONFIG-116, REQ-CONFIG-117) —
and the settings that govern a run **nobody is watching** (`headless_approval_policy`,
`allow_unsandboxed_autonomous`, the answer-wait budget). A board-scheduled run is still
non-interactive; what no longer exists is a way for a *user* to drive this product from a shell.

### Requirements withdrawn, and where the capability went

| Withdrawn | What its surface was | Capability now carried by |
| --- | --- | --- |
| **REQ-CONFIG-171** | `tui.keyboard.leader`, the leader key of a text-mode interface, with its normalization and its warning | None needed. `tui` ceases to be a recognized top-level key and is reported as unknown (REQ-CONFIG-040, REQ-CONFIG-233); keyboard access to the desktop is owned by the desktop-shell domain and is not configured from `agents.yaml` |
| **REQ-CONFIG-234** | A configuration file named with `-c`/`--config` | Nothing lost: the layered surface is the two scopes and nothing else (REQ-CONFIG-031 as amended, REQ-STARTUP-111), edited directly or through REQ-CONFIG-256 and REQ-CONFIG-441. The adjacent hook question is REQ-HOOKS-016, already withdrawn on the same ground |
| **REQ-CONFIG-235** | How that file was folded in as layer 6 | REQ-CONFIG-031 — there is no sixth layer; the order of the five that remain is unchanged |
| **REQ-CONFIG-236** | The post-merge passes over that file, and its `command-line` hook scope stamp | REQ-CONFIG-035 to REQ-CONFIG-037 (the passes, unchanged and applied to every layer); REQ-CONFIG-151, aligned with REQ-HOOKS-014, whose stamp vocabulary is exactly `default`, `global`, `workspace` |
| **REQ-CONFIG-240** | The run command's flag vocabulary | Workspace: REQ-SHELL-021, REQ-STARTUP-041. Session resume: REQ-SESSION-182, REQ-SESSION-184. Isolation, worktree, branch: REQ-GIT-118, REQ-GIT-158. Role and iteration cap: REQ-CONFIG-263. Access beyond the workspace: REQ-TOOLS-191 with REQ-CONFIG-327. Sign-out: REQ-CONFIG-383. Event export in place of the machine-readable stream: REQ-EVENTS-173 |
| **REQ-CONFIG-241** | `--persona` and `--unsafe-outside-workspace`, applied after referential validation | REQ-CONFIG-263 (both as run overlays), with the role now **checked** against the configured set — the flag's escape from that check goes with the flag; REQ-TOOLS-191 and REQ-CONFIG-327 for the confirmed toggle |
| **REQ-CONFIG-242** | `--max-iterations` not being written into `runtime.max_iterations` | REQ-CONFIG-262 and REQ-CONFIG-263 (Tier B: a run takes live values without committing them), over the control of REQ-CONFIG-325 |
| **REQ-CONFIG-243** | `--logout` | REQ-CONFIG-383, over REQ-PROVIDER-143 |
| **REQ-CONFIG-244** | Argument-shape checks and exit codes 1 and 2 | Nothing lost: every choice is made through a control offering only valid values, so an invalid selection is unreachable rather than diagnosed, and the product exposes no exit status to a user |
| **REQ-CONFIG-440** | A second set of settings screens belonging to the text-mode interface | Providers: REQ-CONFIG-329, REQ-CONFIG-367 to REQ-CONFIG-389. Compression: REQ-CONFIG-325, REQ-CONFIG-446. Tool-result display: **REQ-CONFIG-472** (new). Tool-server enablement: REQ-CONFIG-348, REQ-CONFIG-349. Tool-server secrets with its scope choice: REQ-MCP-109, REQ-MCP-110. Developer options: **REQ-CONFIG-471** (new) |
| **REQ-CONFIG-445** | The developer-options screen's per-scope raw runtime view | **REQ-CONFIG-471** (new) — the advanced runtime card, which reads the raw `runtime:` mapping from the selected scope's file |
| **REQ-CONFIG-447** | A configuration subcommand with an argument, a secure prompt, a workspace option, a global flag, an exit code and a masked echo | REQ-MCP-110 (add or change a secret, `Workspace`/`Global` opening on `Workspace` per REQ-CONFIG-463, no clear-text echo, empty value refused) and REQ-MCP-081 (the masking rule), over the store of REQ-CONFIG-214 to REQ-CONFIG-218 and the key name REQ-CONFIG-181 fixes |

### New requirements

**REQ-CONFIG-467** through **REQ-CONFIG-472**. Two are rescues, four register keys other domains
introduced during their own resolutions. Of the numbers that were free when this section was
written, 473 has since been taken by the registration of `event_retention_per_session` and 474
through 476 by the sixth reconciliation round, so the next number free in this domain's series is
477. Bare numbers are used here deliberately: written in requirement-identifier form, a bookkeeping
note about the next free number reads to every automated citation scan as a reference to a
requirement that does not exist, and has cost each audit a lookup to dismiss.

- **REQ-CONFIG-471** — the advanced runtime card in the Runtime category: a Workspace/Global scope
  selector, a read-only rendering of that scope's **raw** `runtime:` mapping, and the
  `memory_diagnostics_enabled` toggle, which writes through the scoped per-field write path and
  reloads immediately. Rescues REQ-CONFIG-445 and gives REQ-CONFIG-261's diagnostics toggle a home.
- **REQ-CONFIG-472** — the four tool-row display controls in the Display category, written to the
  `display:` section as workspace configuration under Save, taking effect on the rows already drawn
  the moment the control moves. Rescues part of REQ-CONFIG-440 and satisfies REQ-CHAT-166.
- **REQ-CONFIG-467** — `runtime.loop_classification_timeout`, default 2.0 s and never more than what
  remains of the activation budget (REQ-NOTIFY-100, REQ-NOTIFY-106).
- **REQ-CONFIG-468** — `runtime.additional_read_only_roots`, absolute paths, default empty, relative
  entries rejected at load and on assignment (REQ-TOOLS-132, REQ-SANDBOX-053).
- **REQ-CONFIG-469** — `runtime.keep_going`, the keep-going criterion of REQ-MONITOR-302: a boolean,
  off by default and distinct from `relentless` (REQ-CONFIG-130). "Settable in settings and per run"
  is met by a fourth toggle on the runtime policy card (REQ-CONFIG-323), saved with the rest of
  destination 1 (REQ-CONFIG-256, REQ-CONFIG-417), and by the Tier B overlay of REQ-CONFIG-263.
- **REQ-CONFIG-470** — `integration.validation_command` (REQ-GIT-156), which also adds `integration`
  to the section class of REQ-CONFIG-047 and to the Data & Formats merge-class table.

**Three further keys were added by the sixth reconciliation round**, and the reason they are recorded
here rather than above is the point of that round. Domain 01's resolution record closed with a
cross-domain consequence stating that four settings it had decided "will need entries in the settings
domain". Three of them needed a key here and never got one, through five reconciliation rounds that
were each looking for duplicated content and so could not see a requirement that was missing
altogether: `task_consecutive_retry_limit` (REQ-CONFIG-474, the per-task consecutive-retry limit
REQ-ORCH-077 requires), `relentless_audit_timeout` (REQ-CONFIG-475, the audit bound of REQ-ORCH-079)
and the run-start mode key (REQ-CONFIG-476, the `auto`/`plan` setting REQ-ORCH-152 requires). Each
registers the key, its type and its default and holds no copy of the rule that consumes it. The
fourth, the per-check `failure_pattern`, needed no key here: it is a field of a check declaration,
which domain 01 states itself.

Two bounds were registered under two names. REQ-NOTIFY-100 fixes `runtime.tool_call_timeout` (30 s)
and `runtime.shell_command_timeout` (100 s) for bounds this document had called `tool_timeout` and
`shell_timeout` at the same defaults. The names REQ-NOTIFY-100 fixes are adopted in REQ-CONFIG-115
and REQ-CONFIG-116 and no second key names either bound; `runtime.summary_timeout` (120 s) was
already stated here under that name and is now cited to REQ-NOTIFY-100.

### Shell-surface clauses struck, requirement kept

| Struck | Where | Reading now |
| --- | --- | --- |
| "Two interactive surfaces (a desktop settings screen and a set of terminal settings screens)" | Overview | One desktop settings screen, plus a statement that there is no shell surface through which a user configures or drives the product |
| Layer 6, "a configuration file named on the command line" | REQ-CONFIG-031 | Five layers, stated to be the whole of the layered surface |
| `tui` in the section class | REQ-CONFIG-047, Data & Formats | Removed; `integration` added (REQ-CONFIG-470) |
| "in both the desktop and the terminal surface" | REQ-CONFIG-135 | The desktop transcript |
| The `command-line` hook scope stamp | REQ-CONFIG-151, Vocabularies | `default`, `global`, `workspace` (REQ-HOOKS-014) |
| "the terminal display block", "what the terminal surface shows", "written by the terminal surface" | REQ-CONFIG-172, REQ-CONFIG-175 | The display block, the desktop transcript's tool rows (REQ-CHAT-166), written by the settings surface (REQ-CONFIG-472) |
| Two references to the configuration subcommand | REQ-CONFIG-181 | The desktop secrets surface (REQ-MCP-109, REQ-MCP-110) |
| "any command that reads delivery records" | REQ-CONFIG-192 | Any surface that reads them |
| "terminal, non-interactive command surface"; "attached to a terminal or a window"; "from the non-interactive command surface, from a scheduled or headless run" | REQ-CONFIG-198 | The desktop budget governs runs a person started from the desktop; every other run — board-scheduled or otherwise unattended — takes `answer_timeout_minutes`. The two sets stay disjoint, so OQ 47's disposition survives intact |
| "an invalid terminal leader key" in the warn-and-continue class | REQ-CONFIG-233 | Removed with REQ-CONFIG-171 |
| "printed to standard error … exits with code 1, with no stack trace" | REQ-CONFIG-239 | Reported to the user as configuration errors; the workspace does not open on that configuration |
| "not in background mode", the printed notices and the exit codes | REQ-CONFIG-245 | The two recovery paths run while a person is present, through the sign-in action and the Models category |
| "In background mode … exit code 1. In the fully non-interactive command surface … a run invoked with neither a task nor a session" | REQ-CONFIG-246 | For a run nobody is watching, both recovery paths are skipped and referential errors end that run with the messages recorded as the reason |
| "Exit codes observed across this surface: 0 … 1 … 2 …" | REQ-CONFIG-247 | Removed; the detection rule is unchanged |
| "the terminal secret editor (REQ-CONFIG-440)" as a scope-offering surface | REQ-CONFIG-463 | The tool-server secrets surface (REQ-MCP-110), which opens on `workspace` exactly as REQ-CONFIG-463 requires |
| "The terminal surface's diagnostics toggle" | REQ-CONFIG-261 | The diagnostics toggle of REQ-CONFIG-471 |
| "terminal keyboard" in Tier C; "or a command starts" | REQ-CONFIG-265 | Removed; "or the application is next started" |
| "command validation" as a consumer of the usable-models projection | REQ-CONFIG-433 | "run-start validation" |
| "the terminal write path" | REQ-CONFIG-030, REQ-CONFIG-441 to REQ-CONFIG-444, REQ-CONFIG-463, section heading | "The scoped per-field write path" — the writer used by any surface that changes part of a section rather than the desktop save's enumerable key set. The per-field, recursive write semantics OQ 3 settled are unchanged |
| "edited from both the terminal compression screen and the desktop compression control"; "the terminal slider offers exactly the range the desktop control offers" | REQ-CONFIG-446 | One control; what it offers, the schema accepts. The 50–95 selectable range and the 1–100 schema range that OQ 48 settled are unchanged |
| The exit-codes table | Data & Formats | Removed; every requirement it summarized is withdrawn |

### Dispositions this sweep supersedes

Three rows of the table below were decided against a surface that no longer exists and are read as
follows. **OQ 15** (a `-c`/`--config` file receiving every post-merge pass, and its `command-line`
scope stamp) is superseded outright: REQ-CONFIG-234 to REQ-CONFIG-236 are withdrawn and the stamp
vocabulary is REQ-HOOKS-014's. **OQ 3** stands on its merits — the write path applies its update per
field — and only the path's name changes. **OQ 44** stands: the three default tool servers, their
names, and `ROTARIS_SEARCH_API_KEY` are unaffected; the key reaches `secrets.yaml` through
REQ-MCP-110 rather than through a subcommand, and the escalated question is untouched.

No behavior was lost to the sweep, and no requirement identifier was renumbered, reused, or deleted.
