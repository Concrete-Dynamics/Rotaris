from __future__ import annotations

from typing import TYPE_CHECKING

from openhands.sdk import register_agent
from openhands.sdk.subagent.schema import AgentDefinition

from rotaris_core.agents.factory import (
    TOOL_NAME_MAP,
    _render_prompt,
    create_agent_for_persona,
    load_system_prompt,
)
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from rotaris_core.config.schema import PersonaConfig, RotarisConfig


class PersonaRegistry:
    def __init__(self, config: RotarisConfig):
        self._config = config
        self._personas: dict[str, PersonaConfig] = {}

    @traces(SWR.SWR_330, SWR.SWR_354)
    def load_all(self) -> None:
        for name, persona in self._config.personas.items():
            self._personas[name] = persona
            system_prompt = load_system_prompt(persona)
            system_prompt = _render_prompt(system_prompt, persona, self._config)
            agent_definition = AgentDefinition(
                name=persona.name,
                description=persona.purpose or f"{persona.name} persona",
                model=persona.model,
                tools=[TOOL_NAME_MAP.get(tool_name, tool_name) for tool_name in persona.tools],
                system_prompt=system_prompt,
            )
            register_agent(
                persona.name,
                create_agent_for_persona(persona, self._config),
                agent_definition,
            )

    def get_persona(self, name: str) -> PersonaConfig:
        if name not in self._personas:
            raise KeyError(f"Persona not found: {name}")
        return self._personas[name]

    def list_personas(self) -> list[str]:
        return list(self._personas.keys())
