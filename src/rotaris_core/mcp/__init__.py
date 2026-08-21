from __future__ import annotations

import importlib.machinery
import importlib.util
import sys
from pathlib import Path


def _redirect_shadowed_top_level_import() -> None:
    current_file = Path(__file__).resolve()
    shadowing_root = current_file.parent.parent
    search_path: list[str] = []

    for entry in sys.path:
        resolved_entry = Path(entry or ".").resolve()
        if resolved_entry == shadowing_root:
            continue
        search_path.append(entry)

    spec = importlib.machinery.PathFinder.find_spec("mcp", search_path)
    if spec is None or spec.loader is None:
        raise ImportError(
            "The external 'mcp' package could not be found while resolving a shadowed import",
        )

    origin = getattr(spec, "origin", None)
    if origin is not None and Path(origin).resolve() == current_file:
        raise ImportError(
            "The local 'rotaris_core.mcp' package shadowed the external 'mcp' dependency",
        )

    module = importlib.util.module_from_spec(spec)
    sys.modules[__name__] = module
    spec.loader.exec_module(module)
    globals().update(module.__dict__)


if __name__ == "mcp":
    _redirect_shadowed_top_level_import()
