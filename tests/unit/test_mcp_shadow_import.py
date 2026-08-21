from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

from rotaris_core.reqtocode import SWR, verifies

REPO_ROOT = Path(__file__).resolve().parents[2]
SRC_ROOT = REPO_ROOT / "src"
LOCAL_PACKAGE_ROOT = SRC_ROOT / "rotaris_core"
LOCAL_MCP_INIT = SRC_ROOT / "rotaris_core" / "mcp" / "__init__.py"


def _run_python(code: str, pythonpath: list[Path]) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    existing_pythonpath = env.get("PYTHONPATH")
    path_entries = [str(path) for path in pythonpath]
    if existing_pythonpath:
        path_entries.append(existing_pythonpath)
    env["PYTHONPATH"] = os.pathsep.join(path_entries)

    return subprocess.run(
        [sys.executable, "-c", code],
        capture_output=True,
        check=False,
        cwd=REPO_ROOT,
        env=env,
        text=True,
    )


@verifies(SWR.SWR_1708)
def test_shadowed_top_level_mcp_import_uses_external_dependency() -> None:
    result = _run_python(
        "from mcp import McpError\nimport mcp\nprint(mcp.__file__)",
        [LOCAL_PACKAGE_ROOT, SRC_ROOT],
    )

    assert result.returncode == 0, result.stderr
    assert str(LOCAL_MCP_INIT) not in result.stdout


@verifies(SWR.SWR_1708)
def test_namespaced_rotaris_mcp_import_still_uses_local_package() -> None:
    result = _run_python(
        "import rotaris_core.mcp as local_mcp\nprint(local_mcp.__file__)",
        [SRC_ROOT],
    )

    assert result.returncode == 0, result.stderr
    assert str(LOCAL_MCP_INIT) in result.stdout
