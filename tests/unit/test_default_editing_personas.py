from __future__ import annotations

from rotaris_core.config.defaults import DEFAULT_PERSONAS
from rotaris_core.reqtocode import SWR, verifies


@verifies(SWR.SWR_115, SWR.SWR_116)
def test_default_editing_personas_include_repo_file_tools() -> None:
    editing_personas = [
        "architect",
        "coding-agent",
        "tester",
        "docs-writer",
        "refactorer",
    ]

    for persona_name in editing_personas:
        tools = set(DEFAULT_PERSONAS[persona_name].tools)
        # Editing personas use either the legacy read_file/write_file pair or
        # the HAET toolset (haet_read + haet_edit). write_file is kept for
        # creating new files even when haet_edit handles patches.
        assert tools & {"write_file", "haet_edit"}, f"{persona_name}: no write capability"
        assert tools & {"read_file", "haet_read"}, f"{persona_name}: no read capability"
