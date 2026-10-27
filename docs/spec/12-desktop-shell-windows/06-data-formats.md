# Desktop Shell, Navigation, and Window Management — Application entry

Part 6 of 7 of [domain 12](../12-desktop-shell-windows.md), which indexes every part.

## Data & Formats

### Application entry

The product has no command-line surface, no flags, no subcommands, no script-oriented output and no
meaningful process exit code. Every capability is reached from the desktop interface: a workspace
through REQ-SHELL-010 and REQ-SHELL-021, demo mode through REQ-SHELL-162, diagnostics capture
through REQ-SHELL-163, and the running version through REQ-SHELL-033 and REQ-SHELL-140. How many
processes that entry may produce is not this document's to fix: at most one instance of the
application runs per user account, and a further launch is handed to it rather than starting a rival
(REQ-STARTUP-161, REQ-STARTUP-162). Every window this document describes — main, persona and
terminal — is a window of that one instance, and several main windows on several workspaces are
ordinary rather than exceptional. The one case in which a launch is neither handed over nor made the
instance straight away is a launch arriving while this instance is shutting down, which REQ-SHELL-169
refuses for the remainder of the shutdown and honours once it has finished.

### Diagnostics capture vocabulary

Capture level is one of exactly `off`, `light`, `deep` — the value stored under `diagnostics/level`
and the only values the About-tab control offers (REQ-SHELL-163). `diagnostics/outputDir` holds an
absolute directory path chosen through the platform folder chooser, or is unset to mean the
product's own default location (REQ-STARTUP-131).

### Per-user preference store

A single platform-standard per-user preference store, scoped by organization "Rotaris" and application "Rotaris". The physical location and encoding are platform-defined and deliberately unfixed (REQ-SHELL-006); the observable contract is the key set, value semantics, and defaults:

Keys are slash-namespaced. The namespaces in use are `workspace/` (startup workspace state), `appearance/` (theme), `ui/` (motion), `interface/` (shell toggles), `display/` (transcript display), `panels/` (pane layouts), `updates/` (update state), `diagnostics/` (diagnostics capture), `requirements/` (requirements board state), `hooks/` (external hook enablement), and
`workspaces/` (per-workspace state).

This table is the registry REQ-SHELL-006 makes closed: every key the product may store is listed here, whatever document owns the behavior behind it, and a key absent from it does not exist. No key of any other form — in particular no dot-namespaced `desktop.*` key — is a key of this store.

| Key | Meaning | Default |
|---|---|---|
| `workspace/lastOpened` | workspace path used by startup resolution | unset |
| `appearance/theme` | active theme name; unknown values degrade to the default theme | unset → default |
| `ui/reduced_motion` | reduced-motion override; boolean; absent means "user has not said" | unset |
| `interface/agentPopout` | agent click opens the persona window | false |
| `interface/terminalPopout` | auto-open the terminal window when a command starts | false |
| `interface/worktreeCleanupPrompt` | offer worktree cleanup after merges | true |
| `interface/settingsTab` | last Settings category; stale values fall back to the models category | models |
| `display/autoCollapseTools` | collapse tool output by default | false |
| `display/groupToolCalls` | group consecutive tool calls | true |
| `display/showReasoning` | whether reasoning bodies are shown in the transcript; meaning and default owned by REQ-CHAT-167 | false |
| `requirements/filter/{text,epic,source,lifecycle,health,priority}`, `requirements/sort`, `requirements/axis`, `requirements/blocked_column` | requirements board filter, sort, grouping axis and blocked-column display, global per user rather than per workspace (REQ-TRACE-301); meanings and defaults owned by domain 08 | per domain 08 |
| `requirements/fullPermissionRuns`, `requirements/fullPermissionNoticeSuppressed`, `requirements/answerWaitSeconds` | board run elevation and its notice, and the board answer wait; meanings and defaults owned by REQ-CONFIG-405 | per REQ-CONFIG-405 |
| `hooks/{record-key}/enabled` | enablement of an externally discovered hook group or hook record, keyed by a stable identifier for it; meaning owned by REQ-WORKSPACE-132 | unset |
| `panels/version` | one schema-version stamp covering all stored pane layouts | 1 when written |
| `panels/{view-key}/state`, `panels/{view-key}/panes` | per-divider layout state and pane count, global per user, keyed by a stable per-view string | unset |
| `updates/dismissedVersion` | the single remembered waved-off version | unset |
| `diagnostics/level` | diagnostics capture level for windows built afterwards; one of `off`, `light`, `deep` | `off` |
| `diagnostics/outputDir` | absolute folder diagnostics runs are written under; unset means the product default | unset |
| `workspaces/{workspace-key}/composerDraft` | per-workspace composer draft, debounced writes, keyed by workspace path | `""` |
| `workspaces/{workspace-key}/requirementColumnFolds` | per-workspace requirements board column folds, one JSON object string; meaning and default owned by REQ-TRACE-312 and REQ-TRACE-313 | `{}` |

Pane-size values are never written under `workspaces/`. Preference values may come back from native stores as strings; integer parsing is tolerant.

### Per-workspace prompt storage

Prompt history and stash are held per workspace in the durable store the application keeps for it (REQ-LIBRARY-138); this document names no path and fixes no format. No partly applied change is observable and no leftover working state is left behind. Save failure degrades to in-memory behavior with a persistent notice (REQ-SHELL-157).

### Terminal stream event model

- Each terminal stream has a stable identifier shaped `{kind}:{key}`. Two kinds exist: `fg:` for an agent's foreground terminal, where the key identifies the agent, and `bg:` for a background-session terminal, where the key is the session identifier. An identifier carrying no `:` separator, or an unrecognized kind, resolves to the fallback display name "Terminal". These raw identifiers appear in permission-audit summaries but never in window labels or accessible names (REQ-SHELL-082).
- Output is delivered per stream as ordered frames carrying a monotonically increasing sequence number. Metadata frames convey command text, running state, and truncation state, and applying the same metadata frame twice has the same effect as applying it once; data frames advance the emulated screen. How fast frames may be delivered is not per-stream alone: the aggregate rate across every live stream is bounded by REQ-MONITOR-306, and this appendix holds no copy of that bound. A viewer that attaches after output has already been produced is given the output accumulated so far, and a frame whose sequence number has already been applied to a stream is not applied to it again (REQ-SHELL-104).
- Each live stream may expose a control surface with: send-keys (text plus an optional end-of-line), optional resize (columns, rows), and optional kill. Absence of a capability makes the corresponding UI action fail predictably.
- The key encoding vocabulary is the one REQ-SHELL-096 fixes, shared between user input and the agent's own input path; this appendix holds no copy of it.

### Permission audit entries for user terminal actions

Each entry records: decision `user-input`, source `user`, tool name `terminal`, the reason sentence "The user acted in the terminal directly; no policy applies.", and a summary of the form `terminal {stream-id}: {detail} (in: {command})`. One entry per submitted line of typed input; control sequences log as "sent C-{letter}"; take-control, release-control, and kill log their own sentences. Typed lines and command text pass through the shared redaction pass of REQ-TOOLS-171 before writing; this appendix states no redaction rule of its own.

### Bundled assets read by the shell

- A third-party license bundle as a plain-text file shipped inside the installed build (opened locally from the About page; may legitimately be absent).
- A build-identifier text file (single stripped line; absent/unreadable means no build id).
- A vector brand-mark asset (missing or unrenderable degrades to the "R" placeholder).
- Three bundled font families covering display, body, and monospace roles (failure to load falls back to host fonts).

### Legal document URL set

Base `https://rotaris.ai` with paths `/privacy`, `/eula`, `/terms`, `/acceptable-use`, `/widerruf`, opened in the system default browser.
