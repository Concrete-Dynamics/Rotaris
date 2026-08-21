from pathlib import Path
from subprocess import CompletedProcess

from rotaris_core.cli.editor_launcher import launch_editor
from rotaris_core.reqtocode import SWR, verifies


@verifies(SWR.SWR_707)
def test_launch_editor_uses_editor_env_var(monkeypatch):
    monkeypatch.setenv("EDITOR", "nano")
    monkeypatch.delenv("VISUAL", raising=False)
    monkeypatch.setattr("rotaris_core.cli.editor_launcher.shutil.which", lambda _: "/usr/bin/nano")

    calls: list[list[str]] = []

    class FakeProcess:
        def __init__(self, args, **kwargs):
            calls.append(list(args))

    monkeypatch.setattr("rotaris_core.cli.editor_launcher.subprocess.Popen", FakeProcess)

    result = launch_editor(Path("notes.txt"))

    assert result.launched is True
    assert result.editor_kind == "env"
    assert result.command == "/usr/bin/nano notes.txt"
    assert result.error is None
    assert calls == [["/usr/bin/nano", "notes.txt"]]


@verifies(SWR.SWR_707)
def test_launch_editor_uses_xdg_open_on_linux(monkeypatch):
    monkeypatch.delenv("EDITOR", raising=False)
    monkeypatch.delenv("VISUAL", raising=False)
    monkeypatch.setattr("sys.platform", "linux")
    monkeypatch.setattr(
        "rotaris_core.cli.editor_launcher.shutil.which",
        lambda cmd: "/usr/bin/xdg-open" if cmd == "xdg-open" else None,
    )

    calls: list[list[str]] = []
    monkeypatch.setattr(
        "rotaris_core.cli.editor_launcher.subprocess.Popen",
        lambda args, **kwargs: calls.append(list(args)),
    )

    result = launch_editor(Path("notes.txt"))

    assert result.launched is True
    assert result.editor_kind == "xdg-open"
    assert result.command == "/usr/bin/xdg-open notes.txt"
    assert calls == [["/usr/bin/xdg-open", "notes.txt"]]


@verifies(SWR.SWR_707)
def test_launch_editor_uses_open_on_macos(monkeypatch):
    monkeypatch.delenv("EDITOR", raising=False)
    monkeypatch.delenv("VISUAL", raising=False)
    monkeypatch.setattr("sys.platform", "darwin")
    monkeypatch.setattr(
        "rotaris_core.cli.editor_launcher.shutil.which",
        lambda cmd: "/usr/bin/open" if cmd == "open" else None,
    )

    calls: list[list[str]] = []
    monkeypatch.setattr(
        "rotaris_core.cli.editor_launcher.subprocess.Popen",
        lambda args, **kwargs: calls.append(list(args)),
    )

    result = launch_editor(Path("notes.txt"))

    assert result.launched is True
    assert result.editor_kind == "open"
    assert result.command == "/usr/bin/open notes.txt"
    assert calls == [["/usr/bin/open", "notes.txt"]]


@verifies(SWR.SWR_707)
def test_launch_editor_uses_cmd_start_on_windows(monkeypatch):
    monkeypatch.delenv("EDITOR", raising=False)
    monkeypatch.delenv("VISUAL", raising=False)
    monkeypatch.setattr("sys.platform", "win32")
    monkeypatch.setattr(
        "rotaris_core.cli.editor_launcher.shutil.which",
        lambda cmd: "C:/Windows/System32/cmd.exe" if cmd == "cmd" else None,
    )

    calls: list[list[str]] = []
    monkeypatch.setattr(
        "rotaris_core.cli.editor_launcher.subprocess.Popen",
        lambda args, **kwargs: calls.append(list(args)),
    )

    result = launch_editor(Path("notes.txt"))

    assert result.launched is True
    assert result.editor_kind == "start"
    assert result.command == "cmd /c start '' notes.txt"
    assert calls == [["cmd", "/c", "start", "", "notes.txt"]]


@verifies(SWR.SWR_707)
def test_launch_editor_returns_none_when_no_editor_available(monkeypatch):
    monkeypatch.delenv("EDITOR", raising=False)
    monkeypatch.delenv("VISUAL", raising=False)
    monkeypatch.setattr("sys.platform", "linux")
    monkeypatch.setattr("rotaris_core.cli.editor_launcher.shutil.which", lambda _: None)

    result = launch_editor(Path("notes.txt"))

    assert result == (False, None, "No editor found for this platform.", "none")


@verifies(SWR.SWR_707)
def test_launch_editor_returns_failure_when_subprocess_raises(monkeypatch):
    monkeypatch.setenv("EDITOR", "nano")
    monkeypatch.setattr("rotaris_core.cli.editor_launcher.shutil.which", lambda _: "/usr/bin/nano")

    def raise_file_not_found(*args, **kwargs):
        raise FileNotFoundError("missing")

    monkeypatch.setattr("rotaris_core.cli.editor_launcher.subprocess.Popen", raise_file_not_found)

    result = launch_editor(Path("notes.txt"))

    assert result.launched is False
    assert result.editor_kind == "env"
    assert result.command == "/usr/bin/nano notes.txt"
    assert result.error == "missing"


@verifies(SWR.SWR_707)
def test_launch_editor_returns_blocking_failure_with_stderr(monkeypatch):
    monkeypatch.setenv("EDITOR", "nano")
    monkeypatch.setattr("rotaris_core.cli.editor_launcher.shutil.which", lambda _: "/usr/bin/nano")
    monkeypatch.setattr(
        "rotaris_core.cli.editor_launcher.subprocess.run",
        lambda args, **kwargs: CompletedProcess(args=args, returncode=1, stderr="boom\n"),
    )

    result = launch_editor(Path("notes.txt"), blocking=True)

    assert result.launched is False
    assert result.editor_kind == "env"
    assert result.command == "/usr/bin/nano notes.txt"
    assert result.error == "Editor exited with status 1. boom"
