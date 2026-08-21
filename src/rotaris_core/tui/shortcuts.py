from __future__ import annotations

from dataclasses import dataclass

from rotaris_core.reqtocode import SWR, traces


@dataclass(frozen=True)
@traces(
    SWR.SWR_1166,
    SWR.SWR_1167,
    SWR.SWR_1168,
    SWR.SWR_1171,
    SWR.SWR_1172,
    SWR.SWR_1173,
    SWR.SWR_1170,
    SWR.SWR_1182,
    SWR.SWR_1184,
)
class LeaderCommand:
    key: str
    description: str


LEADER_COMMANDS: tuple[LeaderCommand, ...] = (
    LeaderCommand("p", "Open command palette"),
    LeaderCommand("m", "Open runtime models"),
    LeaderCommand("q", "Quit gracefully"),
    LeaderCommand("s", "Stash input or save current editor"),
    LeaderCommand("r", "Toggle reasoning"),
    LeaderCommand("e", "Toggle multiline composer"),
    LeaderCommand("/", "Search transcript"),
    LeaderCommand("?", "Open help"),
)


def leader_binding_key(leader: str) -> str:
    lowered = leader.lower()
    if lowered == "esc":
        return "escape"
    return lowered


def format_leader_chord(leader: str, key: str) -> str:
    suffix = "?" if key == "?" else ("/" if key == "/" else key.upper())
    return f"{leader} {suffix}"


@traces(SWR.SWR_1175, SWR.SWR_1181)
def leader_help_lines(leader: str) -> list[str]:
    return [
        f"{format_leader_chord(leader, command.key)}  {command.description}"
        for command in LEADER_COMMANDS
    ]
