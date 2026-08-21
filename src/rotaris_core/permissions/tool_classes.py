"""Shared tool classification for permission decisions (SWR-2503).

Single source of truth for "read-only" tool names, consumed both by the
persona tool-list filter (``agents/factory.py::_apply_tool_restrictions``,
which decides which tools an LLM is even offered) and by the permission
mode presets (``permissions/presets.py``, which decide allow/ask/deny for a
tool that was offered). Keeping one frozenset avoids the two views drifting
apart.
"""

from __future__ import annotations

from rotaris_core.reqtocode import SWR, traces

READ_ONLY_TOOLS: frozenset[str] = frozenset(
    {
        "grep",
        "glob",
        "fetch",
        "haet_read",
        "read_file",
        "artifact_read",
        "artifact_list",
        "artifact_write",
    },
)


#: Tools that open a socket to a host the agent chose (SWR-2505).  They are
#: *also* in :data:`READ_ONLY_TOOLS` — a fetch reads, it does not mutate the
#: workspace — which is exactly why they need a separate name: the presets must
#: gate them on the target host *before* the blanket read-only allow, and
#: ``agents/factory.py::_apply_tool_restrictions`` must keep offering them.
NETWORK_TOOLS: frozenset[str] = frozenset({"fetch"})


@traces(SWR.SWR_2503)
def is_read_only_tool(tool_name: str) -> bool:
    """Whether *tool_name* is in the shared read-only classification."""
    return tool_name in READ_ONLY_TOOLS
