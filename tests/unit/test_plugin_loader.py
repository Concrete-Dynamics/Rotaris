from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.tools import plugin_loader

if TYPE_CHECKING:
    from pathlib import Path


PLUGIN_SOURCE = """
from collections.abc import Sequence
from typing import Self

from openhands.sdk import Action, Observation, ToolDefinition
from openhands.sdk.tool import ToolExecutor
from pydantic import Field


class SampleAction(Action):
    value: str = Field(...)


class SampleObservation(Observation):
    pass


class SampleExecutor(ToolExecutor[SampleAction, SampleObservation]):
    def __call__(self, action, conversation=None):
        return SampleObservation.from_text(action.value)


class SampleTool(ToolDefinition[SampleAction, SampleObservation]):
    @classmethod
    def create(cls, conv_state=None, **kwargs) -> Sequence[Self]:
        return [
            cls(
                description="sample",
                action_type=SampleAction,
                observation_type=SampleObservation,
                executor=SampleExecutor(),
            )
        ]
"""


@verifies(SWR.SWR_537, SWR.SWR_538, SWR.SWR_542, SWR.SWR_543)
def test_load_valid_plugin_returns_registered_name(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    plugin_path = tmp_path / "sample_plugin.py"
    plugin_path.write_text(PLUGIN_SOURCE)
    registered: list[tuple[str, object]] = []
    monkeypatch.setattr(
        plugin_loader,
        "register_tool",
        lambda name, tool: registered.append((name, tool)),
    )

    name = plugin_loader.load_plugin(plugin_path, tmp_path)

    assert name == "sample"
    assert registered[0][0] == "sample"


@verifies(SWR.SWR_546)
def test_plugin_with_no_tool_definition_subclass_raises_type_error(
    tmp_path: Path,
) -> None:
    plugin_path = tmp_path / "bad_plugin.py"
    plugin_path.write_text("class Nothing: pass\n")

    with pytest.raises(TypeError):
        plugin_loader.load_plugin(plugin_path, tmp_path)


@verifies(SWR.SWR_545)
def test_import_error_is_wrapped(tmp_path: Path) -> None:
    plugin_path = tmp_path / "broken_plugin.py"
    plugin_path.write_text("raise RuntimeError('boom')\n")

    with pytest.raises(ImportError):
        plugin_loader.load_plugin(plugin_path, tmp_path)


@verifies(SWR.SWR_537, SWR.SWR_540)
def test_load_from_directory_loads_all_plugins(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    global_dir = tmp_path / "global_tools"
    workspace_dir = tmp_path / "workspace_tools"
    global_dir.mkdir()
    workspace_dir.mkdir()
    (global_dir / "a.py").write_text(PLUGIN_SOURCE.replace("Sample", "GlobalA"))
    (workspace_dir / "b.py").write_text(PLUGIN_SOURCE.replace("Sample", "WorkspaceB"))
    registered: list[str] = []
    monkeypatch.setattr(plugin_loader, "register_tool", lambda name, tool: registered.append(name))

    loaded = plugin_loader.load_plugins_from_dirs(global_dir, workspace_dir)

    assert loaded == ["global_a", "workspace_b"]
    assert registered == ["global_a", "workspace_b"]


@verifies(SWR.SWR_537)
def test_missing_directory_returns_empty_list(tmp_path: Path) -> None:
    loaded = plugin_loader.load_plugins_from_dirs(tmp_path / "missing", None)

    assert loaded == []
