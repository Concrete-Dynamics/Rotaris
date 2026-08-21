"""Did this iteration modify workspace files? (SWR-2602)

The verifier suite only runs after an iteration whose tool activity touched the
workspace, so a read-only iteration never pays for a pytest run. The decision is
deliberately made from *tracked* signals rather than a git scan:

- the iteration's tool-call delta (``GlobalTracker``, fed from the live
  transcript in ``orchestrator/child_run.py``), and
- the files the child report declares as edited or created.

The two are unioned rather than ranked. Tool evidence is deterministic but blind
to edits made through MCP or custom tools; the report fields cover those but are
LLM-authored and can be forgotten. Requiring either one to fire means a
forgetful agent cannot silently suppress verification.

Pure decision logic: no filesystem access, no execution.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Mapping, Sequence

#: Tools whose successful use means workspace files changed. Names are the
#: SDK-side ones from ``agents/factory.py::TOOL_NAME_MAP``. ``terminal`` is
#: deliberately absent: a shell command *may* write files, but the requirement
#: scopes change detection to tracked file operations, not a full workspace scan.
MUTATING_TOOL_NAMES = frozenset({"write_file", "haet_edit", "git_commit"})

_NO_CHANGE_REASON = "No tracked file modifications in this iteration."


@traces(SWR.SWR_2602)
@dataclass(frozen=True, slots=True)
class WorkspaceChangeSignal:
    """Whether an iteration modified workspace files, and what said so."""

    changed: bool
    #: Human-readable explanation. When ``changed`` is False this is the reason
    #: recorded for the skipped verifier run.
    reason: str
    #: Contributing evidence, in detection order, e.g. ``("tool:write_file",)``.
    sources: tuple[str, ...] = ()


@traces(SWR.SWR_2602)
def detect_workspace_change(
    *,
    tool_calls: Mapping[str, int] | None = None,
    edited_files: Sequence[Any] = (),
    created_files: Sequence[Any] = (),
) -> WorkspaceChangeSignal:
    """Decide whether the verifier suite should run for one iteration.

    ``tool_calls`` is the iteration's tool-call *delta* (tool name → count), not
    a cumulative total. Tool names are matched case-insensitively. Never raises:
    a malformed count or an unreadable file entry contributes nothing rather
    than breaking the iteration.
    """
    sources: list[str] = []

    for name, count in (tool_calls or {}).items():
        if not isinstance(name, str):
            continue
        normalized = name.strip().lower()
        if normalized not in MUTATING_TOOL_NAMES:
            continue
        if not _is_positive(count):
            continue
        sources.append(f"tool:{normalized}")
    sources.sort()

    if edited_files:
        sources.append("report:edited_files")
    if created_files:
        sources.append("report:created_files")

    if not sources:
        return WorkspaceChangeSignal(changed=False, reason=_NO_CHANGE_REASON)

    return WorkspaceChangeSignal(
        changed=True,
        reason=f"Workspace files were modified ({', '.join(sources)}).",
        sources=tuple(sources),
    )


def _is_positive(count: object) -> bool:
    return isinstance(count, int) and not isinstance(count, bool) and count > 0
