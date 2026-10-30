# Product directives

Behaviour decided by the product owner. **These govern over every requirement they name** — see
[`README.md`](README.md) for the precedence rule, the classification that routes a request here
rather than to an open question or an escalation, and the obligations a directive puts on the commit
that writes it.

- Identifiers: `PD-<DOMAIN>-<NNN>`, `<DOMAIN>` taken from the specification domain that owns the
  behaviour. Stable, permanent, contiguous from 1 per domain, never renumbered and never reused.
- Every directive states a **disposition** against live requirements, and every requirement it
  supersedes, narrows or extends carries a back-pointer at its own definition in `docs/spec/`.
- Parsed by `tools/symbol-artifact/generate.mjs`. A disposition naming an identifier the
  specification does not define fails `pnpm check`.

## Count

**One hundred and one.** The count here is the number of entries below, written nowhere else so that it cannot go
stale. A **revised** directive keeps its number and does not add to it (`README.md`: "a changed
directive gets a new revision, not a new number"); `PD-CHAT-004` is at revision 3.

---

## The entries

Each directive is its own file in [`directives/`](directives/), named by its anchor (`pd-<domain>-<nnn>.md`), since
2026-10-26: this register was one file of 9,904 lines until then, and was split verbatim so that an agent can load the
directive it needs without the whole register ([the document budget](../README.md#the-document-budget)). An entry keeps
its anchor, its heading and its text; only the `---` rules that separated the entries were dropped. A new directive is
a new file of the same shape and a row in its domain's table below; a link to it reads
`directives/pd-<domain>-<nnn>.md#pd-<domain>-<nnn>`.

### CHAT

| Directive | What it decides |
|---|---|
| [PD-CHAT-001](directives/pd-chat-001.md) | the composer's selector chips open their alternatives in a press-revealed popover |
| [PD-CHAT-002](directives/pd-chat-002.md) | structured questions present an auto-opened, docked all-in-one form and a rendered transcript summary |
| [PD-CHAT-003](directives/pd-chat-003.md) | transcript row density follows the design material's compact flow |
| [PD-CHAT-004](directives/pd-chat-004.md) | an agent's uninterrupted work draws as one activity line that updates in place |
| [PD-CHAT-005](directives/pd-chat-005.md) | a row names its agent by colour, and a delegated agent's rows sit one step in |
| [PD-CHAT-006](directives/pd-chat-006.md) | a row still being written draws no animated indicator of its own |
| [PD-CHAT-007](directives/pd-chat-007.md) | every queued prompt belongs to a session |
| [PD-CHAT-008](directives/pd-chat-008.md) | the run timer counts from the newest row the run produced |
| [PD-CHAT-009](directives/pd-chat-009.md) | the user's chat controls are recorded under the chat domain's timeline words |
| [PD-CHAT-010](directives/pd-chat-010.md) | the transcript's tool-rendering verbosity is one slider with five ordered stops |

### CONFIG

| Directive | What it decides |
|---|---|
| [PD-CONFIG-001](directives/pd-config-001.md) | the Personas category edits a role's MCP tool grants inline |
| [PD-CONFIG-002](directives/pd-config-002.md) | the Settings provider list shows every provider REQ-PROVIDER-140 lists |
| [PD-CONFIG-003](directives/pd-config-003.md) | the Runtime category's two timeouts: the per-agent timeout as a third delegation limit, in minutes, and the improvement analysis timeout, in seconds |
| [PD-CONFIG-004](directives/pd-config-004.md) | the Display category's Transcript heading holds the tool-verbosity slider and the reasoning switch |
| [PD-CONFIG-005](directives/pd-config-005.md) | the Models category also holds the dictation model |

### GIT

| Directive | What it decides |
|---|---|
| [PD-GIT-001](directives/pd-git-001.md) | isolation counts the runs that could share the launch's working tree |

### HOOKS

| Directive | What it decides |
|---|---|
| [PD-HOOKS-001](directives/pd-hooks-001.md) | `child_completed` fires only while a run's lifecycle hooks are live |

### LIBRARY

| Directive | What it decides |
|---|---|
| [PD-LIBRARY-001](directives/pd-library-001.md) | a child report states the commands the child ran, and which of them failed |
| [PD-LIBRARY-002](directives/pd-library-002.md) | a retrospective pass reads the workspace's own session history and proposes what a user would otherwise have to teach the product by hand |
| [PD-LIBRARY-003](directives/pd-library-003.md) | an artifact's body is its document, and a person's edit of it survives and travels |
| [PD-LIBRARY-004](directives/pd-library-004.md) | a read marks the reading agent instance a consumer by its canonical name |
| [PD-LIBRARY-005](directives/pd-library-005.md) | an improvement pass whose collector failed reads as the failure it is |

### MCP

| Directive | What it decides |
|---|---|
| [PD-MCP-001](directives/pd-mcp-001.md) | the bundled code-intelligence server's manual tool is described in the product's own words |
| [PD-MCP-002](directives/pd-mcp-002.md) | every root an isolated run hands its MCP servers is the run's own tree |
| [PD-MCP-003](directives/pd-mcp-003.md) | a code-intelligence setup step gets 2 seconds to exit at every stop |
| [PD-MCP-004](directives/pd-mcp-004.md) | a code-intelligence symbol rename is preceded by a referencing-symbol search of the same symbol |

### MONITOR

| Directive | What it decides |
|---|---|
| [PD-MONITOR-001](directives/pd-monitor-001.md) | a cost the provider reported is carried and shown under its own qualifier |
| [PD-MONITOR-002](directives/pd-monitor-002.md) | the application log keeps `info` and above |
| [PD-MONITOR-003](directives/pd-monitor-003.md) | the run-level agent carries its own tool-call count, and the run's aggregate is the run's total |
| [PD-MONITOR-004](directives/pd-monitor-004.md) | the quota wait's model picker lists every configured model, an out-of-quota one marked, and keep waiting retries an out-of-quota wait now |
| [PD-MONITOR-005](directives/pd-monitor-005.md) | the stall watch counts the silence of the agent's own model steps, and a wait the run holds it in is not that silence |
| [PD-MONITOR-006](directives/pd-monitor-006.md) | a switch of the entry model or reasoning level from the run header holds for its own run |
| [PD-MONITOR-007](directives/pd-monitor-007.md) | helper model calls follow the session's override and stay off a model held out of quota |

### ORCH

| Directive | What it decides |
|---|---|
| [PD-ORCH-001](directives/pd-orch-001.md) | loop supervision does not fire while a run is held at the plan gate |
| [PD-ORCH-002](directives/pd-orch-002.md) | the plan gate renders Markdown by default with inline editing and progressive revision feedback |
| [PD-ORCH-003](directives/pd-orch-003.md) | an approval releases the plan gate for the session, not only for the run |
| [PD-ORCH-004](directives/pd-orch-004.md) | a child cut off while making progress hands its work back to the parent |
| [PD-ORCH-005](directives/pd-orch-005.md) | a continued session resumes the agents its last run left unfinished, from their full record |
| [PD-ORCH-006](directives/pd-orch-006.md) | a coordinator granted the direct-work bundle does the work itself, and is told so |
| [PD-ORCH-007](directives/pd-orch-007.md) | the report summariser reads the child's whole task |
| [PD-ORCH-008](directives/pd-orch-008.md) | a tool call joins the saved totals as it completes |
| [PD-ORCH-009](directives/pd-orch-009.md) | an entry role that ends its turn without an answer is asked once more, and the person is told if it still writes none |
| [PD-ORCH-010](directives/pd-orch-010.md) | a child is never named after a root of its session |
| [PD-ORCH-011](directives/pd-orch-011.md) | `explicit_trivial` is a small edit, and the tie-break chooses among the plausible categories |
| [PD-ORCH-012](directives/pd-orch-012.md) | a task answers for the plan items opened since it was first taken up |
| [PD-ORCH-013](directives/pd-orch-013.md) | an explicit choice of the entry model wins over an earlier wait's override of that model |
| [PD-ORCH-014](directives/pd-orch-014.md) | the timeline and issue vocabularies name every fact the run records |
| [PD-ORCH-015](directives/pd-orch-015.md) | a root that answers with its plan open is corrected in its own conversation; a held answer is carried to the next root and announced |
| [PD-ORCH-016](directives/pd-orch-016.md) | a raw-count fallback reads four consecutive calls as evidence only when they are the same action |
| [PD-ORCH-017](directives/pd-orch-017.md) | children have no fixed model-step cap |

### PROVIDER

| Directive | What it decides |
|---|---|
| [PD-PROVIDER-001](directives/pd-provider-001.md) | the hosted connection mode is spelt `hosted-cloud`, and a provider's shared quota is a number it declares |

### SESSION

| Directive | What it decides |
|---|---|
| [PD-SESSION-001](directives/pd-session-001.md) | the listing record carries the three figures the sessions card shows |
| [PD-SESSION-002](directives/pd-session-002.md) | summary.md's mostly-elided artifacts are the attached artifacts a delegated agent was not given |
| [PD-SESSION-003](directives/pd-session-003.md) | an error-path tool record's arguments keep their shape, and what is never cut stays whole past 2,000 characters |

### SHELL

| Directive | What it decides |
|---|---|
| [PD-SHELL-001](directives/pd-shell-001.md) | a chosen project folder may be opened in an additional main window |
| [PD-SHELL-002](directives/pd-shell-002.md) | one window is a multi-session host: a second run starts beside the live one |
| [PD-SHELL-003](directives/pd-shell-003.md) | the main window carries one product-drawn frame on every desktop |
| [PD-SHELL-004](directives/pd-shell-004.md) | demo mode's network silence holds for the demo window, not for the process |
| [PD-SHELL-005](directives/pd-shell-005.md) | while an update downloads, its notice carries Distribution's words |
| [PD-SHELL-006](directives/pd-shell-006.md) | four tool results keep the plural marker their requirements spell |
| [PD-SHELL-007](directives/pd-shell-007.md) | the terminal's 100 ms echo is held on a host whose CPUs are not oversubscribed |
| [PD-SHELL-008](directives/pd-shell-008.md) | the status strip carries the sandbox indicator after the file-access flag |
| [PD-SHELL-009](directives/pd-shell-009.md) | closing a main window ends its own project's runs, and asks first |
| [PD-SHELL-010](directives/pd-shell-010.md) | a main window's renderer that is gone or does not answer a liveness probe cannot answer its close guard, and a guard that cannot answer allows |

### STARTUP

| Directive | What it decides |
|---|---|
| [PD-STARTUP-001](directives/pd-startup-001.md) | releases publish for Windows only until the directive is withdrawn |
| [PD-STARTUP-002](directives/pd-startup-002.md) | a launch the product starts itself is neither the instance nor handed to it |
| [PD-STARTUP-003](directives/pd-startup-003.md) | with no version metadata the running desktop reports `dev` |
| [PD-STARTUP-004](directives/pd-startup-004.md) | the variable naming a launch's artifact decides updatability, and no child inherits it |
| [PD-STARTUP-005](directives/pd-startup-005.md) | the notices file lists the tool-server packages a build pins |
| [PD-STARTUP-006](directives/pd-startup-006.md) | the setup statement names the moments the build carries |
| [PD-STARTUP-007](directives/pd-startup-007.md) | a reviewed exception may supply the licence identifier a dependency ships the text of and does not declare |
| [PD-STARTUP-008](directives/pd-startup-008.md) | an update downloads by itself and takes effect at the next start or by `Restart now` |

### TOOLS

| Directive | What it decides |
|---|---|
| [PD-TOOLS-001](directives/pd-tools-001.md) | a hard-timeout reset restores the shell's working directory and environment |
| [PD-TOOLS-002](directives/pd-tools-002.md) | the requested permission mode always applies; no unattended downgrade |
| [PD-TOOLS-003](directives/pd-tools-003.md) | the `FAILED ` marker matches in capitals only |
| [PD-TOOLS-004](directives/pd-tools-004.md) | a session approval of a file write covers that path |
| [PD-TOOLS-005](directives/pd-tools-005.md) | after one unanswered approval, a run treats the user as away |
| [PD-TOOLS-006](directives/pd-tools-006.md) | a delegated child may declare a write scope that its siblings may not write into |
| [PD-TOOLS-007](directives/pd-tools-007.md) | a `write_file` call with no operation is read as a create when its file does not exist |
| [PD-TOOLS-008](directives/pd-tools-008.md) | a todo list that itself marks two tasks in progress is refused without naming an active task |
| [PD-TOOLS-009](directives/pd-tools-009.md) | exit 1 from a diff or a search is an answer, not a failure |
| [PD-TOOLS-010](directives/pd-tools-010.md) | `send_signal SIGINT` stops a background session where the shell loses the signal |
| [PD-TOOLS-011](directives/pd-tools-011.md) | a user's own terminal action and the user's presence have their words |
| [PD-TOOLS-012](directives/pd-tools-012.md) | the code-intelligence runtime's marker directory is a hard-coded ignore component, and every agent is told what the product's own workspace directories are |
| [PD-TOOLS-013](directives/pd-tools-013.md) | a call its run cancels reads `interrupted` |
| [PD-TOOLS-014](directives/pd-tools-014.md) | a `haet_edit` miss that matches but for whitespace names the level and quotes the file's lines |
| [PD-TOOLS-015](directives/pd-tools-015.md) | a level-3 `write_file` edit carries the window's shift into `new_string` when `new_string` shares `old_string`'s indentation, and refuses when it cannot tell |
| [PD-TOOLS-016](directives/pd-tools-016.md) | a window-match `write_file` edit keeps the file's line endings and the bytes of the lines it leaves unchanged |
| [PD-TOOLS-017](directives/pd-tools-017.md) | an exact or replace-all edit keeps a CRLF file's line endings |
| [PD-TOOLS-018](directives/pd-tools-018.md) | a `write_file` insert keeps a CRLF file's line endings |
| [PD-TOOLS-019](directives/pd-tools-019.md) | a match at level 3 compares each line without its carriage return |
| [PD-TOOLS-020](directives/pd-tools-020.md) | level 3 matches blank lines by having no visible character |

### TRACE

| Directive | What it decides |
|---|---|
| [PD-TRACE-001](directives/pd-trace-001.md) | an adoption assistant, separate from the toolchain, detects a project's requirement layout and records what it found |

### WORKSPACE

| Directive | What it decides |
|---|---|
| [PD-WORKSPACE-001](directives/pd-workspace-001.md) | choosing the folder that is already open offers a new session |
| [PD-WORKSPACE-002](directives/pd-workspace-002.md) | instruction files are picked up beyond the workspace and switched per file |
| [PD-WORKSPACE-003](directives/pd-workspace-003.md) | "Load skill file…" opens a file chooser |
| [PD-WORKSPACE-004](directives/pd-workspace-004.md) | the injection latency bound counts every instruction file discovery can reach |
| [PD-WORKSPACE-005](directives/pd-workspace-005.md) | a project-setup banner names the project it is about |
| [PD-WORKSPACE-006](directives/pd-workspace-006.md) | a code-intelligence setup's failure reads in these words where REQ-WORKSPACE-092 and REQ-WORKSPACE-093 give none |
| [PD-WORKSPACE-007](directives/pd-workspace-007.md) | the status strip's path link and flag explanations follow the shell domain |
| [PD-WORKSPACE-008](directives/pd-workspace-008.md) | the strip's branch item names the states in which there is no branch to show |

---
<!--
The template. Copy it, do not read it as a directive — it names no real identifier and the
generator skips it because it sits inside a comment.

### PD-CHAT-001 — the composer states the model it will start the next run with

The composer MUST display the model the **next** run will start with, as text, beside the model
selector, in every run state including while a run is active. Where the next run would start with a
model other than the one the active run is using, the composer MUST state both.

**Why, and what it costs.** A user who changes model mid-run cannot otherwise tell whether the
change took effect now or at the next run, and the two readings differ in money. The cost is a
second piece of text in a composer the design draws tight, and a state the transcript header already
carries once.

> **Supersedes:** REQ-CHAT-009
> **Narrows:** REQ-CHAT-006
> **Extends:** REQ-CHAT-078

*Raised by the owner, 2026-09-12; logged as [R-001](requests.md#r-001).*
-->
