"""The canonical user-flow E2E for project initialization (SWR-2800 epic).

Everything between opening the workspace and the file on disk is real. The window
is the real ``MainWindow`` with a real ``WorkspaceStore`` and a real
``ConfigService``; the decision comes from :mod:`rotaris_core.init.registry`; the
run goes over the real ``ProjectInitService`` worker thread into the real
:mod:`rotaris_core.init.serena_setup`, which resolves its commands from the
workspace's own ``serena`` entry (SWR-2823) and launches them as real subprocesses.

Only the external system is faked, which is what keeps this hermetic: ``serena``
itself is a stub reached through ``<workspace>/.mcp.json`` — the same path a
user's own Serena takes. It serves **both** roles the real one does, chosen by
argv exactly as the real one chooses: ``start-mcp-server`` runs a FastMCP server
over stdio, and anything else is a CLI subcommand it logs. One configured entry,
two behaviours, so a test can assert what setup ran *and* what tools an agent was
handed, without either being arranged separately.

The tests drive the window the way a person does — controls are looked up by
accessible name and clicked — so an unwired signal, a hidden button or a disabled
action fails here instead of shipping. Nothing calls a private method to make
something happen.
"""

from __future__ import annotations

import json
import sys
import textwrap
from typing import TYPE_CHECKING, Any

import pytest
import yaml
from PySide6.QtWidgets import QLabel, QPushButton
from rotaris_core.config import loader as config_loader
from rotaris_core.config.bootstrap import write_minimal_agents_yaml
from rotaris_core.reqtocode import SWR, verifies
from ui_query import click_by_name, find_by_accessible_name, settle, wait_until

from rotaris.models.store import WorkspaceStore
from rotaris.services.config_service import ConfigService
from rotaris.views.main_window import MainWindow
from rotaris.widgets.project_init_dialog import ProjectInitDialog

if TYPE_CHECKING:
    from pathlib import Path

# These tests are *about* project initialization, so they opt back in to the
# real registry run the suite otherwise neutralises (see `conftest.py`'s
# `no_unasked_project_initialization`). Each points the workspace at a fake
# `serena` of its own, so the run stays hermetic.
pytestmark = [pytest.mark.e2e, pytest.mark.usefixtures("real_project_initialization")]

SERENA = "serena-setup"
SERENA_LABEL = "Serena project setup"

# How long setup may take: three subprocess launches and the config write.
# Generous enough for a loaded CI box, well inside the suite's per-test timeout.
RUN_TIMEOUT_MS = 60_000

# Stands in for the `serena` executable, in both the roles the real one has.
#
# `start-mcp-server` → a genuine FastMCP server over stdio, offering the memory
# tools every persona now carries (SWR-2822). There is no `activate_project`: a
# Serena launched with `--project` (SWR-2905) runs in single-project mode and
# stops advertising it, so a stub that still offered one would let a regression
# pass unnoticed here.
#
# Anything else → a CLI subcommand, appended to the log so a test can assert what
# setup actually ran (SWR-2820).
_SERENA_STUB = """
import json
import sys

# The log path arrives as argv[1]: the SDK normalizes an stdio MCP server with
# an empty `env`, so an environment variable would not survive the hand-off.
LOG = sys.argv[1]
ARGV = sys.argv[2:]


def _record(kind, payload):
    with open(LOG, "a", encoding="utf-8") as handle:
        handle.write(json.dumps({"kind": kind, **payload}) + "\\n")
        handle.flush()


if "start-mcp-server" not in ARGV:
    from pathlib import Path

    _record("cli", {"argv": ARGV})
    if (Path(LOG).parent / "fail").exists():
        sys.stderr.write("serena: the language server would not start\\n")
        raise SystemExit(1)
    print("ok")
    raise SystemExit(0)

from mcp.server.fastmcp import FastMCP

mcp = FastMCP("serena")


@mcp.tool(description="Find a symbol by its name path.")
def find_symbol(name_path: str) -> str:
    _record("tool", {"tool": "find_symbol"})
    return "def main() -> None: ..."


@mcp.tool(description="List the memories Serena holds for the active project.")
def list_memories() -> str:
    _record("tool", {"tool": "list_memories"})
    return "core, tech_stack, suggested_commands"


@mcp.tool(description="Write a durable project memory.")
def write_memory(memory_name: str, content: str) -> str:
    _record("tool", {"tool": "write_memory"})
    return "written"


if __name__ == "__main__":
    mcp.run()
"""


# ── the workspace a user would open ─────────────────────────────────────


def _workspace(tmp_path: Path, files: dict[str, str]) -> tuple[Path, Path]:
    """Build a workspace whose ``.mcp.json`` points ``serena`` at the live stub.

    Returns the workspace root and the stub's log. `files` is the project content
    the SWR-2804 classifier will scan.

    The entry is written as a real Serena *launch*, ``start-mcp-server`` and all,
    because that is what a user's ``.mcp.json`` holds. Truncating it back to a CLI
    prefix is the product's job (SWR-2823); doing it here would test the test.
    """
    root = tmp_path / "workspace"
    root.mkdir(parents=True, exist_ok=True)
    write_minimal_agents_yaml(root / ".rotaris" / "agents.yaml")

    for relative, content in files.items():
        target = root / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")

    stub = tmp_path / "serena_stub.py"
    stub.write_text(textwrap.dedent(_SERENA_STUB).strip() + "\n", encoding="utf-8")
    log = tmp_path / "serena_calls.jsonl"

    (root / ".mcp.json").write_text(
        json.dumps(
            {
                "mcpServers": {
                    "serena": {
                        "command": sys.executable,
                        "args": [
                            str(stub),
                            str(log),
                            "start-mcp-server",
                            "--context",
                            "ide",
                            "--transport",
                            "stdio",
                        ],
                    },
                },
            },
        ),
        encoding="utf-8",
    )
    return root, log


def _entries(log: Path) -> list[dict[str, Any]]:
    """Everything the stub recorded, in order, of either kind."""
    if not log.exists():
        return []
    return [
        json.loads(line) for line in log.read_text(encoding="utf-8").splitlines() if line.strip()
    ]


def _setup_commands(log: Path) -> list[str]:
    """The Serena setup subcommands that actually ran, as ``"project index"``."""
    return [" ".join(entry["argv"][:2]) for entry in _entries(log) if entry.get("kind") == "cli"]


def _isolate_global_config(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Point the loader at an empty global config dir.

    The developer's own ``~/.rotaris`` must not decide whether this flow
    passes — the workspace under test is the only configuration that should.
    """
    empty = tmp_path / "empty-global"
    empty.mkdir(exist_ok=True)
    monkeypatch.setattr(config_loader, "GLOBAL_CONFIG_DIR", empty)


# ── the window a user would see ─────────────────────────────────────────


def _open_window(qtbot: Any, workspace: Path) -> MainWindow:
    """Open the real window on `workspace`, faking only the network probes.

    ``_providers()`` and ``_subscription_limits()`` reach out to every configured
    provider and cost 5–18 s; nothing in this flow reads them.
    """
    store = WorkspaceStore()
    service = ConfigService(workspace, store)
    service._providers = lambda: []  # type: ignore[method-assign]
    service._subscription_limits = lambda: []  # type: ignore[method-assign]
    service.load()

    window = MainWindow(store, config_service=service)
    qtbot.addWidget(window)
    window.resize(1440, 900)
    window.show()
    qtbot.waitExposed(window)
    settle(qtbot)
    return window


def _modal(window: MainWindow) -> ProjectInitDialog | None:
    visible = [
        child
        for child in window.findChildren(ProjectInitDialog)
        if child.isVisible() and not child.isHidden()
    ]
    return visible[0] if visible else None


def _await_modal(qtbot: Any, window: MainWindow) -> ProjectInitDialog:
    wait_until(lambda: _modal(window) is not None, timeout=15)
    modal = _modal(window)
    assert modal is not None
    return modal


def _await_setup(qtbot: Any, window: MainWindow) -> None:
    """Wait for the background setup to finish and its outcome to be published."""
    wait_until(
        lambda: (
            window._project_init_worker is None and window.store.initialization.running is False
        ),
        timeout=RUN_TIMEOUT_MS / 1000,
    )
    settle(qtbot)


def _send_button(qtbot: Any, window: MainWindow) -> QPushButton:
    """The composer's dispatch button, reached the way the user reaches it."""
    window.show_view("workspace")
    settle(qtbot)
    return find_by_accessible_name(window.workspace, "Start run", QPushButton, visible_only=True)


def _recorded(workspace: Path) -> dict[str, Any]:
    """The ``initialization:`` section as it stands on disk."""
    data = yaml.safe_load((workspace / ".rotaris" / "agents.yaml").read_text(encoding="utf-8"))
    return dict(data.get("initialization") or {})


def _settings_project_status(qtbot: Any, window: MainWindow) -> tuple[str, str]:
    """Settings ▸ Project, as a screen reader would announce it."""
    window.show_view("settings")
    window.settings.set_active_tab("project")
    settle(qtbot)
    status = find_by_accessible_name(
        window.settings, "Project initialization status", QLabel, visible_only=True
    )
    detail = find_by_accessible_name(
        window.settings, "Project initialization details", QLabel, visible_only=True
    )
    return status.text(), detail.text()


# ── flow 1: first run ───────────────────────────────────────────────────


@verifies(SWR.SWR_2800, SWR.SWR_2801, SWR.SWR_2802, SWR.SWR_2820, SWR.SWR_2821)
def test_first_run_sets_up_a_code_workspace_without_prompting_or_a_model(
    qtbot: Any,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: a user opens a code workspace Rotaris has never set up, and starts
    working immediately while it is indexed behind them.

    Expected outcome: no modal interrupts them and nothing gates their runs; Serena's own
    setup commands really ran, in order, against the workspace; the config records the
    completed task and its `code` classification; Settings reports it as initialized; and
    reopening never repeats the work. No provider is configured anywhere in this test —
    setting a project up must not need one."""
    workspace, log = _workspace(
        tmp_path,
        {
            "pyproject.toml": "[project]\nname = 'demo'\n",
            "demo.py": "def main() -> None:\n    print('demo')\n",
            "README.md": "# Demo\n",
        },
    )
    _isolate_global_config(tmp_path, monkeypatch)

    window = _open_window(qtbot, workspace)

    # SWR-2801: the developer personas carry Serena, which is why the workspace
    # has a setup task at all.
    config = window.config_service.config
    assert "serena" in config.mcp_servers
    for persona in ("orchestrator", "architect", "coding-agent", "codebase-analyst"):
        assert "serena" in config.personas[persona].mcp_servers, persona

    # SWR-2820/2821: nothing to answer, so nothing is asked and nothing is locked.
    assert _modal(window) is None, "deterministic setup must not put a question on screen"
    assert _send_button(qtbot, window).isEnabled() is True, "setup must not gate agent dispatch"

    _await_setup(qtbot, window)

    # The real Serena CLI path really ran, in order — and never with the
    # server-only arguments the configured launch carries (SWR-2823).
    assert _setup_commands(log) == ["project create", "project index", "memories initialize"]
    for entry in _entries(log):
        if entry.get("kind") == "cli":
            assert "start-mcp-server" not in entry["argv"]
            assert entry["argv"][-1] == str(workspace)

    recorded = _recorded(workspace)
    assert recorded["completed"] == [SERENA]
    assert recorded["skipped"] == []
    assert recorded["classification"] == "code"
    assert recorded["last_run"]

    status, detail = _settings_project_status(qtbot, window)
    assert status == "Project initialized"
    assert SERENA_LABEL in detail

    window.close()
    settle(qtbot)

    # The user's real second visit: nothing re-runs and nothing is asked.
    log.unlink()
    second = _open_window(qtbot, workspace)
    settle(qtbot)
    assert _modal(second) is None
    assert second.store.initialization.completed == (SERENA,)
    assert _setup_commands(log) == [], "completed setup must never be repeated"
    assert _send_button(qtbot, second).isEnabled() is True
    second.close()
    settle(qtbot)


@verifies(SWR.SWR_2818, SWR.SWR_2822)
def test_an_initialized_workspace_offers_serena_and_no_lsp_server(
    qtbot: Any,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: a user's agents get one way to ask "where is this symbol defined?",
    not two competing ones — and can record what they learn about the project.

    Expected outcome: the workspace Rotaris opens knows no `lsp` server at all, no persona
    asks for one, and the toolset that reaches a real agent built for this workspace
    carries Serena's lookups and its memory store with no `lsp_*` tool anywhere in it. The
    textual fallback the agent still needs — Serena's `ide` context withholds its own
    `read_file` — is intact."""
    from rotaris_core.agents.factory import create_agent_for_persona
    from rotaris_core.mcp.session_manager import SessionMCPManager
    from rotaris_core.mcp.shared_tool_provider import SharedMCPToolProvider

    workspace, _log = _workspace(
        tmp_path,
        {
            "pyproject.toml": "[project]\nname = 'demo'\n",
            "demo.py": "def main() -> None:\n    print('demo')\n",
        },
    )
    _isolate_global_config(tmp_path, monkeypatch)

    window = _open_window(qtbot, workspace)
    _await_setup(qtbot, window)

    # The config the window opened on: one code-intelligence server, and it is Serena.
    config = window.config_service.config
    assert "serena" in config.mcp_servers
    assert "lsp" not in config.mcp_servers, "the removed server must not reach a workspace"
    for persona_name, persona in config.personas.items():
        assert "lsp" not in persona.mcp_servers, persona_name

    # The tools a real agent is handed, not the config that predicted them.
    manager = SessionMCPManager()
    try:
        persona = config.personas["coding-agent"]
        agent = create_agent_for_persona(persona, config)(_unused_llm())
        provider = SharedMCPToolProvider(manager, workspace_root=workspace)
        tools = provider.create_tools(dict(agent.mcp_config or {}))
        offered = {tool.name for tool in tools.tools}
    finally:
        manager.shutdown()

    assert "find_symbol" in offered, "Serena's tools must reach the agent"
    assert {"list_memories", "write_memory"} <= offered, "every Serena persona keeps memories"
    assert not [name for name in offered if name.startswith("lsp")], (
        f"no LSP tool may reach an agent: {sorted(offered)}"
    )

    window.close()
    settle(qtbot)


@verifies(SWR.SWR_2804, SWR.SWR_2820)
def test_first_run_of_a_documentation_only_workspace_skips_indexing(
    qtbot: Any,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: a user opens a workspace that holds documentation, no code, and
    Rotaris does not spend minutes indexing symbols that are not there.

    Expected outcome: the project is still registered with Serena, indexing is never
    asked for, the workspace is recorded as `non-code`, and Settings explains that no
    code memories were created because the project is documentation-only."""
    workspace, log = _workspace(
        tmp_path,
        {"README.md": "# Handbook\n", "docs/guide.md": "Chapter 1\n"},
    )
    _isolate_global_config(tmp_path, monkeypatch)

    window = _open_window(qtbot, workspace)
    _await_setup(qtbot, window)

    assert _setup_commands(log) == ["project create"], (
        "a documentation-only project must never be indexed"
    )

    recorded = _recorded(workspace)
    assert recorded["completed"] == [SERENA]
    assert recorded["classification"] == "non-code"

    status, detail = _settings_project_status(qtbot, window)
    assert status == "Project initialized"
    assert "documentation-only project" in detail

    window.close()
    settle(qtbot)


# ── flow 2: skip, then re-initialize by hand ────────────────────────────


@verifies(SWR.SWR_2805, SWR.SWR_2820, SWR.SWR_2821)
def test_a_failed_setup_can_be_deferred_and_run_later_from_the_workspace_action(
    qtbot: Any,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: setup fails on a machine where Serena will not start; the user
    defers it rather than dealing with it now, fixes the machine, and runs it later from
    the Workspace sidebar.

    Expected outcome: the failure records nothing and never gates a run; the deferral is
    honoured, so reopening starts nothing behind their back; the Workspace action stays
    live and, once the machine works, completes the setup against the real Serena CLI."""
    workspace, log = _workspace(tmp_path, {"demo.py": "x = 1\n"})
    _isolate_global_config(tmp_path, monkeypatch)
    broken = log.parent / "fail"
    broken.write_text("", encoding="utf-8")

    window = _open_window(qtbot, workspace)
    _await_setup(qtbot, window)

    # A failed background task records nothing and locks nothing.
    assert _recorded(workspace) == {}
    assert _setup_commands(log) == ["project create"]
    assert _send_button(qtbot, window).isEnabled() is True, "a failed setup must not gate runs"

    click_by_name(qtbot, window.workspace, "Initialize Project…", QPushButton)
    modal = _await_modal(qtbot, window)
    assert modal.task_ids == (SERENA,)

    click_by_name(qtbot, modal, "Skip for now", QPushButton)
    settle(qtbot)

    assert _recorded(workspace)["skipped"] == [SERENA]
    window.close()
    settle(qtbot)

    # The machine is fixed, and the next session honours the deferral anyway.
    broken.unlink()
    log.unlink()
    later = _open_window(qtbot, workspace)
    settle(qtbot)
    assert _modal(later) is None, "a deferred workspace must not be prompted on open"
    assert _setup_commands(log) == [], "an explicit skip must not be restarted in the background"
    assert _send_button(qtbot, later).isEnabled() is True, "a deferred task must not gate runs"

    action = find_by_accessible_name(
        later.workspace, "Initialize Project…", QPushButton, visible_only=True
    )
    assert action.isEnabled() is True, "a deferred task must stay reachable (SWR-2805)"
    click_by_name(qtbot, later.workspace, "Initialize Project…", QPushButton)

    reopened = _await_modal(qtbot, later)
    assert reopened.task_ids == (SERENA,), "the deferred task is still unresolved work"

    click_by_name(qtbot, reopened, "Initialize project", QPushButton)
    wait_until(lambda: reopened.state in {"done", "error"}, timeout=RUN_TIMEOUT_MS / 1000)
    assert reopened.state == "done"

    assert _setup_commands(log) == ["project create", "project index", "memories initialize"]
    recorded = _recorded(workspace)
    assert recorded["completed"] == [SERENA]
    assert recorded["skipped"] == [], "a completed task is no longer deferred"

    click_by_name(qtbot, reopened, "Close", QPushButton)
    settle(qtbot)
    status, _detail = _settings_project_status(qtbot, later)
    assert status == "Project initialized"

    later.close()
    settle(qtbot)


def _unused_llm() -> Any:
    """A real ``LLM`` the agent is built around and never asked to answer.

    The assertions below are about the *tools* an agent is handed, which the
    factory resolves without a model ever being called — but the agent will not
    be constructed without one, and a stand-in is rejected by its schema.
    """
    from openhands.sdk.llm.llm import LLM

    return LLM(model="openai/gpt-4o-mini", api_key="test")
