from __future__ import annotations

import importlib.util
import inspect
from typing import TYPE_CHECKING

from openhands.sdk import ToolDefinition, register_tool

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from pathlib import Path


@traces(SWR.SWR_537, SWR.SWR_538, SWR.SWR_546)
def load_plugin(plugin_path: Path, base_dir: Path) -> str:
    module_name = _module_name(plugin_path, base_dir)
    spec = importlib.util.spec_from_file_location(module_name, plugin_path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Unable to load plugin: {plugin_path}")
    module = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(module)
    except Exception as exc:
        raise ImportError(f"Failed to import plugin {plugin_path}: {exc}") from exc

    for _, obj in inspect.getmembers(module, inspect.isclass):
        if (
            issubclass(obj, ToolDefinition)
            and obj is not ToolDefinition
            and obj.__module__ == module.__name__
        ):
            register_tool(obj.name, obj)
            return obj.name
    raise TypeError(f"No ToolDefinition subclass found in {plugin_path}")


@traces(SWR.SWR_540)
def load_plugins_from_dirs(global_dir: Path | None, workspace_dir: Path | None) -> list[str]:
    loaded: list[str] = []
    for directory in (global_dir, workspace_dir):
        if directory is None or not directory.exists() or not directory.is_dir():
            continue
        for plugin_path in sorted(directory.glob("*.py")):
            if plugin_path.name == "__init__.py":
                continue
            loaded.append(load_plugin(plugin_path, directory))
    return loaded


def _module_name(plugin_path: Path, base_dir: Path) -> str:
    relative = plugin_path.resolve().relative_to(base_dir.resolve())
    return "rotaris_core_dynamic_plugins." + ".".join(relative.with_suffix("").parts)
