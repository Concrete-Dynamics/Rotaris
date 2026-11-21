[Product directives](../directives.md) › PD-CONFIG-014

<a id="pd-config-014"></a>

### PD-CONFIG-014 — an agent changes Rotaris's own configuration through one tool, never through a file write

*Minted 2026-11-21, not yet built.*

1. **One tool.** A run SHALL be offered one configuration tool, `configure`, with three operations: `read` (the effective
   value of a named key and the scope it came from), `explain` (what a named key does and which values it takes) and
   `set` (a proposed value for a named key, in a named scope). The tool SHALL take a key as a dotted path into the
   configuration's sections (`models.default`, `skills.enabled`, `instructions.overrides`), never a file's text, and
   SHALL refuse a key the configuration does not define, naming the nearest key it does.
2. **The one writer.** An accepted `set` SHALL be written through the scoped per-field write path (REQ-CONFIG-441) — that
   key alone, comments, order and unknown keys preserved, a file that cannot be parsed refused (REQ-CONFIG-442) —
   followed by the configuration reload and the announcement that the screens already hear. The value SHALL be
   validated against the key's own rules before anything is written; a value the load would reject is refused with the
   reason and writes nothing.
3. **Scope.** `set` SHALL target the workspace's `agents.yaml` unless the user asked, in the run that makes the change,
   for the global scope; a global `set` with no such ask is refused, naming the workspace scope as the way.
4. **Two classes of key.** Every key SHALL belong to exactly one class, stated in one place the tool and the screens read:
   - **ordinary** — what a run does within the authority it already has: models and their parameters, personas, skills
     enabled or disabled, the instruction files' overrides, display and transcript settings. A `set` of one is approved
     as a file write is under the permission mode in effect.
   - **authority** — what widens or narrows what a later run may do: the permission mode, the outside-workspace opt-out
     and the read-only roots, the sandbox and egress keys, hooks, tool servers (`mcp_servers`, any entry, any field), a
     role's tool grants, and the project initialisation commands. A `set` of one SHALL always ask the user, in every
     permission mode, showing the key, the scope, the value it holds and the value proposed; no allow rule, preset or
     earlier answer pre-approves it, and the run that asked is not changed by the answer.
   - **never** — `secrets.yaml` and every credential. The tool SHALL refuse them, naming the screen that holds them.
5. **When it applies.** A change SHALL take effect for the next run, which is when configuration is resolved; the tool's
   reply SHALL say so. The Settings screen SHALL show the new value without a restart.
6. **What the file tools no longer do.** `write_file`, `edit_file` and every other file tool that writes SHALL refuse a
   path under the workspace's `.rotaris/` or `.git/` and under the global configuration directory, whatever the
   outside-workspace opt-out says, with a message that names `configure` for the former. Reading them is unchanged.
7. **The record.** Every accepted `set` SHALL be written to the permission audit trail with the key, the scope, the value
   before and the value after, and SHALL draw in the transcript as one row carrying that change and an Undo that writes
   the value before back through the same path.

**Why, and what it costs.** The owner asked that Rotaris be able to change its own configuration from the workspace, as
other harnesses do. Surveyed from their public documentation for R-121: Claude Code lets the model edit its settings
files with its ordinary file tools but puts the configuration directory on a protected-path list that always asks and
that no allow rule can pre-approve, and refuses a permission-widening mode written by a repository; Codex keeps `.codex`
and `.git` protected inside the sandbox and loads project configuration only for a trusted project; Cursor, Cline and
OpenCode give dedicated commands (`/create-rule`, `cline mcp add`) and schemas. The common lesson is that the surface an
agent may write freely and the surface that decides its own authority are kept apart, and the second is gated however
the run is configured. Rotaris already had half of that: REQ-SANDBOX-056 keeps `.rotaris` read-only to a confined
command so that it cannot "write the configuration that governs a later run". The file tools did not share that fence
([the defect note](../../defects/the-file-tools-write-into-rotaris-and-git-that-the-sandbox-keeps-read-only.md)), so a
run could already rewrite its own configuration as raw YAML, unvalidated and approved as any file edit. A dedicated tool
gives the change a schema, a scope and an approval point, and lets the file tools close the route REQ-SANDBOX-056
meant closed. What it costs: an agent can no longer edit `.rotaris/` by hand at all — a file there that `configure`
does not reach (a playbook override, persona memory written by the product itself) is the user's to edit — and a
change made by `configure` waits for the next run. The two choices left open when the plan was shown were decided under
[R-098](../requests.md#r-098)'s standing delegation: the global scope only on the user's ask (an agent in one workspace
should not change every other), and tool servers counted as authority (an entry is a command the product will execute).

REQ-TOOLS-130 is narrowed in one case, stated exhaustively: with the outside-workspace opt-out on, a file tool's write
to a path under the global configuration directory is still refused (clause 6). Every other path the opt-out admits it
still admits.

> **Narrows:** REQ-TOOLS-130
> **Extends:** REQ-CONFIG-441, REQ-TOOLS-129, REQ-SANDBOX-056

*Raised by the owner, 2026-11-21, in conversation ("rotaris needs to be able to change its own configuration via
workspace", then "Yes, log it" over the plan); logged as [R-121](../requests.md#r-121). Minted by the agent that drafted
the plan (`claude-opus-5-5`), proposed under [R-098](../requests.md#r-098) where it decides what the owner left open.*
