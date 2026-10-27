# Resolution Record — Domain 16, MCP Server Integration — Graphical-only sweep

Part 1 of 2 of [domain 16's resolutions](../16-mcp-integration.md), which indexes every part.

## Graphical-only sweep

The product has no command-line interface and no terminal user interface, so a requirement reachable
only from a shell or a text-mode screen is withdrawn and its capability re-sited on the desktop.

| Withdrawn | Why its only surface was a shell or text-mode screen | Capability now carried by |
| --- | --- | --- |
| **REQ-MCP-072** — a `stdio` server launched while the terminal UI hosts the run starts on Windows and its tools become available | The guarantee was scoped to "while the terminal UI is hosting the run"; with no terminal UI the requirement as written has no subject | **REQ-MCP-113** (new) restates the guarantee for the desktop application, and states the host condition it exists to defeat — a graphical process that owns no console and whose own standard streams are not usable pipes — which also answers Open Question 7 |
| **REQ-MCP-073** — a `/mcp` slash command, a text-mode command-palette entry and a palette cheatsheet, each with fixed help text | Slash commands and a text-mode palette are surfaces of a terminal interface | **REQ-MCP-108** (new): MCP server management is the `mcp` settings category of REQ-CONFIG-269, inside the Settings view of REQ-SHELL-023, and is additionally an entry in the desktop action vocabulary of REQ-SHELL-048 so it is reachable from the command palette, the keyboard-help dialog and the composer's slash catalogue alike |
| **REQ-MCP-074** — a modal text-mode table with a fixed title line, five columns, `[x]`/`[ ]` enabled cells, space-to-toggle and escape-to-close | A modal full-screen text table is the terminal interface itself | **REQ-MCP-091** already lists every configured server with its transport, command or address, origin and a toggle; **REQ-MCP-108** (new) makes that the single venue and fixes what the row must convey |
| **REQ-MCP-075** — the Status cell of that table, carrying a supplied status string or the literal `active` | It described a column of the withdrawn table, and its fallback was the source of the contradiction Open Question 5 raised | **REQ-MCP-092**'s four health states, shown as text beside the indicator (REQ-SHELL-149), together with **REQ-MCP-037** availability. Nothing carries the `active` fallback forward: a state that is never computed is not a state |
| **REQ-MCP-076** — a global `mcp_toggles.json` holding per-server enabled booleans, sorted keys, atomic replacement | The file existed only to persist the withdrawn terminal-UI toggles. A second global enablement store also contradicts REQ-CONFIG-465, which puts `enabled` in the configuration surface with defined merge semantics, and the draft named no precedence between the two | **REQ-MCP-115** (new): durable per-server enablement is the `enabled` field of REQ-CONFIG-465 in the layered YAML configuration, and the desktop toggle is the session override of REQ-CONFIG-349 and REQ-MCP-094. The MCP category states which of the two it is changing, so a user who wants a server off permanently is told where to put it |
| **REQ-MCP-077** — resilience rules for that file (absent name enabled, corrupt file behaves as empty, explicit reload, thread safety, temp-file cleanup) | It protected the withdrawn file | The default it protected — a server the user has not turned off is enabled — is the `true` default of REQ-CONFIG-465; **REQ-MCP-115** carries the reload and out-of-band-edit behavior, which is now ordinary configuration reloading |
| **REQ-MCP-079** — an "MCP Servers" section of the terminal information pane, with origin glyphs, green/dim colouring and ` [http]` / ` [sse]` suffixes | A text pane rendered with ANSI colour is the terminal interface | Two halves, both re-sited. Pre-run listing of every configured server with computed availability and origin: **REQ-MCP-091**, extended by **REQ-MCP-108** (new). What a running or finished agent actually carried: **REQ-MCP-114** (new), on the desktop agent inspector beside the granted tools of REQ-MCP-065. The colour-only encoding is not carried forward; REQ-SHELL-149 forbids it |
| **REQ-MCP-080** — a modal text-mode secrets screen with fixed title, key bindings, hint line and notification strings | A modal text-mode screen with single-letter bindings is the terminal interface | **REQ-MCP-109** (new) carries reading: the merged per-server view of REQ-MCP-083, every value masked, the expected-keys hint, the scope of each entry, the empty states. **REQ-MCP-110** (new) carries editing: add, edit, delete, clear-all, the workspace/global scope choice, the unechoed value field, validation, and per-edit confirmation |
| **REQ-MCP-085** — a `secrets` command group of `set`, `unset`, `unset-all` and `list` with scope flags, prompts, printed tables and exit codes | A command group invoked from a shell | **REQ-MCP-109** and **REQ-MCP-110** (new). `list`'s distinctive capability — the merged view across *every* server at once, not one server at a time — is preserved in REQ-MCP-109 as an all-servers view alongside the per-server one |
| **REQ-MCP-086** — a `config` subcommand storing the web-search API key without naming the server or the variable | A shell subcommand | **REQ-MCP-111** (new): a dedicated control in the `mcp` settings category that stores the key under the `web_search` entry keyed by `ROTARIS_SEARCH_API_KEY` (REQ-CONFIG-181), with the same one-step, no-naming-required property |
| **REQ-MCP-097** — a CLI setup command with `--workspace`, event streaming to stderr, an outcome echoed to stdout and exit codes 0/1 | A shell command | **REQ-MCP-112** (new): the settings action REQ-MCP-095 already requires becomes fully specified — it inspects tooling, installs what is missing, warms the caches derived by REQ-MCP-096, repairs broken installations, reports per-step progress and a final outcome, and is cancellable. The degraded/cancelled distinction the exit code carried is preserved as an outcome the surface states |

Three surviving requirements named a shell or text-mode venue beside a desktop one. Each keeps its
substance and loses only that half, so nothing is withdrawn and no capability moves:

- **REQ-MCP-037** — the single availability rule listed "agent construction, terminal UI, desktop UI,
  initialization-task gating" as the surfaces that must agree. The terminal UI is struck; the
  invariant that no two surfaces may disagree is the point of the requirement and is preserved.
- **REQ-MCP-061** and **REQ-MCP-066** — "whether the persona runs in an interactive session or in a
  headless background run" and "headless background runs" become a run the user is watching and a
  run the application performs in the background. Background work stays in scope: it is the desktop
  application doing it, started and observed from the graphical interface.
- **REQ-MCP-081** — "in the CLI and in every UI" and "or standard output" are struck from the masking
  rule's scope, which is restated as every rendering the product produces. That widens the
  guarantee rather than narrowing it.

**REQ-MCP-036** and **REQ-MCP-099** were examined and deliberately left in scope. They describe the
product spawning the code-intelligence runtime's own executable and deriving its argument list —
the product running an external program, which decision 4 leaves untouched. No user drives anything
from a shell there.
