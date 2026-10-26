# Workspace Handling, Context Injection, and Project Onboarding — Application Launch and File-Access Boundary

Part 1 of 7 of [domain 13](../13-workspace-context-onboarding.md), which indexes every part. Defines REQ-WORKSPACE-001 – REQ-WORKSPACE-033.

## Requirements

### Application Launch and File-Access Boundary

- **REQ-WORKSPACE-001** — *Withdrawn.* The product is a graphical desktop application with no command-line surface, so it declares no argument vocabulary; workspace selection is carried by REQ-WORKSPACE-009 and REQ-WORKSPACE-016, demo mode by REQ-SHELL-162, diagnostics capture by REQ-SHELL-163, and the running version by REQ-SHELL-033 and REQ-SHELL-140.

- **REQ-WORKSPACE-002** — *Withdrawn.* There are no subcommands and no workspace option; the workspace root is chosen through the folder chooser of REQ-WORKSPACE-009, reached from the title-bar control of REQ-WORKSPACE-016, and applied by the window construction of REQ-WORKSPACE-013.

- **REQ-WORKSPACE-003** — *Withdrawn.* An ad-hoc configuration file named per invocation is reachable only from a shell, and the layered scopes of REQ-WORKSPACE-036 — authored through the Settings view or by hand — are the whole configuration surface.

- **REQ-WORKSPACE-004** — *Withdrawn.* The file-access boundary is not a launch flag; REQ-WORKSPACE-148 states how it is set and shown.

- **REQ-WORKSPACE-148** — The file-access boundary SHALL be the configuration setting `runtime.allow_outside_workspace` (boolean, default `false`, REQ-TOOLS-130), which is reachable through the desktop interface and from nowhere else: the Settings Runtime category (`runtime`, REQ-CONFIG-269) SHALL offer it as a control whose accessible name and description state that turning it on lets agents read and write outside this workspace folder. The setting SHALL be written to the layered YAML configuration by the desktop save of REQ-WORKSPACE-039, so it may be scoped per workspace or globally like any other configuration value, and SHALL NOT be held in the desktop preference store. Given the setting is on, the status-bar file-access flag of REQ-WORKSPACE-022 SHALL read `outside-workspace!`; given it is off, `workspace-scoped`. A change SHALL take effect for runs started afterwards, and the flag SHALL follow the value in force at the moment it is drawn.

### Startup Workspace Resolution and First-Launch Onboarding

- **REQ-WORKSPACE-005** — Given a window is built for an explicitly selected workspace folder — a folder chosen through the chooser of REQ-WORKSPACE-009, or the folder a replacement window is constructed for by the switch of REQ-WORKSPACE-013 — the app SHALL expand and resolve the path, open it directly with no folder chooser, and persist it as the last-opened workspace under the key `workspace/lastOpened` in the per-user preference store (REQ-SHELL-006).

- **REQ-WORKSPACE-006** — Given an ordinary launch with no such explicit selection, the remembered `workspace/lastOpened` value SHALL be used if and only if it names an existing directory; in that case no prompt of any kind is shown.

- **REQ-WORKSPACE-007** — Given an ordinary launch with no explicit selection and no usable remembered path, the app SHALL open on a fallback workspace (default: the directory the application process starts in) for first paint and schedule the first-launch project chooser to appear afterwards. A remembered path that no longer exists SHALL NOT be overwritten in the preference store at this point.

- **REQ-WORKSPACE-008** — The first-launch project chooser SHALL be deferred after first paint by the one shared deferred first-paint delay REQ-SHELL-011 fixes; this domain relies on that requirement for the interval and states no figure of its own. If the window is closed before the delay elapses, the prompt SHALL be cancelled cleanly (no dialog, no crash).

- **REQ-WORKSPACE-009** — Choosing a project folder SHALL use the operating system's native folder chooser, titled "Open a project folder", restricted to directories, starting at the given initial directory or else the user's home directory. The product SHALL be answerable only for what it hands the host dialog — the title, the restriction to directories, and the initial location — and for interpreting every answer that dialog can return (REQ-SHELL-164); keyboard traversal, localization of platform-supplied button text and screen-reader behavior inside a native dialog are inherited and are not requirements on this product. A dismissal by any means the host offers — Cancel, Escape, the window close control, or a platform gesture — SHALL be treated identically: no selection is returned and nothing changes. When the cancelled chooser was the first-launch prompt, a toast SHALL say: "Open a project folder when you're ready by selecting the workspace path in the title bar."

- **REQ-WORKSPACE-010** — Selecting the folder that is already the current workspace SHALL be a no-op.
  > **Superseded by [`PD-WORKSPACE-001`](../../product/directives/pd-workspace-001.md#pd-workspace-001), 2026-09-12.** The
  > text above states the behavioural target and is kept for that reason; it no longer states what this
  > product does. Choosing the folder a window already has open now raises a transient notice in that
  > window offering to start a new session in it.

- **REQ-WORKSPACE-011** — On a bundled build that still owes machine setup (see REQ-WORKSPACE-138), the machine-setup modal SHALL be scheduled after first paint with the same shared deferred first-paint delay (REQ-SHELL-011), this domain again stating no figure of its own; only after it completes SHALL the startup git refresh begin and — when this is also a first launch — the workspace chooser prompt continue.

### Workspace Switching

- **REQ-WORKSPACE-012** — Opening another project SHALL be refused while work is in flight, with an error toast stating exactly "Finish the worktree integration before opening another project." while a worktree integration is running, or "Finish the active run before opening another project." while any run is active or the run state is busy.
  > **Narrowed by [`PD-SHELL-009`](../../product/directives/pd-shell-009.md#pd-shell-009) revision 3, 2026-10-20**
  > ([OQ-361](../../architecture/open-questions/63-spikes-and-later-questions-30.md#oq-361), ruled under [R-072](../../product/requests.md#r-072)). Both
  > refusals count the requesting window's own workspace: a window whose project runs no integration and has no run active
  > may open another project while another window's project integrates or runs, and the window whose project does is
  > refused with the toast above, as before. The run count has been the window's own since revision 1 (2026-10-07), which
  > wrote no back-pointer here until now. A window that holds no workspace is not refused for an integration, and a record
  > of integration main cannot read refuses nothing. The two sentences and every other clause above still govern.

- **REQ-WORKSPACE-013** — A workspace switch SHALL construct a fresh main window for the selected folder. Given construction fails, the old window SHALL remain fully usable and an error toast SHALL say "Could not open the selected project: {reason}". Given construction succeeds, the replacement window is shown, the old window is closed (and if the old window vetoes its close, the replacement is closed instead and the old window stays), `workspace/lastOpened` is updated, and the git refresh, update check, and cloud-credit polling start on the new window. A background initialization run still under way in the outgoing window SHALL NOT delay or refuse the switch: it SHALL be cancelled on exactly the terms of REQ-WORKSPACE-109 — no task that has not started begins, a task already under way reaches its own conclusion, and every process it launched is ended as REQ-WORKSPACE-092 requires — nothing SHALL be recorded for the cancelled run, so the tasks stay pending and run again the next time that workspace is opened. The replacement window SHALL resolve initialization for its own workspace independently of the outgoing one, and its resolution SHALL NOT wait on the cancellation to finish.

- **REQ-WORKSPACE-014** — Post-show activation order SHALL be: window shown → git refresh starts (skipped until machine setup completes on a bundled first run) → workspace-storage determination starts (REQ-STARTUP-043, REQ-STARTUP-166; skipped entirely in a demo window) → update check starts → cloud-credit polling starts (skipped entirely in a demo window, REQ-SHELL-162). The enumeration here is this domain's view of the same activation REQ-STARTUP-043 fixes; where the two differ, REQ-STARTUP-043 governs and this line is the defect.

- **REQ-WORKSPACE-015** — The main window SHALL be titled "Rotaris" and SHALL host exactly the seven primary views of REQ-SHELL-023, in the fixed order that requirement states; this domain SHALL NOT name a parallel view vocabulary of its own. Its opening geometry and its minimum size are those of the desktop shell specification (REQ-SHELL-022), and every control this domain adds SHALL be reachable and fully labelled at that minimum size.

### Desktop Workspace and Branch Display

- **REQ-WORKSPACE-016** — The title bar SHALL contain a workspace control with accessible name "Open project folder" and accessible description "Current project: {workspace_path}. Opens the native project folder chooser."; it SHALL be keyboard-focusable, and both a mouse click and the Return key SHALL open the folder chooser.

- **REQ-WORKSPACE-017** — The title-bar workspace control SHALL render a folder icon, the workspace path in the monospace face at the smallest text scale, a `·` separator, and the current session name (or `—` when there is none); its rendering SHALL refresh on theme changes so colors follow the active theme.

- **REQ-WORKSPACE-018** — The bottom status bar SHALL keep one fixed height taken from the active theme (it never grows or shrinks with its contents) and lay out, left to right: workspace path (a link), git branch, flexible space, safety flags, model, token count, cost, cloud-credit balance, and background-session count. Of these, only the workspace path and the cloud balance SHALL be activatable; all other readings are non-interactive.

- **REQ-WORKSPACE-019** — The status-bar workspace path SHALL be a link with accessible name "Workspace folder" and tooltip/description "Workspace folder: {path}. Opens it in your file manager."; activating it opens the folder in the OS file manager, and a failure to open SHALL be silent.
  > **Narrowed by [`PD-WORKSPACE-007`](../../product/directives/pd-workspace-007.md#pd-workspace-007), 2026-10-06.** A failure to open the
  > folder is not silent: REQ-SHELL-040's transient error names the path attempted. The link's name and tooltip are
  > unchanged.

- **REQ-WORKSPACE-020** — The status-bar branch item SHALL be non-clickable text with accessible name "Checked-out branch". It SHALL render a branch icon followed by the branch name, and — only when the ahead count of REQ-WORKSPACE-029 is greater than zero — a trailing ` ↑{n}`; the behind count SHALL never appear on this item. Its tooltip and accessible description SHALL be one and the same string: "Branch this workspace is on: {branch}, 1 commit ahead." for an ahead count of exactly one, "Branch this workspace is on: {branch}, {n} commits ahead." for a count above one, and "Branch this workspace is on: {branch}." for a count of zero. The item SHALL render as empty text — no icon, no arrow, no tooltip — exactly when the snapshot's branch name is empty, which per REQ-WORKSPACE-029 covers git being unavailable, the folder not being a repository, a detached HEAD, and an unborn branch. While the active run executes in an isolated worktree, the item SHALL show that worktree's own branch name — the generated branch of REQ-GIT-007 where the run accepted the generated default, or the name the user supplied — rendered exactly as any other branch name is, with the ahead count and the ` ↑{n}` suffix computed against that branch's upstream rather than the base checkout's. A worktree carrying no branch of its own SHALL render as empty text under the rule already stated. Only the accessible description differs: it SHALL additionally convey that the branch belongs to the isolated worktree the active run is using rather than to the folder the window is open on, in wording of the implementation's choosing. No identifier other than a branch name — not the run's identifier, not the worktree's path — SHALL appear on this item.
  > **Narrowed by [`PD-WORKSPACE-008`](../../product/directives/pd-workspace-008.md#pd-workspace-008), 2026-10-06.** On a detached HEAD,
  > outside a repository, with Git unavailable and before the first read, the item is not empty text: it reads
  > `detached HEAD`, `no git repository`, `no git`, or `—` before the first read, each with its tooltip, no icon, the
  > absent states in italics, as REQ-GIT-161 asks. An unborn branch, and a branch that could not be read, keep the empty
  > item above. A branch name keeps the sentences above, full stop included.

- **REQ-WORKSPACE-021** — Responsive elision of the status bar SHALL be the hiding REQ-SHELL-047 specifies: this domain relies on that requirement for which of the two labels is hidden first and for the window widths at which each is hidden, and states no width of its own. What this domain adds is that the path label so hidden is the workspace path link of REQ-WORKSPACE-019, and that hiding it removes the label only — the workspace it names is unchanged and remains reachable from the title-bar control of REQ-WORKSPACE-017.

- **REQ-WORKSPACE-022** — The safety flags shown beside the path and branch SHALL be exactly these five, each with an explanation reachable both as its tooltip and as its accessible description:
  - a file-access scope flag, always present, reading `workspace-scoped` while file access is confined to the workspace folder, explained "File access: agents may read and write inside this workspace folder only.", or `outside-workspace!` once the setting of REQ-WORKSPACE-148 has widened it, explained "File access: agents may read and write outside this workspace folder.";
  - a `mode: {permission_mode}` flag, always present, whose substituted value is drawn from exactly the three-value preset vocabulary of REQ-TOOLS-046 — `restricted`, `ask`, `autonomous` — and is the **effective** mode after any downgrade REQ-TOOLS-067 applies, not the requested one, so the flag never claims a permissiveness the run does not have. This domain SHALL NOT define a fourth value or a parallel spelling;
  - a `redaction: always on` flag, always present;
  - a `● CB armed` flag, present only while the circuit breaker is armed;
  - an `unsaved settings` flag, present only while settings hold edits not yet written to disk (REQ-WORKSPACE-039).

  The two file-access explanations above are fixed strings because they are the pair a reader compares. The other four explanations are human-readable message text whose wording is left to the implementation, and each SHALL convey exactly the following and no more: for the mode flag, which permission mode is in force and that it decides whether a tool call is allowed outright, put to the user, or refused; for the redaction flag, that secrets are removed from what is recorded and displayed and that this cannot be turned off; for the circuit-breaker flag, that the circuit breaker is armed and will halt a run that trips it; for the unsaved-settings flag, that the Settings view is holding edits which have not been saved and that runs use the values on screen rather than the values on disk. Every one of the five flags SHALL be distinguishable without relying on colour (REQ-SHELL-149), and each SHALL expose its explanation both as its tooltip and as its accessible description.
  > **Narrowed by [`PD-WORKSPACE-007`](../../product/directives/pd-workspace-007.md#pd-workspace-007), 2026-10-06.** The unsaved-settings
  > flag's explanation says runs keep using the last saved values until the edits are saved, and the mode, redaction and
  > circuit-breaker explanations are REQ-SHELL-041's sentences word for word, not bounded by "exactly the following and
  > no more". The five flags, their conditions and the file-access pair are unchanged.

### Workspace and Branch Label Rendering

- **REQ-WORKSPACE-023** — *Withdrawn.* There is no terminal status bar; REQ-WORKSPACE-149 carries the home-directory collapsing and literal rendering of the workspace path and branch name in the desktop window chrome.

- **REQ-WORKSPACE-024** — *Withdrawn.* There is no terminal status bar; REQ-WORKSPACE-149 carries middle elision of a path too wide for the space it is drawn in.

- **REQ-WORKSPACE-025** — *Withdrawn.* Branch reading is the workspace git snapshot of REQ-WORKSPACE-029, whose degradation rules already cover an absent git, a folder that is not a repository, a detached HEAD, and an unborn branch.

- **REQ-WORKSPACE-026** — *Withdrawn.* REQ-WORKSPACE-150 carries the refresh cadence, the stale-result guard, and the non-overlap rule for the desktop.

- **REQ-WORKSPACE-027** — *Withdrawn.* REQ-WORKSPACE-149 carries the literal rendering of markup-like characters.

- **REQ-WORKSPACE-149** — Wherever the window chrome displays a workspace path or a branch name — the title-bar control of REQ-WORKSPACE-017, the status-bar path link of REQ-WORKSPACE-019, and the status-bar branch item of REQ-WORKSPACE-020 — the label SHALL be rendered under these three rules.
  1. *Home collapsing.* A resolved path equal to the user's home directory SHALL render as `~`; a path beneath it SHALL render as `~`, the platform path separator, and the remainder relative to home; any other path SHALL render absolute. Collapsing SHALL apply to the displayed label only: the tooltip, the accessible description, and any path handed to the operating system SHALL carry the full absolute path.
  2. *Middle elision.* A label wider than the space available SHALL be shortened from the middle, the removed span standing in as exactly one `…`, so that the beginning and the end of the path both stay legible. The budget is the rendered width available to that label in the layout, so the question of counting units does not arise; the label SHALL be recomputed whenever that width changes. Elision SHALL never change the tooltip or the accessible description, which always carry the full text (REQ-SHELL-022). Where the space available cannot hold even `…`, the label SHALL be hidden entirely rather than drawn clipped, on the terms REQ-WORKSPACE-021 already states for the status bar.
  3. *Literal text.* A path or branch name SHALL be rendered as literal text and SHALL NOT be interpreted as markup, formatting, or a control sequence of any kind, whatever characters it contains, so that a repository cannot influence the window's rendering by the name of a branch.

- **REQ-WORKSPACE-150** — The desktop status bar's git readings SHALL be kept current without user action. On workspace open the bar SHALL render from the snapshot of REQ-WORKSPACE-029 and start a refresh; thereafter it SHALL refresh every 10.0 s for as long as the window is on screen. A workspace or session switch SHALL trigger an immediate refresh rather than waiting for the next interval. Refreshes SHALL run off the interface's own thread of control and SHALL never make the window stop accepting input (REQ-WORKSPACE-028, REQ-WORKSPACE-030). Refreshes SHALL never overlap: a refresh SHALL NOT start while one is outstanding, and the interval SHALL be measured from the completion of the previous refresh. A result arriving after the workspace it was gathered for is no longer the current one SHALL be discarded rather than displayed. While the status bar is not on screen, no refresh SHALL be performed and no refresh timer SHALL be running; when it becomes visible again its first painted frame SHALL already carry current values.

### Git Reading and Degradation

- **REQ-WORKSPACE-028** — Git interaction SHALL be read-only by default. Reads run git as a subprocess in the workspace with a 15 s timeout and UTF-8 decoding with replacement of undecodable bytes; on the read/refresh path any refusal, error, timeout, or missing binary SHALL degrade to an empty result (never an exception surfaced to the user). Mutating operations (worktree create/remove, repository preparation) SHALL instead fail with an error carrying git's own stderr, or — when git is absent — the exact message "Git is not available on this machine, so there is nothing to read or change."

- **REQ-WORKSPACE-029** — A workspace git snapshot SHALL be gathered without the interface ceasing to accept input, and SHALL become visible all at once: anything reading the snapshot while a refresh is under way SHALL see either the whole of the previous snapshot or the whole of the new one and never a mixture of the two, and a change notification SHALL follow the replacement. The snapshot SHALL contain: whether git is available; the current branch name, empty for a detached HEAD and for an unborn branch; the number of commits ahead of and behind the upstream, both zero whenever that comparison cannot be made (no upstream, no repository, or any failure); the list of worktrees, each carrying its branch name or the literal `detached` when it has none, together with a base branch of `main` or `master`; the 30 most recent commits, each with its date expressed relative to the present; the number of paths git reports as changed in the working tree; and diff statistics against HEAD, plus for each worktree the same statistics for its committed changes measured against its merge base with that worktree's base branch.

  Three details of that snapshot are fixed here. *Diff statistics* comprise exactly three non-negative integers and nothing else: the number of files changed, the number of lines inserted, and the number of lines deleted. *The number of changed paths* counts every path the working tree differs from HEAD in, tracked or not — a file the user has just created is a change they can see, so excluding it would make the reading disagree with what the Git view shows — except that a path the repository ignores SHALL NOT be counted, since an ignored path is one the repository has said is not part of it. *A commit's relative date* is human-readable text whose wording is left to the implementation, required only to convey the elapsed time from that commit's author date to the present, coarsened to a single unit, never expressed as a time in the future, and never so coarse that two commits made days apart read alike; the exact instant SHALL remain available as the commit row's tooltip and accessible description.

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
