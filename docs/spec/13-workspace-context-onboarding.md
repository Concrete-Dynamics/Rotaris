---
reference: ROTARIS-CRW-001
domain: workspace-context-onboarding
date: 2026-08-29
status: draft
---

# Workspace Handling, Context Injection, and Project Onboarding

## Overview

The product operates on a user-selected workspace folder: the desktop app resolves which folder to open at startup (remembering the last one, prompting on first launch), shows that folder's path alongside the checked-out git branch in its chrome, keeps per-workspace state in a `.rotaris/` directory layered with global configuration, injects workspace context files (`AGENTS.md`) and a discovered portable-skill catalog (`SKILL.md`) into every agent, runs a one-time background project-initialization step (code-intelligence indexing via a configured MCP server), gates repository-authored hook commands behind an explicit trust review, and guides first-run users toward provider authentication and (on bundled builds) machine tool setup. Throughout, "Serena" names the third-party code-intelligence tool reachable as the MCP server configured under the name `serena`; "Claude Code" names an external third-party assistant whose user-global settings may be imported read-only. All quoted strings, sizes, timeouts, and file layouts below are externally observable behavior.

## Requirements

### Application Launch and Command-Line Surface

- **REQ-WORKSPACE-001** — The desktop launcher SHALL present the program name `rotaris` and accept: an optional positional `workspace` argument (a workspace directory); `--demo` (help text "open with representative data") which opens the app populated with sample data and no live services; `--version`, which prints `Rotaris {version}` and exits with code 0; `--diagnostics [light|deep]` (value optional; when the flag is given without a value the mode is `light`; help text "record opt-in UI diagnostics (default mode: light)"); and `--diagnostics-output <path>` naming the base directory under which a timestamped diagnostics run is written.

- **REQ-WORKSPACE-002** — The command-line interface's run subcommand (and the large majority of other subcommands, e.g. requirements, verify, evaluate, session management) SHALL accept `-w/--workspace <path>` selecting the workspace root, defaulting to the current working directory, with help text "Workspace root directory (default: current working directory)".

- **REQ-WORKSPACE-003** — Given `--config <path>` on the command line, the normal layered configuration for the selected workspace SHALL be loaded first, and the named YAML file SHALL then be merged over it (the named file wins on conflicts).

- **REQ-WORKSPACE-004** — The command-line flag `--unsafe-outside-workspace` (help text "Allow file operations outside workspace (default: false)") SHALL widen the file-access boundary that is otherwise restricted to the workspace folder; the default is workspace-scoped access.

### Startup Workspace Resolution and First-Launch Onboarding

- **REQ-WORKSPACE-005** — Given an explicit workspace argument on the desktop command line, the app SHALL expand and resolve the path, open it directly with no folder chooser, and persist it as the last-opened workspace under the key `workspace/lastOpened` in the platform application-settings store.

- **REQ-WORKSPACE-006** — Given no explicit argument, the remembered `workspace/lastOpened` value SHALL be used if and only if it names an existing directory; in that case no prompt of any kind is shown.

- **REQ-WORKSPACE-007** — Given no explicit argument and no usable remembered path, the app SHALL open on a fallback workspace (default: the process current working directory) for first paint and schedule the first-launch project chooser to appear afterwards. A remembered path that no longer exists SHALL NOT be overwritten in the settings store at this point.

- **REQ-WORKSPACE-008** — The first-launch project chooser SHALL be deferred by exactly 650 ms after first paint. If the window is closed before the delay elapses, the prompt SHALL be cancelled cleanly (no dialog, no crash).

- **REQ-WORKSPACE-009** — Choosing a project folder SHALL use the operating system's native folder chooser, titled "Open a project folder", restricted to directories, starting at the given initial directory or else the user's home directory. Cancelling returns no selection and changes nothing; when the cancelled chooser was the first-launch prompt, a toast SHALL say: "Open a project folder when you're ready by selecting the workspace path in the title bar."

- **REQ-WORKSPACE-010** — Selecting the folder that is already the current workspace SHALL be a no-op.

- **REQ-WORKSPACE-011** — On a bundled build that still owes machine setup (see REQ-WORKSPACE-138), the machine-setup modal SHALL be scheduled after first paint with the same 650 ms delay; only after it completes SHALL the startup git refresh begin and — when this is also a first launch — the workspace chooser prompt continue.

### Workspace Switching

- **REQ-WORKSPACE-012** — Opening another project SHALL be refused while work is in flight, with an error toast stating exactly "Finish the worktree integration before opening another project." while a worktree integration is running, or "Finish the active run before opening another project." while any run is active or the run state is busy.

- **REQ-WORKSPACE-013** — A workspace switch SHALL construct a fresh main window for the selected folder. Given construction fails, the old window SHALL remain fully usable and an error toast SHALL say "Could not open the selected project: {reason}". Given construction succeeds, the replacement window is shown, the old window is closed (and if the old window vetoes its close, the replacement is closed instead and the old window stays), `workspace/lastOpened` is updated, and the git refresh, update check, and cloud-credit polling start on the new window.

- **REQ-WORKSPACE-014** — Post-show activation order SHALL be: window shown → git refresh starts (skipped until machine setup completes on a bundled first run) → update check starts → cloud-credit polling starts (skipped entirely in `--demo` mode).

- **REQ-WORKSPACE-015** — The main window SHALL be titled "Rotaris", open at 1440×900 with a minimum size of 1000×680, and offer exactly seven navigation views in this order: dashboard, workspace, mission, requirements, git, library, settings.

### Desktop Workspace and Branch Display

- **REQ-WORKSPACE-016** — The title bar SHALL contain a workspace control with accessible name "Open project folder" and accessible description "Current project: {workspace_path}. Opens the native project folder chooser."; it SHALL be keyboard-focusable, and both a mouse click and the Return key SHALL open the folder chooser.

- **REQ-WORKSPACE-017** — The title-bar workspace control SHALL render a folder icon, the workspace path in the monospace face at the smallest text scale, a `·` separator, and the current session name (or `—` when there is none); its rendering SHALL refresh on theme changes so colors follow the active theme.

- **REQ-WORKSPACE-018** — The bottom status bar SHALL keep one fixed height taken from the active theme (it never grows or shrinks with its contents) and lay out, left to right: workspace path (a link), git branch, flexible space, safety flags, model, token count, cost, cloud-credit balance, and background-session count. Of these, only the workspace path and the cloud balance SHALL be activatable; all other readings are non-interactive.

- **REQ-WORKSPACE-019** — The status-bar workspace path SHALL be a link with accessible name "Workspace folder" and tooltip/description "Workspace folder: {path}. Opens it in your file manager."; activating it opens the folder in the OS file manager, and a failure to open SHALL be silent.

- **REQ-WORKSPACE-020** — The status-bar branch item SHALL be non-clickable text with accessible name "Checked-out branch". It SHALL render a branch icon followed by the branch name, and — only when the ahead count of REQ-WORKSPACE-029 is greater than zero — a trailing ` ↑{n}`; the behind count SHALL never appear on this item. Its tooltip and accessible description SHALL be one and the same string: "Branch this workspace is on: {branch}, 1 commit ahead." for an ahead count of exactly one, "Branch this workspace is on: {branch}, {n} commits ahead." for a count above one, and "Branch this workspace is on: {branch}." for a count of zero. The item SHALL render as empty text — no icon, no arrow, no tooltip — exactly when the snapshot's branch name is empty, which per REQ-WORKSPACE-029 covers git being unavailable, the folder not being a repository, a detached HEAD, and an unborn branch. While the active run executes in an isolated worktree, the item SHALL identify that worktree rather than the base checkout's branch; the exact label shown in that case is an Open Question.

- **REQ-WORKSPACE-021** — Responsive elision: the status-bar path label SHALL be hidden when the window is narrower than 1180 px, and the background-session count label when narrower than 1080 px.

- **REQ-WORKSPACE-022** — The safety flags shown beside the path and branch SHALL be exactly these five, each with an explanation reachable both as its tooltip and as its accessible description:
  - a file-access scope flag, always present, reading `workspace-scoped` while file access is confined to the workspace folder, explained "File access: agents may read and write inside this workspace folder only.", or `outside-workspace!` once REQ-WORKSPACE-004 has widened it, explained "File access: agents may read and write outside this workspace folder.";
  - a `mode: {permission_mode}` flag, always present, carrying the active permission mode (whose value vocabulary belongs to the safety and permissions specification);
  - a `redaction: always on` flag, always present;
  - a `● CB armed` flag, present only while the circuit breaker is armed;
  - an `unsaved settings` flag, present only while settings hold edits not yet written to disk (REQ-WORKSPACE-039).

  Only the two file-access explanations are fixed here. The explanation text for the other four flags, and the value vocabulary `{permission_mode}` draws on as this domain should quote it, are an Open Question.

### Terminal-UI Status Bar

- **REQ-WORKSPACE-023** — The terminal UI SHALL render a status bar (a horizontal row below the right pane) with three parts: the workspace path, a separator, and the git branch. The path SHALL be resolved and then collapsed against the home directory (using the `HOME` environment variable when set, else the platform home): the home directory itself renders as `~`; a path under home renders as `~` + separator + relative part; any other path renders absolute.

- **REQ-WORKSPACE-024** — A path too wide for the bar SHALL be shortened from the middle, the removed span standing in as exactly one `…`. Given a budget of B characters: B ≤ 0 SHALL leave the path exactly as it is; B = 1 SHALL yield `…` alone; otherwise K = B − 1 characters of the original SHALL be kept — the first ⌊K/2⌋ of them from the start of the path and the remaining K − ⌊K/2⌋ from its end, joined by `…`, so the result is exactly B characters long. When a branch is shown the bar reads `{path} · {branch}` and B SHALL be max(4, width − 3 − length of the branch name), the 3 accounting for the `" · "` separator; with no branch B SHALL be the full bar width. A bar width that is zero or not yet known SHALL be treated as 80. This layout SHALL be recomputed on every resize. Whether the unit these budgets are counted in is the Unicode code point or the rendered terminal column is an Open Question; the arithmetic above holds whichever it turns out to be.

- **REQ-WORKSPACE-025** — Branch detection SHALL query git for the abbreviated symbolic name of HEAD (`git rev-parse --abbrev-ref HEAD`) in the workspace with a 1.0 s timeout, executed off the UI event loop. Result mapping: OS error or timeout → no branch; non-zero exit with stderr containing "not a git repository" or "fatal" → no branch (branch and separator both render empty); any other non-zero exit → literal `[detached]`; stdout exactly `HEAD` → `[detached]`; empty stdout → no branch; anything else → the branch name verbatim.

- **REQ-WORKSPACE-026** — Refresh cadence: on mount the bar SHALL sync its workspace (preferring the current session's workspace root, else the loaded configuration's workspace root, else the process working directory it was constructed with), render, and start a branch probe; thereafter it re-syncs and re-probes every 10.0 s. An explicit workspace/session switch SHALL trigger an immediate re-render and probe. A probe result arriving after the workspace changed SHALL be discarded (stale-result guard), and probes SHALL never overlap.

- **REQ-WORKSPACE-027** — A path or branch containing markup-like characters SHALL render literally (no markup interpretation). Rendering failures during application teardown SHALL be swallowed silently.

### Git Reading and Degradation

- **REQ-WORKSPACE-028** — Git interaction SHALL be read-only by default. Reads run git as a subprocess in the workspace with a 15 s timeout and UTF-8 decoding with replacement of undecodable bytes; on the read/refresh path any refusal, error, timeout, or missing binary SHALL degrade to an empty result (never an exception surfaced to the user). Mutating operations (worktree create/remove, repository preparation) SHALL instead fail with an error carrying git's own stderr, or — when git is absent — the exact message "Git is not available on this machine, so there is nothing to read or change."

- **REQ-WORKSPACE-029** — A workspace git snapshot SHALL be gathered without the interface ceasing to accept input, and SHALL become visible all at once: anything reading the snapshot while a refresh is under way SHALL see either the whole of the previous snapshot or the whole of the new one and never a mixture of the two, and a change notification SHALL follow the replacement. The snapshot SHALL contain: whether git is available; the current branch name, empty for a detached HEAD and for an unborn branch; the number of commits ahead of and behind the upstream, both zero whenever that comparison cannot be made (no upstream, no repository, or any failure); the list of worktrees, each carrying its branch name or the literal `detached` when it has none, together with a base branch of `main` or `master`; the 30 most recent commits, each with its date expressed relative to the present; the number of paths git reports as changed in the working tree; and diff statistics against HEAD, plus for each worktree the same statistics for its committed changes measured against its merge base with that worktree's base branch. Which figures those diff statistics comprise, whether untracked paths count towards the number of changed paths, and how a commit's relative date is rendered are Open Questions.

- **REQ-WORKSPACE-030** — The startup git refresh SHALL run exactly once, after the first frame is shown, without blocking the interface. User-requested git mutations SHALL refresh the snapshot synchronously at their own boundary.

- **REQ-WORKSPACE-031** — Given the `git` binary itself is missing (a version probe fails within the 15 s timeout), a persistent INFO notice with a stable identity SHALL be published: title "Working without Git", message "Git is not installed or not on PATH, so this workspace has no history and no worktrees. Everything else works, and Rotaris makes its changes in place instead of in a worktree of its own." A folder that merely is not a git repository SHALL raise no notice.

- **REQ-WORKSPACE-032** — A "Set up Git here" offer SHALL be available whenever git is installed, and when taken SHALL perform, in order:
  1. Initialize a repository only when the folder is not already one.
  2. Before any write, refuse if the git identity (`user.email`/`user.name`) is unset, with exactly this message:

     ```
     Git does not know who you are yet, so it cannot make a commit. Set that once, from anywhere:

         git config --global user.name "Your Name"
         git config --global user.email "you@example.com"

     Then take this offer again.
     ```
  3. Append (never rewrite) `.gitignore` with the comment line `# Rotaris keeps its sessions and delivery records here.` and the single rule `.rotaris/`, skipping the append when that exact rule is already present.
  4. Stage everything; if nothing ends up staged, fail with "There is nothing to commit yet — this folder is empty apart from what Rotaris keeps for itself. Add a file, then try again."
  5. Create exactly one commit with the message `Initial commit`.

  On success it SHALL report "Committed everything in this folder as “Initial commit”." with the suffix " '.rotaris/' was added to .gitignore." when the rule was added. The operation SHALL be idempotent (taking the offer twice never creates a second commit) and SHALL never contact or configure a remote.

- **REQ-WORKSPACE-033** — Live worktree records SHALL be joined against persisted session records by resolved worktree path, so a worktree row can display its session id, execution status, and merge status.

### Workspace State Directory and Configuration Layering

- **REQ-WORKSPACE-034** — Per-workspace state SHALL live under `<workspace>/.rotaris/`. The workspace-scope configuration file is `<workspace>/.rotaris/agents.yaml`; each configuration scope directory is additionally read for a `models.yml` file.

- **REQ-WORKSPACE-035** — A state directory left by the product's previous name (`.geraet-ai/` in the workspace; the analogous legacy per-user configuration and data directories) SHALL be adopted by a one-time rename to the current name when the current path does not yet exist; a failed rename SHALL be non-fatal.

- **REQ-WORKSPACE-036** — Configuration SHALL be assembled from five layers, listed here from lowest precedence to highest: built-in defaults, whose hook entries are stamped with origin scope `default`; MCP servers discovered from `.mcp.json` files; provider snapshot models recorded in the per-user configuration directory; global scope, being `<per-user-config-dir>/agents.yaml` together with `models.yml` from the same directory, whose hook entries are stamped `global`; and workspace scope, being `<workspace>/.rotaris/agents.yaml` together with `models.yml` from the same directory, whose hook entries are stamped `workspace`. A setting defined in more than one layer SHALL take its value from the highest-precedence layer that defines it; a setting a layer leaves undefined SHALL keep the value it had from below. A list-valued setting SHALL be replaced whole by the higher layer rather than appended to (REQ-WORKSPACE-125 states the one exception, which applies to untrusted workspace hook lists). The workspace root defaults to the current working directory. The file name, location, and format of the provider snapshot layer are an Open Question; nothing above depends on them beyond its position in the precedence order.

- **REQ-WORKSPACE-037** — `.mcp.json` discovery SHALL read the project file `<workspace>/.mcp.json` and one per-user file (macOS `~/Library/Application Support/mcp.json`; Windows `%APPDATA%/mcp.json`; otherwise `~/.config/mcp.json`). User entries load first; project entries overwrite same-named servers. Both `mcpServers` and `servers` top-level maps are accepted. Server names must match `^[a-zA-Z][a-zA-Z0-9_-]*$`. A server's type defaults to `http` when a `url` is present, else `stdio`. Supported per-server fields include `env`, `envFile` (resolved relative to the JSON file's directory; explicit `env` entries win over the file), and `cwd`. The placeholders `${workspaceFolder}` and `${env:NAME}` SHALL be substituted; an unknown placeholder logs a warning and is left as-is. Malformed files or entries SHALL be skipped with warnings, never aborting configuration load.

- **REQ-WORKSPACE-038** — A minimal bootstrap `agents.yaml` SHALL be writable. Its content is fixed rather than generated, and SHALL contain the comment lines `# Rotaris minimal startup config.`, `# Edit to override built-in personas, models, or MCP servers.`, and ``# Run `rotaris-cli login <provider>` to wire up real models.``, the setting `default_persona: orchestrator`, and every model slot and thinking field present with an explicit null value (the exact key names making up that set are an Open Question). The file SHALL be written to a temporary file and then put in place by replacement, and SHALL end up with mode 0o644. A write request SHALL do nothing and report the reason "already exists" unless overwriting was explicitly asked for. Bootstrap SHALL be reported as needed when the target path is missing, holds nothing but whitespace or nothing at all, is a directory, or cannot be decoded as text.

- **REQ-WORKSPACE-039** — Saving desktop settings SHALL read `<workspace>/.rotaris/agents.yaml`, change it, and put the result back through an atomic replace. Top-level keys the application does not itself manage SHALL survive the round trip verbatim. The sections the save rewrites are the model slots and the runtime, circuit-breaker, compressor, skills, and product-configuration sections. A persona edit whose chosen scope is global SHALL be written to the global `agents.yaml` instead of the workspace one. A security-policy value that fails schema validation SHALL abort the save before any file is opened for writing, leaving every configuration file byte-for-byte as it was, and SHALL report the failure. A save that completes SHALL be followed by a configuration reload and by re-projecting the skill list from a freshly discovered catalog. Which configuration keys the product-configuration section covers, and the schema a security-policy value is validated against, are an Open Question.

- **REQ-WORKSPACE-040** — Writers of the persisted initialization state SHALL round-trip the entire YAML document and land via atomic replace, so that a crash partway through writing cannot leave the user's configuration truncated; when no `agents.yaml` exists, the minimal bootstrap file SHALL be written first.

### Workspace Context Injection (AGENTS.md)

- **REQ-WORKSPACE-041** — Context-file discovery SHALL be workspace-root-only: in the resolved workspace root, `AGENTS.override.md` is used when present, otherwise `AGENTS.md`; nothing else. Specifically, user-global context files, git-root or intermediate-directory context files, and root-level `CLAUDE.md`/`GEMINI.md` files SHALL NOT be read or injected even when present.

- **REQ-WORKSPACE-042** — Given both `AGENTS.override.md` and `AGENTS.md` exist at the workspace root, only the override file's content SHALL appear in the merged output; the regular file's content SHALL be absent.

- **REQ-WORKSPACE-043** — Merged-output format: each contributing file's content SHALL be preceded by a one-line HTML comment `<!-- source: {absolute path} -->` on its own line; blocks SHALL be separated by one blank line; concatenation follows discovery order.

- **REQ-WORKSPACE-044** — Size limits SHALL default to 32,768 bytes for any one context file and 131,072 bytes for the merged output, both measured as UTF-8 bytes and both overridable per call. A file exceeding the per-file limit SHALL be cut back to the last line boundary that fits within it; a file whose very first line already exceeds the limit SHALL contribute nothing at all. Against the total limit, the budget left for a file SHALL be reckoned after its source-comment line has been charged: a file that does not fit whole SHALL be cut down to whatever budget remains, and a file for which no budget remains — including the case where its source comment alone would exhaust it — SHALL be dropped in its entirety, source comment included. Every truncation and every drop SHALL produce a log warning naming the file concerned. The merged output SHALL never exceed the total limit. Whether a cut made against the total budget also falls back to the last line boundary that fits, as a cut against the per-file limit does, or instead stops at the exact remaining byte count, is an Open Question.

- **REQ-WORKSPACE-045** — A whitespace-only context file SHALL be skipped silently (no block, no source comment). An unreadable file (I/O or decoding error) SHALL be skipped with a warning naming the path and the error, without aborting discovery.

- **REQ-WORKSPACE-046** — Merged context SHALL be cached per workspace root and kept for as long as the session lasts; subsequent injections reuse the cache without touching the filesystem. The cache (together with the skill-catalog cache) SHALL be cleared on every session creation, so each new session re-reads context files from disk. An explicit cache-clear operation SHALL force a reload.

- **REQ-WORKSPACE-047** — Given context injection is enabled and the merged content is non-empty, each agent built for that session SHALL receive the content as its own permanently active context block, ordered ahead of the skill catalog, ahead of any always-on skill bodies, and ahead of persona memory. With no context files, or injection disabled, no such unit SHALL be constructed.

- **REQ-WORKSPACE-048** — The per-workspace configuration key `inject_agents_md` (boolean, default `true`) SHALL control injection; when false, no context file is read at all.

- **REQ-WORKSPACE-049** — Discovering and merging workspace context files SHALL complete within 200 ms for a workspace holding up to 20 context files totalling 1 MiB on local storage. It SHALL NOT delay the moment the interface first accepts input, and the window SHALL keep responding to input for as long as it runs. For an unchanged filesystem state, running it again in a separate process SHALL yield byte-identical output: the merged text SHALL carry no timestamp, no process identifier, and no ordering that varies from run to run. The reference conditions the 200 ms figure is measured under — machine class, storage type, and whether the filesystem cache is warm — are an Open Question; the determinism and responsiveness guarantees stated here hold unconditionally.

- **REQ-WORKSPACE-050** — When a run executes in an isolated worktree, workspace context files SHALL be read from the run's execution root, while the portable-skill catalog and persona memory SHALL be discovered from the user-selected base workspace, so persistent workspace metadata stays with the base workspace.

### Portable Skill Discovery and Parsing (SKILL.md)

- **REQ-WORKSPACE-051** — Skill discovery SHALL search the locations below in exactly the order given, the first location to yield a particular normalized name winning outright over every later one:
  1. Project scope, covering every directory from the resolved workspace root upwards to and including the enclosing repository root — the nearest ancestor holding a `.git` entry, which may be a directory **or** a file so that a linked worktree root also ends the walk, and the workspace root itself when no such ancestor exists. Directories SHALL be visited nearest first, and within one directory `<dir>/.agents/skills/<name>/SKILL.md` SHALL be searched before `<dir>/.opencode/skills/<name>/SKILL.md`.
  2. User scope, searched in the order `~/.agents/skills`, then `~/.config/opencode/skills`, then `~/.openhands/skills/installed`, then the machine-wide `/etc/codex/skills`.

  Every project-scope location SHALL outrank every user-scope location. Within any of these roots, only immediate child directories count, and only those holding a `SKILL.md` file; children SHALL be visited in ascending name order, so that the outcome never depends on the order the filesystem happens to list them in. On a platform that has no `/etc/codex/skills`, whether user scope simply ends at the three home-relative roots or a platform-specific machine-wide path takes its place is an Open Question.

- **REQ-WORKSPACE-052** — Given `~/.openhands/skills/.installed.json` exists, skill directories whose name (or normalized name) matches a disabled entry SHALL be skipped. Accepted manifest shapes: a map with a `disabled: [names]` list; a map whose values are maps carrying `disabled: true` (any of the entry key, a `name` field, or a `path` field identifies the skill); or a list of maps with `disabled: true`. An unreadable manifest SHALL log a warning and disable nothing.

- **REQ-WORKSPACE-053** — A valid `SKILL.md` SHALL begin with YAML frontmatter delimited by `---` lines; the frontmatter must be a mapping and must contain `name` and `description`. Invalid files SHALL be skipped with a logged reason (e.g. missing frontmatter, malformed YAML, missing required field, unsupported trigger shape, unreadable file) and discovery SHALL continue — an invalid skill never crashes startup. Unknown frontmatter fields SHALL be preserved and available as raw metadata.

- **REQ-WORKSPACE-054** — Skill names SHALL normalize as: lowercase; every run of characters outside `[a-z0-9]` becomes `-`; leading/trailing `-` stripped. A name normalizing to empty is invalid. On collision the earlier (higher-priority) skill SHALL win, and the shadowed one SHALL be recorded and reportable per name.

- **REQ-WORKSPACE-055** — The canonical trigger shape SHALL be `trigger: {type: keyword, keywords: [...]}`; legacy top-level `type:` plus `triggers:` aliases SHALL be accepted and normalized. Only the `keyword` type is supported; the keyword collection SHALL contain nothing but strings; entries are stripped and de-duplicated preserving order. Description whitespace SHALL be collapsed to single spaces.

- **REQ-WORKSPACE-056** — A skill's invocation mode SHALL derive from frontmatter: `user-invocable: false` → auto-only; `disable-model-invocation: true` → manual-only; otherwise default.

- **REQ-WORKSPACE-057** — Manually loading a skill SHALL accept a path to a `SKILL.md` file or a directory containing one, with `~` expansion and relative paths resolved against the workspace root; failures are "SKILL.md not found: {raw}" and "manual skill path must be a SKILL.md file or directory: {raw}". Manual skills carry the scope label `manual`, override a discovered skill of the same normalized name, apply to the current session only, and persist nothing.

- **REQ-WORKSPACE-058** — The skill catalog SHALL be cached per resolved workspace root and cleared on every session creation, so skills are re-discovered from disk at each new session; discovery runs automatically on workspace open with no user action.

- **REQ-WORKSPACE-059** — The sorted, resolved set of all cataloged skill directories SHALL be registered as additional read roots for agent file tools: an agent can read a `SKILL.md` and its sibling resources even when the skill directory lies outside the workspace, while writes to those roots SHALL still be rejected.

### Skill Catalog Injection and Load Policies

- **REQ-WORKSPACE-060** — At agent construction a compact skill catalog SHALL be injected as its own always-active context unit, distinct from the persona prompt, the workspace context unit, and persona memory. Ordering of injected context units SHALL be: workspace context → skill catalog → force-loaded skill bodies → persona memory.

- **REQ-WORKSPACE-061** — The catalog block SHALL contain a preamble followed by exactly one entry per catalogued skill and nothing else. The preamble SHALL convey three facts, in wording of the implementation's choosing: that every entry below names a `SKILL.md` file that exists on disk; that such a file is to be opened only when the task in hand calls for it; and that none of those files' contents have already been supplied. Each entry SHALL be a single line carrying, in this order, the skill's normalized name, its description, and the absolute path of its `SKILL.md`, in the shape given under Data & Formats. Entries SHALL appear in ascending normalized-name order. No skill's body text SHALL appear anywhere in the block.

- **REQ-WORKSPACE-062** — Each skill SHALL carry a load mode drawn from the closed set `off | name-only | user-invocable-only | on`, defaulting to `name-only`, and offered in the user interface under the labels "hidden" / "on-demand" / "manual only" / "always". The mode determines what an agent ends up with:
  - `name-only`: an entry for the skill is present in the injected catalog, and the user can invoke it.
  - `on`: no entry for the skill is present in the catalog; in its place the skill's body, with the YAML frontmatter removed, is present as an always-active block of its own. That block SHALL be introduced by a statement naming the skill and directing that its guidance apply from that point onwards — unconditionally, with no trigger phrase awaited and no question asked about whether to activate it. Given the body cannot be read, no such block SHALL be present, every other part of the agent's context SHALL be exactly as it would otherwise have been, and a log warning naming the skill SHALL be emitted.
  - `user-invocable-only`: no entry for the skill is present in the catalog, and the user can still invoke it.
  - `off`: the skill appears nowhere and cannot be invoked.

- **REQ-WORKSPACE-063** — Each skill SHALL have an invocation mode from `default | manual-only | auto-only`: manual-only removes it from the model-facing catalog (user command only); auto-only removes it from user invocation (model catalog only). Workspace-configured invocation overrides SHALL take precedence over the frontmatter-derived mode.

- **REQ-WORKSPACE-064** — A global switch `skills.enabled` (default `true`) SHALL control the whole feature: when false, no catalog is injected, no body is force-loaded, and no skill is user-invocable.

- **REQ-WORKSPACE-065** — The chosen per-workspace load and invocation policies SHALL be persisted in `<workspace>/.rotaris/agents.yaml` and SHALL govern agents constructed afterwards. A workspace with no recorded policy SHALL behave as on-demand load with default invocation for every skill (zero-migration default).

- **REQ-WORKSPACE-066** — Skill bodies SHALL enter model context only through the agent's own filesystem/shell tools, an explicit user command, or the "always" load policy; the framework SHALL NOT pre-fetch or rewrite bodies, and scripts referenced by skills run via the shell with only their stdout/stderr entering context.

### Skill Controls in Settings

- **REQ-WORKSPACE-067** — The Settings Skills tab SHALL show: a header card "Portable skills" with a toggle labeled "Enable skills" (accessible name "Enable portable skills", description "Controls whether any portable skill is injected into newly created agents"); a table with columns Skill, Source, Trigger, Load, Description (description also as tooltip); for a skill that shadows duplicates, a Source cell of `{scope}  ⓘ` with tooltip "Workspace skill wins. Ignored duplicate(s):" followed by the shadowed `SKILL.md` paths; a per-row invocation selector (accessible name "Invocation policy for {name}") offering "default (both)", "manual only", "auto only"; a per-row load selector (accessible name "Load policy for {name}") offering "on-demand", "always", "manual only", "hidden"; and the empty state "No portable skills were discovered."

- **REQ-WORKSPACE-068** — Policy setters SHALL reject unsupported values with the errors "Unsupported skill load mode: …" / "Unsupported skill invocation mode: …", mark settings dirty, and emit a change notification. Saving SHALL write only non-default policies, keyed by normalized skill name, into `skills.overrides` and `skills.invocation_overrides`.

- **REQ-WORKSPACE-069** — Rescan behavior: the skill list SHALL be re-projected from a fresh catalog on configuration load and save; the typeable-command catalogue SHALL be rebuilt whenever the library or settings change; and session creation clears both discovery caches. No separate "rescan skills" control is required (see Open Questions).

### Typeable Commands from Skills (Desktop Composer and TUI)

- **REQ-WORKSPACE-070** — In the desktop composer, typing `/` SHALL open a suggestion popup. Matching ranks prefix matches first, then name-substring, then description-substring, each group in registration order. A leading `/ ` (slash then space) escapes a literal prompt; input spanning more than one line SHALL NOT be treated as a command; Tab completes; Enter completes-or-runs (runs when the full name is already typed); Escape closes; names are case-insensitive. Execution outcomes SHALL be: executed; not-a-command; unknown-command with message "Unknown command /{name}"; unavailable with a reason string; failed with the handler's failure message.

- **REQ-WORKSPACE-071** — Every command-palette entry SHALL also be a typeable slash command. Additionally the run commands `/stop`, `/pause`, `/compress`, `/clear`, `/new`, `/resume`, `/sessions`, `/search`, `/worktree`, `/stash`, `/pop` SHALL exist with availability reasons such as "No run is active.", "The transcript is empty.", "No git service is available for this workspace.", "No models are configured. Choose one in Settings.", plus the argument commands `/model <name>` and `/persona <name>` with usage and unknown-name errors.

- **REQ-WORKSPACE-072** — Every discovered skill except those with invocation mode auto-only SHALL register a command under its normalized name and, when present, under its slash trigger keyword (leading `/` stripped, then normalized); first registration wins; the command carries the kind badge `skill`. Command names normalize by replacing runs of characters outside `[a-z0-9:_.-]` with `-`.

- **REQ-WORKSPACE-073** — Invoking a skill's command in the desktop composer while `skills.enabled` is false SHALL fail with "Skills are disabled. Enable them in Settings." and SHALL leave that skill's load mode as it was. Otherwise the skill's load mode SHALL become `on`, so that the agent constructed for the next prompt receives that skill's body as a force-loaded context block per REQ-WORKSPACE-062, and a toast SHALL read "Skill loaded for the next prompt: {name}". Whether that change survives the session is an Open Question.

- **REQ-WORKSPACE-074** — The TUI `/skills` command (description "List discovered SKILL.md files") SHALL output the header "Discovered SKILL.md files:", then per skill a line `- {name} [{scope}] in_context={yes|no} triggers={/kw,…|-}`, a one-line description truncated to 120 characters with `...`, and the `SKILL.md` path; the output is appended to the transcript as a persisted system message and a toast reads "Listed {n} skill(s).". An empty catalog yields "No SKILL.md files discovered."

- **REQ-WORKSPACE-075** — The TUI `/skill <path>` command (description "Load a SKILL.md for this session (usage: /skill <path>)") SHALL strip surrounding quotes from the path; a missing argument yields "Usage: /skill <path-to-SKILL.md-or-directory>"; parse errors surface verbatim as error notifications; success re-registers skill commands and toasts "Loaded skill: {name}".

- **REQ-WORKSPACE-076** — Each cataloged skill SHALL register a TUI command under its normalized name plus one per slash-prefixed trigger keyword (names already taken are skipped with a debug log), each described as "Load skill: {name}".

- **REQ-WORKSPACE-077** — Invoking a TUI skill command SHALL read the skill body and inject a steering payload for the current turn, formatted exactly:

  ```
  [SKILL.md]
  Name: {name}
  Source: {path}

  {raw body}
  ```

  It SHALL mark the skill as in-context, and the typed command text itself SHALL NOT be submitted to the model as a user prompt. Read failures notify "Unable to read skill {name}: {exc}".

### Project Initialization Framework

- **REQ-WORKSPACE-078** — Persistent initialization state SHALL be the `initialization:` section of `<workspace>/.rotaris/agents.yaml` with fields `completed: [ids]`, `skipped: [ids]`, `last_run: <ISO-8601 UTC>`, `classification: code|non-code|null`. A missing file, missing key, or bare empty section reads as a default state that is "never initialized". Never-initialized SHALL mean: no `last_run` and both lists empty. A task is resolved when its id appears in either list.

- **REQ-WORKSPACE-079** — Recording an outcome SHALL move, not duplicate: the task id is removed from both lists first, then appended to the chosen one. `classification` SHALL be overwritten only by a non-null value. `last_run` SHALL be stamped on every recorded outcome, the degenerate case of "no task applied" included; that stamp on its own is what stops such a workspace from still counting as never initialized. Writes SHALL preserve every other top-level YAML key and be atomic.

- **REQ-WORKSPACE-080** — An initialization task SHALL be described by an id, display label, description, an applicability predicate, a runner, and a consent flag defaulting to false. Registering a duplicate id SHALL fail with "Initialization task '{id}' is already registered" unless replacement is requested; unregistering an unknown id is a no-op. An applicability predicate that raises SHALL be logged and treated as "not applicable". A setup task added after the fact SHALL participate in the prompt and in the setup UI under exactly the rules stated here, with no additional behavior of its own.

- **REQ-WORKSPACE-081** — The task sets SHALL be derived as follows, from the applicability predicate of REQ-WORKSPACE-080 and the two persisted lists of REQ-WORKSPACE-078. A task is *applicable* when its predicate is satisfied, whatever is recorded about it; a predicate that raises counts as not applicable (REQ-WORKSPACE-080). It is *pending* when it is applicable and its id appears in neither the completed list nor the skipped list. It is *runnable* when it is applicable and its id is not in the completed list — a skipped task therefore remains runnable and is offered again by a manual initialization. It is a *background* task when it is pending and does not require consent, and a *consent* task when it is pending and does require consent. An id that a hand-edited file has placed in both lists at once counts as completed, and is therefore neither pending nor runnable. A skipped id is not a pending one, so reopening the workspace SHALL NOT restart a background task the user has skipped; only the manual initialization of REQ-WORKSPACE-113 brings such a task back.

- **REQ-WORKSPACE-082** — The setup prompt SHALL be shown if and only if at least one consent-requiring task is pending. Whether the workspace as a whole has ever been initialized SHALL play no part in that decision, so finishing a background task can never swallow a prompt still owed for a consent-requiring task pending beside it. A task that declares nothing about consent behaves as background.

- **REQ-WORKSPACE-083** — On workspace open, resolution SHALL run once and produce: for a never-initialized workspace with no applicable task, a silent marking as initialized (empty task list, `last_run` stamped) with nothing shown or started; for pending consent tasks, a prompt request listing the runnable tasks; for pending background tasks, an immediate-start list regardless of whether a prompt is also due. Where the sole outstanding work in such a workspace is background work, no marker SHALL be written up front; it is stamped only once that work has run to completion.

- **REQ-WORKSPACE-084** — An execution SHALL attempt every runnable task, in registration order, and SHALL arrive at exactly one outcome per attempted task: a task that succeeds is recorded as completed; a task that reports a skip is recorded as skipped; a task that fails has nothing recorded and therefore remains pending and can be run again later. A task that ends without reporting any of those three outcomes SHALL be treated as a failure and SHALL be reported with an error message describing what went wrong. Whatever outcome a task reaches, the tasks after it in the order SHALL still be attempted; no single task can cut the execution short. An execution that finds no runnable task SHALL nevertheless stamp `last_run` on a never-initialized workspace, so that running nothing leaves the workspace initialized rather than eligible to prompt again.

- **REQ-WORKSPACE-085** — The persisted initialization marker SHALL be written from exactly one place, so a task itself never records its own outcome. A task that ran successfully but whose marker write fails SHALL be downgraded to a retryable failure with error "{label} completed, but the workspace config could not be written: {exc}" and summary "{label} finished, but the result could not be saved. Retry initialization."

- **REQ-WORKSPACE-086** — Skipping SHALL record every given pending task id as skipped; even when the id list is empty the marker is stamped, so after any skip the workspace has left the never-initialized state and the prompt cannot return on the next open.

- **REQ-WORKSPACE-087** — A task result SHALL carry: a status from the closed set success | skipped | failure; an ordered list of step results (name, status, detail) where step status is an open vocabulary (generic success/skipped/failure plus task-specific values such as `skipped-no-code`); a classification to forward into recorded state; an error message (shown next to the retry action); a retryable flag; and a one-to-two-sentence summary. The UI SHALL render each step's detail text, not its status token.

### Registered Setup Task: Code-Intelligence Indexing

- **REQ-WORKSPACE-088** — The single task registered by default SHALL have id `serena-setup`, label "Serena project setup", description "Index this project's symbols with Serena so coding personas can search symbols and references without re-reading the tree.", and SHALL NOT require consent: its outcome depends only on the workspace contents — it consults no model, needs no authenticated provider, and holds no agent conversation — so it starts by itself when the workspace opens, raising no dialog and gating no run.

- **REQ-WORKSPACE-089** — The id `serena` SHALL NOT identify any registered task. A workspace whose persisted state records `completed: [serena]` therefore still owes `serena-setup`, and the indexing runs for it.

- **REQ-WORKSPACE-090** — The task SHALL be applicable exactly when the resolved configuration holds an MCP server named `serena` and that server is launchable on this machine. A server of type `http` or `sse` SHALL count as launchable on the strength of its configuration alone. A server of type `stdio` SHALL count as launchable exactly when the executable named by the first token of its expanded command is found on the PATH in force for the application — which, on a bundled build, includes the managed tool directories that REQ-WORKSPACE-138 prepends, so the bundled command token `rotaris-serena` resolves once machine setup has completed. The PATH check SHALL be made **after** shorthand expansion, not before: `uvx:pkg` expands to `uvx pkg`, and a command beginning `npm:` or naming an `@scope`-prefixed package expands to `npx -y <pkg>`. An entry written in shorthand SHALL therefore count as launchable whenever the command it expands to is present. How a `stdio` command written as a path rather than as a bare executable name is judged launchable is an Open Question.

- **REQ-WORKSPACE-091** — Setup SHALL consist of exactly three stages, executed in this order, each bounded by its own wall-clock budget: project configuration, 300 s; symbol indexing, 1800 s; memory-layout seeding, 120 s. A stage that exceeds its budget SHALL count as a failed stage, with its processes ended as REQ-WORKSPACE-092 requires and its failure reported as REQ-WORKSPACE-093 requires. No verification stage SHALL run after indexing: a stage that runs to completion and returns a zero exit code is the only signal that it succeeded.
  - Project configuration invokes the tool's own command line to create the project entry. The language selections SHALL be passed on that command line, so the stage completes without ever waiting on an interactive prompt; the languages passed are those the source-file extensions actually present in the tree correspond to. The stage SHALL be idempotent: when `<workspace>/.serena/project.yml` already exists it SHALL report success with the output "project file already exists; left as is", SHALL NOT run creation again, and SHALL leave whatever language selections are recorded in that file untouched.
  - Symbol indexing builds the symbol cache. For a workspace classified `non-code` (REQ-WORKSPACE-098) it SHALL be skipped, recording step status `skipped-no-code` and detail "No source files found, so there are no symbols to index."
  - Memory-layout seeding initializes the memory layout. For a workspace classified `non-code` it SHALL be skipped, recording detail "No source files found, so no memory layout was seeded."

  A stage that fails SHALL end the run: the stages after it SHALL NOT start, nothing SHALL be recorded in persisted state, and the result SHALL be retryable.

  Three facts each stage's command line depends on are Open Questions: the argument tokens a stage appends to the prefix derived in REQ-WORKSPACE-096; the mapping from source-file extension to the language identifiers passed on the project-configuration command line; and the step status token recorded when memory-layout seeding is skipped for a non-code workspace (indexing's `skipped-no-code` is fixed above, seeding's is not).

- **REQ-WORKSPACE-092** — A setup step's captured output SHALL be interpreted as UTF-8, and non-ASCII characters in it SHALL survive into that step's reported detail instead of causing the step to fail. When a step exhausts its time budget, when setup is cancelled, or when the application is closed while setup is running, nothing the step launched SHALL still be running 5 s later — neither the command the step itself started nor anything descended from it. A step that was stopped before finishing SHALL be reported distinguishably from one that ran to completion and returned a non-zero exit code: the detail for an exhausted budget SHALL read "This step did not finish within its time budget."; the detail for a cancelled step SHALL read "Setup was stopped before this step finished."; every other step's detail SHALL be the last 400 bytes of its combined standard output and standard error.

- **REQ-WORKSPACE-093** — Failure reporting SHALL be "{reason}: {detail}" with per-stage reasons "Serena could not create this project's configuration" / "Serena could not index this project's symbols" / "Serena could not seed this project's memory layout"; the result is retryable, and cancelling leaves the task in exactly the same retryable condition a failure would, with summary "Serena setup did not complete for this project. It runs again the next time this workspace is opened."

- **REQ-WORKSPACE-094** — Given the configured `serena` entry does not start the tool locally — its type is something other than `stdio`, or its resolved arguments carry no server-launch verb — the task SHALL fail non-retryably with error "This workspace's `serena` entry is not a local Serena launch, so its setup commands cannot be derived from it." and summary "Serena project setup was skipped: the configured `serena` server is not one Rotaris can run setup commands against." — no substitute invocation SHALL be attempted.

- **REQ-WORKSPACE-095** — Success summaries SHALL be, for a code workspace, "Serena is set up for this project and its symbols are indexed.", and for a non-code workspace, "Serena is set up for this project. No symbols were indexed because the workspace contains documentation only." The result SHALL carry a full audit trail of every command run (arguments, return codes, output) for diagnostics.

- **REQ-WORKSPACE-096** — Every setup command SHALL be built from the same configured `serena` entry that the application uses to launch the MCP server. That entry's command SHALL be expanded through the shorthand rules of REQ-WORKSPACE-090 and then cut at the first argument equal to the server-launch verb `start-mcp-server`: the executable and any arguments preceding that argument form the prefix of each setup command, while the verb itself and everything after it — the context, transport, and project arguments, which concern the server session only — SHALL NOT appear in any setup command. The cut point SHALL be found by looking for that verb, not by matching the server name and not by matching the executable path, so an entry naming a different install location or a different version SHALL still be honored and the setup commands SHALL run against the same installation the server runs from. What each stage appends after that prefix is an Open Question (REQ-WORKSPACE-091).

- **REQ-WORKSPACE-097** — The code-intelligence server SHALL come up already pinned to the workspace of the run that started it: a launch command carrying neither `--project` nor `--project-from-cwd` gets `--project <workspace_root>` appended, so the server is bound to that one project and never offers agents any project-switching capability. The default configuration SHALL ship `serena` as a stdio server on the bundled command token `rotaris-serena` with arguments beginning `start-mcp-server --context ide --transport stdio`, pinned to the exact tool version the build installs; the shipped defaults SHALL contain no second code-intelligence server.

### Workspace Classification (code vs non-code)

- **REQ-WORKSPACE-098** — A workspace SHALL classify as `code` when at least one file anywhere beneath the workspace root carries an extension from the configured source-extension set, and as `non-code` in every other case — a verdict that covers empty trees, a workspace directory that does not exist, and documentation-only trees alike. The walk SHALL descend into every subdirectory except `.git/`, and SHALL disregard any path the workspace-root `.gitignore` matches (REQ-WORKSPACE-100). Whether extension matching ignores letter case, and whether the walk follows symbolic links to directories, are Open Questions.

- **REQ-WORKSPACE-099** — The default source-extension set SHALL be exactly these 23 entries: `.py .js .ts .jsx .tsx .rs .go .java .c .cpp .h .hpp .rb .php .swift .kt .scala .cs .fs .ex .exs .r .jl`, and the same set SHALL apply everywhere classification is decided. It SHALL be overridable per workspace via `project_init.source_extensions` in `.rotaris/agents.yaml`, with entries normalized (lower-cased, a leading dot added, blanks dropped).

- **REQ-WORKSPACE-100** — Only the `.gitignore` at the workspace root SHALL be consulted; an ignore file in any subdirectory SHALL have no effect on classification. Its patterns SHALL be interpreted with gitignore-style wildcard matching, and a directory pattern SHALL match a candidate path whether or not that path carries a trailing slash. An ignore file that is missing, empty, or unreadable — or an inability to perform the matching at all — SHALL leave classification treating nothing as ignored, and SHALL NOT make classification fail. Whether negation patterns (`!`) and `**` path patterns are honored here, or only simple wildcards are, is an Open Question.

- **REQ-WORKSPACE-101** — The verdict SHALL be recorded in the persisted initialization state, and the Settings Project area SHALL explain outcomes with "No code memories were created — this workspace is a documentation-only project." or "Code memories were created from this workspace's sources."

### Initialization UI, Consent, and Run Gating (Desktop)

- **REQ-WORKSPACE-102** — Initialization SHALL be resolved automatically exactly once per workspace open, and SHALL NOT begin before the window is on screen and accepting input, so that the window paints and answers input no matter how the resolution goes. A resolution that fails SHALL leave the window fully usable: the error surface SHALL read "Project setup could not be checked" / "Rotaris could not work out whether this workspace still needs setting up. Runs are not blocked; you can check again.", SHALL offer a "Check again" action, and the composer gate of REQ-WORKSPACE-112 SHALL stay off. Activating "Check again" SHALL resolve initialization once more, producing the outcomes of REQ-WORKSPACE-083 when it succeeds and this same error surface when it fails again; such a user-requested check is additional to, and does not consume, the one automatic resolution per workspace open.

- **REQ-WORKSPACE-103** — Background tasks SHALL start immediately, without any dialog and without blocking the interface; nothing renders their progress live; the recorded outcome is visible in Settings Project. Success is silent. A failed background run SHALL reach an error banner "Project setup did not finish" carrying the task's own summary (fallback "Rotaris could not finish setting this workspace up for code search.") and a "Try again" action; a run that broke down entirely additionally states "Runs are not blocked; you can try again."

- **REQ-WORKSPACE-104** — With the current default task set, a fresh workspace SHALL open without any prompt and without gating runs. The consent dialog and the composer gate SHALL appear only once some pending task requires consent, and SHALL then behave exactly as specified above without further configuration.

- **REQ-WORKSPACE-105** — The initialization state the user interface works from SHALL comprise exactly these nine values: the pending tasks; those pending tasks that require consent; the completed tasks; the skipped tasks; the classification; whether the workspace has never been initialized; the last-run timestamp; whether a run is in progress; and the last error. The setup prompt SHALL be due exactly when at least one consent-requiring task is pending and no run is in progress. Recomputing the state SHALL be idempotent as far as the user can tell: when every one of those nine values comes out equal to the value already on display, nothing visible SHALL change — in particular a configuration reload SHALL NOT reopen a dialog the user has already answered — and the dialog SHALL be opened automatically at most once per workspace open. Task ids SHALL be shown as display labels: both `serena-setup` and the legacy id `serena` display as "Serena project setup", and any other id displays as itself. An id read back from persisted state that matches no currently registered task SHALL be treated as requiring no consent. The comparison that decides two such states are equal — in particular whether the order of ids within the task lists is significant — is an Open Question.

- **REQ-WORKSPACE-106** — The consent dialog SHALL be a non-modal, window-level dialog (the rest of the app stays navigable) titled "Set up this project" with headline "Set up this project?" (or "Nothing to set up") and intro "{n} one-time setup task(s) can run in this workspace. They run once; you can skip them and start any time from Settings › Project." (or "This workspace has no setup task left to run."). Each task renders a card with its label, a live status word (Pending/Running/Done/Skipped/Failed), and its description. Buttons: "Skip for now" (secondary; description "Defer these tasks. You can run them later from Settings › Project.") and "Initialize project" (primary and default; description "Run every listed task now. Each one reports its own result below."). The dialog has four states: prompt → running → done | error.

- **REQ-WORKSPACE-107** — Every dialog exit path SHALL yield an explicit decision: dismissing with Escape, or with the window's own close control, SHALL resolve as a skip. When the underlying prompt request disappears while an auto-opened dialog is still unanswered, the window SHALL close it without recording a skip; a dialog the user opened manually SHALL never be auto-closed.

- **REQ-WORKSPACE-108** — In the running state both buttons SHALL lock with availability reasons (e.g. "Setup is running. It reports each step as it finishes."); a monospace progress log appears seeded with "Setup started. Each step appears here as it finishes." and the status line reads "Setting up this project. This can take a few minutes." Per task the log shows a "▶ {label}" heading, then per step an indented line `{✓|–|✕|•} {name} — {status}[: detail]` (detail rendered verbatim), then a task-outcome line. Done state: headline "Project setup finished", status "Setup finished. The results are listed above.", and a Close button leaving the report readable. Error state: headline "Project setup did not finish", the failure message, and a primary "Retry initialization" button (description "Run the tasks that failed again. Nothing was recorded, so none of them are skipped."); the decision is reopened so closing now records a skip rather than swallowing the tasks.

- **REQ-WORKSPACE-109** — A run's progress SHALL become visible while the run is still under way, not only once it has ended: a task SHALL be announced under its display label as it starts; each of its steps SHALL be shown — name, status, and detail — at the moment that step finishes, rather than being withheld until the task ends; and the task's own outcome SHALL follow its steps. A run SHALL end in exactly one of three ways: with every attempted task's result reported; with the run as a whole reported as having failed, in which case nothing is recorded for any task; or with the run reported as cancelled. Once cancellation has been requested, no task that has not yet started SHALL begin, while a task already under way SHALL be allowed to reach its own conclusion, save that the processes it started are ended as REQ-WORKSPACE-092 requires. Closing the application while a run is under way SHALL raise no dialog and SHALL complete within 5000 ms, the run being stopped by force if it has not ended by then.

- **REQ-WORKSPACE-110** — Pressing Initialize while a run is already live SHALL start nothing and flip the dialog to its in-progress state. Starting a run SHALL re-read the runnable task list, so that following a run that only partly succeeded a retry offers just the outstanding tasks; when nothing remains the dialog says "Everything in this workspace is already set up." When any listed task requires consent and no model is reachable (no active model or no connected provider), the run SHALL refuse up front with "This setup step runs an agent, so it needs a model provider. Authenticate one in Settings, then start it again." and the banner "Project setup needs a provider" — failing fast instead of starting and then surfacing a raw authentication error.

- **REQ-WORKSPACE-111** — The skip path SHALL persist the listed task ids as skipped; a persistence failure keeps the dialog open with "Your choice could not be saved: {exc}". Once skipped, reopening the workspace SHALL never re-prompt.

- **REQ-WORKSPACE-112** — While the setup prompt is unanswered, the composer's Send control SHALL be disabled with the reason "Answer the project setup prompt first. Initialize or skip it in the setup window; nothing else in Rotaris is blocked." The keyboard submit path SHALL be caught separately with error "Project setup is unanswered" / "Initialize this workspace or skip its setup before starting a run." and an "Open project setup" action. This is a composer gate only — no other view is blocked.

- **REQ-WORKSPACE-113** — Manual re-initialization SHALL be exposed in exactly two places — the Workspace sidebar's "Project" section and Settings Project — both opening the same dialog, which lists every runnable task, previously skipped ones included; it SHALL never trigger automatically. Sidebar states: everything resolved or nothing applicable → the section is hidden; pending/skipped → button "Initialize Project…" with hint "Not run yet: {labels}."; running → disabled "Initializing…" with hint "Running the pending setup tasks."; a recorded failure appends "Last run failed: {message}" to the hint.

- **REQ-WORKSPACE-114** — The Settings Project card "Project initialization" SHALL render exactly one of six states at a time:
  - *failed* — a run recorded an error and no run is in progress: headline "Initialization failed"; detail = that error message followed by "Nothing was recorded, so {labels} can be run again."; button "Retry initialization".
  - *running* — a run is in progress: headline "Initializing project…"; an indeterminate progress bar; a disabled "Initializing…" button.
  - *pending* — at least one applicable task is pending: headline "Initialization pending"; detail "Not run yet: {labels}."
  - *deferred* — at least one applicable task is skipped and none is pending: headline "Initialization deferred"; detail "You skipped {labels}. Run them whenever you want.", preceded by "Completed: {labels} on {YYYY-MM-DD}." when at least one task has completed, the date being the date part of the recorded `last_run`.
  - *completed* — every applicable task is completed: headline "Project initialized"; a completed sentence (whose exact wording is an Open Question) followed by the classification sentence of REQ-WORKSPACE-101; the button disabled with reason "Every initialization task for this workspace is already resolved."
  - *empty* — no task is applicable to this workspace: headline "Nothing to initialize yet"; detail "No initialization task applies to this workspace. A task appears here once the tool it depends on is configured — add it under MCP Servers and reload the workspace."; the button disabled.

  Which state wins when more than one of these conditions holds at once is an Open Question.

- **REQ-WORKSPACE-115** — Refreshing the initialization display SHALL show the values the persisted `initialization:` section holds at that moment — its completed list, its skipped list, `last_run`, and `classification` — so that an edit made to that section on disk becomes visible once a refresh has run. A refresh SHALL change nothing else: settings edited but not yet saved SHALL still be there afterwards, and no configuration value outside the `initialization:` section SHALL take a different value because a refresh happened, whether or not the file on disk has been edited since that value was loaded. Whether a run is in progress, and the last error, describe the current session only and SHALL NOT be taken from disk: after a restart the display SHALL show no run in progress and no last error.

### Workspace Hook Trust Gate

- **REQ-WORKSPACE-116** — Hook execution SHALL be gated by declaration scope, not by content inspection: hooks from the user's global configuration and from built-in defaults always run; hooks declared by the workspace arrive with the cloned repository and can therefore run code chosen by someone other than the user, so they run only once a decision has been recorded that covers this workspace together with this precise collection of hooks; any unrecognized scope value SHALL be blocked, and an unknown origin SHALL never be treated as safe under any circumstance.

- **REQ-WORKSPACE-117** — The verdict key SHALL be the SHA-256 digest, rendered as 64 lowercase hexadecimal characters, of a canonical JSON payload `{"version": 1, "hooks": [...]}`: object keys sorted, no whitespace between tokens, and every non-ASCII character escaped so the serialized bytes are ASCII throughout. The `hooks` array SHALL hold one object per workspace-declared hook, in declaration order, and each such object SHALL carry exactly these six keys and no others: `command`, `event`, `matcher`, `name`, `required` (boolean), `timeout_seconds` (number). Altering any of those values, adding an entry, removing an entry, or moving an entry to another position SHALL each yield a different digest; changing a hook declared by the global configuration or by the built-in defaults SHALL leave the digest identical, since such hooks contribute nothing to the payload. Raising the payload `version` SHALL make every previously stored digest stop matching, so every stored verdict is invalidated and the review is asked for again. How a hook that declares no `matcher`, or no `timeout_seconds`, is represented in the payload — as an empty string or JSON null, or as the effective default after resolution — is an Open Question, and digests are not reproducible across implementations until it is settled.

- **REQ-WORKSPACE-118** — The verdict SHALL persist at `<workspace>/.rotaris/hook-trust.json`, written atomically, with the shape `{"version": 1, "digest": <64-char lowercase hex>, "trusted": <bool>, "decided_at": <ISO-8601 UTC>}` plus a trailing newline. Storing a verdict SHALL raise on a malformed digest ("Not a hook-set digest: …") and on write failure, because swallowing that failure would leave the caller believing a refusal was saved while the rejected hooks went on executing. Revoking SHALL delete the file; an already-absent file is success, and every other deletion failure SHALL raise, since a leftover "trusted" record would go on permitting the hooks.

- **REQ-WORKSPACE-119** — The verdict reader SHALL fail closed and never raise: a file that is absent, cannot be opened, was cut short, holds binary bytes, will not parse, parses to the wrong structure, or carries an unexpected version number — and equally a workspace state path that turns out not to be a directory — SHALL every one of them yield "no verdict". `trusted` SHALL be accepted only as a strict boolean (not truthy values such as `1` or `"no"`); the digest must be exactly 64 lowercase hex characters; `decided_at` must parse as a timestamp (a naive timestamp is interpreted as UTC).

- **REQ-WORKSPACE-120** — A pending trust review SHALL be reported only when the workspace declares hooks and no stored decision — including a stored refusal — covers the current digest. A recorded refusal SHALL stay in force for as long as the hook set is unchanged, and the question SHALL NOT be put to the user again on each run. The review request SHALL carry the resolved workspace path, the digest to record against, and exactly the workspace-declared hooks in declaration order.

- **REQ-WORKSPACE-121** — Partitioning hooks into allowed and blocked SHALL operate on the in-memory resolved set, preserve declaration order, and allow workspace hooks only when a stored trusted verdict's digest matches the very sequence being partitioned — the configuration SHALL NOT be re-read once the digest has been verified and before those hooks execute, closing any window in which the checked set and the executed set could differ. Disk SHALL be touched only when there is something to gate.

- **REQ-WORKSPACE-122** — When workspace hooks were blocked, the user-facing notice SHALL read exactly "Skipped {n} hook(s) declared by this workspace's .rotaris/agents.yaml: workspace hooks run shell commands and this workspace has not been reviewed and trusted yet. Review the hooks in Rotaris to allow them to run." The notice SHALL disclose nothing beyond the number of skipped hooks plus the configuration file that declared them. Since their names and command lines are authored by the repository and not by the user, neither SHALL ever be echoed into a notice or onto a terminal; the complete listing SHALL surface only inside the review dialog, which the user opens on purpose. With nothing blocked the notice is empty.

- **REQ-WORKSPACE-123** — Hooks supplied through the command line's `--config <path>` override SHALL carry no workspace stamp, resolve as built-in scope, and therefore run without review, because the user named that file explicitly rather than inheriting it from a cloned directory.

- **REQ-WORKSPACE-124** — Supporting hook-model facts referenced by the digest and the review UI (specified in full in the lifecycle-hooks specification): blocking-capable tool events `pre_tool`/`post_tool` plus informational lifecycle events `session_start`, `session_end`, `iteration_end`, `child_completed`, `verifier_finished`; default per-hook timeout 60 s; retained output capped at 16,384 bytes; a hook failing 3 times in a session is disabled for that session; `hooks.enabled: false` disables everything; a disabled entry still occupies its position in declaration order, so the identities of the surrounding hooks are unaffected; an empty matcher matches everything; matchers are command patterns evaluated against each segment of compound shell commands, or globs over tool names.

### Hook Scope Fallback — Declining Preserves the User's Own Hooks

- **REQ-WORKSPACE-125** — A workspace hook list SHALL supersede the hook lists it inherits only while those workspace hooks are allowed to run. While they are blocked — refused, or not yet reviewed — the inherited entries that the workspace list had displaced SHALL be reinstated: appended after the allowed entries, keeping the relative order they held in the layer they came from. Only entries whose origin scope is `default` or `global` SHALL be reinstated, and only those the allowed set does not already contain; an entry of `workspace` scope that had itself displaced an earlier `workspace`-scope entry SHALL never return by this route. Once the user allows the workspace hooks, the workspace list supersedes the inherited entries outright and nothing is reinstated. The guarantee this produces is that declaring a hook list the user then refuses can never take away a hook that user configured for themselves. Which fields decide whether the allowed set "already contains" an inherited entry is an Open Question.

- **REQ-WORKSPACE-126** — When inherited hooks were restored this way, the skipped-hooks notice SHALL be extended with "Your own {n} configured hook(s) still run(s)." making it plain that the hooks the user set up for themselves remain untouched.

### Desktop Hook Trust UI

- **REQ-WORKSPACE-127** — On startup, once the window is interactive rather than during its construction, given a pending hook review, the window SHALL publish a persistent WARNING notice — never open the review dialog unbidden — with title "This workspace declares {n} unreviewed hook(s)", message "Workspace hooks run shell commands written by whoever wrote this repository. They stay skipped until you review and allow them.", and action "Review hooks" leading to the Hooks settings tab.

- **REQ-WORKSPACE-128** — Computing the hook-trust display SHALL never raise (an unreadable hook configuration yields an empty tab, not a crash). Statuses are none | review | trusted | refused with user-facing labels "This workspace declares no hooks of its own." / "This workspace declares hooks that have not been reviewed yet." / "You allowed this workspace's hooks to run." / "You refused this workspace's hooks; they are skipped." Restored (fallback) hooks SHALL be listed as allowed rows even though the workspace's own list omits them, so the tab always shows exactly what will run.

- **REQ-WORKSPACE-129** — The review dialog SHALL be modal, minimum 620×440, titled "Review this workspace's hooks", with the explanation "{workspace} declares {n} hook(s) in .rotaris/agents.yaml. Hooks are shell commands written by whoever wrote this repository, and they run on your machine with your permissions. Allow them only if you trust this repository. {status sentence}". The hook commands SHALL be rendered here and nowhere else, in a read-only monospace block per hook showing: name, event, what it matches (the matcher or "every tool call"), `timeout {X}s` annotated as blocking the tool call on failure or advisory, and the command. Buttons: "Do not run these hooks" (the default and initially focused — refusing is what Enter reaches) and "Allow these hooks" (destructive styling; description "Lets this workspace run the shell commands above during every session."; reachable only by explicitly activating that button, never by pressing Enter).

- **REQ-WORKSPACE-130** — Every dialog exit path — accept, reject, Escape, window close box, even close-before-show — SHALL resolve exactly once, and dismissal SHALL count as refusal, never consent. Both answers SHALL be persisted as verdicts; the dialog and the repository-supplied text it displayed SHALL be discarded immediately after resolution. A failed verdict write SHALL be loud: "Could not record your hook decision" / "Rotaris could not write the verdict, so the hooks stay blocked and you will be asked again." Success toasts: "This workspace's hooks are allowed to run." / "This workspace's hooks will not run." The settings tab refreshes afterwards.

- **REQ-WORKSPACE-131** — The Settings Hooks tab SHALL show a table with columns Hook / Event / Matches / Source / Status, grouped per agent, with scope labels "workspace" / "your global config" / "built-in". The command column SHALL be deliberately absent; a per-selection "View hook command…" button reveals a command on purpose (disabled with reason "Select a hook to view its command."). Header actions: "Review workspace hooks…" (enabled only when a review is pending; otherwise reason "This workspace declares no hooks of its own to review.") and "Refresh hooks". Empty state: "No compatible hooks are available. Add hooks to your global Claude Code settings or declare Rotaris hooks in agents.yaml."

- **REQ-WORKSPACE-132** — Hook records read from the external assistant's user-global settings SHALL appear in the Settings Hooks table as a second agent group, named "Claude Code", with the source label "Claude Code global settings". The group SHALL carry one enable checkbox governing the whole group and one per hook record, and a choice made with either SHALL still be in force after the application is restarted. A record the product cannot run SHALL be listed with its enable control unavailable and with the reason it is incompatible stated in the row. These records SHALL lie outside the workspace hook trust gate entirely: no digest covers them, no review decision is required before they run, and they SHALL never be listed in the review dialog of REQ-WORKSPACE-129. The location those user-global settings are read from, and where the per-group and per-record enable choices are persisted so that they outlive a restart, are an Open Question.

### First-Launch Provider Guidance and Login

- **REQ-WORKSPACE-133** — Configuration validation SHALL append the hint "Run 'rotaris-cli login' to authenticate a provider." to unconfigured-model errors (e.g. "No models configured. …", "small_model is unconfigured. …") whenever no authenticated provider snapshot exists.

- **REQ-WORKSPACE-134** — Given the CLI run subcommand hits such an error interactively, it SHALL auto-launch the interactive login flow exactly once, revalidate, and continue into the terminal UI on success; a failed or aborted login SHALL exit with code 1 carrying the flow's message. In `--background` mode the login flow SHALL never auto-launch and the command exits 1.

- **REQ-WORKSPACE-135** — The guided login flow SHALL carry out these steps in this order: present the provider catalog for the user to choose from; authenticate the chosen provider, prompting for a device code or for an API key according to what that provider supports; discover the models the credential grants access to; write the provider snapshot into the per-user configuration directory, and write the minimal bootstrap `agents.yaml` of REQ-WORKSPACE-038 only when no `agents.yaml` exists at the target path, an existing file never being overwritten; then assign discovered models to the configured model tiers. When discovery returns no models at all, the flow SHALL offer three ways forward — continue anyway, abort, or authenticate a different provider. Authenticating a second provider SHALL leave the first provider's snapshot in place and usable. The name, location, and format of the provider snapshot file are an Open Question, as is the set of providers the catalog offers.

- **REQ-WORKSPACE-136** — The `rotaris-cli login` subcommand SHALL carry the help text "Authenticate an AI provider", accept an optional positional `provider` ("Provider to authenticate") and a `--reauth` flag ("Force re-authentication"); browser-based flows print "Opening your browser for login...". The same flow backs both this command and the first-run auto-launch.

- **REQ-WORKSPACE-137** — Desktop equivalents: submitting a prompt with no model configured SHALL yield "No model configured" / "Choose a model in Settings before starting a run." with an "Open Settings" action; with providers configured but none connected, "Provider authentication required" / "Authenticate at least one configured provider before starting a run." Provider health and authentication management live in Settings.

### Bundled-Build Machine Setup

- **REQ-WORKSPACE-138** — On bundled builds, machine setup SHALL run when no setup state record exists, the tool-manifest fingerprint changed, or a prior outcome was neither complete nor accepted-degraded; a manually requested run always proceeds. Setup state persists at `<per-user-data-dir>/setup/state.json` (atomic JSON); managed tools install under `<per-user-data-dir>/tools/…`; a lock file (considered stale after 900 s) prevents concurrent runs, a second attempt reporting the outcome "already-running". Activating the managed environment SHALL prepend verified managed tool directories to PATH and pin the package-tool caches (e.g. the `UV_CACHE_DIR` and `npm_config_cache` environment variables) to application-owned cache directories.

- **REQ-WORKSPACE-139** — The machine-setup dialog SHALL be modal, 760×560, titled "Preparing Rotaris" (or "Repair machine tools" for manual runs), explaining "Rotaris is checking Git, Node, ripgrep, and the package caches used by MCP servers." It SHALL stream per-step progress (`▶` running, `✓ … (Xs)` done with duration, `Failed — …`), show a counter `{done}/{total} — {pct}%`, and offer Show/Hide details, Cancel ("Cancelling after the current step…"; then "Setup paused. Completed steps are saved."), Retry, "Continue without tool" (recording an accepted degradation, described as "Open Rotaris with a warning for capabilities that still need this tool"), and Resume/Open. Outcomes: complete | degraded | cancelled | already-running.

- **REQ-WORKSPACE-140** — After the machine-setup modal closes, the machine-setup settings display SHALL refresh and the git refresh SHALL start; then first-launch workspace onboarding continues if it is still owed.

### Cross-Cutting Invariants

- **REQ-WORKSPACE-141** — Desktop workspace-open ordering SHALL be: window constructed → typeable-command catalogue built (and rebuilt on library/settings changes) → window shown → (bundled first run only: machine-setup modal) → git refresh without blocking the interface → update check → cloud-credit polling → once the window is interactive: initialization resolution and hook-review notice → (first launch only, after 650 ms) project chooser.

- **REQ-WORKSPACE-142** — Consent boundary: the only thing in this domain that gates agent execution is an unanswered consent-requiring initialization prompt, and even that gates only the composer. Background setup, git absence, and refused hooks SHALL never block runs.

- **REQ-WORKSPACE-143** — Trust boundary: nothing authored by the repository (workspace-declared hooks) executes without an explicit stored verdict covering the exact reviewed content; every ambiguous state fails closed; refusals are durable decisions; user-authored global and default hooks are never subject to review and survive a refused workspace override.

- **REQ-WORKSPACE-144** — Recording boundary: the persisted initialization marker has exactly one writer; failures record nothing; skips record everything; every recorded outcome stamps the last-run timestamp; the prompt decision is per-task, never per-workspace.

- **REQ-WORKSPACE-145** — Injection separation: the workspace context block, the portable-skill catalog, force-loaded skill bodies, and persona memory are distinct, ordered context units; skill bodies enter model context only by agent retrieval, explicit user command, or the explicit "always" load policy.

- **REQ-WORKSPACE-146** — Determinism: skill discovery order and catalog rendering are deterministic (sorted); the merged workspace context is byte-deterministic for a given filesystem state; hook digests are canonical-JSON SHA-256 and therefore reproducible.

- **REQ-WORKSPACE-147** — Atomic persistence: every at-rest write in this domain — the workspace and global `agents.yaml`, `hook-trust.json`, machine-setup state, and the minimal bootstrap file — SHALL land via an atomic replace-style write, so that a crash partway through writing cannot leave a truncated file behind.

## Data & Formats

All formats below are externally observable: they are files a user (or test) can read and write, payloads delivered to agents, or persisted OS-level settings.

### Persisted application settings

- `workspace/lastOpened` — string path of the most recently opened workspace, stored in the platform application-settings store; written on explicit open and successful switch; read at startup; not cleaned up when stale.

### Workspace state directory `<workspace>/.rotaris/`

- `agents.yaml` — workspace-scope configuration. Known behavioral sections: `default_persona`, model slots, `inject_agents_md` (bool, default true), `skills:` (`enabled`, `overrides`, `invocation_overrides` keyed by normalized skill name), `project_init.source_extensions`, `hooks:`, and:

  ```yaml
  initialization:
    completed: [serena-setup]
    skipped: []
    last_run: "2026-08-29T12:00:00+00:00"   # ISO-8601 UTC
    classification: code                     # code | non-code | null
  ```

  Unknown top-level keys survive every save round-trip. A legacy `.geraet-ai/` directory is adopted by one-time rename.
- `models.yml` — per-scope model definitions (also read in the global scope directory).
- `hook-trust.json` — hook trust verdict:

  ```json
  {"version": 1, "digest": "<64 lowercase hex>", "trusted": true, "decided_at": "2026-08-29T12:00:00+00:00"}
  ```

  (single trailing newline; strict boolean `trusted`; absent file = no verdict.)

### Hook digest payload

Canonical JSON, ASCII, sorted keys, compact separators, hashed with SHA-256:

```json
{"version": 1, "hooks": [{"command": "...", "event": "...", "matcher": "...", "name": "...", "required": false, "timeout_seconds": 60.0}]}
```

One entry per workspace-declared hook, in declaration order; global/default hooks are never part of the payload.

### Merged workspace context (AGENTS.md)

```
<!-- source: C:\path\to\workspace\AGENTS.md -->
{file content, possibly truncated at a line boundary}
```

Blocks separated by one blank line; total ≤ 131,072 bytes; per file ≤ 32,768 bytes (UTF-8 byte counts); deterministic.

### SKILL.md

YAML frontmatter delimited by `---` lines; required `name`, `description`; canonical trigger `trigger: {type: keyword, keywords: [..]}` (legacy `type:`/`triggers:` aliases normalized); optional `user-invocable: false` and `disable-model-invocation: true`; unknown fields preserved. Directory layouts searched: `<dir>/.agents/skills/<name>/SKILL.md`, `<dir>/.opencode/skills/<name>/SKILL.md` per project directory up to the repository root; user-scope roots `~/.agents/skills`, `~/.config/opencode/skills`, `~/.openhands/skills/installed`, `/etc/codex/skills`; disable manifest `~/.openhands/skills/.installed.json` (three accepted shapes, see REQ-WORKSPACE-052).

### Model-facing skill catalog block

Opening statement conveying the three facts of REQ-WORKSPACE-061, followed by one line per skill:

```
- {name}: {description} (SKILL.md: {absolute path})
```

Lines ordered by normalized name. A force-loaded body block carries the activation statement described in REQ-WORKSPACE-062, followed by the skill body with its frontmatter stripped.

### TUI skill listing and steering payload

Listing line: `- {name} [{scope}] in_context={yes|no} triggers={/kw,…|-}` plus truncated description (120 chars max) and path. Steering payload injected on invocation:

```
[SKILL.md]
Name: {name}
Source: {path}

{raw body}
```

### `.mcp.json`

Project file `<workspace>/.mcp.json`; user file per platform (see REQ-WORKSPACE-037). Top-level `mcpServers` or `servers` map; per-server: `type` (`http`|`sse`|`stdio`; default `http` iff `url` present else `stdio`), `command`/`args`, `url`, `env`, `envFile`, `cwd`; placeholders `${workspaceFolder}`, `${env:NAME}`. Server names match `^[a-zA-Z][a-zA-Z0-9_-]*$`.

### Code-intelligence artifacts

- `<workspace>/.serena/project.yml` — presence marks the project-configuration stage as already done (idempotence marker).
- Default MCP server entry: name `serena`, stdio, command token `rotaris-serena`, arguments beginning `start-mcp-server --context ide --transport stdio`, with `--project <workspace_root>` appended when no project binding is present.

### Machine setup state

- `<per-user-data-dir>/setup/state.json` — atomic JSON outcome record (`complete` | `degraded` | `cancelled` | `already-running`, plus manifest fingerprint).
- `<per-user-data-dir>/tools/…` — managed tool installs; `setup.lock` stale after 900 s.

### Minimal bootstrap `agents.yaml`

Hand-authored content with the three comment lines of REQ-WORKSPACE-038, `default_persona: orchestrator`, and null model slots/thinking fields; mode 0o644; atomic write.

## Open Questions

1. Whether context-file discovery should ever consider directories other than the workspace root. REQ-WORKSPACE-041 states root-only discovery; a broader multi-level scheme is deliberately excluded and would need its own requirement if wanted.
2. Real-world duration and latency of the background code-intelligence indexing step on actual repositories, and how its progress should be paced; only the per-stage time budgets (300/1800/120 s) are specified here.
3. Behavior of the native operating-system folder chooser dialog itself, beyond the parameters the application passes to it (title, directories-only, initial directory).
4. Whether a dedicated "rescan skills" control should be offered in addition to the cache clearing at session start and the settings-driven catalog rebuilds of REQ-WORKSPACE-069.
5. Whether additional skill-scoping features (per-persona force-load scoping, a per-agent in-context indicator, removable composer chips) should be in scope; none are required by the requirements above.
6. The exact interleaving when the user switches projects while background initialization is still running (shutdown of the in-flight work versus replacement of the window) is not pinned down by the requirements above.
7. The concrete set and rendering of externally discovered third-party global automation records depends on machine state at runtime.
8. Precise rendered visual appearance (colors, spacing, fonts) follows the active theme and is not fixed at the pixel level here.
9. Whether the first-launch interactive provider-login prompts render identically across terminal environments.
10. Whether to also inject an additional root-level product-named context file (`ROTARIS.md`) ahead of the workspace context file, with identical size/empty/unreadable semantics. Not required by anything above; adopting it is a product decision.
11. REQ-WORKSPACE-020 — what the status-bar branch item displays while the active run executes in an isolated worktree. Only "not the base checkout's branch" is determined; whether it shows the worktree's own branch name, the run's identifier, or some other label is not.
12. REQ-WORKSPACE-022 — the exact explanation text for the `mode: {permission_mode}`, `redaction: always on`, `● CB armed`, and `unsaved settings` flags, and the permitted values of `{permission_mode}` as this domain should quote them. Only the two file-access sentences are fixed above.
13. REQ-WORKSPACE-024 — whether the terminal status-bar budget counts Unicode code points or rendered terminal columns. The two differ for double-width and combining characters, and the elision arithmetic is only testable once this is settled.
14. REQ-WORKSPACE-029 — which fields the diff statistics comprise (files changed, insertions, deletions, or more); whether untracked paths count towards the reported number of changed paths; and how a commit's date "expressed relative to the present" is rendered (the exact strings, and the rounding, are not fixed anywhere above).
15. REQ-WORKSPACE-036 and REQ-WORKSPACE-135 — the file name, location, and format of the provider snapshot written into the per-user configuration directory. Both requirements depend on it and neither pins it down. REQ-WORKSPACE-135 additionally leaves open which providers the catalog it presents contains.
16. REQ-WORKSPACE-038 — the exact model slot and thinking key names the minimal bootstrap `agents.yaml` must contain as explicit nulls. "Every model slot and thinking field" is not a checkable list without them.
17. REQ-WORKSPACE-039 — the exact configuration keys the "product-configuration section" covers, and which schema security-policy values are validated against.
18. REQ-WORKSPACE-044 — whether truncation against the *total* budget also falls back to the last line boundary that fits (as per-file truncation does), or cuts at the exact remaining byte count.
19. REQ-WORKSPACE-049 — the reference conditions for the 200 ms budget: machine class, storage type, and whether the filesystem cache is warm or cold. The budget is not reproducible without them.
20. REQ-WORKSPACE-051 — the machine-wide skill location on Windows. `/etc/codex/skills` has no Windows equivalent; whether user scope simply ends at the three home-relative roots there, or a platform path substitutes, is undetermined.
21. REQ-WORKSPACE-073 — whether invoking a skill's slash command writes load mode `on` into `<workspace>/.rotaris/agents.yaml` (as REQ-WORKSPACE-065/068 would imply for a policy change) or applies to the current session only. The toast wording ("for the next prompt") settles neither.
22. REQ-WORKSPACE-091 — the mapping from source-file extension to the language identifiers passed on the project-configuration command line, and the step status token recorded when memory-layout seeding is skipped for a non-code workspace (indexing's `skipped-no-code` is specified; seeding's is not).
23. REQ-WORKSPACE-098 and REQ-WORKSPACE-099 — whether extension matching is case-sensitive (does `.PY` classify a workspace as code?), and whether the classification walk follows symbolic links to directories.
24. REQ-WORKSPACE-100 — whether gitignore negation patterns (`!`) and `**` path patterns are honored by the root-`.gitignore` matching, or only simple wildcards.
25. REQ-WORKSPACE-114 — which of the six states wins when several conditions hold at once (some tasks skipped while others are still pending; a recorded failure alongside pending tasks), and the exact wording of the "completed sentence" in the completed state.
26. REQ-WORKSPACE-115 — whether the initialization-display refresh carries a maximum acceptable latency or a non-blocking requirement, and if so what it is.
27. REQ-WORKSPACE-117 — how an omitted `matcher` or an omitted `timeout_seconds` is represented in the digest payload: empty string / JSON null, or the effective default after resolution. Digest reproducibility across implementations depends on this.
28. REQ-WORKSPACE-125 — which fields identify a hook for the "the allowed set does not already contain it" comparison when inherited entries are reinstated (name alone, or the full command/event/matcher tuple).
29. REQ-WORKSPACE-132 — the path the external assistant's user-global settings are read from, and where the per-agent and per-hook enable choices for those records are persisted.
30. REQ-WORKSPACE-091 and REQ-WORKSPACE-096 — the argument tokens each of the three setup stages appends after the prefix derived by cutting the configured launch command at `start-mcp-server`. The derivation of the prefix is fully specified; the subcommand and options that turn that prefix into a project-configuration, an indexing, or a memory-seeding command are not, so no stage's command line is reproducible from this document.
31. REQ-WORKSPACE-090 — how a `stdio` entry whose command is written as an absolute or relative path, rather than as a bare executable name, is judged launchable: a PATH lookup does not apply to it, and whether existence, executability, or neither is checked instead is undetermined.
32. REQ-WORKSPACE-105 — the comparison that decides whether a recomputed initialization state equals the one on display, and in particular whether the order of ids within the completed, skipped, and pending lists is significant. Without it, "a state update that changes nothing has no visible effect" is not testable.
