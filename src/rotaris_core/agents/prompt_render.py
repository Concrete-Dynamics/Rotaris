"""Dynamic system-prompt renderer with ``[[ROTARIS:TOKEN]]`` placeholders.

Supported tokens:
  ``[[ROTARIS:PERSONA_NAME]]``        — persona name
  ``[[ROTARIS:TOOL_NAMES]]``          — comma-separated tool names
  ``[[ROTARIS:TOOLS_SECTION]]``       — bullet list with behavioural hints
  ``[[ROTARIS:DELEGATE_NAMES]]``      — comma-separated delegate personas
  ``[[ROTARIS:DELEGATES_SECTION]]``   — bullet list of delegates
  ``[[ROTARIS:MCP_SECTION]]``         — bullet list of MCP servers with their exposed tools
  ``[[ROTARIS:DELEGATION_MECHANICS]]``— how the delegate tool trio works together
  ``[[ROTARIS:MODEL_INSTRUCTIONS]]``  — model-family-specific formatting guidance
  ``[[ROTARIS:PLAYBOOK]]``            — resolved persona x intent x tier playbook cell

Prompts without placeholders pass through unchanged.

**How work behaviour is expressed.** Anything that varies with the run — autonomy,
research policy, task sizing, verification ownership, artifact duties, report shape,
fan-out budget — belongs in the playbook (``agents/playbook.py`` +
``prompts/playbooks/``), never in a persona prompt or a hardcoded section builder here.
The tokens above cover only run-invariant facts: identity, what tools/delegates exist,
how the delegation tools work, and model-family formatting.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Mapping

_log = logging.getLogger(__name__)

_TOKEN_RE = re.compile(r"\[\[ROTARIS:([A-Z_]+)\]\]")

TOOL_HINTS: dict[str, str] = {
    "haet": "Alias of `haet_edit`; modify source files with hash-anchored precision edits.",
    "haet_edit": (
        "Modify source files with hash-anchored precision edits. "
        "Call it with `file_path` and `hunks`; each hunk must include "
        "`operation` (`insert_before`, `insert_after`, `replace`, or `delete`) "
        "plus the required HAET anchor fields only. Always call `haet_read` "
        "immediately before `haet_edit` to obtain fresh anchors."
    ),
    "haet_read": (
        "Read a file with hash-anchored line references. "
        "Accepted args: `file_path` and optional `offset` only. "
        "Each line prefix `#[ANCHOR] LINE_NUM |` provides the anchor to pass to `haet_edit`."
    ),
    "terminal": (
        "Run shell commands for tests, builds, and exploration. "
        "If you omit `timeout`, the runtime default timeout still applies as a hard kill. "
        "If you set `timeout`, it is also a hard kill: the command is forcibly terminated and the "
        "terminal session is recreated, so shell state from that session is lost. "
        "Never write source code files via shell redirects or heredocs; use `write_file` or "
        "`haet_edit` for all source file writes."
    ),
    "git_commit": "Create local git commits for completed units of work.",
    "fetch": (
        "Retrieve external documentation or web resources. Supports an optional timeout "
        "override; otherwise the runtime tool timeout applies, and failures include "
        "structured diagnostics."
    ),
    "grep": (
        "Search file contents by regex pattern. Returns 'file:line:content' matches. "
        "Use `paths` to restrict to specific files or glob patterns."
    ),
    "glob": (
        "List workspace files matching a glob pattern (e.g. `**/*.py`, `src/**/*.ts`). "
        "Use `base_path` to restrict to a subdirectory."
    ),
    "delegate": "Delegate subtasks to specialist personas.",
    "background_output": (
        "Retrieve the stored result of a completed background task by its task_id. "
        'Use the default detail level for the compact report, or `detail_level="verbatim"` '
        "for the exact last reply plus stored evidence."
    ),
    "wait_for_tasks": (
        "Voluntarily block until specific background tasks complete. "
        "Pass task_ids to wait for specific tasks, or empty list for all."
    ),
    "todo": "Manage a phased task list for progress tracking.",
    "read_file": (
        "Read file content with line numbers, or list directory entries.\n"
        "  Use `offset`/`limit` for pagination. Use `grep` to search within a file.\n"
        "  You MUST call `read_file` on a file before editing it — edits to unread files "
        "are rejected.\n"
        "  Always re-read immediately before editing to get current content."
    ),
    "write_file": (
        "Create, edit, overwrite, or insert content in files.\n"
        "  Commands: `create`, `edit`, `overwrite`, `insert`, `undo`.\n\n"
        "  COMMAND SELECTION GUIDE:\n"
        "  - `create`: New files only (fails if file exists).\n"
        "  - `edit`: Targeted find-and-replace. Best for changing <30% of a file.\n"
        "  - `overwrite`: Replace entire file. Use when edit fails repeatedly, or when "
        "rewriting >30% of lines.\n"
        "  - `insert`: Add lines after a specific line number (0 = beginning of file).\n"
        "  - `undo`: Revert the last write to a file.\n\n"
        "  EDIT COMMAND DETAILS:\n"
        "  - `old_str` must match the file content. Copy it exactly from `read_file` output — "
        "same indentation, same whitespace, same line breaks.\n"
        "  - Include 2-3 lines of surrounding context in `old_str` to ensure a unique match.\n"
        "  - `new_str` is the full replacement for `old_str` — include the context lines too.\n"
        "  - The engine tries 4 match levels: exact → whitespace-normalized → indent-adjusted "
        "→ fuzzy. But exact match is best.\n"
        "  - Set `replace_all=true` to replace every occurrence of `old_str`.\n\n"
        "  EDITING PROTOCOL:\n"
        "  1. Always call `read_file` immediately before editing.\n"
        "  2. Copy `old_str` directly from that `read_file` output.\n"
        "  3. If `edit` fails, call `read_file` again — the file may have changed.\n"
        "  4. After 2 failed edits on the same region, switch to `overwrite`.\n"
        "  5. NEVER write source files via `terminal`. Only `write_file` may write source code."
    ),
    "artifact_list": (
        "List session artifacts produced by prior agents in this session. "
        "Returns one line per artifact with id, slug, source persona, status, tags, and title. "
        "Filter by `tags` (AND match) using the closed vocabulary: "
        "research, planning, implementation, review, verification, errors. "
        "Use early in your workflow to discover planning, architectural, requirements, or research "
        "artifacts that may already contain the context you need. "
        "Pair with `artifact_read(id)` to fetch full content. "
        "Superseded artifacts are hidden by default; pass `include_superseded=true` to see them."
    ),
    "artifact_read": (
        "Read a session artifact by id or slug. "
        "Artifacts contain authoritative prior-agent findings — plans, designs, requirements, "
        "research summaries, code snippets, and highlight paths. "
        "The default returns the full Markdown body; pass `sections=['summary','snippets']` "
        "for a filtered view. "
        "Always prefer reading an existing artifact over re-exploring files the prior agent "
        "already investigated."
    ),
    "artifact_write": (
        "Publish a curated artifact to the session store so downstream agents can read it "
        "via `artifact_read`. Use to persist a completed plan, design, requirements digest, "
        "or research summary as a named, addressable output. "
        "`tags` must use the closed vocabulary: "
        "research, planning, implementation, review, verification, errors. "
        "Pass `supersedes=<id-or-slug>` to mark an older version obsolete. "
        "Only available when `can_publish_artifacts` is enabled for this persona."
    ),
}


@dataclass(frozen=True, slots=True)
@traces(SWR.SWR_353)
class PromptRenderContext:
    """Immutable context bag for prompt placeholder resolution."""

    persona_name: str = ""
    model_name: str = ""
    tools: list[str] = field(default_factory=list)
    delegates_to: list[str] = field(default_factory=list)
    mcp_servers: list[str] = field(default_factory=list)
    mcp_server_tools: dict[str, list[tuple[str, str]]] = field(default_factory=dict)
    delegate_purposes: dict[str, str | None] = field(default_factory=dict)
    delegate_model_tiers: Mapping[str, str | None] = field(default_factory=dict)
    workspace_root: str = ""
    #: Pre-rendered playbook block for ``[[ROTARIS:PLAYBOOK]]`` (SWR-2416). Resolved
    #: by the caller, which knows the run intent and the persona's model tier.
    playbook: str = ""


@traces(SWR.SWR_322, SWR.SWR_332)
def _format_tools_section(tools: list[str]) -> str:
    """Build a Markdown bullet list of tools with behavioural hints."""
    if not tools:
        return "_No tools configured._"
    lines: list[str] = []
    for tool in tools:
        hint = TOOL_HINTS.get(tool, "")
        if hint:
            lines.append(f"- `{tool}` — {hint}")
        else:
            lines.append(f"- `{tool}`")
    return "\n".join(lines)


#: Per-delegate capacity, reported as a *fact* about that delegate.
#:
#: How to cut work into assignments is the playbook's ``CHUNKING`` slot — do not
#: restate it here. This map answers only "how much can this particular delegate
#: hold?", which the playbook cannot: the orchestrator's cell is keyed on the
#: implementation owner's tier, while its delegate list spans many tiers.
_DELEGATE_CAPACITY: dict[str, str] = {
    "large_model": (
        "can own a whole cohesive deliverable end to end, including its own exploration "
        "and verification."
    ),
    "medium_model": "can own a scoped deliverable spanning related files and their tests.",
    "small_model": (
        "needs one narrow, fully specified deliverable with the context supplied to it."
    ),
}
_UNKNOWN_DELEGATE_CAPACITY = (
    "capacity undetermined — treat it conservatively, as if it were `medium_model`."
)


@traces(SWR.SWR_324, SWR.SWR_352, SWR.SWR_386)
def _format_delegates_section(
    delegates: list[str],
    purposes: dict[str, str | None] | None = None,
    model_tiers: Mapping[str, str | None] | None = None,
) -> str:
    """Build a Markdown bullet list of delegatable personas.

    When *purposes* contains a non-empty entry for a delegate name, renders
    the bullet as ``- `name` — <purpose>``; otherwise falls back to ``- `name```.
    """
    if not delegates:
        return "_No delegate personas configured._"
    lines: list[str] = []
    for name in delegates:
        purpose = (purposes or {}).get(name)
        if purpose:
            lines.append(f"- `{name}` — {purpose}")
        else:
            lines.append(f"- `{name}`")
        if model_tiers is not None and name in model_tiers:
            model_tier = model_tiers[name]
            if model_tier in _DELEGATE_CAPACITY:
                size_label = f"`{model_tier}`"
                capacity = _DELEGATE_CAPACITY[model_tier]
            else:
                size_label = "custom/unknown"
                capacity = _UNKNOWN_DELEGATE_CAPACITY
            lines.append(f"  - **Model size:** {size_label} — {capacity}")
    return "\n".join(lines)


def _format_names(names: list[str]) -> str:
    """Comma-separated inline list, or ``(none)``."""
    return ", ".join(f"`{n}`" for n in names) if names else "(none)"


#: Per-server startup notes rendered under the server's entry in the MCP section.
#:
#: Empty by design since SWR-2818. The one entry this ever held told agents how to
#: (re-)initialize the `lsp` server's project root; Serena, which replaced it, is
#: bound to the workspace at launch (SWR-2905), so there is nothing an agent has
#: to do — and a hint telling it otherwise would send it after a tool that does
#: not exist. The seam stays for the next server that genuinely needs one.
#:
#: Values may reference ``{workspace_root}``.
_SERVER_STARTUP_HINTS: dict[str, str] = {}


_SERENA_MEMORY_PROTOCOL = """  - **Project memories.** Serena keeps durable notes about *this* repository,
    written by whichever agent learned the thing. They are the reason you are not
    the first agent to read this codebase.
    - Call `list_memories` before you start exploring, and `read_memory` on the
      entries that look relevant. Re-deriving what a memory already records is
      wasted work, and your conclusion may be worse than the recorded one.
    - `AGENTS.md` is already in your context and is authoritative for
      conventions, commands, and house rules. Never copy it into a memory.
      Memories hold what you had to *find out* — where a subsystem actually
      lives, why an obvious approach fails here, which check catches what.
    - Write one when you learn something durable and non-obvious that the next
      agent would otherwise re-derive: `write_memory` for a new note,
      `edit_memory` to correct one you found wrong. Keep it short and specific;
      a memory that restates the file tree helps nobody.
    - Do not record run-specific state — a task's status, your todo list, or
      what you are about to do next. Memories outlive this run."""
"""Rendered for a persona that actually holds Serena's memory tools (SWR-2822).

Granting `write_memory` without saying what it is for produced a store nobody
read and nobody wrote: before this, no persona prompt mentioned memories at all,
so the tools sat unused behind every persona that carried the server.

It belongs here rather than in eleven prompt files because it is a run-invariant
fact about the toolset — the same reason `MCP_SECTION` itself is a token — and
because a rule split across eleven copies drifts.
"""

#: Tools whose presence in a persona's granted set makes the protocol above worth
#: rendering. Keyed on the read side: an agent that can list and read memories has
#: something to be told, whether or not it may also write.
_SERENA_MEMORY_TOOLS = frozenset({"list_memories", "read_memory"})


@traces(SWR.SWR_325, SWR.SWR_2822)
def _format_mcp_section(
    servers: list[str],
    server_tools: dict[str, list[tuple[str, str]]],
    workspace_root: str = "",
) -> str:
    """Build a Markdown bullet list of MCP servers with their exposed tools."""
    if not servers:
        return "_No MCP servers configured._"
    lines: list[str] = []
    for server in servers:
        tools = server_tools.get(server, [])
        if not tools:
            lines.append(f"- `{server}`")
        else:
            lines.append(f"- **`{server}`**")
            for tool_name, description in tools:
                if description:
                    lines.append(f"  - `{tool_name}` — {description}")
                else:
                    lines.append(f"  - `{tool_name}`")
        hint_template = _SERVER_STARTUP_HINTS.get(server)
        if hint_template:
            hint = hint_template.format(workspace_root=workspace_root or "<workspace_root>")
            lines.append(f"  - ⚠ {hint}")
        if _grants_serena_memories(server, tools):
            lines.append(_SERENA_MEMORY_PROTOCOL)
    return "\n".join(lines)


def _grants_serena_memories(server: str, tools: list[tuple[str, str]]) -> bool:
    """Whether *server* is Serena and this persona was actually granted memories.

    Keyed on the granted tool names rather than on the server name alone, so a
    persona whose grant withholds the memory store (SWR-3008 narrows per role) is
    not handed a protocol for tools it does not have.
    """
    if server != "serena":
        return False
    granted = {name for name, _ in tools}
    return granted >= _SERENA_MEMORY_TOOLS


_MODEL_FAMILY_PREFIXES: dict[str, str] = {
    "gpt": "gpt",
    "o1": "gpt",
    "o3": "gpt",
    "o4": "gpt",
    "openai": "gpt",
    "claude": "claude",
    "anthropic": "claude",
    "gemini": "gemini",
    "google": "gemini",
}

#: Model-family expression style, authored once per family.
#:
#: Formatting and reasoning-expression only. How much an agent decides, how it sizes
#: work, and what it must verify are playbook slots — never restate them here, or a
#: `strict` cell ends up contradicted by a "make autonomous decisions" bullet.
_MODEL_FAMILY_STYLE: dict[str, str] = {
    "gpt": """# Model-Specific Guidance

- Reason in explicit, ordered steps rather than implicitly
- Use function calling directly and specifically; do not narrate tool intent
- Prefer JSON for structured payloads""",
    "claude": """# Model-Specific Guidance

- Reason in natural language; implicit structure is fine
- Prefer XML tags when a payload needs structure
- Use the extended context window instead of re-reading material already in context
- Assume stated context is understood; do not restate it""",
    "gemini": """# Model-Specific Guidance

- Answer directly, without preamble
- Prefer JSON or YAML for structured payloads
- Be explicit about constraints and limitations""",
}

#: Genuinely persona-specific additions, appended to the family block above. Keep this
#: map near-empty: an entry here must say something the family block cannot.
_PERSONA_FAMILY_STYLE: dict[tuple[str, str], str] = {
    ("planner", "gpt"): "- Number plan steps and declare dependencies explicitly",
    ("planner", "claude"): "- Let plan step order carry the dependencies narratively",
    ("planner", "gemini"): "- Organize the plan hierarchically with clear section headings",
}


def _detect_model_family(model_name: str) -> str | None:
    """Return the canonical family key for *model_name*, or ``None``."""
    lower = model_name.lower()
    for prefix, family in _MODEL_FAMILY_PREFIXES.items():
        if lower.startswith(prefix):
            return family
    return None


@traces(SWR.SWR_337, SWR.SWR_338, SWR.SWR_339, SWR.SWR_340, SWR.SWR_341)
def build_model_instructions_section(
    persona_name: str,
    model_name: str,
) -> str:
    """Return model-family expression guidance for *persona_name*.

    The family block is authored once and shared; a persona only adds lines when it
    has something the family block cannot express. Returns an empty string when the
    model family cannot be determined.
    """
    family = _detect_model_family(model_name)
    if family is None:
        return ""
    block = _MODEL_FAMILY_STYLE.get(family, "")
    if not block:
        return ""
    extra = _PERSONA_FAMILY_STYLE.get((persona_name, family))
    return f"{block}\n{extra}" if extra else block


_DELEGATION_MECHANICS = """## Delegation mechanics

How the three delegation tools work together. *Whether* and *how widely* to delegate is
set by your playbook, not here.

### The tools
- `delegate` — spawn a child task. Returns a `task_id` immediately.
- `background_output(task_id, detail_level="summary"|"verbatim")` — retrieve the stored
  report of a completed background task.
- `wait_for_tasks(task_ids)` — voluntarily block until specific tasks finish.

### Background execution (the default)
Call `delegate` with `run_in_background=true` (the default); call it several times in the
same response to launch several tasks at once. A `[BACKGROUND TASK COMPLETED]` system
notification is injected as each one finishes. Continue productive work between
notifications — do NOT poll.

### Collecting results
- `background_output(task_id)` — the compact report, after a completion notification.
- `background_output(task_id, detail_level="verbatim")` — the exact last reply plus
  stored evidence.
- `wait_for_tasks([id1, id2])` — block until those tasks complete, then resume with a
  structured summary. `wait_for_tasks([])` waits for ALL active background tasks you directly delegated.

### Foreground execution
`run_in_background=false` pauses you until the child finishes. Use it only when your very
next action cannot be decided without that child's result.

### Ordering
Within a background batch, `depends_on=[task_id, ...]` declares ordering — dependent tasks
start automatically once their predecessors succeed.

### Passing context to children
Forward upstream findings by reference, never by paraphrase:
- `inherited_context=[task_id, ...]` — upstream task results.
- `attach_artifacts=[id_or_slug, ...]` — published artifacts. Always use this when
  delegating to a planner, architect, or implementer after research, so the child sees the
  actual snippets.
- The framework also prepends a "PRIOR SIBLING ARTIFACT INDEX" to every child unless you
  set `suppress_auto_context: true` — one line per artifact, slug plus a one-line summary,
  no findings and no bodies. It tells the child what exists, not what it says; the child
  pulls the bodies it needs with `artifact_read`. Attach the artifacts a child must not
  miss rather than trusting it to find them in the index.

NEVER paste a previous child's output into a new task description, and never restate its
findings in your own words — both lose fidelity and cause drift. Reference them by id.

### Ownership
Assign exactly one active owner per task or slice. NEVER give two children the same task,
file, or slice at the same time — concurrent implementers corrupt each other's work. If
you cannot state a clear boundary between two children, use one child and serialize."""


@traces(SWR.SWR_144, SWR.SWR_148, SWR.SWR_2416)
@traces(
    SWR.SWR_319,
    SWR.SWR_320,
    SWR.SWR_321,
    SWR.SWR_323,
    SWR.SWR_326,
    SWR.SWR_327,
    SWR.SWR_348,
    SWR.SWR_349,
)
def render_system_prompt(template: str, ctx: PromptRenderContext) -> str:
    """Replace ``[[ROTARIS:…]]`` tokens in *template* using *ctx*.

    Unknown tokens are left in place and logged as warnings.
    """
    if "[[ROTARIS:" not in template:
        return template

    replacements: dict[str, str] = {
        "PERSONA_NAME": ctx.persona_name,
        "TOOL_NAMES": _format_names(ctx.tools),
        "TOOLS_SECTION": _format_tools_section(ctx.tools),
        "DELEGATE_NAMES": _format_names(ctx.delegates_to),
        "DELEGATES_SECTION": _format_delegates_section(
            ctx.delegates_to,
            ctx.delegate_purposes,
            ctx.delegate_model_tiers,
        ),
        "MCP_SECTION": _format_mcp_section(
            ctx.mcp_servers,
            ctx.mcp_server_tools,
            ctx.workspace_root,
        ),
        "DELEGATION_MECHANICS": _DELEGATION_MECHANICS,
        "MODEL_INSTRUCTIONS": build_model_instructions_section(ctx.persona_name, ctx.model_name),
        "PLAYBOOK": ctx.playbook,
    }

    def _replace(match: re.Match[str]) -> str:
        token = match.group(1)
        if token in replacements:
            return replacements[token]
        _log.warning(
            "Unresolved prompt placeholder [[ROTARIS:%s]] — check the prompt template for typos.",
            token,
        )
        return match.group(0)

    return _TOKEN_RE.sub(_replace, template)
