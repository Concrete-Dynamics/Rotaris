# Workspace

The folder the product operates on, the state it keeps beside that folder, and what it injects into
every agent that works there. Also the one-time onboarding a project gets, and the backup and
restore of everything a machine holds for it.

Terms are derived from `docs/spec/13-workspace-context-onboarding.md`, with backup and restore from
`docs/spec/07-sessions-persistence.md`. Two sibling contexts live under this package and share none
of this vocabulary: [Version Control](./src/git/CONTEXT.md) and
[Requirements](./src/traceability/CONTEXT.md).

## Language

**Workspace**:
The user-selected folder a session's work happens in. Several workspaces are ordinary rather than
exceptional: they are windows of the one running instance. — `REQ-WORKSPACE` overview,
`REQ-STARTUP-162`
_Avoid_: repository (a workspace need not be a repository), folder, directory
_In the interface_: **project folder**. The specification's own user-facing strings say it — "Open project
folder" and "Open another project folder" on the title-bar chip, "Open a project folder" as the chooser's
title, "Current project: {path}" as the chip's description — so a surface that said "workspace" to the user
would disagree with the requirement it implements. The distinction is the audience and not the thing: code,
records and identifiers say **workspace**; what a person reads says **project folder**. — `REQ-SHELL-035`,
`REQ-WORKSPACE-009`, `REQ-WORKSPACE-016`

**Workspace identifier**:
The stable identity that travels with a workspace and by which its machine-local records are found —
never a path. — `REQ-SESSION-197`, `REQ-SESSION-198`
_Avoid_: workspace path as an identity

**Workspace state directory**:
`<workspace>/.rotaris/`, holding the workspace's own configuration, its worktrees, its trust
decision and its persona memory. Unknown top-level keys in its documents survive every save
round-trip. — `REQ-WORKSPACE` workspace state directory
_Avoid_: dot directory, config folder

**Workspace storage classification**:
The derived verdict on where a workspace is held — reachable by another machine, replicated by a
synchronisation agent, or not classifiable. The first two warn and refuse nothing; the third is
silent. It is derived from storage rather than from a failure and is persisted nowhere. —
`REQ-STARTUP-166`

### What reaches an agent

**Workspace context**:
The `AGENTS.md` content injected into every agent, merged from the files found and bounded by byte
budgets. — `REQ-WORKSPACE` workspace context injection
_Avoid_: system prompt, instructions (a role's instructions are a different thing)

**Instruction file**:
One file whose content may become workspace context: `AGENTS.md`, `AGENTS.override.md`, `CLAUDE.md` or
`CLAUDE.override.md` at the workspace root, or `AGENTS.md`/`CLAUDE.md` at one of the five bases beyond
it. Each carries a **stable identity** — `<base>:<file name>`, the key the per-file policy is written
against — which survives the file being edited or absent. — `PD-WORKSPACE-002`, narrowing
`REQ-WORKSPACE-041`
_Avoid_: context file (that names the *content*; this names the file), AGENTS.md (one of six names)

**Enabled set**:
The present instruction files whose per-file policy is `on`, under the master switch, with each
override pair's base suppressed by its own enabled override. This is what the merge consumes; the
inventory lists every present file whether or not it is in it. — `PD-WORKSPACE-002`
_Avoid_: active files, selected files

**Portable skill**:
A `SKILL.md` discovered under a known layout, carrying a name, a description and a trigger. The
format is a third-party one the product reads rather than defines. — `REQ-WORKSPACE` portable skill
discovery
_Avoid_: plugin, extension, command (a skill *may* have a typeable command; it is not one)

**Skill catalog**:
The model-facing block listing discovered skills, one line each, ordered by normalised name. —
`REQ-WORKSPACE-061`

**Load policy**:
How much of a skill reaches the model — `off`, `name-only`, `user-invocable-only`, `on`. —
`REQ-CONFIG` vocabularies

**Force-load**:
Putting a skill's body in front of the model for the session, which is what invoking its slash
command does. — `REQ-WORKSPACE-062`, `REQ-WORKSPACE-073`

**Skill scope**:
Where a skill was found — `project` (the workspace and its ancestors up to the repository root) or
`user` (the home-relative roots and, where the platform has one, the machine-wide root). Every project
location outranks every user one. — `REQ-WORKSPACE-051`
_Avoid_: local/global (the configuration layers are already those two words and are a different thing)

**Manual skill**:
A skill loaded by hand from a path, for the current session only, persisting nothing. It carries the
scope label `manual` and overrides a discovered skill of the same normalised name. — `REQ-WORKSPACE-057`,
`REQ-WORKSPACE-151`
_Avoid_: temporary skill, session skill

**Shadowed skill**:
A `SKILL.md` a higher-priority one beat to a normalised name. It is recorded against the winner and
reportable per name rather than dropped. — `REQ-WORKSPACE-054`
_Avoid_: duplicate (the ignored file is not a copy; it is a different file with the same name)

**Invocation mode**:
Who may reach a skill — `default`, `manual-only` (the user alone) or `auto-only` (the model alone).
Derived from the frontmatter unless the workspace states one. — `REQ-WORKSPACE-056`, `REQ-WORKSPACE-063`

**Rescan**:
Re-reading the skill files from disk for a workspace. It changes no policy and marks nothing dirty; it
governs agents constructed afterwards and leaves those already built alone. — `REQ-WORKSPACE-069`
_Avoid_: refresh, reload

**Context unit**:
One always-active block on an agent's system prompt. The order is fixed: workspace context, the skill
catalog, the force-loaded skill bodies, persona memory, and last the **product statement**, which names the
product's own workspace directories. — `REQ-WORKSPACE-060`, `PD-TOOLS-012` revision 2
_Avoid_: system prompt (the role's instructions are a different thing), injection

### Onboarding

**Project initialization**:
The one-time background pass a workspace gets, whose registered task is code-intelligence indexing.
— `REQ-WORKSPACE` project initialization framework
_Avoid_: setup (reserved for **machine setup** in the [Distribution](../shell/CONTEXT.md) context),
bootstrap (reserved for Configuration's first-run write)

**Workspace classification**:
Whether a workspace is `code` or `non-code`, which decides what initialization is worth doing. —
`REQ-CONFIG` vocabularies

**Hook trust gate**:
The explicit review a user gives before a repository's own hook commands may run. Declining
preserves the user's own hooks rather than switching everything off. — `REQ-WORKSPACE` workspace
hook trust gate, `REQ-HOOKS-094`

### Backup and restore

**Backup**:
A copy of the whole machine-local store for a workspace, valid while runs are live. It exists
because backing up a workspace folder does **not** back up its sessions. — `REQ-SESSION-200`,
`REQ-SESSION-201`

**Restore**:
Putting a backup back. It is always explicit — never automatic, never implied by opening a
workspace. — `REQ-SESSION-201`
