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
_Avoid_: project, repository (a workspace need not be a repository), folder, directory

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
