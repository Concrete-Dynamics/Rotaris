from __future__ import annotations

from typing import TYPE_CHECKING, Self, TypedDict

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.tools.search import GlobAction, GlobExecutor, GrepAction, GrepExecutor

if TYPE_CHECKING:
    from pathlib import Path


class _LaunchRecord(TypedDict):
    command: list[str]
    cwd: Path
    terminated: bool


@verifies(SWR.SWR_401)
def test_grep_action_accepts_path_alias() -> None:
    """Grep accepts ``path`` (string) as alias for ``paths``."""
    action = GrepAction.model_validate({"pattern": "needle", "path": "src/"})
    assert action.paths == ["src/"]


@verifies(SWR.SWR_401)
def test_grep_action_accepts_paths_as_single_string() -> None:
    """Grep accepts ``paths`` as a plain string and wraps it in a list."""
    action = GrepAction.model_validate({"pattern": "needle", "paths": "src/"})
    assert action.paths == ["src/"]


@verifies(SWR.SWR_401)
def test_grep_schema_describes_paths_as_plural_array_parameter() -> None:
    schema = GrepAction.model_json_schema()

    description = schema["properties"]["paths"]["description"]
    assert "JSON array of strings" in description
    assert "parameter name `paths`" in description
    assert "not `path`" in description


@verifies(SWR.SWR_401)
def test_grep_python_fallback_excludes_node_modules_and_session_dirs(
    tmp_workspace: Path,
    monkeypatch,
) -> None:
    (tmp_workspace / "src").mkdir()
    (tmp_workspace / "src" / "app.py").write_text("needle = True\n", encoding="utf-8")
    (tmp_workspace / "node_modules").mkdir()
    (tmp_workspace / "node_modules" / "vendor.js").write_text("needle\n", encoding="utf-8")
    session_dir = tmp_workspace / ".rotaris" / "sessions" / "abc123"
    session_dir.mkdir(parents=True)
    (session_dir / "snapshot.json").write_text('{"needle": true}\n', encoding="utf-8")

    monkeypatch.setattr("rotaris_core.tools.search.shutil.which", lambda name: None)

    observation = GrepExecutor(tmp_workspace)(GrepAction(pattern="needle", max_matches=10))

    assert observation.text is not None
    # node_modules is now in IGNORED_PATH_PARTS — it must NOT appear
    assert "src/app.py:1:needle = True" in observation.text
    assert "node_modules" not in observation.text
    assert ".rotaris" not in observation.text


@verifies(SWR.SWR_2114, SWR.SWR_562)
def test_grep_python_fallback_accepts_absolute_path_inside_workspace(
    tmp_workspace: Path,
    monkeypatch,
) -> None:
    src = tmp_workspace / "src"
    src.mkdir()
    target = src / "app.py"
    target.write_text("needle = True\n", encoding="utf-8")
    monkeypatch.setattr("rotaris_core.tools.search.shutil.which", lambda name: None)

    observation = GrepExecutor(tmp_workspace)(
        GrepAction(pattern="needle", paths=[str(target)]),
    )

    assert observation.text == "src/app.py:1:needle = True"


@verifies(SWR.SWR_2114, SWR.SWR_562)
def test_grep_python_fallback_skips_absolute_path_outside_workspace(
    tmp_workspace: Path,
    tmp_path: Path,
    monkeypatch,
) -> None:
    outside = tmp_path / "outside.py"
    outside.write_text("needle = True\n", encoding="utf-8")
    monkeypatch.setattr("rotaris_core.tools.search.shutil.which", lambda name: None)

    observation = GrepExecutor(tmp_workspace)(
        GrepAction(pattern="needle", paths=[str(outside)]),
    )

    assert observation.text == "No matches found"


@verifies(SWR.SWR_401)
def test_glob_python_fallback_excludes_ignored_dirs(
    tmp_workspace: Path,
    monkeypatch,
) -> None:
    (tmp_workspace / "src" / "client").mkdir(parents=True)
    (tmp_workspace / "src" / "client" / "app.js").write_text(
        "console.log('ok')\n",
        encoding="utf-8",
    )
    (tmp_workspace / "build").mkdir()
    (tmp_workspace / "build" / "bundle.js").write_text("ignored\n", encoding="utf-8")
    (tmp_workspace / "node_modules").mkdir()
    (tmp_workspace / "node_modules" / "vendor.js").write_text("ignored\n", encoding="utf-8")

    monkeypatch.setattr("rotaris_core.tools.search.shutil.which", lambda name: None)

    observation = GlobExecutor(tmp_workspace)(GlobAction(pattern="**/*.js"))

    # build/ and node_modules/ are in IGNORED_PATH_PARTS — they must NOT appear
    assert observation.text == "src/client/app.js"


@verifies(SWR.SWR_401)
def test_grep_uses_ripgrep_when_available(tmp_workspace: Path, monkeypatch) -> None:
    launched: _LaunchRecord = {"command": [], "cwd": tmp_workspace, "terminated": False}

    class FakePopen:
        def __init__(
            self,
            command: list[str],
            *,
            cwd: Path,
            stdout: object,
            stderr: object,
            text: bool,
            encoding: str,
            errors: str,
        ) -> None:
            del stdout, stderr, text, encoding, errors
            launched["command"] = command
            launched["cwd"] = cwd
            launched["terminated"] = False
            self.stdout = iter(
                [
                    "src/app.py:3:needle\n",
                    "src/other.py:8:needle\n",
                ],
            )

        def __enter__(self) -> Self:
            return self

        def __exit__(self, exc_type, exc, tb) -> None:
            del exc_type, exc, tb

        def terminate(self) -> None:
            launched["terminated"] = True

        def communicate(self) -> tuple[str, str]:
            return ("", "")

    monkeypatch.setattr("rotaris_core.tools.search.shutil.which", lambda name: "/usr/bin/rg")
    monkeypatch.setattr("rotaris_core.tools.search.subprocess.Popen", FakePopen)

    observation = GrepExecutor(tmp_workspace)(GrepAction(pattern="needle", max_matches=1))

    assert observation.text == "src/app.py:3:needle"
    assert launched["cwd"] == tmp_workspace
    assert "--max-filesize" in launched["command"]
    assert any(part.endswith(".rotaris/**") for part in launched["command"])
    # node_modules is now in IGNORED_PATH_PARTS — it SHOULD appear in rg exclude args
    assert any(part.endswith("node_modules/**") for part in launched["command"])
    assert launched["terminated"] is True
